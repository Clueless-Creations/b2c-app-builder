/**
 * The single status vocabulary shared by business-state lanes and engine run nodes
 * (KTD6: "the lane-status/RunNodeStatus split dies"). Keep in sync with
 * kernel/schema/status.schema.json's $defs/status enum.
 */
import type { OperatingModel } from "../operating-model/types.js";
import type { WorkOrderOccurrence } from "../work-orders/types.js";

export type { EvidenceRequest, OperatingEvent, OperatingModel, OperatingRecord } from "../operating-model/types.js";

export type Status =
  | "pending"
  | "ready"
  | "running"
  | "waiting_founder"
  | "blocked"
  | "orphaned"
  | "needs_readback"
  | "succeeded"
  | "failed"
  | "stale"
  | "skipped"
  | "not_needed"
  | "deferred"
  | "cancelled";

export const statusValues: readonly Status[] = [
  "pending",
  "ready",
  "running",
  "waiting_founder",
  "blocked",
  "orphaned",
  "needs_readback",
  "succeeded",
  "failed",
  "stale",
  "skipped",
  "not_needed",
  "deferred",
  "cancelled",
];

/**
 * How an agent reaches and operates a provider: the typed vocabulary behind the prose
 * "setup route" in knowledge/operations/provider-state-recipes.md. Each provisioning
 * manifest entry declares the routes its provider supports (adapters/provisioning/requirements.ts
 * accessRoutes); business state records the one in use (providers.<name>.accessRoute — "not_selected" until chosen). Finer-grained than the
 * agent-operations ledger's capability/action vocabulary; ledgerRouteFor() in
 * adapters/provisioning/requirements.ts is the total coarsening map between the two.
 */
export type AccessRoute = "mcp" | "api" | "cli" | "browser" | "native_device" | "skill_pack" | "manual";

export const accessRouteValues: readonly AccessRoute[] = ["mcp", "api", "cli", "browser", "native_device", "skill_pack", "manual"];

/**
 * Workspace/repository kind. Distinct from launch scope (`essentials` / `full`).
 * Omitted on a business means default validator routing.
 */
export const repositoryProfileIds = ["app-source", "founder-operating", "public-package", "marketing-site"] as const;
export type RepositoryProfileId = (typeof repositoryProfileIds)[number];

export function isRepositoryProfileId(value: string): value is RepositoryProfileId {
  return (repositoryProfileIds as readonly string[]).includes(value);
}

/**
 * The 12 domains the base catalog grants over. Pack-composed domains use the same `domain.*`
 * shape and are grantable only when the catalog marks them so (KTD4).
 */
export type BaseGrantableDomainId =
  | "domain.research"
  | "domain.product"
  | "domain.experience"
  | "domain.words"
  | "domain.design"
  | "domain.engineering"
  | "domain.growth"
  | "domain.data"
  | "domain.money"
  | "domain.store"
  | "domain.trust"
  | "domain.operations";

/** Grant keys are domain IDs. The base catalog pins twelve; additive packs may add more. */
export type GrantableDomainId = `domain.${string}`;

export const grantableDomainIds: readonly BaseGrantableDomainId[] = [
  "domain.research",
  "domain.product",
  "domain.experience",
  "domain.words",
  "domain.design",
  "domain.engineering",
  "domain.growth",
  "domain.data",
  "domain.money",
  "domain.store",
  "domain.trust",
  "domain.operations",
];

export const systemDomainIds: readonly string[] = ["domain.process", "domain.orchestration"];

/** Every domain the execution engine may compile. System domains are runtime-owned and never founder-grantable. */
export type SystemDomainId = "domain.process" | "domain.orchestration" | "domain.machine";
export type DomainId = GrantableDomainId | SystemDomainId;

export function isSystemDomainId(value: string): value is SystemDomainId {
  return value === "domain.process" || value === "domain.orchestration" || value === "domain.machine";
}

