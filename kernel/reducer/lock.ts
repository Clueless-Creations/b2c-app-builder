import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";

/**
 * Advisory lock beside business state (R13). One lock file guards one business workspace's
 * writes. A scheduled run that finds it held by a live heartbeat backs off and reports
 * "did not run"; a stale lock (heartbeat past its TTL) is only breakable with an explicit,
 * read-back-verified flag — a live-heartbeat lock is never force-broken. The
 * `pendingInteractiveRequest` flag is the cooperative-yield channel: an interactive caller sets
 * it without taking ownership, and the scheduled holder checks it at its own dispatch-batch
 * boundaries, releasing there — never mid-attempt.
 */
export interface LockInfo {
  readonly ownerSessionId: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly ttlSeconds: number;
  readonly pendingInteractiveRequest: boolean;
}

export interface AcquireLockOptions {
  readonly ownerSessionId: string;
  /** How long a heartbeat may go silent before the lock is considered stale. Default 60s. */
  readonly ttlSeconds?: number;
  /** How many times to back off and retry while the lock is held by a live heartbeat. Default 3. */
  readonly retries?: number;
  readonly retryDelayMs?: number;
  /** Explicit, caller-asserted "I have read back and verified this lock is really stale" flag (R13). */
  readonly breakStale?: boolean;
  readonly now?: () => string;
}

export type AcquireResult =
  | { readonly ok: true; readonly lock: LockInfo }
  | { readonly ok: false; readonly reason: "held"; readonly holder: LockInfo }
  | { readonly ok: false; readonly reason: "stale_unverified"; readonly holder: LockInfo };

const DEFAULT_TTL_SECONDS = 60;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 50;
const UNKNOWN_HOLDER: LockInfo = { ownerSessionId: "unknown", acquiredAt: "", heartbeatAt: "", ttlSeconds: 0, pendingInteractiveRequest: false };

function nowIso(): string {
  return new Date().toISOString();
}

/** Blocking sleep. The reducer and its callers are short-lived CLI processes, so a synchronous back-off is simpler and sufficient — no event loop to preserve. */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

export function readLock(lockPath: string): LockInfo | undefined {
  if (!existsSync(lockPath)) return undefined;
  const raw = readFileSync(lockPath, "utf8").trim();
  if (raw.length === 0) return undefined;
  return JSON.parse(raw) as LockInfo;
}

