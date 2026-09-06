# Store Console Workflow And User Handoff

Part of the [ASO And Store Operations](./aso-store-ops.md) hub — it decides which store lane runs and what evidence each lane must leave behind.

Before marking this lane done, load [`provider-proof.md`](../process/provider-proof.md): provider-backed readiness needs live proof or a recorded founder-only decision in `operations/PROVIDER_PROOF.md`, never setup prose alone.

Use this before App Store Connect or Google Play Console setup, Apple app-record setup, store submission, privacy labels, Data safety, screenshot capture, screenshot upload, app review notes, or founder-facing store-console guidance.

The goal is to produce a console-ready packet that tells the user exactly where to click, what to paste, what still needs their approval, and what was verified.

## Contents

- Current Sources To Refresh
- Required Outputs
- Store Console Packet Shape
- App Store Connect Packet
- App Store Connect CLI Route
- Apple Signing And First Upload Route
- Google Play Packet
- Screenshot And Device Workflow
- HTML Mock Requirements
- Common Failure Modes

## Current Sources To Refresh

Refresh official docs before producing final packets because console fields, screenshot specs, and privacy requirements change:

Apple:

- Add a new app: `https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/`
- App information fields: `https://developer.apple.com/help/app-store-connect/reference/app-information`
- Platform version information: `https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/`
- Manage app privacy: `https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/`
- App privacy details: `https://developer.apple.com/app-store/app-privacy-details/`
- Privacy manifest files: `https://developer.apple.com/documentation/bundleresources/privacy-manifest-files`
- Adding a privacy manifest: `https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk`
- Describing data use in privacy manifests: `https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests`
- Required reason APIs: `https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api`
- Third-party SDK requirements: `https://developer.apple.com/support/third-party-SDK-requirements/`
- Protected resources: `https://developer.apple.com/documentation/bundleresources/protected-resources`
- App Tracking Transparency purpose string: `https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSUserTrackingUsageDescription`
- Configure In-App Purchase settings: `https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases`
- Set IAP pricing: `https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/`
- Custom product pages: `https://developer.apple.com/help/app-store-connect/create-custom-product-pages/configure-multiple-product-page-versions`
- In-App Events: `https://developer.apple.com/help/app-store-connect/offer-in-app-events/offer-in-app-events`
- Localize app information: `https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information/`
- App Store localizations: `https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations/`
- Screenshot specs: `https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications`
- Upload previews and screenshots: `https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/`
- Age rating: `https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating`
- Export compliance: `https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance`
- Privacy manifests and required reason APIs: `https://developer.apple.com/documentation/bundleresources/privacy-manifest-files`, `https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api`
- Accessibility Nutrition Labels overview: `https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/`
- Manage Accessibility Nutrition Labels: `https://developer.apple.com/help/app-store-connect/manage-app-accessibility/manage-accessibility-nutrition-labels`
- Submit an app: `https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app`
- Apple Developer Program enrollment: `https://developer.apple.com/programs/enroll/`
- Register an App ID: `https://developer.apple.com/help/account/identifiers/register-an-app-id/`
- Certificates overview: `https://developer.apple.com/help/account/certificates/certificates-overview/`
- Cloud-managed certificates: `https://developer.apple.com/help/account/certificates/cloud-managed-certificates/`
- App Store Connect provisioning profile: `https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/`
- Xcode distribution preparation: `https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution`
- Xcode beta/release distribution: `https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases`
- Upload builds: `https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/`
- Load `apple-signing-release.md` before Apple Developer enrollment, Team ID, bundle ID/App ID, signing, capabilities, certificates, provisioning profiles, archive/export/upload, TestFlight, or distribution-readiness claims.

ASC CLI:

- Rork App Store Connect CLI skills: `https://github.com/rorkai/app-store-connect-cli-skills`
- Rork App Store Connect CLI: `https://github.com/rorkai/App-Store-Connect-CLI`
- Load `app-store-connect-cli.md` before using `asc`, installing CLI skills, syncing metadata, planning/uploading screenshots, TestFlight orchestration, release validation, signing, or RevenueCat catalog sync.
- Load `app-store-listing-prep.md` before Apple listing copy, App Privacy questionnaires, pricing/subscription mapping, In-App Events, custom product pages, localization, Higgsfield-backed marketing assets, or App Store marketing surface planning.
- For selected screenshot editor setup and migration, follow [`screenshot-toolchain.md`](./screenshot-toolchain.md). Keep composition separate from raw capture, store authorization and upload readback.
- ParthJadhav App Store screenshots skill: `https://github.com/ParthJadhav/app-store-screenshots`; use it when production screenshot decks need a local editor/export system rather than one-off image edits.

