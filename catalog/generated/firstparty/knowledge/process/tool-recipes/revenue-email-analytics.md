# Revenue, Email, And Analytics Routing

Use current tools and live data whenever possible. Treat this file as workflow, not fixed facts.

Part of the [Tool Recipes](../tool-recipes.md) index. Before using any paid or account-gated tool named below, honor the **Paid Tool Decision Protocol** and **Founder-Only Gates** in that index.

---

## Revenue And Monetization Routing

Purpose: set up purchase infrastructure without confusing payment success with app entitlement access.

Use `revenue-monetization.md` as the router. Delegate to local skills when available:

- `setup-revenuecat` for initial RevenueCat project, `premium` entitlement, and default offering scaffold.
- `stripe-best-practices` before Stripe Checkout, Payment Links, Billing, Customer Portal, webhooks, or tax decisions.
- ASO `monetization-strategy`, `subscription-lifecycle`, and `retention-optimization` for pricing, paywall timing, churn, and lifecycle loops.
- `setup-posthog` once the product repo exists and purchase/subscription events need validation.
- `setup-supabase` if the funnel or backend needs accounts, waitlist, referrals, or subscription projection storage.
- `resend-email-ops.md` before subscription lifecycle emails, payment recovery, receipts, trial reminders, or billing-support notifications.

Rules:

- RevenueCat should be the entitlement source of truth for B2C mobile subscriptions unless the project explicitly chooses a different architecture.
- Stripe may process web payments, but web payment success must be mapped into RevenueCat entitlement or backend access before launch-ready.
- App Store/Google Play product setup, web billing, pricing, taxes, subscription terms, and live checkout are founder-only gates.
- Use sandbox/Test Store first; do not publish production purchase links or live prices until validation passes and the founder approves.
- RevenueCat, Stripe, tax, and store-account features can be paid/account-gated. Use [`paid-tool-routing.md`](../../operations/paid-tool-routing.md) before replacing provider setup with local mocks or free-tier planning, and never call mocks live entitlement proof.

### Recipe: RevenueCat Economics Pull

Purpose: get the revenue numbers out of the dashboard and into decisions on a fixed cadence — the offering/entitlement probe (`probe:revenuecat`) proves the plumbing works, this recipe reads what flows through it. Run it before every kill-or-scale checkpoint (`post-launch-operations.md` §9) and each Weekly Ops Review growth step once spend is active.

1. Refresh the current RevenueCat charts/metrics docs from the §1 sources in `revenuecat-and-store-products.md` before relying on chart names or API shapes — dashboards and endpoints move; record the docs basis and checked date with the numbers.
2. Pull four numbers for the trailing window: MRR, realized LTV per paying customer, download-to-paid (initial) conversion, and churn split voluntary vs. involuntary by platform (the `billing-health-and-reactivation.md` §2 events make the split readable in PostHog when RevenueCat's own view is too coarse).
3. Land them in the `revenue/REVENUE_OPS.md` Economics Snapshot row for the date, with the source named per row.
4. Route the consequences, not just the numbers: LTV and payback feed the `growth/PAID_UA.md` blended report and its Decision Thresholds; the cancellation-reason mix feeds the Pricing Decision revisit (`paywall-pricing-and-experiments.md` §3 step 5); the whole row feeds the kill-or-scale evidence pack.
5. Numbers that would change a founder-gated decision (price, spend, kill/scale) get surfaced in the reply per the narration contract — never only written to the file.

## Resend Email Routing

Purpose: set up outbound, lifecycle, broadcast, and optional inbound email without damaging domain reputation or creating compliance gaps.

Use `resend-email-ops.md` before:

- Resend domain creation or DNS changes
- transactional email send wrappers
- waitlist confirmations, welcome messages, trial reminders, payment recovery, receipts, support confirmations, or admin alerts
- Contacts, Topics, Segments, Broadcasts, or Automations
- unsubscribe/preference handling
- Resend webhooks, inbound receiving, or attachment processing

Rules:

- Prefer a verified sending subdomain over the root domain.
- Keep Resend API keys server-side only; never use `NEXT_PUBLIC_` or browser bundles.
- Prefer sending-access/domain-scoped keys for runtime senders.
- Use idempotency keys for retryable transactional sends.
- Verify webhooks with the raw request body and store `svix-id` to handle duplicates.
- Add unsubscribe/preference handling for lifecycle and marketing email.
- Treat inbound MX changes as founder-gated when they could affect existing mailboxes or Cloudflare Email Routing.
- Resend account/domain features can be paid/account-gated. Use `paid-tool-routing.md` before replacing Resend with local email previews, logs, Gmail, Cloudflare Email Routing, or another provider.

## PostHog Analytics And Attribution Routing

Purpose: make analytics, attribution, and launch learning visible before implementation and then validate the first real events once a repo exists.

Use `analytics-attribution.md` before:

- PostHog setup or SDK installation
- event catalogs, funnels, dashboards, or PostHog project decisions
- landing/waitlist/referral analytics
- onboarding attribution questions
- paywall, trial, closing-offer, or RevenueCat/Stripe event naming
- feature flags, experiments, session replay, surveys, or data pipelines
- Fastlane/social campaign UTM conventions
- builder prompts that ask another agent to implement events

Delegate:

- `setup-posthog` only after the product repo exists and can receive an event scaffold.
- `setup-posthog` handles initial project/setup validation; B2C App Builder owns the upfront `analytics/ANALYTICS.md` and `analytics/analytics-plan.html`.
- Use current PostHog docs or Context7/web docs for stack-specific SDK details because PostHog SDK options, defaults, and product docs change.

Default stack:

- PostHog primary for product analytics, web analytics, feature flags, funnels, session replay when explicitly enabled, surveys, and experiments.
- RevenueCat as subscription entitlement truth and subscription event source.
- Stripe as web payment truth when direct checkout exists.
- GA4/ad-network tooling only when paid ads, Google attribution, or platform reporting require it.
- Sentry for errors/crashes, not product analytics.

Rules:

- Create `analytics/ANALYTICS.md` and a founder-visible `analytics/analytics-plan.html` before implementation.
- Track waitlist, referral, pricing-section, app-store CTA, onboarding steps, attribution answer, demo video, personalized plan, review prompt eligibility/request, paywall view/dismissal, closing offer, activation, subscription lifecycle, restore, refund, email lifecycle, and Fastlane campaign events when relevant.
- Combine technical attribution with self-reported attribution; UTMs alone miss word-of-mouth, creator, AI-search, and social discovery.
- Use one analytics wrapper per surface; do not scatter vendor SDK calls throughout app code.
- Validate at least one real event in the dashboard before saying analytics is live.
- Do not enable replay, surveys, ad identifiers, or sensitive event properties without privacy/store-disclosure mapping.
- PostHog paid/account features can affect replay, surveys, experiments, retention, and data pipelines. Use `paid-tool-routing.md` before replacing them with static plans or local event logs.
