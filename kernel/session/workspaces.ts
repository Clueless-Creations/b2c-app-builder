#!/usr/bin/env node
/**
 * Workspace registry CLI (`b2c workspaces ...`): the machine's list of its businesses.
 * Addresses only — see adapters/registry.ts for why the registry never carries business
 * truth. This CLI is also how a workspace earns MCP access: the server refuses anything the
 * registry does not name.
 *
 * Usage:
 *   tsx kernel/session/workspaces.ts list
 *   tsx kernel/session/workspaces.ts register <id> <path>
 *   tsx kernel/session/workspaces.ts remove <id>
 *
 * Exit codes: 0 = done; 1 = invalid input or unknown id.
 */
import path from "node:path";
import { isMainModule } from "../lib/cli.js";
import { loadRegistry, registerWorkspace, removeWorkspace, registryPath } from "../../adapters/registry.js";
import { readWorkspaceStatus, renderWorkspaceStatusSummary } from "./status.js";

function list(): number {
  const registry = loadRegistry();
  if (registry.workspaces.length === 0) {
    console.log(
      `No workspaces registered yet (${registryPath()}). Start a new business: b2c business-create --help. Adopt an existing scaffold: b2c workspaces register <id> <path>`,
    );
    return 0;
  }
  for (const entry of registry.workspaces) {
    console.log(
      `${entry.id}\t${entry.path}\t${renderWorkspaceStatusSummary(readWorkspaceStatus(entry.path))}\t(registered ${entry.registeredAt.slice(0, 10)})`,
    );
  }
  return 0;
}

function main(): number {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === "list" || command === undefined) return list();
    if (command === "register") {
      const [id, workspacePath] = rest;
      if (!id || !workspacePath) {
        console.error("Usage: b2c workspaces register <id> <path>");
        return 1;
      }
      // The bin spawns this CLI with cwd at the package root, so a relative path from the
      // caller's shell must resolve against THEIR directory, not ours.
      const resolved = path.resolve(process.env.B2C_APP_BUILDER_CALLER_CWD?.trim() || process.cwd(), workspacePath);
      registerWorkspace(id, resolved);
      console.log(`REGISTERED ${id} -> ${resolved}`);
      return 0;
    }
    if (command === "remove") {
      const [id] = rest;
      if (!id) {
        console.error("Usage: b2c workspaces remove <id>");
        return 1;
      }
      removeWorkspace(id);
      console.log(`REMOVED ${id}`);
      return 0;
    }
    console.error(`workspaces: unknown command "${command}" (expected list, register, remove)`);
    return 1;
  } catch (error) {
    console.error(`ISSUE ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
