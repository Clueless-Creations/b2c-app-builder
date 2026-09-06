# 07 — Monetization: Subscriptions + Creator Support (optional)

Stripe is the default because the pack's primary surface is **web**. If the founder ships a **native iOS** app, digital subscriptions generally must go through StoreKit/IAP (route via `revenue-monetization.md` + RevenueCat); Stripe Connect creator payouts can stay on Stripe. Do not ship a web Stripe paywall inside an iOS binary without resolving App Store policy first.

```
Add subscription monetization using Stripe.

Platform plan: $9/month (annual: $79/year)
Features for subscribers: verified badge, analytics dashboard, post scheduling,
longer posts (1,000 characters vs 280)

Implement:
1. Stripe Checkout for subscription signup
2. Stripe Customer Portal for managing/canceling subscription
3. Webhook handler for subscription events (new, cancelled, payment failed)
4. Subscription status stored in user table, checked on each request
5. Upgrade prompt shown to free users when they try to use premium features

Also add:
- Creator monetization: allow creators to set up a "Support me" button on their
  profile
- Fans can make one-time payments to creators ($1, $3, $5, custom)
- Platform takes 10% of creator payments
- Monthly payout to creators via Stripe Connect

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Reconcile with `revenue-monetization.md` before building.** Confirm the price points, plan mix, and paywall model against that lane's anti-pattern digest (do not soft-paywall by reflex; test annual vs monthly) — pricing/plan changes are founder-gated.
- The webhook **signing secret** and Stripe API keys are secrets — route through `SECRETS.md`. Verify webhook signatures; treat the webhook as an abuse surface in `trust/SECURITY.md`.
- "Subscription status checked on each request" should read a cached entitlement, not call Stripe per request. Reconcile entitlement identity with `revenue-monetization.md`.
- The free→paid upgrade prompt is an onboarding/paywall-timing decision — run `onboarding-conversion.md`; show it at a real value moment, not on first open.
- Creator payouts via **Stripe Connect** require connected-account onboarding and KYC — flag the founder-only gates (platform terms, tax, payout schedule) and record them in `revenue/REVENUE_OPS.md`.
- Add `paywall_viewed`, `checkout_started`, `subscription_activated`, `subscription_cancelled`, `creator_support_sent` to `analytics/ANALYTICS.md`.
</content>
