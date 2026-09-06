import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The workspace registry: the one place a machine knows its businesses (layering plan R6).
 *
 * `~/.b2c-app-builder/workspaces.json` holds ADDRESSES ONLY — an id and the absolute path it resolves
 * to. Every business truth (state, control, run, budgets) stays in the workspace's own
 * reducer-owned documents; a registry that carried anything more would be a second source of
 * truth waiting to disagree with the first.
 *
 * The registry is also the MCP allowlist: a tool call names a registered id (or the exact
 * registered path), and anything else is refused — path traversal is impossible by construction
 * because resolution only ever returns paths this file already contains, the same rule the
 * launch importer established for B2C_APP_BUILDER_IMPORT_ROOT.
 *
 * B2C_APP_BUILDER_HOME overrides the directory for fixtures; it is not a consumer surface.
 */

export interface RegisteredWorkspace {
  readonly id: string;
  readonly path: string;
  readonly registeredAt: string;
}

export interface WorkspaceRegistry {
  readonly schemaVersion: "1.0.0";
  readonly workspaces: readonly RegisteredWorkspace[];
}

const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]*$/;

export function b2cAppBuilderHome(): string {
  const override = process.env.B2C_APP_BUILDER_HOME?.trim();
  return override ? path.resolve(override) : path.join(os.homedir(), ".b2c-app-builder");
}

export function registryPath(): string {
  return path.join(b2cAppBuilderHome(), "workspaces.json");
}

export function loadRegistry(): WorkspaceRegistry {
  const file = registryPath();
  if (!existsSync(file)) return { schemaVersion: "1.0.0", workspaces: [] };
  const parsed = JSON.parse(readFileSync(file, "utf8")) as WorkspaceRegistry;
  if (parsed.schemaVersion !== "1.0.0" || !Array.isArray(parsed.workspaces)) {
    throw new Error(`registry.invalid: ${file} is not a valid workspace registry`);
  }
  return parsed;
}

function writeRegistry(registry: WorkspaceRegistry): void {
  const file = registryPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

export function registerWorkspace(id: string, workspacePath: string, now = new Date().toISOString()): WorkspaceRegistry {
  if (!WORKSPACE_ID.test(id)) throw new Error(`registry.invalid_id: "${id}" — ids are lowercase letters, digits, and hyphens`);
  const absolute = path.resolve(workspacePath);
  if (!existsSync(absolute)) throw new Error(`registry.path_missing: ${absolute} does not exist`);
  const registry = loadRegistry();
  const existing = registry.workspaces.find((entry) => entry.id === id);
  if (existing && path.resolve(existing.path) !== absolute) {
    throw new Error(`registry.id_taken: "${id}" already points at ${existing.path} — remove it first if the move is intentional`);
  }
  const next: WorkspaceRegistry = {
    schemaVersion: "1.0.0",
    workspaces: existing ? registry.workspaces : [...registry.workspaces, { id, path: absolute, registeredAt: now }],
  };
  writeRegistry(next);
  return next;
}

export function removeWorkspace(id: string): WorkspaceRegistry {
  const registry = loadRegistry();
  if (!registry.workspaces.some((entry) => entry.id === id)) throw new Error(`registry.unknown_id: "${id}" is not registered`);
  const next: WorkspaceRegistry = { schemaVersion: "1.0.0", workspaces: registry.workspaces.filter((entry) => entry.id !== id) };
  writeRegistry(next);
  return next;
}

export interface ResolutionRefusal {
  readonly refused: true;
  readonly message: string;
}

/**
 * Resolve a caller-supplied workspace reference to a registered path. Accepts a registered id or
 * the exact absolute path of a registered workspace; everything else is refused with the fix in
 * the message. Never joins, normalizes toward, or probes unregistered paths.
 */
export function resolveRegisteredWorkspace(reference: string): { path: string } | ResolutionRefusal {
  const registry = loadRegistry();
  const byId = registry.workspaces.find((entry) => entry.id === reference);
  if (byId) return { path: path.resolve(byId.path) };
  const asPath = path.resolve(reference);
  const byPath = registry.workspaces.find((entry) => path.resolve(entry.path) === asPath);
  if (byPath) return { path: asPath };
  return {
    refused: true,
    message:
      `"${reference}" is not a registered workspace. Register it first: b2c workspaces register <id> <path> — ` +
      (registry.workspaces.length > 0 ? `registered ids: ${registry.workspaces.map((entry) => entry.id).join(", ")}` : "nothing is registered yet"),
  };
}

export interface ContainingWorkspace {
  readonly id: string;
  readonly path: string;
}

/**
 * Containment only, for the pre-registration inspector's orientation (`kernel/session/inspect.ts`,
 * KTD4) — never for MCP resolution. MCP keeps resolving a workspace exclusively through
 * `resolveRegisteredWorkspace`'s exact id/path match; this helper answers a narrower, purely
 * informational question — "is this candidate folder somewhere inside an already-registered
 * workspace?" — so the inspector can say `inside-registered` instead of misreporting a
 * registered app's own subdirectory as unregistered. It never grants access to anything and never
 * writes to the registry; it only compares paths already on file against the caller's candidate.
 *
 * Comparison is by real path (`realpathSync`), not lexical prefix, so a workspace or candidate
 * reached through a symlinked ancestor is still recognized correctly. A registered entry whose
 * path no longer resolves (stale) is skipped — it cannot contain anything real to compare against.
 * Equality (candidate === a registered path) is deliberately excluded here; that exact-match case
 * is `resolveRegisteredWorkspace`'s job, not this one's.
 */
export function findContainingWorkspace(candidatePath: string): ContainingWorkspace | undefined {
  let realCandidate: string;
  try {
    realCandidate = realpathSync(path.resolve(candidatePath));
  } catch {
    return undefined;
  }
  const registry = loadRegistry();
  for (const entry of registry.workspaces) {
    let realEntry: string;
    try {
      realEntry = realpathSync(path.resolve(entry.path));
    } catch {
      continue;
    }
    const relative = path.relative(realEntry, realCandidate);
    const isStrictDescendant = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
    if (isStrictDescendant) return { id: entry.id, path: realEntry };
  }
  return undefined;
}
