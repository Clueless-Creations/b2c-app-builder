-- Migration 0003: billing mirror, entitlements, webhook idempotency.
--
-- Two tables look similar and must not be confused:
--
--   entitlements  IS the access gate. Read it to decide whether a request is allowed.
--   subscriptions is a Stripe mirror kept for audit and support. Never read it to
--                 decide access, and never read `is_gifted` on an authorization path.
--
-- `npm run lint:tenant` fails the build if an authorization path reads is_gifted.

-- Mirror of Stripe Subscription objects. Audit only.
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (id GLOB 'sub_*' AND length(id) BETWEEN 5 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_]*'),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL
    CHECK (stripe_customer_id GLOB 'cus_*' AND length(stripe_customer_id) BETWEEN 5 AND 80
           AND stripe_customer_id NOT GLOB '*[^a-zA-Z0-9_]*'),
  status TEXT NOT NULL CHECK (status IN (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused')),
  price_id TEXT
    CHECK (price_id IS NULL OR (price_id GLOB 'price_*' AND price_id NOT GLOB '*[^a-zA-Z0-9_]*')),

  -- Informational. A 100%-off forever coupon on a real price, so this is derived from
  -- the discount Stripe reports, never written by hand and never consulted for access.
  is_gifted INTEGER NOT NULL DEFAULT 0 CHECK (is_gifted IN (0, 1)),

  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  current_period_end TEXT
    CHECK (current_period_end IS NULL
           OR current_period_end = strftime('%Y-%m-%dT%H:%M:%fZ', current_period_end)),
  -- Stripe's own event time. Used to discard webhooks that arrive out of order.
  observed_at TEXT NOT NULL CHECK (observed_at = strftime('%Y-%m-%dT%H:%M:%fZ', observed_at)),
  -- When this Worker wrote the row. Drives the bounded staleness window.
  synced_at TEXT NOT NULL CHECK (synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', synced_at))
) STRICT;

CREATE INDEX subscriptions_by_account ON subscriptions (account_id, status);

-- The access gate. Every row is Stripe-sourced: `source` has no 'manual' value, so no
-- code path and no operator fix can mint an entitlement that Stripe does not agree with.
CREATE TABLE entitlements (
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  lookup_key TEXT NOT NULL
    CHECK (length(lookup_key) BETWEEN 1 AND 80 AND lookup_key NOT GLOB '*[^a-zA-Z0-9_:-]*'),
  stripe_customer_id TEXT NOT NULL
    CHECK (stripe_customer_id GLOB 'cus_*' AND stripe_customer_id NOT GLOB '*[^a-zA-Z0-9_]*'),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  source TEXT NOT NULL CHECK (source IN ('stripe_webhook', 'stripe_reconciliation')),
  stripe_event_id TEXT
    CHECK (stripe_event_id IS NULL
           OR (stripe_event_id GLOB 'evt_*' AND stripe_event_id NOT GLOB '*[^a-zA-Z0-9_]*')),
  observed_at TEXT NOT NULL CHECK (observed_at = strftime('%Y-%m-%dT%H:%M:%fZ', observed_at)),
  synced_at TEXT NOT NULL CHECK (synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', synced_at)),
  PRIMARY KEY (account_id, lookup_key)
) STRICT;

-- The reconciliation cron scans by staleness across all tenants.
CREATE INDEX entitlements_by_staleness ON entitlements (synced_at);

-- An entitlement must not be reassigned to another tenant.
CREATE TRIGGER entitlements_tenancy_is_immutable
BEFORE UPDATE ON entitlements
WHEN NEW.account_id <> OLD.account_id OR NEW.lookup_key <> OLD.lookup_key
BEGIN
  SELECT RAISE(ABORT, 'entitlement_tenancy_is_immutable');
END;

-- Stripe redelivers. A plain INSERT here is the idempotency check: the second delivery
-- of an event hits the primary key and aborts before any billing state is touched.
CREATE TABLE processed_stripe_events (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (id GLOB 'evt_*' AND length(id) BETWEEN 5 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_]*'),
  type TEXT NOT NULL
    CHECK (length(type) BETWEEN 1 AND 120 AND type NOT GLOB '*[^a-z0-9_.]*'),
  account_id TEXT REFERENCES accounts (id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('applied', 'ignored', 'failed')),
  received_at TEXT NOT NULL CHECK (received_at = strftime('%Y-%m-%dT%H:%M:%fZ', received_at))
) STRICT;

-- A processed event is a fact. Rewriting one would let a replay be re-applied.
CREATE TRIGGER processed_stripe_events_are_append_only
BEFORE UPDATE ON processed_stripe_events
BEGIN
  SELECT RAISE(ABORT, 'processed_stripe_event_is_append_only');
END;

CREATE INDEX processed_stripe_events_by_received_at ON processed_stripe_events (received_at);
