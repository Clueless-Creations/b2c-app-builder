import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assert, repoCheckoutPresent, repoRoot, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { auditExcludedScripts, buildAuditPlan } from "../../../tooling/lib/audit-plan.js";
import { knowledgeFreshnessPinPath, loadKnowledgeFreshnessPin, writeKnowledgeFreshnessPin } from "../../../tooling/lib/knowledge-freshness-pin.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { resolveCatalogAuthority } from "../../../catalog/domain-authority.js";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { composeCatalog } from "../../../catalog/index.js";
import { renderGeneratedFiles } from "../../../catalog/render-routing.js";
import type { Catalog, CatalogDomain, CatalogWorkflowDef } from "../../../catalog/types.js";
import { validateCatalog } from "../../../catalog/validate.js";
import { domainBusinessUnit } from "../../../kernel/autonomy/budget.js";
import { evaluateGrantCeiling } from "../../../kernel/autonomy/grants.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { allowAllAutonomyEvaluator, computeFrontier } from "../../../kernel/engine/frontier.js";
import { seedRunState } from "../../../kernel/engine/runstate.js";
import type { BusinessStateV2 } from "../../../kernel/schema/types.js";
import { repositoryProfileIds, type Grant, type GrantsMap } from "../../../kernel/schema/types.js";

// skillRoot is the repository root (ADR-0002); the ledger lives at docs/plans/attachments/.
const resolvedLedgerPath = path.join(repoRoot, "docs", "plans", "attachments", "2026-08-port-ledger.md");

