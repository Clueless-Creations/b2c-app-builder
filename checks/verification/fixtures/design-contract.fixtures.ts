import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { composeCatalog } from "../../../catalog/index.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { loadDesignState, parseDesignCliArgs } from "../../../tooling/lib/design-state.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("design room: current state renders without mutating authored files", () => {
    const root = harness.makeTempDir("design-contract");
    mkdirSync(path.join(root, "studio/seed"), { recursive: true });
    const statePath = path.join(root, "studio/seed/business.json");
    cpSync(path.join(skillRoot, "surfaces/studio/seed/schema/business.empty.json"), statePath);
    cpSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), path.join(root, "DESIGN.md"));
    const before = readFileSync(statePath);
    const design = readFileSync(path.join(root, "DESIGN.md"));
    const loaded = loadDesignState(parseDesignCliArgs(["--root", root]));
    assert.deepEqual(
      loaded.issues.filter((issue) => issue.severity === "error"),
      [],
    );
    const result = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "tooling/render-design-room.ts"), "--root", root, "--static-only"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert(readFileSync(path.join(root, "design/design-room.html"), "utf8").includes("Screens"));
    assert.deepEqual(readFileSync(statePath), before);
    assert.deepEqual(readFileSync(path.join(root, "DESIGN.md")), design);
    const invalid = { ...JSON.parse(before.toString()), unsupportedField: { panels: [] } };
    writeFileSync(statePath, JSON.stringify(invalid));
    const invalidBytes = readFileSync(statePath);
    assert(loadDesignState(parseDesignCliArgs(["--root", root])).issues.some((issue) => issue.code === "design_state.schema"));
    assert.deepEqual(readFileSync(statePath), invalidBytes);
  });
  harness.check("workflow catalog: runtime and app workflows preserve authored grouping", () => {
    const catalog = composeCatalog(skillRoot);
    const runtime = toCatalogInput(catalog);
    // Authored grouping is scoped to the onboarding review graph.
    const onboardingGraphNodes = runtime.workflows.filter(
      (workflow) => workflow.id.startsWith("workflow.experience.onboarding-system.onb-") || workflow.id === "workflow.experience.onboarding-conversion",
    );
    assert.equal(onboardingGraphNodes.length, 23, `expected 22 onb-NN nodes plus the terminal node, saw ${onboardingGraphNodes.length}`);
    assert(
      onboardingGraphNodes.every((workflow) => workflow.groupId === "onboarding-system"),
      "every onboarding graph node, including the id-breaking terminal node, must carry groupId onboarding-system",
    );
    const groupedWorkflows = runtime.workflows.filter((workflow) => workflow.groupId !== undefined);
    assert.equal(groupedWorkflows.length, 23, "groupId onboarding-system must be scoped to exactly the 23 onboarding graph nodes");
    assert(
      groupedWorkflows.every((workflow) => workflow.groupId === "onboarding-system"),
      "no workflow may carry a groupId other than onboarding-system",
    );
    for (const id of [
      "workflow.orchestration.session-continuity-resume",
      "workflow.orchestration.orient-scaffold-and-state-cockpit-upkeep",
      "workflow.process.provider-proof-verification",
      "workflow.process.change-cascade",
    ])
      assert(
        runtime.workflows.some((workflow) => workflow.id === id),
        `retained workflow missing: ${id}`,
      );
    for (const domain of ["domain.design", "domain.store", "domain.operations", "domain.engineering"]) {
      assert(
        runtime.workflows.some((workflow) => workflow.domainId === domain),
        `app-domain methods missing: ${domain}`,
      );
    }
    assert(
      runtime.workflows.every((workflow) => workflow.domainId !== "domain.machine"),
      "machine work remains excluded from dispatch",
    );
  });
}
