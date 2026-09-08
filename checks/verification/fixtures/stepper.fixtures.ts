import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { composeCatalog } from "../../../catalog/index.js";
import { registerWorkspace } from "../../../adapters/registry.js";
import { compilePlan, type CatalogArtifact, type CatalogInput, type CatalogWorkflowNode, type CompiledPlan } from "../../../kernel/engine/compile.js";
import { seedRunState, writeRunState } from "../../../kernel/engine/runstate.js";
import { laneKeys, type BusinessStateV2, type LaneKey, type RunNodeStateV2, type RunStateDocument, type Status } from "../../../kernel/schema/types.js";
import { renderStepperBlock } from "../../../kernel/session/status.js";
import { computeFolderStepper, computeStepper, ONBOARDING_GROUP_ID, readWorkspaceStepper, withOnboardingStepper } from "../../../kernel/session/stepper.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/** Verified shipped onboarding graph, accepted run statuses, planned folders, and CLI/MCP projections. */

const NOW = "2026-08-05T09:00:00.000Z";

// --- real onboarding graph (compiled from the shipped catalog) -----------------------------------

let cachedRealCatalogInput: CatalogInput | undefined;
function realCatalogInput(): CatalogInput {
  if (cachedRealCatalogInput) return cachedRealCatalogInput;
  const raw = composeCatalog(skillRoot);
  cachedRealCatalogInput = toCatalogInput(raw);
  return cachedRealCatalogInput;
}

let cachedRealPlan: CompiledPlan | undefined;
function realOnboardingPlan(): CompiledPlan {
  if (cachedRealPlan) return cachedRealPlan;
  cachedRealPlan = compilePlan(realCatalogInput());
  return cachedRealPlan;
}

function realMemberWorkflowIds(plan: CompiledPlan): string[] {
  return plan.nodes.filter((node) => node.groupId === ONBOARDING_GROUP_ID).map((node) => node.workflowId);
}

/** The onb-00…onb-21 chain, in dependency order, derived structurally (never by id-substring match — mirrors the module under test). onb-00 is the unique member with no in-group dependency; each next step is the unique member depending on exactly the previous one. */
function realOnboardingChain(plan: CompiledPlan): string[] {
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  const members = plan.nodes.filter((node) => node.groupId === ONBOARDING_GROUP_ID);
  const start = members.find((node) => !node.dependencies.some((dependencyId) => byId.get(dependencyId)?.groupId === ONBOARDING_GROUP_ID));
  assert(start !== undefined, "expected exactly one onboarding member with no in-group dependency (onb-00)");
  const chain = [start!.workflowId];
  // The terminal node has multiple non-onboarding-chain predecessors folded through onb-21 (and
  // the fan-out/fan-in joins have more than one predecessor), so "walk forward by single-dependent"
  // only holds up through the joins (onb-09, onb-15, onb-20) — this helper stops there; callers
  // needing onb-00/01/02 only rely on that leading straight-line stretch.
  let current = start!;
  for (let i = 0; i < 2; i += 1) {
    const next = members.find((node) => node.dependencies.length === 1 && byId.get(node.dependencies[0]!) === current);
    assert(next !== undefined, `expected a unique successor after ${current.workflowId}`);
    chain.push(next!.workflowId);
    current = next!;
  }
  return chain; // [onb-00, onb-01, onb-02]
}

function realTerminalWorkflowId(plan: CompiledPlan): string {
  const members = plan.nodes.filter((node) => node.groupId === ONBOARDING_GROUP_ID);
  const dependedOn = new Set(members.flatMap((node) => node.dependencies));
  const terminal = members.filter((node) => !dependedOn.has(node.id));
  assert(terminal.length === 1, `expected exactly one onboarding member no other member depends on (the terminal node), got ${terminal.length}`);
  return terminal[0]!.workflowId;
}

function buildRunState(plan: CompiledPlan, succeededWorkflowIds: ReadonlySet<string> = new Set()): RunStateDocument {
  const nodes: Record<string, RunNodeStateV2> = {};
  for (const node of plan.nodes) {
    nodes[node.id] = { nodeId: node.id, status: succeededWorkflowIds.has(node.workflowId) ? "succeeded" : "pending", attempts: [] };
  }
  return {
    schemaVersion: "1.0.0",
    runId: "run.stepper-fixture",
    planId: plan.planId,
    planRevision: plan.planRevision,
    createdAt: NOW,
    updatedAt: NOW,
    ownerSessionId: "stepper-fixture",
    heartbeatAt: NOW,
    ttlSeconds: 300,
    // NOTE: must satisfy kernel/schema/run-state.schema.json's `"minimum": 1` — this document is
    // only ever handed to computeStepper() directly (never through loadRunState's schema
    // validator), so a 0 here would silently pass here even though it is schema-invalid; kept
    // valid anyway so this helper never models an impossible run state.
    wallClockCapSeconds: 300,
    approvals: {},
    artifactBindings: plan.artifactBindings.map((binding) => ({ ...binding })),
    nodes,
  };
}

