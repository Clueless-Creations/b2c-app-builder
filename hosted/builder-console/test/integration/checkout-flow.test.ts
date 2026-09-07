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
import { formatDate, issueCheckoutCsrfToken } from "../../console/pages.js";
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
/** What GET /v1/subscriptions?customer= answers, per Customer id — the return-from-Stripe resync reads this. */
let stripeSubscriptionsByCustomer: Map<string, unknown[]>;
/** Customers whose GET /v1/subscriptions answers 500, to prove the resync's fallback. */
let stripeSubscriptionsShouldFail: Set<string>;
/** When true, a Billing Portal session that carries `flow_data` is refused with 400, as Stripe does for a feature the portal configuration has off. */
let portalFlowShouldFail: boolean;
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
  stripeSubscriptionsByCustomer = new Map();
  stripeSubscriptionsShouldFail = new Set();
  portalFlowShouldFail = false;
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
    if (url.startsWith("https://api.stripe.com/v1/subscriptions?")) {
      stripeCalls.push({ url, body });
      const customer = new URL(url).searchParams.get("customer") ?? "";
      if (stripeSubscriptionsShouldFail.has(customer)) {
        return new Response(JSON.stringify({ error: { type: "api_error", message: "test: subscriptions list unavailable" } }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ object: "list", has_more: false, data: stripeSubscriptionsByCustomer.get(customer) ?? [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
      if (portalFlowShouldFail && new URLSearchParams(body).has("flow_data[type]")) {
        return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "test: this portal configuration does not allow that flow" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
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

/** Noon UTC on 5 October 2026 — renders as "5 Oct 2026" through console/pages.ts's formatDate. */
const PERIOD_END = Date.UTC(2026, 9, 5, 12) / 1000;

/** A Subscription as 2025-08-27.basil returns it from GET /v1/subscriptions: the period end on the item, `cancel_at` alongside the flag. */
function stripeSubscription(opts: {
  readonly id: string;
  readonly customer: string;
  readonly status: string;
  readonly created: number;
  readonly lookupKey?: string;
  readonly itemPeriodEnd?: number;
  readonly cancelAt?: number | null;
  readonly cancelAtPeriodEnd?: boolean;
}) {
  return {
    id: opts.id,
    object: "subscription",
    customer: opts.customer,
    status: opts.status,
    created: opts.created,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    cancel_at: opts.cancelAt ?? null,
    discount: null,
    items: {
      object: "list",
      data: [
        {
          id: `si_${opts.id.slice(4)}`,
          price: { id: opts.lookupKey === "b2c_pro_annual" ? "price_ANNUAL00001" : "price_MONTHLY0001", lookup_key: opts.lookupKey ?? "b2c_pro_monthly" },
          current_period_start: opts.created,
          current_period_end: opts.itemPeriodEnd ?? PERIOD_END,
        },
      ],
    },
  };
}

async function getConsole(sessionCookie: string, query = ""): Promise<{ status: number; html: string }> {
  const response = await dispatch(new Request(`${ORIGIN}/console${query}`, { headers: { Cookie: sessionCookie } }));
  return { status: response.status, html: await response.text() };
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
  assert.match(html, /<input type="radio" name="plan" value="monthly" required>/, "the plan is a required radio, so every submission carries one");
  assert.match(html, /<input type="radio" name="plan" value="annual" required>/);
  assert.equal((html.match(/type="submit"/g) ?? []).length - (html.match(/action="\/auth\/signout"/g) ?? []).length, 1, "one submit button for the plan form, so Enter cannot pick a plan");
  assert.match(html, />Continue to payment</);
  assert.match(html, /<input type="checkbox" name="consent" value="on" required>/, "the consent box the Terms promise must render, and be required");
  assert.match(html, /give up the 14-day right to withdraw/, "the consent line must state the consumer-withdrawal consequence");
  assert.match(html, /href="https:\/\/clueless-creations\.com\/terms\/"/);
  assert.doesNotMatch(html, /refund/i);
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
      body: formBody({ csrf, plan: "monthly", consent: "on" }),
    }),
  );
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("Location"), "https://checkout.stripe.com/test/checkoutflow1");

  const customerId = await repository.getAccountStripeCustomerId(accountId);
  assert.ok(customerId, "a Customer must now be on record for this account");
  const customerCalls = stripeCallsTo("/v1/customers");
  assert.equal(customerCalls.length, 1, "exactly one Customer must be created for this account's first Checkout");
  assert.equal(new URLSearchParams(customerCalls[0]!.body).get("metadata[account_id]"), accountId, "the Customer must name the account it belongs to");

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
  assert.equal(firstBody.get("customer_update[name]"), "auto");
  assert.equal(firstBody.get("customer_update[address]"), "auto");
  assert.equal(firstBody.get("tax_id_collection[enabled]"), "true");
  assert.equal(firstBody.get("automatic_tax[enabled]"), "true", "Stripe Tax decides tax per jurisdiction; the console never hard-codes a rate");
  assert.equal(firstBody.get("subscription_data[metadata][account_id]"), accountId);
  assert.equal(firstBody.get("subscription_data[metadata][terms_url]"), "https://clueless-creations.com/terms/");
  assert.match(firstBody.get("subscription_data[metadata][terms_accepted_at]") ?? "", /^\d{4}-\d{2}-\d{2}T/, "the consent instant must ride on the subscription");
  assert.match(firstBody.get("custom_text[submit][message]") ?? "", /renews automatically until you cancel/);
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
      body: formBody({ csrf: csrf2, plan: "annual", consent: "on" }),
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
        body: formBody({ csrf, plan: "monthly", consent: "on" }),
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

test("POST /console/checkout without the consent box ticked is rejected with 400 before any Stripe call", async () => {
  await enableCheckoutFlag(flagsKv);
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
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "consent_required" });
  assert.equal(stripeCalls.length, callsBefore, "no Customer and no Session may be created without consent");
  assert.equal(await repository.getAccountStripeCustomerId(accountId), null);
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
  assert.equal(body.get("return_url"), "https://app.clueless-creations.com/console?billing=returned", "the portal's own return link must come back through the resync flag");
  assert.equal(body.get("flow_data[type]"), null, "no flow field means the portal home page");
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

test("POST /console/billing with flow=payment_method_update opens the portal on that task and returns to the console with a notice", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  await repository.setAccountStripeCustomerId(accountId, "cus_CHECKOUTFLOWPMU001");
  const csrf = await checkoutCsrf(accountId);

  const response = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf, flow: "payment_method_update" }),
    }),
  );
  assert.equal(response.status, 303);
  const body = new URLSearchParams(stripeCallsTo("/v1/billing_portal/sessions").at(-1)!.body);
  assert.equal(body.get("customer"), "cus_CHECKOUTFLOWPMU001");
  assert.equal(body.get("return_url"), "https://app.clueless-creations.com/console?billing=returned");
  assert.equal(body.get("flow_data[type]"), "payment_method_update");
  assert.equal(body.get("flow_data[after_completion][type]"), "redirect");
  assert.equal(body.get("flow_data[after_completion][redirect][return_url]"), "https://app.clueless-creations.com/console?billing=payment_method_updated");
});

