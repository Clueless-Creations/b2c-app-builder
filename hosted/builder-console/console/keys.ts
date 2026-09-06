/**
 * Console API-key management: GET/POST /console/keys, POST /console/keys/:id/revoke, and an
 * optional read-only GET /console/audit.
 *
 * Session resolution (Google OIDC, the session cookie) is M3's concern, not this file's. Every
 * exported function below takes an already-resolved ConsoleSession rather than a Request or an
 * Env, exactly the way ../interest/handler.ts takes an already-resolved InterestSession — this
 * module has no opinion on cookies, and can be unit- and integration-tested without a live
 * Worker or a fetch handler in front of it. `isConsoleKeysPath` / `handleConsoleKeysRequest`
 * exist for whatever router hosted/builder-console/worker.ts ends up with; the pure `createConsoleApiKey` /
 * `revokeConsoleApiKey` functions are the part that actually needs a two-tenant proof.
 *
 * Reused from ../../knowledge-mcp/auth.ts on purpose: `sha256` hashes the raw key before it ever
 * reaches D1 (createApiKey in ../../knowledge-mcp/db/tenant.ts stores only the digest and a display
 * prefix), and pages.ts's CSRF pair is built on that file's issueConsentToken /
 * verifyConsentToken — the same HMAC consent-token pattern the OAuth consent screen uses.
 *
 * Privacy gate — read hosted/knowledge-mcp/migrations/README.md before changing this file. Its "Three
 * columns that record a person acting at a time" section is explicit that api_keys.last_used_at,
 * sessions.last_seen_at, and audit_events for key create/revoke are all gated on a published-
 * privacy-page update that has not happened: "None of these is written today... The page changes
 * first." So neither createConsoleApiKey nor revokeConsoleApiKey calls tenantDb's
 * recordAuditEvent, and nothing here ever sets last_used_at. GET /console/audit only reads
 * whatever already exists, which in production today is nothing.
 *
 * Key-id shape is deliberate, not incidental: analytics/snippet.ts's URL_SCRUBBER redacts a path
 * segment only when it looks like a UUID, a b2c_ key, a phc_/phx_/phs_ token, or another 32+
 * character opaque string, so a future /console/keys/<key_id> route cannot quietly leak an
 * identifier into `$current_url`. crypto.randomUUID() below keeps every key id inside that shape;
 * test/snippet.test.ts already pins a UUID-shaped example against that exact route.
 */

import { Buffer } from "node:buffer";
import { z } from "zod";
import { AccessError, sha256 } from "../../knowledge-mcp/auth.js";
import type { AccountId, ApiKeySummary, TenantDb } from "../../knowledge-mcp/db/tenant.js";
import type { CaptureConfig, DedupeStore } from "../analytics/capture.js";
import { captureConsoleEvent } from "../analytics/console-capture.js";
import { assertSafeKeyId, EVENTS } from "../analytics/events.js";
import { consoleHtmlResponse as htmlResponse } from "./chrome.js";
import { issueKeysCsrfToken, navFor, renderAuditPage, renderKeyCreatedPage, renderKeysListPage, verifyKeysCsrfToken } from "./pages.js";

