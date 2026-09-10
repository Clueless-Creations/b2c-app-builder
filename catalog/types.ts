import type { SharedResourceId } from "../contracts/shared-resources.js";
import type { SourceAccess } from "../contracts/source-access.js";
import type { CatalogProviderContract } from "../adapters/providers/contract.js";
import type { ActionClass, BusinessUnit, GrantableDomainId, LaneKey, ProtectedCategory } from "../kernel/schema/types.js";

/**
 * The v2 definition-graph-as-data types (U8; KTD6, R20). Ported and restructured from
 * runtime/graph/types.js: domains/lanes/phases/areas keep their v1 shape (stable data,
 * no reason to change it); workflows gain the action-class/protected-category/idempotency
 * fields the v1 graph never needed because it had no execution half; references drop the
 * scraped-from-README loadWhen and carry it as authored data instead (the R20 inversion).
 */

export type AreaId = `area.${string}`;
export type RoleId = `role.${string}`;
export type ContextPackId = `context.${string}`;
/** Broader than kernel/schema's GrantableDomainId: also covers domain.process, domain.orchestration, domain.machine (KTD3 system domains). */
export type CatalogDomainId = `domain.${string}`;
export type PhaseId = `phase.${string}`;
export type LaneId = `lane.${string}`;
export type ReferenceId = `reference.${string}`;
export type WorkflowId = `workflow.${string}`;
export type ArtifactId = `artifact.${string}`;
export type GateId = `gate.${string}`;

export interface CatalogArea {
  id: AreaId;
  name: string;
  description: string;
  domainIds: CatalogDomainId[];
}

export interface CatalogDomain {
  id: CatalogDomainId;
  slug: string;
  name: string;
  areaIds: AreaId[];
  /** Path to the domain's content index (v1: knowledge/<slug>/README.md; ports unchanged as a path — the file's ROLE as a routing table is what R20 retires). */
  indexPath?: string;
  routeLabel: string;
  routeWhen: string;
  order: number;
  /**
   * Catalog-owned authority (KTD4). When omitted, composeCatalog fills the base-catalog
   * defaults. A pack-added domain must set grantable or system explicitly; unknown values
   * fail closed and must not disappear at the bridge.
   */
  grantable?: boolean;
  system?: boolean;
  machine?: boolean;
  operatorGroup?: BusinessUnit;
  protectedCategories?: ProtectedCategory[];
  aliases?: string[];
}

export interface CatalogPhase {
  id: PhaseId;
  key: string;
  label: string;
  focus: string;
  primaryOutput: string;
  order: number;
  orientWindow?: boolean;
}

export interface CatalogLane {
  id: LaneId;
  key: LaneKey;
  label: string;
  ownerDomainId: CatalogDomainId;
  dependencyIds: LaneId[];
}

/**
 * A content reference with its load-when condition authored as catalog DATA (R20).
 * v1's runtime/graph/catalog.ts scraped this text out of a hand-authored README table;
 * here it is the source of truth, and catalog/render-routing.ts projects it back into
 * a generated table instead of the other way around.
 */
export interface CatalogReference {
  resource?: { path: string; sha256: string; origin: "skill" | "workspace" };
  id: ReferenceId;
  path: string;
  domainId: CatalogDomainId;
  title: string;
  loadWhen: string;
  /** Stable section id for bounded context compilation (KTD8). */
  sectionId?: string;
  /** Exact knowledge revision the selector pins. */
  revision?: string;
  /**
   * True for a backlink-enforced hub: a routing file whose spokes each open with a "Part of the
   * [Hub](...)" backlink. check:hub-spoke enforces the flag in both directions (a flagged hub
   * must have real spokes; a file with spokes must be flagged), so this is data code checks —
   * not a rhetorical label.
   */
  hub?: boolean;
  /**
   * True for always-on/orientation references a SESSION loads (Start Here, Always-On Contracts,
   * autonomy, writing bar) rather than any one workflow node. Every reference must either be
   * bound by at least one workflow's referenceIds or carry this flag — an unbound, unflagged
   * reference is knowledge nothing routes to, and validate.ts rejects it
   * (catalog_graph.reference.unbound).
   */
  sessionScoped?: boolean;
  lifecycle: "draft" | "active" | "deprecated";
  applicabilityNotes?: string;
  sourceExemption?: string;
  sources: CatalogKnowledgeSource[];
  /**
   * How this reference relates to its sources (ADR-0005). `informed` guidance cites an idea;
   * `adapted` guidance reauthors selected material; `copied` material retains the upstream
   * notice. Absent means the reference predates derivation tracking or is wholly original.
   */
  derivations?: CatalogKnowledgeDerivation[];
  replacementIds: ReferenceId[];
  /** Artifact specifications authored in this reference, selected by exact heading. */
  specifies?: Array<{ artifact: string; heading: string }>;
}

