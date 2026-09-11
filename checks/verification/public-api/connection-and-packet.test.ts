import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  anyWorkerRuntimeFound,
  bothConfiguredRoutingGuidance,
  configuredConnectionSet,
  connectionCapabilityGuidance,
  connectionReceipt,
  connectionReceiptSchema,
  HOSTED_WRONG_SURFACE_TOOL_NAMES,
  hostedMcpInstructionsSuffix,
  hostedWrongSurfaceRefusal,
  interpretConfiguredConnection,
  isHostedWrongSurfaceTool,
  leftoverNameClientMatrix,
  leftoverNameMigrationGuidance,
  localMcpInstructions,
  observedLocalWorkspaceHealth,
  parseConnectionReceipt,
  selectConfiguredSurface,
  type ConnectionReceipt,
  type HostedWrongSurfaceRefusal,
} from "../../../contracts/public-api/connection-receipt.js";
import { PUBLIC_OPERATIONS } from "../../../contracts/public-api/contract.js";
import { KNOWLEDGE_TOOL_DEFINITIONS } from "../../../kernel/knowledge-service/tools.js";
import { toCatalogInput } from "../../../catalog/bridge.js";
import type { Catalog } from "../../../catalog/types.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { composeNodeBrief, type NodeBrief } from "../../../kernel/engine/node-brief.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import { projectHeldWork, projectInitializedBusinessPlan, projectReadyBrief, isLaterGuidance } from "../../../kernel/services/plan-projection.js";
import { buildWorkerPrompt } from "../../../kernel/session/worker-prompt.js";
import type { HeldNode, PlanReport } from "../../../kernel/session/plan.js";
import { handleApi, hostedWrongSurfaceMcpResponse } from "../../../hosted/knowledge-mcp/http.js";
import { buildHostedKnowledgeBundle } from "../../../tooling/render-hosted-bundle.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function leftoverNameProse(
  leftover: ReturnType<typeof interpretConfiguredConnection>,
  capability: string,
): string {
  return leftover.guidance.endsWith(capability)
    ? leftover.guidance.slice(0, leftover.guidance.length - capability.length).trim()
    : leftover.guidance;
}

function assertSingleCapability(text: string, receipt: ConnectionReceipt, label: string) {
  const capability = connectionCapabilityGuidance(receipt);
  assert.equal(text.split(capability).length - 1, 1, `${label} repeated connectionCapabilityGuidance`);
}

function assertRecommendedHandshakeGuidance(
  text: string,
  receipt: ConnectionReceipt,
  recommended: ReturnType<typeof interpretConfiguredConnection>,
  leftover: ReturnType<typeof interpretConfiguredConnection>,
  label: string,
) {
  const capability = connectionCapabilityGuidance(receipt);
  const leftoverProse = leftoverNameProse(leftover, capability);
  assert(leftoverProse.length > 0, `${label} leftover reading omitted leftover-name prose`);
  assert.equal(
    `${recommended.guidance} ${leftover.guidance}`.split(capability).length - 1,
    2,
    `${label} leftover.guidance no longer embeds connectionCapabilityGuidance`,
  );
  assert(text.includes(recommended.guidance), `${label} omitted recommended interpretConfiguredConnection guidance`);
  assert(text.includes(leftoverProse), `${label} omitted leftover leftover-name prose`);
  assertSingleCapability(text, receipt, label);
}

const emptyBrief = {
  contractFiles: [],
  consult: [],
  route: [],
  skills: [],
  tools: [],
  produce: [],
  verify: { kind: "none" as const, gateCommands: [], failClosed: true },
  tokenBudget: 8_000,
};

function readyBrief(overrides: Partial<NodeBrief> = {}): NodeBrief {
  return {
    workflowId: "workflow.fixture.ready",
    title: "Ready fixture",
    instructions: "Do the current research slice.",
    open: ["strategy/RESEARCH.md"],
    load: [],
    approvals: [],
    ...emptyBrief,
    ...overrides,
  };
}

test("setup prints a local connection receipt and distinct b2c-local registration", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-connection-"));
  const home = path.join(temp, "home");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "setup"], {
      cwd: temp,
      env: { ...process.env, B2C_APP_BUILDER_HOME: home },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /b2c-local/);
    assert.match(result.stdout, /b2c-hosted/);
    assert.match(result.stdout, /legacy local name/);
    const parsed = parseConnectionReceipt(result.stdout);
    assert.equal(parsed.mode, "local_execution");
    assert.equal(parsed.identity.recommended, "b2c-local");
    assert.deepEqual(parsed.identity.legacy, ["b2c-app-builder"]);
    assert.equal(parsed.declares.workspaceExecution, "local_cli");
    assert.equal(parsed.declares.writes, "cli_default");
    assert.equal(parsed.providerObservation, "not_tested");
    assert.equal(parsed.observed?.workspacePlanning, "available");
    assert.ok(
      parsed.observed?.workspaceExecution === "available" || parsed.observed?.workspaceExecution === "unavailable",
      "setup omitted observed.workspaceExecution",
    );
    if (parsed.observed?.workspaceExecution === "unavailable") {
      assert.match(result.stdout, /Execution health is separately degraded/);
      assert.doesNotMatch(result.stdout, /cannot access or run this local business/);
    } else {
      assert.match(result.stdout, /CLI-backed execution/);
    }
    assert.match(result.stdout, /Provider readiness is not implied by this receipt/);
    assert.match(result.stdout, /claude mcp add --scope user b2c-local/);
    assert.match(result.stdout, /\[mcp_servers\.b2c-local\]/);
    assert.match(result.stdout, /"b2c-local": \{ "command"/);
    assert.doesNotMatch(result.stdout, /claude mcp add --scope user b2c-app-builder(?:\s|$)/);
    const next = result.stdout.slice(Math.max(0, result.stdout.indexOf("Next steps:")));
    assert(next.includes("business-status"), "setup receipt path still omits business-status");
    assert(next.includes("business-plan"), "setup receipt path still omits business-plan");
    assert(next.indexOf("business-status") < next.indexOf("business-plan"), "setup receipt path lost status before plan");
    assert(next.indexOf("business-plan") < next.indexOf("b2c catalog --json"), "setup still leads with catalog before plan");
    assert.doesNotMatch(result.stdout, /first call is almost always b2c_catalog|first call is almost always b2c_knowledge_search/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("local MCP handshake name is b2c-local and leftover names stay on the receipt", async () => {
  const client = new Client({ name: "connection-identity", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(root, "entrypoints/mcp/server.ts")],
      cwd: root,
      env: { ...process.env, B2C_APP_BUILDER_MCP_READONLY: "1" },
      stderr: "pipe",
    }),
  );
  try {
    assert.equal(client.getServerVersion()?.name, "b2c-local");
    const instructions = client.getInstructions() ?? "";
    const receipt = parseConnectionReceipt(instructions);
    assert.equal(receipt.identity.recommended, "b2c-local");
    assert.deepEqual(receipt.identity.legacy, ["b2c-app-builder"]);
    assert.equal(receipt.providerObservation, "not_tested");
    assert.notEqual(receipt.observed?.knowledge, undefined);
    assert.equal(receipt.observed?.workspacePlanning, "available");
    assert.ok(
      receipt.observed?.workspaceExecution === "available" || receipt.observed?.workspaceExecution === "unavailable",
      "live handshake omitted observed.workspaceExecution",
    );
    if (receipt.observed?.workspaceExecution === "unavailable") {
      assert.match(instructions, /Execution health is separately degraded/);
      assert.doesNotMatch(instructions, /cannot access or run this local business/);
    }
    const recommended = interpretConfiguredConnection({ clientName: "b2c-local", receipt });
    const leftover = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt });
    assertRecommendedHandshakeGuidance(instructions, receipt, recommended, leftover, "live local handshake");
    const cwd = mkdtempSync(path.join(tmpdir(), "b2c-connection-plan-"));
    try {
      const routed = await client.callTool({ name: "b2c_plan", arguments: { utterance: "plan the app's onboarding flow", cwd } });
      assert.equal(routed.isError, undefined);
      const structured = routed.structuredContent as { kind?: string; connection?: typeof recommended };
      assert.equal(structured.kind, "route");
      assert.deepEqual(structured.connection, recommended);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  } finally {
    await client.close();
  }
});