Google Play:

- Create and set up app: `https://support.google.com/googleplay/android-developer/answer/9859152?hl=en`
- Prepare app for review/App content: `https://support.google.com/googleplay/android-developer/answer/9859455?hl=en`
- Data safety form: `https://support.google.com/googleplay/android-developer/answer/10787469?hl=en`
- User Data policy and account deletion: `https://support.google.com/googleplay/android-developer/answer/10144311?hl=en`, `https://support.google.com/googleplay/android-developer/answer/13327111?hl=en`
- Pre-launch reports: `https://support.google.com/googleplay/android-developer/answer/9842757?hl=en`
- Preview assets and screenshot requirements: `https://support.google.com/googleplay/android-developer/answer/9866151?hl=en`
- Metadata policy: `https://support.google.com/googleplay/android-developer/answer/9898842?hl=en`
- Target audience/content: `https://support.google.com/googleplay/android-developer/answer/9867159?hl=en`
- Content ratings: `https://support.google.com/googleplay/android-developer/answer/9898843?hl=en`

## Required Outputs

Create these when a store submission is in scope:

- `state/business-state.json`: `store_console`, `apple_signing`, privacy/legal, revenue, screenshot, and provider/tool state with active failure cards.
- `store/STORE_CONSOLE.md`: agent-readable source of truth for App Store Connect and Google Play Console fields, click paths, blockers, and evidence.
- `APP_STORE_LISTING.md`: Apple listing preparation packet covering default listing fields, App Privacy, pricing/subscriptions, RevenueCat/Stripe/web funnels, custom product pages, In-App Events, localization, screenshots/previews, and marketing strategy.
- `store/APPLE_APP_STORE_REQUIREMENTS.md`: Apple pre-ASC requirements packet covering privacy manifests, required reason API declarations, third-party SDK privacy manifests/signatures, Xcode privacy report, App Privacy labels, `Info.plist` purpose strings, ATT, account deletion, review notes, and archive/upload warnings.
- `app-store-listing.html`: founder-facing App Store listing view with copyable values, character counts, pricing/product matrix, privacy status, CPP/event plan, and approval gates.
- `app-privacy-questionnaire.html`: interactive local worksheet for Apple App Privacy answers when privacy disclosures are not already verified.
- `store/APPLE_SIGNING.md`: required for Apple distribution, TestFlight, physical-device signing, or first upload readiness; include account/team, bundle ID/App ID, app record, signing, capabilities, certificates/profiles, archive/export/upload state, and founder gates.
- `store/store-console.html`: founder-facing mock console with copy buttons or clearly copyable fields grouped by exact ASC/Play Console page.
- `SCREENSHOTS.md`: screenshot capture, ParthJadhav/app-store-screenshots composition route when used, dimensions, device targets, locale, proof constraints, upload status, and source image paths.
- `screenshots/`: final upload assets plus raw MobAI/native iOS/device captures and intermediate compositions.
- `strategy/TOOL_DECISIONS.md` or an embedded tool-decision section when ASC CLI, paid ASO tools, MobAI, Codex Desktop native iOS/XcodeBuildMCP, SnapshotPreviews, serve-sim, Higgsfield, or paid screenshot/creator tooling affects the packet.

Small launches can merge `SCREENSHOTS.md` into `store/STORE_CONSOLE.md`, but keep `store/store-console.html` as the human-facing copy-paste surface.

Each output must state the documentation refresh date. If current docs cannot be reached, mark the packet `blocked: docs refresh needed` instead of relying on old console memory.

Run `npm run check:store-console -- --root .` or the installed-skill equivalent when the packet exists and the repo uses bundled validators.

## Store Console Packet Shape

Each console field should use this format:

```text
Platform: App Store Connect
Click path: Apps > <App Name> > App Store > iOS App <Version> > App Information
Field: Subtitle
Limit: 30 characters
Paste value: <exact value>
Source: LAUNCH.md#app-store-fields
Evidence: keyword research, competitor review, or founder approval
Status: ready | blocked | founder approval needed | verified in console
Notes: any policy/risk caveat
```

