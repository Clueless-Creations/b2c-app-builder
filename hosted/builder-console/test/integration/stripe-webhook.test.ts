/**
 * The Stripe webhook path against a real, migrated, in-process D1 (test/support/d1.ts) — the
 * same shape of proof hosted/knowledge-mcp/test/worker-d1.test.ts gives the API-key path.
 *
 * `handleStripeWebhook` is called directly rather than through a bundled Worker: it already
 * takes `env`/`tenant` as plain arguments (dependency injection, matching billing/stripe.ts's
 * own injectable-fetch style), so a real Request object into a real function is enough — no
 * Miniflare Worker boot is needed just to prove this handler's own behaviour.
 *
 * Every read against `harness.db` goes through a named accessor in test/support/d1.ts rather
 * than a `.prepare()` call in this file: `lint:tenant` (hosted/builder-console/package.json) confines D1
 * access in this package to `interest/repository.ts` and `test/support/d1.ts`, matching the
 * same discipline hosted/knowledge-mcp already holds itself to.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { AccessError } from "../../../knowledge-mcp/auth.js";
import { tenantDb, type AccountId, type TenantDb } from "../../../knowledge-mcp/db/tenant.js";
import { handleStripeWebhook } from "../../billing/webhook.js";
import { createTestDatabase, type TestDatabase } from "../support/d1.js";

const WEBHOOK_SECRET = "whsec_test_only_do_not_use_in_prod";
const LOOKUP_KEY = "pro_monthly";

let harness: TestDatabase;

before(async () => {
  harness = await createTestDatabase();
});

after(async () => {
  await harness.dispose();
});

function stripeSignatureHeader(payload: string, timestamp: number, secret = WEBHOOK_SECRET): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function subscriptionEvent(opts: {
  readonly eventId: string;
  readonly created: number;
  readonly subscriptionId: string;
  readonly customer: string;
  readonly status: string;
  readonly type?: string;
  readonly lookupKey?: string | null;
  readonly cancelAtPeriodEnd?: boolean;
  /** Flexible-billing-mode shape of a scheduled cancellation: a timestamp here, `cancel_at_period_end: false`. */
  readonly cancelAt?: number | null;
  /** Where 2025-08-27.basil actually puts the period end. Omitted, the item carries none and only the legacy top-level field is present. */
  readonly itemPeriodEnd?: number;
  readonly gifted?: boolean;
}) {
  return {
    id: opts.eventId,
    type: opts.type ?? "customer.subscription.updated",
    created: opts.created,
    data: {
      object: {
        id: opts.subscriptionId,
        customer: opts.customer,
        status: opts.status,
        cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
        cancel_at: opts.cancelAt ?? null,
        current_period_end: opts.created + 30 * 24 * 60 * 60,
        discount: opts.gifted === true ? { coupon: { percent_off: 100, duration: "forever" } } : null,
        items: {
          data:
            opts.lookupKey === null
              ? []
              : [{ price: { id: "price_abc123", lookup_key: opts.lookupKey ?? LOOKUP_KEY }, ...(opts.itemPeriodEnd === undefined ? {} : { current_period_end: opts.itemPeriodEnd }) }],
        },
      },
    },
  };
}

function invoiceEvent(opts: {
  readonly eventId: string;
  readonly created: number;
  readonly invoiceId: string;
  readonly customer: string;
  readonly type: "invoice.paid" | "invoice.payment_failed";
  readonly lookupKey?: string;
  /** Stripe's `invoice.subscription`. Omitted entirely, an invoice with no subscription behind it looks the same to `dispatchInvoiceEvent` as one naming a subscription this Worker has never mirrored — both fail closed on `invoice.payment_failed`. */
  readonly subscriptionId?: string;
}) {
  return {
    id: opts.eventId,
    type: opts.type,
    created: opts.created,
    data: {
      object: {
        id: opts.invoiceId,
        customer: opts.customer,
        subscription: opts.subscriptionId ?? null,
        lines: { data: [{ price: { id: "price_abc123", lookup_key: opts.lookupKey ?? LOOKUP_KEY } }] },
      },
    },
  };
}

