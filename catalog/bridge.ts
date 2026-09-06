import { readStoredSnapshot } from "../kernel/composition/resources.js";
import { bindCatalogOperations } from "../kernel/composition/compile-bindings.js";
import type { RecipeBindingResult } from "../kernel/composition/resolve.js";
import type { CatalogArtifact as CompileArtifact, CatalogInput, CatalogWorkflowId, CatalogWorkflowNode, NodeReference } from "../kernel/engine/compile.js";
import type { DomainId } from "../kernel/schema/types.js";
import { APP_SOURCE_FINGERPRINT_PATH } from "./artifacts.js";
import { resolveCatalogAuthority, resolveDomainAuthority } from "./domain-authority.js";
import type { Catalog, CatalogDomainId, CatalogWorkflowDef } from "./types.js";

function classifyDomain(catalog: Catalog, domainId: CatalogDomainId): "runtime" | "machine" | "unknown" {
  const domain = catalog.domains.find((entry) => entry.id === domainId);
  if (!domain) return "unknown";
  const authority = resolveDomainAuthority(domain);
  if (authority.machine) return "machine";
  if (authority.grantable || authority.system) return "runtime";
  return "unknown";
}

function isRuntimeDomain(domainId: CatalogDomainId, catalog: Catalog): domainId is DomainId {
  return classifyDomain(catalog, domainId) === "runtime";
}

function referenceFreshness(reference: Catalog["references"][number]): string {
  if (reference.sources.length === 0) return "internal";
  const newestReview = [...reference.sources]
    .map((source) => source.lastReviewDate)
    .sort()
    .at(-1);
  // The executable plan must be stable for identical source bytes. The separate knowledge
  // freshness validator evaluates review cadence against the source-freshness snapshot date
  // and fails when stale.
  return `reviewed ${newestReview}`;
}

/**
 * The earliest date any source is due for re-review — lastReviewDate + reviewCadenceDays,
 * minimum across sources. Pure source-byte arithmetic (no current date), so the compiled plan
 * stays stable; read-time projections compare this against their own clock.
 */
function referenceReviewDueBy(reference: Catalog["references"][number]): string | undefined {
  if (reference.sources.length === 0) return undefined;
  const dueDates = reference.sources.flatMap((source) => {
    const reviewed = new Date(`${source.lastReviewDate}T00:00:00.000Z`);
    reviewed.setUTCDate(reviewed.getUTCDate() + source.reviewCadenceDays);
    // A malformed date or absurd cadence must degrade to "no verdict", never crash the bridge;
    // knowledge-validation.ts's stale gate is where bad source data gets reported.
    return Number.isNaN(reviewed.valueOf()) ? [] : [reviewed.toISOString().slice(0, 10)];
  });
  return dueDates.sort()[0];
}

function toNodeReference(reference: Catalog["references"][number]): NodeReference {
  const reviewDueBy = referenceReviewDueBy(reference);
  return {
    id: reference.id,
    path: reference.path,
    ...(reference.resource ? { resource: reference.resource } : {}),
    title: reference.title,
    loadWhen: reference.loadWhen,
    freshness: referenceFreshness(reference),
    ...(reviewDueBy ? { reviewDueBy } : {}),
    ...(reference.sectionId ? { sectionId: reference.sectionId } : {}),
    ...(reference.revision ? { revision: reference.revision } : {}),
  };
}

/**
 * The v2 catalog -> kernel/engine/compile.ts CatalogInput bridge (U8; U2 built compile.ts
 * against a small fixture catalog and left this real bridge for U8 to deliver).
 *
 * Process and orchestration workflows are runtime-owned and never founder-grantable, but they
 * remain executable prerequisites. The autonomy evaluator admits only their internal work and
 * fails closed if a system node declares protected, costed, or external mutation authority.
 * Machine-domain workflows remain maintainer-only and are the sole workflows filtered here.
 */