/** Business units are a copy-layer grouping over domains (KTD3); a unit selection writes the same grant level to every member domain. */
export const businessUnits = ["Product", "Design", "Engineering", "Growth", "Analytics", "Revenue", "Store", "Trust", "Operations"] as const;
export type BusinessUnit = (typeof businessUnits)[number];

export function isBusinessUnit(value: string): value is BusinessUnit {
  return (businessUnits as readonly string[]).includes(value);
}

export const businessUnitDomains: Record<BusinessUnit, readonly BaseGrantableDomainId[]> = {
  Product: ["domain.research", "domain.product", "domain.experience", "domain.words"],
  Design: ["domain.design"],
  Engineering: ["domain.engineering"],
  Growth: ["domain.growth"],
  Analytics: ["domain.data"],
  Revenue: ["domain.money"],
  Store: ["domain.store"],
  Trust: ["domain.trust"],
  Operations: ["domain.operations"],
};

/** The 22 business-state lane keys shared with the catalog. */
export type LaneKey =
  | "paid_tool_routing"
  | "secrets"
  | "security"
  | "research"
  | "traceability"
  | "experience"
  | "product"
  | "design"
  | "emotional_design"
  | "content_assets"
  | "analytics_attribution"
  | "paid_user_acquisition"
  | "onboarding"
  | "revenue"
  | "store_console"
  | "apple_signing"
  | "privacy_legal"
  | "email"
  | "orchestration"
  | "engineering"
  | "growth"
  | "post_launch_ops";

export const laneKeys: readonly LaneKey[] = [
  "paid_tool_routing",
  "secrets",
  "security",
  "research",
  "traceability",
  "experience",
  "product",
  "design",
  "emotional_design",
  "content_assets",
  "analytics_attribution",
  "paid_user_acquisition",
  "onboarding",
  "revenue",
  "store_console",
  "apple_signing",
  "privacy_legal",
  "email",
  "orchestration",
  "engineering",
  "growth",
  "post_launch_ops",
];

/** Action classes (knowledge/operations/frontier-agent-operations.md). */
export type ActionClass = "observe" | "draft" | "mutate" | "publish" | "spend" | "release" | "destructive";

/** R8's six protected classes, layered onto action classes as a tag rather than a new gateClass value (KTD4). */
export type ProtectedCategory = "spend" | "credentials_access" | "legal_pricing" | "public_actions" | "release" | "destructive";

export const protectedCategories: readonly ProtectedCategory[] = ["spend", "credentials_access", "legal_pricing", "public_actions", "release", "destructive"];

/** Waivable action classes: observe/draft never need a waiver, so they are excluded here. */
export type WaivableActionClass = "mutate" | "publish" | "spend" | "release" | "destructive";

export type GrantLevel = "review-first" | "run-with-guardrails" | "full";

export const grantLevels: readonly GrantLevel[] = ["review-first", "run-with-guardrails", "full"];

/** review-first -> draft ceiling; run-with-guardrails -> mutate/publish ceiling (protected classes still gated); full -> destructive ceiling (protected classes only via waivers). */
export const grantLevelCeilings: Record<GrantLevel, readonly ActionClass[]> = {
  "review-first": ["observe", "draft"],
  "run-with-guardrails": ["observe", "draft", "mutate", "publish"],
  full: ["observe", "draft", "mutate", "publish", "destructive"],
};

export type PrerequisiteStatus = "unverified" | "verified" | "lapsed";

export interface DopplerAuthProbe {
  id: string;
  kind: "doppler_auth";
  ttlSeconds: number;
  status: PrerequisiteStatus;
  verifiedAt?: string;
  evidencePath?: string;
}

export interface BudgetFundedProbe {
  id: string;
  kind: "budget_funded";
  ttlSeconds: number;
  status: PrerequisiteStatus;
  verifiedAt?: string;
  budgetRef: string;
}

