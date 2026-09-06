import { captureReviewEvidence } from "../../../kernel/engine/review-evidence.js";
import { hasCurrentDeterministicVerification, requiresIndependentReview, recordDeterministicVerification } from "../../../kernel/engine/verification.js";
import test from "node:test";
import { callPublicOperation } from "../../../kernel/services/business.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initializeProductFixture } from "../fixtures/product-fixture.js";
import { runSession, recoverPublicRequest } from "../../../kernel/session/run.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import { loadWorkspaceCatalog } from "../../../kernel/session/catalog-contract.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { seedRunState, writeRunState, beginAttempt, reconcilePatch, acceptVerification } from "../../../kernel/engine/runstate.js";
import { acquireLock, releaseLock } from "../../../kernel/reducer/lock.js";

test("public request recovery closes only settled requests without dispatch or proof changes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "b2c-request-recovery-"));
  try {
    initializeProductFixture(root, "Recovery fixture");
    const catalog = loadWorkspaceCatalog(root);
    assert(catalog.ok);
    const plan = compilePlan(catalog.catalog, "2026-01-01T00:00:00.000Z");
    const run = seedRunState(plan, JSON.parse(readFileSync(path.join(root, "state/business-state.json"), "utf8")), {
      ownerSessionId: "interrupted",
      ttlSeconds: 60,
      wallClockCapSeconds: 60,
      now: "2026-01-01T00:00:00.000Z",
    });
    run.publicRequests = { requestA: { requestDigest: `sha256:${"a".repeat(64)}`, sessionId: "interrupted", status: "running" } };
    const runFile = path.join(root, "run/run-state.json");
    const reset = () => writeRunState(runFile, structuredClone(run));
    const recover = () => recoverPublicRequest(root, { expectedRevision: workspaceRevision(root), requestId: "requestA" });
    reset();
    const before = readFileSync(runFile, "utf8");
    assert.throws(() => recoverPublicRequest(root, { expectedRevision: `sha256:${"0".repeat(64)}`, requestId: "requestA" }), /stale_revision/);
    assert.equal(readFileSync(runFile, "utf8"), before);
    const sessionLock = path.join(root, "control/session.lock");
    assert(acquireLock(sessionLock, { ownerSessionId: "other", retries: 0 }).ok);
    assert.throws(recover, /session_lock_unavailable/);
    releaseLock(sessionLock, "other");
    assert(acquireLock(sessionLock, { ownerSessionId: "old", retries: 0, now: () => "2026-01-01T00:00:00.000Z" }).ok);
    assert.throws(recover, /request_lock_recovery_required/);
    releaseLock(sessionLock, "old");
    const live = structuredClone(run);
    live.heartbeatAt = new Date().toISOString();
    writeRunState(runFile, live);
    assert.throws(recover, /request_session_not_settled/);
    for (const status of ["running", "orphaned", "needs_readback"] as const) {
      const uncertain = structuredClone(run);
      const attempt = beginAttempt(plan, uncertain, plan.nodes[0]!.id, "interrupted", "2026-01-01T00:00:00.000Z");
      attempt.status = status;
      uncertain.nodes[plan.nodes[0]!.id]!.status = status;
      writeRunState(runFile, uncertain);
      assert.throws(recover, /request_readback_required/);
    }
    const unread = structuredClone(run);
    const attempt = beginAttempt(plan, unread, plan.nodes[0]!.id, "interrupted", "2026-01-01T00:00:00.000Z");
    attempt.status = "failed";
    attempt.readbackRequired = true;
    unread.nodes[plan.nodes[0]!.id]!.status = "failed";
    writeRunState(runFile, unread);
    assert.throws(recover, /request_readback_required/);
    reset();
    const artifact = run.artifactBindings[0]!;
    const receipt = path.join(root, artifact.path);
    mkdirSync(path.dirname(receipt), { recursive: true });
    const previous = existsSync(receipt) ? readFileSync(receipt) : undefined;
    writeFileSync(receipt, JSON.stringify({ schemaVersion: "b2c.operation-intent/v1" }));
    assert.throws(recover, /request_readback_required/);
    if (previous) writeFileSync(receipt, previous);
    else rmSync(receipt);
    const failedEffect = structuredClone(run);
    const effectNode = plan.nodes.find((node) => !["observe", "draft"].includes(node.actionClass))!;
    const effectAttempt = beginAttempt(plan, failedEffect, effectNode.id, "interrupted", "2026-01-01T00:00:00.000Z");
    effectAttempt.status = "failed";
    failedEffect.nodes[effectNode.id]!.status = "failed";
    writeRunState(runFile, failedEffect);
    assert.throws(recover, /request_readback_required/);
    reset();
    const missingNode = structuredClone(run);
    delete missingNode.nodes[plan.nodes[0]!.id];
    writeRunState(runFile, missingNode);
    assert.throws(recover, /request_state_invalid/);
    const missingBinding = structuredClone(run);
    missingBinding.artifactBindings.pop();
    writeRunState(runFile, missingBinding);
    assert.throws(recover, /request_state_invalid/);
    reset();
    symlinkSync(path.join(root, "not-created"), `${runFile}.tmp`);
    assert.throws(recover, /unsafe_workspace_file/);
    rmSync(`${runFile}.tmp`);
    const recovered = recover();
    assert.equal(recovered.result.outcome, "interrupted");
    assert.equal(recovered.replayed, false);
    const after = JSON.parse(readFileSync(runFile, "utf8"));
    assert.equal(after.publicRequests.requestA.requestDigest, run.publicRequests.requestA!.requestDigest);
    assert.equal(after.publicRequests.requestA.sessionId, "interrupted");
    assert.deepEqual(after.nodes, JSON.parse(JSON.stringify(run.nodes)));
    assert.deepEqual(after.artifactBindings, JSON.parse(JSON.stringify(run.artifactBindings)));
    assert.deepEqual(after.approvals, run.approvals);
    const afterBytes = readFileSync(runFile, "utf8");
    const replay = recover();
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.result, recovered.result);
    assert.equal(readFileSync(runFile, "utf8"), afterBytes);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "run/checkpoint.json"), "utf8")).runState, after);
    writeFileSync(path.join(root, "run/checkpoint.json"), "{}");
    assert.equal(recover().replayed, true);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, "run/checkpoint.json"), "utf8")).runState, after);
    assert.equal(readFileSync(runFile, "utf8"), afterBytes);

    const exactRunReplay = await runSession({
      workspace: root,
      sessionId: "original-request-retry",
      brief: { schemaVersion: "1.0.0", businessSlug: "recovery-fixture" },
      expectedRevision: `sha256:${"0".repeat(64)}`,
      requestId: "requestA",
      requestDigest: run.publicRequests.requestA!.requestDigest,
      maxConcurrency: 1,
      wallClockSeconds: 1,
    });
    assert.equal(exactRunReplay.replayed, true);
    assert.equal(exactRunReplay.outcome, "interrupted");
    assert.equal(readFileSync(runFile, "utf8"), afterBytes);
    const priorHome = process.env.B2C_APP_BUILDER_HOME;
    const registry = path.join(root, "fixture-registry");
    mkdirSync(registry);
    writeFileSync(
      path.join(registry, "workspaces.json"),
      JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "fixture", path: root, registeredAt: new Date().toISOString() }] }),
    );
    process.env.B2C_APP_BUILDER_HOME = registry;
    try {
      const publicResult = callPublicOperation("business.recover", {
        workspaceId: "fixture",
        expectedRevision: workspaceRevision(root),
        requestId: "requestA",
      });
      assert(publicResult.ok, JSON.stringify(publicResult));
      assert.equal((publicResult.data as { dispatched: boolean }).dispatched, false);
      assert(
        !callPublicOperation("business.recover", { workspaceId: "fixture", expectedRevision: workspaceRevision(root), requestId: "requestA", force: true }).ok,
      );
    } finally {
      if (priorHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = priorHome;
    }
    const retried = structuredClone(run);
    const readOnly = plan.nodes.find(
      (node) => node.idempotent && !node.protectedCategory && node.actionClass === "observe" && node.inputs.length === 0 && node.outputs.length === 0,
    )!;
    assert(readOnly);
    const abandoned = beginAttempt(plan, retried, readOnly.id, "original-session", "2026-01-01T00:00:00.000Z");
    abandoned.status = "orphaned";
    retried.nodes[readOnly.id]!.status = "ready";
    const success = beginAttempt(plan, retried, readOnly.id, "retry-session", "2026-01-01T00:01:00.000Z");
    reconcilePatch(plan, retried, { nodeId: readOnly.id, attemptId: success.id, outputs: [] }, "2026-01-01T00:01:01.000Z");
    recordDeterministicVerification(plan, retried, readOnly.id, { allPassed: true, evidence: ["synthetic fixture gate proof"] }, "2026-01-01T00:01:02.000Z");
    acceptVerification(
      plan,
      retried,
      readOnly.id,
      ["synthetic fixture acceptance"],
      "2026-01-01T00:01:03.000Z",
      "independent-fixture",
      requiresIndependentReview(readOnly)
        ? captureReviewEvidence(plan, retried, readOnly.id, root, "independent-fixture", "2026-01-01T00:01:03.000Z")
        : undefined,
      root,
    );
    assert(hasCurrentDeterministicVerification(plan, retried, readOnly.id));
    writeRunState(runFile, retried);
    const withoutProof = structuredClone(retried);
    delete withoutProof.nodes[readOnly.id]!.attempts.at(-1)!.deterministicVerification;
    writeRunState(runFile, withoutProof);
    assert.throws(recover, /request_readback_required/);
    writeRunState(runFile, retried);
    assert.equal(recover().result.outcome, "interrupted");
    assert.equal(JSON.parse(readFileSync(runFile, "utf8")).nodes[readOnly.id].attempts[0].status, "orphaned");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
