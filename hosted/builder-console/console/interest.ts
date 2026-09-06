/**
 * Console interest collector: POST /console/interest.
 *
 * GET /console (the form and the "already submitted" state) is rendered by worker.ts alongside
 * the rest of the console shell, the same way GET /console/keys is owned by console/keys.ts —
 * this file owns only the write side. Session resolution (Google OIDC, the session cookie) is
 * M3's concern, not this file's: `handleConsoleInterestRequest` takes an already-resolved
 * ConsoleSession, exactly the pattern console/keys.ts and ../interest/handler.ts both use, so it
 * needs no live Worker or fetch handler in front of it to test.
 *
 * CSRF reuses the same HMAC consent-token pair console/keys.ts does (issueInterestCsrfToken /
 * verifyInterestCsrfToken in ./pages.js, under their own "console-interest:<account_id>"
 * namespace so a leaked keys-page token cannot also spend as an interest submission).
 *
 * The actual submission logic — D1 first, PostHog best-effort, geography and the schema's own
 * bounds — lives entirely in ../interest/handler.ts and is not duplicated here. This file's only
 * job is: verify CSRF, shape the trusted parts of the request (account id and user id from the
 * session, never from the form body) into what that handler expects, and turn its result into an
 * HTTP response.
 */

import type { AccountId } from "../../knowledge-mcp/db/tenant.js";
import type { CaptureConfig } from "../analytics/capture.js";
import { handleInterestSubmission } from "../interest/handler.js";
import type { D1Like } from "../interest/repository.js";
import { consoleHtmlResponse as htmlResponse } from "./chrome.js";
import { issueInterestCsrfToken, navFor, type ConsoleNavSource, renderConsolePage, verifyInterestCsrfToken } from "./pages.js";

/** The resolved session, plus what the shared header shows (console/pages.ts's ConsoleNavSource; optional so a bare test session still type-checks). */
export interface ConsoleInterestSession extends ConsoleNavSource {
  readonly accountId: AccountId;
  readonly userId: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ConsoleInterestDeps {
  readonly db: D1Like;
  readonly session: ConsoleInterestSession;
  readonly analytics: CaptureConfig;
  readonly ctx: ExecutionContextLike;
  /** Same secret as console/keys.ts's csrfSecret; a different namespace string keeps tokens apart. */
  readonly csrfSecret: string;
  /** cf-ipcountry, read the same way every other console route reads it. */
  readonly country: string | null;
}

const INTEREST_PATH = "/console/interest";

export function isConsoleInterestPath(pathname: string): boolean {
  return pathname === INTEREST_PATH;
}

/** The only fields the form ever sends. `account_id`/`user_id` are deliberately not among them. */
const ALLOWED_FIELDS = ["csrf", "email", "source_key", "source_other", "intent"] as const;

/** Rejects a duplicate or unexpected field rather than silently taking the last one, matching console/keys.ts. */
function parseForm(rawBody: string): Record<string, string> | null {
  const params = new URLSearchParams(rawBody);
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!(ALLOWED_FIELDS as readonly string[]).includes(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  return values;
}

async function renderFormResponse(deps: ConsoleInterestDeps, status: number, error: string): Promise<Response> {
  const csrfToken = await issueInterestCsrfToken(deps.csrfSecret, deps.session.accountId);
  return htmlResponse(renderConsolePage({ csrfToken, alreadySubmitted: false, error, nav: navFor(deps.session, "console") }), status);
}

/**
 * Handles POST /console/interest. `deps.session` is resolved by the caller (worker.ts's
 * requireConsoleSession); every response either redirects back to `/console` (success — a fresh
 * GET there reads the row `handleInterestSubmission` just wrote and renders the submitted state)
 * or re-renders the form with an error, never leaving a bare JSON error on a page meant to be
 * filled in by a human.
 */
export async function handleConsoleInterestRequest(request: Request, deps: ConsoleInterestDeps): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  const form = parseForm(await request.text());
  if (form === null) return await renderFormResponse(deps, 400, "That form couldn't be read. Please try again.");

  if (!(await verifyInterestCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId))) {
    return await renderFormResponse(deps, 403, "That didn't go through — your form had expired. Try again.");
  }

  const result = await handleInterestSubmission(
    {
      email: form.email,
      source_key: form.source_key,
      intent: form.intent,
      ...(form.source_other && form.source_other.length > 0 ? { source_other: form.source_other } : {}),
    },
    // account_id and user_id come from the resolved session, never from the form body above.
    { accountId: deps.session.accountId, userId: deps.session.userId, country: deps.country },
    deps.db,
    deps.analytics,
    deps.ctx,
  );

  if (result.status === 200) {
    // Redirect rather than render directly: a POST response left on screen re-submits on reload,
    // and the very next GET /console reads the row just written and shows the submitted state.
    return new Response(null, { status: 303, headers: { Location: "/console" } });
  }
  if (result.status === 400) return await renderFormResponse(deps, 400, "Please check your answers and try again.");
  return await renderFormResponse(deps, 500, "Something went wrong saving your request. Please try again.");
}
