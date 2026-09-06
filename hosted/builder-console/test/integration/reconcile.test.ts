/**
 * The scheduled reconciliation sweeps (`billing/reconcile.ts`) against a real, migrated,
 * in-process D1 (test/support/d1.ts), with Stripe stubbed by an injected `fetchImpl` — the same
 * dependency-injection style `billing/stripe.ts` already uses, matching
 * `test/integration/stripe-webhook.test.ts`'s own approach to a real handler over a real
 * database.
 *
 * Each test creates and disposes its own database, unlike stripe-webhook.test.ts's one shared
 * harness. Both reconciliation sweeps here run genuine cross-tenant scans (that is the whole
 * point of a scheduled sweep with no single tenant's request behind it), so a database shared
 * across test cases would let one test's rows show up in another's scan — tenant.test.ts's own
 * "a D1 outage..." test uses the same one-database-per-test shape for the same reason.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { PAST_DUE_GRACE_MS } from "../../billing/entitlement-policy.js";
import { reconcileStaleEntitlements } from "../../billing/reconcile.js";
import { tenantDb, type AccountId } from "../../../knowledge-mcp/db/tenant.js";
import { createTestDatabase } from "../support/d1.js";

const LOOKUP_KEY = "b2c:read"; // seedAccountInto's own default entitlement key (test/support/d1.ts).
const SECRET_KEY = "rk_test_reconcile_only";

/** Routes by path fragment, matching billing/stripe.ts's own request shape closely enough for these two endpoints. */
function fakeStripeFetch(responses: { readonly prices?: unknown; readonly subscriptions?: unknown }): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
    const body = url.includes("/v1/prices")
      ? (responses.prices ?? { data: [] })
      : url.includes("/v1/subscriptions")
        ? (responses.subscriptions ?? { data: [] })
        : { data: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("the staleness sweep, told by Stripe that a subscription is past_due, keeps access when it is inside the grace window — and stamps the mirror as the first observer", async () => {
  const harness = await createTestDatabase();
  try {
    const accountId = "acct-recon-stale-grace";
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await harness.seedAccount({
      accountId,
      userId: "user-recon-stale-grace",
      googleSub: "google-recon-stale-grace",
      email: "recon-stale-grace@example.com",
      stripeCustomerId: "cus_reconstalegr1",
      keyId: "key-recon-stale-grace",
      keyDigest: "a".repeat(64),
      entitled: true,
      // Well past ENTITLEMENT_STALENESS_CEILING_MS (24h), so the staleness sweep picks this up.
      entitlementSyncedAt: twoDaysAgo.toISOString(),
    });
    const tenant = tenantDb(harness.db);
    // The mirror still says `active` — the webhook that would have caught up to Stripe's own
    // past_due report has not landed yet. Reconciliation is about to be the first observer.
    await tenant.upsertSubscription(
      accountId as AccountId,
      {
        id: "sub_reconstalegr1",
        stripeCustomerId: "cus_reconstalegr1",
        status: "active",
        priceId: null,
        isGifted: false,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        observedAt: twoDaysAgo.toISOString(),
      },
      twoDaysAgo,
    );

    const summary = await reconcileStaleEntitlements(tenant, {
      secretKey: SECRET_KEY,
      now,
      fetchImpl: fakeStripeFetch({
        prices: { data: [{ id: "price_reconstalegr1" }] },
        subscriptions: { data: [{ id: "sub_reconstalegr1", status: "past_due" }] },
      }),
    });

    assert.deepEqual(summary.staleness, { scanned: 1, updated: 1, failed: 0 });
    const entitlement = await harness.readEntitlement(accountId, LOOKUP_KEY);
    assert.equal(entitlement?.active, 1, "past_due inside the grace window must keep access, not revoke it");
    assert.equal(entitlement?.source, "stripe_reconciliation");

    const mirror = await harness.readSubscriptionMirror("sub_reconstalegr1");
    assert.equal(mirror?.pastDueSince, now.toISOString(), "reconciliation, as the first observer, must stamp the mirror itself");
  } finally {
    await harness.dispose();
  }
});

test("the grace sweep revokes an entitlement whose past_due stamp is older than the window, deterministically — no staleness wait, no Stripe call needed", async () => {
  const harness = await createTestDatabase();
  try {
    const accountId = "acct-recon-over-grace";
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - (PAST_DUE_GRACE_MS + 24 * 60 * 60 * 1000));
    await harness.seedAccount({
      accountId,
      userId: "user-recon-over-grace",
      googleSub: "google-recon-over-grace",
      email: "recon-over-grace@example.com",
      stripeCustomerId: "cus_reconovergrace",
      keyId: "key-recon-over-grace",
      keyDigest: "b".repeat(64),
      entitled: true,
      // Fresh relative to `now`, so the (unrelated) staleness sweep leaves this row alone — this
      // test isolates the grace sweep's own deterministic revoke from staleness-driven refresh.
      entitlementSyncedAt: now.toISOString(),
    });
    const tenant = tenantDb(harness.db);
    // Entered past_due eight days before `now` — one day past the seven-day window.
    await tenant.upsertSubscription(
      accountId as AccountId,
      {
        id: "sub_reconovergrace",
        stripeCustomerId: "cus_reconovergrace",
        status: "past_due",
        priceId: null,
        isGifted: false,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        observedAt: eightDaysAgo.toISOString(),
      },
      eightDaysAgo,
    );

    const summary = await reconcileStaleEntitlements(tenant, {
      secretKey: SECRET_KEY,
      now,
      // The staleness sweep has nothing stale to look at here (synced_at is fresh), so it never
      // calls fetch at all — asserting `staleness.scanned: 0` below is the direct proof.
      fetchImpl: fakeStripeFetch({}),
    });

    assert.deepEqual(summary.staleness, { scanned: 0, updated: 0, failed: 0 }, "the staleness sweep must have nothing to do here");
    assert.deepEqual(summary.graceSweep, { scanned: 1, revoked: 1, failed: 0 });

    const entitlement = await harness.readEntitlement(accountId, LOOKUP_KEY);
    assert.equal(entitlement?.active, 0, "a past_due subscription over its grace window must be revoked");
    assert.equal(entitlement?.source, "stripe_reconciliation");
  } finally {
    await harness.dispose();
  }
});

