import { buildAuthReadiness, emptyAuthReadiness, type RawWebAuthStatus } from "./auth.js";
import { buildCapabilityReceipt, buildWebhookOperationsReceipt } from "./capability.js";
import { classifyAppReviewCase, idleClassification } from "./classify.js";
import { appendAppReviewEvent, applyAppReviewObservation, projectAppReviewCase, seedAppReviewState } from "./events.js";
import { recordSignedWebhookEnvelope, observeWebhookRegistration, webhookEnvelopeShouldPoll } from "./ingest.js";
import { createObserveMandate, observeMandateIsLive, type ObserveMandateInput } from "./mandate.js";
import { observationNeedsRejectionPacket } from "./normalize.js";
import { incompletePacket, intakeRejectionPacket, packetCorrelatesToSubmission, type RawWebReviewShowOutput } from "./packet.js";
import { alignRemediationWithClassification } from "./plan.js";
import type { SignedWebhookEnvelope } from "./envelope.js";
import type { WebhookDeliveryRow, WebhookRegistrationRow } from "./registration.js";
import type {
  AppReviewAuthReadiness,
  AppReviewCapabilityReceipt,
  AppReviewClassification,
  AppReviewEvent,
  AppReviewLayerObservation,
  AppReviewRejectionPacket,
  AppReviewSnapshot,
  AppReviewState,
  AppReviewWebhookOperationsReceipt,
} from "./types.js";

export interface AppReviewProvider {
  probeCapabilities(probedAt: string): AppReviewCapabilityReceipt;
  probeWebhookOperations(probedAt: string): AppReviewWebhookOperationsReceipt;
  readSnapshot(): AppReviewSnapshot;
  probeWebAuth(probedAt: string): RawWebAuthStatus | undefined;
  readRejectionPacket(query: { appId: string; submissionId: string }): RawWebReviewShowOutput | undefined;
  listWebhooks(): readonly WebhookRegistrationRow[];
  listDeliveries(): readonly WebhookDeliveryRow[];
  desiredWebhook(): { readonly eventTypes: readonly string[]; readonly urlDigest: string } | undefined;
}

export interface FixtureCapabilityPack {
  readonly observedCliVersion: string;
  readonly capabilitiesText: string;
  readonly helpByCommand: Readonly<Record<string, string>>;
  readonly schemaIds: readonly string[];
}

export interface FixtureProviderPack {
  readonly capabilities: FixtureCapabilityPack;
  readonly snapshot: AppReviewSnapshot;
  readonly webAuth?: RawWebAuthStatus;
  readonly rejectionPacket?: RawWebReviewShowOutput;
  readonly webhookListings?: readonly WebhookRegistrationRow[];
  readonly webhookDeliveries?: readonly WebhookDeliveryRow[];
  readonly desiredWebhook?: { readonly eventTypes: readonly string[]; readonly urlDigest: string };
}

/** Test-only canned provider. Production consume uses createAscAppReviewProvider. */
export function createFixtureProvider(pack: FixtureProviderPack): AppReviewProvider {
  return {
    probeCapabilities(probedAt: string) {
      return buildCapabilityReceipt({
        observedCliVersion: pack.capabilities.observedCliVersion,
        capabilitiesText: pack.capabilities.capabilitiesText,
        helpByCommand: pack.capabilities.helpByCommand,
        schemaIds: pack.capabilities.schemaIds,
        probedAt,
      });
    },
    readSnapshot() {
      return pack.snapshot;
    },
    probeWebAuth() {
      return pack.webAuth;
    },
    readRejectionPacket() {
      return pack.rejectionPacket;
    },
    probeWebhookOperations(probedAt: string) {
      return buildWebhookOperationsReceipt({
        observedCliVersion: pack.capabilities.observedCliVersion,
        capabilitiesText: pack.capabilities.capabilitiesText,
        helpByCommand: pack.capabilities.helpByCommand,
        schemaIds: pack.capabilities.schemaIds,
        probedAt,
      });
    },
    listWebhooks() {
      return pack.webhookListings ?? [];
    },
    listDeliveries() {
      return pack.webhookDeliveries ?? [];
    },
    desiredWebhook() {
      return pack.desiredWebhook;
    },
  };
}

