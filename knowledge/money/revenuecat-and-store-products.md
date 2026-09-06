# RevenueCat And Store Products

For the selected provider's official setup and skill procedures, use [RevenueCat agent tooling](./revenuecat-agent-tooling.md).
The provider procedure does not replace this contract or grant authority.

Part of the [Revenue, Monetization, And Purchase Funnels](./revenue-monetization.md) hub. Honor the **Founder-Only Gates** there before creating live products, changing prices, or submitting for review.

Before marking this lane done, load [`provider-proof.md`](../process/provider-proof.md): provider-backed readiness needs live proof or a recorded founder-only decision in `operations/PROVIDER_PROOF.md`, never setup prose alone.

Use this for RevenueCat project/product/entitlement/offering setup, App Store and Google Play product gates, the MISSING_METADATA/product-type/paywall-smoke-proof failure modes that have repeatedly shipped broken paywalls, and promotional IAP/subscription art.

## Contents

- 1. Official Sources To Refresh
- 2. RevenueCat Required Setup
- 3. App Store And Play Product Gates
- 3a. Subscription MISSING_METADATA, RevenueCat Product-Type, And Paywall Smoke Proof
- 3b. Promotional Image Production (IAP And Subscription Art)

## 1. Official Sources To Refresh

Refresh current docs before acting because payment and app-store rules change:

- RevenueCat product configuration: https://www.revenuecat.com/docs/projects/configuring-products
- RevenueCat store/provider connection and server notifications: https://www.revenuecat.com/docs/projects/connect-a-store
- RevenueCat State of Subscription Apps: https://www.revenuecat.com/state-of-subscription-apps/
- RevenueCat solo UA system article: https://www.revenuecat.com/blog/growth/how-to-build-a-ua-system-when-youre-a-one-person-team
- Apple App Review Guideline 3.1.1 and external purchase rules: https://developer.apple.com/app-store/review/guidelines/
- Apple App Store Connect IAP setup and pricing docs from `app-store-listing-prep.md` when App Store products or subscriptions are in scope.
- Google Play payments policy: https://support.google.com/googleplay/android-developer/answer/9858738?hl=en
- Google Play subscription lifecycle and RTDNs: https://developer.android.com/google/play/billing/lifecycle/subscriptions

Record checked dates, links, and resulting decisions in `revenue/REVENUE_OPS.md` or `LEGAL_REVIEW.md`.

## 2. RevenueCat Required Setup

Required concepts:

- Product: what a user buys, created in Test Store for development or imported from App Store Connect, Play Console, Stripe, or Paddle for production.
- Entitlement: what access the product unlocks; default to `premium` unless the product truly has multiple access tiers.
- Offering: what the paywall displays; default to `default` and read `currentOffering` in the app rather than hardcoding product IDs.

Setup:

- create RevenueCat project
- add app configurations for iOS/Android and web configuration when needed
- keep Test Store separate from production store products
- create/import products with stable identifiers and durations
- create `premium` entitlement and attach all products that unlock it
- create `default` offering and packages for monthly/annual/lifetime or approved product mix
- configure App Store Connect shared secret/IAP key/API key and Google Play service credentials when production stores are in scope
- configure platform server notifications so subscription changes reach RevenueCat promptly
- configure RevenueCat webhooks when the backend, CRM, analytics, or lifecycle emails need server-side subscription events — verify signatures and idempotency/replay protection per `security-release-hardening.md` Revenue And Entitlement Abuse before mutating entitlements from a webhook
- add SDK public API keys to the product app only through the app's environment/secrets pattern; keep secret API keys server-side only

Validation:

- fetch offerings in the app
- make a sandbox/Test Store purchase
- verify entitlement active in app, RevenueCat customer view, backend projection if one exists, and analytics events
- restore purchases on a fresh install
- test cancellation/expiration path where sandbox supports it
- verify no mock RevenueCat gateway is enabled in release builds

## 3. App Store And Play Product Gates

**CRITICAL — App container price vs IAP distinction (surface this before any store pricing work begins):**
Subscription and IAP-based apps must remain **Free** at the App Store container level (Pricing and Availability > Price: Free). The container price is the upfront download fee — setting it to $79.99 means every user pays $79.99 just to install the app before seeing the paywall. A Lifetime access offer is a **NON_CONSUMABLE** in-app purchase product created in App Store Connect > In-App Purchases, attached to the app version and mapped to a RevenueCat entitlement/offering. Never set the app container price to the lifetime price. Surface this distinction proactively at the start of any store pricing work; do not wait for the founder to make the error. If `store/STORE_CONSOLE.md` or `revenue/REVENUE_OPS.md` includes a Lifetime offer, verify a NON_CONSUMABLE IAP SKU exists before marking pricing ready.

iOS:

- set app container price to **Free** for any app that monetizes via subscriptions, IAP, or in-app paywalls
- create subscription group and products in App Store Connect
- create NON_CONSUMABLE products for any Lifetime offer; do not use the container price or a consumable/subscription for this purpose
- complete product localization, screenshot/metadata, review information, and pricing
- attach IAP/subscription products to the app version where required
- configure StoreKit testing or sandbox testers
- include restore purchases and clear subscription management/cancellation paths
- do not add external web checkout calls to action without checking current storefront eligibility and Apple rules

