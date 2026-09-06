import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CONTRIBUTION_OPERATIONS } from "../../../contracts/contribution/contract.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";

/**
 * Contribution boundary suite (ADR-0005; ARCH-09 "new bindings do not widen the MCP write
 * surface"; ARCH-10 "declarations never grant authority"). Every case attempts a forbidden action
 * through the real contribution service or the real contributor registration and asserts the
 * recorded refusal code, never guardrail wording.
 *
 * The service module imports kernel/contribution/{check,evaluate,plan,preview,upstreams}.js,
 * which other agents write concurrently. The async cases therefore run inside ONE spawned driver
 * (the pattern checks/verification/fixtures/mcp.fixtures.ts uses for MCP conversations): a
 * module-not-found failure is recorded as a skip that names the pending module, never as a
 * pass. The authority scan at the end needs no kernel module and always runs.
 */

interface Refusal {
  readonly ok: boolean;
  readonly code?: string;
  readonly fields?: string[];
  readonly message?: string;
}

interface BoundaryResults {
  readonly enabledUnset: boolean;
  readonly enabledTrueWord: boolean;
  readonly enabledOne: boolean;
  readonly registered: Array<{ name: string; readOnlyHint: unknown; destructiveHint: unknown; openWorldHint: unknown }>;
  readonly returned: string[];
  readonly handlerUrl: { isError: boolean; code?: string };
  readonly evaluateMcp: Refusal;
  readonly planRelative: Refusal;
  readonly planOutside: Refusal;
  readonly planSymlink: Refusal;
  readonly planNoRoots: Refusal;
  readonly planNetwork: Refusal;
  readonly planTarget: Refusal;
  readonly planUrl: Refusal;
  readonly planInsideControl: Refusal;
  readonly checkRelativeMcp: Refusal;
  readonly upstreamCheckFetch: Refusal;
  readonly upstreamCheckObserve: Refusal;
  readonly upstreamCheckWrite: Refusal;
  readonly upstreamsListObserve: Refusal;
  readonly upgradePlanTarget: Refusal;
  readonly upgradePlanControl: Refusal;
  readonly symlinkEscapes: boolean;
  readonly cliRelative: string;
  readonly cliCwd: string;
  readonly processCwd: string;
  readonly cliAbsolute: string;
  readonly outsideFile: string;
  readonly delimiter: string;
  readonly rootsMixed: string[];
  readonly rootsEmpty: string[];
  readonly rootsBlank: string[];
  readonly rootsRelativeOnly: string[];
}

type DriverOutcome = { kind: "ok"; results: BoundaryResults } | { kind: "pending"; reason: string } | { kind: "failed"; detail: string };

const PENDING_OWNERS: Record<string, string> = {
  check: "intake-plan",
  evaluate: "intake-plan",
  plan: "intake-plan",
  preview: "intake-plan",
  upstreams: "upstreams",
};
const RESULT_MARKER = "__CONTRIBUTION_BOUNDARY_RESULT__";

