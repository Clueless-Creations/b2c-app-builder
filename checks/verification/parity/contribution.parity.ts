import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";

/**
 * Contribution surface parity (ADR-0005; ARCH-09 "CLI and MCP project one versioned operation
 * registry and shared application services ... each operation has one public meaning").
 *
 * Proof 12: the same read operation through the CLI surface, the MCP surface, and the real
 * `b2c contribute` process returns one result. Only the envelope's requestId, the data's own
 * timestamps (`generatedAt`, `contributionManifest.createdAt`), and the CLI-only `written` path
 * may differ, and the suite proves those fields were real before it strips them.
 *
 * The service module imports kernel/contribution/{check,evaluate,plan,preview,upstreams}.js,
 * which other agents write concurrently, so the two service surfaces run inside ONE spawned
 * driver and the CLI runs as its own process. A module-not-found failure is recorded as a skip
 * that names the pending module, never as a pass.
 */

const UPSTREAM_ID = "rork-app-store-connect-cli";
const RESULT_MARKER = "__CONTRIBUTION_PARITY_RESULT__";
const PENDING_OWNERS: Record<string, string> = {
  check: "intake-plan",
  evaluate: "intake-plan",
  plan: "intake-plan",
  preview: "intake-plan",
  upstreams: "upstreams",
};
const PENDING_PATTERN = /Cannot find module '[^']*?kernel\/contribution\/(check|evaluate|plan|preview|upstreams)\.js'/u;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

type JsonObject = Record<string, unknown>;

interface Envelope {
  readonly apiVersion?: string;
  readonly requestId?: unknown;
  readonly ok: boolean;
  readonly warnings?: string[];
  readonly data?: unknown;
  readonly error?: { code: string; message: string };
}

interface DriverResults {
  readonly listCli: Envelope;
  readonly listMcp: Envelope;
  readonly planCli: Envelope;
  readonly planMcp: Envelope;
}

type Outcome<T> = { kind: "ok"; value: T } | { kind: "pending"; reason: string } | { kind: "failed"; detail: string };

const tsxBin = resolveTsxBin(skillRoot);

function pendingReason(output: string): string | undefined {
  const match = PENDING_PATTERN.exec(output);
  return match?.[1] ? `kernel/contribution/${match[1]}.ts pending from agent ${PENDING_OWNERS[match[1]] ?? "unknown"}` : undefined;
}

function driverSource(temp: string): string {
  const servicePath = path.join(skillRoot, "kernel/contribution/service.ts");
  return [
    'import { mkdirSync } from "node:fs";',
    'import path from "node:path";',
    `import { callContributionOperation } from ${JSON.stringify(servicePath)};`,
    `const skillRoot = ${JSON.stringify(skillRoot)};`,
    `const callerCwd = path.join(${JSON.stringify(temp)}, "caller");`,
    "mkdirSync(callerCwd, { recursive: true });",
    'const cli = { surface: "cli", skillRoot, cwd: callerCwd };',
    'const mcp = { surface: "mcp", skillRoot, roots: [] };',
    "const results = {",
    '  listCli: await callContributionOperation("upstreams.list", {}, cli),',
    '  listMcp: await callContributionOperation("upstreams.list", {}, mcp),',
    `  planCli: await callContributionOperation("upstreams.upgrade-plan", { upstreamId: ${JSON.stringify(UPSTREAM_ID)} }, cli),`,
    `  planMcp: await callContributionOperation("upstreams.upgrade-plan", { upstreamId: ${JSON.stringify(UPSTREAM_ID)} }, mcp),`,
    "};",
    `console.log(${JSON.stringify(RESULT_MARKER)} + JSON.stringify(results));`,
    "",
  ].join("\n");
}

let driverOutcome: Outcome<DriverResults> | undefined;

