/**
 * Expo custom native-module boundary (#82).
 *
 * Inspects a local Swift/Kotlin module and its TypeScript/web path without importing
 * expo-modules-core, executing plugins, or compiling native code. Autolinking and
 * development-client rebuild stay unverified. Web is selected through package.json
 * `browser` → `src/index.web.ts`, not `main`.
 *
 * Consumes `catalog/stacks/expo-selection.ts`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EXPO_IS_DEFAULT_STACK,
  isExpoAppTarget,
  shippingSatisfiesRequirement,
  type CompositionTarget,
  type ShippingPlatform,
} from "./expo-selection.js";
import {
  BUILDER_PACKAGE_NAME,
  NATIVE_COMPILE_STATUS,
  STATIC_JSON_BYTE_CAP,
  isBuilderCheckoutPath,
  packageJsonHasExactDependency,
} from "./expo-native-ownership.js";
import { EXPO_STARTER_FIXTURE_DIR, MARKETING_OR_BACKEND_DEPENDENCIES } from "./expo-starter.js";

export const EXPO_CUSTOM_MODULE_DIR = "modules/b2c-native-capability";
export const EXPO_CUSTOM_MODULE_FILES = [
  `${EXPO_CUSTOM_MODULE_DIR}/package.json`,
  `${EXPO_CUSTOM_MODULE_DIR}/NOTICE`,
  `${EXPO_CUSTOM_MODULE_DIR}/expo-module.config.json`,
  `${EXPO_CUSTOM_MODULE_DIR}/src/index.ts`,
  `${EXPO_CUSTOM_MODULE_DIR}/src/index.web.ts`,
  `${EXPO_CUSTOM_MODULE_DIR}/src/capability.ts`,
  `${EXPO_CUSTOM_MODULE_DIR}/src/invoke.ts`,
  `${EXPO_CUSTOM_MODULE_DIR}/ios/B2cNativeCapabilityModule.swift`,
  `${EXPO_CUSTOM_MODULE_DIR}/android/src/main/java/app/example/b2cnativecapability/B2cNativeCapabilityModule.kt`,
] as const;

export const EXPO_CUSTOM_MODULE_NAME = "B2cNativeCapability";
export const NATIVE_MODULES_DIR = "./modules";
export const EXPO_PACKAGE_MANAGER = "npm";
export const METRO_NATIVE_ENTRY = "src/index.ts";
export const METRO_WEB_ENTRY = "src/index.web.ts";
export const WEB_MAIN_FIELDS = ["browser", "module", "main"] as const;
export const NATIVE_MAIN_FIELDS = ["react-native", "main"] as const;

export interface MetroPackageEntries {
  main?: string;
  browser?: string;
  reactNative?: string;
}

export function resolveMetroPackageEntry(
  platform: "ios" | "android" | "web",
  entries: MetroPackageEntries,
): { field: "browser" | "react-native" | "main"; path: string } | undefined {
  if (platform === "web") {
    if (entries.browser) return { field: "browser", path: entries.browser };
    return entries.main ? { field: "main", path: entries.main } : undefined;
  }
  if (entries.reactNative) return { field: "react-native", path: entries.reactNative };
  return entries.main ? { field: "main", path: entries.main } : undefined;
}

export type CustomModuleLayoutStatus = "boundary-ready" | "incomplete" | "web-false-parity";
export type CustomModuleAction = "boundary-ready" | "unsupported-on-web" | "rebuild-required" | "refuse";
export type CustomModuleRefusalCode =
  | "builder-checkout"
  | "expo-not-selected"
  | "expo-is-not-default"
  | "existing-marketing-or-backend"
  | "incomplete-boundary"
  | "web-false-parity"
  | "ios-does-not-prove-android"
  | "android-does-not-prove-ios"
  | "executed-binary-unverified"
  | "fabricated-modules-core-pin";

export type BinaryModulePresence = boolean | "unknown";

export interface CustomModuleLayoutReport {
  filesPresent: readonly string[];
  missingFiles: readonly string[];
  iosSourcePresent: boolean;
  androidSourcePresent: boolean;
  webSourcePresent: boolean;
  webUnsupported: boolean;
  configOmitsWeb: boolean;
  metroWebEntry: string | undefined;
  metroNativeEntry: string | undefined;
  metroReactNativeEntry: string | undefined;
  requireNativeModulePresent: boolean;
  lifecyclePresent: boolean;
  eventsPresent: boolean;
  fabricatedModulesCorePin: boolean;
  status: CustomModuleLayoutStatus;
  nativeCompileStatus: typeof NATIVE_COMPILE_STATUS;
  autolinkingVerified: false;
}

export interface CustomModuleDecision {
  action: CustomModuleAction;
  layout: CustomModuleLayoutStatus;
  code?: CustomModuleRefusalCode;
  reason: string;
  nativeCompileStatus: typeof NATIVE_COMPILE_STATUS;
  autolinkingVerified: false;
  runtimeVerified: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lstatIfPresent(target: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(target);
  } catch {
    return undefined;
  }
}

function readOptionalText(target: string): string | undefined {
  const stat = lstatIfPresent(target);
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size > STATIC_JSON_BYTE_CAP) return undefined;
  try {
    return readFileSync(target, "utf8");
  } catch {
    return undefined;
  }
}

function presentRelativeFiles(root: string, files: readonly string[]): string[] {
  return files.filter((relative) => {
    const stat = lstatIfPresent(path.join(root, relative));
    return Boolean(stat && stat.isFile() && !stat.isSymbolicLink());
  });
}

function configOmitsWeb(configText: string | undefined): boolean {
  if (!configText) return false;
  try {
    const parsed: unknown = JSON.parse(configText);
    if (!isRecord(parsed) || !Array.isArray(parsed.platforms)) return false;
    return parsed.platforms.every((value) => value === "apple" || value === "android" || value === "ios") && !parsed.platforms.includes("web");
  } catch {
    return false;
  }
}

function webPathIsUnsupported(webText: string | undefined, capabilityText: string | undefined): boolean {
  if (!webText || !capabilityText) return false;
  return (
    webText.includes("unsupportedOnWeb") &&
    capabilityText.includes("unsupported-on-web") &&
    !webText.includes("requireNativeModule") &&
    !webText.includes("native-boundary-ready")
  );
}

function modulePackageEntries(packageJsonText: string | undefined): MetroPackageEntries {
  if (!packageJsonText) return {};
  try {
    const parsed: unknown = JSON.parse(packageJsonText);
    if (!isRecord(parsed)) return {};
    return {
      main: typeof parsed.main === "string" ? parsed.main : undefined,
      browser: typeof parsed.browser === "string" ? parsed.browser : undefined,
      reactNative: typeof parsed["react-native"] === "string" ? parsed["react-native"] : undefined,
    };
  } catch {
    return {};
  }
}

function sourceDeclaresLifecycleAndEvents(text: string | undefined): boolean {
  return Boolean(text && text.includes("OnCreate") && text.includes("OnDestroy") && text.includes("onCapabilityError"));
}

function fabricatedModulesCorePin(packageJsonText: string | undefined): boolean {
  if (!packageJsonText) return false;
  if (!packageJsonHasExactDependency(packageJsonText, "expo-modules-core")) return false;
  try {
    const parsed: unknown = JSON.parse(packageJsonText);
    if (!isRecord(parsed)) return false;
    for (const field of ["dependencies", "devDependencies"] as const) {
      const block = parsed[field];
      if (isRecord(block) && (block["expo-modules-core"] === "latest" || block["expo-modules-core"] === "*")) return true;
    }
  } catch {
    return true;
  }
  return false;
}

export function inspectExpoCustomModule(target: string): CustomModuleLayoutReport {
  const filesPresent = presentRelativeFiles(target, EXPO_CUSTOM_MODULE_FILES);
  const missingFiles = EXPO_CUSTOM_MODULE_FILES.filter((file) => !filesPresent.includes(file));
  const iosText = readOptionalText(path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/ios/B2cNativeCapabilityModule.swift`));
  const androidText = readOptionalText(
    path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/android/src/main/java/app/example/b2cnativecapability/B2cNativeCapabilityModule.kt`),
  );
  const webText = readOptionalText(path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/src/index.web.ts`));
  const nativeEntryText = readOptionalText(path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/src/index.ts`));
  const capabilityText = readOptionalText(path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/src/capability.ts`));
  const configText = readOptionalText(path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/expo-module.config.json`));
  const modulePkg = readOptionalText(path.join(target, `${EXPO_CUSTOM_MODULE_DIR}/package.json`));
  const appPkg = readOptionalText(path.join(target, "package.json"));
  const entries = modulePackageEntries(modulePkg);
  const iosSourcePresent = Boolean(iosText?.includes(EXPO_CUSTOM_MODULE_NAME));
  const androidSourcePresent = Boolean(androidText?.includes(EXPO_CUSTOM_MODULE_NAME));
  const requireNativeModulePresent = Boolean(
    nativeEntryText?.includes("requireNativeModule") && nativeEntryText.includes(EXPO_CUSTOM_MODULE_NAME),
  );
  const metroSelectsNative = entries.main === METRO_NATIVE_ENTRY && entries.reactNative === METRO_NATIVE_ENTRY;
  const metroSelectsWeb = entries.browser === METRO_WEB_ENTRY && metroSelectsNative;
  const webUnsupported = webPathIsUnsupported(webText, capabilityText) && metroSelectsWeb;
  const omitsWeb = configOmitsWeb(configText);
  let status: CustomModuleLayoutStatus = "boundary-ready";
  if (!webUnsupported || !omitsWeb || !metroSelectsWeb || !metroSelectsNative) status = "web-false-parity";
  else if (missingFiles.length > 0 || !iosSourcePresent || !androidSourcePresent || !requireNativeModulePresent) status = "incomplete";
  return {
    filesPresent,
    missingFiles,
    iosSourcePresent,
    androidSourcePresent,
    webSourcePresent: Boolean(webText),
    webUnsupported,
    configOmitsWeb: omitsWeb,
    metroWebEntry: entries.browser,
    metroNativeEntry: entries.main,
    metroReactNativeEntry: entries.reactNative,
    requireNativeModulePresent,
    lifecyclePresent: sourceDeclaresLifecycleAndEvents(iosText) && sourceDeclaresLifecycleAndEvents(androidText),
    eventsPresent: Boolean(iosText?.includes("Events") && androidText?.includes("Events")),
    fabricatedModulesCorePin: fabricatedModulesCorePin(modulePkg) || fabricatedModulesCorePin(appPkg),
    status,
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    autolinkingVerified: false,
  };
}

export interface PackagedExpoStarterReport {
  kind: "pack-file-list";
  packageManager: typeof EXPO_PACKAGE_MANAGER;
  lockfileInFixture: boolean;
  packed: readonly string[];
  missing: readonly string[];
}

export function inspectPackagedExpoStarter(skillRoot: string): PackagedExpoStarterReport {
  const fixtureRoot = path.join(skillRoot, "catalog/stacks/expo-starter-fixture");
  const lockfileInFixture = Boolean(lstatIfPresent(path.join(fixtureRoot, "package-lock.json")));
  const required = EXPO_CUSTOM_MODULE_FILES.map((relative) => `catalog/stacks/expo-starter-fixture/${relative}`);
  const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: skillRoot, encoding: "utf8", timeout: 120_000 });
  let packed: string[] = [];
  if (pack.status === 0) {
    try {
      const parsed = JSON.parse(pack.stdout) as Array<{ files?: Array<{ path: string }> }>;
      packed = (parsed[0]?.files ?? []).map((file) => file.path);
    } catch {
      packed = [];
    }
  }
  return {
    kind: "pack-file-list",
    packageManager: EXPO_PACKAGE_MANAGER,
    lockfileInFixture,
    packed,
    missing: required.filter((relative) => !packed.includes(relative)),
  };
}

export interface PackagedExpoConsumerInstall {
  kind: "packaged-consumer-install";
  packageManager: typeof EXPO_PACKAGE_MANAGER;
  status: "installed" | "pack-failed" | "install-failed";
  tarball?: string;
  installedRoot?: string;
  present: readonly string[];
  missing: readonly string[];
  lockfileInFixture: boolean;
  expoInstalledGlobally: false;
  nativeCompileStatus: typeof NATIVE_COMPILE_STATUS;
  reason?: string;
}

function requiredConsumerStarterFiles(): string[] {
  return EXPO_CUSTOM_MODULE_FILES.map((relative) => `catalog/stacks/expo-starter-fixture/${relative}`);
}

function packTarballFilename(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as Array<{ filename?: string }>;
    if (typeof parsed[0]?.filename === "string") return parsed[0].filename;
  } catch {
    // npm pack --json may print extra lines; fall through to the last .tgz token
  }
  const match = stdout.trim().split(/\s+/).find((token) => token.endsWith(".tgz"));
  return match;
}

export function installPackagedExpoConsumer(input: {
  skillRoot: string;
  packDir: string;
  consumerDir: string;
}): PackagedExpoConsumerInstall {
  const fixtureRoot = path.join(input.skillRoot, "catalog/stacks/expo-starter-fixture");
  const lockfileInFixture = Boolean(lstatIfPresent(path.join(fixtureRoot, "package-lock.json")));
  const required = requiredConsumerStarterFiles();
  const failed = (
    status: "pack-failed" | "install-failed",
    reason: string,
    extra: Partial<PackagedExpoConsumerInstall> = {},
  ): PackagedExpoConsumerInstall => ({
    kind: "packaged-consumer-install",
    packageManager: EXPO_PACKAGE_MANAGER,
    status,
    present: [],
    missing: required,
    lockfileInFixture,
    expoInstalledGlobally: false,
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    reason,
    ...extra,
  });
  mkdirSync(input.packDir, { recursive: true });
  mkdirSync(input.consumerDir, { recursive: true });
  const pack = spawnSync("npm", ["pack", "--pack-destination", input.packDir, "--json"], {
    cwd: input.skillRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (pack.status !== 0) {
    return failed("pack-failed", (pack.stderr || pack.stdout || "npm pack failed").trim().slice(-400));
  }
  const filename = packTarballFilename(pack.stdout) ?? readdirSync(input.packDir).find((name) => name.endsWith(".tgz"));
  if (!filename) return failed("pack-failed", "npm pack wrote no tarball");
  const tarball = path.join(input.packDir, path.basename(filename));
  if (!existsSync(tarball)) return failed("pack-failed", `tarball missing at ${tarball}`);
  writeFileSync(
    path.join(input.consumerDir, "package.json"),
    `${JSON.stringify({ name: "b2c-expo-foundation-consumer", private: true, version: "0.0.0" }, null, 2)}\n`,
  );
  const install = spawnSync(
    "npm",
    ["install", tarball, "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--prefer-offline"],
    { cwd: input.consumerDir, encoding: "utf8", timeout: 180_000 },
  );
  if (install.status !== 0) {
    return failed("install-failed", (install.stderr || install.stdout || "npm install failed").trim().slice(-400), { tarball });
  }
  const installedRoot = path.join(input.consumerDir, "node_modules", BUILDER_PACKAGE_NAME);
  const present = required.filter((relative) => existsSync(path.join(installedRoot, relative)));
  return {
    kind: "packaged-consumer-install",
    packageManager: EXPO_PACKAGE_MANAGER,
    status: "installed",
    tarball,
    installedRoot,
    present,
    missing: required.filter((relative) => !present.includes(relative)),
    lockfileInFixture,
    expoInstalledGlobally: false,
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
  };
}

export function isolatedStarterCustomModule(): CustomModuleLayoutReport {
  return inspectExpoCustomModule(EXPO_STARTER_FIXTURE_DIR);
}

function marketingOrBackend(packageJsonText: string | undefined): boolean {
  if (!packageJsonText) return false;
  return MARKETING_OR_BACKEND_DEPENDENCIES.some((name) => packageJsonHasExactDependency(packageJsonText, name));
}

export function decideExpoCustomModule(input: {
  target: string;
  skillRoot: string;
  compositionTarget: CompositionTarget;
  claimedProofPlatform?: ShippingPlatform;
  nativeModulePresentInBinary?: BinaryModulePresence;
}): CustomModuleDecision {
  const layout = inspectExpoCustomModule(input.target);
  const runtimeVerified = false as const;
  const refuse = (code: CustomModuleRefusalCode, reason: string): CustomModuleDecision => ({
    action: "refuse",
    layout: layout.status,
    code,
    reason,
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    autolinkingVerified: false,
    runtimeVerified,
  });
  if (EXPO_IS_DEFAULT_STACK) {
    return refuse("expo-is-not-default", "Expo must remain selectable, not default.");
  }
  if (isBuilderCheckoutPath(input.target, input.skillRoot)) {
    return refuse("builder-checkout", "Refuse treating the builder checkout as a native module host.");
  }
  const selectedPlatform = input.compositionTarget.platform;
  if (!isExpoAppTarget(input.compositionTarget) || selectedPlatform === "host") {
    return refuse(
      "expo-not-selected",
      `Composition target ${input.compositionTarget.platform}/${input.compositionTarget.runtime} did not select Expo. ${BUILDER_PACKAGE_NAME} does not auto-migrate.`,
    );
  }
  if (marketingOrBackend(readOptionalText(path.join(input.target, "package.json")))) {
    return refuse("existing-marketing-or-backend", "A custom native module does not replace a separately selected marketing site or backend.");
  }
  if (layout.fabricatedModulesCorePin) {
    return refuse("fabricated-modules-core-pin", "Do not invent an expo-modules-core version from /latest/.");
  }
  if (layout.status === "web-false-parity") {
    return refuse("web-false-parity", "Web must be an explicit unsupported path, not a fake native implementation.");
  }
  if (layout.status === "incomplete") {
    return refuse("incomplete-boundary", "Swift, Kotlin, TypeScript boundary, and web unsupported files are required.");
  }
  if (input.claimedProofPlatform && !shippingSatisfiesRequirement(selectedPlatform, input.claimedProofPlatform)) {
    if (selectedPlatform === "web" || input.claimedProofPlatform === "web") {
      return refuse("web-false-parity", "A web export or browser screenshot does not prove a native module.");
    }
    if (selectedPlatform === "ios" || input.claimedProofPlatform === "android") {
      return refuse("ios-does-not-prove-android", "An iOS screenshot or export does not prove Android.");
    }
    return refuse("android-does-not-prove-ios", "An Android screenshot or export does not prove iOS.");
  }
  if (selectedPlatform === "web") {
    return {
      action: "unsupported-on-web",
      layout: layout.status,
      reason: "B2cNativeCapability is native-only. Web stays explicitly unsupported.",
      nativeCompileStatus: NATIVE_COMPILE_STATUS,
      autolinkingVerified: false,
      runtimeVerified,
    };
  }
  if (selectedPlatform === "ios" && !layout.iosSourcePresent) {
    return refuse("incomplete-boundary", "iOS composition requires the Swift module source.");
  }
  if (selectedPlatform === "android" && !layout.androidSourcePresent) {
    return refuse("incomplete-boundary", "Android composition requires the Kotlin module source.");
  }
  const binary = input.nativeModulePresentInBinary ?? "unknown";
  if (binary === false) {
    return {
      action: "rebuild-required",
      layout: layout.status,
      reason: "The custom native module is missing from this binary. Rebuild a development client. JavaScript cannot substitute for the native module.",
      nativeCompileStatus: NATIVE_COMPILE_STATUS,
      autolinkingVerified: false,
      runtimeVerified,
    };
  }
  if (binary === "unknown") {
    return refuse("executed-binary-unverified", "Module sources are present. Native compile and autolinking were not run, so the binary stays unknown.");
  }
  return {
    action: "boundary-ready",
    layout: layout.status,
    reason: "TypeScript boundary may call the native module when a matching binary is declared. Compile and autolinking remain unverified.",
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    autolinkingVerified: false,
    runtimeVerified,
  };
}
