import { spawnSync } from "node:child_process";
import { acquireLock, releaseLock } from "../../../kernel/reducer/lock.js";
import { assertReadableWorkspaceFile } from "../../../kernel/reducer/erasure-guard.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { seedRunState, beginAttempt, reconcilePatch, acceptVerification } from "../../../kernel/engine/runstate.js";
import { currentPin } from "./run-persistence.fixtures.js";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";
import { checkOperatingModelMutation } from "../../../kernel/operating-model/validate.js";
import { validateBusinessState } from "../../../kernel/schema/index.js";
import { installFounderTrustStore, loadFounderTrustStore, FOUNDER_TRUST_FILE_ENV } from "../../../kernel/engine/founder-trust-store.js";
import {
  canonicalErasurePayload,
  erasurePreviewDigest,
  executeEvidenceErasure,
  previewEvidenceErasure,
  resumeEvidenceErasure,
  type ErasureRequest,
  type ErasureReceipt,
} from "../../../kernel/reducer/erasure.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import type { OperatingRecord } from "../../../kernel/operating-model/types.js";
const now = "2026-09-05T12:00:00.000Z";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const encode = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
function setup(h: Harness, name: string) {
  const root = h.makeTempDir(name),
    keydir = h.makeTempDir(`${name}-key`),
    trustFile = path.join(keydir, "trust.json");
  const keys = generateKeyPairSync("ed25519");
  installFounderTrustStore({
    trustFile,
    publicKeyBase64Url: keys.publicKey.export({ format: "der", type: "spki" }).toString("base64url"),
    apply: true,
    installedAt: now,
  });
  const env = { [FOUNDER_TRUST_FILE_ENV]: trustFile };
  const keyId = loadFounderTrustStore({ env, role: "validation_read" }).trustedKey.keyId;
  const state = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8")) as BusinessStateV2;
  const subject = { appId: "test-app", environment: "test", opaqueRef: "opaque-subject-100" };
  const common = (id: string) => ({ id, revision: 1, recordedAt: now, producer: "synthetic-fixture", epistemic: "known" as const });
  const records: OperatingRecord[] = [
    { ...common("objective.test"), kind: "objective", status: "active", title: "Verify erasure", valueLoop: "capture" },
    { ...common("metric.test"), kind: "metric", status: "active", objectiveId: "objective.test", name: "Test" },
    {
      ...common("observation.a"),
      kind: "observation",
      status: "recorded",
      metricId: "metric.test",
      observedAt: now,
      source: { uri: "proof/receipt.txt", revision: "1" },
      independenceGroup: "fixture",
      confidence: { lower: 1, upper: 1 },
      subjectRef: subject,
      value: { email: "fake-person-a@example.test" },
    },
    {
      ...common("observation.b"),
      kind: "observation",
      status: "recorded",
      metricId: "metric.test",
      observedAt: now,
      source: { uri: "proof/other.txt", revision: "1" },
      independenceGroup: "fixture",
      confidence: { lower: 1, upper: 1 },
      subjectRef: { ...subject, opaqueRef: "opaque-subject-200" },
      value: { email: "fake-person-b@example.test" },
    },
    {
      ...common("evidence.a"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.a"],
      source: { uri: "proof/receipt.txt", revision: "1" },
      observedAt: now,
      independenceGroup: "fixture",
      confidence: { lower: 1, upper: 1 },
      supportsBelief: true,
    },
  ];
  state.operatingModel = { schemaVersion: "1.0.0", records, events: [], evidenceRequests: [] };
  assert(validateBusinessState(state).valid, "test state valid");
  for (const dir of ["state", "control", "proof", "snapshots", "projections"]) mkdirSync(path.join(root, dir), { recursive: true });
  const statePath = path.join(root, "state/business-state.json"),
    bytes = encode(state);
  writeFileSync(statePath, bytes);
  writeFileSync(
    path.join(root, "control/manifest.json"),
    encode({
      schemaVersion: "1.0.0",
      entries: { [statePath]: { targetDoc: "business-state", file: statePath, stateHash: sha(bytes), updatedAt: now, lastPatchId: "fixture-seed" } },
    }),
  );
  writeFileSync(path.join(root, "control/audit.jsonl"), "");
  writeFileSync(path.join(root, "proof/receipt.txt"), "synthetic evidence fake-person-a@example.test\n");
  writeFileSync(path.join(root, "proof/other.txt"), "unrelated evidence\n");
  writeFileSync(path.join(root, "snapshots/proof-copy.txt"), readFileSync(path.join(root, "proof/receipt.txt")));
  writeFileSync(path.join(root, "snapshots/state.json"), bytes);
  writeFileSync(path.join(root, "projections/aggregate.json"), encode({ id: "aggregate.a", observationIds: ["observation.a"], accepted: true, value: 1 }));
  const request: ErasureRequest = {
    receiptId: randomUUID(),
    subject,
    now,
    policy: {
      schemaVersion: "1.0.0",
      id: "fixture-approved-policy",
      revision: 1,
      localRoots: ["proof", "snapshots", "projections"],
      legalHoldPaths: [],
      providerDeletionRequired: true,
    },
  };
  const receipt = (): ErasureReceipt => {
    const preview = previewEvidenceErasure(root, request);
    const payload = {
      audience: "b2c-app-builder/evidence-erasure/v1" as const,
      receiptId: request.receiptId,
      workspaceBinding: preview.workspaceBinding,
      policyDigest: preview.policyDigest,
      previewDigest: erasurePreviewDigest(preview),
      issuedAt: now,
      expiresAt: "2026-09-05T13:00:00.000Z",
    };
    return {
      schemaVersion: "1.0.0",
      algorithm: "Ed25519",
      keyId,
      payload,
      signature: sign(null, Buffer.from(canonicalErasurePayload(payload)), keys.privateKey).toString("base64url"),
    };
  };
  return {
    root,
    state,
    request,
    receipt,
    context: { env, now, trustObservation: { processUid: (process.getuid?.() ?? 1000) + 1, canCreateInTrustDirectory: () => false } },
  };
}
function allBytes(root: string): string {
  return readdirSync(root, { withFileTypes: true })
    .map((entry) => (entry.isDirectory() ? allBytes(path.join(root, entry.name)) : readFileSync(path.join(root, entry.name), "utf8")))
    .join("\n");
}
export function register(h: Harness): void {
  h.check("erasure: unsigned, changed-policy and cross-workspace requests cannot delete evidence", () => {
    const a = setup(h, "erase-authority-a"),
      b = setup(h, "erase-authority-b"),
      signed = a.receipt();
    const before = allBytes(a.root);
    assert.throws(() => executeEvidenceErasure(a.root, a.request, { ...signed, signature: "AAAA" }, a.context), /authority_invalid/);
    assert.equal(allBytes(a.root), before);
    assert.throws(() => executeEvidenceErasure(b.root, b.request, signed, a.context), /scope_mismatch/);
    assert.throws(() => executeEvidenceErasure(a.root, { ...a.request, policy: { ...a.request.policy, revision: 2 } }, signed, a.context), /scope_mismatch/);
  });
  h.check("erasure: approved local erasure removes copies and dependent aggregates while provider deletion remains pending", () => {
    const f = setup(h, "erase-complete"),
      signed = f.receipt();
    const result = executeEvidenceErasure(f.root, f.request, signed, f.context);
    assert.equal(result.localComplete, true);
    assert.equal(result.globalComplete, false);
    assert.equal(result.providerDeletion, "pending");
    assert(!existsSync(path.join(f.root, "proof/receipt.txt")));
    assert(!existsSync(path.join(f.root, "snapshots/proof-copy.txt")));
    assert(!existsSync(path.join(f.root, "projections/aggregate.json")));
    const all = allBytes(f.root);
    assert(!all.includes("fake-person-a@example.test"));
    assert(!all.includes(f.request.subject.opaqueRef));
    assert(all.includes("fake-person-b@example.test"));
    const state = JSON.parse(readFileSync(path.join(f.root, "state/business-state.json"), "utf8")) as BusinessStateV2;
    assert(validateBusinessState(state).valid);
    assert.equal(state.operatingModel!.erasures!.length, 1);
    assert(checkOperatingModelMutation(f.state, state).some((i) => i.code === "operating.erasure_authority_required"));
    const restored = structuredClone(state);
    restored.operatingModel!.records.push(f.state.operatingModel!.records.find((r) => r.id === "observation.a")!);
    assert(checkOperatingModelMutation(state, restored).some((i) => i.code === "operating.erased_subject_reintroduced"));
  });
  h.check("erasure: legal hold and identifying immutable audit content refuse before writes", () => {
    const f = setup(h, "erase-hold");
    f.request.policy.legalHoldPaths = ["snapshots"];
    assert(previewEvidenceErasure(f.root, f.request).blockers.includes("legal_hold"));
    const signed = f.receipt();
    const before = allBytes(f.root);
    assert.throws(() => executeEvidenceErasure(f.root, f.request, signed, f.context), /scope_blocked/);
    assert.equal(allBytes(f.root), before);
    writeFileSync(path.join(f.root, "control/founder-notes.txt"), f.request.subject.opaqueRef);
    assert(previewEvidenceErasure(f.root, f.request).blockers.includes("immutable_audit_contains_subject_data"));
  });
  h.check("erasure: interrupted sanitized intent resumes without reintroducing payload or losing unrelated records", () => {
    const f = setup(h, "erase-resume"),
      signed = f.receipt();
    assert.throws(() => executeEvidenceErasure(f.root, f.request, signed, { ...f.context, interruptAfterMutation: 1 }), /fixture_interrupt/);
    const journal = readFileSync(path.join(f.root, "control/erasure-intent.json"), "utf8");
    assert(!journal.includes("fake-person-a@example.test"));
    assert(!journal.includes(f.request.subject.opaqueRef));
    const result = resumeEvidenceErasure(f.root, { ...f.context, now: "2026-09-06T12:00:00.000Z" });
    assert(result.localComplete);
    assert(!allBytes(f.root).includes("fake-person-a@example.test"));
    assert(allBytes(f.root).includes("fake-person-b@example.test"));
  });
  h.check("erasure: dependent accepted run and truth snapshots lose acceptance while unrelated proof survives", () => {
    const f = setup(h, "erase-accepted");
    const catalog = structuredClone(currentPin.catalog);
    catalog.artifacts[0]!.path = "proof/receipt.txt";
    catalog.workflows[0]!.outputPaths = ["proof/receipt.txt"];
    const plan = compilePlan(catalog, now);
    const run = seedRunState(plan, f.state, { ownerSessionId: "producer", runId: "run.erasure", ttlSeconds: 300, wallClockCapSeconds: 1800, now });
    const node = plan.nodes[0]!;
    for (const approval of node.approvals) run.approvals[approval.id] = "approved";
    const attempt = beginAttempt(plan, run, node.id, "producer", now);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: node.id,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.saved-method", path: "proof/receipt.txt", fingerprint: "accepted-proof", evidence: ["Synthetic accepted evidence"] }],
      },
      now,
    );
    acceptVerification(plan, run, node.id, ["Independent synthetic reviewer"], now, "reviewer");
    run.archivedPlans = [
      {
        planId: run.planId,
        planRevision: run.planRevision,
        archivedAt: now,
        nodes: structuredClone(run.nodes),
        artifactBindings: structuredClone(run.artifactBindings),
        approvals: { ...run.approvals },
        workOrders: {},
      },
    ];
    mkdirSync(path.join(f.root, "run"));
    writeFileSync(path.join(f.root, "run/run-state.json"), encode(run));
    writeFileSync(path.join(f.root, "snapshots/run.json"), encode(run));
    writeFileSync(path.join(f.root, "catalog.json"), encode(catalog));
    const proofHash = sha(readFileSync(path.join(f.root, "proof/receipt.txt"), "utf8"));
    const truth = {
      schemaVersion: "1.0.0",
      updatedAt: now,
      revision: 1,
      lastReceiptId: null,
      lastReconcileInputHash: null,
      evidence: ["a", "b"].map((id) => ({
        id: `proof.${id}`,
        graphNodeId: id === "a" ? node.id : "run.other",
        claimId: `claim.${id}`,
        authority: "provider_readback",
        observedAt: now,
        reachable: true,
        payloadHash: id === "a" ? proofHash : "other-hash",
        accepted: true,
        summary: "Synthetic receipt",
      })),
      claims: ["a", "b"].map((id) => ({
        claimId: `claim.${id}`,
        graphNodeId: id === "a" ? node.id : "run.other",
        status: "active",
        currentEvidenceId: `proof.${id}`,
        supersededEvidenceIds: [],
        blockerKind: "none",
        summary: "Synthetic claim",
      })),
    };
    writeFileSync(path.join(f.root, "state/current-truth.json"), encode(truth));
    writeFileSync(path.join(f.root, "snapshots/truth.json"), encode(truth));
    executeEvidenceErasure(f.root, f.request, f.receipt(), f.context);
    for (const file of ["run/run-state.json", "snapshots/run.json"]) {
      const saved = JSON.parse(readFileSync(path.join(f.root, file), "utf8"));
      assert.equal(saved.nodes[node.id].status, "needs_readback");
      assert.equal(saved.archivedPlans[0].nodes[node.id].status, "needs_readback");
      assert(saved.archivedPlans[0].artifactBindings.every((b: { accepted: boolean }) => !b.accepted));
      assert.equal(saved.archivedPlans[0].nodes[node.id].attempts.length, 1);
      assert(saved.artifactBindings.every((b: { accepted: boolean }) => !b.accepted));
    }
    for (const file of ["state/current-truth.json", "snapshots/truth.json"]) {
      const saved = JSON.parse(readFileSync(path.join(f.root, file), "utf8"));
      assert.equal(saved.claims[0].status, "unresolved");
      assert.equal(saved.claims[1].status, "active");
      assert.deepEqual(
        saved.evidence.map((e: { id: string }) => e.id),
        ["proof.b"],
      );
    }
  });
  h.check("erasure: reducer manifest contention and pending transitions refuse ordinary reads and reducer commands", () => {
    const f = setup(h, "erase-interlock"),
      signed = f.receipt(),
      lock = path.join(f.root, "control/manifest.json.lock");
    const held = acquireLock(lock, { ownerSessionId: "other-reducer", retries: 0, ttlSeconds: 300 });
    assert(held.ok);
    try {
      assert.throws(() => executeEvidenceErasure(f.root, f.request, signed, f.context), /workspace_busy/);
    } finally {
      releaseLock(lock, "other-reducer");
    }
    assert.throws(() => executeEvidenceErasure(f.root, f.request, signed, { ...f.context, interruptAfterMutation: 1 }), /fixture_interrupt/);
    assert.throws(() => assertReadableWorkspaceFile(path.join(f.root, "state/business-state.json")), /pending_transition/);
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(skillRoot, "kernel/reducer/cli.ts"), "preflight", "--manifest", path.join(f.root, "control/manifest.json")],
      { encoding: "utf8", cwd: skillRoot },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /pending_transition/);
    const proof = path.join(f.root, "proof/receipt.txt.erasure-next");
    writeFileSync(proof, "untrusted scratch");
    assert.throws(() => resumeEvidenceErasure(f.root, f.context), /inventory_changed/);
    assert.equal(readFileSync(proof, "utf8"), "untrusted scratch");
  });
  h.check("erasure: pending composition recovery blocks preview and execution before writes", () => {
    const f = setup(h, "erase-pending-activation"),
      signed = f.receipt();
    mkdirSync(path.join(f.root, ".b2c-launch"));
    writeFileSync(path.join(f.root, ".b2c-launch/composition-activation.json"), "{}");
    const before = allBytes(f.root);
    assert.throws(() => previewEvidenceErasure(f.root, f.request), /pending_composition_activation/);
    assert.throws(() => executeEvidenceErasure(f.root, f.request, signed, f.context), /pending_composition_activation/);
    assert.equal(allBytes(f.root), before);
  });
  h.check("erasure: ordinary observation removal and rewriting remain forbidden", () => {
    const f = setup(h, "erase-ordinary");
    const removed = structuredClone(f.state);
    removed.operatingModel!.records = removed.operatingModel!.records.filter((r) => r.id !== "observation.a");
    assert(checkOperatingModelMutation(f.state, removed).some((i) => i.code === "operating.observation_mutated"));
    const edited = structuredClone(f.state);
    const obs = edited.operatingModel!.records.find((r) => r.kind === "observation")!;
    if (obs.kind === "observation") obs.value = "rewritten";
    assert(checkOperatingModelMutation(f.state, edited).some((i) => i.code === "operating.observation_mutated"));
  });
}
