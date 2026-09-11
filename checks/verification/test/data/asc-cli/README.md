# Independent ASC CLI 5.1.0 native envelopes

These files are command-specific JSON shapes taken from the reviewed App Store
Connect CLI 5.1.0 source, not from the builder encoder or decoder under test.

Reviewed revision: `ca759a3b6ab88c8c39aed13325461248436615ca` (tag 5.1.0, 2026-09-08).

| File                                  | Native command                    | Upstream owner                                                                                                      | Establishes                                                                                                          |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `review-status-object.json`           | `asc review status --output json` | `internal/cli/reviews/review_overview.go` `reviewStatusResult` / `reviewVersionContext` / `reviewSubmissionContext` | One high-level CLI object. Nested `version` and `latestSubmission` use `id` and `state`. This is not Apple JSON:API. |
| `review-status-mistaken-jsonapi.json` | mistaken Apple JSON:API document  | not an `asc review status` envelope                                                                                 | JSON:API `data`/`attributes` must fail closed for the CLI decoder                                                    |

`reviewState` and `nextAction` for `WAITING_FOR_REVIEW` come from
`buildReviewStatusResult` in that same file. Empty `blockers` are omitted
because the field is `json:"blockers,omitempty"`.

Ids are synthetic. They are not live App Store Connect apps, versions, or
submissions. No host `asc` binary and no App Store Connect account were used to
produce these files.
