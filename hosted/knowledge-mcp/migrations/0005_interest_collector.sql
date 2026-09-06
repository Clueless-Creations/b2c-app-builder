-- Migration 0005: the interest collector.
--
-- v1 ships this where self-serve Checkout will later sit, behind the same feature flag.
-- These rows are the system of record for the waitlist, not a PostHog mirror: PostHog
-- gets a matching event for funnel analysis, but analytics storage is not durable
-- business data and a later Checkout release must be able to convert a signal here
-- without a data migration.
--
-- Not tenant-scoped. A signal usually arrives before any account exists. `account_id`
-- and `user_id` are plain columns, set only when a signed-in visitor submits the form,
-- so a signal is never lost to another table's lifecycle. Reads still route through
-- db/tenant.ts, which is the single module allowed to touch D1 at all.
CREATE TABLE interest_signals (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 80 AND id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  email TEXT NOT NULL
    CHECK (length(email) BETWEEN 3 AND 320 AND email LIKE '%_@_%.%' AND email NOT GLOB '*[ ,;<>]*'),
  -- "Where did you hear about us". Free text from a fixed set of prompts plus 'other'.
  acquisition_source TEXT NOT NULL CHECK (length(acquisition_source) BETWEEN 1 AND 120),
  -- Stated intent. Bounded so one submission cannot dominate a page of results.
  intent TEXT NOT NULL CHECK (length(intent) BETWEEN 1 AND 500),
  account_id TEXT
    CHECK (account_id IS NULL OR (length(account_id) BETWEEN 1 AND 80
           AND account_id NOT GLOB '*[^a-zA-Z0-9_-]*')),
  user_id TEXT
    CHECK (user_id IS NULL OR (length(user_id) BETWEEN 1 AND 80
           AND user_id NOT GLOB '*[^a-zA-Z0-9_-]*')),
  -- Joins the row to the PostHog funnel without re-identifying the visitor here.
  posthog_distinct_id TEXT
    CHECK (posthog_distinct_id IS NULL OR length(posthog_distinct_id) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (created_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  updated_at TEXT NOT NULL CHECK (updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', updated_at)),
  -- Stamped when this signal becomes a paying or gifted account.
  converted_at TEXT
    CHECK (converted_at IS NULL OR converted_at = strftime('%Y-%m-%dT%H:%M:%fZ', converted_at))
) STRICT;

-- One row per address. A resubmission updates intent and source rather than inserting a
-- duplicate, so the table stays a usable waitlist and the count means what it says.
CREATE UNIQUE INDEX interest_signals_by_email ON interest_signals (lower(email));
CREATE INDEX interest_signals_by_created_at ON interest_signals (created_at);
