import { createHash } from "node:crypto";

import { emptyAuthReadiness } from "./auth.js";
import { emptyWebhookIngress } from "./capability.js";
import { idleClassification } from "./classify.js";
import { caseStatusFor, deriveBlocker, observeLayer, normalizeAgreement } from "./normalize.js";
import {
  APP_REVIEW_SCHEMA_VERSION,
  type AppReviewAuthReadiness,
  type AppReviewCapabilityReceipt,
  type AppReviewCase,
  type AppReviewClassification,
  type AppReviewEvent,
  type AppReviewLayerObservation,
  type AppReviewMandate,
  type AppReviewRejectionPacket,
  type AppReviewRemediation,
  type AppReviewResubmission,
  type AppReviewSnapshot,
  type AppReviewState,
  type ApplyAppReviewResult,
} from "./types.js";

function snapshotFingerprint(snapshot: AppReviewSnapshot): string {
  const layers = [...snapshot.layers].map((layer) => `${layer.layer}:${layer.providerObjectId}:${layer.rawValue}`).sort();
  const body = JSON.stringify({
    layers,
    agreement: `${snapshot.agreement.rawStatus}:${snapshot.agreement.pending ? "1" : "0"}`,
  });
  return createHash("sha256").update(body).digest("hex");
}

function nextEventId(mandateId: string, count: number): string {
  return `event.app-review.${mandateId}.${count + 1}`;
}

function unobservedLayer(now: string, cliVersion: string): AppReviewLayerObservation {
  return observeLayer(
    {
      layer: "app_version",
      rawValue: "UNOBSERVED",
      providerObjectId: "unobserved",
      schemaId: "AppStoreVersion",
    },
    now,
    cliVersion,
  );
}

export function seedAppReviewState(mandate: AppReviewMandate, receipt: AppReviewCapabilityReceipt, now: string): AppReviewState {
  const agreement = normalizeAgreement({ rawStatus: "UNOBSERVED", pending: false });
  const appVersion = unobservedLayer(now, receipt.observedCliVersion);
  const layers = [appVersion];
  const authReadiness = emptyAuthReadiness(now, !receipt.failClosed);
  const classification = idleClassification();
  const blocker = deriveBlocker(receipt, layers, agreement, authReadiness);
  const seedEvent: AppReviewEvent = {
    eventId: nextEventId(mandate.mandateId, 0),
    mandateId: mandate.mandateId,
    kind: "capability_probe",
    providerTimestamp: now,
    recordedAt: now,
    snapshotFingerprint: snapshotFingerprint({
      providerTimestamp: now,
      layers: [
        {
          layer: "app_version",
          rawValue: "UNOBSERVED",
          providerObjectId: "unobserved",
          schemaId: "AppStoreVersion",
        },
      ],
      agreement: { rawStatus: "UNOBSERVED", pending: false },
    }),
    layers,
    agreement,
  };
  const currentCase: AppReviewCase = {
    caseId: `case.app-review.${mandate.mandateId}`,
    mandateId: mandate.mandateId,
    cycleNumber: 1,
    status: caseStatusFor(blocker),
    blocker,
    appVersion,
    submissionItems: [],
    lastEventId: seedEvent.eventId,
    lastProviderTimestamp: now,
    authReadiness,
    classification,
  };
  return {
    schemaVersion: APP_REVIEW_SCHEMA_VERSION,
    updatedAt: now,
    mandate,
    capabilityReceipt: receipt,
    events: [seedEvent],
    currentCase,
    webhookIngress: emptyWebhookIngress(),
  };
}

