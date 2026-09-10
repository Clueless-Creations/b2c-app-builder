/**
 * Official Expo skills and MCP routing (#87).
 *
 * Inventory only. This module does not install expo/skills, connect Expo MCP, or add a
 * MobileOperationTransport. Host-native device tools stay preferred. Builder AGENTS.md remains
 * authoritative over any upstream skill instruction.
 *
 * Inspected README revision: 170589a7ee8963156f63de8202fa96cf08a9e610 on github.com/expo/skills.
 */
import { EXPO_KNOWLEDGE_REFERENCE_IDS, EXPO_SOURCE_URLS, type ExpoOperationId } from "./expo-selection.js";

export const EXPO_SKILLS_INSPECTED_COMMIT = "170589a7ee8963156f63de8202fa96cf08a9e610";
export const EXPO_SKILLS_LICENSE = "MIT";
export const EXPO_SKILLS_TELEMETRY_DEFAULT = "off" as const;

export type ExpoSkillGroup = "start-here" | "framework" | "services" | "experimental";

export type ExpoSkillInstallPolicy = "refuse-until-authorized";

export interface ExpoOfficialSkill {
  id: string;
  group: ExpoSkillGroup;
  mapsTo: readonly (typeof EXPO_KNOWLEDGE_REFERENCE_IDS)[number][];
  queuedIssue: 82 | 83 | 84 | 85 | 86 | 87 | 88 | null;
  paidService: boolean;
  experimental: boolean;
}

export const EXPO_OFFICIAL_SKILLS: readonly ExpoOfficialSkill[] = [
  {
    id: "expo-overview",
    group: "start-here",
    mapsTo: ["reference.engineering.expo-stack-selection", "reference.engineering.expo-operations-map"],
    queuedIssue: null,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-project-structure",
    group: "framework",
    mapsTo: ["reference.engineering.expo-stack-selection"],
    queuedIssue: 82,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-router",
    group: "framework",
    mapsTo: ["reference.engineering.expo-operations-map"],
    queuedIssue: 82,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-native-ui",
    group: "framework",
    mapsTo: ["reference.engineering.expo-operations-map"],
    queuedIssue: 82,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-design-system",
    group: "framework",
    mapsTo: ["reference.engineering.expo-stack-selection"],
    queuedIssue: 82,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-module",
    group: "framework",
    mapsTo: ["reference.engineering.expo-operations-map", "reference.engineering.expo-compatibility"],
    queuedIssue: 82,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-dev-client",
    group: "framework",
    mapsTo: ["reference.engineering.expo-operations-map"],
    queuedIssue: 82,
    paidService: false,
    experimental: false,
  },
  {
    id: "expo-upgrade",
    group: "framework",
    mapsTo: ["reference.engineering.expo-compatibility"],
    queuedIssue: 88,
    paidService: false,
    experimental: false,
  },
  {
    id: "eas-hosting",
    group: "services",
    mapsTo: ["reference.engineering.expo-operations-map"],
    queuedIssue: 86,
    paidService: true,
    experimental: false,
  },
  {
    id: "eas-update",
    group: "services",
    mapsTo: ["reference.engineering.expo-operations-map"],
    queuedIssue: 85,
    paidService: true,
    experimental: false,
  },
  {
    id: "eas-app-stores",
    group: "services",
    mapsTo: ["reference.engineering.expo-operations-map"],
    queuedIssue: 84,
    paidService: true,
    experimental: false,
  },
  {
    id: "expo-migrate-module",
    group: "experimental",
    mapsTo: ["reference.engineering.expo-compatibility"],
    queuedIssue: 82,
    paidService: false,
    experimental: true,
  },
];

export interface ExpoSkillDiscovery {
  installPolicy: ExpoSkillInstallPolicy;
  telemetryDefault: typeof EXPO_SKILLS_TELEMETRY_DEFAULT;
  mcpSelectedByDefault: false;
  addsMobileOperationTransport: false;
  hostNativePreferred: true;
  officialSkillsSource: typeof EXPO_SOURCE_URLS.officialSkills;
  inspectedCommit: typeof EXPO_SKILLS_INSPECTED_COMMIT;
  skills: readonly ExpoOfficialSkill[];
}

export function discoverExpoOfficialSkills(): ExpoSkillDiscovery {
  return {
    installPolicy: "refuse-until-authorized",
    telemetryDefault: EXPO_SKILLS_TELEMETRY_DEFAULT,
    mcpSelectedByDefault: false,
    addsMobileOperationTransport: false,
    hostNativePreferred: true,
    officialSkillsSource: EXPO_SOURCE_URLS.officialSkills,
    inspectedCommit: EXPO_SKILLS_INSPECTED_COMMIT,
    skills: EXPO_OFFICIAL_SKILLS,
  };
}

export function expoSkillInstallCommand(authorized: boolean, skillId?: string): { action: "refuse" | "prepare"; command?: string; reason: string } {
  if (!authorized) {
    return {
      action: "refuse",
      reason: "Official Expo skills stay uninstalled until founder approval for this session. Discovery is not an install.",
    };
  }
  const skill = skillId ? EXPO_OFFICIAL_SKILLS.find((entry) => entry.id === skillId) : undefined;
  if (skillId && !skill) {
    return { action: "refuse", reason: `Unknown official Expo skill ${skillId}. Do not install a guessed pack.` };
  }
  const selector = skill ? `--skill ${skill.id}` : "--skill expo-overview";
  return {
    action: "prepare",
    command: `npx skills add expo/skills ${selector}`,
    reason: "Prepared scoped install. Do not pass --yes during intake. Do not install the full pack as a default.",
  };
}

export function expoMcpDoesNotReplace(operation: ExpoOperationId): boolean {
  switch (operation) {
    case "expo-mcp":
    case "official-skills":
      return true;
    case "stack-selection":
    case "knowledge-routing":
    case "passive-detection":
    case "starter-scaffold":
    case "router-native-ui":
    case "cng-prebuild":
    case "custom-native-module":
    case "authentication":
    case "offline-data":
    case "device-capabilities":
    case "native-purchases":
    case "expo-cli-process":
    case "eas-cloud-build":
    case "eas-local-build":
    case "direct-local-compile":
    case "eas-workflows":
    case "store-handoff":
    case "eas-update":
    case "expo-web-export":
    case "eas-hosting":
    case "quality-observability":
      return true;
    default: {
      const exhaustive: never = operation;
      throw new Error(`unhandled Expo operation: ${String(exhaustive)}`);
    }
  }
}
