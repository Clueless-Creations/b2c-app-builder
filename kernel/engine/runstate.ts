import { assertReadableWorkspaceFile } from "../reducer/erasure-guard.js";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeSync } from "node:fs";
import path, { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateCheckpoint, validateRunState } from "../schema/index.js";
import type {
  ArtifactBindingV2,
  AttemptRecordV2,
  BusinessStateV2,
  CheckpointDocument,
  IndependentVerificationReceipt,
  RunNodeStateV2,
  RunStateDocument,
  Status,
} from "../schema/types.js";
import { sha256, type CompiledPlan, type CompiledRunNode, type RunNodeId } from "./compile.js";
import {
  invalidateOccurrenceContract,
  exhaustOccurrence,
  isOccurrenceDispatchable,
  recordWorkOrderProof,
  restoreOccurrenceAfterAttempt,
} from "../work-orders/lifecycle.js";
import { refuseFreshContextAcceptance, requiresIndependentReview, VERIFICATION_REQUIRED_BLOCKER } from "./verification.js";
import { captureReviewEvidence, validateReviewReceipt, workflowContractFingerprint } from "./review-evidence.js";
import { DESIGN_TASTE_DELEGATION_APPROVAL_ID } from "./founder-decision-receipt.js";

/** A lane in one of these states means the workflows that own it are already done. */
const DONE_LANE_STATUSES: readonly Status[] = ["succeeded", "not_needed", "skipped"];

/** Optional founder decision. It authorizes audit-owned local design taste without gating launch-program entry. */
export { DESIGN_TASTE_DELEGATION_APPROVAL_ID };

/** Statuses the frontier would re-examine — the ones an unanswered scope question must not reach dispatch from. */
const READY_ELIGIBLE_APPLICABILITY: readonly Status[] = ["pending", "ready", "stale"];

function requiresReadbackBeforeRepeat(node: CompiledRunNode): boolean {
  return !node.idempotent || Boolean(node.protectedCategory) || ["spend", "publish", "release", "destructive"].includes(node.actionClass);
}

/**
 * Give an isolated audit worker a durable execution identity of its own. The identity is stable
 * for one session/run/node/attempt tuple, but cannot collide with the enclosing orchestrator
 * session that owns ordinary producer attempts. This lets run-state prove producer/reviewer
 * separation from engine-issued evidence rather than from prose in a review file.
 */
export function workerExecutionIdentity(sessionId: string, runId: string, nodeId: RunNodeId, attemptNumber: number): string {
  const digest = createHash("sha256").update(`${sessionId}\0${runId}\0${nodeId}\0${attemptNumber}`).digest("hex").slice(0, 24);
  return `${sessionId}.worker.${digest}`;
}

/** Validate an audit identity without relying on the current run owner, which changes on resume. */
export function isWorkerExecutionIdentity(identity: string, runId: string, nodeId: RunNodeId, attemptNumber: number): boolean {
  const marker = ".worker.";
  const markerIndex = identity.lastIndexOf(marker);
  if (markerIndex <= 0) return false;
  const sessionId = identity.slice(0, markerIndex);
  return identity === workerExecutionIdentity(sessionId, runId, nodeId, attemptNumber);
}

export interface SeedRunStateOptions {
  ownerSessionId: string;
  ttlSeconds: number;
  wallClockCapSeconds: number;
  now?: string;
  runId?: string;
}

/**
 * Load/seed from business state v2 (R1: any session reconstructs truth from durable state, never
 * chat memory). A node whose every lane is already done is seeded succeeded, with its declared
 * outputs pre-accepted — a mid-launch business must not re-offer day-one work on its frontier.
 */
export function seedRunState(plan: CompiledPlan, businessState: BusinessStateV2, options: SeedRunStateOptions): RunStateDocument {
  const now = options.now ?? new Date().toISOString();
  const nodes: Record<string, RunNodeStateV2> = {};

  for (const node of plan.nodes) {
    const alreadyDone = node.laneIds.length > 0 && node.laneIds.every((laneKey) => DONE_LANE_STATUSES.includes(businessState.lanes[laneKey]?.status as Status));
    nodes[node.id] = alreadyDone
      ? { nodeId: node.id, status: "succeeded", attempts: [], acceptedOutputFingerprint: sha256(`seed:${node.id}`) }
      : { nodeId: node.id, status: "pending", attempts: [] };
    nodes[node.id]!.contractFingerprint = workflowContractFingerprint(node);
  }

  const artifactBindings: ArtifactBindingV2[] = plan.artifactBindings.map((binding) => {
    const producer = plan.nodes.find((node) => node.outputs.some((output) => output === binding.artifactId));
    const accepted = producer ? nodes[producer.id]?.status === "succeeded" : false;
    return accepted ? { ...binding, accepted: true, fingerprint: sha256(`seed:${binding.artifactId}`) } : { ...binding, accepted: false };
  });

  const approvals = Object.fromEntries(plan.nodes.flatMap((node) => node.approvals.map((approval) => [approval.id, "pending" as const])));

  const run: RunStateDocument = {
    schemaVersion: "1.0.0",
    runId: options.runId ?? `run.${plan.planId.slice("plan.".length)}.${randomUUID().slice(0, 8)}`,
    planId: plan.planId,
    planRevision: plan.planRevision,
    createdAt: now,
    updatedAt: now,
    ownerSessionId: options.ownerSessionId,
    heartbeatAt: now,
    ttlSeconds: options.ttlSeconds,
    wallClockCapSeconds: options.wallClockCapSeconds,
    approvals,
    approvalProvenance: {},
    artifactBindings,
    nodes,
  };
  reconcileWorkflowApplicability(plan, run, businessState, now);
  return run;
}

