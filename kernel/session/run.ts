#!/usr/bin/env node
import { createFirstpartyWorkerRoutes } from "./firstparty-worker-host.js";
import { boundedFileBytes } from "../lib/bounded-file.js";
import { workspaceRevision } from "./workspace-revision.js";
import { trackRuntimeWrites } from "./runtime-write-audit.js";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { runReducer, skillRoot, type ReducerResult } from "./reducer-cli.js";
import { acquireLock, heartbeat, releaseLock, type AcquireResult } from "../reducer/lock.js";
import type { PatchOp, PatchPath, StatePatch } from "../reducer/patch.js";
import { validateBudgetLedger, validateBusinessState, validateControl, validateRunState } from "../schema/index.js";
import {
  grantableDomainIds,
  type BudgetLedgerDocument,
  type BusinessStateV2,
  type ControlFile,
  type RunStateDocument,
  type PublicSessionResult,
} from "../schema/types.js";
import { compilePlan, type CatalogInput, type CompiledPlan, type CompiledRunNode, type RunNodeId } from "../engine/compile.js";
import { computeFrontier, refreshAdmissibleConsumerIds } from "../engine/frontier.js";
import { observeAppSourceFingerprint } from "../engine/source-fingerprint.js";
import { buildDispatchBatches, checkBatchBoundary, type BatchHaltReason, type DispatchHooks } from "../engine/dispatch.js";
import {
  acceptVerification,
  recordRejectedVerification,
  fingerprintInputs,
  abandonDependencyRefreshesForConsumer,
  beginAttempt,
  detectOrphans,
  isWallClockExceeded,
  loadRunState,
  reconcileEnvironmentalArtifacts,
  reconcilePatch,
  reconcileRunPlan,
  invalidateStaleReviews,
  invalidateDescendants,
  requestVerificationRepair,
  reconcileWorkflowApplicability,
  refreshHeartbeat,
  reopenRecurringNodes,
  attemptsUsedInCurrentCycle,
  reopenNodesForAuthorizedWorkOrders,
  refreshDependenciesBeforeFrontier,
  deferDependencyRefreshAfterFailure,
  seedRunState,
  workerExecutionIdentity,
  writeRunState,
  buildCheckpoint,
  writeCheckpoint,
  type OrphanEvent,
} from "../engine/runstate.js";
import { createAutonomyEvaluator, type AutonomyDecisionDetail, type AutonomyEvaluatorV2 } from "../autonomy/evaluator.js";
import { createDispatchHooks } from "../autonomy/killswitch.js";
import { domainBusinessUnit } from "../autonomy/budget.js";
import { createCompositeVerifier } from "../autonomy/prerequisites.js";
import { createDopplerAuthVerifier } from "../autonomy/probes/doppler.js";
import { createBudgetFundedVerifier } from "../autonomy/probes/budget.js";
import { verifyControlBoundary, type ControlBoundaryVerdict } from "../../adapters/install-control-permissions.js";
import { applyStandingApprovals } from "../autonomy/standing-approvals.js";
import { capsuleFromOccurrence, dueWorkOrderReviews, restoreOccurrenceAfterAttempt, takeAuthorizedOccurrence } from "../work-orders/lifecycle.js";

import {
  listPendingFreshContext,
  hasCurrentDeterministicVerification,
  recordDeterministicVerification,
  refuseFreshContextAcceptance,
  requiresIndependentReview,
  verificationOutputFingerprint,
  VERIFICATION_REQUIRED_BLOCKER,
  VERIFICATION_REJECTED_BLOCKER,
} from "../engine/verification.js";
import {
  captureReviewEvidence,
  refreshProducedArtifacts,
  validateReviewReceipt,
  validateCurrentReview,
  workspaceArtifactFingerprint,
} from "../engine/review-evidence.js";
import { captureDesignAuthorityEvaluation } from "../engine/design-taste-authority.js";
import {
  assertFounderTrustBinding,
  bindFounderTrustToNewRun,
  FOUNDER_TRUST_FILE_ENV,
  FounderTrustStoreError,
  loadFounderTrustStore,
  recoverFounderTrustBindingFromAudit,
  resolveFounderTrustFile,
  type LoadedFounderTrustStore,
} from "../engine/founder-trust-store.js";
import { appendAuditEntry } from "../reducer/audit.js";
import { BriefInvalid, loadBrief, nodeInScope, type SessionBrief } from "./brief.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";
import { resolveCliWorkspace } from "./status.js";
import {
  createCliExecutor,
  createCliVerifier,
  createFixtureExecutor,
  createFixtureVerifier,
  createSlowSilentExecutor,
  noOpExecutor,
  type NodeExecutor,
  type NodeVerifier,
  type WorkerRuntime,
} from "./executor.js";
import { b2cAppBuilderHome, loadRegistry } from "../../adapters/registry.js";
import { acquireSharedClaim, assertSharedClaim, releaseSharedClaim, renewSharedClaim, type SharedClaim } from "../reducer/shared-claims.js";
import type { VerifierOutputRef } from "./worker-prompt.js";
import { runDeterministicGates, type GateOutcome } from "./deterministic-gates.js";
import {
  formatAge,
  pushDigest,
  renderDigest,
  translateHaltReason,
  translateParkReason,
  writeDigestFile,
  type DigestAdvancedItem,
  type DigestAnomaly,
  type DigestInput,
  type DigestOutcome,
  type DigestParkedItem,
  type DigestSpendLine,
} from "./digest.js";
import { INVALID_APP_REVIEW_WATCH_SUMMARY, projectAppReviewForFounder, readAppReviewState } from "../../adapters/app-review/index.js";

/** Failed audit gates permit routing a rejection, never accepting the current output. */
function hasCurrentFailedAuditGates(plan: CompiledPlan, run: RunStateDocument, nodeId: RunNodeId): boolean {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const state = run.nodes[nodeId];
  const attempt = state?.attempts.at(-1);
  const receipt = attempt?.deterministicVerification;
  return Boolean(
    node?.reviewOf?.length &&
    node.verification.gateIds.length > 0 &&
    requiresIndependentReview(node) &&
    state?.status === "blocked" &&
    state.blocker === VERIFICATION_REQUIRED_BLOCKER &&
    attempt?.status === "blocked" &&
    receipt &&
    receipt.passed === false &&
    receipt.attemptId === attempt.id &&
    receipt.inputFingerprint === attempt.inputFingerprint &&
    receipt.outputFingerprint === verificationOutputFingerprint(plan, run, nodeId) &&
    JSON.stringify(receipt.gateIds) === JSON.stringify(node.verification.gateIds) &&
    receipt.authorityContextFingerprint === attempt.designAuthorityEvaluation?.authorityContextFingerprint &&
    receipt.evidence.some((entry) => entry.trim()),
  );
}

function listPendingSessionReviews(plan: CompiledPlan, run: RunStateDocument): RunNodeId[] {
  return [...listPendingFreshContext(plan, run), ...plan.nodes.filter((node) => hasCurrentFailedAuditGates(plan, run, node.id)).map((node) => node.id)];
}

/**
 * The scheduled-session runner (R1, R2, R16; the KTD1 headless CLI shape). Bounded, single-run,
 * exits every time: acquire the workspace-wide advisory lock, preflight for out-of-band tamper,
 * honor the kill switch, seed/resume run state, dispatch within grants+budget, and — on every
 * exit path, success or failure — write a founder-plain digest before releasing the lock. Sessions
 * never reach around the reducer: any state this runner changes on the six reducer-owned
 * documents (business-state/control/grants/waivers/budget-ledger/current-truth) goes through kernel/reducer/cli.ts
 * as a subprocess, never a direct write. Commit patches cannot target current-truth; reconcile writes it.
 *
 * Exit codes mirror the reducer's own convention for consistency across the two CLIs a scheduler
 * invokes: 0 = ran (whatever the outcome — the digest tells the real story), 1 = the workspace
 * isn't usable (missing/invalid required documents, or an unexpected internal error), 2 = did not
 * run (lock contention — "back off and report" per R13), 3 = preflight/tamper failure (R14).
 */

export interface WorkspacePaths {
  readonly root: string;
  readonly state: string;
  readonly control: string;
  readonly ledger: string;
  readonly manifest: string;
  readonly audit: string;
  readonly sessionLock: string;
  readonly catalog: string;
  readonly runState: string;
  readonly checkpoint: string;
  readonly agentOperations: string;
  readonly appReview: string;
  readonly currentTruth: string;
}

export function resolveWorkspacePaths(root: string): WorkspacePaths {
  return {
    root,
    state: path.join(root, "state", "business-state.json"),
    control: path.join(root, "control", "control.json"),
    ledger: path.join(root, "control", "budget-ledger.json"),
    manifest: path.join(root, "control", "manifest.json"),
    audit: path.join(root, "control", "audit.jsonl"),
    sessionLock: path.join(root, "control", "session.lock"),
    catalog: path.join(root, "catalog.json"),
    runState: path.join(root, "run", "run-state.json"),
    checkpoint: path.join(root, "run", "checkpoint.json"),
    agentOperations: path.join(root, "operations", "agent-operations.json"),
    appReview: path.join(root, "run", "app-review.json"),
    currentTruth: path.join(root, "state", "current-truth.json"),
  };
}

/** Close a settled interrupted public request without executing work or accepting evidence.
 * Stale lock recovery and uncertain-effect readback remain separate existing authority boundaries.
 */