export interface PollAppReviewOptions {
  readonly evidenceRoot?: string;
}

function exactSubmissionId(state: AppReviewState): string | undefined {
  return state.currentCase.reviewSubmission?.providerObjectId;
}

function handoffUnchanged(
  state: AppReviewState,
  packet: AppReviewState["currentCase"]["rejectionPacket"],
  authReadiness: AppReviewState["currentCase"]["authReadiness"],
): boolean {
  return (
    state.currentCase.authReadiness.handoff === authReadiness.handoff && state.currentCase.rejectionPacket?.packetFingerprint === packet?.packetFingerprint
  );
}

function recordHandoff(
  state: AppReviewState,
  now: string,
  layers: readonly AppReviewLayerObservation[],
  latestAgreement: AppReviewEvent["agreement"],
  authReadiness: AppReviewAuthReadiness,
  packet: AppReviewRejectionPacket,
  classification: AppReviewClassification,
): AppReviewState {
  if (handoffUnchanged(state, packet, authReadiness)) return state;
  const nextCase = projectAppReviewCase({
    mandateId: state.mandate.mandateId,
    caseId: state.currentCase.caseId,
    parentCaseId: state.currentCase.parentCaseId,
    cycleNumber: state.currentCase.cycleNumber,
    receipt: state.capabilityReceipt,
    layers,
    agreement: latestAgreement,
    lastEventId: state.currentCase.lastEventId,
    lastProviderTimestamp: state.currentCase.lastProviderTimestamp,
    authReadiness,
    rejectionPacket: packet,
    ...alignRemediationWithClassification(classification, state.currentCase.remediation),
    resubmission: state.currentCase.resubmission,
  });
  return appendAppReviewEvent({ ...state, updatedAt: now, currentCase: nextCase }, "handoff_recorded", now);
}

function intakeRejectionEvidence(state: AppReviewState, provider: AppReviewProvider, now: string, options: PollAppReviewOptions | undefined): AppReviewState {
  const layers = [
    state.currentCase.appVersion,
    ...(state.currentCase.reviewSubmission ? [state.currentCase.reviewSubmission] : []),
    ...state.currentCase.submissionItems,
  ];
  const latestAgreement = [...state.events].reverse().find((event) => event.kind === "observation")?.agreement ?? state.events.at(-1)?.agreement;
  if (!latestAgreement) return state;
  const packetNeeded = observationNeedsRejectionPacket(layers, latestAgreement, state.capabilityReceipt);
  if (!packetNeeded) {
    const authReadiness = emptyAuthReadiness(now, !state.capabilityReceipt.failClosed);
    if (state.currentCase.authReadiness.handoff === authReadiness.handoff) return state;
    return {
      ...state,
      updatedAt: now,
      currentCase: projectAppReviewCase({
        mandateId: state.mandate.mandateId,
        caseId: state.currentCase.caseId,
        parentCaseId: state.currentCase.parentCaseId,
        cycleNumber: state.currentCase.cycleNumber,
        receipt: state.capabilityReceipt,
        layers,
        agreement: latestAgreement,
        lastEventId: state.currentCase.lastEventId,
        lastProviderTimestamp: state.currentCase.lastProviderTimestamp,
        authReadiness,
        rejectionPacket: state.currentCase.rejectionPacket,
        classification: idleClassification(),
        resubmission: state.currentCase.resubmission,
      }),
    };
  }

  const webAuth = provider.probeWebAuth(now);
  const authReadiness = buildAuthReadiness({
    receipt: state.capabilityReceipt,
    webAuth,
    packetNeeded: true,
    probedAt: now,
  });
  const submissionId = exactSubmissionId(state) ?? "";
  const appId = state.mandate.appId;

  if (!authReadiness.webSessionReady) {
    const packet = incompletePacket({
      appId,
      submissionId,
      cliVersion: state.capabilityReceipt.observedCliVersion,
      retrievedAt: now,
      reason: state.capabilityReceipt.webSession.failClosed ? "web_session_capability" : "web_session_missing",
    });
    return recordHandoff(state, now, layers, latestAgreement, authReadiness, packet, idleClassification());
  }

  const raw = provider.readRejectionPacket({ appId, submissionId });
  if (!raw) {
    const packet = incompletePacket({
      appId,
      submissionId,
      cliVersion: state.capabilityReceipt.observedCliVersion,
      retrievedAt: now,
      reason: "packet_mismatch",
    });
    return recordHandoff(
      state,
      now,
      layers,
      latestAgreement,
      authReadiness,
      packet,
      classifyAppReviewCase({ appVersion: state.currentCase.appVersion, packet }),
    );
  }

  const scopedRaw = {
    ...raw,
    appId: raw.appId ?? appId,
    submission: raw.submission ?? { id: submissionId },
  };
  const intake = intakeRejectionPacket(scopedRaw, {
    appId,
    submissionId,
    cliVersion: state.capabilityReceipt.observedCliVersion,
    retrievedAt: now,
    evidenceRoot: options?.evidenceRoot,
  });
  const correlated = packetCorrelatesToSubmission(intake.packet, { appId, submissionId });
  // Keep the provider's reported selection. Matching app and submission IDs do not
  // rewrite latest-unresolved / latest / unknown to explicit. Discovery selection
  // is not durable identity even when those IDs happen to match.
  const packet = correlated
    ? {
        ...intake.packet,
        selectionIsDurable: intake.packet.selection === "explicit" && !intake.packet.incomplete,
      }
    : {
        ...intake.packet,
        incomplete: true,
        incompleteReason: intake.packet.incompleteReason ?? "packet_mismatch",
        selectionIsDurable: false,
      };

  if (state.currentCase.rejectionPacket?.packetFingerprint === packet.packetFingerprint) {
    return state;
  }

  const nextCase = projectAppReviewCase({
    mandateId: state.mandate.mandateId,
    caseId: state.currentCase.caseId,
    parentCaseId: state.currentCase.parentCaseId,
    cycleNumber: state.currentCase.cycleNumber,
    receipt: state.capabilityReceipt,
    layers,
    agreement: latestAgreement,
    lastEventId: state.currentCase.lastEventId,
    lastProviderTimestamp: state.currentCase.lastProviderTimestamp,
    authReadiness,
    rejectionPacket: packet,
    ...alignRemediationWithClassification(
      classifyAppReviewCase({ appVersion: state.currentCase.appVersion, packet }),
      state.currentCase.remediation,
    ),
    resubmission: state.currentCase.resubmission,
  });
  return appendAppReviewEvent({ ...state, updatedAt: now, currentCase: nextCase }, "packet_recorded", now);
}

