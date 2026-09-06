import { assert, type Harness } from "../fixtures/_harness.js";
import { compilePlan, type CatalogArtifact, type CatalogInput, type CatalogWorkflowNode, type RunNodeId } from "../../../kernel/engine/compile.js";
import { computeFrontier } from "../../../kernel/engine/frontier.js";
import { seedRunState } from "../../../kernel/engine/runstate.js";
import { createAutonomyEvaluator, type AutonomyDecisionDetail } from "../../../kernel/autonomy/evaluator.js";
import type { PrerequisiteVerifier } from "../../../kernel/autonomy/prerequisites.js";
import { baseBusinessState, makeBalance, makeGrants, makeLedger, makeWaiver, verifiedProbe, NOW } from "./_fixtures.js";

/**
 * A small cross-domain catalog covering all six protected categories plus one unprotected
 * observe node, and two independent nodes sharing domain.trust's grant (trust-audit unprotected,
 * trust-rotate protected) — the pair that proves a prerequisite lapse parks every node depending
 * on that grant, not only the one that happens to trigger the probe.
 */
function testArtifacts(): CatalogArtifact[] {
  return [
    { id: "artifact.research-brief", path: "research/brief.md" },
    { id: "artifact.revenue-report", path: "revenue/report.md" },
    { id: "artifact.store-submission", path: "store/submission.json" },
    { id: "artifact.eng-wipe", path: "engineering/wipe.log" },
    { id: "artifact.trust-rotate", path: "trust/rotate.log" },
    { id: "artifact.trust-audit", path: "trust/audit.log" },
    { id: "artifact.growth-post", path: "growth/post.md" },
  ];
}

function testWorkflows(): CatalogWorkflowNode[] {
  function shared(): Pick<CatalogWorkflowNode, "dependencies" | "providerIds" | "laneIds" | "founderOnlyActions" | "gateCommands"> {
    return { dependencies: [], providerIds: [], laneIds: [], founderOnlyActions: [], gateCommands: [] };
  }
  return [
    {
      id: "workflow.research-scan",
      title: "Research scan",
      domainId: "domain.research",
      actionClass: "observe",
      outputPaths: ["research/brief.md"],
      idempotent: true,
      ...shared(),
    },
    {
      id: "workflow.revenue-report",
      title: "Revenue report",
      domainId: "domain.money",
      actionClass: "spend",
      protectedCategory: "spend",
      costEstimate: { amount: 250, currency: "USD" },
      outputPaths: ["revenue/report.md"],
      idempotent: false,
      ...shared(),
    },
    {
      id: "workflow.store-submit",
      title: "Store submit",
      domainId: "domain.store",
      actionClass: "release",
      protectedCategory: "release",
      outputPaths: ["store/submission.json"],
      idempotent: false,
      ...shared(),
    },
    {
      id: "workflow.eng-wipe",
      title: "Engineering wipe",
      domainId: "domain.engineering",
      actionClass: "destructive",
      protectedCategory: "destructive",
      outputPaths: ["engineering/wipe.log"],
      idempotent: false,
      ...shared(),
    },
    {
      id: "workflow.trust-rotate",
      title: "Trust rotate",
      domainId: "domain.trust",
      actionClass: "mutate",
      protectedCategory: "credentials_access",
      outputPaths: ["trust/rotate.log"],
      idempotent: true,
      ...shared(),
    },
    {
      id: "workflow.trust-audit",
      title: "Trust audit",
      domainId: "domain.trust",
      actionClass: "observe",
      outputPaths: ["trust/audit.log"],
      idempotent: true,
      ...shared(),
    },
    {
      id: "workflow.growth-post",
      title: "Growth post",
      domainId: "domain.growth",
      actionClass: "publish",
      protectedCategory: "public_actions",
      outputPaths: ["growth/post.md"],
      idempotent: false,
      ...shared(),
    },
  ];
}

function testCatalog(): CatalogInput {
  return { version: "catalog.boundary-test.1", artifacts: testArtifacts(), workflows: testWorkflows() };
}

