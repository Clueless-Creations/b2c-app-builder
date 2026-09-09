/**
 * Expo selection and support mapping (#81).
 *
 * Other Expo packages consume this module. It is not a second policy registry, public API, or
 * global “Expo supported” flag. Composition `target.runtime` already carries the app-stack slug.
 * Do not invent `product.platforms` or `product.monetization.mode`.
 *
 * ARCH-04, ARCH-11: declared support, implementation, configuration, execution route, authority,
 * and observed proof stay independent. Adding a shipping target must not claim another operation
 * supports it.
 */

export const EXPO_APP_RUNTIME = "expo" as const;
export const HOST_AGENT_RUNTIME = "agent-cli" as const;
export const EXPO_IS_DEFAULT_STACK = false;

export const EXPO_KNOWLEDGE_REFERENCE_IDS = [
  "reference.engineering.expo-stack-selection",
  "reference.engineering.expo-compatibility",
  "reference.engineering.expo-operations-map",
] as const;

export const EXPO_SOURCE_URLS = {
  docs: "https://docs.expo.dev/",
  workflowOverview: "https://docs.expo.dev/workflow/overview/",
  cng: "https://docs.expo.dev/workflow/continuous-native-generation/",
  sdk57Changelog: "https://expo.dev/changelog/sdk-57",
  eas: "https://docs.expo.dev/eas/",
  mcp: "https://docs.expo.dev/mcp/",
  officialSkills: "https://github.com/expo/skills",
} as const;

export type ShippingPlatform = "ios" | "android" | "web";
export type CompositionPlatform = ShippingPlatform | "host";
export type CompositionTarget = { platform: CompositionPlatform; runtime: string };

export type EvidenceTier = "researched" | "implemented" | "fixture-tested" | "runtime-verified" | "externally-verified" | "blocked";

export type CompatibilityOutcome = "match" | "mismatch" | "unknown";

export type VersionFactKind = "observed-latest" | "reviewed-baseline" | "supported-range" | "workspace-pin" | "executed-version";

export type ExpoSelectionKind =
  | "app-framework"
  | "shipping-platform"
  | "host-agent"
  | "developer-host"
  | "expo-cli"
  | "eas-cli"
  | "eas-build"
  | "eas-submit"
  | "eas-update"
  | "eas-hosting"
  | "eas-workflows"
  | "eas-observe"
  | "expo-mcp"
  | "analytics"
  | "authentication"
  | "billing";

export type ExpoOperationId =
  | "stack-selection"
  | "knowledge-routing"
  | "passive-detection"
  | "starter-scaffold"
  | "router-native-ui"
  | "cng-prebuild"
  | "custom-native-module"
  | "authentication"
  | "offline-data"
  | "device-capabilities"
  | "native-purchases"
  | "expo-cli-process"
  | "eas-cloud-build"
  | "eas-local-build"
  | "direct-local-compile"
  | "eas-workflows"
  | "store-handoff"
  | "eas-update"
  | "expo-web-export"
  | "eas-hosting"
  | "expo-mcp"
  | "official-skills"
  | "quality-observability";

export interface ExpoOperationSupport {
  id: ExpoOperationId;
  title: string;
  selection: ExpoSelectionKind;
  platforms: readonly CompositionPlatform[];
  evidenceTier: EvidenceTier;
  queuedIssue: 81 | 82 | 83 | 84 | 85 | 86 | 87 | 88 | null;
  notes: string;
}

export interface ExpoVersionFact {
  component: string;
  kind: VersionFactKind;
  value: string;
  evidenceTier: EvidenceTier;
  notes: string;
}

export interface ExpoWorkspacePins {
  expoSdk?: string;
  reactNative?: string;
  react?: string;
  expoRouter?: string;
  expoCli?: string;
  easCli?: string;
}

export interface ExpoSelectionInput {
  compositionTarget: CompositionTarget;
  detectedExpoDependency?: boolean;
  selectedServices?: readonly ExpoSelectionKind[];
  workspacePins?: ExpoWorkspacePins;
}

export interface ExpoCompatibilityReport {
  sdk: CompatibilityOutcome;
  reactNative: CompatibilityOutcome;
  react: CompatibilityOutcome;
  autoUpgradeAttempted: false;
  actionable: string;
}

export interface ShippingPlatformStewardProposal {
  missingFact: string;
  whyNotInvented: string;
  recommendation: string;
  examples: { composition: CompositionTarget; not: Record<string, unknown> };
  compatibility: string;
  tests: string;
}

