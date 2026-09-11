/**
 * The utterance router (U2; R3, R4, KTD5, KTD6) — a deterministic, pure mapping from a founder's
 * free-text utterance to either one confident primary workflow or an honest low-confidence
 * candidate list, plus the pre-registration workspace/productKind check that takes precedence
 * over both.
 *
 * Scope, by construction:
 *   - Pure module. No MCP tool registration, no CLI argument parsing, no process.exit — that
 *     wiring belongs to the caller (U3), not here. `routeUtterance` is the single production entry
 *     point; everything else this file exports is either a named constant the decision logic reads
 *     (KTD5: threshold and ambiguity-band values, both calibrated against a labelled corpus — see
 *     their doc comments) or the pure scoring/decision primitive (`matchWorkflows`) that entry
 *     point is built on, exposed so the threshold and tie-band boundaries can be proven exactly
 *     against small hand-authored candidates instead of coupled to generated-catalog wording this
 *     unit does not own.
 *   - Scoring reuses `terms` from `kernel/knowledge-service/service.ts` verbatim (KTD5) — the exact
 *     tokenizer `b2c_knowledge_search`/`b2c_catalog` already use — as the seam `route-scoring.ts`'s
 *     router-only generalizations (a larger, founder-phrasing-specific stopword list, light suffix
 *     stemming, and adjacent-word phrase credit — issue #58 stage 1) build on. Applied to workflow
 *     trigger + title (stage 3: trigger extended with the workflow's authored `founderPhrasings`,
 *     scored at trigger weight) plus, at a lower weight, its `instructions` (stage 2) — never id (a
 *     narrower search text than that service's own internal workflow index, on purpose: what a
 *     workflow "means" to a founder, not its full internal record). See route-scoring.ts's own
 *     module doc comment for why those generalizations live there and not in service.ts.
 *   - productKind comes only from `inspectWorkspace` (KTD6). This module never re-implements
 *     consumer-app/foreign-product classification.
 *   - Tie handling mirrors kernel/routing/rank.ts's tied/ambiguityBand *concept*, not its code: that
 *     engine ranks already-eligible RouteCandidates inside a provisioned workspace (authority,
 *     evidence, guardrails) this module has no access to and must not depend on. Vocabulary here is
 *     deliberately distinct — matchConfidence/candidates[], never score/eligibleIds — so the two
 *     systems are never mistaken for one another at a call site.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describeJourney } from "../knowledge-service/journey.js";
import type { Catalog } from "../../catalog/types.js";
import { terms } from "../knowledge-service/service.js";
import type { HostedKnowledgeBundle } from "../knowledge-service/types.js";
import { resolveSkillRoot } from "../../tooling/lib/skill-root.js";
import { inspectWorkspace, type InspectResult } from "./inspect.js";
import {
  combineTriggerWithFounderPhrasings,
  INSTRUCTIONS_MATCH_WEIGHT,
  instructionsOnlyMatchedCount,
  queryBigrams,
  routerMatchRank,
  routerQueryTerms,
} from "./route-scoring.js";

const skillRoot = resolveSkillRoot(import.meta.url);

// --- calibrated tuning constants (KTD5, U9) -----------------------------------------------------

/**
 * Rank-strength floor for a confident single-primary route (R3): a top match at or above this
 * value, and outside the ambiguity band relative to every other candidate, resolves to one
 * primary workflow. Below it (or tied inside the band), routing falls back to candidates[].
 *
 * Calibrated on 76 utterances (68 primary-labelled) on 2026-09-01, achieving 100.0% primary
 * accuracy (68/68) with zero false-primaries, against a 24-case regression corpus (17
 * primary-labelled, disjoint from the calibration set by construction — see
 * verification/goldens/routing/utterance-regression.json — also 100.0% top-1 on its primary
 * subset with zero false-primaries). `npm run routing:calibrate` grid-searches threshold x
 * ambiguity-band over verification/goldens/routing/utterance-calibration.json
 * (tooling/calibrate-utterance-router.ts) and found this exact pair on the accuracy-maximizing
 * Pareto front — not a first guess kept by inertia: 1.7 is also exactly the matchConfidence one
 * shared query term produces when that term appears in BOTH a workflow's title and its trigger
 * (matchedTermCount=1, boost=5+2=7, 1 + 7/10 = 1.7 — see the matchConfidence formula below), a
 * real, meaningful bar ("the founder's utterance shares a keyword with both the workflow's name
 * and its trigger phrase") that also happens to be where the calibration grid landed
 * independently. Re-run `routing:calibrate -- --check` after the corpus changes; it fails the
 * build if this value drifts off the recomputed front without a matching corpus/doc-comment
 * update.
 */