export interface CustomProbe {
  id: string;
  kind: "custom";
  ttlSeconds: number;
  status: PrerequisiteStatus;
  verifiedAt?: string;
  evidencePath?: string;
  description: string;
}

export type PrerequisiteProbe = DopplerAuthProbe | BudgetFundedProbe | CustomProbe;

export interface Grant {
  domainId: GrantableDomainId;
  level: GrantLevel;
  prerequisites: PrerequisiteProbe[];
  grantedAt: string;
  grantedBy: "founder";
  grantedViaUnit?: BusinessUnit;
  updatedAt: string;
  notes?: string;
}

export type GrantsMap = Partial<Record<GrantableDomainId, Grant>>;

export interface GrantsDocument {
  schemaVersion: "1.0.0";
  updatedAt: string;
  grants: GrantsMap;
}

export type UndoContract =
  | { kind: "literal_undo"; undoAction: string; undoVerifiedPath?: string }
  | { kind: "mitigation"; irreversibilityAcknowledgment: string; mitigationSteps: string[] };

export type BudgetPeriod = "daily" | "weekly" | "monthly" | "per_run";

export interface WaiverCaps {
  maxPerAction: number;
  maxPerPeriod: number;
  currency?: string;
}

export interface Waiver {
  id: string;
  domainId: GrantableDomainId;
  actionClass: WaivableActionClass;
  protectedCategory: ProtectedCategory;
  scope: { resourcePattern: string; description: string };
  caps: WaiverCaps;
  budgetPeriod: BudgetPeriod;
  expiry: string;
  undoContract: UndoContract;
  auditRef: string;
  status: "active" | "expired" | "revoked";
  createdAt: string;
  createdBy: "founder";
  lastVerifiedAt?: string;
}

export interface WaiversDocument {
  schemaVersion: "1.0.0";
  updatedAt: string;
  waivers: Waiver[];
}

export interface BudgetBalance {
  unit: BusinessUnit;
  period: string;
  currency: string;
  allocated: number;
  committed: number;
  spent: number;
  remaining: number;
  updatedAt: string;
}

export interface BudgetLedgerEntry {
  id: string;
  unit: BusinessUnit;
  domainId: GrantableDomainId;
  nodeRef?: string;
  period: string;
  estimate: { amount: number; currency: string; declaredAt: string };
  actual: { amount: number; currency: string; recordedAt: string } | null;
  status: "estimated" | "actualized" | "rejected";
  waiverRef?: string;
  auditRef: string;
}

export interface BudgetLedgerDocument {
  schemaVersion: "1.0.0";
  updatedAt: string;
  balances: BudgetBalance[];
  entries: BudgetLedgerEntry[];
}

/**
 * Non-secret provisioning config (adapters/provisioning), e.g. the digest from-address and a Doppler
 * project/config binding. Optional: absent means unset, never a placeholder
 * default — secret values never live here, only Doppler/.env do. dopplerProject/dopplerConfig
 * bind this business's own tier; dopplerPlatformProject/dopplerPlatformConfig optionally bind the
 * shared account-level `b2c` project (knowledge/operations/doppler-organization.md) — cross-
 * project inheritance is a paid Doppler feature, so resolve.ts composes the two tiers itself,
 * business winning over platform on conflict.
 */
export interface ProvisioningConfig {
  digestFromAddress?: string;
  dopplerProject?: string;
  dopplerConfig?: string;
  dopplerPlatformProject?: string;
  dopplerPlatformConfig?: string;
}

export interface ControlFile {
  schemaVersion: "1.0.0";
  updatedAt: string;
  businessSlug: string;
  killSwitch: { engaged: boolean; engagedAt: string; engagedBy: "" | "founder" | "system"; reason: string };
  grants: GrantsMap;
  waivers: Waiver[];
  provisioning?: ProvisioningConfig;
}