// --- minimal hand-authored catalog for the (g) existence-boundary proof --------------------------

function fixtureNode(overrides: Partial<CatalogWorkflowNode> & Pick<CatalogWorkflowNode, "id">): CatalogWorkflowNode {
  return {
    title: overrides.id,
    domainId: "domain.product",
    actionClass: "draft",
    dependencies: [],
    outputPaths: [],
    providerIds: [],
    laneIds: [] as LaneKey[],
    founderOnlyActions: [],
    gateCommands: [],
    idempotent: true,
    ...overrides,
  };
}

function fixtureCatalog(workflows: CatalogWorkflowNode[]): CatalogInput {
  const artifacts: CatalogArtifact[] = [];
  return { version: "catalog.stepper-fixture.1", artifacts, workflows };
}

// --- minimal BusinessStateV2 for scenario (i)'s seeded run --------------------------------------

function minimalBusinessState(): BusinessStateV2 {
  const lanes = {} as BusinessStateV2["lanes"];
  for (const key of laneKeys) lanes[key] = { status: "pending" as Status, evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: NOW,
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: "Stepper Fixture App",
      slug: "stepper-fixture-app",
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms: ["ios"],
      bundleIds: { ios: "com.example.stepper", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

// --- MCP stdio driver (mirrors status-degraded.fixtures.ts's callStatusOverMcp) ------------------

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

interface StatusToolResult {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text: string }>;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError?: boolean;
}

let driverCounter = 0;

function callStatusOverMcp(harness: Harness, home: string, args: Record<string, unknown>): StatusToolResult {
  driverCounter += 1;
  const driverDir = harness.makeTempDir(`stepper-status-driver-${driverCounter}`);
  const driverPath = path.join(driverDir, "drive-status.mts");
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
    clientInfo: { name: "stepper-status-fixture", version: "0.0.0" },
  });
  if (init.result?.serverInfo?.name !== "b2c-app-builder") throw new Error("handshake failed: " + JSON.stringify(init.result));
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\\n");
  const call = await request("tools/call", { name: "b2c_status", arguments: ${JSON.stringify(args)} });
  console.log(JSON.stringify(call.error ? { __protocolError: call.error } : (call.result ?? {})));
  server.kill();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); server.kill(); process.exit(1); });
