import { z } from "zod";

/**
 * The contribution and upstream-maintenance contract (`b2c.contribution/v1`).
 *
 * One typed vocabulary shared by the CLI (`b2c contribute ...`), the opt-in contributor MCP
 * surface, the repository checks, and the credits renderer. It describes sources, adoption
 * maps, derivations, evaluations, and upstream relationships. It grants nothing: a manifest
 * never installs, executes, publishes, spends, or authorizes. Every executable step stays behind
 * the existing CLI, package, and authority owners.
 *
 * Vocabulary
 * - source record: the canonical origin of external material (repository, post, skill, ...).
 * - unit: one coherent useful piece taken from a source, or an original piece, with a disposition.
 * - derivation: how a local reference or resource relates to its sources.
 * - upstream manifest: the maintained relationship with an external project the builder relies on.
 * - upstream observation: a dated read of what the upstream and the host currently expose.
 */
export const CONTRIBUTION_API_VERSION = "b2c.contribution/v1" as const;

const text = z.string().trim().min(1).max(2000);
const shortText = z.string().trim().min(1).max(400);
const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/u)
  .max(120);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const isoDateTime = z.iso.datetime();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const httpsUrl = z.url({ protocol: /^https$/u });
const nonNegative = z.number().int().nonnegative();

export const SOURCE_KINDS = [
  "repository",
  "post",
  "article",
  "skill",
  "library",
  "tool",
  "screenshot-utility",
  "showcase",
  "managed-provider",
  "local-package",
  "other",
] as const;
export const RETRIEVAL_STATUSES = ["complete", "excerpt", "screenshot", "inaccessible", "secondary", "not-retrieved"] as const;
export const RIGHTS_STATUSES = ["verified", "unverified", "unknown", "incompatible", "not-redistributable", "not-applicable"] as const;
export const DERIVATION_RELATIONSHIPS = ["informed", "adapted", "copied", "wrapped", "dependency", "referenced"] as const;
export const DISPOSITIONS = ["reference", "adapt", "reuse", "wrap", "vendor", "defer", "reject", "original"] as const;
export const UNIT_KINDS = ["knowledge", "recipe", "implementation", "resource", "evaluation", "showcase"] as const;
export const CONTRIBUTION_SCOPES = ["business", "contribution", "maintenance"] as const;
export const UNIT_STATUSES = ["proposed", "accepted", "rejected", "deferred"] as const;
export const DIRECTIVE_CATEGORIES = [
  "install",
  "execute",
  "overwrite-artifact",
  "configure-agent",
  "publish",
  "grant-permission",
  "fetch-remote",
  "other",
] as const;
export const INVENTORY_ROLES = [
  "license",
  "readme",
  "agent-instructions",
  "skill",
  "setup-script",
  "hook",
  "source-code",
  "test",
  "documentation",
  "font",
  "image",
  "screenshot",
  "template",
  "manifest",
  "lockfile",
  "binary",
  "other",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];
export type DerivationRelationship = (typeof DERIVATION_RELATIONSHIPS)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type ContributionScope = (typeof CONTRIBUTION_SCOPES)[number];

/** A sentence inside fetched material that reads as an instruction to the agent. It is data. */
export const sourceDirectiveSchema = z.strictObject({
  text: z.string().max(500),
  location: shortText,
  category: z.enum(DIRECTIVE_CATEGORIES),
  action: z.literal("refused"),
});
export type SourceDirective = z.infer<typeof sourceDirectiveSchema>;

export const sourceRightsSchema = z.strictObject({
  status: z.enum(RIGHTS_STATUSES),
  spdx: shortText.optional(),
  /** Path or URL of the license text that was inspected, or an explanation of what was found. */
  evidence: shortText.optional(),
  evidenceSha256: sha256.optional(),
  /** What the evidence covers, e.g. "root LICENSE; fonts under assets/ are excluded". */
  scope: shortText.optional(),
  notes: z.string().max(2000).optional(),
});
export type SourceRights = z.infer<typeof sourceRightsSchema>;

