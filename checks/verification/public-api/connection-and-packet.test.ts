import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  connectionReceipt,
  connectionReceiptSchema,
  hostedMcpInstructionsSuffix,
  localMcpInstructions,
  parseConnectionReceipt,
} from "../../../contracts/public-api/connection-receipt.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import type { Catalog } from "../../../catalog/types.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { composeNodeBrief, type NodeBrief } from "../../../kernel/engine/node-brief.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import { projectHeldWork, projectInitializedBusinessPlan, projectReadyBrief, isLaterGuidance } from "../../../kernel/services/plan-projection.js";
import { buildWorkerPrompt } from "../../../kernel/session/worker-prompt.js";
import type { HeldNode, PlanReport } from "../../../kernel/session/plan.js";
import { buildHostedKnowledgeBundle } from "../../../tooling/render-hosted-bundle.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const emptyBrief = {
  contractFiles: [],
  consult: [],
  route: [],
  skills: [],
  tools: [],
  produce: [],
  verify: { kind: "none" as const, gateCommands: [], failClosed: true },
  tokenBudget: 8_000,
};

function readyBrief(overrides: Partial<NodeBrief> = {}): NodeBrief {
  return {
    workflowId: "workflow.fixture.ready",
    title: "Ready fixture",
    instructions: "Do the current research slice.",
    open: ["strategy/RESEARCH.md"],
    load: [],
    approvals: [],
    ...emptyBrief,
    ...overrides,
  };
}

test("setup prints a local connection receipt and distinct b2c-local registration", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-connection-"));
  const home = path.join(temp, "home");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "setup"], {
      cwd: temp,
      env: { ...process.env, B2C_APP_BUILDER_HOME: home },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /b2c-local/);
    assert.match(result.stdout, /b2c-hosted/);
    assert.match(result.stdout, /legacy local name/);
    const parsed = parseConnectionReceipt(result.stdout);
    assert.equal(parsed.mode, "local_execution");
    assert.equal(parsed.identity.recommended, "b2c-local");
    assert.deepEqual(parsed.identity.legacy, ["b2c-app-builder"]);
    assert.equal(parsed.declares.workspaceExecution, "local_cli");
    assert.equal(parsed.declares.writes, "cli_default");
    assert.equal(parsed.observed, undefined);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("local MCP instructions name local execution and refuse hosted-as-local", () => {
  const text = localMcpInstructions({ knowledge: "available", engineVersion: "0.219.40", writes: "mcp_write_enabled" });
  assert.match(text, /b2c-local/);
  assert.match(text, /b2c-hosted/);
  const receipt = parseConnectionReceipt(text);
  assert.equal(receipt.mode, "local_execution");
  assert.deepEqual(receipt.identity.legacy, ["b2c-app-builder"]);
  assert.equal(receipt.declares.knowledge, "bundled");
  assert.equal(receipt.observed?.knowledge, "available");
  assert.equal(receipt.observed?.writes, "mcp_write_enabled");
});

