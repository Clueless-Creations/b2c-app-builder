import { eligibilityStages, type EligibilityStage, type RouteCandidate, type RouteExclusion } from "./types.js";

function stagePass(candidate: RouteCandidate, stage: EligibilityStage): boolean {
  switch (stage) {
    case "applicability":
      return candidate.applicable && candidate.coversProblem;
    case "evidence":
      return candidate.evidenceSufficient;
    case "authority":
      return candidate.authorityOk;
    case "capability":
      return candidate.capabilityOk;
    case "guardrails":
      return candidate.guardrailsOk;
    case "resources":
      return candidate.resourcesOk;
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

function stageReason(stage: EligibilityStage): string {
  switch (stage) {
    case "applicability":
      return "routing.inapplicable";
    case "evidence":
      return "routing.evidence_insufficient";
    case "authority":
      return "routing.authority_blocked";
    case "capability":
      return "routing.capability_blocked";
    case "guardrails":
      return "routing.guardrail_blocked";
    case "resources":
      return "routing.resource_blocked";
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

export interface EligibilityResult {
  eligible: RouteCandidate[];
  exclusions: RouteExclusion[];
}

export function applyEligibility(candidates: readonly RouteCandidate[]): EligibilityResult {
  const exclusions: RouteExclusion[] = [];
  const eligible: RouteCandidate[] = [];
  for (const candidate of candidates) {
    let blocked: EligibilityStage | undefined;
    for (const stage of eligibilityStages) {
      if (!stagePass(candidate, stage)) {
        blocked = stage;
        break;
      }
    }
    if (blocked) {
      exclusions.push({ candidateId: candidate.id, stage: blocked, reasonCode: stageReason(blocked) });
      continue;
    }
    eligible.push(candidate);
  }
  return {
    eligible: [...eligible].sort((left, right) => left.id.localeCompare(right.id)),
    exclusions: [...exclusions].sort((left, right) => left.candidateId.localeCompare(right.candidateId) || left.stage.localeCompare(right.stage)),
  };
}