function driverSource(temp: string): string {
  const servicePath = path.join(skillRoot, "kernel/contribution/service.ts");
  const contributePath = path.join(skillRoot, "entrypoints/mcp/contribute.ts");
  return [
    'import path from "node:path";',
    'import { lstatSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";',
    `import { callContributionOperation, contributionRootsFromEnv, resolveLocalPath } from ${JSON.stringify(servicePath)};`,
    `import { contributorToolsEnabled, registerContributorTools } from ${JSON.stringify(contributePath)};`,
    `const skillRoot = ${JSON.stringify(skillRoot)};`,
    `const temp = ${JSON.stringify(temp)};`,
    'const root = path.join(temp, "root");',
    'const outside = path.join(temp, "outside");',
    'const callerCwd = path.join(temp, "caller");',
    "for (const directory of [root, outside, callerCwd]) mkdirSync(directory, { recursive: true });",
    'const outsideFile = path.join(outside, "secret.md");',
    'writeFileSync(outsideFile, "# outside the root\\n\\nMust stay unreadable through MCP.\\n");',
    'const insideFile = path.join(root, "inside.md");',
    'writeFileSync(insideFile, "# inside the root\\n\\nA short local note about screen hierarchy.\\n");',
    'const escape = path.join(root, "escape.md");',
    "symlinkSync(outsideFile, escape);",
    "const symlinkEscapes = lstatSync(escape).isSymbolicLink() && !realpathSync(escape).startsWith(realpathSync(root) + path.sep);",
    'const mcp = { surface: "mcp", skillRoot, roots: [root] };',
    "const outcome = async (id, input, options) => {",
    "  const result = await callContributionOperation(id, input, options);",
    "  return result.ok ? { ok: true } : { ok: false, code: result.error.code, fields: result.error.fields, message: result.error.message };",
    "};",
    "const registered = [];",
    "const handlers = new Map();",
    "const stub = {",
    "  registerTool(name, config, handler) {",
    "    registered.push({ name, readOnlyHint: config?.annotations?.readOnlyHint, destructiveHint: config?.annotations?.destructiveHint, openWorldHint: config?.annotations?.openWorldHint });",
    "    handlers.set(name, handler);",
    "  },",
    "};",
    "const returned = registerContributorTools(stub, { skillRoot, env: { B2C_APP_BUILDER_CONTRIBUTION_ROOTS: root } });",
    'const planHandler = handlers.get("b2c_contribute_plan");',
    'const viaHandler = planHandler ? await planHandler({ sources: [{ url: "https://example.invalid/post" }], goal: "inspect a remote post" }) : { isError: false };',
    "const results = {",
    "  enabledUnset: contributorToolsEnabled({}),",
    '  enabledTrueWord: contributorToolsEnabled({ B2C_APP_BUILDER_MCP_CONTRIBUTOR: "true" }),',
    '  enabledOne: contributorToolsEnabled({ B2C_APP_BUILDER_MCP_CONTRIBUTOR: "1" }),',
    "  registered,",
    "  returned,",
    "  handlerUrl: { isError: viaHandler.isError === true, code: viaHandler.structuredContent?.error?.code },",
    '  evaluateMcp: await outcome("contribution.evaluate", { target: insideFile }, mcp),',
    '  planRelative: await outcome("contribution.plan", { sources: [{ path: "inside.md" }], goal: "read a relative path" }, mcp),',
    '  planOutside: await outcome("contribution.plan", { sources: [{ path: outsideFile }], goal: "read outside the root" }, mcp),',
    '  planSymlink: await outcome("contribution.plan", { sources: [{ path: escape }], goal: "read through a symlink" }, mcp),',
    '  planNoRoots: await outcome("contribution.plan", { sources: [{ path: insideFile }], goal: "read with no roots" }, { surface: "mcp", skillRoot, roots: [] }),',
    '  planNetwork: await outcome("contribution.plan", { sources: [{ path: insideFile }], goal: "fetch from mcp", network: true }, mcp),',
    '  planTarget: await outcome("contribution.plan", { sources: [{ path: insideFile }], goal: "write from mcp", target: root }, mcp),',
    '  planUrl: await outcome("contribution.plan", { sources: [{ url: "https://example.invalid/post" }], goal: "fetch a url from mcp" }, mcp),',
    '  planInsideControl: await outcome("contribution.plan", { sources: [{ path: insideFile }], goal: "read inside the root" }, mcp),',
    '  checkRelativeMcp: await outcome("contribution.check", { target: "." }, mcp),',
    '  upstreamCheckFetch: await outcome("upstreams.check", { upstreamId: "rork-app-store-connect-cli", fetch: true }, mcp),',
    '  upstreamCheckObserve: await outcome("upstreams.check", { upstreamId: "rork-app-store-connect-cli", observeHost: true }, mcp),',
    '  upstreamCheckWrite: await outcome("upstreams.check", { upstreamId: "rork-app-store-connect-cli", write: true }, mcp),',
    '  upstreamsListObserve: await outcome("upstreams.list", { observeHost: true }, mcp),',
    '  upgradePlanTarget: await outcome("upstreams.upgrade-plan", { upstreamId: "rork-app-store-connect-cli", target: root }, mcp),',
    '  upgradePlanControl: await outcome("upstreams.upgrade-plan", { upstreamId: "rork-app-store-connect-cli" }, mcp),',
    "  symlinkEscapes,",
    '  cliRelative: resolveLocalPath({ surface: "cli", skillRoot, cwd: callerCwd }, path.join("source", "post.md"), "read"),',
    "  cliCwd: callerCwd,",
    "  processCwd: process.cwd(),",
    '  cliAbsolute: resolveLocalPath({ surface: "cli", skillRoot, cwd: callerCwd }, outsideFile, "read"),',
    "  outsideFile,",
    "  delimiter: path.delimiter,",
    '  rootsMixed: contributionRootsFromEnv({ B2C_APP_BUILDER_CONTRIBUTION_ROOTS: ["relative/dir", "/abs/one", " /abs/two ", "", "./dotted"].join(path.delimiter) }),',
    "  rootsEmpty: contributionRootsFromEnv({}),",
    '  rootsBlank: contributionRootsFromEnv({ B2C_APP_BUILDER_CONTRIBUTION_ROOTS: "   " }),',
    '  rootsRelativeOnly: contributionRootsFromEnv({ B2C_APP_BUILDER_CONTRIBUTION_ROOTS: "relative/only" }),',
    "};",
    `console.log(${JSON.stringify(RESULT_MARKER)} + JSON.stringify(results));`,
    "",
  ].join("\n");
}

