/**
 * Host-neutral App Store Connect webhook envelope.
 *
 * Parse the JSON body only after HMAC verification. The envelope is a wake-up
 * signal. Do not copy oldValue or newValue into Apple layer truth.
 */
import { createHash } from "node:crypto";

import { validateAppReviewWebhookEnvelope } from "../../kernel/schema/index.js";

export const WEBHOOK_ENVELOPE_SCHEMA_VERSION = "1.0.0";
export const APP_REVIEW_WAKE_EVENT_TYPE = "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED";
export const APP_REVIEW_WEBHOOK_PING_EVENT_TYPE = "WEBHOOK_PING";

export interface SignedWebhookEnvelope {
  readonly schemaVersion: typeof WEBHOOK_ENVELOPE_SCHEMA_VERSION;
  readonly provider: "app-store-connect";
  readonly providerEventId: string;
  readonly eventType: string;
  readonly payloadVersion?: string;
  readonly providerTimestamp: string;
  readonly receivedAt: string;
  readonly rawBodySha256: string;
  readonly rawBodyByteLength: number;
  readonly signatureAlgorithm: "hmacsha256";
  readonly secretId: string;
  readonly appStoreVersionId?: string;
  readonly relatedResourceType?: string;
  readonly reportedOldValue?: string;
  readonly reportedNewValue?: string;
  readonly unknownPayload: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sha256Hex(rawBody: Uint8Array): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function nestedData(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return isRecord(value.data) ? value.data : value;
}

export function parseAppleWebhookPayload(rawBody: Uint8Array, input: { readonly receivedAt: string; readonly secretId: string }): SignedWebhookEnvelope {
  const rawBodySha256 = sha256Hex(rawBody);
  const fallbackId = `missing-event-id:${rawBodySha256}`;
  const base: SignedWebhookEnvelope = {
    schemaVersion: WEBHOOK_ENVELOPE_SCHEMA_VERSION,
    provider: "app-store-connect",
    providerEventId: fallbackId,
    eventType: "unknown",
    providerTimestamp: input.receivedAt,
    receivedAt: input.receivedAt,
    rawBodySha256,
    rawBodyByteLength: rawBody.byteLength,
    signatureAlgorithm: "hmacsha256",
    secretId: input.secretId,
    unknownPayload: true,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawBody).toString("utf8"));
  } catch {
    return base;
  }

  const data = nestedData(parsed);
  if (!data) return base;
  const attributes = isRecord(data.attributes) ? data.attributes : data;
  const relationships = isRecord(data.relationships) ? data.relationships : undefined;
  const instance = relationships && isRecord(relationships.instance) ? nestedData(relationships.instance) : undefined;
  const payload = isRecord(attributes.payload) ? attributes.payload : isRecord(data.payload) ? data.payload : undefined;

  const providerEventId = asString(data.id) ?? asString(parsed && isRecord(parsed) ? parsed.id : undefined);
  const eventType = asString(attributes.eventType) ?? asString(data.eventType) ?? asString(data.type) ?? "unknown";
  const providerTimestamp =
    asString(attributes.timestamp) ?? asString(attributes.createdDate) ?? asString(attributes.eventTime) ?? asString(data.createdDate) ?? input.receivedAt;
  const payloadVersion = asString(data.version) ?? (typeof data.version === "number" ? String(data.version) : asString(attributes.payloadVersion));
  const appStoreVersionId = asString(instance?.id) ?? asString(payload?.id);
  const relatedResourceType = asString(instance?.type);
  const reportedOldValue = payload ? asString(payload.oldValue) : undefined;
  const reportedNewValue = payload ? asString(payload.newValue) : undefined;
  const timestampOk = !Number.isNaN(Date.parse(providerTimestamp));
  const unknownPayload = !providerEventId || !timestampOk || eventType === "unknown";

  const envelope: SignedWebhookEnvelope = {
    ...base,
    providerEventId: providerEventId ?? fallbackId,
    eventType,
    ...(payloadVersion ? { payloadVersion } : {}),
    providerTimestamp: timestampOk ? providerTimestamp : input.receivedAt,
    ...(appStoreVersionId ? { appStoreVersionId } : {}),
    ...(relatedResourceType ? { relatedResourceType } : {}),
    ...(reportedOldValue ? { reportedOldValue } : {}),
    ...(reportedNewValue ? { reportedNewValue } : {}),
    unknownPayload,
  };
  const check = validateAppReviewWebhookEnvelope<SignedWebhookEnvelope>(envelope);
  if (!check.valid) {
    return { ...envelope, unknownPayload: true };
  }
  return envelope;
}

export function envelopeIsWakeEvent(envelope: SignedWebhookEnvelope): boolean {
  return envelope.eventType === APP_REVIEW_WAKE_EVENT_TYPE;
}

export function envelopeIsPing(envelope: SignedWebhookEnvelope): boolean {
  return envelope.eventType === APP_REVIEW_WEBHOOK_PING_EVENT_TYPE;
}
