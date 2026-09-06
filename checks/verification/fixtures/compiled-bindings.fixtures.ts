import { chmodSync, cpSync, writeFileSync } from "node:fs";
import path from "node:path";
import { definition, author } from "./binding-resolution.fixtures.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { bindCatalogOperations, loadSelectedKnowledge } from "../../../kernel/composition/compile-bindings.js";
import { compilePlan, type CatalogInput, type CatalogWorkflowNode } from "../../../kernel/engine/compile.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import { workflowContractFingerprint } from "../../../kernel/engine/review-evidence.js";
import { seedRunState, reconcileRunPlan, beginAttempt } from "../../../kernel/engine/runstate.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import type { PackageDependency } from "../../../kernel/composition/resources.js";
import { assert, type Harness } from "./_harness.js";

const recipe = { packageId: "binding/package", packageVersion: "1.0.0", recipeId: "binding/business" };
function setup(harness: Harness, policy?: { maxRepairAttempts: number; independentReview: true; recurrenceDays?: number }) {
  const extension = definition();
  if (policy) extension.recipes[0]!.policy = policy;
  extension.recipes[0]!.workflows = ["workflow.build"];
  extension.recipes[0]!.operations = [extension.recipes[0]!.operations[0]!];
  extension.recipes[0]!.operations[0]!.workflowContexts = [
    {
      workflowId: "workflow.build",
      instructions: "neutral",
      roleInstructions: "neutral",
      neutralReferenceIds: ["neutral"],
      providerReferenceIds: ["old-provider"],
      neutralContextPackIds: [],
      providerContextPackIds: [],
    },
  ];
  extension.implementations[1]!.targets = [{ platform: "ios", runtime: "swiftui" }];
  for (const [index, id] of ["binding/native-guide", "binding/web-guide"].entries()) {
    extension.resources.push({ id, path: `guide${index}.md`, kind: "knowledge", mediaType: "text/markdown" });
    extension.implementations[index]!.knowledge = [id];
  }
  const dependency = author(harness, extension);
  const workflow = (id: CatalogWorkflowNode["id"], dependencies: CatalogWorkflowNode["id"][] = []): CatalogWorkflowNode => ({
    id,
    title: id,
    domainId: "domain.code",
    actionClass: "draft",
    dependencies,
    outputPaths: [`${id}.md`],
    providerIds: [],
    laneIds: [],
    founderOnlyActions: [],
    gateCommands: ["fixture-check"],
    idempotent: true,
    instructions: "Build an excellent consumer experience.",
    references: [],
  });
  const build = workflow("workflow.build");
  build.references = [
    { id: "neutral", path: "neutral.md", title: "Neutral expertise", loadWhen: "always" },
    { id: "old-provider", path: "old-provider.md", title: "Unselected provider", loadWhen: "always" },
  ];
  const catalog: CatalogInput = {
    version: "fixture",
    workflows: [build, workflow("workflow.downstream", ["workflow.build"]), workflow("workflow.other")],
    artifacts: ["build", "downstream", "other"].map((id) => ({ id: `artifact.${id}`, path: `workflow.${id}.md` })),
  };
  const resolved = (dep: PackageDependency = dependency, alternate = false) =>
    resolveRecipeBindings({
      packages: [dep],
      recipe,
      target: { platform: "ios", runtime: "swiftui" },
      ...(alternate ? { overrides: [{ operation: "binding/build", implementation: "binding/web" }] } : {}),
    });
  return { dependency, catalog, resolved };
}
const refuses = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
export function register(harness: Harness): void {
  harness.check("compiled binding preserves neutral expertise and includes only verified selected knowledge", () => {
    const { catalog, resolved } = setup(harness);
    const plan = compilePlan(bindCatalogOperations(catalog, resolved()));
    const brief = composeNodeBrief(plan.nodes[0]!, plan);
    assert(brief.instructions === catalog.workflows[0]!.instructions && brief.load[0]?.path === "neutral.md", "neutral expertise lost");
    assert(brief.load.length === 1 && brief.selectedKnowledge?.[0]?.text.includes("native-guide"), "selected knowledge missing");
    assert(
      !JSON.stringify(brief.selectedKnowledge).includes("web-guide") && !JSON.stringify(brief.load).includes("old-provider"),
      "unselected instructions leaked",
    );
    assert(
      refuses(() => loadSelectedKnowledge(plan.nodes[0]!.selectedOperation!, 1)),
      "required knowledge silently truncated",
    );
    assert(
      refuses(() => composeNodeBrief(plan.nodes[0]!, plan, { sourceIds: ["neutral.md"] })),
      "capsule dropped required selected context",
    );
  });
  harness.check("binding changes invalidate affected node and downstream acceptance without changing unrelated contract", () => {
    const { catalog, resolved } = setup(harness);
    const first = compilePlan(bindCatalogOperations(catalog, resolved()));
    const second = compilePlan(bindCatalogOperations(catalog, resolved(undefined, true)));
    assert(workflowContractFingerprint(first.nodes[0]!) !== workflowContractFingerprint(second.nodes[0]!), "binding not fingerprinted");
    assert(workflowContractFingerprint(first.nodes[2]!) === workflowContractFingerprint(second.nodes[2]!), "unrelated node changed");
    const state = { lanes: {} } as BusinessStateV2;
    const options = { ownerSessionId: "fixture", ttlSeconds: 300, wallClockCapSeconds: 1800 };
    const run = seedRunState(first, state, options);
    for (const node of first.nodes) {
      beginAttempt(first, run, node.id, "fixture", "2026-09-05T00:00:00.000Z");
      run.nodes[node.id]!.status = "succeeded";
      run.artifactBindings
        .filter((entry) => node.outputs.includes(entry.artifactId as never))
        .forEach((entry) => {
          entry.accepted = true;
        });
    }
    const next = reconcileRunPlan(second, run, state, options);
    assert(
      next.nodes[first.nodes[0]!.id]!.status !== "succeeded" && next.nodes[first.nodes[1]!.id]!.status !== "succeeded",
      "stale acceptance survived binding change",
    );
    assert(next.nodes[first.nodes[2]!.id]!.status === "succeeded", "unrelated acceptance invalidated");
    assert(!next.artifactBindings.find((entry) => entry.artifactId === "artifact.build")?.accepted, "accepted output survived binding change");
  });
  harness.check("same-byte resource substitution cannot change required knowledge kind or provenance", () => {
    const { dependency, catalog, resolved } = setup(harness);
    const otherDefinition = structuredClone(dependency.snapshot.extension);
    otherDefinition.id = "binding/substitute";
    otherDefinition.resources.find((entry) => entry.id === "binding/native-guide")!.kind = "schema";
    otherDefinition.implementations[0]!.knowledge = [];
    const other = author(harness, otherDefinition);
    const result = resolved();
    const resource = result.bindings[0]!.resources.find((entry) => entry.id === "binding/native-guide")!;
    resource.packageDigest = other.snapshot.digest;
    resource.packageDirectory = other.directory;
    resource.path = path.join(other.directory, "guide0.md");
    resource.kind = "schema";
    assert(
      refuses(() => bindCatalogOperations(catalog, result)),
      "same-byte different-kind substitution accepted",
    );
  });
  harness.check("recipe policy enforces repair ceiling, independent review and recurrence", () => {
    const { catalog, resolved } = setup(harness, { maxRepairAttempts: 0, independentReview: true, recurrenceDays: 7 });
    const bound = bindCatalogOperations(catalog, resolved());
    const plan = compilePlan(bound);
    assert(plan.nodes[0]!.maxAttempts === 1 && plan.nodes[0]!.verification.freshContext && plan.nodes[0]!.recurrenceDays === 7, "recipe policy discarded");
    bound.workflows[0]!.maxAttempts = 2;
    assert(
      refuses(() => compilePlan(bound)),
      "recipe repair bound bypassed",
    );
  });
  harness.check("snapshot relocation preserves plan and workflow identity", () => {
    const { dependency, catalog, resolved } = setup(harness);
    const directory = path.join(harness.makeTempDir("relocated-store"), dependency.snapshot.digest.slice(7));
    cpSync(dependency.directory, directory, { recursive: true });
    const first = compilePlan(bindCatalogOperations(catalog, resolved()));
    const second = compilePlan(bindCatalogOperations(catalog, resolved({ directory, snapshot: dependency.snapshot })));
    assert(
      first.planId === second.planId && workflowContractFingerprint(first.nodes[0]!) === workflowContractFingerprint(second.nodes[0]!),
      "host storage location contaminated contract identity",
    );
  });
  harness.check("missing classification, missing resources, forged effect and tampering refuse compilation", () => {
    const { dependency, catalog, resolved } = setup(harness);
    const unclassified = resolved();
    delete unclassified.bindings[0]!.workflowContexts;
    assert(
      refuses(() => bindCatalogOperations(catalog, unclassified)),
      "unclassified vendor knowledge carried through",
    );
    const missing = resolved();
    missing.bindings[0]!.resources = [];
    assert(
      refuses(() => bindCatalogOperations(catalog, missing)),
      "incomplete resources accepted",
    );
    const mislabeled = structuredClone(resolved());
    mislabeled.bindings[0]!.workflowContexts![0]!.neutralReferenceIds.push("old-provider");
    mislabeled.bindings[0]!.workflowContexts![0]!.providerReferenceIds = [];
    assert(
      refuses(() => bindCatalogOperations(catalog, mislabeled)),
      "forged context classification accepted",
    );
    const downgraded = bindCatalogOperations(catalog, resolved());
    downgraded.workflows[0]!.actionClass = "observe";
    assert(
      refuses(() => compilePlan(downgraded)),
      "node effect downgrade accepted",
    );
    const bound = bindCatalogOperations(catalog, resolved());
    bound.workflows[0]!.selectedOperation!.contract.effect = "publish";
    assert(
      refuses(() => compilePlan(bound)),
      "forged operation effect accepted",
    );
    chmodSync(path.join(dependency.directory, "guide0.md"), 0o644);
    writeFileSync(path.join(dependency.directory, "guide0.md"), "tampered");
    assert(
      refuses(() => compilePlan(bindCatalogOperations(catalog, resolved()))),
      "tampered selected bytes accepted",
    );
  });
}
