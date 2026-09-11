/**
 * Apple ASC observe / non-observe mapping and independent cookbook samples (#113).
 *
 * Reuses the observe command list, apple-asc.yaml, rork unsupported operations, and the
 * verified command cookbook (local --help, 2026-09-08). Does not live-call `asc`.
 * Screenshot upload maps to the Apple store-media standing envelope (#38). TestFlight
 * beta distribution maps to the Apple TestFlight standing envelope. The independent
 * review-status response envelope is the 5.1.0 CLI `reviewStatusResult` object.
 * The independent review-submit response envelope is the 5.1.0 CLI
 * `reviewSubmitResult` dry-run object. `asc review submit` maps to
 * `workflow.store.app-review-resubmit`. Adapter-built resubmit argv and canned
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
const APP_REVIEW_FIXTURES = path.join(skillRoot, "checks/verification/fixtures/app-review.fixtures.ts");
const ASC_CLI_NATIVE_DIR = path.join(skillRoot, "checks/verification/test/data/asc-cli");
const RORK_REVIEWED_VERSION = "5.1.0";
const RORK_REVIEWED_REVISION = "ca759a3b6ab88c8c39aed13325461248436615ca";
const COOKBOOK_SOURCE = "knowledge/store/app-store-connect-cli.md Verified Command Cookbook (local --help, 2026-09-08)";
const REVIEW_STATUS_SOURCE = "rork-app-store-connect-cli 5.1.0 internal/cli/reviews/review_overview.go reviewStatusResult";
const REVIEW_SUBMIT_SOURCE =
  "rork-app-store-connect-cli 5.1.0 internal/cli/reviews/review_submit.go reviewSubmitResult / internal/cli/submit/submit_flow.go BuildAttachmentResult";
const REVIEW_STATUS_OBJECT_KEYS = ["appId", "version", "reviewDetailConfigured", "reviewDetailId", "latestSubmission", "reviewState", "nextAction"] as const;
const REVIEW_VERSION_KEYS = ["id", "version", "platform", "state", "createdDate"] as const;
const REVIEW_SUBMISSION_KEYS = ["id", "state", "platform", "submittedDate"] as const;
const REVIEW_SUBMIT_OBJECT_KEYS = ["appId", "version", "versionId", "buildId", "platform", "dryRun", "wouldSubmit", "buildAttachment"] as const;
const REVIEW_SUBMIT_ATTACHMENT_KEYS = ["versionId", "buildId", "wouldAttach"] as const;
const REVIEW_SUBMIT_OMITTED_KEYS = ["submissionId", "submittedDate", "alreadySubmitted", "messages"] as const;
const REVIEW_SUBMIT_ATTACHMENT_OMITTED_KEYS = ["currentBuildId", "attached", "alreadyAttached"] as const;

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
    canonicalOperation: "workflow.store.apple-store-media-standing-envelope",
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc screenshots validate",
    canonicalOperation: "workflow.store.apple-store-media-standing-envelope",
    semanticFit: "partial",
    effects: "read",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc screenshots upload",
    canonicalOperation: "workflow.store.apple-store-media-standing-envelope",
    semanticFit: "exact",
    effects: "mutation",
    disposition: "implement",
    owner: "catalog/workflows/build-release.ts",
  },
  {
    nativeCapability: "asc testflight feedback list",
    canonicalOperation: "none",
    semanticFit: "none",
    effects: "read",
    disposition: "defer",
    owner: "knowledge/store/app-store-connect-cli.md",
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
    const implemented = ASC_NATIVE_MAPPING.filter((row) => mappingDisposition(row) === "implement");
    const deferred = ASC_NATIVE_MAPPING.filter((row) => mappingDisposition(row) === "defer");
    const rejected = ASC_NATIVE_MAPPING.filter((row) => mappingDisposition(row) === "reject");
    assert(implemented.length === 10, `observe/remediate/media/metadata/testflight/review-submit implement rows: ${implemented.length}`);
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
      deferred.every((row) => row.nativeCapability !== "asc review submit"),
      "review submit mapping is no longer deferred",
    );
    assert(
      deferred.length === 1 && deferred[0]?.nativeCapability === "asc testflight feedback list",
      `only TestFlight feedback read stays deferred: ${deferred.map((row) => row.nativeCapability).join(", ")}`,
    );
    assert(
      implemented.some(
        (row) =>
          row.nativeCapability === "asc screenshots upload" &&
          row.canonicalOperation === "workflow.store.apple-store-media-standing-envelope" &&
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
    assert(
      deferred.some((row) => row.nativeCapability === "asc testflight feedback list" && row.canonicalOperation === "none"),
      "TestFlight feedback read stays knowledge-only",
    );
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
    assert(isIndependentEvidence(submit.evidenceKind), describeConformanceCoverage(submit));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    assert(cookbook.includes(String(observeStatus.sample)), "observe sample must be the cookbook line");
    assert(cookbook.includes(String(screenshotUpload.sample)), "screenshot upload sample must be the cookbook line");
    assert(cookbook.includes(String(metadataPush.sample)), "metadata push sample must be the cookbook dry-run line");
    assert(cookbook.includes(String(testflightBeta.sample)), "TestFlight beta sample must be the cookbook dry-run line");
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
}
