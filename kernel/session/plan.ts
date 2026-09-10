#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";

import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { buildDispatchBatches } from "../engine/dispatch.js";
import { compilePlan, type CatalogArtifactId, type CompiledPlan, type CompiledRunNode, type RunNodeId } from "../engine/compile.js";
import { composeNodeBrief, renderNodeBrief, type NodeBrief } from "../engine/node-brief.js";
import { computeFrontier, refreshAdmissibleConsumerIds } from "../engine/frontier.js";
import { APP_SOURCE_FINGERPRINT_PATH, fingerprintAppSource, ingestSourceFingerprint } from "../engine/source-fingerprint.js";
import {
  loadRunState,
  reconcileRunPlan,
  invalidateStaleReviews,
  reconcileEnvironmentalArtifacts,
  refreshDependenciesBeforeFrontier,
  reopenRecurringNodes,
  reopenNodesForAuthorizedWorkOrders,
  seedRunState,
} from "../engine/runstate.js";
import { createAutonomyEvaluator, type AutonomyDecisionDetail, type AutonomyEvaluatorV2 } from "../autonomy/evaluator.js";
import { createCompositeVerifier } from "../autonomy/prerequisites.js";
import { createDopplerAuthVerifier } from "../autonomy/probes/doppler.js";
import { createBudgetFundedVerifier } from "../autonomy/probes/budget.js";
import { effectiveProtectedCategory } from "../autonomy/waivers.js";
import { resolveRegisteredWorkspace } from "../../adapters/registry.js";
import type { BusinessStateV2, ControlFile, ProtectedCategory, RunStateDocument } from "../schema/types.js";
import { loadBusinessStateFile, loadControlFile, loadLedgerFile, resolveWorkspacePaths } from "./run.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";
import { translateParkReason } from "./digest.js";
import { buildGoNoGoQuestion, buildSoftQuestion, validateFounderQuestion, type FounderQuestion, type FounderQuestionClass } from "./founder-gate.js";
import { routeUtterance } from "./route-utterance.js";
import { withOnboardingStepper } from "./stepper.js";
import { classifyAttemptFailure, summarizeAttemptFailure, type AttemptFailureCode } from "./attempt-failure.js";

/**
 * The frontier, for a session that is a conversation rather than a headless run.
 *
 * kernel/session/run.ts computes what is ready and then dispatches it to executors. That is the
 * right shape for a scheduled run and the wrong shape for an interactive one, where the agent in
 * the conversation *is* the executor — invoking the runner from inside it would spawn sessions
 * from within a session. So before this file the interactive path had no way to reach the engine
 * at all, and SKILL.md's only instruction for it was "load the next needed reference yourself".
 * A launch on 2026-08-05 did exactly that: it walked lanes in the order the documentation happened
 * to be written in, never learning that other work was ready in parallel or parked on a decision
 * nobody had been asked for.
 *
 * This answers the same question with the same code and stops before the dispatch: compile the
 * catalog, evaluate it against the founder's real grants, waivers, and budget, and report. It is
 * the runner's first half with the second half removed.
 *
 * **It never writes.** Not run state, not control, not the ledger, not the audit log. That is the
 * property that makes it safe to run at the top of any session and again after every change, and
 * it is load-bearing: computeFrontier mutates the run-state nodes it examines, so this works on a
 * structuredClone and drops it. Never add a writeRunState here — the reducer is the only writer
 * (KTD7), and a planner that quietly advanced run state would be a second one.
 *
 * Not to be confused with checks/verification/rehearsal/shadow-frontier.ts, which computes a frontier with
 * allowAllAutonomyEvaluator on purpose: it asks "what would this plan look like if everything were
 * permitted", to sanity-check a migrated live business. This asks the operational question instead
 * — what may actually run, given what this founder has granted — so the two are kept separate and
 * that file's recorded rehearsal output stays reproducible.
 *
 * CLI: tsx kernel/session/plan.ts --workspace <dir> [--max-concurrency <n>] [--json]
 *   or: tsx kernel/session/plan.ts --utterance "<free text>" [--cwd <path>]
 *
 * The second form (U3; R1) is the deterministic utterance router (kernel/session/route-utterance.ts,
 * U2) reached from the CLI instead of MCP: --workspace and --utterance are mutually exclusive, and
 * exactly one is required. --cwd is optional here (matching routeUtterance's own signature) even
 * though the MCP b2c_plan tool requires it alongside utterance — an interactive shell already has an
 * honest caller-relative cwd fallback the way --workspace does, where an MCP client does not. The
 * router's result prints as JSON; there is no rendered-report form for it.
 *
 * Exit codes: 0 = reported (including "nothing is ready", which is a finding, not a failure),
 * 1 = could not report, because the workspace has no business state to plan against, or because
 * neither/both of --workspace and --utterance were supplied.
 */

