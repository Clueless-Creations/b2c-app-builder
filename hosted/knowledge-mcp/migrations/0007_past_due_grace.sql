-- Migration 0007: the past_due grace window's dunning stamp.
--
-- core/app/billing/entitlement-policy.ts is the one place that decides how long a `past_due`
-- subscription keeps its entitlement (PAST_DUE_GRACE_MS, seven days). That decision needs a
-- start time to measure from, and Stripe's own Subscription object does not say when a
-- subscription entered `past_due` — so this column is where this Worker records the instant it
-- first observed dunning for a given subscription. `db/tenant.ts`'s `upsertSubscription` stamps
-- it on first entry, preserves it while the subscription stays `past_due`, and clears it on
-- recovery; both the webhook path and the reconciliation sweep read it back through
-- `resolveEntitlement` before deciding access.
--
-- ALTER TABLE ADD COLUMN, matching 0006's own reasoning: `subscriptions` already exists in the
-- deployed database, and a migration has to stay correct the day someone replays it against a
-- populated table, not just against the empty one this repository ships today.

ALTER TABLE subscriptions ADD COLUMN past_due_since TEXT
  CHECK (past_due_since IS NULL OR past_due_since = strftime('%Y-%m-%dT%H:%M:%fZ', past_due_since));

-- The reconciliation sweep's deterministic over-grace scan: every subscription still reported
-- `past_due` whose dunning stamp is older than the window, across every tenant. This is the same
-- "one cross-tenant scan, for the scheduled sweep only" shape `entitlements_by_staleness`
-- (0003_billing.sql) already gives `listStaleEntitlements` — the sweep has no single tenant to
-- scope by, because it has no request behind it at all.
--
-- Partial, not a plain index on the column alone: this scan only ever looks at `past_due` rows,
-- so indexing the other seven statuses' NULL stamps would cost every subscription write for a
-- lookup that would never use them.
CREATE INDEX subscriptions_past_due_by_stamp ON subscriptions (past_due_since)
  WHERE status = 'past_due';
