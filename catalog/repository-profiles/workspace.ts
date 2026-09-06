import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { isRepositoryProfileId } from "../../kernel/schema/types.js";
import type { OverlayReadResult, RepositoryProfileOverlay, WorkspaceRepositoryProfileAcceptance } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readProjectState(root: string): Record<string, unknown> | undefined {
  const file = path.join(root, "state/business-state.json");
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function overlayFromRead(result: OverlayReadResult): RepositoryProfileOverlay | undefined {
  switch (result.status) {
    case "ok":
      return result.overlay;
    case "absent":
    case "invalid":
      return undefined;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

export function readRepositoryProfileOverlay(root: string): OverlayReadResult {
  const file = path.join(root, "state/repository-profile.yaml");
  if (!existsSync(file)) return { status: "absent" };
  try {
    const parsed: unknown = parseYaml(readFileSync(file, "utf8"));
    if (!isRecord(parsed)) {
      return {
        status: "invalid",
        issue: {
          code: "repository_profile.overlay_invalid",
          message: "state/repository-profile.yaml must be a YAML mapping. A malformed overlay cannot become an absent profile.",
          path: "state/repository-profile.yaml",
        },
      };
    }
    return {
      status: "ok",
      overlay: {
        id: asString(parsed.id) || undefined,
        revision: asString(parsed.revision) || undefined,
        acceptedAt: asString(parsed.accepted_at) || asString(parsed.acceptedAt) || undefined,
        suppressGates: asStringArray(parsed.suppress_gates ?? parsed.suppressGates),
        canonicalPaths: asStringArray(parsed.canonical_paths ?? parsed.canonicalPaths),
        compositionPackIds: asStringArray(parsed.composition_packs ?? parsed.compositionPacks),
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "invalid",
      issue: {
        code: "repository_profile.overlay_invalid",
        message: `state/repository-profile.yaml is not valid YAML: ${detail}`,
        path: "state/repository-profile.yaml",
      },
    };
  }
}

/**
 * Raw id from overlay or business-state.json, including unknown values so the compiler
 * can fail closed instead of using default routing.
 */
export function readRawRepositoryProfileId(root: string): string | undefined {
  const overlay = overlayFromRead(readRepositoryProfileOverlay(root));
  if (overlay?.id) return overlay.id;
  const state = readProjectState(root);
  if (!state) return undefined;
  const project = isRecord(state.project) ? state.project : undefined;
  if (!project) return undefined;
  const nested = isRecord(project.repositoryProfile) ? project.repositoryProfile : undefined;
  const id = nested ? asString(nested.id) : "";
  return id || undefined;
}

export function readAcceptedRepositoryProfile(root: string): WorkspaceRepositoryProfileAcceptance | undefined {
  const overlay = overlayFromRead(readRepositoryProfileOverlay(root));
  const state = readProjectState(root);
  const project = state && isRecord(state.project) ? state.project : undefined;
  const nested = project && isRecord(project.repositoryProfile) ? project.repositoryProfile : undefined;
  const id = asString(nested?.id) || overlay?.id || "";
  const revision = asString(nested?.revision) || overlay?.revision || "";
  const acceptedAt = asString(nested?.acceptedAt) || overlay?.acceptedAt || "";
  if (!isRepositoryProfileId(id) || !revision || !acceptedAt) return undefined;
  return { id, revision, acceptedAt };
}

export function readCompositionPackIds(root: string): string[] {
  const overlay = overlayFromRead(readRepositoryProfileOverlay(root));
  if (overlay && overlay.compositionPackIds.length > 0) return [...overlay.compositionPackIds];
  const runtimePath = path.join(root, ".b2c-launch/runtime.json");
  if (!existsSync(runtimePath)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(runtimePath, "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.composition) || !Array.isArray(parsed.composition.packs)) return [];
    return parsed.composition.packs.map((pack) => (isRecord(pack) ? asString(pack.id) : "")).filter((id) => id.length > 0);
  } catch {
    return [];
  }
}

export function fileExists(root: string, relative: string): boolean {
  return existsSync(path.join(root, relative));
}