export const ROUTE_CONFIDENCE_THRESHOLD = 1.7;

/**
 * Ambiguity band (KTD5): two workflows within this many matchConfidence points of the top score
 * are treated as tied, which forces a candidates[] outcome even when the top score alone would
 * clear ROUTE_CONFIDENCE_THRESHOLD (R3: "never both"). Mirrors kernel/routing/rank.ts's
 * tied/ambiguityBand concept — read that module for the shape of the idea — without importing it
 * (see the module doc comment for why).
 *
 * Calibrated alongside ROUTE_CONFIDENCE_THRESHOLD (U9, same run, same 100.0%/0-false-primary
 * result described above). RE-CALIBRATED under issue #58: stage 1 (route-scoring.ts's router-owned
 * stopword/stemming/bigram generalizations) alone left 0.4 on the accuracy-maximizing front
 * unchanged, but stage 2 (instructions scored at INSTRUCTIONS_MATCH_WEIGHT) introduces finer,
 * fractional score differences between calibration entries that a 0.4 band now merges into false
 * ties on two calibration entries it previously kept apart — re-running `npm run routing:calibrate`
 * found band=0.2 as the smallest calibration-accuracy-maximizing value with the new formula (100.0%,
 * 68/68, 0 false-primaries; 0.4 scores only 97.1%, 66/68, still 0 false-primaries but no longer
 * top-of-front). See utterance-calibration.json's metadata for the recorded figures this value must
 * match, and this file's git history for the pre-#58 value (0.4) and its own reasoning.
 */
export const AMBIGUITY_BAND = 0.2;

/** How many heaviest off-workflow references to surface as a doNotLoad hint on a primary outcome. */
const DO_NOT_LOAD_COUNT = 3;

// --- input shape used by both the real catalog loader and hand-authored test candidates ----------

export interface RoutableWorkflow {
  readonly workflowId: string;
  readonly title: string;
  readonly trigger: string;
  readonly referenceIds: readonly string[];
  /**
   * A workflow's full authored instructions text (issue #58 stage 2). Scored at a lower weight than
   * trigger/title (see route-scoring.ts's `instructionsOnlyMatchedCount`/`INSTRUCTIONS_MATCH_WEIGHT`)
   * — a founder's purpose-first phrasing often shares vocabulary with a workflow's instructions
   * (what it actually DOES) even when it shares none with the workflow's trigger/title (what it is
   * CALLED). Defaults to "" for hand-authored test fixtures that only need trigger+title boundary
   * proofs (an empty string can never match a non-empty query term, so it is a safe no-op default).
   */
  readonly instructions?: string;
  /**
   * Authored founder-voiced trigger alternates (issue #58 stage 3; see CatalogWorkflowDef's own
   * doc comment for the authoring contract). Scored at the SAME weight as `trigger` — see
   * route-scoring.ts's `combineTriggerWithFounderPhrasings`. Defaults to `[]` for hand-authored test
   * fixtures that only need trigger+title boundary proofs (an empty array is a no-op, degrading to
   * plain `trigger` text).
   */
  readonly founderPhrasings?: readonly string[];
}

// --- pure scoring/decision primitive (exported for exact boundary proofs; see module doc) --------

