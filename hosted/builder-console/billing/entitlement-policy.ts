/**
 * The single source of truth for whether a Stripe subscription status entitles access, and for
 * how a `past_due` subscription's dunning stamp evolves.
 *
 * Before this module existed, `billing/webhook.ts` and `billing/reconcile.ts` each answered
 * "does this status grant access" with their own copy of the same set of statuses, and a comment
 * in each promising the other agreed. That is exactly the shape of contract that decays the
 * moment one side changes and the other does not — so now both call `resolveEntitlement` below
 * instead of encoding the rule a second time.
 *
 * This file touches neither D1 nor Stripe. It is a pure function over the three things a caller
 * already has — a status, whatever dunning stamp is already on record, and the clock — which is
 * what makes it possible to unit-test every `SubscriptionStatus` value and both sides of the
 * grace-window boundary with no database and no mock Stripe response (see
 * `test/entitlement-policy.test.ts`).
 *
 * The decided policy:
 *
 *   - `active`, `trialing`   — entitled. No dunning stamp; any stamp on record is cleared, which
 *                              is how a recovery (an `invoice.paid`, or a subscription event
 *                              reporting one of these two statuses) closes out a grace episode.
 *   - `past_due`             — entitled for `PAST_DUE_GRACE_MS` from the first moment this
 *                              Worker observed dunning for the subscription, then revoked. "First
 *                              moment" is whichever came first: a subscription event carrying
 *                              `past_due`, or an `invoice.payment_failed` for the subscription
 *                              while the mirror still said `active`/`trialing` — both paths stamp
 *                              through this same function, so neither can produce a different
 *                              start time than the other would have.
 *   - everything else (`unpaid`, `canceled`, `incomplete`, `incomplete_expired`, `paused`)
 *                            — never entitled. Revoked immediately, no grace, matching this
 *                              codebase's existing fail-closed default for a subscription that is
 *                              not presently in good standing.
 *
 * The window is enforced by two independent paths, on purpose: the webhook delivery that reacts
 * to each Stripe event as it arrives, and the scheduled reconciliation sweep
 * (`billing/reconcile.ts`) that re-derives entitlements on a timer regardless of whether any
 * particular webhook delivery succeeded. A missed "past_due has been over grace for a week"
 * webhook (Stripe does not even send one — nothing tells this Worker to re-check on day 7) would
 * otherwise leave an expired grace window ungoverned; the reconciliation sweep is what actually
 * revokes it, using this same function, on its own schedule.
 */

import type { SubscriptionStatus } from "../../knowledge-mcp/db/tenant.js";

/**
 * Seven days, in milliseconds.
 *
 * Stripe's Smart Retries schedule makes its first several retry attempts within the first week
 * after a charge fails (https://docs.stripe.com/billing/revenue-recovery/smart-retries), so a
 * week is long enough that an ordinary bounced-then-recovered card is never cut off mid-retry,
 * and short enough to bound how much free usage a card that never recovers can extract. The
 * window is honoured even if the webhook that would otherwise revoke access is missed entirely,
 * because the same scheduled reconciliation that already re-derives every entitlement
 * (`ENTITLEMENT_STALENESS_CEILING_MS`, `hosted/knowledge-mcp/db/tenant.ts`) enforces it independently — see
 * this module's own doc comment.
 */
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResolveEntitlementInput {
  readonly status: SubscriptionStatus;
  /**
   * The ISO instant this Worker first observed the subscription in dunning, or `null` if it has
   * never been `past_due` since its last recovery (or has never been `past_due` at all). Ignored
   * for every status except `past_due`.
   */
  readonly pastDueSince: string | null;
  readonly now: Date;
}

export interface ResolvedEntitlement {
  readonly active: boolean;
  /**
   * The dunning stamp a caller should persist. `null` for every status except `past_due`:
   * recovering to `active`/`trialing`, or landing on a terminal status, both close out the
   * episode. For `past_due` this is `pastDueSince` unchanged if it was already set (the grace
   * window keeps counting from when dunning actually started, not from this call), or `now` if
   * it was `null` (this call is the first observed sign of dunning).
   */
  readonly pastDueSince: string | null;
}

/** Entitled outright, with no grace-window bookkeeping. */
const ENTITLED_WITHOUT_GRACE = new Set<SubscriptionStatus>(["active", "trialing"]);

/**
 * The only function that decides whether a subscription status entitles access. Both
 * `billing/webhook.ts` and `billing/reconcile.ts` call this rather than answering the question
 * themselves — see this file's own doc comment for why that used to be two answers that could
 * drift apart.
 */
export function resolveEntitlement(input: ResolveEntitlementInput): ResolvedEntitlement {
  const { status, pastDueSince, now } = input;
  if (ENTITLED_WITHOUT_GRACE.has(status)) return { active: true, pastDueSince: null };
  if (status !== "past_due") return { active: false, pastDueSince: null };

  const since = pastDueSince ?? now.toISOString();
  // Strictly greater than, not "at least": a subscription exactly PAST_DUE_GRACE_MS old is still
  // inside the window it was promised. This mirrors ENTITLEMENT_STALENESS_CEILING_MS's own
  // boundary in hosted/knowledge-mcp/db/tenant.ts (`now - synced_at > ceiling`, not `>=`) rather than
  // introducing a second convention for what "at the edge of the window" means.
  const expired = now.getTime() - Date.parse(since) > PAST_DUE_GRACE_MS;
  return { active: !expired, pastDueSince: since };
}

/** The two fields `pickCurrentSubscription` reads; `db/tenant.ts`'s `SubscriptionSummary` satisfies it. */
export interface EntitlementSubject {
  readonly status: SubscriptionStatus;
  readonly pastDueSince: string | null;
}

/**
 * Which of an account's subscriptions is the plan in force, given the mirror rows newest first
 * (`db/tenant.ts`'s `listSubscriptionsForAccount`): the newest one that currently entitles
 * access, or — when none does — the newest of all, so a plan that ended still reads as ended.
 *
 * "Newest" alone is the wrong answer, and the reason this function exists: a
 * `customer.subscription.deleted` for a plan canceled months ago arrives when its final period
 * closes, which can be long after the replacement plan was created, and would otherwise make
 * the console describe a paying customer's account as inactive. The same decision feeds the
 * Billing Portal's cancel deep link, which must name the live subscription.
 */
export function pickCurrentSubscription<T extends EntitlementSubject>(newestFirst: readonly T[], now: Date): T | null {
  // A plan in good standing outranks one in its grace window, whatever their order of
  // observation — the same ranking `billing/checkout.ts`'s resync applies when it writes them —
  // so a dunning update to a duplicate past-due subscription cannot make the console describe a
  // healthy plan as failing, or hide its cancel button.
  const live = newestFirst.find((subscription) => ENTITLED_WITHOUT_GRACE.has(subscription.status));
  if (live !== undefined) return live;
  return newestFirst.find((subscription) => resolveEntitlement({ status: subscription.status, pastDueSince: subscription.pastDueSince, now }).active) ?? newestFirst[0] ?? null;
}
