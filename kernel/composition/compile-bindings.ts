import { assertWorkerContext } from "./worker-context.js";
import { createHash } from "node:crypto";
import type { ActionClass, ProtectedCategory } from "../schema/types.js";
import type { CatalogInput, CatalogWorkflowNode } from "../engine/compile.js";
import { createSnapshotReader, type SnapshotReader } from "./resources.js";
import type { OperationBinding, RecipeBindingResult } from "./resolve.js";

export interface SelectedOperationBinding {
  operation: string;
  workflowId: string;
  contract: NonNullable<OperationBinding["operationContract"]>;
  implementation: NonNullable<OperationBinding["implementation"]>;
  resources: OperationBinding["resources"];
  executionRoute: "unknown";
  recipeSelection: OperationBinding["recipeSelection"];
  recipePolicy: OperationBinding["recipePolicy"];
  workflowContext: NonNullable<OperationBinding["workflowContexts"]>[number];
}
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Validate exact selected semantics and bytes each time a persisted catalog reaches compilation. */
export function verifySelectedOperation(binding: SelectedOperationBinding, reader: SnapshotReader = createSnapshotReader()): void {
  if (!binding || !binding.operation || !binding.workflowId || binding.executionRoute !== "unknown") throw new Error("binding.incomplete_selected_operation");
  const recipeSnapshot = reader.load(binding.recipeSelection.packageDirectory, binding.recipeSelection.packageDigest);
  const recipe = recipeSnapshot.extension.recipes.find((entry) => entry.id === binding.recipeSelection.id);
  const declaration = recipe?.operations.find((entry) => entry.operation === binding.operation && entry.workflowIds.includes(binding.workflowId));
  const context = declaration?.workflowContexts?.find((entry) => entry.workflowId === binding.workflowId);
  if (
    recipeSnapshot.extension.id !== binding.recipeSelection.packageId ||
    !declaration ||
    !context ||
    JSON.stringify(recipe?.policy) !== JSON.stringify(binding.recipePolicy) ||
    JSON.stringify(context) !== JSON.stringify(binding.workflowContext)
  )
    throw new Error("binding.recipe_selection_mismatch");
  if (
    reader.exportDigest(binding.recipeSelection.packageDirectory, recipeSnapshot, binding.operation, "operation") !== binding.contract.packageDigest ||
    reader.exportDigest(binding.recipeSelection.packageDirectory, recipeSnapshot, binding.implementation.id, "implementation") !==
      binding.implementation.packageDigest
  )
    throw new Error("binding.export_provenance_mismatch");
  const operationSnapshot = reader.load(binding.contract.packageDirectory, binding.contract.packageDigest);
  const capability = operationSnapshot.extension.capabilities.find((entry) => entry.operations.some((operation) => operation.id === binding.operation));
  const operation = capability?.operations.find((entry) => entry.id === binding.operation);
  if (
    !operation ||
    !capability ||
    operationSnapshot.extension.id !== binding.contract.packageId ||
    operation.effect !== binding.contract.effect ||
    operation.evidenceSchema !== binding.contract.evidenceSchema ||
    JSON.stringify(operation.acceptance) !== JSON.stringify(binding.contract.acceptance)
  )
    throw new Error("binding.operation_contract_mismatch");
  const implementationSnapshot = reader.load(binding.implementation.packageDirectory, binding.implementation.packageDigest);
  const implementation = implementationSnapshot.extension.implementations.find((entry) => entry.id === binding.implementation.id);
  if (
    !implementation ||
    implementationSnapshot.extension.id !== binding.implementation.packageId ||
    implementation.version !== binding.implementation.version ||
    implementation.operation !== binding.operation ||
    implementation.mode !== binding.implementation.mode ||
    JSON.stringify(implementation.validationContract) !== JSON.stringify(binding.implementation.validationContract) ||
    JSON.stringify(implementation.workerContext) !== JSON.stringify(binding.implementation.workerContext) ||
    !implementation.targets.some(
      (target) => target.platform === binding.recipeSelection.target.platform && target.runtime === binding.recipeSelection.target.runtime,
    )
  )
    throw new Error("binding.implementation_contract_mismatch");
  const requests = [
    ...[operation.inputSchema, operation.outputSchema, operation.evidenceSchema, ...capability.knowledge].map((id) => ({
      id,
      directory: binding.contract.packageDirectory,
      snapshot: operationSnapshot,
    })),
    ...[...implementation.knowledge, ...(implementation.entrypoint ? [implementation.entrypoint] : [])].map((id) => ({
      id,
      directory: binding.implementation.packageDirectory,
      snapshot: implementationSnapshot,
    })),
  ];
  const required = new Set(requests.map((entry) => entry.id));
  if (
    binding.resources.length !== required.size ||
    binding.resources.some((entry) => !required.has(entry.id)) ||
    new Set(binding.resources.map((entry) => entry.id)).size !== binding.resources.length
  )
    throw new Error("binding.incomplete_or_unselected_resources");
  for (const request of requests) {
    const resource = binding.resources.find((entry) => entry.id === request.id)!;
    const expectedResource = reader.identity(request.directory, request.snapshot, request.id);
    if (expectedResource.packageDigest !== resource.packageDigest || expectedResource.kind !== resource.kind || expectedResource.sha256 !== resource.sha256)
      throw new Error("binding.resource_provenance_mismatch");
    const resourceSnapshot = reader.load(resource.packageDirectory, resource.packageDigest);
    const declared = resourceSnapshot.extension.resources.find((entry) => entry.id === resource.id);
    if (
      !declared ||
      declared.kind !== resource.kind ||
      resource.sha256 !== resourceSnapshot.files[declared.path] ||
      reader.resolve(resource.packageDirectory, resourceSnapshot, resource.id) !== resource.path
    )
      throw new Error("binding.resource_contract_mismatch");
    if (hash(reader.read(request.directory, request.snapshot, request.id)) !== resource.sha256) throw new Error("binding.resource_selection_mismatch");
  }
}

