import { proofPolicyFor, compilePlan, type CatalogInput, type CompiledPlan } from "../../../kernel/engine/compile.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import {
  acceptVerification,
  beginAttempt,
  detectOrphans,
  reconcilePatch,
  reopenNodesForAuthorizedWorkOrders,
  seedRunState,
} from "../../../kernel/engine/runstate.js";
import { VERIFICATION_REQUIRED_BLOCKER } from "../../../kernel/engine/verification.js";
import { seedOperatingModel } from "../../../kernel/operating-model/events.js";
import { standingFounderAgreement } from "../../../kernel/operating-model/agreements.js";
import { revokeMandate, standingFounderMandate } from "../../../kernel/operating-model/mandates.js";
import type { OperatingRecord, ReplayClock } from "../../../kernel/operating-model/types.js";
import { validateRunState } from "../../../kernel/schema/index.js";
import { laneKeys, type BusinessStateV2, type RunStateDocument } from "../../../kernel/schema/types.js";
import { instantiateWorkOrder } from "../../../kernel/work-orders/instantiate.js";
import {
  applyNextEffect,
  claimCompletion,
  dueWorkOrderReviews,
  recordWorkOrderProof,
  restoreOccurrenceAfterAttempt,
  revokeOccurrenceMandate,
  syncOccurrenceMandates,
  takeAuthorizedOccurrence,
  scheduleObservation,
  capsuleFromOccurrence,
} from "../../../kernel/work-orders/lifecycle.js";
import { reviewOutcome } from "../../../kernel/work-orders/outcomes.js";
import type { InstantiateWorkOrderInput } from "../../../kernel/work-orders/types.js";
import { assert, type Harness } from "./_harness.js";

const NOW = "2026-08-22T21:00:00.000Z";
const HORIZON = "2026-09-05T00:00:00.000Z";
const CLOCK: ReplayClock = { now: NOW };
const WORKFLOW_ID = "workflow.fixture.paywall-copy";
const NODE_ID = "run.fixture.paywall-copy";
const NONE_WORKFLOW_ID = "workflow.fixture.internal-note";
const NONE_NODE_ID = "run.fixture.internal-note";

function common(id: string): Pick<OperatingRecord, "id" | "revision" | "recordedAt" | "producer" | "epistemic"> {
  return { id, revision: 1, recordedAt: NOW, producer: "b2c", epistemic: "known" };
}

function loopRecords(): OperatingRecord[] {
  return [
    { ...common("objective.paid-conversion"), kind: "objective", status: "active", title: "Raise paid conversion", valueLoop: "capture" },
    { ...common("metric.paywall-cvr"), kind: "metric", status: "active", objectiveId: "objective.paid-conversion", name: "Paywall conversion rate" },
    {
      ...common("observation.paywall-weak"),
      kind: "observation",
      status: "recorded",
      metricId: "metric.paywall-cvr",
      observedAt: "2026-08-21T12:00:00.000Z",
      source: { uri: "evidence://paywall-funnel", revision: "src-rev-1", sectionId: "conversion" },
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      value: 0.02,
    },
    {
      ...common("evidence.paywall-weak"),
      kind: "evidence",
      status: "recorded",
      observationIds: ["observation.paywall-weak"],
      source: { uri: "evidence://paywall-funnel", revision: "src-rev-1" },
      observedAt: "2026-08-21T12:00:00.000Z",
      independenceGroup: "analytics.primary",
      confidence: { lower: 0.4, upper: 0.6 },
      supportsBelief: true,
    },
    {
      ...common("gap.paywall-weak"),
      kind: "gap",
      status: "diagnosed",
      objectiveId: "objective.paid-conversion",
      metricId: "metric.paywall-cvr",
      observationId: "observation.paywall-weak",
    },
    {
      ...common("diagnosis.paywall-copy"),
      kind: "diagnosis",
      status: "recorded",
      gapId: "gap.paywall-weak",
      evidenceIds: ["evidence.paywall-weak"],
      sourceRevision: "src-rev-1",
    },
    {
      ...common("option.rewrite-paywall"),
      kind: "option",
      status: "selected",
      diagnosisId: "diagnosis.paywall-copy",
      evidenceIds: ["evidence.paywall-weak"],
      sourceRevision: "src-rev-1",
    },
    {
      ...common("decision.rewrite-paywall"),
      kind: "decision",
      status: "authorized",
      optionId: "option.rewrite-paywall",
      evidenceIds: ["evidence.paywall-weak"],
      authorization: "agreement.rev-1",
    },
    { ...common("expectation.rewrite-paywall"), kind: "expectation", status: "pending", decisionId: "decision.rewrite-paywall", horizonAt: HORIZON },
    { ...common("hypothesis.rewrite-paywall"), kind: "hypothesis", status: "tentative", decisionId: "decision.rewrite-paywall" },
  ];
}