/** Upgrade in place by stable workflow identity; retain history without inventing acceptance. */
export function reconcileRunPlan(
  plan: CompiledPlan,
  prior: RunStateDocument,
  businessState: BusinessStateV2,
  options: SeedRunStateOptions & { invalidateAll?: boolean },
): RunStateDocument {
  if (prior.planId === plan.planId && !options.invalidateAll) return prior;
  const next = seedRunState(plan, businessState, { ...options, runId: prior.runId });
  next.createdAt = prior.createdAt;
  next.publicRequests = structuredClone(prior.publicRequests);
  next.founderDecisionKeyId = prior.founderDecisionKeyId;
  next.founderDecisionTrust = prior.founderDecisionTrust ? structuredClone(prior.founderDecisionTrust) : undefined;
  next.archivedPlans = [
    ...structuredClone(prior.archivedPlans ?? []),
    {
      planId: prior.planId,
      planRevision: prior.planRevision,
      archivedAt: options.now ?? new Date().toISOString(),
      nodes: structuredClone(prior.nodes),
      artifactBindings: structuredClone(prior.artifactBindings),
      approvals: structuredClone(prior.approvals),
      approvalProvenance: structuredClone(prior.approvalProvenance),
      workOrders: structuredClone(prior.workOrders),
    },
  ];
  next.workOrders = Object.fromEntries(
    Object.entries(structuredClone(prior.workOrders ?? {})).filter(([, occurrence]) => plan.nodes.some((node) => node.workflowId === occurrence.workflowId)),
  );
  const invalidated: string[] = [];
  const changedNodes = new Set<string>();
  for (const node of plan.nodes) {
    const old = prior.nodes[node.id];
    if (!old) {
      next.nodes[node.id] = { nodeId: node.id, status: "pending", attempts: [], contractFingerprint: workflowContractFingerprint(node) };
      for (const binding of next.artifactBindings) if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
      continue;
    }
    const state = structuredClone(old);
    const contractFingerprint = workflowContractFingerprint(node);
    const compatible = !options.invalidateAll && old.contractFingerprint === contractFingerprint;
    state.contractFingerprint = contractFingerprint;
    next.nodes[node.id] = state;
    for (const binding of next.artifactBindings.filter((entry) => node.outputs.includes(entry.artifactId as never))) {
      const previous = prior.artifactBindings.find((entry) => entry.artifactId === binding.artifactId && entry.path === binding.path);
      if (previous) Object.assign(binding, structuredClone(previous));
    }
    const missingReview = requiresIndependentReview(node) && state.status === "succeeded" && !state.attempts.at(-1)?.independentVerification;
    if (!compatible || missingReview || (state.status === "succeeded" && state.attempts.length === 0)) {
      if (state.attempts.length > 0 && requiresReadbackBeforeRepeat(node)) {
        state.status = "needs_readback";
        state.blocker = "The workflow contract changed; confirm prior external effects before continuing.";
      } else {
        state.status = attemptsUsedInCurrentCycle(state) >= node.maxAttempts ? "blocked" : "stale";
        state.blocker = state.status === "blocked" ? "The workflow changed and its recorded attempt budget is exhausted." : undefined;
      }
      state.acceptedOutputFingerprint = undefined;
      state.verifiedBySessionId = undefined;
      for (const binding of next.artifactBindings) if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
      invalidated.push(...node.outputs);
      changedNodes.add(node.id);
    }
    if (compatible)
      for (const approval of node.approvals) {
        if (prior.approvals[approval.id]) next.approvals[approval.id] = prior.approvals[approval.id]!;
        const provenance = prior.approvalProvenance?.[approval.id];
        if (provenance) (next.approvalProvenance ??= {})[approval.id] = structuredClone(provenance);
      }
  }
  if (prior.approvals[DESIGN_TASTE_DELEGATION_APPROVAL_ID]) {
    next.approvals[DESIGN_TASTE_DELEGATION_APPROVAL_ID] = prior.approvals[DESIGN_TASTE_DELEGATION_APPROVAL_ID]!;
    const provenance = prior.approvalProvenance?.[DESIGN_TASTE_DELEGATION_APPROVAL_ID];
    if (provenance) {
      (next.approvalProvenance ??= {})[DESIGN_TASTE_DELEGATION_APPROVAL_ID] = structuredClone(provenance);
    }
  }
  const now = options.now ?? new Date().toISOString();
  for (const id of invalidateDescendants(plan, next, invalidated, now)) changedNodes.add(id);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const node of plan.nodes) {
      if (changedNodes.has(node.id) || !node.dependencies.some((id) => changedNodes.has(id))) continue;
      const state = next.nodes[node.id]!;
      state.status = state.attempts.length > 0 && requiresReadbackBeforeRepeat(node) ? "needs_readback" : "stale";
      state.blocker = state.status === "needs_readback" ? "A prerequisite contract changed; confirm prior effects before repeating." : undefined;
      state.acceptedOutputFingerprint = undefined;
      state.verifiedBySessionId = undefined;
      for (const binding of next.artifactBindings) if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
      changedNodes.add(node.id);
      expanded = true;
    }
  }
  for (const node of plan.nodes.filter((entry) => changedNodes.has(entry.id))) {
    next.nodes[node.id]!.verifiedBySessionId = undefined;
    for (const approval of node.approvals) {
      next.approvals[approval.id] = "pending";
      if (next.approvalProvenance) delete next.approvalProvenance[approval.id];
    }
  }
  for (const occurrence of Object.values(next.workOrders ?? {})) {
    if (!plan.nodes.some((node) => node.workflowId === occurrence.workflowId && changedNodes.has(node.id))) continue;
    invalidateOccurrenceContract(next, occurrence.id, now);
  }
  return next;
}

/**
 * Apply durable scope verdicts AND the business's launch profile before frontier selection. A
 * verdict or profile transition invalidates old proof. Precedence per node: a recorded founder
 * verdict wins; then the profile (a node whose every lane the profile defers parks not_needed);
 * then the node's own applicability mode. Profiles arrive as compiled fact
 * (CompiledRunNode.deferredByProfiles), so a catalog pinned before profiles existed defers
 * nothing — per-business re-pin semantics, same as every other catalog change (R4/R7).
 */