export interface ScoredWorkflow {
  readonly workflowId: string;
  readonly title: string;
  /**
   * Rank strength, not a calibrated probability (KTD5): matchedTermCount (how many distinct ROUTER
   * query terms — `terms(utterance)` further filtered and stemmed by route-scoring.ts's
   * `routerQueryTerms`, issue #58 — appear anywhere in trigger+title) plus a boost divided by 10, so
   * a title/trigger hit or an adjacent-word phrase match nudges the score without ever letting boost
   * alone outweigh a real term match. matchRank's boost already weights a title hit (+5/term) above
   * a trigger hit (+2/term); route-scoring.ts's bigram credit (+4/matched phrase) sits between the
   * two. Dividing by 10 keeps that ordering intact while keeping matchedTermCount the dominant
   * signal. A workflow's `instructions` add one further, smaller addend — 0.2 per router term that
   * matches ONLY there (issue #58 stage 2) — see `matchWorkflows`'s own doc comment.
   */
  readonly matchConfidence: number;
  readonly matchedTerms: readonly string[];
}

export type UtteranceMatch =
  | { readonly kind: "insufficient_signal" }
  | { readonly kind: "primary"; readonly match: ScoredWorkflow }
  | { readonly kind: "candidates"; readonly candidates: readonly ScoredWorkflow[] };

/**
 * Pure: scores every workflow's trigger+title against the utterance's terms, then applies R3's
 * decision rule (>= threshold AND outside the tie band -> primary; otherwise -> candidates; empty
 * terms -> insufficient_signal before any scoring happens at all). No filesystem, no clock, no
 * workspace — safe to call with hand-authored candidates for exact boundary proofs, and it is what
 * `routeUtterance` calls once it has loaded the real catalog.
 *
 * Scoring pipeline (issue #58): `terms(utterance)` (the shared, catalog-owned tokenizer) feeds two
 * router-owned generalizations from route-scoring.ts — `routerQueryTerms` (founder-phrasing
 * stopwords + light suffix stemming) for the per-term match against trigger+title, and
 * `queryBigrams` (built from the UNFILTERED `terms()` output, so a two-word phrase like "app store"
 * stays detectable even though "app" alone is a router stopword) for adjacent-phrase credit. Insu-
 * fficient-signal is still decided on the RAW `terms(utterance)` result, before router filtering: an
 * utterance that is entirely router-stopwords (e.g. "help me build something" losing "help"/"me"/
 * "something") still carries real base terms and must fall through to a (likely tied) candidates
 * outcome, never insufficient_signal — only truly empty/non-Latin/whitespace-only input short-
 * circuits there.
 *
 * A workflow's authored `founderPhrasings` (issue #58 stage 3, option 2) are folded into its
 * trigger text BEFORE any of the above: `route-scoring.ts`'s `combineTriggerWithFounderPhrasings`
 * builds one `triggerText` string from `trigger` plus every phrasing, which then stands in for
 * `trigger` everywhere below — in `searchText` (so `matchedTermCount` and bigram matching see
 * phrasing vocabulary too) and as the value fed to `routerMatchRank`'s trigger-weighted parameter
 * (so a phrasing match earns the exact same +2/term boost a real trigger match already does —
 * "trigger weight" is not a new formula, it is the trigger's own weight, reached through more
 * text). An empty `founderPhrasings` array degrades this to plain `trigger`, unchanged from before
 * this stage existed.
 *
 * A workflow's `instructions` (issue #58 stage 2, option 1 from the issue) contribute a SEPARATE,
 * lower-weight signal: `instructionsOnlyMatchedCount` counts router terms that match ONLY inside
 * instructions (never already counted via trigger+title), each worth `INSTRUCTIONS_MATCH_WEIGHT`
 * (0.2) added straight into matchConfidence — deliberately never folded into matchedTermCount or
 * boost, which stay trigger+title-only exactly as KTD5 documents. Measured on the calibration set
 * under the zero-false-primary constraint (route-scoring.ts's own doc comment on
 * `INSTRUCTIONS_MATCH_WEIGHT` has the sweep): 0.2 is the largest weight that stays feasible on the
 * calibration corpus.
 */
