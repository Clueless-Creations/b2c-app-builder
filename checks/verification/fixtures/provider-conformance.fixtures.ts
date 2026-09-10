/**
 * Independent provider-conformance provenance and upgrade-plan delta (#110, #111).
 *
 * Uses existing RevenueCat, EAS, and Layers native samples. Does not wrap a new vendor
 * and does not mutate live providers.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  adapterGeneratedMentions,
  describeConformanceCoverage,
  isIndependentEvidence,
  type ProviderConformanceProvenance,
} from "../../../catalog/providers/conformance.js";
import { providerCapabilityDeltaSchema } from "../../../contracts/contribution/contract.js";
import { upgradePlan } from "../../../kernel/contribution/upstreams.js";
import { reviewedNativeContractDelta } from "../../../kernel/contribution/provider-capability-delta.js";
import {
  INCREMENT_B_MALFORMED_OFFERINGS_CREATE_ARGV,
  PINNED_OFFERINGS_CREATE_ARGV,
  REVENUECAT_CLI_COMMAND_SCHEMA_PIN,
  qualifyRevenueCatNativeArgv,
} from "../../../adapters/providers/revenuecat/cli-command-schema.js";
import {
  interpretOfferingPreview,
  offeringVerifyIsComplete,
} from "../../../adapters/providers/revenuecat/cli-decode.js";
import { decodeExpoEasResponse } from "../../../adapters/providers/expo/decode.js";
import { LAYERS_RECORDED_TOOLS, LAYERS_RENDER_TOOL } from "../../../adapters/providers/layers/index.js";
import {
  UPSTREAM_SDK_PREVIEW_MINIMAL,
  UPSTREAM_VERIFY_EMPTY_ISSUES_ONLY,
  UPSTREAM_VERIFY_GRAPH,
} from "./revenuecat-cli-decode.samples.js";
import {
  ADDED_NATIVE_FEATURE_DELTA,
  EAS_RESPONSE_SHAPE_DELTA,
  INSUFFICIENT_EVIDENCE_DELTA,
  KERNEL_SECURITY_REPAIR_DELTA,
  REMOVED_NATIVE_FEATURE_DELTA,
  REVENUECAT_SYNTAX_ONLY_DELTA,
  SOURCE_PAGE_CHROME_DELTA,
  UNINSPECTED_AUTH_DELTA,
} from "./provider-capability-delta.samples.js";
import {
  PROVIDER_BOUNDARY_RULE,
  classifyProviderBoundaryImport,
  collectProviderBoundaryIssues,
} from "../../validation/repository/check-provider-boundary.js";
import { collectArchitectureIssues } from "../../validation/repository/check-architecture.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const EAS_NATIVE_DIR = path.join(skillRoot, "checks/verification/test/data/expo-eas");

function provenance(record: ProviderConformanceProvenance): ProviderConformanceProvenance {
  return record;
}

export function register(harness: Harness): void {
  harness.check("provider-conformance: malformed RevenueCat offerings create fails without the encoder", () => {
    const schemaSource = readFileSync(path.join(skillRoot, "adapters/providers/revenuecat/cli-command-schema.ts"), "utf8");
    const encoderSource = readFileSync(path.join(skillRoot, "adapters/providers/revenuecat/cli-operations.ts"), "utf8");
    assert(!schemaSource.includes("buildRevenueCatCliArgv"), "pinned cobra schema must not import the encoder");
    assert(encoderSource.includes("buildRevenueCatCliArgv"), "encoder still owns argv construction");
    const malformed = qualifyRevenueCatNativeArgv(INCREMENT_B_MALFORMED_OFFERINGS_CREATE_ARGV);
    const pinned = qualifyRevenueCatNativeArgv(PINNED_OFFERINGS_CREATE_ARGV);
    assert(malformed.ok === false && malformed.code === "unexpected-positional", JSON.stringify(malformed));
    assert(pinned.ok === true && pinned.command[0] === "offerings", JSON.stringify(pinned));
    const record = provenance({
      provider: "revenuecat-cli",
      transport: "cli",
      reviewedVersion: REVENUECAT_CLI_COMMAND_SCHEMA_PIN.version,
      reviewedRevision: REVENUECAT_CLI_COMMAND_SCHEMA_PIN.commit,
      sourceSelector: "RevenueCat/cli internal/cli/offerings.go newOfferingsCreateCmd",
      nativeOperation: "offerings create",
      canonicalOperation: "rc.catalog.create",
      evidenceKind: "deliberately-altered-negative",
      establishes: ["request-shape"],
      coverageLimits: "Create/attach cobra flags at v0.1.1 only. Not a live catalog mutation.",
      sample: INCREMENT_B_MALFORMED_OFFERINGS_CREATE_ARGV,
    });
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
  });

  harness.check("provider-conformance: SDK preview and EAS array/object envelopes keep distinct native contracts", () => {
    const preview = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test", offeringLookupKey: "default" });
    assert(preview.protocolValid === true && preview.offeringRemoteId === null, JSON.stringify(preview));
    const sampleSource = readFileSync(path.join(skillRoot, "checks/verification/fixtures/revenuecat-cli-decode.samples.ts"), "utf8");
    assert(adapterGeneratedMentions(sampleSource, ["buildRevenueCatCliArgv", "buildExpoEasArgv"]).length === 0, "SDK preview sample must not name encoders");
    const cloud = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: readFileSync(path.join(EAS_NATIVE_DIR, "build-cloud-one-element-array.json"), "utf8"),
      expected: { platform: "ios", profile: "preview", easProjectId: "proj_approved" },
    });
    const view = decodeExpoEasResponse({
      commandId: "eas.build.view",
      stdout: readFileSync(path.join(EAS_NATIVE_DIR, "build-view-single-object.json"), "utf8"),
      expected: { platform: "ios", profile: "preview", easProjectId: "proj_approved", buildId: "11111111-1111-4111-8111-111111111111" },
    });
    const mistaken = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: readFileSync(path.join(EAS_NATIVE_DIR, "build-mistaken-single-object.json"), "utf8"),
      expected: { platform: "ios", profile: "preview", easProjectId: "proj_approved" },
    });
    assert(cloud.protocolValid && cloud.boundRemoteId === "11111111-1111-4111-8111-111111111111", cloud.message);
    assert(view.protocolValid && view.boundRemoteId === cloud.boundRemoteId, `${view.boundRemoteId} vs ${cloud.boundRemoteId}`);
    assert(mistaken.protocolValid === false && mistaken.code === "wrong-shape", mistaken.code);
    assert(cloud.qualifiedRemoteIds[0]?.startsWith("eas:build:"), cloud.qualifiedRemoteIds.join(","));
    const easReadme = readFileSync(path.join(EAS_NATIVE_DIR, "README.md"), "utf8");
    assert(adapterGeneratedMentions(easReadme, ["buildExpoEasArgv"]).length === 0, "EAS native envelopes must not name the encoder");
  });

  harness.check("provider-conformance: protocol-valid preview is not a complete verify graph", () => {
    const preview = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test" });
    const emptyIssues = offeringVerifyIsComplete(UPSTREAM_VERIFY_EMPTY_ISSUES_ONLY);
    const graph = offeringVerifyIsComplete(UPSTREAM_VERIFY_GRAPH);
    assert(preview.protocolValid === true, "recognized SDK preview stays protocol-valid");
    assert(emptyIssues.protocolValid === false && emptyIssues.complete === false, JSON.stringify(emptyIssues));
    assert(graph.protocolValid === true && graph.complete === false, "draft paywall is not completeness");
    assert(preview.complete !== true || emptyIssues.complete === false, "preview completeness must not satisfy verify completeness");
  });

  harness.check("provider-conformance: adapter-generated samples are not independent evidence", () => {
    const generated: ProviderConformanceProvenance = {
      provider: "revenuecat-cli",
      transport: "cli",
      reviewedVersion: "0.1.1",
      reviewedRevision: REVENUECAT_CLI_COMMAND_SCHEMA_PIN.commit,
      sourceSelector: "adapters/providers/revenuecat/cli-operations.ts buildRevenueCatCliArgv",
      nativeOperation: "offerings create",
      canonicalOperation: "rc.catalog.create",
      evidenceKind: "adapter-generated",
      establishes: ["request-shape"],
      coverageLimits: "Echo of the encoder. Does not prove the upstream cobra schema.",
      sample: { argv: ["offerings", "create"] },
    };
    assert(isIndependentEvidence(generated.evidenceKind) === false, describeConformanceCoverage(generated));
    const mentions = adapterGeneratedMentions("const argv = buildRevenueCatCliArgv(request);", ["buildRevenueCatCliArgv"]);
    assert(mentions.includes("buildRevenueCatCliArgv"), mentions.join(","));
  });

  harness.check("provider-conformance: Layers adopts the same provenance type without a harness branch", () => {
    const recorded = LAYERS_RECORDED_TOOLS.find((tool) => tool.name === LAYERS_RENDER_TOOL);
    assert(recorded?.charged === true, JSON.stringify(recorded));
    const record = provenance({
      provider: "layers-growth-mcp",
      transport: "mcp",
      reviewedVersion: "docs-2026-09-05",
      reviewedRevision: "unknown",
      sourceSelector: "https://layers.com/docs/mcp render_content",
      nativeOperation: LAYERS_RENDER_TOOL,
      canonicalOperation: "layers-growth/creative.draft-creative",
      evidenceKind: "official-example",
      establishes: ["request-shape", "effect"],
      coverageLimits: "Documented tool name and billing only. No live tools/list. Fake transport tests wiring.",
      sample: recorded,
    });
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(record.provider !== "revenuecat-cli", "the helper does not switch on provider id");
  });

  harness.check("provider-conformance: forbidden core vendor import fails; composition and generated-app SDK pass", () => {
    const forbidden = classifyProviderBoundaryImport("kernel/engine/reducer.ts", "adapters/providers/revenuecat/cli-operations.ts");
    const composition = classifyProviderBoundaryImport("kernel/session/doctor.ts", "adapters/providers/revenuecat/cli-doctor.ts");
    const generated = classifyProviderBoundaryImport("examples/extensions/superwall-ios/App.swift", "react-native-purchases");
    const shared = classifyProviderBoundaryImport("kernel/contribution/upstreams.ts", "adapters/providers/load.ts");
    const sdk = classifyProviderBoundaryImport("kernel/engine/policy.ts", "@revenuecat/purchases-js");
    assert(forbidden.kind === "forbidden", JSON.stringify(forbidden));
    assert(composition.kind === "allowed", JSON.stringify(composition));
    assert(generated.kind === "allowed", JSON.stringify(generated));
    assert(shared.kind === "allowed", JSON.stringify(shared));
    assert(sdk.kind === "forbidden", JSON.stringify(sdk));
    const issues = collectProviderBoundaryIssues([
      {
        from: "kernel/engine/reducer.ts",
        line: 1,
        specifier: "../adapters/providers/revenuecat/cli-operations.js",
        resolved: "adapters/providers/revenuecat/cli-operations.ts",
      },
    ]);
    assert(issues.some((item) => item.code === PROVIDER_BOUNDARY_RULE), issues.map((item) => item.code).join(","));
  });

  harness.check("provider-conformance: architecture check on this checkout has no provider-native core leak", () => {
    const issues = collectArchitectureIssues({ repoRoot: skillRoot });
    const provider = issues.filter((item) => item.code === PROVIDER_BOUNDARY_RULE);
    assert(provider.length === 0, provider.map((item) => `${item.file}: ${item.message}`).join(" | "));
  });

  harness.check("provider-conformance: upgrade-plan keeps non-provider plans and unknown provider deltas", () => {
    const now = () => new Date("2026-09-05T22:00:00.000Z");
    const skills = upgradePlan({ skillRoot, now }, { upstreamId: "rork-app-store-connect-cli-skills" });
    const rork = upgradePlan({ skillRoot, now }, { upstreamId: "rork-app-store-connect-cli" });
    const revenuecat = upgradePlan({ skillRoot, now }, { upstreamId: "revenuecat-cli" });
    assert(skills.effectsUnchanged === true && skills.providerCapabilityDelta.applicable === false, JSON.stringify(skills.providerCapabilityDelta));
    assert(rork.providerCapabilityDelta.applicable === true, JSON.stringify(rork.providerCapabilityDelta));
    assert(rork.providerCapabilityDelta.mappingImpact?.adapterEncoder === "unknown", "uninspected native mapping stays unknown");
    assert(rork.providerCapabilityDelta.versionFacts?.workspacePin === "unchanged", JSON.stringify(rork.providerCapabilityDelta.versionFacts));
    assert(revenuecat.providerCapabilityDelta.sourcePageDelta?.owner === "catalog/providers/capability-delta.yaml", JSON.stringify(revenuecat.providerCapabilityDelta.sourcePageDelta));
    assert(
      revenuecat.providerCapabilityDelta.sourcePageDelta?.classification === null,
      "cli source ids are not on the hash ledger; chrome classification stays in SOURCE_PAGE_CHROME_DELTA",
    );
    assert(providerCapabilityDeltaSchema.parse(skills.providerCapabilityDelta).applicable === false, "non-provider delta parses");
    const target = harness.makeTempDir("upgrade-plan-delta");
    const written = upgradePlan({ skillRoot, now }, { upstreamId: "rork-app-store-connect-cli", target });
    assert(written.written === path.join(target, "contribution.yaml"), written.written ?? "none");
    const yamlText = readFileSync(written.written, "utf8");
    assert(!yamlText.includes("provider_capability_delta"), "contribution.yaml stays the historical manifest");
    const adoptionMap = readFileSync(path.join(target, "ADOPTION_MAP.md"), "utf8");
    assert(adoptionMap.includes("## Provider Capability Delta"), "ADOPTION_MAP.md carries the optional delta");
  });

  harness.check("provider-conformance: synthetic RevenueCat and EAS deltas stay bounded", () => {
    assert(REVENUECAT_SYNTAX_ONLY_DELTA.mappingImpact?.adapterEncoder === "changed", "syntax-only hits encoder");
    assert(REVENUECAT_SYNTAX_ONLY_DELTA.mappingImpact?.workflowOrKernelChange === "unchanged", "syntax-only does not change workflows");
    assert(EAS_RESPONSE_SHAPE_DELTA.mappingImpact?.adapterDecoder === "changed", "response shape hits decoder");
    assert(EAS_RESPONSE_SHAPE_DELTA.mappingImpact?.workflowOrKernelChange === "unchanged", "decoder change keeps kernel unchanged");
    assert(ADDED_NATIVE_FEATURE_DELTA.mappingImpact?.canonicalContractChange === "unchanged", "added native feature is not a new canonical operation");
    assert(REMOVED_NATIVE_FEATURE_DELTA.nativeChanges?.removed.status === "changed", "removed native alias is recorded");
    assert(REMOVED_NATIVE_FEATURE_DELTA.mappingImpact?.canonicalContractChange === "unchanged", "removed native alias is not a removed canonical operation");
    assert(UNINSPECTED_AUTH_DELTA.nativeChanges?.authentication.status === "unknown", "uninspected auth is unknown");
    assert(SOURCE_PAGE_CHROME_DELTA.sourcePageDelta?.classification === "ignore", "chrome stays on the hash ledger");
    assert(INSUFFICIENT_EVIDENCE_DELTA.mappingImpact?.adapterEncoder === "unknown", "missing schema stays unknown");
    assert(KERNEL_SECURITY_REPAIR_DELTA.mappingImpact?.workflowOrKernelJustification?.includes("recovery"), KERNEL_SECURITY_REPAIR_DELTA.mappingImpact?.workflowOrKernelJustification ?? "");
    let refused = false;
    try {
      reviewedNativeContractDelta({
        provider: "eas-cli",
        transport: "cli",
        fromReviewed: "23.2.0",
        toCandidate: "23.2.0",
        nativeChanges: EAS_RESPONSE_SHAPE_DELTA.nativeChanges!,
        mappingImpact: {
          adapterEncoder: "unchanged",
          adapterTransport: "unchanged",
          adapterDecoder: "unchanged",
          reconciler: "unchanged",
          supportDeclaration: "unchanged",
          canonicalContractChange: "unchanged",
          workflowOrKernelChange: "changed",
        },
        notes: ["missing justification"],
      });
    } catch {
      refused = true;
    }
    assert(refused, "kernel change without a security/recovery or semantic justification must refuse");
    providerCapabilityDeltaSchema.parse(UNINSPECTED_AUTH_DELTA);
    providerCapabilityDeltaSchema.parse(SOURCE_PAGE_CHROME_DELTA);
    providerCapabilityDeltaSchema.parse(INSUFFICIENT_EVIDENCE_DELTA);
  });
}
