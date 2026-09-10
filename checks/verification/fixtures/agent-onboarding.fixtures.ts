import { PLANNING_ARTIFACT_BYTE_CAP } from "../../../kernel/session/planning-limits.js";
import { parseProductInstanceDocument } from "../../../catalog/ontology/instance-load.js";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { initializeProductFixture } from "./product-fixture.js";
import YAML from "yaml";
import { composeCatalog } from "../../../catalog/index.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { validateExecutableCatalog } from "../../../kernel/session/catalog-contract.js";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadRegistry,
  registerWorkspace,
  registryPath,
  removeWorkspace,
  hasWorkspaceScaffold,
  WORKSPACE_SCAFFOLD_BYTE_CAP,
} from "../../../adapters/registry.js";
import { inspectWorkspace } from "../../../kernel/session/inspect.js";
import { readWorkspaceStatus, renderWorkspaceStatus, renderWorkspaceStatusSummary } from "../../../kernel/session/status.js";
import { routeUtterance } from "../../../kernel/session/route-utterance.js";
import { createPlanningWorkspace } from "../../../kernel/session/new.js";
import { createBusiness } from "../../../kernel/services/lifecycle.js";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function isolated<T>(home: string, fn: () => T): T {
  const previous = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = home;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previous;
  }
}
const utterance = "Pick a consumer app business, then research, design and build the complete app end to end.";