export function toCatalogInput(catalog: Catalog, resolvedBindings?: RecipeBindingResult): CatalogInput {
  const unknown = catalog.workflows.filter((workflow) => classifyDomain(catalog, workflow.domainId) === "unknown");
  if (unknown.length > 0) {
    const detail = unknown.map((workflow) => `${workflow.id} (${workflow.domainId})`).join(", ");
    throw new Error(`catalog.bridge.unknown_domain: ${detail} is not a runtime or machine domain; failing closed rather than dropping it.`);
  }
  const runtimeWorkflows = catalog.workflows.filter((wf): wf is CatalogWorkflowDef & { domainId: DomainId } => isRuntimeDomain(wf.domainId, catalog));
  const runtimeIds = new Set<CatalogWorkflowId>(runtimeWorkflows.map((wf) => wf.id as CatalogWorkflowId));
  const runtimeOutputPaths = new Set<string>(runtimeWorkflows.flatMap((wf) => wf.outputPaths));
  const referencesById = new Map(catalog.references.map((reference) => [reference.id, reference]));
  const rolesById = new Map(catalog.roles.map((role) => [role.id, role]));
  const contextPacksById = new Map(catalog.contextPacks.map((pack) => [pack.id, pack]));

  // Reuse catalog.artifacts (built once, by catalog/artifacts.ts's buildArtifacts(), from every
  // workflow's outputPaths) rather than recomputing artifact ids independently here — two
  // derivations of the same id from the same input have already diverged once in this repo's
  // history (see catalog/artifacts.ts's own header on why there is now a single source).
  const artifacts: CompileArtifact[] = catalog.artifacts
    .filter((artifact) => runtimeOutputPaths.has(artifact.path) || artifact.path === APP_SOURCE_FINGERPRINT_PATH)
    .map((artifact) => ({ id: artifact.id as CompileArtifact["id"], path: artifact.path }));

  const workflows: CatalogWorkflowNode[] = runtimeWorkflows.map((wf) => ({
    id: wf.id as CatalogWorkflowId,
    title: wf.title,
    domainId: wf.domainId,
    actionClass: wf.actionClass,
    protectedCategory: wf.protectedCategory,
    // The full authored node contract crosses the bridge (the 2026-08 contract audit found this
    // map dropped trigger and carried no instructions/knowledge at all, leaving a dispatched
    // worker a bare title). References resolve to path+loadWhen here so the engine never needs
    // the catalog module to compose a worker brief.
    trigger: wf.trigger,
    instructions: wf.instructions,
    reads: wf.reads,
    sourceAccess: wf.sourceAccess,
    sharedResources: wf.sharedResources,
    consults: wf.consults,
    references: wf.referenceIds.map((referenceId) => {
      const reference = referencesById.get(referenceId);
      if (!reference) throw new Error(`${wf.id} binds unknown reference ${referenceId}`);
      return toNodeReference(reference);
    }),
    role: (() => {
      const role = rolesById.get(wf.roleId);
      if (!role) throw new Error(`${wf.id} names unknown role ${wf.roleId}`);
      return {
        id: role.id,
        name: role.name,
        promptPath: role.promptPath,
        parentPromptPaths: role.parentPromptPaths,
        ...(role.promptResources ? { promptResources: role.promptResources } : {}),
        contextPacks: role.contextPackIds.map((packId) => {
          const pack = contextPacksById.get(packId);
          if (!pack) throw new Error(`${role.id} names unknown context pack ${packId}`);
          return {
            id: pack.id,
            title: pack.title,
            references: pack.referenceIds.map((referenceId) => {
              const reference = referencesById.get(referenceId);
              if (!reference) throw new Error(`${pack.id} binds unknown reference ${referenceId}`);
              return toNodeReference(reference);
            }),
          };
        }),
        skillRoutes: role.skillRoutes,
        toolRoutes: role.toolRoutes,
        ...(role.reviewedBy?.length ? { reviewedBy: [...role.reviewedBy] } : {}),
      };
    })(),
    ...(wf.reviewOf?.length
      ? { reviewOf: wf.reviewOf.filter((targetId): targetId is CatalogWorkflowId => runtimeIds.has(targetId as CatalogWorkflowId)) }
      : {}),
    dependencies: wf.dependencies.filter((dependencyId): dependencyId is CatalogWorkflowId => runtimeIds.has(dependencyId as CatalogWorkflowId)),
    refreshDependencies: (wf.refreshDependencies ?? []).filter((entry) => runtimeIds.has(entry.workflowId as CatalogWorkflowId)),
    outputPaths: wf.outputPaths,
    providerIds: wf.providerIds,
    laneIds: wf.laneIds,
    founderOnlyActions: wf.founderOnlyActions,
    gateCommands: wf.gateCommands,
    idempotent: wf.idempotent,
    recurrenceDays: wf.recurrenceDays,
    maxAttempts: wf.maxAttempts,
    maxConsecutiveNoProgressAttempts: wf.maxConsecutiveNoProgressAttempts,
    ttlSeconds: wf.ttlSeconds,
    tokenBudget: wf.tokenBudget,
    costEstimate: wf.costEstimate,
    phaseIds: wf.phaseIds,
    groupId: wf.groupId,
    applicability: wf.applicability,
  }));

  const input: CatalogInput = {
    version: `${catalog.schemaVersion}+${catalog.skillVersion}`,
    artifacts,
    workflows,
    profiles: catalog.profiles.map(({ id, defersLaneKeys }) => ({ id, defersLaneKeys: [...defersLaneKeys] })),
    authority: resolveCatalogAuthority(catalog.domains),
  };
  return resolvedBindings ? bindCatalogOperations(input, resolvedBindings) : input;
}

