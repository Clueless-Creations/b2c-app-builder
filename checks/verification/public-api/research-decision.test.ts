import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { recordResearchDecision } from "../../../kernel/services/research-decision.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import { loadProductInstanceDocument, productYamlPath } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";

function setup() {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-research-decision-"));
  return { temp, home: path.join(temp, "registry"), directory: path.join(temp, "app") };
}

test("research decision previews, applies once, and replays without duplicating the decision", () => {
  const env = setup();
  const previousHome = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const created = callPublicOperation("business.create", {
      workspaceId: "app",
      directory: env.directory,
      name: "Useful Habit",
      hypothesis: "A repeated consumer need",
    });
    assert(created.ok, JSON.stringify(created));
    writeFileSync(
      path.join(env.directory, "strategy/RED_TEAM_FINDINGS.md"),
      "# Red-team findings\n\n| Finding ID | Severity | Finding |\n| --- | --- | --- |\n| finding-a | medium | Narrow the audience. |\n",
    );
    const input = {
      workspaceId: "app",
      expectedRevision: workspaceRevision(env.directory),
      decisionId: "pivot-001",
      verdict: "Pivot" as const,
      rationale: "The wedge needs a narrower audience before any build work.",
      findingIds: ["finding-a"],
      apply: false,
    };
    const productBefore = readFileSync(path.join(env.directory, "product.yaml"), "utf8");
    const renderedBefore = readFileSync(path.join(env.directory, "PRODUCT.md"), "utf8");
    const unresolved = callPublicOperation("business.research.decision", { ...input, findingIds: ["finding-missing"] });
    assert(!unresolved.ok && unresolved.error.message.includes("finding_id_unresolved"), JSON.stringify(unresolved));
    assert.equal(readFileSync(path.join(env.directory, "product.yaml"), "utf8"), productBefore);
    const preview = callPublicOperation("business.research.decision", input);
    assert(preview.ok, JSON.stringify(preview));
    assert.equal(preview.data.applied, false);
    assert.equal(preview.data.initializationEligible, false);
    assert.equal(readFileSync(path.join(env.directory, "product.yaml"), "utf8"), productBefore);
    assert.equal(readFileSync(path.join(env.directory, "PRODUCT.md"), "utf8"), renderedBefore);

    const applied = callPublicOperation("business.research.decision", { ...input, apply: true });
    assert(applied.ok, JSON.stringify(applied));
    assert.equal(applied.data.applied, true);
    assert.equal(applied.data.replayed, false);
    const changedProduct = readFileSync(path.join(env.directory, "product.yaml"), "utf8");
    const renderedApplied = readFileSync(path.join(env.directory, "PRODUCT.md"), "utf8");
    assert(changedProduct.includes("b2c-research-decision:v1:pivot-001:"));
    assert(renderedApplied.includes("narrower audience"));

    const replay = callPublicOperation("business.research.decision", {
      ...input,
      expectedRevision: applied.data.revision,
      apply: true,
    });
    assert(replay.ok, JSON.stringify(replay));
    assert.equal(replay.data.replayed, true);
    assert.equal(replay.data.applied, false);
    assert.equal(readFileSync(path.join(env.directory, "product.yaml"), "utf8"), changedProduct);
    assert.equal((changedProduct.match(/b2c-research-decision:v1:pivot-001:/g) ?? []).length, 1);

    const interruptedInput = { ...input, decisionId: "pivot-003", expectedRevision: applied.data.revision, apply: true };
    assert.throws(
      () =>
        recordResearchDecision({
          ...interruptedInput,
          afterWrite: (boundary) =>
            boundary === "product" &&
            (() => {
              throw new Error("fixture interruption");
            })(),
        }),
      /fixture interruption/,
    );
    assert.throws(() => recordResearchDecision(interruptedInput), /stale_revision/);
    const recovered = recordResearchDecision({ ...interruptedInput, expectedRevision: workspaceRevision(env.directory) });
    assert.equal(recovered.replayed, true);
    assert(readFileSync(path.join(env.directory, "PRODUCT.md"), "utf8").includes("pivot-003"));

    assert.throws(
      () =>
        recordResearchDecision({
          ...input,
          expectedRevision: recovered.revision,
          rationale: "A changed payload must not reuse the old decision identity.",
          apply: true,
        }),
      /research_decision_id_reused/,
    );

    assert.throws(() => recordResearchDecision({ ...input, expectedRevision: applied.data.revision, apply: true }), /stale_revision/);

    writeFileSync(path.join(env.directory, "product.yaml"), `${productBefore}\nmeta: {}\n`);
    assert.throws(
      () =>
        recordResearchDecision({
          ...input,
          expectedRevision: workspaceRevision(env.directory),
          decisionId: "pivot-002",
          apply: true,
        }),
      /research_decision_product_invalid/,
    );
    const recoveredRendered = readFileSync(path.join(env.directory, "PRODUCT.md"), "utf8");
    assert(recoveredRendered.includes("b2c-research-decision:v1:pivot-003:"));
  } finally {
    if (previousHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previousHome;
    assert(!existsSync(path.join(env.directory, "control", "control.json")));
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("a Pivot checkpoint holds initialization until an explicit Go continuation is accepted", () => {
  const env = setup();
  const previousHome = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const created = callPublicOperation("business.create", {
      workspaceId: "app",
      directory: env.directory,
      name: "Useful Habit",
      hypothesis: "A repeated consumer need",
    });
    assert(created.ok, JSON.stringify(created));

    const pivot = callPublicOperation("business.research.decision", {
      workspaceId: "app",
      expectedRevision: workspaceRevision(env.directory),
      decisionId: "pivot-hold",
      verdict: "Pivot",
      rationale: "Narrow the audience before accepting a build direction.",
      findingIds: [],
      apply: true,
    });
    assert(pivot.ok, JSON.stringify(pivot));
    const held = callPublicOperation("business.plan", { workspaceId: "app" });
    assert(held.ok, JSON.stringify(held));
    assert.equal(held.data.status, "not_initialized");
    assert.equal(held.data.completion.deliveryAccepted, false);
    assert(!callPublicOperation("business.initialize", { workspaceId: "app", expectedRevision: held.data.revision }).ok);

    const go = callPublicOperation("business.research.decision", {
      workspaceId: "app",
      expectedRevision: held.data.revision,
      decisionId: "go-after-pivot",
      verdict: "Go",
      rationale: "The narrower audience now has a clear, testable wedge.",
      findingIds: [],
      apply: true,
    });
    assert(go.ok, JSON.stringify(go));
    const productPath = productYamlPath(env.directory);
    const product = parse(readFileSync(productPath, "utf8"));
    product.meta.status = "accepted";
    writeFileSync(productPath, stringify(product));
    writeFileSync(path.join(env.directory, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(productPath)));
    const initialized = callPublicOperation("business.initialize", {
      workspaceId: "app",
      expectedRevision: workspaceRevision(env.directory),
    });
    assert(initialized.ok, JSON.stringify(initialized));
    assert.equal(initialized.data.status, "initialized");
  } finally {
    if (previousHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previousHome;
    assert(existsSync(path.join(env.directory, "control", "control.json")));
    rmSync(env.temp, { recursive: true, force: true });
  }
});
