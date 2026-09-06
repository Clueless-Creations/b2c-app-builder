/**
 * HMAC-verifying reference receiver for App Store Connect webhooks.
 *
 * Host-neutral: no Cloudflare types. A Worker, a Node listener, or a test
 * harness calls `handleSignedWebhookRequest` with the raw body. The receiver
 * verifies `x-apple-signature`, persists an immutable envelope, then returns.
 * It does not poll Apple. It does not write `run/app-review.json`.
 * `consumeAcceptedWebhookQueue` is the skill-side adapter that drains the queue.
 *
 * Never use `asc webhooks serve` as this receiver.
 */
import { APPLE_WEBHOOK_MAX_BODY_BYTES, APPLE_WEBHOOK_SIGNATURE_HEADER, verifyAppleWebhookSignature, type AppleWebhookSecret, type AppleWebhookSignatureFailure } from "./hmac.js";
import { parseAppleWebhookPayload, type SignedWebhookEnvelope } from "./envelope.js";
import type { AppReviewWebhookQueue } from "./queue.js";

export const APP_REVIEW_WEBHOOK_DEFAULT_ROUTE = "/app-store-connect/webhooks";

export interface SignedWebhookRequest {
  readonly method: string;
  readonly route: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly rawBody: Uint8Array;
}

export interface HandleSignedWebhookInput {
  readonly request: SignedWebhookRequest;
  readonly configuredRoute: string;
  readonly secrets: readonly AppleWebhookSecret[];
  readonly queue: AppReviewWebhookQueue;
  readonly receivedAt: string;
  readonly maxBodyBytes?: number;
}

export type SignedWebhookRejectReason = AppleWebhookSignatureFailure | "method_not_allowed" | "route_mismatch";

export interface HandleSignedWebhookResult {
  readonly status: number;
  readonly stored: boolean;
  readonly duplicate: boolean;
  readonly reason?: SignedWebhookRejectReason;
  readonly envelope?: SignedWebhookEnvelope;
}

function headerValue(headers: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (trimmed.length === 0) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

export function handleSignedWebhookRequest(input: HandleSignedWebhookInput): HandleSignedWebhookResult {
  const method = input.request.method.toUpperCase();
  if (method !== "POST") {
    return { status: 405, stored: false, duplicate: false, reason: "method_not_allowed" };
  }
  if (normalizeRoute(input.request.route) !== normalizeRoute(input.configuredRoute)) {
    return { status: 404, stored: false, duplicate: false, reason: "route_mismatch" };
  }

  const verified = verifyAppleWebhookSignature({
    rawBody: input.request.rawBody,
    signatureHeader: headerValue(input.request.headers, APPLE_WEBHOOK_SIGNATURE_HEADER),
    secrets: input.secrets,
    maxBodyBytes: input.maxBodyBytes ?? APPLE_WEBHOOK_MAX_BODY_BYTES,
  });
  if (!verified.ok) {
    return { status: hmacRejectStatus(verified.reason), stored: false, duplicate: false, reason: verified.reason };
  }

  const envelope = parseAppleWebhookPayload(input.request.rawBody, {
    receivedAt: input.receivedAt,
    secretId: verified.secretId,
  });
  const persisted = input.queue.persist(envelope);
  return {
    status: 204,
    stored: persisted.stored,
    duplicate: persisted.duplicate,
    envelope: persisted.envelope,
  };
}

export function webhookServeIsFixtureOnly(command: string): boolean {
  return /\basc\s+webhooks\s+serve\b/.test(command);
}

function hmacRejectStatus(reason: AppleWebhookSignatureFailure): number {
  switch (reason) {
    case "payload_too_large":
      return 413;
    case "empty_body":
    case "malformed_signature":
      return 400;
    case "missing_signature":
    case "invalid_signature":
    case "no_secret":
      return 401;
    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled HMAC reject reason ${String(exhaustive)}`);
    }
  }
}
