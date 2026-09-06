-- Migration 0006: technical attribution on the interest collector.
--
-- knowledge/data/analytics-attribution.md requires both halves: "Use both technical and
-- self-reported attribution. Neither is enough alone." 0005 shipped the self-reported half
-- only. This adds the technical half, plus the free-text escape hatch for the "other" answer.
--
-- Consolidates core/app/migrations/0002_interest_submissions.sql, which proposed a second
-- interest table in this same database. One table, one migrations directory: the directory
-- named by wrangler.jsonc's migrations_dir is the system of record for this database, and a
-- second numbered set against the same D1 would fight over the d1_migrations ledger.
--
-- ALTER TABLE ADD COLUMN rather than a rebuild. The table is empty in production today, so a
-- rebuild would be safe right now, but a migration has to stay correct the day someone
-- replays it against a populated database.

-- The free-text "other" answer. Deliberately never sent to PostHog: it is unbounded user
-- input that can contain anything pasted, including a credential. D1 is its system of
-- record; analytics receives only a boolean saying whether it was present.
ALTER TABLE interest_signals ADD COLUMN source_other TEXT;

-- First-touch technical attribution, captured alongside the self-reported answer because a
-- visitor's memory and the query string disagree often enough that neither settles it alone.
ALTER TABLE interest_signals ADD COLUMN initial_utm_source TEXT;
ALTER TABLE interest_signals ADD COLUMN initial_utm_medium TEXT;
ALTER TABLE interest_signals ADD COLUMN initial_utm_campaign TEXT;
ALTER TABLE interest_signals ADD COLUMN initial_referrer TEXT;
ALTER TABLE interest_signals ADD COLUMN referral_code TEXT;

-- `acquisition_source` stores the STABLE key (friend, hacker_news, x_twitter, reddit_search,
-- github, ai_search, search, newsletter, podcast, creator, mcp_directory, ad, other), never a
-- display label. Labels get reworded; keys must not.
--
-- That taxonomy is deliberately NOT a CHECK constraint. A CHECK would mean a schema migration
-- every time the product adds an acquisition channel, which is a change that should cost
-- nothing. The enum lives in db/tenant.ts, where a new key is a one-line edit and the
-- validator still rejects an unknown value before it reaches the column.