test("local MCP instructions name local execution and refuse hosted-as-local", () => {
  const text = localMcpInstructions({
    knowledge: "available",
    engineVersion: "0.219.40",
    writes: "mcp_write_enabled",
    workspaceExecution: "available",
  });
  assert.match(text, /b2c-local/);
  assert.match(text, /b2c-hosted/);
  const receipt = parseConnectionReceipt(text);
  assert.equal(receipt.mode, "local_execution");
  assert.deepEqual(receipt.identity.legacy, ["b2c-app-builder"]);
  assert.equal(receipt.declares.knowledge, "bundled");
  assert.equal(receipt.providerObservation, "not_tested");
  assert.equal(receipt.observed?.knowledge, "available");
  assert.equal(receipt.observed?.writes, "mcp_write_enabled");
  assert.equal(receipt.observed?.workspacePlanning, "available");
  assert.equal(receipt.observed?.workspaceExecution, "available");
  assert.match(connectionCapabilityGuidance(receipt), /Provider readiness is not implied/);
  const leftover = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt });
  const recommended = interpretConfiguredConnection({ clientName: "b2c-local", receipt });
  assertRecommendedHandshakeGuidance(text, receipt, recommended, leftover, "local handshake");
});

test("hosted receipt declares hosted mode and omits the leftover local name", () => {
  const receipt = connectionReceiptSchema.parse(connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.40" }));
  assert.equal(receipt.identity.recommended, "b2c-hosted");
  assert.equal(receipt.identity.legacy, undefined);
  assert.equal(receipt.declares.workspacePlanning, "none");
  assert.equal(receipt.providerObservation, "not_tested");
  assert.equal(receipt.observed, undefined);
  assert.match(connectionCapabilityGuidance(receipt), /cannot access or run this local business/);
  const suffix = hostedMcpInstructionsSuffix("0.219.40");
  const leftover = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt });
  const recommended = interpretConfiguredConnection({ clientName: "b2c-hosted", receipt });
  assertRecommendedHandshakeGuidance(suffix, receipt, recommended, leftover, "hosted handshake");
  assert.match(suffix, /not a capability/);
  assert.match(suffix, /cannot access or run this local business/);
  assert.doesNotMatch(suffix, /legacy local name, not this hosted handshake/);
  assert.equal(parseConnectionReceipt(suffix).identity.legacy, undefined);
  assert.equal(parseConnectionReceipt(suffix).providerObservation, "not_tested");
});

