import test from "node:test";
import { parse, stringify } from "yaml";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { PUBLIC_OPERATIONS } from "../../../contracts/public-api/contract.js";
import { buildInstalledRuntimeManifest } from "../../../adapters/install-entrypoints.js";
import { registerPublicTools } from "../../../entrypoints/mcp/business.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function setup() {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-public-package-")),
    workspace = path.join(temp, "business"),
    home = path.join(temp, "registry"),
    source = path.join(temp, "source");
  mkdirSync(path.join(workspace, ".b2c-launch"), { recursive: true });
  mkdirSync(home);
  cpSync(path.join(root, "examples/extensions/support-case"), source, { recursive: true });
  writeFileSync(
    path.join(home, "workspaces.json"),
    JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "business", path: workspace, registeredAt: new Date().toISOString() }] }),
  );
  writeFileSync(path.join(workspace, ".b2c-launch/runtime.json"), JSON.stringify(buildInstalledRuntimeManifest(root)));
  writeFileSync(
    path.join(workspace, "b2c.yaml"),
    "apiVersion: b2c/v1\nrecipe: {id: support-example/loop, version: 1.0.0}\ntarget: {platform: host, runtime: node22}\nbindings: {}\n",
  );
  return { temp, workspace, home, source };
}
function data(operation: Parameters<typeof callPublicOperation>[0], input: unknown): any {
  const result = callPublicOperation(operation, input);
  assert(result.ok, JSON.stringify(result));
  return result.data;
}
test("public installed package import survives source deletion, pins exact preview, and refuses stale approval", () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const imported = data("packages.import", { workspaceId: "business", sourcePath: env.source });
    rmSync(env.source, { recursive: true });
    assert.equal(data("packages.list", { workspaceId: "business" }).packages[0].digest, imported.digest);
    const input = { workspaceId: "business", packageDigests: [imported.digest] };
    const preview = data("composition.plan", input);
    assert.equal(preview.authorityGranted, false);
    assert(!JSON.stringify(preview).includes(env.temp));
    assert(!("files" in preview));
    assert(!existsSync(path.join(env.workspace, "catalog.json")));
    const stale = callPublicOperation("composition.activate", { ...input, previewDigest: `sha256:${"0".repeat(64)}` });
    assert(!stale.ok && stale.error.code === "STALE_PREVIEW");
    assert(!existsSync(path.join(env.workspace, "catalog.json")));
    const applied = data("composition.activate", { ...input, previewDigest: preview.previewDigest });
    assert.equal(applied.planId, preview.planId);
    const catalog = JSON.parse(readFileSync(path.join(env.workspace, "catalog.json"), "utf8"));
    assert.equal(catalog.workflows.length, 1);
    assert.equal(catalog.workflows[0].selectedOperation.implementation.id, "support-example/fake");
    assert(!existsSync(path.join(env.workspace, "control/grants.json")));
    assert(!existsSync(path.join(env.workspace, "state/business-state.json")));
    const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "packages", "--workspace", "business", "--json"], {
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(cli.status, 0, cli.stderr + cli.stdout);
    assert.deepEqual(JSON.parse(cli.stdout).data, data("packages.list", { workspaceId: "business" }));
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});
test("MCP excludes all local mutation operations and rejects paths in registered reads", () => {
  const tools = new Map<string, any>();
  registerPublicTools({
    registerTool(name: string, definition: unknown, handler: unknown) {
      tools.set(name, { definition, handler });
    },
  } as any);
  for (const op of PUBLIC_OPERATIONS) {
    if (op.mcp) assert(tools.has(op.mcp));
    else assert(![...tools.values()].some((item) => item.definition.title === op.title));
  }
  assert(!callPublicOperation("packages.list", { workspaceId: "/tmp/business" }).ok);
  assert(!callPublicOperation("composition.plan", { workspaceId: "business", packageDigests: [], sourcePath: "/tmp" }).ok);
  assert(!callPublicOperation("market.report", { workspaceId: "business", experimentId: "experiment", path: "/tmp" }).ok);
});
test("package import refuses symlinked stores and failed stage leaves no active pin", () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const outside = path.join(env.temp, "outside");
    mkdirSync(outside);
    symlinkSync(outside, path.join(env.workspace, ".b2c-launch/packages"));
    assert(!callPublicOperation("packages.import", { workspaceId: "business", sourcePath: env.source }).ok);
    assert(!existsSync(path.join(env.workspace, "catalog.json")));
    assert.equal(data("business.status", { workspaceId: "business" }).providerProof, "not_observed");
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("public recovery resumes a durable interrupted pin and erasure blocks registered operations", async () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const imported = data("packages.import", { workspaceId: "business", sourcePath: env.source });
    const input = { workspaceId: "business", packageDigests: [imported.digest] };
    const planned = data("composition.plan", input);
    data("composition.activate", { ...input, previewDigest: planned.previewDigest });
    const config = path.join(env.workspace, "b2c.yaml");
    writeFileSync(config, readFileSync(config, "utf8") + "\n");
    const { previewCompositionActivation, applyCompositionActivation } = await import("../../../kernel/composition/activation.js");
    const preview = previewCompositionActivation({
      workspace: env.workspace,
      catalog: JSON.parse(readFileSync(path.join(env.workspace, "catalog.json"), "utf8")),
      runtime: JSON.parse(readFileSync(path.join(env.workspace, ".b2c-launch/runtime.json"), "utf8")),
    });
    assert.throws(
      () =>
        applyCompositionActivation(env.workspace, preview, {
          ownerSessionId: "interruption-fixture",
          afterWrite(boundary) {
            if (boundary === "catalog") throw new Error("simulated crash");
          },
        }),
      /simulated crash/,
    );
    const blocked = callPublicOperation("composition.plan", input);
    assert(!blocked.ok && blocked.error.code === "RECOVERY_REQUIRED");
    assert.equal(data("business.status", { workspaceId: "business" }).lifecycle, "recovery_required");
    const recovered = data("composition.recover", { workspaceId: "business", mode: "resume" });
    assert.equal(recovered.configurationRevision, preview.configurationRevision);
    assert(!existsSync(path.join(env.workspace, ".b2c-launch/composition-activation.json")));
    writeFileSync(path.join(env.workspace, "control/erasure-intent.json"), "{}");
    for (const [operation, args] of [
      ["packages.list", { workspaceId: "business" }],
      ["composition.plan", input],
      ["composition.recover", { workspaceId: "business", mode: "restore" }],
    ] as const) {
      const result = callPublicOperation(operation, args);
      assert(!result.ok && result.error.code === "RECOVERY_REQUIRED");
    }
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("installed plan refuses oversized and nonregular runtime/config inputs without waiting", () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const imported = data("packages.import", { workspaceId: "business", sourcePath: env.source });
    const input = { workspaceId: "business", packageDigests: [imported.digest] };
    for (const relative of ["b2c.yaml", ".b2c-launch/runtime.json"]) {
      const file = path.join(env.workspace, relative),
        before = readFileSync(file);
      writeFileSync(file, " ".repeat(65537));
      assert(!callPublicOperation("composition.plan", input).ok);
      rmSync(file);
      const fifo = spawnSync("mkfifo", [file], { encoding: "utf8" });
      assert.equal(fifo.status, 0, fifo.stderr);
      const start = Date.now();
      assert(!callPublicOperation("composition.plan", input).ok);
      assert(Date.now() - start < 1000);
      rmSync(file);
      writeFileSync(file, before);
    }
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("public activation binds billing gates to the selected installed validation contract", () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const manifest = path.join(env.source, "extension.yaml"),
      pack = path.join(env.source, "pack.yaml");
    writeFileSync(
      manifest,
      readFileSync(manifest, "utf8").replace(
        "    maturity: experimental",
        "    maturity: experimental\n    validationContract: {id: revenuecat, version: 1.0.0, kind: billing}",
      ),
    );
    // An installed package is self-contained: selecting a host gate still requires a pinned declaration.
    const extension = parse(readFileSync(manifest, "utf8"));
    extension.resources.push({ id: "support-example/gates", path: "gate-commands.json", kind: "gate", mediaType: "application/json" });
    writeFileSync(manifest, stringify(extension));
    const hostScripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
    writeFileSync(path.join(env.source, "gate-commands.json"), JSON.stringify({ scripts: { "check:revenue": hostScripts["check:revenue"] } }));
    const packDefinition = parse(readFileSync(pack, "utf8"));
    packDefinition.gates = [
      {
        id: "gate.support-revenue",
        command: "check:revenue",
        command_manifest_path: "gate-commands.json",
        owner_domain_id: "domain.support-case",
        audit: "required",
      },
    ];
    packDefinition.workflows[0].gate_commands = ["check:revenue"];
    writeFileSync(pack, stringify(packDefinition));
    const imported = data("packages.import", { workspaceId: "business", sourcePath: env.source });
    const input = { workspaceId: "business", packageDigests: [imported.digest] },
      preview = data("composition.plan", input);
    assert.deepEqual(preview.disclosures[0].validationContract, { id: "revenuecat", version: "1.0.0", kind: "billing" });
    data("composition.activate", { ...input, previewDigest: preview.previewDigest });
    const catalog = JSON.parse(readFileSync(path.join(env.workspace, "catalog.json"), "utf8"));
    assert.deepEqual(catalog.workflows[0].gateArguments["check:revenue"], ["--provider-contract", "revenuecat", "--provider-contract-version", "1.0.0"]);
    const unsupported = parse(readFileSync(manifest, "utf8"));
    unsupported.implementations[0].validationContract.version = "9.0.0";
    writeFileSync(manifest, stringify(unsupported));
    const changed = data("packages.import", { workspaceId: "business", sourcePath: env.source });
    assert(!callPublicOperation("composition.plan", { workspaceId: "business", packageDigests: [changed.digest] }).ok);
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("provider-valued overrides resolve an exact group version to a distinct implementation and never accept implementation aliases", () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const file = path.join(env.source, "extension.yaml"),
      extension = parse(readFileSync(file, "utf8"));
    extension.providers = [{ id: "support-example/vendor", version: "2.0.0", title: "Support vendor", description: "Selected support implementation owner" }];
    extension.implementations[0].provider = "support-example/vendor";
    writeFileSync(file, stringify(extension));
    const imported = data("packages.import", { workspaceId: "business", sourcePath: env.source }),
      input = { workspaceId: "business", packageDigests: [imported.digest] };
    const config = readFileSync(path.join(env.workspace, "b2c.yaml"), "utf8"),
      authored = config.replace("bindings: {}", "bindings: {support-example/triage: {provider: {id: support-example/vendor, version: 2.0.0}}}");
    writeFileSync(path.join(env.workspace, "b2c.yaml"), authored);
    const preview = data("composition.plan", input);
    data("composition.activate", { ...input, previewDigest: preview.previewDigest });
    const selected = JSON.parse(readFileSync(path.join(env.workspace, "catalog.json"), "utf8")).workflows[0].selectedOperation;
    assert.equal(selected.implementation.id, "support-example/fake");
    assert.equal(selected.implementation.version, "1.0.0");
    for (const invalid of [
      authored.replace("version: 2.0.0", "version: 1.0.0"),
      authored.replace("support-example/vendor", "support-example/fake").replace("version: 2.0.0", "version: 1.0.0"),
    ]) {
      writeFileSync(path.join(env.workspace, "b2c.yaml"), invalid);
      assert(!callPublicOperation("composition.plan", input).ok);
    }
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});
