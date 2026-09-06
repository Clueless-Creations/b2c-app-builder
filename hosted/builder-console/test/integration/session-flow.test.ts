/**
 * The full Google sign-in round trip against a real, migrated, in-process D1
 * (test/support/d1.ts) and the real Worker dispatcher — not the building blocks tested in
 * isolation elsewhere. google-auth.test.ts already proves verifyGoogleIdToken/exchangeGoogleCode
 * reject a wrong audience/issuer/nonce/expiry on their own; session.test.ts already proves the
 * cookie helpers construct the right header. What neither proves is that worker.ts wires all of
 * it together correctly: that GET /auth/google/start's state/nonce round-trips through GET
 * /auth/google/callback, that the callback actually persists a user + account + owner membership
 * + session in the same D1 the console guard reads, and that GET /console enforces the result.
 *
 * worker.ts exports only its default `{ fetch, scheduled }` handler — no internal route function
 * is exported, unlike M5/M6's handlers (console/keys.ts, billing/webhook.ts), which take an
 * already-resolved session/tenant and have no HTTP-framing opinion of their own to test here.
 * M3's OAuth state and cookie handling *is* the thing this file exists to prove, so going around
 * it through an exported helper would prove nothing. `worker.fetch` is called directly rather
 * than through a booted Miniflare Worker — the same choice test/integration/stripe-webhook.test.ts
 * documents for handleStripeWebhook: env/ctx are plain arguments already, so a real Request into
 * the real exported function is enough, with no Worker boot needed just to prove this behaviour.
 *
 * No network call anywhere in this file. Google's token and JWKS endpoints are served by one
 * global `fetch` stub keyed by URL; a request to Stripe's Customer-creation endpoint always
 * throws — sign-in has no Stripe dependency left at all (0008_lazy_stripe_customer.sql,
 * worker.ts's handleGoogleCallback), and this suite's own "the callback never calls Stripe"
 * test below is what that throwing stub exists to catch. Anything else this Worker tried to call
 * also throws, so a route accidentally reaching the real network fails loudly instead of hanging
 * or silently passing.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { sha256 } from "../../../knowledge-mcp/auth.js";
import { tenantDb, type TenantDb } from "../../../knowledge-mcp/db/tenant.js";
import { generateOpaqueToken } from "../../auth/session.js";
import worker from "../../worker.js";
import { createTestDatabase, type TestDatabase } from "../support/d1.js";

const ORIGIN = "https://app.clueless-creations.com";
const CLIENT_ID = "session-flow-test.apps.googleusercontent.com";
const KID = "session-flow-test-key";

/** Reads worker.ts's own declared parameter types back out, instead of naming AppEnv — which is not exported (deliberately: it is this Worker's own concern, not a public contract). */
type WorkerEnv = Parameters<typeof worker.fetch>[1];
type WorkerCtx = Parameters<typeof worker.fetch>[2];

let harness: TestDatabase;
let repository: TenantDb;
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let restoreFetch: () => void;

/** Set just before the request expected to consume it. Left mismatched, a test fails loudly rather than reusing a stale value. */
let nextIdToken: string | undefined;

before(async () => {
  harness = await createTestDatabase();
  repository = tenantDb(harness.db);

  // Mirrors google-auth.test.ts: a locally generated RSA keypair, so the JWKS stub below serves
  // a real public key and every signed token is verified against it for real, not assumed valid.
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] };

  const original = globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      assert.ok(nextIdToken, `unexpected token exchange with no id token queued (${url})`);
      return new Response(JSON.stringify({ id_token: nextIdToken }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      return new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.stripe.com/v1/customers") {
      // Sign-in must never reach this: a failing Stripe fetch stub that never affects sign-in is
      // exactly the proof 0008_lazy_stripe_customer.sql's change is meant to give.
      throw new Error("session-flow.test.ts: sign-in called Stripe's Customer-creation endpoint — it must not depend on Stripe at all");
    }
    throw new Error(`session-flow.test.ts: unexpected fetch to ${url} — this suite stubs every network call the sign-in path can make`);
  }) as typeof fetch;
});

after(async () => {
  restoreFetch();
  await harness.dispose();
});

/**
 * An always-empty KV: GET /console (which the "creates a user, account..." test below reaches
 * after sign-in) now resolves the checkout gate on every render (worker.ts's checkoutGateFor),
 * which reads this binding before it reads anything else. A KV with no cached flag definitions
 * resolves the gate closed (analytics/flags.ts's resolveCheckoutGate, "definitions_missing"),
 * which renders the same interest-form shell this suite's own assertions already expect —
 * flags.test.ts and console-flow.test.ts's own memoryKv() already prove the gate's behaviour in
 * every other state; this suite has no reason to exercise it and just needs it to not throw.
 */
