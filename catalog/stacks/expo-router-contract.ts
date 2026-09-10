/**
 * Expo Router file-layout and workspace pin (#82).
 *
 * Inspects JSX `app/` routes and `src/` screens without executing expo-router,
 * Metro, or a native UI adapter. The reviewed #81 fact remains bundled-with-sdk-57.
 * The fixture workspace pin is expo@57.0.17 bundledNativeModules.json, not /latest/
 * and not the older expo@57.0.9 table.
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
import { BUILDER_PACKAGE_NAME, STATIC_JSON_BYTE_CAP, isBuilderCheckoutPath, packageJsonHasExactDependency } from "./expo-native-ownership.js";
import { EXPO_STARTER_FIXTURE_DIR, MARKETING_OR_BACKEND_DEPENDENCIES } from "./expo-starter.js";

/** Exact pins that satisfy published expo@57.0.17 bundledNativeModules.json. */
export const EXPO_ROUTER_COMPANION_PINS = {
  "expo-router": "57.0.17",
  "expo-linking": "57.0.8",
  "expo-constants": "57.0.17",
  "expo-status-bar": "57.0.1",
  "react-native-screens": "4.26.0",
  "react-native-safe-area-context": "5.7.0",
} as const;

/** Bundled ranges from https://unpkg.com/expo@57.0.17/bundledNativeModules.json */
export const EXPO_BUNDLED_COMPANION_RANGES = {
  "expo-router": "~57.0.17",
  "expo-linking": "~57.0.8",
  "expo-constants": "~57.0.15",
  "expo-status-bar": "~57.0.1",
  "react-native-screens": "~4.26.0",
  "react-native-safe-area-context": "~5.7.0",
} as const;

export const EXPO_ROUTER_WORKSPACE_PIN = EXPO_ROUTER_COMPANION_PINS["expo-router"];
export const EXPO_BUNDLED_NATIVE_MODULES_SOURCE = "https://unpkg.com/expo@57.0.17/bundledNativeModules.json";
export const EXPO_ROUTER_ROUTE_FILES = [
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/index.tsx",
  "app/(tabs)/settings.tsx",
  "app/modal.tsx",
  "app/detail/[id].tsx",
  "app/sign-in.tsx",
  "app/+not-found.tsx",
] as const;

export const EXPO_ROUTER_SRC_FILES = [
  "src/navigation/route-graph.ts",
  "src/navigation/deep-link.ts",
  "src/navigation/journeys.ts",
  "src/capabilities/reducers.ts",
  "src/session/local-session.ts",
  "src/offline/local-cache.ts",
  "src/permissions/safe-state.ts",
  "src/notifications/handoff.ts",
  "src/screens/home.tsx",
  "src/screens/settings.tsx",
  "src/screens/modal.tsx",
  "src/screens/detail.tsx",
  "src/screens/sign-in.tsx",
  "src/screens/not-found.tsx",
  "src/states/surface-state.ts",
  "src/persistence/seam.ts",
  "src/ui/contract-binding.ts",
  "src/ui/empty-state.tsx",
  "src/ui/skeleton.tsx",
  "src/ui/haptics.tsx",
  "src/ui/keyboard-behavior.tsx",
  "src/ui/press-feedback.tsx",
  "src/ui/tokens.ts",
  "src/native/capability-status.tsx",
  "src/native/capability-status.web.tsx",
] as const;

