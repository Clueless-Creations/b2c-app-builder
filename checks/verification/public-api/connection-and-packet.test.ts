import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectionReceiptSchema, localMcpInstructions } from "../../../contracts/public-api/connection-receipt.js";
import { projectReadyBrief, isLaterGuidance } from "../../../kernel/services/plan-projection.js";
import type { NodeBrief } from "../../../kernel/engine/node-brief.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

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
    const line = result.stdout.split("\n").find((entry) => entry.startsWith("Connection receipt: "));
    assert(line, "setup omitted the connection receipt");
    const parsed = connectionReceiptSchema.parse(JSON.parse(line.slice("Connection receipt: ".length)));
    assert.equal(parsed.mode, "local_execution");
    assert.equal(parsed.identity.recommended, "b2c-local");
    assert.equal(parsed.workspaceExecution, "available");
    assert.equal(parsed.writes, "cli_only");
    assert.equal(parsed.providerObservation, "not_tested");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("local MCP instructions name local execution and refuse hosted-as-local", () => {
  const text = localMcpInstructions({ knowledge: "available", engineVersion: "0.219.39" });
  assert.match(text, /b2c-local/);
  assert.match(text, /b2c-hosted/);
  const receipt = connectionReceiptSchema.parse(JSON.parse(text.slice(text.indexOf("{"))));
  assert.equal(receipt.mode, "local_execution");
  assert.equal(receipt.knowledge, "available");
});

test("worker packet keeps current-task guidance and accounts deferred later load", () => {
  assert.equal(isLaterGuidance("always"), false);
  assert.equal(isLaterGuidance("before this task"), false);
  assert.equal(isLaterGuidance("later, after launch"), true);
  const brief = projectReadyBrief({
    workflowId: "workflow.fixture.ready",
    title: "Ready fixture",
    contractFiles: [],
    instructions: "Do the current research slice.",
    open: ["strategy/RESEARCH.md"],
    consult: ["operations/FOUNDER_BRIEF.md"],
    load: [
      { path: "knowledge/research/now.md", title: "Now", loadWhen: "before this task" },
      { path: "knowledge/store/later.md", title: "Later", loadWhen: "later, after launch" },
    ],
    route: [],
    skills: [],
    tools: [],
    produce: ["strategy/RESEARCH.md"],
    verify: { kind: "none", gateCommands: [], failClosed: true },
    approvals: [],
    tokenBudget: 8_000,
  } satisfies NodeBrief);
  assert.deepEqual(
    brief.load.map((entry) => entry.path),
    ["knowledge/research/now.md"],
  );
  assert.equal(brief.context?.deferredLoadCount, 1);
  assert.equal(brief.context?.loadCount, 1);
  assert.equal(brief.effectBoundary, "read_and_produce");
  assert.match(brief.readyWhy ?? "", /prerequisites are satisfied/);
  assert.match(brief.continuation ?? "", /return to business-plan/);
  const held = projectReadyBrief({
    workflowId: "workflow.fixture.held",
    title: "Held fixture",
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
  assert.equal(held.effectBoundary, "founder_approval_required");
});