For `store/store-console.html`, group fields by console page and make the user path visually obvious:

- page title matching the console page
- click path breadcrumb
- field label
- character count
- paste-ready value
- blocker/approval badge
- source doc path
- "last verified against official docs" date

Do not require the founder to infer where a field belongs from a long Markdown list.

When ASC CLI is in scope, include the CLI route beside the manual route:

```text
CLI route: asc metadata apply --app <id> --version <version> --dir ./metadata --dry-run
CLI status: dry-run ready | applied | blocked | founder approval needed
Console route: Apps > <App Name> > App Store > iOS App <Version> > ...
Founder gate: apply metadata / upload screenshots / submit for review
```

## App Store Connect Packet

### App Record

Click path:

- App Store Connect > Apps > plus button > New App

Before opening this dialog or running `asc apps create`, show the founder the app-record preflight from `apple-signing-release.md`. The founder should know exactly what will be entered and what is sticky before credentials, 2FA, or mutating CLI prompts begin.

Fields:

- Platforms: iOS, iPadOS, macOS, tvOS, visionOS, or watchOS as applicable.
- Name: app name, 2-30 characters.
- Primary language: default locale.
- Bundle ID: must match the app build.
- SKU: internal immutable ID. Use a stable slug such as `<app-slug>-ios`.
- User Access: Full Access unless a team needs Limited Access.
- Developer Name: organization accounts may set this when adding the first app; individual accounts cannot customize it.

Founder gates:

- developer account access
- final app name
- developer name/trade name
- bundle ID if not already created

Before creating the record, load `apple-signing-release.md` and confirm:

- Apple Developer Program membership and Account Holder/Admin/App Manager role are sufficient.
- latest Apple agreements are signed.
- the bundle ID is final enough to become platform identity.
- the SKU is final because it cannot be changed after the app is added.
- the Xcode target bundle identifier matches the ASC bundle ID.
- distribution signing strategy is known or explicitly blocked.
- the name-collision plan is explicit; do not silently accept CLI fallback names like `<Name> - app`.
- the founder understands whether they are using Full Access or Limited Access and why.
- `state/business-state.json` reflects app-record readiness, blockers, and founder-only gates.

### App Information

Click path:

- Apps > <App Name> > App Information

Fields:

- Name
- Subtitle, up to 30 characters
- Privacy Policy URL
- Category and secondary category
- Content Rights
- Age Rating
- License Agreement, Apple standard EULA or custom EULA
- Availability/compliance fields shown for relevant countries, DSA, China mainland, Korea, or regulated categories
- App Store Server Notifications URL when IAP/subscriptions are used

Packet should include:

- recommended answer
- exact value to paste
- whether value is editable after submission or version-gated
- source evidence or policy source