/** Why a node is not ready. Ordered by what the founder or agent can do about it, most actionable first. */
export type HeldReason = "founder_approval" | "autonomy" | "blocked" | "upstream";

export interface HeldNode {
  readonly nodeId: RunNodeId;
  readonly workflowId: string;
  readonly title: string;
  readonly domainId: string;
  readonly reason: HeldReason;
  /** The evaluator's own sentence where there is one, so this never invents a second explanation. */
  readonly detail: string;
  readonly reasonCode?: string;
  /** Sanitized one-line summary of the latest failed attempt, when the last attempt failed. */
  readonly lastFailure?: string;
  readonly lastFailureCode?: AttemptFailureCode;
  /** Unsanitized last attempt error. Public projection redacts this; it is never returned on the wire. */
  readonly lastFailureRaw?: string;
}

export interface PlanReport {
  readonly planId: string;
  readonly catalogVersion: string;
  readonly totalNodes: number;
  readonly done: number;
  /** Ready work, already grouped so that everything inside one group can run at the same time. */
  readonly batches: readonly (readonly HeldNode[])[];
  /**
   * One worker brief per ready node (same order as the flattened batches): the authored contract
   * — instructions, files to open, knowledge to load, outputs, verification — so an interactive
   * session executes the node from its brief instead of re-deriving what to load from prose
   * routing tables.
   */
  readonly readyBriefs: readonly NodeBrief[];
  readonly held: readonly HeldNode[];
  /** True when this workspace has no control file yet, so no domain has been granted anything. */
  readonly autonomyUnset: boolean;
  /** At most one live founder decision (U4/#30's `FounderQuestion`), picked by `pickFounderQuestion`. Never an array — one question at a time. */
  readonly founderQuestion: FounderQuestion | null;
}

function describe(
  node: CompiledRunNode,
  reason: HeldReason,
  detail: string,
  reasonCode?: string,
  lastFailure?: string,
  lastFailureCode?: AttemptFailureCode,
  lastFailureRaw?: string,
): HeldNode {
  return {
    nodeId: node.id,
    workflowId: node.workflowId,
    title: node.title,
    domainId: node.domainId,
    reason,
    detail,
    reasonCode,
    ...(lastFailure
      ? {
          lastFailure,
          ...(lastFailureCode ? { lastFailureCode } : {}),
          ...(lastFailureRaw !== undefined ? { lastFailureRaw } : {}),
        }
      : {}),
  };
}

/** The slice of a compiled node `pickFounderQuestion` actually reads — narrow on purpose so it is unit-testable without a real compiled plan. */
export type FounderQuestionNode = Pick<CompiledRunNode, "title" | "approvals" | "actionClass" | "protectedCategory">;

/** `effectiveProtectedCategory`'s three direct classes map onto the cluster's named "Go / spend-cap / release-publish" trio; every other protected category (credentials_access, legal_pricing, public_actions — catalog-declared, not action-class-direct) still needs a hard gate, so it falls back to the generic "confirm-go" class rather than going unlabeled. */
const CLASS_BY_PROTECTED_CATEGORY: Partial<Record<ProtectedCategory, FounderQuestionClass>> = {
  spend: "confirm-spend-cap",
  release: "confirm-release-publish",
  destructive: "confirm-go",
};

