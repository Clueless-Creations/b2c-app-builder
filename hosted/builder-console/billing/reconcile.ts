/**
 * Scheduled reconciliation. Two independent sweeps, run on the same five-minute trigger:
 *
 *   1. The staleness sweep re-derives `entitlements` from Stripe directly, for rows the webhook
 *      path has not refreshed in a while. `entitlements_by_staleness` (0003_billing.sql) exists
 *      for exactly this, in the migration's own words: "The reconciliation cron scans by
 *      staleness across all tenants." It is the backstop for every way the webhook path can go
 *      quiet without Stripe itself knowing anything is wrong — a paused Worker, a delivery
 *      whose retries Stripe exhausted after the webhook answered 5xx (webhook.ts, step 5 of its
 *      own doc comment), a missed delivery Stripe gave up retrying. `ENTITLEMENT_STALENESS_CEILING_MS`
 *      (db/tenant.ts) is the same 24-hour bound `assertEntitled` already enforces at read time;
 *      this sweep's only purpose is to keep real-world staleness close to that nominal ceiling by
 *      running far more often than the ceiling requires, so a stale row is caught within minutes
 *      of crossing the threshold rather than sitting there until the next infrequent sweep.
 *
 *   2. The grace sweep revokes access from a `past_due` subscription whose grace window
 *      (`PAST_DUE_GRACE_MS`, `billing/entitlement-policy.ts`) has run out, deterministically —
 *      it does not wait for that subscription's entitlement row to also go stale. Nothing Stripe
 *      sends tells this Worker "the seventh day has arrived"; the only way that revocation
 *      happens on schedule, even with every webhook delivered exactly as designed, is a sweep
 *      that checks the clock itself.
 *
 * Both sweeps call `resolveEntitlement` (`billing/entitlement-policy.ts`) rather than answering
 * "is this subscription entitled" on their own — the same module `webhook.ts` calls, so the
 * delivery path and this backstop cannot quietly disagree about what "entitled" means.
 */

import { z } from "zod";
import { ENTITLEMENT_STALENESS_CEILING_MS, type AccountId, type TenantDb } from "../../knowledge-mcp/db/tenant.js";
import { PAST_DUE_GRACE_MS, resolveEntitlement } from "./entitlement-policy.js";
import { stripeApiRequest, StripeApiError } from "./stripe.js";

export interface ReconcileEnv {
  readonly STRIPE_RESTRICTED_KEY: string;
}

export interface StalenessSweepSummary {
  readonly scanned: number;
  readonly updated: number;
  readonly failed: number;
}

export interface GraceSweepSummary {
  readonly scanned: number;
  readonly revoked: number;
  readonly failed: number;
}

export interface ReconcileSummary {
  readonly staleness: StalenessSweepSummary;
  readonly graceSweep: GraceSweepSummary;
}

/**
 * Looks up the current Price for a lookup_key. Stripe's lookup_key is exactly this: a stable
 * business identifier ("pro_monthly") a Price can carry so code never has to hard-code a Price
 * id, which changes if the price is ever recreated. A lookup_key with no active Price (renamed,
 * archived, never configured) resolves to `null` rather than throwing, so one misconfigured
 * product does not stop the sweep for every other tenant in the same batch.
 *
 * Exported so `billing/checkout.ts`'s `createCheckoutSession` resolves a plan's lookup_key to a
 * Price id through this exact function, rather than a second implementation of the same
 * `GET /v1/prices?lookup_keys[]=` shape that could drift from this one.
 */
export async function priceIdForLookupKey(lookupKey: string, secretKey: string, fetchImpl?: typeof fetch, accountId?: string): Promise<string | null> {
  const result = await stripeApiRequest(`/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true`, {
    method: "GET",
    secretKey,
    accountId,
    fetchImpl,
  });
  const parsed = z.object({ data: z.array(z.object({ id: z.string() })) }).safeParse(result);
  return parsed.success ? (parsed.data.data[0]?.id ?? null) : null;
}