export const sourceInventoryEntrySchema = z.strictObject({
  path: shortText,
  role: z.enum(INVENTORY_ROLES),
  bytes: nonNegative,
  sha256: sha256.optional(),
});

export const sourceRecordSchema = z.strictObject({
  id: slug,
  kind: z.enum(SOURCE_KINDS),
  title: shortText,
  canonicalUrl: httpsUrl.optional(),
  localPath: shortText.optional(),
  /** Author or publishing organization when known. Never replaced by the adopter. */
  publisher: shortText.optional(),
  publishedAt: shortText.optional(),
  retrievedAt: isoDateTime.optional(),
  reviewedAt: isoDate.optional(),
  /** Immutable revision (tag, commit) or a content fingerprint `sha256:<hex>`. */
  revision: shortText.optional(),
  retrieval: z.strictObject({ status: z.enum(RETRIEVAL_STATUSES), method: shortText.optional(), notes: z.string().max(2000).optional() }),
  rights: sourceRightsSchema,
  /** Files or sections that carry the useful material. */
  selectors: z.array(shortText).default([]),
  registrySourceId: shortText.optional(),
  upstreamId: slug.optional(),
  directives: z.array(sourceDirectiveSchema).default([]),
  inventory: z.array(sourceInventoryEntrySchema).default([]),
  unknowns: z.array(shortText).default([]),
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;

export const unitTargetSchema = z.strictObject({
  kind: z.enum([
    "existing-reference",
    "new-reference",
    "extension-package",
    "provider-adapter",
    "check",
    "evaluation-case",
    "showcase",
    "recipe",
    "workflow",
    "document",
    "undecided",
  ]),
  id: shortText.optional(),
  path: shortText.optional(),
  /** The existing local owner this unit would change, when one exists. */
  owner: shortText.optional(),
});

export const contributionUnitSchema = z.strictObject({
  id: slug,
  kind: z.enum(UNIT_KINDS),
  title: shortText,
  /** `null` marks an original unit. It needs no fabricated upstream. */
  upstream: z.strictObject({ sourceId: slug, selector: shortText.optional() }).nullable(),
  target: unitTargetSchema,
  disposition: z.enum(DISPOSITIONS),
  status: z.enum(UNIT_STATUSES).default("proposed"),
  rationale: text,
  verification: z.array(shortText).default([]),
  kept: z.array(shortText).default([]),
  changed: z.array(shortText).default([]),
  omitted: z.array(shortText).default([]),
  deferred: z.array(shortText).default([]),
  conflicts: z.array(z.strictObject({ with: shortText, resolution: shortText })).default([]),
  /** A creator's aesthetic is a selectable method; it never becomes an automatic universal default. */
  selection: z.enum(["always", "selected-method", "reference-only"]).default("selected-method"),
  /** Claims that need a primary-source check before promotion (platform versions, toolchains). */
  applicability: z.array(shortText).default([]),
});
export type ContributionUnit = z.infer<typeof contributionUnitSchema>;

export const derivationSchema = z.strictObject({
  /** Local reference id or repository-relative path. */
  target: shortText,
  sourceIds: z.array(slug).min(1),
  relationship: z.enum(DERIVATION_RELATIONSHIPS),
  baseline: shortText.optional(),
  selectors: z.array(shortText).default([]),
  rationale: text,
  omissions: z.array(shortText).default([]),
  reviewer: shortText,
  reviewedAt: isoDate,
  evaluation: shortText.optional(),
  /** Path of the retained notice text. Required for copied material. */
  notice: shortText.optional(),
});
export type Derivation = z.infer<typeof derivationSchema>;

export const evaluationCaseSchema = z.strictObject({
  id: slug,
  unitId: slug,
  kind: z.enum(["counterexample", "launchbench-scenario", "command", "rendered-review", "comparison"]),
  description: text,
  mustFail: z.array(shortText).default([]),
  mustPass: z.array(shortText).default([]),
  path: shortText.optional(),
  command: shortText.optional(),
  observations: z
    .array(z.strictObject({ dimension: z.enum(["quality", "failures", "effort", "latency", "context-cost"]), value: shortText, note: shortText.optional() }))
    .default([]),
});
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export const contributionNoticeSchema = z.strictObject({
  sourceId: slug,
  spdx: shortText,
  copyright: shortText,
  noticePath: shortText,
  covers: z.array(shortText).min(1),
});

export const contributionManifestSchema = z.strictObject({
  apiVersion: z.literal(CONTRIBUTION_API_VERSION),
  id: slug,
  goal: text,
  scope: z.enum(CONTRIBUTION_SCOPES),
  routing: z.strictObject({ intendedTarget: shortText, effect: shortText, verdict: z.enum(CONTRIBUTION_SCOPES), reason: text }),
  createdAt: isoDateTime,
  /** True when every source is a labeled fixture rather than a real creator's material. */
  synthetic: z.boolean().default(false),
  sources: z.array(sourceRecordSchema),
  batchOverlap: z.array(z.strictObject({ topic: shortText, sourceIds: z.array(slug).min(2) })).default([]),
  existingOwners: z.array(z.strictObject({ id: shortText, path: shortText, match: shortText })).default([]),
  units: z.array(contributionUnitSchema),
  derivations: z.array(derivationSchema).default([]),
  evaluations: z.array(evaluationCaseSchema).default([]),
  affectedOutputs: z.array(shortText).default([]),
  requiredChecks: z.array(shortText).default([]),
  uncertainties: z.array(shortText).default([]),
  missingCoreMechanism: z.strictObject({ present: z.boolean(), description: text.optional() }),
  notices: z.array(contributionNoticeSchema).default([]),
});
export type ContributionManifest = z.infer<typeof contributionManifestSchema>;

/* ------------------------------------------------------------------------------------------ */
/* Upstream relationships                                                                       */
/* ------------------------------------------------------------------------------------------ */

export const UPSTREAM_RELATIONSHIP_KINDS = [
  "external-executable",
  "direct-dependency",
  "selected-skill-guidance",
  "adapted-method",
  "copied-code",
  "template-or-asset",
  "remote-service",
] as const;
export type UpstreamRelationshipKind = (typeof UPSTREAM_RELATIONSHIP_KINDS)[number];

export const UPSTREAM_REVIEW_STATUSES = ["current", "review-due", "deferred", "risk-review"] as const;
export const CREDIT_USES = ["direct", "wrapped", "adapted", "inspiration", "service"] as const;

const baselineSchema = z.strictObject({
  revision: shortText,
  observedAt: isoDate,
  by: shortText,
  note: z.string().max(2000).optional(),
  digest: shortText.optional(),
});

export const upstreamManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: slug,
  project: shortText,
  canonicalUrl: httpsUrl,
  homepage: httpsUrl.optional(),
  aliases: z.array(shortText).default([]),
  /** Known renames, transfers, or forks that share this identity. */
  transfers: z.array(shortText).default([]),
  authors: z.array(z.strictObject({ name: shortText, role: shortText })).min(1),
  maintainers: z.array(z.strictObject({ name: shortText, role: shortText })).default([]),
  copyright: shortText.optional(),
  license: z.strictObject({
    spdx: shortText,
    status: z.enum(RIGHTS_STATUSES),
    evidenceUrl: httpsUrl.optional(),
    evidenceSha256: sha256.optional(),
    reviewedRevision: shortText.optional(),
    /** Repository-relative path of the retained verbatim notice text. */
    noticeFile: shortText.optional(),
    scope: shortText.optional(),
    notes: z.string().max(2000).optional(),
  }),
  /** A public repository license never licenses a hosted service. Record the service terms separately. */
  serviceTerms: z
    .strictObject({ url: httpsUrl.optional(), status: z.enum(["not-applicable", "reviewed", "unreviewed"]), notes: z.string().max(2000).optional() })
    .optional(),
  /** Rows in checks/validation/repository/source-registry.yaml. */
  sourceIds: z.array(shortText).min(1),
  relationships: z
    .array(
      z.strictObject({
        kind: z.enum(UPSTREAM_RELATIONSHIP_KINDS),
        consumption: text,
        localOwners: z.array(shortText).min(1),
        tests: z.array(shortText).default([]),
        upstreamPaths: z.array(shortText).default([]),
        /** Where the resolved value comes from: a lockfile, a pin file, PATH lookup, or a service. */
        pinAuthority: shortText,
      }),
    )
    .min(1),
  baselines: z.strictObject({ reviewedSource: baselineSchema.optional(), reviewedGuidance: baselineSchema.optional() }),
  support: z.strictObject({
    policy: text,
    versions: z.array(z.strictObject({ range: shortText, status: z.enum(["supported", "untested", "unsupported"]), evidence: z.array(shortText).default([]) })),
    operations: z.array(z.strictObject({ id: shortText, title: shortText, keywords: z.array(shortText).default([]), owners: z.array(shortText).default([]) })),
    unsupportedOperations: z.array(z.strictObject({ id: shortText, reason: shortText })).default([]),
    platforms: z.array(shortText).default([]),
  }),
  /** Intentional local deviations that a refresh must preserve. */
  adaptations: z.array(z.strictObject({ id: slug, description: text, owner: shortText, intentional: z.literal(true) })).default([]),
  /** Read-only host probe. Version output only; never an install or upgrade. */
  hostProbe: z.strictObject({ command: shortText, args: z.array(shortText), versionPattern: shortText }).optional(),
  review: z.strictObject({
    owner: shortText,
    cadenceDays: z.number().int().min(1).max(3650),
    lastReview: isoDate,
    status: z.enum(UPSTREAM_REVIEW_STATUSES),
    deferral: z.strictObject({ reason: text, reconsiderWhen: text, owner: shortText }).optional(),
  }),
  credits: z.strictObject({ acknowledge: z.boolean(), use: z.enum(CREDIT_USES), summary: text }),
});
export type UpstreamManifest = z.infer<typeof upstreamManifestSchema>;

