import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import {
  DIRECT_MANDATE_MAX_CHARS,
  FOUNDER_BRIEF_ARTIFACT,
  FOUNDER_BRIEF_MAX_BYTES,
  FOUNDER_CONSTRAINT_SLICE_MAX,
  LAUNCH_PROGRAM_ARTIFACT,
} from "../../../contracts/public-api/contract.js";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { loadProductInstanceDocument, productYamlPath } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
import { loadWorkspaceCatalog } from "../../../kernel/session/catalog-contract.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { composeNodeBrief } from "../../../kernel/engine/node-brief.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = path.join(root, "entrypoints/cli/b2c.mjs");
const MARKER = "KEEP-NOTIFICATION-COVERAGE-AND-PERFORMANCE-BUDGET";
const AFTER_CREDITS_CHARS = 35477;

function afterCreditsSizedBrief(): string {
  const header = `# After Credits fixture\n\n${MARKER}\nUnicode: café 日本語.\nQuotes: "don't" 'do'.\nShell: $HOME \`uname\` && true | cat; URL: https://example.invalid/brief?x=1&y=2\n\n`;
  const pad = "Constraint: keep spoiler gating, weekly digest, and selected-app facts. ";
  return header + pad.repeat(Math.ceil((AFTER_CREDITS_CHARS - header.length) / pad.length));
}

function setup() {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-founder-brief-"));
  const home = path.join(temp, "registry");
  mkdirSync(home);
  return { temp, home, directory: path.join(temp, "app") };
}

function withHome<T>(home: string, fn: () => T): T {
  const prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = home;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
  }
}

function createCli(env: { home: string; directory: string }, extra: string[]) {
  return spawnSync(
    process.execPath,
    [
      cli,
      "business-create",
      "--workspace",
      "app",
      "--directory",
      env.directory,
      "--name",
      "After Credits",
      "--hypothesis",
      "A recap companion",
      ...extra,
      "--json",
    ],
    { cwd: root, encoding: "utf8", timeout: 30_000, env: { ...process.env, B2C_APP_BUILDER_HOME: env.home } },
  );
}

function parseResult(stdout: string) {
  return JSON.parse(stdout);
}

