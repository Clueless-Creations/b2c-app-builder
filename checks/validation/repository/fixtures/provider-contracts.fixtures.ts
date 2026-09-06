import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";

const repoRoot = skillRoot;
const shippedProviders = path.join(skillRoot, "catalog/providers");

function writeFile(root: string, relPath: string, contents: string): void {
  const fullPath = path.join(root, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
}

function shipped(name: string): string {
  return readFileSync(path.join(shippedProviders, name), "utf8");
}

function writeRegistry(root: string): void {
  writeFile(
    root,
    "checks/validation/repository/source-registry.yaml",
    [
      "schema_version: 1",
      "sources:",
      "  - id: api-revenuecat-com",
      "  - id: www-revenuecat-com-docs-api-v1",
      "  - id: www-revenuecat-com-docs-tools-experiments-v1",
      "  - id: claude-com-claude-code",
      "  - id: developer-apple-com-help-app-store-connect-manage-builds-upload-builds",
      "",
    ].join("\n"),
  );
}

function writeShippedProviders(root: string, names: readonly string[]): void {
  for (const name of names) {
    writeFile(root, `catalog/providers/${name}`, shipped(name));
  }
}

function writeSnapshot(filePath: string, hashes: Record<string, string>): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        sources: Object.entries(hashes).map(([id, hash]) => ({ id, hash, status: "fresh", http_status: 200, checked_at: "2026-09-05T00:00:00Z" })),
      },
      null,
      2,
    )}\n`,
  );
}

const SNAPSHOT_HASHES: Record<string, string> = {
  "api-revenuecat-com": "c71fd8eebdf3e0c33a979bbb35d3046a0730f395e21438b94e14b5b0f69f4c19",
  "www-revenuecat-com-docs-api-v1": "d84c363c16334dde0057a3090df4a4c739b0de6faec84c7b8bcc4c0033b5d953",
  "claude-com-claude-code": "999a5aacdea1a0968df9b5f5771a4a22003728a786fc1fcc0f8ee29210217c8d",
  "developer-apple-com-help-app-store-connect-manage-builds-upload-builds": "a7f28429ed420f684e5f7fa8ec8e0354d22e927795b6b23b8bf9625320f45d4d",
};

const ALL_PROVIDER_FILES = ["revenuecat.yaml", "agent-runtime-claude.yaml", "apple-asc.yaml", "capability-delta.yaml"] as const;

export function register(harness: Harness): void {
  const { makeEmptyFixture, runScriptArgs, runFixture } = harness;

  runScriptArgs("provider contracts pass on the shipped catalog", "check-provider-contracts.ts", ["--skill-root", skillRoot], 0);
  runScriptArgs("capability delta pass on the shipped ledger", "check-capability-delta.ts", ["--skill-root", skillRoot, "--repo-root", repoRoot], 0);

  const badSchema = makeEmptyFixture("provider-contract-bad-schema");
  writeShippedProviders(badSchema, ALL_PROVIDER_FILES);
  writeRegistry(badSchema);
  writeFile(badSchema, "catalog/providers/revenuecat.yaml", shipped("revenuecat.yaml").replace("schema_version: 1", "schema_version: 2"));
  runScriptArgs(
    "provider contracts fail when schema_version is wrong",
    "check-provider-contracts.ts",
    ["--skill-root", badSchema, "--registry", path.join(badSchema, "checks/validation/repository/source-registry.yaml")],
    1,
    "schema_version must be 1",
  );

  const missingBilling = makeEmptyFixture("provider-contract-missing-revenuecat");
  writeShippedProviders(missingBilling, ["agent-runtime-claude.yaml", "apple-asc.yaml", "capability-delta.yaml"]);
  writeRegistry(missingBilling);
  runScriptArgs(
    "provider contracts fail when RevenueCat is missing",
    "check-provider-contracts.ts",
    ["--skill-root", missingBilling, "--registry", path.join(missingBilling, "checks/validation/repository/source-registry.yaml")],
    1,
    "Missing required provider contract revenuecat",
  );

  const appleGap = makeEmptyFixture("provider-contract-apple-missing-capability");
  writeShippedProviders(appleGap, ALL_PROVIDER_FILES);
  writeRegistry(appleGap);
  writeFile(
    appleGap,
    "catalog/providers/apple-asc.yaml",
    shipped("apple-asc.yaml").replace(
      "  - id: asc.web.agreements.status\n    required: true\n    notes: Observe-only agreements status from Slice 0. Accept remains forbidden.\n",
      "",
    ),
  );
  runScriptArgs(
    "provider contracts fail when apple-asc omits an App Review capability",
    "check-provider-contracts.ts",
    ["--skill-root", appleGap, "--registry", path.join(appleGap, "checks/validation/repository/source-registry.yaml")],
    1,
    "asc.web.agreements.status",
  );

  const hashMismatchDelta = makeEmptyFixture("capability-delta-hash-mismatch");
  const mismatchPath = path.join(hashMismatchDelta, "capability-delta.yaml");
  const mismatchSnapshot = path.join(hashMismatchDelta, "snapshot.json");
  writeFile(
    hashMismatchDelta,
    "capability-delta.yaml",
    shipped("capability-delta.yaml").replace(
      "c71fd8eebdf3e0c33a979bbb35d3046a0730f395e21438b94e14b5b0f69f4c19",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ),
  );
  writeSnapshot(mismatchSnapshot, SNAPSHOT_HASHES);
  runScriptArgs(
    "capability delta fails when to_hash does not match the snapshot",
    "check-capability-delta.ts",
    ["--skill-root", skillRoot, "--delta", mismatchPath, "--snapshots", mismatchSnapshot],
    1,
    "does not match snapshot hash",
  );

  const breakingPending = makeEmptyFixture("capability-delta-breaking-pending");
  const pendingPath = path.join(breakingPending, "capability-delta.yaml");
  writeFile(
    breakingPending,
    "capability-delta.yaml",
    shipped("capability-delta.yaml")
      .replace(
        "classification: ignore\n    summary: API origin page chrome changed. B2C App Builder still calls REST API v2 offerings and entitlements.",
        "classification: breaking\n    summary: RevenueCat retired the contracted offerings endpoint without a migration.",
      )
      .replace(
        "summary: RevenueCat retired the contracted offerings endpoint without a migration.\n    migration: none",
        "summary: RevenueCat retired the contracted offerings endpoint without a migration.\n    migration: pending",
      ),
  );
  runScriptArgs(
    "capability delta fails when a breaking change is not migrated",
    "check-capability-delta.ts",
    ["--skill-root", skillRoot, "--repo-root", repoRoot, "--delta", pendingPath],
    1,
    "is not migrated",
  );

  const breakingComplete = makeEmptyFixture("capability-delta-breaking-complete");
  const completePath = path.join(breakingComplete, "capability-delta.yaml");
  writeFile(
    breakingComplete,
    "capability-delta.yaml",
    shipped("capability-delta.yaml")
      .replace(
        "classification: ignore\n    summary: API origin page chrome changed. B2C App Builder still calls REST API v2 offerings and entitlements.",
        "classification: breaking\n    summary: RevenueCat changed offerings; the skill migrated probes and proof rows.",
      )
      .replace(
        "summary: RevenueCat changed offerings; the skill migrated probes and proof rows.\n    migration: none",
        "summary: RevenueCat changed offerings; the skill migrated probes and proof rows.\n    migration: complete",
      ),
  );
  runScriptArgs(
    "capability delta passes when a breaking change is migrated",
    "check-capability-delta.ts",
    ["--skill-root", skillRoot, "--repo-root", repoRoot, "--delta", completePath],
    0,
  );

  const missedExperiments = makeEmptyFixture("capability-delta-missed-experiments");
  const missedPath = path.join(missedExperiments, "capability-delta.yaml");
  writeFile(
    missedExperiments,
    "capability-delta.yaml",
    shipped("capability-delta.yaml").replace(
      `  - provider_id: revenuecat
    source_id: www-revenuecat-com-docs-tools-experiments-v1
    from_hash: unsnapped
    to_hash: unsnapped
    classification: docs
    summary: Experiments v1 docs are contracted. No snapshot row exists yet. Classify on first fetch.
    migration: none
