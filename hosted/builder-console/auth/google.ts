/**
 * Google OIDC: the authorize redirect, the code-for-token exchange, and ID token verification.
 *
 * jose rather than google-auth-library, for the same reason capture.ts hand-rolls PostHog
 * capture instead of taking posthog-node into the MCP Worker: this Worker already prefers a
 * small, Workers-native call over an SDK built for Node's http stack. `createRemoteJWKSet` +
 * `jwtVerify` need no Google credential at all in tests — a locally generated RSA keypair signs
 * a fake token, `fetchImpl`/`jwksUrl` route the JWKS lookup at it, and no network call happens.
 */

import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { SIGNIN_FAILURE_REASONS, type SigninFailureReason } from "../analytics/events.js";

/**
 * Google's stable, documented endpoints (https://developers.google.com/identity/protocols/oauth2/web-server).
 * No discovery-document fetch: these three URLs do not rotate, and skipping discovery is one
 * fewer network call and one fewer thing to fake in a test.
 */
const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Every reason this module can fail with is already a row in EVENT_TAXONOMY.md's enum. */
export class GoogleAuthError extends Error {
  constructor(readonly reason: SigninFailureReason) {
    super(reason);
  }
}

export interface GoogleIdTokenClaims {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name?: string;
}

export interface BuildGoogleAuthorizeUrlOptions {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly nonce: string;
}

/** Builds the redirect target for GET /auth/google/start. Pure — no network call. */
export function buildGoogleAuthorizeUrl(opts: BuildGoogleAuthorizeUrlOptions): string {
  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  // "profile" only for the display name shown in the console header; no other Google scope is
  // requested, and no refresh token is needed — this Worker never calls a Google API again after
  // the id_token is verified.
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("nonce", opts.nonce);
  return url.toString();
}

export interface ExchangeGoogleCodeOptions {
  readonly code: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

const tokenResponse = z.object({ id_token: z.string().min(1) });

/**
 * Exchanges an authorization code for an ID token. One POST, no SDK.
 *
 * Google answers a used, expired, or revoked code with `400 invalid_grant` — that is a user
 * retrying a stale link, not an outage, so it maps to `expired_code` rather than `internal`.
 * Anything else (5xx, a network failure, a malformed body) is ours to treat as an outage.
 */
export async function exchangeGoogleCode(opts: ExchangeGoogleCodeOptions): Promise<{ idToken: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new GoogleAuthError("internal");
  }
  if (!response.ok) throw new GoogleAuthError(response.status === 400 ? "expired_code" : "internal");
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new GoogleAuthError("internal");
  }
  const parsed = tokenResponse.safeParse(json);
  if (!parsed.success) throw new GoogleAuthError("internal");
  return { idToken: parsed.data.id_token };
}

/**
 * Matches migrations/0001_identity_and_tenancy.sql's `email_verified` boolean and Google's own
 * documented quirk: some ID tokens carry `email_verified` as the string `"true"`/`"false"`
 * rather than a JSON boolean, depending on the client library that minted the request.
 */
const idTokenPayload = z.object({
  sub: z.string().min(1).max(255),
  email: z.email(),
  email_verified: z.union([z.boolean(), z.enum(["true", "false"])]).optional(),
  name: z.string().min(1).max(200).optional(),
  nonce: z.string().min(1).optional(),
});

export interface VerifyGoogleIdTokenOptions {
  readonly clientId: string;
  /** The nonce this Worker generated at /auth/google/start. Compared against the token's own. */
  readonly nonce: string;
  /** Overridable so a test can serve a local JWKS instead of Google's. */
  readonly jwksUrl?: string;
  /** Injectable so a test routes the JWKS fetch at a local key server, never the network. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Verifies a Google ID token: signature against Google's published JWKS, issuer, audience,
 * expiry (all via jose), and the OIDC nonce (jose validates none of the last one — `nonce` is not
 * a registered JWT claim, so this checks it by hand against the value the caller remembers).
 */
export async function verifyGoogleIdToken(idToken: string, opts: VerifyGoogleIdTokenOptions): Promise<GoogleIdTokenClaims> {
  const jwks: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(opts.jwksUrl ?? GOOGLE_JWKS_URL),
    opts.fetchImpl ? { [customFetch]: opts.fetchImpl } : {},
  );
  let payload: unknown;
  try {
    ({ payload } = await jwtVerify(idToken, jwks, { issuer: GOOGLE_ISSUER, audience: opts.clientId }));
  } catch {
    throw new GoogleAuthError("token_invalid");
  }
  const claims = idTokenPayload.safeParse(payload);
  // Constant-time comparison buys nothing here: both values are single-use, unpredictable, and
  // this happens once per sign-in rather than on a hot verification path.
  if (!claims.success || claims.data.nonce !== opts.nonce) throw new GoogleAuthError("token_invalid");
  // Checked by testing for the TRUE shapes and inverting, rather than testing for the false
  // shapes directly: fails closed on a missing claim (treated as unverified, never as verified
  // by default), and Google's own boolean/string inconsistency collapses to one check either way.
  const emailVerified = claims.data.email_verified === true || claims.data.email_verified === "true";
  if (!emailVerified) throw new GoogleAuthError("email_unverified");
  return {
    sub: claims.data.sub,
    email: claims.data.email,
    emailVerified,
    name: claims.data.name,
  };
}

/** Re-exported so a caller mapping an unexpected error can fall back to a taxonomy-valid code. */
export function isSigninFailureReason(value: unknown): value is SigninFailureReason {
  return typeof value === "string" && (SIGNIN_FAILURE_REASONS as readonly string[]).includes(value);
}
