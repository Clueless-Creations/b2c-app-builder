import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LayersArtifact, LayersCallResult, LayersJobRead, LayersQuote, LayersTransport } from "./transport.js";

/**
 * Job ledger for charged Layers calls.
 *
 * Every charged call is recorded under the host's idempotency key before its result is trusted.
 * The ledger owns the lifecycle accepted -> running -> completed -> reviewed -> published and the
 * two exceptional states failed and uncertain. Review is an independent acceptance step. Publication
 * is out of scope for the routes: `markPublished` needs an explicit publication receipt and no route
 * calls it. An uncertain response is reconciled by reading the job back before any replay, because
 * the provider's idempotency handling is unverified and a blind replay could charge twice.
 */
export type LayersLedgerState = "accepted" | "running" | "completed" | "failed" | "uncertain" | "reviewed" | "published";

export interface LayersJobRequest {
  readonly operation: string;
  readonly tool: string;
  readonly args: unknown;
}
export interface LayersReviewRecord {
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly verdict: "accepted";
}
export interface LayersPublicationReceipt {
  readonly channel: string;
  readonly receiptId: string;
  readonly publishedAt: string;
  readonly authorizedBy: string;
}
export interface LayersJobEvent {
  readonly at: string;
  readonly event: "recorded" | "observed" | "reconciled" | "replay-allowed" | "reviewed" | "published";
  readonly state: LayersLedgerState;
  readonly jobRef?: string;
}
export interface LayersJobEntry {
  readonly idempotencyKey: string;
  readonly request: LayersJobRequest;
  readonly quote: LayersQuote;
  readonly jobRef?: string;
  readonly state: LayersLedgerState;
  readonly artifact?: LayersArtifact;
  readonly creditsCharged?: number;
  /** Transport calls made under this key, including the allowed replay. */
  readonly calls: number;
  /** Replays granted after a readback found no job. At most one. */
  readonly replays: number;
  readonly review?: LayersReviewRecord;
  readonly publication?: LayersPublicationReceipt;
  readonly history: readonly LayersJobEvent[];
}

export type LayersReconciliation =
  | { readonly action: "proceed"; readonly reason: "no_prior_request" }
  | { readonly action: "reuse"; readonly entry: LayersJobEntry }
  | { readonly action: "reconciled"; readonly entry: LayersJobEntry }
  | { readonly action: "replay"; readonly entry: LayersJobEntry; readonly idempotencyKey: string };

interface LedgerFile {
  readonly schemaVersion: "b2c.layers-job-ledger/v1";
  readonly entries: readonly LayersJobEntry[];
}

const SHA256 = /^[a-f0-9]{64}$/u;
const isArtifact = (value: unknown): value is LayersArtifact =>
  !!value &&
  typeof value === "object" &&
  typeof (value as LayersArtifact).artifactId === "string" &&
  typeof (value as LayersArtifact).sha256 === "string" &&
  typeof (value as LayersArtifact).mimeType === "string";

/** A completed artifact: the job finished and its artifact carries a content hash. Pending and running jobs are not artifacts. */
export function isCompletedArtifact(entry: Pick<LayersJobEntry, "state" | "artifact"> | undefined): boolean {
  if (!entry) return false;
  if (entry.state !== "completed" && entry.state !== "reviewed" && entry.state !== "published") return false;
  return isArtifact(entry.artifact) && SHA256.test(entry.artifact.sha256);
}

export function isReviewed(entry: Pick<LayersJobEntry, "state" | "review"> | undefined): boolean {
  return !!entry && (entry.state === "reviewed" || entry.state === "published") && entry.review?.verdict === "accepted";
}

function assertNoSymlink(file: string): void {
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error("layers.ledger_symlink_refused");
}

export class LayersJobLedger {
  readonly #entries = new Map<string, LayersJobEntry>();
  readonly #now: () => string;

