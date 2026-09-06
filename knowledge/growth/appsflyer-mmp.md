# AppsFlyer MMP

Use this when paid user acquisition is in scope.
AppsFlyer is the default mobile measurement partner.
A founder MMP waiver is required for any other stack.

RevenueCat stays subscription truth.
AppsFlyer stays install and campaign attribution.
Load `paid-user-acquisition.md` for channel, creative, and kill rules.
Load `hdyhau-blended-roas.md` until this MMP path is spend-ready.

Docs:

- RevenueCat AppsFlyer integration: `https://www.revenuecat.com/docs/integrations/attribution/appsflyer`
- AppsFlyer iOS SDK: `https://dev.appsflyer.com/hc/docs/ios-sdk`

## Contents

- 1. Spend-Ready Path
- 2. RevenueCat Bridge
- 3. Event Map
- 4. Waiver
- 5. Outputs
- 6. Common Failure Modes

## 1. Spend-Ready Path

Finish this path before the first paid dollar.

1. Install the AppsFlyer SDK for iOS or Expo.
2. Initialize AppsFlyer before RevenueCat configure.
3. Request ATT after the first value moment, not on first launch only.
4. Set `$appsflyerId` on the RevenueCat customer before trial or purchase.
5. Enable the RevenueCat AppsFlyer integration in the dashboard.
6. Prove install, app_open, and subscribe in the AppsFlyer sandbox.

`check:paid-ua` reads this path when the paid-UA lane is `in_progress` or `done`.

Record the path in `growth/PAID_UA.md` under MMP Before Spend.

## 2. RevenueCat Bridge

Call `Purchases.setAttributes` with `$appsflyerId` before a trial starts.

Also send `$idfa`, `$idfv`, `$gpsAdId`, and `$ip` when the platform allows them.

Server-to-server renewals then reach AppsFlyer without an app open.

Do not treat a network SDK plus a spreadsheet as spend-ready.
That stack needs a founder MMP waiver.

## 3. Event Map

Map these events before spend:

| B2C App Builder event | AppsFlyer event          | Owner          |
| --------------------- | ------------------------ | -------------- |
| install               | install                  | AppsFlyer SDK  |
| app_open              | af_app_opened            | AppsFlyer SDK  |
| trial start           | subscribe or start_trial | RevenueCat S2S |
| purchase              | subscribe                | RevenueCat S2S |
| renewal               | subscribe                | RevenueCat S2S |

Keep RevenueCat Experiments on offerings.
Do not move price tests into AppsFlyer.

## 4. Waiver

A founder may waive AppsFlyer for a named replacement stack.

Write a Founder MMP Waiver table in `growth/PAID_UA.md`.
Record date, founder identity, replacement stack, and approval state.

Approval state must be `approved` or `granted`.
Pending or unapproved text does not bypass AppsFlyer.
Prose such as `Founder MMP waiver: pending founder approval` is not a grant.

The founder cell must name a founder or owner.
It must not name an agent.
The date must be a past ISO date.
The stack must be a named replacement.

An empty waiver fails closed.

## 5. Outputs

- MMP Before Spend notes in `growth/PAID_UA.md`
- `$appsflyerId` bridge evidence, or a dated founder MMP waiver table
- sandbox event proof in `operations/PROVIDER_PROOF.md` when the lane is done

## 6. Common Failure Modes

- First spend with only a network SDK and a sheet
- `$appsflyerId` set after the first purchase
- ATT prompt on first launch with no value
- Price tests run in AppsFlyer instead of RevenueCat Experiments
- Empty founder MMP waiver
- Unstructured founder MMP waiver prose
- Pending or unapproved founder MMP waiver state
