/**
 * #104 RevenueCat CLI durable effect progress and readback-only resume.
 * Fake processes only. Fresh-process recovery loads a new ledger from disk.
 * No live `rc`, host install, or mutating RevenueCat account.
 */
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  RevenueCatCliLedger,
  releaseRevenueCatCliClaim,
  revenueCatCliClaimFdOwnsPath,
  revenueCatCliClaimPath,
  revenueCatCliLedgerPath,
  tryAcquireRevenueCatCliClaim,
} from "../../../adapters/providers/revenuecat/cli-ledger.js";
import { discoverRevenueCatCli } from "../../../adapters/providers/revenuecat/cli-discovery.js";
import { REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import { isolatedConfigHome } from "../../../adapters/providers/revenuecat/cli-preflight.js";
import { runRevenueCatCli } from "../../../adapters/providers/revenuecat/cli-execute.js";
import {
  runRevenueCatCatalogSession,
  type CatalogSessionRequest,
} from "../../../adapters/providers/revenuecat/cli-catalog.js";
import type { CliProcessRequest, CliProcessResult, CliProcessRunner } from "../../../adapters/providers/revenuecat/cli-process.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const COMMANDS_JSON = JSON.stringify({
  schema_version: "1",
  data: {
    commands: [{ name: "offerings" }, { name: "customers" }, { name: "apps" }, { name: "projects" }, { name: "entitlements" }, { name: "products" }],
  },
});

function ok(stdout: string, status = 0): CliProcessResult {
  return { stdout, stderr: "", status, timedOut: false, truncated: false, cancelled: false, signal: null };
}

function envelope(data: unknown): string {
  return JSON.stringify({ data, schema_version: "1" });
}

function isAppsShow(argv: readonly string[]): boolean {
  return argv.includes("apps") && argv.includes("show");
}

function testStoreAppEnvelope(id = "app_test"): string {
  return envelope({ id, object: "app", type: "test_store" });
}

function recordingRunner(handler: (request: CliProcessRequest) => CliProcessResult): { run: CliProcessRunner; calls: CliProcessRequest[] } {
  const calls: CliProcessRequest[] = [];
  return {
    calls,
    run: (request) => {
      calls.push(request);
      return handler(request);
    },
  };
}

function discoverTrusted(harness: Harness, name: string, run: CliProcessRunner, executable = "/opt/fake/bin/rc") {
  const isolatedHome = isolatedConfigHome(harness.makeTempDir(name), "ws-a");
  return discoverRevenueCatCli({
    isolatedHome,
    cwd: isolatedHome,
    pathEnv: "/opt/fake/bin",
    probeExecutables: (command) => (command === "rc" ? [{ path: executable, pathOrder: 0 }] : []),
    run,
  });
}

function trustedDiscovery(harness: Harness, name: string) {
  return discoverTrusted(
    harness,
    name,
    recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({}));
    }).run,
  );
}

function selectedTarget(overrides: Partial<CatalogSessionRequest["target"]> = {}) {
  return {
    providerSelected: true,
    approvedProjectId: "proj_approved",
    approvedAppId: "app_test",
    appStoreKind: "test-store" as const,
    hostAuthorityGranted: true,
    hasCredential: true,
    ...overrides,
  };
}

function countArgv(calls: readonly CliProcessRequest[], match: (argv: readonly string[]) => boolean): number {
  return calls.filter((call) => match(call.argv)).length;
}

function simulatePurchaseCount(calls: readonly CliProcessRequest[]): number {
  return countArgv(calls, (argv) => argv.includes("simulate-purchase"));
}

function customerShowCount(calls: readonly CliProcessRequest[]): number {
  return countArgv(calls, (argv) => argv.includes("customers") && argv.includes("show"));
}

function offeringsCreateCount(calls: readonly CliProcessRequest[]): number {
  return countArgv(calls, (argv) => argv.includes("offerings") && argv.includes("create"));
}

function productsCreateCount(calls: readonly CliProcessRequest[]): number {
  return countArgv(calls, (argv) => argv.includes("products") && argv.includes("create"));
}

function entitlementsCreateCount(calls: readonly CliProcessRequest[]): number {
  return countArgv(calls, (argv) => argv.includes("entitlements") && argv.includes("create"));
}

function packagesCreateCount(calls: readonly CliProcessRequest[]): number {
  return countArgv(calls, (argv) => argv.includes("packages") && argv.includes("create"));
}

const WAVE_DESIRED = {
  projectId: "proj_approved",
  appId: "app_test",
  offering: { lookupKey: "default", displayName: "Default" },
  products: [{ storeIdentifier: "monthly", type: "subscription" as const, appId: "app_test", displayName: "Monthly" }],
  entitlements: [{ lookupKey: "premium", displayName: "Premium", productStoreIdentifiers: ["monthly"] }],
  packages: [] as const,
};

function isCatalogListArgv(argv: readonly string[]): boolean {
  if (argv.includes("create") || argv.includes("attach") || argv.includes("verify") || argv.includes("show") || argv.includes("simulate-purchase")) {
    return false;
  }
  return argv.includes("list") || argv.includes("packages");
}

