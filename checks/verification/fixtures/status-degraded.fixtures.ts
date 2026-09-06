import { writeProductFixture } from "./product-fixture.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { registerWorkspace } from "../../../adapters/registry.js";
import { inspectWorkspace } from "../../../kernel/session/inspect.js";
import { readWorkspaceStatus, renderWorkspaceStatus } from "../../../kernel/session/status.js";
import { validateFounderQuestion, type FounderQuestion } from "../../../kernel/session/founder-gate.js";

/**
 * U4 fixtures: `b2c_status`'s degraded (pre-registration) mode (R6, R7, R8, R9). These prove the
 * MCP-level contract end to end over stdio — the real server, spawned as a child process with an
 * isolated `B2C_APP_BUILDER_HOME` per scenario — because the behavior under test is the tool's
 * `cwd`/`workspace` branch, not just the pure builder functions it calls into.
 *
 * `callStatusOverMcp` mirrors mcp.fixtures.ts's stdio driver pattern (spawn the real
 * `entrypoints/mcp/server.ts` via tsx, JSON-RPC over stdin/stdout, resolve by message id): it runs the
 * REAL, unmodified `entrypoints/mcp/server.ts` directly out of skillRoot rather than copying it into an
 * isolated temp directory first, so it does not need that other scenario's node_modules-symlink
 * trick — that trick exists there to let a temp-copied server still resolve its dependencies, and
 * these fixtures never copy the server anywhere. Isolation instead comes from a fresh
 * `B2C_APP_BUILDER_HOME` per scenario (same mechanism `inspect.fixtures.ts` uses for
 * `inspectWorkspace` directly), so no fixture here can read or disturb another's registry state,
 * or the real machine's.
 */

function withIsolatedHome<T>(home: string, fn: () => T): T {
  const previous = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = home;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previous;
  }
}

interface McpToolResult {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text: string }>;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

let driverCounter = 0;

/**
 * Spawns the real MCP server and makes exactly one `tools/call` against `toolName`, returning its
 * result. Generalised (R8 cross-tool proof, below) from a `b2c_status`-only driver so the same
 * spawned-server plumbing can also drive `b2c_plan` — the two named surfaces the R8 cross-tool
 * checks compare — without duplicating the handshake/JSON-RPC wiring per tool.
 */
