/**
 * Expo native-directory ownership (#82).
 *
 * Classify `ios/` and `android/` before any prebuild. This module never executes `app.config.js`,
 * `app.config.ts`, config plugins, Expo CLI, or `expo prebuild`. Passive discovery stays the
 * package.json `expo` dependency. `--no-clean` is not a merge of authored native edits.
 *
 * Consumes `catalog/stacks/expo-selection.ts`. Does not invent `product.platforms`.
 */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { isExpoAppTarget, type CompositionTarget, type ShippingPlatform } from "./expo-selection.js";

export const NATIVE_PLATFORMS = ["ios", "android"] as const;
export type NativePlatform = (typeof NATIVE_PLATFORMS)[number];

export const DYNAMIC_CONFIG_BASENAMES = ["app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"] as const;
export const STATIC_APP_CONFIG_BASENAME = "app.json";
export const NATIVE_GENERATION_FINGERPRINT_BASENAME = ".b2c-native-generation.json";
export const OWNERSHIP_EXTRA_KEY = "b2cNativeDirectoryOwnership";
export const BUILDER_PACKAGE_NAME = "b2c-app-builder";
export const NATIVE_FILE_BYTE_CAP = 256 * 1024;
export const NATIVE_FILE_COUNT_CAP = 400;
export const STATIC_JSON_BYTE_CAP = 64 * 1024;
export const NATIVE_COMPILE_STATUS = "not-run" as const;

export type NativeOwnershipKind = "not-expo" | "absent-cng-candidate" | "generated-cng" | "maintained" | "dirty-unreviewed" | "unresolved";

export type DeclaredNativeOwnership = "generated-cng" | "maintained";

export type PrebuildAction = "allow-generate" | "allow-regenerate" | "refuse" | "not-applicable";

export type PrebuildRefusalCode =
  | "builder-checkout"
  | "expo-not-selected"
  | "web-has-no-native-project"
  | "dirty-unreviewed"
  | "unresolved-ownership"
  | "maintained-native"
  | "no-clean-is-not-merge"
  | "executed-cli-unverified"
  | "destructive-regeneration-not-authorized"
  | "fingerprint-mismatch";

export interface ExecutedExpoCli {
  observed: boolean;
  version?: string;
  prebuildDefaultRegenerates?: boolean | "unknown";
}

export interface NativeGenerationFingerprint {
  schemaVersion: 1;
  ownership: "generated-cng";
  platforms: Partial<Record<NativePlatform, string>>;
}

export interface PlatformNativeState {
  platform: NativePlatform;
  present: boolean;
  ownership: NativeOwnershipKind;
  digest?: string;
  digestStatus: "absent" | "computed" | "unreadable";
}

export interface ExpoNativeOwnershipReport {
  expoDependencyPresent: boolean;
  appStackSelected: boolean;
  builderCheckout: boolean;
  dynamicConfigPresent: readonly string[];
  staticAppJsonPresent: boolean;
  declaredOwnership: DeclaredNativeOwnership | undefined;
  fingerprint: NativeGenerationFingerprint | undefined;
  platforms: readonly PlatformNativeState[];
  overall: NativeOwnershipKind;
  pluginsDeclaredNotExecuted: boolean;
  nativeCompileStatus: typeof NATIVE_COMPILE_STATUS;
}

export interface PrebuildDecision {
  action: PrebuildAction;
  platform: NativePlatform | "web";
  overall: NativeOwnershipKind;
  code?: PrebuildRefusalCode;
  reason: string;
  execution: typeof NATIVE_COMPILE_STATUS;
}

export interface InspectNativeOwnershipInput {
  target: string;
  skillRoot: string;
  compositionTarget: CompositionTarget;
}

export interface DecidePrebuildInput extends InspectNativeOwnershipInput {
  platform: NativePlatform | "web";
  noClean?: boolean;
  destructiveRegenerationAuthorized?: boolean;
  executedCli?: ExecutedExpoCli;
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

function readBoundedFile(target: string, cap: number): string | undefined {
  const stat = lstatIfPresent(target);
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size > cap) return undefined;
  try {
    return readFileSync(target, "utf8");
  } catch {
    return undefined;
  }
}