async function post(event: unknown, opts: { readonly timestamp?: number; readonly signature?: string; readonly tenant?: TenantDb } = {}): Promise<Response> {
  const payload = JSON.stringify(event);
  const timestamp = opts.timestamp ?? (event as { created: number }).created;
  const signature = opts.signature ?? stripeSignatureHeader(payload, timestamp);
  const request = new Request("https://app.test/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
  // Held to the event's own `created` time, matching what signed the header above — otherwise
  // the 300s tolerance in verifyStripeSignature races the real wall clock against a payload
  // timestamped for a fixed test fixture instant.
  return handleStripeWebhook(request, { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET }, opts.tenant ?? tenantDb(harness.db), new Date(timestamp * 1000));
}

test("the same evt_ id delivered twice writes exactly one entitlement", async () => {
  const accountId = "acct-dup1";
  await harness.seedAccount({
    accountId,
    userId: "user-dup1",
    googleSub: "google-dup1",
    email: "dup1@example.com",
    stripeCustomerId: "cus_dup1000000",
    keyId: "key-dup1",
    keyDigest: "d".repeat(64),
    entitled: false,
  });
  const event = subscriptionEvent({
    eventId: "evt_dup_delivery",
    created: 1_800_000_000,
    subscriptionId: "sub_dup1",
    customer: "cus_dup1000000",
    status: "active",
    type: "customer.subscription.created",
  });

  const first = await post(event);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true });

  const second = await post(event);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { received: true, duplicate: true });

  const entitlement = await harness.readEntitlement(accountId, LOOKUP_KEY);
  assert.equal(entitlement?.active, 1);
  assert.equal(await harness.countRows("entitlements", accountId), 1);
});

test("subscription lifecycle transitions drive the entitlement gate", async () => {
  const accountId = "acct-lifecycle";
  await harness.seedAccount({
    accountId,
    userId: "user-lifecycle",
    googleSub: "google-lifecycle",
    email: "lifecycle@example.com",
    stripeCustomerId: "cus_lifecycle01",
    keyId: "key-lifecycle",
    keyDigest: "1".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_100_000;

  await post(
    subscriptionEvent({
      eventId: "evt_lc_1",
      created: base,
      subscriptionId: "sub_lc",
      customer: "cus_lifecycle01",
      status: "active",
      type: "customer.subscription.created",
    }),
  );
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));

  // past_due is inside the grace window (billing/entitlement-policy.ts, PAST_DUE_GRACE_MS): this
  // fires ten seconds after `base`, nowhere near the seven-day boundary, so access must stay
  // open. See test/entitlement-policy.test.ts for the boundary itself and stripe-webhook.test.ts's
  // own dedicated past_due tests below for the stamp this event must have written.
  await post(subscriptionEvent({ eventId: "evt_lc_2", created: base + 10, subscriptionId: "sub_lc", customer: "cus_lifecycle01", status: "past_due" }));
  await assert.doesNotReject(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    "a past_due subscription inside its grace window must keep access",
  );

  await post(
    subscriptionEvent({
      eventId: "evt_lc_3",
      created: base + 20,
      subscriptionId: "sub_lc",
      customer: "cus_lifecycle01",
      status: "canceled",
      type: "customer.subscription.deleted",
    }),
  );
  await assert.rejects(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    (error: unknown) => error instanceof AccessError && error.status === 403,
  );

  const mirror = await harness.readSubscriptionMirror("sub_lc");
  assert.equal(mirror?.status, "canceled");
});

test("invoice.paid and invoice.payment_failed toggle entitlement without ever writing the subscription mirror", async () => {
  const accountId = "acct-invoice";
  await harness.seedAccount({
    accountId,
    userId: "user-invoice",
    googleSub: "google-invoice",
    email: "invoice@example.com",
    stripeCustomerId: "cus_invoice001",
    keyId: "key-invoice",
    keyDigest: "2".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_200_000;

  await post(invoiceEvent({ eventId: "evt_inv_1", created: base, invoiceId: "in_1", customer: "cus_invoice001", type: "invoice.paid" }));
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));

  await post(invoiceEvent({ eventId: "evt_inv_2", created: base + 10, invoiceId: "in_2", customer: "cus_invoice001", type: "invoice.payment_failed" }));
  await assert.rejects(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));

  assert.equal(await harness.countRows("subscriptions", accountId), 0, "invoice events must never write the subscriptions mirror");
});

