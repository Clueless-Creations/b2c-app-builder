/**
 * Apple ASC observe / non-observe mapping and independent cookbook samples (#113).
 *
 * Reuses the observe command list, apple-asc.yaml, rork unsupported operations, and the
 * verified command cookbook (local --help, 2026-09-08). Does not live-call `asc`.
 * Screenshot upload maps to the Apple store-media standing envelope (#38). TestFlight
 * beta distribution maps to the Apple TestFlight standing envelope. The independent
 * review-status response envelope is the 5.1.0 CLI `reviewStatusResult` object.
 * The independent review-submit response envelope is the 5.1.0 CLI
 * `reviewSubmitResult` dry-run object. The independent metadata-validate
 * response envelope is the 5.1.0 CLI `ValidateResult` object. The independent
 * screenshots-sizes response envelope is the 5.1.0 CLI `ScreenshotSizesResult`
 * default focused object. The independent screenshots-validate response
 * envelope is the 5.1.0 CLI `screenshotValidateResult` ready object. The independent
 * screenshots-upload response envelope is the 5.1.0 CLI `AppScreenshotUploadResult`
 * dry-run object. The independent metadata-push response envelope is the 5.1.0 CLI
 * `PushPlanResult` dry-run object. `asc review submit`
 * maps to `workflow.store.app-review-resubmit`. `asc testflight feedback list` and
 * `asc testflight crashes list` map to
 * `workflow.store.apple-testflight-standing-envelope`. Adapter-built resubmit argv and canned
 * live-provider snapshots are not independent evidence.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  adapterGeneratedMentions,
  describeConformanceCoverage,
  isIndependentEvidence,
  type ProviderConformanceProvenance,
} from "../../../catalog/providers/conformance.js";
import {
  ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS,
  APP_REVIEW_CAPABILITY_IDS,
  APP_REVIEW_REMEDIATE_WORKFLOW_ID,
  APP_REVIEW_RESUBMIT_WORKFLOW_ID,
  OBSERVE_APP_REVIEW_COMMANDS,
} from "../../../adapters/app-review/types.js";
import { commandIsForbiddenForAppReview } from "../../../adapters/app-review/mandate.js";
import { AscProviderReadError, createAscAppReviewProvider, type AscCommandRunner } from "../../../adapters/app-review/asc-provider.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const COOKBOOK = path.join(skillRoot, "knowledge/store/app-store-connect-cli.md");
const APPLE_ASC = path.join(skillRoot, "catalog/providers/apple-asc.yaml");
const RORK = path.join(skillRoot, "catalog/upstreams/rork-app-store-connect-cli.yaml");
const RESUBMIT = path.join(skillRoot, "adapters/app-review/resubmit.ts");
const REMEDIATE_PLAN = path.join(skillRoot, "adapters/app-review/plan.ts");
const BUILD_RELEASE = path.join(skillRoot, "catalog/workflows/build-release.ts");
const APP_REVIEW_FIXTURES = path.join(skillRoot, "checks/verification/fixtures/app-review.fixtures.ts");
const ASC_CLI_NATIVE_DIR = path.join(skillRoot, "checks/verification/test/data/asc-cli");
const RORK_REVIEWED_VERSION = "5.1.0";
const RORK_REVIEWED_REVISION = "ca759a3b6ab88c8c39aed13325461248436615ca";
const COOKBOOK_SOURCE = "knowledge/store/app-store-connect-cli.md Verified Command Cookbook (local --help, 2026-09-08)";
const REVIEW_STATUS_SOURCE = "rork-app-store-connect-cli 5.1.0 internal/cli/reviews/review_overview.go reviewStatusResult";
const REVIEW_SUBMIT_SOURCE =
  "rork-app-store-connect-cli 5.1.0 internal/cli/reviews/review_submit.go reviewSubmitResult / internal/cli/submit/submit_flow.go BuildAttachmentResult";
const METADATA_VALIDATE_SOURCE = "rork-app-store-connect-cli 5.1.0 internal/cli/metadata/validate.go ValidateResult";
const SCREENSHOTS_SIZES_SOURCE =
  "rork-app-store-connect-cli 5.1.0 internal/cli/assets/assets_screenshots.go focusedScreenshotSizeCatalog / internal/asc/screenshot_sizes.go ScreenshotSizesResult";
const SCREENSHOTS_VALIDATE_SOURCE =
  "rork-app-store-connect-cli 5.1.0 internal/cli/assets/assets_screenshots_validate.go screenshotValidateResult";
const SCREENSHOTS_UPLOAD_SOURCE =
  "rork-app-store-connect-cli 5.1.0 internal/cli/assets/assets_screenshots_upload.go dry-run would-upload / internal/cli/assets/assets_screenshots_resume.go buildAppScreenshotUploadResult / internal/asc/assets_output.go AppScreenshotUploadResult";
const METADATA_PUSH_SOURCE =
  "rork-app-store-connect-cli 5.1.0 internal/cli/metadata/execute_push.go dry-run PushPlanResult / internal/cli/metadata/push.go PlanItem PlanAPICall";
const APPLE_STORE_MEDIA_STANDING_ENVELOPE = "workflow.store.apple-store-media-standing-envelope";
const REVIEW_STATUS_OBJECT_KEYS = ["appId", "version", "reviewDetailConfigured", "reviewDetailId", "latestSubmission", "reviewState", "nextAction"] as const;
const REVIEW_VERSION_KEYS = ["id", "version", "platform", "state", "createdDate"] as const;
const REVIEW_SUBMISSION_KEYS = ["id", "state", "platform", "submittedDate"] as const;
const REVIEW_SUBMIT_OBJECT_KEYS = ["appId", "version", "versionId", "buildId", "platform", "dryRun", "wouldSubmit", "buildAttachment"] as const;
const REVIEW_SUBMIT_ATTACHMENT_KEYS = ["versionId", "buildId", "wouldAttach"] as const;
const REVIEW_SUBMIT_OMITTED_KEYS = ["submissionId", "submittedDate", "alreadySubmitted", "messages"] as const;
const REVIEW_SUBMIT_ATTACHMENT_OMITTED_KEYS = ["currentBuildId", "attached", "alreadyAttached"] as const;
const METADATA_VALIDATE_OBJECT_KEYS = ["dir", "filesScanned", "issues", "errorCount", "warningCount", "valid"] as const;
const METADATA_VALIDATE_ISSUE_OMITTED_KEYS = ["locale", "version", "length", "limit"] as const;
const SCREENSHOTS_SIZES_OBJECT_KEYS = ["sizes"] as const;
const SCREENSHOTS_SIZE_ENTRY_KEYS = ["displayType", "family", "dimensions"] as const;
const SCREENSHOTS_SIZE_DIMENSION_KEYS = ["width", "height"] as const;
const SCREENSHOTS_SIZES_FOCUSED_TYPES = ["APP_IPHONE_65", "APP_IPAD_PRO_3GEN_129"] as const;
const SCREENSHOTS_SIZES_IPHONE_65_DIMENSIONS = [
  { width: 1242, height: 2688 },
  { width: 1284, height: 2778 },
  { width: 2688, height: 1242 },
  { width: 2778, height: 1284 },
] as const;
const SCREENSHOTS_SIZES_IPAD_PRO_3GEN_129_DIMENSIONS = [
  { width: 2048, height: 2732 },
  { width: 2064, height: 2752 },
  { width: 2732, height: 2048 },
  { width: 2752, height: 2064 },
] as const;
const SCREENSHOTS_VALIDATE_OBJECT_KEYS = ["path", "displayType", "totalFiles", "readyFiles", "errorCount", "warningCount", "files"] as const;
const SCREENSHOTS_VALIDATE_FILE_KEYS = ["order", "filePath", "fileName", "width", "height", "status"] as const;
const SCREENSHOTS_VALIDATE_OMITTED_KEYS = ["apiDisplayType", "issues"] as const;
const SCREENSHOTS_VALIDATE_FILE_OMITTED_KEYS = ["hidden"] as const;
const SCREENSHOTS_VALIDATE_ISSUE_OMITTED_KEYS = ["code", "severity", "filePath", "fileName", "duplicateOf", "match", "message", "remediation"] as const;
const SCREENSHOTS_UPLOAD_OBJECT_KEYS = ["versionLocalizationId", "setId", "displayType", "dryRun", "total", "results"] as const;
const SCREENSHOTS_UPLOAD_RESULT_KEYS = ["fileName", "filePath", "assetId", "state"] as const;
const SCREENSHOTS_UPLOAD_OMITTED_KEYS = ["resumed", "uploaded", "skipped", "pending", "failed", "failureArtifactPath", "failures"] as const;
const SCREENSHOTS_UPLOAD_RESULT_OMITTED_KEYS = ["skipped"] as const;
const METADATA_PUSH_OBJECT_KEYS = ["appId", "appInfoId", "version", "versionId", "dir", "dryRun", "includes", "adds", "updates", "deletes", "apiCalls"] as const;
const METADATA_PUSH_OMITTED_KEYS = ["applied", "actions", "total", "succeeded", "failed", "failureArtifactPath", "failureArtifactError"] as const;
const METADATA_PUSH_PLAN_ITEM_KEYS = ["key", "scope", "locale", "field", "reason"] as const;
const METADATA_PUSH_ADD_OMITTED_KEYS = ["from"] as const;
const METADATA_PUSH_APP_INFO_OMITTED_KEYS = ["version"] as const;
const METADATA_PUSH_DELETE_OMITTED_KEYS = ["to"] as const;
const METADATA_PUSH_API_CALL_KEYS = ["operation", "scope", "count"] as const;
const METADATA_PUSH_ADD_KEYS = ["version:1.2.3:en-US:keywords", "version:1.2.3:ja:description"] as const;
const METADATA_PUSH_UPDATE_KEYS = ["app-info:en-US:subtitle", "version:1.2.3:en-US:description"] as const;
const METADATA_PUSH_DELETE_KEYS = ["app-info:fr:name"] as const;
const METADATA_PUSH_API_CALLS = [
  { operation: "delete_localization", scope: "app-info", count: 1 },
  { operation: "update_localization", scope: "app-info", count: 1 },
  { operation: "create_localization", scope: "version", count: 1 },
  { operation: "update_localization", scope: "version", count: 1 },
] as const;

type SemanticFit = "exact" | "partial" | "none";
type MappingEffect = "read" | "mutation" | "publish" | "credential";
type MappingDisposition = "implement" | "extension" | "defer" | "reject";

interface AscNativeMappingRow {
  readonly nativeCapability: string;
  readonly canonicalOperation: string | "none";
  readonly semanticFit: SemanticFit;
  readonly effects: MappingEffect;
  readonly disposition: MappingDisposition;
  readonly owner: string;
}

/** Native → canonical rows for the App Review lane plus named non-observe holds. */
const ASC_NATIVE_MAPPING: readonly AscNativeMappingRow[] = [
  {
    nativeCapability: "asc review status",
    canonicalOperation: "workflow.store.app-review-observe",
    semanticFit: "exact",
    effects: "read",
    disposition: "implement",
    owner: "adapters/app-review/asc-provider.ts",
  },
  {
    nativeCapability: "asc metadata validate",
    canonicalOperation: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/providers/apple-asc.yaml",
  },
  {
    nativeCapability: "asc metadata push --dry-run",
    canonicalOperation: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/providers/apple-asc.yaml",
  },
  {
    nativeCapability: "asc metadata push",
    canonicalOperation: "workflow.store.apple-store-metadata-standing-envelope",
    semanticFit: "partial",
    effects: "mutation",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc web agreements status",
    canonicalOperation: "workflow.store.app-review-observe",
    semanticFit: "exact",
    effects: "read",
    disposition: "implement",
    owner: "catalog/providers/apple-asc.yaml",
  },
  {
    nativeCapability: "asc review submit",
    canonicalOperation: APP_REVIEW_RESUBMIT_WORKFLOW_ID,
    semanticFit: "exact",
    effects: "mutation",
    disposition: "implement",
    owner: "adapters/app-review/resubmit.ts",
  },
  {
    nativeCapability: "asc web agreements accept",
    canonicalOperation: "none",
    semanticFit: "none",
    effects: "mutation",
    disposition: "reject",
    owner: "adapters/app-review/mandate.ts",
  },
  {
    nativeCapability: "asc webhooks serve",
    canonicalOperation: "none",
    semanticFit: "none",
    effects: "publish",
    disposition: "reject",
    owner: "adapters/app-review/mandate.ts",
  },
  {
    nativeCapability: "asc publish appstore --submit",
    canonicalOperation: "none",
    semanticFit: "none",
    effects: "publish",
    disposition: "reject",
    owner: "adapters/app-review/mandate.ts",
  },
  {
    nativeCapability: "asc screenshots sizes",
    canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc screenshots validate",
    canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc screenshots upload",
    canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
    semanticFit: "exact",
    effects: "mutation",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc testflight feedback list",
    canonicalOperation: "workflow.store.apple-testflight-standing-envelope",
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc testflight crashes list",
    canonicalOperation: "workflow.store.apple-testflight-standing-envelope",
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc workflow run testflight_beta",
    canonicalOperation: "workflow.store.apple-testflight-standing-envelope",
    semanticFit: "partial",
    effects: "mutation",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
];

/** Cookbook stems that are independent request-shape evidence, not adapter argv builders. */
const INDEPENDENT_COOKBOOK_STEMS = [
  "asc review status",
  "asc metadata validate",
  "asc metadata push",
  "asc web agreements status",
  "asc web auth status",
  "asc web review list",
  "asc web review show",
  "asc review submit",
  "asc screenshots sizes",
  "asc screenshots validate",
  "asc screenshots upload",
  "asc testflight feedback list",
  "asc testflight crashes list",
  "asc workflow run",
  "asc web agreements accept",
] as const;

function mappingDisposition(row: AscNativeMappingRow): MappingDisposition {
  switch (row.disposition) {
    case "implement":
    case "extension":
    case "defer":
    case "reject":
      return row.disposition;
    default: {
      const exhaustive: never = row.disposition;
      return exhaustive;
    }
  }
}

function provenance(record: ProviderConformanceProvenance): ProviderConformanceProvenance {
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDimension(value: unknown): value is { width: number; height: number } {
  return isRecord(value) && typeof value.width === "number" && typeof value.height === "number";
}

function assertFocusedSizeEntry(
  entry: unknown,
  displayType: string,
  dimensions: readonly { readonly width: number; readonly height: number }[],
): void {
  assert(isRecord(entry), `size entry ${displayType} must be an object`);
  for (const key of SCREENSHOTS_SIZE_ENTRY_KEYS) {
    assert(key in entry, `size entry ${displayType} missing ${key}`);
  }
  assert(entry.displayType === displayType, `expected displayType ${displayType}`);
  assert(entry.family === "APP", `${displayType} family is APP`);
  assert(Array.isArray(entry.dimensions) && entry.dimensions.length === dimensions.length, `${displayType} dimension count`);
  for (const [index, dim] of entry.dimensions.entries()) {
    assert(isDimension(dim), `${displayType} dimension ${index} must be an object`);
    for (const key of SCREENSHOTS_SIZE_DIMENSION_KEYS) {
      assert(key in dim, `${displayType} dimension ${index} missing ${key}`);
    }
    assert(
      dim.width === dimensions[index]?.width && dim.height === dimensions[index]?.height,
      `${displayType} dimension ${index} must match catalog order`,
    );
  }
}

function loadNativeJson(fileName: string): unknown {
  return JSON.parse(readFileSync(path.join(ASC_CLI_NATIVE_DIR, fileName), "utf8")) as unknown;
}

function reviewStatusRunner(payload: unknown): AscCommandRunner {
  return (args) => {
    if (args[0] === "review" && args[1] === "status") {
      return { status: 0, stdout: `${JSON.stringify(payload)}\n`, stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "unused" };
  };
}

export function register(harness: Harness): void {
  harness.check("asc-conformance: observe capabilities stay the declared Slice 0 set", () => {
    const yaml = readFileSync(APPLE_ASC, "utf8");
    for (const id of APP_REVIEW_CAPABILITY_IDS) {
      assert(yaml.includes(`id: ${id}`), `apple-asc.yaml must declare ${id}`);
    }
    assert(OBSERVE_APP_REVIEW_COMMANDS.includes("asc review status"), "review status stays observe");
    assert(OBSERVE_APP_REVIEW_COMMANDS.includes("asc metadata validate"), "metadata validate stays observe");
    assert(OBSERVE_APP_REVIEW_COMMANDS.includes("asc metadata push --dry-run"), "metadata dry-run stays observe");
  });

  harness.check("asc-conformance: non-observe mapping names deferral and rejection without a generic encoder", () => {
    const rork = readFileSync(RORK, "utf8");
    const cookbook = readFileSync(COOKBOOK, "utf8");
    const buildRelease = readFileSync(BUILD_RELEASE, "utf8");
    const implemented = ASC_NATIVE_MAPPING.filter((row) => mappingDisposition(row) === "implement");
    const deferred = ASC_NATIVE_MAPPING.filter((row) => mappingDisposition(row) === "defer");
    const rejected = ASC_NATIVE_MAPPING.filter((row) => mappingDisposition(row) === "reject");
    assert(implemented.length === 12, `observe/remediate/media/metadata/testflight/review-submit implement rows: ${implemented.length}`);
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc review submit" &&
          row.canonicalOperation === APP_REVIEW_RESUBMIT_WORKFLOW_ID &&
          row.owner === "adapters/app-review/resubmit.ts",
      ),
      "review submit maps to the existing resubmit workflow",
    );
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc testflight feedback list" &&
          row.canonicalOperation === "workflow.store.apple-testflight-standing-envelope" &&
          row.owner === "catalog/workflows/build-release.ts",
      ),
      "TestFlight feedback read maps to the existing TestFlight standing envelope",
    );
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc testflight crashes list" &&
          row.canonicalOperation === "workflow.store.apple-testflight-standing-envelope" &&
          row.owner === "catalog/workflows/build-release.ts",
      ),
      "TestFlight crashes read maps to the existing TestFlight standing envelope",
    );
    assert(
      deferred.every(
        (row) =>
          row.nativeCapability !== "asc review submit" &&
          row.nativeCapability !== "asc testflight feedback list" &&
          row.nativeCapability !== "asc testflight crashes list",
      ),
      "review submit and TestFlight feedback and crashes reads are no longer deferred",
    );
    assert(deferred.length === 0, `no native mapping row stays deferred: ${deferred.map((row) => row.nativeCapability).join(", ")}`);
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc screenshots upload" &&
          row.canonicalOperation === APPLE_STORE_MEDIA_STANDING_ENVELOPE &&
          row.owner === "catalog/workflows/build-release.ts",
      ),
      "screenshot upload maps to the Apple store-media standing envelope",
    );
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc metadata push" &&
          row.canonicalOperation === "workflow.store.apple-store-metadata-standing-envelope" &&
          row.owner === "catalog/workflows/build-release.ts",
      ),
      "live metadata push maps to the Apple store-metadata standing envelope",
    );
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc workflow run testflight_beta" &&
          row.canonicalOperation === "workflow.store.apple-testflight-standing-envelope" &&
          row.owner === "catalog/workflows/build-release.ts",
      ),
      "TestFlight beta workflow maps to the Apple TestFlight standing envelope",
    );
    assert(buildRelease.includes("asc testflight feedback list"), "the TestFlight envelope already names the cookbook feedback-read form");
    assert(cookbook.includes("asc testflight feedback list"), "cookbook records the native TestFlight feedback-read form");
    assert(buildRelease.includes("asc testflight crashes list"), "the TestFlight envelope already names the cookbook crashes-read form");
    assert(cookbook.includes("asc testflight crashes list"), "cookbook records the native TestFlight crashes-read form");
    for (const row of rejected) {
      assert(
        ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS.some((command) => command.includes(row.nativeCapability)),
        row.nativeCapability,
      );
      assert(commandIsForbiddenForAppReview(row.nativeCapability, "observe"), row.nativeCapability);
      assert(commandIsForbiddenForAppReview(row.nativeCapability, "resubmit"), `${row.nativeCapability} stays forbidden in resubmit`);
    }
    assert(commandIsForbiddenForAppReview("asc review submit --app 1 --version-id 2 --confirm", "observe"), "observe still refuses submit");
    assert(commandIsForbiddenForAppReview("asc review submit --confirm", "resubmit") === false, "resubmit mode may name submit");
    assert(rork.includes("id: asc.web.agreements.accept"), "rork keeps accept unsupported");
    assert(rork.includes("id: asc.webhooks.serve"), "rork keeps webhook serve unsupported");
    assert(cookbook.includes("asc review submit"), "cookbook records the native submit form");
    assert(cookbook.includes("--confirm"), "cookbook records the CLI confirm gate");
  });

  harness.check("asc-conformance: independent cookbook stems are not encoder echoes", () => {
    const cookbook = readFileSync(COOKBOOK, "utf8");
    const resubmit = readFileSync(RESUBMIT, "utf8");
    assert(resubmit.includes("buildResubmitCommand"), "resubmit still owns the adapter string");
    for (const stem of INDEPENDENT_COOKBOOK_STEMS) {
      assert(cookbook.includes(stem), `cookbook missing independent stem: ${stem}`);
      assert(!cookbook.includes("buildResubmitCommand"), "cookbook must not name the adapter encoder");
    }
    assert(cookbook.includes("--dry-run"), "cookbook records metadata push as a dry-run");
    const observeStatus = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc review status",
      canonicalOperation: "workflow.store.app-review-observe",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Cookbook argv stem from local --help on 2026-09-08. No live review-status JSON and no live App Review.",
      sample: 'asc review status --app "123456789" --output table',
    });
    const screenshotUpload = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc screenshots upload",
      canonicalOperation: "workflow.store.apple-store-media-standing-envelope",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Cookbook argv stem from local --help on 2026-09-08. No live screenshot-upload JSON and no live App Store Connect.",
      sample:
        'asc screenshots upload --version-localization "LOC_ID" --path "./screenshots/final/en-US/<device-well>" --device-type "<ASC_DEVICE_TYPE>" --output json',
    });
    const metadataPush = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc metadata push",
      canonicalOperation: "workflow.store.apple-store-metadata-standing-envelope",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Cookbook records only the dry-run form from local --help on 2026-09-08. No live metadata-apply JSON and no live App Store Connect.",
      sample: 'asc metadata push --app "123456789" --version "1.2.3" --platform IOS --dir "./metadata" --dry-run --output table',
    });
    const testflightBeta = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc workflow run testflight_beta",
      canonicalOperation: "workflow.store.apple-testflight-standing-envelope",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Cookbook records only the dry-run form from local --help on 2026-09-08. No live TestFlight JSON and no live App Store Connect.",
      sample: "asc workflow run --dry-run testflight_beta VERSION:1.2.3",
    });
    const testflightFeedback = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc testflight feedback list",
      canonicalOperation: "workflow.store.apple-testflight-standing-envelope",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Cookbook argv stem from local --help on 2026-09-08. No live TestFlight feedback JSON and no live App Store Connect.",
      sample: 'asc testflight feedback list --app "123456789" --paginate',
    });
    const testflightCrashes = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc testflight crashes list",
      canonicalOperation: "workflow.store.apple-testflight-standing-envelope",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Cookbook argv stem from local --help on 2026-09-08. No live TestFlight crash JSON and no live App Store Connect.",
      sample: 'asc testflight crashes list --app "123456789" --sort -createdDate --limit 10',
    });
    const submit = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: COOKBOOK_SOURCE,
      nativeOperation: "asc review submit",
      canonicalOperation: APP_REVIEW_RESUBMIT_WORKFLOW_ID,
      evidenceKind: "official-example",
      establishes: ["request-shape", "effect"],
      coverageLimits: "Native submit form and --confirm gate only. Observe adapter does not execute it. No live submit.",
      sample: { command: "asc review submit", confirmRequired: true },
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "adapters/app-review/resubmit.ts buildResubmitCommand",
      nativeOperation: "asc review submit",
      canonicalOperation: APP_REVIEW_RESUBMIT_WORKFLOW_ID,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the adapter string builder. Not independent native evidence.",
      sample: "asc review submit --app ${envelope.appId} --version-id ${envelope.appStoreVersionId} --confirm",
    };
    assert(isIndependentEvidence(observeStatus.evidenceKind), describeConformanceCoverage(observeStatus));
    assert(isIndependentEvidence(screenshotUpload.evidenceKind), describeConformanceCoverage(screenshotUpload));
    assert(isIndependentEvidence(metadataPush.evidenceKind), describeConformanceCoverage(metadataPush));
    assert(isIndependentEvidence(testflightBeta.evidenceKind), describeConformanceCoverage(testflightBeta));
    assert(isIndependentEvidence(testflightFeedback.evidenceKind), describeConformanceCoverage(testflightFeedback));
    assert(isIndependentEvidence(testflightCrashes.evidenceKind), describeConformanceCoverage(testflightCrashes));
    assert(isIndependentEvidence(submit.evidenceKind), describeConformanceCoverage(submit));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    assert(cookbook.includes(String(observeStatus.sample)), "observe sample must be the cookbook line");
    assert(cookbook.includes(String(screenshotUpload.sample)), "screenshot upload sample must be the cookbook line");
    assert(cookbook.includes(String(metadataPush.sample)), "metadata push sample must be the cookbook dry-run line");
    assert(cookbook.includes(String(testflightBeta.sample)), "TestFlight beta sample must be the cookbook dry-run line");
    assert(cookbook.includes(String(testflightFeedback.sample)), "TestFlight feedback sample must be the cookbook line");
    assert(cookbook.includes(String(testflightCrashes.sample)), "TestFlight crashes sample must be the cookbook line");
  });

  harness.check("asc-conformance: independent review-status response envelope is the 5.1.0 CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "review-status-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "review-status-mistaken-jsonapi.json"), "utf8");
    const wiring = readFileSync(APP_REVIEW_FIXTURES, "utf8");
    const native = loadNativeJson("review-status-object.json");
    const mistaken = loadNativeJson("review-status-mistaken-jsonapi.json");
    assert(isRecord(native), "native review-status envelope must be one object");
    assert(isRecord(native.version), "native envelope nests version");
    assert(isRecord(native.latestSubmission), "native envelope nests latestSubmission");
    for (const key of REVIEW_STATUS_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    for (const key of REVIEW_VERSION_KEYS) {
      assert(key in native.version, `native version missing ${key}`);
    }
    for (const key of REVIEW_SUBMISSION_KEYS) {
      assert(key in native.latestSubmission, `native latestSubmission missing ${key}`);
    }
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(native.reviewState === "WAITING_FOR_REVIEW", "reviewState follows the 5.1.0 WAITING_FOR_REVIEW branch");
    assert(native.nextAction === "Wait for App Store review outcome.", "nextAction is the 5.1.0 WAITING_FOR_REVIEW sentence");
    assert(!("blockers" in native), "empty blockers stay omitted");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(wiring.includes("function liveReviewStatusJson"), "wiring suite still owns the canned snapshot");
    assert(!wiring.includes("test/data/asc-cli"), "canned live-provider snapshots are not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: REVIEW_STATUS_SOURCE,
      nativeOperation: "asc review status",
      canonicalOperation: "workflow.store.app-review-observe",
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI reviewStatusResult object at 5.1.0 only. Nested version and latestSubmission id/state. Not Apple JSON:API. Not a live review-status capture.",
      sample: native,
    });
    const canned: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "checks/verification/fixtures/app-review.fixtures.ts liveReviewStatusJson",
      nativeOperation: "asc review status",
      canonicalOperation: "workflow.store.app-review-observe",
      evidenceKind: "adapter-generated",
      establishes: ["response-shape"],
      coverageLimits: "Canned runner payload in the wiring suite. Not independent native evidence.",
      sample: "function liveReviewStatusJson",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(canned.evidenceKind) === false, describeConformanceCoverage(canned));
    const snapshot = createAscAppReviewProvider({
      appId: "123456789",
      runner: reviewStatusRunner(native),
      now: () => "2026-09-08T12:00:00.000Z",
    }).readSnapshot();
    assert(snapshot.layers[0]?.layer === "app_version" && snapshot.layers[0].providerObjectId === "asv-native-1", JSON.stringify(snapshot.layers));
    assert(snapshot.layers[0]?.rawValue === "WAITING_FOR_REVIEW", snapshot.layers[0]?.rawValue);
    assert(
      snapshot.layers.some((layer) => layer.layer === "review_submission" && layer.providerObjectId === "rs-native-1"),
      JSON.stringify(snapshot.layers),
    );
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(mistaken),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "JSON:API review-status document fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "JSON:API document is not the CLI object");
  });

  harness.check("asc-conformance: independent review-submit response envelope is the 5.1.0 dry-run CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "review-submit-dry-run-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "review-submit-mistaken-jsonapi.json"), "utf8");
    const resubmit = readFileSync(RESUBMIT, "utf8");
    const native = loadNativeJson("review-submit-dry-run-object.json");
    const mistaken = loadNativeJson("review-submit-mistaken-jsonapi.json");
    assert(isRecord(native), "native review-submit envelope must be one object");
    assert(isRecord(native.buildAttachment), "native envelope nests buildAttachment");
    for (const key of REVIEW_SUBMIT_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    for (const key of REVIEW_SUBMIT_ATTACHMENT_KEYS) {
      assert(key in native.buildAttachment, `native buildAttachment missing ${key}`);
    }
    for (const key of REVIEW_SUBMIT_OMITTED_KEYS) {
      assert(!(key in native), `dry-run envelope must omit empty ${key}`);
    }
    for (const key of REVIEW_SUBMIT_ATTACHMENT_OMITTED_KEYS) {
      assert(!(key in native.buildAttachment), `dry-run attachment must omit empty ${key}`);
    }
    assert(typeof native.version === "string", "submit version is a marketing-version string, not the status nested object");
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(native.dryRun === true, "dry-run branch sets dryRun");
    assert(native.wouldSubmit === true, "dry-run SubmitResolvedVersion sets wouldSubmit");
    assert(native.buildAttachment.wouldAttach === true, "dry-run EnsureBuildAttached sets wouldAttach");
    assert(isRecord(mistaken) && isRecord(mistaken.data) && "attributes" in mistaken.data, "mistaken document is Apple JSON:API");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(resubmit.includes("buildResubmitCommand"), "adapter still owns the recorded submit argv");
    assert(!resubmit.includes("test/data/asc-cli"), "adapter argv builder is not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: REVIEW_SUBMIT_SOURCE,
      nativeOperation: "asc review submit",
      canonicalOperation: APP_REVIEW_RESUBMIT_WORKFLOW_ID,
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI reviewSubmitResult dry-run object at 5.1.0 only. wouldSubmit and buildAttachment.wouldAttach. Not Apple JSON:API. Not a live submit capture. Observe adapter does not execute submit.",
      sample: native,
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "adapters/app-review/resubmit.ts buildResubmitCommand",
      nativeOperation: "asc review submit",
      canonicalOperation: APP_REVIEW_RESUBMIT_WORKFLOW_ID,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the adapter string builder. Not independent native evidence.",
      sample: "asc review submit --app ${envelope.appId} --version-id ${envelope.appStoreVersionId} --confirm",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(native),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "review-submit dry-run object is not a review-status envelope");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "submit version string is not the status nested object");
  });

  harness.check("asc-conformance: independent metadata-validate response envelope is the 5.1.0 CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "metadata-validate-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "metadata-validate-mistaken-jsonapi.json"), "utf8");
    const plan = readFileSync(REMEDIATE_PLAN, "utf8");
    const native = loadNativeJson("metadata-validate-object.json");
    const mistaken = loadNativeJson("metadata-validate-mistaken-jsonapi.json");
    assert(isRecord(native), "native metadata-validate envelope must be one object");
    for (const key of METADATA_VALIDATE_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    assert(Array.isArray(native.issues) && native.issues.length === 0, "valid envelope encodes empty issues as an array");
    for (const key of METADATA_VALIDATE_ISSUE_OMITTED_KEYS) {
      assert(!(key in native), `valid envelope must omit empty ValidateIssue ${key}`);
    }
    assert(!("field" in native) && !("scope" in native) && !("message" in native), "ValidateIssue keys are not top-level");
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(native.dir === "./metadata", "dir is the cookbook path, not a live capture");
    assert(native.filesScanned === 2, "valid branch scanned two localization files");
    assert(native.errorCount === 0 && native.warningCount === 0, "valid branch has no counted issues");
    assert(native.valid === true, "errorCount 0 sets valid");
    assert(isRecord(mistaken) && isRecord(mistaken.data) && "attributes" in mistaken.data, "mistaken document is Apple JSON:API");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(plan.includes("asc metadata validate"), "remediate plan still owns the preflight command string");
    assert(!plan.includes("test/data/asc-cli"), "adapter preflight list is not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: METADATA_VALIDATE_SOURCE,
      nativeOperation: "asc metadata validate",
      canonicalOperation: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI ValidateResult object at 5.1.0 only. Offline valid branch with empty issues. Not Apple JSON:API. Not a live App Store Connect capture. Observe adapter does not execute validate.",
      sample: native,
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "adapters/app-review/plan.ts metadata_rejected preflight list",
      nativeOperation: "asc metadata validate",
      canonicalOperation: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the adapter preflight command list. Not independent native evidence.",
      sample: "asc metadata validate",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(native),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "metadata-validate object is not a review-status envelope");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "ValidateResult dir/issues are not the status nested object");
    thrown = undefined;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(mistaken),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "JSON:API metadata document fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "JSON:API document is not the CLI object");
  });

  harness.check("asc-conformance: independent screenshots-sizes response envelope is the 5.1.0 default focused CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "screenshots-sizes-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "screenshots-sizes-mistaken-jsonapi.json"), "utf8");
    const buildRelease = readFileSync(BUILD_RELEASE, "utf8");
    const native = loadNativeJson("screenshots-sizes-object.json");
    const mistaken = loadNativeJson("screenshots-sizes-mistaken-jsonapi.json");
    assert(isRecord(native), "native screenshots-sizes envelope must be one object");
    for (const key of SCREENSHOTS_SIZES_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    assert(Array.isArray(native.sizes) && native.sizes.length === 2, "default focused catalog has two entries");
    assertFocusedSizeEntry(native.sizes[0], SCREENSHOTS_SIZES_FOCUSED_TYPES[0], SCREENSHOTS_SIZES_IPHONE_65_DIMENSIONS);
    assertFocusedSizeEntry(native.sizes[1], SCREENSHOTS_SIZES_FOCUSED_TYPES[1], SCREENSHOTS_SIZES_IPAD_PRO_3GEN_129_DIMENSIONS);
    assert(
      !native.sizes.some((entry) => isRecord(entry) && entry.displayType === "APP_DESKTOP"),
      "default focused catalog omits APP_DESKTOP",
    );
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(isRecord(mistaken) && isRecord(mistaken.data) && "attributes" in mistaken.data, "mistaken document is Apple JSON:API");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(buildRelease.includes("asc screenshots sizes"), "media standing envelope still names the cookbook sizes form");
    assert(!buildRelease.includes("test/data/asc-cli"), "workflow cookbook form is not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: SCREENSHOTS_SIZES_SOURCE,
      nativeOperation: "asc screenshots sizes",
      canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI ScreenshotSizesResult default focused object at 5.1.0 only. APP_IPHONE_65 then APP_IPAD_PRO_3GEN_129. Not Apple JSON:API. Not the --all catalog. Not a live App Store Connect capture. Observe adapter does not execute sizes.",
      sample: native,
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "catalog/workflows/build-release.ts apple-store-media-standing-envelope cookbook form",
      nativeOperation: "asc screenshots sizes",
      canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the workflow cookbook string. Not independent native evidence.",
      sample: "asc screenshots sizes",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(native),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "screenshots-sizes object is not a review-status envelope");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "ScreenshotSizesResult sizes are not the status nested object");
    thrown = undefined;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(mistaken),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "JSON:API screenshot-set document fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "JSON:API document is not the CLI object");
  });

  harness.check("asc-conformance: independent screenshots-validate response envelope is the 5.1.0 ready CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "screenshots-validate-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "screenshots-validate-mistaken-jsonapi.json"), "utf8");
    const buildRelease = readFileSync(BUILD_RELEASE, "utf8");
    const native = loadNativeJson("screenshots-validate-object.json");
    const mistaken = loadNativeJson("screenshots-validate-mistaken-jsonapi.json");
    assert(isRecord(native), "native screenshots-validate envelope must be one object");
    for (const key of SCREENSHOTS_VALIDATE_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    for (const key of SCREENSHOTS_VALIDATE_OMITTED_KEYS) {
      assert(!(key in native), `ready envelope must omit empty ${key}`);
    }
    for (const key of SCREENSHOTS_VALIDATE_ISSUE_OMITTED_KEYS) {
      assert(!(key in native), `screenshotValidateIssue keys are not top-level`);
    }
    assert(native.path === "./screenshots", "path is the cookbook path, not a live capture");
    assert(native.displayType === "APP_IPHONE_65", "IPHONE_65 normalizes to APP_IPHONE_65");
    assert(native.totalFiles === 1 && native.readyFiles === 1, "ready branch records one file");
    assert(native.errorCount === 0 && native.warningCount === 0, "ready branch has no counted issues");
    assert(Array.isArray(native.files) && native.files.length === 1, "ready envelope encodes one file");
    const file = native.files[0];
    assert(isRecord(file), "nested file must be one object");
    for (const key of SCREENSHOTS_VALIDATE_FILE_KEYS) {
      assert(key in file, `nested file missing ${key}`);
    }
    for (const key of SCREENSHOTS_VALIDATE_FILE_OMITTED_KEYS) {
      assert(!(key in file), `ready file must omit empty ${key}`);
    }
    assert(file.order === 1, "first collected file is order 1");
    assert(file.filePath === "./screenshots/01-home.png", "filePath joins the cookbook path");
    assert(file.fileName === "01-home.png", "fileName is the render-test ready PNG");
    assert(file.width === 1242 && file.height === 2688, "ready PNG uses the first APP_IPHONE_65 size");
    assert(file.status === "ok", "ready file status is ok");
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(isRecord(mistaken) && isRecord(mistaken.data) && "attributes" in mistaken.data, "mistaken document is Apple JSON:API");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(buildRelease.includes("asc screenshots validate"), "media standing envelope still names the cookbook validate form");
    assert(!buildRelease.includes("test/data/asc-cli"), "workflow cookbook form is not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: SCREENSHOTS_VALIDATE_SOURCE,
      nativeOperation: "asc screenshots validate",
      canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI screenshotValidateResult ready object at 5.1.0 only. One ok APP_IPHONE_65 PNG. Empty issues omitted. Not Apple JSON:API. Not a live App Store Connect capture. Observe adapter does not execute validate.",
      sample: native,
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "catalog/workflows/build-release.ts apple-store-media-standing-envelope cookbook form",
      nativeOperation: "asc screenshots validate",
      canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the workflow cookbook string. Not independent native evidence.",
      sample: "asc screenshots validate",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(native),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "screenshots-validate object is not a review-status envelope");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "screenshotValidateResult path/files are not the status nested object");
    thrown = undefined;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(mistaken),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "JSON:API screenshot document fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "JSON:API document is not the CLI object");
  });

  harness.check("asc-conformance: independent screenshots-upload response envelope is the 5.1.0 dry-run CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "screenshots-upload-dry-run-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "screenshots-upload-mistaken-jsonapi.json"), "utf8");
    const buildRelease = readFileSync(BUILD_RELEASE, "utf8");
    const native = loadNativeJson("screenshots-upload-dry-run-object.json");
    const mistaken = loadNativeJson("screenshots-upload-mistaken-jsonapi.json");
    assert(isRecord(native), "native screenshots-upload envelope must be one object");
    for (const key of SCREENSHOTS_UPLOAD_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    for (const key of SCREENSHOTS_UPLOAD_OMITTED_KEYS) {
      assert(!(key in native), `dry-run envelope must omit empty ${key}`);
    }
    assert(native.versionLocalizationId === "LOC_ID", "versionLocalizationId is the cookbook id, not a live capture");
    assert(native.setId === "set-native-1", "setId is synthetic, not a live screenshot set");
    assert(native.displayType === "APP_IPHONE_65", "IPHONE_65 normalizes to APP_IPHONE_65");
    assert(native.dryRun === true, "dry-run branch sets dryRun");
    assert(native.total === 1, "finalizeAppScreenshotUploadResult sets total from one result");
    assert(Array.isArray(native.results) && native.results.length === 1, "dry-run envelope encodes one result");
    const item = native.results[0];
    assert(isRecord(item), "nested result must be one object");
    for (const key of SCREENSHOTS_UPLOAD_RESULT_KEYS) {
      assert(key in item, `nested result missing ${key}`);
    }
    for (const key of SCREENSHOTS_UPLOAD_RESULT_OMITTED_KEYS) {
      assert(!(key in item), `dry-run result must omit empty ${key}`);
    }
    assert(item.fileName === "01-home.png", "fileName is the dry-run test PNG");
    assert(item.filePath === "./screenshots/01-home.png", "filePath joins the cookbook path");
    assert(item.assetId === "", "dry-run would-upload leaves assetId empty");
    assert(item.state === "would-upload", "dry-run branch records would-upload");
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(isRecord(mistaken) && isRecord(mistaken.data) && "attributes" in mistaken.data, "mistaken document is Apple JSON:API");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(buildRelease.includes("asc screenshots upload"), "media standing envelope still names the cookbook upload form");
    assert(!buildRelease.includes("test/data/asc-cli"), "workflow cookbook form is not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: SCREENSHOTS_UPLOAD_SOURCE,
      nativeOperation: "asc screenshots upload",
      canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI AppScreenshotUploadResult dry-run object at 5.1.0 only. One would-upload APP_IPHONE_65 PNG. Empty uploaded omitted. Not Apple JSON:API. Not a live App Store Connect capture. Observe adapter does not execute upload.",
      sample: native,
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "catalog/workflows/build-release.ts apple-store-media-standing-envelope cookbook form",
      nativeOperation: "asc screenshots upload",
      canonicalOperation: APPLE_STORE_MEDIA_STANDING_ENVELOPE,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the workflow cookbook string. Not independent native evidence.",
      sample: "asc screenshots upload",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(native),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "screenshots-upload dry-run object is not a review-status envelope");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "AppScreenshotUploadResult results are not the status nested object");
    thrown = undefined;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(mistaken),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "JSON:API screenshot document fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "JSON:API document is not the CLI object");
  });

  harness.check("asc-conformance: independent metadata-push response envelope is the 5.1.0 dry-run CLI object", () => {
    const nativeSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "metadata-push-dry-run-object.json"), "utf8");
    const mistakenSource = readFileSync(path.join(ASC_CLI_NATIVE_DIR, "metadata-push-mistaken-jsonapi.json"), "utf8");
    const plan = readFileSync(REMEDIATE_PLAN, "utf8");
    const native = loadNativeJson("metadata-push-dry-run-object.json");
    const mistaken = loadNativeJson("metadata-push-mistaken-jsonapi.json");
    assert(isRecord(native), "native metadata-push envelope must be one object");
    for (const key of METADATA_PUSH_OBJECT_KEYS) {
      assert(key in native, `native envelope missing ${key}`);
    }
    for (const key of METADATA_PUSH_OMITTED_KEYS) {
      assert(!(key in native), `dry-run envelope must omit empty ${key}`);
    }
    assert(native.appId === "123456789", "appId is the cookbook id, not a live capture");
    assert(native.appInfoId === "appinfo-native-1", "appInfoId is synthetic, not a live app-info");
    assert(native.version === "1.2.3", "version is the cookbook string, not the status nested object");
    assert(native.versionId === "asv-native-1", "versionId is synthetic, not a live version");
    assert(native.dir === "./metadata", "dir is the cookbook path, not a live capture");
    assert(native.dryRun === true, "dry-run branch sets dryRun");
    assert(Array.isArray(native.includes) && native.includes.length === 1 && native.includes[0] === "localizations", "default include is localizations");
    assert(Array.isArray(native.adds) && native.adds.length === 2, "dry-run plan encodes two adds");
    assert(Array.isArray(native.updates) && native.updates.length === 2, "dry-run plan encodes two updates");
    assert(Array.isArray(native.deletes) && native.deletes.length === 1, "dry-run plan encodes one delete");
    assert(Array.isArray(native.apiCalls) && native.apiCalls.length === 4, "dry-run plan encodes four apiCalls");
    const addKeys = native.adds.map((item) => (isRecord(item) ? item.key : undefined));
    const updateKeys = native.updates.map((item) => (isRecord(item) ? item.key : undefined));
    const deleteKeys = native.deletes.map((item) => (isRecord(item) ? item.key : undefined));
    for (const [index, key] of METADATA_PUSH_ADD_KEYS.entries()) {
      assert(addKeys[index] === key, `adds stay sorted by key: expected ${key}`);
    }
    for (const [index, key] of METADATA_PUSH_UPDATE_KEYS.entries()) {
      assert(updateKeys[index] === key, `updates stay sorted by key: expected ${key}`);
    }
    for (const [index, key] of METADATA_PUSH_DELETE_KEYS.entries()) {
      assert(deleteKeys[index] === key, `deletes stay sorted by key: expected ${key}`);
    }
    const keywordsAdd = native.adds[0];
    assert(isRecord(keywordsAdd), "nested keywords add must be one object");
    for (const key of METADATA_PUSH_PLAN_ITEM_KEYS) {
      assert(key in keywordsAdd, `nested add missing ${key}`);
    }
    for (const key of METADATA_PUSH_ADD_OMITTED_KEYS) {
      assert(!(key in keywordsAdd), `keywords add must omit empty ${key}`);
    }
    assert(keywordsAdd.scope === "version" && keywordsAdd.locale === "en-US", "keywords add is the en-US version locale");
    assert(keywordsAdd.version === "1.2.3", "version plan items keep the version string");
    assert(keywordsAdd.field === "keywords" && keywordsAdd.to === "one,two", "keywords add uses the local value");
    assert(keywordsAdd.reason === "field exists locally but not remotely", "local-only field is an add");
    const jaAdd = native.adds[1];
    assert(isRecord(jaAdd), "nested ja add must be one object");
    assert(jaAdd.locale === "ja" && jaAdd.field === "description" && jaAdd.to === "日本語説明", "ja add is the local description create");
    const subtitleUpdate = native.updates[0];
    assert(isRecord(subtitleUpdate), "nested subtitle update must be one object");
    for (const key of METADATA_PUSH_PLAN_ITEM_KEYS) {
      assert(key in subtitleUpdate, `nested update missing ${key}`);
    }
    for (const key of METADATA_PUSH_APP_INFO_OMITTED_KEYS) {
      assert(!(key in subtitleUpdate), `app-info update must omit empty ${key}`);
    }
    assert(subtitleUpdate.scope === "app-info" && subtitleUpdate.locale === "en-US", "subtitle update is the en-US app-info locale");
    assert(subtitleUpdate.field === "subtitle" && subtitleUpdate.from === "Remote subtitle" && subtitleUpdate.to === "Local subtitle", "subtitle update diffs remote to local");
    assert(subtitleUpdate.reason === "field value differs", "changed local field is an update");
    const descriptionUpdate = native.updates[1];
    assert(isRecord(descriptionUpdate), "nested description update must be one object");
    assert(descriptionUpdate.version === "1.2.3" && descriptionUpdate.from === "Remote description" && descriptionUpdate.to === "Local description", "description update diffs remote to local");
    const frDelete = native.deletes[0];
    assert(isRecord(frDelete), "nested fr delete must be one object");
    for (const key of METADATA_PUSH_PLAN_ITEM_KEYS) {
      assert(key in frDelete, `nested delete missing ${key}`);
    }
    for (const key of METADATA_PUSH_APP_INFO_OMITTED_KEYS) {
      assert(!(key in frDelete), `app-info delete must omit empty ${key}`);
    }
    for (const key of METADATA_PUSH_DELETE_OMITTED_KEYS) {
      assert(!(key in frDelete), `delete must omit empty ${key}`);
    }
    assert(frDelete.scope === "app-info" && frDelete.locale === "fr" && frDelete.field === "name", "fr delete is the remote-only app-info name");
    assert(frDelete.from === "App FR" && frDelete.reason === "localization missing locally", "missing local locale is a delete");
    assert(!deleteKeys.includes("version:1.2.3:en-US:marketingUrl"), "omitted local marketingUrl stays a no-op");
    for (const [index, expected] of METADATA_PUSH_API_CALLS.entries()) {
      const call = native.apiCalls[index];
      assert(isRecord(call), `apiCall ${index} must be one object`);
      for (const key of METADATA_PUSH_API_CALL_KEYS) {
        assert(key in call, `apiCall missing ${key}`);
      }
      assert(call.operation === expected.operation && call.scope === expected.scope && call.count === expected.count, `apiCalls stay sorted by scope then operation: expected ${expected.operation} ${expected.scope}`);
    }
    assert(!("data" in native) && !("attributes" in native), "CLI envelope is not Apple JSON:API");
    assert(isRecord(mistaken) && isRecord(mistaken.data) && "attributes" in mistaken.data, "mistaken document is Apple JSON:API");
    assert(
      adapterGeneratedMentions(nativeSource, ["buildResubmitCommand", "liveReviewStatusJson", "createAscAppReviewProvider"]).length === 0,
      "native envelope must not name adapter helpers",
    );
    assert(
      adapterGeneratedMentions(mistakenSource, ["buildResubmitCommand", "liveReviewStatusJson"]).length === 0,
      "mistaken envelope must not name adapter helpers",
    );
    assert(plan.includes("asc metadata push --dry-run"), "remediate plan still owns the dry-run command string");
    assert(!plan.includes("test/data/asc-cli"), "adapter preflight list is not this envelope");
    const record = provenance({
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: RORK_REVIEWED_REVISION,
      sourceSelector: METADATA_PUSH_SOURCE,
      nativeOperation: "asc metadata push --dry-run",
      canonicalOperation: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
      evidenceKind: "upstream-source-test",
      establishes: ["response-shape"],
      coverageLimits:
        "CLI PushPlanResult dry-run object at 5.1.0 only. Two adds, two updates, one delete. Empty applied omitted. Not Apple JSON:API. Not a live App Store Connect capture. Observe adapter does not execute push.",
      sample: native,
    });
    const generated: ProviderConformanceProvenance = {
      provider: "apple-asc",
      transport: "cli",
      reviewedVersion: RORK_REVIEWED_VERSION,
      reviewedRevision: "unknown",
      sourceSelector: "adapters/app-review/plan.ts metadata_rejected preflight list",
      nativeOperation: "asc metadata push --dry-run",
      canonicalOperation: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the adapter preflight command list. Not independent native evidence.",
      sample: "asc metadata push --dry-run",
    };
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    let thrown: unknown;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(native),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "metadata-push dry-run object is not a review-status envelope");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "PushPlanResult adds/updates are not the status nested object");
    thrown = undefined;
    try {
      createAscAppReviewProvider({
        appId: "123456789",
        runner: reviewStatusRunner(mistaken),
      }).readSnapshot();
    } catch (error) {
      thrown = error;
    }
    assert(thrown instanceof AscProviderReadError, "JSON:API metadata document fails closed");
    assert(thrown instanceof Error && thrown.message.includes("no valid app-version layer"), "JSON:API document is not the CLI object");
  });
}
