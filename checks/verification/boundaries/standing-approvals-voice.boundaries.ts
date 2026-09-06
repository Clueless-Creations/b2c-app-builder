/**
 * Founder-public-voice boundary (docs/authority-envelopes.md, "Public voice" grant, #31): a
 * standing envelope must never auto-approve a publish tagged purpose "social_engagement" — a
 * social/public post made in the founder's voice — no matter how exactly the voicePolicy strings
 * match. Every such publish must trace to a fresh, per-item founder decision instead.
 *
 * This exercises the real runtime evaluator (applyStandingApprovals in
 * kernel/autonomy/standing-approvals.ts), the same module kernel/session/run.ts calls before every
 * dispatch — not a description of the guardrail text.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { assert, type Harness } from "../fixtures/_harness.js";
import { applyStandingApprovals } from "../../../kernel/autonomy/standing-approvals.js";
import type { CompiledPlan, CompiledRunNode } from "../../../kernel/engine/compile.js";
import type { RunStateDocument } from "../../../kernel/schema/types.js";
import { NOW } from "./_fixtures.js";

const PAYLOAD_DIGEST = `sha256:${"d".repeat(64)}`;

/** A minimal, schema-shaped publish node with exactly one founder approval gate. */
function publishNode(workflowSlug: string): CompiledRunNode {
  return {
    id: `run.${workflowSlug}` as CompiledRunNode["id"],
    workflowId: `workflow.${workflowSlug}` as CompiledRunNode["workflowId"],
    title: `Fixture publish node ${workflowSlug}`,
    domainId: "domain.growth" as CompiledRunNode["domainId"],
    actionClass: "publish",
    inputs: [],
    outputs: [`artifact.${workflowSlug}` as CompiledRunNode["outputs"][number]],
    outputPaths: [`growth/${workflowSlug}.md`],
    providerIds: [],
    dependencies: [],
    refreshDependencies: [],
    statePredicates: [],
    laneIds: [],
    deferredByProfiles: [],
    approvals: [{ id: `workflow.${workflowSlug}.approval.1`, description: "Approve this public post" }],
    resources: [{ id: `resource.path.growth/${workflowSlug}.md`, mode: "exclusive" }],
    verification: { kind: "none", gateIds: [], freshContext: false, failClosed: false },
    idempotent: true,
    maxAttempts: 3,
    ttlSeconds: 300,
    tokenBudget: 8_000,
    phaseIds: [],
    applicability: { mode: "always" },
  };
}

function planFor(node: CompiledRunNode): CompiledPlan {
  return { planId: "plan.fixture", planRevision: 1, catalogVersion: "catalog.fixture.1", compiledAt: NOW, nodes: [node], artifactBindings: [] };
}

function runStateFor(node: CompiledRunNode): RunStateDocument {
  const approvalId = node.approvals[0]!.id;
  return {
    schemaVersion: "1.0.0",
    runId: "run.fixture",
    planId: "plan.fixture",
    planRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ownerSessionId: "session-fixture",
    heartbeatAt: NOW,
    ttlSeconds: 300,
    wallClockCapSeconds: 300,
    approvals: { [approvalId]: "pending" },
    artifactBindings: [],
    nodes: { [node.id]: { nodeId: node.id, status: "waiting_founder", attempts: [] } },
  };
}

/** Envelope + capability + action, all exactly matching `node`, differing only in the action's `purpose`. */
function writeLedger(ledgerPath: string, node: CompiledRunNode, purpose: string): void {
  const envelope = {
    id: "APR-growth-post",
    provider: "Resend",
    account: "acct_growth",
    team: "marketing",
    project: "fixture-app",
    environment: "production",
    actionClasses: ["publish"],
    operations: [node.workflowId],
    resourcePatterns: node.outputPaths,
    payloadDigests: [PAYLOAD_DIGEST],
    exclusions: [],
    mode: "standing",
    expiresAt: "2027-08-01T00:00:00.000Z",
    status: "active",
    spendCeiling: null,
    voicePolicy: "approved-brand-voice-v1",
  };
  const capability = {
    id: "resend-api",
    provider: envelope.provider,
    status: "available",
    account: envelope.account,
    team: envelope.team,
    project: envelope.project,
    environment: envelope.environment,
    modes: ["publish"],
  };
  const action = {
    id: "ACT-growth-post",
    class: "publish",
    purpose,
    operation: node.workflowId,
    resource: node.outputPaths[0],
    capabilityId: capability.id,
    provider: envelope.provider,
    account: envelope.account,
    team: envelope.team,
    project: envelope.project,
    environment: envelope.environment,
    payloadDigest: PAYLOAD_DIGEST,
    spendAmount: null,
    currency: "",
    // The exact approved voice policy — proves a founder-public-voice publish stays gated even
    // when this is a perfect string match, not merely an unrelated mismatch.
    voicePolicy: envelope.voicePolicy,
    authorization: { approvalId: envelope.id },
    preflight: { targetVerified: true },
    result: { status: "planned" },
  };
  writeFileSync(ledgerPath, JSON.stringify({ approvalEnvelopes: [envelope], capabilities: [capability], actions: [action] }));
}

export function register(harness: Harness): void {
  harness.check(
    "standing-approvals-voice: a standing envelope never auto-approves a founder-public-voice publish, even with the exact approved voice policy",
    () => {
      const node = publishNode("growth-post-social");
      const plan = planFor(node);
      const run = runStateFor(node);
      const approvalId = node.approvals[0]!.id;
      const ledgerPath = path.join(harness.makeTempDir("standing-approvals-voice-blocked"), "agent-operations.json");
      writeLedger(ledgerPath, node, "social_engagement");

      const matches = applyStandingApprovals(plan, run, ledgerPath, NOW);
      assert(matches.length === 0, `expected no standing-envelope match for a founder-public-voice publish, got ${JSON.stringify(matches)}`);
      assert(run.approvals[approvalId] === "pending", "a founder-public-voice publish must stay pending, never auto-approved by a standing envelope");
      assert(run.nodes[node.id]?.status === "waiting_founder", "the node must remain parked on the founder, not promoted to schedulable");
    },
  );

  harness.check("standing-approvals-voice: the same standing envelope still covers an equivalent publish that is not tagged founder-public-voice", () => {
    // Control case: proves the gate targets the "social_engagement" tag specifically, not
    // every publish action — routine already-approved copy publication (store metadata,
    // previously-drafted landing pages) legitimately keeps using standing envelopes.
    const node = publishNode("growth-post-routine");
    const plan = planFor(node);
    const run = runStateFor(node);
    const approvalId = node.approvals[0]!.id;
    const ledgerPath = path.join(harness.makeTempDir("standing-approvals-voice-unaffected"), "agent-operations.json");
    writeLedger(ledgerPath, node, "provider_mutation");

    const matches = applyStandingApprovals(plan, run, ledgerPath, NOW);
    assert(matches.length === 1, `expected the matching standing envelope to cover a non-public-voice publish, got ${JSON.stringify(matches)}`);
    assert(run.approvals[approvalId] === "approved", "a routine publish tagged outside social_engagement must still consume its matching standing envelope");
  });
}
