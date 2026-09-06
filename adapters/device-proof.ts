import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync as nodeSpawnSync } from "node:child_process";
import { defaultSpawn, type SpawnFn, type SpawnResult } from "./profile.js";
import type { ProofEnvironmentProbe } from "../kernel/engine/proof-rung.js";
import { fingerprintAppSource } from "../kernel/engine/source-fingerprint.js";
import { outputFingerprintPath } from "../kernel/engine/artifact-fingerprint.js";
import { snapshotTaskInputs } from "../kernel/session/input-inventory.js";
import { parseInfoPlistScalarsFromBytes } from "./app-review/plist.js";
import { iosRetainedEvidenceSessionPath, writeIosSimulatorCommandTranscript } from "./ios-app-evidence.js";

/**
 * Device-proof adapters (#36): the rung-2 (xcodebuild/xcrun simctl) and rung-4 (MobAI CLI)
 * executors kernel/session/proof.ts drives, plus the environment probe that feeds
 * kernel/engine/proof-rung.ts's `selectProofRung`. Every adapter takes an injectable `SpawnFn`
 * (adapters/profile.ts's shared seam — the exact one adapters/claude.ts's
 * `probeClaudeAvailability` uses) with a real default and a real process only ever spawned in
 * production; every fixture in this repo injects a fake spawn function instead, so nothing here
 * ever touches a real simulator, a real device, or the network in CI.
 *
 * Flag-name honesty: unlike the vendor-CLI research notes in claude.ts/codex.ts/cursor.ts, the
 * xcodebuild/xcrun simctl flags below ARE independently verified — this session ran
 * `xcodebuild -help`, `xcrun simctl help boot/launch/io/install`, and `mobai --help`/`mobai app
 * --help`/`mobai screenshot --help` against a real local install (Xcode 26.3, mobai 1.9.3) and
 * copied the exact usage strings those commands printed. Xcode's own CLI surface still drifts
 * across releases; a caller that hits a changed shape gets the raw command output back in the
 * failing step's `error` field, never a silent pass.
 */

export interface DeviceProofStep {
  readonly name: string;
  readonly ok: boolean;
  readonly screenshotPath?: string;
  readonly error?: string;
  /** Present only after readback of the freshly installed simulator executable. */
  readonly installedBuild?: InstalledSimulatorBuild;
  /** Raw structured command output retained by the iOS simulator adapter. */
  readonly transcriptPath?: string;
  /** Bounded Android facts observed by this adapter. This is not a strict design-acceptance receipt. */
  readonly androidEvidence?: AndroidDeviceProofEvidence;
}

export interface MobaiDeviceIdentity {
  readonly id: string;
  readonly name: string;
  readonly platform: "android" | "ios";
  readonly model: string;
  readonly osVersion: string;
  readonly virtual: boolean;
  /** Current bridge readiness when the installed CLI exposes it. */
  readonly bridgeRunning?: boolean;
  /** MobAI may add these fields in structured output. They remain absent when it does not. */
  readonly apiLevel?: number;
  readonly osBuild?: string;
}

export interface AndroidDeviceProofEvidence {
  readonly device: MobaiDeviceIdentity;
  readonly packageName: string;
  readonly artifact?: {
    readonly path: string;
    readonly format: "apk";
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly packageName: string;
    readonly versionCode: number;
  };
  /** A workspace snapshot only. MobAI does not prove that these source bytes built the APK. */
  readonly sourceSnapshot?: InstalledSimulatorBuild["source"];
  readonly installedPackage?: { readonly packageName: string; readonly versionCode?: number };
  readonly launchedActivity?: string;
}

export interface InstalledSimulatorBuild {
  readonly deviceId: string;
  readonly bundleId: string;
  /** CFBundleVersion read from the exact target build settings used for this install. */
  readonly buildNumber: string;
  readonly scheme: string;
  readonly projectPath: string;
  readonly derivedDataPath: string;
  readonly appPath: string;
  /** Repository artifact fingerprint (includes paths and metadata), not a file-byte digest. */
  readonly appFingerprint: string;
  /** SHA-256 of JSON file identities relative to the app; covers executable, dylibs, and resources. */
  readonly bundleContentSha256: string;
  readonly installedAppPath: string;
  readonly executable: { readonly path: string; readonly sha256: string };
  /** Target SRCROOT selection. External packages and generated build inputs are outside this identity. */
  readonly source: { readonly root: string; readonly roots: readonly string[]; readonly fingerprint: string };
}