export interface ExpoQueuedOwner {
  issue: 82 | 83 | 84 | 85 | 86 | 87 | 88;
  owns: string;
  consume: string;
  doNot: string;
}

export interface ExpoSelectionResolution {
  appStackSelected: boolean;
  detectedNotSelected: boolean;
  defaultStack: false;
  compositionTarget: CompositionTarget;
  shippingPlatform: ShippingPlatform | undefined;
  hostAgentInferredAsApp: false;
  webSatisfiesNativeRequirement: false;
  selectedServices: readonly ExpoSelectionKind[];
  idleUnselectedServices: readonly ExpoSelectionKind[];
  operations: readonly ExpoOperationSupport[];
  versionFacts: readonly ExpoVersionFact[];
  compatibility: ExpoCompatibilityReport;
  knowledgeReferenceIds: typeof EXPO_KNOWLEDGE_REFERENCE_IDS;
  queuedOwners: readonly ExpoQueuedOwner[];
  stewardProposal: ShippingPlatformStewardProposal;
}

const OPTIONAL_SERVICES = [
  "eas-cli",
  "eas-build",
  "eas-submit",
  "eas-update",
  "eas-hosting",
  "eas-workflows",
  "eas-observe",
  "expo-mcp",
  "analytics",
  "authentication",
  "billing",
] as const satisfies readonly ExpoSelectionKind[];

function isOptionalService(kind: ExpoSelectionKind): kind is (typeof OPTIONAL_SERVICES)[number] {
  return (OPTIONAL_SERVICES as readonly ExpoSelectionKind[]).includes(kind);
}

export const SHIPPING_PLATFORM_STEWARD_PROPOSAL: ShippingPlatformStewardProposal = {
  missingFact: "Machine-readable multi-platform shipping scope on the product-world instance",
  whyNotInvented:
    "catalog/ontology/world.yaml lists implementation types for a specific UI stack as out of scope. product.yaml has no platforms slot. composition.target is one platform plus one runtime.",
  recommendation:
    "Keep shipping surfaces in TECH_SPEC.md and DESIGN.md. Bind each operation with composition.target {platform, runtime: expo}. If a steward later adds a product slot, name customer-facing shipping surfaces (ios, android, web) without encoding Expo versus SwiftUI.",
  examples: {
    composition: { platform: "ios", runtime: EXPO_APP_RUNTIME },
    not: { "product.platforms": ["ios", "android"], "product.monetization.mode": "subscription" },
  },
  compatibility: "A product.yaml platforms field would change the world ontology and instance schema. Do not fork #67 or #68 schemas for Expo.",
  tests: "expo-selection fixtures never read product.platforms and refuse a web target as iOS or Android proof.",
};

export const EXPO_QUEUED_OWNERS: readonly ExpoQueuedOwner[] = [
  {
    issue: 82,
    owns: "Expo starter, Router/native UI, CNG, custom Swift/Kotlin module path",
    consume: "This mapping’s runtime slug and version facts; starter, native-ownership, and router-contract modules import it",
    doNot: "Relabel the Next.js habit-tracker starter, or replace product.yaml / DESIGN.md ownership",
  },
  {
    issue: 83,
    owns: "Auth, offline data, device capabilities, native RevenueCat purchase/restore",
    consume: "This mapping’s separate authentication and billing selections",
    doNot: "Treat #79 RevenueCat CLI as native purchase proof",
  },
  {
    issue: 84,
    owns: "Expo CLI and EAS process/job execution, signing readiness, store handoff boundary",
    consume: "Separate expo-cli, eas-cli, and EAS service selections",
    doNot: "Create a generic CLI framework to share with RevenueCat",
  },
  {
    issue: 85,
    owns: "EAS Update runtime compatibility, rollout, rollback",
    consume: "#84 executor plus version facts here",
    doNot: "Require OTA for every Expo app",
  },
  {
    issue: 86,
    owns: "Expo web export, API routes, selected hosting",
    consume: "web + expo target; web does not satisfy native rows",
    doNot: "Migrate an existing Next.js/Astro marketing site automatically",
  },
  {
    issue: 87,
    owns: "Official Expo skills and MCP routing through existing mobile-operation",
    consume: "This mapping’s source URLs and expo-mcp as an optional selection",
    doNot: "Install a second device router or auto-install skill packs",
  },
  {
    issue: 88,
    owns: "Per-platform proof matrix, observability, SDK upgrade proof, #72 benchmark",
    consume: "Evidence tiers here; frozen matrix on issue #88",
    doNot: "Create a second telemetry or acceptance platform",
  },
];