export class ConsoleRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** auth.ts's API_KEY_PATTERN: b2c_ + 43 base64url characters, 256 bits of entropy. */
function generateRawApiKey(): string {
  return `b2c_${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
}

/**
 * Shown on the console list and safe to display: enough to recognise the key by eye, nowhere
 * near enough to reconstruct it. createApiKey's own zod schema in tenant.ts caps a key_prefix
 * at 8 characters after "b2c_"; 6 leaves headroom without inviting a re-read of that schema.
 */
function keyPrefixOf(rawKey: string): string {
  return rawKey.slice(0, "b2c_".length + 6);
}

export interface ConsoleSession {
  readonly accountId: AccountId;
  readonly userId: string;
  /** The signed-in person, for the header. Resolved by worker.ts's requireConsoleSession; absent only when a test hands in a bare session. */
  readonly email?: string;
  readonly displayName?: string | null;
  /** From console/pages.ts's issueSignoutCsrfToken, for the header's sign-out form. */
  readonly signoutCsrfToken?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Only the tenant repository functions this module actually calls. */
type KeysDb = Pick<TenantDb, "listApiKeys" | "createApiKey" | "revokeApiKey" | "listAuditEvents">;

export interface ConsoleKeysDeps {
  readonly db: KeysDb;
  readonly session: ConsoleSession;
  readonly analytics: CaptureConfig;
  readonly ctx: ExecutionContextLike;
  /**
   * The console's own KV namespace (`FLAGS_KV` in `wrangler.jsonc`) — never the MCP Worker's
   * `OAUTH_KV`. `captureConsoleEvent` reads `analytics:optout:<account_id>` from it before
   * capturing `api_key_created` / `api_key_revoked`.
   */
  readonly flagsKv: DedupeStore;
  /** Opaque HMAC secret for the CSRF pair, 43-128 chars per auth.ts's consentKey. */
  readonly csrfSecret: string;
}

/** "You have N keys" means N that still work, not N ever created. */
function countActive(keys: readonly ApiKeySummary[]): number {
  return keys.filter((key) => key.revokedAt === null).length;
}

function daysBetween(earlier: string, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - Date.parse(earlier)) / 86_400_000));
}

const createKeyInput = z.object({ label: z.string().max(120).optional() });

export interface CreatedApiKey {
  readonly summary: ApiKeySummary;
  readonly rawKey: string;
}

/**
 * Mints a key, stores only its digest, and hands back the raw value once. The caller renders it
 * and the value is gone from memory after that — nothing in this module persists it a second
 * time, and it is never logged.
 */
export async function createConsoleApiKey(
  db: Pick<KeysDb, "createApiKey" | "listApiKeys">,
  session: ConsoleSession,
  input: unknown,
  analytics: CaptureConfig,
  ctx: ExecutionContextLike,
  flagsKv: DedupeStore,
  country: string | null | undefined,
  now = new Date(),
): Promise<CreatedApiKey> {
  const parsed = createKeyInput.safeParse(input);
  if (!parsed.success) throw new ConsoleRequestError(400, "invalid_label");
  const trimmed = parsed.data.label?.trim();
  const label = trimmed && trimmed.length > 0 ? trimmed : null;

  const rawKey = generateRawApiKey();
  const summary = await db.createApiKey(
    session.accountId,
    { id: crypto.randomUUID(), userId: session.userId, sha256Hex: await sha256(rawKey), keyPrefix: keyPrefixOf(rawKey), label },
    now,
  );

  // Active-key count after this creation. EVENT_TAXONOMY.md row 5 wants `is_first_key` and
  // `key_count_after`; a fresh key is never revoked, so re-listing is the simplest correct way
  // to get both without trusting a count this function itself is in the middle of changing.
  const keyCountAfter = countActive(await db.listApiKeys(session.accountId));
  captureConsoleEvent(ctx, flagsKv, analytics, country, {
    distinctId: session.accountId,
    event: EVENTS.apiKeyCreated,
    authState: "authenticated",
    properties: { key_id: assertSafeKeyId(summary.id), is_first_key: keyCountAfter === 1, key_count_after: keyCountAfter },
    objectionSubject: session.accountId,
  });

  return { summary, rawKey };
}

export interface RevokeResult {
  readonly revoked: boolean;
}

/**
 * Revokes a key. tenant.ts's revokeApiKey already scopes the UPDATE by account id, so a key id
 * belonging to another tenant changes nothing and this reports `revoked: false` — the same
 * shape as an id that never existed at all, which is the point: a cross-tenant probe learns
 * nothing from the response.
 */
export async function revokeConsoleApiKey(
  db: Pick<KeysDb, "revokeApiKey" | "listApiKeys">,
  session: ConsoleSession,
  keyId: string,
  analytics: CaptureConfig,
  ctx: ExecutionContextLike,
  flagsKv: DedupeStore,
  country: string | null | undefined,
  now = new Date(),
): Promise<RevokeResult> {
  const changed = await db.revokeApiKey(session.accountId, keyId, now);
  if (!changed) return { revoked: false };

  // revokeApiKey reports only a boolean; re-read for the row the event properties need.
  const keys = await db.listApiKeys(session.accountId);
  const revoked = keys.find((key) => key.id === keyId);
  const keyCountAfter = countActive(keys);
  if (revoked) {
    captureConsoleEvent(ctx, flagsKv, analytics, country, {
      distinctId: session.accountId,
      event: EVENTS.apiKeyRevoked,
      authState: "authenticated",
      properties: {
        key_id: assertSafeKeyId(revoked.id),
        key_age_days: daysBetween(revoked.createdAt, now),
        key_count_after: keyCountAfter,
        // Self-serve only: the console has no admin surface or key-rotation flow yet, so this
        // is the only reason a key is ever revoked from here.
        revoked_reason: "user_action",
      },
      objectionSubject: session.accountId,
    });
  }
  return { revoked: true };
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

const KEYS_PATH = "/console/keys";
const AUDIT_PATH = "/console/audit";
const REVOKE_PATTERN = /^\/console\/keys\/([^/]+)\/revoke$/;

export function isConsoleKeysPath(pathname: string): boolean {
  return pathname === KEYS_PATH || pathname === AUDIT_PATH || REVOKE_PATTERN.test(pathname);
}

function jsonError(status: number, code: string, headers?: HeadersInit): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function methodNotAllowed(allowed: readonly string[]): Response {
  return jsonError(405, "method_not_allowed", { Allow: allowed.join(", ") });
}

/** Rejects a duplicate or unexpected field rather than silently taking the last one. */
async function parseForm(request: Request, allowed: readonly string[]): Promise<Record<string, string>> {
  const params = new URLSearchParams(await request.text());
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!allowed.includes(key) || Object.hasOwn(values, key)) throw new ConsoleRequestError(400, "invalid_request");
    values[key] = value;
  }
  return values;
}

async function renderKeysPageResponse(deps: ConsoleKeysDeps, status: number, flash?: string): Promise<Response> {
  const keys = await deps.db.listApiKeys(deps.session.accountId);
  const csrfToken = await issueKeysCsrfToken(deps.csrfSecret, deps.session.accountId);
  return htmlResponse(renderKeysListPage({ keys, csrfToken, flash, nav: navFor(deps.session, "keys") }), status);
}

/**
 * Routes the three key-management endpoints plus the optional audit read. `deps.session` is
 * resolved by the caller (M3's session cookie, in production); this function trusts it exactly
 * as far as db.*ApiKey* functions already scope every query by `deps.session.accountId`.
 */
export async function handleConsoleKeysRequest(request: Request, deps: ConsoleKeysDeps): Promise<Response> {
  const url = new URL(request.url);
  // Read once, the same header hosted/analytics.ts reads for the MCP surface.
  const country = request.headers.get("cf-ipcountry");
  try {
    if (url.pathname === AUDIT_PATH) {
      if (request.method !== "GET") return methodNotAllowed(["GET"]);
      const events = await deps.db.listAuditEvents(deps.session.accountId);
      return htmlResponse(renderAuditPage({ events, nav: navFor(deps.session, "keys") }));
    }

    const revokeMatch = REVOKE_PATTERN.exec(url.pathname);
    if (revokeMatch) {
      if (request.method !== "POST") return methodNotAllowed(["POST"]);
      const keyId = revokeMatch[1]!;
      const form = await parseForm(request, ["csrf"]);
      if (!(await verifyKeysCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId)))
        return await renderKeysPageResponse(deps, 403, "That didn't go through — your form had expired. Try again.");
      await revokeConsoleApiKey(deps.db, deps.session, keyId, deps.analytics, deps.ctx, deps.flagsKv, country);
      // Redirect rather than render directly: a POST response left on screen re-submits on
      // reload, and there is nothing sensitive to lose here — unlike key creation, a redirect
      // carries no secret.
      return new Response(null, { status: 303, headers: { Location: `${KEYS_PATH}?revoked=1` } });
    }

    if (url.pathname === KEYS_PATH) {
      if (request.method === "GET") {
        const flash = url.searchParams.get("revoked") === "1" ? "Key revoked." : undefined;
        return await renderKeysPageResponse(deps, 200, flash);
      }
      if (request.method === "POST") {
        const form = await parseForm(request, ["csrf", "label"]);
        if (!(await verifyKeysCsrfToken(deps.csrfSecret, form.csrf ?? "", deps.session.accountId)))
          return await renderKeysPageResponse(deps, 403, "That didn't go through — your form had expired. Try again.");
        const { summary, rawKey } = await createConsoleApiKey(deps.db, deps.session, { label: form.label }, deps.analytics, deps.ctx, deps.flagsKv, country);
        // The raw key is rendered directly, never through a redirect: a redirect target ends up
        // in browser history and referrers, and this value must be shown exactly once.
        const csrfToken = await issueKeysCsrfToken(deps.csrfSecret, deps.session.accountId);
        return htmlResponse(renderKeyCreatedPage({ rawKey, summary, csrfToken, nav: navFor(deps.session, "keys") }), 201);
      }
      return methodNotAllowed(["GET", "POST"]);
    }

    return jsonError(404, "not_found");
  } catch (error) {
    if (error instanceof ConsoleRequestError) return jsonError(error.status, error.code);
    if (error instanceof AccessError) return jsonError(error.status, "access_denied");
    if (error instanceof z.ZodError) return jsonError(400, "invalid_request");
    throw error;
  }
}
