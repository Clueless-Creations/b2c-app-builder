import { randomUUID } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { definition, author } from "./binding-resolution.fixtures.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { bindCatalogOperations, verifySelectedOperation } from "../../../kernel/composition/compile-bindings.js";
import { workerContextFingerprint } from "../../../kernel/composition/worker-context.js";
import { createSnapshotReader } from "../../../kernel/composition/resources.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { assert, type Harness } from "./_harness.js";

function refuses(action: () => unknown, expected: string) {
  let message = "";
  try {
    action();
  } catch (error) {
    message = String(error);
  }
  assert(message.includes(expected), `expected ${expected}, got ${message || "no refusal"}`);
}
function setup(h: Harness, protectedWork = false) {
  const source: CatalogInput = {
    version: "worker-binding",
    artifacts: [],
    workflows: [
      {
        id: "workflow.build",
        title: "Build",
        domainId: "domain.code",
        actionClass: protectedWork ? "publish" : "draft",
        ...(protectedWork ? { protectedCategory: "legal_pricing" as const } : {}),
        dependencies: [],
        outputPaths: [],
        providerIds: ["provider.revenuecat"],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        instructions: "Use the selected RevenueCat setup guidance under existing authority.",
      },
    ],
  };
  const extension = definition(),
    workflow = source.workflows[0]!;
  extension.capabilities[0]!.operations[0]!.effect = workflow.actionClass;
  extension.implementations[0]!.mode = "worker-artifact";
  extension.implementations[0]!.targets = [{ platform: "host", runtime: "agent-cli" }];
  extension.implementations[0]!.workerContext = {
    workflowId: workflow.id,
    instructions: workflow.instructions!,
    providerIds: [...workflow.providerIds],
    contextFingerprint: workerContextFingerprint(workflow),
  };
  extension.recipes[0]!.workflows = [workflow.id];
  extension.recipes[0]!.operations = [extension.recipes[0]!.operations[0]!];
  extension.recipes[0]!.operations[0]!.workflowContexts = [
    {
      workflowId: workflow.id,
      instructions: "implementation",
      roleInstructions: "implementation",
      neutralReferenceIds: [],
      providerReferenceIds: [],
      neutralContextPackIds: [],
      providerContextPackIds: [],
    },
  ];
  const dependency = author({ ...h, makeTempDir: (name) => h.makeTempDir(`${name}-${randomUUID()}`) }, extension);
  const resolved = resolveRecipeBindings({
    packages: [dependency],
    recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: extension.recipes[0]!.id },
    target: { platform: "host", runtime: "agent-cli" },
  });
  assert(resolved.status === "resolved", resolved.reasonCodes.join(","));
  return { source, dependency, resolved };
}
export function register(h: Harness): void {
  h.check("worker bindings preserve exact implementation-owned guidance and prerequisite providers", () => {
    const { source, resolved } = setup(h),
      bound = bindCatalogOperations(source, resolved);
    assert(bound.workflows[0]!.instructions === source.workflows[0]!.instructions, "selected guidance changed");
    assert(bound.workflows[0]!.providerIds.includes("provider.revenuecat"), "selected provider prerequisite vanished");
    assert(bound.workflows[0]!.requiresIndependentReview === true, "independent review missing");
    verifySelectedOperation(bound.workflows[0]!.selectedOperation!);
    const persisted = structuredClone(bound);
    persisted.workflows[0]!.instructions = "Replaced outside the pinned implementation";
    refuses(() => compilePlan(persisted), "binding.worker_context_replacement_required");
    const forged = structuredClone(bound.workflows[0]!.selectedOperation!);
    forged.implementation.workerContext!.instructions = "Changed without a new package";
    refuses(() => verifySelectedOperation(forged), "binding.implementation_contract_mismatch");
  });
  h.check("worker composition preserves specialized legal authority and refuses its replacement", () => {
    const { source, resolved } = setup(h, true),
      bound = bindCatalogOperations(source, resolved);
    const plan = compilePlan(bound);
    assert(plan.nodes[0]!.protectedCategory === "legal_pricing", "legal authority was overwritten by generic publication");
    const altered = structuredClone(bound);
    altered.workflows[0]!.protectedCategory = "public_actions";
    refuses(() => compilePlan(altered), "binding.worker_context_replacement_required");
  });
  h.check("changed worker text or provider context needs complete authored replacement", () => {
    const { source, resolved } = setup(h);
    const changed = structuredClone(source);
    changed.workflows[0]!.instructions = "Use a different billing provider.";
    refuses(() => bindCatalogOperations(changed, resolved), "binding.worker_context_replacement_required");
    changed.workflows[0]!.instructions = source.workflows[0]!.instructions;
    changed.workflows[0]!.providerIds = [];
    refuses(() => bindCatalogOperations(changed, resolved), "binding.worker_context_replacement_required");
  });
  h.check("scoped package verification still rehashes resource bytes and a fresh pass rechecks metadata", () => {
    const { dependency } = setup(h),
      reader = createSnapshotReader(),
      snapshot = reader.load(dependency.directory, dependency.snapshot.digest);
    const first = reader.read(dependency.directory, snapshot, "binding/schema");
    chmodSync(path.join(dependency.directory, "schema.json"), 0o644);
    chmodSync(path.join(dependency.directory, "extension.yaml"), 0o644);
    writeFileSync(path.join(dependency.directory, "schema.json"), '{"type":"null"}');
    refuses(() => reader.read(dependency.directory, snapshot, "binding/schema"), "Pinned resource changed");
    writeFileSync(path.join(dependency.directory, "schema.json"), first);
    writeFileSync(path.join(dependency.directory, "extension.yaml"), "broken: manifest\n");
    refuses(() => createSnapshotReader().load(dependency.directory, dependency.snapshot.digest), "Pinned resource changed");
  });
}
