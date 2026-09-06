import test from "node:test";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { loadProductInstanceDocument, productYamlPath } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
import { OperationRouteRegistry, type OperationRoute } from "../../../kernel/session/operation-routes.js";
import { runReducer } from "../../../kernel/session/reducer-cli.js";
import { resolveWorkspacePaths } from "../../../kernel/session/run.js";
import { loadRunState, writeRunState } from "../../../kernel/engine/runstate.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function data(operation: Parameters<typeof callPublicOperation>[0], input: unknown): any {
  const result = callPublicOperation(operation, input);
  assert(result.ok, JSON.stringify(result));
  return result.data;
}
function setup() {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-lifecycle-")),
    home = path.join(temp, "registry"),
    directory = path.join(temp, "app");
  mkdirSync(home);
  return { temp, home, directory };
}
function acceptProduct(directory: string) {
  const file = productYamlPath(directory),
    doc = parse(readFileSync(file, "utf8"));
  doc.meta.status = "accepted";
  writeFileSync(file, stringify(doc));
  writeFileSync(path.join(directory, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(file)));
}
test("public create, accepted initialization and passive planning preserve authority and registration boundaries", async () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const created = data("business.create", {
      workspaceId: "app",
      directory: env.directory,
      name: "Useful Habit",
      hypothesis: "A specific repeated consumer need",
    });
    assert.equal(created.status, "hypothesis");
    assert(!existsSync(path.join(env.directory, "control/control.json")));
    const unready = data("business.plan", { workspaceId: "app" });
    assert.equal(unready.status, "not_initialized");
    assert(!callPublicOperation("business.initialize", { workspaceId: "app", expectedRevision: unready.revision }).ok);
    acceptProduct(env.directory);
    const revision = workspaceRevision(env.directory);
    assert(!callPublicOperation("business.initialize", { workspaceId: "app", expectedRevision: created.revision }).ok);
    const initialized = data("business.initialize", { workspaceId: "app", expectedRevision: revision });
    assert.equal(initialized.status, "initialized");
    const before = workspaceRevision(env.directory),
      plan = data("business.plan", { workspaceId: "app" });
    assert.equal(plan.providerObservation, "not_requested");
    assert.equal(workspaceRevision(env.directory), before);
    assert.equal(plan.authorityGranted, false);
    assert.equal(plan.completion.deliveryAccepted, false);
    assert(!plan.completion.nextAction.includes("then initialize"));
    const client = new Client({ name: "lifecycle-parity", version: "1.0.0" });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: ["--import", "tsx", path.join(root, "entrypoints/mcp/server.ts")],
          cwd: root,
          env: { ...process.env, B2C_APP_BUILDER_MCP_READONLY: "1" },
          stderr: "pipe",
        }),
      );
      for (const operation of ["plan", "evidence"]) {
        const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), `business-${operation}`, "--workspace", "app", "--json"], {
          encoding: "utf8",
          env: process.env,
        });
        assert.equal(cli.status, 0, cli.stderr);
        const mcp = await client.callTool({ name: `b2c_business_${operation}`, arguments: { workspaceId: "app" } });
        assert.deepEqual((mcp.structuredContent as any).data, JSON.parse(cli.stdout).data);
      }
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      assert(names.includes("b2c_research_lookup") && !names.includes("b2c_research_record"));
      assert(
        !names.includes("b2c_business_recover") &&
          !names.includes("b2c_business_run") &&
          !names.includes("b2c_business_initialize") &&
          !names.includes("b2c_business_create"),
      );
    } finally {
      await client.close();
    }

    assert.deepEqual(JSON.parse(readFileSync(path.join(env.directory, "control/control.json"), "utf8")).grants, {});
    assert(!callPublicOperation("business.create", { workspaceId: "app", directory: path.join(env.temp, "other"), name: "Other", hypothesis: "Other" }).ok);
    assert(!callPublicOperation("business.plan", { workspaceId: env.directory }).ok);
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});
test("public run uses existing authority and trusted selected routes; exact request replay never repeats effects", async () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    data("business.create", { workspaceId: "app", directory: env.directory, name: "Useful Habit", hypothesis: "A consumer need" });
    acceptProduct(env.directory);
    data("business.initialize", { workspaceId: "app", expectedRevision: workspaceRevision(env.directory) });
    // Separate fixture founder action through the existing reducer, never granted by initialization.
    const now = new Date().toISOString(),
      paths = resolveWorkspacePaths(env.directory);
    const grant = { domainId: "domain.support-case", level: "run-with-guardrails", prerequisites: [], grantedAt: now, grantedBy: "founder", updatedAt: now };
    const patch = {
      schemaVersion: "1.0.0",
      patchId: "fixture-authority",
      targetDoc: "control",
      reason: "Explicit fixture founder authorization",
      authoredBy: "founder",
      authoredAt: now,
      preconditions: [],
      ops: [{ op: "set", path: ["grants", "domain.support-case"], value: grant }],
      declaredOutputs: [["grants", "domain.support-case"]],
    };
    const authorized = runReducer(
      [
        "commit",
        "--file",
        paths.control,
        "--manifest",
        paths.manifest,
        "--audit",
        paths.audit,
        "--session",
        "fixture-founder",
        "--now",
        now,
        "--founder-authority",
        "true",
      ],
      JSON.stringify(patch),
    );
    assert.equal(authorized.code, 0, authorized.output);
    const source = path.join(env.temp, "extension");
    cpSync(path.join(root, "examples/extensions/support-case"), source, { recursive: true });
    const imported = data("packages.import", { workspaceId: "app", sourcePath: source });
    writeFileSync(
      path.join(env.directory, "b2c.yaml"),
      "apiVersion: b2c/v1\nrecipe: {id: support-example/loop, version: 1.0.0}\ntarget: {platform: host, runtime: node22}\nbindings: {}\n",
    );
    const activationInput = { workspaceId: "app", packageDigests: [imported.digest] },
      activation = data("composition.plan", activationInput);
    data("composition.activate", { ...activationInput, previewDigest: activation.previewDigest });
    let effects = 0;
    const observed = new Map<string, { output: unknown; evidence: unknown }>();
    const route: OperationRoute = {
      operation: "support-example/triage",
      implementationId: "support-example/fake",
      packageDigest: imported.digest,
      resultArtifactId: "artifact.support-result-json",
      receiptArtifactId: "artifact.support-receipt-json",
      maxReceiptAgeMs: 60000,
      input: () => ({ caseId: "case-1", message: "I need help with the paid app." }),
      execute: async ({ idempotencyKey }) => {
        effects++;
        const result = {
          output: { caseId: "case-1", priority: "normal", draftResponse: "Try restoring your purchase and tell us what happens." },
          evidence: { caseId: "case-1", requestKey: idempotencyKey, observedState: "triaged", transport: "fake" },
        };
        observed.set(idempotencyKey, result);
        return result;
      },
      observe: async ({ idempotencyKey, output, evidence }) => JSON.stringify(observed.get(idempotencyKey)) === JSON.stringify({ output, evidence }),
    };
    const host = { operationRoutes: new OperationRouteRegistry([route]) };
    const plan = data("business.plan", { workspaceId: "app" });
    assert.equal(plan.ready.length, 1, JSON.stringify(plan));
    const request = { workspaceId: "app", requestId: "constructor", expectedRevision: plan.revision, scope: [], wallClockSeconds: 30, maxConcurrency: 1 };
    const stale = await callPublicOperation("business.run", { ...request, expectedRevision: `sha256:${"0".repeat(64)}` }, host);
    assert(!stale.ok && stale.error.code === "STALE_PREVIEW");
    assert.equal(effects, 0);
    const result = await callPublicOperation("business.run", request, host);
    assert(result.ok, JSON.stringify(result));
    assert.equal(effects, 1, JSON.stringify(result));
    assert.equal(result.data.completion.deliveryAccepted, false, "a successful bounded support operation cannot finish a complete business");
    const replay = await callPublicOperation("business.run", request, host);
    assert(replay.ok && replay.data.replayed, JSON.stringify(replay));
    assert.equal(effects, 1);
    const conflict = await callPublicOperation("business.run", { ...request, scope: ["workflow.other"] }, host);
    assert(!conflict.ok);
    assert.equal(effects, 1);
    const evidence = data("business.evidence", { workspaceId: "app" });
    assert.equal(evidence.items[0].acceptance, "current", JSON.stringify(evidence));
    assert.equal(evidence.liveLaunchProven, false);
    assert.equal(result.ok && result.data.notifications, "disabled");
    const runPath = path.join(env.directory, "run/run-state.json"),
      saved = loadRunState(runPath),
      outputPath = path.join(env.directory, saved.artifactBindings.find((binding) => binding.artifactId === "artifact.support-result-json")!.path);
    const original = readFileSync(outputPath);
    writeFileSync(outputPath, "tampered");
    assert.equal(data("business.evidence", { workspaceId: "app" }).items[0].acceptance, "stale");
    writeFileSync(outputPath, original);
    const missing = structuredClone(saved);
    missing.artifactBindings = missing.artifactBindings.filter((binding) => binding.artifactId !== "artifact.support-result-json");
    writeRunState(runPath, missing);
    assert(data("business.evidence", { workspaceId: "app" }).items[0].reasonCodes.includes("artifact.binding_missing_or_ambiguous"));
    const interrupted = structuredClone(saved);
    interrupted.publicRequests!["constructor"]!.status = "running";
    interrupted.heartbeatAt = "2000-01-01T00:00:00.000Z";
    delete interrupted.publicRequests!["constructor"]!.result;
    writeRunState(runPath, interrupted);
    const pending = await callPublicOperation("business.run", request, host);
    assert(!pending.ok && pending.error.code === "RECOVERY_REQUIRED");
    const changedId = await callPublicOperation("business.run", { ...request, requestId: "two", expectedRevision: workspaceRevision(env.directory) }, host);
    assert(!changedId.ok && changedId.error.code === "RECOVERY_REQUIRED");
    assert.equal(effects, 1);
    const recovered = data("business.recover", { workspaceId: "app", requestId: request.requestId, expectedRevision: workspaceRevision(env.directory) });
    assert.equal(recovered.result.outcome, "interrupted");
    assert.equal(recovered.result.completed, 0);
    assert.equal(recovered.dispatched, false);
    const recoveredReplay = await callPublicOperation("business.run", request, host);
    assert(recoveredReplay.ok && recoveredReplay.data.replayed && recoveredReplay.data.outcome === "interrupted", JSON.stringify(recoveredReplay));
    assert.deepEqual(loadRunState(runPath).nodes, saved.nodes);
    assert.deepEqual(loadRunState(runPath).artifactBindings, saved.artifactBindings);
    const next = await callPublicOperation("business.run", { ...request, requestId: "two", expectedRevision: workspaceRevision(env.directory) }, host);
    assert(next.ok, JSON.stringify(next));
    assert.equal(effects, 1, "recovery and a subsequent request must not repeat a completed effect");
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});