export function reconcileWorkflowApplicability(plan: CompiledPlan, run: RunStateDocument, businessState: BusinessStateV2, now: string): void {
  // Optional-chained on purpose: minimal fixture states omit project entirely, and a missing
  // scope must mean "no profile parking", never a crash before the frontier.
  const profileId = businessState.project?.launchScope ?? "";
  const repositoryProfile = businessState.project?.repositoryProfile;
  const repositoryProfileKey = repositoryProfile ? `${repositoryProfile.id}:${repositoryProfile.revision}` : "";
  for (const node of plan.nodes) {
    const profileDeferred = node.deferredByProfiles.includes(profileId);
    // Fast exit for the overwhelmingly common case: an unconditional node no profile touches,
    // with no prior applicability history to unwind. Zero behavior change from before profiles.
    if (node.applicability.mode === "always" && !profileDeferred && !repositoryProfileKey) {
      const priorState = run.nodes[node.id];
      if (!priorState || priorState.applicabilityFingerprint === undefined) continue;
    }
    const state = run.nodes[node.id];
    if (!state) continue;
    const record = businessState.workflowApplicability?.[node.workflowId];
    // Reason, evidence, and timestamp edits explain the verdict but do not change scope. Only a
    // verdict or profile transition can retire or reopen work and invalidate its accepted output.
    const fingerprint = sha256(
      `${record?.verdict ?? "unknown"}|${profileDeferred ? profileId : "none"}${repositoryProfileKey ? `|repo:${repositoryProfileKey}` : ""}`,
    );
    if (state.applicabilityFingerprint === fingerprint) {
      // The unchanged-fingerprint fast path must still re-park an UNANSWERED question: staleness
      // invalidation resets a node to a ready-eligible status without touching the applicability
      // fingerprint, and before this guard a scope-gated node could ride that reset straight into
      // dispatch with its founder question still open (caught by check:engine-e2e, 2026-08-19 —
      // both conditional-safety nodes ran with no workflowApplicability record on file).
      if (!record && node.applicability.mode === "conditional" && READY_ELIGIBLE_APPLICABILITY.includes(state.status)) {
        state.status = "waiting_founder";
        state.blocker = `Scope answer needed: ${node.applicability.question}`;
        run.updatedAt = now;
      }
      // The same reset hazard applies to a profile-parked node: re-park it after staleness resets.
      if (!record && profileDeferred && node.applicability.mode === "always" && READY_ELIGIBLE_APPLICABILITY.includes(state.status)) {
        state.status = "not_needed";
        state.blocker = `Deferred by the ${profileId} profile; widen scope or record a required verdict to include it.`;
        run.updatedAt = now;
      }
      continue;
    }

    for (const binding of run.artifactBindings.filter((item) => node.outputs.some((artifactId) => artifactId === item.artifactId))) {
      binding.accepted = false;
      binding.fingerprint = undefined;
      binding.producedBy = undefined;
      binding.attemptId = undefined;
    }
    state.acceptedOutputFingerprint = undefined;
    state.verifiedBySessionId = undefined;
    state.applicabilityFingerprint = fingerprint;
    if (record) {
      // The founder's recorded verdict outranks the profile in both directions.
      if (record.verdict === "not-needed") {
        state.status = "not_needed";
        state.blocker = `Not needed: ${record.reason}`;
      } else {
        state.status = "pending";
        state.blocker = undefined;
      }
    } else if (profileDeferred) {
      state.status = "not_needed";
      state.blocker = `Deferred by the ${profileId} profile; widen scope or record a required verdict to include it.`;
    } else if (node.applicability.mode === "conditional") {
      state.status = "waiting_founder";
      state.blocker = `Scope answer needed: ${node.applicability.question}`;
    } else {
      state.status = "pending";
      state.blocker = undefined;
    }
    run.updatedAt = now;
  }
}

/** Preserve lifetime history while bounding repairs within the current scheduled cycle or occurrence. */
export function currentCycleAttempts(state: RunNodeStateV2, occurrenceId?: string): AttemptRecordV2[] {
  const offset = state.attemptCycleStart ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > state.attempts.length) throw new Error("run.invalid_attempt_cycle");
  const attempts = state.attempts.slice(offset);
  const occurrence = occurrenceId ?? attempts.at(-1)?.workOrderOccurrenceId;
  return occurrence ? attempts.filter((attempt) => attempt.workOrderOccurrenceId === occurrence) : attempts;
}

export function attemptsUsedInCurrentCycle(state: RunNodeStateV2): number {
  return currentCycleAttempts(state).length;
}

/** Begins a new attempt with owner session id, heartbeat, and TTL (R12). */
export function beginAttempt(
  plan: CompiledPlan,
  run: RunStateDocument,
  nodeId: RunNodeId,
  ownerSessionId: string,
  now: string,
  workOrderOccurrenceId?: string,
): AttemptRecordV2 {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const state = run.nodes[nodeId];
  if (!node || !state) throw new Error(`Unknown run node ${nodeId}`);
  const reusedProducerAttempt = (node.reviewOf ?? [])
    .flatMap((producerId) => run.nodes[producerId]?.attempts ?? [])
    .find((attempt) => attempt.ownerSessionId === ownerSessionId);
  if (reusedProducerAttempt) {
    throw new Error(`Independent audit ${nodeId} cannot reuse reviewed producer execution identity ${ownerSessionId} from ${reusedProducerAttempt.id}`);
  }
  const attemptsUsed = currentCycleAttempts(state, workOrderOccurrenceId).length;
  if (attemptsUsed >= node.maxAttempts) {
    if (workOrderOccurrenceId) exhaustOccurrence(run, workOrderOccurrenceId, now);
    throw new Error(`${nodeId} exhausted ${node.maxAttempts} attempts`);
  }

  const attempt: AttemptRecordV2 = {
    id: `${nodeId}.attempt.${state.attempts.length + 1}`,
    nodeId,
    number: state.attempts.length + 1,
    status: "running",
    ownerSessionId,
    heartbeatAt: now,
    ttlSeconds: node.ttlSeconds,
    inputFingerprint: fingerprintInputs(node.inputs, run.artifactBindings),
    startedAt: now,
    evidence: [],
    readbackRequired: false,
    ...(workOrderOccurrenceId ? { workOrderOccurrenceId } : {}),
  };
  state.attempts.push(attempt);
  state.status = "running";
  run.updatedAt = now;
  const occurrence = workOrderOccurrenceId ? run.workOrders?.[workOrderOccurrenceId] : undefined;
  if (occurrence) {
    if (!occurrence.attemptIds.includes(attempt.id)) occurrence.attemptIds = [...occurrence.attemptIds, attempt.id];
    if (occurrence.status === "authorized") {
      occurrence.transitions = [...occurrence.transitions, { at: now, from: "authorized", to: "running", ok: true, reasonCode: "work_order.attempt_started" }];
      occurrence.status = "running";
    }
  }
  return attempt;
}

export function fingerprintInputs(inputs: readonly string[], bindings: readonly ArtifactBindingV2[]): string {
  return sha256(
    inputs.map((artifactId) => `${artifactId}:${bindings.find((binding) => binding.artifactId === artifactId)?.fingerprint ?? "missing"}`).join("|"),
  );
}

/** Refreshes the running attempt's heartbeat and the run-level owner heartbeat together. */
export function refreshHeartbeat(run: RunStateDocument, nodeId: RunNodeId, now: string): AttemptRecordV2 {
  const state = run.nodes[nodeId];
  const attempt = state?.attempts.at(-1);
  if (!state || !attempt || attempt.status !== "running") throw new Error(`${nodeId} has no running attempt to refresh`);
  attempt.heartbeatAt = now;
  run.heartbeatAt = now;
  run.updatedAt = now;
  return attempt;
}

export interface OrphanEvent {
  nodeId: RunNodeId;
  attemptId: string;
  resolution: "ready" | "needs_readback";
}

