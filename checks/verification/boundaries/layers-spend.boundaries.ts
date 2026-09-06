import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";
import { createAutonomyEvaluator, type AutonomyDecisionDetail } from "../../../kernel/autonomy/evaluator.js";
import { evaluateGrantCeiling } from "../../../kernel/autonomy/grants.js";
import { grantableDomainIds, type BudgetLedgerDocument, type GrantLevel, type GrantsMap, type Waiver } from "../../../kernel/schema/types.js";
import type { CompiledRunNode } from "../../../kernel/engine/compile.js";
import {
  LAYERS_OPERATION_EFFECTS,
  LAYERS_OPERATION_IDS,
  effectVectorFor,
  quoteArgumentsDigest,
  renderArguments,
  requiredActionClass,
  type LayersQuote,
} from "../../../adapters/providers/layers/index.js";
import { fakeVerifier, makeBalance, makeGrants, makeLedger, makeNode, makeWaiver, NOW } from "./_fixtures.js";

/**
 * Mandate proof 7, part 2: spend authority for the Layers draft-creative operation flows through
 * the existing grant, waiver, and budget evaluator with no provider-specific path. Every case builds
 * a real CompiledRunNode from the adapter's effect vector and a quote, then asks the real evaluator.
 * The last case reads kernel/autonomy and asserts the word "layers" never appears there.
 */
const GROWTH = "domain.growth" as const;
const PERIOD = NOW.slice(0, 7);
const QUOTE: LayersQuote = {
  maxCredits: 120,
  unit: "credits",
  forArgumentsSha256: quoteArgumentsDigest(renderArguments({ productBriefId: "brief-1", format: "reaction_reel" })),
  quotedAt: NOW,
};

function draftNode(overrides: { costEstimate?: { amount: number; currency: string } | null } = {}): CompiledRunNode {
  const vector = effectVectorFor(LAYERS_OPERATION_IDS.draftCreative, QUOTE);
  assert(vector.credits !== null, "draft-creative carries a credit estimate");
  const costEstimate =
    overrides.costEstimate === null ? undefined : (overrides.costEstimate ?? { amount: vector.credits.estimate, currency: vector.credits.unit });
  return makeNode({
    domainId: GROWTH,
    actionClass: requiredActionClass(vector),
    protectedCategory: "spend",
    costEstimate,
    workflowSlug: "layers-growth-draft-creative",
    outputs: ["artifact.growth-layers-draft-creative-json", "artifact.growth-layers-draft-creative-receipt-json"],
  });
}

function readNode(): CompiledRunNode {
  const vector = LAYERS_OPERATION_EFFECTS[LAYERS_OPERATION_IDS.getJob];
  return makeNode({
    domainId: GROWTH,
    actionClass: requiredActionClass(vector),
    workflowSlug: "layers-growth-get-job",
    outputs: ["artifact.growth-layers-job-status-json", "artifact.growth-layers-job-status-receipt-json"],
  });
}

/** A spend waiver in credits for the Layers draft workflows. The founder-authored shape, not a provider shortcut. */
function creditsWaiver(overrides: { maxPerAction?: number; maxPerPeriod?: number; resourcePattern?: string } = {}): Waiver {
  const waiver = makeWaiver({
    domainId: GROWTH,
    actionClass: "spend",
    protectedCategory: "spend",
    resourcePattern: overrides.resourcePattern ?? "workflow.layers-growth-*",
    maxPerAction: overrides.maxPerAction ?? 400,
    maxPerPeriod: overrides.maxPerPeriod ?? 4_000,
  });
  return { ...waiver, caps: { ...waiver.caps, currency: "credits" } };
}

function evaluate(
  node: CompiledRunNode,
  grants: GrantsMap,
  waivers: readonly Waiver[] = [],
  ledger: BudgetLedgerDocument = makeLedger(),
): AutonomyDecisionDetail {
  const probes: string[] = [];
  const decision = createAutonomyEvaluator({ grants, waivers, ledger, prerequisiteVerifier: fakeVerifier({}, probes), now: () => NOW }).evaluate(node);
  assert(probes.length === 0, "a grant without prerequisites must not run a probe");
  return decision;
}

