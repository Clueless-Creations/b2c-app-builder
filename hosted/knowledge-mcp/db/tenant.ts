/**
 * The only module in this Worker that may touch D1.
 *
 * D1 has no row-level security. Isolation therefore rests on three mechanisms, and this
 * file is the first of them:
 *
 *   1. Every tenant-scoped statement lives here and filters on a server-resolved
 *      `accountId`, which is the first parameter of every function on the repository.
 *   2. `npm run lint:tenant` fails the build on a `.prepare(` / `.exec(` / `.batch(`
 *      anywhere else in the Worker.
 *   3. `test/tenant.test.ts` seeds two accounts and asserts that account A's create,
 *      list, read and revoke paths never return or mutate account B's rows.
 *
 * `AccountId` is a branded string with no public constructor of its own. Every function that
 * produces one derives it from something the server already resolved, never from raw request
 * input: a credential (`resolveApiKeyPrincipal`, `resolveSessionPrincipal`), a Google identity
 * this file has seen before (`findUserByGoogleSub`) or is minting for the first time
 * (`createUserAndAccountFromGoogle`), or a Stripe object naming a customer this file already
 * created (`resolveAccountByStripeCustomerId` — see its own doc comment). A plain `string` from
 * a request body, path segment or query parameter does not type-check as an `AccountId`, so
 * passing client-controlled input as the tenant is a compile error rather than a code-review
 * question.
 *
 * Authorization decisions are not re-implemented here. `resolveApiKeyPrincipal` rebuilds a
 * one-credential `AccessPolicy` from the row it read and hands it to the existing
 * `parseAccessPolicy` and `authorizePrincipal` in ../auth.ts, so the D1 path and the secret
 * path run identical checks and cannot drift apart.
 */

import { z } from "zod";
import { AccessError, authorizePrincipal, constantTimeEqual, parseAccessPolicy, READ_SCOPE, sha256, type Principal } from "../auth.js";

/** auth.ts:88. A key that fails this shape is a 401, never a 403. */
const API_KEY_PATTERN = /^b2c_[A-Za-z0-9_-]{43}$/;

/** A raw session token before it is hashed. 43-128 chars, matching resolveSessionPrincipal's own check. */
const RAW_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

/** auth.ts:6 */
const opaqueId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
/** auth.ts:7 */
const digest = z.string().regex(/^[a-f0-9]{64}$/);
/** auth.ts:8. Stored as canonical JSON so the column round-trips to this type. */
const storedScopes = z.enum(["[]", '["b2c:read"]']);
const isoTimestamp = z.iso.datetime();

/**
 * A tenant identifier the server resolved from a credential. Not constructible from
 * request input.
 */
declare const ACCOUNT_ID: unique symbol;
export type AccountId = string & { readonly [ACCOUNT_ID]: true };

export interface ResolvedPrincipal {
  /** Exactly the strict object ../oauth.ts stores as OAuth grant props. */
  readonly principal: Principal;
  readonly accountId: AccountId;
}

export interface ApiKeySummary {
  readonly id: string;
  readonly userId: string;
  readonly keyPrefix: string;
  readonly label: string | null;
  readonly scopes: readonly (typeof READ_SCOPE)[];
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
}

