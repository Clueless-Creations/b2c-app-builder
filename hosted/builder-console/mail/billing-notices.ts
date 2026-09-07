/**
 * The emails this console sends about a subscription, and the rule for when each one is due.
 *
 * Three notices, each tied to one change in the mirror the webhook just wrote:
 *
 *   - `plan_activated`        — the subscription became live (a first payment, or an
 *                                `incomplete` one that completed). What is on, when it renews,
 *                                and the two things to do next: create a key, connect an agent.
 *   - `cancellation_scheduled` — the person cancelled in the Billing Portal. When access ends,
 *                                that nothing more is charged, and how to renew before then.
 *   - `plan_ended`            — the subscription reached `canceled` and no other subscription on
 *                                the account still grants access. Keys stop working; the account
 *                                and keys stay; how to switch access back on.
 *
 * Receipts, failed-payment notices with a pay link, and upcoming-renewal reminders are Stripe's
 * own emails, switched on in the Dashboard (README, Stripe checklist); the Terms already say
 * "Stripe retries it and emails you". Nothing here duplicates them.
 *
 * Only the webhook path sends (`billing/webhook.ts`): it sees one event once, after its writes
 * succeeded, and the event id makes the idempotency key. The console's own resync
 * (`billing/checkout.ts`'s `syncSubscriptionsFromStripe`) repairs the mirror silently — a repair
 * is not news to the customer, and a repair that re-derived the same state would otherwise mail
 * them again.
 *
 * `detectBillingTransition` is a pure function over the mirror row before and after the write
 * (`db/tenant.ts`'s `SubscriptionSummary`), so an out-of-order event that the mirror discarded
 * produces no transition — before and after are the same row.
 */

import type { SubscriptionSummary } from "../../knowledge-mcp/db/tenant.js";
import { pickCurrentSubscription, resolveEntitlement } from "../billing/entitlement-policy.js";
import { PLAN_IDS, PLANS } from "../billing/plans.js";
import { escapeHtml } from "../console/chrome.js";
import { formatDate } from "../console/pages.js";
import { sendEmail, type MailConfig, type OutboundEmail } from "./resend.js";

export const BILLING_NOTICE_KINDS = ["plan_activated", "cancellation_scheduled", "plan_ended"] as const;
export type BillingNoticeKind = (typeof BILLING_NOTICE_KINDS)[number];

export interface BillingTransition {
  readonly kind: BillingNoticeKind;
  readonly subscriptionId: string;
  /** "Monthly" / "Annual" when the subscription bills one of this console's plans; null otherwise. */
  readonly planName: string | null;
  /** ISO instant the paid period ends, when the mirror knows it. */
  readonly periodEnd: string | null;
}

const LIVE = new Set<SubscriptionSummary["status"]>(["active", "trialing"]);
const WAS_ALREADY_ON = new Set<SubscriptionSummary["status"]>(["active", "trialing", "past_due"]);

function planNameFor(lookupKeys: readonly string[]): string | null {
  const planId = lookupKeys.map((key) => PLAN_IDS.find((id) => PLANS[id].lookupKey === key)).find((id) => id !== undefined);
  return planId === undefined ? null : PLANS[planId].displayName;
}

export interface DetectBillingTransitionInput {
  /** The mirror row for this subscription before the write; `undefined` when it did not exist. */
  readonly before: SubscriptionSummary | undefined;
  /** The same row after the write. */
  readonly after: SubscriptionSummary;
  /** Every `lookup_key` on the subscription as the event reported it, for the plan name. */
  readonly lookupKeys: readonly string[];
  /** Every mirror row for the account after the write, newest first — decides whether "ended" means ended. */
  readonly accountSubscriptions: readonly SubscriptionSummary[];
  readonly now: Date;
}

/** At most one notice per event; `null` when the write changed nothing worth telling the customer. */
export function detectBillingTransition(input: DetectBillingTransitionInput): BillingTransition | null {
  const { before, after } = input;
  const base = { subscriptionId: after.id, planName: planNameFor(input.lookupKeys), periodEnd: after.currentPeriodEnd };

  if (LIVE.has(after.status) && (before === undefined || !WAS_ALREADY_ON.has(before.status))) {
    return { kind: "plan_activated", ...base };
  }
  if (LIVE.has(after.status) && after.cancelAtPeriodEnd && !(before?.cancelAtPeriodEnd ?? false)) {
    return { kind: "cancellation_scheduled", ...base };
  }
  if (after.status === "canceled" && before !== undefined && before.status !== "canceled") {
    // A plan switch by replacement (new subscription live, old one deleted) is not an ending.
    const current = pickCurrentSubscription(input.accountSubscriptions, input.now);
    const stillOn = current !== null && resolveEntitlement({ status: current.status, pastDueSince: current.pastDueSince, now: input.now }).active;
    if (!stillOn) return { kind: "plan_ended", ...base, periodEnd: before.currentPeriodEnd ?? after.currentPeriodEnd };
  }
  return null;
}