test("POST /console/billing with flow=subscription_cancel names the live subscription, and falls back to the portal home when there is nothing to cancel", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  await repository.setAccountStripeCustomerId(accountId, "cus_CHECKOUTFLOWCAN001");

  // Nothing mirrored yet: a cancel click must not send a deep link naming a subscription that does not exist.
  const noPlan = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: await checkoutCsrf(accountId), flow: "subscription_cancel" }),
    }),
  );
  assert.equal(noPlan.status, 303);
  const homeBody = new URLSearchParams(stripeCallsTo("/v1/billing_portal/sessions").at(-1)!.body);
  assert.equal(homeBody.get("flow_data[type]"), null, "no deep link without a cancellable subscription");

  const now = new Date();
  await repository.upsertSubscription(
    accountId,
    {
      id: "sub_CHECKOUTFLOWCAN001",
      stripeCustomerId: "cus_CHECKOUTFLOWCAN001",
      status: "active",
      priceId: "price_MONTHLY0001",
      isGifted: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(PERIOD_END * 1000).toISOString(),
      observedAt: now.toISOString(),
    },
    now,
  );
  const withPlan = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: await checkoutCsrf(accountId), flow: "subscription_cancel" }),
    }),
  );
  assert.equal(withPlan.status, 303);
  const cancelBody = new URLSearchParams(stripeCallsTo("/v1/billing_portal/sessions").at(-1)!.body);
  assert.equal(cancelBody.get("flow_data[type]"), "subscription_cancel");
  assert.equal(cancelBody.get("flow_data[subscription_cancel][subscription]"), "sub_CHECKOUTFLOWCAN001");
  assert.equal(cancelBody.get("flow_data[after_completion][redirect][return_url]"), "https://app.clueless-creations.com/console?billing=cancel_scheduled");

  // A cancellation already scheduled cannot be scheduled again: back to the portal home page.
  const later = new Date(now.getTime() + 1000);
  await repository.upsertSubscription(
    accountId,
    { id: "sub_CHECKOUTFLOWCAN001", stripeCustomerId: "cus_CHECKOUTFLOWCAN001", status: "active", priceId: "price_MONTHLY0001", isGifted: false, cancelAtPeriodEnd: true, currentPeriodEnd: new Date(PERIOD_END * 1000).toISOString(), observedAt: later.toISOString() },
    later,
  );
  const alreadyEnding = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: await checkoutCsrf(accountId), flow: "subscription_cancel" }),
    }),
  );
  assert.equal(alreadyEnding.status, 303);
  assert.equal(new URLSearchParams(stripeCallsTo("/v1/billing_portal/sessions").at(-1)!.body).get("flow_data[type]"), null);
});

