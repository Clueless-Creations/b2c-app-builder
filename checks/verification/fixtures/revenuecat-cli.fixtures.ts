import { assert, skillRoot, type Harness } from "./_harness.js";
import {
  CliProcessRefusal,
  assertTrustedCliProcessRequest,
  buildCliProcessEnv,
  redactCliArgv,
  type CliProcessRequest,
  type CliProcessResult,
  type CliProcessRunner,
} from "../../../adapters/providers/revenuecat/cli-process.js";
import { discoverRevenueCatCli } from "../../../adapters/providers/revenuecat/cli-discovery.js";
import {
  CLI_PROOF_COLLECTOR,
  REST_PROBE_COLLECTOR,
  REVENUECAT_CLI_OPERATIONS,
  REVENUECAT_CLI_RELEASE,
  buildRevenueCatCliArgv,
  commandLooksLikePlan,
  getRevenueCatCliOperation,
  isMutationEffect,
  type CliArgvRequest,
} from "../../../adapters/providers/revenuecat/cli-operations.js";
import { assessRevenueCatCliPreflight, isolatedConfigHome } from "../../../adapters/providers/revenuecat/cli-preflight.js";
import {
  extractResourceIds,
  interpretOfferingPreview,
  offeringVerifyIsComplete,
  paginationState,
  parseRevenueCatCliJson,
  runRevenueCatCli,
} from "../../../adapters/providers/revenuecat/cli-execute.js";
import {
  assessStorePlanApplyAuthorization,
  runRevenueCatCatalogSession,
  type CatalogSessionRequest,
} from "../../../adapters/providers/revenuecat/cli-catalog.js";
import {
  argvContainsBareToken,
  INCREMENT_B_MALFORMED_OFFERINGS_CREATE_ARGV,
  PINNED_CREATE_ATTACH_SCHEMAS,
  PINNED_ENTITLEMENTS_ATTACH_ARGV,
  PINNED_ENTITLEMENTS_CREATE_ARGV,
  PINNED_OFFERINGS_CREATE_ARGV,
  PINNED_PACKAGES_ATTACH_ARGV,
  PINNED_PACKAGES_CREATE_ARGV,
  PINNED_PAYWALLS_ATTACH_ARGV,
  PINNED_PRODUCTS_CREATE_ARGV,
  qualifyRevenueCatNativeArgv,
  REVENUECAT_CLI_COMMAND_SCHEMA_PIN,
} from "../../../adapters/providers/revenuecat/cli-command-schema.js";
import { CLI_CATALOG_KIND, classifyRevenueCatCliCatalogEvidence, classifyRevenueCatProofDocument } from "../../../adapters/providers/revenuecat/cli-proof.js";
import { issuesFromRevenueCatCliCatalogArtifact } from "../../../adapters/providers/revenuecat/revenue-validation.js";
import { REVENUECAT_PROVISIONING } from "../../../adapters/providers/revenuecat/provisioning.js";
import { loadUpstreams } from "../../../kernel/contribution/upstreams-load.js";
import { UPSTREAM_SDK_PREVIEW_MINIMAL, UPSTREAM_SIMULATE_PURCHASE } from "./revenuecat-cli-decode.samples.js";
import { DESIRED_PREMIUM_MONTHLY, NATIVE_MATCHING_GRAPH } from "./revenuecat-cli-reconcile-plan.samples.js";

const COMMANDS_JSON = JSON.stringify({
  schema_version: "1",
  data: {
    commands: [
      { name: "offerings" },
      { name: "customers" },
      { name: "apps" },
      { name: "projects" },
      { name: "entitlements" },
      { name: "products" },
    ],
  },
});

