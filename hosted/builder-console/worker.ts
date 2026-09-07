/**
 * clueless-creations-app — entry point.
 *
 * Owns the route table. Google OIDC and the session cookie (M3) are handled directly below;
 * the API-key console (M5, ./console/keys.js), the Stripe webhook plus reconciliation cron
 * (M6, ./billing/webhook.js and ./billing/reconcile.js), and self-serve Checkout
 * (./console/checkout.js, gated by analytics/flags.ts's checkout flag) are each wired in with
 * the one import line their own module needed — see the "M5", "M6", and "Self-serve Checkout"
 * markers below for exactly where a future change to any of the three should land.
 *
 * This Worker is deliberately separate from b2c-app-builder-mcp. That Worker is an OAuth
 * authorization server whose trust model is an enumerated route allowlist plus an origin pin;
 * signup and billing do not share its blast radius.
 */

import { handleRelay, isRelayPath } from "./analytics/relay.js";
import { createRequestClient, refreshFlagDefinitions } from "./analytics/posthog.js";
import { CHECKOUT_FLAG_KEY, resolveCheckoutGate, type CheckoutGate } from "./analytics/flags.js";
import { type CaptureConfig } from "./analytics/capture.js";
import { captureConsoleEvent } from "./analytics/console-capture.js";
import { emailDomain, EVENTS, type SigninFailureReason } from "./analytics/events.js";
import { AccessError, constantTimeEqual, isConsentSecret, sha256 } from "../knowledge-mcp/auth.js";
import { tenantDbFromEnv, type AccountId, type SubscriptionMirrorState, type SubscriptionSummary } from "../knowledge-mcp/db/tenant.js";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode, verifyGoogleIdToken, GoogleAuthError, type GoogleIdTokenClaims } from "./auth/google.js";
import {
  clearOAuthStateCookieHeader,
  clearSessionCookieHeader,
  generateOpaqueToken,
  oauthStateCookieHeader,
  readBrowserDistinctId,
  readOAuthState,
  readSessionToken,
  sessionCookieHeader,
  sessionExpiresAt,
} from "./auth/session.js";
import { syncSubscriptionsFromStripe } from "./billing/checkout.js";
import { PAST_DUE_GRACE_MS, pickCurrentSubscription, resolveEntitlement } from "./billing/entitlement-policy.js";
import { PLAN_IDS, PLANS } from "./billing/plans.js";
import packageJson from "./package.json" with { type: "json" };

// --- M5: API-key management console — one import line. ---------------------------------------
import { handleConsoleKeysRequest, isConsoleKeysPath, type ConsoleSession } from "./console/keys.js";

// --- Interest collector, routed into the console — one import line each. ---------------------
import { handleConsoleInterestRequest, isConsoleInterestPath } from "./console/interest.js";
import {
  isBillingNotice,
  isSigninNotice,
  issueCheckoutCsrfToken,
  issueInterestCsrfToken,
  issueSignoutCsrfToken,
  navFor,
  renderConsoleErrorPage,
  renderConsolePage,
  renderConsolePlansPage,
  renderConsoleUnavailablePage,
  renderSigninFailedPage,
  renderSigninPage,
  verifySignoutCsrfToken,
  type BillingNotice,
  type EntitlementDisplayState,
  type PlanView,
} from "./console/pages.js";
import { consoleHtmlResponse } from "./console/chrome.js";
import { handleFontRequest, isFontPath } from "./console/fonts.js";
import { findInterestSignalByAccount, interestDbFromEnv } from "./interest/repository.js";

// --- M6: Stripe webhook and reconciliation — one import line each. ----------------------------
import { handleStripeWebhook } from "./billing/webhook.js";
import { reconcileStaleEntitlements } from "./billing/reconcile.js";

// --- Self-serve Checkout, routed into the console — one import line each. ---------------------
import { handleConsoleCheckoutRequest, isConsoleCheckoutPath } from "./console/checkout.js";

/**
 * The full binding and secret set this deployment needs, on top of the generated `Env`
 * (worker-configuration.d.ts, from wrangler.jsonc's bindings and `secrets.required`).
 * `POSTHOG_PROJECT_TOKEN`/`POSTHOG_FEATURE_FLAGS_SECURE_KEY` stay out of wrangler.jsonc on
 * purpose (hosted/builder-console/README.md's Credentials section: an unset token is the analytics off
 * switch), so they are added here the same way hosted/knowledge-mcp/analytics.ts augments ITS OWN
 * generated `Env` for the same two variables.
 */
