/**
 * appkittie-category-revenue.ts — pure ingest for the Category Revenue Reality table.
 *
 * AppKittie is reached only through the session-level `mcp__appkittie__*` connector; this
 * repository holds no AppKittie credential and never will (unlike tooling/probe-revenuecat.ts,
 * which owns a repo-controlled REST secret). An agent calls the AppKittie MCP tools directly
 * (see knowledge/process/tool-recipes/research-intelligence.md), then hands the already-fetched
 * samples to ingestAppKittieCategoryRevenue() here. This function never performs I/O of any
 * kind — no HTTP, no credential of any shape ever appears in its types, logs, or output.
 *
 * Fail-closed rules (do not relax):
 *   - A sample with no usable revenue estimate is skipped and reported, never coerced to 0 or
 *     invented.
 *   - A malformed or future-dated retrievedAt is rejected and reported, never silently accepted.
 *   - Zero usable rows is `{ ok: false }`, not an empty success — mirrors the validator's own
 *     research.category_revenue_row_missing bar: no sourced number is not a passing scan.
 *
 * This is a narrow mapping, not a second revenue-estimation engine: AppKittie's search_apps/
 * get_app_detail tools report an estimated MONTHLY revenue figure (see their MCP schemas), and
 * the only arithmetic performed here is the mechanical monthly-to-annual multiplication the
 * Category Revenue Reality table's "Est. annual revenue" column asks for — never a heuristic or
 * an interpretation of the underlying number.
 */
import { formatCategoryRevenueSourceLabel, isValidRfc3339Instant } from "../kernel/schema/evidence-grammar.js";
import type { ResearchEvidenceCategoryRevenueRow } from "../kernel/schema/index.js";

/** One AppKittie-sourced sample, already fetched by the calling agent — never fetched here. */
export interface AppKittieAppRevenueSample {
  /** The competitor's display name (AppKittie's app title). */
  readonly appName: string;
  /**
   * AppKittie's estimated monthly revenue in USD for this app, or `null`/`undefined` when
   * AppKittie reports no revenue estimate. Never pass 0 to mean "unknown" — that would be
   * exactly the fabrication this adapter exists to refuse.
   */
  readonly monthlyRevenueUsd: number | null | undefined;
  /** The AppKittie tool call that produced this sample, e.g. "search_apps" or "get_app_historicals". */
  readonly sourceTool: string;
  /** RFC3339 instant the agent retrieved this sample. Must be a real, non-future instant. */
  readonly retrievedAt: string;
  /** Optional 1-based competitor rank within the category scan. Samples without one are numbered in input order. */
  readonly rank?: number;
}

export type AppKittieIngestSkipReason = "missing_revenue_estimate" | "invalid_retrieved_at" | "future_retrieved_at";

export interface AppKittieIngestSkip {
  readonly appName: string;
  readonly reason: AppKittieIngestSkipReason;
}

export type AppKittieIngestResult =
  | { readonly ok: true; readonly rows: readonly ResearchEvidenceCategoryRevenueRow[]; readonly skipped: readonly AppKittieIngestSkip[] }
  | { readonly ok: false; readonly reason: string; readonly skipped: readonly AppKittieIngestSkip[] };

/** Reference instant far enough out that only genuine calendar/grammar defects fail against it. */
const FAR_FUTURE_REFERENCE = new Date("9999-12-31T23:59:59Z");

function classifyRetrievedAt(value: string, now: Date): "ok" | "invalid_format" | "future" {
  if (!isValidRfc3339Instant(value, FAR_FUTURE_REFERENCE)) return "invalid_format";
  if (!isValidRfc3339Instant(value, now)) return "future";
  return "ok";
}

export function ingestAppKittieCategoryRevenue(samples: readonly AppKittieAppRevenueSample[], opts: { now: Date }): AppKittieIngestResult {
  const skipped: AppKittieIngestSkip[] = [];
  const rows: ResearchEvidenceCategoryRevenueRow[] = [];

  samples.forEach((sample, index) => {
    const monthly = sample.monthlyRevenueUsd;
    if (monthly === null || monthly === undefined || !Number.isFinite(monthly) || monthly <= 0) {
      skipped.push({ appName: sample.appName, reason: "missing_revenue_estimate" });
      return;
    }

    const retrievedAtStatus = classifyRetrievedAt(sample.retrievedAt, opts.now);
    if (retrievedAtStatus === "invalid_format") {
      skipped.push({ appName: sample.appName, reason: "invalid_retrieved_at" });
      return;
    }
    if (retrievedAtStatus === "future") {
      skipped.push({ appName: sample.appName, reason: "future_retrieved_at" });
      return;
    }

    const rank = Number.isInteger(sample.rank) && (sample.rank as number) > 0 ? (sample.rank as number) : index + 1;
    rows.push({
      rank,
      competitor: sample.appName,
      estAnnualRevenueUsd: Math.round(monthly * 12),
      sourceLabel: formatCategoryRevenueSourceLabel(sample.sourceTool, sample.retrievedAt),
      observedAt: sample.retrievedAt,
    });
  });

  if (rows.length === 0) {
    return {
      ok: false,
      reason:
        samples.length === 0 ? "No AppKittie samples were supplied." : "No AppKittie sample produced a usable, dated revenue row — every sample was skipped.",
      skipped,
    };
  }

  return { ok: true, rows: [...rows].sort((a, b) => a.rank - b.rank), skipped };
}
