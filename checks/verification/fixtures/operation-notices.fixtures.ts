import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { snapshotPackage } from "../../../kernel/composition/resources.js";
import { resolveRecipeBindings } from "../../../kernel/composition/resolve.js";
import { rebaseSnapshotPacks } from "../../../catalog/packs/snapshots.js";
import { composeCatalog } from "../../../catalog/index.js";
import { toRecipeCatalogInput } from "../../../catalog/bridge.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { OperationRouteRegistry, type OperationRoute } from "../../../kernel/session/operation-routes.js";
import type { NodeExecutionContext } from "../../../kernel/session/executor.js";
import { skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("operation incorporation writes pinned notices and refuses tampering and unselected rights", () => {
    const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url)], { encoding: "utf8", timeout: 30_000 });
    assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  });
}

async function prove(): Promise<void> {
  const temporary = mkdtempSync(path.join(tmpdir(), "b2c-notice-route-"));
  try {
    const source = path.join(temporary, "source");
    cpSync(path.join(skillRoot, "examples/extensions/support-case"), source, { recursive: true });
    const extension = parse(readFileSync(path.join(source, "extension.yaml"), "utf8"));
    extension.resources.push(
      { id: "support-example/font", path: "font.bin", kind: "asset", mediaType: "font/woff2" },
      { id: "support-example/uncovered-font", path: "uncovered.bin", kind: "asset", mediaType: "font/woff2" },
      { id: "support-example/notice", path: "NOTICE.txt", kind: "notice", mediaType: "text/plain" },
    );
    extension.thirdParty = [
      {
        id: "support-example/font-rights",
        project: "Synthetic Typeface",
        upstream: "https://example.invalid/typeface",
        license: "MIT",
        copyright: "Copyright Synthetic Fixture",
        notice: "support-example/notice",
        covers: ["support-example/font"],
      },
    ];
    writeFileSync(path.join(source, "extension.yaml"), stringify(extension));
    writeFileSync(path.join(source, "font.bin"), "synthetic font fixture bytes; no rendering claim");
    writeFileSync(path.join(source, "uncovered.bin"), "synthetic uncovered font fixture");
    writeFileSync(path.join(source, "NOTICE.txt"), "Synthetic fixture license and copyright. Preserve this exact text.\n");
    const pack = parse(readFileSync(path.join(source, "pack.yaml"), "utf8"));
    pack.workflows[0].output_paths.push("support/notices.md");
    writeFileSync(path.join(source, "pack.yaml"), stringify(pack));
    const store = path.join(temporary, ".b2c-launch/packages");
    const dependencySource = path.join(temporary, "font-source");
    mkdirSync(dependencySource);
    const fontExtension = {
      apiVersion: "b2c.extension/v1",
      id: "font-example/package",
      version: "1.0.0",
      hostApiVersion: "b2c/v1",
      title: "Synthetic imported fonts",
      dependencies: [],
      imports: [],
      resources: [
        { id: "font-example/font", path: "font.bin", kind: "asset", mediaType: "font/woff2" },
        { id: "font-example/knowledge", path: "knowledge.md", kind: "knowledge", mediaType: "text/markdown" },
        { id: "font-example/hidden", path: "hidden.bin", kind: "asset", mediaType: "font/woff2" },
        { id: "font-example/notice", path: "NOTICE.txt", kind: "notice", mediaType: "text/plain" },
      ],
      capabilities: [],
      implementations: [],
      recipes: [],
      thirdParty: [
        {
          id: "font-example/rights",
          project: "Imported Synthetic Font",
          upstream: "https://example.invalid/imported-font",
          license: "MIT",
          copyright: "Copyright Synthetic Fixture",
          notice: "font-example/notice",
          covers: ["font-example/font", "font-example/hidden"],
        },
      ],
    };
    writeFileSync(path.join(dependencySource, "extension.yaml"), stringify(fontExtension));
    writeFileSync(path.join(dependencySource, "font.bin"), "synthetic imported font");
    writeFileSync(path.join(dependencySource, "knowledge.md"), "Imported expertise does not grant access to sibling resources.");
    writeFileSync(path.join(dependencySource, "hidden.bin"), "synthetic unimported font");
    writeFileSync(path.join(dependencySource, "NOTICE.txt"), "Imported synthetic notice.");
    const dependencySnapshot = snapshotPackage(dependencySource, store);
    extension.dependencies = [{ id: "font-example/package", version: "1.0.0" }];
    extension.imports = [{ package: { id: "font-example/package", version: "1.0.0" }, exports: ["font-example/font", "font-example/knowledge"] }];
    extension.capabilities[0].knowledge.push("font-example/knowledge");
    writeFileSync(path.join(source, "extension.yaml"), stringify(extension));
    const snapshot = snapshotPackage(source, store, [{ directory: path.join(store, dependencySnapshot.digest.slice(7)), snapshot: dependencySnapshot }]);
    const directory = path.join(store, snapshot.digest.slice(7));
    const packages = [
      { directory, snapshot },
      { directory: path.join(store, dependencySnapshot.digest.slice(7)), snapshot: dependencySnapshot },
    ];
    const selected = resolveRecipeBindings({
      packages,
      recipe: { packageId: "support-example/package", packageVersion: "1.0.0", recipeId: "support-example/loop" },
      target: { platform: "host", runtime: "node22" },
    });
    const catalog = composeCatalog(skillRoot, rebaseSnapshotPacks(temporary, packages));
    const node = compilePlan(toRecipeCatalogInput(catalog, selected)).nodes[0]!;
    const noticeId = node.outputs[node.outputPaths.indexOf("support/notices.md")]!;
    assert(
      node.selectedOperation!.resources.some((resource) => resource.id === "font-example/knowledge" && resource.packageDigest === dependencySnapshot.digest),
      "regression must include the dependency as a selected resource owner",
    );
    let calls = 0;
    const route: OperationRoute = {
      operation: "support-example/triage",
      implementationId: "support-example/fake",
      packageDigest: snapshot.digest,
      resultArtifactId: "artifact.support-result-json",
      receiptArtifactId: "artifact.support-receipt-json",
      noticeArtifactId: noticeId,
      incorporatedResources: [{ resourceId: "support-example/font", packageDigest: snapshot.digest }],
      maxReceiptAgeMs: 60_000,
      input: () => ({ caseId: "case-1", message: "Restore access." }),
      execute: async ({ idempotencyKey }) => {
        calls++;
        return {
          output: { caseId: "case-1", priority: "normal", draftResponse: "Restore your purchase to recover access." },
          evidence: { caseId: "case-1", requestKey: idempotencyKey, observedState: "triaged", transport: "fake" },
        };
      },
      observe: async () => true,
    };
    const context = (name: string): NodeExecutionContext => {
      const workspaceDir = path.join(temporary, name);
      mkdirSync(workspaceDir);
      cpSync(directory, path.join(workspaceDir, ".b2c-launch/packages", snapshot.digest.slice(7)), { recursive: true });
      return {
        workspaceDir,
        runId: `run.${name}`,
        attemptId: "attempt.1",
        now: "2026-09-05T00:00:00.000Z",
        skillRootDir: skillRoot,
        artifactPaths: Object.fromEntries(node.outputs.map((id, index) => [id, node.outputPaths[index]!])),
        heartbeat: () => {},
        authorization: {
          workflowId: node.workflowId,
          runId: `run.${name}`,
          attemptId: "attempt.1",
          executionIdentity: "worker.fixture",
          inputFingerprint: "fixture-input",
          evaluatedAt: "2026-09-05T00:00:00.000Z",
          actionClass: "draft",
          approvalRequirements: [],
          autonomy: { reasonCode: "fixture.authorized", evidenceRefs: [] },
        },
      };
    };
    const registry = new OperationRouteRegistry([route]);
    const good = context("good");
    const result = await registry.execute(node, good);
    assert.equal(result.status, "succeeded", result.error);
    const noticePath = path.join(good.workspaceDir, "support/notices.md");
    assert(readFileSync(noticePath, "utf8").includes("Synthetic fixture license and copyright. Preserve this exact text."));
    assert.equal(result.outputs.length, 3);
    assert.equal((await registry.execute(node, good)).status, "succeeded");
    assert.equal(calls, 1, "replay must not repeat effects");
    const changedIncorporation = new OperationRouteRegistry([
      { ...route, incorporatedResources: [...route.incorporatedResources!, { resourceId: "support-example/knowledge", packageDigest: snapshot.digest }] },
    ]);
    assert.match(
      (await changedIncorporation.execute(node, good)).error ?? "",
      /receipt_identity_mismatch/,
      "same notice text must not conceal changed incorporation declarations",
    );

    const verifyContext = {
      runId: good.runId,
      inputFingerprint: "fixture-input",
      workspaceDir: good.workspaceDir,
      skillRootDir: skillRoot,
      outputs: result.outputs,
      now: good.now,
    };
    assert.equal((await registry.verify(node, verifyContext)).status, "accepted");
    writeFileSync(noticePath, "forged notice");
    assert.match((await registry.execute(node, good)).error ?? "", /binary_artifact_mismatch/);
    const receiptPath = path.join(good.workspaceDir, "support/receipt.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.artifactDigests[noticeId] = createHash("sha256").update("forged notice").digest("hex");
    writeFileSync(receiptPath, JSON.stringify(receipt));
    assert.match((await registry.execute(node, good)).error ?? "", /notice_output_mismatch/);
    assert.match((await registry.verify(node, verifyContext)).error ?? "", /notice_output_mismatch/);
    for (const [name, resourceId, packageDigest, error] of [
      ["unknown", "support-example/absent", snapshot.digest, /unselected/],
      ["unowned", "support-example/font", "sha256:" + "a".repeat(64), /unselected/],
      ["uncovered", "support-example/uncovered-font", snapshot.digest, /rights_unknown/],
    ] as const) {
      const bad = new OperationRouteRegistry([{ ...route, incorporatedResources: [{ resourceId, packageDigest }] }]);
      assert.match((await bad.execute(node, context(name))).error ?? "", error);
    }
    assert.equal(calls, 1, "rights errors must precede callback effects");
    const hidden = new OperationRouteRegistry([
      { ...route, incorporatedResources: [{ resourceId: "font-example/hidden", packageDigest: dependencySnapshot.digest }] },
    ]);
    assert.match((await hidden.execute(node, context("hidden-import"))).error ?? "", /unselected/);
    const imported = new OperationRouteRegistry([
      { ...route, incorporatedResources: [{ resourceId: "font-example/font", packageDigest: dependencySnapshot.digest }] },
    ]);
    const importContext = context("valid-import");
    const importedResult = await imported.execute(node, importContext);
    assert.equal(importedResult.status, "succeeded", importedResult.error);
    assert(readFileSync(path.join(importContext.workspaceDir, "support/notices.md"), "utf8").includes("Imported synthetic notice."));

    const extra = new OperationRouteRegistry([
      {
        ...route,
        execute: async (request) => ({ ...(await route.execute(request)), artifacts: [{ artifactId: noticeId, bytes: Buffer.from("caller notice") }] }),
      },
    ]);
    assert.match((await extra.execute(node, context("extra"))).error ?? "", /binary_output_coverage_mismatch/);
    console.log(
      "PASS declared notice output, replay byte proof, forged digest refusal, unknown and unowned resources, font rights refusal, caller output refusal",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prove();