/** Rights evidence for one source at its reviewed revision. A badge or creator-wide claim is not evidence. */
export interface CatalogKnowledgeSourceRights {
  status: "verified" | "unverified" | "unknown" | "incompatible" | "not-redistributable" | "not-applicable";
  spdx?: string;
  evidence?: string;
  evidenceSha256?: string;
  notes?: string;
}

export interface CatalogKnowledgeSource {
  id: string;
  name: string;
  sourceType: string;
  url: string;
  reviewCadenceDays: number;
  claimScope: string;
  lastReviewDate: string;
  reviewer: string;
  /** Original author or publishing organization. Reorganizing content never replaces it. */
  publisher?: string;
  /** Immutable upstream revision (tag, commit) or content fingerprint at review time. */
  revision?: string;
  /** Upstream publication date, distinct from retrieval and review dates. */
  publishedAt?: string;
  /** Retrieval timestamp of the reviewed bytes. */
  retrievedAt?: string;
  rights?: CatalogKnowledgeSourceRights;
  /** File or section selectors that carry the cited material. */
  selectors?: string[];
  /** The catalog/upstreams manifest that maintains this relationship, when one exists. */
  upstreamId?: string;
}

export interface CatalogKnowledgeDerivation {
  sourceIds: string[];
  relationship: "informed" | "adapted" | "copied" | "wrapped" | "dependency" | "referenced";
  baseline?: string;
  selectors?: string[];
  rationale: string;
  omissions?: string[];
  reviewer: string;
  reviewedAt: string;
  evaluation?: string;
  /** Repository-relative path of the retained notice. Required for copied material. */
  notice?: string;
}

export interface CatalogKnowledgePackage extends CatalogReference {
  workflowIds: WorkflowId[];
  contextPackIds: ContextPackId[];
  manifestPath: string;
  /**
   * True for a terminal deprecation: the package is deprecated with no
   * successor (a retired learning, a withdrawn contract). Exempts the package
   * from knowledge.deprecated.replacement_missing — pointing a reader at an
   * unrelated "replacement" would mislead more than pointing nowhere.
   */
  retired?: boolean;
}

/**
 * A specialist role a workflow node routes to (the app-agent roster promoted to catalog data —
 * see catalog/roles.ts). `promptPath` is workspace-relative: the roster ships inside each
 * provisioned business, so the catalog validates the id, not the file.
 */
export interface CatalogRole {
  contextOrigin?: "workspace" | "package";
  promptResources?: Record<string, string>;
  id: RoleId;
  name: string;
  promptPath: string;
  scope: string;
  /** Parent repo contracts a fresh worker must read before the specialist prompt. */
  parentPromptPaths: string[];
  /** Role-level knowledge routes. Their references remain conditional; workflow references are mandatory. */
  contextPackIds: ContextPackId[];
  /** Installed skills to invoke when the assignment matches `when`; unavailable optional skills never block work. */
  skillRoutes: CatalogCapabilityRoute[];
  /** Runtime capabilities to discover before work that needs them; schemas/current --help outrank stored examples. */
  toolRoutes: CatalogCapabilityRoute[];
  /** Provider/capability ids this role can actually exercise. Workflow providerIds must be a subset. */
  capabilityIds: string[];
  /** Workspace-relative output prefixes this role is allowed to produce. Empty means review-only. */
  outputPathPrefixes: string[];
  /**
   * Fresh-context roles that audit this role's surfaces before they count as accepted
   * (knowledge/orchestration/isolated-review.md, Auditor Roster). A role naming itself means a
   * second, fresh-context instance of the same role — the roster's "same title, different agent"
   * rule; instance isolation is the dispatcher's job. Empty means the roster names no auditor for
   * this role's work.
   */
  reviewedBy?: RoleId[];
}

export interface CatalogCapabilityRoute {
  id: string;
  when: string;
}

export interface CatalogContextPack {
  id: ContextPackId;
  title: string;
  referenceIds: ReferenceId[];
}

/**
 * Source-level workflow definition (pre-bridge). Carries every v1 WorkflowDefinition field
 * except the always-empty `negativeTriggers` (dead since v1 shipped — never read anywhere),
 * plus the v2 dispatch fields compile.ts's CatalogWorkflowNode requires.
 */
