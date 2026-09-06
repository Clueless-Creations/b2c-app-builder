# Paid User Acquisition

## Fit Gate

Status: partial

Product destination:
Primary paid channel:
Target event:
Approved budget cap:
Date range:
Baseline window:
Privacy/store constraints:
Decision: fit | blocked | deferred | not fit

## Channel Choice

One-channel rule:
Selected channel:
Why this channel:
Rejected channels:
Campaign destination:
Target event:
Founder approval status:

| Channel | Fit reason | Creative burden | Attribution/reporting burden | Decision |
| --- | --- | --- | --- | --- |
| Meta Ads | Pending | Pending | Pending | pending |
| TikTok | Pending | Pending | Pending | pending |
| Google web-to-app | Pending | Pending | Pending | pending |
| Apple Ads | Pending | Pending | Pending | pending |

## Creative Production

Weekly cadence:
First batch size:
Product visibility rule:
Claim constraints:
Creative source: `CONTENT_ASSETS.md`
11-star source: `11_STAR_EXPERIENCE.md`

Creative scoring gate: score every video creative with the Virality Predictor (`brain_activity`) before paid distribution; do not spend on an unscored video creative. Record `virality_score` and `hook_dmn_risk` per creative and feed low scorers back through revision. See the Virality Closed Loop recipe in `tool-recipes/visual-and-motion-production.md`. (For static-only creative or a documented exception, record "virality scoring not applicable" with the reason.)

| Creative ID | Angle | Pain or desire | First frame | Product proof | CTA | Source asset | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UA-001 | Pending | Pending | Pending | Pending | Pending | Pending | planned |

## Non-Competitor Angle Hunt

Hunt print, cross-niche, Ad Library adjacent, and second-profile sources before the first paid creative batch. Expand the same ICP with a new motivation after the primary profile saturates. At least one adopted angle must be original under a competitor-wrong / logo-swap test. Do not clone competitor assets or claims. Foreplay is optional, not a B2C App Builder default. See `knowledge/growth/non-competitor-angle-discovery.md`.

| Angle ID | Source kind | Source note | Motivation | Competitor-wrong | Adopted |
| --- | --- | --- | --- | --- | --- |
| UA-ANG-001 | print | Record | Record | original | no |
| UA-ANG-002 | cross-niche | Record | Record | original | no |
| UA-ANG-003 | ad-library-adjacent | Record | Record | original | no |
| UA-ANG-004 | second-profile | Record | Record | original | no |

## Tracking Baseline

Analytics source: `analytics/ANALYTICS.md`
Revenue source: `revenue/REVENUE_OPS.md`
Store source: `APP_STORE_LISTING.md` or `store/STORE_CONSOLE.md`
Baseline report: `growth/paid-ua-report.csv`

MMP Before Spend: complete this tracking baseline before the first paid dollar. AppsFlyer is the default MMP when paid UA is in scope. Set `$appsflyerId` on RevenueCat before trial or purchase. A founder MMP waiver is required for any other stack.

Required data layers:
- RevenueCat LTV, cohorts, trial starts, purchases, and entitlement active count
- selected ad-network SDK or native report
- App Store Connect or Google Play Console source/store metrics
- PostHog acquisition-to-revenue funnel events
- self-reported attribution from onboarding/signup/waitlist

Baseline notes:

## Blended Report

Report owner:
Report cadence:
Tolerance for attribution discrepancy:

| Date | Channel | Spend | Installs/opens | Paywall views | Trials | Purchases | Revenue | LTV window | CPA | ROAS/payback | Virality score | Hook/DMN risk | Winning angle | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Weekly Schedule

- Monday: refresh campaign report, blended report, RevenueCat cohort/LTV view, and decide pause/keep/scale candidates.
- Tuesday: produce 3-5 creative assets tied to winning or unresolved angles.
- Wednesday: check delivery and upload 1-2 replacements when enough signal exists.
- Thursday: check pacing and major anomalies.
- Friday: decide scale, hold, reduce, or pause for the next week.
- Daily: 15-minute pacing and anomaly check only.

## Stop And Scale Rules

### Decision Thresholds

<!-- The numbers the weekly report is judged against (paid-user-acquisition.md,
     Stop And Scale Rules). Defaults are starting points; record the chosen
     number and adjust only with a dated reason. -->

Attribution tolerance: <!-- default ±20% disagreement between RevenueCat / store console / PostHog / self-reported -->
Payback window: <!-- default 90 days: blended CPA recoverable from realized LTV inside this window -->
Creative signal floor: <!-- default 2x target CPA in spend or 7 days per creative before judging it -->
Scale trigger: <!-- default 14 consecutive days at/under target CPA at approved spend before proposing an increase -->

Stop:
Hold:
Scale:
Outsource:

## Draft Status And Kill Window

Draft campaign status: PAUSED until founder approval of live delivery.
48-hour kill window: review CPA, payback, and product drop-off 48 hours after first spend. Pause when the kill rule fires.

## Founder-Only Gates

- ad account connection
- paid spend, budget changes, or automated rules that affect spend
- unpausing a PAUSED draft or enabling live delivery
- paid MMP/ad/ASO tooling
- ad-network SDK install when privacy/ATT/store disclosures change
- pricing, trial, intro offer, paywall, subscription, or legal-copy changes
- public ad creative, custom product pages, web funnels, or web purchase links

## Traceability

Launch trace source: `state/LAUNCH_TRACE.md`

| Trace ID | Evidence | Paid UA decision | Creative impact | Revenue/analytics impact | Store/privacy impact | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| PUA-001 | `strategy/RESEARCH.md` | Pending | `CONTENT_ASSETS.md` | `revenue/REVENUE_OPS.md`, `analytics/ANALYTICS.md` | `APP_STORE_LISTING.md`, `trust/PRIVACY.md`, `trust/TERMS.md` | Pending |

## Founder MMP Waiver

Use this table only to replace AppsFlyer. Empty rows do not grant a waiver. Approval state must be `approved` or `granted`.

| Date | Founder | Replacement stack | Approval state |
| --- | --- | --- | --- |