Also create `APP_STORE_LISTING.md` rows for any field that affects marketing, privacy, pricing, or discoverability. The App Information section should agree with `DESIGN.md`, `app-marketing-context.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `trust/TERMS.md`, `SCREENSHOTS.md`, and public support/privacy URLs.

### App Privacy

Click path:

- Apps > <App Name> > App Privacy

Process:

1. Enter Privacy Policy URL and optional Privacy Choices URL.
2. Start or edit app privacy responses.
3. Select every data type collected by the app or third-party partners.
4. For each data type, answer whether it is linked to the user, used for tracking, and the purposes for collection.
5. Compare the final answers against `trust/PRIVACY.md`, `analytics/ANALYTICS.md`, `growth/EMAIL_OPS.md`, `revenue/REVENUE_OPS.md`, SDK list, backend schema, and vendor docs.
6. Preview the product-page privacy label and record any mismatch before publishing responses.
7. Reconcile the answers with `store/APPLE_APP_STORE_REQUIREMENTS.md`, the bundled `PrivacyInfo.xcprivacy`, required reason API reasons, third-party SDK manifest/signature status, Xcode privacy report, `Info.plist` purpose strings, `NSUserTrackingUsageDescription`, and archive/upload warnings before upload readiness.

Packet sections:

- data type table: Apple data type, source, collected yes/no, linked yes/no, tracking yes/no, purposes, notes
- tracking decision: IDFA/ad attribution/retargeting/data broker/third-party ad SDK status
- third-party partner inventory: analytics, crash, auth, payments, email, AI, ads, backend, push, support
- optional disclosure rationale, if a data type is intentionally omitted
- privacy manifest/required reason API status from the built app
- Xcode privacy report and ASC upload/delivery-warning status when an archive has been produced

Never answer App Privacy from generic policy text alone. Use the real data inventory and SDK/vendor behavior.

Interactive worksheet:

- Use `business/store/app-store-listing/app-privacy-questionnaire.html` or a project-specific equivalent when the founder needs to review answers manually.
- The worksheet should let the founder inspect selected data types, linked/tracking/purpose answers, vendors, proof paths, and unanswered items before publishing in App Store Connect.
- Treat payment information entered through Apple, Stripe, or RevenueCat-hosted flows as collected only if the developer/app actually receives or stores it; otherwise document the payment provider and disclosure rationale.

### Version Page

Click path:

- Apps > <App Name> > App Store > iOS App <Version>

Fields:

- version number
- screenshots and app previews by device/localization
- promotional text, up to 170 characters
- description, up to 4000 characters, plain text
- keywords, up to 100 bytes, no competitor names or duplicate app/company terms
- support URL
- marketing URL, optional
- build
- app review information: contact info, demo account, notes, attachments where relevant
- version release option

Packet should show:

- exact paste values
- character/byte counts
- screenshot slots with file paths
- build number and bundle version
- review-note script for the reviewer path

ASO and marketing rules:

- Produce 2-3 metadata variants when keyword or positioning uncertainty is material, then recommend one.
- Keywords must stay within current byte limits, avoid competitor names/company names, and avoid duplicating app/company terms already indexed by Apple.
- Promotional text, screenshots, app previews, custom product pages, events, web funnel pages, and paywall copy must agree on price, trial, renewal, and feature availability.

### Pricing, Availability, IAP, And Subscriptions

Click paths vary by app setup. The packet must show:

- app price/free status and territory availability
- subscription group, products, localizations, prices, intro/trial offers, review notes, and family sharing status where applicable
- App Store Server Notification URL, shared secret/API keys where needed by RevenueCat, and sandbox tester status
- product mapping to `revenue/REVENUE_OPS.md` and RevenueCat offering/package IDs

Founder gates:

- price, trial, discount, intro offer, tax/compliance, territory, final submission

Revenue alignment:

- Load `revenue-monetization.md` before product or price changes.
- Reconcile App Store Connect products with RevenueCat entitlements/offerings/packages before applying listing or paywall copy.
- If Stripe or RevenueCat Web is used for a web funnel, record the web checkout route, redemption link/deep link, billing portal, and whether Apple rules allow any in-app mention or call to action.
- Do not mark pricing ready until App Store products, RevenueCat, web funnel, screenshots, terms, privacy, analytics, and review notes all use the same product IDs, prices, trial/intro details, and cancellation/refund posture.

### Custom Product Pages

Click path:

- Apps > <App Name> > Custom Product Pages

Packet should include:

- reference name
- audience/channel/campaign
- linked keywords or Apple Search Ads route
- screenshots, app previews, promotional text, and localization
- optional deep link and proof that it opens the right in-app content
- App Analytics measurement threshold and post-launch owner
- review/submission status

Rules:

- Do not create a custom product page without a traffic source or measurement purpose.
- Do not use a custom product page to make claims not supported by the app, screenshots, terms, or paywall.
- Founder approval is required before creating, submitting, disabling, or deleting custom product pages.

### In-App Events

Click path:

- Apps > <App Name> > In-App Events

Packet should include:

- reference name
- event name, short description, long description, badge/purpose, priority, schedule, country availability, primary language, localization
- media source and upload specs
- deep link and clean-install test
- whether an IAP is required to participate
- App Review status and launch calendar owner

Rules:

- Only plan events that correspond to real in-app content or time-bound functionality.
- Do not use In-App Events as generic ads for permanent features.
- Founder approval is required before submission, schedule changes, or launch.

### Localization

Packet should include:

- primary language and target locales
- localized name/subtitle/description/keywords/promotional text
- localized privacy policy/support URLs when different
- screenshot/app preview localization status
- keyword and cultural review evidence
- fallback behavior if no localization matches the user's device/storefront language

Rules:

- Do not localize keywords without checking whether screenshots and support/privacy coverage are acceptable for that market.
- Keep localized pricing, trial, subscription, and refund language aligned with App Store products and web funnel copy.

### App Accessibility

Click path:

- Apps > <App Name> > App Accessibility

Packet should include:

- whether Accessibility Nutrition Labels are in scope for each supported Apple device type
- common-task matrix: first launch, login, purchase, primary app task, settings, restore purchase, account deletion, and any app-specific critical task
- feature support decision by device: VoiceOver, Voice Control, Larger Text, Dark Interface, Differentiate without Color Alone, Sufficient Contrast, Reduced Motion, Captions, Audio Descriptions, or current App Store Connect feature set
- accessibility URL value when the app has public accessibility notes
- evidence path: `DESIGN.md`, `design/design-room.html`, MobAI/manual device test notes, screenshots/video proof, and `engineering/PRODUCTION_READINESS.md`
- exact publish status and founder approval

Rules:

- Do not claim support for an accessibility feature unless users can complete all common tasks with that feature on the device being declared.
- If accessibility support differs by iPhone, iPad, Mac, Watch, TV, or Vision target, answer per device.
- Treat accessibility labels as product-page metadata. They must stay accurate as the app changes.

### Submission

Click path:

- Apps > <App Name> > App Store > iOS App <Version> > Add for Review > Draft Submissions > Submit for Review

Before clicking:

- build is selected
- all metadata has no unresolved errors
- screenshots uploaded and visually inspected
- privacy answers match data inventory
- age rating/export compliance answered, including the Age Rating Questionnaire fields `socialMedia`, `messagingAndChat`, `socialMediaAgeRestricted`, `ageAssurance`, and `userGeneratedContent`
- `asc age-rating audit` recorded for the exact app; do not infer false from a blank field
- IAP/subscriptions are submitted separately where required
- review notes and demo account work on a clean install
- founder approves final submission

## App Store Connect CLI Route

Use the Rork `asc` CLI to reduce clicking and make App Store Connect state inspectable, but do not let CLI automation replace the founder-facing store packet.

ASC CLI-first rule: app creation, app-record inspection, metadata, localizations, screenshots, TestFlight, review status, subscriptions/IAP, RevenueCat reconciliation, and release validation should route through `app-store-connect-cli.md` before a manual-only handoff. A blocked auth session, missing role, 2FA prompt, unsigned agreement, or unapproved app name/SKU/bundle ID is a named blocker; it is not a reason to claim the agent cannot create or operate the app in App Store Connect.

Safe read/dry-run uses:

- auth status and auth doctor
- app, build, version, localization, TestFlight group, screenshot, and review-status reads
- metadata export/init
- keyword audit
- validation and review doctor
- screenshot plan
- workflow validate and dry-run
- first-time app-record and signing preflight, including whether the current route is direct CLI/API or `asc-app-create-ui`

Founder approval required:

- auth changes or repo-local credential storage
- app creation
- bundle ID, signing, certificate, profile, capability changes
- metadata apply/push
- screenshot upload/replace
- IAP/subscription creation, pricing, localization, or attachment
- TestFlight external distribution
- final submit, release, cancel, phased release, managed publishing, or any public Wall of Apps submission

`store/STORE_CONSOLE.md` must record:

- CLI version/source checked
- official Apple docs refresh date
- auth status without secrets
- IDs resolved
- dry-run commands and output paths
- mutating commands still waiting on approval
- manual App Store Connect pages still required
- whether app creation is CLI/skill-pack ready, blocked by auth/account/agreement, or waiting on founder approval for sticky fields

Use [`paid-tool-routing.md`](../operations/paid-tool-routing.md) if the CLI or skill pack is unavailable. The founder may prefer installing or authorizing the CLI over receiving a manual-only packet.

## Apple Signing And First Upload Route

Use `apple-signing-release.md` when the app needs TestFlight, App Store upload, physical-device signing, or first-time Apple setup.

`store/STORE_CONSOLE.md` must distinguish these states:

- `simulator-build-ok`: local simulator build can compile/run, but distribution signing may still be missing.
- `apple-account-ready`: Apple Developer Program membership, role, Team ID, seller/developer name, and agreements are confirmed.
- `bundle-id-ready`: explicit App ID/bundle identifier exists and matches the Xcode target.
- `app-record-ready`: App Store Connect app record exists with app name, platform, bundle ID, SKU, primary language, and user access.
- `signing-ready`: distribution signing path is chosen and verified through Xcode automatic signing, cloud-managed certificates, manual certificate/profile, or CI/cloud signing.
- `archive-ready`: Release archive succeeds.
- `upload-ready`: archive/export/upload is complete or blocked by a named account/signing/app-record issue.

For first-time builders, show founder-facing instructions for:

- joining Apple Developer Program, including individual versus organization seller-name implications
- signing agreements in App Store Connect
- adding the Apple Account to Xcode or approving a CI/cloud signing route
- choosing final bundle ID and SKU before creating store records
- resolving blank `DEVELOPMENT_TEAM`
- creating or selecting the App Store Connect app record
- understanding why an `Apple Development` identity is not enough by itself for App Store distribution

Do not call the launch "TestFlight-ready" from a simulator build alone.

## Google Play Packet

This section is the Play Console click-path only. Distribution readiness — Play account setup, Data safety derivation, Play App Signing, testing tracks, staged rollout — lives in [`google-play-release.md`](./google-play-release.md); load it before acting on this packet.

### App Creation

Click path:

- Play Console > Home or All apps > Create app

Fields:

- default language
- app name, 30 characters
- app or game
- free or paid
- contact email
- declarations: Developer Program Policies, US export laws, Play App Signing terms

Founder gates:

- developer account access
- free/paid status, because paid app status has important constraints
- contact email

### Main Store Listing

Click path:

- Grow users > Store presence > Main store listing

Fields:

- app name, 30 characters
- short description, 80 characters
- full description, 4000 characters
- app icon
- feature graphic
- screenshots by device class
- preview video: required for iOS App Preview 1 unless explicitly founder-deferred; optional for Google Play promo video based on channel plan
- phone/tablet/Chromebook/Wear/TV/Auto assets when applicable

Rules:

- avoid all-caps unless brand, emojis/special-character spam, ranking claims, price/promo claims in metadata where prohibited, anonymous testimonials, misleading icons, and irrelevant keyword blocks
- keep listing suitable for general audience even if app content rating is mature
- add alt text where Play Console supports it for graphic assets

### Store Settings

Click path:

- Grow users > Store presence > Store settings

Fields:

- app category and tags
- contact details: email required, website recommended, phone optional
- external marketing checkbox decision

### App Content

Click path:

- Policy > App content

Packet sections:

- privacy policy URL: active, public, non-geofenced, not a PDF
- App access: reviewer instructions, demo account, restricted-feature access
- Ads declaration
- Content rating questionnaire
- Target audience and content
- Data safety form
- Account deletion web URL and in-app deletion path when accounts can be created
- sensitive permissions and APIs declarations
- News, health, financial, government, families, or other special declarations when applicable

### Data Safety

Process:

1. Determine whether the app collects or shares user data.
2. For each data type, answer collection, sharing, purpose, optional/required, processing, encryption, deletion, and user control.
3. Align answers with privacy policy, SDK list, backend schema, analytics, ads, AI, payments, email, crash, and support vendors.
4. Preview the Play Store disclosure before submitting.
5. Use Play Console CSV export/import only when it reduces manual errors, and keep the exported/imported CSV path in `store/STORE_CONSOLE.md`.

Packet table:

- Google data type
- source/vendor
- collected yes/no
- shared yes/no
- purpose
- optional/required
- encrypted in transit
- deletion/user control
- privacy-policy section
- evidence path

Even apps that collect no user data still need a completed Data safety form and privacy policy.

### Release, Testing, And Production

Click paths:

- Test and release > Testing
- Test and release > Production
- Test and release > App bundle explorer

Packet should include:

- package name
- version code/name
- AAB path
- signing status
- target API status
- internal/closed/open testing state
- pre-launch report status, crawler credentials, deep links, language selection, issue summary, and launch recommendation
- country availability
- managed publishing decision
- release notes
- known review notes and credentials

## Screenshot And Device Workflow

### Source Of Truth

Screenshots should start from real app UI captured locally, then be composed with design-system frames, text overlays, generated characters/backgrounds, or store-specific templates.

Raw captures are never the final App Store or Google Play artwork by themselves. They are the proof layer that feeds production screenshot compositions, App Icon checks, App Preview/poster frames, device-well exports, and upload validation.

Use:

- `DESIGN.md` for visual rules
- `design/design-room.html` or screenshot HTML for framed concepts
- ParthJadhav/app-store-screenshots for a reusable local screenshot editor/export board that can combine real app captures, app icon, design-system style, headline/copy overlays, locale variants, iPhone/iPad decks, and bulk PNG export
- the in-app iOS Simulator (rung 0 of the Route Ladder in `xcodebuildmcp-testing.md`) for raw Apple captures on a local Mac
- MobAI for real app screenshots when the lane needs Android coverage, a repeatable capture matrix, or multi-device runs
- MobAI `mobile-recorder-skill` for polished iOS/Android app-preview or launch demo videos when video assets are in scope
- XcodeBuildMCP for scripted/CI Apple-platform screenshots, videos, logs, and UI automation, or as the founder-confirmed fallback when an intended MobAI delta lane is unavailable
- Higgsfield for supporting visual assets only after the real UI is clear
- `SCREENSHOTS.md` for final slot table
- `screenshots/index.html` or equivalent screenshot HTML for local composition/export proof when final stills are being assembled
- `growth/DEMO_VIDEO.md` for app-preview/demo-video choreography, raw capture, edited export, captions, and upload copy

### MobAI Capture

Route capture through the Route Ladder first. A one-off Apple capture on a local Mac starts at the in-app iOS Simulator (rung 0). Use MobAI when the lane needs Android coverage, a repeatable capture matrix, multi-device runs, or recorder-polished video.

Preferred MCP flow when available:

- read the MobAI device automation reference before device interaction
- install or launch the app on the target iOS/Android device
- use observe -> act -> wait stable -> observe
- use `save_screenshot` for full-quality PNGs
- store raw captures under `screenshots/raw/<platform>/<device>/`

MobAI CLI route:

- Check current CLI first: `npm view @mobai-app/cli dist-tags.latest`; prefer `npx @mobai-app/cli@latest` or a verified global install when exact flags matter.
- `mobai devices list`
- set `MOBAI_DEVICE`
- `mobai observe --include ui_tree`
- navigate with stable selectors, preferring accessibility IDs
- `mobai wait --stable --timeout-ms 3000`
- `mobai screenshot --full --path ./screenshots/raw --name <slot-name>`

MobAI recorder route:

- Load `mobai-toolbelt.md` before recording polished demo or app-preview videos.
- Refresh `https://github.com/MobAI-App/mobile-recorder-skill` before install or command syntax.
- Follow upstream flow: explore -> `.mob` choreography -> dry-run -> native record -> edit/export.
- Save `.mob`, raw video, final video, captions, upload copy, target device, fixture, duration, dimensions, and rerender instructions.
- Use `DESIGN.md` for phone bezel/background, captions, thumbnail/frame treatment, and upload copy voice.

