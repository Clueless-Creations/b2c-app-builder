import { classifyLocalOffline } from "../capabilities/reducers";

export interface LocalCacheNote {
  id: string;
  owner: string;
  body: string;
  writeState: "complete" | "incomplete";
}

const notes = new Map<string, LocalCacheNote>();

export function listLocalCacheNotes(owner: string | null): readonly LocalCacheNote[] {
  if (!owner) return [];
  return [...notes.values()].filter((note) => note.owner === owner);
}

export function writeLocalCacheNote(input: { id: string; owner: string; body: string; interrupt?: boolean }): {
  action: "accept" | "refuse";
  reason: string;
} {
  const classified = classifyLocalOffline({
    event: input.interrupt ? "interrupted-write" : "reconnect",
    claimed: input.interrupt ? "write-complete" : "local-cache-preserved",
  });
  notes.set(input.id, {
    id: input.id,
    owner: input.owner,
    body: input.body,
    writeState: input.interrupt ? "incomplete" : "complete",
  });
  return { action: classified.action, reason: classified.reason };
}
