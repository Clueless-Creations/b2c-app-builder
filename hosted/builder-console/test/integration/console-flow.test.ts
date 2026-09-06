/**
 * The console's API-key surface, driven through the REAL `worker.fetch` — not through
 * `handleConsoleKeysRequest` called directly (console-keys.test.ts already proves that handler's
 * own logic in isolation, with a hand-built `ConsoleSession`). What neither that file nor
 * session-flow.test.ts proves is that `worker.ts` actually wires the two together: that a session
 * cookie minted by the real Google callback is the same session `requireConsoleSession` resolves
 * for `isConsoleKeysPath`, that `csrfSecret: env.B2C_APP_CONSOLE_AUTH_SECRET` is threaded through
 * correctly, and that the tenant scoping console-keys.test.ts proves at the handler layer still
 * holds when the request arrives the way a browser's actually would.
 *
 * Sign-in reuses session-flow.test.ts's pattern verbatim (a locally generated RSA keypair behind
 * a stubbed Google JWKS/token endpoint) rather than importing it — worker.fetch is the only thing
 * session-flow.test.ts exports nothing from, and every helper there is file-local by design (its
 * own doc comment: no exported route function to go around, on purpose). The Stripe
 * customer-creation endpoint is stubbed to throw, not to succeed: 0008_lazy_stripe_customer.sql
 * means sign-in has no Stripe dependency left at all, and every account this suite signs in
 * starts with no Customer — checkout-flow.test.ts is where a Customer actually gets created.
 *
 * Unlike session-flow.test.ts, `POSTHOG_PROJECT_TOKEN` here is a shape-valid token, not the
 * deliberately-invalid empty string: this suite exists partly to assert the exact
 * `api_key_created` / `api_key_revoked` capture payloads, so capture has to actually attempt its
 * POST. That widens the fetch stub to also serve PostHog's capture endpoint — every other stubbed
 * endpoint is unchanged from session-flow.test.ts's set.
 *
 * The privacy-gate assertions (no `api_keys.last_used_at`, no `audit_events` row) read back
 * through `TenantDb` (`getApiKey`'s `lastUsedAt`, `listAuditEvents`) rather than raw D1: this
 * package's `lint:tenant` confines `.prepare(` to `interest/repository.ts` and
 * `test/support/d1.ts`, and the repository already exposes both columns this gate cares about.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { tenantDb, type AccountId, type TenantDb } from "../../../knowledge-mcp/db/tenant.js";
import worker from "../../worker.js";
import { createTestDatabase, type TestDatabase } from "../support/d1.js";

const ORIGIN = "https://app.clueless-creations.com";
const CLIENT_ID = "console-flow-test.apps.googleusercontent.com";
const KID = "console-flow-test-key";
/** Shape-valid per capture.ts's validConfig: `phc_` + 20-64 further characters. */
const POSTHOG_TOKEN = "phc_" + "a".repeat(43);

type WorkerEnv = Parameters<typeof worker.fetch>[1];
type WorkerCtx = Parameters<typeof worker.fetch>[2];

interface CapturedEvent {
  readonly event: string;
  readonly distinct_id: string;
  readonly properties: Record<string, unknown>;
}

/**
 * A plain in-memory stand-in for the console's `FLAGS_KV` binding — the same shape
 * `test/flags.test.ts` already uses for the same binding's other tenant (flag definitions), not a
 * real Miniflare KV namespace: `worker.fetch` is called directly here, exactly as
 * session-flow.test.ts's own doc comment explains, so `env` is a plain bag of values rather than
 * something running inside a booted Worker.
 */
function memoryKv() {
  const map = new Map<string, string>();
  let broken = false;
  let getCalls = 0;
  return {
    get: async (key: string) => {
      getCalls += 1;
      if (broken) throw new Error("flags kv unavailable");
      return map.get(key) ?? null;
    },
    put: async (key: string, value: string) => void map.set(key, value),
    map,
    setBroken: (value: boolean) => {
      broken = value;
    },
    getCallCount: () => getCalls,
  };
}

let harness: TestDatabase;
let repository: TenantDb;
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let restoreFetch: () => void;
let capturedEvents: CapturedEvent[];
let env: WorkerEnv;
let flagsKv: ReturnType<typeof memoryKv>;

/** Set just before the request expected to consume it, matching session-flow.test.ts. */
let nextIdToken: string | undefined;

