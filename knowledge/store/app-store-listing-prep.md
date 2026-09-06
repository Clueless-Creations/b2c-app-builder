# App Store Listing Preparation

Part of the [ASO And Store Operations](./aso-store-ops.md) hub — it decides which store lane runs and what evidence each lane must leave behind.

Use this before preparing Apple App Store listing fields, App Privacy answers, subscription/IAP pricing, App Store Connect screenshots/previews, In-App Events, custom product pages, promotional pages, localization, Apple Search Ads routing, or App Store marketing assets.

This is the bridge between marketing and engineering. The listing packet must be persuasive, policy-aligned, tied to real App Store Connect state, and synchronized with RevenueCat, Stripe/web funnels, analytics, legal pages, screenshots, and the product build.

Load [`eleven-star-experience.md`](../experience/eleven-star-experience.md) before screenshot, app-preview, ad, custom product page, or In-App Event concepts are locked. Store marketing should show the complete product experience truthfully instead of inventing a different promise for the listing.

## Contents

- Current Sources To Refresh
- Required Outputs
- Listing Packet Shape
- Interactive App Privacy Worksheet
- Pricing, RevenueCat, And Web Funnel Alignment
- ASO, In-App Events, Custom Product Pages, And Localization
- Visual And Asset Rules
- Automation Boundaries
- Done Definition

## Current Sources To Refresh

Refresh official docs before final packets or commands:

- App information: `https://developer.apple.com/help/app-store-connect/reference/app-information/`
- Platform version information: `https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/`
- Manage App Privacy: `https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/`
- App Privacy Details: `https://developer.apple.com/app-store/app-privacy-details/`
- Privacy manifest files: `https://developer.apple.com/documentation/bundleresources/privacy-manifest-files`
- Adding a privacy manifest: `https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk`
- Describing data use in privacy manifests: `https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests`
- Describing use of required reason API: `https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api`
- Third-party SDK requirements: `https://developer.apple.com/support/third-party-SDK-requirements/`
- Protected resources: `https://developer.apple.com/documentation/bundleresources/protected-resources`
- App Tracking Transparency purpose string: `https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSUserTrackingUsageDescription`
- Upload builds: `https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/`
- Configure custom product pages: `https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions`
- Offer In-App Events: `https://developer.apple.com/help/app-store-connect/offer-in-app-events/offer-in-app-events`
- Configure In-App Purchase settings: `https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases`
- Set IAP pricing: `https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/`
- Upload screenshots and previews: `https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/`
- Localize app information: `https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information/`
- App Store localizations: `https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/`
- Product page guidance: `https://developer.apple.com/app-store/product-page`
- App Review Guidelines: `https://developer.apple.com/app-store/review/guidelines/`
- ParthJadhav App Store screenshots skill: `https://github.com/ParthJadhav/app-store-screenshots`

Also inspect the ASO skill set when available:

- Eronred ASO skills: `https://github.com/Eronred/aso-skills`
- Eronred ASO skill directory: `https://github.com/Eronred/aso-skills/tree/main/skills`
- Local vendored copy, when present: `skills/vendor/aso-skills/skills/*`
- Installed local skills such as `ios-screenshots`, `finding-app-niches`, `analyzing-competitors`, and `researching-paywalls`

Record source URLs and checked dates in `APP_STORE_LISTING.md`, `store/STORE_CONSOLE.md`, and `state/business-state.json.providers.app_store_connect.docsCheckedAt`.
Record Apple privacy/build source URLs and checked dates in `store/APPLE_APP_STORE_REQUIREMENTS.md` before any App Store Connect upload-readiness claim.

For Parth editor selection, migrations and Eronred screenshot strategy, load
[`screenshot-toolchain.md`](./screenshot-toolchain.md). It separates raw capture,
preview testing, composition, export and upload evidence. The reviewed Eronred
revision does not include `skills/ios-screenshots/SKILL.md`; any installed skill
with that name needs its own source identity. Do not infer provider access from
an upstream skill name or introduce a competing app-context artifact.

## Required Outputs

