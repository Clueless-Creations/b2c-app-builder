/**
 * The one place a Stripe Subscription object becomes this Worker's mirror row and entitlement
 * rows. Two callers feed it the same shape:
 *
 *   - `billing/webhook.ts`, for every `customer.subscription.*` event Stripe delivers.
 *   - `billing/checkout.ts`'s `syncSubscriptionsFromStripe`, which reads the customer's
 *     subscriptions straight from Stripe when a person returns to the console from Checkout or
 *     the Billing Portal — the moment the webhook for what they just did may still be in
 *     flight, or may have been lost entirely.
 *
 * Because both go through `applyParsedSubscription`, the console can never show a plan state
 * the webhook path would have computed differently from the same Stripe object.
 *
 * Parsing and writing are two steps on purpose. `parseSubscriptionObject` throws a `ZodError`
 * for a payload this Worker cannot understand — a shape it does not recognise, a status outside
 * `SUBSCRIPTION_STATUSES` — and does so before any row is touched, so a caller can tell "this
 * event will never apply" (record it as failed and stop asking Stripe to retry) apart from "a
 * write failed this time" (give the event back and let Stripe retry).
 *
 * Field notes, checked against the API version `billing/stripe.ts` pins (2025-08-27.basil) and
 * against a live subscription read back from the account on 2026-09-06:
 *
 *   - `current_period_end` lives on each subscription item, not on the subscription. A
 *     top-level value is still read when present, but the item value wins. Before this module
 *     existed the mirror stored `NULL` for every live subscription, so the console could not say
 *     when a plan renews or ends. With more than one item, the earliest item end is used —
 *     that is the next charge, and it is what Stripe's own `cancel_at_period_end` resolves to on
 *     a mixed-interval subscription.
 *   - A cancellation scheduled through the Billing Portal sets `cancel_at_period_end` on a
 *     classic-billing-mode subscription, and `cancel_at` (a timestamp) with
 *     `cancel_at_period_end: false` on a flexible-billing-mode one
 *     (https://docs.stripe.com/billing/subscriptions/billing-mode/compare). Either means "ends
 *     when the paid period does"; both land in the mirror's one `cancel_at_period_end` flag,
 *     and the console shows the item's period end as the end date. Stripe leaves `cancel_at` in
 *     place after the subscription has actually ended, so it only counts while the subscription
 *     is still live. A custom `cancel_at` set by hand in the Dashboard to a date other than the
 *     period end is shown as ending at the period end — the mirror has no column for an
 *     arbitrary cancel date, and no flow this console offers can produce one.
 *   - The gift flag is informational (0003_billing.sql), and this version reports discounts as
 *     the `discounts` array — ids in a webhook payload, Discount objects only when a read
 *     expands them — with the singular `discount` gone. Both shapes are read; an unexpanded id
 *     carries no coupon, so the flag is only ever set from an expanded object.
 */

import { z } from "zod";
import { SUBSCRIPTION_STATUSES, type AccountId, type SubscriptionStatus, type TenantDb } from "../../knowledge-mcp/db/tenant.js";
import { resolveEntitlement } from "./entitlement-policy.js";

/**
 * A Stripe Price as it appears on a subscription item or an invoice line. `lookup_key` is
 * configured per-Price in the Dashboard; a Price with none was never meant to gate an
 * entitlement, so an item referencing one is skipped rather than treated as an error.
 */
export const stripePrice = z.object({
  id: z.string(),
  lookup_key: z.string().nullable().optional(),
});

const stripeCoupon = z.object({
  percent_off: z.number().nullable().optional(),
  duration: z.string().nullable().optional(),
});

const stripeDiscount = z.object({ coupon: stripeCoupon.nullable().optional() });

const stripeSubscriptionItem = z.object({
  price: stripePrice,
  current_period_end: z.number().nullable().optional(),
});

/**
 * The fields read off a Stripe Subscription object. Loose on purpose — Stripe sends many more
 * fields than this, and zod's default (non-strict) object only validates the keys it names, so
 * the rest pass through unread rather than failing the parse.
 */
export const stripeSubscriptionObject = z.object({
  id: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  cancel_at_period_end: z.boolean().optional().default(false),
  cancel_at: z.number().nullable().optional(),
  current_period_end: z.number().nullable().optional(),
  discount: stripeDiscount.nullable().optional(),
  discounts: z.array(z.union([z.string(), stripeDiscount])).optional(),
  items: z.object({ data: z.array(stripeSubscriptionItem) }).optional(),
});

export function unixToIso(seconds: number | null | undefined): string | null {
  return seconds === null || seconds === undefined ? null : new Date(seconds * 1000).toISOString();
}

/** A 100%-off forever coupon on a real price — never a hand-set flag. Informational only; nothing that decides access reads it. */
function isGiftedFrom(parsed: z.infer<typeof stripeSubscriptionObject>): boolean {
  const candidates = [parsed.discount, ...(parsed.discounts ?? [])].filter((entry): entry is z.infer<typeof stripeDiscount> => typeof entry === "object" && entry !== null);
  return candidates.some((discount) => discount.coupon?.percent_off === 100 && discount.coupon?.duration === "forever");
}