test("hosted receipt declares hosted mode and omits the leftover local name", () => {
  const receipt = connectionReceiptSchema.parse(connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.40" }));
  assert.equal(receipt.identity.recommended, "b2c-hosted");
  assert.equal(receipt.identity.legacy, undefined);
  assert.equal(receipt.declares.workspacePlanning, "none");
  assert.equal(receipt.observed, undefined);
  const suffix = hostedMcpInstructionsSuffix("0.219.40");
  assert.match(suffix, /legacy local name/);
  assert.equal(parseConnectionReceipt(suffix).identity.legacy, undefined);
});

test("worker packet keeps current-task guidance and accounts deferred later load", () => {
  assert.equal(isLaterGuidance("always"), false);
  assert.equal(isLaterGuidance("before this task"), false);
  assert.equal(isLaterGuidance("later, after launch"), true);
  assert.equal(isLaterGuidance("After launch"), true);
  assert.equal(
    isLaterGuidance("before accessibility declarations, beta readiness, or store submission", { workflowId: "workflow.engineering.accessibility-common-task-proof" }, { path: "knowledge/engineering/accessibility-readiness.md" }),
    false,
  );
  assert.equal(
    isLaterGuidance(
      "calibrating complete consumer-business mobile and landing craft against primary-source product examples before production and independent review",
      { workflowId: "workflow.orchestration.full-launch-program" },
      { path: "knowledge/design/consumer-craft-benchmarks.md" },
    ),
    true,
  );
  const brief = projectReadyBrief(
    readyBrief({
      consult: ["operations/FOUNDER_BRIEF.md"],
      load: [
        { path: "knowledge/research/now.md", title: "Now", loadWhen: "before this task" },
        { path: "knowledge/store/later.md", title: "Later", loadWhen: "later, after launch" },
      ],
    }),
  );
  assert.deepEqual(
    brief.load.map((entry) => entry.path),
    ["knowledge/research/now.md"],
  );
  assert.equal(brief.context?.deferredLoadCount, 1);
  assert.equal(brief.context?.loadCount, 1);
  assert.equal(brief.effectBoundary, "read_and_produce");
  assert.match(brief.readyWhy ?? "", /prerequisites are satisfied/);
  assert.match(brief.continuation ?? "", /return to business-plan/);
  const leftoverApprovals = projectReadyBrief(readyBrief({ approvals: ["Approve spend"] }));
  assert.equal(leftoverApprovals.effectBoundary, "read_and_produce");
  const held = projectHeldWork({
    nodeId: "run.fixture.held",
    workflowId: "workflow.fixture.held",
    title: "Held fixture",
    domainId: "domain.research",
    reason: "founder_approval",
    detail: "Waiting on a current founder hold.",
  } satisfies HeldNode);
  assert.equal(held.effectBoundary, "founder_approval_required");
});

test("plan projection labels granted leftover approvals as read_and_produce and held founder work as founder_approval_required", () => {
  const report = {
    planId: "plan.fixture",
    catalogVersion: "0.0.0",
    totalNodes: 2,
    done: 0,
    batches: [
      [
        {
          nodeId: "run.fixture.ready",
          workflowId: "workflow.fixture.ready",
          title: "Ready fixture",
          domainId: "domain.research",
          reason: "upstream",
          detail: "",
        },
      ],
    ],
    readyBriefs: [readyBrief({ approvals: ["Approve spend"] })],
    held: [
      {
        nodeId: "run.fixture.held",
        workflowId: "workflow.fixture.held",
        title: "Held fixture",
        domainId: "domain.research",
        reason: "founder_approval",
        detail: "Waiting on a current founder hold.",
      },
    ],
    autonomyUnset: false,
    founderQuestion: null,
  } satisfies PlanReport;
  const plan = projectInitializedBusinessPlan({
    workspaceId: "fixture",
    revision: `sha256:${"a".repeat(64)}`,
    report,
    completion: {
      deliveryAccepted: false,
      closeoutWorkflowId: "workflow.orchestration.full-launch-closeout",
      requiredCount: 0,
      excludedCount: 0,
      outstandingCount: 0,
      assessed: false,
      nextAction: "Continue.",
    },
  });
  assert.equal(plan.ready[0]?.brief?.approvals[0], "Approve spend");
  assert.equal(plan.ready[0]?.brief?.effectBoundary, "read_and_produce");
  assert.equal(plan.held[0]?.effectBoundary, "founder_approval_required");
});

function catalogProjection(workflowId: string) {
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog/generated/catalog.json"), "utf8")) as {
    references: Array<{ id: string; path: string; title: string; loadWhen: string }>;
    workflows: Array<{ id: string; title: string; instructions: string; referenceIds: string[]; founderOnlyActions: string[] }>;
  };
  const workflow = catalog.workflows.find((entry) => entry.id === workflowId);
  assert(workflow, `catalog lost ${workflowId}`);
  const refs = new Map(catalog.references.map((entry) => [entry.id, entry]));
  const load = workflow.referenceIds.map((id) => {
    const reference = refs.get(id)!;
    return { path: reference.path, title: reference.title, loadWhen: reference.loadWhen };
  });
  return { workflow, load, projected: projectReadyBrief(readyBrief({ workflowId: workflow.id, title: workflow.title, instructions: workflow.instructions, approvals: [...workflow.founderOnlyActions], load })) };
}

test("full-launch-program packet defers real catalog later-horizon loads", () => {
  const { workflow, load, projected } = catalogProjection("workflow.orchestration.full-launch-program");
  assert(projected.context && projected.context.deferredLoadCount > 0, "a real full-launch-program packet must defer later-horizon catalog loadWhen");
  assert(projected.load.some((entry) => /full-launch-program/.test(entry.path)), "program-open guidance must remain current");
  assert.equal(projected.effectBoundary, "read_and_produce");
  const prompt = buildWorkerPrompt(
    readyBrief({
      workflowId: workflow.id,
      title: workflow.title,
      instructions: "Open the program.",
      load,
    }),
    "/tmp/business",
    "/tmp/skill",
  );
  assert.match(prompt, /DEFERRED LATER KNOWLEDGE/);
  assert.match(prompt, /not current reading/);
  assert.doesNotMatch(prompt.split("DEFERRED LATER KNOWLEDGE")[0] ?? "", /consumer-craft-benchmarks/);
});

