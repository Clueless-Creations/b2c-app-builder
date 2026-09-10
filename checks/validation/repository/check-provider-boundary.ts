/**
 * ARCH-03/ARCH-04 provider-native import guard (#110).
 *
 * Protects kernel, contracts, and catalog workflows from provider-native DTOs and
 * vendor SDK packages. Composition-root wiring and selected generated-app SDK imports
 * are allowed. Shared catalog modules under adapters/providers/*.ts are not vendor DTOs.
 */
import { issue, type Issue } from "../../../tooling/lib/launch-state.js";

export interface ProviderBoundaryEdge {
  readonly from: string;
  readonly line: number;
  readonly specifier: string;
  readonly resolved: string;
}

export const PROVIDER_BOUNDARY_RULE = "architecture.provider_native_core_import";
export const PROVIDER_BOUNDARY_RECORDED_DEBT_ABSENT = "architecture.provider_native_recorded_debt_absent";

export interface RecordedProviderBoundaryEdge {
  readonly from: string;
  readonly line: number;
  readonly specifier: string;
  readonly owner: string;
  readonly reason: string;
}

/** Exact classified debt. Not a directory allowlist. Currently empty. */
export const RECORDED_PROVIDER_BOUNDARY_EDGES: readonly RecordedProviderBoundaryEdge[] = [];

const COMPOSITION_ROOTS = new Set([
  "kernel/session/run.ts",
  "kernel/session/firstparty-worker-host.ts",
  "kernel/session/doctor.ts",
  "kernel/session/app-review-ingress.ts",
]);

const GENERATED_APP_PREFIXES = [
  "surfaces/starters/",
  "surfaces/workspace-template/",
  "examples/extensions/",
  "examples/tuck/",
  "examples/contributions/",
] as const;

const VENDOR_PACKAGE_PREFIXES = [
  "@revenuecat/",
  "react-native-purchases",
  "posthog-js",
  "posthog-node",
  "@posthog/",
  "expo-superwall",
  "@superwall/",
] as const;

export type ProviderBoundaryClassification =
  | { readonly kind: "allowed"; readonly reason: string }
  | { readonly kind: "forbidden"; readonly reason: string }
  | { readonly kind: "not-applicable"; readonly reason: string };

function isProtectedImporter(from: string): boolean {
  if (from.startsWith("contracts/")) return true;
  if (from.startsWith("kernel/schema/")) return true;
  if (from === "kernel/schema.ts") return true;
  if (from.startsWith("catalog/workflows/")) return true;
  if (from.startsWith("kernel/") && !COMPOSITION_ROOTS.has(from)) return true;
  return false;
}

function isGeneratedApp(from: string): boolean {
  return GENERATED_APP_PREFIXES.some((prefix) => from.startsWith(prefix));
}

export function isSharedProviderCatalogModule(resolved: string): boolean {
  return /^adapters\/providers\/[^/]+\.(?:ts|js|mts|cts|mjs|cjs)$/u.test(resolved);
}

export function isVendorNativeAdapterPath(resolved: string): boolean {
  if (isSharedProviderCatalogModule(resolved)) return false;
  if (resolved.startsWith("adapters/providers/")) {
    return resolved.slice("adapters/providers/".length).includes("/");
  }
  if (resolved.startsWith("adapters/app-review/")) return true;
  if (resolved.startsWith("adapters/mobile-operation")) return true;
  return false;
}

export function isVendorSdkSpecifier(specifier: string): boolean {
  return VENDOR_PACKAGE_PREFIXES.some((prefix) => specifier === prefix || specifier.startsWith(prefix));
}

function resolvedLooksRelative(resolved: string): boolean {
  return resolved.startsWith("adapters/") || resolved.startsWith("kernel/") || resolved.startsWith("catalog/") || resolved.startsWith("contracts/");
}

export function classifyProviderBoundaryImport(from: string, resolvedOrSpecifier: string): ProviderBoundaryClassification {
  if (isGeneratedApp(from)) {
    return { kind: "allowed", reason: "Selected generated-app SDK integration may depend on the selected provider." };
  }
  if (COMPOSITION_ROOTS.has(from)) {
    return { kind: "allowed", reason: "Composition-root wiring may depend on the selected provider." };
  }
  if (!isProtectedImporter(from)) {
    return { kind: "not-applicable", reason: "Importer is outside the protected kernel/contract/workflow surfaces." };
  }
  if (isSharedProviderCatalogModule(resolvedOrSpecifier)) {
    return { kind: "allowed", reason: "Shared catalog provider-contract modules are not vendor DTOs." };
  }
  if (isVendorNativeAdapterPath(resolvedOrSpecifier)) {
    return { kind: "forbidden", reason: "Protected surfaces must not import provider-native adapter modules." };
  }
  if (!resolvedLooksRelative(resolvedOrSpecifier) && isVendorSdkSpecifier(resolvedOrSpecifier)) {
    return { kind: "forbidden", reason: "Protected surfaces must not import vendor SDK packages." };
  }
  return { kind: "not-applicable", reason: "Target is not a provider-native module or vendor SDK." };
}

function recordedKey(edge: Pick<RecordedProviderBoundaryEdge, "from" | "line">): string {
  return `${edge.from}:${edge.line}`;
}

export function collectProviderBoundaryIssues(
  edges: readonly ProviderBoundaryEdge[],
  options: { readonly acceptRecordedDebt?: boolean; readonly allowEdges?: ReadonlySet<string> } = {},
): Issue[] {
  const issues: Issue[] = [];
  const seenRecorded = new Set<string>();
  const allowEdges = options.allowEdges ?? new Set<string>();

  for (const edge of edges) {
    const classification = classifyProviderBoundaryImport(edge.from, edge.resolved);
    if (classification.kind !== "forbidden") continue;
    const location = recordedKey(edge);
    const recorded = RECORDED_PROVIDER_BOUNDARY_EDGES.find(
      (item) => item.from === edge.from && item.line === edge.line && item.specifier === edge.specifier,
    );
    if (recorded) seenRecorded.add(recordedKey(recorded));
    if (allowEdges.has(location) || (options.acceptRecordedDebt && recorded)) continue;
    issues.push(
      issue(
        "error",
        PROVIDER_BOUNDARY_RULE,
        `${classification.reason} (${edge.specifier} → ${edge.resolved}).`,
        location,
        {
          line: edge.line,
          fixHint: "Keep provider-native types in the adapter. Composition-root and selected generated-app SDK imports stay allowed.",
        },
      ),
    );
  }

  if (options.acceptRecordedDebt) {
    for (const recorded of RECORDED_PROVIDER_BOUNDARY_EDGES) {
      const key = recordedKey(recorded);
      if (seenRecorded.has(key)) continue;
      issues.push(
        issue(
          "error",
          PROVIDER_BOUNDARY_RECORDED_DEBT_ABSENT,
          `Recorded provider-boundary debt ${key} (${recorded.specifier}) is absent. Owner ${recorded.owner}: ${recorded.reason}`,
          key,
          { line: recorded.line },
        ),
      );
    }
  }

  return issues;
}