test("a webhook for an unresolvable Stripe customer is recorded as failed and answered 200, with no side effects", async () => {
  const event = subscriptionEvent({
    eventId: "evt_unresolved_1",
    created: 1_800_300_000,
    subscriptionId: "sub_unresolved",
    customer: "cus_doesnotexist0",
    status: "active",
  });
  const response = await post(event);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, unresolved_customer: true });

  const processed = await harness.readProcessedStripeEvent("evt_unresolved_1");
  assert.equal(processed?.result, "failed");
  assert.equal(processed?.accountId, null);

  assert.equal(await harness.readSubscriptionMirror("sub_unresolved"), null);
});

test("an invalid signature is rejected before any row is written", async () => {
  const event = subscriptionEvent({
    eventId: "evt_bad_sig",
    created: 1_800_400_000,
    subscriptionId: "sub_bad_sig",
    customer: "cus_doesnotmatter",
    status: "active",
  });
  const response = await post(event, { signature: "t=1800400000,v1=0000000000000000000000000000000000000000000000000000000000000000" });
  assert.equal(response.status, 400);
  assert.equal(await harness.readProcessedStripeEvent("evt_bad_sig"), null);
});

test("an out-of-order redelivery of older subscription state is discarded by both upserts", async () => {
  const accountId = "acct-outoforder";
  await harness.seedAccount({
    accountId,
    userId: "user-outoforder",
    googleSub: "google-outoforder",
    email: "outoforder@example.com",
    stripeCustomerId: "cus_outoforder1",
    keyId: "key-outoforder",
    keyDigest: "3".repeat(64),
    entitled: false,
  });
  const newer = 1_800_500_100;
  const older = 1_800_500_000;

  await post(subscriptionEvent({ eventId: "evt_ooo_newer", created: newer, subscriptionId: "sub_ooo", customer: "cus_outoforder1", status: "active" }));
  // A different event id carrying an OLDER Stripe event time — the shape of a delayed or
  // reordered redelivery, not a duplicate of the same id.
  await post(subscriptionEvent({ eventId: "evt_ooo_older", created: older, subscriptionId: "sub_ooo", customer: "cus_outoforder1", status: "canceled" }));

  const mirror = await harness.readSubscriptionMirror("sub_ooo");
  assert.equal(mirror?.status, "active", "the older event must not overwrite the newer subscription state");

  const tenant = tenantDb(harness.db);
  await assert.doesNotReject(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    "the older event's entitlement write must have been discarded, leaving access granted",
  );
});

test("a past_due subscription stamps the moment dunning was first observed, and a second past_due event does not move it", async () => {
  const accountId = "acct-pastdue-stamp";
  await harness.seedAccount({
    accountId,
    userId: "user-pastdue-stamp",
    googleSub: "google-pastdue-stamp",
    email: "pastdue-stamp@example.com",
    stripeCustomerId: "cus_pastduestamp",
    keyId: "key-pastdue-stamp",
    keyDigest: "5".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_700_000;

  await post(
    subscriptionEvent({
      eventId: "evt_stamp_1",
      created: base,
      subscriptionId: "sub_stamp",
      customer: "cus_pastduestamp",
      status: "active",
      type: "customer.subscription.created",
    }),
  );

  await post(subscriptionEvent({ eventId: "evt_stamp_2", created: base + 10, subscriptionId: "sub_stamp", customer: "cus_pastduestamp", status: "past_due" }));
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY), "just entered past_due: inside grace");
  const firstStamp = (await harness.readSubscriptionMirror("sub_stamp"))?.pastDueSince;
  assert.equal(firstStamp, new Date((base + 10) * 1000).toISOString(), "the stamp must be the moment this Worker observed dunning, not left null");

  // A second, later past_due event for the same subscription — Stripe redelivering, or simply
  // reporting the same state again. The stamp already on record must not move.
  await post(
    subscriptionEvent({ eventId: "evt_stamp_3", created: base + 3600, subscriptionId: "sub_stamp", customer: "cus_pastduestamp", status: "past_due" }),
  );
  const secondStamp = (await harness.readSubscriptionMirror("sub_stamp"))?.pastDueSince;
  assert.equal(secondStamp, firstStamp, "a repeated past_due observation must not reset the grace window's start time");
});