export interface DeviceProofFlowInput {
  readonly workspaceDir: string;
  /** Simulator UDID/name (rung 2) or MobAI device id (rung 4, "" lets MobAI auto-pick its one connected device). */
  readonly deviceName: string;
  /** Directory the adapter writes its screenshot(s) into; the caller owns naming/rotation. */
  readonly outputDir: string;
  /** Xcode scheme to build (rung 2 only; defaults to "App"). */
  readonly scheme?: string;
  /** Path to an .xcodeproj or .xcworkspace to build (rung 2 only). */
  readonly projectPath?: string;
  /** Bundle id to launch after install/build (both rungs). */
  readonly bundleId?: string;
  /** Path to a prebuilt .ipa/.apk to install directly, skipping a build (rung 4 only). */
  readonly appPath?: string;
  /** A caller may resolve this once so output routing and adapter execution use the same target. */
  readonly mobaiDevice?: MobaiDeviceIdentity;
  /** Engine-owned iOS evidence session. Omit outside the rung-2 producer. */
  readonly retainedEvidenceSessionId?: string;
  /** Require this platform when the workflow selected MobAI to prove a declared target OS. */
  readonly requiredPlatform?: "android" | "ios";
}

export interface DeviceProofFlowResult {
  readonly steps: readonly DeviceProofStep[];
}

/**
 * Synchronous by design, matching the SpawnFn seam it is built on (adapters/profile.ts's
 * `defaultSpawn` wraps `spawnSync`, exactly like `probeClaudeAvailability`/`classifySpawnResult`
 * elsewhere in this directory) — there is no real await inside any of these three adapters, and
 * keeping the contract sync lets every fixture below assert against it directly, in-process, with
 * no spawned driver script needed.
 */
export interface DeviceProofAdapter {
  runFlow(input: DeviceProofFlowInput): DeviceProofFlowResult;
}

/**
 * The simulator proof lane has long-running commands, so its existing injectable
 * process seam also carries a bounded wall-clock limit. Plain two-argument
 * SpawnFns remain assignable for fixtures and callers that do not need to
 * inspect the bound.
 */
export interface DeviceProofSpawnOptions {
  readonly timeoutMs: number;
}

export type DeviceProofSpawnFn = (command: string, args: readonly string[], options: DeviceProofSpawnOptions) => SpawnResult;

export interface AndroidApkIdentity {
  readonly packageName: string;
  readonly versionCode: number;
}

export type AndroidArtifactInspector = (apkPath: string) => AndroidApkIdentity;

const SIMULATOR_COMMAND_TIMEOUT_MS = 10 * 60_000;
const SIMULATOR_BOOT_TIMEOUT_MS = 2 * 60_000;