function classForProtectedCategory(category: ProtectedCategory): FounderQuestionClass {
  return CLASS_BY_PROTECTED_CATEGORY[category] ?? "confirm-go";
}

const GO_NO_GO_CHOICES = [
  { label: "Yes, go ahead", consequence: "I will do this now.", recommended: true },
  { label: "No, hold off", consequence: "I will leave this alone for now.", recommended: false },
] as const;

/** Validates before returning: a lint or shape failure logs and degrades to null rather than surfacing broken copy to a founder (fail closed). */
function safeFounderQuestion(question: FounderQuestion): FounderQuestion | null {
  const problems = validateFounderQuestion(question);
  if (problems.length > 0) {
    console.error(`plan.founder_question_invalid: ${problems.join("; ")}`);
    return null;
  }
  return question;
}

/**
 * Picks AT MOST ONE founder question from the same `held[]`/`autonomyUnset` `buildPlanReport`
 * already computed — no new engine pass, no second frontier evaluation. Priority order, most
 * actionable first:
 *
 * 1. A `founder_approval` node with a real approval (`approvals.length>0`) AND an effective
 *    protected category (spend/release/destructive, or a catalog-declared one) — a hard Go/
 *    spend-cap/release-publish confirmation.
 * 2. Any other `founder_approval` node with a real approval — a plain approval confirmation.
 * 3. `autonomyUnset` — this business has never been granted any authority at all.
 * 4. A `reason:"autonomy"` node — something is parked because the founder's current autonomy
 *    setting does not cover it, translated into plain language via `digest.ts`'s
 *    `translateParkReason`.
 * 5. A `founder_approval` node with NO real approval (`approvals.length===0`) — an unanswered
 *    conditional-applicability ("scope") question. Discriminated by the compiled node's actual
 *    approval count rather than by string-matching `detail`: a workflow could in principle
 *    declare both `founderOnlyActions` and a conditional `applicability`, which would make
 *    `detail` read like an approval description even though the true block reason is scope. That
 *    pre-existing ambiguity lives in this file's own `detail`-selection ternary above; checking
 *    `approvals.length` here sidesteps it rather than fixing it.
 *
 * Every constructed question is lint-validated (`validateFounderQuestion`) before it is returned;
 * a violation degrades to `null` (fail closed) instead of shipping broken founder-facing copy.
 */
export function pickFounderQuestion(
  byId: ReadonlyMap<RunNodeId, FounderQuestionNode>,
  held: readonly HeldNode[],
  autonomyUnset: boolean,
): FounderQuestion | null {
  const protectedCategoryFor = (nodeId: RunNodeId): ProtectedCategory | undefined => {
    const node = byId.get(nodeId);
    return node ? effectiveProtectedCategory(node) : undefined;
  };

  const approvalHeld = held.filter((node) => node.reason === "founder_approval");
  const realApprovals = approvalHeld.filter((node) => (byId.get(node.nodeId)?.approvals.length ?? 0) > 0);

  const protectedApproval = realApprovals.find((node) => protectedCategoryFor(node.nodeId) !== undefined);
  if (protectedApproval) {
    const category = protectedCategoryFor(protectedApproval.nodeId)!;
    return safeFounderQuestion(
      buildGoNoGoQuestion({
        phase: "operating",
        class: classForProtectedCategory(category),
        prompt: `Go ahead with "${protectedApproval.title}"?`,
        choices: GO_NO_GO_CHOICES,
      }),
    );
  }

  if (realApprovals.length > 0) {
    const node = realApprovals[0]!;
    return safeFounderQuestion(
      buildGoNoGoQuestion({ phase: "operating", class: "confirm-approval", prompt: `Go ahead with "${node.title}"?`, choices: GO_NO_GO_CHOICES }),
    );
  }

  if (autonomyUnset) {
    return safeFounderQuestion(
      buildSoftQuestion({
        phase: "orientation",
        class: "grant-initial-autonomy",
        prompt: "This business has no work authority yet. Set it up now?",
        choices: [
          { label: "Yes, set it up now", consequence: "I will walk through onboarding and set your grants.", recommended: true },
          { label: "Not yet", consequence: "Everything below stays parked until you do.", recommended: false },
        ],
      }),
    );
  }

  const autonomyParked = held.find((node) => node.reason === "autonomy");
  if (autonomyParked) {
    return safeFounderQuestion(
      buildSoftQuestion({
        phase: "operating",
        class: "raise-autonomy",
        prompt: translateParkReason({ reasonCode: autonomyParked.reasonCode, blocker: autonomyParked.detail }),
        choices: [
          { label: "Raise it now", consequence: "I will walk through what to change.", recommended: true },
          { label: "Leave it for later", consequence: "This stays parked until you do.", recommended: false },
        ],
      }),
    );
  }

  const scopeQuestion = approvalHeld.find((node) => (byId.get(node.nodeId)?.approvals.length ?? 0) === 0);
  if (scopeQuestion) {
    const prefix = "Scope answer needed: ";
    const prompt = scopeQuestion.detail.startsWith(prefix) ? scopeQuestion.detail.slice(prefix.length) : scopeQuestion.detail;
    return safeFounderQuestion(
      buildSoftQuestion({
        phase: "operating",
        class: "scope-question",
        prompt,
        choices: [
          { label: "Yes", consequence: "I will treat this as in scope.", recommended: true },
          { label: "No", consequence: "I will treat this as not needed.", recommended: false },
        ],
      }),
    );
  }

  return null;
}

