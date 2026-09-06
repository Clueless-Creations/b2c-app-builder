/**
 * Activation signal for the hosted MCP service.
 *
 * This is the only analytics code in the MCP Worker, and it is deliberately small. The Worker is
 * an OAuth authorization server that every MCP client depends on, so it takes no new npm
 * dependency here — capture is a single JSON POST, shared with the app Worker through
 * ../app/analytics/capture.js.
 *
 * Three properties hold:
 *   - Off by default. With POSTHOG_PROJECT_TOKEN unset, every function here is a no-op, so
 *     deploying this file changes nothing until the variable is set.
 *   - Fail-open. Nothing it does can reject, delay, or alter a served response.
 *   - Route-neutral. It is called from the success path of an already-authorized MCP request and
 *     touches no routing, no auth decision, and no response body.
 */

import { analyticsSuppressedByCountry } from "../shared/geo.js";
import { captureInBackground, firstSeenToday, isAnalyticsSuppressed, type CaptureConfig } from "../builder-console/analytics/capture.js";
import { EVENTS } from "../builder-console/analytics/events.js";

/**
 * Both variables are optional and stay out of wrangler.jsonc.
 *
 * POSTHOG_PROJECT_TOKEN is set with `wrangler secret put` rather than committed: it is a public
 * write-only token, but the repository contract keeps provider values out of Git, and an unset
 * variable is exactly the off switch this integration needs. Declaration merging keeps the
 * generated worker-configuration.d.ts authoritative and unmodified.
 */
declare global {
  interface Env {
    readonly POSTHOG_PROJECT_TOKEN?: string;
    readonly POSTHOG_HOST?: string;
  }
}

/** Client identification from the User-Agent, bounded and stripped of anything path-like. */
function clientName(request: Request): string {
  const raw = request.headers.get("user-agent") ?? "";
  const name = raw.split("/")[0]?.trim() ?? "";
  return /^[A-Za-z0-9 ._-]{1,60}$/.test(name) ? name : "unknown";
}

/**
 * Record that a subject successfully used the MCP service today.
 *
 * Deduped to one event per subject per UTC day, so cost tracks users rather than API traffic.
 * The activation funnel is unaffected — a funnel step matches the first occurrence.
 *
 * The dedupe key lives in OAUTH_KV under an `analytics:` prefix rather than in a new namespace;
 * the OAuth provider owns its own prefixes and does not collide.
 */
export function recordMcpActivation(env: Env, ctx: ExecutionContext, request: Request, subject: string, engineVersion: string): void {
  if (!env.POSTHOG_PROJECT_TOKEN) return;
  // The published policy promises, without qualification, that no event is sent for a request
  // identified as originating in the EEA or the UK — and it names the knowledge service, not
  // only the console. Checked before ctx.waitUntil so a suppressed request schedules no work
  // and, critically, never reaches the KV dedupe write either: the promise is that no event is
  // sent, and a dedupe key recording that a subject was active on a date is a record too.
  if (analyticsSuppressedByCountry(request.headers.get("cf-ipcountry"))) return;
  const config: CaptureConfig = {
    token: env.POSTHOG_PROJECT_TOKEN,
    host: env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    surface: "mcp",
    engineVersion,
  };
  const client = clientName(request);
  try {
    ctx.waitUntil(
      (async () => {
        // Objection first, and before the dedupe write — an opted-out subject must leave no trace
        // at all, not merely no PostHog event. Both reads happen after the response is already
        // sent, so neither costs the caller anything.
        if (await isAnalyticsSuppressed(env.OAUTH_KV, subject)) return;
        if (!(await firstSeenToday(env.OAUTH_KV, "mcp", subject))) return;
        captureInBackground(ctx, config, {
          // Not yet the console account_id — see the stitching gap in EVENT_TAXONOMY.md.
          distinctId: subject,
          event: EVENTS.mcpCallSucceeded,
          authState: "authenticated",
          properties: { subject, mcp_client: client },
        });
      })().catch(() => undefined),
    );
  } catch {
    // An exhausted ExecutionContext must never surface to the client.
  }
}
