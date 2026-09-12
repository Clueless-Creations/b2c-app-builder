import { writeProductFixture } from "./product-fixture.js";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { COMMANDS, HELP_SECTIONS, HELP_WRAP_COLUMNS, listedCommandNames } from "../../../entrypoints/cli/help.mjs";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { seedRunState } from "../../../kernel/engine/runstate.js";
import { loadBusinessStateFile, resolveWorkspacePaths } from "../../../kernel/session/run.js";
import { loadWorkspaceCatalog } from "../../../kernel/session/catalog-contract.js";
import { PORTABLE_MCP_COMMAND } from "../../../kernel/session/setup.js";

/**
 * The packaged `b2c` bin (entrypoints/cli/b2c.mjs): the engine's one installable command-line
 * address. These cases prove the dispatcher itself — help, unknown-command refusal, and that a
 * subcommand execs the REAL underlying CLI with exit codes passed through untouched (the bin adds
 * an address, never a second implementation). The underlying CLIs' own behavior is proven by
 * their own suites and check:engine-e2e; nothing here re-tests them.
 */

const binPath = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");

function runBin(args: string[], opts: { env?: Record<string, string>; cwd?: string } = {}): { code: number; output: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: opts.cwd ?? skillRoot,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function filesUnder(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, name.name);
      if (name.isDirectory()) visit(absolute);
      else files.push(path.relative(root, absolute));
    }
  };
  visit(root);
  return files.sort();
}

function fileSnapshot(root: string): Record<string, string> {
  return Object.fromEntries(filesUnder(root).map((file) => [file, readFileSync(path.join(root, file), "utf8")]));
}

