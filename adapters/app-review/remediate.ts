import { appendAppReviewEvent, projectAppReviewCase } from "./events.js";
import { inspectBinaryArchive } from "./archive.js";
import { applyConsumerPatches } from "./implement.js";
import {
  APP_REVIEW_REMEDIATE_WORKFLOW_ID,
  buildRemediationPlan,
  planFingerprint,
  remediationAttemptId,
  remediationOccurrenceId,
  remediationReady,
} from "./plan.js";
import { observeMandateIsLive } from "./mandate.js";
import { buildVerificationRecord, recordedProducerMatchesClaim, remediationCanAcceptVerification, verificationSessionsAreIndependent } from "./verification.js";
import type { AppReviewImplementationStatus, AppReviewMetadataPreflight, AppReviewRemediation, AppReviewState, ApplyAppReviewResult } from "./types.js";

function layersOf(state: AppReviewState) {
  return [
    state.currentCase.appVersion,
    ...(state.currentCase.reviewSubmission ? [state.currentCase.reviewSubmission] : []),
    ...state.currentCase.submissionItems,
  ];
}

function latestAgreement(state: AppReviewState) {
  return [...state.events].reverse().find((event) => event.kind === "observation")?.agreement ?? state.events.at(-1)?.agreement;
}

function withRemediation(
  state: AppReviewState,
  now: string,
  remediation: AppReviewRemediation,
  kind: "plan_recorded" | "implementation_applied" | "verification_recorded" | "archive_inspected" | "parked",
  status: AppReviewImplementationStatus,
): AppReviewState {
  const agreement = latestAgreement(state);
  if (!agreement) return state;
  const nextCase = projectAppReviewCase({
    mandateId: state.mandate.mandateId,
    caseId: state.currentCase.caseId,
    parentCaseId: state.currentCase.parentCaseId,
    cycleNumber: state.currentCase.cycleNumber,
    receipt: state.capabilityReceipt,
    layers: layersOf(state),
    agreement,
    lastEventId: state.currentCase.lastEventId,
    lastProviderTimestamp: state.currentCase.lastProviderTimestamp,
    authReadiness: state.currentCase.authReadiness,
    rejectionPacket: state.currentCase.rejectionPacket,
    classification: {
      ...state.currentCase.classification,
      implementationStatus: status,
    },
    remediation: { ...remediation, status },
    resubmission: state.currentCase.resubmission,
  });
  return appendAppReviewEvent({ ...state, updatedAt: now, currentCase: nextCase }, kind, now);
}

export function planAppReviewRemediation(state: AppReviewState, now: string, options?: { readonly workspaceRoot?: string }): ApplyAppReviewResult {
  if (!observeMandateIsLive(state.mandate, now) || !remediationReady(state, now)) {
    return { state, applied: false, reason: "refused" };
  }
  const existing = state.currentCase.remediation;
  const plan = buildRemediationPlan(state.currentCase.classification, state.mandate, state.currentCase.cycleNumber, {
    workspaceRoot: options?.workspaceRoot,
    previousBuildNumber: existing?.archive?.buildNumber,
  });
  if (existing && planFingerprint(existing.plan) === planFingerprint(plan) && existing.status !== "verification_rejected") {
    return { state, applied: false, reason: "duplicate_ignored" };
  }
  const reuseRejectedAttempt = existing?.status === "verification_rejected";
  const attemptNumber = reuseRejectedAttempt ? existing.occurrence.attemptNumber : 1;
  const occurrenceId = existing?.occurrence.occurrenceId ?? remediationOccurrenceId(state.mandate.mandateId, state.currentCase.cycleNumber);
  const attemptId = remediationAttemptId(state.mandate.mandateId, state.currentCase.cycleNumber, attemptNumber);
  const parked = plan.disposition === "park";
  const remediation: AppReviewRemediation = {
    status: parked ? "parked" : "planned",
    plan,
    occurrence: {
      workflowId: APP_REVIEW_REMEDIATE_WORKFLOW_ID,
      occurrenceId,
      attemptNumber,
      attemptIds: reuseRejectedAttempt ? [...existing.occurrence.attemptIds] : [...(existing?.occurrence.attemptIds ?? []), attemptId],
      status: parked ? "refused" : "authorized",
    },
  };
  const next = withRemediation(state, now, remediation, parked ? "parked" : "plan_recorded", parked ? "parked" : "planned");
  return { state: next, applied: true, reason: parked ? "parked" : "plan_recorded" };
}