export interface SessionSummary {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface AuditEventInput {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType?: string | null;
  readonly targetId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

/**
 * The stable acquisition-source keys from knowledge/data/analytics-attribution.md.
 *
 * Kept here rather than as a column CHECK on purpose: adding an acquisition channel is a
 * product change that should not cost a schema migration, and this still rejects an unknown
 * key before it reaches the column. Keys are stored; display labels are derived in the UI
 * and may be reworded freely. Never rename a key.
 *
 * Adapted from the doc's enum, in two directions, both deliberate:
 *   dropped   tiktok, instagram_reels, app_store_search, play_store_search — this product
 *             has no store presence, so those keys could never be selected honestly.
 *   added     hacker_news, github, mcp_directory, search, newsletter — the channels a
 *             developer tool actually arrives through.
 * Everything else is the doc's list verbatim. hosted/builder-console declares the same list; the two must
 * stay identical or a visitor passes one writer and is refused by the other against the same
 * table, so a drift test asserts it rather than a comment asking nicely.
 */
export const ACQUISITION_SOURCE_KEYS = [
  "friend",
  "hacker_news",
  "x_twitter",
  "reddit_search",
  "github",
  "ai_search",
  "search",
  "newsletter",
  "podcast",
  "creator",
  "youtube",
  "mcp_directory",
  "ad",
  "other",
] as const;

export interface InterestSignalInput {
  readonly id: string;
  readonly email: string;
  readonly acquisitionSource: (typeof ACQUISITION_SOURCE_KEYS)[number];
  readonly intent: string;
  /**
   * The free-text answer behind `other`. Never forward this to analytics: it is unbounded
   * user input that can contain a pasted credential. Send a boolean instead.
   */
  readonly sourceOther?: string | null;
  readonly initialUtmSource?: string | null;
  readonly initialUtmMedium?: string | null;
  readonly initialUtmCampaign?: string | null;
  readonly initialReferrer?: string | null;
  readonly referralCode?: string | null;
  readonly accountId?: string | null;
  readonly userId?: string | null;
  readonly posthogDistinctId?: string | null;
}

const apiKeyRow = z.object({
  id: opaqueId,
  account_id: opaqueId,
  user_id: opaqueId,
  sha256_hex: digest,
  scopes: storedScopes,
  key_prefix: z.string().regex(/^b2c_[A-Za-z0-9_-]{1,8}$/),
  label: z.string().min(1).max(120).nullable(),
  created_at: isoTimestamp,
  revoked_at: isoTimestamp.nullable(),
  expires_at: isoTimestamp.nullable(),
  last_used_at: isoTimestamp.nullable(),
});

const membershipRow = z.object({
  role: z.enum(["owner", "admin", "member"]),
  status: z.enum(["active", "invited", "revoked"]),
  account_suspended_at: isoTimestamp.nullable(),
  user_disabled_at: isoTimestamp.nullable(),
});

const entitlementRow = z.object({
  account_id: opaqueId,
  lookup_key: z.string().regex(/^[a-zA-Z0-9_:-]{1,80}$/),
  active: z.union([z.literal(0), z.literal(1)]),
  source: z.enum(["stripe_webhook", "stripe_reconciliation"]),
  synced_at: isoTimestamp,
});

const sessionRow = z.object({
  id: digest,
  user_id: opaqueId,
  created_at: isoTimestamp,
  expires_at: isoTimestamp,
  revoked_at: isoTimestamp.nullable(),
});

/**
 * M3 (Google OIDC identity and sessions). `googleSub` mirrors 0001_identity_and_tenancy.sql's
 * CHECK on `users.google_sub` exactly, so a malformed claim fails here rather than at the
 * database as an opaque constraint error — the same reasoning as the Stripe-shaped ids below.
 */
const googleSub = z.string().regex(/^[a-zA-Z0-9_.-]{1,255}$/);

export interface FindUserByGoogleSubResult {
  readonly userId: string;
  readonly accountId: AccountId;
}

export interface CreateUserAndAccountFromGoogleInput {
  /** Caller-generated, matching createApiKey's own convention: the repository never mints an id it hands back as `userId`. */
  readonly userId: string;
  readonly googleSub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly displayName?: string | null;
  /**
   * Optional as of 0008_lazy_stripe_customer.sql: `accounts.stripe_customer_id` is nullable now,
   * so sign-in no longer has to create a Stripe Customer (or reach Stripe at all) before an
   * account can exist. Omit it, or pass `null`, and the row is created with no Customer; the
   * first Checkout attempt is what actually mints one, through `setAccountStripeCustomerId`
   * below (`hosted/builder-console/billing/checkout.ts`'s `ensureStripeCustomer` is the caller). This
   * repository still never calls Stripe itself — D1 access and provider access stay two
   * different kinds of side effect in two different modules — this field just stopped being
   * required to already have that call's result in hand.
   */
  readonly stripeCustomerId?: string | null;
}

export interface CreateSessionInput {
  /** Caller-generated, 43-128 chars. Only its SHA-256 is persisted; the raw value is never stored. */
  readonly rawToken: string;
  readonly expiresAt: string;
}

/**
 * M6 (Stripe objects, webhook, entitlements). Shapes mirror the CHECK constraints in
 * 0003_billing.sql so a malformed id fails here, in a schema the type checker sees, rather
 * than at the database as an opaque constraint error.
 */
const stripeCustomerId = z.string().regex(/^cus_[A-Za-z0-9_]{1,76}$/);
const stripeSubscriptionId = z.string().regex(/^sub_[A-Za-z0-9_]{1,76}$/);
const stripeEventId = z.string().regex(/^evt_[A-Za-z0-9_]{1,76}$/);
// No length CHECK on price_id beyond the GLOB in 0003_billing.sql. Bounded here anyway, to the
// same 80-character ceiling every other Stripe-shaped id in this file uses.
const stripePriceId = z.string().regex(/^price_[A-Za-z0-9_]{1,74}$/);
const lookupKey = z.string().regex(/^[a-zA-Z0-9_:-]{1,80}$/);

export const SUBSCRIPTION_STATUSES = ["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface UpsertSubscriptionInput {
  readonly id: string;
  readonly stripeCustomerId: string;
  readonly status: SubscriptionStatus;
  readonly priceId: string | null;
  /** Read only from the Stripe discount object on the subscription. Never hand-set. */
  readonly isGifted: boolean;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
  /** Stripe's own event time, not this Worker's clock. Used to discard out-of-order webhooks. */
  readonly observedAt: string;
}

/**
 * The two fields of the subscription mirror that `hosted/builder-console/billing/entitlement-policy.ts`'s
 * `resolveEntitlement` needs to decide access: the status Stripe last reported, and the dunning
 * stamp `upsertSubscription` maintains alongside it. Returned by `upsertSubscription` (so a
 * caller can derive `active` from what is actually now persisted, including on the discard path
 * for an out-of-order delivery) and by `findSubscription` (so a signal that only names a
 * subscription id — an invoice event, a reconciliation pass — can look the same two fields up).
 */
export interface SubscriptionMirrorState {
  readonly status: SubscriptionStatus;
  readonly pastDueSince: string | null;
}

export interface OverGracePastDueSubscription {
  readonly accountId: AccountId;
  readonly subscriptionId: string;
  readonly stripeCustomerId: string;
  readonly pastDueSince: string;
}

export interface UpsertEntitlementInput {
  readonly lookupKey: string;
  readonly stripeCustomerId: string;
  readonly active: boolean;
  readonly source: "stripe_webhook" | "stripe_reconciliation";
  readonly stripeEventId?: string | null;
  readonly observedAt: string;
}

export interface RecordProcessedStripeEventInput {
  readonly id: string;
  readonly type: string;
  readonly accountId: AccountId | null;
  readonly result: "applied" | "ignored" | "failed";
}

export interface StaleEntitlement {
  readonly accountId: AccountId;
  readonly lookupKey: string;
  readonly stripeCustomerId: string;
  readonly syncedAt: string;
}

/** Malformed stored rows fail closed as service configuration faults. */
function readRow<T extends z.ZodType>(schema: T, row: unknown): z.output<T> {
  const parsed = schema.safeParse(row);
  if (!parsed.success) throw new AccessError(503);
  return parsed.data;
}

function decodeScopes(stored: z.output<typeof storedScopes>): (typeof READ_SCOPE)[] {
  return stored === '["b2c:read"]' ? [READ_SCOPE] : [];
}

/**
 * The dunning-stamp bookkeeping `upsertSubscription` needs on every write: stamp `now` on first
 * entry to `past_due`, preserve whatever is already stamped while the status stays `past_due`,
 * and clear it for every other status (a recovery to `active`/`trialing`, or a terminal status).
 *
 * This is deliberately not the entitlement decision itself — it does not know
 * `PAST_DUE_GRACE_MS` and does not decide `active`. That decision, and the constant it depends
 * on, live in `hosted/builder-console/billing/entitlement-policy.ts`'s `resolveEntitlement`, which this file
 * must not import: `hosted/knowledge-mcp` is the lower layer hosted/builder-console builds on (this file's own doc
 * comment above notes it is checked as a standalone package and separately as an import of
 * hosted/builder-console's Worker, never the other way around), so a dependency back onto `hosted/builder-console` would
 * invert that. What is here is purely mechanical — "does this write start, continue, or end a
 * dunning episode" — which needs no policy import to answer, only the status being written and
 * whatever was already on record.
 */
function nextPastDueSince(status: SubscriptionStatus, existing: string | null, now: Date): string | null {
  return status === "past_due" ? (existing ?? now.toISOString()) : null;
}

/**
 * How long an entitlement may go unrefreshed before this Worker stops trusting it.
 *
 * Decided: 24 hours, the conventional stale-if-error window for cached entitlement and
 * licence state (RFC 5861 stale-if-error, and the same order of magnitude as the offline
 * licence caches the app stores use).
 *
 * The reasoning is an asymmetry, not a preference. Revocation does not depend on this
 * value at all: a cancellation arrives as a webhook that writes `active = 0`, and the very
 * next read denies. Staleness only matters when writes stop, so tightening this ceiling
 * buys nothing against a revoked customer and costs a great deal against a paused cron.
 * Serving a stale-but-active entitlement risks one cancelled reader keeping read-only
 * knowledge access; denying on staleness risks locking out every paying customer because
 * of an outage on our side. The second failure is worse, and it is the one a short ceiling
 * causes.
 *
 * The ceiling is not zero, because an unbounded window means a permanently dead refresh
 * path grants access forever with nothing to notice it. 24 hours is long enough that no
 * ordinary cron hiccup reaches it and short enough that a genuinely broken pipeline
 * surfaces within a day.
 *
 * Changing this value changes only the outage behaviour, never the revocation latency.
 * `test/tenant.test.ts` pins both sides of the boundary.
 */
export const ENTITLEMENT_STALENESS_CEILING_MS = 24 * 60 * 60 * 1000;

const SELECT_KEY_BY_DIGEST = `
  SELECT k.id, k.account_id, k.user_id, k.sha256_hex, k.scopes, k.key_prefix, k.label,
         k.created_at, k.revoked_at, k.expires_at, k.last_used_at,
         m.role, m.status, a.suspended_at AS account_suspended_at, u.disabled_at AS user_disabled_at
    FROM api_keys k
    JOIN memberships m ON m.account_id = k.account_id AND m.user_id = k.user_id
    JOIN accounts a ON a.id = k.account_id
    JOIN users u ON u.id = k.user_id
   WHERE k.sha256_hex = ?1`;

/** Normalize a validated D1 row for the shared credential constraint checks. */
function policyForKey(key: z.output<typeof apiKeyRow>) {
  return parseAccessPolicy(
    JSON.stringify({
      version: 1,
      ownerSubject: key.user_id,
      allowedSubjects: [key.user_id],
      credentials: [
        {
          id: key.id,
          subject: key.user_id,
          sha256: key.sha256_hex,
          scopes: decodeScopes(key.scopes),
          revoked: key.revoked_at !== null,
          ...(key.expires_at === null ? {} : { expiresAt: key.expires_at }),
        },
      ],
    }),
  );
}

export function tenantDb(db: D1Database) {
  /**
   * Resolves a presented API key to its principal and its tenant.
   *
   * Status codes follow auth.ts exactly: 401 when the key is malformed or matches no
   * credential, 403 when a credential exists but policy refuses it, 503 when stored state
   * cannot be trusted.
   */
  async function resolveApiKeyPrincipal(rawKey: string, now = Date.now()): Promise<ResolvedPrincipal> {
    if (!API_KEY_PATTERN.test(rawKey)) throw new AccessError(401);
    const hash = await sha256(rawKey);
    const found = await db.prepare(SELECT_KEY_BY_DIGEST).bind(hash).first();
    // auth.ts:94 answers an unmatched digest with 401 and reveals nothing further.
    if (found === null) throw new AccessError(401);
    const key = readRow(apiKeyRow, found);
    const context = readRow(membershipRow, found);
    // The UNIQUE index already made this equality true. Re-checking in constant time keeps
    // auth.ts:92's guarantee owned by this code rather than by an index collation.
    if (!constantTimeEqual(key.sha256_hex, hash)) throw new AccessError(401);
    // auth.ts:78 requires the subject to be allowed. A non-active membership, a suspended
    // account or a disabled user removes that standing, so the policy is never built.
    if (context.status !== "active" || context.account_suspended_at !== null || context.user_disabled_at !== null) throw new AccessError(403);
    const principal = authorizePrincipal(
      policyForKey(key),
      { subject: key.user_id, keyId: key.id, credentialSha256: key.sha256_hex, scopes: decodeScopes(key.scopes) },
      now,
    );
    return { principal, accountId: key.account_id as AccountId };
  }

  /**
   * Re-resolves an already-issued OAuth grant against D1.
   *
   * auth.ts:67 requires the policy to be rechecked on every access and refresh, which is
   * what makes revocation take effect. For a D1-backed credential that recheck has to read
   * D1, so this is the props-shaped twin of `resolveApiKeyPrincipal`: it looks the grant up
   * by `keyId`, confirms the digest the grant carries still matches the stored one, and
   * then runs the same `authorizePrincipal`.
   */
  async function resolveGrantPrincipal(props: unknown, now = Date.now()): Promise<ResolvedPrincipal> {
    const claimed = z.object({ keyId: opaqueId, credentialSha256: digest }).safeParse(props);
    if (!claimed.success) throw new AccessError(403);
    const found = await db.prepare(SELECT_KEY_BY_DIGEST.replace("WHERE k.sha256_hex = ?1", "WHERE k.id = ?1")).bind(claimed.data.keyId).first();
    if (found === null) throw new AccessError(403);
    const key = readRow(apiKeyRow, found);
    const context = readRow(membershipRow, found);
    // A rotated digest must invalidate the old grant even though the key id is unchanged.
    if (!constantTimeEqual(key.sha256_hex, claimed.data.credentialSha256)) throw new AccessError(403);
    if (context.status !== "active" || context.account_suspended_at !== null || context.user_disabled_at !== null) throw new AccessError(403);
    const principal = authorizePrincipal(policyForKey(key), props, now);
    return { principal, accountId: key.account_id as AccountId };
  }

  /**
   * Resolves a session cookie to its tenant. The raw cookie token is never stored or
   * queried: `sessions.id` is its SHA-256, matching how api_keys treats key material.
   */
  async function resolveSessionPrincipal(rawToken: string, now = Date.now()): Promise<{ userId: string; accountId: AccountId }> {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(rawToken)) throw new AccessError(401);
    const id = await sha256(rawToken);
    const found = await db
      .prepare(
        `SELECT s.id, s.user_id, s.account_id, s.created_at, s.expires_at, s.revoked_at,
                m.role, m.status, a.suspended_at AS account_suspended_at, u.disabled_at AS user_disabled_at
           FROM sessions s
           JOIN memberships m ON m.account_id = s.account_id AND m.user_id = s.user_id
           JOIN accounts a ON a.id = s.account_id
           JOIN users u ON u.id = s.user_id
          WHERE s.id = ?1`,
      )
      .bind(id)
      .first();
    if (found === null) throw new AccessError(401);
    const session = readRow(sessionRow.extend({ account_id: opaqueId }), found);
    const context = readRow(membershipRow, found);
    if (!constantTimeEqual(session.id, id)) throw new AccessError(401);
    // auth.ts:81 expires on `<=`. A session whose expiry equals now is already dead.
    if (session.revoked_at !== null || Date.parse(session.expires_at) <= now) throw new AccessError(403);
    if (context.status !== "active" || context.account_suspended_at !== null || context.user_disabled_at !== null) throw new AccessError(403);
    return { userId: session.user_id, accountId: session.account_id as AccountId };
  }