export function register(harness: Harness): void {
  harness.check("cli: research check exposes a bounded read-only contract explanation", () => {
    const text = runBin(["check", "research", "--explain"]);
    assert(text.code === 0, `research explanation must exit 0, got ${text.code}: ${text.output}`);
    assert(text.output.includes("Research contract 1.0.0"), "explanation must identify its contract version");
    assert(text.output.includes("Go, Pivot, Or Kill"), "explanation must list the checkpoint section");
    assert(text.output.includes("valid Pivot or Kill is a held checkpoint"), "explanation must preserve the non-Go hold meaning");
    const json = runBin(["check", "research", "--explain", "--json"]);
    assert(json.code === 0, `JSON research explanation must exit 0, got ${json.code}: ${json.output}`);
    const parsed = JSON.parse(json.output.trim()) as { check?: string; explanation?: { sections?: unknown[]; safety?: string } };
    assert(parsed.check === "research", "JSON explanation must identify the check");
    assert(parsed.explanation?.sections?.length === 7, "JSON explanation must expose the seven bounded research sections");
    assert(parsed.explanation?.safety?.includes("read-only"), "JSON explanation must state its safety boundary");
  });

  harness.check("cli: the bin exists where the package.json bin field points", () => {
    assert(existsSync(binPath), `entrypoints/cli/b2c.mjs is missing at ${binPath}`);
    const manifest = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { bin?: Record<string, string> };
    assert(manifest.bin?.b2c === "entrypoints/cli/b2c.mjs", "package.json bin.b2c must point at entrypoints/cli/b2c.mjs");
  });

  harness.check("cli: the package-name bin aliases the MCP launcher", () => {
    const mcpBin = path.join(skillRoot, "entrypoints", "mcp", "b2c-app-builder-mcp.mjs");
    assert(existsSync(mcpBin), `entrypoints/mcp/b2c-app-builder-mcp.mjs is missing at ${mcpBin}`);
    const manifest = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { bin?: Record<string, string> };
    assert(
      manifest.bin?.["b2c-app-builder-mcp"] === "entrypoints/mcp/b2c-app-builder-mcp.mjs",
      "package.json bin.b2c-app-builder-mcp must point at entrypoints/mcp/b2c-app-builder-mcp.mjs",
    );
    assert(
      manifest.bin?.["b2c-app-builder"] === "entrypoints/mcp/b2c-app-builder-mcp.mjs",
      "package.json bin.b2c-app-builder must alias the MCP launcher so npx -y b2c-app-builder starts the server",
    );
    assert(PORTABLE_MCP_COMMAND === "npx -y b2c-app-builder", "portable MCP registration must be the package-name npx form");
  });

  harness.check("cli: --help lists every command and exits 0; no arguments exits 1", () => {
    const help = runBin(["--help"]);
    assert(help.code === 0, `--help must exit 0, got ${help.code}`);
    for (const command of [
      "setup",
      "inspect",
      "doctor",
      "new",
      "render-product",
      "bootstrap",
      "status",
      "plan",
      "run",
      "approve",
      "verify",
      "scope",
      "onboard",
      "schedule",
      "workspaces",
      "list",
      "operate",
      "app-review-ingress",
      "update",
    ]) {
      assert(help.output.includes(command), `--help must list "${command}"`);
    }
    const bare = runBin([]);
    assert(bare.code === 1, `no arguments must exit 1, got ${bare.code}`);
  });

  harness.check("cli: grouped help covers every registered command exactly once", () => {
    const listed = listedCommandNames(HELP_SECTIONS);
    const registered = [...COMMANDS.keys()];
    assert(listed.length === new Set(listed).size, "HELP_SECTIONS must not list a command twice");
    assert(
      listed.length === registered.length && listed.every((name) => COMMANDS.has(name)),
      `grouped help and COMMANDS must match. listed=${listed.join(",")} registered=${registered.join(",")}`,
    );
    const help = runBin(["--help"]);
    const dashH = runBin(["-h"]);
    const named = runBin(["help"]);
    assert(help.code === 0 && dashH.code === 0 && named.code === 0, "help flags must exit 0");
    assert(help.output === dashH.output && help.output === named.output, "--help, -h, and help must print the same stdout");
    for (const heading of [
      "Prepare the kitchen — installation and workspaces",
      "Build and run a business — product work and lifecycle",
      "Review at the pass — evidence, verification, and authority",
      "Maintain and extend — catalog, providers, and composition",
    ]) {
      assert(help.output.includes(heading), `help must include heading: ${heading}`);
    }
    assert(help.output.includes("Business lifecycle (normal supported path)"), "help must distinguish the normal business path");
    assert(help.output.includes("not aliases of business-* commands"), "advanced session controls must not be described as business-* aliases");
    assert(help.output.includes("Supported equivalent of inspect"), "doctor must be annotated as the inspect equivalent");
    assert(help.output.includes("inspect runs the installation diagnostic"), "grouped help must prefer inspect as the diagnostic actor");
    assert(help.output.includes("b2c doctor is a supported equivalent"), "grouped help must keep doctor supported");
    assert(!help.output.includes("inspect and doctor run the same"), "grouped help must not treat inspect and doctor as equal diagnostic actors");
    assert(help.output.includes("sanitized local host observation"), "help must disclose the host observation write");
    assert(help.output.includes("command-specific --help flag"), "help must say inspect/doctor do not accept command-specific --help");
    assert(!help.output.includes("inspect --json"), "help must not advertise inspect --json");
    const addresses = [...help.output.matchAll(/^ {2,4}([a-z][a-z0-9-]*) {2,}/gm)].map((match) => match[1]!);
    assert(
      JSON.stringify(addresses) === JSON.stringify(listed),
      `help address rows must match HELP_SECTIONS order. got=${addresses.join(",")} expected=${listed.join(",")}`,
    );
    for (const line of help.output.split("\n")) {
      const overflowingToken = line.length > HELP_WRAP_COLUMNS && !line.slice(0, HELP_WRAP_COLUMNS + 1).includes(" ");
      assert(line.length <= HELP_WRAP_COLUMNS || overflowingToken, `help line must wrap at ${HELP_WRAP_COLUMNS} columns unless one token is longer: ${line}`);
    }
    for (const name of listed) {
      assert(help.output.includes(name), `help must keep the full command name ${name}`);
    }
    const bare = runBin([]);
    assert(bare.code === 1, `no arguments must exit 1, got ${bare.code}`);
    assert(bare.output.includes("Prepare the kitchen"), "bare invocation must still print grouped usage on stderr");
  });

  harness.check("cli: an unknown command is refused with usage, never silently swallowed", () => {
    const result = runBin(["deploy-to-prod"]);
    assert(result.code === 1, `unknown command must exit 1, got ${result.code}`);
    assert(result.output.includes('unknown command "deploy-to-prod"'), "refusal must name the command");
  });

  harness.check("cli: a subcommand execs the real underlying CLI and passes its exit code through", () => {
    // bootstrap dry-run against a throwaway copy of the reference business: exit 0 with the
    // dry-run plan — proof the dispatcher reaches kernel/session/bootstrap.ts for real.
    const workspace = path.join(harness.makeTempDir("cli-bootstrap"), "business");
    writeProductFixture(workspace, "CLI Fixture");
    const dryRun = runBin(["bootstrap", "--workspace", workspace]);
    assert(dryRun.code === 0, `bootstrap dry-run must exit 0, got ${dryRun.code}: ${dryRun.output.slice(-300)}`);
    assert(dryRun.output.includes("Dry run only"), "bootstrap dry-run output must come from the real CLI");
    // And the failure path: run.ts without required arguments exits 1, passed through untouched.
    const failing = runBin(["run"]);
    assert(failing.code === 1, `run without arguments must pass through exit 1, got ${failing.code}`);
    assert(failing.output.includes("session.missing_argument"), "the underlying CLI's own error must reach the caller");
  });

  harness.check("cli: bootstrap refuses an unaccepted product without writing", () => {
    const workspace = harness.makeTempDir("cli-bootstrap-no-state");
    const sentinel = path.join(workspace, "existing-source.txt");
    writeFileSync(sentinel, "keep me\n", "utf8");
    writeProductFixture(workspace, "Unready App", "hypothesis");
    const before = fileSnapshot(workspace);

    const result = runBin(["bootstrap", "--workspace", workspace, "--apply"]);

    assert(result.code === 1, `bootstrap without state must exit 1, got ${result.code}: ${result.output.slice(-300)}`);
    assert(result.output.includes("accepted_product_required"), "the refusal must explain the accepted product boundary");
    assert(JSON.stringify(fileSnapshot(workspace)) === JSON.stringify(before), "a rejected bootstrap must not add or alter workspace files");
    assert(readFileSync(sentinel, "utf8") === "keep me\n", "a rejected bootstrap must preserve existing source files");
    assert(!existsSync(path.join(workspace, "catalog.json")), "a rejected bootstrap must not install the catalog");
    assert(!existsSync(path.join(workspace, ".b2c-launch")), "a rejected bootstrap must not install the runtime binding");
    assert(!existsSync(path.join(workspace, "AGENTS.md")), "a rejected bootstrap must not install agent entrypoints");
  });

  harness.check("cli: bootstrap preflights unsupported state versions, malformed JSON, and control files before writing", () => {
    const managedTemplate = path.join(harness.makeTempDir("cli-bootstrap-managed-template"), "managed-template");
    mkdirSync(managedTemplate, { recursive: true });
    writeProductFixture(managedTemplate, "Managed Template");
    const seeded = runBin(["bootstrap", "--workspace", managedTemplate, "--apply", "--now", "2026-09-01T12:00:00.000Z"]);
    assert(seeded.code === 0, `managed preflight fixture must bootstrap, got ${seeded.code}: ${seeded.output.slice(-400)}`);

    const cases: Array<{ name: string; managed?: boolean; prepare: (workspace: string) => void; expected: string }> = [
      {
        name: "unsupported-state-version",
        managed: true,
        prepare: (workspace) => {
          const statePath = path.join(workspace, "state", "business-state.json");
          const state = JSON.parse(readFileSync(statePath, "utf8"));
          state.schemaVersion = "0.0.0";
          writeFileSync(statePath, JSON.stringify(state), "utf8");
        },
        expected: "business.initialization_incomplete",
      },
      {
        name: "malformed-state",
        managed: true,
        prepare: (workspace) => {
          writeFileSync(path.join(workspace, "state", "business-state.json"), "{ malformed json\n", "utf8");
        },
        expected: "business.initialization_incomplete",
      },
      {
        name: "malformed-control",
        managed: true,
        prepare: (workspace) => {
          writeFileSync(path.join(workspace, "control", "control.json"), "{ malformed json\n", "utf8");
        },
        expected: "business.initialization_incomplete",
      },
      {
        name: "mismatched-control",
        managed: true,
        prepare: (workspace) => {
          const controlPath = path.join(workspace, "control", "control.json");
          const control = JSON.parse(readFileSync(controlPath, "utf8")) as Record<string, unknown>;
          control.businessSlug = "different-product";
          writeFileSync(controlPath, `${JSON.stringify(control, null, 2)}\n`, "utf8");
        },
        expected: "business.initialization_incomplete",
      },
    ];

    for (const fixture of cases) {
      const workspace = fixture.managed
        ? path.join(harness.makeTempDir(`cli-bootstrap-${fixture.name}-parent`), fixture.name)
        : harness.makeTempDir(`cli-bootstrap-${fixture.name}`);
      if (fixture.managed) cpSync(managedTemplate, workspace, { recursive: true });
      writeFileSync(path.join(workspace, "sentinel.txt"), "preserve this\n", "utf8");
      fixture.prepare(workspace);
      const before = fileSnapshot(workspace);

      const result = runBin(["bootstrap", "--workspace", workspace, "--apply"]);

      assert(result.code === 1, `${fixture.name} must exit 1, got ${result.code}: ${result.output.slice(-400)}`);
      assert(result.output.includes(fixture.expected), `${fixture.name} must name the invalid input: ${result.output.slice(-400)}`);
      assert(JSON.stringify(fileSnapshot(workspace)) === JSON.stringify(before), `${fixture.name} must not add or alter files`);
      if (!fixture.managed) {
        assert(!existsSync(path.join(workspace, "catalog.json")), `${fixture.name} must not install catalog.json`);
        assert(!existsSync(path.join(workspace, ".b2c-launch")), `${fixture.name} must not install the runtime binding`);
        assert(!existsSync(path.join(workspace, "AGENTS.md")), `${fixture.name} must not install agent entrypoints`);
      }
    }
  });

  harness.check("cli: bootstrap preflights onboarding answers before writing", () => {
    for (const fixture of [
      { name: "malformed", contents: "{ malformed answers\n", expected: "not valid JSON" },
      {
        name: "wrong-slug",
        contents: `${JSON.stringify({
          schemaVersion: "1.0.0",
          businessSlug: "another-app",
          founderContact: { email: "founder@example.com" },
          units: {},
        })}\n`,
        expected: "answers name businessSlug",
      },
      {
        name: "invalid-waiver",
        contents: `${JSON.stringify({
          schemaVersion: "1.0.0",
          businessSlug: "answers-app",
          founderContact: { email: "founder@example.com" },
          units: {},
          waivers: [
            {
              domainId: "invalid-domain",
              actionClass: "spend",
              protectedCategory: "spend",
              scope: { resourcePattern: "*", description: "Spend only within the approved campaign." },
              caps: { maxPerAction: 10, maxPerPeriod: 50, currency: "USD" },
              budgetPeriod: "monthly",
              expiry: "2027-01-01T00:00:00.000Z",
              undoContract: {
                kind: "mitigation",
                irreversibilityAcknowledgment: "Delivered ad spend cannot be recovered.",
                mitigationSteps: ["Pause the campaign."],
              },
            },
          ],
        })}\n`,
        expected: "waivers are invalid",
      },
    ]) {
      const workspace = path.join(harness.makeTempDir(`cli-bootstrap-answers-${fixture.name}`), "answers-app");
      mkdirSync(workspace, { recursive: true });
      writeFileSync(path.join(workspace, "sentinel.txt"), "preserve this\n", "utf8");
      writeProductFixture(workspace, "Answers App");
      const answersPath = path.join(workspace, "answers.json");
      writeFileSync(answersPath, fixture.contents, "utf8");
      const before = fileSnapshot(workspace);

      const result = runBin(["bootstrap", "--workspace", workspace, "--answers", answersPath, "--apply"]);

      assert(result.code === 1, `${fixture.name} answers must exit 1, got ${result.code}: ${result.output.slice(-400)}`);
      assert(result.output.includes(fixture.expected), `${fixture.name} answers must be named: ${result.output.slice(-400)}`);
      assert(JSON.stringify(fileSnapshot(workspace)) === JSON.stringify(before), `${fixture.name} answers must not add or alter files`);
    }
  });

  harness.check("cli: an accepted product safely initializes the durable runtime in an existing app", () => {
    const workspace = path.join(harness.makeTempDir("cli-bootstrap-accepted-product"), "quiet-habit");
    mkdirSync(path.join(workspace, "src"), { recursive: true });
    const sentinel = path.join(workspace, "src", "app.ts");
    writeFileSync(sentinel, "export const existingApp = true;\n", "utf8");
    writeProductFixture(workspace, "Quiet Habit");
    const first = runBin(["bootstrap", "--workspace", workspace, "--apply", "--now", "2026-09-01T12:00:00.000Z"]);
    assert(first.code === 0, `accepted product bootstrap must exit 0, got ${first.code}: ${first.output.slice(-500)}`);
    assert(readFileSync(sentinel, "utf8") === "export const existingApp = true;\n", "bootstrap must preserve existing app source");

    const state = JSON.parse(readFileSync(path.join(workspace, "state", "business-state.json"), "utf8")) as {
      project: {
        name: string;
        slug: string;
        platforms: string[];
        bundleIds: { ios: string; android: string };
        publicUrls: { landing: string; privacy: string; terms: string };
      };
      lanes: Record<string, { status: string; evidence: string[] }>;
      founderGates: { pending: unknown[] };
      providers?: unknown;
    };
    assert(state.project.name === "Quiet Habit" && state.project.slug === "quiet-habit", "canonical product identity must initialize runtime identity");
    assert(state.project.platforms.length === 0, "bootstrap must defer platform selection");
    assert(
      Object.values(state.project.bundleIds).every((value) => value === ""),
      "bootstrap must not invent bundle IDs",
    );
    assert(
      Object.values(state.project.publicUrls).every((value) => value === ""),
      "bootstrap must not invent public URLs",
    );
    assert(state.providers === undefined, "bootstrap must not invent provider state");
    assert(state.founderGates.pending.length === 0, "bootstrap must not invent founder gates");
    assert(
      state.lanes.research?.status === "running" && state.lanes.research.evidence.length === 0,
      "accepted product bootstrap must leave research running without invented evidence",
    );
    assert(
      state.lanes.product?.status === "running" && state.lanes.product.evidence.includes("PRODUCT.md"),
      "accepted product bootstrap must make product the active lane",
    );
    assert(
      Object.entries(state.lanes).every(([key, lane]) => key === "research" || key === "product" || lane.status === "pending"),
      "every other lane must remain pending",
    );
    const control = JSON.parse(readFileSync(path.join(workspace, "control", "control.json"), "utf8")) as {
      businessSlug: string;
      grants: Record<string, unknown>;
      waivers: unknown[];
    };
    assert(control.businessSlug === "quiet-habit", "control must bind to the accepted product slug");
    assert(Object.keys(control.grants).length === 0 && control.waivers.length === 0, "control must start with no grants or waivers");
    const agents = readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
    assert(agents.includes("# Quiet Habit Agent Guide") && !agents.includes("{{APP_NAME}}"), "bootstrap must render the app name into agent guidance");

    const parked = runBin(["plan", "--workspace", workspace]);
    assert(parked.code === 0, `plan for an ungranted runtime must explain its parked state: ${parked.output.slice(-500)}`);
    assert(
      parked.output.includes("no work authority") && parked.output.includes("b2c onboard"),
      "an ungranted runtime must route directly to authority onboarding",
    );
    const briefPath = path.join(workspace, "brief.json");
    writeFileSync(
      briefPath,
      `${JSON.stringify({ schemaVersion: "1.0.0", businessSlug: "quiet-habit", founderContact: { email: "founder@example.com" } })}\n`,
      "utf8",
    );
    // An ungranted runtime is parked, not broken (README.md: omitting answers.json "install[s] a
    // parked runtime"). The session runs, advances whatever needs no grant, parks the rest, and
    // names the missing authority in founder language. It must not refuse: control.json cannot
    // distinguish "never onboarded" from an onboard whose `units` was empty (onboard.ts's
    // validateAnswersShape accepts `units: {}`), so a grants-empty refusal would eventually reject
    // a genuinely onboarded business -- and plan.ts and bootstrap.ts both treat zero grants as an
    // ordinary cold start and exit 0.
    const parkedRun = runBin(["run", "--workspace", workspace, "--brief", briefPath, "--session", "no-authority", "--executor", "fixture"]);
    assert(parkedRun.code === 0, `an ungranted run must park cleanly, got ${parkedRun.code}: ${parkedRun.output.slice(-500)}`);
    const parkedDigest = readFileSync(path.join(workspace, "digests", "no-authority.md"), "utf8");
    assert(
      parkedDigest.includes("You haven't told me how much I can do in this area yet."),
      `an ungranted run must name the missing authority in founder language: ${parkedDigest.slice(-500)}`,
    );

    const second = runBin(["bootstrap", "--workspace", workspace, "--apply", "--now", "2026-09-01T12:00:00.000Z"]);
    assert(second.code === 0, `accepted product bootstrap must be idempotent, got ${second.code}: ${second.output.slice(-500)}`);
    assert(readFileSync(sentinel, "utf8") === "export const existingApp = true;\n", "an idempotent re-run must preserve existing source");

    const answersPath = path.join(workspace, "answers.json");
    writeFileSync(
      answersPath,
      `${JSON.stringify({
        schemaVersion: "1.0.0",
        businessSlug: "quiet-habit",
        founderContact: { email: "founder@example.com" },
        units: { Product: { level: "full" } },
      })}\n`,
      "utf8",
    );
    const onboarded = runBin(["onboard", "--workspace", workspace, "--answers", answersPath, "--now", "2026-09-01T12:00:00.000Z"]);
    assert(onboarded.code === 0, `valid onboarding must grant work authority: ${onboarded.output.slice(-500)}`);
    const repinned = runBin(["bootstrap", "--workspace", workspace, "--apply", "--now", "2026-09-01T12:00:00.000Z"]);
    assert(repinned.code === 0, `bootstrap after onboarding must stay idempotent: ${repinned.output.slice(-500)}`);
    assert(
      repinned.output.includes("bootstrapped with work authority") && !repinned.output.includes("bootstrapped with no work authority"),
      "bootstrap must report preserved grants even when the re-run omits --answers",
    );
  });

  harness.check("cli: the workspace registry round-trips register, list, and remove under B2C_APP_BUILDER_HOME", () => {
    // The registry is the MCP server's entire allowlist (A2), so the full lifecycle is pinned
    // here: register -> visible in list -> remove -> gone, all inside a throwaway home so the
    // fixture never touches the maintainer's real ~/.b2c-app-builder.
    const temp = harness.makeTempDir("cli-workspaces");
    const env = { B2C_APP_BUILDER_HOME: path.join(temp, "b2c-home") };
    const workspace = path.join(temp, "business");
    writeProductFixture(workspace, "CLI Fixture");

    const registered = runBin(["workspaces", "register", "fixture-business", workspace], { env });
    assert(registered.code === 0, `register must exit 0, got ${registered.code}: ${registered.output.slice(-300)}`);
    const badId = runBin(["workspaces", "register", "Not_A_Slug", workspace], { env });
    assert(badId.code === 1, `a non-slug id must be refused, got exit ${badId.code}`);
    const listed = runBin(["workspaces", "list"], { env });
    assert(listed.code === 0 && listed.output.includes("fixture-business"), `list must show the registered id: ${listed.output.slice(-300)}`);
    const planning = runBin(["status", "--workspace", "fixture-business"], { env });
    assert(
      planning.code === 0 &&
        planning.output.includes("Planning workspace") &&
        planning.output.includes("research and review the hypothesis before business-initialize") &&
        planning.output.includes("strategy/RESEARCH.md: missing"),
      `status must resolve a registered planning workspace and report its research next step: ${planning.output.slice(-300)}`,
    );

    mkdirSync(path.join(workspace, "run"), { recursive: true });
    mkdirSync(path.join(workspace, "digests"), { recursive: true });
    writeFileSync(
      path.join(workspace, "run", "run-state.json"),
      JSON.stringify({
        runId: "fixture-run",
        updatedAt: "2026-08-31T12:00:00.000Z",
        nodes: { first: { status: "succeeded" }, second: { status: "succeeded" }, third: { status: "blocked" } },
      }),
    );
    writeFileSync(path.join(workspace, "digests", "fixture-session.md"), "# Founder digest\n\nOne decision remains.\n");

    const status = runBin(["status", "--workspace", "business"], { env, cwd: temp });
    assert(status.code === 0, `status by caller-relative path must exit 0, got ${status.code}: ${status.output.slice(-300)}`);
    for (const expected of ["Run fixture-run", "succeeded: 2, blocked: 1", "Latest digest (fixture-session.md):", "One decision remains."]) {
      assert(status.output.includes(expected), `status must render ${expected}: ${status.output.slice(-400)}`);
    }

    const statusJson = runBin(["status", "--workspace", "fixture-business", "--json"], { env });
    assert(statusJson.code === 0, `status --json must exit 0, got ${statusJson.code}: ${statusJson.output.slice(-300)}`);
    const parsedStatus = JSON.parse(statusJson.output.trim()) as { state?: string; run?: { counts?: Array<{ status?: string; count?: number }> } };
    assert(parsedStatus.state === "run", `status --json must return the structured run state: ${statusJson.output.slice(-300)}`);
    assert(
      parsedStatus.run?.counts?.some((entry) => entry.status === "succeeded" && entry.count === 2) === true,
      `status --json must return shared node counts: ${statusJson.output.slice(-300)}`,
    );

    const projected = runBin(["workspaces", "list"], { env });
    assert(projected.output.includes("2 succeeded, 1 blocked"), `workspace list must project the shared status read: ${projected.output.slice(-300)}`);
    const removed = runBin(["workspaces", "remove", "fixture-business"], { env });
    assert(removed.code === 0, `remove must exit 0, got ${removed.code}`);
    const emptied = runBin(["workspaces", "list"], { env });
    assert(emptied.code === 0 && !emptied.output.includes("fixture-business"), "a removed workspace must leave the list");
  });

  harness.check("cli: plan resolves the registered workspace ID advertised by the setup flow", () => {
    const temp = harness.makeTempDir("cli-plan-registered");
    const env = { B2C_APP_BUILDER_HOME: path.join(temp, "b2c-home") };
    const workspace = path.join(temp, "business");
    writeProductFixture(workspace, "CLI Fixture");

    const bootstrapped = runBin(["bootstrap", "--workspace", workspace, "--apply", "--now", "2026-08-31T12:00:00.000Z"], { env });
    assert(bootstrapped.code === 0, `bootstrap apply must exit 0, got ${bootstrapped.code}: ${bootstrapped.output.slice(-400)}`);
    mkdirSync(path.join(workspace, "src"), { recursive: true });
    writeFileSync(path.join(workspace, "src", "app.ts"), "export const appSource = true;\n", "utf8");
    const paths = resolveWorkspacePaths(workspace);
    const compatible = loadWorkspaceCatalog(workspace);
    assert(compatible.ok, "the bootstrapped workspace must load its pinned catalog");
    const businessState = loadBusinessStateFile(paths.state);
    assert(Boolean(businessState), "the bootstrapped workspace must have valid business state");
    const compiledPlan = compilePlan(compatible.catalog, "2026-08-31T12:00:00.000Z");
    const run = seedRunState(compiledPlan, businessState!, {
      ownerSessionId: "planner-fixture",
      ttlSeconds: 300,
      wallClockCapSeconds: 1,
      now: "2026-08-31T12:00:00.000Z",
    });
    const sourceNode = compiledPlan.nodes.find((node) => node.workflowId === "workflow.engineering.source-change-manifest");
    assert(Boolean(sourceNode), "the pinned graph must include app source ingestion");
    for (const nodeId of sourceNode!.dependencies) run.nodes[nodeId]!.status = "succeeded";
    for (const artifactId of sourceNode!.inputs) {
      const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId)!;
      if (binding.path === "run/app-source-fingerprint.sha256") continue;
      binding.accepted = true;
      binding.fingerprint = `sha256:${"a".repeat(64)}`;
      const producer = compiledPlan.nodes.find((node) => node.outputs.includes(artifactId));
      if (producer) {
        binding.producedBy = producer.id;
        run.nodes[producer.id]!.status = "succeeded";
      }
    }
    mkdirSync(path.dirname(paths.runState), { recursive: true });
    writeFileSync(paths.runState, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    const registered = runBin(["workspaces", "register", "fixture-business", workspace], { env });
    assert(registered.code === 0, `register must exit 0, got ${registered.code}: ${registered.output.slice(-300)}`);

    const beforePlan = fileSnapshot(workspace);
    const planned = runBin(["plan", "--workspace", "fixture-business", "--json"], { env });
    assert(planned.code === 0, `plan by registered ID must exit 0, got ${planned.code}: ${planned.output.slice(-400)}`);
    assert(planned.output.includes('"catalogVersion": "2.0.0+'), `plan must read the registered workspace's pinned catalog: ${planned.output.slice(-400)}`);
    assert(planned.output.includes('"readyBriefs"'), "plan must return the real bounded-work report");
    const report = JSON.parse(planned.output.trim()) as { held: Array<{ nodeId: string; reason: string }> };
    assert(
      report.held.some((node) => node.nodeId === "run.engineering.source-change-manifest" && node.reason === "autonomy"),
      "plan must ingest the first app-source fingerprint in memory so source-change work reaches the same autonomy gate as a real run",
    );
    assert(!existsSync(path.join(workspace, "run", "app-source-fingerprint.sha256")), "plan must not persist its in-memory source fingerprint");
    assert(JSON.stringify(fileSnapshot(workspace)) === JSON.stringify(beforePlan), "plan must not add or alter any workspace file");

    writeFileSync(path.join(env.B2C_APP_BUILDER_HOME, "workspaces.json"), "{ malformed registry");
    const direct = runBin(["plan", "--workspace", workspace, "--json"], { env });
    assert(direct.code === 0, `an existing direct path must remain usable when the unrelated registry is malformed: ${direct.output.slice(-400)}`);
  });

  harness.check("cli: doctor reports health and exits 0 with warnings allowed", () => {
    // A hermetic home: doctor must be runnable on a machine that has never run setup. Worker-CLI
    // absence is a WARNING by design (R12: sessions dispatch the owner's own agent CLIs), so the
    // exit code stays 0 wherever this fixture runs — including CI, which has no worker CLIs.
    const env = { B2C_APP_BUILDER_HOME: path.join(harness.makeTempDir("cli-doctor"), "b2c-home") };
    const doctor = runBin(["doctor"], { env });
    assert(doctor.code === 0, `doctor must exit 0 on a healthy install, got ${doctor.code}: ${doctor.output.slice(-400)}`);
    for (const code of ["doctor.node", "doctor.tsx", "doctor.catalog", "doctor.registry"]) {
      assert(doctor.output.includes(code), `doctor must report ${code}: ${doctor.output.slice(-400)}`);
    }
    assert(doctor.output.includes("doctor.asc"), `doctor must report a doctor.asc* finding: ${doctor.output.slice(-400)}`);
    assert(doctor.output.includes("doctor.revenuecat_cli"), `doctor must report a doctor.revenuecat_cli* finding: ${doctor.output.slice(-400)}`);
    assert(doctor.output.includes("doctor.eas_cli"), `doctor must report a doctor.eas_cli* finding: ${doctor.output.slice(-400)}`);
    assert(doctor.output.includes("doctor.expo_cli"), `doctor must report a doctor.expo_cli* finding: ${doctor.output.slice(-400)}`);
    assert(!doctor.output.includes("ERROR"), `a healthy repo checkout must produce no doctor errors: ${doctor.output.slice(-400)}`);
  });

  harness.check("cli: inspect matches doctor findings and exit status without becoming workspace inspection", () => {
    const env = { B2C_APP_BUILDER_HOME: path.join(harness.makeTempDir("cli-inspect"), "b2c-home") };
    const inspect = runBin(["inspect"], { env });
    const doctor = runBin(["doctor"], { env: { B2C_APP_BUILDER_HOME: path.join(harness.makeTempDir("cli-inspect-doctor"), "b2c-home") } });
    assert(inspect.code === 0, `inspect must exit 0 on a healthy install, got ${inspect.code}: ${inspect.output.slice(-400)}`);
    assert(inspect.code === doctor.code, "inspect and doctor must share exit status");
    const codes = (output: string): string[] => [...output.matchAll(/^[A-Z]+\s+(doctor\.[^\s]+)/gm)].map((match) => match[1]!).sort();
    assert(JSON.stringify(codes(inspect.output)) === JSON.stringify(codes(doctor.output)), "inspect and doctor must report the same finding codes");
    assert(inspect.output.includes("doctor.node"), "inspect must run the installation diagnostic, not workspace inspection");
    assert(!inspect.output.includes("productKind"), "inspect must not route to kernel/session/inspect.ts");
  });

  harness.check("cli: setup creates the b2c home and registry, idempotently", () => {
    const home = path.join(harness.makeTempDir("cli-setup"), "b2c-home");
    const env = { B2C_APP_BUILDER_HOME: home };
    const first = runBin(["setup"], { env });
    assert(first.code === 0, `setup must exit 0, got ${first.code}: ${first.output.slice(-400)}`);
    assert(existsSync(path.join(home, "workspaces.json")), "setup must create the empty registry");
    assert(first.output.includes("Next steps:"), "setup must print the consumer's next steps");
    const next = first.output.slice(Math.max(0, first.output.indexOf("Next steps:")));
    assert(next.includes("business-status"), "setup next steps omitted business-status");
    assert(next.includes("business-plan"), "setup next steps omitted business-plan");
    assert(next.indexOf("business-status") < next.indexOf("business-plan"), "setup next steps lost status before plan");
    assert(next.indexOf("business-plan") < next.indexOf("b2c catalog --json"), "setup still leads with catalog before plan");
    assert(
      !/first call is almost always b2c_catalog|first call is almost always b2c_knowledge_search/.test(first.output),
      "setup still tells Claude the first call is catalog/search",
    );
    assert(first.output.includes("b2c-app-builder-mcp.mjs"), "setup must print the MCP registration command with the real server path");
    // The three agent runtimes the engine dispatches are the three the machine owner will want
    // the MCP server registered with — setup prints each runtime's own config shape.
    for (const runtime of ["claude mcp add", "~/.cursor/mcp.json", "~/.codex/config.toml"]) {
      assert(first.output.includes(runtime), `setup must print the ${runtime} registration`);
    }
    const second = runBin(["setup"], { env });
    assert(second.code === 0 && !second.output.includes("CREATED"), "a second setup run must change nothing");
  });

  harness.check("cli: new scaffolds a fresh business where the CALLER stands, and update dry-runs", () => {
    const temp = harness.makeTempDir("cli-new");
    // Relative --dir must resolve against the invoking shell's directory (B2C_APP_BUILDER_CALLER_CWD),
    // not the package root — the exact bug a consumer would hit typing `b2c new` at home.
    const born = runBin(["new", "corner-bakery", "--dir", "corner-bakery", "--idea", "Help home bakers price custom orders"], { cwd: temp });
    assert(born.code === 0, `new must exit 0, got ${born.code}: ${born.output.slice(-400)}`);
    assert(born.output.includes("NEXT Research the hypothesis"), `new must return one research-first next action: ${born.output.slice(-300)}`);
    assert(existsSync(path.join(temp, "corner-bakery", "PRODUCT.md")), "new must scaffold where the caller stands, not inside the package");
    assert(existsSync(path.join(temp, "corner-bakery", ".cursor/rules/agents.mdc")), "new must copy the Cursor agent entrypoint");
    const design = readFileSync(path.join(temp, "corner-bakery", "DESIGN.md"), "utf8");
    assert(design.includes('name: "Corner Bakery"'), "new must stamp the authored root DESIGN.md with the app-specific name");
    const product = readFileSync(path.join(temp, "corner-bakery", "PRODUCT.md"), "utf8");
    assert(
      product.includes('name: "Corner Bakery"') && product.includes('slug: "corner-bakery"') && product.includes("Help home bakers price custom orders"),
      "new must preserve the provisional identity and idea in PRODUCT.md",
    );
    const agents = readFileSync(path.join(temp, "corner-bakery", "AGENTS.md"), "utf8");
    assert(
      agents.includes("# Corner Bakery Agent Guide") && !agents.includes("{{APP_NAME}}") && agents.includes("Before the runtime exists"),
      "new must render the app name and planning-only start in agent entrypoints",
    );
    const rendered = runBin(["render-product", "--workspace", "corner-bakery", "--check"], { cwd: temp });
    assert(rendered.code === 0, `render-product --check must pass on a freshly scaffolded workspace: ${rendered.output.slice(-300)}`);
    const rewritten = runBin(["render-product", "--workspace", path.join(temp, "corner-bakery")], { cwd: temp });
    assert(
      rewritten.code === 0 && rewritten.output.includes("WROTE"),
      `render-product must write PRODUCT.md for a workspace path: ${rewritten.output.slice(-300)}`,
    );
    const unknownFlag = runBin(["render-product", "--bogus"], { cwd: temp });
    assert(
      unknownFlag.code === 1 && unknownFlag.output.includes("render-product.unknown_argument"),
      "render-product must refuse an unknown flag before writing anything",
    );
    const missing = runBin(["render-product", "--workspace", "does-not-exist"], { cwd: temp });
    assert(missing.code !== 0, "render-product must fail for a workspace that does not exist");
    const files = filesUnder(path.join(temp, "corner-bakery"));
    // Eight files plus product.yaml: the entrypoints, PRODUCT.md, product.yaml, DESIGN.md, and all three research outputs as templates (#33).
    assert(files.length <= 9, `new must stay a small day-zero scaffold, got ${files.length} files: ${files.join(", ")}`);
    for (const required of [
      "PRODUCT.md",
      "product.yaml",
      "DESIGN.md",
      "strategy/OFFER_TEST.md",
      "strategy/RESEARCH.md",
      "strategy/SIGNAL_CORPUS.md" /* all three research outputs ship as templates (#33) */,
      "AGENTS.md",
      "CLAUDE.md",
      ".cursor/rules/agents.mdc",
    ]) {
      assert(files.includes(required), `new must include ${required}`);
    }
    for (const absent of [
      "operations/metric-contracts.json" /* optional template; ADR-0001 installs it only when a recipe selects it */,
      "state/unsupported.yaml",
      "studio/seed/business.json",
      "design/design-room.html",
      "engineering/TECH_SPEC.md",
      "store/APP_STORE.md",
      "catalog.json",
    ]) {
      assert(!files.includes(absent), `new must not materialize later workflow output ${absent}`);
    }

    const noIdea = runBin(["new", "idea-search", "--dir", "idea-search"], { cwd: temp });
    assert(noIdea.code === 0 && noIdea.output.includes("Research viable opportunities"), "new without --idea must expose the delegated idea-search path");
    assert(
      readFileSync(path.join(temp, "idea-search", "PRODUCT.md"), "utf8").includes("No idea supplied"),
      "the idea-search workspace must keep product selection provisional",
    );

    const quoted = runBin(["new", "quoted-app", "--dir", "quoted-app", "--name", 'My "App"', "--idea", "A quoted product"], { cwd: temp });
    assert(quoted.code === 0, `a quoted display name must remain valid, got ${quoted.code}: ${quoted.output.slice(-300)}`);
    assert(readFileSync(path.join(temp, "quoted-app", "PRODUCT.md"), "utf8").includes('name: "My \\"App\\""'), "new must YAML-escape a quoted display name");

    const missingDirValue = runBin(["new", "missing-dir", "--dir"], { cwd: temp });
    assert(missingDirValue.code === 1 && missingDirValue.output.includes("new.missing_value"), "new must refuse a missing flag value before writing");
    assert(!existsSync(path.join(temp, "missing-dir")), "a missing flag value must not create a workspace");
    const badSlug = runBin(["new", "Corner_Bakery"], { cwd: temp });
    assert(badSlug.code === 1, `a non-slug name must be refused, got exit ${badSlug.code}`);

    // `update` is honest about where it runs: a git checkout dry-runs; an installed runtime
    // (the synced ~/.agents copy has no .git anywhere above it) refuses by name. Both are the
    // command working — the fixture asserts whichever contract applies to THIS install.
    const update = runBin(["update"]);
    if (gitCheckoutAbove(skillRoot)) {
      assert(update.code === 0, `update dry-run must exit 0 in a checkout, got ${update.code}: ${update.output.slice(-300)}`);
      assert(update.output.includes("Engine version:") && update.output.includes("Dry run only"), "update dry-run must report the version and stop");
    } else {
      assert(update.code === 1, `update outside a checkout must exit 1, got ${update.code}: ${update.output.slice(-300)}`);
      assert(update.output.includes("update.not_a_checkout"), "an installed runtime must refuse self-update by name with the tag-pinning guidance");
    }
  });

  harness.check(
    "cli: proof auto-selects a rung, runs the fixture adapter, and writes a structured artifact — a passing script, a named failing step, and an unset-up workspace all surface correctly",
    () => {
      const temp = harness.makeTempDir("cli-proof");
      const workspace = path.join(temp, "business");
      writeProductFixture(workspace, "CLI Proof Fixture");
      const bootstrapped = runBin(["bootstrap", "--workspace", workspace, "--apply", "--now", "2026-09-01T12:00:00.000Z"]);
      assert(bootstrapped.code === 0, `bootstrap must exit 0 to seed a valid business-state.json: ${bootstrapped.output.slice(-500)}`);

      // The device test declares its target explicitly; initialization does not choose a platform.
      const proofStatePath = path.join(workspace, "state", "business-state.json");
      const proofState = JSON.parse(readFileSync(proofStatePath, "utf8"));
      proofState.project.platforms = ["ios"];
      writeFileSync(proofStatePath, `${JSON.stringify(proofState, null, 2)}\n`);

      // B2C_DEVICE_PROOF_ADAPTER=fixture mirrors run.ts's own --executor fixture idiom: it forces
      // a deterministic, always-available probe and swaps in the scripted fixture adapter, so this
      // scenario never depends on this test machine's own Xcode/mobai install.
      const passing = runBin(["proof", "--workspace", workspace, "--platform", "ios", "--flow", "onboarding", "--json"], {
        env: { B2C_DEVICE_PROOF_ADAPTER: "fixture" },
      });
      assert(passing.code === 0, `a scripted all-passing flow must exit 0, got ${passing.code}: ${passing.output.slice(-500)}`);
      const artifact = JSON.parse(passing.output.trim()) as {
        rung: string;
        platform: string;
        target: string;
        flow: string;
        verificationScope: string;
        steps: Array<{ name: string; ok: boolean }>;
        verdict: string;
        failingStep?: string;
        artifactPath: string;
      };
      assert(
        artifact.rung === "rung-2-xcodebuild",
        `the device fixture declares iOS, so a fixture-probe run must select rung-2-xcodebuild, got ${artifact.rung}`,
      );
      assert(
        artifact.platform === "ios" && artifact.target === "ios-simulator" && artifact.verificationScope === "adapter-actions-only",
        `the artifact must name its exact bounded target and scope, got ${JSON.stringify(artifact)}`,
      );
      assert(
        artifact.verdict === "passed" && artifact.failingStep === undefined,
        `an all-ok script must verdict passed with no failingStep, got ${JSON.stringify(artifact)}`,
      );
      assert(artifact.flow === "onboarding", `the artifact must record the requested flow, got ${artifact.flow}`);
      assert(existsSync(artifact.artifactPath), `the artifact file itself must exist on disk at ${artifact.artifactPath}`);
      const onDisk = JSON.parse(readFileSync(artifact.artifactPath, "utf8")) as { verdict: string };
      assert(onDisk.verdict === "passed", "the on-disk artifact must match the printed one");
      assert(
        path.dirname(artifact.artifactPath) === path.join(workspace, "proof", "ios-simulator"),
        `the artifact must live under proof/ios-simulator/, got ${artifact.artifactPath}`,
      );

      const unsafeFlow = runBin(["proof", "--workspace", workspace, "--platform", "ios", "--flow", "../outside"], {
        env: { B2C_DEVICE_PROOF_ADAPTER: "fixture" },
      });
      assert(unsafeFlow.code === 1 && unsafeFlow.output.includes("proof.invalid_flow"), "a flow label must not escape its target proof lane");

      const statePath = path.join(workspace, "state", "business-state.json");
      const mixedState = JSON.parse(readFileSync(statePath, "utf8")) as { project: { platforms: string[] } };
      mixedState.project.platforms = ["ios", "android"];
      writeFileSync(statePath, `${JSON.stringify(mixedState, null, 2)}\n`);
      const mixedUnselected = runBin(["proof", "--workspace", workspace, "--json"], { env: { B2C_DEVICE_PROOF_ADAPTER: "fixture" } });
      assert(
        mixedUnselected.code === 1 && mixedUnselected.output.includes("--platform ios") && mixedUnselected.output.includes("--platform android"),
        `mixed proof must require one exact target before adapter work: ${mixedUnselected.output.slice(-400)}`,
      );
      const mixedIos = runBin(["proof", "--workspace", workspace, "--platform", "ios", "--json"], {
        env: { B2C_DEVICE_PROOF_ADAPTER: "fixture" },
      });
      const mixedAndroid = runBin(["proof", "--workspace", workspace, "--platform", "android", "--json"], {
        env: { B2C_DEVICE_PROOF_ADAPTER: "fixture" },
      });
      const mixedIosArtifact = JSON.parse(mixedIos.output.trim()) as { rung: string; platform: string };
      const mixedAndroidArtifact = JSON.parse(mixedAndroid.output.trim()) as { rung: string; platform: string };
      assert(
        mixedIos.code === 0 && mixedIosArtifact.rung === "rung-2-xcodebuild" && mixedIosArtifact.platform === "ios",
        "mixed iOS branch must remain independent",
      );
      assert(
        mixedAndroid.code === 0 && mixedAndroidArtifact.rung === "rung-4-mobai" && mixedAndroidArtifact.platform === "android",
        "mixed Android branch must remain independent",
      );

      const failingSteps = JSON.stringify([
        { name: "boot_simulator", ok: true },
        { name: "build", ok: false, error: "fixture: scripted compile failure" },
      ]);
      const failing = runBin(["proof", "--workspace", workspace, "--platform", "ios", "--flow", "onboarding"], {
        env: { B2C_DEVICE_PROOF_ADAPTER: "fixture", B2C_DEVICE_PROOF_FIXTURE_STEPS: failingSteps },
      });
      assert(failing.code === 1, `a scripted failing step must exit 1, got ${failing.code}: ${failing.output.slice(-500)}`);
      assert(failing.output.includes("Failing step: build"), `a failure must name the exact failing step, got: ${failing.output.slice(-400)}`);
      assert(
        failing.output.includes("fixture: scripted compile failure"),
        `a failure must surface the step's own error text, got: ${failing.output.slice(-400)}`,
      );

      const noWorkspace = runBin(["proof", "--workspace", path.join(temp, "not-a-workspace")]);
      assert(
        noWorkspace.code === 1 && noWorkspace.output.includes("proof.workspace_not_ready"),
        `an unset-up workspace must be refused by name, got ${noWorkspace.code}: ${noWorkspace.output.slice(-300)}`,
      );
    },
  );
}

/** Mirrors update.ts's own detection: any .git (dir or worktree file) on the path above. */
function gitCheckoutAbove(start: string): boolean {
  let current = start;
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}
