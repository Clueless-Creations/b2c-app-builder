# Apple Signing And First Upload

Part of the [ASO And Store Operations](./aso-store-ops.md) hub — it decides which store lane runs and what evidence each lane must leave behind.

Use this before any iOS, iPadOS, macOS, tvOS, watchOS, or visionOS TestFlight, App Store, physical-device, or distribution-signing claim. Simulator builds are useful engineering proof, but they are not distribution readiness.

## Contents

- Current Sources To Refresh
- Naming And Identifier Contract
- First-Time Builder Gate
- App Record Creation Preflight
- Local Project Signing Inventory
- Apple Portal And App Store Connect Inventory
- Distribution Signing Strategy
- Archive, Export, And Upload
- Founder Gates
- Required Artifacts
- Common Failure Modes

## Current Sources To Refresh

Refresh official Apple docs before account, signing, app-record, archive/export, or upload instructions:

- Apple Developer Program enrollment: `https://developer.apple.com/programs/enroll/`
- Register an App ID: `https://developer.apple.com/help/account/identifiers/register-an-app-id/`
- Certificates overview: `https://developer.apple.com/help/account/certificates/certificates-overview/`
- Cloud-managed certificates: `https://developer.apple.com/help/account/certificates/cloud-managed-certificates/`
- Create an App Store Connect provisioning profile: `https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/`
- Preparing your app for distribution: `https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution`
- Distributing your app for beta testing and releases: `https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases`
- Upcoming App Store requirements: `https://developer.apple.com/news/upcoming-requirements/`
- Current App Store submission baseline: `https://developer.apple.com/app-store/submitting/`
- Xcode SDK and system requirements: `https://developer.apple.com/xcode/system-requirements/`
- App version number (`CFBundleShortVersionString`): `https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring`
- Build number (`CFBundleVersion`): `https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion`
- Create a new App Store version: `https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version/`
- Changing the bundle identifier: `https://developer.apple.com/documentation/xcode/changing-the-bundle-identifier`
- Privacy manifest files: `https://developer.apple.com/documentation/bundleresources/privacy-manifest-files`
- Adding a privacy manifest: `https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk`
- Describing data use in privacy manifests: `https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests`
- Describing use of required reason API: `https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api`
- Third-party SDK requirements: `https://developer.apple.com/support/third-party-SDK-requirements/`
- Protected resources: `https://developer.apple.com/documentation/bundleresources/protected-resources`
- App Tracking Transparency purpose string: `https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSUserTrackingUsageDescription`
- Add a new app: `https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/`
- App information fields: `https://developer.apple.com/help/app-store-connect/reference/app-information`
- Upload builds: `https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/`

