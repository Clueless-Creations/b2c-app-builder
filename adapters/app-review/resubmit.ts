import { createHash } from "node:crypto";

import { containsSecretMaterial } from "./auth.js";
import { appendAppReviewEvent, projectAppReviewCase } from "./events.js";
import { isProtectedAppReviewKind } from "./plan.js";
import { commandIsAlwaysForbiddenForAppReview, forbiddenAppReviewCommandsForMode, observeMandateIsLive } from "./mandate.js";
import {
  APP_REVIEW_RESUBMIT_DEFAULT_MAX_CYCLES,
  APP_REVIEW_RESUBMIT_DEFAULT_TIMEOUT_MS,
  APP_REVIEW_RESUBMIT_WORKFLOW_ID,
  type AppReviewLayerObservation,
  type AppReviewRemediationRoute,
  type AppReviewResubmitEnvelope,
  type AppReviewResubmission,
  type AppReviewResubmissionStatus,
  type AppReviewState,
  type ApplyAppReviewResult,
} from "./types.js";

export interface AuthorizeAppReviewResubmitInput {
  readonly alreadyUploaded: boolean;
  readonly authorizedAt: string;
  readonly authorizedBy: string;
  readonly maxCycles?: number;
  readonly appStoreVersionId?: string;
}

function layersOf(state: AppReviewState): readonly AppReviewLayerObservation[] {
  return [
    state.currentCase.appVersion,
    ...(state.currentCase.reviewSubmission ? [state.currentCase.reviewSubmission] : []),
    ...state.currentCase.submissionItems,
  ];
}

function latestAgreement(state: AppReviewState) {
  return [...state.events].reverse().find((event) => event.kind === "observation")?.agreement ?? state.events.at(-1)?.agreement;
}

function withResubmission(
  state: AppReviewState,
  now: string,
  resubmission: AppReviewResubmission,
  kind: "resubmit_authorized" | "resubmit_recorded" | "resubmit_timeout_readback" | "cycle_exhausted" | "review_accepted",
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
    classification: state.currentCase.classification,
    remediation: state.currentCase.remediation,
    resubmission,
  });
  return appendAppReviewEvent({ ...state, updatedAt: now, currentCase: nextCase }, kind, now);
}

function envelopeFingerprintPayload(envelope: AppReviewResubmitEnvelope): Record<keyof AppReviewResubmitEnvelope, unknown> {
  return {
    appId: envelope.appId,
    appStoreVersionId: envelope.appStoreVersionId,
    marketingVersion: envelope.marketingVersion,
    maxCycles: envelope.maxCycles,
    alreadyUploaded: envelope.alreadyUploaded,
    confirm: envelope.confirm,
    authorizedAt: envelope.authorizedAt,
    authorizedBy: envelope.authorizedBy,
  };
}

export function envelopeFingerprint(envelope: AppReviewResubmitEnvelope): string {
  return createHash("sha256").update(JSON.stringify(envelopeFingerprintPayload(envelope))).digest("hex");
}

export function buildResubmitCommand(envelope: AppReviewResubmitEnvelope): string {
  return `asc review submit --app ${envelope.appId} --version-id ${envelope.appStoreVersionId} --confirm`;
}

export function resubmitOccurrenceId(mandateId: string, cycleNumber: number): string {
  return `occurrence.app-review.resubmit.${mandateId}.${cycleNumber}`;
}

export function resubmitRouteIsEligible(route: AppReviewRemediationRoute): boolean {
  switch (route) {
    case "same_build_metadata":
    case "new_binary":
    case "review_notes":
      return true;
    case "none":
    case "review_access":
    case "parked":
      return false;
    default: {
      const exhaustive: never = route;
      throw new Error(`Unhandled App Review remediation route ${String(exhaustive)}`);
    }
  }
}

