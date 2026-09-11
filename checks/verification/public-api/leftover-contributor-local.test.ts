import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  HOSTED_WRONG_SURFACE_TOOL_NAMES,
  hostedWrongSurfaceRefusal,
  isHostedWrongSurfaceTool,
  leftoverContributorLocalMcpResponse,
  leftoverContributorLocalRefusal,
  LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES,
  parseConnectionReceipt,
  type LeftoverCliOnlyLocalRefusal,
} from "../../../contracts/public-api/connection-receipt.js";
import { CONTRIBUTION_OPERATIONS } from "../../../contracts/contribution/contract.js";
import { handleApi } from "../../../hosted/knowledge-mcp/http.js";
import { createKnowledgeService } from "../../../kernel/knowledge-service/service.js";
import { buildHostedKnowledgeBundle } from "../../../tooling/render-hosted-bundle.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("leftover contributor MCP names fail locally as cli_only when contributor tools are off", async () => {
  const packageGuide = readFileSync(path.join(root, "docs/guides/runtime-package.md"), "utf8");
  const hostedReadme = readFileSync(path.join(root, "hosted/knowledge-mcp/README.md"), "utf8");
  assert(
    packageGuide.includes("Leftover contributor names"),
    "package guide omitted leftover contributor local cli_only names",
  );
  assert.match(hostedReadme, /Leftover contributor names stay hosted/, "hosted README omitted leftover contributor hosted names");

  const contributionMcp = CONTRIBUTION_OPERATIONS.flatMap((operation) => (operation.mcp === null ? [] : [operation.mcp]));
  assert.deepEqual(
    [...LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES].sort(),
    [...contributionMcp].sort(),
    "leftover contributor local MCP names must follow each contribution MCP operation",
  );
  for (const toolName of LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES) {
    assert.equal(isHostedWrongSurfaceTool(toolName), true, toolName);
    assert.equal((HOSTED_WRONG_SURFACE_TOOL_NAMES as readonly string[]).includes(toolName), true, toolName);
  }
  assert.equal(isHostedWrongSurfaceTool("b2c_contribute_evaluate"), false);

  const service = createKnowledgeService(buildHostedKnowledgeBundle(root));
  const hosted = await handleApi(
    new Request("https://knowledge.test/api/v1/tools/b2c_contribute_plan", { method: "POST", body: "{}" }),
    service,
  );
  assert.equal(hosted.status, 400);
  assert.deepEqual(
    await hosted.json(),
    hostedWrongSurfaceRefusal({ engineVersion: service.metadata.engineVersion, toolName: "b2c_contribute_plan" }),
  );
  const evaluateHosted = await handleApi(
    new Request("https://knowledge.test/api/v1/tools/b2c_contribute_evaluate", { method: "POST", body: "{}" }),
    service,
  );
  assert.equal(evaluateHosted.status, 404);
  assert.match(await evaluateHosted.text(), /not_found/);

  const client = new Client({ name: "leftover-contributor-local", version: "1.0.0" });
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
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    for (const toolName of LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES) {
      assert.equal(names.includes(toolName), false, `${toolName} must stay unlisted on default local MCP`);
      const intercepted = leftoverContributorLocalMcpResponse(
        { jsonrpc: "2.0", id: 17, method: "tools/call", params: { name: toolName, arguments: {} } },
        { engineVersion: receipt.engineVersion, observed: receipt.observed },
      ) as { result?: { isError?: boolean; structuredContent?: LeftoverCliOnlyLocalRefusal } };
      const refusal = leftoverContributorLocalRefusal({
        engineVersion: receipt.engineVersion,
        toolName,
        observed: receipt.observed,
      });
      assert.equal(intercepted.result?.isError, true, toolName);
      assert.deepEqual(intercepted.result?.structuredContent, refusal);
      assert.equal(refusal.error, "cli_only");
      assert.equal(refusal.connection.clientName, "b2c-local");
      assert.equal(refusal.connection.mode, "local_execution");
      assert.doesNotMatch(JSON.stringify(refusal), /wrong_surface/);
      const contributorEnabled = leftoverContributorLocalMcpResponse(
        { jsonrpc: "2.0", id: 18, method: "tools/call", params: { name: toolName, arguments: {} } },
        {
          engineVersion: receipt.engineVersion,
          observed: receipt.observed,
          contributorEnabled: true,
        },
      );
      assert.equal(contributorEnabled, null, `${toolName} must not intercept contributor-enabled local MCP`);
    }
    const routed = await client.callTool({ name: "b2c_contribute_plan", arguments: {} });
    assert.equal(routed.isError, true);
    const expected = leftoverContributorLocalRefusal({
      engineVersion: receipt.engineVersion,
      toolName: "b2c_contribute_plan",
      observed: receipt.observed,
    });
    assert.deepEqual(routed.structuredContent, expected);
    assert.equal(expected.connection.clientName, "b2c-local");
    assert.doesNotMatch(JSON.stringify(routed.structuredContent), /wrong_surface/);
    const leftover = leftoverContributorLocalRefusal({
      engineVersion: receipt.engineVersion,
      toolName: "b2c_contribute_plan",
      clientName: "b2c-app-builder",
      observed: receipt.observed,
    });
    assert.equal(leftover.connection.leftoverName, true);
    assert.equal(leftover.connection.mode, "local_execution");
    assert.doesNotMatch(JSON.stringify(leftover), /wrong_surface/);
    const unknown = leftoverContributorLocalMcpResponse(
      { jsonrpc: "2.0", id: 19, method: "tools/call", params: { name: "b2c_not_a_tool", arguments: {} } },
      { engineVersion: receipt.engineVersion, observed: receipt.observed },
    );
    assert.equal(unknown, null);
    const evaluate = leftoverContributorLocalMcpResponse(
      { jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "b2c_contribute_evaluate", arguments: {} } },
      { engineVersion: receipt.engineVersion, observed: receipt.observed },
    );
    assert.equal(evaluate, null);
    const publicCliOnly = leftoverContributorLocalMcpResponse(
      { jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "b2c_business_create", arguments: {} } },
      { engineVersion: receipt.engineVersion, observed: receipt.observed },
    );
    assert.equal(publicCliOnly, null);
    const writeGated = leftoverContributorLocalMcpResponse(
      { jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "b2c_run", arguments: {} } },
      { engineVersion: receipt.engineVersion, observed: receipt.observed },
    );
    assert.equal(writeGated, null);
    const missing = await client.callTool({ name: "b2c_not_a_tool", arguments: {} });
    assert.equal(missing.isError, true);
    assert.doesNotMatch(JSON.stringify(missing.structuredContent ?? missing.content), /cli_only|wrong_surface/);
  } finally {
    await client.close();
  }

  const contributor = new Client({ name: "leftover-contributor-enabled", version: "1.0.0" });
  await contributor.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(root, "entrypoints/mcp/server.ts")],
      cwd: root,
      env: { ...process.env, B2C_APP_BUILDER_MCP_READONLY: "1", B2C_APP_BUILDER_MCP_CONTRIBUTOR: "1" },
      stderr: "pipe",
    }),
  );
  try {
    assert.equal(contributor.getServerVersion()?.name, "b2c-local");
    const contributorNames = (await contributor.listTools()).tools.map((tool) => tool.name);
    for (const toolName of LOCAL_CONTRIBUTOR_LEFTOVER_TOOL_NAMES) {
      assert.equal(contributorNames.includes(toolName), true, `${toolName} must register on contributor-enabled local MCP`);
    }
    assert.equal(contributorNames.includes("b2c_contribute_evaluate"), false);
  } finally {
    await contributor.close();
  }
});