function parseJsonObject(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function packageJsonHasExpoDependency(packageJsonText: string): boolean {
  const parsed = parseJsonObject(packageJsonText);
  if (!parsed) return false;
  for (const field of ["dependencies", "devDependencies"] as const) {
    const block = parsed[field];
    if (isRecord(block) && typeof block.expo === "string") return true;
  }
  return false;
}

export function packageJsonHasExactDependency(packageJsonText: string, name: string): boolean {
  const parsed = parseJsonObject(packageJsonText);
  if (!parsed) return false;
  for (const field of ["dependencies", "devDependencies"] as const) {
    const block = parsed[field];
    if (isRecord(block) && typeof block[name] === "string") return true;
  }
  return false;
}

export function resolvedPath(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

export function isBuilderCheckoutPath(target: string, skillRoot: string): boolean {
  const root = resolvedPath(skillRoot);
  const current = resolvedPath(target);
  if (current === root || current.startsWith(`${root}${path.sep}`)) return true;
  const pkg = readBoundedFile(path.join(current, "package.json"), STATIC_JSON_BYTE_CAP);
  if (!pkg) return false;
  const parsed = parseJsonObject(pkg);
  return parsed?.name === BUILDER_PACKAGE_NAME;
}

function declaredOwnershipFromAppJson(appJson: Record<string, unknown> | undefined): DeclaredNativeOwnership | undefined {
  const expo = isRecord(appJson?.expo) ? appJson.expo : appJson;
  if (!isRecord(expo)) return undefined;
  const extra = expo.extra;
  if (!isRecord(extra)) return undefined;
  const value = extra[OWNERSHIP_EXTRA_KEY];
  if (value === "generated-cng" || value === "maintained") return value;
  return undefined;
}

function pluginsDeclared(appJson: Record<string, unknown> | undefined): boolean {
  const expo = isRecord(appJson?.expo) ? appJson.expo : appJson;
  if (!isRecord(expo)) return false;
  return Array.isArray(expo.plugins) && expo.plugins.length > 0;
}

function readFingerprint(target: string): NativeGenerationFingerprint | undefined {
  const parsed = parseJsonObject(readBoundedFile(path.join(target, NATIVE_GENERATION_FINGERPRINT_BASENAME), STATIC_JSON_BYTE_CAP));
  if (!parsed) return undefined;
  if (parsed.schemaVersion !== 1 || parsed.ownership !== "generated-cng" || !isRecord(parsed.platforms)) return undefined;
  const platforms: Partial<Record<NativePlatform, string>> = {};
  for (const platform of NATIVE_PLATFORMS) {
    const digest = parsed.platforms[platform];
    if (digest === undefined) continue;
    if (typeof digest !== "string" || digest.length === 0) return undefined;
    platforms[platform] = digest;
  }
  if (Object.keys(platforms).length === 0) return undefined;
  return { schemaVersion: 1, ownership: "generated-cng", platforms };
}

function walkNativeFiles(
  dir: string,
  relative: string,
  files: Array<{ relative: string; bytes: Buffer }>,
  state: { count: number; unreadable: boolean },
): void {
  if (state.unreadable || state.count > NATIVE_FILE_COUNT_CAP) {
    state.unreadable = true;
    return;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    state.unreadable = true;
    return;
  }
  const skipped = new Set(["node_modules", "Pods", "build", ".git", ".gradle", "DerivedData"]);
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (skipped.has(entry.name) || entry.name.startsWith(".")) continue;
    const absolute = path.join(dir, entry.name);
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      state.unreadable = true;
      return;
    }
    if (entry.isDirectory()) {
      walkNativeFiles(absolute, childRelative, files, state);
      continue;
    }
    if (!entry.isFile()) {
      state.unreadable = true;
      return;
    }
    const stat = lstatIfPresent(absolute);
    if (!stat || stat.isSymbolicLink() || stat.size > NATIVE_FILE_BYTE_CAP) {
      state.unreadable = true;
      return;
    }
    try {
      files.push({ relative: childRelative, bytes: readFileSync(absolute) });
      state.count += 1;
    } catch {
      state.unreadable = true;
      return;
    }
  }
}

export function nativeTreeDigest(nativeRoot: string): { digest?: string; status: "absent" | "computed" | "unreadable" } {
  const stat = lstatIfPresent(nativeRoot);
  if (!stat) return { status: "absent" };
  if (stat.isSymbolicLink() || !stat.isDirectory()) return { status: "unreadable" };
  const files: Array<{ relative: string; bytes: Buffer }> = [];
  const state = { count: 0, unreadable: false };
  walkNativeFiles(nativeRoot, "", files, state);
  if (state.unreadable || state.count > NATIVE_FILE_COUNT_CAP) return { status: "unreadable" };
  const hash = createHash("sha256");
  for (const file of files.sort((left, right) => left.relative.localeCompare(right.relative))) {
    hash.update(file.relative);
    hash.update("\0");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), status: "computed" };
}