/**
 * Candidate reviewed baseline from the SDK 57 changelog and published sdk-compatibility notes.
 * Not an installed-binary proof and not a workspace pin.
 */
export const EXPO_REVIEWED_VERSION_FACTS: readonly ExpoVersionFact[] = [
  {
    component: "expo-sdk",
    kind: "reviewed-baseline",
    value: "57",
    evidenceTier: "researched",
    notes: "SDK 57 changelog (2026). Patch expo@57.0.17 is cited there for React Native 0.86.3. Not an executed CLI.",
  },
  {
    component: "react-native",
    kind: "reviewed-baseline",
    value: "0.86.3",
    evidenceTier: "researched",
    notes: "Paired with expo@57.0.17 in the SDK 57 changelog. Distinct from any workspace lock.",
  },
  {
    component: "react",
    kind: "reviewed-baseline",
    value: "19.2",
    evidenceTier: "researched",
    notes: "Unchanged from SDK 56 according to the SDK 57 changelog.",
  },
  {
    component: "expo-router",
    kind: "reviewed-baseline",
    value: "bundled-with-sdk-57",
    evidenceTier: "researched",
    notes: "Exact package version is a workspace pin. Do not take /latest/ docs as the installed Router.",
  },
  {
    component: "expo-cli",
    kind: "reviewed-baseline",
    value: "sdk-57-expo-package",
    evidenceTier: "researched",
    notes: "Ships with the selected expo package. Global npm install is not implied.",
  },
  {
    component: "eas-cli",
    kind: "reviewed-baseline",
    value: "unverified",
    evidenceTier: "researched",
    notes: "EAS CLI is a separate selection. No binary was executed during #81 intake.",
  },
  {
    component: "builder-package",
    kind: "workspace-pin",
    value: "distinct",
    evidenceTier: "fixture-tested",
    notes: "b2c-app-builder Node >=24 pin is not the Expo app SDK pin and not an EAS image.",
  },
  {
    component: "android-compile-sdk",
    kind: "observed-latest",
    value: "36",
    evidenceTier: "researched",
    notes: "From published SDK 57 sdk-compatibility notes. Not a host observation.",
  },
  {
    component: "android-min-sdk",
    kind: "observed-latest",
    value: "24",
    evidenceTier: "researched",
    notes: "From published SDK 57 sdk-compatibility notes. Not a host observation.",
  },
  {
    component: "xcode",
    kind: "observed-latest",
    value: "unverified-host",
    evidenceTier: "researched",
    notes: "@expo/sdk-compatibility samples mention Xcode 26.4 for 57.0.12. That is not proof of this host.",
  },
];

