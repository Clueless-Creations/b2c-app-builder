# Stripe And Web Billing

Part of the [Revenue, Monetization, And Purchase Funnels](./revenue-monetization.md) hub. Honor the **Founder-Only Gates** there before creating live products, changing prices, or enabling live checkout.

Use this for Stripe direct setup (web checkout, physical/outside-app goods, B2B invoices) and for RevenueCat Web Billing, Purchase Links, Web Funnels, Web SDK, and Redemption Links.

## Contents

- 1. Official Sources To Refresh
- 2. Stripe Required Setup
- 3. RevenueCat Web Billing, Purchase Links, And Funnels

## 1. Official Sources To Refresh

Refresh current docs before acting because payment and tax rules change:

- Stripe subscriptions and webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe customer portal: https://docs.stripe.com/customer-management
- Stripe go-live checklist: https://docs.stripe.com/get-started/checklist/go-live
- Stripe Tax or tax rates when selling web subscriptions: https://docs.stripe.com/payments/advanced/tax
- RevenueCat Web overview: https://www.revenuecat.com/docs/web/web-billing/overview
- RevenueCat Web Purchase Links: https://www.revenuecat.com/docs/web/web-billing/web-purchase-links
- RevenueCat Redemption Links: https://www.revenuecat.com/docs/web/web-billing/redemption-links

Record checked dates, links, and resulting decisions in `revenue/REVENUE_OPS.md` or `LEGAL_REVIEW.md`.

## 2. Stripe Required Setup

Use Stripe directly only for web checkout, physical/outside-app goods, B2B invoices, or a chosen web billing engine. For mobile app digital subscriptions, Stripe alone is not enough.

Setup:

- create/verify Stripe account, business profile, branding, support email, statement descriptor, and payout bank
- decide Checkout/Payment Links/Customer Portal vs custom Payment Element; prefer hosted Stripe surfaces for speed and lower risk
- create products and recurring prices if using Stripe Billing
- configure Stripe Tax or explicit tax posture before live subscription sales
- configure customer portal for billing details, invoices, cancellation, and plan changes
- configure webhooks and verify signatures; use idempotency keys and replay protection before mutating entitlements, per `security-release-hardening.md` Revenue And Entitlement Abuse; handle subscription status, invoice paid/failed/finalization failures, payment action required, and cancellation
- use Stripe CLI/sandbox to test all lifecycle events before live mode
- switch to live API keys only after Stripe go-live checklist, webhook endpoint, domain, and terms/privacy pages are ready

Validation:

- test subscription signup
- test failed payment and action-required path
- test customer portal cancellation/update
- verify webhook processing updates the app/backend entitlement source
- verify receipts/emails/support/refund path
- verify public pricing matches Stripe/RevenueCat configured prices

## 3. RevenueCat Web Billing, Purchase Links, And Funnels

RevenueCat Web can support:

- Web Billing with Stripe as payment gateway and RevenueCat managing billing lifecycle
- Stripe Billing connected into RevenueCat Web, where Stripe owns products, subscriptions, emails, and management
- Web Purchase Links for no-code hosted checkout
- Web SDK for custom logged-in web apps
- Web Paywalls and Web Funnels for hosted multi-step web acquisition
- Redemption Links so anonymous web purchasers can redeem access inside the mobile app

**Why web is worth the effort (2026 report signal).** Web revenue adoption scales sharply with success: **~41% of top-tier apps generate web revenue vs. just ~1.3% of hobby-tier apps** — a ~31× gap, with adoption roughly doubling at each revenue tier. Web is still only ~3.2% of total revenue globally (higher in North America at ~4.9%, lower in IN/SEA at ~0.8%), so treat it as a high-leverage _acquisition and margin_ lane for a scaling app, not a day-one requirement for a pre-revenue one. The report's framing is that smaller apps under-adopt web mostly because they _haven't tried_, not because it can't work.

**Web funnels are a different funnel, not a copy of onboarding.** Two report findings to encode when designing a web funnel (see `onboarding-conversion.md`): (1) web audiences sit higher in the consideration phase, so a web funnel should **sell the problem before the solution** rather than rush to the in-app "aha"; (2) on web, **a discounted paid trial often outperforms a free trial** — free web trials attract immediate-cancel users that pollute ad-optimization signal (this is the web-specific case of the paid-intro-offer finding in `onboarding-conversion.md`). Run web and app-install creative separately; winners on one channel frequently fail on the other.

Choose:

- **Web Purchase Link** for fastest static landing page checkout.
- **Web Funnel** when paid ads need quiz/onboarding steps before checkout.
- **Web SDK** when the user is logged into a web app and needs a custom checkout UI.
- **Stripe Billing integration** when Stripe products/subscriptions already exist.
- **RevenueCat Web Billing** when starting fresh and wanting RevenueCat-centered subscription lifecycle and reporting.

Required for anonymous web-to-app:

- enable Redemption Links
- register RevenueCat custom URL scheme/deep link in iOS/Android app
- test purchase on a mobile device with the app installed
- show desktop fallback with QR code or install instructions
- handle expired redemption links and support recovery
- verify final entitlement in the mobile app after redemption

Do not publish sandbox purchase links. Keep production and sandbox URLs clearly labeled.