interface AppEnv extends Env {
  readonly POSTHOG_PROJECT_TOKEN: string;
  readonly POSTHOG_FEATURE_FLAGS_SECURE_KEY?: string;
}

function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  // Console responses carry account state, billing state, and — on the key-created page — a raw
  // API key that is shown exactly once. None of that may sit in a shared or intermediary cache,
  // and the key page in particular must not be restorable from the browser's back/forward cache.
  // Only responses that declare no policy of their own: the self-hosted fonts under /fonts/ set a
  // year-long immutable cache deliberately, and a blanket set here would silently undo it.
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function analyticsConfig(env: AppEnv): CaptureConfig {
  return { token: env.POSTHOG_PROJECT_TOKEN, host: env.POSTHOG_HOST, surface: "console", engineVersion: packageJson.version };
}

/**
 * `CF-IPCountry`, read the same way `hosted/analytics.ts` reads it for the MCP surface — passed
 * to `captureConsoleEvent` rather than read again there, so every call site names the decision.
 */
function countryOf(request: Request): string | null {
  return request.headers.get("cf-ipcountry");
}

/**
 * Resolves the checkout gate for one request. `evaluate()` is called exactly once by
 * `resolveCheckoutGate` (`analytics/flags.ts`), so the PostHog client is created, asked for the
 * one flag this surface cares about, and shut down within that single call — the request-path
 * client (`createRequestClient`) never fetches definitions itself, only reads the KV cache
 * `refreshFlagDefinitions` keeps warm, matching every other read of that same cache.
 *
 * `sendFeatureFlagEvents: false` is required, not tuning: without it, `isFeatureEnabled` fires
 * posthog-node's own `$feature_flag_called` capture to `/batch/` on every call — a raw SDK
 * auto-capture that bypasses `analytics/console-capture.ts`'s `captureConsoleEvent` entirely, so
 * none of this Worker's own privacy gating (geography suppression, the per-account
 * `analytics:optout:` check, fail-closed on a KV outage — see "Analytics privacy gates") would
 * apply to it. A gate check runs on every `/console` render and every checkout action, so left
 * on this would mean an unfiltered analytics event per page view. This surface has its own
 * capture for the moment that matters (`upgrade_intent_clicked`, fired from the POST handler,
 * already gated the normal way); the flag lookup itself is routing, not a user-facing exposure
 * PostHog's experimentation analytics has any reason to see.
 */
async function checkoutGateFor(env: AppEnv, distinctId: string, ctx: ExecutionContext): Promise<CheckoutGate> {
  return resolveCheckoutGate(
    async () => {
      const client = createRequestClient(env, env.FLAGS_KV, ctx);
      try {
        const enabled = await client.isFeatureEnabled(CHECKOUT_FLAG_KEY, distinctId, { sendFeatureFlagEvents: false });
        return { isEnabled: () => enabled };
      } finally {
        await client.shutdown();
      }
    },
    env.FLAGS_KV,
    undefined,
    env.CHECKOUT_ENABLED,
  );
}

/**
 * Reduces a subscription mirror row to what the console displays. Calls the same
 * `resolveEntitlement` (`billing/entitlement-policy.ts`) the webhook and reconciliation paths
 * call, so this page cannot show "active" for a status those paths would already treat as
 * revoked — see `console/pages.ts`'s `EntitlementDisplayState` for why `entitlements.active`
 * alone cannot tell "active" apart from "past_due but still inside the grace window".
 */
function entitlementDisplayStateFor(mirror: SubscriptionMirrorState | null, now: Date): EntitlementDisplayState {
  if (mirror === null) return "none";
  if (mirror.status === "active" || mirror.status === "trialing") return "active";
  if (mirror.status === "past_due") {
    return resolveEntitlement({ status: "past_due", pastDueSince: mirror.pastDueSince, now }).active ? "past_due_in_grace" : "canceled";
  }
  // canceled, unpaid, incomplete, incomplete_expired, paused: never entitled, no grace.
  return "canceled";
}

/**
 * Everything the plan page shows, from the plan in force (`pickCurrentSubscription` over the
 * mirror rows) and the account's active entitlements. The plan name comes from the entitlement
 * side, not the mirror's `price_id`: entitlements are keyed by `lookup_key`, which is what
 * `billing/plans.ts` names, and the most recently granted active entitlement for one of this
 * console's plans is "the plan this account is on" — most recent, because after an in-place
 * switch in the portal the old key's row stays active until the next resync or sweep retires
 * it (`listActiveEntitlementsForCustomer` returns newest first for exactly this). Period end,
 * scheduled cancellation, and the grace deadline are only reported for states where they mean
 * something.
 */
