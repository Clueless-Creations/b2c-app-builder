# App Review Remediate

Part of the [ASO And Store Operations](./aso-store-ops.md) hub.

Use this after App Review observe classifies a case.
This file covers bounded remediation only.
Do not submit. Do not upload. Do not accept agreements.

Load `app-review-observe.md` first.
Load `app-store-connect-cli.md` before any `asc` command.

## Contents

- 1. Bound
- 2. Plan Routes
- 3. Consumer Repository
- 4. Verification Recovery
- 5. Archive Inspection
- 6. Protected Park
- 7. Outputs
- 8. Failure Modes

## 1. Bound

Bounded remediation may change consumer-repo files.
It may inspect a new archive.
It may record independent verification.

It must not call `asc review submit`.
It must not call `asc publish appstore --submit`.
It must not call `asc metadata push` without `--dry-run`.
It must not call `asc web agreements accept`.

Load `app-review-resubmit.md` after independent verification.

A signed webhook is still a wake-up only.
Poll App Store Connect for layer truth.

## 2. Plan Routes

Build one plan from the classified kind.

- `metadata_rejected` uses `same_build_metadata`. Reuse the processed build.
- `invalid_binary` uses `new_binary`. Build identity from the mandate and the consumer project. Create and inspect a new archive.
- `missing_review_information` uses `review_notes`. Do not rebuild.
- `login_review_access` uses `review_access`. Do not store credentials.
- `legal_policy`, `product_scope_disagreement`, `privacy_data_disclosure`, `payments_subscriptions`, and `unclear_conflicting` park.

The plan names:

- the route
- affected consumer paths
- tests and validators
- whether a new binary is required
- rollback
- authorization for every external mutation

Do not guess an unclear case.

## 3. Consumer Repository

Apply patches only inside the consumer workspace.
Reject path traversal.
A create patch must not replace a file that already exists.
Do not overwrite the listing packet with a placeholder.
Do not write App Store credentials.
Do not put consumer app behavior into B2C App Builder.

Metadata repair must pass `asc metadata validate`.
It must then pass `asc metadata push --dry-run`.
A failed preflight stays in the same occurrence.
It does not submit.

## 4. Verification Recovery

The producer session must not accept its own work.
Record the producer session id when the patch is applied.
Compare the verifier id to that stored id after trim.
A space difference must not pass the independence check.
A verifier rejection opens a new attempt.
A later replan must reuse that opened attempt.
It does not increment the attempt number again.
It does not park forever.
It does not submit.

Link the case to `workflow.store.app-review-remediate`.
Keep one occurrence per case cycle.
Append attempt ids.

## 5. Archive Inspection

A binary case must inspect a new `.xcarchive`.
Read the compiled `Info.plist`.
Parse XML and binary property lists.
Record bundle id, version, build, and SHA-256.
Refuse an archive whose hash matches the previous artifact.
Do not upload.
Do not treat source metadata as archive proof.

## 6. Protected Park

Park legal, privacy-promise, payments, product-scope, and unclear cases.
Do not apply consumer patches.
Do not inspect an archive.
Ask the founder.

## 7. Outputs

Write the plan onto `run/app-review.json`.
Project founder language into `store/APP_REVIEW.md`.
Keep reviewer text fingerprinted.
Never emit a submit command.

## 8. Failure Modes

- Submitting from this phase
- Reusing an old archive as binary proof
- Skipping metadata validate or dry-run
- Letting the producer accept its own fix
- Treating `session` and `session ` as independent sessions
- Opening a third attempt when a replan follows verifier rejection
- Replacing an existing listing file with a create placeholder
- Writing fixture bundle id, version, or build into a real app
- Implementing a protected case
- Copying webhook `newValue` into Apple layers
