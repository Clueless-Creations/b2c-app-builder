import { assert, type Harness } from "./_harness.js";
import {
  DEFAULT_DELETE_LIMIT,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  computeCutoff,
  parseLastSeen,
  parseRetentionDays,
  planRetention,
  selectPastCutoff,
  type PersonLastSeen,
} from "../../../tooling/lib/posthog-retention.js";

/**
 * tooling/prune-posthog-persons.ts's planning core (tooling/lib/posthog-retention.ts): the
 * twelve-month retention window recorded in hosted/builder-console/analytics/LEGITIMATE_INTERESTS_ASSESSMENT.md,
 * enforced client-side against PostHog's own longer guarantee. Every case here is a pure-function
 * unit test with an injected `now` — no network, no PostHog credentials, no filesystem.
 */

const NOW = new Date("2026-09-01T00:00:00.000Z");

function person(overrides: Partial<PersonLastSeen> = {}): PersonLastSeen {
  return { personId: "person-1", distinctIds: ["distinct-1"], lastSeen: "2025-01-01T00:00:00.000Z", ...overrides };
}

export function register(harness: Harness): void {
  // --- parseRetentionDays -----------------------------------------------------------------

  harness.check("posthog-retention: parseRetentionDays defaults to 365 when unset", () => {
    assert(parseRetentionDays(undefined) === DEFAULT_RETENTION_DAYS, `expected default ${DEFAULT_RETENTION_DAYS}, got ${parseRetentionDays(undefined)}`);
    assert(parseRetentionDays("") === DEFAULT_RETENTION_DAYS, "expected an empty string to fall back to the default");
    assert(parseRetentionDays("   ") === DEFAULT_RETENTION_DAYS, "expected a blank string to fall back to the default");
  });

  harness.check("posthog-retention: parseRetentionDays honors a custom window", () => {
    assert(parseRetentionDays("90") === 90, `expected 90, got ${parseRetentionDays("90")}`);
    assert(parseRetentionDays("730") === 730, `expected 730, got ${parseRetentionDays("730")}`);
  });

  harness.check(`posthog-retention: parseRetentionDays refuses anything below the ${MIN_RETENTION_DAYS}-day floor`, () => {
    for (const bad of ["29", "1", "0", "-5"]) {
      let threw = false;
      try {
        parseRetentionDays(bad);
      } catch {
        threw = true;
      }
      assert(threw, `expected parseRetentionDays("${bad}") to throw — below the ${MIN_RETENTION_DAYS}-day floor`);
    }
    // The floor itself is accepted — it is inclusive, not exclusive.
    assert(parseRetentionDays(String(MIN_RETENTION_DAYS)) === MIN_RETENTION_DAYS, `expected the floor value ${MIN_RETENTION_DAYS} itself to be accepted`);
  });

  harness.check("posthog-retention: parseRetentionDays rejects non-integer input rather than coercing it", () => {
    for (const bad of ["thirty", "30.5", "30 days", "1e10", "NaN"]) {
      let threw = false;
      try {
        parseRetentionDays(bad);
      } catch {
        threw = true;
      }
      assert(threw, `expected parseRetentionDays("${bad}") to throw rather than silently coerce`);
    }
  });

  // --- computeCutoff ------------------------------------------------------------------------

  harness.check("posthog-retention: computeCutoff subtracts whole days from now", () => {
    const cutoff = computeCutoff(NOW, 365);
    const expectedMs = NOW.getTime() - 365 * 24 * 60 * 60 * 1000;
    assert(cutoff.getTime() === expectedMs, `expected cutoff ${new Date(expectedMs).toISOString()}, got ${cutoff.toISOString()}`);
  });

  // --- parseLastSeen --------------------------------------------------------------------------

  harness.check("posthog-retention: parseLastSeen accepts ISO-8601 with an explicit offset", () => {
    const ms = parseLastSeen("2025-06-15T12:00:00.000Z", "p1");
    assert(ms === Date.parse("2025-06-15T12:00:00.000Z"), "expected the ISO string to parse to its own epoch value");
  });

  harness.check("posthog-retention: parseLastSeen treats a bare ClickHouse timestamp as UTC, not local time", () => {
    const bare = parseLastSeen("2025-06-15 12:00:00", "p1");
    const explicit = parseLastSeen("2025-06-15T12:00:00Z", "p1");
    assert(bare === explicit, `expected the offset-less ClickHouse form to be treated as UTC (${bare} !== ${explicit})`);
  });

  harness.check("posthog-retention: parseLastSeen fails loudly on a malformed timestamp rather than skipping it", () => {
    for (const bad of ["not-a-date", "", "2025-06-15", "15/06/2025 12:00:00", "yesterday"]) {
      let threw = false;
      let message = "";
      try {
        parseLastSeen(bad, "person-xyz");
      } catch (error) {
        threw = true;
        message = error instanceof Error ? error.message : String(error);
      }
      assert(threw, `expected parseLastSeen("${bad}") to throw`);
      assert(message.includes("person-xyz"), `expected the error to name the offending person, got: ${message}`);
    }
  });

  // --- selectPastCutoff: the boundary ---------------------------------------------------------

  harness.check("posthog-retention: a person whose last event lands exactly on the cutoff is kept, not deleted", () => {
    const cutoff = new Date("2025-06-01T00:00:00.000Z");
    const exactlyAtCutoff = person({ personId: "on-the-line", lastSeen: cutoff.toISOString() });
    const oneMsBeforeCutoff = person({ personId: "one-ms-stale", lastSeen: new Date(cutoff.getTime() - 1).toISOString() });
    const result = selectPastCutoff([exactlyAtCutoff, oneMsBeforeCutoff], cutoff);
    const selectedIds = result.selected.map((row) => row.personId);
    assert(!selectedIds.includes("on-the-line"), "a person exactly at the cutoff must not be selected for deletion (HAVING last_seen < cutoff, not <=)");
    assert(selectedIds.includes("one-ms-stale"), "a person one millisecond before the cutoff must be selected");
    assert(result.totalPastCutoff === 1, `expected exactly 1 person past the cutoff, got ${result.totalPastCutoff}`);
  });

  // --- selectPastCutoff: ordering and the limit cap -------------------------------------------

  harness.check("posthog-retention: selectPastCutoff orders selections oldest-last-seen-first", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const rows = [
      person({ personId: "middle", lastSeen: "2025-06-01T00:00:00.000Z" }),
      person({ personId: "oldest", lastSeen: "2024-01-01T00:00:00.000Z" }),
      person({ personId: "newest-still-stale", lastSeen: "2025-11-01T00:00:00.000Z" }),
    ];
    const result = selectPastCutoff(rows, cutoff);
    assert(
      result.selected.map((row) => row.personId).join(",") === "oldest,middle,newest-still-stale",
      `expected oldest-first ordering, got ${result.selected.map((row) => row.personId).join(",")}`,
    );
  });

  harness.check("posthog-retention: selectPastCutoff caps the batch at --limit and reports that it did", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const rows = Array.from({ length: 12 }, (_, index) =>
      person({ personId: `stale-${index}`, lastSeen: `2020-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const result = selectPastCutoff(rows, cutoff, 5);
    assert(result.selected.length === 5, `expected the batch capped at 5, got ${result.selected.length}`);
    assert(result.totalPastCutoff === 12, `expected 12 total past the cutoff before capping, got ${result.totalPastCutoff}`);
    assert(result.limited === true, "expected limited=true when totalPastCutoff exceeds the limit");
    // The five oldest are the ones kept, not an arbitrary five.
    assert(result.selected[0]?.personId === "stale-0", `expected the oldest row first, got ${result.selected[0]?.personId}`);
    assert(result.selected[4]?.personId === "stale-4", `expected the 5th-oldest row last, got ${result.selected[4]?.personId}`);
  });

  harness.check("posthog-retention: selectPastCutoff reports limited=false when the batch fits under the cap", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const rows = [person({ personId: "a", lastSeen: "2024-01-01T00:00:00.000Z" }), person({ personId: "b", lastSeen: "2024-02-01T00:00:00.000Z" })];
    const result = selectPastCutoff(rows, cutoff, DEFAULT_DELETE_LIMIT);
    assert(result.limited === false, "expected limited=false when everything past the cutoff fit under the limit");
    assert(result.selected.length === 2, `expected both rows selected, got ${result.selected.length}`);
  });

  // --- selectPastCutoff: empty input -----------------------------------------------------------

  harness.check("posthog-retention: selectPastCutoff on an empty row set selects nothing and does not throw", () => {
    const result = selectPastCutoff([], new Date("2026-01-01T00:00:00.000Z"));
    assert(result.selected.length === 0, "expected zero selections for an empty input");
    assert(result.totalPastCutoff === 0, "expected zero total for an empty input");
    assert(result.limited === false, "expected limited=false for an empty input");
  });

  // --- selectPastCutoff: malformed timestamps propagate, they are not swallowed ---------------

  harness.check("posthog-retention: selectPastCutoff throws (rather than silently dropping the row) when a timestamp is malformed", () => {
    const rows = [person({ personId: "good", lastSeen: "2020-01-01T00:00:00.000Z" }), person({ personId: "bad", lastSeen: "not-a-timestamp" })];
    let threw = false;
    let message = "";
    try {
      selectPastCutoff(rows, new Date("2026-01-01T00:00:00.000Z"));
    } catch (error) {
      threw = true;
      message = error instanceof Error ? error.message : String(error);
    }
    assert(threw, "expected selectPastCutoff to throw when any row has a malformed timestamp");
    assert(message.includes("bad"), `expected the error to name the offending person, got: ${message}`);
  });

  // --- planRetention: the single entry point the CLI calls -------------------------------------

  harness.check("posthog-retention: planRetention composes parsing, cutoff, and selection end to end", () => {
    const rows = [person({ personId: "stale", lastSeen: "2025-01-01T00:00:00.000Z" }), person({ personId: "fresh", lastSeen: "2026-08-01T00:00:00.000Z" })];
    const plan = planRetention({ rows, now: NOW, retentionDaysRaw: "90" });
    assert(plan.retentionDays === 90, `expected retentionDays 90, got ${plan.retentionDays}`);
    assert(plan.cutoff.getTime() === computeCutoff(NOW, 90).getTime(), "expected the plan's cutoff to match computeCutoff(now, 90)");
    assert(
      plan.selected.map((row) => row.personId).join(",") === "stale",
      `expected only "stale" selected under a 90-day window, got ${plan.selected.map((row) => row.personId).join(",")}`,
    );
  });

  harness.check("posthog-retention: planRetention surfaces the floor violation rather than silently falling back to the default", () => {
    let threw = false;
    try {
      planRetention({ rows: [], now: NOW, retentionDaysRaw: "5" });
    } catch {
      threw = true;
    }
    assert(threw, "expected planRetention to throw when retentionDaysRaw is below the floor");
  });
}