### XcodeBuildMCP Fallback

MobAI is a freemium third-party tool. Its free tier needs no spend approval when it satisfies the capture lane; Plus/Pro features still require a founder gate. A plain Apple-only capture needs no fallback confirmation — it starts at the in-app iOS Simulator (rung 0). If MobAI is unavailable for a lane that needs a MobAI delta (Android, a repeatable matrix, multi-device runs), do not silently switch platform coverage. Load `paid-tool-routing.md`, ask the founder to confirm XcodeBuildMCP as the Apple-only fallback, then load `xcodebuildmcp-testing.md`.

Use XcodeBuildMCP for:

- Apple simulator/device build, run, test, logs, screenshots, UI snapshots, and video
- screenshot-critical iOS/iPadOS flows when Android is not in scope
- production-readiness evidence paired with backend/provider proof

Limitations:

- not an Android automation fallback
- not proof of MobAI-specific device coverage
- physical device workflows still depend on Xcode signing and local hardware

Record in `SCREENSHOTS.md`:

- selected tool: in-app simulator (rung 0), MobAI, XcodeBuildMCP, manual simulator, or blocked
- founder confirmation for fallback
- raw capture path
- device/simulator, OS, locale, theme, fixture, screen path
- final composition and upload well
- headline, copy overlay, supporting asset, device frame/frameless choice, and visual QA proof
- coverage limitations

