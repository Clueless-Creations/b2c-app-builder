import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { allowAllAutonomyEvaluator, computeFrontier } from "../../../kernel/engine/frontier.js";
import {
  acceptVerification,
  beginAttempt,
  reconcileEnvironmentalArtifacts,
  reconcilePatch,
  reconcileWorkflowApplicability,
  reopenRecurringNodes,
  seedRunState,
} from "../../../kernel/engine/runstate.js";
import { listPendingFreshContext, refuseFreshContextAcceptance, VERIFICATION_REJECTED_BLOCKER } from "../../../kernel/engine/verification.js";
import { buildVerifierPrompt, parseVerifierVerdict, VERIFICATION_VERDICT_BEGIN, VERIFICATION_VERDICT_END } from "../../../kernel/session/worker-prompt.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import { translateParkReason } from "../../../kernel/session/digest.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";

const now = "2026-08-19T09:00:00.000Z";
const later = "2026-08-19T09:05:00.000Z";

/**
 * Minimal graph for the verification-sweep and pre-existing-material rules:
 *   notes/seed.md        — environmental (no producer anywhere in the catalog)
 *   draft-note (fresh_context: outputs, no gates) reads notes/seed.md, produces notes/draft.md
 *   review-note (fresh_context) reads notes/draft.md, produces notes/review.md
 *   maybe-note — conditional applicability, its founder question deliberately unanswered
 */
