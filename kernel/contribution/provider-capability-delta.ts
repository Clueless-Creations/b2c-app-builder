/**
 * Provider Capability Delta for `b2c contribute upgrade-plan` (#111).
 *
 * Distinct from `catalog/providers/capability-delta.yaml`, which classifies
 * source-page hash drift. This object is optional additive output. It never
 * mutates pins, installs tools, or probes a provider.
 */
import { latestEntryForSource } from "../../adapters/providers/capability-delta.js";
import { loadCapabilityDelta } from "../../adapters/providers/load.js";
import {
  SOURCE_PAGE_DELTA_OWNER,
  providerCapabilityDeltaSchema,
  type ProviderCapabilityDelta,
  type ProviderDeltaReviewStatus,
  type UpstreamManifest,
} from "../../contracts/contribution/contract.js";

const PROVIDER_RELATIONSHIP_KINDS = new Set(["external-executable", "remote-service"]);

export function unknownReview(items: readonly string[] = []): {
  status: "unknown";
  items: string[];
} {
  return { status: "unknown", items: [...items] };
}

export function isProviderUpgradeSubject(manifest: UpstreamManifest): boolean {
  return manifest.relationships.some((relationship) => PROVIDER_RELATIONSHIP_KINDS.has(relationship.kind));
}

export function inferProviderTransport(manifest: UpstreamManifest): ProviderCapabilityDelta["transport"] {
  const kinds = new Set(manifest.relationships.map((relationship) => relationship.kind));
  if (kinds.has("external-executable") && !kinds.has("remote-service")) return "cli";
  if (kinds.has("remote-service") && !kinds.has("external-executable")) return "service";
  if (kinds.has("external-executable") || kinds.has("remote-service")) return "unknown";
  return "unknown";
}

function unknownNativeChanges(): NonNullable<ProviderCapabilityDelta["nativeChanges"]> {
  return {
    added: unknownReview(),
    removed: unknownReview(),
    inputs: unknownReview(),
    outputs: unknownReview(),
    errors: unknownReview(),
    pagination: unknownReview(),
    authentication: unknownReview(),
    effects: unknownReview(),
    idempotencyOrRecovery: unknownReview(),
    costOrQuota: unknownReview(),
    experimentalOrDeprecated: unknownReview(),
  };
}

function unknownMappingImpact(): NonNullable<ProviderCapabilityDelta["mappingImpact"]> {
  return {
    adapterEncoder: "unknown",
    adapterTransport: "unknown",
    adapterDecoder: "unknown",
    reconciler: "unknown",
    supportDeclaration: "unknown",
    canonicalContractChange: "unknown",
    workflowOrKernelChange: "unknown",
  };
}

export function justifyKernelChange(status: ProviderDeltaReviewStatus, justification?: string): string | undefined {
  switch (status) {
    case "unchanged":
    case "unknown":
      return undefined;
    case "changed":
      return justification;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export interface UpgradePlanDeltaInput {
  readonly skillRoot: string;
  readonly manifest: UpstreamManifest;
  readonly candidateRevision: string | null;
  readonly reviewedSource: string;
  readonly reviewedGuidance: string;
  readonly supportedRange: string;
}

export function buildUpgradePlanProviderDelta(input: UpgradePlanDeltaInput): ProviderCapabilityDelta {
  const { manifest } = input;
  if (!isProviderUpgradeSubject(manifest)) {
    return providerCapabilityDeltaSchema.parse({
      applicable: false,
      reason: "No external-executable or remote-service relationship. This is not a provider upgrade.",
      provider: manifest.id,
      versionFacts: {
        latestObservation: input.candidateRevision ?? "unknown",
        reviewedBaseline: input.reviewedSource,
        supportedRange: input.supportedRange,
        workspacePin: "unchanged",
        observedExecutable: "not-observed-by-this-plan",
      },
      notes: ["Non-provider upgrade plans keep historical inputs and omit native-contract dimensions."],
    });
  }

  const capability = loadCapabilityDelta(input.skillRoot);
  let classification: string | null = null;
  let migration: string | null = null;
  if (capability.delta) {
    for (const sourceId of manifest.sourceIds) {
      const latest = latestEntryForSource(capability.delta, sourceId);
      if (latest) {
        classification = latest.classification;
        migration = latest.migration;
      }
    }
  }

  return providerCapabilityDeltaSchema.parse({
    applicable: true,
    provider: manifest.id,
    transport: inferProviderTransport(manifest),
    fromReviewed: input.reviewedSource,
    toCandidate: input.candidateRevision ?? "unknown",
    nativeChanges: unknownNativeChanges(),
    mappingImpact: unknownMappingImpact(),
    versionFacts: {
      latestObservation: input.candidateRevision ?? "unknown",
      reviewedBaseline: `${input.reviewedSource}; guidance ${input.reviewedGuidance}`,
      supportedRange: input.supportedRange,
      workspacePin: "unchanged",
      observedExecutable: "not-observed-by-this-plan",
    },
    sourcePageDelta: {
      owner: SOURCE_PAGE_DELTA_OWNER,
      classification,
      migration,
      note: "Source-page hash classification is not a native command-contract change.",
    },
    notes: [
      "Uninspected native dimensions stay unknown. A default false does not mean reviewed-and-unchanged.",
      "This plan does not repin a workspace or invalidate unrelated accepted evidence.",
    ],
  });
}

export interface NativeContractDeltaDraft {
  readonly provider: string;
  readonly transport: Exclude<ProviderCapabilityDelta["transport"], undefined>;
  readonly fromReviewed: string;
  readonly toCandidate: string;
  readonly nativeChanges: NonNullable<ProviderCapabilityDelta["nativeChanges"]>;
  readonly mappingImpact: NonNullable<ProviderCapabilityDelta["mappingImpact"]>;
  readonly notes: readonly string[];
}

export function reviewedNativeContractDelta(draft: NativeContractDeltaDraft): ProviderCapabilityDelta {
  const kernelStatus = draft.mappingImpact.workflowOrKernelChange;
  const canonicalStatus = draft.mappingImpact.canonicalContractChange;
  if (kernelStatus === "changed" && !draft.mappingImpact.workflowOrKernelJustification) {
    throw new Error("workflow_or_kernel_change needs a new business semantic or a shared security/recovery defect.");
  }
  if (canonicalStatus === "changed" && !draft.mappingImpact.canonicalContractJustification) {
    throw new Error("canonical_contract_change needs the new business semantic.");
  }
  return providerCapabilityDeltaSchema.parse({
    applicable: true,
    provider: draft.provider,
    transport: draft.transport,
    fromReviewed: draft.fromReviewed,
    toCandidate: draft.toCandidate,
    nativeChanges: draft.nativeChanges,
    mappingImpact: draft.mappingImpact,
    notes: [...draft.notes],
  });
}