function registrySnapshot(home: string) {
  const file = path.join(home, "workspaces.json");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

test("short --mandate remains compatible and records provenance without rewriting the source", () => {
  const env = setup();
  try {
    const mandate = "  Keep the selected-app constraint.\n";
    const created = withHome(env.home, () =>
      callPublicOperation("business.create", {
        workspaceId: "app",
        directory: env.directory,
        name: "Useful Habit",
        hypothesis: "A specific repeated consumer need",
        mandate,
      }),
    );
    assert(created.ok, JSON.stringify(created));
    assert.equal(readFileSync(path.join(env.directory, FOUNDER_BRIEF_ARTIFACT), "utf8"), mandate);
    assert.equal(created.data.sourceIntent.characterCount, mandate.length);
    assert.equal(created.data.sourceIntent.derivedViewEmbedsSource, false);
    const launch = readFileSync(path.join(env.directory, LAUNCH_PROGRAM_ARTIFACT), "utf8");
    assert(launch.includes("Keep the selected-app constraint"), "derived launch program must carry the short constraint");
    assert(launch.includes(FOUNDER_BRIEF_ARTIFACT));
    assert(launch.includes(created.data.sourceIntent.digest));
    const plan = withHome(env.home, () => callPublicOperation("business.plan", { workspaceId: "app" }));
    assert(plan.ok, JSON.stringify(plan));
    assert.equal(plan.data.status, "not_initialized");
    assert(plan.data.nextAction.includes(FOUNDER_BRIEF_ARTIFACT));
    assert(plan.data.resume, "planning resume missing after creation");
    assert(plan.data.founderIntent, "plan founderIntent missing after creation");
    assert(plan.data.resume.artifacts.some((entry: { path: string; present: boolean }) => entry.path === FOUNDER_BRIEF_ARTIFACT && entry.present));
    assert.equal(plan.data.founderIntent.artifact, FOUNDER_BRIEF_ARTIFACT);
    assert(plan.data.founderIntent.slice.includes("Keep the selected-app constraint"));
    assert.equal(plan.data.founderIntent.truncated, false);
    assert(created.data.sourceIntent.digest.startsWith("sha256:"));
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("direct mandate over 8000 characters names the constraint and file-backed recovery with no mutation", () => {
  const env = setup();
  try {
    const mandate = "x".repeat(AFTER_CREDITS_CHARS);
    const before = registrySnapshot(env.home);
    const refused = withHome(env.home, () =>
      callPublicOperation("business.create", {
        workspaceId: "app",
        directory: env.directory,
        name: "After Credits",
        hypothesis: "A recap companion",
        mandate,
      }),
    );
    assert.equal(refused.ok, false);
    assert.equal(refused.error.code, "INVALID_INPUT");
    assert.deepEqual(refused.error.fields, ["mandate"]);
    assert.equal(refused.error.message, `mandate is ${AFTER_CREDITS_CHARS} characters; direct input supports ${DIRECT_MANDATE_MAX_CHARS}. No state changed.`);
    assert(refused.error.recovery.includes("--mandate-file"));
    assert(!refused.error.message.includes(mandate.slice(0, 32)));
    assert(!existsSync(env.directory));
    assert.equal(registrySnapshot(env.home), before);
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("After Credits-sized founder brief through --mandate-file is preserved exactly", () => {
  const env = setup();
  try {
    const brief = afterCreditsSizedBrief().slice(0, AFTER_CREDITS_CHARS);
    assert.equal(brief.length, AFTER_CREDITS_CHARS);
    assert(brief.includes(MARKER));
    const file = path.join(env.temp, "brief.md");
    writeFileSync(file, brief);
    const result = createCli(env, ["--mandate-file", file]);
    const parsed = parseResult(result.stdout);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(parsed.ok, true);
    const stored = readFileSync(path.join(env.directory, FOUNDER_BRIEF_ARTIFACT));
    assert.deepEqual(stored, readFileSync(file));
    assert.equal(parsed.data.sourceIntent.characterCount, AFTER_CREDITS_CHARS);
    assert.equal(parsed.data.sourceIntent.derivedViewEmbedsSource, false);
    const launch = readFileSync(path.join(env.directory, LAUNCH_PROGRAM_ARTIFACT), "utf8");
    assert(launch.includes(MARKER), "bounded launch-program slice must carry the header constraint");
    assert(launch.includes(FOUNDER_BRIEF_ARTIFACT));
    assert(launch.includes(parsed.data.sourceIntent.digest));
    assert(launch.length < AFTER_CREDITS_CHARS, "launch program must not dump the full founder brief");
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("mandate-file preserves Unicode, quotes, markdown, URLs, and shell metacharacters", () => {
  const env = setup();
  try {
    const brief = 'Keep "quotes", café, `ticks`, $HOME, &&, |, and https://example.invalid/a?q=1.\n';
    const file = path.join(env.temp, "brief.md");
    writeFileSync(file, brief);
    const parsed = parseResult(createCli(env, ["--mandate-file", file]).stdout);
    assert.equal(parsed.ok, true);
    assert.equal(readFileSync(path.join(env.directory, FOUNDER_BRIEF_ARTIFACT), "utf8"), brief);
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("missing, empty, oversized, and conflicting mandate inputs refuse before mutation", () => {
  const env = setup();
  try {
    const before = registrySnapshot(env.home);
    const missing = parseResult(createCli(env, ["--mandate-file", path.join(env.temp, "absent.md")]).stdout);
    assert.equal(missing.ok, false);
    assert.equal(missing.error.code, "INVALID_INPUT");
    assert.deepEqual(missing.error.fields, ["mandateFile"]);
    assert(missing.error.message.includes("missing or unreadable"));
    assert(!JSON.stringify(missing).includes(env.temp));

    const emptyFile = path.join(env.temp, "empty.md");
    writeFileSync(emptyFile, "");
    const empty = parseResult(createCli(env, ["--mandate-file", emptyFile]).stdout);
    assert.equal(empty.ok, false);
    assert.deepEqual(empty.error.fields, ["mandateFile"]);

    const huge = path.join(env.temp, "huge.md");
    writeFileSync(huge, Buffer.alloc(FOUNDER_BRIEF_MAX_BYTES + 1, 0x61));
    const oversized = parseResult(createCli(env, ["--mandate-file", huge]).stdout);
    assert.equal(oversized.ok, false);
    assert.equal(oversized.error.fields[0], "mandateFile");
    assert(oversized.error.message.includes(String(FOUNDER_BRIEF_MAX_BYTES + 1)));
    assert(oversized.error.message.includes(String(FOUNDER_BRIEF_MAX_BYTES)));

    const both = parseResult(createCli(env, ["--mandate", "short", "--mandate-file", emptyFile]).stdout);
    assert.equal(both.ok, false);
    assert.deepEqual(both.error.fields, ["mandate", "mandateFile"]);
    assert(both.error.message.includes("both supplied"));

    const link = path.join(env.temp, "link.md");
    writeFileSync(path.join(env.temp, "target.md"), "secret-brief");
    symlinkSync(path.join(env.temp, "target.md"), link);
    const linked = parseResult(createCli(env, ["--mandate-file", link]).stdout);
    assert.equal(linked.ok, false);
    assert.deepEqual(linked.error.fields, ["mandateFile"]);

    assert(!existsSync(env.directory) || readdirSync(env.directory).length === 0);
    assert.equal(registrySnapshot(env.home), before);
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});

test("file-backed creation projects a bounded constraint slice onto launch-program, plan, and NodeBrief", () => {
  const env = setup();
  try {
    const brief = afterCreditsSizedBrief().slice(0, AFTER_CREDITS_CHARS);
    const file = path.join(env.temp, "brief.md");
    writeFileSync(file, brief);
    assert.equal(parseResult(createCli(env, ["--mandate-file", file]).stdout).ok, true);
    withHome(env.home, () => {
      const product = productYamlPath(env.directory);
      const doc = parse(readFileSync(product, "utf8"));
      doc.meta.status = "accepted";
      writeFileSync(product, stringify(doc));
      writeFileSync(path.join(env.directory, "PRODUCT.md"), renderProductMarkdown(loadProductInstanceDocument(product)));
      const initialized = callPublicOperation("business.initialize", { workspaceId: "app", expectedRevision: workspaceRevision(env.directory) });
      assert(initialized.ok, JSON.stringify(initialized));
      const plan = callPublicOperation("business.plan", { workspaceId: "app" });
      assert(plan.ok, JSON.stringify(plan));
      assert(plan.data.founderIntent, "plan founderIntent missing after initialize");
      assert.equal(plan.data.founderIntent.artifact, FOUNDER_BRIEF_ARTIFACT);
      assert(plan.data.founderIntent.slice.includes(MARKER), "plan founderIntent must carry the header constraint");
      assert.equal(plan.data.founderIntent.truncated, true);
      assert.equal(plan.data.founderIntent.characterCount, AFTER_CREDITS_CHARS);
      assert(plan.data.founderIntent.slice.length <= FOUNDER_CONSTRAINT_SLICE_MAX);
      const encoded = JSON.stringify(plan.data);
      assert(!encoded.includes(brief), "plan JSON must not dump the entire founder source");
      const loaded = loadWorkspaceCatalog(env.directory);
      assert(loaded.ok, "initialized catalog must load");
      const compiled = compilePlan(loaded.catalog);
      const node = compiled.nodes.find((entry) => entry.workflowId === "workflow.orchestration.full-launch-program");
      assert(node, "full-launch-program node missing from compiled catalog");
      assert(node.reads, "full-launch-program reads missing");
      assert(node.instructions, "full-launch-program instructions missing");
      assert(node.reads.includes(FOUNDER_BRIEF_ARTIFACT), "catalog workflow must read the canonical brief");
      assert(node.instructions.includes(FOUNDER_BRIEF_ARTIFACT));
      assert(node.instructions.includes("canonical founder brief"));
      assert(node.instructions.includes("only mandate owner"));
      const nodeBrief = composeNodeBrief(node, compiled);
      assert(nodeBrief.open.includes(FOUNDER_BRIEF_ARTIFACT), "NodeBrief must open the canonical brief");
      const publicProgram = [...plan.data.ready, ...plan.data.held].find(
        (entry: { workflowId: string }) => entry.workflowId === "workflow.orchestration.full-launch-program",
      );
      if (publicProgram?.brief) {
        assert(publicProgram.brief.open.includes(FOUNDER_BRIEF_ARTIFACT));
        assert(publicProgram.brief.founderIntent?.slice.includes(MARKER));
      }
      assert.equal(readFileSync(path.join(env.directory, FOUNDER_BRIEF_ARTIFACT), "utf8"), brief);
    });
  } finally {
    rmSync(env.temp, { recursive: true, force: true });
  }
});
