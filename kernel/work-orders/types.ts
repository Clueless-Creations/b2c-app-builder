export const workOrderStatuses = ["authorized", "running", "proved", "observing", "completed", "exhausted", "refused"] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

export interface WorkOrderProofPolicy {
  kind: string;
  required: boolean;
}

export interface WorkOrderTransition {
  at: string;
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  ok: boolean;
  reasonCode: string;
}

export interface WorkOrderReadinessSnapshot {
  capabilityReady: boolean;
  recordedAt: string;
}

export interface WorkOrderSnapshots {
  decisionStatus: string;
  mandateStatus: "active" | "revoked";
  contextSourceIds: string[];
}

export interface WorkOrderOccurrence {
  id: string;
  revision: number;
  workflowId: string;
  decisionId: string;
  objectiveId: string;
  metricId: string;
  mandateId: string;
  contextSourceIds: string[];
  readinessSnapshot: WorkOrderReadinessSnapshot;
  expectationId: string;
  horizonAt: string;
  proofPolicy: WorkOrderProofPolicy;
  status: WorkOrderStatus;
  idempotencyKey: string;
  recordedAt: string;
  attemptIds: string[];
  transitions: WorkOrderTransition[];
  snapshots: WorkOrderSnapshots;
}

export interface InstantiateWorkOrderInput {
  workflowId: string;
  decisionId: string;
  objectiveId: string;
  metricId: string;
  mandateId: string;
  mandateStatus: "active" | "revoked";
  decisionStatus: string;
  contextSourceIds: readonly string[];
  readinessSnapshot: WorkOrderReadinessSnapshot;
  expectationId: string;
  horizonAt: string;
  proofPolicy: WorkOrderProofPolicy;
  idempotencyKey: string;
  recordedAt: string;
}