let cached: DriverOutcome | undefined;

function runDriver(harness: Harness): DriverOutcome {
  if (cached) return cached;
  const temp = harness.makeTempDir("contribution-boundaries");
  const driverPath = path.join(temp, "drive-contribution-boundaries.mts");
  writeFileSync(driverPath, driverSource(temp), "utf8");
  const result = spawnSync(resolveTsxBin(skillRoot), [driverPath], { cwd: skillRoot, encoding: "utf8", timeout: 180_000 });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const pending = /Cannot find module '[^']*?kernel\/contribution\/(check|evaluate|plan|preview|upstreams)\.js'/u.exec(output);
  if (pending?.[1]) {
    cached = { kind: "pending", reason: `kernel/contribution/${pending[1]}.ts pending from agent ${PENDING_OWNERS[pending[1]] ?? "unknown"}` };
    return cached;
  }
  const line = (result.stdout ?? "").split(/\r?\n/u).find((entry) => entry.startsWith(RESULT_MARKER));
  if (result.status !== 0 || !line) {
    cached = { kind: "failed", detail: `boundary driver failed (exit ${result.status})\n${output.trim().slice(-1200)}` };
    return cached;
  }
  cached = { kind: "ok", results: JSON.parse(line.slice(RESULT_MARKER.length)) as BoundaryResults };
  return cached;
}

function driverCase(harness: Harness, label: string, assertion: (results: BoundaryResults) => void): void {
  const outcome = runDriver(harness);
  if (outcome.kind === "pending") {
    harness.skip(label, outcome.reason);
    return;
  }
  harness.check(label, () => {
    assert(outcome.kind === "ok", outcome.kind === "failed" ? outcome.detail : "driver produced no results");
    assertion(outcome.results);
  });
}

function refused(refusal: Refusal, code: string, context: string): void {
  assert(!refusal.ok && refusal.code === code, `${context}: expected ${code}; got ${refusal.ok ? "success" : `${refusal.code} (${refusal.message ?? ""})`}`);
}

const MCP_OPERATION_NAMES = CONTRIBUTION_OPERATIONS.flatMap((operation) => (operation.mcp === null ? [] : [operation.mcp])).sort();

