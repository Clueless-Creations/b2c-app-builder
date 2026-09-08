import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { contentAssetDependencyPaths, validateContentAssetsV2 } from "../../../tooling/lib/content-assets.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "content-asset-contract-"));
  roots.push(root);
  // Synthetic bytes exercise declaration integrity only; they are not media or provider proof.
  writeFileSync(
    path.join(root, "DESIGN.md"),
    `---\nversion: revision-a\nfoundation:\n  version: 1\n  typographyResources:\n    - id: body\n      family: system-ui\n      mode: system\n---\n`,
  );
  writeFileSync(path.join(root, "capture.txt"), "synthetic source record");
  writeFileSync(path.join(root, "claims.md"), "The fixture displays one saved item.");
  const hash = (file: string) =>
    createHash("sha256")
      .update(readFileSync(path.join(root, file)))
      .digest("hex");
  const asset = {
    asset_id: "quiet-capture",
    surface: "landing",
    route: "new-provider-never-seen-before",
    status: "draft",
    production_kind: "generated",
    asset_kind: "still",
    dimensions: { width: 800, height: 600 },
    inputs: ["capture.txt"],
    outputs: ["out.png"],
    brief: {
      purpose: "Explain the saved-item task",
      placement: "Supporting landing illustration",
      kit: { path: "DESIGN.md", revision: "revision-a", sha256: hash("DESIGN.md"), assets: [{ path: "capture.txt", sha256: hash("capture.txt") }] },
      lineage: [{ path: "capture.txt", sha256: hash("capture.txt"), rights: "Original synthetic fixture" }],
      references: [
        {
          path: "capture.txt",
          sha256: hash("capture.txt"),
          roles: ["scene"],
          permitted_influence: ["lighting"],
          forbidden_transfers: ["identity"],
          rights: "Original synthetic fixture",
        },
      ],
      claims: [{ text: "Displays one saved item", source: "claims.md", sha256: hash("claims.md") }],
      allowed_variation: ["crop"],
      forbidden_changes: ["type family", "product claims"],
      contains_text: true,
      fonts: ["body"],
    },
    technique: {
      kind: "media",
      reason: "No spatial manipulation needed",
      renderer: { id: "selected-adapter", capabilities: ["still"] },
      required_capabilities: ["still"],
      fallback: { mode: "still", preserved_job: "Explain the saved item", limitations: "No interaction is represented" },
      proof_requirements: ["Inspect actual crop and text before acceptance"],
    },
  };
  return { root, hash, asset, manifest: { schema_version: "2", assets: [asset] } };
}

test("new providers receive the same structured-brief checks; legacy retains its validator", () => {
  const { root, manifest } = fixture();
  assert.deepEqual(validateContentAssetsV2(root, manifest), []);
  assert.deepEqual(validateContentAssetsV2(root, { schema_version: "1", assets: [{}] }), []);
  const broken = structuredClone(manifest) as any;
  delete broken.assets[0].brief;
  assert(validateContentAssetsV2(root, broken).some((item) => item.code.endsWith(".brief")));
});

test("kit revision and kit bytes fail independently", () => {
  const { root, manifest, asset } = fixture();
  asset.brief.kit.revision = "old";
  assert(validateContentAssetsV2(root, manifest).some((item) => item.code.endsWith("kit.revision")));
  asset.brief.kit.revision = "revision-a";
  writeFileSync(path.join(root, "DESIGN.md"), readFileSync(path.join(root, "DESIGN.md"), "utf8") + "Changed identity\n");
  assert(validateContentAssetsV2(root, manifest).some((item) => item.code.endsWith("kit.stale")));
});

test("source, kit-asset and claim changes invalidate briefs", () => {
  const { root, manifest } = fixture();
  writeFileSync(path.join(root, "capture.txt"), "different source bytes");
  writeFileSync(path.join(root, "claims.md"), "Different product fact");
  const codes = validateContentAssetsV2(root, manifest).map((item) => item.code);
  for (const prefix of ["kit.assets.0", "lineage.0", "references.0", "claims.0"])
    assert(
      codes.some((code) => code.endsWith(`${prefix}.stale`)),
      prefix,
    );
});

test("font ownership and reference roles block declared identity drift", () => {
  const { root, manifest, asset } = fixture();
  asset.brief.fonts = ["borrowed-display"];
  asset.brief.references[0]!.permitted_influence = ["typography"];
  const codes = validateContentAssetsV2(root, manifest).map((item) => item.code);
  assert(codes.some((code) => code.endsWith("fonts.unowned")));
  assert(codes.some((code) => code.endsWith("identity_override")));
});

test("missing required layer and unsupported renderer are explicit failures", () => {
  const { root, manifest, asset } = fixture();
  asset.technique.kind = "layered_2_5d";
  asset.technique.required_capabilities = ["timeline"];
  (asset as any).compositing = {
    alignment: "shared frame",
    camera: "front",
    lighting: "shared",
    mobile_variant: "stacked sequence",
    required_layers: ["foreground"],
    layers: [],
  };
  const codes = validateContentAssetsV2(root, manifest).map((item) => item.code);
  assert(codes.some((code) => code.endsWith("unsupported_renderer")));
  assert(codes.some((code) => code.endsWith("required_layer_missing")));
});

