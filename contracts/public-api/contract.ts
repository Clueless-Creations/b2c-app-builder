import { researchQuerySchema, researchObservationInputSchema, savedResearchObservationSchema } from "../research/observation.js";
import { z } from "zod";
export {
  anyWorkerRuntimeFound,
  bothConfiguredRoutingGuidance,
  configuredConnectionSet,
  connectionCapabilityGuidance,
  connectionReceipt,
  connectionReceiptSchema,
  formatConnectionReceipt,
  HOSTED_CLIENT_NAME,
  HOSTED_WRONG_SURFACE_TOOL_NAMES,
  hostedMcpInstructionsSuffix,
  hostedWrongSurfaceRefusal,
  interpretConfiguredConnection,
  isHostedWrongSurfaceTool,
  LEFTOVER_LOCAL_CLIENT_NAME,
  leftoverNameClientMatrix,
  leftoverNameMigrationGuidance,
  LOCAL_CLIENT_NAME,
  localMcpInstructions,
  observedLocalWorkspaceHealth,
  parseConnectionReceipt,
  selectConfiguredSurface,
} from "./connection-receipt.js";
export type {
  ConfiguredConnectionEntry,
  ConfiguredConnectionReading,
  ConfiguredConnectionSet,
  ConfiguredSurfaceNeed,
  ConfiguredSurfaceSelection,
  ConnectionReceipt,
  HostedWrongSurfaceRefusal,
  HostedWrongSurfaceToolName,
  LeftoverNameClientRow,
} from "./connection-receipt.js";

/** Public compatibility is independent of engine and provider SDK versions. */
export const API_VERSION = "b2c/v1" as const;
const id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9.-]*$/)
  .max(160);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
export const referenceSchema = z.strictObject({ id, version });
const connection = z
  .string()
  .regex(/^connection:[a-z][a-z0-9._-]*$/)
  .max(160);
export const bindingSchema = z.strictObject({ provider: referenceSchema, connection: connection.optional() });
export const compositionSchema = z.strictObject({
  apiVersion: z.literal(API_VERSION),
  recipe: referenceSchema,
  target: z.strictObject({
    platform: z.enum(["ios", "android", "web", "host"]),
    runtime: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .max(64),
  }),
  bindings: z.record(id, bindingSchema).default({}),
});
export type Composition = z.infer<typeof compositionSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export const discoverInputSchema = z.strictObject({
  kind: z.enum(["capability", "provider", "recipe"]).optional(),
  id: id.optional(),
});
export const composeInputSchema = z.strictObject({
  mode: z.enum(["preview", "apply"]).default("preview"),
  composition: compositionSchema,
});

export const businessStatusInputSchema = z.strictObject({
  workspaceId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .max(160),
});
const workCount = z.number().int().nonnegative();
export const planningResumeSchema = z.strictObject({
  researchQueries: z.array(
    z.strictObject({
      queryId: z.string(),
      path: z.string(),
      outcome: z.enum(["pending", "observed", "uncertain", "failed"]),
      observedAt: z.string().nullable(),
    }),
  ),
  omittedQueryCount: z.number().int().nonnegative(),
  workflowId: z.literal("workflow.research.research-backed-spec"),
  artifacts: z.array(
    z.strictObject({
      path: z.string(),
      present: z.boolean(),
      bytes: z.number().int().nonnegative(),
      contentSha256: z.string().nullable(),
      acceptance: z.literal("not_evaluated"),
    }),
  ),
  businessComplete: z.literal(false),
  nextAction: z.string(),
});
export const businessStatusSchema = z.strictObject({
  workspaceId: businessStatusInputSchema.shape.workspaceId,
  lifecycle: z.enum(["missing", "not_initialized", "initialized", "run_recorded", "unreadable", "recovery_required"]),
  work: z
    .strictObject({
      total: workCount,
      pending: workCount,
      active: workCount,
      waitingForFounder: workCount,
      blocked: workCount,
      completed: workCount,
      failed: workCount,
      excluded: workCount,
      unknown: workCount,
    })
    .nullable(),
  resume: planningResumeSchema.optional(),
  observedFrom: z.literal("local_runtime"),
  providerProof: z.literal("not_observed"),
});

