/**
 * Google OIDC: the authorize URL, the code exchange, and ID token verification.
 *
 * No Google credential and no network call anywhere in this file. `verifyGoogleIdToken` is
 * exercised against a locally generated RSA keypair: a fake JWKS endpoint (via `fetchImpl`)
 * serves the public key, and a real, correctly-signed token is minted with the private key —
 * proving the verification logic itself, not a mock of it.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode, verifyGoogleIdToken, GoogleAuthError } from "../auth/google.js";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const ISSUER = "https://accounts.google.com";
const KID = "test-key-1";

let privateKey: CryptoKey;
let jwks: { keys: unknown[] };

before(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] };
});

/** Serves the local JWKS instead of the network, matching jose's `customFetch` contract. */
function localJwksFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
}

interface SignOptions {
  readonly sub?: string;
  readonly email?: string;
  readonly emailVerified?: boolean | "true" | "false";
  readonly name?: string;
  readonly nonce?: string | null;
  readonly audience?: string;
  readonly issuer?: string;
  readonly expiresInSeconds?: number;
}

async function signTestIdToken(opts: SignOptions = {}): Promise<string> {
  let token = new SignJWT({
    email: opts.email ?? "person@example.com",
    ...(opts.emailVerified === undefined ? {} : { email_verified: opts.emailVerified }),
    ...(opts.name === undefined ? {} : { name: opts.name }),
    ...(opts.nonce === null ? {} : { nonce: opts.nonce ?? "test-nonce-value-0123456789012345678901234" }),
  })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setSubject(opts.sub ?? "1234567890")
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? CLIENT_ID)
    .setIssuedAt();
  token = token.setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? 3600));
  return token.sign(privateKey);
}

const NONCE = "test-nonce-value-0123456789012345678901234";

test("buildGoogleAuthorizeUrl points at Google's authorize endpoint with every required param", () => {
  const url = new URL(
    buildGoogleAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: "https://app.clueless-creations.com/auth/google/callback", state: "s1", nonce: "n1" }),
  );
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.clueless-creations.com/auth/google/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "s1");
  assert.equal(url.searchParams.get("nonce"), "n1");
});

test("exchangeGoogleCode returns the id_token on a 200 response", async () => {
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("code"), "the-code");
    return new Response(JSON.stringify({ id_token: "the-id-token" }), { status: 200 });
  }) as typeof fetch;
  const result = await exchangeGoogleCode({
    code: "the-code",
    clientId: CLIENT_ID,
    clientSecret: "secret",
    redirectUri: "https://app.clueless-creations.com/auth/google/callback",
    fetchImpl,
  });
  assert.equal(result.idToken, "the-id-token");
});

test("exchangeGoogleCode maps a 400 to expired_code (a used or expired authorization code)", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
  await assert.rejects(
    exchangeGoogleCode({ code: "x", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb", fetchImpl }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "expired_code",
  );
});

test("exchangeGoogleCode maps a 500 to internal", async () => {
  const fetchImpl = (async () => new Response("oops", { status: 500 })) as typeof fetch;
  await assert.rejects(
    exchangeGoogleCode({ code: "x", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb", fetchImpl }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "internal",
  );
});

test("exchangeGoogleCode maps a network failure to internal", async () => {
  const fetchImpl = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  await assert.rejects(
    exchangeGoogleCode({ code: "x", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb", fetchImpl }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "internal",
  );
});

test("exchangeGoogleCode maps a 200 with no id_token to internal", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ access_token: "irrelevant" }), { status: 200 })) as typeof fetch;
  await assert.rejects(
    exchangeGoogleCode({ code: "x", clientId: CLIENT_ID, clientSecret: "s", redirectUri: "https://x/cb", fetchImpl }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "internal",
  );
});

test("verifyGoogleIdToken accepts a correctly signed, correctly claimed token", async () => {
  const token = await signTestIdToken({ email: "person@example.com", emailVerified: true, name: "Ada Lovelace", nonce: NONCE });
  const claims = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() });
  assert.deepEqual(claims, { sub: "1234567890", email: "person@example.com", emailVerified: true, name: "Ada Lovelace" });
});

test("verifyGoogleIdToken accepts email_verified as the string \"true\" (a documented Google quirk)", async () => {
  const token = await signTestIdToken({ emailVerified: "true", nonce: NONCE });
  const claims = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() });
  assert.equal(claims.emailVerified, true);
});

test("verifyGoogleIdToken rejects email_verified: false", async () => {
  const token = await signTestIdToken({ emailVerified: false, nonce: NONCE });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "email_unverified",
  );
});

test("verifyGoogleIdToken rejects email_verified: \"false\" (string form)", async () => {
  const token = await signTestIdToken({ emailVerified: "false", nonce: NONCE });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "email_unverified",
  );
});

test("verifyGoogleIdToken rejects a missing email_verified claim (fails closed, never defaults to verified)", async () => {
  const token = await signTestIdToken({});
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "email_unverified",
  );
});

test("verifyGoogleIdToken rejects the wrong audience", async () => {
  const token = await signTestIdToken({ emailVerified: true, nonce: NONCE, audience: "someone-elses-client-id" });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});

test("verifyGoogleIdToken rejects the wrong issuer", async () => {
  const token = await signTestIdToken({ emailVerified: true, nonce: NONCE, issuer: "https://not-google.example.com" });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});

test("verifyGoogleIdToken rejects a nonce that does not match the one this Worker generated", async () => {
  const token = await signTestIdToken({ emailVerified: true, nonce: "a-different-nonce-value-0123456789012345" });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});

test("verifyGoogleIdToken rejects a token with no nonce claim at all", async () => {
  const token = await signTestIdToken({ emailVerified: true, nonce: null });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});

test("verifyGoogleIdToken rejects an expired token", async () => {
  const token = await signTestIdToken({ emailVerified: true, nonce: NONCE, expiresInSeconds: -60 });
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});

test("verifyGoogleIdToken rejects a token signed by an unrelated key (JWKS has no matching key)", async () => {
  const otherPair = await generateKeyPair("RS256", { extractable: true });
  const token = await new SignJWT({ email: "x@example.com", email_verified: true, nonce: NONCE })
    .setProtectedHeader({ alg: "RS256", kid: "unknown-kid" })
    .setSubject("1234567890")
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(otherPair.privateKey);
  await assert.rejects(
    verifyGoogleIdToken(token, { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});

test("verifyGoogleIdToken rejects garbage that is not a JWT at all", async () => {
  await assert.rejects(
    verifyGoogleIdToken("not-a-jwt", { clientId: CLIENT_ID, nonce: NONCE, fetchImpl: localJwksFetch() }),
    (error: unknown) => error instanceof GoogleAuthError && error.reason === "token_invalid",
  );
});
