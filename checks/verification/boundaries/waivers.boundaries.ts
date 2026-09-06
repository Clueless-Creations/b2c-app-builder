import { assert, type Harness } from "../fixtures/_harness.js";
import { evaluateProtectedAction, scopeMatches } from "../../../kernel/autonomy/waivers.js";
import type { GrantableDomainId } from "../../../kernel/schema/types.js";
import { makeBalance, makeLedger, makeLedgerEntry, makeNode, makeWaiver, plusSeconds, NOW } from "./_fixtures.js";

export function register(harness: Harness): void {
  harness.check("waivers: a node with no protected category executes on grant alone (not_protected)", () => {
    const node = makeNode({ domainId: "domain.engineering", actionClass: "mutate" });
    const result = evaluateProtectedAction(node, [], makeLedger(), NOW);
    assert(result.ok, "expected an unprotected node to pass without any waiver");
    assert(result.reasonCode === "autonomy.not_protected", `expected not_protected, got ${result.reasonCode}`);
    assert(!result.waiver, "no waiver should be attached to an unprotected decision");
  });

  // R8: every protected gate class gets at least one attempt-and-rejected case (no waiver present).
  const protectedCases: Array<{
    label: string;
    domainId: GrantableDomainId;
    actionClass: "spend" | "release" | "destructive" | "mutate" | "publish";
    category: "spend" | "release" | "destructive" | "credentials_access" | "legal_pricing" | "public_actions";
  }> = [
    { label: "spend", domainId: "domain.money", actionClass: "spend", category: "spend" },
    { label: "release", domainId: "domain.store", actionClass: "release", category: "release" },
    { label: "destructive", domainId: "domain.engineering", actionClass: "destructive", category: "destructive" },
    { label: "credentials_access", domainId: "domain.trust", actionClass: "mutate", category: "credentials_access" },
    { label: "legal_pricing", domainId: "domain.trust", actionClass: "mutate", category: "legal_pricing" },
    { label: "public_actions", domainId: "domain.growth", actionClass: "publish", category: "public_actions" },
  ];
  for (const testCase of protectedCases) {
    harness.check(`waivers: ${testCase.label} action with no matching waiver parks (autonomy.no_waiver), even at max grant`, () => {
      const node = makeNode({
        domainId: testCase.domainId,
        actionClass: testCase.actionClass,
        protectedCategory: testCase.category,
        costEstimate: testCase.actionClass === "spend" ? { amount: 50, currency: "USD" } : undefined,
      });
      const result = evaluateProtectedAction(node, [], makeLedger(), NOW);
      assert(!result.ok, `expected ${testCase.label} without a waiver to be rejected`);
      assert(result.reasonCode === "autonomy.no_waiver", `expected no_waiver for ${testCase.label}, got ${result.reasonCode}`);
    });
  }

  harness.check("waivers: a spend node with no declared cost estimate parks before any waiver lookup", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend" });
    const waiver = makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend" });
    const result = evaluateProtectedAction(node, [waiver], makeLedger([makeBalance("Revenue", "2026-08", 10_000)]), NOW);
    assert(!result.ok, "expected a spend node without an estimate to be rejected");
    assert(result.reasonCode === "autonomy.spend_missing_estimate", `expected spend_missing_estimate, got ${result.reasonCode}`);
  });

  harness.check("waivers: an expired waiver blocks execution", () => {
    const node = makeNode({ domainId: "domain.engineering", actionClass: "destructive", protectedCategory: "destructive" });
    const waiver = makeWaiver({
      domainId: "domain.engineering",
      actionClass: "destructive",
      protectedCategory: "destructive",
      expiry: plusSeconds(NOW, -3600),
    });
    const result = evaluateProtectedAction(node, [waiver], makeLedger(), NOW);
    assert(!result.ok, "expected an expired waiver to reject");
    assert(result.reasonCode === "autonomy.waiver_expired", `expected waiver_expired, got ${result.reasonCode}`);
  });

  harness.check("waivers: a scope-mismatched waiver blocks execution", () => {
    const node = makeNode({ domainId: "domain.store", actionClass: "release", protectedCategory: "release", workflowSlug: "store-submit-ios" });
    const waiver = makeWaiver({
      domainId: "domain.store",
      actionClass: "release",
      protectedCategory: "release",
      resourcePattern: "workflow.store-submit-android",
    });
    const result = evaluateProtectedAction(node, [waiver], makeLedger(), NOW);
    assert(!result.ok, "expected a scope-mismatched waiver to reject");
    assert(result.reasonCode === "autonomy.waiver_scope_mismatch", `expected waiver_scope_mismatch, got ${result.reasonCode}`);
  });

  harness.check("waivers: an inactive (revoked) waiver blocks execution", () => {
    const node = makeNode({ domainId: "domain.trust", actionClass: "mutate", protectedCategory: "credentials_access" });
    const waiver = makeWaiver({ domainId: "domain.trust", actionClass: "mutate", protectedCategory: "credentials_access", status: "revoked" });
    const result = evaluateProtectedAction(node, [waiver], makeLedger(), NOW);
    assert(!result.ok, "expected a revoked waiver to reject");
    assert(result.reasonCode === "autonomy.waiver_inactive", `expected waiver_inactive, got ${result.reasonCode}`);
  });

  harness.check("waivers: an estimate over the waiver's maxPerAction cap blocks execution", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: 500, currency: "USD" } });
    const waiver = makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", maxPerAction: 100 });
    const result = evaluateProtectedAction(node, [waiver], makeLedger([makeBalance("Revenue", "2026-08", 10_000)]), NOW);
    assert(!result.ok, "expected an over-cap estimate to reject");
    assert(result.reasonCode === "autonomy.waiver_cap_exceeded_per_action", `expected waiver_cap_exceeded_per_action, got ${result.reasonCode}`);
  });

  harness.check("waivers: prior spend under the same waiver this period plus a new estimate over maxPerPeriod blocks execution", () => {
    const waiver = makeWaiver({
      domainId: "domain.money",
      actionClass: "spend",
      protectedCategory: "spend",
      maxPerAction: 1_000,
      maxPerPeriod: 300,
      budgetPeriod: "monthly",
    });
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: 100, currency: "USD" } });
    const ledger = makeLedger(
      [makeBalance("Revenue", "2026-08", 10_000)],
      [
        makeLedgerEntry({
          unit: "Revenue",
          domainId: "domain.money",
          period: "2026-08",
          waiverRef: waiver.id,
          estimate: { amount: 250, currency: "USD", declaredAt: NOW },
          status: "actualized",
        }),
      ],
    );
    const result = evaluateProtectedAction(node, [waiver], ledger, NOW);
    assert(!result.ok, "expected 250 already recorded + 100 new to exceed a 300 per-period cap");
    assert(result.reasonCode === "autonomy.waiver_cap_exceeded_per_period", `expected waiver_cap_exceeded_per_period, got ${result.reasonCode}`);
  });

  harness.check("waivers: an estimate exceeding the remaining ledger balance blocks execution (budget_exceeded)", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: 500, currency: "USD" } });
    const waiver = makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend" });
    const result = evaluateProtectedAction(node, [waiver], makeLedger([makeBalance("Revenue", "2026-08", 100)]), NOW);
    assert(!result.ok, "expected an estimate over the remaining balance to reject");
    assert(result.reasonCode === "autonomy.budget_exceeded", `expected budget_exceeded, got ${result.reasonCode}`);
    assert(result.budget?.remaining === 100, "budget detail should carry the remaining balance for evidence");
  });

  harness.check("waivers: no ledger balance at all for the unit/period blocks execution (budget_unfunded)", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: 50, currency: "USD" } });
    const waiver = makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend" });
    const result = evaluateProtectedAction(node, [waiver], makeLedger(), NOW);
    assert(!result.ok, "expected an unfunded unit/period to reject");
    assert(result.reasonCode === "autonomy.budget_unfunded", `expected budget_unfunded, got ${result.reasonCode}`);
  });

  harness.check("waivers: a valid waiver with sufficient budget executes and reports budget evidence", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: 250, currency: "USD" } });
    const waiver = makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend" });
    const result = evaluateProtectedAction(node, [waiver], makeLedger([makeBalance("Revenue", "2026-08", 1_000)]), NOW);
    assert(result.ok, `expected a valid, funded, capped-within waiver to execute, got: ${result.reason}`);
    assert(result.waiver?.id === waiver.id, "the chosen waiver should be attached to the decision");
    assert(result.budget?.ok && result.budget.remaining === 1_000, "budget evidence should reflect the pre-spend remaining balance");
  });

  harness.check("waivers: a valid waiver for a non-cost-bearing protected action (no estimate) executes without a budget check", () => {
    const node = makeNode({ domainId: "domain.engineering", actionClass: "destructive", protectedCategory: "destructive" });
    const waiver = makeWaiver({ domainId: "domain.engineering", actionClass: "destructive", protectedCategory: "destructive" });
    const result = evaluateProtectedAction(node, [waiver], makeLedger(), NOW);
    assert(result.ok, `expected a destructive action with a matching waiver and no cost estimate to execute, got: ${result.reason}`);
    assert(result.budget === undefined, "no cost estimate means no budget evidence to attach");
  });

  harness.check("waivers: a NaN cost estimate fails closed on the maxPerAction cap rather than fail-open on 'NaN > cap' being false", () => {
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: NaN, currency: "USD" } });
    const waiver = makeWaiver({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", maxPerAction: 100 });
    const result = evaluateProtectedAction(node, [waiver], makeLedger([makeBalance("Revenue", "2026-08", 10_000)]), NOW);
    assert(!result.ok, "expected a NaN cost estimate to reject, not silently pass the per-action cap");
    assert(result.reasonCode === "autonomy.waiver_invalid_amount", `expected waiver_invalid_amount, got ${result.reasonCode}`);
  });

  harness.check("waivers: a non-finite maxPerPeriod cap fails closed rather than fail-open on 'spend > NaN' being false", () => {
    const waiver = makeWaiver({
      domainId: "domain.money",
      actionClass: "spend",
      protectedCategory: "spend",
      maxPerAction: 1_000,
      maxPerPeriod: NaN,
      budgetPeriod: "monthly",
    });
    const node = makeNode({ domainId: "domain.money", actionClass: "spend", protectedCategory: "spend", costEstimate: { amount: 100, currency: "USD" } });
    const result = evaluateProtectedAction(node, [waiver], makeLedger([makeBalance("Revenue", "2026-08", 10_000)]), NOW);
    assert(!result.ok, "expected a non-finite maxPerPeriod cap to reject rather than silently allow spend");
    assert(result.reasonCode === "autonomy.waiver_invalid_amount", `expected waiver_invalid_amount, got ${result.reasonCode}`);
  });

  harness.check("waivers: scopeMatches supports '*' wildcards against workflow id, resource claims, and output artifacts", () => {
    const node = makeNode({ domainId: "domain.growth", actionClass: "publish", protectedCategory: "public_actions", workflowSlug: "growth-announce-launch" });
    assert(scopeMatches("*", node), "'*' should match anything");
    assert(scopeMatches("workflow.growth-announce-*", node), "prefix glob should match the workflow id");
    assert(!scopeMatches("workflow.growth-announce-relaunch", node), "an exact-but-different pattern should not match");
  });
}