function durableSession(
  harness: Harness,
  name: string,
  run: CliProcessRunner,
  ledger: RevenueCatCliLedger,
  overrides: Partial<CatalogSessionRequest> = {},
): CatalogSessionRequest {
  const home = isolatedConfigHome(harness.makeTempDir(name), "ws-a");
  const discovery = discoverTrusted(harness, `${name}-disc`, run);
  return {
    intent: "test-store-purchase",
    executable: "/opt/fake/bin/rc",
    cwd: home,
    isolatedHome: home,
    pathEnv: "/opt/fake/bin",
    apiKey: "rc-fixture-key",
    run,
    discovery,
    target: selectedTarget(),
    expected: {
      projectId: "proj_approved",
      appId: "app_test",
      offeringId: "off_default",
      productIds: ["prod_monthly"],
      entitlementIds: ["ent_premium"],
      packageIds: ["pkg_monthly"],
    },
    hostAuthorityGranted: true,
    synthetic: true,
    appUserId: "user_synth",
    productId: "prod_monthly",
    customerId: "user_synth",
    idempotencyKey: "rc-op-k",
    ledger,
    ...overrides,
  };
}

export function register(harness: Harness): void {
  harness.check("revenuecat-cli-durability: successful purchase then failed customer read resumes read only", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    let reads = 0;
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        reads += 1;
        if (reads === 1) return { stdout: "", stderr: "retryable", status: 1, timedOut: false, truncated: false, cancelled: false, signal: null };
        return ok(envelope({ id: "user_synth", active_entitlements: [{ id: "ent_premium" }] }));
      }
      return ok(envelope({}));
    });
    const first = runRevenueCatCatalogSession(durableSession(harness, "rc-read-resume", run, ledger));
    assert(first.disposition === "incomplete", `first disposition ${first.disposition}`);
    assert(first.evidence.test_store?.executed === true, "applied purchase must remain executed");
    assert(first.replaySafe === false, "must not mark the session replay-safe after a write");
    assert(first.nextAction === "observe", `nextAction ${first.nextAction}`);
    assert(first.effectProgress === "applied-unverified", `progress ${first.effectProgress}`);
    assert(simulatePurchaseCount(calls) === 1, `purchase count after first ${simulatePurchaseCount(calls)}`);
    const second = runRevenueCatCatalogSession(durableSession(harness, "rc-read-resume-2", run, ledger));
    assert(second.disposition === "complete", `second disposition ${second.disposition}`);
    assert(second.evidence.test_store?.executed === true, "resume must keep executed");
    assert(second.evidence.test_store?.entitlement_ids.includes("ent_premium") === true, "readback must land");
    assert(simulatePurchaseCount(calls) === 1, `purchase must not repeat, got ${simulatePurchaseCount(calls)}`);
    assert(customerShowCount(calls) === 2, `expected two customer reads, got ${customerShowCount(calls)}`);
    assert(
      second.invoked.some((step) => step.operation.id === "rc.customers.simulate-purchase" && step.resumed === true && step.invoked === false),
      "purchase step must resume without spawn",
    );
  });

  harness.check("revenuecat-cli-durability: catalog create then failed list preserves object identity without a second create", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    let lists = 0;
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("offerings") && request.argv.includes("create")) return ok(envelope({ id: "off_default", lookup_key: "default", object: "offering" }));
      if (isCatalogListArgv(request.argv)) {
        lists += 1;
        if (lists <= 4) return ok(envelope({ object: "list", items: [], next_page: null }));
        if (lists <= 8) return { stdout: "", stderr: "list-fail", status: 1, timedOut: false, truncated: false, cancelled: false, signal: null };
        return ok(
          envelope({
            object: "list",
            items: request.argv.includes("offerings")
              ? [{ id: "off_default", lookup_key: "default", object: "offering" }]
              : [],
            next_page: null,
          }),
        );
      }
      return ok(envelope({}));
    });
    const request = durableSession(harness, "rc-create-resume", run, ledger, {
      intent: "reconcile-catalog",
      createIfMissing: true,
      idempotencyKey: "rc-create-k",
      offeringCreate: { lookupKey: "default", displayName: "Default" },
      desired: {
        projectId: "proj_approved",
        appId: "app_test",
        offering: { lookupKey: "default", displayName: "Default" },
        products: [],
        entitlements: [],
        packages: [],
      },
    });
    const first = runRevenueCatCatalogSession(request);
    assert(first.evidence.created === true, "create must be recorded");
    assert(first.evidence.catalog.offering_ids.includes("off_default"), "created offering id must survive failed readback");
    assert(first.replaySafe === false, "must not replay the create");
    assert(offeringsCreateCount(calls) === 1, `creates after first ${offeringsCreateCount(calls)}`);
    const second = runRevenueCatCatalogSession(request);
    assert(offeringsCreateCount(calls) === 1, `create must not duplicate, got ${offeringsCreateCount(calls)}`);
    assert(second.evidence.created === true, "resume must keep created");
    assert(second.evidence.catalog.offering_ids.includes("off_default"), "created offering id must survive the failed list");
    assert(second.replaySafe === false, "must not replay create");
    assert(second.nextAction === "observe", `second nextAction ${second.nextAction}`);
  });

  harness.check("revenuecat-cli-durability: pre-spawn validation is no-effect; post-dispatch unknown stays uncertain", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ id: "off_default" }));
    });
    const home = isolatedConfigHome(harness.makeTempDir("rc-pre-spawn"), "ws-a");
    const discovery = discoverTrusted(harness, "rc-pre-spawn-disc", run);
    const pre = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-pre",
      ledger,
    });
    assert(pre.invoked === false, "missing lookup-key must not spawn");
    assert(pre.effectProgress === "no-effect", `progress ${pre.effectProgress}`);
    assert(pre.replaySafe === true, "pre-spawn refusal is replay-safe");
    assert(offeringsCreateCount(calls) === 0, "no create spawn");

    const { run: postRun, calls: postCalls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return { stdout: "not-json", stderr: "", status: 0, timedOut: false, truncated: false, cancelled: false, signal: null };
    });
    const postDiscovery = discoverTrusted(harness, "rc-post-disc", postRun);
    const post = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run: postRun,
      discovery: postDiscovery,
      target: selectedTarget(),
      idempotencyKey: "rc-post",
      ledger: new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" }),
    });
    assert(post.invoked === true, "post-dispatch did spawn");
    assert(post.uncertainMutation === true, "undecodable mutation success is uncertain");
    assert(post.replaySafe === false, "must not treat unknown effect as no effect");
    assert(post.failureKind === "invalid-output", `failureKind ${post.failureKind}`);
    assert(offeringsCreateCount(postCalls) === 1, "one uncertain create");
  });

  harness.check("revenuecat-cli-durability: cancellation, timeout, truncated, and invalid output are distinct", () => {
    const cases: { name: string; result: CliProcessResult; kind: string }[] = [
      {
        name: "timeout",
        result: { stdout: "", stderr: "", status: null, timedOut: true, truncated: false, cancelled: false, signal: "SIGTERM" },
        kind: "timeout",
      },
      {
        name: "cancelled",
        result: { stdout: "", stderr: "", status: null, timedOut: false, truncated: false, cancelled: true, signal: null },
        kind: "cancelled",
      },
      {
        name: "truncated",
        result: { stdout: "{", stderr: "", status: 0, timedOut: false, truncated: true, cancelled: false, signal: null },
        kind: "truncated",
      },
      {
        name: "invalid-output",
        result: { stdout: "nope", stderr: "", status: 0, timedOut: false, truncated: false, cancelled: false, signal: null },
        kind: "invalid-output",
      },
    ];
    for (const item of cases) {
      const { run } = recordingRunner((request) => {
        if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
        if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
        return item.result;
      });
      const home = isolatedConfigHome(harness.makeTempDir(`rc-fail-${item.name}`), "ws-a");
      const discovery = discoverTrusted(harness, `rc-fail-${item.name}-disc`, run);
      const result = runRevenueCatCli({
        operationId: "rc.customers.simulate-purchase",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        appUserId: "user_synth",
        hostAuthorityGranted: true,
        executable: "/opt/fake/bin/rc",
        cwd: home,
        isolatedHome: home,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        idempotencyKey: `rc-fail-${item.name}`,
        ledger: new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" }),
      });
      assert(result.invoked === true, `${item.name} spawned`);
      assert(result.uncertainMutation === true, `${item.name} is uncertain`);
      assert(result.failureKind === item.kind, `${item.name} kind ${result.failureKind}`);
      assert(result.nextAction === "hold-uncertain", `${item.name} next ${result.nextAction}`);
    }
  });

  harness.check("revenuecat-cli-durability: same key with changed product or user is request-identity-conflict", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", active_entitlements: [{ id: "ent_premium" }] }));
      }
      return ok(envelope({}));
    });
    const first = runRevenueCatCatalogSession(durableSession(harness, "rc-identity", run, ledger));
    assert(first.disposition === "complete", `first ${first.disposition}`);
    const changedProduct = runRevenueCatCatalogSession(
      durableSession(harness, "rc-identity-product", run, ledger, { productId: "prod_annual" }),
    );
    assert(changedProduct.invoked.every((step) => step.operation.id !== "rc.customers.simulate-purchase" || step.invoked === false), "changed product must not spawn purchase");
    assert(
      changedProduct.hold?.code === "request-identity-conflict" ||
        changedProduct.invoked.some((step) => step.preflight.code === "request-identity-conflict"),
      `expected identity conflict, hold ${changedProduct.hold?.code}`,
    );
    const changedUser = runRevenueCatCatalogSession(
      durableSession(harness, "rc-identity-user", run, ledger, { appUserId: "user_other", customerId: "user_other" }),
    );
    assert(
      changedUser.hold?.code === "request-identity-conflict" ||
        changedUser.invoked.some((step) => step.preflight.code === "request-identity-conflict"),
      `user change must conflict, hold ${changedUser.hold?.code}`,
    );
    assert(simulatePurchaseCount(calls) === 1, `expected one purchase, got ${simulatePurchaseCount(calls)}`);
  });

  harness.check("revenuecat-cli-durability: same key with changed lookup key is request-identity-conflict", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ id: "ofrng", lookup_key: "default", object: "offering" }));
    });
    const home = isolatedConfigHome(harness.makeTempDir("rc-lookup-identity"), "ws-a");
    const discovery = discoverTrusted(harness, "rc-lookup-identity-disc", run);
    const first = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-lookup-k",
      ledger,
    });
    assert(first.invoked === true, "first lookup-key create must spawn");
    const second = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "other",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-lookup-k",
      ledger,
    });
    assert(second.invoked === false, "changed lookup key must not spawn");
    assert(second.preflight.code === "request-identity-conflict", second.preflight.code);
    assert(offeringsCreateCount(calls) === 1, `expected one create, got ${offeringsCreateCount(calls)}`);
  });

  harness.check("revenuecat-cli-durability: offerings create identity is lookup-key not createTitle", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ id: "ofrng", lookup_key: "default", object: "offering" }));
    });
    const home = isolatedConfigHome(harness.makeTempDir("rc-title-identity"), "ws-a");
    const discovery = discoverTrusted(harness, "rc-title-identity-disc", run);
    const first = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-title-k",
      ledger,
    });
    assert(first.invoked === true, "first lookup-key create must spawn");
    const second = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      createTitle: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-title-k",
      ledger,
    });
    assert(second.invoked === false, "unused createTitle must not start a second offerings create");
    assert(second.resumed === true, "same lookup-key/display-name must resume");
    assert(second.preflight.code !== "request-identity-conflict", second.preflight.code);
    assert(offeringsCreateCount(calls) === 1, `expected one create, got ${offeringsCreateCount(calls)}`);
  });

  harness.check("revenuecat-cli-durability: crash after bind before spawn recovers without a second write", () => {
    const cwd = isolatedConfigHome(harness.makeTempDir("rc-crash-bind"), "ws-a");
    const file = revenueCatCliLedgerPath(cwd);
    const firstLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
    });
    const discovery = discoverTrusted(harness, "rc-crash-bind-disc", run);
    let persistCount = 0;
    let crashed = false;
    try {
      runRevenueCatCli({
        operationId: "rc.customers.simulate-purchase",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        appUserId: "user_synth",
        hostAuthorityGranted: true,
        executable: "/opt/fake/bin/rc",
        cwd,
        isolatedHome: cwd,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        idempotencyKey: "crash-bind",
        ledger: firstLedger,
        persistLedger: () => {
          persistCount += 1;
          firstLedger.save(file);
          if (persistCount === 1) throw new Error("crash-after-bind-before-spawn");
        },
      });
    } catch (error) {
      crashed = error instanceof Error && error.message === "crash-after-bind-before-spawn";
    }
    assert(crashed, "first process must die at the bind persistence boundary");
    assert(simulatePurchaseCount(calls) === 0, `bind crash must happen before spawn, got ${simulatePurchaseCount(calls)}`);
    const recovered = RevenueCatCliLedger.load(file, { now: () => "2026-09-09T00:00:01.000Z" });
    assert(recovered.get("crash-bind")?.state === "uncertain", recovered.get("crash-bind")?.state ?? "");
    const { run: resumeRun, calls: resumeCalls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ app_user_id: "user_dup", product_id: "prod_monthly" }));
    });
    const resumeDiscovery = discoverTrusted(harness, "rc-crash-bind-resume-disc", resumeRun);
    const resume = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd,
      isolatedHome: cwd,
      pathEnv: "/opt/fake/bin",
      run: resumeRun,
      discovery: resumeDiscovery,
      target: selectedTarget(),
      idempotencyKey: "crash-bind",
      ledger: recovered,
    });
    assert(resume.invoked === false, "fresh process must not treat missing observation as no effect");
    assert(resume.preflight.code === "mutation-uncertain", resume.preflight.code);
    assert(simulatePurchaseCount(resumeCalls) === 0, `expected zero resume writes, got ${simulatePurchaseCount(resumeCalls)}`);
  });

  harness.check("revenuecat-cli-durability: crash after remote accept before observation persist holds in a new process", () => {
    const cwd = isolatedConfigHome(harness.makeTempDir("rc-crash-accept"), "ws-a");
    const file = revenueCatCliLedgerPath(cwd);
    const firstLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
    });
    const discovery = discoverTrusted(harness, "rc-crash-accept-disc", run);
    let persistCount = 0;
    let crashed = false;
    try {
      runRevenueCatCli({
        operationId: "rc.customers.simulate-purchase",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        appUserId: "user_synth",
        hostAuthorityGranted: true,
        executable: "/opt/fake/bin/rc",
        cwd,
        isolatedHome: cwd,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        idempotencyKey: "crash-accept",
        ledger: firstLedger,
        persistLedger: () => {
          persistCount += 1;
          if (persistCount === 2) throw new Error("crash-before-observation-persist");
          firstLedger.save(file);
        },
      });
    } catch (error) {
      crashed = error instanceof Error && error.message === "crash-before-observation-persist";
    }
    assert(crashed, "first process must die after spawn before the observation checkpoint");
    assert(simulatePurchaseCount(calls) === 1, `remote accept happened once, got ${simulatePurchaseCount(calls)}`);
    const recovered = RevenueCatCliLedger.load(file, { now: () => "2026-09-09T00:00:01.000Z" });
    assert(recovered.get("crash-accept")?.remoteId === undefined, "observation was not durable");
    const { run: resumeRun, calls: resumeCalls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ app_user_id: "user_dup", product_id: "prod_monthly" }));
    });
    const resumeDiscovery = discoverTrusted(harness, "rc-crash-accept-resume-disc", resumeRun);
    const resume = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd,
      isolatedHome: cwd,
      pathEnv: "/opt/fake/bin",
      run: resumeRun,
      discovery: resumeDiscovery,
      target: selectedTarget(),
      idempotencyKey: "crash-accept",
      ledger: recovered,
    });
    assert(resume.invoked === false, "unknown remote acceptance is not no effect");
    assert(resume.preflight.code === "mutation-uncertain", resume.preflight.code);
    assert(simulatePurchaseCount(resumeCalls) === 0, `expected zero resume writes, got ${simulatePurchaseCount(resumeCalls)}`);
  });

  harness.check("revenuecat-cli-durability: concurrent re-entry during spawn does not start a second write", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const cwd = isolatedConfigHome(harness.makeTempDir("rc-concurrent"), "ws-a");
    const { run: discRun } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({}));
    });
    const discovery = discoverTrusted(harness, "rc-concurrent-disc", discRun);
    let nestedInvoked: boolean | undefined;
    let nestedCode: string | undefined;
    const { run, calls } = recordingRunner((request) => {
      const nested = runRevenueCatCli({
        operationId: "rc.customers.simulate-purchase",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        appUserId: "user_synth",
        hostAuthorityGranted: true,
        executable: "/opt/fake/bin/rc",
        cwd,
        isolatedHome: cwd,
        pathEnv: "/opt/fake/bin",
        run: () => ok(envelope({ app_user_id: "user_nested", product_id: "prod_monthly" })),
        discovery,
        target: selectedTarget(),
        idempotencyKey: "rc-concurrent",
        ledger,
      });
      nestedInvoked = nested.invoked;
      nestedCode = nested.preflight.code;
      return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
    });
    const first = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd,
      isolatedHome: cwd,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-concurrent",
      ledger,
    });
    assert(first.invoked, "outer dispatch may spawn");
    assert(nestedInvoked === false, "inner concurrent entry must not spawn");
    assert(nestedCode === "mutation-uncertain", nestedCode ?? "");
    assert(simulatePurchaseCount(calls) === 1, `expected one write, got ${simulatePurchaseCount(calls)}`);
  });

  harness.check("revenuecat-cli-durability: second ledger instance hydrates applied intent from disk", () => {
    const cwd = isolatedConfigHome(harness.makeTempDir("rc-hydrate"), "ws-a");
    const file = revenueCatCliLedgerPath(cwd);
    const firstLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
    });
    const discovery = discoverTrusted(harness, "rc-hydrate-disc", run);
    const first = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd,
      isolatedHome: cwd,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-disk",
      ledger: firstLedger,
      ledgerPath: file,
    });
    assert(first.invoked === true, "first instance may spawn");
    assert(first.remoteId === "user_synth", first.remoteId ?? "");
    const secondLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:02.000Z" });
    const { run: secondRun, calls: secondCalls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ app_user_id: "user_other", product_id: "prod_monthly" }));
    });
    const secondDiscovery = discoverTrusted(harness, "rc-hydrate-2-disc", secondRun);
    const second = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd,
      isolatedHome: cwd,
      pathEnv: "/opt/fake/bin",
      run: secondRun,
      discovery: secondDiscovery,
      target: selectedTarget(),
      idempotencyKey: "rc-disk",
      ledger: secondLedger,
      ledgerPath: file,
    });
    assert(second.invoked === false, "hydrated ledger must not spawn");
    assert(second.resumed === true, "must reuse the persisted write");
    assert(second.remoteId === "user_synth", second.remoteId ?? "");
    assert(simulatePurchaseCount(calls) === 1, `first instance spawned once, got ${simulatePurchaseCount(calls)}`);
    assert(simulatePurchaseCount(secondCalls) === 0, `second instance must not spawn, got ${simulatePurchaseCount(secondCalls)}`);
  });

  harness.check("revenuecat-cli-durability: read-only observations retry without a ledger write", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ items: [{ id: "off_default" }], next_page: null }));
    });
    const home = isolatedConfigHome(harness.makeTempDir("rc-read-retry"), "ws-a");
    const discovery = discoverTrusted(harness, "rc-read-retry-disc", run);
    const first = runRevenueCatCli({
      operationId: "rc.offerings.list",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: false }),
    });
    const second = runRevenueCatCli({
      operationId: "rc.offerings.list",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: false }),
    });
    assert(first.invoked && second.invoked, "reads may retry");
    assert(first.replaySafe === true && second.replaySafe === true, "reads stay replay-safe");
    assert(countArgv(calls, (argv) => argv.includes("offerings") && argv.includes("list")) === 2, "both reads spawn");
  });

  harness.check("revenuecat-cli-durability: wrong-product and wrong-entitlement stay incomplete after a durable write", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) return ok(envelope({ app_user_id: "user_synth", product_id: "prod_other" }));
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", active_entitlements: [{ id: "ent_other" }] }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(durableSession(harness, "rc-wrong-proof", run, ledger));
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.test_store?.executed === true, "write still happened");
    assert(result.evidence.test_store?.not_native_purchase_proof === true, "CLI is not native IAP");
    assert(result.replaySafe === false, "must not repurchase to chase proof");
  });

  harness.check("revenuecat-cli-durability: unresolved uncertain path does not auto-retry the write", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return { stdout: "", stderr: "", status: null, timedOut: true, truncated: false, cancelled: false, signal: "SIGTERM" };
    });
    const home = isolatedConfigHome(harness.makeTempDir("rc-no-autoretry"), "ws-a");
    const discovery = discoverTrusted(harness, "rc-no-autoretry-disc", run);
    const first = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-no-retry",
      ledger,
    });
    assert(first.uncertainMutation === true, "timeout is uncertain");
    const second = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-no-retry",
      ledger,
    });
    assert(second.invoked === false, "must not auto-retry the write");
    assert(second.preflight.code === "mutation-uncertain", second.preflight.code);
    assert(offeringsCreateCount(calls) === 1, `expected one write, got ${offeringsCreateCount(calls)}`);
  });

  harness.check("revenuecat-cli-durability: uncertain mutation in a catalog wave does not dispatch later writes", () => {
    const ledger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("offerings") && request.argv.includes("create")) {
        return ok(envelope({ id: "ofrng", lookup_key: "default", object: "offering" }));
      }
      if (request.argv.includes("products") && request.argv.includes("create")) {
        return { stdout: "", stderr: "", status: null, timedOut: true, truncated: false, cancelled: false, signal: "SIGTERM" };
      }
      if (isCatalogListArgv(request.argv) || request.argv.includes("verify")) {
        return ok(envelope({ object: "list", items: [], next_page: null }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      durableSession(harness, "rc-wave-uncertain", run, ledger, {
        intent: "reconcile-catalog",
        createIfMissing: true,
        idempotencyKey: "rc-wave-uncertain-k",
        offeringCreate: { lookupKey: "default", displayName: "Default" },
        desired: WAVE_DESIRED,
      }),
    );
    assert(result.disposition === "uncertain", `disposition ${result.disposition}`);
    assert(result.replaySafe === false, "uncertain wave must not be replay-safe");
    assert(result.nextAction === "hold-uncertain", `nextAction ${result.nextAction}`);
    assert(offeringsCreateCount(calls) === 1, `offering writes ${offeringsCreateCount(calls)}`);
    assert(productsCreateCount(calls) === 1, `product writes ${productsCreateCount(calls)}`);
    assert(entitlementsCreateCount(calls) === 0, `entitlement must not spawn after uncertain product, got ${entitlementsCreateCount(calls)}`);
    assert(packagesCreateCount(calls) === 0, "package create must not spawn after uncertain product");
  });

  harness.check("revenuecat-cli-durability: crash mid-wave resumes remaining creates without re-dispatching the applied write", () => {
    const cwd = isolatedConfigHome(harness.makeTempDir("rc-wave-crash"), "ws-a");
    const file = revenueCatCliLedgerPath(cwd);
    const firstLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("offerings") && request.argv.includes("create")) {
        return ok(envelope({ id: "ofrng", lookup_key: "default", object: "offering" }));
      }
      if (request.argv.includes("products") && request.argv.includes("create")) {
        return ok(envelope({ id: "prod", store_identifier: "monthly", type: "subscription", app_id: "app_test", object: "product" }));
      }
      if (request.argv.includes("entitlements") && request.argv.includes("create")) {
        return ok(envelope({ id: "ent", lookup_key: "premium", object: "entitlement" }));
      }
      if (isCatalogListArgv(request.argv) || request.argv.includes("verify")) {
        return ok(envelope({ object: "list", items: [], next_page: null }));
      }
      return ok(envelope({}));
    });
    const discovery = discoverTrusted(harness, "rc-wave-crash-disc", run);
    let persistCount = 0;
    let crashed = false;
    const session = {
      intent: "reconcile-catalog" as const,
      executable: "/opt/fake/bin/rc",
      cwd,
      isolatedHome: cwd,
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget(),
      expected: {
        projectId: "proj_approved",
        appId: "app_test",
        offeringId: "off_default",
        productIds: ["prod_monthly"],
        entitlementIds: ["ent_premium"],
        packageIds: [] as readonly string[],
      },
      hostAuthorityGranted: true,
      synthetic: true,
      createIfMissing: true,
      offeringCreate: { lookupKey: "default", displayName: "Default" },
      desired: WAVE_DESIRED,
      idempotencyKey: "rc-wave-crash-k",
      ledger: firstLedger,
      ledgerPath: file,
    };
    try {
      runRevenueCatCatalogSession({
        ...session,
        persistLedger: () => {
          persistCount += 1;
          firstLedger.save(file);
          if (persistCount === 2) throw new Error("crash-after-first-wave-write");
        },
      });
    } catch (error) {
      crashed = error instanceof Error && error.message === "crash-after-first-wave-write";
    }
    assert(crashed, "first process must die after the first applied catalog write is durable");
    assert(offeringsCreateCount(calls) === 1, `offering writes before crash ${offeringsCreateCount(calls)}`);
    assert(productsCreateCount(calls) === 0, `product must not spawn before the crash, got ${productsCreateCount(calls)}`);
    const recovered = RevenueCatCliLedger.load(file);
    assert(recovered.get("rc-wave-crash-k:create:offering:default")?.state === "applied-unverified", recovered.get("rc-wave-crash-k:create:offering:default")?.state ?? "");
    const { run: resumeRun, calls: resumeCalls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok(`${REVENUECAT_CLI_RELEASE.version}\n`);
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("offerings") && request.argv.includes("create")) {
        return ok(envelope({ id: "ofrng_dup", lookup_key: "default", object: "offering" }));
      }
      if (request.argv.includes("products") && request.argv.includes("create")) {
        return ok(envelope({ id: "prod", store_identifier: "monthly", type: "subscription", app_id: "app_test", object: "product" }));
      }
      if (request.argv.includes("entitlements") && request.argv.includes("create")) {
        return ok(envelope({ id: "ent", lookup_key: "premium", object: "entitlement" }));
      }
      if (isCatalogListArgv(request.argv) || request.argv.includes("verify")) {
        return ok(envelope({ object: "list", items: [], next_page: null }));
      }
      return ok(envelope({}));
    });
    const resumeDiscovery = discoverTrusted(harness, "rc-wave-crash-resume-disc", resumeRun);
    const resume = runRevenueCatCatalogSession({
      ...session,
      run: resumeRun,
      discovery: resumeDiscovery,
      ledger: new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:02.000Z" }),
    });
    assert(offeringsCreateCount(resumeCalls) === 0, `resume must not re-create the offering, got ${offeringsCreateCount(resumeCalls)}`);
    assert(productsCreateCount(resumeCalls) === 1, `resume must continue with the missing product, got ${productsCreateCount(resumeCalls)}`);
    assert(entitlementsCreateCount(resumeCalls) === 1, `resume must continue with the missing entitlement, got ${entitlementsCreateCount(resumeCalls)}`);
    assert(
      resume.invoked.some((step) => step.operation.id === "rc.catalog.create" && step.resumed === true && step.invoked === false),
      "applied offering create must resume without spawn",
    );
    assert(resume.replaySafe === false, "mid-wave recovery is not a blank replay");
  });

  harness.check("revenuecat-cli-durability: two empty ledgers racing under one key do not both spawn", () => {
    const home = isolatedConfigHome(harness.makeTempDir("rc-two-process-race"), "ws-a");
    const discovery = trustedDiscovery(harness, "rc-two-process-race-disc");
    const file = revenueCatCliLedgerPath(home);
    const firstLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const secondLedger = new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    let nestedInvoked: boolean | undefined;
    let nestedCode: string | undefined;
    const { run, calls } = recordingRunner(() => {
      const nested = runRevenueCatCli({
        operationId: "rc.customers.simulate-purchase",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        appUserId: "user_synth",
        hostAuthorityGranted: true,
        executable: "/opt/fake/bin/rc",
        cwd: home,
        isolatedHome: home,
        pathEnv: "/opt/fake/bin",
        run: () => ok(envelope({ app_user_id: "user_nested", product_id: "prod_monthly" })),
        discovery,
        target: selectedTarget(),
        idempotencyKey: "rc-race",
        ledger: secondLedger,
        ledgerPath: file,
      });
      nestedInvoked = nested.invoked;
      nestedCode = nested.preflight.code;
      return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
    });
    const first = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-race",
      ledger: firstLedger,
      ledgerPath: file,
    });
    assert(first.invoked, "winner may spawn");
    assert(nestedInvoked === false, "loser must not spawn");
    assert(nestedCode === "mutation-uncertain", nestedCode ?? "");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
  });

  harness.check("revenuecat-cli-durability: dead-pid claim is stolen and does not permanently block dispatch", () => {
    const home = isolatedConfigHome(harness.makeTempDir("rc-stale-claim"), "ws-a");
    const discovery = trustedDiscovery(harness, "rc-stale-claim-disc");
    const file = revenueCatCliLedgerPath(home);
    const claimPath = revenueCatCliClaimPath(file, "rc-stale-claim");
    mkdirSync(path.dirname(claimPath), { recursive: true });
    writeFileSync(
      claimPath,
      `${JSON.stringify({ schemaVersion: "b2c.revenuecat-cli-claim/v1", pid: 999999999, idempotencyKey: "rc-stale-claim", at: "2026-09-09T00:00:00.000Z" })}\n`,
    );
    const { run, calls } = recordingRunner(() => ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" })));
    const result = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "prod_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: home,
      isolatedHome: home,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      idempotencyKey: "rc-stale-claim",
      ledger: new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:01.000Z" }),
      ledgerPath: file,
    });
    assert(result.invoked, "stale claim must not permanently block a first write");
    assert(calls.length === 1, `expected one spawn after stealing a dead claim, got ${calls.length}`);
  });

  harness.check("revenuecat-cli-durability: unparseable claim files are stolen and do not permanently block dispatch", () => {
    const residues: ReadonlyArray<{ readonly label: string; readonly contents: string }> = [
      { label: "empty", contents: "" },
      { label: "truncated", contents: "{" },
      { label: "wrong-schema", contents: `${JSON.stringify({ schemaVersion: "not-a-claim", pid: 1, idempotencyKey: "rc-corrupt", at: "2026-09-09T00:00:00.000Z" })}\n` },
    ];
    for (const residue of residues) {
      const home = isolatedConfigHome(harness.makeTempDir(`rc-corrupt-claim-${residue.label}`), "ws-a");
      const discovery = trustedDiscovery(harness, `rc-corrupt-claim-${residue.label}-disc`);
      const file = revenueCatCliLedgerPath(home);
      const claimPath = revenueCatCliClaimPath(file, `rc-corrupt-${residue.label}`);
      mkdirSync(path.dirname(claimPath), { recursive: true });
      writeFileSync(claimPath, residue.contents);
      const acquired = tryAcquireRevenueCatCliClaim(claimPath, `rc-corrupt-${residue.label}`, () => "2026-09-09T00:00:00.000Z");
      assert(acquired.ok, `${residue.label} claim residue must be stolen, not held`);
      releaseRevenueCatCliClaim(claimPath);
      writeFileSync(claimPath, residue.contents);
      const { run, calls } = recordingRunner(() => ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" })));
      const result = runRevenueCatCli({
        operationId: "rc.customers.simulate-purchase",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        appUserId: "user_synth",
        hostAuthorityGranted: true,
        executable: "/opt/fake/bin/rc",
        cwd: home,
        isolatedHome: home,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        idempotencyKey: `rc-corrupt-${residue.label}`,
        ledger: new RevenueCatCliLedger({ now: () => "2026-09-09T00:00:01.000Z" }),
        ledgerPath: file,
      });
      assert(result.invoked, `${residue.label} claim residue must not permanently block a first write`);
      assert(calls.length === 1, `${residue.label}: expected one spawn after stealing a corrupt claim, got ${calls.length}`);
    }
  });

  harness.check("revenuecat-cli-durability: a live foreign process cannot wx-create the same claim file", () => {
    const home = isolatedConfigHome(harness.makeTempDir("rc-foreign-claim"), "ws-a");
    const file = revenueCatCliLedgerPath(home);
    const claimPath = revenueCatCliClaimPath(file, "rc-foreign-claim");
    const acquired = tryAcquireRevenueCatCliClaim(claimPath, "rc-foreign-claim", () => "2026-09-09T00:00:00.000Z");
    assert(acquired.ok, "parent must hold the exclusive claim");
    const child = spawnSync(process.execPath, ["-e", `const fs = require("fs"); try { fs.openSync(${JSON.stringify(claimPath)}, "wx"); process.exit(2); } catch (error) { process.exit(error && error.code === "EEXIST" ? 0 : 1); }`], {
      encoding: "utf8",
    });
    assert(child.status === 0, `foreign process must see EEXIST, got status ${child.status} stderr=${child.stderr}`);
    releaseRevenueCatCliClaim(claimPath);
  });

  harness.check("revenuecat-cli-durability: unlinking an in-progress wx inode loses the writer claim", () => {
    const home = isolatedConfigHome(harness.makeTempDir("rc-inode-steal"), "ws-a");
    const claimPath = revenueCatCliClaimPath(revenueCatCliLedgerPath(home), "rc-inode-steal");
    mkdirSync(path.dirname(claimPath), { recursive: true });
    const fd = openSync(claimPath, "wx", 0o600);
    try {
      const moduleUrl = pathToFileURL(path.join(skillRoot, "adapters/providers/revenuecat/cli-ledger.ts")).href;
      const child = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `import { tryAcquireRevenueCatCliClaim } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(tryAcquireRevenueCatCliClaim(${JSON.stringify(claimPath)}, "rc-inode-steal")));`,
        ],
        { cwd: skillRoot, encoding: "utf8", timeout: 30_000 },
      );
      assert(child.status === 0, `peer steal must run, stderr=${child.stderr}`);
      const peer = JSON.parse(child.stdout) as { ok: boolean };
      assert(peer.ok, "peer must acquire after unlinking the empty wx file");
      writeSync(fd, `${JSON.stringify({ schemaVersion: "b2c.revenuecat-cli-claim/v1", pid: process.pid, idempotencyKey: "rc-inode-steal", at: "2026-09-09T00:00:00.000Z" })}\n`);
      assert(revenueCatCliClaimFdOwnsPath(fd, claimPath) === false, "writer must not keep ok after the empty inode was unlinked");
    } finally {
      closeSync(fd);
    }
    releaseRevenueCatCliClaim(claimPath);
  });

  harness.check("revenuecat-cli-durability: overlapped two-process first-creates cannot both return ok", () => {
    const home = isolatedConfigHome(harness.makeTempDir("rc-first-create-race"), "ws-a");
    const claimPath = revenueCatCliClaimPath(revenueCatCliLedgerPath(home), "rc-first-create-race");
    const barrierRoot = harness.makeTempDir("rc-first-create-race-barrier");
    mkdirSync(path.dirname(claimPath), { recursive: true });
    const moduleUrl = pathToFileURL(path.join(skillRoot, "adapters/providers/revenuecat/cli-ledger.ts")).href;
    const worker = `import { existsSync, renameSync, writeFileSync } from "node:fs";
      import { setTimeout as delay } from "node:timers/promises";
      import { tryAcquireRevenueCatCliClaim } from ${JSON.stringify(moduleUrl)};
      const started = Date.now();
      writeFileSync(process.env.READY_PATH, "1");
      while (!existsSync(process.env.GO_PATH)) {
        if (Date.now() - started > 10_000) process.exit(2);
        await delay(1);
      }
      const acquired = tryAcquireRevenueCatCliClaim(process.env.CLAIM_PATH, process.env.CLAIM_KEY);
      const resultTmp = process.env.RESULT_PATH + ".tmp";
      writeFileSync(resultTmp, JSON.stringify(acquired));
      renameSync(resultTmp, process.env.RESULT_PATH);
      while (!existsSync(process.env.DONE_PATH)) {
        if (Date.now() - started > 20_000) process.exit(0);
        await delay(5);
      }`;
    const coordinator = `import { spawn } from "node:child_process";
      import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
      import path from "node:path";
      import { setTimeout as delay } from "node:timers/promises";
      const claimPath = ${JSON.stringify(claimPath)};
      const barrierRoot = ${JSON.stringify(barrierRoot)};
      const worker = ${JSON.stringify(worker)};
      const rounds = 40;
      let bothOk = 0;
      async function waitFor(file, ms) {
        const started = Date.now();
        while (!existsSync(file)) {
          if (Date.now() - started > ms) throw new Error("timeout waiting for " + file);
          await delay(1);
        }
      }
      for (let i = 0; i < rounds; i++) {
        const round = path.join(barrierRoot, String(i));
        mkdirSync(round, { recursive: true });
        try { unlinkSync(claimPath); } catch {}
        const go = path.join(round, "go");
        const done = path.join(round, "done");
        const children = [0, 1].map((index) => {
          const ready = path.join(round, "ready-" + index);
          const result = path.join(round, "result-" + index);
          const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", worker], {
            env: {
              ...process.env,
              CLAIM_PATH: claimPath,
              CLAIM_KEY: "rc-first-create-race",
              READY_PATH: ready,
              GO_PATH: go,
              RESULT_PATH: result,
              DONE_PATH: done,
            },
          });
          return { child, ready, result };
        });
        let err = "";
        for (const entry of children) entry.child.stderr.on("data", (chunk) => { err += chunk; });
        await Promise.all(children.map((entry) => waitFor(entry.ready, 15_000)));
        writeFileSync(go, "1");
        await Promise.all(children.map((entry) => waitFor(entry.result, 15_000)));
        const results = children.map((entry) => JSON.parse(readFileSync(entry.result, "utf8")));
        if (results.filter((result) => result.ok).length > 1) bothOk += 1;
        writeFileSync(done, "1");
        for (const entry of children) entry.child.kill();
        if (err.includes("Error")) throw new Error(err);
      }
      process.stdout.write(JSON.stringify({ rounds, bothOk }));`;
    const raced = spawnSync(process.execPath, ["--input-type=module", "-e", coordinator], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 180_000,
    });
    assert(raced.status === 0, `first-create race must run, stderr=${raced.stderr} stdout=${raced.stdout} error=${String(raced.error ?? "")}`);
    const summary = JSON.parse(raced.stdout) as { rounds: number; bothOk: number };
    assert(summary.rounds === 40, `expected 40 overlapped first-creates, got ${summary.rounds}`);
    assert(summary.bothOk === 0, `two processes both got ok on first create in ${summary.bothOk}/40 rounds`);
    try {
      unlinkSync(claimPath);
    } catch {
      // last winner may have exited without release
    }
  });
}
