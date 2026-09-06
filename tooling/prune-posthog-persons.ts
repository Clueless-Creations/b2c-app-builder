#!/usr/bin/env node
/**
 * prune-posthog-persons.ts — enforce the twelve-month analytics retention policy.
 *
 * PURPOSE
 * -------
 * PostHog's published retention guarantee is one year of event data on the Free plan, seven years
 * on any paid plan (https://posthog.com/pricing/philosophy) — a floor, not a ceiling. This system's
 * policy, recorded in hosted/builder-console/analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md, is twelve months from
 * a person's last event. Since PostHog will happily keep data for longer than that on its own,
 * this script enforces the shorter window from this side: it finds every person whose most recent
 * event is older than the retention window and deletes that person, together with their events.
 *
 * SECURITY RULES (do not relax)
 * ------------------------------
 * - POSTHOG_PERSONAL_API_KEY is read ONLY from process.env. Never hardcoded, logged, or written
 *   to any artifact, and never passed through a shell that could echo it.
 * - Dry-run by default. Nothing is deleted unless --apply is passed.
 * - The plan prints only pseudonymous subject ids (PostHog person UUIDs and distinct_ids) and
 *   counts — nothing else about a person is printed or written anywhere.
 * - POSTHOG_RETENTION_DAYS below MIN_RETENTION_DAYS (30) is refused outright — see
 *   tooling/lib/posthog-retention.ts — so a typo cannot turn this into "delete everyone from last
 *   week".
 * - Any API error exits non-zero. A failed call is never reported as "0 deleted".
 *
 * ENV VARS
 * --------
 *   POSTHOG_PERSONAL_API_KEY   (required) Personal API key from PostHog Project Settings.
 *                              Needs the person:write scope to delete with --apply.
 *   POSTHOG_PROJECT_ID         (required) Numeric project ID (shown in the PostHog URL).
 *   POSTHOG_HOST               (optional) Defaults to https://us.posthog.com — the same US Cloud
 *                              host tooling/provision-posthog-platform.ts defaults to for project
 *                              Override for a self-hosted instance.
 *   POSTHOG_RETENTION_DAYS     (optional) Retention window in days. Defaults to 365. Must be a
 *                              base-10 integer >= 30 or the script refuses to run.
 *
 * USAGE
 * -----
 *   doppler run -- npx tsx tooling/prune-posthog-persons.ts               dry run (default)
 *   doppler run -- npx tsx tooling/prune-posthog-persons.ts --apply       actually delete
 *   doppler run -- npx tsx tooling/prune-posthog-persons.ts --limit 100   cap this run at 100
 *
 * SELECTION — PostHog Query API (HogQL)
 * --------------------------------------
 * Docs: https://posthog.com/docs/api/query
 *   POST /api/projects/:project_id/query
 *   { "query": { "kind": "HogQLQuery", "query": "SELECT person_id, max(timestamp) AS last_seen,
 *       groupArray(distinct_id) AS distinct_ids FROM events GROUP BY person_id
 *       HAVING last_seen < toDateTime('<cutoff>') ORDER BY last_seen ASC" } }
 * `events.person_id` is the person's UUID (docs: https://posthog.com/docs/how-posthog-works/data-model),
 * the same id the persons `bulk_delete` endpoint below expects in `ids`. The HogQL filter and the
 * local re-check in tooling/lib/posthog-retention.ts must agree on "older than" meaning strictly
 * before the cutoff (`<`, not `<=`) — a person whose last event lands exactly on the cutoff is
 * kept for one more run rather than deleted early.
 *
 * DELETION — PostHog Persons API, bulk_delete
 * --------------------------------------------
 * Docs: https://posthog.com/docs/api/persons
 *   POST /api/projects/:project_id/persons/bulk_delete/
 *   Body: { "ids": [...up to 1000 person UUIDs...], "delete_events": true }
 * This is PostHog's own recommended endpoint for deleting more than one person — its docs note
 * that the single-person `DELETE /api/projects/:project_id/persons/:id/` endpoint is a thin
 * wrapper around the same bulk operation for exactly one id. `delete_events: true` queues an
 * asynchronous deletion of that person's events (PostHog runs it during a maintenance window, not
 * immediately); the API call itself returns 202 once the deletion is queued. --limit (default 500)
 * keeps any one run's batch under the API's 1000-id ceiling with headroom to spare.
 */

