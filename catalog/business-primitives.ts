import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Binding, Entity } from "../contracts/public-api/contract.js";
import type { PackageDependency } from "../kernel/composition/resources.js";
import { readFirstpartyPackage } from "./packs/installed-firstparty.js";
export { MOBILE_OPERATION_IDS as MOBILE_OPERATIONS } from "../contracts/mobile-operation.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const unique = <T>(values: T[]): T[] => [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];

/** Public declarations are projections of the same verified package used by composition. */
export function projectPublicDeclarations(pack: PackageDependency): { entities: Entity[]; defaults: Record<string, Record<string, Binding>> } {
  const extension = pack.snapshot.extension,
    entities: Entity[] = [],
    defaults: Record<string, Record<string, Binding>> = {};
  const providers = (extension.providers ?? []).map((provider) => {
    const implementations = extension.implementations.filter((implementation) => implementation.provider === provider.id);
    return {
      kind: "provider" as const,
      id: provider.id,
      version: provider.version,
      title: provider.title,
      description: provider.description,
      operations: unique(implementations.map((entry) => entry.operation)),
      targets: unique(implementations.flatMap((entry) => entry.targets)),
      execution: "unavailable" as const,
    };
  });
  const recipes = extension.recipes.map((recipe) => {
    const bindings: Record<string, Binding> = {};
    for (const operation of recipe.operations) {
      const implementations = extension.implementations.filter((entry) => entry.id === operation.implementation);
      if (implementations.length !== 1) throw new Error("composition.recipe_default_missing_or_ambiguous");
      const provider = providers.find((entry) => entry.id === implementations[0]!.provider);
      if (!provider) throw new Error("composition.recipe_default_provider_missing");
      bindings[operation.operation] = { provider: { id: provider.id, version: provider.version } };
    }
    defaults[`${recipe.id}@${recipe.version}`] = bindings;
    return {
      kind: "recipe" as const,
      id: recipe.id,
      version: recipe.version,
      title: recipe.title,
      description: recipe.description ?? recipe.title,
      operations: recipe.operations.map((entry) => entry.operation),
      targets:
        recipe.targets ??
        unique(
          extension.implementations
            .filter((entry) => recipe.operations.some((operation) => operation.implementation === entry.id))
            .flatMap((entry) => entry.targets),
        ),
      execution: "unavailable" as const,
    };
  });
  const add = (entity: Entity) => {
    if (!entities.some((existing) => existing.kind === entity.kind && existing.id === entity.id)) entities.push(entity);
  };
  for (const capability of extension.capabilities) {
    const operations = capability.operations.map((entry) => entry.id);
    add({
      kind: "capability",
      id: capability.id,
      version: capability.version,
      title: capability.title,
      description: capability.description ?? capability.title,
      operations,
      targets:
        capability.targets ?? unique(extension.implementations.filter((entry) => operations.includes(entry.operation)).flatMap((entry) => entry.targets)),
      execution: "unavailable",
    });
    for (const provider of providers.filter((entry) => entry.operations.some((operation) => operations.includes(operation)))) add(provider);
    for (const recipe of recipes.filter((entry) => entry.operations.some((operation) => operations.includes(operation)))) add(recipe);
  }
  for (const provider of providers) add(provider);
  for (const recipe of recipes) add(recipe);
  return { entities, defaults };
}
export function installedPublicDeclarations() {
  return projectPublicDeclarations(readFirstpartyPackage(root));
}
export function installedPublicPackage() {
  return readFirstpartyPackage(root);
}
