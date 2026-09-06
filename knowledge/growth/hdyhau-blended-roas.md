# HDYHAU Survey And Blended ROAS

Use this before spend-ready attribution for a solo founder.
A How Did You Hear About Us survey is a bias check.
It is not a replacement for a mobile measurement partner.

AppsFlyer remains the later MMP path.
Stay on this lighter path until paid UA needs network-level matching.

## Contents

- 1. Survey Rules
- 2. Blended Report
- 3. Handoff To AppsFlyer
- 4. Outputs
- 5. Common Failure Modes

## 1. Survey Rules

Place the survey mid-onboarding.
Do not wait until the last screen only.

Randomize option order on each show.
Allow multi-select.
Include TV and other offline sources in the visible list.

Store the answer on `self_reported_source` with the stable keys already in the attribution contract.
Do not add `tv` as a required stored key.
Keep TV as a display choice that can map to `other` plus free text, or to a documented alias.

`check:attribution` reads these rules in `analytics/ANALYTICS.md` when the analytics lane is active.

## 2. Blended Report

Write a daily blended row in `growth/paid-ua-report.csv`.

Each row must let the founder compare:

- paid spend
- store or network installs
- RevenueCat trials and purchases
- self-reported source mix

Blended ROAS uses that sheet plus RevenueCat LTV.
It does not claim last-click truth.

## 3. Handoff To AppsFlyer

Graduate to AppsFlyer when paid UA is in scope.

Load `appsflyer-mmp.md` for the SDK and `$appsflyerId` path.

Handoff criteria:

- paid UA lane is `in_progress` or `done`
- more than one paid network is live
- SKAN or privacy windows hide network results
- the founder needs `$appsflyerId` on RevenueCat

Until the paid-UA lane is spend-ready, network SDK plus RevenueCat plus this sheet can stay in place.
The spend-ready gate lives in `check:paid-ua`.

## 4. Outputs

- HDYHAU section in `analytics/ANALYTICS.md`
- daily rows in `growth/paid-ua-report.csv`
- founder decision to stay on this path or move to AppsFlyer

## 5. Common Failure Modes

- Survey only on the last screen
- Fixed option order that favors the first row
- Single-select only, so mixed sources disappear
- TV omitted from the visible list
- Blended sheet treated as MMP truth
