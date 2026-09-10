import type { ContributionManifest, ContributionScope, ProviderCapabilityDelta, UpstreamObservation } from "../../contracts/contribution/contract.js";

/**
 * Result data shapes for the contribution service. The CLI and the contributor MCP surface
 * return these inside the shared `b2c.contribution/v1` envelope, so both projections carry the
 * same semantics. Every field is plain data: no paths escape the configured roots, no secrets,
 * and no claim of live support beyond what was actually tested.
 */

export interface PlanData {
  readonly manifest: ContributionManifest;
  readonly adoptionMapMarkdown: string;
  /** Absolute paths written, or null for a dry run (always null on the MCP surface). */
  readonly written: { readonly contributionYaml: string; readonly adoptionMap: string } | null;
  readonly refusedDirectives: number;
  readonly networkUsed: boolean;
  readonly routing: { readonly verdict: ContributionScope; readonly reason: string };
}

export interface CheckIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly unitId?: string;
  readonly sourceId?: string;
}

export interface CheckData {
  readonly target: string;
  readonly manifestId: string;
  readonly pass: boolean;
  readonly issues: CheckIssue[];
  readonly summary: {
    readonly units: number;
    readonly sources: number;
    readonly rightsVerified: number;
    readonly rightsUnknown: number;
    readonly copiedUnits: number;
    readonly originalUnits: number;
    readonly refusedDirectives: number;
    readonly evaluations: number;
  };
}

export interface PreviewUnit {
  readonly unitId: string;
  readonly kind: string;
  readonly targetReferenceId?: string;
  readonly lifecycle: "draft" | "active" | "deprecated" | "not-a-reference" | "unknown";
  readonly delivered: boolean;
  readonly reason: string;
  readonly boundWorkflowIds: string[];
  readonly contextPackIds: string[];
  readonly bytes?: number;
  readonly coverage: "complete" | "truncated" | "excluded" | "not-applicable";
}

export interface PreviewData {
  readonly target: string;
  readonly manifestId: string;
  readonly units: PreviewUnit[];
  /** Units that never reach a worker brief and why (draft, reference-only, rejected, deferred). */
  readonly excluded: Array<{ readonly unitId: string; readonly reason: string }>;
  readonly incompleteCoverage: string[];
  /** The preview never changes the catalog or a workspace. */
  readonly changesCatalog: false;
}

export interface EvaluateCaseResult {
  readonly id: string;
  readonly kind: string;
  readonly status: "passed" | "failed" | "skipped" | "requires-review" | "refused";
  readonly detail: string;
  readonly observations: Array<{ readonly dimension: string; readonly value: string; readonly note?: string }>;
}

export interface EvaluateData {
  readonly target: string;
  readonly manifestId: string;
  readonly cases: EvaluateCaseResult[];
  /** True only when every executable case passed and no case failed; requires-review cases never count as passes. */
  readonly pass: boolean;
}

export type Unknown = "unknown";

export interface UpstreamInventoryRow {
  readonly id: string;
  readonly project: string;
  readonly canonicalUrl: string;
  readonly authors: string[];
  readonly maintainers: string[];
  readonly license: { readonly spdx: string; readonly status: string; readonly noticeRetained: boolean };
  readonly relationships: string[];
  readonly consumption: string[];
  readonly localOwners: string[];
  readonly tests: string[];
  readonly reviewedSource: string | Unknown;
  readonly reviewedGuidance: string | Unknown;
  readonly supportedVersions: Array<{ readonly range: string; readonly status: string }>;
  readonly supportedOperations: string[];
  readonly unsupportedOperations: string[];
  readonly latestStable: { readonly tag: string; readonly publishedAt: string; readonly checkedAt: string } | Unknown;
  readonly branchHead: { readonly sha: string; readonly committedAt: string } | Unknown;
  readonly installed:
    { readonly path: string; readonly version: string | null; readonly sha256: string | null; readonly shadowed: string[] } | "not-observed" | Unknown;
  readonly snapshot: { readonly status: string; readonly lastVerifiedAt: string | null } | "unsnapped";
  readonly registrySourceIds: string[];
  readonly citingReferenceIds: string[];
  readonly providerContractIds: string[];
  readonly lockfile: { readonly name: string; readonly resolved: string; readonly authority: string } | null;
  readonly capabilityDelta: { readonly classification: string; readonly migration: string } | null;
  readonly review: { readonly status: string; readonly lastReview: string; readonly cadenceDays: number; readonly due: boolean };
  readonly credits: { readonly acknowledge: boolean; readonly use: string };
  readonly unknowns: string[];
}

export interface UpstreamInventoryData {
  readonly generatedAt: string;
  readonly upstreams: UpstreamInventoryRow[];
  readonly coverage: { readonly manifests: number; readonly lockfileDependencies: number; readonly note: string };
  readonly issues: Array<{ readonly code: string; readonly message: string; readonly path?: string }>;
}

export type ChangeClassification =
  "relevant-to-supported" | "new-capability" | "security-or-rights-review" | "behavior-change-review" | "irrelevant" | "unknown-impact";

export interface UpstreamChangeItem {
  readonly tag: string;
  readonly publishedAt: string;
  readonly line: string;
  readonly classification: ChangeClassification;
  readonly confidence: "heuristic";
  readonly matchedOperations: string[];
  readonly maintainerDecision: "pending";
}

export interface UpstreamCheckData {
  readonly upstreamId: string;
  readonly observation: UpstreamObservation;
  readonly baseline: { readonly reviewedSource: string | Unknown; readonly reviewedGuidance: string | Unknown };
  readonly supportedVersions: Array<{ readonly range: string; readonly status: string }>;
  readonly drift: {
    readonly installedVersusSupported: "supported" | "untested" | "unsupported" | "not-observed" | Unknown;
    readonly installedVersusLatest: "current" | "behind" | "ahead" | "not-observed" | Unknown;
    readonly shadowedExecutables: string[];
    readonly licenseChanged: boolean | null;
    readonly branchAheadOfRelease: boolean | null;
  };
  readonly changes: UpstreamChangeItem[];
  readonly affectedLocalOwners: string[];
  readonly recommendation: "no-action" | "prepare-upgrade-plan" | "risk-review" | Unknown;
  readonly written: string | null;
  readonly networkUsed: boolean;
  readonly unknowns: string[];
}

export interface UpgradePlanData {
  readonly upstreamId: string;
  readonly candidate: {
    readonly revision: string;
    readonly publishedAt: string | null;
    readonly digests: Array<{ readonly name: string; readonly sha256: string }>;
  } | null;
  readonly baseline: { readonly reviewedSource: string | Unknown; readonly reviewedGuidance: string | Unknown };
  readonly changeSummary: UpstreamChangeItem[];
  readonly retainedAdaptations: Array<{ readonly id: string; readonly description: string; readonly owner: string }>;
  readonly expectedLocalDiff: Array<{ readonly path: string; readonly change: string }>;
  readonly affectedOperations: string[];
  readonly newFeaturesNotSupported: string[];
  readonly requiredVerification: string[];
  readonly adoptionNotes: string[];
  /** A dependency bump activates no new effects; the support contract stays as authored until reviewed. */
  readonly effectsUnchanged: true;
  /** Optional additive native-contract delta. Absent never means reviewed-and-unchanged. */
  readonly providerCapabilityDelta: ProviderCapabilityDelta;
  readonly contributionManifest: ContributionManifest;
  readonly written: string | null;
  readonly unknowns: string[];
}
