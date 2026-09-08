/**
 * BUNDLED INTO THE MCP WORKER. hosted/knowledge-mcp/worker.ts imports this file, so it ships inside an
 * OAuth authorization server that every MCP client depends on. It lives under hosted/builder-console for
 * historical reasons, not because the console owns it.
 *
 * Consequences, both enforced by hosted/builder-console/test/bundle-safety.test.ts rather than left to memory:
 *   - It may import nothing except its sibling. One `import` line here changes the authorization
 *     server's dependency surface — importing flags.ts would ship posthog-node into it silently.
 *   - Editing it is not a console-only change. Run `npm run hosted:check` before merging, and the
 *     Worker needs redeploying for the change to take effect in production.
 */
/**
 * Dependency-free PostHog capture for Cloudflare Workers.
 *
 * Deliberately not posthog-node. The MCP Worker is a hardened OAuth authorization server with
 * three runtime dependencies; adding an analytics SDK to it widens the supply chain of the one
 * service every MCP client depends on. The capture API is a single JSON POST, so the SDK buys
 * nothing here. The app Worker does take posthog-node, because flag evaluation is not trivial.
 *
 * Every function in this file is fail-open. Analytics must never turn a served request into an
 * error, so failures are swallowed and reported through the returned CaptureOutcome instead.
 */

import { detectSecret, scrubProperties, type AuthState, type EventName, type Properties, type Surface } from "./events.js";

/** POST target. `/i/v0/e` is the current single-event endpoint; `/batch` shares the handler. */
const CAPTURE_PATH = "/i/v0/e";

/** A Worker that waits on analytics is a Worker whose p99 is PostHog's p99. */
const CAPTURE_TIMEOUT_MS = 2_000;

export interface CaptureConfig {
  /** Public project token (`phc_…`). Safe in the client bundle; still never in event properties. */
  readonly token: string;
  /** `https://us.i.posthog.com`, or the first-party relay origin. */
  readonly host: string;
  readonly surface: Surface;
  readonly engineVersion: string;
}

export interface CaptureInput {
  readonly distinctId: string;
  readonly event: EventName;
  readonly properties?: Properties;
  /** Person properties, overwritten on every capture. */
  readonly set?: Properties;
  /** Person properties written only if absent — first-touch acquisition truth. */
  readonly setOnce?: Properties;
  readonly authState: AuthState;
}

export type CaptureOutcome = { ok: true; dropped: string[] } | { ok: false; reason: "config" | "network" | "status" | "redacted"; dropped: string[] };

function validConfig(config: CaptureConfig): boolean {
  if (!/^phc_[A-Za-z0-9_-]{20,64}$/.test(config.token)) return false;
  try {
    const url = new URL(config.host);
    return url.protocol === "https:" && !url.search && !url.username;
  } catch {
    return false;
  }
}

/**
 * Send one event.
 *
 * Note on verification: the capture endpoint answers 200 for any shape-valid token, including one
 * that belongs to no project (PostHog/posthog#54670). `ok: true` therefore means "accepted at the
 * edge", not "ingested". Only a read-back — tooling/probe-posthog.ts — proves ingestion.
 */
export async function capture(config: CaptureConfig, input: CaptureInput): Promise<CaptureOutcome> {
  if (!validConfig(config)) return { ok: false, reason: "config", dropped: [] };
  // A distinct_id is never derived from a credential, but it is user-adjacent enough to check.
  if (detectSecret(input.distinctId) !== null) return { ok: false, reason: "redacted", dropped: ["distinct_id"] };

  const scrubbed = scrubProperties({ ...input.properties }, "drop");
  const set = scrubProperties({ ...input.set }, "drop");
  const setOnce = scrubProperties({ ...input.setOnce }, "drop");
  const dropped = [...scrubbed.dropped, ...set.dropped, ...setOnce.dropped];

  const properties: Record<string, unknown> = {
    ...scrubbed.properties,
    surface: config.surface,
    engine_version: config.engineVersion,
    auth_state: input.authState,
  };
  if (Object.keys(set.properties).length > 0) properties.$set = set.properties;
  if (Object.keys(setOnce.properties).length > 0) properties.$set_once = setOnce.properties;

  const body = JSON.stringify({
    api_key: config.token,
    // 200-char server limit; longer ids are silently truncated and split the person.
    distinct_id: input.distinctId.slice(0, 200),
    event: input.event,
    properties,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetch(new URL(CAPTURE_PATH, config.host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });
    // Drain so the connection is reusable; the body is `{"status":"Ok"}` and carries no signal.
    await response.body?.cancel();
    return response.ok ? { ok: true, dropped } : { ok: false, reason: "status", dropped };
  } catch {
    return { ok: false, reason: "network", dropped };
  }
}

/**
 * Fire-and-forget capture. Never awaited by a request handler.
 *
 * `waitUntil` keeps the isolate alive past the response, which is the only way an edge capture
 * survives — a bare floating promise is killed when the response is returned.
 */
export function captureInBackground(ctx: { waitUntil(promise: Promise<unknown>): void }, config: CaptureConfig, input: CaptureInput): void {
  try {
    ctx.waitUntil(capture(config, input).then(() => undefined));
  } catch {
    // An exhausted or absent ExecutionContext must not fail the request.
  }
}

// ---------------------------------------------------------------------------
// Daily dedupe
// ---------------------------------------------------------------------------

export interface DedupeStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Two days, so a key written at 23:59 UTC still covers the following day's comparison. */
const DEDUPE_TTL_SECONDS = 172_800;

/**
 * Per-subject analytics suppression — the mechanism behind a right to object.
 *
 * A disclosed legitimate-interests basis is only defensible if objecting actually does something.
 * Without this, a person exercising that right would have to be told we cannot honour it, which
 * makes the disclosure false rather than merely incomplete.
 *
 * Fail-CLOSED, unlike the dedupe below. If KV is unreachable we cannot prove the subject has not
 * objected, so we do not capture. A suppression that lapses during an outage is a broken promise;
 * a gap in analytics is a gap in analytics.
 *
 * Opting a console account out is an operator action against FLAGS_KV:
 *   wrangler kv key put --binding FLAGS_KV "analytics:optout:<account_id>" 1 --config hosted/builder-console/wrangler.jsonc
 * Reversing it is `wrangler kv key delete` with the same key. No expiry: an objection stands
 * until it is withdrawn.
 */
export async function isAnalyticsSuppressed(store: DedupeStore, subject: string): Promise<boolean> {
  try {
    return (await store.get(`analytics:optout:${subject}`)) !== null;
  } catch {
    return true;
  }
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * True the first time a subject is seen on a given UTC day.
 *
 * `mcp_call_succeeded` is deduped this way so analytics cost scales with users rather than with
 * API traffic. The activation funnel is unaffected: a funnel step matches the first occurrence
 * regardless of how many later ones exist.
 *
 * Fails open — a KV outage produces duplicate events, never a dropped request. Two concurrent
 * first-calls can both win the race and emit twice; that is accepted, because the alternative is
 * a read-modify-write lock on a hot path to protect a metric that is already a daily rollup.
 */
export async function firstSeenToday(store: DedupeStore, namespace: string, subject: string, now = new Date()): Promise<boolean> {
  const key = `analytics:${namespace}:${utcDay(now)}:${subject}`;
  try {
    if ((await store.get(key)) !== null) return false;
    await store.put(key, "1", { expirationTtl: DEDUPE_TTL_SECONDS });
    return true;
  } catch {
    return true;
  }
}
