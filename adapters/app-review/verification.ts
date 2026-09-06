import type { AppReviewRemediation, AppReviewVerificationRecord } from "./types.js";

export function normalizeAppReviewSessionId(sessionId: string): string {
  return sessionId.trim();
}

export function verificationSessionsAreIndependent(producerSessionId: string, verifierSessionId: string): boolean {
  const producer = normalizeAppReviewSessionId(producerSessionId);
  const verifier = normalizeAppReviewSessionId(verifierSessionId);
  return producer.length > 0 && verifier.length > 0 && producer !== verifier;
}

export function recordedProducerMatchesClaim(storedProducerSessionId: string | undefined, claimedProducerSessionId: string): boolean {
  const stored = storedProducerSessionId ? normalizeAppReviewSessionId(storedProducerSessionId) : "";
  const claimed = normalizeAppReviewSessionId(claimedProducerSessionId);
  return stored.length > 0 && claimed.length > 0 && stored === claimed;
}

export function remediationCanAcceptVerification(remediation: AppReviewRemediation): boolean {
  if (remediation.plan.disposition === "park") return false;
  if (remediation.status !== "applied" && remediation.status !== "verification_rejected") return false;
  if (remediation.plan.route === "new_binary" && !remediation.archive) return false;
  if (remediation.plan.route === "same_build_metadata") {
    const preflight = remediation.metadataPreflight;
    if (!preflight || !preflight.validatePassed || !preflight.dryRunPassed) return false;
  }
  return Boolean(remediation.consumer?.producerSessionId);
}

export function buildVerificationRecord(input: {
  readonly producerSessionId: string;
  readonly verifierSessionId: string;
  readonly accepted: boolean;
  readonly recordedAt: string;
}): AppReviewVerificationRecord {
  return {
    producerSessionId: normalizeAppReviewSessionId(input.producerSessionId),
    verifierSessionId: normalizeAppReviewSessionId(input.verifierSessionId),
    accepted: input.accepted,
    recordedAt: input.recordedAt,
  };
}
