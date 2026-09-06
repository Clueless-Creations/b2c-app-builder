import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const claimSchema = z.strictObject({
  resource: z.string().min(1).max(512),
  workspaceId: z.string().min(1),
  occurrenceId: z.string().min(1),
  generation: z.string().uuid(),
  ownerPid: z.number().int().positive(),
  acquiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type SharedClaim = z.infer<typeof claimSchema>;
const recordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  claim: claimSchema.optional(),
  nextAllowedAt: z.string().datetime().optional(),
});
type ClaimRecord = z.infer<typeof recordSchema>;
export type SharedClaimResult =
  { ok: true; claim: SharedClaim } | { ok: false; reason: "busy" | "held" | "reconciliation_required" | "rate_limited"; retryAt?: string };

function resourceFile(home: string, resource: string): string {
  if (!resource.trim() || resource.length > 512) throw new Error("shared_claim.invalid_resource");
  const directory = path.join(home, "shared-claims");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return path.join(directory, `${createHash("sha256").update(resource).digest("hex")}.json`);
}

/** The short mutation guard never expires: a crash requires explicit local recovery. */
function transact<T>(file: string, operation: (record: ClaimRecord) => { record: ClaimRecord; value: T }): T | undefined {
  const guard = `${file}.lock`;
  let fd: number;
  try {
    fd = openSync(guard, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
    throw error;
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const record = existsSync(file) ? recordSchema.parse(JSON.parse(readFileSync(file, "utf8"))) : { schemaVersion: 1 as const };
    const next = operation(record);
    writeFileSync(temporary, JSON.stringify(recordSchema.parse(next.record)), { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
    return next.value;
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    closeSync(fd);
    unlinkSync(guard);
  }
}

function instant(now: string): number {
  const value = Date.parse(now);
  if (!Number.isFinite(value)) throw new Error("shared_claim.invalid_time");
  return value;
}

/** Coordinate an explicitly named provider project or device across registered businesses. */
export function acquireSharedClaim(input: {
  home: string;
  resource: string;
  workspaceId: string;
  occurrenceId: string;
  ttlSeconds: number;
  now?: string;
}): SharedClaimResult {
  const now = input.now ?? new Date().toISOString();
  const time = instant(now);
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 86400) throw new Error("shared_claim.invalid_ttl");
  const file = resourceFile(input.home, input.resource);
  return (
    transact<SharedClaimResult>(file, (record) => {
      if (record.claim) return { record, value: { ok: false, reason: instant(record.claim.expiresAt) <= time ? "reconciliation_required" : "held" } };
      if (record.nextAllowedAt && instant(record.nextAllowedAt) > time)
        return { record, value: { ok: false, reason: "rate_limited", retryAt: record.nextAllowedAt } };
      const claim = claimSchema.parse({
        resource: input.resource,
        workspaceId: input.workspaceId,
        occurrenceId: input.occurrenceId,
        generation: randomUUID(),
        ownerPid: process.pid,
        acquiredAt: now,
        expiresAt: new Date(time + input.ttlSeconds * 1000).toISOString(),
      });
      return { record: { schemaVersion: 1, claim }, value: { ok: true, claim } };
    }) ?? { ok: false, reason: "busy" }
  );
}

function owns(current: SharedClaim | undefined, claim: SharedClaim): boolean {
  return Boolean(
    current &&
    current.generation === claim.generation &&
    current.workspaceId === claim.workspaceId &&
    current.occurrenceId === claim.occurrenceId &&
    current.resource === claim.resource &&
    current.ownerPid === process.pid,
  );
}

/** Check immediately before dispatch and before accepting effects. Expiry never transfers ownership. */
export function assertSharedClaim(home: string, claim: SharedClaim, now = new Date().toISOString()): void {
  const file = resourceFile(home, claim.resource);
  const record = recordSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (!owns(record.claim, claim) || instant(record.claim!.expiresAt) <= instant(now)) throw new Error("shared_claim.ownership_lost");
}

export function renewSharedClaim(home: string, claim: SharedClaim, ttlSeconds: number, now = new Date().toISOString()): SharedClaim {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86400) throw new Error("shared_claim.invalid_ttl");
  const result = transact(resourceFile(home, claim.resource), (record) => {
    if (!owns(record.claim, claim) || instant(record.claim!.expiresAt) <= instant(now)) throw new Error("shared_claim.ownership_lost");
    const renewed = { ...record.claim!, expiresAt: new Date(instant(now) + ttlSeconds * 1000).toISOString() };
    return { record: { ...record, claim: renewed }, value: renewed };
  });
  if (!result) throw new Error("shared_claim.busy");
  return result;
}

/** Release only after the worker completed and its effects were reconciled by the existing run owner. */
export function releaseSharedClaim(home: string, claim: SharedClaim, options: { now?: string; cooldownMs?: number } = {}): void {
  const now = options.now ?? new Date().toISOString();
  const cooldown = options.cooldownMs ?? 0;
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 86400000) throw new Error("shared_claim.invalid_cooldown");
  const result = transact(resourceFile(home, claim.resource), (record) => {
    if (!owns(record.claim, claim) || instant(record.claim!.expiresAt) <= instant(now)) throw new Error("shared_claim.ownership_lost");
    return { record: { schemaVersion: 1, nextAllowedAt: new Date(instant(now) + cooldown).toISOString() }, value: true };
  });
  if (!result) throw new Error("shared_claim.busy");
}