before(async () => {
  harness = await createTestDatabase();
  repository = tenantDb(harness.db);
  capturedEvents = [];
  flagsKv = memoryKv();
  // Built only now: makeEnv() reads harness.db, which does not exist until the line above.
  env = makeEnv();

  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: KID, use: "sig", alg: "RS256" }] };

  const original = globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://oauth2.googleapis.com/token") {
      assert.ok(nextIdToken, `unexpected token exchange with no id token queued (${url})`);
      return new Response(JSON.stringify({ id_token: nextIdToken }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      return new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.stripe.com/v1/customers") {
      // Sign-in must never reach this — 0008_lazy_stripe_customer.sql's whole point, and
      // session-flow.test.ts's own fetch stub makes the identical assertion.
      throw new Error("console-flow.test.ts: sign-in called Stripe's Customer-creation endpoint — it must not depend on Stripe at all");
    }
    if (url === "https://us.i.posthog.com/i/v0/e") {
      capturedEvents.push(JSON.parse(String(init?.body)) as CapturedEvent);
      return new Response(JSON.stringify({ status: "Ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`console-flow.test.ts: unexpected fetch to ${url} — this suite stubs every network call the flow can make`);
  }) as typeof fetch;

  sessionCookieA = await signIn({ sub: "910000000000000000001", email: "console-flow-a@example.com" });
  sessionCookieB = await signIn({ sub: "910000000000000000002", email: "console-flow-b@example.com" });
  const foundA = await repository.findUserByGoogleSub("910000000000000000001");
  const foundB = await repository.findUserByGoogleSub("910000000000000000002");
  assert.ok(foundA && foundB);
  accountIdA = foundA!.accountId;
  accountIdB = foundB!.accountId;
  // The sign-in flow itself fires signin_completed/account_created; this suite's own assertions
  // only care about what console/keys.ts captures, so start every event-bearing test from a clean
  // slate rather than filtering sign-in noise out of every downstream assertion.
  capturedEvents = [];
});

after(async () => {
  restoreFetch();
  await harness.dispose();
});

function makeEnv(): WorkerEnv {
  return {
    DB: harness.db,
    POSTHOG_HOST: "https://us.i.posthog.com",
    POSTHOG_PROJECT_TOKEN: POSTHOG_TOKEN,
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    B2C_APP_CONSOLE_AUTH_SECRET: "s".repeat(64),
    STRIPE_RESTRICTED_KEY: `rk_test_${"a".repeat(24)}`,
    STRIPE_WEBHOOK_SECRET: "whsec_test_unused_by_this_suite",
    FLAGS_KV: flagsKv,
  } as unknown as WorkerEnv;
}

/** Every test in this file that expects a capture uses this unless it is testing suppression. */
const US_HEADERS: HeadersInit = { "cf-ipcountry": "US" };

function collectingCtx(): { ctx: WorkerCtx; settle: () => Promise<unknown> } {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) } as unknown as WorkerCtx,
    // Drains rather than one Promise.all: captureConsoleEvent's objection check nests a second
    // ctx.waitUntil call (captureInBackground's own) inside the first, so a new entry can land
    // in `pending` only after this function has already started awaiting today's contents. Keep
    // awaiting newly-added entries until a pass adds nothing.
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

