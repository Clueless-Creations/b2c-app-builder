import type { AuthorizationSnapshot } from "../operating-model/authorize.js";
import type { OperatingAgreement } from "../operating-model/agreements.js";
import type { Mandate } from "../operating-model/mandates.js";
import type { ContextCapsule } from "../context/receipt.js";
import type { FounderQuestion } from "./founder-gate.js";
import type { KnowledgeSection, RouteCandidate, RouteDecision, RouteRequestKind } from "../routing/types.js";
import type { DomainAuthorityRecord } from "../schema/domain-authority.js";
import type { ActionClass, GrantableDomainId, GrantsMap, RunStateDocument } from "../schema/types.js";
import type { WorkOrderProofPolicy } from "../work-orders/types.js";
import type { CatalogInput } from "../engine/compile.js";

export const operateModes = ["preview", "commit", "replay"] as const;
export type OperateMode = (typeof operateModes)[number];

export const operateSources = ["cli", "mcp", "schedule", "adapter"] as const;
export type OperateSource = (typeof operateSources)[number];

export const operateActionStatuses = ["previewed", "committed", "refused", "replayed"] as const;
export type OperateActionStatus = (typeof operateActionStatuses)[number];

export const operateLeaseStates = ["active", "revoked", "held", "absent"] as const;
export type OperateLeaseState = (typeof operateLeaseStates)[number];

export interface OperateLoopLinks {
  decisionId: string;
  objectiveId: string;
  metricId: string;
  expectationId: string;
  decisionStatus: string;
  horizonAt: string;
}

export interface OperateWorld {
  /** Registry identity used to keep workspace-bound authority from crossing businesses. */
  workspaceId?: string;
  businessRevision: string;
  compositionPin: string;
  /** Raw execution contract. Registered callers bind this from disk; missing evidence refuses. */
  catalog?: CatalogInput;
  candidates: readonly RouteCandidate[];
  sections: readonly KnowledgeSection[];
  liveRevisions: Record<string, string>;
  agreement: OperatingAgreement;
  mandate?: Mandate;
  grants: GrantsMap;
  authority?: readonly DomainAuthorityRecord[];
  domainId: GrantableDomainId;
  actionClass: ActionClass;
  credentialsPresent?: boolean;
  links: OperateLoopLinks;
  proofPolicy: WorkOrderProofPolicy;
  workflowId: string;
  run?: RunStateDocument;
  runStatePath?: string;
}

export interface OperateGates {
  workspaceRegistered: boolean;
  readOnlySurface: boolean;
  lease: OperateLeaseState;
}

export interface OperateTransport {
  mode: OperateMode;
  source: OperateSource;
  clock: string;
  principalId: string;
  problem: string;
  kind: RouteRequestKind;
  idempotencyKey: string;
  expectedBusinessRevision?: string;
  policyRevision?: string;
  recognized?: boolean;
  requiredFacts?: readonly string[];
  availableFacts?: readonly string[];
  packId?: string;
  recallProposedIds?: readonly string[];
  forbiddenDomains?: readonly string[];
  recordedReceipt?: OperateReceipt;
  ambiguityBand?: number;
}

export interface OperateInput {
  world: OperateWorld;
  transport: OperateTransport;
  gates: OperateGates;
}

export interface OperateReceipt {
  mode: OperateMode;
  source: OperateSource;
  actionStatus: OperateActionStatus;
  reasonCode: string;
  reason: string;
  recordedAt: string;
  stateRevision: string;
  compositionPin: string;
  decision: RouteDecision;
  contextDigest?: string;
  context?: ContextCapsule;
  authority: Pick<AuthorizationSnapshot, "ok" | "reasonCode" | "reason">;
  occurrenceId?: string;
  created?: boolean;
  followUpTrigger?: string;
  /** Set only on a mandate-required/mandate-revoked refusal whose action class is directly protected (spend/release/destructive) — see operating-service.ts. Absent everywhere else, including every non-protected refusal. */
  founderQuestion?: FounderQuestion;
}
