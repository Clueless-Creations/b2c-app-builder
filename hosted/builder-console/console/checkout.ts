/**
 * Console self-serve Checkout: POST /console/checkout and POST /console/billing.
 *
 * GET /console (the plan forms, the plan state, and the interest-form fallback) is rendered by
 * worker.ts alongside the rest of the console shell, the same way GET /console/keys is owned by
 * console/keys.ts and the interest form's own shape is owned by console/interest.ts — this file
 * owns only the two write sides. Session resolution (Google OIDC, the session cookie) is M3's
 * concern, not this file's: `handleConsoleCheckoutRequest` takes an already-resolved session,
 * exactly the pattern every other console module uses.
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
 *
 * POST /console/checkout also requires the consent field the plan form carries
 * (`console/pages.ts`'s consent box). The public Terms promise that a person is asked, before
 * access starts, to agree to it starting at once and to acknowledge what that means for a
 * consumer's statutory withdrawal right; the browser enforces the box with `required`, and this
 * handler enforces it again so a POST that skipped the page cannot reach Stripe without it.
 */

import type { AccountId, TenantDb } from "../../knowledge-mcp/db/tenant.js";
import type { CaptureConfig, DedupeStore } from "../analytics/capture.js";
import { captureConsoleEvent } from "../analytics/console-capture.js";
import { EVENTS } from "../analytics/events.js";
import { createBillingPortalSession, createCheckoutSession, ensureStripeCustomer, type PortalFlow } from "../billing/checkout.js";
import { StripeApiError } from "../billing/stripe.js";
import { pickCurrentSubscription } from "../billing/entitlement-policy.js";
import { isPlanId, PLANS } from "../billing/plans.js";
import { findInterestSignalByAccount, type D1ReadLike } from "../interest/repository.js";
import { consoleHtmlResponse as htmlResponse, SITE_ORIGIN } from "./chrome.js";
import { issueInterestCsrfToken, navFor, type ConsoleNavSource, renderConsolePage, verifyCheckoutCsrfToken } from "./pages.js";

/** The resolved session, plus what the shared header shows (console/pages.ts's ConsoleNavSource; optional so a bare test session still type-checks). */
export interface ConsoleCheckoutSession extends ConsoleNavSource {
  readonly accountId: AccountId;
  readonly userId: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Only the tenant repository functions this module actually calls. */
type CheckoutDb = Pick<TenantDb, "getAccountStripeCustomerId" | "setAccountStripeCustomerId" | "getAccountOwnerEmail" | "listSubscriptionsForAccount">;

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
  /** Injectable clock, so a test can pin the consent timestamp recorded on the subscription. */
  readonly now?: () => Date;
}

const CHECKOUT_PATH = "/console/checkout";
const BILLING_PORTAL_PATH = "/console/billing";

/** The `flow` values POST /console/billing accepts; anything else is a 400. An absent or empty `flow` opens the portal's home page. */
export const PORTAL_FLOWS = ["payment_method_update", "subscription_cancel"] as const;
export type PortalFlowName = (typeof PORTAL_FLOWS)[number];

/** The Terms the consent box names; recorded on the Checkout Session and subscription in Stripe. */
export const TERMS_URL = `${SITE_ORIGIN}/terms/`;

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

  const form = parseForm(await request.text(), ["csrf", "plan", "consent"]);
  if (form === null) return jsonError(400, "invalid_request");
  if (!(await verifyCheckoutCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId))) return jsonError(403, "invalid_csrf");
  const planId = form.plan ?? "";
  if (!isPlanId(planId)) return jsonError(400, "invalid_plan");
  // The consent box's value. Checked after the plan so the two 400s stay distinguishable, and
  // before anything reaches Stripe.
  if (form.consent !== "on") return jsonError(400, "consent_required");
  const plan = PLANS[planId];
  const termsAcceptedAt = (deps.now ?? (() => new Date()))().toISOString();

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
      { customerId, lookupKey: plan.lookupKey, accountId: deps.session.accountId, termsAcceptedAt, termsUrl: TERMS_URL },
      { secretKey: deps.secretKey, accountId: deps.stripeAccountId },
    );
    return redirectTo(session.url);
  } catch {
    return await billingUnavailable(deps);
  }
}

/** Mirror statuses with nothing left to cancel. `cancelAtPeriodEnd` covers the rest: a cancellation already scheduled cannot be scheduled again. */
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Resolves the optional `flow` field to a portal deep link. The cancel link names the plan in
 * force (`pickCurrentSubscription` over the mirror, the same choice the plan page makes), and
 * only when that plan is still cancellable: a cancel click for an account whose plan has ended,
 * or is already set to end, opens the portal home page instead — there is nothing to schedule,
 * and Stripe refuses a cancel flow for such a subscription at session creation.
 */
async function resolvePortalFlow(deps: ConsoleCheckoutDeps, flow: PortalFlowName | undefined): Promise<PortalFlow | undefined> {
  if (flow === undefined) return undefined;
  if (flow === "payment_method_update") return { type: "payment_method_update" };
  const now = (deps.now ?? (() => new Date()))();
  const current = pickCurrentSubscription(await deps.db.listSubscriptionsForAccount(deps.session.accountId), now);
  if (current === null || ENDED_STATUSES.has(current.status) || current.cancelAtPeriodEnd) return undefined;
  return { type: "subscription_cancel", subscriptionId: current.id };
}

async function handleBillingPortal(request: Request, deps: ConsoleCheckoutDeps): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!deps.checkoutAvailable) return jsonError(404, "not_found");

  const form = parseForm(await request.text(), ["csrf", "flow"]);
  if (form === null) return jsonError(400, "invalid_request");
  if (!(await verifyCheckoutCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId))) return jsonError(403, "invalid_csrf");
  const requestedFlow = form.flow ?? "";
  if (requestedFlow !== "" && !(PORTAL_FLOWS as readonly string[]).includes(requestedFlow)) return jsonError(400, "invalid_flow");

  try {
    const customerId = await deps.db.getAccountStripeCustomerId(deps.session.accountId);
    // No Customer yet — the "Manage billing" form is never rendered before one exists
    // (console/pages.ts's renderConsolePlansPage), so a well-behaved client never reaches this,
    // but a direct POST could. Treated the same as any other reason billing is not available.
    if (customerId === null) throw new Error("checkout.ts: no Stripe customer for this account yet");
    const stripe = { secretKey: deps.secretKey, accountId: deps.stripeAccountId };
    const flow = await resolvePortalFlow(deps, requestedFlow === "" ? undefined : (requestedFlow as PortalFlowName));
    if (flow !== undefined) {
      // A deep link can be refused for reasons the mirror cannot see — the feature switched off
      // in the Dashboard's portal configuration, or a subscription whose state changed in another
      // tab a moment ago. Stripe says so with a 400; the portal's home page still has the same
      // task one click further in, so that is the fallback, not the "billing is unavailable"
      // page. Anything else — a network fault, a rate limit, a key without the portal scope —
      // would fail the plain session the same way, so it is not retried.
      try {
        return redirectTo((await createBillingPortalSession(customerId, stripe, flow)).url);
      } catch (error) {
        if (!(error instanceof StripeApiError) || error.status !== 400) throw error;
        console.error(`console: portal deep link ${flow.type} refused by Stripe; opening the portal home page instead`);
      }
    }
    return redirectTo((await createBillingPortalSession(customerId, stripe)).url);
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
