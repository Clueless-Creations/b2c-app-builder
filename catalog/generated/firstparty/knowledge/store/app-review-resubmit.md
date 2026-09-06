# App Review Resubmit

Part of the [ASO And Store Operations](./aso-store-ops.md) hub.

Use this after bounded remediation is verified.
This file covers capped resubmission only.

Load `app-review-observe.md` first.
Load `app-review-remediate.md` first.
Load `app-store-connect-cli.md` before any `asc` command.

## Contents

- 1. Bound
- 2. Standing Envelope
- 3. Same-Build Submit
- 4. Timeout Readback
- 5. Linked Cycles
- 6. Cycle Cap
- 7. Outputs
- 8. Failure Modes

## 1. Bound

Resubmission may call `asc review submit --confirm`.
It may poll App Store Connect after that call.

It must not call `asc publish appstore --submit`.
It must not call `asc web agreements accept`.
It must not call `asc webhooks serve`.
It must not upload a new binary.
It must not infer approval from a verified fix.

An observe mandate still refuses `asc review submit`.

## 2. Standing Envelope

The envelope names:

- the exact app ID
- the exact App Store version ID
- the marketing version
- the cycle cap
- already-uploaded proof
- founder identity
- authorization time
- `--confirm`

A multiplier is not approval.
A verified consumer patch is not approval.

The envelope must match the live mandate and the current app-version layer.
A mismatch refuses the submit.

Probe `asc review submit --help` before the first live call.
Fail closed when the command shape changes.

## 3. Same-Build Submit

Metadata and review-notes routes reuse the processed build.
They call `asc review submit` with `--confirm`.
They do not upload.

A new-binary route still needs the inspected archive identity.
It also needs already-uploaded proof.
This phase does not upload.

Record the exact command on `run/app-review.json`.
Do not write that command into `store/APP_REVIEW.md`.

## 4. Timeout Readback

After submit, poll App Store Connect.
Do not treat the CLI success text as layer truth.

If the timeout passes with no new provider state:

1. Record a timeout readback.
2. Poll App Store Connect.
3. Do not submit again from that timeout.

A later waiting-for-review snapshot confirms the earlier submit.
A later rejection opens the next cycle.

## 5. Linked Cycles

A second rejection creates a new linked case.
The parent case ID stays on the new case.
The cycle number increases by one.

Do not reset prior evidence.
Do not reuse the previous occurrence as the new cycle.

## 6. Cycle Cap

The default cap is three cycles.
The envelope may set a higher integer cap.

When the next cycle would pass the cap:

- park the case
- ask the founder
- emit no more submits

`PENDING_DEVELOPER_RELEASE` still needs a separate founder yes.
Do not treat it as public release.

## 7. Outputs

Write the resubmission record onto `run/app-review.json`.
Project founder language into `store/APP_REVIEW.md`.
Keep reviewer text fingerprinted.
Never emit `asc review submit` in the founder file.

## 8. Failure Modes

- Submit from an observe mandate
- Submit without `--confirm`
- Submit when the build is not already uploaded
- Submit a protected-policy case
- Submit after the timeout without readback
- Reauthorize while a submit is awaiting readback
- Submit after the standing envelope fingerprint drifts
- Submit after the authorization timestamp drifts
- Publish from this phase
- Accept Apple agreements from this phase
- Treat developer release as closed
- Mark accepted without an accepted Apple layer