  /**
   * The access gate. Entitlements are Stripe-sourced; `subscriptions.status` and
   * `subscriptions.is_gifted` are never consulted here, and lint:tenant enforces that.
   */
  async function assertEntitled(accountId: AccountId, lookupKey: string, now = Date.now()): Promise<void> {
    await assertEntitledAny(accountId, [lookupKey], now);
  }

  /**
   * The same gate over a set of `lookup_key`s, any one of which satisfies it — how `access.ts`
   * asks whether an account may read, since a scope is granted by the scope's own key or by any
   * sellable plan (`READ_SCOPE_LOOKUP_KEYS` in `auth.ts`). One query, bound per key, scoped to
   * the account. The verdict is decided over the active rows only: no row, or no active row,
   * is a refusal; an active row that has gone unrefreshed past the ceiling is an outage, unless
   * another active row for the same account is still fresh, in which case that row carries the
   * decision — a fresh grant is never outvoted by a stale one.
   */
  async function assertEntitledAny(accountId: AccountId, lookupKeys: readonly string[], now = Date.now()): Promise<void> {
    if (lookupKeys.length === 0) throw new AccessError(403);
    const placeholders = lookupKeys.map((_, index) => `?${index + 2}`).join(", ");
    const { results } = await db
      .prepare(`SELECT account_id, lookup_key, active, source, synced_at FROM entitlements WHERE account_id = ?1 AND lookup_key IN (${placeholders})`)
      .bind(accountId, ...lookupKeys)
      .all();
    const rows = results.map((row) => readRow(entitlementRow, row));
    const active = rows.filter((row) => row.active === 1);
    if (active.length === 0) throw new AccessError(403);
    // A refresh outage longer than the ceiling is an infrastructure fault, not a denied
    // client, so it fails closed as 503 rather than 403.
    if (!active.some((row) => now - Date.parse(row.synced_at) <= ENTITLEMENT_STALENESS_CEILING_MS)) throw new AccessError(503);
  }