export function matchWorkflows(utterance: string, workflows: readonly RoutableWorkflow[]): UtteranceMatch {
  const queryTerms = terms(utterance);
  if (queryTerms.length === 0 || workflows.length === 0) return { kind: "insufficient_signal" };

  const routerTerms = routerQueryTerms(queryTerms);
  const bigrams = queryBigrams(queryTerms);

  const scored: ScoredWorkflow[] = workflows
    .map((workflow) => {
      const triggerText = combineTriggerWithFounderPhrasings(workflow.trigger, workflow.founderPhrasings ?? []);
      const searchText = `${triggerText}\n${workflow.title}`.toLowerCase();
      const rank = routerMatchRank(searchText, workflow.title, triggerText, routerTerms, bigrams);
      const instructionsMatches = instructionsOnlyMatchedCount((workflow.instructions ?? "").toLowerCase(), searchText, routerTerms);
      return {
        workflowId: workflow.workflowId,
        title: workflow.title,
        matchConfidence: rank.matchedTermCount + rank.boost / 10 + instructionsMatches * INSTRUCTIONS_MATCH_WEIGHT,
        matchedTerms: routerTerms.filter((term) => searchText.includes(term)),
      };
    })
    .sort((left, right) => right.matchConfidence - left.matchConfidence || left.workflowId.localeCompare(right.workflowId));

  const top = scored[0]!;
  const tiedWithTop = scored.filter((candidate) => top.matchConfidence - candidate.matchConfidence <= AMBIGUITY_BAND);
  const tied = tiedWithTop.length > 1;

  if (top.matchConfidence >= ROUTE_CONFIDENCE_THRESHOLD && !tied) {
    return { kind: "primary", match: top };
  }
  return { kind: "candidates", candidates: scored.slice(0, 3) };
}

// --- real catalog loading (mirrors entrypoints/mcp/server.ts's knowledge bundle load) -------------------

interface CatalogData {
  readonly catalog: Catalog;
  readonly workflows: readonly RoutableWorkflow[];
  /** referenceId -> markdown length, used only to rank "heaviest reference" for doNotLoad. */
  readonly documentSizes: ReadonlyMap<string, number>;
}

// --- stat-keyed cache: cheap invalidation for a read-mostly-once generated artifact --------------

/** A stat-derived fingerprint of a file's content shape — cheap enough to check on every call. */
interface FileStamp {
  readonly mtimeMs: number;
  readonly size: number;
}

function statStamp(filePath: string): FileStamp {
  const stat = statSync(filePath);
  return { mtimeMs: stat.mtimeMs, size: stat.size };
}

/**
 * Memoizes `load(filePath)` keyed to the file's (mtimeMs, size) stamp, not merely "have we ever
 * loaded this": a repeat call against an unchanged file reuses the cached value (one cheap
 * `statSync`, no re-read/re-parse), but a call after the file's mtime or size has moved re-runs
 * `load` and replaces the cache. Exported so the fixture suite can prove the invalidation mechanism
 * itself against an isolated temp file, independent of the real generated catalog this module uses
 * it for (see route-utterance.fixtures.ts) — a plain read-once-per-process memo (this file's
 * previous approach) cannot be proven wrong without mutating the shared repository bundle that
 * other fixtures and shards read concurrently, which this avoids entirely.
 */
export function createStatKeyedCache<T>(load: (filePath: string) => T): (filePath: string) => T {
  let cached: { readonly stamp: FileStamp; readonly value: T } | undefined;
  return (filePath: string): T => {
    const stamp = statStamp(filePath);
    if (cached !== undefined && cached.stamp.mtimeMs === stamp.mtimeMs && cached.stamp.size === stamp.size) {
      return cached.value;
    }
    const value = load(filePath);
    cached = { stamp, value };
    return value;
  };
}