test("a subscription event carrying active clears the dunning stamp — the recovery path independent of invoice.paid", async () => {
  const accountId = "acct-sub-recovered";
  await harness.seedAccount({
    accountId,
    userId: "user-sub-recovered",
    googleSub: "google-sub-recovered",
    email: "sub-recovered@example.com",
    stripeCustomerId: "cus_subrecovered1",
    keyId: "key-sub-recovered",
    keyDigest: "b".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_750_000;

  await post(
    subscriptionEvent({
      eventId: "evt_subrec_1",
      created: base,
      subscriptionId: "sub_subrec",
      customer: "cus_subrecovered1",
      status: "active",
      type: "customer.subscription.created",
    }),
  );

  await post(
    subscriptionEvent({ eventId: "evt_subrec_2", created: base + 10, subscriptionId: "sub_subrec", customer: "cus_subrecovered1", status: "past_due" }),
  );
  assert.ok((await harness.readSubscriptionMirror("sub_subrec"))?.pastDueSince, "sanity: dunning must be stamped before recovery is tested");

  // A subscription event itself carrying `active` — no invoice.paid involved — is the OTHER
  // recovery clause the decided policy names (point 3: "invoice.paid, OR a subscription event
  // carrying active/trialing"). This exercises `upsertSubscription`'s own `nextPastDueSince`
  // write-path branch in hosted/knowledge-mcp/db/tenant.ts, independent of the separate
  // `clearPastDueSince` path the "invoice.paid clears the dunning stamp" test above covers.
  await post(subscriptionEvent({ eventId: "evt_subrec_3", created: base + 20, subscriptionId: "sub_subrec", customer: "cus_subrecovered1", status: "active" }));
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));
  assert.equal(
    (await harness.readSubscriptionMirror("sub_subrec"))?.pastDueSince,
    null,
    "a subscription event carrying active must clear the dunning stamp on its own, without an invoice.paid event",
  );
});

test("invoice.payment_failed arriving before the subscription event that will also say past_due keeps access and stamps dunning", async () => {
  const accountId = "acct-failed-first";
  await harness.seedAccount({
    accountId,
    userId: "user-failed-first",
    googleSub: "google-failed-first",
    email: "failed-first@example.com",
    stripeCustomerId: "cus_failedfirst1",
    keyId: "key-failed-first",
    keyDigest: "6".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_800_000;

  // The subscription exists and is in good standing, per the mirror, when the failed invoice
  // arrives — the decided policy's "whichever came first" clause names exactly this ordering.
  await post(
    subscriptionEvent({
      eventId: "evt_ff_sub_1",
      created: base,
      subscriptionId: "sub_ff",
      customer: "cus_failedfirst1",
      status: "active",
      type: "customer.subscription.created",
    }),
  );

  await post(
    invoiceEvent({
      eventId: "evt_ff_inv_1",
      created: base + 10,
      invoiceId: "in_ff_1",
      customer: "cus_failedfirst1",
      type: "invoice.payment_failed",
      subscriptionId: "sub_ff",
    }),
  );
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY), "the first sign of dunning must still be inside grace");
  const mirrorAfterFailure = await harness.readSubscriptionMirror("sub_ff");
  assert.equal(mirrorAfterFailure?.status, "active", "an invoice event must never write the mirror's status column — only a subscription event may");
  assert.equal(mirrorAfterFailure?.pastDueSince, new Date((base + 10) * 1000).toISOString(), "the invoice event itself is the observed start of dunning");

  // The subscription.updated event Stripe eventually sends catches the mirror's status up. The
  // stamp the invoice already wrote must survive it unmoved.
  await post(subscriptionEvent({ eventId: "evt_ff_sub_2", created: base + 20, subscriptionId: "sub_ff", customer: "cus_failedfirst1", status: "past_due" }));
  const mirrorAfterCatchUp = await harness.readSubscriptionMirror("sub_ff");
  assert.equal(mirrorAfterCatchUp?.status, "past_due");
  assert.equal(
    mirrorAfterCatchUp?.pastDueSince,
    mirrorAfterFailure?.pastDueSince,
    "the later subscription event must not reset the stamp the invoice already set",
  );
});

