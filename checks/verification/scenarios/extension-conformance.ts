import { trackRuntimeWrites } from "../../../kernel/session/runtime-write-audit.js";
import { acquireLock, heartbeat, releaseLock } from "../../../kernel/reducer/lock.js";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { snapshotPackage } from "../../../kernel/composition/resources.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { rebaseSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { composeCatalog } from "../../../catalog/index.js";
import { toRecipeCatalogInput } from "../../../catalog/bridge.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { createCliExecutor, createCliVerifier, type NodeExecutionContext } from "../../../kernel/session/executor.js";
import {
  seedRunState,
  beginAttempt,
  reconcilePatch,
  acceptVerification,
  writeRunState,
  loadRunState,
  reopenRecurringNodes,
} from "../../../kernel/engine/runstate.js";
import { captureReviewEvidence } from "../../../kernel/engine/review-evidence.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import { OperationRouteRegistry, type OperationRoute } from "../../../kernel/session/operation-routes.js";

import { spawnSync } from "node:child_process";
import type { Harness } from "../fixtures/_harness.js";

export function register(harness: Harness): void {
  harness.check("external extension conformance executes real local outputs and refuses false proof", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], {
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /PASS external snapshot/);
  });
}

async function proveExtension(): Promise<void> {
  const temporary = mkdtempSync(path.join(tmpdir(), "b2c-external-conformance-"));
  try {
    const source = path.join(temporary, "external-package");
    cpSync(fileURLToPath(new URL("../../../examples/extensions/support-case", import.meta.url)), source, { recursive: true });
    const installedWorkspace = path.join(temporary, "installed-workspace");
    const store = path.join(installedWorkspace, ".b2c-launch/packages");
    const snapshot = snapshotPackage(source, store);
    const directory = path.join(store, snapshot.digest.slice(7));
    rmSync(source, { recursive: true });
    const resolved = resolveRecipeBindings({
      packages: [{ directory, snapshot }],
      recipe: { packageId: "support-example/package", packageVersion: "1.0.0", recipeId: "support-example/loop" },
      target: { platform: "host", runtime: "node22" },
    });
    assert.equal(resolved.status, "resolved");
    const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
    const catalog = composeCatalog(repositoryRoot, rebaseSnapshotPacks(installedWorkspace, [{ directory, snapshot }]));
    const plan = compilePlan(toRecipeCatalogInput(catalog, resolved));
    assert.equal(plan.nodes.length, 1, "unrelated default workflows leaked into external recipe");
    const node = plan.nodes.find((entry) => entry.workflowId === "workflow.support-triage")!;
    node.recurrenceDays = 7;
    const fakeTransport = new Map<string, { output: unknown; evidence: unknown }>();
    let writes = 0;
    const route: OperationRoute = {
      operation: "support-example/triage",
      implementationId: "support-example/fake",
      packageDigest: snapshot.digest,
      resultArtifactId: "artifact.support-result-json",
      receiptArtifactId: "artifact.support-receipt-json",
      maxReceiptAgeMs: 60_000,
      input: () => ({ caseId: "case-1", message: "I cannot access the paid app." }),
      execute: async ({ input, idempotencyKey, knowledge }) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        assert(knowledge.some((entry) => entry.text.includes("Do not send")));
        const prior = fakeTransport.get(idempotencyKey);
        if (prior) return prior;
        writes++;
        const result = {
          output: {
            caseId: (input as { caseId: string }).caseId,
            priority: "urgent",
            draftResponse: "Please try restoring your purchase, then tell us what happens.",
          },
          evidence: { caseId: "case-1", requestKey: idempotencyKey, observedState: "triaged", transport: "fake" },
        };
        fakeTransport.set(idempotencyKey, result);
        return result;
      },
      observe: async ({ output, evidence, idempotencyKey }) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        const actual = fakeTransport.get(idempotencyKey);
        return !!actual && JSON.stringify(actual.output) === JSON.stringify(output) && JSON.stringify(actual.evidence) === JSON.stringify(evidence);
      },
    };
    const registry = new OperationRouteRegistry([route]);
    const executor = createCliExecutor("auto", registry);
    const verifier = createCliVerifier("auto", registry);
    function context(name: string): NodeExecutionContext {
      const workspaceDir = path.join(temporary, name);
      mkdirSync(workspaceDir);
      cpSync(directory, path.join(workspaceDir, ".b2c-launch/packages", snapshot.digest.slice(7)), { recursive: true });
      return {
        runId: `run.${name}`,
        attemptId: "attempt.1",
        workspaceDir,
        now: "2026-09-05T00:00:00.000Z",
        skillRootDir: temporary,
        artifactPaths: { "artifact.support-result-json": "support/result.json", "artifact.support-receipt-json": "support/receipt.json" },
        heartbeat: () => {},
        authorization: {
          workflowId: node.workflowId,
          runId: `run.${name}`,
          attemptId: "attempt.1",
          executionIdentity: `worker.${name}`,
          inputFingerprint: "fixture-input",
          evaluatedAt: "2026-09-05T00:00:00.000Z",
          actionClass: "draft",
          approvalRequirements: [],
          autonomy: { reasonCode: "conformance.host_authorized", evidenceRefs: [] },
        },
      };
    }
    const initial = context("good");
    const run = seedRunState(plan, { lanes: {} } as BusinessStateV2, {
      ownerSessionId: "conformance-host",
      runId: initial.runId,
      ttlSeconds: 300,
      wallClockCapSeconds: 1800,
      now: initial.now,
    });
    const attempt = beginAttempt(plan, run, node.id, "conformance-producer", initial.now);
    const good = {
      ...initial,
      attemptId: attempt.id,
      authorization: { ...initial.authorization!, attemptId: attempt.id, inputFingerprint: attempt.inputFingerprint },
    };

    const runPath = path.join(good.workspaceDir, "run/run-state.json");
    writeRunState(runPath, run);
    const sessionLock = path.join(good.workspaceDir, "control/session.lock");
    assert(acquireLock(sessionLock, { ownerSessionId: "conformance-heartbeat", retries: 0 }).ok);
    async function withHeartbeats<T>(operation: (runtimeWrites: ReturnType<typeof trackRuntimeWrites>["snapshot"]) => Promise<T>): Promise<T> {
      const tracking = trackRuntimeWrites(good.workspaceDir);
      let beats = 0;
      let failure: unknown;
      const timer = setInterval(() => {
        try {
          tracking.write("run/run-state.json", () => writeRunState(runPath, run));
          tracking.write("control/session.lock", () => heartbeat(sessionLock, "conformance-heartbeat"));
          beats++;
        } catch (error) {
          failure = error;
        }
      }, 5);
      try {
        const value = await operation(tracking.snapshot);
        if (failure) throw failure;
        tracking.assertIntact();
        assert(beats > 0, "slow callback did not overlap trusted heartbeat");
        return value;
      } finally {
        clearInterval(timer);
      }
    }
    const result = await withHeartbeats((runtimeWrites) => executor.execute(node, { ...good, runtimeWrites }));
    assert.equal(result.status, "succeeded", result.error ?? "execution refused");
    assert.equal(writes, 1);
    reconcilePatch(
      plan,
      run,
      { nodeId: node.id, attemptId: attempt.id, outputs: result.outputs.map((entry) => ({ ...entry, evidence: [...entry.evidence] })) },
      good.now,
    );
    const verified = await withHeartbeats((runtimeWrites) =>
      verifier.verify(node, {
        runtimeWrites,
        runId: good.runId,
        inputFingerprint: good.authorization.inputFingerprint,
        workspaceDir: good.workspaceDir,
        skillRootDir: temporary,
        outputs: result.outputs,
        now: good.now,
      }),
    );
    assert.equal(verified.status, "accepted", verified.error ?? "verification refused");
    const review = captureReviewEvidence(plan, run, node.id, good.workspaceDir, "conformance-observer", good.now, "workspace");
    acceptVerification(plan, run, node.id, [verified.evidence], good.now, "conformance-observer", review, good.workspaceDir);

    writeRunState(runPath, run);
    releaseLock(sessionLock, "conformance-heartbeat");
    assert.equal(loadRunState(runPath).nodes[node.id]!.status, "succeeded", "current runtime acceptance did not survive resume");
    assert.equal((await executor.execute(node, good)).status, "succeeded");
    assert.equal(writes, 1, "replay duplicated effect");
    const fifoContext = context("fifo-output");
    mkdirSync(path.join(fifoContext.workspaceDir, "support"));
    writeFileSync(path.join(fifoContext.workspaceDir, "support/result.json"), readFileSync(path.join(good.workspaceDir, "support/result.json")));
    assert.equal(spawnSync("mkfifo", [path.join(fifoContext.workspaceDir, "support/receipt.json")]).status, 0);
    const fifoResult = await executor.execute(node, fifoContext);
    assert.match(fifoResult.error ?? "", /nonregular_or_oversized/);
    assert.equal(writes, 1, "FIFO replay reached external effect");
    const oversizedContext = context("oversized-output");
    mkdirSync(path.join(oversizedContext.workspaceDir, "support"));
    writeFileSync(path.join(oversizedContext.workspaceDir, "support/result.json"), "{}");
    writeFileSync(path.join(oversizedContext.workspaceDir, "support/receipt.json"), Buffer.alloc(1024 * 1024 + 1));
    assert.match((await executor.execute(node, oversizedContext)).error ?? "", /nonregular_or_oversized/);
    assert.equal(writes, 1, "oversized replay reached external effect");
    const noRoute = await createCliExecutor().execute(node, context("no-route"));
    assert.equal(noRoute.status, "failed");
    assert.match(noRoute.error!, /route_unavailable/);
    const unauthorized = context("unauthorized");
    const unauthorizedResult = await executor.execute(node, { ...unauthorized, authorization: undefined });
    assert.equal(unauthorizedResult.status, "failed");
    assert.equal(writes, 1);
    const invalid = createCliExecutor("auto", new OperationRouteRegistry([{ ...route, execute: async () => ({ output: { success: true }, evidence: {} }) }]));
    assert.match((await invalid.execute(node, context("invalid"))).error!, /outputSchema_invalid/);
    const invalidEvidence = createCliExecutor(
      "auto",
      new OperationRouteRegistry([
        {
          ...route,
          execute: async () => ({
            output: { caseId: "case-1", priority: "normal", draftResponse: "A schema valid response with missing observation evidence." },
            evidence: {},
          }),
        },
      ]),
    );
    assert.match((await invalidEvidence.execute(node, context("invalid-evidence"))).error!, /evidenceSchema_invalid/);
    const liar = createCliExecutor(
      "auto",
      new OperationRouteRegistry([
        {
          ...route,
          execute: async ({ idempotencyKey }) => ({
            output: { caseId: "case-1", priority: "normal", draftResponse: "A fabricated result without transport readback." },
            evidence: { caseId: "case-1", requestKey: idempotencyKey, observedState: "triaged", transport: "fake" },
          }),
        },
      ]),
    );
    assert.match((await liar.execute(node, context("liar"))).error!, /observation_missing/);
    let crashEffects = 0;
    const crash = createCliExecutor(
      "auto",
      new OperationRouteRegistry([
        {
          ...route,
          execute: async () => {
            crashEffects++;
            throw new Error("crash after effect");
          },
        },
      ]),
    );
    const crashContext = context("crash");
    assert.equal((await crash.execute(node, crashContext)).status, "failed");
    assert.match((await crash.execute(node, crashContext)).error!, /partial_prior_result_requires_readback/);
    assert.equal(crashEffects, 1, "ambiguous prior effect repeated");
    const impureContext = context("impure-input");
    const impure = createCliExecutor(
      "auto",
      new OperationRouteRegistry([
        {
          ...route,
          input: () => {
            writeFileSync(path.join(impureContext.workspaceDir, "undeclared.txt"), "bad");
            return { caseId: "case-1", message: "test" };
          },
        },
      ]),
    );
    assert.match((await impure.execute(node, impureContext)).error!, /input_callback_mutated_workspace/);
    assert.match(
      (
        await verifier.verify(node, {
          runId: "run.other",
          inputFingerprint: good.authorization.inputFingerprint,
          workspaceDir: good.workspaceDir,
          skillRootDir: temporary,
          outputs: result.outputs,
          now: good.now,
        })
      ).error!,
      /execution_identity_mismatch/,
    );
    const receiptPath = path.join(good.workspaceDir, "support/receipt.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    writeFileSync(receiptPath, JSON.stringify({ ...receipt, implementationId: "support-example/forged" }));
    assert.equal(
      (
        await verifier.verify(node, {
          runId: good.runId,
          inputFingerprint: good.authorization.inputFingerprint,
          workspaceDir: good.workspaceDir,
          skillRootDir: temporary,
          outputs: result.outputs,
          now: good.now,
        })
      ).status,
      "rejected",
    );
    writeFileSync(receiptPath, JSON.stringify(receipt));
    assert.match(
      (
        await verifier.verify(node, {
          runId: good.runId,
          inputFingerprint: good.authorization.inputFingerprint,
          workspaceDir: good.workspaceDir,
          skillRootDir: temporary,
          outputs: result.outputs,
          now: "2026-09-05T00:02:00.000Z",
        })
      ).error!,
      /receipt_stale/,
    );
    const staleReplay = { ...good, now: "2026-09-05T00:02:00.000Z", authorization: { ...good.authorization!, evaluatedAt: "2026-09-05T00:02:00.000Z" } };
    assert.match((await executor.execute(node, staleReplay)).error!, /receipt_stale/);
    assert.equal(writes, 1);
    // Restore exact accepted receipt bytes after the intentional tamper tests.
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    const nextAt = "2026-09-12T00:00:00.000Z";
    assert.deepEqual(reopenRecurringNodes(plan, run, nextAt), [node.id]);
    const nextAttempt = beginAttempt(plan, run, node.id, "conformance-producer-next", nextAt);
    writeRunState(runPath, run);
    const nextContext = {
      ...good,
      attemptId: nextAttempt.id,
      now: nextAt,
      authorization: { ...good.authorization, attemptId: nextAttempt.id, inputFingerprint: nextAttempt.inputFingerprint, evaluatedAt: nextAt },
    };
    const savedReview = run.nodes[node.id]!.attempts[0]!.independentVerification;
    run.nodes[node.id]!.attempts[0]!.independentVerification = undefined;
    writeRunState(runPath, run);
    const refusedCycle = await executor.execute(node, nextContext);
    assert.match(refusedCycle.error ?? "", /rollover_prior_not_independently_accepted/);
    assert.equal(writes, 1);
    run.nodes[node.id]!.attempts[0]!.independentVerification = savedReview;
    writeRunState(runPath, run);
    const nextResult = await executor.execute(node, nextContext);
    assert.equal(nextResult.status, "succeeded", nextResult.error ?? "rollover failed");
    assert.equal(writes, 2, "new accepted recurrence did not execute once");
    assert.equal((await executor.execute(node, nextContext)).status, "succeeded");
    assert.equal(writes, 2, "same recurrence replay duplicated effect");
    console.log(
      "PASS external snapshot after source deletion; real declared artifacts; custom schemas; independent fake readback; replay idempotency; unavailable route; unauthorized effect; invalid output; fake success; mismatched and stale receipts. Provider live proof: not observed.",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await proveExtension();
