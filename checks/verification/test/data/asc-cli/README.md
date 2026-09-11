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
| `metadata-push-dry-run-object.json` | `asc metadata push --dry-run --output json` | `internal/cli/metadata/execute_push.go` dry-run `PushPlanResult` plus `internal/cli/metadata/push.go` `PlanItem` / `PlanAPICall` | One high-level CLI object for the dry-run branch. Nested `adds` has two items, `updates` has two, and `deletes` has one. Empty `applied`, `actions`, `total`, `succeeded`, `failed`, `failureArtifactPath`, and `failureArtifactError` stay omitted. This is not Apple JSON:API. |
| `metadata-push-mistaken-jsonapi.json` | mistaken Apple JSON:API document | not an `asc metadata push` envelope                                                                                   | JSON:API `data`/`attributes` is not the CLI `PushPlanResult` object                                                           |
| `screenshots-download-object.json` | `asc screenshots download --version-localization … --output-dir … --output json` | `internal/cli/assets/assets_screenshots_download.go` `screenshotDownloadResult` / `screenshotDownloadItem` | One high-level CLI object for the successful localization-download branch. Nested `items` has one downloaded PNG. Empty `failures` stay omitted. This is not Apple JSON:API. |
| `screenshots-download-mistaken-jsonapi.json` | mistaken Apple JSON:API document | not an `asc screenshots download` envelope                                                                              | JSON:API `data`/`attributes` is not the CLI `screenshotDownloadResult` object                                             |

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

The metadata-push dry-run object follows `PushPlanResult` after
`ExecutePushWithWarnings` returns with `DryRun` set, matching
`TestMetadataPushDryRunBuildsPlanWithoutMutations` at 5.1.0. `appId` is the
cookbook `123456789` and `dir` is the cookbook path `./metadata`, not a live
capture. Nested `appInfoId` and `versionId` are synthetic. Default
`--include` is `localizations`. Nested `adds` has the version `keywords` add
and the `ja` description create. Nested `updates` has the app-info
`subtitle` diff and the version `description` diff. Nested `deletes` has the
remote `fr` name whose locale is missing locally. Empty `applied`, `actions`,
`total`, `succeeded`, `failed`, `failureArtifactPath`, and
`failureArtifactError` stay omitted because those fields are
`json:",omitempty"` and the dry-run branch does not apply. Nested app-info
`version` stays omitted because the app-info plan key has no version string.
Omitted local fields such as remote `marketingUrl` stay no-ops, matching
`TestMetadataPushDryRunOmittedFieldsDoNotPlanDeletes`. The live apply branch
is not this envelope.

The screenshots-download object follows `screenshotDownloadResult` after the
`--version-localization` branch records one successful download and assigns
`Items` / `Total` / `Downloaded` / `Failed`, matching the struct tags in
`assets_screenshots_download.go` at 5.1.0. `versionLocalizationId` is the
cookbook `LOC_ID` and `outputDir` is the cookbook path `./screenshots`, not a
live capture. Nested `displayType` is `APP_IPHONE_65`. Nested `outputPath`
joins the cleaned output directory with the display-type folder and the
`01_<id>_<fileName>` naming from that branch. `overwrite`, `unchanged`, and
nested `unchanged` stay encoded because those bool fields have no
`omitempty`. Empty `failures` stay omitted because the field is
`json:"failures,omitempty"`. Nested `url` is a synthetic example host, not a
live Apple CDN capture. The single-id download branch and the failure branch
are not this envelope.

Ids are synthetic. They are not live App Store Connect apps, versions, or
submissions. No host `asc` binary and no App Store Connect account were used to
produce these files.