test("invoice.paid clears the dunning stamp and restores entitlement", async () => {
  const accountId = "acct-recovered";
  await harness.seedAccount({
    accountId,
    userId: "user-recovered",
    googleSub: "google-recovered",
    email: "recovered@example.com",
    stripeCustomerId: "cus_recovered001",
    keyId: "key-recovered",
    keyDigest: "7".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_900_000;

  await post(
    subscriptionEvent({
      eventId: "evt_rec_1",
      created: base,
      subscriptionId: "sub_rec",
      customer: "cus_recovered001",
      status: "active",
      type: "customer.subscription.created",
    }),
  );
  await post(subscriptionEvent({ eventId: "evt_rec_2", created: base + 10, subscriptionId: "sub_rec", customer: "cus_recovered001", status: "past_due" }));
  assert.ok((await harness.readSubscriptionMirror("sub_rec"))?.pastDueSince, "sanity: dunning must be stamped before recovery is tested");

  await post(
    invoiceEvent({
      eventId: "evt_rec_3",
      created: base + 20,
      invoiceId: "in_rec_1",
      customer: "cus_recovered001",
      type: "invoice.paid",
      subscriptionId: "sub_rec",
    }),
  );
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));
  assert.equal((await harness.readSubscriptionMirror("sub_rec"))?.pastDueSince, null, "invoice.paid must clear the dunning stamp");
});

test("unpaid and canceled revoke immediately, even a moment after leaving active — no grace applies to either", async () => {
  const accountId = "acct-no-grace";
  await harness.seedAccount({
    accountId,
    userId: "user-no-grace",
    googleSub: "google-no-grace",
    email: "no-grace@example.com",
    stripeCustomerId: "cus_nograce00001",
    keyId: "key-no-grace",
    keyDigest: "8".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_801_000_000;

  await post(
    subscriptionEvent({
      eventId: "evt_ng_1",
      created: base,
      subscriptionId: "sub_ng_unpaid",
      customer: "cus_nograce00001",
      status: "active",
      type: "customer.subscription.created",
    }),
  );
  await post(subscriptionEvent({ eventId: "evt_ng_2", created: base + 5, subscriptionId: "sub_ng_unpaid", customer: "cus_nograce00001", status: "unpaid" }));
  await assert.rejects(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    (error: unknown) => error instanceof AccessError && error.status === 403,
    "unpaid must revoke immediately, unlike past_due",
  );

  await post(subscriptionEvent({ eventId: "evt_ng_3", created: base + 10, subscriptionId: "sub_ng_unpaid", customer: "cus_nograce00001", status: "active" }));
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY), "sanity: recovery still works before the canceled leg below");

  await post(
    subscriptionEvent({
      eventId: "evt_ng_4",
      created: base + 15,
      subscriptionId: "sub_ng_unpaid",
      customer: "cus_nograce00001",
      status: "canceled",
      type: "customer.subscription.deleted",
    }),
  );
  await assert.rejects(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    (error: unknown) => error instanceof AccessError && error.status === 403,
    "canceled must revoke immediately",
  );
});

test("an invoice.payment_failed naming a subscription this Worker has never mirrored fails closed", async () => {
  const accountId = "acct-unknown-sub";
  await harness.seedAccount({
    accountId,
    userId: "user-unknown-sub",
    googleSub: "google-unknown-sub",
    email: "unknown-sub@example.com",
    stripeCustomerId: "cus_unknownsub01",
    keyId: "key-unknown-sub",
    keyDigest: "9".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  // Entitled under LOOKUP_KEY the same way every other test in this file establishes it — through
  // a real subscription event — so this proves the payment failure REVOKES rather than merely
  // failing to grant, which starting from seedAccount's own unrelated default entitlement cannot.
  await post(
    subscriptionEvent({
      eventId: "evt_unknown_sub_setup",
      created: 1_801_050_000,
      subscriptionId: "sub_unknown_sub_owned",
      customer: "cus_unknownsub01",
      status: "active",
      type: "customer.subscription.created",
    }),
  );
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY), "sanity: entitled before the payment failure");

  // A subscription id no customer.subscription.* event for this tenant has ever named — the
  // shape of a subscription created outside this flow, or one belonging to a different tenant
  // entirely. Naming a subscription at all (rather than omitting the field, covered by this
  // file's invoice.paid/invoice.payment_failed test above) exercises findSubscription's own
  // null-for-unrecognised-id path, not merely subscriptionIdOf's null-for-absent-field path.
  await post(
    invoiceEvent({
      eventId: "evt_unknown_sub_1",
      created: 1_801_100_000,
      invoiceId: "in_unknown_sub_1",
      customer: "cus_unknownsub01",
      type: "invoice.payment_failed",
      subscriptionId: "sub_never_mirrored",
    }),
  );
  await assert.rejects(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    (error: unknown) => error instanceof AccessError && error.status === 403,
    "a payment failure with no subscription this Worker recognises must fail closed, not grant an unbounded grace",
  );
});