/**
 * Categorizes every node the frontier pass just settled. The status values are read back off the
 * run copy rather than re-derived, because computeFrontier is what decided them — recomputing the
 * same conclusions here is how a planner starts disagreeing with the runner it is meant to preview.
 */
export function buildPlanReport(
  plan: CompiledPlan,
  run: RunStateDocument,
  ready: readonly RunNodeId[],
  parked: ReadonlyMap<RunNodeId, string>,
  decisions: ReadonlyMap<string, AutonomyDecisionDetail>,
  maxConcurrency: number,
  autonomyUnset: boolean,
  workspaceRoot?: string,
): PlanReport {
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  const readySet = new Set(ready);

  const held: HeldNode[] = [];
  let done = 0;

  for (const node of plan.nodes) {
    if (readySet.has(node.id)) continue;
    const state = run.nodes[node.id];
    const status = state?.status;
    if (status === "succeeded") {
      done += 1;
      continue;
    }
    const decision = decisions.get(node.id);
    const parkReason = parked.get(node.id);
    const lastAttempt = state?.attempts.at(-1);
    const lastFailure = lastAttempt?.status === "failed" ? summarizeAttemptFailure(lastAttempt.error) : undefined;
    const lastFailureCode = lastAttempt?.status === "failed" ? classifyAttemptFailure(lastAttempt.error) : undefined;
    const lastFailureRaw = lastAttempt?.status === "failed" ? (lastAttempt.error ?? "") : undefined;

    if (status === "waiting_founder") {
      const approval = node.approvals.map((item) => item.description).join("; ");
      held.push(
        describe(
          node,
          "founder_approval",
          approval || state?.blocker || "Waiting on a founder decision.",
          undefined,
          lastFailure,
          lastFailureCode,
          lastFailureRaw,
        ),
      );
    } else if (parkReason !== undefined) {
      held.push(describe(node, "autonomy", parkReason, decision?.reasonCode, lastFailure, lastFailureCode, lastFailureRaw));
    } else if (status === "blocked") {
      held.push(describe(node, "blocked", state?.blocker ?? "Blocked.", decision?.reasonCode, lastFailure, lastFailureCode, lastFailureRaw));
    } else {
      const pending = node.dependencies.filter((dependency) => run.nodes[dependency]?.status !== "succeeded");
      held.push(
        describe(
          node,
          "upstream",
          pending.length > 0 ? `Waits on ${pending.length} earlier step(s).` : "Inputs not produced yet.",
          undefined,
          lastFailure,
          lastFailureCode,
          lastFailureRaw,
        ),
      );
    }
  }

  const batches = buildDispatchBatches(plan, ready, maxConcurrency).map((batch) =>
    batch.nodeIds.map((nodeId) => {
      const node = byId.get(nodeId)!;
      return describe(node, "upstream", "");
    }),
  );
  const readyBriefs = batches.flat().map((entry) => composeNodeBrief(byId.get(entry.nodeId)!, plan, undefined, workspaceRoot));
  const founderQuestion = pickFounderQuestion(byId, held, autonomyUnset);

  return {
    planId: plan.planId,
    catalogVersion: plan.catalogVersion,
    totalNodes: plan.nodes.length,
    done,
    batches,
    readyBriefs,
    held,
    autonomyUnset,
    founderQuestion,
  };
}