export interface ArtifactBindingV2 {
  artifactId: string;
  path: string;
  fingerprint?: string;
  accepted: boolean;
  producedBy?: string;
  attemptId?: string;
  /** Last accepted fingerprint retained while a producer is reopened for scoped refresh. */
  refreshBaselineFingerprint?: string;
}

/** Signed founder decisions accepted by the local engine. */
export type FounderDecisionKind = "design_taste_direct" | "design_taste_delegation";

export interface DirectDesignTasteDecision {
  kind: "design_taste_direct";
  verdict: "pass" | "fail";
  /** SHA-256 of the exact DESIGN.md file bytes. */
  designSha256: string;
}

export interface DesignTasteDelegationDecision {
  kind: "design_taste_delegation";
  status: "approved" | "rejected";
}

export type FounderDecision = DirectDesignTasteDecision | DesignTasteDelegationDecision;

export interface FounderDecisionPayload {
  audience: "b2c-app-builder/founder-decision/v1";
  receiptId: string;
  previousReceiptId: string | null;
  sequence: number;
  workspaceBinding: string;
  runId: string;
  issuedAt: string;
  expiresAt: string;
  decision: FounderDecision;
}

/** Ed25519 signature over the fixed-order canonical FounderDecisionPayload JSON. */
export interface FounderDecisionReceipt {
  schemaVersion: "1.0.0";
  algorithm: "Ed25519";
  keyId: string;
  payload: FounderDecisionPayload;
  signature: string;
}

/** Exact external founder trust-store snapshot accepted for one run and chained into reducer audit. */
export interface FounderDecisionTrustBinding {
  keyId: string;
  trustFileSha256: string;
  canonicalTrustPath: string;
  workspaceBinding: string;
  runId: string;
  boundAt: string;
  auditEntryHash: string;
}

export interface CurrentDesignTasteDelegationSnapshot {
  approvalId: "decision.design.taste.delegation";
  status: "approved" | "rejected";
  runId: string;
  receiptId: string;
  keyId: string;
  auditEntryHash: string;
}

export interface UnavailableDesignTasteDelegationSnapshot {
  approvalId: "decision.design.taste.delegation";
  status: "absent" | "stale";
  runId: string;
}

export type DesignTasteDelegationSnapshot = CurrentDesignTasteDelegationSnapshot | UnavailableDesignTasteDelegationSnapshot;

export interface DirectDesignTasteSnapshot {
  verdict: "pass" | "fail";
  runId: string;
  designSha256: string;
  receiptId: string;
  keyId: string;
  auditEntryHash: string;
}

/** Authority captured for the exact design-audit attempt and rechecked before acceptance. */
export interface DesignAuthorityEvaluation {
  source: "dispatch" | "founder_revalidation";
  evaluatedAt: string;
  delegation: DesignTasteDelegationSnapshot;
  direct?: DirectDesignTasteSnapshot;
  authorityContextFingerprint: string;
}

export type ApprovalProvenance =
  | {
      source: "standing_envelope";
      envelopeId: string;
      actionId: string;
      validatedAt: string;
      receiptId?: never;
      keyId?: never;
      auditEntryHash?: never;
      issuedAt?: never;
    }
  | {
      source: "founder_receipt";
      envelopeId?: never;
      actionId?: never;
      receiptId: string;
      keyId: string;
      auditEntryHash: string;
      issuedAt: string;
      validatedAt: string;
    };

export interface AttemptRecordV2 {
  id: string;
  nodeId: string;
  number: number;
  status: Status;
  ownerSessionId: string;
  heartbeatAt?: string;
  ttlSeconds: number;
  inputFingerprint: string;
  startedAt?: string;
  finishedAt?: string;
  evidence: string[];
  error?: string;
  readbackRequired: boolean;
  readbackEvidence?: string;
  /** Optional link to a work-order occurrence. Attempts without a work order omit this field. */
  workOrderOccurrenceId?: string;
  /** Exact-attempt mechanical proof; required before independent review of a gated node. */
  deterministicVerification?: {
    attemptId: string;
    inputFingerprint: string;
    outputFingerprint: string;
    gateIds: string[];
    passed: boolean;
    evidence: string[];
    checkedAt: string;
    /** Exact signed founder authority evaluated by a design gate, when applicable. */
    authorityContextFingerprint?: string;
  };
  /** Signed design authority captured at dispatch or during a founder-triggered revalidation. */
  designAuthorityEvaluation?: DesignAuthorityEvaluation;
  /** Synthetic fixture execution cannot establish workspace or provider completion. */
  proofSource?: "workspace" | "synthetic";
  independentVerification?: IndependentVerificationReceipt;
}

