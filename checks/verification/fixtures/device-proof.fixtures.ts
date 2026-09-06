import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, type Harness } from "./_harness.js";
import { laneKeys, type BusinessStateV2, type Lane, type LaneKey } from "../../../kernel/schema/types.js";
import { selectProofRung, type ProofEnvironmentProbe } from "../../../kernel/engine/proof-rung.js";
import {
  createFixtureDeviceProofAdapter,
  createMobaiCliAdapter,
  createXcodebuildSimulatorAdapter,
  inspectAndroidApk,
  inspectMobaiDevice,
  probeDeviceProofEnvironment,
  type DeviceProofStep,
  type DeviceProofFlowInput,
  type MobaiDeviceIdentity,
} from "../../../adapters/device-proof.js";
import type { SpawnResult } from "../../../adapters/profile.js";
import type { DeviceProofSpawnOptions } from "../../../adapters/device-proof.js";
import { iosSimulatorCommandTranscriptSchema } from "../../../adapters/ios-app-evidence.js";
import { deriveProofVerdict, resolveProofAdapter, resolveProofFlow, resolveProofOutputTarget } from "../../../kernel/session/proof.js";

/**
 * #36 device-proof fixtures: `selectProofRung`'s branches (kernel/engine/proof-rung.ts), the three
 * adapters (adapters/device-proof.ts), and `deriveProofVerdict` (kernel/session/proof.ts) —
 * all pure or SpawnFn-injected, so nothing here ever touches a real simulator, a real device, or
 * the network. The end-to-end `b2c proof` CLI invocation lives in cli.fixtures.ts; the MCP
 * `b2c_run` mode:"proof" passthrough lives in mcp.fixtures.ts — this file stays at the unit level.
 */

function fakeSpawn(
  status: number | null,
  stdout: string,
  stderr: string,
  error?: NodeJS.ErrnoException,
): (command: string, args: readonly string[]) => SpawnResult {
  return () => ({ status, stdout, stderr, error });
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error("spawn ENOENT") as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}

function minimalBusinessState(platforms: Array<"ios" | "android">, providers?: BusinessStateV2["providers"]): Pick<BusinessStateV2, "project" | "providers"> {
  const lanes = {} as Record<LaneKey, Lane>;
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    project: {
      name: "fixture",
      slug: "fixture",
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms,
      bundleIds: { ios: "com.example.app", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    providers,
  };
}

const AVAILABLE_PROBE: ProofEnvironmentProbe = { platform: "darwin", xcodebuildAvailable: true, simctlAvailable: true, mobaiAvailable: true };
const NOTHING_AVAILABLE_PROBE: ProofEnvironmentProbe = { platform: "linux", xcodebuildAvailable: false, simctlAvailable: false, mobaiAvailable: false };

const DEVICE_ID = "403BC147-3C20-49C2-8F72-4F2252B02065";

function simulatorFixture(
  harness: Harness,
  name: string,
  options: {
    fail?: string;
    alreadyBooted?: boolean;
    products?: "missing" | "ambiguous" | "escaped";
    deviceMatches?: number;
    omitBinary?: boolean;
    oldInstalledBinary?: boolean;
    oldInstalledLibrary?: boolean;
    wrongBuiltMetadata?: boolean;
    wrongInstalledMetadata?: boolean;
    changedSource?: boolean;
  } = {},
) {
  const workspaceDir = harness.makeTempDir(name);
  const sourceRoot = path.join(workspaceDir, "ios");
  const projectPath = path.join(sourceRoot, "App.xcodeproj");
  const installedApp = path.join(workspaceDir, "simulator", "App.app");
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(path.join(projectPath, "project.pbxproj"), "test project");
  writeFileSync(path.join(sourceRoot, "App.swift"), "test source");
  const calls: string[][] = [];
  let builtApp = "";
  const spawn = (command: string, args: readonly string[]): SpawnResult => {
    calls.push([command, ...args]);
    const action = command === "xcodebuild" ? (args.includes("-showBuildSettings") ? "settings" : "build") : args[1];
    if (action === options.fail) return { status: 1, stdout: "", stderr: `${action} failed` };
    if (action === "list")
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          devices: { "iOS 26.5": Array.from({ length: options.deviceMatches ?? 1 }, () => ({ name: "iPhone 17", udid: DEVICE_ID, isAvailable: true })) },
        }),
      };
    if (action === "boot" && options.alreadyBooted) return { status: 1, stdout: "", stderr: "Unable to boot device in current state: Booted" };
    if (action === "settings") {
      const derivedData = args[args.indexOf("-derivedDataPath") + 1]!;
      const buildDirectory = path.join(derivedData, "Build", "Products", "Debug-iphonesimulator");
      builtApp = path.join(buildDirectory, "App.app");
      const target = {
        target: "App",
        buildSettings: {
          PRODUCT_BUNDLE_IDENTIFIER: "com.example.app",
          CURRENT_PROJECT_VERSION: "42",
          FULL_PRODUCT_NAME: "App.app",
          EXECUTABLE_PATH: "App.app/App",
          INFOPLIST_PATH: "App.app/Info.plist",
          TARGET_BUILD_DIR: options.products === "escaped" ? workspaceDir : buildDirectory,
          SRCROOT: sourceRoot,
        },
      };
      return {
        status: 0,
        stderr: "",
        stdout: JSON.stringify(options.products === "missing" ? [] : options.products === "ambiguous" ? [target, target] : [target]),
      };
    }
    if (action === "build" && !options.omitBinary) {
      mkdirSync(builtApp, { recursive: true });
      writeFileSync(path.join(builtApp, "App"), "fresh executable");
      writeFileSync(path.join(builtApp, "App.debug.dylib"), "fresh app code");
      writeFileSync(
        path.join(builtApp, "Info.plist"),
        `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.app</string><key>CFBundleVersion</key><string>${options.wrongBuiltMetadata ? "41" : "42"}</string><key>CFBundleExecutable</key><string>App</string></dict></plist>`,
      );
      if (options.changedSource) writeFileSync(path.join(sourceRoot, "App.swift"), "changed during build");
    }
    if (action === "install") {
      cpSync(builtApp, installedApp, { recursive: true });
      if (options.oldInstalledBinary) writeFileSync(path.join(installedApp, "App"), "older installed executable");
      if (options.oldInstalledLibrary) writeFileSync(path.join(installedApp, "App.debug.dylib"), "older app code with identical launcher");
      if (options.wrongInstalledMetadata)
        writeFileSync(
          path.join(installedApp, "Info.plist"),
          '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.app</string><key>CFBundleVersion</key><string>41</string><key>CFBundleExecutable</key><string>App</string></dict></plist>',
        );
    }
    if (action === "get_app_container") return { status: 0, stderr: "", stdout: `${installedApp}\n` };
    return { status: 0, stdout: "", stderr: "" };
  };
  const input: DeviceProofFlowInput = {
    workspaceDir,
    deviceName: DEVICE_ID,
    projectPath,
    bundleId: "com.example.app",
    outputDir: path.join(workspaceDir, "proof", "ios-simulator"),
  };
  return { input, calls, spawn, installedApp };
}