test("a portal deep link Stripe refuses falls back to the portal home page, never to the 'billing unavailable' page", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  await repository.setAccountStripeCustomerId(accountId, "cus_CHECKOUTFLOWREF001");
  portalFlowShouldFail = true;
  try {
    const callsBefore = stripeCallsTo("/v1/billing_portal/sessions").length;
    const response = await dispatch(
      new Request(`${ORIGIN}/console/billing`, {
        method: "POST",
        headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
        body: formBody({ csrf: await checkoutCsrf(accountId), flow: "payment_method_update" }),
      }),
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "https://billing.stripe.com/test/portalflow1");
    const calls = stripeCallsTo("/v1/billing_portal/sessions").slice(callsBefore);
    assert.equal(calls.length, 2, "one refused deep link, one plain portal session");
    assert.equal(new URLSearchParams(calls[0]!.body).get("flow_data[type]"), "payment_method_update");
    assert.equal(new URLSearchParams(calls[1]!.body).get("flow_data[type]"), null);
  } finally {
    portalFlowShouldFail = false;
  }
});

test("POST /console/billing rejects an unknown flow with 400 and no Stripe call", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  await repository.setAccountStripeCustomerId(accountId, "cus_CHECKOUTFLOWBAD001");
  const callsBefore = stripeCalls.length;
  const response = await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: await checkoutCsrf(accountId), flow: "subscription_update" }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_flow" });
  assert.equal(stripeCalls.length, callsBefore);
});

// ---------------------------------------------------------------------------
// GET /console — what the plan page says, and the resync from Stripe on the way back
// ---------------------------------------------------------------------------

