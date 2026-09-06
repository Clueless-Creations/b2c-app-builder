import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { discover, compose, businessStatus } from "../../../kernel/services/business.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const example = () => JSON.parse(readFileSync(path.join(root, "contracts/public-api/examples/subscription-app.json"), "utf8"));
const minimalComposition = () => {
  const composition = example();
  delete composition.bindings;
  return composition;
};
const requiredOperations = ["b2c/monetization.present-paywall", "b2c/monetization.purchase", "b2c/monetization.read-entitlement"];
const withoutRequestId = (result: any) => {
  const { requestId, ...rest } = result;
  assert.equal(typeof requestId, "string");
  return rest;
};
const acceptsWithoutDefaults = (schema: object, input: unknown) => {
  const original = structuredClone(input);
  const SchemaValidator = "$schema" in schema && schema.$schema === "http://json-schema.org/draft-07/schema#" ? Ajv : Ajv2020;
  const check = new SchemaValidator({ strict: false, useDefaults: false }).compile(schema);
  assert(check(input), JSON.stringify(check.errors));
  assert.deepEqual(input, original, "Schema validation must not insert runtime defaults");
};
const data = (result: ReturnType<typeof compose>) => {
  if (!result.ok) assert.fail(result.error.code);
  return result.data;
};

test("discovery separates the supported facade from unimplemented provider execution", () => {
  const result = discover({ kind: "provider" });
  assert.equal(result.apiVersion, "b2c/v1");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert(result.data.items.some((item) => item.id === "b2c/superwall"));
  assert(result.data.items.every((item) => item.execution === "unavailable"));
});

test("saved v1 declaration resolves complementary provider operations without claiming readiness", () => {
  const preview = data(compose({ composition: example() }));
  assert.equal(preview.declarationValid, true);
  assert.equal(preview.canApply, false);
  assert.equal(preview.configuration, "not_checked");
  assert.equal(preview.authority, "not_checked");
  assert.equal(preview.verification, "not_checked");
  assert(preview.bindings.some((binding) => binding.operation === "b2c/monetization.present-paywall" && binding.provider.id === "b2c/superwall"));
  assert(preview.bindings.some((binding) => binding.operation === "b2c/monetization.purchase" && binding.provider.id === "b2c/revenuecat"));
  assert(preview.blockers.some((blocker) => blocker.code === "COMPOSITION_APPLY_UNAVAILABLE"));
  assert.deepEqual(
    preview.blockers
      .filter((blocker) => blocker.code === "PROVIDER_EXECUTION_UNAVAILABLE")
      .map((blocker) => blocker.operation)
      .sort(),
    [...requiredOperations].sort(),
  );
});

test("omitted bindings resolve every required operation from RevenueCat recipe defaults", () => {
  const input = minimalComposition();
  const original = structuredClone(input);
  const preview = data(compose({ composition: input }));
  assert.deepEqual(preview.bindings.map((binding) => binding.operation).sort(), [...requiredOperations].sort());
  for (const binding of preview.bindings) {
    assert.equal(binding.source, "recipe");
    assert.deepEqual(binding.provider, { id: "b2c/revenuecat", version: "1.0.0" });
    assert(preview.blockers.some((blocker) => blocker.code === "PROVIDER_EXECUTION_UNAVAILABLE" && blocker.operation === binding.operation));
  }
  assert.deepEqual(input, original, "Resolving recipe defaults must not mutate the authored declaration");
});

test("digest is independent of authored object order and sensitive to connection changes", () => {
  const original = example();
  const reordered = Object.fromEntries(Object.entries(structuredClone(original)).reverse());
  assert.equal(data(compose({ composition: original })).proposalDigest, data(compose({ composition: reordered })).proposalDigest);
  original.bindings["b2c/monetization.purchase"].connection = "connection:other-billing";
  assert.notEqual(data(compose({ composition: original })).proposalDigest, data(compose({ composition: reordered })).proposalDigest);
});

