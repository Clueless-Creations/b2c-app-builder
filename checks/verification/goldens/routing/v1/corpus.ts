import type { KnowledgeSection, RouteCandidate, RouteOutcome, RouteRequest } from "../../../../../kernel/routing/types.js";

export interface GoldenCase {
  id: string;
  expectedOutcome: RouteOutcome;
  expectedSelectedId?: string;
  expectedSectionIds?: string[];
  compileContext: boolean;
  request: RouteRequest;
  candidates: RouteCandidate[];
  liveRevisions: Record<string, string>;
}

const CLOCK = "2026-08-22T20:00:00.000Z";
const POLICY = "policy.routing.v1";

function request(partial: Partial<RouteRequest> & Pick<RouteRequest, "id" | "kind" | "problem" | "recognized">): RouteRequest {
  return {
    requiredFacts: [],
    availableFacts: [],
    clock: CLOCK,
    policyRevision: POLICY,
    ambiguityBand: 0.05,
    ...partial,
  };
}

function section(partial: Pick<KnowledgeSection, "sectionId" | "revision" | "path"> & Partial<KnowledgeSection>): KnowledgeSection {
  return {
    text: partial.text ?? `Knowledge for ${partial.sectionId}.`,
    ...partial,
  };
}

function candidate(partial: Partial<RouteCandidate> & Pick<RouteCandidate, "id">): RouteCandidate {
  return {
    applicable: true,
    evidenceSufficient: true,
    authorityOk: true,
    capabilityOk: true,
    guardrailsOk: true,
    resourcesOk: true,
    score: 0.5,
    knowledgeSections: [],
    coversProblem: true,
    ...partial,
  };
}

const paywallSection = section({
  sectionId: "knowledge.paywall.evidence",
  revision: "rev-paywall-1",
  path: "knowledge/growth/paywall.md",
  domain: "domain.growth",
  text: "Paywall conversion is below the paid-conversion objective.",
});

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: "paid-conversion-gap",
    expectedOutcome: "selected",
    expectedSelectedId: "workflow.fixture.paywall-copy",
    expectedSectionIds: [paywallSection.sectionId],
    compileContext: true,
    request: request({
      id: "route.paid-conversion",
      kind: "metric_gap",
      problem: "Paid conversion is below the paywall objective",
      packId: "business-pack.consumer-app",
      requiredFacts: ["fact.paywall-cvr", "fact.paywall-copy"],
      availableFacts: ["fact.paywall-cvr", "fact.paywall-copy"],
      recognized: true,
      recallProposedIds: ["workflow.invented-by-recall"],
    }),
    candidates: [
      candidate({
        id: "workflow.fixture.unrelated-high-score",
        authorityOk: false,
        score: 0.99,
        knowledgeSections: [section({ sectionId: "knowledge.unrelated", revision: "rev-x", path: "knowledge/other.md" })],
      }),
      candidate({
        id: "workflow.fixture.paywall-copy",
        score: 0.72,
        packId: "capability.growth",
        knowledgeSections: [paywallSection],
      }),
    ],
    liveRevisions: { [paywallSection.sectionId]: paywallSection.revision },
  },
  {
    id: "ambiguous-pair",
    expectedOutcome: "ambiguous",
    compileContext: false,
    request: request({
      id: "route.ambiguous",
      kind: "founder_problem",
      problem: "Two eligible paywall experiments sit inside the band",
      recognized: true,
      requiredFacts: ["fact.paywall-cvr"],
      availableFacts: ["fact.paywall-cvr"],
    }),
    candidates: [candidate({ id: "workflow.fixture.paywall-a", score: 0.8 }), candidate({ id: "workflow.fixture.paywall-b", score: 0.78 })],
    liveRevisions: {},
  },
  {
    id: "coverage-gap-no-definition",
    expectedOutcome: "coverage_gap",
    compileContext: false,
    request: request({
      id: "route.coverage-gap",
      kind: "observation",
      problem: "Recognized retail packaging gap has no capability definition",
      recognized: true,
    }),
    candidates: [
      candidate({
        id: "workflow.fixture.unrelated-app-store",
        coversProblem: false,
        score: 0.9,
      }),
    ],
    liveRevisions: {},
  },
  {
    id: "no-match-unrecognized",
    expectedOutcome: "no_match",
    compileContext: false,
    request: request({
      id: "route.no-match",
      kind: "scheduled_review",
      problem: "Unrecognized free-form chat",
      recognized: false,
    }),
    candidates: [],
    liveRevisions: {},
  },
  {
    id: "blocked-authority",
    expectedOutcome: "blocked",
    compileContext: false,
    request: request({
      id: "route.blocked",
      kind: "metric_gap",
      problem: "Eligible paywall change lacks current authority",
      recognized: true,
      requiredFacts: ["fact.paywall-cvr"],
      availableFacts: ["fact.paywall-cvr"],
    }),
    candidates: [
      candidate({
        id: "workflow.fixture.paywall-mutate",
        authorityOk: false,
        score: 0.88,
      }),
    ],
    liveRevisions: {},
  },
];