export function recoverPublicRequest(
  workspace: string,
  input: { expectedRevision: string; requestId: string },
): { result: PublicSessionResult; replayed: boolean; revision: string } {
  const paths = resolveWorkspacePaths(workspace);
  const owner = `request-recovery-${randomUUID()}`;
  const held: string[] = [];
  const safe = (file: string) => {
    const relative = path.relative(workspace, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("business.unsafe_workspace_file");
    let current = workspace;
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error("business.unsafe_workspace_file");
    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment);
      let stat;
      try {
        stat = lstatSync(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (stat.isSymbolicLink() || (current === file ? !stat.isFile() : !stat.isDirectory())) throw new Error("business.unsafe_workspace_file");
    }
  };
  for (const file of [
    paths.sessionLock,
    `${paths.manifest}.lock`,
    `${paths.state}.lock`,
    paths.runState,
    `${paths.runState}.tmp`,
    paths.checkpoint,
    `${paths.checkpoint}.tmp`,
  ])
    safe(file);
  // Verify transition guards before creating even a temporary lock.
  workspaceRevision(workspace);
  try {
    for (const file of [paths.sessionLock, `${paths.manifest}.lock`, `${paths.state}.lock`]) {
      const lease = acquireLock(file, { ownerSessionId: owner, retries: 0 });
      if (!lease.ok) throw new Error(lease.reason === "held" ? "business.session_lock_unavailable" : "business.request_lock_recovery_required");
      held.push(file);
      if (file === paths.sessionLock && !tamperCheckPasses(paths)) throw new Error("business.preflight_refused");
    }
    if (workspaceRevision(workspace) !== input.expectedRevision) throw new Error("business.stale_revision");
    const catalog = loadWorkspaceCatalog(workspace);
    if (!catalog.ok) throw new Error("business.catalog_unavailable");
    const loaded = validateRunState(JSON.parse(boundedFileBytes(paths.runState, 32 * 1024 * 1024).toString("utf8")));
    if (!loaded.valid) throw new Error("business.request_state_invalid");
    const run = loaded.value!;
    const plan = compilePlan(catalog.catalog, run.createdAt);
    if (run.planId !== plan.planId) throw new Error("business.request_plan_changed");
    if (Object.keys(run.nodes).length !== plan.nodes.length || plan.nodes.some((node) => run.nodes[node.id]?.nodeId !== node.id))
      throw new Error("business.request_state_invalid");
    if (
      run.artifactBindings.length !== plan.artifactBindings.length ||
      plan.artifactBindings.some(
        (binding) => run.artifactBindings.filter((current) => current.artifactId === binding.artifactId && current.path === binding.path).length !== 1,
      )
    )
      throw new Error("business.request_state_invalid");
    const record = run.publicRequests && Object.hasOwn(run.publicRequests, input.requestId) ? run.publicRequests[input.requestId] : undefined;
    if (!record) throw new Error("business.request_not_found");
    const checkpoint = () => buildCheckpoint(run, record.sessionId, createHash("sha256").update(JSON.stringify(run)).digest("hex"), run.updatedAt);
    if (record.status === "completed" && record.result) {
      let current: unknown;
      try {
        current = JSON.parse(boundedFileBytes(paths.checkpoint, 32 * 1024 * 1024).toString("utf8"));
      } catch {
        current = undefined;
      }
      if (JSON.stringify((current as { runState?: unknown } | undefined)?.runState) !== JSON.stringify(run)) writeCheckpoint(paths.checkpoint, checkpoint());
      return { result: record.result, replayed: true, revision: workspaceRevision(workspace) };
    }
    if (record.status !== "running" || record.result) throw new Error("business.request_state_invalid");
    const heartbeatAt = Date.parse(run.heartbeatAt);
    if (!Number.isFinite(heartbeatAt) || Date.now() - heartbeatAt <= run.ttlSeconds * 1000) throw new Error("business.request_session_not_settled");
    const uncertain = new Set(["running", "orphaned", "needs_readback"]);
    const histories = [run, ...(run.archivedPlans ?? [])];
    for (const history of histories) {
      if (Object.values(history.workOrders ?? {}).some((occurrence) => occurrence.status === "running")) throw new Error("business.request_readback_required");
      for (const state of Object.values(history.nodes)) {
        const node = history === run ? plan.nodes.find((entry) => entry.id === state.nodeId) : undefined;
        if (
          state.attempts.some((attempt) => attempt.status === "failed") &&
          (!node || !node.idempotent || node.protectedCategory || !["observe", "draft"].includes(node.actionClass))
        )
          throw new Error("business.request_readback_required");
        const latest = state.attempts.at(-1);
        const verifiedRepeat = Boolean(
          node &&
          node.idempotent &&
          !node.protectedCategory &&
          ["observe", "draft"].includes(node.actionClass) &&
          state.status === "succeeded" &&
          latest?.status === "succeeded" &&
          latest.inputFingerprint === fingerprintInputs(node.inputs, run.artifactBindings) &&
          hasCurrentDeterministicVerification(plan, run, node.id) &&
          (!requiresIndependentReview(node) || validateCurrentReview(plan, run, node.id, workspace).length === 0) &&
          node.inputs.every((id) => {
            const binding = run.artifactBindings.find((entry) => entry.artifactId === id);
            return binding?.fingerprint && binding.fingerprint === workspaceArtifactFingerprint(workspace, binding.path);
          }) &&
          node.outputs.every((id) => {
            const binding = run.artifactBindings.find((entry) => entry.artifactId === id);
            return binding?.accepted && binding.attemptId === latest.id && binding.fingerprint === workspaceArtifactFingerprint(workspace, binding.path);
          }),
        );
        if (
          uncertain.has(state.status) ||
          state.attempts.some(
            (attempt) =>
              attempt.readbackRequired || (uncertain.has(attempt.status) && !(attempt.status === "orphaned" && attempt !== latest && verifiedRepeat)),
          )
        )
          throw new Error("business.request_readback_required");
      }
      for (const artifact of history.artifactBindings) {
        const file = path.resolve(workspace, artifact.path);
        safe(file);
        if (!existsSync(file)) continue;
        const bytes = boundedFileBytes(file, 32 * 1024 * 1024);
        if (bytes.includes(Buffer.from("b2c.operation-intent/v1"))) throw new Error("business.request_readback_required");
      }
    }
    const result: PublicSessionResult = {
      runId: run.runId,
      planId: run.planId,
      outcome: "interrupted",
      completed: 0,
      held: Object.values(run.nodes).filter((node) => node.status !== "succeeded").length,
    };
    record.status = "completed";
    record.result = result;
    run.updatedAt = new Date().toISOString();
    // The run is authoritative; its atomic write preserves exact-retry identity even if checkpoint writing is interrupted.
    writeRunState(paths.runState, run);
    writeCheckpoint(paths.checkpoint, checkpoint());
    return { result, replayed: false, revision: workspaceRevision(workspace) };
  } finally {
    for (const file of held.reverse()) releaseLock(file, owner);
  }
}

let patchSequence = 0;
function nextPatchId(sessionId: string): string {
  patchSequence += 1;
  return `patch.${sessionId}.${patchSequence}`;
}

/**
 * The session's tamper backstop (R14): the reducer's manifest preflight confirms none of the six
 * reducer-owned documents changed outside the reducer since the last commit, and verify-audit
 * confirms the hash-chained audit log's chain is intact. Run at session start AND at every batch
 * boundary so a same-session out-of-band edit is caught before the next batch, not next session.
 * Note: this DETECTS out-of-band mutation; it does not by itself PREVENT a Bash-capable session
 * from invoking the reducer — see the reducer's founder-authority gate and the OS-permission
 * requirement in the workspace AGENTS.md for the prevention layers.
 */
function tamperCheckPasses(paths: WorkspacePaths): boolean {
  if (runReducer(["preflight", "--manifest", paths.manifest]).code !== 0) return false;
  if (existsSync(paths.audit) && runReducer(["verify-audit", "--audit", paths.audit]).code !== 0) return false;
  return true;
}

const DESIGN_TASTE_FOUNDER_DECISION_CODES = new Set([
  "worthiness.taste_gate_authority_evidence",
  "worthiness.taste_gate_delegation_authority",
  "worthiness.taste_gate_incomplete",
]);
const DESIGN_AUDIT_WORKFLOW_IDS = new Set(["workflow.design.design-system-audit", "workflow.design.implementation-craft-audit"]);
const IMPLEMENTATION_AUDIT_EVIDENCE_CODES = new Set([
  "design_acceptance.report",
  "design_acceptance.report_coverage",
  "design_acceptance.self_review",
  "design_acceptance.chronology",
  "design_acceptance.stale_candidate",
]);

/**
 * A design-audit worker can finish without producing its one declared review artifact, or can
 * return a malformed knowledge receipt before any gate sees that artifact. Both are reversible
 * audit-authoring defects. They consume the audit node's own bounded retry budget; they are not
 * evidence that the Design Room candidate needs repair.
 */
function isRetryableDesignAuditExecutorFailure(node: CompiledRunNode, error: string | undefined): boolean {
  // Global control/audit tamper checks halt the session before dispatch. Once one of these two
  // local audit workers is running, every non-empty executor failure is a reversible failure to
  // author or prove the review. Keep it on the audit node's bounded retry budget; it establishes
  // no defect in the Design Room or implementation candidate.
  return DESIGN_AUDIT_WORKFLOW_IDS.has(node.workflowId) && Boolean(error?.trim());
}

/** Product/craft rejection repairs declared producers. Invalid audit-authored evidence retries
 * only the relevant design audit, because no product defect has yet been established. */
function isRetryableDesignAuditGateFailure(node: CompiledRunNode, outcome: GateOutcome): boolean {
  if (DESIGN_AUDIT_WORKFLOW_IDS.has(node.workflowId) && outcome.unclassifiedFailure) return true;
  if (node.workflowId === "workflow.design.design-system-audit") {
    return outcome.issueCodes.length > 0 && outcome.issueCodes.every((code) => code === "worthiness.taste_gate_review_evidence");
  }
  return (
    node.workflowId === "workflow.design.implementation-craft-audit" &&
    outcome.issueCodes.length > 0 &&
    outcome.issueCodes.every((code) => IMPLEMENTATION_AUDIT_EVIDENCE_CODES.has(code))
  );
}

/**
 * A design audit's own missing, changed, or unsafe output proves only that this audit attempt is
 * unusable. It does not prove a defect in any reviewed producer. Consume the audit's bounded
 * retry budget and leave every Design Room / implementation attempt untouched.
 */
function queueDesignAuditOnlyRetry(plan: CompiledPlan, run: RunStateDocument, nodeId: RunNodeId, findings: readonly string[], now: string): number {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const state = run.nodes[nodeId];
  const attempt = state?.attempts.at(-1);
  if (!node || !state || !attempt || !DESIGN_AUDIT_WORKFLOW_IDS.has(node.workflowId)) return 0;
  const evidence = findings.filter((entry) => entry.trim().length > 0);
  if (evidence.length === 0) return 0;

  attempt.status = "failed";
  attempt.finishedAt ??= now;
  attempt.error ??= evidence.join("; ");
  attempt.independentVerification = undefined;
  if (attempt.workOrderOccurrenceId) restoreOccurrenceAfterAttempt(run, attempt.workOrderOccurrenceId, now);
  state.acceptedOutputFingerprint = undefined;
  state.verifiedBySessionId = undefined;
  state.repairInstructions = evidence.map((entry) => `Repair invalid audit evidence: ${entry}`);
  for (const binding of run.artifactBindings) {
    if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
  }
  // This output is still pending independent verification, so no downstream node can have
  // accepted it. Walking descendants here is both unnecessary and wrong for review feedback
  // cycles: Design Room reads its audit findings on a real rejection, which would otherwise make
  // an audit-file integrity defect look like product work and reopen the producer.
  if (attemptsUsedInCurrentCycle(state) < node.maxAttempts) {
    state.status = "stale";
    state.blocker = undefined;
    run.updatedAt = now;
    return 1;
  }
  state.status = "blocked";
  state.blocker = `The design audit evidence remained invalid after ${node.maxAttempts} attempts.`;
  run.updatedAt = now;
  return 0;
}

function commitPatch(targetFile: string, paths: WorkspacePaths, sessionId: string, patch: StatePatch): ReducerResult {
  return runReducer(["commit", "--file", targetFile, "--manifest", paths.manifest, "--audit", paths.audit, "--session", sessionId], JSON.stringify(patch));
}

function tryLoadJson(filePath: string): unknown | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * The four workspace loaders below are exported so kernel/session/plan.ts reads a workspace exactly
 * the way a real session does. A second, private copy in the read-only planner is the one thing
 * that would make its report diverge from what an actual run would then do — and a planner that
 * disagrees with the runner is worse than no planner.
 */
export function loadControlFile(controlPath: string): ControlFile | undefined {
  const raw = tryLoadJson(controlPath);
  if (raw === undefined) return undefined;
  const result = validateControl(raw);
  return result.valid ? result.value : undefined;
}

export function loadBusinessStateFile(statePath: string): BusinessStateV2 | undefined {
  const raw = tryLoadJson(statePath);
  if (raw === undefined) return undefined;
  const result = validateBusinessState(raw);
  return result.valid ? result.value : undefined;
}

function emptyLedger(now: string): BudgetLedgerDocument {
  return { schemaVersion: "1.0.0", updatedAt: now, balances: [], entries: [] };
}

/** A business that hasn't set up a budget yet is a legitimate state, not an error — spend nodes simply park (autonomy.budget_unfunded). */
export function loadLedgerFile(ledgerPath: string, now: string): BudgetLedgerDocument {
  const raw = tryLoadJson(ledgerPath);
  if (raw === undefined) return emptyLedger(now);
  const result = validateBudgetLedger(raw);
  return result.valid ? result.value! : emptyLedger(now);
}

export function loadCatalogFile(catalogPath: string): CatalogInput {
  const raw = tryLoadJson(catalogPath) as CatalogInput | undefined;
  return raw ?? { version: "catalog.empty", artifacts: [], workflows: [] };
}

/** Hook used by installed briefs/CI to reject a stale or substituted executable catalog. */
export function assertCatalogCompatibility(catalog: CatalogInput, expectedVersion?: string): void {
  if (!catalog.version || catalog.version === "catalog.empty") throw new Error("catalog.version_missing: executable catalog is missing or invalid");
  if (expectedVersion && catalog.version !== expectedVersion) throw new Error(`catalog.version_stale: expected ${expectedVersion}, found ${catalog.version}`);
}

/** Load the installer-owned catalog version automatically; a present but incomplete binding fails closed. */
export function runtimeCatalogVersion(workspace: string): string | undefined {
  const manifestPath = path.join(workspace, ".b2c-launch", "runtime.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = tryLoadJson(manifestPath);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("catalog.runtime_binding_invalid: runtime.json is not an object");
  const version = (manifest as Record<string, unknown>).catalogVersion;
  if (typeof version !== "string" || !version.trim()) {
    throw new Error("catalog.runtime_binding_stale: runtime.json has no catalogVersion; refresh the installed entrypoints");
  }
  return version;
}

/** Records evaluator.evaluate()'s full decision detail per node id as frontier examines it, so the digest can translate the *precise* reasonCode rather than a generic fallback. */
function withCapture(inner: AutonomyEvaluatorV2, sink: Map<string, AutonomyDecisionDetail>): AutonomyEvaluatorV2 {
  return {
    evaluate(node: CompiledRunNode): AutonomyDecisionDetail {
      const detail = inner.evaluate(node);
      sink.set(node.id, detail);
      return detail;
    },
  };
}

/**
 * The reducer's fail-closed join rejects a patch whose declared output didn't actually change
 * (patch.declared_output_missing) — and committed/spent can trade places while remaining stays
 * numerically invariant (e.g. committed 25→0, spent 0→25, remaining 975→975). This only ever
 * declares (and only ever sets) a balance field that is genuinely different, so the always-touched
 * `updatedAt` timestamp is the one guaranteed change per commit.
 */
function pushIfChanged(ops: PatchOp[], declaredOutputs: PatchPath[], path: PatchPath, before: number, after: number): void {
  if (before === after) return;
  ops.push({ op: "set", path, value: after });
  declaredOutputs.push(path);
}

/** Estimate ledger entry + balance decrement, committed via the reducer (never a direct write) — R10's "hard-stop before, actuals after" estimate half. */
function buildEstimatePatch(
  ledger: BudgetLedgerDocument,
  node: CompiledRunNode,
  decision: AutonomyDecisionDetail,
  sessionId: string,
  now: string,
): { patch: StatePatch; entryId: string } | undefined {
  if (
    decision.estimateAmount === undefined ||
    decision.budgetUnit === undefined ||
    decision.budgetPeriod === undefined ||
    decision.estimateCurrency === undefined
  )
    return undefined;
  const entryId = `ledger.${sessionId}.${randomUUID().slice(0, 8)}`;
  const entry = {
    id: entryId,
    unit: decision.budgetUnit,
    domainId: node.domainId,
    nodeRef: node.id,
    period: decision.budgetPeriod,
    estimate: { amount: decision.estimateAmount, currency: decision.estimateCurrency, declaredAt: now },
    actual: null,
    status: "estimated",
    ...(decision.waiverId ? { waiverRef: decision.waiverId } : {}),
    auditRef: `audit.${entryId}`,
  };
  const ops: PatchOp[] = [{ op: "append", path: ["entries"], value: entry }];
  const declaredOutputs: PatchPath[] = [["entries"]];
  const balanceIndex = ledger.balances.findIndex((balance) => balance.unit === decision.budgetUnit && balance.period === decision.budgetPeriod);
  if (balanceIndex >= 0) {
    const balance = ledger.balances[balanceIndex]!;
    const committed = balance.committed + decision.estimateAmount;
    const remaining = balance.allocated - committed - balance.spent;
    pushIfChanged(ops, declaredOutputs, ["balances", String(balanceIndex), "committed"], balance.committed, committed);
    pushIfChanged(ops, declaredOutputs, ["balances", String(balanceIndex), "remaining"], balance.remaining, remaining);
    ops.push({ op: "set", path: ["balances", String(balanceIndex), "updatedAt"], value: now });
    declaredOutputs.push(["balances", String(balanceIndex), "updatedAt"]);
  }
  return {
    entryId,
    patch: {
      schemaVersion: "1.0.0",
      patchId: nextPatchId(sessionId),
      targetDoc: "budget-ledger",
      reason: `Recording estimated spend for ${node.title}`,
      authoredBy: sessionId,
      authoredAt: now,
      preconditions: [],
      ops,
      declaredOutputs,
    },
  };
}

/**
 * Actual recording after execution. The fixture/no-op executors carry no cost-reporting field
 * (NodeExecutionResult is {status, outputs, evidence, error?} per the U5 contract), so the actual
 * is recorded equal to the estimate — a deliberate, named placeholder until U6's real executor can
 * report a true actual.
 */
function buildActualPatch(
  ledger: BudgetLedgerDocument,
  entryId: string,
  node: CompiledRunNode,
  decision: AutonomyDecisionDetail,
  sessionId: string,
  now: string,
): StatePatch | undefined {
  if (decision.estimateAmount === undefined || decision.budgetUnit === undefined || decision.estimateCurrency === undefined) return undefined;
  const entryIndex = ledger.entries.findIndex((entry) => entry.id === entryId);
  if (entryIndex < 0) return undefined;
  const amount = decision.estimateAmount;
  const ops: PatchOp[] = [
    { op: "set", path: ["entries", String(entryIndex), "actual"], value: { amount, currency: decision.estimateCurrency, recordedAt: now } },
    { op: "set", path: ["entries", String(entryIndex), "status"], value: "actualized" },
  ];
  const declaredOutputs: PatchPath[] = [
    ["entries", String(entryIndex), "actual"],
    ["entries", String(entryIndex), "status"],
  ];
  const balanceIndex = ledger.balances.findIndex((balance) => balance.unit === decision.budgetUnit && balance.period === decision.budgetPeriod);
  if (balanceIndex >= 0) {
    const balance = ledger.balances[balanceIndex]!;
    const committed = Math.max(0, balance.committed - amount);
    const spent = balance.spent + amount;
    const remaining = balance.allocated - committed - spent;
    pushIfChanged(ops, declaredOutputs, ["balances", String(balanceIndex), "committed"], balance.committed, committed);
    pushIfChanged(ops, declaredOutputs, ["balances", String(balanceIndex), "spent"], balance.spent, spent);
    pushIfChanged(ops, declaredOutputs, ["balances", String(balanceIndex), "remaining"], balance.remaining, remaining);
    ops.push({ op: "set", path: ["balances", String(balanceIndex), "updatedAt"], value: now });
    declaredOutputs.push(["balances", String(balanceIndex), "updatedAt"]);
  }
  return {
    schemaVersion: "1.0.0",
    patchId: nextPatchId(sessionId),
    targetDoc: "budget-ledger",
    reason: `Recording actual spend for ${node.title}`,
    authoredBy: sessionId,
    authoredAt: now,
    preconditions: [],
    ops,
    declaredOutputs,
  };
}

function orphanSentence(event: OrphanEvent, title: string): string {
  return event.resolution === "ready"
    ? `"${title}" didn't finish cleanly last session — I'll try it again this time.`
    : `"${title}" didn't finish cleanly last session, and I can't safely retry it blind — I need to check what actually happened before touching it again.`;
}

/**
 * computeFrontier() only ever returns the current ready frontier, not the full dependency
 * closure, so a scoped session's own entry chain can be permanently stuck: an in-scope node
 * whose only unmet dependency sits in a different, out-of-scope domain never becomes ready at
 * all, and the dispatch loop used to just break with no explanation once scope-filtering emptied
 * readyIds. This walks the dependency chain from every not-yet-succeeded in-scope node (not just
 * the current ready set) to find the titles of out-of-scope nodes actually blocking it, so that
 * case can be reported by name instead of silently doing nothing.
 *
 * This deliberately does NOT flag an out-of-scope node that happens to be ready but isn't a
 * dependency of anything in scope -- that is ordinary parallel work for a different session, not
 * a blocker, and a scoped session correctly leaves it untouched without comment (see
 * "session: scope hints restrict this session..." in checks/verification/fixtures/session.fixtures.ts).
 */
function findOutOfScopeBlockers(plan: CompiledPlan, run: RunStateDocument, scopeHints: readonly string[]): string[] {
  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  const blockingTitles = new Set<string>();
  const visited = new Set<string>();

  const walk = (nodeId: RunNodeId): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return;
    for (const dependencyId of node.dependencies) {
      if (run.nodes[dependencyId]?.status === "succeeded") continue;
      const dependencyNode = nodesById.get(dependencyId);
      if (!dependencyNode) continue;
      if (nodeInScope(scopeHints, dependencyNode.domainId, dependencyNode.workflowId)) {
        walk(dependencyId);
      } else {
        blockingTitles.add(dependencyNode.title);
      }
    }
  };

  for (const node of plan.nodes) {
    if (run.nodes[node.id]?.status === "succeeded") continue;
    if (!nodeInScope(scopeHints, node.domainId, node.workflowId)) continue;
    walk(node.id);
  }

  return [...blockingTitles];
}

/**
 * Layer 3 disclosure, never a gate (R14/AGENTS.md "Autonomy Trust Boundary"): once any granted
 * business unit sits above the lowest level, the founder is relying on control/'s OS write
 * protection to make that grant a real limit rather than a suggestion. If verifyControlBoundary
 * hasn't proven that boundary is genuinely `enforced`, the founder is told in plain terms — this
 * never blocks dispatch, and stays silent when every grant is at the lowest level (nothing to
 * disclose). Pure and exported so it's testable without spawning a session subprocess; run.ts's
 * own main() is the only caller in production.
 */
export function buildControlBoundaryAnomaly(control: ControlFile, verdict: ControlBoundaryVerdict, command: string): DigestAnomaly | undefined {
  if (verdict.state === "enforced") return undefined;
  const units = new Set<string>();
  for (const domainId of grantableDomainIds) {
    const grant = control.grants[domainId];
    if (!grant || grant.level === "review-first") continue;
    units.add(domainBusinessUnit(domainId));
  }
  if (units.size === 0) return undefined;
  const unitList = [...units].sort().join(", ");
  return {
    message: `I'm set up to act on my own for ${unitList}, but the folder that holds those permissions isn't locked down yet, so those limits are guidance rather than a hard stop. Here's the one command that fixes it: ${command}`,
  };
}

export interface SessionInvocation {
  workspace: string;
  sessionId: string;
  brief: SessionBrief;
  expectedRevision: string;
  requestId: string;
  requestDigest: string;
  maxConcurrency: number;
  wallClockSeconds: number;
}
export interface SessionHost {
  operationRoutes?: import("./operation-routes.js").OperationRouteRegistry;
}
interface InternalSessionHost extends SessionHost {
  brief?: SessionBrief;
  notifications?: boolean;
  request?: { id: string; digest: string; expectedRevision: string };
  result?: import("../schema/types.js").PublicSessionResult;
  replayed?: boolean;
  refusal?: string;
}
export async function runSession(
  input: SessionInvocation,
  dependencies: SessionHost = {},
): Promise<import("../schema/types.js").PublicSessionResult & { replayed: boolean }> {
  const host: InternalSessionHost = {
    ...dependencies,
    brief: input.brief,
    notifications: false,
    request: { id: input.requestId, digest: input.requestDigest, expectedRevision: input.expectedRevision },
  };
  const code = await runSessionCore(
    {
      workspace: input.workspace,
      brief: "internal",
      session: input.sessionId,
      "max-concurrency": String(input.maxConcurrency),
      "wall-clock-seconds": String(input.wallClockSeconds),
      "lock-retries": "0",
    },
    host,
  );
  if (host.refusal) throw new Error(host.refusal);
  if (!host.result) throw new Error(code ? "business.session_refused" : "business.session_result_missing");
  return { ...host.result, replayed: host.replayed ?? false };
}
async function main(): Promise<number> {
  return runSessionCore(parseArgs(process.argv.slice(2)), { notifications: true });
}
async function runSessionCore(args: Record<string, string | undefined>, host: InternalSessionHost): Promise<number> {
  if (Object.hasOwn(args, "catalog")) {
    if (!host.request) console.error("session.unsupported_argument: --catalog is not supported. Use composition activation to change the workspace pin.");
    return 1;
  }

  const missing = ["workspace", "brief", "session"].filter((name) => !args[name]);
  if (missing.length > 0) {
    if (!host.request) console.error(`session.missing_argument: --${missing.join(", --")} ${missing.length === 1 ? "is" : "are"} required`);
    return 1;
  }

  const maxConcurrency = Number(args["max-concurrency"] ?? 4);
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) {
    if (!host.request) console.error("session.invalid_concurrency: --max-concurrency must be a positive integer");
    return 1;
  }

  const resolvedWorkspace = resolveCliWorkspace(args.workspace!);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  const paths = resolveWorkspacePaths(workspace);
  // Invalid catalog pins are a read-only refusal. Keep this outside finish(), which
  // writes a digest and can send email, and before even creating the run or lock directory.
  let compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) {
    if (!host.request) console.error(renderCatalogRefusal(compatible.refusal));
    return 1;
  }
  // runstate.ts's writeAtomic (unlike the reducer's writer) does not create parent directories.
  if (!host.request) mkdirSync(path.dirname(paths.runState), { recursive: true });
  const sessionId = args.session!;
  const startedAt = args.now ?? new Date().toISOString();
  let executor: NodeExecutor = noOpExecutor;

  let lockAcquired = false;
  let brief: SessionBrief | undefined;
  let invocationRun: RunStateDocument | undefined;
  const anomalies: DigestAnomaly[] = [];

  const finish = async (
    outcome: DigestOutcome,
    extra: { advanced?: DigestAdvancedItem[]; parked?: DigestParkedItem[]; spend?: DigestSpendLine[] } = {},
    exitCode = 0,
  ): Promise<number> => {
    host.result = {
      runId: invocationRun?.runId ?? null,
      planId: invocationRun?.planId ?? null,
      outcome,
      completed: extra.advanced?.length ?? 0,
      held: extra.parked?.length ?? 0,
    };
    if (host.request && invocationRun && lockAcquired) {
      const record = invocationRun.publicRequests?.[host.request.id];
      if (record) {
        record.status = "completed";
        record.result = host.result;
        writeRunState(paths.runState, invocationRun);
        writeCheckpoint(
          paths.checkpoint,
          buildCheckpoint(
            invocationRun,
            sessionId,
            `checkpoint:${invocationRun.planId}:${invocationRun.runId}:${invocationRun.updatedAt}`,
            invocationRun.updatedAt,
          ),
        );
      }
    }
    if (host.request && !invocationRun) {
      host.refusal = "business.preflight_refused";
      if (lockAcquired) {
        releaseLock(paths.sessionLock, sessionId);
        lockAcquired = false;
      }
      return exitCode || 1;
    }
    const endedAt = new Date().toISOString();
    const businessSlug = brief?.businessSlug ?? path.basename(workspace);
    const loadedAppReview = readAppReviewState(paths.appReview);
    let appReview: DigestInput["appReview"];
    switch (loadedAppReview.status) {
      case "missing":
        appReview = undefined;
        break;
      case "ok":
        {
          const founder = projectAppReviewForFounder(loadedAppReview.state);
          appReview = { summary: founder.summary, caseLines: founder.caseLines };
        }
        break;
      case "invalid":
        anomalies.push({ message: INVALID_APP_REVIEW_WATCH_SUMMARY });
        appReview = { summary: INVALID_APP_REVIEW_WATCH_SUMMARY };
        break;
      default: {
        const exhaustive: never = loadedAppReview;
        throw new Error(`Unhandled App Review load status ${String(exhaustive)}`);
      }
    }
    const input: DigestInput = {
      sessionId,
      businessSlug,
      startedAt,
      endedAt,
      outcome,
      advanced: extra.advanced ?? [],
      parked: extra.parked ?? [],
      spend: extra.spend ?? [],
      anomalies,
      appReview,
    };
    const rendered = renderDigest(input);
    const to = host.notifications ? brief?.founderContact?.email : undefined;
    if (to) {
      const push = await pushDigest(rendered, to);
      if (push.attempted && push.ok === false)
        anomalies.push({
          message: `I tried to email you this update and it didn't go through (${push.error ?? "an unknown error"}). It's still saved in this business's digests folder.`,
        });
      input.push = push;
    } else {
      input.push = { attempted: false, skippedReason: "no founder contact on file" };
    }
    const final = renderDigest(input);
    writeDigestFile(workspace, sessionId, final.markdown);
    if (lockAcquired) {
      try {
        releaseLock(paths.sessionLock, sessionId);
      } catch {
        /* best effort: a digest was written regardless */
      }
    }
    return exitCode;
  };

  try {
    try {
      brief = host.brief ?? loadBrief(resolveCallerPath(args.brief!));
    } catch (error) {
      const reason = error instanceof BriefInvalid ? error.issues.join("; ") : error instanceof Error ? error.message : String(error);
      anomalies.push({ message: `I couldn't read the session instructions I was given (${reason}), so I stopped before touching anything.` });
      return await finish("workspace_not_ready", {}, 1);
    }

    const executorMode = args.executor ?? "auto";
    const requestedWorkerRuntime = args["worker-runtime"] ?? brief.workerRuntime ?? process.env.B2C_APP_BUILDER_WORKER_RUNTIME?.trim() ?? "auto";
    if (!["auto", "claude", "codex", "cursor"].includes(requestedWorkerRuntime)) {
      anomalies.push({
        message: `The requested worker runtime "${requestedWorkerRuntime}" is not one of auto, claude, codex, or cursor (set --worker-runtime, the brief's workerRuntime, or B2C_APP_BUILDER_WORKER_RUNTIME), so I stopped before dispatching anything.`,
      });
      return await finish("workspace_not_ready", {}, 1);
    }
    const workerRuntime = requestedWorkerRuntime as WorkerRuntime;
    const operationRoutes = host.operationRoutes ?? (executorMode === "auto" ? createFirstpartyWorkerRoutes(compatible.catalog, workerRuntime) : undefined);
    executor =
      executorMode === "fixture"
        ? createFixtureExecutor()
        : executorMode === "slow-silent"
          ? createSlowSilentExecutor(Number(args["slow-delay-ms"] ?? 2000))
          : executorMode === "noop"
            ? noOpExecutor
            : createCliExecutor(workerRuntime, operationRoutes);
    // Fresh-context verification is part of a session, not a separate ceremony someone must
    // remember: the sweep below dispatches an independent judge for produced-but-unaccepted work.
    // "off" is an explicit diagnostic override and is reported honestly in the digest — before
    // this seam existed, every fresh-context node was a structural dead end (produced, parked
    // "Verification required" forever) while the digest implied a check was underway.
    // The default FOLLOWS the executor mode: a diagnostic session (fixture/slow-silent/noop
    // executor) must never quietly spawn a real worker CLI to judge synthetic work — on a
    // machine with codex/claude installed that would make fixture runs slow, nondeterministic,
    // and silently expensive. Only a real session defaults to the real verifier.
    const verifierMode = args.verifier ?? (executorMode === "fixture" ? "fixture" : executorMode === "auto" ? "cli" : "off");
    const rejectedFixtureNodes = new Set<string>();
    const verifier: NodeVerifier | undefined =
      verifierMode === "off"
        ? undefined
        : verifierMode === "fixture"
          ? createFixtureVerifier()
          : ["fixture-reject-once", "fixture-repair-reviewed-once"].includes(verifierMode) && executorMode === "fixture"
            ? {
                async verify(node, context) {
                  const verdict =
                    rejectedFixtureNodes.has(node.id) || (verifierMode === "fixture-repair-reviewed-once" && !node.reviewOf?.length) ? "accepted" : "rejected";
                  rejectedFixtureNodes.add(node.id);
                  const outcome = await createFixtureVerifier(verdict).verify(node, context);
                  return {
                    ...outcome,
                    ...(verdict === "rejected" && verifierMode === "fixture-repair-reviewed-once"
                      ? { repairWorkflowIds: node.reviewOf!.map((id) => `workflow.${id.slice("run.".length)}`) }
                      : {}),
                  };
                },
              }
            : verifierMode === "fixture-reject"
              ? createFixtureVerifier("rejected")
              : createCliVerifier(workerRuntime, operationRoutes);

    const lockTtlSeconds = Number(args["lock-ttl-seconds"] ?? 120);
    const acquireResult: AcquireResult = acquireLock(paths.sessionLock, {
      ownerSessionId: sessionId,
      ttlSeconds: lockTtlSeconds,
      retries: Number(args["lock-retries"] ?? 3),
      retryDelayMs: Number(args["lock-retry-delay-ms"] ?? 100),
      breakStale: args["break-stale-verified"] === "true",
    });
    if (!acquireResult.ok) {
      if (host.request) {
        host.refusal = "business.session_lock_unavailable";
        return 2;
      }
      const outcome: DigestOutcome = acquireResult.reason === "held" ? "did_not_run_lock_held" : "did_not_run_lock_stale";
      anomalies.push({
        message: `Another session (or one that may not have shut down cleanly) already had this business locked, so I backed off rather than risk a collision.`,
      });
      return await finish(outcome, {}, 2);
    }
    lockAcquired = true;
    if (host.request) {
      const existing = existsSync(paths.runState) ? loadRunState(paths.runState) : undefined;
      const previous =
        existing?.publicRequests && Object.hasOwn(existing.publicRequests, host.request.id) ? existing.publicRequests[host.request.id] : undefined;
      if (previous) {
        host.refusal =
          previous.requestDigest !== host.request.digest
            ? "business.request_conflict"
            : previous.status !== "completed" || !previous.result
              ? "business.request_recovery_required"
              : undefined;
        if (!host.refusal) {
          host.result = previous.result;
          host.replayed = true;
        }
        releaseLock(paths.sessionLock, sessionId);
        lockAcquired = false;
        return host.refusal ? 4 : 0;
      }
      if (Object.values(existing?.publicRequests ?? {}).some((record) => record.status === "running")) {
        host.refusal = "business.request_recovery_required";
        releaseLock(paths.sessionLock, sessionId);
        lockAcquired = false;
        return 4;
      }
      if (workspaceRevision(workspace) !== host.request.expectedRevision) {
        host.refusal = "business.stale_revision";
        releaseLock(paths.sessionLock, sessionId);
        lockAcquired = false;
        return 4;
      }
      compatible = loadWorkspaceCatalog(workspace);
      if (!compatible.ok) {
        host.refusal = "business.catalog_unavailable";
        releaseLock(paths.sessionLock, sessionId);
        lockAcquired = false;
        return 4;
      }
    }

    if (!tamperCheckPasses(paths)) {
      anomalies.push({
        message:
          "This business's saved files don't match what I last recorded — something changed them outside of my normal process. I stopped before making anything worse.",
      });
      return await finish("preflight_failed", {}, 3);
    }

    const control = loadControlFile(paths.control);
    if (!control) {
      anomalies.push({ message: "This business isn't set up yet — I couldn't find its control settings." });
      return await finish("workspace_not_ready", {}, 1);
    }
    // No refusal for an ungranted business: zero grants is an ordinary cold start, not a broken
    // workspace. plan.ts and bootstrap.ts both report it and exit 0, and control.json cannot tell
    // "never onboarded" from an onboard whose `units` was empty, so a grants-empty refusal would
    // eventually reject a genuinely onboarded business. Every node parks through the ordinary
    // evaluator path and the digest explains the missing authority in founder language.

    // Disclosure, not a gate (see buildControlBoundaryAnomaly's doc comment): evaluated every
    // session, before dispatch and before the kill switch even short-circuits, so a standing
    // configuration gap is surfaced regardless of whether work happens this run.
    const boundaryVerdict = verifyControlBoundary(workspace);
    const boundaryCommand = `tsx ${path.join(skillRoot(), "adapters/install-control-permissions.ts")} --workspace ${workspace} --apply`;
    const boundaryAnomaly = buildControlBoundaryAnomaly(control, boundaryVerdict, boundaryCommand);
    if (boundaryAnomaly) {
      // Technical detail stays in the run log; the digest only ever gets the founder-plain sentence.
      if (!host.request)
        console.error(
          `session.control_boundary: state=${boundaryVerdict.state} agentUidDiffers=${boundaryVerdict.agentUidDiffers} mode=${boundaryVerdict.controlMode} ownerUid=${boundaryVerdict.ownerUid} processUid=${boundaryVerdict.processUid} reasons=${JSON.stringify(boundaryVerdict.reasons)}`,
        );
      anomalies.push(boundaryAnomaly);
    }

    if (control.killSwitch.engaged) {
      return await finish("parked_kill_switch", {}, 0);
    }

    const businessState = loadBusinessStateFile(paths.state);
    if (!businessState) {
      anomalies.push({ message: "This business isn't set up yet — I couldn't find its saved progress." });
      return await finish("workspace_not_ready", {}, 1);
    }

    const sessionNow = () => new Date().toISOString();
    let ledger = loadLedgerFile(paths.ledger, startedAt);
    const catalog = compatible.catalog;
    const explicitCatalogVersion = brief.expectedCatalogVersion ?? process.env.B2C_EXPECTED_CATALOG_VERSION;
    const installedCatalogVersion = runtimeCatalogVersion(workspace);
    if (explicitCatalogVersion && installedCatalogVersion && explicitCatalogVersion !== installedCatalogVersion) {
      throw new Error(`catalog.version_binding_conflict: brief expected ${explicitCatalogVersion}, installed runtime expected ${installedCatalogVersion}`);
    }
    assertCatalogCompatibility(catalog, explicitCatalogVersion ?? installedCatalogVersion);
    const plan = compilePlan(catalog, startedAt);

    // budget_funded closes over this ledger snapshot (captured once, before dispatch starts) —
    // see kernel/autonomy/probes/budget.ts's doc comment on why a snapshot is the correct semantics
    // for a "verified at most once per session" prerequisite, not a live-reread.
    const prerequisiteVerifier = createCompositeVerifier({
      doppler_auth: createDopplerAuthVerifier({
        project: args["doppler-project"] ?? control.businessSlug,
        config: args["doppler-config"] ?? "production",
        secretsMdPath: args["secrets-md"] ?? path.join(workspace, "SECRETS.md"),
      }),
      budget_funded: createBudgetFundedVerifier(ledger),
    });

    const wallClockCapSeconds = Number(args["wall-clock-seconds"] ?? brief.wallClockSecondsOverride ?? 1800);

    const resumedExistingRun = existsSync(paths.runState);
    let run = (() => {
      if (resumedExistingRun) {
        const existing = loadRunState(paths.runState);
        if (existing.planId !== plan.planId) {
          anomalies.push({ message: "The plan changed. I preserved prior attempts and approvals, and reopened work whose evidence no longer satisfies it." });
          return reconcileRunPlan(plan, existing, businessState, { ownerSessionId: sessionId, ttlSeconds: 300, wallClockCapSeconds, now: startedAt });
        }
        return existing;
      }
      return undefined;
    })();

    let orphanEvents: OrphanEvent[] = [];
    if (run) {
      run.ownerSessionId = sessionId;
      run.wallClockCapSeconds = wallClockCapSeconds;
      orphanEvents = detectOrphans(plan, run, startedAt);
      for (const event of orphanEvents) {
        const title = plan.nodes.find((node) => node.id === event.nodeId)?.title ?? event.nodeId;
        anomalies.push({ message: orphanSentence(event, title) });
      }
    } else {
      run = seedRunState(plan, businessState, { ownerSessionId: sessionId, ttlSeconds: 300, wallClockCapSeconds, now: startedAt });
    }
    if (host.request) {
      invocationRun = run;
      (run.publicRequests ??= {})[host.request.id] = { requestDigest: host.request.digest, sessionId, status: "running" };
      writeRunState(paths.runState, run);
    }
    // Signed design authority is optional for work that does not need it, but once a run binds
    // trust it must revalidate the exact external store and audit edge before any worker starts.
    // A store that appears after an unbound run began cannot retroactively become that run's
    // trust root. The autonomous process also proves that its OS identity cannot replace the
    // founder-owned public-key store. The public key is readable by design; workers never receive
    // the launcher path override or any private signing material.
    let founderTrustStore: LoadedFounderTrustStore | undefined;
    const founderTrustPath = resolveFounderTrustFile();
    const founderTrustConfigured = Boolean(process.env[FOUNDER_TRUST_FILE_ENV]?.trim()) || existsSync(founderTrustPath);
    if (run.founderDecisionTrust || founderTrustConfigured) {
      founderTrustStore = loadFounderTrustStore({ role: "autonomous_session" });
      if (run.founderDecisionTrust) {
        assertFounderTrustBinding(run, { workspaceRoot: workspace, auditPath: paths.audit, store: founderTrustStore });
      } else if (!resumedExistingRun) {
        bindFounderTrustToNewRun(run, {
          workspaceRoot: workspace,
          auditPath: paths.audit,
          runStatePath: paths.runState,
          sessionId,
          store: founderTrustStore,
          boundAt: startedAt,
        });
      } else {
        recoverFounderTrustBindingFromAudit(run, { workspaceRoot: workspace, auditPath: paths.audit, store: founderTrustStore });
      }
    }
    // Producer-less artifacts (the workspace's own files) accept from disk presence — without
    // this, a fresh business's plan has no root nodes at all. Runs on resume too, so a
    // precondition that changed between sessions invalidates its descendants before dispatch.
    reconcileEnvironmentalArtifacts(plan, run, workspace, startedAt);
    // The operating loop: recurring nodes (weekly ops review, growth iteration) whose cadence
    // has elapsed reopen before the frontier is computed, so a scheduled session finds the
    // standing work on its own calendar instead of the founder having to re-ask for it.
    reopenRecurringNodes(plan, run, startedAt);
    reopenNodesForAuthorizedWorkOrders(plan, run, startedAt);
    const dueReviews = dueWorkOrderReviews(run, startedAt);
    if (dueReviews.length > 0) {
      appendAuditEntry(paths.audit, {
        sessionId,
        targetDoc: "run-state",
        patchId: `work-order-review:${sessionId}`,
        action: "work_order_review_due",
        summary: dueReviews.map((occurrence) => occurrence.id).join(","),
        stateHash: "",
        issueCodes: [],
      });
    }
    observeAppSourceFingerprint(plan, run, workspace, startedAt);
    invalidateStaleReviews(plan, run, workspace, startedAt);
    writeRunState(paths.runState, run);

    const dispatchHooks: DispatchHooks = createDispatchHooks({
      loadControl: () => loadControlFile(paths.control)!,
      lockPath: paths.sessionLock,
      ownerSessionId: sessionId,
    });
    // Pass the ledger as a live accessor, not a snapshot: `ledger` is reassigned after every
    // spend commit below, and the evaluator must see the true remaining balance so independently
    // scoped spend nodes cannot each pass the hard-stop while collectively overrunning the budget (R10).
    const evaluator = createAutonomyEvaluator({
      grants: control.grants,
      waivers: control.waivers,
      ledger: () => ledger,
      prerequisiteVerifier,
      runId: run.runId,
      authority: catalog.authority,
    });
    const decisions = new Map<string, AutonomyDecisionDetail>();
    const captured = withCapture(evaluator, decisions);

    const advanced: DigestAdvancedItem[] = [];
    let haltReason: BatchHaltReason | undefined;
    let timedOut = false;

    /**
     * Fresh-context verification sweep, run at every empty-frontier point inside the dispatch
     * loop: an accepted node re-opens the frontier, so downstream work dispatches in THIS
     * session instead of parking until the next one. The judge is a separate verifier session
     * id that owns no attempts (the same refusal rules kernel/session/verify.ts enforces, from the
     * shared module), its worker runs in a fresh subprocess context, and every acceptance is
     * attested in the hash-chained audit log exactly like the operator CLI's. Accepted work and
     * bounded queued repair count as progress. An unavailable verifier or exhausted repair
     * budget leaves no new dispatch work, so the caller stops.
     */
    const verifierSessionId = `${sessionId}.verifier`;
    const scopedRefreshDependencyIds = new Set<RunNodeId>();
    const failedScopedRefreshDependencyIds = new Set<RunNodeId>();
    // A cooperative yield's final sweep is deliberately narrower than an ordinary empty-frontier
    // sweep. It may judge only exact attempts that THIS session moved into fresh-context pending
    // state in a fully completed dispatch batch. Older durable pending work remains discoverable
    // by ordinary sweeps, but a yield before any batch must not opportunistically judge it.
    const cooperativeYieldCandidateAttempts = new Map<RunNodeId, string>();
    const runVerificationSweep = async (allowCooperativeYield = false, candidateAttempts?: ReadonlyMap<RunNodeId, string>): Promise<number> => {
      if (!verifier) return 0;
      const allPending = listPendingSessionReviews(plan, run);
      const allPendingSet = new Set(allPending);
      // Retire an exact candidate only when that attempt is no longer the pending attempt. A
      // still-pending, unvisited candidate survives a boundary interruption for the final sweep.
      for (const [nodeId, attemptId] of cooperativeYieldCandidateAttempts) {
        const latestAttempt = run.nodes[nodeId]?.attempts.at(-1);
        if (!allPendingSet.has(nodeId) || latestAttempt?.id !== attemptId) cooperativeYieldCandidateAttempts.delete(nodeId);
      }
      const pending = allPending.filter((nodeId) => {
        const node = plan.nodes.find((candidate) => candidate.id === nodeId)!;
        const inScope = nodeInScope(brief!.scopeHints, node.domainId, node.workflowId) || scopedRefreshDependencyIds.has(nodeId);
        if (!inScope) return false;
        if (!candidateAttempts) return true;
        return candidateAttempts.get(nodeId) === run.nodes[nodeId]?.attempts.at(-1)?.id;
      });
      let progressCount = 0;
      for (const nodeId of pending) {
        if (deferredSharedReviews.has(nodeId)) continue;
        if (isWallClockExceeded(run, sessionNow(), startedAt)) {
          timedOut = true;
          break;
        }
        let boundary;
        try {
          boundary = checkBatchBoundary(dispatchHooks);
        } catch {
          haltReason = "kill_switch";
          break;
        }
        if (boundary.halt && !(allowCooperativeYield && boundary.reason === "cooperative_yield")) {
          haltReason = boundary.reason;
          break;
        }
        heartbeat(paths.sessionLock, sessionId);
        const node = plan.nodes.find((candidate) => candidate.id === nodeId)!;
        const state = run.nodes[nodeId]!;
        const attempt = state.attempts.at(-1);
        const rejectionOnly = hasCurrentFailedAuditGates(plan, run, nodeId);
        const refusal = refuseFreshContextAcceptance(plan, run, nodeId, verifierSessionId);
        if (refusal && !(rejectionOnly && refusal.code === "gates_required")) {
          // The sweep listed this node moments ago, so a refusal here is an internal
          // inconsistency worth an operator's eyes — never silently skipped.
          if (!host.request) console.error(`session.verify_refused ${nodeId}: ${refusal.code}: ${refusal.message}`);
          continue;
        }
        const outputs: VerifierOutputRef[] = node.outputs.map((artifactId) => {
          const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId);
          return { artifactId, path: binding?.path ?? "", evidence: attempt?.evidence ?? [] };
        });
        let reviewReceipt;
        try {
          reviewReceipt = captureReviewEvidence(
            plan,
            run,
            nodeId,
            workspace,
            verifierSessionId,
            sessionNow(),
            attempt?.proofSource === "synthetic" ? "synthetic" : "workspace",
          );
        } catch {
          const repairAt = sessionNow();
          const findings = ["Review evidence is missing or changed; restore the current artifacts and criteria before review."];
          progressCount += DESIGN_AUDIT_WORKFLOW_IDS.has(node.workflowId)
            ? queueDesignAuditOnlyRetry(plan, run, nodeId, findings, repairAt)
            : requestVerificationRepair(plan, run, nodeId, findings, repairAt).length;
          writeRunState(paths.runState, run);
          anomalies.push({ message: `I could not verify the current files for "${node.title}", so its work remains incomplete.` });
          continue;
        }
        const reviewClaims: SharedClaim[] = [];
        const reviewTtl = Math.min(86400, Math.max(node.ttlSeconds, lockTtlSeconds));
        for (const resource of [...(node.sharedResources ?? [])].sort()) {
          const acquired = acquireSharedClaim({
            home: sharedHome,
            resource,
            workspaceId: sharedWorkspaceIdentity(),
            occurrenceId: `${run.runId}:${nodeId}:${attempt?.id}:review`,
            ttlSeconds: reviewTtl,
            now: sessionNow(),
          });
          if (!acquired.ok) {
            for (const claim of reviewClaims) releaseSharedClaim(sharedHome, claim, { now: sessionNow() });
            deferredSharedReviews.add(nodeId);
            anomalies.push({
              message: `The shared device or provider project for the independent check of "${node.title}" is unavailable. I kept its review pending.`,
            });
            break;
          }
          reviewClaims.push(acquired.claim);
        }
        if (deferredSharedReviews.has(nodeId)) continue;
        let reviewOwnershipLost = false;
        let reviewReconciled = false;
        const assertReviewOwnership = (): void => {
          if (reviewOwnershipLost) throw new Error("shared_claim.ownership_lost");
          for (const claim of reviewClaims) assertSharedClaim(sharedHome, claim, sessionNow());
        };
        const parkReviewReadback = (): void => {
          deferredSharedReviews.add(nodeId);
          state.status = "needs_readback";
          state.blocker = "A shared resource needs reconciliation before independent review can resume.";
          state.acceptedOutputFingerprint = undefined;
          state.verifiedBySessionId = undefined;
          if (attempt) {
            attempt.status = "needs_readback";
            attempt.finishedAt = sessionNow();
            attempt.independentVerification = undefined;
          }
          for (const binding of run.artifactBindings) if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
          invalidateDescendants(plan, run, node.outputs, sessionNow());
          writeRunState(paths.runState, run);
        };
        const reviewRuntimeWrites = node.sourceAccess?.length || node.selectedOperation ? trackRuntimeWrites(workspace) : undefined;
        const reviewTimer = setInterval(
          () => {
            try {
              for (let index = 0; index < reviewClaims.length; index++)
                reviewClaims[index] = renewSharedClaim(sharedHome, reviewClaims[index]!, reviewTtl, sessionNow());
              if (reviewRuntimeWrites) reviewRuntimeWrites.write("control/session.lock", () => heartbeat(paths.sessionLock, sessionId));
              else heartbeat(paths.sessionLock, sessionId);
            } catch {
              reviewOwnershipLost = true;
            }
          },
          Math.max(50, (Math.min(reviewTtl, lockTtlSeconds) * 1000) / 3),
        );
        reviewTimer.unref();
        try {
          const reviewNode = rejectionOnly
            ? {
                ...node,
                instructions: `${node.instructions ?? ""}\n\nThe current attempt failed these mechanical checks: ${attempt!.deterministicVerification!.evidence.join("; ")}. This is a rejection-only review. Return rejected with actionable findings and repairWorkflowIds naming only declared reviewOf producers. The audit must never nominate itself. Do not accept the candidate, repair files, or weaken the checks.`,
              }
            : node;
          assertReviewOwnership();
          const outcome = await verifier.verify(reviewNode, {
            runtimeWrites: reviewRuntimeWrites?.snapshot,
            runId: run.runId,
            inputFingerprint: attempt?.inputFingerprint,
            workspaceDir: workspace,
            skillRootDir: skillRoot(),
            outputs,
            now: sessionNow(),
          });
          reviewRuntimeWrites?.assertIntact();
          assertReviewOwnership();
          // This exact candidate has now been judged (accepted/rejected) or attempted
          // (unavailable). Retire it individually; never clear the whole cohort, because a normal
          // sweep can be interrupted between candidates and the unvisited remainder still needs
          // the cooperative-yield final pass.
          cooperativeYieldCandidateAttempts.delete(nodeId);
          const judgedAt = sessionNow();
          const reviewIssues = validateReviewReceipt(plan, run, nodeId, reviewReceipt, workspace).filter(
            (issue) => !(rejectionOnly && hasCurrentFailedAuditGates(plan, run, nodeId) && issue === "review.gates_missing_or_stale"),
          );
          if (reviewIssues.length) {
            const findings = ["Artifacts or criteria changed during review; run the checks and review again."];
            progressCount += DESIGN_AUDIT_WORKFLOW_IDS.has(node.workflowId)
              ? queueDesignAuditOnlyRetry(plan, run, nodeId, findings, judgedAt)
              : requestVerificationRepair(plan, run, nodeId, findings, judgedAt).length;
            assertReviewOwnership();
            writeRunState(paths.runState, run);
            reviewReconciled = true;
            continue;
          }
          if (rejectionOnly && outcome.status === "accepted") {
            const evidence = [
              "Acceptance refused: the current attempt still has failed mechanical checks.",
              ...attempt!.deterministicVerification!.evidence,
              outcome.evidence,
            ];
            recordRejectedVerification(plan, run, nodeId, evidence, judgedAt, reviewReceipt, "failed");
            state.blocker = VERIFICATION_REJECTED_BLOCKER;
            const repaired = requestVerificationRepair(plan, run, nodeId, evidence, judgedAt);
            progressCount += repaired.length;
            run.updatedAt = judgedAt;
            anomalies.push({
              message: repaired.length
                ? `The independent check could not accept "${node.title}" while its required checks still fail. I queued its declared producer for repair.`
                : `The independent check could not accept "${node.title}" while its required checks still fail. I kept the work incomplete.`,
            });
          } else if (outcome.status === "accepted") {
            try {
              assertReviewOwnership();
              acceptVerification(plan, run, nodeId, [outcome.evidence], judgedAt, verifierSessionId, reviewReceipt, workspace);
            } catch (error) {
              if (reviewClaims.length) parkReviewReadback();
              if (!host.request) console.error(`session.verify_accept_failed ${nodeId}: ${error instanceof Error ? error.message : String(error)}`);
              continue;
            }
            assertReviewOwnership();
            appendAuditEntry(paths.audit, {
              sessionId: verifierSessionId,
              targetDoc: "run-state",
              patchId: `verify:${verifierSessionId}:${nodeId}`,
              action: "verification_accepted",
              summary: `${nodeId}: ${outcome.evidence}`,
              stateHash: "",
              issueCodes: [],
            });
            advanced.push({ nodeId, title: node.title, unit: domainBusinessUnit(node.domainId, catalog.authority) });
            progressCount += 1;
          } else if (outcome.status === "rejected") {
            recordRejectedVerification(
              plan,
              run,
              nodeId,
              [outcome.evidence],
              judgedAt,
              reviewReceipt,
              rejectionOnly ? "failed" : "checked",
            );
            state.blocker = VERIFICATION_REJECTED_BLOCKER;
            const repaired = requestVerificationRepair(plan, run, nodeId, [outcome.evidence], judgedAt, outcome.repairWorkflowIds);
            progressCount += repaired.length;
            run.updatedAt = judgedAt;
            anomalies.push({
              message: repaired.length
                ? `The review found unfinished work in "${node.title}". I queued its findings for repair under the current mandate.`
                : `The review found unfinished work in "${node.title}", and repair needs attention before it can continue.`,
            });
          } else {
            // Unavailable judged nothing: the node keeps its "Verification required" blocker so a
            // future session's sweep (or the operator CLI) picks it up, and this session says so.
            if (!host.request) console.error(`session.verifier_unavailable ${nodeId}: ${outcome.error ?? "unknown"}`);
            anomalies.push({
              message: `I finished "${node.title}" but couldn't run the independent double-check on it this session, so I'm not calling it done yet.`,
            });
          }
          assertReviewOwnership();
          writeRunState(paths.runState, run);
          reviewReconciled = true;
        } catch (error) {
          if (!reviewClaims.length) throw error;
          parkReviewReadback();
        } finally {
          clearInterval(reviewTimer);
          if (reviewReconciled) {
            try {
              assertReviewOwnership();
              for (const claim of reviewClaims) releaseSharedClaim(sharedHome, claim, { now: sessionNow() });
            } catch {
              if (reviewClaims.length) parkReviewReadback();
            }
          }
        }
      }
      return progressCount;
    };

    const sharedHome = b2cAppBuilderHome();
    const deferredSharedResources = new Map<RunNodeId, string>();
    const deferredSharedReviews = new Set<RunNodeId>();
    const sharedWaitReason = "A shared resource is in use; this work will resume in a later session.";
    // Only a contention deferral is automatically eligible next session. An uncertain
    // effect stays needs_readback until explicit recovery reconciles it.
    for (const node of plan.nodes) {
      const state = run.nodes[node.id];
      if (node.sharedResources?.length && state?.status === "blocked" && state.blocker === sharedWaitReason) {
        state.status = "pending";
        state.blocker = undefined;
      }
    }
    const sharedWorkspaceIdentity = (): string => {
      const canonical = realpathSync(workspace);
      const registered = loadRegistry().workspaces.find((entry) => {
        try {
          return realpathSync(entry.path) === canonical;
        } catch {
          return false;
        }
      });
      return registered ? `registered:${registered.id}` : `path:${createHash("sha256").update(canonical).digest("hex")}`;
    };
    dispatchLoop: while (true) {
      const now = sessionNow();
      if (isWallClockExceeded(run, now, startedAt)) {
        timedOut = true;
        break;
      }

      let boundary;
      try {
        boundary = checkBatchBoundary(dispatchHooks);
      } catch {
        anomalies.push({ message: "I couldn't confirm it was still safe to continue, so I stopped rather than guess." });
        haltReason = "kill_switch";
        break;
      }
      if (boundary.halt) {
        haltReason = boundary.reason;
        break;
      }
      // Re-run the tamper check at every batch boundary, not only at session start: a same-session
      // out-of-band edit to control/state/ledger (e.g. re-disabling a kill switch, self-granting)
      // or a forged audit entry is caught before the next batch dispatches, not next session (R14).
      if (!tamperCheckPasses(paths)) {
        anomalies.push({
          message:
            "Partway through, this business's saved files stopped matching what I recorded — something changed them outside my normal process. I stopped rather than continue on top of it.",
        });
        haltReason = "kill_switch";
        break;
      }
      heartbeat(paths.sessionLock, sessionId);

      observeAppSourceFingerprint(plan, run, workspace, sessionNow());
      invalidateStaleReviews(plan, run, workspace, sessionNow());
      // Applicability can change between sessions. Settle it before refresh mutates any accepted
      // dependency proof, so a newly deferred/not-needed consumer cannot spend a refresh attempt.
      reconcileWorkflowApplicability(plan, run, businessState, sessionNow());
      for (const node of plan.nodes) {
        const state = run.nodes[node.id];
        if (state && ["not_needed", "skipped"].includes(state.status)) {
          abandonDependencyRefreshesForConsumer(plan, run, node.id, sessionNow());
        }
      }
      applyStandingApprovals(plan, run, paths.agentOperations, sessionNow());
      const activeScopeHints = brief?.scopeHints;
      const scopedRefreshConsumers = refreshAdmissibleConsumerIds(plan, run, businessState, captured);
      if (activeScopeHints?.length) {
        for (const consumerId of [...scopedRefreshConsumers]) {
          const node = plan.nodes.find((candidate) => candidate.id === consumerId)!;
          if (!nodeInScope(activeScopeHints, node.domainId, node.workflowId)) scopedRefreshConsumers.delete(consumerId);
        }
      }
      if (scopedRefreshConsumers && failedScopedRefreshDependencyIds.size > 0) {
        for (const consumerId of [...scopedRefreshConsumers]) {
          const consumerNode = plan.nodes.find((node) => node.id === consumerId);
          if (consumerNode?.refreshDependencies.some((refresh) => failedScopedRefreshDependencyIds.has(refresh.nodeId))) {
            scopedRefreshConsumers.delete(consumerId);
          }
        }
      }
      if (scopedRefreshConsumers) {
        for (const consumerId of scopedRefreshConsumers) {
          const consumerNode = plan.nodes.find((node) => node.id === consumerId);
          const consumerState = run.nodes[consumerId];
          if (!consumerNode || !consumerState || !["pending", "ready", "stale"].includes(consumerState.status)) continue;
          const cycles = new Set(consumerState.dependencyRefreshCycles ?? []);
          for (const refresh of consumerNode.refreshDependencies) {
            const token = `${refresh.nodeId}@${consumerState.attempts.length}`;
            if (cycles.has(token) && run.nodes[refresh.nodeId]?.status !== "succeeded") scopedRefreshDependencyIds.add(refresh.nodeId);
          }
        }
      }
      const reopenedRefreshDependencies = refreshDependenciesBeforeFrontier(plan, run, sessionNow(), scopedRefreshConsumers);
      reopenNodesForAuthorizedWorkOrders(plan, run, sessionNow());
      for (const nodeId of reopenedRefreshDependencies) scopedRefreshDependencyIds.add(nodeId);
      writeRunState(paths.runState, run);
      const frontier = computeFrontier(plan, run, businessState, captured);
      let readyIds: RunNodeId[] = frontier.ready.filter((nodeId) => !failedScopedRefreshDependencyIds.has(nodeId) && !deferredSharedResources.has(nodeId));
      if (brief.scopeHints && brief.scopeHints.length > 0) {
        const inScope = readyIds.filter((id) => {
          const node = plan.nodes.find((candidate) => candidate.id === id)!;
          return nodeInScope(brief!.scopeHints, node.domainId, node.workflowId) || scopedRefreshDependencyIds.has(id);
        });
        // A scoped session dispatches nodes matching its scope plus the exact dependencies it
        // reopened for an in-scope consumer's declared refresh cycle. It never silently reaches
        // across that boundary for an ordinary prerequisite the founder did not grant this
        // session. When nothing in scope is currently ready, check
        // whether that's ordinary (an out-of-scope ready node with no bearing on this scope, or
        // the in-scope work is simply done -- both silent by design) or whether an in-scope node
        // is stuck behind an out-of-scope prerequisite that hasn't succeeded yet, in which case
        // the loop used to just break with no explanation. Report the blocker by title, not its
        // raw domainId -- an anomaly message reaches the founder through the same digest as
        // "advanced"/"parked" entries, and domainId values (e.g. "domain.money") are exactly what
        // the founder-copy internal-vocabulary blocklist exists to keep out of that surface.
        if (inScope.length === 0) {
          const blockingTitles = findOutOfScopeBlockers(plan, run, brief.scopeHints);
          if (blockingTitles.length > 0) {
            anomalies.push({
              message: `Nothing in this session's current scope is ready to run yet. Progress is waiting on other work outside this session's scope: ${blockingTitles.join(", ")}. Widen this session's scope, or run a session covering that work first, before retrying.`,
            });
          }
        }
        readyIds = inScope;
      }
      if (readyIds.length === 0) {
        // Nothing dispatchable — but produced work may be parked pending its fresh-context
        // check. Acceptance or bounded queued repair reopens the frontier. Otherwise stop
        // with the remaining blockers recorded. A halt or timeout uses the same boundary.
        const progressCount = await runVerificationSweep();
        if (progressCount > 0 && !timedOut && !haltReason) continue;
        break;
      }

      const batches = buildDispatchBatches(plan, readyIds, maxConcurrency);
      for (const batch of batches) {
        let innerBoundary;
        try {
          innerBoundary = checkBatchBoundary(dispatchHooks);
        } catch {
          anomalies.push({ message: "I couldn't confirm it was still safe to continue, so I stopped rather than guess." });
          haltReason = "kill_switch";
          break dispatchLoop;
        }
        if (innerBoundary.halt) {
          haltReason = innerBoundary.reason;
          break dispatchLoop;
        }
        heartbeat(paths.sessionLock, sessionId);

        // Snapshot before dispatch and register only the fresh-context pending delta after the
        // entire batch has durably reconciled. Registering inside the node loop would let a
        // partially completed batch leak into the cooperative-yield sweep.
        const pendingBeforeBatch = new Set(listPendingSessionReviews(plan, run));

        const outcomes = await Promise.allSettled(
          batch.nodeIds.map(async (nodeId) => {
            const node = plan.nodes.find((candidate) => candidate.id === nodeId)!;
            // Standing authority is time- and target-bound. Re-read it at the final dispatch seam,
            // after the batch boundary and immediately before any estimate or worker starts. A
            // revoked/expired envelope or changed planned action resets its sourced approvals to
            // pending, even when an earlier frontier pass had classified this node as ready.
            applyStandingApprovals(plan, run, paths.agentOperations, sessionNow());
            if (node.approvals.some((approval) => run.approvals[approval.id] !== "approved")) {
              const nodeState = run.nodes[nodeId];
              if (nodeState) {
                nodeState.status = "waiting_founder";
                nodeState.blocker = "Founder approval required";
                run.updatedAt = sessionNow();
                writeRunState(paths.runState, run);
              }
              return;
            }
            // Re-evaluate at the final dispatch seam. Frontier decisions are planning evidence,
            // not authority: grants, prerequisites, waivers, budgets, and time bounds may have
            // changed since that pass, just as standing envelopes may have above.
            const decision = captured.evaluate(node);
            if (!decision.allowed) {
              const nodeState = run.nodes[nodeId];
              if (nodeState) {
                nodeState.status = "blocked";
                nodeState.blocker = decision.parkReason ?? "Dispatch-time authority no longer permits this work.";
                run.updatedAt = sessionNow();
                writeRunState(paths.runState, run);
              }
              return;
            }

            const sharedClaims: SharedClaim[] = [];
            const sharedTtlSeconds = Math.min(86400, Math.max(node.ttlSeconds, lockTtlSeconds));
            const releaseUnusedClaims = (): void => {
              for (const claim of sharedClaims) releaseSharedClaim(sharedHome, claim, { now: sessionNow() });
            };
            if (node.sharedResources?.length) {
              const identity = sharedWorkspaceIdentity();
              for (const resource of [...node.sharedResources].sort()) {
                const acquired = acquireSharedClaim({
                  home: sharedHome,
                  resource,
                  workspaceId: identity,
                  occurrenceId: `${run.runId}:${nodeId}:${(run.nodes[nodeId]?.attempts.length ?? 0) + 1}`,
                  ttlSeconds: sharedTtlSeconds,
                  now: sessionNow(),
                });
                if (!acquired.ok) {
                  // No effect or occurrence has started, so rolling back earlier acquisitions is safe.
                  releaseUnusedClaims();
                  const reason =
                    acquired.reason === "reconciliation_required" ? "A shared resource needs reconciliation before this work can resume." : sharedWaitReason;
                  deferredSharedResources.set(nodeId, reason);
                  run.nodes[nodeId]!.status = "blocked";
                  run.nodes[nodeId]!.blocker = reason;
                  writeRunState(paths.runState, run);
                  break;
                }
                sharedClaims.push(acquired.claim);
              }
              if (deferredSharedResources.has(nodeId)) return;
            }

            let estimateEntryId: string | undefined;
            if (decision.allowed && decision.estimateAmount !== undefined) {
              const built = buildEstimatePatch(ledger, node, decision, sessionId, sessionNow());
              if (built) {
                const result = commitPatch(paths.ledger, paths, sessionId, built.patch);
                if (result.code === 0) {
                  ledger = loadLedgerFile(paths.ledger, sessionNow());
                  estimateEntryId = built.entryId;
                } else {
                  anomalies.push({
                    message: `I couldn't record the expected cost for "${node.title}" before starting it, so I left it for you to look at instead of spending blind.`,
                  });
                  releaseUnusedClaims();
                  return;
                }
              }
            }

            const attemptTime = sessionNow();
            let attempt: ReturnType<typeof beginAttempt>;
            const occurrence = takeAuthorizedOccurrence(run, node.workflowId);
            const attemptNumber = (run.nodes[nodeId]?.attempts.length ?? 0) + 1;
            const executionIdentity = node.reviewOf?.length ? workerExecutionIdentity(sessionId, run.runId, nodeId, attemptNumber) : sessionId;
            try {
              attempt = beginAttempt(plan, run, nodeId, executionIdentity, attemptTime, occurrence?.id);
              attempt.proofSource = executorMode === "fixture" || executorMode === "slow-silent" ? "synthetic" : "workspace";
              if (node.workflowId === "workflow.design.design-system-audit") {
                // Authority belongs to this exact dispatch. Persist it before the worker starts so
                // a later delegation or direct verdict cannot retroactively authorize its output.
                attempt.designAuthorityEvaluation = captureDesignAuthorityEvaluation(run, paths.audit, "dispatch", {
                  workspaceRoot: workspace,
                  evaluatedAt: attemptTime,
                  ...(founderTrustStore ? { trustedKey: founderTrustStore.trustedKey } : {}),
                });
              }
            } catch (error) {
              // beginAttempt throws once a node has exhausted its maxAttempts (or on an internal
              // plan/run mismatch). Left uncaught, this would escape to the outer catch and report
              // the WHOLE session as "crashed" — dropping every already-succeeded node from this
              // run's digest over a single node's retry budget. Park just this node instead (the
              // fixed blocker string below matches digest.ts's BLOCKER_TEXT_EXACT so it renders as
              // a plain sentence, never the raw error) and keep dispatching the rest of the batch.
              releaseUnusedClaims();
              if (occurrence) restoreOccurrenceAfterAttempt(run, occurrence.id, attemptTime);
              if (!host.request) console.error(`session.begin_attempt_failed ${nodeId}: ${error instanceof Error ? error.message : String(error)}`);
              const nodeState = run.nodes[nodeId];
              if (nodeState) {
                nodeState.status = "blocked";
                nodeState.blocker = "Ran out of attempts for this session.";
                run.updatedAt = attemptTime;
                writeRunState(paths.runState, run);
              }
              return;
            }
            writeRunState(paths.runState, run);

            let sharedOwnershipLost = false;
            const assertSharedOwnership = (): void => {
              if (sharedOwnershipLost) throw new Error("shared_claim.ownership_lost");
              for (const claim of sharedClaims) assertSharedClaim(sharedHome, claim, sessionNow());
            };
            const parkSharedReadback = (): void => {
              const reason = "A shared resource needs reconciliation before this work can resume.";
              deferredSharedResources.set(nodeId, reason);
              attempt.status = "needs_readback";
              attempt.finishedAt = sessionNow();
              const current = run.nodes[nodeId]!;
              current.status = "needs_readback";
              current.blocker = reason;
              current.acceptedOutputFingerprint = undefined;
              current.verifiedBySessionId = undefined;
              for (const binding of run.artifactBindings) {
                if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
              }
              invalidateDescendants(plan, run, node.outputs, sessionNow());
              writeRunState(paths.runState, run);
            };
            const checkSharedOwnership = (): boolean => {
              try {
                assertSharedOwnership();
                return true;
              } catch {
                parkSharedReadback();
                return false;
              }
            };
            const runtimeWrites = node.sourceAccess?.length || node.selectedOperation ? trackRuntimeWrites(workspace) : undefined;
            const refreshAttemptHeartbeat = (): void => {
              try {
                for (let index = 0; index < sharedClaims.length; index++) {
                  sharedClaims[index] = renewSharedClaim(sharedHome, sharedClaims[index]!, sharedTtlSeconds, sessionNow());
                }
              } catch {
                sharedOwnershipLost = true;
              }
              try {
                refreshHeartbeat(run, nodeId, sessionNow());
                if (runtimeWrites) {
                  runtimeWrites.write("run/run-state.json", () => writeRunState(paths.runState, run));
                  runtimeWrites.write("control/session.lock", () => heartbeat(paths.sessionLock, sessionId));
                } else {
                  writeRunState(paths.runState, run);
                  heartbeat(paths.sessionLock, sessionId);
                }
              } catch {
                /* best effort: a heartbeat refresh is an optimization, never load-bearing for this attempt's own result */
              }
            };
            // R12/R13 liveness must not depend on the executor voluntarily calling back: a
            // slow-but-alive real executor (U6) that never calls `heartbeat` would otherwise let its
            // own attempt/lock heartbeat go stale mid-run and risk a --break-stale-verified acquirer
            // stealing the lock out from under it. This timer refreshes both independently of the
            // executor for as long as execute() is in flight; the executor-supplied callback below is
            // still honored as an extra signal, but neither one is load-bearing on its own now. The
            // interval is a fraction of the tighter of the two TTLs in play so a refresh always lands
            // comfortably inside the window; unref'd (never keeps this short-lived CLI's event loop
            // alive on its own) and always cleared in `finally`, including when execute() throws.
            const heartbeatIntervalMs = Math.max(50, (Math.min(attempt.ttlSeconds, lockTtlSeconds) * 1000) / 3);
            const heartbeatTimer = setInterval(refreshAttemptHeartbeat, heartbeatIntervalMs);
            heartbeatTimer.unref();
            let result: Awaited<ReturnType<typeof executor.execute>>;
            try {
              const authorization = {
                workflowId: node.workflowId,
                runId: run.runId,
                attemptId: attempt.id,
                executionIdentity,
                inputFingerprint: attempt.inputFingerprint,
                evaluatedAt: attemptTime,
                actionClass: node.actionClass,
                ...(node.protectedCategory ? { protectedCategory: node.protectedCategory } : {}),
                ...(node.workflowId === "workflow.design.design-system-audit" ? { designTasteDelegation: attempt.designAuthorityEvaluation!.delegation } : {}),
                approvalRequirements: node.approvals.map((approval) => {
                  const provenance = run.approvalProvenance?.[approval.id];
                  return {
                    id: approval.id,
                    description: approval.description,
                    status: run.approvals[approval.id] ?? "pending",
                    ...(provenance?.source === "standing_envelope"
                      ? {
                          envelopeId: provenance.envelopeId,
                          actionId: provenance.actionId,
                          validatedAt: provenance.validatedAt,
                        }
                      : {}),
                  };
                }),
                autonomy: {
                  reasonCode: decision.reasonCode,
                  ...(decision.grantLevel ? { grantLevel: decision.grantLevel } : {}),
                  ...(decision.waiverId ? { waiverId: decision.waiverId } : {}),
                  evidenceRefs: [...decision.evidenceRefs],
                  ...(decision.estimateAmount !== undefined ? { estimateAmount: decision.estimateAmount } : {}),
                  ...(decision.estimateCurrency ? { estimateCurrency: decision.estimateCurrency } : {}),
                  ...(decision.remainingBudget !== undefined ? { remainingBudget: decision.remainingBudget } : {}),
                },
              } as const;
              const capsule = capsuleFromOccurrence(occurrence);
              assertSharedOwnership();
              result = await executor.execute(node, {
                runId: run.runId,
                attemptId: attempt.id,
                workspaceDir: workspace,
                skillRootDir: skillRoot(),
                artifactPaths: Object.fromEntries(plan.artifactBindings.map((binding) => [binding.artifactId, binding.path])),
                authorization,
                refreshInstructions: [...(run.nodes[nodeId]?.refreshInstructions ?? []), ...(run.nodes[nodeId]?.repairInstructions ?? [])],
                now: attemptTime,
                heartbeat: refreshAttemptHeartbeat,
                runtimeWrites: runtimeWrites?.snapshot,
                ...(capsule ? { contextSelectors: capsule.sourceIds } : {}),
              });
            } catch (error) {
              if (!sharedClaims.length) throw error;
              result = { status: "failed", outputs: [], evidence: [], error: "Shared-resource worker did not return a certain result." };
            } finally {
              clearInterval(heartbeatTimer);
            }
            runtimeWrites?.assertIntact();
            const finishedAt = sessionNow();
            if (!checkSharedOwnership()) return;
            if (result.status === "failed" && sharedClaims.length) {
              parkSharedReadback();
              return;
            }

            try {
              if (result.status === "failed") {
                const failedState = run.nodes[nodeId];
                const retryableAuditEvidenceFailure = isRetryableDesignAuditExecutorFailure(node, result.error);
                attempt.status = "failed";
                attempt.finishedAt = finishedAt;
                attempt.error = result.error;
                if (attempt.workOrderOccurrenceId) {
                  restoreOccurrenceAfterAttempt(run, attempt.workOrderOccurrenceId, finishedAt);
                }
                const deferredRefresh = deferDependencyRefreshAfterFailure(plan, run, nodeId, finishedAt);
                if (deferredRefresh) {
                  failedScopedRefreshDependencyIds.add(nodeId);
                  scopedRefreshDependencyIds.delete(nodeId);
                }
                if (!deferredRefresh && failedState) {
                  failedState.refreshInstructions = undefined;
                  if (retryableAuditEvidenceFailure) {
                    failedState.acceptedOutputFingerprint = undefined;
                    failedState.verifiedBySessionId = undefined;
                    failedState.repairInstructions = [`Repair invalid audit evidence: ${result.error ?? "the declared audit output is missing"}`];
                    for (const binding of run.artifactBindings) {
                      if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
                    }
                    if (attemptsUsedInCurrentCycle(failedState) < node.maxAttempts) {
                      failedState.status = "stale";
                      failedState.blocker = undefined;
                    } else {
                      failedState.status = "blocked";
                      failedState.blocker = `The design audit evidence remained invalid after ${node.maxAttempts} attempts.`;
                    }
                  } else {
                    failedState.status = "failed";
                    failedState.blocker = result.error ?? "The work didn't complete.";
                  }
                }
                run.updatedAt = finishedAt;
                // A failed node is neither "advanced" nor "parked" in run-state terms — without this it would
                // vanish from the digest entirely (silence), so a failure is reported as something to watch.
                // The raw executor error is never interpolated here: it's a debug string (may itself carry
                // internal ids), not founder copy — only the node's own human title is safe to name.
                anomalies.push({
                  message: retryableAuditEvidenceFailure
                    ? `I tried "${node.title}", but its audit evidence was invalid. I kept its bounded audit-only retry queued.`
                    : `I tried "${node.title}" and it didn't go through. I'll leave it for a future session or for you to look at.`,
                });
              } else {
                reconcilePatch(
                  plan,
                  run,
                  {
                    nodeId,
                    attemptId: attempt.id,
                    outputs: result.outputs.map((output) => ({
                      artifactId: output.artifactId,
                      path: output.path,
                      fingerprint: output.fingerprint,
                      evidence: [...output.evidence],
                    })),
                  },
                  finishedAt,
                );
                // Gates execute out of process and may validate the current audit attempt and exact
                // artifact binding. Persist that engine-owned identity before a gate reads run-state.
                writeRunState(paths.runState, run);
                if (run.nodes[nodeId]!.status === "succeeded") {
                  advanced.push({ nodeId, title: node.title, unit: domainBusinessUnit(node.domainId, catalog.authority) });
                } else if (node.verification.kind === "deterministic" && node.verification.gateIds.length > 0) {
                  // Mechanical checks are required before judgment. A gated judgment node remains
                  // pending for the independent sweep after its exact-attempt gate receipt is saved.
                  const gateOutcome = runDeterministicGates(node.verification.gateIds, workspace, {
                    gateArguments: node.verification.gateArguments,
                    selectedOperation: node.selectedOperation,
                  });
                  if (attempt.proofSource === "workspace") {
                    const changedArtifacts = refreshProducedArtifacts(plan, run, nodeId, workspace);
                    invalidateDescendants(plan, run, changedArtifacts, sessionNow());
                  }
                  if (!checkSharedOwnership()) return;
                  recordDeterministicVerification(plan, run, nodeId, gateOutcome, sessionNow());
                  if (gateOutcome.allPassed) {
                    if (!requiresIndependentReview(node)) acceptVerification(plan, run, nodeId, gateOutcome.evidence, sessionNow(), sessionId);
                    const accepted = run.nodes[nodeId]!.status as string;
                    if (accepted === "succeeded") advanced.push({ nodeId, title: node.title, unit: domainBusinessUnit(node.domainId, catalog.authority) });
                  } else {
                    // An honest audit can fail because its producer needs repair. Preserve the
                    // failed receipt for a rejection-only sweep that can select that producer.
                    const currentState = run.nodes[nodeId]!;
                    const founderTasteDecisionNeeded =
                      node.workflowId === "workflow.design.design-system-audit" &&
                      gateOutcome.issueCodes.some((code) => DESIGN_TASTE_FOUNDER_DECISION_CODES.has(code));
                    const invalidDesignAuditEvidence = isRetryableDesignAuditGateFailure(node, gateOutcome);
                    if (founderTasteDecisionNeeded) {
                      currentState.status = "waiting_founder";
                      currentState.blocker = "Taste Gate needs a founder decision for the current design candidate.";
                    } else if (invalidDesignAuditEvidence) {
                      // This is an audit-authoring defect, not a product-design or craft rejection.
                      // Give the fresh-context audit worker a bounded chance to repair its own
                      // missing, malformed, stale, or non-independent evidence. Never route this
                      // branch to a reviewed producer: no product bytes have been judged. Reducer
                      // audit-chain tamper has already halted at preflight and never reaches here.
                      attempt.status = "failed";
                      attempt.finishedAt = sessionNow();
                      currentState.acceptedOutputFingerprint = undefined;
                      currentState.verifiedBySessionId = undefined;
                      currentState.repairInstructions = gateOutcome.evidence.map((entry) => `Repair invalid audit evidence: ${entry}`);
                      for (const binding of run.artifactBindings) {
                        if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
                      }
                      if (attemptsUsedInCurrentCycle(currentState) < node.maxAttempts) {
                        currentState.status = "stale";
                        currentState.blocker = undefined;
                      } else {
                        currentState.status = "blocked";
                        currentState.blocker = `The design audit evidence remained invalid after ${node.maxAttempts} attempts.`;
                      }
                    } else if (!hasCurrentFailedAuditGates(plan, run, nodeId)) {
                      requestVerificationRepair(plan, run, nodeId, gateOutcome.evidence, sessionNow());
                    }
                    anomalies.push({ message: `I finished "${node.title}" but its checks didn't pass yet, so I'm not calling it done.` });
                  }
                }

                if (!checkSharedOwnership()) return;
                if (estimateEntryId) {
                  const actualPatch = buildActualPatch(ledger, estimateEntryId, node, decision, sessionId, sessionNow());
                  if (actualPatch) {
                    const actualResult = commitPatch(paths.ledger, paths, sessionId, actualPatch);
                    if (actualResult.code === 0) ledger = loadLedgerFile(paths.ledger, sessionNow());
                    else
                      anomalies.push({
                        message: `I finished "${node.title}" but couldn't record the final cost — the estimate is saved, the actual isn't yet.`,
                      });
                  }
                }
              }
              if (!checkSharedOwnership()) return;
              writeRunState(paths.runState, run);
              // Reconciliation is durable before ownership is released. A failed or thrown worker
              // retains every claim: expiry alone never makes uncertain external effects replayable.
              if (result.status !== "failed") {
                assertSharedOwnership();
                for (const claim of sharedClaims) releaseSharedClaim(sharedHome, claim, { now: sessionNow() });
              }
            } catch (error) {
              if (!sharedClaims.length) throw error;
              parkSharedReadback();
            }
          }),
        );
        // Keep session ownership until every started worker has settled. A rejected
        // worker must not release the lock while its siblings can still write.
        const failed = outcomes.find((outcome) => outcome.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;

        for (const nodeId of listPendingSessionReviews(plan, run)) {
          if (pendingBeforeBatch.has(nodeId)) continue;
          const latestAttempt = run.nodes[nodeId]?.attempts.at(-1);
          const node = plan.nodes.find((candidate) => candidate.id === nodeId);
          const ownedBySession =
            latestAttempt?.ownerSessionId === sessionId ||
            (latestAttempt !== undefined &&
              Boolean(node?.reviewOf?.length) &&
              latestAttempt.ownerSessionId === workerExecutionIdentity(sessionId, run.runId, nodeId, latestAttempt.number));
          if (latestAttempt && ownedBySession) cooperativeYieldCandidateAttempts.set(nodeId, latestAttempt.id);
        }
      }
    }

    // A cooperative yield can arrive while a batch is running. That batch may produce
    // fresh-context work after the loop's last empty-frontier sweep, so judge it before the
    // session closes. Ordinary empty-frontier completion already ran the sweep above; do not
    // invoke an unavailable verifier twice. A timeout or kill switch remains final.
    if (verifier && !timedOut && haltReason === "cooperative_yield" && cooperativeYieldCandidateAttempts.size > 0) {
      await runVerificationSweep(true, cooperativeYieldCandidateAttempts);
    }

    if (!verifier) {
      const unverified = listPendingSessionReviews(plan, run).length;
      if (unverified > 0) {
        anomalies.push({
          message:
            unverified === 1
              ? "Independent double-checks were turned off for this session, so one piece of finished work is waiting on a check rather than done."
              : `Independent double-checks were turned off for this session, so ${unverified} pieces of finished work are waiting on a check rather than done.`,
        });
      }
    }

    // One final, side-effect-free frontier pass so run.nodes reflects the latest classification for the digest, regardless of why the loop exited.
    try {
      applyStandingApprovals(plan, run, paths.agentOperations, sessionNow());
      computeFrontier(plan, run, businessState, captured);
    } catch {
      /* best effort snapshot only */
    }

    for (const [nodeId, reason] of deferredSharedResources) {
      const state = run.nodes[nodeId];
      if (state) {
        if (state.status !== "needs_readback") state.status = "blocked";
        state.blocker = reason;
      }
    }
    const parked: DigestParkedItem[] = [];
    for (const node of plan.nodes) {
      const state = run.nodes[node.id];
      if (!state || !["blocked", "waiting_founder", "needs_readback"].includes(state.status)) continue;
      const detail = decisions.get(node.id);
      const pendingGate = businessState.founderGates.pending.find((gate) => gate.reason.includes(node.title));
      parked.push({
        nodeId: node.id,
        title: node.title,
        unit: domainBusinessUnit(node.domainId, catalog.authority),
        reasonText: translateParkReason({ reasonCode: detail?.allowed === false ? detail.reasonCode : undefined, blocker: state.blocker }),
        ageText: pendingGate ? formatAge(pendingGate.createdAt, sessionNow()) : undefined,
      });
    }
    for (const gate of businessState.founderGates.pending) {
      if (parked.some((item) => gate.reason.includes(item.title))) continue;
      parked.push({
        nodeId: gate.id,
        title: gate.reason,
        unit: "Operations",
        reasonText: "This has been waiting on you.",
        ageText: formatAge(gate.createdAt, sessionNow()),
      });
    }

    if (haltReason) anomalies.push({ message: `I stopped partway through because ${translateHaltReason(haltReason)}.` });
    if (timedOut) anomalies.push({ message: "I hit my time limit for this session and stopped on purpose rather than run indefinitely." });

    const spend: DigestSpendLine[] = ledger.balances.map((balance) => ({
      unit: balance.unit,
      period: balance.period,
      currency: balance.currency,
      allocated: balance.allocated,
      committed: balance.committed,
      spent: balance.spent,
      remaining: balance.remaining,
    }));

    const finalNow = sessionNow();
    run.heartbeatAt = finalNow;
    run.updatedAt = finalNow;
    writeRunState(paths.runState, run);
    const checkpointHash = `checkpoint:${plan.planId}:${run.runId}:${run.updatedAt}`;
    writeCheckpoint(paths.checkpoint, buildCheckpoint(run, sessionId, checkpointHash, finalNow));

    const completedAdvanced = [
      ...new Map(advanced.filter((entry) => run.nodes[entry.nodeId]?.status === "succeeded").map((entry) => [entry.nodeId, entry])).values(),
    ];
    const outcome: DigestOutcome = timedOut
      ? "timed_out"
      : haltReason === "kill_switch"
        ? "halted_kill_switch"
        : haltReason === "cooperative_yield"
          ? "halted_interactive_yield"
          : completedAdvanced.length === 0 && parked.length === 0
            ? "nothing_to_do"
            : "completed";

    return await finish(outcome, { advanced: completedAdvanced, parked, spend }, 0);
  } catch (error) {
    // The raw error text is never handed to the founder — an internal exception (e.g. a catalog
    // authoring defect) can carry engine vocabulary verbatim (workflow/artifact ids). It goes to
    // stderr for whoever operates this session instead.
    if (!host.request) console.error(`session.crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    anomalies.push({
      message:
        error instanceof FounderTrustStoreError
          ? "I could not verify the founder-controlled design authority store and stopped before dispatching work."
          : "Something unexpected went wrong on my end and I had to stop.",
    });
    return await finish("crashed", {}, 1);
  }
}

if (isMainModule(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`session.fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      process.exitCode = 1;
    });
}