export const upstreamObservationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  upstreamId: slug,
  checkedAt: isoDateTime,
  method: z.enum(["github-api", "recorded-fixture", "manual"]),
  latestStable: z
    .strictObject({
      tag: shortText,
      publishedAt: isoDateTime,
      url: httpsUrl.optional(),
      assets: z.array(z.strictObject({ name: shortText, sha256: sha256.optional(), bytes: nonNegative.optional() })).default([]),
    })
    .nullable(),
  prereleases: z.array(z.strictObject({ tag: shortText, publishedAt: isoDateTime })).default([]),
  branchHead: z.strictObject({ branch: shortText, sha: shortText, committedAt: isoDateTime }).nullable(),
  releasesSinceBaseline: z.array(z.strictObject({ tag: shortText, publishedAt: isoDateTime, summary: z.string().max(4000) })).default([]),
  licenseSha256: sha256.nullable(),
  licenseChanged: z.boolean().nullable(),
  archived: z.boolean().nullable(),
  host: z
    .strictObject({
      observedAt: isoDateTime,
      executables: z.array(
        z.strictObject({ path: shortText, version: shortText.nullable(), sha256: sha256.nullable(), pathOrder: nonNegative, manager: shortText.optional() }),
      ),
      selected: shortText.nullable(),
    })
    .nullable(),
  unknowns: z.array(shortText).default([]),
});
export type UpstreamObservation = z.infer<typeof upstreamObservationSchema>;