export function projectAppReviewCase(input: {
  readonly mandateId: string;
  readonly caseId: string;
  readonly parentCaseId?: string;
  readonly cycleNumber: number;
  readonly receipt: AppReviewCapabilityReceipt;
  readonly layers: readonly AppReviewLayerObservation[];
  readonly agreement: AppReviewEvent["agreement"];
  readonly lastEventId: string;
  readonly lastProviderTimestamp: string;
  readonly authReadiness: AppReviewAuthReadiness;
  readonly rejectionPacket?: AppReviewRejectionPacket;
  readonly classification: AppReviewClassification;
  readonly remediation?: AppReviewRemediation;
  readonly resubmission?: AppReviewResubmission;
}): AppReviewCase {
  const appVersion = input.layers.find((layer) => layer.layer === "app_version");
  if (!appVersion) {
    throw new Error("App Review observation is missing the app-version layer");
  }
  const blocker = deriveBlocker(input.receipt, input.layers, input.agreement, input.authReadiness, input.rejectionPacket);
  const reviewSubmission = input.layers.find((layer) => layer.layer === "review_submission");
  let status = caseStatusFor(blocker);
  if (input.resubmission?.status === "accepted" && blocker === "none") {
    status = "closed";
  }
  if (input.resubmission?.status === "exhausted") {
    status = "blocked";
  }
  return {
    caseId: input.caseId,
    mandateId: input.mandateId,
    ...(input.parentCaseId ? { parentCaseId: input.parentCaseId } : {}),
    cycleNumber: input.cycleNumber,
    status,
    blocker,
    appVersion,
    ...(reviewSubmission ? { reviewSubmission } : {}),
    submissionItems: input.layers.filter((layer) => layer.layer === "submission_item"),
    lastEventId: input.lastEventId,
    lastProviderTimestamp: input.lastProviderTimestamp,
    authReadiness: input.authReadiness,
    ...(input.rejectionPacket ? { rejectionPacket: input.rejectionPacket } : {}),
    classification: input.classification,
    ...(input.remediation ? { remediation: input.remediation } : {}),
    ...(input.resubmission ? { resubmission: input.resubmission } : {}),
  };
}

function snapshotIsRejection(layers: readonly AppReviewLayerObservation[]): boolean {
  const appVersion = layers.find((layer) => layer.layer === "app_version");
  const submission = layers.find((layer) => layer.layer === "review_submission");
  const items = layers.filter((layer) => layer.layer === "submission_item");
  if (appVersion && (appVersion.normalized === "rejected" || appVersion.normalized === "metadata_rejected" || appVersion.normalized === "invalid_binary")) {
    return true;
  }
  if (submission && submission.normalized === "unresolved_issues") return true;
  return items.some((item) => item.normalized === "rejected");
}

function snapshotConfirmsSubmit(layers: readonly AppReviewLayerObservation[]): boolean {
  if (snapshotIsRejection(layers)) return false;
  const appVersion = layers.find((layer) => layer.layer === "app_version");
  if (!appVersion) return false;
  switch (appVersion.normalized) {
    case "waiting_for_review":
    case "in_review":
    case "pending_apple_release":
    case "processing":
      return true;
    default:
      return false;
  }
}

function snapshotIsAccepted(layers: readonly AppReviewLayerObservation[]): boolean {
  const appVersion = layers.find((layer) => layer.layer === "app_version");
  if (!appVersion) return false;
  switch (appVersion.normalized) {
    case "ready_for_distribution":
    case "ready_for_sale":
    case "accepted":
    case "pending_developer_release":
      return true;
    default:
      return false;
  }
}

function resubmissionAwaitingReadback(resubmission: AppReviewResubmission | undefined): boolean {
  if (!resubmission) return false;
  switch (resubmission.status) {
    case "awaiting_readback":
    case "submitted":
    case "timed_out":
      return true;
    case "not_started":
    case "authorized":
    case "accepted":
    case "rejected_again":
    case "exhausted":
    case "refused":
      return false;
    default: {
      const exhaustive: never = resubmission.status;
      throw new Error(`Unhandled App Review resubmission status ${String(exhaustive)}`);
    }
  }
}

