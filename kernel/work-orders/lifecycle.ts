import { isMandateCurrent, type Mandate } from "../operating-model/mandates.js";
import type { RunStateDocument } from "../schema/types.js";
import type { WorkOrderOccurrence, WorkOrderStatus, WorkOrderTransition } from "./types.js";

export interface OccurrenceDispatchOptions {
  mandates?: readonly Mandate[];
  now?: string;
}

function store(run: RunStateDocument): Record<string, WorkOrderOccurrence> {
  return (run.workOrders ??= {});
}

function occurrenceOf(run: RunStateDocument, occurrenceId: string): WorkOrderOccurrence {
  const occurrence = store(run)[occurrenceId];
  if (!occurrence) throw new Error(`Unknown work-order occurrence ${occurrenceId}`);
  return occurrence;
}

function transition(occurrence: WorkOrderOccurrence, at: string, to: WorkOrderStatus, ok: boolean, reasonCode: string): WorkOrderTransition {
  const entry: WorkOrderTransition = { at, from: occurrence.status, to: ok ? to : occurrence.status, ok, reasonCode };
  occurrence.transitions = [...occurrence.transitions, entry];
  if (ok) occurrence.status = to;
  return entry;
}

function hasRunningAttempt(run: RunStateDocument, occurrence: WorkOrderOccurrence): boolean {
  return Object.values(run.nodes).some((state) =>
    state.attempts.some((attempt) => attempt.workOrderOccurrenceId === occurrence.id && attempt.status === "running"),
  );
}

function mandateAllowsDispatch(occurrence: WorkOrderOccurrence, options?: OccurrenceDispatchOptions): boolean {
  if (options?.mandates) {
    const live = options.mandates.find((mandate) => mandate.id === occurrence.mandateId);
    return isMandateCurrent(live, options.now ?? "");
  }
  return occurrence.snapshots.mandateStatus === "active";
}

export function isOccurrenceDispatchable(run: RunStateDocument, occurrence: WorkOrderOccurrence, options?: OccurrenceDispatchOptions): boolean {
  return occurrence.status === "authorized" && !hasRunningAttempt(run, occurrence) && mandateAllowsDispatch(occurrence, options);
}

export function takeAuthorizedOccurrence(run: RunStateDocument, workflowId: string, options?: OccurrenceDispatchOptions): WorkOrderOccurrence | undefined {
  return Object.values(store(run))
    .filter((occurrence) => occurrence.workflowId === workflowId && isOccurrenceDispatchable(run, occurrence, options))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id))[0];
}

export function syncOccurrenceMandates(run: RunStateDocument, mandates: readonly Mandate[], now: string): string[] {
  const revokedIds: string[] = [];
  for (const occurrence of Object.values(store(run))) {
    const live = mandates.find((mandate) => mandate.id === occurrence.mandateId);
    if (!live) continue;
    if (occurrence.snapshots.mandateStatus === "active" && !isMandateCurrent(live, now)) {
      revokeOccurrenceMandate(run, occurrence.id, now);
      revokedIds.push(occurrence.id);
    }
  }
  return revokedIds;
}

export function restoreOccurrenceAfterAttempt(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.status !== "running") {
    return transition(occurrence, now, occurrence.status, false, "work_order.not_running");
  }
  run.updatedAt = now;
  return transition(occurrence, now, "authorized", true, "work_order.attempt_failed");
}

export function exhaustOccurrence(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.status === "exhausted") {
    return occurrence.transitions.at(-1) ?? transition(occurrence, now, "exhausted", true, "work_order.attempts_exhausted");
  }
  if (occurrence.status !== "authorized" && occurrence.status !== "running") {
    return transition(occurrence, now, occurrence.status, false, "work_order.not_exhaustible");
  }
  run.updatedAt = now;
  return transition(occurrence, now, "exhausted", true, "work_order.attempts_exhausted");
}

