# 06 — Paywall And Monetization (optional)

Habit apps default to the cozy choice — generous freemium, a $1.99 price, a 3-day trial — and the benchmarks say the cozy choice quietly loses. Surface the trade-offs from `revenue-monetization.md` §3 (RevenueCat State of Subscription Apps 2026 figures) as **strong defaults to test, not dogma**, and get founder approval before building: pricing, plan mix, trial length, and paywall model are all founder-gated.

```
Add subscription monetization to the habit app.

Paywall model — implement the founder's approved choice between:
a) Freemium with a habit cap: free tier limited to N habits (confirm N with the
   founder; 2-3 is typical), with full history/insights (prompt 05) and
   unlimited habits in the paid tier
b) Hard paywall after onboarding: free first-run that creates the first habit
   and shows the today view, then the paywall with a trial before continued use

Plans and trial (founder-approved values):
- Annual as the highlighted plan with monthly visible alongside it
- A trial long enough for a habit loop to form (confirm length with the
  founder; default hypothesis 14+ days, A/B-tested)
- Price from the founder's approved value — do not invent a price

Billing by surface:
1. Web/PWA: Stripe Checkout + Customer Portal; webhook handler for created/
   updated/cancelled/payment-failed updating a cached entitlement
2. Native iOS/Android: RevenueCat with StoreKit/Play Billing products and an
   entitlement the app reads; digital subscriptions on native go through IAP,
   not Stripe
3. Feature gates (habit cap, history depth, insights) read the cached
   entitlement on the server, not the billing provider per request

Hard rules:
- Streak recovery/freezes from prompt 04 stay free — never paywall the escape
  hatch
- The paywall never appears in response to a streak break or inside the
  reminder flow
- Cancellation is reachable from settings without confirmshaming copy

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Reconcile with `revenue-monetization.md` §3 before building, and present the trade-offs to the founder rather than reaching for the reflex default**: hard paywalls convert roughly 5x better than freemium on Day-35 download-to-paid (~10.7% vs ~2.1%); apps whose most popular plan is yearly realize the highest revenue per install; trials of ≤4 days convert ~25.5% vs ~42.5% at 17–32 days; and low price anchors train users to value the app at nothing (high-priced apps show ~5.4x monthly realized LTV, with *higher* download-to-paid). Freemium is still a deliberate, defensible choice when free users drive word of mouth or accountability-circle network effects (prompt 07) — the anti-pattern is choosing it by reflex and never surfacing the trade-off.
- **The ethics boundary holds under monetization pressure.** Free streak recovery (prompt 04) is the streak card's required escape hatch; paywalling it, or pairing the paywall with streak-loss grief, is the named highest-risk dark pattern in `ethics-guardrail.md`.
- Billing path follows the surface: Stripe for web, RevenueCat + IAP for native (`revenue-monetization.md`). Do not ship the web Stripe paywall inside a native binary without resolving store policy first. Webhook signing secrets and API keys route via `SECRETS.md`; webhooks are an abuse surface in `trust/SECURITY.md` and updates must be idempotent.
- Paywall timing relative to the first check-in and any review prompt is governed by `onboarding-conversion.md`; the emotional peak (first check-in) belongs before the paywall.
- Add `paywall_shown`, `checkout_started`, `trial_started`, `subscription_activated`, `subscription_cancelled`, `payment_failed` to `analytics/ANALYTICS.md`; judge the model on cohort LTV and renewal, not install-day conversion alone.
