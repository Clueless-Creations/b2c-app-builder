/**
 * Local/dev runnable path for a selected Expo starter (#82).
 *
 * Runs only in an authorized disposable copy. Never executes Expo CLI against the builder
 * checkout. Web Metro export is the local boot proof. Device install, EAS, OTA, and store
 * submit are out of scope.
 *
 * Consumes `catalog/stacks/expo-starter.ts` and `catalog/stacks/expo-native-ownership.ts`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  NATIVE_COMPILE_STATUS,
  NATIVE_GENERATION_FINGERPRINT_BASENAME,
  decideExpoPrebuild,
  nativeTreeDigest,
  writeNativeGenerationFingerprint,
  type NativePlatform,
} from "./expo-native-ownership.js";
import { isExpoAppTarget, type CompositionTarget } from "./expo-selection.js";
import { installExpoStarterConsumer, materializeExpoStarterFixture, type PlanExpoStarterScaffoldInput } from "./expo-starter.js";

export const EXPO_WEB_EXPORT_OUTPUT_DIR = "dist-web";
export const EXPO_BOOT_COMPANION_PINS = {
  "@expo/metro-runtime": "57.0.14",
  "expo-dev-client": "57.0.16",
  "expo-haptics": "57.0.2",
  "expo-system-ui": "57.0.3",
  "react-dom": "19.2.3",
  "react-native-web": "0.21.2",
} as const;

export const IOS_DEVICE_INSTALL_HOLD =
  "iOS device or simulator install was not run. A physical device needs a signing identity; a simulator needs Xcode compile (`expo run:ios`) on macOS. Expo Go is not the acceptance path.";
export const ANDROID_DEVICE_INSTALL_HOLD =
  "Android emulator or device install was not run. A development client needs a local Android SDK compile (`expo run:android`) or an authorized EAS build. Expo Go is not the acceptance path.";

export interface ExpoLocalBootWebExport {
  attempted: boolean;
  ok: boolean;
  outputDir?: string;
  indexHtmlPresent: boolean;
  javascriptBundlePresent: boolean;
  reason?: string;
}

export interface ExpoLocalBootCng {
  attempted: boolean;
  platform?: NativePlatform;
  ok: boolean;
  autolinkMentioned: boolean;
  fingerprintWritten: boolean;
  reason?: string;
}

export interface ExpoLocalBootResult {
  kind: "expo-local-boot";
  status: "booted" | "scaffold-refused" | "install-failed" | "export-failed";
  lockfileGenerated: boolean;
  expoCliObserved: boolean;
  expoCliVersion?: string;
  webExport: ExpoLocalBootWebExport;
  cng: ExpoLocalBootCng;
  expoGoUsed: false;
  easUsed: false;
  nativeCompileStatus: typeof NATIVE_COMPILE_STATUS;
  deviceInstallHold: { ios: string; android: string };
  reason?: string;
}

const BOOT_ENV = { CI: "1", EXPO_NO_TELEMETRY: "1" } as const;
const CLI_TIMEOUT_MS = 180_000;
const PREBUILD_TIMEOUT_MS = 240_000;
const FILE_WALK_CAP = 400;

function spawnExpo(target: string, args: string[], timeout: number) {
  return spawnSync("npx", ["expo", ...args], {
    cwd: target,
    encoding: "utf8",
    timeout,
    env: { ...process.env, ...BOOT_ENV },
  });
}

function enableWebExportInDisposableAppJson(target: string): void {
  const appJsonPath = path.join(target, STATIC_APP_JSON);
  const parsed: unknown = JSON.parse(readFileSync(appJsonPath, "utf8"));
  if (!isRecord(parsed) || !isRecord(parsed.expo)) throw new Error("disposable app.json must contain expo");
  const platforms = Array.isArray(parsed.expo.platforms) ? parsed.expo.platforms.filter((value): value is string => typeof value === "string") : [];
  if (!platforms.includes("web")) platforms.push("web");
  parsed.expo.platforms = platforms;
  const web = isRecord(parsed.expo.web) ? parsed.expo.web : {};
  parsed.expo.web = { ...web, bundler: "metro", output: "static" };
  writeFileSync(appJsonPath, `${JSON.stringify(parsed, null, 2)}\n`);
}

const STATIC_APP_JSON = "app.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkRelativeFiles(root: string, relative: string, out: string[]): void {
  if (out.length > FILE_WALK_CAP) return;
  const dir = path.join(root, relative);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkRelativeFiles(root, child, out);
    else if (entry.isFile()) out.push(child);
  }
}

function directoryHasJavascriptBundle(outputDir: string): boolean {
  const files: string[] = [];
  walkRelativeFiles(outputDir, "", files);
  return files.some((file) => file.endsWith(".js"));
}

function observeExpoCliVersion(target: string): { observed: boolean; version?: string } {
  const result = spawnExpo(target, ["--version"], 30_000);
  if (result.status !== 0) return { observed: false };
  const version = (result.stdout || "").trim().split(/\s+/).pop();
  return version ? { observed: true, version } : { observed: false };
}

function prebuildDefaultRegenerates(version: string | undefined): boolean | "unknown" {
  if (!version) return "unknown";
  const match = /^(\d+)\./.exec(version);
  if (!match) return "unknown";
  return Number(match[1]) >= 57;
}

function autolinkingResolvesCustomModule(target: string, platform: NativePlatform): boolean {
  const resolvePlatform = platform === "ios" ? "apple" : "android";
  const result = spawnSync("npx", ["expo-modules-autolinking", "resolve", "--platform", resolvePlatform, "--json"], {
    cwd: target,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, ...BOOT_ENV },
  });
  if (result.status !== 0) return false;
  return (result.stdout || "").includes("b2c-native-capability");
}

function nativeTreeMentionsCustomModule(nativeRoot: string): boolean {
  const files: string[] = [];
  walkRelativeFiles(nativeRoot, "", files);
  const needles = ["B2cNativeCapability", "b2c-native-capability", "b2cnativecapability"];
  for (const relative of files.slice(0, FILE_WALK_CAP)) {
    if (relative.endsWith(".png") || relative.endsWith(".jar")) continue;
    const absolute = path.join(nativeRoot, relative);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 256 * 1024) continue;
    let text: string;
    try {
      text = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    if (needles.some((needle) => text.toLowerCase().includes(needle.toLowerCase()))) return true;
  }
  return false;
}

function emptyWebExport(): ExpoLocalBootWebExport {
  return { attempted: false, ok: false, indexHtmlPresent: false, javascriptBundlePresent: false };
}

function emptyCng(): ExpoLocalBootCng {
  return { attempted: false, ok: false, autolinkMentioned: false, fingerprintWritten: false };
}

function failedBoot(status: ExpoLocalBootResult["status"], reason: string, extra: Partial<ExpoLocalBootResult> = {}): ExpoLocalBootResult {
  return {
    kind: "expo-local-boot",
    status,
    lockfileGenerated: false,
    expoCliObserved: false,
    webExport: emptyWebExport(),
    cng: emptyCng(),
    expoGoUsed: false,
    easUsed: false,
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    deviceInstallHold: { ios: IOS_DEVICE_INSTALL_HOLD, android: ANDROID_DEVICE_INSTALL_HOLD },
    reason,
    ...extra,
  };
}

function nativePlatformOf(target: CompositionTarget): NativePlatform | undefined {
  if (target.platform === "ios" || target.platform === "android") return target.platform;
  return undefined;
}

function runWebExport(target: string): ExpoLocalBootWebExport {
  enableWebExportInDisposableAppJson(target);
  const outputDir = path.join(target, EXPO_WEB_EXPORT_OUTPUT_DIR);
  const result = spawnExpo(target, ["export", "--platform", "web", "--output-dir", EXPO_WEB_EXPORT_OUTPUT_DIR], CLI_TIMEOUT_MS);
  if (result.status !== 0) {
    return {
      attempted: true,
      ok: false,
      outputDir,
      indexHtmlPresent: false,
      javascriptBundlePresent: false,
      reason: (result.stderr || result.stdout || "expo export failed").trim().slice(-600),
    };
  }
  const indexHtmlPresent = existsSync(path.join(outputDir, "index.html"));
  const javascriptBundlePresent = directoryHasJavascriptBundle(outputDir);
  return {
    attempted: true,
    ok: indexHtmlPresent && javascriptBundlePresent,
    outputDir,
    indexHtmlPresent,
    javascriptBundlePresent,
    reason: indexHtmlPresent && javascriptBundlePresent ? undefined : "expo export exited 0 but dist-web lacked index.html or a JS bundle",
  };
}

function runCng(input: PlanExpoStarterScaffoldInput, expoCliVersion: string | undefined): ExpoLocalBootCng {
  const platform = nativePlatformOf(input.compositionTarget);
  if (!platform) {
    return { attempted: false, ok: false, autolinkMentioned: false, fingerprintWritten: false, reason: "web composition has no native project" };
  }
  const decision = decideExpoPrebuild({
    target: input.target,
    skillRoot: input.skillRoot,
    compositionTarget: input.compositionTarget,
    platform,
    executedCli: {
      observed: Boolean(expoCliVersion),
      version: expoCliVersion,
      prebuildDefaultRegenerates: prebuildDefaultRegenerates(expoCliVersion),
    },
  });
  if (decision.action !== "allow-generate") {
    return {
      attempted: false,
      ok: false,
      autolinkMentioned: false,
      fingerprintWritten: false,
      reason: decision.reason,
    };
  }
  const result = spawnExpo(input.target, ["prebuild", "--platform", platform, "--no-install"], PREBUILD_TIMEOUT_MS);
  if (result.status !== 0) {
    return {
      attempted: true,
      platform,
      ok: false,
      autolinkMentioned: false,
      fingerprintWritten: false,
      reason: (result.stderr || result.stdout || "expo prebuild failed").trim().slice(-600),
    };
  }
  const nativeRoot = path.join(input.target, platform);
  const digest = nativeTreeDigest(nativeRoot);
  const autolinkMentioned = autolinkingResolvesCustomModule(input.target, platform) || nativeTreeMentionsCustomModule(nativeRoot);
  let fingerprintWritten = false;
  if (digest.status === "computed" && digest.digest) {
    writeFileSync(
      path.join(input.target, NATIVE_GENERATION_FINGERPRINT_BASENAME),
      `${JSON.stringify(writeNativeGenerationFingerprint({ [platform]: digest.digest }), null, 2)}\n`,
    );
    fingerprintWritten = true;
  }
  return {
    attempted: true,
    platform,
    ok: existsSync(nativeRoot) && fingerprintWritten,
    autolinkMentioned,
    fingerprintWritten,
    reason: fingerprintWritten ? undefined : "prebuild exited 0 but no native digest/fingerprint was written",
  };
}

export function inspectExpoBootCompanionPins(dependencies: Record<string, string> | undefined): {
  mismatched: readonly string[];
} {
  const mismatched: string[] = [];
  for (const name of Object.keys(EXPO_BOOT_COMPANION_PINS) as (keyof typeof EXPO_BOOT_COMPANION_PINS)[]) {
    if (dependencies?.[name] !== EXPO_BOOT_COMPANION_PINS[name]) {
      mismatched.push(`${name}=${dependencies?.[name] ?? "missing"}`);
    }
  }
  return { mismatched };
}

export function runExpoStarterLocalBoot(input: PlanExpoStarterScaffoldInput): ExpoLocalBootResult {
  if (!input.authorized) return failedBoot("scaffold-refused", "Local Expo boot requires explicit authorization.");
  if (!isExpoAppTarget(input.compositionTarget)) {
    return failedBoot("scaffold-refused", `Composition target ${input.compositionTarget.platform}/${input.compositionTarget.runtime} did not select Expo.`);
  }
  const installed = installExpoStarterConsumer({ ...input, ignoreScripts: false });
  if (installed.status !== "installed") {
    return failedBoot(installed.status === "scaffold-refused" ? "scaffold-refused" : "install-failed", installed.reason ?? "install failed", {
      lockfileGenerated: installed.lockfileGenerated,
    });
  }
  const cli = observeExpoCliVersion(input.target);
  const webExport = runWebExport(input.target);
  if (!webExport.ok) {
    return {
      kind: "expo-local-boot",
      status: "export-failed",
      lockfileGenerated: installed.lockfileGenerated,
      expoCliObserved: cli.observed,
      expoCliVersion: cli.version,
      webExport,
      cng: emptyCng(),
      expoGoUsed: false,
      easUsed: false,
      nativeCompileStatus: NATIVE_COMPILE_STATUS,
      deviceInstallHold: { ios: IOS_DEVICE_INSTALL_HOLD, android: ANDROID_DEVICE_INSTALL_HOLD },
      reason: webExport.reason,
    };
  }
  const cng = runCng(input, cli.version);
  return {
    kind: "expo-local-boot",
    status: "booted",
    lockfileGenerated: installed.lockfileGenerated,
    expoCliObserved: cli.observed,
    expoCliVersion: cli.version,
    webExport,
    cng,
    expoGoUsed: false,
    easUsed: false,
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    deviceInstallHold: { ios: IOS_DEVICE_INSTALL_HOLD, android: ANDROID_DEVICE_INSTALL_HOLD },
  };
}

export function localBootDoesNotUseExpoGo(result: ExpoLocalBootResult): boolean {
  return result.expoGoUsed === false && result.easUsed === false;
}

/** Re-export for callers that already materialized without installExpoStarterConsumer. */
export function ensureDisposableStarterPresent(input: PlanExpoStarterScaffoldInput): void {
  materializeExpoStarterFixture(input);
}
