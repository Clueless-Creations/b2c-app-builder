/**
 * The plans this product currently sells through self-serve Checkout, and the Stripe Price
 * `lookup_key` each one resolves to.
 *
 * The Stripe Dashboard is the source of truth for what a customer is actually charged
 * (`README.md`'s Go-live checklist, "Stripe (M6)", step 2 — `lookup_key` is set on the Price
 * there, not here). `displayPrice` below is presentation only, for the console's plan forms; a
 * Price recreated at a different amount under the same `lookup_key` changes what Checkout
 * charges without this file ever being touched, which is the entire point of every write path
 * (`billing/checkout.ts`, `billing/webhook.ts`, `billing/reconcile.ts`) keying on `lookup_key`
 * rather than a hard-coded amount or Price id. If the Dashboard and this file's `displayPrice`
 * ever disagree, the Dashboard is correct — update this file to match, never the other way
 * around.
 */

export const PLAN_IDS = ["monthly", "annual"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanDefinition {
  readonly id: PlanId;
  /** Resolved to a Price id at Checkout time via `billing/reconcile.ts`'s `priceIdForLookupKey`. */
  readonly lookupKey: string;
  readonly displayName: string;
  /** Presentation only — see this file's own doc comment. */
  readonly displayPrice: string;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  monthly: { id: "monthly", lookupKey: "b2c_pro_monthly", displayName: "Monthly", displayPrice: "$19/month" },
  annual: { id: "annual", lookupKey: "b2c_pro_annual", displayName: "Annual", displayPrice: "$190/year" },
};

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}