For iOS store submission or marketing prep, produce:

- `APP_STORE_LISTING.md`: canonical Apple listing, privacy, pricing, localization, custom product page, In-App Event, screenshot, and approval packet.
- `store/APPLE_APP_STORE_REQUIREMENTS.md`: pre-ASC upload gate covering privacy manifest files, required reason APIs, third-party SDK manifests/signatures, Xcode privacy report, App Privacy labels, purpose strings, ATT, account deletion, review notes, and archive/upload warnings.
- `app-store-listing.html`: founder-facing copy-paste view with ASC click paths, field limits, character counts, and status badges.
- `app-privacy-questionnaire.html`: interactive local worksheet for Apple App Privacy data types, linked/tracking/purpose answers, vendors, and proof.
- `store/STORE_CONSOLE.md` and `store/store-console.html`: manual console packet across App Store Connect and Play Console when relevant.
- `revenue/REVENUE_OPS.md`: product, entitlement, offering, price, trial, intro offer, RevenueCat/Stripe/web funnel mapping, and sandbox proof.
- `SCREENSHOTS.md`: slot-by-slot screenshot/app-preview plan, ParthJadhav/app-store-screenshots export route when used, iPhone/iPad device-well matrix, and ASC CLI upload proof.
- `SCREENSHOT_RUBRIC.md`: the grading rubric and separate-pass grader protocol behind `grade-screenshots.ts` and `check:store-screenshots`. Seed it from [`business/store/app-store-listing/SCREENSHOT_RUBRIC.md`](../../examples/workspace/business/store/app-store-listing/SCREENSHOT_RUBRIC.md) next to `SCREENSHOTS.md` so the grader agent scores against the same dimensions the validator enforces.

Small projects may merge the listing packet into `store/STORE_CONSOLE.md`, but keep the App Privacy questionnaire and HTML copy-paste surface when privacy, subscriptions, localization, screenshots, or custom product pages are in scope.

## Listing Packet Shape

Start with a compact App Store page map:

```text
Page: Apps > <App> > App Store > iOS App <Version>
Field: Promotional Text
Limit: 170 characters
Paste value: <exact text>
Source: ASO keyword map, launch strategy, or founder approval
Policy check: no unsupported health/finance/earnings/urgency/superiority claim
Automation: asc metadata dry-run path or manual only
Status: ready | blocked | founder approval needed | verified in console
```

Before filling in any pasted field above — promotional text, description, keyword terms, or What's New copy — load `knowledge/words/no-slop-writing.md`; its §7 covers the App Store title/subtitle/keyword character and byte limits specifically, and the description body should read in the business's `strategy/BRAND.md` voice, not generic ASO copy.

Cover at minimum:

- app information: name, subtitle, category, age rating, privacy policy URL, privacy choices URL, license/EULA, content rights, support URL, marketing URL
- version page: promotional text, description, keyword field, screenshots, app previews, build, review notes, demo account, version release option
- App Privacy: data collection yes/no, data types, linked to user, tracking, purposes, optional-disclosure rationale, third-party partner inventory, privacy manifest/required reason APIs
- Apple pre-ASC requirements: `PrivacyInfo.xcprivacy` path, `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes`, `NSPrivacyAccessedAPITypeReasons`, `NSPrivacyTracking`, `NSPrivacyTrackingDomains`, third-party SDK manifest/signature status, Xcode privacy report, `Info.plist` purpose strings, `NSUserTrackingUsageDescription`, account deletion, review notes, and archive/upload warnings
- pricing and IAP/subscriptions: app price/free status, subscription group, product IDs, display names, descriptions, pricing, intro offers/trials, review screenshots, App Store Server Notifications, RevenueCat mapping
- marketing surfaces: In-App Events, custom product pages, Apple Search Ads/CPP mapping, featuring nominations or App Store promotional surfaces when applicable
- localization: target locales, localized metadata, localized keywords, screenshot/app preview localization, support/privacy URL localization

## Interactive App Privacy Worksheet

Do not answer App Privacy from policy prose alone. Use actual data flows:

- code and SDK inventory
- `analytics/ANALYTICS.md`, PostHog/event catalog, session replay/survey posture, and attribution plan
- `revenue/REVENUE_OPS.md`, RevenueCat, Stripe/web billing, Apple/Google purchase identifiers
- backend schema, storage buckets, logs, AI providers, email/support tools, push notifications, ads/MMPs
- public privacy/terms/account deletion pages

The worksheet should ask:

- Does the app or any third-party partner collect data from the app?
- Which Apple data types apply: contact info, health/fitness, financial info, location, sensitive info, contacts, user content, browsing/search history, identifiers, purchases, usage data, diagnostics, surroundings/body, other data?
- For each selected data type: source/vendor, purpose, linked to user, used for tracking, required/optional, retention, deletion path, privacy-policy section, and proof.
- Does any data meet Apple's optional-disclosure criteria? If yes, record every criterion and why it applies.
- Are any SDK privacy manifests, required reason APIs, or third-party SDK signatures relevant?
- Does `store/APPLE_APP_STORE_REQUIREMENTS.md` reconcile the Xcode privacy report, public App Privacy answers, privacy policy/choices URLs, SDK inventory, and actual bundled `PrivacyInfo.xcprivacy` before ASC upload?

Use `business/store/app-store-listing/app-privacy-questionnaire.html` as the local interactive worksheet or render an equivalent project-specific HTML page.

## Pricing, RevenueCat, And Web Funnel Alignment

Load `revenue-monetization.md` before pricing or product mutations. The App Store listing cannot be launch-ready unless pricing and entitlement truth line up across:

- App Store Connect products/subscriptions
- RevenueCat products, entitlements, offerings, packages, web billing, web purchase links, or redemption links
- Stripe products/prices/customer portal/webhooks when web billing is used
- in-app paywall copy and restore purchases
- web funnel and landing page pricing
- terms, privacy, refund/cancellation language, screenshots, and review notes
- analytics events and revenue dimensions

Founder approval is required before creating live products, changing prices, changing trials/intro offers, publishing purchase links, submitting IAP/subscriptions for review, or enabling external purchase calls to action.

For every product, record:

- ASC product ID and type
- subscription group and rank
- RevenueCat entitlement/offering/package
- price, base country/region, storefront availability, trial/intro/promotional/offer-code posture
- web funnel/Stripe mapping, if any
- review screenshot/notes and sandbox proof
- whether product is attached to the app version/submission where required

## ASO, In-App Events, Custom Product Pages, And Localization

Use ASO skills or equivalent frameworks for:

- `aso-router` and `app-marketing-context`: dispatch ASO specialist lanes and create shared app/category/audience context
- `market-pulse`, `market-movers`, `category-positioning`, `competitor-analysis`, and `competitor-tracking`: market/category context, chart movement, competitor positioning, and watchlists
- `keyword-research`, `metadata-optimization`, `seasonal-aso`, `localization`, and `android-aso`: title/name, subtitle, keyword fields, Play Store descriptions, seasonal timing, country-specific keywords, and localized screenshots
- `screenshot-optimization`, `ios-screenshots`, `app-icon-optimization`, `app-preview-video`, and `ab-test-store-listing`: screenshot story, iPhone/iPad export wells, App Icon variants, App Preview scripts, PPO tests, and creative conversion strategy
- `custom-product-pages`, `in-app-events`, `app-store-featured`, and `app-clips`: Apple marketing surfaces beyond the default page
- `apple-search-ads`, `ua-campaign`, `attribution-setup`, and `web-to-app-funnel`: paid traffic, CPP routing, MMP/SKAN/deep-link setup, and web-to-app conversion paths
- `monetization-strategy`, `paywall-optimization`, and `subscription-lifecycle`: price/trial/paywall/lifecycle consistency across listing, RevenueCat, Stripe/web funnel, and screenshots
- `onboarding-optimization`, `retention-optimization`, and `referral-program`: activation, retention, and viral loops that should shape screenshots, previews, and store claims
- `review-management`, `rating-prompt-strategy`, `crash-analytics`, and `app-rejection-recovery`: quality signals, review loops, stability, and rejection response
- `app-analytics` and `asc-metrics`: first-party App Store Connect metrics, dashboards, and post-launch experiment readouts
- `app-launch`, `creator-ugc-marketing`, and `press-and-pr`: launch calendar, creator/UGC angles, and press kit consistency