function ok(stdout: string, status = 0): CliProcessResult {
  return { stdout, stderr: "", status, timedOut: false, truncated: false, cancelled: false, signal: null };
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

function trustedDiscoveryHandler(version: string = REVENUECAT_CLI_RELEASE.version): (request: CliProcessRequest) => CliProcessResult {
  return (request) => {
    if (request.argv[0] === "--version") return ok(`${version}\n`);
    if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
    return ok(JSON.stringify({ data: {}, schema_version: "1" }));
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

function selectedTarget(overrides: Partial<Parameters<typeof assessRevenueCatCliPreflight>[0]["target"]> = {}) {
  return {
    providerSelected: true,
    approvedProjectId: "proj_approved",
    approvedAppId: "app_test",
    appStoreKind: "test-store" as const,
    hostAuthorityGranted: false,
    hasCredential: true,
    ...overrides,
  };
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

function listEnvelope(items: readonly unknown[], nextPage: string | null = null): string {
  return envelope({ object: "list", items, next_page: nextPage });
}

function isCatalogMutation(argv: readonly string[]): boolean {
  return argv.includes("create") || argv.includes("attach");
}

function matchingNativeLists(request: { readonly argv: readonly string[] }): CliProcessResult | undefined {
  if (isCatalogMutation(request.argv)) return undefined;
  if (request.argv.includes("products") && request.argv.includes("list")) {
    return ok(listEnvelope([...NATIVE_MATCHING_GRAPH.products]));
  }
  if (request.argv.includes("entitlements") && request.argv.includes("list")) {
    return ok(
      listEnvelope(
        NATIVE_MATCHING_GRAPH.entitlements.map((entry) => ({
          ...entry.entitlement,
          products: entry.products,
        })),
      ),
    );
  }
  if (request.argv.includes("offerings") && request.argv.includes("list")) {
    return ok(listEnvelope([NATIVE_MATCHING_GRAPH.offering]));
  }
  if (request.argv.includes("packages")) {
    return ok(
      listEnvelope(
        NATIVE_MATCHING_GRAPH.packages.map((entry) => ({
          ...entry.package,
          offering_id: entry.offering_id,
          products: entry.products,
        })),
      ),
    );
  }
  if (request.argv.includes("verify")) {
    return ok(
      envelope({
        offering: NATIVE_MATCHING_GRAPH.offering,
        packages: NATIVE_MATCHING_GRAPH.packages,
        paywalls: [{ id: "pw", name: "Default", offering_id: "ofrng", published_at: 1, object: "paywall" }],
        entitlements: NATIVE_MATCHING_GRAPH.entitlements,
        issues: [],
      }),
    );
  }
  return undefined;
}

function catalogSession(
  harness: Harness,
  name: string,
  run: CliProcessRunner,
  overrides: Partial<CatalogSessionRequest> = {},
): CatalogSessionRequest {
  const home = isolatedConfigHome(harness.makeTempDir(name), "ws-a");
  const discovery = discoverTrusted(harness, `${name}-disc`, run);
  return {
    intent: "reconcile-catalog",
    executable: "/opt/fake/bin/rc",
    cwd: home,
    isolatedHome: home,
    pathEnv: "/opt/fake/bin",
    apiKey: "rc-fixture-key",
    run,
    discovery,
    target: selectedTarget({ hostAuthorityGranted: false }),
    expected: {
      projectId: "proj_approved",
      appId: "app_test",
      offeringId: "off_default",
      productIds: ["prod_monthly"],
      entitlementIds: ["ent_premium"],
      packageIds: ["pkg_monthly"],
    },
    hostAuthorityGranted: false,
    synthetic: true,
    offeringCreate: { lookupKey: "default", displayName: "Default" },
    desired: DESIRED_PREMIUM_MONTHLY,
    ...overrides,
  };
}

export function register(harness: Harness): void {
  harness.check("revenuecat-cli: missing executable is a distinct hold and does not spawn", () => {
    const { run, calls } = recordingRunner(() => ok(""));
    const discovery = discoverRevenueCatCli({
      isolatedHome: harness.makeTempDir("rc-missing"),
      cwd: harness.makeTempDir("rc-missing-cwd"),
      pathEnv: "",
      probeExecutables: () => [],
      run,
    });
    assert(discovery.code === "missing", `expected missing, got ${discovery.code}`);
    assert(calls.length === 0, "missing PATH must not spawn");
    assert(!discovery.message.includes("@latest"), "must not recommend unpinned latest");
  });

  harness.check("revenuecat-cli: unrelated rc binary is distinct from RevenueCat", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("rc Plan 9 shell\n");
      return ok("not json");
    });
    const discovery = discoverTrusted(harness, "rc-unrelated", run);
    assert(discovery.code === "unrelated-executable", `expected unrelated, got ${discovery.code}`);
    assert(calls.some((call) => call.argv[0] === "--version"), "version probe should run");
  });

  harness.check("revenuecat-cli: unsupported version is held and does not equal README head", () => {
    const { run } = recordingRunner(trustedDiscoveryHandler("0.2.0"));
    const discovery = discoverTrusted(harness, "rc-version", run);
    assert(discovery.code === "unsupported-version", `expected unsupported-version, got ${discovery.code}`);
    assert(discovery.message.includes(REVENUECAT_CLI_RELEASE.version), discovery.message);
    assert(discovery.message.includes("README") || discovery.message.includes("source head") || discovery.message.includes("installed release"), discovery.message);
  });

  harness.check("revenuecat-cli: invalid commands JSON is unsupported-schema, not readiness", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      return ok("{not-json");
    });
    const discovery = discoverTrusted(harness, "rc-schema", run);
    assert(discovery.code === "unsupported-schema", `expected unsupported-schema, got ${discovery.code}`);
  });

  harness.check("revenuecat-cli: trusted 0.1.1 with command tree is selected", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      return ok(COMMANDS_JSON);
    });
    const discovery = discoverTrusted(harness, "rc-trusted", run);
    assert(discovery.code === "trusted", `expected trusted, got ${discovery.code}: ${discovery.message}`);
    assert(discovery.selected?.path === "/opt/fake/bin/rc", `path ${discovery.selected?.path}`);
    assert(discovery.selected?.version === "0.1.1", `version ${discovery.selected?.version}`);
  });

  harness.check("revenuecat-cli: trusted but unselected does not block unrelated work", () => {
    const { run } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-unselected", run);
    const operation = getRevenueCatCliOperation("rc.offerings.list")!;
    const preflight = assessRevenueCatCliPreflight({
      discovery,
      operation,
      target: selectedTarget({ providerSelected: false }),
    });
    assert(preflight.status === "skip", `expected skip, got ${preflight.status}`);
    assert(preflight.blocksUnrelatedWork === false, "unselected CLI must not block unrelated work");
  });

  harness.check("revenuecat-cli: relative executable and npx launcher are refused", () => {
    const env = buildCliProcessEnv({ isolatedHome: "/tmp/rc-home", pathValue: "/usr/bin" });
    let relative = "";
    try {
      assertTrustedCliProcessRequest({ executable: "rc", argv: ["--version"], cwd: "/tmp", env, timeoutMs: 10 });
    } catch (error) {
      relative = error instanceof CliProcessRefusal ? error.code : String(error);
    }
    let launcher = "";
    try {
      assertTrustedCliProcessRequest({ executable: "/usr/local/bin/npx", argv: ["@revenuecat/cli@latest"], cwd: "/tmp", env, timeoutMs: 10 });
    } catch (error) {
      launcher = error instanceof CliProcessRefusal ? error.code : String(error);
    }
    assert(relative === "relative-executable", `relative: ${relative}`);
    assert(launcher === "denied-launcher", `launcher: ${launcher}`);
  });

  harness.check("revenuecat-cli: RC_BASE_URL, RC_HEADERS, and proxy env are refused", () => {
    let code = "";
    try {
      assertTrustedCliProcessRequest({
        executable: "/opt/fake/bin/rc",
        argv: ["offerings", "list"],
        cwd: "/tmp",
        env: { PATH: "/usr/bin", RC_BASE_URL: "https://evil.example" },
        timeoutMs: 10,
      });
    } catch (error) {
      code = error instanceof CliProcessRefusal ? error.code : String(error);
    }
    assert(code === "refused-env", `override: ${code}`);
  });

  harness.check("revenuecat-cli: argv never concatenates a shell and redacts --api-key", () => {
    const redacted = redactCliArgv(["offerings", "list", "--api-key", "secret-value-for-redaction-test"]);
    assert(redacted.includes("<redacted>"), `redacted ${JSON.stringify(redacted)}`);
    assert(!redacted.includes("secret-value-for-redaction-test"), "secret leaked in redacted argv");
  });

  harness.check("revenuecat-cli: ambient other-project is refused before mutation", () => {
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-ambient", run);
    const result = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-ambient-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-ambient-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ ambientProjectId: "proj_other", hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "process must not start");
    assert(result.preflight.code === "ambient-project-mismatch", `code ${result.preflight.code}`);
    assert(
      calls.every((call) => call.argv[0] === "--version" || call.argv[0] === "commands"),
      "only discovery argv allowed before mutation refusal",
    );
  });

  harness.check("revenuecat-cli: catalog mutation without authority does not spawn", () => {
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-authz", run);
    const before = calls.length;
    const result = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-authz-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-authz-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: false }),
    });
    assert(result.invoked === false, "must not invoke");
    assert(result.preflight.code === "authority-missing", `code ${result.preflight.code}`);
    assert(calls.length === before, "no additional process after discovery");
  });

  harness.check("revenuecat-cli: raw api, setup, rico, skills, refund, publish, and profile defaults stay refused", () => {
    for (const id of [
      "rc.api",
      "rc.setup",
      "rc.rico",
      "rc.skills.install",
      "rc.subscriptions.refund",
      "rc.paywalls.publish",
      "rc.products.store.plan",
      "rc.projects.use",
      "rc.profiles.use",
    ]) {
      const operation = getRevenueCatCliOperation(id);
      assert(operation && operation.support !== "implemented-fixture", `${id} must not be spawnable`);
    }
    const { run } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-excluded", run);
    const result = runRevenueCatCli({
      operationId: "rc.api",
      projectId: "proj_approved",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-excl-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-excl-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "raw api must not spawn");
    assert(result.preflight.code === "raw-api-refused" || result.preflight.code === "unsupported-operation", `code ${result.preflight.code}`);
  });

  harness.check("revenuecat-cli: Test Store mutation against production app is refused", () => {
    const { run } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-prod", run);
    const result = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_live",
      productId: "premium_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-prod-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-prod-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ appStoreKind: "app-store", approvedAppId: "app_live", hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "must not invoke production simulate-purchase");
    assert(result.preflight.code === "production-test-store-refused", `code ${result.preflight.code}`);
  });

  harness.check("revenuecat-cli: flag injection and extra --yes are refused", () => {
    const base: CliArgvRequest = {
      operationId: "rc.offerings.list",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
    };
    let extraYes = "";
    try {
      buildRevenueCatCliArgv({ ...base, extraFlags: ["--yes"] });
    } catch (error) {
      extraYes = error instanceof Error ? error.message : String(error);
    }
    let format = "";
    try {
      buildRevenueCatCliArgv({ ...base, extraFlags: ["--format", ".data"] });
    } catch (error) {
      format = error instanceof Error ? error.message : String(error);
    }
    let injected = "";
    try {
      buildRevenueCatCliArgv({ ...base, extraFlags: ["; rm -rf /"] });
    } catch (error) {
      injected = error instanceof Error ? error.message : String(error);
    }
    assert(extraYes.includes("yes") || extraYes.includes("--yes"), extraYes);
    assert(format.includes("format") || format.includes("jq"), format);
    assert(injected.includes("flag") || injected.includes("schema"), injected);
  });

  harness.check("revenuecat-cli: exit zero with invalid JSON or nonempty verify issues is not complete", () => {
    const invalid = parseRevenueCatCliJson("not-json", 0);
    assert(invalid.ok === false && invalid.code === "invalid-json", JSON.stringify(invalid));
    const errorObject = parseRevenueCatCliJson(JSON.stringify({ object: "error", type: "unauthorized", message: "denied" }), 4);
    assert(errorObject.ok === false && errorObject.code === "command-error", JSON.stringify(errorObject));
    const issues = offeringVerifyIsComplete({ issues: [{ code: "missing_product" }] });
    assert(issues.complete === false, "nonempty issues must not be complete");
    const emptyIssuesOnly = offeringVerifyIsComplete({ issues: [] });
    assert(emptyIssuesOnly.complete === false, "empty issues without an offering graph must not be complete");
  });

  harness.check("revenuecat-cli: pagination next_page is partial, not an empty catalog", () => {
    assert(paginationState({ items: [], next_page: "https://api.revenuecat.com/v2/next" }) === "partial", "next_page must be partial");
    assert(paginationState({ items: [], next_page: null }) === "complete", "null next_page is complete");
    assert(paginationState("nope") === "unknown", "unknown document stays unknown");
  });

  harness.check("revenuecat-cli: mutation timeout is uncertain and not replay-safe", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return { stdout: "", stderr: "", status: null, timedOut: true, truncated: false, cancelled: false, signal: "SIGTERM" };
    });
    const discovery = discoverTrusted(harness, "rc-timeout", run);
    const result = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-timeout-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-timeout-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: true }),
    });
    assert(result.invoked === true, "timeout still invoked once");
    assert(result.uncertainMutation === true && result.replaySafe === false, "timeout after mutation is uncertain");
  });

  harness.check("revenuecat-cli: two workspaces keep isolated HOME and project ids", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(JSON.stringify({ data: { items: [] }, schema_version: "1" }));
    });
    const discovery = discoverTrusted(harness, "rc-iso", run);
    const homeA = isolatedConfigHome(harness.makeTempDir("rc-iso-a"), "ws-a");
    const homeB = isolatedConfigHome(harness.makeTempDir("rc-iso-b"), "ws-b");
    runRevenueCatCli({
      operationId: "rc.offerings.list",
      projectId: "proj_a",
      hostAuthorityGranted: false,
      executable: "/opt/fake/bin/rc",
      cwd: homeA,
      isolatedHome: homeA,
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key-a",
      run,
      discovery,
      target: selectedTarget({ approvedProjectId: "proj_a" }),
    });
    runRevenueCatCli({
      operationId: "rc.offerings.list",
      projectId: "proj_b",
      hostAuthorityGranted: false,
      executable: "/opt/fake/bin/rc",
      cwd: homeB,
      isolatedHome: homeB,
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key-b",
      run,
      discovery,
      target: selectedTarget({ approvedProjectId: "proj_b" }),
    });
    const lists = calls.filter((call) => call.argv.includes("list"));
    assert(lists.length === 2, `expected two list calls, got ${lists.length}`);
    assert(lists[0]!.env.HOME === homeA && lists[1]!.env.HOME === homeB, "HOME must be per-workspace");
    assert(lists[0]!.env.RC_PROJECT_ID === "proj_a" && lists[1]!.env.RC_PROJECT_ID === "proj_b", "project env must not cross");
    assert(lists[0]!.argv.includes("proj_a") && lists[1]!.argv.includes("proj_b"), "argv project ids must stay distinct");
    assert(!JSON.stringify(lists.map((call) => call.argv)).includes("rc-fixture-key"), "api keys must not appear in argv");
  });

  harness.check("revenuecat-cli: auth failure does not invent an empty catalog or leak secrets", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return {
        stdout: JSON.stringify({ error: { code: "unauthorized", message: "denied" } }),
        stderr: "",
        status: 4,
        timedOut: false,
        truncated: false,
        cancelled: false,
        signal: null,
      };
    });
    const discovery = discoverTrusted(harness, "rc-unauth", run);
    const result = runRevenueCatCli({
      operationId: "rc.offerings.list",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-unauth-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-unauth-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget(),
    });
    assert(result.json?.ok === false, "auth failure is not success");
    assert(result.json && result.json.ok === false && result.json.code === "command-error", JSON.stringify(result.json));
    assert(!JSON.stringify(result).includes("rc-fixture-key"), "secret leaked in result");
  });

  harness.check("revenuecat-cli: REST probe marker cannot be applied to CLI output", () => {
    const cliAsRest = classifyRevenueCatProofDocument({ probe: REST_PROBE_COLLECTOR, collector: CLI_PROOF_COLLECTOR, cli_executable: "/opt/fake/bin/rc" });
    assert(cliAsRest.refusal === "cli-stamped-as-rest" || cliAsRest.refusal === "rest-stamped-as-cli", JSON.stringify(cliAsRest));
    const restAsCli = classifyRevenueCatProofDocument({ probe: REST_PROBE_COLLECTOR, cli_executable: "/opt/fake/bin/rc" });
    assert(restAsCli.refusal === "rest-stamped-as-cli", JSON.stringify(restAsCli));
    const syntheticLive = classifyRevenueCatProofDocument({ probe: CLI_PROOF_COLLECTOR, synthetic: true, live: true });
    assert(syntheticLive.refusal === "synthetic-labeled-live", JSON.stringify(syntheticLive));
    const okCli = classifyRevenueCatProofDocument({ probe: CLI_PROOF_COLLECTOR, cli_executable: "/opt/fake/bin/rc" });
    assert(!okCli.refusal && okCli.identity.collector === CLI_PROOF_COLLECTOR, JSON.stringify(okCli));
  });

  harness.check("revenuecat-cli: offerings.list argv is typed, noninteractive, and project-scoped", () => {
    const argv = buildRevenueCatCliArgv({
      operationId: "rc.offerings.list",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
    });
    assert(argv[0] === "--project-id" && argv[1] === "proj_approved", JSON.stringify(argv));
    assert(argv.includes("offerings") && argv.includes("list"), JSON.stringify(argv));
    assert(argv.includes("--json") && argv.includes("--no-input") && argv.includes("--no-color"), JSON.stringify(argv));
    assert(!argv.includes("--yes"), "read must not add --yes");
    assert(!argv.some((token) => token.includes("api-key") || token.startsWith("sk_")), "secrets must not appear in argv");
  });

  harness.check("revenuecat-cli: a command named plan or preview is not assumed effect-free", () => {
    assert(commandLooksLikePlan(["products", "store", "plan"]), "store plan must be treated as consequential");
    assert(commandLooksLikePlan(["offerings", "preview"]), "preview is not assumed effect-free by name");
    const preview = getRevenueCatCliOperation("rc.offerings.preview")!;
    assert(preview.effectClass === "authenticated-read-with-user", preview.effectClass);
    assert(!isMutationEffect(preview.effectClass), "preview stays a classified read, not a silent mutation");
    const plan = getRevenueCatCliOperation("rc.products.store.plan")!;
    assert(plan.support !== "implemented-fixture" && isMutationEffect(plan.effectClass), "store plan stays excluded");
  });

  harness.check("revenuecat-cli: authorized Test Store simulate-purchase adds --yes only after authority", () => {
    const argv = buildRevenueCatCliArgv({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_test",
      productId: "premium_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
    });
    assert(argv.includes("--yes"), JSON.stringify(argv));
    assert(argv.includes("--app-id") && argv.includes("app_test"), JSON.stringify(argv));
  });

  harness.check("revenuecat-cli: a profile named staging is not treated as Test Store", () => {
    const { run } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-staging", run);
    const result = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_unknown",
      productId: "premium_monthly",
      appUserId: "user_synth",
      profile: "staging",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-staging-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-staging-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ ambientProfile: "staging", appStoreKind: "unresolved", approvedAppId: "app_unknown", hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "staging profile is not Test Store proof");
    assert(result.preflight.code === "production-test-store-refused", `code ${result.preflight.code}`);
  });

  harness.check("revenuecat-cli: upstream manifest gains executable relationship without a second identity", () => {
    const loaded = loadUpstreams(skillRoot);
    const row = loaded.upstreams.find((entry) => entry.manifest.id === "revenuecat-cli");
    assert(row !== undefined, "revenuecat-cli identity missing");
    const kinds = row.manifest.relationships.map((relationship) => relationship.kind);
    assert(kinds.includes("adapted-method") && kinds.includes("external-executable"), `kinds ${kinds.join(",")}`);
    assert(row.manifest.hostProbe?.command === "rc", "host_probe must stay a version probe of rc");
    assert(row.manifest.baselines.reviewedSource?.revision === REVENUECAT_CLI_RELEASE.commit, "executable candidate must be the v0.1.1 commit");
    assert(row.observation?.host === null || row.observation?.host === undefined, "historical observation must not invent a host executable");
    assert(REVENUECAT_PROVISIONING.accessRoutes.includes("cli"), "CLI is a declared access route only after the runner exists");
  });

  harness.check("revenuecat-cli: request project other than approved is refused before spawn", () => {
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-req-proj", run);
    const result = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_attacker",
      offeringId: "off_default",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-req-proj-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-req-proj-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ approvedProjectId: "proj_approved", hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "attacker project must not spawn");
    assert(result.preflight.code === "request-project-mismatch", `code ${result.preflight.code}`);
    assert(
      calls.every((call) => call.argv[0] === "--version" || call.argv[0] === "commands"),
      "only discovery argv allowed when request project mismatches",
    );
    assert(!JSON.stringify(result.argv).includes("proj_attacker"), "attacker project must not reach argv");
  });

  harness.check("revenuecat-cli: request app other than approved is refused even for Test Store", () => {
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-req-app", run);
    const result = runRevenueCatCli({
      operationId: "rc.customers.simulate-purchase",
      projectId: "proj_approved",
      appId: "app_other",
      productId: "premium_monthly",
      appUserId: "user_synth",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-req-app-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-req-app-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ approvedAppId: "app_test", appStoreKind: "test-store", hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "other app must not spawn");
    assert(result.preflight.code === "request-app-mismatch", `code ${result.preflight.code}`);
    assert(
      calls.every((call) => call.argv[0] === "--version" || call.argv[0] === "commands"),
      "only discovery argv allowed when request app mismatches",
    );
    assert(!JSON.stringify(result.argv).includes("app_other"), "other app must not reach argv");
  });

  harness.check("revenuecat-cli: extraFlags equals-form project and base-url are refused", () => {
    const base: CliArgvRequest = {
      operationId: "rc.offerings.list",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
    };
    let projectOverride = "";
    try {
      buildRevenueCatCliArgv({ ...base, extraFlags: ["--project-id=proj_other"] });
    } catch (error) {
      projectOverride = error instanceof Error ? error.message : String(error);
    }
    let baseUrl = "";
    try {
      buildRevenueCatCliArgv({ ...base, extraFlags: ["--base-url=https://evil.example"] });
    } catch (error) {
      baseUrl = error instanceof Error ? error.message : String(error);
    }
    assert(projectOverride.includes("project-id") || projectOverride.includes("extra flag"), projectOverride);
    assert(baseUrl.includes("base-url") || baseUrl.includes("extra flag"), baseUrl);
  });

  harness.check("revenuecat-cli: verify document without issues field is not complete", () => {
    const missing = offeringVerifyIsComplete({});
    assert(missing.complete === false, "missing issues must not be complete");
    const unknown = offeringVerifyIsComplete({ completeness: "unknown" });
    assert(unknown.complete === false, "non-array issues must not be complete");
    const notArray = offeringVerifyIsComplete({ issues: "ok" });
    assert(notArray.complete === false, "string issues must not be complete");
  });

  harness.check("revenuecat-cli: products and entitlements create without typed ids do not spawn", () => {
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-create-ids", run);
    const base = {
      projectId: "proj_approved" as const,
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-create-ids-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-create-ids-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: true }),
    };
    const product = runRevenueCatCli({ ...base, operationId: "rc.products.create", createTitle: "Monthly" });
    const entitlement = runRevenueCatCli({ ...base, operationId: "rc.entitlements.create" });
    assert(product.invoked === false, "bare products create must not spawn");
    assert(entitlement.invoked === false, "bare entitlements create must not spawn");
    assert(
      calls.every((call) => call.argv[0] === "--version" || call.argv[0] === "commands"),
      "stub product or entitlement create must not start a process",
    );
  });

  harness.check("revenuecat-cli: catalog create without a typed offering id does not spawn", () => {
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const discovery = discoverTrusted(harness, "rc-create-stub", run);
    const result = runRevenueCatCli({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-create-stub-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-create-stub-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery,
      target: selectedTarget({ hostAuthorityGranted: true }),
    });
    assert(result.invoked === false, "bare offerings create must not spawn");
    assert(
      calls.every((call) => call.argv[0] === "--version" || call.argv[0] === "commands"),
      "stub catalog create must not start a process",
    );
  });

  harness.check("revenuecat-cli: accepted catalog is read back instead of duplicated", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      const listed = matchingNativeLists(request);
      if (listed) return listed;
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(catalogSession(harness, "rc-reconcile-exists", run, { createIfMissing: true, hostAuthorityGranted: true, target: selectedTarget({ hostAuthorityGranted: true }) }));
    assert(result.disposition === "complete", `disposition ${result.disposition}`);
    assert(result.evidence.catalog.reconciled === true, "existing catalog must reconcile");
    assert(result.evidence.catalog.protocol_valid === true, "protocol-valid lists are not by themselves incomplete");
    assert(result.evidence.created === false, "must not create when the selected catalog already matches");
    assert(
      calls.every((call) => !isCatalogMutation(call.argv)),
      "duplicate create must not spawn",
    );
    assert(result.evidence.catalog.offering_ids.includes("ofrng"), "must reuse the opaque offering id");
  });

  harness.check("revenuecat-cli: offering create without products and entitlements is not reconciled", () => {
    let createdOffering = false;
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("offerings") && request.argv.includes("create")) {
        createdOffering = true;
        return ok(envelope({ id: "ofrng", lookup_key: "default", object: "offering" }));
      }
      if (isCatalogMutation(request.argv)) return ok(envelope({}));
      if (request.argv.includes("offerings") && request.argv.includes("list")) {
        return ok(listEnvelope(createdOffering ? [{ ...NATIVE_MATCHING_GRAPH.offering }] : []));
      }
      if (request.argv.includes("list") || request.argv.includes("packages") || request.argv.includes("verify")) {
        return ok(listEnvelope([]));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-reconcile-offering-only", run, {
        createIfMissing: true,
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
      }),
    );
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.catalog.reconciled === false, "creating one offering is not catalog reconciliation");
    assert(result.evidence.created === true, "authorized entity creates may still run");
    assert(result.evidence.catalog.missing_ids.some((id) => id === "monthly" || id.includes("monthly")), `missing ${result.evidence.catalog.missing_ids.join(",")}`);
    assert(result.evidence.catalog.missing_ids.some((id) => id.includes("premium")), `missing ${result.evidence.catalog.missing_ids.join(",")}`);
    assert(
      calls.some((call) => call.argv.includes("products") && call.argv.includes("create") && call.argv.includes("--store-id") && call.argv.includes("monthly")),
      "missing product must repair through products create",
    );
    assert(
      calls.some((call) => call.argv.includes("offerings") && call.argv.includes("create") && call.argv.includes("--lookup-key") && call.argv.includes("default")),
      "offering create should spawn with pinned --lookup-key when the offering is also missing",
    );
    const createArgv = calls.find((call) => call.argv.includes("offerings") && call.argv.includes("create"))!.argv;
    assert(!argvContainsBareToken(createArgv, "ofrng"), `server id must not be a create positional: ${JSON.stringify(createArgv)}`);
  });

  harness.check("revenuecat-cli: missing catalog without authority does not create", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("list") || request.argv.includes("packages") || request.argv.includes("verify")) {
        return ok(listEnvelope([]));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(catalogSession(harness, "rc-reconcile-authz", run, { createIfMissing: true, hostAuthorityGranted: false }));
    assert(result.disposition === "refused", `disposition ${result.disposition}`);
    assert(result.hold?.code === "authority-missing", `hold ${result.hold?.code}`);
    assert(
      calls.every((call) => !isCatalogMutation(call.argv)),
      "create must not spawn without authority",
    );
  });

  harness.check("revenuecat-cli: missing product repairs product not offering create", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("products") && request.argv.includes("create")) {
        return ok(envelope({ id: "prod", store_identifier: "monthly", type: "subscription", app_id: "app_test", object: "product" }));
      }
      if (request.argv.includes("products") && request.argv.includes("list")) return ok(listEnvelope([]));
      const listed = matchingNativeLists(request);
      if (listed) return listed;
      if (request.argv.includes("attach")) return ok(envelope({ id: "ent", object: "entitlement" }));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-reconcile-missing-product", run, {
        createIfMissing: true,
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
      }),
    );
    assert(result.evidence.catalog.reconciled === false || result.disposition !== "complete" || calls.some((call) => call.argv.includes("products") && call.argv.includes("create")), `disposition ${result.disposition}`);
    assert(
      calls.some((call) => call.argv.includes("products") && call.argv.includes("create") && call.argv.includes("--store-id") && call.argv.includes("monthly")),
      "product create must use --store-id",
    );
    assert(
      calls.every((call) => !(call.argv.includes("offerings") && call.argv.includes("create"))),
      "missing product must not collapse into offering create",
    );
  });

  harness.check("revenuecat-cli: unknown list coverage is not complete and does not create", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("list") || request.argv.includes("packages") || request.argv.includes("verify")) {
        return ok(envelope({ object: "list" }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-reconcile-unknown", run, {
        createIfMissing: true,
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
      }),
    );
    assert(result.disposition !== "complete", `disposition ${result.disposition}`);
    assert(result.evidence.catalog.reconciled === false, "unknown coverage cannot reconcile");
    assert(
      calls.every((call) => !isCatalogMutation(call.argv)),
      "unknown coverage must not create",
    );
  });

  harness.check("revenuecat-cli: ids present on the wrong package are not reconciled", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("packages") && !isCatalogMutation(request.argv)) {
        return ok(
          listEnvelope([
            { id: "pkg", lookup_key: "$rc_monthly", display_name: "Monthly", object: "package", offering_id: "ofrng", products: [] },
            {
              id: "pkg_annual",
              lookup_key: "$rc_annual",
              display_name: "Annual",
              object: "package",
              offering_id: "ofrng",
              products: [{ product: NATIVE_MATCHING_GRAPH.products[0], prices: [{ currency: "USD", amount_micros: 4_990_000 }] }],
            },
          ]),
        );
      }
      const listed = matchingNativeLists(request);
      if (listed) return listed;
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-reconcile-wrong-package", run, {
        createIfMissing: true,
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
      }),
    );
    assert(result.disposition !== "complete", `disposition ${result.disposition}`);
    assert(result.evidence.catalog.reconciled === false, "wrong attachment is not id-presence completeness");
    assert(
      calls.every((call) => !(call.argv.includes("offerings") && call.argv.includes("create"))),
      "wrong package membership must not offering-create",
    );
  });

  harness.check("revenuecat-cli: inspect adopts the existing project and app", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("projects")) return ok(envelope({ items: [{ id: "proj_approved" }], next_page: null }));
      if (request.argv.includes("apps") && request.argv.includes("show")) return ok(envelope({ id: "app_test", type: "test_store" }));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(catalogSession(harness, "rc-inspect", run, { intent: "inspect-project-app" }));
    assert(result.disposition === "complete", `disposition ${result.disposition}`);
    assert(result.evidence.catalog.project_ids.includes("proj_approved"), "approved project must be present");
    assert(result.evidence.catalog.app_ids.includes("app_test"), "approved app must be present");
    assert(result.evidence.observed_store_kind === "test-store", `observed ${result.evidence.observed_store_kind}`);
    assert(result.invoked.every((step) => !step.argv.includes("create")), "inspect must not create a project");
  });

  harness.check("revenuecat-cli: nonempty verify issues are incomplete even on exit zero", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("verify")) return ok(envelope({ issues: [{ code: "missing_product" }] }));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(catalogSession(harness, "rc-verify-issues", run, { intent: "verify-offering" }));
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.offering_verify?.complete === false, "issues must block completeness");
  });

  harness.check("revenuecat-cli: verify document with only empty issues is not complete", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("verify")) return ok(envelope({ issues: [] }));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(catalogSession(harness, "rc-verify-empty-issues", run, { intent: "verify-offering" }));
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.offering_verify?.complete === false, "issues:[] without an offering graph must not be complete");
    assert(result.evidence.offering_verify?.protocol_valid !== true, "empty issues alone is not a valid verify graph");
  });

  harness.check("revenuecat-cli: null paywall_components is fallback, not published paywall", () => {
    const preview = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test", offeringLookupKey: "default" });
    assert(preview.fallbackOnly === true && preview.publishedPaywall === false, JSON.stringify(preview));
    assert(preview.protocolValid === true && preview.wrongApp === false, "fallback can still be a valid preview");
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("preview")) return ok(envelope(UPSTREAM_SDK_PREVIEW_MINIMAL));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-preview-fallback", run, { intent: "preview-sdk", appUserId: "user_synth" }),
    );
    assert(result.evidence.preview?.fallback_only === true, "fallback must be recorded");
    assert(result.evidence.preview?.published_paywall === false, "null components are not published paywall proof");
    assert(result.evidence.preview?.offering_id === "default", "SDK lookup key must be recorded");
    assert(result.disposition === "complete", `disposition ${result.disposition}`);
  });

  harness.check("revenuecat-cli: wrong-app preview is incomplete", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      return ok(envelope({ ...UPSTREAM_SDK_PREVIEW_MINIMAL, app_id: "app_other" }));
    });
    const result = runRevenueCatCatalogSession(catalogSession(harness, "rc-preview-wrong", run, { intent: "preview-sdk", appUserId: "user_synth" }));
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.preview?.wrong_app === true, "wrong app must be flagged");
  });

  harness.check("revenuecat-cli: authorized Test Store purchase reads entitlements and is not native proof", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", active_entitlements: [{ id: "ent_premium" }] }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-test-store", run, {
        intent: "test-store-purchase",
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
        appUserId: "user_synth",
        productId: "prod_monthly",
        customerId: "user_synth",
      }),
    );
    assert(result.disposition === "complete", `disposition ${result.disposition}`);
    assert(result.evidence.test_store?.executed === true, "simulate-purchase must run");
    assert(result.evidence.test_store?.entitlement_ids.includes("ent_premium"), "entitlement readback required");
    assert(result.evidence.test_store?.not_native_purchase_proof === true, "must remain non-native");
    assert(result.evidence.not_rest_probe === true && result.evidence.collector === CLI_PROOF_COLLECTOR, "CLI collector only");
    const classified = classifyRevenueCatCliCatalogEvidence(result.evidence);
    assert(classified.ok, JSON.stringify(classified));
  });

  harness.check("revenuecat-cli: Test Store purchase is refused when apps show is App Store", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(envelope({ id: "app_test", object: "app", type: "app_store" }));
      if (request.argv.includes("simulate-purchase")) return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-test-store-app-store", run, {
        intent: "test-store-purchase",
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
        appUserId: "user_synth",
        productId: "prod_monthly",
        customerId: "user_synth",
      }),
    );
    assert(result.disposition === "refused", `disposition ${result.disposition}`);
    assert(result.hold?.code === "production-test-store-refused", `hold ${result.hold?.code}`);
    assert(result.evidence.observed_store_kind === "app-store", `observed ${result.evidence.observed_store_kind}`);
    assert(
      calls.every((call) => !call.argv.includes("simulate-purchase")),
      "App Store readback must not spawn simulate-purchase",
    );
  });

  harness.check("revenuecat-cli: live non-synthetic catalog evidence is accepted", () => {
    const liveDoc = {
      collector: CLI_PROOF_COLLECTOR,
      kind: CLI_CATALOG_KIND,
      synthetic: false,
      live: true,
      not_native_purchase_proof: true,
    };
    const classified = classifyRevenueCatCliCatalogEvidence(liveDoc);
    assert(classified.ok, JSON.stringify(classified));
    const syntheticLive = classifyRevenueCatCliCatalogEvidence({ ...liveDoc, synthetic: true });
    assert(syntheticLive.ok === false && syntheticLive.refusal === "synthetic-labeled-live", JSON.stringify(syntheticLive));
  });

  harness.check("revenuecat-cli: Test Store readback with a different entitlement is incomplete", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly" }));
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", active_entitlements: [{ id: "ent_other" }] }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-test-store-wrong-ent", run, {
        intent: "test-store-purchase",
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
        appUserId: "user_synth",
        productId: "prod_monthly",
        customerId: "user_synth",
      }),
    );
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.test_store?.executed === true, "simulate-purchase may still run");
    assert(result.evidence.test_store?.entitlement_ids.includes("ent_other"), "wrong entitlement must be recorded");
    assert(result.evidence.test_store?.not_native_purchase_proof === true, "must remain non-native");
  });

  harness.check("revenuecat-cli: Test Store purchase completes from simulate-purchase entitlements when customers.show has none", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) {
        return ok(
          envelope({
            ...UPSTREAM_SIMULATE_PURCHASE,
            app_user_id: "user_synth",
            product: { ...UPSTREAM_SIMULATE_PURCHASE.product, id: "prod_monthly" },
          }),
        );
      }
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", object: "customer" }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-test-store-purchase-entitlements", run, {
        intent: "test-store-purchase",
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
        appUserId: "user_synth",
        productId: "prod_monthly",
        customerId: "user_synth",
        expected: {
          projectId: "proj_approved",
          appId: "app_test",
          productIds: ["prod_monthly"],
          entitlementIds: ["premium"],
        },
      }),
    );
    assert(result.disposition === "complete", `disposition ${result.disposition}`);
    assert(result.evidence.test_store?.executed === true, "simulate-purchase must run");
    assert(result.evidence.test_store?.entitlement_ids.includes("premium"), "purchase lookup keys must be recorded");
  });

  harness.check("revenuecat-cli: Test Store purchase stays incomplete when expected entitlements are empty", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) {
        return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly", active_entitlements: ["premium"] }));
      }
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", object: "customer" }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-test-store-empty-expected", run, {
        intent: "test-store-purchase",
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
        appUserId: "user_synth",
        productId: "prod_monthly",
        customerId: "user_synth",
        expected: {
          projectId: "proj_approved",
          appId: "app_test",
          productIds: ["prod_monthly"],
          entitlementIds: [],
        },
      }),
    );
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.test_store?.entitlement_ids.includes("premium"), "observed lookup keys must still be recorded");
  });

  harness.check("revenuecat-cli: Test Store purchase stays incomplete when expected management id does not match lookup keys", () => {
    const { run } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (isAppsShow(request.argv)) return ok(testStoreAppEnvelope());
      if (request.argv.includes("simulate-purchase")) {
        return ok(envelope({ app_user_id: "user_synth", product_id: "prod_monthly", active_entitlements: ["premium"] }));
      }
      if (request.argv.includes("customers") && request.argv.includes("show")) {
        return ok(envelope({ id: "user_synth", object: "customer" }));
      }
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-test-store-id-mismatch", run, {
        intent: "test-store-purchase",
        hostAuthorityGranted: true,
        target: selectedTarget({ hostAuthorityGranted: true }),
        appUserId: "user_synth",
        productId: "prod_monthly",
        customerId: "user_synth",
        expected: {
          projectId: "proj_approved",
          appId: "app_test",
          productIds: ["prod_monthly"],
          entitlementIds: ["ent_premium"],
        },
      }),
    );
    assert(result.disposition === "incomplete", `disposition ${result.disposition}`);
    assert(result.evidence.test_store?.entitlement_ids.includes("premium"), "lookup keys must be recorded");
    assert(result.evidence.test_store?.entitlement_ids.includes("ent_premium") !== true, "management id must not be invented");
  });

  harness.check("revenuecat-cli: paywall inspect does not publish", () => {
    const { run, calls } = recordingRunner((request) => {
      if (request.argv[0] === "--version") return ok("revenuecat-cli 0.1.1\n");
      if (request.argv[0] === "commands") return ok(COMMANDS_JSON);
      if (request.argv.includes("paywalls") && request.argv.includes("list")) return ok(envelope({ items: [{ id: "pw_draft" }], next_page: null }));
      if (request.argv.includes("paywalls") && request.argv.includes("show")) return ok(envelope({ id: "pw_draft" }));
      return ok(envelope({}));
    });
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-paywalls", run, { intent: "inspect-paywalls", expected: { projectId: "proj_approved", appId: "app_test", paywallIds: ["pw_draft"] } }),
    );
    assert(result.disposition === "complete", `disposition ${result.disposition}`);
    assert(result.evidence.paywalls?.published_claimed === false, "inspect must not claim publish");
    assert(
      calls.every((call) => !call.argv.includes("publish") && !call.argv.includes("generate")),
      "publish/generate must not spawn",
    );
    assert(getRevenueCatCliOperation("rc.paywalls.publish")?.support !== "implemented-fixture", "publish stays excluded");
  });

  harness.check("revenuecat-cli: scoped observations refuse unscoped customer lists", () => {
    assert(getRevenueCatCliOperation("rc.customers.list")?.support !== "implemented-fixture", "customers list stays excluded");
    const { run } = recordingRunner(trustedDiscoveryHandler());
    const unscoped = runRevenueCatCatalogSession(catalogSession(harness, "rc-obs-unscoped", run, { intent: "observe-revenue" }));
    assert(unscoped.disposition === "refused" && unscoped.hold?.code === "unscoped-observation", JSON.stringify(unscoped.hold));
    const listed = runRevenueCatCli({
      operationId: "rc.customers.list",
      projectId: "proj_approved",
      hostAuthorityGranted: true,
      executable: "/opt/fake/bin/rc",
      cwd: isolatedConfigHome(harness.makeTempDir("rc-cust-list-cwd"), "ws-a"),
      isolatedHome: isolatedConfigHome(harness.makeTempDir("rc-cust-list-home"), "ws-a"),
      pathEnv: "/opt/fake/bin",
      apiKey: "rc-fixture-key",
      run,
      discovery: discoverTrusted(harness, "rc-cust-list", run),
      target: selectedTarget({ hostAuthorityGranted: true }),
    });
    assert(listed.invoked === false, "customers list must not spawn");
    const scoped = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-obs-customer", run, { intent: "observe-revenue", observationKind: "customer", customerId: "user_synth" }),
    );
    assert(scoped.disposition === "complete", `scoped ${scoped.disposition}`);
    assert(scoped.evidence.observations?.customer_records_exported === false, "must not export customer records");
  });

  harness.check("revenuecat-cli: audit and charts require scoped typed argv", () => {
    const audit = buildRevenueCatCliArgv({
      operationId: "rc.audit",
      projectId: "proj_approved",
      hostAuthorityGranted: false,
      auditLimit: 20,
    });
    assert(audit.includes("--limit") && audit.includes("20"), JSON.stringify(audit));
    let missingLimit = "";
    try {
      buildRevenueCatCliArgv({ operationId: "rc.audit", projectId: "proj_approved", hostAuthorityGranted: false });
    } catch (error) {
      missingLimit = error instanceof Error ? error.message : String(error);
    }
    assert(missingLimit.includes("limit"), missingLimit);
    let badChart = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.charts.show",
        projectId: "proj_approved",
        hostAuthorityGranted: false,
        chartName: "not_a_chart" as never,
      });
    } catch (error) {
      badChart = error instanceof Error ? error.message : String(error);
    }
    assert(badChart.includes("chart"), badChart);
  });

  harness.check("revenuecat-cli: changed remote store plan cannot use an old approval", () => {
    const stale = assessStorePlanApplyAuthorization({ planId: "plan_1", digest: "aaa" }, { planId: "plan_1", digest: "bbb" });
    assert(stale.allowed === false && stale.code === "stale-plan-approval", JSON.stringify(stale));
    const unchanged = assessStorePlanApplyAuthorization({ planId: "plan_1", digest: "aaa" }, { planId: "plan_1", digest: "aaa" });
    assert(unchanged.allowed === false && unchanged.code === "unsupported-operation", "apply stays excluded when digest matches");
    const { run, calls } = recordingRunner(trustedDiscoveryHandler());
    const result = runRevenueCatCatalogSession(
      catalogSession(harness, "rc-stale-plan", run, {
        storePlanApproval: { planId: "plan_1", digest: "aaa" },
        currentStorePlan: { planId: "plan_1", digest: "bbb" },
      }),
    );
    assert(result.disposition === "refused" && result.hold?.code === "stale-plan-approval", `hold ${result.hold?.code}`);
    assert(
      calls.every((call) => call.argv[0] === "--version" || call.argv[0] === "commands"),
      "store apply must not spawn",
    );
    assert(getRevenueCatCliOperation("rc.products.store.apply")?.support !== "implemented-fixture", "apply stays excluded");
    assert(getRevenueCatCliOperation("rc.webhooks.create")?.support !== "implemented-fixture", "webhooks stay excluded");
  });

  harness.check("revenuecat-cli: CLI catalog evidence cannot close the REST lane", () => {
    const okDoc = {
      collector: CLI_PROOF_COLLECTOR,
      kind: CLI_CATALOG_KIND,
      synthetic: true,
      live: false,
      not_native_purchase_proof: true,
      preview: { fallback_only: true, published_paywall: false },
    };
    assert(classifyRevenueCatCliCatalogEvidence(okDoc).ok, "valid CLI catalog must pass");
    const asRest = classifyRevenueCatCliCatalogEvidence({ ...okDoc, probe: REST_PROBE_COLLECTOR });
    assert(asRest.ok === false && asRest.refusal === "cli-stamped-as-rest", JSON.stringify(asRest));
    const native = classifyRevenueCatCliCatalogEvidence({ ...okDoc, not_native_purchase_proof: false });
    assert(native.ok === false && native.refusal === "claims-native-purchase", JSON.stringify(native));
    const publishedFromNull = classifyRevenueCatCliCatalogEvidence({
      ...okDoc,
      preview: { fallback_only: true, published_paywall: true },
    });
    assert(publishedFromNull.refusal === "claims-published-paywall-from-fallback", JSON.stringify(publishedFromNull));
    const issues = issuesFromRevenueCatCliCatalogArtifact(JSON.stringify({ ...okDoc, probe: REST_PROBE_COLLECTOR }), "revenue/revenuecat-cli-catalog.json");
    assert(issues.some((row) => row.code === "revenue.cli_catalog.collector_mismatch"), JSON.stringify(issues));
    assert(extractResourceIds({ items: [{ id: "off_default" }], next_page: "https://example/next" }).pagination === "partial", "partial list is not empty");
  });

  harness.check("revenuecat-cli: independent pin matches the adapter release", () => {
    assert(REVENUECAT_CLI_COMMAND_SCHEMA_PIN.commit === REVENUECAT_CLI_RELEASE.commit, "schema pin drifted from adapter release");
    assert(REVENUECAT_CLI_COMMAND_SCHEMA_PIN.tag === REVENUECAT_CLI_RELEASE.tag, "schema tag drifted from adapter release");
    const implemented = new Set(
      [...PINNED_CREATE_ATTACH_SCHEMAS].map((schema) => schema.builderOperationId),
    );
    for (const operation of REVENUECAT_CLI_OPERATIONS) {
      if (operation.support !== "implemented-fixture" || operation.effectClass !== "catalog-mutation") continue;
      assert(implemented.has(operation.id), `${operation.id} is implemented but has no independently pinned create/attach schema`);
      const schema = PINNED_CREATE_ATTACH_SCHEMAS.find((row) => row.builderOperationId === operation.id);
      assert(schema !== undefined && schema.command.every((part, index) => operation.command[index] === part), `${operation.id} command drifted from the pin`);
    }
    assert(getRevenueCatCliOperation("rc.offerings.set-current")?.support !== "implemented-fixture", "updates/set-current stay unavailable");
  });

  harness.check("revenuecat-cli: increment-B malformed offerings create fails without the encoder", () => {
    const qualified = qualifyRevenueCatNativeArgv(INCREMENT_B_MALFORMED_OFFERINGS_CREATE_ARGV);
    assert(qualified.ok === false, "positional offering id must not satisfy pinned offerings create");
    assert(
      qualified.ok === false && (qualified.code === "unexpected-positional" || qualified.code === "missing-flag"),
      JSON.stringify(qualified),
    );
  });

  harness.check("revenuecat-cli: offerings create emits lookup-key and display-name, not a server id", () => {
    const argv = buildRevenueCatCliArgv({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      offeringId: "ofrng_default",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(argv) === JSON.stringify([...PINNED_OFFERINGS_CREATE_ARGV]), JSON.stringify(argv));
    const qualified = qualifyRevenueCatNativeArgv(argv);
    assert(qualified.ok === true, JSON.stringify(qualified));
    assert(!argvContainsBareToken(argv, "ofrng_default"), "server id must not become a create positional");
    let missing = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.catalog.create",
        projectId: "proj_approved",
        offeringId: "off_default",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      missing = error instanceof Error ? error.message : String(error);
    }
    assert(missing.includes("lookup-key"), missing);
  });

  harness.check("revenuecat-cli: products and entitlements create match pinned flags", () => {
    const products = buildRevenueCatCliArgv({
      operationId: "rc.products.create",
      projectId: "proj_approved",
      appId: "app_test",
      storeIdentifier: "premium_monthly",
      productType: "subscription",
      createTitle: "Premium Monthly",
      duration: "P1M",
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(products) === JSON.stringify([...PINNED_PRODUCTS_CREATE_ARGV]), JSON.stringify(products));
    assert(qualifyRevenueCatNativeArgv(products).ok === true, JSON.stringify(qualifyRevenueCatNativeArgv(products)));
    const entitlements = buildRevenueCatCliArgv({
      operationId: "rc.entitlements.create",
      projectId: "proj_approved",
      lookupKey: "pro",
      displayName: "Pro",
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(entitlements) === JSON.stringify([...PINNED_ENTITLEMENTS_CREATE_ARGV]), JSON.stringify(entitlements));
    assert(qualifyRevenueCatNativeArgv(entitlements).ok === true, JSON.stringify(qualifyRevenueCatNativeArgv(entitlements)));
    let missingStore = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.products.create",
        projectId: "proj_approved",
        appId: "app_test",
        productId: "prod_monthly",
        createTitle: "Monthly",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      missingStore = error instanceof Error ? error.message : String(error);
    }
    assert(missingStore.includes("store-id"), missingStore);
    let missingLookup = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.entitlements.create",
        projectId: "proj_approved",
        entitlementId: "entl_pro",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      missingLookup = error instanceof Error ? error.message : String(error);
    }
    assert(missingLookup.includes("lookup-key"), missingLookup);
  });

  harness.check("revenuecat-cli: packages create and attach commands match pinned argv", () => {
    const created = buildRevenueCatCliArgv({
      operationId: "rc.packages.create",
      projectId: "proj_approved",
      offeringId: "ofrng_default",
      lookupKey: "$rc_monthly",
      displayName: "Monthly",
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(created) === JSON.stringify([...PINNED_PACKAGES_CREATE_ARGV]), JSON.stringify(created));
    assert(qualifyRevenueCatNativeArgv(created).ok === true, JSON.stringify(qualifyRevenueCatNativeArgv(created)));
    const attached = buildRevenueCatCliArgv({
      operationId: "rc.packages.attach",
      projectId: "proj_approved",
      packageId: "pkg_x",
      attachProductIds: ["prod_monthly"],
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(attached) === JSON.stringify([...PINNED_PACKAGES_ATTACH_ARGV]), JSON.stringify(attached));
    let missingPackageLookup = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.packages.create",
        projectId: "proj_approved",
        offeringId: "ofrng_default",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      missingPackageLookup = error instanceof Error ? error.message : String(error);
    }
    assert(missingPackageLookup.includes("lookup-key"), missingPackageLookup);
  });

  harness.check("revenuecat-cli: entitlement and paywall attach match pinned argv", () => {
    const entitlement = buildRevenueCatCliArgv({
      operationId: "rc.entitlements.attach",
      projectId: "proj_approved",
      entitlementId: "entl_pro",
      attachProductIds: ["prod_monthly"],
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(entitlement) === JSON.stringify([...PINNED_ENTITLEMENTS_ATTACH_ARGV]), JSON.stringify(entitlement));
    assert(qualifyRevenueCatNativeArgv(entitlement).ok === true, JSON.stringify(qualifyRevenueCatNativeArgv(entitlement)));
    const paywall = buildRevenueCatCliArgv({
      operationId: "rc.paywalls.attach",
      projectId: "proj_approved",
      paywallId: "pw_abc",
      offeringId: "ofrng_default",
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(paywall) === JSON.stringify([...PINNED_PAYWALLS_ATTACH_ARGV]), JSON.stringify(paywall));
    assert(qualifyRevenueCatNativeArgv(paywall).ok === true, JSON.stringify(qualifyRevenueCatNativeArgv(paywall)));
    let missingAttach = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.entitlements.attach",
        projectId: "proj_approved",
        entitlementId: "entl_pro",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      missingAttach = error instanceof Error ? error.message : String(error);
    }
    assert(missingAttach.includes("product"), missingAttach);
    let missingPaywall = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.paywalls.attach",
        projectId: "proj_approved",
        paywallId: "pw_abc",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      missingPaywall = error instanceof Error ? error.message : String(error);
    }
    assert(missingPaywall.includes("offering"), missingPaywall);
  });

  harness.check("revenuecat-cli: create encoding recovers after a malformed request", () => {
    let first = "";
    try {
      buildRevenueCatCliArgv({
        operationId: "rc.catalog.create",
        projectId: "proj_approved",
        offeringId: "off_default",
        hostAuthorityGranted: true,
      });
    } catch (error) {
      first = error instanceof Error ? error.message : String(error);
    }
    assert(first.includes("lookup-key"), first);
    const recovered = buildRevenueCatCliArgv({
      operationId: "rc.catalog.create",
      projectId: "proj_approved",
      lookupKey: "default",
      displayName: "Default",
      hostAuthorityGranted: true,
    });
    assert(JSON.stringify(recovered) === JSON.stringify([...PINNED_OFFERINGS_CREATE_ARGV]), JSON.stringify(recovered));
    const show = buildRevenueCatCliArgv({
      operationId: "rc.offerings.show",
      projectId: "proj_approved",
      offeringId: "ofrng_default",
      lookupKey: "default",
      hostAuthorityGranted: false,
    });
    assert(show.includes("ofrng_default"), JSON.stringify(show));
    assert(!show.includes("default") || show[show.indexOf("ofrng_default")] === "ofrng_default", JSON.stringify(show));
    assert(!argvContainsBareToken(show, "default"), `show must keep the server id, not the lookup key: ${JSON.stringify(show)}`);
  });
}
