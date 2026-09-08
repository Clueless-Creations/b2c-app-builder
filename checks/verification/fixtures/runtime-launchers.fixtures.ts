import { cpSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function fixturePackage(h: Harness, name: string, dependency: boolean): string {
  const prefix = h.makeTempDir(name);
  const root = path.join(prefix, "node_modules", "b2c-app-builder");
  for (const dir of ["entrypoints/cli", "entrypoints/mcp", "tooling/lib"]) mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of ["entrypoints/cli/b2c.mjs", "entrypoints/mcp/b2c-app-builder-mcp.mjs", "tooling/lib/tsx-launcher.mjs"]) {
    cpSync(path.join(skillRoot, file), path.join(root, file));
  }
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "b2c-app-builder", type: "module" }));
  if (dependency) {
    const require = createRequire(path.join(skillRoot, "package.json"));
    symlinkSync(path.dirname(require.resolve("tsx/package.json")), path.join(prefix, "node_modules", "tsx"), "dir");
  }
  return root;
}

export function register(h: Harness): void {
  h.check("runtime-launchers: CLI uses hoisted dependency and selected Node from unrelated cwd without global tsx", () => {
    const root = fixturePackage(h, "launcher-hoisted-cli", true);
    const cwd = h.makeTempDir("launcher-unrelated-cwd");
    writeFileSync(
      path.join(root, "entrypoints/cli/business.ts"),
      "console.log(JSON.stringify({ node: process.execPath, cwd: process.cwd(), caller: process.env.B2C_APP_BUILDER_CALLER_CWD, args: process.argv.slice(2) }));",
    );
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "business-status", "--workspace", "example"], {
      cwd,
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });
    assert(result.status === 0, `hoisted CLI launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout);
    assert(
      observed.node === process.execPath && observed.cwd === realpathSync(root) && observed.caller === realpathSync(cwd),
      "Node or caller context changed",
    );
    assert(observed.args.join(" ") === "business-status --workspace example", "CLI arguments changed");
    assert(resolveTsxBin(root).endsWith("/tsx/dist/cli.mjs"), "deeper subprocess resolver misses hoisted dependency");
  });
  h.check("runtime-launchers: MCP preserves stdio through the hoisted dependency with no global tsx", () => {
    const root = fixturePackage(h, "launcher-hoisted-mcp", true);
    writeFileSync(path.join(root, "entrypoints/mcp/server.ts"), "process.stdin.pipe(process.stdout);");
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/mcp/b2c-app-builder-mcp.mjs")], {
      cwd: h.makeTempDir("launcher-mcp-cwd"),
      env: { ...process.env, PATH: "" },
      input: '{"probe":"stdio"}\n',
      encoding: "utf8",
    });
    assert(result.status === 0 && result.stdout === '{"probe":"stdio"}\n', `MCP stdio changed: ${result.stderr}`);
  });
  h.check("runtime-launchers: missing dependency diagnoses installation, while script exit preserves its code", () => {
    const missing = fixturePackage(h, "launcher-missing-dependency", false);
    const result = spawnSync(process.execPath, [path.join(missing, "entrypoints/cli/b2c.mjs"), "business-status"], {
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });
    assert(result.status === 1 && result.stderr.includes("b2c.runtime_dependency_missing"), "missing dependency silently failed");
    const installed = fixturePackage(h, "launcher-script-exit", true);
    writeFileSync(path.join(installed, "entrypoints/cli/business.ts"), 'console.error("script refusal"); process.exit(7);');
    const refused = spawnSync(process.execPath, [path.join(installed, "entrypoints/cli/b2c.mjs"), "business-status"], {
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });
    assert(
      refused.status === 7 && refused.stderr.includes("script refusal") && !refused.stderr.includes("dependency_missing"),
      "script refusal mislabeled as installation failure",
    );
  });
}
