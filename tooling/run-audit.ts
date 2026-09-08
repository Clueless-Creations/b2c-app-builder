#!/usr/bin/env node
/**
 * run-audit.ts — orchestrates the maintainer audit pipeline.
 *
 * Replaces the former package.json `audit` / `audit:ci` shell chains. The
 * ordered step list lives in lib/audit-plan.ts (one source of truth, shared
 * with check-package-parity.ts). Steps are spawned through the local tsx
 * binary directly — not `npm run` — which removes one npm boot per step, and
 * independent steps run through a small concurrency pool with output
 * buffered and printed in plan order so logs stay deterministic.
 *
 * Usage:
 *   tsx tooling/run-audit.ts            # full audit (includes validate:skill)
 *   tsx tooling/run-audit.ts --ci       # CI audit (skips maintainer-only steps)
 *   tsx tooling/run-audit.ts --serial   # disable the concurrency pool
 *   tsx tooling/run-audit.ts --concurrency 8
 *   tsx tooling/run-audit.ts --only check:secrets --only launchbench:lint
 *   tsx tooling/run-audit.ts --list     # print the resolved plan and exit
 *   tsx tooling/run-audit.ts --ci --lane fast   # cheap validators (every PR)
 *   tsx tooling/run-audit.ts --ci --lane heavy  # fixture suites + engine e2e
 *   tsx tooling/run-audit.ts --ci --lane heavy --shard 1/2   # one CI shard of the serial suites
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildAuditPlan,
  parseAuditShard,
  stepSkippedByLane,
  stepSkippedByShard,
  type AuditLane,
  type AuditLayout,
  type AuditShard,
  type AuditStep,
  AUDIT_LANES,
} from "./lib/audit-plan.js";

interface StepResult {
  step: AuditStep;
  skipped?: string;
  code: number | null;
  output: string;
  durationMs: number;
}

interface Options {
  ci: boolean;
  serial: boolean;
  concurrency: number;
  only: Set<string>;
  list: boolean;
  packageRoot: string;
  lane: AuditLane;
  shard: AuditShard | undefined;
}

function parseLane(value: string | undefined): AuditLane {
  if (value && (AUDIT_LANES as readonly string[]).includes(value)) {
    return value as AuditLane;
  }
  throw new Error(`--lane must be one of ${AUDIT_LANES.join(", ")} (got ${value ?? "(missing)"}).`);
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    ci: false,
    serial: false,
    concurrency: Math.max(2, Math.min(4, cpus().length)),
    only: new Set<string>(),
    list: false,
    packageRoot: process.cwd(),
    lane: "all",
    shard: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--ci") {
      options.ci = true;
    } else if (token === "--serial") {
      options.serial = true;
    } else if (token === "--list") {
      options.list = true;
    } else if (token === "--concurrency" && value) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 1) {
        options.concurrency = Math.floor(parsed);
      }
      index += 1;
    } else if (token === "--only" && value) {
      options.only.add(value);
      index += 1;
    } else if (token === "--package-root" && value) {
      options.packageRoot = path.resolve(value);
      index += 1;
    } else if (token === "--lane" && value) {
      options.lane = parseLane(value);
      index += 1;
    } else if (token === "--shard" && value) {
      options.shard = parseAuditShard(value);
      index += 1;
    }
  }
  return options;
}

function readScripts(packageRoot: string): Record<string, string> {
  const packagePath = path.join(packageRoot, "package.json");
  const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${packagePath} must be a JSON object.`);
  }
  const scripts = (parsed as Record<string, unknown>).scripts;
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) {
    throw new Error(`${packagePath} must define scripts.`);
  }
  const out: Record<string, string> = {};
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string") {
      out[name] = command;
    }
  }
  return out;
}

function resolveBin(packageRoot: string, name: string): string {
  const candidates = [
    path.join(packageRoot, "node_modules/.bin", name),
    path.resolve(packageRoot, "../..", "node_modules/.bin", name),
    path.resolve(packageRoot, "../../..", "node_modules/.bin", name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? name;
}

/**
 * ADR-0002 put SKILL.md at the repository root, so the skill entrypoint no longer
 * distinguishes a source checkout from an installed copy. A checkout carries the
 * repository-only scaffolding (.git, .github); a packed or copied install does not.
 */