test("returning from Checkout re-reads the subscription from Stripe before rendering, so the plan shows active with its renewal date even before the webhook lands", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWSYNC001";
  await repository.setAccountStripeCustomerId(accountId, customer);
  stripeSubscriptionsByCustomer.set(customer, [stripeSubscription({ id: "sub_CHECKOUTFLOWSYNC1", customer, status: "active", created: 1_800_000_000 })]);
  assert.deepEqual(await repository.listSubscriptionsForAccount(accountId), [], "nothing mirrored before the return — the webhook has not arrived");

  const { status, html } = await getConsole(sessionCookie, "?checkout=success");
  assert.equal(status, 200);
  assert.match(html, /Payment received\./);
  assert.match(html, /Your Pro plan \(Monthly\) is active and renews on 5 Oct 2026\./);
  assert.doesNotMatch(html, /action="\/console\/checkout"/, "an active plan offers no second Checkout");
  assert.match(html, /name="flow" value="payment_method_update"/);
  assert.match(html, /name="flow" value="subscription_cancel"/);
  assert.match(html, />Cancel plan</);

  const mirror = (await repository.listSubscriptionsForAccount(accountId))[0];
  assert.equal(mirror?.id, "sub_CHECKOUTFLOWSYNC1");
  assert.equal(mirror?.status, "active");
  assert.equal(mirror?.currentPeriodEnd, new Date(PERIOD_END * 1000).toISOString());
  await assert.doesNotReject(() => repository.assertEntitled(accountId, "b2c_pro_monthly"), "the resync must open the gate, not only repaint the page");
  const syncCallsAfterReturn = stripeCallsTo("/v1/subscriptions").length;

  // An ordinary later visit, with a mirror row and no return flag, does not read Stripe again —
  // and neither does reloading the return URL inside the per-account minute.
  const again = await getConsole(sessionCookie);
  assert.match(again.html, /renews on 5 Oct 2026/);
  assert.equal(stripeCallsTo("/v1/subscriptions").length, syncCallsAfterReturn, "no resync on a plain visit once the mirror has a row");
  const reloaded = await getConsole(sessionCookie, "?checkout=success");
  assert.match(reloaded.html, /renews on 5 Oct 2026/);
  assert.equal(stripeCallsTo("/v1/subscriptions").length, syncCallsAfterReturn, "a reload of the return URL within a minute must not read Stripe again");
});

test("an account with a Customer but no mirror row is resynced on a plain visit, which closes the lost-webhook gap", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWSYNC002";
  await repository.setAccountStripeCustomerId(accountId, customer);
  // An old canceled plan and its live replacement, both on the same lookup_key: the live one must win.
  stripeSubscriptionsByCustomer.set(customer, [
    stripeSubscription({ id: "sub_CHECKOUTFLOWOLD002", customer, status: "canceled", created: 1_790_000_000 }),
    stripeSubscription({ id: "sub_CHECKOUTFLOWNEW002", customer, status: "active", created: 1_795_000_000, lookupKey: "b2c_pro_annual" }),
  ]);

  const { html } = await getConsole(sessionCookie);
  assert.match(html, /Your Pro plan \(Annual\) is active and renews on 5 Oct 2026\./);
  await assert.doesNotReject(() => repository.assertEntitledAny(accountId, ["b2c_pro_monthly", "b2c_pro_annual"]));
  assert.equal((await repository.listSubscriptionsForAccount(accountId))[0]?.id, "sub_CHECKOUTFLOWNEW002", "the live plan carries the newest stamp");
});

test("a resync that fails leaves the page on the mirror's own state rather than failing the render", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWSYNC003";
  await repository.setAccountStripeCustomerId(accountId, customer);
  stripeSubscriptionsShouldFail.add(customer);
  const { status, html } = await getConsole(sessionCookie, "?checkout=success");
  assert.ok(stripeCallsTo("/v1/subscriptions").some((call) => call.url.includes(customer)), "the resync must have been attempted");
  assert.equal(status, 200);
  assert.match(html, /Access switches on as soon as Stripe confirms the payment/);
  assert.match(html, /No active plan yet/);
});

test("a plan scheduled to end says so, with the date, and offers only Manage billing", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWEND001";
  await repository.setAccountStripeCustomerId(accountId, customer);
  stripeSubscriptionsByCustomer.set(customer, [
    stripeSubscription({ id: "sub_CHECKOUTFLOWEND001", customer, status: "active", created: 1_800_000_000, cancelAt: PERIOD_END, cancelAtPeriodEnd: false }),
  ]);

  const { html } = await getConsole(sessionCookie, "?billing=cancel_scheduled");
  assert.match(html, /Your cancellation is scheduled\./);
  assert.match(html, /Your plan ends on 5 Oct 2026\. Your keys keep working until then, and you will not be charged again\./);
  assert.match(html, /choose Renew plan/);
  assert.match(html, />Manage billing</);
  assert.doesNotMatch(html, /name="flow" value="subscription_cancel"/, "nothing left to cancel");
  assert.doesNotMatch(html, /action="\/console\/checkout"/, "still entitled until the date, so no Checkout");
  await assert.doesNotReject(() => repository.assertEntitled(accountId, "b2c_pro_monthly"));
});

