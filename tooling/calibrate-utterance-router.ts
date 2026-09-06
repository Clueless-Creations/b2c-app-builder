#!/usr/bin/env node
/**
 * Calibrates ROUTE_CONFIDENCE_THRESHOLD / AMBIGUITY_BAND for the utterance router (U9; issue #26
 * AC "Top-1 accuracy measured ... before release"; plan R5, KTD5, KTD11).
 *
 * WHY a standalone tool instead of hand-picking numbers: KTD5 deliberately left the threshold and
 * band provisional ("U9 owns calibrating this against real founder utterances") rather than guessed
 * once and frozen. This tool makes that calibration a repeatable, deterministic measurement instead
 * of a one-time judgment call — re-run it after the corpus grows and it reproduces the same answer
 * from the same inputs (no `Date.now`, no randomness anywhere in this file).
 *
 * WHAT it grid-searches: every (threshold, band) pair on threshold ∈ [1.0, 3.0] step 0.1 and
 * band ∈ [0.0, 1.0] step 0.1 (231 pairs), scored against `verification/goldens/routing/
 * utterance-calibration.json` — never the frozen `utterance-regression.json`, which exists only to
 * grade whatever this tool recommends, not to help pick it (see that corpus's own metadata note).
 *
 * WHY it does not simply call `matchWorkflows`: that function reads `ROUTE_CONFIDENCE_THRESHOLD`/
 * `AMBIGUITY_BAND` as module-level constants, not parameters — correct for production (the values
 * are fixed once calibrated) but unusable for a sweep that needs to try 231 different values. This
 * tool instead reuses the exact same scoring pipeline `matchWorkflows` calls (`terms` from
 * `kernel/knowledge-service/service.ts`, then `route-scoring.ts`'s `routerQueryTerms`/`queryBigrams`/
 * `routerMatchRank`/`combineTriggerWithFounderPhrasings` — issue #58's router-owned stopword/
 * stemming/bigram generalizations (stage 1) plus authored founderPhrasings scored at trigger weight
 * (stage 3) — feeding the same formula `route-utterance.ts` documents: matchedTermCount + boost/10,
 * plus stage 2's lower-weight instructions addend) and re-implements
 * only the small threshold/tie DECISION step with threshold and band as loop variables — see
 * `decide()` below, which is a direct line-for-line mirror of `matchWorkflows`'s decision rule and
 * must be kept that way if that rule ever changes.
 *
 * HOW a pair is scored: primary-subset top-1 accuracy (does the entry resolve to a primary AND does
 * that primary's workflowId match the expected one), subject to a hard constraint — zero
 * false-primaries across every candidates/insufficient_signal-labelled calibration entry (a
 * calibration corpus has no product_mismatch entries: that outcome short-circuits on `cwd` before
 * scoring and is therefore independent of threshold/band by construction — see
 * `routeUtterance`'s decision order). A pair that produces even one false primary is infeasible
 * regardless of its accuracy on the primary subset; among feasible pairs the highest accuracy wins;
 * ties are broken deterministically (closest to the previously-recorded default, then lowest
 * threshold, then lowest band) so re-running this tool never produces a different answer.
 *
 * Usage:
 *   npm run routing:calibrate              print the grid summary and the recommended pair
 *   npm run routing:calibrate -- --check   exit 1 unless the LIVE constants in route-utterance.ts
 *                                          are feasible and on the accuracy-maximizing Pareto front
 *                                          (or equal to the corpus's own recorded chosenThreshold/
 *                                          chosenBand) — the PR gate for "did someone change the
 *                                          constants without re-running calibration".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terms } from "../kernel/knowledge-service/service.js";
import {
  combineTriggerWithFounderPhrasings,
  INSTRUCTIONS_MATCH_WEIGHT,
  instructionsOnlyMatchedCount,
  queryBigrams,
  routerMatchRank,
  routerQueryTerms,
} from "../kernel/session/route-scoring.js";
import { AMBIGUITY_BAND, ROUTE_CONFIDENCE_THRESHOLD } from "../kernel/session/route-utterance.js";
import type { HostedKnowledgeBundle } from "../kernel/knowledge-service/types.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- grid definition (KTD11: fixed, documented, reproducible) ------------------------------------

const THRESHOLD_MIN = 1.0;
const THRESHOLD_MAX = 3.0;
const THRESHOLD_STEP = 0.1;
const BAND_MIN = 0.0;
const BAND_MAX = 1.0;
const BAND_STEP = 0.1;

// The default pair this tool's recommendation is compared against for tie-breaking and for the
// recorded-choice equality check in --check. Kept in sync with route-utterance.ts by convention,
// not by import, because importing it here would make a --check run against a MODIFIED constant
// silently grade itself against its own new value; --check reads the live constants separately
// (see main()) precisely so a drifted constant is caught rather than laundered through this default.
const RECORDED_DEFAULT = { threshold: 1.7, band: 0.2 };

// round to one decimal place to keep grid values exact under repeated 0.1 addition (floating point).
function gridValues(min: number, max: number, step: number): number[] {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, index) => Math.round((min + index * step) * 10) / 10);
}

const THRESHOLDS = gridValues(THRESHOLD_MIN, THRESHOLD_MAX, THRESHOLD_STEP);
const BANDS = gridValues(BAND_MIN, BAND_MAX, BAND_STEP);

// --- corpus + catalog loading ----------------------------------------------------------------------

interface ExpectedOutcome {
  readonly kind: "primary" | "candidates" | "insufficient_signal" | "product_mismatch";
  readonly workflowId?: string;
}

interface CorpusEntry {
  readonly id: string;
  readonly utterance: string;
  readonly expected: ExpectedOutcome;
  readonly note?: string;
}

interface Corpus {
  readonly metadata: Record<string, unknown>;
  readonly entries: readonly CorpusEntry[];
}

export function loadCorpus(filePath: string): Corpus {
  return JSON.parse(readFileSync(filePath, "utf8")) as Corpus;
}

interface RoutableWorkflow {
  readonly workflowId: string;
  readonly title: string;
  readonly trigger: string;
  readonly instructions: string;
  /** Issue #58 stage 3: authored founder-voiced trigger alternates, scored at trigger weight. */
  readonly founderPhrasings: readonly string[];
}

