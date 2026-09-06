#!/usr/bin/env node
/**
 * b2c-app-builder-mcp — thin launcher for the engine's MCP server (entrypoints/mcp/server.ts). Same contract
 * as the b2c bin: an address, never a second implementation. The server itself documents
 * the tool surface and the unchanged trust boundary.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const local = path.join(skillRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const runtimePath = [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter);
const result = spawnSync(existsSync(local) ? local : "tsx", [path.join(skillRoot, "entrypoints/mcp/server.ts")], {
  stdio: "inherit",
  cwd: skillRoot,
  env: { ...process.env, PATH: runtimePath },
});
process.exit(result.status ?? 1);