/**
 * A running attempt whose heartbeat has exceeded its TTL is orphaned (R12). Idempotent nodes
 * resolve straight to ready — the *next* dispatch cycle re-attempts them, this function never
 * dispatches anything itself. Non-idempotent nodes resolve to needs_readback and stay there: a
 * provider read-back must establish ground truth before anything retries. Neither path is an
 * auto-retry.
 */
export function detectOrphans(plan: CompiledPlan, run: RunStateDocument, now: string): OrphanEvent[] {
  const events: OrphanEvent[] = [];
  const nowMs = Date.parse(now);

  for (const node of plan.nodes) {
    const state = run.nodes[node.id];
    if (!state || state.status !== "running") continue;
    const attempt = state.attempts.at(-1);
    if (!attempt || attempt.status !== "running") continue;

    const heartbeat = attempt.heartbeatAt || attempt.startedAt || run.createdAt;
    const elapsedSeconds = (nowMs - Date.parse(heartbeat)) / 1000;
    if (elapsedSeconds < attempt.ttlSeconds) continue;

    attempt.status = "orphaned";
    attempt.finishedAt = now;
    if (node.idempotent) {
      state.status = "ready";
      state.blocker = undefined;
      events.push({ nodeId: node.id, attemptId: attempt.id, resolution: "ready" });
      if (attempt.workOrderOccurrenceId && run.workOrders?.[attempt.workOrderOccurrenceId]) {
        restoreOccurrenceAfterAttempt(run, attempt.workOrderOccurrenceId, now);
      }
    } else {
      state.status = "needs_readback";
      attempt.readbackRequired = true;
      state.blocker = "Non-idempotent attempt orphaned; provider read-back required before retry.";
      events.push({ nodeId: node.id, attemptId: attempt.id, resolution: "needs_readback" });
    }
  }

  if (events.length > 0) run.updatedAt = now;
  return events;
}

export interface RunStatePatchOutput {
  artifactId: string;
  path: string;
  fingerprint: string;
  evidence: string[];
}

export interface RunStatePatch {
  nodeId: RunNodeId;
  attemptId: string;
  outputs: RunStatePatchOutput[];
}

/**
 * Fail-closed join (ported reconcilePatch): a patch omitting a declared output is a silent node
 * failure, rejected rather than partially applied. kind:"none" verification reaches succeeded
 * directly; anything else lands blocked pending acceptVerification.
 *
 * Staleness trigger: when a re-produced output replaces a fingerprint that downstream work was
 * *accepted against*, the accepted input context of every descendant just changed — the old
 * artifact no longer stands, whether or not the replacement is verified yet. That is exactly
 * invalidateDescendants' contract, so it runs here, at the single site where an accepted
 * fingerprint can be overwritten. A re-produced output with an identical fingerprint changes
 * nothing downstream and must not invalidate anything (staleness stays honest in both directions).
 */
export function reconcilePatch(plan: CompiledPlan, run: RunStateDocument, patch: RunStatePatch, now: string): void {
  const node = plan.nodes.find((candidate) => candidate.id === patch.nodeId);
  const state = run.nodes[patch.nodeId];
  const attempt = state?.attempts.find((candidate) => candidate.id === patch.attemptId);
  if (!node || !state || !attempt) throw new Error("Patch does not match an active run attempt");
  if (attempt.status !== "running") throw new Error(`Attempt ${attempt.id} is not running`);

  const expected = new Set<string>(node.outputs);
  const actual = new Set(patch.outputs.map((output) => output.artifactId));
  const missing = [...expected].filter((artifactId) => !actual.has(artifactId));
  if (missing.length > 0) throw new Error(`Silent node failure: ${patch.nodeId} omitted declared output(s) ${missing.join(", ")}`);

  const changedAcceptedInputs: string[] = [];
  for (const output of patch.outputs) {
    if (!expected.has(output.artifactId)) throw new Error(`${patch.nodeId} returned undeclared output ${output.artifactId}`);
    const binding = run.artifactBindings.find((candidate) => candidate.artifactId === output.artifactId);
    if (!binding) throw new Error(`Missing artifact binding ${output.artifactId}`);
    if (
      (binding.accepted && binding.fingerprint !== output.fingerprint) ||
      (binding.refreshBaselineFingerprint !== undefined && binding.refreshBaselineFingerprint !== output.fingerprint)
    )
      changedAcceptedInputs.push(output.artifactId);
    binding.path = output.path;
    binding.fingerprint = output.fingerprint;
    binding.accepted = node.verification.kind === "none";
    binding.producedBy = node.id;
    binding.attemptId = attempt.id;
    binding.refreshBaselineFingerprint = undefined;
    attempt.evidence.push(...output.evidence);
  }

  if (node.verification.kind === "none" && attempt.workOrderOccurrenceId) {
    const proof = recordWorkOrderProof(run, attempt.workOrderOccurrenceId, attempt.evidence, now);
    if (!proof.ok) throw new Error(`Work-order proof failed for ${attempt.workOrderOccurrenceId}: ${proof.reasonCode}`);
  }

  attempt.finishedAt = now;
  attempt.status = node.verification.kind === "none" ? "succeeded" : "blocked";
  state.status = node.verification.kind === "none" ? "succeeded" : "blocked";
  state.blocker = node.verification.kind === "none" ? undefined : "Verification required";
  state.refreshInstructions = undefined;
  run.updatedAt = now;

  if (changedAcceptedInputs.length > 0) {
    const preservedScopedConsumers = new Set(
      plan.nodes
        .filter((candidate) => {
          const candidateState = run.nodes[candidate.id];
          return (
            candidateState?.status === "succeeded" &&
            candidate.refreshDependencies.some((refresh) => refresh.nodeId === patch.nodeId) &&
            candidateState.dependencyRefreshCycles?.some((cycle) => cycle.startsWith(`${patch.nodeId}@`))
          );
        })
        .map((candidate) => candidate.id),
    );
    invalidateDescendants(plan, run, changedAcceptedInputs, now, preservedScopedConsumers);
  }
}

