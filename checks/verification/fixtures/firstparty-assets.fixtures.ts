import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from "node:fs";
import path from "node:path";
import { firstpartyAssetClosure, FIRSTPARTY_ASSET_TREES } from "../../../catalog/packs/firstparty-assets.js";
import { readFirstpartyPackage } from "../../../catalog/packs/installed-firstparty.js";
import { inspectPackage, verifySnapshot } from "../../../kernel/composition/resources.js";
import { type Harness, skillRoot } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("firstparty assets: relocated knowledge links and runnable starter files resolve from pinned package bytes", () => {
    const initial = readFirstpartyPackage(skillRoot)
      .snapshot.extension.resources.filter((resource) => resource.kind === "knowledge" || resource.kind === "prompt")
      .map((resource) => resource.path);
    const files = [...initial, ...firstpartyAssetClosure(skillRoot, initial)];
    const root = harness.makeTempDir("firstparty-asset-relocation");
    for (const relative of files) {
      const target = path.join(root, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(path.join(skillRoot, relative)));
    }
    for (const relative of files.filter((file) => file.endsWith(".md"))) {
      for (const match of readFileSync(path.join(root, relative), "utf8").matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
        const href = match[1]!.trim().split("#")[0]!;
        if (!href || /^[a-z]+:/i.test(href)) continue;
        assert(existsSync(path.resolve(root, path.dirname(relative), href)), `${relative}: ${href}`);
      }
    }
    for (const tree of FIRSTPARTY_ASSET_TREES.filter((tree) => tree.startsWith("surfaces/starters/"))) {
      assert(files.includes(`${tree}/starter/package.json`), `runnable starter missing for ${tree}`);
      assert(files.includes(`${tree}/starter/.gitignore.template`), `distributable ignore rules missing for ${tree}`);
      assert(!files.includes(`${tree}/starter/.gitignore`), "npm cannot preserve a .gitignore resource");
      const rules = readFileSync(path.join(root, tree, "starter/.gitignore.template"), "utf8").split("\n");
      for (const rule of ["node_modules/", ".next/", "out/", ".env", ".env.*", "!.env.example", ".vercel", "*.tsbuildinfo"])
        assert(rules.includes(rule), `${tree} must preserve ${rule}`);
      assert(readFileSync(path.join(root, tree, "starter/README.md"), "utf8").includes("mv .gitignore.template .gitignore"));
    }
    assert(files.includes("surfaces/ui-library/components/interaction.press-feedback.md"));
    assert(!files.some((file) => file.startsWith("examples/tuck/") || file.includes("node_modules/")));
    writeFileSync(
      path.join(root, "extension.yaml"),
      JSON.stringify({
        apiVersion: "b2c.extension/v1",
        hostApiVersion: "b2c/v1",
        id: "fixture/asset-closure",
        version: "1.0.0",
        title: "Pinned source assets",
        dependencies: [],
        imports: [],
        resources: files.map((file, index) => ({ id: `fixture/asset-${index}`, path: file, kind: "asset", mediaType: "text/plain" })),
        capabilities: [],
        implementations: [],
        recipes: [],
      }),
    );
    const before = inspectPackage(root);
    const target = path.join(root, "surfaces/starters/ai-chat-companion/starter/package.json");
    writeFileSync(target, readFileSync(target, "utf8") + "\n");
    assert.throws(() => verifySnapshot(root, before), /changed|mismatch/i);
    assert.notEqual(inspectPackage(root).digest, before.digest, "asset changes must change the package pin");
  });
  harness.check("firstparty assets: traversal, missing linked assets and symlink sources refuse without copying caches", () => {
    const root = harness.makeTempDir("firstparty-asset-safety");
    for (const tree of FIRSTPARTY_ASSET_TREES) mkdirSync(path.join(root, tree), { recursive: true });
    mkdirSync(path.join(root, "knowledge"), { recursive: true });
    const guide = path.join(root, "knowledge/test.md");
    writeFileSync(guide, "[outside](../../outside.md)\n");
    assert.throws(() => firstpartyAssetClosure(root, ["knowledge/test.md"]), /outside_source_trees/);
    writeFileSync(guide, "[missing](missing.md)\n");
    assert.throws(() => firstpartyAssetClosure(root, ["knowledge/test.md"]), /ENOENT/);
    writeFileSync(guide, "# Guide\n");
    const starter = path.join(root, FIRSTPARTY_ASSET_TREES[0]);
    mkdirSync(path.join(starter, "node_modules"));
    writeFileSync(path.join(starter, "node_modules/untrusted.js"), "throw Error('not source')");
    for (const file of [".env", ".env.local", "next-env.d.ts", "cache.tsbuildinfo"]) writeFileSync(path.join(starter, file), "local-only synthetic data");
    for (const directory of ["out", ".vercel"]) {
      mkdirSync(path.join(starter, directory));
      writeFileSync(path.join(starter, directory, "local.json"), "local-only synthetic data");
    }
    assert.deepEqual(firstpartyAssetClosure(root, ["knowledge/test.md"]), []);
    symlinkSync(guide, path.join(starter, "linked.md"));
    assert.throws(() => firstpartyAssetClosure(root, ["knowledge/test.md"]), /asset_symlink/);
  });
}