Rules:

- do not use screenshots alone for decisions; observe UI tree first
- add accessibility IDs for important screenshot paths when app code is under control
- use OCR only when UI tree is thin
- end capture scripts with wait-stable and observe
- record device, OS, app build, locale, theme, account state, and data fixture

### Apple Screenshot Packet

Apple accepts one to ten screenshots per device size/localization. If UI is the same across device sizes/localizations, highest resolution screenshots can scale down, but the packet must say whether scaled screenshots are acceptable or whether each well gets explicit assets.

Common iOS targets to check against current Apple specs before export:

- iPhone 6.9 inch display: include the current accepted portrait/landscape sizes from Apple or `asc screenshots sizes`; this is the preferred iPhone well for current devices.
- iPhone 6.5 inch display fallback: required if the app runs on iPhone and 6.9 inch screenshots are not provided; Apple can scale from 6.9 inch screenshots when accepted.
- iPad 13 inch display: required if the app runs on iPad; Apple can scale older iPad wells from accepted 13 inch screenshots when supported by the current spec.
- iPad 12.9, 11, 10.5, and 9.7 inch wells: list as explicit, scaled, not needed, or blocked based on the current ASC size matrix and device-family support.
- any watchOS, macOS, tvOS, or visionOS target actually supported

Production composition route:

