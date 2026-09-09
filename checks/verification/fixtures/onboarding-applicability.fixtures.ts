import { cpSync, writeFileSync } from "node:fs";
import path from "node:path";
import { firstpartyImplementations, firstpartyRecipes } from "../../../catalog/firstparty-declarations.js";
import { FIRSTPARTY_BUSINESS_RECIPE } from "../../../catalog/firstparty-recipes.js";
import {
  COMMITMENT_FUNNEL_FEATURE_ID,
  COMPLETE_CONSUMER_BUSINESS_RECIPE_ID,
  ENTITLEMENT_OPERATION,
  PAYWALL_GOAL_HEADLINE_FEATURE_ID,
  PRESENT_PAYWALL_OPERATION,
  PURCHASE_OPERATION,
  REVENUECAT_PROVIDER_ID,
  SUPERWALL_PROVIDER_ID,
  loadOnboardingApplicability,
  projectOnboardingApplicability,
} from "../../../catalog/ontology/onboarding-applicability.js";
import type { ProductCopy, ProductInstanceDocument } from "../../../catalog/ontology/instance-types.js";
import type { Composition } from "../../../contracts/public-api/contract.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const copy: ProductCopy = {
  intro: "fixture",
  promiseUserProblem: "fixture",
  evidenceAndCategory: "fixture",
  coreLoop: "fixture",
  completeScope: "fixture",
  requirements: "fixture",
  journey: "fixture",
  metrics: "fixture",
  risks: "fixture",
  decisionLog: "fixture",
  ownership: "fixture",
};

function featureDoc(features: ReadonlyArray<{ id: string; scope: string }>): ProductInstanceDocument {
  return {
    schemaVersion: 1,
    meta: { version: "alpha", name: "fixture", description: "fixture", status: "partial" },
    copy,
    instances: features.map((feature) => ({
      id: feature.id,
      classId: "class.feature",
      slots: { "slot.feature.scope": [feature.scope] },
    })),
  };
}

function composition(recipeId: string, presentPaywallProvider?: string): Composition {
  return {
    apiVersion: "b2c/v1",
    recipe: { id: recipeId, version: "1.0.0" },
    target: { platform: "ios", runtime: "swiftui" },
    bindings:
      presentPaywallProvider === undefined
        ? {}
        : {
            [PRESENT_PAYWALL_OPERATION]: { provider: { id: presentPaywallProvider, version: "1.0.0" } },
          },
  };
}

const requiredHeadline = featureDoc([
  { id: COMMITMENT_FUNNEL_FEATURE_ID, scope: "required" },
  { id: PAYWALL_GOAL_HEADLINE_FEATURE_ID, scope: "required" },
]);

