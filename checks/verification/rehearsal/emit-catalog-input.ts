#!/usr/bin/env node
/**
 * Emit the real catalog as a CatalogInput JSON for a rehearsal workspace.
 *
 * Usage: tsx checks/verification/rehearsal/emit-catalog-input.ts <target-path>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCatalogInput } from "../../../catalog/bridge.js";
import { composeCatalog } from "../../../catalog/index.js";

const target = process.argv[2];
if (!target) {
  console.error("Usage: tsx checks/verification/rehearsal/emit-catalog-input.ts <target-path>");
  process.exit(1);
}
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
writeFileSync(target, `${JSON.stringify(toCatalogInput(composeCatalog(skillRoot)), null, 2)}\n`);
console.log(`catalog input written: ${target}`);