function operationSupport(): ExpoOperationSupport[] {
  return [
    {
      id: "stack-selection",
      title: "Select Expo as an app stack",
      selection: "app-framework",
      platforms: ["ios", "android", "web"],
      evidenceTier: "fixture-tested",
      queuedIssue: 81,
      notes: "composition.target.runtime expo. Not the default. Does not migrate existing apps.",
    },
    {
      id: "knowledge-routing",
      title: "SDK-matched Expo guidance retrieval",
      selection: "app-framework",
      platforms: ["ios", "android", "web", "host"],
      evidenceTier: "fixture-tested",
      queuedIssue: 81,
      notes: "Bounded knowledge sections. Stale hashes refuse. Not execution support.",
    },
    {
      id: "passive-detection",
      title: "Detect an Expo dependency without executing config",
      selection: "app-framework",
      platforms: ["host"],
      evidenceTier: "fixture-tested",
      queuedIssue: 81,
      notes: "inspect.ts package.json marker only. Not consent to replace the app or select EAS.",
    },
    {
      id: "starter-scaffold",
      title: "Expo TypeScript starter",
      selection: "app-framework",
      platforms: ["ios", "android", "web"],
      evidenceTier: "fixture-tested",
      queuedIssue: 82,
      notes:
        "Isolated TypeScript starter fixture and empty/dirty target policy are fixture-tested. No lockfile, development client, or packaged install yet. Habit-tracker starter remains Next.js.",
    },
    {
      id: "router-native-ui",
      title: "Expo Router and native UI",
      selection: "app-framework",
      platforms: ["ios", "android", "web"],
      evidenceTier: "blocked",
      queuedIssue: 82,
      notes:
        "Thin app/ file layout and src/ state contracts exist. Operation stays blocked: expo-router is unpinned, no Expo/RN runtime was executed, and SwiftUI remains the only UI adapter.",
    },
    {
      id: "cng-prebuild",
      title: "Continuous native generation",
      selection: "app-framework",
      platforms: ["ios", "android"],
      evidenceTier: "blocked",
      queuedIssue: 82,
      notes:
        "Blocked until Expo CLI prebuild is executed in a disposable workspace. Ownership classification in expo-native-ownership.ts is fixture-tested; that is not CNG generation.",
    },
    {
      id: "custom-native-module",
      title: "Custom Swift/Kotlin module",
      selection: "app-framework",
      platforms: ["ios", "android"],
      evidenceTier: "blocked",
      queuedIssue: 82,
      notes: "Native add requires a new binary. Web needs an explicit unsupported path.",
    },
    {
      id: "authentication",
      title: "App authentication",
      selection: "authentication",
      platforms: ["ios", "android", "web"],
      evidenceTier: "blocked",
      queuedIssue: 83,
      notes: "Separate from Expo framework selection and from RevenueCat identity.",
    },
    {
      id: "offline-data",
      title: "Local and server data",
      selection: "app-framework",
      platforms: ["ios", "android", "web"],
      evidenceTier: "blocked",
      queuedIssue: 83,
      notes: "SQLite/SecureStore semantics are not web storage and not a backend.",
    },
    {
      id: "device-capabilities",
      title: "Permissions, media, notifications",
      selection: "app-framework",
      platforms: ["ios", "android", "web"],
      evidenceTier: "blocked",
      queuedIssue: 83,
      notes: "Per-platform availability. Web must not fake native success.",
    },
    {
      id: "native-purchases",
      title: "Native purchase and restore",
      selection: "billing",
      platforms: ["ios", "android"],
      evidenceTier: "blocked",
      queuedIssue: 83,
      notes: "react-native-purchases on a custom build. #79 CLI is not this operation. Web billing stays separate.",
    },
    {
      id: "expo-cli-process",
      title: "Expo CLI operations",
      selection: "expo-cli",
      platforms: ["host"],
      evidenceTier: "fixture-tested",
      queuedIssue: 84,
      notes: "Typed argv, trusted executable, and fake-process dispatch are fixture-tested. Live Expo CLI binary was not executed.",
    },
    {
      id: "direct-local-compile",
      title: "Direct local native compile",
      selection: "developer-host",
      platforms: ["ios", "android"],
      evidenceTier: "fixture-tested",
      queuedIssue: 84,
      notes:
        "Host OS and Xcode/Android SDK requirements are fixture-tested. Live Xcode/Gradle compile remains not-run. A Linux host cannot claim it ran Xcode.",
    },
    {
      id: "eas-local-build",
      title: "EAS local build",
      selection: "eas-build",
      platforms: ["ios", "android"],
      evidenceTier: "fixture-tested",
      queuedIssue: 84,
      notes: "Auth/project-check classification is fixture-tested. Not fully offline and not identical to expo run:*. Live EAS local build remains not-run.",
    },
    {
      id: "eas-cloud-build",
      title: "EAS cloud build",
      selection: "eas-build",
      platforms: ["ios", "android"],
      evidenceTier: "fixture-tested",
      queuedIssue: 84,
      notes: "Upload, credits, and reconcile-before-retry are fixture-tested with fake jobs. Live paid EAS cloud build remains not-run.",
    },
    {
      id: "eas-workflows",
      title: "EAS Workflows",
      selection: "eas-workflows",
      platforms: ["host"],
      evidenceTier: "fixture-tested",
      queuedIssue: 84,
      notes:
        "Nested submit/update/deploy/trigger effect closure is fixture-tested. Live workflow run remains not-run. Must not become a second business orchestrator.",
    },
    {
      id: "store-handoff",
      title: "Store upload and submission handoff",
      selection: "eas-submit",
      platforms: ["ios", "android"],
      evidenceTier: "fixture-tested",
      queuedIssue: 84,
      notes:
        "Artifact vs uploaded vs testing vs submitted vs released stages are fixture-tested. Live App Store / Play submit remains not-run. Existing ASC/Play owners remain authoritative.",
    },
    {
      id: "eas-update",
      title: "EAS Update",
      selection: "eas-update",
      platforms: ["ios", "android"],
      evidenceTier: "blocked",
      queuedIssue: 85,
      notes: "Optional. Native changes need a compatible binary, not an OTA.",
    },
    {
      id: "expo-web-export",
      title: "Expo web export",
      selection: "shipping-platform",
      platforms: ["web"],
      evidenceTier: "blocked",
      queuedIssue: 86,
      notes: "Cannot satisfy an iOS or Android native requirement. Alpha SSR stays explicit.",
    },
    {
      id: "eas-hosting",
      title: "EAS Hosting",
      selection: "eas-hosting",
      platforms: ["web"],
      evidenceTier: "blocked",
      queuedIssue: 86,
      notes: "Optional host. Not required because the app selected Expo.",
    },
    {
      id: "expo-mcp",
      title: "Expo MCP",
      selection: "expo-mcp",
      platforms: ["host"],
      evidenceTier: "blocked",
      queuedIssue: 87,
      notes: "Optional. Discovery is not authorization. Reuse mobile-operation routing.",
    },
    {
      id: "official-skills",
      title: "Official Expo skills",
      selection: "app-framework",
      platforms: ["host"],
      evidenceTier: "blocked",
      queuedIssue: 87,
      notes: "Blocked until #87. Do not install expo/skills or treat a citation as a live #81 route.",
    },
    {
      id: "quality-observability",
      title: "Cross-platform quality and observability",
      selection: "analytics",
      platforms: ["ios", "android", "web"],
      evidenceTier: "blocked",
      queuedIssue: 88,
      notes: "Proof matrix frozen on GitHub issue #88. Observe does not replace native crash reporting.",
    },
  ];
}