export function register(harness: Harness): void {
  harness.check("onboarding-applicability: subscription-app still defaults monetization operations to RevenueCat", () => {
    const recipe = firstpartyRecipes.find((entry) => entry.id === "b2c/subscription-app");
    assert(recipe !== undefined, "missing b2c/subscription-app recipe");
    for (const operation of [PRESENT_PAYWALL_OPERATION, PURCHASE_OPERATION, ENTITLEMENT_OPERATION]) {
      const entry = recipe.operations.find((item) => item.operation === operation);
      assert(entry !== undefined, `b2c/subscription-app lost ${operation}`);
      const provider = firstpartyImplementations.find((item) => item.id === entry.implementation)?.provider;
      assert(provider === REVENUECAT_PROVIDER_ID, `${operation} defaulted to ${String(provider)} instead of ${REVENUECAT_PROVIDER_ID}`);
    }
    assert(FIRSTPARTY_BUSINESS_RECIPE.id === COMPLETE_CONSUMER_BUSINESS_RECIPE_ID, "complete-consumer-business recipe id drifted");
    assert(
      !firstpartyRecipes.some((entry) => entry.id === COMPLETE_CONSUMER_BUSINESS_RECIPE_ID),
      "complete-consumer-business unexpectedly appeared in firstpartyRecipes; update recipeProviderDecision",
    );
  });

  harness.check("onboarding-applicability: excluded features are not required", () => {
    const projected = projectOnboardingApplicability(
      featureDoc([
        { id: COMMITMENT_FUNNEL_FEATURE_ID, scope: "excluded" },
        { id: PAYWALL_GOAL_HEADLINE_FEATURE_ID, scope: "non-goal" },
      ]),
      undefined,
    );
    assert(projected.commitmentFunnel === "not_required", `funnel ${projected.commitmentFunnel}`);
    assert(projected.headlineBind === "not_required", `headline ${projected.headlineBind}`);
    assert(projected.presentPaywall.status === "unresolved", "missing composition must stay unresolved");
  });

  harness.check("onboarding-applicability: absent features stay unresolved", () => {
    const projected = projectOnboardingApplicability(featureDoc([]), undefined);
    assert(projected.commitmentFunnel === "unresolved", `funnel ${projected.commitmentFunnel}`);
    assert(projected.headlineBind === "unresolved", `headline ${projected.headlineBind}`);
  });

  harness.check("onboarding-applicability: required headline without composition still selects the bind", () => {
    const projected = projectOnboardingApplicability(requiredHeadline, undefined);
    assert(projected.commitmentFunnel === "selected", `funnel ${projected.commitmentFunnel}`);
    assert(projected.headlineBind === "selected", `headline ${projected.headlineBind}`);
    assert(projected.presentPaywall.status === "unresolved", "no b2c.yaml is unresolved, not a free default");
  });

  harness.check("onboarding-applicability: subscription-app recipe defaults present-paywall to RevenueCat", () => {
    const projected = projectOnboardingApplicability(requiredHeadline, composition("b2c/subscription-app"));
    assert(projected.presentPaywall.status === "selected" && projected.presentPaywall.providerId === REVENUECAT_PROVIDER_ID, "expected RevenueCat default");
    assert(projected.headlineBind === "selected", `headline ${projected.headlineBind}`);
  });

  harness.check("onboarding-applicability: Superwall presenter with required headline is unavailable", () => {
    const projected = projectOnboardingApplicability(requiredHeadline, composition("b2c/subscription-app", SUPERWALL_PROVIDER_ID));
    assert(projected.presentPaywall.status === "selected" && projected.presentPaywall.providerId === SUPERWALL_PROVIDER_ID, "expected Superwall override");
    assert(projected.headlineBind === "unavailable", `headline ${projected.headlineBind}`);
  });

  harness.check("onboarding-applicability: complete-consumer-business does not default a paywall presenter", () => {
    const projected = projectOnboardingApplicability(requiredHeadline, composition(COMPLETE_CONSUMER_BUSINESS_RECIPE_ID));
    assert(projected.presentPaywall.status === "not_required", `present-paywall ${projected.presentPaywall.status}`);
    assert(projected.headlineBind === "unavailable", "required headline without a presenter is unavailable, not a RevenueCat pass");
  });

  harness.check("onboarding-applicability: example workspace selects both features and leaves composition unresolved", () => {
    const projected = loadOnboardingApplicability(path.join(skillRoot, "examples/workspace/business"));
    assert(projected.commitmentFunnel === "selected", `funnel ${projected.commitmentFunnel}`);
    assert(projected.paywallGoalHeadline === "selected", `headline feature ${projected.paywallGoalHeadline}`);
    assert(projected.headlineBind === "selected", `headline bind ${projected.headlineBind}`);
    assert(projected.presentPaywall.status === "unresolved", "example workspace must not ship a silent b2c.yaml default");
  });

  harness.check("onboarding-applicability: changing b2c.yaml recomputes the headline bind", () => {
    const root = harness.makeTempDir("onboarding-applicability-recompute");
    cpSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), path.join(root, "product.yaml"));
    const before = loadOnboardingApplicability(root);
    assert(before.headlineBind === "selected", `before ${before.headlineBind}`);
    writeFileSync(
      path.join(root, "b2c.yaml"),
      "apiVersion: b2c/v1\nrecipe: {id: b2c/subscription-app, version: 1.0.0}\ntarget: {platform: ios, runtime: swiftui}\nbindings:\n  b2c/monetization.present-paywall:\n    provider: {id: b2c/superwall, version: 1.0.0}\n",
      "utf8",
    );
    const after = loadOnboardingApplicability(root);
    assert(after.headlineBind === "unavailable", `after ${after.headlineBind}`);
  });
}
