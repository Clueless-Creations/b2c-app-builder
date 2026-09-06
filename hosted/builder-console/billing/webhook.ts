/**
 * POST /webhooks/stripe.
 *
 * Order of operations, and why it cannot be reordered:
 *
 *   1. Read the raw body as text. Stripe signs the exact bytes it sent; parsing to JSON and
 *      restringifying would not byte-for-byte match, so `verifyStripeSignature` must see the
 *      untouched body.
 *   2. Verify the signature. An unsigned or mis-signed request is rejected before it touches D1
 *      at all.
 *   3. `recordProcessedStripeEvent` FIRST, before any billing write. `processed_stripe_events`
 *      is append-only (0003_billing.sql) and its primary key is the Stripe event id, so this
 *      insert IS the idempotency check: a redelivery of the same `evt_...` id collides on the
 *      key and the function returns `false` — this handler stops there and answers 200, because
 *      200 is what tells Stripe to stop retrying a delivery that already succeeded once.
 *   4. Only the delivery that wins step 3 dispatches into `upsertSubscription` /
 *      `upsertEntitlement`.
 *
 * A caveat worth being explicit about: `result` is written in step 3 as an optimistic verdict
 * ("applied" for a supported, resolvable event) *before* step 4 runs, because the append-only
 * table has no second write to correct it with. If step 4 then throws, the event is still
 * marked "applied" and a Stripe retry of the same id will see the same primary-key collision
 * and be swallowed as a duplicate — so a genuine mid-dispatch failure does not get a second
 * attempt from Stripe. The backstop for exactly that gap already exists in this design: the
 * scheduled reconciliation sweep (`billing/reconcile.ts`) re-derives `entitlements` from
 * Stripe directly once `synced_at` goes stale, independent of whether any particular webhook
 * delivery fully completed.
 */

import { z } from "zod";
import { SUBSCRIPTION_STATUSES, type AccountId, type TenantDb } from "../../knowledge-mcp/db/tenant.js";
import { resolveEntitlement } from "./entitlement-policy.js";
import { verifyStripeSignature } from "./stripe.js";

export interface StripeWebhookEnv {
  readonly STRIPE_WEBHOOK_SECRET: string;
}

const stripePrice = z.object({
  id: z.string(),
  // Configured per-Price in the Stripe Dashboard, per this repository's own design note on
  // upsertEntitlement. A Price with no lookup_key was never meant to gate an entitlement, so an
  // item referencing one is skipped rather than treated as an error.
  lookup_key: z.string().nullable().optional(),
});

const stripeCoupon = z.object({
  percent_off: z.number().nullable().optional(),
  duration: z.string().nullable().optional(),
});

const stripeDiscount = z.object({ coupon: stripeCoupon.nullable().optional() });

const stripeSubscriptionItem = z.object({ price: stripePrice });
const stripeSubscriptionItems = z.object({ data: z.array(stripeSubscriptionItem) });

/**
 * The fields this handler reads off a Stripe Subscription object. Loose on purpose — Stripe
 * sends many more fields than this, and zod's default (non-strict) object only validates the
 * keys it names, so the rest pass through unread rather than failing the parse.
 */
const stripeSubscriptionObject = z.object({
  id: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean().optional().default(false),
  // Unverified against a live Stripe payload: Stripe has moved billing-cycle fields onto
  // subscription items in some API versions. Both shapes are read; either missing resolves to
  // a null current_period_end, which the schema accepts.
  current_period_end: z.number().nullable().optional(),
  discount: stripeDiscount.nullable().optional(),
  items: stripeSubscriptionItems.optional(),
});

const stripeInvoiceLine = z.object({ price: stripePrice.nullable().optional() });
const stripeInvoiceObject = z.object({
  id: z.string(),
  // The subscription this invoice bills, if any — a plain id or, if Stripe expanded it, an
  // object naming one. Absent for a one-off invoice with no subscription behind it at all,
  // which `subscriptionIdOf` and its callers below treat the same as "no subscription found".
  subscription: z.union([z.string(), z.object({ id: z.string() }), z.null()]).optional(),
  lines: z.object({ data: z.array(stripeInvoiceLine) }).optional(),
});

