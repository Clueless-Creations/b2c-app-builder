# Paywall, Pricing, And Experiments

Part of the [Revenue, Monetization, And Purchase Funnels](./revenue-monetization.md) hub. Pricing, plan mix, trial length, and paywall-model changes are all founder-approved — see the hub's **Founder-Only Gates**.

Use this for paywall timing/placement/trials/offers, pricing disclosure rules, the price-point decision procedure, and the standing paywall experiment cadence.

## Contents

- 1. Paywall Timing, Plans, Trials, And Offers
- 2. Pricing And Disclosure Rules
- 3. Price-Point Decision Procedure
- 4. Paywall Experiment Cadence
- 5. Surface To Engine Matrix

## 1. Paywall Timing, Plans, Trials, And Offers

Load `onboarding-conversion.md` when paywall placement is part of the first-session flow.
Load [`../experience/paywall-goal-headline.md`](../experience/paywall-goal-headline.md) when the paywall headline interpolates an onboarding goal.
Load `viral-growth-loops.md` when the paywall is paired with referral/share alternatives, creator-code entry, social proof loops, or content-driven impulse purchase timing.

Required decisions:

- hard paywall, soft paywall/freemium, reverse trial, web funnel, or no paywall yet
- value moment shown before paywall: personalized plan, analysis, preview, product demo, or completed setup
- paywall placement in onboarding and fallback if offerings fail to load
- closing offer or reverse-trial behavior after paywall dismissal
- package mix: weekly/monthly entry, annual recommended, lifetime optional only if sustainable
- trial duration hypothesis and experiment plan
- paid UA hypothesis when in scope: target event, CPA/LTV/payback window, selected channel, baseline window, and blended reporting owner

Evidence rules:

- RevenueCat's 2026 report shows hard paywalls materially outperform freemium on Day 35 download-to-paid conversion, but freemium can still be correct when free users drive word of mouth, network effects, UGC, or trust-building.
- RevenueCat's 2026 report shows longer trials can convert better, while shorter trials can speed learning and cash-flow feedback. Treat trial length as an experiment, not dogma.
- Trial **placement** is a separate lever from trial length: attaching the trial to the annual package only steers trial-seekers into annual and collects a year of cash up front on conversion — the pattern behind several fast-scaling 2026 consumer apps. Legitimate only with clear renewal price/term/cancellation disclosure on the paywall; run it as a plan-mix experiment (see `onboarding-conversion.md` Plan And Trial Mix).
- RevenueCat's 2026 report identifies the moment after paywall dismissal as a high-leverage conversion point. Test transparent downsells, reverse trials, or shorter commitments without fake scarcity or unclear renewal terms.
- Day 0 is the cancellation-risk window. The first session must prove value, explain billing clearly, and route users to the first activation task.
- RevenueCat's 2026 report shows AI-centric apps earn ~41% more revenue per payer but churn ~30% faster, and LLM-backed features carry real per-subscriber serving cost. Treat AI value as a conversion driver, not a retention guarantee: instrument retention from the first cohort, and follow the report's own unit-economics pattern for AI apps (lead with annual plans, run less-generous freemium, and add a higher-priced AI tier) rather than assuming novelty will keep users. See `billing-health-and-reactivation.md` §2 for the involuntary-churn side of retention.
- **The first renewal is the retention inflection.** Per the 2026 report, ~half of monthly subscribers and ~three in four yearly subscribers don't make it past the first renewal, but retention jumps ~18–30pp between the first and second renewal across all durations — surviving Renewal #1 is the true filter. Yearly plans retain ~3–10× better than weekly by Y1 (higher upfront commitment filters for stronger need), and access method (freemium vs. hard paywall) barely moves Y1 retention. Y1 retention is also softening year-over-year (annual median ~31%→28%, monthly ~10%→8%). The winning move is not gating harder or charging differently — it's **accelerating time-to-value before the first renewal decision**, so design onboarding/activation to land real value well inside the first billing cycle.

## 2. Pricing And Disclosure Rules

Before publishing pricing:

- founder approves price, trial, intro offer, renewal price, cancellation language, and refund posture
- paywall, landing page, app metadata, screenshots, terms, privacy, store products, RevenueCat offerings, Stripe prices, and analytics all match
- App Store Connect pricing, RevenueCat offering/package IDs, Stripe/web funnel prices, screenshots/app previews, custom product pages, In-App Events, and localized metadata all use the same approved price/trial/renewal facts
- if showing an annual intro offer, keep first-year price, renewal price, and monthly option visible together on direct funnel pages
- avoid fake scarcity, hidden renewal mechanics, or unsupported savings claims
- include platform billing caveats: App Store/Google Play manage in-app purchases; Stripe/RevenueCat/Paddle manage web purchases depending on chosen engine

## 3. Price-Point Decision Procedure

§2 governs how an approved price is disclosed; this section is how the price gets chosen. "Do pricing research" is not a procedure — this is, and its output lands in `revenue/REVENUE_OPS.md` under a "Pricing Decision" heading that `check:revenue` requires before the lane is done.