export function loadCatalogWorkflows(root: string = skillRoot): readonly RoutableWorkflow[] {
  const bundlePath = path.join(root, "catalog/generated/hosted-knowledge.json");
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as HostedKnowledgeBundle;
  return bundle.catalog.workflows.map((workflow) => ({
    workflowId: workflow.id,
    title: workflow.title,
    trigger: workflow.trigger,
    instructions: workflow.instructions,
    founderPhrasings: workflow.founderPhrasings,
  }));
}

// --- scoring (mirrors matchWorkflows's per-workflow score exactly; see route-utterance.ts) -------

interface ScoredEntry {
  readonly workflowId: string;
  readonly matchConfidence: number;
}

/** Pre-scored, sorted candidates for one utterance — computed once, reused across all 231 grid cells. */
interface PreparedEntry {
  readonly expected: ExpectedOutcome;
  /** Empty exactly when `terms(utterance)` is empty — insufficient_signal regardless of threshold/band. */
  readonly scored: readonly ScoredEntry[];
}

function prepareEntry(entry: CorpusEntry, workflows: readonly RoutableWorkflow[]): PreparedEntry {
  const queryTerms = terms(entry.utterance);
  if (queryTerms.length === 0 || workflows.length === 0) return { expected: entry.expected, scored: [] };
  // Mirrors matchWorkflows's issue #58 pipeline exactly (route-scoring.ts's routerQueryTerms/
  // queryBigrams/routerMatchRank/combineTriggerWithFounderPhrasings) — see this file's header
  // comment on why this is a hand-kept mirror rather than a shared helper.
  const routerTerms = routerQueryTerms(queryTerms);
  const bigrams = queryBigrams(queryTerms);
  const scored = workflows
    .map((workflow) => {
      const triggerText = combineTriggerWithFounderPhrasings(workflow.trigger, workflow.founderPhrasings);
      const searchText = `${triggerText}\n${workflow.title}`.toLowerCase();
      const rank = routerMatchRank(searchText, workflow.title, triggerText, routerTerms, bigrams);
      const instructionsMatches = instructionsOnlyMatchedCount(workflow.instructions.toLowerCase(), searchText, routerTerms);
      return { workflowId: workflow.workflowId, matchConfidence: rank.matchedTermCount + rank.boost / 10 + instructionsMatches * INSTRUCTIONS_MATCH_WEIGHT };
    })
    .sort((left, right) => right.matchConfidence - left.matchConfidence || left.workflowId.localeCompare(right.workflowId));
  return { expected: entry.expected, scored };
}

