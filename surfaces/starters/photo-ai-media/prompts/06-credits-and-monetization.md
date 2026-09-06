# 06 — Credits & Monetization (optional)

Every generation costs real provider money, so **metering must precede monetization** — the credit ledger from prompt 01 and the cost tracking from prompt 04 are prerequisites, not afterthoughts. The model choice (credit packs vs subscription vs both) and all prices are founder-gated.

```
Add monetization on top of the credit ledger.

Model (confirm the exact mix and prices with the founder before building):
- Credit packs: one-time purchases of N credits (consumable) — fits one-shot
  occasions like a headshot pack
- Subscription: a monthly/annual plan granting a recurring credit allowance
  and premium features (watermark-free export, premium presets, higher
  resolution, priority queue)
- A small free grant at signup so the wow moment happens before the paywall

Implement:
1. For the web surface: Stripe Checkout for packs and subscriptions, the
   Customer Portal for managing/cancelling, and a webhook handler (purchase
   completed, subscription created/updated/cancelled, payment failed) that
   writes credit grants and entitlement changes — idempotently — to the ledger
2. For a native surface: RevenueCat entitlements over StoreKit/Play Billing
   for both consumable packs and subscriptions; its webhook writes the same
   ledger rows
3. Server-side credit check before every generation (already in prompt 04);
   the out-of-credits state shows the balance, what a pack/plan grants, and a
   clear price — no silent failure, no dark-pattern countdown
4. A balance + purchase-history surface in account settings

All grants/spends/refunds flow through the append-only ledger; entitlement
reads come from a cached status, not a live billing-provider call per request.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **Reconcile with `revenue-monetization.md` §3 before picking the model — as defaults to TEST, not dogma:** hard paywalls convert ~5x freemium (median ~10.7% vs ~2.1% D35 download-to-paid), yearly-dominant apps show the highest realized LTV, price reads as a quality signal (high-priced apps show ~5.4x monthly LTV *with higher* conversion), and paid intro offers are worth testing over reflexive free trials. The anti-pattern is reaching for the cozy default (generous freemium, monthly-only, $2.99) by reflex and never surfacing the trade-off. Per the report's AI pattern: AI apps earn more per payer but churn faster — protect margin (annual-led, less-generous freemium) and judge on renewals, not install-day conversion.
- **Per-generation COGS is the difference from ordinary subscription apps:** a free user is not "free" — every generation has a provider invoice behind it. Price packs and allowances from the measured cost per generation (prompt 04), and never grant unmetered "unlimited" generations without a fair-use cap.
- Pricing, plan mix, pack sizes, and the free grant are **founder-gated** (`revenue-monetization.md` §2): surface the benchmark trade-offs, then the founder decides. Record in `revenue/REVENUE_OPS.md`.
- Billing path follows the surface: Stripe for web; native digital purchases go through IAP via RevenueCat — do not ship the web Stripe paywall inside a native binary without resolving store policy first.
- Webhook signing secrets route through `SECRETS.md`; webhooks are an abuse surface (`trust/SECURITY.md`) and ledger writes must be idempotent. Handle involuntary billing-failure churn (grace period, dunning) per `billing-health-and-reactivation.md` §2.
- The out-of-credits upgrade moment is paywall timing (`onboarding-conversion.md`) and sits next to the Variable Reward loop — an honest price at a real value moment, never a spend-compulsion nudge (`ethics-guardrail.md`).
- Add `checkout_started`, `credits_purchased`, `subscription_activated`, `out_of_credits_shown`, `payment_failed` to `analytics/ANALYTICS.md`; pair with per-generation cost for margin dashboards.