export function register(harness: Harness): void {
  driverCase(harness, "contributor MCP surface: tools stay off unless B2C_APP_BUILDER_MCP_CONTRIBUTOR is exactly 1", (results) => {
    assert(results.enabledUnset === false, "an unset variable must keep the contributor tools off");
    assert(results.enabledTrueWord === false, 'the word "true" must not enable the contributor tools');
    assert(results.enabledOne === true, 'the value "1" is the only opt-in');
  });

  driverCase(
    harness,
    "contributor MCP surface: registration covers every MCP-projected operation, marks each read-only, and never exposes contribution.evaluate",
    (results) => {
      const cliOnly = CONTRIBUTION_OPERATIONS.filter((operation) => operation.mcp === null).map((operation) => operation.id);
      assert(cliOnly.join(",") === "contribution.evaluate", `the contract keeps exactly contribution.evaluate CLI-only; got ${cliOnly.join(",")}`);
      const names = results.registered.map((entry) => entry.name).sort();
      assert(names.join(",") === MCP_OPERATION_NAMES.join(","), `registered tools must equal the MCP-projected operations; got ${names.join(",")}`);
      assert([...results.returned].sort().join(",") === MCP_OPERATION_NAMES.join(","), "registerContributorTools must report exactly what it registered");
      assert(!names.some((name) => /evaluate/u.test(name)), "no evaluate tool may be registered on MCP");
      const notReadOnly = results.registered
        .filter((entry) => entry.readOnlyHint !== true || entry.destructiveHint !== false || entry.openWorldHint !== false)
        .map((entry) => entry.name);
      assert(notReadOnly.length === 0, `every contributor tool must be annotated read-only, non-destructive, closed-world; got ${notReadOnly.join(",")}`);
    },
  );

  driverCase(harness, "contributor MCP surface: a registered handler runs on the MCP surface and refuses a remote source", (results) => {
    assert(
      results.handlerUrl.isError === true && results.handlerUrl.code === "NETWORK_DISABLED",
      `the plan handler must refuse a URL with NETWORK_DISABLED and isError; got ${JSON.stringify(results.handlerUrl)}`,
    );
  });

  driverCase(harness, "contributor MCP surface: contribution.evaluate is refused as CLI-only before any input is read", (results) => {
    refused(results.evaluateMcp, "LOCAL_OPERATION_REFUSED", "evaluate through MCP");
    assert(results.evaluateMcp.fields?.includes("operation") === true, "the refusal must name the operation field");
  });

  driverCase(
    harness,
    "contributor MCP surface: relative paths, paths outside every root, and symlinks that escape a root are refused while an in-root file is not",
    (results) => {
      refused(results.planRelative, "LOCAL_OPERATION_REFUSED", "relative source path");
      refused(results.planOutside, "LOCAL_OPERATION_REFUSED", "absolute path outside the root");
      assert(results.symlinkEscapes, "the fixture symlink must resolve outside the root for the case to mean anything");
      refused(results.planSymlink, "LOCAL_OPERATION_REFUSED", "symlink inside the root pointing outside");
      refused(results.checkRelativeMcp, "LOCAL_OPERATION_REFUSED", "relative check target");
      const control = results.planInsideControl;
      assert(
        control.ok || (control.code !== "LOCAL_OPERATION_REFUSED" && control.code !== "NETWORK_DISABLED"),
        `an absolute in-root file must pass the path boundary; got ${control.code} (${control.message ?? ""})`,
      );
    },
  );

  driverCase(harness, "contributor MCP surface: an empty root list refuses every local path", (results) => {
    refused(results.planNoRoots, "LOCAL_OPERATION_REFUSED", "no configured roots");
  });

  driverCase(harness, "contributor MCP surface: network intake, host probes, and writes are refused on every operation that offers them", (results) => {
    refused(results.planNetwork, "NETWORK_DISABLED", "plan --network");
    refused(results.planUrl, "NETWORK_DISABLED", "plan with a URL source");
    refused(results.planTarget, "LOCAL_OPERATION_REFUSED", "plan --target");
    refused(results.upstreamCheckFetch, "NETWORK_DISABLED", "upstream-check --fetch");
    refused(results.upstreamCheckObserve, "NETWORK_DISABLED", "upstream-check --observe-host");
    refused(results.upstreamCheckWrite, "NETWORK_DISABLED", "upstream-check --write");
    refused(results.upstreamsListObserve, "LOCAL_OPERATION_REFUSED", "upstreams --observe-host");
    refused(results.upgradePlanTarget, "LOCAL_OPERATION_REFUSED", "upgrade-plan --target");
    const control = results.upgradePlanControl;
    assert(
      control.ok || control.code !== "LOCAL_OPERATION_REFUSED",
      `an upgrade plan without a target is a read and must not be refused as a write; got ${control.code} (${control.message ?? ""})`,
    );
  });

  driverCase(harness, "CLI surface: relative paths resolve against the caller directory, never the process directory", (results) => {
    assert(results.cliCwd !== results.processCwd, "the fixture caller directory must differ from the process directory");
    assert(
      results.cliRelative === path.join(results.cliCwd, "source", "post.md"),
      `expected ${path.join(results.cliCwd, "source", "post.md")}; got ${results.cliRelative}`,
    );
    assert(!results.cliRelative.startsWith(results.processCwd + path.sep), "a relative path must not resolve under process.cwd()");
    assert(results.cliAbsolute === results.outsideFile, "an absolute CLI path resolves to itself");
  });

  driverCase(harness, "filesystem scope: contributionRootsFromEnv splits on the platform delimiter and ignores relative or blank entries", (results) => {
    assert(results.delimiter === path.delimiter, "the driver and the suite must agree on the delimiter");
    assert(results.rootsMixed.join("|") === "/abs/one|/abs/two", `expected the two absolute roots only; got ${JSON.stringify(results.rootsMixed)}`);
    assert(results.rootsEmpty.length === 0 && results.rootsBlank.length === 0, "an unset or blank variable yields no roots");
    assert(results.rootsRelativeOnly.length === 0, "a relative-only variable yields no roots");
  });

  harness.check("authority: contribution modules and surfaces never import the reducer or the session runner", () => {
    const candidates = [
      ...readdirSync(path.join(skillRoot, "kernel/contribution"))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => path.join("kernel/contribution", name)),
      "entrypoints/mcp/contribute.ts",
      "entrypoints/cli/contribute.ts",
    ].filter((relative) => existsSync(path.join(skillRoot, relative)));
    assert(
      candidates.some((relative) => relative.endsWith("service.ts")),
      "kernel/contribution/service.ts must exist for this scan to cover the dispatcher",
    );
    const offenders: string[] = [];
    for (const relative of candidates) {
      const text = readFileSync(path.join(skillRoot, relative), "utf8");
      for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/gu)) {
        const specifier = match[1] ?? "";
        if (/(?:^|\/)reducer(?:\/|\.js|$)/u.test(specifier) || /session\/run(?:\.js)?$/u.test(specifier) || /session\/reducer-cli/u.test(specifier)) {
          offenders.push(`${relative} -> ${specifier}`);
        }
      }
    }
    assert(offenders.length === 0, `contribution code must not touch reducer-owned state or the session runner; got ${offenders.join("; ")}`);
  });
}
