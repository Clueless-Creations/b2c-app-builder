/**
 * Persist RevenueCat CLI mutation intent before spawn and resume observation after
 * a confirmed write (#104).
 *
 * Persistence owner: this ledger (workspace `.b2c/revenuecat-cli-effects.json` by
 * default). It is subordinate provider execution data, not a kernel operation
 * journal, not business acceptance, and not a generic provider scheduler.
 * Coordinate #106: the same persist-before-effect, full request identity, and
 * resume-observation rules apply on EAS; do not extract a shared journal until
 * both proving cases match.
 *
 * Upstream RevenueCat is not treated as idempotent. Bind the full request
 * identity before lookup. Persist prepared/dispatched intent before spawn. A
 * confirmed Test Store or catalog write followed by a failed readback resumes
 * the observation. Unknown remote acceptance is not "no effect".
 */

import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isSafeRevenueCatResourceId, type CliArgvRequest } from "./cli-operations.js";

export const CLI_NEXT_ACTIONS = ["dispatch", "observe", "hold-uncertain", "complete", "none"] as const;
export type CliNextAction = (typeof CLI_NEXT_ACTIONS)[number];

export const CLI_EFFECT_PROGRESS = [
  "not-started",
  "no-effect",
  "dispatched-unconfirmed",
  "applied-unverified",
  "verified",
] as const;
export type CliEffectProgress = (typeof CLI_EFFECT_PROGRESS)[number];

export const CLI_MUTATION_FAILURE_KINDS = ["timeout", "cancelled", "truncated", "invalid-output", "error"] as const;
export type CliMutationFailureKind = (typeof CLI_MUTATION_FAILURE_KINDS)[number];

export type RevenueCatCliLedgerState = "uncertain" | "applied-unverified" | "verified" | "no-effect";

export interface RevenueCatCliEffectBinding {
  readonly operationId: string;
  readonly projectId: string;
  readonly appId: string;
  readonly productId: string;
  readonly appUserId: string;
  readonly customerId: string;
  readonly offeringId: string;
  readonly entitlementId: string;
  readonly packageId: string;
  readonly paywallId: string;
  readonly subscriptionId: string;
  readonly createTitle: string;
  readonly lookupKey: string;
  readonly displayName: string;
  readonly storeIdentifier: string;
  readonly productType: string;
  readonly attachProductIds: string;
}

export interface RevenueCatCliWriteSnapshot {
  readonly jsonOk: true;
  readonly data: unknown;
  readonly schemaVersion: string | null;
  readonly extraFields: readonly string[];
  readonly wrapped: boolean;
}

export interface RevenueCatCliLedgerEntry {
  readonly idempotencyKey: string;
  readonly remoteId?: string;
  readonly state: RevenueCatCliLedgerState;
  readonly binding: RevenueCatCliEffectBinding;
  readonly requestIdentity: string;
  readonly writeSnapshot?: RevenueCatCliWriteSnapshot;
  readonly failureKind?: CliMutationFailureKind;
  readonly calls: number;
  readonly history: readonly {
    readonly at: string;
    readonly event: string;
    readonly state: RevenueCatCliLedgerState;
    readonly remoteId?: string;
  }[];
}

export type RevenueCatCliReconciliation =
  | { readonly action: "proceed"; readonly reason: "no_prior_request" }
  | { readonly action: "reuse"; readonly entry: RevenueCatCliLedgerEntry }
  | { readonly action: "conflict"; readonly entry: RevenueCatCliLedgerEntry; readonly reason: "request_identity_mismatch" }
  | { readonly action: "uncertain"; readonly entry: RevenueCatCliLedgerEntry; readonly reason: "dispatched_unconfirmed" };

interface LedgerFile {
  readonly schemaVersion: "b2c.revenuecat-cli-ledger/v1";
  readonly entries: readonly RevenueCatCliLedgerEntry[];
}

function assertNoSymlink(file: string): void {
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) throw new Error("revenuecat.cli_ledger_symlink_refused");
}