async function dispatch(request: Request): Promise<Response> {
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

/** `headers` defaults to a resolvable, non-suppressed country — override to test geo suppression. */
async function startSignin(headers: HeadersInit = US_HEADERS): Promise<{ state: string; nonce: string; oauthStateCookie: string }> {
  const response = await dispatch(new Request(`${ORIGIN}/auth/google/start`, { headers }));
  assert.equal(response.status, 302);
  const location = response.headers.get("Location");
  assert.ok(location, "GET /auth/google/start must redirect somewhere");
  const authorizeUrl = new URL(location!);
  const stateCookie = findSetCookie(response, "__Host-b2c-oauth-state");
  assert.ok(stateCookie, "GET /auth/google/start must set the oauth state cookie");
  const state = authorizeUrl.searchParams.get("state");
  const nonce = authorizeUrl.searchParams.get("nonce");
  assert.ok(state && nonce);
  return { state: state!, nonce: nonce!, oauthStateCookie: cookiePair(stateCookie!) };
}

/**
 * The full start -> callback round trip for one Google account. Returns the session cookie pair.
 *
 * `headers` is applied to both legs — start and callback — since a real browser's IP, and
 * therefore Cloudflare's `CF-IPCountry`, does not change mid-flow. Defaults to a resolvable,
 * non-suppressed country.
 */
async function signIn(opts: { readonly sub: string; readonly email: string; readonly headers?: HeadersInit }): Promise<string> {
  const headers = opts.headers ?? US_HEADERS;
  const { state, nonce, oauthStateCookie } = await startSignin(headers);
  nextIdToken = await signIdToken({ sub: opts.sub, email: opts.email, nonce });
  const callbackUrl = new URL(`${ORIGIN}/auth/google/callback`);
  callbackUrl.searchParams.set("code", "test-authorization-code");
  callbackUrl.searchParams.set("state", state);
  const callbackHeaders = new Headers(headers);
  callbackHeaders.set("Cookie", oauthStateCookie);
  const response = await dispatch(new Request(callbackUrl, { headers: callbackHeaders }));
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("Location")!, ORIGIN).pathname, "/console");
  const sessionCookie = findSetCookie(response, "__Host-b2c-session");
  assert.ok(sessionCookie, "the callback must set the session cookie on success");
  return cookiePair(sessionCookie!);
}

