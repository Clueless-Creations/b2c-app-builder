# Google Play Release

Part of the [ASO And Store Operations](./aso-store-ops.md) hub — it decides which store lane runs and what evidence each lane must leave behind.

Use this before any Android distribution-readiness claim: Google Play developer account, app record, content declarations, Play App Signing, testing tracks, or production release. This is the Android parity lane to `apple-signing-release.md`. Play shares the store lane: state lives in `state/business-state.json` under `lanes.store_console` and `providers.google_play`, and the artifact is `store/GOOGLE_PLAY_RELEASE.md`.

## Contents

- When To Load
- Developer Account And Verification
- App Record And Content Declarations
- Play App Signing
- Target API Level Policy
- Release Tracks
- Pre-Launch Report
- Monetization Reconciliation
- Review, Policy, And Appeals
- Artifact Contract
- Founder-Only Gates
- Anti-Patterns
- Source Basis

## When To Load

Load this reference when any of these is true:

- `platforms` in the launch scope includes `android`.
- An Android application ID / package name exists in the repo (Gradle `applicationId`, Expo `android.package`, or equivalent).
- The founder asks for Google Play, Android release, AAB, Play Console, or Android testing work.
- Any store artifact, lane status, or agent claim asserts Play readiness, "Android done", or "both stores ready".

Pair it with `store-console-workflow.md` for the Play Console click-path packet, `privacy-terms.md` for Data safety inputs, `revenue-monetization.md` for Play Billing, and `aso-store-ops.md` for listing metadata. Do not let iOS depth become an excuse for Play shallowness: a "both stores" launch claim with only an Apple packet is a coverage failure.

## Developer Account And Verification

Classify the Google Play developer account before any readiness claim:

```text
Play developer account: active | missing | blocked
Account type: organization | personal | unknown
Identity verification: verified | pending | blocked
D-U-N-S (organization): verified | pending | n/a
Developer page / public developer info: complete | incomplete
Payments profile: linked | missing
Production access: granted | gated by closed-testing requirement | unknown
```

Account-type guidance:

- Prefer an organization account when the founder wants a business developer name, plans paid apps or in-app purchases at scale, or wants to avoid personal-account testing gates. Organization accounts require D-U-N-S and legal-entity verification; start that paperwork early because it can take days to weeks.
- Personal accounts use the founder's verified identity and must complete Google's developer verification (legal name, address, ID document) before publishing.
- PERSONAL accounts must pass the closed-testing requirement before they can apply for production access: run a closed test with at least 12 testers opted in continuously for at least 14 days. This is a calendar gate, not a paperwork gate. Plan it into the launch timeline at kickoff — it sets the earliest possible production date for personal accounts. Verify the current tester count and duration in official Play docs at execution time; Google has changed these numbers before.
- Public developer page requirements (developer name, contact email, and for some account types address/phone shown on the store) are founder-visible decisions; do not fill them with placeholders.

If the account is missing, stop at a founder gate: the founder must create the account, pay the registration fee, and complete identity verification. An agent cannot do this for them. Record the blocker in `store/GOOGLE_PLAY_RELEASE.md` and `state/business-state.json` instead of proceeding on assumptions.

## App Record And Content Declarations

Package name is platform identity. It is immutable after app creation in Play Console — treat it with the same stickiness discipline as the Apple bundle ID in `apple-signing-release.md`: a stable reverse-DNS identifier owned by the founder, approved before the app record, RevenueCat mapping, push config, or deep links depend on it. The Android `applicationId` in the build must match the Play Console package name exactly.

Complete every Policy > App content task before claiming review readiness. The listing can be word-perfect and still unpublishable with App content tasks open. Cover:

- Privacy policy URL: active, public, non-geofenced, not a PDF, matching `privacy-terms.md` requirements.
- Ads declaration: whether the app shows ads, verified against the actual SDK list, not intent.
- App access: working reviewer instructions and demo credentials for any login, paywall, or restricted feature; test them on a clean install. "All features available without special access" is only valid when literally true.
- Content rating questionnaire (IARC): answer from real app content and UGC/chat/AI features, not the marketing pitch. An unanswered or stale questionnaire blocks publishing and can trigger removal.
- Target audience and children: declare honest age targets. Declaring or appealing to children pulls the app into Families policy with much stricter ads, data, and SDK rules — do not drift into it accidentally with childlike art or "all ages" claims.
- Data safety form: declare every data type collected or shared, by the app and its SDKs (analytics, crash, auth, payments, AI, push, support). Build it from the same data inventory used for Apple App Privacy. The Data safety answers MUST reconcile with the App Privacy answers in `privacy-terms.md` and `store/APPLE_APP_STORE_REQUIREMENTS.md`; the two stores must never contradict each other. A data type "collected" on iOS but "not collected" on Android for the same codebase is a reconciliation failure unless a platform-specific reason is documented.
- Account deletion: in-app path plus web URL when accounts can be created.
- Government apps, financial features, health, and news declarations where the category applies.

