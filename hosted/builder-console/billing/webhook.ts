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
 *   3. Parse the object the event carries (`billing/subscription-sync.ts`'s
 *      `parseSubscriptionObject`, or the invoice schema below) — before any row is written. A
 *      payload this Worker cannot represent will fail the same way on every redelivery, so it is
 *      recorded as `failed` and answered 200 in step 4: asking Stripe to retry it would only
 *      raise the endpoint's failure rate, which Stripe uses to disable endpoints, and would
 *      leave no row saying the event was ever seen.
 *   4. `recordProcessedStripeEvent`, before any billing write. `processed_stripe_events` is
 *      append-only (0003_billing.sql) and its primary key is the Stripe event id, so this insert
 *      IS the idempotency check: a redelivery of the same `evt_...` id collides on the key and
 *      the function returns `false` — this handler stops there and answers 200, because 200 is
 *      what tells Stripe to stop retrying a delivery that already succeeded once. The insert
 *      comes before the writes, not after, so a redelivery can never re-run a write that has no
 *      out-of-order guard of its own (`clearPastDueSince` on a redelivered `invoice.paid`).
 *   5. Only the delivery that wins step 4, for a parsed event with a resolvable account,
 *      dispatches into the billing writes.
 *   6. If step 5 throws — a D1 failure, the one thing left that can — the claim step 4 made is
 *      given back (`releaseProcessedStripeEvent`) and the answer is 500. Stripe retries a non-2xx
 *      delivery on its own schedule for up to three days, and because the row is gone that retry
 *      is a first delivery again — it runs step 5 afresh instead of colliding on the key and
 *      being swallowed as a duplicate. Every billing write is itself idempotent (both upserts
 *      discard a write that is not newer than what is stored), so a retry after a partial
 *      failure completes the work rather than doubling it. If the release itself fails — D1
 *      down for both — the retry is answered as a duplicate; the console's own resync on the
 *      account's next visit (`worker.ts`, `syncSubscriptionsFromStripe`) and the staleness
 *      sweep are what remain for that case.
 *
 * The scheduled reconciliation sweep (`billing/reconcile.ts`) remains the backstop for what no
 * delivery can fix: a row that already exists and has gone stale. Step 6 is what covers the
 * case reconciliation cannot — a first subscription event for an account that has no
 * entitlement row yet, which no staleness scan would ever find.
 */

import { z } from "zod";
import type { AccountId, TenantDb } from "../../knowledge-mcp/db/tenant.js";
import { resolveEntitlement } from "./entitlement-policy.js";
import { verifyStripeSignature } from "./stripe.js";
import { applyParsedSubscription, lookupKeysOf, parseSubscriptionObject, stripePrice, unixToIso, type ParsedSubscription } from "./subscription-sync.js";

export interface StripeWebhookEnv {
  readonly STRIPE_WEBHOOK_SECRET: string;
}

const stripeInvoiceLine = z.object({ price: stripePrice.nullable().optional() });
const stripeInvoiceObject = z.object({
  id: z.string(),
  // The subscription this invoice bills, if any — a plain id or, if Stripe expanded it, an
  // object naming one. Absent for a one-off invoice with no subscription behind it at all,
  // which `subscriptionIdOf` and its callers below treat the same as "no subscription found".
  subscription: z.union([z.string(), z.object({ id: z.string() }), z.null()]).optional(),
  lines: z.object({ data: z.array(stripeInvoiceLine) }).optional(),
});
type ParsedInvoice = z.infer<typeof stripeInvoiceObject>;

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
function subscriptionIdOf(invoice: ParsedInvoice): string | null {
  const raw = invoice.subscription;
  if (typeof raw === "string") return raw;
  if (raw !== null && raw !== undefined) return raw.id;
  return null;
}

type ParsedEventObject = { readonly kind: "subscription"; readonly subscription: ParsedSubscription } | { readonly kind: "invoice"; readonly invoice: ParsedInvoice };

/** Step 3. `null` for a payload this Worker cannot represent; the caller records that as `failed`. */
function parseEventObject(eventType: string, rawObject: unknown): ParsedEventObject | null {
  try {
    if (SUBSCRIPTION_EVENT_TYPES.has(eventType)) return { kind: "subscription", subscription: parseSubscriptionObject(rawObject) };
    return { kind: "invoice", invoice: stripeInvoiceObject.parse(rawObject) };
  } catch (error) {
    if (error instanceof z.ZodError) return null;
    throw error;
  }
}

async function dispatchInvoiceEvent(
  tenant: TenantDb,
  accountId: AccountId,
  stripeCustomerId: string,
  eventId: string,
  eventType: string,
  observedAt: string,
  parsed: ParsedInvoice,
  now: Date,
): Promise<void> {
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
  const parsed = isSupported && accountId !== null ? parseEventObject(eventType, data.object) : null;

  const isNewDelivery = await tenant.recordProcessedStripeEvent(
    {
      id: eventId,
      type: eventType,
      accountId,
      result: !isSupported ? "ignored" : accountId === null || parsed === null ? "failed" : "applied",
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
  if (parsed === null) {
    // Step 3: a payload this Worker cannot represent. Recorded as "failed" above; answered 200
    // for the same reason as an unresolvable customer — a retry would fail identically. The
    // event id and type are logged so an operator can pull the payload from the Dashboard; the
    // payload itself is not, since it carries the customer's email and address.
    console.error(`stripe webhook ${eventType} ${eventId}: payload not in a shape this Worker can apply; recorded as failed`);
    return json(200, { received: true, malformed: true });
  }
  // accountId came from resolving customerId above, and only ever resolves a non-null input,
  // so customerId is provably a string here even though the type checker tracks the two
  // variables independently.
  const resolvedCustomerId = customerId as string;

  try {
    if (parsed.kind === "subscription") {
      await applyParsedSubscription(tenant, accountId, resolvedCustomerId, parsed.subscription, { source: "stripe_webhook", stripeEventId: eventId, observedAt }, now);
    } else {
      await dispatchInvoiceEvent(tenant, accountId, resolvedCustomerId, eventId, eventType, observedAt, parsed.invoice, now);
    }
  } catch (error) {
    // Step 6 of this file's own doc comment.
    console.error(`stripe webhook ${eventType} ${eventId}: write failed, releasing the event for Stripe to retry:`, error instanceof Error ? error.message : error);
    try {
      await tenant.releaseProcessedStripeEvent(eventId);
    } catch (releaseError) {
      console.error(`stripe webhook ${eventId}: could not release the processed-event row after a failed write; the retry will read as a duplicate:`, releaseError instanceof Error ? releaseError.message : releaseError);
    }
    return json(500, { error: "dispatch_failed" });
  }
  return json(200, { received: true });
}
