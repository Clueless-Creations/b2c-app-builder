import assert from "node:assert/strict";
import { compilePlan } from "../../../kernel/engine/compile.js";
import {
  seedRunState,
  beginAttempt,
  reconcilePatch,
  acceptVerification,
  reopenRecurringNodes,
  currentCycleAttempts,
  attemptsUsedInCurrentCycle,
  requestVerificationRepair,
  writeRunState,
  loadRunState,
} from "../../../kernel/engine/runstate.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import { currentPin } from "./run-persistence.fixtures.js";
import type { Harness } from "./_harness.js";
import path from "node:path";
const now = "2026-09-05T12:00:00.000Z";
function setup(maxAttempts: number) {
  const catalog = structuredClone(currentPin.catalog);
  catalog.workflows[0]!.maxAttempts = maxAttempts;
  catalog.workflows[0]!.recurrenceDays = 7;
  const plan = compilePlan(catalog, now),
    node = plan.nodes[0]!;
  const run = seedRunState(plan, { lanes: {} } as BusinessStateV2, {
    ownerSessionId: "producer",
    runId: "run.recurring",
    ttlSeconds: 300,
    wallClockCapSeconds: 1800,
    now,
  });
  for (const approval of node.approvals) run.approvals[approval.id] = "approved";
  const finish = (at: string) => {
    const attempt = beginAttempt(plan, run, node.id, "producer", at);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: node.id,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.saved-method", path: "research/method.md", fingerprint: `proof-${attempt.number}`, evidence: ["Synthetic proof"] }],
      },
      at,
    );
    acceptVerification(plan, run, node.id, ["Independent synthetic proof"], at, "reviewer");
    return attempt;
  };
  return { plan, node, run, finish };
}
export function register(h: Harness): void {
  h.check("recurrence budget: a second weekly cycle gets one attempt and preserves durable history", () => {
    const f = setup(1);
    const first = f.finish(now);
    const original = structuredClone(first);
    assert.deepEqual(reopenRecurringNodes(f.plan, f.run, "2026-09-11T12:00:00.000Z"), []);
    const next = "2026-09-12T12:00:00.000Z";
    assert.deepEqual(reopenRecurringNodes(f.plan, f.run, next), [f.node.id]);
    assert.equal(attemptsUsedInCurrentCycle(f.run.nodes[f.node.id]!), 0);
    const second = f.finish(next);
    assert.equal(second.number, 2);
    assert.notEqual(second.id, first.id);
    assert.deepEqual(f.run.nodes[f.node.id]!.attempts[0], original);
    assert.throws(() => beginAttempt(f.plan, f.run, f.node.id, "producer", next), /exhausted/);
    const file = path.join(h.makeTempDir("recurrence-cycle"), "run-state.json");
    writeRunState(file, f.run);
    const loaded = loadRunState(file);
    assert.equal(loaded.nodes[f.node.id]!.attemptCycleStart, 1);
    assert.equal(attemptsUsedInCurrentCycle(loaded.nodes[f.node.id]!), 1);
  });
  h.check("recurrence budget: a failed new cycle cannot reset its repair budget by ticking again", () => {
    const f = setup(2);
    f.finish(now);
    const next = "2026-09-12T12:00:00.000Z";
    reopenRecurringNodes(f.plan, f.run, next);
    beginAttempt(f.plan, f.run, f.node.id, "producer", next);
    assert.deepEqual(requestVerificationRepair(f.plan, f.run, f.node.id, ["Synthetic correction"], next), [f.node.id]);
    assert.deepEqual(reopenRecurringNodes(f.plan, f.run, "2026-10-12T12:00:00.000Z"), []);
    beginAttempt(f.plan, f.run, f.node.id, "producer", next);
    assert.deepEqual(requestVerificationRepair(f.plan, f.run, f.node.id, ["Still needs correction"], next), []);
    assert.equal(f.run.nodes[f.node.id]!.status, "blocked");
    assert.equal(f.run.nodes[f.node.id]!.attempts.length, 3);
    assert.equal(currentCycleAttempts(f.run.nodes[f.node.id]!).length, 2);
  });
  h.check("recurrence budget: occurrence repairs count their occurrence without creating authority", () => {
    const f = setup(1);
    beginAttempt(f.plan, f.run, f.node.id, "producer", now, "occurrence.one");
    assert.throws(() => beginAttempt(f.plan, f.run, f.node.id, "producer", now, "occurrence.one"), /Unknown work-order occurrence/);
    const second = beginAttempt(f.plan, f.run, f.node.id, "producer", now, "occurrence.two");
    assert.equal(second.number, 2);
    assert.equal(attemptsUsedInCurrentCycle(f.run.nodes[f.node.id]!), 1);
    assert.deepEqual(f.run.workOrders, {});
  });
}
