/**
 * Persist EAS remote job identity and reconcile before retry.
 *
 * Persistence owner: this ledger (workspace `.b2c/expo-eas-jobs.json` by default).
 * It is subordinate provider execution data, not a kernel operation journal, not
 * business acceptance, and not a generic provider scheduler. Coordinate #104: the
 * same persist-before-effect, full request identity, and resume-observation rules
 * apply there; do not extract a shared journal until both proving cases match.
 *
 * Upstream EAS is not treated as idempotent. Bind the full request identity before
 * lookup. Persist prepared/dispatched intent before spawn. A timeout after the
 * process was accepted is uncertain until build:view / workflow:status / submit:view
 * reads the stored id. Unknown remote acceptance is not "no effect". Paid and public
 * effects are never replayed.
 */

import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ExpoEasCommandId } from "../../../catalog/stacks/expo-eas-commands.js";

export type EasRemoteJobState = "queued" | "running" | "finished" | "errored" | "canceled" | "expired" | "uncertain";

export type EasArtifactKind = "simulator" | "device" | "store" | "unknown";

export interface EasJobBinding {
  readonly sourceFingerprint: string;
  readonly profile: string;
  readonly platform: "ios" | "android";
  readonly environment: string;
  readonly artifactKind: EasArtifactKind;
  readonly runtimeVersion?: string;
  readonly commandId: ExpoEasCommandId;
  readonly easProjectId?: string;
  readonly workflowRelativePath?: string;
  readonly autoSubmit?: boolean;
}

export interface EasJobEntry {
  readonly idempotencyKey: string;
  readonly remoteId?: string;
  readonly state: EasRemoteJobState;
  readonly binding: EasJobBinding;
  readonly requestIdentity: string;
  readonly calls: number;
  readonly replays: number;
  readonly artifactUrl?: string;
  readonly history: readonly { readonly at: string; readonly event: string; readonly state: EasRemoteJobState; readonly remoteId?: string }[];
}

export type EasJobReconciliation =
  | { readonly action: "proceed"; readonly reason: "no_prior_request" }
  | { readonly action: "reuse"; readonly entry: EasJobEntry }
  | { readonly action: "reconciled"; readonly entry: EasJobEntry }
  | { readonly action: "uncertain"; readonly entry: EasJobEntry; readonly reason: "remote_id_unread" | "dispatched_unconfirmed" }
  | { readonly action: "conflict"; readonly entry: EasJobEntry; readonly reason: "request_identity_mismatch" };

export interface EasJobRead {
  readonly state: EasRemoteJobState;
  readonly artifactUrl?: string;
}

export interface EasJobTransport {
  readJob(remoteId: string): EasJobRead | undefined;
}

interface LedgerFile {
  readonly schemaVersion: "b2c.eas-job-ledger/v1";
  readonly entries: readonly EasJobEntry[];
}

function assertNoSymlink(file: string): void {
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error("expo.eas_ledger_symlink_refused");
}

function normalizedBinding(binding: EasJobBinding): Record<string, string | boolean> {
  return {
    sourceFingerprint: binding.sourceFingerprint,
    profile: binding.profile,
    platform: binding.platform,
    environment: binding.environment,
    artifactKind: binding.artifactKind,
    runtimeVersion: binding.runtimeVersion ?? "",
    commandId: binding.commandId,
    easProjectId: binding.easProjectId ?? "",
    workflowRelativePath: binding.workflowRelativePath ?? "",
    autoSubmit: binding.autoSubmit === true,
  };
}

/** Canonical identity of one EAS effect. Compared in full on every reuse path. */
export function canonicalEasRequestIdentity(binding: EasJobBinding): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizedBinding(binding)))
    .digest("hex");
}

export function easBindingsMatch(left: EasJobBinding, right: EasJobBinding): boolean {
  return canonicalEasRequestIdentity(left) === canonicalEasRequestIdentity(right);
}

export function fingerprintBinding(binding: Omit<EasJobBinding, "sourceFingerprint"> & { sourceBytes: string }): string {
  return canonicalEasRequestIdentity({
    ...binding,
    sourceFingerprint: createHash("sha256").update(binding.sourceBytes).digest("hex"),
  });
}

