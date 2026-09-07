/**
 * Self-serve Checkout: creating a Stripe Customer the first time an account needs one, the two
 * kinds of Stripe-hosted session this surface offers — a Checkout Session to subscribe, and a
 * Billing Portal session to manage an existing subscription — and the direct read that brings
 * the mirror up to date when a person comes back from either.
 *
 * `createCheckoutSession`'s fields and response shape follow Stripe's own reference for
 * POST /v1/checkout/sessions (https://docs.stripe.com/api/checkout/sessions/create) and its
 * subscriptions guide (https://docs.stripe.com/billing/subscriptions/build-subscriptions).
 * `createBillingPortalSession`'s fields, including `flow_data` for the portal's deep links
 * (https://docs.stripe.com/customer-management/portal-deep-links), follow the reference for
 * POST /v1/billing_portal/sessions (https://docs.stripe.com/api/customer_portal/sessions/create).
 * All are plain form-encoded POSTs, matching `stripeApiRequest`'s own request shape.
 *
 * Every Stripe call here goes through `stripe.ts`'s `stripeApiRequest`, so the `rk_` assertion at
 * the point of use stays exactly where that file's own doc comment puts it — nothing in this
 * module holds or reads the restricted key directly, and nothing here is the second place that
 * decides what counts as a valid key.
 *
 * `console/checkout.ts` (via `worker.ts`'s POST /console/checkout and POST /console/billing
 * routes) and `worker.ts`'s own GET /console render are the only callers. The two POST routes
 * wrap every function here in one broad try/catch: a Stripe `permission_error` (HTTP 403, the
 * exact failure mode a not-yet-rescoped restricted key produces) and any other failure — a
 * network fault, a misconfigured lookup_key, a malformed response — surface to the page as
 * "Billing is not available yet" with the interest form still offered, never as a 500. That
 * fallback is the caller's job, not this file's; every function here just throws plainly on
 * failure.
 */

import { z } from "zod";
import type { AccountId, TenantDb } from "../../knowledge-mcp/db/tenant.js";
import { listCustomerSubscriptions, priceIdForLookupKey } from "./reconcile.js";
import { createStripeCustomer, stripeApiRequest, StripeApiError } from "./stripe.js";
import { applyParsedSubscription, parseSubscriptionObject, type ParsedSubscription } from "./subscription-sync.js";

/**
 * Fixed, absolute redirect destinations. Stripe requires an absolute URL for both, and this
 * product has exactly one production origin — there is no per-request origin to derive these
 * from the way `worker.ts`'s `googleRedirectUri` derives Google's redirect_uri, because Checkout
 * Sessions and Billing Portal sessions are never created from any origin but this one.
 *
 * Every return lands on `/console` with a query flag naming where the person came from, and
 * `worker.ts` re-reads the account's subscriptions from Stripe on each such return
 * (`syncSubscriptionsFromStripe` below) before rendering, so the page reflects what they just
 * did even when the webhook describing it has not arrived yet.
 */
export const CONSOLE_URL = "https://app.clueless-creations.com/console";
export const CHECKOUT_SUCCESS_URL = `${CONSOLE_URL}?checkout=success`;
export const CHECKOUT_CANCEL_URL = `${CONSOLE_URL}?checkout=cancelled`;
export const BILLING_PORTAL_RETURN_URL = `${CONSOLE_URL}?billing=returned`;

/**
 * Shown under Checkout's pay button. Stripe's subscriptions guide recommends stating the renewal
 * and cancellation terms on the Checkout page itself; this is the console's Terms §7 in one
 * sentence, plain text (Checkout renders no markup here).
 */
export const CHECKOUT_SUBMIT_MESSAGE =
  "Your plan starts as soon as this payment succeeds and renews automatically until you cancel. Cancel any time from Manage billing in your console; access continues to the end of the period you paid for.";

interface StripeCallOptions {
  /** The restricted key. Checked for the `rk_` prefix inside `stripeApiRequest`, not before it. */
  readonly secretKey: string;
  /** Injectable so tests never make a real network call, matching `stripe.ts`'s own convention. */
  readonly fetchImpl?: typeof fetch;
  /** The Stripe account an organization-level key acts on; `Stripe-Context` on every call. */
  readonly accountId?: string;
}

