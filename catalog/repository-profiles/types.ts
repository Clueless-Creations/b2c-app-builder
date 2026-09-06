import type { RepositoryProfileId } from "../../kernel/schema/types.js";
import type { CatalogRepositoryProfile } from "../types.js";
import { PAID_GENERATIVE_AI_PACK_ID } from "../packs/types.js";

export type { CatalogRepositoryProfile, RepositoryProfileId };
export { isRepositoryProfileId, repositoryProfileIds } from "../../kernel/schema/types.js";
export { PAID_GENERATIVE_AI_PACK_ID };

export const REPOSITORY_PROFILE_REVISION = "rev-repository-profiles-2026-08-24";

export const SAFETY_TRUST_GATES = [
  "check:privacy",
  "check:secrets",
  "check:security",
  "check:revenue",
  "check:provider-proof",
  "check:ai-provider-controls",
  "check:source-checkpoint",
  "check:apple-release-readiness",
] as const;

export type SafetyTrustGate = (typeof SAFETY_TRUST_GATES)[number];

export type ArtifactKind = "canonical" | "generated";
export type RequirementKind = "artifact" | "validator" | "front-door";
export type RequirementActivatorKind = "profile" | "pack" | "workflow" | "capability";

export interface RequirementActivator {
  kind: RequirementActivatorKind;
  id: string;
}

export interface FrontDoorPolicy {
  requireReadme: boolean;
  requireCommunityHealth: boolean;
}

export interface WorkspaceRepositoryProfileAcceptance {
  id: RepositoryProfileId;
  revision: string;
  acceptedAt: string;
}

export interface RepositoryProfileOverlay {
  id?: string;
  revision?: string;
  acceptedAt?: string;
  suppressGates: string[];
  canonicalPaths: string[];
  compositionPackIds: string[];
}

export type OverlayReadResult =
  { status: "absent" } | { status: "invalid"; issue: RepositoryProfileIssue } | { status: "ok"; overlay: RepositoryProfileOverlay };

export interface CompiledRequirement {
  kind: RequirementKind;
  path?: string;
  command?: string;
  artifactKind?: ArtifactKind;
  required: boolean;
  optional: boolean;
  suppressible: boolean;
  activators: RequirementActivator[];
}

export interface RepositoryProfileIssue {
  code: string;
  message: string;
  path?: string;
}

export interface WorkspaceCapabilitySet {
  privacy: boolean;
  secrets: boolean;
  security: boolean;
  revenue: boolean;
  providerProof: boolean;
  appleSigning: boolean;
  paidAi: boolean;
  publicCommunity: boolean;
  compositionPackIds: readonly string[];
}

export interface CompiledRepositoryContract {
  profileId: RepositoryProfileId | "unselected";
  revision: string | null;
  accepted: boolean;
  capabilities: WorkspaceCapabilitySet;
  artifacts: CompiledRequirement[];
  validators: CompiledRequirement[];
  frontDoor: CompiledRequirement[];
  issues: RepositoryProfileIssue[];
}

export function isSafetyTrustGate(value: string): value is SafetyTrustGate {
  return (SAFETY_TRUST_GATES as readonly string[]).includes(value);
}
