import { cpSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { resolveRuntimeCommand, resolveTsxCommand } from "../../../tooling/lib/tsx-bin.js";
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
    const command = resolveTsxCommand(root, [path.join(root, "entrypoints/cli/business.ts"), "probe"]);
    assert(
      command.executable === process.execPath && command.args[0]!.endsWith("/tsx/dist/cli.mjs"),
      "resolved JavaScript would be executed directly on Windows",
    );
    const deeper = spawnSync(command.executable, command.args, { cwd, env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(deeper.status === 0 && JSON.parse(deeper.stdout).args[0] === "probe", "deeper subprocess invocation failed");
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
  h.check("runtime-launchers: compiled dist wins over tsx and does not need the tsx dependency", () => {
    const root = fixturePackage(h, "launcher-compiled-dist", false);
    mkdirSync(path.join(root, "dist", "entrypoints", "cli"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "entrypoints", "cli", "business.js"),
      "console.log(JSON.stringify({ node: process.execPath, cwd: process.cwd(), compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(path.join(root, "entrypoints/cli/business.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const result = spawnSync(process.execPath, [path.join(root, "entrypoints/cli/b2c.mjs"), "business-status", "--workspace", "example"], {
      cwd: h.makeTempDir("launcher-compiled-cwd"),
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });
    assert(result.status === 0, `compiled CLI launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true, "launcher must exec dist/ when it exists");
    assert(observed.args?.join(" ") === "business-status --workspace example", "compiled CLI arguments changed");
  });
  h.check("runtime-launchers: packed onboard spawn prefers compiled dist without tsx", () => {
    const root = fixturePackage(h, "launcher-compiled-onboard", false);
    mkdirSync(path.join(root, "kernel", "session"), { recursive: true });
    mkdirSync(path.join(root, "dist", "kernel", "session"), { recursive: true });
    writeFileSync(
      path.join(root, "dist", "kernel", "session", "onboard.js"),
      "console.log(JSON.stringify({ compiled: true, args: process.argv.slice(2) }));",
    );
    writeFileSync(path.join(root, "kernel/session/onboard.ts"), 'console.error("source ts fallback should not run"); process.exit(9);');
    const command = resolveRuntimeCommand(root, [path.join(root, "kernel/session/onboard.ts"), "--workspace", "example"]);
    assert(
      command.executable === process.execPath && command.args[0] === path.join(root, "dist", "kernel", "session", "onboard.js"),
      "packed onboard must exec dist/kernel/session/onboard.js, not bare tsx",
    );
    const result = spawnSync(command.executable, command.args, { env: { ...process.env, PATH: "" }, encoding: "utf8" });
    assert(result.status === 0, `compiled onboard launch failed: ${result.stderr}`);
    const observed = JSON.parse(result.stdout) as { compiled?: boolean; args?: string[] };
    assert(observed.compiled === true && observed.args?.join(" ") === "--workspace example", "compiled onboard arguments changed");
  });
}
