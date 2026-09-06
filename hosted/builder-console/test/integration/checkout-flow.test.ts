/**
 * Self-serve Checkout (console/checkout.ts's POST /console/checkout and POST /console/billing,
 * and worker.ts's GET /console plan-forms render), driven through the REAL `worker.fetch` — the
 * same "prove the wiring, not just the handler" reasoning console-flow.test.ts's own doc comment
 * gives for the API-key surface. `console-flow.test.ts` itself never turns the checkout gate on
 * (every account it signs in sees the interest collector, which is also what proves the gate's
 * *default*, no-cached-flag-definitions state renders correctly); this file is where the gate is
 * actually opened, by seeding `FLAGS_KV` with a real PostHog local-evaluation flag payload —
 * `checkoutGateFor` (worker.ts) builds a real `posthog-node` client and calls its real
 * `isFeatureEnabled`, so nothing short of a real, correctly-shaped cached definition makes that
 * call resolve `true`. `enableCheckoutFlag`/`disableCheckoutFlag` below are the two shapes this
 * suite needs: a flag active for every distinct id (100% rollout, no conditions) and no cached
 * definitions at all (`resolveCheckoutGate`'s own "definitions_missing" fail-closed default).
 *
 * Sign-in reuses session-flow.test.ts's pattern verbatim, the same way console-flow.test.ts does:
 * a locally generated RSA keypair behind a stubbed Google JWKS/token endpoint, and every helper
 * here is file-local by design.
 *
 * CSRF tokens are minted directly through `issueCheckoutCsrfToken` (console/pages.ts) rather than
 * scraped from a rendered page for every POST test — the token's own round trip is already
 * exercised by `verifyCheckoutCsrfToken` and by the "bad CSRF token" test below, and the
 * plan-forms render itself gets one dedicated real-HTML test (`GET /console renders...`) rather
 * than being re-proven by every POST test that merely needs a valid token to get past the guard.
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { tenantDb, type AccountId, type TenantDb } from "../../../knowledge-mcp/db/tenant.js";
import { CHECKOUT_FLAG_KEY, KvFlagCacheWriter } from "../../analytics/flags.js";
import { issueCheckoutCsrfToken } from "../../console/pages.js";
import worker from "../../worker.js";
import { createTestDatabase, type TestDatabase } from "../support/d1.js";

const ORIGIN = "https://app.clueless-creations.com";
const CLIENT_ID = "checkout-flow-test.apps.googleusercontent.com";
const KID = "checkout-flow-test-key";
const POSTHOG_TOKEN = "phc_" + "a".repeat(43);
const CSRF_SECRET = "s".repeat(64);

type WorkerEnv = Parameters<typeof worker.fetch>[1];
type WorkerCtx = Parameters<typeof worker.fetch>[2];

interface CapturedEvent {
  readonly event: string;
  readonly distinct_id: string;
  readonly properties: Record<string, unknown>;
}

interface StripeCall {
  readonly url: string;
  readonly body: string;
}

/** Plain in-memory FLAGS_KV, matching console-flow.test.ts's memoryKv(). */
function memoryKv() {
  const map = new Map<string, string>();
  return { get: async (key: string) => map.get(key) ?? null, put: async (key: string, value: string) => void map.set(key, value), map };
}

/**
 * A minimal, fully-shaped `PostHogFeatureFlag` for `CHECKOUT_FLAG_KEY`: no conditions/properties,
 * just a rollout percentage. `active: false` is a hash-independent, always-off shape (no rollout
 * math involved) — used for the one test that needs a *cached, fresh, explicitly-false* flag
 * rather than no cached flag at all (a different `GateReason` in analytics/flags.ts).
 */
function checkoutFlagDefinition(enabled: boolean) {
  return {
    id: 1,
    name: CHECKOUT_FLAG_KEY,
    key: CHECKOUT_FLAG_KEY,
    filters: { groups: [{ properties: [], rollout_percentage: 100 }] },
    deleted: false,
    active: enabled,
    rollout_percentage: null,
    ensure_experience_continuity: false,
    experiment_set: [],
  };
}

/** Seeds FLAGS_KV so `checkoutGateFor`'s real posthog-node client resolves the flag `enabled` for every distinct id. */
async function enableCheckoutFlag(kv: ReturnType<typeof memoryKv>, enabled = true): Promise<void> {
  const writer = new KvFlagCacheWriter(kv, () => Date.now());
  await writer.onFlagDefinitionsReceived({ flags: [checkoutFlagDefinition(enabled)], groupTypeMapping: {}, cohorts: {} });
}

