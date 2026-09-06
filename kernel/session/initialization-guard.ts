import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import path from "node:path";
const access = new AsyncLocalStorage<string>();
export const INITIALIZATION_JOURNAL = ".b2c-launch/initialization.json";
export function assertNoPendingInitialization(workspace: string): void {
  if (access.getStore() !== path.resolve(workspace) && existsSync(path.join(workspace, INITIALIZATION_JOURNAL)))
    throw new Error("business.initialization_incomplete");
}
/** Synchronous initialization owner scope; never exposed by public DTOs or propagated to workers. */
export function withInitializationReads<T>(workspace: string, action: () => T): T {
  return access.run(path.resolve(workspace), action);
}

export function isInitializationOwner(workspace: string): boolean {
  return access.getStore() === path.resolve(workspace);
}
