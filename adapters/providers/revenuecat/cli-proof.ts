import { CLI_PROOF_COLLECTOR, REST_PROBE_COLLECTOR } from "./cli-operations.js";
import type { RevenueCatCliCatalogEvidence } from "./cli-catalog.js";

export { CLI_PROOF_COLLECTOR, REST_PROBE_COLLECTOR };

export const CLI_CATALOG_KIND = "revenuecat-cli-catalog";

export type RevenueCatProofCollector = typeof CLI_PROOF_COLLECTOR | typeof REST_PROBE_COLLECTOR;

export interface RevenueCatProofIdentity {
  readonly collector: RevenueCatProofCollector | "unknown";
  readonly synthetic: boolean;
  readonly live: boolean;
  readonly storeKind: "test-store" | "app-store" | "play-store" | "web-billing" | "unresolved" | "none";
}

export type RevenueCatProofIdentityRefusal =
  | "cli-stamped-as-rest"
  | "rest-stamped-as-cli"
  | "synthetic-labeled-live"
  | "unknown-collector";

export function classifyRevenueCatProofDocument(value: unknown): {
  readonly identity: RevenueCatProofIdentity;
  readonly refusal?: RevenueCatProofIdentityRefusal;
  readonly message?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { identity: { collector: "unknown", synthetic: false, live: false, storeKind: "none" }, refusal: "unknown-collector", message: "Proof document is not an object." };
  }
  const record = value as Record<string, unknown>;
  const probe = typeof record.probe === "string" ? record.probe : "";
  const collectorField = typeof record.collector === "string" ? record.collector : "";
  const synthetic = record.synthetic === true || record.kind === "synthetic";
  const live = record.live === true || record.kind === "live";
  const storeKind = parseStoreKind(record);

  if (synthetic && live) {
    return {
      identity: { collector: collectorFrom(probe, collectorField), synthetic: true, live: true, storeKind },
      refusal: "synthetic-labeled-live",
      message: "Synthetic RevenueCat proof cannot be relabeled live.",
    };
  }
  if (probe === CLI_PROOF_COLLECTOR || collectorField === CLI_PROOF_COLLECTOR) {
    if (probe === REST_PROBE_COLLECTOR || probe.startsWith("revenuecat@")) {
      return {
        identity: { collector: CLI_PROOF_COLLECTOR, synthetic, live, storeKind },
        refusal: "cli-stamped-as-rest",
        message: `CLI output cannot carry the REST probe marker ${REST_PROBE_COLLECTOR}. Use ${CLI_PROOF_COLLECTOR}.`,
      };
    }
    if (typeof record.api_host === "string" && record.http_statuses && !record.cli_executable) {
      return {
        identity: { collector: CLI_PROOF_COLLECTOR, synthetic, live, storeKind },
        refusal: "cli-stamped-as-rest",
        message: "A REST probe shape cannot be stamped with the CLI collector.",
      };
    }
    return { identity: { collector: CLI_PROOF_COLLECTOR, synthetic, live, storeKind } };
  }
  if (probe === REST_PROBE_COLLECTOR || probe.startsWith("revenuecat@")) {
    if (typeof record.cli_executable === "string" || collectorField === CLI_PROOF_COLLECTOR) {
      return {
        identity: { collector: REST_PROBE_COLLECTOR, synthetic, live, storeKind },
        refusal: "rest-stamped-as-cli",
        message: `REST probe ${REST_PROBE_COLLECTOR} cannot impersonate ${CLI_PROOF_COLLECTOR}.`,
      };
    }
    return { identity: { collector: REST_PROBE_COLLECTOR, synthetic, live, storeKind } };
  }
  return {
    identity: { collector: "unknown", synthetic, live, storeKind },
    refusal: "unknown-collector",
    message: `Proof collector is unknown. REST probe uses ${REST_PROBE_COLLECTOR}; CLI uses ${CLI_PROOF_COLLECTOR}.`,
  };
}

function collectorFrom(probe: string, collectorField: string): RevenueCatProofCollector | "unknown" {
  if (probe === CLI_PROOF_COLLECTOR || collectorField === CLI_PROOF_COLLECTOR) return CLI_PROOF_COLLECTOR;
  if (probe === REST_PROBE_COLLECTOR || probe.startsWith("revenuecat@")) return REST_PROBE_COLLECTOR;
  return "unknown";
}

export type RevenueCatCliCatalogRefusal =
  | "cli-stamped-as-rest"
  | "synthetic-labeled-live"
  | "claims-native-purchase"
  | "claims-published-paywall-from-fallback"
  | "unknown-collector"
  | "wrong-shape";

export function classifyRevenueCatCliCatalogEvidence(value: unknown): {
  readonly ok: boolean;
  readonly refusal?: RevenueCatCliCatalogRefusal;
  readonly message?: string;
  readonly evidence?: RevenueCatCliCatalogEvidence;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, refusal: "wrong-shape", message: "CLI catalog evidence must be an object." };
  }
  const record = value as Record<string, unknown>;
  const identity = classifyRevenueCatProofDocument(record);
  if (identity.refusal === "synthetic-labeled-live") {
    return { ok: false, refusal: "synthetic-labeled-live", message: identity.message };
  }
  if (identity.refusal === "cli-stamped-as-rest" || identity.refusal === "rest-stamped-as-cli") {
    return { ok: false, refusal: "cli-stamped-as-rest", message: identity.message };
  }
  if (record.kind !== CLI_CATALOG_KIND || record.collector !== CLI_PROOF_COLLECTOR) {
    return {
      ok: false,
      refusal: "unknown-collector",
      message: `CLI catalog evidence must use kind ${CLI_CATALOG_KIND} and collector ${CLI_PROOF_COLLECTOR}.`,
    };
  }
  if (record.probe === REST_PROBE_COLLECTOR || (typeof record.probe === "string" && record.probe.startsWith("revenuecat@"))) {
    return {
      ok: false,
      refusal: "cli-stamped-as-rest",
      message: "CLI catalog evidence cannot carry the REST probe marker.",
    };
  }
  const testStore = record.test_store && typeof record.test_store === "object" ? (record.test_store as Record<string, unknown>) : undefined;
  if (record.not_native_purchase_proof !== true || (testStore?.executed === true && testStore.not_native_purchase_proof !== true)) {
    return {
      ok: false,
      refusal: "claims-native-purchase",
      message: "CLI catalog evidence must declare it is not native Apple/Play or in-app purchase proof.",
    };
  }
  if (record.live === true) {
    return { ok: false, refusal: "synthetic-labeled-live", message: "Fixture CLI catalog evidence cannot be labeled live." };
  }
  const preview = record.preview && typeof record.preview === "object" ? (record.preview as Record<string, unknown>) : undefined;
  if (preview && preview.fallback_only === true && preview.published_paywall === true) {
    return {
      ok: false,
      refusal: "claims-published-paywall-from-fallback",
      message: "Null or missing paywall_components is fallback, not published paywall proof.",
    };
  }
  return { ok: true, evidence: record as unknown as RevenueCatCliCatalogEvidence };
}

function parseStoreKind(record: Record<string, unknown>): RevenueCatProofIdentity["storeKind"] {
  const value = typeof record.store_kind === "string" ? record.store_kind : typeof record.app_type === "string" ? record.app_type : "";
  switch (value) {
    case "test-store":
    case "app-store":
    case "play-store":
    case "web-billing":
    case "unresolved":
    case "none":
      return value;
    default:
      return "none";
  }
}