When the Rork App Store Connect CLI skill pack is available, map App Store work to exact ASC routes:

| Listing task                    | ASC skill route                                                           | Proof to record                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ID resolution                   | `asc-id-resolver`                                                         | app ID, version ID, app-info ID, localization IDs                                   |
| Metadata pull/edit/apply        | `asc-metadata-sync`                                                       | `metadata/` JSON path, validate output, dry-run output                              |
| Listing localization            | `asc-localize-metadata`                                                   | locale list, translated metadata, keyword adaptation, field-limit validation        |
| ASO audit                       | `asc-aso-audit`                                                           | offline metadata findings and keyword gap notes                                     |
| Screenshot dimensions/resize    | `asc-screenshot-resize`                                                   | `asc screenshots sizes`, alpha/color-space check, validation output                 |
| Screenshot capture/frame/upload | `asc-shots-pipeline`                                                      | capture plan, raw/framed dirs, version-localization ID, upload dry-run/apply status |
| Subscription/IAP localization   | `asc-subscription-localization`                                           | product IDs, locale coverage, display-name/description status                       |
| Pricing and PPP                 | `asc-ppp-pricing`                                                         | base territory, price summary, CSV/import dry-run, founder approval                 |
| RevenueCat reconciliation       | `asc-revenuecat-catalog-sync`                                             | ASC product IDs mapped to RevenueCat products, entitlements, offerings, packages    |
| Release notes                   | `asc-whats-new-writer`                                                    | primary and localized What's New copy tied to release changes                       |
| Submission readiness            | `asc-submission-health` and `asc-release-flow`                            | `asc validate`, IAP/subscription validation, App Privacy advisory, review status    |
| TestFlight and beta feedback    | `asc-testflight-orchestration`, `asc-build-lifecycle`, `asc-crash-triage` | groups/testers/build state, crashes, feedback, diagnostics                          |

Refresh the upstream skill pack and `asc --help` before copying command syntax into launch artifacts. If a new upstream ASC skill appears, add it to `source-registry.yaml`, update this route map when relevant, and add LaunchBench coverage if it closes a known gap.

App creation is in scope for the ASC route. If the app record does not exist, load `apple-signing-release.md` and `app-store-connect-cli.md`, produce the sticky-field preflight, and then use the current ASC CLI/skill-pack path after founder approval. Do not replace this with a manual-only handoff unless ASC auth, agreements, account role, or the refreshed CLI/skill docs show an explicit blocker.

For custom product pages:

- Do not create variants without a traffic source or measurement reason.
- Map each page to audience, promise, keywords, screenshots/app preview, deep link, campaign/UTM, and App Analytics metrics.
- Confirm whether the app is eligible/currently live enough for CPP creation.

For In-App Events:

- Only plan events with real in-app content, a working deep link, schedule, localized copy, and media that matches Apple specs.
- Record if an IAP is required for participation.

For localization:

- **Research demand before you localize.** Load [`localization-market-research.md`](../research/localization-market-research.md) and produce `LOCALIZATION_MARKET_RESEARCH.md` first: rank markets into priority tiers (Tier 1 full localize / Tier 2 metadata-only / Tier 3 defer) from per-storefront keyword popularity, difficulty, and demand. Do not translate into many languages and hope — localize based on search demand. The locale list below comes _from_ that matrix, not from the set of available languages.
- Prioritize locales from market evidence: downloads/revenue potential, competitors, AppKittie/App Store data, support capacity, and keyword opportunity.
- Localize metadata and screenshots together. Do not ship translated keywords with English-only screenshots unless intentionally documented as a Tier 2 decision in `LOCALIZATION_MARKET_RESEARCH.md`.
- Use native in-language search terms, not literal translations of the English keyword set.
- Add proofreading/cultural QA before upload.

