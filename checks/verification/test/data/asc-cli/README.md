# Independent ASC CLI 5.1.0 native envelopes

These files are command-specific JSON shapes taken from the reviewed App Store
Connect CLI 5.1.0 source, not from the builder encoder or decoder under test.

Reviewed revision: `ca759a3b6ab88c8c39aed13325461248436615ca` (tag 5.1.0, 2026-09-08).

| File                                  | Native command                    | Upstream owner                                                                                                      | Establishes                                                                                                          |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `review-status-object.json`           | `asc review status --output json` | `internal/cli/reviews/review_overview.go` `reviewStatusResult` / `reviewVersionContext` / `reviewSubmissionContext` | One high-level CLI object. Nested `version` and `latestSubmission` use `id` and `state`. This is not Apple JSON:API. |
| `review-status-mistaken-jsonapi.json` | mistaken Apple JSON:API document  | not an `asc review status` envelope                                                                                 | JSON:API `data`/`attributes` must fail closed for the CLI decoder                                                    |
| `review-submit-dry-run-object.json`   | `asc review submit --dry-run --output json` | `internal/cli/reviews/review_submit.go` `reviewSubmitResult` plus `internal/cli/submit/submit_flow.go` `BuildAttachmentResult` | One high-level CLI object for the dry-run branch. `version` is a string. `wouldSubmit` and `buildAttachment.wouldAttach` are true. This is not Apple JSON:API. |
| `review-submit-mistaken-jsonapi.json` | mistaken Apple JSON:API document  | not an `asc review submit` envelope                                                                                 | JSON:API `data`/`attributes` is not the CLI `reviewSubmitResult` object                                               |
| `metadata-validate-object.json`       | `asc metadata validate --output json` | `internal/cli/metadata/validate.go` `ValidateResult`                                                                | One high-level CLI object for the offline valid branch. `issues` is an empty array from `make([]ValidateIssue, 0)`. Nested `ValidateIssue` `locale`, `version`, `length`, and `limit` stay omitted because no issue is present. This is not Apple JSON:API. |
| `metadata-validate-mistaken-jsonapi.json` | mistaken Apple JSON:API document | not an `asc metadata validate` envelope                                                                              | JSON:API `data`/`attributes` is not the CLI `ValidateResult` object                                                    |

`reviewState` and `nextAction` for `WAITING_FOR_REVIEW` come from
`buildReviewStatusResult` in that same file. Empty `blockers` are omitted
because the field is `json:"blockers,omitempty"`.

The dry-run submit object follows `reviewSubmitResult` after
`SubmitResolvedVersion` returns with `DryRun` set. Empty `submissionId`,
`submittedDate`, `alreadySubmitted`, and `messages` stay omitted because those
fields are `json:",omitempty"`. The nested attachment follows the dry-run
`EnsureBuildAttached` branch: `wouldAttach` is true, and empty `currentBuildId`,
`attached`, and `alreadyAttached` stay omitted.

The metadata-validate object follows `ValidateResult` after `validateDir`
scans two localization files and records no issues, matching
`TestValidateDirTreatsDefaultLocaleCaseInsensitively` /
`TestValidateDirAcceptsValidURLSyntax` at 5.1.0. `issues` is encoded as `[]`
because `validateDirWithOptions` initializes it with `make([]ValidateIssue, 0)`.
`errorCount` and `warningCount` stay 0, so `valid` is true. `dir` is the
cookbook path `./metadata`, not a live capture.

Ids are synthetic. They are not live App Store Connect apps, versions, or
submissions. No host `asc` binary and no App Store Connect account were used to
produce these files.