export function register(h: Harness): void {
  h.check("onboarding: empty cwd routes to creation, and empty registration refuses without writing", () => {
    const root = h.makeTempDir("onboarding-empty");
    isolated(h.makeTempDir("onboarding-empty-home"), () => {
      const route = routeUtterance({ utterance, cwd: root, mandateScope: "complete_business" });
      assert(route.kind === "primary" || route.kind === "candidates", "complete-business route not found");
      assert(route.nextAgentAction.includes("b2c business-create --workspace"), "greenfield cwd did not route to creation");
      assert(!route.nextAgentAction.includes("workspaces register"), "greenfield route recommends registration");
      let refusal = "";
      try {
        registerWorkspace("fresh", root);
      } catch (error) {
        refusal = String(error);
      }
      assert(refusal.includes("registry.scaffold_missing") && refusal.includes("business-create"), "missing actionable scaffold refusal");
      assert(!existsSync(registryPath()) && loadRegistry().workspaces.length === 0, "refusal wrote registry state");
      const created = createBusiness({ workspaceId: "fresh", directory: root, name: "Fresh", hypothesis: "A consumer utility" });
      assert(created.status === "hypothesis" && loadRegistry().workspaces[0]?.id === "fresh", "refused registration poisoned subsequent creation");
      const status = readWorkspaceStatus(root);
      assert(
        renderWorkspaceStatus(status).includes("research and review") && !renderWorkspaceStatus(status).includes("bootstrap the workspace"),
        "planning status sends research to bootstrap",
      );
      assert(renderWorkspaceStatusSummary(status).startsWith("planning"), "workspace list mislabels planning state");
      const resumed = routeUtterance({ utterance, cwd: root, mandateScope: "complete_business" });
      assert(resumed.nextAgentAction.includes("Resume the registered business"), "created business does not resume");
    });
  });

  h.check("onboarding: an existing planning scaffold routes to adoption and preserves its files", () => {
    const root = path.join(h.makeTempDir("onboarding-adopt"), "workspace");
    isolated(h.makeTempDir("onboarding-adopt-home"), () => {
      createPlanningWorkspace({ directory: root, slug: "adopt", name: "Adopt", hypothesis: "An existing hypothesis" });
      const before = readFileSync(path.join(root, "product.yaml"), "utf8");
      const inspected = inspectWorkspace(root);
      assert(
        inspected.ok && inspected.registration.kind === "unregistered" && inspected.registration.suggestedFix.startsWith("b2c workspaces register"),
        "planning scaffold not adoptable",
      );
      const route = routeUtterance({ utterance, cwd: root, mandateScope: "complete_business" });
      assert(
        route.nextAgentAction.includes("b2c workspaces register") && !route.nextAgentAction.includes("business-create"),
        "planning scaffold routed to destructive recreation",
      );
      registerWorkspace("adopt", root);
      assert(readFileSync(path.join(root, "product.yaml"), "utf8") === before, "adoption changed product");
    });
  });

  h.check("onboarding: runtime adoption remains available but linked scaffold markers cannot authorize registration", () => {
    const runtime = h.makeTempDir("onboarding-runtime");
    const linked = h.makeTempDir("onboarding-linked");
    isolated(h.makeTempDir("onboarding-runtime-home"), () => {
      mkdirSync(path.join(runtime, "state"));
      writeFileSync(
        path.join(runtime, "state/business-state.json"),
        readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8"),
      );
      registerWorkspace("runtime", runtime);
      symlinkSync(path.join(runtime, "state"), path.join(linked, "state"));
      let refused = false;
      try {
        registerWorkspace("linked", linked);
      } catch (error) {
        refused = String(error).includes("registry.scaffold_missing");
      }
      assert(refused && loadRegistry().workspaces.length === 1, "symlinked ancestor admitted workspace");
    });
  });

  h.check("onboarding: coincident filenames and oversized markers do not adopt unrelated content", () => {
    const root = h.makeTempDir("onboarding-unrelated-markers");
    isolated(h.makeTempDir("onboarding-unrelated-home"), () => {
      writeFileSync(path.join(root, "product.yaml"), "name: Inventory item\nprice: 12\n");
      writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ products: [] }));
      assert(!hasWorkspaceScaffold(root), "unrelated product or catalog was accepted");
      const inspected = inspectWorkspace(root);
      assert(
        inspected.ok &&
          inspected.registration.kind === "unregistered" &&
          inspected.registration.suggestedFix.includes("--directory <empty-directory>") &&
          !inspected.registration.suggestedFix.includes(root),
        "occupied cwd suggested as empty creation target",
      );
      let refused = false;
      try {
        registerWorkspace("unrelated", root);
      } catch {
        refused = true;
      }
      assert(refused && loadRegistry().workspaces.length === 0, "unrelated directory was registered");
      writeFileSync(path.join(root, "product.yaml"), "x".repeat(WORKSPACE_SCAFFOLD_BYTE_CAP + 1));
      assert(!hasWorkspaceScaffold(root), "oversized marker accepted");
    });
  });

  h.check("onboarding: product adoption obeys the same byte bound as planning resume", () => {
    const root = h.makeTempDir("onboarding-product-limit");
    const product = readFileSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), "utf8") + "\n# " + "x".repeat(PLANNING_ARTIFACT_BYTE_CAP);
    parseProductInstanceDocument(YAML.parse(product));
    writeFileSync(path.join(root, "product.yaml"), product);
    isolated(h.makeTempDir("onboarding-product-limit-home"), () => {
      let refused = false;
      try {
        registerWorkspace("oversized-product", root);
      } catch {
        refused = true;
      }
      assert(refused && loadRegistry().workspaces.length === 0, "schema-valid product exceeded the planning reader limit after adoption");
    });
  });

  h.check("onboarding: canonical validation rejects near-valid and mixed invalid documents before registration", () => {
    const product = YAML.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), "utf8"));
    const invalidProduct = structuredClone(product);
    invalidProduct.instances = [{ id: "fake", class_id: "not-an-ontology-class", slots: {} }];
    const incompleteProduct = { schema_version: 1, meta: { name: "Almost", status: "hypothesis" }, copy: { promise_user_problem: "Almost" }, instances: [] };
    const invalidCatalog = { version: "x", artifacts: [], workflows: [{ id: "workflow.fake" }] };
    for (const [index, docs] of [
      { "catalog.json": invalidCatalog },
      { "catalog.json": { version: "x", artifacts: [], workflows: [] } },
      { "product.yaml": product, "catalog.json": { version: "x", artifacts: [], workflows: [] } },
      { "product.yaml": incompleteProduct },
      { "product.yaml": invalidProduct },
      { "product.yaml": product, "catalog.json": invalidCatalog },
      { "product.yaml": product, "state/business-state.json": { schemaVersion: "2.0.0", project: {}, lanes: {}, founderGates: {} } },
      { "product.yaml": product, "run/run-state.json": { schemaVersion: "1.0.0", runId: "run.fake", planId: "plan.fake", nodes: {} } },
    ].entries()) {
      const root = h.makeTempDir(`onboarding-invalid-${index}`);
      isolated(h.makeTempDir(`onboarding-invalid-home-${index}`), () => {
        for (const [relative, value] of Object.entries(docs)) {
          mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
          writeFileSync(path.join(root, relative), relative.endsWith(".yaml") ? YAML.stringify(value) : JSON.stringify(value));
        }
        assert(!hasWorkspaceScaffold(root), `invalid document combination ${index} accepted`);
        let refused = false;
        try {
          registerWorkspace("invalid", root);
        } catch {
          refused = true;
        }
        assert(refused && loadRegistry().workspaces.length === 0, `invalid combination ${index} changed registry`);
      });
    }
  });

  h.check("onboarding: structurally valid draft products retain ontology-readiness checks for later", () => {
    const root = h.makeTempDir("onboarding-draft-semantics");
    const product = YAML.parse(readFileSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), "utf8"));
    product.meta.status = "hypothesis";
    product.instances[0].class_id = "class.unresolved-draft-concept";
    writeFileSync(path.join(root, "product.yaml"), YAML.stringify(product));
    isolated(h.makeTempDir("onboarding-draft-semantics-home"), () => {
      registerWorkspace("draft", root);
      assert(loadRegistry().workspaces[0]?.id === "draft", "adoption imposed extra ontology readiness beyond the canonical loader");
    });
  });

  h.check("onboarding: a coherent catalog needs workspace identity before adoption", () => {
    const root = h.makeTempDir("onboarding-catalog-only");
    const catalog = toCatalogInput(composeCatalog(skillRoot));
    assert(validateExecutableCatalog(catalog) === undefined, "fixture is not a valid executable catalog");
    writeFileSync(path.join(root, "catalog.json"), JSON.stringify(catalog));
    isolated(h.makeTempDir("onboarding-catalog-only-home"), () => {
      let refused = false;
      try {
        registerWorkspace("catalog-only", root);
      } catch {
        refused = true;
      }
      assert(refused && loadRegistry().workspaces.length === 0, "work catalog alone was treated as a business identity");
      const inspected = inspectWorkspace(root);
      assert(
        inspected.ok && inspected.registration.kind === "unregistered" && !inspected.registration.suggestedFix.includes("workspaces register"),
        "catalog-only inspection suggested adoption",
      );
      mkdirSync(path.join(root, "state"));
      writeFileSync(
        path.join(root, "state/business-state.json"),
        readFileSync(path.join(skillRoot, "examples/workspace/business/state/business-state.json"), "utf8"),
      );
      registerWorkspace("legacy-business", root);
      assert(loadRegistry().workspaces[0]?.id === "legacy-business", "coherent catalog and legacy business identity were not adoptable");
    });
  });

  h.check("onboarding: real initialized catalog adoption and inspection preserve package read boundaries", () => {
    const root = h.makeTempDir("onboarding-initialized");
    isolated(h.makeTempDir("onboarding-initialized-home"), () => {
      initializeProductFixture(root, "Initialized adoption");
      const catalog = JSON.parse(readFileSync(path.join(root, "catalog.json"), "utf8"));
      registerWorkspace("initialized", root);
      assert(loadRegistry().workspaces[0]?.id === "initialized", "actual emitted initialized catalog could not be adopted");
      removeWorkspace("initialized");
      const workflow = catalog.workflows.find((entry: { selectedOperation?: unknown }) => entry.selectedOperation);
      assert(workflow, "initialized fixture did not contain a selected operation");
      const outside = h.makeTempDir("onboarding-outside-snapshot");
      writeFileSync(path.join(outside, "snapshot.json"), "{}");
      workflow.dependencies = [];
      workflow.selectedOperation.recipeSelection.packageDirectory = outside;
      catalog.workflows = [workflow];
      writeFileSync(path.join(root, "catalog.json"), JSON.stringify(catalog));
      const oldOpen = fs.openSync,
        oldRead = fs.readFileSync;
      let outsideReads = 0;
      const realOutside = fs.realpathSync(outside);
      const observe = (file: unknown) => {
        if (typeof file !== "string" && !Buffer.isBuffer(file) && !(file instanceof URL)) return;
        try {
          if (fs.realpathSync(file).startsWith(realOutside + path.sep)) outsideReads += 1;
        } catch {
          /* Missing files cannot expose snapshot bytes. */
        }
      };
      fs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
        observe(args[0]);
        return oldOpen(...args);
      }) as typeof fs.openSync;
      fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
        observe(args[0]);
        return oldRead(...args);
      }) as typeof fs.readFileSync;
      syncBuiltinESMExports();
      try {
        assert(hasWorkspaceScaffold(root), "pure marker shape inspection should recognize the catalog contract");
        const inspected = inspectWorkspace(root);
        assert(inspected.ok && inspected.registration.kind === "unregistered", "inspection changed registration classification");
        assert(outsideReads === 0, "read-only inspection followed selected package references");
        let refused = false;
        try {
          registerWorkspace("unsafe-selection", root);
        } catch {
          refused = true;
        }
        assert(refused && loadRegistry().workspaces.length === 0, "explicit adoption skipped executable validation");
        assert(outsideReads > 0, "outside-read trap was not armed for explicit selected package validation");
      } finally {
        fs.openSync = oldOpen;
        fs.readFileSync = oldRead;
        syncBuiltinESMExports();
      }
    });
  });

  h.check("onboarding: a pre-existing mistaken registration has public recovery and requires explicit removal", () => {
    const root = h.makeTempDir("onboarding-old-trap");
    const home = h.makeTempDir("onboarding-old-trap-home");
    isolated(home, () => {
      writeFileSync(
        registryPath(),
        JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "mistake", path: root, registeredAt: "2026-01-01T00:00:00.000Z" }] }),
      );
      registerWorkspace("mistake", root);
      assert(loadRegistry().workspaces.length === 1, "existing degraded registration cannot be re-registered");
      const before = readFileSync(registryPath(), "utf8");
      const input = { workspaceId: "mistake", directory: root, name: "Recovered", hypothesis: "A consumer utility" };
      const result = callPublicOperation("business.create", input);
      assert(!result.ok && result.error.message === "business.registration_conflict", "expected typed conflict");
      assert(!result.ok && result.error.recovery.includes("workspaces remove <id>"), "public envelope lost actionable recovery");
      assert(
        readFileSync(registryPath(), "utf8") === before && !existsSync(path.join(root, "product.yaml")),
        "conflict automatically changed old registration",
      );
      removeWorkspace("mistake");
      const recovered = callPublicOperation("business.create", input);
      assert(recovered.ok, "explicit address-only recovery cannot create business");
    });
  });

  h.check("onboarding: real CLI returns occupied-target recovery without changing existing content", () => {
    const root = h.makeTempDir("onboarding-occupied");
    const home = h.makeTempDir("onboarding-occupied-home");
    writeFileSync(path.join(root, "README.md"), "Existing user material\n");
    const cli = spawnSync(
      process.execPath,
      [
        "entrypoints/cli/b2c.mjs",
        "business-create",
        "--workspace",
        "occupied",
        "--directory",
        root,
        "--name",
        "Occupied",
        "--hypothesis",
        "A consumer utility",
        "--json",
      ],
      { cwd: skillRoot, encoding: "utf8", env: { ...process.env, B2C_APP_BUILDER_HOME: home } },
    );
    assert(cli.status === 1, `occupied target unexpectedly succeeded: ${cli.stdout}${cli.stderr}`);
    const result = JSON.parse(cli.stdout);
    assert(result.error.message === "business.target_occupied" && result.error.recovery.includes("new empty directory"), "CLI lost recovery text");
    assert(
      readFileSync(path.join(root, "README.md"), "utf8") === "Existing user material\n" && !existsSync(path.join(home, "workspaces.json")),
      "refusal changed files or registry",
    );
  });

  h.check("onboarding: business entry reaches create/status/plan before composition and maintainer architecture", () => {
    const skill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
    const buildAt = skill.indexOf("## Build a business");
    const composeAt = skill.indexOf("## Customize composition");
    const mobileAt = skill.indexOf("## Mobile app operation");
    assert(buildAt >= 0 && composeAt > buildAt, "skill teaches composition before the ordinary business path");
    assert(mobileAt > composeAt, "mobile capture precedes composition customization");
    assert(!/docs\/north-star-architecture|ARCH-\d+|docs\/architecture-conformance/.test(skill), "business skill requires maintainer architecture");
    const readme = readFileSync(path.join(skillRoot, "README.md"), "utf8");
    const startedAt = readme.indexOf("## Get started");
    const nextAt = readme.indexOf("\n## ", startedAt + 1);
    const started = readme.slice(startedAt, nextAt < 0 ? undefined : nextAt);
    const createAt = started.indexOf("b2c business-create");
    const catalogAt = started.indexOf("b2c catalog --json");
    assert(createAt >= 0 && catalogAt > createAt, "README Get started still leads with catalog discovery");
  });
}
