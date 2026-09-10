/**
 * Synthetic Provider Capability Delta examples (#111).
 *
 * These are reviewed before/after native-contract samples. They are not live
 * upgrades and do not mutate `catalog/providers/capability-delta.yaml`.
 */
import { SOURCE_PAGE_DELTA_OWNER } from "../../../contracts/contribution/contract.js";
import {
  reviewedNativeContractDelta,
  unknownReview,
  type NativeContractDeltaDraft,
} from "../../../kernel/contribution/provider-capability-delta.js";
import type { ProviderCapabilityDelta } from "../../../contracts/contribution/contract.js";

function unchangedReview(): { status: "unchanged"; items: string[] } {
  return { status: "unchanged", items: [] };
}

function unchangedMapping(
  overrides: Partial<NonNullable<ProviderCapabilityDelta["mappingImpact"]>> = {},
): NonNullable<ProviderCapabilityDelta["mappingImpact"]> {
  return {
    adapterEncoder: "unchanged",
    adapterTransport: "unchanged",
    adapterDecoder: "unchanged",
    reconciler: "unchanged",
    supportDeclaration: "unchanged",
    canonicalContractChange: "unchanged",
    workflowOrKernelChange: "unchanged",
    ...overrides,
  };
}

function baseNative(
  overrides: Partial<NonNullable<ProviderCapabilityDelta["nativeChanges"]>> = {},
): NonNullable<ProviderCapabilityDelta["nativeChanges"]> {
  return {
    added: unchangedReview(),
    removed: unchangedReview(),
    inputs: unchangedReview(),
    outputs: unchangedReview(),
    errors: unchangedReview(),
    pagination: unchangedReview(),
    authentication: unchangedReview(),
    effects: unchangedReview(),
    idempotencyOrRecovery: unknownReview(),
    costOrQuota: unknownReview(),
    experimentalOrDeprecated: unchangedReview(),
    ...overrides,
  };
}

const revenuecatSyntaxOnlyDraft: NativeContractDeltaDraft = {
  provider: "revenuecat-cli",
  transport: "cli",
  fromReviewed: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  toCandidate: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  nativeChanges: baseNative({
    inputs: {
      status: "changed",
      items: ["offerings create keeps --lookup-key and --display-name; a positional lookup key is not the pinned cobra schema"],
      evidence: "RevenueCat/cli internal/cli/offerings.go newOfferingsCreateCmd at v0.1.1",
    },
  }),
  mappingImpact: unchangedMapping({ adapterEncoder: "changed", supportDeclaration: "unchanged" }),
  notes: ["Syntax-only native input change targets the encoder and support records, not workflows."],
};

const easResponseShapeDraft: NativeContractDeltaDraft = {
  provider: "eas-cli",
  transport: "cli",
  fromReviewed: "23.2.0",
  toCandidate: "23.2.0",
  nativeChanges: baseNative({
    outputs: {
      status: "changed",
      items: ["eas build --json prints a BuildFragment array; eas build:view --json prints one object"],
      evidence: "packages/eas-cli/src/build/runBuildAndSubmit.ts and commands/build/view.ts in EAS CLI 23.2.0",
    },
  }),
  mappingImpact: unchangedMapping({ adapterDecoder: "changed" }),
  notes: ["Response-shape change targets the decoder. Opaque eas:build:<id> references stay."],
};

const addedNativeFeatureDraft: NativeContractDeltaDraft = {
  provider: "revenuecat-cli",
  transport: "cli",
  fromReviewed: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  toCandidate: "unreviewed-candidate",
  nativeChanges: baseNative({
    added: {
      status: "changed",
      items: ["A new native experiments list command does not become a canonical experiment operation"],
    },
  }),
  mappingImpact: unchangedMapping({ supportDeclaration: "changed" }),
  notes: ["Map the native feature to a namespaced extension or defer it. Matching names do not prove RevenueCat experiments equal PostHog experiments."],
};

