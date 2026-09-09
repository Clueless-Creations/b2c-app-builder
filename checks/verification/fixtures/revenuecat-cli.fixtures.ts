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
  REVENUECAT_CLI_RELEASE,
  buildRevenueCatCliArgv,
  commandLooksLikePlan,
  getRevenueCatCliOperation,
  isMutationEffect,
  type CliArgvRequest,
} from "../../../adapters/providers/revenuecat/cli-operations.js";
import { assessRevenueCatCliPreflight, isolatedConfigHome } from "../../../adapters/providers/revenuecat/cli-preflight.js";
import { classifyRevenueCatProofDocument } from "../../../adapters/providers/revenuecat/cli-proof.js";
import { offeringVerifyIsComplete, paginationState, parseRevenueCatCliJson, runRevenueCatCli } from "../../../adapters/providers/revenuecat/cli-execute.js";
import { REVENUECAT_PROVISIONING } from "../../../adapters/providers/revenuecat/provisioning.js";
import { loadUpstreams } from "../../../kernel/contribution/upstreams-load.js";

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
    const okVerify = offeringVerifyIsComplete({ issues: [] });
    assert(okVerify.complete === true, "empty issues can be complete");
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
}
