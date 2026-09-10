/**
 * #84 Expo/EAS process and job fixtures. Fake processes only. Live EAS, Xcode, and store
 * submit stay not-run. Isolated fake app dirs — not the #82 starter.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXPO_APP_RUNTIME, HOST_AGENT_RUNTIME, operationFor, resolveExpoSelection } from "../../../catalog/stacks/expo-selection.js";
import { EAS_CLI_DOCUMENTED_VERSION, EXPO_EAS_COMMANDS, EXPO_EAS_COMMAND_MATRIX_PATH, getExpoEasCommand } from "../../../catalog/stacks/expo-eas-commands.js";
import {
  EasJobLedger,
  ExpoArgvRefusal,
  ExpoProcessRefusal,
  assessExpoEasPreflight,
  assertTrustedExpoProcessRequest,
  buildExpoEasArgv,
  buildExpoProcessEnv,
  createFakeEasJobTransport,
  decodeExpoEasResponse,
  discoverExpoCli,
  inspectCommandEffects,
  inspectExpoProject,
  interpretSubmitOutcome,
  isolatedConfigHome,
  isSuccessfulBuild,
  redactExpoArgv,
  runExpoEasCommand,
  sanitizeExpoProcessText,
  type ExpoEasTarget,
  type ExpoProcessRequest,
  type ExpoProcessResult,
  type ExpoProcessRunner,
} from "../../../adapters/providers/expo/index.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const EAS_NATIVE_DIR = path.join(skillRoot, "checks/verification/test/data/expo-eas");

function loadEasNativeStdout(name: string): string {
  return readFileSync(path.join(EAS_NATIVE_DIR, name), "utf8");
}

function ok(stdout: string, status = 0): ExpoProcessResult {
  return { stdout, stderr: "", status, timedOut: false, truncated: false, cancelled: false, signal: null };
}

function recordingRunner(handler: (request: ExpoProcessRequest) => ExpoProcessResult): { run: ExpoProcessRunner; calls: ExpoProcessRequest[] } {
  const calls: ExpoProcessRequest[] = [];
  return {
    calls,
    run: (request) => {
      calls.push(request);
      return handler(request);
    },
  };
}

function writeFakeApp(
  root: string,
  options: {
    projectId?: string;
    autoSubmit?: boolean;
    deployServer?: boolean;
    hooks?: boolean;
    workflow?: string;
    dynamicConfig?: boolean;
  } = {},
): string {
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "fake-expo-app",
        scripts: options.hooks ? { "eas-build-pre-install": "node hook.js" } : {},
      },
      null,
      2,
    ),
  );
  writeFileSync(path.join(root, "app.json"), JSON.stringify({ expo: { extra: { eas: { projectId: options.projectId ?? "proj_approved" } } } }, null, 2));
  writeFileSync(
    path.join(root, "eas.json"),
    JSON.stringify(
      {
        build: {
          preview: {
            distribution: "internal",
            ...(options.autoSubmit ? { autoSubmit: true } : {}),
            ...(options.deployServer ? { env: { EXPO_UNSTABLE_DEPLOY_SERVER: "1" } } : {}),
          },
        },
        submit: { preview: {} },
      },
      null,
      2,
    ),
  );
  writeFileSync(path.join(root, ".easignore"), "secrets/\n");
  if (options.dynamicConfig) writeFileSync(path.join(root, "app.config.js"), "module.exports = ({ config }) => config;\n");
  if (options.workflow) {
    mkdirSync(path.join(root, ".eas", "workflows"), { recursive: true });
    writeFileSync(path.join(root, ".eas", "workflows", "ship.yml"), options.workflow);
  }
  return root;
}

function selectedTarget(overrides: Partial<ExpoEasTarget> = {}): ExpoEasTarget {
  return {
    compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME },
    selectedServices: ["expo-cli", "eas-cli", "eas-build", "eas-submit", "eas-workflows"],
    approvedProjectId: "proj_approved",
    approvedProfile: "preview",
    approvedPlatform: "ios",
    hostAuthorityGranted: true,
    grantedAuthority: "spend",
    hasCredential: true,
    allowWorkflowTriggers: false,
    mode: "dispatch",
    host: { os: "darwin", xcodeAvailable: true, androidSdkAvailable: true },
    ...overrides,
  };
}

function trustedDiscovery(harness: Harness, kind: "expo" | "eas" = "eas") {
  const { run } = recordingRunner((request) => {
    if (request.argv[0] === "--version") return ok(kind === "eas" ? "eas-cli/23.2.0 23.2.0\n" : "0.57.0\n");
    return ok("{}");
  });
  return discoverExpoCli({
    kind,
    isolatedHome: isolatedConfigHome(harness.makeTempDir(`${kind}-home`), "ws-a"),
    cwd: harness.makeTempDir(`${kind}-cwd`),
    pathEnv: "/opt/fake/bin",
    probeExecutables: (command) => (command === kind || command === "eas-cli" ? [{ path: `/opt/fake/bin/${kind}`, pathOrder: 0 }] : []),
    run,
  });
}

const SUBMIT_WORKFLOW = `
name: ship
on:
  push:
    branches: [main]
jobs:
  build:
    type: build
    params:
      platform: ios
      profile: preview
  submit:
    type: submit
  update:
    type: update
  deploy:
    type: deploy
`;

const PROD_DEPLOY_WORKFLOW = `
name: promote
jobs:
  deploy:
    type: deploy
    params:
      prod: true
`;

const UNKNOWN_JOB_WORKFLOW = `
name: e2e
jobs:
  e2e:
    type: maestro
`;

export function register(harness: Harness): void {
  harness.check("expo-eas: documented whoami has no --json; env:exec and @latest stay excluded", () => {
    const whoami = getExpoEasCommand("eas.whoami");
    assert(whoami.documentedFlags.json === false, "eas whoami must not invent --json");
    assert(whoami.documentedFlags.nonInteractive === false, "eas whoami must not invent --non-interactive");
    const submit = getExpoEasCommand("eas.submit");
    assert(submit.documentedFlags.json === false, "eas submit 23.2.0 docs do not list --json");
    const envExec = getExpoEasCommand("eas.env.exec");
    assert(envExec.support === "deliberately-excluded", "env:exec is arbitrary shell");
    const update = getExpoEasCommand("eas.update");
    assert(update.support === "labeled-unavailable" && update.queuedIssue === 85, "OTA stays #85");
    const deploy = getExpoEasCommand("eas.deploy");
    assert(deploy.support === "labeled-unavailable" && deploy.queuedIssue === 86, "hosting stays #86");
    const exported = getExpoEasCommand("expo.export");
    assert(exported.support === "labeled-unavailable" && exported.queuedIssue === 86, "executor does not spawn expo.export");
    const cloud = getExpoEasCommand("eas.build.cloud");
    assert(cloud.documentedFlags.freezeCredentials, "eas build documents --freeze-credentials");
    assert(cloud.effects.credentialMutation === false, "frozen dispatch is not a credential mutation");
    assert(EAS_CLI_DOCUMENTED_VERSION === "23.2.0", "documented version is the retrieved page, not /latest/");
    assert(
      EXPO_EAS_COMMANDS.every((command) => command.docsUrl.startsWith("https://docs.expo.dev/")),
      "matrix cites Expo docs, not an installed binary",
    );
  });

  harness.check("expo-eas: --non-interactive and --yes do not grant authority before spawn", () => {
    let refused = false;
    try {
      buildExpoEasArgv({
        operationId: "eas.build.cloud",
        platform: "ios",
        profile: "preview",
        hostAuthorityGranted: false,
      });
    } catch (error) {
      refused = error instanceof ExpoArgvRefusal && error.code === "yes-without-authority";
      assert(error instanceof ExpoArgvRefusal && error.message.includes("--non-interactive"), String(error));
    }
    assert(refused, "cloud build without host authority must refuse before argv is built");
    let extra = false;
    try {
      buildExpoEasArgv({
        operationId: "eas.whoami",
        hostAuthorityGranted: true,
        extraFlags: ["--non-interactive", "--yes"],
      });
    } catch (error) {
      extra = error instanceof ExpoArgvRefusal && error.code === "model-authored-flag";
    }
    assert(extra, "caller-authored flags are not an escape hatch");
  });

  harness.check("expo-eas: missing or unselected tools hold without install or unrelated-work block", () => {
    const { run, calls } = recordingRunner(() => ok(""));
    const missing = discoverExpoCli({
      kind: "eas",
      isolatedHome: isolatedConfigHome(harness.makeTempDir("eas-missing"), "ws-a"),
      cwd: harness.makeTempDir("eas-missing-cwd"),
      pathEnv: "",
      probeExecutables: () => [],
      run,
    });
    assert(missing.code === "missing", missing.code);
    assert(calls.length === 0, "missing PATH must not spawn");
    assert(!missing.message.includes("@latest"), "must not recommend unpinned latest");
    const project = inspectExpoProject(writeFakeApp(harness.makeTempDir("unselected-app")));
    const closure = inspectCommandEffects(project, { commandId: "eas.build.cloud", profile: "preview" });
    const preflight = assessExpoEasPreflight({
      discovery: missing,
      commandId: "eas.build.cloud",
      target: selectedTarget({ selectedServices: ["expo-cli"], hostAuthorityGranted: false, grantedAuthority: "none" }),
      project,
      closure,
    });
    assert(preflight.status === "skip", preflight.status);
    assert(preflight.code === "unselected-eas-cli", preflight.code);
    assert(preflight.blocksUnrelatedWork === false, "missing EAS must not block unrelated work");
  });

  harness.check("expo-eas: host-agent and SwiftUI targets do not spawn EAS", () => {
    const discovery = trustedDiscovery(harness);
    const project = inspectExpoProject(writeFakeApp(harness.makeTempDir("host-agent")));
    const closure = inspectCommandEffects(project, { commandId: "eas.build.cloud", profile: "preview" });
    const host = assessExpoEasPreflight({
      discovery,
      commandId: "eas.build.cloud",
      target: selectedTarget({ compositionTarget: { platform: "host", runtime: HOST_AGENT_RUNTIME }, selectedServices: [] }),
      project,
      closure,
    });
    assert(host.code === "unselected-app-stack", host.code);
    const swiftui = assessExpoEasPreflight({
      discovery,
      commandId: "eas.build.cloud",
      target: selectedTarget({ compositionTarget: { platform: "ios", runtime: "swiftui" }, selectedServices: ["eas-cli", "eas-build"] }),
      project,
      closure,
    });
    assert(swiftui.code === "unselected-app-stack", swiftui.code);
  });

  harness.check("expo-eas: wrong project or profile refuses before a remote effect", () => {
    const discovery = trustedDiscovery(harness);
    const project = inspectExpoProject(writeFakeApp(harness.makeTempDir("wrong-project"), { projectId: "proj_other" }));
    const closure = inspectCommandEffects(project, { commandId: "eas.build.cloud", profile: "preview" });
    const preflight = assessExpoEasPreflight({
      discovery,
      commandId: "eas.build.cloud",
      target: selectedTarget(),
      project,
      closure,
      requestProfile: "preview",
      requestPlatform: "ios",
    });
    assert(preflight.code === "wrong-project", preflight.code);
    const profileHold = assessExpoEasPreflight({
      discovery,
      commandId: "eas.build.cloud",
      target: selectedTarget({ approvedProjectId: "proj_other" }),
      project,
      closure,
      requestProfile: "production",
      requestPlatform: "ios",
    });
    assert(profileHold.code === "wrong-profile", profileHold.code);
  });

  harness.check("expo-eas: passive plan classifies effects and never spawns", () => {
    const { run, calls } = recordingRunner(() => ok(JSON.stringify({ id: "build_1", status: "in-queue" })));
    const cwd = writeFakeApp(harness.makeTempDir("plan-app"), { hooks: true, autoSubmit: true, deployServer: true });
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("plan-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const result = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      expoToken: "secret-token-value",
      run,
      discovery,
      target: selectedTarget({ mode: "plan", hostAuthorityGranted: false, grantedAuthority: "observe" }),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "plan-1",
      ledger: new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" }),
      jobTransport: createFakeEasJobTransport(),
    });
    assert(result.invoked === false, "plan must not spawn");
    assert(result.preflight.code === "passive-plan", result.preflight.code);
    assert(calls.length === 0, "plan must not call the process runner");
    const project = inspectExpoProject(cwd);
    const closure = inspectCommandEffects(project, { commandId: "eas.build.cloud", profile: "preview", autoSubmitRequested: false });
    assert(closure.nested.includes("build-hook"), "hooks must be classified");
    assert(closure.nested.includes("auto-submit"), "eas.json autoSubmit must be classified");
    assert(closure.nested.includes("server-deployment"), "EXPO_UNSTABLE_DEPLOY_SERVER must be classified");
    assert(project.dynamicConfigPresent === false, "this fixture uses static app.json");
  });

  harness.check("expo-eas: Linux iOS local is held; cloud remains a separate authorized route", () => {
    const discovery = trustedDiscovery(harness);
    const project = inspectExpoProject(writeFakeApp(harness.makeTempDir("linux-ios")));
    const local = inspectCommandEffects(project, { commandId: "eas.build.local", profile: "preview" });
    const localHold = assessExpoEasPreflight({
      discovery,
      commandId: "eas.build.local",
      target: selectedTarget({ host: { os: "linux", xcodeAvailable: false, androidSdkAvailable: true }, grantedAuthority: "compile" }),
      project,
      closure: local,
      requestPlatform: "ios",
      requestProfile: "preview",
    });
    assert(localHold.code === "unsupported-host-mode", localHold.code);
    assert(localHold.message.includes("Linux"), localHold.message);
    const cloud = inspectCommandEffects(project, { commandId: "eas.build.cloud", profile: "preview" });
    const cloudReady = assessExpoEasPreflight({
      discovery,
      commandId: "eas.build.cloud",
      target: selectedTarget({ host: { os: "linux", xcodeAvailable: false, androidSdkAvailable: true }, grantedAuthority: "spend" }),
      project,
      closure: cloud,
      requestPlatform: "ios",
      requestProfile: "preview",
    });
    assert(cloudReady.status === "ready", cloudReady.message);
  });

  harness.check("expo-eas: workflow submit/update/deploy/triggers exceed a build grant", () => {
    const discovery = trustedDiscovery(harness);
    const project = inspectExpoProject(writeFakeApp(harness.makeTempDir("workflow"), { workflow: SUBMIT_WORKFLOW }));
    const closure = inspectCommandEffects(project, { commandId: "eas.workflow.run", workflowRelativePath: ".eas/workflows/ship.yml" });
    assert(closure.vector.storeSubmission, "submit job is a store effect");
    assert(closure.vector.otaPublication, "update job is an OTA effect");
    assert(closure.vector.serverDeployment, "deploy job is a server effect");
    assert(closure.nested.includes("workflow-trigger"), "push trigger must be classified");
    const preflight = assessExpoEasPreflight({
      discovery,
      commandId: "eas.workflow.run",
      target: selectedTarget({ grantedAuthority: "spend", allowWorkflowTriggers: false }),
      project,
      closure,
    });
    assert(preflight.code === "workflow-trigger-refused" || preflight.code === "nested-effect-ungranted", preflight.code);
  });

  harness.check("expo-eas: timeout after remote accept reconciles by job id and does not duplicate", () => {
    const cwd = writeFakeApp(harness.makeTempDir("timeout-app"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("timeout-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const transport = createFakeEasJobTransport({ jobs: { build_paid: { state: "finished", artifactUrl: "artifact:fake-ipa" } } });
    const { run, calls } = recordingRunner(() => ({
      stdout: JSON.stringify([{ id: "build_paid", status: "IN_QUEUE", platform: "IOS", buildProfile: "preview", app: { id: "proj_approved" } }]),
      stderr: "",
      status: null,
      timedOut: true,
      truncated: false,
      cancelled: false,
      signal: "SIGTERM",
    }));
    const first = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      expoToken: "secret-token-value",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-1",
      ledger,
      jobTransport: transport,
    });
    assert(first.invoked, "first dispatch may spawn");
    assert(first.uncertainRemote, "timeout after an id is uncertain");
    assert(first.remoteId === "build_paid", first.remoteId ?? "");
    assert(!first.argv.includes("secret-token-value"), "token must not appear in argv");
    const second = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      expoToken: "secret-token-value",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-1",
      ledger,
      jobTransport: transport,
    });
    assert(second.invoked === false, "reconciled job must not be resubmitted");
    assert(second.jobState === "finished", second.jobState ?? "");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
    assert(transport.reads.includes("build_paid"), "must read the persisted remote id");
  });

  harness.check("expo-eas: unread remote id after timeout holds and does not spawn twice", () => {
    const cwd = writeFakeApp(harness.makeTempDir("unread-id-app"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("unread-id-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const transport = createFakeEasJobTransport();
    const { run, calls } = recordingRunner(() => ({
      stdout: JSON.stringify([{ id: "build_paid", status: "IN_QUEUE", platform: "IOS", buildProfile: "preview", app: { id: "proj_approved" } }]),
      stderr: "",
      status: null,
      timedOut: true,
      truncated: false,
      cancelled: false,
      signal: "SIGTERM",
    }));
    const request = {
      operationId: "eas.build.cloud" as const,
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      expoToken: "secret-token-value",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios" as const,
      profile: "preview",
      idempotencyKey: "build-unread",
      ledger,
      jobTransport: transport,
    };
    const first = runExpoEasCommand(request);
    assert(first.invoked, "first dispatch may spawn");
    assert(first.remoteId === "build_paid", first.remoteId ?? "");
    assert(first.uncertainRemote, "timeout after an id is uncertain");
    const second = runExpoEasCommand(request);
    assert(second.invoked === false, "unread remote id must not spawn again");
    assert(second.preflight.code === "mutation-uncertain", second.preflight.code);
    assert(second.uncertainRemote, "unread remote id stays uncertain");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
    assert(transport.reads.includes("build_paid"), "must attempt readback of the persisted remote id");
  });

  harness.check("expo-eas: cloud one-element array preserves id; build:view uses its own object decoder", () => {
    const cwd = writeFakeApp(harness.makeTempDir("decode-array-app"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("decode-array-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run: buildRun } = recordingRunner(() => ok(loadEasNativeStdout("build-cloud-one-element-array.json")));
    const built = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: buildRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "decode-array",
      ledger,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(built.remoteId === "11111111-1111-4111-8111-111111111111", built.remoteId ?? "");
    assert(built.jobState === "queued", built.jobState ?? "");
    assert(built.decode?.code === "ok" || built.decode?.code === "partial", built.decode?.code ?? "");
    const { run: viewRun } = recordingRunner(() => ok(loadEasNativeStdout("build-view-single-object.json")));
    const viewed = runExpoEasCommand({
      operationId: "eas.build.view",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: viewRun,
      discovery,
      target: selectedTarget({ grantedAuthority: "observe" }),
      platform: "ios",
      profile: "preview",
      buildId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "decode-view",
      ledger: new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" }),
      jobTransport: createFakeEasJobTransport(),
    });
    assert(viewed.invoked, "view may spawn");
    assert(viewed.remoteId === built.remoteId, `${viewed.remoteId} vs ${built.remoteId}`);
    assert(viewed.decode?.qualifiedRemoteIds[0] === built.decode?.qualifiedRemoteIds[0], "same qualified id across commands");
    const mistaken = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadEasNativeStdout("build-mistaken-single-object.json"),
      expected: { platform: "ios", profile: "preview", easProjectId: "proj_approved" },
    });
    assert(mistaken.boundRemoteId === undefined, "executor-facing decode must not treat the old object as a cloud job");
  });

  harness.check("expo-eas: multiplicity and malformed JSON do not prove a successful paid build", () => {
    const cwd = writeFakeApp(harness.makeTempDir("decode-multi-app"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("decode-multi-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const { run: multiRun, calls: multiCalls } = recordingRunner(() => ok(loadEasNativeStdout("build-cloud-multi-array.json")));
    const multiLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const multi = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: multiRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "decode-multi",
      ledger: multiLedger,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(multi.invoked, "dispatch may spawn");
    assert(multi.remoteId === undefined, multi.remoteId ?? "");
    assert(multi.observedRemoteIds?.length === 2, String(multi.observedRemoteIds?.length));
    assert(multi.uncertainRemote, "unsupported multiplicity after a paid spawn stays uncertain");
    assert(isSuccessfulBuild(multiLedger.get("decode-multi")) === false, "multiplicity is not success");
    const retry = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: multiRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "decode-multi",
      ledger: multiLedger,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(retry.invoked === false, "uncertain multiplicity must not spawn a second paid build");
    assert(multiCalls.length === 1, `expected one spawn, got ${multiCalls.length}`);
    const { run: badRun } = recordingRunner(() => ok("{not-json"));
    const badLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const bad = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: badRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "decode-malformed",
      ledger: badLedger,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(bad.remoteId === undefined, bad.remoteId ?? "");
    assert(bad.decode?.code === "malformed-json", bad.decode?.code ?? "");
    assert(isSuccessfulBuild(badLedger.get("decode-malformed")) === false, "malformed JSON is not success");
  });

  harness.check("expo-eas: workflow prod deploy and unknown jobs refuse instead of failing open", () => {
    const discovery = trustedDiscovery(harness);
    const prodProject = inspectExpoProject(writeFakeApp(harness.makeTempDir("prod-workflow"), { workflow: PROD_DEPLOY_WORKFLOW }));
    const prod = inspectCommandEffects(prodProject, { commandId: "eas.workflow.run", workflowRelativePath: ".eas/workflows/ship.yml" });
    assert(prod.vector.serverDeployment, "deploy job is a server effect");
    assert(prod.vector.productionPromotion, "params.prod true is production promotion");
    assert(prod.nested.includes("production-promotion"), "promotion must be in the nested closure");
    const prodHold = assessExpoEasPreflight({
      discovery,
      commandId: "eas.workflow.run",
      target: selectedTarget({ grantedAuthority: "publish", allowWorkflowTriggers: true }),
      project: prodProject,
      closure: prod,
    });
    assert(prod.requiredAuthority === "promote", prod.requiredAuthority);
    assert(prodHold.status === "hold", prodHold.status);
    assert(prodHold.code === "authority-missing" || prodHold.code === "nested-effect-ungranted", prodHold.code);
    const unknownProject = inspectExpoProject(writeFakeApp(harness.makeTempDir("unknown-job"), { workflow: UNKNOWN_JOB_WORKFLOW }));
    const unknown = inspectCommandEffects(unknownProject, { commandId: "eas.workflow.run", workflowRelativePath: ".eas/workflows/ship.yml" });
    assert(unknown.workflow?.hasUnknownJobTypes, "maestro is an unknown job type");
    const unknownHold = assessExpoEasPreflight({
      discovery,
      commandId: "eas.workflow.run",
      target: selectedTarget({ grantedAuthority: "promote", allowWorkflowTriggers: true }),
      project: unknownProject,
      closure: unknown,
    });
    assert(unknownHold.code === "workflow-parse", unknownHold.code);
    assert(unknownHold.status === "hold", unknownHold.status);
  });

  harness.check("expo-eas: invalid JSON, expired artifact, and --latest cannot prove success", () => {
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    ledger.record(
      "k1",
      {
        sourceFingerprint: "a".repeat(64),
        profile: "preview",
        platform: "ios",
        environment: "preview",
        artifactKind: "store",
        commandId: "eas.build.cloud",
      },
      { remoteId: "b1", state: "finished", artifactUrl: "expired" },
    );
    assert(ledger.get("k1")?.state === "finished", "finished is stored");
    assert(isSuccessfulBuild(ledger.get("k1")) === false, "expired artifact is not success");
    let latest = false;
    try {
      buildExpoEasArgv({ operationId: "eas.submit", platform: "ios", profile: "preview", hostAuthorityGranted: true });
    } catch (error) {
      latest = error instanceof ExpoArgvRefusal && error.code === "missing-build-id";
    }
    assert(latest, "submit without an explicit build id is refused; --latest is not used");
    const ios = interpretSubmitOutcome({ platform: "ios", easStatus: "finished" });
    assert(ios.released === false && ios.stage === "uploaded-binary", ios.notes);
    const play = interpretSubmitOutcome({ platform: "android", easStatus: "finished", json: { track: "production" } });
    assert(play.released === false && play.stage === "submitted-for-review", play.notes);
    const bad = interpretSubmitOutcome({ platform: "ios", json: "not-json" });
    assert(bad.stage === "compiled-artifact", "partial status is not upload proof");
  });

  harness.check("expo-eas: secrets stay out of argv and sanitized logs; two workspaces keep separate ledgers", () => {
    const token = "expo-secret-token-xyz";
    const argv = buildExpoEasArgv({
      operationId: "eas.build.cloud",
      platform: "ios",
      profile: "preview",
      hostAuthorityGranted: true,
    });
    assert(!argv.includes(token), "token is not an argv value");
    assert(argv.includes("--non-interactive"), "documented non-interactive may be added after authority");
    assert(argv.includes("--freeze-credentials"), "non-interactive build must freeze credentials");
    assert(argv.includes("--no-wait"), "persist the job id instead of blocking");
    const env = buildExpoProcessEnv({ isolatedHome: "/tmp/fake-home-a", pathValue: "/opt/fake/bin", expoToken: token });
    assert(env.EXPO_TOKEN === token, "token lives in isolated env");
    assert(env.HOME === "/tmp/fake-home-a", "homes are isolated");
    const leaked = sanitizeExpoProcessText(`EXPO_TOKEN=${token} Bearer ${token} download?access_token=${token}`);
    assert(!leaked.includes(token), leaked);
    assert(redactExpoArgv(["--token", token])[1] === "<redacted>", "token flags redact");
    const a = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const b = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    a.record(
      "same-key",
      { sourceFingerprint: "1", profile: "preview", platform: "ios", environment: "preview", artifactKind: "device", commandId: "eas.build.cloud" },
      { remoteId: "build_a", state: "queued" },
    );
    b.record(
      "same-key",
      { sourceFingerprint: "2", profile: "preview", platform: "ios", environment: "preview", artifactKind: "device", commandId: "eas.build.cloud" },
      { remoteId: "build_b", state: "queued" },
    );
    assert(a.get("same-key")?.remoteId === "build_a", "workspace A keeps its job");
    assert(b.get("same-key")?.remoteId === "build_b", "workspace B keeps its job");
  });

  harness.check("expo-eas: trusted executable only; hosted knowledge does not import the executor", () => {
    let relative = false;
    try {
      assertTrustedExpoProcessRequest({
        executable: "npx",
        argv: ["eas-cli@latest", "build"],
        cwd: "/tmp",
        env: {},
        timeoutMs: 1000,
      });
    } catch (error) {
      relative = error instanceof ExpoProcessRefusal && (error.code === "relative-executable" || error.code === "denied-launcher");
    }
    assert(relative, "npx / @latest must be refused");
    const hostedRoot = path.join(skillRoot, "hosted/knowledge-mcp");
    const knowledgeRoot = path.join(skillRoot, "kernel/knowledge-service");
    for (const root of [hostedRoot, knowledgeRoot]) {
      const hits = walkTs(root).filter((file) => {
        const text = readFileSync(file, "utf8");
        return text.includes("adapters/providers/expo") || text.includes("runExpoEasCommand");
      });
      assert(hits.length === 0, `knowledge/hosted must not import Expo process execution: ${hits.join(", ")}`);
    }
    assert(existsSync(path.join(skillRoot, EXPO_EAS_COMMAND_MATRIX_PATH)), "matrix path is the handoff artifact");
  });

  harness.check("expo-eas: #82 CNG is fixture-tested when selected; official-skills stay blocked; #84 rows become fixture-tested only when selected", () => {
    const selected = resolveExpoSelection({ compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME } });
    assert(operationFor(selected, "cng-prebuild").evidenceTier === "fixture-tested", "selected CNG classification is fixture-tested for #82");
    assert(operationFor(selected, "expo-web-export").evidenceTier === "fixture-tested", "local static export is fixture-tested for #86");
    assert(operationFor(selected, "eas-hosting").evidenceTier === "blocked", "EAS Hosting stays blocked for #86");
    assert(operationFor(selected, "official-skills").evidenceTier === "blocked", "official skills stay blocked for #87");
    assert(operationFor(selected, "eas-update").evidenceTier === "blocked", "OTA stays blocked for #85");
    assert(operationFor(selected, "eas-cloud-build").evidenceTier === "blocked", "unselected EAS cloud stays blocked");
    const withEas = resolveExpoSelection({
      compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME },
      selectedServices: ["expo-cli", "eas-cli", "eas-build", "eas-submit", "eas-workflows"],
    });
    assert(operationFor(withEas, "eas-cloud-build").queuedIssue === 84, "cloud build remains #84");
    assert(operationFor(withEas, "eas-cloud-build").evidenceTier === "fixture-tested", "selected EAS cloud process/job layer is fixture-tested");
    assert(operationFor(withEas, "eas-local-build").evidenceTier === "fixture-tested", "local EAS classification is fixture-tested");
    assert(operationFor(withEas, "eas-workflows").evidenceTier === "fixture-tested", "workflow effect closure is fixture-tested");
    assert(operationFor(withEas, "store-handoff").evidenceTier === "fixture-tested", "store stage boundary is fixture-tested");
    assert(operationFor(withEas, "expo-cli-process").evidenceTier === "fixture-tested", "typed Expo CLI argv is fixture-tested");
    assert(operationFor(withEas, "direct-local-compile").evidenceTier === "fixture-tested", "host-mode compile classification is fixture-tested");
    assert(operationFor(withEas, "cng-prebuild").evidenceTier === "fixture-tested", "rebase keeps selected CNG fixture-tested");
  });
}

function walkTs(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const name of readdirSync(current, { withFileTypes: true })) {
      if (name.name === "node_modules" || name.name === "dist" || name.name === ".wrangler") continue;
      const next = path.join(current, name.name);
      if (name.isDirectory()) stack.push(next);
      else if (name.name.endsWith(".ts") || name.name.endsWith(".js") || name.name.endsWith(".mjs")) out.push(next);
    }
  }
  return out;
}