1. **Anchor against the category.** Pull the subscription prices of 5–10 direct competitors from `strategy/RESEARCH.md`'s competitor set — AppKittie app details (IAP lists) plus the live store listings are the sources. Record each competitor's monthly and annual price with the date checked, and compute the category range and median. An anchor table with fewer than five real rows means the research lane is not done enough to price against.
2. **Choose two or three candidate points, biased high.** The benchmarks in `revenue-monetization.md` §3 (anti-patterns 5–6) are the prior: higher-priced apps show ~5.4x monthly realized LTV and _higher_ download-to-paid conversion, because price reads as a quality signal. Default candidates: the category median, and one point meaningfully above it justified by the 11-star slice. Only go below median with a written reason (deliberate land-grab, network-effect freemium per §1 above). Anchor annual as the highlighted plan per §1 and `revenue-monetization.md` anti-pattern #5.
3. **Design the trial against the value moment, not the calendar.** Trial length and paywall placement route through `onboarding-conversion.md` (Plan And Trial Mix, Paywall Timing) — the trial must be long enough to reach the magical moment from `11_STAR_EXPERIENCE.md` at a realistic usage cadence, and trial length is an experiment, not a constant.
4. **Record the decision.** The chosen points, the anchor table, the rationale, and the founder's approval date go in `revenue/REVENUE_OPS.md` ("Pricing Decision"). Pricing is founder-only (see `revenue-monetization.md` §2 Founder-Only Gates); the procedure prepares the decision, it never makes it.
5. **Revisit on evidence, not anniversaries.** Post-launch price changes are driven by the cancellation-reason mix (`billing-health-and-reactivation.md` §3), realized LTV vs. the anchor assumptions (Economics Snapshot in `revenue/REVENUE_OPS.md`), and the kill-or-scale evidence pack — and every change routes through [`change-cascade.md`](../process/change-cascade.md) so store products, RevenueCat offerings, screenshots, landing, and legal move together.
6. **Derive territory prices with a dry-run.** Load `subscription-price-derivation.md` before `asc subscriptions pricing derive`.

## 4. Paywall Experiment Cadence

The first paywall is a hypothesis, not a decision. The apps that clear the $1K-to-$10K climb run continuous paywall/pricing experiments — timing, packaging, trial shape, offer — while the ~75% that never clear it typically shipped one reasonable paywall and stopped (anti-pattern #10 in `onboarding-conversion.md` names this; this section is its procedure). The cadence is a standing program, not a launch task:

- **The backlog is a living artifact.** `revenue/REVENUE_OPS.md`'s Paywall Experiment Backlog carries planned/active/completed rows. Each row names hypothesis, surface, variant, engine, primary metric, start date, result, and decision. `check:revenue` requires current activity once the app has been live four weeks with the revenue lane done — an active row, a completed row started within eight weeks, or a dated next experiment. A backlog of empty headers or one fossilized test is the one-and-done plateau wearing a green check. Shipping one reasonable paywall and stopping fails that gate.
- **The cycle log is the owned recurrence output.** Write `revenue/PAYWALL_EXPERIMENT_PROGRAM.md` on each run. Record Cycle date, Backlog change, and Next experiment. `check:revenue` requires a cycle row dated within 14 days after four live weeks.
- **One experiment at a time per surface,** measured on cohort economics (trial-start rate × trial-to-paid × early churn — `revenue-monetization.md` §3's guidance), never on day-one conversion alone. Minimum one full renewal-decision window before judging.
- **The test menu, in rough order of historical lift:** paywall timing/placement in onboarding, packaging mix (annual anchor, lifetime presence), trial length and type (opt-in vs opt-out, reverse trial), price point per §3's revisit procedure, closing offer, and paywall design/copy last.
- **Route by tooling:** RevenueCat Experiments is the default monetization engine. The app fetches the `current` Offering. Use PostHog only for UX that Offerings cannot express. Use bandit only for continuous allocation. A dated before/after is weaker evidence. Label it as weaker.
- **Founder gates hold:** price changes and new offers are founder-approved per `revenue-monetization.md` §2 Founder-Only Gates; the experiment program proposes, the founder disposes, and every completed test lands its decision back into §3's pricing record through `change-cascade.md`.
- **Do not invent social proof.** Experiment copy must not fabricate download counts. Load [`ethics-guardrail.md`](../experience/ethics-guardrail.md) when a variant shows counts, urgency, or scarcity.

## 5. Surface To Engine Matrix

Record this matrix in `revenue/REVENUE_OPS.md` before a live experiment starts.

`check:revenue` reads the matrix heading after four live weeks.

Engine values are exact tokens: `revenuecat_experiments`, `bandit`, `posthog`.

| Surface                                   | Default engine           | Allowed engine           | Rule                                                   |
| ----------------------------------------- | ------------------------ | ------------------------ | ------------------------------------------------------ |
| paywall, plan mix, trial, price, offering | `revenuecat_experiments` | `revenuecat_experiments` | Fetch the `current` Offering. Do not use bandit.       |
| creative, ASA keyword, UA arm             | `bandit`                 | `bandit`                 | Kill on CPA versus LTV. Do not replace RC price tests. |
| onboarding step order, non-offering copy  | `posthog`                | `posthog`                | Use when Offerings cannot express the variant.         |

A monetization surface with engine `bandit` fails closed.

An allocation surface with engine `revenuecat_experiments` fails closed.

Current activity after four live weeks must include one monetization row on `revenuecat_experiments`.

Creative-only bandit rows do not satisfy the paywall program.

RevenueCat Experiments may need a paid plan. Record that as a founder decision when the Free tier blocks it.
