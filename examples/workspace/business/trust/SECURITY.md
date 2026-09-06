# Security Release Plan

Status: partial until the app, backend, store, and provider evidence is verified against this plan.

## Source Basis

- OWASP MASVS and MASTG for mobile app controls.
- OWASP ASVS for web funnel, backend, and API controls.
- Apple Platform Security, Keychain data protection, App Transport Security, DeviceCheck, and App Attest documentation for iOS.
- Android security best practices, Android Keystore, Network Security Config, and Play Integrity documentation for Android.
- Claude Security, Codex Security, local security skills, MobSF, and community scanners as review routes; paid or account-gated routes require founder approval before replacing them with free fallbacks.

## Security Review Tool Routing

| Route | Status | Use | Founder Approval | Free Fallback |
| --- | --- | --- | --- | --- |
| Claude Security | blocked until approved | semantic code review and targeted patch PRs | account access and repo authorization | local `security-threat-model` plus code review |
| Codex Security | blocked until approved | threat-model-backed vulnerability scan and validated patches | workspace/RBAC access and repo authorization | local `security-best-practices` plus manual tests |
| GitHub Advanced Security / Snyk / Semgrep / Socket | optional | dependency, secret, SAST, and supply-chain review | paid account or organization enablement | `npm audit`, `osv-scanner`, `semgrep`, `gitleaks`, `trufflehog` |
| MobSF | optional | mobile static and dynamic analysis for APK/IPA/source | cloud account if using hosted scanning | local Docker MobSF |

## Threat Model

### Assets

- User account identifiers, profile data, onboarding answers, attribution source, analytics IDs, and support emails.
- Purchase state, RevenueCat entitlement IDs, Stripe customer IDs, App Store / Google Play transaction identifiers, refunds, restores, and promo grants.
- API keys, webhook signing secrets, push credentials, App Store Connect keys, Google Play service account credentials, CI/deploy tokens, and signing material.
- Mobile app binaries, source code, build artifacts, screenshots, public web funnel, legal pages, email templates, and analytics dashboards.

### Trust Boundaries

- Mobile client to backend API.
- Mobile client to RevenueCat, App Store, Google Play, PostHog, Sentry, Resend, and push services.
- Backend API to database/storage, payment webhooks, email webhooks, analytics ingestion, and admin/support tools.
- Public web funnel to backend waitlist, checkout, analytics, email, and support routes.
- CI/build/release environment to app signing, store upload, and provider CLIs.

### Attacker Capabilities

- Anonymous user can inspect public pages, reverse engineer client bundles, automate signup/waitlist/onboarding, tamper with client events, and replay network requests.
- Authenticated user can attempt horizontal access, entitlement spoofing, refund/restore abuse, support/social engineering, and privacy/delete workflow abuse.
- Malicious client can run on rooted/jailbroken/tampered environments, modify local storage, bypass UI gates, and call APIs directly.
- Supply-chain attacker can target dependencies, build scripts, SDKs, CI secrets, store signing material, and generated agent/tool configs.

## Data Classification

| Class | Examples | Storage | Logging |
| --- | --- | --- | --- |
| Public | landing copy, store metadata, docs | repository or CDN | allowed |
| User personal data | email, profile, attribution, onboarding answers | backend profile with retention/deletion path | no raw values in debug logs |
| Purchase data | entitlement state, transaction IDs, customer IDs | RevenueCat/backend only | IDs allowed, receipts masked |
| Secrets/signing | API keys, webhook secrets, p8/p12, service accounts | Doppler or approved provider | never log or commit |

## Mobile Hardening

### iOS

- Store tokens and sensitive per-user values in Keychain with the least-permissive accessibility class that still supports the feature.
- Keep App Transport Security enabled; document any exception with domain, owner, reason, and review date.
- Use App Attest or DeviceCheck for high-value backend actions when fraud or entitlement abuse risk is material.
- Review entitlements, associated domains, URL schemes, app groups, keychain access groups, push, iCloud, health, camera, location, and photo permissions against actual V1 scope.
- Confirm release signing, provisioning, archive/export/upload, and TestFlight gates in `store/APPLE_SIGNING.md`; simulator success is not security or distribution evidence.

### Android

- Store tokens and sensitive values with Android Keystore or platform-supported encrypted storage.
- Use a Network Security Config that disallows cleartext production traffic unless a documented local/debug exception exists.
- Use Play Integrity for high-value backend actions when fraud, abuse, entitlement spoofing, or tampered-client risk is material; enforce in tiers after telemetry shows impact.
- Review exported activities, services, receivers, providers, intent filters, deep links, backup rules, permissions, and signing configs.
- Confirm App Bundle signing, Play Console declarations, Data safety, and internal testing evidence in store docs.

## Authentication And Authorization