/** Producer never verifies its own work (R15): a separate acceptance step promotes a reconciled-but-blocked node to succeeded. */
export function acceptVerification(
  plan: CompiledPlan,
  run: RunStateDocument,
  nodeId: RunNodeId,
  evidence: string[],
  now: string,
  verifiedBySessionId?: string,
  reviewReceipt?: IndependentVerificationReceipt,
  workspaceRoot?: string,
): void {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const state = run.nodes[nodeId];
  const attempt = state?.attempts.at(-1);
  if (!node || !state || !attempt) throw new Error(`No attempt to verify for ${nodeId}`);
  if (requiresIndependentReview(node)) {
    const refusal = refuseFreshContextAcceptance(plan, run, nodeId, verifiedBySessionId);
    if (refusal) throw new Error(refusal.message);
  }
  // evidence:[""] (or all-whitespace entries) must count as no evidence at all — a bare
  // `.length === 0` check lets an empty string slip through as if something had been verified.
  const hasRealEvidence = evidence.some((entry) => entry.trim().length > 0);
  if (node.verification.kind !== "none" && !hasRealEvidence && node.verification.failClosed) {
    throw new Error(`Verification for ${nodeId} requires evidence`);
  }
  if (requiresIndependentReview(node)) {
    const receipt =
      reviewReceipt ?? captureReviewEvidence(plan, run, nodeId, "", verifiedBySessionId!, now, attempt.proofSource === "synthetic" ? "synthetic" : "graph");
    const issues = validateReviewReceipt(plan, run, nodeId, receipt, workspaceRoot);
    if (issues.length) throw new Error(`Independent review does not match current work: ${issues.join(", ")}`);
    attempt.independentVerification = { ...structuredClone(receipt), verdict: "accepted", checkedAt: now, evidence: [...evidence] };
  }
  if (attempt.workOrderOccurrenceId) {
    const proof = recordWorkOrderProof(run, attempt.workOrderOccurrenceId, evidence, now);
    if (!proof.ok) throw new Error(`Work-order proof failed for ${attempt.workOrderOccurrenceId}: ${proof.reasonCode}`);
  }
  for (const artifactId of node.outputs) {
    const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId && candidate.attemptId === attempt.id);
    if (binding) binding.accepted = true;
  }
  attempt.evidence.push(...evidence);
  attempt.status = "succeeded";
  attempt.finishedAt = now;
  state.status = "succeeded";
  state.acceptedOutputFingerprint = sha256(
    node.outputs.map((id) => run.artifactBindings.find((binding) => binding.artifactId === id)?.fingerprint ?? "").join("|"),
  );
  state.blocker = undefined;
  if (verifiedBySessionId) state.verifiedBySessionId = verifiedBySessionId;
  state.repairInstructions = undefined;
  run.updatedAt = now;
}

/** Changed artifacts or rubrics reopen accepted work before it can satisfy another dependency. */
export function invalidateStaleReviews(plan: CompiledPlan, run: RunStateDocument, workspaceRoot: string, now: string): RunNodeId[] {
  const stale: RunNodeId[] = [];
  for (const node of plan.nodes) {
    const state = run.nodes[node.id];
    const receipt = state?.attempts.at(-1)?.independentVerification;
    if (state?.status !== "succeeded" || receipt?.mode !== "workspace") continue;
    const issues = validateReviewReceipt(plan, run, node.id, receipt, workspaceRoot);
    if (!issues.length) continue;
    const priorExternalAttempt = requiresReadbackBeforeRepeat(node);
    state.status = priorExternalAttempt ? "needs_readback" : "stale";
    state.blocker = priorExternalAttempt ? "Review evidence changed; confirm prior external effects before continuing." : undefined;
    state.acceptedOutputFingerprint = undefined;
    state.verifiedBySessionId = undefined;
    state.repairInstructions = [`Current review evidence changed: ${issues.join(", ")}. Restore the required outcome and obtain a fresh review.`];
    for (const binding of run.artifactBindings) if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
    // A review output may be a declared repair input of the producer it judges. Preserve those
    // intentional feedback edges when only the review artifact or rubric went stale; product
    // work reopens only after a valid rejected judgment names it through requestVerificationRepair.
    invalidateDescendants(plan, run, node.outputs, now, new Set(node.reviewOf ?? []));
    stale.push(node.id);
  }
  if (stale.length) run.updatedAt = now;
  return stale;
}

/** Rejected judgment creates bounded producer work, never fresh authority for a side effect. */
export function requestVerificationRepair(
  plan: CompiledPlan,
  run: RunStateDocument,
  reviewedNodeId: RunNodeId,
  findings: string[],
  now: string,
  targetWorkflowIds: readonly string[] = [],
): RunNodeId[] {
  const reviewed = plan.nodes.find((node) => node.id === reviewedNodeId);
  const source = run.nodes[reviewedNodeId];
  const sourceAttempt = source?.attempts.at(-1);
  if (!reviewed || !source || !sourceAttempt || !findings.some((entry) => entry.trim())) return [];
  const normalizedFindings = findings.filter((entry) => entry.trim());
  sourceAttempt.status = "failed";
  if (sourceAttempt.workOrderOccurrenceId) restoreOccurrenceAfterAttempt(run, sourceAttempt.workOrderOccurrenceId, now);

  const producerTargets = reviewed.reviewOf ?? [];
  const permitted = producerTargets.length > 0 ? producerTargets : [reviewedNodeId];
  const requested = targetWorkflowIds.length
    ? targetWorkflowIds.map((id) => (id.startsWith("workflow.") ? `run.${id.slice("workflow.".length)}` : id))
    : permitted;
  if (requested.some((id) => !permitted.includes(id as RunNodeId))) {
    source.status = "blocked";
    source.repairInstructions = normalizedFindings.map((entry) => `Repair finding from ${reviewed.workflowId}: ${entry}`);
    source.blocker = producerTargets.length
      ? "Verification rejected: an audit cannot repair itself or target work outside its declared producers."
      : "Verification rejected: repair target is outside the reviewed work.";
    run.updatedAt = now;
    return [];
  }

  if (attemptsUsedInCurrentCycle(source) >= reviewed.maxAttempts) {
    source.status = "blocked";
    source.repairInstructions = normalizedFindings.map((entry) => `Repair finding from ${reviewed.workflowId}: ${entry}`);
    source.blocker = `Verification rejected: repair attempts exhausted after ${reviewed.maxAttempts} attempts.`;
    run.updatedAt = now;
    return [];
  }
  const noProgressLimit = reviewed.maxConsecutiveNoProgressAttempts;
  if (noProgressLimit !== undefined && consecutiveNoProgressAttempts(plan, reviewed, source) >= noProgressLimit) {
    source.status = "blocked";
    source.repairInstructions = normalizedFindings.map((entry) => `Repair finding from ${reviewed.workflowId}: ${entry}`);
    source.blocker = `Verification rejected: no measurable producer change across ${noProgressLimit} consecutive repair attempts.`;
    run.updatedAt = now;
    return [];
  }

  const reopened: RunNodeId[] = [];
  for (const id of new Set(requested)) {
    const node = plan.nodes.find((candidate) => candidate.id === id)!;
    const state = run.nodes[id]!;
    state.repairInstructions = normalizedFindings.map((entry) => `Repair finding from ${reviewed.workflowId}: ${entry}`);
    state.acceptedOutputFingerprint = undefined;
    state.verifiedBySessionId = undefined;
    for (const binding of run.artifactBindings) if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
    invalidateDescendants(plan, run, node.outputs, now);
    if (requiresReadbackBeforeRepeat(node)) {
      state.status = "needs_readback";
      state.blocker = "Verification rejected: confirm external effects and authority before repair.";
    } else if (attemptsUsedInCurrentCycle(state) >= node.maxAttempts) {
      state.status = "blocked";
      state.blocker = "Verification rejected: repair attempts exhausted.";
    } else {
      state.status = "stale";
      state.blocker = undefined;
      reopened.push(node.id);
    }
  }
  if (producerTargets.length > 0 && reopened.length === 0) {
    source.status = "blocked";
    source.repairInstructions = normalizedFindings.map((entry) => `Repair finding from ${reviewed.workflowId}: ${entry}`);
    source.blocker = "Verification rejected: declared producer repair attempts are exhausted or require readback.";
  }
  run.updatedAt = now;
  return reopened;
}

