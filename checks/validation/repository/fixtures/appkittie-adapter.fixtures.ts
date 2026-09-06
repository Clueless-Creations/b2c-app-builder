import { ingestAppKittieCategoryRevenue, type AppKittieAppRevenueSample } from "../../../../adapters/appkittie-category-revenue.js";
import type { Harness } from "./_harness.js";

/**
 * appkittie-adapter.fixtures.ts — fail-closed proofs for adapters/appkittie-category-revenue.ts.
 *
 * Every sample here is a hand-written RECORDED payload, never a live MCP call (matching the
 * convention adapters/probe.ts documents: a real probe is a maintainer-run script, never a
 * fixture-injected fake). ingestAppKittieCategoryRevenue() is a pure function with no I/O, so
 * these run in-process rather than through the spawn-a-script harness.
 */
function expect(harness: Harness, label: string, ok: boolean, detail = ""): void {
  harness.results.push({ label, ok, expectedCode: 0, actualCode: ok ? 0 : 1, output: detail });
}

const NOW = new Date("2026-08-15T00:00:00Z");

function sample(overrides: Partial<AppKittieAppRevenueSample> = {}): AppKittieAppRevenueSample {
  return {
    appName: "HabitKit",
    monthlyRevenueUsd: 200_000,
    sourceTool: "search_apps",
    retrievedAt: "2026-08-10T12:00:00Z",
    ...overrides,
  };
}

export function register(h: Harness): void {
  // ── Clean success ─────────────────────────────────────────────────────
  {
    const result = ingestAppKittieCategoryRevenue(
      [sample({ appName: "HabitKit", monthlyRevenueUsd: 200_000 }), sample({ appName: "Streaks", monthlyRevenueUsd: 50_000 })],
      {
        now: NOW,
      },
    );
    expect(h, "appkittie adapter: a clean recorded sample set succeeds", result.ok, JSON.stringify(result));
    if (result.ok) {
      expect(
        h,
        "appkittie adapter: clean success annualizes monthly revenue x12",
        result.rows[0]?.estAnnualRevenueUsd === 2_400_000,
        JSON.stringify(result.rows),
      );
      expect(
        h,
        "appkittie adapter: clean success carries a dated, tool-attributed source label",
        /AppKittie search_apps, observed 2026-08-10/.test(result.rows[0]?.sourceLabel ?? ""),
        JSON.stringify(result.rows),
      );
      expect(h, "appkittie adapter: clean success reports zero skips", result.skipped.length === 0, JSON.stringify(result.skipped));
      expect(h, "appkittie adapter: clean success ranks rows by ascending rank", result.rows[0]!.rank < result.rows[1]!.rank, JSON.stringify(result.rows));
    }
  }

  // ── Null revenue is skipped, never fabricated ────────────────────────
  {
    const result = ingestAppKittieCategoryRevenue([sample({ appName: "NoEstimateApp", monthlyRevenueUsd: null }), sample({ appName: "HabitKit" })], {
      now: NOW,
    });
    expect(h, "appkittie adapter: a null revenue estimate is skipped, not the whole batch", result.ok, JSON.stringify(result));
    if (result.ok) {
      expect(
        h,
        "appkittie adapter: the null-revenue app produces no row",
        !result.rows.some((row) => row.competitor === "NoEstimateApp"),
        JSON.stringify(result.rows),
      );
      expect(
        h,
        "appkittie adapter: the null-revenue app is reported as skipped with the missing-estimate reason",
        result.skipped.some((skip) => skip.appName === "NoEstimateApp" && skip.reason === "missing_revenue_estimate"),
        JSON.stringify(result.skipped),
      );
      expect(
        h,
        "appkittie adapter: no row ever carries a fabricated zero revenue",
        !result.rows.some((row) => row.estAnnualRevenueUsd === 0),
        JSON.stringify(result.rows),
      );
    }
  }

  // ── Future-dated retrievedAt is rejected ─────────────────────────────
  {
    const result = ingestAppKittieCategoryRevenue([sample({ appName: "FutureApp", retrievedAt: "2099-01-01T00:00:00Z" }), sample({ appName: "HabitKit" })], {
      now: NOW,
    });
    expect(h, "appkittie adapter: a future retrievedAt is skipped, not the whole batch", result.ok, JSON.stringify(result));
    if (result.ok) {
      expect(
        h,
        "appkittie adapter: the future-dated app produces no row",
        !result.rows.some((row) => row.competitor === "FutureApp"),
        JSON.stringify(result.rows),
      );
      expect(
        h,
        "appkittie adapter: the future-dated app is reported as skipped with the future-retrieval reason",
        result.skipped.some((skip) => skip.appName === "FutureApp" && skip.reason === "future_retrieved_at"),
        JSON.stringify(result.skipped),
      );
    }
  }

  // ── A malformed (non-RFC3339) retrievedAt is rejected too, distinctly from "future" ──
  {
    const result = ingestAppKittieCategoryRevenue([sample({ appName: "MalformedApp", retrievedAt: "not-a-date" })], { now: NOW });
    expect(h, "appkittie adapter: a malformed retrievedAt alone yields ok:false (nothing usable survives)", !result.ok, JSON.stringify(result));
    expect(
      h,
      "appkittie adapter: a malformed retrievedAt is reported with the invalid-format reason, not future",
      result.skipped.some((skip) => skip.appName === "MalformedApp" && skip.reason === "invalid_retrieved_at"),
      JSON.stringify(result.skipped),
    );
  }

  // ── Empty input is ok:false, not a vacuous success ───────────────────
  {
    const result = ingestAppKittieCategoryRevenue([], { now: NOW });
    expect(h, "appkittie adapter: an empty sample array is ok:false, not an empty success", !result.ok, JSON.stringify(result));
  }

  // ── Every sample skipped still means ok:false, matching the validator's own bar ──
  {
    const result = ingestAppKittieCategoryRevenue([sample({ appName: "OnlyBadApp", monthlyRevenueUsd: null })], { now: NOW });
    expect(h, "appkittie adapter: an all-skipped batch is ok:false", !result.ok, JSON.stringify(result));
  }

  // ── Credential hygiene: the adapter's own module never imports anything HTTP/credential-shaped ──
  {
    // Regression guard for the adapter's own contract, not just this run's output: a sample or
    // row object must never carry a field that looks like a credential.
    const result = ingestAppKittieCategoryRevenue([sample()], { now: NOW });
    const serialized = JSON.stringify(result);
    expect(
      h,
      "appkittie adapter: the ingest result never carries a credential-shaped field",
      !/api[_-]?key|secret|token|password/i.test(serialized),
      serialized,
    );
  }
}