export function resubmissionIsAwaitingProvider(status: AppReviewResubmissionStatus): boolean {
  switch (status) {
    case "awaiting_readback":
    case "submitted":
      return true;
    case "not_started":
    case "authorized":
    case "timed_out":
    case "accepted":
    case "rejected_again":
    case "exhausted":
    case "refused":
      return false;
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled App Review resubmission status ${String(exhaustive)}`);
    }
  }
}

function envelopeMatchesState(state: AppReviewState, envelope: AppReviewResubmitEnvelope): boolean {
  const versionId = state.currentCase.appVersion.providerObjectId;
  return (
    envelope.appId === state.mandate.appId &&
    envelope.marketingVersion === state.mandate.marketingVersion &&
    envelope.appStoreVersionId === versionId &&
    envelope.confirm === true &&
    envelope.maxCycles >= 1 &&
    envelope.authorizedBy.trim().length > 0
  );
}

function standingEnvelopeIsIntact(state: AppReviewState, envelope: AppReviewResubmitEnvelope): boolean {
  if (!envelopeMatchesState(state, envelope)) return false;
  const computed = envelopeFingerprint(envelope);
  const stored = state.currentCase.resubmission;
  if (!stored || stored.envelopeFingerprint !== computed) return false;
  const mandateEnvelope = state.mandate.resubmitEnvelope;
  if (!mandateEnvelope) return false;
  return envelopeFingerprint(mandateEnvelope) === computed;
}

function resubmissionAllowsAuthorization(status: AppReviewResubmissionStatus | undefined): boolean {
  if (!status) return true;
  switch (status) {
    case "not_started":
    case "authorized":
    case "rejected_again":
    case "refused":
      return true;
    case "awaiting_readback":
    case "submitted":
    case "timed_out":
    case "accepted":
    case "exhausted":
      return false;
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled App Review resubmission status ${String(exhaustive)}`);
    }
  }
}

function currentCaseIsProviderAccepted(state: AppReviewState): boolean {
  switch (state.currentCase.appVersion.normalized) {
    case "ready_for_distribution":
    case "ready_for_sale":
    case "accepted":
    case "pending_developer_release":
      return true;
    default:
      return false;
  }
}

function remediationReadyForResubmit(state: AppReviewState): boolean {
  const remediation = state.currentCase.remediation;
  if (!remediation) return false;
  if (remediation.status !== "verified") return false;
  if (remediation.plan.disposition !== "implement") return false;
  if (isProtectedAppReviewKind(state.currentCase.classification.kind)) return false;
  if (!resubmitRouteIsEligible(remediation.plan.route)) return false;
  if (remediation.plan.route === "new_binary" && !remediation.archive) return false;
  return true;
}

export function authorizeAppReviewResubmit(state: AppReviewState, input: AuthorizeAppReviewResubmitInput): ApplyAppReviewResult {
  const now = input.authorizedAt;
  if (!observeMandateIsLive(state.mandate, now)) {
    return { state, applied: false, reason: "refused" };
  }
  if (!remediationReadyForResubmit(state)) {
    return { state, applied: false, reason: "refused" };
  }
  if (!resubmissionAllowsAuthorization(state.currentCase.resubmission?.status)) {
    return { state, applied: false, reason: "refused" };
  }
  const versionId = input.appStoreVersionId ?? state.currentCase.appVersion.providerObjectId;
  if (!versionId || versionId === "unobserved") {
    return { state, applied: false, reason: "refused" };
  }
  const maxCycles = input.maxCycles ?? APP_REVIEW_RESUBMIT_DEFAULT_MAX_CYCLES;
  if (!Number.isInteger(maxCycles) || maxCycles < 1) {
    return { state, applied: false, reason: "refused" };
  }
  if (state.currentCase.cycleNumber > maxCycles) {
    return { state, applied: false, reason: "refused" };
  }
  const authorizedBy = input.authorizedBy.trim();
  if (!authorizedBy || containsSecretMaterial(authorizedBy)) {
    return { state, applied: false, reason: "refused" };
  }
  const envelope: AppReviewResubmitEnvelope = {
    appId: state.mandate.appId,
    appStoreVersionId: versionId,
    marketingVersion: state.mandate.marketingVersion,
    maxCycles,
    alreadyUploaded: input.alreadyUploaded,
    confirm: true,
    authorizedAt: now,
    authorizedBy,
  };
  if (!envelopeMatchesState(state, envelope)) {
    return { state, applied: false, reason: "refused" };
  }
  const resubmission: AppReviewResubmission = {
    status: "authorized",
    envelope,
    envelopeFingerprint: envelopeFingerprint(envelope),
    occurrence: {
      workflowId: APP_REVIEW_RESUBMIT_WORKFLOW_ID,
      occurrenceId: resubmitOccurrenceId(state.mandate.mandateId, state.currentCase.cycleNumber),
      cycleNumber: state.currentCase.cycleNumber,
      status: "authorized",
    },
  };
  const nextMandate = {
    ...state.mandate,
    mode: "resubmit" as const,
    forbiddenCommands: [...forbiddenAppReviewCommandsForMode("resubmit")],
    maxCycles,
    resubmitEnvelope: envelope,
  };
  const next = withResubmission({ ...state, mandate: nextMandate }, now, resubmission, "resubmit_authorized");
  return { state: next, applied: true, reason: "resubmit_authorized" };
}

