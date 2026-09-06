import type { CatalogInput } from "../../../kernel/engine/compile.js";
import { assert, type Harness } from "../fixtures/_harness.js";
import { bootstrapScenarioWorkspace, grant, readDigest, readRunState, runSession } from "./_workspace.js";

/**
 * Ports LaunchBench scenario `continuity-drift-between-sessions.yaml` (validators cited there:
 * check-continuity-contract [port-disposition: port], check-agent-entrypoints [drop],
 * check-workflow-adherence [drop] — the port ledger). The YAML's own must_catch item is R1 in
 * plain language: "chat memory was treated as source truth instead of durable repo files."
 *
 * R1 says a session — interactive or scheduled, any runtime — "reconstructs truth from durable
 * state, never from chat memory." The strongest mechanical proof of that isn't an in-process
 * assertion (engine.fixtures.ts's "mid-launch seeding excludes completed work" already covers the
 * in-process half): it's two REAL, separate OS processes sharing nothing but the filesystem. This
 * check runs kernel/session/run.ts twice, back to back, each as its own `spawnSync` child — there is
 * no JS heap, no closure, no chat transcript a second process could reach into even if it wanted
 * to. If session 2 correctly treats session 1's work as done, that fact came from
 * run/run-state.json and state/business-state.json on disk, because there is nothing else it could
 * have come from.
 */
function twoNodeCatalog(): CatalogInput {
  return {
    version: "catalog.continuity-scenario",
    artifacts: [
      { id: "artifact.growth-scan", path: "growth/scan.md" },
      { id: "artifact.eng-change", path: "engineering/change.log" },
    ],
    workflows: [
      // check:gates-layout is a real, workspace-independent gate: since gateless outputs stopped
      // auto-accepting (the 2026-08 verification flip), a scenario node that must reach VERIFIED
      // inside one headless session needs a deterministic gate that can genuinely pass here.
      {
        id: "workflow.growth-scan",
        title: "Scan what people are saying",
        domainId: "domain.growth",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["growth/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: ["check:gates-layout"],
        idempotent: true,
      },
      {
        id: "workflow.eng-change",
        title: "Update the onboarding copy",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/change.log"],
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
    "scenario/continuity-from-durable-state (ports continuity-drift-between-sessions): a second, wholly separate session process picks up exactly where the first left off, from disk alone",
    () => {
      const handle = bootstrapScenarioWorkspace(harness, "continuity", twoNodeCatalog(), {
        grants: { "domain.growth": grant("domain.growth", "review-first"), "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
      });

      // Session 1: a fresh process, fresh workspace. Both nodes should advance.
      const first = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-continuity-1", "--executor", "fixture"]);
      assert(first.code === 0, `expected session 1 to exit 0, got ${first.code}: ${first.output}`);
      const firstDigest = readDigest(handle, "sess-continuity-1");
      assert(firstDigest.includes("Scan what people are saying"), `expected session 1 to advance the growth node, got:\n${firstDigest}`);
      assert(firstDigest.includes("Update the onboarding copy"), `expected session 1 to advance the engineering node, got:\n${firstDigest}`);

      const runAfterFirst = readRunState(handle);
      assert(runAfterFirst.nodes["run.growth-scan"]?.status === "succeeded", "expected the growth node succeeded after session 1");
      assert(runAfterFirst.nodes["run.eng-change"]?.status === "succeeded", "expected the engineering node succeeded after session 1");

      // Session 2: a BRAND NEW spawnSync child process. No shared memory with session 1 is even
      // possible here — whatever it knows, it read from run-state.json / business-state.json.
      const second = runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "sess-continuity-2", "--executor", "fixture"]);
      assert(second.code === 0, `expected session 2 to exit 0, got ${second.code}: ${second.output}`);
      const secondDigest = readDigest(handle, "sess-continuity-2");

      // Correct continuity means BOTH: nothing gets blindly re-run (it already succeeded), and
      // nothing gets silently forgotten (a bug that reset state would look like "advanced" again,
      // which would be just as wrong as re-running idempotent work from scratch).
      assert(
        secondDigest.includes("Nothing was ready to work on this session."),
        `expected session 2's headline to report nothing left to do, got:\n${secondDigest}`,
      );
      assert(!secondDigest.includes("Scan what people are saying"), `expected session 2 not to re-advance already-succeeded work, got:\n${secondDigest}`);
      assert(!secondDigest.includes("Update the onboarding copy"), `expected session 2 not to re-advance already-succeeded work, got:\n${secondDigest}`);

      const runAfterSecond = readRunState(handle);
      assert(
        runAfterSecond.nodes["run.growth-scan"]?.status === "succeeded",
        "expected the growth node to remain succeeded (not reset, not re-run) after session 2",
      );
      assert(
        runAfterSecond.nodes["run.eng-change"]?.status === "succeeded",
        "expected the engineering node to remain succeeded (not reset, not re-run) after session 2",
      );
      assert(
        runAfterSecond.nodes["run.growth-scan"]!.attempts.length === 1,
        "expected exactly one attempt total for the growth node across both sessions — session 2 must not have made a second attempt",
      );
    },
  );
}