async function csrfTokenFor(sessionCookie: string): Promise<string> {
  const response = await dispatch(new Request(`${ORIGIN}/console/keys`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  const match = /name="csrf" value="([^"]+)"/.exec(html);
  assert.ok(match, "the list page must render a CSRF token");
  return match[1]!.replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------------------
// Two real tenants, signed in through the real Worker inside the before() hook above
// ---------------------------------------------------------------------------

let sessionCookieA: string;
let sessionCookieB: string;
let accountIdA: AccountId;
let accountIdB: AccountId;

test("GET /console/keys with no session cookie redirects to sign-in — the same console guard as GET /console", async () => {
  const response = await dispatch(new Request(`${ORIGIN}/console/keys`));
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location")!, ORIGIN);
  assert.equal(location.pathname, "/signin");
  assert.equal(location.searchParams.get("entry_point"), "console_guard");
});

test("GET /console/keys lists an empty set for a freshly signed-in tenant", async () => {
  const response = await dispatch(new Request(`${ORIGIN}/console/keys`, { headers: { Cookie: sessionCookieA } }));
  assert.equal(response.status, 200);
  assert.match(await response.text(), /No API keys yet/);
});

let rawKeyA: string;
let keyIdA: string;

test("POST /console/keys mints a key through the real Worker, shown once, and captures api_key_created", async () => {
  const csrf = await csrfTokenFor(sessionCookieA);
  const body = new URLSearchParams({ csrf, label: "console-flow-a-key" }).toString();
  const response = await dispatch(new Request(`${ORIGIN}/console/keys`, { method: "POST", headers: { Cookie: sessionCookieA, ...US_HEADERS }, body }));
  assert.equal(response.status, 201);
  const html = await response.text();
  const match = /value="(b2c_[A-Za-z0-9_-]{43})"/.exec(html);
  assert.ok(match, "the reveal page must render the raw key");
  rawKeyA = match[1]!;

  const resolved = await repository.resolveApiKeyPrincipal(rawKeyA);
  assert.equal(resolved.accountId, accountIdA, "the minted key must authenticate as the tenant that created it");

  const keysForA = await repository.listApiKeys(accountIdA);
  const created = keysForA.find((key) => key.label === "console-flow-a-key");
  assert.ok(created, "the created key must be listed for its own tenant");
  keyIdA = created!.id;

  const created_event = capturedEvents.find((event) => event.event === "api_key_created");
  assert.ok(created_event, "createConsoleApiKey must capture api_key_created");
  assert.equal(created_event!.distinct_id, accountIdA);
  assert.equal(created_event!.properties.key_id, keyIdA);
  assert.equal(created_event!.properties.is_first_key, true, "this tenant's first key through the console");
  assert.equal(created_event!.properties.key_count_after, 1);

  // Shown once: a fresh load of the list page never repeats the raw value.
  const listResponse = await dispatch(new Request(`${ORIGIN}/console/keys`, { headers: { Cookie: sessionCookieA } }));
  assert.doesNotMatch(await listResponse.text(), new RegExp(rawKeyA), "the raw key must never appear again after the reveal page");
});

test("account B's key list never contains account A's key", async () => {
  const response = await dispatch(new Request(`${ORIGIN}/console/keys`, { headers: { Cookie: sessionCookieB } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /console-flow-a-key/, "account B must never see account A's key label");
  const keysForB = await repository.listApiKeys(accountIdB);
  assert.ok(keysForB.every((key) => key.id !== keyIdA));
});

test("account B cannot revoke account A's key through the real Worker, and nothing changes", async () => {
  const csrfB = await csrfTokenFor(sessionCookieB);
  const capturedBefore = capturedEvents.length;
  const response = await dispatch(
    new Request(`${ORIGIN}/console/keys/${encodeURIComponent(keyIdA)}/revoke`, {
      method: "POST",
      headers: { Cookie: sessionCookieB },
      body: new URLSearchParams({ csrf: csrfB }).toString(),
    }),
  );
  // Same shape as revoking nothing at all — console/keys.ts's own documented behaviour.
  assert.equal(response.status, 303);
  const stillActive = await repository.getApiKey(accountIdA, keyIdA);
  assert.equal(stillActive?.revokedAt, null, "account A's key must be untouched by account B's cross-tenant attempt");
  assert.equal(capturedEvents.length, capturedBefore, "nothing changed, so nothing should be captured");
});

test("the owner revokes their own key through the real Worker, and api_key_revoked is captured", async () => {
  const csrfA = await csrfTokenFor(sessionCookieA);
  const response = await dispatch(
    new Request(`${ORIGIN}/console/keys/${encodeURIComponent(keyIdA)}/revoke`, {
      method: "POST",
      headers: { Cookie: sessionCookieA, ...US_HEADERS },
      body: new URLSearchParams({ csrf: csrfA }).toString(),
    }),
  );
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("Location")!, ORIGIN).pathname, "/console/keys");

  const revokedRow = await repository.getApiKey(accountIdA, keyIdA);
  assert.notEqual(revokedRow?.revokedAt, null, "the owner's revoke must actually revoke the key");

  const revoked_event = capturedEvents.find((event) => event.event === "api_key_revoked");
  assert.ok(revoked_event, "revokeConsoleApiKey must capture api_key_revoked");
  assert.equal(revoked_event!.distinct_id, accountIdA);
  assert.equal(revoked_event!.properties.key_id, keyIdA);
  assert.equal(revoked_event!.properties.revoked_reason, "user_action");
});

test("neither creation nor revocation through the console ever writes api_keys.last_used_at or an audit_events row — migrations/README.md's privacy gate", async () => {
  // Read back through the repository, not raw D1: check-tenant-isolation.ts confines `.prepare(`
  // to interest/repository.ts and test/support/d1.ts, and TenantDb already exposes both columns
  // this gate cares about (ApiKeySummary.lastUsedAt, listAuditEvents) without needing raw SQL.
  const revokedKey = await repository.getApiKey(accountIdA, keyIdA);
  assert.ok(revokedKey, "the key row must still exist, now revoked");
  assert.equal(revokedKey!.lastUsedAt, null, "last_used_at is gated on a published privacy-page update that has not happened");

  const auditEventsA = await repository.listAuditEvents(accountIdA);
  assert.equal(auditEventsA.length, 0, "create/revoke through the console must not write audit_events until the privacy page is updated");
});

// ---------------------------------------------------------------------------
// Console suppression gate: geography, objection, and KV-outage fail-closed behaviour.
//
// Every test below mints its own Google sub, so none of it disturbs accountIdA/keyIdA above —
// this section reads capturedEvents.slice(before) rather than resetting the shared array, the
// same spot-check style "nothing changed, so nothing should be captured" already uses.
// ---------------------------------------------------------------------------

let suppressionSubCounter = 0;
/** A fresh Google sub/email per call, so each suppression case gets its own account. */
function nextIdentity(): { sub: string; email: string } {
  suppressionSubCounter += 1;
  const n = String(suppressionSubCounter).padStart(3, "0");
  return {
    sub: `93000000000000000${n}`,
    email: `suppression-${n}@example.com`,
  };
}

const UNRESOLVABLE_COUNTRIES: readonly (string | undefined)[] = ["DE", "GB", undefined, "XX"];

for (const country of UNRESOLVABLE_COUNTRIES) {
  test(`sign-in from ${String(country)} captures neither signin_completed nor account_created, and never reads FLAGS_KV`, async () => {
    const identity = nextIdentity();
    const headers: HeadersInit = country === undefined ? {} : { "cf-ipcountry": country };
    const getCallsBefore = flagsKv.getCallCount();
    const capturedBefore = capturedEvents.length;

    await signIn({ ...identity, headers });

    assert.equal(capturedEvents.length, capturedBefore, `no event should be captured for cf-ipcountry ${String(country)}`);
    assert.equal(flagsKv.getCallCount(), getCallsBefore, "geography is checked before any KV read — this must never touch FLAGS_KV");
  });
}

test("sign-in from a resolvable, non-EEA/UK country captures both signin_completed and account_created", async () => {
  const identity = nextIdentity();
  const capturedBefore = capturedEvents.length;

  const sessionCookie = await signIn(identity);
  const found = await repository.findUserByGoogleSub(identity.sub);
  assert.ok(found);

  const newEvents = capturedEvents.slice(capturedBefore);
  const completed = newEvents.find((event) => event.event === "signin_completed");
  const created = newEvents.find((event) => event.event === "account_created");
  assert.ok(completed, "signin_completed must be captured for a resolvable non-EEA/UK country");
  assert.equal(completed!.distinct_id, found!.accountId);
  assert.ok(created, "account_created must be captured for a first-time sign-in");
  assert.equal(created!.distinct_id, found!.accountId);
  assert.ok(sessionCookie, "the sign-in must still succeed regardless of analytics");
});

test("an account that has objected does not get its own second signin_completed captured", async () => {
  const identity = nextIdentity();
  await signIn(identity);
  const found = await repository.findUserByGoogleSub(identity.sub);
  assert.ok(found);

  // The objection record an operator would write with `wrangler kv key put --binding FLAGS_KV`.
  await flagsKv.put(`analytics:optout:${found!.accountId}`, "1");

  const capturedBefore = capturedEvents.length;
  await signIn(identity); // Same sub: the existing-account path, so only signin_completed fires.
  assert.equal(
    capturedEvents.slice(capturedBefore).length,
    0,
    "an objecting account's own subject-bearing event must not be captured, even from an allowed country",
  );
});

test("a FLAGS_KV read failure during the objection check fails closed — no capture, not a duplicate", async () => {
  const identity = nextIdentity();
  flagsKv.setBroken(true);
  try {
    const capturedBefore = capturedEvents.length;
    await signIn(identity);
    assert.equal(capturedEvents.slice(capturedBefore).length, 0, "an unreachable FLAGS_KV must be treated as an objection, not as permission to capture");
  } finally {
    flagsKv.setBroken(false);
  }
});

async function signedInIdentity(): Promise<{ sessionCookie: string; accountId: AccountId }> {
  const identity = nextIdentity();
  const sessionCookie = await signIn(identity);
  const found = await repository.findUserByGoogleSub(identity.sub);
  assert.ok(found);
  return { sessionCookie, accountId: found!.accountId };
}

for (const country of UNRESOLVABLE_COUNTRIES) {
  test(`POST /console/keys from ${String(country)} still mints the key but never captures api_key_created`, async () => {
    const { sessionCookie } = await signedInIdentity();
    const csrf = await csrfTokenFor(sessionCookie);
    const headers = new Headers({ Cookie: sessionCookie });
    if (country !== undefined) headers.set("cf-ipcountry", country);
    const capturedBefore = capturedEvents.length;

    const response = await dispatch(new Request(`${ORIGIN}/console/keys`, { method: "POST", headers, body: new URLSearchParams({ csrf }).toString() }));
    assert.equal(response.status, 201, "the key is still minted regardless of analytics");
    assert.equal(
      capturedEvents.slice(capturedBefore).filter((event) => event.event === "api_key_created").length,
      0,
      `api_key_created must not be captured for cf-ipcountry ${String(country)}`,
    );
  });
}

test("creating a key for an account that has objected does not capture api_key_created", async () => {
  const { sessionCookie, accountId } = await signedInIdentity();
  await flagsKv.put(`analytics:optout:${accountId}`, "1");
  const csrf = await csrfTokenFor(sessionCookie);
  const capturedBefore = capturedEvents.length;

  const response = await dispatch(
    new Request(`${ORIGIN}/console/keys`, {
      method: "POST",
      headers: { Cookie: sessionCookie, ...US_HEADERS },
      body: new URLSearchParams({ csrf }).toString(),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(
    capturedEvents.slice(capturedBefore).filter((event) => event.event === "api_key_created").length,
    0,
    "an objecting account must not get api_key_created captured, even from an allowed country",
  );
});

test("a FLAGS_KV read failure while creating a key fails closed — no api_key_created capture", async () => {
  const { sessionCookie } = await signedInIdentity();
  const csrf = await csrfTokenFor(sessionCookie);
  flagsKv.setBroken(true);
  try {
    const capturedBefore = capturedEvents.length;
    const response = await dispatch(
      new Request(`${ORIGIN}/console/keys`, {
        method: "POST",
        headers: { Cookie: sessionCookie, ...US_HEADERS },
        body: new URLSearchParams({ csrf }).toString(),
      }),
    );
    assert.equal(response.status, 201, "the key is still minted; only the analytics side fails closed");
    assert.equal(capturedEvents.slice(capturedBefore).filter((event) => event.event === "api_key_created").length, 0);
  } finally {
    flagsKv.setBroken(false);
  }
});

async function signedInWithKey(): Promise<{ sessionCookie: string; accountId: AccountId; keyId: string }> {
  const { sessionCookie, accountId } = await signedInIdentity();
  const csrf = await csrfTokenFor(sessionCookie);
  const response = await dispatch(
    new Request(`${ORIGIN}/console/keys`, {
      method: "POST",
      headers: { Cookie: sessionCookie, ...US_HEADERS },
      body: new URLSearchParams({ csrf }).toString(),
    }),
  );
  const html = await response.text();
  const match = /value="(b2c_[A-Za-z0-9_-]{43})"/.exec(html);
  assert.ok(match);
  const resolved = await repository.resolveApiKeyPrincipal(match[1]!);
  assert.equal(resolved.accountId, accountId);
  // A freshly signed-in account has no seeded key, unlike console-keys.test.ts's sessionA/B, so
  // the one just minted is the only row.
  const keys = await repository.listApiKeys(accountId);
  assert.equal(keys.length, 1);
  return { sessionCookie, accountId, keyId: keys[0]!.id };
}

for (const country of UNRESOLVABLE_COUNTRIES) {
  test(`POST /console/keys/:id/revoke from ${String(country)} still revokes the key but never captures api_key_revoked`, async () => {
    const { sessionCookie, accountId, keyId } = await signedInWithKey();
    const csrf = await csrfTokenFor(sessionCookie);
    const headers = new Headers({ Cookie: sessionCookie });
    if (country !== undefined) headers.set("cf-ipcountry", country);
    const capturedBefore = capturedEvents.length;

    const response = await dispatch(
      new Request(`${ORIGIN}/console/keys/${encodeURIComponent(keyId)}/revoke`, {
        method: "POST",
        headers,
        body: new URLSearchParams({ csrf }).toString(),
      }),
    );
    assert.equal(response.status, 303);
    const revoked = await repository.getApiKey(accountId, keyId);
    assert.notEqual(revoked?.revokedAt, null, "the key is still revoked regardless of analytics");
    assert.equal(
      capturedEvents.slice(capturedBefore).filter((event) => event.event === "api_key_revoked").length,
      0,
      `api_key_revoked must not be captured for cf-ipcountry ${String(country)}`,
    );
  });
}

test("revoking a key for an account that has objected does not capture api_key_revoked", async () => {
  const { sessionCookie, accountId, keyId } = await signedInWithKey();
  await flagsKv.put(`analytics:optout:${accountId}`, "1");
  const csrf = await csrfTokenFor(sessionCookie);
  const capturedBefore = capturedEvents.length;

  await dispatch(
    new Request(`${ORIGIN}/console/keys/${encodeURIComponent(keyId)}/revoke`, {
      method: "POST",
      headers: { Cookie: sessionCookie, ...US_HEADERS },
      body: new URLSearchParams({ csrf }).toString(),
    }),
  );
  assert.equal(
    capturedEvents.slice(capturedBefore).filter((event) => event.event === "api_key_revoked").length,
    0,
    "an objecting account must not get api_key_revoked captured, even from an allowed country",
  );
});

test("a FLAGS_KV read failure while revoking a key fails closed — no api_key_revoked capture", async () => {
  const { sessionCookie, accountId, keyId } = await signedInWithKey();
  const csrf = await csrfTokenFor(sessionCookie);
  flagsKv.setBroken(true);
  try {
    const capturedBefore = capturedEvents.length;
    await dispatch(
      new Request(`${ORIGIN}/console/keys/${encodeURIComponent(keyId)}/revoke`, {
        method: "POST",
        headers: { Cookie: sessionCookie, ...US_HEADERS },
        body: new URLSearchParams({ csrf }).toString(),
      }),
    );
    const revoked = await repository.getApiKey(accountId, keyId);
    assert.notEqual(revoked?.revokedAt, null, "the key is still revoked; only the analytics side fails closed");
    assert.equal(capturedEvents.slice(capturedBefore).filter((event) => event.event === "api_key_revoked").length, 0);
  } finally {
    flagsKv.setBroken(false);
  }
});

// ---------------------------------------------------------------------------
// Interest collector, routed into the console (worker.ts's GET /console and POST
// /console/interest) — driven through the real worker.fetch, the same way the API-key surface
// above is. interest/handler.ts and interest/repository.ts's own unit tests (test/interest.test.ts)
// already prove the submission logic in isolation; this proves worker.ts actually wires it up:
// the same requireConsoleSession guard, the interest-form's own CSRF namespace, and that
// findInterestSignalByAccount is what decides which state GET /console renders.
// ---------------------------------------------------------------------------

/** Extracts the CSRF token from the ask-for-access form on the console shell, GET /console. */
async function interestCsrfTokenFor(sessionCookie: string): Promise<string> {
  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  const match = /name="csrf" value="([^"]+)"/.exec(html);
  assert.ok(match, "the console shell must render a CSRF token for the interest form");
  return match[1]!.replace(/&amp;/g, "&");
}

test("GET /console shows the ask-for-access form for a signed-in account with no prior submission", async () => {
  const { sessionCookie } = await signedInIdentity();
  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Ask for access/);
  assert.match(html, /action="\/console\/interest"/);
});

test("POST /console/interest with a valid CSRF token writes one interest_signals row and captures interest_submitted from the US", async () => {
  const { sessionCookie, accountId } = await signedInIdentity();
  const csrf = await interestCsrfTokenFor(sessionCookie);
  const capturedBefore = capturedEvents.length;
  const body = new URLSearchParams({ csrf, email: "interest-us@example.com", source_key: "hacker_news", intent: "evaluating" }).toString();

  const response = await dispatch(new Request(`${ORIGIN}/console/interest`, { method: "POST", headers: { Cookie: sessionCookie, ...US_HEADERS }, body }));
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("Location")!, ORIGIN).pathname, "/console");

  const rows = (await harness.readInterestSignals()).filter((row) => row.account_id === accountId);
  assert.equal(rows.length, 1, "exactly one row must be written for this account");
  assert.equal(rows[0]!.email, "interest-us@example.com");
  assert.equal(rows[0]!.intent, "evaluating");

  const event = capturedEvents.slice(capturedBefore).find((captured) => captured.event === "interest_submitted");
  assert.ok(event, "interest_submitted must be captured for a resolvable country");
  assert.equal(event!.distinct_id, accountId);
});

