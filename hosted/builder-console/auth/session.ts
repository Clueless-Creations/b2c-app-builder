/**
 * The browser session cookie: raw-token generation, the `Set-Cookie` header, and reading the
 * token back off an incoming request.
 *
 * The token/digest split mirrors api_keys exactly (auth.ts's own comparison table in
 * migrations/README.md lists `sessions.id` as the same digest shape as `api_keys.sha256_hex`):
 * this module hands the caller a raw 43-character token to put in the cookie and, separately, to
 * pass to `tenantDb.createSession`, which persists only its SHA-256 — a database dump yields no
 * usable session, the same guarantee api_keys already gives a stolen row.
 */

import { Buffer } from "node:buffer";

/** `__Host-` forces Secure, forbids Domain, and forces Path=/ — the strictest cookie prefix. */
export const SESSION_COOKIE_NAME = "__Host-b2c-session";

/**
 * 30 days. A browser session is a "stay signed in" convenience, not a short-lived credential —
 * unlike an API key (no expiry by default) or an OAuth access token (10 minutes, oauth.ts) —
 * so it sits closer to a typical consumer-SaaS remember-me window. Revocation does not depend on
 * this value: `tenantDb.revokeSession` (M5's console) ends a session immediately regardless of
 * how much of this window remains.
 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Same construction as auth.ts's consent-token nonce: 32 random bytes, 43 base64url characters.
 * Shared by the session token and the OAuth `state`/`nonce` pair below — all three need the same
 * 256 bits of unpredictability and nothing else, so one generator serves all three call sites.
 */
export function generateOpaqueToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function sessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/**
 * The `Set-Cookie` value for a freshly created session. `Max-Age` (not `Expires`) so the
 * lifetime is relative to when the header is sent, matching `expiresAt`'s own computation.
 */
export function sessionCookieHeader(rawToken: string, expiresAt: Date, now = new Date()): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  return `${SESSION_COOKIE_NAME}=${rawToken}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

/** Clears the session cookie. Sent alongside a 401/403 from a stale or revoked session. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Reads one named cookie's value off a request's `Cookie` header.
 *
 * A malformed header (a duplicate name, or a value containing a raw `=`/`;` a browser would
 * never send) is treated as absent rather than guessed at — the caller's redirect-to-sign-in
 * fallback is exactly as safe as rejecting outright, and guessing invites a smuggling bug later.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  const matches = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]!.slice(name.length + 1) : undefined;
}

export function readSessionToken(request: Request): string | undefined {
  return readCookie(request, SESSION_COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// OAuth state — the short-lived cookie that survives the round trip to Google
// ---------------------------------------------------------------------------

/** Fixed name: this Worker runs one Google sign-in flow at a time per browser. */
const OAUTH_STATE_COOKIE_NAME = "__Host-b2c-oauth-state";

/** 5 minutes — long enough for a human to pick a Google account, short enough to bound replay. */
const OAUTH_STATE_TTL_SECONDS = 300;

export interface OAuthState {
  readonly state: string;
  readonly nonce: string;
}

/**
 * Packs `state` and `nonce` into one cookie value. Both halves are independently unpredictable
 * (32 random bytes each), and the cookie is `HttpOnly` + `Secure`, so — exactly like a session or
 * an API key elsewhere in this codebase — the value's own unpredictability is the security
 * property; no HMAC signature is layered on top, because there is nothing here a signature would
 * protect that unpredictability plus `HttpOnly` does not already.
 *
 * `state` alone defeats CSRF on the callback (compared against Google's echoed `state` query
 * param via `constantTimeEqual`, in the callback handler); `nonce` has no return trip through
 * Google's redirect and is recovered from this cookie instead, to be checked against the
 * `nonce` claim inside the verified ID token.
 */
export function oauthStateCookieHeader(value: OAuthState): string {
  return `${OAUTH_STATE_COOKIE_NAME}=${value.state}.${value.nonce}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_TTL_SECONDS}`;
}

export function clearOAuthStateCookieHeader(): string {
  return `${OAUTH_STATE_COOKIE_NAME}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

const OAUTH_STATE_PATTERN = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

/** Reads the state cookie back. `undefined` for anything absent, duplicated, or malformed. */
export function readOAuthState(request: Request): OAuthState | undefined {
  const raw = readCookie(request, OAUTH_STATE_COOKIE_NAME);
  if (raw === undefined) return undefined;
  const match = OAUTH_STATE_PATTERN.exec(raw);
  return match ? { state: match[1]!, nonce: match[2]! } : undefined;
}

// ---------------------------------------------------------------------------
// Browser identity — best-effort, for the one server-fired event with no session yet
// ---------------------------------------------------------------------------

/** posthog-js's own persistence cookie: `ph_<project_token>_posthog`, holding a JSON blob. */
const POSTHOG_COOKIE_NAME_PATTERN = /^ph_.+_posthog$/;

/**
 * Best-effort read of posthog-js's own persistence cookie, so `signin_started` — fired from this
 * server before any session exists — can land on the same anonymous person the browser's own
 * `posthog-js` calls use, instead of skipping identity entirely.
 *
 * Never throws and never fabricates a value. A missing, differently-shaped, or malformed cookie
 * returns `undefined`, and the caller skips the event rather than inventing a `distinct_id` — a
 * fabricated one would create a phantom person and inflate the funnel, the same rule
 * EVENT_TAXONOMY.md states for `interest_submitted` and applied here for the same reason. In
 * practice this resolves whenever the visitor loaded a page with the browser snippet first,
 * which is the ordinary path to this route; a bookmarked or directly-typed link has no such
 * cookie yet and simply does not get this one event.
 */
export function readBrowserDistinctId(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq);
    if (!POSTHOG_COOKIE_NAME_PATTERN.test(name)) continue;
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(trimmed.slice(eq + 1)));
      const distinctId = (parsed as { distinct_id?: unknown } | null)?.distinct_id;
      if (typeof distinctId === "string" && distinctId.length > 0) return distinctId;
    } catch {
      // Malformed cookie. Keep scanning — a stale duplicate from an earlier project token
      // rotation could otherwise shadow a well-formed one later in the header.
    }
  }
  return undefined;
}