function platformOwnership(args: {
  platform: NativePlatform;
  expoDependencyPresent: boolean;
  present: boolean;
  declared: DeclaredNativeOwnership | undefined;
  digest?: string;
  digestStatus: "absent" | "computed" | "unreadable";
  fingerprint: NativeGenerationFingerprint | undefined;
}): NativeOwnershipKind {
  if (!args.expoDependencyPresent) return "not-expo";
  if (args.digestStatus === "unreadable") return "unresolved";
  if (!args.present) return "absent-cng-candidate";
  if (args.declared === "maintained") return "maintained";
  if (args.declared === "generated-cng") {
    const recorded = args.fingerprint?.platforms[args.platform];
    if (!recorded || args.digestStatus !== "computed" || args.digest !== recorded) return "dirty-unreviewed";
    return "generated-cng";
  }
  return "unresolved";
}

function combineOwnership(states: readonly PlatformNativeState[], expoDependencyPresent: boolean): NativeOwnershipKind {
  if (!expoDependencyPresent) return "not-expo";
  const present = states.filter((state) => state.present);
  if (present.length === 0) return "absent-cng-candidate";
  const kinds = new Set(present.map((state) => state.ownership));
  if (kinds.has("dirty-unreviewed")) return "dirty-unreviewed";
  if (kinds.has("unresolved")) return "unresolved";
  if (kinds.has("maintained") && kinds.has("generated-cng")) return "unresolved";
  if (kinds.size === 1) return present[0]!.ownership;
  return "unresolved";
}

export function inspectExpoNativeOwnership(input: InspectNativeOwnershipInput): ExpoNativeOwnershipReport {
  const builderCheckout = isBuilderCheckoutPath(input.target, input.skillRoot);
  const packageJson = readBoundedFile(path.join(input.target, "package.json"), STATIC_JSON_BYTE_CAP);
  const expoDependencyPresent = packageJson ? packageJsonHasExpoDependency(packageJson) : false;
  const dynamicConfigPresent = DYNAMIC_CONFIG_BASENAMES.filter((name) => {
    const stat = lstatIfPresent(path.join(input.target, name));
    return Boolean(stat && stat.isFile() && !stat.isSymbolicLink());
  });
  const appJson = parseJsonObject(readBoundedFile(path.join(input.target, STATIC_APP_CONFIG_BASENAME), STATIC_JSON_BYTE_CAP));
  const declaredOwnership = declaredOwnershipFromAppJson(appJson);
  const fingerprint = readFingerprint(input.target);
  const platforms = NATIVE_PLATFORMS.map((platform) => {
    const walked = nativeTreeDigest(path.join(input.target, platform));
    const present = walked.status !== "absent";
    return {
      platform,
      present,
      digest: walked.digest,
      digestStatus: walked.status,
      ownership: platformOwnership({
        platform,
        expoDependencyPresent,
        present,
        declared: declaredOwnership,
        digest: walked.digest,
        digestStatus: walked.status,
        fingerprint,
      }),
    } satisfies PlatformNativeState;
  });
  return {
    expoDependencyPresent,
    appStackSelected: isExpoAppTarget(input.compositionTarget),
    builderCheckout,
    dynamicConfigPresent,
    staticAppJsonPresent: appJson !== undefined,
    declaredOwnership,
    fingerprint,
    platforms,
    overall: combineOwnership(platforms, expoDependencyPresent),
    pluginsDeclaredNotExecuted: pluginsDeclared(appJson),
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
  };
}

function shippingPlatformOf(target: CompositionTarget): ShippingPlatform | undefined {
  if (target.platform === "host") return undefined;
  return target.platform;
}

function refuse(platform: NativePlatform | "web", overall: NativeOwnershipKind, code: PrebuildRefusalCode, reason: string): PrebuildDecision {
  return { action: "refuse", platform, overall, code, reason, execution: NATIVE_COMPILE_STATUS };
}