const CONSOLE_URL = "https://app.clueless-creations.com/console";
const KEYS_URL = `${CONSOLE_URL}/keys`;

interface NoticeCopy {
  readonly subject: string;
  /** Paragraphs, plain text. Rendered as `<p>` in HTML and blank-line separated in text. */
  readonly paragraphs: readonly string[];
  readonly action: { readonly label: string; readonly href: string };
}

function copyFor(transition: BillingTransition): NoticeCopy {
  const plan = transition.planName ? `Your ${transition.planName} plan` : "Your plan";
  const on = transition.periodEnd ? ` on ${formatDate(transition.periodEnd)}` : "";
  switch (transition.kind) {
    case "plan_activated":
      return {
        subject: "Your hosted access is on",
        paragraphs: [
          `${plan} is active${transition.periodEnd ? ` and renews${on}` : ""}. Your keys can use hosted access now.`,
          "Two steps to connect: create a key in the console, then paste the snippet for the agent you use — Claude Code, Codex, Cursor, or plain HTTP. You see each key once; revoke and replace it whenever you like.",
          "Change or cancel the plan any time from Manage billing in the console. Access runs to the end of the period you paid for.",
        ],
        action: { label: "Create a key", href: KEYS_URL },
      };
    case "cancellation_scheduled":
      return {
        subject: transition.periodEnd ? `Your plan ends ${on.trim()}` : "Your plan is set to end",
        paragraphs: [
          `Your cancellation is scheduled. Your keys keep working until${transition.periodEnd ? on : " the end of the period you paid for"}, and you will not be charged again.`,
          "Changed your mind? Open Manage billing in the console and choose Renew plan before then. Nothing else changes: your account and keys stay as they are.",
        ],
        action: { label: "Open the console", href: CONSOLE_URL },
      };
    case "plan_ended":
      return {
        subject: "Your hosted access has ended",
        paragraphs: [
          `${plan} ended${on}. Your keys no longer work with hosted access.`,
          "Your account and keys are kept. Choose a plan in the console to switch access back on; the same keys start working again as soon as the plan is active.",
        ],
        action: { label: "Choose a plan", href: CONSOLE_URL },
      };
  }
}

const SIGN_OFF = "Reply to this email if anything looks wrong and I will sort it out. — Eduardo";

/** Inline-styled, single-column, no images or scripts: what renders the same in every mail client. */
function renderHtml(copy: NoticeCopy): string {
  const paragraphs = copy.paragraphs.map((text) => `<p style="margin:0 0 16px;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0c10">${escapeHtml(text)}</p>`).join("");
  return `<!doctype html><html lang="en"><body style="margin:0;padding:32px 16px;background:#f3efe6">
<div style="max-width:560px;margin:0 auto;background:#f7f5ef;border-radius:12px;padding:32px">
<p style="margin:0 0 20px;font:600 13px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ef5b32">Clueless Creations</p>
${paragraphs}
<p style="margin:24px 0"><a href="${escapeHtml(copy.action.href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0b0c10;color:#f7f5ef;text-decoration:none;font:600 15px -apple-system,Segoe UI,Helvetica,Arial,sans-serif">${escapeHtml(copy.action.label)}</a></p>
<p style="margin:0;font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#5a5a62">${escapeHtml(SIGN_OFF)}</p>
</div></body></html>`;
}

function renderText(copy: NoticeCopy): string {
  return [...copy.paragraphs, `${copy.action.label}: ${copy.action.href}`, SIGN_OFF].join("\n\n");
}

/** The email for a transition, addressed and keyed. Exported for tests; `sendBillingNotice` is the caller. */
export function billingNoticeEmail(to: string, transition: BillingTransition, stripeEventId: string): OutboundEmail {
  const copy = copyFor(transition);
  return {
    to,
    subject: copy.subject,
    html: renderHtml(copy),
    text: renderText(copy),
    idempotencyKey: `${stripeEventId}:${transition.kind}`,
    tags: [{ name: "kind", value: transition.kind }],
  };
}

/**
 * Sends the notice for one transition, or logs why it did not. Never throws: a mail failure must
 * not turn a webhook that already wrote its rows into a 500 that Stripe retries. `mail` is `null`
 * when `RESEND_API_KEY` is unset, in which case the notice is logged as skipped.
 */
export async function sendBillingNotice(mail: MailConfig | null, to: string, transition: BillingTransition, stripeEventId: string): Promise<void> {
  if (mail === null) {
    console.warn(`mail: ${transition.kind} for ${stripeEventId} not sent; RESEND_API_KEY is unset`);
    return;
  }
  try {
    await sendEmail(mail, billingNoticeEmail(to, transition, stripeEventId));
  } catch (error) {
    // The address is not logged; the event id is enough to find the customer in Stripe.
    console.error(`mail: ${transition.kind} for ${stripeEventId} failed:`, error instanceof Error ? error.message : error);
  }
}