function detectLayout(packageRoot: string): AuditLayout {
  const repoMarkers = [".git", ".github"];
  return repoMarkers.some((marker) => existsSync(path.join(packageRoot, marker))) ? "repo" : "skill";
}

function runCommand(command: string, commandArgs: string[], cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd, env: process.env });
    const chunks: string[] = [];
    child.stdout.on("data", (data: Buffer) => chunks.push(data.toString("utf8")));
    child.stderr.on("data", (data: Buffer) => chunks.push(data.toString("utf8")));
    child.on("error", (error) => {
      chunks.push(`${error.message}\n`);
      resolve({ code: 1, output: chunks.join("") });
    });
    child.on("close", (code) => resolve({ code, output: chunks.join("") }));
  });
}

async function runStep(step: AuditStep, scripts: Record<string, string>, options: Options): Promise<StepResult> {
  const started = Date.now();
  const finish = (code: number | null, output: string): StepResult => ({
    step,
    code,
    output,
    durationMs: Date.now() - started,
  });

  if (step.kind === "tsc") {
    const tscBin = resolveBin(options.packageRoot, "tsc");
    const result = await runCommand(tscBin, ["--noEmit"], options.packageRoot);
    return finish(result.code, result.output);
  }

  const scriptString = scripts[step.id];
  if (!scriptString) {
    return finish(1, `package.json has no script named ${step.id}.\n`);
  }

  if (step.kind === "shell") {
    const result = await runCommand("bash", ["-c", scriptString], options.packageRoot);
    return finish(result.code, result.output);
  }

  const tokens = scriptString.trim().split(/\s+/);
  if (tokens[0] !== "tsx") {
    return finish(1, `Script ${step.id} must start with "tsx" to be orchestrated (got: ${scriptString}).\n`);
  }
  const tsxBin = resolveBin(options.packageRoot, "tsx");
  const result = await runCommand(tsxBin, [...tokens.slice(1), ...(step.args ?? [])], options.packageRoot);
  return finish(result.code, result.output);
}

/**
 * A passing step's own warning count (the shared reportAndExit summary line — "N error(s), N
 * warning(s)" — used by check-no-slop.ts, check-technical-docs-ste100.ts, and every other
 * two-tier validator) so a real, non-blocking violation shows up even without
 * B2C_AUDIT_VERBOSE. Without this, a passing step's warnings are invisible in CI: only errors
 * force the verbose output block below, so a warning tier that exists to give "real, visible
 * signal" gave none in the one place a maintainer actually reads the audit.
 */
function warningCountFrom(output: string): number | undefined {
  const match = output.match(/\d+ error\(s\), (\d+) warning\(s\)/);
  return match ? Number(match[1]) : undefined;
}

