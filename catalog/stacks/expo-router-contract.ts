/**
 * Expo Router file-layout contract (#82).
 *
 * Inspects thin `app/` routes and `src/` logic without importing expo-router, executing
 * plugins, or claiming a native UI adapter. Reviewed expo-router is bundled-with-sdk-57,
 * not a workspace pin — do not invent a package version.
 *
 * Consumes `catalog/stacks/expo-selection.ts`.
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  EXPO_IS_DEFAULT_STACK,
  EXPO_REVIEWED_VERSION_FACTS,
  isExpoAppTarget,
  shippingSatisfiesRequirement,
  type CompositionTarget,
  type ShippingPlatform,
} from "./expo-selection.js";
import {
  BUILDER_PACKAGE_NAME,
  STATIC_JSON_BYTE_CAP,
  isBuilderCheckoutPath,
  packageJsonHasExactDependency,
} from "./expo-native-ownership.js";
import { EXPO_STARTER_FIXTURE_DIR, MARKETING_OR_BACKEND_DEPENDENCIES } from "./expo-starter.js";

export const EXPO_ROUTER_ROUTE_FILES = [
  "app/_layout.ts",
  "app/(tabs)/_layout.ts",
  "app/(tabs)/index.ts",
  "app/(tabs)/settings.ts",
  "app/modal.ts",
  "app/detail/[id].ts",
] as const;

export const EXPO_ROUTER_SRC_FILES = [
  "src/navigation/route-graph.ts",
  "src/navigation/deep-link.ts",
  "src/screens/home.ts",
  "src/screens/settings.ts",
  "src/screens/modal.ts",
  "src/screens/detail.ts",
  "src/states/surface-state.ts",
  "src/persistence/seam.ts",
  "src/ui/contract-binding.ts",
] as const;

export const EXPO_UI_ADAPTER_RELATIVE_PATH = "surfaces/ui-library/adapters/expo.json";
export const SWIFTUI_ADAPTER_RELATIVE_PATH = "surfaces/ui-library/adapters/swiftui.json";
export const THIN_ROUTE_MAX_LINES = 8;
export const PRODUCT_HARDCODE_PATTERN = /\b(quiz|paywall|movie|habit-tracker)\b/i;
export const FAT_ROUTE_PATTERN = /\b(fetch|AsyncStorage|localStorage|XMLHttpRequest)\b/;
export const SRC_IMPORT_PATTERN = /from ["'](?:\.\.\/)+src\//;

export type ExpoRouterPinStatus = "unpinned" | "workspace-pin" | "fabricated-latest";
export type ExpoRouterLayoutStatus = "layout-ready" | "incomplete" | "fat-routes" | "hardcoded-product";
export type ExpoRouterDeliveryAction = "layout-ready" | "refuse";
export type ExpoRouterRefusalCode =
  | "builder-checkout"
  | "expo-not-selected"
  | "expo-is-not-default"
  | "web-is-not-native-router"
  | "unpinned-expo-router"
  | "fabricated-router-pin"
  | "existing-marketing-or-backend"
  | "incomplete-layout"
  | "fat-routes"
  | "hardcoded-product"
  | "placeholder-expo-adapter";

export interface ExpoRouterLayoutReport {
  routeFilesPresent: readonly string[];
  srcFilesPresent: readonly string[];
  missingRouteFiles: readonly string[];
  missingSrcFiles: readonly string[];
  fatRoutes: readonly string[];
  hardcodedProduct: boolean;
  pinStatus: ExpoRouterPinStatus;
  expoAdapterPresent: boolean;
  swiftuiAdapterPresent: boolean;
  status: ExpoRouterLayoutStatus;
}

export interface ExpoRouterDeliveryPlan {
  action: ExpoRouterDeliveryAction;
  layout: ExpoRouterLayoutStatus;
  pinStatus: ExpoRouterPinStatus;
  code?: ExpoRouterRefusalCode;
  reason: string;
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

function routeIsThin(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.length <= THIN_ROUTE_MAX_LINES && SRC_IMPORT_PATTERN.test(text) && !FAT_ROUTE_PATTERN.test(text);
}

function dependencyVersion(packageJsonText: string, name: string): string | undefined {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(packageJsonText);
    } catch {
      return undefined;
    }
  })();
  if (!isRecord(parsed)) return undefined;
  for (const field of ["dependencies", "devDependencies"] as const) {
    const block = parsed[field];
    if (isRecord(block) && typeof block[name] === "string") return block[name];
  }
  return undefined;
}

export function reviewedExpoRouterFact(): string {
  const fact = EXPO_REVIEWED_VERSION_FACTS.find((row) => row.component === "expo-router" && row.kind === "reviewed-baseline");
  if (!fact) throw new Error("reviewed expo-router fact missing from expo-selection.ts");
  return fact.value;
}

export function inspectExpoRouterPin(packageJsonText: string | undefined): ExpoRouterPinStatus {
  if (!packageJsonText || !packageJsonHasExactDependency(packageJsonText, "expo-router")) return "unpinned";
  const version = dependencyVersion(packageJsonText, "expo-router");
  if (!version || version === "latest" || version === reviewedExpoRouterFact()) return "fabricated-latest";
  return "workspace-pin";
}

export function expoAdapterManifestExists(skillRoot: string): boolean {
  return existsSync(path.join(skillRoot, EXPO_UI_ADAPTER_RELATIVE_PATH));
}

export function inspectExpoRouterLayout(target: string, skillRoot: string): ExpoRouterLayoutReport {
  const routeFilesPresent = presentRelativeFiles(target, EXPO_ROUTER_ROUTE_FILES);
  const srcFilesPresent = presentRelativeFiles(target, EXPO_ROUTER_SRC_FILES);
  const missingRouteFiles = EXPO_ROUTER_ROUTE_FILES.filter((file) => !routeFilesPresent.includes(file));
  const missingSrcFiles = EXPO_ROUTER_SRC_FILES.filter((file) => !srcFilesPresent.includes(file));
  const fatRoutes = routeFilesPresent.filter((relative) => {
    const text = readOptionalText(path.join(target, relative));
    return !text || !routeIsThin(text);
  });
  const texts = [...routeFilesPresent, ...srcFilesPresent]
    .map((relative) => readOptionalText(path.join(target, relative)) ?? "")
    .join("\n");
  const hardcodedProduct = PRODUCT_HARDCODE_PATTERN.test(texts);
  const pinStatus = inspectExpoRouterPin(readOptionalText(path.join(target, "package.json")));
  let status: ExpoRouterLayoutStatus = "layout-ready";
  if (hardcodedProduct) status = "hardcoded-product";
  else if (fatRoutes.length > 0) status = "fat-routes";
  else if (missingRouteFiles.length > 0 || missingSrcFiles.length > 0) status = "incomplete";
  return {
    routeFilesPresent,
    srcFilesPresent,
    missingRouteFiles,
    missingSrcFiles,
    fatRoutes,
    hardcodedProduct,
    pinStatus,
    expoAdapterPresent: expoAdapterManifestExists(skillRoot),
    swiftuiAdapterPresent: existsSync(path.join(skillRoot, SWIFTUI_ADAPTER_RELATIVE_PATH)),
    status,
  };
}

export function isolatedStarterRouterLayout(skillRoot: string): ExpoRouterLayoutReport {
  return inspectExpoRouterLayout(EXPO_STARTER_FIXTURE_DIR, skillRoot);
}

function marketingOrBackend(packageJsonText: string | undefined): boolean {
  if (!packageJsonText) return false;
  return MARKETING_OR_BACKEND_DEPENDENCIES.some((name) => packageJsonHasExactDependency(packageJsonText, name));
}

export function planExpoRouterDelivery(input: {
  target: string;
  skillRoot: string;
  compositionTarget: CompositionTarget;
  claimedProofPlatform?: ShippingPlatform;
}): ExpoRouterDeliveryPlan {
  const layout = inspectExpoRouterLayout(input.target, input.skillRoot);
  const runtimeVerified = false as const;
  const refuse = (code: ExpoRouterRefusalCode, reason: string): ExpoRouterDeliveryPlan => ({
    action: "refuse",
    layout: layout.status,
    pinStatus: layout.pinStatus,
    code,
    reason,
    runtimeVerified,
  });
  if (EXPO_IS_DEFAULT_STACK) {
    return refuse("expo-is-not-default", "Expo must remain selectable, not default.");
  }
  if (isBuilderCheckoutPath(input.target, input.skillRoot)) {
    return refuse("builder-checkout", "Refuse treating the builder checkout as an Expo Router app.");
  }
  const selectedPlatform = input.compositionTarget.platform;
  if (!isExpoAppTarget(input.compositionTarget) || selectedPlatform === "host") {
    return refuse(
      "expo-not-selected",
      `Composition target ${input.compositionTarget.platform}/${input.compositionTarget.runtime} did not select Expo. ${BUILDER_PACKAGE_NAME} does not auto-migrate.`,
    );
  }
  if (input.claimedProofPlatform && !shippingSatisfiesRequirement(selectedPlatform, input.claimedProofPlatform)) {
    return refuse("web-is-not-native-router", "A web export cannot satisfy iOS or Android Router proof.");
  }
  if (marketingOrBackend(readOptionalText(path.join(input.target, "package.json")))) {
    return refuse("existing-marketing-or-backend", "Expo Router does not replace a separately selected marketing site or backend.");
  }
  if (layout.expoAdapterPresent) {
    return refuse("placeholder-expo-adapter", "Do not add an Expo UI adapter until native source exists.");
  }
  if (layout.pinStatus === "fabricated-latest") {
    return refuse("fabricated-router-pin", "Do not invent an expo-router version from /latest/ docs or the bundled-with-sdk-57 fact.");
  }
  if (layout.status === "hardcoded-product") {
    return refuse("hardcoded-product", "Reusable starter routes must not hardcode a quiz, paywall, or movie app.");
  }
  if (layout.status === "fat-routes") {
    return refuse("fat-routes", "Route files must stay thin and import application logic from src/.");
  }
  if (layout.status === "incomplete") {
    return refuse("incomplete-layout", "Stack, tabs, modal, and detail files plus src/ logic are required.");
  }
  if (layout.pinStatus === "unpinned") {
    return refuse(
      "unpinned-expo-router",
      "File layout is present. expo-router stays unpinned until a workspace lock exists. Not runtime-verified.",
    );
  }
  return {
    action: "layout-ready",
    layout: layout.status,
    pinStatus: layout.pinStatus,
    reason: "Thin route layout is present with a workspace expo-router pin. Native UI adapter and runtime proof remain separate.",
    runtimeVerified,
  };
}
