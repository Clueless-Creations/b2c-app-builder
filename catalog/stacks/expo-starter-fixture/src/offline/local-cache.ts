import { classifyLocalOffline } from "../capabilities/reducers";
import { boundLocalCacheSeam } from "../persistence/seam";

export interface LocalCacheNote {
  id: string;
  owner: string;
  body: string;
  writeState: "complete" | "incomplete";
}

const seam = boundLocalCacheSeam();
const notes = new Map<string, LocalCacheNote>();
let persisted: readonly LocalCacheNote[] = [];

function isNote(value: unknown): value is LocalCacheNote {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.owner === "string" &&
    typeof record.body === "string" &&
    (record.writeState === "complete" || record.writeState === "incomplete")
  );
}

function persistNotes(): void {
  persisted = [...notes.values()];
  void seam.persist(persisted);
}

export function listLocalCacheNotes(owner: string | null): readonly LocalCacheNote[] {
  if (!owner) return [];
  return [...notes.values()].filter((note) => note.owner === owner);
}

export function writeLocalCacheNote(input: { id: string; owner: string; body: string; interrupt?: boolean; duplicate?: boolean; migrationFailure?: boolean }): {
  action: "accept" | "refuse";
  reason: string;
} {
  const event = input.interrupt ? "interrupted-write" : input.duplicate ? "duplicate-request" : input.migrationFailure ? "migration-failure" : "reconnect";
  const classified = classifyLocalOffline({
    event,
    claimed: input.interrupt || input.migrationFailure ? "write-complete" : "local-cache-preserved",
  });
  if (input.migrationFailure) {
    return { action: classified.action, reason: classified.reason };
  }
  if (input.duplicate && notes.has(input.id)) {
    persistNotes();
    return { action: classified.action, reason: classified.reason };
  }
  notes.set(input.id, {
    id: input.id,
    owner: input.owner,
    body: input.body,
    writeState: input.interrupt ? "incomplete" : "complete",
  });
  persistNotes();
  return { action: classified.action, reason: classified.reason };
}

/**
 * In-process reopen from the last payload handed to the bound seam.
 * Not SQLite, not SecureStore, not a backend, and not a live process restart.
 */
export function reopenLocalCache(): readonly LocalCacheNote[] {
  notes.clear();
  for (const item of persisted) {
    if (isNote(item)) notes.set(item.id, { ...item });
  }
  return [...notes.values()];
}