/* ------------------------------------------------------------------------------------------ */
/* Operations and envelopes                                                                     */
/* ------------------------------------------------------------------------------------------ */

export const contributionErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "SOURCE_UNAVAILABLE",
  "SOURCE_REFUSED",
  "UNKNOWN_UPSTREAM",
  "UNKNOWN_CONTRIBUTION",
  "NETWORK_DISABLED",
  "SCOPE_REFUSED",
  "LOCAL_OPERATION_REFUSED",
  "INTERNAL_ERROR",
]);
export type ContributionErrorCode = z.infer<typeof contributionErrorCodeSchema>;

export interface ContributionFailure {
  readonly apiVersion: typeof CONTRIBUTION_API_VERSION;
  readonly requestId: string;
  readonly ok: false;
  readonly warnings: string[];
  readonly error: { code: ContributionErrorCode; message: string; fields: string[]; retryable: boolean; recovery: string };
}
export interface ContributionSuccess<T> {
  readonly apiVersion: typeof CONTRIBUTION_API_VERSION;
  readonly requestId: string;
  readonly ok: true;
  readonly warnings: string[];
  readonly data: T;
}
export type ContributionResult<T> = ContributionSuccess<T> | ContributionFailure;

const sourceInputSchema = z.strictObject({ url: httpsUrl.optional(), path: shortText.optional() });