function installedFreshnessFixture(harness: Harness, label: string) {
  const fixtureRoot = harness.makeTempDir(label);
  const installedRoot = path.join(fixtureRoot, "clients", "codex", "b2c-app-builder");
  cpSync(skillRoot, installedRoot, {
    recursive: true,
    filter: (source) => {
      const parts = path.relative(skillRoot, source).split(path.sep);
      return parts[0] !== "verification" && !parts.some((part) => ["node_modules", ".git", "dist"].includes(part));
    },
  });
  assert(!existsSync(path.join(installedRoot, "verification")), "installed fixtures must exclude development verification sources and generated device output");
  symlinkSync(path.dirname(path.dirname(resolveTsxBin(skillRoot))), path.join(installedRoot, "node_modules"), "dir");
  assert(!existsSync(path.resolve(installedRoot, "../../docs/source-freshness/source-snapshots/current.json")), "fixture must not inherit repository docs");
  const clockPath = path.join(fixtureRoot, "clock.mjs");
  writeFileSync(
    clockPath,
    `const OriginalDate = Date; globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : ["2026-08-28T00:00:00.000Z"])); }
      static now() { return new OriginalDate("2026-08-28T00:00:00.000Z").valueOf(); }
    };\n`,
  );
  const run = (relative: string, args: string[] = []) =>
    spawnSync(resolveTsxBin(skillRoot), [path.join(installedRoot, relative), ...args], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${pathToFileURL(clockPath).href}`.trim() },
    });
  return { fixtureRoot, installedRoot, run };
}

function baseWorkflow(overrides: Partial<CatalogWorkflowDef> = {}): CatalogWorkflowDef {
  return {
    id: "workflow.research.fixture-a",
    title: "Fixture A",
    domainId: "domain.research",
    areaIds: ["area.product-experience"],
    trigger: "fixture trigger",
    founderPhrasings: [],
    instructions: "Produce the fixture output artifact and stop; this synthetic contract exists only to satisfy validation.",
    reads: [],
    consults: [],
    // Bound by default: every non-machine workflow must carry knowledge (workflow.no_knowledge),
    // so per-scenario defects stay singular. Scenarios testing the gate override this to [].
    referenceIds: ["reference.research.fixture"],
    roleId: "role.fixture",
    laneIds: [],
    phaseIds: [],
    dependencies: [],
    outputPaths: ["fixture/output.md"],
    gateCommands: [],
    providerIds: [],
    founderOnlyActions: [],
    actionClass: "draft",
    idempotent: true,
    applicability: { mode: "always" },
    ...overrides,
  };
}

/** Minimal but otherwise-valid fixture catalog, mutated per-scenario to introduce exactly one defect. */
function baseFixtureCatalog(): Catalog {
  return {
    schemaVersion: "2.0.0",
    skillVersion: "0.0.0-fixture",
    areas: [{ id: "area.product-experience", name: "Product And Experience", description: "fixture", domainIds: ["domain.research"] }],
    domains: [
      {
        id: "domain.research",
        slug: "research",
        name: "Market Research",
        areaIds: ["area.product-experience"],
        routeLabel: "Market research",
        routeWhen: "fixture",
        order: 10,
        // deliberately no indexPath: avoids a real filesystem existence check in this fixture catalog.
      },
    ],
    phases: [],
    lanes: [],
    roles: [
      {
        id: "role.fixture",
        name: "Fixture Role",
        promptPath: "agents/fixture.md",
        scope: "fixture",
        parentPromptPaths: ["AGENTS.md", "APP_AGENTS.md"],
        contextPackIds: ["context.founder-language"],
        skillRoutes: [{ id: "fixture-skill", when: "fixture" }],
        toolRoutes: [{ id: "fixture-tool", when: "fixture" }],
        capabilityIds: [],
        outputPathPrefixes: ["fixture/"],
      },
    ],
    contextPacks: [{ id: "context.founder-language", title: "Founder language", referenceIds: ["reference.research.fixture"] }],
    references: [
      {
        id: "reference.research.fixture",
        path: "package.json",
        domainId: "domain.research",
        title: "Fixture knowledge",
        loadWhen: "always",
        sessionScoped: true,
        lifecycle: "active",
        applicabilityNotes: "Fixture.",
        sourceExemption: "Fixture.",
        sources: [],
        replacementIds: [],
      },
    ],
    workflows: [baseWorkflow()],
    artifacts: [{ id: "artifact.fixture.output.md", path: "fixture/output.md", ownerDomainId: "domain.research", laneIds: [], generated: false }],
    gates: [],
    profiles: [],
  };
}

export function register(harness: Harness): void {
  harness.check("catalog runtime gates: strict MobAI evidence is required only for an explicit business workspace", () => {
    const gateId = "check:mobai-proof-workflow";
    for (const layout of ["repo", "skill"] as const) {
      assert(!buildAuditPlan(layout).some((step) => step.id === gateId), "the reference scaffold must not claim captured provider proof");
      assert(Boolean(auditExcludedScripts[gateId]), "the strict gate exclusion must state its coverage and scope");
      const businessRoot = path.join(harness.makeTempDir("mobai-runtime-gate"), "business");
      const runtimeGate = buildAuditPlan(layout, { businessRoot, skillRoot }).find((step) => step.id === gateId);
      assert(
        JSON.stringify(runtimeGate?.args) === JSON.stringify(["--skill-root", skillRoot, "--root", businessRoot, "--state", "state/business-state.json"]),
        "explicit runtime invocation must retain its selected skill, business workspace, and reducer-owned state",
      );
    }
  });

  harness.check("catalog freshness: an isolated installed skill uses the same snapshot pin as the source checkout", () => {
    const { installedRoot, run } = installedFreshnessFixture(harness, "catalog-freshness-installed");
    const result = run("checks/validation/repository/check-catalog.ts");
    assert(
      result.status === 0,
      `installed catalog must retain the committed freshness baseline, got exit ${result.status}:\n${result.stdout}\n${result.stderr}`,
    );
    assert(!result.stdout.includes("knowledge.source.stale"), "installed catalog must not switch to the wall clock");
    const knowledgeResult = run("tooling/knowledge.ts", ["check"]);
    assert(knowledgeResult.status === 0, `installed knowledge check must use the same freshness pin:\n${knowledgeResult.stdout}\n${knowledgeResult.stderr}`);
    const renderResult = run("catalog/render-routing.ts", ["--check"]);
    assert(renderResult.stdout.includes("projection(s) current"), "installed renderer must execute, not silently skip its CLI entrypoint");
    assert(
      renderResult.status === 0,
      `installed renderer must check its packaged pin without repository docs:\n${renderResult.stdout}\n${renderResult.stderr}`,
    );
    assert(
      JSON.stringify(loadKnowledgeFreshnessPin(installedRoot)) === JSON.stringify(loadKnowledgeFreshnessPin(skillRoot)),
      "the isolated install must carry the source pin unchanged",
    );
    const decoy = path.resolve(installedRoot, "../../docs/source-freshness/source-snapshots/current.json");
    mkdirSync(path.dirname(decoy), { recursive: true });
    writeFileSync(decoy, JSON.stringify({ generated_at: "2099-01-01T00:00:00.000Z" }));
    assert(run("checks/validation/repository/check-catalog.ts").status === 0, "unrelated ancestor docs must not replace the packaged freshness baseline");
  });

  harness.check("catalog freshness: installed catalog, knowledge, and renderer commands refuse missing or malformed pins", () => {
    const { installedRoot, run } = installedFreshnessFixture(harness, "catalog-freshness-refusal");
    const target = path.join(installedRoot, knowledgeFreshnessPinPath);
    for (const [content, code] of [
      [undefined, "knowledge.freshness_pin.unavailable"],
      ["{", "knowledge.freshness_pin.invalid"],
    ] as const) {
      if (content === undefined) unlinkSync(target);
      else writeFileSync(target, content);
      for (const [relative, args] of [
        ["checks/validation/repository/check-catalog.ts", []],
        ["tooling/knowledge.ts", ["check"]],
        ["catalog/render-routing.ts", ["--check"]],
      ] as const) {
        const result = run(relative, [...args]);
        const output = `${result.stdout}\n${result.stderr}`;
        assert(result.status === 1 && output.includes(code), `${relative} must refuse ${code}, got ${result.status}:\n${output}`);
        assert(!output.includes("knowledge.source.stale"), "an invalid pin must not silently fall back to the wall clock");
      }
    }
  });

  harness.check("catalog freshness: source snapshot drift fails checks and a rendered advancement still enforces review cadence", () => {
    const { fixtureRoot, installedRoot, run } = installedFreshnessFixture(harness, "catalog-freshness-advance");
    const sourceSnapshot = path.join(fixtureRoot, "snapshot.json");
    const initial = loadKnowledgeFreshnessPin(installedRoot);
    writeFileSync(sourceSnapshot, JSON.stringify({ generated_at: initial.generatedAt, sources: [] }));
    writeKnowledgeFreshnessPin(installedRoot, sourceSnapshot);
    const sourceArgs = ["--source-snapshot", sourceSnapshot];
    assert(run("checks/validation/repository/check-catalog.ts", sourceArgs).status === 0, "matching source snapshot must pass");
    const next = new Date(new Date(initial.generatedAt).valueOf() + 365 * 86_400_000).toISOString();
    writeFileSync(sourceSnapshot, JSON.stringify({ generated_at: next, sources: [] }));
    const before = readFileSync(path.join(installedRoot, knowledgeFreshnessPinPath), "utf8");
    const catalogDrift = run("checks/validation/repository/check-catalog.ts", sourceArgs);
    assert(catalogDrift.status === 1 && catalogDrift.stderr.includes("knowledge.freshness_pin.drift"), "source catalog checks must detect a stale pin");
    const knowledgeDrift = run("tooling/knowledge.ts", ["check", ...sourceArgs]);
    assert(knowledgeDrift.status === 1 && knowledgeDrift.stderr.includes("knowledge.freshness_pin.drift"), "source knowledge checks must detect a stale pin");
    const renderDrift = run("catalog/render-routing.ts", ["--check", ...sourceArgs]);
    assert(
      renderDrift.status === 1 && renderDrift.stderr.includes("catalog_render.generated_drift"),
      "source renderer checks must compare the pin to its snapshot",
    );
    assert(readFileSync(path.join(installedRoot, knowledgeFreshnessPinPath), "utf8") === before, "freshness checks must not rewrite the pin");
    const render = run("catalog/render-routing.ts", sourceArgs);
    assert(render.status === 0, `source rendering must update the pin: ${render.stderr}`);
    assert(run("catalog/render-routing.ts", ["--check", ...sourceArgs]).status === 0, "source rendering must produce deterministic current output");
    const advanced = run("checks/validation/repository/check-catalog.ts", sourceArgs);
    assert(advanced.status === 1 && advanced.stdout.includes("knowledge.source.stale"), "an advanced pin must still reject genuinely overdue sources");
  });

  // ---------------------------------------------------------------------
  // catalog/validate.ts: structural gate
  // ---------------------------------------------------------------------

  harness.check("validate: a clean minimal fixture catalog has zero errors", () => {
    const catalog = baseFixtureCatalog();
    const issues = validateCatalog(catalog, skillRoot).filter((issue) => issue.severity === "error");
    assert(issues.length === 0, `expected no errors, got: ${issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`);
  });

  harness.check("validate: progress-aware repair limits must fit inside the hard attempt cap", () => {
    const nonPositive = baseFixtureCatalog();
    nonPositive.workflows = [baseWorkflow({ maxAttempts: 8, maxConsecutiveNoProgressAttempts: 0 })];
    assert(
      validateCatalog(nonPositive, skillRoot).some((issue) => issue.code === "catalog_graph.workflow.no_progress_attempts_invalid"),
      "a non-positive no-progress limit must fail catalog validation",
    );
    const noHardCapRoom = baseFixtureCatalog();
    noHardCapRoom.workflows = [baseWorkflow({ maxAttempts: 3, maxConsecutiveNoProgressAttempts: 3 })];
    assert(
      validateCatalog(noHardCapRoom, skillRoot).some((issue) => issue.code === "catalog_graph.workflow.no_progress_attempts_invalid"),
      "the no-progress limit must leave room beneath the hard attempt cap",
    );
  });

  harness.check("catalog: design audits bind progress-aware repair and exact native runtime proof", () => {
    const catalog = composeCatalog(skillRoot);
    const byId = new Map(catalog.workflows.map((workflow) => [workflow.id, workflow]));
    const designRoom = byId.get("workflow.design.design-room")!;
    const designAudit = byId.get("workflow.design.design-system-audit")!;
    const implementationAudit = byId.get("workflow.design.implementation-craft-audit")!;
    const tokenPromotion = byId.get("workflow.design.token-promotion")!;
    assert(
      designRoom.gateCommands.includes("check:design-worthiness-mechanical") && !designRoom.gateCommands.includes("check:design-worthiness"),
      "the Design Room producer must prove mechanical worthiness without deciding taste",
    );
    assert(
      designAudit.instructions.includes("## Delegated Taste Decision") &&
        designAudit.instructions.includes("ENGINE-ISSUED DESIGN TASTE DELEGATION") &&
        designAudit.instructions.includes("rejected, absent, or stale") &&
        designAudit.instructions.includes("never infer delegation from workspace files") &&
        !designAudit.instructions.includes("decision.design.taste.delegation: approved") &&
        designAudit.instructions.includes("Do not edit DESIGN.md") &&
        designAudit.instructions.includes("Candidate input fingerprint: <ENGINE-BOUND INPUT FINGERPRINT>") &&
        !designAudit.reads.includes("run/run-state.json"),
      "the isolated audit must own the structured delegated decision, use the prompt-bound candidate fingerprint, and avoid mutable run-state reads",
    );
    assert(tokenPromotion.dependencies.includes(designAudit.id), "token promotion must wait for the accepted design-system audit");
    for (const audit of [designAudit, implementationAudit]) {
      assert(audit.maxAttempts === 8, `${audit.id} must keep an explicit eight-attempt hard cap`);
      assert(audit.maxConsecutiveNoProgressAttempts === 2, `${audit.id} must stop after two consecutive unchanged producer rounds`);
      for (const producerId of audit.reviewOf ?? []) {
        const producer = byId.get(producerId)!;
        assert(producer.idempotent && producer.maxAttempts === 8, `${producerId} must be the local idempotent producer side of the design repair loop`);
      }
    }
    assert(
      implementationAudit.dependencies.includes("workflow.engineering.native-ios-proof-route-ladder"),
      "the implementation audit must wait for the native Route Ladder",
    );
    assert(
      implementationAudit.reviewOf?.includes("workflow.engineering.native-ios-proof-route-ladder") === true,
      "the implementation audit must be able to route proof failures back through the bounded native producer",
    );
    assert(implementationAudit.reads.includes("proof/"), "the implementation audit must open the selected-platform native proof root");
    for (const field of [
      "target",
      "candidateSha256",
      "bundleId",
      "buildNumber",
      "executableSha256",
      "bundleContentSha256",
      "sourceFingerprint",
      "deviceId",
      "runtimeIds[]",
      "runtimeId",
      "deviceModelIdentifier",
      "osVersion",
      "osBuild",
      "physical-ios-install",
      "four hashed tool transcripts",
      "packageName",
      "versionCode",
      "android-emulator-install",
      "physical-android-install",
      "derived installation APK",
      "TalkBack",
      "screenReader: true",
      "builtPackage.source.root",
      "builtPackage.source.roots",
      "never reconstruct or hand-author",
    ]) {
      assert(implementationAudit.instructions.includes(field), `the implementation audit must bind ${field}`);
    }
    const nativeProof = byId.get("workflow.engineering.native-ios-proof-route-ladder")!;
    assert(
      nativeProof.title === "Mobile app operation and native proof (Route Ladder)",
      "the stable Route Ladder workflow must cover mobile operation beyond proof",
    );
    assert(
      nativeProof.outputPaths.length === 1 && nativeProof.outputPaths[0] === "proof/",
      "the Route Ladder must own one neutral proof root so absent platforms need no placeholder evidence",
    );
    assert(
      nativeProof.gateCommands.includes("check:native-ios") &&
        nativeProof.gateCommands.includes("check:mobai-proof-workflow") &&
        nativeProof.gateCommands.includes("check:native-android"),
      "the Route Ladder must bind the iOS, bounded MobAI, and strict Android checks",
    );
    assert(nativeProof.providerIds.includes("provider.mobai"), "the native Route Ladder must expose the Android device provider");
    assert(nativeProof.idempotent && nativeProof.maxAttempts === 8, "the native Route Ladder must support bounded internal proof repair");
    for (const branchTerm of [
      "b2c proof --workspace . --platform ios",
      "proof/ios-simulator/",
      "proof/ios-device/",
      "b2c proof --workspace . --platform android",
      "proof/android-emulator/",
      "proof/android-device/",
      "proof/android-incomplete/",
      "check:mobai-proof-workflow` validates the MobAI worksheet/action contract",
      "npm run check:native-android -- --root .",
      "android.strict_receipt_adapter_required",
      "Never reconstruct or hand-author",
      "For mixed scope",
    ]) {
      assert(nativeProof.instructions.includes(branchTerm), `the Route Ladder must describe ${branchTerm}`);
    }
  });

  harness.check("validate: a knowledge-less business workflow fails while a machine workflow stays exempt", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ referenceIds: [] })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.no_knowledge"),
      `expected catalog_graph.workflow.no_knowledge, got: ${issues.map((i) => i.code).join(", ")}`,
    );

    const exempt = baseFixtureCatalog();
    exempt.areas = [
      { id: "area.product-experience", name: "Product And Experience", description: "fixture", domainIds: ["domain.research", "domain.machine"] },
    ];
    exempt.domains = [
      ...exempt.domains,
      { id: "domain.machine", slug: "machine", name: "Machine", areaIds: ["area.product-experience"], routeLabel: "Machine", routeWhen: "fixture", order: 99 },
    ];
    exempt.workflows = [baseWorkflow({ id: "workflow.machine.fixture", domainId: "domain.machine", referenceIds: [] })];
    const exemptIssues = validateCatalog(exempt, skillRoot);
    assert(
      !exemptIssues.some((issue) => issue.code === "catalog_graph.workflow.no_knowledge"),
      "a machine-domain workflow must stay exempt from the knowledge requirement",
    );
  });

  harness.check("validate: workflow providers must be executable by the assigned role", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ providerIds: ["provider.fixture"] })];
    // A fixture registry blesses provider.fixture so this case keeps exactly one defect (the
    // role capability), doubling as the clearing test for the injectable-registry rule.
    const issues = validateCatalog(catalog, skillRoot, { providerIds: ["provider.fixture"], deliberatelyUndeclared: [] });
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.role_capability_missing"),
      `expected catalog_graph.workflow.role_capability_missing, got: ${issues.map((i) => i.code).join(", ")}`,
    );
    assert(
      !issues.some((issue) => issue.code === "catalog_graph.workflow.provider_unknown"),
      "a registry-blessed provider id must not trip catalog_graph.workflow.provider_unknown",
    );
  });

  harness.check("validate: workflow providers must exist in the provider registry or its documented exceptions", () => {
    const failing = baseFixtureCatalog();
    // The role declares the capability so the only defect is the missing registry entry.
    failing.roles = failing.roles.map((role) => ({ ...role, capabilityIds: ["provider.not-registered"] }));
    failing.workflows = [baseWorkflow({ providerIds: ["provider.not-registered"] })];
    const failingIssues = validateCatalog(failing, skillRoot);
    assert(
      failingIssues.some((issue) => issue.code === "catalog_graph.workflow.provider_unknown"),
      `expected catalog_graph.workflow.provider_unknown, got: ${failingIssues.map((i) => i.code).join(", ")}`,
    );

    const cleared = validateCatalog(failing, skillRoot, { providerIds: ["provider.not-registered"], deliberatelyUndeclared: [] });
    assert(
      !cleared.some((issue) => issue.code === "catalog_graph.workflow.provider_unknown"),
      "registering the provider id must clear catalog_graph.workflow.provider_unknown",
    );
  });

  harness.check("validate: a deliberately-undeclared provider id no workflow references is flagged stale", () => {
    const catalog = baseFixtureCatalog();
    catalog.roles = catalog.roles.map((role) => ({ ...role, capabilityIds: ["provider.known"] }));
    catalog.workflows = [baseWorkflow({ providerIds: ["provider.known"] })];
    const registry = { providerIds: ["provider.known"], deliberatelyUndeclared: ["provider.ghost"] };
    const issues = validateCatalog(catalog, skillRoot, registry);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.provider.exception_stale"),
      `expected catalog_graph.provider.exception_stale, got: ${issues.map((i) => i.code).join(", ")}`,
    );

    // Referencing the exception id clears the staleness flag.
    const cleared = baseFixtureCatalog();
    cleared.roles = cleared.roles.map((role) => ({ ...role, capabilityIds: ["provider.known", "provider.ghost"] }));
    cleared.workflows = [
      baseWorkflow({ providerIds: ["provider.known"] }),
      baseWorkflow({ id: "workflow.research.fixture-ghost", title: "Fixture ghost", providerIds: ["provider.ghost"], outputPaths: [] }),
    ];
    const clearedIssues = validateCatalog(cleared, skillRoot, registry);
    assert(
      !clearedIssues.some((issue) => issue.code === "catalog_graph.provider.exception_stale"),
      "an exception id a workflow references must not be flagged stale",
    );

    // Scope guard: a catalog referencing no registry provider is never judged against the
    // exception list (minimal fixture catalogs stay one-defect-per-case).
    const unscoped = baseFixtureCatalog();
    const unscopedIssues = validateCatalog(unscoped, skillRoot, { providerIds: ["provider.known"], deliberatelyUndeclared: ["provider.ghost"] });
    assert(
      !unscopedIssues.some((issue) => issue.code === "catalog_graph.provider.exception_stale"),
      "the staleness rule must stay silent for a catalog that references no registry provider",
    );
  });

  harness.check("validate: workflow outputs must stay inside the assigned role's write scope", () => {
    const catalog = baseFixtureCatalog();
    catalog.artifacts = [{ id: "artifact.fixture.outside.md", path: "outside.md", ownerDomainId: "domain.research", laneIds: [], generated: false }];
    catalog.workflows = [baseWorkflow({ outputPaths: ["outside.md"] })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.role_output_out_of_scope"),
      `expected catalog_graph.workflow.role_output_out_of_scope, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: every dispatched role must inherit always-on founder-language knowledge", () => {
    const catalog = baseFixtureCatalog();
    catalog.roles[0]!.contextPackIds = [];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.role.founder_language_missing"),
      `expected catalog_graph.role.founder_language_missing, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a dangling reference id is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ dependencies: ["workflow.research.does-not-exist"] })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.unknown_dependency"),
      `expected catalog_graph.workflow.unknown_dependency, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a dangling domain reference on an area is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.areas = [{ id: "area.product-experience", name: "Product And Experience", description: "fixture", domainIds: ["domain.does-not-exist"] }];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.area.unknown_domain"),
      `expected catalog_graph.area.unknown_domain, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a workflow dependency cycle is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.artifacts = [
      { id: "artifact.fixture.a", path: "fixture/a.md", ownerDomainId: "domain.research", laneIds: [], generated: false },
      { id: "artifact.fixture.b", path: "fixture/b.md", ownerDomainId: "domain.research", laneIds: [], generated: false },
    ];
    catalog.workflows = [
      baseWorkflow({ id: "workflow.research.fixture-a", outputPaths: ["fixture/a.md"], dependencies: ["workflow.research.fixture-b"] }),
      baseWorkflow({ id: "workflow.research.fixture-b", outputPaths: ["fixture/b.md"], dependencies: ["workflow.research.fixture-a"] }),
    ];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      !issues.some((issue) => issue.code === "catalog_graph.workflow.ambiguous_write"),
      "this scenario should isolate the cycle defect, not also trip an unrelated ambiguous-write issue",
    );
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.cycle"),
      `expected catalog_graph.workflow.cycle, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: an always workflow cannot depend ambiguously on conditional work", () => {
    const catalog = baseFixtureCatalog();
    const conditional = baseWorkflow({
      id: "workflow.research.conditional",
      outputPaths: [],
      applicability: { mode: "conditional", question: "Is this work required?" },
    });
    const dependent = baseWorkflow({ id: "workflow.research.dependent", dependencies: [conditional.id], outputPaths: [] });
    catalog.workflows = [conditional, dependent];
    catalog.artifacts = [];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.conditional_dependency_ambiguous"),
      "expected conditional dependency error",
    );
  });

  harness.check("validate: two workflows declaring the same output is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.artifacts = [{ id: "artifact.fixture", path: "fixture.md", ownerDomainId: "domain.research", laneIds: [], generated: false }];
    catalog.workflows = [
      baseWorkflow({ id: "workflow.research.fixture-a", outputPaths: ["fixture.md"] }),
      baseWorkflow({ id: "workflow.research.fixture-b", outputPaths: ["fixture.md"] }),
    ];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.ambiguous_write"),
      `expected catalog_graph.workflow.ambiguous_write, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a reference with no load-when text is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.references = [{ ...catalog.references[0]!, title: "Fixture", loadWhen: "   " }];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.reference.load_when_missing"),
      `expected catalog_graph.reference.load_when_missing, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a reference pointing at a missing file is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.references = [{ ...catalog.references[0]!, path: "knowledge/research/does-not-exist.md", title: "Fixture", loadWhen: "fixture" }];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.reference.path_missing"),
      `expected catalog_graph.reference.path_missing, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  // ---------------------------------------------------------------------
  // catalog/validate.ts: the 2026-08 node-contract rules — every new gate is
  // exercised failing at least once here, never trusted green-by-vacuity.
  // ---------------------------------------------------------------------

  harness.check("validate: instructions under the 40-char floor are caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ instructions: "too short" })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.instructions_missing"),
      `expected catalog_graph.workflow.instructions_missing, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: instructions that merely echo the trigger are caught with the same issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [
      baseWorkflow({
        trigger: "a trigger sentence comfortably over the length floor for this scenario",
        instructions: "A trigger sentence comfortably over the length floor for this scenario",
      }),
    ];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.instructions_missing"),
      `expected catalog_graph.workflow.instructions_missing for a trigger echo, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a founderPhrasings array outside the 3-6 count bound (once non-empty) is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ founderPhrasings: ["only one phrasing", "and a second"] })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.founder_phrasing_count"),
      `expected catalog_graph.workflow.founder_phrasing_count for a 2-entry array, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: an over-length or empty founderPhrasing is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [
      baseWorkflow({
        founderPhrasings: ["a".repeat(81), "a short one", "another short one"],
      }),
    ];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.founder_phrasing_length"),
      `expected catalog_graph.workflow.founder_phrasing_length for an 81-character phrasing, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: two workflows sharing the same founderPhrasing (case-insensitively) are caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [
      baseWorkflow({
        id: "workflow.research.fixture-a",
        outputPaths: ["fixture/output-a.md"],
        founderPhrasings: ["Shared Founder Phrasing Here", "a distinct one", "another distinct one"],
      }),
      baseWorkflow({
        id: "workflow.research.fixture-b",
        outputPaths: ["fixture/output-b.md"],
        founderPhrasings: ["shared founder phrasing here", "a different distinct one", "yet another distinct one"],
      }),
    ];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.founder_phrasing_collision"),
      `expected catalog_graph.workflow.founder_phrasing_collision for a case-insensitive duplicate, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: an empty founderPhrasings array is always valid — not participating carries no defect", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ founderPhrasings: [] })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      !issues.some((issue) => issue.code.startsWith("catalog_graph.workflow.founder_phrasing_")),
      `expected zero founder_phrasing_* issues for an empty array, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: an unregistered roleId is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ roleId: "role.does-not-exist" })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.role_unknown"),
      `expected catalog_graph.workflow.role_unknown, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a workflow binding an unregistered reference is caught with a named issue code", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ referenceIds: ["reference.research.does-not-exist"] })];
    const issues = validateCatalog(catalog, skillRoot);
    assert(
      issues.some((issue) => issue.code === "catalog_graph.workflow.reference_unknown"),
      `expected catalog_graph.workflow.reference_unknown, got: ${issues.map((i) => i.code).join(", ")}`,
    );
  });

  harness.check("validate: a reference no workflow or context pack binds is caught, and sessionScoped clears it", () => {
    const catalog = baseFixtureCatalog();
    catalog.references.push({
      ...catalog.references[0]!,
      id: "reference.research.orphan",
      path: "README.md",
      title: "Orphan",
      loadWhen: "fixture",
      sessionScoped: false,
    });
    const unbound = validateCatalog(catalog, skillRoot);
    assert(
      unbound.some((issue) => issue.code === "catalog_graph.reference.unbound"),
      `expected catalog_graph.reference.unbound, got: ${unbound.map((i) => i.code).join(", ")}`,
    );
    catalog.references = catalog.references.map((reference) =>
      reference.id === "reference.research.orphan" ? { ...reference, sessionScoped: true } : reference,
    );
    const scoped = validateCatalog(catalog, skillRoot);
    assert(!scoped.some((issue) => issue.code === "catalog_graph.reference.unbound"), "sessionScoped: true should clear reference.unbound");
  });

  harness.check("validate: a read that nothing produces and the template does not ship is caught; an artifact-path read passes", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ reads: ["nowhere/does-not-exist.md"] })];
    const bad = validateCatalog(catalog, skillRoot);
    assert(
      bad.some((issue) => issue.code === "catalog_graph.workflow.read_unresolvable"),
      `expected catalog_graph.workflow.read_unresolvable, got: ${bad.map((i) => i.code).join(", ")}`,
    );
    catalog.workflows = [baseWorkflow({ reads: ["fixture/output.md"] })];
    const good = validateCatalog(catalog, skillRoot);
    assert(!good.some((issue) => issue.code === "catalog_graph.workflow.read_unresolvable"), "a declared artifact path must resolve as a read");
    catalog.workflows = [baseWorkflow({ reads: ["state/business-state.json"] })];
    const runtimeState = validateCatalog(catalog, skillRoot);
    assert(
      !runtimeState.some((issue) => issue.code === "catalog_graph.workflow.read_unresolvable"),
      "reducer-owned runtime state must resolve without a template file",
    );
    catalog.workflows = [baseWorkflow({ reads: ["b2c.yaml", "b2c.json"] })];
    const runtimeComposition = validateCatalog(catalog, skillRoot);
    assert(
      !runtimeComposition.some((issue) => issue.code === "catalog_graph.workflow.read_unresolvable"),
      "initialization-owned composition must resolve without a template file",
    );
  });

  harness.check("validate: a spend workflow without costEstimate is surfaced as a WARNING — the fail-closed park is the designed control, not a defect", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [baseWorkflow({ actionClass: "spend", protectedCategory: "spend", founderOnlyActions: ["approve spend"] })];
    const issues = validateCatalog(catalog, skillRoot);
    const found = issues.find((issue) => issue.code === "catalog_graph.workflow.cost_estimate_missing");
    assert(Boolean(found), `expected catalog_graph.workflow.cost_estimate_missing, got: ${issues.map((i) => i.code).join(", ")}`);
    assert(found!.severity === "warning", `cost_estimate_missing must be a warning (the park is the control), got severity ${found!.severity}`);
  });

  harness.check(
    "validate: a protected-class workflow without protectedCategory is caught — gates verify after the fact, the category authorizes before dispatch",
    () => {
      const catalog = baseFixtureCatalog();
      catalog.workflows = [baseWorkflow({ actionClass: "release", gateCommands: ["check:catalog"], founderOnlyActions: ["approve the release"] })];
      const naked = validateCatalog(catalog, skillRoot);
      assert(
        naked.some((issue) => issue.code === "catalog_graph.workflow.protected_category_missing"),
        `expected catalog_graph.workflow.protected_category_missing even with a gate and founder-only action present, got: ${naked.map((i) => i.code).join(", ")}`,
      );
      catalog.workflows = [baseWorkflow({ actionClass: "release", protectedCategory: "release" })];
      const categorized = validateCatalog(catalog, skillRoot);
      assert(
        !categorized.some((issue) => issue.code === "catalog_graph.workflow.protected_category_missing"),
        "naming the protected category clears the issue",
      );
    },
  );

  harness.check("validate: a knowledge file on disk with no CatalogReference is caught (disk-to-catalog sweep), and registering it clears the issue", () => {
    const tempSkillRoot = harness.makeTempDir("validate-knowledge-sweep");
    const knowledgeDir = path.join(tempSkillRoot, "knowledge", "research");
    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(path.join(knowledgeDir, "registered.md"), "# registered\n", "utf8");
    writeFileSync(path.join(knowledgeDir, "orphan.md"), "# orphan\n", "utf8");
    const catalog = baseFixtureCatalog();
    catalog.references = [
      {
        ...catalog.references[0]!,
        id: "reference.research.registered",
        path: "knowledge/research/registered.md",
        domainId: "domain.research",
        title: "Registered",
        loadWhen: "fixture",
        sessionScoped: true,
      },
    ];
    const swept = validateCatalog(catalog, tempSkillRoot);
    assert(
      swept.some((issue) => issue.code === "catalog_graph.reference.file_unregistered" && issue.path === "knowledge/research/orphan.md"),
      `expected catalog_graph.reference.file_unregistered for orphan.md, got: ${swept.map((i) => i.code).join(", ")}`,
    );
    catalog.references = [
      ...catalog.references,
      {
        ...catalog.references[0]!,
        id: "reference.research.orphan",
        path: "knowledge/research/orphan.md",
        domainId: "domain.research",
        title: "Orphan",
        loadWhen: "fixture",
        sessionScoped: true,
      },
    ];
    const registered = validateCatalog(catalog, tempSkillRoot);
    assert(!registered.some((issue) => issue.code === "catalog_graph.reference.file_unregistered"), "registering the file clears the sweep issue");
  });

  harness.check("validate: the real catalog composed from disk has zero structural errors", () => {
    const catalog = composeCatalog(skillRoot);
    const issues = validateCatalog(catalog, skillRoot).filter((issue) => issue.severity === "error");
    assert(issues.length === 0, `expected the real catalog to be clean, got: ${issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`);
    const composition = catalog.composition;
    assert(Boolean(composition), "composeCatalog must pin a composition fingerprint");
    const version = readFirstpartyPackage(skillRoot).snapshot.extension.version;
    assert(
      composition!.packs.length === 1 &&
        composition!.packs[0]!.id === "business-pack.consumer-business" &&
        composition!.packs[0]!.version === version &&
        composition!.packs[0]!.revision === version,
      "default graph must pin the exact verified firstparty business pack",
    );
    assert(
      Object.values(composition!.base).every((count) => count === 0),
      "all default semantics must come from the package, with an empty base",
    );
    const firstparty = composition!.deltas["business-pack.consumer-business"]!;
    assert(firstparty.domains === 15, `expected 15 firstparty domains, got ${firstparty.domains}`);
    assert(firstparty.workflows === 112, `expected 112 firstparty workflows, got ${firstparty.workflows}`);
    assert(firstparty.references === 145, `expected 145 firstparty references, got ${firstparty.references}`);
    const deltaWorkflows = Object.values(composition!.deltas).reduce((sum, delta) => sum + delta.workflows, 0);
    const deltaDomains = Object.values(composition!.deltas).reduce((sum, delta) => sum + delta.domains, 0);
    const deltaReferences = Object.values(composition!.deltas).reduce((sum, delta) => sum + delta.references, 0);
    assert(catalog.domains.length === composition!.base.domains + deltaDomains, "composed domain count must equal base plus pack deltas");
    assert(catalog.workflows.length === composition!.base.workflows + deltaWorkflows, "composed workflow count must equal base plus pack deltas");
    assert(catalog.references.length === composition!.base.references + deltaReferences, "composed reference count must equal base plus pack deltas");
    assert(/^[0-9a-f]{64}$/.test(composition!.fingerprint), "composition fingerprint must be a sha256 hex digest");

    const landingBuild = catalog.workflows.find((wf) => wf.id === "workflow.growth.pre-launch-funnel-landing-waitlist");
    const landingPublish = catalog.workflows.find((wf) => wf.id === "workflow.growth.landing-funnel-publication-and-live-proof");
    const appBuild = catalog.workflows.find((wf) => wf.id === "workflow.engineering.engineering-orchestration-ce-production-readiness");
    const appleSigning = catalog.workflows.find((wf) => wf.id === "workflow.store.apple-signing-and-release-readiness");
    assert(
      Boolean(landingBuild && landingPublish && appBuild && appleSigning),
      "expected local landing, landing publish, app build, and Apple signing workflows",
    );
    assert(
      appleSigning!.gateCommands.includes("check:apple-release-readiness"),
      "Apple signing and release readiness must fail closed on the strict Apple release validator",
    );
    const coverageAudit = catalog.workflows.find((wf) => wf.id === "workflow.process.launchbench-failure-cards-coverage-audit");
    assert(Boolean(coverageAudit), "expected LaunchBench / failure-cards coverage audit workflow");
    assert(
      coverageAudit!.gateCommands.length === 1 && coverageAudit!.gateCommands[0] === "launchbench:lint",
      "coverage-audit session verification is YAML lint only — the fixture suite must not run as a node gate",
    );
    const appReviewObserve = catalog.workflows.find((wf) => wf.id === "workflow.store.app-review-observe");
    const appReviewRemediate = catalog.workflows.find((wf) => wf.id === "workflow.store.app-review-remediate");
    const appReviewResubmit = catalog.workflows.find((wf) => wf.id === "workflow.store.app-review-resubmit");
    assert(Boolean(appReviewObserve), "expected App Review observe workflow");
    assert(Boolean(appReviewRemediate), "expected App Review remediate workflow");
    assert(Boolean(appReviewResubmit), "expected App Review resubmit workflow");
    assert(appReviewObserve!.actionClass === "observe", "App Review observe must stay observe-only");
    assert(appReviewRemediate!.actionClass === "mutate", "App Review Phase 3 remediates consumer-repo files");
    assert(appReviewResubmit!.actionClass === "mutate", "App Review Phase 4 records a capped submit");
    assert(appReviewRemediate!.dependencies.includes("workflow.store.app-review-observe"), "remediate depends on observe");
    assert(appReviewResubmit!.dependencies.includes("workflow.store.app-review-remediate"), "resubmit depends on remediate");
    assert(
      appReviewRemediate!.instructions.includes("asc review submit") &&
        appReviewRemediate!.instructions.includes("Never call") &&
        appReviewRemediate!.instructions.includes("new inspected archive"),
      "App Review remediate must forbid submit and require archive inspection for binary cases",
    );
    assert(
      appReviewResubmit!.instructions.includes("asc review submit --confirm") &&
        appReviewResubmit!.instructions.includes("standing envelope") &&
        appReviewResubmit!.instructions.includes("Never call `asc publish appstore --submit`") &&
        appReviewResubmit!.instructions.includes("already-uploaded"),
      "App Review resubmit must require an envelope, already-uploaded submit, and never publish",
    );
    assert(
      appReviewObserve!.instructions.includes("x-apple-signature") &&
        appReviewObserve!.instructions.includes("asc web review show") &&
        appReviewObserve!.instructions.includes("Never run `asc webhooks serve`") &&
        appReviewObserve!.instructions.includes("live `asc` provider") &&
        appReviewObserve!.instructions.includes("Archive each accepted envelope"),
      "App Review observe must verify signed webhooks, retrieve the web-session packet, poll the live provider, archive consumed envelopes, and keep webhooks serve fixture-only",
    );
    assert(appReviewObserve!.gateCommands.includes("check:app-review-contract"), "App Review observe must fail closed on the observe contract");
    assert(appReviewResubmit!.gateCommands.includes("check:app-review-contract"), "App Review resubmit must fail closed on the review contract");
    assert(
      appReviewObserve!.outputPaths.includes("run/app-review.json") && appReviewObserve!.outputPaths.includes("store/APP_REVIEW.md"),
      "App Review observe must declare durable state and the founder watch record as outputs",
    );
    assert(
      appleSigning!.dependencies.includes("workflow.store.apple-app-store-requirements-privacy-manifest") &&
        appleSigning!.reads.includes("store/APPLE_APP_STORE_REQUIREMENTS.md"),
      "Apple signing must wait for and read the App Store privacy requirements proof",
    );
    assert(
      landingBuild!.dependencies.includes("workflow.design.design-room") && appBuild!.dependencies.includes("workflow.design.design-room"),
      "local landing and app implementation must share the design-lock dependency",
    );
    assert(landingBuild!.actionClass !== "publish", "the local landing build must not be blocked by public-action approval");
    assert(landingPublish!.actionClass === "publish", "the live landing deployment must remain a protected public action");
    assert(
      landingPublish!.dependencies.includes("workflow.growth.pre-launch-funnel-landing-waitlist"),
      "the public landing workflow must depend on the local build",
    );
  });

  // ---------------------------------------------------------------------
  // catalog/bridge.ts: a catalog-owned domain must not disappear (U2 / KTD4)
  // ---------------------------------------------------------------------

  harness.check("bridge: a grantable catalog domain survives validation, bridge, grant lookup, budget mapping, and compile", () => {
    const catalog = withFoodProductDomain(baseFixtureCatalog());
    const issues = validateCatalog(catalog, skillRoot).filter((issue) => issue.severity === "error");
    assert(issues.length === 0, `food-product catalog must validate, got: ${issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
    assert(
      catalog.workflows.some((workflow) => workflow.id === "workflow.food.sku-contrast"),
      "the fixture catalog must carry the food-product workflow before the bridge",
    );

    let input: ReturnType<typeof toCatalogInput>;
    try {
      input = toCatalogInput(catalog);
    } catch (error) {
      assert(false, `food-product domain must not fail closed at the bridge: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const bridged = input.workflows.find((workflow) => workflow.id === "workflow.food.sku-contrast");
    assert(Boolean(bridged), "food-product workflow must survive toCatalogInput; a kernel-only grantable union drops it silently");
    assert(bridged!.domainId === "domain.food", "bridged food workflow must keep domain.food");

    const plan = compilePlan(input, "2026-08-05T00:00:00.000Z");
    assert(
      plan.nodes.some((node) => node.workflowId === "workflow.food.sku-contrast"),
      "compiled plan must include the food-product node",
    );

    const grants: GrantsMap = {
      "domain.food": foodGrant(),
    };
    const authority = resolveCatalogAuthority(catalog.domains);
    const ceiling = evaluateGrantCeiling(grants, "domain.food", "draft", { authority });
    assert(ceiling.ok, `grant lookup must accept a catalog-grantable domain.food, got ${ceiling.reasonCode}: ${ceiling.reason}`);
    assert(domainBusinessUnit("domain.food", authority) === "Operations", "budget mapping must follow the catalog operator group");
  });

  harness.check("bridge: an unknown domain fails closed instead of disappearing", () => {
    const catalog = baseFixtureCatalog();
    catalog.workflows = [
      baseWorkflow({
        id: "workflow.ghost.unknown-domain",
        domainId: "domain.ghost",
        outputPaths: ["fixture/ghost.md"],
      }),
    ];
    catalog.artifacts = [{ id: "artifact.ghost.md", path: "fixture/ghost.md", ownerDomainId: "domain.ghost", laneIds: [], generated: false }];
    let threw = false;
    try {
      const input = toCatalogInput(catalog);
      assert(
        !input.workflows.some((workflow) => workflow.id === "workflow.ghost.unknown-domain"),
        "unreachable: unknown-domain workflows must not be silently omitted",
      );
      assert(false, "toCatalogInput must fail closed on an unknown domain rather than dropping the workflow");
    } catch (error) {
      threw = true;
      const message = error instanceof Error ? error.message : String(error);
      assert(/unknown_domain|domain\.ghost/i.test(message), `unknown-domain refusal must name the domain, got: ${message}`);
    }
    assert(threw, "unknown domain must fail closed at the bridge");
    const ceiling = evaluateGrantCeiling({}, "domain.ghost", "observe");
    assert(!ceiling.ok && ceiling.reasonCode === "autonomy.unknown_domain", `grant lookup must refuse domain.ghost, got ${ceiling.reasonCode}`);
  });

  // ---------------------------------------------------------------------
  // catalog/bridge.ts: toCatalogInput() -> compile.ts compatibility
  // ---------------------------------------------------------------------

  harness.check("bridge: toCatalogInput() executes process/orchestration knowledge, excludes machine maintenance, and compiles", () => {
    const catalog = composeCatalog(skillRoot);
    const input = toCatalogInput(catalog);
    assert(input.workflows.length < catalog.workflows.length, "the bridged input should exclude maintenance-only machine workflows");
    const excludedCount = catalog.workflows.length - input.workflows.length;
    assert(excludedCount === 12, `expected exactly 12 excluded machine-domain workflows, got ${excludedCount}`);
    assert(
      input.workflows.some((workflow) => workflow.id === "workflow.process.change-cascade") &&
        input.workflows.some((workflow) => workflow.id === "workflow.orchestration.session-continuity-resume"),
      "process and orchestration knowledge must survive into the executable graph",
    );

    // Must not throw: proves no dangling dependency survived the domain filter and no
    // artifact-path collision survived either.
    const plan = compilePlan(input, "2026-08-05T00:00:00.000Z");
    assert(plan.nodes.length === input.workflows.length, "compiled plan should have one node per bridged workflow");
    const appleSigning = plan.nodes.find((node) => node.workflowId === "workflow.store.apple-signing-and-release-readiness");
    const appQuality = plan.nodes.find((node) => node.workflowId === "workflow.engineering.app-quality-and-vitals");
    assert(Boolean(appleSigning), "compiled plan should include Apple signing and release readiness");
    assert(Boolean(appQuality), "compiled plan should include app quality and vitals");
    assert(
      appleSigning!.verification.kind === "deterministic" && appleSigning!.verification.gateIds.includes("check:apple-release-readiness"),
      "Apple signing execution must carry check:apple-release-readiness as a deterministic gate",
    );
    const research = plan.nodes.find((node) => node.workflowId === "workflow.research.research-backed-spec");
    const localization = plan.nodes.find((node) => node.workflowId === "workflow.research.localization-market-research");
    assert(Boolean(research), "compiled plan should include research-backed-spec");
    assert(
      research!.dependencies.includes("run.operations.live-app-store-portfolio") &&
        research!.dependencies.includes("run.operations.paid-tool-routing-and-fallback"),
      "compiled research-backed-spec must wait for the portfolio observe and paid-tool routing nodes",
    );
    assert(
      localization!.dependencies.includes("run.research.research-backed-spec"),
      "compiled localization-market-research must wait for research-backed-spec",
    );
    const businessState = JSON.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8")) as BusinessStateV2;
    const run = seedRunState(plan, businessState, {
      ownerSessionId: "session.frontier-portfolio-hold",
      ttlSeconds: 3600,
      wallClockCapSeconds: 3600,
      now: "2026-09-08T00:00:00.000Z",
      runId: "run.frontier-portfolio-hold",
    });
    assert(run.nodes["run.operations.live-app-store-portfolio"]?.status !== "succeeded", "example workspace must not seed a succeeded portfolio observe");
    const frontier = computeFrontier(plan, run, businessState, allowAllAutonomyEvaluator);
    assert(
      !frontier.ready.includes("run.research.research-backed-spec"),
      "research-backed-spec must not enter the ready set while the portfolio observe has not succeeded",
    );
    assert(
      appleSigning!.dependencies.includes("run.store.apple-app-store-requirements-privacy-manifest") &&
        appleSigning!.inputs.includes("artifact.store-apple-app-store-requirements-md"),
      "compiled Apple signing execution must wait for the privacy workflow artifact",
    );
    assert(
      appQuality!.verification.kind === "fresh_context" && appQuality!.verification.gateIds.length === 0,
      "app quality must retain whole-artifact fresh-context acceptance rather than narrowing to an incomplete beta-only deterministic gate",
    );
    assert(
      /optional planning guidance/i.test(appQuality!.instructions ?? "") && /does not satisfy app-quality completion/i.test(appQuality!.instructions ?? ""),
      "the app-quality workflow must describe persona-balanced beta planning as optional non-proof",
    );
    const appQualityTemplate = readFileSync(path.join(skillRoot, "examples/workspace/business/engineering/APP_QUALITY.md"), "utf8");
    assert(
      /optional planning guidance/i.test(appQualityTemplate) && /does not satisfy app-quality completion/i.test(appQualityTemplate),
      "the app-quality starter must state that the optional beta worksheet is not completion proof",
    );
    assert(!/^\|\s*BETA-\d+/im.test(appQualityTemplate), "the optional beta worksheet must not ship prefilled tester rows that look like declared evidence");
  });

  harness.check("intake: full-launch research graph lists AppKittie and XPOZ; a secrets start does not", () => {
    const catalog = composeCatalog(skillRoot);
    const researchTools = deriveWorkflowIntakeTools(catalog, "workflow.research.research-backed-spec");
    assert(researchTools.includes("AppKittie"), `research-backed-spec intake must include AppKittie, got ${researchTools.join(", ")}`);
    assert(researchTools.includes("XPOZ"), `research-backed-spec intake must include XPOZ, got ${researchTools.join(", ")}`);
    assert(researchTools.includes("Firecrawl"), `research-backed-spec intake must include Firecrawl, got ${researchTools.join(", ")}`);
    assert(researchTools.includes("App Store Connect"), "complete-business research intake always adds App Store Connect");
    assert(researchTools.includes("live-app-store-portfolio"), "complete-business research intake always adds the live portfolio");
    const secretsTools = deriveWorkflowIntakeTools(catalog, "workflow.operations.secrets-baseline-and-routing");
    assert(!secretsTools.includes("XPOZ"), `a secrets-only start must not ask for XPOZ, got ${secretsTools.join(", ")}`);
    assert(!secretsTools.includes("AppKittie"), `a secrets-only start must not ask for AppKittie, got ${secretsTools.join(", ")}`);
    assert(!secretsTools.includes("App Store Connect"), "a focused secrets start omits ASC unless that graph names it");
  });

  harness.check("bridge: a business workflow retains its executable process dependency", () => {
    const catalog = composeCatalog(skillRoot);
    const designRoom = catalog.workflows.find((wf) => wf.id === "workflow.design.design-room");
    assert(Boolean(designRoom), "expected workflow.design.design-room to exist in the full catalog");
    assert(
      designRoom!.dependencies.includes("workflow.process.launch-trace-and-build-contracts"),
      "expected the full catalog to still carry the process-domain dependency edge (this is what validate.ts checks referential integrity against)",
    );
    const input = toCatalogInput(catalog);
    const bridged = input.workflows.find((wf) => wf.id === "workflow.design.design-room")!;
    assert(
      bridged.dependencies.includes("workflow.process.launch-trace-and-build-contracts"),
      "the bridged node must retain the process dependency that supplies its launch trace and build contract",
    );
  });

  harness.check("dispatch registry: every specialist is used; provider readiness does not gate local app and landing work", () => {
    const catalog = composeCatalog(skillRoot);
    const promptDir = path.join(skillRoot, "examples", "workspace", "business", "engineering", "app-agent-roster", "agents");
    const promptNames = readdirSync(promptDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.replace(/\.md$/, ""))
      .sort();
    const roleNames = catalog.roles.map((role) => path.basename(role.promptPath, ".md")).sort();
    assert(
      JSON.stringify(promptNames) === JSON.stringify(roleNames),
      `prepared prompts and catalog roles must match exactly: prompts=${promptNames.join(",")} roles=${roleNames.join(",")}`,
    );
    const unusedRoles = catalog.roles.filter((role) => !catalog.workflows.some((workflow) => workflow.roleId === role.id));
    assert(unusedRoles.length === 0, `every prepared specialist must own at least one workflow: ${unusedRoles.map((role) => role.id).join(",")}`);
    const readiness = catalog.workflows.find((workflow) => workflow.id === "workflow.operations.agent-operations-ledger")!;
    const app = catalog.workflows.find((workflow) => workflow.id === "workflow.engineering.engineering-orchestration-ce-production-readiness")!;
    const landing = catalog.workflows.find((workflow) => workflow.id === "workflow.growth.pre-launch-funnel-landing-waitlist")!;
    const publication = catalog.workflows.find((workflow) => workflow.id === "workflow.growth.landing-funnel-publication-and-live-proof")!;
    assert(readiness.roleId === "role.operator-readiness", "capability preflight must route to the prepared operator-readiness prompt");
    assert(
      !app.dependencies.includes(readiness.id) && !landing.dependencies.includes(readiness.id),
      "local app and landing work must continue while optional provider setup is held",
    );
    assert(
      publication.dependencies.includes(readiness.id),
      "live publication must wait for the one-pass capability preflight even before a provider is selected",
    );
    const unguardedExternalActions = catalog.workflows.filter(
      (workflow) => ["spend", "publish", "release"].includes(workflow.actionClass) && !workflow.dependencies.includes(readiness.id),
    );
    assert(
      unguardedExternalActions.length === 0,
      `every spend, publish, and release node must wait for readiness: ${unguardedExternalActions.map((workflow) => workflow.id).join(", ")}`,
    );
    const readinessBootstrap = new Set([
      readiness.id,
      "workflow.operations.paid-tool-routing-and-fallback",
      "workflow.operations.live-app-store-portfolio",
      "workflow.operations.secrets-baseline-and-routing",
    ]);
    const unguardedProviderWork = catalog.workflows.filter(
      (workflow) => workflow.providerIds.length > 0 && !readinessBootstrap.has(workflow.id) && !workflow.dependencies.includes(readiness.id),
    );
    assert(
      unguardedProviderWork.length === 0,
      `every provider-backed node must wait for readiness: ${unguardedProviderWork.map((workflow) => workflow.id).join(", ")}`,
    );
    assert(
      app.dependencies.includes("workflow.design.design-room") && landing.dependencies.includes("workflow.design.design-room"),
      "app and landing work must share the accepted design dependency so they can fan out together",
    );
  });

  harness.check("dispatch registry: prompts use the v2 state model, canonical artifact paths, and complete launch-surface nesting", () => {
    const catalog = composeCatalog(skillRoot);
    const promptRoot = path.join(skillRoot, "examples", "workspace", "business", "engineering", "app-agent-roster");
    const promptText = [
      path.join(promptRoot, "APP_AGENTS.md"),
      ...readdirSync(path.join(promptRoot, "agents")).map((name) => path.join(promptRoot, "agents", name)),
    ]
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    for (const stale of ["`APP_STORE_LISTING.md`", "`SCREENSHOTS.md`", "`CONTENT_ASSETS.md`", "`SECRETS.md`", "`11_STAR_EXPERIENCE.md`"]) {
      assert(!promptText.includes(stale), `prepared prompts must not reference stale or noncanonical path ${stale}`);
    }
    assert(promptText.includes("state/business-state.json"), "prepared prompts must use the canonical v2 state document");
    assert(promptText.includes(".b2c-launch/BUSINESS_CONTEXT.md"), "prepared prompts must preserve and load business-specific context");
    const producer = catalog.roles.find((role) => role.id === "role.launch-surface-producer")!;
    assert(producer.contextPackIds.includes("context.process"), "launch-surface work must load the executable change-process doctrine");
    for (const skillId of ["ios-screenshots", "pricing", "paywalls", "analytics", "video", "remotion", "usefastlane-ai"]) {
      assert(
        producer.skillRoutes.some((route) => route.id === skillId),
        `launch-surface producer must route nested skill ${skillId}`,
      );
    }
    for (const role of catalog.roles) {
      assert(role.contextPackIds.includes("context.founder-language"), `${role.id} must carry always-on founder-language knowledge`);
    }
  });

  // ---------------------------------------------------------------------
  // catalog/render-routing.ts: --check drift gate
  // ---------------------------------------------------------------------

  harness.check("render: --check is green against the freshly rendered real catalog", () => {
    harness.runScript("render-routing --check (clean)", "catalog/render-routing.ts", ["--check"], 0);
  });

  harness.check("render: contracts.md carries a real node contract and the provider route matrix", () => {
    const rendered = renderGeneratedFiles(composeCatalog(skillRoot))["catalog/generated/contracts.md"]!;
    assert(rendered.includes("# Node Contracts"), "contracts.md is missing its Node Contracts section");
    assert(
      rendered.includes("`provider.higgsfield` (mcp)"),
      "contracts.md should annotate provider.higgsfield with its declared mcp route on the nodes that touch it",
    );
    assert(
      /\| `provider\.higgsfield` \| ai-generated-marketing-visuals \| ✓ \|/.test(rendered),
      "the provider route matrix should mark provider.higgsfield's mcp column",
    );
    assert(rendered.includes("`provider.serve-sim` (local tooling"), "deliberately-undeclared ids should render as local tooling, not silently as unknown");
  });

  harness.check("render: --check fails on a mutated generated file — exercised against a scratch skill root, never the checked-in repo file", () => {
    // The old version of this check mutated the real, checked-in catalog/generated/routing.md
    // in place, restoring it in a `finally` — not SIGKILL-safe (a hard kill mid-test would leave
    // the repo's own generated file corrupted). Operate on a scratch copy instead.
    const tempSkillRoot = harness.makeTempDir("render-routing-check-drift");
    // The renderer reads authored manifests, knowledge, gate sources, and starter assets.
    // Copy that ordinary source closure; all generated mutation stays inside this temp root.
    for (const relative of [
      "catalog",
      "knowledge",
      "checks",
      "tooling",
      "kernel",
      "adapters",
      "contracts",
      "surfaces",
      "examples/workspace",
      "package.json",
      "skill-version.json",
    ]) {
      cpSync(path.join(skillRoot, relative), path.join(tempSkillRoot, relative), {
        recursive: true,
        filter: (source) =>
          !path
            .relative(skillRoot, source)
            .split(path.sep)
            .some(
              (part) =>
                ["node_modules", ".git", ".next", ".build", "build", "dist", "out", ".vercel", "test-results", "playwright-report"].includes(part) ||
                (part !== ".env.example" && (part === ".env" || part.startsWith(".env."))),
            ),
      });
    }

    // Write mode first: populates catalog/generated/{routing.md,spine.md,catalog.json} under the
    // scratch root with genuinely fresh, self-consistent content, so the "clean" baseline this
    // test then mutates was never hand-constructed or copied from the real repo.
    harness.runScript("render-routing (write, scratch root)", "catalog/render-routing.ts", ["--skill-root", tempSkillRoot], 0);

    const target = path.join(tempSkillRoot, "catalog", "generated", "routing.md");
    const original = readFileSync(target, "utf8");
    writeFileSync(target, `${original}\n<!-- fixture-mutation -->\n`, "utf8");
    // No try/finally restore needed: this is a scratch directory the harness deletes wholesale in
    // cleanup() — even a hard kill mid-test leaves the real checked-in file untouched.
    harness.runScript(
      "render-routing --check (mutated, scratch root)",
      "catalog/render-routing.ts",
      ["--skill-root", tempSkillRoot, "--check"],
      1,
      "catalog_render.generated_drift",
    );
  });

  // ---------------------------------------------------------------------
  // Port ledger: completeness (every v1 file exactly once, no TBD rows)
  // ---------------------------------------------------------------------

  // The ledger is a repository artifact under docs/, and an installed runtime ships no docs/ —
  // so from the runtime these four assert something that is not merely failing but absent.
  // Routed through the harness's skip so `npm run runtime:sync`, which verifies the runtime
  // inside the installed copy, stops reporting red for a reason no install could ever fix.
  // Dispatching on the case function rather than listing the labels twice keeps the skip list
  // from drifting away from the cases it is supposed to cover.
  const ledgerCase: (label: string, fn: () => void) => void =
    repoCheckoutPresent() && existsSync(resolvedLedgerPath)
      ? harness.check
      : (label) => harness.skip(label, `repo-only: no port ledger at ${resolvedLedgerPath} (an installed runtime ships no docs/)`);

  ledgerCase("port ledger: file exists and has no TBD rows", () => {
    const text = readFileSync(resolvedLedgerPath, "utf8");
    const tbdRowPattern = /^\|\s*(?:knowledge|validation)\/[^\s|]+\s*\|\s*TBD\s*\|/m;
    assert(!tbdRowPattern.test(text), "port ledger must not contain a row whose disposition column is TBD");
  });

  ledgerCase("port ledger: every surviving knowledge/**/*.{md,yaml,yml} file (excluding evals/fixtures dirs) appears exactly once", () => {
    const text = readFileSync(resolvedLedgerPath, "utf8");
    // U11 cutover executed every "drop" disposition, so those ledger rows now describe files
    // that no longer exist by design — the ledger is the historical record of the deletion,
    // not a live description of current file state. The completeness check is therefore scoped
    // to non-drop rows only; a "drop" row surviving on disk (or vice versa) is caught by the
    // ledger-drop execution itself, not this fixture.
    const ledgerRows = new Set(
      [...parseLedgerRowsWithDisposition(text)].filter((row) => row.path.startsWith("knowledge/") && row.disposition !== "drop").map((row) => row.path),
    );
    const onDisk = walkKnowledgeFiles(path.join(skillRoot, "knowledge"));
    // knowledge/README.md is the generated orientation stub render-routing.ts writes and
    // drift-checks — not ported content, so it never earns a ledger row (same class as the
    // generated projections under catalog/generated/).
    onDisk.delete("knowledge/README.md");
    assertOneToOne(onDisk, ledgerRows, "knowledge file");
  });

  ledgerCase(
    "port ledger: every surviving check:*/validate:* script (both package.json manifests) targeting checks/validation/business or checks/validation/repository appears exactly once, plus the one documented addition",
    () => {
      const text = readFileSync(resolvedLedgerPath, "utf8");
      // checks/validation/repository/check-skill-graph.ts is ledgered "port" (its referential-integrity +
      // drift-check PATTERN is preserved), but its "port" target is a wholesale mechanism
      // replacement in different files (catalog/validate.ts + catalog/render-routing.ts --check,
      // shipped in an earlier unit) rather than an in-place rewrite — and the original file's own
      // imports point at runtime/graph/*.ts, which U11 deletes. The cutover task explicitly names
      // it for deletion alongside the rest of the runtime/graph cull, so — unlike every other
      // "port" row, which stays at its path — this one is excluded here too.
      const portedAwayFromOriginalPath = new Set(["checks/validation/repository/check-skill-graph.ts"]);
      const ledgerRows = new Set(
        [...parseLedgerRowsWithDisposition(text)]
          .filter((row) => row.path.startsWith("checks/validation/") && row.disposition !== "drop" && !portedAwayFromOriginalPath.has(row.path))
          .map((row) => row.path),
      );
      const skillScripts = discoverValidatorScriptPaths(path.join(skillRoot, "package.json"));
      const rootScripts = discoverValidatorScriptPaths(path.join(repoRoot, "package.json")).map((p) => stripRepoPrefix(p));
      const validators = new Set<string>([...skillScripts, ...rootScripts]);
      // The one documented addition beyond the two literal buckets (see the ledger's own
      // "Scope and methodology" section).
      validators.add("checks/validation/repository/README.md");
      assertOneToOne(validators, ledgerRows, "validator/addition");
    },
  );

  ledgerCase("port ledger: disposition counts match the summary table's grand total", () => {
    const text = readFileSync(resolvedLedgerPath, "utf8");
    const rows = parseLedgerRowsWithDisposition(text);
    const counts = { keep: 0, port: 0, merge: 0, drop: 0 };
    for (const row of rows) counts[row.disposition] += 1;
    const summaryMatch = text.match(/\*\*Total\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*\s*\|\s*\*\*(\d+)\*\*/);
    assert(Boolean(summaryMatch), "expected a **Total** row in the summary table");
    const [, keep, port, merge, drop, total] = summaryMatch!.map(Number);
    assert(counts.keep === keep, `keep count mismatch: table rows=${counts.keep}, summary=${keep}`);
    assert(counts.port === port, `port count mismatch: table rows=${counts.port}, summary=${port}`);
    assert(counts.merge === merge, `merge count mismatch: table rows=${counts.merge}, summary=${merge}`);
    assert(counts.drop === drop, `drop count mismatch: table rows=${counts.drop}, summary=${drop}`);
    assert(rows.length === total, `total row count mismatch: parsed=${rows.length}, summary=${total}`);
  });

  harness.check(
    "profiles: the registry validates fail-closed — protected lanes, unknown lanes, duplicates, missing built-ins — and the schema enum never drifts from it",
    () => {
      // A profile that defers a protected lane must fail by name (launch-phases.md's rule made mechanical).
      const protectedDeferral = baseFixtureCatalog();
      protectedDeferral.profiles = [
        { id: "essentials", title: "E", description: "fixture", defersLaneKeys: ["revenue"] },
        { id: "full", title: "F", description: "fixture", defersLaneKeys: [] },
      ];
      const protectedIssues = validateCatalog(protectedDeferral, skillRoot);
      assert(
        protectedIssues.some((issue) => issue.code === "catalog_graph.profile.protected_lane_deferred"),
        `expected profile.protected_lane_deferred, got: ${protectedIssues.map((issue) => issue.code).join(", ")}`,
      );

      // Missing built-ins must fail: existing businesses record essentials/full as their scope.
      const missingBuiltin = baseFixtureCatalog();
      missingBuiltin.profiles = [{ id: "flagship", title: "X", description: "fixture", defersLaneKeys: [] }];
      const builtinIssues = validateCatalog(missingBuiltin, skillRoot);
      assert(
        builtinIssues.filter((issue) => issue.code === "catalog_graph.profile.builtin_missing").length === 2,
        `expected two builtin_missing errors, got: ${builtinIssues.map((issue) => issue.code).join(", ")}`,
      );

      // The REAL registry: valid, and the business-state schema's launchScope enum matches it
      // exactly — adding a profile without widening the schema (or vice versa) fails here, so the
      // reducer's fail-closed value check and the registry can never disagree.
      const real = composeCatalog(skillRoot);
      const realIssues = validateCatalog(real, skillRoot).filter((issue) => issue.code.startsWith("catalog_graph.profile."));
      assert(
        realIssues.length === 0,
        `the shipped profile registry must be clean, got: ${realIssues.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`,
      );
      const essentials = real.profiles.find((profile) => profile.id === "essentials")!;
      assert(
        [...essentials.defersLaneKeys].sort().join(",") === "email,growth,paid_user_acquisition",
        `essentials must defer exactly the wholly-breadth lanes, got: ${essentials.defersLaneKeys.join(", ")}`,
      );
      const schema = JSON.parse(readFileSync(path.join(skillRoot, "kernel", "schema", "business-state.schema.json"), "utf8")) as {
        properties: { project: { properties: { launchScope: { enum?: string[] } } } };
      };
      const schemaEnum = [...(schema.properties.project.properties.launchScope.enum ?? [])].sort();
      const registryIds = real.profiles.map((profile) => profile.id).sort();
      assert(
        schemaEnum.join(",") === registryIds.join(","),
        `business-state.schema.json launchScope enum [${schemaEnum.join(", ")}] must equal the profile registry [${registryIds.join(", ")}]`,
      );
    },
  );

  harness.check("repository profiles: shipped registry matches the schema enum and is not mixed with launch scope", () => {
    const catalog = composeCatalog(skillRoot);
    const profiles = catalog.repositoryProfiles ?? [];
    assert(profiles.length === repositoryProfileIds.length, `expected ${repositoryProfileIds.length} repository profiles, got ${profiles.length}`);
    const ids = profiles.map((profile) => profile.id).sort();
    assert(
      ids.join(",") === [...repositoryProfileIds].sort().join(","),
      `repository profile registry [${ids.join(", ")}] must equal schema ids [${[...repositoryProfileIds].sort().join(", ")}]`,
    );
    const schema = JSON.parse(readFileSync(path.join(skillRoot, "kernel", "schema", "business-state.schema.json"), "utf8")) as {
      properties: { project: { properties: { repositoryProfile?: { properties: { id: { enum?: string[] } } }; launchScope: { enum?: string[] } } } };
    };
    const schemaEnum = [...(schema.properties.project.properties.repositoryProfile?.properties.id.enum ?? [])].sort();
    assert(
      schemaEnum.join(",") === ids.join(","),
      `business-state.schema.json repositoryProfile.id enum [${schemaEnum.join(", ")}] must equal the repository profile registry [${ids.join(", ")}]`,
    );
    const launchEnum = [...(schema.properties.project.properties.launchScope.enum ?? [])];
    assert(
      !launchEnum.some((value) => (repositoryProfileIds as readonly string[]).includes(value)),
      "launchScope enum must not contain repository profile ids",
    );
    const generatedAsSource = validateCatalog(
      {
        ...catalog,
        repositoryProfiles: [...profiles.slice(0, -1), { ...profiles[profiles.length - 1]!, alwaysCanonical: ["state/generated/requirement-inventory.json"] }],
      },
      skillRoot,
    );
    assert(
      generatedAsSource.some((issue) => issue.code === "catalog_graph.repository_profile.generated_as_source"),
      "listing a generated path as canonical must fail catalog validation",
    );
  });

  harness.check("scaffolder: add-workflow inserts the seed, bumps the count fixture, and refuses duplicates and unknown vocabulary", () => {
    // A synthetic skill root carrying only what the scaffolder writes to: one workflow file and
    // the count fixture. --no-render because the synthetic root has no renderer; the real root's
    // render path is proven by the audit's own catalog:render-routing --check step.
    const scaffoldRoot = harness.makeTempDir("catalog-scaffold");
    const workflowsDir = path.join(scaffoldRoot, "catalog", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    writeFileSync(path.join(workflowsDir, "maintenance.ts"), readFileSync(path.join(skillRoot, "catalog", "workflows", "maintenance.ts")), "utf8");
    const fixtureRel = path.join("checks", "verification", "fixtures", "catalog.fixtures.ts");
    mkdirSync(path.dirname(path.join(scaffoldRoot, fixtureRel)), { recursive: true });
    writeFileSync(path.join(scaffoldRoot, fixtureRel), "assert(catalog.composition.base.workflows === 98, `expected base 98 workflows, got x`);\n", "utf8");

    const run = (args: string[]): { code: number; output: string } => {
      const result = spawnSync(resolveTsxBin(skillRoot), [path.join(skillRoot, "tooling", "catalog-scaffold.ts"), "add-workflow", ...args], {
        cwd: skillRoot,
        encoding: "utf8",
      });
      return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
    };
    const base = [
      "--skill-root",
      scaffoldRoot,
      "--no-render",
      "true",
      "--title",
      "Weekly changelog sweep",
      "--domain",
      "domain.machine",
      "--areas",
      "area.skill-maintenance",
      "--role",
      "role.orchestrator",
      "--trigger",
      "Weekly, when the changelog needs its operating sweep",
      "--file",
      "maintenance.ts",
      "--gates",
      "check:skill-version",
    ];

    const created = run(["--id", "workflow.machine.fixture-scaffold-sweep", ...base]);
    assert(created.code === 0, `scaffold must exit 0, got ${created.code}: ${created.output.slice(-400)}`);
    const written = readFileSync(path.join(workflowsDir, "maintenance.ts"), "utf8");
    assert(written.includes('"workflow.machine.fixture-scaffold-sweep"'), "the seed must be inserted into the chosen file");
    assert(written.trimEnd().endsWith("] as const;"), "the insertion must preserve the file's closing anchor");
    const bumped = readFileSync(path.join(scaffoldRoot, fixtureRel), "utf8");
    assert(
      bumped.includes("composition.base.workflows === 99") && bumped.includes("expected base 99 workflows"),
      `the count fixture must be bumped by one: ${bumped.trim()}`,
    );
    assert(created.output.includes("did NOT do"), "the scaffold must name what remains manual");

    const duplicate = run(["--id", "workflow.machine.fixture-scaffold-sweep", ...base]);
    assert(duplicate.code !== 0 && duplicate.output.includes("workflow.id_taken"), `a duplicate id must be refused by name, got exit ${duplicate.code}`);
    const badDomain = run([
      "--id",
      "workflow.machine.fixture-scaffold-two",
      ...base.map((entry, index) => (base[index - 1] === "--domain" ? "domain.does-not-exist" : entry)),
    ]);
    assert(badDomain.code !== 0 && badDomain.output.includes("Unknown domain"), `an unknown domain must be refused by name, got exit ${badDomain.code}`);
  });
}

function foodDomain(): CatalogDomain {
  return {
    id: "domain.food",
    slug: "food",
    name: "Food Product",
    areaIds: ["area.product-experience"],
    routeLabel: "Food product",
    routeWhen: "sku, recipe, and fulfillment contrast for a second business",
    order: 160,
    grantable: true,
    operatorGroup: "Operations",
    aliases: ["food-product"],
  };
}

function withFoodProductDomain(catalog: Catalog): Catalog {
  catalog.areas = catalog.areas.map((area) => (area.id === "area.product-experience" ? { ...area, domainIds: [...area.domainIds, "domain.food"] } : area));
  catalog.domains = [...catalog.domains, foodDomain()];
  catalog.workflows = [
    ...catalog.workflows,
    baseWorkflow({
      id: "workflow.food.sku-contrast",
      title: "Food SKU contrast",
      domainId: "domain.food",
      outputPaths: ["fixture/food-sku.md"],
    }),
  ];
  catalog.artifacts = [
    ...catalog.artifacts,
    { id: "artifact.food.sku.md", path: "fixture/food-sku.md", ownerDomainId: "domain.food", laneIds: [], generated: false },
  ];
  return catalog;
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

const PAID_TOOL_INTAKE_NEEDLES = [
  { id: "AppKittie", needles: ["AppKittie", "mcp__appkittie__"] },
  { id: "XPOZ", needles: ["XPOZ", "mcp__claude_ai_XPOZ__"] },
  { id: "Firecrawl", needles: ["Firecrawl"] },
  { id: "Higgsfield", needles: ["Higgsfield", "mcp__claude_ai_Higgsfield__"] },
  { id: "MobAI", needles: ["MobAI", "mcp__mobai__"] },
  { id: "Refero", needles: ["Refero", "refero_search"] },
] as const;

function workflowClosure(catalog: Catalog, startId: CatalogWorkflowDef["id"]): CatalogWorkflowDef[] {
  const byId = new Map(catalog.workflows.map((workflow) => [workflow.id, workflow]));
  const seen = new Set<string>();
  const ordered: CatalogWorkflowDef[] = [];
  const stack: CatalogWorkflowDef["id"][] = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const workflow = byId.get(id);
    if (!workflow) continue;
    ordered.push(workflow);
    for (const dependency of workflow.dependencies) stack.push(dependency);
  }
  return ordered;
}

function deriveWorkflowIntakeTools(catalog: Catalog, startId: CatalogWorkflowDef["id"]): string[] {
  const nodes = workflowClosure(catalog, startId);
  const texts: string[] = [];
  const referencesById = new Map(catalog.references.map((reference) => [reference.id, reference]));
  for (const workflow of nodes) {
    texts.push(workflow.instructions, workflow.trigger, ...workflow.consults, ...workflow.reads);
    for (const referenceId of workflow.referenceIds) {
      const reference = referencesById.get(referenceId);
      if (!reference) continue;
      texts.push(reference.path, reference.title, reference.loadWhen);
      const absolute = path.join(skillRoot, reference.path);
      if (existsSync(absolute) && /\.(md|ya?ml)$/.test(reference.path)) {
        texts.push(readFileSync(absolute, "utf8"));
      }
    }
  }
  const blob = texts.join("\n");
  const matched: string[] = PAID_TOOL_INTAKE_NEEDLES.filter((tool) => tool.needles.some((needle) => blob.includes(needle))).map((tool) => tool.id);
  const includesResearchHold = nodes.some(
    (workflow) => workflow.id === "workflow.research.research-backed-spec" || workflow.id === "workflow.operations.live-app-store-portfolio",
  );
  if (includesResearchHold) {
    if (!matched.includes("App Store Connect")) matched.push("App Store Connect");
    if (!matched.includes("live-app-store-portfolio")) matched.push("live-app-store-portfolio");
  }
  return matched;
}

// --- Port ledger parsing helpers --------------------------------------------------------

const ledgerRowPattern = /^\|\s*((?:knowledge|validation)\/[^\s|]+)\s*\|\s*(keep|port|merge|drop)\s*\|/;

function parseLedgerRowsWithDisposition(text: string): Array<{ path: string; disposition: "keep" | "port" | "merge" | "drop" }> {
  const rows: Array<{ path: string; disposition: "keep" | "port" | "merge" | "drop" }> = [];
  for (const line of text.split("\n")) {
    const match = line.match(ledgerRowPattern);
    if (match) rows.push({ path: match[1]!, disposition: match[2] as "keep" | "port" | "merge" | "drop" });
  }
  return rows;
}

/** Both arguments must already be filtered to the same namespace (e.g. only "knowledge/" or only "checks/validation/" paths). */
function assertOneToOne(onDisk: Set<string> | readonly string[], ledgerRows: Set<string>, label: string): void {
  const diskSet = onDisk instanceof Set ? onDisk : new Set(onDisk);
  const missingFromLedger = [...diskSet].filter((p) => !ledgerRows.has(p));
  const staleInLedger = [...ledgerRows].filter((p) => !diskSet.has(p));
  assert(missingFromLedger.length === 0, `${label}(s) on disk but missing from the ledger: ${missingFromLedger.join(", ")}`);
  assert(staleInLedger.length === 0, `${label}(s) in the ledger but not found by the completeness glob: ${staleInLedger.join(", ")}`);
}

const ignoredKnowledgeDirs = new Set(["evals", "fixtures", "node_modules", "dist"]);
const knowledgeExtensions = new Set([".md", ".yaml", ".yml"]);

function walkKnowledgeFiles(root: string): Set<string> {
  const results = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredKnowledgeDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && knowledgeExtensions.has(path.extname(entry.name))) {
        const relative = path.relative(skillRoot, path.join(dir, entry.name)).split(path.sep).join("/");
        results.add(relative);
      }
    }
  };
  walk(root);
  return results;
}

function discoverValidatorScriptPaths(packageJsonPath: string): string[] {
  const stat = statSync(packageJsonPath, { throwIfNoEntry: false });
  if (!stat) return [];
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const paths: string[] = [];
  for (const [name, script] of Object.entries(scripts)) {
    if (!(name.startsWith("check:") || name.startsWith("validate:"))) continue;
    const match = script.match(/((?:[\w./-]*\/)?(?:validation\/(?:business|repository)\/[^\s]+\.ts))/);
    if (match) paths.push(match[1]!);
  }
  return paths;
}

/** Since ADR-0002 the repo-root package.json is the package manifest; only a leading "./" can differ. */
function stripRepoPrefix(scriptPath: string): string {
  const prefix = "./";
  return scriptPath.startsWith(prefix) ? scriptPath.slice(prefix.length) : scriptPath;
}