test("leftover-name client matrix covers Claude, Cursor, and Codex without silent rewrite", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-leftover-names-"));
  const home = path.join(temp, "home");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "setup"], {
      cwd: temp,
      env: { ...process.env, B2C_APP_BUILDER_HOME: home },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const guidance = leftoverNameMigrationGuidance();
    assert(result.stdout.includes(guidance), "setup omitted leftover-name migration");
    assert.match(result.stdout, /Setup never edits Claude, Cursor, or Codex files/);
    assert.doesNotMatch(result.stdout, /claude mcp add --scope user b2c-app-builder(?:\s|$)/);
    const hostedPages = readFileSync(path.join(root, "hosted/builder-console/console/pages.ts"), "utf8");
    const hostedReadme = readFileSync(path.join(root, "hosted/knowledge-mcp/README.md"), "utf8");
    const packageGuide = readFileSync(path.join(root, "docs/guides/runtime-package.md"), "utf8");
    assert(packageGuide.includes("### Leftover names"), "package guide omitted leftover-name matrix");
    assert(packageGuide.includes("Setup never edits those files"));
    for (const row of leftoverNameClientMatrix) {
      assert(result.stdout.includes(row.freshLocal), `${row.client} fresh local snippet missing from setup`);
      assert(guidance.includes(row.leftoverLocal), `${row.client} leftover name missing from migration guidance`);
      assert(
        hostedPages.includes(row.hosted) || hostedReadme.includes(row.hosted),
        `${row.client} hosted snippet missing from hosted setup surfaces`,
      );
    }
    assert(hostedReadme.includes("Keep the local `b2c-local` entry"), "hosted README lost the local recommended name");
    assert(hostedReadme.includes("leftover `b2c-app-builder` client name is not this hosted connection"));
    assert(hostedReadme.includes("When both are configured"), "hosted README omitted both-configured routing");
    assert(guidance.includes(bothConfiguredRoutingGuidance()), "migration guidance omitted both-configured routing");
    assert(packageGuide.includes("workspace planning and execution use `b2c-local`"), "package guide omitted local surface selection");
    assert(packageGuide.includes("hosted knowledge uses `b2c-hosted`"), "package guide omitted hosted surface selection");
    assert(packageGuide.includes("not a third surface"), "package guide omitted leftover-is-not-third-surface");
    assert(packageGuide.includes("Duplicate names are a collision"), "package guide omitted duplicate-name collision");
    assert(
      packageGuide.includes("A local receipt reports worker-runtime health separately"),
      "package guide omitted worker-runtime health",
    );
    assert(hostedReadme.includes("A missing local worker CLI is local execution health"), "hosted README omitted worker-runtime health");
    const skill = readFileSync(path.join(root, "SKILL.md"), "utf8");
    assert(skill.includes("When both are configured, select by that capability"), "skill omitted both-configured selection");
    assert(skill.includes("Duplicate names are a collision"), "skill omitted duplicate-name collision");
    assert(skill.includes("A missing worker CLI degrades local execution health"), "skill omitted worker-runtime health");
    assert(
      packageGuide.includes("degraded execution still selects `b2c-local`"),
      "package guide omitted degraded execution surface selection",
    );
    assert(hostedReadme.includes("degraded execution still selects `b2c-local`"), "hosted README omitted degraded execution surface selection");
    assert(skill.includes("Degraded execution still selects b2c-local"), "skill omitted degraded execution surface selection");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("leftover client names take capability from the handshake, including both-configured sets", () => {
  const local = connectionReceipt({ mode: "local_execution", engineVersion: "0.219.89" });
  const hosted = connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.89" });
  const leftoverLocal = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt: local });
  const leftoverHosted = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt: hosted });
  const recommendedLocal = interpretConfiguredConnection({ clientName: "b2c-local", receipt: local });
  const recommendedHosted = interpretConfiguredConnection({ clientName: "b2c-hosted", receipt: hosted });
  assert.equal(leftoverLocal.leftoverName, true);
  assert.equal(leftoverLocal.mode, "local_execution");
  assert.match(leftoverLocal.guidance, /legacy local registration/);
  assert.match(leftoverLocal.guidance, /Provider readiness is not implied/);
  assert.equal(leftoverHosted.leftoverName, true);
  assert.equal(leftoverHosted.mode, "hosted_knowledge");
  assert.match(leftoverHosted.guidance, /not a capability/);
  assert.match(leftoverHosted.guidance, /cannot access or run this local business/);
  assert.equal(recommendedLocal.leftoverName, false);
  assert.equal(recommendedHosted.leftoverName, false);
  const both = configuredConnectionSet([
    { clientName: "b2c-local", receipt: local },
    { clientName: "b2c-hosted", receipt: hosted },
  ]);
  assert.equal(both.bothConfigured, true);
  assert.equal(both.duplicateNames, false);
  assert.equal(both.leftoverPointsAtLocal, false);
  assert.equal(both.leftoverPointsAtHosted, false);
  const leftoverPlusHosted = configuredConnectionSet([
    { clientName: "b2c-app-builder", receipt: local },
    { clientName: "b2c-hosted", receipt: hosted },
  ]);
  assert.equal(leftoverPlusHosted.bothConfigured, true);
  assert.equal(leftoverPlusHosted.leftoverPointsAtLocal, true);
  assert.equal(leftoverPlusHosted.duplicateNames, false);
  const leftoverNamedHosted = configuredConnectionSet([{ clientName: "b2c-app-builder", receipt: hosted }]);
  assert.equal(leftoverNamedHosted.leftoverPointsAtHosted, true);
  assert.equal(leftoverNamedHosted.bothConfigured, false);
  const leftoverHostedHandshake = hostedMcpInstructionsSuffix("0.219.89", "b2c-app-builder");
  assert(leftoverHostedHandshake.includes(leftoverHosted.guidance));
  assert.equal((leftoverHostedHandshake.match(/not a capability/g) ?? []).length, 1);
  assertSingleCapability(leftoverHostedHandshake, hosted, "leftover hosted handshake");
  const leftoverLocalHandshake = localMcpInstructions({
    knowledge: "available",
    engineVersion: "0.219.89",
    writes: "mcp_readonly",
    clientName: "b2c-app-builder",
    workspaceExecution: "available",
  });
  assert(leftoverLocalHandshake.includes(leftoverLocal.guidance));
  assert.doesNotMatch(leftoverLocalHandshake, /The leftover client name b2c-app-builder is the legacy local registration.*The leftover client name b2c-app-builder is the legacy local registration/);
  assertSingleCapability(leftoverLocalHandshake, local, "leftover local handshake");
});

