/**
 * The console's outbound mail: the Resend request `sendEmail` makes, the transition rule that
 * decides which billing notice (if any) an event earns, and the copy each notice carries.
 * Everything here is in-process; the webhook integration suite proves the wiring end to end.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubscriptionSummary } from "../../knowledge-mcp/db/tenant.js";
import { billingNoticeEmail, detectBillingTransition, sendBillingNotice } from "../mail/billing-notices.js";
import { MAIL_FROM, mailConfigFromEnv, ResendApiError, sendEmail } from "../mail/resend.js";

function capturingFetch(seen: { url: string; init: RequestInit }[], status = 200, body: unknown = { id: "email_test_0001" }): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

test("mailConfigFromEnv treats an unset or blank key as mail off", () => {
  assert.equal(mailConfigFromEnv({}), null);
  assert.equal(mailConfigFromEnv({ RESEND_API_KEY: "  " }), null);
  assert.deepEqual(mailConfigFromEnv({ RESEND_API_KEY: "re_test_123" }), { apiKey: "re_test_123" });
});

test("sendEmail posts Resend's documented shape with the sender, the idempotency key, and tags", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const result = await sendEmail(
    { apiKey: "re_test_123", fetchImpl: capturingFetch(seen) },
    { to: "sam@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi", idempotencyKey: "evt_1:plan_activated", tags: [{ name: "kind", value: "plan_activated" }] },
  );
  assert.deepEqual(result, { id: "email_test_0001" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, "https://api.resend.com/emails");
  const headers = new Headers(seen[0]!.init.headers);
  assert.equal(headers.get("Authorization"), "Bearer re_test_123");
  assert.equal(headers.get("Idempotency-Key"), "evt_1:plan_activated");
  assert.equal(headers.get("Content-Type"), "application/json");
  const body = JSON.parse(String(seen[0]!.init.body));
  assert.equal(body.from, MAIL_FROM);
  assert.equal(MAIL_FROM, "Clueless Creations <eduardo@clueless-creations.com>");
  assert.deepEqual(body.to, ["sam@example.com"]);
  assert.equal(body.subject, "Hi");
  assert.deepEqual(body.tags, [{ name: "kind", value: "plan_activated" }]);
});

test("sendEmail throws a ResendApiError on a non-2xx answer, carrying the status", async () => {
  await assert.rejects(
    sendEmail({ apiKey: "re_test_123", fetchImpl: capturingFetch([], 422, { message: "invalid to" }) }, { to: "x", subject: "s", html: "h", text: "t", idempotencyKey: "k" }),
    (error: unknown) => error instanceof ResendApiError && error.status === 422,
  );
});

test("sendBillingNotice never throws: mail off is a warning, a Resend failure is an error line", async () => {
  const transition = { kind: "plan_activated" as const, subscriptionId: "sub_1", planName: "Monthly", periodEnd: null };
  await assert.doesNotReject(sendBillingNotice(null, "sam@example.com", transition, "evt_off"));
  await assert.doesNotReject(sendBillingNotice({ apiKey: "re_test", fetchImpl: capturingFetch([], 500, { message: "down" }) }, "sam@example.com", transition, "evt_down"));
});

function row(overrides: Partial<SubscriptionSummary> & { readonly id: string; readonly status: SubscriptionSummary["status"] }): SubscriptionSummary {
  return { pastDueSince: null, priceId: "price_MONTHLY0001", cancelAtPeriodEnd: false, currentPeriodEnd: "2026-10-05T12:00:00.000Z", ...overrides };
}

const now = new Date("2026-09-07T12:00:00.000Z");
const monthly = ["b2c_pro_monthly"];

test("detectBillingTransition: a subscription that becomes live earns plan_activated, once", () => {
  const after = row({ id: "sub_a", status: "active" });
  assert.equal(detectBillingTransition({ before: undefined, after, lookupKeys: monthly, accountSubscriptions: [after], now })?.kind, "plan_activated");
  assert.equal(detectBillingTransition({ before: row({ id: "sub_a", status: "incomplete" }), after, lookupKeys: monthly, accountSubscriptions: [after], now })?.kind, "plan_activated");
  // Already on: a renewal, or a recovery from past_due, is not an activation.
  assert.equal(detectBillingTransition({ before: row({ id: "sub_a", status: "active" }), after, lookupKeys: monthly, accountSubscriptions: [after], now }), null);
  assert.equal(detectBillingTransition({ before: row({ id: "sub_a", status: "past_due" }), after, lookupKeys: monthly, accountSubscriptions: [after], now }), null);
  const named = detectBillingTransition({ before: undefined, after: row({ id: "sub_a", status: "active", priceId: "price_ANNUAL00001" }), lookupKeys: ["b2c_pro_annual"], accountSubscriptions: [after], now });
  assert.equal(named?.planName, "Annual");
  assert.equal(named?.periodEnd, "2026-10-05T12:00:00.000Z");
});

test("detectBillingTransition: scheduling a cancellation earns one notice; a redelivery or a renewal does not", () => {
  const before = row({ id: "sub_a", status: "active" });
  const scheduled = row({ id: "sub_a", status: "active", cancelAtPeriodEnd: true });
  assert.equal(detectBillingTransition({ before, after: scheduled, lookupKeys: monthly, accountSubscriptions: [scheduled], now })?.kind, "cancellation_scheduled");
  assert.equal(detectBillingTransition({ before: scheduled, after: scheduled, lookupKeys: monthly, accountSubscriptions: [scheduled], now }), null, "the mirror discarded an older event: no change, no mail");
  assert.equal(detectBillingTransition({ before: scheduled, after: before, lookupKeys: monthly, accountSubscriptions: [before], now }), null, "renewing from the portal is quiet");
});

test("detectBillingTransition: plan_ended only when no other subscription on the account still grants access", () => {
  const before = row({ id: "sub_old", status: "active", cancelAtPeriodEnd: true });
  const ended = row({ id: "sub_old", status: "canceled", currentPeriodEnd: null });
  const ending = detectBillingTransition({ before, after: ended, lookupKeys: monthly, accountSubscriptions: [ended], now });
  assert.equal(ending?.kind, "plan_ended");
  assert.equal(ending?.periodEnd, "2026-10-05T12:00:00.000Z", "the end date comes from the row before it was canceled, which still knew the period");
  const replacement = row({ id: "sub_new", status: "active", priceId: "price_ANNUAL00001" });
  assert.equal(detectBillingTransition({ before, after: ended, lookupKeys: monthly, accountSubscriptions: [ended, replacement], now }), null, "a plan switch by replacement is not an ending");
  assert.equal(detectBillingTransition({ before: ended, after: ended, lookupKeys: monthly, accountSubscriptions: [ended], now }), null);
  assert.equal(detectBillingTransition({ before: undefined, after: ended, lookupKeys: monthly, accountSubscriptions: [ended], now }), null, "a subscription first seen already canceled tells the customer nothing new");
});

test("billingNoticeEmail: plain copy, the date, the next step, escaped HTML, and a per-event idempotency key", () => {
  const activated = billingNoticeEmail("sam@example.com", { kind: "plan_activated", subscriptionId: "sub_a", planName: "Monthly", periodEnd: "2026-10-05T12:00:00.000Z" }, "evt_act");
  assert.equal(activated.subject, "Your hosted access is on");
  assert.match(activated.text, /Your Monthly plan is active and renews on 5 Oct 2026\./);
  assert.match(activated.text, /Create a key: https:\/\/app\.clueless-creations\.com\/console\/keys/);
  assert.match(activated.html, /href="https:\/\/app\.clueless-creations\.com\/console\/keys"/);
  assert.equal(activated.idempotencyKey, "evt_act:plan_activated");
  assert.deepEqual(activated.tags, [{ name: "kind", value: "plan_activated" }]);
  assert.doesNotMatch(activated.html, /<script/i);

  const scheduled = billingNoticeEmail("sam@example.com", { kind: "cancellation_scheduled", subscriptionId: "sub_a", planName: "Annual", periodEnd: "2026-10-05T12:00:00.000Z" }, "evt_can");
  assert.equal(scheduled.subject, "Your plan ends on 5 Oct 2026");
  assert.match(scheduled.text, /keep working until on 5 Oct 2026|keep working until 5 Oct 2026/);
  assert.match(scheduled.text, /you will not be charged again/);
  assert.match(scheduled.text, /choose Renew plan/);

  const ended = billingNoticeEmail("sam@example.com", { kind: "plan_ended", subscriptionId: "sub_a", planName: null, periodEnd: null }, "evt_end");
  assert.equal(ended.subject, "Your hosted access has ended");
  assert.match(ended.text, /Your plan ended\. Your keys no longer work with hosted access\./);
  assert.match(ended.text, /Choose a plan: https:\/\/app\.clueless-creations\.com\/console/);

  for (const email of [activated, scheduled, ended]) {
    assert.doesNotMatch(`${email.subject}\n${email.text}`, /refund/i, "no buyer-facing surface may promise a refund");
    assert.match(email.text, /— Eduardo$/);
  }
});