export interface IndependentVerificationReceipt {
  mode: "workspace" | "synthetic" | "graph";
  workflowId: string;
  attemptId: string;
  producerSessionId: string;
  verifierSessionId: string;
  verdict: "accepted" | "rejected";
  checkedAt: string;
  policyFingerprint: string;
  outputFingerprint: string;
  subjects: Array<{ artifactId: string; path: string; fingerprint: string }>;
  criteria: Array<{ path: string; fingerprint: string }>;
  evidence: string[];
}

export interface RunNodeStateV2 {
  nodeId: string;
  status: Status;
  acceptedOutputFingerprint?: string;
  attempts: AttemptRecordV2[];
  /** Number of retained attempts preceding the current recurrence cycle. */
  attemptCycleStart?: number;
  blocker?: string;
  /**
   * The session that accepted this node's verification (gate-running session for deterministic
   * nodes, the reviewing session for fresh-context ones). Run-state provenance, not a trusted
   * identity by itself — the execution boundary refuses to export a fresh-context result whose
   * verifier session equals the producing attempt's owner, so self-verification cannot cross to
   * the platform as independent work.
   */
  verifiedBySessionId?: string;
  applicabilityFingerprint?: string;
  /** Dependency-id/attempt-cycle tokens already refreshed before this node's next dispatch. */
  dependencyRefreshCycles?: string[];
  /** Scoped instructions carried into this dependency's current refresh dispatch. */
  refreshInstructions?: string[];
  /** Findings from rejected work, carried into the next authorized producer attempt. */
  repairInstructions?: string[];
  /** The current compiled workflow contract, used to reconcile catalog upgrades. */
  contractFingerprint?: string;
}

export interface ArchivedRunPlan {
  planId: string;
  planRevision: number;
  archivedAt: string;
  nodes: Record<string, RunNodeStateV2>;
  artifactBindings: ArtifactBindingV2[];
  approvals: Record<string, "pending" | "approved" | "rejected">;
  approvalProvenance?: Record<string, ApprovalProvenance>;
  workOrders?: Record<string, WorkOrderOccurrence>;
}

export interface PublicSessionResult {
  runId: string | null;
  planId: string | null;
  outcome: string;
  completed: number;
  held: number;
}
export interface PublicSessionRecord {
  requestDigest: string;
  sessionId: string;
  status: "running" | "completed";
  result?: PublicSessionResult;
}
export interface RunStateDocument {
  schemaVersion: "1.0.0";
  runId: string;
  planId: string;
  planRevision: number;
  createdAt: string;
  updatedAt: string;
  ownerSessionId: string;
  heartbeatAt: string;
  ttlSeconds: number;
  wallClockCapSeconds: number;
  /** SHA-256 key id derived from the trusted founder Ed25519 SPKI DER. */
  founderDecisionKeyId?: string;
  /** External trust-store bytes and path bound to this exact run through the reducer audit chain. */
  founderDecisionTrust?: FounderDecisionTrustBinding;
  approvals: Record<string, "pending" | "approved" | "rejected">;
  approvalProvenance?: Record<string, ApprovalProvenance>;
  artifactBindings: ArtifactBindingV2[];
  nodes: Record<string, RunNodeStateV2>;
  /** Prior plan evidence is retained here and never participates in current dispatch. */
  archivedPlans?: ArchivedRunPlan[];
  /** Request receipts live with the run they control; they never grant authority. */
  publicRequests?: Record<string,PublicSessionRecord>;
  /** Work-order occurrences are independent of attempts. Optional on runs without a work order. */
  workOrders?: Record<string, WorkOrderOccurrence>;
}