test("both-configured sets select a surface and refuse duplicate names", () => {
  const local = connectionReceipt({ mode: "local_execution", engineVersion: "0.219.110" });
  const hosted = connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.110" });
  const recommendedLocal = interpretConfiguredConnection({ clientName: "b2c-local", receipt: local });
  const recommendedHosted = interpretConfiguredConnection({ clientName: "b2c-hosted", receipt: hosted });
  const leftoverLocal = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt: local });
  const leftoverHosted = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt: hosted });
  const both = [
    { clientName: "b2c-local", receipt: local },
    { clientName: "b2c-hosted", receipt: hosted },
  ];
  const execution = selectConfiguredSurface({ entries: both, need: "workspace_execution" });
  const planning = selectConfiguredSurface({ entries: both, need: "workspace_planning" });
  const knowledge = selectConfiguredSurface({ entries: both, need: "knowledge" });
  assert.equal(execution.status, "selected");
  assert.equal(planning.status, "selected");
  assert.equal(knowledge.status, "selected");
  if (execution.status !== "selected" || planning.status !== "selected" || knowledge.status !== "selected") return;
  assert.equal(execution.set.bothConfigured, true);
  assert.equal(execution.set.duplicateNames, false);
  assert.deepEqual(execution.connection, recommendedLocal);
  assert.deepEqual(planning.connection, recommendedLocal);
  assert.deepEqual(knowledge.connection, recommendedHosted);
  assert.equal(execution.connection.clientName, "b2c-local");
  assert.equal(knowledge.connection.clientName, "b2c-hosted");
  assert.match(execution.guidance, /Use b2c-local for workspace execution/);
  assert.match(knowledge.guidance, /Use b2c-hosted for hosted knowledge/);
  assert.doesNotMatch(execution.guidance, /Use b2c-hosted for workspace/);
  assert.doesNotMatch(knowledge.guidance, /Use b2c-local for hosted knowledge/);
  assertSingleCapability(execution.connection.guidance, local, "both-configured execution");
  assertSingleCapability(knowledge.connection.guidance, hosted, "both-configured knowledge");
  const routing = bothConfiguredRoutingGuidance();
  assert(routing.includes(`Workspace planning and execution use ${execution.connection.clientName}`));
  assert(routing.includes(`Hosted knowledge uses ${knowledge.connection.clientName}`));
  assert(routing.includes("Duplicate names are a collision, not a capability."));
  assert.doesNotMatch(routing, /disconnected/);

  const leftoverPlusHosted = [
    { clientName: "b2c-app-builder", receipt: local },
    { clientName: "b2c-hosted", receipt: hosted },
  ];
  const leftoverExecution = selectConfiguredSurface({ entries: leftoverPlusHosted, need: "workspace_execution" });
  const leftoverKnowledge = selectConfiguredSurface({ entries: leftoverPlusHosted, need: "knowledge" });
  assert.equal(leftoverExecution.status, "selected");
  assert.equal(leftoverKnowledge.status, "selected");
  if (leftoverExecution.status !== "selected" || leftoverKnowledge.status !== "selected") return;
  assert.deepEqual(leftoverExecution.connection, leftoverLocal);
  assert.deepEqual(leftoverKnowledge.connection, recommendedHosted);
  assert.equal(leftoverExecution.set.leftoverPointsAtLocal, true);

  const leftoverAsThird = selectConfiguredSurface({
    entries: [...both, { clientName: "b2c-app-builder", receipt: local }],
    need: "workspace_execution",
  });
  assert.equal(leftoverAsThird.status, "selected");
  if (leftoverAsThird.status !== "selected") return;
  assert.equal(leftoverAsThird.connection.clientName, "b2c-local");
  assert.equal(leftoverAsThird.connection.leftoverName, false);

  const leftoverHostedOnly = selectConfiguredSurface({
    entries: [{ clientName: "b2c-app-builder", receipt: hosted }],
    need: "workspace_execution",
  });
  assert.equal(leftoverHostedOnly.status, "wrong_surface");
  if (leftoverHostedOnly.status !== "wrong_surface") return;
  assert.deepEqual(leftoverHostedOnly.connection, leftoverHosted);
  assert.equal(leftoverHostedOnly.guidance, leftoverHosted.guidance);

  const localKnowledge = selectConfiguredSurface({
    entries: [{ clientName: "b2c-local", receipt: local }],
    need: "knowledge",
  });
  assert.equal(localKnowledge.status, "selected");
  if (localKnowledge.status !== "selected") return;
  assert.deepEqual(localKnowledge.connection, recommendedLocal);
  assert.match(localKnowledge.guidance, /packaged knowledge/);
  assert.doesNotMatch(localKnowledge.guidance, /disconnected/);
  assert.equal(localKnowledge.set.bothConfigured, false);

  const collision = selectConfiguredSurface({
    entries: [
      { clientName: "b2c-local", receipt: local },
      { clientName: "b2c-local", receipt: hosted },
    ],
    need: "workspace_execution",
  });
  assert.equal(collision.status, "collision");
  if (collision.status !== "collision") return;
  assert.equal(collision.set.duplicateNames, true);
  assert.equal("connection" in collision, false);
  assert.match(collision.guidance, /collision, not a capability/);
  assert.doesNotMatch(collision.guidance, /Use b2c-local for workspace execution/);

  const none = selectConfiguredSurface({ entries: [], need: "workspace_execution" });
  assert.equal(none.status, "unavailable");
  if (none.status !== "unavailable") return;
  assert.match(none.guidance, /Connect the local builder as b2c-local/);
});

test("hosted API discovery includes interpretConfiguredConnection reading", async () => {
  const service = createKnowledgeService(buildHostedKnowledgeBundle(root));
  const response = await handleApi(new Request("https://knowledge.test/api/v1"), service);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { connection?: ReturnType<typeof interpretConfiguredConnection> };
  const expected = interpretConfiguredConnection({
    clientName: "b2c-hosted",
    receipt: connectionReceipt({ mode: "hosted_knowledge", engineVersion: service.metadata.engineVersion }),
  });
  assert.deepEqual(body.connection, expected);
});

test("hosted local-only MCP names fail as wrong-surface with receipt guidance", async () => {
  const service = createKnowledgeService(buildHostedKnowledgeBundle(root));
  const hosted = connectionReceipt({ mode: "hosted_knowledge", engineVersion: service.metadata.engineVersion });
  const expected = interpretConfiguredConnection({ clientName: "b2c-hosted", receipt: hosted });
  const publicMcp = PUBLIC_OPERATIONS.flatMap((operation) => (operation.mcp === null ? [] : [operation.mcp]));
  const localWorkspaceTools = [
    "b2c_plan",
    "b2c_status",
    "b2c_operate",
    "b2c_bootstrap",
    "b2c_run",
    "b2c_approvals",
    "b2c_verify",
    "b2c_schedule",
  ] as const;
  assert.deepEqual(
    [...HOSTED_WRONG_SURFACE_TOOL_NAMES].sort(),
    [...new Set([...publicMcp, ...localWorkspaceTools])].sort(),
    "hosted wrong-surface names must cover every local-only public MCP name",
  );
  for (const tool of KNOWLEDGE_TOOL_DEFINITIONS) {
    assert.equal(isHostedWrongSurfaceTool(tool.name), false, tool.name);
  }
  assert.equal(isHostedWrongSurfaceTool("b2c_not_a_tool"), false);
  for (const toolName of HOSTED_WRONG_SURFACE_TOOL_NAMES) {
    assert.equal(isHostedWrongSurfaceTool(toolName), true, toolName);
    const response = await handleApi(
      new Request(`https://knowledge.test/api/v1/tools/${toolName}`, { method: "POST", body: "{}" }),
      service,
    );
    assert.equal(response.status, 400, toolName);
    const body = (await response.json()) as HostedWrongSurfaceRefusal;
    const refusal = hostedWrongSurfaceRefusal({ engineVersion: service.metadata.engineVersion, toolName });
    assert.deepEqual(body, refusal);
    assert.deepEqual(body.connection, expected);
    assert.equal(body.connection.guidance, expected.guidance);
    assert.match(body.connection.guidance, /cannot access or run this local business/);
    assert.doesNotMatch(JSON.stringify(body), /Knowledge tool was not found/);
    assertSingleCapability(JSON.stringify(body), hosted, `${toolName} HTTP wrong-surface`);
  }
  const leftover = hostedWrongSurfaceRefusal({
    engineVersion: service.metadata.engineVersion,
    toolName: "b2c_discover",
    clientName: "b2c-app-builder",
  });
  assert.equal(leftover.connection.leftoverName, true);
  assert.match(leftover.connection.guidance, /not a capability/);
  assertSingleCapability(leftover.connection.guidance, hosted, "leftover hosted wrong-surface");
  const unknown = await handleApi(
    new Request("https://knowledge.test/api/v1/tools/b2c_not_a_tool", { method: "POST", body: "{}" }),
    service,
  );
  assert.equal(unknown.status, 404);
  const unknownBody = await unknown.text();
  assert.match(unknownBody, /not_found/);
  assert.doesNotMatch(unknownBody, /wrong_surface/);
  assert.doesNotMatch(unknownBody, /cannot access or run this local business/);
  for (const toolName of ["b2c_run", "b2c_discover", "b2c_compose", "b2c_market_report"] as const) {
    const mcp = hostedWrongSurfaceMcpResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: toolName, arguments: {} } }),
      service.metadata.engineVersion,
    ) as { result?: { isError?: boolean; structuredContent?: HostedWrongSurfaceRefusal } };
    assert.equal(mcp.result?.isError, true, toolName);
    assert.deepEqual(
      mcp.result?.structuredContent,
      hostedWrongSurfaceRefusal({ engineVersion: service.metadata.engineVersion, toolName }),
    );
  }
  assert.equal(
    hostedWrongSurfaceMcpResponse(
      JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "b2c_catalog", arguments: { limit: 1 } } }),
      service.metadata.engineVersion,
    ),
    null,
  );
});

