import { z } from "zod";

export const EXTENSION_API_VERSION = "b2c.extension/v1" as const;
export const exportedIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9.-]*$/)
  .max(160);
export const exactVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const packageReferenceSchema = z.strictObject({ id: exportedIdSchema, version: exactVersionSchema });
export const resourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.includes("\0") &&
      !value.startsWith("/") &&
      !value.includes(":") &&
      value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
    "Use a relative package path with no traversal, empty segments, or platform prefix.",
  );
export const resourceSchema = z.strictObject({
  id: exportedIdSchema,
  path: resourcePathSchema,
  kind: z.enum(["schema", "knowledge", "prompt", "gate", "adapter", "asset", "lockfile", "catalog-pack", "notice"]),
  mediaType: z.string().min(1),
});
/**
 * A retained third-party notice (ADR-0005). `notice` is a `notice` resource holding the verbatim
 * license and copyright text; `covers` names the package resources that incorporate the covered
 * material. Distributing any covered resource requires distributing the notice with it.
 */
export const thirdPartyNoticeSchema = z.strictObject({
  id: exportedIdSchema,
  project: z.string().min(1),
  upstream: z.url({ protocol: /^https$/u }),
  license: z.string().min(1),
  copyright: z.string().min(1),
  notice: exportedIdSchema,
  covers: z.array(exportedIdSchema).min(1),
});
export const targetSchema = z.strictObject({ platform: z.enum(["ios", "android", "web", "host"]), runtime: z.string().min(1) });
export const operationSchema = z.strictObject({
  id: exportedIdSchema,
  title: z.string().min(1),
  inputSchema: exportedIdSchema,
  outputSchema: exportedIdSchema,
  evidenceSchema: exportedIdSchema,
  effect: z.enum(["observe", "draft", "mutate", "publish", "spend", "release", "destructive"]),
  acceptance: z.array(z.string().min(1)).min(1),
});
export const providerSchema = z.strictObject({ id: exportedIdSchema, version: exactVersionSchema, title: z.string().min(1), description: z.string().min(1) });
export const capabilitySchema = z.strictObject({
  description: z.string().min(1).optional(),
  targets: z.array(targetSchema).min(1).optional(),
  id: exportedIdSchema,
  version: exactVersionSchema,
  title: z.string().min(1),
  operations: z.array(operationSchema).min(1),
  knowledge: z.array(exportedIdSchema),
});
export const validationContractSchema = z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), version: exactVersionSchema, kind: z.literal("billing") });
export const implementationSchema = z.strictObject({
  workerContext: z
    .strictObject({
      workflowId: z.string().regex(/^workflow\./),
      instructions: z.string().min(1),
      providerIds: z.array(z.string()),
      contextFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .optional(),
  provider: exportedIdSchema.optional(),
  description: z.string().min(1).optional(),
  id: exportedIdSchema,
  version: exactVersionSchema,
  operation: exportedIdSchema,
  targets: z.array(targetSchema).min(1),
  mode: z.enum(["host-tool", "command", "manual", "worker-artifact"]),
  entrypoint: exportedIdSchema.optional(),
  sdkRange: z.string().min(1),
  limitations: z.array(z.string().min(1)),
  knowledge: z.array(exportedIdSchema),
  connectionRequired: z.boolean(),
  maturity: z.enum(["experimental", "implemented"]),
  validationContract: validationContractSchema.optional(),
});
export const recipeSchema = z.strictObject({
  maturity: z.enum(["experimental", "implemented"]).optional(),
  description: z.string().min(1).optional(),
  targets: z.array(targetSchema).min(1).optional(),
  id: exportedIdSchema,
  version: exactVersionSchema,
  title: z.string().min(1),
  workflows: z.array(z.string().regex(/^workflow\./)),
  operations: z.array(
    z.strictObject({
      operation: exportedIdSchema,
      implementation: exportedIdSchema,
      required: z.boolean(),
      workflowIds: z.array(z.string().regex(/^workflow\.[a-z0-9.-]+$/)),
      workflowContexts: z
        .array(
          z.strictObject({
            workflowId: z.string().regex(/^workflow\.[a-z0-9.-]+$/),
            instructions: z.enum(["neutral", "implementation"]),
            roleInstructions: z.enum(["neutral", "implementation"]),
            neutralReferenceIds: z.array(z.string()),
            providerReferenceIds: z.array(z.string()),
            neutralContextPackIds: z.array(z.string()),
            providerContextPackIds: z.array(z.string()),
            neutralSkillRouteIds: z.array(z.string()).optional(),
            providerSkillRouteIds: z.array(z.string()).optional(),
            neutralToolRouteIds: z.array(z.string()).optional(),
            providerToolRouteIds: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    }),
  ),
  policy: z.strictObject({
    maxRepairAttempts: z.number().int().min(0).max(20),
    independentReview: z.literal(true),
    recurrenceDays: z.number().int().positive().max(3650).optional(),
  }),
});

/** Declarative metadata. Validation never imports package code or grants authority. */
export const extensionSchema = z.strictObject({
  apiVersion: z.literal(EXTENSION_API_VERSION),
  id: exportedIdSchema,
  version: exactVersionSchema,
  hostApiVersion: z.literal("b2c/v1"),
  title: z.string().min(1),
  dependencies: z.array(packageReferenceSchema),
  imports: z.array(z.strictObject({ package: packageReferenceSchema, exports: z.array(exportedIdSchema).min(1) })),
  resources: z.array(resourceSchema),
  catalogPacks: z.array(exportedIdSchema).optional(),
  providers: z.array(providerSchema).optional(),
  capabilities: z.array(capabilitySchema),
  implementations: z.array(implementationSchema),
  recipes: z.array(recipeSchema),
  thirdParty: z.array(thirdPartyNoticeSchema).optional(),
});
export type Extension = z.infer<typeof extensionSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type ThirdPartyNotice = z.infer<typeof thirdPartyNoticeSchema>;

/** Resolve references after structural validation; imported exports resolve against the closure. */
export function validateExtension(value: unknown): Extension {
  const extension = extensionSchema.parse(value);
  const dependencyIds = new Set<string>();
  for (const dependency of extension.dependencies) {
    if (dependency.id === extension.id || dependencyIds.has(dependency.id))
      throw new Error(`Duplicate, conflicting-version or self dependency: ${dependency.id}`);
    dependencyIds.add(dependency.id);
  }
  const importedIds = new Set<string>();
  for (const entry of extension.imports)
    for (const id of entry.exports) {
      if (importedIds.has(id)) throw new Error(`Duplicate imported export: ${id}`);
      importedIds.add(id);
    }
  const paths = new Set<string>();
  for (const resource of extension.resources) {
    if (resource.path === "snapshot.json" || resource.path.startsWith("snapshot.json/") || resource.path === "extension.yaml" || paths.has(resource.path))
      throw new Error(`Duplicate or reserved resource path: ${resource.path}`);
    paths.add(resource.path);
  }
  const ids = new Set<string>();
  const resources = new Map(extension.resources.map((resource) => [resource.id, resource]));
  const operations = new Set(extension.capabilities.flatMap((capability) => capability.operations.map((operation) => operation.id)));
  const implementations = new Set(extension.implementations.map((implementation) => implementation.id));
  const imported = new Set(extension.imports.flatMap((entry) => entry.exports));
  const dependencies = new Set(extension.dependencies.map((entry) => `${entry.id}@${entry.version}`));
  const namespace = extension.id.split("/")[0];
  for (const entry of [
    ...extension.resources,
    ...(extension.providers ?? []),
    ...extension.capabilities,
    ...extension.capabilities.flatMap((item) => item.operations),
    ...extension.implementations,
    ...extension.recipes,
    ...(extension.thirdParty ?? []),
  ]) {
    if (ids.has(entry.id) || imported.has(entry.id)) throw new Error(`Duplicate export: ${entry.id}`);
    if (!entry.id.startsWith(`${namespace}/`)) throw new Error(`Export outside package namespace: ${entry.id}`);
    ids.add(entry.id);
  }
  for (const entry of extension.thirdParty ?? []) {
    const notice = resources.get(entry.notice);
    if (notice?.kind !== "notice") throw new Error(`Missing notice resource: ${entry.notice}`);
    for (const covered of entry.covers) {
      const resource = resources.get(covered);
      if (!resource) throw new Error(`Third-party notice covers an undeclared resource: ${covered}`);
      if (resource.kind === "notice" || resource.kind === "catalog-pack") throw new Error(`Third-party notice cannot cover a ${resource.kind} resource: ${covered}`);
    }
  }
  for (const entry of extension.imports) {
    if (!dependencies.has(`${entry.package.id}@${entry.package.version}`)) throw new Error(`Undeclared dependency: ${entry.package.id}`);
  }
  const resource = (id: string, kind: Resource["kind"]) => {
    if (imported.has(id)) return;
    if (resources.get(id)?.kind !== kind) throw new Error(`Missing ${kind} resource: ${id}`);
  };
  for (const id of extension.catalogPacks ?? []) resource(id, "catalog-pack");
  for (const capability of extension.capabilities) {
    capability.knowledge.forEach((id) => resource(id, "knowledge"));
    for (const operation of capability.operations) {
      for (const id of [operation.inputSchema, operation.outputSchema, operation.evidenceSchema]) resource(id, "schema");
    }
  }
  for (const implementation of extension.implementations) {
    if (implementation.mode === "worker-artifact" && !implementation.workerContext)
      throw new Error(`Worker implementation requires a context contract: ${implementation.id}`);
    if (implementation.mode !== "worker-artifact" && implementation.workerContext)
      throw new Error(`Only worker implementations declare worker context: ${implementation.id}`);
    if (implementation.provider && !extension.providers?.some((provider) => provider.id === implementation.provider) && !imported.has(implementation.provider))
      throw new Error(`Unknown provider: ${implementation.provider}`);
    if (!operations.has(implementation.operation) && !imported.has(implementation.operation)) throw new Error(`Unknown operation: ${implementation.operation}`);
    if (implementation.mode === "command") {
      if (!implementation.entrypoint) throw new Error(`Command implementation needs an entrypoint: ${implementation.id}`);
      resource(implementation.entrypoint, "adapter");
    } else if (implementation.entrypoint) throw new Error(`Only command implementations declare package entrypoints: ${implementation.id}`);
    implementation.knowledge.forEach((id) => resource(id, "knowledge"));
  }
  for (const recipe of extension.recipes) {
    if (recipe.maturity !== "experimental" && (!recipe.workflows.length || recipe.operations.some((binding) => !binding.workflowIds.length)))
      throw new Error(`Implemented recipe requires workflow mappings: ${recipe.id}`);
    const selected = new Set<string>();
    const mappedWorkflows = new Set<string>();
    for (const binding of recipe.operations) {
      for (const workflow of binding.workflowIds) {
        if (!recipe.workflows.includes(workflow) || mappedWorkflows.has(workflow)) throw new Error(`Unknown or multiply bound workflow: ${workflow}`);
        mappedWorkflows.add(workflow);
      }
      const contexts = new Set<string>();
      for (const context of binding.workflowContexts ?? []) {
        if (!binding.workflowIds.includes(context.workflowId) || contexts.has(context.workflowId))
          throw new Error(`Unknown or duplicate workflow context: ${context.workflowId}`);
        contexts.add(context.workflowId);
      }
      if (selected.has(binding.operation)) throw new Error(`Duplicate recipe operation: ${binding.operation}`);
      selected.add(binding.operation);
      if (!operations.has(binding.operation) && !imported.has(binding.operation)) throw new Error(`Unknown recipe operation: ${binding.operation}`);
      if (!implementations.has(binding.implementation) && !imported.has(binding.implementation))
        throw new Error(`Unknown implementation: ${binding.implementation}`);
      const local = extension.implementations.find((item) => item.id === binding.implementation);
      if (local && local.operation !== binding.operation) throw new Error(`Implementation does not cover operation: ${binding.operation}`);
    }
  }
  return extension;
}

export function validateExtensionClosure(extension: Extension, dependencies: readonly Extension[]): void {
  type ExportEntry = { kind: string; operation?: string };
  const exportsOf = (item: Extension): Map<string, ExportEntry> =>
    new Map<string, ExportEntry>([
      ...(item.providers ?? []).map((entry) => [entry.id, { kind: "provider" }] as const),
      ...item.resources.map((entry) => [entry.id, { kind: entry.kind }] as const),
      ...item.capabilities.map((entry) => [entry.id, { kind: "capability" }] as const),
      ...item.capabilities.flatMap((entry) => entry.operations.map((operation) => [operation.id, { kind: "operation" }] as const)),
      ...item.implementations.map((entry) => [entry.id, { kind: "implementation", operation: entry.operation }] as const),
      ...item.recipes.map((entry) => [entry.id, { kind: "recipe" }] as const),
    ]);
  const owners = new Map<string, string>();
  for (const item of [extension, ...dependencies])
    for (const id of exportsOf(item).keys()) {
      if (owners.has(id) && owners.get(id) !== item.id) throw new Error(`Duplicate closure export: ${id}`);
      owners.set(id, item.id);
    }
  const visible = exportsOf(extension);
  for (const entry of extension.imports) {
    const matches = dependencies.filter((item) => item.id === entry.package.id && item.version === entry.package.version);
    if (matches.length !== 1) throw new Error(`Missing or ambiguous imported package: ${entry.package.id}`);
    const exported = exportsOf(matches[0]!);
    for (const id of entry.exports) {
      const target = exported.get(id);
      if (!target) throw new Error(`Dependency does not export ${id}`);
      if (visible.has(id)) throw new Error(`Duplicate visible export: ${id}`);
      visible.set(id, target);
    }
  }
  const requireKind = (id: string, kind: string) => {
    if (visible.get(id)?.kind !== kind) throw new Error(`Expected ${kind} export: ${id}`);
  };
  for (const id of extension.catalogPacks ?? []) requireKind(id, "catalog-pack");
  for (const capability of extension.capabilities) {
    capability.knowledge.forEach((id) => requireKind(id, "knowledge"));
    for (const operation of capability.operations) {
      [operation.inputSchema, operation.outputSchema, operation.evidenceSchema].forEach((id) => requireKind(id, "schema"));
    }
  }
  for (const implementation of extension.implementations) {
    requireKind(implementation.operation, "operation");
    if (implementation.provider) requireKind(implementation.provider, "provider");
    if (implementation.entrypoint) requireKind(implementation.entrypoint, "adapter");
    implementation.knowledge.forEach((id) => requireKind(id, "knowledge"));
  }
  for (const recipe of extension.recipes)
    for (const binding of recipe.operations) {
      requireKind(binding.operation, "operation");
      requireKind(binding.implementation, "implementation");
      if (visible.get(binding.implementation)?.operation !== binding.operation)
        throw new Error(`Implementation does not cover recipe operation: ${binding.operation}`);
    }
}