/** Clears cached flag definitions entirely — analytics/flags.ts's "definitions_missing", fail-closed. */
function disableCheckoutFlag(kv: ReturnType<typeof memoryKv>): void {
  // The literal key flags.ts's KvFlagCacheWriter/Reader share — not exported, so hardcoded here
  // the same way test/flags.test.ts already does for the identical reason.
  kv.map.delete("posthog:flags:platform");
}

let harness: TestDatabase;
let repository: TenantDb;
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let restoreFetch: () => void;
let capturedEvents: CapturedEvent[];
let stripeCalls: StripeCall[];
let stripeCustomerCounter: number;
let checkoutSessionShouldFail: number | null;
let billingPortalShouldFail: number | null;
let env: WorkerEnv;
let flagsKv: ReturnType<typeof memoryKv>;

let nextIdToken: string | undefined;

before(async () => {
  harness = await createTestDatabase();
  repository = tenantDb(harness.db);
  capturedEvents = [];
  stripeCalls = [];
  stripeCustomerCounter = 0;
  checkoutSessionShouldFail = null;
  billingPortalShouldFail = null;
  flagsKv = memoryKv();
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
    const body = String(init?.body ?? "");
    if (url === "https://oauth2.googleapis.com/token") {
      assert.ok(nextIdToken, `unexpected token exchange with no id token queued (${url})`);
      return new Response(JSON.stringify({ id_token: nextIdToken }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      return new Response(JSON.stringify(jwks), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.stripe.com/v1/customers") {
      // Sign-in must never reach this (0008_lazy_stripe_customer.sql) — only ensureStripeCustomer
      // (billing/checkout.ts), from a POST /console/checkout, ever calls it in this suite.
      stripeCustomerCounter += 1;
      stripeCalls.push({ url, body });
      const id = `cus_CHECKOUTFLOW${String(stripeCustomerCounter).padStart(4, "0")}`;
      return new Response(JSON.stringify({ id }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://api.stripe.com/v1/prices")) {
      stripeCalls.push({ url, body });
      const lookupKey = new URL(url).searchParams.get("lookup_keys[]");
      const priceId = lookupKey === "b2c_pro_monthly" ? "price_MONTHLY0001" : lookupKey === "b2c_pro_annual" ? "price_ANNUAL00001" : undefined;
      return new Response(JSON.stringify({ data: priceId ? [{ id: priceId }] : [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      stripeCalls.push({ url, body });
      if (checkoutSessionShouldFail !== null) {
        return new Response(JSON.stringify({ error: { type: "permission_error", message: "test: key not scoped for Checkout Sessions" } }), {
          status: checkoutSessionShouldFail,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "cs_test_checkoutflow1", url: "https://checkout.stripe.com/test/checkoutflow1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "https://api.stripe.com/v1/billing_portal/sessions") {
      stripeCalls.push({ url, body });
      if (billingPortalShouldFail !== null) {
        return new Response(JSON.stringify({ error: { type: "permission_error", message: "test: key not scoped for the Billing Portal" } }), {
          status: billingPortalShouldFail,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ url: "https://billing.stripe.com/test/portalflow1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url === "https://us.i.posthog.com/i/v0/e") {
      capturedEvents.push(JSON.parse(body) as CapturedEvent);
      return new Response(JSON.stringify({ status: "Ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`checkout-flow.test.ts: unexpected fetch to ${url} — this suite stubs every network call the flow can make`);
  }) as typeof fetch;
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
    B2C_APP_CONSOLE_AUTH_SECRET: CSRF_SECRET,
    STRIPE_RESTRICTED_KEY: `rk_test_${"a".repeat(24)}`,
    STRIPE_WEBHOOK_SECRET: "whsec_test_unused_by_this_suite",
    FLAGS_KV: flagsKv,
  } as unknown as WorkerEnv;
}

const US_HEADERS: HeadersInit = { "cf-ipcountry": "US" };

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

async function dispatch(request: Request): Promise<Response> {
  const { ctx, settle } = collectingCtx();
  const response = await worker.fetch(request, env, ctx);
  await settle();
  return response;
}

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

async function startSignin(): Promise<{ state: string; nonce: string; oauthStateCookie: string }> {
  const response = await dispatch(new Request(`${ORIGIN}/auth/google/start`, { headers: US_HEADERS }));
  assert.equal(response.status, 302);
  const authorizeUrl = new URL(response.headers.get("Location")!);
  const stateCookie = findSetCookie(response, "__Host-b2c-oauth-state");
  assert.ok(stateCookie);
  const state = authorizeUrl.searchParams.get("state");
  const nonce = authorizeUrl.searchParams.get("nonce");
  assert.ok(state && nonce);
  return { state: state!, nonce: nonce!, oauthStateCookie: cookiePair(stateCookie!) };
}

let identityCounter = 0;

/** Signs in a brand-new Google account and returns its session cookie and account id. */
async function freshCheckoutIdentity(): Promise<{ sessionCookie: string; accountId: AccountId }> {
  identityCounter += 1;
  const n = String(identityCounter).padStart(3, "0");
  const sub = `92000000000000000${n}`;
  const email = `checkout-flow-${n}@example.com`;

  const { state, nonce, oauthStateCookie } = await startSignin();
  nextIdToken = await signIdToken({ sub, email, nonce });
  const callbackUrl = new URL(`${ORIGIN}/auth/google/callback`);
  callbackUrl.searchParams.set("code", "test-authorization-code");
  callbackUrl.searchParams.set("state", state);
  const response = await dispatch(new Request(callbackUrl, { headers: { ...US_HEADERS, Cookie: oauthStateCookie } }));
  assert.equal(response.status, 302);
  const sessionCookie = cookiePair(findSetCookie(response, "__Host-b2c-session")!);

  const found = await repository.findUserByGoogleSub(sub);
  assert.ok(found, "sign-in must create a resolvable account even with no Stripe Customer");
  return { sessionCookie, accountId: found!.accountId };
}

function checkoutCsrf(accountId: AccountId): Promise<string> {
  return issueCheckoutCsrfToken(CSRF_SECRET, accountId);
}

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function stripeCallsTo(path: string): StripeCall[] {
  return stripeCalls.filter((call) => call.url === `https://api.stripe.com${path}` || call.url.startsWith(`https://api.stripe.com${path}?`));
}

// ---------------------------------------------------------------------------
// GET /console — the plan-forms render, gated on the real flag evaluation.
// ---------------------------------------------------------------------------

test("GET /console renders the plan forms and 'No active plan yet' once the checkout flag evaluates true, with no interest form", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie } = await freshCheckoutIdentity();

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /action="\/console\/checkout"/, "the monthly/annual plan forms must render");
  assert.match(html, /Monthly.*\$19\/month/s);
  assert.match(html, /Annual.*\$190\/year/s);
  assert.match(html, /No active plan yet/);
  assert.doesNotMatch(html, /action="\/console\/interest"/, "the ask-for-access form must not render once Checkout is available");
  assert.doesNotMatch(html, /action="\/console\/billing"/, "no Stripe Customer exists yet, so 'Manage billing' must not render");
});

test("GET /console still shows the ask-for-access form when no flag definitions are cached", async () => {
  disableCheckoutFlag(flagsKv);
  const { sessionCookie } = await freshCheckoutIdentity();

  const response = await dispatch(new Request(`${ORIGIN}/console`, { headers: { Cookie: sessionCookie } }));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Ask for access/);
  assert.doesNotMatch(html, /action="\/console\/checkout"/, "the plan forms must not render while the gate is closed");
});

// ---------------------------------------------------------------------------
// POST /console/checkout
// ---------------------------------------------------------------------------

test("POST /console/checkout creates the Stripe Customer once, reuses it on a second plan click, and drives the sessions endpoint with the right fields", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const csrf = await checkoutCsrf(accountId);
  const capturedBefore = capturedEvents.length;

  const first = await dispatch(
    new Request(`${ORIGIN}/console/checkout`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf, plan: "monthly" }),
    }),
  );
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("Location"), "https://checkout.stripe.com/test/checkoutflow1");

  const customerId = await repository.getAccountStripeCustomerId(accountId);
  assert.ok(customerId, "a Customer must now be on record for this account");
  assert.equal(stripeCallsTo("/v1/customers").length, 1, "exactly one Customer must be created for this account's first Checkout");

  const sessionCalls = stripeCallsTo("/v1/checkout/sessions");
  assert.equal(sessionCalls.length, 1);
  const firstBody = new URLSearchParams(sessionCalls[0]!.body);
  assert.equal(firstBody.get("mode"), "subscription");
  assert.equal(firstBody.get("customer"), customerId);
  assert.equal(firstBody.get("line_items[0][price]"), "price_MONTHLY0001");
  assert.equal(firstBody.get("line_items[0][quantity]"), "1");
  assert.equal(firstBody.get("client_reference_id"), accountId);
  assert.equal(firstBody.get("success_url"), "https://app.clueless-creations.com/console?checkout=success");
  assert.equal(firstBody.get("cancel_url"), "https://app.clueless-creations.com/console?checkout=cancelled");
  assert.equal(firstBody.get("allow_promotion_codes"), "true");
  assert.equal(stripeCallsTo("/v1/prices").length, 1, "the monthly lookup_key must be resolved to a Price");

  const event = capturedEvents.slice(capturedBefore).find((captured) => captured.event === "upgrade_intent_clicked");
  assert.ok(event, "upgrade_intent_clicked must be captured for a genuine plan click");
  assert.equal(event!.distinct_id, accountId);
  assert.equal(event!.properties.surface_location, "console_plans");
  assert.equal(event!.properties.checkout_available, true);

  // A second plan click for the SAME account must reuse the existing Customer, never mint another.
  const csrf2 = await checkoutCsrf(accountId);
  const second = await dispatch(
    new Request(`${ORIGIN}/console/checkout`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: csrf2, plan: "annual" }),
    }),
  );
  assert.equal(second.status, 303);
  assert.equal(stripeCallsTo("/v1/customers").length, 1, "a second Checkout attempt must not create a second Customer");
  assert.equal(await repository.getAccountStripeCustomerId(accountId), customerId, "the Customer id on record must not change");
  const secondBody = new URLSearchParams(stripeCallsTo("/v1/checkout/sessions")[1]!.body);
  assert.equal(secondBody.get("customer"), customerId);
  assert.equal(secondBody.get("line_items[0][price]"), "price_ANNUAL00001");
});

test("a 403 permission_error from Stripe renders 'Billing is not available yet' with the interest form, never a 500", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const csrf = await checkoutCsrf(accountId);
  checkoutSessionShouldFail = 403;
  try {
    const response = await dispatch(
      new Request(`${ORIGIN}/console/checkout`, {
        method: "POST",
        headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
        body: formBody({ csrf, plan: "monthly" }),
      }),
    );
    assert.equal(response.status, 502);
    const html = await response.text();
    assert.match(html, /Billing is not available yet/);
    assert.match(html, /action="\/console\/interest"/, "the interest form must still be offered");
  } finally {
    checkoutSessionShouldFail = null;
  }
});

test("an unknown plan value is rejected with 400 before any Stripe call", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const csrf = await checkoutCsrf(accountId);
  const callsBefore = stripeCalls.length;

  const response = await dispatch(
    new Request(`${ORIGIN}/console/checkout`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf, plan: "lifetime" }),
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(stripeCalls.length, callsBefore, "an invalid plan must never reach Stripe");
});

test("a bad CSRF token on POST /console/checkout is rejected with 403 and makes no Stripe call", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie } = await freshCheckoutIdentity();
  const callsBefore = stripeCalls.length;

  const response = await dispatch(
    new Request(`${ORIGIN}/console/checkout`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: "not-a-real-token", plan: "monthly" }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(stripeCalls.length, callsBefore, "a bad CSRF token must never reach Stripe");
});

test("POST /console/checkout answers 404 while the checkout flag is off, and makes no Stripe call", async () => {
  disableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const csrf = await checkoutCsrf(accountId);
  const callsBefore = stripeCalls.length;

  const response = await dispatch(
    new Request(`${ORIGIN}/console/checkout`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf, plan: "monthly" }),
    }),
  );
  assert.equal(response.status, 404);
  assert.equal(stripeCalls.length, callsBefore, "the route must not touch Stripe at all while the flag is off");
});

