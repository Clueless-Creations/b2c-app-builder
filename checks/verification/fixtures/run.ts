#!/usr/bin/env node
/**
 * Suite runner for the greenfield core fixture suites (checks/verification/fixtures/*.fixtures.ts).
 *
 * Suites are auto-discovered by filename convention: <name>.fixtures.ts must export
 * `register(harness)`. Adding a suite never requires editing this file.
 *
 * By default the suites run as parallel shard children (tooling/lib/shard-pool.ts): this
 * runner re-spawns itself once per suite with --shard <name>, and the parent prints ONE
 * combined report in suite discovery order, so the output keeps the serial run's shape.
 * A shard that dies before printing its result line is reported as a failed row, never as
 * empty-and-passing.
 *
 * Usage:
 *   tsx checks/verification/fixtures/run.ts            run every discovered suite (parallel)
 *   tsx checks/verification/fixtures/run.ts schema      run only the named suite, in-process
 *   tsx checks/verification/fixtures/run.ts --serial    run every suite in-process, one at a time
 *   tsx checks/verification/fixtures/run.ts --shard schema   child mode: machine-readable results
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHarness, reportResults, skillRoot, type CaseResult, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { emitShardResults, runShards, shardConcurrency } from "../../../tooling/lib/shard-pool.js";

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const suiteFiles = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".fixtures.ts"))
  .sort();
const suiteNames = suiteFiles.map((name) => name.replace(/\.fixtures\.ts$/, ""));

const argv = process.argv.slice(2);
const serial = argv.includes("--serial");
const shardFlagIndex = argv.indexOf("--shard");
const shardName = shardFlagIndex >= 0 ? argv[shardFlagIndex + 1] : undefined;
const requested = argv.find((token) => !token.startsWith("--"));

for (const name of [shardName, requested]) {
  if (name !== undefined && !suiteNames.includes(name)) {
    console.error(`Unknown fixture suite "${name}". Known suites: ${suiteNames.join(", ")}`);
    process.exit(1);
  }
}

const schemaDir = path.join(skillRoot, "kernel/schema");

async function runInProcess(selected: string[]): Promise<CaseResult[]> {
  const harness = createHarness(schemaDir);
  try {
    for (const name of selected) {
      const suiteFile = suiteFiles[suiteNames.indexOf(name)]!;
      const module = (await import(pathToFileURL(path.join(fixturesDir, suiteFile)).href)) as {
        register?: (harness: Harness) => void;
      };
      if (typeof module.register !== "function") {
        console.error(`Fixture suite "${name}" does not export register(harness).`);
        process.exit(1);
      }
      module.register(harness);
    }
  } finally {
    harness.cleanup();
  }
  return harness.results;
}

if (shardName !== undefined) {
  // Pass/fail is judged by the parent from the emitted results; a non-zero exit without the
  // marker line is what the parent reports as a crashed shard.
  emitShardResults(await runInProcess([shardName]));
} else if (serial || requested !== undefined) {
  const results = await runInProcess(requested !== undefined ? [requested] : suiteNames);
  if (reportResults(results) > 0) {
    process.exitCode = 1;
  }
} else {
  const selfPath = fileURLToPath(import.meta.url);
  const shardRuns = await runShards(
    suiteNames,
    resolveTsxBin(skillRoot),
    (name) => [selfPath, "--shard", name],
    skillRoot,
    shardConcurrency(),
    // Start order only (report order is fixed): heaviest suite first, so a large suite late
    // in discovery order does not start when the pool is already draining.
    suiteFiles.map((file) => statSync(path.join(fixturesDir, file)).size),
  );
  const combined: CaseResult[] = [];
  for (const run of shardRuns) {
    if (run.results) {
      combined.push(...(run.results as CaseResult[]));
    } else {
      combined.push({
        label: `${run.name} shard crashed before reporting (exit ${run.code ?? "null"})`,
        ok: false,
        detail: run.output.trim(),
      });
    }
  }
  if (reportResults(combined) > 0) {
    process.exitCode = 1;
  }
}