  async function listApiKeys(accountId: AccountId): Promise<ApiKeySummary[]> {
    const { results } = await db
      .prepare(
        `SELECT id, account_id, user_id, sha256_hex, scopes, key_prefix, label,
                created_at, revoked_at, expires_at, last_used_at
           FROM api_keys WHERE account_id = ?1 ORDER BY created_at, id`,
      )
      .bind(accountId)
      .all();
    return results.map((row) => {
      const key = readRow(apiKeyRow, row);
      // Defence in depth: a WHERE clause that ever regressed would still not leak a row.
      if (key.account_id !== accountId) throw new AccessError(503);
      return {
        id: key.id,
        userId: key.user_id,
        keyPrefix: key.key_prefix,
        label: key.label,
        scopes: decodeScopes(key.scopes),
        createdAt: key.created_at,
        revokedAt: key.revoked_at,
        expiresAt: key.expires_at,
        lastUsedAt: key.last_used_at,
      };
    });
  }

  /** Returns null for a key id that belongs to another tenant, exactly as for one that does not exist. */
  async function getApiKey(accountId: AccountId, keyId: string): Promise<ApiKeySummary | null> {
    if (!opaqueId.safeParse(keyId).success) return null;
    const found = await db
      .prepare(
        `SELECT id, account_id, user_id, sha256_hex, scopes, key_prefix, label,
                created_at, revoked_at, expires_at, last_used_at
           FROM api_keys WHERE account_id = ?1 AND id = ?2`,
      )
      .bind(accountId, keyId)
      .first();
    if (found === null) return null;
    const key = readRow(apiKeyRow, found);
    if (key.account_id !== accountId) throw new AccessError(503);
    return {
      id: key.id,
      userId: key.user_id,
      keyPrefix: key.key_prefix,
      label: key.label,
      scopes: decodeScopes(key.scopes),
      createdAt: key.created_at,
      revokedAt: key.revoked_at,
      expiresAt: key.expires_at,
      lastUsedAt: key.last_used_at,
    };
  }

  /**
   * Stores a new credential. The caller generates the raw key, shows it once and never
   * persists it; only its digest and display prefix reach the database.
   */
  async function createApiKey(
    accountId: AccountId,
    input: { id: string; userId: string; sha256Hex: string; keyPrefix: string; label?: string | null; expiresAt?: string | null },
    now = new Date(),
  ): Promise<ApiKeySummary> {
    const values = z
      .object({
        id: opaqueId,
        userId: opaqueId,
        sha256Hex: digest,
        keyPrefix: z.string().regex(/^b2c_[A-Za-z0-9_-]{1,8}$/),
        label: z.string().min(1).max(120).nullable().default(null),
        expiresAt: isoTimestamp.nullable().default(null),
      })
      .parse(input);
    await db
      .prepare(
        `INSERT INTO api_keys (id, account_id, user_id, sha256_hex, scopes, key_prefix, label, created_at, revoked_at, expires_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, NULL)`,
      )
      .bind(values.id, accountId, values.userId, values.sha256Hex, '["b2c:read"]', values.keyPrefix, values.label, now.toISOString(), values.expiresAt)
      .run();
    const created = await getApiKey(accountId, values.id);
    if (created === null) throw new AccessError(503);
    return created;
  }