function testCatalog(): CatalogInput {
  return {
    version: "fixture-verification-sweep",
    artifacts: [
      { id: "artifact.seed-notes", path: "notes/seed.md" },
      { id: "artifact.draft-note", path: "notes/draft.md" },
      { id: "artifact.review-note", path: "notes/review.md" },
      { id: "artifact.maybe-note", path: "notes/maybe.md" },
      { id: "artifact.weekly-note", path: "notes/weekly.md" },
    ],
    workflows: [
      {
        id: "workflow.draft-note",
        title: "Draft note",
        domainId: "domain.operations",
        actionClass: "draft",
        reads: ["notes/seed.md"],
        dependencies: [],
        outputPaths: ["notes/draft.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.review-note",
        title: "Review note",
        domainId: "domain.operations",
        actionClass: "draft",
        reads: ["notes/draft.md"],
        dependencies: ["workflow.draft-note"],
        outputPaths: ["notes/review.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.maybe-note",
        title: "Maybe note",
        domainId: "domain.operations",
        actionClass: "draft",
        reads: ["notes/seed.md"],
        dependencies: [],
        outputPaths: ["notes/maybe.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        applicability: { mode: "conditional", question: "Does the fixture apply?" },
      },
      {
        id: "workflow.weekly-note",
        title: "Weekly note",
        domainId: "domain.operations",
        actionClass: "draft",
        reads: ["notes/seed.md"],
        dependencies: [],
        outputPaths: ["notes/weekly.md"],
        providerIds: [],
        laneIds: ["post_launch_ops"],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        recurrenceDays: 7,
      },
    ],
  };
}

function emptyBusinessState(): BusinessStateV2 {
  // Only the fields these fixtures touch: lanes stay empty (no lane-done seeding) and no
  // workflowApplicability record exists, so the conditional node's question is unanswered.
  return { lanes: {}, founderGates: { pending: [] } } as unknown as BusinessStateV2;
}

function workspaceWithSeed(harness: Harness, name: string): string {
  const workspace = harness.makeTempDir(name);
  mkdirSync(path.join(workspace, "notes"), { recursive: true });
  writeFileSync(path.join(workspace, "notes", "seed.md"), "seed content v1\n", "utf8");
  return workspace;
}

export function register(harness: Harness): void {
  // ---------------------------------------------------------------------
  // pre-existing material (reconcileEnvironmentalArtifacts)
  // ---------------------------------------------------------------------

  harness.check("environment: a producer-less file on disk opens the frontier", () => {
    const workspace = workspaceWithSeed(harness, "env-opens");
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    let frontier = computeFrontier(plan, run, emptyBusinessState(), allowAllAutonomyEvaluator);
    assert(!frontier.ready.includes("run.draft-note" as never), "draft-note must wait while its read is unaccepted");
    reconcileEnvironmentalArtifacts(plan, run, workspace, now);
    const seed = run.artifactBindings.find((binding) => binding.artifactId === "artifact.seed-notes");
    assert(Boolean(seed?.accepted), "seed binding must accept from disk presence");
    assert(Boolean(seed?.fingerprint), "environmental acceptance must carry a content fingerprint");
    frontier = computeFrontier(plan, run, emptyBusinessState(), allowAllAutonomyEvaluator);
    assert(frontier.ready.includes("run.draft-note" as never), "draft-note must be ready once its read exists on disk");
  });

  harness.check("environment: an absent file stays unaccepted and the node waits", () => {
    const workspace = harness.makeTempDir("env-absent");
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    reconcileEnvironmentalArtifacts(plan, run, workspace, now);
    const seed = run.artifactBindings.find((binding) => binding.artifactId === "artifact.seed-notes");
    assert(!seed?.accepted, "a missing precondition must not be accepted");
    const frontier = computeFrontier(plan, run, emptyBusinessState(), allowAllAutonomyEvaluator);
    assert(!frontier.ready.includes("run.draft-note" as never), "draft-note must keep waiting on the absent file");
  });

  harness.check("environment: pre-existing material that changed between sessions invalidates descendants", () => {
    const workspace = workspaceWithSeed(harness, "env-changed");
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    reconcileEnvironmentalArtifacts(plan, run, workspace, now);
    // draft-note produces and is accepted, so it has an accepted output derived from seed.md.
    const attempt = beginAttempt(plan, run, "run.draft-note" as never, "s1", now);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: "run.draft-note" as never,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.draft-note", path: "notes/draft.md", fingerprint: "fp-1", evidence: ["produced"] }],
      },
      now,
    );
    acceptVerification(plan, run, "run.draft-note" as never, ["verified"], now, "s1.verifier");
    assert(run.nodes["run.draft-note"]!.status === "succeeded", "draft-note should be accepted");
    writeFileSync(path.join(workspace, "notes", "seed.md"), "seed content v2 — changed\n", "utf8");
    const invalidated = reconcileEnvironmentalArtifacts(plan, run, workspace, later);
    assert(invalidated.includes("run.draft-note" as never), "a changed precondition must invalidate the work accepted on top of it");
    const statusAfter: string = run.nodes["run.draft-note"]!.status;
    assert(statusAfter === "stale", "invalidated node must be stale");
    assert(run.nodes["run.draft-note"]!.blocker === undefined, "staleness must clear the previous life's blocker text");
  });

  harness.check("environment: an in-run produced binding is never retaken by disk state", () => {
    const workspace = workspaceWithSeed(harness, "env-produced");
    mkdirSync(path.join(workspace, "notes"), { recursive: true });
    writeFileSync(path.join(workspace, "notes", "draft.md"), "on-disk draft\n", "utf8");
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    reconcileEnvironmentalArtifacts(plan, run, workspace, now);
    const attempt = beginAttempt(plan, run, "run.draft-note" as never, "s1", now);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: "run.draft-note" as never,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.draft-note", path: "notes/draft.md", fingerprint: "fp-produced", evidence: ["produced"] }],
      },
      now,
    );
    const before = run.artifactBindings.find((binding) => binding.artifactId === "artifact.draft-note")!;
    assert(before.accepted === false, "a fresh_context production lands unaccepted pending verification");
    reconcileEnvironmentalArtifacts(plan, run, workspace, later);
    const after = run.artifactBindings.find((binding) => binding.artifactId === "artifact.draft-note")!;
    assert(after.accepted === false && after.fingerprint === "fp-produced", "environmental acceptance must never override an in-run production");
  });

  // ---------------------------------------------------------------------
  // fresh-context acceptance rules (kernel/engine/verification.ts)
  // ---------------------------------------------------------------------

  harness.check("verification: producer session is refused, a distinct verifier session is accepted", () => {
    const workspace = workspaceWithSeed(harness, "verify-rules");
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    reconcileEnvironmentalArtifacts(plan, run, workspace, now);
    const attempt = beginAttempt(plan, run, "run.draft-note" as never, "s1", now);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: "run.draft-note" as never,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.draft-note", path: "notes/draft.md", fingerprint: "fp-1", evidence: [] }],
      },
      now,
    );
    assert(listPendingFreshContext(plan, run).includes("run.draft-note" as never), "produced fresh_context work must be listed pending");
    const producerRefusal = refuseFreshContextAcceptance(plan, run, "run.draft-note" as never, "s1");
    assert(producerRefusal?.code === "producer_cannot_verify", `producer must be refused, got ${producerRefusal?.code}`);
    const verifierRefusal = refuseFreshContextAcceptance(plan, run, "run.draft-note" as never, "s1.verifier");
    assert(verifierRefusal === undefined, `distinct verifier session must be allowed, got ${verifierRefusal?.code}`);
    acceptVerification(plan, run, "run.draft-note" as never, ["independently reviewed"], now, "s1.verifier");
    assert(run.nodes["run.draft-note"]!.verifiedBySessionId === "s1.verifier", "acceptance must record the verifier session");
    const notPending = refuseFreshContextAcceptance(plan, run, "run.draft-note" as never, "s2.verifier");
    assert(notPending?.code === "not_pending", "an already-accepted node must refuse further acceptance");
  });

  // ---------------------------------------------------------------------
  // applicability: an unanswered founder scope question never dispatches
  // ---------------------------------------------------------------------

  harness.check("applicability: staleness cannot ride an unanswered scope question into dispatch", () => {
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    const node = run.nodes["run.maybe-note"]!;
    assert(node.status === "waiting_founder", "an unanswered conditional node seeds waiting_founder");
    // Simulate what a staleness cascade does: reset to a ready-eligible status without touching
    // the applicability fingerprint.
    node.status = "stale";
    node.blocker = undefined;
    reconcileWorkflowApplicability(plan, run, emptyBusinessState(), later);
    const reparked: string = node.status;
    assert(reparked === "waiting_founder", "reconciliation must re-park the unanswered question");
    assert((node.blocker ?? "").startsWith("Scope answer needed"), `blocker must restate the question, got "${node.blocker}"`);
  });

  harness.check("applicability: a declined optional scope survives resume and reopens only when explicitly required", () => {
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    const declined: BusinessStateV2 = {
      ...emptyBusinessState(),
      workflowApplicability: {
        "workflow.maybe-note": {
          verdict: "not-needed",
          reason: "The current manual workflow does not need recurring operation.",
          evidence: [],
          updatedAt: later,
        },
      },
    } as BusinessStateV2;
    reconcileWorkflowApplicability(plan, run, declined, later);
    assert(run.nodes["run.maybe-note"]!.status === "not_needed", "declined optional work must stay inactive");
    reconcileWorkflowApplicability(plan, run, declined, "2026-08-19T09:10:00.000Z");
    assert(run.nodes["run.maybe-note"]!.status === "not_needed", "ordinary resume must not repeat the optional question");

    const required: BusinessStateV2 = {
      ...declined,
      workflowApplicability: {
        ...declined.workflowApplicability,
        "workflow.maybe-note": {
          ...declined.workflowApplicability!["workflow.maybe-note"]!,
          verdict: "required",
          reason: "The founder selected recurring operation for this workflow.",
          updatedAt: "2026-08-19T09:15:00.000Z",
        },
      },
    } as BusinessStateV2;
    reconcileWorkflowApplicability(plan, run, required, "2026-08-19T09:15:00.000Z");
    const reopenedStatus = run.nodes["run.maybe-note"]!.status as string;
    assert(reopenedStatus === "pending", "explicit selection must reopen the conditional workflow");
  });

  // ---------------------------------------------------------------------
  // calendar reopening (reopenRecurringNodes) — the operating loop
  // ---------------------------------------------------------------------

  harness.check("recurrence: a succeeded recurring node reopens after its cadence, prior acceptance intact", () => {
    const workspace = workspaceWithSeed(harness, "recur-due");
    const plan = compilePlan(testCatalog(), now);
    const run = seedRunState(plan, emptyBusinessState(), { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    reconcileEnvironmentalArtifacts(plan, run, workspace, now);
    const attempt = beginAttempt(plan, run, "run.weekly-note" as never, "s1", now);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: "run.weekly-note" as never,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.weekly-note", path: "notes/weekly.md", fingerprint: "fp-w1", evidence: [] }],
      },
      now,
    );
    acceptVerification(plan, run, "run.weekly-note" as never, ["reviewed the weekly pass"], now, "s1.verifier");
    const state = run.nodes["run.weekly-note"]!;
    const acceptedFingerprint = state.acceptedOutputFingerprint;

    const threeDays = "2026-08-22T09:00:00.000Z";
    assert(reopenRecurringNodes(plan, run, threeDays).length === 0, "a cadence not yet elapsed must not reopen anything");
    assert(state.status === "succeeded", "node stays succeeded inside its cadence");

    const eightDays = "2026-08-27T09:00:00.000Z";
    const reopened = reopenRecurringNodes(plan, run, eightDays);
    assert(reopened.includes("run.weekly-note" as never), "an elapsed cadence must reopen the node");
    const reopenedStatus: string = state.status;
    assert(reopenedStatus === "stale", `reopened node must be stale, got ${reopenedStatus}`);
    assert(state.blocker === undefined, "reopening carries no blocker text");
    assert(state.acceptedOutputFingerprint === acceptedFingerprint, "last cycle's acceptance stays until the re-run replaces it");
    const binding = run.artifactBindings.find((candidate) => candidate.artifactId === "artifact.weekly-note")!;
    assert(binding.accepted === true, "last cycle's output binding stays accepted — reopening is not invalidation");
    const frontier = computeFrontier(plan, run, emptyBusinessState(), allowAllAutonomyEvaluator);
    assert(frontier.ready.includes("run.weekly-note" as never), "the reopened node must return to the frontier");
  });

  harness.check("recurrence: non-recurring nodes never reopen; lane-seeded success counts cadence from run creation", () => {
    const plan = compilePlan(testCatalog(), now);
    const seededState = { lanes: { post_launch_ops: { status: "succeeded" } }, founderGates: { pending: [] } } as unknown as BusinessStateV2;
    const run = seedRunState(plan, seededState, { ownerSessionId: "s1", ttlSeconds: 60, wallClockCapSeconds: 600, now });
    assert(run.nodes["run.weekly-note"]!.status === "succeeded", "lane-done seeding marks the recurring node succeeded with no attempts");
    const eightDays = "2026-08-27T09:00:00.000Z";
    const reopened = reopenRecurringNodes(plan, run, eightDays);
    assert(reopened.includes("run.weekly-note" as never), "a lane-seeded recurring node counts its cadence from the run's creation");
    assert(!reopened.includes("run.draft-note" as never), "nodes without recurrenceDays never reopen");
    assert(reopened.length === 1, `only the recurring node reopens, got ${reopened.join(", ")}`);
  });

  // ---------------------------------------------------------------------
  // verifier plumbing (executor + worker-prompt)
  // ---------------------------------------------------------------------

  // Spawned driver, not an in-harness async check: the shared harness's `check` runs fn()
  // synchronously (see _harness.ts and session.fixtures.ts's pushDigest case), so awaiting the
  // async executor/verifier seams here would race cleanup() rather than being awaited.
  harness.check("fixture executor/verifier: fingerprints stable across attempts; verifier accepts and rejects", () => {
    const executorModuleUrl = pathToFileURL(path.join(skillRoot, "kernel/session/executor.ts")).href;
    const compileModuleUrl = pathToFileURL(path.join(skillRoot, "kernel/engine/compile.ts")).href;
    const driverPath = path.join(harness.makeTempDir("verifier-seam-driver"), "drive-verifier.mts");
    const driverSource = `
import { createFixtureExecutor, createFixtureVerifier } from ${JSON.stringify(executorModuleUrl)};
import { compilePlan } from ${JSON.stringify(compileModuleUrl)};
const catalog = ${JSON.stringify(testCatalog())};
async function main() {
  const plan = compilePlan(catalog, ${JSON.stringify(now)});
  const node = plan.nodes.find((candidate) => candidate.id === "run.draft-note");
  const executor = createFixtureExecutor();
  const context = { runId: "run.x", workspaceDir: "/tmp", now: ${JSON.stringify(now)}, skillRootDir: "/tmp", artifactPaths: {}, heartbeat: () => {} };
  const first = await executor.execute(node, { ...context, attemptId: "a1" });
  const second = await executor.execute(node, { ...context, attemptId: "a2" });
  if (first.outputs[0].fingerprint !== second.outputs[0].fingerprint) {
    throw new Error("re-producing the same node must not change its fixture fingerprint (attempt-dependent fingerprints re-invalidate the whole graph every session)");
  }
  const verifyContext = { workspaceDir: "/tmp", skillRootDir: "/tmp", outputs: [], now: ${JSON.stringify(now)} };
  const accepted = await createFixtureVerifier().verify(node, verifyContext);
  if (accepted.status !== "accepted" || !accepted.evidence.includes("fixture verifier")) throw new Error("default fixture verifier must accept: " + JSON.stringify(accepted));
  const rejected = await createFixtureVerifier("rejected").verify(node, verifyContext);
  if (rejected.status !== "rejected") throw new Error("rejecting fixture verifier must reject: " + JSON.stringify(rejected));
  console.log("verifier-seam-driver ok");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
`;
    writeFileSync(driverPath, driverSource, "utf8");
    const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8" });
    assert(
      result.status === 0 && result.stdout.includes("verifier-seam-driver ok"),
      `driver failed (exit ${result.status}): ${result.stdout}\n${result.stderr}`,
    );
  });

  harness.check("verifier prompt: judge-only contract with produced outputs and verdict skeleton", () => {
    const plan = compilePlan(testCatalog(), now);
    const node = plan.nodes.find((candidate) => candidate.id === "run.draft-note")!;
    const brief = composeNodeBrief(node, plan);
    const prompt = buildVerifierPrompt(brief, "/ws", "/skill", [{ artifactId: "artifact.draft-note", path: "notes/draft.md", evidence: ["claimed complete"] }]);
    assert(prompt.includes("never write"), "prompt must forbid writes");
    assert(prompt.includes("notes/draft.md"), "prompt must name the produced output");
    assert(prompt.includes("claimed complete"), "prompt must carry the producer's evidence claims for checking");
    assert(prompt.includes(VERIFICATION_VERDICT_BEGIN) && prompt.includes(VERIFICATION_VERDICT_END), "prompt must carry the verdict markers");
  });

  harness.check("verifier verdict: strict parse accepts one well-formed pair and nothing else", () => {
    const plan = compilePlan(testCatalog(), now);
    const node = plan.nodes.find((candidate) => candidate.id === "run.draft-note")!;
    const brief = composeNodeBrief(node, plan);
    const wrap = (payload: string): string => `reviewer prose\n${VERIFICATION_VERDICT_BEGIN}\n${payload}\n${VERIFICATION_VERDICT_END}\n`;
    const good = wrap(
      JSON.stringify({ schemaVersion: "1.0.0", workflowId: brief.workflowId, verdict: "accepted", evidence: "checked draft.md sections against the brief" }),
    );
    assert(parseVerifierVerdict(good, brief).verdict?.verdict === "accepted", "well-formed accepted verdict must parse");
    const envelope = JSON.stringify({ type: "result", result: good });
    assert(parseVerifierVerdict(envelope, brief).verdict?.verdict === "accepted", "verdict inside a runtime JSON envelope must parse");
    const wrongWorkflow = wrap(
      JSON.stringify({ schemaVersion: "1.0.0", workflowId: "workflow.other", verdict: "accepted", evidence: "checked the wrong thing entirely" }),
    );
    assert(parseVerifierVerdict(wrongWorkflow, brief).verdict === undefined, "a verdict for a different workflow must be refused");
    const thinEvidence = wrap(JSON.stringify({ schemaVersion: "1.0.0", workflowId: brief.workflowId, verdict: "accepted", evidence: "ok" }));
    assert(parseVerifierVerdict(thinEvidence, brief).verdict === undefined, "empty-calorie evidence must be refused");
    assert(parseVerifierVerdict("no verdict at all", brief).verdict === undefined, "missing verdict must be refused");
  });

  harness.check("digest: the rejected-verification blocker translates to a founder-plain sentence", () => {
    const sentence = translateParkReason({ blocker: VERIFICATION_REJECTED_BLOCKER });
    assert(sentence.includes("double-checked"), `expected the rejection sentence, got "${sentence}"`);
    assert(!sentence.toLowerCase().includes("verification"), "founder copy must not leak the internal vocabulary");
  });
}
