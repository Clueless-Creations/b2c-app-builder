import type { DomainAuthorityRecord } from "../schema/domain-authority.js";
import type { ActionClass, BudgetLedgerDocument, ProtectedCategory, Waiver } from "../schema/types.js";
import type { CompiledRunNode } from "../engine/compile.js";
import { evaluateBudget, periodKeyFor, sumWaiverPeriodSpend, type BudgetCheckResult } from "./budget.js";

/**
 * KTD4's three "direct" categories are unconditionally protected — a catalog author forgetting
 * to tag `protectedCategory: "spend"` on a spend node must not create an unprotected spend path.
 * mutate/publish have no direct mapping: their protectedness (credentials_access, legal_pricing,
 * public_actions) exists only if the catalog declares it.
 */
const DIRECT_CATEGORY_BY_CLASS: Partial<Record<ActionClass, ProtectedCategory>> = { spend: "spend", release: "release", destructive: "destructive" };

export function effectiveProtectedCategory(node: Pick<CompiledRunNode, "actionClass" | "protectedCategory">): ProtectedCategory | undefined {
  return DIRECT_CATEGORY_BY_CLASS[node.actionClass] ?? node.protectedCategory;
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** A waiver's scope.resourcePattern (glob, "*" wildcard) is matched against the node's workflow id, its resource claims, and its declared output artifact ids — whichever the founder scoped the waiver to. */
export function scopeMatches(resourcePattern: string, node: CompiledRunNode): boolean {
  const regexp = globToRegExp(resourcePattern);
  const candidates: string[] = [node.workflowId, ...node.resources.map((claim) => claim.id), ...node.outputs];
  return candidates.some((candidate) => regexp.test(candidate));
}

export interface WaiverEvaluation {
  readonly ok: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly waiver?: Waiver;
  readonly budget?: BudgetCheckResult;
}

/**
 * The protected-class gate (R8, R9, flowchart's W/WV nodes). Called only after the grant-level
 * gate and prerequisite gate both pass. A node with no effective protected category is not
 * gated here at all (returns ok immediately) — the caller executes it on grant alone.
 */
export function evaluateProtectedAction(
  node: CompiledRunNode,
  waivers: readonly Waiver[],
  ledger: BudgetLedgerDocument,
  now: string,
  runId?: string,
  authority?: readonly DomainAuthorityRecord[],
): WaiverEvaluation {
  const protectedCategory = effectiveProtectedCategory(node);
  if (!protectedCategory) return { ok: true, reasonCode: "autonomy.not_protected", reason: "" };

  if (node.actionClass === "spend" && !node.costEstimate) {
    return { ok: false, reasonCode: "autonomy.spend_missing_estimate", reason: `Spend node "${node.id}" declares no cost estimate; refusing to dispatch (fail closed).` };
  }

  const candidates = waivers.filter((waiver) => waiver.domainId === node.domainId && waiver.actionClass === node.actionClass && waiver.protectedCategory === protectedCategory);
  if (candidates.length === 0) {
    return { ok: false, reasonCode: "autonomy.no_waiver", reason: `No waiver covers domain "${node.domainId}" actionClass "${node.actionClass}" protectedCategory "${protectedCategory}".` };
  }

  const active = candidates.filter((waiver) => waiver.status === "active");
  if (active.length === 0) {
    return { ok: false, reasonCode: "autonomy.waiver_inactive", reason: `Waiver(s) exist for this action but none are active (status: ${candidates.map((waiver) => waiver.status).join(", ")}).` };
  }

  const nowMs = Date.parse(now);
  const notExpired = active.filter((waiver) => Date.parse(waiver.expiry) > nowMs);
  if (notExpired.length === 0) {
    return { ok: false, reasonCode: "autonomy.waiver_expired", reason: `Active waiver(s) for this action have all expired (checked against ${now}).` };
  }

  const scoped = notExpired.filter((waiver) => scopeMatches(waiver.scope.resourcePattern, node));
  if (scoped.length === 0) {
    return { ok: false, reasonCode: "autonomy.waiver_scope_mismatch", reason: `No active, unexpired waiver's scope pattern matches node "${node.id}" (workflow "${node.workflowId}").` };
  }

  // Deterministic pick when more than one waiver matches — lowest id wins; this is not itself a rejection path.
  const chosen = [...scoped].sort((a, b) => a.id.localeCompare(b.id))[0]!;

  if (!node.costEstimate) {
    return { ok: true, reasonCode: "autonomy.waiver_ok", reason: "", waiver: chosen };
  }

  // Same NaN fail-open hazard as budget.ts's evaluateBudget: a non-finite estimate or cap makes
  // `>` false in both directions, silently passing the hard-stop. Fail closed instead.
  if (!Number.isFinite(node.costEstimate.amount) || !Number.isFinite(chosen.caps.maxPerAction)) {
    return {
      ok: false,
      reasonCode: "autonomy.waiver_invalid_amount",
      reason: `Estimate amount "${node.costEstimate.amount}" or waiver "${chosen.id}" maxPerAction cap "${chosen.caps.maxPerAction}" is not a finite number; failing closed rather than risk a NaN comparison silently passing.`,
      waiver: chosen,
    };
  }
  if (node.costEstimate.amount > chosen.caps.maxPerAction) {
    return {
      ok: false,
      reasonCode: "autonomy.waiver_cap_exceeded_per_action",
      reason: `Estimate ${node.costEstimate.amount} ${node.costEstimate.currency} exceeds waiver "${chosen.id}" maxPerAction cap ${chosen.caps.maxPerAction}.`,
      waiver: chosen,
    };
  }

  const period = periodKeyFor(chosen.budgetPeriod, now, runId);
  const periodSpend = sumWaiverPeriodSpend(ledger, chosen.id, period);
  if (!Number.isFinite(periodSpend) || !Number.isFinite(chosen.caps.maxPerPeriod)) {
    return {
      ok: false,
      reasonCode: "autonomy.waiver_invalid_amount",
      reason: `Already-recorded period spend "${periodSpend}" or waiver "${chosen.id}" maxPerPeriod cap "${chosen.caps.maxPerPeriod}" is not a finite number for period "${period}"; failing closed rather than risk a NaN comparison silently passing.`,
      waiver: chosen,
    };
  }
  if (periodSpend + node.costEstimate.amount > chosen.caps.maxPerPeriod) {
    return {
      ok: false,
      reasonCode: "autonomy.waiver_cap_exceeded_per_period",
      reason: `Estimate ${node.costEstimate.amount} plus already-recorded ${periodSpend} exceeds waiver "${chosen.id}" maxPerPeriod cap ${chosen.caps.maxPerPeriod} for period "${period}".`,
      waiver: chosen,
    };
  }

  const budget = evaluateBudget(ledger, node, period, node.costEstimate, authority);
  if (!budget.ok) {
    return { ok: false, reasonCode: budget.reasonCode, reason: budget.reason, waiver: chosen, budget };
  }
  return { ok: true, reasonCode: "autonomy.waiver_and_budget_ok", reason: "", waiver: chosen, budget };
}