function memoryFlagsKv() {
  const map = new Map<string, string>();
  return { get: async (key: string) => map.get(key) ?? null, put: async (key: string, value: string) => void map.set(key, value) };
}

function makeEnv(): WorkerEnv {
  return {
    DB: harness.db,
    FLAGS_KV: memoryFlagsKv(),
    POSTHOG_HOST: "https://us.i.posthog.com",
    // Deliberately invalid: capture.ts's validConfig() rejects an empty token before any fetch
    // is attempted, so this suite's fetch stub never has to also understand PostHog's endpoint.
    POSTHOG_PROJECT_TOKEN: "",
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    B2C_APP_CONSOLE_AUTH_SECRET: "s".repeat(64),
    STRIPE_RESTRICTED_KEY: `rk_test_${"a".repeat(24)}`,
    STRIPE_WEBHOOK_SECRET: "whsec_test_unused_by_this_suite",
  } as unknown as WorkerEnv;
}

/**
 * Matches console-keys.test.ts's collectingCtx(): captures every background capture so a test can
 * await it before asserting, instead of racing it. Drains rather than one Promise.all:
 * captureConsoleEvent's objection check nests a second ctx.waitUntil call inside the first, so a
 * new entry can land in `pending` only after this function has already started awaiting today's
 * contents.
 */
function collectingCtx(): { ctx: WorkerCtx; settle: () => Promise<unknown> } {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) } as unknown as WorkerCtx,
    settle: async () => {
      let processed = 0;
      while (processed < pending.length) {
        const batch = pending.slice(processed);
        processed = pending.length;
        await Promise.all(batch);
      }
    },
  };
}

async function dispatch(request: Request, env: WorkerEnv): Promise<Response> {
  const { ctx, settle } = collectingCtx();
  const response = await worker.fetch(request, env, ctx);
  await settle();
  return response;
}

/** The `name=value` prefix of one `Set-Cookie` value — what a browser echoes back in `Cookie`. */
function cookiePair(setCookieValue: string): string {
  return setCookieValue.split(";")[0]!;
}

