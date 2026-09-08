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
      writeFileSync(path.join(runtime, "state/business-state.json"), JSON.stringify({ schemaVersion: "2.0.0", project: {}, lanes: {}, founderGates: {} }));
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
}