/** Only the tenant repository functions this module actually calls. */
type CheckoutDb = Pick<TenantDb, "getAccountStripeCustomerId" | "setAccountStripeCustomerId">;

/**
 * Returns this account's Stripe Customer id, creating one the first time it is needed.
 *
 * `setAccountStripeCustomerId` only writes when the column is still `NULL` (its own doc comment
 * in `db/tenant.ts`) — a concurrent caller may already have won that race with a different
 * Customer id, so the value this function returns is always re-read from the row afterward,
 * never assumed to be the one this call just created. A second, orphaned Customer created by the
 * loser of that race is harmless: nothing in this Worker ever looks it up again.
 */
export async function ensureStripeCustomer(tenant: CheckoutDb, accountId: AccountId, email: string, opts: StripeCallOptions): Promise<string> {
  const existing = await tenant.getAccountStripeCustomerId(accountId);
  if (existing !== null) return existing;
  const created = await createStripeCustomer({ email, accountId }, opts);
  await tenant.setAccountStripeCustomerId(accountId, created.id);
  return (await tenant.getAccountStripeCustomerId(accountId)) ?? created.id;
}

/** A plan's `lookup_key` currently resolves to no active Stripe Price. A configuration fault, not a client fault. */
export class NoActivePriceError extends Error {
  constructor(readonly lookupKey: string) {
    super(`no active Stripe Price for lookup_key "${lookupKey}"`);
  }
}

const checkoutSessionResponse = z.object({ id: z.string(), url: z.string() });

export interface CreateCheckoutSessionInput {
  readonly customerId: string;
  /** A plan's lookup_key (`billing/plans.ts`), resolved to a Price id through the same GET /v1/prices?lookup_keys[] shape `billing/reconcile.ts` uses. */
  readonly lookupKey: string;
  readonly accountId: AccountId;
  /**
   * The instant the person ticked the consent box on the plan page (`console/pages.ts`),
   * agreeing to the Terms and asking for access to start at once, and the URL of the Terms they
   * agreed to. Recorded as metadata on the Checkout Session and again on the subscription it
   * creates, so the evidence the Terms' consumer-withdrawal clause depends on lives next to the
   * purchase in Stripe — on the Session even if Checkout is abandoned — with no table of its
   * own here.
   */
  readonly termsAcceptedAt: string;
  readonly termsUrl: string;
}

export interface CreatedCheckoutSession {
  readonly id: string;
  readonly url: string;
}