export const errorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNSUPPORTED_VERSION",
  "UNKNOWN_ENTITY",
  "UNKNOWN_WORKSPACE",
  "UNSUPPORTED_ENTITY_VERSION",
  "UNKNOWN_OPERATION",
  "INCOMPATIBLE_BINDING",
  "COMPOSITION_APPLY_UNAVAILABLE",
  "INTERNAL_ERROR",
  "LOCAL_OPERATION_REFUSED",
  "RECOVERY_REQUIRED",
  "STALE_PREVIEW",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export const errorSchema = z.strictObject({
  code: errorCodeSchema,
  message: z.string(),
  fields: z.array(z.string()),
  retryable: z.boolean(),
  recovery: z.string(),
});
export const entitySchema = z.strictObject({
  kind: z.enum(["capability", "provider", "recipe"]),
  id,
  version,
  title: z.string(),
  description: z.string(),
  operations: z.array(id),
  targets: z.array(z.strictObject({ platform: z.string(), runtime: z.string() })),
  execution: z.enum(["available", "unavailable"]),
});
export type Entity = z.infer<typeof entitySchema>;
export const discoverySchema = z.strictObject({
  items: z.array(entitySchema),
  contractStatus: z.literal("stable"),
  providerExecution: z.enum(["available", "unavailable"]),
});
export const previewSchema = z.strictObject({
  declarationValid: z.literal(true),
  proposalDigest: z.string(),
  recipe: referenceSchema,
  target: compositionSchema.shape.target,
  bindings: z.array(z.strictObject({ operation: id, provider: referenceSchema, connection: connection.optional(), source: z.enum(["recipe", "explicit"]) })),
  canApply: z.boolean(),
  blockers: z.array(
    z.strictObject({
      code: z.enum(["COMPOSITION_APPLY_UNAVAILABLE", "PROVIDER_EXECUTION_UNAVAILABLE", "UNSUPPORTED_TARGET"]),
      message: z.string(),
      operation: id.optional(),
    }),
  ),
  configuration: z.enum(["not_checked", "ready", "blocked"]),
  authority: z.enum(["not_checked", "granted", "required"]),
  verification: z.enum(["not_checked", "verified", "failed"]),
});
export function resultSchema<T extends z.ZodType>(data: T) {
  const common = { apiVersion: z.literal(API_VERSION), requestId: z.string(), warnings: z.array(z.string()) };
  return z.discriminatedUnion("ok", [
    z.strictObject({ ...common, ok: z.literal(true), data }),
    z.strictObject({ ...common, ok: z.literal(false), error: errorSchema }),
  ]);
}
export type Result<T> = { apiVersion: typeof API_VERSION; requestId: string; warnings: string[] } & (
  { ok: true; data: T } | { ok: false; error: z.infer<typeof errorSchema> }
);

const packageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const packageListInputSchema = businessStatusInputSchema;
export const packageImportInputSchema = businessStatusInputSchema.extend({
  sourcePath: z.string().min(1).max(4096),
  dependencyDigests: z.array(packageDigestSchema).default([]),
});
export const activationPlanInputSchema = businessStatusInputSchema.extend({ packageDigests: z.array(packageDigestSchema).min(1).max(100) });
export const activationApplyInputSchema = activationPlanInputSchema.extend({ previewDigest: packageDigestSchema });
export const activationRecoverInputSchema = businessStatusInputSchema.extend({ mode: z.enum(["resume", "restore"]) });
export const packageSummarySchema = z.strictObject({
  id: z.string(),
  version: z.string(),
  digest: packageDigestSchema,
  recipes: z.array(referenceSchema),
  implementations: z.array(referenceSchema),
});
export const packageListSchema = z.strictObject({ packages: z.array(packageSummarySchema) });
export const activationPlanSchema = z.strictObject({
  previewDigest: packageDigestSchema,
  configurationDigest: packageDigestSchema,
  configurationRevision: z.number().int().positive(),
  planId: z.string(),
  priorPlanId: z.string().nullable(),
  retained: z.array(z.string()),
  reopened: z.array(z.string()),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  packageDigests: z.array(packageDigestSchema),
  disclosures: z.array(
    z.strictObject({
      workflowId: z.string(),
      effect: z.string(),
      resources: z.array(z.string()),
      entrypoints: z.array(z.string()),
      requestedAuthorityCategories: z.array(z.string()),
      validationContract: z.strictObject({ id: z.string(), version: z.string(), kind: z.literal("billing") }).optional(),
    }),
  ),
  authorityGranted: z.literal(false),
  providerExecution: z.literal("not_observed"),
});
export const activationResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("activated"), planId: z.string(), configurationRevision: z.number().int().positive(), idempotent: z.boolean() }),
  z.strictObject({ status: z.literal("restored"), planId: z.string().nullable() }),
]);
export const marketReportInputSchema = businessStatusInputSchema.extend({ experimentId: z.string().min(1).max(160) });
export const marketReportSchema = z.strictObject({
  schemaVersion: z.literal("b2c.market-report/v1"),
  experimentId: z.string(),
  experimentRevision: z.number().int().positive(),
  reportDigest: z.string(),
  generatedAt: z.string(),
  comparisonKind: z.literal("exploratory_business_comparison"),
  completion: z.strictObject({ expected: workCount, ready: workCount, degraded: workCount, status: z.enum(["complete", "partial"]) }),
  rows: z.array(
    z.strictObject({
      workspaceId: z.string(),
      hypothesis: z.string(),
      treatment: z.string(),
      state: z.enum(["ready", "degraded"]),
      origin: z.enum(["synthetic", "observed", "unknown"]),
      reasons: z.array(z.string()),
      sources: z.array(z.strictObject({ id: z.string(), revision: z.number(), uri: z.string(), sourceRevision: z.string() })),
      basisDigest: z.string().optional(),
      value: z.number().optional(),
      cost: z.number().optional(),
      exposed: workCount.optional(),
      missingJoinRate: z.number().optional(),
    }),
  ),
  groups: z.array(
    z.strictObject({
      origin: z.enum(["synthetic", "observed"]),
      workspaceIds: z.array(z.string()),
      comparable: z.boolean(),
      reasons: z.array(z.string()),
      aggregate: z.strictObject({ primaryTotal: z.number(), actualCostTotal: z.number(), currency: z.string(), exposed: workCount }).nullable(),
      ranking: z.array(z.string()).nullable(),
    }),
  ),
  authorityGranted: z.literal(false),
  liveLaunchProven: z.literal(false),
  limitations: z.array(z.string()),
});

const lifecycleRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
/** Direct `--mandate` / JSON string bound. File-backed intake uses `FOUNDER_BRIEF_MAX_BYTES`. */
export const DIRECT_MANDATE_MAX_CHARS = 8000;
/** Storage/security cap for the canonical founder brief, not a model-context size. */
export const FOUNDER_BRIEF_MAX_BYTES = 256 * 1024;
export const FOUNDER_BRIEF_ARTIFACT = "operations/FOUNDER_BRIEF.md" as const;
export const LAUNCH_PROGRAM_ARTIFACT = "operations/LAUNCH_PROGRAM.md" as const;
export const founderBriefSourceIntentSchema = z.strictObject({
  artifact: z.literal(FOUNDER_BRIEF_ARTIFACT),
  characterCount: z.number().int().nonnegative(),
  byteLength: z.number().int().nonnegative(),
  digest: lifecycleRevisionSchema,
  derivedView: z.literal(LAUNCH_PROGRAM_ARTIFACT),
  derivedViewEmbedsSource: z.literal(false),
});
export type FounderBriefSourceIntent = z.infer<typeof founderBriefSourceIntentSchema>;
/** Additive `business.plan` output bounds. Kernel projects into these limits; it does not import this module's types into planner state. */
export const PUBLIC_PLAN_BOUNDS = {
  detail: 400,
  failureSummary: 240,
  instructions: 2000,
  path: 240,
  prompt: 400,
  choiceLabel: 120,
  choiceConsequence: 240,
  loadWhen: 400,
  loadEntries: 24,
  pathList: 32,
  gateCommands: 16,
  approvals: 16,
} as const;
/** Bounded active-context slice of the canonical founder brief. Not a substitute for the source file. */
export const FOUNDER_CONSTRAINT_SLICE_MAX = PUBLIC_PLAN_BOUNDS.instructions;
export const founderIntentSliceSchema = z.strictObject({
  artifact: z.literal(FOUNDER_BRIEF_ARTIFACT),
  digest: lifecycleRevisionSchema,
  characterCount: z.number().int().nonnegative(),
  slice: z.string().max(FOUNDER_CONSTRAINT_SLICE_MAX),
  truncated: z.boolean(),
});
export type FounderIntentSlice = z.infer<typeof founderIntentSliceSchema>;
export const publicHoldKinds = ["founder_approval", "autonomy", "blocked", "upstream"] as const;
export const publicHoldKindSchema = z.enum(publicHoldKinds);
export const publicAttemptFailureCodes = [
  "worker.runtime_unavailable",
  "worker.exited",
  "worker.timeout",
  "worker.output_missing",
  "worker.scope_violation",
  "worker.receipt_rejected",
  "attempt.error",
] as const;
export const publicAttemptFailureCodeSchema = z.enum(publicAttemptFailureCodes);
export const publicFounderQuestionClasses = [
  "confirm-product-kind",
  "confirm-go",
  "confirm-spend-cap",
  "confirm-release-publish",
  "confirm-approval",
  "grant-initial-autonomy",
  "raise-autonomy",
  "scope-question",
] as const;
export const publicFounderQuestionClassSchema = z.enum(publicFounderQuestionClasses);
const publicPathSchema = z.string().max(PUBLIC_PLAN_BOUNDS.path);
export const publicPlanLastFailureSchema = z.strictObject({
  code: publicAttemptFailureCodeSchema.optional(),
  summary: z.string().max(PUBLIC_PLAN_BOUNDS.failureSummary),
  withheld: z.boolean(),
  truncated: z.boolean(),
});
export const publicReadyBriefSchema = z.strictObject({
  workflowId: z.string(),
  title: z.string(),
  instructions: z.string().max(PUBLIC_PLAN_BOUNDS.instructions),
  open: z.array(publicPathSchema).max(PUBLIC_PLAN_BOUNDS.pathList),
  consult: z.array(publicPathSchema).max(PUBLIC_PLAN_BOUNDS.pathList),
  load: z
    .array(
      z.strictObject({
        path: publicPathSchema,
        title: z.string(),
        loadWhen: z.string().max(PUBLIC_PLAN_BOUNDS.loadWhen),
        sectionId: z.string().max(160).optional(),
        revision: z.string().max(160).optional(),
      }),
    )
    .max(PUBLIC_PLAN_BOUNDS.loadEntries),
  produce: z.array(publicPathSchema).max(PUBLIC_PLAN_BOUNDS.pathList),
  verify: z.strictObject({
    kind: z.string(),
    gateCommands: z.array(z.string().max(240)).max(PUBLIC_PLAN_BOUNDS.gateCommands),
    failClosed: z.boolean(),
    requiresIndependentReview: z.boolean().optional(),
  }),
  approvals: z.array(z.string().max(400)).max(PUBLIC_PLAN_BOUNDS.approvals),
  truncated: z.boolean(),
  founderIntent: founderIntentSliceSchema.optional(),
  readyWhy: z.string().max(PUBLIC_PLAN_BOUNDS.detail).optional(),
  continuation: z.string().max(PUBLIC_PLAN_BOUNDS.detail).optional(),
  effectBoundary: z.enum(["read_and_produce", "founder_approval_required"]).optional(),
  context: z
    .strictObject({
      instructionChars: z.number().int().nonnegative(),
      loadCount: z.number().int().nonnegative(),
      deferredLoadCount: z.number().int().nonnegative(),
      openCount: z.number().int().nonnegative(),
    })
    .optional(),
});
export const publicFounderQuestionSchema = z.strictObject({
  phase: z.string().max(160),
  class: publicFounderQuestionClassSchema,
  prompt: z.string().max(PUBLIC_PLAN_BOUNDS.prompt),
  choices: z
    .array(
      z.strictObject({
        label: z.string().max(PUBLIC_PLAN_BOUNDS.choiceLabel),
        consequence: z.string().max(PUBLIC_PLAN_BOUNDS.choiceConsequence),
        recommended: z.boolean(),
      }),
    )
    .min(2)
    .max(4),
  skippable: z.boolean(),
  deferrable: z.boolean(),
  appliesToRevision: lifecycleRevisionSchema,
  truncated: z.boolean().optional(),
});
export const businessCreateInputSchema = businessStatusInputSchema.extend({
  directory: z.string().min(1).max(4096),
  name: z.string().min(1).max(160),
  hypothesis: z.string().min(1).max(4000),
  mandate: z.string().min(1).max(DIRECT_MANDATE_MAX_CHARS).optional(),
});
export const businessInitializeInputSchema = businessStatusInputSchema.extend({ expectedRevision: lifecycleRevisionSchema });
export const businessPlanInputSchema = businessStatusInputSchema.extend({ maxConcurrency: z.number().int().min(1).max(8).default(4) });
export const businessRunInputSchema = businessStatusInputSchema.extend({
  expectedRevision: lifecycleRevisionSchema,
  requestId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  scope: z.array(z.string().min(1).max(160)).max(50).default([]),
  wallClockSeconds: z.number().int().min(1).max(3600).default(300),
  maxConcurrency: z.number().int().min(1).max(8).default(1),
});
export const businessRecoverInputSchema = businessStatusInputSchema.extend({
  expectedRevision: lifecycleRevisionSchema,
  requestId: businessRunInputSchema.shape.requestId,
});
export const businessEvidenceInputSchema = businessStatusInputSchema.extend({ workflowId: z.string().max(160).optional() });
export const businessCreatedSchema = z.strictObject({
  workspaceId: z.string(),
  status: z.literal("hypothesis"),
  revision: lifecycleRevisionSchema,
  nextAction: z.string(),
  sourceIntent: founderBriefSourceIntentSchema,
});
export const businessInitializedSchema = z.strictObject({
  workspaceId: z.string(),
  status: z.enum(["initialized", "already_initialized"]),
  revision: lifecycleRevisionSchema,
  authorityGranted: z.literal(false),
});
const lifecycleWorkSchema = z.strictObject({
  workflowId: z.string(),
  title: z.string(),
  status: z.string(),
  reasonCode: z.string().optional(),
  reason: z.string().optional(),
  holdKind: publicHoldKindSchema.optional(),
  detail: z.string().max(PUBLIC_PLAN_BOUNDS.detail).optional(),
  detailTruncated: z.boolean().optional(),
  lastFailure: publicPlanLastFailureSchema.optional(),
  effectBoundary: z.enum(["read_and_produce", "founder_approval_required"]).optional(),
  brief: publicReadyBriefSchema.optional(),
});
export const businessCompletionSchema = z.strictObject({
  deliveryAccepted: z.boolean(),
  closeoutWorkflowId: z.string(),
  requiredCount: workCount,
  excludedCount: workCount,
  outstandingCount: workCount,
  assessed: z.boolean(),
  nextAction: z.string(),
});
export const businessPlanSchema = z.strictObject({
  completion: businessCompletionSchema,
  resume: planningResumeSchema.optional(),
  workspaceId: z.string(),
  revision: lifecycleRevisionSchema,
  planId: z.string().nullable(),
  status: z.enum(["ready", "held", "not_initialized"]),
  ready: z.array(lifecycleWorkSchema),
  held: z.array(lifecycleWorkSchema),
  completed: z.number().int().nonnegative(),
  providerObservation: z.literal("not_requested"),
  authorityGranted: z.literal(false),
  founderQuestion: publicFounderQuestionSchema.nullable().optional(),
  nextAction: z.string(),
  founderIntent: founderIntentSliceSchema.optional(),
});
export type BusinessPlan = z.infer<typeof businessPlanSchema>;
export type PublicHoldKind = z.infer<typeof publicHoldKindSchema>;
export type PublicReadyBrief = z.infer<typeof publicReadyBriefSchema>;
export type PublicFounderQuestion = z.infer<typeof publicFounderQuestionSchema>;
export const businessRunSchema = z.strictObject({
  completion: businessCompletionSchema,
  workspaceId: z.string(),
  requestId: z.string(),
  runId: z.string().nullable(),
  planId: z.string().nullable(),
  outcome: z.string(),
  completed: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  replayed: z.boolean(),
  scope: z.literal("bounded_session"),
  notifications: z.literal("disabled"),
  providerProof: z.literal("not_observed"),
});
export const businessRecoveredSchema = z.strictObject({
  workspaceId: z.string(),
  requestId: z.string(),
  revision: lifecycleRevisionSchema,
  result: businessRunSchema.pick({ runId: true, planId: true, outcome: true, completed: true, held: true }),
  replayed: z.boolean(),
  dispatched: z.literal(false),
});
export const businessEvidenceSchema = z.strictObject({
  workspaceId: z.string(),
  revision: lifecycleRevisionSchema,
  runId: z.string().nullable(),
  planId: z.string().nullable(),
  items: z.array(
    z.strictObject({
      workflowId: z.string(),
      status: z.string(),
      attemptId: z.string().nullable(),
      proofSource: z.enum(["workspace", "synthetic", "unobserved"]),
      acceptance: z.enum(["current", "stale", "pending", "absent"]),
      artifactIds: z.array(z.string()),
      reasonCodes: z.array(z.string()),
    }),
  ),
  liveLaunchProven: z.literal(false),
});

