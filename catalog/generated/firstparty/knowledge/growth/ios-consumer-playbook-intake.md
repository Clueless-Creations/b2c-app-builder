# iOS Consumer Playbook Intake

Use this before encoding an external iOS consumer-app playbook into paywall, onboarding, or paid-UA gates.

This file records the B2C App Builder verdict for the Frederick James iOS tutorial that circulated in 2026. Revenue claims in that tutorial are not B2C App Builder doctrine.

## Contents

- 1. Verdict
- 2. Adopt
- 3. Adapt
- 4. Reject
- 5. Map To B2C App Builder Gates

## 1. Verdict

**ADAPT.** Keep durable mechanics. Reject unverifiable revenue claims. Reject Apple- or platform-ToS-risky tactics.

Do not treat "$10k/m in two months" as a target or a proof. B2C App Builder promises a decision system, not a revenue outcome.

## 2. Adopt

These mechanics already match B2C App Builder knowledge. Keep them:

- Position on a pain, not a vitamin feature.
- Ship a hard remote paywall through RevenueCat current Offering.
- Measure onboarding completion and download-to-paid, not day-one vanity CVR.
- Finish tracking before the first paid dollar.
- Keep spend, budgets, and ad accounts as founder-only gates.

## 3. Adapt

Use these as experiment menu items, not as fixed defaults:

- Long outcome-focused onboarding. Measure each step. Do not copy a 12-screen count.
- Annual-anchored plan mix with weekly and monthly entry. Price through the existing procedure.
- Honest social proof (problem, outcome, authority). Never invent download counts.
- TikTok-style creative tests inside the one-channel paid-UA system.
- MMP path when paid UA is in scope. AppsFlyer is the default later wiring (#220). Solos may start with network SDK plus RevenueCat plus a blended sheet.

## 4. Reject

Do not encode these as B2C App Builder defaults:

- Unverifiable personal revenue claims as category proof.
- One-to-one clones of a named competitor.
- Abandon-checkout or exit offers that hide price, trial, or cancellation facts.
- Comment keyword filters used to game a platform ranking or hide ads.
- Fake scarcity, fake testimonials, or fabricated social proof.
- Agent-launched spend without founder approval.

Apple subscription disclosure, restore, and cancellation rules stay in `privacy-terms.md` and `paywall-pricing-and-experiments.md`. A playbook cannot override them.

## 5. Map To B2C App Builder Gates

| Playbook claim                     | B2C App Builder owner                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Hard paywall                       | `onboarding-conversion.md`, `paywall-pricing-and-experiments.md`, `check:revenue` |
| Onboarding length                  | `onboarding-conversion.md`, `check:onboarding-graph`                              |
| D2P over vanity CVR                | `paywall-pricing-and-experiments.md` experiment cadence                           |
| MMP before spend                   | `paid-user-acquisition.md`, `check:paid-ua`                                       |
| PAUSED drafts and 48-hour kill     | `PAID_UA.md`, `check:paid-ua`                                                     |
| ASO keywords and screenshots       | `aso-store-ops.md`                                                                |
| App Review recovery                | store review playbook, autonomous loop                                            |
| Experimentation as a standing lane | `paywall-pricing-and-experiments.md`                                              |