test("missing local worker CLI degrades execution health without hosted wrong-surface", () => {
  assert.equal(anyWorkerRuntimeFound([]), false);
  assert.equal(anyWorkerRuntimeFound([{ available: false }, { available: false }]), false);
  assert.equal(anyWorkerRuntimeFound([{ available: false }, { available: true }]), true);
  const missing = observedLocalWorkspaceHealth({ workerRuntimeFound: false });
  const present = observedLocalWorkspaceHealth({ workerRuntimeFound: true });
  assert.deepEqual(missing, { workspacePlanning: "available", workspaceExecution: "unavailable" });
  assert.deepEqual(present, { workspacePlanning: "available", workspaceExecution: "available" });
  const degraded = connectionReceipt({
    mode: "local_execution",
    engineVersion: "0.219.121",
    observed: missing,
  });
  const healthy = connectionReceipt({
    mode: "local_execution",
    engineVersion: "0.219.121",
    observed: present,
  });
  const hosted = connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.121" });
  assert.equal(degraded.declares.workspaceExecution, "local_cli");
  assert.equal(degraded.observed?.workspacePlanning, "available");
  assert.equal(degraded.observed?.workspaceExecution, "unavailable");
  assert.equal(degraded.providerObservation, "not_tested");
  assert.match(connectionCapabilityGuidance(degraded), /Execution health is separately degraded/);
  assert.match(connectionCapabilityGuidance(degraded), /Fixture sessions still run/);
  assert.doesNotMatch(connectionCapabilityGuidance(degraded), /cannot access or run this local business/);
  assert.match(connectionCapabilityGuidance(healthy), /CLI-backed execution/);
  assert.doesNotMatch(connectionCapabilityGuidance(healthy), /separately degraded/);
  assert.equal(hosted.observed?.workspaceExecution, undefined);
  assert.match(connectionCapabilityGuidance(hosted), /cannot access or run this local business/);
  assert.doesNotMatch(connectionCapabilityGuidance(hosted), /separately degraded/);
  const omitted = connectionReceipt({ mode: "local_execution", engineVersion: "0.219.121" });
  assert.equal(omitted.observed?.workspaceExecution, undefined);
  const instructions = localMcpInstructions({
    knowledge: "available",
    engineVersion: "0.219.121",
    writes: "mcp_readonly",
    workspaceExecution: "unavailable",
  });
  const parsed = parseConnectionReceipt(instructions);
  assert.equal(parsed.observed?.workspacePlanning, "available");
  assert.equal(parsed.observed?.workspaceExecution, "unavailable");
  assert.match(instructions, /Execution health is separately degraded/);
  assert.doesNotMatch(instructions, /cannot access or run this local business/);
  assert.equal(parsed.identity.recommended, "b2c-local");
  assert.equal(parsed.providerObservation, "not_tested");
  const omittedInstructions = localMcpInstructions({
    knowledge: "available",
    engineVersion: "0.219.121",
    writes: "mcp_readonly",
    workspaceExecution: "available",
  });
  assert.notEqual(
    parseConnectionReceipt(omittedInstructions).observed?.workspaceExecution,
    undefined,
    "local handshake helper omitted observed.workspaceExecution",
  );
});

