import { exactVersionSchema, type Extension, type Resource } from "../../contracts/extensions/contract.js";
import { verifySnapshot, createSnapshotReader, type PackageDependency } from "./resources.js";

type Implementation = Extension["implementations"][number];
type Recipe = Extension["recipes"][number];
export interface RecipeReference {
  packageId: string;
  packageVersion: string;
  recipeId: string;
}
export interface BindingOverride {
  operation: string;
  implementation: string;
}
export interface BindingReadiness {
  declaredSupport: "declared" | "unknown";
  implementationMaturity: "experimental" | "implemented" | "unknown";
  workspaceConfiguration: "unknown";
  executionRoute: "unknown";
  grantedAuthority: "unknown";
  observedProof: "unknown";
}
export interface OperationBinding {
  operation: string;
  workflowIds: string[];
  recipePolicy: Recipe["policy"];
  recipeSelection: { id: string; packageId: string; packageDigest: string; packageDirectory: string; target: RecipeBindingResult["target"] };
  workflowContexts?: Recipe["operations"][number]["workflowContexts"];
  operationContract?: {
    effect: Extension["capabilities"][number]["operations"][number]["effect"];
    evidenceSchema: string;
    acceptance: string[];
    packageId: string;
    packageDirectory: string;
    packageDigest: string;
  };
  required: boolean;
  status: "bound" | "excluded" | "refused";
  implementation?: {
    id: string;
    version: string;
    packageId: string;
    packageDigest: string;
    packageDirectory: string;
    mode: Implementation["mode"];
    validationContract?: Implementation["validationContract"];
    workerContext?: Implementation["workerContext"];
  };
  resources: Array<{ id: string; kind: Resource["kind"]; path: string; packageDigest: string; packageDirectory: string; sha256: string }>;
  sdkCompatibility: "declared-range-match" | "mismatch" | "unknown";
  readiness: BindingReadiness;
  reasonCodes: string[];
  limitations: string[];
}
export interface RecipeBindingResult {
  status: "resolved" | "refused";
  recipe: RecipeReference;
  target: { platform: "ios" | "android" | "web" | "host"; runtime: string };
  bindings: OperationBinding[];
  reasonCodes: string[];
}

