/**
 * #104 RevenueCat CLI durable effect progress and readback-only resume.
 * Fake processes only. Fresh-process recovery loads a new ledger from disk.
 * No live `rc`, host install, or mutating RevenueCat account.
 */
import { RevenueCatCliLedger, revenueCatCliLedgerPath } from "../../../adapters/providers/revenuecat/cli-ledger.js";
import { discoverRevenueCatCli } from "../../../adapters/providers/revenuecat/cli-discovery.js";
import { REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import { isolatedConfigHome } from "../../../adapters/providers/revenuecat/cli-preflight.js";
import { runRevenueCatCli } from "../../../adapters/providers/revenuecat/cli-execute.js";
import {
  runRevenueCatCatalogSession,
  type CatalogSessionRequest,
} from "../../../adapters/providers/revenuecat/cli-catalog.js";
import type { CliProcessRequest, CliProcessResult, CliProcessRunner } from "../../../adapters/providers/revenuecat/cli-process.js";
import { assert, type Harness } from "./_harness.js";

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
      if (request.argv.includes("offerings") && request.argv.includes("create")) return ok(envelope({ id: "off_default" }));
      if (request.argv.includes("list") || request.argv.includes("packages")) {
        lists += 1;
        if (lists <= 4) return ok(envelope({ items: [], next_page: null }));
        if (lists <= 8) return { stdout: "", stderr: "list-fail", status: 1, timedOut: false, truncated: false, cancelled: false, signal: null };
        return ok(
          envelope({
            items: request.argv.includes("products")
              ? [{ id: "prod_monthly" }]
              : request.argv.includes("entitlements")
                ? [{ id: "ent_premium" }]
                : request.argv.includes("packages")
                  ? [{ id: "pkg_monthly" }]
                  : [{ id: "off_default" }],
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
}