function writeLockAtomic(lockPath: string, lock: LockInfo): void {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const tmp = `${lockPath}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmp, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  renameSync(tmp, lockPath);
}

export function isStale(lock: LockInfo, now: string = nowIso()): boolean {
  const heartbeatMs = Date.parse(lock.heartbeatAt);
  if (Number.isNaN(heartbeatMs)) return true;
  return Date.parse(now) - heartbeatMs > lock.ttlSeconds * 1000;
}

/** Exclusive create: fails with EEXIST if the lock is already held by anyone. This is the actual mutual-exclusion gate; everything else is decision logic around it. */
function tryAcquireFresh(lockPath: string, ownerSessionId: string, ttlSeconds: number, now: string): boolean {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd: number;
  try {
    fd = openSync(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  const lock: LockInfo = { ownerSessionId, acquiredAt: now, heartbeatAt: now, ttlSeconds, pendingInteractiveRequest: false };
  writeSync(fd, `${JSON.stringify(lock, null, 2)}\n`);
  closeSync(fd);
  return true;
}

type AttemptOutcome = { status: "acquired"; lock: LockInfo } | { status: "held"; holder: LockInfo } | { status: "stale_unverified"; holder: LockInfo };

function attemptOnce(lockPath: string, ownerSessionId: string, ttlSeconds: number, breakStale: boolean, retryDelayMs: number, now: () => string): AttemptOutcome {
  if (tryAcquireFresh(lockPath, ownerSessionId, ttlSeconds, now())) return { status: "acquired", lock: readLock(lockPath)! };

  const holder = readLock(lockPath);
  if (!holder) {
    // Lock vanished between the failed exclusive-create and this read (the prior owner released concurrently).
    if (tryAcquireFresh(lockPath, ownerSessionId, ttlSeconds, now())) return { status: "acquired", lock: readLock(lockPath)! };
    return { status: "held", holder: UNKNOWN_HOLDER };
  }
  if (!isStale(holder, now())) return { status: "held", holder };
  if (!breakStale) return { status: "stale_unverified", holder };

  // Read-back verification (R13): re-read after a short delay; only break if the heartbeat has not
  // moved and it is still stale on the second read. A live heartbeat is never force-broken.
  sleepSync(Math.max(retryDelayMs, 10));
  const readBack = readLock(lockPath);
  if (!readBack) {
    if (tryAcquireFresh(lockPath, ownerSessionId, ttlSeconds, now())) return { status: "acquired", lock: readLock(lockPath)! };
    return { status: "held", holder };
  }
  if (readBack.heartbeatAt !== holder.heartbeatAt || !isStale(readBack, now())) {
    // The heartbeat moved between reads: this lock is alive after all, not stale. Never break it.
    return { status: "held", holder: readBack };
  }
  unlinkSync(lockPath);
  if (tryAcquireFresh(lockPath, ownerSessionId, ttlSeconds, now())) return { status: "acquired", lock: readLock(lockPath)! };
  const holderAfterBreak = readLock(lockPath);
  return holderAfterBreak ? { status: "held", holder: holderAfterBreak } : { status: "stale_unverified", holder: readBack };
}

export function acquireLock(lockPath: string, options: AcquireLockOptions): AcquireResult {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const now = options.now ?? nowIso;
  const breakStale = options.breakStale ?? false;

  let outcome = attemptOnce(lockPath, options.ownerSessionId, ttlSeconds, breakStale, retryDelayMs, now);
  let attempts = 0;
  while (outcome.status === "held" && attempts < retries) {
    sleepSync(retryDelayMs);
    attempts += 1;
    outcome = attemptOnce(lockPath, options.ownerSessionId, ttlSeconds, breakStale, retryDelayMs, now);
  }

  if (outcome.status === "acquired") return { ok: true, lock: outcome.lock };
  if (outcome.status === "held") return { ok: false, reason: "held", holder: outcome.holder };
  return { ok: false, reason: "stale_unverified", holder: outcome.holder };
}

export function heartbeat(lockPath: string, ownerSessionId: string, now: string = nowIso()): void {
  const lock = readLock(lockPath);
  if (!lock) throw new Error(`No lock at ${lockPath} to heartbeat`);
  if (lock.ownerSessionId !== ownerSessionId) throw new Error(`Session "${ownerSessionId}" does not own the lock at ${lockPath} (held by "${lock.ownerSessionId}")`);
  writeLockAtomic(lockPath, { ...lock, heartbeatAt: now });
}

export function releaseLock(lockPath: string, ownerSessionId: string): void {
  const lock = readLock(lockPath);
  if (!lock) return;
  if (lock.ownerSessionId !== ownerSessionId) throw new Error(`Session "${ownerSessionId}" does not own the lock at ${lockPath} (held by "${lock.ownerSessionId}"); refusing to release`);
  unlinkSync(lockPath);
}

/** An interactive caller signals a live scheduled holder to yield at its next batch boundary, without taking ownership (R13's cooperative yield). */
export function requestInteractive(lockPath: string): void {
  const lock = readLock(lockPath);
  if (!lock) throw new Error(`No active lock at ${lockPath} to request against`);
  writeLockAtomic(lockPath, { ...lock, pendingInteractiveRequest: true });
}

/** The scheduled holder calls this at each dispatch-batch boundary. True means: release now and yield — never mid-attempt. */
export function checkYield(lockPath: string, ownerSessionId: string): boolean {
  const lock = readLock(lockPath);
  if (!lock) throw new Error(`No active lock at ${lockPath} to check`);
  if (lock.ownerSessionId !== ownerSessionId) throw new Error(`Session "${ownerSessionId}" does not own the lock at ${lockPath}`);
  return lock.pendingInteractiveRequest;
}