Never answer Data safety from generic policy text. Use the SDK list, backend schema, and vendor behavior, exactly as the App Privacy process in `store-console-workflow.md` requires.

## Play App Signing

Play App Signing is the default and effectively mandatory for new apps: Google holds the app signing key and signs what users download; the developer holds an upload key used only to sign artifacts sent to Play.

- Enroll in Play App Signing at app creation; let Google generate the app signing key unless the founder has a hard reason to provide one.
- Keep the upload keystore and its passwords out of the repo. Route them through `SECRETS.md` and the approved secret provider per [`secrets-management.md`](../operations/secrets-management.md). A committed keystore is a security incident, not a convenience.
- If the upload key is lost or compromised, there is an upload-key reset path through Play Console support — slow but recoverable. This is precisely why Play App Signing enrollment matters: without it, a lost signing key can strand the app permanently.
- Record key fingerprints (SHA-1/SHA-256 of the app signing key) in `store/GOOGLE_PLAY_RELEASE.md` when Firebase, Google Sign-In, App Links, or API restrictions need them.
- Upload Android App Bundles (`.aab`), not APKs. Play requires AABs for new apps; an APK build is engineering proof, not distribution readiness — the same distinction as a simulator build on iOS.

Founder approval is required before enrolling with a custom key, exporting key material, or requesting a key reset.

## Target API Level Policy

Google enforces a minimum target API level for new apps and app updates, and the requirement ratchets up roughly yearly with each Android release. Do not trust memory for the current number — check the official target SDK requirement page at release time and record the checked date. A build that compiled fine months ago can be unsubmittable today.

- Verify `targetSdkVersion` / `targetSdk` in the build against the current requirement before every upload, and again before any update after a long gap.
- Wear OS, Android TV, and Automotive variants have their own (usually lagging) requirements; check them separately if those form factors are in scope.
- Existing apps that fall too far behind the requirement become unavailable to new users on newer devices — staying current is an operations task, not a one-time check.
- Record the requirement, the build's target API, and the docs-checked date in `store/GOOGLE_PLAY_RELEASE.md` under "Target API Level".

## Release Tracks

Progress releases through tracks; do not jump to production:

1. Internal testing: up to 100 testers, near-instant availability, no review wait for most changes. Use it for first-upload proof, smoke tests, and `providers.google_play` validation ("Internal testing release or blocked reason recorded").
2. Closed testing: invite-only tracks with email lists or Google Groups. For PERSONAL accounts this is where the 12-testers-opted-in-for-14-continuous-days production gate runs — recruit real testers early, confirm they opt in, and monitor the continuous-day counter; testers dropping out can reset progress.
3. Open testing: public opt-in beta, listed on Play. Optional; use when the founder wants broader pre-launch feedback.
4. Production: full release. Founder-gated, always.

Production rollout discipline:

- Use staged rollout percentages (for example 10% → 25% → 50% → 100%) for production releases; record the percentage and promotion criteria in `store/GOOGLE_PLAY_RELEASE.md`.
- Know the halt path before starting: a staged rollout can be halted in Play Console when crash or ANR signals spike, then resumed or replaced with a fixed build. Record who watches the signals and where.
- The in-app updates API (immediate/flexible update prompts) is optional polish for post-launch hotfix delivery — note it as a backlog item, not a launch gate.

Record per-track state (version code, version name, release status, tester counts, dates) so the track history is auditable.

## Pre-Launch Report

Every upload to a testing track triggers an automatic Google crawl of the app on real devices. Read the pre-launch report instead of letting it rot:

- Review crashes, ANRs, performance issues, accessibility findings, and security/privacy warnings per device.
- Provide crawler credentials and deep links in Play Console when the app has a login, so the crawl reaches real screens instead of bouncing off the auth wall.
- Treat crashes, security warnings, and policy flags in the report as launch gates: fix or explicitly disposition each one in `store/GOOGLE_PLAY_RELEASE.md` before promotion to production. Accessibility and performance findings are triaged, not auto-blocking, but record the triage.
- Pair the report with the screenshot/device evidence rules in `store-console-workflow.md`; it is proof input, not a substitute for real device testing.

## Monetization Reconciliation

Load `revenue-monetization.md` before any Play Billing product, base plan, offer, or price work.

- Model subscriptions with Play's base plans and offers: one subscription product, base plans for billing periods, offers for intro pricing/free trials. Map every product ID, base plan ID, and offer ID to the RevenueCat product catalog and entitlements; the Play catalog, RevenueCat, the paywall, and the App Store products must tell one consistent price/trial/renewal story.
- Enable grace period and account hold for involuntary-churn recovery, and handle the recovery states through RevenueCat or the backend, per `billing-health-and-reactivation.md` §2. Confirm exact RTDN state names against current Play billing docs before implementing.
- Configure Real-time developer notifications (RTDN) so RevenueCat or the backend receives entitlement changes; record the topic/route in `revenue/REVENUE_OPS.md`.
- Price changes on live subscriptions have notice/consent mechanics that affect existing subscribers — founder approval and a doc refresh are required before any live price change.
- Do not mark Play monetization ready until product IDs, prices, trials, and cancellation/refund posture agree across Play Console, RevenueCat, `revenue/REVENUE_OPS.md`, the paywall, and the store listing.

