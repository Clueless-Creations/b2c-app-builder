import { isSystemDomainId, type ActionClass, type BudgetLedgerDocument, type GrantLevel, type GrantsMap, type ProtectedCategory, type Waiver } from "../schema/types.js";
import { findDomainAuthority, type DomainAuthorityRecord } from "../schema/domain-authority.js";
import type { AutonomyDecision, AutonomyEvaluator } from "../engine/frontier.js";
import type { CompiledRunNode, RunNodeId } from "../engine/compile.js";
import { evaluateGrantCeiling } from "./grants.js";
import { SessionPrerequisiteCache, evaluatePrerequisites, type PrerequisiteVerifier } from "./prerequisites.js";
import { evaluateProtectedAction } from "./waivers.js";

/**
 * Structured decision (KTD5, U4 -> U5 handoff): the session runner (U5) turns this into
 * ledger/audit patches — this module only ever produces decisions and evidence payloads, never
 * writes. `allowed`/`parkReason` satisfy engine/frontier.ts's AutonomyDecision contract;
 * everything else is additive detail for the caller that holds the AutonomyEvaluatorV2 type
 * directly (frontier.ts itself only ever sees the narrower AutonomyDecision shape).
 */
export interface AutonomyDecisionDetail extends AutonomyDecision {
  readonly nodeId: RunNodeId;
  readonly domainId: string;
  readonly actionClass: ActionClass;
  readonly protectedCategory?: ProtectedCategory;
  readonly reasonCode: string;
  readonly grantLevel?: GrantLevel;
  readonly waiverId?: string;
  readonly budgetUnit?: string;
  readonly budgetPeriod?: string;
  readonly estimateAmount?: number;
  readonly estimateCurrency?: string;
  readonly remainingBudget?: number;
  /** Envelope evidence refs for an executed protected action (R8) — opaque identifiers, not the evidence payloads themselves. */
  readonly evidenceRefs: readonly string[];
}

export interface AutonomyEvaluatorV2 extends AutonomyEvaluator {
  evaluate(node: CompiledRunNode): AutonomyDecisionDetail;
}

export interface AutonomyDeps {
  readonly grants: GrantsMap;
  readonly waivers: readonly Waiver[];
  /**
   * The budget ledger. Pass a **function** when the ledger is reloaded during a session (the
   * scheduled-session runner reloads it after every spend commit): the evaluator resolves it at
   * each `evaluate()` call so budget checks see the true remaining balance, not a session-start
   * snapshot. A plain document is accepted for tests and single-shot callers where it never changes.
   */
  readonly ledger: BudgetLedgerDocument | (() => BudgetLedgerDocument);
  readonly prerequisiteVerifier: PrerequisiteVerifier;
  /** Needed only for waivers whose budgetPeriod is "per_run". */
  readonly runId?: string;
  readonly now?: () => string;
  /** Catalog-composed domain authority. Absent: the base twelve grantable domains. */
  readonly authority?: readonly DomainAuthorityRecord[];
}

/**
 * The autonomy engine's single entry point (KTD5, R5-R11): implements the Autonomy decision
 * flowchart's grant -> prerequisite -> protected/waiver sequence (kill switch is a separate,
 * dispatch-batch-boundary concern — see killswitch.ts's DispatchHooks factory, re-exported
 * above). One SessionPrerequisiteCache is shared across every `evaluate()` call from this
 * factory's returned evaluator, which is what makes a mid-session prerequisite lapse park every
 * node depending on that grant, not just the node that happened to trigger the probe (R7).
 */
function isSystemDomain(domainId: string, authority?: readonly DomainAuthorityRecord[]): boolean {
  const record = findDomainAuthority(authority, domainId);
  if (record) return record.system;
  return isSystemDomainId(domainId);
}

export function createAutonomyEvaluator(deps: AutonomyDeps): AutonomyEvaluatorV2 {
  const now = deps.now ?? (() => new Date().toISOString());
  const readLedger = typeof deps.ledger === "function" ? deps.ledger : () => deps.ledger as BudgetLedgerDocument;
  const prerequisiteCache = new SessionPrerequisiteCache(deps.prerequisiteVerifier, now);

  return {
    evaluate(node: CompiledRunNode): AutonomyDecisionDetail {
      const base = { nodeId: node.id, domainId: node.domainId, actionClass: node.actionClass, protectedCategory: node.protectedCategory, evidenceRefs: [] as readonly string[] };

      // Process/orchestration/machine nodes are the operating system itself, not business work
      // delegated by a founder grant. Admit only provably internal work. A catalog author cannot
      // use a system domain to smuggle an external, protected, spend, release, destructive, or
      // approval-bearing action around the autonomy boundary.
      if (isSystemDomain(node.domainId, deps.authority)) {
        const internalAction = node.actionClass === "observe" || node.actionClass === "draft" || node.actionClass === "mutate";
        // Provider identifiers on an observe node scope a read-back; they do not authorize a
        // provider mutation. Draft/mutate system work remains local-only and therefore cannot
        // name a provider at all.
        const providerSafe = node.actionClass === "observe" || node.providerIds.length === 0;
        // A founder approval on a system-domain node can be the mandate for local
        // coordination (for example the full-launch program). Frontier still checks
        // the approval status; this evaluator must only reject approvals when they
        // are paired with an otherwise protected, external, or costed action.
        const safe = internalAction && providerSafe && !node.protectedCategory && !node.costEstimate;
        return safe
          ? { ...base, allowed: true, reasonCode: "autonomy.system_internal", evidenceRefs: [`system-domain:${node.domainId}`, `node:${node.id}`] }
          : {
              ...base,
              allowed: false,
              parkReason: `System-domain node ${node.id} declares an external, protected, costed, or founder-approved action; failing closed.`,
              reasonCode: "autonomy.system_boundary_violation",
            };
      }

      const ceiling = evaluateGrantCeiling(deps.grants, node.domainId, node.actionClass, { authority: deps.authority });
      if (!ceiling.ok) {
        return { ...base, allowed: false, parkReason: ceiling.reason, reasonCode: ceiling.reasonCode, grantLevel: ceiling.grant?.level };
      }
      const grant = ceiling.grant!;

      const prerequisites = evaluatePrerequisites(prerequisiteCache, grant);
      if (!prerequisites.ok) {
        return { ...base, allowed: false, parkReason: prerequisites.reason, reasonCode: prerequisites.reasonCode, grantLevel: grant.level };
      }

      const nowIso = now();
      const waiverResult = evaluateProtectedAction(node, deps.waivers, readLedger(), nowIso, deps.runId, deps.authority);
      if (!waiverResult.ok) {
        return { ...base, allowed: false, parkReason: waiverResult.reason, reasonCode: waiverResult.reasonCode, grantLevel: grant.level, waiverId: waiverResult.waiver?.id };
      }

      const evidenceRefs = waiverResult.waiver ? [`waiver:${waiverResult.waiver.id}`, `node:${node.id}`, `at:${nowIso}`] : [];
      return {
        ...base,
        allowed: true,
        reasonCode: waiverResult.reasonCode,
        grantLevel: grant.level,
        waiverId: waiverResult.waiver?.id,
        budgetUnit: waiverResult.budget?.unit,
        budgetPeriod: waiverResult.budget?.period,
        estimateAmount: waiverResult.budget?.estimateAmount,
        estimateCurrency: waiverResult.budget?.currency,
        remainingBudget: waiverResult.budget?.remaining,
        evidenceRefs,
      };
    },
  };
}
