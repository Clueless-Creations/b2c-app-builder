# {{APP_NAME}} Apple Signing Packet

Status: scaffold

This packet records distribution readiness for iOS. Keep it aligned with the Xcode project, App Store Connect app record, CI signing setup, `store/APPLE_APP_STORE_REQUIREMENTS.md`, and founder approval before TestFlight or App Store submission.

Native iOS proof from the in-app iOS Simulator (Claude Code Desktop pane, Claude Code CLI `computer-use`, or Codex `build-ios-apps`), Codex Desktop, XcodeBuildMCP, SnapshotPreviews, serve-sim, MobAI, or simulator/device screenshots supports implementation, screenshot, and app-preview evidence in `engineering/PRODUCTION_READINESS.md` and `SCREENSHOTS.md`. It does not satisfy this distribution packet unless archive/export/upload/TestFlight gates below are also proven. The in-app simulator in particular drives simulated devices only and cannot control a physical iPhone or iPad, so the release-device row and every gate in this packet stay outside its reach.

## Account And Identifiers

| Gate | Value | Proof |
| --- | --- | --- |
| Apple Developer account | {{APPLE_DEVELOPER_ACCOUNT}} | membership screenshot or account note kept outside git |
| Team ID | {{APPLE_TEAM_ID}} | Apple Developer Membership page |
| DEVELOPMENT_TEAM | {{DEVELOPMENT_TEAM}} | Xcode build setting or CI variable name |
| Bundle ID | {{IOS_BUNDLE_ID}} | Xcode target and Apple Developer identifier |
| App ID | {{APPLE_APP_ID}} | Apple Developer identifier record |
| App Store Connect app record | {{ASC_APP_RECORD_URL}} | App Information URL |
| ASC CLI auth status | Pending | `asc auth status --validate` or blocked reason without secrets |

## App Record Creation Preflight

- Confirm name, SKU, primary locale, bundle ID, category, privacy URL, support URL, and ownership before creating or editing the App Store Connect app record.
- Record the ASC CLI or skill-pack app creation route (`asc-app-create-ui` when browser automation is required) before falling back to manual-only instructions.
- Stop for founder approval before any App Store Connect mutation, app record creation, SKU change, bundle ID change, capability change, or signing account change.

## Signing Assets

| Asset | Source | Proof |
| --- | --- | --- |
| Distribution certificate | Apple Developer Certificates | certificate common name and expiry recorded here |
| Provisioning profile | Apple Developer Profiles or Xcode managed signing | profile name, bundle ID, Team ID, and expiry recorded here |
| Capabilities and entitlements | Xcode target and Apple Developer App ID | entitlement diff recorded here |
| CI export method | ExportOptions.plist or CI workflow | archive, export, upload, and TestFlight command proof recorded here |

## Apple App Store Requirements Gate

`store/APPLE_APP_STORE_REQUIREMENTS.md` must be ready before a build is pushed into App Store Connect. Record:

- bundled `PrivacyInfo.xcprivacy` path and target-resource proof
- required reason API categories/reasons and `NSPrivacyAccessedAPITypeReasons`
- third-party SDK privacy manifest/signature status
- Xcode privacy report status and App Privacy label reconciliation
- `Info.plist` purpose strings, `NSUserTrackingUsageDescription`, and ATT route when tracking is in scope
- account deletion, review notes, privacy URLs, archive/upload warnings, and founder approval

## Live Apple Release Baseline

Do not rely on a pinned Xcode or SDK requirement in this packet. Read and record Apple's live requirements before each release archive.

| Live Apple source | Checked at | Current requirement | Local proof | Result |
| --- | --- | --- | --- | --- |
| https://developer.apple.com/news/upcoming-requirements/ | {{APPLE_DOCS_CHECKED_AT}} | {{APPLE_UPCOMING_REQUIREMENT}} | `xcodebuild -version`; `xcodebuild -showsdks` | {{APPLE_UPCOMING_REQUIREMENT_RESULT}} |
| https://developer.apple.com/app-store/submitting/ | {{APPLE_DOCS_CHECKED_AT}} | {{APPLE_SUBMISSION_BASELINE}} | archive platform and SDK | {{APPLE_SUBMISSION_BASELINE_RESULT}} |
| https://developer.apple.com/xcode/system-requirements/ | {{APPLE_DOCS_CHECKED_AT}} | {{XCODE_HOST_REQUIREMENT}} | macOS and Xcode versions | {{XCODE_HOST_REQUIREMENT_RESULT}} |
| https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/ | {{APPLE_DOCS_CHECKED_AT}} | {{APPLE_UPLOAD_REQUIREMENT}} | chosen validation/upload route | {{APPLE_UPLOAD_REQUIREMENT_RESULT}} |

A weekly source-freshness result only proves that these pages are reachable. This dated release check must prove that the current text was read and compared with the build host.

## Version And Build Identity