function findSetCookie(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`));
}

async function signIdToken(opts: { readonly sub: string; readonly email: string; readonly nonce: string }): Promise<string> {
  return new SignJWT({ email: opts.email, email_verified: true, nonce: opts.nonce })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setSubject(opts.sub)
    .setIssuer("https://accounts.google.com")
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

/** GET /auth/google/start, and the two things a callback needs out of it: the echoed state/nonce and the state cookie to send back. */
async function startSignin(env: WorkerEnv): Promise<{ state: string; nonce: string; oauthStateCookie: string }> {
  const response = await dispatch(new Request(`${ORIGIN}/auth/google/start`), env);
  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.ok(location, "GET /auth/google/start must redirect somewhere");
  const authorizeUrl = new URL(location!);
  assert.equal(authorizeUrl.origin, "https://accounts.google.com");
  const stateCookie = findSetCookie(response, "__Host-b2c-oauth-state");
  assert.ok(stateCookie, "GET /auth/google/start must set the oauth state cookie");
  const state = authorizeUrl.searchParams.get("state");
  const nonce = authorizeUrl.searchParams.get("nonce");
  assert.ok(state && nonce);
  return { state: state!, nonce: nonce!, oauthStateCookie: cookiePair(stateCookie!) };
}

/** The full start -> callback round trip for one Google account. */
async function completeSignin(env: WorkerEnv, opts: { readonly sub: string; readonly email: string }): Promise<Response> {
  const { state, nonce, oauthStateCookie } = await startSignin(env);
  nextIdToken = await signIdToken({ sub: opts.sub, email: opts.email, nonce });
  const callbackUrl = new URL(`${ORIGIN}/auth/google/callback`);
  callbackUrl.searchParams.set("code", "test-authorization-code");
  callbackUrl.searchParams.set("state", state);
  return dispatch(new Request(callbackUrl, { headers: { Cookie: oauthStateCookie } }), env);
}

test("GET / hands off to /console instead of answering 404, and refuses other methods", async () => {
  const response = await dispatch(new Request(`${ORIGIN}/`), makeEnv());
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("Location")!, ORIGIN).pathname, "/console");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");

  const head = await dispatch(new Request(`${ORIGIN}/`, { method: "HEAD" }), makeEnv());
  assert.equal(head.status, 302);

  const post = await dispatch(new Request(`${ORIGIN}/`, { method: "POST" }), makeEnv());
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD");
});

test("GET /console redirects to the sign-in page, not straight to Google, when no session cookie is present", async () => {
  const response = await dispatch(new Request(`${ORIGIN}/console`), makeEnv());
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location")!, ORIGIN);
  assert.equal(location.pathname, "/signin");
  assert.equal(location.searchParams.get("entry_point"), "console_guard");
});

test("GET /signin is the front door: the page for a visitor, carrying entry_point to the Google button, and /console for a signed-in person", async () => {
  const env = makeEnv();
  const response = await dispatch(new Request(`${ORIGIN}/signin?entry_point=header`), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /default-src 'none'/);
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /font-src 'self'/);
  const html = await response.text();
  // The headline only proves the front door rendered; test/signin-offer.test.ts owns the
  // full purchase-copy contract, so reword there and here together.
  assert.match(html, /Use the agent you already have\./);
  assert.match(html, /Continue with Google/);
  assert.ok(html.includes('href="/auth/google/start?entry_point=header"'), "the button keeps the entry point the site sent");
  assert.match(html, /clueless-creations\.com\/terms\//);
  assert.match(html, /clueless-creations\.com\/privacy\//);
  assert.match(html, /github\.com\/Clueless-Creations\/b2c-app-builder/);
  assert.doesNotMatch(html, /<script/i, "the sign-in page carries no script");
  // An unknown entry point is coerced to landing, and a notice renders only from the closed set.
  const coerced = await (await dispatch(new Request(`${ORIGIN}/signin?entry_point=evil&notice=<b>x</b>`), env)).text();
  assert.ok(coerced.includes('href="/auth/google/start?entry_point=landing"'));
  assert.doesNotMatch(coerced, /<b>x<\/b>/);
  const signedOut = await (await dispatch(new Request(`${ORIGIN}/signin?notice=signed_out`), env)).text();
  assert.match(signedOut, /signed out/);
  assert.equal((await dispatch(new Request(`${ORIGIN}/signin`, { method: "POST" }), env)).status, 405);

  const callback = await completeSignin(env, { sub: "google-sub-signin-page", email: "door@example.com" });
  const sessionCookie = findSetCookie(callback, "__Host-b2c-session");
  const again = await dispatch(new Request(`${ORIGIN}/signin`, { headers: { Cookie: cookiePair(sessionCookie!) } }), env);
  assert.equal(again.status, 302);
  assert.equal(new URL(again.headers.get("Location")!, ORIGIN).pathname, "/console");
});

test("Google's own error callback lands on the sign-in page with a notice, never back on Google", async () => {
  const env = makeEnv();
  const { oauthStateCookie } = await startSignin(env);
  const response = await dispatch(new Request(`${ORIGIN}/auth/google/callback?error=access_denied`, { headers: { Cookie: oauthStateCookie } }), env);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location")!, ORIGIN);
  assert.equal(location.pathname, "/signin");
  assert.equal(location.searchParams.get("notice"), "cancelled");
  const cleared = findSetCookie(response, "__Host-b2c-oauth-state");
  assert.match(cleared ?? "", /Max-Age=0/);
});

test("the console header names the person and carries a sign-out form; POST /auth/signout revokes the session and refuses a bad token", async () => {
  const env = makeEnv();
  const callback = await completeSignin(env, { sub: "google-sub-signout", email: "chef@example.com" });
  const cookie = cookiePair(findSetCookie(callback, "__Host-b2c-session")!);
  const consolePage = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: cookie } }), env);
  assert.equal(consolePage.status, 200);
  const html = await consolePage.text();
  assert.match(html, /chef@example\.com/, "the header shows who is signed in");
  const token = /action="\/auth\/signout"><input type="hidden" name="signout_token" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(token, "the header carries the sign-out form with its own token");
  const keysPage = await dispatch(new Request(`${ORIGIN}/console/keys`, { headers: { Cookie: cookie } }), env);
  assert.match(await keysPage.text(), /action="\/auth\/signout"/, "every signed-in page carries the sign-out form");

  const bad = await dispatch(
    new Request(`${ORIGIN}/auth/signout`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: "signout_token=forged",
    }),
    env,
  );
  assert.equal(bad.status, 403, "a forged token must not end the session");
  assert.equal((await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: cookie } }), env)).status, 200, "the session survives a forged sign-out");

  const wrongMethod = await dispatch(new Request(`${ORIGIN}/auth/signout`, { headers: { Cookie: cookie } }), env);
  assert.equal(wrongMethod.status, 405);

  const signedOut = await dispatch(
    new Request(`${ORIGIN}/auth/signout`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: `signout_token=${encodeURIComponent(token!)}`,
    }),
    env,
  );
  assert.equal(signedOut.status, 303);
  const location = new URL(signedOut.headers.get("Location")!, ORIGIN);
  assert.equal(location.pathname, "/signin");
  assert.equal(location.searchParams.get("notice"), "signed_out");
  assert.match(findSetCookie(signedOut, "__Host-b2c-session") ?? "", /Max-Age=0/);
  // The row is revoked, not just the cookie cleared: the same token no longer opens the console.
  const after = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: cookie } }), env);
  assert.equal(after.status, 302);
  assert.equal(new URL(after.headers.get("Location")!, ORIGIN).pathname, "/signin");
  // And a signed-out POST is turned away at the guard, writing nothing.
  const anonymous = await dispatch(new Request(`${ORIGIN}/auth/signout`, { method: "POST", body: "signout_token=x" }), env);
  assert.equal(anonymous.status, 302);
});

test("the console serves its own two fonts from /fonts/ with a year-long immutable cache", async () => {
  const env = makeEnv();
  const font = await dispatch(new Request(`${ORIGIN}/fonts/inter-b2c-500.woff2`), env);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("Content-Type"), "font/woff2");
  assert.match(font.headers.get("Cache-Control") ?? "", /immutable/);
  const bytes = new Uint8Array(await font.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "wOF2", "a real WOFF2 file, not the base64 text");
  assert.equal((await dispatch(new Request(`${ORIGIN}/fonts/missing.woff2`), env)).status, 404);
  assert.equal((await dispatch(new Request(`${ORIGIN}/fonts/inter-b2c-500.woff2`, { method: "POST" }), env)).status, 405);
});

test("console responses are never cacheable, while the fonts keep their immutable cache", async () => {
  const env = makeEnv();
  // The signed-out front door is a console response like any other, and it is the one every
  // unauthenticated request reaches — if no-store is missing anywhere, it is missing here.
  const frontDoor = await dispatch(new Request(`${ORIGIN}/console`), env);
  assert.equal(frontDoor.headers.get("Cache-Control"), "no-store");
  // securityHeaders sets no-store only where no policy is declared, so the deliberate year-long
  // font cache survives. A blanket set would silently undo it, which is what this pins.
  const font = await dispatch(new Request(`${ORIGIN}/fonts/inter-b2c-500.woff2`), env);
  assert.match(font.headers.get("Cache-Control") ?? "", /immutable/);
  assert.doesNotMatch(font.headers.get("Cache-Control") ?? "", /no-store/);
});

test("the callback creates a user, account, owner membership, and session for a first-time sign-in, with no Stripe Customer", async () => {
  const env = makeEnv();
  const sub = "900000000000000000001";

  const callbackResponse = await completeSignin(env, { sub, email: "first@example.com" });
  assert.equal(callbackResponse.status, 302);
  assert.equal(new URL(callbackResponse.headers.get("Location")!, ORIGIN).pathname, "/console");
  const sessionCookie = findSetCookie(callbackResponse, "__Host-b2c-session");
  assert.ok(sessionCookie, "the callback must set the session cookie on success");

  const found = await repository.findUserByGoogleSub(sub);
  assert.ok(found, "createUserAndAccountFromGoogle must leave a row findUserByGoogleSub resolves");
  assert.equal(await harness.countRows("memberships", found!.accountId), 1);
  assert.equal(await harness.countRows("sessions", found!.accountId), 1);
  // The whole point of 0008_lazy_stripe_customer.sql: sign-in writes no Stripe Customer at all —
  // the fetch stub above would have thrown had the callback tried to create one.
  assert.equal(await repository.getAccountStripeCustomerId(found!.accountId), null);

  // The cookie the callback handed back actually authenticates: GET /console renders the shell,
  // not another redirect back to sign-in.
  const consoleResponse = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: cookiePair(sessionCookie!) } }), env);
  assert.equal(consoleResponse.status, 200);
  assert.match(await consoleResponse.text(), /Welcome back/);
});

test("GET /console answers 503 with the unavailable page, not a thrown error, when B2C_APP_CONSOLE_AUTH_SECRET is the wrong shape, while /health stays healthy", async () => {
  const env = makeEnv();
  const sub = "900000000000000000005";
  const callbackResponse = await completeSignin(env, { sub, email: "malformed-secret@example.com" });
  const sessionCookie = findSetCookie(callbackResponse, "__Host-b2c-session");
  assert.ok(sessionCookie, "the callback must set the session cookie on success");

  // Standard base64 with '=' padding — the exact 2026-09-02 incident shape: consentKey's own
  // regex (../../knowledge-mcp/auth.ts) rejects it, but previously only once a console handler actually
  // tried to sign or verify a CSRF token, deep inside rendering /console. worker.ts now checks the
  // shape before requireConsoleSession runs at all.
  const brokenEnv: WorkerEnv = { ...env, B2C_APP_CONSOLE_AUTH_SECRET: `${"a".repeat(42)}==` };

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: cookiePair(sessionCookie!) } }), brokenEnv);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /temporarily unavailable/i);

  const health = await dispatch(new Request(`${ORIGIN}/health`), brokenEnv);
  assert.equal(health.status, 200, "a malformed console CSRF secret must not take /health down with it");
});

test("a second sign-in from the same Google account reuses the existing user and account", async () => {
  const env = makeEnv();
  const sub = "900000000000000000002";

  const first = await completeSignin(env, { sub, email: "second@example.com" });
  assert.equal(first.status, 302);
  const firstFound = await repository.findUserByGoogleSub(sub);
  assert.ok(firstFound);

  // Neither call may reach Stripe at all — the fetch stub above throws if either does, which is
  // this test's real assertion; the rest just proves the repository state agrees.
  const second = await completeSignin(env, { sub, email: "second@example.com" });
  assert.equal(second.status, 302);
  assert.equal(new URL(second.headers.get("Location")!, ORIGIN).pathname, "/console");

  const secondFound = await repository.findUserByGoogleSub(sub);
  assert.deepEqual(secondFound, firstFound, "the second sign-in must resolve to the same user and account, not a new one");
  assert.equal(await harness.countRows("memberships", firstFound!.accountId), 1, "still exactly one membership, not a duplicate");
  assert.equal(await harness.countRows("sessions", firstFound!.accountId), 2, "one session per login, both live");

  const firstSessionCookie = findSetCookie(first, "__Host-b2c-session");
  const secondSessionCookie = findSetCookie(second, "__Host-b2c-session");
  assert.notEqual(cookiePair(firstSessionCookie!), cookiePair(secondSessionCookie!), "each login mints its own session token");
});

test("an expired session is refused at the console guard, and its cookie is cleared", async () => {
  const env = makeEnv();
  const { accountId } = await repository.createUserAndAccountFromGoogle({
    userId: crypto.randomUUID(),
    googleSub: "900000000000000000003",
    email: "expired@example.com",
    emailVerified: true,
    displayName: null,
    stripeCustomerId: "cus_SESSIONFLOWEXPIRED1",
  });
  const found = await repository.findUserByGoogleSub("900000000000000000003");
  const rawToken = generateOpaqueToken();
  await repository.createSession(accountId, found!.userId, { rawToken, expiresAt: new Date(Date.now() - 60_000).toISOString() });

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: `__Host-b2c-session=${rawToken}` } }), env);
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("Location")!, ORIGIN).pathname, "/signin");
  const cleared = findSetCookie(response, "__Host-b2c-session");
  assert.ok(cleared, "an expired session must clear the cookie, not just redirect");
  assert.match(cleared!, /Max-Age=0/);
});

test("a revoked session is refused at the console guard, and its cookie is cleared", async () => {
  const env = makeEnv();
  const { accountId } = await repository.createUserAndAccountFromGoogle({
    userId: crypto.randomUUID(),
    googleSub: "900000000000000000004",
    email: "revoked@example.com",
    emailVerified: true,
    displayName: null,
    stripeCustomerId: "cus_SESSIONFLOWREVOKED1",
  });
  const found = await repository.findUserByGoogleSub("900000000000000000004");
  const rawToken = generateOpaqueToken();
  const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await repository.createSession(accountId, found!.userId, { rawToken, expiresAt: farFuture });
  const changed = await repository.revokeSession(accountId, await sha256(rawToken));
  assert.equal(changed, true, "revokeSession must report that it actually revoked this session");

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: `__Host-b2c-session=${rawToken}` } }), env);
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("Location")!, ORIGIN).pathname, "/signin");
  const cleared = findSetCookie(response, "__Host-b2c-session");
  assert.ok(cleared, "a revoked session must clear the cookie, not just redirect");
  assert.match(cleared!, /Max-Age=0/);
});