export function evidenceTierRank(tier: EvidenceTier): number {
  switch (tier) {
    case "researched":
      return 0;
    case "implemented":
      return 1;
    case "fixture-tested":
      return 2;
    case "runtime-verified":
      return 3;
    case "externally-verified":
      return 4;
    case "blocked":
      return -1;
    default: {
      const exhaustive: never = tier;
      throw new Error(`unhandled evidence tier: ${String(exhaustive)}`);
    }
  }
}

export function isExpoAppRuntime(runtime: string): boolean {
  return runtime === EXPO_APP_RUNTIME;
}

export function isHostAgentTarget(target: CompositionTarget): boolean {
  return target.platform === "host" && target.runtime === HOST_AGENT_RUNTIME;
}

export function isExpoAppTarget(target: CompositionTarget): boolean {
  return target.platform !== "host" && isExpoAppRuntime(target.runtime);
}

export function shippingSatisfiesRequirement(selected: ShippingPlatform | undefined, required: ShippingPlatform): boolean {
  return selected === required;
}

export function selectionKindLabel(kind: ExpoSelectionKind): string {
  switch (kind) {
    case "app-framework":
      return "Expo application framework";
    case "shipping-platform":
      return "App shipping platform";
    case "host-agent":
      return "Builder host agent";
    case "developer-host":
      return "Developer host OS and native toolchain";
    case "expo-cli":
      return "Expo CLI";
    case "eas-cli":
      return "EAS CLI";
    case "eas-build":
      return "EAS Build";
    case "eas-submit":
      return "EAS Submit";
    case "eas-update":
      return "EAS Update";
    case "eas-hosting":
      return "EAS Hosting";
    case "eas-workflows":
      return "EAS Workflows";
    case "eas-observe":
      return "EAS Observe";
    case "expo-mcp":
      return "Expo MCP";
    case "analytics":
      return "Analytics";
    case "authentication":
      return "Authentication";
    case "billing":
      return "Billing";
    default: {
      const exhaustive: never = kind;
      throw new Error(`unhandled selection kind: ${String(exhaustive)}`);
    }
  }
}

function versionKindLabel(kind: VersionFactKind): string {
  switch (kind) {
    case "observed-latest":
      return "observed latest";
    case "reviewed-baseline":
      return "reviewed baseline";
    case "supported-range":
      return "supported range";
    case "workspace-pin":
      return "workspace pin";
    case "executed-version":
      return "executed version";
    default: {
      const exhaustive: never = kind;
      throw new Error(`unhandled version fact kind: ${String(exhaustive)}`);
    }
  }
}

function compatibilityKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parts = value.trim().match(/\d+/g);
  if (!parts || parts.length === 0) return undefined;
  const first = parts[0]!;
  const second = parts[1];
  if (first === "0" && second) return `0.${second}`;
  return first;
}

