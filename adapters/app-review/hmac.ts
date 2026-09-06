/**
 * Apple App Store Connect webhook HMAC verification.
 *
 * Apple signs POST bodies with HMAC-SHA256 and sends the hex digest in
 * `x-apple-signature` as `hmacsha256=<hex>`. Verify the raw request bytes
 * before JSON parse. Fail closed on a missing, malformed, or unmatched
 * signature. Compare digests in constant time.
 *
 * Source: Apple "Configuring webhook notifications" HMAC example.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const APPLE_WEBHOOK_SIGNATURE_HEADER = "x-apple-signature";
export const APPLE_WEBHOOK_SIGNATURE_PREFIX = "hmacsha256=";
export const APPLE_WEBHOOK_MAX_BODY_BYTES = 65_536;

export type AppleWebhookSignatureFailure =
  | "missing_signature"
  | "malformed_signature"
  | "invalid_signature"
  | "empty_body"
  | "payload_too_large"
  | "no_secret";

export interface AppleWebhookSecret {
  readonly id: string;
  readonly secret: string;
}

export type AppleWebhookSignatureResult =
  | { readonly ok: true; readonly secretId: string; readonly digestHex: string }
  | { readonly ok: false; readonly reason: AppleWebhookSignatureFailure };

function normalizeSignatureHeader(header: string): string {
  return header.trim().toLowerCase();
}

function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function hmacSha256Hex(secret: string, rawBody: Uint8Array): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function signaturesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function verifyAppleWebhookSignature(input: {
  readonly rawBody: Uint8Array;
  readonly signatureHeader: string | undefined;
  readonly secrets: readonly AppleWebhookSecret[];
  readonly maxBodyBytes?: number;
}): AppleWebhookSignatureResult {
  const maxBodyBytes = input.maxBodyBytes ?? APPLE_WEBHOOK_MAX_BODY_BYTES;
  if (input.rawBody.byteLength === 0) {
    return { ok: false, reason: "empty_body" };
  }
  if (input.rawBody.byteLength > maxBodyBytes) {
    return { ok: false, reason: "payload_too_large" };
  }

  const usableSecrets = input.secrets.filter((item) => item.id.length > 0 && item.secret.length > 0);
  if (usableSecrets.length === 0) {
    return { ok: false, reason: "no_secret" };
  }

  if (input.signatureHeader === undefined || input.signatureHeader.trim() === "") {
    return { ok: false, reason: "missing_signature" };
  }

  const normalized = normalizeSignatureHeader(input.signatureHeader);
  if (!normalized.startsWith(APPLE_WEBHOOK_SIGNATURE_PREFIX)) {
    return { ok: false, reason: "malformed_signature" };
  }
  const providedHex = normalized.slice(APPLE_WEBHOOK_SIGNATURE_PREFIX.length);
  if (!isSha256Hex(providedHex)) {
    return { ok: false, reason: "malformed_signature" };
  }

  const providedHeader = `${APPLE_WEBHOOK_SIGNATURE_PREFIX}${providedHex}`;
  for (const secret of usableSecrets) {
    const digestHex = hmacSha256Hex(secret.secret, input.rawBody);
    const expectedHeader = `${APPLE_WEBHOOK_SIGNATURE_PREFIX}${digestHex}`;
    if (signaturesMatch(expectedHeader, providedHeader)) {
      return { ok: true, secretId: secret.id, digestHex };
    }
  }
  return { ok: false, reason: "invalid_signature" };
}

export function appleWebhookSignatureHeader(digestHex: string): string {
  return `${APPLE_WEBHOOK_SIGNATURE_PREFIX}${digestHex}`;
}

export function signAppleWebhookBody(secret: string, rawBody: Uint8Array | string): string {
  const bytes = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return hmacSha256Hex(secret, bytes);
}
