# Subscription Price Derivation

Part of the [Revenue, Monetization, And Purchase Funnels](./revenue-monetization.md) hub. Honor the **Founder-Only Gates** there before creating live products, changing prices, or submitting for review.

Use this before deriving one subscription's territory prices from another.
Rork `asc` 4.9.0 adds experimental `asc subscriptions pricing derive`.
`--dry-run` is mandatory. A multiplier is not approval.

Load `app-store-connect-cli.md` before any `asc` command.
Load `paywall-pricing-and-experiments.md` for the price-point procedure.

## Contents

- 1. Plan Binding
- 2. Dry-Run
- 3. Comparison
- 4. Apply Boundary
- 5. Schedule Conflict
- 6. Provider Readback
- 7. Outputs
- 8. Common Failure Modes

## 1. Plan Binding

Record a Price Derivation Plan in `revenue/PRICE_DERIVATION.md`:

- source subscription
- target subscription
- multiplier
- storefront set
- effective-date intent
- subscriber-preservation policy

Use exact resource IDs. Do not guess a nearby product.

## 2. Dry-Run

Confirm `asc subscriptions pricing derive --help` first.

Run a dry-run with no provider mutation.

```text
asc subscriptions pricing derive --dry-run
```

Keep the resolved Apple price-point IDs.
Keep local customer prices.
Keep proceeds when available.
Keep rounding differences.
Keep unavailable territories as blockers.
Keep current and future schedules.

Do not choose a nearby tier for a missing price point.

## 3. Comparison

Compare the dry-run with business pricing intent.
Compare the dry-run with RevenueCat catalog state.
Record rounding differences as explicit risks.

Treat these as named risk states:

- irreversible effective decrease
- consent-sensitive increase
- preserved subscriber price
- agreement blocker

## 4. Apply Boundary

Do not infer approval from the multiplier.
Applying any price needs an exact current pricing envelope.
Applying any price needs founder confirmation.

An unauthorized run may write a plan.
An unauthorized run must not emit an apply command.

## 5. Schedule Conflict

Before apply, detect scheduled price changes.
Apple permits only one future change per storefront and billing plan type.
Warn when a derive would overwrite a scheduled change.

## 6. Provider Readback

After apply, read every affected territory from App Store Connect.
Reconcile the provider result with B2C App Builder and RevenueCat.
Stop on partial success.
Write a recovery plan.

Redact credentials, Apple Account identity, product secrets, and extra revenue data.

## 7. Outputs

- Price Derivation Plan in `revenue/PRICE_DERIVATION.md`
- dry-run receipt with price-point IDs
- founder apply envelope, or an explicit not-authorized state
- provider and RevenueCat readback, or a typed recovery task

## 8. Common Failure Modes

- Applying prices without `--dry-run`
- Treating the multiplier as founder approval
- Choosing a nearby tier for a missing territory
- Overwriting a scheduled change without a warning
- Leaving a partial apply without a recovery plan