function fullGrantsAndWaivers() {
  const grants = makeGrants([
    ["domain.research", "review-first"],
    ["domain.money", "full"],
    ["domain.store", "full"],
    ["domain.engineering", "full"],
    ["domain.trust", "run-with-guardrails", [verifiedProbe("doppler.trust", "doppler_auth")]],
    ["domain.growth", "full"],
  ]);
  const waivers = [
    makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend" }),
    makeWaiver({ domainId: "domain.store", actionClass: "release", protectedCategory: "release" }),
    makeWaiver({ domainId: "domain.engineering", actionClass: "destructive", protectedCategory: "destructive" }),
    makeWaiver({ domainId: "domain.trust", actionClass: "mutate", protectedCategory: "credentials_access" }),
    makeWaiver({ domainId: "domain.growth", actionClass: "publish", protectedCategory: "public_actions" }),
  ];
  const ledger = makeLedger([makeBalance("Revenue", "2026-08", 1_000)]);
  return { grants, waivers, ledger };
}

const nodeId = (slug: string): RunNodeId => `run.${slug}` as RunNodeId;

export function register(harness: Harness): void {
  harness.check("end-to-end: fully granted + fully waived catalog reaches the frontier as ready, with envelope evidence on protected nodes", () => {
    const plan = compilePlan(testCatalog(), NOW);
    const businessState = baseBusinessState();
    const run = seedRunState(plan, businessState, { ownerSessionId: "session-1", ttlSeconds: 600, wallClockCapSeconds: 3600, now: NOW });
    const { grants, waivers, ledger } = fullGrantsAndWaivers();
    const verified: PrerequisiteVerifier = () => ({ status: "verified", verifiedAt: NOW, detail: "fixture verified" });
    const evaluator = createAutonomyEvaluator({ grants, waivers, ledger, prerequisiteVerifier: verified, now: () => NOW });

    const result = computeFrontier(plan, run, businessState, evaluator);
    const allIds = plan.nodes.map((n) => n.id);
    for (const id of allIds) {
      assert(result.ready.includes(id), `expected ${id} to be ready when fully granted and waived, parked: ${JSON.stringify(result.parked)}`);
      assert(run.nodes[id]!.status === "ready", `expected run state status ready for ${id}, got ${run.nodes[id]!.status}`);
    }

    const revenueNode = plan.nodes.find((n) => n.id === nodeId("revenue-report"))!;
    const revenueDecision: AutonomyDecisionDetail = evaluator.evaluate(revenueNode);
    assert(revenueDecision.allowed, "expected the spend node's direct decision to be allowed");
    assert(revenueDecision.waiverId, "an executed protected action should carry the waiver id it executed under");
    assert(revenueDecision.evidenceRefs.length > 0, "an executed protected action should carry envelope evidence refs");
    assert(revenueDecision.remainingBudget === 1_000, `expected remainingBudget evidence of 1000, got ${revenueDecision.remainingBudget}`);
    assert(revenueDecision.estimateAmount === 250 && revenueDecision.estimateCurrency === "USD", "budget evidence should carry the declared estimate");

    const researchNode = plan.nodes.find((n) => n.id === nodeId("research-scan"))!;
    const researchDecision = evaluator.evaluate(researchNode);
    assert(
      researchDecision.allowed && researchDecision.evidenceRefs.length === 0,
      "an unprotected node executes on grant alone, with no waiver evidence to carry",
    );
  });

  harness.check("end-to-end: a lapsed domain.trust prerequisite parks every node depending on that grant, not just one", () => {
    const plan = compilePlan(testCatalog(), NOW);
    const businessState = baseBusinessState();
    const run = seedRunState(plan, businessState, { ownerSessionId: "session-1", ttlSeconds: 600, wallClockCapSeconds: 3600, now: NOW });
    const { grants, waivers, ledger } = fullGrantsAndWaivers();
    const lapsed: PrerequisiteVerifier = (probe) =>
      probe.id === "doppler.trust" ? { status: "lapsed", detail: "doppler run smoke failed" } : { status: "verified", verifiedAt: NOW, detail: "ok" };
    const evaluator = createAutonomyEvaluator({ grants, waivers, ledger, prerequisiteVerifier: lapsed, now: () => NOW });

    const result = computeFrontier(plan, run, businessState, evaluator);

    const trustRotate = nodeId("trust-rotate");
    const trustAudit = nodeId("trust-audit");
    assert(!result.ready.includes(trustRotate), "trust-rotate (protected) must park when its domain's prerequisite lapses");
    assert(
      !result.ready.includes(trustAudit),
      "trust-audit (unprotected, same domain) must ALSO park — the lapse blocks the whole grant, not just the failing node",
    );
    assert(
      run.nodes[trustRotate]!.status === "blocked" && (run.nodes[trustRotate]!.blocker ?? "").includes("lapsed"),
      "trust-rotate should record a lapsed-prerequisite blocker",
    );
    assert(
      run.nodes[trustAudit]!.status === "blocked" && (run.nodes[trustAudit]!.blocker ?? "").includes("lapsed"),
      "trust-audit should record a lapsed-prerequisite blocker",
    );
    assert(
      result.parked.some((p) => p.nodeId === trustRotate) && result.parked.some((p) => p.nodeId === trustAudit),
      "both domain.trust nodes should appear in the parked list",
    );

    // Every other domain is unaffected by the trust-domain lapse.
    for (const slug of ["research-scan", "revenue-report", "store-submit", "eng-wipe", "growth-post"]) {
      assert(result.ready.includes(nodeId(slug)), `expected ${slug} (unrelated domain) to remain ready despite the trust-domain lapse`);
    }
  });

  harness.check("end-to-end: a missing waiver parks only the affected protected node; unrelated nodes are unaffected", () => {
    const plan = compilePlan(testCatalog(), NOW);
    const businessState = baseBusinessState();
    const run = seedRunState(plan, businessState, { ownerSessionId: "session-1", ttlSeconds: 600, wallClockCapSeconds: 3600, now: NOW });
    const { grants, waivers, ledger } = fullGrantsAndWaivers();
    const withoutGrowthWaiver = waivers.filter((w) => w.domainId !== "domain.growth");
    const verified: PrerequisiteVerifier = () => ({ status: "verified", verifiedAt: NOW, detail: "ok" });
    const evaluator = createAutonomyEvaluator({ grants, waivers: withoutGrowthWaiver, ledger, prerequisiteVerifier: verified, now: () => NOW });

    const result = computeFrontier(plan, run, businessState, evaluator);
    const growthPost = nodeId("growth-post");
    assert(!result.ready.includes(growthPost), "growth-post should park without its waiver");
    assert(
      run.nodes[growthPost]!.status === "blocked" && (run.nodes[growthPost]!.blocker ?? "").includes("waiver"),
      "growth-post's blocker should name the missing waiver",
    );
    for (const slug of ["research-scan", "revenue-report", "store-submit", "eng-wipe", "trust-rotate", "trust-audit"]) {
      assert(result.ready.includes(nodeId(slug)), `expected ${slug} to remain ready — a missing waiver for one domain must not park unrelated domains`);
    }
  });

  harness.check("end-to-end: with no grants configured at all, every node parks fail closed (nothing defaults to allowed)", () => {
    const plan = compilePlan(testCatalog(), NOW);
    const businessState = baseBusinessState();
    const run = seedRunState(plan, businessState, { ownerSessionId: "session-1", ttlSeconds: 600, wallClockCapSeconds: 3600, now: NOW });
    const { waivers, ledger } = fullGrantsAndWaivers();
    const verified: PrerequisiteVerifier = () => ({ status: "verified", verifiedAt: NOW, detail: "ok" });
    // Deliberately empty grants map: nothing has been founder-granted at all.
    const evaluator = createAutonomyEvaluator({ grants: {}, waivers, ledger, prerequisiteVerifier: verified, now: () => NOW });

    const result = computeFrontier(plan, run, businessState, evaluator);
    assert(result.ready.length === 0, `expected zero ready nodes with no grants configured at all, got: ${JSON.stringify(result.ready)}`);
    assert(result.parked.length === plan.nodes.length, "every node should park when no domain has been granted");
  });
}
