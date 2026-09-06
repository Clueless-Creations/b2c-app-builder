import { findBalance } from "../budget.js";
import type { BudgetLedgerDocument, BusinessUnit } from "../../schema/types.js";
import type { PrerequisiteVerification, PrerequisiteVerifier } from "../prerequisites.js";

/**
 * The real `budget_funded` prerequisite probe (R7, KTD5, U9): "spend autonomy requires a funded
 * budget entry." Pure — no I/O, no subprocess — it only reads a `BudgetLedgerDocument` already
 * loaded by the caller (kernel/session/run.ts already loads the ledger once at session start; this
 * probe is handed that same document rather than reading the ledger file itself a second time).
 *
 * This is a *prerequisite* check (does a funded balance exist for this domain's unit/period at
 * all?), distinct from autonomy/budget.ts's `evaluateBudget` (does *this node's* estimate fit in
 * what remains?). A grant can carry a budget_funded prerequisite even when no node has dispatched
 * yet — the two checks compose: prerequisite gates the grant, evaluateBudget gates each spend node.
 *
 * `budgetRef` format: `"<BusinessUnit>:<period>"` (e.g. `"Revenue:2026-08"`), period in the same
 * shape autonomy/budget.ts's `periodKeyFor` produces for the grant's business unit. Malformed refs
 * fail closed (lapsed), never silently pass.
 */
export function verifyBudgetFunded(budgetRef: string, now: string, ledger: BudgetLedgerDocument): PrerequisiteVerification {
  const separatorIndex = budgetRef.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === budgetRef.length - 1) {
    return { status: "lapsed", detail: `budgetRef "${budgetRef}" must be shaped "<unit>:<period>"` };
  }
  const unit = budgetRef.slice(0, separatorIndex) as BusinessUnit;
  const period = budgetRef.slice(separatorIndex + 1);

  const balance = findBalance(ledger, unit, period);
  if (!balance) {
    return { status: "lapsed", detail: `no budget balance found for "${budgetRef}"` };
  }
  if (balance.allocated <= 0) {
    return { status: "lapsed", detail: `budget "${budgetRef}" has zero (or negative) allocation` };
  }

  return {
    status: "verified",
    verifiedAt: now,
    detail: `budget "${budgetRef}" is funded (${balance.allocated} ${balance.currency} allocated, ${balance.remaining} remaining)`,
  };
}

/**
 * Adapts the pure check above to the PrerequisiteVerifier shape (KTD5), for
 * createCompositeVerifier registration alongside the doppler_auth probe. `ledger` is a snapshot
 * captured once by the caller — consistent with SessionPrerequisiteCache's "verified at most once
 * per session" semantics (R7): the first grant that touches this probe id sees the ledger as it
 * stood at session start, not a moving target re-read mid-dispatch.
 */
export function createBudgetFundedVerifier(ledger: BudgetLedgerDocument): PrerequisiteVerifier {
  return (probe, now) => {
    if (probe.kind !== "budget_funded") return { status: "unverified", detail: `probe kind "${probe.kind}" is not budget_funded` };
    return verifyBudgetFunded(probe.budgetRef, now, ledger);
  };
}