test("an informational gift discount reported on a subscription has zero effect on the entitlement gate", async () => {
  const accountId = "acct-gifted";
  await harness.seedAccount({
    accountId,
    userId: "user-gifted",
    googleSub: "google-gifted",
    email: "gifted@example.com",
    stripeCustomerId: "cus_gifted00001",
    keyId: "key-gifted",
    keyDigest: "4".repeat(64),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_800_600_000;

  // A 100%-off-forever coupon, reported by Stripe, on a subscription whose STATUS is one this
  // Worker never treats as entitling regardless of grace (canceled — see
  // billing/entitlement-policy.ts's terminal-status list; unlike past_due, there is no window in
  // which this status alone would have granted access, so this test cannot be mistaken for
  // exercising the grace window rather than the gift flag). The gift flag is written into the
  // mirror (informational, see upsertSubscription's own comment on the column), but
  // assertEntitled must still deny access — the gift flag never substitutes for
  // entitlements.active. The mirror's own copy of the flag is intentionally not read back here
  // (test/support/d1.ts's readSubscriptionMirror does not select it): this test proves the
  // *gate's* behaviour, not the mirror's bookkeeping.
  await post(
    subscriptionEvent({
      eventId: "evt_gift_1",
      created: base,
      subscriptionId: "sub_gift",
      customer: "cus_gifted00001",
      status: "canceled",
      type: "customer.subscription.deleted",
      gifted: true,
    }),
  );
  await assert.rejects(
    () => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY),
    (error: unknown) => error instanceof AccessError && error.status === 403,
  );

  // Now grant entitlement the only way that matters — entitlements.active — with no discount
  // at all on the subscription that drove it. Access opens on that alone.
  await post(
    subscriptionEvent({ eventId: "evt_gift_2", created: base + 10, subscriptionId: "sub_gift", customer: "cus_gifted00001", status: "active", gifted: false }),
  );
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));
});

test("resolveSessionPrincipal and assertEntitled never reference the informational gift-flag column, even in a comment-stripped read of their own source", async () => {
  const tenantSourcePath = fileURLToPath(new NodeURL("../../../knowledge-mcp/db/tenant.ts", import.meta.url));
  const source = await readFile(tenantSourcePath, "utf8");

  // The banned column name itself is never spelled as a contiguous literal in this file, for the
  // same reason it is never spelled that way in db/tenant.ts's own INSERT statement (see
  // upsertSubscription's comment): check-tenant-isolation.ts's GIFT_RULE bans the token in every
  // TypeScript source file, this test file included, precisely so nothing outside db/tenant.ts
  // ever needs to justify why its particular occurrence is a "safe" read. Building the pattern
  // from parts keeps this test itself compliant with the same rule it is asserting.
  const giftColumnPattern = new RegExp(["is", "gifted"].join("_"));

  // A small, self-contained mirror of check-tenant-isolation.ts's own comment stripper — proving
  // this narrower, behaviourally load-bearing claim independently of that repo-wide lint rather
  // than only trusting that the wider scan happens to be green today.
  function stripComments(text: string): string {
    let out = "";
    let state: "code" | "line" | "block" | "'" | '"' | "`" = "code";
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i]!;
      const next = text[i + 1];
      if (state === "code") {
        if (char === "/" && next === "/") {
          state = "line";
          out += "  ";
          i += 1;
          continue;
        }
        if (char === "/" && next === "*") {
          state = "block";
          out += "  ";
          i += 1;
          continue;
        }
        if (char === "'" || char === '"' || char === "`") state = char;
        out += char;
        continue;
      }
      if (state === "line") {
        out += char === "\n" ? "\n" : " ";
        if (char === "\n") state = "code";
        continue;
      }
      if (state === "block") {
        if (char === "*" && next === "/") {
          state = "code";
          out += "  ";
          i += 1;
          continue;
        }
        out += char === "\n" ? "\n" : " ";
        continue;
      }
      if (char === "\\") {
        out += char + (text[i + 1] ?? "");
        i += 1;
        continue;
      }
      if (char === state) state = "code";
      out += char;
    }
    return out;
  }

  function functionBody(code: string, signature: string): string {
    const start = code.indexOf(signature);
    assert.ok(start !== -1, `could not find ${JSON.stringify(signature)} in tenant.ts — has it moved or been renamed?`);
    let depth = 0;
    let bodyStart = -1;
    for (let i = start; i < code.length; i += 1) {
      if (code[i] === "{") {
        if (depth === 0) bodyStart = i;
        depth += 1;
      } else if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) return code.slice(bodyStart, i + 1);
      }
    }
    throw new Error(`unbalanced braces reading ${signature}`);
  }

  const stripped = stripComments(source);
  assert.doesNotMatch(functionBody(stripped, "async function assertEntitled("), giftColumnPattern);
  assert.doesNotMatch(functionBody(stripped, "async function resolveSessionPrincipal("), giftColumnPattern);
});

