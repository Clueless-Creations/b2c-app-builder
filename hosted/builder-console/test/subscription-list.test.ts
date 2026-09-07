/**
 * `listCustomerSubscriptions` (billing/reconcile.ts) follows Stripe's `has_more` with
 * `starting_after` and reports whether it reached the end. Both the reconciliation sweep and the
 * console's return-from-Stripe resync read through it, and the resync retires entitlements
 * based on what it did NOT see — so a truncated list has to say so.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { listCustomerSubscriptions } from "../billing/reconcile.js";
import { pickCurrentSubscription } from "../billing/entitlement-policy.js";

function pagedFetch(pages: readonly { readonly data: unknown[]; readonly has_more: boolean }[], seen: string[]): typeof fetch {
  let index = 0;
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    const page = pages[Math.min(index, pages.length - 1)]!;
    index += 1;
    return new Response(JSON.stringify({ object: "list", ...page }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("follows has_more with starting_after and returns every page whole", async () => {
  const seen: string[] = [];
  const result = await listCustomerSubscriptions("cus_paged0001", {
    secretKey: "rk_test_paged",
    fetchImpl: pagedFetch(
      [
        { data: [{ id: "sub_page1a", status: "canceled", items: { data: [] } }, { id: "sub_page1b", status: "canceled" }], has_more: true },
        { data: [{ id: "sub_page2a", status: "active", extra: "kept" }], has_more: false },
      ],
      seen,
    ),
  });
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.data.map((entry) => (entry as { id: string }).id),
    ["sub_page1a", "sub_page1b", "sub_page2a"],
  );
  assert.equal((result.data[2] as { extra?: string }).extra, "kept", "elements must pass through whole, not stripped to the fields the envelope names");
  assert.equal(seen.length, 2);
  const second = new URL(seen[1]!);
  assert.equal(second.searchParams.get("starting_after"), "sub_page1b");
  assert.equal(second.searchParams.get("customer"), "cus_paged0001");
  assert.equal(second.searchParams.get("status"), "all");
  assert.equal(second.searchParams.get("limit"), "100");
});

test("passes the price filter through for the reconciliation sweep", async () => {
  const seen: string[] = [];
  await listCustomerSubscriptions("cus_paged0002", { secretKey: "rk_test_paged", priceId: "price_X", fetchImpl: pagedFetch([{ data: [], has_more: false }], seen) });
  assert.equal(new URL(seen[0]!).searchParams.get("price"), "price_X");
});

test("stops at the page cap and reports the list as incomplete rather than looping", async () => {
  const seen: string[] = [];
  const result = await listCustomerSubscriptions("cus_paged0003", {
    secretKey: "rk_test_paged",
    fetchImpl: pagedFetch([{ data: [{ id: "sub_forever" }], has_more: true }], seen),
  });
  assert.equal(result.complete, false);
  assert.equal(seen.length, 10);
});

test("a body that is not a Stripe list throws rather than reading as an empty list", async () => {
  await assert.rejects(
    listCustomerSubscriptions("cus_paged0004", {
      secretKey: "rk_test_paged",
      fetchImpl: (async () => new Response(JSON.stringify({ object: "list" }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch,
    }),
  );
});

test("pickCurrentSubscription prefers the newest entitled subscription and otherwise the newest of all", () => {
  const now = new Date("2026-09-06T12:00:00.000Z");
  const canceledNewest = { id: "c", status: "canceled" as const, pastDueSince: null };
  const activeOlder = { id: "a", status: "active" as const, pastDueSince: null };
  const pastDueExpired = { id: "p", status: "past_due" as const, pastDueSince: "2026-08-01T00:00:00.000Z" };
  assert.equal(pickCurrentSubscription([canceledNewest, activeOlder], now)?.id, "a");
  assert.equal(pickCurrentSubscription([pastDueExpired, activeOlder], now)?.id, "a", "an expired grace window is not entitled");
  assert.equal(pickCurrentSubscription([canceledNewest, pastDueExpired], now)?.id, "c", "with nothing entitled, the newest row describes the account");
  const pastDueInGraceNewest = { id: "g", status: "past_due" as const, pastDueSince: new Date(now.getTime() - 60_000).toISOString() };
  assert.equal(pickCurrentSubscription([pastDueInGraceNewest, activeOlder], now)?.id, "a", "a plan in good standing outranks one in its grace window, even when the grace one was observed later");
  assert.equal(pickCurrentSubscription([pastDueInGraceNewest, canceledNewest], now)?.id, "g", "inside its grace window, past due is still the plan in force");
  assert.equal(pickCurrentSubscription([], now), null);
});
