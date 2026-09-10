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
import { loadBusinessStateFile, resolveWorkspacePaths } from "../../../kernel/session/run.js";
import { loadRunState, seedRunState, writeRunState } from "../../../kernel/engine/runstate.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { loadWorkspaceCatalog } from "../../../kernel/session/catalog-contract.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import {
  businessPlanSchema,
  publicAttemptFailureCodes,
  publicFounderQuestionClasses,
  publicHoldKinds,
} from "../../../contracts/public-api/contract.js";
import { projectFounderQuestion, projectHeldWork, projectReadyBrief, PUBLIC_HELD_REASON } from "../../../kernel/services/plan-projection.js";
import { attemptFailureCodes } from "../../../kernel/session/attempt-failure.js";
import { founderQuestionClasses } from "../../../kernel/session/founder-gate.js";
import type { HeldNode } from "../../../kernel/session/plan.js";
import type { NodeBrief } from "../../../kernel/engine/node-brief.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** Built by concatenation so this file does not carry a raw-secret-shaped literal. */
function fabricatedSecretLikeShapes() {
  const pemBegin = ["-----BEGIN RSA", "PRIVATE KEY-----"].join(" ");
  const pemEnd = ["-----END RSA", "PRIVATE KEY-----"].join(" ");
  const pemBody = ["MIIEvQIBADANFAKEPEM", "BODYTOKEN0001"].join("");
  return {
    webhook: ["whsec", "abcdefghijkl1234567890"].join("_"),
    pem: pemBegin,
    pemBody,
    pemBlock: [pemBegin, pemBody, pemEnd].join("\n"),
    cloud: ["AKIA", "EXAMPLEKEY000000"].join(""),
  };
}
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
function grantDomain(
  directory: string,
  domainId: string,
  prerequisites: Array<{ id: string; kind: "doppler_auth"; ttlSeconds: number; status: "unverified" }> = [],
) {
  const now = new Date().toISOString(),
    paths = resolveWorkspacePaths(directory);
  const grant = { domainId, level: "run-with-guardrails", prerequisites, grantedAt: now, grantedBy: "founder", updatedAt: now };
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
    JSON.stringify({
      schemaVersion: "1.0.0",
      patchId: `fixture-authority-${domainId}`,
      targetDoc: "control",
      reason: "Explicit fixture founder authorization",
      authoredBy: "founder",
      authoredAt: now,
      preconditions: [],
      ops: [{ op: "set", path: ["grants", domainId], value: grant }],
      declaredOutputs: [["grants", domainId]],
    }),
  );
  assert.equal(authorized.code, 0, authorized.output);
}
function snapshotPlanInputs(directory: string) {
  const runPath = path.join(directory, "run/run-state.json");
  return {
    revision: workspaceRevision(directory),
    control: readFileSync(path.join(directory, "control/control.json"), "utf8"),
    run: existsSync(runPath) ? readFileSync(runPath) : null,
    registry: readFileSync(path.join(process.env.B2C_APP_BUILDER_HOME!, "workspaces.json"), "utf8"),
  };
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
    assert.equal(typeof plan.founderQuestion?.prompt, "string");
    assert.equal(plan.founderQuestion?.appliesToRevision, plan.revision);
    assert.equal(plan.authorityGranted, false);
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
test("public plan projects distinct hold kinds, ready briefs, and a revision-bound founder question", () => {
  const env = setup(),
    prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    data("business.create", { workspaceId: "app", directory: env.directory, name: "Useful Habit", hypothesis: "A consumer need" });
    acceptProduct(env.directory);
    data("business.initialize", { workspaceId: "app", expectedRevision: workspaceRevision(env.directory) });
    grantDomain(env.directory, "domain.operations");
    grantDomain(env.directory, "domain.research");
    grantDomain(env.directory, "domain.trust", [{ id: "doppler.trust", kind: "doppler_auth", ttlSeconds: 3600, status: "unverified" }]);
    const before = snapshotPlanInputs(env.directory);
    const plan = data("business.plan", { workspaceId: "app" });
    assert.deepEqual(snapshotPlanInputs(env.directory), before, "passive planning must not write workspace or registry state");
    assert.equal(plan.providerObservation, "not_requested");
    assert.equal(plan.authorityGranted, false);
    const holdKinds = new Set(plan.held.map((item: { holdKind?: string }) => item.holdKind));
    assert(holdKinds.size >= 2, `expected at least two hold kinds, got ${JSON.stringify([...holdKinds])}`);
    assert(holdKinds.has("founder_approval") && holdKinds.has("upstream"), JSON.stringify([...holdKinds]));
    assert(
      plan.held
        .filter((item: { holdKind?: string }) => item.holdKind === "founder_approval")
        .every((item: { effectBoundary?: string }) => item.effectBoundary === "founder_approval_required"),
      "held founder-approval work must carry founder_approval_required",
    );
    const leftoverReady = plan.ready.find((item: { brief?: { approvals?: string[] } }) => (item.brief?.approvals?.length ?? 0) > 0);
    if (leftoverReady) {
      assert.equal(
        leftoverReady.brief?.effectBoundary,
        "read_and_produce",
        "a dispatchable ready brief with leftover approval descriptions is granted, not held",
      );
    }
    assert(plan.held.every((item: { reason?: string }) => item.reason === PUBLIC_HELD_REASON));
    const details = new Set(plan.held.map((item: { detail?: string }) => item.detail));
    assert(details.size >= 2, "held detail must distinguish planner facts instead of one generic sentence");
    assert(!JSON.stringify(plan).includes("not logged in"));
    assert(!plan.held.some((item: { detail?: string }) => /access is missing/i.test(item.detail ?? "")));
    assert(plan.ready.length >= 1, JSON.stringify({ ready: plan.ready, holdKinds: [...holdKinds] }));
    assert(plan.ready.every((item: { workflowId: string; brief?: { workflowId?: string } }) => item.brief?.workflowId === item.workflowId));
    assert.equal(typeof plan.founderQuestion?.prompt, "string");
    assert.equal(plan.founderQuestion?.appliesToRevision, plan.revision);
    const target = plan.held[0]!;
    const paths = resolveWorkspacePaths(env.directory);
    const loaded = loadWorkspaceCatalog(env.directory);
    assert(loaded.ok, "catalog must load to seed a failed attempt");
    const businessState = loadBusinessStateFile(paths.state);
    assert(businessState);
    const compiled = compilePlan(loaded.catalog);
    const seeded = seedRunState(compiled, businessState, {
      ownerSessionId: "fixture",
      ttlSeconds: 300,
      wallClockCapSeconds: 300,
      now: new Date().toISOString(),
    });
    const nodeId = `run.${target.workflowId.slice("workflow.".length)}`;
    const node = seeded.nodes[nodeId];
    assert(node, nodeId);
    const secretLike = fabricatedSecretLikeShapes();
    node.attempts.push({
      id: "fixture-failed-attempt",
      nodeId,
      number: 1,
      status: "failed",
      ownerSessionId: "fixture",
      heartbeatAt: new Date().toISOString(),
      ttlSeconds: 300,
      inputFingerprint: `sha256:${"0".repeat(64)}`,
      evidence: [],
      error: `worker exited 1: api_key=fixture-not-a-live-token password=hunter2 Bearer fabricated-bearer-token-value-99 webhook=${secretLike.webhook}\n${secretLike.pemBlock}\ncloud=${secretLike.cloud} operator@example.com /Users/someone/secret.env \u0007`,
      readbackRequired: false,
    });
    mkdirSync(path.dirname(paths.runState), { recursive: true });
    writeRunState(paths.runState, seeded);
    const afterSeed = snapshotPlanInputs(env.directory);
    const afterFailure = data("business.plan", { workspaceId: "app" });
    assert.deepEqual(snapshotPlanInputs(env.directory), afterSeed, "planning a failed attempt must not write");
    const failed = afterFailure.held.find((item: { workflowId: string }) => item.workflowId === target.workflowId);
    assert(failed?.lastFailure?.summary, JSON.stringify(failed));
    assert.equal(failed?.lastFailure?.withheld, true, JSON.stringify(failed?.lastFailure));
    const encoded = JSON.stringify(afterFailure);
    assert(!encoded.includes("fixture-not-a-live-token"));
    assert(!encoded.includes("fabricated-bearer-token-value-99"));
    assert(!encoded.includes("hunter2"));
    assert(!encoded.includes(secretLike.webhook), encoded);
    assert(!encoded.includes(secretLike.pem), encoded);
    assert(!encoded.includes(secretLike.pemBody), encoded);
    assert(!encoded.includes(secretLike.cloud), encoded);
    assert(!encoded.includes("operator@example.com"));
    assert(!encoded.includes("/Users/someone/secret.env"));
    assert(!encoded.includes("\u0007"));
    const cli = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "business-plan", "--workspace", "app", "--json"], {
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout).data, afterFailure);
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    rmSync(env.temp, { recursive: true, force: true });
  }
});
test("public plan schema stays additive and bounds unsafe planner text", () => {
  assert.deepEqual([...publicHoldKinds], ["founder_approval", "autonomy", "blocked", "upstream"]);
  assert.deepEqual([...publicAttemptFailureCodes], [...attemptFailureCodes]);
  assert.deepEqual([...publicFounderQuestionClasses], [...founderQuestionClasses]);
  const oldPlan = {
    completion: {
      deliveryAccepted: false,
      closeoutWorkflowId: "workflow.orchestration.full-launch-closeout",
      requiredCount: 0,
      excludedCount: 0,
      outstandingCount: 0,
      assessed: false,
      nextAction: "Finish planning.",
    },
    workspaceId: "app",
    revision: `sha256:${"a".repeat(64)}`,
    planId: null,
    status: "held",
    ready: [],
    held: [{ workflowId: "workflow.fixture.hold", title: "Held", status: "held", reason: PUBLIC_HELD_REASON }],
    completed: 0,
    providerObservation: "not_requested",
    authorityGranted: false,
    nextAction: "Resolve the reported holds; this passive plan did not observe provider prerequisites.",
  };
  assert.deepEqual(businessPlanSchema.parse(oldPlan).held[0], oldPlan.held[0]);
  const secretLike = fabricatedSecretLikeShapes();
  const dirty: HeldNode = {
    nodeId: "run.fixture.hold",
    workflowId: "workflow.fixture.hold",
    title: "Held fixture",
    domainId: "domain.engineering",
    reason: "autonomy",
    detail: `${"n".repeat(500)} api_key=fixture-not-a-live-token`,
    lastFailure: "worker exited 1: summarized",
    lastFailureRaw: `worker exited 1: password=hunter2 /Users/someone/secret.env webhook=${secretLike.webhook}\n${secretLike.pemBlock}\n${secretLike.cloud}`,
    lastFailureCode: "worker.exited",
  };
  const projected = projectHeldWork(dirty);
  assert.equal(projected.holdKind, "autonomy");
  assert.equal(projected.reason, PUBLIC_HELD_REASON);
  assert(projected.detailTruncated);
  assert((projected.detail?.length ?? 0) <= 400);
  assert(!projected.detail?.includes("fixture-not-a-live-token"));
  assert.equal(projected.lastFailure?.withheld, true);
  assert(projected.lastFailure?.truncated === false || projected.lastFailure?.summary);
  assert(!projected.lastFailure?.summary.includes("hunter2"));
  assert(!projected.lastFailure?.summary.includes("/Users/someone"));
  assert(!projected.lastFailure?.summary.includes(secretLike.webhook));
  assert(!projected.lastFailure?.summary.includes(secretLike.pem));
  assert(!projected.lastFailure?.summary.includes(secretLike.pemBody));
  assert(!projected.lastFailure?.summary.includes(secretLike.cloud));
  const encodedHeld = JSON.stringify(projected);
  assert(!encodedHeld.includes(secretLike.webhook));
  assert(!encodedHeld.includes(secretLike.pem));
  assert(!encodedHeld.includes(secretLike.pemBody), encodedHeld);
  assert(!encodedHeld.includes(secretLike.cloud));
  assert(!("lastFailureRaw" in projected));
  const unobserved = projectHeldWork({
    nodeId: "run.fixture.unobserved",
    workflowId: "workflow.fixture.unobserved",
    title: "Unobserved fixture",
    domainId: "domain.trust",
    reason: "autonomy",
    detail: "Provider prerequisite was not observed by this passive plan.",
    reasonCode: "autonomy.prerequisite_lapsed",
  });
  assert.equal(unobserved.holdKind, "autonomy");
  assert.match(unobserved.detail ?? "", /not observed by this passive plan/i);
  assert(!/access is missing/i.test(unobserved.detail ?? ""));
  const brief = projectReadyBrief({
    workflowId: "workflow.fixture.ready",
    title: "Ready fixture",
    contractFiles: [],
    instructions: "Do this. ".repeat(400),
    open: ["/etc/passwd", "operations/LAUNCH_PROGRAM.md", "../escape"],
    consult: [],
    load: [],
    route: [],
    skills: [],
    tools: [],
    produce: ["PRODUCT.md"],
    verify: { kind: "none", gateCommands: ["check:catalog"], failClosed: true },
    approvals: [],
    tokenBudget: 8_000,
  } satisfies NodeBrief);
  assert.equal(brief.truncated, true);
  assert(brief.instructions.endsWith("…"));
  assert.deepEqual(brief.open, ["operations/LAUNCH_PROGRAM.md"]);
  assert.deepEqual(brief.produce, ["PRODUCT.md"]);
  assert.deepEqual(brief.verify.gateCommands, ["check:catalog"]);
  assert.equal(brief.effectBoundary, "read_and_produce");
  assert.equal(brief.context?.openCount, 1);
  const leftover = projectReadyBrief({
    workflowId: "workflow.fixture.leftover",
    title: "Leftover approvals",
    contractFiles: [],
    instructions: "Inspect only.",
    open: [],
    consult: [],
    load: [],
    route: [],
    skills: [],
    tools: [],
    produce: [],
    verify: { kind: "none", gateCommands: [], failClosed: true },
    approvals: ["Approve spend"],
    tokenBudget: 8_000,
  } satisfies NodeBrief);
  assert.equal(leftover.effectBoundary, "read_and_produce");
  const approvalHeld = projectHeldWork({
    nodeId: "run.fixture.approval",
    workflowId: "workflow.fixture.approval",
    title: "Approval hold",
    domainId: "domain.research",
    reason: "founder_approval",
    detail: "Waiting on a current founder hold.",
  });
  assert.equal(approvalHeld.effectBoundary, "founder_approval_required");
  const slicedBrief = projectReadyBrief({
    workflowId: "workflow.fixture.sliced",
    title: "Sliced fixture",
    contractFiles: [],
    instructions: "Do this.",
    open: [],
    consult: [],
    load: [],
    route: [],
    skills: [],
    tools: [],
    produce: [],
    verify: { kind: "none", gateCommands: [`check:${"c".repeat(240)}`], failClosed: true },
    approvals: ["A".repeat(500)],
    tokenBudget: 8_000,
  } satisfies NodeBrief);
  assert.equal(slicedBrief.truncated, true);
  assert(slicedBrief.approvals[0]?.endsWith("…"));
  assert(slicedBrief.verify.gateCommands[0]?.endsWith("…"));
  const question = projectFounderQuestion(
    {
      phase: "operating",
      class: "confirm-approval",
      prompt: "Should this proceed? ".repeat(40),
      choices: [
        { label: "Y".repeat(200), consequence: "C".repeat(300), recommended: true },
        { label: "No", consequence: "Leave this hold in place.", recommended: false },
      ],
      skippable: false,
      deferrable: false,
    },
    `sha256:${"a".repeat(64)}`,
  );
  assert(question);
  assert.equal(question.truncated, true);
  assert(question.prompt.endsWith("…"));
  assert((question.prompt.length ?? 0) <= 400);
});
