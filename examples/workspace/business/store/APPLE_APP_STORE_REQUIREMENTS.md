# {{APP_NAME}} Apple App Store Requirements

Status: scaffold

This packet locks Apple platform requirements before a build is pushed to App Store Connect. Keep it aligned with `store/APPLE_SIGNING.md`, `APP_STORE_LISTING.md`, `store/STORE_CONSOLE.md`, `trust/PRIVACY.md`, `trust/SECURITY.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, the Xcode archive, and founder approval.

## Source Basis

| Apple source | Requirement guarded | Proof |
| --- | --- | --- |
| Privacy manifest files | `PrivacyInfo.xcprivacy`, collected data, required reason API declarations | docs refreshed at {{APPLE_DOCS_CHECKED_AT}} from https://developer.apple.com/documentation/bundleresources/privacy-manifest-files |
| Adding a privacy manifest | app and SDK manifest placement, validity, ASC rejection risk | https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk |
| Describing data use in privacy manifests | `NSPrivacyCollectedDataTypes`, tracking, linked data, collection purposes | https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests |
| Describing use of required reason API | `NSPrivacyAccessedAPITypes` and `NSPrivacyAccessedAPITypeReasons` | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api |
| Third-party SDK requirements | third-party SDK privacy manifests and SDK signatures | https://developer.apple.com/support/third-party-SDK-requirements/ |
| App Privacy Details | App Privacy answers and Privacy Nutrition Labels | https://developer.apple.com/app-store/app-privacy-details |
| Protected resources | `Info.plist` `UsageDescription` strings for protected resources | https://developer.apple.com/documentation/bundleresources/protected-resources |
| App Tracking Transparency | `NSUserTrackingUsageDescription`, tracking decision, ATT prompt route | https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSUserTrackingUsageDescription |
| Upload builds | archive, upload, delivery warnings, processing status | https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/ |
| App Review Guidelines | privacy policy, consent, data minimization, account deletion, review notes | https://developer.apple.com/app-store/review/guidelines/ |

## Privacy Manifest

| Item | App value | Proof |
| --- | --- | --- |
| `PrivacyInfo.xcprivacy` path | {{PRIVACY_MANIFEST_PATH}} | file included in app target resources |
| `NSPrivacyCollectedDataTypes` | {{COLLECTED_DATA_TYPES}} | matches `trust/PRIVACY.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, vendors, and App Privacy |
| `NSPrivacyAccessedAPITypes` | {{REQUIRED_REASON_API_CATEGORIES}} | required reason API scan |
| `NSPrivacyAccessedAPITypeReasons` | {{REQUIRED_REASON_API_REASONS}} | reasons match Apple-approved category values |
| `NSPrivacyTracking` | {{TRACKING_BOOL}} | tracking decision reviewed |
| `NSPrivacyTrackingDomains` | {{TRACKING_DOMAINS}} | only populated when tracking is true and disclosed |
| Valid manifest check | {{MANIFEST_VALIDATION_PROOF}} | `plutil -lint`, Xcode archive, or ASC rejection-email follow-up |

## Third-Party SDK Inventory

| SDK | Listed by Apple as requiring manifest/signature | Bundled manifest | SDK signatures | Data collected | Owner |
| --- | --- | --- | --- | --- | --- |
| {{SDK_NAME}} | {{YES_OR_NO}} | {{SDK_PRIVACY_MANIFEST_STATUS}} | {{SDK_SIGNATURE_STATUS}} | {{SDK_DATA_USE}} | {{OWNER}} |

Rules:
- Any listed third-party SDK, or repackaged listed SDK, needs its privacy manifest before ASC upload.
- Binary dependencies listed by Apple need SDK signatures.
- Data collected by third-party partners must still match App Privacy answers, `trust/PRIVACY.md`, and the generated Xcode privacy report.

## App Privacy And Labels

| ASC field | App answer | Source |
| --- | --- | --- |
| App Privacy data types | {{APP_PRIVACY_DATA_TYPES}} | `app-privacy-questionnaire.html` |
| Linked to user | {{LINKED_DATA_DECISION}} | identity and vendor review |
| Used for tracking | {{TRACKING_DECISION}} | ATT/tracking review |
| Privacy Nutrition Labels | {{LABEL_REVIEW_STATUS}} | Xcode privacy report and App Privacy answers |
| Privacy Policy URL | {{PRIVACY_POLICY_URL}} | public `trust/PRIVACY.md` page |
| Privacy Choices URL | {{PRIVACY_CHOICES_URL}} | account deletion/data controls page |

## Protected Resources And ATT

| Capability or API | `Info.plist` key | `UsageDescription` copy | Alternate route if denied |
| --- | --- | --- | --- |
| Photos | `NSPhotoLibraryUsageDescription` or `NSPhotoLibraryAddUsageDescription` | {{PHOTOS_PURPOSE_STRING}} | picker/share sheet/add-only route |
| Camera | `NSCameraUsageDescription` | {{CAMERA_PURPOSE_STRING}} | upload existing media |
| Microphone | `NSMicrophoneUsageDescription` | {{MICROPHONE_PURPOSE_STRING}} | type instead of recording |
| Location | `NSLocationWhenInUseUsageDescription` or scoped location key | {{LOCATION_PURPOSE_STRING}} | manual entry |
| Contacts | `NSContactsUsageDescription` | {{CONTACTS_PURPOSE_STRING}} | manual invite/share |
| Tracking | `NSUserTrackingUsageDescription` | {{TRACKING_PURPOSE_STRING}} | non-tracking attribution |

Rules:
- Purpose strings must clearly describe the actual use of protected resources.
- Paid functionality must not force unrelated data access.
- The app needs a reasonable path when a user declines permission.
- App Tracking Transparency is required before tracking or accessing advertising identifiers.

## Pre-ASC Upload Checklist

- [ ] `PrivacyInfo.xcprivacy` exists in the app target resources and is valid.
- [ ] Required reason API categories and reasons are recorded in the manifest.
- [ ] Third-party SDK manifests/signatures are audited against Apple's current listed SDKs.
- [ ] Xcode privacy report is generated from an archive and reconciled with App Privacy answers.
- [ ] `Info.plist` purpose strings exist for every protected resource touched by code or SDKs.
- [ ] `NSUserTrackingUsageDescription` and ATT flow are present when tracking is in scope.
- [ ] Privacy Policy URL, Privacy Choices URL, in-app privacy link, and account deletion route are verified.
- [ ] Review notes explain login/demo mode, purchase path, account deletion, privacy-sensitive flows, and entitlement restoration.
- [ ] Archive/upload proof in `store/APPLE_SIGNING.md` has no unresolved ASC delivery warnings.
- [ ] Founder approval is recorded before ASC upload, App Review submission, or public release.