- Define anonymous, authenticated, subscriber, admin/support, and deleted-account states in `engineering/TECH_SPEC.md`.
- Enforce authorization on the backend or database policy layer; client UI checks are not access control.
- For Supabase/Postgres, RLS policies must be explicit, tested with positive and negative users, and checked for service-role leakage.
- Account deletion, logout, reset, and anonymous-to-identified stitching must preserve privacy and attribution rules.

## Backend And API Controls

- Validate request shape at every public API/RPC boundary.
- Apply rate limits to signup, login, attribution, checkout, restore, support, deletion, waitlist, and email-triggering routes.
- Use idempotency keys for purchase, support, deletion, entitlement grant, webhook, and email-send flows.
- Verify webhook signatures for RevenueCat, Stripe, Resend, store notifications, and any provider that mutates user state.
- Keep admin/support tools behind authenticated, least-privilege access with audit logs.

## Revenue, Entitlements, And Abuse

- RevenueCat is the entitlement source of truth unless the app records a different approved model.
- Stripe web checkout must project to the same entitlement contract as app-store purchases.
- Restore purchases must prove entitlement in app, RevenueCat, and backend/profile when backend identity exists.
- Promo grants and support-granted entitlements require owner, reason, expiry when applicable, audit log, and rollback path.
- Webhooks must verify signature, handle replay/idempotency, tolerate retries, and avoid granting access from client-only events.

## Privacy And Analytics

- `trust/PRIVACY.md`, App Privacy, Google Play Data safety, `analytics/ANALYTICS.md`, and `trust/SECURITY.md` must describe the same data behavior.
- PostHog session replay, surveys, and feature flags require masking, sampling, consent or opt-out posture, and store-disclosure review.
- Sentry must scrub PII, include PII scrubbing in configuration evidence, tag release/environment, and route alerts before release health is called ready.
- Self-reported attribution uses stable keys, `other` free text handling, PostHog person properties, backend/profile persistence, and anonymous-to-identified reconciliation.

## Email And Domain Security

- Resend or equivalent sender domains need SPF, DKIM, DMARC, sender identity, unsubscribe/preference handling, and webhook signature verification.
- Support, privacy, and security email aliases must route and be tested from an external sender.
- Public web funnels should publish `.well-known/security.txt` or an equivalent vulnerability-reporting route when accounts, payments, user content, or sensitive data exist.
- Security headers should be checked for public web surfaces: HTTPS, HSTS only when deliberately approved, CSP where practical, frame protections, referrer policy, and permissions policy.

## Supply Chain And Build Security

- Dependency review covers app, backend, web, scripts, and generated builder outputs.
- SDK inventory maps analytics, ads, attribution, payments, email, crash, AI, storage, and store SDKs to privacy/store disclosures.
- Run a secret scan before commit and release.
- Commit lockfiles for reproducible installs where the stack supports them.
- Signing material, service-account JSON, `.p8`, `.p12`, `.mobileprovision`, `.env`, OAuth refresh tokens, and raw provider keys are never committed.
- CI/build commands that need secrets run through Doppler or the approved provider.

## Monitoring And Incident Response

- Sentry or an approved equivalent captures mobile and web errors, release health, performance, and alert routing.
- Store crash reports, Play Console pre-launch reports, TestFlight feedback, support inbox, and PostHog funnels feed weekly review.
- Define incident owner, support response path, app rollback/kill-switch path, provider status checks, and customer communication draft.
- Keep a responsible disclosure route through `security@domain` or `.well-known/security.txt` when public users can create accounts, pay, or upload sensitive data.

## Release Checks

- `npm run check:security -- --root .` or the installed-skill equivalent passes.
- `npm run check:secrets -- --root .` passes.
- Mobile build is tested with mocks disabled and no server-only secrets in public bundles.
- RevenueCat/Stripe restore and entitlement paths are verified when monetized.
- Webhook signature, idempotency, and retry behavior are verified where state changes occur.
- MobSF, SAST, dependency, or manual security-review evidence is attached or explicitly blocked with founder-approved route.
- `trust/security-review.html` renders the threat model, tool routing, platform checklist, open risks, and release checks for founder review.

## Accepted Risks

Accepted risks must list owner, reason, expiry or revisit date, compensating control, and evidence. Do not close a security failure by saying it is noted.

## Founder Approval Gates

- Enabling paid security tools, hosted scanners, organization-level GitHub security features, or commercial app-integrity services.
- Connecting repositories to Claude Security, Codex Security, GitHub Advanced Security, Snyk, Semgrep Cloud, Socket, MobSF Cloud, or similar services.
- Publishing security contact details, security.txt, incident statements, or vulnerability disclosure language.
- Enforcing App Attest, DeviceCheck, or Play Integrity in a way that can block real users.