test("degraded local execution still selects local and not hosted wrong-surface", () => {
  const degraded = connectionReceipt({
    mode: "local_execution",
    engineVersion: "0.219.125",
    observed: observedLocalWorkspaceHealth({ workerRuntimeFound: false }),
  });
  const hosted = connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.125" });
  const recommendedLocal = interpretConfiguredConnection({ clientName: "b2c-local", receipt: degraded });
  const leftoverLocal = interpretConfiguredConnection({ clientName: "b2c-app-builder", receipt: degraded });
  const both = [
    { clientName: "b2c-local", receipt: degraded },
    { clientName: "b2c-hosted", receipt: hosted },
  ];
  const execution = selectConfiguredSurface({ entries: both, need: "workspace_execution" });
  const planning = selectConfiguredSurface({ entries: both, need: "workspace_planning" });
  const knowledge = selectConfiguredSurface({ entries: both, need: "knowledge" });
  assert.equal(execution.status, "selected");
  assert.equal(planning.status, "selected");
  assert.equal(knowledge.status, "selected");
  if (execution.status !== "selected" || planning.status !== "selected" || knowledge.status !== "selected") return;
  assert.deepEqual(execution.connection, recommendedLocal);
  assert.equal(execution.guidance, recommendedLocal.guidance);
  assert.match(execution.guidance, /Execution health is separately degraded/);
  assert.doesNotMatch(execution.guidance, /Use b2c-local for workspace execution/);
  assert.doesNotMatch(execution.guidance, /cannot access or run this local business/);
  assert.equal(execution.connection.clientName, "b2c-local");
  assert.equal(execution.connection.leftoverName, false);
  assert.match(planning.guidance, /Use b2c-local for workspace planning/);
  assert.doesNotMatch(planning.guidance, /separately degraded/);
  assert.match(knowledge.guidance, /Use b2c-hosted for hosted knowledge/);
  const leftoverExecution = selectConfiguredSurface({
    entries: [
      { clientName: "b2c-app-builder", receipt: degraded },
      { clientName: "b2c-hosted", receipt: hosted },
    ],
    need: "workspace_execution",
  });
  assert.equal(leftoverExecution.status, "selected");
  if (leftoverExecution.status !== "selected") return;
  assert.deepEqual(leftoverExecution.connection, leftoverLocal);
  assert.equal(leftoverExecution.guidance, leftoverLocal.guidance);
  assert.equal(leftoverExecution.connection.leftoverName, true);
  assert.match(leftoverExecution.guidance, /legacy local registration/);
  assert.match(leftoverExecution.guidance, /Execution health is separately degraded/);
  assert.doesNotMatch(leftoverExecution.guidance, /cannot access or run this local business/);
  const hostedOnly = selectConfiguredSurface({
    entries: [{ clientName: "b2c-hosted", receipt: hosted }],
    need: "workspace_execution",
  });
  assert.equal(hostedOnly.status, "wrong_surface");
  if (hostedOnly.status !== "wrong_surface") return;
  assert.match(hostedOnly.guidance, /cannot access or run this local business/);
  assert.doesNotMatch(hostedOnly.guidance, /separately degraded/);
  const routing = bothConfiguredRoutingGuidance();
  assert.match(routing, /missing worker CLI degrades local execution health/);
  assert.match(routing, /does not select hosted knowledge for execution/);
  assert.doesNotMatch(routing, /cannot access or run this local business/);
  const healthy = connectionReceipt({
    mode: "local_execution",
    engineVersion: "0.219.125",
    observed: observedLocalWorkspaceHealth({ workerRuntimeFound: true }),
  });
  const healthyExecution = selectConfiguredSurface({
    entries: [{ clientName: "b2c-local", receipt: healthy }],
    need: "workspace_execution",
  });
  assert.equal(healthyExecution.status, "selected");
  if (healthyExecution.status !== "selected") return;
  assert.match(healthyExecution.guidance, /Use b2c-local for workspace execution/);
  assert.doesNotMatch(healthyExecution.guidance, /separately degraded/);
});

test("connection receipt never treats handshake or leftover names as provider readiness", () => {
  const local = connectionReceipt({
    mode: "local_execution",
    engineVersion: "0.219.40",
    observed: { knowledge: "available", writes: "mcp_write_enabled", ...observedLocalWorkspaceHealth({ workerRuntimeFound: false }) },
  });
  const hosted = connectionReceipt({ mode: "hosted_knowledge", engineVersion: "0.219.40" });
  assert.equal(local.providerObservation, "not_tested");
  assert.equal(hosted.providerObservation, "not_tested");
  assert.equal(
    connectionCapabilityGuidance({ ...local, identity: { recommended: "b2c-hosted" } } as ConnectionReceipt),
    connectionCapabilityGuidance(local),
  );
  assert.equal(
    connectionCapabilityGuidance({ ...hosted, identity: { recommended: "b2c-local", legacy: ["b2c-app-builder"] } } as ConnectionReceipt),
    connectionCapabilityGuidance(hosted),
  );
  assert.throws(
    () => connectionReceiptSchema.parse({ ...local, providerObservation: "ready" }),
    /invalid_literal|invalid_value/,
  );
});

test("worker packet keeps current-task guidance and accounts deferred later load", () => {
  assert.equal(isLaterGuidance("always"), false);
  assert.equal(isLaterGuidance("before this task"), false);
  assert.equal(isLaterGuidance("later, after launch"), true);
  assert.equal(isLaterGuidance("After launch"), true);
  assert.equal(
    isLaterGuidance("before accessibility declarations, beta readiness, or store submission", { workflowId: "workflow.engineering.accessibility-common-task-proof" }, { path: "knowledge/engineering/accessibility-readiness.md" }),
    false,
  );
  assert.equal(
    isLaterGuidance(
      "calibrating complete consumer-business mobile and landing craft against primary-source product examples before production and independent review",
      { workflowId: "workflow.orchestration.full-launch-program" },
      { path: "knowledge/design/consumer-craft-benchmarks.md" },
    ),
    true,
  );
  const paidToolRoutingWhen =
    "at workflow start for the one tool-intake question, before using or replacing any paid/account-gated tool, before running a free fallback, or when a service is missing from the runtime";
  assert.equal(
    isLaterGuidance(paidToolRoutingWhen, { workflowId: "workflow.orchestration.full-launch-program" }, {
      path: "knowledge/operations/paid-tool-routing.md",
      referenceId: "reference.operations.paid-tool-routing",
    }),
    true,
    "program packets must not load the operator tool-intake book because its loadWhen says at workflow start",
  );
  assert.equal(
    isLaterGuidance(paidToolRoutingWhen, { workflowId: "workflow.operations.paid-tool-routing-and-fallback" }, {
      path: "knowledge/operations/paid-tool-routing.md",
      referenceId: "reference.operations.paid-tool-routing",
    }),
    false,
    "paid-tool-routing stays current on its own action",
  );
  assert.equal(
    isLaterGuidance(
      "always for dispatched business workers; especially every broad launch start, account/social/Doppler bootstrap, founder uncertainty, or attempted checklist handoff",
      { workflowId: "workflow.orchestration.full-launch-program" },
      { path: "knowledge/operations/founder-zero-operator.md", referenceId: "reference.operations.founder-zero-operator" },
    ),
    true,
    "always does not keep founder-zero-operator current on a program packet",
  );
  assert.equal(
    isLaterGuidance(
      "always for dispatched business workers; especially every broad launch start, account/social/Doppler bootstrap, founder uncertainty, or attempted checklist handoff",
      { workflowId: "workflow.operations.founder-zero-operator-bootstrap" },
      { path: "knowledge/operations/founder-zero-operator.md", referenceId: "reference.operations.founder-zero-operator" },
    ),
    false,
  );
  assert.equal(
    isLaterGuidance(
      "before threat modeling, hardening, scans, or any security-readiness claim",
      { workflowId: "workflow.orchestration.full-launch-program" },
      { path: "knowledge/trust/security-release-hardening.md", referenceId: "reference.trust.security-release-hardening" },
    ),
    true,
  );
  assert.equal(
    isLaterGuidance(
      "before threat modeling, hardening, scans, or any security-readiness claim",
      { workflowId: "workflow.trust.security-architecture-and-release-gate" },
      { path: "knowledge/trust/security-release-hardening.md", referenceId: "reference.trust.security-release-hardening" },
    ),
    false,
  );
  const brief = projectReadyBrief(
    readyBrief({
      consult: ["operations/FOUNDER_BRIEF.md"],
      load: [
        { path: "knowledge/research/now.md", title: "Now", loadWhen: "before this task" },
        { path: "knowledge/store/later.md", title: "Later", loadWhen: "later, after launch" },
      ],
    }),
  );
  assert.deepEqual(
    brief.load.map((entry) => entry.path),
    ["knowledge/research/now.md"],
  );
  assert.equal(brief.context?.deferredLoadCount, 1);
  assert.equal(brief.context?.loadCount, 1);
  assert.equal(brief.effectBoundary, "read_and_produce");
  assert.match(brief.readyWhy ?? "", /prerequisites are satisfied/);
  assert.match(brief.continuation ?? "", /return to business-plan/);
  const leftoverApprovals = projectReadyBrief(readyBrief({ approvals: ["Approve spend"] }));
  assert.equal(leftoverApprovals.effectBoundary, "read_and_produce");
  const held = projectHeldWork({
    nodeId: "run.fixture.held",
    workflowId: "workflow.fixture.held",
    title: "Held fixture",
    domainId: "domain.research",
    reason: "founder_approval",
    detail: "Waiting on a current founder hold.",
  } satisfies HeldNode);
  assert.equal(held.effectBoundary, "founder_approval_required");
});