Android:

- create subscriptions/base plans/offers in Play Console
- configure license testers and closed/internal testing tracks
- support restore and account hold/grace-period behavior through RevenueCat or backend state
- if handling Play directly, use RTDN and Play Developer API as source of truth; with RevenueCat, confirm notifications reach RevenueCat
- review Google Play Billing and alternative billing eligibility before linking to external checkout

Gate:

- store products must match paywall copy, screenshots, app metadata, privacy/terms, RevenueCat products, and analytics event names.
- App Store listing work must produce an `APP_STORE_LISTING.md` or `store/STORE_CONSOLE.md` pricing section that ties each App Store product/subscription to RevenueCat entitlement/offering/package, web funnel/Stripe route when used, review status, sandbox proof, and founder approval.

## 3a. Subscription MISSING_METADATA, RevenueCat Product-Type, And Paywall Smoke Proof

These three gaps repeatedly shipped a broken paywall ("Purchases unavailable" / zero packages) across multiple TestFlight builds. Treat each as a hard gate before any build is called paywall-ready.

**Apple MISSING_METADATA resolution.** Every App Store subscription product needs a **subscription-group localization** (display name + description per language) before it leaves the `MISSING_METADATA` state — this is separate from app metadata. Until it clears, RevenueCat returns an empty offering. Resolve it: list products and localizations (`asc subscriptions list --app <APP_ID> --output json`, then the subscriptions localizations list/create verbs — confirm exact flags with `asc subscriptions --help`), create the missing localization, then resubmit for review (founder-approved, with `--confirm`). **Gate:** do not map a product into the RevenueCat catalog or claim paywall-ready while any product is in `MISSING_METADATA`. (Failure card: `revenuecat-missing-metadata-unresolved`.)

**RevenueCat product-type reconciliation.** The product _type inside the RevenueCat dashboard_ must match its App Store counterpart: App Store non-consumable IAP → RC `non_consumable`; App Store auto-renewable subscription → RC `auto_renewable_subscription`. A lifetime/one-time unlock mapped as RC `non_renewing_subscription` behaves like a timed unlock and can silently expire. Verify type alignment before attaching to an entitlement/offering, and use `asc-revenuecat-catalog-sync` to surface mismatches. (Failure card: `revenuecat-product-type-mismatch`. This is the RC-dashboard mapping, distinct from the App Store NON_CONSUMABLE rule in §3 above.)

**Debug-preview masking + Release smoke proof.** Debug builds often seed preview packages when RevenueCat returns nil/empty, which hides a broken _production_ paywall from developer testing. Before any TestFlight upload is marked paywall-ready, run a **Release-scheme** smoke check against sandbox — the in-app iOS Simulator (rung 0) is the fastest sufficient route for this single-screen check; use MobAI or XcodeBuildMCP when the lane already owns one — confirming `currentOffering?.packages` is non-empty, and confirm no code path seeds packages when the RC fetch is empty in the Release target. Also confirm the RevenueCat public key actually injected into the compiled binary (`plutil -p <archive>/Products/Applications/<App>.app/Info.plist | grep -i revenuecat`) — a raw `$(VAR)` placeholder means the key never expanded. (Failure cards: `revenuecat-debug-preview-masking`; key injection is covered by `apple-pre-upload-preflight-skipped`.)

## 3b. Promotional Image Production (IAP And Subscription Art)

Apple requires a **unique 1024x1024 promotional image** for each promoted IAP and subscription product. These are store-facing assets (App Store promoted IAP slots), not app UI screenshots, so Higgsfield output is eligible.

Production route:

- Write a DESIGN.md brief for each product's promotional image (palette, mood, banned aesthetics, intended surface: App Store promoted IAP).
- Generate via `higgsfield generate create gpt_image_2 --prompt "<DESIGN.md brief>" --aspect_ratio 1:1 --wait`. See the **Cheap-First Direction (z_image → production model)** recipe in `tool-recipes/visual-and-motion-production.md` if spend-reduction drafts are needed first; cheap-first must be offered as an explicit spend option, never applied silently — confirm spend per [`paid-tool-routing.md`](../operations/paid-tool-routing.md).
- Record every generated asset in `CONTENT_ASSETS.md` with `prompt_brief`, `source_job_id`, QA status, and approval gate. Cross-reference `app-store-listing-prep.md` for upload and metadata sequencing.
- Gate: founder must approve each promotional image before upload. Do not upload while the product is still in `MISSING_METADATA` (see §3a above).

**Paywall hero art:** Route paywall background/hero images through `higgsfield generate create soul_location` (the environment model; prompt-only) with a DESIGN.md brief, or `gpt_image_2` when on-image text is required. This produces environment/background art consistent with the visual system defined in `design-visual-system.md`. Record outputs in `CONTENT_ASSETS.md`; apply the same spend-confirmation and founder-approval gates. Higgsfield output must never substitute for truthful real app UI in store screenshots.