/**
 * Counts repeat repair rounds whose reviewed producer bytes did not change. The audit's own
 * findings output is deliberately excluded: rewriting a report is not product progress.
 */
function consecutiveNoProgressAttempts(plan: CompiledPlan, reviewed: CompiledRunNode, state: RunNodeStateV2): number {
  const rejected = currentCycleAttempts(state).filter((attempt) => attempt.independentVerification?.verdict === "rejected");
  const current = rejected.at(-1);
  if (!current) return 0;
  const currentFingerprint = repairSubjectFingerprint(plan, reviewed, current);
  if (!currentFingerprint) return 0;
  let repeats = 0;
  for (let index = rejected.length - 2; index >= 0; index -= 1) {
    const priorFingerprint = repairSubjectFingerprint(plan, reviewed, rejected[index]!);
    if (!priorFingerprint || priorFingerprint !== currentFingerprint) break;
    repeats += 1;
  }
  return repeats;
}

function repairSubjectFingerprint(plan: CompiledPlan, reviewed: CompiledRunNode, attempt: AttemptRecordV2): string | undefined {
  const receipt = attempt.independentVerification;
  if (!receipt) return undefined;
  const targetNodeIds = reviewed.reviewOf?.length ? reviewed.reviewOf : [reviewed.id];
  const artifactIds = new Set(targetNodeIds.flatMap((nodeId) => plan.nodes.find((node) => node.id === nodeId)?.outputs ?? []));
  if (artifactIds.size === 0) return undefined;
  const subjects = receipt.subjects
    .filter((subject) => artifactIds.has(subject.artifactId as never))
    .map((subject) => [subject.artifactId, subject.path, subject.fingerprint] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  if (subjects.length !== artifactIds.size) return undefined;
  return sha256(JSON.stringify(subjects));
}

/** Content fingerprint for an environmental artifact: file bytes, or a sorted walk for a directory. */
function fingerprintWorkspacePath(target: string): string {
  const hash = createHash("sha256");
  const visit = (current: string, relative: string): void => {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return;
    hash.update(`${relative}\0${stat.size}\0`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(current).sort()) visit(path.join(current, name), path.posix.join(relative, name));
    } else if (stat.isFile()) hash.update(readFileSync(current));
  };
  visit(target, ".");
  return hash.digest("hex");
}

/**
 * Accept input material already present in the workspace when this run has no producing
 * attempt for that binding. Existing input availability and verified production during a
 * run are separate facts; both carry content fingerprints for subsequent invalidation.
 *
 * The rule: a binding with NO producing attempt recorded in this run (`producedBy` unset), whose
 * bound file actually exists in the workspace, is pre-existing material — accepted, with a
 * content fingerprint, exactly as if the launch flow that authored it were an upstream run.
 * Invariants preserved, in the same spirit as reconcilePatch:
 * - acceptance is grounded in the file existing, never in anyone's prose claim about it;
 * - absent material stays unaccepted, and the reading node waits honestly;
 * - the moment a producer re-produces the artifact IN this run, reconcilePatch retakes the
 *   binding (producedBy set, acceptance false pending that node's own verification) — in-run
 *   production never rides in on this rule;
 * - pre-existing material that changed between sessions invalidates descendants transitively,
 *   the same staleness event as a re-produced output;
 * - a binding path that escapes the workspace is never accepted.
 *
 * Idempotent per session start; run.ts calls it after seeding or resuming, and the read-only
 * planner applies the same reconciliation in memory so its report matches what a session would do.
 */
export function reconcileEnvironmentalArtifacts(plan: CompiledPlan, run: RunStateDocument, workspaceRoot: string, now: string): RunNodeId[] {
  const resolvedRoot = path.resolve(workspaceRoot);
  const changed: string[] = [];
  let touched = false;
  for (const binding of run.artifactBindings) {
    if (binding.producedBy !== undefined) continue;
    const absolute = path.resolve(resolvedRoot, binding.path);
    if (absolute !== resolvedRoot && !absolute.startsWith(`${resolvedRoot}${path.sep}`)) continue;
    if (!existsSync(absolute)) continue;
    const fingerprint = fingerprintWorkspacePath(absolute);
    if (binding.accepted && binding.fingerprint === fingerprint) continue;
    if (binding.accepted && binding.fingerprint !== undefined && binding.fingerprint !== fingerprint) changed.push(binding.artifactId);
    binding.accepted = true;
    binding.fingerprint = fingerprint;
    touched = true;
  }
  if (touched) run.updatedAt = now;
  return changed.length > 0 ? invalidateDescendants(plan, run, changed, now) : [];
}

/**
 * Work-order occurrences are independent of the compiled node they reuse. After the first
 * occurrence succeeds, the node stays `succeeded` and the frontier will never offer it again.
 * An unmatched authorized occurrence therefore has to reopen that node (to `stale`) so a later
 * session can dispatch it without piggybacking on an ordinary pending frontier entry.
 */
export function reopenNodesForAuthorizedWorkOrders(plan: CompiledPlan, run: RunStateDocument, now: string): RunNodeId[] {
  const unmatchedWorkflows = new Set(
    Object.values(run.workOrders ?? {})
      .filter((occurrence) => isOccurrenceDispatchable(run, occurrence))
      .map((occurrence) => occurrence.workflowId),
  );
  if (unmatchedWorkflows.size === 0) return [];
  const reopened: RunNodeId[] = [];
  for (const node of plan.nodes) {
    if (!unmatchedWorkflows.has(node.workflowId)) continue;
    const state = run.nodes[node.id];
    if (!state || (state.status !== "succeeded" && state.status !== "failed" && state.status !== "blocked")) continue;
    const lastAttempt = state.attempts.at(-1);
    if (state.status === "blocked" && (state.blocker === VERIFICATION_REQUIRED_BLOCKER || lastAttempt?.status === "blocked")) {
      continue;
    }
    state.status = "stale";
    state.blocker = undefined;
    reopened.push(node.id);
  }
  if (reopened.length > 0) run.updatedAt = now;
  return reopened;
}