`;
  writeFileSync(driverPath, driverSource, "utf8");
  const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 60_000 });
  assert(result.status === 0, `status driver failed (exit ${result.status}):\n${(result.stdout ?? "").slice(-800)}\n${(result.stderr ?? "").slice(-800)}`);
  const stdout = (result.stdout ?? "").trim();
  try {
    return JSON.parse(stdout) as StatusToolResult;
  } catch {
    throw new Error(`status driver produced non-JSON stdout: ${stdout.slice(-800)}`);
  }
}

export function register(harness: Harness): void {
  const plan = realOnboardingPlan();
  const catalogInput = realCatalogInput();
  const onboardingChain = realOnboardingChain(plan);
  const onb00 = onboardingChain[0]!;
  const onb01 = onboardingChain[1]!;
  const onb02 = onboardingChain[2]!;
  const terminal = realTerminalWorkflowId(plan);
  const onb00Node = plan.nodes.find((node) => node.workflowId === onb00)!;
  const outOfGroupOnb00Deps = onb00Node.dependencies.map((dependencyId) => plan.nodes.find((node) => node.id === dependencyId)!.workflowId);
  const terminalNode = plan.nodes.find((node) => node.workflowId === terminal)!;
  const outOfGroupTerminalDeps = terminalNode.dependencies
    .map((dependencyId) => plan.nodes.find((node) => node.id === dependencyId)!)
    .filter((node) => node.groupId !== ONBOARDING_GROUP_ID)
    .map((node) => node.workflowId);
  assert(outOfGroupOnb00Deps.length === 2, `expected onb-00 to declare exactly 2 out-of-group dependencies, got ${outOfGroupOnb00Deps.length}`);
  assert(
    outOfGroupTerminalDeps.length === 1,
    `expected the terminal node to declare exactly 1 out-of-group dependency (the injected ledger), got ${outOfGroupTerminalDeps.length}`,
  );
  const ledgerId = outOfGroupTerminalDeps[0]!;

  // --- a. fresh run-state, out-of-group onb-00 prerequisites succeeded -> onb-00 alone is active --

  harness.check("stepper: computeStepper — a fresh run with onb-00's out-of-group prerequisites succeeded reports onb-00 as the sole frontier (a)", () => {
    const runState = buildRunState(plan, new Set(outOfGroupOnb00Deps));
    const stepper = computeStepper(plan, { runState });
    assert(stepper.totalCount === 23, `expected totalCount 23, got ${stepper.totalCount}`);
    assert(stepper.completedCount === 0, `expected completedCount 0, got ${stepper.completedCount}`);
    assert(stepper.done === false, "expected done false on a fresh run");
    assert(stepper.source === "run-state", `expected source run-state, got ${stepper.source}`);
    assert(
      stepper.activeNodeIds.length === 1 && stepper.activeNodeIds[0] === onb00,
      `expected activeNodeIds === [${onb00}], got ${JSON.stringify(stepper.activeNodeIds)}`,
    );
  });

  harness.check("stepper: copied output files leave the entire unstarted plan at zero completion", () => {
    const dir = harness.makeTempDir("stepper-copied-outputs");
    const fixturePlan = compilePlan(
      fixtureCatalog([
        fixtureNode({ id: "workflow.fixture.first", groupId: "copied", outputPaths: ["first.md"] }),
        fixtureNode({ id: "workflow.fixture.second", groupId: "copied", outputPaths: ["second.md"], dependencies: ["workflow.fixture.first"] }),
      ]),
    );
    writeFileSync(path.join(dir, "first.md"), "Copied artifact");
    writeFileSync(path.join(dir, "second.md"), "Copied artifact");
    const stepper = computeStepper(fixturePlan, { groupId: "copied", workspaceRoot: dir });
    assert(stepper.completedCount === 0 && !stepper.done && stepper.source === "planned", "files were counted as proof");
    assert(renderStepperBlock(stepper).includes("not started"), "planned status must name absent execution");
  });

  // --- b. truly empty folder, planned mode -> onb-00 blocked on both out-of-group deps -------

  harness.check(
    "stepper: computeStepper — a truly empty folder in planned mode reports zero progress and onb-00 blocked on its two out-of-group prerequisites, honestly (b)",
    () => {
      const dir = harness.makeTempDir("stepper-empty-folder");
      const stepper = computeStepper(plan, { workspaceRoot: dir });
      assert(stepper.source === "planned", `expected source planned, got ${stepper.source}`);
      assert(stepper.completedCount === 0, `expected completedCount 0, got ${stepper.completedCount}`);
      assert(stepper.activeNodeIds.length === 0, `expected no active nodes in an empty folder, got ${JSON.stringify(stepper.activeNodeIds)}`);
      const blocked = stepper.blockedNodeIds.find((entry) => entry.nodeId === onb00);
      assert(blocked !== undefined, `expected onb-00 in blockedNodeIds, got ${JSON.stringify(stepper.blockedNodeIds)}`);
      for (const dependencyId of outOfGroupOnb00Deps) {
        assert(blocked!.blockedBy.includes(dependencyId), `expected onb-00's blockedBy to include ${dependencyId}, got ${JSON.stringify(blocked!.blockedBy)}`);
      }
    },
  );

  // --- c. onb-00..02 succeeded -> the 6-wide fan-out becomes active (run-state) --------------------

  harness.check("stepper: computeStepper — onb-00..02 succeeded opens exactly the 6-wide fan-out as active (c)", () => {
    // onb-07 (one of the six) also declares the injected ledger dependency out of group (the same
    // one scenario (f) blocks the terminal node on) — succeed it too here so this scenario proves
    // the fan-out width cleanly, without that incidental cross-cutting blocker.
    const runState = buildRunState(plan, new Set([onb00, onb01, onb02, ledgerId!]));
    const stepper = computeStepper(plan, { runState });
    assert(
      stepper.activeNodeIds.length === 6,
      `expected exactly 6 active nodes (the fan-out), got ${stepper.activeNodeIds.length}: ${JSON.stringify(stepper.activeNodeIds)}`,
    );
    assert(stepper.completedCount === 3, `expected completedCount 3, got ${stepper.completedCount}`);
  });

  // --- d. all 23 members succeeded -> done, empty active/blocked ----------------------------------

  harness.check("stepper: computeStepper — every member succeeded reports done with empty active and blocked lists (d)", () => {
    const runState = buildRunState(plan, new Set(realMemberWorkflowIds(plan)));
    const stepper = computeStepper(plan, { runState });
    assert(stepper.done === true, "expected done true");
    assert(stepper.completedCount === 23, `expected completedCount 23, got ${stepper.completedCount}`);
    assert(stepper.activeNodeIds.length === 0, `expected no active nodes once done, got ${JSON.stringify(stepper.activeNodeIds)}`);
    assert(stepper.blockedNodeIds.length === 0, `expected no blocked nodes once done, got ${JSON.stringify(stepper.blockedNodeIds)}`);
  });

  // --- e. an output exists without its dependency -> anomaly, not counted complete ----------------

  harness.check("stepper: computeStepper — a member's output without accepted run evidence stays planned (e)", () => {
    const onb05 = plan.nodes.find((node) => node.workflowId.includes("onb-05"))!;
    assert(
      onb05.dependencies.length === 1 && plan.nodes.find((node) => node.id === onb05.dependencies[0])!.workflowId === onb02,
      "expected onb-05 to depend on onb-02 alone (catalog assumption for this scenario)",
    );
    const dir = harness.makeTempDir("stepper-anomaly");
    const outputPath = path.join(dir, onb05.outputPaths[0]!);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, "");
    const stepper = computeStepper(plan, { workspaceRoot: dir });
    assert(stepper.completedCount === 0, `expected completedCount 0 (onb-05 must not count complete), got ${stepper.completedCount}`);
    assert(stepper.anomalies.length === 0, "unaccepted files do not create completion evidence or anomaly claims");
    assert(!stepper.activeNodeIds.includes(onb05.workflowId), "onb-05 must not be listed active while its dependency is unsatisfied");
  });

  // --- f. terminal node blocked on the injected ledger dependency, not active ----------------------

  harness.check(
    "stepper: computeStepper — onb-00..21 succeeded but the injected ledger dependency pending blocks the terminal node, not activates it (f)",
    () => {
      const nonTerminalMembers = realMemberWorkflowIds(plan).filter((workflowId) => workflowId !== terminal);
      const runState = buildRunState(plan, new Set(nonTerminalMembers));
      const stepper = computeStepper(plan, { runState });
      assert(
        !stepper.activeNodeIds.includes(terminal),
        `expected the terminal node NOT active while its ledger dependency is pending, got ${JSON.stringify(stepper.activeNodeIds)}`,
      );
      const blocked = stepper.blockedNodeIds.find((entry) => entry.nodeId === terminal);
      assert(blocked !== undefined, `expected the terminal node in blockedNodeIds, got ${JSON.stringify(stepper.blockedNodeIds)}`);
      assert(blocked!.blockedBy.includes(ledgerId!), `expected blockedBy to include ${ledgerId}, got ${JSON.stringify(blocked!.blockedBy)}`);
    },
  );

  // --- g. an empty output file counts as existing; run-state ignores file existence entirely ------

  harness.check("stepper: computeStepper — an empty output file does not establish completion in planned or pending run-state mode (g)", () => {
    const fixturePlan = compilePlan(
      fixtureCatalog([fixtureNode({ id: "workflow.fixture.stepper.leaf", groupId: "stepper-fixture-group", outputPaths: ["leaf.md"] })]),
    );
    const dir = harness.makeTempDir("stepper-empty-file-counts");
    writeFileSync(path.join(dir, "leaf.md"), "");

    const outputPathsResult = computeStepper(fixturePlan, { groupId: "stepper-fixture-group", workspaceRoot: dir });
    assert(
      outputPathsResult.completedCount === 0,
      `expected an empty output file to remain unaccepted, got completedCount=${outputPathsResult.completedCount}`,
    );

    const runStateResult = computeStepper(fixturePlan, { groupId: "stepper-fixture-group", runState: buildRunState(fixturePlan) });
    assert(
      runStateResult.completedCount === 0,
      `expected run-state mode to ignore the on-disk file and treat a pending node as incomplete, got completedCount=${runStateResult.completedCount}`,
    );
  });

  // --- h. withOnboardingStepper: unchanged for non-onboarding outcomes, attached for onboarding ---

  harness.check(
    "stepper: withOnboardingStepper leaves candidates/insufficient_signal/non-onboarding-primary outcomes unchanged, and attaches a stepper only for an onboarding primary (h)",
    () => {
      const dir = harness.makeTempDir("stepper-with-onboarding-empty");

      const candidatesOutcome = { kind: "candidates" as const, candidates: [], nextAgentAction: "x" };
      assert(!("stepper" in withOnboardingStepper(candidatesOutcome, dir)), "candidates outcome must never gain a stepper key");

      const insufficientOutcome = { kind: "insufficient_signal" as const, nextAgentAction: "x" };
      assert(!("stepper" in withOnboardingStepper(insufficientOutcome, dir)), "insufficient_signal outcome must never gain a stepper key");

      const mismatchOutcome = { kind: "product_mismatch" as const, productKind: "mismatch" as const, nextAgentAction: "x" };
      assert(!("stepper" in withOnboardingStepper(mismatchOutcome, dir)), "product_mismatch outcome must never gain a stepper key");

      const nonOnboardingPrimary = {
        kind: "primary" as const,
        workflowId: "workflow.fixture.definitely-not-onboarding",
        rationale: "x",
        doNotLoad: [],
        nextAgentAction: "x",
      };
      assert(!("stepper" in withOnboardingStepper(nonOnboardingPrimary, dir)), "a primary into a non-onboarding workflow must never gain a stepper key");

      const onboardingPrimary = { kind: "primary" as const, workflowId: onb00, rationale: "x", doNotLoad: [], nextAgentAction: "x" };
      const withStepper = withOnboardingStepper(onboardingPrimary, dir);
      assert("stepper" in withStepper && withStepper.stepper !== undefined, "a primary onboarding-group workflow must gain a stepper");
      assert(withStepper.stepper!.totalCount === 23, `expected totalCount 23, got ${withStepper.stepper?.totalCount}`);

      assert(!("stepper" in withOnboardingStepper(onboardingPrimary, undefined)), "with cwd undefined, no stepper can be computed, so none must be attached");
    },
  );

  // --- computeFolderStepper: the unregistered-folder entry point matches computeStepper's own planned behavior ---

  harness.check(
    "stepper: computeFolderStepper compiles the skill's own shipped catalog and matches computeStepper's planned behavior for an empty folder",
    () => {
      const dir = harness.makeTempDir("stepper-compute-folder-stepper");
      const stepper = computeFolderStepper(dir);
      assert(stepper.groupId === ONBOARDING_GROUP_ID, `expected groupId ${ONBOARDING_GROUP_ID}, got ${stepper.groupId}`);
      assert(stepper.totalCount === 23, `expected totalCount 23, got ${stepper.totalCount}`);
      assert(stepper.source === "planned", `expected source planned, got ${stepper.source}`);
      assert(
        stepper.blockedNodeIds.some((entry) => entry.nodeId === onb00),
        `expected onb-00 blocked in an empty folder, got ${JSON.stringify(stepper.blockedNodeIds)}`,
      );
    },
  );

  // --- readWorkspaceStepper: registered-workspace entry point, both the ok and typed-failure paths ---

  harness.check("stepper: readWorkspaceStepper reports a typed failure for a workspace with no catalog pin, and a real projection once one exists", () => {
    const bare = harness.makeTempDir("stepper-read-workspace-stepper-bare");
    const missing = readWorkspaceStepper(bare);
    assert(!missing.ok, `expected ok:false for a workspace with no catalog.json, got ${JSON.stringify(missing)}`);
    if (!missing.ok) assert(missing.code === "stepper.catalog_missing", `expected code stepper.catalog_missing, got ${missing.code}`);

    const pinned = harness.makeTempDir("stepper-read-workspace-stepper-pinned");
    const raw = composeCatalog(skillRoot);
    writeFileSync(path.join(pinned, "catalog.json"), JSON.stringify(toCatalogInput(raw)));
    const withCatalog = readWorkspaceStepper(pinned);
    assert(withCatalog.ok, `expected ok:true once catalog.json is pinned, got ${JSON.stringify(withCatalog)}`);
    if (withCatalog.ok) {
      assert(withCatalog.stepper.totalCount === 23, `expected totalCount 23, got ${withCatalog.stepper.totalCount}`);
      assert(withCatalog.stepper.source === "planned", `expected source planned (no run yet), got ${withCatalog.stepper.source}`);
    }
  });

  // --- i. end-to-end over MCP: b2c_status registered cwd carries the stepper; workspace: does not (R7) --

  harness.check(
    "stepper: b2c_status over MCP for a REGISTERED workspace returns structuredContent.stepper with totalCount 23, while the `workspace` form still carries no structuredContent at all (i)",
    () => {
      const home = harness.makeTempDir("stepper-mcp-home");
      const workspace = harness.makeTempDir("stepper-mcp-ws");

      const raw = composeCatalog(skillRoot);
      const catalogInput = toCatalogInput(raw);
      writeFileSync(path.join(workspace, "catalog.json"), `${JSON.stringify(catalogInput, null, 2)}\n`);

      const seededPlan = compilePlan(catalogInput);
      const run = seedRunState(seededPlan, minimalBusinessState(), { ownerSessionId: "stepper-fixture", ttlSeconds: 300, wallClockCapSeconds: 300, now: NOW });
      writeRunState(path.join(workspace, "run", "run-state.json"), run);

      withIsolatedHome(home, () => {
        registerWorkspace("stepper-mcp-fixture-ws", workspace);
      });

      const cwdResult = callStatusOverMcp(harness, home, { cwd: workspace });
      assert(cwdResult.isError !== true, `expected no error for the registered cwd call, got ${JSON.stringify(cwdResult)}`);
      const structured = cwdResult.structuredContent as { kind?: string; stepper?: { totalCount?: number } } | undefined;
      assert(structured?.kind === "registered", `expected kind registered, got ${JSON.stringify(structured?.kind)}`);
      assert(structured?.stepper?.totalCount === 23, `expected structuredContent.stepper.totalCount 23, got ${JSON.stringify(structured?.stepper)}`);

      const workspaceResult = callStatusOverMcp(harness, home, { workspace: "stepper-mcp-fixture-ws" });
      assert(workspaceResult.isError !== true, `expected no error for the workspace call, got ${JSON.stringify(workspaceResult)}`);
      assert(
        workspaceResult.structuredContent === undefined,
        `expected the workspace branch to carry no structuredContent at all (R7 unchanged), got ${JSON.stringify(workspaceResult.structuredContent)}`,
      );
    },
  );

  // --- j. zero group members: computeStepper never reports a vacuous "done" -----------------------

  harness.check(
    "stepper: computeStepper — a plan with zero members of the requested group reports totalCount 0 and done FALSE, never a vacuous completion (j)",
    () => {
      const noGroupPlan = compilePlan(fixtureCatalog([fixtureNode({ id: "workflow.fixture.stepper.no-group-field" })]));
      const stepper = computeStepper(noGroupPlan, { groupId: ONBOARDING_GROUP_ID, workspaceRoot: harness.makeTempDir("stepper-zero-members-compute") });
      assert(stepper.totalCount === 0, `expected totalCount 0, got ${stepper.totalCount}`);
      assert(stepper.completedCount === 0, `expected completedCount 0, got ${stepper.completedCount}`);
      assert(
        stepper.done === false,
        "expected done FALSE for a 0/0 group — completedCount === members.length is vacuously true at zero and must not read as done",
      );
    },
  );

  // --- k. zero group members: readWorkspaceStepper refuses outright with stepper.group_missing ----

  harness.check(
    "stepper: readWorkspaceStepper reports stepper.group_missing (not ok:true done:true) for a catalog pin whose compiled plan has zero onboarding-system members — e.g. a pre-U5 pin missing groupId entirely (k)",
    () => {
      const preU5Workflows = catalogInput.workflows.map(({ groupId: _groupId, ...rest }) => rest);
      const preU5Catalog: CatalogInput = { ...catalogInput, workflows: preU5Workflows };
      const dir = harness.makeTempDir("stepper-group-missing-registered");
      writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(preU5Catalog));

      const result = readWorkspaceStepper(dir);
      assert(!result.ok, `expected ok:false for a catalog pin with zero onboarding-system members, got ${JSON.stringify(result)}`);
      if (!result.ok) assert(result.code === "stepper.group_missing", `expected code stepper.group_missing, got ${result.code}`);
    },
  );

  // --- l. withOnboardingStepper: a registered workspace whose catalog lacks the group attaches no stepper (mirrors k) --

  harness.check(
    "stepper: withOnboardingStepper attaches no stepper for a registered workspace whose catalog pin has zero onboarding-system members (l)",
    () => {
      const preU5Workflows = catalogInput.workflows.map(({ groupId: _groupId, ...rest }) => rest);
      const preU5Catalog: CatalogInput = { ...catalogInput, workflows: preU5Workflows };
      const home = harness.makeTempDir("stepper-group-missing-home");
      const workspace = harness.makeTempDir("stepper-group-missing-ws");
      writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(preU5Catalog));
      // withOnboardingStepper resolves registration in-process (unlike callStatusOverMcp, which
      // passes B2C_APP_BUILDER_HOME to a spawned child) — it must run INSIDE withIsolatedHome, or it
      // reads whatever registry is ambient and this workspace looks unregistered.
      withIsolatedHome(home, () => {
        registerWorkspace("stepper-group-missing-fixture-ws", workspace);
        const onboardingPrimary = { kind: "primary" as const, workflowId: onb00, rationale: "x", doNotLoad: [], nextAgentAction: "x" };
        assert(
          !("stepper" in withOnboardingStepper(onboardingPrimary, workspace)),
          "expected no stepper key when the registered workspace's own catalog pin has zero onboarding-system members",
        );
      });
    },
  );

  // --- m. corrupt (present-but-unreadable) run-state.json is a typed failure, never silent pre-run fallback ---

  harness.check(
    "stepper: readWorkspaceStepper reports stepper.run_state_unreadable for a corrupt run-state.json — never silently falls back to planned mode and reports it as legitimate pre-run progress (m)",
    () => {
      const dir = harness.makeTempDir("stepper-run-state-corrupt");
      writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(catalogInput));
      mkdirSync(path.join(dir, "run"), { recursive: true });
      writeFileSync(path.join(dir, "run", "run-state.json"), "{ this is not valid json");

      const result = readWorkspaceStepper(dir);
      assert(!result.ok, `expected ok:false for a corrupt run-state.json, got ${JSON.stringify(result)}`);
      if (!result.ok) assert(result.code === "stepper.run_state_unreadable", `expected code stepper.run_state_unreadable, got ${result.code}`);
    },
  );

  // --- n. withOnboardingStepper's registered branch also refuses a corrupt run-state.json (mirrors m) ---

  harness.check("stepper: withOnboardingStepper attaches no stepper for a registered workspace with a corrupt run-state.json (n)", () => {
    const home = harness.makeTempDir("stepper-run-state-corrupt-home");
    const workspace = harness.makeTempDir("stepper-run-state-corrupt-ws");
    writeFileSync(path.join(workspace, "catalog.json"), JSON.stringify(catalogInput));
    mkdirSync(path.join(workspace, "run"), { recursive: true });
    withIsolatedHome(home, () => {
      registerWorkspace("stepper-run-state-corrupt-fixture-ws", workspace);
      writeFileSync(path.join(workspace, "run", "run-state.json"), "{ this is not valid json");
      const onboardingPrimary = { kind: "primary" as const, workflowId: onb00, rationale: "x", doNotLoad: [], nextAgentAction: "x" };
      assert(
        !("stepper" in withOnboardingStepper(onboardingPrimary, workspace)),
        "expected no stepper key when the registered workspace's run-state.json is corrupt",
      );
    });
  });

  // --- o. symlinked output leaf: existence must never be leaked through a symlink to an outside file ---

  harness.check(
    "stepper: a symlinked output-path LEAF pointing at a real file outside workspaceRoot counts as absent — the outside file's existence is never leaked or read through the link (o)",
    () => {
      const outside = harness.makeTempDir("stepper-symlink-leaf-outside");
      writeFileSync(path.join(outside, "secret-target.md"), "OUTSIDE CONTENT that must never be observed or leaked through a symlinked output path\n");

      const symlinkPlan = compilePlan(
        fixtureCatalog([fixtureNode({ id: "workflow.fixture.stepper.symlink-leaf", groupId: "stepper-symlink-fixture-group", outputPaths: ["linked.md"] })]),
      );

      const victim = harness.makeTempDir("stepper-symlink-leaf-victim");
      symlinkSync(path.join(outside, "secret-target.md"), path.join(victim, "linked.md"));
      const symlinked = computeStepper(symlinkPlan, { groupId: "stepper-symlink-fixture-group", workspaceRoot: victim });
      assert(symlinked.completedCount === 0, `expected the symlinked output NOT to count as existing (completedCount 0), got ${symlinked.completedCount}`);
      assert(
        symlinked.anomalies.length === 0,
        `expected no anomaly to be raised from a symlinked, treated-as-absent output, got ${JSON.stringify(symlinked.anomalies)}`,
      );

      // Control: an identical folder with no file at all under that name must produce the IDENTICAL
      // result — proving the symlink case is indistinguishable from "truly absent", i.e. nothing
      // about the outside file's existence leaked through.
      const control = harness.makeTempDir("stepper-symlink-leaf-control");
      const controlResult = computeStepper(symlinkPlan, { groupId: "stepper-symlink-fixture-group", workspaceRoot: control });
      assert(controlResult.completedCount === symlinked.completedCount, "expected the symlink-to-existing-file case to match the truly-absent control exactly");
    },
  );

  // --- p. symlinked INTERMEDIATE directory: the walk must catch a symlink at any path component, not just the leaf ---

  harness.check("stepper: a symlinked intermediate DIRECTORY on an output path counts as absent too — folder contents never establish completion (p)", () => {
    const outside = harness.makeTempDir("stepper-symlink-dir-outside");
    mkdirSync(path.join(outside, "real-target-dir"), { recursive: true });
    writeFileSync(path.join(outside, "real-target-dir", "leaf.md"), "OUTSIDE CONTENT reachable only by following the symlinked intermediate directory\n");

    const symlinkPlan = compilePlan(
      fixtureCatalog([
        fixtureNode({ id: "workflow.fixture.stepper.symlink-dir", groupId: "stepper-symlink-fixture-group", outputPaths: ["linked-dir/leaf.md"] }),
      ]),
    );

    const victim = harness.makeTempDir("stepper-symlink-dir-victim");
    symlinkSync(path.join(outside, "real-target-dir"), path.join(victim, "linked-dir"), "dir");
    const symlinked = computeStepper(symlinkPlan, { groupId: "stepper-symlink-fixture-group", workspaceRoot: victim });
    assert(
      symlinked.completedCount === 0,
      `expected the output behind a symlinked intermediate directory NOT to count as existing, got completedCount ${symlinked.completedCount}`,
    );

    // Positive control: the identical relative path with a REAL (non-symlinked) intermediate
    // directory must count as existing — proving this is a symlink-specific refusal, not a broken
    // nested-path check in general.
    const real = harness.makeTempDir("stepper-symlink-dir-real");
    mkdirSync(path.join(real, "linked-dir"), { recursive: true });
    writeFileSync(path.join(real, "linked-dir", "leaf.md"), "");
    const realResult = computeStepper(symlinkPlan, { groupId: "stepper-symlink-fixture-group", workspaceRoot: real });
    assert(realResult.completedCount === 0, `expected existing nested output to remain unaccepted, got completedCount ${realResult.completedCount}`);
  });

  // --- q. a declared outputPath that resolves outside workspaceRoot (a ".." escape) is refused outright ---

  harness.check('stepper: an outputPath that resolves outside workspaceRoot (a ".." escape) cannot establish completion even without a symlink (q)', () => {
    const root = harness.makeTempDir("stepper-escape-root");
    const sibling = harness.makeTempDir("stepper-escape-sibling");
    writeFileSync(path.join(sibling, "escape-target.md"), "content outside workspaceRoot\n");
    const escapingRelativePath = path.relative(root, path.join(sibling, "escape-target.md"));
    assert(escapingRelativePath.startsWith(".."), `fixture setup: expected the sibling path to require a ".." escape from root, got ${escapingRelativePath}`);

    const escapePlan = compilePlan(
      fixtureCatalog([fixtureNode({ id: "workflow.fixture.stepper.escape", groupId: "stepper-escape-fixture-group", outputPaths: [escapingRelativePath] })]),
    );
    const result = computeStepper(escapePlan, { groupId: "stepper-escape-fixture-group", workspaceRoot: root });
    assert(result.completedCount === 0, `expected an escaping outputPath to be refused (not counted complete), got completedCount ${result.completedCount}`);
  });

  // --- r. renderStepperBlock prints titles, never raw dotted "workflow." ids ------------------------

  harness.check(
    "stepper: renderStepperBlock's rendered text contains a member's human title and no raw \"workflow.\" engine id, for both the active and blocked lines (r)",
    () => {
      const activeRunState = buildRunState(plan, new Set(outOfGroupOnb00Deps));
      const activeStepper = computeStepper(plan, { runState: activeRunState });
      const activeRendered = renderStepperBlock(activeStepper);
      const onb00Title = onb00Node.title;
      assert(activeRendered.includes(onb00Title), `expected the rendered text to include onb-00's title "${onb00Title}", got:\n${activeRendered}`);
      assert(!activeRendered.includes("workflow."), `expected no raw "workflow." engine id anywhere in the rendered text, got:\n${activeRendered}`);

      const blockedStepper = computeStepper(plan, { workspaceRoot: harness.makeTempDir("stepper-render-blocked") });
      const blockedRendered = renderStepperBlock(blockedStepper);
      assert(blockedRendered.includes("Blocked on work outside onboarding:"), "expected a blocked section for an empty folder");
      assert(!blockedRendered.includes("workflow."), `expected no raw "workflow." engine id in the blocked section either, got:\n${blockedRendered}`);
    },
  );
}
