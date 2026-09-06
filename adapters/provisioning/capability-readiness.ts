import { evaluatePrerequisites, type SessionPrerequisiteCache } from "../../kernel/autonomy/prerequisites.js";
import type { Grant } from "../../kernel/schema/types.js";
import type { RequirementResolution } from "./resolve.js";

export interface IndependentVerification {
  readonly passed: boolean;
  readonly verifierPartyId: string;
  readonly producerPartyId: string;
}

export interface CapabilityReadiness {
  readonly ready: boolean;
  readonly reasonCode: string;
  readonly reason: string;
}

/**
 * Readiness is derived from existing grant probes and provisioning resolutions.
 * A completed acquisition workflow does not count until independent verification passes (A3).
 */
export function evaluateCapabilityReadiness(input: {
  grant?: Grant;
  cache?: SessionPrerequisiteCache;
  provisioning?: readonly RequirementResolution[];
  independentVerification?: IndependentVerification;
  acquisitionCompleted?: boolean;
}): CapabilityReadiness {
  if (input.grant && input.cache) {
    const prerequisites = evaluatePrerequisites(input.cache, input.grant);
    if (!prerequisites.ok) {
      return { ready: false, reasonCode: prerequisites.reasonCode, reason: prerequisites.reason };
    }
  }
  const missing = (input.provisioning ?? []).filter((item) => item.status !== "satisfied");
  if (missing.length > 0) {
    return {
      ready: false,
      reasonCode: "capability.requirement_unsatisfied",
      reason: `Capability requirement "${missing[0]!.name}" is ${missing[0]!.status}.`,
    };
  }
  if (input.acquisitionCompleted) {
    const verification = input.independentVerification;
    if (!verification || !verification.passed) {
      return {
        ready: false,
        reasonCode: "capability.verification_pending",
        reason: "Capability acquisition completed but independent verification has not passed.",
      };
    }
    if (verification.verifierPartyId === verification.producerPartyId) {
      return {
        ready: false,
        reasonCode: "capability.verifier_not_independent",
        reason: "Independent verification cannot use the same party as the producer.",
      };
    }
  }
  return { ready: true, reasonCode: "capability.ready", reason: "" };
}