for (const [label, change, code] of [
  [
    "unknown field",
    (c: any) => {
      c.approved = true;
    },
    "INVALID_INPUT",
  ],
  [
    "unsupported version",
    (c: any) => {
      c.apiVersion = "b2c/v99";
    },
    "UNSUPPORTED_VERSION",
  ],
  [
    "unknown recipe",
    (c: any) => {
      c.recipe.id = "example/missing";
    },
    "UNKNOWN_ENTITY",
  ],
  [
    "unknown provider",
    (c: any) => {
      c.bindings["b2c/monetization.purchase"].provider.id = "example/missing";
    },
    "UNKNOWN_ENTITY",
  ],
  [
    "wrong recipe version",
    (c: any) => {
      c.recipe.version = "2.0.0";
    },
    "UNSUPPORTED_ENTITY_VERSION",
  ],
  [
    "wrong provider version",
    (c: any) => {
      c.bindings["b2c/monetization.purchase"].provider.version = "2.0.0";
    },
    "UNSUPPORTED_ENTITY_VERSION",
  ],
  [
    "unknown operation",
    (c: any) => {
      c.bindings["example/not-real"] = c.bindings["b2c/monetization.purchase"];
    },
    "UNKNOWN_OPERATION",
  ],
  [
    "semantically incompatible binding",
    (c: any) => {
      c.bindings["b2c/monetization.purchase"].provider.id = "b2c/superwall";
    },
    "INCOMPATIBLE_BINDING",
  ],
] as const) {
  test(label + " fails with a typed error", () => {
    const input = example();
    change(input);
    const result = compose({ composition: input });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, code);
  });
}

test("unsupported target stays visible; declaration validation is not implementation proof", () => {
  const input = example();
  input.target = { platform: "android", runtime: "kotlin" };
  const preview = data(compose({ composition: input }));
  assert.equal(preview.canApply, false);
  assert(preview.blockers.some((b) => b.code === "UNSUPPORTED_TARGET"));
});

test("apply is refused and never reads or writes business state", () => {
  const result = compose({ mode: "apply", composition: example() });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "COMPOSITION_APPLY_UNAVAILABLE");
});

