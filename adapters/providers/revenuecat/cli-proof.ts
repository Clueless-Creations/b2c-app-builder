import { CLI_PROOF_COLLECTOR, REST_PROBE_COLLECTOR } from "./cli-operations.js";

export { CLI_PROOF_COLLECTOR, REST_PROBE_COLLECTOR };

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