const HELD_HEADING: Record<HeldReason, string> = {
  founder_approval: "Parked on a founder decision",
  autonomy: "Parked because autonomy does not cover it",
  blocked: "Blocked",
  upstream: "Waiting on earlier work",
};

const HELD_ORDER: readonly HeldReason[] = ["founder_approval", "autonomy", "blocked", "upstream"];

/**
 * Agent-facing, like the session run log and unlike the founder digest — node ids and domain ids
 * are the point here. The founder digest has its own plain-language contract.
 */
export function renderReport(report: PlanReport): string {
  const lines: string[] = [];
  lines.push(`Plan ${report.planId} (catalog ${report.catalogVersion}): ${report.totalNodes} steps, ${report.done} done.`);

  if (report.founderQuestion) {
    lines.push(`Founder question: ${report.founderQuestion.prompt}`);
  }

  if (report.autonomyUnset) {
    lines.push("");
    lines.push("This business has no work authority, so every business step below is parked.");
    lines.push(
      "Load workflow.operations.founder-zero-operator-bootstrap through MCP and follow its named references. Then apply the founder's answers with `b2c onboard --workspace <workspace> --answers <answers.json>`.",
    );
  }

  const readyCount = report.batches.reduce((total, batch) => total + batch.length, 0);
  lines.push("");
  if (readyCount === 0) {
    lines.push("Ready now: nothing.");
  } else {
    const groups = report.batches.length === 1 ? "1 group" : `${report.batches.length} groups`;
    lines.push(`Ready now: ${readyCount} step(s), in ${groups}. Everything inside a group can run at the same time.`);
    report.batches.forEach((batch, index) => {
      lines.push(`  Group ${index + 1}:`);
      for (const node of batch) lines.push(`    - ${node.title}  [${node.nodeId}]`);
    });
    // The briefs are the point of the report: an interactive session works each ready node from
    // its brief (do/open/load/produce/verify) instead of re-deriving what to load from prose.
    lines.push("");
    lines.push("Briefs for ready work:");
    for (const brief of report.readyBriefs) {
      lines.push("");
      lines.push(renderNodeBrief(brief));
    }
  }

  for (const reason of HELD_ORDER) {
    const group = report.held.filter((node) => node.reason === reason);
    if (group.length === 0) continue;
    lines.push("");
    lines.push(`${HELD_HEADING[reason]} (${group.length}):`);
    // "Waiting on earlier work" is the uninteresting bulk of any young plan: it is a count, not a
    // list, or the genuinely actionable groups above scroll off the top of the report.
    if (reason === "upstream") continue;
    for (const node of group) {
      const code = node.reasonCode ? ` (${node.reasonCode})` : "";
      lines.push(`  - ${node.title}${code}`);
      lines.push(`    ${node.detail}`);
      if (node.lastFailure) lines.push(`    Last attempt failed: ${node.lastFailure}`);
    }
  }
  const upstreamFailures = report.held.filter((node) => node.reason === "upstream" && node.lastFailure);
  if (upstreamFailures.length > 0) {
    lines.push("");
    lines.push(`Earlier attempts that failed (${upstreamFailures.length}):`);
    for (const node of upstreamFailures) {
      lines.push(`  - ${node.title}`);
      lines.push(`    Last attempt failed: ${node.lastFailure}`);
    }
  }

  return lines.join("\n");
}

