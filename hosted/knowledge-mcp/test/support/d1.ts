/**
 * Fixture helper for the tenant-isolation canary and the D1-backed worker suite. Test-only.
 *
 * This is the one file besides db/tenant.ts that check-tenant-isolation.ts permits to hold
 * unscoped SQL, because the canary has to seed two tenants and then read across both to
 * prove that the repository did not. The same lint fails the build if any file outside
 * test/ imports it, so the unscoped statements cannot leak into the Worker.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { join } from "node:path";
import { convertV4MiniflareOptions, Log, LogLevel, Miniflare, type V4WorkerOptions } from "miniflare";

const MIGRATIONS_DIR = fileURLToPath(new NodeURL("../../migrations", import.meta.url));
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
 * inference, which keeps check-tenant-isolation.ts's allowlist at exactly two files instead
 * of growing one entry per suite that needs a database.
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
  /** The entitlement row's `lookup_key`; defaults to the read scope's own key. A paid plan's key exercises auth.ts's READ_SCOPE_LOOKUP_KEYS mapping. */
  readonly entitlementLookupKey?: string;
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
                VALUES (?1, ?5, ?2, 1, 'stripe_webhook', NULL, ?3, ?4)`,
      )
      .bind(input.accountId, input.stripeCustomerId, STAMP, input.entitlementSyncedAt ?? STAMP, input.entitlementLookupKey ?? "b2c:read")
      .run();
}

export interface InterestSignalRow {
  readonly id: string;
  readonly acquisition_source: string;
  readonly intent: string;
  readonly initial_utm_source: string | null;
  readonly initial_utm_campaign: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EntitlementRow {
  readonly accountId: string;
  readonly lookupKey: string;
  readonly stripeCustomerId: string;
  /** Written to both `observed_at` and `synced_at`, the way billing/webhook.ts stamps a row it has just seen. */
  readonly stamp: string;
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
  /** Stands in for the Stripe webhook writing a paid plan row the seed does not carry, stamped at a caller-chosen instant. */
  insertEntitlement(input: EntitlementRow): Promise<void>;
  /** Drops one entitlement row, so a test that added a plan row hands the seeded shape back to the next one. */
  deleteEntitlement(accountId: string, lookupKey: string): Promise<void>;
  seedAccount(input: SeedAccount): Promise<void>;
  /** Simulates D1 returning an error: the next api_keys read fails at the driver. */
  breakApiKeysTable(): Promise<void>;
  dispose(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  // Same adapter the worker suite uses: this Miniflare takes v5 options, and the v4 shape
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
    if (!["api_keys", "sessions", "audit_events", "entitlements", "memberships"].includes(table)) throw new Error(`countRows: unexpected table ${table}`);
    const row = await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE account_id = ?1`).bind(accountId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async function readKeyRevokedAt(keyId: string): Promise<string | null | undefined> {
    const row = await db.prepare(`SELECT revoked_at FROM api_keys WHERE id = ?1`).bind(keyId).first<{ revoked_at: string | null }>();
    return row === null ? undefined : row.revoked_at;
  }

  async function readInterestSignals(): Promise<InterestSignalRow[]> {
    const { results } = await db
      .prepare(
        `SELECT id, acquisition_source, intent, initial_utm_source, initial_utm_campaign, created_at, updated_at FROM interest_signals ORDER BY created_at, id`,
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

  /**
   * Writes one entitlement row in the shape billing/webhook.ts writes: active, sourced from the
   * webhook, and stamped at a caller-chosen instant so a staleness test can place it on either
   * side of the ceiling. It lives here rather than in the canary because this file is the one
   * file in the test tree check-tenant-isolation.ts permits to hold unscoped SQL.
   */
  async function insertEntitlement(input: EntitlementRow): Promise<void> {
    await db
      .prepare(
        `INSERT INTO entitlements (account_id, lookup_key, stripe_customer_id, active, source, stripe_event_id, observed_at, synced_at)
                VALUES (?1, ?2, ?3, 1, 'stripe_webhook', NULL, ?4, ?4)`,
      )
      .bind(input.accountId, input.lookupKey, input.stripeCustomerId, input.stamp)
      .run();
  }

  async function deleteEntitlement(accountId: string, lookupKey: string): Promise<void> {
    await db.prepare(`DELETE FROM entitlements WHERE account_id = ?1 AND lookup_key = ?2`).bind(accountId, lookupKey).run();
  }

  return {
    db,
    countRows,
    readKeyRevokedAt,
    readInterestSignals,
    deactivateEntitlement: (accountId, lookupKey) => setEntitlementActive(accountId, lookupKey, 0),
    reactivateEntitlement: (accountId, lookupKey) => setEntitlementActive(accountId, lookupKey, 1),
    insertEntitlement,
    deleteEntitlement,
    seedAccount: (input) => seedAccountInto(db, input),
    breakApiKeysTable: async () => {
      await db.prepare("DROP TABLE api_keys").run();
    },
    dispose: () => mf.dispose(),
  };
}

export interface MigrationRebuildSurvival {
  /** The seeded account's Customer id, read back after the rebuild. */
  readonly accountStripeCustomerId: string | null;
  /** Whether a NEW account can be inserted with a NULL Customer id — proof the column relaxed. */
  readonly nullCustomerAccountAccepted: boolean;
  readonly membershipSurvived: boolean;
  readonly apiKeySurvived: boolean;
  readonly sessionSurvived: boolean;
  readonly subscriptionStatus: string | null;
  /** The dunning stamp, specifically — the column a plain row-count check would miss losing. */
  readonly subscriptionPastDueSince: string | null;
  readonly entitlementActive: number | null;
  readonly processedStripeEventResult: string | null;
  /** Whether `processed_stripe_events_are_append_only` still refuses an UPDATE after the rebuild. */
  readonly appendOnlyTriggerStillEnforced: boolean;
}

/**
 * Runs 0008_lazy_stripe_customer.sql's `accounts` rebuild against a populated database and
 * reports what survived it. Test-only, and deliberately not part of `TestDatabase` above:
 * `createTestDatabase()` applies every migration up front, which leaves no way to seed data in
 * the PRE-0008 shape (`accounts.stripe_customer_id` still `NOT NULL`) the way a real deploy
 * would encounter it. This applies every migration except 0008 first, seeds one full tenant plus
 * a `past_due` subscription and a `processed_stripe_events` row by hand, applies 0008 alone, and
 * reads back exactly what a migration-safety test needs — no raw D1 access in the test file
 * itself, matching this file's own "the fixture holds the SQL" role for the isolation canary.
 */
export async function verifyMigration0008RebuildSurvival(): Promise<MigrationRebuildSurvival> {
  const migrations = await readMigrations();
  const rebuild = migrations.find((migration) => migration.name === "0008_lazy_stripe_customer.sql");
  if (rebuild === undefined) throw new Error("0008_lazy_stripe_customer.sql not found — has it been renamed?");
  const before0008 = migrations.filter((migration) => migration.name !== "0008_lazy_stripe_customer.sql");

  const options: V4WorkerOptions & { log: Log } = {
    modules: true,
    script: "export default { fetch: () => new Response('ok') };",
    compatibilityDate: "2026-08-27",
    d1Databases: ["DB"],
    log: new Log(LogLevel.ERROR),
  };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  try {
    await mf.ready;
    const db = (await mf.getD1Database("DB")) as unknown as D1Database;
    for (const migration of before0008) for (const statement of migration.statements) await db.prepare(statement).run();

    const stamp = "2026-01-01T00:00:00.000Z";
    const sessionId = "b".repeat(64);

    // One full tenant, seeded by hand against the PRE-0008 shape — `accounts.stripe_customer_id`
    // is still NOT NULL here, exactly like every account that could exist before this migration
    // ever runs against it.
    await db
      .prepare(
        `INSERT INTO users (id, google_sub, email, email_verified, display_name, created_at, updated_at, disabled_at)
         VALUES ('user_rebuild', '900000000000000000099', 'rebuild@example.com', 1, NULL, ?1, ?1, NULL)`,
      )
      .bind(stamp)
      .run();
    await db
      .prepare(
        `INSERT INTO accounts (id, name, stripe_customer_id, created_at, updated_at, suspended_at)
         VALUES ('acct_rebuild', 'acct_rebuild', 'cus_REBUILDTEST0001', ?1, ?1, NULL)`,
      )
      .bind(stamp)
      .run();
    await db
      .prepare(
        `INSERT INTO memberships (account_id, user_id, role, status, created_at, updated_at)
         VALUES ('acct_rebuild', 'user_rebuild', 'owner', 'active', ?1, ?1)`,
      )
      .bind(stamp)
      .run();
    await db
      .prepare(
        `INSERT INTO api_keys (id, account_id, user_id, sha256_hex, scopes, key_prefix, label, created_at, revoked_at, expires_at, last_used_at)
         VALUES ('key_rebuild', 'acct_rebuild', 'user_rebuild', ?1, '["b2c:read"]', 'b2c_rbld', 'rebuild', ?2, NULL, NULL, NULL)`,
      )
      .bind("a".repeat(64), stamp)
      .run();
    await db
      .prepare(
        `INSERT INTO sessions (id, user_id, account_id, created_at, expires_at, revoked_at, last_seen_at)
         VALUES (?1, 'user_rebuild', 'acct_rebuild', ?2, '2099-01-01T00:00:00.000Z', NULL, NULL)`,
      )
      .bind(sessionId, stamp)
      .run();
    // status = 'past_due' WITH a dunning stamp already set: the exact shape a check that only
    // confirms the row still exists would pass even if the rebuild silently reset this column to
    // NULL. The informational gift-discount column is left out of the column list below on
    // purpose (it defaults to 0 on its own) — this repository's own lint forbids naming that
    // column outside db/tenant.ts and this fixture, for reasons this file's own header explains.
    await db
      .prepare(
        `INSERT INTO subscriptions
           (id, account_id, stripe_customer_id, status, price_id, cancel_at_period_end, current_period_end, observed_at, synced_at, past_due_since)
         VALUES ('sub_rebuildtest1', 'acct_rebuild', 'cus_REBUILDTEST0001', 'past_due', NULL, 0, NULL, ?1, ?1, ?1)`,
      )
      .bind(stamp)
      .run();
    await db
      .prepare(
        `INSERT INTO entitlements (account_id, lookup_key, stripe_customer_id, active, source, stripe_event_id, observed_at, synced_at)
         VALUES ('acct_rebuild', 'b2c:read', 'cus_REBUILDTEST0001', 1, 'stripe_webhook', NULL, ?1, ?1)`,
      )
      .bind(stamp)
      .run();
    // The row whose FK action (SET NULL) is itself an UPDATE that processed_stripe_events_are_
    // append_only forbids unconditionally — the migration's own doc comment names this exact
    // interaction as why a plain `DROP TABLE accounts` fails here. If the migration did not drop
    // and recreate that trigger around the rebuild, applying 0008 below throws before anything
    // else in this function runs.
    await db
      .prepare(
        `INSERT INTO processed_stripe_events (id, type, account_id, result, received_at)
         VALUES ('evt_rebuildtest1', 'customer.subscription.updated', 'acct_rebuild', 'applied', ?1)`,
      )
      .bind(stamp)
      .run();

    // Apply 0008 alone, against the populated database seeded above.
    for (const statement of rebuild.statements) await db.prepare(statement).run();

    const account = await db.prepare(`SELECT stripe_customer_id FROM accounts WHERE id = 'acct_rebuild'`).first<{ stripe_customer_id: string | null }>();

    // The column actually relaxed: a NEW account can now be inserted with no Customer at all,
    // which the pre-rebuild NOT NULL constraint would have refused outright.
    let nullCustomerAccountAccepted: boolean;
    try {
      await db
        .prepare(
          `INSERT INTO accounts (id, name, stripe_customer_id, created_at, updated_at, suspended_at)
           VALUES ('acct_rebuild_null', 'acct_rebuild_null', NULL, ?1, ?1, NULL)`,
        )
        .bind(stamp)
        .run();
      nullCustomerAccountAccepted = true;
    } catch {
      nullCustomerAccountAccepted = false;
    }

    const membership = await db.prepare(`SELECT 1 FROM memberships WHERE account_id = 'acct_rebuild' AND user_id = 'user_rebuild'`).first();
    const apiKey = await db.prepare(`SELECT 1 FROM api_keys WHERE id = 'key_rebuild'`).first();
    const session = await db.prepare(`SELECT 1 FROM sessions WHERE id = ?1`).bind(sessionId).first();
    const subscription = await db
      .prepare(`SELECT status, past_due_since FROM subscriptions WHERE id = 'sub_rebuildtest1'`)
      .first<{ status: string; past_due_since: string | null }>();
    const entitlement = await db
      .prepare(`SELECT active FROM entitlements WHERE account_id = 'acct_rebuild' AND lookup_key = 'b2c:read'`)
      .first<{ active: number }>();
    const event = await db.prepare(`SELECT result FROM processed_stripe_events WHERE id = 'evt_rebuildtest1'`).first<{ result: string }>();

    // The append-only trigger this migration must drop and recreate, verbatim, around the
    // rebuild: prove it is actually back in force by attempting the exact write it exists to
    // forbid.
    let appendOnlyTriggerStillEnforced: boolean;
    try {
      await db.prepare(`UPDATE processed_stripe_events SET result = 'ignored' WHERE id = 'evt_rebuildtest1'`).run();
      appendOnlyTriggerStillEnforced = false;
    } catch {
      appendOnlyTriggerStillEnforced = true;
    }

    return {
      accountStripeCustomerId: account?.stripe_customer_id ?? null,
      nullCustomerAccountAccepted,
      membershipSurvived: membership !== null,
      apiKeySurvived: apiKey !== null,
      sessionSurvived: session !== null,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionPastDueSince: subscription?.past_due_since ?? null,
      entitlementActive: entitlement?.active ?? null,
      processedStripeEventResult: event?.result ?? null,
      appendOnlyTriggerStillEnforced,
    };
  } finally {
    await mf.dispose();
  }
}

/** Revoke a fixture credential to verify outstanding OAuth grants are invalidated. */
export async function revokeSeedKey(db: D1Database, keyId: string): Promise<void> {
  await db.prepare("UPDATE api_keys SET revoked_at = ?2 WHERE id = ?1").bind(keyId, new Date().toISOString()).run();
}
