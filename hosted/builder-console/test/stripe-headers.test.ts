/**
 * The two headers every Stripe call must carry. The live restricted key turned out to be an
 * organization-level key: without `Stripe-Version` Stripe answers "You did not provide an API
 * version", and without `Stripe-Context` naming the account it answers "Please include the
 * Stripe-Context header". Pinned here so a refactor of `stripeApiRequest` cannot drop either.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { STRIPE_API_VERSION, stripeApiRequest } from "../billing/stripe.js";

function capturingFetch(seen: Headers[]): typeof fetch {
  return (async (_input: string | URL | Request, init?: RequestInit) => {
    seen.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("every Stripe request pins the API version and names the account when one is configured", async () => {
  const seen: Headers[] = [];
  await stripeApiRequest("/v1/prices?limit=1", { method: "GET", secretKey: "rk_test_headers", accountId: "acct_123", fetchImpl: capturingFetch(seen) });
  assert.equal(seen[0]?.get("Stripe-Version"), STRIPE_API_VERSION);
  assert.equal(seen[0]?.get("Stripe-Context"), "acct_123");
});

test("without a configured account the context header is absent and the version is still pinned", async () => {
  const seen: Headers[] = [];
  await stripeApiRequest("/v1/prices?limit=1", { method: "GET", secretKey: "rk_test_headers", fetchImpl: capturingFetch(seen) });
  assert.equal(seen[0]?.get("Stripe-Version"), STRIPE_API_VERSION);
  assert.equal(seen[0]?.get("Stripe-Context"), null);
});