export interface CustomerSubscriptionList {
  /** Every Subscription object Stripe returned, as sent — callers parse what they need. */
  readonly data: unknown[];
  /** False only when the page cap below was reached with `has_more` still true. */
  readonly complete: boolean;
}

/** Stripe's maximum page size, and a cap on pages so one pathological Customer cannot hold a sweep or a page render open. */
const SUBSCRIPTION_PAGE_LIMIT = 100;
const SUBSCRIPTION_PAGE_CAP = 10;

/**
 * Every subscription Stripe holds for a Customer, in every status, following `has_more` with
 * `starting_after` until the list ends or the page cap is hit. `GET /v1/subscriptions` returns
 * newest first, so a caller that read only one page would miss a long-lived Customer's oldest
 * subscriptions — and, worse, a live plan pushed off the first page by a run of failed
 * re-subscriptions. Exported for `billing/checkout.ts`'s `syncSubscriptionsFromStripe`, which
 * needs the whole objects, so the two readers of this endpoint share one request shape the
 * same way `priceIdForLookupKey` above is shared. Throws on a response that is not a Stripe
 * list at all; a caller decides whether that means "try again later" (the sweep counts it as a
 * failure and leaves the row stale) or "fall back" (the console renders the mirror).
 */
export async function listCustomerSubscriptions(
  stripeCustomerId: string,
  opts: { readonly secretKey: string; readonly accountId?: string; readonly fetchImpl?: typeof fetch; readonly priceId?: string },
): Promise<CustomerSubscriptionList> {
  const data: unknown[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < SUBSCRIPTION_PAGE_CAP; page += 1) {
    const params = new URLSearchParams({ customer: stripeCustomerId, status: "all", limit: String(SUBSCRIPTION_PAGE_LIMIT) });
    if (opts.priceId !== undefined) params.set("price", opts.priceId);
    if (startingAfter !== undefined) params.set("starting_after", startingAfter);
    const result = await stripeApiRequest(`/v1/subscriptions?${params.toString()}`, {
      method: "GET",
      secretKey: opts.secretKey,
      accountId: opts.accountId,
      fetchImpl: opts.fetchImpl,
    });
    // `looseObject`, not `object`: the elements are handed on whole, and zod's default object
    // would strip every field this envelope does not name before a caller could read them.
    const parsed = z.object({ data: z.array(z.looseObject({ id: z.string() })), has_more: z.boolean().optional().default(false) }).safeParse(result);
    if (!parsed.success) throw new StripeApiError(502, result);
    data.push(...parsed.data.data);
    if (!parsed.data.has_more) return { data, complete: true };
    startingAfter = parsed.data.data.at(-1)?.id;
    if (startingAfter === undefined) return { data, complete: false };
  }
  return { data, complete: false };
}

/**
 * Does this Stripe customer currently hold a subscription to this Price in an entitling state?
 * "Entitling" is decided by `resolveEntitlement` (`billing/entitlement-policy.ts`) — the same
 * function `webhook.ts` calls — so the two paths cannot quietly disagree about what "entitled"
 * means.
 *
 * An `active`/`trialing` subscription answers immediately. A `past_due` one needs one more
 * piece of information `resolveEntitlement` requires and Stripe's API does not provide — when
 * dunning started — so this reads it from this Worker's own mirror (`findSubscription`), or, if
 * reconciliation is the first thing to ever observe this subscription in `past_due` (the webhook
 * that would have stamped it was missed, or has not landed yet), stamps it now
 * (`stampPastDueSinceIfUnset`) so the grace window has a start time at all rather than an
 * unbounded one.
 */
