import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Shared mutable-state helpers for validator fixtures. */
export type MutableRecord = Record<string, unknown>;

export function expectRecord(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as MutableRecord;
}

export function readState(root: string): MutableRecord {
  return expectRecord(JSON.parse(readFileSync(path.join(root, "state/business-state.json"), "utf8")), "state/business-state.json");
}

export function writeState(root: string, state: MutableRecord): void {
  writeFileSync(path.join(root, "state/business-state.json"), JSON.stringify(state, null, 2), "utf8");
}

export function getLane(state: MutableRecord, name: string): MutableRecord {
  const lanes = expectRecord(state.lanes, "state/business-state.json lanes");
  return expectRecord(lanes[name], `state/business-state.json lanes.${name}`);
}

export function getTools(state: MutableRecord): MutableRecord {
  return expectRecord(state.providers, "state/business-state.json providers");
}