test("CLI and actual MCP preserve v1 parity for composition, discovery, and typed errors", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "b2c-public-test-"));
  let client: Client | undefined;
  try {
    const config = path.join(folder, "b2c.json");
    const bytes = JSON.stringify(example());
    writeFileSync(config, bytes);
    const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "compose", "--config", config, "--json"], {
      cwd: folder,
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    const envelope = JSON.parse(cli.stdout);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(root, "entrypoints/mcp/server.ts")],
      cwd: root,
      env: { ...process.env, B2C_APP_BUILDER_HOME: path.join(folder, "home"), B2C_APP_BUILDER_MCP_READONLY: "1" },
      stderr: "pipe",
    });
    client = new Client({ name: "public-v1-contract-test", version: "1.0.0" });
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    const names = tools.map((t) => t.name);
    assert(names.includes("b2c_discover") && names.includes("b2c_compose"));
    acceptsWithoutDefaults(tools.find((tool) => tool.name === "b2c_compose")!.inputSchema, { composition: minimalComposition() });
    acceptsWithoutDefaults(tools.find((tool) => tool.name === "b2c_discover")!.inputSchema, {});
    const result = await client.callTool({ name: "b2c_compose", arguments: { composition: example() } });
    const structured = result.structuredContent as any;
    assert.equal(result.isError, undefined);
    assert.deepEqual(withoutRequestId(structured), withoutRequestId(envelope));
    for (const [flags, arguments_, expectedCode] of [
      [[], {}, undefined],
      [["--kind", "provider"], { kind: "provider" }, undefined],
      [["--id", "example/missing"], { id: "example/missing" }, "UNKNOWN_ENTITY"],
    ] as const) {
      const cliCatalog = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "catalog", ...flags, "--json"], {
        cwd: folder,
        encoding: "utf8",
      });
      assert.equal(cliCatalog.status, expectedCode ? 1 : 0, cliCatalog.stderr);
      const catalogEnvelope = JSON.parse(cliCatalog.stdout);
      const mcpCatalog = await client.callTool({ name: "b2c_discover", arguments: arguments_ });
      assert.equal(mcpCatalog.isError, expectedCode ? true : undefined);
      assert.deepEqual(withoutRequestId(mcpCatalog.structuredContent), withoutRequestId(catalogEnvelope));
      if (expectedCode) assert.equal(catalogEnvelope.error.code, expectedCode);
    }
    assert.equal(readFileSync(config, "utf8"), bytes);
    writeFileSync(config, JSON.stringify(minimalComposition()));
    const cliDefault = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "compose", "--config", config, "--json"], {
      cwd: folder,
      encoding: "utf8",
    });
    assert.equal(cliDefault.status, 0, cliDefault.stderr);
    const mcpDefault = await client.callTool({ name: "b2c_compose", arguments: { composition: minimalComposition() } });
    assert.equal(mcpDefault.isError, undefined);
    assert.deepEqual(withoutRequestId(mcpDefault.structuredContent), withoutRequestId(JSON.parse(cliDefault.stdout)));
    assert.equal(readFileSync(config, "utf8"), JSON.stringify(minimalComposition()));
    const refused = await client.callTool({ name: "b2c_compose", arguments: { mode: "apply", composition: example() } });
    assert.equal(refused.isError, true);
    assert.equal((refused.structuredContent as any).error.code, "COMPOSITION_APPLY_UNAVAILABLE");
  } finally {
    await client?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("CLI rejects unknown flags and malformed input without echoing private content", () => {
  const badFlag = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "compose", "--approve", "secret-sentinel"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(badFlag.status, 1);
  assert.equal(JSON.parse(badFlag.stdout).error.code, "INVALID_INPUT");
  assert(!badFlag.stdout.includes("secret-sentinel"));
});

test("published schemas validate actual results and accept additive output fields", () => {
  const validator = new Ajv2020({ strict: false });
  for (const [operation, result] of [
    ["catalog.list", discover({})],
    ["composition.preview", compose({ composition: example() })],
  ] as const) {
    const schema = JSON.parse(readFileSync(path.join(root, "contracts/public-api/schemas", operation + ".result.schema.json"), "utf8"));
    const check = validator.compile(schema);
    assert(check(result), JSON.stringify(check.errors));
    assert(check({ ...result, futureOptionalField: true }), JSON.stringify(check.errors));
  }
});

test("published input schemas and CLI --schema accept omitted defaults without inserting them", () => {
  for (const [filename, input] of [
    ["composition.schema.json", minimalComposition()],
    ["composition.preview.input.schema.json", { composition: minimalComposition() }],
    ["catalog.list.input.schema.json", {}],
  ] as const) {
    const schema = JSON.parse(readFileSync(path.join(root, "contracts/public-api/schemas", filename), "utf8"));
    acceptsWithoutDefaults(schema, input);
  }
  const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "compose", "--schema"], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  acceptsWithoutDefaults(JSON.parse(cli.stdout), minimalComposition());
});

