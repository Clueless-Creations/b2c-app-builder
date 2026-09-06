/**
 * The only module permitted to touch D1 for interest signals.
 *
 * The table is `interest_signals`, owned by hosted/knowledge-mcp/migrations/0005 (plus 0006 for the
 * technical-attribution columns). This repository writes it; it does not define it.
 *
 * D1 has no row-level security, so isolation rests on every query being explicit about scope.
 * The architecture closes that mechanically: a CI lint fails the build on any `env.DB.prepare()`
 * outside a repository module. Keep the prepare() calls here.
 *
 * Note this table is deliberately NOT tenant-scoped. A signal usually arrives before any account
 * exists, so `account_id` is a plain nullable column rather than a foreign key — a waitlist row
 * must not be destroyed by another table's lifecycle.
 */

import type { Intent, SourceKey } from "../analytics/events.js";

export interface InterestSignal {
  readonly email: string;
  /** The stable stored key, never a display label. Labels are derived in code from the key. */
  readonly sourceKey: SourceKey;
  readonly intent: Intent;
  /** Free text from the "other" option. Stays here; never sent to analytics. */
  readonly sourceOther?: string;
  /** Present only when a signed-in visitor submits. Anonymous signals are first-class. */
  readonly accountId?: string;
  readonly userId?: string;
  readonly posthogDistinctId?: string;
  readonly initialUtmSource?: string;
  readonly initialUtmMedium?: string;
  readonly initialUtmCampaign?: string;
  readonly initialReferrer?: string;
  readonly referralCode?: string;
}

export interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
}

/**
 * The narrower read half, kept separate from `D1Like` rather than adding `first()` to it: every
 * existing caller of `D1Like` (the handler's unit tests included) only ever needs `run()`, and
 * widening that interface would force a `first()` stub onto tests that write and never read. The
 * real `D1Database` binding satisfies both shapes at once, so `worker.ts` passes the same `env.DB`
 * to `saveInterestSignal` and `findInterestSignalByAccount` without needing two objects.
 */
export interface D1ReadLike {
  prepare(query: string): {
    bind(...values: unknown[]): { first<T = unknown>(): Promise<T | null> };
  };
}

export interface ExistingInterestSignal {
  /** When this account's row was first written. Never overwritten by a resubmission. */
  readonly submittedAt: string;
}

/**
 * Console-only lookup: "has this account already asked for access?" `interest_signals` has no
 * account-scoped uniqueness (uniqueness is on `lower(email)`, per the repository doc comment
 * above) and no index on `account_id`, which is fine at waitlist scale — this is a console page
 * render, not a hot path. `account_id` here is always the caller's own session id, never a value
 * read from a request body, so this cannot be used to probe another account's submission.
 */
export async function findInterestSignalByAccount(db: D1ReadLike, accountId: string): Promise<ExistingInterestSignal | null> {
  const row = await db
    .prepare(`SELECT created_at FROM interest_signals WHERE account_id = ?1 ORDER BY created_at ASC LIMIT 1`)
    .bind(accountId)
    .first<{ created_at: string }>();
  return row === null ? null : { submittedAt: row.created_at };
}

/**
 * Mirrors `../../knowledge-mcp/db/tenant.ts`'s own `tenantDbFromEnv`, for this file's narrower need: a
 * raw D1 handle for `saveInterestSignal` / `findInterestSignalByAccount`, obtained without
 * `worker.ts` ever writing the literal `env.DB` itself. `check-tenant-isolation.ts` confines that
 * token (and the `D1Database` type) to this file and `test/support/d1.ts` within this package —
 * the same reason `db/tenant.ts` is the only place allowed to write it in `hosted/knowledge-mcp`.
 */
export function interestDbFromEnv(env: { readonly DB?: D1Database | null }): D1Database | null {
  return env.DB === undefined || env.DB === null ? null : env.DB;
}

/**
 * Upsert keyed on the unique index over `lower(email)` — one row per person, so a resubmission
 * updates rather than appending and the waitlist count means what it says.
 *
 * Two COALESCE directions, deliberately opposite, and matched to the writer in
 * hosted/knowledge-mcp/db/tenant.ts — if the two disagree they fight over the same row:
 *   - first-touch attribution is old-over-new, so a resubmission cannot overwrite where the
 *     person originally came from, but a NULL left by an earlier submission can still be
 *     backfilled when the campaign context finally arrives;
 *   - identity (account_id, user_id, posthog_distinct_id) is new-over-old, so a row that started
 *     anonymous can gain an account later, while a later anonymous submission cannot erase an
 *     identity we already learned.
 *
 * created_at is untouched (it is when we first heard from them) and converted_at is owned by the
 * billing path, not by this form.
 */
const UPSERT = `
INSERT INTO interest_signals (
  id, email, acquisition_source, intent, source_other, account_id, user_id, posthog_distinct_id,
  initial_utm_source, initial_utm_medium, initial_utm_campaign, initial_referrer, referral_code,
  created_at, updated_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
ON CONFLICT (lower(email)) DO UPDATE SET
  acquisition_source = excluded.acquisition_source,
  intent = excluded.intent,
  source_other = excluded.source_other,
  account_id = COALESCE(excluded.account_id, interest_signals.account_id),
  user_id = COALESCE(excluded.user_id, interest_signals.user_id),
  posthog_distinct_id = COALESCE(excluded.posthog_distinct_id, interest_signals.posthog_distinct_id),
  initial_utm_source = COALESCE(interest_signals.initial_utm_source, excluded.initial_utm_source),
  initial_utm_medium = COALESCE(interest_signals.initial_utm_medium, excluded.initial_utm_medium),
  initial_utm_campaign = COALESCE(interest_signals.initial_utm_campaign, excluded.initial_utm_campaign),
  initial_referrer = COALESCE(interest_signals.initial_referrer, excluded.initial_referrer),
  referral_code = COALESCE(interest_signals.referral_code, excluded.referral_code),
  updated_at = excluded.updated_at`;

export async function saveInterestSignal(db: D1Like, signal: InterestSignal, now = new Date()): Promise<void> {
  // Matches the migration's CHECK: strftime('%Y-%m-%dT%H:%M:%fZ') is exactly toISOString().
  const timestamp = now.toISOString();
  await db
    .prepare(UPSERT)
    .bind(
      crypto.randomUUID(),
      signal.email,
      signal.sourceKey,
      signal.intent,
      signal.sourceOther ?? null,
      signal.accountId ?? null,
      signal.userId ?? null,
      signal.posthogDistinctId ?? null,
      signal.initialUtmSource ?? null,
      signal.initialUtmMedium ?? null,
      signal.initialUtmCampaign ?? null,
      signal.initialReferrer ?? null,
      signal.referralCode ?? null,
      timestamp,
    )
    .run();
}
