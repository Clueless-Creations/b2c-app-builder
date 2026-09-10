/**
 * ONB-16/17 applicability projection.
 *
 * Authoritative inputs (no invented product.monetization.mode, product.platforms, or sidecar store):
 *
 * | Decision                         | Owner                                                                 | selected                                              | not required                                      | unresolved                                      |
 * | -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
 * | Commitment funnel                | product.yaml `class.feature` id `feature.commitment-funnel`           | `slot.feature.scope: required`                        | `excluded` or `non-goal`                          | instance absent                                 |
 * | Paywall Goal Headline            | product.yaml `class.feature` id `feature.paywall-goal-headline`       | `slot.feature.scope: required`                        | `excluded` or `non-goal`                          | instance absent                                 |
 * | Purchase / present-paywall owner | `b2c.yaml` operation bindings; recipe defaults when unbound           | exact `provider.id`+`version` on `b2c/monetization.*` that the reviewed catalog implements for the selected target | recipe omits the operation and no override        | no parseable `b2c.yaml`, unknown recipe/version, or unsupported provider/target |
 *
 * `feature.paywall-goal-headline` is the RevenueCat offering-metadata / `customVariables` bind.
 * A Superwall presenter with that feature required is selected-but-unavailable, not a fake
 * RevenueCat pass. Workflow `providers:` lists and installed SDKs are not selection. Packet
 * prose such as "not applicable" is not authority.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import type { Extension } from "../../contracts/extensions/contract.js";
import { compositionSchema, type Composition } from "../../contracts/public-api/contract.js";
import { firstpartyImplementations, firstpartyProviders, firstpartyRecipes } from "../firstparty-declarations.js";
import { FIRSTPARTY_BUSINESS_RECIPE } from "../firstparty-recipes.js";
import { loadProductInstanceDocument, productYamlPath } from "./instance-load.js";
import type { ProductInstanceDocument } from "./instance-types.js";

export const COMMITMENT_FUNNEL_FEATURE_ID = "feature.commitment-funnel";
export const PAYWALL_GOAL_HEADLINE_FEATURE_ID = "feature.paywall-goal-headline";
export const PRESENT_PAYWALL_OPERATION = "b2c/monetization.present-paywall";
export const PURCHASE_OPERATION = "b2c/monetization.purchase";
export const ENTITLEMENT_OPERATION = "b2c/monetization.read-entitlement";
export const REVENUECAT_PROVIDER_ID = "b2c/revenuecat";
export const SUPERWALL_PROVIDER_ID = "b2c/superwall";
export const COMPLETE_CONSUMER_BUSINESS_RECIPE_ID = "b2c/complete-consumer-business";

export type FeatureApplicability = "selected" | "not_required" | "unresolved";
export type HeadlineBindApplicability = FeatureApplicability | "unavailable";
export type ProviderDecision = { status: "selected"; providerId: string } | { status: "not_required" } | { status: "unresolved" };

/** Reviewed recipe/provider catalog used to verify a composition. Defaults are current first-party declarations. */
export interface OnboardingProviderCatalog {
  recipes: readonly Extension["recipes"][number][];
  implementations: readonly Extension["implementations"][number][];
  providers: readonly NonNullable<Extension["providers"]>[number][];
}

export interface OnboardingApplicability {
  commitmentFunnel: FeatureApplicability;
  paywallGoalHeadline: FeatureApplicability;
  presentPaywall: ProviderDecision;
  purchase: ProviderDecision;
  entitlement: ProviderDecision;
  headlineBind: HeadlineBindApplicability;
}

const FIRSTPARTY_PROVIDER_CATALOG: OnboardingProviderCatalog = {
  recipes: firstpartyRecipes,
  implementations: firstpartyImplementations,
  providers: firstpartyProviders,
};

const NOT_REQUIRED_SCOPES = new Set(["excluded", "non-goal"]);

function featureApplicability(doc: ProductInstanceDocument | undefined, featureId: string): FeatureApplicability {
  const feature = doc?.instances.find((item) => item.id === featureId && item.classId === "class.feature");
  if (!feature) return "unresolved";
  const scope = feature.slots["slot.feature.scope"]?.[0];
  if (scope === "required") return "selected";
  if (scope && NOT_REQUIRED_SCOPES.has(scope)) return "not_required";
  return "unresolved";
}