// The bundle is normally an immutable ~2MB build artifact for the process lifetime (the same one
// entrypoints/mcp/server.ts loads once at startup) — but a maintainer can re-render it
// (`npm run render:catalog`) inside a long-lived MCP server process, and a plain "read once, never
// re-check" memo would then keep answering from the pre-render bundle for the rest of that
// process's life with no signal anything is stale. One extra `statSync` per call is cheap enough
// that memoizing purely on "have we ever loaded this" bought nothing worth that staleness risk.
const loadCachedCatalogBundle = createStatKeyedCache((bundlePath: string): CatalogData => {
  // A missing or corrupt generated bundle is a real repository integrity failure (the same
  // artifact `npm run render:catalog` produces and `b2c inspect` checks; `b2c doctor` is a supported equivalent),
  // not a per-utterance business outcome — so this throws rather than returning a routed-around
  // outcome, exactly like entrypoints/mcp/server.ts treats a bad bundle as unavailable rather than
  // silently degrading routing.
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as HostedKnowledgeBundle;
  const workflows: RoutableWorkflow[] = bundle.catalog.workflows.map((workflow) => ({
    workflowId: workflow.id,
    instructions: workflow.instructions,
    title: workflow.title,
    trigger: workflow.trigger,
    founderPhrasings: workflow.founderPhrasings,
    referenceIds: [...workflow.referenceIds],
  }));
  const documentSizes = new Map<string, number>(bundle.documents.map((document) => [document.referenceId, document.markdown.length]));
  return { catalog: bundle.catalog, workflows, documentSizes };
});

function loadCatalogData(): CatalogData {
  return loadCachedCatalogBundle(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"));
}

/** Largest documents in the catalog that are NOT among `referenceIds` — a doNotLoad hint (R3). */
function deriveDoNotLoad(referenceIds: readonly string[], documentSizes: ReadonlyMap<string, number>): string[] {
  const excluded = new Set(referenceIds);
  return [...documentSizes.entries()]
    .filter(([id]) => !excluded.has(id))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, DO_NOT_LOAD_COUNT)
    .map(([id]) => id);
}

// --- founder-facing prose (no engine vocabulary: no "matchConfidence", "referenceIds", "workflowId") --

function joinMatchedTerms(matchedTerms: readonly string[]): string {
  return matchedTerms.slice(0, 3).join(", ");
}

function primaryRationale(match: ScoredWorkflow): string {
  const shared = joinMatchedTerms(match.matchedTerms);
  const first =
    shared.length > 0 ? `"${match.title}" best matches what you asked for, sharing terms: ${shared}.` : `"${match.title}" best matches what you asked for.`;
  return `${first} It scored clearly ahead of every other workflow, so it is returned as the one recommendation.`;
}

function primaryNextAction(title: string): string {
  return `Open "${title}" and follow it — you can skip the extra reference material listed alongside it unless the work actually needs it.`;
}

function candidateWhy(candidate: ScoredWorkflow): string {
  const shared = joinMatchedTerms(candidate.matchedTerms);
  return shared.length > 0 ? `"${candidate.title}" shares terms: ${shared}.` : `"${candidate.title}" is a weak, low-confidence match.`;
}

const CANDIDATES_NEXT_ACTION =
  "None of these matched clearly enough to pick one for you — read the options below and tell me which one fits, or describe what you want built in a bit more detail.";

const MISMATCH_NEXT_ACTION =
  "This folder's files read like a different kind of business, not a consumer app — confirm this is the right app folder, or point me at (or set up) the correct one before continuing.";

const INSUFFICIENT_SIGNAL_NEXT_ACTION = "Say a bit more about what you want to build or change, and I'll match it to the right workflow.";

// --- public outcome shape ------------------------------------------------------------------------

export interface BusinessMandateRoute {
  readonly scope: "complete_business";
  readonly programWorkflowId: string;
  readonly registrationRequired: boolean;
  readonly journey: ReturnType<typeof describeJourney>;
}