export interface CatalogWorkflowDef {
  sharedResources?: SharedResourceId[];
  sourceAccess?: SourceAccess[];
  id: WorkflowId;
  title: string;
  domainId: CatalogDomainId;
  areaIds: AreaId[];
  trigger: string;
  /**
   * Short, founder-voiced alternate phrasings of this workflow's trigger (issue #58): the utterance
   * router (kernel/session/route-utterance.ts) scores these at the SAME weight as `trigger` — a
   * "vocabulary bridge" between the trigger/title text this workflow is CALLED (author-facing,
   * often naming providers, artifacts, or jargon) and how a founder who has never read the catalog
   * actually asks for it. Authored from the workflow's PURPOSE (title/trigger/instructions), never
   * copied from either verbatim and never lifted from a routing-accuracy corpus utterance —
   * catalog/validate.ts's `catalog_graph.workflow.founder_phrasing_*` rules enforce both the
   * per-phrasing length ceiling and that no two workflows share a phrasing; checks/verification/fixtures/
   * routing-accuracy.fixtures.ts additionally proves no phrasing here equals or contains an
   * orthogonal-corpus utterance. An empty array is valid (no rule requires every workflow to
   * participate — a synthetic fixture/pack workflow has no founder-facing existence to phrase), but
   * once an array is non-empty it must hold 3-6 entries: fewer is not worth authoring, more starts
   * duplicating the trigger's own job instead of bridging vocabulary.
   */
  founderPhrasings: string[];
  /**
   * The node's working instructions: what a worker with fresh context should actually DO and how
   * it knows it is done. Required (catalog_graph.workflow.instructions_missing) — a node whose
   * only content is its title dispatches a worker with nothing to work from, which is the exact
   * failure the 2026-08 contract audit found. Instructions stay compact; the depth lives in the
   * bound references below.
   */
  instructions: string;
  /**
   * Authored input contract: the workspace paths this node actually consumes (upstream artifacts
   * and durable state files). `reads` is BLOCKING: compile.ts maps each entry that names another
   * workflow's artifact into the node's inputs, so the frontier holds the node until that
   * artifact is produced AND accepted (a read of the node's own output is the read-modify-write
   * pattern and is excluded; durable state files gate nothing). A file this node merely
   * cross-checks when it exists belongs in `consults`, not here. Each entry must resolve to a
   * declared artifact path or a workspace-template file (catalog_graph.workflow.read_unresolvable).
   * When both store providers appear in the catalog and a node produces
   * `store/app-store-listing/SCREENSHOTS.md`, each of those providers must have a distinct other
   * workflow that reads that path and depends on the producer
   * (`catalog_graph.workflow.producer_without_reader`). That is not a global unread-output ban.
   */
  reads: string[];
  /**
   * Open-if-present references: files the worker should consult WHEN they exist, without holding
   * readiness on their producers (e.g. a phase-1 node that cross-checks a phase-3 artifact on its
   * later firings). Same resolvability rule as reads (catalog_graph.workflow.consult_unresolvable);
   * a path may not appear in both lists.
   */
  consults: string[];
  /**
   * Knowledge bound to this node (R20 completed: loadWhen text routed humans; this routes the
   * engine). Every id must resolve from a knowledge manifest, and every non-sessionScoped reference
   * must be bound by at least one workflow — both directions validate.
   */
  referenceIds: ReferenceId[];
  /** The specialist role that owns this node's work (catalog/roles.ts; the app-agent roster promoted to a routing key). */
  roleId: RoleId;
  laneIds: LaneKey[];
  phaseIds: PhaseId[];
  dependencies: WorkflowId[];
  /** Dependencies that must be reopened once per attempt cycle before this node can enter the frontier. */
  refreshDependencies?: Array<{ workflowId: WorkflowId; instructions: string }>;
  outputPaths: string[];
  gateCommands: string[];
  /**
   * Provider ids this node exercises. Every id must have a PROVISIONING_MANIFEST entry or sit
   * in DELIBERATELY_UNDECLARED_PROVIDER_IDS (adapters/provisioning/requirements.ts) —
   * catalog_graph.workflow.provider_unknown / catalog_graph.provider.exception_stale — and be a
   * subset of the owning role's capabilityIds (catalog_graph.workflow.role_capability_missing).
   */
  providerIds: string[];
  founderOnlyActions: string[];
  /** v2: dispatch/autonomy fields the v1 graph had no execution half to need (KTD6). */
  actionClass: ActionClass;
  protectedCategory?: ProtectedCategory;
  idempotent: boolean;
  /**
   * Operating-cadence contract: a succeeded node reopens (goes stale on its own calendar) once
   * this many days pass since its last completed attempt. This is what makes "actively operating
   * the business" graph-native rather than a promise in prose — before it, the frontier treated
   * `succeeded` as terminal, so the weekly post-launch rhythm the knowledge docs demand had no
   * mechanism to self-trigger (2026-08-19 audit's core structural finding).
   */
  recurrenceDays?: number;
  maxAttempts?: number;
  /** Stop an internal repair loop after this many consecutive attempts show no changed producer evidence. Absent preserves the generic hard-cap-only policy. */
  maxConsecutiveNoProgressAttempts?: number;
  ttlSeconds?: number;
  tokenBudget?: number;
  /** Declared cost for actionClass "spend" nodes (required there — catalog_graph.workflow.cost_estimate_missing); the autonomy engine parks spend nodes without one. */
  costEstimate?: { amount: number; currency: string };
  applicability: { mode: "always" } | { mode: "conditional"; question: string };
  /**
   * Authored group membership for this node (KTD7). Compiled straight through into
   * retired; this is the only surviving grouping mechanism, and membership is never derived by
   * id-substring match — a workflow either declares this or it has no group.
   */
  groupId?: string;
  /** Named slots a pack may bind or strengthen. Weakening a slot fails composition. */
  extensionSlots?: string[];
  /**
   * Isolated-review edge (knowledge/orchestration/isolated-review.md): the producer nodes whose
   * surface this node audits in a fresh context. Each id must also be a declared dependency — the
   * frontier cannot audit an artifact that does not exist yet — and this node's outputPaths may not
   * overlap any target's outputPaths, because an auditor writes findings only. validate.ts enforces
   * both, so "review as data" is a checked graph edge rather than a prose promise.
   */
  reviewOf?: WorkflowId[];
}

