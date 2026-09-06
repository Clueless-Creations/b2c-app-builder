import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { FounderDecisionReceipt } from "../schema/types.js";

/** Genesis previous-hash: the first audit entry chains to this fixed value, never to nothing. */
export const AUDIT_GENESIS_HASH = "0".repeat(64);

export interface AuditEntryInput {
  readonly sessionId: string;
  readonly targetDoc: string;
  readonly patchId: string;
  readonly action: string;
  readonly summary: string;
  readonly stateHash: string;
  readonly issueCodes?: readonly string[];
  /** Optional signed founder authority. */
  readonly receipt?: FounderDecisionReceipt;
}

export interface AuditEntry {
  readonly seq: number;
  readonly timestamp: string;
  readonly previousHash: string;
  readonly sessionId: string;
  readonly targetDoc: string;
  readonly patchId: string;
  readonly action: string;
  readonly summary: string;
  readonly stateHash: string;
  readonly issueCodes: readonly string[];
  /** Optional signed founder authority. It is covered by this entry's hash. */
  readonly receipt?: FounderDecisionReceipt;
  readonly entryHash: string;
}

type EntryBody = Omit<AuditEntry, "entryHash">;

/** Fixed key order so the same content always serializes identically, regardless of how the caller built the object or how JSON.parse ordered it on read-back. */
function canonicalPayload(entry: EntryBody): string {
  return JSON.stringify({
    seq: entry.seq,
    timestamp: entry.timestamp,
    previousHash: entry.previousHash,
    sessionId: entry.sessionId,
    targetDoc: entry.targetDoc,
    patchId: entry.patchId,
    action: entry.action,
    summary: entry.summary,
    stateHash: entry.stateHash,
    issueCodes: entry.issueCodes,
    receipt: entry.receipt,
  });
}

function hashEntry(entry: EntryBody): string {
  return createHash("sha256").update(canonicalPayload(entry)).digest("hex");
}

/** Append-only JSONL: one entry per line. */
export function readAuditLog(auditPath: string): AuditEntry[] {
  if (!existsSync(auditPath)) return [];
  const raw = readFileSync(auditPath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as AuditEntry);
}

/**
 * Appends one hash-chained entry: each entry stores a hash of {previous entry hash, entry
 * content}. Only successful reducer commits are appended here — a rejected patch changed
 * nothing, so there is nothing to attest to.
 */
export function appendAuditEntry(auditPath: string, input: AuditEntryInput, timestamp: string = new Date().toISOString()): AuditEntry {
  const existing = readAuditLog(auditPath);
  const previous = existing.at(-1);
  const seq = previous ? previous.seq + 1 : 1;
  const previousHash = previous ? previous.entryHash : AUDIT_GENESIS_HASH;
  const body: EntryBody = {
    seq,
    timestamp,
    previousHash,
    sessionId: input.sessionId,
    targetDoc: input.targetDoc,
    patchId: input.patchId,
    action: input.action,
    summary: input.summary,
    stateHash: input.stateHash,
    issueCodes: input.issueCodes ?? [],
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
  };
  const entry: AuditEntry = { ...body, entryHash: hashEntry(body) };
  appendFileSync(auditPath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export interface ChainVerification {
  readonly valid: boolean;
  readonly entriesChecked: number;
  readonly brokenAtSeq?: number;
  readonly reason?: string;
}

/**
 * Recomputes the chain from genesis and compares recomputed hashes/links against what is
 * stored — never a byte-diff of the log file (KTD7). Mutating any historical entry (its content
 * or its previousHash link) is caught here, regardless of where in the log it happened.
 */
export function verifyAuditChain(auditPath: string): ChainVerification {
  const entries = readAuditLog(auditPath);
  let previousHash = AUDIT_GENESIS_HASH;
  for (const [index, entry] of entries.entries()) {
    if (entry.previousHash !== previousHash) {
      return {
        valid: false,
        entriesChecked: index,
        brokenAtSeq: entry.seq,
        reason: `entry ${entry.seq} previousHash does not match the prior entry's hash (chain link broken)`,
      };
    }
    const recomputed = hashEntry({
      seq: entry.seq,
      timestamp: entry.timestamp,
      previousHash: entry.previousHash,
      sessionId: entry.sessionId,
      targetDoc: entry.targetDoc,
      patchId: entry.patchId,
      action: entry.action,
      summary: entry.summary,
      stateHash: entry.stateHash,
      issueCodes: entry.issueCodes,
      ...(entry.receipt === undefined ? {} : { receipt: entry.receipt }),
    });
    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        entriesChecked: index,
        brokenAtSeq: entry.seq,
        reason: `entry ${entry.seq} content hash does not match its recorded entryHash (the entry was mutated)`,
      };
    }
    previousHash = entry.entryHash;
  }
  return { valid: true, entriesChecked: entries.length };
}