export interface PrimaryRouteOutcome {
  readonly kind: "primary";
  readonly workflowId: string;
  /** At most 2 sentences (R3). */
  readonly rationale: string;
  /** Heavy references the selected workflow does not need; never intersects its own referenceIds. */
  readonly doNotLoad: readonly string[];
  readonly mandate?: BusinessMandateRoute;
  readonly nextAgentAction: string;
}

export interface CandidateRouteEntry {
  readonly workflowId: string;
  /** One line. */
  readonly why: string;
  readonly matchConfidence: number;
}

export interface CandidatesRouteOutcome {
  readonly mandate?: BusinessMandateRoute;
  readonly kind: "candidates";
  readonly candidates: readonly CandidateRouteEntry[];
  readonly nextAgentAction: string;
}

export interface ProductMismatchRouteOutcome {
  readonly kind: "product_mismatch";
  readonly productKind: "mismatch";
  readonly nextAgentAction: string;
}

export interface InsufficientSignalRouteOutcome {
  readonly kind: "insufficient_signal";
  readonly nextAgentAction: string;
}

export type RouteOutcome = PrimaryRouteOutcome | CandidatesRouteOutcome | ProductMismatchRouteOutcome | InsufficientSignalRouteOutcome;

export interface RouteUtteranceRequest {
  readonly utterance: string;
  readonly mandateScope?: "focused" | "complete_business";
  /** When supplied, checked against the inspector's productKind before any scoring (R4, KTD6). */
  readonly cwd?: string;
}

/**
 * `inspectWorkspace(cwd)` itself does not guard its own registry read (`resolveRegisteredWorkspace`
 * -> `loadRegistry` does a raw `JSON.parse` of `~/.b2c-app-builder/workspaces.json` and throws on a
 * corrupt file). Never throws here: a corrupt registry is a repair-route problem for the workspace
 * tools, not a reason for utterance routing to fail, so a thrown inspection is folded into
 * `undefined` — the caller then treats it exactly like inspectWorkspace's own ok:false, proceeding
 * with routing on the utterance alone. Mirrors withOnboardingStepper's identical guard around this
 * same call in kernel/session/stepper.ts.
 */
function safeInspectWorkspace(cwd: string): InspectResult | undefined {
  try {
    return inspectWorkspace(cwd);
  } catch {
    return undefined;
  }
}

/**
 * The single production entry point (R3, R4). Order of decision:
 *   1. If `cwd` is supplied and the inspector classifies it as a productKind "mismatch", return a
 *      typed mismatch outcome immediately — no primary, no scoring, always a nextAgentAction (R4).
 *      A productKind of "consumer-app" or "unknown" (including an unreadable/nonexistent cwd, which
 *      inspectWorkspace itself reports as a typed ok:false rather than throwing) does not
 *      short-circuit: routing proceeds on the utterance alone, exactly like no cwd being supplied.
 *      A THROWN inspection (e.g. a corrupt `~/.b2c-app-builder/workspaces.json` — the registry read
 *      inside `inspectWorkspace` is not itself guarded) is treated identically to that ok:false
 *      case, never allowed to propagate: this is a routing decision, not a registry-repair path,
 *      and the CLI/MCP callers built on this function have no typed refusal shape to translate a
 *      raw parse error into (unlike the sibling workspace-repair branch a few lines below this one
 *      in plan.ts, which exists precisely to surface and fix registry damage). Letting the
 *      exception escape here would crash the CLI and, over MCP, hand the client the registry file's
 *      own raw (and potentially sensitive) parse-error content instead of a routed answer — so a
 *      damaged registry degrades to "route on the utterance alone" exactly like no cwd being
 *      supplied at all, the same fallback withOnboardingStepper already applies to this identical
 *      call (kernel/session/stepper.ts).
 *   2. Otherwise, score every workflow's trigger+title and apply R3's threshold/tie rule.
 * Every branch carries nextAgentAction in founder language — no outcome ever dead-ends (R4).
 */
