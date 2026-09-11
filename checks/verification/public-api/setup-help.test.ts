import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

for (const flag of ["--help", "-h"]) {
  test(`setup ${flag} shows usage without registry writes or worker probes`, () => {
    const temp = mkdtempSync(path.join(tmpdir(), "b2c-setup-help-"));
    const home = path.join(temp, "builder-home");
    const probes = path.join(temp, "probes.txt");
    const preload = path.join(temp, "record-probes.cjs");
    // Prevent accidental calls to the host's real worker CLIs if help regresses.
    writeFileSync(
      preload,
      `
const childProcess = require("node:child_process");
const original = childProcess.spawnSync;
childProcess.spawnSync = function(command, args, options) {
  if (["codex", "claude", "cursor-agent"].includes(command)) {
    require("node:fs").appendFileSync(${JSON.stringify(probes)}, command + "\\n");
    return { status: 0, stdout: "", stderr: "" };
  }
  return original.call(this, command, args, options);
};
require("node:module").syncBuiltinESMExports();
`,
    );
    try {
      const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "setup", flag], {
        cwd: temp,
        env: { ...process.env, B2C_APP_BUILDER_HOME: home, NODE_OPTIONS: `--require=${preload}` },
        encoding: "utf8",
        timeout: 30_000,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Usage: b2c setup/);
      assert.match(result.stdout, /without creating files or running health checks/);
      assert.match(result.stdout, /run inspect health checks/);
      assert.match(result.stdout, /b2c doctor is a supported equivalent/);
      assert.doesNotMatch(result.stdout, /run doctor health checks/);
      assert.doesNotMatch(result.stdout, /CREATED|doctor\.|Next steps:/);
      assert.equal(existsSync(home), false, "help must not create the builder home or registry");
      assert.equal(existsSync(probes), false, "help must not probe worker CLIs");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
}

function assertSetupLeadsWithStatusBeforeCatalog(stdout: string): void {
  const next = stdout.slice(Math.max(0, stdout.indexOf("Next steps:")));
  const createAt = next.indexOf("business-create");
  const statusAt = next.indexOf("business-status");
  const planAt = next.indexOf("business-plan");
  const catalogAt = next.indexOf("b2c catalog --json");
  const composeAt = next.indexOf("b2c compose");
  assert(createAt >= 0, "setup next steps omitted business-create");
  assert(statusAt >= 0, "setup next steps omitted business-status");
  assert(planAt >= 0, "setup next steps omitted business-plan");
  assert(statusAt > createAt && planAt > statusAt, "setup next steps must name create, then status, then plan");
  assert(catalogAt > planAt, "setup still leads with catalog before plan or omitted catalog");
  assert(composeAt > planAt, "setup still leads with compose before plan or omitted compose");
  assert.doesNotMatch(stdout, /first call is almost always b2c_catalog|first call is almost always b2c_knowledge_search/);
}

test("setup next steps name status and plan before catalog or compose", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "b2c-setup-ordinary-"));
  const home = path.join(temp, "builder-home");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "setup"], {
      cwd: temp,
      env: { ...process.env, B2C_APP_BUILDER_HOME: home },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assertSetupLeadsWithStatusBeforeCatalog(result.stdout);
    assert.match(result.stdout, /claude mcp add --scope user b2c-local/);
    assert.match(result.stdout, /\[mcp_servers\.b2c-local\]/);
    assert.match(result.stdout, /"b2c-local": \{ "command"/);
    assert.match(result.stdout, /Setup never edits Claude, Cursor, or Codex files/);
    assert.match(result.stdout, /Provider readiness is not implied by this receipt/);
    assert.doesNotMatch(result.stdout, /claude mcp add --scope user b2c-app-builder(?:\s|$)/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
