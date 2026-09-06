import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";

export const READ_SCOPE = "b2c:read";

/**
 * The Stripe Price `lookup_key`s that grant `READ_SCOPE`.
 *
 * Every entitlement row is keyed by the Stripe Price's own `lookup_key`
 * (`hosted/builder-console/billing/webhook.ts` and `billing/reconcile.ts` write exactly what the
 * subscription item carries), while the access gate in `access.ts` asks for a scope. Two Prices
 * cannot share one `lookup_key` in Stripe, so the mapping from plan to scope has to live in code,
 * and it lives here, next to the scope it grants, so `hosted/builder-console/billing/plans.ts`
 * (the plans Checkout sells) and the gate can never disagree about which purchase opens the door.
 * A plan added to Checkout without a row here would be paid for and refused.
 */
export const PLAN_LOOKUP_KEYS = ["b2c_pro_monthly", "b2c_pro_annual"] as const;

/** Every entitlement `lookup_key` that satisfies `READ_SCOPE`: the scope's own key plus each sellable plan. */
export const READ_SCOPE_LOOKUP_KEYS: readonly string[] = [READ_SCOPE, ...PLAN_LOOKUP_KEYS];
const opaqueId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scopes = z.array(z.literal(READ_SCOPE)).max(1);
const credentialSchema = z.strictObject({
  id: opaqueId,
  subject: opaqueId,
  sha256: digest,
  scopes,
  revoked: z.boolean(),
  expiresAt: z.iso.datetime().optional(),
});
const policySchema = z.strictObject({
  version: z.literal(1),
  ownerSubject: opaqueId,
  allowedSubjects: z.array(opaqueId).min(1).max(64),
  credentials: z.array(credentialSchema).min(1).max(64),
});
const principalSchema = z.strictObject({
  subject: opaqueId,
  keyId: opaqueId,
  credentialSha256: digest,
  scopes,
});

export type AccessPolicy = z.infer<typeof policySchema>;
export type Principal = z.infer<typeof principalSchema>;

export class AccessError extends Error {
  constructor(readonly status: 401 | 403 | 503) {
    super(status === 503 ? "Service unavailable" : "Access denied");
  }
}

export function parseAccessPolicy(raw: string | undefined): AccessPolicy {
  try {
    if (!raw || raw.length > 65_536) throw new Error();
    const policy = policySchema.parse(JSON.parse(raw));
    if (
      !policy.allowedSubjects.includes(policy.ownerSubject) ||
      new Set(policy.allowedSubjects).size !== policy.allowedSubjects.length ||
      new Set(policy.credentials.map((item) => item.id)).size !== policy.credentials.length ||
      new Set(policy.credentials.map((item) => item.sha256)).size !== policy.credentials.length
    )
      throw new Error();
    return policy;
  } catch {
    throw new AccessError(503);
  }
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(bytes).toString("hex");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recheck policy for every API call and OAuth access/refresh token. */
export function authorizePrincipal(policy: AccessPolicy, input: unknown, now = Date.now()): Principal {
  const parsed = principalSchema.safeParse(input);
  if (!parsed.success) throw new AccessError(403);
  const principal = parsed.data;
  const credential = policy.credentials.find((item) => item.id === principal.keyId);
  if (
    !credential ||
    credential.revoked ||
    credential.subject !== principal.subject ||
    !constantTimeEqual(credential.sha256, principal.credentialSha256) ||
    !policy.allowedSubjects.includes(principal.subject) ||
    !credential.scopes.includes(READ_SCOPE) ||
    !principal.scopes.includes(READ_SCOPE) ||
    (credential.expiresAt !== undefined && Date.parse(credential.expiresAt) <= now)
  )
    throw new AccessError(403);
  return principal;
}

export async function authorizeApiKey(policy: AccessPolicy, key: string): Promise<Principal> {
  if (!/^b2c_[A-Za-z0-9_-]{43}$/.test(key)) throw new AccessError(401);
  const hash = await sha256(key);
  let match: AccessPolicy["credentials"][number] | undefined;
  for (const credential of policy.credentials) {
    if (constantTimeEqual(hash, credential.sha256)) match = credential;
  }
  if (!match) throw new AccessError(401);
  return authorizePrincipal(policy, {
    subject: match.subject,
    keyId: match.id,
    credentialSha256: match.sha256,
    scopes: [...match.scopes],
  });
}

export function validateRedirectUri(value: string, trusted: readonly string[]): boolean {
  try {
    const url = new URL(value);
    if (value.length > 2048 || url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return trusted.includes(value);
    return url.protocol === "http:" && url.port !== "" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * The one shape both signing secrets this codebase mints (`B2C_APP_BUILDER_AUTH_SECRET` here,
 * `B2C_APP_CONSOLE_AUTH_SECRET` in hosted/builder-console) must satisfy: 32+ random bytes, base64url-encoded,
 * unpadded. A 2026-09-02 incident deployed a standard-base64 value (`=` padding) for the app
 * Worker's copy — this predicate is what both Workers now check before ever calling
 * `crypto.subtle.importKey` with the value, so a misconfigured secret is a clear failure at the
 * boundary instead of a shape assumption baked into the regex at each call site.
 */
export function isConsentSecret(secret: unknown): secret is string {
  return typeof secret === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(secret);
}

async function consentKey(secret: string): Promise<CryptoKey> {
  if (!isConsentSecret(secret)) throw new AccessError(503);
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function issueConsentToken(secret: string, params: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ nonce, paramsSha256: await sha256(params), expiresAt: now + 300 })).toString("base64url");
  const signature = await crypto.subtle.sign("HMAC", await consentKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${Buffer.from(signature).toString("base64url")}`;
}

export async function verifyConsentToken(secret: string, token: string, params: string, now = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [payload, signature] = token.split(".") as [string, string];
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await consentKey(secret),
      new Uint8Array(Buffer.from(signature, "base64url")),
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;
    const data = z
      .strictObject({ nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), paramsSha256: digest, expiresAt: z.number().int() })
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    return data.expiresAt > now && data.expiresAt <= now + 300 && constantTimeEqual(data.paramsSha256, await sha256(params));
  } catch {
    return false;
  }
}
