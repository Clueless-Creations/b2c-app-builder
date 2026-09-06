import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { workerArtifactInputSchema, workerArtifactOutputSchema, workerArtifactEvidenceSchema } from "../../../contracts/worker-artifact.js";
import { snapshotPackage } from "../../../kernel/composition/resources.js";
import { rebaseSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { composeCatalog } from "../../../catalog/index.js";
import { toCatalogInput, toRecipeCatalogInput } from "../../../catalog/bridge.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { workerContextFingerprint } from "../../../kernel/composition/worker-context.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { seedRunState, beginAttempt, writeRunState, reconcilePatch } from "../../../kernel/engine/runstate.js";
import { outputFingerprintPath } from "../../../kernel/engine/artifact-fingerprint.js";
import { OperationRouteRegistry, type WorkerArtifactRoute } from "../../../kernel/session/operation-routes.js";
import type { NodeExecutionContext } from "../../../kernel/session/executor.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
const root = process.cwd(),
  temp = mkdtempSync(path.join(tmpdir(), "b2c-worker-artifact-"));
try {
  const source = path.join(temp, "source"),
    workspace = path.join(temp, "workspace"),
    store = path.join(workspace, ".b2c-launch/packages");
  cpSync(path.join(root, "examples/extensions/support-case"), source, { recursive: true });
  let snapshot = snapshotPackage(source, store),
    directory = path.join(store, snapshot.digest.slice(7));
  const original = toCatalogInput(composeCatalog(root, rebaseSnapshotPacks(workspace, [{ snapshot, directory }]))).workflows.find(
    (w) => w.id === "workflow.support-triage",
  )!;
  const manifest = parse(readFileSync(path.join(source, "extension.yaml"), "utf8"));
  const implementation = manifest.implementations[0];
  implementation.mode = "worker-artifact";
  implementation.targets = [{ platform: "host", runtime: "agent-cli" }];
  implementation.workerContext = {
    workflowId: original.id,
    instructions: original.instructions,
    providerIds: original.providerIds,
    contextFingerprint: workerContextFingerprint(original),
  };
  manifest.recipes[0].operations[0].workflowContexts[0].instructions = "implementation";
  manifest.recipes[0].operations[0].workflowContexts[0].roleInstructions = "implementation";
  writeFileSync(path.join(source, "extension.yaml"), stringify(manifest));
  for (const [file, schema] of [
    ["input", workerArtifactInputSchema],
    ["output", workerArtifactOutputSchema],
    ["evidence", workerArtifactEvidenceSchema],
  ] as const)
    writeFileSync(path.join(source, `${file}.json`), JSON.stringify(z.toJSONSchema(schema)));
  snapshot = snapshotPackage(source, store);
  directory = path.join(store, snapshot.digest.slice(7));
  const resolved = resolveRecipeBindings({
    packages: [{ snapshot, directory }],
    recipe: { packageId: manifest.id, packageVersion: "1.0.0", recipeId: manifest.recipes[0].id },
    target: { platform: "host", runtime: "agent-cli" },
  });
  const catalog = composeCatalog(root, rebaseSnapshotPacks(workspace, [{ snapshot, directory }]));
  const plan = compilePlan(toRecipeCatalogInput(catalog, resolved)),
    node = plan.nodes[0]!;
  const run = seedRunState(plan, { lanes: {} } as BusinessStateV2, {
    ownerSessionId: "host",
    runId: "run.worker",
    ttlSeconds: 300,
    wallClockCapSeconds: 1800,
    now: "2026-09-05T00:00:00Z",
  });
  const attempt = beginAttempt(plan, run, node.id, "producer", "2026-09-05T00:00:00Z");
  const context: NodeExecutionContext = {
    runId: run.runId,
    attemptId: attempt.id,
    workspaceDir: workspace,
    skillRootDir: root,
    now: "2026-09-05T00:00:00Z",
    artifactPaths: Object.fromEntries(plan.artifactBindings.map((b) => [b.artifactId, b.path])),
    heartbeat() {},
    authorization: {
      workflowId: node.workflowId,
      runId: run.runId,
      attemptId: attempt.id,
      executionIdentity: "worker.test",
      inputFingerprint: attempt.inputFingerprint,
      evaluatedAt: "2026-09-05T00:00:00Z",
      actionClass: node.actionClass,
      approvalRequirements: [],
      autonomy: { reasonCode: "fixture", evidenceRefs: [] },
    },
  };
  let calls = 0;
  const route: WorkerArtifactRoute = {
    kind: "worker-artifacts",
    operation: node.selectedOperation!.operation,
    implementationId: node.selectedOperation!.implementation.id,
    packageDigest: snapshot.digest,
    executor: {
      async execute() {
        calls++;
        const outputs = node.outputs.map((artifactId) => {
          const relative = context.artifactPaths[artifactId]!,
            file = path.join(workspace, relative);
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, "Real arbitrary worker artifact content.");
          return { artifactId, path: relative, fingerprint: outputFingerprintPath(file), evidence: ["local bytes"] };
        });
        return { status: "succeeded", outputs, evidence: ["worker"] };
      },
    },
    verifier: {
      async verify() {
        return { status: "accepted", evidence: "independent local fixture review" };
      },
    },
  };
  const registry = new OperationRouteRegistry([route]);
  assert.equal((await registry.execute(node, context)).status, "failed");
  assert.equal(calls, 0);
  const runPath = path.join(workspace, "run/run-state.json");
  writeRunState(runPath, run);
  const altered = structuredClone(node);
  altered.instructions += " changed";
  assert.equal((await registry.execute(altered, context)).status, "failed");
  assert.equal(calls, 0);
  assert.equal(node.outputs.length, 2);
  const swappedPaths = {
    ...context.artifactPaths,
    [node.outputs[0]!]: context.artifactPaths[node.outputs[1]!]!,
    [node.outputs[1]!]: context.artifactPaths[node.outputs[0]!]!,
  };
  assert.equal((await registry.execute(node, { ...context, artifactPaths: swappedPaths })).status, "failed");
  assert.equal(calls, 0, "swapped execution paths must refuse before delegate");
  const rogue = new OperationRouteRegistry([
    {
      ...route,
      executor: {
        async execute() {
          writeFileSync(path.join(workspace, "undeclared.txt"), "unexpected");
          throw Error("worker interrupted");
        },
      },
    },
  ]);
  const rogueResult = await rogue.execute(node, context);
  assert.equal(rogueResult.status, "failed");
  assert.match(rogueResult.error ?? "", /worker_mutated_undeclared_workspace/);
  rmSync(path.join(workspace, "undeclared.txt"));
  const result = await registry.execute(node, context);
  assert.equal(result.status, "succeeded", result.error ?? "worker route refused");
  assert.equal(calls, 1);
  reconcilePatch(plan, run, { nodeId: node.id, attemptId: attempt.id, outputs: result.outputs.map((o) => ({ ...o, evidence: [...o.evidence] })) }, context.now);
  writeRunState(runPath, run);
  const verification = {
    workspaceDir: workspace,
    skillRootDir: root,
    runId: run.runId,
    inputFingerprint: attempt.inputFingerprint,
    now: context.now,
    outputs: result.outputs,
  };
  const verdict = await registry.verify(node, verification);
  assert.equal(verdict.status, "accepted", JSON.stringify(verdict));
  assert.equal((await registry.verify(node, { ...verification, runId: "run.other" })).status, "rejected");
  const swappedOutputs = result.outputs.map((output, index) => ({
    ...output,
    path: result.outputs[1 - index]!.path,
    fingerprint: result.outputs[1 - index]!.fingerprint,
  }));
  const swappedRun = structuredClone(run);
  for (const output of swappedOutputs) {
    const binding = swappedRun.artifactBindings.find((entry) => entry.artifactId === output.artifactId)!;
    binding.path = output.path;
    binding.fingerprint = output.fingerprint;
  }
  writeRunState(runPath, swappedRun);
  assert.equal(
    (await registry.verify(node, { ...verification, outputs: swappedOutputs })).status,
    "rejected",
    "even matching persisted swapped pairs must fail compiled artifact mapping",
  );
  writeRunState(runPath, run);
  const mutating = new OperationRouteRegistry([
    {
      ...route,
      verifier: {
        async verify() {
          writeFileSync(path.join(workspace, "unexpected.txt"), "unauthorized");
          return { status: "accepted" as const, evidence: "false" };
        },
      },
    },
  ]);
  assert.equal((await mutating.verify(node, verification)).status, "rejected");
  writeFileSync(path.join(workspace, result.outputs[0]!.path), "tampered");
  assert.equal((await registry.verify(node, verification)).status, "rejected");
  console.log("PASS worker artifacts existing attempts, arbitrary outputs, tamper and independent review");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
