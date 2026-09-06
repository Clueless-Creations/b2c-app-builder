import type { CatalogInput } from "../../../kernel/engine/compile.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { buildDispatchBatches } from "../../../kernel/engine/dispatch.js";
import { assert, type Harness } from "../fixtures/_harness.js";
import { bootstrapScenarioWorkspace, grant, readRunState, runSession } from "./_workspace.js";

/**
 * Ports LaunchBench scenario `parallel-file-overlap-unsafe.yaml` (validator cited there:
 * check-parallel-orchestration [port-disposition: port — the file-ownership collision algorithm is
 * structural, its ORCHESTRATION.md prose-policy half is word-pattern and dropped). The structural
 * half already has a strong unit-level proof: engine.fixtures.ts's "prefix-overlapping resource
 * claims serialize" case, exercising kernel/engine/dispatch.ts's buildDispatchBatches directly.
 *
 * This scenario adds what that unit-level fixture cannot show on its own: that the invariant holds
 * all the way through the REAL session pipeline — compile -> frontier -> dispatch -> execute ->
 * reducer commit — for two workflows whose declared output paths overlap the exact way the
 * LaunchBench prompt describes ("two parallel agents ... update the same
 * engineering/ENGINEERING_PLAN.md"). It proves two things a batching-only check cannot: (1) the
 * two nodes still land in separate dispatch batches when actually compiled and run, not just in a
 * hand-built fixture plan, and (2) each node's own artifact binding is accepted with the fingerprint
 * of its OWN attempt — never the other's — so "these two never touch the same resource in the same
 * pass" also means "neither one's declared output can silently absorb the other's write."
 */
function overlappingResourceCatalog(): CatalogInput {
  return {
    version: "catalog.parallel-overlap-scenario",
    artifacts: [
      // No extension on the base path on purpose: normalizeResource keeps an extension as part of
      // the resource id, so "plan/base.md" and "plan/base/detail.md" would NOT dotted-prefix-
      // overlap (".md" vs ".detail.md" diverge right after "base"). Extension-free "plan/base"
      // does: its resource id ends exactly at "base", and "plan/base/detail.md" continues right
      // after a dot boundary — the real prefix-overlap shape resource_path.ts is built to catch.
      { id: "artifact.plan-base", path: "engineering/plan/base" },
      { id: "artifact.plan-detail", path: "engineering/plan/base/detail.md" },
    ],
    workflows: [
      // check:gates-layout: real, workspace-independent gate — gateless outputs no longer
      // auto-accept (2026-08 verification flip), and this scenario needs both nodes to settle
      // to prove the batching/binding claims, not to test verification itself.
      {
        id: "workflow.plan-base",
        title: "Update the shared engineering plan (base section)",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/plan/base"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: ["check:gates-layout"],
        idempotent: true,
      },
      {
        id: "workflow.plan-detail",
        title: "Update the shared engineering plan (detail section)",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/plan/base/detail.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: ["check:gates-layout"],
        idempotent: true,
      },
    ],
  };
}

export function register(harness: Harness): void {
  harness.check(
    "scenario/parallel-overlap (ports parallel-file-overlap-unsafe): the compiled plan's own resource ids really do prefix-overlap for this catalog (the scenario setup is not vacuous)",
    () => {
      const plan = compilePlan(overlappingResourceCatalog(), "2026-08-05T00:00:00.000Z");
      const base = plan.nodes.find((node) => node.id === "run.plan-base");
      const detail = plan.nodes.find((node) => node.id === "run.plan-detail");
      assert(base && detail, "expected both fixture nodes to compile");
      assert(
        base!.resources.some((r) => r.id === "resource.path.engineering.plan.base"),
        `unexpected base resource ids: ${JSON.stringify(base!.resources)}`,
      );
      assert(
        detail!.resources.some((r) => base!.resources.some((claim) => claim.id.startsWith("resource.path.") && r.id.startsWith(`${claim.id}.`))),
        `expected the detail node's resource id to be a dotted-prefix extension of the base node's, got base=${JSON.stringify(base!.resources)} detail=${JSON.stringify(detail!.resources)}`,
      );
    },
  );

  harness.check(
    "scenario/parallel-overlap: two nodes editing the 'same' plan (dotted-prefix-overlapping output paths) run through the real session pipeline in separate dispatch batches, and never cross-write each other's artifact binding",
    () => {
      const handle = bootstrapScenarioWorkspace(harness, "parallel-overlap", overlappingResourceCatalog(), {
        grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
      });

      // Confirm at the same plan level the session uses: these two ready nodes never share a batch
      // no matter how generous maxConcurrency is (this is the direct "isolate them" guardrail).
      const plan = compilePlan(overlappingResourceCatalog(), "2026-08-05T00:00:00.000Z");
      const readyIds = plan.nodes.map((node) => node.id);
      const batches = buildDispatchBatches(plan, readyIds, 8);
      assert(
        batches.length === 2,
        `expected the two overlapping-resource nodes to serialize into 2 batches even with maxConcurrency=8, got ${batches.length}: ${JSON.stringify(batches)}`,
      );
      assert(
        batches.every((batch) => batch.nodeIds.length === 1),
        `expected exactly one node per batch, got ${JSON.stringify(batches)}`,
      );

      const result = runSession([
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "sess-parallel-overlap-1",
        "--executor",
        "fixture",
        "--max-concurrency",
        "8",
      ]);
      assert(result.code === 0, `expected the session to exit 0, got ${result.code}: ${result.output}`);

      const run = readRunState(handle);
      assert(run.nodes["run.plan-base"]?.status === "succeeded", `expected the base node to succeed, got: ${JSON.stringify(run.nodes["run.plan-base"])}`);
      assert(run.nodes["run.plan-detail"]?.status === "succeeded", `expected the detail node to succeed, got: ${JSON.stringify(run.nodes["run.plan-detail"])}`);

      const baseBinding = run.artifactBindings.find((binding) => binding.artifactId === "artifact.plan-base");
      const detailBinding = run.artifactBindings.find((binding) => binding.artifactId === "artifact.plan-detail");
      assert(baseBinding?.accepted && detailBinding?.accepted, "expected both artifact bindings to be accepted");
      assert(
        baseBinding!.producedBy === "run.plan-base",
        `expected the base artifact to be produced by the base node, got producedBy=${baseBinding!.producedBy}`,
      );
      assert(
        detailBinding!.producedBy === "run.plan-detail",
        `expected the detail artifact to be produced by the detail node, got producedBy=${detailBinding!.producedBy}`,
      );
      assert(
        baseBinding!.fingerprint !== detailBinding!.fingerprint,
        "expected distinct fingerprints — neither node's output was silently absorbed into the other's",
      );
    },
  );
}
