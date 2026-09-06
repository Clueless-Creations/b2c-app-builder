#!/usr/bin/env node
/**
 * probe-posthog.ts — Founder-run live evidence probe for PostHog attribution events.
 *
 * PURPOSE
 * -------
 * This tool queries the PostHog REST API to confirm that a named attribution
 * event (default: attribution_source_selected) has actually arrived in PostHog
 * with a non-zero count in a recent rolling window. It then writes a
 * non-secret proof artifact (analytics/posthog-proof.json) that the static
 * validator check-attribution-contract.ts can verify.
 *
 * SECURITY RULES (mandatory — see task brief)
 * -------------------------------------------
 * - API key is read ONLY from process.env.POSTHOG_PERSONAL_API_KEY. Never hardcoded,
 *   logged, or written into any output artifact.
 * - If credentials are absent the tool prints a clear founder-must-run message
 *   and exits cleanly (code 0) — the maintainer audit must stay GREEN.
 * - The proof artifact contains ONLY non-secret facts: event name, event count,
 *   query window, http_status, api_host, ISO timestamp, and a "probe" fingerprint
 *   so the validator can distinguish a real probe output from hand-typed JSON.
 *   Acknowledging the limitation: "probe":"posthog@1" is a raised bar, not an
 *   unforgeable proof — a founder could hand-write the JSON. Founder approval
 *   (operations/PROVIDER_PROOF.md sign-off) is the ultimate backstop.
 *
 * USAGE (run via Doppler so the API key is injected from the vault)
 * -------
 *   doppler run -- npx tsx tooling/probe-posthog.ts --root /path/to/business-repo
 *
 * ENV VARS
 * --------
 *   POSTHOG_PERSONAL_API_KEY      (required) Personal API key from PostHog Project Settings.
 *   POSTHOG_PROJECT_ID   (required) Numeric project ID (shown in PostHog URL).
 *   POSTHOG_HOST         (optional) Self-hosted host. Defaults to https://app.posthog.com
 *   POSTHOG_EVENT        (optional) Override event name. Defaults to attribution_source_selected.
 *   POSTHOG_WINDOW_DAYS  (optional) Rolling window in days. Defaults to 30.
 *
 * OUTPUT ARTIFACT — analytics/posthog-proof.json (relative to --root)
 * -------
 * {
 *   "probe": "posthog@1",
 *   "event_name": "attribution_source_selected",
 *   "event_count": 42,
 *   "window_days": 30,
 *   "window_start": "2026-05-06T00:00:00.000Z",
 *   "window_end":   "2026-06-05T00:00:00.000Z",
 *   "api_host": "https://app.posthog.com",
 *   "http_status": 200,
 *   "recorded_at": "2026-06-05T14:23:00.000Z"
 * }
 *
 * API REFERENCE (PostHog Events API)
 * -----------------------------------
 * Query endpoint used: GET /api/projects/:project_id/events?event=<name>&after=<iso>&before=<iso>&limit=1
 * Docs: https://posthog.com/docs/api/events
 *
 * For event count we use the Query API (ClickHouse-backed):
 * POST /api/projects/:project_id/query
 * Docs: https://posthog.com/docs/api/query
 *
 * Node 18+ built-in fetch is used; no new npm deps.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCliArgs } from "./lib/launch-state.js";

// ---------------------------------------------------------------------------
// Configuration from environment
// ---------------------------------------------------------------------------

const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim() ?? "";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID?.trim() ?? "";
const POSTHOG_HOST = (process.env.POSTHOG_HOST?.trim() ?? "https://app.posthog.com").replace(/\/$/, "");
const EVENT_NAME = process.env.POSTHOG_EVENT?.trim() || "attribution_source_selected";
const WINDOW_DAYS = Math.max(1, Math.min(365, parseInt(process.env.POSTHOG_WINDOW_DAYS ?? "30", 10) || 30));

// ---------------------------------------------------------------------------
// Parse --root so the artifact lands in the right business repo directory
// ---------------------------------------------------------------------------

const args = parseCliArgs(process.argv.slice(2));
const ARTIFACT_REL = "analytics/posthog-proof.json";
const artifactPath = path.join(args.root, ARTIFACT_REL);

// ---------------------------------------------------------------------------
// Cred guard — must happen before any network call
// ---------------------------------------------------------------------------

if (!POSTHOG_PERSONAL_API_KEY) {
  console.error("");
  console.error("probe:posthog — MISSING CREDENTIALS");
  console.error("────────────────────────────────────────────────────────────");
  console.error("  POSTHOG_PERSONAL_API_KEY is not set.");
  console.error("");
  console.error("  Founder must run this probe via Doppler so the key is");
  console.error("  injected from the vault and never touches the filesystem:");
  console.error("");
  console.error("    doppler run -- npx tsx tooling/probe-posthog.ts --root .");
  console.error("");
  console.error("  The probe writes analytics/posthog-proof.json which the");
  console.error("  check:attribution validator requires when the lane is done.");
  console.error("────────────────────────────────────────────────────────────");
  console.error("");
  process.exit(0); // clean exit so maintainer audit stays GREEN
}

if (!POSTHOG_PROJECT_ID) {
  console.error("");
  console.error("probe:posthog — MISSING POSTHOG_PROJECT_ID");
  console.error("  Set POSTHOG_PROJECT_ID to the numeric project ID from your");
  console.error("  PostHog Project Settings URL, e.g. POSTHOG_PROJECT_ID=12345");
  console.error("  then re-run via: doppler run -- npx tsx tooling/probe-posthog.ts --root .");
  console.error("");
  process.exit(0); // clean exit
}

// ---------------------------------------------------------------------------
// Compute window timestamps
// ---------------------------------------------------------------------------

const now = new Date();
const windowEnd = new Date(now);
windowEnd.setUTCHours(0, 0, 0, 0); // start of today UTC

const windowStart = new Date(windowEnd);
windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);

const windowStartIso = windowStart.toISOString();
const windowEndIso = windowEnd.toISOString();

// ---------------------------------------------------------------------------
// PostHog Query API call
// Docs: https://posthog.com/docs/api/query
// We use a HogQL COUNT query which is the stable way to aggregate event counts.
// Fallback: if the Query API returns an unexpected shape we fall back to the
// Events list API with limit=1 and record count as "at_least_1".
// ---------------------------------------------------------------------------

interface ProofArtifact {
  probe: string;
  event_name: string;
  event_count: number | "at_least_1" | "unknown";
  window_days: number;
  window_start: string;
  window_end: string;
  api_host: string;
  http_status: number;
  recorded_at: string;
}

async function queryEventCount(): Promise<{ count: number | "at_least_1" | "unknown"; httpStatus: number }> {
  // Primary path: HogQL aggregate query via /api/projects/:id/query
  // Docs: https://posthog.com/docs/api/query
  const queryUrl = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query`;

  const hogql = `SELECT count() AS c FROM events WHERE event = '${EVENT_NAME.replace(/'/g, "\\'")}' AND timestamp >= '${windowStartIso}' AND timestamp < '${windowEndIso}'`;

  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: hogql,
        },
      }),
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    console.error(`probe:posthog — network error reaching ${POSTHOG_HOST}: ${message}`);
    return { count: "unknown", httpStatus: 0 };
  }

  const httpStatus = response.status;

  if (!response.ok) {
    console.warn(`probe:posthog — Query API returned HTTP ${httpStatus}. Falling back to Events list API.`);
    return fallbackEventsList(httpStatus);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    console.warn("probe:posthog — Query API response was not valid JSON. Falling back to Events list API.");
    return fallbackEventsList(httpStatus);
  }

  // HogQL result shape: { results: [[countValue]], columns: ["c"] }
  if (typeof json === "object" && json !== null && "results" in json && Array.isArray((json as Record<string, unknown>).results)) {
    const results = (json as Record<string, unknown>).results as unknown[][];
    const row = results[0];
    if (Array.isArray(row) && typeof row[0] === "number") {
      return { count: row[0], httpStatus };
    }
    // Sometimes count comes back as a string from the API.
    if (Array.isArray(row) && typeof row[0] === "string") {
      const parsed = parseInt(row[0], 10);
      if (!isNaN(parsed)) {
        return { count: parsed, httpStatus };
      }
    }
  }

  console.warn("probe:posthog — Unexpected Query API response shape. Falling back to Events list API.");
  return fallbackEventsList(httpStatus);
}

/** Fallback: hit the events list endpoint and check for >=1 result. */
async function fallbackEventsList(priorStatus: number): Promise<{ count: number | "at_least_1" | "unknown"; httpStatus: number }> {
  // Docs: https://posthog.com/docs/api/events
  const params = new URLSearchParams({
    event: EVENT_NAME,
    after: windowStartIso,
    before: windowEndIso,
    limit: "1",
  });
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/events?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}` },
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    console.error(`probe:posthog — fallback network error: ${message}`);
    return { count: "unknown", httpStatus: priorStatus };
  }

  const httpStatus = response.status;

  if (!response.ok) {
    console.error(`probe:posthog — Events list API also returned HTTP ${httpStatus}. Cannot confirm event count.`);
    return { count: "unknown", httpStatus };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { count: "unknown", httpStatus };
  }

  if (
    typeof json === "object" &&
    json !== null &&
    "results" in json &&
    Array.isArray((json as Record<string, unknown>).results) &&
    ((json as Record<string, unknown>).results as unknown[]).length > 0
  ) {
    return { count: "at_least_1", httpStatus };
  }

  // Empty results array — no events in window.
  return { count: 0, httpStatus };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`probe:posthog — querying ${POSTHOG_HOST} for event="${EVENT_NAME}" window=${WINDOW_DAYS}d`);

  const { count, httpStatus } = await queryEventCount();

  const artifact: ProofArtifact = {
    probe: "posthog@1",
    event_name: EVENT_NAME,
    event_count: count,
    window_days: WINDOW_DAYS,
    window_start: windowStartIso,
    window_end: windowEndIso,
    api_host: POSTHOG_HOST,
    http_status: httpStatus,
    recorded_at: new Date().toISOString(),
  };

  // Ensure output directory exists.
  const outDir = path.dirname(artifactPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Write artifact (overwrites any previous run).
  writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");

  if (count === "unknown" || httpStatus === 0) {
    console.error(`probe:posthog — FAILED to confirm event count (http_status=${httpStatus}). Artifact written with count="unknown".`);
    console.error("  The check:attribution validator will reject a count of 'unknown' when the lane is done.");
    console.error(`  Artifact: ${ARTIFACT_REL}`);
    process.exit(1);
  }

  const countDisplay = count === "at_least_1" ? "at least 1" : count;
  console.log(`probe:posthog — SUCCESS: "${EVENT_NAME}" count=${countDisplay} in last ${WINDOW_DAYS} days.`);
  console.log(`  Artifact written to: ${ARTIFACT_REL}`);

  if (typeof count === "number" && count === 0) {
    console.warn("");
    console.warn(`probe:posthog — WARNING: event count is 0 in the last ${WINDOW_DAYS} days.`);
    console.warn("  Attribution events have not arrived yet. Keep the analytics_attribution lane");
    console.warn("  at 'partial' until real user traffic flows and this probe returns count > 0.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`probe:posthog — unhandled error: ${message}`);
  process.exit(1);
});