The [Apple Developer Forums version-number thread](https://developer.apple.com/forums/thread/50931) is historical failure evidence. It shows how version segments with leading zeroes can be interpreted as integers and collide with a later version. The thread is not current policy. Use it to explain the failure mode, then use the live `CFBundleShortVersionString`, `CFBundleVersion`, distribution, upload, and App Store Connect pages above as the authority.

Also refresh:

- local Xcode version: `xcodebuild -version`
- available signing identities: `security find-identity -v -p codesigning`
- project build settings for every app target
- App Store Connect CLI docs and `asc --help` when using the Rork CLI route
- XcodeBuildMCP docs and local CLI/tool help when using XcodeBuildMCP

Record the docs checked date and command basis in `store/APPLE_SIGNING.md`, `store/APPLE_APP_STORE_REQUIREMENTS.md`, `store/STORE_CONSOLE.md`, or `engineering/PRODUCTION_READINESS.md`.

Also update `state/business-state.json` with Apple provider state: docs checked date, Apple Developer membership, Team ID, bundle ID/App ID, app record, signing strategy, certificate/profile status, privacy manifest/required-reason API status, archive/export/upload/TestFlight status, founder-only gates, and active failure cards such as `apple-signing-simulator-only`, `apple-privacy-manifest-unproven`, or `asc-name-fallback-unapproved`.

## Live Apple Release Baseline

Do not copy the current Xcode or SDK minimum into B2C App Builder as durable policy. Apple changes this requirement. Before each release archive, read the live Upcoming Requirements, App Store submission, Xcode system requirements, and Upload builds pages. Record:

```text
Apple release source check (YYYY-MM-DD):
- Upcoming Requirements: checked — current upload deadline and minimum Xcode/SDK recorded
- Submitting apps: checked — current platform SDK baseline recorded
- Xcode system requirements: checked — build host and Xcode compatibility confirmed
- Upload builds: checked — supported build/upload route confirmed
- Local Xcode: <xcodebuild -version output>
- Local SDKs: <relevant xcodebuild -showsdks output>
Result: pass | BLOCKED — <mismatch>
```

Treat a stale or missing check as a release blocker. A weekly healthy-link result proves that the page is reachable. It does not prove that the current requirement was read and compared with the build host.

## Version And Build Identity Contract

Before each archive, reconcile the version record in App Store Connect with the intended Release build settings:

- `CFBundleShortVersionString` is the user-visible version. Use three period-separated integer segments. Do not use leading zeroes in a segment.
- `CFBundleVersion` is the build identifier. Use one to three period-separated integers. Use numeric characters and periods only. Ensure that the version/build combination is unique for the target platform.
- `PRODUCT_BUNDLE_IDENTIFIER`, `MARKETING_VERSION`, and `CURRENT_PROJECT_VERSION` are intended values before the archive exists. The compiled archive `Info.plist` is the release evidence after the archive exists.
- The bundle ID and user-visible version in App Store Connect must match the intended values before archive and the compiled values after archive.
- The compiled `CFBundleVersion` must match the intended build. App Store Connect provides uniqueness evidence for this new build, not an equal build value. Record `available — not previously received` and result `unique` before upload. Increment the build if Apple has already received the version/build combination.

After the archive succeeds, inspect it and compare it with the intended settings and the App Store Connect version. Complete this check before export or upload:

```bash
plutil -extract CFBundleIdentifier raw build/MyApp.xcarchive/Products/Applications/MyApp.app/Info.plist
plutil -extract CFBundleShortVersionString raw build/MyApp.xcarchive/Products/Applications/MyApp.app/Info.plist
plutil -extract CFBundleVersion raw build/MyApp.xcarchive/Products/Applications/MyApp.app/Info.plist
```

Stop if a value is missing, contains an unresolved build variable, uses a leading-zero version segment, the compiled bundle ID or user-visible version does not match App Store Connect, the compiled build does not match the intended build, or Apple has already received the version/build combination.

## Naming And Identifier Contract

Separate flexible names from platform identity:

- `DESIGN.md` is the repo-local design contract. A rename breaks routing, validation, and handoff expectations.
- App display name is more flexible. Apple allows editing before review and later with a new version or when the app version status permits it.
- `Bundle ID` is platform identity. It must match the Xcode target bundle identifier and cannot be changed in App Store Connect after a build is uploaded.
- `SKU` is internal App Store Connect tracking identity and cannot be changed after the app is added to the account.
- `Apple ID` is generated by Apple and cannot be edited.

Default to stable reverse-DNS identifiers owned by the founder, such as `com.company.app` or a domain-backed package like `day.ocho.app`. Do not create a bundle ID, app record, store products, RevenueCat app mapping, push entitlement, associated domain, OAuth redirect, or analytics production app against a provisional identifier unless the founder explicitly accepts the cost of migration.

## First-Time Builder Gate

Before saying "ready for TestFlight", classify the Apple account state:

```text
Apple Developer Program membership: active | missing | blocked
Account type: individual | organization | unknown
Account holder/admin access: yes | no | unknown
Team ID: <id or blocked>
Team name / seller name: <Doppler secret name, e.g. FOUNDER_LEGAL_NAME, or blocked — never the literal name; see "Required Artifacts" below>
Latest agreements signed: yes | no | unknown
App Store Connect access: yes | no | unknown
ASC API/CLI auth: configured | missing | blocked
```

For first-time builders:

- If they do not have an Apple Developer Program membership, stop at a founder gate. They must enroll and pay Apple before TestFlight/App Store distribution; an agent cannot complete that for them.
- If they are enrolling as an individual, confirm that their legal name will be the seller name.
- If they need a business or brand seller name, confirm whether an organization account exists or needs D-U-N-S and legal authority setup.
- If agreements are unsigned in App Store Connect, the app record and uploads can be blocked even when credentials work.
- If ASC CLI auth prompts interactively and the agent is non-interactive, record the auth/input blocker and ask the founder to authenticate or provide the approved API-key path through the secret-management flow. Resume the ASC CLI/skill-pack route after authentication; do not switch to a manual-only handoff or claim app creation is impossible unless refreshed CLI/skill docs or Apple account state prove that specific blocker.
- Keep the autonomy mode at `prepare` until the founder approves app-record, bundle ID, signing, or upload mutations; use `mutate` or `ship` only for the approved scope.

## App Record Creation Preflight

Before launching App Store Connect app-record creation in the browser, ASC CLI, or an interactive prompt, show the founder a concise preflight packet and get approval for any value that is not already final in the launch docs.

Required founder-facing packet:

```text
App Store Connect > Apps > + > New App

Apple ID / ASC user:
- Use an Apple Account with Account Holder, Admin, or App Manager access.
- Do not paste the password, 2FA code, API private key, or recovery code into chat or docs.
- Prefer existing keychain/API-key auth when available; use interactive Apple ID password/2FA only with the founder present.

Platforms:
- Select iOS for iPhone/iPad apps.
- Add macOS, tvOS, or visionOS only if this launch intentionally supports those platforms now.
- Do not select extra platforms speculatively; each platform adds metadata/screenshot/review work.

Name:
- Paste the exact public App Store display name, 2-30 characters.
- If unavailable, stop and present fallback options for founder approval before retrying.
- Do not silently accept CLI-generated alternatives such as "<Name> - app".

Primary language:
- Use the metadata default locale, usually en-US for US English launches.
- Confirm if the app's primary market or copy source is another language.

Bundle ID:
- Use the exact Xcode target bundle identifier.
- Confirm the explicit App ID/bundle identifier already exists or will be created first.
- Treat it as sticky platform identity because it cannot be changed in ASC after a build upload.

SKU:
- Use a stable internal slug, for example <app-slug>-ios.
- It is not visible to users, but cannot be changed after app creation.
- Allowed characters: letters, numbers, hyphens, periods, underscores; do not start with hyphen, period, or underscore.

User Access:
- Use Full Access by default for small founder teams.
- Use Limited Access only when a larger organization needs per-app user restrictions.

Developer Name:
- Organization accounts may set a developer/trade name when adding the first app.
- Individual accounts cannot customize this; their legal name is used.
```

Name-collision handling:

- If App Store Connect reports the app name already in use, do not let the CLI invent and apply a public fallback name without approval.
- First check whether the name is already used by another app in the same account/localization. If so, the founder can rename the existing app version or remove the old app record if appropriate.
- If another developer is using the name and the founder has trademark rights, record the Apple support/trademark claim route instead of choosing a weaker name in the moment.
- If the founder approves a fallback, update `strategy/BRAND.md`, `LAUNCH.md`, `store/STORE_CONSOLE.md`, screenshots, website metadata, RevenueCat/store-product notes, and ASO keywords so the public name does not drift.
- Add or resolve the `asc-name-fallback-unapproved` failure card in `state/business-state.json` before continuing.

`store/STORE_CONSOLE.md` should include a filled app-record table before creation:

```text
Field: Platforms
Recommended value: iOS
Why: This implementation targets iPhone/iPad only; other targets require separately verified support.
Editable/sticky: Adding extra platforms later is possible, but creates new metadata work.
Founder approval: required if adding non-iOS platforms

Field: Name
Recommended value: <exact app name>
Why: Matches strategy/BRAND.md and ASO plan.
Editable/sticky: editable before review and in later version windows, but public/ASO-sensitive.
Fallback if unavailable: <approved alternatives or blocked>

Field: Bundle ID
Recommended value: <bundle id>
Why: Must match Xcode PRODUCT_BUNDLE_IDENTIFIER and explicit App ID.
Editable/sticky: cannot change in ASC after build upload.

Field: SKU
Recommended value: <app-slug>-ios
Why: Stable internal tracking ID.
Editable/sticky: cannot change after app creation.

Field: Primary language
Recommended value: en-US
Why: Launch metadata and support copy are US English.
Editable/sticky: can change later, but affects localization defaults.

Field: User Access
Recommended value: Full Access
Why: Founder/operator workflow; no per-app access restriction needed.
Editable/sticky: can be changed via access management.
```

## Local Project Signing Inventory

Run a non-mutating inventory before changing signing:

```bash
xcodebuild -list -project ios/MyApp.xcodeproj
xcodebuild -showBuildSettings -scheme MyApp -configuration Release | rg 'PRODUCT_BUNDLE_IDENTIFIER|DEVELOPMENT_TEAM|CODE_SIGN_STYLE|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER|CURRENT_PROJECT_VERSION|MARKETING_VERSION'
security find-identity -v -p codesigning
find ios -name '*.entitlements' -o -name 'PrivacyInfo.xcprivacy' -o -name 'Info.plist'
plutil -p ios/MyApp/Info.plist
```

When XcodeBuildMCP is available and in scope, use its project/session discovery and build tools first, then record equivalent evidence. Always call `session_show_defaults` before the first XcodeBuildMCP build/run/test in a session.

Inventory every app target, extension, widget, watch target, clip, test host, and notification service extension. Each target may need a related bundle ID, entitlement, signing team, and provisioning profile.

Important interpretation:

- A simulator build can pass with incomplete distribution signing.
- Blank `DEVELOPMENT_TEAM` means the project is not attached to a developer team for signing.
- An `Apple Development` identity is enough for development workflows, but App Store/TestFlight distribution needs an Apple Distribution path through Xcode automatic signing, cloud-managed certificates, or a local Apple Distribution certificate/profile.
- Entitlements in the Xcode project must match capabilities on the App ID and provisioning profile.

## Apple Portal And App Store Connect Inventory

Use read-only checks first:

```bash
asc auth status --validate --output json
asc auth doctor
asc apps list --output json --pretty
```

When App Store Connect API tools are exposed, check:

```text
GET /v1/apps?filter[bundleId]=<bundle-id>&limit=10
GET /v1/bundleIds?filter[identifier]=<bundle-id>&limit=10
```

Record:

- bundle ID / explicit App ID exists
- App Store Connect app record exists
- app record Apple ID
- bundle ID resource ID
- SKU
- primary locale
- platform
- capabilities enabled
- provisioning profile strategy
- certificates available
- RevenueCat/app-store product mapping status, if monetization is in scope

Creation order for a new iOS app is usually:

1. Confirm final bundle ID and owner domain.
2. Create or verify explicit App ID / bundle identifier.
3. Enable capabilities that match project entitlements.
4. Create App Store Connect app record with app name, platform, bundle ID, SKU, primary language, and user access.
5. Configure project `DEVELOPMENT_TEAM`, bundle identifier, signing style, capabilities, version, build number, icons, launch screen, `PrivacyInfo.xcprivacy`, `Info.plist` purpose strings, ATT string if tracking is in scope, and export compliance inputs.
6. Archive, sign/export or upload.
7. Wait for build processing, then attach build to version/TestFlight.

Before step 6 is treated as ready, `store/APPLE_APP_STORE_REQUIREMENTS.md` should pass the installed `check:apple-requirements` validator or record the exact blocker. App Store Connect upload warnings about invalid privacy manifests or SDK requirements are release blockers, not post-submit cleanup.

Do not mutate steps 2-4 without founder approval.

## Distribution Signing Strategy

Choose one path and record why:

### Xcode Automatic Signing

Best for most first-time builders with Xcode access.

- Project is assigned to the correct Apple Developer Program team.
- Xcode manages development and distribution provisioning where possible.
- Xcode Organizer can use cloud-managed certificates for distribution.
- Still record Team ID, bundle ID, capabilities, archive path, and upload status.

### Manual Local Signing

Use when CI, repeatable exports, or strict control is needed.

- Apple Distribution certificate exists and private key is in Keychain.
- App Store Connect provisioning profile exists for the explicit App ID.
- `PROVISIONING_PROFILE_SPECIFIER` and export options match the app target.
- Certificates/profiles are stored through approved secret management, not committed.

### CI Or Cloud Signing

Use when local Mac does not have distribution signing or the team prefers CI.

- Signing material is injected by Xcode Cloud, GitHub Actions, EAS, fastlane match, Codemagic, or another approved service.
- `.p8`, `.p12`, provisioning profiles, passwords, issuer IDs, key IDs, and team IDs are routed through `SECRETS.md` and Doppler or the approved provider.
- Local agent output must distinguish "local simulator builds" from "CI distribution upload".

## Archive, Export, And Upload Preflight Checklist

Run items 1 through 6 before archive. Run item 7 against the new compiled archive before export or upload. Record each result in `store/APPLE_SIGNING.md`. A single unresolved failure blocks the next stage. Do not use an older archive as evidence for a new build.

### 1. Live Apple Requirements And Build Host

Read the live Apple release sources. Compare the current requirements with the local Xcode, SDK, and build host. Use the "Live Apple Release Baseline" record above.

### 2. Intended Release Identity And App Store Connect

Read `PRODUCT_BUNDLE_IDENTIFIER`, `MARKETING_VERSION`, and `CURRENT_PROJECT_VERSION` from the intended Release build settings. Compare the bundle ID and user-visible version with the App Store Connect app record. Confirm that the intended build is available and was not previously received. Reject leading-zero version segments and a version/build combination that Apple has already received.

This check confirms the intended settings. It does not prove what a future archive will contain.

### 3. Privacy Manifest Lint

`PrivacyInfo.xcprivacy` must be a valid property list, not JSON. Run lint before archive:

```bash
plutil -lint ios/MyApp/PrivacyInfo.xcprivacy
```

If the output is anything other than `PrivacyInfo.xcprivacy: OK`, fix the file and run the check again. A JSON brace `{` at line 1 means that the file is JSON and will fail Apple validation.

Record result:

```text
plutil -lint: pass | BLOCKED — <error>
```

### 4. Required Reason API Coverage

Scan the codebase for required-reason API use. Confirm that `NSPrivacyAccessedAPITypes` covers it:

```bash
# UserDefaults usage scan
grep -r 'UserDefaults\|standardUserDefaults\|NSUserDefaults' --include='*.swift' --include='*.m' ios/ | wc -l

# File timestamp API scan
grep -r 'NSFileCreationDate\|NSFileModificationDate\|getattrlist\|fgetattrlist\|stat\b\|fstat\b\|lstat\b\|statfs\b' \
  --include='*.swift' --include='*.m' ios/ | wc -l
```

If the app uses `UserDefaults` and `PrivacyInfo.xcprivacy` does not declare `NSPrivacyAccessedAPICategoryUserDefaults`, the manifest is incomplete. Add the correct reason codes before archive.

Record result:

```text
NSPrivacyAccessedAPITypes coverage: complete | BLOCKED — <missing category>
```

### 5. Prepare API Key Export Authentication

Interactive Apple ID sessions can expire. Prepare every `xcodebuild -exportArchive` invocation with API key authentication flags:

```bash
xcodebuild -exportArchive \
  -archivePath build/MyApp.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ExportOptions.plist \
  -authenticationKeyPath "$ASC_AUTH_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"
```

Route the `.p8` key path, key ID, and issuer ID through `SECRETS.md` and Doppler or the approved secret provider. Do not hard-code them. If the credentials are not available, record a blocker before archive.

Record result:

```text
exportArchive auth: API key flags ready | BLOCKED — <missing key/issuer>
```

### 6. Check Screenshot Dimensions

Before you include a screenshot in an upload or mark a `SCREENSHOTS.md` row as ready, verify the native capture dimensions:

```bash
sips -g pixelWidth -g pixelHeight screenshots/raw/*.png
```

Minimum accepted native widths before any upscale:

| Well                            | Minimum native width |
| ------------------------------- | -------------------- |
| iPhone 6.9 in / 6.7 in / 6.5 in | 1242 px              |
| iPhone 5.5 in                   | 1242 px              |
| iPad Pro 13 in                  | 2048 px              |
| iPad Pro 11 in                  | 1668 px              |

If a raw capture is below the minimum width for its target well, do not upscale it. Re-capture it at the correct simulator or device resolution, or use the export board with a higher-resolution source. Record the actual capture dimensions in `SCREENSHOTS.md`.

Record result:

```text
Screenshot dimension preflight: pass (<device> native: <WxH>) | BLOCKED — <device> capture at <WxH>, below minimum
```

### Post-Archive Evidence Contract

After the archive succeeds, record the exact artifact before item 7. Record the archive path relative to the business root; it must end in `.xcarchive`. Set `created_at` to the ISO 8601 UTC evidence-capture time immediately after archive completion. Hash the actual compiled `Products/Applications/*.app/Info.plist` with SHA-256 and record all 64 hexadecimal characters.

```text
Archive evidence: path=build/MyApp.xcarchive; created_at=YYYY-MM-DDTHH:MM:SSZ; Info.plist SHA-256=<64 lowercase hexadecimal characters>
```

Regenerate this current-release evidence after every re-archive. Do not carry the path, evidence-capture time, hash, or item 7 result forward from an earlier archive.

Keep the evidence on one line in the exact format above. The validator resolves the recorded archive path inside the business root. It locates the compiled `Products/Applications/*.app/Info.plist` and calculates the SHA-256 from that file. It sets `latestArtifactMtime` to the later modification time of the `.xcarchive` directory and compiled `Info.plist`. The evidence passes only when `latestArtifactMtime` is no later than five seconds after `created_at`, `created_at` is no more than one hour after `latestArtifactMtime`, and both times are on the same UTC day. Typed values alone are not proof. This evidence cannot be self-attested.

### 7. Inspect The New Compiled Archive

After `xcodebuild archive` succeeds, inspect the new archive. Do not inspect an older archive. Confirm that its bundle ID and user-visible version match the intended Release settings and App Store Connect. Confirm that its build matches the intended build and that App Store Connect still reports it as available and not previously received. Then verify that every required runtime `Info.plist` key is present. Keys that come from build variables must be expanded.

List the exact, case-sensitive `Info.plist` key names. The example app uses `REVENUECAT_ENTITLEMENT_ID`, `POSTHOG_HOST`, and `SUPABASE_URL`. Replace this list with the project's actual required runtime keys when they differ, and route any secret-shaped keys through the project's secret inventory.

```bash
# After archive, inspect the archived Info.plist directly
plutil -p build/MyApp.xcarchive/Products/Applications/MyApp.app/Info.plist \
  | grep -E 'REVENUECAT_ENTITLEMENT_ID|POSTHOG_HOST|SUPABASE_URL'
```

The square-bracket list in item 7 is comma-separated. Each entry must be an exact, case-sensitive `Info.plist` key name after trimming. Every listed key must exist with a nonempty value. A value that contains `$(...)`, `${...}`, or `{{...}}` is unresolved. If a listed key is absent, empty, or unresolved, stop. Fix the injection route and re-archive. Do not upload the build.

Record result:

```text
7. New compiled archive Info.plist identity and SDK keys [REVENUECAT_ENTITLEMENT_ID, POSTHOG_HOST, SUPABASE_URL]; archive path=build/MyApp.xcarchive; Info.plist SHA-256=<same 64-character SHA-256 recorded in archive evidence>: pass.
```

Keep item 7 on one line in the exact format above. Its path and SHA-256 must match the archive evidence record. This correlation binds the validation to the release artifact. Do not export or upload until item 7 passes. If item 7 fails, fix the build input, create a new archive, and regenerate the complete post-archive evidence record.

## Archive, Export, And Upload

Before upload:

- Pre-archive items 1 through 6 are signed off in `store/APPLE_SIGNING.md`.
- Post-archive item 7 passes against the new compiled archive.
- Release build settings show correct `PRODUCT_BUNDLE_IDENTIFIER`, `DEVELOPMENT_TEAM`, `MARKETING_VERSION`, and `CURRENT_PROJECT_VERSION`.
- App icons, launch screen, supported destinations, category, privacy manifest, Info.plist, URL schemes, entitlements, associated domains, push, and IAP capabilities are accounted for.
- App record and explicit App ID exist in the same Apple team.
- Distribution signing path is chosen and proven or explicitly blocked.
- Privacy, terms, support URL, account deletion, export compliance, age rating, and review notes are drafted in `store/STORE_CONSOLE.md`.

Archive/upload evidence can include:

```bash
xcodebuild archive -scheme MyApp -configuration Release -archivePath build/MyApp.xcarchive
xcodebuild -exportArchive \
  -archivePath build/MyApp.xcarchive \
  -exportPath build/export \
  -exportOptionsPlist ExportOptions.plist \
  -authenticationKeyPath "$ASC_AUTH_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"
```

or Xcode Organizer / XcodeBuildMCP / ASC CLI proof. Prefer the repo's established build tooling and the live docs for exact commands.

Do not call an app "uploaded", "TestFlight-ready", "release-ready", or "store-ready" unless the build has been archived and either uploaded/processing in App Store Connect or the blocker is named with the exact missing account/signing/app-record step.

## Founder Gates

Ask before:

- enrolling in Apple Developer Program or paying Apple
- creating or changing an Apple Developer team, app record, bundle ID, SKU, developer name, or seller-name path
- creating, rotating, exporting, or revoking certificates/profiles
- enabling capabilities that affect entitlements, privacy, payments, push, associated domains, or special Apple approvals
- storing API keys, `.p8`, `.p12`, provisioning profiles, or passwords
- changing bundle ID after services have been configured
- uploading a build, attaching a build to a version, adding external TestFlight testers, submitting for review, releasing, canceling release, or changing pricing/availability

Safe without new approval when credentials are already configured and the user asked for release work:

- read-only account/app/bundle/build status
- local build setting inventory
- local signing identity inventory without exporting keys
- validation, doctor, and dry-run commands
- draft `store/APPLE_SIGNING.md`, `store/STORE_CONSOLE.md`, `store/store-console.html`, and blocker lists

## Required Artifacts

Create `store/APPLE_SIGNING.md` whenever Apple distribution is in scope. It should include:

- official Apple docs checked with dates and URLs
- account membership, role, Team ID, and agreement status. Record the seller/developer name as a pointer only. Name the Doppler secret holding it (for example `FOUNDER_LEGAL_NAME`), never the literal name. An individual account's seller name is the founder's legal name. Treat it as access-controlled personal data, excluded from logs. Never reuse it outside the exact action it was granted for. See `docs/authority-envelopes.md`'s "Legal name" grant.
- project/workspace, scheme, targets, bundle IDs, versions, build numbers, signing style, `DEVELOPMENT_TEAM`, and entitlements
- local signing identity inventory without secret values
- App ID/bundle ID/App Store Connect app record status and IDs
- capabilities matrix mapped to entitlements and third-party services
- selected distribution signing strategy
- archive/export/upload/TestFlight status
- exact founder-only gates
- command/tool evidence and output paths
- secret-management route for signing/API material
- matching `state/business-state.json` `apple_signing` lane status, provider state, and active/resolved failure cards

Update:

- `store/STORE_CONSOLE.md` with app record, build, privacy, review, and upload blockers
- `engineering/PRODUCTION_READINESS.md` with archive/export/upload proof or blocker
- `SECRETS.md` for ASC API keys, Transporter/API issuer IDs, `.p8`, `.p12`, provisioning profiles, CI signing secrets, webhooks, and store credentials
- `revenue/REVENUE_OPS.md` when App Store products or RevenueCat mappings depend on the app record/bundle ID

## Common Failure Modes

- Skipping the pre-archive/export/upload preflight checklist and discovering broken configuration only after upload — causes extra full archive/export/upload cycles. Add or activate the `apple-pre-upload-preflight-skipped` failure card in `state/business-state.json` and re-walk this checklist before each upload attempt.
- Treating `xcodebuild` simulator success, or an in-app simulator run, as proof the app can be uploaded. The easier the simulator run is to reach, the easier this mistake is to make.
- `DEVELOPMENT_TEAM` is blank but the agent claims signing is configured.
- Only an `Apple Development` identity exists locally, but the agent claims App Store distribution is ready.
- App Store Connect shows no app record and no bundle ID, but the agent starts RevenueCat production product setup or TestFlight upload steps.
- `asc auth status` has no credentials and an interactive `asc apps create` prompt fails with EOF; record auth as blocked instead of retrying blindly.
- Creating a bundle ID/app record before final identifier, app name, SKU, team, and seller-name implications are approved.
- Enabling capabilities in Xcode without enabling the same capabilities on the App ID or regenerating profiles.
- Forgetting extension/widget/notification-service bundle IDs.
- Committing `.p8`, `.p12`, provisioning profiles, export passwords, or App Store Connect API credentials.
- Renaming the bundle ID after RevenueCat, push, OAuth redirects, associated domains, app groups, or App Store products already depend on it.
- App privacy, export compliance, age rating, screenshots, review notes, accessibility labels, or subscription products are incomplete even though the binary uploaded.
- `state/business-state.json` says Apple signing is done while archive/export/upload/TestFlight proof is still missing or blocked.
