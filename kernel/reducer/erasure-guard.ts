import { existsSync } from "node:fs";
import path from "node:path";

export function assertNoPendingErasure(workspace: string): void {
  if (existsSync(path.join(workspace, "control/erasure-intent.json")))
    throw new Error("erasure.pending_transition: resume the authorized erasure before using this workspace");
}

export function assertReadableWorkspaceFile(file: string): void {
  let directory = path.dirname(path.resolve(file));
  while (true) {
    assertNoPendingErasure(directory);
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}