test("static media cannot declare itself the required interactive 3D experience", () => {
  const { root, manifest, asset } = fixture();
  asset.technique.kind = "real_3d";
  const codes = validateContentAssetsV2(root, manifest).map((item) => item.code);
  assert(codes.some((code) => code.endsWith("real_3d")));
  assert(codes.some((code) => code.endsWith("kind_mismatch")));
});

test("remote evidence cannot masquerade as locally verified claim bytes", () => {
  const { root, manifest, asset } = fixture();
  asset.brief.claims[0]!.source = "https://example.com/fact";
  assert(validateContentAssetsV2(root, manifest).some((item) => item.code.endsWith("claims.0.path")));
  assert(!contentAssetDependencyPaths(manifest).includes("https://example.com/fact"));
});

test("traversal, directory and external symlink inputs return issues rather than reading them", () => {
  const { root, manifest, asset } = fixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), "content-asset-external-"));
  roots.push(outside);
  writeFileSync(path.join(outside, "evidence.txt"), "external");
  symlinkSync(path.join(outside, "evidence.txt"), path.join(root, "external.txt"));
  for (const source of ["../external.txt", "external.txt", "."]) {
    asset.brief.claims[0]!.source = source;
    assert(validateContentAssetsV2(root, manifest).some((item) => /claims\.0\.(outside_workspace|not_file)$/.test(item.code)));
  }
});

test("dependency inventory includes kit, inputs, references and claims without output files", () => {
  const { manifest } = fixture();
  assert.deepEqual(contentAssetDependencyPaths(manifest), ["DESIGN.md", "capture.txt", "claims.md"]);
});

test("invalid numeric dimensions and missing lineage fail for captured media too", () => {
  const { root, manifest, asset } = fixture();
  asset.production_kind = "captured";
  asset.dimensions.width = -1;
  asset.inputs.push("untracked-input.png");
  const codes = validateContentAssetsV2(root, manifest).map((item) => item.code);
  assert(codes.some((code) => code.endsWith("dimensions.width")));
  assert(codes.some((code) => code.endsWith("lineage.unrecorded")));
});

test("CLI supports vendor-neutral v2 packets and classifies unknown-provider UGC by kind", () => {
  const { root, manifest, asset } = fixture();
  mkdirSync(path.join(root, "state"));
  copyFileSync("examples/workspace/business/state/business-state.json", path.join(root, "state/business-state.json"));
  writeFileSync(
    path.join(root, "CONTENT_ASSETS.md"),
    "Route Matrix\nFounder approval\nLicense status\nSource Inputs\nComposition Manifest\nRender Commands\nClaim Review\nOutput Registry\nPublic Use Gates\n",
  );
  writeFileSync(path.join(root, "content-assets.html"), "<p>Fixture proof board, no produced media.</p>");
  Object.assign(asset, {
    truth_constraints: ["No mock UI claims"],
    approvals: ["No generation or publication authorized by this fixture"],
    license_status: "Synthetic fixture only",
  });
  const run = (strict = false) => {
    writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest));
    return spawnSync(
      process.execPath,
      ["--import", "tsx", "checks/validation/business/design/check-content-assets.ts", "--root", root, ...(strict ? ["--require-foundation"] : [])],
      { encoding: "utf8" },
    );
  };
  const valid = run();
  assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  const strictValid = run(true);
  assert.equal(strictValid.status, 0, strictValid.stdout + strictValid.stderr);
  (manifest as any).schema_version = "1";
  const packetPath = path.join(root, "CONTENT_ASSETS.md");
  const vendorNeutralPacket = readFileSync(packetPath, "utf8");
  writeFileSync(packetPath, vendorNeutralPacket + "Higgsfield\nRemotion\n");
  const legacy = run();
  assert.equal(legacy.status, 0, legacy.stdout + legacy.stderr);
  const downgrade = run(true);
  assert.notEqual(downgrade.status, 0);
  assert.match(downgrade.stdout + downgrade.stderr, /content_assets.foundation_required/);
  const statePath = path.join(root, "state/business-state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const previousStatus = state.lanes.content_assets.status;
  state.lanes.content_assets.status = "not_needed";
  writeFileSync(statePath, JSON.stringify(state));
  const skippedDowngrade = run(true);
  assert.notEqual(skippedDowngrade.status, 0);
  assert.match(skippedDowngrade.stdout + skippedDowngrade.stderr, /content_assets.foundation_required/);
  const savedAssets = manifest.assets;
  manifest.assets = [];
  const noProduction = run(true);
  assert.equal(noProduction.status, 0, noProduction.stdout + noProduction.stderr);
  manifest.assets = savedAssets;
  state.lanes.content_assets.status = previousStatus;
  writeFileSync(statePath, JSON.stringify(state));
  (manifest as any).schema_version = "2";
  writeFileSync(packetPath, vendorNeutralPacket);
  asset.asset_kind = "ugc";
  Object.assign(asset, { duration_seconds: 10 });
  const ugc = run();
  assert.notEqual(ugc.status, 0);
  assert.match(ugc.stdout + ugc.stderr, /script_id\.missing_for_ugc/);
  (manifest as any).schema_version = 2;
  const numeric = run();
  assert.match(numeric.stdout + numeric.stderr, /manifest\.version\.unsupported/);
});
