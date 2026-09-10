#!/usr/bin/env node
/**
 * tsc emit does not copy `.mjs` launchers that compiled modules still import.
 * Keep the dist tree aligned with those stable addresses.
 */
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["tooling/lib/tsx-launcher.mjs"];

for (const relative of files) {
  const from = path.join(root, relative);
  const to = path.join(root, "dist", relative);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}