export function submitAppReview(state: AppReviewState, now: string, options?: { readonly timeoutMs?: number }): ApplyAppReviewResult {
  if (!observeMandateIsLive(state.mandate, now)) {
    return { state, applied: false, reason: "refused" };
  }
  if (state.mandate.mode !== "resubmit") {
    return { state, applied: false, reason: "refused" };
  }
  const existing = state.currentCase.resubmission;
  if (!existing || existing.status === "refused" || existing.status === "exhausted" || existing.status === "accepted") {
    return { state, applied: false, reason: "refused" };
  }
  if (!standingEnvelopeIsIntact(state, existing.envelope)) {
    return { state, applied: false, reason: "refused" };
  }
  if (!existing.envelope.alreadyUploaded) {
    return { state, applied: false, reason: "refused" };
  }
  if (!remediationReadyForResubmit(state)) {
    return { state, applied: false, reason: "refused" };
  }
  if (state.currentCase.cycleNumber > existing.envelope.maxCycles) {
    const exhausted: AppReviewResubmission = {
      ...existing,
      status: "exhausted",
      occurrence: { ...existing.occurrence, status: "exhausted" },
    };
    const next = withResubmission(state, now, exhausted, "cycle_exhausted");
    return { state: next, applied: true, reason: "cycle_exhausted" };
  }
  if (resubmissionIsAwaitingProvider(existing.status)) {
    const timeoutAt = existing.timeoutAt;
    const timeoutMs = Date.parse(timeoutAt ?? "");
    const nowMs = Date.parse(now);
    if (Number.isFinite(timeoutMs) && Number.isFinite(nowMs) && nowMs >= timeoutMs) {
      const timedOut: AppReviewResubmission = {
        ...existing,
        status: "timed_out",
        readbackAt: now,
      };
      const next = withResubmission(state, now, timedOut, "resubmit_timeout_readback");
      return { state: next, applied: true, reason: "resubmit_timeout_readback" };
    }
    return { state, applied: false, reason: "refused" };
  }
  if (existing.status === "timed_out") {
    return { state, applied: false, reason: "refused" };
  }
  const command = buildResubmitCommand(existing.envelope);
  if (commandIsAlwaysForbiddenForAppReview(command) || !command.includes("--confirm")) {
    return { state, applied: false, reason: "refused" };
  }
  const timeoutMs = options?.timeoutMs ?? APP_REVIEW_RESUBMIT_DEFAULT_TIMEOUT_MS;
  const nowMs = Date.parse(now);
  const timeoutAt = Number.isFinite(nowMs) ? new Date(nowMs + timeoutMs).toISOString() : now;
  const submitted: AppReviewResubmission = {
    ...existing,
    status: "awaiting_readback",
    command,
    submittedAt: now,
    timeoutAt,
    occurrence: { ...existing.occurrence, status: "running" },
  };
  const next = withResubmission(state, now, submitted, "resubmit_recorded");
  return { state: next, applied: true, reason: "resubmit_recorded" };
}

export function markAppReviewResubmitAccepted(state: AppReviewState, now: string): ApplyAppReviewResult {
  const existing = state.currentCase.resubmission;
  if (!existing || (!resubmissionIsAwaitingProvider(existing.status) && existing.status !== "timed_out")) {
    return { state, applied: false, reason: "refused" };
  }
  if (!currentCaseIsProviderAccepted(state)) {
    return { state, applied: false, reason: "refused" };
  }
  const accepted: AppReviewResubmission = {
    ...existing,
    status: "accepted",
    readbackAt: now,
    occurrence: { ...existing.occurrence, status: "proved" },
  };
  const next = withResubmission(state, now, accepted, "review_accepted");
  return { state: next, applied: true, reason: "review_accepted" };
}

export function markAppReviewCycleExhausted(state: AppReviewState, now: string): ApplyAppReviewResult {
  const existing = state.currentCase.resubmission;
  if (!existing) {
    return { state, applied: false, reason: "refused" };
  }
  const exhausted: AppReviewResubmission = {
    ...existing,
    status: "exhausted",
    readbackAt: now,
    occurrence: { ...existing.occurrence, status: "exhausted" },
  };
  const next = withResubmission(state, now, exhausted, "cycle_exhausted");
  return { state: next, applied: true, reason: "cycle_exhausted" };
}

export function maxCyclesFor(state: AppReviewState): number | undefined {
  return state.mandate.maxCycles ?? state.mandate.resubmitEnvelope?.maxCycles ?? state.currentCase.resubmission?.envelope.maxCycles;
}