type Decision = { readonly kind: "insufficient_signal" } | { readonly kind: "primary"; readonly workflowId: string } | { readonly kind: "candidates" };

/**
 * Line-for-line mirror of matchWorkflows's decision rule (route-utterance.ts), with threshold and
 * band as parameters instead of module constants. Keep this in sync with that function by hand if
 * its rule ever changes — there is deliberately no shared helper (see this file's header comment).
 */
function decide(prepared: PreparedEntry, threshold: number, band: number): Decision {
  if (prepared.scored.length === 0) return { kind: "insufficient_signal" };
  const top = prepared.scored[0]!;
  const tiedWithTop = prepared.scored.filter((candidate) => top.matchConfidence - candidate.matchConfidence <= band);
  const tied = tiedWithTop.length > 1;
  if (top.matchConfidence >= threshold && !tied) return { kind: "primary", workflowId: top.workflowId };
  return { kind: "candidates" };
}

// --- grid evaluation ---------------------------------------------------------------------------

export interface GridCellResult {
  readonly threshold: number;
  readonly band: number;
  readonly primaryTotal: number;
  readonly primaryCorrect: number;
  readonly falsePrimaries: number;
  readonly accuracy: number;
  readonly feasible: boolean;
}

export function evaluateGridCell(prepared: readonly PreparedEntry[], threshold: number, band: number): GridCellResult {
  let primaryTotal = 0;
  let primaryCorrect = 0;
  let falsePrimaries = 0;
  for (const entry of prepared) {
    const decision = decide(entry, threshold, band);
    if (entry.expected.kind === "primary") {
      primaryTotal += 1;
      if (decision.kind === "primary" && decision.workflowId === entry.expected.workflowId) primaryCorrect += 1;
    } else if (entry.expected.kind === "candidates" || entry.expected.kind === "insufficient_signal") {
      if (decision.kind === "primary") falsePrimaries += 1;
    }
    // product_mismatch entries are grid-independent by construction (see header comment) and are
    // excluded from both the accuracy numerator/denominator and the false-primary count.
  }
  const accuracy = primaryTotal > 0 ? primaryCorrect / primaryTotal : 0;
  return { threshold, band, primaryTotal, primaryCorrect, falsePrimaries, accuracy, feasible: falsePrimaries === 0 };
}

export function runGrid(corpus: Corpus, workflows: readonly RoutableWorkflow[]): GridCellResult[] {
  const prepared = corpus.entries.map((entry) => prepareEntry(entry, workflows));
  const results: GridCellResult[] = [];
  for (const threshold of THRESHOLDS) {
    for (const band of BANDS) {
      results.push(evaluateGridCell(prepared, threshold, band));
    }
  }
  return results;
}

const FLOAT_EPSILON = 1e-9;

/** The accuracy-maximizing feasible pairs — "the Pareto front" per this tool's --check contract. */
export function paretoFront(results: readonly GridCellResult[]): GridCellResult[] {
  const feasible = results.filter((result) => result.feasible);
  if (feasible.length === 0) return [];
  const best = Math.max(...feasible.map((result) => result.accuracy));
  return feasible.filter((result) => result.accuracy >= best - FLOAT_EPSILON);
}

/** Deterministic pick among tied-for-best pairs: closest to the recorded default, then lowest threshold, then lowest band. */
export function recommend(results: readonly GridCellResult[]): GridCellResult | undefined {
  const front = paretoFront(results);
  if (front.length === 0) return undefined;
  const distance = (result: GridCellResult) => (result.threshold - RECORDED_DEFAULT.threshold) ** 2 + (result.band - RECORDED_DEFAULT.band) ** 2;
  return [...front].sort((left, right) => distance(left) - distance(right) || left.threshold - right.threshold || left.band - right.band)[0];
}

