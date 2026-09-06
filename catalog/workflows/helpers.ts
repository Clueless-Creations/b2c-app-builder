import type { LaneKey } from "../../kernel/schema/types.js";
import type { AreaId, CatalogDomainId, CatalogWorkflowDef, PhaseId, RoleId, WorkflowId } from "../types.js";

export interface WorkflowSeed {
  id: WorkflowId;
  title: string;
  domainId: CatalogDomainId;
  areaIds: AreaId[];
  trigger: string;
  /** Founder-voiced trigger phrasings, scored at trigger weight by the utterance router (issue #58; see CatalogWorkflowDef). */
  founderPhrasings: string[];
  /** Required node contract (see CatalogWorkflowDef): what to do, what to open, which knowledge to load, who owns it. */
  instructions: string;
  reads?: string[];
  consults?: string[];
  roleId: RoleId;
  laneIds?: LaneKey[];
  phaseIds?: PhaseId[];
  dependencies?: WorkflowId[];
  refreshDependencies?: Array<{ workflowId: WorkflowId; instructions: string }>;
  outputPaths?: string[];
  gates?: string[];
  providers?: string[];
  founderOnlyActions?: string[];
  actionClass: CatalogWorkflowDef["actionClass"];
  protectedCategory?: CatalogWorkflowDef["protectedCategory"];
  idempotent: boolean;
  maxAttempts?: number;
  maxConsecutiveNoProgressAttempts?: number;
  ttlSeconds?: number;
  tokenBudget?: number;
  costEstimate?: CatalogWorkflowDef["costEstimate"];
  applicability?: CatalogWorkflowDef["applicability"];
  recurrenceDays?: number;
  extensionSlots?: string[];
  /** Producer nodes this node audits in a fresh context (see CatalogWorkflowDef.reviewOf). */
  reviewOf?: WorkflowId[];
}

const READINESS_WORKFLOW: WorkflowId = "workflow.operations.agent-operations-ledger";
const READINESS_BOOTSTRAP_WORKFLOWS = new Set<WorkflowId>([
  "workflow.operations.paid-tool-routing-and-fallback",
  "workflow.operations.secrets-baseline-and-routing",
  "workflow.operations.founder-zero-operator-bootstrap",
  READINESS_WORKFLOW,
]);

function dependenciesFor(seed: WorkflowSeed): WorkflowId[] {
  const dependencies = [...(seed.dependencies ?? [])];
  const providerWork = Boolean(seed.providers?.length);
  const businessExternalAction =
    ["spend", "publish", "release"].includes(seed.actionClass) &&
    !seed.domainId.startsWith("domain.process") &&
    !seed.domainId.startsWith("domain.orchestration");
  if ((providerWork || businessExternalAction) && !READINESS_BOOTSTRAP_WORKFLOWS.has(seed.id) && !dependencies.includes(READINESS_WORKFLOW)) {
    dependencies.push(READINESS_WORKFLOW);
  }
  return dependencies;
}

/**
 * Ported from runtime/graph/workflows/helpers.ts, restructured for the v2 shape. Two
 * differences from v1: `negativeTriggers` is dropped (grep-confirmed dead — every v1
 * workflow set it to `[]` and nothing ever read it); `actionClass`/`idempotent` are
 * required, not optional, because compile.ts's CatalogWorkflowNode needs both to build a
 * dispatchable plan (KTD6).
 */
export function workflow(seed: WorkflowSeed): CatalogWorkflowDef {
  return {
    id: seed.id,
    title: seed.title,
    domainId: seed.domainId,
    areaIds: seed.areaIds,
    trigger: seed.trigger,
    founderPhrasings: seed.founderPhrasings,
    instructions: seed.instructions,
    reads: seed.reads ?? [],
    consults: seed.consults ?? [],
    referenceIds: [],
    roleId: seed.roleId,
    laneIds: seed.laneIds ?? [],
    phaseIds: seed.phaseIds ?? [],
    dependencies: dependenciesFor(seed),
    ...(seed.refreshDependencies?.length ? { refreshDependencies: seed.refreshDependencies } : {}),
    outputPaths: seed.outputPaths ?? [],
    gateCommands: seed.gates ?? [],
    providerIds: seed.providers ?? [],
    founderOnlyActions: seed.founderOnlyActions ?? [],
    actionClass: seed.actionClass,
    protectedCategory: seed.protectedCategory,
    idempotent: seed.idempotent,
    maxAttempts: seed.maxAttempts,
    maxConsecutiveNoProgressAttempts: seed.maxConsecutiveNoProgressAttempts,
    ttlSeconds: seed.ttlSeconds,
    tokenBudget: seed.tokenBudget,
    costEstimate: seed.costEstimate,
    applicability: seed.applicability ?? { mode: "always" },
    recurrenceDays: seed.recurrenceDays,
    ...(seed.extensionSlots?.length ? { extensionSlots: seed.extensionSlots } : {}),
    ...(seed.reviewOf?.length ? { reviewOf: seed.reviewOf } : {}),
  };
}
