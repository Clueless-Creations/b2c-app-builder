import { applyEligibility } from "./eligibility.js";
import { rankEligible } from "./rank.js";
import { collectRouteSignals, precedentTransfer } from "./signals.js";
import type { RouteCandidate, RouteDecision, RouteRequest } from "./types.js";

function scoreMap(candidates: readonly RouteCandidate[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const candidate of [...candidates].sort((left, right) => left.id.localeCompare(right.id))) {
    scores[candidate.id] = candidate.score;
  }
  return scores;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const nested = (value as Record<string, unknown>)[key];
      if (nested === undefined) continue;
      out[key] = canonicalize(nested);
    }
    return out;
  }
  return value;
}

export function resolveRoute(request: RouteRequest, candidates: readonly RouteCandidate[]): RouteDecision {
  const knownIds = new Set(candidates.map((candidate) => candidate.id));
  const signals = collectRouteSignals(request, knownIds);
  const precedent = precedentTransfer(request);
  const { eligible, exclusions } = applyEligibility(candidates);
  const { ordered, tied, tiedIds } = rankEligible(eligible, request.ambiguityBand);
  const scores = scoreMap(candidates);

  if (candidates.length === 0) {
    return {
      outcome: request.recognized ? "coverage_gap" : "no_match",
      eligibleIds: [],
      exclusions: [],
      scores: {},
      policyRevision: request.policyRevision,
      ambiguityBand: request.ambiguityBand,
      resolutionAction: request.recognized ? "preserve_unmet_contract" : "no_definition",
      signals,
      precedent,
    };
  }

  const blockedOnly =
    eligible.length === 0 &&
    exclusions.some((item) => item.stage === "authority" || item.stage === "capability" || item.stage === "guardrails" || item.stage === "resources");
  if (eligible.length === 0) {
    return {
      outcome: blockedOnly ? "blocked" : request.recognized ? "coverage_gap" : "no_match",
      eligibleIds: [],
      exclusions,
      scores,
      policyRevision: request.policyRevision,
      ambiguityBand: request.ambiguityBand,
      resolutionAction: blockedOnly ? "close_authority_or_capability_gap" : "no_eligible_candidate",
      signals,
      precedent,
    };
  }

  if (tied) {
    return {
      outcome: "ambiguous",
      eligibleIds: tiedIds,
      exclusions,
      scores,
      policyRevision: request.policyRevision,
      ambiguityBand: request.ambiguityBand,
      resolutionAction: "policy_or_bounded_experiment",
      signals,
      precedent,
    };
  }

  return {
    outcome: "selected",
    selectedId: ordered[0]!.id,
    eligibleIds: ordered.map((candidate) => candidate.id),
    exclusions,
    scores,
    policyRevision: request.policyRevision,
    ambiguityBand: request.ambiguityBand,
    resolutionAction: "compile_context",
    signals,
    precedent,
  };
}

export function decisionBytes(decision: RouteDecision): string {
  return `${JSON.stringify(canonicalize(decision))}\n`;
}