/**
 * Creates a Stripe Checkout Session for a subscription to the Price behind `input.lookupKey`,
 * billed to `input.customerId`.
 *
 * Beyond the required fields:
 *   - `client_reference_id`, `metadata[account_id]`, and `subscription_data[metadata][account_id]`
 *     all carry the account id, so a Session or a Subscription this Worker never sees resolved
 *     (an abandoned Checkout, a race with the webhook, a support question in the Dashboard) can
 *     be traced back to the account that started it. `webhook.ts` still resolves the account
 *     from the Customer id on every event, not from any of these.
 *   - `customer_update[name]` and `[address]` let Checkout save what it collects onto the
 *     Customer, so invoices and receipts name the buyer. `tax_id_collection` lets a business
 *     buyer enter a VAT or other tax id for the same invoices; Stripe requires
 *     `customer_update[name]=auto` alongside it when the Customer already exists, as it does here.
 *   - `allow_promotion_codes` keeps the promotion-code field on the page, the only way a gifted
 *     or discounted plan is ever applied (0003_billing.sql's own note on the gift flag).
 *   - `custom_text[submit]` states the renewal and cancellation terms on the page itself.
 *   - `automatic_tax` hands the tax question to Stripe Tax, which is active on the account:
 *     Checkout collects the billing address, works out tax only in jurisdictions the account is
 *     registered in (zero everywhere else), and the subscription it creates keeps calculating on
 *     every renewal. The Prices carry no `tax_behavior` of their own, so the account's Tax
 *     default applies, which for USD is tax-exclusive: the listed price stays the listed price
 *     and tax is added on top where it is owed. Stripe's threshold monitoring, not this code,
 *     says when a registration becomes due (README, Stripe checklist).
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput, opts: StripeCallOptions): Promise<CreatedCheckoutSession> {
  const priceId = await priceIdForLookupKey(input.lookupKey, opts.secretKey, opts.fetchImpl, opts.accountId);
  if (priceId === null) throw new NoActivePriceError(input.lookupKey);
  const result = await stripeApiRequest("/v1/checkout/sessions", {
    method: "POST",
    body: new URLSearchParams({
      mode: "subscription",
      customer: input.customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: input.accountId,
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
      allow_promotion_codes: "true",
      "customer_update[name]": "auto",
      "customer_update[address]": "auto",
      "tax_id_collection[enabled]": "true",
      "automatic_tax[enabled]": "true",
      "metadata[account_id]": input.accountId,
      "metadata[terms_accepted_at]": input.termsAcceptedAt,
      "subscription_data[metadata][account_id]": input.accountId,
      "subscription_data[metadata][terms_accepted_at]": input.termsAcceptedAt,
      "subscription_data[metadata][terms_url]": input.termsUrl,
      "custom_text[submit][message]": CHECKOUT_SUBMIT_MESSAGE,
    }),
    secretKey: opts.secretKey,
    accountId: opts.accountId,
    fetchImpl: opts.fetchImpl,
  });
  const parsed = checkoutSessionResponse.safeParse(result);
  if (!parsed.success) throw new StripeApiError(502, result);
  return { id: parsed.data.id, url: parsed.data.url };
}

const portalSessionResponse = z.object({ url: z.string() });

/**
 * The Billing Portal deep links this console offers. Each opens the portal directly on one
 * task and, when that task completes, sends the person back to `/console` with a flag naming
 * what they did (`console/pages.ts`'s `BillingNotice`). Backing out of a flow returns them to
 * the portal's own home page, with the portal's "Return" link pointing at
 * `BILLING_PORTAL_RETURN_URL`. Plan changes are not deep-linked: the Dashboard's portal
 * configuration decides whether switching between the monthly and annual Price is allowed at
 * all, and a deep link to a disabled feature fails at session creation — which is also why
 * `console/checkout.ts` retries a failed deep link as a plain portal session before giving up.
 */
export type PortalFlow = { readonly type: "payment_method_update" } | { readonly type: "subscription_cancel"; readonly subscriptionId: string };

const PORTAL_FLOW_RETURN: Record<PortalFlow["type"], string> = {
  payment_method_update: `${CONSOLE_URL}?billing=payment_method_updated`,
  subscription_cancel: `${CONSOLE_URL}?billing=cancel_scheduled`,
};

/** Creates a Stripe Billing Portal session for an existing Customer, returning to the console. */
export async function createBillingPortalSession(customerId: string, opts: StripeCallOptions, flow?: PortalFlow): Promise<{ url: string }> {
  const body = new URLSearchParams({ customer: customerId, return_url: BILLING_PORTAL_RETURN_URL });
  if (flow !== undefined) {
    body.set("flow_data[type]", flow.type);
    if (flow.type === "subscription_cancel") body.set("flow_data[subscription_cancel][subscription]", flow.subscriptionId);
    body.set("flow_data[after_completion][type]", "redirect");
    body.set("flow_data[after_completion][redirect][return_url]", PORTAL_FLOW_RETURN[flow.type]);
  }
  const result = await stripeApiRequest("/v1/billing_portal/sessions", {
    method: "POST",
    body,
    secretKey: opts.secretKey,
    accountId: opts.accountId,
    fetchImpl: opts.fetchImpl,
  });
  const parsed = portalSessionResponse.safeParse(result);
  if (!parsed.success) throw new StripeApiError(502, result);
  return { url: parsed.data.url };
}

export interface SubscriptionSyncResult {
  /** Subscriptions read from Stripe and written through `applyParsedSubscription`. */
  readonly applied: number;
  /** Entitlements set inactive because no subscription on the Customer bills their `lookup_key` any more. */
  readonly retired: number;
  /** False when Stripe's list was cut off at the page cap; nothing was retired in that case. */
  readonly complete: boolean;
}