`,
      "",
    ),
  );
  runScriptArgs(
    "capability delta fails when RevenueCat Experiments has no classified row",
    "check-capability-delta.ts",
    ["--skill-root", skillRoot, "--repo-root", repoRoot, "--delta", missedPath],
    1,
    "www-revenuecat-com-docs-tools-experiments-v1",
  );

  const absentSnapshot = makeEmptyFixture("capability-delta-absent-snapshot");
  const absentDelta = path.join(absentSnapshot, "capability-delta.yaml");
  writeFile(
    absentSnapshot,
    "capability-delta.yaml",
    shipped("capability-delta.yaml").replace(
      "c71fd8eebdf3e0c33a979bbb35d3046a0730f395e21438b94e14b5b0f69f4c19",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ),
  );
  runScriptArgs(
    "capability delta skips hash matching when the snapshot file is absent",
    "check-capability-delta.ts",
    ["--skill-root", skillRoot, "--delta", absentDelta, "--snapshots", path.join(absentSnapshot, "missing-snapshot.json")],
    0,
  );

  const revenueRoot = makeEmptyFixture("revenue-breaking-unmigrated");
  runFixture(
    "revenue readiness fails closed on an unmigrated breaking RevenueCat delta",
    revenueRoot,
    "check-revenue.ts",
    1,
    "revenue.provider_contract.breaking_unmigrated",
    ["--skill-root", skillRoot, "--capability-delta", pendingPath],
  );

  const proofRoot = makeEmptyFixture("provider-proof-breaking-unmigrated");
  runFixture(
    "provider-proof readiness fails closed on an unmigrated breaking delta",
    proofRoot,
    "check-live-provider-proof.ts",
    1,
    "provider_proof.capability_delta.breaking_unmigrated",
    ["--skill-root", skillRoot, "--capability-delta", pendingPath],
  );

  const applePendingRoot = makeEmptyFixture("capability-delta-apple-breaking-pending");
  const applePath = path.join(applePendingRoot, "capability-delta.yaml");
  writeFile(
    applePendingRoot,
    "capability-delta.yaml",
    shipped("capability-delta.yaml")
      .replace(
        "classification: ignore\n    summary: Upload-builds help chrome changed. Slice 0 ASC capability receipt still names the observe commands.",
        "classification: breaking\n    summary: Apple ASC changed a contracted observe command without a migration path.",
      )
      .replace(
        "summary: Apple ASC changed a contracted observe command without a migration path.\n    migration: none",
        "summary: Apple ASC changed a contracted observe command without a migration path.\n    migration: pending",
      ),
  );
  runFixture(
    "unscoped provider-proof fails closed on an unmigrated Apple breaking delta",
    makeEmptyFixture("provider-proof-apple-breaking-unscoped"),
    "check-live-provider-proof.ts",
    1,
    "provider_proof.capability_delta.breaking_unmigrated",
    ["--skill-root", skillRoot, "--capability-delta", applePath],
  );
  runFixture(
    "scoped provider-proof ignores an unrelated Apple breaking delta",
    makeEmptyFixture("provider-proof-apple-breaking-scoped"),
    "check-live-provider-proof.ts",
    1,
    undefined,
    ["--skill-root", skillRoot, "--capability-delta", applePath, "--providers", "PostHog,RevenueCat"],
    undefined,
    "provider_proof.capability_delta.breaking_unmigrated",
  );

  const missingDelta = path.join(makeEmptyFixture("capability-delta-missing-file"), "missing-capability-delta.yaml");
  runFixture(
    "revenue readiness fails closed when the capability-delta ledger is missing",
    makeEmptyFixture("revenue-delta-missing"),
    "check-revenue.ts",
    1,
    "revenue.provider_contract.delta_load_failed",
    ["--skill-root", skillRoot, "--capability-delta", missingDelta],
  );
  runFixture(
    "provider-proof readiness fails closed when the capability-delta ledger is missing",
    makeEmptyFixture("provider-proof-delta-missing"),
    "check-live-provider-proof.ts",
    1,
    "provider_proof.capability_delta.load_failed",
    ["--skill-root", skillRoot, "--capability-delta", missingDelta],
  );

  const malformedRoot = makeEmptyFixture("capability-delta-malformed");
  const malformedPath = path.join(malformedRoot, "capability-delta.yaml");
  writeFile(malformedRoot, "capability-delta.yaml", ":\n- this is not valid capability-delta yaml\n");
  runFixture(
    "revenue readiness fails closed when the capability-delta ledger is malformed",
    makeEmptyFixture("revenue-delta-malformed"),
    "check-revenue.ts",
    1,
    "revenue.provider_contract.delta_load_failed",
    ["--skill-root", skillRoot, "--capability-delta", malformedPath],
  );
  runFixture(
    "provider-proof readiness fails closed when the capability-delta ledger is malformed",
    makeEmptyFixture("provider-proof-delta-malformed"),
    "check-live-provider-proof.ts",
    1,
    "provider_proof.capability_delta.load_failed",
    ["--skill-root", skillRoot, "--capability-delta", malformedPath],
  );

  const unsupportedRoot = makeEmptyFixture("capability-delta-unsupported-schema");
  const unsupportedPath = path.join(unsupportedRoot, "capability-delta.yaml");
  writeFile(unsupportedRoot, "capability-delta.yaml", shipped("capability-delta.yaml").replace("schema_version: 1", "schema_version: 99"));
  runFixture(
    "revenue readiness fails closed when the capability-delta schema is unsupported",
    makeEmptyFixture("revenue-delta-unsupported-schema"),
    "check-revenue.ts",
    1,
    "revenue.provider_contract.delta_load_failed",
    ["--skill-root", skillRoot, "--capability-delta", unsupportedPath],
  );
  runFixture(
    "provider-proof readiness fails closed when the capability-delta schema is unsupported",
    makeEmptyFixture("provider-proof-delta-unsupported-schema"),
    "check-live-provider-proof.ts",
    1,
    "provider_proof.capability_delta.load_failed",
    ["--skill-root", skillRoot, "--capability-delta", unsupportedPath],
  );

  const emptyHome = makeEmptyFixture("runtime-pins-missing-skip");
  runScriptArgs(
    "skill version skips missing client runtimes",
    "check-skill-version.ts",
    ["--source", skillRoot, "--installed", skillRoot, "--all-runtimes", "--runtimes-root", emptyHome],
    0,
  );

  const behindHome = makeEmptyFixture("runtime-pins-behind");
  const behindRuntime = path.join(behindHome, ".codex", "skills", "b2c-app-builder");
  mkdirSync(behindRuntime, { recursive: true });
  writeFileSync(path.join(behindRuntime, "skill-version.json"), `${JSON.stringify({ skill: "b2c-app-builder", version: "0.1.0" }, null, 2)}\n`);
  runScriptArgs(
    "skill version fails when a present client trails the source pin",
    "check-skill-version.ts",
    ["--source", skillRoot, "--installed", skillRoot, "--all-runtimes", "--runtimes-root", behindHome],
    1,
    "skill_version.runtime_behind_pin",
  );
}
