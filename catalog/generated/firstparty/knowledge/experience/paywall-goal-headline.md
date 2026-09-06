# Paywall Goal Headline

Use this after the onboarding quiz collects a goal.
Use the user's selected goal as the paywall headline.
Do not invent an outcome the user did not choose.

Load `commitment-funnel.md` for first-session order.
Load `onboarding-conversion.md` for the ONB graph.
Load `../money/paywall-pricing-and-experiments.md` for RevenueCat Experiments.

## Contents

- 1. Goal Contract
- 2. Runtime Bind
- 3. Ethics
- 4. Experiment
- 5. Outputs
- 6. Common Failure Modes

## 1. Goal Contract

Record a Paywall Goal Headline table in `product/ONBOARDING.md`.

The table must name:

- goal key
- user-facing prompt
- headline template
- fallback when skipped

The quiz writes one durable key: `paywall_headline_key`.
Each goal key is a closed enum.
A skip or blank answer uses the fallback key, not a guessed goal.

The headline template may interpolate only that selected key.
Example: `lose_weight` → "Start losing weight today".
Example: `build_muscle` → "Start building muscle today".
The fallback must stay generic. Do not name a body, money, or time outcome the user did not pick.

## 2. Runtime Bind

Keep headline templates in RevenueCat Offering metadata so copy can change without an app release.

See [Offering metadata](https://www.revenuecat.com/docs/tools/offering-metadata).

At paywall present time, bind the selected key through RevenueCat Paywalls custom variables.

See [Displaying Paywalls](https://www.revenuecat.com/docs/tools/paywalls/displaying-paywalls).

Write the same key as a subscriber attribute when Experiments targeting needs it.
Call `syncAttributesAndOfferingsIfNeeded` after the quiz if targeting depends on that attribute.

The app always fetches the current Offering.

## 3. Ethics

Honest interpolation of the user's answer is required.
Do not invent a weight, muscle, money, or time result.
Do not imply a medical or guaranteed outcome.
Apple Guideline 3.1 still applies: paid service copy must match the real offer.

A skipped goal uses the fallback template.
A skipped goal must not look like a personalized result.

## 4. Experiment

Adopt this contract as the default starter.
Run it as a RevenueCat Experiment against a static headline.
Judge the test on trial-to-paid and refund rate, not day-1 paywall conversion alone.

This is the copy slice of the commitment funnel.
Do not replace the funnel.

## 5. Outputs

- Paywall Goal Headline table in `product/ONBOARDING.md`
- `paywall_headline_key` written at quiz or goals
- Offering metadata template map
- fallback headline for skip
- experiment row in `revenue/REVENUE_OPS.md`

## 6. Common Failure Modes

- Paywall headline that names an outcome the user did not choose
- Missing fallback when the quiz is skipped
- Hard-coded headline that needs an app release to change
- Treating a two-day conversion lift as proof without a refund-rate companion