test("a past-due plan inside its grace window names the deadline and leads with Update payment method", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWPD0001";
  await repository.setAccountStripeCustomerId(accountId, customer);
  // Two days into the seven-day grace window, whenever the suite runs.
  const dunningStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const graceEnds = formatDate(new Date(dunningStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
  await repository.upsertSubscription(
    accountId,
    {
      id: "sub_CHECKOUTFLOWPD0001",
      stripeCustomerId: customer,
      status: "past_due",
      priceId: "price_MONTHLY0001",
      isGifted: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      observedAt: dunningStart.toISOString(),
    },
    dunningStart,
  );
  await repository.upsertEntitlement(accountId, { lookupKey: "b2c_pro_monthly", stripeCustomerId: customer, active: true, source: "stripe_webhook", observedAt: dunningStart.toISOString() }, new Date());

  const { html } = await getConsole(sessionCookie);
  assert.ok(html.includes(`Your last payment failed. Stripe is retrying it, and access continues until ${graceEnds}. Update your payment method to keep access.`), html);
  const pmu = html.indexOf('name="flow" value="payment_method_update"');
  const manage = html.indexOf(">Manage billing<");
  assert.ok(pmu !== -1 && manage !== -1 && pmu < manage, "Update payment method must come first");
  assert.doesNotMatch(html, /action="\/console\/checkout"/);
});

test("a canceled plan offers the plan forms again alongside Manage billing for invoices", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWGONE01";
  await repository.setAccountStripeCustomerId(accountId, customer);
  stripeSubscriptionsByCustomer.set(customer, [stripeSubscription({ id: "sub_CHECKOUTFLOWGONE01", customer, status: "canceled", created: 1_800_000_000 })]);

  const { html } = await getConsole(sessionCookie, "?billing=returned");
  assert.match(html, /Your plan is not active\./);
  assert.match(html, /action="\/console\/checkout"/);
  assert.match(html, /name="consent"/);
  assert.match(html, />Manage billing</);
  assert.doesNotMatch(html, /name="flow"/, "no deep links without a live plan");
  await assert.rejects(() => repository.assertEntitled(accountId, "b2c_pro_monthly"));
});

test("a late deleted event for an old plan does not hide the live one: the plan in force is the newest entitled subscription, not the newest row", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWLATE01";
  await repository.setAccountStripeCustomerId(accountId, customer);
  const annualStarted = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const monthlyEnded = new Date(Date.now() - 60 * 1000);
  await repository.upsertSubscription(
    accountId,
    { id: "sub_CHECKOUTFLOWLATEANN", stripeCustomerId: customer, status: "active", priceId: "price_ANNUAL00001", isGifted: false, cancelAtPeriodEnd: false, currentPeriodEnd: new Date(PERIOD_END * 1000).toISOString(), observedAt: annualStarted.toISOString() },
    annualStarted,
  );
  await repository.upsertEntitlement(accountId, { lookupKey: "b2c_pro_annual", stripeCustomerId: customer, active: true, source: "stripe_webhook", observedAt: annualStarted.toISOString() }, annualStarted);
  // The monthly plan, canceled at period end months ago, finally ends: Stripe's deleted event is the newest thing observed.
  await repository.upsertSubscription(
    accountId,
    { id: "sub_CHECKOUTFLOWLATEMON", stripeCustomerId: customer, status: "canceled", priceId: "price_MONTHLY0001", isGifted: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, observedAt: monthlyEnded.toISOString() },
    monthlyEnded,
  );

  const { html } = await getConsole(sessionCookie);
  assert.match(html, /Your Pro plan \(Annual\) is active and renews on 5 Oct 2026\./);
  assert.doesNotMatch(html, /Your plan is not active/);
  assert.match(html, /name="flow" value="subscription_cancel"/, "the live plan is still cancellable");

  // And the cancel deep link names the live subscription, not the one that just ended.
  await dispatch(
    new Request(`${ORIGIN}/console/billing`, {
      method: "POST",
      headers: { Cookie: sessionCookie, "Content-Type": "application/x-www-form-urlencoded", ...US_HEADERS },
      body: formBody({ csrf: await checkoutCsrf(accountId), flow: "subscription_cancel" }),
    }),
  );
  assert.equal(new URLSearchParams(stripeCallsTo("/v1/billing_portal/sessions").at(-1)!.body).get("flow_data[subscription_cancel][subscription]"), "sub_CHECKOUTFLOWLATEANN");
});