/**
 * How a subscription's status ranks when two subscriptions on one Customer bill the same
 * `lookup_key`. Applied in ascending order, so the highest rank writes last and wins the
 * entitlement row's out-of-order guard: a live plan beats a past-due one, which beats anything
 * ended. This is the same conclusion `billing/reconcile.ts`'s `resolveStripeEntitlement` reaches
 * — it looks for `active`/`trialing` first and only then at `past_due` — so a page render and
 * the sweep cannot flip the same row back and forth. `past_due` ranks below `active` rather than
 * beside it because a past-due subscription whose grace window has already run out resolves to
 * no access, and applied last it would revoke what a healthy subscription just granted.
 */
function statusRank(status: ParsedSubscription["status"]): number {
  if (status === "active" || status === "trialing") return 2;
  if (status === "past_due") return 1;
  return 0;
}

/**
 * Reads every subscription Stripe holds for this Customer and writes each one through the same
 * code the webhook uses. Called by `worker.ts` when a person returns to `/console` from Checkout
 * or the Billing Portal, and (rate-limited there) when an account has a Customer but no mirror
 * row at all — a Checkout that completed while the webhook was lost, or a person who paid and
 * closed the tab without returning. Stripe's guidance for the return from Checkout is to verify
 * state from the API rather than trust the redirect, and this is that verification for every
 * return, not only the first.
 *
 * Every object is parsed before anything is written (`parseSubscriptionObject` throws on one
 * this Worker cannot represent), so a malformed subscription fails the whole read with no
 * half-applied state; a D1 failure part-way through is the one remaining partial case, and
 * every write is idempotent, so the next return or the sweep completes it.
 *
 * Timestamps: each write is stamped in the second *before* the read, one millisecond apart in
 * apply order. Stripe event times have whole-second resolution, so any webhook event created in
 * the read's own second or later — which may describe a later state, such as the payment that
 * lands a moment after a past-due customer updates their card — still outranks the read in both
 * upserts' out-of-order guards, while events from earlier seconds, which the read already
 * reflects, do not. Within that second the order is `statusRank` then Stripe's `created`, so
 * the plan in force carries the newest stamp: that is the one the console must describe and the
 * one a cancel deep link must name.
 *
 * When the list is complete, an entitlement still active for a `lookup_key` that no subscription
 * bills any more — the old Price after an in-place plan switch in the portal, or every key when
 * Stripe holds no subscription for the Customer at all — is set inactive. Stripe has nothing that
 * grants it; leaving it would tell the console the wrong plan and keep a gate open that the
 * reconciliation sweep would only close within its staleness ceiling.
 */
export async function syncSubscriptionsFromStripe(
  tenant: TenantDb,
  accountId: AccountId,
  stripeCustomerId: string,
  opts: StripeCallOptions,
  now = new Date(),
): Promise<SubscriptionSyncResult> {
  const list = await listCustomerSubscriptions(stripeCustomerId, opts);
  const created = z.object({ created: z.number() });
  const parsed = list.data.map((raw) => ({ created: created.parse(raw).created, subscription: parseSubscriptionObject(raw) }));
  const ordered = parsed.sort((a, b) => statusRank(a.subscription.status) - statusRank(b.subscription.status) || a.created - b.created);

  // Offsets are clamped so the last stamp stays inside that second even for a Customer with a
  // thousand subscriptions; past the clamp, later writes tie rather than cross into the read's
  // own second, which is the invariant the guards rely on.
  const base = (Math.floor(now.getTime() / 1000) - 1) * 1000;
  const stampAt = (offset: number) => new Date(base + Math.min(offset, 999)).toISOString();
  for (const [index, entry] of ordered.entries()) {
    const observedAt = stampAt(index);
    await applyParsedSubscription(tenant, accountId, stripeCustomerId, entry.subscription, { source: "stripe_reconciliation", stripeEventId: null, observedAt }, now);
  }

  let retired = 0;
  if (list.complete) {
    const billed = new Set(ordered.flatMap((entry) => entry.subscription.lookupKeys));
    const observedAt = stampAt(ordered.length);
    for (const { lookupKey } of await tenant.listActiveEntitlementsForCustomer(accountId, stripeCustomerId)) {
      if (billed.has(lookupKey)) continue;
      await tenant.upsertEntitlement(accountId, { lookupKey, stripeCustomerId, active: false, source: "stripe_reconciliation", stripeEventId: null, observedAt }, now);
      retired += 1;
    }
  }
  return { applied: ordered.length, retired, complete: list.complete };
}