import { flagBoolean, flagNumber, parseFlags } from "./lib/launch-state.js";
import { computeCutoff, DEFAULT_DELETE_LIMIT, parseRetentionDays, selectPastCutoff, type PersonLastSeen } from "./lib/posthog-retention.js";

const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY?.trim() ?? "";
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID?.trim() ?? "";
const POSTHOG_HOST = (process.env.POSTHOG_HOST?.trim() || "https://us.posthog.com").replace(/\/$/, "");

// parseFlags (tooling/lib/launch-state.ts) silently ignores any token it does not recognize —
// fine for validator scripts with optional positional args, but wrong here: a typo like --aply
// must not be treated as a normal dry run, and a typo like --limi 10 must not silently fall back
// to the default 500 and delete a materially larger batch than intended. So every `--`-prefixed
// token is checked against this script's own known flags before parseFlags ever sees argv.
const KNOWN_FLAGS = new Set(["--apply", "--limit"]);
const rawArgs = process.argv.slice(2);
for (let index = 0; index < rawArgs.length; index += 1) {
  const token = rawArgs[index];
  if (token === "--limit") {
    index += 1; // skip --limit's value token; it is not itself a flag to validate
    continue;
  }
  if (KNOWN_FLAGS.has(token ?? "")) {
    continue;
  }
  if (token !== undefined && token.startsWith("--")) {
    console.error(`prune:posthog — unrecognized flag "${token}". Known flags: --apply, --limit.`);
    console.error("prune:posthog — refusing to run: an unrecognized flag must not be silently treated as a normal dry run.");
    process.exit(1);
  }
}

const flags = parseFlags(rawArgs, [
  { flags: ["--apply"], key: "apply", kind: "boolean" },
  { flags: ["--limit"], key: "limit", kind: "number" },
]);
const apply = flagBoolean(flags, "apply");
const limitFlag = flagNumber(flags, "limit");
if (limitFlag !== undefined && (!Number.isInteger(limitFlag) || limitFlag <= 0)) {
  console.error(`prune:posthog — --limit must be a positive integer, got "${process.argv[process.argv.indexOf("--limit") + 1]}".`);
  process.exit(1);
}
const limit = limitFlag ?? DEFAULT_DELETE_LIMIT;

// ---------------------------------------------------------------------------
// Cred guard — must happen before any network call. Matches the exit-0
// "founder must run this" convention in probe-posthog.ts and
// provision-posthog-platform.ts: this script is meant to be invoked manually
// or from a schedule that a missing secret should not turn red.
// ---------------------------------------------------------------------------

if (!POSTHOG_PERSONAL_API_KEY || !POSTHOG_PROJECT_ID) {
  console.error("");
  console.error("prune:posthog — MISSING CREDENTIALS");
  console.error("────────────────────────────────────────────────────────────");
  if (!POSTHOG_PERSONAL_API_KEY) console.error("  POSTHOG_PERSONAL_API_KEY is not set.");
  if (!POSTHOG_PROJECT_ID) console.error("  POSTHOG_PROJECT_ID is not set.");
  console.error("");
  console.error("  Founder must run this via Doppler so the key is injected from the");
  console.error("  vault and never touches the filesystem:");
  console.error("");
  console.error("    doppler run -- npx tsx tooling/prune-posthog-persons.ts");
  console.error("");
  console.error("  The key needs the person:write scope to delete with --apply.");
  console.error("────────────────────────────────────────────────────────────");
  console.error("");
  process.exit(0); // clean exit, matching probe-posthog.ts / provision-posthog-platform.ts
}

interface QueryRow {
  personId: string;
  lastSeen: string;
  distinctIds: string[];
}

/**
 * Runs the HogQL aggregate query. Docs: https://posthog.com/docs/api/query
 * The cutoff is embedded as a literal rather than a bind parameter: HogQL's query endpoint takes
 * one `query` string with no separate parameter channel for this shape of query, so the ISO
 * instant (never user input — it is computed from `now` and a validated integer) is escaped and
 * inlined the same way probe-posthog.ts inlines its event-name literal.
 */
