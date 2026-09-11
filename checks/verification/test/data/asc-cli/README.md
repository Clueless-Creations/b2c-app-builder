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
| `screenshots-sizes-object.json`      | `asc screenshots sizes --output json` | `internal/cli/assets/assets_screenshots.go` `focusedScreenshotSizeCatalog` plus `internal/asc/screenshot_sizes.go` `ScreenshotSizesResult` | One high-level CLI object for the default focused branch. `sizes` has `APP_IPHONE_65` then `APP_IPAD_PRO_3GEN_129`. Nested `family` is `APP`. This is not Apple JSON:API. |
| `screenshots-sizes-mistaken-jsonapi.json` | mistaken Apple JSON:API document | not an `asc screenshots sizes` envelope                                                                                | JSON:API `data`/`attributes` is not the CLI `ScreenshotSizesResult` object                                              |
| `screenshots-validate-object.json`  | `asc screenshots validate --output json` | `internal/cli/assets/assets_screenshots_validate.go` `screenshotValidateResult`                                      | One high-level CLI object for the ready branch. `displayType` is `APP_IPHONE_65`. Nested `files` has one `ok` PNG. Empty `issues` and `apiDisplayType` stay omitted. This is not Apple JSON:API. |
| `screenshots-validate-mistaken-jsonapi.json` | mistaken Apple JSON:API document | not an `asc screenshots validate` envelope                                                                              | JSON:API `data`/`attributes` is not the CLI `screenshotValidateResult` object                                             |
| `screenshots-upload-dry-run-object.json` | `asc screenshots upload --dry-run --output json` | `internal/cli/assets/assets_screenshots_upload.go` dry-run `would-upload` plus `internal/cli/assets/assets_screenshots_resume.go` `buildAppScreenshotUploadResult` plus `internal/asc/assets_output.go` `AppScreenshotUploadResult` | One high-level CLI object for the dry-run branch. Nested `results` has one `would-upload` PNG. Empty `uploaded`, `skipped`, `pending`, `failed`, `resumed`, `failures`, and `failureArtifactPath` stay omitted. Nested `assetId` is the empty string. This is not Apple JSON:API. |
| `screenshots-upload-mistaken-jsonapi.json` | mistaken Apple JSON:API document | not an `asc screenshots upload` envelope                                                                                | JSON:API `data`/`attributes` is not the CLI `AppScreenshotUploadResult` object                                              |

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

The screenshots-sizes object follows `ScreenshotSizesResult` after the default
branch of `AssetsScreenshotsSizesCommand` calls `focusedScreenshotSizeCatalog`,
matching `TestAssetsScreenshotsSizesCommandDefaultFocused` /
`TestAssetsScreenshotsSizesOutput` at 5.1.0. Nested dimensions follow
`iphone65Dimensions` and `ipadPro3Gen129Dimensions` from
`internal/screenshotcatalog/catalog.go`, sorted by width then height. `family`
is `APP` because both display types have the `APP_` prefix. The `--all`
catalog is not this envelope.

The screenshots-validate object follows `screenshotValidateResult` after
`validateScreenshotAssets` records one ready PNG for `APP_IPHONE_65`,
matching `TestRenderScreenshotValidateResultSkipsRedundantAPIDisplayTypeRow`
and the 1242x2688 files in
`TestValidateScreenshotAssetsSortsEntriesAndKeepsHiddenWarningsNonBlocking`
at 5.1.0. `path` is the cookbook path `./screenshots`, not a live capture.
`displayType` is `APP_IPHONE_65` because `normalizeScreenshotDisplayType`
prefixes ShortUsage `IPHONE_65`. `apiDisplayType` stays omitted because
`CanonicalScreenshotDisplayTypeForAPI` returns the same value. Empty
`issues` stay omitted because the field is `json:"issues,omitempty"`. Nested
file `hidden` stays omitted because it is false.

The screenshots-upload dry-run object follows `AppScreenshotUploadResult` after
`uploadScreenshotsWithConfig` records one `would-upload` item and
`buildAppScreenshotUploadResult` calls `finalizeAppScreenshotUploadResult`,
matching `TestUploadScreenshotsDryRunReportsWouldUpload` at 5.1.0.
`versionLocalizationId` is the cookbook `LOC_ID`, not a live capture.
`displayType` is `APP_IPHONE_65` because `normalizeScreenshotDisplayType`
prefixes ShortUsage `IPHONE_65`. `filePath` joins the cookbook path
`./screenshots` with the dry-run test file `01-home.png`. Nested `assetId`
is encoded as `""` because the field has no `omitempty` and the dry-run
branch leaves it empty. `uploaded` stays 0, so it is omitted. `total` is 1
because `finalizeAppScreenshotUploadResult` sets it from `len(results)`
when `Total` is still 0. Empty `resumed`, `skipped`, `pending`, `failed`,
`failures`, and `failureArtifactPath` stay omitted because those fields
are `json:",omitempty"`. The live upload branch is not this envelope.

Ids are synthetic. They are not live App Store Connect apps, versions, or
submissions. No host `asc` binary and no App Store Connect account were used to
produce these files.
