/**
 * Fixture helper for this Worker's D1-backed integration suites. Test-only.
 *
 * Mirrored from hosted/knowledge-mcp/test/support/d1.ts (M1's fixture), because both Workers bind the
 * same `clueless-creations` D1 database and both need the same migrated shape to test against.
 * A re-export across the package boundary was considered and rejected: this file's seed helper
 * has to hold unscoped SQL to set up two tenants for a cross-tenant leak test, and the tenant-
 * isolation lint's fixture-containment rule already treats "this exact path under test/" as the
 * allowed shape for that SQL. A shared module living outside both test/ trees would need a new
 * exception instead of reusing the one that exists. Keep the two copies identical; a change to
 * one almost always means the same change in the other.
 *
 * This is the one file besides ../../../knowledge-mcp/db/tenant.ts that check-tenant-isolation.ts
 * should permit to hold unscoped SQL once its scan is extended to this package — the canary has
 * to seed two tenants and then read across both to prove that the repository did not.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { join } from "node:path";
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare, type V4WorkerOptions } from "miniflare";

/** The schema lives in hosted/knowledge-mcp; this Worker has no migrations of its own. */
const MIGRATIONS_DIR = fileURLToPath(new NodeURL("../../../knowledge-mcp/migrations", import.meta.url));
// One minute in the past, computed at load time: the tenant layer compares these rows against the
// real clock (a 24-hour staleness ceiling), so a fixed calendar date turned every test red the day
// after it was written. Seeded rows must always read as fresh.
const STAMP = new Date(Date.now() - 60_000).toISOString();
/** The instant every seeded row is stamped with; tests that reason about staleness derive from it. */
export const SEED_STAMP = STAMP;
const SESSION_EXPIRY = "2099-01-01T00:00:00.000Z";

/**
 * Splits a migration file into executable statements.
 *
 * A naive split on ";" would cut a CREATE TRIGGER in half: its body is a statement list
 * wrapped in BEGIN ... END, and those inner semicolons are not statement boundaries. So a
 * semicolon ends a trigger only when it directly follows END. Single-quoted literals are
 * tracked so a semicolon inside a RAISE message would not split either.
 */
export function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const marker = line.indexOf("--");
      if (marker === -1) return line;
      const quotes = (line.slice(0, marker).match(/'/g) ?? []).length;
      return quotes % 2 === 0 ? line.slice(0, marker) : line;
    })
    .join("\n");

  const statements: string[] = [];
  let buffer = "";
  let inLiteral = false;
  for (const char of withoutComments) {
    if (char === "'") inLiteral = !inLiteral;
    if (char === ";" && !inLiteral) {
      const isTrigger = /\bCREATE\s+TRIGGER\b/i.test(buffer);
      if (!isTrigger || /\bEND\s*$/i.test(buffer)) {
        const statement = buffer.trim();
        if (statement.length > 0) statements.push(statement);
        buffer = "";
        continue;
      }
    }
    buffer += char;
  }
  const tail = buffer.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

export async function readMigrations(): Promise<{ name: string; statements: string[] }[]> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => ({ name, statements: splitStatements(await readFile(join(MIGRATIONS_DIR, name), "utf8")) })));
}

/** Applies every numbered migration to an existing D1 handle, in order. */
export async function applyMigrations(db: D1Database): Promise<void> {
  for (const migration of await readMigrations()) for (const statement of migration.statements) await db.prepare(statement).run();
}

/**
 * Hands back the migrated D1 handle for a Miniflare instance.
 *
 * Exists so a test never has to name the D1 types itself: the handle reaches the caller by
 * inference, which keeps a future check-tenant-isolation.ts allowlist at exactly two files per
 * package instead of growing one entry per suite that needs a database.
 */
export async function attachD1(mf: Miniflare): Promise<D1Database> {
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await applyMigrations(db);
  return db;
}

export interface SeedAccount {
  readonly accountId: string;
  readonly userId: string;
  readonly googleSub: string;
  readonly email: string;
  readonly stripeCustomerId: string;
  readonly keyId: string;
  readonly keyDigest: string;
  readonly sessionId?: string;
  readonly entitled?: boolean;
  readonly entitlementSyncedAt?: string;
  readonly keyRevoked?: boolean;
}