export function applyAppReviewObservation(state: AppReviewState, snapshot: AppReviewSnapshot, now: string): ApplyAppReviewResult {
  const fingerprint = snapshotFingerprint(snapshot);
  const latestObservation = [...state.events].reverse().find((event) => event.kind === "observation");
  if (latestObservation && latestObservation.snapshotFingerprint === fingerprint) {
    return { state, applied: false, reason: "duplicate_ignored" };
  }

  const layers = snapshot.layers.map((layer) => observeLayer(layer, now, state.capabilityReceipt.observedCliVersion));
  const agreement = normalizeAgreement(snapshot.agreement);
  const incomingMs = Date.parse(snapshot.providerTimestamp);
  const currentMs = Date.parse(state.currentCase.lastProviderTimestamp);
  const outOfOrder = Number.isFinite(incomingMs) && Number.isFinite(currentMs) && incomingMs < currentMs;

  const event: AppReviewEvent = {
    eventId: nextEventId(state.mandate.mandateId, state.events.length),
    mandateId: state.mandate.mandateId,
    kind: outOfOrder ? "out_of_order_ignored" : "observation",
    providerEventId: snapshot.providerEventId,
    providerTimestamp: snapshot.providerTimestamp,
    recordedAt: now,
    snapshotFingerprint: fingerprint,
    layers,
    agreement,
  };

  if (outOfOrder) {
    return {
      applied: false,
      reason: "out_of_order_ignored",
      state: {
        ...state,
        updatedAt: now,
        events: [...state.events, event],
      },
    };
  }

  const nextSubmissionId = layers.find((layer) => layer.layer === "review_submission")?.providerObjectId;
  const previousSubmissionId = state.currentCase.reviewSubmission?.providerObjectId;
  const submissionChanged = Boolean(previousSubmissionId && nextSubmissionId && previousSubmissionId !== nextSubmissionId);
  const resubmission = state.currentCase.resubmission;
  const awaiting = resubmissionAwaitingReadback(resubmission);

  if (awaiting && resubmission && snapshotConfirmsSubmit(layers)) {
    const confirmed: AppReviewResubmission = {
      ...resubmission,
      status: "submitted",
      readbackAt: now,
      occurrence: { ...resubmission.occurrence, status: "running" },
    };
    const currentCase = projectAppReviewCase({
      mandateId: state.mandate.mandateId,
      caseId: state.currentCase.caseId,
      parentCaseId: state.currentCase.parentCaseId,
      cycleNumber: state.currentCase.cycleNumber,
      receipt: state.capabilityReceipt,
      layers,
      agreement,
      lastEventId: event.eventId,
      lastProviderTimestamp: snapshot.providerTimestamp,
      authReadiness: state.currentCase.authReadiness,
      rejectionPacket: state.currentCase.rejectionPacket,
      classification: state.currentCase.classification,
      remediation: state.currentCase.remediation,
      resubmission: confirmed,
    });
    return {
      applied: true,
      reason: "recorded",
      state: { ...state, updatedAt: now, events: [...state.events, event], currentCase },
    };
  }

  if (awaiting && resubmission && snapshotIsAccepted(layers)) {
    const accepted: AppReviewResubmission = {
      ...resubmission,
      status: "accepted",
      readbackAt: now,
      occurrence: { ...resubmission.occurrence, status: "proved" },
    };
    const currentCase = projectAppReviewCase({
      mandateId: state.mandate.mandateId,
      caseId: state.currentCase.caseId,
      parentCaseId: state.currentCase.parentCaseId,
      cycleNumber: state.currentCase.cycleNumber,
      receipt: state.capabilityReceipt,
      layers,
      agreement,
      lastEventId: event.eventId,
      lastProviderTimestamp: snapshot.providerTimestamp,
      authReadiness: state.currentCase.authReadiness,
      rejectionPacket: state.currentCase.rejectionPacket,
      classification: state.currentCase.classification,
      remediation: state.currentCase.remediation,
      resubmission: accepted,
    });
    return {
      applied: true,
      reason: "review_accepted",
      state: { ...state, updatedAt: now, events: [...state.events, event], currentCase },
    };
  }

  if (awaiting && resubmission && snapshotIsRejection(layers)) {
    const nextCycle = state.currentCase.cycleNumber + 1;
    if (nextCycle > resubmission.envelope.maxCycles) {
      const exhausted: AppReviewResubmission = {
        ...resubmission,
        status: "exhausted",
        readbackAt: now,
        occurrence: { ...resubmission.occurrence, status: "exhausted" },
      };
      const currentCase = projectAppReviewCase({
        mandateId: state.mandate.mandateId,
        caseId: state.currentCase.caseId,
        parentCaseId: state.currentCase.parentCaseId,
        cycleNumber: state.currentCase.cycleNumber,
        receipt: state.capabilityReceipt,
        layers,
        agreement,
        lastEventId: event.eventId,
        lastProviderTimestamp: snapshot.providerTimestamp,
        authReadiness: state.currentCase.authReadiness,
        rejectionPacket: state.currentCase.rejectionPacket,
        classification: state.currentCase.classification,
        remediation: state.currentCase.remediation,
        resubmission: exhausted,
      });
      return {
        applied: true,
        reason: "cycle_exhausted",
        state: { ...state, updatedAt: now, events: [...state.events, event], currentCase },
      };
    }
    const opened: AppReviewResubmission = {
      ...resubmission,
      status: "rejected_again",
      readbackAt: now,
      occurrence: { ...resubmission.occurrence, status: "refused" },
    };
    const currentCase = projectAppReviewCase({
      mandateId: state.mandate.mandateId,
      caseId: `case.app-review.${state.mandate.mandateId}.${nextCycle}`,
      parentCaseId: state.currentCase.caseId,
      cycleNumber: nextCycle,
      receipt: state.capabilityReceipt,
      layers,
      agreement,
      lastEventId: event.eventId,
      lastProviderTimestamp: snapshot.providerTimestamp,
      authReadiness: emptyAuthReadiness(now, !state.capabilityReceipt.failClosed),
      classification: idleClassification(),
      resubmission: opened,
    });
    return {
      applied: true,
      reason: "cycle_opened",
      state: { ...state, updatedAt: now, events: [...state.events, event], currentCase },
    };
  }

  const cycleNumber = submissionChanged ? state.currentCase.cycleNumber + 1 : state.currentCase.cycleNumber;
  const caseId = submissionChanged ? `case.app-review.${state.mandate.mandateId}.${cycleNumber}` : state.currentCase.caseId;
  const keepPacket = !submissionChanged;
  const currentCase = projectAppReviewCase({
    mandateId: state.mandate.mandateId,
    caseId,
    parentCaseId: submissionChanged ? state.currentCase.caseId : state.currentCase.parentCaseId,
    cycleNumber,
    receipt: state.capabilityReceipt,
    layers,
    agreement,
    lastEventId: event.eventId,
    lastProviderTimestamp: snapshot.providerTimestamp,
    authReadiness: keepPacket ? state.currentCase.authReadiness : emptyAuthReadiness(now, !state.capabilityReceipt.failClosed),
    rejectionPacket: keepPacket ? state.currentCase.rejectionPacket : undefined,
    classification: keepPacket ? state.currentCase.classification : idleClassification(),
    remediation: keepPacket ? state.currentCase.remediation : undefined,
    resubmission: keepPacket ? state.currentCase.resubmission : undefined,
  });

  return {
    applied: true,
    reason: "recorded",
    state: {
      ...state,
      updatedAt: now,
      events: [...state.events, event],
      currentCase,
    },
  };
}

