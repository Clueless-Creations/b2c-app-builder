#!/usr/bin/env node
/**
 * Suite runner for the cross-runtime parity suites (verification/parity/*.parity.ts) — U9's
 * KTD10 "runtime parity" gate (R3, the adapter-parity rule): the SAME scenario driven through
 * every founder-facing capability profile (claude/codex/cursor) plus inline must show identical
 * node reachability, identical approval/waiver requirements, and identical parked reasons;
 * differences may appear ONLY in concurrency/mode/command fields. Mirrors checks/verification/fixtures/
 * run.ts and checks/verification/boundaries/run.ts's auto-discovery convention and reuses the same
 * harness — no real vendor CLI is ever invoked here (see each suite's own doc comment).
 *
 * Usage:
 *   tsx verification/parity/run.ts            run every discovered suite
 *   tsx verification/parity/run.ts session     run only the named suite
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHarness, reportResults, skillRoot, type Harness } from "../fixtures/_harness.js";

const parityDir = path.dirname(fileURLToPath(import.meta.url));
const suiteFiles = readdirSync(parityDir)
  .filter((name) => name.endsWith(".parity.ts"))
  .sort();
const suiteNames = suiteFiles.map((name) => name.replace(/\.parity\.ts$/, ""));

const requested = process.argv[2];
if (requested && !suiteNames.includes(requested)) {
  console.error(`Unknown parity suite "${requested}". Known suites: ${suiteNames.join(", ")}`);
  process.exit(1);
}

const schemaDir = path.join(skillRoot, "kernel/schema");
const harness = createHarness(schemaDir);

try {
  for (const [index, name] of suiteNames.entries()) {
    if (requested && requested !== name) continue;
    const module = (await import(pathToFileURL(path.join(parityDir, suiteFiles[index]!)).href)) as {
      register?: (harness: Harness) => void;
    };
    if (typeof module.register !== "function") {
      console.error(`Parity suite "${name}" does not export register(harness).`);
      process.exit(1);
    }
    module.register(harness);
  }
} finally {
  harness.cleanup();
}

const failed = reportResults(harness.results);
if (failed > 0) process.exitCode = 1;
