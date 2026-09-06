import { evaluateGuard } from "../../../catalog/principles/guards.js";
import { loadPrinciples } from "../../../catalog/principles/load.js";
import { capsuleBytes, compileContext } from "../../../kernel/context/compile.js";
import { ContextCompileError } from "../../../kernel/context/receipt.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import { decisionBytes, resolveRoute } from "../../../kernel/routing/resolve.js";
import type { KnowledgeSection, RouteCandidate, RouteRequest } from "../../../kernel/routing/types.js";
import { evaluateRoutingGoldens } from "../goldens/routing/evaluate.js";
import { GOLDEN_CASES } from "../goldens/routing/v1/corpus.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = current;
  }
  return copy;
}

function paidConversion(): (typeof GOLDEN_CASES)[number] {
  const item = GOLDEN_CASES.find((entry) => entry.id === "paid-conversion-gap");
  assert(item !== undefined, "paid-conversion golden is missing");
  return item;
}

function catchContext(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof ContextCompileError) return error.code;
    throw error;
  }
  throw new Error("expected context compile to fail");
}

function fixtureCatalog(): CatalogInput {
  return {
    version: "catalog.routing.fixture",
    artifacts: [],
    workflows: [
      {
        id: "workflow.fixture.paywall-copy",
        title: "Rewrite paywall",
        domainId: "domain.growth",
        actionClass: "draft",
        instructions: "Rewrite the paywall.",
        reads: [],
        consults: [],
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
        outputPaths: [],
        providerIds: [],
        laneIds: ["paid_user_acquisition"],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

export function register(harness: Harness): void {
  harness.check("routing: golden evaluation meets registered precision, recall, and outcome thresholds", () => {
    const evaluation = evaluateRoutingGoldens();
    assert(evaluation.thresholds.minPrecision === 1, "goldens must declare a fail threshold");
    assert(evaluation.failures.length === 0, evaluation.failures.join("; "));
    assert(evaluation.precision >= evaluation.thresholds.minPrecision, `precision ${evaluation.precision}`);
    assert(evaluation.recall >= evaluation.thresholds.minRecall, `recall ${evaluation.recall}`);
  });

  harness.check("routing: paid-conversion gap selects the eligible workflow and exact knowledge sections", () => {
    const item = paidConversion();
    const decision = resolveRoute(item.request, item.candidates);
    assert(decision.outcome === "selected", `expected selected, got ${decision.outcome}`);
    assert(decision.selectedId === "workflow.fixture.paywall-copy", `selected ${decision.selectedId}`);
    assert(
      decision.exclusions.some((entry) => entry.candidateId === "workflow.fixture.unrelated-high-score" && entry.stage === "authority"),
      "high-scoring ineligible workflow must stay excluded",
    );
    assert(decision.scores["workflow.fixture.unrelated-high-score"] === 0.99, "excluded candidate score must still be recorded");
    assert(decision.eligibleIds.includes("workflow.fixture.unrelated-high-score") === false, "ranking must not revive an ineligible candidate");
    assert(
      decision.signals.some((signal) => signal.id === "signal.recall_ignored" && signal.value === "workflow.invented-by-recall"),
      "advisory recall cannot create a candidate",
    );
    assert(decision.precedent.matchedFacts.join(",") === "fact.paywall-copy,fact.paywall-cvr", "precedent must record matched facts");
    const selected = item.candidates.find((candidate) => candidate.id === decision.selectedId)!;
    const capsule = compileContext({
      request: item.request,
      decision,
      sections: selected.knowledgeSections,
      liveRevisions: item.liveRevisions,
    });
    assert(capsule.sections.map((section) => section.sectionId).join(",") === "knowledge.paywall.evidence", "capsule must pin exact sections");
    assert(capsule.sourceIds.join(",") === "knowledge/growth/paywall.md#knowledge.paywall.evidence@rev-paywall-1", "capsule must pin exact source IDs");
    assert(capsule.exclusions.length === 0, "happy-path capsule must not silently drop sections");
  });

  harness.check("routing: equal candidates inside the ambiguity band return ambiguous with no selected route", () => {
    const item = GOLDEN_CASES.find((entry) => entry.id === "ambiguous-pair")!;
    const decision = resolveRoute(item.request, item.candidates);
    assert(decision.outcome === "ambiguous", `expected ambiguous, got ${decision.outcome}`);
    assert(decision.selectedId === undefined, "ambiguous must not select a default");
    assert(decision.eligibleIds.length === 2, "both candidates remain eligible");
    assert(decision.resolutionAction === "policy_or_bounded_experiment", "ambiguity resolution must stay explicit");
  });

  harness.check("routing: a dominated candidate outside the ambiguity band is not an ambiguous peer", () => {
    const item = GOLDEN_CASES.find((entry) => entry.id === "ambiguous-pair")!;
    const dominated = { ...item.candidates[0]!, id: "workflow.fixture.paywall-dominated", score: 0.1 };
    const decision = resolveRoute(item.request, [...item.candidates, dominated]);
    assert(decision.outcome === "ambiguous", `expected ambiguous, got ${decision.outcome}`);
    assert(!decision.eligibleIds.includes(dominated.id), "dominated scores must not enter the ambiguous set");
    assert(decision.eligibleIds.length === 2, "only in-band peers remain eligible for the ambiguous outcome");
  });

  harness.check("routing: evidence, capability, guardrail, and resource failures exclude before rank", () => {
    const item = paidConversion();
    const base = item.candidates.find((candidate) => candidate.id === "workflow.fixture.paywall-copy")!;
    const cases: Array<{ patch: Partial<typeof base>; stage: string }> = [
      { patch: { evidenceSufficient: false }, stage: "evidence" },
      { patch: { capabilityOk: false }, stage: "capability" },
      { patch: { guardrailsOk: false }, stage: "guardrails" },
      { patch: { resourcesOk: false }, stage: "resources" },
    ];
    for (const entry of cases) {
      const decision = resolveRoute(item.request, [{ ...base, ...entry.patch }]);
      assert(decision.exclusions[0]?.stage === entry.stage, `${entry.stage} must be the exclusion stage, got ${decision.exclusions[0]?.stage}`);
      assert(decision.outcome !== "selected", `${entry.stage} must not select a route`);
    }
  });

  harness.check("routing: recognized problems without a definition return coverage_gap; unrecognized return no_match", () => {
    const gap = resolveRoute(
      GOLDEN_CASES.find((entry) => entry.id === "coverage-gap-no-definition")!.request,
      GOLDEN_CASES.find((entry) => entry.id === "coverage-gap-no-definition")!.candidates,
    );
    const unknown = resolveRoute(GOLDEN_CASES.find((entry) => entry.id === "no-match-unrecognized")!.request, []);
    assert(gap.outcome === "coverage_gap", `expected coverage_gap, got ${gap.outcome}`);
    assert(
      gap.resolutionAction === "no_eligible_candidate" || gap.resolutionAction === "preserve_unmet_contract",
      `coverage_gap action ${gap.resolutionAction}`,
    );
    assert(unknown.outcome === "no_match", `expected no_match, got ${unknown.outcome}`);
  });

  harness.check("routing: missing authority returns blocked with the next resolution action", () => {
    const item = GOLDEN_CASES.find((entry) => entry.id === "blocked-authority")!;
    const decision = resolveRoute(item.request, item.candidates);
    assert(decision.outcome === "blocked", `expected blocked, got ${decision.outcome}`);
    assert(decision.resolutionAction === "close_authority_or_capability_gap", `blocked action ${decision.resolutionAction}`);
    assert(decision.exclusions[0]?.stage === "authority", "blocked exclusion must name the failing stage");
  });

  harness.check("routing: shuffled facts, definitions, and candidates produce the same route and context bytes", () => {
    const item = paidConversion();
    const baselineDecision = resolveRoute(item.request, item.candidates);
    const selected = item.candidates.find((candidate) => candidate.id === baselineDecision.selectedId)!;
    const baselineCapsule = compileContext({
      request: item.request,
      decision: baselineDecision,
      sections: selected.knowledgeSections,
      liveRevisions: item.liveRevisions,
    });
    const expectedDecision = decisionBytes(baselineDecision);
    const expectedCapsule = capsuleBytes(baselineCapsule);
    for (const seed of [1, 7, 13, 99]) {
      const shuffledRequest: RouteRequest = {
        ...item.request,
        requiredFacts: shuffle(item.request.requiredFacts, seed),
        availableFacts: shuffle(item.request.availableFacts, seed + 1),
        recallProposedIds: shuffle(item.request.recallProposedIds ?? [], seed + 2),
      };
      const shuffledCandidates: RouteCandidate[] = shuffle(item.candidates, seed + 3).map((candidate) => ({
        ...candidate,
        knowledgeSections: shuffle(candidate.knowledgeSections, seed + 4) as KnowledgeSection[],
      }));
      const decision = resolveRoute(shuffledRequest, shuffledCandidates);
      const capsule = compileContext({
        request: shuffledRequest,
        decision,
        sections: shuffle(selected.knowledgeSections, seed + 5),
        liveRevisions: item.liveRevisions,
      });
      assert(decisionBytes(decision) === expectedDecision, `decision bytes drifted at seed ${seed}`);
      assert(capsuleBytes(capsule) === expectedCapsule, `capsule bytes drifted at seed ${seed}`);
    }
  });

  harness.check("context: unresolved section, stale revision, budget overflow, and forbidden domain fail explicitly", () => {
    const item = paidConversion();
    const decision = resolveRoute(item.request, item.candidates);
    const selected = item.candidates.find((candidate) => candidate.id === decision.selectedId)!;
    const section = selected.knowledgeSections[0]!;
    assert(
      catchContext(() =>
        compileContext({
          request: item.request,
          decision,
          sections: [{ ...section, sectionId: "   " }],
          liveRevisions: item.liveRevisions,
        }),
      ) === "context.unresolved_section",
      "blank section id must fail",
    );
    assert(
      catchContext(() =>
        compileContext({
          request: item.request,
          decision,
          sections: [section],
          liveRevisions: { [section.sectionId]: "rev-other" },
        }),
      ) === "context.stale_revision",
      "stale revision must fail",
    );
    assert(
      catchContext(() =>
        compileContext({
          request: { ...item.request, forbiddenDomains: ["domain.growth"] },
          decision,
          sections: [section],
          liveRevisions: item.liveRevisions,
        }),
      ) === "context.forbidden_domain",
      "forbidden domain must fail",
    );
    assert(
      catchContext(() =>
        compileContext({
          request: item.request,
          decision,
          sections: [section],
          liveRevisions: item.liveRevisions,
          budget: { maxBytes: 1, maxTokens: 1 },
        }),
      ) === "context.budget_overflow",
      "over-budget context must fail instead of silent drop",
    );
    const overflowed = compileContext({
      request: item.request,
      decision,
      sections: [
        section,
        {
          ...section,
          sectionId: "knowledge.paywall.extra",
          path: "knowledge/growth/paywall-extra.md",
          text: "Extra overflow section that should be recorded.",
        },
      ],
      liveRevisions: { ...item.liveRevisions, "knowledge.paywall.extra": "rev-paywall-1" },
      budget: { maxBytes: 80, maxTokens: 8000 },
    });
    assert(overflowed.overflow.length > 0, "overflow must be recorded on the capsule");
    assert(
      overflowed.exclusions.some((entry) => entry.reasonCode === "context.over_budget"),
      "overflow must appear as an exclusion",
    );
    assert(overflowed.sections.length > 0, "partial fit must keep included sections");
  });

  harness.check("context: compile refuses a non-selected route", () => {
    const item = GOLDEN_CASES.find((entry) => entry.id === "ambiguous-pair")!;
    const decision = resolveRoute(item.request, item.candidates);
    assert(
      catchContext(() => compileContext({ request: item.request, decision, sections: [], liveRevisions: {} })) === "context.route_unresolved",
      "context must compile only after a selected route",
    );
  });

  harness.check("context: a selected section without text or size measurements is refused", () => {
    const item = paidConversion();
    const decision = resolveRoute(item.request, item.candidates);
    const selected = item.candidates.find((candidate) => candidate.id === decision.selectedId)!;
    const section = selected.knowledgeSections[0]!;
    const unmeasured = { sectionId: section.sectionId, revision: section.revision, path: section.path, domain: section.domain };
    assert(
      catchContext(() =>
        compileContext({
          request: item.request,
          decision,
          sections: [unmeasured],
          liveRevisions: item.liveRevisions,
        }),
      ) === "context.unmeasured_section",
      "unmeasured section must fail closed",
    );
  });

  harness.check("routing: node brief carries compiled context selectors without changing the default brief", () => {
    const plan = compilePlan(fixtureCatalog(), "2026-08-22T20:00:00.000Z");
    const node = plan.nodes[0]!;
    const defaultBrief = composeNodeBrief(node, plan);
    assert(!defaultBrief.contextSelectors?.length, "default brief must not invent context selectors");
    assert(defaultBrief.load[0]?.sectionId === "knowledge.paywall.evidence", "catalog section ids must reach the brief");
    const item = paidConversion();
    const decision = resolveRoute(item.request, item.candidates);
    const selected = item.candidates.find((candidate) => candidate.id === decision.selectedId)!;
    const capsule = compileContext({
      request: item.request,
      decision,
      sections: selected.knowledgeSections,
      liveRevisions: item.liveRevisions,
    });
    const withCapsule = composeNodeBrief(node, plan, capsule);
    assert(withCapsule.contextSelectors?.join(",") === capsule.sourceIds.join(","), "brief selectors must match the capsule");
    assert(defaultBrief.load.length > withCapsule.load.length, "capsule must drop catalog knowledge that is not in the compiled sources");
    assert(
      withCapsule.load.every((entry) => capsule.sourceIds.some((sourceId) => sourceId.startsWith(`${entry.path}#`))),
      "brief load must stay inside the compiled capsule",
    );
  });

  harness.check("routing: golden evaluation without a threshold is a registered negative", () => {
    const registry = loadPrinciples(skillRoot);
    const principle = registry.principles.find((entry) => entry.id === "graph.prompt_router.golden_evaluation");
    assert(principle !== undefined, "golden evaluation principle is missing");
    const issues = evaluateGuard(principle, { golden: true, threshold: null });
    assert(
      issues.some((issue) => issue.code === "graph_foundations.prompt_router_golden_evaluation"),
      `expected golden-threshold issue, got ${issues.map((issue) => issue.code).join(",")}`,
    );
  });
}