export function routeUtterance(request: RouteUtteranceRequest): RouteOutcome {
  if (request.cwd !== undefined) {
    const inspection = safeInspectWorkspace(request.cwd);
    if (inspection !== undefined && inspection.ok && inspection.productKind === "mismatch") {
      return { kind: "product_mismatch", productKind: "mismatch", nextAgentAction: MISMATCH_NEXT_ACTION };
    }
  }

  const { workflows, documentSizes, catalog } = loadCatalogData();
  const focused = /\b(?:only|just)\s+(?:research|audit|review|inspect)\b|\b(?:research|audit|review)[ -]only\b|\bdo not build\b/i.test(request.utterance);
  const complete =
    request.mandateScope === "complete_business" ||
    (request.mandateScope !== "focused" &&
      !focused &&
      /\b(?:end[ -]to[ -]end|complete (?:consumer[ -])?(?:app|business)|full (?:app|business)|(?:build|create|launch) (?:me )?(?:a|an|the) (?:consumer )?(?:app|business)|pick a business idea.*run with it)\b/i.test(
        request.utterance,
      ));
  const inspection = request.cwd ? safeInspectWorkspace(request.cwd) : undefined;
  const registrationRequired = !inspection?.ok || !["registered", "inside-registered"].includes(inspection.registration.kind);
  const mandateFor = (workflowId?: string): BusinessMandateRoute | undefined =>
    complete
      ? {
          scope: "complete_business",
          programWorkflowId: "workflow.orchestration.full-launch-program",
          registrationRequired,
          journey: describeJourney(catalog, "workflow.orchestration.full-launch-closeout", workflowId),
        }
      : undefined;
  const registrationCommand = inspection?.ok && inspection.registration.kind === "unregistered" ? inspection.registration.suggestedFix : undefined;
  const completeNext = registrationRequired
    ? `Create or adopt a planning workspace before managed business writes. ${registrationCommand ? `Use ${registrationCommand} with an explicitly selected provisional ID. ` : 'Use b2c business-create --workspace <id> --directory <empty-directory> --name "<name>" --hypothesis "<hypothesis>" with an explicitly selected provisional ID. '}Creation requires an empty directory; choose a new empty directory if this folder already contains files. Include --mandate for a short request or --mandate-file for a complete founder brief. The workspace ID is not a final brand. Preserve the complete-business mandate; research is the first obligation, not the delivered business.`
    : "Resume the registered business and preserve its complete-business mandate. Finish research and its independent review, initialize the accepted product, then use business-plan through design, implementation, verification and closeout. A research pass cannot end the mandate.";
  const match = matchWorkflows(request.utterance, workflows);

  if (match.kind === "insufficient_signal") {
    return { kind: "insufficient_signal", nextAgentAction: INSUFFICIENT_SIGNAL_NEXT_ACTION };
  }

  if (match.kind === "candidates") {
    return {
      kind: "candidates",
      ...(complete ? { mandate: mandateFor() } : {}),
      candidates: match.candidates.map((candidate) => ({
        workflowId: candidate.workflowId,
        why: candidateWhy(candidate),
        matchConfidence: candidate.matchConfidence,
      })),
      nextAgentAction: complete ? `${completeNext} ${CANDIDATES_NEXT_ACTION}` : CANDIDATES_NEXT_ACTION,
    };
  }

  const selected = workflows.find((workflow) => workflow.workflowId === match.match.workflowId)!;
  return {
    kind: "primary",
    workflowId: selected.workflowId,
    rationale: primaryRationale(match.match),
    doNotLoad: complete ? [] : deriveDoNotLoad(selected.referenceIds, documentSizes),
    ...(complete ? { mandate: mandateFor(selected.workflowId) } : {}),
    nextAgentAction: complete ? completeNext : primaryNextAction(selected.title),
  };
}
