#!/usr/bin/env node
/**
 * Suite runner for the capability-boundary suites (checks/verification/boundaries/*.boundaries.ts) —
 * U4's central safety deliverable (R15, KTD10): each suite attempts a forbidden action through
 * the real autonomy modules and asserts rejection with a recorded reason, never grading guardrail
 * text. Mirrors checks/verification/fixtures/run.ts's auto-discovery convention and reuses its harness.
 *
 * Usage:
 *   tsx checks/verification/boundaries/run.ts            run every discovered suite
 *   tsx checks/verification/boundaries/run.ts grants      run only the named suite
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHarness, reportResults, skillRoot, type Harness } from "../fixtures/_harness.js";

const boundariesDir = path.dirname(fileURLToPath(import.meta.url));
const suiteFiles = readdirSync(boundariesDir)
  .filter((name) => name.endsWith(".boundaries.ts"))
  .sort();
const suiteNames = suiteFiles.map((name) => name.replace(/\.boundaries\.ts$/, ""));

const requested = process.argv[2];
if (requested && !suiteNames.includes(requested)) {
  console.error(`Unknown boundary suite "${requested}". Known suites: ${suiteNames.join(", ")}`);
  process.exit(1);
}

const schemaDir = path.join(skillRoot, "kernel/schema");
const harness = createHarness(schemaDir);

try {
  for (const [index, name] of suiteNames.entries()) {
    if (requested && requested !== name) continue;
    const module = (await import(pathToFileURL(path.join(boundariesDir, suiteFiles[index]!)).href)) as {
      register?: (harness: Harness) => void;
    };
    if (typeof module.register !== "function") {
      console.error(`Boundary suite "${name}" does not export register(harness).`);
      process.exit(1);
    }
    module.register(harness);
  }
} finally {
  harness.cleanup();
}

const failed = reportResults(harness.results);
if (failed > 0) process.exitCode = 1;