1. Capture real app UI for each screenshot-critical path.
2. Feed raw captures, app icon, design tokens, 11-star slice, and listing copy into ParthJadhav/app-store-screenshots or an equivalent local composition board.
3. Use Higgsfield only for supporting art such as background imagery, mascots, icons, thumbnails, CPP/event media, or campaign visuals; do not let generated art replace real UI proof.
4. Export every required iPhone and iPad well, locale, and orientation as final no-alpha PNGs.
5. Validate dimensions, alpha, color space, and device type with `asc-screenshot-resize` or current `asc screenshots` validation before `asc-shots-pipeline` upload.

`SCREENSHOTS.md` table:

- platform
- device class
- Apple display well or Play device type
- required/optional
- dimensions
- locale
- slot number
- headline
- copy overlay
- raw MobAI capture path
- frame/composition path
- final upload path
- visual proof path
- upload status

App Icon and App Preview:

- App Icon output must be a 1024x1024 PNG with no alpha and no rounded corners, tested at App Store thumbnail size and checked against category competitors.
- App Preview output must come from real in-app footage for Apple, include a deliberate poster frame, support muted playback, and stay aligned with screenshot orientation and store claims.

### Google Play Screenshot Packet

Google Play requires at least two screenshots across device types to publish a store listing. Current constraints include JPEG or 24-bit PNG with no alpha, minimum dimension 320px, maximum dimension 3840px, and the longest side not more than twice the shortest side.