export const planInputSchema = z.strictObject({
  sources: z.array(sourceInputSchema).min(1).max(12),
  goal: text,
  scope: z.enum(CONTRIBUTION_SCOPES).optional(),
  /** Contribution root to write `contribution.yaml` and `ADOPTION_MAP.md` into. Omit for a dry run. */
  target: shortText.optional(),
  synthetic: z.boolean().optional(),
  /** Network intake is a CLI decision. The contributor MCP never fetches. */
  network: z.boolean().optional(),
  /** Batch members are inspected as a group for overlap; provenance stays per source. */
  batch: z.boolean().optional(),
});
export const targetInputSchema = z.strictObject({ target: shortText });
export const evaluateInputSchema = z.strictObject({ target: shortText, suite: shortText.optional(), allowCommands: z.boolean().optional() });
export const upstreamsListInputSchema = z.strictObject({ upstreamId: slug.optional(), observeHost: z.boolean().optional() });
export const upstreamCheckInputSchema = z.strictObject({
  upstreamId: slug,
  fetch: z.boolean().optional(),
  write: z.boolean().optional(),
  observeHost: z.boolean().optional(),
});
export const upgradePlanInputSchema = z.strictObject({ upstreamId: slug, candidate: shortText.optional(), target: shortText.optional() });

/** Additive upgrade-plan output. Historical inputs stay `upgradePlanInputSchema`. */
export const PROVIDER_DELTA_REVIEW_STATUSES = ["changed", "unchanged", "unknown"] as const;
export type ProviderDeltaReviewStatus = (typeof PROVIDER_DELTA_REVIEW_STATUSES)[number];
export const PROVIDER_DELTA_TRANSPORTS = ["cli", "api", "mcp", "sdk", "service", "unknown"] as const;
export const SOURCE_PAGE_DELTA_OWNER = "catalog/providers/capability-delta.yaml" as const;

const providerDeltaReviewField = z.strictObject({
  status: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
  items: z.array(shortText).max(32),
  evidence: shortText.optional(),
});

export const providerCapabilityDeltaSchema = z.strictObject({
  applicable: z.boolean(),
  reason: shortText.optional(),
  provider: slug.optional(),
  transport: z.enum(PROVIDER_DELTA_TRANSPORTS).optional(),
  fromReviewed: shortText.optional(),
  toCandidate: shortText.optional(),
  nativeChanges: z
    .strictObject({
      added: providerDeltaReviewField,
      removed: providerDeltaReviewField,
      inputs: providerDeltaReviewField,
      outputs: providerDeltaReviewField,
      errors: providerDeltaReviewField,
      pagination: providerDeltaReviewField,
      authentication: providerDeltaReviewField,
      effects: providerDeltaReviewField,
      idempotencyOrRecovery: providerDeltaReviewField,
      costOrQuota: providerDeltaReviewField,
      experimentalOrDeprecated: providerDeltaReviewField,
    })
    .optional(),
  mappingImpact: z
    .strictObject({
      adapterEncoder: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      adapterTransport: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      adapterDecoder: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      reconciler: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      supportDeclaration: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      canonicalContractChange: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      workflowOrKernelChange: z.enum(PROVIDER_DELTA_REVIEW_STATUSES),
      canonicalContractJustification: shortText.optional(),
      workflowOrKernelJustification: shortText.optional(),
    })
    .optional(),
  versionFacts: z
    .strictObject({
      latestObservation: shortText,
      reviewedBaseline: shortText,
      supportedRange: shortText,
      workspacePin: z.literal("unchanged"),
      observedExecutable: shortText,
    })
    .optional(),
  sourcePageDelta: z
    .strictObject({
      owner: z.literal(SOURCE_PAGE_DELTA_OWNER),
      classification: shortText.nullable(),
      migration: shortText.nullable(),
      note: shortText,
    })
    .optional(),
  notes: z.array(shortText).max(12).optional(),
});
export type ProviderCapabilityDelta = z.infer<typeof providerCapabilityDeltaSchema>;