function planViewFor(summary: SubscriptionSummary | null, activeLookupKeys: readonly string[], now: Date): PlanView {
  const state = entitlementDisplayStateFor(summary, now);
  const live = state === "active" || state === "past_due_in_grace";
  const planId = activeLookupKeys.map((key) => PLAN_IDS.find((id) => PLANS[id].lookupKey === key)).find((id) => id !== undefined);
  return {
    state,
    planName: live && planId !== undefined ? PLANS[planId].displayName : null,
    periodEnd: live ? (summary?.currentPeriodEnd ?? null) : null,
    cancelScheduled: state === "active" && (summary?.cancelAtPeriodEnd ?? false),
    graceEndsAt: state === "past_due_in_grace" && summary?.pastDueSince ? new Date(Date.parse(summary.pastDueSince) + PAST_DUE_GRACE_MS).toISOString() : null,
  };
}

/**
 * Bounds on the console's own Stripe re-reads (`renderConsoleHome`), kept in FLAGS_KV per
 * account: a return from Checkout or the portal re-reads at most once a minute (KV's minimum
 * TTL), so a reload of a `?billing=` URL left in the address bar is not a Stripe round trip
 * every time; the unprompted re-read for an account with a Customer and no mirror row happens
 * at most once an hour, because that is also the permanent state of an abandoned Checkout.
 * Two keys, not one: an idle memo must never suppress the re-read a genuine return asks for.
 */
const RESYNC_RETURN_MEMO_TTL_SECONDS = 60;
const RESYNC_IDLE_MEMO_TTL_SECONDS = 60 * 60;

function resyncMemoKey(kind: "return" | "idle", accountId: AccountId): string {
  return `billing:resync:${kind}:${accountId}`;
}

const CHECKOUT_QUERY_VALUES = ["success", "cancelled"] as const;
type CheckoutQuery = (typeof CHECKOUT_QUERY_VALUES)[number];

function checkoutQueryOf(url: URL): CheckoutQuery | null {
  const raw = url.searchParams.get("checkout");
  return (CHECKOUT_QUERY_VALUES as readonly string[]).includes(raw ?? "") ? (raw as CheckoutQuery) : null;
}

/**
 * Renders `/console`. Two entirely different shapes, chosen by the checkout gate
 * (`analytics/flags.ts`) resolved for this same request:
 *
 *   - Gate on: the plan forms and the account's current entitlement state
 *     (`console/pages.ts`'s `renderConsolePlansPage`), read from the Stripe Customer id and
 *     subscription mirror `db/tenant.ts` already exposes.
 *   - Gate off: the ask-for-access form, or the submitted state once
 *     `interest/repository.ts`'s `findInterestSignalByAccount` finds a row for this account
 *     (`renderConsolePage`, unchanged from before this surface existed).
 *
 * Both read their own state on every GET (rather than trusting a query-string flash) so a page
 * refresh, a bookmark, or coming back tomorrow all show the truth, not just the instant after a
 * successful POST.
 */
