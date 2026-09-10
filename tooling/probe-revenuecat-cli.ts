#!/usr/bin/env node
/**
 * Founder-run live probe against the registered RevenueCat CLI path.
 * Uses discover + catalog session + ledger. Writes sanitized evidence to the
 * OS temp directory — never into the public checkout.
 *
 * SECURITY RULES (do not relax):
 *   - API keys are read ONLY from environment variables.
 *   - No key, token, live project/app/customer id, or secret name-and-value
 *     pair is written to stdout or the artifact.
 *   - Caller labels are not Test Store proof. `apps show` type is.
 *
 * Usage:
 *   doppler run -- tsx tooling/probe-revenuecat-cli.ts
 *
 * Required env:
 *   REVENUECAT_SECRET_API_KEY
 *   REVENUECAT_PROJECT_ID
 *
 * Optional:
 *   REVENUECAT_APP_ID
 *   REVENUECAT_PRODUCT_ID
 *   REVENUECAT_APP_USER_ID
 *   B2C_REVENUECAT_CLI  — absolute pinned `rc` binary
 */

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RevenueCatCliLedger } from "../adapters/providers/revenuecat/cli-ledger.js";
import { discoverRevenueCatCli } from "../adapters/providers/revenuecat/cli-discovery.js";
import { CLI_PROOF_COLLECTOR, REVENUECAT_CLI_RELEASE } from "../adapters/providers/revenuecat/cli-operations.js";
import { isolatedConfigHome } from "../adapters/providers/revenuecat/cli-preflight.js";
import { runRevenueCatCli } from "../adapters/providers/revenuecat/cli-execute.js";
import { runRevenueCatCatalogSession } from "../adapters/providers/revenuecat/cli-catalog.js";
import { classifyRevenueCatAppStoreKind, type RevenueCatObservedStoreKind } from "../adapters/providers/revenuecat/cli-decode.js";
import { defaultCliProcessRunner } from "../adapters/providers/revenuecat/cli-process.js";
import { probeExecutablesOnPath } from "../kernel/contribution/host-observe.js";

const apiKey = process.env.REVENUECAT_SECRET_API_KEY ?? "";
const projectId = process.env.REVENUECAT_PROJECT_ID ?? "";
const requestedAppId = process.env.REVENUECAT_APP_ID ?? "";
const requestedProductId = process.env.REVENUECAT_PRODUCT_ID ?? "";
const appUserId = process.env.REVENUECAT_APP_USER_ID || "b2c-cli-probe-user";
const pinnedCli = process.env.B2C_REVENUECAT_CLI ?? "";

