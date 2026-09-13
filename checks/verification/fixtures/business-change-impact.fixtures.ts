import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compilePlan, type CatalogInput, type CatalogWorkflowId, type RunNodeId } from "../../../kernel/engine/compile.js";
import { captureReviewEvidence, workflowContractFingerprint, workspaceArtifactFingerprint } from "../../../kernel/engine/review-evidence.js";
import {
  acceptVerification,
  beginAttempt,
  invalidateDescendants,
  invalidateStaleReviews,
  reconcilePatch,
  seedRunState,
} from "../../../kernel/engine/runstate.js";
import { laneKeys, type BusinessStateV2, type DomainId, type LaneKey } from "../../../kernel/schema/types.js";
import { assert, type Harness } from "./_harness.js";

const now = "2026-09-09T12:00:00.000Z";
const nodeId = (workflowSlug: string): RunNodeId => `run.${workflowSlug}` as RunNodeId;

function impactCatalog(): CatalogInput {
  const workflow = (
    id: CatalogWorkflowId,
    domainId: DomainId,
    laneId: LaneKey,
    outputPaths: string[],
    dependencies: CatalogWorkflowId[],
    reads: string[] = [],
    providerIds: string[] = [],
  ): CatalogInput["workflows"][number] => ({
    id,
    title: id,
    domainId,
    actionClass: "draft",
    dependencies,
    outputPaths,
    reads,
    providerIds,
    laneIds: [laneId],
    founderOnlyActions: [],
    gateCommands: [],
    idempotent: true,
  });
  return {
    version: "catalog.change-impact.1",
    artifacts: [
      { id: "artifact.research-import-observation", path: "strategy/RESEARCH.md" },
      { id: "artifact.product-import-promise", path: "product.yaml" },
      { id: "artifact.onboarding-import-claim", path: "product/ONBOARDING.md" },
      { id: "artifact.local-feature-proof", path: "product/LOCAL_FEATURE.md" },
    ],
    workflows: [
      workflow("workflow.research-import", "domain.research", "research", ["strategy/RESEARCH.md"], []),
      workflow(
        "workflow.product-import",
        "domain.product",
        "product",
        ["product.yaml"],
        ["workflow.research-import"],
        ["strategy/RESEARCH.md"],
        ["provider.import-permission-v1"],
      ),
      workflow("workflow.onboarding-import", "domain.experience", "onboarding", ["product/ONBOARDING.md"], ["workflow.product-import"], ["product.yaml"]),
      workflow("workflow.local-feature", "domain.product", "product", ["product/LOCAL_FEATURE.md"], []),
    ],
  };
}

