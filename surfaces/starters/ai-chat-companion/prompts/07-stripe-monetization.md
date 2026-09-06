# 07 — Subscription Monetization (optional)

Stripe is the default because the pack's primary surface is **web**. For **native iOS**, digital subscriptions go through StoreKit/IAP (route via `revenue-monetization.md` + RevenueCat). Reconcile tiers/price/caps with the revenue lane before building; pricing is founder-gated.

```
Add subscription monetization using Stripe.

Plan: a single paid tier (confirm price with the founder) that unlocks the
higher/unlimited usage cap and the better model tier from prompt 06, plus any
premium features (memory, voice, longer context).

Implement:
1. Stripe Checkout for subscription signup
2. Stripe Customer Portal for managing/canceling the subscription
3. A webhook handler for subscription events (created, updated, cancelled,
   payment failed) that updates the user's subscription status and plan
4. Subscription status read from a cached entitlement on each request (not a
   Stripe call per request); the metering check in prompt 06 reads it
5. The upgrade prompt shown when a free user hits the limit links to Checkout

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Reconcile with `revenue-monetization.md` first**: tier, price, what the paywall gates, and free-vs-paid caps. Confirm against the lane's anti-pattern digest (don't soft-paywall by reflex; consider annual). Pricing/plan changes are founder-gated.
- Webhook **signing secret** and Stripe keys route through `SECRETS.md`; verify webhook signatures and treat the webhook as an abuse surface in `trust/SECURITY.md`. Make subscription updates idempotent.
- Entitlement identity (which user a Stripe customer maps to) must be reconciled with `revenue-monetization.md`; the metering check reads a cached entitlement, not Stripe live.
- Add `checkout_started`, `subscription_activated`, `subscription_cancelled`, `payment_failed` to `analytics/ANALYTICS.md`; pair with the usage funnel for LTV/CPA.
</content>