test("POST /console/interest from cf-ipcountry DE still writes the row but never captures interest_submitted", async () => {
  const { sessionCookie, accountId } = await signedInIdentity();
  const csrf = await interestCsrfTokenFor(sessionCookie);
  const capturedBefore = capturedEvents.length;
  const body = new URLSearchParams({ csrf, email: "interest-de@example.com", source_key: "github", intent: "just_curious" }).toString();

  const response = await dispatch(
    new Request(`${ORIGIN}/console/interest`, { method: "POST", headers: { Cookie: sessionCookie, "cf-ipcountry": "DE" }, body }),
  );
  assert.equal(response.status, 303, "the row is still written regardless of analytics");

  const rows = (await harness.readInterestSignals()).filter((row) => row.account_id === accountId);
  assert.equal(rows.length, 1, "the D1 write is the source of record and must not be gated on geography");
  assert.equal(
    capturedEvents.slice(capturedBefore).filter((captured) => captured.event === "interest_submitted").length,
    0,
    "interest_submitted must not be captured for cf-ipcountry DE",
  );
});

test("POST /console/interest with a bad CSRF token is rejected and writes nothing", async () => {
  const { sessionCookie } = await signedInIdentity();
  const rowsBefore = (await harness.readInterestSignals()).length;
  const capturedBefore = capturedEvents.length;
  const body = new URLSearchParams({
    csrf: "not-a-real-token",
    email: "interest-badcsrf@example.com",
    source_key: "github",
    intent: "just_curious",
  }).toString();

  const response = await dispatch(new Request(`${ORIGIN}/console/interest`, { method: "POST", headers: { Cookie: sessionCookie, ...US_HEADERS }, body }));
  assert.equal(response.status, 403);
  assert.equal((await harness.readInterestSignals()).length, rowsBefore, "a bad CSRF token must write nothing");
  assert.equal(capturedEvents.length, capturedBefore, "a bad CSRF token must capture nothing");
});

