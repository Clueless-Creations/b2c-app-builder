import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import {
  COMPLETE_BUSINESS_RELATIVE_PATH,
  GRADING_BLOCKER_UNITS,
  PURCHASE_RESTORE_SCENARIO_ID,
  REQUIRED_CRITERION_IDS,
  REQUIRED_SCENARIO_IDS,
  DESIGN_ACCEPTANCE_RELATIVE_PATH,
  CompleteBusinessParseError,
  listCatalogReferenceIds,
  loadShippedCompleteBusinessDocument,
  parseCompleteBusinessMarkdown,
  shippedCompleteBusinessPath,
  validateCompleteBusinessAuthoring,
  type CompleteBusinessDocument,
} from "./complete-business-benchmark.fixture-helper.js";

function shippedMarkdown(): string {
  return readFileSync(shippedCompleteBusinessPath(skillRoot), "utf8");
}

function shippedDocument(): CompleteBusinessDocument {
  return loadShippedCompleteBusinessDocument(skillRoot);
}

function catalogIds(): Set<string> {
  return listCatalogReferenceIds(skillRoot);
}

function authoringIssues(document: CompleteBusinessDocument) {
  return validateCompleteBusinessAuthoring(document, {
    catalogReferenceIds: catalogIds(),
    allowPassVerdicts: false,
  });
}

