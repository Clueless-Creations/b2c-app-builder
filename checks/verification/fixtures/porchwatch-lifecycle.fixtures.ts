import { journeyWorkflowIds } from "../../../kernel/knowledge-service/journey.js";
import type { HostedKnowledgeBundle } from "../../../kernel/knowledge-service/types.js";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { routeUtterance } from "../../../kernel/session/route-utterance.js";
import { createBusiness, initializeBusiness, planBusiness } from "../../../kernel/services/lifecycle.js";
import { readWorkspaceStatus } from "../../../kernel/session/status.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import { loadProductInstanceDocument, productYamlPath } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(h: Harness): void {
  h.check("Porchwatch F1: closeout closure uses existing dependencies rather than all future operating work", () => {
    const bundle = JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"), "utf8")) as HostedKnowledgeBundle;
    const ids = journeyWorkflowIds(bundle.catalog, "workflow.orchestration.full-launch-closeout");
    assert(ids.includes("workflow.research.research-backed-spec") && ids.includes("workflow.design.design-system-audit"), "critical work excluded");
    assert(!ids.includes("workflow.store.app-review-observe"), "post-submission work became pre-submission acceptance");
    assert(ids.indexOf("workflow.research.research-backed-spec") < ids.indexOf("workflow.research.spec-red-team-audit"), "dependency order lost");
  });

  h.check("Porchwatch F1: a complete-business route retains program, phases and design continuation", () => {
    const result = routeUtterance({
      utterance: "Pick a consumer app business with real revenue and poorly rated incumbents, then design and build the complete app end to end.",
    });
    assert(result.kind === "primary" && result.mandate, "complete mandate was lost");
    assert(
      result.mandate.journey.phases.some((phase) => phase.title.includes("design")),
      "design is absent",
    );
    assert(result.mandate.journey.successors.includes("workflow.research.spec-red-team-audit"), "research continuation lost");
    assert(result.mandate.registrationRequired && !result.mandate.journey.businessComplete, "route accepted completion or writes");
    assert(!result.doNotLoad.includes("reference.process.artifact-contracts"), "artifact specification prohibited");
    const focused = routeUtterance({ utterance: "Research the market before we commit to building", mandateScope: "focused" });
    assert(focused.kind !== "primary" || !focused.mandate, "focused research expanded into a whole business");
  });
  h.check("Porchwatch F5/F6/F7: registered planning research resumes without fabricated runtime state", () => {
    const home = h.makeTempDir("porchwatch-home"),
      root = path.join(h.makeTempDir("porchwatch-business"), "research-001");
    const previous = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      createBusiness({ workspaceId: "research-001", directory: root, name: "Research workspace", hypothesis: "A complete consumer utility" });
      const before = workspaceRevision(root);
      writeFileSync(path.join(root, "strategy/RESEARCH.md"), "# Research\n\n## Source Ledger\nSaved query result: parcel trackers, observation one.\n");
      const plan = planBusiness({ workspaceId: "research-001", maxConcurrency: 1 });
      assert(plan.status === "not_initialized" && plan.resume?.artifacts[0]?.present, "planning evidence not exposed");
      assert(plan.revision !== before && !plan.completion.deliveryAccepted, "research changes ignored or business accepted");
      assert(readWorkspaceStatus(root).resume?.artifacts[0]?.contentSha256 === plan.resume.artifacts[0]?.contentSha256, "resume surfaces disagree");
      assert(readFileSync(path.join(root, "operations/LAUNCH_PROGRAM.md"), "utf8").includes("complete"), "durable mandate missing");
      assert(readFileSync(path.join(root, "operations/FOUNDER_BRIEF.md"), "utf8").includes("complete consumer business"), "canonical founder brief missing");
      const gate = spawnSync(
        process.execPath,
        ["--import", "tsx", "checks/validation/business/research/check-research-evidence.ts", "--root", root, "--require-workflow-outputs", "--json"],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(gate.status !== 0, "incomplete research accepted");
      assert(!`${gate.stdout}${gate.stderr}`.includes("project_state.missing"), "planning requires invented state");
      let refused = false;
      try {
        planBusiness({ workspaceId: "never-registered", maxConcurrency: 1 });
      } catch {
        refused = true;
      }
      assert(refused, "unregistered business operation accepted");
      writeFileSync(path.join(root, "catalog.json"), "{}");
      const corrupted = spawnSync(
        process.execPath,
        ["--import", "tsx", "checks/validation/business/research/check-research-evidence.ts", "--root", root, "--require-workflow-outputs", "--json"],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(`${corrupted.stdout}${corrupted.stderr}`.includes("project_state.missing"), "missing initialized state misclassified as planning");
      rmSync(path.join(root, "catalog.json"));
      mkdirSync(path.join(root, "state"));
      writeFileSync(path.join(root, "state/business-state.json"), "{}");
      const invalid = spawnSync(
        process.execPath,
        ["--import", "tsx", "checks/validation/business/research/check-research-evidence.ts", "--root", root, "--json"],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(`${invalid.stdout}${invalid.stderr}`.includes("project_state.invalid_schema"), "invalid state was ignored");
    } finally {
      if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previous;
    }
  });
  h.check("Porchwatch: absent-directory creation preserves the founder brief losslessly", () => {
    const home = h.makeTempDir("porchwatch-brief-home"),
      root = path.join(h.makeTempDir("porchwatch-brief-business"), "after-credits");
    const previous = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      const mandate = "Keep notification coverage and the performance-budget. Unicode café.\n";
      const created = createBusiness({
        workspaceId: "after-credits",
        directory: root,
        name: "After Credits",
        hypothesis: "A recap companion",
        mandate,
      });
      assert(created.sourceIntent.derivedViewEmbedsSource === false, "derived launch program claimed to be the source");
      assert(readFileSync(path.join(root, "operations/FOUNDER_BRIEF.md"), "utf8") === mandate, "founder brief was rewritten");
      assert(
        readFileSync(path.join(root, "operations/LAUNCH_PROGRAM.md"), "utf8").includes("notification coverage"),
        "derived launch program dropped the founder constraint",
      );
      const plan = planBusiness({ workspaceId: "after-credits", maxConcurrency: 1 });
      assert(plan.status === "not_initialized", "creation initialized the runtime");
      assert(plan.nextAction.includes("operations/FOUNDER_BRIEF.md"), "planning resume must name the canonical brief");
      assert(
        plan.resume?.artifacts.some((entry) => entry.path === "operations/FOUNDER_BRIEF.md" && entry.present),
        "planning resume omitted the founder brief",
      );
      assert(plan.founderIntent?.slice.includes("notification coverage"), "plan founderIntent dropped the founder constraint");
      assert(plan.founderIntent?.slice.includes("performance-budget"), "plan founderIntent dropped the performance-budget target");
    } finally {
      if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previous;
    }
  });
  h.check("Porchwatch: product acceptance and initialize stay separate", () => {
    const home = h.makeTempDir("porchwatch-accept-home"),
      root = path.join(h.makeTempDir("porchwatch-accept-business"), "accept-001");
    const previous = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      createBusiness({ workspaceId: "accept-001", directory: root, name: "Acceptance workspace", hypothesis: "A complete consumer utility" });
      const before = planBusiness({ workspaceId: "accept-001", maxConcurrency: 1 });
      const product = before.resume?.artifacts.find((entry) => entry.path === "product.yaml");
      assert(before.status === "not_initialized" && product?.present && product.acceptance === "not_evaluated", "product presence became acceptance");
      assert(before.nextAction.includes("product.yaml"), "planning resume omitted the product document");
      let refused = false;
      try {
        initializeBusiness({ workspaceId: "accept-001", expectedRevision: before.revision });
      } catch {
        refused = true;
      }
      assert(refused, "unaccepted product initialized the runtime");
      const file = productYamlPath(root),
        doc = parse(readFileSync(file, "utf8"));
      doc.meta.status = "accepted";
      writeFileSync(file, stringify(doc));
      writeFileSync(path.join(root, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(file)));
      const accepted = planBusiness({ workspaceId: "accept-001", maxConcurrency: 1 });
      const acceptedProduct = accepted.resume?.artifacts.find((entry) => entry.path === "product.yaml");
      assert(accepted.status === "not_initialized", "accepting the product initialized the runtime");
      assert(acceptedProduct?.acceptance === "not_evaluated", "resume treated product.yaml presence as accepted work");
      const productBytes = readFileSync(file);
      const rendered = readFileSync(path.join(root, "PRODUCT.md"));
      const initialized = initializeBusiness({ workspaceId: "accept-001", expectedRevision: accepted.revision });
      assert(initialized.status === "initialized" && initialized.authorityGranted === false, "initialize granted authority or failed");
      assert(readFileSync(file).equals(productBytes), "initialize rewrote accepted product.yaml");
      assert(readFileSync(path.join(root, "PRODUCT.md")).equals(rendered), "initialize rewrote PRODUCT.md");
      assert(workspaceRevision(root) !== accepted.revision, "initialize left the planning revision in place");
    } finally {
      if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previous;
    }
  });
  h.check("Porchwatch F2: new products render complete scope; legacy input cannot create competing scope owners", () => {
    const root = h.makeTempDir("porchwatch-product"),
      target = path.join(root, "product.yaml");
    const original = readFileSync(path.join(skillRoot, "surfaces/workspace-template/new-business/product.yaml"), "utf8");
    writeFileSync(target, original);
    const current = loadProductInstanceDocument(target);
    assert(renderProductMarkdown(current).includes("## Complete product scope"), "old scope heading retained");
    assert(!renderProductMarkdown(current).includes("V1"), "incomplete-product framing leaked");
    writeFileSync(target, original.replace("complete_scope:", "v1_boundary:"));
    assert(loadProductInstanceDocument(target).copy.completeScope === current.copy.completeScope, "legacy scope migration lost content");
    writeFileSync(target, original.replace("  requirements:", "  v1_boundary: conflicting scope\n  requirements:"));
    let refused = false;
    try {
      loadProductInstanceDocument(target);
    } catch {
      refused = true;
    }
    assert(refused, "conflicting scope owners accepted");
  });
}