/** Required context is complete or refused; callers never receive silently truncated knowledge. */
export function loadSelectedKnowledge(
  binding: SelectedOperationBinding,
  maxBytes = 128 * 1024,
): Array<{ id: string; path: string; sha256: string; text: string }> {
  const reader = createSnapshotReader();
  verifySelectedOperation(binding, reader);
  let used = 0;
  return binding.resources
    .filter((entry) => entry.kind === "knowledge")
    .map((resource) => {
      const snapshot = reader.load(resource.packageDirectory, resource.packageDigest);
      const bytes = reader.read(resource.packageDirectory, snapshot, resource.id);
      used += bytes.length;
      if (used > maxBytes) throw new Error(`binding.required_knowledge_exceeds_budget:${maxBytes}`);
      return { id: resource.id, path: resource.path, sha256: resource.sha256, text: bytes.toString("utf8") };
    });
}
const ranks: Record<ActionClass, number> = { observe: 0, draft: 1, mutate: 2, publish: 3, spend: 4, release: 5, destructive: 6 };
const protectedEffect: Partial<Record<ActionClass, ProtectedCategory>> = {
  publish: "public_actions",
  spend: "spend",
  release: "release",
  destructive: "destructive",
};

/** Enrich existing workflow nodes only. Classification is authored, never inferred from vendor names. */
export function bindCatalogOperations(catalog: CatalogInput, result: RecipeBindingResult): CatalogInput {
  if (result.status !== "resolved") throw new Error("binding.composition_refused");
  const selected = new Map<string, { binding: OperationBinding; context: NonNullable<OperationBinding["workflowContexts"]>[number] }>();
  for (const binding of result.bindings) {
    if (binding.status !== "bound") {
      if (binding.workflowIds.length) throw new Error("binding.excluded_workflow_requires_explicit_scope_decision");
      continue;
    }
    if (!binding.operationContract || !binding.implementation) throw new Error("binding.incomplete_resolution");
    for (const workflowId of binding.workflowIds) {
      if (!catalog.workflows.some((entry) => entry.id === workflowId)) throw new Error(`binding.unknown_workflow:${workflowId}`);
      if (selected.has(workflowId)) throw new Error(`binding.ambiguous_workflow:${workflowId}`);
      const context = binding.workflowContexts?.find((entry) => entry.workflowId === workflowId);
      if (!context) throw new Error(`binding.unclassified_workflow_context:${workflowId}; classify neutral and provider references before binding`);
      selected.set(workflowId, { binding, context });
    }
  }
  const reader = createSnapshotReader();
  const workflows: CatalogWorkflowNode[] = catalog.workflows.map((workflow) => {
    const selection = selected.get(workflow.id);
    if (!selection) return workflow;
    const { binding, context } = selection;
    const worker = binding.implementation?.mode === "worker-artifact";
    const guidance = binding.implementation?.workerContext;
    if (worker) {
      if (context.instructions !== "implementation" || context.roleInstructions !== "implementation")
        throw new Error(`binding.worker_context_replacement_required:${workflow.id}`);
      assertWorkerContext(workflow, guidance);
      if (binding.operationContract?.effect !== workflow.actionClass) throw new Error(`binding.worker_effect_replacement_required:${workflow.id}`);
    } else if (context.instructions !== "neutral" || context.roleInstructions !== "neutral") {
      throw new Error(`binding.unclassified_instructions:${workflow.id}`);
    }
    const classified = (all: string[], neutral: string[], provider: string[], label: string) => {
      const declarations = [...neutral, ...provider];
      if (new Set(declarations).size !== declarations.length || declarations.length !== all.length || all.some((id) => !declarations.includes(id)))
        throw new Error(`binding.incomplete_context_classification:${workflow.id}:${label}`);
    };
    classified(
      (workflow.references ?? []).map((entry) => entry.id),
      context.neutralReferenceIds,
      context.providerReferenceIds,
      "references",
    );
    classified(
      (workflow.role?.contextPacks ?? []).map((entry) => entry.id),
      context.neutralContextPackIds,
      context.providerContextPackIds,
      "role-context",
    );
    classified(
      (workflow.role?.skillRoutes ?? []).map((entry) => entry.id),
      context.neutralSkillRouteIds ?? [],
      context.providerSkillRouteIds ?? [],
      "skill-routes",
    );
    classified(
      (workflow.role?.toolRoutes ?? []).map((entry) => entry.id),
      context.neutralToolRouteIds ?? [],
      context.providerToolRouteIds ?? [],
      "tool-routes",
    );
    const selectedOperation: SelectedOperationBinding = {
      operation: binding.operation,
      workflowId: workflow.id,
      contract: binding.operationContract!,
      implementation: binding.implementation!,
      resources: binding.resources,
      executionRoute: "unknown",
      recipeSelection: binding.recipeSelection,
      workflowContext: context,
      recipePolicy: binding.recipePolicy,
    };
    verifySelectedOperation(selectedOperation, reader);
    const effect = binding.operationContract!.effect;
    const actionClass = ranks[effect] > ranks[workflow.actionClass] ? effect : workflow.actionClass;
    const protectedCategory = worker ? workflow.protectedCategory : (protectedEffect[effect] ?? workflow.protectedCategory);
    if (workflow.protectedCategory && protectedCategory !== workflow.protectedCategory)
      throw new Error(`binding.incompatible_protected_categories:${workflow.id}`);
    return {
      ...workflow,
      selectedOperation,
      ...(workflow.gateCommands.includes("check:revenue") ? { gateArguments: selectedGateArguments(workflow.gateCommands, selectedOperation, reader) } : {}),
      requiresIndependentReview: true,
      maxAttempts: Math.min(workflow.maxAttempts ?? binding.recipePolicy.maxRepairAttempts + 1, binding.recipePolicy.maxRepairAttempts + 1),
      ...(binding.recipePolicy.recurrenceDays !== undefined ? { recurrenceDays: binding.recipePolicy.recurrenceDays } : {}),
      actionClass,
      protectedCategory,
      ...(worker ? { instructions: guidance!.instructions } : {}),
      providerIds: worker ? [...guidance!.providerIds] : [],
      references: worker ? workflow.references : workflow.references?.filter((entry) => context.neutralReferenceIds.includes(entry.id)),
      role: worker
        ? workflow.role
        : workflow.role && {
            ...workflow.role,
            skillRoutes: workflow.role.skillRoutes.filter((entry) => context.neutralSkillRouteIds?.includes(entry.id)),
            toolRoutes: workflow.role.toolRoutes.filter((entry) => context.neutralToolRouteIds?.includes(entry.id)),
            contextPacks: workflow.role.contextPacks.filter((entry) => context.neutralContextPackIds.includes(entry.id)),
          },
    };
  });
  return { ...catalog, workflows };
}