export function register(harness: Harness): void {
  harness.check("complete-business: the authoring artifact exists outside the LaunchBench .ts registry", () => {
    assert(existsSync(shippedCompleteBusinessPath(skillRoot)), `${COMPLETE_BUSINESS_RELATIVE_PATH} must exist`);
    const registry = readFileSync(path.join(skillRoot, "checks/verification/fixtures/scenarios.fixtures.ts"), "utf8");
    assert(!registry.includes("complete-business"), "complete-business.md must not be wired into scenarios.fixtures.ts");
  });

  harness.check("complete-business: shipped frontmatter parses and stays ungraded", () => {
    const document = shippedDocument();
    const issues = authoringIssues(document);
    assert(issues.length === 0, issues.map((entry) => `${entry.code}: ${entry.message}`).join("\n"));
    assert(document.status === "criteria-frozen", "status must be criteria-frozen");
    assert(document.gradingStatus === "ungraded", "authoring gradingStatus must stay ungraded");
  });

  harness.check("complete-business: frozen criterion IDs are present and unique", () => {
    const document = shippedDocument();
    const ids = document.criteria.map((criterion) => criterion.id);
    assert(new Set(ids).size === ids.length, "criterion IDs must be unique");
    for (const required of REQUIRED_CRITERION_IDS) {
      assert(ids.includes(required), `missing frozen criterion ${required}`);
    }
  });

  harness.check("complete-business: each criterion cites a known category reference", () => {
    const document = shippedDocument();
    const referenceIds = new Set(document.categoryReferences.map((reference) => reference.id));
    for (const criterion of document.criteria) {
      assert(criterion.categoryReferenceIds.length > 0, `${criterion.id} needs a category reference`);
      for (const referenceId of criterion.categoryReferenceIds) {
        assert(referenceIds.has(referenceId), `${criterion.id} cites unknown ${referenceId}`);
      }
    }
  });

  harness.check("complete-business: catalog references resolve in catalog/knowledge", () => {
    const document = shippedDocument();
    const catalogReferenceIds = catalogIds();
    for (const reference of document.categoryReferences) {
      if (reference.kind !== "catalog") continue;
      assert(catalogReferenceIds.has(reference.id), `catalog is missing ${reference.id}`);
    }
  });

  harness.check("complete-business: reusable criteria have no example-business binding", () => {
    const document = shippedDocument();
    assert(document.designatedWorkspace === null, "workspace selection must be explicit");
    assert(
      document.categoryReferences.every((reference) => reference.kind === "catalog"),
      "shipped references must not bind a specific business",
    );
    assert(!/tuck/i.test(shippedMarkdown()), "example business must remain in examples");
  });

  harness.check("complete-business: verdict schema requires named reviewers and N/A reasons", () => {
    const schema = shippedDocument().verdictSchema;
    assert(schema.passRequiresNamedReviewer, "pass must require a named reviewer");
    assert(schema.failRequiresNamedReviewer, "fail must require a named reviewer");
    assert(schema.notApplicableRequiresReason, "not-applicable must require a reason");
    assert(schema.ungradedForbidsCompletionClaim, "ungraded must forbid a completion claim");
  });

  harness.check("complete-business: no shipped criterion or blocked scenario is pre-graded pass", () => {
    const document = shippedDocument();
    for (const criterion of document.criteria) {
      assert(criterion.verdict !== "pass", `${criterion.id} must not record pass in the authoring artifact`);
    }
    for (const scenario of document.scenarios) {
      if (scenario.id === PURCHASE_RESTORE_SCENARIO_ID) continue;
      assert(scenario.applicability === "ungraded", `${scenario.id} must stay ungraded`);
      for (const unit of GRADING_BLOCKER_UNITS) {
        assert((scenario.blockedBy ?? []).includes(unit), `${scenario.id} must list ${unit}`);
      }
    }
  });

  harness.check("complete-business: purchase applicability is unknown until a product is selected", () => {
    const document = shippedDocument();
    const scenario = document.scenarios.find((row) => row.id === PURCHASE_RESTORE_SCENARIO_ID);
    assert(scenario?.applicability === "ungraded", "unbound purchase must remain ungraded");
    scenario.applicability = "not-applicable";
    scenario.notApplicableReason = "Purchase is outside the accepted product scope.";
    assert(
      authoringIssues(document).some((entry) => entry.code === "complete_business.scenario.blocked_ungraded"),
      "unbound product cannot opt out of purchase",
    );
    document.designatedWorkspace = { id: "fixture-free", path: "/tmp/fixture-free", monetizationInScope: false };
    assert(authoringIssues(document).length === 0, "explicit free-product scope permits N/A");
    document.designatedWorkspace.monetizationInScope = true;
    assert(
      authoringIssues(document).some((entry) => entry.code === "complete_business.scenario.blocked_ungraded"),
      "paid product cannot inherit free-product N/A",
    );
  });

  harness.check("complete-business: design acceptance is workspace-relative and ungraded", () => {
    const gate = shippedDocument().designAcceptanceGate;
    assert(gate.path === DESIGN_ACCEPTANCE_RELATIVE_PATH, "gate must resolve within selected workspace");
    assert(gate.status === "ungraded", "unbound evidence is ungraded");
    assert(!gate.mayCiteAsPassing, "authoring cannot establish acceptance");
  });

  harness.check("complete-business: missing frontmatter fails closed", () => {
    try {
      parseCompleteBusinessMarkdown("# no frontmatter\n");
      assert(false, "expected parse to fail");
    } catch (error) {
      assert(error instanceof CompleteBusinessParseError, "parse must throw CompleteBusinessParseError");
      assert(error.code === "complete_business.frontmatter_missing", `unexpected ${error.code}`);
    }
  });

  harness.check("complete-business: a pre-graded pass fails authoring validation", () => {
    const document = structuredClone(shippedDocument());
    const criterion = document.criteria[0];
    assert(criterion !== undefined, "expected a criterion");
    criterion.verdict = "pass";
    criterion.reviewer = { name: "fixture-reviewer", sessionId: "session.fixture" };
    const issues = authoringIssues(document);
    assert(
      issues.some((entry) => entry.code === "complete_business.pregraded_pass"),
      `expected pregraded_pass, got ${issues.map((entry) => entry.code).join(", ")}`,
    );
  });

  harness.check("complete-business: a named failure also refuses grading in the authoring artifact", () => {
    const document = structuredClone(shippedDocument());
    document.criteria[0]!.verdict = "fail";
    document.criteria[0]!.reviewer = { name: "fixture-reviewer", sessionId: "session.fixture" };
    assert(
      authoringIssues(document).some((entry) => entry.code === "complete_business.pregraded_fail"),
      "authoring must refuse a graded failure",
    );
  });

  harness.check("complete-business: fail without a named reviewer fails closed", () => {
    const document = structuredClone(shippedDocument());
    const criterion = document.criteria[0];
    assert(criterion !== undefined, "expected a criterion");
    criterion.verdict = "fail";
    delete criterion.reviewer;
    const issues = authoringIssues(document);
    assert(
      issues.some((entry) => entry.code === "complete_business.named_reviewer"),
      `expected named_reviewer, got ${issues.map((entry) => entry.code).join(", ")}`,
    );
  });

  harness.check("complete-business: not-applicable without a reason fails closed", () => {
    const document = structuredClone(shippedDocument());
    const criterion = document.criteria[0];
    assert(criterion !== undefined, "expected a criterion");
    criterion.verdict = "not-applicable";
    delete criterion.notApplicableReason;
    const issues = authoringIssues(document);
    assert(
      issues.some((entry) => entry.code === "complete_business.not_applicable_reason"),
      `expected not_applicable_reason, got ${issues.map((entry) => entry.code).join(", ")}`,
    );
  });

  harness.check("complete-business: treating excluded purchase/restore as pass fails closed", () => {
    const document = structuredClone(shippedDocument());
    const scenario = document.scenarios.find((row) => row.id === PURCHASE_RESTORE_SCENARIO_ID);
    assert(scenario !== undefined, "purchase/restore scenario is missing");
    document.designatedWorkspace = { id: "fixture-free", path: "/tmp/fixture-free", monetizationInScope: false };
    scenario.applicability = "pass";
    scenario.reviewer = { name: "fixture-reviewer", sessionId: "session.fixture" };
    const issues = authoringIssues(document);
    assert(
      issues.some((entry) => entry.code === "complete_business.scenario.purchase_restore_not_applicable"),
      `expected purchase_restore_not_applicable, got ${issues.map((entry) => entry.code).join(", ")}`,
    );
  });

  harness.check("complete-business: dropping a frozen criterion id fails closed", () => {
    const document = structuredClone(shippedDocument());
    document.criteria = document.criteria.filter((criterion) => criterion.id !== REQUIRED_CRITERION_IDS[0]);
    const issues = authoringIssues(document);
    assert(
      issues.some((entry) => entry.code === "complete_business.criterion.missing"),
      `expected criterion.missing, got ${issues.map((entry) => entry.code).join(", ")}`,
    );
  });

  harness.check("complete-business: citing design-acceptance as pass fails closed", () => {
    const document = structuredClone(shippedDocument());
    document.designAcceptanceGate.status = "pass";
    document.designAcceptanceGate.mayCiteAsPassing = true;
    const issues = authoringIssues(document);
    assert(
      issues.some((entry) => entry.code === "complete_business.design_acceptance.cited_as_pass"),
      `expected cited_as_pass, got ${issues.map((entry) => entry.code).join(", ")}`,
    );
  });

  harness.check("complete-business: required unit-test scenario IDs stay stable", () => {
    const ids = shippedDocument().scenarios.map((scenario) => scenario.id);
    for (const required of REQUIRED_SCENARIO_IDS) {
      assert(ids.includes(required), `missing frozen scenario ${required}`);
    }
  });

  harness.check("complete-business: body states freeze-before-grade and does not register as .ts", () => {
    const body = shippedMarkdown();
    assert(body.includes("Criteria are frozen."), "body must state that criteria are frozen");
    assert(body.includes("No implementation is graded here."), "body must refuse a grading claim");
    assert(body.includes("Do not register it in `checks/verification/fixtures/scenarios.fixtures.ts`."), "body must keep the .md outside run.ts discovery");
  });
}
