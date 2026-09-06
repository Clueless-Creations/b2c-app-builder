import test from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { createPlanningWorkspace } from "../../../kernel/session/new.js";
import { initializeWorkspace, type InitializationBoundary } from "../../../kernel/session/initialize.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import { readWorkspaceStatus } from "../../../kernel/session/status.js";
import { loadWorkspaceCatalog } from "../../../kernel/session/catalog-contract.js";
import { loadProductInstanceDocument } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
function setup() {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-initialization-")),
    workspace = path.join(temp, "app");
  createPlanningWorkspace({ directory: workspace, slug: "app", name: "Useful App", hypothesis: "A repeated consumer need" });
  const file = path.join(workspace, "product.yaml"),
    product = parse(readFileSync(file, "utf8"));
  product.meta.status = "accepted";
  writeFileSync(file, stringify(product));
  writeFileSync(path.join(workspace, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(file)));
  return { temp, workspace };
}
for (const boundary of ["intent", "bootstrap", "configuration", "activation-intent", "activation"] as InitializationBoundary[])
  test(`default initialization recovers an interruption after ${boundary} with one exact selected runtime`, () => {
    const env = setup();
    try {
      const revision = workspaceRevision(env.workspace);
      assert.throws(
        () =>
          initializeWorkspace(env.workspace, {
            expectedRevision: revision,
            afterWrite: (stage) => {
              if (stage === boundary) throw new Error("fixture interruption");
            },
          }),
        /fixture interruption/,
      );
      assert.equal(readWorkspaceStatus(env.workspace).state, "initialization_incomplete");
      assert(!loadWorkspaceCatalog(env.workspace).ok);
      const result = initializeWorkspace(env.workspace, { expectedRevision: revision });
      assert.equal(result.status, "initialized");
      assert(!existsSync(path.join(env.workspace, ".b2c-launch/initialization.json")));
      const catalog = loadWorkspaceCatalog(env.workspace);
      assert(catalog.ok);
      assert(
        catalog.catalog.workflows.length > 0 &&
          catalog.catalog.workflows.every((workflow) => workflow.selectedOperation?.recipeSelection.id === "b2c/complete-consumer-business"),
      );
      assert.deepEqual(JSON.parse(readFileSync(path.join(env.workspace, "control/control.json"), "utf8")).grants, {});
      assert.equal(initializeWorkspace(env.workspace, { expectedRevision: result.revision }).status, "already_initialized");
    } finally {
      rmSync(env.temp, { recursive: true, force: true });
    }
  });
test("forged completed stage and missing reducer state cannot clear an initialization intent", () => {
  const env = setup();
  try {
    assert.throws(() =>
      initializeWorkspace(env.workspace, {
        afterWrite: (stage) => {
          if (stage === "configuration") throw new Error("fixture interruption");
        },
      }),
    );
    const file = path.join(env.workspace, ".b2c-launch/initialization.json"),
      original = readFileSync(file, "utf8"),
      journal = JSON.parse(original);
    journal.stage = "activated";
    writeFileSync(file, JSON.stringify(journal));
    assert.throws(() => initializeWorkspace(env.workspace), /initialization_incomplete/);
    assert(existsSync(file));
    writeFileSync(file, original);
    const state = path.join(env.workspace, "state/business-state.json"),
      saved = readFileSync(state);
    rmSync(state);
    assert.throws(() => initializeWorkspace(env.workspace), /initialization_state_changed/);
    assert(existsSync(file));
    writeFileSync(state, saved);
    assert.equal(initializeWorkspace(env.workspace).status, "initialized");
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});
test("initialization refuses managed path and control directory symlinks without outside writes", () => {
  for (const relative of [".claude", "control"]) {
    const env = setup();
    try {
      const outside = path.join(env.temp, "outside");
      mkdirSync(outside);
      const sentinel = path.join(outside, "settings.json");
      writeFileSync(sentinel, "private sentinel");
      symlinkSync(outside, path.join(env.workspace, relative));
      assert.throws(() => initializeWorkspace(env.workspace));
      assert.equal(readFileSync(sentinel, "utf8"), "private sentinel");
      assert(!existsSync(path.join(outside, "session.lock")));
    } finally {
      rmSync(env.temp, { recursive: true, force: true });
    }
  }
});

test("optional research symlinks and FIFOs refuse before creating an initialization intent", () => {
  for (const mode of ["symlink", "fifo"]) {
    const env = setup();
    try {
      const research = path.join(env.workspace, "strategy/RESEARCH.md"),
        outside = path.join(env.temp, "private-research");
      mkdirSync(path.dirname(research), { recursive: true });
      writeFileSync(outside, "private sentinel");
      rmSync(research, { force: true });
      if (mode === "symlink") symlinkSync(outside, research);
      else assert.equal(spawnSync("mkfifo", [research]).status, 0);
      assert.throws(() => initializeWorkspace(env.workspace));
      assert(!existsSync(path.join(env.workspace, ".b2c-launch/initialization.json")));
      assert.equal(readFileSync(outside, "utf8"), "private sentinel");
    } finally {
      rmSync(env.temp, { recursive: true, force: true });
    }
  }
});