function field(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function buildRevenueCatCliBinding(input: Pick<CliArgvRequest, "operationId" | "projectId" | "appId" | "productId" | "appUserId" | "customerId" | "offeringId" | "entitlementId" | "packageId" | "paywallId" | "subscriptionId" | "createTitle" | "lookupKey" | "displayName" | "storeIdentifier" | "productType" | "attachProductIds">): RevenueCatCliEffectBinding {
  const attach = [...(input.attachProductIds ?? [])].map((id) => id.trim()).filter(Boolean).sort();
  return {
    operationId: field(input.operationId),
    projectId: field(input.projectId),
    appId: field(input.appId),
    productId: field(input.productId),
    appUserId: field(input.appUserId),
    customerId: field(input.customerId),
    offeringId: field(input.offeringId),
    entitlementId: field(input.entitlementId),
    packageId: field(input.packageId),
    paywallId: field(input.paywallId),
    subscriptionId: field(input.subscriptionId),
    // Offerings/entitlements/packages identity is lookup-key + display-name, not --title.
    // Only products create emits optional --title, so only that operation hashes it.
    createTitle: input.operationId === "rc.products.create" ? field(input.createTitle) : "",
    lookupKey: field(input.lookupKey),
    displayName: field(input.displayName),
    storeIdentifier: field(input.storeIdentifier),
    productType: field(input.productType),
    attachProductIds: attach.join(","),
  };
}

function normalizedBinding(binding: RevenueCatCliEffectBinding): Record<string, string> {
  return { ...binding };
}

/** Canonical identity of one RevenueCat CLI mutation. Compared in full on every reuse path. */
export function canonicalRevenueCatCliRequestIdentity(binding: RevenueCatCliEffectBinding): string {
  return createHash("sha256").update(JSON.stringify(normalizedBinding(binding))).digest("hex");
}

export function revenueCatCliBindingsMatch(left: RevenueCatCliEffectBinding, right: RevenueCatCliEffectBinding): boolean {
  return canonicalRevenueCatCliRequestIdentity(left) === canonicalRevenueCatCliRequestIdentity(right);
}

export function extractRevenueCatCliRemoteId(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const keys = ["id", "object_id", "purchase_id", "transaction_id", "customer_id", "app_user_id"] as const;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && isSafeRevenueCatResourceId(value)) return value;
  }
  return undefined;
}

export function snapshotWriteJson(
  json:
    | {
        readonly ok: true;
        readonly data: unknown;
        readonly schemaVersion: string | null;
        readonly extraFields: readonly string[];
        readonly wrapped: boolean;
      }
    | { readonly ok: false }
    | undefined,
): RevenueCatCliWriteSnapshot | undefined {
  if (!json || json.ok !== true) return undefined;
  return {
    jsonOk: true,
    data: json.data,
    schemaVersion: json.schemaVersion,
    extraFields: json.extraFields,
    wrapped: json.wrapped,
  };
}

export function jsonFromWriteSnapshot(snapshot: RevenueCatCliWriteSnapshot | undefined): {
  readonly ok: true;
  readonly data: unknown;
  readonly schemaVersion: string | null;
  readonly extraFields: readonly string[];
  readonly wrapped: boolean;
} | undefined {
  if (!snapshot) return undefined;
  return {
    ok: true,
    data: snapshot.data,
    schemaVersion: snapshot.schemaVersion,
    extraFields: snapshot.extraFields,
    wrapped: snapshot.wrapped,
  };
}

function coerceBinding(binding: RevenueCatCliEffectBinding): RevenueCatCliEffectBinding {
  return buildRevenueCatCliBinding({
    ...binding,
    attachProductIds: binding.attachProductIds ? binding.attachProductIds.split(",") : [],
  });
}

function withIdentity(entry: Omit<RevenueCatCliLedgerEntry, "requestIdentity"> & { requestIdentity?: string }): RevenueCatCliLedgerEntry {
  const binding = coerceBinding(entry.binding);
  return { ...entry, binding, requestIdentity: canonicalRevenueCatCliRequestIdentity(binding) };
}

export class RevenueCatCliLedger {
  readonly #entries = new Map<string, RevenueCatCliLedgerEntry>();
  readonly #inflight = new Set<string>();
  readonly #now: () => string;

