# {{APP_NAME}} App Store Listing Packet

Docs refreshed: Pending
ASC app ID: Pending
Bundle ID: {{IOS_BUNDLE_ID}}
Primary locale: en-US
Status: partial

This packet is the Apple listing source of truth. It connects ASO, App Store Connect fields, App Privacy, pricing, RevenueCat, web funnels, screenshots, localization, marketing surfaces, and the V1 scalable slice from `11_STAR_EXPERIENCE.md`.

## Source Ledger

| Source | Checked at | Decision affected | Notes |
| --- | --- | --- | --- |
| Apple App information docs | Pending | name, subtitle, privacy URL | Refresh before final paste |
| Apple Platform version docs | Pending | promo text, description, keywords, review notes | Refresh before final paste |
| Apple App Privacy docs | Pending | privacy questionnaire | Refresh before final paste |
| Apple privacy manifest docs | Pending | `store/APPLE_APP_STORE_REQUIREMENTS.md`, `PrivacyInfo.xcprivacy`, required reason APIs, SDK manifests/signatures, Xcode privacy report | Refresh before ASC upload readiness |
| Apple protected resources and ATT docs | Pending | `Info.plist` purpose strings, `NSUserTrackingUsageDescription`, permission fallback route | Refresh before ASC upload readiness |
| Apple upload builds docs | Pending | archive/upload delivery warnings and processing status | Refresh before upload |
| Apple IAP/pricing docs | Pending | products, prices, trials | Refresh before final paste |
| ASO research | Pending | keywords, metadata, screenshots | AppKittie/ASO skill/App Store evidence |
| RevenueCat/Stripe docs | Pending | entitlement and web funnel | Refresh before final pricing |
| Rork ASC CLI skills | Pending | metadata sync, localization, screenshots, pricing, release validation | Refresh before CLI guidance |
| 11-star experience | Pending | screenshot story, preview hook, CPP/event promise | `11_STAR_EXPERIENCE.md` |
| ParthJadhav/app-store-screenshots | Pending | local screenshot composition/export board, locale decks, iPhone/iPad/Play PNG output | Refresh before using the external skill |
| Screenshot packet | Pending | iPhone/iPad wells, App Icon, App Preview, copy overlay, final upload paths | `SCREENSHOTS.md` |

## ASC CLI Route And IDs

| Surface | ASC route | Current ID/path | Dry-run proof | Apply/upload status | Founder gate |
| --- | --- | --- | --- | --- | --- |
| App IDs | `asc-id-resolver` | app/app-info/version/localization IDs pending | Pending | read-only | no mutation |
| App creation | `app-store-connect-cli.md` + `asc-app-create-ui` when needed | app record pending | preflight pending | blocked | approval before app creation |
| Metadata | `asc-metadata-sync` | `metadata/` pending | `asc metadata validate/push --dry-run` pending | blocked | approval before push |
| Localization | `asc-localize-metadata` | target locale files pending | field-limit validation pending | blocked | approval before upload |
| Screenshots | `asc-screenshot-resize` + `asc-shots-pipeline` | version-localization ID pending | sizes/validate output pending | blocked | approval before upload |
| Pricing | `asc-ppp-pricing` | base territory and import CSV pending | pricing summary/import dry-run pending | blocked | approval before price changes |
| Subscriptions | `asc-subscription-localization` + `asc-revenuecat-catalog-sync` | product/subscription IDs pending | catalog diff pending | blocked | approval before create/update |
| TestFlight | `asc-testflight-orchestration` | groups/testers/build state pending | beta distribution dry-run pending | blocked | approval before external distribution |
| Release health | `asc-submission-health` + `asc-release-flow` | build/version IDs pending | `asc validate` pending | blocked | approval before submit/release |

## Default Product Page

| ASC page | Field | Limit | Paste value | Source | Status |
| --- | --- | ---: | --- | --- | --- |
| App Information | Name | 30 chars | Pending | brand | blocked |
| App Information | Subtitle | 30 chars | Pending | ASO keyword map | blocked |
| App Information | Category | n/a | Pending | category research | blocked |
| App Information | Privacy Policy URL | URL | Pending | public legal page | blocked |
| App Information | Privacy Choices URL | URL | Pending | account/data deletion page | blocked |
| iOS App Version | Promotional Text | 170 chars | Pending | launch angle | blocked |
| iOS App Version | Description | 4000 chars | Pending | metadata optimization | blocked |
| iOS App Version | Keywords | 100 bytes | Pending | keyword research | blocked |
| iOS App Version | Support URL | URL | Pending | support page | blocked |
| iOS App Version | Marketing URL | URL | Pending | landing page | blocked |
| Review Information | Notes | 4000 bytes | Pending | reviewer path | blocked |

## App Privacy Questionnaire

