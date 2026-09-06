/**
 * posthog-retention.ts — pure planning core for tooling/prune-posthog-persons.ts.
 *
 * Everything here is deterministic and side-effect free: given rows already fetched from
 * PostHog, a retention window, and a caller-supplied `now`, it decides who is past the cutoff and
 * applies the run's `--limit`. No network, no filesystem, no env reads, no clock reads — those
 * live in the CLI wrapper so this module can be driven directly by checks/verification/fixtures/*.
 *
 * The policy this enforces is recorded in hosted/builder-console/analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md:
 * twelve months (365 days) from a person's last event, PostHog's own one-/seven-year guarantee
 * being a floor rather than a ceiling.
 */

/** Default retention window in days — twelve months, per LEGITIMATE_INTERESTS_ASSESSMENT.md. */
export const DEFAULT_RETENTION_DAYS = 365;

/**
 * Smallest retention window this tool will honor. A typo that drops a digit (365 -> 36, or worse
 * 365 -> 3) must not turn into "delete everyone active in the last few days" — see the CLI's
 * cred-guard comment for the same principle applied to credentials.
 */
export const MIN_RETENTION_DAYS = 30;

/** Default cap on how many persons a single run will delete. */
export const DEFAULT_DELETE_LIMIT = 500;

/** One row from the HogQL query: a person and the timestamp of their most recent event. */
export interface PersonLastSeen {
  /** PostHog person UUID — what the persons `bulk_delete` endpoint expects in `ids`. */
  personId: string;
  /** distinct_ids observed for this person, for the founder-facing plan output. */
  distinctIds: string[];
  /**
   * The person's most recent event timestamp. Accepts ISO-8601 (with an explicit offset or `Z`)
   * or ClickHouse's bare `YYYY-MM-DD HH:MM:SS[.ffffff]` (assumed UTC, since that is how events
   * are stored) — see parseLastSeen. Anything else throws rather than being silently dropped.
   */
  lastSeen: string;
}

export interface RetentionPlan {
  retentionDays: number;
  cutoff: Date;
  /** Persons selected for deletion this run, oldest last-seen first, capped at `limit`. */
  selected: PersonLastSeen[];
  /** Count of persons past the cutoff before `limit` was applied. */
  totalPastCutoff: number;
  /** True when `totalPastCutoff` exceeded `limit` — some persons past the cutoff were held back. */
  limited: boolean;
  limit: number;
}

/**
 * Parses POSTHOG_RETENTION_DAYS. Defaults to DEFAULT_RETENTION_DAYS when unset or blank; throws
 * on anything that is not a base-10 integer, and on any integer below MIN_RETENTION_DAYS — the
 * floor a typo cannot cross.
 */
export function parseRetentionDays(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETENTION_DAYS;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`POSTHOG_RETENTION_DAYS must be an integer number of days, got "${raw}".`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < MIN_RETENTION_DAYS) {
    throw new Error(
      `POSTHOG_RETENTION_DAYS must be >= ${MIN_RETENTION_DAYS} (got ${parsed}) — a smaller window risks deleting recently-active people on a typo.`,
    );
  }
  return parsed;
}

/** The cutoff instant: `now` minus `retentionDays` whole days. */
export function computeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

const ISO_OR_CLICKHOUSE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses a `lastSeen` string to epoch milliseconds. ClickHouse renders `max(timestamp)` without a
 * timezone suffix (events are stored in UTC), and `Date.parse` treats a space-separated,
 * offset-less string as *local* time in Node — silently shifting the cutoff decision by the
 * runner's UTC offset. So an offset-less match is normalized to `Z` explicitly here rather than
 * handed to `Date.parse` as-is. Anything that does not match the shape at all throws immediately:
 * a malformed timestamp is a bug to surface, not a row to skip.
 */
export function parseLastSeen(raw: string, personId: string): number {
  const match = ISO_OR_CLICKHOUSE_TIMESTAMP.exec(raw.trim());
  if (!match) {
    throw new Error(`person ${personId} has an unparseable last_seen timestamp: "${raw}"`);
  }
  const [, datePart, timePart, fraction = "", offset] = match;
  const normalized = `${datePart}T${timePart}${fraction}${offset ?? "Z"}`;
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) {
    throw new Error(`person ${personId} has an unparseable last_seen timestamp: "${raw}"`);
  }
  return ms;
}

/**
 * Decides which rows are strictly older than the cutoff and caps the result at `limit`. Mirrors
 * the HogQL `HAVING last_seen < toDateTime({cutoff})` the CLI runs against PostHog: a row exactly
 * at the cutoff is kept, matching `<` rather than `<=`. Selected rows are sorted oldest-first, so
 * a capped run deletes the longest-dormant persons before the merely-old ones.
 */
export function selectPastCutoff(
  rows: readonly PersonLastSeen[],
  cutoff: Date,
  limit: number = DEFAULT_DELETE_LIMIT,
): Pick<RetentionPlan, "selected" | "totalPastCutoff" | "limited" | "limit"> {
  const cutoffMs = cutoff.getTime();
  const pastCutoff = rows
    .map((row) => ({ row, lastSeenMs: parseLastSeen(row.lastSeen, row.personId) }))
    .filter(({ lastSeenMs }) => lastSeenMs < cutoffMs)
    .sort((a, b) => a.lastSeenMs - b.lastSeenMs)
    .map(({ row }) => row);

  return {
    selected: pastCutoff.slice(0, limit),
    totalPastCutoff: pastCutoff.length,
    limited: pastCutoff.length > limit,
    limit,
  };
}

export interface RetentionPlanInput {
  rows: readonly PersonLastSeen[];
  now: Date;
  retentionDaysRaw: string | undefined;
  limit?: number;
}

/**
 * The single entry point tooling/prune-posthog-persons.ts calls: parses the retention window,
 * computes the cutoff from the injected `now`, and decides + caps the rows past it.
 */
export function planRetention(input: RetentionPlanInput): RetentionPlan {
  const retentionDays = parseRetentionDays(input.retentionDaysRaw);
  const cutoff = computeCutoff(input.now, retentionDays);
  const { selected, totalPastCutoff, limited, limit } = selectPastCutoff(input.rows, cutoff, input.limit ?? DEFAULT_DELETE_LIMIT);
  return { retentionDays, cutoff, selected, totalPastCutoff, limited, limit };
}