test("the resync retires an entitlement no subscription bills any more, so an in-place plan switch shows the new plan and closes the old key", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWSWIT01";
  await repository.setAccountStripeCustomerId(accountId, customer);
  const before = new Date(Date.now() - 10 * 60 * 1000);
  // The mirror as the webhook left it before the switch: one subscription on the monthly Price.
  await repository.upsertSubscription(
    accountId,
    { id: "sub_CHECKOUTFLOWSWIT01", stripeCustomerId: customer, status: "active", priceId: "price_MONTHLY0001", isGifted: false, cancelAtPeriodEnd: false, currentPeriodEnd: null, observedAt: before.toISOString() },
    before,
  );
  await repository.upsertEntitlement(accountId, { lookupKey: "b2c_pro_monthly", stripeCustomerId: customer, active: true, source: "stripe_webhook", observedAt: before.toISOString() }, before);
  // Stripe now: the same subscription, switched in the portal to the annual Price.
  stripeSubscriptionsByCustomer.set(customer, [stripeSubscription({ id: "sub_CHECKOUTFLOWSWIT01", customer, status: "active", created: 1_800_000_000, lookupKey: "b2c_pro_annual" })]);

  const { html } = await getConsole(sessionCookie, "?billing=returned");
  assert.match(html, /Your Pro plan \(Annual\) is active and renews on 5 Oct 2026\./);
  await assert.doesNotReject(() => repository.assertEntitled(accountId, "b2c_pro_annual"));
  await assert.rejects(() => repository.assertEntitled(accountId, "b2c_pro_monthly"), "the key no subscription bills must be retired");
});

test("the resync applies a live plan after a past-due one on the same key, so a stale past-due subscription cannot revoke a healthy one", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWRANK01";
  await repository.setAccountStripeCustomerId(accountId, customer);
  stripeSubscriptionsByCustomer.set(customer, [
    // Newer, past due (Stripe lists newest first), on the same lookup_key as the older live one.
    stripeSubscription({ id: "sub_CHECKOUTFLOWRANKPD", customer, status: "past_due", created: 1_800_500_000 }),
    stripeSubscription({ id: "sub_CHECKOUTFLOWRANKOK", customer, status: "active", created: 1_800_000_000 }),
  ]);

  const { html } = await getConsole(sessionCookie, "?checkout=success");
  assert.match(html, /Your Pro plan \(Monthly\) is active and renews on 5 Oct 2026\./);
  await assert.doesNotReject(() => repository.assertEntitled(accountId, "b2c_pro_monthly"));
  assert.equal((await repository.listSubscriptionsForAccount(accountId))[0]?.id, "sub_CHECKOUTFLOWRANKOK", "the live subscription carries the newest stamp");
});

test("a webhook created in the same second as a resync still wins, because the resync stamps itself in the second before its read", async () => {
  await enableCheckoutFlag(flagsKv);
  const { sessionCookie, accountId } = await freshCheckoutIdentity();
  const customer = "cus_CHECKOUTFLOWSEC001";
  await repository.setAccountStripeCustomerId(accountId, customer);
  stripeSubscriptionsByCustomer.set(customer, [stripeSubscription({ id: "sub_CHECKOUTFLOWSEC001", customer, status: "active", created: 1_800_000_000 })]);
  await getConsole(sessionCookie, "?checkout=success");
  const stamp = (await repository.listSubscriptionsForAccount(accountId))[0];
  assert.ok(stamp);

  // The instant the render happened, truncated to the second Stripe would put on an event
  // created at that moment. That event must outrank the resync's row.
  const sameSecond = new Date(Math.floor(Date.now() / 1000) * 1000);
  const mirror = await repository.upsertSubscription(
    accountId,
    { id: "sub_CHECKOUTFLOWSEC001", stripeCustomerId: customer, status: "active", priceId: "price_MONTHLY0001", isGifted: false, cancelAtPeriodEnd: true, currentPeriodEnd: null, observedAt: sameSecond.toISOString() },
    sameSecond,
  );
  assert.equal(mirror.status, "active");
  assert.equal((await repository.listSubscriptionsForAccount(accountId))[0]?.cancelAtPeriodEnd, true, "the same-second event's write must not be discarded as older");
});
