/**
 * Self-serve Checkout: creating a Stripe Customer the first time an account needs one, and the
 * two kinds of Stripe-hosted session this surface offers — a Checkout Session to subscribe, and
 * a Billing Portal session to manage an existing subscription.
 *
 * `createCheckoutSession`'s fields (`mode`, `line_items[0][price]`, `line_items[0][quantity]`,
 * `client_reference_id`, `success_url`/`cancel_url`, `allow_promotion_codes`) and response shape
 * follow Stripe's own reference for POST /v1/checkout/sessions
 * (https://docs.stripe.com/api/checkout/sessions/create). `createBillingPortalSession`'s fields
 * (`customer`, `return_url`) and response shape follow the Billing Portal's own reference for
 * POST /v1/billing_portal/sessions (https://docs.stripe.com/api/customer_portal/sessions/create).
 * Both are plain form-encoded POSTs, matching `stripeApiRequest`'s own request shape.
 *
 * Every Stripe call here goes through `stripe.ts`'s `stripeApiRequest`, so the `rk_` assertion at
 * the point of use stays exactly where that file's own doc comment puts it — nothing in this
 * module holds or reads the restricted key directly, and nothing here is the second place that
 * decides what counts as a valid key.
 *
 * `console/pages.ts` (via `worker.ts`'s POST /console/checkout and POST /console/billing routes)
 * is the only caller. Both routes wrap every function here in one broad try/catch: a Stripe
 * `permission_error` (HTTP 403, the exact failure mode a not-yet-rescoped restricted key
 * produces) and any other failure — a network fault, a misconfigured lookup_key, a malformed
 * response — surface to the page as "Billing is not available yet" with the interest form still
 * offered, never as a 500. That fallback is the caller's job, not this file's; every function
 * here just throws plainly on failure.
 */

import { z } from "zod";
import type { AccountId, TenantDb } from "../../knowledge-mcp/db/tenant.js";
import { priceIdForLookupKey } from "./reconcile.js";
import { createStripeCustomer, stripeApiRequest, StripeApiError } from "./stripe.js";

/**
 * Fixed, absolute redirect destinations. Stripe requires an absolute URL for both, and this
 * product has exactly one production origin — there is no per-request origin to derive these
 * from the way `worker.ts`'s `googleRedirectUri` derives Google's redirect_uri, because Checkout
 * Sessions and Billing Portal sessions are never created from any origin but this one.
 */
export const CHECKOUT_SUCCESS_URL = "https://app.clueless-creations.com/console?checkout=success";
export const CHECKOUT_CANCEL_URL = "https://app.clueless-creations.com/console?checkout=cancelled";
export const BILLING_PORTAL_RETURN_URL = "https://app.clueless-creations.com/console";

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
  const created = await createStripeCustomer(email, opts);
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
}

export interface CreatedCheckoutSession {
  readonly id: string;
  readonly url: string;
}

/**
 * Creates a Stripe Checkout Session for a subscription to the Price behind `input.lookupKey`,
 * billed to `input.customerId`. `client_reference_id` carries the account id so a Session this
 * Worker never sees resolved (an abandoned Checkout, a race with the webhook) can still be traced
 * back to the account that started it — `webhook.ts` itself still resolves the account from the
 * Customer id on every event, not from this field.
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

/** Creates a Stripe Billing Portal session for an existing Customer, returning to the console. */
export async function createBillingPortalSession(customerId: string, opts: StripeCallOptions): Promise<{ url: string }> {
  const result = await stripeApiRequest("/v1/billing_portal/sessions", {
    method: "POST",
    body: new URLSearchParams({ customer: customerId, return_url: BILLING_PORTAL_RETURN_URL }),
    secretKey: opts.secretKey,
    accountId: opts.accountId,
    fetchImpl: opts.fetchImpl,
  });
  const parsed = portalSessionResponse.safeParse(result);
  if (!parsed.success) throw new StripeApiError(502, result);
  return { url: parsed.data.url };
}
