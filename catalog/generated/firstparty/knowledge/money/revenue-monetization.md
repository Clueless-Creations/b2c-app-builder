# Revenue, Monetization, And Purchase Funnels

## Tax And Payout Readiness

Record the legal owner for each store and payment provider. Confirm tax forms, banking details, payout currency, payout schedule, reserve or hold state, and reconciliation ownership. Keep sensitive values in the approved provider or secret manager. Record only status and sanitized evidence in the launch workspace. An incomplete tax or payout setup blocks a revenue-readiness claim.

Use this before setting up RevenueCat, Stripe, App Store/Google Play products, web billing, web purchase links, web funnels, paywalls, subscriptions, taxes, webhooks, pricing, entitlement identity, or purchase validation. This is the routing hub — it carries the decision matrix, the founder-only gates, and the anti-pattern digest; the setup and procedure detail live in the spokes below.

This is not a payment approval. Founder approval is required before changing prices, creating live billing products, enabling paid checkout, spending on ads, publishing subscription terms, or submitting store builds with monetization changes.

Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before replacing RevenueCat, Stripe, app-store product setup, paid RevenueCat features, tax tooling, or provider dashboards with local mocks or free-tier-only planning. Mock purchases are implementation proof only; they are not live entitlement proof.

Load `viral-growth-loops.md` before using referral unlocks, share rewards, creator codes, closing offers, or viral paywall timing as part of monetization. A growth spike is only useful if the paywall, entitlement, analytics, refund/restore, and abuse controls are ready to catch it.

Load `paid-user-acquisition.md` before using paid ads, Apple Search Ads, web-to-app campaigns, paid creative tests, or custom product pages to drive purchases. A paid campaign is only launch-ready when CPA can be evaluated against RevenueCat LTV/cohorts, trial conversion, payback window, and entitlement proof.

## Contents

- 1. Monetization Decision Matrix
- 2. Founder-Only Gates
- 3. Anti-Patterns (Monetization And Growth Decision Traps)
- 4. Per-Request Cost Model

## Spokes

| Load when                                                                                                                                                                                               | Spoke                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RevenueCat project/product/entitlement/offering setup, App Store/Play product gates, MISSING_METADATA, RevenueCat product-type reconciliation, paywall smoke proof, or promotional IAP/subscription art | [`revenuecat-and-store-products.md`](./revenuecat-and-store-products.md)     |
| Stripe account/checkout/webhooks/customer-portal setup, or RevenueCat Web Billing, Purchase Links, Web Funnels, Web SDK, or Redemption Links                                                            | [`stripe-and-web-billing.md`](./stripe-and-web-billing.md)                   |
| paywall timing/placement/trials/offers, pricing disclosure rules, the price-point decision procedure, the paywall experiment cadence, or RevenueCat Experiments vs bandit vs PostHog engine choice      | [`paywall-pricing-and-experiments.md`](./paywall-pricing-and-experiments.md) |
| the analytics/backend contract for purchase events, involuntary billing-failure recovery, or reactivation and win-back                                                                                  | [`billing-health-and-reactivation.md`](./billing-health-and-reactivation.md) |
| deriving one subscription's territory prices from another with `asc subscriptions pricing derive`                                                                                                       | [`subscription-price-derivation.md`](./subscription-price-derivation.md)     |

## 1. Monetization Decision Matrix

Choose the smallest reliable monetization path for the current phase:

- **Pre-build validation**: waitlist, pricing page, preorder interest, or non-charging web funnel. Do not imply paid access is active.
- **Mobile-only app subscription**: App Store/Google Play products, RevenueCat products/entitlements/offerings, in-app paywall, restore purchases, sandbox testing, store submission.
- **Web-to-app acquisition**: RevenueCat Web Billing or Stripe Billing through RevenueCat Web, Web Purchase Links or Web Funnels, Redemption Links, deep-link redemption, app entitlement validation.
- **Existing Stripe web business**: Stripe Billing remains billing engine, RevenueCat imports/syncs entitlements, Stripe webhooks and customer portal stay authoritative for billing management.
- **Direct Stripe without RevenueCat**: only use when the app does not need mobile store entitlements or cross-platform entitlement sync. For digital goods unlocked inside iOS/Android apps, review Apple/Google rules first.

