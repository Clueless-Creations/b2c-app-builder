# Provider Proof

Use this reference before marking analytics, revenue, email, store, security, or engineering lanes done.

`operations/PROVIDER_PROOF.md` is the live-evidence ledger. It separates planned provider setup from proof that the provider actually worked.

## Required Providers

For most B2C mobile launches, the proof ledger should cover:

- PostHog event and person-property evidence.
- RevenueCat offering, package, sandbox purchase, restore, and entitlement evidence.
- Resend domain/DNS and test-send evidence when email is in scope.
- App Store Connect app record, metadata, screenshot, TestFlight, or review-state evidence when store ops are in scope.
- Sentry event, release, or alert evidence when production readiness or security is in scope.
- MobAI or equivalent mobile E2E proof for target-user flows.
- Doppler runtime injection proof when secrets are in scope.

## Rules

- Planned setup is not proof.
- Unit tests are not provider proof unless paired with provider-side evidence.
- Do not store secrets, raw tokens, private account screenshots, `.p8`, `.p12`, `.mobileprovision`, or credential screenshots.
- If access is founder-only, record the gate and keep the lane partial or blocked.
- Run `check:provider-proof` before any provider-backed readiness claim.

## Minimum Ledger Shape

Use `business/operations/PROVIDER_PROOF.md` as the starter. Each row needs:

- provider name
- current status
- proof command or inspection route
- evidence path
- founder-only gate, if any

Once a provider-backed lane is marked done, `check:provider-proof` grounds its ledger row in reality: the row must exist, its current status must read as captured evidence (not still-planned "needs ..." work), and at least one file named anywhere in the row must exist on disk. Writing the right words into the ledger without running the capture fails the gate. Backtick-quote evidence paths that contain spaces; literal pipes in the proof-command cell are fine (the whole row is scanned, not a column position).