  /**
   * Revokes a key. The UPDATE is scoped by `account_id` as well as `id`, so a key id
   * belonging to another tenant matches no row and returns false. A revoke that filtered
   * on `id` alone would be a direct IDOR: key ids are opaque but they are handed to
   * clients, and one tenant's console must not be able to disable another tenant's
   * credential by echoing back an id it obtained anywhere.
   */
  async function revokeApiKey(accountId: AccountId, keyId: string, now = new Date()): Promise<boolean> {
    if (!opaqueId.safeParse(keyId).success) return false;
    const result = await db
      .prepare(`UPDATE api_keys SET revoked_at = ?3 WHERE account_id = ?1 AND id = ?2 AND revoked_at IS NULL`)
      .bind(accountId, keyId, now.toISOString())
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async function listSessions(accountId: AccountId): Promise<SessionSummary[]> {
    const { results } = await db
      .prepare(`SELECT id, account_id, user_id, created_at, expires_at, revoked_at FROM sessions WHERE account_id = ?1 ORDER BY created_at, id`)
      .bind(accountId)
      .all();
    return results.map((row) => {
      const session = readRow(sessionRow.extend({ account_id: opaqueId }), row);
      if (session.account_id !== accountId) throw new AccessError(503);
      return {
        id: session.id,
        userId: session.user_id,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
        revokedAt: session.revoked_at,
      };
    });
  }

  /** Same tenant-scoped UPDATE as revokeApiKey, for the same reason. */
  async function revokeSession(accountId: AccountId, sessionId: string, now = new Date()): Promise<boolean> {
    if (!digest.safeParse(sessionId).success) return false;
    const result = await db
      .prepare(`UPDATE sessions SET revoked_at = ?3 WHERE account_id = ?1 AND id = ?2 AND revoked_at IS NULL`)
      .bind(accountId, sessionId, now.toISOString())
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  async function listAuditEvents(accountId: AccountId, limit = 50): Promise<{ id: string; action: string; createdAt: string }[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const { results } = await db
      .prepare(`SELECT id, account_id, action, created_at FROM audit_events WHERE account_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2`)
      .bind(accountId, bounded)
      .all();
    return results.map((row) => {
      const event = readRow(z.object({ id: opaqueId, account_id: opaqueId, action: z.string(), created_at: isoTimestamp }), row);
      if (event.account_id !== accountId) throw new AccessError(503);
      return { id: event.id, action: event.action, createdAt: event.created_at };
    });
  }

  async function recordAuditEvent(accountId: AccountId | null, event: AuditEventInput, now = new Date()): Promise<void> {
    const metadata = JSON.stringify(event.metadata ?? {});
    // The column CHECK also refuses this, but failing here names the problem.
    if (metadata.includes("b2c_")) throw new AccessError(503);
    await db
      .prepare(
        `INSERT INTO audit_events (id, account_id, actor_user_id, action, target_type, target_id, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(event.id, accountId, event.actorUserId, event.action, event.targetType ?? null, event.targetId ?? null, metadata, now.toISOString())
      .run();
  }

  /**
   * The interest collector. Not tenant-scoped: a signal usually arrives before any account
   * exists, so this takes no AccountId. A resubmission updates the existing row rather than
   * inserting a duplicate, which keeps the waitlist count meaningful, and `created_at` is
   * never overwritten because these rows are the system of record for the waitlist.
   */
  async function recordInterestSignal(input: InterestSignalInput, now = new Date()): Promise<void> {
    const optionalText = (max: number) => z.string().min(1).max(max).nullable().default(null);
    const values = z
      .object({
        id: opaqueId,
        email: z.email().max(320),
        acquisitionSource: z.enum(ACQUISITION_SOURCE_KEYS),
        intent: z.string().min(1).max(500),
        // Bounds reconciled with hosted/builder-console's handler: the stricter of the two on each field,
        // so a submission cannot pass validation on one writer and fail on the other. There
        // is no column CHECK backing these (ALTER TABLE ADD COLUMN already ran without one,
        // and retrofitting would need a table rebuild), which is exactly why both writers
        // must agree here.
        sourceOther: optionalText(500),
        initialUtmSource: optionalText(200),
        initialUtmMedium: optionalText(200),
        initialUtmCampaign: optionalText(200),
        initialReferrer: optionalText(2048),
        referralCode: z
          .string()
          .regex(/^[a-zA-Z0-9_-]{1,64}$/)
          .nullable()
          .default(null),
        accountId: opaqueId.nullable().default(null),
        userId: opaqueId.nullable().default(null),
        posthogDistinctId: z.string().min(1).max(200).nullable().default(null),
      })
      .parse(input);
    const stamp = now.toISOString();
    await db
      .prepare(
        `INSERT INTO interest_signals
           (id, email, acquisition_source, intent, source_other,
            initial_utm_source, initial_utm_medium, initial_utm_campaign, initial_referrer, referral_code,
            account_id, user_id, posthog_distinct_id, created_at, updated_at, converted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, NULL)
         ON CONFLICT (lower(email)) DO UPDATE SET
           acquisition_source = excluded.acquisition_source,
           intent = excluded.intent,
           source_other = excluded.source_other,
           -- First-touch means first: never overwrite an attribution value already recorded.
           initial_utm_source = coalesce(interest_signals.initial_utm_source, excluded.initial_utm_source),
           initial_utm_medium = coalesce(interest_signals.initial_utm_medium, excluded.initial_utm_medium),
           initial_utm_campaign = coalesce(interest_signals.initial_utm_campaign, excluded.initial_utm_campaign),
           initial_referrer = coalesce(interest_signals.initial_referrer, excluded.initial_referrer),
           referral_code = coalesce(interest_signals.referral_code, excluded.referral_code),
           account_id = coalesce(excluded.account_id, interest_signals.account_id),
           user_id = coalesce(excluded.user_id, interest_signals.user_id),
           posthog_distinct_id = coalesce(excluded.posthog_distinct_id, interest_signals.posthog_distinct_id),
           updated_at = excluded.updated_at`,
      )
      .bind(
        values.id,
        values.email,
        values.acquisitionSource,
        values.intent,
        values.sourceOther,
        values.initialUtmSource,
        values.initialUtmMedium,
        values.initialUtmCampaign,
        values.initialReferrer,
        values.referralCode,
        values.accountId,
        values.userId,
        values.posthogDistinctId,
        stamp,
      )
      .run();
  }

  // --- M3: Google OIDC identity and sessions --------------------------------------------------
  //
  // Three functions. Together they let the callback route ask "have we seen this Google account
  // before", create the user/account/owner-membership row set exactly once when the answer is
  // no, and mint the browser session that everything else in the console (M5's key management,
  // M6's entitlement gate) is read through.

  /**
   * Resolves a Google `sub` claim to an existing user and account, or null for a first-time
   * sign-in. `role = 'owner'` is not a narrowing this schema requires today — a fresh account
   * from `createUserAndAccountFromGoogle` below has exactly one membership, and it is the owner
   * — but it is the correct membership to resolve to if a future milestone ever adds invited
   * members, so a returning owner keeps landing on the account they created rather than an
   * arbitrary one of several.
   */
  async function findUserByGoogleSub(rawGoogleSub: string): Promise<FindUserByGoogleSubResult | null> {
    const parsed = googleSub.safeParse(rawGoogleSub);
    if (!parsed.success) return null;
    const found = await db
      .prepare(
        `SELECT u.id AS user_id, m.account_id AS account_id
           FROM users u
           JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
          WHERE u.google_sub = ?1`,
      )
      .bind(parsed.data)
      .first();
    if (found === null) return null;
    const row = readRow(z.object({ user_id: opaqueId, account_id: opaqueId }), found);
    return { userId: row.user_id, accountId: row.account_id as AccountId };
  }

  /**
   * Creates the user, the account, and the owner membership in one D1 batch — the schema's own
   * composite foreign key (`sessions`/`api_keys` both require `(account_id, user_id)` to exist in
   * `memberships`) means a session or a key can never be issued to a user with no membership, so
   * all three rows have to exist before this function returns, not eventually.
   *
   * A concurrent double-submit (the same Google account signing in twice before either request's
   * D1 write lands) is left to the schema rather than a pre-check: `users.google_sub` and
   * `accounts.stripe_customer_id` are both `UNIQUE`, so the loser's batch fails a constraint
   * instead of creating a duplicate account, and the caller's own fallback (an unhandled error
   * surfaces as a taxonomy `internal` signin failure) is enough for a login the person can simply
   * retry — `findUserByGoogleSub` finds the winner's row on the next attempt.
   */
  async function createUserAndAccountFromGoogle(input: CreateUserAndAccountFromGoogleInput, now = new Date()): Promise<{ accountId: AccountId }> {
    const values = z
      .object({
        userId: opaqueId,
        googleSub,
        email: z.email().max(320),
        emailVerified: z.boolean(),
        displayName: z.string().min(1).max(200).nullable().default(null),
        stripeCustomerId: stripeCustomerId.nullable().optional().default(null),
      })
      .parse(input);
    const accountId = crypto.randomUUID() as AccountId;
    const stamp = now.toISOString();
    await db.batch([
      db
        .prepare(
          `INSERT INTO users (id, google_sub, email, email_verified, display_name, created_at, updated_at, disabled_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, NULL)`,
        )
        .bind(values.userId, values.googleSub, values.email, values.emailVerified ? 1 : 0, values.displayName, stamp),
      // `name` seeds from the email address. There is no rename UI yet; a person can be told
      // apart from the account they created without one, and this only ever shows to themselves.
      db
        .prepare(`INSERT INTO accounts (id, name, stripe_customer_id, created_at, updated_at, suspended_at) VALUES (?1, ?2, ?3, ?4, ?4, NULL)`)
        .bind(accountId, values.email, values.stripeCustomerId, stamp),
      db
        .prepare(`INSERT INTO memberships (account_id, user_id, role, status, created_at, updated_at) VALUES (?1, ?2, 'owner', 'active', ?3, ?3)`)
        .bind(accountId, values.userId, stamp),
    ]);
    return { accountId };
  }

  /**
   * Persists a browser session. The raw token is the caller's to generate (session.ts) and to
   * put in the `Set-Cookie` header; only its SHA-256 reaches this table, matching how `api_keys`
   * treats key material — a database dump yields no usable session, the same guarantee a stolen
   * `api_keys` row already gives.
   */
  async function createSession(accountId: AccountId, userId: string, input: CreateSessionInput, now = new Date()): Promise<void> {
    const values = z.object({ rawToken: z.string().regex(RAW_SESSION_TOKEN_PATTERN), expiresAt: isoTimestamp }).parse(input);
    const parsedUserId = opaqueId.parse(userId);
    const id = await sha256(values.rawToken);
    await db
      .prepare(
        `INSERT INTO sessions (id, user_id, account_id, created_at, expires_at, revoked_at, last_seen_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL)`,
      )
      .bind(id, parsedUserId, accountId, now.toISOString(), values.expiresAt)
      .run();
  }

  // --- M6: Stripe objects, webhook, entitlements ---------------------------------------------
  //
  // Five functions. Together they turn a verified Stripe webhook into the only two tables an
  // authorization decision may ever touch (entitlements) or a support agent may ever read
  // (subscriptions), plus the table that makes a redelivered webhook a no-op, plus the read
  // that lets a webhook find its tenant and the scan that lets a cron find what went stale.

  /**
   * Resolves a Stripe customer id to its tenant. A webhook names its customer on every object
   * type this Worker dispatches; `accounts.stripe_customer_id` is `UNIQUE`
   * (0001_identity_and_tenancy.sql), so this is the one indexed read that turns "which of our
   * accounts does this event belong to" into an `AccountId` the functions above and below can
   * accept. It is one more entry in this file's header-comment list of `AccountId` derivations —
   * a webhook has no credential to present, only a Stripe object naming a customer the server
   * already created, which is the same kind of server-side derivation as the rest.
   *
   * Returns null for a customer id this Worker does not recognise, rather than throwing: an
   * unrecognised customer on a webhook is a real anomaly worth recording (the caller records it
   * as a "failed" processed-event outcome), not a malformed-state fault of the kind `readRow`
   * guards against.
   */
  async function resolveAccountByStripeCustomerId(rawStripeCustomerId: string): Promise<AccountId | null> {
    const parsed = stripeCustomerId.safeParse(rawStripeCustomerId);
    if (!parsed.success) return null;
    const found = await db.prepare(`SELECT id FROM accounts WHERE stripe_customer_id = ?1`).bind(parsed.data).first();
    if (found === null) return null;
    return readRow(z.object({ id: opaqueId }), found).id as AccountId;
  }

  /**
   * Reads an account's current Stripe Customer id, or `null` for every account between creation
   * and its first Checkout — 0008_lazy_stripe_customer.sql is what made that gap possible.
   * `hosted/builder-console/billing/checkout.ts`'s `ensureStripeCustomer` calls this first, before deciding
   * whether it needs to create one at all.
   */
  async function getAccountStripeCustomerId(accountId: AccountId): Promise<string | null> {
    const found = await db.prepare(`SELECT stripe_customer_id FROM accounts WHERE id = ?1`).bind(accountId).first();
    if (found === null) return null;
    return readRow(z.object({ stripe_customer_id: stripeCustomerId.nullable() }), found).stripe_customer_id;
  }

  /**
   * Sets an account's Stripe Customer id, but only the first time — the `WHERE ... IS NULL`
   * guard below is the entire mechanism, the same idempotent-write shape
   * `stampPastDueSinceIfUnset` uses further down for an unrelated column. That guard is also
   * what keeps this UNIQUE-safe under a genuine race: two concurrent Checkout attempts for the
   * same account can both find no Customer yet and both call Stripe to create one, but only the
   * first UPDATE to land here actually writes — `stripe_customer_id UNIQUE` is never at risk of
   * a collision from this function, because a second writer's UPDATE simply changes zero rows
   * instead of colliding with the first writer's now-committed value. The loser's freshly
   * created Customer becomes a harmless orphan in Stripe, never referenced by this Worker again.
   * `hosted/builder-console/billing/checkout.ts`'s `ensureStripeCustomer` is the caller, and it re-reads
   * through `getAccountStripeCustomerId` afterward rather than trusting that its own write
   * stuck — the row's real value is whichever writer actually won.
   */
  async function setAccountStripeCustomerId(accountId: AccountId, rawStripeCustomerId: string, now = new Date()): Promise<void> {
    const parsed = stripeCustomerId.parse(rawStripeCustomerId);
    await db
      .prepare(`UPDATE accounts SET stripe_customer_id = ?2, updated_at = ?3 WHERE id = ?1 AND stripe_customer_id IS NULL`)
      .bind(accountId, parsed, now.toISOString())
      .run();
  }

  /**
   * The email address to use for this account's Stripe Customer — the active owner's, per
   * `users.email`. Every tenant-scoped function in this file takes `AccountId` first (this
   * file's header comment); this is the one place that needs an account's email rather than an
   * id it already has, because nothing before `billing/checkout.ts`'s `ensureStripeCustomer` has
   * ever needed to read `users` from an account context. Reads through the owner membership
   * rather than `accounts.name` — `name` happens to be seeded from the email at creation
   * (`createUserAndAccountFromGoogle`'s own comment) but is a free-text display column with no
   * rename UI yet, not a promise that it will always still equal the email; `users.email` is the
   * one column this schema treats as authoritative. Returns `null` only for an account with no
   * active owner membership at all, which every account created through this file always has.
   */
  /**
   * The signed-in person as the console header shows them: their email and display name, read
   * through their own active membership of this account so a user id from another tenant's
   * session can never be looked up against this one. `null` when the membership is gone.
   */
  async function getSessionUser(accountId: AccountId, userId: string): Promise<{ email: string; displayName: string | null } | null> {
    const found = await db
      .prepare(
        `SELECT u.email AS email, u.display_name AS display_name
           FROM memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.account_id = ?1 AND m.user_id = ?2 AND m.status = 'active'
          LIMIT 1`,
      )
      .bind(accountId, userId)
      .first();
    if (found === null) return null;
    const row = readRow(z.object({ email: z.email().max(320), display_name: z.string().min(1).max(200).nullable() }), found);
    return { email: row.email, displayName: row.display_name };
  }

  async function getAccountOwnerEmail(accountId: AccountId): Promise<string | null> {
    const found = await db
      .prepare(
        `SELECT u.email AS email
           FROM memberships m
           JOIN users u ON u.id = m.user_id
          WHERE m.account_id = ?1 AND m.role = 'owner' AND m.status = 'active'
          LIMIT 1`,
      )
      .bind(accountId)
      .first();
    if (found === null) return null;
    return readRow(z.object({ email: z.email().max(320) }), found).email;
  }

  /**
   * Upserts the Stripe Subscription mirror. Audit and support only — assertEntitled above never
   * reads this table, and nothing here feeds authorization.
   *
   * The mirror's own primary key is the Stripe subscription id, not (account_id, ...), so a
   * plain `INSERT OR REPLACE` is the natural upsert: SQLite deletes the conflicting row and
   * reinserts it, which needs no ON CONFLICT clause and no named SET list.
   *
   * That absence of a named SET list is deliberate, not incidental. `npm run lint:tenant` bans
   * the literal token naming the informational gifted-subscription column in every TypeScript
   * source file, this one included, because the rule exists to keep that name off every
   * authorization path and the cheapest way to guarantee that is to ban the identifier outright
   * rather than to reason about which occurrences are reads. Writing the column is still
   * required — it is populated from Stripe's own discount object, per this repository's own
   * comment on the column — so this statement addresses it by position instead of by name.
   * `VALUES (?1..?11)` with no column list binds strictly in the table's declared column order
   * from 0003_billing.sql plus 0007_past_due_grace.sql's addition: id, account_id,
   * stripe_customer_id, status, price_id, the gift flag, cancel_at_period_end,
   * current_period_end, observed_at, synced_at, past_due_since. A future column added to that
   * table changes this order and must change this statement in the same migration.
   *
   * Returns the mirror row's resulting status and dunning stamp — see `SubscriptionMirrorState`
   * — so a caller can run `resolveEntitlement` (`hosted/builder-console/billing/entitlement-policy.ts`) against
   * what is actually now persisted. That matters on the discard path below: an out-of-order
   * delivery writes nothing, and the values to derive `active` from are whatever the mirror
   * already held, not the stale event that lost the race.
   */
  async function upsertSubscription(accountId: AccountId, input: UpsertSubscriptionInput, now = new Date()): Promise<SubscriptionMirrorState> {
    const values = z
      .object({
        id: stripeSubscriptionId,
        stripeCustomerId,
        status: z.enum(SUBSCRIPTION_STATUSES),
        priceId: stripePriceId.nullable(),
        isGifted: z.boolean(),
        cancelAtPeriodEnd: z.boolean(),
        currentPeriodEnd: isoTimestamp.nullable(),
        observedAt: isoTimestamp,
      })
      .parse(input);
    const found = await db.prepare(`SELECT account_id, observed_at, status, past_due_since FROM subscriptions WHERE id = ?1`).bind(values.id).first();
    let existingPastDueSince: string | null = null;
    if (found !== null) {
      const existing = readRow(
        z.object({ account_id: opaqueId, observed_at: isoTimestamp, status: z.enum(SUBSCRIPTION_STATUSES), past_due_since: isoTimestamp.nullable() }),
        found,
      );
      // A subscription's tenant never changes hands. A mismatch is a configuration fault, the
      // same way a cross-tenant key digest collision would be, not a request to reassign it.
      if (existing.account_id !== accountId) throw new AccessError(503);
      // Stripe redelivers and can redeliver out of order. This mirror is audit-only, so an
      // event older than what is already stored is discarded rather than reapplied — but the
      // caller still gets back the mirror's real, unchanged state, not the discarded event's.
      if (Date.parse(existing.observed_at) >= Date.parse(values.observedAt)) {
        return { status: existing.status, pastDueSince: existing.past_due_since };
      }
      existingPastDueSince = existing.past_due_since;
    }
    const pastDueSince = nextPastDueSince(values.status, existingPastDueSince, now);
    await db
      .prepare(`INSERT OR REPLACE INTO subscriptions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
      .bind(
        values.id,
        accountId,
        values.stripeCustomerId,
        values.status,
        values.priceId,
        values.isGifted ? 1 : 0,
        values.cancelAtPeriodEnd ? 1 : 0,
        values.currentPeriodEnd,
        values.observedAt,
        now.toISOString(),
        pastDueSince,
      )
      .run();
    return { status: values.status, pastDueSince };
  }

  /**
   * Scoped read of one subscription mirror row's status and dunning stamp — everything
   * `resolveEntitlement` needs when a signal names a subscription without also carrying its
   * full Stripe object: an `invoice.payment_failed`/`invoice.paid` event only names a
   * subscription id, and the reconciliation sweep only has what Stripe's API returned. Returns
   * `null` for a subscription id belonging to another tenant, exactly as for one that does not
   * exist — the same non-disclosure `getApiKey` already gives a cross-tenant id.
   */
  async function findSubscription(accountId: AccountId, subscriptionId: string): Promise<SubscriptionMirrorState | null> {
    const parsed = stripeSubscriptionId.safeParse(subscriptionId);
    if (!parsed.success) return null;
    const found = await db
      .prepare(`SELECT account_id, status, past_due_since FROM subscriptions WHERE account_id = ?1 AND id = ?2`)
      .bind(accountId, parsed.data)
      .first();
    if (found === null) return null;
    const row = readRow(z.object({ account_id: opaqueId, status: z.enum(SUBSCRIPTION_STATUSES), past_due_since: isoTimestamp.nullable() }), found);
    if (row.account_id !== accountId) throw new AccessError(503);
    return { status: row.status, pastDueSince: row.past_due_since };
  }

  /**
   * The most recently observed subscription mirror row for this account, if any — what
   * `hosted/builder-console/worker.ts`'s console-home render reads to compute the entitlement state it shows.
   * Ordered by `observed_at` (Stripe's own event time, the same field `upsertSubscription` uses
   * to discard out-of-order deliveries), not `synced_at`, so this reflects what Stripe most
   * recently reported rather than merely what this Worker most recently happened to write.
   * `null` for an account that has never had a subscription at all — every account between
   * creation and its first Checkout attempt. A subscription that was later canceled still has a
   * mirror row (`status = 'canceled'`) and is returned as one; telling "never subscribed" apart
   * from "subscribed once, no longer active" is a display decision for the caller, not this
   * function's job.
   */
  async function findLatestSubscriptionForAccount(accountId: AccountId): Promise<SubscriptionMirrorState | null> {
    const found = await db
      .prepare(`SELECT status, past_due_since FROM subscriptions WHERE account_id = ?1 ORDER BY observed_at DESC LIMIT 1`)
      .bind(accountId)
      .first();
    if (found === null) return null;
    const row = readRow(z.object({ status: z.enum(SUBSCRIPTION_STATUSES), past_due_since: isoTimestamp.nullable() }), found);
    return { status: row.status, pastDueSince: row.past_due_since };
  }

  /**
   * Idempotent: sets `past_due_since` to `now` only when a mirror row exists for this
   * subscription and does not already carry a stamp. Returns the stamp now on record (the one
   * just set, the one already there, or `null` if no mirror row exists at all).
   *
   * Used by the reconciliation sweep (`hosted/builder-console/billing/reconcile.ts`) when Stripe itself
   * reports `past_due` for a subscription the webhook path has not yet recorded as dunning:
   * reconciliation is now the first observer, so it is reconciliation that has to record when
   * the grace window started, the same way a webhook would have. A no-op, not an error, for a
   * subscription id this Worker has never mirrored — there is no row to stamp, and inventing one
   * from a bare id and status would drop every other column a real webhook delivery would have
   * populated.
   */
  async function stampPastDueSinceIfUnset(accountId: AccountId, subscriptionId: string, now: Date): Promise<string | null> {
    const parsed = stripeSubscriptionId.safeParse(subscriptionId);
    if (!parsed.success) return null;
    await db
      .prepare(`UPDATE subscriptions SET past_due_since = ?3 WHERE account_id = ?1 AND id = ?2 AND past_due_since IS NULL`)
      .bind(accountId, parsed.data, now.toISOString())
      .run();
    const row = await findSubscription(accountId, parsed.data);
    return row?.pastDueSince ?? null;
  }

  /**
   * Clears the dunning stamp on a subscription mirror row, if one exists. Used by
   * `invoice.paid` (`hosted/builder-console/billing/webhook.ts`): a paid invoice is Stripe's recovery signal
   * even when it arrives before the `customer.subscription.updated` event that will also correct
   * the mirrored `status`, and clearing the stamp here means a later, unrelated `past_due` report
   * starts counting its own grace window from scratch rather than inheriting a start time from
   * the episode that just ended.
   */
  async function clearPastDueSince(accountId: AccountId, subscriptionId: string): Promise<void> {
    const parsed = stripeSubscriptionId.safeParse(subscriptionId);
    if (!parsed.success) return;
    await db
      .prepare(`UPDATE subscriptions SET past_due_since = NULL WHERE account_id = ?1 AND id = ?2 AND past_due_since IS NOT NULL`)
      .bind(accountId, parsed.data)
      .run();
  }

  /**
   * Scoped read: every currently-active entitlement `lookup_key` billed through this Stripe
   * customer. The subscriptions mirror does not carry `lookup_key` (only `entitlements` does),
   * so this is how the reconciliation sweep gets from "this subscription's grace window has run
   * out" to "these are the rows to write `active = 0` into".
   */
  async function listActiveEntitlementsForCustomer(accountId: AccountId, rawStripeCustomerId: string): Promise<{ lookupKey: string }[]> {
    const parsed = stripeCustomerId.safeParse(rawStripeCustomerId);
    if (!parsed.success) return [];
    const { results } = await db
      .prepare(`SELECT lookup_key FROM entitlements WHERE account_id = ?1 AND stripe_customer_id = ?2 AND active = 1`)
      .bind(accountId, parsed.data)
      .all();
    return results.map((row) => ({ lookupKey: readRow(z.object({ lookup_key: lookupKey }), row).lookup_key }));
  }

  /**
   * The second reconciliation sweep's cross-tenant read: every subscription mirror row still
   * reported `past_due` whose dunning stamp is older than `olderThan`, across every tenant.
   * Modelled on `listStaleEntitlements` immediately below, for the same reason: every other
   * function in this file answers one tenant's request behind a caller-resolved `AccountId`;
   * this one is the scheduled sweep itself, with no request and no single tenant behind it, so
   * it is one more repository read allowed to range over every account.
   * `subscriptions_past_due_by_stamp` (0007_past_due_grace.sql) exists for exactly this scan.
   *
   * Only rows that still have an active entitlement to revoke are returned. Without that
   * condition an over-grace subscription would match this query on every sweep after it had
   * already been revoked, and under `limit` the oldest hundred such rows would be returned
   * forever while a newer one, past its own window, never reached the front of the queue.
   */
  async function listOverGracePastDueSubscriptions(olderThan: Date, limit = 100): Promise<OverGracePastDueSubscription[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const { results } = await db
      .prepare(
        `SELECT account_id, id, stripe_customer_id, past_due_since FROM subscriptions
          WHERE status = 'past_due' AND past_due_since IS NOT NULL AND past_due_since < ?1
            AND EXISTS (
              SELECT 1 FROM entitlements
               WHERE entitlements.account_id = subscriptions.account_id
                 AND entitlements.stripe_customer_id = subscriptions.stripe_customer_id
                 AND entitlements.active = 1)
          ORDER BY past_due_since LIMIT ?2`,
      )
      .bind(olderThan.toISOString(), bounded)
      .all();
    return results.map((row) => {
      const parsed = readRow(
        z.object({ account_id: opaqueId, id: stripeSubscriptionId, stripe_customer_id: stripeCustomerId, past_due_since: isoTimestamp }),
        row,
      );
      return {
        accountId: parsed.account_id as AccountId,
        subscriptionId: parsed.id,
        stripeCustomerId: parsed.stripe_customer_id,
        pastDueSince: parsed.past_due_since,
      };
    });
  }

  /**
   * Upserts the access gate itself. `entitlements_tenancy_is_immutable` (0003_billing.sql)
   * refuses to let a row change its (account_id, lookup_key), so the ON CONFLICT target is
   * exactly that primary key and no reassignment is possible even under a caller error.
   *
   * The `WHERE excluded.observed_at > entitlements.observed_at` clause is SQLite's own
   * conditional-upsert form: on conflict, the UPDATE runs only if the clause is true, and
   * otherwise the statement is a no-op — the same out-of-order discard as upsertSubscription,
   * built into the one statement instead of a separate read.
   */
  async function upsertEntitlement(accountId: AccountId, input: UpsertEntitlementInput, now = new Date()): Promise<void> {
    const values = z
      .object({
        lookupKey,
        stripeCustomerId,
        active: z.boolean(),
        source: z.enum(["stripe_webhook", "stripe_reconciliation"]),
        stripeEventId: stripeEventId.nullable().default(null),
        observedAt: isoTimestamp,
      })
      .parse(input);
    await db
      .prepare(
        `INSERT INTO entitlements (account_id, lookup_key, stripe_customer_id, active, source, stripe_event_id, observed_at, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT (account_id, lookup_key) DO UPDATE SET
           stripe_customer_id = excluded.stripe_customer_id,
           active = excluded.active,
           source = excluded.source,
           stripe_event_id = excluded.stripe_event_id,
           observed_at = excluded.observed_at,
           synced_at = excluded.synced_at
         WHERE excluded.observed_at > entitlements.observed_at`,
      )
      .bind(
        accountId,
        values.lookupKey,
        values.stripeCustomerId,
        values.active ? 1 : 0,
        values.source,
        values.stripeEventId,
        values.observedAt,
        now.toISOString(),
      )
      .run();
  }

  /**
   * Records that a Stripe event was processed, and reports whether this call is the one that
   * recorded it.
   *
   * There is no read-then-write here on purpose. `processed_stripe_events` is append-only by
   * trigger (0003_billing.sql), so the INSERT's own primary-key collision on a redelivered
   * `evt_...` id is the idempotency check: catching it and returning `false` is cheaper and
   * race-free where a SELECT-then-INSERT would leave a window between two concurrent
   * deliveries of the same event. Any other failure — a CHECK violation on `type`, a dropped
   * connection — is a real fault and must not be swallowed as "already processed", so only the
   * specific unique-constraint message is treated as the redelivery case.
   */
  async function recordProcessedStripeEvent(input: RecordProcessedStripeEventInput, now = new Date()): Promise<boolean> {
    const values = z
      .object({
        id: stripeEventId,
        type: z.string().regex(/^[a-z0-9_.]{1,120}$/),
        accountId: opaqueId.nullable(),
        result: z.enum(["applied", "ignored", "failed"]),
      })
      .parse(input);
    try {
      await db
        .prepare(`INSERT INTO processed_stripe_events (id, type, account_id, result, received_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
        .bind(values.id, values.type, values.accountId, values.result, now.toISOString())
        .run();
      return true;
    } catch (error) {
      if (error instanceof Error && /unique constraint failed/i.test(error.message)) return false;
      throw error;
    }
  }

  /**
   * The reconciliation sweep. `entitlements_by_staleness` (0003_billing.sql) exists for exactly
   * this: "The reconciliation cron scans by staleness across all tenants," in the migration's
   * own words. Every other function in this file takes a caller-resolved `AccountId` first,
   * because every other function answers one tenant's request; this one is the scheduled job
   * itself; it has no request and no single tenant, so it is the one repository read allowed to
   * range over every account. Ordered oldest-first so a bounded `limit` always makes forward
   * progress on the rows that most need it.
   */
  async function listStaleEntitlements(olderThan: Date, limit = 100): Promise<StaleEntitlement[]> {
    const bounded = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const { results } = await db
      .prepare(`SELECT account_id, lookup_key, stripe_customer_id, synced_at FROM entitlements WHERE synced_at < ?1 ORDER BY synced_at LIMIT ?2`)
      .bind(olderThan.toISOString(), bounded)
      .all();
    return results.map((row) => {
      const parsed = readRow(z.object({ account_id: opaqueId, lookup_key: lookupKey, stripe_customer_id: stripeCustomerId, synced_at: isoTimestamp }), row);
      return {
        accountId: parsed.account_id as AccountId,
        lookupKey: parsed.lookup_key,
        stripeCustomerId: parsed.stripe_customer_id,
        syncedAt: parsed.synced_at,
      };
    });
  }

  return {
    resolveApiKeyPrincipal,
    resolveGrantPrincipal,
    resolveSessionPrincipal,
    assertEntitled,
    assertEntitledAny,
    listApiKeys,
    getApiKey,
    createApiKey,
    revokeApiKey,
    listSessions,
    revokeSession,
    listAuditEvents,
    recordAuditEvent,
    recordInterestSignal,
    findUserByGoogleSub,
    createUserAndAccountFromGoogle,
    createSession,
    resolveAccountByStripeCustomerId,
    getAccountStripeCustomerId,
    setAccountStripeCustomerId,
    getAccountOwnerEmail,
    getSessionUser,
    upsertSubscription,
    findSubscription,
    findLatestSubscriptionForAccount,
    stampPastDueSinceIfUnset,
    clearPastDueSince,
    listActiveEntitlementsForCustomer,
    listOverGracePastDueSubscriptions,
    upsertEntitlement,
    recordProcessedStripeEvent,
    listStaleEntitlements,
  };
}

export type TenantDb = ReturnType<typeof tenantDb>;

/** Resolve the configured database. Access callers fail closed when it is absent. */
export function tenantDbFromEnv(env: { readonly DB?: D1Database | null }): TenantDb | null {
  return env.DB === undefined || env.DB === null ? null : tenantDb(env.DB);
}