Packet should cover:

- phone screenshots
- 7 inch tablet and 10 inch tablet screenshots when tablet distribution or quality is relevant
- Chromebook, Wear OS, TV, or Auto screenshots only when supported
- feature graphic and app icon
- preview video if used

## HTML Mock Requirements

`store/store-console.html` should be a working, local file with:

- tabs or sections for App Store Connect and Google Play
- ASC page cards in click-path order
- Play Console page cards in click-path order
- paste-ready fields with limits and counts
- privacy/Data safety tables
- screenshot matrix with thumbnails or file links
- App Icon and App Preview route/status when in scope
- founder-only gates highlighted
- latest official-doc refresh date and source links

Do not make this a marketing page. It should feel like an operator console: dense, copyable, and clear.

## Common Failure Modes

- Metadata exists in `LAUNCH.md` but no click path tells the founder where to paste it.
- ASC CLI exists but `store/store-console.html` and manual click paths were skipped.
- ASC CLI/skill pack could create the app, but the agent gave a manual-only "I cannot create the app" answer without checking auth, role, agreements, local `asc --help`, or `asc-app-create-ui`.
- A missing ASC CLI/MobAI/paid ASO runtime was treated as permission to use a free fallback without asking.
- Privacy answers are copied from a policy generator instead of data inventory and SDK behavior.
- Google Play Data safety and Apple App Privacy disagree.
- App screenshots use generated art but do not show the real app UI.
- MobAI or XcodeBuildMCP captures are raw but never converted into composed, copy-led, platform-specific iPhone/iPad/Play assets.
- ParthJadhav/app-store-screenshots is used as a one-off style idea instead of a real local export board with source captures, app icon, locale/device decks, final files, and validation proof.
- App Icon or App Preview work is skipped even though the ASO pack has specialist guidance for it.
- Store products exist but are not attached to the app version or review/submission state.
- Reviewer credentials are stale or cannot reach the paywalled/restricted flow.
- Apple screenshot wells changed and old dimensions were reused from memory.
- Play Console App content tasks remain incomplete even though listing copy is done.