function callMcpTool(harness: Harness, home: string, toolName: string, args: Record<string, unknown>): McpToolResult {
  driverCounter += 1;
  const driverDir = harness.makeTempDir(`status-degraded-driver-${driverCounter}`);
  const driverPath = path.join(driverDir, "drive-mcp-tool.mts");
  const driverSource = `
import { spawn } from "node:child_process";
import readline from "node:readline";

const server = spawn(${JSON.stringify(resolveTsxBin(skillRoot))}, [${JSON.stringify(path.join(skillRoot, "entrypoints/mcp/server.ts"))}], {
  cwd: ${JSON.stringify(skillRoot)},
  env: { ...process.env, B2C_APP_BUILDER_HOME: ${JSON.stringify(home)} },
  stdio: ["pipe", "pipe", "inherit"],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  } catch { /* non-JSON noise is not part of the protocol */ }
});
let nextId = 1;
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error("timeout waiting for " + method)), 60_000).unref?.();
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\\n");
  });
}
async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "status-degraded-fixture", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake failed: " + JSON.stringify(init.result));
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");
  const call = await request("tools/call", { name: ${JSON.stringify(toolName)}, arguments: ${JSON.stringify(args)} });
  console.log(JSON.stringify(call.error ? { __protocolError: call.error } : (call.result ?? {})));
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
  writeFileSync(driverPath, driverSource, "utf8");
  const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 60_000 });
  assert(result.status === 0, `${toolName} driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-800)}\n${(result.stderr ?? "").slice(-800)}`);
  const stdout = (result.stdout ?? "").trim();
  try {
    return JSON.parse(stdout) as McpToolResult;
  } catch {
    throw new Error(`${toolName} driver produced non-JSON stdout: ${stdout.slice(-800)}`);
  }
}

/** Spawns the real MCP server and makes exactly one `b2c_status` tools/call, returning its result. */
function callStatusOverMcp(harness: Harness, home: string, args: Record<string, unknown>): McpToolResult {
  return callMcpTool(harness, home, "b2c_status", args);
}

/** Spawns the real MCP server and makes exactly one `b2c_plan` tools/call, returning its result. */
function callPlanOverMcp(harness: Harness, home: string, args: Record<string, unknown>): McpToolResult {
  return callMcpTool(harness, home, "b2c_plan", args);
}

function textOf(result: McpToolResult): string {
  return (result.content ?? []).map((entry) => entry.text).join("\n");
}

const CLOTHING_PACKAGE_JSON = JSON.stringify({
  name: "drift-apparel-site",
  description: "Marketing site for an independent apparel and streetwear label",
  keywords: ["fashion", "boutique"],
});
const CLOTHING_README = "# Drift Apparel\n\nA denim and streetwear clothing collection drop, refreshed each season.\nSee the sizing chart before you order.\n";

// A plain unregistered folder with unambiguous consumer-app evidence (app-store language plus an
// app-framework dependency — both are independently sufficient per inspect.ts's decideProductKind,
// so this is never "unknown" and never "mismatch") for the R8 cross-tool checks below, where the
// point is routing/status agreement on an ordinary unregistered folder, not productKind itself.
const CONSUMER_APP_PACKAGE_JSON = JSON.stringify({
  name: "orbit-habit-tracker",
  description: "A mobile app for building daily habits, available on the App Store and Google Play.",
  dependencies: { "react-native": "^0.74.0" },
});

export function register(harness: Harness): void {
  // --- 1. empty folder via cwd: the release-gate scenario ------------------------------------

  harness.check("status: an empty folder via cwd returns a degraded unregistered result with the exact register command, never an error (release gate)", () => {
    const home = harness.makeTempDir("status-degraded-empty-home");
    const dir = harness.makeTempDir("status-degraded-empty-dir");
    const result = callStatusOverMcp(harness, home, { cwd: dir });
    assert(result.isError !== true, `expected no error for an empty folder, got ${JSON.stringify(result)}`);
    const structured = result.structuredContent;
    assert(structured?.kind === "unregistered", `expected kind unregistered, got ${JSON.stringify(structured)}`);
    assert(
      structured?.nextAgentAction === `b2c workspaces register <id> ${dir}`,
      `expected the exact register command, got ${JSON.stringify(structured?.nextAgentAction)}`,
    );
    assert(structured?.phase === "no-engagement", `expected no-engagement phase, got ${JSON.stringify(structured?.phase)}`);
    assert(structured?.productKind === "unknown", `expected productKind unknown, got ${JSON.stringify(structured?.productKind)}`);
    assert(structured?.founderAction === null, `expected founderAction null for a plain unregistered folder, got ${JSON.stringify(structured?.founderAction)}`);
    assert(
      Array.isArray(structured?.blockers) && structured.blockers.length > 0,
      `expected a typed blockers[] with at least one entry, got ${JSON.stringify(structured?.blockers)}`,
    );
  });

  // --- 2. clothing-brand folder: mismatch surfaced, register suggestion suppressed (R9) -------

  harness.check("status: a clothing-brand folder via cwd surfaces the productKind mismatch and suppresses the register suggestion (R9)", () => {
    const home = harness.makeTempDir("status-degraded-mismatch-home");
    const dir = harness.makeTempDir("status-degraded-mismatch-dir");
    writeFileSync(path.join(dir, "package.json"), CLOTHING_PACKAGE_JSON);
    writeFileSync(path.join(dir, "README.md"), CLOTHING_README);
    const result = callStatusOverMcp(harness, home, { cwd: dir });
    assert(result.isError !== true, `expected no error for a mismatch folder, got ${JSON.stringify(result)}`);
    const structured = result.structuredContent;
    assert(structured?.kind === "unregistered", `expected kind unregistered, got ${JSON.stringify(structured)}`);
    assert(structured?.productKind === "mismatch", `expected productKind mismatch, got ${JSON.stringify(structured?.productKind)}`);
    assert(
      typeof structured?.nextAgentAction === "string" && !structured.nextAgentAction.includes("b2c workspaces register"),
      `expected the register suggestion suppressed on mismatch, got ${JSON.stringify(structured?.nextAgentAction)}`,
    );
    const text = textOf(result);
    assert(!text.includes("b2c workspaces register"), `expected the rendered text to also omit the register command on mismatch, got: ${text}`);

    // Wave 2 (#30): the mismatch branch's founderAction is now a full, soft FounderQuestion —
    // never a hard Go/spend/release gate, since confirming the folder is advisory.
    const founderAction = structured?.founderAction as FounderQuestion | null | undefined;
    assert(founderAction != null, `expected a non-null founderAction on a mismatch folder, got ${JSON.stringify(structured?.founderAction)}`);
    assert(founderAction!.class === "confirm-product-kind", `expected class confirm-product-kind, got ${JSON.stringify(founderAction)}`);
    assert(founderAction!.choices.length >= 2 && founderAction!.choices.length <= 4, `expected 2-4 choices, got ${founderAction!.choices.length}`);
    assert(
      founderAction!.choices.filter((choice) => choice.recommended).length === 1,
      `expected exactly one recommended choice, got ${JSON.stringify(founderAction!.choices)}`,
    );
    assert(founderAction!.skippable === true, `expected the product-kind confirmation to stay skippable, got ${JSON.stringify(founderAction)}`);
    assert(founderAction!.deferrable === true, `expected the product-kind confirmation to stay deferrable, got ${JSON.stringify(founderAction)}`);
    const problems = validateFounderQuestion(founderAction!);
    assert(problems.length === 0, `expected the mismatch founderAction to validate clean, got ${JSON.stringify(problems)}`);
  });

  // --- 3. half-scaffolded folder: phase reflects engagement, next action stays registration ---

  harness.check(
    "status: a half-scaffolded folder (run/run-state.json present) via cwd reports an engaged phase, with registration still the next action",
    () => {
      const home = harness.makeTempDir("status-degraded-half-home");
      const dir = harness.makeTempDir("status-degraded-half-dir");
      mkdirSync(path.join(dir, "run"), { recursive: true });
      writeFileSync(path.join(dir, "run", "run-state.json"), JSON.stringify({ runId: "run-fixture-1", updatedAt: "2026-08-05T00:00:00.000Z", nodes: {} }));
      const result = callStatusOverMcp(harness, home, { cwd: dir });
      assert(result.isError !== true, `expected no error for a half-scaffolded folder, got ${JSON.stringify(result)}`);
      const structured = result.structuredContent;
      assert(structured?.kind === "unregistered", `expected kind unregistered, got ${JSON.stringify(structured)}`);
      assert(structured?.phase === "engaged-with-run", `expected engaged-with-run phase, got ${JSON.stringify(structured?.phase)}`);
      assert(
        structured?.nextAgentAction === `b2c workspaces register <id> ${dir}`,
        `expected registration to remain the next action, got ${JSON.stringify(structured?.nextAgentAction)}`,
      );
    },
  );

  // --- 4. registered workspace via `workspace`: byte-for-byte regression (R7) -----------------

  // Pinned literally against the pre-Wave-1 reader (verified via `git show d8a7ac7~8:kernel/session
  // /status.ts`, before U4/U6 touched this file at all) — renderWorkspaceStatus's own text for the
  // "no_run" state, with no digest present. Deriving "baseline" from the current in-tree
  // renderWorkspaceStatus/readWorkspaceStatus alone (as this fixture used to) re-runs the exact
  // code under test on both sides of the `===`, so a regression introduced to those two functions
  // within this very diff would move both sides together and go undetected; comparing against
  // this literal closes that gap. Update this pin only alongside a deliberate, intentional change
  // to renderWorkspaceStatus's "no_run" text — never to quietly paper over a real regression.
  const REGISTERED_NO_RUN_BASELINE_TEXT = "No durable run yet — bootstrap the workspace and run a session first.";

  harness.check(
    "status: a registered workspace via `workspace` stays byte-for-byte identical to the pre-change reader, with no structuredContent added (R7)",
    () => {
      const home = harness.makeTempDir("status-degraded-registered-home");
      const workspace = harness.makeTempDir("status-degraded-registered-ws");
      writeFileSync(path.join(workspace, "catalog.json"), "{}"); // bootstrapped, no run yet -> a non-trivial, non-default state
      let baselineText = "";
      withIsolatedHome(home, () => {
        registerWorkspace("status-degraded-registered-ws", workspace);
        baselineText = renderWorkspaceStatus(readWorkspaceStatus(workspace));
      });
      const result = callStatusOverMcp(harness, home, { workspace: "status-degraded-registered-ws" });
      assert(result.isError !== true, `expected no error for a registered workspace, got ${JSON.stringify(result)}`);
      // Live comparison (kept): proves the MCP wrapper's `workspace` branch is a faithful passthrough
      // of whatever the in-tree reader currently produces.
      assert(
        textOf(result) === baselineText,
        `expected byte-identical text to the pre-change reader.\nbaseline: ${JSON.stringify(baselineText)}\ngot:      ${JSON.stringify(textOf(result))}`,
      );
      // Pinned comparison (new): proves the reader's own text, not just the passthrough, still
      // matches the pre-Wave-1 golden string — the property R7 actually names.
      assert(
        textOf(result) === REGISTERED_NO_RUN_BASELINE_TEXT,
        `expected the byte-identical pre-diff reader text (pinned from d8a7ac7~8), got: ${JSON.stringify(textOf(result))}`,
      );
      assert(
        result.structuredContent === undefined,
        `expected the workspace branch to add no structuredContent (unchanged shape), got ${JSON.stringify(result.structuredContent)}`,
      );
    },
  );

  // --- 5. registered + corrupt run-state.json: unchanged (R7) ---------------------------------

  // Same pinning rationale as REGISTERED_NO_RUN_BASELINE_TEXT above, for the "run_state_unreadable"
  // state (also verified via `git show d8a7ac7~8:kernel/session/status.ts`).
  const RUN_STATE_UNREADABLE_BASELINE_TEXT = "Run state unreadable — inspect run/run-state.json before continuing.";

  harness.check("status: a registered workspace with a corrupt run-state.json still reports run_state_unreadable via `workspace`, unchanged (R7)", () => {
    const home = harness.makeTempDir("status-degraded-corrupt-home");
    const workspace = harness.makeTempDir("status-degraded-corrupt-ws");
    mkdirSync(path.join(workspace, "run"), { recursive: true });
    writeFileSync(path.join(workspace, "run", "run-state.json"), "{ this is not valid json");
    withIsolatedHome(home, () => {
      registerWorkspace("status-degraded-corrupt-ws", workspace);
    });
    const result = callStatusOverMcp(harness, home, { workspace: "status-degraded-corrupt-ws" });
    assert(result.isError !== true, `expected no error (a corrupt run-state is a reported state, not a tool error), got ${JSON.stringify(result)}`);
    const text = textOf(result);
    assert(text.includes("Run state unreadable"), `expected the existing run_state_unreadable text, got: ${text}`);
    // Pinned comparison (new): the full rendered text (no digest present here either) against the
    // pre-Wave-1 golden string, closing the same self-comparison gap as case 4 above.
    assert(
      text === RUN_STATE_UNREADABLE_BASELINE_TEXT,
      `expected the byte-identical pre-diff reader text (pinned from d8a7ac7~8), got: ${JSON.stringify(text)}`,
    );
    assert(
      result.structuredContent === undefined,
      `expected the workspace branch to add no structuredContent, got ${JSON.stringify(result.structuredContent)}`,
    );
  });

  // --- 6. one-classifier proof (R8) ------------------------------------------------------------

  harness.check("status: the cwd branch and inspectWorkspace agree on registration + productKind for the same folder (R8 one-classifier proof)", () => {
    const home = harness.makeTempDir("status-degraded-oneclassifier-home");
    const dir = harness.makeTempDir("status-degraded-oneclassifier-dir");
    writeFileSync(path.join(dir, "package.json"), CLOTHING_PACKAGE_JSON);
    writeFileSync(path.join(dir, "README.md"), CLOTHING_README);

    const direct = withIsolatedHome(home, () => inspectWorkspace(dir));
    assert(direct.ok, `expected ok:true from inspectWorkspace directly, got ${JSON.stringify(direct)}`);
    if (!direct.ok) return;

    const result = callStatusOverMcp(harness, home, { cwd: dir });
    const structured = result.structuredContent;
    assert(
      structured?.kind === direct.registration.kind,
      `expected matching registration kind, got mcp=${JSON.stringify(structured?.kind)} direct=${direct.registration.kind}`,
    );
    assert(
      structured?.productKind === direct.productKind,
      `expected matching productKind, got mcp=${JSON.stringify(structured?.productKind)} direct=${direct.productKind}`,
    );
  });

  // --- 7. both workspace and cwd: typed conflict error ------------------------------------------

  harness.check("status: supplying both workspace and cwd is a typed conflict error", () => {
    const home = harness.makeTempDir("status-degraded-conflict-home");
    const dir = harness.makeTempDir("status-degraded-conflict-dir");
    const result = callStatusOverMcp(harness, home, { workspace: "anything", cwd: dir });
    assert(result.isError === true, `expected isError true for conflicting workspace+cwd, got ${JSON.stringify(result)}`);
    const text = textOf(result);
    const parsed = JSON.parse(text) as { reasonCode?: string; fields?: string[] };
    assert(parsed.reasonCode === "status.reference_conflict", `expected a typed reasonCode naming the conflict, got: ${text}`);
    assert(
      Array.isArray(parsed.fields) && parsed.fields.includes("workspace") && parsed.fields.includes("cwd"),
      `expected the conflict to name both fields, got: ${text}`,
    );
  });

  // --- 8. neither workspace nor cwd: typed required error (bonus) -------------------------------

  harness.check("status: supplying neither workspace nor cwd is a typed required error", () => {
    const home = harness.makeTempDir("status-degraded-required-home");
    const result = callStatusOverMcp(harness, home, {});
    assert(result.isError === true, `expected isError true when neither reference is supplied, got ${JSON.stringify(result)}`);
    const parsed = JSON.parse(textOf(result)) as { reasonCode?: string };
    assert(parsed.reasonCode === "status.reference_required", `expected a typed reasonCode, got: ${textOf(result)}`);
  });

  // --- 9. inside a registered workspace: names the containing workspace, normal status (bonus) --

  harness.check("status: a cwd inside a registered workspace names the containing workspace and returns its normal status", () => {
    const home = harness.makeTempDir("status-degraded-inside-home");
    const workspace = harness.makeTempDir("status-degraded-inside-ws");
    const subdir = path.join(workspace, "nested", "deeper");
    mkdirSync(subdir, { recursive: true });
    withIsolatedHome(home, () => {
      registerWorkspace("status-degraded-inside-fixture-ws", workspace);
    });
    const result = callStatusOverMcp(harness, home, { cwd: subdir });
    assert(result.isError !== true, `expected no error, got ${JSON.stringify(result)}`);
    const structured = result.structuredContent;
    assert(structured?.kind === "inside-registered", `expected kind inside-registered, got ${JSON.stringify(structured)}`);
    assert(
      structured?.workspaceId === "status-degraded-inside-fixture-ws",
      `expected the containing workspace id named, got ${JSON.stringify(structured?.workspaceId)}`,
    );
    const text = textOf(result);
    assert(text.includes("status-degraded-inside-fixture-ws"), `expected the rendered text to name the containing workspace, got: ${text}`);
  });

  // --- 10. registry-stale: reuses the existing missing semantics (bonus) ------------------------

  harness.check("status: a registry-stale cwd (registered path removed from disk) reuses the existing missing status semantics", () => {
    const home = harness.makeTempDir("status-degraded-stale-home");
    const workspace = harness.makeTempDir("status-degraded-stale-ws");
    withIsolatedHome(home, () => {
      registerWorkspace("status-degraded-stale-fixture-ws", workspace);
    });
    rmSync(workspace, { recursive: true, force: true });
    const result = callStatusOverMcp(harness, home, { cwd: workspace });
    assert(result.isError !== true, `expected no error for a stale registered path, got ${JSON.stringify(result)}`);
    const structured = result.structuredContent;
    assert(structured?.kind === "missing", `expected kind missing (reusing existing semantics), got ${JSON.stringify(structured)}`);
    const text = textOf(result);
    assert(text.includes("Workspace path is missing"), `expected the existing missing wording reused verbatim, got: ${text}`);
  });

  // --- 11-13. R8 cross-tool proof: b2c_plan and b2c_status must actually agree ------------------
  //
  // Case 6 above ("one-classifier proof") only proves the MCP wire faithfully forwards
  // inspectWorkspace's own result inside b2c_status itself — it never calls b2c_plan, so a
  // divergence between the two NAMED surfaces the plan's R8 acceptance criterion is about (plan.md
  // "Same folder through b2c_plan routing and b2c_status degraded -> identical productKind and
  // registration classification") would go completely undetected. These three checks close that
  // gap directly: for the same folder, in the same run, call both b2c_plan (utterance+cwd) and
  // b2c_status (cwd) over the real MCP server and assert their outputs agree.

  harness.check(
    "status+plan: a clothing-brand folder makes b2c_plan short-circuit to product_mismatch and b2c_status report productKind mismatch, for the same cwd (R8 cross-tool proof)",
    () => {
      const home = harness.makeTempDir("status-plan-agree-mismatch-home");
      const dir = harness.makeTempDir("status-plan-agree-mismatch-dir");
      writeFileSync(path.join(dir, "package.json"), CLOTHING_PACKAGE_JSON);
      writeFileSync(path.join(dir, "README.md"), CLOTHING_README);

      const planResult = callPlanOverMcp(harness, home, { utterance: "plan the app's onboarding flow", cwd: dir });
      assert(planResult.isError !== true, `expected b2c_plan not to error on a mismatch folder, got ${JSON.stringify(planResult)}`);
      const planOutcome = planResult.structuredContent?.outcome as { kind?: string } | undefined;
      assert(planOutcome?.kind === "product_mismatch", `expected b2c_plan's outcome.kind to be product_mismatch, got ${JSON.stringify(planOutcome)}`);

      const statusResult = callStatusOverMcp(harness, home, { cwd: dir });
      assert(statusResult.isError !== true, `expected b2c_status not to error on a mismatch folder, got ${JSON.stringify(statusResult)}`);
      assert(
        statusResult.structuredContent?.productKind === "mismatch",
        `expected b2c_status's productKind to be mismatch (agreeing with b2c_plan), got ${JSON.stringify(statusResult.structuredContent)}`,
      );
    },
  );

  harness.check(
    "status+plan: a plain unregistered folder with a consumer-app package.json routes normally through b2c_plan and reports kind unregistered through b2c_status, for the same cwd (R8 cross-tool proof)",
    () => {
      const home = harness.makeTempDir("status-plan-agree-unregistered-home");
      const dir = harness.makeTempDir("status-plan-agree-unregistered-dir");
      writeFileSync(path.join(dir, "package.json"), CONSUMER_APP_PACKAGE_JSON);

      const planResult = callPlanOverMcp(harness, home, { utterance: "plan the app's onboarding flow", cwd: dir });
      assert(planResult.isError !== true, `expected b2c_plan not to error on a plain unregistered folder, got ${JSON.stringify(planResult)}`);
      const planOutcome = planResult.structuredContent?.outcome as { kind?: string } | undefined;
      assert(
        planOutcome?.kind === "primary" || planOutcome?.kind === "candidates",
        `expected b2c_plan's outcome to resolve to primary or candidates for a plain unregistered folder, got ${JSON.stringify(planOutcome)}`,
      );

      const statusResult = callStatusOverMcp(harness, home, { cwd: dir });
      assert(statusResult.isError !== true, `expected b2c_status not to error on a plain unregistered folder, got ${JSON.stringify(statusResult)}`);
      assert(
        statusResult.structuredContent?.kind === "unregistered",
        `expected b2c_status's kind to be unregistered (agreeing with b2c_plan's non-mismatch routing), got ${JSON.stringify(statusResult.structuredContent)}`,
      );
    },
  );

  harness.check(
    "status+plan: a subdirectory of a registered workspace reports kind inside-registered through b2c_status, and any onboarding stepper b2c_plan attaches matches b2c_status's, for the same cwd (R8 cross-tool proof)",
    () => {
      const home = harness.makeTempDir("status-plan-agree-inside-home");
      const workspace = harness.makeTempDir("status-plan-agree-inside-ws");
      writeProductFixture(workspace, "Status Fixture");
      // A real pinned catalog (bootstrap --apply, no onboard) is what lets readWorkspaceStepper /
      // withOnboardingStepper compile a plan at all -- without it both tools would simply omit
      // `stepper`, and the interesting half of this check (the two tools' steppers agreeing) would
      // never run. Mirrors mcp.fixtures.ts's own "b2c_plan grows a routing mode" setup.
      const bootstrapped = spawnSync(
        resolveTsxBin(skillRoot),
        [path.join(skillRoot, "kernel/session/bootstrap.ts"), "--workspace", workspace, "--apply", "--now", "2026-08-31T12:00:00.000Z"],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(bootstrapped.status === 0, `bootstrap must exit 0 to seed a compiled catalog: ${bootstrapped.stdout}\n${bootstrapped.stderr}`);
      const subdir = path.join(workspace, "nested", "deeper");
      mkdirSync(subdir, { recursive: true });
      withIsolatedHome(home, () => {
        registerWorkspace("status-plan-agree-inside-ws", workspace);
      });

      const statusResult = callStatusOverMcp(harness, home, { cwd: subdir });
      assert(statusResult.isError !== true, `expected b2c_status not to error inside a registered workspace, got ${JSON.stringify(statusResult)}`);
      const statusStructured = statusResult.structuredContent as { kind?: string; workspaceId?: string; stepper?: unknown } | undefined;
      assert(statusStructured?.kind === "inside-registered", `expected b2c_status's kind to be inside-registered, got ${JSON.stringify(statusStructured)}`);
      assert(
        statusStructured?.workspaceId === "status-plan-agree-inside-ws",
        `expected the containing workspace named, got ${JSON.stringify(statusStructured)}`,
      );

      const planResult = callPlanOverMcp(harness, home, { utterance: "plan the app's onboarding flow", cwd: subdir });
      assert(planResult.isError !== true, `expected b2c_plan not to error inside a registered workspace, got ${JSON.stringify(planResult)}`);
      const planOutcome = planResult.structuredContent?.outcome as { kind?: string; stepper?: unknown } | undefined;

      // Conditional by construction (stepper.ts's withOnboardingStepper): a stepper is attached
      // only when the primary route lands on an onboarding-group workflow. When it is, the two
      // tools compute it from the exact same containing workspace's catalog + run state -- so
      // their steppers must be identical, not merely both-present.
      if (planOutcome?.kind === "primary" && planOutcome.stepper !== undefined) {
        assert(
          statusStructured?.stepper !== undefined,
          `expected b2c_status to also carry a stepper once b2c_plan's primary routed into the onboarding group, got ${JSON.stringify(statusStructured)}`,
        );
        assert(
          JSON.stringify(planOutcome.stepper) === JSON.stringify(statusStructured.stepper),
          `expected b2c_plan's and b2c_status's onboarding steppers to agree for the same cwd, plan=${JSON.stringify(planOutcome.stepper)} status=${JSON.stringify(statusStructured.stepper)}`,
        );
      }
    },
  );
}