Default for B2C mobile subscriptions: RevenueCat owns entitlements and cross-platform subscription state. Stripe may be the web payment rail or billing engine, but a successful Stripe payment is not launch-ready until it unlocks the correct RevenueCat entitlement in the app.

## 2. Founder-Only Gates

Always ask before:

- creating live Stripe/RevenueCat/Apple/Google products
- changing prices, trials, discounts, intro offers, renewal terms, tax settings, or billing engine
- enabling live checkout or publishing purchase links
- submitting IAP/subscriptions for review
- enabling external purchase links/calls to action in app
- changing refund/cancellation/legal language
- switching from Test Store/sandbox to production

Agents may self-resolve doc organization, sandbox validation sequencing, and which non-live checklist to run first.

## 3. Anti-Patterns (Monetization And Growth Decision Traps)

This skill mostly tells agents what to do. This section names what _not_ to do: the comfortable defaults that feel safe and quietly lose. They share one pattern — founders fall in love with building, then reach for the cozy choice on money and distribution. The losing moves are documented in public benchmarks; the winning moves are slightly uncomfortable.

Every figure below is from the RevenueCat State of Subscription Apps 2026 report. Treat each direction as a strong default to test against your product, not dogma — the existing nuance in `paywall-pricing-and-experiments.md` §1 and `onboarding-conversion.md` still holds (freemium can be right when free users drive network effects; trial length is an experiment). The anti-pattern is reaching for the cozy default _by reflex_ and never surfacing the trade-off.

This is the digest index. Traps 1–2, 5–6, and 13–14 are detailed here; the rest live in their home references.

| #   | Anti-pattern (the cozy default)                                   | Lives in                                             |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | Assume you are the exception                                      | here                                                 |
| 2   | Soft paywall by default because a hard paywall "feels pushy"      | here + `onboarding-conversion.md`                    |
| 3   | Default to a 3-day/short trial because "urgency converts"         | `onboarding-conversion.md`                           |
| 4   | Ignore the first session and bank on a day-30 win-back email      | `onboarding-conversion.md`                           |
| 5   | Push monthly, skip annual                                         | here                                                 |
| 6   | Price low to be "humble"                                          | here                                                 |
| 7   | Ship English-only; treat localization as optional translation     | `app-store-listing-prep.md`                          |
| 8   | Run ads before you can read the result                            | `paid-user-acquisition.md`                           |
| 9   | Optimize ad creative first                                        | `paid-user-acquisition.md`                           |
| 10  | Run one paywall experiment a year and call it focus               | `onboarding-conversion.md`                           |
| 11  | Chase views / vanity reach                                        | `paid-user-acquisition.md` + `viral-growth-loops.md` |
| 12  | Skip the App Preview video because it "feels like a real project" | `app-store-listing-prep.md`                          |
| 13  | Treat involuntary (billing-failure) churn as inevitable           | here + `billing-health-and-reactivation.md` §2       |
| 14  | Bank on AI novelty for retention                                  | here + `paywall-pricing-and-experiments.md` §1       |

**1. Assume you are the exception.** Only ~4.6% of newly launched apps reach $10K/month within two years, with roughly a 75% drop-off from the $1K to the $10K milestone. A vision board does not move you into the 4.6%. Do not pick a monetization model that only works if you are an outlier. Choose the path that survives if you are the median app, and instrument the funnel so you learn fast enough to climb.