const removedNativeFeatureDraft: NativeContractDeltaDraft = {
  provider: "eas-cli",
  transport: "cli",
  fromReviewed: "23.2.0",
  toCandidate: "unreviewed-candidate",
  nativeChanges: baseNative({
    removed: {
      status: "changed",
      items: ["A retired native build-status alias is not a removed canonical build operation"],
    },
  }),
  mappingImpact: unchangedMapping({ supportDeclaration: "changed" }),
  notes: ["Removing a native alias updates support records. Canonical build identity stays."],
};

export const REVENUECAT_SYNTAX_ONLY_DELTA = reviewedNativeContractDelta(revenuecatSyntaxOnlyDraft);
export const EAS_RESPONSE_SHAPE_DELTA = reviewedNativeContractDelta(easResponseShapeDraft);
export const ADDED_NATIVE_FEATURE_DELTA = reviewedNativeContractDelta(addedNativeFeatureDraft);
export const REMOVED_NATIVE_FEATURE_DELTA = reviewedNativeContractDelta(removedNativeFeatureDraft);

export const UNINSPECTED_AUTH_DELTA: ProviderCapabilityDelta = {
  applicable: true,
  provider: "eas-cli",
  transport: "cli",
  fromReviewed: "23.2.0",
  toCandidate: "unreviewed-candidate",
  nativeChanges: {
    added: unknownReview(),
    removed: unknownReview(),
    inputs: unknownReview(),
    outputs: unknownReview(),
    errors: unknownReview(),
    pagination: unknownReview(),
    authentication: unknownReview(["candidate auth or permission change was not inspected"]),
    effects: unknownReview(),
    idempotencyOrRecovery: unknownReview(),
    costOrQuota: unknownReview(),
    experimentalOrDeprecated: unknownReview(),
  },
  mappingImpact: {
    adapterEncoder: "unknown",
    adapterTransport: "unknown",
    adapterDecoder: "unknown",
    reconciler: "unknown",
    supportDeclaration: "unknown",
    canonicalContractChange: "unknown",
    workflowOrKernelChange: "unknown",
  },
  notes: ["Uninspected authentication is unknown, not a clean upgrade."],
};

export const SOURCE_PAGE_CHROME_DELTA: ProviderCapabilityDelta = {
  applicable: true,
  provider: "revenuecat",
  transport: "api",
  fromReviewed: "docs-api-v1",
  toCandidate: "docs-api-v1-chrome",
  nativeChanges: baseNative(),
  mappingImpact: unchangedMapping(),
  sourcePageDelta: {
    owner: SOURCE_PAGE_DELTA_OWNER,
    classification: "ignore",
    migration: "none",
    note: "Source-page hash classification is not a native command-contract change.",
  },
  notes: ["Chrome-only source-page drift stays on the existing hash ledger."],
};

export const INSUFFICIENT_EVIDENCE_DELTA: ProviderCapabilityDelta = {
  applicable: true,
  provider: "revenuecat-cli",
  transport: "cli",
  fromReviewed: "unknown",
  toCandidate: "unknown",
  nativeChanges: {
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
  },
  mappingImpact: {
    adapterEncoder: "unknown",
    adapterTransport: "unknown",
    adapterDecoder: "unknown",
    reconciler: "unknown",
    supportDeclaration: "unknown",
    canonicalContractChange: "unknown",
    workflowOrKernelChange: "unknown",
  },
  notes: ["The candidate source did not include a command schema or response envelope. Coverage stays unknown."],
};

export const KERNEL_SECURITY_REPAIR_DELTA = reviewedNativeContractDelta({
  provider: "revenuecat-cli",
  transport: "cli",
  fromReviewed: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  toCandidate: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  nativeChanges: baseNative(),
  mappingImpact: unchangedMapping({
    workflowOrKernelChange: "changed",
    workflowOrKernelJustification: "Shared kernel recovery defect: failed readback after a confirmed mutation must resume verification.",
  }),
  notes: ["A shared kernel security or recovery defect may be repaired without inventing a new business semantic."],
});
