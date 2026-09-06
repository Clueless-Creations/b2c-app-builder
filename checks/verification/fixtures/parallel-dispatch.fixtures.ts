import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import type { Harness } from "./_harness.js";
import { bootstrapWorkspace, slowSilentCatalog, grant, waiver, runSession, readRunState } from "./session.fixtures.js";

export function register(harness: Harness): void {
  harness.check("parallel dispatch: invalid limit refuses before creating runtime state", () => {
    const root = harness.makeTempDir("parallel-invalid-limit");
    for (const limit of ["NaN", "Infinity", "0", "-1", "1.5"]) {
      const result = runSession(["--workspace", root, "--brief", "missing.json", "--session", "invalid", "--max-concurrency", limit]);
      assert.equal(result.code, 1);
      assert.match(result.output, /session.invalid_concurrency/);
      assert.deepEqual(readdirSync(root), []);
    }
  });
  harness.check("parallel dispatch: budget is reserved before a sibling starts", () => {
    const catalog = slowSilentCatalog();
    const first = catalog.workflows[0]!;
    first.domainId = "domain.money";
    first.actionClass = "spend";
    first.protectedCategory = "spend";
    first.costEstimate = { amount: 25, currency: "USD" };
    catalog.artifacts.push({ id: "artifact.second-cost", path: "money/second.log" });
    catalog.workflows.push({ ...first, id: "workflow.second-cost", outputPaths: ["money/second.log"] });
    const now = new Date().toISOString();
    const handle = bootstrapWorkspace(harness, "parallel-budget", catalog, {
      grants: { "domain.money": grant("domain.money", "full") },
      waivers: [waiver("parallel-spend", "domain.money", "spend", "spend")],
      balances: [{ unit: "Revenue", period: now.slice(0, 7), currency: "USD", allocated: 30, committed: 0, spent: 0, remaining: 30, updatedAt: now }],
    });
    const result = runSession([
      "--workspace",
      handle.dir,
      "--brief",
      handle.briefPath,
      "--session",
      "budget-proof",
      "--executor",
      "slow-silent",
      "--slow-delay-ms",
      "300",
      "--max-concurrency",
      "2",
    ]);
    assert.equal(result.code, 0, result.output);
    const state = readRunState(handle);
    assert.equal(state.nodes["run.eng-change"]!.attempts.length, 1, JSON.stringify(state.nodes));
    assert.equal(state.nodes["run.second-cost"]!.attempts.length, 0);
    assert.match(state.nodes["run.second-cost"]!.blocker ?? "", /budget|fund|balance|remaining/i);
  });
  for (const scenario of [
    { name: "independent workers overlap", concurrency: 2, conflict: false, overlap: true },
    { name: "one worker limit serializes", concurrency: 1, conflict: false, overlap: false },
    { name: "shared provider serializes", concurrency: 2, conflict: true, overlap: false },
  ]) {
    harness.check(`parallel dispatch: ${scenario.name}`, () => {
      const catalog = slowSilentCatalog();
      const first = catalog.workflows[0]!;
      if (scenario.conflict) first.providerIds = ["provider.fixture"];
      catalog.artifacts.push({ id: "artifact.second-change", path: "product/second.log" });
      catalog.workflows.push({ ...first, id: "workflow.second-change", title: "Improve return use", outputPaths: ["product/second.log"] });
      const handle = bootstrapWorkspace(harness, `parallel-${scenario.concurrency}-${scenario.conflict}`, catalog, {
        grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
      });
      const result = runSession([
        "--workspace",
        handle.dir,
        "--brief",
        handle.briefPath,
        "--session",
        "parallel-proof",
        "--executor",
        "slow-silent",
        "--slow-delay-ms",
        "300",
        "--max-concurrency",
        String(scenario.concurrency),
      ]);
      assert.equal(result.code, 0, result.output);
      const state = readRunState(handle);
      const a = state.nodes["run.eng-change"]!.attempts[0]!;
      const b = state.nodes["run.second-change"]!.attempts[0]!;
      assert.equal(state.nodes["run.eng-change"]!.attempts.length, 1, JSON.stringify(state.nodes));
      assert.equal(state.nodes["run.second-change"]!.attempts.length, 1);
      assert(a.startedAt && b.startedAt && a.finishedAt && b.finishedAt, "both workers must durably reconcile");
      const overlap = Date.parse(a.startedAt) < Date.parse(b.finishedAt) && Date.parse(b.startedAt) < Date.parse(a.finishedAt);
      assert.equal(overlap, scenario.overlap, JSON.stringify({ a, b }));
    });
  }
}