test("plan projection labels granted leftover approvals as read_and_produce and held founder work as founder_approval_required", () => {
  const report = {
    planId: "plan.fixture",
    catalogVersion: "0.0.0",
    totalNodes: 2,
    done: 0,
    batches: [
      [
        {
          nodeId: "run.fixture.ready",
          workflowId: "workflow.fixture.ready",
          title: "Ready fixture",
          domainId: "domain.research",
          reason: "upstream",
          detail: "",
        },
      ],
    ],
    readyBriefs: [readyBrief({ approvals: ["Approve spend"] })],
    held: [
      {
        nodeId: "run.fixture.held",
        workflowId: "workflow.fixture.held",
        title: "Held fixture",
        domainId: "domain.research",
        reason: "founder_approval",
        detail: "Waiting on a current founder hold.",
      },
    ],
    autonomyUnset: false,
    founderQuestion: null,
  } satisfies PlanReport;
  const plan = projectInitializedBusinessPlan({
    workspaceId: "fixture",
    revision: `sha256:${"a".repeat(64)}`,
    report,
    completion: {
      deliveryAccepted: false,
      closeoutWorkflowId: "workflow.orchestration.full-launch-closeout",
      requiredCount: 0,
      excludedCount: 0,
      outstandingCount: 0,
      assessed: false,
      nextAction: "Continue.",
    },
  });
  assert.equal(plan.ready[0]?.brief?.approvals[0], "Approve spend");
  assert.equal(plan.ready[0]?.brief?.effectBoundary, "read_and_produce");
  assert.equal(plan.held[0]?.effectBoundary, "founder_approval_required");
});

function catalogProjection(workflowId: string) {
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog/generated/catalog.json"), "utf8")) as {
    references: Array<{ id: string; path: string; title: string; loadWhen: string }>;
    workflows: Array<{ id: string; title: string; instructions: string; referenceIds: string[]; founderOnlyActions: string[] }>;
  };
  const workflow = catalog.workflows.find((entry) => entry.id === workflowId);
  assert(workflow, `catalog lost ${workflowId}`);
  const refs = new Map(catalog.references.map((entry) => [entry.id, entry]));
  const load = workflow.referenceIds.map((id) => {
    const reference = refs.get(id)!;
    return { path: reference.path, title: reference.title, loadWhen: reference.loadWhen, referenceId: id };
  });
  return { workflow, load, projected: projectReadyBrief(readyBrief({ workflowId: workflow.id, title: workflow.title, instructions: workflow.instructions, approvals: [...workflow.founderOnlyActions], load })) };
}

test("full-launch-program packet defers real catalog later-horizon loads", () => {
  const { workflow, load, projected } = catalogProjection("workflow.orchestration.full-launch-program");
  assert(projected.context && projected.context.deferredLoadCount > 0, "a real full-launch-program packet must defer later-horizon catalog loadWhen");
  assert(projected.load.some((entry) => /full-launch-program/.test(entry.path)), "program-open guidance must remain current");
  assert(
    !projected.load.some((entry) => /paid-tool-routing|security-release-hardening|doppler-organization|founder-zero-operator|secrets-management/.test(entry.path)),
    "operator and security procedures must not be current reading on the program packet",
  );
  assert.equal(projected.effectBoundary, "read_and_produce");
  const prompt = buildWorkerPrompt(
    readyBrief({
      workflowId: workflow.id,
      title: workflow.title,
      instructions: "Open the program.",
      load,
    }),
    "/tmp/business",
    "/tmp/skill",
  );
  assert.match(prompt, /DEFERRED LATER KNOWLEDGE/);
  assert.match(prompt, /not current reading/);
  assert.doesNotMatch(prompt.split("DEFERRED LATER KNOWLEDGE")[0] ?? "", /consumer-craft-benchmarks/);
});