export const researchLookupInputSchema = businessStatusInputSchema.extend({ query: researchQuerySchema, maxAgeSeconds: z.number().int().min(0).max(2592000) });
export const researchRecordInputSchema = businessStatusInputSchema.extend({
  expectedRevision: lifecycleRevisionSchema,
  observation: researchObservationInputSchema,
});
export const researchLookupSchema = z.strictObject({
  workspaceId: z.string(),
  revision: lifecycleRevisionSchema,
  queryId: z.string(),
  status: z.enum(["needs_collection", "needs_reconciliation", "stale", "reusable"]),
  observation: savedResearchObservationSchema.extend({ path: z.string(), sha256: z.string() }).nullable(),
  authorityGranted: z.literal(false),
  acceptedProof: z.literal(false),
});
export const researchRecordedSchema = z.strictObject({
  workspaceId: z.string(),
  revision: lifecycleRevisionSchema,
  queryId: z.string(),
  path: z.string(),
  sha256: z.string(),
  authorityGranted: z.literal(false),
  acceptedProof: z.literal(false),
});

export const PUBLIC_OPERATIONS = [
  {
    id: "business.research.lookup",
    cli: "research-lookup",
    mcp: "b2c_research_lookup",
    title: "Look up saved research",
    description:
      "Read matching workspace research observations under an explicit freshness limit. No provider calls, writes or spending authority. Pending and uncertain requests require reconciliation.",
    inputSchema: researchLookupInputSchema,
    outputSchema: resultSchema(researchLookupSchema),
    flags: ["workspace", "query", "max-age", "json"],
  },
  {
    id: "business.research.record",
    cli: "research-record",
    mcp: null,
    title: "Checkpoint planning research",
    description:
      "Record a bounded non-secret planning observation in a registered workspace at an exact revision. Does not call providers or accept proof. Retains immutable prior observations; never blindly repeats uncertain paid work.",
    inputSchema: researchRecordInputSchema,
    outputSchema: resultSchema(researchRecordedSchema),
    flags: ["workspace", "revision", "observation", "json"],
  },
  {
    id: "catalog.list",
    cli: "catalog",
    mcp: "b2c_discover",
    title: "Discover consumer-business primitives",
    description:
      "List versioned capabilities, provider declarations, and recipes. Declaration is distinct from executable support. Reads bundled metadata only; no workspace or provider access.",
    inputSchema: discoverInputSchema,
    outputSchema: resultSchema(discoverySchema),
    flags: ["kind", "id", "json"],
  },
  {
    id: "composition.preview",
    cli: "compose",
    mcp: "b2c_compose",
    title: "Preview a consumer-business composition",
    description:
      "Validate a b2c/v1 composition and resolve operation-level provider selections. Returns explicit support blockers. No workspace access, provider calls, package execution, grants, or state changes. mode=apply is reserved and returns COMPOSITION_APPLY_UNAVAILABLE.",
    inputSchema: composeInputSchema,
    outputSchema: resultSchema(previewSchema),
    flags: ["config", "json", "schema", "apply"],
  },
  {
    id: "business.status",
    cli: "business-status",
    mcp: "b2c_business_status",
    title: "Inspect a registered consumer business",
    description:
      "Read sanitized lifecycle and aggregate work counts for one registered workspace ID. Reads existing local runtime state only. Does not expose workspace paths, state documents, grants or digest content, and does not observe providers or prove business outcomes.",
    inputSchema: businessStatusInputSchema,
    outputSchema: resultSchema(businessStatusSchema),
    flags: ["workspace", "json"],
  },
  {
    id: "packages.list",
    cli: "packages",
    mcp: "b2c_packages",
    title: "Inspect installed packages",
    description: "Read verified immutable package metadata in one registered workspace. No source paths or package code execution.",
    inputSchema: packageListInputSchema,
    outputSchema: resultSchema(packageListSchema),
    flags: ["workspace", "json"],
  },
  {
    id: "packages.import",
    cli: "package-import",
    mcp: null,
    title: "Import a local package snapshot",
    description:
      "CLI operator-only import into the registered workspace immutable package store. Dependencies use explicit installed digests. Does not activate or execute package code.",
    inputSchema: packageImportInputSchema,
    outputSchema: resultSchema(packageSummarySchema),
    flags: ["workspace", "source", "dependencies", "json"],
  },
  {
    id: "composition.plan",
    cli: "composition-plan",
    mcp: "b2c_composition_plan",
    title: "Plan installed composition activation",
    description:
      "Resolve authored b2c.yaml against explicit installed package digests and preview a recoverable local pin transaction. Does not grant authority or execute providers.",
    inputSchema: activationPlanInputSchema,
    outputSchema: resultSchema(activationPlanSchema),
    flags: ["workspace", "packages", "json"],
  },
  {
    id: "composition.activate",
    cli: "composition-activate",
    mcp: null,
    title: "Activate installed composition",
    description:
      "CLI-only local activation with an exact current preview digest. Refuses changed inputs and unreconciled run history. No grants or provider effects.",
    inputSchema: activationApplyInputSchema,
    outputSchema: resultSchema(activationResultSchema),
    flags: ["workspace", "packages", "preview", "json"],
  },
  {
    id: "composition.recover",
    cli: "composition-recover",
    mcp: null,
    title: "Recover interrupted activation",
    description: "CLI-only resume or restore of the existing durable local activation journal. Does not repin mutable sources.",
    inputSchema: activationRecoverInputSchema,
    outputSchema: resultSchema(activationResultSchema),
    flags: ["workspace", "mode", "json"],
  },
  {
    id: "market.report",
    cli: "market-report",
    mcp: "b2c_market_report",
    title: "Read a market experiment report",
    description:
      "Read registered independent businesses from existing metric contracts and accepted observations. Separates synthetic evidence, partial completion, and comparable outcomes. Grants no authority and proves no live launch.",
    inputSchema: marketReportInputSchema,
    outputSchema: resultSchema(marketReportSchema),
    flags: ["workspace", "experiment", "json"],
  },
  {
    id: "business.create",
    cli: "business-create",
    mcp: null,
    title: "Create a consumer-business hypothesis",
    description: "CLI-only scaffold and registration in an explicitly selected empty directory. Creates no grants, providers or accepted product decision.",
    inputSchema: businessCreateInputSchema,
    outputSchema: resultSchema(businessCreatedSchema),
    flags: ["workspace", "directory", "name", "hypothesis", "mandate", "mandate-file", "json"],
  },
  {
    id: "business.initialize",
    cli: "business-initialize",
    mcp: null,
    title: "Initialize an accepted consumer business",
    description:
      "CLI-only initialization of an accepted authored product through the existing bootstrap and reducer. Refuses active composition replacement and grants no authority.",
    inputSchema: businessInitializeInputSchema,
    outputSchema: resultSchema(businessInitializedSchema),
    flags: ["workspace", "revision", "json"],
  },
  {
    id: "business.plan",
    cli: "business-plan",
    mcp: "b2c_business_plan",
    title: "Plan authorized consumer-business work",
    description:
      "Passive registered-workspace frontier from existing compiler and autonomy owner. No network or provider prerequisite probes; unobserved prerequisites remain held. Ready work includes bounded briefs. Held work includes hold classification, bounded detail, and a sanitized last failure when one exists. The current founder question is bound to this revision and is not an approval. completion.deliveryAccepted is current closeout evidence, not store submission or release.",
    inputSchema: businessPlanInputSchema,
    outputSchema: resultSchema(businessPlanSchema),
    flags: ["workspace", "concurrency", "json"],
  },
  {
    id: "business.run",
    cli: "business-run",
    mcp: null,
    title: "Run one authorized business session",
    description:
      "CLI-only bounded execution through the existing runner, exact revision and durable request identity. Uses existing grants. Notifications disabled. Selected operations require trusted host routes. A successful bounded session is not delivery; inspect completion.deliveryAccepted. liveLaunchProven stays false without provider-native proof.",
    inputSchema: businessRunInputSchema,
    outputSchema: resultSchema(businessRunSchema),
    flags: ["workspace", "revision", "request", "scope", "seconds", "concurrency", "json"],
  },
  {
    id: "business.recover",
    cli: "business-recover",
    mcp: null,
    title: "Close a reconciled interrupted business request",
    description:
      "CLI-only revision-checked recovery of a settled request through the session owner. Refuses live sessions and uncertain effects; records interruption without dispatch or acceptance.",
    inputSchema: businessRecoverInputSchema,
    outputSchema: resultSchema(businessRecoveredSchema),
    flags: ["workspace", "revision", "request", "json"],
  },
  {
    id: "business.evidence",
    cli: "business-evidence",
    mcp: "b2c_business_evidence",
    title: "Read current business evidence",
    description:
      "Project current run attempts, artifact identities and validated acceptance. No raw state, grants or provider credentials. Synthetic proof and stale evidence remain explicit. liveLaunchProven stays false until separately granted provider-native proof.",
    inputSchema: businessEvidenceInputSchema,
    outputSchema: resultSchema(businessEvidenceSchema),
    flags: ["workspace", "workflow", "json"],
  },
] as const;
export type OperationId = (typeof PUBLIC_OPERATIONS)[number]["id"];