export function reopenRecurringNodes(plan: CompiledPlan, run: RunStateDocument, now: string): RunNodeId[] {
  const reopened: RunNodeId[] = [];
  const nowMs = Date.parse(now);
  for (const node of plan.nodes) {
    if (!node.recurrenceDays || node.recurrenceDays <= 0) continue;
    const state = run.nodes[node.id];
    if (!state || state.status !== "succeeded") continue;
    const lastAttempt = state.attempts.at(-1);
    const lastDone = lastAttempt?.finishedAt ?? lastAttempt?.startedAt ?? run.createdAt;
    const elapsedDays = (nowMs - Date.parse(lastDone)) / 86_400_000;
    if (elapsedDays < node.recurrenceDays) continue;
    state.attemptCycleStart = state.attempts.length;
    state.status = "stale";
    state.blocker = undefined;
    // acceptedOutputFingerprint and output bindings retain last cycle's accepted proof
    // until the new attempt replaces it. Only the status reopens.
    reopened.push(node.id);
  }
  if (reopened.length > 0) run.updatedAt = now;
  return reopened;
}

/** Reopen dependencies that a downstream node requires fresh for each of its attempt cycles. */
export function refreshDependenciesBeforeFrontier(
  plan: CompiledPlan,
  run: RunStateDocument,
  now: string,
  allowedConsumerIds?: ReadonlySet<RunNodeId>,
): RunNodeId[] {
  const reopened: RunNodeId[] = [];
  const eligible = new Set<Status>(["pending", "ready", "stale"]);
  const accepted = new Set(run.artifactBindings.filter((binding) => binding.accepted).map((binding) => binding.artifactId));
  const lockedDependencies = new Set<RunNodeId>();
  for (const node of plan.nodes) {
    if (allowedConsumerIds && !allowedConsumerIds.has(node.id)) continue;
    const consumer = run.nodes[node.id];
    if (!consumer || !eligible.has(consumer.status)) continue;
    const cycles = new Set(consumer.dependencyRefreshCycles ?? []);
    for (const refresh of node.refreshDependencies) {
      if (cycles.has(`${refresh.nodeId}@${consumer.attempts.length}`)) lockedDependencies.add(refresh.nodeId);
    }
  }
  for (const node of plan.nodes) {
    if (allowedConsumerIds && !allowedConsumerIds.has(node.id)) continue;
    if (node.refreshDependencies.length === 0) continue;
    const consumer = run.nodes[node.id];
    if (!consumer || !eligible.has(consumer.status)) continue;
    if (attemptsUsedInCurrentCycle(consumer) >= node.maxAttempts) {
      consumer.status = "blocked";
      consumer.blocker = "Required dependency refresh skipped because this work has no attempts remaining.";
      continue;
    }
    const refreshIds = new Set(node.refreshDependencies.map((entry) => entry.nodeId));
    if (node.dependencies.some((dependencyId) => !refreshIds.has(dependencyId) && run.nodes[dependencyId]?.status !== "succeeded")) continue;
    const refreshOutputs = new Set(plan.nodes.filter((candidate) => refreshIds.has(candidate.id)).flatMap((candidate) => candidate.outputs));
    if (node.inputs.some((artifactId) => !refreshOutputs.has(artifactId) && !accepted.has(artifactId))) continue;
    const cycles = new Set(consumer.dependencyRefreshCycles ?? []);
    for (const refresh of node.refreshDependencies) {
      const dependencyId = refresh.nodeId;
      const token = `${dependencyId}@${consumer.attempts.length}`;
      if (cycles.has(token)) continue;
      if (lockedDependencies.has(dependencyId)) continue;
      const dependency = run.nodes[dependencyId];
      if (!dependency || dependency.status !== "succeeded") continue;
      const dependencyNode = plan.nodes.find((candidate) => candidate.id === dependencyId);
      if (!dependencyNode || attemptsUsedInCurrentCycle(dependency) >= dependencyNode.maxAttempts) {
        consumer.status = "blocked";
        consumer.blocker = `Required refresh unavailable: "${dependencyNode?.title ?? dependencyId}" has no refresh attempts remaining.`;
        continue;
      }
      cycles.add(token);
      lockedDependencies.add(dependencyId);
      dependency.status = "stale";
      dependency.blocker = undefined;
      dependency.refreshInstructions = [refresh.instructions];
      for (const binding of run.artifactBindings) {
        if (!dependencyNode?.outputs.some((artifactId) => artifactId === binding.artifactId)) continue;
        if (binding.accepted && binding.fingerprint) binding.refreshBaselineFingerprint = binding.fingerprint;
        binding.accepted = false;
      }
      reopened.push(dependencyId);
    }
    consumer.dependencyRefreshCycles = [...cycles];
  }
  if (reopened.length > 0) run.updatedAt = now;
  return reopened;
}

/** Keep a failed scoped refresh unaccepted and retry-eligible for a later authorized session. */
export function deferDependencyRefreshAfterFailure(plan: CompiledPlan, run: RunStateDocument, dependencyId: RunNodeId, now: string): boolean {
  const dependencyNode = plan.nodes.find((node) => node.id === dependencyId);
  const dependency = run.nodes[dependencyId];
  if (!dependencyNode || !dependency?.refreshInstructions?.length) return false;
  const exhausted = attemptsUsedInCurrentCycle(dependency) >= dependencyNode.maxAttempts;
  dependency.status = exhausted ? "blocked" : "stale";
  dependency.blocker = exhausted ? "Scoped refresh failed after the final available attempt." : undefined;
  if (exhausted) {
    dependency.refreshInstructions = undefined;
    for (const consumerNode of plan.nodes) {
      if (!consumerNode.refreshDependencies.some((refresh) => refresh.nodeId === dependencyId)) continue;
      const consumer = run.nodes[consumerNode.id];
      if (!consumer?.dependencyRefreshCycles?.some((cycle) => cycle.startsWith(`${dependencyId}@`))) continue;
      consumer.dependencyRefreshCycles = consumer.dependencyRefreshCycles.filter((cycle) => !cycle.startsWith(`${dependencyId}@`));
      consumer.status = "blocked";
      consumer.blocker = `Required refresh unavailable: "${dependencyNode.title}" exhausted its attempts.`;
    }
  }
  run.updatedAt = now;
  return true;
}

