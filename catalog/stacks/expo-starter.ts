/**
 * Isolated Expo TypeScript starter fixture (#82).
 *
 * Expo is selectable, not default. This fixture is an input to later Router/UI/CNG work, not
 * accepted delivery. It never relabels the Next.js habit-tracker starter, never replaces
 * product.yaml / DESIGN.md / AGENTS.md, and never treats a marketing site or backend as Expo Router.
 *
 * Consumes `catalog/stacks/expo-selection.ts`. Scaffold writes only into authorized destinations
 * outside the builder checkout.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPO_APP_RUNTIME,
  EXPO_IS_DEFAULT_STACK,
  EXPO_REVIEWED_VERSION_FACTS,
  isExpoAppTarget,
  type CompositionTarget,
  type ShippingPlatform,
} from "./expo-selection.js";
import {
  BUILDER_PACKAGE_NAME,
  DYNAMIC_CONFIG_BASENAMES,
  STATIC_APP_CONFIG_BASENAME,
  NATIVE_COMPILE_STATUS,
  STATIC_JSON_BYTE_CAP,
  isBuilderCheckoutPath,
  packageJsonHasExactDependency,
  packageJsonHasExpoDependency,
} from "./expo-native-ownership.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const EXPO_STARTER_FIXTURE_DIR = path.join(here, "expo-starter-fixture");
export const EXPO_STARTER_FIXTURE_ID = "expo-consumer-starter-fixture";

export const BUILDER_AUTHORITY_FILES = ["AGENTS.md", "APP_AGENTS.md", "product.yaml", "DESIGN.md", "PRODUCT.md"] as const;

export const MARKETING_OR_BACKEND_DEPENDENCIES = ["next", "astro", "gatsby", "remix", "@remix-run/node", "nuxt"] as const;
export const MARKETING_OR_BACKEND_CONFIGS = ["next.config.ts", "next.config.js", "astro.config.ts", "astro.config.mjs", "nuxt.config.ts"] as const;

export const APP_SIGNAL_FILES = [
  "package.json",
  STATIC_APP_CONFIG_BASENAME,
  ...DYNAMIC_CONFIG_BASENAMES,
  ...MARKETING_OR_BACKEND_CONFIGS,
  "metro.config.js",
  "ios",
  "android",
] as const;

export type ExpoScaffoldKind =
  "builder-checkout" | "empty" | "builder-workspace-without-app" | "existing-expo" | "existing-marketing-or-backend" | "existing-other-app" | "dirty-native";

export type ExpoScaffoldAction = "scaffold" | "adopt" | "refuse";

export type ExpoScaffoldRefusalCode =
  | "builder-checkout"
  | "expo-not-selected"
  | "expo-is-not-default"
  | "unselected-platform"
  | "existing-target"
  | "existing-marketing-or-backend"
  | "dirty-native"
  | "habit-tracker-is-next"
  | "unauthorized";

export interface ExpoScaffoldTargetReport {
  kind: ExpoScaffoldKind;
  expoDependencyPresent: boolean;
  builderAuthorityPresent: readonly string[];
  marketingOrBackend: boolean;
}

export interface ExpoScaffoldPlan {
  action: ExpoScaffoldAction;
  kind: ExpoScaffoldKind;
  platforms: readonly ShippingPlatform[];
  code?: ExpoScaffoldRefusalCode;
  reason: string;
  preserve: readonly string[];
}

export interface PlanExpoStarterScaffoldInput {
  target: string;
  skillRoot: string;
  compositionTarget: CompositionTarget;
  platforms: readonly ShippingPlatform[];
  authorized: boolean;
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

function readOptionalFile(target: string): string | undefined {
  const stat = lstatIfPresent(target);
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size > STATIC_JSON_BYTE_CAP) return undefined;
  try {
    return readFileSync(target, "utf8");
  } catch {
    return undefined;
  }
}

function pathExists(target: string): boolean {
  const stat = lstatIfPresent(target);
  return Boolean(stat && !stat.isSymbolicLink());
}

function presentBuilderAuthority(target: string): string[] {
  return BUILDER_AUTHORITY_FILES.filter((name) => pathExists(path.join(target, name)));
}

function marketingOrBackendPresent(target: string, packageJsonText: string | undefined): boolean {
  if (packageJsonText) {
    for (const name of MARKETING_OR_BACKEND_DEPENDENCIES) {
      if (packageJsonHasExactDependency(packageJsonText, name)) return true;
    }
  }
  return MARKETING_OR_BACKEND_CONFIGS.some((name) => pathExists(path.join(target, name)));
}

function nativeDirsPresent(target: string): boolean {
  return pathExists(path.join(target, "ios")) || pathExists(path.join(target, "android"));
}

function appSignalsPresent(target: string): boolean {
  return APP_SIGNAL_FILES.some((name) => pathExists(path.join(target, name)));
}

export function reviewedExpoFixturePins(): { expo: string; react: string; reactNative: string } {
  const expo = EXPO_REVIEWED_VERSION_FACTS.find((fact) => fact.component === "expo-sdk" && fact.kind === "reviewed-baseline")?.value;
  const react = EXPO_REVIEWED_VERSION_FACTS.find((fact) => fact.component === "react" && fact.kind === "reviewed-baseline")?.value;
  const reactNative = EXPO_REVIEWED_VERSION_FACTS.find((fact) => fact.component === "react-native" && fact.kind === "reviewed-baseline")?.value;
  if (!expo || !react || !reactNative) throw new Error("reviewed Expo pins missing from expo-selection.ts");
  return { expo, react, reactNative };
}

export function classifyExpoScaffoldTarget(target: string, skillRoot: string): ExpoScaffoldTargetReport {
  const builderAuthorityPresent = presentBuilderAuthority(target);
  if (isBuilderCheckoutPath(target, skillRoot)) {
    return { kind: "builder-checkout", expoDependencyPresent: false, builderAuthorityPresent, marketingOrBackend: false };
  }
  const packageJsonText = readOptionalFile(path.join(target, "package.json"));
  const expoDependencyPresent = packageJsonText ? packageJsonHasExpoDependency(packageJsonText) : false;
  const marketingOrBackend = marketingOrBackendPresent(target, packageJsonText);
  if (packageJsonText && marketingOrBackend) {
    return { kind: "existing-marketing-or-backend", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
  }
  if (expoDependencyPresent) {
    return { kind: "existing-expo", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
  }
  if (packageJsonText) {
    return { kind: "existing-other-app", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
  }
  if (nativeDirsPresent(target)) {
    return { kind: "dirty-native", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
  }
  if (!appSignalsPresent(target) && builderAuthorityPresent.length > 0) {
    return { kind: "builder-workspace-without-app", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
  }
  if (!appSignalsPresent(target)) {
    return { kind: "empty", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
  }
  return { kind: "existing-other-app", expoDependencyPresent, builderAuthorityPresent, marketingOrBackend };
}

function refuse(
  kind: ExpoScaffoldKind,
  platforms: readonly ShippingPlatform[],
  preserve: readonly string[],
  code: ExpoScaffoldRefusalCode,
  reason: string,
): ExpoScaffoldPlan {
  return { action: "refuse", kind, platforms, preserve, code, reason };
}

export function planExpoStarterScaffold(input: PlanExpoStarterScaffoldInput): ExpoScaffoldPlan {
  const platforms = Object.freeze([...input.platforms]);
  const report = classifyExpoScaffoldTarget(input.target, input.skillRoot);
  const preserve = report.builderAuthorityPresent;
  if (EXPO_IS_DEFAULT_STACK) {
    return refuse(report.kind, platforms, preserve, "expo-is-not-default", "Expo must remain selectable, not default.");
  }
  if (!input.authorized) {
    return refuse(report.kind, platforms, preserve, "unauthorized", "Starter materialization requires explicit authorization.");
  }
  if (!isExpoAppTarget(input.compositionTarget)) {
    return refuse(
      report.kind,
      platforms,
      preserve,
      "expo-not-selected",
      `Composition target ${input.compositionTarget.platform}/${input.compositionTarget.runtime} did not select Expo. ${BUILDER_PACKAGE_NAME} does not auto-migrate.`,
    );
  }
  const selectedPlatform = input.compositionTarget.platform;
  if (selectedPlatform !== "host" && (platforms.length !== 1 || platforms[0] !== selectedPlatform)) {
    return refuse(
      report.kind,
      platforms,
      preserve,
      "unselected-platform",
      "Scaffold only the selected composition platform. A web target does not include iOS or Android.",
    );
  }
  switch (report.kind) {
    case "builder-checkout":
      return refuse(report.kind, platforms, preserve, "builder-checkout", "Refuse scaffolding into the builder checkout. Use a disposable workspace.");
    case "existing-marketing-or-backend": {
      const pkg = readOptionalFile(path.join(input.target, "package.json"));
      let parsed: unknown;
      try {
        parsed = pkg ? JSON.parse(pkg) : undefined;
      } catch {
        parsed = undefined;
      }
      const habitTracker = isRecord(parsed) && parsed.name === "habit-tracker-starter";
      return refuse(
        report.kind,
        platforms,
        preserve,
        habitTracker ? "habit-tracker-is-next" : "existing-marketing-or-backend",
        habitTracker
          ? "The habit-tracker starter is Next.js. Do not relabel it as Expo."
          : "A separately selected marketing site or backend stays put. Expo Router does not replace Next.js or Astro.",
      );
    }
    case "existing-expo":
      return {
        action: "adopt",
        kind: report.kind,
        platforms,
        preserve,
        reason: "Existing Expo app: resume or adopt. Do not re-scaffold or overwrite.",
      };
    case "existing-other-app":
      return refuse(report.kind, platforms, preserve, "existing-target", "Existing app files are present. Resume, adopt, or refuse — do not overwrite.");
    case "dirty-native":
      return refuse(report.kind, platforms, preserve, "dirty-native", "Native directories exist without a classified Expo app. Do not overwrite.");
    case "empty":
    case "builder-workspace-without-app":
      return {
        action: "scaffold",
        kind: report.kind,
        platforms,
        preserve,
        reason: "Authorized empty target. Copy the isolated Expo starter without replacing builder authority files.",
      };
    default: {
      const exhaustive: never = report.kind;
      throw new Error(`unhandled scaffold kind: ${String(exhaustive)}`);
    }
  }
}

export function habitTrackerStarterIsNextNotExpo(skillRoot: string): boolean {
  const pkg = readFileSync(path.join(skillRoot, "surfaces/starters/habit-tracker/starter/package.json"), "utf8");
  return packageJsonHasExactDependency(pkg, "next") && !packageJsonHasExpoDependency(pkg);
}

function rewriteAppJsonPlatforms(appJsonText: string, platforms: readonly ShippingPlatform[]): string {
  const parsed: unknown = JSON.parse(appJsonText);
  if (!isRecord(parsed) || !isRecord(parsed.expo)) throw new Error("isolated Expo starter app.json must contain expo");
  parsed.expo.platforms = [...platforms];
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function assertFixtureHasNoAuthorityOrLock(root: string): void {
  for (const name of [...BUILDER_AUTHORITY_FILES, "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "AGENTS.md"]) {
    if (lstatIfPresent(path.join(root, name))) throw new Error(`isolated Expo starter must not ship ${name}`);
  }
}

export function isolatedExpoStarterPaths(): string[] {
  const walk = (dir: string, relative: string, out: string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, childRelative, out);
      } else if (entry.isFile()) {
        out.push(childRelative);
      }
    }
  };
  const files: string[] = [];
  walk(EXPO_STARTER_FIXTURE_DIR, "", files);
  return files;
}

export function materializeExpoStarterFixture(input: PlanExpoStarterScaffoldInput): ExpoScaffoldPlan {
  const plan = planExpoStarterScaffold(input);
  if (plan.action !== "scaffold") return plan;
  assertFixtureHasNoAuthorityOrLock(EXPO_STARTER_FIXTURE_DIR);
  mkdirSync(input.target, { recursive: true });
  cpSync(EXPO_STARTER_FIXTURE_DIR, input.target, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source);
      return !(BUILDER_AUTHORITY_FILES as readonly string[]).includes(name) && name !== "package-lock.json";
    },
  });
  const gitignoreTemplate = path.join(input.target, "gitignore.template");
  writeFileSync(path.join(input.target, ".gitignore"), readFileSync(gitignoreTemplate, "utf8"));
  const appJsonPath = path.join(input.target, STATIC_APP_CONFIG_BASENAME);
  writeFileSync(appJsonPath, rewriteAppJsonPlatforms(readFileSync(appJsonPath, "utf8"), input.platforms));
  for (const name of plan.preserve) {
    if (!lstatIfPresent(path.join(input.target, name))) {
      throw new Error(`builder authority file ${name} must survive scaffold`);
    }
  }
  return plan;
}

export interface ExpoStarterConsumerInstall {
  kind: "expo-starter-consumer-install";
  status: "installed" | "scaffold-refused" | "install-failed";
  lockfileGenerated: boolean;
  expoLocal: boolean;
  expoInstalledGlobally: false;
  localModuleInstalled: boolean;
  expoRouterLocal: boolean;
  noticesPresent: readonly string[];
  peerResolution: "npm-default";
  nativeCompileStatus: typeof NATIVE_COMPILE_STATUS;
  reason?: string;
}

export function installExpoStarterConsumer(input: PlanExpoStarterScaffoldInput): ExpoStarterConsumerInstall {
  const plan = materializeExpoStarterFixture(input);
  const failed = (status: "scaffold-refused" | "install-failed", reason: string): ExpoStarterConsumerInstall => ({
    kind: "expo-starter-consumer-install",
    status,
    lockfileGenerated: false,
    expoLocal: false,
    expoInstalledGlobally: false,
    localModuleInstalled: false,
    expoRouterLocal: false,
    noticesPresent: [],
    peerResolution: "npm-default",
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
    reason,
  });
  if (plan.action !== "scaffold") return failed("scaffold-refused", plan.reason);
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: input.target,
    encoding: "utf8",
    timeout: 300_000,
  });
  if (install.status !== 0) {
    return failed("install-failed", (install.stderr || install.stdout || "npm install failed").trim().slice(-400));
  }
  const lockfileGenerated = existsSync(path.join(input.target, "package-lock.json"));
  const expoLocal = existsSync(path.join(input.target, "node_modules", "expo", "package.json"));
  const localModuleInstalled = existsSync(path.join(input.target, "node_modules", "b2c-native-capability", "package.json"));
  const expoRouterLocal = existsSync(path.join(input.target, "node_modules", "expo-router", "package.json"));
  const noticesPresent = [
    path.join("node_modules", "expo", "LICENSE"),
    path.join("node_modules", "b2c-native-capability", "NOTICE"),
  ].filter((relative) => existsSync(path.join(input.target, relative)));
  return {
    kind: "expo-starter-consumer-install",
    status: "installed",
    lockfileGenerated,
    expoLocal,
    expoInstalledGlobally: false,
    localModuleInstalled,
    expoRouterLocal,
    noticesPresent,
    peerResolution: "npm-default",
    nativeCompileStatus: NATIVE_COMPILE_STATUS,
  };
}

export function assertExpoIsNotDefault(): void {
  if (EXPO_IS_DEFAULT_STACK) throw new Error("Expo must not be the default stack");
  if (EXPO_APP_RUNTIME !== "expo") throw new Error("Expo runtime slug must remain expo");
}
