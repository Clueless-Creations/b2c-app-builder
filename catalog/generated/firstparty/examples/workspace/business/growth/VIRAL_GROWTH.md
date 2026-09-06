# Viral Growth

## Fit Gate

Status: partial

Audience/platform:
Visible result:
Emotional trigger:
Platform-native evidence:
Privacy/policy risks:
Decision: fit | blocked | deferred | not fit

## Growth Thesis

The loop should connect one truthful product moment to one platform-native content behavior and one measurable conversion path.

```text
Audience/platform:
Visible result:
Emotional trigger:
Product loop:
Content loop:
Conversion moment:
Why this could compound:
Why this could fail:
```

## Product Loop

Trigger:
Reward:
Recipient value:
Share artifact:
Surface:
Fallback:
Abuse controls:
Policy constraints:

### Referral Or Share Mechanic

- Stable referral/share key:
- Backend/provider owner:
- Unlock or reward:
- Self-referral/duplicate handling:
- Entitlement or reward validation:
- Support recovery path:

### Share Artifact Production

- Route personalized share cards (score, milestone badge, referral-unlock confirmation) through `higgsfield generate create gpt_image_2` with on-image user data and `DESIGN.md` palette; produce 9:16 for Stories/Reels and 1:1 for feed via `reframe`. Use `product-photoshoot --mode social_carousel` for referral-reveal carousels.
- Share cards are social artifacts, not store screenshots — the real-screenshots-only store guardrail does not apply, but the `DESIGN.md` brief and spend-confirmation gate do, public posting stays founder-gated, and outputs are recorded in `CONTENT_ASSETS.md`. See the share-card guidance in `knowledge/growth/viral-growth-loops.md`.

## Content Loop

Primary platform:
Account/creator route:
Product visibility rule:
CTA mechanic:
Comment/share mechanic:
App Store or landing path:
Claim constraints:

## Format Lab

| Format ID | Hook structure | First-frame visual | Product insertion | CTA | Variables to test | Signal window | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FMT-001 | Pending | Pending | Pending | Pending | Pending | 24h / 72h / 7d / 30d | planned |

## Monetization Timing

Paywall placement:
Intro offer or package test:
Closing offer:
Restore/terms/privacy visibility:
RevenueCat/Stripe/app-store linkage:
Risk notes:

## Measurement Plan

Analytics source: `analytics/ANALYTICS.md`
Dashboard proof: `analytics/analytics-plan.html`

Events to consider:
- `referral_invite_started`
- `referral_invite_completed`
- `referral_unlock_earned`
- `share_started`
- `share_completed`
- `creator_code_applied`
- `viral_format_signal_detected`
- `paywall_viewed`
- `purchase_completed`
- `entitlement_active`

Metrics:
- views, saves, shares, comments, and watch retention
- app opens, store clicks, branded search, and referral starts
- paywall reach, purchase conversion, revenue, and entitlement activation
- D1/D7 retention and first-session activation
- platform/device mix and traffic quality

## Loop Economics

The number that separates a compounding loop from decoration (`viral-growth-loops.md` Loop Economics): k = invites-per-active-user × recipient conversion. Compute weekly once the loop is live; the stop/scale rules key on k and its trend, never on gross share counts. k ≥ 1 self-compounds; 0.3–0.7 meaningfully multiplies other channels; under 0.15 the loop is not a growth engine yet.

| Week | Invites / active user | Recipient conversion | k | Cycle time (days) | Trend / decision |
| --- | --- | --- | --- | --- | --- |

## Stop And Scale Rules

- One viral post is not a format.
- Repeat a candidate format 5-8 times before judging.
- Scale only after 2-3 hits from the same structure plus downstream app/revenue evidence.
- Stop or reposition if traffic rises but paywall reach, purchase, retention, or audience-fit comments do not improve.

## Founder-Only Gates

- creator payments, paid tools, paid ads, or marketplace spend
- public posting, scheduling, or social account connection
- pricing, trial, offer, or subscription changes
- legal/policy approval for incentives, claims, reviews, minors, privacy, or referral mechanics

## Traceability

Launch trace source: `state/LAUNCH_TRACE.md`

| Trace ID | Evidence | Growth decision | Product impact | Content impact | Revenue/analytics/privacy impact | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| GROW-001 | `strategy/RESEARCH.md` | Pending | `PRODUCT.md`, `11_STAR_EXPERIENCE.md`, `product/ONBOARDING.md` | `growth/UGC_PLAYBOOK.md`, `CONTENT_ASSETS.md`, `growth/FASTLANE_OPS.md` | `revenue/REVENUE_OPS.md`, `analytics/ANALYTICS.md`, `trust/PRIVACY.md`, `trust/TERMS.md` | Pending |