export function applyAppReviewPlan(
  state: AppReviewState,
  now: string,
  options: {
    readonly workspaceRoot: string;
    readonly producerSessionId: string;
    readonly metadataPreflight?: AppReviewMetadataPreflight;
  },
): ApplyAppReviewResult {
  const remediation = state.currentCase.remediation;
  if (!remediation || remediation.plan.disposition !== "implement") {
    return { state, applied: false, reason: "refused" };
  }
  if (remediation.status !== "planned" && remediation.status !== "verification_rejected") {
    return { state, applied: false, reason: "refused" };
  }
  if (remediation.plan.route === "same_build_metadata") {
    const preflight = options.metadataPreflight;
    if (!preflight || !preflight.validatePassed || !preflight.dryRunPassed) {
      return { state, applied: false, reason: "refused" };
    }
  }
  let consumer;
  try {
    consumer = applyConsumerPatches(options.workspaceRoot, remediation.plan.patches, now, options.producerSessionId);
  } catch {
    return { state, applied: false, reason: "refused" };
  }
  const nextRemediation: AppReviewRemediation = {
    ...remediation,
    status: "applied",
    consumer,
    ...(options.metadataPreflight ? { metadataPreflight: options.metadataPreflight } : {}),
    occurrence: { ...remediation.occurrence, status: "running" },
  };
  return {
    state: withRemediation(state, now, nextRemediation, "implementation_applied", "applied"),
    applied: true,
    reason: "implementation_applied",
  };
}

export function inspectAppReviewArchive(
  state: AppReviewState,
  now: string,
  options: { readonly workspaceRoot: string; readonly archiveRelativePath: string },
): ApplyAppReviewResult {
  const remediation = state.currentCase.remediation;
  if (!remediation || remediation.plan.route !== "new_binary" || remediation.status !== "applied") {
    return { state, applied: false, reason: "refused" };
  }
  let archive;
  try {
    archive = inspectBinaryArchive({
      workspaceRoot: options.workspaceRoot,
      archiveRelativePath: options.archiveRelativePath,
      inspectedAt: now,
      previousSha256: remediation.archive?.infoPlistSha256,
    });
  } catch {
    return { state, applied: false, reason: "refused" };
  }
  if (archive.bundleId !== state.mandate.bundleId) {
    return { state, applied: false, reason: "refused" };
  }
  const nextRemediation: AppReviewRemediation = { ...remediation, archive };
  return {
    state: withRemediation(state, now, nextRemediation, "archive_inspected", "applied"),
    applied: true,
    reason: "archive_inspected",
  };
}

export function recordAppReviewVerification(
  state: AppReviewState,
  now: string,
  input: { readonly producerSessionId: string; readonly verifierSessionId: string; readonly accepted: boolean },
): ApplyAppReviewResult {
  const remediation = state.currentCase.remediation;
  if (!remediation) return { state, applied: false, reason: "refused" };
  const storedProducer = remediation.consumer?.producerSessionId;
  if (!storedProducer || !recordedProducerMatchesClaim(storedProducer, input.producerSessionId)) {
    return { state, applied: false, reason: "refused" };
  }
  if (!verificationSessionsAreIndependent(storedProducer, input.verifierSessionId)) {
    return { state, applied: false, reason: "refused" };
  }
  const verification = buildVerificationRecord({
    producerSessionId: storedProducer,
    verifierSessionId: input.verifierSessionId,
    accepted: input.accepted,
    recordedAt: now,
  });
  if (input.accepted) {
    if (!remediationCanAcceptVerification(remediation)) {
      return { state, applied: false, reason: "refused" };
    }
    const nextRemediation: AppReviewRemediation = {
      ...remediation,
      status: "verified",
      verification,
      occurrence: { ...remediation.occurrence, status: "proved" },
    };
    return {
      state: withRemediation(state, now, nextRemediation, "verification_recorded", "verified"),
      applied: true,
      reason: "verification_recorded",
    };
  }
  const nextAttemptNumber = remediation.occurrence.attemptNumber + 1;
  const nextAttemptId = remediationAttemptId(state.mandate.mandateId, state.currentCase.cycleNumber, nextAttemptNumber);
  const nextRemediation: AppReviewRemediation = {
    ...remediation,
    status: "verification_rejected",
    verification,
    occurrence: {
      ...remediation.occurrence,
      attemptNumber: nextAttemptNumber,
      attemptIds: [...remediation.occurrence.attemptIds, nextAttemptId],
      status: "authorized",
    },
  };
  return {
    state: withRemediation(state, now, nextRemediation, "verification_recorded", "verification_rejected"),
    applied: true,
    reason: "verification_recorded",
  };
}
