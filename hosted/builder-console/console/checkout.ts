/**
 * Console self-serve Checkout: POST /console/checkout and POST /console/billing.
 *
 * GET /console (the plan forms, the entitlement state, and the interest-form fallback) is
 * rendered by worker.ts alongside the rest of the console shell, the same way GET /console/keys
 * is owned by console/keys.ts and the interest form's own shape is owned by console/interest.ts
 * — this file owns only the two write sides. Session resolution (Google OIDC, the session
 * cookie) is M3's concern, not this file's: `handleConsoleCheckoutRequest` takes an
 * already-resolved session, exactly the pattern every other console module uses.
 *
 * CSRF reuses the same HMAC consent-token pair console/keys.ts and console/interest.ts do, under
 * its own "console-checkout:<account_id>" namespace (pages.ts's issueCheckoutCsrfToken /
 * verifyCheckoutCsrfToken) so a leaked keys-page or interest-form token cannot also spend as a
 * checkout action for the same account.
 *
 * Both routes re-check `deps.checkoutAvailable` themselves rather than trusting that GET
 * /console already hid the forms behind it: a direct POST must not reach Stripe while self-serve
 * Checkout is off for this account. Every Stripe-facing failure once past that gate — a
 * `permission_error` from a not-yet-rescoped restricted key, a misconfigured lookup_key, a
 * network fault, or (for the billing portal) no Stripe Customer yet at all — is caught and
 * turned into the exact fallback the flag-off state already renders: the interest form
 * (`console/pages.ts`'s `renderConsolePage`), with an explanatory notice above it. Never a 500
 * for any of those: see `billingUnavailable`'s own doc comment for the status this settles on
 * instead.
 */

import type { AccountId, TenantDb } from "../../knowledge-mcp/db/tenant.js";
import type { CaptureConfig, DedupeStore } from "../analytics/capture.js";
import { captureConsoleEvent } from "../analytics/console-capture.js";
import { EVENTS } from "../analytics/events.js";
import { createBillingPortalSession, createCheckoutSession, ensureStripeCustomer } from "../billing/checkout.js";
import { isPlanId, PLANS } from "../billing/plans.js";
import { findInterestSignalByAccount, type D1ReadLike } from "../interest/repository.js";
import { consoleHtmlResponse as htmlResponse } from "./chrome.js";
import { issueCheckoutCsrfToken, issueInterestCsrfToken, navFor, type ConsoleNavSource, renderConsolePage, verifyCheckoutCsrfToken } from "./pages.js";

