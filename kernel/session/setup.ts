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
  if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
    console.log(
      [
        "Usage: b2c setup [--help|-h]",
        "",
        "Prepare this machine for B2C App Builder.",
        "Without flags, create the builder home and an empty workspace registry when absent,",
        "run doctor health checks, and print MCP registration and business creation commands.",
        "Existing workspace registrations are preserved. Setup does not install software or create a business.",
        "",
        "--help, -h  Show this help without creating files or running health checks.",
        "Run b2c doctor for a read-only health report.",
      ].join("\n"),
    );
    return 0;
  }
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
  // An npm tarball never carries .git; a source checkout always does. That one fact decides which
  // install advice applies: `npm link` only means something from a checkout, and the portable npx
  // form only resolves once the package is on the registry, which an npm install proves.
  const fromCheckout = existsSync(path.join(skillRoot, ".git"));
  console.log(
    [
      "",
      "Next steps:",
      "  Public v1: b2c catalog --json; b2c compose --config b2c.yaml --json",
      "  Mobile app operation: b2c catalog --id b2c/mobile-app-operation --json (native-first selection; preview only)",
      "  compose previews declarations only. Use composition-plan and composition-activate for installed-package activation.",
      "  Start a complete consumer business:",
      `  1. Create and register: b2c business-create --workspace <slug> --directory <empty-or-absent-path> --name "<working name>" --hypothesis "<hypothesis>" --mandate "<full request>" --json`,
      "     Do not register or add files to the target first. The CLI flag is --workspace, not --workspace-id.",
      `  2. Research it. After explicit acceptance in product.yaml, run b2c render-product --workspace <slug>.`,
      `  3. Read the revision: b2c business-plan --workspace <slug> --json`,
      `  4. Initialize: b2c business-initialize --workspace <slug> --revision <revision-from-plan> --json`,
      "     Initialization grants no work authority. Record approved authority with b2c onboard before business-run.",
      "  Existing registered workspace: resume with business-plan. Existing unregistered scaffold: b2c workspaces register <slug> <path>.",
      "  Legacy b2c new and b2c bootstrap remain supported for explicit scaffold and runtime maintenance.",
      "",
      ...(fromCheckout
        ? [`Global \`b2c\` command (optional): run \`npm link\` from ${skillRoot}`, `Without linking, the command is: ${node} ${cli}`]
        : [`Installed from npm: \`b2c\` is on PATH and the MCP server is ${mcpServer}`]),
      "",
      "Register the MCP server with the agent runtime(s) on this machine — same server, three configs:",
      "",
      `  Claude Code:  claude mcp add --scope user b2c-app-builder -- ${node} ${mcpServer}`,
      ...(fromCheckout
        ? []
        : [
            "    Portable form, no machine paths (any client: command npx, args -y -p b2c-app-builder b2c-app-builder-mcp):",
            "    claude mcp add --scope user b2c-app-builder -- npx -y -p b2c-app-builder b2c-app-builder-mcp",
          ]),
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