async function queryPersonsPastCutoff(cutoffIso: string): Promise<QueryRow[]> {
  const hogql = `SELECT person_id, max(timestamp) AS last_seen, groupArray(distinct_id) AS distinct_ids FROM events GROUP BY person_id HAVING last_seen < toDateTime('${cutoffIso.replace(/'/g, "\\'")}') ORDER BY last_seen ASC`;

  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: hogql } }),
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`network error reaching ${POSTHOG_HOST} for the persons query: ${message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PostHog query API returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("PostHog query API response was not valid JSON.");
  }

  if (typeof json !== "object" || json === null || !("results" in json) || !Array.isArray((json as Record<string, unknown>).results)) {
    throw new Error("PostHog query API returned an unexpected response shape (no results array).");
  }

  const results = (json as Record<string, unknown>).results as unknown[][];
  return results.map((row, index) => {
    const [personId, lastSeen, distinctIds] = row;
    if (typeof personId !== "string" || typeof lastSeen !== "string") {
      throw new Error(`PostHog query API row ${index} did not have the expected [person_id, last_seen, distinct_ids] shape: ${JSON.stringify(row)}`);
    }
    return { personId, lastSeen, distinctIds: Array.isArray(distinctIds) ? distinctIds.map(String) : [] };
  });
}

/**
 * Deletes a batch of persons and their events via the persons bulk_delete endpoint.
 * Docs: https://posthog.com/docs/api/persons
 *   POST /api/projects/:project_id/persons/bulk_delete/
 *   Body: { ids: string[] (max 1000), delete_events: true }
 */
async function deletePersons(personIds: string[]): Promise<void> {
  const url = `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons/bulk_delete/`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: personIds, delete_events: true }),
    });
  } catch (networkError) {
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`network error reaching ${POSTHOG_HOST} for persons bulk_delete: ${message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PostHog persons bulk_delete returned HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  console.log(`prune:posthog — querying ${POSTHOG_HOST} project ${POSTHOG_PROJECT_ID} for persons past the retention window (limit ${limit})`);

  let retentionDays: number;
  try {
    retentionDays = parseRetentionDays(process.env.POSTHOG_RETENTION_DAYS);
  } catch (error) {
    console.error(`prune:posthog — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
    return;
  }
  const cutoff = computeCutoff(new Date(), retentionDays);

  let rows: QueryRow[];
  try {
    rows = await queryPersonsPastCutoff(cutoff.toISOString());
  } catch (error) {
    console.error(`prune:posthog — FAILED to query persons: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
    return;
  }

  const asPersonRows: PersonLastSeen[] = rows.map((row) => ({ personId: row.personId, distinctIds: row.distinctIds, lastSeen: row.lastSeen }));
  // Re-decides "past the cutoff" locally rather than trusting the HogQL HAVING clause alone —
  // see tooling/lib/posthog-retention.ts's selectPastCutoff doc comment on why, and applies --limit.
  let plan: ReturnType<typeof selectPastCutoff>;
  try {
    plan = selectPastCutoff(asPersonRows, cutoff, limit);
  } catch (error) {
    console.error(`prune:posthog — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
    return;
  }

  console.log("");
  console.log(`prune:posthog — retention window: ${retentionDays} day(s)`);
  console.log(`prune:posthog — cutoff instant:   ${cutoff.toISOString()}`);
  console.log(`prune:posthog — persons past cutoff: ${plan.totalPastCutoff}`);
  console.log(`prune:posthog — persons selected this run: ${plan.selected.length}${plan.limited ? ` (capped at --limit ${plan.limit})` : ""}`);
  console.log("");

  if (plan.selected.length === 0) {
    console.log("prune:posthog — nothing to delete.");
    return;
  }

  for (const person of plan.selected) {
    const distinctIdsDisplay = person.distinctIds.length > 0 ? person.distinctIds.join(", ") : "(none recorded)";
    console.log(`  person_id=${person.personId} last_seen=${person.lastSeen} distinct_ids=[${distinctIdsDisplay}]`);
  }
  console.log("");

  if (plan.limited) {
    console.log(
      `prune:posthog — --limit ${plan.limit} was hit: ${plan.totalPastCutoff - plan.selected.length} additional person(s) past the cutoff were left for the next run.`,
    );
  }

  if (!apply) {
    console.log("prune:posthog — DRY RUN. Nothing deleted. Re-run with --apply to delete the persons listed above.");
    return;
  }

  try {
    await deletePersons(plan.selected.map((person) => person.personId));
  } catch (error) {
    console.error(`prune:posthog — FAILED to delete persons: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
    return;
  }

  console.log(`prune:posthog — queued deletion of ${plan.selected.length} person(s) and their events (events are removed asynchronously by PostHog).`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prune:posthog — unhandled error: ${message}`);
  process.exit(1);
});