/** `mcp: null` keeps an operation CLI-only. Concrete schema types stay visible so MCP registration types check. */
export const CONTRIBUTION_OPERATIONS = [
  {
    id: "contribution.plan",
    cli: "plan",
    mcp: "b2c_contribute_plan",
    title: "Plan an adoption from external sources",
    description:
      "Inspect explicitly named sources and produce an adoption map: source records, useful units, existing local owners, proposed dispositions, rights decisions, refused directives, required checks, and uncertainties. Intake never executes package code, hooks, generators, or setup. MCP inspects local roots only and writes nothing.",
    inputSchema: planInputSchema,
    writes: true,
  },
  {
    id: "contribution.check",
    cli: "check",
    mcp: "b2c_contribute_check",
    title: "Check a contribution root",
    description:
      "Validate contribution.yaml: schema, scope routing, rights evidence for adapted or copied units, notices for copied material, refused directives, original units without a fabricated upstream, and evaluation coverage.",
    inputSchema: targetInputSchema,
    writes: false,
  },
  {
    id: "contribution.preview",
    cli: "preview",
    mcp: "b2c_contribute_preview",
    title: "Preview runtime delivery",
    description:
      "Show what active workers would receive if the contribution were adopted: bound workflows, lifecycle-based inclusion, draft and reference-only exclusions, and coverage limits. It changes no catalog or workspace.",
    inputSchema: targetInputSchema,
    writes: false,
  },
  {
    id: "contribution.evaluate",
    cli: "evaluate",
    mcp: null,
    title: "Run declared evaluations",
    description:
      "Run the evaluation cases a contribution declares: counterexample checks, LaunchBench scenario lint, and explicitly allowed commands. Rendered review stays a human or vision task and never auto-passes.",
    inputSchema: evaluateInputSchema,
    writes: false,
  },
  {
    id: "upstreams.list",
    cli: "upstreams",
    mcp: "b2c_contribute_upstreams",
    title: "Upstream inventory",
    description:
      "Read model over upstream manifests, source-registry rows, freshness snapshots, provider contracts, lockfiles, and recorded observations. Unknown values stay unknown. Optional host observation runs version probes only.",
    inputSchema: upstreamsListInputSchema,
    writes: false,
  },
  {
    id: "upstreams.check",
    cli: "upstream-check",
    mcp: "b2c_contribute_upstream_check",
    title: "Check an upstream for changes",
    description:
      "Compare the reviewed baseline, supported versions, latest observed release, branch head, license, and host executable. Network fetch and observation writes are CLI-only. Classification is a candidate for maintainer review, never a verdict.",
    inputSchema: upstreamCheckInputSchema,
    writes: true,
  },
  {
    id: "upstreams.upgrade-plan",
    cli: "upgrade-plan",
    mcp: "b2c_contribute_upgrade_plan",
    title: "Prepare an upgrade contribution",
    description:
      "Produce a bounded upgrade plan for one upstream: candidate revision and digests, releases since the baseline, retained adaptations, expected local diff, affected operations, required verification, adoption notes, and an optional Provider Capability Delta. It changes no active business pin.",
    inputSchema: upgradePlanInputSchema,
    writes: true,
  },
] as const;
export type ContributionOperationDeclaration = (typeof CONTRIBUTION_OPERATIONS)[number];
export type ContributionOperationId = ContributionOperationDeclaration["id"];
