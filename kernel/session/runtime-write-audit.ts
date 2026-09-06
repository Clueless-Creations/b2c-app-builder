import { regularInputPath, workspaceChangeEntry, type WorkspaceChangeSnapshot } from "./input-inventory.js";

const paths = ["run/run-state.json", "control/session.lock"] as const;
type RuntimePath = (typeof paths)[number];

/** Narrow process-local authority for the session's own heartbeat writes. */
export function trackRuntimeWrites(workspace: string) {
  const expected: Record<string, WorkspaceChangeSnapshot["entries"][string]> = Object.create(null);
  let lost = false;
  const read = (relative: RuntimePath) => {
    const entry = workspaceChangeEntry(regularInputPath(workspace, relative));
    if (entry.kind !== "file") throw new Error("runtime_write_audit.non_regular_file");
    return entry;
  };
  for (const relative of paths) expected[relative] = read(relative);
  const assertIntact = () => {
    if (lost) throw new Error("runtime_write_audit.integrity_lost");
    try {
      for (const relative of paths) {
        if (read(relative).signature !== expected[relative]!.signature) throw new Error("runtime_write_audit.untrusted_control_change");
      }
    } catch (error) {
      lost = true;
      throw error;
    }
  };
  return {
    write(relative: RuntimePath, operation: () => void): void {
      assertIntact();
      try {
        operation();
        expected[relative] = read(relative);
      } catch (error) {
        lost = true;
        throw error;
      }
    },
    snapshot(): WorkspaceChangeSnapshot {
      assertIntact();
      return { entries: Object.freeze(Object.fromEntries(Object.entries(expected).map(([key, entry]) => [key, Object.freeze({ ...entry })]))) };
    },
    assertIntact,
  };
}