**Anti-pattern 7 (from the monetization-and-growth digest in [`revenue-monetization.md`](../money/revenue-monetization.md) §3) — ship English-only and treat localization as optional translation busywork.** "English is universal" leaves money on the table where the app is already trending. Per the **RevenueCat State of Subscription Apps 2026** report, localization is among the highest-leverage conversion levers, and it is _paywall/offer adaptation_, not just word-for-word translation: a Japan-adapted paywall (long-scroll, social proof, clear Free-vs-Pro) beat a ported US layout by **over 20%**, and anchoring the yearly plan to its monthly equivalent in parts of Latin America lifted trial starts **~30%** with a **~10%** yearly take-rate gain. Day-35 conversion also varies widely by region (~2.6% North America, ~2% Western Europe, ~1.4% IN/SEA), so one English paywall under-serves whole markets. Do not stop at translating metadata: adapt paywall layout, plan anchoring, and offers per priority market, and localize the paywall — not only the store listing — for the markets where the product is gaining traction.

## Visual And Asset Rules

**The app preview video is the most underused growth lever on the App Store — treat it as a first-class, required iOS asset, not an afterthought.** (This is anti-pattern 12 in the monetization-and-growth digest in [`revenue-monetization.md`](../money/revenue-monetization.md) §3: skipping the preview because recording, captioning, and exporting "feels like a real project." The autoplay-muted hook before the screenshots is a free 5-second pitch handed to you by Apple and a meaningful install-rate lift; skipping it because it takes effort is exactly the trap.) Verified Apple behavior (refresh against `source-registry.yaml` before upload): you can upload **up to 3 app previews** per device size and language, **app previews always precede screenshots** at the top of the product page, and on the product page **app previews autoplay with muted audio** ("make sure the first few seconds of your video are visually compelling"). So the first preview is a silent ~3–5 second hook the user watches whether they meant to or not, with a **poster frame** that must sell on its own when autoplay is blocked. The hook must show the defining product moment first (no logo/splash), communicate value with on-screen text (no audio dependency), land the Emotional North Star feeling, and be truthful (real app footage, no bait-and-switch). Both screenshots and the preview are produced through the screenshot ASO skill and the `app-preview-video` skill, and every asset is engineered from the **Asset Knowledge Brief** in `SCREENSHOTS.md` (`strategy/RESEARCH.md` user/problem, `11_STAR_EXPERIENCE.md` magical moment, `EMOTIONAL_DESIGN.md` + `experience-cards.md` emotion/card, `DESIGN.md`/`strategy/BRAND.md` tokens/voice) — never generic. This is auditable: `check-store-screenshots` and the `SCREENSHOTS.md` packet flag a missing or generic, knowledge-free hook for both new and existing apps.

Screenshots and previews should start from real app UI. When marketing compositions need more than raw screenshots:

- use `DESIGN.md` for tokens, typography, voice, screen specs, and asset constraints
- use `11_STAR_EXPERIENCE.md` for the magical moment and line of feasibility so screenshots and ads do not overpromise
- load [`design-visual-system.md`](../design/design-visual-system.md) for the screenshot-frame HTML-proof contract and Higgsfield production routing, and run composed frames through its [`quality-lens.md`](../design/quality-lens.md) Anti-Generic Checks before calling a screenshot deck done — a technically correct, on-brand screenshot can still read as generic
- use the in-app iOS Simulator (rung 0, Claude Code Desktop pane or Codex `build-ios-apps`) for real iOS captures on a local Mac; record device, OS, locale, fixture account, and native capture dimensions, and copy files off the Desktop into `screenshots/raw/`
- use MobAI for real iOS/Android captures when Android or a repeatable capture matrix is in scope; use XcodeBuildMCP for scripted/CI capture and record project/scheme/simulator/device/output paths in `engineering/PRODUCTION_READINESS.md`
- use serve-sim for browser-visible booted-simulator capture/control when CLI users need a URL; record URL/port, actions, logs, and limitations
- use SnapshotPreviews for preview/component PNG/JSON evidence via `TEST_RUNNER_SNAPSHOTS_EXPORT_DIR`; keep it labeled preview-only, not runtime App Preview footage
- use ParthJadhav/app-store-screenshots as the preferred local composition/export editor when App Store or Play Store screenshot decks need production layouts, locale/device/theme variants, or bulk PNG export from real app captures plus design-system copy
- create `SCREENSHOTS.md` before calling screenshots done; it must separate raw capture paths from production compositions and final upload files
- produce final screenshot artwork for every required supported iPhone and iPad well, not just raw device captures, with readable headline/copy overlay, device frame or intentional frameless layout, dimensions, alpha/color-space validation, thumbnail QA, and visual proof
- create or update a screenshot composition/export board such as `screenshots/index.html` when composing final stills locally
- route App Icon production through `app-icon-optimization` or equivalent, testing the 1024x1024 icon at App Store search thumbnail size with no alpha and no rounded corners
- route App Preview or Play promo video through `app-preview-video`, MobAI/native iOS recording proof, and Remotion/Higgsfield/owned-media production rules when video is in scope
  - **App Preview / Play promo video resolutions:** use the `mcp__claude_ai_Higgsfield__reframe` MCP tool (see the **Master → All Platforms (reframe + personal_clipper)** recipe in `tool-recipes/visual-and-motion-production.md`) to produce all required Apple and Play resolution variants (9:16, 1:1, 16:9) from a single master. Source footage MUST be real app screen recordings — reframe is for aspect-ratio reformatting only, never for generating substitute UI. Confirm exact invocation via the `higgsfield-generate` skill or MCP tool help before running. Spend-confirm before invoking reframe; record all output URLs and source job IDs in `CONTENT_ASSETS.md`.
  - **Preview-video B-roll:** supporting motion around real app footage may use the newest Seedance (2.5 at last check — confirm the exact model id via the `higgsfield-generate` skill), or Cinema Studio Video 3.0 — confirm its model id the same way; B-roll must never replace or obscure the real UI layer. See `tool-recipes/visual-and-motion-production.md` for syntax; confirm model availability via `higgsfield-generate` skill before use.
- **Google Play feature graphic:** route via `higgsfield product-photoshoot --mode hero_banner` (DESIGN.md brief required; real app UI or product imagery as input) for the 1024×500 Play Console feature graphic slot. Record in `CONTENT_ASSETS.md`; founder approval before upload.
- **CPP background art / seasonal refresh:** for Custom Product Page supporting background art, use the `higgsfield product-photoshoot --mode restyle` path. See the **Seasonal restyle Refresh** recipe in `tool-recipes/visual-and-motion-production.md` for the full flow (load locked CPP background, spend confirm, restyle with seasonal context + DESIGN.md palette, 2–3 variants status:draft, CONTENT_ASSETS.md, founder approval before CPP upload). The real-UI screenshot layer is never passed to restyle.
- use Higgsfield for high-quality supporting visuals, mascots, backgrounds, icons, thumbnails, CPP/event artwork, and campaign imagery when the asset is not just a screenshot
- use Remotion after `remotion-content-assets.md` when screenshots, previews, CPP/event media, or social/store variants should be code-rendered from real app UI, brand tokens, copy, captions, and local media
- keep generated assets consistent with the design system and label reference art separately from production upload files
- verify generated or rendered marketing assets do not imply unsupported features, endorsements, offers, medical/financial outcomes, urgency, or unavailable UI
- record route, source inputs, license status, render proof, output paths, and founder approval gates in `CONTENT_ASSETS.md` when Higgsfield, Remotion, or edited media are used

## Automation Boundaries

Use `app-store-connect-cli.md` for read/dry-run/apply routing. The CLI may reduce manual work for app creation, metadata, screenshots, localizations, TestFlight, products, and subscription catalog sync, but `APP_STORE_LISTING.md` and `app-store-listing.html` still need manual click paths and copyable fields.

Safe without new approval when credentials are already configured and the user asked for ASC work:

- read ASC state, resolve IDs, export metadata, run validators/doctors, plan screenshots, and dry-run changes