/** Seeds one complete tenant: user, account, owner membership, key, session, audit, entitlement. */
export async function seedAccountInto(db: D1Database, input: SeedAccount): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, google_sub, email, email_verified, display_name, created_at, updated_at, disabled_at)
              VALUES (?1, ?2, ?3, 1, NULL, ?4, ?4, NULL)`,
    )
    .bind(input.userId, input.googleSub, input.email, STAMP)
    .run();
  await db
    .prepare(
      `INSERT INTO accounts (id, name, stripe_customer_id, created_at, updated_at, suspended_at)
              VALUES (?1, ?1, ?2, ?3, ?3, NULL)`,
    )
    .bind(input.accountId, input.stripeCustomerId, STAMP)
    .run();
  await db
    .prepare(
      `INSERT INTO memberships (account_id, user_id, role, status, created_at, updated_at)
              VALUES (?1, ?2, 'owner', 'active', ?3, ?3)`,
    )
    .bind(input.accountId, input.userId, STAMP)
    .run();
  await db
    .prepare(
      `INSERT INTO api_keys (id, account_id, user_id, sha256_hex, scopes, key_prefix, label, created_at, revoked_at, expires_at, last_used_at)
              VALUES (?1, ?2, ?3, ?4, '["b2c:read"]', 'b2c_seed', 'seed', ?5, ?6, NULL, NULL)`,
    )
    .bind(input.keyId, input.accountId, input.userId, input.keyDigest, STAMP, input.keyRevoked === true ? STAMP : null)
    .run();
  if (input.sessionId !== undefined)
    await db
      .prepare(
        `INSERT INTO sessions (id, user_id, account_id, created_at, expires_at, revoked_at, last_seen_at)
                VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)`,
      )
      .bind(input.sessionId, input.userId, input.accountId, STAMP, SESSION_EXPIRY)
      .run();
  await db
    .prepare(
      `INSERT INTO audit_events (id, account_id, actor_user_id, action, target_type, target_id, metadata, created_at)
              VALUES (?1, ?2, ?3, 'api_key.create', 'api_key', ?4, '{}', ?5)`,
    )
    .bind(`audit-${input.accountId}`, input.accountId, input.userId, input.keyId, STAMP)
    .run();
  if (input.entitled !== false)
    await db
      .prepare(
        `INSERT INTO entitlements (account_id, lookup_key, stripe_customer_id, active, source, stripe_event_id, observed_at, synced_at)
                VALUES (?1, 'b2c:read', ?2, 1, 'stripe_webhook', NULL, ?3, ?4)`,
      )
      .bind(input.accountId, input.stripeCustomerId, STAMP, input.entitlementSyncedAt ?? STAMP)
      .run();
}

export interface InterestSignalRow {
  readonly id: string;
  readonly email: string;
  readonly acquisition_source: string;
  readonly intent: string;
  readonly account_id: string | null;
  readonly initial_utm_source: string | null;
  readonly initial_utm_campaign: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TestDatabase {
  readonly db: D1Database;
  /** Unscoped read. Used only to prove the repository's scoped reads were correct. */
  countRows(table: string, accountId: string): Promise<number>;
  /** Unscoped read of one api_keys row, to assert account B's key was left untouched. */
  readKeyRevokedAt(keyId: string): Promise<string | null | undefined>;
  /** Unscoped read of the collector, which has no tenant to scope by. */
  readInterestSignals(): Promise<InterestSignalRow[]>;
  /** Stands in for the Stripe webhook writing active = 0. */
  deactivateEntitlement(accountId: string, lookupKey: string): Promise<void>;
  /** Stands in for the Stripe webhook writing active = 1. */
  reactivateEntitlement(accountId: string, lookupKey: string): Promise<void>;
  seedAccount(input: SeedAccount): Promise<void>;
  /** Simulates D1 returning an error: the next api_keys read fails at the driver. */
  breakApiKeysTable(): Promise<void>;
  /** Simulates D1 returning an error: the next sessions read (resolveSessionPrincipal) fails at the driver. */
  breakSessionsTable(): Promise<void>;
  /** Unscoped read of one sessions row's revocation, mirroring readKeyRevokedAt. */
  readSessionRevokedAt(sessionId: string): Promise<string | null | undefined>;
  /** Unscoped read of one processed_stripe_events row, for the webhook idempotency suite. */
  readProcessedStripeEvent(id: string): Promise<ProcessedStripeEventRow | null>;
  /** Unscoped read of one entitlements row (the access gate itself). */
  readEntitlement(accountId: string, lookupKey: string): Promise<EntitlementSnapshot | null>;
  /**
   * Unscoped read of one subscriptions mirror row. Deliberately does not select the
   * informational gifted-subscription column — a suite proving that column has no bearing on
   * the entitlement gate does that by checking assertEntitled's outcome directly, not by
   * reading the mirror's own copy of the value back out.
   */
  readSubscriptionMirror(id: string): Promise<SubscriptionMirrorSnapshot | null>;
  dispose(): Promise<void>;
}

export interface ProcessedStripeEventRow {
  readonly id: string;
  readonly type: string;
  readonly accountId: string | null;
  readonly result: string;
}

export interface EntitlementSnapshot {
  readonly active: number;
  readonly source: string;
}

export interface SubscriptionMirrorSnapshot {
  readonly status: string;
  readonly observedAt: string;
  readonly pastDueSince: string | null;
  readonly priceId: string | null;
  readonly cancelAtPeriodEnd: number;
  readonly currentPeriodEnd: string | null;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  // Same adapter the hosted suite uses: this Miniflare takes v5 options, and the v4 shape
  // is what the rest of this package is written against.
  const options: V4WorkerOptions & { log: Log } = {
    modules: true,
    script: "export default { fetch: () => new Response('ok') };",
    compatibilityDate: "2026-08-27",
    d1Databases: ["DB"],
    log: new Log(LogLevel.ERROR),
  };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  await mf.ready;
  const db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await applyMigrations(db);

  async function countRows(table: string, accountId: string): Promise<number> {
    // Table names cannot be bound. The canary passes only these literals.
    if (!["api_keys", "sessions", "audit_events", "entitlements", "memberships", "subscriptions"].includes(table))
      throw new Error(`countRows: unexpected table ${table}`);
    const row = await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE account_id = ?1`).bind(accountId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async function readProcessedStripeEvent(id: string): Promise<ProcessedStripeEventRow | null> {
    const row = await db
      .prepare(`SELECT id, type, account_id, result FROM processed_stripe_events WHERE id = ?1`)
      .bind(id)
      .first<{ id: string; type: string; account_id: string | null; result: string }>();
    return row === null ? null : { id: row.id, type: row.type, accountId: row.account_id, result: row.result };
  }

  async function readEntitlement(accountId: string, lookupKey: string): Promise<EntitlementSnapshot | null> {
    const row = await db
      .prepare(`SELECT active, source FROM entitlements WHERE account_id = ?1 AND lookup_key = ?2`)
      .bind(accountId, lookupKey)
      .first<{ active: number; source: string }>();
    return row === null ? null : { active: row.active, source: row.source };
  }

  async function readSubscriptionMirror(id: string): Promise<SubscriptionMirrorSnapshot | null> {
    const row = await db
      .prepare(`SELECT status, observed_at, past_due_since, price_id, cancel_at_period_end, current_period_end FROM subscriptions WHERE id = ?1`)
      .bind(id)
      .first<{ status: string; observed_at: string; past_due_since: string | null; price_id: string | null; cancel_at_period_end: number; current_period_end: string | null }>();
    return row === null
      ? null
      : {
          status: row.status,
          observedAt: row.observed_at,
          pastDueSince: row.past_due_since,
          priceId: row.price_id,
          cancelAtPeriodEnd: row.cancel_at_period_end,
          currentPeriodEnd: row.current_period_end,
        };
  }

  async function readKeyRevokedAt(keyId: string): Promise<string | null | undefined> {
    const row = await db.prepare(`SELECT revoked_at FROM api_keys WHERE id = ?1`).bind(keyId).first<{ revoked_at: string | null }>();
    return row === null ? undefined : row.revoked_at;
  }

  async function readSessionRevokedAt(sessionId: string): Promise<string | null | undefined> {
    const row = await db.prepare(`SELECT revoked_at FROM sessions WHERE id = ?1`).bind(sessionId).first<{ revoked_at: string | null }>();
    return row === null ? undefined : row.revoked_at;
  }

  async function readInterestSignals(): Promise<InterestSignalRow[]> {
    const { results } = await db
      .prepare(
        `SELECT id, email, acquisition_source, intent, account_id, initial_utm_source, initial_utm_campaign, created_at, updated_at FROM interest_signals ORDER BY created_at, id`,
      )
      .all();
    return results as unknown as InterestSignalRow[];
  }

  async function setEntitlementActive(accountId: string, lookupKey: string, active: 0 | 1): Promise<void> {
    await db
      .prepare(`UPDATE entitlements SET active = ?3, synced_at = ?4 WHERE account_id = ?1 AND lookup_key = ?2`)
      .bind(accountId, lookupKey, active, new Date().toISOString())
      .run();
  }

  return {
    db,
    countRows,
    readKeyRevokedAt,
    readSessionRevokedAt,
    readProcessedStripeEvent,
    readEntitlement,
    readSubscriptionMirror,
    readInterestSignals,
    deactivateEntitlement: (accountId, lookupKey) => setEntitlementActive(accountId, lookupKey, 0),
    reactivateEntitlement: (accountId, lookupKey) => setEntitlementActive(accountId, lookupKey, 1),
    seedAccount: (input) => seedAccountInto(db, input),
    breakApiKeysTable: async () => {
      await db.prepare("DROP TABLE api_keys").run();
    },
    breakSessionsTable: async () => {
      await db.prepare("DROP TABLE sessions").run();
    },
    dispose: () => mf.dispose(),
  };
}