const defaultDeviceProofSpawn: DeviceProofSpawnFn = (command, args, options) => {
  const result = nodeSpawnSync(command, [...args], { encoding: "utf8", timeout: options.timeoutMs, killSignal: "SIGKILL" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
};

function summarizeSpawn(result: SpawnResult): string {
  if (result.error) return result.error.message;
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  return combined.length > 0 ? combined.slice(0, 500) : `exit ${String(result.status)}`;
}

/** Real availability probe for `selectProofRung`'s input — every fixture builds a `ProofEnvironmentProbe` by hand instead of calling this. */
export function probeDeviceProofEnvironment(spawn: SpawnFn = defaultSpawn): ProofEnvironmentProbe {
  const xcodebuild = spawn("xcodebuild", ["-version"]);
  const simctl = spawn("xcrun", ["simctl", "list", "devices"]);
  const mobai = spawn("mobai", ["version"]);
  return {
    platform: process.platform,
    xcodebuildAvailable: xcodebuild.status === 0,
    simctlAvailable: simctl.status === 0,
    mobaiAvailable: mobai.status === 0,
  };
}

const SIMULATOR_UDID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveSimulator(spawn: DeviceProofSpawnFn, requested: string): string {
  if (SIMULATOR_UDID.test(requested)) return requested;
  const result = spawn("xcrun", ["simctl", "list", "devices", "available", "--json"], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
  if (result.status !== 0) throw new Error(summarizeSpawn(result));
  const parsed: unknown = JSON.parse(result.stdout);
  const devices = record(parsed) && record(parsed.devices) ? Object.values(parsed.devices).flatMap((entries) => (Array.isArray(entries) ? entries : [])) : [];
  const matches = devices.filter(
    (device) =>
      record(device) && device.name === requested && device.isAvailable === true && typeof device.udid === "string" && SIMULATOR_UDID.test(device.udid),
  );
  if (matches.length !== 1) throw new Error(`Expected one available simulator named ${requested}; found ${matches.length}. Supply its UDID with --device.`);
  return (matches[0] as { udid: string }).udid;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

interface SimulatorProduct {
  appPath: string;
  executableRelative: string;
  infoPlistRelative: string;
  sourceRoot: string;
  buildNumber: string;
}

function simulatorProduct(stdout: string, bundleId: string, derivedDataPath: string): SimulatorProduct {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error("Xcode build settings must be a target array.");
  const matches = parsed
    .flatMap((entry) => (record(entry) && record(entry.buildSettings) ? [entry.buildSettings] : []))
    .filter(
      (settings) =>
        settings.PRODUCT_BUNDLE_IDENTIFIER === bundleId && typeof settings.FULL_PRODUCT_NAME === "string" && settings.FULL_PRODUCT_NAME.endsWith(".app"),
    );
  if (matches.length !== 1) throw new Error(`Expected one application product for ${bundleId}; found ${matches.length}.`);
  const settings = matches[0]!;
  const required = (key: string): string => {
    const value = settings[key];
    if (typeof value !== "string" || !value.trim()) throw new Error(`Xcode omitted ${key} for ${bundleId}.`);
    return value;
  };
  const buildDirectory = required("TARGET_BUILD_DIR");
  const fullProductName = required("FULL_PRODUCT_NAME");
  const sourceRoot = required("SRCROOT");
  if (!path.isAbsolute(buildDirectory) || !path.isAbsolute(sourceRoot) || path.basename(fullProductName) !== fullProductName)
    throw new Error("Xcode returned noncanonical product paths.");
  const appPath = path.resolve(buildDirectory, fullProductName);
  const executable = path.resolve(buildDirectory, required("EXECUTABLE_PATH"));
  const infoPlist = path.resolve(buildDirectory, required("INFOPLIST_PATH"));
  if (!inside(derivedDataPath, appPath) || !inside(appPath, executable) || !inside(appPath, infoPlist))
    throw new Error("The application must be inside this proof's DerivedData with its executable and Info.plist inside the app.");
  return {
    appPath,
    executableRelative: path.relative(appPath, executable),
    infoPlistRelative: path.relative(appPath, infoPlist),
    sourceRoot: realpathSync(sourceRoot),
    buildNumber: required("CURRENT_PROJECT_VERSION"),
  };
}

/** Select target-owned source, preserving the shared source fingerprint's generated-directory exclusions. */
function sourceSelection(root: string, excludedDirectories: string | readonly string[]): string[] {
  const generated = new Set([".git", ".dart_tool", ".gradle", ".next", "build", "DerivedData", "dist", "node_modules"]);
  const exclusions = (typeof excludedDirectories === "string" ? [excludedDirectories] : excludedDirectories).map((entry) => path.resolve(entry));
  const roots: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      if (generated.has(name)) continue;
      const target = path.join(directory, name);
      if (exclusions.includes(target)) continue;
      if (exclusions.some((excluded) => inside(target, excluded))) visit(target);
      else roots.push(path.relative(root, target));
    }
  };
  if (exclusions.includes(root)) throw new Error("Proof output cannot replace the target source root.");
  visit(root);
  if (roots.length === 0) throw new Error("No target source inputs were found.");
  return roots;
}

function executableDigest(appPath: string, relative: string): string {
  const file = path.join(appPath, relative);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || !inside(realpathSync(appPath), realpathSync(file)))
    throw new Error("The application executable is missing or is not an ordinary nonempty file inside its app.");
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function installedIdentity(appPath: string, relative: string): { bundleId: string; buildNumber: string } {
  const file = path.join(appPath, relative);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || !inside(realpathSync(appPath), realpathSync(file)))
    throw new Error("The application Info.plist is missing or is not an ordinary nonempty file inside its app.");
  const values = parseInfoPlistScalarsFromBytes(readFileSync(file));
  const bundleId = values.CFBundleIdentifier?.trim() ?? "";
  const buildNumber = values.CFBundleVersion?.trim() ?? "";
  if (!bundleId || !buildNumber) throw new Error("The application Info.plist omits CFBundleIdentifier or CFBundleVersion.");
  return { bundleId, buildNumber };
}

function bundleContentDigest(appPath: string): string {
  const appName = path.basename(appPath);
  const inventory = snapshotTaskInputs(path.dirname(appPath), [appName], { maxFiles: 100_000, maxBytes: 512 * 1024 * 1024 });
  const files = inventory.files.map((entry) => ({ path: entry.path.slice(appName.length + 1), sha256: entry.sha256 }));
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}

function requiredJsonString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`MobAI device output omits ${field}.`);
  return value.trim();
}