if (!apiKey || !projectId) {
  console.error(
    [
      "",
      "  probe-revenuecat-cli: REVENUECAT_SECRET_API_KEY or REVENUECAT_PROJECT_ID is not set.",
      "",
      "  Inject credentials with Doppler. Do not export the key in a shell profile.",
      "  Map operator secret names in the Doppler invocation, not in this file.",
      "",
      "  Example:",
      "    doppler run -- tsx tooling/probe-revenuecat-cli.ts",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function listItems(data: unknown): readonly Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const record = data as { items?: unknown };
  if (!Array.isArray(record.items)) return [];
  return record.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function resolvePinnedPath(): string | undefined {
  if (!pinnedCli.trim()) return undefined;
  if (!path.isAbsolute(pinnedCli)) {
    console.error("  B2C_REVENUECAT_CLI must be an absolute path.");
    process.exit(1);
  }
  return pinnedCli;
}

function run(): void {
  const workspace = mkdtempSync(path.join(tmpdir(), "b2c-rc-cli-probe-"));
  const isolatedHome = isolatedConfigHome(workspace, "probe");
  mkdirSync(isolatedHome, { recursive: true });
  const pinned = resolvePinnedPath();
  const pathEnv = pinned ? `${path.dirname(pinned)}${path.delimiter}${process.env.PATH ?? ""}` : (process.env.PATH ?? "");
  const discovery = discoverRevenueCatCli({
    isolatedHome,
    cwd: workspace,
    pathEnv,
    probeExecutables: pinned
      ? (command) => (command === "rc" || command === "revenuecat" ? [{ path: pinned, pathOrder: 0 }] : [])
      : (command) => probeExecutablesOnPath(command, { PATH: pathEnv }),
    run: defaultCliProcessRunner,
  });
  if (discovery.code !== "trusted" || !discovery.selected) {
    console.error(`  probe-revenuecat-cli: CLI discovery ${discovery.code}. ${discovery.message}`);
    console.error(`  Reviewed release is ${REVENUECAT_CLI_RELEASE.version} (${REVENUECAT_CLI_RELEASE.commit}).`);
    process.exit(1);
  }

  const executable = discovery.selected.path;
  const ledger = new RevenueCatCliLedger();
  const targetBase = {
    providerSelected: true as const,
    approvedProjectId: projectId,
    hostAuthorityGranted: true,
    hasCredential: true,
  };

  const list = runRevenueCatCli({
    operationId: "rc.apps.list",
    projectId,
    hostAuthorityGranted: false,
    executable,
    cwd: workspace,
    isolatedHome,
    pathEnv,
    apiKey,
    run: defaultCliProcessRunner,
    discovery,
    target: { ...targetBase, appStoreKind: "unresolved" },
  });
  if (!list.invoked || !list.json?.ok) {
    console.error("  probe-revenuecat-cli: apps list did not return a readable document. No mutation.");
    process.exit(1);
  }

  const apps = listItems(list.json.data).map((item) => {
    const id = typeof item.id === "string" ? item.id : "";
    return {
      fingerprint: id ? fingerprint(id) : "missing",
      storeKind: classifyRevenueCatAppStoreKind(item),
      id,
    };
  });
  const testStoreApps = apps.filter((app) => app.storeKind === "test-store" && app.id);
  const kinds = [...new Set(apps.map((app) => app.storeKind))];
  let selectedAppId = requestedAppId;
  if (!selectedAppId && testStoreApps.length === 1) selectedAppId = testStoreApps[0]!.id;
  if (!selectedAppId) {
    writeSanitized({
      workspace,
      discovery,
      inspectDisposition: "incomplete",
      observedKinds: kinds,
      appCount: apps.length,
      testStoreCount: testStoreApps.length,
      purchaseDisposition: "skipped",
      purchaseHold: requestedAppId ? undefined : "no-app-id",
    });
    console.log("  Inspected apps without printing ids. No unique Test Store selected. No simulate-purchase.");
    process.exit(0);
  }

  const inspect = runRevenueCatCatalogSession({
    intent: "inspect-project-app",
    executable,
    cwd: workspace,
    isolatedHome,
    pathEnv,
    apiKey,
    run: defaultCliProcessRunner,
    discovery,
    target: { ...targetBase, approvedAppId: selectedAppId, appStoreKind: "unresolved" },
    expected: { projectId, appId: selectedAppId },
    hostAuthorityGranted: true,
    synthetic: false,
  });
  const observedKind: RevenueCatObservedStoreKind = inspect.evidence.observed_store_kind ?? "unresolved";
  if (observedKind !== "test-store") {
    writeSanitized({
      workspace,
      discovery,
      inspectDisposition: inspect.disposition,
      observedKinds: [observedKind],
      appCount: apps.length,
      testStoreCount: testStoreApps.length,
      purchaseDisposition: "refused",
      purchaseHold: "production-test-store-refused",
    });
    console.log(`  CLI-read store kind is ${observedKind}. simulate-purchase not run. Not native IAP.`);
    process.exit(0);
  }

  let selectedProductId = requestedProductId;
  let productCount = 0;
  if (!selectedProductId) {
    const products = runRevenueCatCli({
      operationId: "rc.products.list",
      projectId,
      hostAuthorityGranted: false,
      executable,
      cwd: workspace,
      isolatedHome,
      pathEnv,
      apiKey,
      run: defaultCliProcessRunner,
      discovery,
      target: { ...targetBase, approvedAppId: selectedAppId, appStoreKind: "test-store" },
    });
    if (!products.invoked || !products.json?.ok) {
      writeSanitized({
        workspace,
        discovery,
        inspectDisposition: inspect.disposition,
        observedKinds: [observedKind],
        appCount: apps.length,
        testStoreCount: testStoreApps.length,
        purchaseDisposition: "skipped",
        purchaseHold: "products-list-unread",
      });
      console.log("  Test Store observed. products list did not return a readable document. No simulate-purchase.");
      process.exit(0);
    }
    const productItems = listItems(products.json.data);
    productCount = productItems.length;
    const firstId = productItems.find((item) => typeof item.id === "string")?.id;
    if (typeof firstId === "string") selectedProductId = firstId;
  }
  if (!selectedProductId) {
    writeSanitized({
      workspace,
      discovery,
      inspectDisposition: inspect.disposition,
      observedKinds: [observedKind],
      appCount: apps.length,
      testStoreCount: testStoreApps.length,
      productCount,
      purchaseDisposition: "skipped",
      purchaseHold: "missing-product",
    });
    console.log("  Test Store observed. No product id on the CLI list. simulate-purchase not run.");
    process.exit(0);
  }

  const purchase = runRevenueCatCatalogSession({
    intent: "test-store-purchase",
    executable,
    cwd: workspace,
    isolatedHome,
    pathEnv,
    apiKey,
    run: defaultCliProcessRunner,
    discovery,
    target: { ...targetBase, approvedAppId: selectedAppId, appStoreKind: "test-store" },
    expected: {
      projectId,
      appId: selectedAppId,
      productIds: [selectedProductId],
      entitlementIds: [],
    },
    hostAuthorityGranted: true,
    synthetic: false,
    appUserId,
    productId: selectedProductId,
    customerId: appUserId,
    idempotencyKey: `rc-cli-probe:${fingerprint(projectId)}:${fingerprint(selectedAppId)}:${fingerprint(selectedProductId)}`,
    ledger,
  });

  writeSanitized({
    workspace,
    discovery,
    inspectDisposition: inspect.disposition,
    observedKinds: [observedKind],
    appCount: apps.length,
    testStoreCount: testStoreApps.length,
    productCount,
    productFingerprint: fingerprint(selectedProductId),
    purchaseDisposition: purchase.disposition,
    purchaseHold: purchase.hold?.code,
    executed: purchase.evidence.test_store?.executed === true,
    entitlementCount: purchase.evidence.test_store?.entitlement_ids.length ?? 0,
  });
  console.log(
    `  Test Store catalog session disposition=${purchase.disposition} executed=${purchase.evidence.test_store?.executed === true}. Not native IAP.`,
  );
  if (purchase.disposition !== "complete" && purchase.disposition !== "incomplete") process.exit(1);
}

function writeSanitized(input: {
  readonly workspace: string;
  readonly discovery: ReturnType<typeof discoverRevenueCatCli>;
  readonly inspectDisposition: string;
  readonly observedKinds: readonly RevenueCatObservedStoreKind[];
  readonly appCount: number;
  readonly testStoreCount: number;
  readonly productCount?: number;
  readonly productFingerprint?: string;
  readonly purchaseDisposition: string;
  readonly purchaseHold?: string;
  readonly executed?: boolean;
  readonly entitlementCount?: number;
}): void {
  const artifact = {
    probe: CLI_PROOF_COLLECTOR,
    kind: "revenuecat-cli-live-probe",
    synthetic: false,
    live: true,
    not_native_purchase_proof: true,
    not_in_app_ui_proof: true,
    not_app_store_or_play_proof: true,
    cli_version: input.discovery.selected?.version ?? null,
    reviewed_release: REVENUECAT_CLI_RELEASE.version,
    project_id_fingerprint: fingerprint(projectId),
    app_id_provided: Boolean(requestedAppId),
    product_id_provided: Boolean(requestedProductId),
    product_count: input.productCount ?? null,
    product_id_fingerprint: input.productFingerprint ?? null,
    inspect_disposition: input.inspectDisposition,
    observed_store_kinds: input.observedKinds,
    app_count: input.appCount,
    test_store_count: input.testStoreCount,
    purchase_disposition: input.purchaseDisposition,
    purchase_hold: input.purchaseHold ?? null,
    test_store_executed: input.executed === true,
    entitlement_count: input.entitlementCount ?? 0,
  };
  const artifactPath = path.join(input.workspace, "revenuecat-cli-probe.json");
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`  Sanitized probe artifact: ${artifactPath}`);
  console.log(
    `  CLI ${artifact.cli_version} collector ${CLI_PROOF_COLLECTOR} store_kinds=${input.observedKinds.join(",")} inspect=${input.inspectDisposition} purchase=${input.purchaseDisposition}`,
  );
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  probe-revenuecat-cli: unexpected error: ${message}\n`);
  process.exit(1);
}