Worksheet: `app-privacy-questionnaire.html`
Pre-ASC requirements packet: `store/APPLE_APP_STORE_REQUIREMENTS.md`

| Apple data type | Collected | Linked | Tracking | Purposes | Source/vendor | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| Email Address | Pending | Pending | Pending | account, support, email | auth/email provider | `trust/PRIVACY.md` |
| User ID | Pending | Pending | Pending | account, entitlement | backend/RevenueCat | `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md` |
| Purchase History | Pending | Pending | Pending | entitlement, support | Apple/RevenueCat/Stripe | `revenue/REVENUE_OPS.md` |
| Product Interaction | Pending | Pending | Pending | analytics, personalization | PostHog | `analytics/ANALYTICS.md` |
| Crash Data | Pending | Pending | Pending | diagnostics | Sentry/Apple | `engineering/PRODUCTION_READINESS.md` |

Do not publish App Privacy answers until this table matches `trust/PRIVACY.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, SDK manifests, backend schema, vendor behavior, and `store/APPLE_APP_STORE_REQUIREMENTS.md`.

## Apple Pre-ASC Requirements

| Gate | Required proof | Source | Status |
| --- | --- | --- | --- |
| Privacy manifest | `PrivacyInfo.xcprivacy` exists in app target resources and declares `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes`, `NSPrivacyAccessedAPITypeReasons`, `NSPrivacyTracking`, and `NSPrivacyTrackingDomains` as applicable | `store/APPLE_APP_STORE_REQUIREMENTS.md` | blocked |
| Required reason APIs | Code and SDK audit records every required reason API category and Apple-approved reason | `store/APPLE_APP_STORE_REQUIREMENTS.md` | blocked |
| Third-party SDKs | Apple-listed SDKs have bundled privacy manifests and SDK signatures where required | `store/APPLE_APP_STORE_REQUIREMENTS.md` | blocked |
| Xcode privacy report | Archive-generated privacy report is reconciled with App Privacy answers and Privacy Nutrition Labels | `store/APPLE_APP_STORE_REQUIREMENTS.md`, `app-privacy-questionnaire.html` | blocked |
| Protected resources and ATT | `Info.plist` `UsageDescription` strings, denied-permission fallbacks, `NSUserTrackingUsageDescription`, and App Tracking Transparency route are reviewed | `store/APPLE_APP_STORE_REQUIREMENTS.md` | blocked |
| Review and upload | account deletion, review notes, archive/upload proof, App Store Connect delivery warnings, and founder approval are recorded | `store/APPLE_SIGNING.md`, `store/STORE_CONSOLE.md` | blocked |

## Pricing And Revenue Matrix

| Product | ASC product ID | Type | Base territory | Price | Trial/intro | PPP/import proof | Subscription localization | RevenueCat entitlement | Offering/package | Web funnel/Stripe | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Monthly | Pending | auto-renewable subscription | USA | Pending | Pending | `asc-ppp-pricing` pending | `asc-subscription-localization` pending | `premium` | `default/monthly` | Pending | blocked |
| Annual | Pending | auto-renewable subscription | USA | Pending | Pending | `asc-ppp-pricing` pending | `asc-subscription-localization` pending | `premium` | `default/annual` | Pending | blocked |
| Lifetime | Pending | non-consumable | USA | Pending | n/a | `asc-ppp-pricing` pending | IAP localization pending | `premium` | `default/lifetime` | Pending | optional |

Founder approval required before creating live products, changing prices, changing trial or intro offers, publishing purchase links, submitting IAP/subscriptions, or enabling external purchase calls to action.

## Screenshots And App Previews

Canonical screenshot packet: `SCREENSHOTS.md`

| Slot | ASC device_type | Device well | Required/scaled decision | Screenshot count | Version localization ID | Locale | Headline | Source screen | Supporting asset | Tool | Size/alpha validation | Final path | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | current 6.9 iPhone value from `asc screenshots sizes --all` | iPhone 6.9 | required or scaled per current ASC matrix | 1-10 screenshots | Pending | en-US | Pending | onboarding/value | optional Higgsfield background or Remotion frame | in-app simulator/MobAI/native iOS raw capture plus ParthJadhav/app-store-screenshots composed final | `asc-screenshot-resize` + `asc-shots-pipeline` pending | `screenshots/final/iphone-69-slot-1.png` | blocked |
| 1 | current iPad 13 value from `asc screenshots sizes --all` | iPad 13 or 12.9 | required if iPad is supported, otherwise not needed | 1-10 screenshots | Pending | en-US | Pending | onboarding/value | design-system iPad frame | in-app simulator/MobAI/native iOS raw capture plus ParthJadhav/app-store-screenshots composed final | `asc-screenshot-resize` + `asc-shots-pipeline` pending | `screenshots/final/ipad-slot-1.png` | blocked |
| 2 | current 6.9 iPhone value from `asc screenshots sizes --all` | iPhone 6.9 | required or scaled per current ASC matrix | 1-10 screenshots | Pending | en-US | Pending | core feature | optional Higgsfield visual or Remotion frame | in-app simulator/MobAI/native iOS raw capture plus ParthJadhav/app-store-screenshots composed final | `asc-screenshot-resize` + `asc-shots-pipeline` pending | `screenshots/final/iphone-69-slot-2.png` | blocked |
| 3 | current 6.9 iPhone value from `asc screenshots sizes --all` | iPhone 6.9 | required or scaled per current ASC matrix | 1-10 screenshots | Pending | en-US | Pending | paywall/result | optional Higgsfield visual or Remotion frame | in-app simulator/MobAI/native iOS raw capture plus ParthJadhav/app-store-screenshots composed final | `asc-screenshot-resize` + `asc-shots-pipeline` pending | `screenshots/final/iphone-69-slot-3.png` | blocked |

Rules:
- Real app UI capture is the proof layer; raw screenshots are not final upload assets.
- Prefer ParthJadhav/app-store-screenshots for local production composition and bulk export when screenshot decks need copy-led iPhone/iPad/Play variants; save `app-store-screenshots.json` or the equivalent board state when used.
- Final upload candidates need production composition: headline, copy overlay, device frame or intentional frameless treatment, export target, and visual QA.
- Use current `asc screenshots sizes --all` before choosing device types; do not rely on stale dimension tables.
- Final upload candidates need alpha transparency removed, color-space checked, size validated, and associated with the correct version localization ID.
- Higgsfield may create supporting visuals, icons, backgrounds, mascots, CPP/event media, or thumbnails only when tied to `DESIGN.md`.
- Store screenshots and previews should express the V1 scalable slice from `11_STAR_EXPERIENCE.md` without crossing the line of feasibility.
- Remotion may render screenshot frames, app previews, captioned demo clips, CPP/event variants, or social/store cuts from real UI only after `CONTENT_ASSETS.md` records route approval, license status, source inputs, render proof, and output paths.
- Generated or rendered visuals must not imply unsupported features, claims, prices, or endorsements.

## App Icon And Preview Assets

| Asset | Store surface | Source | Route | Output | QA | Status |
| --- | --- | --- | --- | --- | --- | --- |
| App Icon | App Store search, product page, device install | `DESIGN.md`, category/competitor icon audit | Higgsfield, designer/founder-owned asset, or approved fallback | `app-icon/app-icon-1024.png` | no alpha, no rounded corners, thumbnail contrast, category differentiation | blocked |
| App Preview 1 | App Store search/product page | real in-app footage | in-app simulator (Cmd+R)/MobAI/native iOS recording + Remotion edit, or approved founder-deferred route | `previews/ios-preview-1.mp4` | muted readability, poster frame, in-app footage only, no unsupported CTA | blocked |
| Google Play promo | Play Store product page | real app footage or approved marketing footage | Remotion, Higgsfield, or owned media | YouTube URL pending | Play metadata compliance, captions, thumbnail | optional |

## Custom Product Pages

| Page | Audience/channel | Keyword set | Screens/previews | Deep link | Campaign | Measurement | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending | App Analytics/ASA | not needed |

Do not create a custom product page without a traffic source, measurement plan, and founder approval.

## In-App Events

| Event | Purpose/badge | Name | Short desc | Long desc | Schedule | Deep link | Media | IAP required | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending | not needed |

Only use In-App Events for real time-bound in-app content with working deep links and review-ready media.

## Localization

| Locale | Market reason | Metadata route | Keywords | Screenshots | Subscription/IAP display names | Privacy/support URLs | Reviewer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| en-US | primary | `asc-metadata-sync` pending | Pending | Pending | `asc-subscription-localization` pending | Pending | Pending | blocked |

## Approval Gates

- [ ] Official Apple docs refreshed.
- [ ] `store/APPLE_APP_STORE_REQUIREMENTS.md` passes `npm run check:apple-requirements -- --root .`.
- [ ] Rork ASC CLI skills and local `asc --help` refreshed for command syntax.
- [ ] App Privacy answers reviewed from actual data inventory.
- [ ] Screenshot and preview concepts map to `11_STAR_EXPERIENCE.md`.
- [ ] Pricing/products approved by founder.
- [ ] RevenueCat/Stripe/web funnel mapping verified.
- [ ] PPP/base-territory and subscription/IAP localization status reviewed.
- [ ] Screenshots/app previews approved and dimension-checked.
- [ ] Custom product pages and In-App Events marked ready or not needed.
- [ ] Localized metadata and screenshots reviewed for each target locale.
- [ ] `store/STORE_CONSOLE.md` and `app-store-listing.html` show exact click paths and paste values.
