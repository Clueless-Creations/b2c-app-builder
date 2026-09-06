#!/usr/bin/env node
/**
 * b2c setup — the one-time machine preparation, idempotent.
 *
 * Creates the b2c home and an empty workspace registry when absent, runs the same health
 * checks as `b2c doctor`, and prints the next steps with real, copy-pasteable commands —
 * including the MCP registration line with this install's absolute server path. It never touches
 * a workspace and never installs anything: worker CLIs are the machine owner's own tools
 * (doctor's R12 rule), so setup names what is missing rather than fetching it.
 *
 * Exit codes: 0 = machine ready (warnings allowed); 1 = the install itself is broken.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { b2cAppBuilderHome, registryPath } from "../../adapters/registry.js";
import { printFindings, runDoctor } from "./doctor.js";
import { isMainModule } from "../lib/cli.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function main(): number {
  const home = b2cAppBuilderHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
    console.log(`CREATED ${home}`);
  }
  const registry = registryPath();
  if (!existsSync(registry)) {
    writeFileSync(registry, `${JSON.stringify({ schemaVersion: "1.0.0", workspaces: [] }, null, 2)}\n`, "utf8");
    console.log(`CREATED ${registry} (empty registry)`);
  }

  const code = printFindings(runDoctor());

  const mcpServer = path.join(skillRoot, "entrypoints", "mcp", "b2c-app-builder-mcp.mjs");
  const cli = path.join(skillRoot, "entrypoints", "cli", "b2c.mjs");
  const node = process.execPath;
  console.log(
    [
      "",
      "Next steps:",
      "  Public v1: b2c catalog --json; b2c compose --config b2c.yaml --json",
      "  Mobile app operation: b2c catalog --id b2c/mobile-app-operation --json (native-first selection; preview only)",
      "  Composition preview is supported. Apply and public provider execution are not yet available.",
      "  Existing business-building runtime:",
      `  1. Create a planning workspace:  b2c new <slug> --dir <where> [--idea "<hypothesis>"]`,
      `  2. Research it. Accept or reject the direction in product.yaml, then run b2c render-product --workspace <dir>.`,
      `  3. Add the runtime when needed:  b2c bootstrap --workspace <where> --apply`,
      `  4. Register it:                  b2c workspaces register <slug> <where>`,
      "",
      `Global \`b2c\` command (optional): run \`npm link\` from ${skillRoot}`,
      `Without linking, the command is: ${node} ${cli}`,
      "",
      "Register the MCP server with the agent runtime(s) on this machine — same server, three configs:",
      "",
      `  Claude Code:  claude mcp add --scope user b2c-app-builder -- ${node} ${mcpServer}`,
      `    Then set "alwaysLoad": true on this entry in ~/.claude.json — the router's first call is almost always b2c_catalog or b2c_knowledge_search, so deferral costs a wasted round trip.`,
      "",
      '  Cursor — merge into ~/.cursor/mcp.json under "mcpServers":',
      `    "b2c-app-builder": { "command": "${node}", "args": ["${mcpServer}"] }`,
      "",
      "  Codex CLI (ChatGPT) — append to ~/.codex/config.toml:",
      "    [mcp_servers.b2c-app-builder]",
      `    command = "${node}"`,
      `    args = ["${mcpServer}"]`,
      "",
      "The MCP is read-only by default: public discovery/composition preview plus compatibility knowledge, status, plan, and operating preview.",
      "Use the b2c CLI for approved writes. B2C_APP_BUILDER_MCP_WRITE=1 enables the local write tools",
      "when a user deliberately chooses that wider surface.",
    ].join("\n"),
  );
  return code;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