function printResult(result: StepResult, index: number, total: number): void {
  const heading = `[${index + 1}/${total}] ${result.step.id}`;
  if (result.skipped) {
    console.log(`${heading} — SKIPPED (${result.skipped})`);
    return;
  }
  const status = result.code === 0 ? "ok" : `FAILED (exit ${result.code ?? "null"})`;
  const seconds = (result.durationMs / 1000).toFixed(1);
  const warningCount = result.code === 0 ? warningCountFrom(result.output) : undefined;
  const warningSuffix = warningCount ? ` (${warningCount} warning${warningCount === 1 ? "" : "s"})` : "";
  console.log(`${heading} — ${status}${warningSuffix} in ${seconds}s`);
  const trimmed = result.output.trimEnd();
  if (trimmed && (result.code !== 0 || process.env.B2C_AUDIT_VERBOSE === "1")) {
    console.log(
      trimmed
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
  }
}

export async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const layout = detectLayout(options.packageRoot);
  const scripts = readScripts(options.packageRoot);
  // Shard ownership is a property of the WHOLE plan, never of a --only subset: filtering first
  // would renumber the serial steps and hand shard 1 a step that shard 2 owns.
  const fullPlan = buildAuditPlan(layout);
  let plan = fullPlan;
  if (options.only.size > 0) {
    plan = plan.filter((step) => options.only.has(step.id));
  }

  if (options.list) {
    for (const step of plan) {
      const laneSkip = stepSkippedByLane(step, options.lane);
      const flags = [
        step.ciSkip ? "ci-skip" : "",
        step.serial ? "serial" : "",
        step.repoOnly ? "repo-only" : "",
        laneSkip ? (options.lane === "fast" ? "heavy-lane" : "fast-lane") : "",
      ].filter(Boolean);
      console.log(`${step.id}${step.args ? ` ${step.args.join(" ")}` : ""}${flags.length ? ` [${flags.join(",")}]` : ""}`);
    }
    return;
  }

  console.log(
    `Maintainer audit (${layout} layout, ${options.ci ? "ci" : "full"} mode, lane ${options.lane}${
      options.shard ? `, shard ${options.shard.index}/${options.shard.total}` : ""
    }, concurrency ${options.serial ? 1 : options.concurrency})`,
  );

  const results = new Array<StepResult | undefined>(plan.length);
  let printedThrough = -1;
  const flushInOrder = (): void => {
    while (printedThrough + 1 < plan.length && results[printedThrough + 1]) {
      printedThrough += 1;
      printResult(results[printedThrough]!, printedThrough, plan.length);
    }
  };

  const record = (index: number, result: StepResult): void => {
    results[index] = result;
    flushInOrder();
  };

  // The typecheck is a barrier: nothing else runs until the code compiles.
  const barrierIndex = plan.findIndex((step) => step.kind === "tsc");
  if (barrierIndex >= 0) {
    const step = plan[barrierIndex]!;
    record(barrierIndex, await runStep(step, scripts, options));
    if (results[barrierIndex]!.code !== 0) {
      finishUp(results, plan.length);
      return;
    }
  }

  const pending: number[] = [];
  const serialSteps: number[] = [];
  for (let index = 0; index < plan.length; index += 1) {
    if (index === barrierIndex) {
      continue;
    }
    const step = plan[index]!;
    if (options.ci && step.ciSkip) {
      record(index, { step, skipped: "maintainer-only step (--ci)", code: 0, output: "", durationMs: 0 });
      continue;
    }
    const laneSkip = stepSkippedByLane(step, options.lane);
    if (laneSkip) {
      record(index, { step, skipped: laneSkip, code: 0, output: "", durationMs: 0 });
      continue;
    }
    const shardSkip = stepSkippedByShard(fullPlan, step, options.shard);
    if (shardSkip) {
      record(index, { step, skipped: shardSkip, code: 0, output: "", durationMs: 0 });
      continue;
    }
    if (step.serial || options.serial) {
      serialSteps.push(index);
    } else {
      pending.push(index);
    }
  }

  const workers = Array.from({ length: Math.max(1, options.serial ? 1 : options.concurrency) }, async () => {
    while (pending.length > 0) {
      const index = pending.shift();
      if (index === undefined) {
        return;
      }
      record(index, await runStep(plan[index]!, scripts, options));
    }
  });
  await Promise.all(workers);

  for (const index of serialSteps) {
    record(index, await runStep(plan[index]!, scripts, options));
  }

  finishUp(results, plan.length);
}

function finishUp(results: Array<StepResult | undefined>, total: number): void {
  const completed = results.filter((result): result is StepResult => Boolean(result));
  const failed = completed.filter((result) => !result.skipped && result.code !== 0);
  const skipped = completed.filter((result) => result.skipped);
  const notRun = total - completed.length;
  console.log("");
  console.log(
    `Audit summary: ${completed.length - failed.length - skipped.length} ok, ${failed.length} failed, ${skipped.length} skipped${notRun > 0 ? `, ${notRun} not run` : ""}.`,
  );
  for (const result of failed) {
    console.log(`- FAILED ${result.step.id} (exit ${result.code ?? "null"})`);
  }
  if (failed.length > 0 || notRun > 0) {
    process.exitCode = 1;
  }
}

// Keep the main function reusable by focused repository tooling.
function isMainModule(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  await main();
}
