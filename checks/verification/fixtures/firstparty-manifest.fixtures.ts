import { workerContextFingerprint } from "../../../kernel/composition/worker-context.js";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { validateExtension } from "../../../contracts/extensions/contract.js";
import { prepareKnowledgeReferences, verifyPackageRolePrompts } from "../../../kernel/session/executor.js";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { composeAuthoredCatalog } from "../../../catalog/authoring.js";
import { composeCatalog, composeCatalogFromPacks } from "../../../catalog/index.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { composePacks } from "../../../catalog/packs/compose.js";
import { loadSnapshotPacks, rebaseSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { readStoredSnapshot } from "../../../kernel/composition/resources.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import type { Catalog } from "../../../catalog/types.js";
import { type Harness, skillRoot } from "./_harness.js";

function withoutResource(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutResource);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => key !== "resource" && item !== undefined)
        .map(([key, item]) => [key, withoutResource(item)]),
    );
  return value;
}
export function register(harness: Harness): void {
  harness.check("firstparty worker recipe: every business responsibility pins its actual context and artifact owner", () => {
    const owner = readFirstpartyPackage(skillRoot),
      extension = owner.snapshot.extension,
      catalog = composeCatalog(skillRoot),
      input = toCatalogInput(catalog);
    const installed = harness.makeTempDir("firstparty-workspace");
    const directory = path.join(installed, ".b2c-launch/packages", owner.snapshot.digest.slice(7));
    cpSync(owner.directory, directory, { recursive: true });
    const rebased = composeCatalogFromPacks(extension.version, rebaseSnapshotPacks(installed, [{ directory, snapshot: owner.snapshot }]));
    const installedInput = toCatalogInput(rebased);
    const recipe = extension.recipes.find((recipe) => recipe.id === "b2c/complete-consumer-business")!;
    assert.equal(recipe.maturity, "implemented");
    assert.equal(recipe.workflows.length, 102);
    assert(recipe.workflows.every((id) => !id.startsWith("workflow.machine.")));
    for (const binding of recipe.operations) {
      assert.equal(binding.workflowIds.length, 1);
      const workflow = input.workflows.find((workflow) => workflow.id === binding.workflowIds[0])!;
      const implementation = extension.implementations.find((implementation) => implementation.id === binding.implementation)!;
      assert.equal(implementation.mode, "worker-artifact");
      assert.equal(
        implementation.workerContext!.contextFingerprint,
        workerContextFingerprint(installedInput.workflows.find((entry) => entry.id === workflow.id)!),
      );
      assert.equal(implementation.workerContext!.contextFingerprint, workerContextFingerprint(workflow));
      assert.deepEqual(implementation.workerContext!.providerIds, workflow.providerIds);
      assert.equal(implementation.workerContext!.instructions, workflow.instructions);
      assert.equal(binding.workflowContexts![0]!.instructions, "implementation");
      assert.deepEqual(implementation.targets, [{ platform: "host", runtime: "agent-cli" }]);
    }
  });
  harness.check("firstparty declarations: grouped provider owns operation implementations and experimental recipes cannot execute", () => {
    const owner = readFirstpartyPackage(skillRoot),
      extension = owner.snapshot.extension;
    assert(extension.providers?.some((provider) => provider.id === "b2c/revenuecat"));
    assert.equal(extension.implementations.filter((implementation) => implementation.provider === "b2c/revenuecat").length, 3);
    const selected = resolveRecipeBindings({
      packages: [owner],
      recipe: { packageId: extension.id, packageVersion: extension.version, recipeId: "b2c/subscription-app" },
      target: { platform: "ios", runtime: "swiftui" },
    });
    assert.equal(selected.status, "refused");
    assert(selected.reasonCodes.includes("binding.recipe_unavailable"));
    const changed = structuredClone(extension);
    changed.implementations[0]!.provider = "b2c/missing-provider";
    assert.throws(() => validateExtension(changed), /Unknown provider/);
    const unbound = structuredClone(extension);
    unbound.recipes.find((recipe) => recipe.id === "b2c/subscription-app")!.maturity = "implemented";
    assert.throws(() => validateExtension(unbound), /requires workflow mappings/);
  });
  harness.check("firstparty manifest: complete authored compiler contract survives the common loader", () => {
    const authored = composeAuthoredCatalog(skillRoot),
      loaded = composeCatalog(skillRoot);
    assert.deepEqual(withoutResource(toCatalogInput(loaded)), withoutResource(toCatalogInput(authored)));
    for (const field of [
      "areas",
      "domains",
      "phases",
      "lanes",
      "contextPacks",
      "profiles",
      "repositoryProfiles",
      "providerContracts",
      "gates",
      "artifacts",
      "roles",
      "references",
      "workflows",
    ] as const)
      assert.deepEqual(withoutResource(loaded[field]), withoutResource(authored[field]), field);
    assert.equal(loaded.composition?.packs.length, 1);
    assert.equal(loaded.composition?.base.workflows, 0);
    assert(loaded.roles.every((role) => role.contextOrigin === "workspace"));
  });
  harness.check("firstparty manifest: an imported copy follows the identical loader and rejects modified pinned bytes", () => {
    const root = harness.makeTempDir("firstparty-import");
    const source = path.join(skillRoot, "catalog/generated/firstparty");
    cpSync(source, root, { recursive: true });
    const digest = JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/firstparty-pin.json"), "utf8")).digest;
    const snapshot = readStoredSnapshot(root, digest);
    const imported = loadSnapshotPacks([{ directory: root, snapshot }]);
    const sourcePacks = loadSnapshotPacks([{ directory: source, snapshot }]);
    assert.deepEqual(imported, sourcePacks);
    const authored = composeAuthoredCatalog(skillRoot);
    const empty: Catalog = {
      ...authored,
      areas: [],
      domains: [],
      phases: [],
      lanes: [],
      roles: [],
      contextPacks: [],
      references: [],
      workflows: [],
      artifacts: [],
      gates: [],
      profiles: [],
      repositoryProfiles: [],
      providerContracts: [],
      composition: undefined,
    };
    const result = composePacks(empty, imported);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(withoutResource(toCatalogInput(result.catalog)), withoutResource(toCatalogInput(authored)));
    const reference = imported[0]!.references[0]!;
    writeFileSync(path.join(root, reference.path), "changed after selection");
    assert.throws(() => loadSnapshotPacks([{ directory: root, snapshot }]), /Pinned resource changed/);
  });
  harness.check("firstparty manifest: missing snapshot refuses with no authored fallback", () => {
    const root = harness.makeTempDir("firstparty-missing");
    cpSync(path.join(skillRoot, "skill-version.json"), path.join(root, "skill-version.json"));
    assert.throws(() => composeCatalog(root));
  });
  harness.check("firstparty manifest: dispatch refuses tampered and symlinked package knowledge", () => {
    const root = harness.makeTempDir("firstparty-dispatch");
    mkdirSync(path.join(root, "package"));
    const file = path.join(root, "package/reference.md"),
      bytes = "pinned expertise";
    writeFileSync(file, bytes);
    const reference = {
      path: "knowledge/reference.md",
      title: "Expertise",
      loadWhen: "always",
      resource: { path: "package/reference.md", sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, origin: "skill" as const },
    };
    const brief = () => ({ load: [structuredClone(reference)], route: [] });
    assert.equal(prepareKnowledgeReferences(brief(), root, root)["package/reference.md"], reference.resource.sha256);
    const roleNode = {
      role: {
        id: "role.fixture",
        name: "Fixture",
        promptPath: "package/reference.md",
        parentPromptPaths: [],
        contextPacks: [],
        skillRoutes: [],
        toolRoutes: [],
        promptResources: { "package/reference.md": reference.resource.sha256 },
      },
    };
    verifyPackageRolePrompts(roleNode, root);
    writeFileSync(file, "tampered");
    assert.throws(() => verifyPackageRolePrompts(roleNode, root), /role differs from pinned/);
    assert.throws(() => prepareKnowledgeReferences(brief(), root, root), /differs from pinned/);
    symlinkSync(path.join(root, "package"), path.join(root, "alias"));
    const linked = brief();
    linked.load[0]!.resource.path = "alias/reference.md";
    assert.throws(() => prepareKnowledgeReferences(linked, root, root), /Unsafe|symbolic|regular/);
  });
  harness.check("firstparty manifest: logical selectors bind exact immutable package bytes", () => {
    const catalog = composeCatalog(skillRoot),
      plan = compilePlan(toCatalogInput(catalog));
    const node = plan.nodes.find((node) => node.references?.length)!;
    const reference = node.references![0]!;
    const brief = composeNodeBrief(node, plan, { sourceIds: [reference.path] });
    assert(brief.load.length > 0);
    for (const entry of brief.load) {
      assert.equal(entry.path, reference.path);
      assert.equal(entry.resource?.origin, "skill");
      assert.match(entry.resource!.path, /^catalog\/generated\/firstparty\//);
      assert.equal(
        entry.resource!.sha256,
        `sha256:${createHash("sha256")
          .update(readFileSync(path.join(skillRoot, entry.resource!.path)))
          .digest("hex")}`,
      );
    }
  });
}