/** Remove obsolete scoped instructions when applicability parks the consumer that requested them. */
export function abandonDependencyRefreshesForConsumer(plan: CompiledPlan, run: RunStateDocument, consumerId: RunNodeId, now: string): RunNodeId[] {
  const consumerNode = plan.nodes.find((node) => node.id === consumerId);
  const consumer = run.nodes[consumerId];
  if (!consumerNode || !consumer?.dependencyRefreshCycles?.length) return [];
  const abandoned: RunNodeId[] = [];
  for (const refresh of consumerNode.refreshDependencies) {
    const prefix = `${refresh.nodeId}@`;
    if (!consumer.dependencyRefreshCycles.some((cycle) => cycle.startsWith(prefix))) continue;
    consumer.dependencyRefreshCycles = consumer.dependencyRefreshCycles.filter((cycle) => !cycle.startsWith(prefix));
    const stillClaimed = plan.nodes.some((candidate) => {
      if (candidate.id === consumerId || !candidate.refreshDependencies.some((entry) => entry.nodeId === refresh.nodeId)) return false;
      const state = run.nodes[candidate.id];
      return Boolean(state && ["pending", "ready", "stale"].includes(state.status) && state.dependencyRefreshCycles?.some((cycle) => cycle.startsWith(prefix)));
    });
    if (!stillClaimed) {
      const dependency = run.nodes[refresh.nodeId];
      if (dependency) dependency.refreshInstructions = undefined;
    }
    abandoned.push(refresh.nodeId);
  }
  if (abandoned.length > 0) run.updatedAt = now;
  return abandoned;
}

/** Staleness invalidation: a changed accepted input invalidates descendants transitively. */
export function invalidateDescendants(
  plan: CompiledPlan,
  run: RunStateDocument,
  changedArtifactIds: readonly string[],
  now: string,
  preservedNodeIds: ReadonlySet<RunNodeId> = new Set(),
): RunNodeId[] {
  const changed = new Set<string>(changedArtifactIds);
  const invalidated: RunNodeId[] = [];
  const visited = new Set<string>();
  let advanced = true;

  while (advanced) {
    advanced = false;
    for (const node of plan.nodes) {
      if (preservedNodeIds.has(node.id)) continue;
      const state = run.nodes[node.id];
      if (!state || state.status === "stale" || visited.has(node.id)) continue;
      if (node.inputs.some((artifactId) => changed.has(artifactId))) {
        visited.add(node.id);
        const priorExternalAttempt = state.attempts.length > 0 && requiresReadbackBeforeRepeat(node);
        state.status = priorExternalAttempt ? "needs_readback" : "stale";
        // A stale node will be re-examined and re-run; a blocker string from its previous life
        // ("Verification required", a park reason) would otherwise survive into digests and
        // pending-verification listings that key on blocker text.
        state.blocker = priorExternalAttempt ? "Inputs changed; confirm prior external effects before repeating this work." : undefined;
        state.acceptedOutputFingerprint = undefined;
        // A scoped refresh token is valid only for the dependency result it opened. If that
        // dependency is invalidated and later re-produced generically, every consumer must earn
        // a new scoped cycle before it can enter the frontier.
        for (const consumerNode of plan.nodes) {
          if (!consumerNode.refreshDependencies.some((refresh) => refresh.nodeId === node.id)) continue;
          const consumerState = run.nodes[consumerNode.id];
          if (!consumerState?.dependencyRefreshCycles) continue;
          consumerState.dependencyRefreshCycles = consumerState.dependencyRefreshCycles.filter((cycle) => !cycle.startsWith(`${node.id}@`));
        }
        for (const artifactId of node.outputs) {
          changed.add(artifactId);
          const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId);
          if (binding) binding.accepted = false;
        }
        invalidated.push(node.id);
        advanced = true;
      }
    }
  }

  if (invalidated.length > 0) run.updatedAt = now;
  return invalidated;
}

/**
 * Session wall-clock deadline (KTD6), enforced independently of any single attempt's heartbeat
 * TTL. The cap bounds the CURRENT session, so the deadline is measured from the session's own
 * start — a resumed run must not inherit a prior session's elapsed clock (R2's bounded-session
 * contract; measuring from run.createdAt made every resume time out instantly).
 */
export function wallClockDeadline(run: RunStateDocument, sessionStartedAt: string = run.createdAt): string {
  return new Date(Date.parse(sessionStartedAt) + run.wallClockCapSeconds * 1000).toISOString();
}

export function isWallClockExceeded(run: RunStateDocument, now: string, sessionStartedAt: string = run.createdAt): boolean {
  return Date.parse(now) >= Date.parse(wallClockDeadline(run, sessionStartedAt));
}

/** Write to `<path>.tmp`, fsync, then rename — a reader never observes a partial write. */
function writeAtomic(targetPath: string, contents: string): void {
  assertReadableWorkspaceFile(targetPath);
  mkdirSync(dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  const fd = openSync(tmpPath, "w");
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, targetPath);
}

export function writeRunState(runStatePath: string, run: RunStateDocument): void {
  writeAtomic(runStatePath, `${JSON.stringify(run, null, 2)}\n`);
}

/** Re-loadable across processes (R1): reads and schema-validates, never trusts an unvalidated file. */
export function loadRunState(runStatePath: string): RunStateDocument {
  assertReadableWorkspaceFile(runStatePath);
  const parsed: unknown = JSON.parse(readFileSync(runStatePath, "utf8"));
  const result = validateRunState(parsed);
  if (!result.valid) throw new Error(`Invalid run state at ${runStatePath}: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return result.value!;
}

export function buildCheckpoint(run: RunStateDocument, writerSessionId: string, stateHash: string, now: string): CheckpointDocument {
  return { schemaVersion: "1.0.0", writtenAt: now, writerSessionId, stateHash, runState: run };
}

export function writeCheckpoint(checkpointPath: string, checkpoint: CheckpointDocument): void {
  writeAtomic(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

export function loadCheckpoint(checkpointPath: string): CheckpointDocument {
  assertReadableWorkspaceFile(checkpointPath);
  const parsed: unknown = JSON.parse(readFileSync(checkpointPath, "utf8"));
  const result = validateCheckpoint(parsed);
  if (!result.valid) throw new Error(`Invalid checkpoint at ${checkpointPath}: ${result.issues.map((issue) => issue.message).join("; ")}`);
  return result.value!;
}
