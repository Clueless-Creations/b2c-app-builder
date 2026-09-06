import { assert, type Harness } from "../fixtures/_harness.js";
import { domainBusinessUnit, evaluateBudget, findBalance, periodKeyFor, sumWaiverPeriodSpend } from "../../../kernel/autonomy/budget.js";
import { makeBalance, makeLedger, makeLedgerEntry, makeNode, NOW } from "./_fixtures.js";

export function register(harness: Harness): void {
  harness.check("budget: domainBusinessUnit maps every grantable domain to exactly one business unit", () => {
    const cases: Array<[string, string]> = [
      ["domain.money", "Revenue"],
      ["domain.store", "Store"],
      ["domain.engineering", "Engineering"],
      ["domain.growth", "Growth"],
      ["domain.trust", "Trust"],
    ];
    for (const [domainId, expectedUnit] of cases) {
      const unit = domainBusinessUnit(domainId as Parameters<typeof domainBusinessUnit>[0]);
      assert(unit === expectedUnit, `expected ${domainId} -> ${expectedUnit}, got ${unit}`);
    }
  });

  harness.check("budget: periodKeyFor resolves daily/weekly/monthly deterministically from now", () => {
    assert(periodKeyFor("daily", "2026-08-05T09:00:00.000Z") === "2026-08-05", "daily period should be the calendar date");
    assert(periodKeyFor("monthly", "2026-08-05T09:00:00.000Z") === "2026-08", "monthly period should be the calendar month");
    assert(/^\d{4}-W\d{2}$/.test(periodKeyFor("weekly", "2026-08-05T09:00:00.000Z")), "weekly period should be an ISO week key");
  });

  harness.check("budget: periodKeyFor requires a runId for per_run and fails closed without one", () => {
    let threw = false;
    try {
      periodKeyFor("per_run", NOW);
    } catch {
      threw = true;
    }
    assert(threw, "expected per_run without a runId to throw rather than silently pick a bucket");
    assert(periodKeyFor("per_run", NOW, "run.abc123") === "run:run.abc123", "per_run with a runId should key off it");
  });

  harness.check("budget: findBalance returns the matching unit+period balance only", () => {
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 500), makeBalance("Revenue", "2026-09", 900), makeBalance("Growth", "2026-08", 200)]);
    assert(findBalance(ledger, "Revenue", "2026-08")?.remaining === 500, "expected the exact unit+period match");
    assert(findBalance(ledger, "Revenue", "2026-10") === undefined, "no balance for an unfunded period");
  });

  harness.check("budget: sumWaiverPeriodSpend excludes rejected entries and other waivers/periods", () => {
    const ledger = makeLedger(
      [],
      [
        makeLedgerEntry({
          unit: "Revenue",
          domainId: "domain.money",
          period: "2026-08",
          waiverRef: "waiver.a",
          estimate: { amount: 100, currency: "USD", declaredAt: NOW },
          status: "actualized",
          actual: { amount: 90, currency: "USD", recordedAt: NOW },
        }),
        makeLedgerEntry({
          unit: "Revenue",
          domainId: "domain.money",
          period: "2026-08",
          waiverRef: "waiver.a",
          estimate: { amount: 500, currency: "USD", declaredAt: NOW },
          status: "rejected",
        }),
        makeLedgerEntry({
          unit: "Revenue",
          domainId: "domain.money",
          period: "2026-07",
          waiverRef: "waiver.a",
          estimate: { amount: 999, currency: "USD", declaredAt: NOW },
          status: "actualized",
        }),
        makeLedgerEntry({
          unit: "Revenue",
          domainId: "domain.money",
          period: "2026-08",
          waiverRef: "waiver.b",
          estimate: { amount: 999, currency: "USD", declaredAt: NOW },
          status: "actualized",
        }),
      ],
    );
    // 90 (actual overrides estimate for the actualized entry) is the only entry that counts.
    assert(
      sumWaiverPeriodSpend(ledger, "waiver.a", "2026-08") === 90,
      `expected 90 (actual, rejected/other-period/other-waiver excluded), got ${sumWaiverPeriodSpend(ledger, "waiver.a", "2026-08")}`,
    );
  });

  harness.check("budget: evaluateBudget rejects a currency mismatch between the estimate and the balance", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend" });
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 1_000, "USD")]);
    const result = evaluateBudget(ledger, node, "2026-08", { amount: 50, currency: "EUR" });
    assert(!result.ok, "expected a currency mismatch to reject");
    assert(result.reasonCode === "autonomy.budget_currency_mismatch", `expected budget_currency_mismatch, got ${result.reasonCode}`);
  });

  harness.check("budget: evaluateBudget accepts an estimate exactly equal to the remaining balance", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend" });
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 100, "USD")]);
    const result = evaluateBudget(ledger, node, "2026-08", { amount: 100, currency: "USD" });
    assert(result.ok, `expected an estimate exactly at the remaining balance to pass, got: ${result.reason}`);
  });

  harness.check("budget: evaluateBudget fails closed on a NaN estimate amount rather than fail-open on 'NaN > remaining' being false", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend" });
    const ledger = makeLedger([makeBalance("Revenue", "2026-08", 100, "USD")]);
    const result = evaluateBudget(ledger, node, "2026-08", { amount: NaN, currency: "USD" });
    assert(!result.ok, "expected a NaN estimate amount to reject, not silently pass the budget hard-stop");
    assert(result.reasonCode === "autonomy.budget_invalid_amount", `expected budget_invalid_amount, got ${result.reasonCode}`);
  });

  harness.check("budget: evaluateBudget fails closed when the ledger balance's remaining is non-finite", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend" });
    const ledger = makeLedger([{ ...makeBalance("Revenue", "2026-08", 100, "USD"), remaining: Infinity }]);
    const result = evaluateBudget(ledger, node, "2026-08", { amount: 50, currency: "USD" });
    assert(!result.ok, "expected a non-finite remaining balance to reject rather than silently allow spend");
    assert(result.reasonCode === "autonomy.budget_invalid_amount", `expected budget_invalid_amount, got ${result.reasonCode}`);
  });
}