// --- reporting -----------------------------------------------------------------------------------

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printSummary(results: readonly GridCellResult[], recommended: GridCellResult | undefined): void {
  console.log(`Grid: ${THRESHOLDS.length} thresholds x ${BANDS.length} bands = ${results.length} pairs`);
  const feasibleCount = results.filter((result) => result.feasible).length;
  console.log(`Feasible pairs (zero false-primaries): ${feasibleCount}/${results.length}`);
  console.log("");
  console.log("threshold  band  accuracy  primaryCorrect/Total  falsePrimaries  feasible");
  for (const result of results) {
    const marker = recommended && result.threshold === recommended.threshold && result.band === recommended.band ? " <= recommended" : "";
    console.log(
      `${result.threshold.toFixed(1).padStart(9)}  ${result.band.toFixed(1).padStart(4)}  ${formatPct(result.accuracy).padStart(8)}  ${String(result.primaryCorrect).padStart(2)}/${result.primaryTotal}                 ${String(result.falsePrimaries).padStart(2)}              ${result.feasible ? "yes" : "no"}${marker}`,
    );
  }
  console.log("");
  if (recommended) {
    console.log(
      `Recommended: threshold=${recommended.threshold} band=${recommended.band} -> ${formatPct(recommended.accuracy)} primary accuracy (${recommended.primaryCorrect}/${recommended.primaryTotal}), 0 false-primaries.`,
    );
  } else {
    console.log("No feasible pair found on this grid (every pair produced at least one false primary).");
  }
}

// --- orthogonal held-out corpus: reported (and floor-gated) under --check, never used to calibrate.
//
// verification/goldens/routing/utterance-regression.json's `orthogonal` array is a purpose-first
// corpus authored from each target workflow's instructions, not its trigger/title text (see that
// file's own metadata, and the ORTHOGONAL CORPUS doc comment in
// checks/verification/fixtures/routing-accuracy.fixtures.ts, for the full measurement record — a confirmed
// systemic shortfall pre-issue-#58 (42.9%), CLEARED by issue #58 stage 3's authored founderPhrasings
// (91.4%, 32/35)). Calibration is chosen on `utterance-calibration.json` alone, per this tool's own
// header comment — this corpus is graded under whatever the calibration grid picked, never fed back
// into `recommend()`/`paretoFront()`, so a maintainer cannot (even by accident) tune the
// threshold/band against held-out data.
const ORTHOGONAL_TOP1_ASPIRATIONAL_TARGET = 0.8;
const ORTHOGONAL_TOP1_CURRENT_FLOOR = 0.85; // kept in sync with routing-accuracy.fixtures.ts's own floor (measured 32/35 = 91.4%)

function loadOrthogonalCorpus(root: string = skillRoot): readonly CorpusEntry[] {
  const regressionPath = path.join(root, "checks/verification/goldens/routing/utterance-regression.json");
  const regression = loadCorpus(regressionPath) as Corpus & { orthogonal?: { entries: readonly CorpusEntry[] } };
  if (!regression.orthogonal)
    throw new Error("utterance-regression.json is missing its `orthogonal` corpus (see routing-accuracy.fixtures.ts's ORTHOGONAL CORPUS doc comment).");
  return regression.orthogonal.entries;
}