export function lookupKeysOf(items: readonly { readonly price?: { readonly lookup_key?: string | null } | null }[]): string[] {
  const keys = items.map((item) => item.price?.lookup_key).filter((key): key is string => typeof key === "string" && key.length > 0);
  return Array.from(new Set(keys));
}

/** The earliest item period end (the next charge), or the top-level field for a payload that still carries one. */
function periodEndOf(parsed: z.infer<typeof stripeSubscriptionObject>): number | null {
  const itemEnds = (parsed.items?.data ?? []).map((item) => item.current_period_end).filter((end): end is number => typeof end === "number");
  if (itemEnds.length > 0) return Math.min(...itemEnds);
  return parsed.current_period_end ?? null;
}

/** Statuses after which `cancel_at` is a leftover, not a plan. */
const ENDED_STATUSES = new Set<SubscriptionStatus>(["canceled", "incomplete_expired"]);

/** What this Worker keeps of a Stripe Subscription object, ready to write. */
export interface ParsedSubscription {
  readonly id: string;
  readonly status: SubscriptionStatus;
  /** Every `lookup_key` the subscription's items bill, de-duplicated. */
  readonly lookupKeys: readonly string[];
  readonly priceId: string | null;
  readonly isGifted: boolean;
  readonly cancelScheduled: boolean;
  readonly currentPeriodEnd: string | null;
}

/**
 * Validates a Stripe Subscription object and reduces it to the fields the mirror stores.
 * Throws a `ZodError` for anything this Worker cannot represent — including a status outside
 * `SUBSCRIPTION_STATUSES`, which fails loudly rather than defaulting to a guess, the same
 * "malformed state is a fault, not a client input" posture db/tenant.ts takes with readRow.
 */
export function parseSubscriptionObject(rawObject: unknown): ParsedSubscription {
  const parsed = stripeSubscriptionObject.parse(rawObject);
  const items = parsed.items?.data ?? [];
  const cancelAtSet = parsed.cancel_at !== null && parsed.cancel_at !== undefined;
  return {
    id: parsed.id,
    status: parsed.status,
    lookupKeys: lookupKeysOf(items),
    // The mirror stores one price per subscription (0003_billing.sql). A multi-item
    // subscription's first item stands in; entitlements are computed from every item.
    priceId: items[0]?.price.id ?? null,
    isGifted: isGiftedFrom(parsed),
    cancelScheduled: parsed.cancel_at_period_end || (cancelAtSet && !ENDED_STATUSES.has(parsed.status)),
    currentPeriodEnd: unixToIso(periodEndOf(parsed)),
  };
}

export interface ApplySubscriptionOptions {
  readonly source: "stripe_webhook" | "stripe_reconciliation";
  readonly stripeEventId: string | null;
  /**
   * Stripe's own event time for a webhook delivery; the read time for a direct read. This is
   * the key both `upsertSubscription` and `upsertEntitlement` use to discard an older write
   * arriving after a newer one. Stripe event times have whole-second resolution, so a direct
   * read must stamp itself in the second *before* it read (`billing/checkout.ts`'s
   * `syncSubscriptionsFromStripe`), or an event created in the same second as the read — which
   * may describe a later state — would lose to it.
   */
  readonly observedAt: string;
}

/**
 * Writes one parsed subscription into the mirror and re-derives the entitlement rows for every
 * `lookup_key` it bills. `active` is decided from the mirror row the upsert returns, not from the
 * object directly: an out-of-order write discards itself and hands back what is actually
 * persisted (`upsertSubscription`'s own doc comment), so the entitlement must agree with the
 * mirror, not with whichever write lost the race. `entitlement-policy.ts` is the one place that
 * decision is made.
 *
 * A `lookup_key` that has left the subscription (an in-place plan switch) is not written here —
 * a single object cannot say whether another subscription on the same Customer still bills it.
 * `syncSubscriptionsFromStripe`, which sees every subscription, retires such keys; the
 * reconciliation sweep does the same for the webhook path within its staleness ceiling.
 *
 * Throws only on a D1 failure; every write is idempotent, so a caller may retry.
 */
export async function applyParsedSubscription(
  tenant: TenantDb,
  accountId: AccountId,
  stripeCustomerId: string,
  parsed: ParsedSubscription,
  opts: ApplySubscriptionOptions,
  now: Date,
): Promise<void> {
  const mirror = await tenant.upsertSubscription(
    accountId,
    {
      id: parsed.id,
      stripeCustomerId,
      status: parsed.status,
      priceId: parsed.priceId,
      isGifted: parsed.isGifted,
      cancelAtPeriodEnd: parsed.cancelScheduled,
      currentPeriodEnd: parsed.currentPeriodEnd,
      observedAt: opts.observedAt,
    },
    now,
  );
  const { active } = resolveEntitlement({ status: mirror.status, pastDueSince: mirror.pastDueSince, now });
  for (const lookupKey of parsed.lookupKeys) {
    await tenant.upsertEntitlement(
      accountId,
      { lookupKey, stripeCustomerId, active, source: opts.source, stripeEventId: opts.stripeEventId, observedAt: opts.observedAt },
      now,
    );
  }
}