function comparePin(reviewed: string | undefined, pin: string | undefined): CompatibilityOutcome {
  if (!pin) return "unknown";
  if (!reviewed) return "unknown";
  const reviewedKey = compatibilityKey(reviewed);
  const pinKey = compatibilityKey(pin);
  if (!reviewedKey || !pinKey) {
    return reviewed === pin ? "match" : "mismatch";
  }
  return reviewedKey === pinKey ? "match" : "mismatch";
}

export function evaluateExpoCompatibility(pins: ExpoWorkspacePins | undefined): ExpoCompatibilityReport {
  const sdkFact = EXPO_REVIEWED_VERSION_FACTS.find((fact) => fact.component === "expo-sdk" && fact.kind === "reviewed-baseline");
  const rnFact = EXPO_REVIEWED_VERSION_FACTS.find((fact) => fact.component === "react-native" && fact.kind === "reviewed-baseline");
  const reactFact = EXPO_REVIEWED_VERSION_FACTS.find((fact) => fact.component === "react" && fact.kind === "reviewed-baseline");
  const sdk = comparePin(sdkFact?.value, pins?.expoSdk);
  const reactNative = comparePin(rnFact?.value, pins?.reactNative);
  const react = comparePin(reactFact?.value, pins?.react);
  const mismatch = sdk === "mismatch" || reactNative === "mismatch" || react === "mismatch";
  const unknown = sdk === "unknown" || reactNative === "unknown" || react === "unknown";
  let actionable: string;
  if (mismatch) {
    actionable = "Workspace pins do not match the reviewed Expo SDK baseline. Treat this as an incompatibility. Do not run an automatic upgrade.";
  } else if (unknown) {
    actionable = "Expo SDK, React Native, or React workspace pins are missing. Record the pins before claiming compatibility. Do not run an automatic upgrade.";
  } else {
    actionable = "Declared majors match the reviewed baseline. Live CLI, native toolchain, and lockfile compatibility remain unverified.";
  }
  return { sdk, reactNative, react, autoUpgradeAttempted: false, actionable };
}

function shippingPlatformOf(target: CompositionTarget): ShippingPlatform | undefined {
  if (target.platform === "host") return undefined;
  return target.platform;
}

export function resolveExpoSelection(input: ExpoSelectionInput): ExpoSelectionResolution {
  const appStackSelected = isExpoAppTarget(input.compositionTarget);
  const detectedNotSelected = Boolean(input.detectedExpoDependency) && !appStackSelected;
  const selectedServices = Object.freeze(
    Array.from(new Set<ExpoSelectionKind>([...(appStackSelected ? (["app-framework"] as const) : []), ...(input.selectedServices ?? [])])),
  );
  const selectedSet = new Set(selectedServices);
  const idleUnselectedServices = Object.freeze(OPTIONAL_SERVICES.filter((service) => !selectedSet.has(service)));
  const operations = operationSupport().map((operation) => {
    if (operation.queuedIssue === 81) return operation;
    if (!appStackSelected && operation.selection === "app-framework") {
      return { ...operation, evidenceTier: "blocked" as const, notes: `${operation.notes} Unselected: Expo app stack is not the composition target.` };
    }
    if (!selectedSet.has(operation.selection) && isOptionalService(operation.selection)) {
      return {
        ...operation,
        evidenceTier: "blocked" as const,
        notes: `${operation.notes} Unselected ${selectionKindLabel(operation.selection)} stays idle.`,
      };
    }
    return operation;
  });
  const versionFacts = EXPO_REVIEWED_VERSION_FACTS.map((fact) => ({ ...fact, notes: `${versionKindLabel(fact.kind)}: ${fact.notes}` }));
  return {
    appStackSelected,
    detectedNotSelected,
    defaultStack: false,
    compositionTarget: input.compositionTarget,
    shippingPlatform: shippingPlatformOf(input.compositionTarget),
    hostAgentInferredAsApp: false,
    webSatisfiesNativeRequirement: false,
    selectedServices,
    idleUnselectedServices,
    operations,
    versionFacts,
    compatibility: evaluateExpoCompatibility(input.workspacePins),
    knowledgeReferenceIds: EXPO_KNOWLEDGE_REFERENCE_IDS,
    queuedOwners: EXPO_QUEUED_OWNERS,
    stewardProposal: SHIPPING_PLATFORM_STEWARD_PROPOSAL,
  };
}

export function operationFor(resolution: ExpoSelectionResolution, id: ExpoOperationId): ExpoOperationSupport {
  const match = resolution.operations.find((operation) => operation.id === id);
  if (!match) throw new Error(`unknown Expo operation: ${id}`);
  return match;
}