function businessState(): BusinessStateV2 {
  const lanes = {} as BusinessStateV2["lanes"];
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: now,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "Change Impact Fixture",
      slug: "change-impact-fixture",
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms: ["ios"],
      bundleIds: { ios: "com.example.impact", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

export function register(harness: Harness): void {
  harness.check("business-change-impact: unverified import observation reopens dependents and preserves unrelated proof", () => {
    const plan = compilePlan(impactCatalog(), now);
    const research = plan.nodes.find((node) => node.id === nodeId("research-import"))!;
    const product = plan.nodes.find((node) => node.id === nodeId("product-import"))!;
    const onboarding = plan.nodes.find((node) => node.id === nodeId("onboarding-import"))!;
    const local = plan.nodes.find((node) => node.id === nodeId("local-feature"))!;
    const run = seedRunState(plan, businessState(), { ownerSessionId: "session-impact", ttlSeconds: 600, wallClockCapSeconds: 3600, now });
    const importChain = [product.id, onboarding.id];
    const unrelatedLocal = [local.id];
    assert(
      importChain.every((id) => id !== research.id && !unrelatedLocal.includes(id)),
      "import-chain, producer, and unrelated local must be disjoint",
    );
    for (const [id, artifactId, fingerprint] of [
      [research.id, "artifact.research-import-observation", "sha256:import-v1"],
      [product.id, "artifact.product-import-promise", "sha256:promise-v1"],
      [onboarding.id, "artifact.onboarding-import-claim", "sha256:onboarding-v1"],
      [local.id, "artifact.local-feature-proof", "sha256:local-v1"],
    ] as const) {
      run.nodes[id]!.status = "succeeded";
      run.nodes[id]!.acceptedOutputFingerprint = fingerprint;
      const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId)!;
      binding.accepted = true;
      binding.fingerprint = fingerprint;
      binding.producedBy = id;
    }

    const invalidated = invalidateDescendants(plan, run, ["artifact.research-import-observation"], "2026-09-09T12:00:01.000Z");
    for (const id of importChain) {
      assert(invalidated.includes(id), `${id} should reopen when import evidence changes`);
      assert(run.nodes[id]!.status === "stale", `${id} must be stale`);
    }
    assert(run.nodes[research.id]!.status === "succeeded", "the observation producer must not self-invalidate");
    assert(run.nodes[local.id]!.status === "succeeded", "unrelated local feature proof must stay accepted");
    assert(run.artifactBindings.find((binding) => binding.artifactId === "artifact.local-feature-proof")!.accepted, "unrelated acceptance must remain");
    assert(!run.artifactBindings.find((binding) => binding.artifactId === "artifact.product-import-promise")!.accepted, "import promise must un-accept");
    assert(!run.artifactBindings.find((binding) => binding.artifactId === "artifact.onboarding-import-claim")!.accepted, "dependent onboarding claim must un-accept");
    const replayed = invalidateDescendants(plan, run, ["artifact.research-import-observation"], "2026-09-09T12:00:02.000Z");
    assert(replayed.every((id) => importChain.includes(id)), "replay may only retouch the import chain");
    assert(!replayed.some((id) => unrelatedLocal.includes(id) || id === research.id), "replay must not include unrelated local or the producer");
    for (const id of importChain) {
      assert(run.nodes[id]!.status === "stale", `${id} must stay stale after replay`);
    }
    assert(run.nodes[local.id]!.status === "succeeded", "replay must leave unrelated local proof succeeded");
    assert(run.nodes[research.id]!.status === "succeeded", "replay must not self-invalidate the producer");
  });

  harness.check("business-change-impact: a changed import promise review does not stale unrelated local proof", () => {
    const root = harness.makeTempDir("change-impact-review");
    mkdirSync(path.join(root, "product"), { recursive: true });
    mkdirSync(path.join(root, "strategy"), { recursive: true });
    writeFileSync(path.join(root, "strategy/RESEARCH.md"), "Import observation: permission is recorded as verified.\n", "utf8");
    writeFileSync(path.join(root, "product.yaml"), "schema_version: 1\nmeta: { name: import-promise }\ninstances: []\n", "utf8");
    writeFileSync(path.join(root, "product/LOCAL_FEATURE.md"), "Local feature proof stays current.\n", "utf8");
    writeFileSync(path.join(root, "product/ONBOARDING.md"), "Onboarding claim depends on the import promise.\n", "utf8");
    const plan = compilePlan(impactCatalog(), now);
    const product = plan.nodes.find((node) => node.id === nodeId("product-import"))!;
    const onboarding = plan.nodes.find((node) => node.id === nodeId("onboarding-import"))!;
    const local = plan.nodes.find((node) => node.id === nodeId("local-feature"))!;
    const run = seedRunState(plan, businessState(), { ownerSessionId: "session-impact-review", ttlSeconds: 600, wallClockCapSeconds: 3600, now });
    acceptWorkspaceNode(plan, run, root, product.id, "artifact.product-import-promise", "product.yaml", now);
    acceptWorkspaceNode(plan, run, root, onboarding.id, "artifact.onboarding-import-claim", "product/ONBOARDING.md", now);
    acceptWorkspaceNode(plan, run, root, local.id, "artifact.local-feature-proof", "product/LOCAL_FEATURE.md", now);
    assert(run.nodes[product.id]!.status === "succeeded" && run.nodes[local.id]!.status === "succeeded", "both reviews must start current");
    writeFileSync(path.join(root, "product.yaml"), "schema_version: 1\nmeta: { name: import-permission-unverified }\ninstances: []\n", "utf8");
    const stale = invalidateStaleReviews(plan, run, root, "2026-09-09T12:00:03.000Z");
    assert(stale.includes(product.id), "changed import promise must reopen its current review");
    assert(run.nodes[product.id]!.status === "stale", "import promise acceptance cannot stay current");
    assert(run.nodes[onboarding.id]!.status === "stale", "dependent onboarding claim must reopen");
    assert(!stale.includes(local.id), "unrelated local review must stay out of the stale set");
    assert(run.nodes[local.id]!.status === "succeeded", "unrelated local proof must stay accepted");
    assert(run.artifactBindings.find((binding) => binding.artifactId === "artifact.local-feature-proof")!.accepted, "unrelated local binding must remain accepted");

    // The affected chain can be repaired without broadening the impact set.
    acceptWorkspaceNode(plan, run, root, product.id, "artifact.product-import-promise", "product.yaml", "2026-09-09T12:00:04.000Z");
    acceptWorkspaceNode(plan, run, root, onboarding.id, "artifact.onboarding-import-claim", "product/ONBOARDING.md", "2026-09-09T12:00:05.000Z");
    assert(run.nodes[product.id]!.status === "succeeded", "the changed direct obligation must be repairable");
    assert(run.nodes[onboarding.id]!.status === "succeeded", "the dependent obligation must be repairable after its producer");
    assert(run.artifactBindings.find((binding) => binding.artifactId === "artifact.local-feature-proof")!.accepted, "repair must preserve unrelated proof");
    const repeated = invalidateStaleReviews(plan, run, root, "2026-09-09T12:00:06.000Z");
    assert(repeated.length === 0, "rechecking unchanged repaired inputs must be idempotent");
    assert(run.nodes[product.id]!.status === "succeeded" && run.nodes[onboarding.id]!.status === "succeeded", "idempotent recheck must not reopen repaired work");
  });

  harness.check("business-change-impact: an activated provider binding reopens only its affected obligations", () => {
    const pinned = impactCatalog();
    const newerObservation = structuredClone(pinned);
    const changedProduct = newerObservation.workflows.find((workflow) => workflow.id === "workflow.product-import")!;
    changedProduct.providerIds = ["provider.import-permission-v2"];
    const first = compilePlan(pinned, now);
    const activated = compilePlan(newerObservation, now);
    const state = businessState();
    const options = { ownerSessionId: "session-provider-impact", ttlSeconds: 600, wallClockCapSeconds: 3600, now };
    const run = seedRunState(first, state, options);
    for (const node of first.nodes) {
      beginAttempt(first, run, node.id, "fixture", now);
      run.nodes[node.id]!.status = "succeeded";
      for (const binding of run.artifactBindings.filter((entry) => node.outputs.includes(entry.artifactId as never))) binding.accepted = true;
    }
    assert(
      workflowContractFingerprint(first.nodes.find((node) => node.id === nodeId("product-import"))!) !==
        workflowContractFingerprint(activated.nodes.find((node) => node.id === nodeId("product-import"))!),
      "the activated provider binding must change the affected contract identity",
    );
    assert(
      workflowContractFingerprint(first.nodes.find((node) => node.id === nodeId("research-import"))!) ===
        workflowContractFingerprint(activated.nodes.find((node) => node.id === nodeId("research-import"))!),
      "observing a newer upstream release must not change the pinned producer contract",
    );
    assert(run.nodes[nodeId("product-import")]!.status === "succeeded", "the pinned business must remain current before activation");
    run.nodes[nodeId("product-import")]!.status = "stale";
    run.artifactBindings.find((binding) => binding.artifactId === "artifact.product-import-promise")!.accepted = false;
    const invalidated = invalidateDescendants(first, run, ["artifact.product-import-promise"], "2026-09-09T12:00:01.000Z");
    assert(invalidated.includes(nodeId("onboarding-import")), "the activated binding must reopen its dependent obligation");
    assert(run.nodes[nodeId("research-import")]!.status === "succeeded", "the producer observation must remain historical");
    assert(run.nodes[nodeId("product-import")]!.status === "stale", "the activated binding must reopen its direct obligation");
    assert(run.nodes[nodeId("local-feature")]!.status === "succeeded", "unrelated local proof must remain current");
    assert(
      workflowContractFingerprint(first.nodes.find((node) => node.id === nodeId("local-feature"))!) ===
        workflowContractFingerprint(activated.nodes.find((node) => node.id === nodeId("local-feature"))!),
      "the activated provider binding must not rewrite unrelated contract identity",
    );
  });
}

function acceptWorkspaceNode(
  plan: ReturnType<typeof compilePlan>,
  run: ReturnType<typeof seedRunState>,
  root: string,
  nodeId: RunNodeId,
  artifactId: string,
  relativePath: string,
  clock: string,
): void {
  const attempt = beginAttempt(plan, run, nodeId, "producer", clock);
  attempt.proofSource = "workspace";
  reconcilePatch(
    plan,
    run,
    {
      nodeId,
      attemptId: attempt.id,
      outputs: [
        {
          artifactId,
          path: relativePath,
          fingerprint: workspaceArtifactFingerprint(root, relativePath),
          evidence: ["workspace bytes produced"],
        },
      ],
    },
    clock,
  );
  const snapshot = captureReviewEvidence(plan, run, nodeId, root, "independent-reviewer", clock);
  acceptVerification(plan, run, nodeId, ["Inspected the current workspace artifact."], clock, "independent-reviewer", snapshot, root);
}