test("the grace sweep leaves a past_due subscription alone while it is still inside its window", async () => {
  const harness = await createTestDatabase();
  try {
    const accountId = "acct-recon-inside-grace";
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    await harness.seedAccount({
      accountId,
      userId: "user-recon-inside-grace",
      googleSub: "google-recon-inside-grace",
      email: "recon-inside-grace@example.com",
      stripeCustomerId: "cus_reconinsidegr1",
      keyId: "key-recon-inside-grace",
      keyDigest: "c".repeat(64),
      entitled: true,
      entitlementSyncedAt: now.toISOString(),
    });
    const tenant = tenantDb(harness.db);
    await tenant.upsertSubscription(
      accountId as AccountId,
      {
        id: "sub_reconinsidegr1",
        stripeCustomerId: "cus_reconinsidegr1",
        status: "past_due",
        priceId: null,
        isGifted: false,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        observedAt: threeDaysAgo.toISOString(),
      },
      threeDaysAgo,
    );

    const summary = await reconcileStaleEntitlements(tenant, { secretKey: SECRET_KEY, now, fetchImpl: fakeStripeFetch({}) });

    // listOverGracePastDueSubscriptions only returns rows already past the cutoff, so a
    // three-day-old stamp never reaches the grace sweep's per-row loop at all.
    assert.deepEqual(summary.graceSweep, { scanned: 0, revoked: 0, failed: 0 });
    const entitlement = await harness.readEntitlement(accountId, LOOKUP_KEY);
    assert.equal(entitlement?.active, 1, "still inside the window — must not be touched");
  } finally {
    await harness.dispose();
  }
});