async function renderConsoleHome(
  env: AppEnv,
  tenant: NonNullable<ReturnType<typeof tenantDbFromEnv>>,
  session: ConsoleSession,
  gate: CheckoutGate,
  checkoutQuery: CheckoutQuery | null,
  billingNotice: BillingNotice | null,
): Promise<string> {
  if (gate.checkoutAvailable) {
    const now = new Date();
    const [stripeCustomerId, csrfToken, mirrored] = await Promise.all([
      tenant.getAccountStripeCustomerId(session.accountId),
      issueCheckoutCsrfToken(env.B2C_APP_CONSOLE_AUTH_SECRET, session.accountId),
      tenant.listSubscriptionsForAccount(session.accountId),
    ]);
    let subscriptions = mirrored;
    // Re-read this account's subscriptions from Stripe before rendering when the mirror is the
    // least likely to be current: the person has just come back from Checkout or the Billing
    // Portal (the webhook describing what they did may still be in flight), or the account has
    // a Customer and no mirror row at all (a Checkout that completed while its webhook was
    // lost, or a person who paid and closed the tab). Stripe's own guidance for the return from
    // Checkout is to verify from the API rather than trust the redirect; this is that check,
    // for every return. The no-mirror case is rate-limited through FLAGS_KV, because it is also
    // the permanent state of an account that clicked a plan and abandoned Checkout, and a
    // Stripe round trip on every page view for that account forever would be the wrong price
    // for it. A failure here is logged and the page renders whatever the mirror holds — the
    // reconciliation sweep and the webhook path remain the durable sources.
    const returned = checkoutQuery === "success" || billingNotice !== null;
    if (stripeCustomerId !== null && (returned || subscriptions.length === 0)) {
      const memo = resyncMemoKey(returned ? "return" : "idle", session.accountId);
      const ttl = returned ? RESYNC_RETURN_MEMO_TTL_SECONDS : RESYNC_IDLE_MEMO_TTL_SECONDS;
      try {
        // KV faults must not take the page down, and must not stop the read they only meant to
        // rate-limit — the same `.catch(() => null)` every other FLAGS_KV read in this Worker uses.
        const recentlySynced = (await env.FLAGS_KV.get(memo).catch(() => null)) !== null;
        if (!recentlySynced) {
          await env.FLAGS_KV.put(memo, now.toISOString(), { expirationTtl: ttl }).catch(() => undefined);
          await syncSubscriptionsFromStripe(tenant, session.accountId, stripeCustomerId, { secretKey: env.STRIPE_RESTRICTED_KEY, accountId: env.STRIPE_ACCOUNT_ID }, now);
          subscriptions = await tenant.listSubscriptionsForAccount(session.accountId);
        }
      } catch (error) {
        console.error("console: could not re-read subscriptions from Stripe; rendering the mirror as is:", error instanceof Error ? error.message : error);
      }
    }
    const activeLookupKeys =
      stripeCustomerId === null ? [] : (await tenant.listActiveEntitlementsForCustomer(session.accountId, stripeCustomerId)).map((row) => row.lookupKey);
    return renderConsolePlansPage({
      csrfToken,
      plan: planViewFor(pickCurrentSubscription(subscriptions, now), activeLookupKeys, now),
      hasStripeCustomer: stripeCustomerId !== null,
      checkoutQuery,
      billingNotice,
      nav: navFor(session, "console"),
    });
  }
  const db = interestDbFromEnv(env);
  const [existing, csrfToken] = await Promise.all([
    db === null ? Promise.resolve(null) : findInterestSignalByAccount(db, session.accountId),
    issueInterestCsrfToken(env.B2C_APP_CONSOLE_AUTH_SECRET, session.accountId),
  ]);
  return renderConsolePage({ csrfToken, alreadySubmitted: existing !== null, nav: navFor(session, "console") });
}

// ---------------------------------------------------------------------------
// Google sign-in
// ---------------------------------------------------------------------------

/**
 * Where a sign-in began, for `signin_started`'s attribution: the offer page's main call
 * (`landing`) and its header (`header`), the console guard, the pricing route, and the sign-in
 * page's own button (`signin`). Anything else is coerced to `landing` rather than refused.
 */
const ENTRY_POINTS = ["landing", "console_guard", "pricing", "header", "signin"] as const;
type EntryPoint = (typeof ENTRY_POINTS)[number];

function entryPointOf(url: URL): EntryPoint {
  const requested = url.searchParams.get("entry_point");
  return (ENTRY_POINTS as readonly string[]).includes(requested ?? "") ? (requested as EntryPoint) : "landing";
}

/** Both legs of the OAuth round trip must present Google with the identical redirect_uri. */
function googleRedirectUri(request: Request): string {
  return new URL("/auth/google/callback", request.url).toString();
}

function redirectResponse(location: string, extraHeaders?: readonly (readonly [string, string])[]): Response {
  const headers = new Headers({ Location: location });
  for (const [name, value] of extraHeaders ?? []) headers.append(name, value);
  return new Response(null, { status: 302, headers });
}

/**
 * A signed-out visitor lands on the sign-in page, never straight on Google's account picker:
 * the page says what they are signing into and links the Terms and Privacy notice before any
 * Google screen appears. The entry point rides along so the page's own button keeps it.
 */
function redirectToSignin(request: Request, entryPoint: EntryPoint, clearCookies: readonly string[] = []): Response {
  const target = new URL(SIGNIN_PATH, request.url);
  target.searchParams.set("entry_point", entryPoint);
  return redirectResponse(
    target.toString(),
    clearCookies.map((cookie) => ["Set-Cookie", cookie] as const),
  );
}

