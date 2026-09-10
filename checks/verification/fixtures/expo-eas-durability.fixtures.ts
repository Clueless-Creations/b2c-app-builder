/**
 * #106 EAS request identity and pre-dispatch durability. Fake processes only.
 * Fresh-process recovery loads a new ledger from disk. No live/paid EAS.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXPO_APP_RUNTIME } from "../../../catalog/stacks/expo-selection.js";
import {
  EasJobLedger,
  createFakeEasJobTransport,
  discoverExpoCli,
  easJobClaimPath,
  easJobLedgerPath,
  releaseEasJobClaim,
  tryAcquireEasJobClaim,
  fingerprintEasUploadInputs,
  isolatedConfigHome,
  runExpoEasCommand,
  type ExpoEasTarget,
  type ExpoProcessRequest,
  type ExpoProcessResult,
  type ExpoProcessRunner,
} from "../../../adapters/providers/expo/index.js";
import { assert, type Harness } from "./_harness.js";

function ok(stdout: string, status = 0): ExpoProcessResult {
  return { stdout, stderr: "", status, timedOut: false, truncated: false, cancelled: false, signal: null };
}

function queuedBuild(id: string): string {
  return JSON.stringify([{ id, status: "IN_QUEUE", platform: "IOS", buildProfile: "preview", app: { id: "proj_approved" } }]);
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

function writeFakeApp(root: string): string {
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fake-expo-app" }, null, 2));
  writeFileSync(path.join(root, "app.json"), JSON.stringify({ expo: { extra: { eas: { projectId: "proj_approved" } } } }, null, 2));
  writeFileSync(path.join(root, "eas.json"), JSON.stringify({ build: { preview: { distribution: "internal" } }, submit: { preview: {} } }, null, 2));
  writeFileSync(path.join(root, ".easignore"), "secrets/\n");
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

function trustedDiscovery(harness: Harness) {
  const { run } = recordingRunner((request) => {
    if (request.argv[0] === "--version") return ok("eas-cli/23.2.0 23.2.0\n");
    return ok("{}");
  });
  return discoverExpoCli({
    kind: "eas",
    isolatedHome: isolatedConfigHome(harness.makeTempDir("eas-home"), "ws-a"),
    cwd: harness.makeTempDir("eas-cwd"),
    pathEnv: "/opt/fake/bin",
    probeExecutables: (command) =>
      command === "eas" || command === "eas-cli" ? [{ path: `/opt/fake/bin/${command === "eas-cli" ? "eas" : command}`, pathOrder: 0 }] : [],
    run,
  });
}

export function register(harness: Harness): void {
  harness.check("expo-eas-durability: changed binding field with the same key is request-identity-conflict", () => {
    const cwd = writeFakeApp(harness.makeTempDir("identity-conflict"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("identity-conflict-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_paid")));
    const base = {
      operationId: "eas.build.cloud" as const,
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios" as const,
      profile: "preview",
      idempotencyKey: "build-k",
      ledger,
      jobTransport: createFakeEasJobTransport(),
    };
    const first = runExpoEasCommand({ ...base, environment: "preview", artifactKind: "device" });
    assert(first.invoked, "first dispatch may spawn");
    assert(first.remoteId === "build_paid", first.remoteId ?? "");
    const second = runExpoEasCommand({ ...base, environment: "production", artifactKind: "device" });
    assert(second.invoked === false, "changed environment must not spawn");
    assert(second.preflight.code === "request-identity-conflict", second.preflight.code);
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
    const runtime = runExpoEasCommand({ ...base, environment: "preview", artifactKind: "device", runtimeVersion: "1.0.0" });
    assert(runtime.preflight.code === "request-identity-conflict", runtime.preflight.code);
    assert(calls.length === 1, "runtimeVersion change must not spawn");
    const kind = runExpoEasCommand({ ...base, environment: "preview", artifactKind: "store" });
    assert(kind.preflight.code === "request-identity-conflict", kind.preflight.code);
    assert(calls.length === 1, "artifactKind change must not spawn");
  });

  harness.check("expo-eas-durability: tsx, lockfile, plugin, native, and workflow changes alter source identity", () => {
    const cwd = writeFakeApp(harness.makeTempDir("source-identity"));
    const baseline = fingerprintEasUploadInputs(cwd);
    const easJson = readFileSync(path.join(cwd, "eas.json"), "utf8");
    writeFileSync(path.join(cwd, "eas.json"), easJson);
    assert(fingerprintEasUploadInputs(cwd) === baseline, "rewriting eas.json identically must not change digest");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "Screen.tsx"), "export const Screen = () => null;\n");
    const afterTsx = fingerprintEasUploadInputs(cwd);
    assert(afterTsx !== baseline, "application tsx must change upload identity");
    writeFileSync(path.join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
    const afterLock = fingerprintEasUploadInputs(cwd);
    assert(afterLock !== afterTsx, "lockfile must change upload identity");
    mkdirSync(path.join(cwd, "plugins"), { recursive: true });
    writeFileSync(path.join(cwd, "plugins", "withFoo.js"), "module.exports = (c) => c;\n");
    const afterPlugin = fingerprintEasUploadInputs(cwd);
    assert(afterPlugin !== afterLock, "config plugin must change upload identity");
    mkdirSync(path.join(cwd, "ios"), { recursive: true });
    writeFileSync(path.join(cwd, "ios", "Info.plist"), "<plist></plist>\n");
    const afterNative = fingerprintEasUploadInputs(cwd);
    assert(afterNative !== afterPlugin, "native project files must change upload identity");
    mkdirSync(path.join(cwd, ".eas", "workflows"), { recursive: true });
    writeFileSync(path.join(cwd, ".eas", "workflows", "ship.yml"), "name: ship\njobs: {}\n");
    const afterWorkflow = fingerprintEasUploadInputs(cwd);
    assert(afterWorkflow !== afterNative, "workflow definition must change upload identity");
    mkdirSync(path.join(cwd, "secrets"), { recursive: true });
    writeFileSync(path.join(cwd, "secrets", "token.txt"), "super-secret\n");
    assert(fingerprintEasUploadInputs(cwd) === afterWorkflow, "ignored secrets must not change upload identity");
    mkdirSync(path.join(cwd, "node_modules", "left-pad"), { recursive: true });
    writeFileSync(path.join(cwd, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
    assert(fingerprintEasUploadInputs(cwd) === afterWorkflow, "node_modules cache must not change upload identity");
  });

  harness.check("expo-eas-durability: same key after a tsx-only source change is request-identity-conflict", () => {
    const cwd = writeFakeApp(harness.makeTempDir("tsx-conflict"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("tsx-conflict-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_tsx")));
    const request = {
      operationId: "eas.build.cloud" as const,
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios" as const,
      profile: "preview",
      idempotencyKey: "build-tsx",
      ledger,
      jobTransport: createFakeEasJobTransport(),
    };
    const first = runExpoEasCommand(request);
    assert(first.invoked, "first dispatch may spawn");
    mkdirSync(path.join(cwd, "src"), { recursive: true });
    writeFileSync(path.join(cwd, "src", "Home.tsx"), "export const Home = () => null;\n");
    const second = runExpoEasCommand(request);
    assert(second.invoked === false, "tsx change must not reuse or dispatch");
    assert(second.preflight.code === "request-identity-conflict", second.preflight.code);
    assert(second.remoteId === undefined, "mismatched identity must not present the old job as this request's result");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
  });

  harness.check("expo-eas-durability: crash after bind before spawn recovers in a new process without a second paid start", () => {
    const cwd = writeFakeApp(harness.makeTempDir("crash-before-spawn"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("crash-before-spawn-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const file = easJobLedgerPath(cwd);
    const firstLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_paid")));
    let persistCount = 0;
    let crashed = false;
    try {
      runExpoEasCommand({
        operationId: "eas.build.cloud",
        executable: "/opt/fake/bin/eas",
        cwd,
        isolatedHome,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        platform: "ios",
        profile: "preview",
        idempotencyKey: "crash-bind",
        ledger: firstLedger,
        jobTransport: createFakeEasJobTransport(),
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
    assert(calls.length === 0, `bind crash must happen before spawn, got ${calls.length}`);
    const recovered = EasJobLedger.load(file, { now: () => "2026-09-09T00:00:01.000Z" });
    assert(recovered.get("crash-bind")?.state === "uncertain", recovered.get("crash-bind")?.state ?? "");
    assert(recovered.get("crash-bind")?.remoteId === undefined, "no remote id yet");
    const { run: resumeRun, calls: resumeCalls } = recordingRunner(() => ok(queuedBuild("build_duplicate")));
    const resume = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: resumeRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "crash-bind",
      ledger: recovered,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(resume.invoked === false, "fresh process must not treat missing completion as permission to build again");
    assert(resume.preflight.code === "mutation-uncertain", resume.preflight.code);
    assert(resume.uncertainRemote, "dispatched-unconfirmed stays held");
    assert(resumeCalls.length === 0, `expected zero resume spawns, got ${resumeCalls.length}`);
  });

  harness.check("expo-eas-durability: crash after remote accept before observation persist holds in a new process", () => {
    const cwd = writeFakeApp(harness.makeTempDir("crash-after-accept"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("crash-after-accept-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const file = easJobLedgerPath(cwd);
    const firstLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_accepted")));
    let persistCount = 0;
    let crashed = false;
    try {
      runExpoEasCommand({
        operationId: "eas.build.cloud",
        executable: "/opt/fake/bin/eas",
        cwd,
        isolatedHome,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        platform: "ios",
        profile: "preview",
        idempotencyKey: "crash-accept",
        ledger: firstLedger,
        jobTransport: createFakeEasJobTransport(),
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
    assert(calls.length === 1, `remote accept happened once, got ${calls.length}`);
    const recovered = EasJobLedger.load(file, { now: () => "2026-09-09T00:00:01.000Z" });
    assert(recovered.get("crash-accept")?.remoteId === undefined, "observation was not durable");
    const { run: resumeRun, calls: resumeCalls } = recordingRunner(() => ok(queuedBuild("build_duplicate")));
    const resume = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: resumeRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "crash-accept",
      ledger: recovered,
      jobTransport: createFakeEasJobTransport({ jobs: { build_accepted: { state: "running" } } }),
    });
    assert(resume.invoked === false, "unknown remote acceptance is not no effect");
    assert(resume.preflight.code === "mutation-uncertain", resume.preflight.code);
    assert(resumeCalls.length === 0, `expected zero resume spawns, got ${resumeCalls.length}`);
  });

  harness.check("expo-eas-durability: queued receipt advances by readback without a second build", () => {
    const cwd = writeFakeApp(harness.makeTempDir("queued-refresh"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("queued-refresh-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const transport = createFakeEasJobTransport();
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_queued")));
    const first = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-queued",
      ledger,
      jobTransport: transport,
    });
    assert(first.jobState === "queued", first.jobState ?? "");
    transport.setJob("build_queued", { state: "running" });
    const running = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-queued",
      ledger,
      jobTransport: transport,
    });
    assert(running.invoked === false, "queued re-entry must not spawn");
    assert(running.jobState === "running", running.jobState ?? "");
    transport.setJob("build_queued", { state: "finished", artifactUrl: "artifact:fake-ipa" });
    const finished = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-queued",
      ledger,
      jobTransport: transport,
    });
    assert(finished.invoked === false, "finished re-entry must not spawn");
    assert(finished.jobState === "finished", finished.jobState ?? "");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
    assert(transport.reads.includes("build_queued"), "must observe the stored id");
  });

  harness.check("expo-eas-durability: concurrent re-entry during spawn does not start a second paid build", () => {
    const cwd = writeFakeApp(harness.makeTempDir("concurrent-entry"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("concurrent-entry-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const ledger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const transport = createFakeEasJobTransport();
    let nestedInvoked: boolean | undefined;
    let nestedCode: string | undefined;
    const { run, calls } = recordingRunner(() => {
      const nested = runExpoEasCommand({
        operationId: "eas.build.cloud",
        executable: "/opt/fake/bin/eas",
        cwd,
        isolatedHome,
        pathEnv: "/opt/fake/bin",
        run: () => ok(queuedBuild("build_nested")),
        discovery,
        target: selectedTarget(),
        platform: "ios",
        profile: "preview",
        idempotencyKey: "build-concurrent",
        ledger,
        jobTransport: transport,
      });
      nestedInvoked = nested.invoked;
      nestedCode = nested.preflight.code;
      return ok(queuedBuild("build_concurrent"));
    });
    const first = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-concurrent",
      ledger,
      jobTransport: transport,
    });
    assert(first.invoked, "outer dispatch may spawn");
    assert(first.remoteId === "build_concurrent", first.remoteId ?? "");
    assert(nestedInvoked === false, "inner concurrent entry must not spawn");
    assert(nestedCode === "mutation-uncertain", nestedCode ?? "");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
  });

  harness.check("expo-eas-durability: second ledger instance hydrates dispatched intent from disk", () => {
    const cwd = writeFakeApp(harness.makeTempDir("hydrate-instance"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("hydrate-instance-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const file = easJobLedgerPath(cwd);
    const firstLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_disk")));
    const first = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-disk",
      ledger: firstLedger,
      ledgerPath: file,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(first.remoteId === "build_disk", first.remoteId ?? "");
    const secondLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:02.000Z" });
    const { run: secondRun, calls: secondCalls } = recordingRunner(() => ok(queuedBuild("build_other")));
    const transport = createFakeEasJobTransport({ jobs: { build_disk: { state: "finished", artifactUrl: "artifact:fake-ipa" } } });
    const second = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run: secondRun,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-disk",
      ledger: secondLedger,
      ledgerPath: file,
      jobTransport: transport,
    });
    assert(second.invoked === false, "hydrated ledger must not spawn");
    assert(second.jobState === "finished", second.jobState ?? "");
    assert(calls.length === 1, `first instance spawned once, got ${calls.length}`);
    assert(secondCalls.length === 0, `second instance must not spawn, got ${secondCalls.length}`);
  });

  harness.check("expo-eas-durability: two empty ledgers racing under one key do not both spawn", () => {
    const cwd = writeFakeApp(harness.makeTempDir("two-process-race"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("two-process-race-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const file = easJobLedgerPath(cwd);
    const firstLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    const secondLedger = new EasJobLedger({ now: () => "2026-09-09T00:00:00.000Z" });
    let nestedInvoked: boolean | undefined;
    let nestedCode: string | undefined;
    const { run, calls } = recordingRunner(() => {
      const nested = runExpoEasCommand({
        operationId: "eas.build.cloud",
        executable: "/opt/fake/bin/eas",
        cwd,
        isolatedHome,
        pathEnv: "/opt/fake/bin",
        run: () => ok(queuedBuild("build_nested_race")),
        discovery,
        target: selectedTarget(),
        platform: "ios",
        profile: "preview",
        idempotencyKey: "build-race",
        ledger: secondLedger,
        ledgerPath: file,
        jobTransport: createFakeEasJobTransport(),
      });
      nestedInvoked = nested.invoked;
      nestedCode = nested.preflight.code;
      return ok(queuedBuild("build_race"));
    });
    const first = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "build-race",
      ledger: firstLedger,
      ledgerPath: file,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(first.invoked, "winner may spawn");
    assert(first.remoteId === "build_race", first.remoteId ?? "");
    assert(nestedInvoked === false, "loser must not spawn");
    assert(nestedCode === "mutation-uncertain", nestedCode ?? "");
    assert(calls.length === 1, `expected one spawn, got ${calls.length}`);
  });

  harness.check("expo-eas-durability: dead-pid claim is stolen and does not permanently block dispatch", () => {
    const cwd = writeFakeApp(harness.makeTempDir("stale-claim"));
    const isolatedHome = isolatedConfigHome(harness.makeTempDir("stale-claim-home"), "ws-a");
    const discovery = trustedDiscovery(harness);
    const file = easJobLedgerPath(cwd);
    const claimPath = easJobClaimPath(file, "stale-claim");
    mkdirSync(path.dirname(claimPath), { recursive: true });
    writeFileSync(
      claimPath,
      `${JSON.stringify({ schemaVersion: "b2c.eas-job-claim/v1", pid: 999999999, idempotencyKey: "stale-claim", at: "2026-09-09T00:00:00.000Z" })}\n`,
    );
    const { run, calls } = recordingRunner(() => ok(queuedBuild("build_stale")));
    const result = runExpoEasCommand({
      operationId: "eas.build.cloud",
      executable: "/opt/fake/bin/eas",
      cwd,
      isolatedHome,
      pathEnv: "/opt/fake/bin",
      run,
      discovery,
      target: selectedTarget(),
      platform: "ios",
      profile: "preview",
      idempotencyKey: "stale-claim",
      ledger: new EasJobLedger({ now: () => "2026-09-09T00:00:01.000Z" }),
      ledgerPath: file,
      jobTransport: createFakeEasJobTransport(),
    });
    assert(result.invoked, "stale claim must not permanently block a first paid dispatch");
    assert(result.remoteId === "build_stale", result.remoteId ?? "");
    assert(calls.length === 1, `expected one spawn after stealing a dead claim, got ${calls.length}`);
  });

  harness.check("expo-eas-durability: unparseable claim files are stolen and do not permanently block dispatch", () => {
    const residues: ReadonlyArray<{ readonly label: string; readonly contents: string }> = [
      { label: "empty", contents: "" },
      { label: "truncated", contents: "{" },
      { label: "wrong-schema", contents: `${JSON.stringify({ schemaVersion: "not-a-claim", pid: 1, idempotencyKey: "corrupt-claim", at: "2026-09-09T00:00:00.000Z" })}\n` },
    ];
    for (const residue of residues) {
      const cwd = writeFakeApp(harness.makeTempDir(`corrupt-claim-${residue.label}`));
      const isolatedHome = isolatedConfigHome(harness.makeTempDir(`corrupt-claim-${residue.label}-home`), "ws-a");
      const discovery = trustedDiscovery(harness);
      const file = easJobLedgerPath(cwd);
      const claimPath = easJobClaimPath(file, `corrupt-${residue.label}`);
      mkdirSync(path.dirname(claimPath), { recursive: true });
      writeFileSync(claimPath, residue.contents);
      const acquired = tryAcquireEasJobClaim(claimPath, `corrupt-${residue.label}`, () => "2026-09-09T00:00:00.000Z");
      assert(acquired.ok, `${residue.label} claim residue must be stolen, not held`);
      releaseEasJobClaim(claimPath);
      writeFileSync(claimPath, residue.contents);
      const { run, calls } = recordingRunner(() => ok(queuedBuild(`build_corrupt_${residue.label}`)));
      const result = runExpoEasCommand({
        operationId: "eas.build.cloud",
        executable: "/opt/fake/bin/eas",
        cwd,
        isolatedHome,
        pathEnv: "/opt/fake/bin",
        run,
        discovery,
        target: selectedTarget(),
        platform: "ios",
        profile: "preview",
        idempotencyKey: `corrupt-${residue.label}`,
        ledger: new EasJobLedger({ now: () => "2026-09-09T00:00:01.000Z" }),
        ledgerPath: file,
        jobTransport: createFakeEasJobTransport(),
      });
      assert(result.invoked, `${residue.label} claim residue must not permanently block a first paid dispatch`);
      assert(result.remoteId === `build_corrupt_${residue.label}`, result.remoteId ?? "");
      assert(calls.length === 1, `${residue.label}: expected one spawn after stealing a corrupt claim, got ${calls.length}`);
    }
  });

  harness.check("expo-eas-durability: a live foreign process cannot wx-create the same claim file", () => {
    const cwd = writeFakeApp(harness.makeTempDir("foreign-claim"));
    const file = easJobLedgerPath(cwd);
    const claimPath = easJobClaimPath(file, "foreign-claim");
    const acquired = tryAcquireEasJobClaim(claimPath, "foreign-claim", () => "2026-09-09T00:00:00.000Z");
    assert(acquired.ok, "parent must hold the exclusive claim");
    const child = spawnSync(process.execPath, ["-e", `const fs = require("fs"); try { fs.openSync(${JSON.stringify(claimPath)}, "wx"); process.exit(2); } catch (error) { process.exit(error && error.code === "EEXIST" ? 0 : 1); }`], {
      encoding: "utf8",
    });
    assert(child.status === 0, `foreign process must see EEXIST, got status ${child.status} stderr=${child.stderr}`);
    releaseEasJobClaim(claimPath);
  });
}