function autonomySources(): Array<{ relative: string; text: string }> {
  const root = path.join(skillRoot, "kernel/autonomy");
  const found: Array<{ relative: string; text: string }> = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".ts")) found.push({ relative: path.relative(skillRoot, full), text: readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return found;
}

export function register(harness: Harness): void {
  harness.check("layers-spend: domain.growth is a base grantable domain and spend needs grant level full there", () => {
    assert((grantableDomainIds as readonly string[]).includes(GROWTH), "domain.growth must be one of the base grantable domains");
    const full = evaluateGrantCeiling(makeGrants([[GROWTH, "full"]]), GROWTH, "spend");
    assert(full.ok, `a full growth grant must clear the spend ceiling, got ${full.reasonCode}`);
    const guardrails = evaluateGrantCeiling(makeGrants([[GROWTH, "run-with-guardrails"]]), GROWTH, "spend");
    assert(
      !guardrails.ok && guardrails.reasonCode === "autonomy.protected_class_requires_full",
      `expected protected_class_requires_full, got ${guardrails.reasonCode}`,
    );
  });

  harness.check("layers-spend: the draft-creative vector folds to spend and a grant below full parks with protected_class_requires_full", () => {
    const node = draftNode();
    assert(
      node.actionClass === "spend" && node.costEstimate?.amount === QUOTE.maxCredits && node.costEstimate.currency === "credits",
      "the node carries the quoted credits as its estimate",
    );
    for (const level of ["review-first", "run-with-guardrails"] as const satisfies readonly GrantLevel[]) {
      const decision = evaluate(node, makeGrants([[GROWTH, level]]), [creditsWaiver()], makeLedger([makeBalance("Growth", PERIOD, 1_000, "credits")]));
      assert(!decision.allowed, `a ${level} grant must park a Layers spend node`);
      assert(
        decision.reasonCode === "autonomy.protected_class_requires_full",
        `expected protected_class_requires_full at ${level}, got ${decision.reasonCode}`,
      );
      assert(decision.grantLevel === level && decision.waiverId === undefined, "the grant gate parks before any waiver is consulted");
    }
    const ungranted = evaluate(node, {}, [creditsWaiver()], makeLedger([makeBalance("Growth", PERIOD, 1_000, "credits")]));
    assert(!ungranted.allowed && ungranted.reasonCode === "autonomy.no_grant", `no growth grant must park with no_grant, got ${ungranted.reasonCode}`);
  });

  harness.check("layers-spend: a full grant without a spend waiver parks with autonomy.no_waiver", () => {
    const decision = evaluate(draftNode(), makeGrants([[GROWTH, "full"]]), [], makeLedger([makeBalance("Growth", PERIOD, 1_000, "credits")]));
    assert(!decision.allowed, "a full grant alone must not release a charged call");
    assert(decision.reasonCode === "autonomy.no_waiver", `expected no_waiver, got ${decision.reasonCode}`);
    assert(
      decision.grantLevel === "full" && decision.waiverId === undefined && decision.estimateAmount === undefined,
      "the park carries the grant level and no budget claim",
    );
  });

  harness.check("layers-spend: a full grant, a matching credits waiver, and a funded Growth balance allow the node with the quoted estimate", () => {
    const waiver = creditsWaiver();
    const decision = evaluate(draftNode(), makeGrants([[GROWTH, "full"]]), [waiver], makeLedger([makeBalance("Growth", PERIOD, 1_000, "credits")]));
    assert(decision.allowed, `expected allowed, got ${decision.reasonCode}: ${decision.parkReason ?? ""}`);
    assert(decision.reasonCode === "autonomy.waiver_and_budget_ok", `expected waiver_and_budget_ok, got ${decision.reasonCode}`);
    assert(
      decision.estimateAmount === QUOTE.maxCredits && decision.estimateCurrency === "credits",
      `the estimate must equal the quote, got ${decision.estimateAmount} ${decision.estimateCurrency}`,
    );
    assert(
      decision.budgetUnit === "Growth" && decision.budgetPeriod === PERIOD && decision.remainingBudget === 1_000,
      "the budget claim names the Growth unit and period",
    );
    assert(decision.waiverId === waiver.id && decision.evidenceRefs.includes(`waiver:${waiver.id}`), "the decision records the waiver it used");
  });

  harness.check("layers-spend: the quote is bounded by the waiver cap, the balance currency, the remaining balance, and the waiver scope", () => {
    const grants = makeGrants([[GROWTH, "full"]]);
    const funded = makeLedger([makeBalance("Growth", PERIOD, 1_000, "credits")]);
    const capped = evaluate(draftNode(), grants, [creditsWaiver({ maxPerAction: 100 })], funded);
    assert(
      !capped.allowed && capped.reasonCode === "autonomy.waiver_cap_exceeded_per_action",
      `a 120 credit quote over a 100 credit cap must park, got ${capped.reasonCode}`,
    );
    const usd = evaluate(draftNode(), grants, [creditsWaiver()], makeLedger([makeBalance("Growth", PERIOD, 1_000, "USD")]));
    assert(!usd.allowed && usd.reasonCode === "autonomy.budget_currency_mismatch", `credits against a USD balance must park, got ${usd.reasonCode}`);
    const drained = evaluate(draftNode(), grants, [creditsWaiver()], makeLedger([makeBalance("Growth", PERIOD, 100, "credits")]));
    assert(
      !drained.allowed && drained.reasonCode === "autonomy.budget_exceeded",
      `a 120 credit quote against 100 remaining must park, got ${drained.reasonCode}`,
    );
    const unfunded = evaluate(draftNode(), grants, [creditsWaiver()], makeLedger());
    assert(!unfunded.allowed && unfunded.reasonCode === "autonomy.budget_unfunded", `no Growth balance must park, got ${unfunded.reasonCode}`);
    const elsewhere = evaluate(draftNode(), grants, [creditsWaiver({ resourcePattern: "workflow.other-provider-*" })], funded);
    assert(
      !elsewhere.allowed && elsewhere.reasonCode === "autonomy.waiver_scope_mismatch",
      `a waiver scoped to another workflow must not cover Layers, got ${elsewhere.reasonCode}`,
    );
  });

  harness.check("layers-spend: a spend node without a quote-derived estimate parks with spend_missing_estimate", () => {
    const decision = evaluate(
      draftNode({ costEstimate: null }),
      makeGrants([[GROWTH, "full"]]),
      [creditsWaiver()],
      makeLedger([makeBalance("Growth", PERIOD, 1_000, "credits")]),
    );
    assert(!decision.allowed && decision.reasonCode === "autonomy.spend_missing_estimate", `an unquoted charged call must park, got ${decision.reasonCode}`);
  });

  harness.check("layers-spend: the get-job observe node is allowed under a review-first grant and skips the waiver gate", () => {
    const node = readNode();
    assert(node.actionClass === "observe" && node.costEstimate === undefined && node.protectedCategory === undefined, "get-job is a free observe");
    const decision = evaluate(node, makeGrants([[GROWTH, "review-first"]]));
    assert(decision.allowed, `expected allowed, got ${decision.reasonCode}: ${decision.parkReason ?? ""}`);
    assert(
      decision.reasonCode === "autonomy.not_protected" && decision.waiverId === undefined && decision.estimateAmount === undefined,
      "an observe read needs no waiver and claims no budget",
    );
    const ungranted = evaluate(node, {});
    assert(!ungranted.allowed && ungranted.reasonCode === "autonomy.no_grant", `a read without any growth grant must still park, got ${ungranted.reasonCode}`);
  });

  harness.check("layers-spend: kernel/autonomy carries no provider-specific exception", () => {
    const sources = autonomySources();
    const names = new Set(sources.map((source) => path.basename(source.relative)));
    for (const required of ["evaluator.ts", "grants.ts", "waivers.ts", "budget.ts", "prerequisites.ts"])
      assert(names.has(required), `kernel/autonomy/${required} must be among the scanned files`);
    const offenders = sources.filter((source) => /layers/iu.test(source.text)).map((source) => source.relative);
    assert(offenders.length === 0, `provider name found in the autonomy engine: ${offenders.join(", ")}`);
  });
}