export function register(harness: Harness): void {
  // --- selectProofRung: the branches the Route Ladder table names ----------------------------

  harness.check("proof-rung: iOS on a local macOS session with Xcode tools present selects rung-2-xcodebuild", () => {
    const decision = selectProofRung(minimalBusinessState(["ios"]), AVAILABLE_PROBE);
    assert(decision.rung === "rung-2-xcodebuild", `expected rung-2-xcodebuild, got ${decision.rung}: ${decision.reason}`);
    assert(decision.reason.length > 0, "every decision must carry a non-empty reason");
  });

  harness.check("proof-rung: iOS declared but this process is not on macOS blocks with a plain reason naming macOS", () => {
    const decision = selectProofRung(minimalBusinessState(["ios"]), { ...AVAILABLE_PROBE, platform: "linux" });
    assert(decision.rung === "blocked", `expected blocked, got ${decision.rung}`);
    assert(/macOS/.test(decision.reason), `blocked reason should name the macOS requirement, got: ${decision.reason}`);
  });

  harness.check("proof-rung: iOS on macOS but Xcode command line tools are missing blocks and names Xcode", () => {
    const decision = selectProofRung(minimalBusinessState(["ios"]), { ...AVAILABLE_PROBE, xcodebuildAvailable: false });
    assert(decision.rung === "blocked", `expected blocked, got ${decision.rung}`);
    assert(/Xcode/.test(decision.reason), `blocked reason should name Xcode tooling, got: ${decision.reason}`);
  });

  harness.check("proof-rung: android declared selects rung-4-mobai when the mobai CLI is available", () => {
    const decision = selectProofRung(minimalBusinessState(["android"]), AVAILABLE_PROBE);
    assert(decision.rung === "rung-4-mobai", `expected rung-4-mobai, got ${decision.rung}: ${decision.reason}`);
  });

  harness.check("proof-rung: android declared but the mobai CLI is not on PATH blocks and names mobai", () => {
    const decision = selectProofRung(minimalBusinessState(["android"]), { ...AVAILABLE_PROBE, mobaiAvailable: false });
    assert(decision.rung === "blocked", `expected blocked, got ${decision.rung}`);
    assert(/mobai/i.test(decision.reason), `blocked reason should name the mobai CLI, got: ${decision.reason}`);
  });

  harness.check("proof-rung: mixed scope requires one exact platform and selects both branches independently", () => {
    const state = minimalBusinessState(["ios", "android"]);
    const unresolved = selectProofRung(state, AVAILABLE_PROBE);
    assert(unresolved.rung === "blocked", `mixed scope without --platform must block, got ${unresolved.rung}`);
    assert(
      /--platform ios/.test(unresolved.reason) && /--platform android/.test(unresolved.reason),
      `mixed blocker must name both invocations: ${unresolved.reason}`,
    );

    const ios = selectProofRung(state, AVAILABLE_PROBE, "ios");
    assert(ios.rung === "rung-2-xcodebuild", `mixed iOS target must select Xcode, got ${ios.rung}: ${ios.reason}`);
    const android = selectProofRung(state, AVAILABLE_PROBE, "android");
    assert(android.rung === "rung-4-mobai", `mixed Android target must select MobAI, got ${android.rung}: ${android.reason}`);
  });

  harness.check("proof-rung: a requested platform outside declared scope blocks", () => {
    const decision = selectProofRung(minimalBusinessState(["ios"]), AVAILABLE_PROBE, "android");
    assert(decision.rung === "blocked", `undeclared Android target must block, got ${decision.rung}`);
    assert(/not declared/.test(decision.reason), `mismatch reason must name the state contract: ${decision.reason}`);
  });

  harness.check(
    'proof-rung: an explicit MobAI provider selection (a real accessRoute, not "not_selected") on an iOS-only business still routes to rung-4-mobai over rung-2',
    () => {
      const state = minimalBusinessState(["ios"], { mobai: { accessRoute: "cli", selected_tier: "pro" } });
      const decision = selectProofRung(state, AVAILABLE_PROBE);
      assert(
        decision.rung === "rung-4-mobai",
        `an explicit mobai selection must win even when iOS/Xcode is also available, got ${decision.rung}: ${decision.reason}`,
      );
    },
  );

  harness.check("proof-rung: provider-specific configuration does not grant selection without accessRoute", () => {
    const state = minimalBusinessState(["ios"], { mobai: { accessRoute: "not_selected", selected_tier: "pro" } });
    const decision = selectProofRung(state, AVAILABLE_PROBE);
    assert(decision.rung === "rung-2-xcodebuild", `an unfilled mobai entry must not force rung-4-mobai, got ${decision.rung}: ${decision.reason}`);
  });

  harness.check("proof-rung: no supported platform declared blocks with a reason naming the platform gap, never a rung", () => {
    const decision = selectProofRung(minimalBusinessState([]), AVAILABLE_PROBE);
    assert(decision.rung === "blocked", `expected blocked, got ${decision.rung}`);
    assert(/platform/i.test(decision.reason), `blocked reason should mention the missing platform, got: ${decision.reason}`);
  });

  harness.check(
    "proof-rung: rungs 0 and 1 (the interactive simulator pane and CLI computer-use) are never a possible return value regardless of probe shape",
    () => {
      const rungs = new Set<string>();
      for (const platforms of [["ios"], ["android"], []] as Array<Array<"ios" | "android">>) {
        for (const probe of [AVAILABLE_PROBE, NOTHING_AVAILABLE_PROBE]) {
          rungs.add(selectProofRung(minimalBusinessState(platforms), probe).rung);
        }
      }
      for (const forbidden of ["rung-0", "rung-1", "rung-0-simulator-pane", "rung-1-computer-use"]) {
        assert(!rungs.has(forbidden), `selectProofRung must never return an interactive-only rung, saw the full set: ${[...rungs].join(", ")}`);
      }
    },
  );

  // --- deriveProofVerdict (kernel/session/proof.ts) ---------------------------------------------

  harness.check("proof: deriveProofVerdict reports passed only when every step is ok, and names the FIRST failing step otherwise", () => {
    const allOk: DeviceProofStep[] = [
      { name: "boot_simulator", ok: true },
      { name: "build", ok: true },
      { name: "screenshot", ok: true, screenshotPath: "/tmp/x.png" },
    ];
    const passed = deriveProofVerdict(allOk);
    assert(
      passed.verdict === "passed" && passed.failingStep === undefined,
      `all-ok steps must derive passed with no failingStep, got ${JSON.stringify(passed)}`,
    );

    const oneFails: DeviceProofStep[] = [
      { name: "boot_simulator", ok: true },
      { name: "build", ok: false, error: "compile error" },
      { name: "launch", ok: false, error: "never reached" },
    ];
    const failed = deriveProofVerdict(oneFails);
    assert(failed.verdict === "failed" && failed.failingStep === "build", `expected the FIRST failing step ("build") named, got ${JSON.stringify(failed)}`);

    const noSteps = deriveProofVerdict([]);
    assert(
      noSteps.verdict === "failed",
      `zero steps (e.g. an adapter that could not even attempt one) must never derive as passed, got ${JSON.stringify(noSteps)}`,
    );
  });

  harness.check("proof: flow labels cannot escape their target proof lane", () => {
    assert(resolveProofFlow("packing-recovery.2") === "packing-recovery.2", "safe flow slug should remain unchanged");
    for (const unsafe of ["../outside", "nested/flow", ".hidden", "", "a".repeat(81)]) {
      let rejected = false;
      try {
        if (unsafe === "") resolveProofFlow(" ");
        else resolveProofFlow(unsafe);
      } catch {
        rejected = true;
      }
      if (unsafe === "") assert(!rejected && resolveProofFlow(" ") === "smoke", "blank flow should use the safe default");
      else assert(rejected, `unsafe flow must be rejected: ${unsafe}`);
    }
  });

  harness.check("proof: the live rung-2 resolver leaves the adapter spawn argument undefined so its bounded default remains active", () => {
    let received: unknown = Symbol("not-called");
    const expected = createFixtureDeviceProofAdapter([{ name: "bounded-default", ok: true }]);
    const adapter = resolveProofAdapter("rung-2-xcodebuild", {
      xcodebuildSimulator: (spawn) => {
        received = spawn;
        return expected;
      },
    });
    assert(adapter === expected, "the injected factory must supply the rung-2 adapter without touching a process");
    assert(received === undefined, "the live resolver must not override the Xcode adapter's bounded spawn default");
  });

  // --- createFixtureDeviceProofAdapter round-trip ---------------------------------------------

  harness.check("device-proof: the fixture adapter returns its scripted steps verbatim with no subprocess involved, round-tripping into a verdict", () => {
    const scripted: DeviceProofStep[] = [
      { name: "install", ok: true },
      { name: "launch", ok: true },
      { name: "screenshot", ok: true, screenshotPath: "/tmp/fixture-screenshot.png" },
    ];
    const adapter = createFixtureDeviceProofAdapter(scripted);
    const result = adapter.runFlow({ workspaceDir: "/tmp/w", deviceName: "fixture-device", outputDir: "/tmp/w/proof" });
    assert(
      JSON.stringify(result.steps) === JSON.stringify(scripted),
      `fixture adapter must return the exact scripted steps, got ${JSON.stringify(result.steps)}`,
    );
    const derived = deriveProofVerdict(result.steps);
    assert(derived.verdict === "passed", `an all-passing script must derive a passed verdict, got ${JSON.stringify(derived)}`);

    const failingScript: DeviceProofStep[] = [
      { name: "install", ok: true },
      { name: "launch", ok: false, error: "app crashed on launch" },
    ];
    const failingAdapter = createFixtureDeviceProofAdapter(failingScript);
    const failingDerived = deriveProofVerdict(failingAdapter.runFlow({ workspaceDir: "/tmp/w", deviceName: "d", outputDir: "/tmp/w/proof" }).steps);
    assert(
      failingDerived.verdict === "failed" && failingDerived.failingStep === "launch",
      `a scripted failure must name the failing step, got ${JSON.stringify(failingDerived)}`,
    );
  });

  // --- createXcodebuildSimulatorAdapter: command construction + short-circuit over a fake spawn -

  harness.check("device-proof: the xcodebuild adapter refuses up front when no device name is supplied, without spawning anything", () => {
    let spawnCalls = 0;
    const spy = (command: string, args: readonly string[]) => {
      spawnCalls += 1;
      return fakeSpawn(0, "", "")(command, args);
    };
    const adapter = createXcodebuildSimulatorAdapter(spy);
    const result = adapter.runFlow({ workspaceDir: "/tmp/w", deviceName: "  ", outputDir: "/tmp/w/proof" });
    assert(spawnCalls === 0, `an empty device name must short-circuit before any spawn, but spawn was called ${spawnCalls} time(s)`);
    assert(result.steps.length === 1 && result.steps[0]!.ok === false, `expected exactly one failing step, got ${JSON.stringify(result.steps)}`);
  });

  harness.check("device-proof: an already booted simulator still waits for boot readiness", () => {
    const fixture = simulatorFixture(harness, "already-booted", { alreadyBooted: true });
    const result = createXcodebuildSimulatorAdapter(fixture.spawn).runFlow(fixture.input);
    assert(
      result.steps.every((step) => step.ok),
      JSON.stringify(result.steps),
    );
    assert(
      fixture.calls.some((call) => call[2] === "bootstatus" && call[3] === DEVICE_ID && call[4] === "-b"),
      "must wait for bootstatus before build/install",
    );
  });

  harness.check("device-proof: a bounded bootstatus timeout is reported as boot_ready failure and prevents build work", () => {
    const fixture = simulatorFixture(harness, "bootstatus-timeout");
    const calls: Array<{ command: string; args: readonly string[]; options: DeviceProofSpawnOptions }> = [];
    const timeout = Object.assign(new Error("spawnSync xcrun ETIMEDOUT"), { code: "ETIMEDOUT" }) as NodeJS.ErrnoException;
    const spawn = (command: string, args: readonly string[], options: DeviceProofSpawnOptions): SpawnResult => {
      calls.push({ command, args, options });
      if (command === "xcrun" && args[1] === "bootstatus") return { status: null, stdout: "", stderr: "", error: timeout };
      return fixture.spawn(command, args);
    };
    const result = createXcodebuildSimulatorAdapter(spawn).runFlow(fixture.input);
    assert(result.steps.at(-1)?.name === "boot_ready" && result.steps.at(-1)?.ok === false, JSON.stringify(result.steps));
    assert(/ETIMEDOUT/.test(result.steps.at(-1)?.error ?? ""), `timeout detail must reach the failed step, got ${result.steps.at(-1)?.error}`);
    assert(calls.find((call) => call.args[1] === "boot")?.options.timeoutMs === 120_000, "simulator boot must carry a two-minute bound");
    assert(calls.find((call) => call.args[1] === "bootstatus")?.options.timeoutMs === 120_000, "bootstatus must carry a two-minute bound");
    assert(!calls.some((call) => call.command === "xcodebuild"), "timed-out boot readiness must short-circuit before build work");
  });

  harness.check("device-proof: UDID build installs and reads back the exact fresh binary before launch", () => {
    const fixture = simulatorFixture(harness, "fresh-build");
    const result = createXcodebuildSimulatorAdapter(fixture.spawn).runFlow(fixture.input);
    assert(
      result.steps.every((step) => step.ok),
      JSON.stringify(result.steps),
    );
    assert(
      result.steps.map((step) => step.name).join(",") ===
        "resolve_simulator,boot_simulator,boot_ready,resolve_product,build,verify_build,install,verify_install,launch,screenshot",
      "all identity and install checks must precede launch",
    );
    assert(!fixture.calls.some((call) => call[2] === "list"), "explicit UDID must not resolve as a simulator name");
    const build = fixture.calls.find((call) => call[0] === "xcodebuild" && call[1] === "build")!;
    assert(build.includes(`platform=iOS Simulator,id=${DEVICE_ID}`), "Xcode must receive id= for a UDID");
    assert(build.includes("-project") && build.includes("App"), "project flag and default scheme must remain supported");
    const identity = result.steps.find((step) => step.name === "verify_install")?.installedBuild;
    assert(identity, "successful readback must report the installed build identity");
    assert(identity.buildNumber === "42", "binary identity must carry the exact target build number");
    assert(identity.executable.sha256 === createHash("sha256").update("fresh executable").digest("hex"), "binary identity must be the actual executable bytes");
    assert(
      identity.installedAppPath === fixture.installedApp && identity.source.roots.includes("App.swift"),
      "record actual installed location and source selection",
    );
    assert(/^sha256:[a-f0-9]{64}$/.test(identity.source.fingerprint), "source identity must be the shared source fingerprint");
    const install = fixture.calls.findIndex((call) => call[2] === "install");
    const readback = fixture.calls.findIndex((call) => call[2] === "get_app_container");
    const launch = fixture.calls.findIndex((call) => call[2] === "launch");
    assert(install > 0 && readback > install && launch > readback, "never launch before install and identity readback");
    assert(fixture.calls[launch]!.includes("--terminate-running-process"), "restart the installed binary instead of reusing an older running process");
    assert(
      fixture.calls[install]![4] === identity.appPath && identity.appPath.startsWith(identity.derivedDataPath),
      "install only the application selected from fresh DerivedData",
    );
    for (const [stepName, transcriptStep] of [
      ["build", "build"],
      ["install", "install"],
      ["verify_install", "readback"],
      ["launch", "launch"],
    ] as const) {
      const transcriptPath = result.steps.find((step) => step.name === stepName)?.transcriptPath;
      assert(transcriptPath, `${stepName} must retain its raw command transcript`);
      const transcript = iosSimulatorCommandTranscriptSchema.parse(JSON.parse(readFileSync(transcriptPath, "utf8")));
      assert(transcript.step === transcriptStep && transcript.status === 0, `${stepName} transcript must bind the successful ${transcriptStep} command`);
    }
    assert(result.steps.at(-1)?.screenshotPath === path.join(fixture.input.outputDir, "screenshot.png"), "retain screenshot path contract");
  });

  harness.check("device-proof: repeated captures isolate build products and exclude nested proof output from source identity", () => {
    const fixture = simulatorFixture(harness, "repeat-capture");
    const input = { ...fixture.input, outputDir: path.join(fixture.input.workspaceDir, "ios", "proof", "ios-simulator") };
    const adapter = createXcodebuildSimulatorAdapter(fixture.spawn);
    const first = adapter.runFlow(input);
    const second = adapter.runFlow(input);
    assert(first.steps.every((step) => step.ok) && second.steps.every((step) => step.ok), JSON.stringify([first.steps, second.steps]));
    const before = first.steps.find((step) => step.installedBuild)!.installedBuild!;
    const after = second.steps.find((step) => step.installedBuild)!.installedBuild!;
    assert(before.derivedDataPath !== after.derivedDataPath && before.appPath !== after.appPath, "each capture must build into a fresh directory");
    assert(before.source.fingerprint === after.source.fingerprint, "proof/build output must not pollute the target source identity");
    assert(!after.source.roots.some((root) => root.startsWith("proof")), "recorded source selection must exclude proof output");
  });

  harness.check("device-proof: named simulators resolve uniquely and workspace builds keep the selected scheme", () => {
    const fixture = simulatorFixture(harness, "named-workspace");
    const result = createXcodebuildSimulatorAdapter(fixture.spawn).runFlow({
      ...fixture.input,
      deviceName: "iPhone 17",
      projectPath: "ios/App.xcworkspace",
      scheme: "AppScheme",
    });
    assert(
      result.steps.every((step) => step.ok),
      JSON.stringify(result.steps),
    );
    const build = fixture.calls.find((call) => call[0] === "xcodebuild" && call[1] === "build")!;
    assert(
      build.includes("-workspace") && build.includes("AppScheme") && build.includes(path.join(fixture.input.workspaceDir, "ios/App.xcworkspace")),
      "preserve workspace flag, scheme, and workspace-relative project resolution",
    );
    assert(build.includes(`platform=iOS Simulator,id=${DEVICE_ID}`), "name resolution must pin the same device for build and install");
    for (const call of fixture.calls.filter((call) => call[0] === "xcrun" && call[2] !== "list"))
      assert(call.includes(DEVICE_ID), "all simulator actions must use the resolved identity");
    for (const count of [0, 2]) {
      const unavailable = simulatorFixture(harness, `device-matches-${count}`, { deviceMatches: count });
      const blocked = createXcodebuildSimulatorAdapter(unavailable.spawn).runFlow({ ...unavailable.input, deviceName: "iPhone 17" });
      assert(
        blocked.steps.at(-1)?.name === "resolve_simulator" && blocked.steps.at(-1)?.ok === false,
        "missing or duplicate names must fail before device mutation",
      );
      assert(unavailable.calls.length === 1, "ambiguous name must not boot any device");
    }
  });

  harness.check("device-proof: failed boot, readiness, build, or install cannot launch a stale installed app", () => {
    for (const [action, step] of [
      ["boot", "boot_simulator"],
      ["bootstatus", "boot_ready"],
      ["settings", "resolve_product"],
      ["build", "build"],
      ["install", "install"],
    ]) {
      const fixture = simulatorFixture(harness, `failed-${action}`, { fail: action });
      const result = createXcodebuildSimulatorAdapter(fixture.spawn).runFlow(fixture.input);
      assert(result.steps.at(-1)?.name === step && result.steps.at(-1)?.ok === false, JSON.stringify(result.steps));
      assert(!fixture.calls.some((call) => call[2] === "launch" || call[2] === "io"), `${action} failure must never launch or capture an older app`);
      if (action !== "install") assert(!fixture.calls.some((call) => call[2] === "install"), `${action} failure must not install anything`);
    }
  });

  harness.check("device-proof: missing, ambiguous, or escaped build products cannot select an older app", () => {
    for (const products of ["missing", "ambiguous", "escaped"] as const) {
      const fixture = simulatorFixture(harness, `product-${products}`, { products });
      const result = createXcodebuildSimulatorAdapter(fixture.spawn).runFlow(fixture.input);
      assert(result.steps.at(-1)?.name === "resolve_product" && !result.steps.at(-1)?.ok, JSON.stringify(result.steps));
      assert(
        !fixture.calls.some((call) => call[1] === "build" || call[2] === "install" || call[2] === "launch"),
        "invalid product must stop before build, install, and launch",
      );
    }
    const missing = simulatorFixture(harness, "missing-binary", { omitBinary: true });
    const result = createXcodebuildSimulatorAdapter(missing.spawn).runFlow(missing.input);
    assert(result.steps.at(-1)?.name === "verify_build" && !result.steps.at(-1)?.ok, "a build exit code cannot replace the actual binary");
    assert(!missing.calls.some((call) => call[2] === "install" || call[2] === "launch"), "missing binary cannot fall back to an installed app");
  });

  harness.check("device-proof: changed source, executable, bundle content, or build metadata fails identity before launch", () => {
    for (const options of [
      { changedSource: true },
      { oldInstalledBinary: true },
      { oldInstalledLibrary: true },
      { wrongBuiltMetadata: true },
      { wrongInstalledMetadata: true },
    ]) {
      const fixture = simulatorFixture(
        harness,
        options.changedSource
          ? "changed-source"
          : options.oldInstalledLibrary
            ? "stale-debug-library"
            : options.oldInstalledBinary
              ? "stale-installed-binary"
              : options.wrongBuiltMetadata
                ? "wrong-built-metadata"
                : "wrong-installed-metadata",
        options,
      );
      const result = createXcodebuildSimulatorAdapter(fixture.spawn).runFlow(fixture.input);
      assert(
        result.steps.at(-1)?.name === (options.changedSource || options.wrongBuiltMetadata ? "verify_build" : "verify_install") && !result.steps.at(-1)?.ok,
        JSON.stringify(result.steps),
      );
      assert(!fixture.calls.some((call) => call[2] === "launch"), "identity mismatch cannot launch");
      assert(!result.steps.some((step) => step.installedBuild), "failure cannot claim verified installed identity");
    }
  });

  // --- createMobaiCliAdapter: command construction + short-circuit over a fake spawn ----------

  const androidDevice: MobaiDeviceIdentity = {
    id: "emulator-5554",
    name: "Pixel 9",
    platform: "android",
    model: "sdk_gphone64_arm64",
    osVersion: "16",
    virtual: true,
    bridgeRunning: true,
  };

  harness.check("device-proof: apkanalyzer binds the exact APK application id and version code", () => {
    const calls: string[][] = [];
    const identity = inspectAndroidApk("/tmp/current.apk", (command, args) => {
      calls.push([command, ...args]);
      if (args[1] === "application-id") return { status: 0, stdout: "com.example.app\n", stderr: "" };
      if (args[1] === "version-code") return { status: 0, stdout: "42\n", stderr: "" };
      return { status: 1, stdout: "", stderr: "unexpected" };
    });
    assert(identity.packageName === "com.example.app" && identity.versionCode === 42, JSON.stringify(identity));
    assert(
      calls.every((call) => call.slice(-1)[0] === "/tmp/current.apk") &&
        calls.map((call) => call.slice(1, 3).join(" ")).join(",") === "manifest application-id,manifest version-code",
      JSON.stringify(calls),
    );
  });

  harness.check("device-proof: MobAI structured device output pins platform, target kind, and requested device identity", () => {
    const spawn = (command: string, args: readonly string[]): SpawnResult => ({
      status: 0,
      stderr: "",
      stdout: JSON.stringify({ ...androidDevice, apiLevel: 36, osBuild: "BP2A.250705.008" }),
    });
    const observed = inspectMobaiDevice(spawn, androidDevice.id);
    assert(observed.id === androidDevice.id && observed.platform === "android" && observed.virtual, JSON.stringify(observed));
    assert(observed.apiLevel === 36 && observed.osBuild === "BP2A.250705.008", "retain optional Android version identity when MobAI returns it");
    assert(resolveProofOutputTarget("rung-4-mobai", ["android"], observed) === "android-emulator", "virtual Android target must route to emulator proof");
    assert(
      resolveProofOutputTarget("rung-4-mobai", ["android"], { ...observed, virtual: false }) === "android-device",
      "physical Android target must route to device proof",
    );
    assert(
      resolveProofOutputTarget("rung-4-mobai", ["android"]) === "android-incomplete",
      "unresolved Android target must not be mislabeled emulator or physical",
    );
    assert(
      resolveProofOutputTarget("rung-4-mobai", ["ios"], undefined, "ios") === "ios-incomplete",
      "unresolved MobAI iOS identity must not look like simulator proof",
    );
    assert(
      resolveProofOutputTarget("blocked", ["ios", "android"]) === "platform-incomplete",
      "mixed scope without an exact target must use a neutral incomplete lane",
    );
    assert(resolveProofOutputTarget("rung-2-xcodebuild", ["ios"]) === "ios-simulator", "rung 2 path must remain unchanged");
  });

  harness.check("device-proof: Android refuses an already-installed package or AAB because neither can prove this run's installed APK", () => {
    const workspaceDir = harness.makeTempDir("android-required-apk");
    const outputDir = path.join(workspaceDir, "proof", "android-emulator");
    mkdirSync(outputDir, { recursive: true });
    const adapter = createMobaiCliAdapter(() => ({ status: 0, stdout: "", stderr: "" }));
    const noArtifact = adapter.runFlow({ workspaceDir, deviceName: androidDevice.id, mobaiDevice: androidDevice, bundleId: "com.example.app", outputDir });
    assert(noArtifact.steps.at(-1)?.name === "verify_artifact" && !noArtifact.steps.at(-1)?.ok, JSON.stringify(noArtifact.steps));
    assert(/exact APK/.test(noArtifact.steps.at(-1)?.error ?? ""), "missing artifact must explain why launch-only proof is incomplete");
    const aabPath = path.join(workspaceDir, "app-release.aab");
    writeFileSync(aabPath, "synthetic bundle bytes");
    const aab = adapter.runFlow({
      workspaceDir,
      deviceName: androidDevice.id,
      mobaiDevice: androidDevice,
      appPath: aabPath,
      bundleId: "com.example.app",
      outputDir,
    });
    assert(aab.steps.at(-1)?.name === "verify_artifact" && /not AAB/.test(aab.steps.at(-1)?.error ?? ""), JSON.stringify(aab.steps));
  });

  harness.check("device-proof: Android reads APK manifest identity and rejects a caller/package mismatch before device mutation", () => {
    const workspaceDir = harness.makeTempDir("android-apk-identity");
    const outputDir = path.join(workspaceDir, "proof", "android-emulator");
    const apkPath = path.join(workspaceDir, "app.apk");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(workspaceDir, "Main.kt"), "source");
    writeFileSync(apkPath, "apk bytes");
    const calls: string[][] = [];
    const result = createMobaiCliAdapter(
      (command, args) => {
        calls.push([command, ...args]);
        return { status: 0, stdout: "{}", stderr: "" };
      },
      () => ({ packageName: "com.other.app", versionCode: 42 }),
    ).runFlow({
      workspaceDir,
      deviceName: androidDevice.id,
      mobaiDevice: androidDevice,
      appPath: apkPath,
      bundleId: "com.example.app",
      outputDir,
    });
    assert(result.steps.at(-1)?.name === "verify_artifact" && !result.steps.at(-1)?.ok, JSON.stringify(result.steps));
    assert(/com\.other\.app/.test(result.steps.at(-1)?.error ?? ""), "manifest mismatch must name observed APK identity");
    assert(calls.length === 0, `manifest mismatch must stop before bridge/install/launch mutation, got ${JSON.stringify(calls)}`);
  });

  harness.check("device-proof: MobAI starts and rechecks a stopped bridge before app interaction", () => {
    const initial: MobaiDeviceIdentity = { ...androidDevice, platform: "ios", id: "ios-bridge", model: "iPhone 17", bridgeRunning: false };
    const calls: string[][] = [];
    const spawn = (command: string, args: readonly string[]): SpawnResult => {
      calls.push([command, ...args]);
      if (args[0] === "devices" && args[1] === "info") return { status: 0, stdout: JSON.stringify({ ...initial, bridgeRunning: true }), stderr: "" };
      return { status: 0, stdout: "{}", stderr: "" };
    };
    const result = createMobaiCliAdapter(spawn).runFlow({
      workspaceDir: "/tmp/w",
      deviceName: initial.id,
      mobaiDevice: initial,
      bundleId: "com.example.app",
      outputDir: "/tmp/w/proof/ios-device",
    });
    assert(result.steps.map((step) => step.name).join(",") === "resolve_device,ensure_bridge,launch,screenshot", JSON.stringify(result.steps));
    assert(calls[0]?.slice(0, 3).join(" ") === "mobai bridge start", `bridge start must precede app interaction: ${JSON.stringify(calls)}`);
    assert(calls[1]?.[1] === "devices" && calls[1]?.[2] === "info", `bridge readiness must be re-read: ${JSON.stringify(calls)}`);
  });

  harness.check(
    "device-proof: Android hashes the exact APK and source snapshot, reads back the package, captures, then fails closed before strict acceptance",
    () => {
      const workspaceDir = harness.makeTempDir("android-bounded-proof");
      const outputDir = path.join(workspaceDir, "proof", "android-emulator");
      const apkPath = path.join(workspaceDir, "build", "app-release.apk");
      mkdirSync(path.dirname(apkPath), { recursive: true });
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(workspaceDir, "MainActivity.kt"), "class MainActivity");
      writeFileSync(apkPath, "actual apk bytes");
      const seenArgs: string[][] = [];
      const spawn = (command: string, args: readonly string[]): SpawnResult => {
        seenArgs.push([command, ...args]);
        if (args[0] === "app" && args[1] === "list")
          return { status: 0, stderr: "", stdout: JSON.stringify({ apps: [{ packageName: "com.example.app", versionCode: 42 }] }) };
        if (args[0] === "observe") return { status: 0, stderr: "", stdout: JSON.stringify({ activity: "com.example.app/.MainActivity" }) };
        return { status: 0, stdout: JSON.stringify({ ok: true }), stderr: "" };
      };
      const result = createMobaiCliAdapter(spawn, () => ({ packageName: "com.example.app", versionCode: 42 })).runFlow({
        workspaceDir,
        deviceName: androidDevice.id,
        mobaiDevice: androidDevice,
        appPath: apkPath,
        bundleId: "com.example.app",
        outputDir,
      });
      assert(
        result.steps.map((step) => step.name).join(",") ===
          "resolve_device,verify_artifact,ensure_bridge,install,verify_install,launch,screenshot,inspect_runtime,strict_receipt",
        JSON.stringify(result.steps),
      );
      assert(
        deriveProofVerdict(result.steps).verdict === "failed" && deriveProofVerdict(result.steps).failingStep === "strict_receipt",
        "bounded actions cannot become acceptance",
      );
      const evidence = result.steps.at(-1)?.androidEvidence;
      assert(evidence?.artifact?.sha256 === createHash("sha256").update("actual apk bytes").digest("hex"), "hash exact APK bytes");
      assert(evidence?.sourceSnapshot?.roots.includes("MainActivity.kt"), "retain actual workspace source selection");
      assert(
        !evidence?.sourceSnapshot?.roots.some((root) => root === "build" || root === "proof"),
        "exclude generated artifacts and prior proof from source snapshot",
      );
      assert(evidence?.installedPackage?.versionCode === 42 && evidence.launchedActivity?.includes("MainActivity"), "retain readback values without synthesis");
      assert(/source-to-APK build linkage/.test(result.steps.at(-1)?.error ?? ""), "name the irreducible MobAI limitation");
      for (const call of seenArgs)
        assert(call.includes("-d") && call.includes(androidDevice.id), `every MobAI action must pin the resolved target, got: ${call.join(" ")}`);
      assert(
        result.steps.find((step) => step.name === "screenshot")?.screenshotPath === path.join(outputDir, "screenshot.png"),
        "route capture to Android proof path",
      );
    },
  );

  harness.check("device-proof: Android app-list failure or package mismatch stops before launch and never emits identity", () => {
    const workspaceDir = harness.makeTempDir("android-readback-failure");
    const outputDir = path.join(workspaceDir, "proof", "android-emulator");
    const apkPath = path.join(workspaceDir, "app.apk");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(workspaceDir, "Main.kt"), "source");
    writeFileSync(apkPath, "apk");
    for (const listResult of [
      { status: 1, stdout: "", stderr: "CLAIM_REQUIRED" },
      { status: 0, stdout: JSON.stringify({ apps: [{ packageName: "com.other.app", versionCode: 1 }] }), stderr: "" },
      { status: 0, stdout: JSON.stringify({ apps: [{ packageName: "com.example.app", versionCode: 41 }] }), stderr: "" },
    ] satisfies SpawnResult[]) {
      const calls: string[][] = [];
      const spawn = (command: string, args: readonly string[]): SpawnResult => {
        calls.push([command, ...args]);
        return args[0] === "app" && args[1] === "list" ? listResult : { status: 0, stdout: "{}", stderr: "" };
      };
      const result = createMobaiCliAdapter(spawn, () => ({ packageName: "com.example.app", versionCode: 42 })).runFlow({
        workspaceDir,
        deviceName: androidDevice.id,
        mobaiDevice: androidDevice,
        appPath: apkPath,
        bundleId: "com.example.app",
        outputDir,
      });
      assert(result.steps.at(-1)?.name === "verify_install" && !result.steps.at(-1)?.ok, JSON.stringify(result.steps));
      assert(!calls.some((call) => call[0] === "mobai" && call[1] === "app" && call[2] === "launch"), "unverified install must not launch");
      assert(!result.steps.some((step) => step.name === "strict_receipt"), "readback failure cannot emit a receipt-like completion step");
    }
  });

  harness.check("device-proof: Android activity readback must name the launched package", () => {
    const workspaceDir = harness.makeTempDir("android-activity-readback");
    const outputDir = path.join(workspaceDir, "proof", "android-emulator");
    const apkPath = path.join(workspaceDir, "app.apk");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(path.join(workspaceDir, "Main.kt"), "source");
    writeFileSync(apkPath, "apk");
    const spawn = (command: string, args: readonly string[]): SpawnResult => {
      if (args[0] === "app" && args[1] === "list")
        return { status: 0, stdout: JSON.stringify({ apps: [{ packageName: "com.example.app", versionCode: 42 }] }), stderr: "" };
      if (args[0] === "observe") return { status: 0, stdout: JSON.stringify({ activity: "com.other.app/.MainActivity" }), stderr: "" };
      return { status: 0, stdout: "{}", stderr: "" };
    };
    const result = createMobaiCliAdapter(spawn, () => ({ packageName: "com.example.app", versionCode: 42 })).runFlow({
      workspaceDir,
      deviceName: androidDevice.id,
      mobaiDevice: androidDevice,
      appPath: apkPath,
      bundleId: "com.example.app",
      outputDir,
    });
    assert(result.steps.at(-1)?.name === "inspect_runtime" && !result.steps.at(-1)?.ok, JSON.stringify(result.steps));
    assert(!result.steps.some((step) => step.name === "strict_receipt"), "missing activity readback cannot reach a receipt-like terminal step");
  });

  harness.check("device-proof: MobAI iOS still supports install, launch, and screenshot through the resolved device", () => {
    const iosDevice: MobaiDeviceIdentity = { ...androidDevice, id: "ios-device", platform: "ios", model: "iPhone 17", osVersion: "26.5" };
    const seenArgs: string[][] = [];
    const spy = (command: string, args: readonly string[]): SpawnResult => {
      seenArgs.push([command, ...args]);
      return { status: 0, stdout: "", stderr: "" };
    };
    const result = createMobaiCliAdapter(spy).runFlow({
      workspaceDir: "/tmp/w",
      deviceName: iosDevice.id,
      mobaiDevice: iosDevice,
      appPath: "/tmp/App.ipa",
      bundleId: "com.example.app",
      outputDir: "/tmp/w/proof/ios-simulator",
    });
    assert(result.steps.map((step) => step.name).join(",") === "resolve_device,ensure_bridge,install,launch,screenshot", JSON.stringify(result.steps));
    assert(
      result.steps.every((step) => step.ok),
      JSON.stringify(result.steps),
    );
    for (const call of seenArgs) assert(call.includes("-d") && call.includes(iosDevice.id), `every MobAI action must pin iOS target: ${call.join(" ")}`);
  });

  // --- probeDeviceProofEnvironment: real spawn seam, always injected here ---------------------

  harness.check("device-proof: probeDeviceProofEnvironment reports each tool unavailable on a nonzero exit or ENOENT, and available on exit 0", () => {
    const allMissing = probeDeviceProofEnvironment(() => ({ status: null, stdout: "", stderr: "", error: enoent() }));
    assert(
      !allMissing.xcodebuildAvailable && !allMissing.simctlAvailable && !allMissing.mobaiAvailable,
      `ENOENT for every command must report every tool unavailable, got ${JSON.stringify(allMissing)}`,
    );

    const allPresent = probeDeviceProofEnvironment(() => ({ status: 0, stdout: "ok", stderr: "" }));
    assert(
      allPresent.xcodebuildAvailable && allPresent.simctlAvailable && allPresent.mobaiAvailable,
      `exit 0 for every command must report every tool available, got ${JSON.stringify(allPresent)}`,
    );
    assert(allPresent.platform === process.platform, "probeDeviceProofEnvironment must report this process's real platform, not a fixed value");
  });
}
