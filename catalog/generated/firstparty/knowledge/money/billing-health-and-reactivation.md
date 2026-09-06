# Billing Health And Reactivation

Part of the [Revenue, Monetization, And Purchase Funnels](./revenue-monetization.md) hub.

Use this for the purchase-events backend/analytics contract, involuntary billing-failure recovery, and reactivation/win-back — the systems that protect and recover revenue after a purchase already happened, as opposed to `paywall-pricing-and-experiments.md`'s job of winning the purchase in the first place.

## Contents

- 1. Backend And Analytics Contract
- 2. Billing Health And Involuntary Churn (Recovery As A Growth Lever)
- 3. Reactivation And Win-Back (Plan-Dependent, Mostly Monthly)

## 1. Backend And Analytics Contract

Create or update `analytics/ANALYTICS.md` and backend docs with:

- stable user ID strategy across app, web, RevenueCat, Stripe, Supabase/Firebase, analytics, and support
- anonymous web purchase and redemption behavior
- purchase events: paywall viewed, product selected, checkout started, purchase completed, entitlement active, restore started/succeeded/failed, cancellation, refund, renewal, billing issue
- revenue source dimensions: platform, store, product_id, offering_id, price, currency, intro/trial state, campaign/source/medium
- webhook events and idempotency keys
- support lookup path for Apple Hide My Email or anonymous purchases

Acceptance:

- a support agent can find a user by app UID, RevenueCat App User ID, Stripe customer ID, store transaction ID, email, or anonymous redemption path.

## 2. Billing Health And Involuntary Churn (Recovery As A Growth Lever)

Not all churn is a user decision. RevenueCat's **State of Subscription Apps 2026** finds that on **Google Play ~31% of all subscription cancellations are involuntary billing failures** (a ~32.2% billing-error rate) — **more than double the App Store's ~14%** (~15.2%). The report's framing: for Android-heavy apps, _fixing billing is one of the highest-leverage growth levers available_, because recovered payments are retained revenue you already earned with no new acquisition spend. Refund medians cluster around 3–5%; involuntary churn is the larger, more recoverable leak.

This is distinct from the win-the-first-session work in `onboarding-conversion.md` (that is voluntary churn / failure to activate). Billing health is the recovery system for users who already decided to pay and then hit a card decline, expired card, insufficient funds, or grace-period lapse.

Treat billing recovery as a first-class system, not an afterthought:

- **Grace period + account hold (Android):** enable Google Play grace period and account hold so a failed renewal retries instead of revoking access instantly. Handle the Play RTDN states (`SUBSCRIPTION_IN_GRACE_PERIOD`, `SUBSCRIPTION_ON_HOLD`, `SUBSCRIPTION_RECOVERED`) through RevenueCat or the backend so entitlement state tracks the recovery, not just the first failure. Confirm exact state names against current Play billing docs before implementing (`revenuecat-and-store-products.md` §1).
- **Billing retry (iOS):** Apple retries failed renewals automatically; surface the App Store-managed _Billing Issue_ / update-payment path rather than treating the first decline as a hard cancel.
- **RevenueCat billing-issue webhook → dunning:** wire the RevenueCat `BILLING_ISSUE` / billing-issue webhook to a recovery sequence — an in-app banner and a push _before_ the grace period ends, plus the `payment.failed` lifecycle email in `resend-email-ops.md`. Give the user one tap to update the payment method (native subscription management deep link), and show the remaining grace period in plain language.
- **Experience-card alignment:** the Recovery & Trust Repair card (`experience-cards/recovery-and-trust-repair-card.md`) is the UX contract for this — its bright line (name what happened, restore what can be restored, unconditional gesture when the failure was the product's fault) and dark line (no spend prompt inside or immediately after the failure screen) govern the copy; pair them with the grace-period guidance above and keep the copy non-punitive. Full recovery recipe: `retention_get_mechanic("recovery-and-trust-repair")`.

Analytics: emit `billing_issue_detected`, `billing_recovery_prompt_shown`, `payment_method_update_started`, and `billing_recovered` / `billing_issue_churned` with `platform`, `store`, `grace_state`, and `failure_reason` dimensions so involuntary churn and recovery rate are measurable separately from voluntary churn. Do not report retention health without splitting voluntary vs. involuntary churn by platform.

## 3. Reactivation And Win-Back (Plan-Dependent, Mostly Monthly)

Some churn is recoverable later. RevenueCat's **State of Subscription Apps 2026** defines reactivation as the share of churned subscribers who become active again within 12 months, and the headline is that **reactivation is highly plan-dependent**: monthly-plan churners reactivate at ~18–24% across regions (~20% overall), weekly at ~7–10%, and **annual at just ~4–6% — annual churn is largely permanent** regardless of geography or price tier. Category spread is wide (monthly reactivation ranges ~6% to ~36%, highest in Productivity / AI-heavy apps), and high-priced monthly plans win back best (~28.9%) while high-priced annual churners (~4.4%) rarely return.

Design implications:

- **Don't bank win-back on annual churners.** Once an annual subscriber leaves, the data says they almost never come back inside a year. Put win-back energy where it pays off (monthly/weekly cohorts), and price/position annual to _prevent_ the churn rather than chase the return.
- **Reactivation fires when the problem recurs, not when the email lands.** For cyclical-need categories (dating, fitness, entertainment, seasonal/shopping), the durable move is staying useful after cancellation and making return frictionless — not campaign spam. Pair with the lifecycle/`payment.failed`/win-back sequences in `resend-email-ops.md`, but treat the email as a reminder for users whose need already returned, consistent with `onboarding-conversion.md` anti-pattern #4.
- **Offer pause instead of cancel, and keep return one tap.** Let users pause a subscription rather than fully cancel, and don't force them to re-enter payment details to come back. Surface this in the cancellation flow alongside the transparent downsell/closing offer (`onboarding-conversion.md`), without dark patterns.
- **Capture the cancellation reason at the moment of cancellation.** One screen in the in-app cancellation/pause flow — before the store-managed cancel handoff — with a fixed reason-code taxonomy: `too_expensive`, `missing_feature`, `found_alternative`, `not_needed`, `technical_issue`, `other` (free text optional, never required). Emit `cancellation_reason_selected` with `reason_code` and `plan_duration`. A delayed exit-survey email measures who answers email, not why people cancel — same Day-0 logic as the rest of this file. The aggregated mix feeds the Pricing Decision revisit (`paywall-pricing-and-experiments.md` §3 step 5: a `too_expensive` majority is pricing evidence), win-back targeting here (`missing_feature` churners are the reachable cohort when the feature ships), and the kill-or-scale evidence pack. Never gate the actual cancellation on answering — the screen is skippable in one tap, per the ethics guardrail.

Analytics: track `subscription_paused`, `reactivation_offer_shown`, `reactivated`, and `cancellation_reason_selected` with `prior_plan_duration`, `days_since_churn`, `price_tier`, and `reason_code` so reactivation is measured by plan duration (where the real gains are) rather than as a single blended rate. All §2/§3 event names live in the `analytics/ANALYTICS.md` Event Contract first — `check:analytics-catalog` reconciles `revenue/REVENUE_OPS.md` against the catalog the same way it does onboarding and growth docs.