test("specialist workflows keep their own current books that a program packet defers", () => {
  const accessibility = catalogProjection("workflow.engineering.accessibility-common-task-proof");
  assert.equal(accessibility.projected.load.length, 1, "accessibility-common-task-proof must keep its current load");
  assert(accessibility.projected.load.some((entry) => /accessibility-readiness/.test(entry.path)));
  assert.equal(accessibility.projected.context?.deferredLoadCount, 0);

  const designRoom = catalogProjection("workflow.design.design-room");
  assert(designRoom.projected.load.some((entry) => /design-evidence-stack/.test(entry.path)), "Design Room must keep design-evidence-stack");
  assert(designRoom.projected.load.some((entry) => /mobile-flow-craft/.test(entry.path)), "Design Room must keep mobile-flow-craft");

  const premium = catalogProjection("workflow.design.premium-mobile-craft");
  assert(premium.projected.load.some((entry) => /design-evidence-stack/.test(entry.path)), "premium-mobile-craft must keep design-evidence-stack");
  assert(premium.projected.load.some((entry) => /mobile-flow-craft/.test(entry.path)), "premium-mobile-craft must keep mobile-flow-craft");

  const crossDomainCurrent = [
    { workflowId: "workflow.experience.onboarding-system.onb-16-journey-graph", keep: ["design-evidence-stack"] },
    { workflowId: "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract", keep: ["design-evidence-stack", "mobile-flow-craft"] },
    { workflowId: "workflow.experience.onboarding-system.onb-18-visual-design-prototype", keep: ["design-evidence-stack", "mobile-flow-craft"] },
    { workflowId: "workflow.store.store-screenshots-production", keep: ["design-evidence-stack", "mobile-flow-craft"] },
    { workflowId: "workflow.growth.pre-launch-funnel-landing-waitlist", keep: ["design-evidence-stack"] },
    { workflowId: "workflow.experience.emotional-experience-design-producer", keep: ["design-evidence-stack"] },
  ] as const;
  for (const { workflowId, keep } of crossDomainCurrent) {
    const { projected } = catalogProjection(workflowId);
    for (const needle of keep) {
      assert(projected.load.some((entry) => entry.path.includes(needle)), `${workflowId} dropped current ${needle}`);
    }
  }

  const program = catalogProjection("workflow.orchestration.full-launch-program");
  assert(!program.projected.load.some((entry) => /design-evidence-stack|mobile-flow-craft|accessibility-readiness/.test(entry.path)));
});

test("live compose and dispatch packets keep program deferred counts and fastlane's own book", () => {
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog/generated/catalog.json"), "utf8")) as Catalog;
  const compiled = compilePlan(toCatalogInput(catalog));
  const byWorkflowId = new Map(compiled.nodes.map((node) => [node.workflowId, node]));
  const service = createKnowledgeService(buildHostedKnowledgeBundle(root));

  const programNode = byWorkflowId.get("workflow.orchestration.full-launch-program");
  assert(programNode, "full-launch-program missing from the compiled runtime plan");
  const composedProgram = composeNodeBrief(programNode, compiled);
  const dispatchedProgram = service.workflow({ workflowId: programNode.workflowId, brief: true }).dispatchBrief!;
  for (const packet of [composedProgram, dispatchedProgram]) {
    assert((packet.deferredLoad?.length ?? 0) > 0, `${packet.workflowId} live packet lost deferred later-horizon binds`);
    assert(packet.load.some((entry) => /full-launch-program/.test(entry.path)));
    assert(!packet.load.some((entry) => /design-evidence-stack|mobile-flow-craft/.test(entry.path)));
    const projected = projectReadyBrief(packet);
    assert((projected.context?.deferredLoadCount ?? 0) > 0, `${packet.workflowId} live projectReadyBrief deferredLoadCount is 0`);
    const prompt = buildWorkerPrompt(packet, "/tmp/business", "/tmp/skill");
    assert.match(prompt, /DEFERRED LATER KNOWLEDGE/);
    assert.match(prompt, /design-evidence-stack|mobile-flow-craft|consumer-craft-benchmarks/);
    assert.doesNotMatch(prompt.split("DEFERRED LATER KNOWLEDGE")[0] ?? "", /consumer-craft-benchmarks/);
  }

  const fastlaneNode = byWorkflowId.get("workflow.growth.fastlane-growth-ops");
  assert(fastlaneNode, "fastlane-growth-ops missing from the compiled runtime plan");
  const composedFastlane = composeNodeBrief(fastlaneNode, compiled);
  const dispatchedFastlane = service.workflow({ workflowId: fastlaneNode.workflowId, brief: true }).dispatchBrief!;
  for (const packet of [composedFastlane, dispatchedFastlane]) {
    assert(
      packet.load.some((entry) => entry.referenceId === "reference.growth.fastlane-growth-ops"),
      `${packet.workflowId} live packet dropped own-book referenceId`,
    );
    assert(!(packet.deferredLoad ?? []).some((entry) => entry.referenceId === "reference.growth.fastlane-growth-ops"));
    const projected = projectReadyBrief(packet);
    assert(projected.load.some((entry) => /fastlane-growth-ops/.test(entry.path)), `${packet.workflowId} live worker packet dropped its own book`);
    const prompt = buildWorkerPrompt(packet, "/tmp/business", "/tmp/skill");
    const mandatory = prompt.split("DEFERRED LATER KNOWLEDGE")[0] ?? prompt;
    assert.match(mandatory, /fastlane-growth-ops/);
    assert.doesNotMatch(prompt.split("DEFERRED LATER KNOWLEDGE")[1] ?? "", /fastlane-growth-ops/);
  }
});