async function handleGoogleStart(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const url = new URL(request.url);
  const entryPoint = entryPointOf(url);
  const state = generateOpaqueToken();
  const nonce = generateOpaqueToken();
  const authorizeUrl = buildGoogleAuthorizeUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: googleRedirectUri(request),
    state,
    nonce,
  });

  // Best-effort: lands on the same anonymous person as landing_viewed when the browser already
  // carries posthog-js's cookie, skipped otherwise rather than inventing a distinct_id. See
  // readBrowserDistinctId's own doc comment for why a miss here is not a bug to chase.
  const distinctId = readBrowserDistinctId(request);
  if (distinctId !== undefined) {
    // No account exists yet, so no objectionSubject: this event gets the geography check only.
    captureConsoleEvent(ctx, env.FLAGS_KV, analyticsConfig(env), countryOf(request), {
      distinctId,
      event: EVENTS.signinStarted,
      authState: "anonymous",
      properties: { method: "google", entry_point: entryPoint },
    });
  }

  return redirectResponse(authorizeUrl, [["Set-Cookie", oauthStateCookieHeader({ state, nonce })]]);
}

async function handleGoogleCallback(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
  const url = new URL(request.url);
  const clearState = clearOAuthStateCookieHeader();

  function fail(reason: SigninFailureReason): Response {
    const distinctId = readBrowserDistinctId(request);
    if (distinctId !== undefined) {
      // Same as signinStarted above: no account exists yet, so geography only.
      captureConsoleEvent(ctx, env.FLAGS_KV, analyticsConfig(env), countryOf(request), {
        distinctId,
        event: EVENTS.signinFailed,
        authState: "anonymous",
        properties: { method: "google", reason },
      });
    }
    const response = consoleHtmlResponse(renderSigninFailedPage(reason), 400);
    response.headers.append("Set-Cookie", clearState);
    return response;
  }

  // Google reports the user's own choice not to continue this way. Not a taxonomy failure code
  // (there is no "user declined" reason, and inventing one would violate the closed enum), so
  // this returns to the start of the flow without firing signin_failed.
  if (url.searchParams.get("error") !== null) {
    const target = new URL(SIGNIN_PATH, request.url);
    target.searchParams.set("notice", "cancelled");
    const response = redirectResponse(target.toString());
    response.headers.append("Set-Cookie", clearState);
    return response;
  }

  const savedState = readOAuthState(request);
  const queryState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (savedState === undefined || queryState === null || code === null || !constantTimeEqual(savedState.state, queryState)) {
    return fail("state_mismatch");
  }

  let idToken: string;
  try {
    ({ idToken } = await exchangeGoogleCode({
      code,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: googleRedirectUri(request),
    }));
  } catch (error) {
    return fail(error instanceof GoogleAuthError ? error.reason : "internal");
  }

  let claims: GoogleIdTokenClaims;
  try {
    claims = await verifyGoogleIdToken(idToken, { clientId: env.GOOGLE_CLIENT_ID, nonce: savedState.nonce });
  } catch (error) {
    return fail(error instanceof GoogleAuthError ? error.reason : "internal");
  }

  const tenant = tenantDbFromEnv(env);
  if (tenant === null) return fail("internal");

  try {
    const existing = await tenant.findUserByGoogleSub(claims.sub);
    let userId: string;
    let accountId: AccountId;
    let isNewAccount: boolean;
    if (existing !== null) {
      ({ userId, accountId } = existing);
      isNewAccount = false;
    } else {
      // accounts.stripe_customer_id is nullable as of 0008_lazy_stripe_customer.sql: sign-in no
      // longer creates a Stripe Customer, or reaches Stripe at all. The account row is created
      // with no Customer; the first Checkout attempt is what actually mints one
      // (billing/checkout.ts's ensureStripeCustomer, through tenant.setAccountStripeCustomerId).
      // A failing or unreachable Stripe must never be able to take sign-in down with it.
      userId = crypto.randomUUID();
      ({ accountId } = await tenant.createUserAndAccountFromGoogle({
        userId,
        googleSub: claims.sub,
        email: claims.email,
        emailVerified: claims.emailVerified,
        displayName: claims.name ?? null,
      }));
      isNewAccount = true;
    }

    const rawSessionToken = generateOpaqueToken();
    const expiresAt = sessionExpiresAt();
    await tenant.createSession(accountId, userId, { rawToken: rawSessionToken, expiresAt: expiresAt.toISOString() });

    const analytics = analyticsConfig(env);
    const country = countryOf(request);
    // Both events have a stable subject now: the account row above is already committed, so
    // accountId is a real analytics:optout:<account_id> subject, not merely this event's
    // distinct_id.
    captureConsoleEvent(ctx, env.FLAGS_KV, analytics, country, {
      distinctId: accountId,
      event: EVENTS.signinCompleted,
      authState: "authenticated",
      properties: { method: "google", is_new_account: isNewAccount },
      objectionSubject: accountId,
    });
    if (isNewAccount) {
      captureConsoleEvent(ctx, env.FLAGS_KV, analytics, country, {
        distinctId: accountId,
        event: EVENTS.accountCreated,
        authState: "authenticated",
        properties: { method: "google", email_domain: emailDomain(claims.email) },
        objectionSubject: accountId,
      });
    }

    const response = redirectResponse("/console");
    response.headers.append("Set-Cookie", sessionCookieHeader(rawSessionToken, expiresAt));
    response.headers.append("Set-Cookie", clearState);
    return response;
  } catch {
    return fail("internal");
  }
}

