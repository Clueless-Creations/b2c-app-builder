export const routeOutcomes = ["selected", "ambiguous", "blocked", "no_match", "coverage_gap"] as const;
export type RouteOutcome = (typeof routeOutcomes)[number];

export const eligibilityStages = ["applicability", "evidence", "authority", "capability", "guardrails", "resources"] as const;
export type EligibilityStage = (typeof eligibilityStages)[number];

export const routeRequestKinds = ["metric_gap", "founder_problem", "observation", "scheduled_review"] as const;
export type RouteRequestKind = (typeof routeRequestKinds)[number];

export interface KnowledgeSection {
  sectionId: string;
  revision: string;
  path: string;
  domain?: string;
  bytes?: number;
  tokens?: number;
  text?: string;
}

export interface PrecedentTransfer {
  matchedFacts: string[];
  differentFacts: string[];
  evidenceStrength: "complete" | "partial" | "absent";
  transferLimits: string[];
}

export interface RouteRequest {
  id: string;
  kind: RouteRequestKind;
  problem: string;
  packId?: string;
  requiredFacts: string[];
  availableFacts: string[];
  forbiddenDomains?: string[];
  recognized: boolean;
  clock: string;
  policyRevision: string;
  ambiguityBand: number;
  /** Advisory recall only — unknown IDs cannot create candidates (R6, KTD7). */
  recallProposedIds?: string[];
}

export interface RouteCandidate {
  id: string;
  packId?: string;
  applicable: boolean;
  evidenceSufficient: boolean;
  authorityOk: boolean;
  capabilityOk: boolean;
  guardrailsOk: boolean;
  resourcesOk: boolean;
  score: number;
  knowledgeSections: KnowledgeSection[];
  coversProblem: boolean;
  /** Catalog domain the candidate would execute under. Absent: operate may use the pinned world tuple only when this id is that workflow. */
  domainId?: string;
  /** Catalog action class the candidate would execute under. Absent: same pin rule as domainId. */
  actionClass?: string;
}

export interface RouteExclusion {
  candidateId: string;
  stage: EligibilityStage;
  reasonCode: string;
}

export interface RouteSignal {
  id: string;
  kind: string;
  value: string;
}

export interface RouteDecision {
  outcome: RouteOutcome;
  selectedId?: string;
  eligibleIds: string[];
  exclusions: RouteExclusion[];
  scores: Record<string, number>;
  policyRevision: string;
  ambiguityBand: number;
  resolutionAction?: string;
  signals: RouteSignal[];
  precedent: PrecedentTransfer;
}