test("the staleness sweep revokes a past_due subscription this Worker has never mirrored, and keeps it revoked across repeated sweeps — no mirror row means no grace anchor", async () => {
  const harness = await createTestDatabase();
  try {
    const accountId = "acct-recon-unmirrored";
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await harness.seedAccount({
      accountId,
      userId: "user-recon-unmirrored",
      googleSub: "google-recon-unmirrored",
      email: "recon-unmirrored@example.com",
      stripeCustomerId: "cus_reconunmirror1",
      keyId: "key-recon-unmirrored",
      keyDigest: "b".repeat(64),
      entitled: true,
      entitlementSyncedAt: twoDaysAgo.toISOString(),
    });
    const tenant = tenantDb(harness.db);
    // Deliberately no upsertSubscription: the entitlement exists (an invoice.paid granted it) but
    // no subscription event was ever mirrored, so there is no row for a dunning stamp to live on.
    const stripe = fakeStripeFetch({
      prices: { data: [{ id: "price_reconunmirror1" }] },
      subscriptions: { data: [{ id: "sub_reconunmirror1", status: "past_due" }] },
    });

    const first = await reconcileStaleEntitlements(tenant, { secretKey: SECRET_KEY, now, fetchImpl: stripe });
    assert.deepEqual(first.staleness, { scanned: 1, updated: 1, failed: 0 });
    assert.equal((await harness.readEntitlement(accountId, LOOKUP_KEY))?.active, 0, "past_due with no mirror row must fail closed");
    assert.equal(await harness.readSubscriptionMirror("sub_reconunmirror1"), null, "reconciliation must not invent a mirror row");

    // Ten more daily sweeps, each treating everything as stale: access must never come back.
    for (let day = 1; day <= 10; day += 1) {
      const later = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);
      await reconcileStaleEntitlements(tenant, { secretKey: SECRET_KEY, now: later, olderThan: later, fetchImpl: stripe });
      assert.equal((await harness.readEntitlement(accountId, LOOKUP_KEY))?.active, 0, `day ${day}: an unmirrored past_due subscription must stay revoked`);
    }
  } finally {
    await harness.dispose();
  }
});

test("the grace sweep does not rescan a subscription it has already revoked, so a capped run cannot starve newer over-grace rows", async () => {
  const harness = await createTestDatabase();
  try {
    const accountId = "acct-recon-grace-once";
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - (PAST_DUE_GRACE_MS + 24 * 60 * 60 * 1000));
    await harness.seedAccount({
      accountId,
      userId: "user-recon-grace-once",
      googleSub: "google-recon-grace-once",
      email: "recon-grace-once@example.com",
      stripeCustomerId: "cus_recongraceonce1",
      keyId: "key-recon-grace-once",
      keyDigest: "c".repeat(64),
      entitled: true,
    });
    const tenant = tenantDb(harness.db);
    await tenant.upsertSubscription(
      accountId as AccountId,
      {
        id: "sub_recongraceonce1",
        stripeCustomerId: "cus_recongraceonce1",
        status: "past_due",
        priceId: null,
        isGifted: false,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        observedAt: eightDaysAgo.toISOString(),
      },
      eightDaysAgo,
    );

    const first = await reconcileStaleEntitlements(tenant, { secretKey: SECRET_KEY, now, fetchImpl: fakeStripeFetch({}) });
    assert.deepEqual(first.graceSweep, { scanned: 1, revoked: 1, failed: 0 });
    assert.equal((await harness.readEntitlement(accountId, LOOKUP_KEY))?.active, 0);

    const second = await reconcileStaleEntitlements(tenant, { secretKey: SECRET_KEY, now, fetchImpl: fakeStripeFetch({}) });
    assert.deepEqual(second.graceSweep, { scanned: 0, revoked: 0, failed: 0 }, "an already-revoked subscription must drop out of the sweep");
  } finally {
    await harness.dispose();
  }
});