export const EXPO_UI_ADAPTER_RELATIVE_PATH = "surfaces/ui-library/adapters/expo.json";
export const SWIFTUI_ADAPTER_RELATIVE_PATH = "surfaces/ui-library/adapters/swiftui.json";
export const THIN_ROUTE_MAX_LINES = 24;
export const PRODUCT_HARDCODE_PATTERN = /\b(quiz|paywall|movie|habit-tracker)\b/i;
export const FAT_ROUTE_PATTERN = /\b(fetch|AsyncStorage|localStorage|XMLHttpRequest)\b/;
export const SRC_IMPORT_PATTERN = /from ["'](?:\.\.\/)+src\//;
export const EXPO_ROUTER_IMPORT_PATTERN = /from ["']expo-router["']/;
export const EXPO_ROUTER_JSX_LAYOUT_PATTERN = /<(Stack|Tabs)\b/;
export const EXPO_ROUTER_MODAL_PRESENTATION_PATTERN = /presentation:\s*["']modal["']/;

export type ExpoRouterPinStatus = "unpinned" | "workspace-pin" | "fabricated-latest";
export type ExpoUiAdapterQuality = "absent" | "placeholder" | "implemented";
export type ExpoRouterLayoutStatus = "layout-ready" | "incomplete" | "fat-routes" | "hardcoded-product" | "data-reexport";
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
  | "data-reexport-routes"
  | "placeholder-expo-adapter";

export interface ExpoRouterLayoutReport {
  routeFilesPresent: readonly string[];
  srcFilesPresent: readonly string[];
  missingRouteFiles: readonly string[];
  missingSrcFiles: readonly string[];
  fatRoutes: readonly string[];
  hardcodedProduct: boolean;
  jsxRoutes: boolean;
  pinStatus: ExpoRouterPinStatus;
  expoAdapterPresent: boolean;
  expoAdapterQuality: ExpoUiAdapterQuality;
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
  if (!version || version === "latest" || version === "*" || version === reviewedExpoRouterFact()) return "fabricated-latest";
  if (version !== EXPO_ROUTER_WORKSPACE_PIN) return "fabricated-latest";
  return "workspace-pin";
}

export function satisfiesBundledTildeRange(pin: string, range: string): boolean {
  const rangeParts = /^~(\d+)\.(\d+)\.(\d+)$/.exec(range);
  const pinParts = /^(\d+)\.(\d+)\.(\d+)$/.exec(pin);
  if (!rangeParts || !pinParts) return false;
  return pinParts[1] === rangeParts[1] && pinParts[2] === rangeParts[2] && Number(pinParts[3]) >= Number(rangeParts[3]);
}

export function inspectExpoCompanionPins(dependencies: Record<string, string> | undefined): {
  mismatched: readonly string[];
  rangeFailures: readonly string[];
} {
  const mismatched: string[] = [];
  const rangeFailures: string[] = [];
  for (const name of Object.keys(EXPO_ROUTER_COMPANION_PINS) as (keyof typeof EXPO_ROUTER_COMPANION_PINS)[]) {
    const expected = EXPO_ROUTER_COMPANION_PINS[name];
    const actual = dependencies?.[name];
    if (actual !== expected) mismatched.push(`${name}=${actual ?? "missing"}`);
    if (!satisfiesBundledTildeRange(expected, EXPO_BUNDLED_COMPANION_RANGES[name])) {
      rangeFailures.push(`${name}@${expected} ! ${EXPO_BUNDLED_COMPANION_RANGES[name]}`);
    }
  }
  return { mismatched, rangeFailures };
}

const REQUIRED_EXPO_ADAPTER_CONTRACTS = [
  "feedback.empty-state",
  "feedback.skeleton",
  "feedback.haptics",
  "input.keyboard-behavior",
  "interaction.press-feedback",
] as const;

function symbolPresent(sourceText: string, symbol: string): boolean {
  return new RegExp(`\\b(?:export\\s+(?:async\\s+)?function|export\\s+const|function|const|class)\\s+${symbol}\\b`).test(sourceText);
}

export function inspectExpoUiAdapter(skillRoot: string): { quality: ExpoUiAdapterQuality; missingSymbols: readonly string[] } {
  const text = readOptionalText(path.join(skillRoot, EXPO_UI_ADAPTER_RELATIVE_PATH));
  if (!text) return { quality: "absent", missingSymbols: REQUIRED_EXPO_ADAPTER_CONTRACTS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { quality: "placeholder", missingSymbols: REQUIRED_EXPO_ADAPTER_CONTRACTS };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.implementations)) {
    return { quality: "placeholder", missingSymbols: REQUIRED_EXPO_ADAPTER_CONTRACTS };
  }
  const missingSymbols: string[] = [];
  const seen = new Set<string>();
  for (const implementation of parsed.implementations) {
    if (!isRecord(implementation) || typeof implementation.contractId !== "string") continue;
    seen.add(implementation.contractId);
    if (!isRecord(implementation.source) || typeof implementation.source.path !== "string" || !Array.isArray(implementation.source.symbols)) {
      missingSymbols.push(implementation.contractId);
      continue;
    }
    const sourceText = readOptionalText(path.join(skillRoot, implementation.source.path));
    if (!sourceText) {
      missingSymbols.push(`${implementation.contractId}:${implementation.source.path}`);
      continue;
    }
    for (const symbol of implementation.source.symbols) {
      if (typeof symbol !== "string" || !symbolPresent(sourceText, symbol)) {
        missingSymbols.push(`${implementation.contractId}:${String(symbol)}`);
      }
    }
  }
  for (const contractId of REQUIRED_EXPO_ADAPTER_CONTRACTS) {
    if (!seen.has(contractId)) missingSymbols.push(contractId);
  }
  return { quality: missingSymbols.length === 0 ? "implemented" : "placeholder", missingSymbols };
}

export function expoAdapterManifestExists(skillRoot: string): boolean {
  return inspectExpoUiAdapter(skillRoot).quality !== "absent";
}

function inspectJsxRoutes(target: string, routeFilesPresent: readonly string[]): boolean {
  if (routeFilesPresent.length !== EXPO_ROUTER_ROUTE_FILES.length) return false;
  if (routeFilesPresent.some((file) => !file.endsWith(".tsx"))) return false;
  for (const relative of routeFilesPresent) {
    const text = readOptionalText(path.join(target, relative)) ?? "";
    if (!relative.includes("_layout")) continue;
    if (!EXPO_ROUTER_IMPORT_PATTERN.test(text) || !EXPO_ROUTER_JSX_LAYOUT_PATTERN.test(text)) return false;
    if (relative === "app/_layout.tsx" && !EXPO_ROUTER_MODAL_PRESENTATION_PATTERN.test(text)) return false;
  }
  return true;
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
  const texts = [...routeFilesPresent, ...srcFilesPresent].map((relative) => readOptionalText(path.join(target, relative)) ?? "").join("\n");
  const hardcodedProduct = PRODUCT_HARDCODE_PATTERN.test(texts);
  const jsxRoutes = inspectJsxRoutes(target, routeFilesPresent);
  const pinStatus = inspectExpoRouterPin(readOptionalText(path.join(target, "package.json")));
  const adapter = inspectExpoUiAdapter(skillRoot);
  let status: ExpoRouterLayoutStatus = "layout-ready";
  if (hardcodedProduct) status = "hardcoded-product";
  else if (fatRoutes.length > 0) status = "fat-routes";
  else if (missingRouteFiles.length > 0 || missingSrcFiles.length > 0) status = "incomplete";
  else if (!jsxRoutes) status = "data-reexport";
  return {
    routeFilesPresent,
    srcFilesPresent,
    missingRouteFiles,
    missingSrcFiles,
    fatRoutes,
    hardcodedProduct,
    jsxRoutes,
    pinStatus,
    expoAdapterPresent: adapter.quality !== "absent",
    expoAdapterQuality: adapter.quality,
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
  if (layout.expoAdapterQuality === "placeholder") {
    return refuse("placeholder-expo-adapter", "An Expo UI adapter file without native source is a placeholder. Implement the contracts first.");
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
  if (layout.status === "data-reexport") {
    return refuse("data-reexport-routes", "Route files must be Expo Router JSX (Stack/Tabs), not data-object re-exports.");
  }
  if (layout.pinStatus === "unpinned") {
    return refuse("unpinned-expo-router", "JSX file layout is present. expo-router stays unpinned until a workspace pin exists. Not runtime-verified.");
  }
  return {
    action: "layout-ready",
    layout: layout.status,
    pinStatus: layout.pinStatus,
    reason:
      "JSX Stack/Tabs layout is present with a workspace expo-router pin and a source-backed Expo UI adapter. Native device Router runtime remains unverified.",
    runtimeVerified,
  };
}
