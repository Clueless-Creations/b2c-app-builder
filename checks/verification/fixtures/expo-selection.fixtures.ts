import { readFileSync } from "node:fs";
import path from "node:path";
import { composeCatalog } from "../../../catalog/index.js";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import {
  EXPO_APP_RUNTIME,
  EXPO_IS_DEFAULT_STACK,
  EXPO_KNOWLEDGE_REFERENCE_IDS,
  EXPO_QUEUED_OWNERS,
  EXPO_SOURCE_URLS,
  evaluateExpoCompatibility,
  HOST_AGENT_RUNTIME,
  isExpoAppTarget,
  isHostAgentTarget,
  operationFor,
  resolveExpoSelection,
  shippingSatisfiesRequirement,
  SHIPPING_PLATFORM_STEWARD_PROPOSAL,
} from "../../../catalog/stacks/expo-selection.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { HOSTED_BUNDLE_RELATIVE_PATH } from "../../../tooling/render-hosted-bundle.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function searchIds(query: string): string[] {
  const bundle = JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
  const service = createKnowledgeService(bundle);
  return service.search({ query, limit: 8 }).results.map((result) => result.referenceId);
}

export function register(harness: Harness): void {
  harness.check("expo selection: Expo is selectable, not default, and has no global supported boolean", () => {
    const resolution = resolveExpoSelection({ compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME } });
    assert(EXPO_IS_DEFAULT_STACK === false, "Expo must not be the default stack");
    assert(resolution.defaultStack === false, "resolution claimed Expo is default");
    assert(resolution.appStackSelected, "ios/expo must select the Expo app stack");
    assert(!("supported" in resolution) && !("expoSupported" in resolution), "must not export a global Expo supported flag");
    assert(resolution.hostAgentInferredAsApp === false, "must never infer an app from host-agent");
    assert(resolution.webSatisfiesNativeRequirement === false, "web must not satisfy native");
  });

  harness.check("expo selection: a native app target is not inferred from host-agent, and detection is not consent", () => {
    const host = resolveExpoSelection({
      compositionTarget: { platform: "host", runtime: HOST_AGENT_RUNTIME },
      detectedExpoDependency: true,
    });
    assert(isHostAgentTarget(host.compositionTarget), "host/agent-cli is the worker target");
    assert(!isExpoAppTarget(host.compositionTarget), "host-agent is not an Expo app target");
    assert(!host.appStackSelected, "detection must not select the Expo stack");
    assert(host.detectedNotSelected, "expo in package.json without composition selection is detected-not-selected");
    assert(host.idleUnselectedServices.includes("eas-build"), "unselected EAS Build must stay idle");
    assert(host.idleUnselectedServices.includes("billing"), "unselected billing must stay idle");
    assert(host.idleUnselectedServices.includes("expo-mcp"), "unselected Expo MCP must stay idle");
  });

  harness.check("expo selection: web export cannot satisfy iOS or Android, and SwiftUI is not an Expo alias", () => {
    const web = resolveExpoSelection({ compositionTarget: { platform: "web", runtime: EXPO_APP_RUNTIME } });
    assert(web.shippingPlatform === "web", "web/expo must record web shipping");
    assert(!shippingSatisfiesRequirement(web.shippingPlatform, "ios"), "web must not satisfy iOS");
    assert(!shippingSatisfiesRequirement(web.shippingPlatform, "android"), "web must not satisfy Android");
    const swiftui = resolveExpoSelection({ compositionTarget: { platform: "ios", runtime: "swiftui" } });
    assert(!swiftui.appStackSelected, "ios/swiftui must not select Expo");
    assert(swiftui.knowledgeReferenceIds.length === 3, "Expo knowledge ids stay discoverable without selecting Expo");
  });

  harness.check("expo selection: unselected EAS and RevenueCat do not add obligations to an Expo app target", () => {
    const selected = resolveExpoSelection({ compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME } });
    assert(operationFor(selected, "eas-cloud-build").evidenceTier === "blocked", "EAS cloud build must stay blocked until selected and implemented");
    assert(operationFor(selected, "native-purchases").evidenceTier === "blocked", "native purchases stay blocked for #83");
    assert(operationFor(selected, "native-purchases").queuedIssue === 83, "native purchases are not the RevenueCat CLI issue");
    const withEas = resolveExpoSelection({
      compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME },
      selectedServices: ["eas-build"],
    });
    assert(withEas.selectedServices.includes("eas-build"), "explicit EAS Build selection must be visible");
    assert(!withEas.idleUnselectedServices.includes("eas-build"), "selected EAS Build is not idle");
    assert(withEas.idleUnselectedServices.includes("eas-update"), "unselected EAS Update stays idle");
    assert(operationFor(withEas, "eas-cloud-build").queuedIssue === 84, "EAS execution remains #84");
    assert(operationFor(selected, "cng-prebuild").evidenceTier === "blocked", "CNG must stay blocked until #82");
    assert(operationFor(selected, "official-skills").evidenceTier === "blocked", "official skills must stay blocked until #87");
  });

  harness.check("expo selection: Expo knowledge is not required guidance on SwiftUI-default workflows", () => {
    const catalog = composeCatalog(skillRoot);
    const swiftuiDefaultWorkflows = [
      "workflow.product.app-archetype-detection-and-starter",
      "workflow.engineering.native-ios-proof-route-ladder",
      "workflow.engineering.app-quality-and-vitals",
      "workflow.engineering.engineering-orchestration-ce-production-readiness",
    ] as const;
    for (const workflowId of swiftuiDefaultWorkflows) {
      const workflow = catalog.workflows.find((entry) => entry.id === workflowId);
      assert(workflow, `expected ${workflowId} in the composed catalog`);
      const expoRefs = (workflow?.referenceIds ?? []).filter((id) =>
        (EXPO_KNOWLEDGE_REFERENCE_IDS as readonly string[]).includes(id),
      );
      assert(expoRefs.length === 0, `${workflowId} must not list Expo refs as required guidance; got ${expoRefs.join(", ")}`);
    }
  });

  harness.check("expo selection: missing or mismatched SDK pins are incompatibilities, never automatic upgrades", () => {
    const missing = evaluateExpoCompatibility({});
    assert(missing.sdk === "unknown" && missing.autoUpgradeAttempted === false, "missing pin must be unknown without auto-upgrade");
    assert(missing.actionable.includes("Do not run an automatic upgrade"), missing.actionable);
    const mismatched = evaluateExpoCompatibility({ expoSdk: "56.0.0", reactNative: "0.85.0", react: "19.1.0" });
    assert(mismatched.sdk === "mismatch" && mismatched.reactNative === "mismatch", "major mismatches must be mismatch");
    assert(mismatched.react === "match", "React 19.1 vs reviewed 19.2 is the same semver major");
    assert(mismatched.autoUpgradeAttempted === false, "mismatch must not attempt auto-upgrade");
    const matching = evaluateExpoCompatibility({ expoSdk: "57.0.17", reactNative: "0.86.0", react: "19.2.0" });
    assert(matching.sdk === "match" && matching.reactNative === "match" && matching.react === "match", "reviewed majors should match");
    assert(matching.actionable.includes("unverified"), "matching majors are not live CLI proof");
  });

  harness.check("expo selection: first-party SwiftUI operations do not gain Expo targets by alias", () => {
    const owner = readFirstpartyPackage(skillRoot);
    const extension = owner.snapshot.extension;
    const mobileOrMoney = extension.implementations.filter(
      (implementation) => implementation.operation.startsWith("b2c/monetization.") || implementation.operation.startsWith("b2c/mobile-app-operation."),
    );
    assert(mobileOrMoney.length > 0, "expected first-party mobile/monetization implementations");
    assert(
      mobileOrMoney.every((implementation) => !implementation.targets.some((target) => target.runtime === EXPO_APP_RUNTIME)),
      "must not append expo onto unimplemented first-party operations",
    );
    const expoBusiness = resolveRecipeBindings({
      packages: [owner],
      recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: "b2c/complete-consumer-business" },
      target: { platform: "ios", runtime: EXPO_APP_RUNTIME },
    });
    assert(expoBusiness.status === "refused", "complete-business must not execute as ios/expo");
    assert(
      expoBusiness.bindings.some((binding) => binding.reasonCodes.includes("binding.target_mismatch")),
      "ios/expo must mismatch host-agent worker targets instead of aliasing SwiftUI",
    );
    const hostBusiness = resolveRecipeBindings({
      packages: [owner],
      recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: "b2c/complete-consumer-business" },
      target: { platform: "host", runtime: HOST_AGENT_RUNTIME },
    });
    assert(hostBusiness.status === "resolved", "existing host/agent-cli complete-business meaning must stay resolved");
    const swiftuiPaywall = resolveRecipeBindings({
      packages: [owner],
      recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: "b2c/subscription-app" },
      target: { platform: "ios", runtime: "swiftui" },
    });
    assert(swiftuiPaywall.status === "refused" && swiftuiPaywall.reasonCodes.includes("binding.recipe_unavailable"), "ios/swiftui subscription-app stays experimental");
    const expoPaywall = resolveRecipeBindings({
      packages: [owner],
      recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: "b2c/subscription-app" },
      target: { platform: "ios", runtime: EXPO_APP_RUNTIME },
    });
    assert(expoPaywall.status === "refused", "ios/expo must not bind the SwiftUI subscription recipe");
  });

  harness.check("expo selection: steward proposal names the missing product.yaml fact without inventing it", () => {
    assert("product.platforms" in SHIPPING_PLATFORM_STEWARD_PROPOSAL.examples.not, "proposal must name the forbidden product.platforms field");
    assert(SHIPPING_PLATFORM_STEWARD_PROPOSAL.examples.composition.runtime === EXPO_APP_RUNTIME, "canonical example is composition target");
    const productYaml = readFileSync(path.join(skillRoot, "catalog/ontology/instance.schema.json"), "utf8");
    assert(!productYaml.includes("product.platforms"), "instance schema must not gain a hidden platforms field from this package");
    assert(EXPO_QUEUED_OWNERS.some((owner) => owner.issue === 82 && owner.doNot.includes("habit-tracker")), "queued #82 ownership must be explicit");
    assert(EXPO_QUEUED_OWNERS.some((owner) => owner.issue === 84 && owner.doNot.includes("RevenueCat")), "queued #84 must not share a CLI framework with RevenueCat");
  });

  harness.check("expo selection: decision-focused retrieval hits Expo guidance and a SwiftUI query does not alias it", () => {
    const cases: Array<{ query: string; expected: (typeof EXPO_KNOWLEDGE_REFERENCE_IDS)[number] }> = [
      { query: "build iOS and Android with Expo", expected: "reference.engineering.expo-operations-map" },
      { query: "adopt an existing Expo app without EAS", expected: "reference.engineering.expo-operations-map" },
      { query: "add a native module", expected: "reference.engineering.expo-operations-map" },
      { query: "Expo web only", expected: "reference.engineering.expo-operations-map" },
      { query: "upgrade without losing native customizations", expected: "reference.engineering.expo-compatibility" },
      { query: "selecting Expo as the app stack rather than SwiftUI", expected: "reference.engineering.expo-stack-selection" },
    ];
    for (const { query, expected } of cases) {
      const ids = searchIds(query);
      assert(ids.includes(expected), `${query} missed ${expected}; got ${ids.join(", ")}`);
    }
    const counter = searchIds("SwiftUI String Catalogs localization");
    assert(!counter[0]?.includes("expo-operations-map"), `SwiftUI localization must not rank Expo operations first; got ${counter.join(", ")}`);
    assert(!counter[0]?.includes("expo-compatibility"), `SwiftUI localization must not rank Expo compatibility first; got ${counter.join(", ")}`);
  });

  harness.check("expo selection: required Expo guidance is revision-checked and stale hashes fail closed", () => {
    const bundle = JSON.parse(readFileSync(path.join(skillRoot, HOSTED_BUNDLE_RELATIVE_PATH), "utf8")) as HostedKnowledgeBundle;
    const service = createKnowledgeService(bundle);
    for (const referenceId of EXPO_KNOWLEDGE_REFERENCE_IDS) {
      const discovered = service.get({ referenceId });
      const contentSha256 = discovered.reference.contentSha256;
      const sections = service.get({ referenceId, view: "sections", expectedContentSha256: contentSha256 });
      assert((sections.sections?.items.length ?? 0) > 0, `${referenceId} must expose bounded sections`);
      const section = sections.sections!.items[0]!;
      const page = service.get({
        referenceId,
        sectionId: section.id,
        expectedContentSha256: contentSha256,
      });
      assert(page.section?.id === section.id, `${referenceId} section get must honor discovery`);
      let stale = false;
      try {
        service.get({ referenceId, sectionId: section.id, expectedContentSha256: "0".repeat(64) });
      } catch {
        stale = true;
      }
      assert(stale, `${referenceId} must refuse a stale content hash`);
    }
    assert(Object.values(EXPO_SOURCE_URLS).every((url) => url.startsWith("https://")), "consumed Expo sources must be https citations");
  });
}
