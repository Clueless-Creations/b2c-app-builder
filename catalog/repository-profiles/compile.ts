import { isRepositoryProfileId } from "../../kernel/schema/types.js";
import { paidGenerationApplies } from "./paid-generation-applicability.js";
import { communityHealthPaths, findRepositoryProfile, frontDoorPolicyFor } from "./registry.js";
import {
  isSafetyTrustGate,
  PAID_GENERATIVE_AI_PACK_ID,
  REPOSITORY_PROFILE_REVISION,
  type CompiledRepositoryContract,
  type CompiledRequirement,
  type RepositoryProfileIssue,
  type RequirementActivator,
  type WorkspaceCapabilitySet,
} from "./types.js";
import {
  fileExists,
  overlayFromRead,
  readAcceptedRepositoryProfile,
  readCompositionPackIds,
  readProjectState,
  readRawRepositoryProfileId,
  readRepositoryProfileOverlay,
} from "./workspace.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function laneStatus(state: Record<string, unknown> | undefined, lane: string): string {
  if (!state || !isRecord(state.lanes) || !isRecord(state.lanes[lane])) return "";
  return asString(state.lanes[lane].status);
}

function laneInScope(state: Record<string, unknown> | undefined, lane: string): boolean {
  const status = laneStatus(state, lane);
  return status !== "not_needed" && status !== "deferred";
}

function generativeAiRequired(state: Record<string, unknown> | undefined): boolean {
  if (!state) return false;
  const block = isRecord(state.workflow_applicability)
    ? state.workflow_applicability
    : isRecord(state.workflowApplicability)
      ? state.workflowApplicability
      : undefined;
  if (!block) return false;
  const record = isRecord(block["workflow.trust.generative-ai-safety"])
    ? block["workflow.trust.generative-ai-safety"]
    : isRecord(block["workflow.trust.paid-generative-ai-controls"])
      ? block["workflow.trust.paid-generative-ai-controls"]
      : undefined;
  return asString(record?.verdict).toLowerCase() === "required";
}

export function detectWorkspaceCapabilities(root: string): WorkspaceCapabilitySet {
  const state = readProjectState(root);
  const compositionPackIds = readCompositionPackIds(root);
  return {
    privacy: fileExists(root, "trust/PRIVACY.md") || fileExists(root, "trust/TERMS.md") || laneInScope(state, "privacy_legal"),
    secrets: fileExists(root, "SECRETS.md") || fileExists(root, "trust/secrets/SECRETS.md") || laneInScope(state, "secrets"),
    security: fileExists(root, "trust/SECURITY.md") || laneInScope(state, "security"),
    revenue: fileExists(root, "revenue/REVENUE_OPS.md") || laneInScope(state, "revenue"),
    providerProof: fileExists(root, "operations/PROVIDER_PROOF.md"),
    appleSigning: fileExists(root, "store/APPLE_SIGNING.md") || laneInScope(state, "apple_signing"),
    paidAi: paidGenerationApplies(root) || generativeAiRequired(state) || compositionPackIds.includes(PAID_GENERATIVE_AI_PACK_ID),
    publicCommunity: false,
    compositionPackIds,
  };
}

