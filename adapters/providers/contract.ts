import { APP_REVIEW_CAPABILITY_IDS } from "../app-review/types.js";

export const PROVIDER_CONTRACT_SCHEMA_VERSION = 1 as const;

export const PROVIDER_CONTRACT_KINDS = ["billing", "agent_runtime", "store_cli"] as const;
export type ProviderContractKind = (typeof PROVIDER_CONTRACT_KINDS)[number];

export const REQUIRED_PROVIDER_CONTRACT_IDS = ["revenuecat", "agent-runtime-claude", "apple-asc"] as const;

export interface ProviderFeature {
  readonly id: string;
  readonly required: boolean;
  readonly notes: string;
}

export interface ProviderDeprecation {
  readonly id: string;
  readonly since: string;
  readonly replacement?: string;
  readonly blocking: boolean;
}

export interface ProviderFeed {
  readonly url: string;
  readonly kind: string;
}

export interface ProviderContract {
  readonly schemaVersion: typeof PROVIDER_CONTRACT_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly kind: ProviderContractKind;
  readonly title: string;
  readonly sourceIds: readonly string[];
  readonly features: readonly ProviderFeature[];
  readonly sdkFloor?: string;
  readonly deprecations: readonly ProviderDeprecation[];
  readonly machineReadableFeeds: readonly ProviderFeed[];
  readonly reviewCadenceDays: number;
  readonly capabilityReceipt?: "app_review_asc";
}

export interface CatalogProviderContract {
  readonly id: string;
  readonly version: string;
  readonly kind: ProviderContractKind;
  readonly title: string;
  readonly sourceIds: readonly string[];
}

export function isProviderContractKind(value: string): value is ProviderContractKind {
  return (PROVIDER_CONTRACT_KINDS as readonly string[]).includes(value);
}

export function summarizeProviderContract(contract: ProviderContract): CatalogProviderContract {
  return {
    id: contract.id,
    version: contract.version,
    kind: contract.kind,
    title: contract.title,
    sourceIds: [...contract.sourceIds],
  };
}

export function assertAppleAscReusesAppReviewCapabilities(contract: ProviderContract): string | undefined {
  if (contract.id !== "apple-asc") return undefined;
  if (contract.capabilityReceipt !== "app_review_asc") {
    return "apple-asc must set capability_receipt to app_review_asc so it reuses the Slice 0 ASC capability receipt.";
  }
  const present = new Set(contract.features.map((feature) => feature.id));
  const missing = APP_REVIEW_CAPABILITY_IDS.filter((id) => !present.has(id));
  if (missing.length > 0) {
    return `apple-asc features must include every App Review capability id. Missing: ${missing.join(", ")}.`;
  }
  return undefined;
}

export function requiredKindPresent(contracts: readonly ProviderContract[], kind: ProviderContractKind): boolean {
  switch (kind) {
    case "billing":
    case "agent_runtime":
    case "store_cli":
      return contracts.some((contract) => contract.kind === kind);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled provider contract kind ${String(exhaustive)}`);
    }
  }
}
