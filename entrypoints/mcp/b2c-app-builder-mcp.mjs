#!/usr/bin/env node
/**
 * b2c-app-builder-mcp — thin launcher for the engine's MCP server (entrypoints/mcp/server.ts). Same contract
 * as the b2c bin: an address, never a second implementation. The server itself documents
 * the tool surface and the unchanged trust boundary.
 */
import { launchTypeScript } from "../../tooling/lib/tsx-launcher.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.exit(launchTypeScript(skillRoot, [path.join(skillRoot, "entrypoints/mcp/server.ts")]));
