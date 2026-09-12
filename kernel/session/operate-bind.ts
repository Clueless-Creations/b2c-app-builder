import { existsSync } from "node:fs";
import path from "node:path";
import { resolveRegisteredWorkspace } from "../../adapters/registry.js";
import { loadRunState } from "../engine/runstate.js";
import { acquireLock, isStale, readLock, releaseLock } from "../reducer/lock.js";
import type { OperateInput, OperateLeaseState } from "./operating-types.js";
import { validateExecutableCatalog, validateOperatingCatalog, loadWorkspaceCatalog, type CatalogRefusal } from "./catalog-contract.js";

export interface WorkspaceBind {
  input: OperateInput;
  refusal?: CatalogRefusal;
  release?: () => void;
}

/** Bind a registered workspace: derive lease and run-state path, and take the session lock on commit. */
export function bindRegisteredWorkspace(input: OperateInput, workspace: string | undefined): WorkspaceBind {
  if (!workspace) return { input };
  const resolved = resolveRegisteredWorkspace(workspace);
  if ("refused" in resolved) {
    return { input: { ...input, gates: { ...input.gates, workspaceRegistered: false }, world: { ...input.world, runStatePath: undefined } } };
  }
  const compatible = loadWorkspaceCatalog(resolved.path);
  const bound: OperateInput = {
    ...input,
    world: { ...input.world, workspaceId: workspace, catalog: compatible.catalog, runStatePath: undefined },
    gates: { ...input.gates, workspaceRegistered: true },
  };
  if (!compatible.ok) return { input: bound, refusal: compatible.refusal };
  const suppliedRefusal = input.world.catalog === undefined ? undefined : validateExecutableCatalog(input.world.catalog);
  const incompatible = suppliedRefusal ?? validateOperatingCatalog(bound.world);
  if (incompatible) return { input: suppliedRefusal ? input : bound, refusal: incompatible };
  const runStatePath = path.join(resolved.path, "run", "run-state.json");
  const lockPath = path.join(resolved.path, "control", "session.lock");
  const run = existsSync(runStatePath) ? loadRunState(runStatePath) : input.world.run;
  const nextWorld = { ...bound.world, run, runStatePath };
  if (input.transport.mode === "commit") {
    const acquired = acquireLock(lockPath, { ownerSessionId: input.transport.principalId, now: () => input.transport.clock, retries: 0 });
    if (!acquired.ok) {
      const lease: OperateLeaseState = acquired.reason === "held" ? "held" : "revoked";
      return { input: { ...input, world: nextWorld, gates: { ...input.gates, workspaceRegistered: true, lease } } };
    }
    return {
      input: { ...input, world: nextWorld, gates: { ...input.gates, workspaceRegistered: true, lease: "active" } },
      release: () => releaseLock(lockPath, input.transport.principalId),
    };
  }
  const lock = readLock(lockPath);
  let lease: OperateLeaseState = "absent";
  if (lock && !isStale(lock, input.transport.clock)) {
    lease = lock.ownerSessionId === input.transport.principalId ? "active" : "held";
  }
  return { input: { ...input, world: nextWorld, gates: { ...input.gates, workspaceRegistered: true, lease } } };
}

/** @deprecated Use bindRegisteredWorkspace; kept as a name for call-site greps. */
export function applyWorkspaceGate(input: OperateInput, workspace: string | undefined): OperateInput {
  return bindRegisteredWorkspace(input, workspace).input;
}