export function capsuleFromOccurrence(occurrence: WorkOrderOccurrence | undefined): { sourceIds: string[] } | undefined {
  if (!occurrence) return undefined;
  return { sourceIds: [...occurrence.contextSourceIds] };
}

export function linkAttempt(run: RunStateDocument, occurrenceId: string, attemptId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.snapshots.mandateStatus !== "active") {
    return transition(occurrence, now, occurrence.status, false, "work_order.mandate_revoked");
  }
  if (!occurrence.attemptIds.includes(attemptId)) occurrence.attemptIds = [...occurrence.attemptIds, attemptId];
  run.updatedAt = now;
  if (occurrence.status === "authorized") return transition(occurrence, now, "running", true, "work_order.attempt_started");
  return occurrence.transitions.at(-1) ?? transition(occurrence, now, occurrence.status, true, "work_order.attempt_linked");
}

export function claimCompletion(run: RunStateDocument, occurrenceId: string, proof: readonly string[], now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.status !== "running") {
    run.updatedAt = now;
    return transition(occurrence, now, occurrence.status, false, "work_order.not_running");
  }
  const hasProof = proof.some((entry) => entry.trim().length > 0);
  if (occurrence.proofPolicy.required && !hasProof) {
    run.updatedAt = now;
    return transition(occurrence, now, occurrence.status, false, "work_order.proof_missing");
  }
  run.updatedAt = now;
  return transition(occurrence, now, "proved", true, "work_order.proved");
}

export function scheduleObservation(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.status !== "proved" && occurrence.status !== "observing") {
    return transition(occurrence, now, occurrence.status, false, "work_order.not_proved");
  }
  run.updatedAt = now;
  return transition(occurrence, now, "observing", true, "work_order.observing");
}

export function completeOccurrence(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.status !== "observing" && occurrence.status !== "proved") {
    return transition(occurrence, now, occurrence.status, false, "work_order.not_ready_to_complete");
  }
  run.updatedAt = now;
  return transition(occurrence, now, "completed", true, "work_order.completed");
}

export function revokeOccurrenceMandate(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderOccurrence {
  const occurrence = occurrenceOf(run, occurrenceId);
  occurrence.snapshots = { ...occurrence.snapshots, mandateStatus: "revoked" };
  occurrence.transitions = [
    ...occurrence.transitions,
    { at: now, from: occurrence.status, to: occurrence.status, ok: false, reasonCode: "work_order.mandate_revoked" },
  ];
  run.updatedAt = now;
  return occurrence;
}

export function applyNextEffect(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  if (occurrence.snapshots.mandateStatus !== "active") {
    run.updatedAt = now;
    return transition(occurrence, now, occurrence.status, false, "work_order.mandate_revoked");
  }
  return linkAttempt(run, occurrenceId, `effect.${now}`, now);
}

function isInstantDue(horizonAt: string, now: string): boolean {
  const horizonMs = Date.parse(horizonAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(horizonMs) || !Number.isFinite(nowMs)) return false;
  return horizonMs <= nowMs;
}

export function dueWorkOrderReviews(run: RunStateDocument, now: string): WorkOrderOccurrence[] {
  return Object.values(store(run))
    .filter((occurrence) => occurrence.status === "observing" && isInstantDue(occurrence.horizonAt, now))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function recordWorkOrderProof(run: RunStateDocument, occurrenceId: string, proof: readonly string[], now: string): WorkOrderTransition {
  const claimed = claimCompletion(run, occurrenceId, proof, now);
  if (!claimed.ok) return claimed;
  return scheduleObservation(run, occurrenceId, now);
}

/** A changed contract cannot reuse an occurrence's prior authorization or proof. History stays recorded. */
export function invalidateOccurrenceContract(run: RunStateDocument, occurrenceId: string, now: string): WorkOrderTransition {
  const occurrence = occurrenceOf(run, occurrenceId);
  run.updatedAt = now;
  return transition(occurrence, now, "refused", true, "work_order.workflow_contract_changed");
}