/** Host storage locations are locators, never semantic contract identity. */
export function selectedOperationIdentity(binding: SelectedOperationBinding): unknown {
  const { packageDirectory: _operationDirectory, ...contract } = binding.contract;
  const { packageDirectory: _implementationDirectory, ...implementation } = binding.implementation;
  const { packageDirectory: _recipeDirectory, ...recipeSelection } = binding.recipeSelection;
  return {
    ...binding,
    recipeSelection,
    contract,
    implementation,
    resources: binding.resources.map(({ path: _path, packageDirectory: _directory, ...resource }) => resource),
  };
}
export function nodeContractIdentity<T extends { selectedOperation?: SelectedOperationBinding }>(node: T): unknown {
  return node.selectedOperation ? { ...node, selectedOperation: selectedOperationIdentity(node.selectedOperation) } : node;
}

export function verifySelectedEffect(node: {
  actionClass: ActionClass;
  protectedCategory?: ProtectedCategory;
  selectedOperation?: SelectedOperationBinding;
  maxAttempts?: number;
  recurrenceDays?: number;
  requiresIndependentReview?: boolean;
  verification?: { freshContext: boolean };
}): void {
  if (!node.selectedOperation) return;
  const policy = node.selectedOperation.recipePolicy;
  if (
    node.maxAttempts === undefined ||
    node.maxAttempts > policy.maxRepairAttempts + 1 ||
    !(node.requiresIndependentReview || node.verification?.freshContext) ||
    (policy.recurrenceDays !== undefined && node.recurrenceDays !== policy.recurrenceDays)
  )
    throw new Error("binding.recipe_policy_not_enforced");
  const effect = node.selectedOperation.contract.effect;
  const worker = node.selectedOperation.implementation.mode === "worker-artifact";
  if (
    (worker ? node.actionClass !== effect : ranks[node.actionClass] < ranks[effect]) ||
    (protectedEffect[effect] && (worker ? !node.protectedCategory : node.protectedCategory !== protectedEffect[effect]))
  )
    throw new Error("binding.effect_authority_downgrade");
}

/** Only exact selected validation contracts can parameterize the provider-owned revenue gate. */
export function selectedGateArguments(
  gateIds: readonly string[],
  selected?: SelectedOperationBinding,
  reader: SnapshotReader = createSnapshotReader(),
): Record<string, string[]> {
  if (!gateIds.includes("check:revenue")) return {};
  if (!selected?.implementation.validationContract) throw new Error("binding.provider_validation_contract_required");
  verifySelectedOperation(selected, reader);
  const contract = selected.implementation.validationContract;
  return { "check:revenue": ["--provider-contract", contract.id, "--provider-contract-version", contract.version] };
}
export function verifyGateArguments(gateIds: readonly string[], args: Record<string, string[]> | undefined, selected?: SelectedOperationBinding): void {
  if (gateIds.some((id) => !/^[a-z][a-z0-9:._-]*$/.test(id))) throw new Error("binding.invalid_gate_id");
  if (!selected && (!args || !Object.keys(args).length)) return;
  const expected = selectedGateArguments(gateIds, selected);
  if (JSON.stringify(args ?? {}) !== JSON.stringify(expected)) throw new Error("binding.gate_arguments_mismatch");
}