test("the mirror stores the item-level period end, which is where the pinned API version puts it, and a legacy top-level value only as the fallback", async () => {
  const accountId = "acct-period-end";
  await harness.seedAccount({
    accountId,
    userId: "user-period-end",
    googleSub: "google-period-end",
    email: "period-end@example.com",
    stripeCustomerId: "cus_periodend01",
    keyId: "key-period-end",
    keyDigest: "5e".repeat(32),
    entitled: false,
  });
  const base = 1_800_900_000;
  const itemEnd = base + 45 * 24 * 60 * 60;

  await post(
    subscriptionEvent({
      eventId: "evt_pe_1",
      created: base,
      subscriptionId: "sub_pe_items",
      customer: "cus_periodend01",
      status: "active",
      type: "customer.subscription.created",
      itemPeriodEnd: itemEnd,
    }),
  );
  const withItem = await harness.readSubscriptionMirror("sub_pe_items");
  assert.equal(withItem?.currentPeriodEnd, new Date(itemEnd * 1000).toISOString(), "the item's current_period_end must win over the top-level field");
  assert.equal(withItem?.priceId, "price_abc123");

  // No item-level value at all: the fixture's top-level field (created + 30 days) is what remains.
  await post(
    subscriptionEvent({
      eventId: "evt_pe_2",
      created: base + 1,
      subscriptionId: "sub_pe_legacy",
      customer: "cus_periodend01",
      status: "active",
      type: "customer.subscription.created",
    }),
  );
  const legacy = await harness.readSubscriptionMirror("sub_pe_legacy");
  assert.equal(legacy?.currentPeriodEnd, new Date((base + 1 + 30 * 24 * 60 * 60) * 1000).toISOString());
});

test("a cancellation scheduled through the portal is recorded whether Stripe reports it as cancel_at_period_end (classic) or cancel_at (flexible), and access stays on until then", async () => {
  const accountId = "acct-cancel-shapes";
  await harness.seedAccount({
    accountId,
    userId: "user-cancel-shapes",
    googleSub: "google-cancel-shapes",
    email: "cancel-shapes@example.com",
    stripeCustomerId: "cus_cancelshape1",
    keyId: "key-cancel-shapes",
    keyDigest: "6f".repeat(32),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_801_000_000;
  const periodEnd = base + 20 * 24 * 60 * 60;

  // Classic billing mode: the flag.
  await post(
    subscriptionEvent({ eventId: "evt_cs_1", created: base, subscriptionId: "sub_cs_classic", customer: "cus_cancelshape1", status: "active", type: "customer.subscription.created", itemPeriodEnd: periodEnd }),
  );
  await post(subscriptionEvent({ eventId: "evt_cs_2", created: base + 10, subscriptionId: "sub_cs_classic", customer: "cus_cancelshape1", status: "active", cancelAtPeriodEnd: true, itemPeriodEnd: periodEnd }));
  const classic = await harness.readSubscriptionMirror("sub_cs_classic");
  assert.equal(classic?.status, "active");
  assert.equal(classic?.cancelAtPeriodEnd, 1);
  assert.equal(classic?.currentPeriodEnd, new Date(periodEnd * 1000).toISOString());
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY), "a plan scheduled to end keeps access until it does");

  // Flexible billing mode: `cancel_at` set, `cancel_at_period_end` still false — the shape the
  // live account's own subscription would produce (billing_mode.type = flexible).
  await post(
    subscriptionEvent({ eventId: "evt_cs_3", created: base + 20, subscriptionId: "sub_cs_flex", customer: "cus_cancelshape1", status: "active", type: "customer.subscription.created", itemPeriodEnd: periodEnd }),
  );
  await post(
    subscriptionEvent({ eventId: "evt_cs_4", created: base + 30, subscriptionId: "sub_cs_flex", customer: "cus_cancelshape1", status: "active", cancelAtPeriodEnd: false, cancelAt: periodEnd, itemPeriodEnd: periodEnd }),
  );
  const flexible = await harness.readSubscriptionMirror("sub_cs_flex");
  assert.equal(flexible?.cancelAtPeriodEnd, 1, "cancel_at alone must read as a scheduled cancellation");
  assert.equal(flexible?.status, "active");

  // Renewed from the portal before the date: both shapes cleared.
  await post(subscriptionEvent({ eventId: "evt_cs_5", created: base + 40, subscriptionId: "sub_cs_flex", customer: "cus_cancelshape1", status: "active", cancelAtPeriodEnd: false, cancelAt: null, itemPeriodEnd: periodEnd }));
  assert.equal((await harness.readSubscriptionMirror("sub_cs_flex"))?.cancelAtPeriodEnd, 0);
});

