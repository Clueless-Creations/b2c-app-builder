# Google Play Release

Status: partial until the package name, track state, declarations, and signing posture are recorded against the live Play Console — not assumed from the iOS packet.

Android distribution readiness for Google Play. This packet is the Play-side parity of `store/APPLE_SIGNING.md` + `store/APPLE_APP_STORE_REQUIREMENTS.md`; it must be reconciled with them, never copied from them. See `knowledge/store/google-play-release.md`.

## Developer Account

- Account type: organization | personal (record which — personal accounts carry the closed-testing production gate below).
- Identity verification state, developer page state, and payout profile state.
- Founder-only: account creation, registration fee, identity verification, payout details.

## App Record

- Package name (immutable after creation): `com.example.app`
- App access: full access or demo credentials for review (record the credentials route via `SECRETS.md`, never inline).
- Ads declaration: contains ads yes/no, matching the actual SDK list.

## Data Safety

- Data Safety form answers recorded here and reconciled with `trust/PRIVACY.md`, the App Store privacy labels in `store/APPLE_APP_STORE_REQUIREMENTS.md`, and the actual SDK/data behavior — the two stores must never contradict each other or the app.
- Account deletion: in-app path and web link recorded (required for apps with account creation).

| Data type | Collected | Shared | Purpose | Matches iOS label? |
| --- | --- | --- | --- | --- |

## Content Rating

- IARC content rating questionnaire completed; resulting rating recorded.
- Target audience and children declarations (Families policy) recorded; under-13 targeting is a compliance gate, not a growth option.

## Play App Signing

- Play App Signing enrollment (default for new apps): upload key vs app signing key recorded.
- Upload format: Android App Bundle (AAB) — APK-only routes are not accepted for new apps.
- Key loss/reset path documented; key reset is founder-gated.

## Target API Level

- Current Play target API requirement checked against official docs at release time (the requirement ratchets yearly — do not trust memory): record the requirement, the app's `targetSdkVersion`, and the deadline.

## Release Tracks

| Track | State | Build/version | Rollout % | Notes |
| --- | --- | --- | --- | --- |
| Internal testing | | | | up to 100 testers, instant |
| Closed testing | | | | the production gate for personal accounts |
| Open testing | | | | optional |
| Production | | | | staged rollout with halt path |

- Staged rollout plan and halt criteria (crash-free threshold from `operations/POST_LAUNCH_OPS.md`).

## Closed Testing

- Personal accounts: 12 testers opted in for 14 continuous days before production access can be requested — plan this into the launch calendar from day one; discovering it launch week slips the date by two-plus weeks.
- Organization accounts: record that the gate does not apply, then still run a closed test for the pre-launch report.
- Tester sourcing, opt-in link, and feedback channel recorded.

## Pre-Launch Report

- Pre-launch report reviewed on the testing track: crashes, performance, accessibility, and security warnings triaged; blockers resolved or explicitly accepted with reasons before production.

## Monetization Reconciliation

- Play Billing products/subscriptions (base plans + offers) reconciled with the RevenueCat catalog and `revenue/REVENUE_OPS.md` product table.
- Grace period / account hold enabled for involuntary-churn recovery per `knowledge/money/revenue-monetization.md`.

## Review And Policy

- Common rejection risks checked: Data Safety mismatch, broken demo access, metadata violations.
- Policy strike and appeal route recorded; appeals are founder-gated.
