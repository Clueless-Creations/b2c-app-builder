/**
 * Stripe access for the app Worker. No `stripe` npm dependency: a Worker whose blast radius
 * includes billing gets the smallest bundle this repo can give it, the same reasoning
 * `hosted/knowledge-mcp` already applied to PostHog capture and to the MCP OAuth authorization server.
 *
 * Two things live here, and only here:
 *   - `stripeApiRequest`, the single gateway to `api.stripe.com`. Nothing else in this Worker
 *     may hold or use the restricted key; a caller that wants Stripe goes through this function.
 *   - `verifyStripeSignature`, a from-scratch implementation of Stripe's webhook signing scheme
 *     over Web Crypto, because the alternative is trusting the full SDK's HTTP client inside a
 *     Worker that also holds the key that can create real charges.
 */

import { z } from "zod";
import { constantTimeEqual } from "../../knowledge-mcp/auth.js";

const STRIPE_API_BASE = "https://api.stripe.com";
/**
 * The Stripe API version every request pins. Changing it is a contract change for every parser
 * in billing/: read the version's changelog for Subscription, Invoice, Checkout Session, and
 * Customer before moving it, and re-run the integration suites.
 */
export const STRIPE_API_VERSION = "2025-08-27.basil";

export interface StripeRequestOptions {
  /**
   * The Stripe account an organization-level key acts on (`acct_...`), sent as `Stripe-Context`.
   * Omit for an account-level key. Comes from the `STRIPE_ACCOUNT_ID` var in wrangler.jsonc.
   */
  readonly accountId?: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly body?: URLSearchParams;
  /** The restricted key. Checked for the `rk_` prefix at this call, not before it. */
  readonly secretKey: string;
  /** Injectable so tests never make a real network call. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** A non-2xx response, or a response body that was not the JSON Stripe always sends. */
export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Stripe API request failed with status ${status}`);
  }
}

/**
 * The one function in this Worker that may call `api.stripe.com`.
 *
 * The `rk_` assertion sits here, at the point the key is actually used, rather than at the
 * point it is read off the environment. A boot-time check can be skipped by a code path that
 * never runs it; a check inside the only function that makes the request cannot be, because
 * every caller — `createStripeCustomer` below, the reconciliation job, any future Stripe write —
 * has to route through it. A full secret key (`sk_...`) pasted into the restricted-key slot by
 * mistake fails here, closed, before a single byte reaches Stripe with more privilege than this
 * Worker was scoped to ask for.
 */
export async function stripeApiRequest(path: string, opts: StripeRequestOptions): Promise<unknown> {
  if (!/^rk_/.test(opts.secretKey)) {
    throw new Error("Stripe requests require a restricted key (the rk_ prefix); refusing to call the API with anything else.");
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const response = await doFetch(`${STRIPE_API_BASE}${path}`, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${opts.secretKey}`,
      // Pinned on every request, so a Dashboard-side default change never alters the shapes this
      // Worker parses, and because a key issued at the organization level refuses a request that
      // names no version at all ("You did not provide an API version").
      "Stripe-Version": STRIPE_API_VERSION,
      // An organization-level restricted key (the shape the live key turned out to be) rejects any
      // request that does not name the account it acts on ("Please include the Stripe-Context
      // header"); an account-level key ignores the header. Sent only when the deployment sets it.
      ...(opts.accountId ? { "Stripe-Context": opts.accountId } : {}),
      ...(opts.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: opts.body,
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    throw new StripeApiError(response.status, text);
  }
  if (!response.ok) throw new StripeApiError(response.status, json);
  return json;
}

export interface CreatedStripeCustomer {
  readonly id: string;
}

/**
 * Creates a Stripe Customer.
 *
 * Called lazily now, not at sign-in: `accounts.stripe_customer_id` is nullable as of
 * 0008_lazy_stripe_customer.sql, so an account can exist with no Customer at all. The one caller
 * is `billing/checkout.ts`'s `ensureStripeCustomer`, the first time a signed-in account actually
 * starts a Checkout or opens the Billing Portal — never from M3's Google callback, which must
 * have no Stripe dependency of its own (worker.ts's `handleGoogleCallback`, and this file's own
 * history: before 0008, this was called synchronously at first sign-in, which meant a Stripe
 * outage blocked every first-time signup).
 */
export async function createStripeCustomer(
  email: string,
  opts: { readonly secretKey: string; readonly fetchImpl?: typeof fetch; readonly accountId?: string },
): Promise<CreatedStripeCustomer> {
  const result = await stripeApiRequest("/v1/customers", {
    method: "POST",
    body: new URLSearchParams({ email }),
    secretKey: opts.secretKey,
    accountId: opts.accountId,
    fetchImpl: opts.fetchImpl,
  });
  const parsed = z.object({ id: z.string().regex(/^cus_[A-Za-z0-9_]{1,76}$/) }).safeParse(result);
  if (!parsed.success) throw new StripeApiError(502, result);
  return { id: parsed.data.id };
}

/**
 * Verifies a `Stripe-Signature` header by hand: HMAC-SHA256 over `${timestamp}.${payload}`,
 * computed with Web Crypto, compared in constant time. This is Stripe's own documented scheme
 * (https://docs.stripe.com/webhooks#verify-manually) reimplemented rather than imported, for the
 * same no-SDK reason as the rest of this file.
 *
 * `payload` must be the exact raw request body — not `JSON.parse`'d and restringified, which
 * would not byte-for-byte match what Stripe signed. The caller (`webhook.ts`) is responsible for
 * reading the body as text before this function ever sees it.
 *
 * The header can carry more than one `v1=` value during Stripe's own signing-secret rotation, so
 * every candidate is checked and any match is accepted.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  let timestamp: number | undefined;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = Number.parseInt(value, 10);
    if (key === "v1" && value.length > 0) candidates.push(value);
  }
  if (timestamp === undefined || !Number.isFinite(timestamp) || candidates.length === 0) return false;
  // Absolute difference, not "not yet expired": a clock running fast on either side is caught
  // the same way a genuinely stale or replayed header is, which matches Stripe's own guidance.
  if (Math.abs(now - timestamp) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expectedHex = Buffer.from(digest).toString("hex");
  // Every candidate is compared — short-circuiting on the first mismatch is fine, since
  // constantTimeEqual is itself constant-time and which candidate wins carries no secret.
  return candidates.some((candidate) => constantTimeEqual(candidate, expectedHex));
}