test("a write that throws releases the event id and answers 500, so Stripe's retry of the same id is applied instead of swallowed as a duplicate", async () => {
  const accountId = "acct-release";
  await harness.seedAccount({
    accountId,
    userId: "user-release",
    googleSub: "google-release",
    email: "release@example.com",
    stripeCustomerId: "cus_release0001",
    keyId: "key-release",
    keyDigest: "7a".repeat(32),
    entitled: false,
  });
  const tenant = tenantDb(harness.db);
  const base = 1_801_100_000;

  // A D1 failure in the middle of the dispatch — after the idempotency row was already written,
  // the exact gap step 6 of webhook.ts's doc comment closes. Simulated on the repository the
  // handler is handed, so nothing about the database itself has to be broken and restored.
  let failuresLeft = 1;
  const flaky: TenantDb = {
    ...tenant,
    upsertSubscription: async (...args) => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("test: D1 write failed");
      }
      return tenant.upsertSubscription(...args);
    },
  };
  const event = subscriptionEvent({ eventId: "evt_release_1", created: base, subscriptionId: "sub_release", customer: "cus_release0001", status: "active", type: "customer.subscription.created" });
  const first = await post(event, { tenant: flaky });
  assert.equal(first.status, 500);
  assert.deepEqual(await first.json(), { error: "dispatch_failed" });
  assert.equal(await harness.readProcessedStripeEvent("evt_release_1"), null, "the processed-event claim must be given back");
  assert.equal(await harness.countRows("subscriptions", accountId), 0);
  assert.equal(await harness.countRows("entitlements", accountId), 0);

  // Stripe redelivers the same event id.
  const second = await post(event, { tenant: flaky });
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), { received: true }, "the retry must be a first delivery again, not a duplicate");
  assert.equal((await harness.readProcessedStripeEvent("evt_release_1"))?.result, "applied");
  await assert.doesNotReject(() => tenant.assertEntitled(accountId as AccountId, LOOKUP_KEY));

  // And a genuine redelivery of the now-applied event is still a duplicate.
  const third = await post(event);
  assert.deepEqual(await third.json(), { received: true, duplicate: true });
});

test("a payload this Worker cannot represent is recorded as failed and answered 200, not retried for three days", async () => {
  const accountId = "acct-malformed";
  await harness.seedAccount({
    accountId,
    userId: "user-malformed",
    googleSub: "google-malformed",
    email: "malformed@example.com",
    stripeCustomerId: "cus_malformed001",
    keyId: "key-malformed",
    keyDigest: "8b".repeat(32),
    entitled: false,
  });
  const base = 1_801_200_000;
  // A status outside SUBSCRIPTION_STATUSES fails the parse before any row is written. Every
  // redelivery would fail the same way, so asking Stripe to retry would only raise the
  // endpoint's failure rate; the row is what says the event was seen.
  const broken = subscriptionEvent({ eventId: "evt_malformed_1", created: base, subscriptionId: "sub_malformed", customer: "cus_malformed001", status: "not_a_stripe_status", type: "customer.subscription.created" });
  const first = await post(broken);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true, malformed: true });
  assert.equal((await harness.readProcessedStripeEvent("evt_malformed_1"))?.result, "failed");
  assert.equal(await harness.countRows("subscriptions", accountId), 0);
  assert.equal(await harness.countRows("entitlements", accountId), 0);

  const again = await post(broken);
  assert.deepEqual(await again.json(), { received: true, duplicate: true });
});
