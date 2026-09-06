/**
 * Consume a verified webhook envelope as a wake-up signal.
 *
 * Do not copy reportedOldValue or reportedNewValue into Apple layer state.
 * Invalid signatures never reach this function. Duplicate Apple event IDs do
 * not open a second case. Polling still supplies provider truth.
 */
import { envelopeIsPing, envelopeIsWakeEvent, type SignedWebhookEnvelope } from "./envelope.js";
import { appendAppReviewEvent } from "./events.js";
import { reconcileWebhookRegistration, silentDeliveries, type WebhookDeliveryRow, type WebhookRegistrationRow } from "./registration.js";
import type { AppReviewState, AppReviewWebhookHealth, AppReviewWebhookIngress } from "./types.js";

const ACCEPTED_EVENT_LIMIT = 64;

function rememberEventId(ids: readonly string[], providerEventId: string): readonly string[] {
  if (ids.includes(providerEventId)) return ids;
  const next = [...ids, providerEventId];
  return next.length <= ACCEPTED_EVENT_LIMIT ? next : next.slice(next.length - ACCEPTED_EVENT_LIMIT);
}

function lastEnvelopeFrom(envelope: SignedWebhookEnvelope): AppReviewWebhookIngress["lastEnvelope"] {
  return {
    providerEventId: envelope.providerEventId,
    eventType: envelope.eventType,
    providerTimestamp: envelope.providerTimestamp,
    rawBodySha256: envelope.rawBodySha256,
    receivedAt: envelope.receivedAt,
    secretId: envelope.secretId,
  };
}

function healthAfterEnvelope(envelope: SignedWebhookEnvelope, ingress: AppReviewWebhookIngress): AppReviewWebhookHealth {
  if (envelope.unknownPayload) return "unknown_payload";
  if (ingress.health === "silent") return "silent";
  if (ingress.registration?.enabled === false) return "unregistered";
  if (ingress.operations.failClosed && !ingress.registration) return "poll_only";
  if (!ingress.registration) return "unregistered";
  return "healthy";
}

export function webhookEnvelopeShouldPoll(envelope: SignedWebhookEnvelope): boolean {
  if (envelopeIsPing(envelope) && !envelopeIsWakeEvent(envelope)) return false;
  return true;
}

export function recordSignedWebhookEnvelope(state: AppReviewState, envelope: SignedWebhookEnvelope, now: string): AppReviewState {
  const already = state.webhookIngress.acceptedEventIds.includes(envelope.providerEventId);
  if (already) {
    if (state.events.some((event) => event.kind === "webhook_duplicate_ignored" && event.providerEventId === envelope.providerEventId)) {
      return state;
    }
    return appendAppReviewEvent(state, "webhook_duplicate_ignored", now, {
      providerEventId: envelope.providerEventId,
      providerTimestamp: envelope.providerTimestamp,
    });
  }

  const kind = envelope.unknownPayload ? "webhook_unknown_payload" : "webhook_accepted";
  const recorded = appendAppReviewEvent(state, kind, now, {
    providerEventId: envelope.providerEventId,
    providerTimestamp: envelope.providerTimestamp,
  });
  const nextIngress: AppReviewWebhookIngress = {
    ...recorded.webhookIngress,
    mode: "signed_receiver",
    health: healthAfterEnvelope(envelope, recorded.webhookIngress),
    acceptedEventIds: rememberEventId(recorded.webhookIngress.acceptedEventIds, envelope.providerEventId),
    lastVerifiedAt: envelope.receivedAt,
    lastEnvelope: lastEnvelopeFrom(envelope),
  };
  return { ...recorded, webhookIngress: nextIngress };
}

export function observeWebhookRegistration(
  state: AppReviewState,
  listings: readonly WebhookRegistrationRow[],
  now: string,
  desired?: { readonly eventTypes: readonly string[]; readonly urlDigest: string },
  deliveries: readonly WebhookDeliveryRow[] = [],
): AppReviewState {
  if (!desired) {
    const health: AppReviewWebhookHealth = state.webhookIngress.mode === "poll_only" ? "poll_only" : state.webhookIngress.health;
    if (state.webhookIngress.health === health) return state;
    return { ...state, updatedAt: now, webhookIngress: { ...state.webhookIngress, health } };
  }
  const reconciled = reconcileWebhookRegistration({
    listings,
    desiredEventTypes: desired.eventTypes,
    desiredUrlDigest: desired.urlDigest,
    observedAt: now,
  });
  const silent = silentDeliveries(deliveries, state.webhookIngress.acceptedEventIds, state.mandate.startedAt);
  let health: AppReviewWebhookHealth;
  if (reconciled.decision === "unregistered") health = "unregistered";
  else if (reconciled.match?.enabled === false) health = "unregistered";
  else if (state.webhookIngress.lastEnvelope && state.webhookIngress.health === "unknown_payload") health = "unknown_payload";
  else if (silent.length > 0) health = "silent";
  else health = "healthy";
  const { registration: _staleRegistration, ...ingressWithoutRegistration } = state.webhookIngress;
  const nextIngress: AppReviewWebhookIngress = reconciled.match
    ? { ...ingressWithoutRegistration, health, registration: reconciled.match }
    : { ...ingressWithoutRegistration, health };
  return {
    ...state,
    updatedAt: now,
    webhookIngress: nextIngress,
  };
}