export interface CatalogGate {
  commandManifestPath?: string;
  id: GateId;
  command: string;
  scriptPath?: string;
  ownerDomainId: CatalogDomainId;
  audit: "required" | "excluded" | "manual";
}

export interface CatalogArtifact {
  id: ArtifactId;
  path: string;
  ownerDomainId: CatalogDomainId;
  laneIds: LaneKey[];
  generated: boolean;
}

/**
 * A named launch profile (R7): breadth selection as data. A workflow whose every lane sits in
 * `defersLaneKeys` parks as not_needed for a business running this profile — enforced by
 * reconcileWorkflowApplicability, overridable per workflow by a recorded founder verdict.
 */
export interface CatalogProfile {
  id: string;
  title: string;
  description: string;
  defersLaneKeys: LaneKey[];
}

/** Workspace/repository kind. Distinct from launch `CatalogProfile` (`essentials` / `full`). */
export interface CatalogRepositoryProfile {
  id: string;
  title: string;
  description: string;
  responsibility: string;
  alwaysCanonical: readonly string[];
  alwaysGenerated: readonly string[];
  requireReadme: boolean;
  requireCommunityHealth: boolean;
}

export interface Catalog {
  schemaVersion: "2.0.0";
  skillVersion: string;
  areas: CatalogArea[];
  domains: CatalogDomain[];
  phases: CatalogPhase[];
  lanes: CatalogLane[];
  roles: CatalogRole[];
  contextPacks: CatalogContextPack[];
  references: CatalogReference[];
  workflows: CatalogWorkflowDef[];
  artifacts: CatalogArtifact[];
  gates: CatalogGate[];
  profiles: CatalogProfile[];
  /** Typed workspace/repository profiles. Omitted on fixture catalogs. */
  repositoryProfiles?: CatalogRepositoryProfile[];
  /** Versioned provider contracts. Omitted on fixture catalogs. */
  providerContracts?: CatalogProviderContract[];
  /** Pinned composition provenance. composeCatalog always fills this; fixture catalogs may omit it. */
  composition?: CatalogComposition;
  /** Accepted pack extension bindings that reach the executable catalog. */
  bindings?: CatalogExtensionBinding[];
}

export interface CatalogExtensionBinding {
  packId: string;
  targetId: string;
  slot: string;
  kind: "bind" | "strengthen";
  referenceIds: string[];
}

export interface CatalogCountPin {
  domains: number;
  workflows: number;
  references: number;
}

export interface CatalogPackPin {
  id: string;
  kind: "capability" | "business-pack";
  version: string;
  revision: string;
  contentDigest?: string;
}

export interface CatalogComposition {
  fingerprint: string;
  packs: CatalogPackPin[];
  base: CatalogCountPin;
  deltas: Record<string, CatalogCountPin>;
}

export interface CatalogIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

/** domainId values that are runtime machinery, never founder-grantable (KTD3). Kept local so catalog/ has no runtime coupling; kernel/schema/types.ts's grantableDomainIds is the cross-check in validate.ts. */
export const systemCatalogDomainIds: readonly CatalogDomainId[] = ["domain.process", "domain.orchestration"];
export const machineCatalogDomainId: CatalogDomainId = "domain.machine";

export function isGrantableDomainId(value: CatalogDomainId, grantable: readonly GrantableDomainId[]): value is GrantableDomainId {
  return (grantable as readonly string[]).includes(value);
}
