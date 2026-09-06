import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const B2C_APP_BUILDER_CLIENT_RUNTIME_IDS = ["codex", "claude", "agents", "cursor"] as const;
export type B2CAppBuilderClientRuntimeId = (typeof B2C_APP_BUILDER_CLIENT_RUNTIME_IDS)[number];

export interface RuntimeInstallRoot {
  readonly id: B2CAppBuilderClientRuntimeId;
  readonly root: string;
}

export type RuntimePinRelation = "equal" | "behind" | "ahead" | "invalid" | "missing";

export interface RuntimePinInspection {
  readonly id: B2CAppBuilderClientRuntimeId;
  readonly root: string;
  readonly exists: boolean;
  readonly version?: string;
  readonly relation: RuntimePinRelation;
}

function runtimePath(home: string, id: B2CAppBuilderClientRuntimeId): string {
  switch (id) {
    case "codex":
      return path.join(home, ".codex", "skills", "b2c-app-builder");
    case "claude":
      return path.join(home, ".claude", "skills", "b2c-app-builder");
    case "agents":
      return path.join(home, ".agents", "skills", "b2c-app-builder");
    case "cursor":
      return path.join(home, ".cursor", "skills", "b2c-app-builder");
    default: {
      const exhaustive: never = id;
      throw new Error(`Unhandled B2C App Builder client runtime ${String(exhaustive)}`);
    }
  }
}

export function defaultRuntimeInstallRoots(home = homedir()): readonly RuntimeInstallRoot[] {
  return B2C_APP_BUILDER_CLIENT_RUNTIME_IDS.map((id) => ({ id, root: runtimePath(home, id) }));
}

export function comparePin(sourceVersion: string, installedVersion: string): Exclude<RuntimePinRelation, "missing"> {
  const source = parseSemver(sourceVersion);
  const installed = parseSemver(installedVersion);
  if (!source || !installed) return "invalid";
  const order: Array<keyof typeof source> = ["major", "minor", "patch"];
  for (const part of order) {
    if (installed[part] < source[part]) return "behind";
    if (installed[part] > source[part]) return "ahead";
  }
  return "equal";
}

export function readRuntimeVersion(root: string): string | undefined {
  const manifestPath = path.join(root, "skill-version.json");
  if (!existsSync(manifestPath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function inspectRuntimePins(sourceVersion: string, roots: readonly RuntimeInstallRoot[]): RuntimePinInspection[] {
  return roots.map((entry) => {
    if (!existsSync(entry.root)) {
      return { id: entry.id, root: entry.root, exists: false, relation: "missing" };
    }
    const resolved = resolveExisting(entry.root);
    const version = readRuntimeVersion(resolved);
    if (!version) {
      return { id: entry.id, root: entry.root, exists: true, relation: "invalid" };
    }
    return {
      id: entry.id,
      root: entry.root,
      exists: true,
      version,
      relation: comparePin(sourceVersion, version),
    };
  });
}

function resolveExisting(root: string): string {
  try {
    if (lstatSync(root).isSymbolicLink()) return realpathSync(root);
  } catch {
    return root;
  }
  return root;
}

function parseSemver(value: string): { major: number; minor: number; patch: number } | undefined {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}