/** Resolve one concrete MobAI target from the CLI's documented structured device output. */
export function inspectMobaiDevice(spawn: SpawnFn = defaultSpawn, requested = ""): MobaiDeviceIdentity {
  const deviceFlags = requested.trim() ? ["-d", requested.trim()] : [];
  const result = spawn("mobai", ["devices", "info", "--json", ...deviceFlags]);
  if (result.status !== 0) throw new Error(summarizeSpawn(result));
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`MobAI device output was not JSON: ${String(error)}`);
  }
  if (!record(parsed)) throw new Error("MobAI device output must be an object.");
  const id = requiredJsonString(parsed.id, "id");
  if (requested.trim() && id !== requested.trim()) throw new Error(`MobAI resolved ${id}, not the requested device ${requested.trim()}.`);
  const platform = requiredJsonString(parsed.platform, "platform");
  if (platform !== "android" && platform !== "ios") throw new Error(`MobAI returned unsupported platform ${platform}.`);
  if (typeof parsed.virtual !== "boolean") throw new Error("MobAI device output omits virtual.");
  const apiLevel = typeof parsed.apiLevel === "number" && Number.isInteger(parsed.apiLevel) && parsed.apiLevel > 0 ? parsed.apiLevel : undefined;
  const osBuild = typeof parsed.osBuild === "string" && parsed.osBuild.trim() ? parsed.osBuild.trim() : undefined;
  const bridgeRunning = typeof parsed.bridgeRunning === "boolean" ? parsed.bridgeRunning : undefined;
  return {
    id,
    name: requiredJsonString(parsed.name, "name"),
    platform,
    model: requiredJsonString(parsed.model, "model"),
    osVersion: requiredJsonString(parsed.osVersion, "osVersion"),
    virtual: parsed.virtual,
    ...(bridgeRunning === undefined ? {} : { bridgeRunning }),
    ...(apiLevel ? { apiLevel } : {}),
    ...(osBuild ? { osBuild } : {}),
  };
}

function apkanalyzerCommand(): string {
  const explicit = process.env.B2C_APP_BUILDER_APKANALYZER?.trim();
  if (explicit) return explicit;
  const userHome = process.env.HOME?.trim();
  const sdkRoots = [
    process.env.ANDROID_SDK_ROOT?.trim(),
    process.env.ANDROID_HOME?.trim(),
    userHome ? path.join(userHome, "Library", "Android", "sdk") : undefined,
    userHome ? path.join(userHome, "Android", "Sdk") : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const sdkRoot of new Set(sdkRoots)) {
    for (const candidate of [path.join(sdkRoot, "cmdline-tools", "latest", "bin", "apkanalyzer"), path.join(sdkRoot, "tools", "bin", "apkanalyzer")]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return "apkanalyzer";
}

/** Read identity from the exact APK before any device mutation. */
export function inspectAndroidApk(apkPath: string, spawn: SpawnFn = defaultSpawn): AndroidApkIdentity {
  const command = apkanalyzerCommand();
  const applicationId = spawn(command, ["manifest", "application-id", apkPath]);
  if (applicationId.status !== 0) throw new Error(`apkanalyzer could not read the APK application id: ${summarizeSpawn(applicationId)}`);
  const version = spawn(command, ["manifest", "version-code", apkPath]);
  if (version.status !== 0) throw new Error(`apkanalyzer could not read the APK version code: ${summarizeSpawn(version)}`);
  const packageName = applicationId.stdout.trim();
  const versionText = version.stdout.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) throw new Error("apkanalyzer returned an invalid APK application id.");
  if (!/^\d+$/.test(versionText) || Number(versionText) <= 0 || !Number.isSafeInteger(Number(versionText)))
    throw new Error("apkanalyzer returned an invalid APK version code.");
  return { packageName, versionCode: Number(versionText) };
}

function digestAndroidArtifact(
  workspaceDir: string,
  outputDir: string,
  appPath: string,
  inspectArtifact: AndroidArtifactInspector,
): {
  artifact: NonNullable<AndroidDeviceProofEvidence["artifact"]>;
  sourceSnapshot: NonNullable<AndroidDeviceProofEvidence["sourceSnapshot"]>;
} {
  const artifactPath = path.resolve(workspaceDir, appPath);
  const stat = lstatSync(artifactPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error("The Android install artifact must be an ordinary nonempty APK file.");
  if (path.extname(artifactPath).toLowerCase() !== ".apk")
    throw new Error("MobAI 1.9.3 installs APK files, not AAB files. Supply the exact APK that will be installed.");
  const identity = inspectArtifact(artifactPath);
  const workspaceRoot = realpathSync(workspaceDir);
  const proofRoot = path.join(workspaceRoot, "proof");
  const roots = sourceSelection(workspaceRoot, proofRoot === workspaceRoot ? realpathSync(outputDir) : proofRoot);
  return {
    artifact: {
      path: artifactPath,
      format: "apk",
      sha256: createHash("sha256").update(readFileSync(artifactPath)).digest("hex"),
      sizeBytes: stat.size,
      packageName: identity.packageName,
      versionCode: identity.versionCode,
    },
    sourceSnapshot: { root: workspaceRoot, roots, fingerprint: fingerprintAppSource(workspaceRoot, roots) },
  };
}

function findInstalledAndroidPackage(value: unknown, packageName: string): { packageName: string; versionCode?: number } | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findInstalledAndroidPackage(entry, packageName);
      if (match) return match;
    }
    return undefined;
  }
  if (!record(value)) return undefined;
  const observedName = [value.packageName, value.package_name, value.bundleId, value.bundle_id].find(
    (entry): entry is string => typeof entry === "string" && entry === packageName,
  );
  if (observedName) {
    const rawVersion = value.versionCode ?? value.version_code;
    const versionCode =
      typeof rawVersion === "number" && Number.isInteger(rawVersion) && rawVersion > 0
        ? rawVersion
        : typeof rawVersion === "string" && /^\d+$/.test(rawVersion) && Number(rawVersion) > 0
          ? Number(rawVersion)
          : undefined;
    return { packageName: observedName, ...(versionCode ? { versionCode } : {}) };
  }
  // Traverse only documented wrapper shapes. An arbitrary matching string elsewhere in the
  // response must never stand in for an installed-app record.
  for (const key of ["apps", "installedApps", "installed_apps", "data", "result"] as const) {
    const nested = value[key];
    if (nested === undefined) continue;
    const match = findInstalledAndroidPackage(nested, packageName);
    if (match) return match;
  }
  return undefined;
}

