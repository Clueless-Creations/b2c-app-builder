import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readWorkspaceStatus, renderWorkspaceStatus } from "../../../kernel/session/status.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import {
  loadWorkspaceCatalog,
  loadWorkspaceCatalogIfPresent,
  validateExecutableCatalog,
  validateOperatingCatalog,
} from "../../../kernel/session/catalog-contract.js";
import type { OperateWorld } from "../../../kernel/session/operating-types.js";
import { assert, type Harness, skillRoot } from "./_harness.js";

function catalog(gate = "check:product"): CatalogInput {
  return {
    version: "fixture.current.1",
    artifacts: [{ id: "artifact.product", path: "PRODUCT.md" }],
    workflows: [
      {
        id: "workflow.product",
        title: "Define product",
        domainId: "domain.product",
        actionClass: "draft",
        dependencies: [],
        outputPaths: ["PRODUCT.md"],
        providerIds: [],
        founderOnlyActions: [],
        gateCommands: [gate],
        laneIds: ["product"],
        idempotent: true,
      },
    ],
  };
}

function pin(root: string, value: unknown): string {
  const file = path.join(root, "catalog.json");
  writeFileSync(file, JSON.stringify(value), "utf8");
  return file;
}

export function register(harness: Harness): void {
  harness.check("catalog contract: CLI planning and execution refuse a different same-version catalog before any writes", () => {
    const root = harness.makeTempDir("catalog-single-owner"),
      original = catalog();
    pin(root, original);
    const alternative = catalog();
    alternative.workflows[0]!.gateCommands = [];
    alternative.workflows[0]!.actionClass = "observe";
    assert(validateExecutableCatalog(alternative) === undefined, "adversarial alternate catalog must be independently executable");
    assert(alternative.version === original.version, "version checks alone cannot distinguish this substitution");
    const alternate = path.join(root, "alternate.json");
    writeFileSync(alternate, JSON.stringify(alternative));
    const snapshot = () =>
      JSON.stringify(
        readdirSync(root)
          .sort()
          .map((name) => [name, readFileSync(path.join(root, name), "utf8")]),
      );
    const before = snapshot();
    for (const command of ["run", "plan"]) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(skillRoot, "entrypoints/cli/b2c.mjs"),
          command,
          "--workspace",
          root,
          "--catalog",
          alternate,
          ...(command === "run" ? ["--brief", "missing.json", "--session", "catalog-bypass", "--executor", "fixture"] : []),
        ],
        { cwd: skillRoot, encoding: "utf8", timeout: 30000 },
      );
      assert(result.status === 1, `${command} must refuse catalog substitution: ${result.stdout}${result.stderr}`);
      assert(
        `${result.stdout}${result.stderr}`.includes("unsupported_argument: --catalog"),
        `${command} must explain that only the workspace pin is supported`,
      );
      assert(snapshot() === before, `${command} refusal must create no attempts, locks, outputs or other state`);
    }
    const loaded = loadWorkspaceCatalog(root);
    assert(loaded.ok && loaded.catalog.workflows[0]!.gateCommands[0] === "check:product", "canonical gates must remain authoritative");
  });

  harness.check("catalog contract: interrupted erasure blocks catalog and hides prior status digest", () => {
    const root = harness.makeTempDir("catalog-erasure-incomplete");
    const file = pin(root, catalog());
    mkdirSync(path.join(root, "control"));
    mkdirSync(path.join(root, "run/digests"), { recursive: true });
    writeFileSync(path.join(root, "control/erasure-intent.json"), "{}");
    writeFileSync(path.join(root, "run/digests/private.md"), "private-observation-sentinel");
    const before = readFileSync(file, "utf8");
    for (const result of [loadWorkspaceCatalog(root), loadWorkspaceCatalogIfPresent(root)]) {
      assert(!result.ok && result.refusal.reason.includes("erasure.pending_transition"), "pending erasure must block all pin readers");
    }
    const status = readWorkspaceStatus(root);
    assert(status.state === "erasure_incomplete", "status must explicitly require recovery");
    assert(!JSON.stringify(status).includes("private-observation-sentinel"), "status must not return old evidence while erasing");
    assert(!renderWorkspaceStatus(status).includes("private-observation-sentinel"), "human status must not return old evidence");
    assert(readFileSync(file, "utf8") === before, "guard must not change active pin");
  });
  harness.check("catalog contract: incomplete composition activation refuses reads without writes", () => {
    const root = harness.makeTempDir("catalog-activation-incomplete");
    const file = pin(root, catalog());
    mkdirSync(path.join(root, ".b2c-launch"));
    const journal = path.join(root, ".b2c-launch/composition-activation.json");
    writeFileSync(journal, '{"status":"incomplete"}');
    const before = readFileSync(file, "utf8");
    for (const result of [loadWorkspaceCatalog(root), loadWorkspaceCatalogIfPresent(root)]) {
      assert(!result.ok && result.refusal.reason.includes("composition.activation_incomplete"), "pending activation must be resolved before reading the pin");
    }
    assert(readFileSync(file, "utf8") === before, "reader must not repair or repin the catalog");
    assert(readFileSync(journal, "utf8") === '{"status":"incomplete"}', "reader must preserve recovery metadata");
  });
  harness.check("catalog contract: an uninitialized workspace permits an absent pin without writes", () => {
    const root = harness.makeTempDir("catalog-uninitialized");
    const result = loadWorkspaceCatalogIfPresent(root);
    assert(result.ok && result.catalog === undefined, "fresh bootstrap must be able to install its first catalog");
    assert(readdirSync(root).length === 0, "reading an uninitialized workspace must not create files");
    assert(!loadWorkspaceCatalog(root).ok, "execution must require an installed pin");
  });

  harness.check("catalog contract: a managed workspace refuses a missing pin", () => {
    const root = harness.makeTempDir("catalog-missing-managed");
    mkdirSync(path.join(root, "state"));
    const state = path.join(root, "state", "business-state.json");
    writeFileSync(state, '{"fixture":"sentinel"}\n');
    const result = loadWorkspaceCatalogIfPresent(root);
    assert(!result.ok && result.refusal.reasonCode === "invalid_catalog", "a managed workspace must refuse missing catalog state");
    assert(readFileSync(state, "utf8") === '{"fixture":"sentinel"}\n', "refusal must preserve existing state");
  });

  harness.check("catalog contract: malformed and non-executable pins refuse without writes", () => {
    for (const value of [
      "{broken",
      JSON.stringify({ version: "fixture.current.1" }),
      JSON.stringify({ ...catalog(), workflows: [{ ...catalog().workflows[0], dependencies: ["workflow.missing"] }] }),
    ]) {
      const root = harness.makeTempDir("catalog-invalid");
      const file = path.join(root, "catalog.json");
      writeFileSync(file, value);
      assert(!loadWorkspaceCatalogIfPresent(root).ok, "optional loader must refuse a present invalid pin");
      assert(!loadWorkspaceCatalog(root).ok, "execution must refuse an invalid stored pin");
      assert(readFileSync(file, "utf8") === value, "refusal must preserve the invalid pin for repair");
    }
  });

  harness.check("catalog contract: symlink pins are refused", () => {
    const targetRoot = harness.makeTempDir("catalog-symlink-target");
    const target = pin(targetRoot, catalog());
    const root = harness.makeTempDir("catalog-symlink");
    symlinkSync(target, path.join(root, "catalog.json"));
    assert(!loadWorkspaceCatalogIfPresent(root).ok, "optional loader must refuse a symlink pin");
    assert(!loadWorkspaceCatalog(root).ok, "execution loader must refuse a symlink pin");
    assert(JSON.parse(readFileSync(target, "utf8")).version === "fixture.current.1", "refusal must preserve the target");
  });

  harness.check("catalog contract: current pin read preserves bytes and compiled gate changes refuse", () => {
    const root = harness.makeTempDir("catalog-current");
    const original = catalog();
    const file = pin(root, original);
    const before = readFileSync(file, "utf8");
    const loaded = loadWorkspaceCatalog(root);
    assert(loaded.ok && JSON.stringify(loaded.catalog) === JSON.stringify(original), "current pin must load unchanged");
    assert(validateExecutableCatalog(original) === undefined, "current executable catalog must validate");
    const world = { catalog: original, compositionPin: compilePlan(original).planId, runStatePath: path.join(root, "run", "run-state.json") } as OperateWorld;
    assert(validateOperatingCatalog(world) === undefined, "matching raw and compiled contracts must pass");
    assert(
      validateOperatingCatalog({ ...world, catalog: catalog("check:design") })?.reasonCode === "invalid_catalog",
      "same workflow IDs with different gates must refuse",
    );
    assert(readFileSync(file, "utf8") === before, "catalog checks must not rewrite the current pin");
    pin(root, catalog("check:design"));
    assert(validateOperatingCatalog(world)?.reasonCode === "invalid_catalog", "a changed durable pin must refuse the previously compiled world");
    assert(
      JSON.stringify(JSON.parse(readFileSync(file, "utf8"))) === JSON.stringify(catalog("check:design")),
      "mismatch refusal must preserve the changed pin",
    );
  });
}