export function planWorkspace(
  workspace: string,
  options: { now?: string; maxConcurrency?: number; observeProviders?: boolean; dopplerProject?: string; dopplerConfig?: string; secretsMd?: string } = {},
): PlanReport {
  if (Object.hasOwn(options, "catalog"))
    throw new Error("plan.unsupported_argument: --catalog is not supported. Use composition activation to change the workspace pin.");
  const paths = resolveWorkspacePaths(workspace);
  const compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) {
    throw new Error(`business.catalog_unavailable: ${renderCatalogRefusal(compatible.refusal)}`);
  }
  const now = options.now ?? new Date().toISOString();
  const maxConcurrency = options.maxConcurrency ?? 4;

  const businessState: BusinessStateV2 | undefined = loadBusinessStateFile(paths.state);
  if (!businessState) {
    throw new Error("business.not_initialized");
  }

  // A missing control file is a real, expected cold-start state rather than an error: it means
  // onboarding has not happened, which is precisely what the report should say out loud. Empty
  // grants then park every node through the ordinary evaluator path, so the reason each step is
  // held is the true one and not a special case invented here.
  const control: ControlFile | undefined = loadControlFile(paths.control);
  const ledger = loadLedgerFile(paths.ledger, now);
  const catalog = compatible.catalog;
  const plan = compilePlan(catalog, now);

  const run = (() => {
    if (existsSync(paths.runState)) {
      const existing = loadRunState(paths.runState);
      return reconcileRunPlan(plan, existing, businessState, { ownerSessionId: "planner", ttlSeconds: 300, wallClockCapSeconds: 0, now });
    }
    return seedRunState(plan, businessState, { ownerSessionId: "planner", ttlSeconds: 300, wallClockCapSeconds: 0, now });
  })();
  // Same environmental-artifact acceptance and calendar reopening a real session applies (in
  // memory only — the planner never writes run state). Skipping either would make this report
  // disagree with what a session run moments later would actually do.
  reconcileEnvironmentalArtifacts(plan, run, workspace, now);
  invalidateStaleReviews(plan, run, workspace, now);
  reopenRecurringNodes(plan, run, now);
  reopenNodesForAuthorizedWorkOrders(plan, run, now);
  // A real session observes app source before its first frontier pass. Mirror that graph input
  // in memory so planning does not hold source-dependent work on a checkpoint the runner would
  // immediately establish. Do not call observeAppSourceFingerprint(): it persists the checkpoint,
  // while this command must leave every workspace file untouched.
  const sourceBinding = run.artifactBindings.find((binding) => binding.path === APP_SOURCE_FINGERPRINT_PATH);
  if (sourceBinding) {
    ingestSourceFingerprint(plan, run, sourceBinding.artifactId as CatalogArtifactId, fingerprintAppSource(workspace), now);
  }

  const prerequisiteVerifier = options.observeProviders
    ? createCompositeVerifier({
        doppler_auth: createDopplerAuthVerifier({
          project: options.dopplerProject ?? control?.businessSlug ?? "",
          config: options.dopplerConfig ?? "production",
          secretsMdPath: options.secretsMd ?? path.join(workspace, "SECRETS.md"),
        }),
        budget_funded: createBudgetFundedVerifier(ledger),
      })
    : () => ({ status: "lapsed" as const, detail: "Provider prerequisite was not observed by this passive plan." });

  const decisions = new Map<string, AutonomyDecisionDetail>();
  const inner = createAutonomyEvaluator({
    grants: control?.grants ?? {},
    waivers: control?.waivers ?? [],
    ledger,
    prerequisiteVerifier,
    runId: run.runId,
    authority: catalog.authority,
  });
  const evaluator: AutonomyEvaluatorV2 = {
    evaluate(node: CompiledRunNode): AutonomyDecisionDetail {
      const detail = inner.evaluate(node);
      decisions.set(node.id, detail);
      return detail;
    },
  };

  // The clone is the no-write guarantee: computeFrontier promotes and demotes node statuses in
  // place, and the copy it edits is thrown away when this process exits.
  const scratch: RunStateDocument = structuredClone(run);
  refreshDependenciesBeforeFrontier(plan, scratch, new Date().toISOString(), refreshAdmissibleConsumerIds(plan, scratch, businessState, evaluator));
  const frontier = computeFrontier(plan, scratch, businessState, evaluator);
  const parked = new Map(frontier.parked.map((entry) => [entry.nodeId, entry.reason]));

  const report = buildPlanReport(
    plan,
    scratch,
    frontier.ready,
    parked,
    decisions,
    maxConcurrency,
    !control || Object.keys(control.grants).length === 0,
    workspace,
  );
  return report;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (Object.hasOwn(args, "catalog")) {
    console.error("plan.unsupported_argument: --catalog is not supported. Use composition activation to change the workspace pin.");
    return 1;
  }

  // U3 (R1): --workspace and --utterance are the two mutually exclusive request shapes, exactly
  // one required — checked before either branch touches the filesystem, mirroring b2c_operate's
  // and b2c_status's own conflict-first ordering in entrypoints/mcp/server.ts.
  if (args.workspace !== undefined && args.utterance !== undefined) {
    console.error('plan.request_conflict: provide either --workspace <dir> or --utterance "..." [--cwd <path>], not both');
    return 1;
  }
  if (args.workspace === undefined && args.utterance === undefined) {
    console.error('plan.request_required: provide either --workspace <dir> or --utterance "..." [--cwd <path>]');
    return 1;
  }
  const mandateScope = args["mandate-scope"];
  if (mandateScope !== undefined && (args.utterance === undefined || !["focused", "complete_business"].includes(mandateScope))) {
    console.error("plan.invalid_mandate_scope: use focused or complete_business with --utterance only");
    return 1;
  }
  if (args.utterance !== undefined) {
    // cwd is optional here (unlike the MCP tool, which requires it): a relative --cwd resolves
    // against the invoking shell's directory exactly like --workspace does, via the same
    // B2C_APP_BUILDER_CALLER_CWD-aware helper.
    const cwd = args.cwd !== undefined ? resolveCallerPath(args.cwd) : undefined;
    console.log(
      JSON.stringify(
        withOnboardingStepper(
          routeUtterance({ utterance: args.utterance, cwd, mandateScope: mandateScope as "focused" | "complete_business" | undefined }),
          cwd,
        ),
        null,
        2,
      ),
    );
    return 0;
  }
  // Unreachable given the two guards above (utterance is undefined here, and the pair can no
  // longer both be undefined), but kept as the original, unmodified check: it is what narrows
  // `args.workspace` from `string | undefined` for every line below, so the workspace branch
  // that follows stays the exact code it was before this unit (R1: byte-identical passthrough).
  if (!args.workspace) {
    console.error("plan.missing_argument: --workspace is required");
    return 1;
  }

  // `b2c workspaces register <id> <path>` gives interactive and MCP callers one stable
  // address. Keep direct paths available for an app that has not been registered yet, but
  // honor the registered ID advertised by the setup flow and README before treating the
  // argument as a caller-relative path.
  const directWorkspace = resolveCallerPath(args.workspace);
  let workspace = directWorkspace;
  try {
    const registered = resolveRegisteredWorkspace(args.workspace);
    if (!("refused" in registered)) workspace = registered.path;
  } catch {
    // A damaged address book must not block a direct path that is still usable. An ID-only
    // request cannot be resolved safely, so report the repair route without exposing parser data.
    if (!existsSync(directWorkspace)) {
      console.error(
        "plan.registry_invalid: the workspace registry is unreadable. Run `b2c inspect` (or supported `b2c doctor`), then repair or recreate the registry before using an ID.",
      );
      return 1;
    }
  }
  try {
    const report = planWorkspace(workspace, {
      now: args.now,
      maxConcurrency: Number(args["max-concurrency"] ?? 4),
      observeProviders: true,
      dopplerProject: args["doppler-project"],
      dopplerConfig: args["doppler-config"],
      secretsMd: args["secrets-md"],
    });
    console.log(args.json === "true" ? JSON.stringify(report, null, 2) : renderReport(report));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "business.plan_failed");
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