| Identity | Intended value | Compiled archive value | App Store Connect value | Result |
| --- | --- | --- | --- | --- |
| `CFBundleIdentifier` | {{IOS_BUNDLE_ID}} | {{ARCHIVE_BUNDLE_ID}} | {{ASC_BUNDLE_ID}} | {{BUNDLE_ID_MATCH_RESULT}} |
| `CFBundleShortVersionString` | {{MARKETING_VERSION}} | {{ARCHIVE_MARKETING_VERSION}} | {{ASC_VERSION}} | {{VERSION_MATCH_RESULT}} |
| `CFBundleVersion` | {{CURRENT_PROJECT_VERSION}} | {{ARCHIVE_BUILD_VERSION}} | {{ASC_BUILD_AVAILABILITY_EVIDENCE}} | {{BUILD_UNIQUENESS_RESULT}} |

Use three period-separated integer segments for `CFBundleShortVersionString`. Do not use leading zeroes. Use one to three period-separated integers for `CFBundleVersion`; use numeric characters and periods only. The intended and compiled `CFBundleVersion` values must match. Replace `{{ASC_BUILD_AVAILABILITY_EVIDENCE}}` with `available — not previously received` only after current App Store Connect evidence confirms it, and replace `{{BUILD_UNIQUENESS_RESULT}}` with `unique`. Do not use the App Store Connect column as an equality value for a new build. Keep bundle ID and `CFBundleShortVersionString` equal to their App Store Connect values. Confirm that the compiled archive contains no unresolved build variables. The [2016 Apple Developer Forums thread](https://developer.apple.com/forums/thread/50931) is historical failure evidence only; current Apple documentation is authoritative.

## Archive, Export, And Upload Preflight Sign-Off

Record items 1 through 6 before running `xcodebuild archive`. Record item 7 after the new archive exists and before export or upload. Each item must read `pass` or `ready` before the next stage. If an item cannot pass, replace the line with `<item>: blocked — <reason>` and stop until it is resolved. That unresolved state opens the `apple-pre-upload-preflight-skipped` failure card.

```text
Pre-archive sign-off (recorded on the archive date):
1. Live Apple release sources and local Xcode/SDK compatibility: pass.
2. Intended Release bundle ID and version match App Store Connect; build is available and not previously received: pass.
3. plutil -lint PrivacyInfo.xcprivacy (valid plist, not JSON): pass.
4. NSPrivacyAccessedAPITypes coverage audited against actual API usage: pass.
5. exportArchive API key auth flags (-authenticationKeyPath, -authenticationKeyID, -authenticationKeyIssuerID): ready.
6. Screenshot dimension floor (raw captures meet device-well minimum, no upscaling): pass.

Archive evidence: path={{RELEASE_ARCHIVE_PATH_XCARCHIVE}}; created_at={{RELEASE_ARCHIVE_EVIDENCE_CAPTURED_AT_ISO_8601_UTC}}; Info.plist SHA-256={{RELEASE_ARCHIVE_INFO_PLIST_SHA256_64_HEX}}

Post-archive sign-off (recorded before export/upload):
7. New compiled archive Info.plist identity and SDK keys [REVENUECAT_ENTITLEMENT_ID, POSTHOG_HOST, SUPABASE_URL]; archive path={{RELEASE_ARCHIVE_PATH_XCARCHIVE}}; Info.plist SHA-256={{RELEASE_ARCHIVE_INFO_PLIST_SHA256_64_HEX}}: pass.
```

Keep the archive evidence and item 7 records on one line each in the exact formats shown. The square brackets in item 7 are required. List exact, case-sensitive `Info.plist` key names, separated by commas. Replace the example list with the project's actual required runtime keys when they differ. Every listed key must exist with a nonempty value and no unresolved `$(...)`, `${...}`, or `{{...}}` placeholder. The archive path is relative to the business root and must end in `.xcarchive`. Record `created_at` in ISO 8601 UTC immediately after archive completion. The SHA-256 must contain 64 hexadecimal characters. Item 7 must repeat the same archive path and SHA-256 as the archive evidence record. The validator resolves that path inside the business root, locates the actual compiled `Products/Applications/*.app/Info.plist`, and calculates its SHA-256. It sets `latestArtifactMtime` to the later modification time of the `.xcarchive` directory and compiled `Info.plist`. The evidence passes only when `latestArtifactMtime` is no later than five seconds after `created_at`, `created_at` is no more than one hour after `latestArtifactMtime`, and both times are on the same UTC day. Typed values alone are not proof; this evidence cannot be self-attested. Regenerate the complete current-release evidence record after every re-archive; never reuse evidence from an older archive.

See the "Archive, Export, And Upload Preflight Checklist" section in `apple-signing-release.md` for commands and acceptance criteria for each item.

## Release Proof

- Archive proof records Xcode version, scheme, configuration, archive path, and signing identity.
- Export proof records export method, provisioning profile mapping, output IPA path, and `-authenticationKeyPath`/`-authenticationKeyID`/`-authenticationKeyIssuerID` flags used.
- Upload proof records Transporter, Xcode organizer, Fastlane, or App Store Connect API command output.
- TestFlight proof records build number, processing status, tester group route, and review notes route.
- A simulator build alone is not distribution readiness.

## Founder Approval

Founder approval is required before paid account changes, certificate replacement, provisioning profile replacement, App Store Connect app record mutation, TestFlight external testing, App Store submission, phased release, or manual release.