function withIdentity(entry: Omit<EasJobEntry, "requestIdentity"> & { requestIdentity?: string }): EasJobEntry {
  return { ...entry, requestIdentity: canonicalEasRequestIdentity(entry.binding) };
}

export function mapEasBuildStatus(status: string | undefined): EasRemoteJobState | "invalid" {
  switch (status) {
    case "new":
    case "NEW":
    case "in-queue":
    case "IN_QUEUE":
      return "queued";
    case "in-progress":
    case "IN_PROGRESS":
    case "pending-cancel":
    case "PENDING_CANCEL":
      return "running";
    case "finished":
    case "FINISHED":
      return "finished";
    case "errored":
    case "ERRORED":
      return "errored";
    case "canceled":
    case "CANCELED":
      return "canceled";
    case "expired":
      return "expired";
    default:
      return "invalid";
  }
}

function isNonTerminal(state: EasRemoteJobState): boolean {
  return state === "queued" || state === "running";
}

export class EasJobLedger {
  readonly #entries = new Map<string, EasJobEntry>();
  readonly #inflight = new Set<string>();
  readonly #now: () => string;

  constructor(options: { now?: () => string } = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  static load(file: string, options: { now?: () => string } = {}): EasJobLedger {
    const ledger = new EasJobLedger(options);
    ledger.load(file);
    return ledger;
  }

  get(idempotencyKey: string): EasJobEntry | undefined {
    return this.#entries.get(idempotencyKey);
  }

  byRemoteId(remoteId: string): EasJobEntry | undefined {
    for (const entry of this.#entries.values()) if (entry.remoteId === remoteId) return entry;
    return undefined;
  }

  entries(): EasJobEntry[] {
    return [...this.#entries.values()];
  }

  inflight(idempotencyKey: string): boolean {
    return this.#inflight.has(idempotencyKey);
  }

  load(file: string): void {
    assertNoSymlink(file);
    this.#entries.clear();
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LedgerFile>;
    if (parsed.schemaVersion !== "b2c.eas-job-ledger/v1" || !Array.isArray(parsed.entries)) throw new Error("expo.eas_ledger_invalid");
    for (const entry of parsed.entries) {
      if (!entry || typeof entry.idempotencyKey !== "string" || !entry.binding) throw new Error("expo.eas_ledger_invalid");
      this.#entries.set(entry.idempotencyKey, withIdentity(entry));
    }
  }

  save(file: string): void {
    assertNoSymlink(file);
    mkdirSync(path.dirname(file), { recursive: true });
    const document: LedgerFile = { schemaVersion: "b2c.eas-job-ledger/v1", entries: this.entries() };
    const temporary = `${file}.${process.pid}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(document, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, file);
  }

  /**
   * Claim the logical request before a remote effect. Same-process overlapping
   * dispatch is refused via the in-memory lease; crash recovery uses the persisted entry.
   */
  bindIntent(idempotencyKey: string, binding: EasJobBinding): EasJobEntry {
    if (!idempotencyKey.trim()) throw new Error("expo.eas_idempotency_key_required");
    const previous = this.#entries.get(idempotencyKey);
    if (previous && !easBindingsMatch(previous.binding, binding)) {
      throw new Error("expo.eas_request_identity_conflict");
    }
    this.#inflight.add(idempotencyKey);
    if (previous) return previous;
    const at = this.#now();
    const entry = withIdentity({
      idempotencyKey,
      state: "uncertain",
      binding,
      calls: 1,
      replays: 0,
      history: [{ at, event: "bound", state: "uncertain" }],
    });
    this.#entries.set(idempotencyKey, entry);
    return entry;
  }

  release(idempotencyKey: string): void {
    this.#inflight.delete(idempotencyKey);
  }

  record(idempotencyKey: string, binding: EasJobBinding, update: { remoteId?: string; state: EasRemoteJobState; artifactUrl?: string }): EasJobEntry {
    if (!idempotencyKey.trim()) throw new Error("expo.eas_idempotency_key_required");
    const previous = this.#entries.get(idempotencyKey);
    if (previous && !easBindingsMatch(previous.binding, binding)) {
      throw new Error("expo.eas_request_identity_conflict");
    }
    const at = this.#now();
    const entry = withIdentity({
      idempotencyKey,
      remoteId: update.remoteId ?? previous?.remoteId,
      state: update.state,
      binding: previous?.binding ?? binding,
      calls: (previous?.calls ?? 0) + 1,
      replays: previous?.replays ?? 0,
      ...(update.artifactUrl ? { artifactUrl: update.artifactUrl } : previous?.artifactUrl ? { artifactUrl: previous.artifactUrl } : {}),
      history: [...(previous?.history ?? []), { at, event: "recorded", state: update.state, remoteId: update.remoteId }],
    });
    this.#entries.set(idempotencyKey, entry);
    return entry;
  }

  observe(remoteId: string, job: EasJobRead): EasJobEntry | undefined {
    const entry = this.byRemoteId(remoteId);
    if (!entry) return undefined;
    const next = withIdentity({
      ...entry,
      state: job.state,
      ...(job.artifactUrl ? { artifactUrl: job.artifactUrl } : {}),
      history: [...entry.history, { at: this.#now(), event: "observed", state: job.state, remoteId }],
    });
    this.#entries.set(entry.idempotencyKey, next);
    return next;
  }

  reconcile(transport: EasJobTransport, idempotencyKey: string, binding: EasJobBinding): EasJobReconciliation {
    const inflight = this.#inflight.has(idempotencyKey);
    const entry = this.#entries.get(idempotencyKey);
    if (!entry) {
      if (inflight) throw new Error("expo.eas_lease_held");
      return { action: "proceed", reason: "no_prior_request" };
    }
    if (!easBindingsMatch(entry.binding, binding)) {
      return { action: "conflict", entry, reason: "request_identity_mismatch" };
    }
    if (inflight && !entry.remoteId) {
      return { action: "uncertain", entry, reason: "dispatched_unconfirmed" };
    }
    if (entry.state === "uncertain") {
      if (!entry.remoteId) return { action: "uncertain", entry, reason: "dispatched_unconfirmed" };
      return this.#readback(transport, idempotencyKey, entry);
    }
    if (isNonTerminal(entry.state) || entry.state === "finished") {
      return this.#refresh(transport, entry);
    }
    return { action: "reuse", entry };
  }

  #readback(transport: EasJobTransport, idempotencyKey: string, entry: EasJobEntry): EasJobReconciliation {
    if (!entry.remoteId) return { action: "uncertain", entry, reason: "dispatched_unconfirmed" };
    const job = transport.readJob(entry.remoteId);
    if (job) {
      const reconciled = withIdentity({
        ...entry,
        state: job.state,
        ...(job.artifactUrl ? { artifactUrl: job.artifactUrl } : {}),
        history: [...entry.history, { at: this.#now(), event: "reconciled", state: job.state, remoteId: entry.remoteId }],
      });
      this.#entries.set(idempotencyKey, reconciled);
      return { action: "reconciled", entry: reconciled };
    }
    const unread = withIdentity({
      ...entry,
      history: [...entry.history, { at: this.#now(), event: "remote-id-unread", state: entry.state, remoteId: entry.remoteId }],
    });
    this.#entries.set(idempotencyKey, unread);
    return { action: "uncertain", entry: unread, reason: "remote_id_unread" };
  }

  #refresh(transport: EasJobTransport, entry: EasJobEntry): EasJobReconciliation {
    if (!entry.remoteId) return { action: "uncertain", entry, reason: "dispatched_unconfirmed" };
    const job = transport.readJob(entry.remoteId);
    if (job) {
      const refreshed = this.observe(entry.remoteId, job);
      return { action: "reconciled", entry: refreshed ?? entry };
    }
    const missed = withIdentity({
      ...entry,
      history: [...entry.history, { at: this.#now(), event: "observe-missed", state: entry.state, remoteId: entry.remoteId }],
    });
    this.#entries.set(entry.idempotencyKey, missed);
    return { action: "reuse", entry: missed };
  }
}

export function easJobLedgerPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".b2c", "expo-eas-jobs.json");
}

export const EAS_JOB_CLAIM_SCHEMA = "b2c.eas-job-claim/v1" as const;

export interface EasJobClaim {
  readonly schemaVersion: typeof EAS_JOB_CLAIM_SCHEMA;
  readonly pid: number;
  readonly idempotencyKey: string;
  readonly at: string;
}

/** Per-request exclusive claim beside the ledger. Serializes bind+persist+spawn across processes. */
export function easJobClaimPath(ledgerFile: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16);
  return `${ledgerFile}.${digest}.claim`;
}

export function easClaimOwnerAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeEasJobClaim(claimPath: string, idempotencyKey: string, at: string): boolean {
  assertNoSymlink(claimPath);
  mkdirSync(path.dirname(claimPath), { recursive: true });
  let fd: number;
  try {
    fd = openSync(claimPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    const document: EasJobClaim = {
      schemaVersion: EAS_JOB_CLAIM_SCHEMA,
      pid: process.pid,
      idempotencyKey,
      at,
    };
    writeSync(fd, `${JSON.stringify(document)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return true;
}

function readEasJobClaim(claimPath: string): EasJobClaim | undefined {
  if (!existsSync(claimPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(claimPath, "utf8")) as Partial<EasJobClaim>;
    if (parsed.schemaVersion !== EAS_JOB_CLAIM_SCHEMA) return undefined;
    if (typeof parsed.pid !== "number" || typeof parsed.idempotencyKey !== "string" || typeof parsed.at !== "string") {
      return undefined;
    }
    return { schemaVersion: EAS_JOB_CLAIM_SCHEMA, pid: parsed.pid, idempotencyKey: parsed.idempotencyKey, at: parsed.at };
  } catch {
    return undefined;
  }
}

function stealEasJobClaim(claimPath: string, idempotencyKey: string, at: string): boolean {
  try {
    unlinkSync(claimPath);
  } catch {
    return false;
  }
  return writeEasJobClaim(claimPath, idempotencyKey, at);
}

/**
 * Exclusive create of the claim file. Nested same-process re-entry and a live foreign
 * pid are `held` (no wait — that would deadlock a nested fixture). A claim whose pid is
 * dead, or whose file is empty/truncated/wrong-schema, is stolen once. This is EAS
 * ledger durability, not a kernel scheduler.
 */
export function tryAcquireEasJobClaim(
  claimPath: string,
  idempotencyKey: string,
  now: () => string = () => new Date().toISOString(),
): { readonly ok: true } | { readonly ok: false; readonly reason: "held" } {
  if (writeEasJobClaim(claimPath, idempotencyKey, now())) return { ok: true };
  const existing = readEasJobClaim(claimPath);
  if (!existing) {
    if (stealEasJobClaim(claimPath, idempotencyKey, now())) return { ok: true };
    return { ok: false, reason: "held" };
  }
  if (existing.pid === process.pid) return { ok: false, reason: "held" };
  if (easClaimOwnerAlive(existing.pid)) return { ok: false, reason: "held" };
  if (stealEasJobClaim(claimPath, idempotencyKey, now())) return { ok: true };
  return { ok: false, reason: "held" };
}

export function releaseEasJobClaim(claimPath: string): void {
  const existing = readEasJobClaim(claimPath);
  if (!existing) return;
  if (existing.pid !== process.pid) return;
  try {
    unlinkSync(claimPath);
  } catch {
    // Claim already gone.
  }
}

export function isSuccessfulBuild(entry: EasJobEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.state !== "finished") return false;
  if (!entry.artifactUrl) return false;
  if (entry.artifactUrl === "expired") return false;
  return true;
}

export interface FakeEasJobScript {
  readonly jobs?: Readonly<Record<string, EasJobRead | undefined>>;
}

export function createFakeEasJobTransport(
  script: FakeEasJobScript = {},
): EasJobTransport & { readonly reads: readonly string[]; setJob(id: string, job: EasJobRead | undefined): void } {
  const jobs = new Map<string, EasJobRead | undefined>(Object.entries(script.jobs ?? {}));
  const reads: string[] = [];
  return {
    reads,
    setJob(id, job) {
      jobs.set(id, job);
    },
    readJob(remoteId) {
      reads.push(remoteId);
      const job = jobs.get(remoteId);
      return job ? { ...job } : undefined;
    },
  };
}