function findAndroidActivity(value: unknown, packageName: string): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findAndroidActivity(entry, packageName);
      if (match) return match;
    }
    return undefined;
  }
  if (!record(value)) return undefined;
  for (const key of ["activity", "currentActivity", "current_activity", "launchActivity", "launch_activity"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() && candidate.includes(packageName)) return candidate.trim();
  }
  for (const nested of Object.values(value)) {
    const match = findAndroidActivity(nested, packageName);
    if (match) return match;
  }
  return undefined;
}

/** Install and identify a fresh build before launch. These actions do not exercise the labelled user journey. */
export function createXcodebuildSimulatorAdapter(spawn: DeviceProofSpawnFn = defaultDeviceProofSpawn): DeviceProofAdapter {
  return {
    runFlow(input) {
      if (!input.deviceName.trim()) {
        return {
          steps: [
            { name: "boot_simulator", ok: false, error: "No simulator device name was supplied (state has no known device, and --device was not given)." },
          ],
        };
      }

      const steps: DeviceProofStep[] = [];
      let deviceId: string;
      try {
        deviceId = resolveSimulator(spawn, input.deviceName.trim());
        steps.push({ name: "resolve_simulator", ok: true });
      } catch (error) {
        steps.push({ name: "resolve_simulator", ok: false, error: String(error) });
        return { steps };
      }
      const boot = spawn("xcrun", ["simctl", "boot", deviceId], { timeoutMs: SIMULATOR_BOOT_TIMEOUT_MS });
      // Verified this session against a real Xcode 26.3 install: `simctl boot` on an
      // already-booted device exits nonzero with "Unable to boot device in current state:
      // Booted" — that specific message is a successful no-op, never a genuine failure.
      const bootOk = boot.status === 0 || /current state:\s*Booted/i.test(`${boot.stdout}\n${boot.stderr}`);
      steps.push({ name: "boot_simulator", ok: bootOk, error: bootOk ? undefined : summarizeSpawn(boot) });
      if (!bootOk) return { steps };
      const bootStatus = spawn("xcrun", ["simctl", "bootstatus", deviceId, "-b"], { timeoutMs: SIMULATOR_BOOT_TIMEOUT_MS });
      steps.push({ name: "boot_ready", ok: bootStatus.status === 0, error: bootStatus.status === 0 ? undefined : summarizeSpawn(bootStatus) });
      if (bootStatus.status !== 0) return { steps };

      if (!input.projectPath) {
        steps.push({ name: "build", ok: false, error: "No Xcode project or workspace path was supplied for this flow." });
        return { steps };
      }
      if (!input.bundleId) {
        steps.push({ name: "resolve_product", ok: false, error: "No bundle id was supplied to select and launch the application product." });
        return { steps };
      }
      const projectPath = path.resolve(input.workspaceDir, input.projectPath);
      const projectFlag = projectPath.endsWith(".xcworkspace") ? "-workspace" : "-project";
      const scheme = input.scheme ?? "App";
      let derivedDataPath: string;
      let product: SimulatorProduct;
      let source: InstalledSimulatorBuild["source"];
      let buildArgs: string[];
      let transcriptDirectory: string;
      let retainedRoot: string;
      try {
        mkdirSync(input.outputDir, { recursive: true });
        const outputDir = realpathSync(input.outputDir);
        retainedRoot = iosRetainedEvidenceSessionPath(input.workspaceDir, input.retainedEvidenceSessionId ?? randomUUID(), true);
        derivedDataPath = mkdtempSync(path.join(retainedRoot, "DerivedData-"));
        transcriptDirectory = mkdtempSync(path.join(retainedRoot, "command-transcripts-"));
        buildArgs = [projectFlag, projectPath, "-scheme", scheme, "-destination", `platform=iOS Simulator,id=${deviceId}`, "-derivedDataPath", derivedDataPath];
        const settings = spawn("xcodebuild", [...buildArgs, "-showBuildSettings", "-json"], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
        if (settings.status !== 0) throw new Error(summarizeSpawn(settings));
        product = simulatorProduct(settings.stdout, input.bundleId, derivedDataPath);
        const roots = sourceSelection(product.sourceRoot, [outputDir, retainedRoot]);
        source = { root: product.sourceRoot, roots, fingerprint: fingerprintAppSource(product.sourceRoot, roots) };
        steps.push({ name: "resolve_product", ok: true });
      } catch (error) {
        steps.push({ name: "resolve_product", ok: false, error: String(error) });
        return { steps };
      }
      const build = spawn("xcodebuild", ["build", ...buildArgs], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
      const buildTranscript = writeIosSimulatorCommandTranscript(transcriptDirectory, "build", "xcodebuild", ["build", ...buildArgs], build);
      steps.push({ name: "build", ok: build.status === 0, error: build.status === 0 ? undefined : summarizeSpawn(build), transcriptPath: buildTranscript });
      if (build.status !== 0) return { steps };
      let appFingerprint: string;
      let bundleContentSha256: string;
      let binarySha256: string;
      try {
        if (!lstatSync(product.appPath).isDirectory() || !inside(derivedDataPath, realpathSync(product.appPath)))
          throw new Error("The built application is missing or outside this proof's DerivedData.");
        appFingerprint = outputFingerprintPath(product.appPath);
        bundleContentSha256 = bundleContentDigest(product.appPath);
        binarySha256 = executableDigest(product.appPath, product.executableRelative);
        const builtIdentity = installedIdentity(product.appPath, product.infoPlistRelative);
        if (builtIdentity.bundleId !== input.bundleId || builtIdentity.buildNumber !== product.buildNumber)
          throw new Error("The built application's bundle id or build number differs from the selected target settings.");
        if (fingerprintAppSource(source.root, sourceSelection(source.root, [realpathSync(input.outputDir), retainedRoot])) !== source.fingerprint)
          throw new Error("Target source changed during the build; build and capture it again.");
        steps.push({ name: "verify_build", ok: true });
      } catch (error) {
        steps.push({ name: "verify_build", ok: false, error: String(error) });
        return { steps };
      }
      const install = spawn("xcrun", ["simctl", "install", deviceId, product.appPath], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
      const installTranscript = writeIosSimulatorCommandTranscript(
        transcriptDirectory,
        "install",
        "xcrun",
        ["simctl", "install", deviceId, product.appPath],
        install,
      );
      steps.push({
        name: "install",
        ok: install.status === 0,
        error: install.status === 0 ? undefined : summarizeSpawn(install),
        transcriptPath: installTranscript,
      });
      if (install.status !== 0) return { steps };
      try {
        const container = spawn("xcrun", ["simctl", "get_app_container", deviceId, input.bundleId, "app"], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
        const readbackTranscript = writeIosSimulatorCommandTranscript(
          transcriptDirectory,
          "readback",
          "xcrun",
          ["simctl", "get_app_container", deviceId, input.bundleId, "app"],
          container,
        );
        if (container.status !== 0) throw new Error(summarizeSpawn(container));
        const installedAppPath = container.stdout.trim();
        if (!path.isAbsolute(installedAppPath) || !lstatSync(installedAppPath).isDirectory())
          throw new Error("Simulator did not return an installed application directory.");
        const readbackIdentity = installedIdentity(installedAppPath, product.infoPlistRelative);
        if (
          executableDigest(installedAppPath, product.executableRelative) !== binarySha256 ||
          bundleContentDigest(installedAppPath) !== bundleContentSha256 ||
          outputFingerprintPath(product.appPath) !== appFingerprint ||
          readbackIdentity.bundleId !== input.bundleId ||
          readbackIdentity.buildNumber !== product.buildNumber
        )
          throw new Error("The installed application does not match the fresh build, or the build changed during installation.");
        const installedBuild: InstalledSimulatorBuild = {
          deviceId,
          bundleId: input.bundleId,
          buildNumber: product.buildNumber,
          scheme,
          projectPath,
          derivedDataPath,
          appPath: product.appPath,
          appFingerprint,
          bundleContentSha256,
          installedAppPath,
          executable: { path: product.executableRelative, sha256: binarySha256 },
          source,
        };
        steps.push({ name: "verify_install", ok: true, installedBuild, transcriptPath: readbackTranscript });
      } catch (error) {
        steps.push({ name: "verify_install", ok: false, error: String(error) });
        return { steps };
      }
      const launch = spawn("xcrun", ["simctl", "launch", "--terminate-running-process", deviceId, input.bundleId], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
      const launchTranscript = writeIosSimulatorCommandTranscript(
        transcriptDirectory,
        "launch",
        "xcrun",
        ["simctl", "launch", "--terminate-running-process", deviceId, input.bundleId],
        launch,
      );
      steps.push({
        name: "launch",
        ok: launch.status === 0,
        error: launch.status === 0 ? undefined : summarizeSpawn(launch),
        transcriptPath: launchTranscript,
      });
      if (launch.status !== 0) return { steps };

      const screenshotPath = path.join(input.outputDir, "screenshot.png");
      const screenshot = spawn("xcrun", ["simctl", "io", deviceId, "screenshot", screenshotPath], { timeoutMs: SIMULATOR_COMMAND_TIMEOUT_MS });
      steps.push({
        name: "screenshot",
        ok: screenshot.status === 0,
        screenshotPath: screenshot.status === 0 ? screenshotPath : undefined,
        error: screenshot.status === 0 ? undefined : summarizeSpawn(screenshot),
      });
      return { steps };
    },
  };
}

/**
 * Rung 4: inspect one concrete target, install a prebuilt binary, launch it, and capture one
 * screenshot through MobAI. On Android, retain every fact MobAI can actually read and finish
 * with an explicit incomplete-proof step. The adapter verifies APK manifest identity before
 * installation, but MobAI 1.9.3 cannot prove source-to-build linkage or every field required by
 * the strict design-acceptance receipt.
 */
export function createMobaiCliAdapter(
  spawn: SpawnFn = defaultSpawn,
  inspectArtifact: AndroidArtifactInspector = (apkPath) => inspectAndroidApk(apkPath),
): DeviceProofAdapter {
  return {
    runFlow(input) {
      const steps: DeviceProofStep[] = [];
      let device: MobaiDeviceIdentity;
      try {
        device = input.mobaiDevice ?? inspectMobaiDevice(spawn, input.deviceName);
        if (input.requiredPlatform && device.platform !== input.requiredPlatform)
          throw new Error(`MobAI resolved an ${device.platform} device, but this proof requires ${input.requiredPlatform}.`);
        steps.push({ name: "resolve_device", ok: true });
      } catch (error) {
        steps.push({ name: "resolve_device", ok: false, error: String(error) });
        return { steps };
      }
      const deviceFlags = ["-d", device.id];
      const ensureBridge = (): boolean => {
        if (device.bridgeRunning === true) {
          steps.push({ name: "ensure_bridge", ok: true });
          return true;
        }
        const bridge = spawn("mobai", ["bridge", "start", ...deviceFlags]);
        if (bridge.status !== 0) {
          steps.push({ name: "ensure_bridge", ok: false, error: summarizeSpawn(bridge) });
          return false;
        }
        try {
          const refreshed = inspectMobaiDevice(spawn, device.id);
          if (refreshed.platform !== device.platform || refreshed.virtual !== device.virtual || refreshed.model !== device.model)
            throw new Error("MobAI device identity changed while starting the bridge.");
          if (refreshed.bridgeRunning === false) throw new Error("MobAI bridge is still not running after start.");
          device = refreshed;
          steps.push({ name: "ensure_bridge", ok: true });
          return true;
        } catch (error) {
          steps.push({ name: "ensure_bridge", ok: false, error: String(error) });
          return false;
        }
      };

      if (device.platform === "android") {
        if (!input.bundleId) {
          steps.push({ name: "verify_artifact", ok: false, error: "No Android package name was supplied." });
          return { steps };
        }
        if (!input.appPath) {
          steps.push({
            name: "verify_artifact",
            ok: false,
            error: "Android proof requires the exact APK installed in this run. Launching an already-installed package cannot prove build identity.",
          });
          return { steps };
        }

        let evidence: AndroidDeviceProofEvidence;
        try {
          const digested = digestAndroidArtifact(input.workspaceDir, input.outputDir, input.appPath, inspectArtifact);
          if (digested.artifact.packageName !== input.bundleId)
            throw new Error(`The APK application id is ${digested.artifact.packageName}, not requested package ${input.bundleId}.`);
          evidence = { device, packageName: input.bundleId, ...digested };
          steps.push({ name: "verify_artifact", ok: true, androidEvidence: evidence });
        } catch (error) {
          steps.push({ name: "verify_artifact", ok: false, error: String(error) });
          return { steps };
        }
        if (!ensureBridge()) return { steps };

        const install = spawn("mobai", ["app", "install", evidence.artifact!.path, "--json", ...deviceFlags]);
        steps.push({ name: "install", ok: install.status === 0, error: install.status === 0 ? undefined : summarizeSpawn(install) });
        if (install.status !== 0) return { steps };

        const appList = spawn("mobai", ["app", "list", "--json", ...deviceFlags]);
        if (appList.status !== 0) {
          steps.push({ name: "verify_install", ok: false, error: summarizeSpawn(appList) });
          return { steps };
        }
        let installedPackage: AndroidDeviceProofEvidence["installedPackage"];
        try {
          installedPackage = findInstalledAndroidPackage(JSON.parse(appList.stdout), input.bundleId);
        } catch (error) {
          steps.push({ name: "verify_install", ok: false, error: `MobAI app-list output was not JSON: ${String(error)}` });
          return { steps };
        }
        if (!installedPackage || installedPackage.versionCode !== evidence.artifact!.versionCode) {
          steps.push({
            name: "verify_install",
            ok: false,
            error: `MobAI did not read back ${input.bundleId} at exact versionCode ${evidence.artifact!.versionCode}.`,
          });
          return { steps };
        }
        evidence = { ...evidence, installedPackage };
        steps.push({ name: "verify_install", ok: true, androidEvidence: evidence });

        const launch = spawn("mobai", ["app", "launch", input.bundleId, "--json", ...deviceFlags]);
        steps.push({ name: "launch", ok: launch.status === 0, error: launch.status === 0 ? undefined : summarizeSpawn(launch) });
        if (launch.status !== 0) return { steps };

        const screenshot = spawn("mobai", ["screenshot", "--full", "--path", input.outputDir, "--name", "screenshot", "--json", ...deviceFlags]);
        const screenshotPath = path.join(input.outputDir, "screenshot.png");
        steps.push({
          name: "screenshot",
          ok: screenshot.status === 0,
          screenshotPath: screenshot.status === 0 ? screenshotPath : undefined,
          error: screenshot.status === 0 ? undefined : summarizeSpawn(screenshot),
        });
        if (screenshot.status !== 0) return { steps };

        const observation = spawn("mobai", ["observe", "--include", "activity,installed_apps", "--json", ...deviceFlags]);
        if (observation.status === 0) {
          try {
            const launchedActivity = findAndroidActivity(JSON.parse(observation.stdout), input.bundleId);
            evidence = { ...evidence, ...(launchedActivity ? { launchedActivity } : {}) };
            if (!launchedActivity) throw new Error(`MobAI did not read back a launched activity for ${input.bundleId}.`);
            steps.push({ name: "inspect_runtime", ok: true, androidEvidence: evidence });
          } catch (error) {
            steps.push({ name: "inspect_runtime", ok: false, error: `MobAI runtime output was not usable JSON: ${String(error)}`, androidEvidence: evidence });
            return { steps };
          }
        } else {
          steps.push({
            name: "inspect_runtime",
            ok: false,
            error: `MobAI runtime readback was unavailable: ${summarizeSpawn(observation)}`,
            androidEvidence: evidence,
          });
          return { steps };
        }

        const missing = [
          "source-to-APK build linkage",
          ...(!device.apiLevel ? ["Android API level"] : []),
          ...(!device.osBuild ? ["Android OS build"] : []),
          ...(!evidence.launchedActivity ? ["launched activity readback"] : []),
        ];
        steps.push({
          name: "strict_receipt",
          ok: false,
          error: `MobAI 1.9.3 completed bounded device actions but cannot produce the strict Android install receipt. Missing: ${missing.join(", ")}. The design workflow must collect and bind those fields before acceptance.`,
          androidEvidence: evidence,
        });
        return { steps };
      }

      if (!input.bundleId) {
        steps.push({ name: "launch", ok: false, error: "No bundle id was supplied to launch." });
        return { steps };
      }
      if (!ensureBridge()) return { steps };

      if (input.appPath) {
        const install = spawn("mobai", ["app", "install", input.appPath, ...deviceFlags]);
        steps.push({ name: "install", ok: install.status === 0, error: install.status === 0 ? undefined : summarizeSpawn(install) });
        if (install.status !== 0) return { steps };
      }

      const launch = spawn("mobai", ["app", "launch", input.bundleId, ...deviceFlags]);
      steps.push({ name: "launch", ok: launch.status === 0, error: launch.status === 0 ? undefined : summarizeSpawn(launch) });
      if (launch.status !== 0) return { steps };

      const screenshot = spawn("mobai", ["screenshot", "--full", "--path", input.outputDir, "--name", "screenshot", ...deviceFlags]);
      const screenshotPath = path.join(input.outputDir, "screenshot.png");
      steps.push({
        name: "screenshot",
        ok: screenshot.status === 0,
        screenshotPath: screenshot.status === 0 ? screenshotPath : undefined,
        error: screenshot.status === 0 ? undefined : summarizeSpawn(screenshot),
      });
      return { steps };
    },
  };
}

/** No subprocess at all — returns the scripted steps verbatim. The only adapter a fixture or `B2C_DEVICE_PROOF_ADAPTER=fixture` run ever exercises. */
export function createFixtureDeviceProofAdapter(steps: readonly DeviceProofStep[]): DeviceProofAdapter {
  return {
    runFlow() {
      return { steps: [...steps] };
    },
  };
}

/** Provider-neutral host route integration; concrete exposed tools remain explicit injections. */
export { createMobileOperationRoute, targetFromInstalledSimulatorBuild, targetFromMobaiIdentity } from "./mobile-operation.js";
export type { MobileOperationTransport } from "./mobile-operation.js";