test("a second GET /console shows the submitted state instead of the form", async () => {
  const { sessionCookie } = await signedInIdentity();
  const csrf = await interestCsrfTokenFor(sessionCookie);
  const body = new URLSearchParams({ csrf, email: "interest-submitted@example.com", source_key: "reddit_search", intent: "ready_to_buy" }).toString();
  const postResponse = await dispatch(new Request(`${ORIGIN}/console/interest`, { method: "POST", headers: { Cookie: sessionCookie, ...US_HEADERS }, body }));
  assert.equal(postResponse.status, 303);

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /action="\/console\/interest"/, "the form must not render once this account has already submitted");
  assert.match(html, /Stripe payment link/);
});

test("an unauthenticated POST /console/interest redirects to sign-in and writes nothing", async () => {
  const rowsBefore = (await harness.readInterestSignals()).length;
  const response = await dispatch(
    new Request(`${ORIGIN}/console/interest`, {
      method: "POST",
      body: new URLSearchParams({ csrf: "x", email: "nobody@example.com", source_key: "github", intent: "evaluating" }).toString(),
    }),
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("Location")!, ORIGIN);
  assert.equal(location.pathname, "/signin");
  assert.equal(location.searchParams.get("entry_point"), "console_guard");
  assert.equal((await harness.readInterestSignals()).length, rowsBefore);
});