## Review, Policy, And Appeals

Play review is mostly automated with human escalation; timelines range from hours to several days, longer for new accounts, sensitive categories, and apps with sensitive permissions. Budget review time into the launch plan instead of submitting the day of launch.

Common B2C rejection/removal causes to preempt:

- Data safety answers that mismatch observed SDK/network behavior — the most common silent killer; reconcile against the real data inventory.
- Broken or missing App access demo credentials, so review cannot reach the paywalled core.
- Metadata violations: ranking claims, price/promo spam, keyword stuffing, misleading icons or testimonials (see the listing rules in `store-console-workflow.md`).
- Incomplete App content declarations or a privacy policy URL that is dead, geofenced, or a PDF.
- Sensitive permissions (location in background, SMS, QUERY_ALL_PACKAGES) without an approved declaration.

Policy strikes accumulate against the developer account, and repeated or severe violations can terminate the account and all its apps — treat every rejection as account-level risk, not a per-app annoyance. If a rejection or removal is wrong, use the policy appeal route in Play Console with evidence; do not resubmit unchanged builds hoping for a different reviewer, and do not make policy-significant changes to dodge review. Appeals, resubmissions after rejection, and any communication with Google policy teams are founder-gated.

## Artifact Contract

Create `store/GOOGLE_PLAY_RELEASE.md` whenever Play distribution is in scope. Write these required sections. No validator checks these header strings today. Verify each one by hand before you mark the lane done.

- "Developer Account"
- "Data Safety"
- "Content Rating"
- "Play App Signing"
- "Target API Level"
- "Release Tracks"
- "Closed Testing"
- "Pre-Launch Report"

Done-status requirements — do not mark the artifact or the Play side of `lanes.store_console` done unless:

- the package name is recorded and matches the build's application ID
- the current release-track state is recorded (track, version code/name, status, dates)
- the Data safety reconciliation with `privacy-terms.md` and `store/APPLE_APP_STORE_REQUIREMENTS.md` is explicitly stated as consistent or the divergence is documented
- the personal-account 12-tester/14-day closed-testing gate is addressed with tester counts and dates, or the artifact states the account is an organization account and the gate does not apply

Also update `store/STORE_CONSOLE.md` and `store/store-console.html` with the Play click paths and paste values, `state/business-state.json` (`lanes.store_console`, `providers.google_play`, and lane blockers), `SECRETS.md` for the upload keystore and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, and `revenue/REVENUE_OPS.md` when Play Billing is in scope.

## Founder-Only Gates

Ask before:

- creating the developer account, paying the registration fee, or choosing personal vs organization
- identity, D-U-N-S, or developer-page verification submissions
- creating the app record or finalizing the immutable package name
- enrolling with a custom signing key, exporting key material, or requesting an upload-key reset
- storing the upload keystore, keystore passwords, or service-account JSON
- promoting to production, changing rollout percentage, halting or resuming a rollout
- submitting, appealing, or responding to policy actions
- creating or changing Play Billing products, base plans, offers, or prices

Safe without new approval when credentials are configured and the founder asked for Play work: read-only Play Console/API status, local build and target-API inventory, drafting `store/GOOGLE_PLAY_RELEASE.md` and the Play sections of `store/STORE_CONSOLE.md`, and internal-testing uploads when the founder approved the internal track.

## Anti-Patterns

- Treating Play as an afterthought clone of the App Store Connect packet — copying ASC metadata into Play fields without Play-specific declarations, Data safety, IARC, or track planning.
- Uploading an APK, or calling an APK build "store-ready", when Play requires an AAB.
- Data safety answers that contradict the iOS App Privacy labels for the same codebase, with no documented platform reason.
- Discovering the personal-account 12-tester/14-day closed-testing requirement the week of launch, after promising a production date it makes impossible.
- Shipping or updating with an old target API level days before (or after) the yearly deadline because the requirement was recalled from memory instead of checked.
- Going 0% → 100% in production with no staged rollout and no halt plan.
- Ignoring pre-launch report crashes or security warnings because "it worked on the emulator".
- Committing the upload keystore, keystore passwords, or service-account JSON to the repo.
- Marking `lanes.store_console` done for a "both stores" launch when only the Apple artifacts exist.

## Source Basis

Refresh official docs before account, declaration, signing, track, target-API, or policy instructions — Play policy moves fast and numbers (tester counts, day counts, API levels, fees) ratchet without notice. Per the repo's source-freshness doctrine, do not issue commands or readiness claims from memory; record the docs-checked date in `store/GOOGLE_PLAY_RELEASE.md`.

- Play Console overview: `https://play.google.com/console/about/`
- Play Console help center (policies, app content, Data safety, testing, pre-launch reports): `https://support.google.com/googleplay/android-developer`
- Current target API level requirement: `https://developer.android.com/google/play/requirements/target-sdk`