export function decideExpoPrebuild(input: DecidePrebuildInput): PrebuildDecision {
  const report = inspectExpoNativeOwnership(input);
  if (input.platform === "web") {
    return {
      action: "not-applicable",
      platform: "web",
      overall: report.overall,
      reason: "Web has no ios/ or android/ project to generate. A browser export is not native proof.",
      execution: NATIVE_COMPILE_STATUS,
    };
  }
  if (report.builderCheckout) {
    return refuse(input.platform, report.overall, "builder-checkout", "Refuse prebuild inside the builder checkout. Use a disposable workspace copy.");
  }
  if (!isExpoAppTarget(input.compositionTarget)) {
    return refuse(
      input.platform,
      report.overall,
      "expo-not-selected",
      "Native generation requires a selected Expo app target for that native platform. Detection is not consent.",
    );
  }
  const selected = shippingPlatformOf(input.compositionTarget);
  if (selected === "web") {
    return refuse(
      input.platform,
      report.overall,
      "web-has-no-native-project",
      "A web/expo composition target has no native project. A browser export is not iOS or Android proof.",
    );
  }
  if (selected !== input.platform) {
    return refuse(
      input.platform,
      report.overall,
      "expo-not-selected",
      `Composition target is ${input.compositionTarget.platform}/${input.compositionTarget.runtime}. That is not ${input.platform} proof.`,
    );
  }
  if (input.noClean) {
    return refuse(input.platform, report.overall, "no-clean-is-not-merge", "--no-clean is not a guarantee that authored native edits merge safely.");
  }
  const platformState = report.platforms.find((state) => state.platform === input.platform);
  if (!platformState) {
    return refuse(input.platform, report.overall, "unresolved-ownership", `Missing platform state for ${input.platform}.`);
  }
  switch (platformState.ownership) {
    case "not-expo":
      return refuse(input.platform, report.overall, "expo-not-selected", "package.json does not declare an expo dependency. Detection stays passive.");
    case "maintained":
      return refuse(input.platform, report.overall, "maintained-native", "Native directories are declared maintained source. CNG regeneration is refused.");
    case "dirty-unreviewed":
      return refuse(
        input.platform,
        report.overall,
        "dirty-unreviewed",
        "Native directories exist without a matching generation fingerprint. Preserve authored changes.",
      );
    case "unresolved":
      return refuse(
        input.platform,
        report.overall,
        "unresolved-ownership",
        "Native ownership is unresolved. Do not regenerate until generated-cng or maintained is declared statically.",
      );
    case "absent-cng-candidate":
      return {
        action: "allow-generate",
        platform: input.platform,
        overall: report.overall,
        reason: `${input.platform}/ is absent. Ownership permits generation in a disposable copy. Expo CLI was not executed.`,
        execution: NATIVE_COMPILE_STATUS,
      };
    case "generated-cng": {
      const cli = input.executedCli;
      if (!cli?.observed || cli.prebuildDefaultRegenerates === "unknown" || cli.prebuildDefaultRegenerates === undefined) {
        return refuse(
          input.platform,
          report.overall,
          "executed-cli-unverified",
          "SDK 57 changelog says prebuild regenerates native directories by default. Verify the executed CLI before regeneration.",
        );
      }
      if (!input.destructiveRegenerationAuthorized) {
        return refuse(
          input.platform,
          report.overall,
          "destructive-regeneration-not-authorized",
          "Matching CNG fingerprint is not permission to delete native directories. Authorize destructive regeneration explicitly.",
        );
      }
      if (report.fingerprint && platformState.digest && report.fingerprint.platforms[input.platform] !== platformState.digest) {
        return refuse(input.platform, report.overall, "fingerprint-mismatch", "Native tree digest does not match the recorded generation fingerprint.");
      }
      return {
        action: "allow-regenerate",
        platform: input.platform,
        overall: report.overall,
        reason:
          "Declared generated-cng, fingerprint matches, executed CLI observed, and destructive regeneration is authorized. Expo CLI was not executed here.",
        execution: NATIVE_COMPILE_STATUS,
      };
    }
    default: {
      const exhaustive: never = platformState.ownership;
      throw new Error(`unhandled native ownership: ${String(exhaustive)}`);
    }
  }
}

export function writeNativeGenerationFingerprint(platforms: Partial<Record<NativePlatform, string>>): NativeGenerationFingerprint {
  return { schemaVersion: 1, ownership: "generated-cng", platforms };
}
