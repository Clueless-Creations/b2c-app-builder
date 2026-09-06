import type { CatalogProviderContract } from "../../adapters/providers/contract.js";
import type { CapabilityDefinition } from "../capabilities/types.js";
import type {
  CatalogArea,
  CatalogDomain,
  CatalogIssue,
  CatalogReference,
  CatalogWorkflowDef,
  CatalogRole,
  CatalogGate,
  CatalogContextPack,
  CatalogPhase,
  CatalogLane,
  CatalogProfile,
  CatalogRepositoryProfile,
} from "../types.js";

export type CapabilityPackId = `capability.${string}`;
export type BusinessPackId = `business-pack.${string}`;
export type PackId = CapabilityPackId | BusinessPackId;

export type PackKind = "capability" | "business-pack";
export type ExtensionSlotKind = "bind" | "strengthen";

export const PAID_GENERATIVE_AI_PACK_ID = "capability.paid-generative-ai" as const;

export interface PackExtension {
  targetId: string;
  slot: string;
  kind: ExtensionSlotKind | "weaken";
  removeGates?: string[];
  referenceIds?: string[];
}

export interface PackManifest {
  id: PackId;
  title: string;
  version: string;
  revision: string;
  kind: PackKind;
  dependsOn: PackId[];
  createsProviderSpend: boolean;
  domains: CatalogDomain[];
  workflows: CatalogWorkflowDef[];
  roles?: CatalogRole[];
  gates?: CatalogGate[];
  references: CatalogReference[];
  contextPacks?: CatalogContextPack[];
  phases?: CatalogPhase[];
  lanes?: CatalogLane[];
  profiles?: CatalogProfile[];
  repositoryProfiles?: CatalogRepositoryProfile[];
  providerContracts?: CatalogProviderContract[];
  areas: CatalogArea[];
  capabilities: CapabilityDefinition[];
  extensions: PackExtension[];
}

export interface PackCompositionIssue extends CatalogIssue {
  packId?: string;
}

export function isPackId(value: string): value is PackId {
  return /^(capability|business-pack)\.[a-z][a-z0-9-]*$/.test(value);
}

export function packKindFromId(id: string): PackKind | undefined {
  if (id.startsWith("capability.")) return "capability";
  if (id.startsWith("business-pack.")) return "business-pack";
  return undefined;
}
