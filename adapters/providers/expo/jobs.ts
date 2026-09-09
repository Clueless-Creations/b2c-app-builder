/**
 * Persist EAS remote job identity and reconcile before retry.
 *
 * Upstream EAS is not treated as idempotent. A timeout after the process was accepted is
 * uncertain until build:view / workflow:status / submit:view reads the stored id. A remote
 * id that cannot be read stays mutation-uncertain. Paid and public effects are never replayed.
 */

import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
}

export interface EasJobEntry {
  readonly idempotencyKey: string;
  readonly remoteId?: string;
  readonly state: EasRemoteJobState;
  readonly binding: EasJobBinding;
  readonly calls: number;
  readonly replays: number;
  readonly artifactUrl?: string;
  readonly history: readonly { readonly at: string; readonly event: string; readonly state: EasRemoteJobState; readonly remoteId?: string }[];
}

export type EasJobReconciliation =
  | { readonly action: "proceed"; readonly reason: "no_prior_request" }
  | { readonly action: "reuse"; readonly entry: EasJobEntry }
  | { readonly action: "reconciled"; readonly entry: EasJobEntry }
  | { readonly action: "uncertain"; readonly entry: EasJobEntry; readonly reason: "remote_id_unread" };

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

export function fingerprintBinding(binding: Omit<EasJobBinding, "commandId"> & { commandId: ExpoEasCommandId; sourceBytes: string }): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        source: binding.sourceBytes,
        profile: binding.profile,
        platform: binding.platform,
        environment: binding.environment,
        artifactKind: binding.artifactKind,
        runtimeVersion: binding.runtimeVersion ?? "",
        commandId: binding.commandId,
        easProjectId: binding.easProjectId ?? "",
      }),
    )
    .digest("hex");
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

export class EasJobLedger {
  readonly #entries = new Map<string, EasJobEntry>();
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

  load(file: string): void {
    assertNoSymlink(file);
    this.#entries.clear();
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LedgerFile>;
    if (parsed.schemaVersion !== "b2c.eas-job-ledger/v1" || !Array.isArray(parsed.entries)) throw new Error("expo.eas_ledger_invalid");
    for (const entry of parsed.entries) {
      if (!entry || typeof entry.idempotencyKey !== "string") throw new Error("expo.eas_ledger_invalid");
      this.#entries.set(entry.idempotencyKey, entry);
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

  record(idempotencyKey: string, binding: EasJobBinding, update: { remoteId?: string; state: EasRemoteJobState; artifactUrl?: string }): EasJobEntry {
    if (!idempotencyKey.trim()) throw new Error("expo.eas_idempotency_key_required");
    const previous = this.#entries.get(idempotencyKey);
    if (previous && previous.binding.sourceFingerprint !== binding.sourceFingerprint) {
      throw new Error("expo.eas_binding_mismatch");
    }
    const at = this.#now();
    const entry: EasJobEntry = {
      idempotencyKey,
      remoteId: update.remoteId ?? previous?.remoteId,
      state: update.state,
      binding: previous?.binding ?? binding,
      calls: (previous?.calls ?? 0) + 1,
      replays: previous?.replays ?? 0,
      ...(update.artifactUrl ? { artifactUrl: update.artifactUrl } : previous?.artifactUrl ? { artifactUrl: previous.artifactUrl } : {}),
      history: [...(previous?.history ?? []), { at, event: "recorded", state: update.state, remoteId: update.remoteId }],
    };
    this.#entries.set(idempotencyKey, entry);
    return entry;
  }

  observe(remoteId: string, job: EasJobRead): EasJobEntry | undefined {
    const entry = this.byRemoteId(remoteId);
    if (!entry) return undefined;
    const next: EasJobEntry = {
      ...entry,
      state: job.state,
      ...(job.artifactUrl ? { artifactUrl: job.artifactUrl } : {}),
      history: [...entry.history, { at: this.#now(), event: "observed", state: job.state, remoteId }],
    };
    this.#entries.set(entry.idempotencyKey, next);
    return next;
  }

  reconcile(transport: EasJobTransport, idempotencyKey: string): EasJobReconciliation {
    const entry = this.#entries.get(idempotencyKey);
    if (!entry) return { action: "proceed", reason: "no_prior_request" };
    if (entry.state !== "uncertain") return { action: "reuse", entry };
    if (!entry.remoteId) throw new Error("expo.eas_reconcile_unresolved");
    const job = transport.readJob(entry.remoteId);
    if (job) {
      const reconciled: EasJobEntry = {
        ...entry,
        state: job.state,
        ...(job.artifactUrl ? { artifactUrl: job.artifactUrl } : {}),
        history: [...entry.history, { at: this.#now(), event: "reconciled", state: job.state, remoteId: entry.remoteId }],
      };
      this.#entries.set(idempotencyKey, reconciled);
      return { action: "reconciled", entry: reconciled };
    }
    const unread: EasJobEntry = {
      ...entry,
      history: [...entry.history, { at: this.#now(), event: "remote-id-unread", state: entry.state, remoteId: entry.remoteId }],
    };
    this.#entries.set(idempotencyKey, unread);
    return { action: "uncertain", entry: unread, reason: "remote_id_unread" };
  }
}

export function easJobLedgerPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".b2c", "expo-eas-jobs.json");
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