const stripeEventEnvelope = z.object({
  id: z.string(),
  type: z.string(),
  /** Unix seconds. This, not our own clock, is "Stripe's own event time" per 0003_billing.sql. */
  created: z.number(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

const SUBSCRIPTION_EVENT_TYPES = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);
const INVOICE_EVENT_TYPES = new Set(["invoice.paid", "invoice.payment_failed"]);
const SUPPORTED_EVENT_TYPES = new Set([...SUBSCRIPTION_EVENT_TYPES, ...INVOICE_EVENT_TYPES]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function customerIdOf(object: Record<string, unknown>): string | null {
  const raw = object.customer;
  if (typeof raw === "string") return raw;
  if (raw !== null && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string") return (raw as { id: string }).id;
  return null;
}

/** Same shape as customerIdOf, for an invoice's `subscription` field. */
function subscriptionIdOf(invoice: z.infer<typeof stripeInvoiceObject>): string | null {
  const raw = invoice.subscription;
  if (typeof raw === "string") return raw;
  if (raw !== null && raw !== undefined) return raw.id;
  return null;
}

function unixToIso(seconds: number | null | undefined): string | null {
  return seconds === null || seconds === undefined ? null : new Date(seconds * 1000).toISOString();
}

/** A 100%-off forever coupon on a real price — never a hand-set flag. Matches the exact
 * phrase 0003_billing.sql uses to describe the column this feeds. */
function isGiftedFromDiscount(discount: z.infer<typeof stripeDiscount> | null | undefined): boolean {
  const coupon = discount?.coupon;
  return coupon?.percent_off === 100 && coupon?.duration === "forever";
}

function lookupKeysOf(items: readonly { readonly price?: { readonly lookup_key?: string | null } | null }[]): string[] {
  const keys = items.map((item) => item.price?.lookup_key).filter((key): key is string => typeof key === "string" && key.length > 0);
  return Array.from(new Set(keys));
}

async function dispatchSubscriptionEvent(
  tenant: TenantDb,
  accountId: AccountId,
  stripeCustomerId: string,
  eventId: string,
  observedAt: string,
  rawObject: unknown,
  now: Date,
): Promise<void> {
  const parsed = stripeSubscriptionObject.parse(rawObject);
  // An unrecognised status fails loudly rather than defaulting to a guess — the same "malformed
  // state is a fault, not a client input" posture db/tenant.ts already takes with readRow.
  const status = z.enum(SUBSCRIPTION_STATUSES).parse(parsed.status);
  const items = parsed.items?.data ?? [];
  const mirror = await tenant.upsertSubscription(
    accountId,
    {
      id: parsed.id,
      stripeCustomerId,
      status,
      // The mirror stores one price per subscription (0003_billing.sql). A multi-item
      // subscription's first item stands in; entitlements below are computed from every item.
      priceId: items[0]?.price.id ?? null,
      isGifted: isGiftedFromDiscount(parsed.discount),
      cancelAtPeriodEnd: parsed.cancel_at_period_end,
      currentPeriodEnd: unixToIso(parsed.current_period_end),
      observedAt,
    },
    now,
  );
  // Derived from the mirror row upsertSubscription just returned, not from `status` directly:
  // an out-of-order delivery discards its own write and hands back what is actually persisted
  // (upsertSubscription's own doc comment), so `active` must agree with the mirror, not with
  // whichever event lost the race. entitlement-policy.ts is the one place this decision is made.
  const { active } = resolveEntitlement({ status: mirror.status, pastDueSince: mirror.pastDueSince, now });
  for (const lookupKey of lookupKeysOf(items)) {
    await tenant.upsertEntitlement(accountId, { lookupKey, stripeCustomerId, active, source: "stripe_webhook", stripeEventId: eventId, observedAt }, now);
  }
}

async function dispatchInvoiceEvent(
  tenant: TenantDb,
  accountId: AccountId,
  stripeCustomerId: string,
  eventId: string,
  eventType: string,
  observedAt: string,
  rawObject: unknown,
  now: Date,
): Promise<void> {
  const parsed = stripeInvoiceObject.parse(rawObject);
  const lookupKeys = lookupKeysOf(parsed.lines?.data ?? []);
  const subscriptionId = subscriptionIdOf(parsed);

  let active: boolean;
  if (eventType === "invoice.paid") {
    // Recovery. Applied unconditionally, matching this handler's behaviour before the grace
    // window existed: restoring access is never the risky direction. The dunning stamp is
    // cleared too, if this Worker has a mirror row for the subscription the invoice names — see
    // clearPastDueSince's own doc comment for why a paid invoice clears it even before a
    // corresponding subscription event (if any) arrives to also correct the mirrored status.
    if (subscriptionId !== null) await tenant.clearPastDueSince(accountId, subscriptionId);
    active = true;
  } else {
    const mirrored = subscriptionId === null ? null : await tenant.findSubscription(accountId, subscriptionId);
    if (mirrored === null || subscriptionId === null) {
      // The invoice names no subscription this Worker recognises in this tenant — nothing to
      // anchor a grace window to, so this fails closed exactly as this handler did before the
      // grace window existed: a payment failure with no known subscription behind it revokes.
      active = false;
    } else {
      // The decided policy's "whichever came first" clause: an invoice.payment_failed while the
      // mirror still says active/trialing IS the first sign of dunning, even though no
      // subscription event has said `past_due` yet. The mirror's own `status` column is left
      // untouched here — only a subscription event may write it — but access from this point on
      // is evaluated as if it already did. A mirror already saying past_due, or a terminal
      // status the policy never entitles, is evaluated exactly as recorded.
      const effectiveStatus = mirrored.status === "active" || mirrored.status === "trialing" ? "past_due" : mirrored.status;
      if (effectiveStatus === "past_due" && mirrored.pastDueSince === null) await tenant.stampPastDueSinceIfUnset(accountId, subscriptionId, now);
      const pastDueSince = effectiveStatus === "past_due" ? (mirrored.pastDueSince ?? now.toISOString()) : null;
      active = resolveEntitlement({ status: effectiveStatus, pastDueSince, now }).active;
    }
  }

  for (const lookupKey of lookupKeys) {
    await tenant.upsertEntitlement(accountId, { lookupKey, stripeCustomerId, active, source: "stripe_webhook", stripeEventId: eventId, observedAt }, now);
  }
}

export async function handleStripeWebhook(request: Request, env: StripeWebhookEnv, tenant: TenantDb, now = new Date()): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) return json(400, { error: "missing_signature" });

  // The exact bytes Stripe signed. Do not JSON.parse before this line.
  const rawBody = await request.text();
  // The same injected `now` this handler uses everywhere else, so a test can hold time fixed
  // for the whole request instead of the tolerance window silently racing the real wall clock.
  if (!(await verifyStripeSignature(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET, 300, Math.floor(now.getTime() / 1000)))) {
    return json(400, { error: "invalid_signature" });
  }

  let rawEvent: unknown;
  try {
    rawEvent = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const envelope = stripeEventEnvelope.safeParse(rawEvent);
  if (!envelope.success) return json(400, { error: "invalid_event_shape" });
  const { id: eventId, type: eventType, created, data } = envelope.data;
  const observedAt = unixToIso(created)!;

  const customerId = customerIdOf(data.object);
  const accountId = customerId === null ? null : await tenant.resolveAccountByStripeCustomerId(customerId);
  const isSupported = SUPPORTED_EVENT_TYPES.has(eventType);

  const isNewDelivery = await tenant.recordProcessedStripeEvent(
    {
      id: eventId,
      type: eventType,
      accountId,
      result: !isSupported ? "ignored" : accountId === null ? "failed" : "applied",
    },
    now,
  );
  // A redelivered event id: already handled by an earlier delivery. 200 tells Stripe to stop.
  if (!isNewDelivery) return json(200, { received: true, duplicate: true });
  if (!isSupported) return json(200, { received: true });
  if (accountId === null) {
    // A webhook for a customer this Worker does not recognise (test-mode noise, a Customer
    // created outside this flow, or a rare race with account creation) is recorded above as
    // "failed" and answered 200 so Stripe does not retry it forever; there is nothing this
    // delivery alone can act on.
    return json(200, { received: true, unresolved_customer: true });
  }
  // accountId came from resolving customerId two lines above, and only ever resolves a
  // non-null input, so customerId is provably a string here even though the type checker
  // tracks the two variables independently.
  const resolvedCustomerId = customerId as string;

  if (SUBSCRIPTION_EVENT_TYPES.has(eventType)) {
    await dispatchSubscriptionEvent(tenant, accountId, resolvedCustomerId, eventId, observedAt, data.object, now);
  } else {
    await dispatchInvoiceEvent(tenant, accountId, resolvedCustomerId, eventId, eventType, observedAt, data.object, now);
  }
  return json(200, { received: true });
}