function uniqueRequirements(items: CompiledRequirement[]): CompiledRequirement[] {
  const seen = new Set<string>();
  const result: CompiledRequirement[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.path ?? ""}:${item.command ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function requirement(partial: CompiledRequirement): CompiledRequirement {
  return partial;
}

function capabilityActivator(id: string): RequirementActivator {
  return { kind: "capability", id };
}

export function compileRepositoryContract(root: string): CompiledRepositoryContract {
  const issues: RepositoryProfileIssue[] = [];
  const overlayRead = readRepositoryProfileOverlay(root);
  switch (overlayRead.status) {
    case "invalid":
      issues.push(overlayRead.issue);
      break;
    case "absent":
    case "ok":
      break;
    default: {
      const exhaustive: never = overlayRead;
      void exhaustive;
    }
  }
  const overlay = overlayFromRead(overlayRead);
  const accepted = readAcceptedRepositoryProfile(root);
  const rawId = readRawRepositoryProfileId(root);
  const capabilities = detectWorkspaceCapabilities(root);
  const state = readProjectState(root);
  const project = state && isRecord(state.project) ? state.project : undefined;
  const nested =
    project && isRecord(project.repository_profile)
      ? project.repository_profile
      : project && isRecord(project.repositoryProfile)
        ? project.repositoryProfile
        : undefined;
  const stateId = asString(nested?.id);
  if (overlay?.id && stateId && overlay.id !== stateId) {
    issues.push({
      code: "repository_profile.id_conflict",
      message: `state/repository-profile.yaml id "${overlay.id}" does not match project.repository_profile.id "${stateId}".`,
      path: "state/repository-profile.yaml",
    });
  }
  if (rawId && !isRepositoryProfileId(rawId)) {
    issues.push({
      code: "repository_profile.unknown_id",
      message: `Repository profile id "${rawId}" is not a supported profile.`,
      path: overlay?.id === rawId ? "state/repository-profile.yaml" : "state/business-state.json",
    });
  }
  if (rawId && isRepositoryProfileId(rawId) && !accepted) {
    issues.push({
      code: "repository_profile.acceptance_incomplete",
      message: `Repository profile "${rawId}" is declared without revision and accepted_at. Record founder acceptance before the profile can apply.`,
      path: overlay?.id === rawId ? "state/repository-profile.yaml" : "state/business-state.json",
    });
  }

  const profileId = accepted?.id;
  const profile = profileId ? findRepositoryProfile(profileId) : undefined;
  if (accepted && accepted.revision !== REPOSITORY_PROFILE_REVISION) {
    issues.push({
      code: "repository_profile.revision_stale",
      message: `Accepted repository profile revision "${accepted.revision}" is not current (${REPOSITORY_PROFILE_REVISION}). Re-accept the current revision.`,
      path: "state/business-state.json",
    });
  }

  const artifacts: CompiledRequirement[] = [];
  const validators: CompiledRequirement[] = [];
  const frontDoor: CompiledRequirement[] = [];
  const acceptedProfile = Boolean(accepted && profile);

  if (profile && profileId && acceptedProfile) {
    capabilities.publicCommunity = profile.requireCommunityHealth;
    const profileActivator: RequirementActivator = { kind: "profile", id: profile.id };
    for (const relative of profile.alwaysCanonical) {
      artifacts.push(
        requirement({
          kind: "artifact",
          path: relative,
          artifactKind: "canonical",
          required: true,
          optional: false,
          suppressible: false,
          activators: [profileActivator],
        }),
      );
    }
    for (const relative of profile.alwaysGenerated) {
      artifacts.push(
        requirement({
          kind: "artifact",
          path: relative,
          artifactKind: "generated",
          required: false,
          optional: true,
          suppressible: false,
          activators: [profileActivator],
        }),
      );
    }
    const policy = frontDoorPolicyFor(profileId);
    if (policy.requireReadme) {
      frontDoor.push(
        requirement({
          kind: "front-door",
          path: "README.md",
          required: true,
          optional: false,
          suppressible: false,
          activators: [profileActivator],
        }),
      );
    }
    if (policy.requireCommunityHealth) {
      for (const relative of communityHealthPaths()) {
        frontDoor.push(
          requirement({
            kind: "front-door",
            path: relative,
            required: true,
            optional: false,
            suppressible: false,
            activators: [profileActivator, { kind: "capability", id: "public-community" }],
          }),
        );
        artifacts.push(
          requirement({
            kind: "artifact",
            path: relative,
            artifactKind: "canonical",
            required: true,
            optional: false,
            suppressible: false,
            activators: [profileActivator, { kind: "capability", id: "public-community" }],
          }),
        );
      }
    }
  }

  const safetyArtifacts: Array<{ command: string; path: string; capability: keyof WorkspaceCapabilitySet; workflow: string }> = [
    { command: "check:privacy", path: "trust/PRIVACY.md", capability: "privacy", workflow: "workflow.trust.privacy-and-terms" },
    { command: "check:privacy", path: "trust/TERMS.md", capability: "privacy", workflow: "workflow.trust.privacy-and-terms" },
    { command: "check:secrets", path: "SECRETS.md", capability: "secrets", workflow: "workflow.operations.secrets-baseline-and-routing" },
    { command: "check:security", path: "trust/SECURITY.md", capability: "security", workflow: "workflow.trust.security-architecture-and-release-gate" },
    { command: "check:revenue", path: "revenue/REVENUE_OPS.md", capability: "revenue", workflow: "workflow.money.revenue-monetization" },
    {
      command: "check:provider-proof",
      path: "operations/PROVIDER_PROOF.md",
      capability: "providerProof",
      workflow: "workflow.process.provider-proof-verification",
    },
    {
      command: "check:apple-release-readiness",
      path: "store/APPLE_SIGNING.md",
      capability: "appleSigning",
      workflow: "workflow.store.apple-signing-and-release-readiness",
    },
    {
      command: "check:ai-provider-controls",
      path: "trust/AI_PROVIDER_CONTROLS.md",
      capability: "paidAi",
      workflow: "workflow.trust.generative-ai-safety",
    },
  ];

  const seenCommands = new Set<string>();
  for (const item of safetyArtifacts) {
    if (!capabilities[item.capability]) continue;
    if (acceptedProfile) {
      artifacts.push(
        requirement({
          kind: "artifact",
          path: item.path,
          artifactKind: "canonical",
          required: true,
          optional: false,
          suppressible: false,
          activators: [capabilityActivator(item.capability), { kind: "workflow", id: item.workflow }],
        }),
      );
    }
    if (!seenCommands.has(item.command)) {
      seenCommands.add(item.command);
      validators.push(
        requirement({
          kind: "validator",
          command: item.command,
          required: true,
          optional: false,
          suppressible: false,
          activators: [capabilityActivator(item.capability), { kind: "workflow", id: item.workflow }],
        }),
      );
    }
  }

  if (capabilities.secrets || capabilities.security || capabilities.revenue || capabilities.privacy || capabilities.appleSigning) {
    validators.push(
      requirement({
        kind: "validator",
        command: "check:source-checkpoint",
        required: true,
        optional: false,
        suppressible: false,
        activators: [{ kind: "capability", id: "release-truth" }],
      }),
    );
  }

  if (capabilities.paidAi) {
    validators.push(
      requirement({
        kind: "validator",
        command: "check:ai-provider-controls",
        required: true,
        optional: false,
        suppressible: false,
        activators: [
          capabilityActivator("paidAi"),
          { kind: "pack", id: PAID_GENERATIVE_AI_PACK_ID },
          { kind: "workflow", id: "workflow.trust.generative-ai-safety" },
        ],
      }),
    );
    if (!capabilities.compositionPackIds.includes(PAID_GENERATIVE_AI_PACK_ID)) {
      issues.push({
        code: "repository_profile.paid_ai_pack_missing",
        message:
          "A paid generative-AI capability is active, but composition does not pin capability.paid-generative-ai. The control record and incident runbook must travel together.",
        path: "trust/AI_PROVIDER_CONTROLS.md",
      });
    }
  }

  const generatedPaths = new Set(artifacts.filter((item) => item.artifactKind === "generated" && item.path).map((item) => item.path as string));
  const overlayCanonical = overlay?.canonicalPaths ?? [];
  for (const relative of overlayCanonical) {
    if (generatedPaths.has(relative) || relative.includes("/generated/") || relative.includes("generated/")) {
      issues.push({
        code: "repository_profile.generated_as_source",
        message: `Generated projection "${relative}" cannot be listed as a canonical source.`,
        path: "state/repository-profile.yaml",
      });
    } else if (acceptedProfile) {
      artifacts.push(
        requirement({
          kind: "artifact",
          path: relative,
          artifactKind: "canonical",
          required: true,
          optional: false,
          suppressible: false,
          activators: [{ kind: "profile", id: profile?.id ?? "unselected" }],
        }),
      );
    }
  }

  for (const gate of overlay?.suppressGates ?? []) {
    const applicable = validators.some((item) => item.command === gate) || isSafetyTrustGate(gate);
    if (applicable && isSafetyTrustGate(gate)) {
      issues.push({
        code: "repository_profile.safety_suppressed",
        message: `Repository profile overlay must not suppress safety/trust gate ${gate}.`,
        path: "state/repository-profile.yaml",
      });
    } else if (applicable) {
      issues.push({
        code: "repository_profile.safety_suppressed",
        message: `Repository profile overlay must not suppress applicable gate ${gate}.`,
        path: "state/repository-profile.yaml",
      });
    }
  }

  if (acceptedProfile) {
    for (const item of uniqueRequirements(artifacts)) {
      if (!item.required || item.artifactKind !== "canonical" || !item.path) continue;
      if (fileExists(root, item.path)) continue;
      if (item.path === "SECRETS.md" && fileExists(root, "trust/secrets/SECRETS.md")) continue;
      issues.push({
        code: "repository_profile.canonical_missing",
        message: `Required canonical artifact "${item.path}" is missing.`,
        path: item.path,
      });
    }
    for (const item of uniqueRequirements(frontDoor)) {
      if (!item.required || !item.path) continue;
      if (fileExists(root, item.path)) continue;
      issues.push({
        code: "repository_profile.front_door_missing",
        message: `Required repository front-door file "${item.path}" is missing for profile ${profile?.id}.`,
        path: item.path,
      });
    }
  }

  return {
    profileId: profileId ?? "unselected",
    revision: accepted?.revision ?? (profile ? REPOSITORY_PROFILE_REVISION : null),
    accepted: acceptedProfile,
    capabilities,
    artifacts: uniqueRequirements(artifacts),
    validators: uniqueRequirements(validators),
    frontDoor: uniqueRequirements(frontDoor),
    issues,
  };
}

export function renderRequirementInventory(contract: CompiledRepositoryContract): { json: string; markdown: string } {
  const requirements = [...contract.artifacts, ...contract.validators, ...contract.frontDoor];
  const json = `${JSON.stringify(
    {
      schemaVersion: "1.0.0",
      profileId: contract.profileId,
      revision: contract.revision,
      accepted: contract.accepted,
      requirements,
      issues: contract.issues,
    },
    null,
    2,
  )}\n`;
  const lines = [
    "# Requirement Inventory",
    "",
    "Generated. Do not edit this file as source.",
    "",
    `Profile: ${contract.profileId}`,
    `Revision: ${contract.revision ?? "none"}`,
    `Accepted: ${contract.accepted ? "yes" : "no"}`,
    "",
    "| Kind | Path or command | Required | Why |",
    "| --- | --- | --- | --- |",
  ];
  for (const item of requirements) {
    const target = item.path ?? item.command ?? "";
    const why = item.activators.map((activator) => `${activator.kind}:${activator.id}`).join(", ");
    lines.push(`| ${item.kind} | ${target} | ${item.required ? "yes" : "no"} | ${why} |`);
  }
  lines.push("");
  return { json, markdown: `${lines.join("\n")}\n` };
}

export function generatedProjectionPaths(contract: CompiledRepositoryContract): Set<string> {
  return new Set(contract.artifacts.filter((item) => item.artifactKind === "generated" && item.path).map((item) => item.path as string));
}
