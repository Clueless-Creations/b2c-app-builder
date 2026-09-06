-- Migration 0008: lazy Stripe Customer creation.
--
-- Before this migration, accounts.stripe_customer_id was NOT NULL: Google sign-in created the
-- Stripe Customer synchronously, before the account row could exist at all
-- (0001_identity_and_tenancy.sql's own comment: "the Stripe Customer is created eagerly at first
-- Google login"). That made every first-time sign-in depend on Stripe being reachable, which is
-- the outage this migration and its accompanying code change (core/app/worker.ts,
-- core/hosted/db/tenant.ts) both close: sign-in no longer touches Stripe at all, so the Customer
-- is created lazily, the first time Checkout actually needs one
-- (core/app/billing/checkout.ts's ensureStripeCustomer).
--
-- SQLite cannot relax a column's NOT NULL or CHECK constraint in place -- ALTER TABLE only adds,
-- renames, or drops whole columns -- so this rebuilds `accounts` the way SQLite's own
-- documentation describes for "Making Other Kinds Of Table Schema Changes"
-- (https://www.sqlite.org/lang_altertable.html): build the new shape, copy the data across, drop
-- the old table, rename the new one into place, and reconstruct whatever indexes and triggers the
-- old one carried. `accounts` carries no index beyond the implicit ones its own PRIMARY KEY and
-- UNIQUE column constraints already create, and no trigger of its own -- confirmed by grep across
-- 0001-0007 for `REFERENCES accounts`, `ON accounts`, and `TRIGGER ON accounts`, and directly
-- against a migrated test database with
-- `SELECT sql FROM sqlite_master WHERE tbl_name = 'accounts'`, which returns exactly the one
-- CREATE TABLE statement below (pre-migration shape) and nothing else. So there is nothing to
-- recreate on `accounts` itself beyond its own CREATE TABLE statement.
--
-- What is not nothing: `accounts` is the parent of six other tables, all declared with
-- `ON DELETE CASCADE` (memberships, api_keys, sessions, subscriptions, entitlements) or
-- `ON DELETE SET NULL` (processed_stripe_events). SQLite's documented DROP TABLE behaviour is
-- that, when foreign key enforcement is active, the drop first performs the equivalent of
-- deleting every row in the table, which runs every ON DELETE/ON UPDATE action attached to a
-- foreign key naming that table as its parent -- so a plain `DROP TABLE accounts` cascades
-- through all six.
--
-- The standard fix for that (SQLite's own ALTER TABLE recipe, step 1) is
-- `PRAGMA foreign_keys = OFF` before the rebuild and back ON after. It does not work here. Both
-- that pragma and `PRAGMA defer_foreign_keys = ON` (which defers constraint *violations* to
-- COMMIT -- a different thing from disabling the CASCADE/SET NULL *actions* themselves) were
-- tried against a migrated Miniflare D1 seeded with one account carrying a membership, an
-- api_key, a session, a subscription, an entitlement, and a processed_stripe_events row -- tried
-- both as separate statements the way core/hosted/test/support/d1.ts's applyMigrations runs a
-- migration file (one `.prepare(...).run()` per statement, which is also how this file is
-- actually applied) and batched together in one `db.batch()`. Every combination still cascaded:
-- this D1 binding enforces foreign keys unconditionally and does not honour either pragma as a
-- way to suspend that enforcement. Whatever the underlying reason, this migration does not rely
-- on suspending enforcement at all.
--
-- Instead: back up every row a rebuild of `accounts` would otherwise touch, let the cascade run
-- (safe, because everything is already saved), rebuild `accounts`, then restore every dependent
-- row from its backup and drop the backups. One more wrinkle surfaced by that same seeded test:
-- the FK action on `processed_stripe_events` is `SET NULL`, i.e. an UPDATE, and
-- `processed_stripe_events_are_append_only` (0003_billing.sql) is an unconditional
-- `BEFORE UPDATE` trigger -- so the instant a `processed_stripe_events` row exists, the cascade's
-- own SET NULL is itself an UPDATE that trigger refuses, and the whole `DROP TABLE accounts`
-- statement fails with SQLITE_CONSTRAINT_TRIGGER before anything is lost (the failed statement
-- rolled back in full; row counts were unchanged after the throw). The fix is to drop that one
-- trigger before the rebuild and recreate it, verbatim, after -- nothing else in this schema has
-- an unconditional BEFORE UPDATE/DELETE trigger an FK action could collide with the same way
-- (checked: none of the other five dependents has a BEFORE DELETE trigger at all, and their FK
-- action is DELETE, not UPDATE).
--
-- Belt to that suspender: as of this migration's authoring, the remote `clueless-creations`
-- database has zero rows in `users`/`accounts`/`memberships` (confirmed with
-- `wrangler d1 execute clueless-creations --remote --command "SELECT count(*) ..."` immediately
-- before this file was written) -- the only sign-in attempt against the deployed Worker failed
-- before any row was written. So even if some detail of the backup-and-restore mechanism below
-- ever behaves differently against real remote D1 than against the Miniflare emulation it was
-- verified against, there is nothing in any of these seven tables for the remote apply to lose.
-- `test/tenant.test.ts` is the test that proves the mechanism itself, against a seeded database,
-- so a future change to this file (or a replay of it against a non-empty database) has something
-- other than an empty remote table to depend on.
--
-- Both core/hosted/test/support/d1.ts and core/app/test/support/d1.ts load every `NNNN_*.sql`
-- file in this directory by filename pattern, so this file is picked up automatically by both
-- test harnesses with no code change to either.

CREATE TABLE _migration_0008_memberships_backup AS SELECT * FROM memberships;
CREATE TABLE _migration_0008_api_keys_backup AS SELECT * FROM api_keys;
CREATE TABLE _migration_0008_sessions_backup AS SELECT * FROM sessions;
CREATE TABLE _migration_0008_subscriptions_backup AS SELECT * FROM subscriptions;
CREATE TABLE _migration_0008_entitlements_backup AS SELECT * FROM entitlements;
CREATE TABLE _migration_0008_processed_stripe_events_backup AS SELECT * FROM processed_stripe_events;
CREATE TABLE _migration_0008_accounts_backup AS SELECT * FROM accounts;

-- The FK action against this table (SET NULL, below) is an UPDATE; this trigger forbids every
-- UPDATE unconditionally. Recreated verbatim, immediately after the rebuild.
DROP TRIGGER processed_stripe_events_are_append_only;

-- Cascades into memberships, api_keys, sessions, subscriptions, entitlements (DELETE) and
-- processed_stripe_events (SET NULL on account_id) -- all backed up above.
DROP TABLE accounts;

-- Same shape as 0001_identity_and_tenancy.sql's accounts table, with stripe_customer_id no
-- longer NOT NULL. The cus_ CHECK now only constrains a non-null value, and the column-level
-- UNIQUE continues to apply only among non-null values -- SQLite's ordinary UNIQUE semantics
-- (NULL is never equal to NULL) already let any number of accounts sit at NULL at once, which is
-- exactly every account between creation and its first Checkout.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  stripe_customer_id TEXT UNIQUE
    CHECK (stripe_customer_id IS NULL
           OR (stripe_customer_id GLOB 'cus_*' AND length(stripe_customer_id) BETWEEN 5 AND 80
               AND stripe_customer_id NOT GLOB '*[^a-zA-Z0-9_]*')),
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  updated_at TEXT NOT NULL CHECK (updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)),
  suspended_at TEXT
    CHECK (suspended_at IS NULL OR suspended_at = strftime('%Y-%m-%dT%H:%M:%fZ', suspended_at))
) STRICT;

INSERT INTO accounts (id, name, stripe_customer_id, created_at, updated_at, suspended_at)
  SELECT id, name, stripe_customer_id, created_at, updated_at, suspended_at FROM _migration_0008_accounts_backup;

DELETE FROM memberships;
INSERT INTO memberships (account_id, user_id, role, status, created_at, updated_at)
  SELECT account_id, user_id, role, status, created_at, updated_at FROM _migration_0008_memberships_backup;

DELETE FROM api_keys;
INSERT INTO api_keys (id, account_id, user_id, sha256_hex, scopes, key_prefix, label, created_at, revoked_at, expires_at, last_used_at)
  SELECT id, account_id, user_id, sha256_hex, scopes, key_prefix, label, created_at, revoked_at, expires_at, last_used_at
    FROM _migration_0008_api_keys_backup;

DELETE FROM sessions;
INSERT INTO sessions (id, user_id, account_id, created_at, expires_at, revoked_at, last_seen_at)
  SELECT id, user_id, account_id, created_at, expires_at, revoked_at, last_seen_at FROM _migration_0008_sessions_backup;

DELETE FROM subscriptions;
INSERT INTO subscriptions (id, account_id, stripe_customer_id, status, price_id, is_gifted, cancel_at_period_end, current_period_end, observed_at, synced_at, past_due_since)
  SELECT id, account_id, stripe_customer_id, status, price_id, is_gifted, cancel_at_period_end, current_period_end, observed_at, synced_at, past_due_since
    FROM _migration_0008_subscriptions_backup;

DELETE FROM entitlements;
INSERT INTO entitlements (account_id, lookup_key, stripe_customer_id, active, source, stripe_event_id, observed_at, synced_at)
  SELECT account_id, lookup_key, stripe_customer_id, active, source, stripe_event_id, observed_at, synced_at
    FROM _migration_0008_entitlements_backup;

DELETE FROM processed_stripe_events;
INSERT INTO processed_stripe_events (id, type, account_id, result, received_at)
  SELECT id, type, account_id, result, received_at FROM _migration_0008_processed_stripe_events_backup;

-- Recreated verbatim from 0003_billing.sql.
CREATE TRIGGER processed_stripe_events_are_append_only
BEFORE UPDATE ON processed_stripe_events
BEGIN
  SELECT RAISE(ABORT, 'processed_stripe_event_is_append_only');
END;

DROP TABLE _migration_0008_memberships_backup;
DROP TABLE _migration_0008_api_keys_backup;
DROP TABLE _migration_0008_sessions_backup;
DROP TABLE _migration_0008_subscriptions_backup;
DROP TABLE _migration_0008_entitlements_backup;
DROP TABLE _migration_0008_processed_stripe_events_backup;
DROP TABLE _migration_0008_accounts_backup;
