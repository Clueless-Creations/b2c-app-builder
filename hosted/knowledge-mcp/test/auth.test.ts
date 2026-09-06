import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AccessError,
  authorizeApiKey,
  authorizePrincipal,
  isConsentSecret,
  parseAccessPolicy,
  sha256,
  validateRedirectUri,
  issueConsentToken,
  verifyConsentToken,
} from "../auth.js";

const ownerKey = `b2c_${"a".repeat(43)}`;
const otherKey = `b2c_${"b".repeat(43)}`;
const secret = "c".repeat(43);

async function policyObject() {
  return {
    version: 1,
    ownerSubject: "eduardo",
    allowedSubjects: ["eduardo"],
    credentials: [
      { id: "owner-1", subject: "eduardo", sha256: await sha256(ownerKey), scopes: ["b2c:read"], revoked: false },
      { id: "other-1", subject: "other", sha256: await sha256(otherKey), scopes: ["b2c:read"], revoked: false },
    ],
  };
}

test("only current allowlisted credentials grant knowledge access", async () => {
  const policy = parseAccessPolicy(JSON.stringify(await policyObject()));
  const principal = await authorizeApiKey(policy, ownerKey);
  assert.equal(principal.subject, "eduardo");
  assert.deepEqual(principal.scopes, ["b2c:read"]);
  await assert.rejects(authorizeApiKey(policy, "invalid"), (error: unknown) => error instanceof AccessError && error.status === 401);
  await assert.rejects(authorizeApiKey(policy, otherKey), (error: unknown) => error instanceof AccessError && error.status === 403);
  assert.throws(() => authorizePrincipal(policy, { ...principal, scopes: [] }), /Access denied/);
  assert.throws(() => authorizePrincipal(policy, { ...principal, subject: "other" }), /Access denied/);
});

test("revocation, expiry, and rotation also invalidate previously issued OAuth principals", async () => {
  const original = await policyObject();
  const principal = await authorizeApiKey(parseAccessPolicy(JSON.stringify(original)), ownerKey);
  for (const change of [{ revoked: true }, { expiresAt: "2020-01-01T00:00:00.000Z" }, { sha256: await sha256(`b2c_${"d".repeat(43)}`) }]) {
    const updated = structuredClone(original);
    Object.assign(updated.credentials[0]!, change);
    const policy = parseAccessPolicy(JSON.stringify(updated));
    await assert.rejects(authorizeApiKey(policy, ownerKey), /Access denied/);
    assert.throws(() => authorizePrincipal(policy, principal), /Access denied/);
  }
});

test("malformed policy fails closed and never includes submitted content in errors", async () => {
  const value = await policyObject();
  const invalid = [
    undefined,
    "not-json",
    JSON.stringify({ ...value, allowedSubjects: [] }),
    JSON.stringify({ ...value, credentials: [value.credentials[0], value.credentials[0]] }),
    JSON.stringify({ ...value, ownerSubject: "owner:eduardo" }),
    JSON.stringify({ ...value, extra: "secret-value" }),
  ];
  for (const input of invalid) {
    assert.throws(
      () => parseAccessPolicy(input),
      (error: unknown) => error instanceof AccessError && error.status === 503 && !error.message.includes("secret-value"),
    );
  }
});

test("callback policy permits native loopback and exact configured HTTPS URLs only", () => {
  const trusted = ["https://chatgpt.com/connector_platform_oauth_redirect"];
  for (const uri of ["http://127.0.0.1:40001/callback", "http://localhost:3000/oauth/callback", "http://[::1]:9000/callback", trusted[0]!]) {
    assert.equal(validateRedirectUri(uri, trusted), true, uri);
  }
  for (const uri of [
    "https://evil.test/callback",
    "http://localhost.evil.test/callback",
    "http://user@localhost:3000/callback",
    "http://localhost:3000/callback#fragment",
    `${trusted[0]}?other=true`,
    "javascript:alert(1)",
  ]) {
    assert.equal(validateRedirectUri(uri, trusted), false, uri);
  }
  const alternateLoopback = new URL("http://127.0.0.1:3000/callback");
  alternateLoopback.hostname = "127.0.0.2";
  assert.equal(validateRedirectUri(alternateLoopback.toString(), trusted), false);
});

test("consent token binds full parameters, nonce, signature, and expiry", async () => {
  const params = "client_id=test&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback&state=s";
  const token = await issueConsentToken(secret, params, 1000);
  assert.equal(await verifyConsentToken(secret, token, params, 1001), true);
  assert.equal(await verifyConsentToken(secret, token, `${params}&scope=other`, 1001), false);
  assert.equal(await verifyConsentToken(secret, `${token}x`, params, 1001), false);
  assert.equal(await verifyConsentToken(secret, token, params, 2000), false);
  assert.equal(await verifyConsentToken("d".repeat(43), token, params, 1001), false);
});

test("isConsentSecret accepts only 43-128 base64url characters on a string, both Workers' shared shape check", () => {
  assert.equal(isConsentSecret("a".repeat(43)), true, "the shortest accepted length");
  assert.equal(isConsentSecret("a".repeat(128)), true, "the longest accepted length");
  assert.equal(isConsentSecret("a".repeat(42)), false, "one character too short");
  assert.equal(isConsentSecret("a".repeat(129)), false, "one character too long");
  assert.equal(isConsentSecret(`${"a".repeat(42)}=`), false, "standard-base64 padding — the 2026-09-02 incident shape");
  assert.equal(isConsentSecret(`${"a".repeat(42)}+`), false, "standard-base64 '+' instead of '-'");
  assert.equal(isConsentSecret(`${"a".repeat(42)}/`), false, "standard-base64 '/' instead of '_'");
  assert.equal(isConsentSecret(undefined), false, "non-string input never matches, regardless of shape");
  assert.equal(isConsentSecret(""), false, "empty string");
});