**2. Soft paywall by default because a hard paywall "feels pushy."** Hard paywalls show a median ~10.7% Day-35 download-to-paid conversion vs ~2.1% for freemium (about 5x), and roughly 8–9x higher D14 revenue per install ($2.32 vs $0.27). Letting everyone in free and gently whispering "maybe upgrade someday" is the cozy choice that leaves most of the money behind. Default to _testing_ a hard paywall after a clear value moment; choose freemium **deliberately** when free users drive network effects, UGC inventory, marketplace value, or word of mouth (see `paywall-pricing-and-experiments.md` §1 and `onboarding-conversion.md` Paywall Timing), not because forcing a decision feels rude.

**5. Push monthly, skip annual.** Apps whose most popular plan is yearly generate the highest realized revenue per install (D14 $0.36, D60 $0.46 — above weekly- and monthly-dominant apps); an annual commitment locks in retention instead of handing the renewal decision back to the store every month. Do not lead with monthly because it "feels honest and low-commitment." Offer annual as the highlighted plan with monthly and any entry plan visible alongside it (see `onboarding-conversion.md` Plan And Trial Mix), and test the mix.

**6. Price low to be "humble."** High-priced apps show ~5.4x the monthly realized LTV of low-priced apps ($35.89 vs $6.67) and ~6x the yearly LTV ($62.19 vs $10.69) — and download-to-paid is _higher_ at higher prices (2.8% vs 1.4%), because price reads as a quality signal. Pricing at $2.99 "to avoid gouging anyone" trains users to value the app at nothing; it is not generous. Set price from delivered value and willingness to pay, then test it. (This is distinct from the App Store **container price**, which must stay Free for subscription/IAP apps — see `revenuecat-and-store-products.md` §2. The anti-pattern here is the _subscription/IAP price_ being anchored low out of timidity.)

**13. Treat involuntary (billing-failure) churn as inevitable.** On Google Play ~31% of cancellations are involuntary billing failures (~32.2% billing-error rate) vs. ~14% (~15.2%) on the App Store — and the report calls fixing billing one of the highest-leverage growth levers for Android apps, because recovered payments are revenue you already earned. Shipping the paywall and then shrugging at declines is the cozy default that quietly leaks retained revenue. Stand up the recovery system in `billing-health-and-reactivation.md` §2 (grace period / account hold, billing-issue webhook → dunning push + in-app banner + `payment.failed` email, one-tap update-payment), and split voluntary vs. involuntary churn by platform in analytics. Do not call retention "healthy" without measuring the involuntary slice.

**14. Bank on AI novelty for retention.** AI-centric apps earn ~41% more revenue per payer but churn ~30% faster (per the 2026 report), and LLM features carry real per-subscriber cost. Assuming the AI wow-factor will keep users — and skipping the retention/unit-economics work — is the trap. Instrument retention from the first cohort, protect margin per the report's AI pattern (annual-led plans, less-generous freemium, a higher-priced AI tier; see `paywall-pricing-and-experiments.md` §1), and judge an AI app on second/third-cycle renewal and reactivation, not just install-day conversion.

Founder-only gate reminder: pricing, plan mix, trial length, and paywall-model changes are all founder-approved (see §2 above). Surface the benchmark trade-off; do not silently apply or silently skip it.

## 4. Per-Request Cost Model

A pack that calls a paid LLM API carries a real per-request cost, not just a subscription price. Size that cost from four token components: input tokens, output tokens, cache-write tokens, and cache-read tokens. Each component has its own rate (`platform.claude.com/docs/en/about-claude/pricing`).

Cost per active user = (input tokens × input rate + output tokens × output rate + cache-write tokens × cache-write rate + cache-read tokens × cache-read rate) × requests per active user.

Count the real token payload, or call the provider's token-counting endpoint. Never estimate token count from character count — a request or output limit sized on a character estimate under- or over-counts real spend.

See `trust/AI_PROVIDER_CONTROLS.md` for the spend boundary that enforces this limit, and `trust/paid-generative-ai-controls.md` for the founder-facing per-request cost-model requirement this section mirrors.