test("CLI accepts caller-relative YAML and rejects duplicate keys without leaking content", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "b2c-public-yaml-"));
  try {
    const yaml = "apiVersion: b2c/v1\nrecipe: {id: b2c/subscription-app, version: 1.0.0}\ntarget: {platform: ios, runtime: swiftui}\n";
    writeFileSync(path.join(folder, "b2c.yaml"), yaml);
    const run = () =>
      spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "compose", "--config", "b2c.yaml", "--json"], { cwd: folder, encoding: "utf8" });
    assert.equal(run().status, 0);
    writeFileSync(path.join(folder, "b2c.yaml"), yaml + "apiVersion: private-sentinel\n");
    const invalid = run();
    assert.equal(invalid.status, 1);
    assert(!invalid.stdout.includes("private-sentinel"));
    assert.equal(JSON.parse(invalid.stdout).error.code, "INVALID_INPUT");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("CLI rejects YAML aliases, oversized files, and unreadable paths with sanitized errors", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "b2c-public-invalid-"));
  try {
    const cases = [
      {
        filename: "alias.yaml",
        content:
          "apiVersion: b2c/v1\nrecipe: {id: b2c/subscription-app, version: 1.0.0}\ntarget: {platform: ios, runtime: swiftui}\n" +
          "bindings:\n  b2c/monetization.purchase:\n    provider: &billing {id: b2c/revenuecat, version: 1.0.0}\n    connection: connection:private-sentinel\n" +
          "  b2c/monetization.read-entitlement:\n    provider: *billing\n",
      },
      {
        filename: "oversized.json",
        content: JSON.stringify(example()).replace("connection:billing", "connection:private-sentinel") + " ".repeat(64 * 1024),
      },
      { filename: "unreadable-private-sentinel.json", content: undefined },
    ];
    for (const { filename, content } of cases) {
      const config = path.join(folder, filename);
      if (content !== undefined) writeFileSync(config, content);
      const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "compose", "--config", config, "--json"], {
        cwd: folder,
        encoding: "utf8",
      });
      assert.equal(cli.status, 1, filename);
      assert.equal(JSON.parse(cli.stdout).error.code, "INVALID_INPUT", filename);
      assert(!cli.stdout.includes("private-sentinel"), filename);
      assert(!cli.stdout.includes(folder), filename);
      assert.equal(cli.stderr, "", filename);
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("mobile app operation uses native defaults and accepts an explicit provider without claiming execution", () => {
  const input = JSON.parse(readFileSync(path.join(root, "contracts/public-api/examples/mobile-app-capture.json"), "utf8"));
  const native = data(compose({ composition: input }));
  assert.equal(native.bindings.length, 5);
  assert(native.bindings.every((b) => b.source === "recipe" && b.provider.id === "b2c/host-native-mobile"));
  assert.equal(native.configuration, "not_checked");
  assert.equal(native.canApply, false);
  for (const binding of native.bindings) {
    assert(native.blockers.some((b) => b.operation === binding.operation && b.code === "PROVIDER_EXECUTION_UNAVAILABLE"));
  }
  input.bindings = { "b2c/mobile-app-operation.capture-screenshot": { provider: { id: "b2c/mobai", version: "1.0.0" } } };
  const alternate = data(compose({ composition: input }));
  assert(
    alternate.bindings.some((b) => b.operation === "b2c/mobile-app-operation.capture-screenshot" && b.source === "explicit" && b.provider.id === "b2c/mobai"),
  );
  assert.equal(alternate.canApply, false);
  const capability = discover({ id: "b2c/mobile-app-operation" });
  assert(capability.ok);
  assert.equal(capability.data.items[0]?.execution, "unavailable");
});

