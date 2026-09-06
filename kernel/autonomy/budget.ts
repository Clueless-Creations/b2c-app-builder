import { findDomainAuthority, type DomainAuthorityRecord } from "../schema/domain-authority.js";
import { businessUnitDomains, isSystemDomainId, type BudgetBalance, type BudgetLedgerDocument, type BudgetPeriod, type BaseGrantableDomainId, type BusinessUnit, type DomainId } from "../schema/types.js";
import type { CompiledRunNode } from "../engine/compile.js";

/** businessUnitDomains (KTD3) is total over the 12 base grantable domains; catalog operator groups extend it. */
export function domainBusinessUnit(domainId: DomainId, authority?: readonly DomainAuthorityRecord[]): BusinessUnit {
  const record = findDomainAuthority(authority, domainId);
  if (record?.operatorGroup) return record.operatorGroup;
  if (isSystemDomainId(domainId)) return "Operations";
  for (const [unit, domains] of Object.entries(businessUnitDomains) as Array<[BusinessUnit, readonly BaseGrantableDomainId[]]>) {
    if ((domains as readonly string[]).includes(domainId)) return unit;
  }
  throw new Error(`No business unit maps to domain "${domainId}" (unknown domains fail closed)`);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO-8601 week key (Monday-start, ISO week-numbering year), ordinary in period-key generation. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000 + 1)) / 7);
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;
}

/**
 * Resolves a waiver's budgetPeriod cadence (daily/weekly/monthly/per_run) to the concrete ledger
 * period key "now" falls in. "per_run" needs the caller's runId — thrown, not silently
 * defaulted, if missing (fail closed rather than guessing a period bucket).
 */
export function periodKeyFor(budgetPeriod: BudgetPeriod, now: string, runId?: string): string {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid "now" timestamp for period key: ${now}`);
  switch (budgetPeriod) {
    case "daily":
      return now.slice(0, 10);
    case "weekly":
      return isoWeekKey(date);
    case "monthly":
      return now.slice(0, 7);
    case "per_run":
      if (!runId) throw new Error('budgetPeriod "per_run" requires a runId to resolve a period key');
      return `run:${runId}`;
  }
}

export function findBalance(ledger: BudgetLedgerDocument, unit: BusinessUnit, period: string): BudgetBalance | undefined {
  return ledger.balances.find((balance) => balance.unit === unit && balance.period === period);
}

/** Sum of a waiver's actual-or-estimated spend already recorded against one period (its own per-period cap, distinct from the unit's ledger balance). */
export function sumWaiverPeriodSpend(ledger: BudgetLedgerDocument, waiverId: string, period: string): number {
  return ledger.entries
    .filter((entry) => entry.waiverRef === waiverId && entry.period === period && entry.status !== "rejected")
    .reduce((total, entry) => total + (entry.actual?.amount ?? entry.estimate.amount), 0);
}

export interface BudgetCheckResult {
  readonly ok: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly unit: BusinessUnit;
  readonly period: string;
  readonly estimateAmount: number;
  readonly currency: string;
  readonly remaining?: number;
}

/**
 * R10: "dispatch hard-stops before any action whose estimate would breach the remaining
 * budget". `node.costEstimate` is required by the caller before this runs (waivers.ts / the
 * spend-without-estimate case parks earlier) — this function only compares against the ledger.
 */
export function evaluateBudget(
  ledger: BudgetLedgerDocument,
  node: CompiledRunNode,
  period: string,
  estimate: { amount: number; currency: string },
  authority?: readonly DomainAuthorityRecord[],
): BudgetCheckResult {
  const unit = domainBusinessUnit(node.domainId, authority);
  const balance = findBalance(ledger, unit, period);
  if (!balance) {
    return { ok: false, reasonCode: "autonomy.budget_unfunded", reason: `No budget balance found for unit "${unit}" period "${period}".`, unit, period, estimateAmount: estimate.amount, currency: estimate.currency };
  }
  if (balance.currency !== estimate.currency) {
    return {
      ok: false,
      reasonCode: "autonomy.budget_currency_mismatch",
      reason: `Budget currency "${balance.currency}" does not match estimate currency "${estimate.currency}" for unit "${unit}" period "${period}".`,
      unit,
      period,
      estimateAmount: estimate.amount,
      currency: estimate.currency,
      remaining: balance.remaining,
    };
  }
  // A NaN or non-finite estimate/remaining makes `>` false either way ("5 > NaN" and "NaN > 5"
  // both evaluate false), which would otherwise fail this hard-stop OPEN. Fail closed instead —
  // an unparseable amount is never treated as "within budget".
  if (!Number.isFinite(estimate.amount) || !Number.isFinite(balance.remaining)) {
    return {
      ok: false,
      reasonCode: "autonomy.budget_invalid_amount",
      reason: `Estimate amount "${estimate.amount}" or remaining budget "${balance.remaining}" is not a finite number for unit "${unit}" period "${period}"; failing closed rather than risk a NaN comparison silently passing.`,
      unit,
      period,
      estimateAmount: estimate.amount,
      currency: estimate.currency,
      remaining: balance.remaining,
    };
  }
  if (estimate.amount > balance.remaining) {
    return {
      ok: false,
      reasonCode: "autonomy.budget_exceeded",
      reason: `Estimate ${estimate.amount} ${estimate.currency} exceeds remaining budget ${balance.remaining} ${balance.currency} for unit "${unit}" period "${period}".`,
      unit,
      period,
      estimateAmount: estimate.amount,
      currency: estimate.currency,
      remaining: balance.remaining,
    };
  }
  return { ok: true, reasonCode: "autonomy.budget_ok", reason: "", unit, period, estimateAmount: estimate.amount, currency: estimate.currency, remaining: balance.remaining };
}
