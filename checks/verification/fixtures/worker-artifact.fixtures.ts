import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { skillRoot, type Harness } from "./_harness.js";
export function register(harness: Harness): void {
  harness.check("worker context identity survives relocation and excludes workspace prompt bytes", () => {
    const workflow = {
      id: "workflow.test",
      instructions: "Use selected billing",
      actionClass: "publish",
      protectedCategory: "legal",
      providerIds: ["b2c/billing"],
      references: [
        {
          id: "reference.billing",
          path: "knowledge/billing.md",
          title: "Billing",
          loadWhen: "selected",
          resource: { path: "/store-a/billing.md", origin: "skill", sha256: "a".repeat(64) },
        },
      ],
      role: { id: "role.test", name: "Test", promptPath: "roles/test.md", parentPromptPaths: [], contextPacks: [], skillRoutes: [], toolRoutes: [] },
    } as unknown as CatalogWorkflowNode;
    const original = workerContextFingerprint(workflow);
    assert.notEqual(workerContextFingerprint({ ...workflow, protectedCategory: "public_actions" }), workerContextFingerprint(workflow));
    assert.notEqual(workerContextFingerprint({ ...workflow, protectedCategory: undefined }), workerContextFingerprint(workflow));
    assert.notEqual(workerContextFingerprint({ ...workflow, actionClass: "draft" }), workerContextFingerprint(workflow));

    const relocated = structuredClone(workflow);
    relocated.references![0]!.resource!.path = "/store-b/billing.md";
    relocated.references![0]!.resource!.origin = "workspace";
    assert.equal(original, workerContextFingerprint(relocated));
    assert.equal(original, workerContextFingerprint(workflow, { "roles/test.md": { origin: "workspace", sha256: "b".repeat(64) } }));
    relocated.providerIds = [];
    assert.notEqual(original, workerContextFingerprint(relocated));
    relocated.providerIds = workflow.providerIds;
    relocated.references![0]!.resource!.sha256 = "c".repeat(64);
    assert.notEqual(original, workerContextFingerprint(relocated));
  });
  harness.check("worker artifact route retains existing attempt and artifact owners", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", path.join(skillRoot, "checks/verification/fixtures/_worker-artifact-proof.ts")], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS worker artifacts/);
  });
}

import { workerContextFingerprint } from "../../../kernel/composition/worker-context.js";
import type { CatalogWorkflowNode } from "../../../kernel/engine/compile.js";