/** Reports (and floor-gates) the orthogonal corpus's accuracy under the LIVE constants — a held-out grade, never a calibration input. */
function checkOrthogonalHeldOut(workflows: readonly RoutableWorkflow[]): boolean {
  const entries = loadOrthogonalCorpus();
  const prepared = entries.map((entry) => prepareEntry(entry, workflows)).filter((p) => p.expected.kind === "primary");
  let correct = 0;
  for (const p of prepared) {
    const decision = decide(p, ROUTE_CONFIDENCE_THRESHOLD, AMBIGUITY_BAND);
    if (decision.kind === "primary" && decision.workflowId === p.expected.workflowId) correct += 1;
  }
  const accuracy = prepared.length > 0 ? correct / prepared.length : 0;
  console.log(
    `Orthogonal held-out corpus (purpose-first, never used to calibrate): ${formatPct(accuracy)} primary accuracy (${correct}/${prepared.length}) under the live constants — ${accuracy >= ORTHOGONAL_TOP1_ASPIRATIONAL_TARGET ? "meets" : "below"} the ${formatPct(ORTHOGONAL_TOP1_ASPIRATIONAL_TARGET)} aspirational target (issue #58 stage 3 cleared this bar on 2026-09-01 — see utterance-regression.json's orthogonal.metadata for the full stage 1/2/3 record).`,
  );
  if (accuracy < ORTHOGONAL_TOP1_CURRENT_FLOOR) {
    console.error(
      `ERROR routing_calibration.orthogonal_regression: orthogonal held-out accuracy ${formatPct(accuracy)} has dropped below its recorded floor of ${formatPct(ORTHOGONAL_TOP1_CURRENT_FLOOR)} (issue #58 stage 3 measured ${formatPct(0.9143)}, 32/35) — investigate; this means some change made real founder-language routing worse.`,
    );
    return false;
  }
  return true;
}

// --- --check: does the LIVE route-utterance.ts pair still hold up? -------------------------------

function checkLiveConstants(results: readonly GridCellResult[]): boolean {
  const front = paretoFront(results);
  const live = results.find((result) => result.threshold === ROUTE_CONFIDENCE_THRESHOLD && result.band === AMBIGUITY_BAND);
  if (!live) {
    console.error(
      `ERROR routing_calibration.constants_off_grid: route-utterance.ts has threshold=${ROUTE_CONFIDENCE_THRESHOLD} band=${AMBIGUITY_BAND}, which is not on this tool's grid (threshold step ${THRESHOLD_STEP} in [${THRESHOLD_MIN},${THRESHOLD_MAX}], band step ${BAND_STEP} in [${BAND_MIN},${BAND_MAX}]).`,
    );
    return false;
  }
  const onFront = front.some((result) => result.threshold === live.threshold && result.band === live.band);
  const equalsRecorded = live.threshold === RECORDED_DEFAULT.threshold && live.band === RECORDED_DEFAULT.band;
  if (!live.feasible) {
    console.error(
      `ERROR routing_calibration.constants_infeasible: threshold=${live.threshold} band=${live.band} produces ${live.falsePrimaries} false-primary(ies) on the calibration corpus. Re-run "npm run routing:calibrate" and update route-utterance.ts.`,
    );
    return false;
  }
  if (!onFront && !equalsRecorded) {
    const best = front[0]!;
    console.error(
      `ERROR routing_calibration.constants_stale: threshold=${live.threshold} band=${live.band} scores ${formatPct(live.accuracy)} primary accuracy, but the calibration grid's best feasible accuracy is ${formatPct(best.accuracy)} (e.g. threshold=${best.threshold} band=${best.band}). Re-run "npm run routing:calibrate", update route-utterance.ts's constants and doc comments, and re-freeze utterance-regression.json's recorded metadata if the pair changes.`,
    );
    return false;
  }
  console.log(
    `route-utterance.ts constants (threshold=${live.threshold}, band=${live.band}) are ${onFront ? "on" : "pinned to the recorded choice, off"} the calibration Pareto front: ${formatPct(live.accuracy)} primary accuracy, 0 false-primaries.`,
  );
  return true;
}

// --- entry point -----------------------------------------------------------------------------

function main(argv: string[]): number {
  const check = argv.includes("--check");
  const corpusPath = path.join(skillRoot, "checks/verification/goldens/routing/utterance-calibration.json");
  const corpus = loadCorpus(corpusPath);
  const workflows = loadCatalogWorkflows();
  const results = runGrid(corpus, workflows);
  const recommended = recommend(results);

  if (check) {
    const calibrationOk = checkLiveConstants(results);
    const orthogonalOk = checkOrthogonalHeldOut(workflows);
    return calibrationOk && orthogonalOk ? 0 : 1;
  }
  printSummary(results, recommended);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Utterance router calibration failed.");
    process.exitCode = 1;
  }
}