function catalog(): CatalogInput {
  return {
    version: "catalog.work-order.fixture",
    artifacts: [{ id: "artifact.paywall-copy", path: "growth/paywall.md" }],
    workflows: [
      {
        id: WORKFLOW_ID,
        title: "Rewrite paywall",
        domainId: "domain.growth",
        actionClass: "draft",
        instructions: "Rewrite the paywall copy.",
        references: [
          {
            id: "ref.paywall",
            path: "knowledge/growth/paywall.md",
            title: "Paywall evidence",
            loadWhen: "before copy work",
            sectionId: "knowledge.paywall.evidence",
            revision: "rev-paywall-1",
          },
          {
            id: "ref.ads",
            path: "knowledge/growth/ads.md",
            title: "Ads spend notes",
            loadWhen: "before spend work",
            sectionId: "knowledge.ads.spend",
            revision: "rev-ads-1",
          },
        ],
        dependencies: [],
        outputPaths: ["growth/paywall.md"],
        providerIds: [],
        laneIds: ["paid_user_acquisition"],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        maxAttempts: 5,
      },
      {
        id: NONE_WORKFLOW_ID,
        title: "Internal note",
        domainId: "domain.growth",
        actionClass: "draft",
        instructions: "Record an internal operating note.",
        dependencies: [],
        outputPaths: [],
        providerIds: [],
        laneIds: ["paid_user_acquisition"],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
        maxAttempts: 5,
      },
    ],
  };
}

