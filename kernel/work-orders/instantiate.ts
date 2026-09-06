import { createHash } from "node:crypto";
import type { RunStateDocument } from "../schema/types.js";
import type { InstantiateWorkOrderInput, WorkOrderOccurrence } from "./types.js";

export function workOrderIdFor(idempotencyKey: string): string {
  return `wo.${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;
}

export interface InstantiateWorkOrderResult {
  occurrence: WorkOrderOccurrence;
  created: boolean;
  conflict: boolean;
}

function routeFingerprint(
  input: Pick<
    InstantiateWorkOrderInput,
    "workflowId" | "decisionId" | "objectiveId" | "metricId" | "mandateId" | "contextSourceIds" | "expectationId" | "horizonAt" | "proofPolicy"
  >,
): string {
  return JSON.stringify({
    workflowId: input.workflowId,
    decisionId: input.decisionId,
    objectiveId: input.objectiveId,
    metricId: input.metricId,
    mandateId: input.mandateId,
    contextSourceIds: [...input.contextSourceIds].sort(),
    expectationId: input.expectationId,
    horizonAt: input.horizonAt,
    proofPolicy: { kind: input.proofPolicy.kind, required: input.proofPolicy.required },
  });
}

export function instantiateWorkOrder(run: RunStateDocument, input: InstantiateWorkOrderInput): InstantiateWorkOrderResult {
  const store = (run.workOrders ??= {});
  const existing = Object.values(store).find((occurrence) => occurrence.idempotencyKey === input.idempotencyKey);
  if (existing) {
    return { occurrence: existing, created: false, conflict: routeFingerprint(existing) !== routeFingerprint(input) };
  }

  const occurrence: WorkOrderOccurrence = {
    id: workOrderIdFor(input.idempotencyKey),
    revision: 1,
    workflowId: input.workflowId,
    decisionId: input.decisionId,
    objectiveId: input.objectiveId,
    metricId: input.metricId,
    mandateId: input.mandateId,
    contextSourceIds: [...input.contextSourceIds],
    readinessSnapshot: { ...input.readinessSnapshot },
    expectationId: input.expectationId,
    horizonAt: input.horizonAt,
    proofPolicy: { ...input.proofPolicy },
    status: "authorized",
    idempotencyKey: input.idempotencyKey,
    recordedAt: input.recordedAt,
    attemptIds: [],
    transitions: [{ at: input.recordedAt, from: "authorized", to: "authorized", ok: true, reasonCode: "work_order.authorized" }],
    snapshots: {
      decisionStatus: input.decisionStatus,
      mandateStatus: input.mandateStatus,
      contextSourceIds: [...input.contextSourceIds],
    },
  };
  store[occurrence.id] = occurrence;
  run.updatedAt = input.recordedAt;
  return { occurrence, created: true, conflict: false };
}
