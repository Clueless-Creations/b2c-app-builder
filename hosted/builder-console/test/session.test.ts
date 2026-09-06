/**
 * Pure-function coverage for auth/session.ts: cookie construction and parsing, token shape, and
 * the OAuth state round trip. No D1 and no Miniflare — that layer is
 * test/integration/session-flow.test.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearOAuthStateCookieHeader,
  clearSessionCookieHeader,
  generateOpaqueToken,
  oauthStateCookieHeader,
  readBrowserDistinctId,
  readCookie,
  readOAuthState,
  readSessionToken,
  sessionCookieHeader,
  sessionExpiresAt,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "../auth/session.js";

function requestWithCookie(cookie: string): Request {
  return new Request("https://app.clueless-creations.com/console", { headers: { Cookie: cookie } });
}

test("generateOpaqueToken produces a 43-character base64url string with no padding", () => {
  const token = generateOpaqueToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, generateOpaqueToken());
});

test("sessionExpiresAt adds SESSION_TTL_MS to the given instant", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  assert.equal(sessionExpiresAt(now).getTime(), now.getTime() + SESSION_TTL_MS);
});

test("sessionCookieHeader sets every required attribute for a __Host- cookie", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  const expiresAt = new Date(now.getTime() + 3600_000);
  const header = sessionCookieHeader("raw-token-value", expiresAt, now);
  assert.match(header, new RegExp(`^${SESSION_COOKIE_NAME}=raw-token-value; `));
  assert.match(header, /Secure/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.match(header, /Max-Age=3600\b/);
  // __Host- forbids Domain outright; asserting its absence keeps the prefix's own guarantee true.
  assert.doesNotMatch(header, /Domain=/);
});

test("sessionCookieHeader never emits a negative Max-Age for an already-expired instant", () => {
  const now = new Date("2026-09-01T01:00:00.000Z");
  const expiresAt = new Date("2026-09-01T00:00:00.000Z");
  const header = sessionCookieHeader("t", expiresAt, now);
  assert.match(header, /Max-Age=0\b/);
});

test("clearSessionCookieHeader expires the cookie immediately", () => {
  assert.match(clearSessionCookieHeader(), new RegExp(`^${SESSION_COOKIE_NAME}=; .*Max-Age=0\\b`));
});

test("readSessionToken reads the session cookie value back", () => {
  const request = requestWithCookie(`${SESSION_COOKIE_NAME}=abc123; other=1`);
  assert.equal(readSessionToken(request), "abc123");
});

test("readCookie returns undefined for a name that is not present", () => {
  assert.equal(readCookie(requestWithCookie("a=1; b=2"), "c"), undefined);
});

test("readCookie returns undefined when a name appears twice, rather than guessing which one", () => {
  const request = requestWithCookie(`${SESSION_COOKIE_NAME}=first; ${SESSION_COOKIE_NAME}=second`);
  assert.equal(readSessionToken(request), undefined);
});

test("readCookie returns undefined when there is no Cookie header at all", () => {
  assert.equal(readCookie(new Request("https://app.clueless-creations.com/"), SESSION_COOKIE_NAME), undefined);
});

test("oauthStateCookieHeader packs state and nonce, and readOAuthState round-trips them", () => {
  const state = generateOpaqueToken();
  const nonce = generateOpaqueToken();
  const header = oauthStateCookieHeader({ state, nonce });
  assert.match(header, /Secure/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  const cookieValue = header.split(";")[0]!.split("=").slice(1).join("=");
  const request = requestWithCookie(`__Host-b2c-oauth-state=${cookieValue}`);
  assert.deepEqual(readOAuthState(request), { state, nonce });
});

test("readOAuthState returns undefined for a malformed value", () => {
  const request = requestWithCookie("__Host-b2c-oauth-state=not-two-dot-separated-tokens");
  assert.equal(readOAuthState(request), undefined);
});

test("readOAuthState returns undefined when the cookie is absent", () => {
  assert.equal(readOAuthState(new Request("https://app.clueless-creations.com/auth/google/callback")), undefined);
});

test("clearOAuthStateCookieHeader expires the state cookie immediately", () => {
  assert.match(clearOAuthStateCookieHeader(), /^__Host-b2c-oauth-state=; .*Max-Age=0\b/);
});

test("readBrowserDistinctId reads posthog-js's own persistence cookie", () => {
  const payload = encodeURIComponent(JSON.stringify({ distinct_id: "anon-abc123", $device_id: "device-1" }));
  const request = requestWithCookie(`ph_phc_test_token_posthog=${payload}`);
  assert.equal(readBrowserDistinctId(request), "anon-abc123");
});

test("readBrowserDistinctId returns undefined when no posthog cookie is present", () => {
  assert.equal(readBrowserDistinctId(requestWithCookie("unrelated=1")), undefined);
});

test("readBrowserDistinctId returns undefined for a malformed posthog cookie rather than throwing", () => {
  const request = requestWithCookie("ph_phc_test_token_posthog=not-json-at-all%");
  assert.equal(readBrowserDistinctId(request), undefined);
});

test("readBrowserDistinctId returns undefined when the cookie's JSON has no distinct_id", () => {
  const payload = encodeURIComponent(JSON.stringify({ $device_id: "device-1" }));
  const request = requestWithCookie(`ph_phc_test_token_posthog=${payload}`);
  assert.equal(readBrowserDistinctId(request), undefined);
});