function matchesSdkRange(version: string, range: string): boolean | undefined {
  const current = exactVersionSchema.safeParse(version);
  if (!current.success) throw new Error("binding.invalid_host_sdk_version");
  if (range === "*") return true;
  const match = /^(\^|~)?(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (!match) return undefined;
  const actual = version.split(".").map(Number);
  const base = match.slice(2).map(Number);
  const compare = (left: number[], right: number[]) => left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!;
  if (!match[1]) return compare(actual, base) === 0;
  const upper =
    match[1] === "~" ? [base[0]!, base[1]! + 1, 0] : base[0]! > 0 ? [base[0]! + 1, 0, 0] : base[1]! > 0 ? [0, base[1]! + 1, 0] : [0, 0, base[2]! + 1];
  return compare(actual, base) >= 0 && compare(actual, upper) < 0;
}

/** Resolve declarations from verified content. A resolved binding is not execution, authority or live proof. */
export function resolveRecipeBindings(input: {
  packages: readonly PackageDependency[];
  recipe: RecipeReference;
  target: RecipeBindingResult["target"];
  overrides?: readonly BindingOverride[];
  hostSdkVersion?: string;
}): RecipeBindingResult {
  const snapshotReader = createSnapshotReader();
  const result: RecipeBindingResult = { status: "resolved", recipe: input.recipe, target: input.target, bindings: [], reasonCodes: [] };
  const refuse = (reason: string): RecipeBindingResult => ({ ...result, status: "refused", reasonCodes: [...result.reasonCodes, reason] });
  if (!exactVersionSchema.safeParse(input.recipe.packageVersion).success || !input.target.runtime.trim()) return refuse("binding.invalid_request");
  if (input.hostSdkVersion !== undefined && !exactVersionSchema.safeParse(input.hostSdkVersion).success) return refuse("binding.invalid_host_sdk_version");
  const roots = input.packages.filter(
    (item) => item.snapshot.extension.id === input.recipe.packageId && item.snapshot.extension.version === input.recipe.packageVersion,
  );
  if (roots.length !== 1) return refuse(roots.length ? "binding.ambiguous_package" : "binding.missing_package");
  const root = roots[0]!;
  const closure = new Map<string, PackageDependency>();
  const visit = (item: PackageDependency): void => {
    verifySnapshot(item.directory, item.snapshot);
    const previous = closure.get(item.snapshot.extension.id);
    if (previous) {
      if (previous.snapshot.digest !== item.snapshot.digest) throw new Error("binding.conflicting_dependency");
      return;
    }
    closure.set(item.snapshot.extension.id, item);
    for (const dependency of item.snapshot.dependencies) {
      const matches = input.packages.filter(
        (candidate) => candidate.snapshot.extension.id === dependency.id && candidate.snapshot.digest === dependency.digest,
      );
      if (matches.length !== 1) throw new Error(matches.length ? "binding.ambiguous_dependency" : "binding.missing_dependency");
      visit(matches[0]!);
    }
  };
  try {
    visit(root);
  } catch (error) {
    return refuse(`binding.unverified_closure:${error instanceof Error ? error.message : String(error)}`);
  }

  const visibleOwner = (scope: PackageDependency, id: string, kind: "recipe" | "implementation" | "operation" | "resource"): PackageDependency | undefined => {
    const has = (item: PackageDependency) => {
      const extension = item.snapshot.extension;
      if (kind === "recipe") return extension.recipes.some((entry) => entry.id === id);
      if (kind === "implementation") return extension.implementations.some((entry) => entry.id === id);
      if (kind === "operation") return extension.capabilities.some((entry) => entry.operations.some((operation) => operation.id === id));
      return extension.resources.some((entry) => entry.id === id);
    };
    if (has(scope)) return scope;
    const imported = scope.snapshot.extension.imports.find((entry) => entry.exports.includes(id));
    const dependency = imported && closure.get(imported.package.id);
    return dependency && dependency.snapshot.extension.version === imported!.package.version && has(dependency) ? dependency : undefined;
  };
  const recipeOwner = visibleOwner(root, input.recipe.recipeId, "recipe");
  const recipe: Recipe | undefined = recipeOwner?.snapshot.extension.recipes.find((entry) => entry.id === input.recipe.recipeId);
  if (!recipe || !recipeOwner) return refuse("binding.missing_recipe");
  if (recipe.maturity === "experimental") return refuse("binding.recipe_unavailable");
  if (recipe.operations.length === 0) return refuse("binding.no_declared_operations");
  const overrides = new Map<string, string>();
  for (const override of input.overrides ?? []) {
    if (overrides.has(override.operation)) return refuse("binding.duplicate_override");
    if (!recipe.operations.some((entry) => entry.operation === override.operation)) return refuse("binding.unknown_override_operation");
    overrides.set(override.operation, override.implementation);
  }
  for (const declaration of recipe.operations) {
    const binding: OperationBinding = {
      operation: declaration.operation,
      workflowIds: declaration.workflowIds,
      recipePolicy: recipe.policy,
      recipeSelection: {
        id: recipe.id,
        packageId: recipeOwner.snapshot.extension.id,
        packageDigest: recipeOwner.snapshot.digest,
        packageDirectory: recipeOwner.directory,
        target: input.target,
      },
      workflowContexts: declaration.workflowContexts,
      required: declaration.required,
      status: "bound",
      resources: [],
      sdkCompatibility: "unknown",
      reasonCodes: [],
      limitations: [],
      readiness: {
        declaredSupport: "unknown",
        implementationMaturity: "unknown",
        workspaceConfiguration: "unknown",
        executionRoute: "unknown",
        grantedAuthority: "unknown",
        observedProof: "unknown",
      },
    };
    const exclude = (reason: string) => {
      binding.status = declaration.required ? "refused" : "excluded";
      binding.reasonCodes.push(reason);
      if (declaration.required) result.status = "refused";
    };
    const selectedId = overrides.get(declaration.operation) ?? declaration.implementation;
    const scope = overrides.has(declaration.operation) ? root : recipeOwner;
    const owner = visibleOwner(scope, selectedId, "implementation");
    const implementation = owner?.snapshot.extension.implementations.find((entry) => entry.id === selectedId);
    if (!visibleOwner(recipeOwner, declaration.operation, "operation")) exclude("binding.missing_operation");
    else if (!owner || !implementation) exclude("binding.missing_implementation");
    else if (implementation.operation !== declaration.operation) exclude("binding.operation_mismatch");
    else if (!implementation.targets.some((target) => target.platform === input.target.platform && target.runtime === input.target.runtime))
      exclude("binding.target_mismatch");
    else {
      binding.readiness.declaredSupport = "declared";
      binding.readiness.implementationMaturity = implementation.maturity;
      binding.implementation = {
        id: implementation.id,
        version: implementation.version,
        packageId: owner.snapshot.extension.id,
        packageDigest: owner.snapshot.digest,
        packageDirectory: owner.directory,
        mode: implementation.mode,
        ...(implementation.validationContract ? { validationContract: implementation.validationContract } : {}),
        ...(implementation.workerContext ? { workerContext: implementation.workerContext } : {}),
      };
      binding.limitations.push(...implementation.limitations);
      const compatible = input.hostSdkVersion === undefined ? undefined : matchesSdkRange(input.hostSdkVersion, implementation.sdkRange);
      binding.sdkCompatibility = compatible === undefined ? "unknown" : compatible ? "declared-range-match" : "mismatch";
      if (compatible === false) exclude("binding.sdk_range_mismatch");
      else {
        binding.limitations.push(
          compatible === undefined
            ? "SDK compatibility is unknown without an exact host SDK version and supported declared range."
            : "The declared SDK range matches the supplied version; live adapter compatibility is unverified.",
        );
        try {
          const operationOwner = visibleOwner(recipeOwner, declaration.operation, "operation")!;
          const capability = operationOwner.snapshot.extension.capabilities.find((entry) =>
            entry.operations.some((operation) => operation.id === declaration.operation),
          )!;
          const operation = operationOwner.snapshot.extension.capabilities
            .flatMap((entry) => entry.operations)
            .find((entry) => entry.id === declaration.operation)!;
          binding.operationContract = {
            effect: operation.effect,
            evidenceSchema: operation.evidenceSchema,
            acceptance: operation.acceptance,
            packageId: operationOwner.snapshot.extension.id,
            packageDirectory: operationOwner.directory,
            packageDigest: operationOwner.snapshot.digest,
          };
          const requests = [
            ...[operation.inputSchema, operation.outputSchema, operation.evidenceSchema].map((id) => ({ scope: operationOwner, id })),
            ...capability.knowledge.map((id) => ({ scope: operationOwner, id })),
            ...implementation.knowledge.map((id) => ({ scope: owner, id })),
            ...(implementation.entrypoint ? [{ scope: owner, id: implementation.entrypoint }] : []),
          ];
          for (const request of requests) {
            const resourceOwner = visibleOwner(request.scope, request.id, "resource");
            const resource = resourceOwner?.snapshot.extension.resources.find((entry) => entry.id === request.id);
            if (!resource || !resourceOwner) throw new Error("binding.missing_resource");
            if (!binding.resources.some((entry) => entry.id === resource.id))
              binding.resources.push({
                id: resource.id,
                kind: resource.kind,
                path: snapshotReader.resolve(resourceOwner.directory, resourceOwner.snapshot, resource.id),
                packageDigest: resourceOwner.snapshot.digest,
                packageDirectory: resourceOwner.directory,
                sha256: resourceOwner.snapshot.files[resource.path]!,
              });
          }
        } catch (error) {
          exclude(`binding.unverified_resource:${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    result.bindings.push(binding);
  }
  return result;
}