export function appendAppReviewEvent(
  state: AppReviewState,
  kind:
    | "packet_recorded"
    | "handoff_recorded"
    | "webhook_accepted"
    | "webhook_duplicate_ignored"
    | "webhook_unknown_payload"
    | "plan_recorded"
    | "implementation_applied"
    | "verification_recorded"
    | "archive_inspected"
    | "parked"
    | "resubmit_authorized"
    | "resubmit_recorded"
    | "resubmit_timeout_readback"
    | "cycle_opened"
    | "cycle_exhausted"
    | "review_accepted",
  now: string,
  extra?: { readonly providerEventId?: string; readonly providerTimestamp?: string },
): AppReviewState {
  const latest = [...state.events].reverse().find((event) => event.kind === "observation") ?? state.events.at(-1);
  if (!latest) return state;
  const event: AppReviewEvent = {
    eventId: nextEventId(state.mandate.mandateId, state.events.length),
    mandateId: state.mandate.mandateId,
    kind,
    ...(extra?.providerEventId ? { providerEventId: extra.providerEventId } : {}),
    providerTimestamp: extra?.providerTimestamp ?? now,
    recordedAt: now,
    snapshotFingerprint: latest.snapshotFingerprint,
    layers: state.currentCase.reviewSubmission
      ? [state.currentCase.appVersion, state.currentCase.reviewSubmission, ...state.currentCase.submissionItems]
      : [state.currentCase.appVersion, ...state.currentCase.submissionItems],
    agreement: latest.agreement,
  };
  return {
    ...state,
    updatedAt: now,
    events: [...state.events, event],
    currentCase: {
      ...state.currentCase,
      lastEventId: event.eventId,
    },
  };
}