function runDriver(harness: Harness): Outcome<DriverResults> {
  if (driverOutcome) return driverOutcome;
  const temp = harness.makeTempDir("contribution-parity");
  mkdirSync(temp, { recursive: true });
  const driverPath = path.join(temp, "drive-contribution-parity.mts");
  writeFileSync(driverPath, driverSource(temp), "utf8");
  const result = spawnSync(tsxBin, [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 180_000 });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pending = pendingReason(output);
  if (pending) {
    driverOutcome = { kind: "pending", reason: pending };
    return driverOutcome;
  }
  const line = (result.stdout ?? "").split(/\r?\n/u).find((entry) => entry.startsWith(RESULT_MARKER));
  if (result.status !== 0 || !line) {
    driverOutcome = { kind: "failed", detail: `parity driver failed (exit ${result.status})\n${output.trim().slice(-1200)}` };
    return driverOutcome;
  }
  driverOutcome = { kind: "ok", value: JSON.parse(line.slice(RESULT_MARKER.length)) as DriverResults };
  return driverOutcome;
}

const cliOutcomes = new Map<string, Outcome<Envelope>>();

/** The real `b2c contribute` process, JSON mode, with the caller directory pinned to the checkout. */
function runCli(args: string[]): Outcome<Envelope> {
  const key = args.join(" ");
  const cached = cliOutcomes.get(key);
  if (cached) return cached;
  const result = spawnSync(tsxBin, [path.join(skillRoot, "entrypoints/cli/contribute.ts"), ...args, "--json"], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, B2C_APP_BUILDER_CALLER_CWD: skillRoot },
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  let outcome: Outcome<Envelope>;
  const pending = pendingReason(output);
  const start = (result.stdout ?? "").indexOf("{");
  if (pending) outcome = { kind: "pending", reason: pending };
  else if (result.error) outcome = { kind: "failed", detail: `spawn error: ${result.error.message}` };
  else if (start < 0) outcome = { kind: "failed", detail: `b2c contribute ${key} printed no JSON (exit ${result.status})\n${output.trim().slice(-1200)}` };
  else {
    try {
      outcome = { kind: "ok", value: JSON.parse((result.stdout ?? "").slice(start)) as Envelope };
    } catch (error) {
      outcome = { kind: "failed", detail: `b2c contribute ${key} printed unparseable JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  cliOutcomes.set(key, outcome);
  return outcome;
}

function parityCase(harness: Harness, label: string, cliArgs: string[], assertion: (driver: DriverResults, cli: Envelope) => void): void {
  const driver = runDriver(harness);
  if (driver.kind === "pending") {
    harness.skip(label, driver.reason);
    return;
  }
  const cli = runCli(cliArgs);
  if (cli.kind === "pending") {
    harness.skip(label, cli.reason);
    return;
  }
  harness.check(label, () => {
    assert(driver.kind === "ok", driver.kind === "failed" ? driver.detail : "driver produced no results");
    assert(cli.kind === "ok", cli.kind === "failed" ? cli.detail : "CLI produced no results");
    assertion(driver.value, cli.value);
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Normalization                                                                                */
/* ------------------------------------------------------------------------------------------ */

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deterministic serialization: keys sorted at every depth, so two independently built objects compare by content. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function omit(value: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

function successData(envelope: Envelope, context: string): JsonObject {
  assert(envelope.ok === true, `${context} must succeed; got ${JSON.stringify(envelope.error ?? envelope).slice(0, 400)}`);
  assert(typeof envelope.requestId === "string" && envelope.requestId.length > 0, `${context} must carry a requestId`);
  assert(isObject(envelope.data), `${context} must carry object data`);
  return envelope.data;
}

/** Inventory data with its generation time removed, after proving the time was there. */
function inventoryBody(envelope: Envelope, context: string): JsonObject {
  const data = successData(envelope, context);
  assert(
    typeof data.generatedAt === "string" && ISO_DATETIME.test(data.generatedAt),
    `${context} must stamp generatedAt as an ISO datetime; got ${String(data.generatedAt)}`,
  );
  return omit(data, ["generatedAt"]);
}

/** Upgrade-plan data with the manifest creation time and the write path removed, after proving both were there. */
function planBody(envelope: Envelope, context: string): JsonObject {
  const data = successData(envelope, context);
  assert("written" in data && data.written === null, `${context} without a target must report written=null; got ${JSON.stringify(data.written)}`);
  const manifest = data.contributionManifest;
  assert(isObject(manifest), `${context} must carry a contributionManifest`);
  assert(
    typeof manifest.createdAt === "string" && ISO_DATETIME.test(manifest.createdAt),
    `${context} manifest must stamp createdAt; got ${String(manifest.createdAt)}`,
  );
  return { ...omit(data, ["written", "contributionManifest"]), contributionManifest: omit(manifest, ["createdAt"]) };
}

function assertSame(left: JsonObject, right: JsonObject, context: string): void {
  const leftText = canonical(left);
  const rightText = canonical(right);
  if (leftText === rightText) return;
  const differing = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => canonical(left[key]) !== canonical(right[key]));
  throw new Error(`${context}: data differs in ${differing.join(", ") || "(unknown field)"}`);
}

/* ------------------------------------------------------------------------------------------ */

export function register(harness: Harness): void {
  parityCase(
    harness,
    "parity: upstreams.list returns one inventory through the CLI surface, the MCP surface, and the b2c contribute process",
    ["upstreams"],
    (driver, cliProcess) => {
      const cli = inventoryBody(driver.listCli, "upstreams.list (cli surface)");
      const mcp = inventoryBody(driver.listMcp, "upstreams.list (mcp surface)");
      const process = inventoryBody(cliProcess, "b2c contribute upstreams");
      assert(driver.listCli.requestId !== driver.listMcp.requestId, "each call must be its own request; equal requestIds mean a cached envelope, not parity");
      const rows = cli.upstreams;
      assert(Array.isArray(rows) && rows.length > 0, "the inventory must list at least one authored upstream");
      const row = rows.find((entry) => isObject(entry) && entry.id === UPSTREAM_ID);
      assert(isObject(row), `the inventory must include ${UPSTREAM_ID}`);
      assert(Array.isArray(row.relationships) && row.relationships.length > 0, "the inventory row must carry its declared relationships");
      assert(isObject(row.review) && typeof row.review.status === "string", "the inventory row must carry its review state");
      assertSame(cli, mcp, "CLI surface versus MCP surface");
      assertSame(cli, process, "CLI surface versus b2c contribute upstreams");
      assert(!("generatedAt" in cli) && !("generatedAt" in mcp) && !("generatedAt" in process), "only the generation time was stripped");
    },
  );

  parityCase(
    harness,
    "parity: upstreams.upgrade-plan without a target returns one plan through the CLI surface, the MCP surface, and the b2c contribute process, and writes nothing on any of them",
    ["upgrade-plan", "--upstream", UPSTREAM_ID],
    (driver, cliProcess) => {
      const cli = planBody(driver.planCli, "upstreams.upgrade-plan (cli surface)");
      const mcp = planBody(driver.planMcp, "upstreams.upgrade-plan (mcp surface)");
      const process = planBody(cliProcess, "b2c contribute upgrade-plan");
      assert(driver.planCli.requestId !== driver.planMcp.requestId, "each call must be its own request");
      assert(
        cli.upstreamId === UPSTREAM_ID && cli.effectsUnchanged === true,
        `the plan must name the upstream and keep effects unchanged; got ${JSON.stringify({ upstreamId: cli.upstreamId, effectsUnchanged: cli.effectsUnchanged })}`,
      );
      const manifest = cli.contributionManifest;
      assert(isObject(manifest) && Array.isArray(manifest.units) && manifest.units.length > 0, "the plan must carry a manifest with at least one unit");
      assert(Array.isArray(cli.requiredVerification) && cli.requiredVerification.length > 0, "the plan must name required verification");
      assertSame(cli, mcp, "CLI surface versus MCP surface");
      assertSame(cli, process, "CLI surface versus b2c contribute upgrade-plan");
    },
  );
}
