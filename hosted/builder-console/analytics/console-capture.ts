/**
 * The single gate every console server-side capture goes through.
 *
 * `hosted/analytics.ts` already proves the pattern on the MCP surface: check geography, then the
 * per-subject objection, before anything is captured or written. Before this file existed, the
 * console surface applied the geography check on exactly one path (`interest/handler.ts`) and
 * nothing at all on the other five server-side events — `signin_started`, `signin_failed`,
 * `signin_completed`, `account_created`, `api_key_created`, `api_key_revoked` all called
 * `captureInBackground()` directly from `worker.ts` and `console/keys.ts`. The published privacy
 * page's "no event is sent" promise and EVENT_TAXONOMY.md's objection route apply to the whole
 * surface, not to whichever path happened to remember the check — see EVENT_TAXONOMY.md's "The
 * rule both of today's near-misses shared" for why that is exactly the failure mode to design
 * out, not patch path-by-path.
 *
 * Two checks, always in this order, always before any KV read or network call:
 *
 *   1. Geography. `analyticsSuppressedByCountry()` is synchronous and runs first. A suppressed
 *      request returns immediately — no KV read, no capture, nothing scheduled on `ctx` at all.
 *   2. Objection, for events that have a subject. `isAnalyticsSuppressed()` checks
 *      `analytics:optout:<account_id>` in the console's own `FLAGS_KV` namespace (never
 *      `OAUTH_KV` — that store belongs to the MCP Worker's OAuth provider and blast-radius is the
 *      whole reason the two Workers stay separate) and fails **closed**: an unreachable store is
 *      treated as an objection, exactly like the MCP surface's identical check.
 *
 * `signin_started` and `signin_failed` fire before an account exists — the only identity
 * available is the browser's own anonymous PostHog `distinct_id` (`readBrowserDistinctId()`),
 * which is not an `account_id` an objection record could be filed against. They pass no
 * `objectionSubject` and get the geography check only; EVENT_TAXONOMY.md's "Objection, and how it
 * is honoured" section documents this as objection-by-identifier not yet applicable, not as an
 * oversight.
 */

import { captureInBackground, isAnalyticsSuppressed, type CaptureConfig, type CaptureInput, type DedupeStore } from "./capture.js";
import { analyticsSuppressedByCountry } from "../../shared/geo.js";

export interface ConsoleCaptureInput extends CaptureInput {
  /**
   * The `account_id` to check `analytics:optout:<account_id>` against.
   *
   * Omit it only for an event with no account yet (`signin_started`, `signin_failed`) — never
   * because checking felt inconvenient at the call site. Every other console event has an
   * `account_id` in hand (it is already `distinctId`), so pass it.
   */
  readonly objectionSubject?: string;
}

/**
 * Gate, and — fire-and-forget, exactly like `captureInBackground()` — send one console event.
 *
 * `flagsKv` is `undefined` only for the two pre-account events above. A subject-bearing event
 * with no store to check its objection against fails **closed**, the same direction
 * `isAnalyticsSuppressed()` itself fails on an unreachable store: we cannot prove the subject has
 * not objected, so nothing is captured.
 */
export function captureConsoleEvent(
  ctx: { waitUntil(promise: Promise<unknown>): void },
  flagsKv: DedupeStore | undefined,
  config: CaptureConfig,
  country: string | null | undefined,
  input: ConsoleCaptureInput,
): void {
  if (analyticsSuppressedByCountry(country)) return;

  const { objectionSubject, ...captureInput } = input;
  if (objectionSubject === undefined) {
    captureInBackground(ctx, config, captureInput);
    return;
  }
  if (flagsKv === undefined) return;

  try {
    ctx.waitUntil(
      (async () => {
        if (await isAnalyticsSuppressed(flagsKv, objectionSubject)) return;
        captureInBackground(ctx, config, captureInput);
      })().catch(() => undefined),
    );
  } catch {
    // An exhausted or absent ExecutionContext must not fail the request.
  }
}