/**
 * Session-gates `/console` and everything under it. Redirects to sign-in when the cookie is
 * absent, and clears it when present but no longer valid (expired, revoked, or a suspended
 * account/membership — `resolveSessionPrincipal` already makes all three an `AccessError`).
 */
async function requireConsoleSession(
  request: Request,
  env: AppEnv,
): Promise<{ tenant: NonNullable<ReturnType<typeof tenantDbFromEnv>>; session: ConsoleSession; sessionId: string } | Response> {
  const tenant = tenantDbFromEnv(env);
  const token = readSessionToken(request);
  if (tenant === null || token === undefined) return redirectToSignin(request, "console_guard");
  try {
    const principal = await tenant.resolveSessionPrincipal(token);
    // The header shows who is signed in and carries the sign-out form, so every console page
    // needs the person and a sign-out token. Resolved once here rather than in each handler.
    const [user, signoutCsrfToken, sessionId] = await Promise.all([
      tenant.getSessionUser(principal.accountId, principal.userId),
      issueSignoutCsrfToken(env.B2C_APP_CONSOLE_AUTH_SECRET, principal.accountId),
      sha256(token),
    ]);
    const session: ConsoleSession = { ...principal, email: user?.email, displayName: user?.displayName ?? null, signoutCsrfToken };
    return { tenant, session, sessionId };
  } catch (error) {
    if (error instanceof AccessError) return redirectToSignin(request, "console_guard", [clearSessionCookieHeader()]);
    throw error;
  }
}

const SIGNIN_PATH = "/signin";
const SIGNOUT_PATH = "/auth/signout";

/**
 * Whether the request carries a session the guard would accept. Used by GET /signin only, to
 * send an already signed-in person on to /console; it signs nothing and reads no secret, so it
 * is safe to run before the console secret-shape check below.
 */
async function hasConsoleSession(request: Request, env: AppEnv): Promise<boolean> {
  const tenant = tenantDbFromEnv(env);
  const token = readSessionToken(request);
  if (tenant === null || token === undefined) return false;
  try {
    await tenant.resolveSessionPrincipal(token);
    return true;
  } catch (error) {
    if (error instanceof AccessError) return false;
    throw error;
  }
}

/**
 * GET /signin: the front door. A valid session goes straight to /console; everyone else gets
 * the page with one button to Google, carrying whatever `entry_point` brought them here.
 */
async function handleSignin(request: Request, env: AppEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  if (await hasConsoleSession(request, env)) return redirectResponse("/console");
  const url = new URL(request.url);
  const notice = url.searchParams.get("notice");
  return consoleHtmlResponse(renderSigninPage({ entryPoint: entryPointOf(url), notice: isSigninNotice(notice) ? notice : null }));
}

/**
 * POST /auth/signout, from the form in every signed-in page's header. Revokes the session row
 * (clearing the cookie alone would leave a copied token valid until expiry) and clears the
 * cookie. CSRF-checked like every other console form, under its own namespace.
 */