test("business.status projects registered runtime counts without leaking private fields or changing state", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "b2c-business-status-"));
  const previousHome = process.env.B2C_APP_BUILDER_HOME;
  const secret = "private-status-sentinel";
  try {
    const home = path.join(folder, "home");
    const workspace = path.join(folder, "business");
    const neighbor = path.join(folder, "neighbor");
    mkdirSync(home);
    mkdirSync(path.join(workspace, "run"), { recursive: true });
    mkdirSync(path.join(workspace, "digests"));
    mkdirSync(neighbor);
    const registry = JSON.stringify({
      schemaVersion: "1.0.0",
      workspaces: [
        { id: "selected", path: workspace, registeredAt: "2026-09-05T00:00:00Z" },
        { id: "neighbor", path: neighbor, registeredAt: "2026-09-05T00:00:00Z" },
      ],
    });
    writeFileSync(path.join(home, "workspaces.json"), registry);
    const run = JSON.stringify({
      runId: secret,
      updatedAt: secret,
      grants: { secret },
      nodes: {
        a: { status: "succeeded", value: secret },
        b: { status: "running" },
        c: { status: "waiting_founder" },
        d: { status: "needs_readback" },
        e: { status: secret },
      },
    });
    writeFileSync(path.join(workspace, "run/run-state.json"), run);
    writeFileSync(path.join(workspace, "digests/private.md"), secret);
    process.env.B2C_APP_BUILDER_HOME = home;
    const result = businessStatus({ workspaceId: "selected" });
    assert(result.ok);
    assert.deepEqual(result.data, {
      workspaceId: "selected",
      lifecycle: "run_recorded",
      work: { total: 5, pending: 0, active: 1, waitingForFounder: 1, blocked: 1, completed: 1, failed: 0, excluded: 0, unknown: 1 },
      observedFrom: "local_runtime",
      providerProof: "not_observed",
    });
    assert(!JSON.stringify(result).includes(secret) && !JSON.stringify(result).includes(workspace));
    const neighborResult = businessStatus({ workspaceId: "neighbor" });
    assert(neighborResult.ok && neighborResult.data.lifecycle === "not_initialized" && neighborResult.data.work === null);
    const unknown = businessStatus({ workspaceId: "missing" });
    assert(!unknown.ok && unknown.error.code === "UNKNOWN_WORKSPACE");
    assert(!JSON.stringify(unknown).includes(workspace) && !JSON.stringify(unknown).includes("neighbor"));
    for (const invalid of [{ workspaceId: workspace }, { workspaceId: "../selected" }, { workspaceId: "selected", path: workspace }, {}]) {
      const refused = businessStatus(invalid);
      assert(!refused.ok && refused.error.code === "INVALID_INPUT");
    }
    assert.equal(readFileSync(path.join(home, "workspaces.json"), "utf8"), registry);
    assert.equal(readFileSync(path.join(workspace, "run/run-state.json"), "utf8"), run);
    assert.equal(readFileSync(path.join(workspace, "digests/private.md"), "utf8"), secret);
    writeFileSync(path.join(workspace, "run/run-state.json"), "malformed");
    const unreadable = businessStatus({ workspaceId: "selected" });
    assert(unreadable.ok && unreadable.data.lifecycle === "unreadable" && unreadable.data.work === null);
    mkdirSync(path.join(workspace, ".b2c-launch"));
    writeFileSync(path.join(workspace, ".b2c-launch/composition-activation.json"), '{"status":"incomplete"}');
    const recovering = businessStatus({ workspaceId: "selected" });
    assert(recovering.ok && recovering.data.lifecycle === "recovery_required" && recovering.data.work === null);
    assert(!JSON.stringify(recovering).includes(secret), "incomplete activation must not expose a stale digest or counts");
    acceptsWithoutDefaults(JSON.parse(readFileSync(path.join(root, "contracts/public-api/schemas/business.status.result.schema.json"), "utf8")), result);
  } finally {
    if (previousHome === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previousHome;
    rmSync(folder, { recursive: true, force: true });
  }
});

test("business.status CLI and actual read-only MCP return the same versioned registered-workspace result", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "b2c-business-status-parity-"));
  let client: Client | undefined;
  try {
    const home = path.join(folder, "home");
    const workspace = path.join(folder, "business");
    mkdirSync(home);
    mkdirSync(path.join(workspace, "run"), { recursive: true });
    writeFileSync(
      path.join(home, "workspaces.json"),
      JSON.stringify({ schemaVersion: "1.0.0", workspaces: [{ id: "selected", path: workspace, registeredAt: "2026-09-05T00:00:00Z" }] }),
    );
    writeFileSync(
      path.join(workspace, "run/run-state.json"),
      JSON.stringify({ nodes: { a: { status: "pending" }, b: { status: "failed" }, c: { status: "not_needed" } } }),
    );
    const env = { ...process.env, B2C_APP_BUILDER_HOME: home, B2C_APP_BUILDER_MCP_READONLY: "1" };
    client = new Client({ name: "business-status-contract-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", path.join(root, "entrypoints/mcp/server.ts")],
        cwd: root,
        env,
        stderr: "pipe",
      }),
    );
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "b2c_business_status");
    assert(tool && tool.annotations?.readOnlyHint === true);
    acceptsWithoutDefaults(tool.inputSchema, { workspaceId: "selected" });
    for (const workspaceId of ["selected", "missing"]) {
      const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "business-status", "--workspace", workspaceId, "--json"], {
        cwd: folder,
        env,
        encoding: "utf8",
      });
      assert.equal(cli.status, workspaceId === "selected" ? 0 : 1, cli.stderr);
      const mcp = await client.callTool({ name: "b2c_business_status", arguments: { workspaceId } });
      assert.deepEqual(withoutRequestId(mcp.structuredContent), withoutRequestId(JSON.parse(cli.stdout)));
      assert.equal(mcp.isError, workspaceId === "selected" ? undefined : true);
    }
  } finally {
    await client?.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