Founder approval required:

- app creation, metadata apply, screenshot upload/replace, pricing/product/subscription changes, custom product page submission, In-App Event submission, TestFlight external distribution, final submit/release, and any public campaign launch

## Done Definition

Do not call the App Store listing ready unless:

- current Apple docs were refreshed and cited in the packet
- `store/APPLE_APP_STORE_REQUIREMENTS.md` exists and passes `npm run check:apple-requirements -- --root .`
- `APP_STORE_LISTING.md` exists as a file artifact (not just inline chat copy) and `npm run check:store-console -- --root .` passes
- keyword field is backed by AppKittie `batch_keyword_difficulty` or `get_keyword_difficulty` evidence with difficulty scores, volumes, and selection rationale recorded; if AppKittie is unavailable the paid-tool-routing decision and fallback are recorded in `strategy/TOOL_DECISIONS.md` before proceeding
- description field is ≥ 2500 characters of keyword-rich body copy, secondary benefit paragraphs, and social proof, or a founder-approved brevity rationale is recorded; descriptions < 2500 chars without a rationale are a conversion gap and must not be called ready
- live ASC metadata was read via `asc metadata pull` (or the asc-metadata-sync read route) before any metadata audit or diff; build log files must not be used as the authoritative current App Store Connect state
- `PrivacyInfo.xcprivacy` is present in the app target resources before a ready/upload claim
- required reason API declarations, third-party SDK privacy manifests/signatures, Xcode privacy report, protected-resource purpose strings, ATT, App Privacy labels, account deletion, review notes, and archive/upload warnings are reconciled before App Store Connect upload
- the App Review Information Notes packet is written (purpose+audience, setup/access instructions, demo credentials OR an explicit no-login "no account, no demo needed" confirmation with the demo-account-required flag cleared, test devices+OS, external services, regional differences, regulated-material proof) — empty notes or a missing no-login confirmation cause a Guideline 2.1 "Information Needed" rejection (failure card: `asc-review-information-missing`)
- every **promoted** in-app purchase/subscription has a unique 1024×1024 promotional image that depicts that specific product — never the app icon and never a duplicate across products — or the promotional image is removed for products that will not be promoted (failure card: `asc-promoted-iap-image-duplicate`; Guideline 2.3.2). Produce each image via `higgsfield generate create gpt_image_2 --aspect_ratio 1:1` with a per-product DESIGN.md brief (palette, product name, key benefit, banned aesthetics, intended surface: promoted-IAP). Spend-confirm before generating; record each output in `CONTENT_ASSETS.md` with `prompt_brief` and approval gate. Cross-ref `app-store-connect-cli.md` for the ASC upload route and `revenue-monetization.md` for product/entitlement source of truth. See the **Cheap-First Direction** recipe in `tool-recipes/visual-and-motion-production.md` as a spend-reduction option at the spend-confirmation prompt.
- listing copy (promotional text, description, keywords, What's New notes) passes the `no-slop-writing.md` self-check (§6) in the business's `strategy/BRAND.md` voice before the packet is called ready
- default listing fields are paste-ready with character/byte counts
- App Privacy answers are derived from real data inventory and third-party partners
- pricing/subscriptions/products match RevenueCat/Stripe/web funnel/paywall/legal copy
- screenshots/previews have real app UI, final dimensions, locale/device targets, and upload status
- `SCREENSHOTS.md` proves raw captures, composed production assets, iPhone/iPad device wells, App Icon/App Preview route, visual QA, and `check-store-screenshots` status
- custom product pages, In-App Events, and ASA/marketing routing are either planned with proof or explicitly not needed
- localization strategy is documented with target markets and proof status
- Higgsfield, Remotion, or generated assets are tied to `DESIGN.md`, recorded in `CONTENT_ASSETS.md` when used, and separated from raw UI proof
- store screenshots, previews, CPPs, and ads express the complete product experience from `11_STAR_EXPERIENCE.md` without crossing the line of feasibility
- `store/STORE_CONSOLE.md` and HTML packet show what the founder must click, paste, approve, or leave blocked