async function resolveStripeEntitlement(
  tenant: TenantDb,
  accountId: AccountId,
  stripeCustomerId: string,
  priceId: string,
  secretKey: string,
  now: Date,
  fetchImpl?: typeof fetch,
  stripeAccountId?: string,
): Promise<boolean> {
  const list = await listCustomerSubscriptions(stripeCustomerId, { secretKey, accountId: stripeAccountId, fetchImpl, priceId });
  // A list cut off at the page cap says nothing about the subscriptions it did not reach;
  // concluding "no live plan" from it would revoke on a partial read. Thrown, so the sweep counts
  // it as a failure and leaves the row stale for the next run, per its own doc comment.
  if (!list.complete) throw new Error(`reconcile: subscription list for ${stripeCustomerId} was cut off at the page cap`);
  const parsed = z.array(z.object({ id: z.string(), status: z.string() })).safeParse(list.data);
  if (!parsed.success) return false;
  const subscriptions = parsed.data;
  if (subscriptions.some((subscription) => subscription.status === "active" || subscription.status === "trialing")) return true;
  const pastDue = subscriptions.find((subscription) => subscription.status === "past_due");
  if (pastDue === undefined) return false;
  const pastDueSince = await tenant.stampPastDueSinceIfUnset(accountId, pastDue.id, now);
  // No mirror row means no durable start time: `stampPastDueSinceIfUnset` had nothing to write
  // and returns null. Passing that null into the policy would anchor the window at "now" on
  // every sweep, forever — a subscription Stripe keeps reporting past_due would never expire.
  // So a past_due subscription this Worker has never mirrored is not entitled, the same choice
  // webhook.ts's invoice.payment_failed path makes for the identical condition.
  if (pastDueSince === null) return false;
  return resolveEntitlement({ status: "past_due", pastDueSince, now }).active;
}

export interface ReconcileStaleEntitlementsOptions {
  readonly secretKey: string;
  /** The Stripe account an organization-level key acts on; sent as `Stripe-Context`. */
  readonly accountId?: string;
  readonly olderThan?: Date;
  readonly limit?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
}

/**
 * The staleness sweep. Bounded by `limit` per invocation on purpose — this Worker's cron fires
 * every five minutes (wrangler.jsonc), so a batch left over after one run is picked up by the
 * next rather than needing an unbounded scan to hold up a single scheduled-event deadline.
 *
 * A failure reconciling one entitlement (a Stripe rate limit, a transient network fault) is
 * caught and counted rather than aborting the batch: the row simply stays stale and is picked up
 * again on the next run, which is the same "eventually corrected, never silently wrong forever"
 * property the staleness ceiling itself is built on. A failure reading the stale rows in the
 * first place — a D1 fault — is not caught here and propagates to the caller's `waitUntil`,
 * where Cloudflare's own error metrics see it; that failure means the sweep did not run at all,
 * which is worth surfacing loudly rather than reporting a quiet zero.
 */
