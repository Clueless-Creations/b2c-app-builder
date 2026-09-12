---
name: b2c-review-monetization
description: "Review a consumer app's offer, pricing proposal, paywall, purchases, entitlements, restore behavior, and billing evidence. Use for a monetization audit or explicitly requested implementation. A review does not authorize live product changes, pricing changes, payments, or provider selection."
compatibility: Markdown and supplied evidence. Provider-backed work needs the corresponding authorized tools. The B2C runtime is optional for focused advisory work.
metadata:
  source-workflow: "workflow.money.revenue-monetization"
  generated-by: b2c-catalog
---

# Review monetization

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

## Choose the scope

Use this task directly for focused advice, review, or an authorized change. Do not require setup, install software, create a workspace, or activate a full launch graph merely to use this expertise. A review is read-only unless the user also requests changes.

For an existing managed business, read business-status then business-plan and use its current brief. This skill cannot choose executable next work, bypass prerequisites, change provider bindings, or replace runtime acceptance. Do not inspect raw reducer files merely to start a focused task.

## Method

For a review, assess the existing evidence against this method and return findings; do not execute its authoring or mutation instructions. For requested creation or implementation, follow the method only within the accepted scope and authority.

Choose the smallest reliable monetization path for the current phase:

- **Pre-build validation**: waitlist, pricing page, preorder interest, or non-charging web funnel. Do not imply paid access is active.
- **Mobile-only app subscription**: App Store/Google Play products, RevenueCat products/entitlements/offerings, in-app paywall, restore purchases, sandbox testing, store submission.
- **Web-to-app acquisition**: RevenueCat Web Billing or Stripe Billing through RevenueCat Web, Web Purchase Links or Web Funnels, Redemption Links, deep-link redemption, app entitlement validation.
- **Existing Stripe web business**: Stripe Billing remains billing engine, RevenueCat imports/syncs entitlements, Stripe webhooks and customer portal stay authoritative for billing management.
- **Direct Stripe without RevenueCat**: only use when the app does not need mobile store entitlements or cross-platform entitlement sync. For digital goods unlocked inside iOS/Android apps, review Apple/Google rules first.

Default for B2C mobile subscriptions: RevenueCat owns entitlements and cross-platform subscription state. Stripe may be the web payment rail or billing engine, but a successful Stripe payment is not launch-ready until it unlocks the correct RevenueCat entitlement in the app.

## Load only what the task needs

[Task inputs, outputs, checks, and knowledge selectors](references/task.md) supplies the canonical details when they are needed. Open the specific referenced sections, not the whole library. In connected knowledge retrieval, follow exact section selectors, revision hashes, and continuation calls. Unresolved guidance remains unresolved.

## Tools and evidence

Keep the method independent of the agent host and business provider. Honor explicit selections. Use already available, authorized tools that implement the required operation; do not infer availability from the agent's name or silently substitute a provider. Load a provider's procedure only when its action is current. Record missing capabilities without inventing provider proof.

Pause for access or secrets, spend, pricing or legal decisions, destructive changes, hosted deployment, store submission, or production release. Guidance is not permission. A proposed price is not an approved price, and a mock is not live evidence.

## Return

Report findings or changes, the evidence inspected, applicable checks actually run, unresolved requirements, and the next decision. Label advisory findings separately from accepted business evidence. Do not record business completion or modify reducer-owned state outside the supported runtime.
