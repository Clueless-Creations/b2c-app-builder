import { compilePlan, type CatalogInput, type CatalogWorkflowId, type RunNodeId } from "../../../kernel/engine/compile.js";
import { invalidateDescendants, seedRunState } from "../../../kernel/engine/runstate.js";
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
  ): CatalogInput["workflows"][number] => ({
    id,
    title: id,
    domainId,
    actionClass: "draft",
    dependencies,
    outputPaths,
    reads,
    providerIds: [],
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
      workflow("workflow.product-import", "domain.product", "product", ["product.yaml"], ["workflow.research-import"], ["strategy/RESEARCH.md"]),
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
    const expectedAffected = [product.id, onboarding.id];
    const expectedUnaffected = [local.id, research.id];
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
    for (const id of expectedAffected) {
      assert(invalidated.includes(id), `${id} should reopen when import evidence changes`);
      assert(run.nodes[id]!.status === "stale", `${id} must be stale`);
    }
    assert(run.nodes[research.id]!.status === "succeeded", "the observation producer must not self-invalidate");
    assert(run.nodes[local.id]!.status === "succeeded", "unrelated local feature proof must stay accepted");
    assert(run.artifactBindings.find((binding) => binding.artifactId === "artifact.local-feature-proof")!.accepted, "unrelated acceptance must remain");
    assert(!run.artifactBindings.find((binding) => binding.artifactId === "artifact.product-import-promise")!.accepted, "import promise must un-accept");
    assert(!run.artifactBindings.find((binding) => binding.artifactId === "artifact.onboarding-import-claim")!.accepted, "dependent onboarding claim must un-accept");
    const replayed = invalidateDescendants(plan, run, ["artifact.research-import-observation"], "2026-09-09T12:00:02.000Z");
    assert(replayed.every((id) => expectedAffected.includes(id) || expectedUnaffected.includes(id)), "replay must stay inside the named impact set");
    assert(run.nodes[local.id]!.status === "succeeded", "replay must not take unrelated work");
  });
}
