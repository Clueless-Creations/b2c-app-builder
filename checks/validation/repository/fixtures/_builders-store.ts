import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expectRecord, getLane, readState, writeState } from "./_state.js";

export function writeCompleteAttribution(root: string): void {
  const state = readState(root);
  const contract = expectRecord(getLane(state, "analytics_attribution").attribution_contract, "attribution_contract");
  contract["screen_early"] = true;
  contract["other_free_text"] = true;
  contract["backend_persistence"] = true;
  contract["anonymous_reconciliation"] = true;
  contract["verified"] = true;
  writeState(root, state);
  writeFileSync(
    path.join(root, "analytics/ANALYTICS.md"),
    [
      "# Analytics",
      "Event: attribution_source_selected",
      "PostHog person property: self_reported_source",
      "Backend profile field persists the stable source key.",
      "## HDYHAU Survey",
      "Randomize option order. Allow multi-select. Include TV / offline. Place the survey mid-onboarding.",
      "Blended ROAS uses growth/paid-ua-report.csv. Graduate to AppsFlyer when spend needs network matching.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCompleteAppleSigning(root: string): void {
  const artifactDate = new Date();
  artifactDate.setMilliseconds(0);
  const checkedAt = artifactDate.toISOString().slice(0, 10);
  const archiveTimestamp = artifactDate.toISOString();
  const archivePath = "build/FixtureRelease.xcarchive";
  const archiveDirectory = path.join(root, archivePath);
  const archiveInfoPlistPath = path.join(archiveDirectory, "Products/Applications/Fixture.app/Info.plist");
  mkdirSync(path.dirname(archiveInfoPlistPath), { recursive: true });
  writeFileSync(
    archiveInfoPlistPath,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0"><dict>',
      "<key>CFBundleIdentifier</key><string>com.example.fixture</string>",
      "<key>CFBundleShortVersionString</key><string>1.2.3</string>",
      "<key>CFBundleVersion</key><string>42</string>",
      "<key>REVENUECAT_ENTITLEMENT_ID</key><string>premium</string>",
      "<key>POSTHOG_HOST</key><string>fixture-posthog-host</string>",
      "<key>SUPABASE_URL</key><string>fixture-supabase-endpoint</string>",
      "</dict></plist>",
    ].join("\n"),
    "utf8",
  );
  const infoPlistTime = new Date(artifactDate.getTime() - 2 * 60 * 1_000);
  const archiveDirectoryTime = new Date(artifactDate.getTime() - 60 * 1_000);
  utimesSync(archiveInfoPlistPath, infoPlistTime, infoPlistTime);
  utimesSync(archiveDirectory, archiveDirectoryTime, archiveDirectoryTime);
  const archiveInfoPlistSha = createHash("sha256").update(readFileSync(archiveInfoPlistPath)).digest("hex");
  writeFileSync(
    path.join(root, "store/APPLE_SIGNING.md"),
    [
      "# Apple Signing",
      "Status: ready.",
      "Apple Developer account and Team ID are confirmed.",
      "Xcode DEVELOPMENT_TEAM is set for the Bundle ID and App ID.",
      "App Store Connect app record exists.",
      "App Record Creation Preflight stops for founder approval before mutations.",
      "ASC CLI auth status is validated without secrets, and the app creation route is asc-app-create-ui when browser automation is required.",
      "Distribution certificate and provisioning profile are present.",
      "Archive, export, upload, and TestFlight proof are recorded.",
      "A simulator build alone is not distribution readiness.",
      `Live Apple Release Baseline: Upcoming Requirements (https://developer.apple.com/news/upcoming-requirements/), App Store submission, Xcode system requirements, and Upload builds were checked on ${checkedAt}.`,
      "Local compatibility was verified with xcodebuild -version and xcodebuild -showsdks.",
      "| Live Apple source | Checked at | Current requirement | Local proof | Result |",
      "| --- | --- | --- | --- | --- |",
      `| https://developer.apple.com/news/upcoming-requirements/ | ${checkedAt} | Current Xcode and SDK submission baseline read live | xcodebuild -version and xcodebuild -showsdks recorded | pass |`,
      `| https://developer.apple.com/app-store/submitting/ | ${checkedAt} | Current App Store submission baseline read live | archive platform and SDK verified | pass |`,
      `| https://developer.apple.com/xcode/system-requirements/ | ${checkedAt} | Current Xcode host requirement read live | macOS and Xcode versions verified | pass |`,
      `| https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/ | ${checkedAt} | Current upload requirement read live | validation and upload route verified | pass |`,
      "Version And Build Identity: CFBundleIdentifier, CFBundleShortVersionString, and CFBundleVersion were read from the compiled archive and matched to App Store Connect.",
      "| Identity | Intended value | Compiled archive value | App Store Connect value | Result |",
      "| --- | --- | --- | --- | --- |",
      "| CFBundleIdentifier | com.example.fixture | com.example.fixture | com.example.fixture | matched |",
      "| CFBundleShortVersionString | 1.2.3 | 1.2.3 | 1.2.3 | matched |",
      "| CFBundleVersion | 42 | 42 | available — not previously received | unique |",
      "The version uses three integer segments with no leading zeroes; the version/build combination is unique.",
      `Pre-archive sign-off (recorded ${checkedAt}):`,
      "1. Live Apple release sources and local Xcode/SDK compatibility: pass.",
      "2. Intended Release bundle ID, version, and build against App Store Connect: pass.",
      "3. plutil -lint PrivacyInfo.xcprivacy (valid plist, not JSON): pass.",
      "4. NSPrivacyAccessedAPITypes coverage audited against actual API usage: pass.",
      "5. exportArchive API key auth flags (-authenticationKeyPath, -authenticationKeyID, -authenticationKeyIssuerID): ready.",
      "6. Screenshot dimension floor (raw captures meet device-well minimum, no upscaling): pass.",
      "Post-archive sign-off (recorded before export/upload):",
      `Archive evidence: path=${archivePath}; created_at=${archiveTimestamp}; Info.plist SHA-256=${archiveInfoPlistSha}`,
      `7. New compiled archive Info.plist identity and SDK keys [REVENUECAT_ENTITLEMENT_ID, POSTHOG_HOST, SUPABASE_URL]; archive path=${archivePath}; Info.plist SHA-256=${archiveInfoPlistSha}: pass.`,
    ].join("\n"),
    "utf8",
  );
}

export function rewriteFixtureArchiveInfoPlist(root: string, transform: (contents: string) => string): void {
  const archiveDirectory = path.join(root, "build/FixtureRelease.xcarchive");
  const archiveInfoPlistPath = path.join(archiveDirectory, "Products/Applications/Fixture.app/Info.plist");
  const signingPath = path.join(root, "store/APPLE_SIGNING.md");
  const signing = readFileSync(signingPath, "utf8");
  const recordedTimestamp = /created_at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/.exec(signing)?.[1];
  if (!recordedTimestamp) throw new Error("fixture Apple signing record is missing created_at");
  writeFileSync(archiveInfoPlistPath, transform(readFileSync(archiveInfoPlistPath, "utf8")), "utf8");
  const recordedTime = new Date(recordedTimestamp);
  const infoPlistTime = new Date(recordedTime.getTime() - 2 * 60 * 1_000);
  const archiveDirectoryTime = new Date(recordedTime.getTime() - 60 * 1_000);
  utimesSync(archiveInfoPlistPath, infoPlistTime, infoPlistTime);
  utimesSync(archiveDirectory, archiveDirectoryTime, archiveDirectoryTime);
  const archiveInfoPlistSha = createHash("sha256").update(readFileSync(archiveInfoPlistPath)).digest("hex");
  writeFileSync(signingPath, signing.replaceAll(/Info\.plist SHA-256=[a-f\d]{64}/gi, `Info.plist SHA-256=${archiveInfoPlistSha}`), "utf8");
}

export function writeNewerCompetingFixtureArchive(root: string): void {
  const signing = readFileSync(path.join(root, "store/APPLE_SIGNING.md"), "utf8");
  const recordedTimestamp = /created_at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/.exec(signing)?.[1];
  if (!recordedTimestamp) throw new Error("fixture Apple signing record is missing created_at");
  const archiveDirectory = path.join(root, "build/NewerFixtureRelease.xcarchive");
  const infoPlistPath = path.join(archiveDirectory, "Products/Applications/NewerFixture.app/Info.plist");
  mkdirSync(path.dirname(infoPlistPath), { recursive: true });
  writeFileSync(
    infoPlistPath,
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.newer</string></dict></plist>',
    "utf8",
  );
  const newerTime = new Date(new Date(recordedTimestamp).getTime() + 10_000);
  utimesSync(infoPlistPath, newerTime, newerTime);
  utimesSync(archiveDirectory, newerTime, newerTime);
}

export function writeCompleteAppleRequirements(root: string): void {
  writeCompleteAppleSigning(root);
  mkdirSync(path.join(root, "ios", "App"), { recursive: true });
  writeFileSync(
    path.join(root, "ios", "App", "PrivacyInfo.xcprivacy"),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>NSPrivacyCollectedDataTypes</key>",
      "  <array/>",
      "  <key>NSPrivacyAccessedAPITypes</key>",
      "  <array/>",
      "  <key>NSPrivacyTracking</key>",
      "  <false/>",
      "</dict>",
      "</plist>",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "store/APPLE_APP_STORE_REQUIREMENTS.md"),
    [
      "# Apple App Store Requirements",
      "Status: ready for founder approval.",
      "Source Basis: Privacy manifest files, Adding a privacy manifest, Describing data use in privacy manifests, Describing use of required reason API, Third-party SDK requirements, App Privacy Details, Protected resources, App Tracking Transparency, Upload builds, and App Review Guidelines were refreshed.",
      "Privacy Manifest: PrivacyInfo.xcprivacy exists at ios/App/PrivacyInfo.xcprivacy and is included in app target resources.",
      "Manifest keys: NSPrivacyCollectedDataTypes is empty for this fixture, NSPrivacyAccessedAPITypes is empty for this fixture, NSPrivacyAccessedAPITypeReasons is not used because no required reason API category is present, NSPrivacyTracking is false, and NSPrivacyTrackingDomains is empty.",
      "Third-party SDK Inventory: third-party SDK entries are checked against Apple's listed SDKs; SDK signatures and bundled manifests are verified or the SDK is excluded from the build.",
      "Xcode privacy report: generated from archive and reconciled with App Privacy, Privacy Nutrition Labels, trust/PRIVACY.md, trust/SECURITY.md, APP_STORE_LISTING.md, store/STORE_CONSOLE.md, and review notes.",
      "App Privacy: Privacy Policy URL and Privacy Choices URL are verified, account deletion is present, and data collection answers match vendors and app behavior.",
      "Protected resources: Info.plist UsageDescription purpose strings are audited for protected resources. NSUserTrackingUsageDescription and App Tracking Transparency are recorded when tracking or advertising identifiers are in scope.",
      "Archive and upload: store/APPLE_SIGNING.md records archive, export, upload, App Store Connect delivery warnings, processing status, and founder approval before submission.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCompleteStoreConsole(root: string): void {
  writeFileSync(
    path.join(root, "store/STORE_CONSOLE.md"),
    [
      "# Store Console",
      "App Store Connect click path and ASC CLI routes cover app creation, asc-id-resolver ID resolution, app info, SKU, primary locale, bundle ID, App Privacy, pricing, RevenueCat, asc-revenuecat-catalog-sync, subscription setup, localization, custom product page strategy, In-App Event planning, Higgsfield-backed marketing assets, screenshots, TestFlight, review status, review notes, and account deletion.",
      "App Review Information notes cover purpose and target audience, setup and access instructions, the demo account decision (including an explicit no-login confirmation when there is no account system), the list of test devices and OS versions, and the external services used.",
      "Age Rating Questionnaire records socialMedia, messagingAndChat, socialMediaAgeRestricted, ageAssurance, and userGeneratedContent from product evidence.",
      "Run asc age-rating audit before submission.",
      "Do not infer false from a blank field.",
      "Google Play click path covers package name, Data safety, screenshots, review notes, privacy, and account deletion.",
      "If the app name is already in use, stop for founder approval before using any fallback name.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(root, "store/store-console.html"), "<!doctype html><html><body>Store console packet</body></html>", "utf8");
  writeFileSync(
    path.join(root, "APP_STORE_LISTING.md"),
    [
      "# App Store Listing",
      "App Privacy answers are derived from data inventory and third-party partners.",
      "Pricing, RevenueCat entitlement mapping, asc-revenuecat-catalog-sync, subscription setup, localization, custom product page strategy, In-App Event planning, App Icon direction, App Preview routing, SCREENSHOTS.md, iPad screenshot wells, copy overlay rules, ParthJadhav/app-store-screenshots, and Higgsfield-backed marketing assets are ready for founder approval.",
      "ASC route proof includes app creation, asc-app-create-ui, asc-id-resolver, asc-metadata-sync, asc-localize-metadata, asc-screenshot-resize, asc-shots-pipeline, asc-ppp-pricing, asc-subscription-localization, asc-testflight-orchestration, asc-submission-health, and asc-release-flow.",
      "Every screenshot row records version localization ID and every pricing row records base territory.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(root, "app-store-listing.html"), "<!doctype html><html><body>App Store listing packet</body></html>", "utf8");
  writeFileSync(path.join(root, "app-privacy-questionnaire.html"), "<!doctype html><html><body>App Privacy questionnaire</body></html>", "utf8");
}

export function writeCompleteStoreScreenshots(root: string): void {
  writeFileSync(
    path.join(root, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Status: partial until founder approval for upload.",
      "Source Ledger: DESIGN.md, 11_STAR_EXPERIENCE.md, APP_STORE_LISTING.md, CONTENT_ASSETS.md, MobAI raw captures, Codex Desktop native iOS/XcodeBuildMCP captures, serve-sim streams, SnapshotPreviews preview-only proof, Higgsfield supporting visuals, Remotion rendered frames, ParthJadhav/app-store-screenshots export board, app-store-screenshots.json state, and asc-screenshot-resize validation.",
      "Narrative: Slot 1 sells the core outcome; slots 2-3 prove the V1 scalable slice; later slots show one benefit per frame.",
      "App Icon: 1024x1024 PNG, no alpha, no rounded corners, tested at App Store search thumbnail size, with Higgsfield route recorded when generated.",
      "App Preview Video (Autoplay Hook): app previews autoplay muted and always precede screenshots; the first preview's first 3-5 seconds are the muted hook showing the magical moment first, produced via aso-skills:app-preview-video, with a poster frame, real in-app footage, and founder approval before upload.",
      "Asset Knowledge Brief: every asset draws on strategy/RESEARCH.md (target user/problem), 11_STAR_EXPERIENCE.md (magical moment), and EMOTIONAL_DESIGN.md (Emotional North Star and Experience Card) so screenshots and the app preview are knowledge-leveraged, not generic.",
      "Composition And Export Route: ParthJadhav/app-store-screenshots writes app-store-screenshots.json and a reusable screenshots/index.html board from real UI, app icon, design tokens, localized copy, and optional Higgsfield support assets.",
      "Definition of Good (Present / Proven / Optimized): PRESENT — matrices filled; PROVEN — real raw captures and final PNGs exist, app-store-screenshots.json references them, the screenshot theme is derived from DESIGN.md (or declares a tokensSource field pointing at it), and captions reinforce APP_STORE_LISTING.md keywords; OPTIMIZED — screenshot-rubric-scores.json records a passing grade per SCREENSHOT_RUBRIC.md or a logged founder override.",
      "Raw Capture Matrix",
      "| Slot | Platform | Device | Locale | Source screen | Capture tool | Raw path | Version localization ID | Status |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | iOS | iPhone 6.9 | en-US | onboarding/value | MobAI | screenshots/raw/iphone-slot-1.png | 123 | captured |",
      "| 2 | iOS | iPad 13 | en-US | core feature | MobAI | screenshots/raw/ipad-slot-2.png | 123 | captured |",
      "| 3 | Google Play | phone | en-US | paywall/result | MobAI | screenshots/raw/play-slot-3.png | n/a | captured |",
      "Production Composition Matrix",
      "| Slot | Headline | Copy overlay | Layout | Supporting asset | Route | Final upload path | Dimensions | Alpha/color space | Visual QA |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | See the win fast | yes | framed iPhone app store screenshot | Higgsfield background tied to DESIGN.md | ParthJadhav/app-store-screenshots composition from real UI | screenshots/final/iphone-69-slot-1.png | 1320x2868 | alpha removed, sRGB color space | thumbnail and mobile proof passed |",
      "| 2 | Built for big screens | yes | framed iPad app store screenshot | DESIGN.md gradient panel | ParthJadhav/app-store-screenshots composition from real UI | screenshots/final/ipad-13-slot-2.png | 2064x2752 | alpha removed, sRGB color space | iPad well proof passed |",
      "Device Wells",
      "| Platform | Well | Required/scaled decision | ASC device_type | Screenshot count | Dimensions | Target file | Validation proof | Status |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| iOS | iPhone 6.9 | required or scaled | IPHONE_69 | screenshot count: 3 | 1320x2868 | screenshots/final/iphone-69/ | asc-screenshot-resize and asc-shots-pipeline dry-run | blocked |",
      "| iPadOS | iPad 13 | required if iPad supported | IPAD_13 | screenshot count: 2 | 2064x2752 | screenshots/final/ipad-13/ | asc-screenshot-resize and asc-shots-pipeline dry-run | blocked |",
      "Device Wells: iPhone 6.9, iPhone 6.5, iPhone 6.3, iPhone 6.1, iPad 13, iPad 12.9, Google Play phone, tablet, and feature graphic are listed with required, scaled, ready, or blocked status.",
      "Export And Validation: run asc-screenshot-resize for size, alpha, sRGB color space, current device wells, ASC device_type, and screenshot count; record asc-shots-pipeline dry-run before upload.",
      "Visual QA: check thumbnail readability, text fit, safe areas, overlap, color contrast, actual UI truth, pricing/trial consistency, and no unsupported claims.",
      "Founder approval is required before screenshot upload, App Preview upload, CPP/event media submission, paid Higgsfield generation, or replacing Higgsfield with a fallback.",
    ].join("\n"),
    "utf8",
  );
}

export function writeCompleteElevenStar(root: string): void {
  const state = readState(root);
  const experienceLane = getLane(state, "experience");
  experienceLane["status"] = "succeeded";
  experienceLane["evidence"] = ["11_STAR_EXPERIENCE.md", "11-star-experience.html"];
  experienceLane["blockers"] = [];
  writeState(root, state);
  writeFileSync(
    path.join(root, "11_STAR_EXPERIENCE.md"),
    [
      "# 11-Star Experience",
      "Experience Thesis: The user moves from anxious uncertainty to a confident next step they want to retell.",
      "Star Ladder",
      "| Stars | Label | User scene | Product behavior implied | Emotional reaction | What we learn |",
      "| --- | --- | --- | --- | --- | --- |",
      "| 1 | Refund me | The app gives generic advice and breaks trust. | Block unsupported claims and bad recovery. | Regret. | Never ship this. |",
      "| 2 | It technically works | The result appears after friction and confusion. | Reduce wait, explain state, add recovery. | Tolerance. | Baseline usability. |",
      "| 5 | Expected experience | The core loop works. | Deliver the promised task reliably. | Neutral. | Category floor. |",
      "| 6 | Better than expected | The app reflects the user's input in a useful summary. | Personalize the output and next step. | Relief. | First feasible delight. |",
      "| 7 | Way beyond | The app prepares the next best action from the user's context. | Connect state, copy, and timing. | Made for me. | V1 magic candidate. |",
      "| 10 | Impossible concierge | A human expert manually creates the perfect outcome. | Identify the unscalable service blueprint. | Amazement. | What to productize. |",
      "| 11 | Absurd extreme | The user's problem disappears like a movie scene. | Reveal the true ambition. | Evangelism. | What users would tell everyone about. |",
      "Line Of Feasibility: V1 lives between 6 and 7 stars; 10 and 11 stay deferred inspiration.",
      "V1 Scalable Slice: produce the first context-aware result, explain why it matters, and route the next step.",
      "Surface Matrix",
      "| Surface | 11-star question | Product-specific answer | Artifact owner | Proof |",
      "| --- | --- | --- | --- | --- |",
      "| Product | What result would the user retell? | Context-aware next step. | PRODUCT.md, state/LAUNCH_TRACE.md | EXP-001 |",
      "| Onboarding | What makes the user feel understood early? | Reflect answers before paywall. | product/ONBOARDING.md | EXP-001 |",
      "| Paywall | What unlocks momentum? | Show the next unlocked action. | revenue/REVENUE_OPS.md | EXP-001 |",
      "| Ad | What tiny experience can the ad deliver? | Show the before/after moment. | CONTENT_ASSETS.md | EXP-001 |",
      "| App Store | What three frames prove the magic? | Problem, personalized result, next step. | APP_STORE_LISTING.md | EXP-001 |",
      "| Engineering | What must be real? | State, API, analytics, and fixture proof. | engineering/TECH_SPEC.md | EXP-001 |",
      "Visual Storyboard: 11-star-experience.html renders the ladder.",
      "Traceability",
      "| Trace ID | Experience decision | Source evidence | Product impact | Design impact | Build contract | Verification |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| EXP-001 | Context-aware result is the magical moment. | strategy/RESEARCH.md | PRODUCT.md | DESIGN.md | engineering/TECH_SPEC.md | engineering/PRODUCTION_READINESS.md |",
      "Engineering Contract: engineering/TECH_SPEC.md owns the state machine, data model, API/RPC/webhook contracts, permissions, offline/error states, analytics events, test fixture, and E2E proof path.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    path.join(root, "11-star-experience.html"),
    "<!doctype html><html><body><h1>11-Star Experience Board</h1><p>Line Of Feasibility</p><p>V1 Scalable Slice</p><p>Surface Translation</p></body></html>",
    "utf8",
  );
  for (const [file, text] of [
    ["PRODUCT.md", "# Spec\n\n## 11-Star Experience\n\nSource: 11_STAR_EXPERIENCE.md. Trace: EXP-001.\n"],
    ["DESIGN.md", "# Design\n\nThis design expresses the 11-star V1 slice from 11_STAR_EXPERIENCE.md. Trace: EXP-001.\n"],
    [
      "product/ONBOARDING.md",
      [
        "# Onboarding",
        "",
        "The onboarding preview carries the 11-star magical moment from 11_STAR_EXPERIENCE.md. Trace: EXP-001.",
        "First value / value-reveal step: the user sees a personalized plan that explains the context-aware next step before paywall or activation detours.",
        "App Review popup: immediately after the first value/value-reveal screen, automatically request the native review prompt after the screen is fully displayed and visible with a 1-2 second async delay.",
        "Native API: iOS uses SKStoreReviewController.requestReview(in:) and Android uses Google Play In-App Review / ReviewManager.",
        "Trigger guard: do not bind the prompt to an acceptance tap or navigation action that dismisses the screen.",
        "Cooldown: one eligible request per major value milestone, with platform frequency caps respected.",
        "Analytics: emit review_prompt_eligible before the request and review_prompt_requested when the native API is called.",
        "Fallback: the platform may not show the review sheet; continue onboarding to paywall or activation without blocking the user.",
      ].join("\n"),
    ],
    ["engineering/TECH_SPEC.md", "# Tech Spec\n\nThe state, API, analytics, and fixture contracts implement EXP-001 from 11_STAR_EXPERIENCE.md.\n"],
    [
      "state/LAUNCH_TRACE.md",
      "# Launch Trace\n\nEXP-001 maps research to 11_STAR_EXPERIENCE.md, PRODUCT.md, DESIGN.md, product/ONBOARDING.md, engineering/TECH_SPEC.md, and proof.\n",
    ],
  ] as const) {
    writeFileSync(path.join(root, file), text, "utf8");
  }
}

export function writeCompleteSecurity(root: string): void {
  writeFileSync(
    path.join(root, "trust/SECURITY.md"),
    [
      "# Security Release Plan",
      "Source Basis: OWASP MASVS, OWASP ASVS, Apple Platform Security, Android security best practices, Claude Security, Codex Security, MobSF, Doppler, Sentry, and local security skills.",
      "Security Review Tool Routing: paid or account-gated scanners require founder approval before any free fallback is used.",
      "Claude Security, Codex Security, GitHub Advanced Security, Snyk, Semgrep, Socket, and MobSF Cloud are optional paid or account-gated routes.",
      "Free fallback: security-threat-model, security-best-practices, MobSF local, gitleaks, trufflehog, npm audit, osv-scanner, and semgrep community rules.",
      "Threat Model: Assets, Trust Boundaries, Attacker Capabilities, and abuse paths cover account, attribution, API, revenue, support, and store release flows.",
      "Data Classification separates public copy, user personal data, purchase data, Secrets, signing material, and CI credentials.",
      "Mobile Hardening: iOS uses Keychain, App Transport Security, App Attest, DeviceCheck, entitlements, and store/APPLE_SIGNING.md release proof. Android uses Android Keystore, Network Security Config, and Play Integrity.",
      "Authentication and Authorization are backend-owned; client checks are not access control.",
      "Backend and API controls include validation, rate limits, idempotency, webhook signature verification, RLS, audit logging, and admin least privilege.",
      "Revenue, Entitlements, RevenueCat, Stripe, restore, webhook, and idempotency controls prevent entitlement spoofing and replay.",
      "Privacy and Analytics cover PostHog, session replay, PII, PII scrubbing, self-reported attribution, privacy disclosures, and data deletion alignment.",
      "Email and Domain Security cover SPF, DKIM, DMARC, unsubscribe, Resend, support, privacy, security aliases, security.txt, and security headers.",
      "Supply Chain covers SDK inventory, dependency review, lockfiles, secret scan, build scripts, signing material, and no raw secrets.",
      "Monitoring and Incident Response cover Sentry, release health, alerts, support escalation, rollback, and vulnerability disclosure.",
      "Release Checks require check:security, check:secrets, mobile evidence, webhook evidence, scanner or blocked-route evidence, and trust/security-review.html.",
      "Accepted Risks list owner, reason, expiry, compensating control, evidence, and founder approval.",
      "Founder Approval gates paid scanners, hosted security tools, repo connections, public disclosure routes, and blocking App Attest, DeviceCheck, or Play Integrity enforcement.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(path.join(root, "trust/security-review.html"), "<!doctype html><html><body>Security review board</body></html>", "utf8");
}

export function writeCompleteAsoOps(root: string): void {
  writeFileSync(
    path.join(root, "STORE_OPS.md"),
    [
      "# Store Ops",
      "## ASO Evidence Receipt",
      "",
      "| Field | Record |",
      "| --- | --- |",
      "| Storefront | US |",
      "| Platform | iOS |",
      "| Locale | en-US |",
      "| Query set | sleep sounds, white noise |",
      "| Observed CLI version | 4.9.0 |",
      "| Source availability | see Official Apple Keyword Sources |",
      "| Raw inputs | none |",
      "| Rank-window limitation | a missing window hit does not prove global absence |",
      "| Collection time | 2026-08-24T12:00:00Z |",
      "| Recurring loop | released apps, exact storefronts, deduplicate runs, retain deltas |",
      "",
      "Confirm optimize keywords --help before the first run. Rank is unauthenticated.",
      "Do not auto-apply metadata. Metadata still needs plan, approval, validation, dry-run, and readback.",
      "",
      "## Official Apple Keyword Sources",
      "",
      "| Source | Command | Availability | Raw inputs | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| rank | asc optimize keywords rank | unavailable | none | public storefront window |",
      "| discover | asc optimize keywords discover | unavailable | none | Apple Ads account required |",
      "| score | asc optimize keywords score | unavailable | none | Apple Ads popularity |",
    ].join("\n"),
    "utf8",
  );
}
