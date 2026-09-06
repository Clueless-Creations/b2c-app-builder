import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { acceptVerification, beginAttempt, loadRunState, reconcilePatch, seedRunState, writeRunState } from "../../../kernel/engine/runstate.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import type { Harness } from "./_harness.js";

export const currentPin = JSON.parse(readFileSync(new URL("./current-pin.json", import.meta.url), "utf8")) as {
  compiledAt: string;
  catalog: CatalogInput;
};

export function register(harness: Harness): void {
  harness.check("run persistence: a saved run keeps approvals, attempts, and independent evidence", () => {
    const plan = compilePlan(currentPin.catalog, currentPin.compiledAt);
    const run = seedRunState(plan, { lanes: {} } as BusinessStateV2, {
      ownerSessionId: "current-session",
      runId: "run.persistence-characterization",
      ttlSeconds: 300,
      wallClockCapSeconds: 1800,
      now: currentPin.compiledAt,
    });
    const node = plan.nodes[0]!;
    run.approvals[node.approvals[0]!.id] = "approved";
    const attempt = beginAttempt(plan, run, node.id, "current-producer", currentPin.compiledAt);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: node.id,
        attemptId: attempt.id,
        outputs: [
          {
            artifactId: "artifact.saved-method",
            path: "research/method.md",
            fingerprint: "saved-method-digest",
            evidence: ["The source-backed method is recorded."],
          },
        ],
      },
      currentPin.compiledAt,
    );
    acceptVerification(plan, run, node.id, ["An independent reviewer checked the source."], currentPin.compiledAt, "current-reviewer");
    const file = path.join(harness.makeTempDir("persistence-resume"), "run-state.json");
    writeRunState(file, run);
    const before = readFileSync(file);
    const resumed = loadRunState(file);
    assert.equal(resumed.planId, compilePlan(currentPin.catalog).planId);
    assert.deepEqual(resumed, JSON.parse(JSON.stringify(run)));
    assert.equal(resumed.nodes[node.id]!.verifiedBySessionId, "current-reviewer");
    assert.deepEqual(readFileSync(file), before);
  });
}