/** Workflows present in the full catalog but excluded from toCatalogInput() — for reporting/diagnostics, not dispatch. */
export function nonGrantableWorkflowIds(catalog: Catalog): string[] {
  return catalog.workflows.filter((wf) => classifyDomain(catalog, wf.domainId) !== "runtime").map((wf) => wf.id);
}

/** Select one pinned recipe and its dependency closure through the existing catalog bridge. */
export function toRecipeCatalogInput(catalog: Catalog, resolved: RecipeBindingResult): CatalogInput {
  if (resolved.status !== "resolved") throw new Error("binding.composition_refused");
  const selection = resolved.bindings[0]?.recipeSelection;
  if (!selection) throw new Error("binding.recipe_selection_missing");
  if (resolved.bindings.some((binding) => binding.recipeSelection.id !== selection.id || binding.recipeSelection.packageDigest !== selection.packageDigest))
    throw new Error("binding.mixed_recipe_selection");
  const snapshot = readStoredSnapshot(selection.packageDirectory, selection.packageDigest);
  const recipe = snapshot.extension.recipes.find((entry) => entry.id === selection.id);
  if (!recipe) throw new Error("binding.recipe_selection_missing");
  const ids = new Set<string>();
  const visiting = new Set<string>();
  const byId = new Map(catalog.workflows.map((workflow) => [workflow.id as string, workflow]));
  const producers = new Map(catalog.workflows.flatMap((workflow) => workflow.outputPaths.map((output) => [output, workflow.id] as const)));
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`binding.recipe_dependency_cycle:${id}`);
    if (ids.has(id)) return;
    const workflow = byId.get(id);
    if (!workflow) throw new Error(`binding.recipe_workflow_missing:${id}`);
    visiting.add(id);
    for (const dependency of [
      ...workflow.dependencies,
      ...(workflow.reviewOf ?? []),
      ...(workflow.refreshDependencies ?? []).map((entry) => entry.workflowId),
      ...workflow.reads.flatMap((relative) => {
        const producer = producers.get(relative);
        return producer && producer !== id ? [producer] : [];
      }),
    ])
      visit(dependency);
    visiting.delete(id);
    ids.add(id);
  };
  recipe.workflows.forEach(visit);
  const projected = toCatalogInput({ ...catalog, workflows: catalog.workflows.filter((workflow) => ids.has(workflow.id)) }, resolved);
  for (const workflow of projected.workflows)
    if (workflow.providerIds.length && !workflow.selectedOperation) throw new Error(`binding.recipe_provider_unbound:${workflow.id}`);
  return projected;
}