function recipeProviderDecision(
  recipeId: string,
  recipeVersion: string,
  operation: string,
  catalog: OnboardingProviderCatalog,
): ProviderDecision {
  const recipe = catalog.recipes.find((entry) => entry.id === recipeId && entry.version === recipeVersion);
  if (!recipe) {
    // The complete-consumer-business recipe is generated from worker responsibilities and is
    // not listed in firstpartyRecipes. It does not default monetization operations.
    if (recipeId === COMPLETE_CONSUMER_BUSINESS_RECIPE_ID && recipeVersion === FIRSTPARTY_BUSINESS_RECIPE.version) {
      return { status: "not_required" };
    }
    return { status: "unresolved" };
  }
  const operationEntry = recipe.operations.find((entry) => entry.operation === operation);
  if (!operationEntry) return { status: "not_required" };
  const implementation = catalog.implementations.find((entry) => entry.id === operationEntry.implementation);
  if (!implementation?.provider) return { status: "unresolved" };
  return { status: "selected", providerId: implementation.provider };
}

function providerForOperation(
  composition: Composition | undefined,
  operation: string,
  catalog: OnboardingProviderCatalog,
): ProviderDecision {
  if (!composition) return { status: "unresolved" };
  const override = composition.bindings[operation]?.provider;
  if (override) {
    const provider = catalog.providers.find((entry) => entry.id === override.id && entry.version === override.version);
    if (!provider) return { status: "unresolved" };
    const implementation = catalog.implementations.find(
      (entry) =>
        entry.provider === override.id &&
        entry.operation === operation &&
        entry.targets.some((target) => target.platform === composition.target.platform && target.runtime === composition.target.runtime),
    );
    if (!implementation) return { status: "unresolved" };
    return { status: "selected", providerId: override.id };
  }
  return recipeProviderDecision(composition.recipe.id, composition.recipe.version, operation, catalog);
}

function headlineBindApplicability(feature: FeatureApplicability, presentPaywall: ProviderDecision): HeadlineBindApplicability {
  switch (feature) {
    case "not_required":
      return "not_required";
    case "unresolved":
      return "unresolved";
    case "selected": {
      switch (presentPaywall.status) {
        case "unresolved":
          // The feature is selected, but no parseable present-paywall owner exists yet. Missing
          // composition is an explicit hold, not a free default and not a silent RevenueCat pick.
          return "unresolved";
        case "not_required":
          return "unavailable";
        case "selected":
          return presentPaywall.providerId === REVENUECAT_PROVIDER_ID ? "selected" : "unavailable";
        default: {
          const exhaustive: never = presentPaywall;
          return exhaustive;
        }
      }
    }
    default: {
      const exhaustive: never = feature;
      return exhaustive;
    }
  }
}

export function parseWorkspaceComposition(workspaceRoot: string): Composition | undefined {
  for (const relative of ["b2c.yaml", "b2c.json"] as const) {
    const filePath = path.join(workspaceRoot, relative);
    if (!existsSync(filePath)) continue;
    try {
      const bytes = readFileSync(filePath, "utf8");
      let raw: unknown;
      if (relative.endsWith(".json")) {
        raw = JSON.parse(bytes);
      } else {
        const document = parseDocument(bytes);
        if (document.errors.length > 0) return undefined;
        raw = document.toJS({ maxAliasCount: 0 });
      }
      const parsed = compositionSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function loadProductDecisions(workspaceRoot: string): ProductInstanceDocument | undefined {
  const filePath = productYamlPath(workspaceRoot);
  if (!existsSync(filePath)) return undefined;
  try {
    return loadProductInstanceDocument(filePath);
  } catch {
    return undefined;
  }
}

export function projectOnboardingApplicability(
  doc: ProductInstanceDocument | undefined,
  composition: Composition | undefined,
  catalog: OnboardingProviderCatalog = FIRSTPARTY_PROVIDER_CATALOG,
): OnboardingApplicability {
  const paywallGoalHeadline = featureApplicability(doc, PAYWALL_GOAL_HEADLINE_FEATURE_ID);
  const presentPaywall = providerForOperation(composition, PRESENT_PAYWALL_OPERATION, catalog);
  const purchase = providerForOperation(composition, PURCHASE_OPERATION, catalog);
  const entitlement = providerForOperation(composition, ENTITLEMENT_OPERATION, catalog);
  return {
    commitmentFunnel: featureApplicability(doc, COMMITMENT_FUNNEL_FEATURE_ID),
    paywallGoalHeadline,
    presentPaywall,
    purchase,
    entitlement,
    headlineBind: headlineBindApplicability(paywallGoalHeadline, presentPaywall),
  };
}

export function loadOnboardingApplicability(workspaceRoot: string): OnboardingApplicability {
  return projectOnboardingApplicability(loadProductDecisions(workspaceRoot), parseWorkspaceComposition(workspaceRoot));
}