// ---------------------------------------------------------------------------
// POST /console/billing — the Billing Portal
// ---------------------------------------------------------------------------

test("POST /console/billing redirects to the Billing Portal session url for an account with a Stripe Customer", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  // Give this account a Customer the same way a real Checkout would, without exercising Checkout itself.
  await repository.setAccountStripeCustomerId(accountId, "cus_CHECKOUTFLOWPORTAL01");
  const csrf = await checkoutCsrf(accountId);

  const response = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf }),
    }),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "https://billing.stripe.com/test/portalflow1");
  const call = stripeCallsTo("/v1/billing_portal/sessions")[0];
  assert.ok(call);
  const body = new URLSearchParams(call!.body);
  assert.equal(body.get("customer"), "cus_CHECKOUTFLOWPORTAL01");
  assert.equal(body.get("return_url"), "https://app.clueless-creations.com/console");
});

test("POST /console/billing for an account with no Stripe Customer yet falls back to 'Billing is not available yet', never a 500", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  assert.equal(await repository.getAccountStripeCustomerId(accountId), null, "a fresh account must have no Customer");
  const csrf = await checkoutCsrf(accountId);

  const response = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf }),
    }),
  );
  assert.equal(response.status, 502);
  assert.match(await response.text(), /Billing is not available yet/);
});