  constructor(options: { now?: () => string } = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  static load(file: string, options: { now?: () => string } = {}): LayersJobLedger {
    const ledger = new LayersJobLedger(options);
    ledger.load(file);
    return ledger;
  }

  get(idempotencyKey: string): LayersJobEntry | undefined {
    return this.#entries.get(idempotencyKey);
  }

  byJobRef(jobRef: string): LayersJobEntry | undefined {
    for (const entry of this.#entries.values()) if (entry.jobRef === jobRef) return entry;
    return undefined;
  }

  entries(): LayersJobEntry[] {
    return [...this.#entries.values()];
  }

  /** Replace the in-memory entries with the file's contents. A missing file is an empty ledger. */
  load(file: string): void {
    assertNoSymlink(file);
    this.#entries.clear();
    if (!existsSync(file)) return;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<LedgerFile>;
    if (parsed.schemaVersion !== "b2c.layers-job-ledger/v1" || !Array.isArray(parsed.entries)) throw new Error("layers.ledger_invalid");
    for (const entry of parsed.entries) {
      if (!entry || typeof entry.idempotencyKey !== "string" || typeof entry.state !== "string") throw new Error("layers.ledger_invalid");
      this.#entries.set(entry.idempotencyKey, entry);
    }
  }

  /** Write atomically: temp file, fsync, rename. Never follows a symlink at the destination. */
  save(file: string): void {
    assertNoSymlink(file);
    mkdirSync(path.dirname(file), { recursive: true });
    const document: LedgerFile = { schemaVersion: "b2c.layers-job-ledger/v1", entries: this.entries() };
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

  /** Record a transport response under the host's idempotency key. A repeated key updates the same entry. */
  record(idempotencyKey: string, request: LayersJobRequest, quote: LayersQuote, response: LayersCallResult): LayersJobEntry {
    if (!idempotencyKey.trim()) throw new Error("layers.idempotency_key_required");
    const previous = this.#entries.get(idempotencyKey);
    if (previous && (previous.state === "reviewed" || previous.state === "published")) throw new Error("layers.record_after_review_refused");
    const at = this.#now();
    const entry: LayersJobEntry = {
      idempotencyKey,
      request: previous?.request ?? request,
      quote,
      jobRef: response.jobRef,
      state: response.state,
      ...(response.artifact ? { artifact: response.artifact } : {}),
      ...(response.creditsCharged !== undefined ? { creditsCharged: response.creditsCharged } : {}),
      calls: (previous?.calls ?? 0) + 1,
      replays: previous?.replays ?? 0,
      history: [...(previous?.history ?? []), { at, event: "recorded", state: response.state, jobRef: response.jobRef }],
    };
    this.#entries.set(idempotencyKey, entry);
    return entry;
  }

  /**
   * Apply an independent readback to the entry that owns the job. Reviewed and published entries
   * keep their state; the observation is appended to history only.
   */
  observe(jobRef: string, job: LayersJobRead, at = this.#now()): LayersJobEntry | undefined {
    const entry = this.byJobRef(jobRef);
    if (!entry) return undefined;
    const settled = entry.state === "reviewed" || entry.state === "published";
    const next: LayersJobEntry = {
      ...entry,
      ...(settled ? {} : { state: job.state }),
      ...(job.artifact && !settled ? { artifact: job.artifact } : {}),
      ...(job.creditsCharged !== undefined ? { creditsCharged: job.creditsCharged } : {}),
      history: [...entry.history, { at, event: "observed", state: settled ? entry.state : job.state, jobRef }],
    };
    this.#entries.set(entry.idempotencyKey, next);
    return next;
  }

  /**
   * Decide whether a charged call may happen under this key.
   * - no entry: proceed with the first call.
   * - settled or in-progress entry: reuse it; no new call.
   * - uncertain entry: read the job back by reference first. A found job resolves the entry with no
   *   call. Only when the provider reports no job may one replay happen, under the same key. A second
   *   replay is refused.
   */
  async reconcile(transport: Pick<LayersTransport, "readJob">, idempotencyKey: string): Promise<LayersReconciliation> {
    const entry = this.#entries.get(idempotencyKey);
    if (!entry) return { action: "proceed", reason: "no_prior_request" };
    if (entry.state !== "uncertain") return { action: "reuse", entry };
    if (!entry.jobRef) throw new Error("layers.reconcile_unresolved");
    const job = await transport.readJob(entry.jobRef);
    const at = this.#now();
    if (job) {
      const reconciled: LayersJobEntry = {
        ...entry,
        state: job.state,
        ...(job.artifact ? { artifact: job.artifact } : {}),
        ...(job.creditsCharged !== undefined ? { creditsCharged: job.creditsCharged } : {}),
        history: [...entry.history, { at, event: "reconciled", state: job.state, jobRef: entry.jobRef }],
      };
      this.#entries.set(idempotencyKey, reconciled);
      return { action: "reconciled", entry: reconciled };
    }
    if (entry.replays >= 1) throw new Error("layers.replay_limit");
    const allowed: LayersJobEntry = {
      ...entry,
      replays: entry.replays + 1,
      history: [...entry.history, { at, event: "replay-allowed", state: entry.state, jobRef: entry.jobRef }],
    };
    this.#entries.set(idempotencyKey, allowed);
    return { action: "replay", entry: allowed, idempotencyKey };
  }

  /** Independent review of a completed artifact. Nothing else can be reviewed. */
  markReviewed(idempotencyKey: string, review: Omit<LayersReviewRecord, "verdict">): LayersJobEntry {
    const entry = this.#entries.get(idempotencyKey);
    if (!entry) throw new Error("layers.unknown_job");
    if (entry.state !== "completed" || !isCompletedArtifact(entry)) throw new Error("layers.review_requires_completed_artifact");
    if (!review.reviewer.trim() || !Number.isFinite(Date.parse(review.reviewedAt))) throw new Error("layers.review_invalid");
    const next: LayersJobEntry = {
      ...entry,
      state: "reviewed",
      review: { ...review, verdict: "accepted" },
      history: [...entry.history, { at: this.#now(), event: "reviewed", state: "reviewed", jobRef: entry.jobRef }],
    };
    this.#entries.set(idempotencyKey, next);
    return next;
  }

  /**
   * Publication is a separate, explicitly authorized action outside the draft loop. The route never
   * calls this. It requires a reviewed entry and a complete publication receipt from the channel owner.
   */
  markPublished(idempotencyKey: string, publicationReceipt: LayersPublicationReceipt): LayersJobEntry {
    const entry = this.#entries.get(idempotencyKey);
    if (!entry) throw new Error("layers.unknown_job");
    if (!isReviewed(entry) || entry.state !== "reviewed") throw new Error("layers.publish_requires_review");
    const receipt = publicationReceipt as Partial<LayersPublicationReceipt> | undefined;
    if (
      !receipt ||
      typeof receipt.channel !== "string" ||
      !receipt.channel.trim() ||
      typeof receipt.receiptId !== "string" ||
      !receipt.receiptId.trim() ||
      typeof receipt.authorizedBy !== "string" ||
      !receipt.authorizedBy.trim() ||
      typeof receipt.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(receipt.publishedAt))
    )
      throw new Error("layers.publication_receipt_required");
    const next: LayersJobEntry = {
      ...entry,
      state: "published",
      publication: publicationReceipt,
      history: [...entry.history, { at: this.#now(), event: "published", state: "published", jobRef: entry.jobRef }],
    };
    this.#entries.set(idempotencyKey, next);
    return next;
  }
}
