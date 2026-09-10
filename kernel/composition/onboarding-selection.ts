/**
 * Verified onboarding applicability: package pins and activation state, not raw declarations.
 *
 * Planning-time workspaces without packages still use the declaration projection and are labeled
 * proposal. A pending activation journal or a candidate that no longer matches the activated
 * digest cannot appear as a completed selection. Imported recipes resolve through the same
 * package closure as first-party content.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ENTITLEMENT_OPERATION,
  loadProductDecisions,
  parseWorkspaceComposition,
  PRESENT_PAYWALL_OPERATION,
  projectOnboardingApplicability,
  PURCHASE_OPERATION,
  REVENUECAT_PROVIDER_ID,
  type HeadlineBindApplicability,
  type OnboardingApplicability,
  type ProviderDecision,
} from "../../catalog/ontology/onboarding-applicability.js";
import type { Composition } from "../../contracts/public-api/contract.js";
import type { ProductInstanceDocument } from "../../catalog/ontology/instance-types.js";
import { resolveRecipeBindings, type RecipeBindingResult } from "./resolve.js";
import { readStoredSnapshot, type PackageDependency } from "./resources.js";

export type BindingLifecycle = "proposal" | "activated" | "pending-activation" | "stale-candidate" | "unresolved";

export interface VerifiedOnboardingApplicability extends OnboardingApplicability {
  bindingLifecycle: BindingLifecycle;
}

const JOURNAL = ".b2c-launch/composition-activation.json";
const RUNTIME = ".b2c-launch/runtime.json";
const PACKAGES = ".b2c-launch/packages";

function hashBytes(bytes: string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isSafeFile(root: string, relative: string): string | undefined {
  let current = path.resolve(root);
  if (!existsSync(current) || !lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) return undefined;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (!existsSync(current)) return undefined;
    if (lstatSync(current).isSymbolicLink()) return undefined;
  }
  return current;
}

function readWorkspacePackages(workspaceRoot: string): PackageDependency[] {
  const directory = isSafeFile(workspaceRoot, PACKAGES);
  if (!directory || !lstatSync(directory).isDirectory()) return [];
  const result: PackageDependency[] = [];
  for (const entry of readdirSync(directory).filter((name) => /^[a-f0-9]{64}$/.test(name)).sort()) {
    const packageDirectory = path.join(directory, entry);
    if (!lstatSync(packageDirectory).isDirectory()) continue;
    result.push({ directory: packageDirectory, snapshot: readStoredSnapshot(packageDirectory, `sha256:${entry}`) });
  }
  return result;
}

function readActivatedDigest(workspaceRoot: string): string | undefined {
  const file = isSafeFile(workspaceRoot, RUNTIME);
  if (!file || !lstatSync(file).isFile()) return undefined;
  try {
    const runtime = JSON.parse(readFileSync(file, "utf8")) as { composition?: { configurationDigest?: unknown } };
    return typeof runtime.composition?.configurationDigest === "string" ? runtime.composition.configurationDigest : undefined;
  } catch {
    return undefined;
  }
}

function candidateDigest(workspaceRoot: string): string | undefined {
  const file = isSafeFile(workspaceRoot, "b2c.yaml");
  if (!file || !lstatSync(file).isFile()) return undefined;
  return hashBytes(readFileSync(file, "utf8"));
}

function providerFromBinding(packages: readonly PackageDependency[], resolved: RecipeBindingResult, operation: string): ProviderDecision {
  const binding = resolved.bindings.find((entry) => entry.operation === operation);
  if (!binding) return { status: "not_required" };
  if (binding.status !== "bound" || !binding.implementation) return { status: "unresolved" };
  const bound = binding.implementation;
  const owner = packages.find((entry) => entry.snapshot.digest === bound.packageDigest);
  const implementation = owner?.snapshot.extension.implementations.find((entry) => entry.id === bound.id);
  if (!implementation?.provider) return { status: "unresolved" };
  return { status: "selected", providerId: implementation.provider };
}

function headlineBindFrom(feature: OnboardingApplicability["paywallGoalHeadline"], presentPaywall: ProviderDecision): HeadlineBindApplicability {
  switch (feature) {
    case "not_required":
      return "not_required";
    case "unresolved":
      return "unresolved";
    case "selected": {
      switch (presentPaywall.status) {
        case "unresolved":
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

function projectFromResolved(
  doc: ProductInstanceDocument | undefined,
  packages: readonly PackageDependency[],
  resolved: RecipeBindingResult,
): OnboardingApplicability {
  const features = projectOnboardingApplicability(doc, undefined);
  const presentPaywall = providerFromBinding(packages, resolved, PRESENT_PAYWALL_OPERATION);
  return {
    ...features,
    presentPaywall,
    purchase: providerFromBinding(packages, resolved, PURCHASE_OPERATION),
    entitlement: providerFromBinding(packages, resolved, ENTITLEMENT_OPERATION),
    headlineBind: headlineBindFrom(features.paywallGoalHeadline, presentPaywall),
  };
}

function resolveComposition(packages: readonly PackageDependency[], composition: Composition): RecipeBindingResult | undefined {
  const owners = packages.filter(({ snapshot }) =>
    snapshot.extension.recipes.some((recipe) => recipe.id === composition.recipe.id && recipe.version === composition.recipe.version),
  );
  if (owners.length !== 1) return undefined;
  const owner = owners[0]!.snapshot.extension;
  const resolved = resolveRecipeBindings({
    packages,
    recipe: { packageId: owner.id, packageVersion: owner.version, recipeId: composition.recipe.id },
    target: composition.target,
  });
  return resolved.status === "resolved" ? resolved : undefined;
}

function withLifecycle(projected: OnboardingApplicability, bindingLifecycle: BindingLifecycle): VerifiedOnboardingApplicability {
  return { ...projected, bindingLifecycle };
}

export function loadVerifiedOnboardingApplicability(workspaceRoot: string): VerifiedOnboardingApplicability {
  const doc = loadProductDecisions(workspaceRoot);
  const composition = parseWorkspaceComposition(workspaceRoot);
  if (isSafeFile(workspaceRoot, JOURNAL)) {
    return withLifecycle(projectOnboardingApplicability(doc, undefined), "pending-activation");
  }
  const packages = readWorkspacePackages(workspaceRoot);
  const activatedDigest = readActivatedDigest(workspaceRoot);
  const currentDigest = candidateDigest(workspaceRoot);
  if (activatedDigest && currentDigest && activatedDigest !== currentDigest) {
    return withLifecycle(projectOnboardingApplicability(doc, undefined), "stale-candidate");
  }
  if (packages.length > 0 && composition) {
    const resolved = resolveComposition(packages, composition);
    if (!resolved) return withLifecycle(projectOnboardingApplicability(doc, undefined), "unresolved");
    return withLifecycle(projectFromResolved(doc, packages, resolved), activatedDigest ? "activated" : "proposal");
  }
  if (!composition) return withLifecycle(projectOnboardingApplicability(doc, undefined), "unresolved");
  return withLifecycle(projectOnboardingApplicability(doc, composition), "proposal");
}