  constructor(options: { now?: () => string } = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  static load(file: string, options: { now?: () => string } = {}): RevenueCatCliLedger {
    const ledger = new RevenueCatCliLedger(options);
    ledger.load(file);
    return ledger;
  }

  get(idempotencyKey: string): RevenueCatCliLedgerEntry | undefined {
    return this.#entries.get(idempotencyKey);
  }

  entries(): RevenueCatCliLedgerEntry[] {
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
    if (parsed.schemaVersion !== "b2c.revenuecat-cli-ledger/v1" || !Array.isArray(parsed.entries)) {
      throw new Error("revenuecat.cli_ledger_invalid");
    }
    for (const entry of parsed.entries) {
      if (!entry || typeof entry.idempotencyKey !== "string" || !entry.binding) throw new Error("revenuecat.cli_ledger_invalid");
      this.#entries.set(entry.idempotencyKey, withIdentity(entry));
    }
  }

  save(file: string): void {
    assertNoSymlink(file);
    mkdirSync(path.dirname(file), { recursive: true });
    const document: LedgerFile = { schemaVersion: "b2c.revenuecat-cli-ledger/v1", entries: this.entries() };
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
  bindIntent(idempotencyKey: string, binding: RevenueCatCliEffectBinding): RevenueCatCliLedgerEntry {
    if (!idempotencyKey.trim()) throw new Error("revenuecat.cli_idempotency_key_required");
    const previous = this.#entries.get(idempotencyKey);
    if (previous && !revenueCatCliBindingsMatch(previous.binding, binding)) {
      throw new Error("revenuecat.cli_request_identity_conflict");
    }
    this.#inflight.add(idempotencyKey);
    if (previous) return previous;
    const at = this.#now();
    const entry = withIdentity({
      idempotencyKey,
      state: "uncertain",
      binding,
      calls: 1,
      history: [{ at, event: "bound", state: "uncertain" }],
    });
    this.#entries.set(idempotencyKey, entry);
    return entry;
  }

  release(idempotencyKey: string): void {
    this.#inflight.delete(idempotencyKey);
  }

  record(
    idempotencyKey: string,
    binding: RevenueCatCliEffectBinding,
    update: {
      readonly remoteId?: string;
      readonly state: RevenueCatCliLedgerState;
      readonly writeSnapshot?: RevenueCatCliWriteSnapshot;
      readonly failureKind?: CliMutationFailureKind;
    },
  ): RevenueCatCliLedgerEntry {
    if (!idempotencyKey.trim()) throw new Error("revenuecat.cli_idempotency_key_required");
    const previous = this.#entries.get(idempotencyKey);
    if (previous && !revenueCatCliBindingsMatch(previous.binding, binding)) {
      throw new Error("revenuecat.cli_request_identity_conflict");
    }
    const at = this.#now();
    const entry = withIdentity({
      idempotencyKey,
      remoteId: update.remoteId ?? previous?.remoteId,
      state: update.state,
      binding: previous?.binding ?? binding,
      writeSnapshot: update.writeSnapshot ?? previous?.writeSnapshot,
      failureKind: update.failureKind ?? previous?.failureKind,
      calls: (previous?.calls ?? 0) + 1,
      history: [
        ...(previous?.history ?? []),
        { at, event: "recorded", state: update.state, remoteId: update.remoteId ?? previous?.remoteId },
      ],
    });
    this.#entries.set(idempotencyKey, entry);
    return entry;
  }

  reconcile(idempotencyKey: string, binding: RevenueCatCliEffectBinding): RevenueCatCliReconciliation {
    const inflight = this.#inflight.has(idempotencyKey);
    const entry = this.#entries.get(idempotencyKey);
    if (!entry) {
      if (inflight) throw new Error("revenuecat.cli_lease_held");
      return { action: "proceed", reason: "no_prior_request" };
    }
    if (!revenueCatCliBindingsMatch(entry.binding, binding)) {
      return { action: "conflict", entry, reason: "request_identity_mismatch" };
    }
    if (inflight && (entry.state === "uncertain" || !entry.remoteId)) {
      return { action: "uncertain", entry, reason: "dispatched_unconfirmed" };
    }
    if (entry.state === "uncertain") {
      return { action: "uncertain", entry, reason: "dispatched_unconfirmed" };
    }
    return { action: "reuse", entry };
  }
}

export function revenueCatCliLedgerPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".b2c", "revenuecat-cli-effects.json");
}