export interface CheckpointDocument {
  schemaVersion: "1.0.0";
  writtenAt: string;
  writerSessionId: string;
  stateHash: string;
  runState: RunStateDocument;
}

export interface Lane {
  status: Status;
  evidence: string[];
  blockers: string[];
  [extra: string]: unknown;
}

export type LanesMap = Record<LaneKey, Lane>;

/** A provider's durable per-business state, including its selected access route. */
export interface ProviderStateEntry {
  accessRoute: AccessRoute | "not_selected";
  route?: string;
  docsCheckedAt?: string;
  requiredSecrets?: string[];
  preflight?: string;
  validation?: string;
  fallback?: string;
  [extra: string]: unknown;
}

export interface PendingFounderGate {
  id: string;
  category: ProtectedCategory | "other";
  reason: string;
  createdAt: string;
}

export interface BusinessStateV2 {
  schemaVersion: "2.0.0";
  updatedAt: string;
  narrative: { sinceLastTime: string; rightNow: string; yourCall: string; lastCelebratedPhase: string };
  project: {
    name: string;
    slug: string;
    owner: string;
    phase: string;
    /** The business's launch profile id (R7); "essentials" and "full" are the built-ins, validated against the catalog's profile registry. */
    launchScope: string;
    kickoffDate: string;
    platforms: Array<"ios" | "android">;
    supportedDeviceFamilies?: Array<"iphone" | "ipad">;
    bundleIds: { ios: string; android: string };
    publicUrls: { landing: string; privacy: string; terms: string };
    /**
     * Accepted workspace/repository kind. Omitted means default validator routing.
     * Distinct from launchScope (`essentials` / `full`).
     */
    repositoryProfile?: { id: RepositoryProfileId; revision: string; acceptedAt: string };
  };
  lanes: LanesMap;
  founderGates: { pending: PendingFounderGate[] };
  /** Provider selections are optional until the workspace binds an operation. */
  providers?: Record<string, ProviderStateEntry>;
  continuity?: { lastStateReview?: string; sourceFiles?: string[]; gitStatusReviewed?: boolean; nextAction?: string };
  workflowApplicability?: Record<string, { verdict: "required" | "not-needed"; reason: string; evidence: string[]; updatedAt: string }>;
  /** Optional until the workspace starts an operating loop. */
  operatingModel?: OperatingModel;
}

export type EvidenceAuthority = "provider_readback" | "store_receipt" | "operator_attestation" | "derived_projection";

export type CurrentTruthClaimStatus = "active" | "superseded" | "expired" | "unresolved";

export type CurrentTruthBlockerKind = "none" | "missing_proof" | "expired_proof" | "unreachable_proof" | "conflict";

export interface CurrentTruthEvidence {
  id: string;
  graphNodeId: string;
  claimId: string;
  authority: EvidenceAuthority;
  observedAt: string;
  expiresAt?: string;
  reachable: boolean;
  payloadHash: string;
  accepted: boolean;
  summary: string;
  receiptId?: string;
}

export interface CurrentTruthClaim {
  claimId: string;
  graphNodeId: string;
  status: CurrentTruthClaimStatus;
  currentEvidenceId: string | null;
  supersededEvidenceIds: string[];
  blockerKind: CurrentTruthBlockerKind;
  summary: string;
}

export interface CurrentTruthDocument {
  schemaVersion: "1.0.0";
  updatedAt: string;
  revision: number;
  lastReceiptId: string | null;
  lastReconcileInputHash: string | null;
  evidence: CurrentTruthEvidence[];
  claims: CurrentTruthClaim[];
}