function businessState(): BusinessStateV2 {
  const lanes = {} as BusinessStateV2["lanes"];
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: NOW,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "Work Order Fixture",
      slug: "work-order-fixture",
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms: ["ios"],
      bundleIds: { ios: "com.example.app", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

function seeded(): { plan: CompiledPlan; run: RunStateDocument } {
  const plan = compilePlan(catalog(), NOW);
  const run = seedRunState(plan, businessState(), {
    ownerSessionId: "session.wo",
    ttlSeconds: 300,
    wallClockCapSeconds: 600,
    now: NOW,
    runId: "run.wo-fixture",
  });
  return { plan, run };
}

function input(idempotencyKey: string, extra: Partial<InstantiateWorkOrderInput> = {}): InstantiateWorkOrderInput {
  return {
    workflowId: WORKFLOW_ID,
    decisionId: "decision.rewrite-paywall",
    objectiveId: "objective.paid-conversion",
    metricId: "metric.paywall-cvr",
    mandateId: "mandate.founder.domain.growth.draft",
    mandateStatus: "active",
    decisionStatus: "authorized",
    contextSourceIds: ["knowledge/growth/paywall.md#knowledge.paywall.evidence@rev-paywall-1"],
    readinessSnapshot: { capabilityReady: true, recordedAt: NOW },
    expectationId: "expectation.rewrite-paywall",
    horizonAt: HORIZON,
    proofPolicy: { kind: "fresh_context", required: true },
    idempotencyKey,
    recordedAt: NOW,
    ...extra,
  };
}

export function register(harness: Harness): void {
  harness.check("work-orders: two authorized interventions from one workflow are independent occurrences", () => {
    const { plan, run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.a"));
    const second = instantiateWorkOrder(run, input("idem.paywall.b"));
    assert(first.created && second.created, "both interventions must create occurrences");
    assert(first.occurrence.id !== second.occurrence.id, "occurrence identity must be independent of the workflow definition");
    const attemptA = beginAttempt(plan, run, NODE_ID, "session.a", NOW, first.occurrence.id);
    const attemptB = beginAttempt(plan, run, NODE_ID, "session.b", NOW, second.occurrence.id);
    assert(attemptA.workOrderOccurrenceId === first.occurrence.id, "first attempt must link the first occurrence");
    assert(attemptB.workOrderOccurrenceId === second.occurrence.id, "second attempt must link the second occurrence");
    assert(attemptA.id !== attemptB.id, "attempt histories stay independent");
    const schema = validateRunState(run);
    assert(schema.valid, `run state with work orders failed schema: ${JSON.stringify(schema.issues)}`);
  });

  harness.check("work-orders: repeating an idempotent commit returns the existing occurrence", () => {
    const { run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.same"));
    const again = instantiateWorkOrder(run, input("idem.paywall.same"));
    assert(again.created === false && again.conflict === false, "duplicate commit must not create a second occurrence");
    assert(again.occurrence.id === first.occurrence.id, "idempotent commit must return the original occurrence");
    assert(Object.keys(run.workOrders ?? {}).length === 1, "duplicate commit must not add a store entry");
  });

  harness.check("work-orders: a reused idempotency key with a different route is a conflict", () => {
    const { run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.conflict"));
    const conflicted = instantiateWorkOrder(run, input("idem.paywall.conflict", { workflowId: NONE_WORKFLOW_ID }));
    assert(conflicted.created === false && conflicted.conflict === true, "a changed route must conflict");
    assert(conflicted.occurrence.id === first.occurrence.id, "conflict must keep the original occurrence");
    assert(Object.keys(run.workOrders ?? {}).length === 1, "conflict must not add a store entry");
  });

  harness.check("work-orders: proof-policy key order does not create an idempotency conflict", () => {
    const { run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.proof-order"));
    const reversed = instantiateWorkOrder(run, input("idem.paywall.proof-order", { proofPolicy: { required: true, kind: "fresh_context" } }));
    assert(reversed.created === false && reversed.conflict === false, "canonical proof policy must reuse the occurrence");
    assert(reversed.occurrence.id === first.occurrence.id, "key order must not mint a second occurrence");
  });

  harness.check("work-orders: a completion claim without required proof stays active and records the refusal", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.proof"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    const refused = claimCompletion(run, created.occurrence.id, ["  "], NOW);
    assert(refused.ok === false && refused.reasonCode === "work_order.proof_missing", `expected proof_missing, got ${refused.reasonCode}`);
    assert(run.workOrders?.[created.occurrence.id]?.status === "running", "occurrence must remain active");
    assert((run.workOrders?.[created.occurrence.id]?.transitions.filter((entry) => !entry.ok).length ?? 0) > 0, "refused transition must be recorded");
  });

  harness.check("work-orders: a proof claim before an attempt stays unauthorized", () => {
    const { run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.not-running"));
    const refused = claimCompletion(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    assert(refused.ok === false && refused.reasonCode === "work_order.not_running", `expected not_running, got ${refused.reasonCode}`);
    assert(run.workOrders?.[created.occurrence.id]?.status === "authorized", "occurrence must remain authorized");
  });

  harness.check("work-orders: proven work with a missed metric reopens diagnosis without failing the work", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.missed"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    const proved = recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    assert(proved.ok, `proof should land, got ${proved.reasonCode}`);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![created.occurrence.id]!,
      model,
      observation: { metricMet: false, observationIds: ["observation.paywall-weak"], independenceGroups: ["analytics.primary"], missingExpected: false },
      clock: CLOCK,
    });
    assert(review.verdict === "missed", `expected missed, got ${review.verdict}`);
    assert(review.diagnosisReopened, "missed expectation must reopen diagnosis");
    assert(review.workFailed === false, "work success stays separate from metric success");
    assert(run.workOrders?.[created.occurrence.id]?.status !== "refused", "work occurrence must not be marked failed");
    const diagnoses = review.model.records.filter((record) => record.kind === "diagnosis");
    assert(
      diagnoses.some((record) => record.revision === 2),
      "reopened diagnosis must append a new revision",
    );
  });

  harness.check("work-orders: a met metric with confounded evidence records ambiguous causal learning", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.ambiguous"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![created.occurrence.id]!,
      model,
      observation: {
        metricMet: true,
        observationIds: ["observation.paywall-weak", "observation.paywall-weak"],
        independenceGroups: ["analytics.primary", "analytics.primary"],
        missingExpected: false,
      },
      clock: CLOCK,
    });
    assert(review.verdict === "ambiguous", `expected ambiguous, got ${review.verdict}`);
    const learning = review.model.records.filter((record) => record.kind === "learning").at(-1);
    const hypothesis = review.model.records.filter((record) => record.kind === "hypothesis").at(-1);
    const outcome = review.model.records.filter((record) => record.kind === "outcome").at(-1);
    assert(learning && learning.status !== "accepted", "ambiguous causal learning must not be accepted");
    assert(hypothesis && hypothesis.status !== "supported", "confounded evidence must not support the hypothesis");
    assert(outcome && outcome.causalStatus !== "supported", "confounded outcome must not claim causal support");
  });

  harness.check("work-orders: a revoked mandate blocks the next effect and preserves prior receipts", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.revoke"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const before = JSON.stringify(run.workOrders?.[created.occurrence.id]?.transitions.filter((entry) => entry.ok));
    revokeOccurrenceMandate(run, created.occurrence.id, NOW);
    const next = applyNextEffect(run, created.occurrence.id, NOW);
    assert(next.ok === false && next.reasonCode === "work_order.mandate_revoked", `expected mandate_revoked, got ${next.reasonCode}`);
    const after = JSON.stringify(run.workOrders?.[created.occurrence.id]?.transitions.filter((entry) => entry.ok));
    assert(before === after, "prior successful receipts must stay unchanged");
  });

  harness.check("work-orders: restart between execution and horizon resumes the same occurrence and scheduled review", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.restart"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    scheduleObservation(run, created.occurrence.id, NOW);
    const snapshot = JSON.parse(JSON.stringify(run)) as RunStateDocument;
    const loaded = validateRunState(snapshot);
    assert(loaded.valid && loaded.value, "restart snapshot must schema-validate");
    const resumed = loaded.value!;
    assert(resumed.workOrders?.[created.occurrence.id]?.id === created.occurrence.id, "occurrence identity must survive restart");
    assert(dueWorkOrderReviews(resumed, NOW).length === 0, "review must stay scheduled until the horizon");
    const due = dueWorkOrderReviews(resumed, HORIZON);
    assert(due.length === 1 && due[0]?.id === created.occurrence.id, "the same occurrence must become due at the horizon");
    const node = plan.nodes.find((candidate) => candidate.id === NODE_ID)!;
    assert(proofPolicyFor(node).required === true, "compiled proof policy must require independent proof for fail-closed outputs");
  });

  harness.check("work-orders: missing expected observation becomes acquisition work", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.missing"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![created.occurrence.id]!,
      model,
      observation: { metricMet: false, observationIds: [], independenceGroups: [], missingExpected: true },
      clock: CLOCK,
    });
    assert(review.verdict === "missing_data", `expected missing_data, got ${review.verdict}`);
    assert(review.model.evidenceRequests.length > 0, "missing expected data must open an evidence request");
    assert(run.workOrders?.[created.occurrence.id]?.status === "observing", "occurrence stays scheduled while data is acquired");
  });

  harness.check("work-orders: a no-verification workflow advances the occurrence on reconcile", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.internal.none", { workflowId: NONE_WORKFLOW_ID, proofPolicy: { kind: "none", required: false } }));
    const attempt = beginAttempt(plan, run, NONE_NODE_ID, "session.wo", NOW, created.occurrence.id);
    reconcilePatch(plan, run, { nodeId: NONE_NODE_ID, attemptId: attempt.id, outputs: [] }, NOW);
    assert(run.nodes[NONE_NODE_ID]?.status === "succeeded", "kind none must succeed on reconcile");
    assert(run.workOrders?.[created.occurrence.id]?.status === "observing", "occurrence must enter observation without a separate verification step");
  });

  harness.check("work-orders: a second authorized occurrence reopens a succeeded workflow node", () => {
    const { plan, run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.first"));
    const attempt = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, first.occurrence.id);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: NODE_ID,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.paywall-copy", path: "growth/paywall.md", fingerprint: "paywall-1", evidence: ["wrote copy"] }],
      },
      NOW,
    );
    acceptVerification(plan, run, NODE_ID, ["independent verifier accepted the copy"], NOW, "session.reviewer");
    assert(run.nodes[NODE_ID]?.status === "succeeded", "first occurrence must complete the node");
    assert(run.workOrders?.[first.occurrence.id]?.status === "observing", "first occurrence must be observing");
    const second = instantiateWorkOrder(run, input("idem.paywall.second"));
    const reopened = reopenNodesForAuthorizedWorkOrders(plan, run, NOW);
    assert(reopened.includes(NODE_ID), "succeeded node must reopen for the unmatched occurrence");
    assert(`${run.nodes[NODE_ID]?.status}` === "stale", "reopened node must be frontier-eligible");
    const next = takeAuthorizedOccurrence(run, WORKFLOW_ID);
    assert(next?.id === second.occurrence.id, "dispatch must attach the unmatched occurrence");
  });

  harness.check("work-orders: a node blocked pending verification does not reopen for a later occurrence", () => {
    const { plan, run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.verify-hold"));
    const attempt = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, first.occurrence.id);
    reconcilePatch(
      plan,
      run,
      {
        nodeId: NODE_ID,
        attemptId: attempt.id,
        outputs: [{ artifactId: "artifact.paywall-copy", path: "growth/paywall.md", fingerprint: "paywall-verify", evidence: ["wrote copy"] }],
      },
      NOW,
    );
    assert(run.nodes[NODE_ID]?.status === "blocked", "produced work must wait for independent verification");
    assert(run.nodes[NODE_ID]?.blocker === VERIFICATION_REQUIRED_BLOCKER, "pending verification must keep the canonical blocker");
    assert(run.nodes[NODE_ID]?.attempts.at(-1)?.status === "blocked", "the producing attempt must stay blocked so verification can target it");
    const second = instantiateWorkOrder(run, input("idem.paywall.verify-hold-next"));
    const reopened = reopenNodesForAuthorizedWorkOrders(plan, run, NOW);
    assert(!reopened.includes(NODE_ID), "verification-blocked nodes must not reopen for a later occurrence");
    assert(run.nodes[NODE_ID]?.status === "blocked", "pending verification must survive the later authorized occurrence");
    const before = JSON.stringify(run);
    for (const verifier of [undefined, " \t ", "session.wo"]) {
      let refused = false;
      try {
        acceptVerification(plan, run, NODE_ID, ["claimed verification"], HORIZON, verifier);
      } catch {
        refused = true;
      }
      assert(refused, "missing, blank, and producer verifier identities must be refused before work-order proof");
      assert(JSON.stringify(run) === before, "refused acceptance must not change work-order proof, bindings, evidence, or timestamps");
    }
    acceptVerification(plan, run, NODE_ID, ["independent verifier accepted the copy"], NOW, "session.reviewer");
    assert(`${run.nodes[NODE_ID]?.status}` === "succeeded", "verification must still be able to accept the held attempt");
    assert(second.created, "the later occurrence must still exist after verification completes");
  });

  harness.check("work-orders: concurrent reviews at the same clock keep distinct outcome ids", () => {
    const { plan, run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.outcome-a"));
    const second = instantiateWorkOrder(run, input("idem.paywall.outcome-b"));
    beginAttempt(plan, run, NODE_ID, "session.a", NOW, first.occurrence.id);
    beginAttempt(plan, run, NODE_ID, "session.b", NOW, second.occurrence.id);
    recordWorkOrderProof(run, first.occurrence.id, ["independent verifier accepted the copy"], NOW);
    recordWorkOrderProof(run, second.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const reviewA = reviewOutcome({
      run,
      occurrence: run.workOrders![first.occurrence.id]!,
      model,
      observation: { metricMet: true, observationIds: ["observation.paywall-weak"], independenceGroups: ["analytics.primary"], missingExpected: false },
      clock: CLOCK,
    });
    const reviewB = reviewOutcome({
      run,
      occurrence: run.workOrders![second.occurrence.id]!,
      model: reviewA.model,
      observation: { metricMet: true, observationIds: ["observation.paywall-weak"], independenceGroups: ["analytics.primary"], missingExpected: false },
      clock: CLOCK,
    });
    const outcomeIds = reviewB.model.records.filter((record) => record.kind === "outcome").map((record) => record.id);
    assert(outcomeIds.length === 2 && new Set(outcomeIds).size === 2, "two reviews at the same clock must not share an outcome id");
  });

  harness.check("work-orders: a failed attempt returns the occurrence to authorized so dispatch can retry it", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.retry"));
    const attempt = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    attempt.status = "failed";
    attempt.finishedAt = NOW;
    const restored = restoreOccurrenceAfterAttempt(run, created.occurrence.id, NOW);
    assert(restored.ok && run.workOrders?.[created.occurrence.id]?.status === "authorized", "failed attempt must restore the occurrence to authorized");
    const again = takeAuthorizedOccurrence(run, WORKFLOW_ID);
    assert(again?.id === created.occurrence.id, "dispatch must select the restored occurrence");
    const retry = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    assert(retry.workOrderOccurrenceId === created.occurrence.id, "retry attempt must relink the same occurrence");
  });

  harness.check("work-orders: takeAuthorizedOccurrence skips an occurrence whose live mandate is revoked", () => {
    const { run } = seeded();
    instantiateWorkOrder(run, input("idem.paywall.live-mandate"));
    assert(takeAuthorizedOccurrence(run, WORKFLOW_ID) !== undefined, "snapshot-active occurrence must be dispatchable");
    const agreement = standingFounderAgreement(NOW);
    const revoked = revokeMandate(standingFounderMandate(agreement, "domain.growth", "draft", NOW), NOW);
    assert(
      takeAuthorizedOccurrence(run, WORKFLOW_ID, { mandates: [revoked], now: NOW }) === undefined,
      "a revoked live mandate must block dispatch even if the snapshot is still active",
    );
  });

  harness.check("work-orders: a later occurrence can begin after the shared node has used its attempt budget", () => {
    const { plan, run } = seeded();
    const node = plan.nodes.find((candidate) => candidate.id === NODE_ID)!;
    const state = run.nodes[NODE_ID]!;
    for (let index = 0; index < node.maxAttempts; index += 1) {
      state.attempts.push({
        id: `${NODE_ID}.attempt.seed-${index + 1}`,
        nodeId: NODE_ID,
        number: index + 1,
        status: "failed",
        ownerSessionId: "session.seed",
        heartbeatAt: NOW,
        ttlSeconds: node.ttlSeconds,
        inputFingerprint: "seed",
        startedAt: NOW,
        finishedAt: NOW,
        evidence: [],
        readbackRequired: false,
      });
    }
    state.status = "failed";
    const created = instantiateWorkOrder(run, input("idem.paywall.budget"));
    const reopened = reopenNodesForAuthorizedWorkOrders(plan, run, NOW);
    assert(reopened.includes(NODE_ID), "exhausted node must still reopen for an unmatched occurrence");
    const attempt = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    assert(attempt.workOrderOccurrenceId === created.occurrence.id, "per-occurrence budget must allow a later occurrence to begin");
  });

  harness.check("work-orders: orphaning an idempotent attempt restores the linked occurrence", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.orphan"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    const later = "2026-08-22T22:00:00.000Z";
    const events = detectOrphans(plan, run, later);
    assert(
      events.some((event) => event.resolution === "ready"),
      "idempotent orphan must resolve ready",
    );
    assert(run.workOrders?.[created.occurrence.id]?.status === "authorized", "orphaned occurrence must return to authorized");
    assert(takeAuthorizedOccurrence(run, WORKFLOW_ID)?.id === created.occurrence.id, "dispatch must offer the restored occurrence");
  });

  harness.check("work-orders: syncing one revoked mandate leaves occurrences bound to other mandates active", () => {
    const { run } = seeded();
    const first = instantiateWorkOrder(run, input("idem.paywall.mandate-keep"));
    const second = instantiateWorkOrder(run, input("idem.paywall.mandate-drop", { mandateId: "mandate.founder.domain.food.draft" }));
    const agreement = standingFounderAgreement(NOW);
    const revokedFood = revokeMandate(standingFounderMandate(agreement, "domain.food", "draft", NOW), NOW);
    const revoked = syncOccurrenceMandates(run, [revokedFood], NOW);
    assert(revoked.includes(second.occurrence.id), "the matching occurrence must revoke");
    assert(!revoked.includes(first.occurrence.id), "unrelated mandates must not be treated as missing");
    assert(run.workOrders?.[first.occurrence.id]?.snapshots.mandateStatus === "active", "the other occurrence must stay active");
    assert(run.workOrders?.[second.occurrence.id]?.snapshots.mandateStatus === "revoked", "the provided revoked mandate must update its snapshot");
  });

  harness.check("work-orders: exhausting an occurrence's attempt budget terminals it and unblocks a later occurrence", () => {
    const { plan, run } = seeded();
    const node = plan.nodes.find((candidate) => candidate.id === NODE_ID)!;
    node.maxAttempts = 1;
    const first = instantiateWorkOrder(run, input("idem.paywall.exhaust"));
    const attempt = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, first.occurrence.id);
    attempt.status = "failed";
    attempt.finishedAt = NOW;
    restoreOccurrenceAfterAttempt(run, first.occurrence.id, NOW);
    assert(run.workOrders?.[first.occurrence.id]?.status === "authorized", "under-budget failure must still restore to authorized");
    let threw = false;
    try {
      beginAttempt(plan, run, NODE_ID, "session.wo", NOW, first.occurrence.id);
    } catch {
      threw = true;
    }
    assert(threw, "beginAttempt must refuse once the occurrence has used its budget");
    assert(run.workOrders?.[first.occurrence.id]?.status === "exhausted", "the spent occurrence must become exhausted");
    assert(takeAuthorizedOccurrence(run, WORKFLOW_ID) === undefined, "an exhausted occurrence must not be dispatchable");
    run.nodes[NODE_ID]!.status = "blocked";
    run.nodes[NODE_ID]!.blocker = "Ran out of attempts for this session.";
    const second = instantiateWorkOrder(run, input("idem.paywall.exhaust-next"));
    const reopened = reopenNodesForAuthorizedWorkOrders(plan, run, NOW);
    assert(reopened.includes(NODE_ID), "a blocked node must reopen for a later authorized occurrence");
    assert(`${run.nodes[NODE_ID]?.status}` === "stale", "reopened blocked node must be frontier-eligible");
    const next = beginAttempt(plan, run, NODE_ID, "session.wo", NOW, second.occurrence.id);
    assert(next.workOrderOccurrenceId === second.occurrence.id, "the later occurrence must still be able to begin");
    const schema = validateRunState(run);
    assert(schema.valid, `exhausted occurrence failed schema: ${JSON.stringify(schema.issues)}`);
  });

  harness.check("work-orders: occurrence context selectors pin the worker brief", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.brief"));
    const node = plan.nodes.find((candidate) => candidate.id === NODE_ID)!;
    const defaultBrief = composeNodeBrief(node, plan);
    assert(!defaultBrief.contextSelectors?.length, "catalog brief must not invent work-order selectors");
    const pinned = composeNodeBrief(node, plan, capsuleFromOccurrence(created.occurrence));
    assert(
      pinned.contextSelectors?.join("\0") === created.occurrence.contextSourceIds.join("\0"),
      "worker brief selectors must match the occurrence's committed sources",
    );
    assert((defaultBrief.load?.length ?? 0) > (pinned.load?.length ?? 0), "pinned brief must drop catalog knowledge outside the capsule");
    assert(
      pinned.load.every((entry) => created.occurrence.contextSourceIds.some((sourceId) => sourceId.startsWith(`${entry.path}#`))),
      "pinned load entries must be inside the occurrence's committed sources",
    );
  });

  harness.check("work-orders: an empty committed capsule does not restore catalog knowledge", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.empty-capsule", { contextSourceIds: [] }));
    const node = plan.nodes.find((candidate) => candidate.id === NODE_ID)!;
    const defaultBrief = composeNodeBrief(node, plan);
    const pinned = composeNodeBrief(node, plan, capsuleFromOccurrence(created.occurrence));
    assert((defaultBrief.load?.length ?? 0) > 0, "catalog brief must still list authored knowledge");
    assert((pinned.load?.length ?? 0) === 0, "an empty committed capsule must load no catalog knowledge");
    assert(pinned.contextSelectors?.length === 0, "empty capsule selectors must stay present and empty");
  });

  harness.check("work-orders: a capsule pins the exact knowledge revision", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.revision-pin"));
    const node = plan.nodes.find((candidate) => candidate.id === NODE_ID)!;
    node.references = (node.references ?? []).map((reference) =>
      reference.sectionId === "knowledge.paywall.evidence" ? { ...reference, revision: "rev-paywall-2" } : reference,
    );
    const pinned = composeNodeBrief(node, plan, capsuleFromOccurrence(created.occurrence));
    assert(
      pinned.load.every((entry) => entry.revision !== "rev-paywall-2"),
      "a later catalog revision must not replace the committed capsule revision",
    );
  });

  harness.check("work-orders: review due-ness compares horizon instants, not lexical timestamps", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.horizon-offset", { horizonAt: "2026-08-22T19:00:00-05:00" }));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const due = dueWorkOrderReviews(run, NOW);
    assert(!due.some((occurrence) => occurrence.id === created.occurrence.id), "a later instant with an earlier lexical timestamp must not be treated as due");
  });

  harness.check("work-orders: outcome observations must belong to the occurrence metric", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.wrong-metric"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const records = loopRecords();
    const sample = records.find((record) => record.kind === "observation");
    if (!sample || sample.kind !== "observation") throw new Error("fixture observation missing");
    records.push({ ...common("metric.other"), kind: "metric", status: "active", objectiveId: "objective.paid-conversion", name: "Other metric" });
    records.push({ ...sample, id: "observation.other-metric", metricId: "metric.other" });
    const model = seedOperatingModel(records, CLOCK, "b2c");
    let threw = false;
    try {
      reviewOutcome({
        run,
        occurrence: run.workOrders![created.occurrence.id]!,
        model,
        observation: { metricMet: true, observationIds: ["observation.other-metric"], independenceGroups: ["analytics.primary"], missingExpected: false },
        clock: CLOCK,
      });
    } catch {
      threw = true;
    }
    assert(threw, "observations for a different metric must not complete the occurrence");
  });

  harness.check("work-orders: independence groups are derived from stored observations", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.independence"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const records = loopRecords();
    const sample = records.find((record) => record.kind === "observation");
    if (!sample || sample.kind !== "observation") throw new Error("fixture observation missing");
    records.push({ ...sample, id: "observation.paywall-weak-copy" });
    const model = seedOperatingModel(records, CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![created.occurrence.id]!,
      model,
      observation: {
        metricMet: true,
        observationIds: ["observation.paywall-weak", "observation.paywall-weak-copy"],
        independenceGroups: ["analytics.primary", "review.independent"],
        missingExpected: false,
      },
      clock: CLOCK,
    });
    assert(review.verdict === "ambiguous", `duplicate stored independence must stay confounded, got ${review.verdict}`);
  });

  harness.check("work-orders: a successful outcome without observations is missing data", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.empty-observations"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![created.occurrence.id]!,
      model,
      observation: { metricMet: true, observationIds: [], independenceGroups: [], missingExpected: false },
      clock: CLOCK,
    });
    assert(review.verdict === "missing_data", `expected missing_data, got ${review.verdict}`);
  });

  harness.check("work-orders: a missed outcome without observations is missing data", () => {
    const { plan, run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.empty-missed"));
    beginAttempt(plan, run, NODE_ID, "session.wo", NOW, created.occurrence.id);
    recordWorkOrderProof(run, created.occurrence.id, ["independent verifier accepted the copy"], NOW);
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    const review = reviewOutcome({
      run,
      occurrence: run.workOrders![created.occurrence.id]!,
      model,
      observation: { metricMet: false, observationIds: [], independenceGroups: [], missingExpected: false },
      clock: CLOCK,
    });
    assert(review.verdict === "missing_data", `expected missing_data, got ${review.verdict}`);
  });

  harness.check("work-orders: outcome review refuses occurrences that are not observing", () => {
    const { run } = seeded();
    const created = instantiateWorkOrder(run, input("idem.paywall.not-observing"));
    const model = seedOperatingModel(loopRecords(), CLOCK, "b2c");
    let threw = false;
    try {
      reviewOutcome({
        run,
        occurrence: created.occurrence,
        model,
        observation: { metricMet: true, observationIds: ["observation.paywall-weak"], independenceGroups: ["analytics.primary"], missingExpected: false },
        clock: CLOCK,
      });
    } catch {
      threw = true;
    }
    assert(threw, "authorized occurrences must not record outcome learning");
    assert(created.occurrence.status === "authorized", "refused review must not mutate occurrence status");
  });
}
