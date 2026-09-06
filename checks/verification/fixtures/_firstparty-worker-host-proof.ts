import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { snapshotPackage } from "../../../kernel/composition/resources.js";
import { rebaseSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { composeCatalogFromPacks } from "../../../catalog/index.js";
import { toRecipeCatalogInput } from "../../../catalog/bridge.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import { seedRunState, beginAttempt, writeRunState, reconcilePatch } from "../../../kernel/engine/runstate.js";
import { outputFingerprintPath } from "../../../kernel/engine/artifact-fingerprint.js";
import { createFirstpartyWorkerRoutes } from "../../../kernel/session/firstparty-worker-host.js";
import type { NodeExecutionContext } from "../../../kernel/session/executor.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
const root = process.cwd(),
  temp = mkdtempSync(path.join(tmpdir(), "b2c-shipped-worker-")),
  priorPath = process.env.PATH;
try {
  const workspace = path.join(temp, "workspace"),
    store = path.join(workspace, ".b2c-launch/packages"),
    bin = path.join(temp, "bin"),
    log = path.join(temp, "invocations.jsonl");
  mkdirSync(bin);
  const executable = path.join(bin, "codex");
  writeFileSync(
    executable,
    `#!${process.execPath}\nconst fs=require('node:fs');if(process.argv.includes('--version'))process.exit(0);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(process.argv.slice(2))+'\\n');console.log('deliberately invalid proof');\n`,
  );
  chmodSync(executable, 0o755);
  process.env.PATH = `${bin}:${priorPath ?? ""}`;
  const shipped = readFirstpartyPackage(root),
    snapshot = snapshotPackage(shipped.directory, store),
    dependency = { snapshot, directory: path.join(store, snapshot.digest.slice(7)) };
  const resolved = resolveRecipeBindings({
    packages: [dependency],
    recipe: { packageId: snapshot.extension.id, packageVersion: snapshot.extension.version, recipeId: "b2c/complete-consumer-business" },
    target: { platform: "host", runtime: "agent-cli" },
  });
  assert.equal(resolved.status, "resolved");
  const input = toRecipeCatalogInput(composeCatalogFromPacks(snapshot.extension.version, rebaseSnapshotPacks(workspace, [dependency])), resolved),
    plan = compilePlan(input);
  const node = plan.nodes
    .filter((node) => ["observe", "draft"].includes(node.actionClass) && !node.sourceAccess?.length && !node.reviewOf?.length && node.outputs.length > 0)
    .sort((a, b) => a.inputs.length - b.inputs.length)[0]!;
  assert(node, "no bounded shipped worker candidate");
  const now = new Date().toISOString(),
    run = seedRunState(plan, { lanes: {} } as BusinessStateV2, {
      ownerSessionId: "fixture-host",
      runId: "run.shipped-worker",
      ttlSeconds: 300,
      wallClockCapSeconds: 30,
      now,
    }),
    attempt = beginAttempt(plan, run, node.id, "fixture-worker", now);
  const brief = composeNodeBrief(node, plan);
  for (const relative of [...brief.open, ...brief.contractFiles]) {
    const absolute = path.resolve(workspace, relative);
    assert(absolute.startsWith(workspace + path.sep));
    if (!existsSync(absolute)) {
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, "Explicit synthetic fixture input for host dispatch smoke.\n");
    }
  }
  const runPath = path.join(workspace, "run/run-state.json");
  writeRunState(runPath, run);
  const context: NodeExecutionContext = {
    runId: run.runId,
    attemptId: attempt.id,
    workspaceDir: workspace,
    skillRootDir: root,
    now,
    artifactPaths: Object.fromEntries(plan.artifactBindings.map((binding) => [binding.artifactId, binding.path])),
    heartbeat() {},
    authorization: {
      workflowId: node.workflowId,
      runId: run.runId,
      attemptId: attempt.id,
      executionIdentity: "fixture-worker",
      inputFingerprint: attempt.inputFingerprint,
      evaluatedAt: now,
      actionClass: node.actionClass,
      approvalRequirements: [],
      autonomy: { reasonCode: "fixture.explicit_bounded_host_authority", evidenceRefs: [] },
    },
  };
  const registry = createFirstpartyWorkerRoutes(input, "codex"),
    execution = await registry.execute(node, context);
  assert.equal(execution.status, "failed");
  assert.match(execution.error ?? "", /receipt/i, "executor must reject the fake CLI receipt, rather than fail before meaningful proof parsing");
  assert(existsSync(log), `CLI executor never invoked: ${execution.error}`);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
  // Seed ordinary artifact bytes through the existing result owner solely to reach the independently registered verifier.
  const outputs = node.outputs.map((artifactId) => {
    const relative = context.artifactPaths[artifactId]!,
      file = path.join(workspace, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "Synthetic fixture artifact, not accepted business evidence.\n");
    return { artifactId, path: relative, fingerprint: outputFingerprintPath(file), evidence: ["synthetic host wiring fixture"] };
  });
  reconcilePatch(plan, run, { nodeId: node.id, attemptId: attempt.id, outputs }, now);
  writeRunState(runPath, run);
  const verification = await registry.verify(node, {
    workspaceDir: workspace,
    skillRootDir: root,
    runId: run.runId,
    inputFingerprint: attempt.inputFingerprint,
    now,
    outputs,
  });
  assert.notEqual(verification.status, "accepted");
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 2, `CLI verifier never invoked: ${JSON.stringify(verification)}`);
  const untrusted = structuredClone(input);
  for (const workflow of untrusted.workflows)
    if (workflow.selectedOperation) workflow.selectedOperation.implementation.packageDigest = `sha256:${"0".repeat(64)}`;
  const unavailable = await createFirstpartyWorkerRoutes(untrusted, "codex").execute(node, context);
  assert.equal(unavailable.status, "failed");
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 2, "foreign digest reached the CLI");
  console.log("PASS shipped worker host: real fake CLI executor and verifier, invalid proof refused, foreign digest unregistered");
} finally {
  if (priorPath === undefined) delete process.env.PATH;
  else process.env.PATH = priorPath;
  rmSync(temp, { recursive: true, force: true });
}