test("a second tenant's GET /console never shows the first tenant's submitted state, and its row stays isolated", async () => {
  const { sessionCookie: sessionA, accountId: accountA } = await signedInIdentity();
  const { sessionCookie: sessionB, accountId: accountB } = await signedInIdentity();
  const csrfA = await interestCsrfTokenFor(sessionA);
  const body = new URLSearchParams({ csrf: csrfA, email: "interest-tenant-a@example.com", source_key: "youtube", intent: "need_team_plan" }).toString();
  await dispatch(new Request(`${ORIGIN}/console/interest`, { method: "POST", headers: { Cookie: sessionA, ...US_HEADERS }, body }));

  const responseB = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionB } }));
  const htmlB = await responseB.text();
  assert.match(htmlB, /action="\/console\/interest"/, "account B must still see the form — account A's submission must not leak across tenants");

  const rows = await harness.readInterestSignals();
  assert.ok(rows.some((row) => row.account_id === accountA));
  assert.ok(!rows.some((row) => row.account_id === accountB), "account B has not submitted, so it must have no row");
});

// ---------------------------------------------------------------------------
// worker.ts's try/catch around the console branch — now covering both requireConsoleSession's own
// D1 read and the handlers below it (keys, interest, checkout, render). Placed last in this file,
// in table-breakage order (api_keys, then sessions), because each break*Table() call drops a
// table every earlier test in this suite still depends on.
// ---------------------------------------------------------------------------

test("GET /console/keys answers the house-style 500 page, not a thrown error, when a console handler hits an unexpected D1 failure", async () => {
  const { sessionCookie } = await signedInIdentity();
  await harness.breakApiKeysTable();

  const response = await dispatch(new Request(`${ORIGIN}/console/keys`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 500);
  assert.match(await response.text(), /Something went wrong/);
});

// Genuinely last: breakSessionsTable() makes every further sign-in (and every further call to
// resolveSessionPrincipal) fail, so nothing after this test could sign in or reuse a cookie.
test("GET /console answers the house-style 500 page, not a thrown error, when requireConsoleSession's own D1 read fails unexpectedly", async () => {
  // Sign in — and mint the session row — before the table is gone; sign-in itself reads/writes
  // `sessions` too.
  const { sessionCookie } = await signedInIdentity();
  await harness.breakSessionsTable();

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 500);
  assert.match(await response.text(), /Something went wrong/);
});
