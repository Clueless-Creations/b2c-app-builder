import { stringify as stringifyYaml } from "yaml";
import { composeCatalog, composePacks, compositionFingerprint } from "../../../catalog/index.js";
import { loadPackClosure, parsePackYaml } from "../../../catalog/packs/load.js";
import { resolveCatalogAuthority } from "../../../catalog/domain-authority.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import type { CatalogDomain, CatalogWorkflowDef, ReferenceId } from "../../../catalog/types.js";
import type { PackManifest } from "../../../catalog/packs/types.js";
import { createAutonomyEvaluator } from "../../../kernel/autonomy/evaluator.js";
import { evaluateGrantCeiling } from "../../../kernel/autonomy/grants.js";
import { domainBusinessUnit } from "../../../kernel/autonomy/budget.js";
import { evaluateProtectedAction } from "../../../kernel/autonomy/waivers.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import type { DomainAuthorityRecord } from "../../../kernel/schema/domain-authority.js";
import { assert, skillRoot, type Harness } from "./_harness.js";
import type { Grant, GrantableDomainId, GrantsMap } from "../../../kernel/schema/types.js";
import { makeBalance, makeLedger, makeNode, makeWaiver, NOW } from "../boundaries/_fixtures.js";

function emptyPack(overrides: Partial<PackManifest> & Pick<PackManifest, "id" | "kind">): PackManifest {
  return {
    title: overrides.title ?? overrides.id,
    version: overrides.version ?? "1.0.0",
    revision: overrides.revision ?? "fixture-revision",
    dependsOn: overrides.dependsOn ?? [],
    createsProviderSpend: false,
    domains: overrides.domains ?? [],
    workflows: overrides.workflows ?? [],
    references: overrides.references ?? [],
    areas: overrides.areas ?? [],
    capabilities: overrides.capabilities ?? [],
    extensions: overrides.extensions ?? [],
    ...overrides,
  };
}

function foodDomain(): CatalogDomain {
  return {
    id: "domain.food",
    slug: "food",
    name: "Food Product",
    areaIds: ["area.product-experience"],
    routeLabel: "Food product",
    routeWhen: "sku contrast",
    order: 160,
    grantable: true,
    operatorGroup: "Operations",
  };
}

function foodWorkflow(): CatalogWorkflowDef {
  return {
    id: "workflow.food.sku-contrast",
    title: "Food SKU contrast",
    domainId: "domain.food",
    areaIds: ["area.product-experience"],
    trigger: "When a food-product SKU needs a contrast record",
    founderPhrasings: [],
    instructions: "Produce the food SKU contrast artifact and stop; this synthetic contract exists only to satisfy validation.",
    reads: [],
    consults: [],
    referenceIds: [],
    roleId: "role.orchestrator",
    laneIds: [],
    phaseIds: [],
    dependencies: [],
    outputPaths: ["fixture/food-sku.md"],
    gateCommands: [],
    providerIds: [],
    founderOnlyActions: [],
    actionClass: "draft",
    idempotent: true,
    applicability: { mode: "always" },
    extensionSlots: ["proof"],
  };
}

function foodGrant(): Grant {
  return {
    domainId: "domain.food",
    level: "run-with-guardrails",
    prerequisites: [],
    grantedAt: "2026-08-05T00:00:00.000Z",
    grantedBy: "founder",
    grantedViaUnit: "Operations",
    updatedAt: "2026-08-05T00:00:00.000Z",
  };
}