async function runStalenessSweep(
  tenant: TenantDb,
  opts: {
    readonly secretKey: string;
    readonly accountId?: string;
    readonly olderThan?: Date;
    readonly limit?: number;
    readonly fetchImpl?: typeof fetch;
    readonly now: Date;
  },
): Promise<StalenessSweepSummary> {
  const cutoff = opts.olderThan ?? new Date(opts.now.getTime() - ENTITLEMENT_STALENESS_CEILING_MS);
  const stale = await tenant.listStaleEntitlements(cutoff, opts.limit ?? 100);

  // Fresh per invocation, not module-level: a lookup_key is meant to stay pointed at one Price
  // for a long time, but caching across scheduled runs would let a repointed Price go unnoticed
  // for however long the Worker isolate happens to live. Reusing the map only within one sweep
  // still collapses the common case — many tenants sharing the same handful of plan keys — into
  // one Stripe call per key per run.
  const priceCache = new Map<string, string | null>();
  let updated = 0;
  let failed = 0;
  for (const entitlement of stale) {
    try {
      let priceId = priceCache.get(entitlement.lookupKey);
      if (priceId === undefined) {
        priceId = await priceIdForLookupKey(entitlement.lookupKey, opts.secretKey, opts.fetchImpl, opts.accountId);
        priceCache.set(entitlement.lookupKey, priceId);
      }
      const active =
        priceId !== null &&
        (await resolveStripeEntitlement(
          tenant,
          entitlement.accountId,
          entitlement.stripeCustomerId,
          priceId,
          opts.secretKey,
          opts.now,
          opts.fetchImpl,
          opts.accountId,
        ));
      await tenant.upsertEntitlement(
        entitlement.accountId,
        {
          lookupKey: entitlement.lookupKey,
          stripeCustomerId: entitlement.stripeCustomerId,
          active,
          source: "stripe_reconciliation",
          stripeEventId: null,
          observedAt: opts.now.toISOString(),
        },
        opts.now,
      );
      updated += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: stale.length, updated, failed };
}

/**
 * The grace sweep. Deterministic and Stripe-free: every subscription this Worker's own mirror
 * already reports `past_due` with a dunning stamp older than the window is revoked outright,
 * without waiting for that account's entitlement row to also cross the (unrelated)
 * `ENTITLEMENT_STALENESS_CEILING_MS` the staleness sweep above answers to. `resolveEntitlement`
 * is still the one function that decides `active` here — the query pre-filters to rows past the
 * cutoff, but re-deciding through the shared policy function (rather than trusting the SQL
 * cutoff alone to agree with `PAST_DUE_GRACE_MS` forever) is what keeps "over grace" meaning the
 * same thing in every code path that asks.
 *
 * A subscription can grant more than one `lookup_key` (0003_billing.sql's mirror is one row per
 * subscription; `entitlements` is one row per lookup_key), so `listActiveEntitlementsForCustomer`
 * finds every currently-active entitlement billed through the same Stripe customer and revokes
 * each one. A failure revoking one subscription's entitlements is caught and counted, for the
 * same "stays wrong for one more sweep, never forever" reason the staleness sweep's per-row catch
 * exists.
 */
async function runGraceSweep(tenant: TenantDb, opts: { readonly limit?: number; readonly now: Date }): Promise<GraceSweepSummary> {
  const cutoff = new Date(opts.now.getTime() - PAST_DUE_GRACE_MS);
  const overGrace = await tenant.listOverGracePastDueSubscriptions(cutoff, opts.limit ?? 100);
  let revoked = 0;
  let failed = 0;
  for (const subscription of overGrace) {
    try {
      const { active } = resolveEntitlement({ status: "past_due", pastDueSince: subscription.pastDueSince, now: opts.now });
      if (active) continue;
      const entitlements = await tenant.listActiveEntitlementsForCustomer(subscription.accountId, subscription.stripeCustomerId);
      for (const entitlement of entitlements) {
        await tenant.upsertEntitlement(
          subscription.accountId,
          {
            lookupKey: entitlement.lookupKey,
            stripeCustomerId: subscription.stripeCustomerId,
            active: false,
            source: "stripe_reconciliation",
            stripeEventId: null,
            observedAt: opts.now.toISOString(),
          },
          opts.now,
        );
      }
      revoked += 1;
    } catch {
      failed += 1;
    }
  }
  return { scanned: overGrace.length, revoked, failed };
}

/**
 * Runs both sweeps for one scheduled invocation and reports what each did. `limit` bounds each
 * sweep independently by the same value, matching how `worker.ts`'s `scheduled()` calls this as
 * a single `ctx.waitUntil` on the same five-minute trigger — one knob for one cron tick, not two
 * to keep in sync.
 */
export async function reconcileStaleEntitlements(tenant: TenantDb, opts: ReconcileStaleEntitlementsOptions): Promise<ReconcileSummary> {
  const now = opts.now ?? new Date();
  const staleness = await runStalenessSweep(tenant, { ...opts, now });
  const graceSweep = await runGraceSweep(tenant, { limit: opts.limit, now });
  return { staleness, graceSweep };
}