/** The resolved session, plus what the shared header shows (console/pages.ts's ConsoleNavSource; optional so a bare test session still type-checks). */
export interface ConsoleCheckoutSession extends ConsoleNavSource {
  readonly accountId: AccountId;
  readonly userId: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Only the tenant repository functions this module actually calls. */
type CheckoutDb = Pick<TenantDb, "getAccountStripeCustomerId" | "setAccountStripeCustomerId" | "getAccountOwnerEmail">;

export interface ConsoleCheckoutDeps {
  readonly db: CheckoutDb;
  /** Same "unchanged behaviour with no binding" contract as every other console route — see interest/repository.ts's interestDbFromEnv. */
  readonly interestDb: D1ReadLike | null;
  readonly session: ConsoleCheckoutSession;
  readonly analytics: CaptureConfig;
  readonly ctx: ExecutionContextLike;
  readonly flagsKv: DedupeStore;
  /** Opaque HMAC secret for the CSRF pair, matching every other console route's csrfSecret. */
  readonly csrfSecret: string;
  /**
   * Resolved once by the caller for this same request (worker.ts's `checkoutGateFor`) — this
   * file never evaluates the flag itself. Passed in rather than re-derived so GET /console and
   * these two POST routes can never disagree about the gate within one request, and so this
   * module needs no PostHog client wiring of its own.
   */
  readonly checkoutAvailable: boolean;
  /** STRIPE_RESTRICTED_KEY. Never logged, never captured — see billing/stripe.ts's own rk_ assertion. */
  readonly secretKey: string;
  /** STRIPE_ACCOUNT_ID, for an organization-level key; undefined for an account-level key. */
  readonly stripeAccountId?: string;
  readonly country: string | null;
}

const CHECKOUT_PATH = "/console/checkout";
const BILLING_PORTAL_PATH = "/console/billing";

export function isConsoleCheckoutPath(pathname: string): boolean {
  return pathname === CHECKOUT_PATH || pathname === BILLING_PORTAL_PATH;
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: code }), { status, headers: { "Content-Type": "application/json" } });
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/** Rejects a duplicate or unexpected field rather than silently taking the last one, matching console/keys.ts and console/interest.ts. */
function parseForm(rawBody: string, allowed: readonly string[]): Record<string, string> | null {
  const params = new URLSearchParams(rawBody);
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!allowed.includes(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  return values;
}

/**
 * The shared fallback for every way Checkout can fail once the gate said it was available.
 * Renders exactly what the flag-off state already renders — the interest form — with an
 * explanatory notice above it (console/pages.ts's ConsolePageInput.error, now shown regardless
 * of whether this account already submitted one).
 *
 * 502, not 500: this Worker successfully rendered a complete, correct page — the failure
 * belongs to Stripe (an unreachable API, a permission_error, a misconfigured lookup_key), not to
 * this Worker itself, so the status settles on the "an upstream failed" family rather than the
 * "this service failed" one the task's own instruction rules out.
 */
async function billingUnavailable(deps: ConsoleCheckoutDeps): Promise<Response> {
  const [existing, csrfToken] = await Promise.all([
    deps.interestDb === null ? Promise.resolve(null) : findInterestSignalByAccount(deps.interestDb, deps.session.accountId),
    issueInterestCsrfToken(deps.csrfSecret, deps.session.accountId),
  ]);
  return htmlResponse(
    renderConsolePage({
      csrfToken,
      alreadySubmitted: existing !== null,
      error: "Billing is not available yet. Tell us what you're building below and we'll follow up with a payment link.",
      nav: navFor(deps.session, "console"),
    }),
    502,
  );
}

async function handleCheckout(request: Request, deps: ConsoleCheckoutDeps): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  // Re-checked here, never trusted from whatever GET /console last rendered. 404, not 409: while
  // the flag is off this route does not exist on this deployment, the same way a path this
  // Worker never mounted at all would answer — there is no conflicting resource state to name,
  // just a route that is not there yet.
  if (!deps.checkoutAvailable) return jsonError(404, "not_found");

  const form = parseForm(await request.text(), ["csrf", "plan"]);
  if (form === null) return jsonError(400, "invalid_request");
  if (!(await verifyCheckoutCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId))) return jsonError(403, "invalid_csrf");
  const planId = form.plan ?? "";
  if (!isPlanId(planId)) return jsonError(400, "invalid_plan");
  const plan = PLANS[planId];

  // Fired once the request is genuinely a plan click, past CSRF and shape validation — not
  // before, so a forged or malformed POST never inflates this funnel step.
  captureConsoleEvent(deps.ctx, deps.flagsKv, deps.analytics, deps.country, {
    distinctId: deps.session.accountId,
    event: EVENTS.upgradeIntentClicked,
    authState: "authenticated",
    properties: { surface_location: "console_plans", checkout_available: true },
    objectionSubject: deps.session.accountId,
  });

  try {
    const email = await deps.db.getAccountOwnerEmail(deps.session.accountId);
    if (email === null) throw new Error("checkout.ts: no active owner membership on record for this account");
    const customerId = await ensureStripeCustomer(deps.db, deps.session.accountId, email, { secretKey: deps.secretKey, accountId: deps.stripeAccountId });
    const session = await createCheckoutSession(
      { customerId, lookupKey: plan.lookupKey, accountId: deps.session.accountId },
      { secretKey: deps.secretKey, accountId: deps.stripeAccountId },
    );
    return redirectTo(session.url);
  } catch {
    return await billingUnavailable(deps);
  }
}

async function handleBillingPortal(request: Request, deps: ConsoleCheckoutDeps): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!deps.checkoutAvailable) return jsonError(404, "not_found");

  const form = parseForm(await request.text(), ["csrf"]);
  if (form === null) return jsonError(400, "invalid_request");
  if (!(await verifyCheckoutCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId))) return jsonError(403, "invalid_csrf");

  try {
    const customerId = await deps.db.getAccountStripeCustomerId(deps.session.accountId);
    // No Customer yet — the "Manage billing" form is never rendered before one exists
    // (console/pages.ts's renderConsolePlansPage), so a well-behaved client never reaches this,
    // but a direct POST could. Treated the same as any other reason billing is not available.
    if (customerId === null) throw new Error("checkout.ts: no Stripe customer for this account yet");
    const session = await createBillingPortalSession(customerId, { secretKey: deps.secretKey, accountId: deps.stripeAccountId });
    return redirectTo(session.url);
  } catch {
    return await billingUnavailable(deps);
  }
}

/**
 * Routes both self-serve Checkout endpoints. `deps.session` is resolved by the caller (M3's
 * session cookie, in production); every tenant read and write below is already scoped by
 * `deps.session.accountId` through the `db` functions it calls.
 */
export async function handleConsoleCheckoutRequest(request: Request, deps: ConsoleCheckoutDeps): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === CHECKOUT_PATH) return handleCheckout(request, deps);
  return handleBillingPortal(request, deps);
}