export function register(harness: Harness): void {
  harness.check("packs: authored workflow semantics, roles, gates and provenance survive composition", () => {
    const authored = {
      id: "business-pack.strict",
      version: "1.0.0",
      revision: "r1",
      roles: [
        {
          id: "role.strict",
          name: "Strict",
          prompt_path: "AGENTS.md",
          scope: "test",
          capability_ids: ["manual"],
          output_path_prefixes: ["strict/"],
          skill_routes: [{ id: "design", when: "design work" }],
        },
      ],
      gates: [{ id: "gate.strict", command: "check:strict", owner_domain_id: "domain.trust", audit: "required", script_path: "checks/strict.ts" }],
      references: [
        {
          id: "reference.strict",
          path: "strict.md",
          domain_id: "domain.trust",
          title: "Strict",
          load_when: "When testing",
          source_exemption: "Authored test contract",
          session_scoped: false,
          sources: [
            {
              id: "source",
              name: "Original",
              source_type: "documentation",
              url: "https://example.com/contract",
              review_cadence_days: 7,
              claim_scope: "contract",
              last_review_date: "2026-09-05",
              reviewer: "operator",
            },
          ],
        },
      ],
      workflows: [
        {
          id: "workflow.strict",
          title: "Strict",
          domain_id: "domain.trust",
          instructions: "Validate the contract",
          role_id: "role.strict",
          provider_ids: ["manual"],
          source_access: [{ path: "src", access: "update" }],
          founder_only_actions: ["authorize"],
          applicability: { mode: "conditional", question: "Does it apply?" },
          recurrence_days: 7,
          max_attempts: 2,
          max_consecutive_no_progress_attempts: 1,
          ttl_seconds: 30,
          token_budget: 400,
          cost_estimate: { amount: 2, currency: "USD" },
          group_id: "strict",
          refresh_dependencies: [{ workflow_id: "workflow.strict", instructions: "Refresh" }],
          review_of: ["workflow.strict"],
          gate_commands: ["check:strict"],
          reference_ids: ["reference.strict"],
          action_class: "observe",
          idempotent: false,
        },
      ],
    };
    const pack = parsePackYaml(stringifyYaml(authored));
    const workflow = pack.workflows[0]!;
    assert(workflow.sourceAccess?.[0]?.path === "src" && workflow.sourceAccess[0].access === "update", "source access claim dropped");
    assert(workflow.providerIds[0] === "manual" && workflow.founderOnlyActions[0] === "authorize", "authority metadata dropped");
    assert(
      workflow.applicability.mode === "conditional" && workflow.recurrenceDays === 7 && workflow.tokenBudget === 400 && workflow.costEstimate?.amount === 2,
      "execution semantics dropped",
    );
    assert(
      workflow.refreshDependencies?.[0]?.instructions === "Refresh" && workflow.reviewOf?.[0] === "workflow.strict" && workflow.idempotent === false,
      "review semantics dropped",
    );
    assert(pack.references[0]?.sourceExemption === "Authored test contract" && pack.references[0]?.sources[0]?.reviewer === "operator", "provenance changed");
    const composed = composePacks(composeCatalog(skillRoot), [pack]);
    assert(composed.issues.length === 0, JSON.stringify(composed.issues));
    assert(
      composed.catalog.roles.some((role) => role.id === "role.strict") && composed.catalog.gates.some((gate) => gate.id === "gate.strict"),
      "roles/gates not composed",
    );
    for (const invalid of [
      { ...authored, unexpected: true },
      { ...authored, workflows: [{ ...authored.workflows[0], provider_ids: [42] }] },
      { ...authored, workflows: [{ ...authored.workflows[0], applicability: { mode: "always", ignored: true } }] },
      { ...authored, references: [{ ...authored.references[0], sources: [{ ...authored.references[0]!.sources[0], ignored: true }] }] },
      { ...authored, gates: [{ ...authored.gates[0], audit: "skip" }] },
    ]) {
      let refused = false;
      try {
        parsePackYaml(stringifyYaml(invalid));
      } catch {
        refused = true;
      }
      assert(refused, "unknown fields and malformed authored values must fail before normalization");
    }
    const unsourced = parsePackYaml(stringifyYaml({ id: "business-pack.unsourced", references: [{ id: "reference.unsourced", domain_id: "domain.trust" }] }));
    assert(unsourced.references[0]?.sourceExemption === undefined && unsourced.references[0]?.sources.length === 0, "parser must never fabricate provenance");
  });

  harness.check("packs: a no-pack composeCatalog pin matches the base catalog", () => {
    const catalog = composeCatalog(skillRoot);
    assert(
      catalog.composition?.packs.length === 1 && catalog.composition.packs[0]?.id === "business-pack.consumer-business",
      "default composition must pin its firstparty package",
    );
    assert(Boolean(catalog.composition?.fingerprint), "base composition must still emit a fingerprint");
    const again = composeCatalog(skillRoot, []);
    assert(again.composition?.fingerprint === catalog.composition?.fingerprint, "empty pack list must be byte-stable with no-pack composition");
  });

  harness.check("packs: a food-product business pack survives bridge, grants, budget, and compile", () => {
    const base = composeCatalog(skillRoot);
    const pack = emptyPack({
      id: "business-pack.food-product-contrast",
      kind: "business-pack",
      domains: [foodDomain()],
      workflows: [foodWorkflow()],
      areas: [{ id: "area.product-experience", name: "Product And Experience", description: "existing", domainIds: ["domain.food"] }],
    });
    const result = composePacks(base, [pack]);
    assert(
      result.issues.filter((issue) => issue.severity === "error").length === 0,
      `food pack must compose, got: ${result.issues.map((issue) => issue.code).join(", ")}`,
    );
    const catalog = result.catalog;
    assert(
      catalog.domains.some((domain) => domain.id === "domain.food"),
      "composed catalog must include domain.food",
    );
    assert(catalog.composition?.deltas["business-pack.food-product-contrast"]?.workflows === 1, "pack delta must record the added workflow");
    const input = toCatalogInput(catalog);
    assert(
      input.workflows.some((workflow) => workflow.id === "workflow.food.sku-contrast"),
      "food-product workflow must survive the bridge after pack composition",
    );
    const plan = compilePlan(input, "2026-08-05T00:00:00.000Z");
    assert(
      plan.nodes.some((node) => node.workflowId === "workflow.food.sku-contrast"),
      "compiled plan must include the food node",
    );
    const grants: GrantsMap = { "domain.food": foodGrant() };
    const authority = resolveCatalogAuthority(catalog.domains);
    assert(evaluateGrantCeiling(grants, "domain.food", "draft", { authority }).ok, "grant lookup must accept domain.food");
    assert(domainBusinessUnit("domain.food", authority) === "Operations", "budget mapping must follow the pack operator group");
    assert(
      input.authority?.some((record) => record.id === "domain.food" && record.grantable),
      "bridge must carry composed domain authority into the executable catalog",
    );
    const foodNode = plan.nodes.find((node) => node.workflowId === "workflow.food.sku-contrast");
    assert(foodNode !== undefined, "compiled plan must expose the food node to the evaluator");
    const decision = createAutonomyEvaluator({
      grants,
      waivers: [],
      ledger: { schemaVersion: "1.0.0", updatedAt: "2026-08-05T00:00:00.000Z", balances: [], entries: [] },
      prerequisiteVerifier: () => ({ status: "verified", detail: "fixture" }),
      authority: input.authority,
    }).evaluate(foodNode);
    assert(decision.allowed, `production evaluator must admit domain.food with composed authority, got ${decision.reasonCode}`);
    const sharedArea = base.areas.find((area) => area.id === "area.product-experience");
    assert(sharedArea !== undefined, "base catalog must keep area.product-experience");
    assert(!sharedArea.domainIds.includes("domain.food"), "composePacks must copy area.domainIds instead of mutating the shared base catalog");
  });

  harness.check("packs: accepted extension bindings reach the executable catalog", () => {
    const catalog = composeCatalog(skillRoot, loadPackClosure(skillRoot, ["business-pack.food-product-contrast"]));
    const workflow = catalog.workflows.find((item) => item.id === "workflow.food.sku-contrast");
    assert(workflow !== undefined, "food composition must include the sku-contrast workflow");
    const expected = [
      "reference.food-product.sku",
      "reference.food-product.promise",
      "reference.food-product.retailer",
      "reference.food-product.regulatory",
      "reference.food-product.manufacturing",
      "reference.food-product.conversion",
    ] as const satisfies readonly ReferenceId[];
    for (const referenceId of expected) {
      assert(workflow.referenceIds.includes(referenceId), `composed food workflow missing bound reference ${referenceId}`);
    }
    assert((catalog.bindings?.length ?? 0) > 0, "accepted food-pack bindings must persist on the catalog");
    const input = toCatalogInput(catalog);
    const bridged = input.workflows.find((item) => item.id === "workflow.food.sku-contrast");
    assert(bridged !== undefined, "food workflow must survive the executable bridge");
    for (const referenceId of expected) {
      assert(
        (bridged.references ?? []).some((reference) => reference.id === referenceId),
        `executable catalog missing bound reference ${referenceId}`,
      );
    }
  });

  harness.check("packs: consumer-app capability bindings reach implementing base workflows", () => {
    const catalog = composeCatalog(skillRoot, loadPackClosure(skillRoot, ["business-pack.consumer-app"]));
    const expectedByDomain = {
      "domain.growth": ["reference.consumer-app.acquisition", "reference.consumer-app.retention", "reference.consumer-app.referral"],
      "domain.store": ["reference.consumer-app.activation"],
      "domain.money": ["reference.consumer-app.revenue"],
    } as const;
    for (const [domainId, referenceIds] of Object.entries(expectedByDomain)) {
      const bound = catalog.workflows.filter(
        (workflow) => workflow.domainId === domainId && referenceIds.every((referenceId) => workflow.referenceIds.includes(referenceId)),
      );
      assert(bound.length > 0, `consumer-app bindings for ${domainId} must attach to a workflow in that domain`);
    }
    const leaked = catalog.workflows.filter(
      (workflow) =>
        workflow.domainId === "domain.experience" &&
        (
          [
            "reference.consumer-app.acquisition",
            "reference.consumer-app.activation",
            "reference.consumer-app.retention",
            "reference.consumer-app.revenue",
            "reference.consumer-app.referral",
          ] as const
        ).some((referenceId) => workflow.referenceIds.includes(referenceId)),
    );
    assert(leaked.length === 0, "consumer-app bindings must not attach to unrelated kernel workflows");
    assert((catalog.bindings?.length ?? 0) > 0, "accepted consumer-app bindings must persist on the catalog");
    const input = toCatalogInput(catalog);
    for (const [domainId, referenceIds] of Object.entries(expectedByDomain)) {
      const bridged = input.workflows.filter(
        (workflow) =>
          workflow.domainId === domainId && referenceIds.every((referenceId) => (workflow.references ?? []).some((reference) => reference.id === referenceId)),
      );
      assert(bridged.length > 0, `executable catalog must carry consumer-app bindings for ${domainId}`);
    }
  });

  harness.check("packs: duplicate global ids, cycles, unresolved refs, invalid slots, and weakening fail closed", () => {
    const base = composeCatalog(skillRoot);
    const duplicate = composePacks(base, [
      emptyPack({
        id: "capability.web-presence",
        kind: "capability",
        domains: [base.domains[0]!],
      }),
    ]);
    assert(
      duplicate.issues.some((issue) => issue.code === "pack_composition.duplicate_id"),
      `expected duplicate_id, got: ${duplicate.issues.map((issue) => issue.code).join(", ")}`,
    );

    const cyclic = composePacks(base, [
      emptyPack({ id: "capability.alpha", kind: "capability", dependsOn: ["capability.beta"] }),
      emptyPack({ id: "capability.beta", kind: "capability", dependsOn: ["capability.alpha"] }),
    ]);
    assert(
      cyclic.issues.some((issue) => issue.code === "pack_composition.dependency_cycle"),
      `expected dependency_cycle, got: ${cyclic.issues.map((issue) => issue.code).join(", ")}`,
    );

    const unresolved = composePacks(base, [emptyPack({ id: "capability.web-presence", kind: "capability", dependsOn: ["capability.missing"] })]);
    assert(
      unresolved.issues.some((issue) => issue.code === "pack_composition.unresolved_reference"),
      `expected unresolved_reference, got: ${unresolved.issues.map((issue) => issue.code).join(", ")}`,
    );

    const invalidSlot = composePacks(base, [
      emptyPack({
        id: "capability.web-presence",
        kind: "capability",
        extensions: [{ targetId: "workflow.research.fixture-missing", slot: "proof", kind: "bind" }],
      }),
    ]);
    assert(
      invalidSlot.issues.some((issue) => issue.code === "pack_composition.invalid_extension_slot"),
      `expected invalid_extension_slot, got: ${invalidSlot.issues.map((issue) => issue.code).join(", ")}`,
    );

    const weaken = composePacks(base, [
      emptyPack({
        id: "business-pack.food-product-contrast",
        kind: "business-pack",
        domains: [foodDomain()],
        workflows: [foodWorkflow()],
        extensions: [{ targetId: "workflow.food.sku-contrast", slot: "proof", kind: "weaken", removeGates: ["check:privacy-terms"] }],
      }),
    ]);
    assert(
      weaken.issues.some((issue) => issue.code === "pack_composition.monotonicity_violation"),
      `expected monotonicity_violation, got: ${weaken.issues.map((issue) => issue.code).join(", ")}`,
    );

    const unknownBinding = composePacks(base, [
      emptyPack({
        id: "business-pack.food-product-contrast",
        kind: "business-pack",
        domains: [foodDomain()],
        workflows: [foodWorkflow()],
        extensions: [
          {
            targetId: "workflow.food.sku-contrast",
            slot: "proof",
            kind: "bind",
            referenceIds: ["reference.does-not-exist"],
          },
        ],
      }),
    ]);
    assert(
      unknownBinding.issues.some((issue) => issue.code === "pack_composition.unresolved_reference"),
      `expected unresolved_reference, got: ${unknownBinding.issues.map((issue) => issue.code).join(", ")}`,
    );
    assert(
      !(unknownBinding.catalog.bindings ?? []).some((binding) => binding.packId === "business-pack.food-product-contrast"),
      "unknown extension references must not persist a partial binding",
    );
  });

  harness.check("packs: a grantable domain without a valid operator group fails closed", () => {
    const base = composeCatalog(skillRoot);
    const domain = { ...foodDomain() };
    delete domain.operatorGroup;
    const missing = composePacks(base, [
      emptyPack({
        id: "business-pack.food-product-contrast",
        kind: "business-pack",
        domains: [domain],
        workflows: [foodWorkflow()],
      }),
    ]);
    assert(
      missing.issues.some((issue) => issue.code === "pack_composition.invalid_operator_group"),
      `expected invalid_operator_group, got: ${missing.issues.map((issue) => issue.code).join(", ")}`,
    );
    assert(!missing.catalog.domains.some((entry) => entry.id === "domain.food"), "invalid grantable domain must not enter the catalog");

    let yamlRejected = false;
    try {
      parsePackYaml(
        [
          "id: business-pack.broken-operator-group",
          "title: Broken operator group",
          "version: 1.0.0",
          "revision: rev-1",
          "domains:",
          "  - id: domain.food",
          "    grantable: true",
        ].join("\n"),
        "fixture.yaml",
      );
    } catch (error) {
      yamlRejected = error instanceof Error && error.message.includes("pack_composition.invalid_operator_group");
    }
    assert(yamlRejected, "grantable YAML domain without operator_group must fail parse");
  });

  harness.check("packs: shuffled pack authoring order yields the same composition digest", () => {
    const base = composeCatalog(skillRoot);
    const alpha = emptyPack({
      id: "capability.web-presence",
      kind: "capability",
      capabilities: [
        {
          id: "capability.web-presence",
          title: "Web presence",
          applicability: "any business with a public site",
          requiredFacts: [],
          authority: [],
          readiness: [],
          inputs: [],
          outputs: [],
          effects: [],
          evidence: [],
          expectedOutcome: "a current public site",
          contextSelectors: [],
          exclusions: [],
          extensionSlots: ["proof"],
        },
      ],
    });
    const food = emptyPack({
      id: "business-pack.food-product-contrast",
      kind: "business-pack",
      dependsOn: ["capability.web-presence"],
      domains: [foodDomain()],
      workflows: [foodWorkflow()],
    });
    const forward = composePacks(base, [alpha, food]);
    const reverse = composePacks(base, [food, alpha]);
    assert(forward.catalog.composition?.fingerprint === reverse.catalog.composition?.fingerprint, "pack order must not change the composition fingerprint");
    const changed = composePacks(base, [alpha, { ...food, workflows: [{ ...food.workflows[0]!, instructions: "Changed semantics under the same revision" }] }]);
    assert(
      changed.catalog.composition?.fingerprint !== forward.catalog.composition?.fingerprint,
      "changed semantics must change fingerprint even with unchanged declared revisions",
    );
    const capabilityChanged = composePacks(base, [
      { ...alpha, capabilities: alpha.capabilities.map((item) => ({ ...item, expectedOutcome: "Different outcome" })) },
      food,
    ]);
    assert(capabilityChanged.catalog.composition?.fingerprint !== forward.catalog.composition?.fingerprint, "capability-only content must change fingerprint");
    const recomputed = compositionFingerprint({
      skillVersion: forward.catalog.skillVersion,
      catalog: forward.catalog,
      packs: forward.catalog.composition?.packs ?? [],
      domainIds: forward.catalog.domains.map((domain) => domain.id),
      workflowIds: forward.catalog.workflows.map((workflow) => workflow.id),
    });
    assert(recomputed === forward.catalog.composition?.fingerprint, "fingerprint helper must match the composed pin");
  });

  harness.check("packs: a pack-declared system domain is admitted as internal work", () => {
    const authority: DomainAuthorityRecord[] = [
      {
        id: "domain.pack-runtime",
        grantable: false,
        system: true,
        machine: false,
        aliases: [],
        protectedCategories: [],
      },
    ];
    const node = makeNode({ domainId: "domain.pack-runtime" as GrantableDomainId, actionClass: "observe" });
    const decision = createAutonomyEvaluator({
      grants: {},
      waivers: [],
      ledger: { schemaVersion: "1.0.0", updatedAt: "2026-08-05T00:00:00.000Z", balances: [], entries: [] },
      prerequisiteVerifier: () => ({ status: "verified", detail: "fixture" }),
      authority,
    }).evaluate(node);
    assert(decision.allowed, `pack system domain must be admitted as internal work, got ${decision.reasonCode}`);
    assert(decision.reasonCode === "autonomy.system_internal", `expected system_internal, got ${decision.reasonCode}`);
  });

  harness.check("packs: protected spend on a pack domain uses composed operator-group budget mapping", () => {
    const authority: DomainAuthorityRecord[] = [
      {
        id: "domain.food",
        grantable: true,
        system: false,
        machine: false,
        operatorGroup: "Operations",
        aliases: [],
        protectedCategories: [],
      },
    ];
    const node = makeNode({
      domainId: "domain.food" as GrantableDomainId,
      actionClass: "spend",
      protectedCategory: "spend",
      costEstimate: { amount: 50, currency: "USD" },
    });
    const waiver = makeWaiver({ domainId: "domain.food" as GrantableDomainId, actionClass: "spend", protectedCategory: "spend" });
    const ledger = makeLedger([makeBalance("Operations", "2026-08", 10_000)]);
    let threw = false;
    try {
      evaluateProtectedAction(node, [waiver], ledger, NOW);
    } catch {
      threw = true;
    }
    assert(threw, "a pack domain spend without composed authority must fail closed");
    const result = evaluateProtectedAction(node, [waiver], ledger, NOW, undefined, authority);
    assert(result.ok, `composed authority must map pack-domain spend onto the operator-group ledger, got ${result.reasonCode}`);
  });

  harness.check("packs: emptyPack defaults createsProviderSpend to false", () => {
    assert(emptyPack({ id: "capability.alpha", kind: "capability" }).createsProviderSpend === false, "empty pack must not create provider spend");
  });

  harness.check("packs: a spend pack without the paid-AI control pack fails closed", () => {
    const result = composePacks(composeCatalog(skillRoot), [emptyPack({ id: "capability.chat-generation", kind: "capability", createsProviderSpend: true })]);
    assert(
      result.issues.some((issue) => issue.code === "pack_composition.paid_ai_controls_missing"),
      `expected paid_ai_controls_missing, got: ${result.issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("packs: the paid-generative-ai pack binds cost-boundary on generative-ai-safety", () => {
    const result = composePacks(composeCatalog(skillRoot), loadPackClosure(skillRoot, ["capability.paid-generative-ai"]));
    const errors = result.issues.filter((issue) => issue.severity === "error");
    assert(errors.length === 0, `paid-AI pack must compose, got: ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
    assert(
      result.catalog.workflows.some((workflow) => workflow.id === "workflow.trust.paid-generative-ai-controls"),
      "composed catalog must include the paid-AI control workflow",
    );
    assert(
      (result.catalog.bindings ?? []).some(
        (binding) => binding.targetId === "workflow.trust.generative-ai-safety" && binding.slot === "cost-boundary" && binding.kind === "strengthen",
      ),
      "paid-AI pack must strengthen the cost-boundary slot on generative-ai-safety",
    );
  });
}