async function handleSignout(
  request: Request,
  env: AppEnv,
  resolved: { tenant: NonNullable<ReturnType<typeof tenantDbFromEnv>>; session: ConsoleSession; sessionId: string },
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const params = new URLSearchParams(await request.text());
  const csrf = params.get("signout_token") ?? "";
  if (!(await verifySignoutCsrfToken(env.B2C_APP_CONSOLE_AUTH_SECRET, csrf, resolved.session.accountId))) {
    return new Response(JSON.stringify({ error: "invalid_csrf" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }
  await resolved.tenant.revokeSession(resolved.session.accountId, resolved.sessionId);
  const target = new URL(SIGNIN_PATH, request.url);
  target.searchParams.set("notice", "signed_out");
  const response = new Response(null, { status: 303, headers: { Location: target.toString() } });
  response.headers.append("Set-Cookie", clearSessionCookieHeader());
  return response;
}

export default {
  async fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // The relay carries no session and needs no auth — it is a first-party pass-through, and it
    // strips Cookie and Authorization before anything leaves this origin.
    if (isRelayPath(url.pathname)) return securityHeaders(await handleRelay(request));

    if (url.pathname === "/health") {
      return securityHeaders(
        new Response(JSON.stringify({ status: "ok", service: "clueless-creations-app" }), { headers: { "Content-Type": "application/json" } }),
      );
    }

    // The bare origin is where the marketing site, the FAQ, and agents.md send a person ("sign in
    // at app.clueless-creations.com"), so it must not answer 404. It has no page of its own:
    // it hands off to /console, whose guard sends a signed-out visitor to Google and a
    // signed-in one to their keys. A redirect rather than rendering here keeps one route
    // owning the session check.
    if (url.pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") return securityHeaders(new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } }));
      return securityHeaders(redirectResponse("/console"));
    }

    // The console's two web fonts, served from this origin so every page keeps font-src 'self'.
    if (isFontPath(url.pathname)) return securityHeaders(handleFontRequest(request));

    if (url.pathname === SIGNIN_PATH) return securityHeaders(await handleSignin(request, env));
    if (url.pathname === "/auth/google/start") return securityHeaders(await handleGoogleStart(request, env, ctx));
    if (url.pathname === "/auth/google/callback") return securityHeaders(await handleGoogleCallback(request, env, ctx));

    if (
      url.pathname === "/console" ||
      url.pathname === SIGNOUT_PATH ||
      isConsoleKeysPath(url.pathname) ||
      isConsoleInterestPath(url.pathname) ||
      isConsoleCheckoutPath(url.pathname)
    ) {
      // Checked before requireConsoleSession, and before any handler below, so a malformed
      // B2C_APP_CONSOLE_AUTH_SECRET fails here with a clear 503 and a log line — see
      // consoleUnavailablePage's doc comment for the incident this closes. The value itself is
      // never logged, only the fact that its shape is wrong.
      if (!isConsentSecret(env.B2C_APP_CONSOLE_AUTH_SECRET)) {
        console.error(
          "B2C_APP_CONSOLE_AUTH_SECRET is not shaped like a console CSRF secret (must be 43 to 128 base64url characters) — see hosted/builder-console/README.md's Credentials section.",
        );
        return securityHeaders(consoleHtmlResponse(renderConsoleUnavailablePage(), 503));
      }
      // B2C_APP_CONSOLE_AUTH_SECRET signs only this CSRF pair (the keys-page, interest-form, and
      // checkout tokens, each under its own namespace string — see console/pages.ts). It is not
      // also pressed into service for M3's session cookie or OAuth `state`/`nonce`: those are
      // unguessable random tokens with no HMAC layered on (auth/session.ts's own doc comment on
      // oauthStateCookieHeader says why — there is nothing a signature would protect that
      // unpredictability plus `HttpOnly` does not already), so there is no second token type this
      // secret could sign and no name collision to reconcile. One secret, one job — the
      // least-new-surface reading of "does M3 need this too?" is that it does not.
      //
      // Wrapped in try/catch, unlike the rest of this fetch handler: the secret shape is the one
      // known way a console request can throw unexpectedly (the 2026-09-02 incident), but it is
      // not the only conceivable one — requireConsoleSession's own D1 read and every handler below
      // it (keys, interest, checkout, render) reach D1 and other request-scoped state. So
      // requireConsoleSession is called *inside* this try, not before it: its own AccessError
      // handling still redirects (it returns a Response rather than throwing, so this catch never
      // sees it), but any other throw it produces — e.g. a D1 failure while resolving the session —
      // gets the same logged-500 safety net as the handlers, instead of escaping as the unhandled
      // exception (1101) this whole guard exists to prevent.
      try {
        const resolved = await requireConsoleSession(request, env);
        if (resolved instanceof Response) return securityHeaders(resolved);
        if (url.pathname === SIGNOUT_PATH) return securityHeaders(await handleSignout(request, env, resolved));
        if (url.pathname === "/console") {
          const gate = await checkoutGateFor(env, resolved.session.accountId, ctx);
          const billing = url.searchParams.get("billing");
          return securityHeaders(
            consoleHtmlResponse(
              await renderConsoleHome(env, resolved.tenant, resolved.session, gate, checkoutQueryOf(url), isBillingNotice(billing) ? billing : null),
            ),
          );
        }
        // --- Interest collector, routed into the console --------------------------------------
        if (isConsoleInterestPath(url.pathname)) {
          const db = interestDbFromEnv(env);
          if (db === null) {
            // Same "unchanged behaviour with no binding" contract as the Stripe webhook branch
            // below and db/tenant.ts's own tenantDbFromEnv doc comment.
            return securityHeaders(
              new Response(JSON.stringify({ error: "database_unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }),
            );
          }
          return securityHeaders(
            await handleConsoleInterestRequest(request, {
              db,
              session: resolved.session,
              analytics: analyticsConfig(env),
              ctx,
              csrfSecret: env.B2C_APP_CONSOLE_AUTH_SECRET,
              country: countryOf(request),
            }),
          );
        }
        // --- Self-serve Checkout, routed into the console -------------------------------------
        if (isConsoleCheckoutPath(url.pathname)) {
          const gate = await checkoutGateFor(env, resolved.session.accountId, ctx);
          return securityHeaders(
            await handleConsoleCheckoutRequest(request, {
              db: resolved.tenant,
              interestDb: interestDbFromEnv(env),
              session: resolved.session,
              analytics: analyticsConfig(env),
              ctx,
              flagsKv: env.FLAGS_KV,
              csrfSecret: env.B2C_APP_CONSOLE_AUTH_SECRET,
              checkoutAvailable: gate.checkoutAvailable,
              secretKey: env.STRIPE_RESTRICTED_KEY,
              stripeAccountId: env.STRIPE_ACCOUNT_ID,
              country: countryOf(request),
            }),
          );
        }
        // --- M5: API-key management console ---------------------------------------------------
        return securityHeaders(
          await handleConsoleKeysRequest(request, {
            db: resolved.tenant,
            session: resolved.session,
            analytics: analyticsConfig(env),
            ctx,
            flagsKv: env.FLAGS_KV,
            csrfSecret: env.B2C_APP_CONSOLE_AUTH_SECRET,
          }),
        );
      } catch (error) {
        console.error("Unexpected error in a console handler:", error instanceof Error ? (error.stack ?? error.message) : error);
        return securityHeaders(consoleHtmlResponse(renderConsoleErrorPage(), 500));
      }
    }

    // --- M6: Stripe webhook -----------------------------------------------------------------
    if (url.pathname === "/webhooks/stripe") {
      const tenant = tenantDbFromEnv(env);
      if (tenant === null) {
        // No D1 binding configured. The same "unchanged behaviour with no binding" contract
        // db/tenant.ts documents for the API-key path, applied to this one.
        return securityHeaders(
          new Response(JSON.stringify({ error: "database_unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }),
        );
      }
      return securityHeaders(await handleStripeWebhook(request, env, tenant));
    }

    return securityHeaders(new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
  },

  /**
   * Flag-definition refresh, plus entitlement reconciliation (M6). The only place allowed to
   * fetch PostHog flag definitions and write them to KV, and the only place the feature-flags
   * secure key is read.
   *
   * A failure in the flag refresh is loud rather than swallowed: the request path fails closed
   * on stale definitions, so a silently broken refresher would hide Checkout indefinitely with
   * no signal. Reconciliation runs on the same five-minute trigger rather than a schedule of its
   * own — entitlements_by_staleness (0003_billing.sql) and subscriptions_past_due_by_stamp
   * (0007_past_due_grace.sql) are both cheap to scan when nothing is stale or over grace.
   * `reconcileStaleEntitlements` (billing/reconcile.ts) runs both of its sweeps here in one call.
   */
  async scheduled(_event: ScheduledController, env: AppEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshFlagDefinitions(env, env.FLAGS_KV));
    // --- M6: entitlement reconciliation ---------------------------------------------------
    const tenant = tenantDbFromEnv(env);
    if (tenant !== null) ctx.waitUntil(reconcileStaleEntitlements(tenant, { secretKey: env.STRIPE_RESTRICTED_KEY, accountId: env.STRIPE_ACCOUNT_ID }));
  },
} satisfies ExportedHandler<AppEnv>;