export function pollAppReview(state: AppReviewState, provider: AppReviewProvider, now: string, options?: PollAppReviewOptions): AppReviewState {
  if (!observeMandateIsLive(state.mandate, now)) {
    if (state.mandate.status === "active") {
      return {
        ...state,
        updatedAt: now,
        mandate: { ...state.mandate, status: "expired" },
      };
    }
    return state;
  }
  const observed = applyAppReviewObservation(state, provider.readSnapshot(), now).state;
  const withPacket = intakeRejectionEvidence(observed, provider, now, options);
  return observeWebhookRegistration(withPacket, provider.listWebhooks(), now, provider.desiredWebhook(), provider.listDeliveries());
}

export function ingestSignedWebhookEnvelope(
  state: AppReviewState,
  envelope: SignedWebhookEnvelope,
  provider: AppReviewProvider,
  now: string,
  options?: PollAppReviewOptions,
): AppReviewState {
  const already = state.webhookIngress.acceptedEventIds.includes(envelope.providerEventId);
  const recorded = recordSignedWebhookEnvelope(state, envelope, now);
  if (already || !webhookEnvelopeShouldPoll(envelope)) return recorded;
  return pollAppReview(recorded, provider, now, options);
}

export function startObserveMandate(input: ObserveMandateInput, provider: AppReviewProvider, now: string, options?: PollAppReviewOptions): AppReviewState {
  const receipt = provider.probeCapabilities(now);
  const mandate = createObserveMandate(input);
  const seeded = seedAppReviewState(mandate, receipt, now);
  const operations = provider.probeWebhookOperations(now);
  const withOps: AppReviewState = {
    ...seeded,
    webhookIngress: {
      ...seeded.webhookIngress,
      operations,
      health: operations.failClosed ? "poll_only" : "unregistered",
    },
  };
  return pollAppReview(withOps, provider, now, options);
}
