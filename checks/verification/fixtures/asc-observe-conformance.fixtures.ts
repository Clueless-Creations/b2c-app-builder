/**
 * Apple ASC observe / non-observe mapping and independent cookbook samples (#113).
 *
 * Reuses the observe command list, apple-asc.yaml, rork unsupported operations, and the
 * verified command cookbook (local --help, 2026-09-08). Does not live-call `asc`.
 * Screenshot upload maps to the Apple store-media standing envelope (#38). Adapter-built
 * resubmit argv is not independent evidence.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
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
import { assert, skillRoot, type Harness } from "./_harness.js";

const COOKBOOK = path.join(skillRoot, "knowledge/store/app-store-connect-cli.md");
const APPLE_ASC = path.join(skillRoot, "catalog/providers/apple-asc.yaml");
const RORK = path.join(skillRoot, "catalog/upstreams/rork-app-store-connect-cli.yaml");
const RESUBMIT = path.join(skillRoot, "adapters/app-review/resubmit.ts");
const RORK_REVIEWED_VERSION = "5.1.0";
const COOKBOOK_SOURCE = "knowledge/store/app-store-connect-cli.md Verified Command Cookbook (local --help, 2026-09-08)";

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
    disposition: "defer",
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
    assert(implemented.length === 8, `observe/remediate/media/metadata implement rows: ${implemented.length}`);
    assert(
      deferred.some((row) => row.nativeCapability === "asc review submit" && row.canonicalOperation === APP_REVIEW_RESUBMIT_WORKFLOW_ID),
      "review submit maps to the existing resubmit workflow and stays deferred",
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
      deferred.some((row) => row.nativeCapability === "asc testflight feedback list" && row.canonicalOperation === "none"),
      "TestFlight read stays knowledge-only",
    );
    for (const row of rejected) {
      assert(ALWAYS_FORBIDDEN_APP_REVIEW_COMMANDS.some((command) => command.includes(row.nativeCapability)), row.nativeCapability);
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
      sample: "asc review status --app \"123456789\" --output table",
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
      sample: 'asc screenshots upload --version-localization "LOC_ID" --path "./screenshots/final/en-US/<device-well>" --device-type "<ASC_DEVICE_TYPE>" --output json',
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
      coverageLimits:
        "Cookbook records only the dry-run form from local --help on 2026-09-08. No live metadata-apply JSON and no live App Store Connect.",
      sample: 'asc metadata push --app "123456789" --version "1.2.3" --platform IOS --dir "./metadata" --dry-run --output table',
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
    assert(isIndependentEvidence(submit.evidenceKind), describeConformanceCoverage(submit));
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    assert(cookbook.includes(String(observeStatus.sample)), "observe sample must be the cookbook line");
    assert(cookbook.includes(String(screenshotUpload.sample)), "screenshot upload sample must be the cookbook line");
    assert(cookbook.includes(String(metadataPush.sample)), "metadata push sample must be the cookbook dry-run line");
  });
}
