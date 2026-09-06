/**
 * Observe-only App Store Connect webhook registration reconcile.
 *
 * List existing app webhooks. Reuse an exact match. Do not create, update,
 * rotate, or delete a webhook from this observe path. Creating a webhook is a
 * credentials mutation and needs an exact envelope in a later phase.
 */
import { createHash } from "node:crypto";

export interface WebhookRegistrationRow {
  readonly resourceId: string;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly url: string;
}

export interface WebhookDeliveryRow {
  readonly providerEventId: string;
  readonly deliveredAt: string;
  readonly success: boolean;
}

export interface WebhookRegistrationObservation {
  readonly resourceId: string;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly urlDigest: string;
  readonly observedAt: string;
}

export type WebhookRegistrationDecision = "reuse" | "unregistered" | "duplicate_config";

export interface ReconcileWebhookRegistrationResult {
  readonly decision: WebhookRegistrationDecision;
  readonly match?: WebhookRegistrationObservation;
  readonly duplicateResourceIds: readonly string[];
}

export function digestWebhookUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}

function sameEventTypes(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const wanted = [...right].sort();
  return [...left].sort().every((item, index) => item === wanted[index]);
}

export function reconcileWebhookRegistration(input: {
  readonly listings: readonly WebhookRegistrationRow[];
  readonly desiredEventTypes: readonly string[];
  readonly desiredUrlDigest: string;
  readonly observedAt: string;
}): ReconcileWebhookRegistrationResult {
  const matches = input.listings.filter(
    (row) => digestWebhookUrl(row.url) === input.desiredUrlDigest && sameEventTypes(row.eventTypes, input.desiredEventTypes),
  );
  if (matches.length === 0) {
    return { decision: "unregistered", duplicateResourceIds: [] };
  }
  const first = matches[0]!;
  const observation: WebhookRegistrationObservation = {
    resourceId: first.resourceId,
    eventTypes: [...first.eventTypes],
    enabled: first.enabled,
    urlDigest: input.desiredUrlDigest,
    observedAt: input.observedAt,
  };
  if (matches.length > 1) {
    return {
      decision: "duplicate_config",
      match: observation,
      duplicateResourceIds: matches.map((row) => row.resourceId),
    };
  }
  return { decision: "reuse", match: observation, duplicateResourceIds: [] };
}

function deliveryIsOnWatch(deliveredAt: string, notBefore: string): boolean {
  const deliveredMs = Date.parse(deliveredAt);
  const notBeforeMs = Date.parse(notBefore);
  if (!Number.isFinite(deliveredMs) || !Number.isFinite(notBeforeMs)) return false;
  return deliveredMs >= notBeforeMs;
}

export function silentDeliveries(
  deliveries: readonly WebhookDeliveryRow[],
  acceptedEventIds: readonly string[],
  notBefore: string,
): readonly string[] {
  const accepted = new Set(acceptedEventIds);
  return deliveries
    .filter((row) => row.success && !accepted.has(row.providerEventId) && deliveryIsOnWatch(row.deliveredAt, notBefore))
    .map((row) => row.providerEventId);
}