test("specialist workflows keep their own current books that a program packet defers", () => {
  const accessibility = catalogProjection("workflow.engineering.accessibility-common-task-proof");
  assert.equal(accessibility.projected.load.length, 1, "accessibility-common-task-proof must keep its current load");
  assert(accessibility.projected.load.some((entry) => /accessibility-readiness/.test(entry.path)));
  assert.equal(accessibility.projected.context?.deferredLoadCount, 0);

  const designRoom = catalogProjection("workflow.design.design-room");
  assert(designRoom.projected.load.some((entry) => /design-evidence-stack/.test(entry.path)), "Design Room must keep design-evidence-stack");
  assert(designRoom.projected.load.some((entry) => /mobile-flow-craft/.test(entry.path)), "Design Room must keep mobile-flow-craft");

  const premium = catalogProjection("workflow.design.premium-mobile-craft");
  assert(premium.projected.load.some((entry) => /design-evidence-stack/.test(entry.path)), "premium-mobile-craft must keep design-evidence-stack");
  assert(premium.projected.load.some((entry) => /mobile-flow-craft/.test(entry.path)), "premium-mobile-craft must keep mobile-flow-craft");

  const crossDomainCurrent = [
    { workflowId: "workflow.experience.onboarding-system.onb-16-journey-graph", keep: ["design-evidence-stack"] },
    { workflowId: "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract", keep: ["design-evidence-stack", "mobile-flow-craft"] },
    { workflowId: "workflow.experience.onboarding-system.onb-18-visual-design-prototype", keep: ["design-evidence-stack", "mobile-flow-craft"] },
    { workflowId: "workflow.store.store-screenshots-production", keep: ["design-evidence-stack", "mobile-flow-craft"] },
    { workflowId: "workflow.growth.pre-launch-funnel-landing-waitlist", keep: ["design-evidence-stack"] },
    { workflowId: "workflow.experience.emotional-experience-design-producer", keep: ["design-evidence-stack"] },
  ] as const;
  for (const { workflowId, keep } of crossDomainCurrent) {
    const { projected } = catalogProjection(workflowId);
    for (const needle of keep) {
      assert(projected.load.some((entry) => entry.path.includes(needle)), `${workflowId} must keep current ${needle}`);
    }
  }

  const program = catalogProjection("workflow.orchestration.full-launch-program");
  assert(!program.projected.load.some((entry) => /design-evidence-stack|mobile-flow-craft|accessibility-readiness|paid-tool-routing/.test(entry.path)));

  const paidTools = catalogProjection("workflow.operations.paid-tool-routing-and-fallback");
  assert(paidTools.projected.load.some((entry) => /paid-tool-routing/.test(entry.path)), "paid-tool-routing-and-fallback must keep its operator book");
  assert.equal(paidTools.projected.context?.deferredLoadCount, 0);

  const secrets = catalogProjection("workflow.operations.secrets-baseline-and-routing");
  assert(secrets.projected.load.some((entry) => /doppler-organization/.test(entry.path)), "secrets-baseline-and-routing must keep doppler-organization");
  assert(secrets.projected.load.some((entry) => /secrets-management/.test(entry.path)), "secrets-baseline-and-routing must keep secrets-management");

  const security = catalogProjection("workflow.trust.security-architecture-and-release-gate");
  assert(security.projected.load.some((entry) => /security-release-hardening/.test(entry.path)), "security-architecture-and-release-gate must keep its security book");

  const founderZero = catalogProjection("workflow.operations.founder-zero-operator-bootstrap");
  assert(founderZero.projected.load.some((entry) => /founder-zero-operator/.test(entry.path)), "founder-zero-operator-bootstrap must keep its operator book");
});

test("live compose and dispatch packets keep program deferred counts and fastlane's own book", () => {
  const catalog = JSON.parse(readFileSync(path.join(root, "catalog/generated/catalog.json"), "utf8")) as Catalog;
  const compiled = compilePlan(toCatalogInput(catalog));
  const byWorkflowId = new Map(compiled.nodes.map((node) => [node.workflowId, node]));
  const service = createKnowledgeService(buildHostedKnowledgeBundle(root));

  const programNode = byWorkflowId.get("workflow.orchestration.full-launch-program");
  assert(programNode, "full-launch-program missing from the compiled runtime plan");
  const composedProgram = composeNodeBrief(programNode, compiled);
  const dispatchedProgram = service.workflow({ workflowId: programNode.workflowId, brief: true }).dispatchBrief!;
  for (const packet of [composedProgram, dispatchedProgram]) {
    assert((packet.deferredLoad?.length ?? 0) > 0, `${packet.workflowId} live packet lost deferred later-horizon binds`);
    assert(packet.load.some((entry) => /full-launch-program/.test(entry.path)));
    assert(!packet.load.some((entry) => /design-evidence-stack|mobile-flow-craft|paid-tool-routing|security-release-hardening|doppler-organization|founder-zero-operator/.test(entry.path)));
    assert(
      (packet.deferredLoad ?? []).some((entry) => /paid-tool-routing/.test(entry.path)),
      `${packet.workflowId} live packet must defer paid-tool-routing until that operator action is current`,
    );
    const projected = projectReadyBrief(packet);
    assert((projected.context?.deferredLoadCount ?? 0) > 0, `${packet.workflowId} live projectReadyBrief deferredLoadCount is 0`);
    const prompt = buildWorkerPrompt(packet, "/tmp/business", "/tmp/skill");
    assert.match(prompt, /DEFERRED LATER KNOWLEDGE/);
    assert.match(prompt, /design-evidence-stack|mobile-flow-craft|consumer-craft-benchmarks/);
    assert.doesNotMatch(prompt.split("DEFERRED LATER KNOWLEDGE")[0] ?? "", /consumer-craft-benchmarks/);
  }

  const fastlaneNode = byWorkflowId.get("workflow.growth.fastlane-growth-ops");
  assert(fastlaneNode, "fastlane-growth-ops missing from the compiled runtime plan");
  const composedFastlane = composeNodeBrief(fastlaneNode, compiled);
  const dispatchedFastlane = service.workflow({ workflowId: fastlaneNode.workflowId, brief: true }).dispatchBrief!;
  for (const packet of [composedFastlane, dispatchedFastlane]) {
    assert(
      packet.load.some((entry) => entry.referenceId === "reference.growth.fastlane-growth-ops"),
      `${packet.workflowId} live packet must keep own-book referenceId`,
    );
    assert(!(packet.deferredLoad ?? []).some((entry) => entry.referenceId === "reference.growth.fastlane-growth-ops"));
    const projected = projectReadyBrief(packet);
    assert(projected.load.some((entry) => /fastlane-growth-ops/.test(entry.path)), `${packet.workflowId} live worker packet must keep its own book`);
    const prompt = buildWorkerPrompt(packet, "/tmp/business", "/tmp/skill");
    const mandatory = prompt.split("DEFERRED LATER KNOWLEDGE")[0] ?? prompt;
    assert.match(mandatory, /fastlane-growth-ops/);
    assert.doesNotMatch(prompt.split("DEFERRED LATER KNOWLEDGE")[1] ?? "", /fastlane-growth-ops/);
  }
});
