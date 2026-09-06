#!/usr/bin/env node
/**
 * ci-lane.mjs — decide whether GitHub should run the heavy audit lane.
 *
 * No package imports: the "Lane" job runs this with the runner's stock Node
 * before npm ci. --files is the test hook; without it, the script diffs
 * BASE_SHA...HEAD_SHA (GitHub env).
 *
 * Fail closed: unknown event, missing SHAs, git errors, and workflow_dispatch
 * all select heavy so a path-filter bug cannot skip fixture suites.
 */
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Exact repo-relative paths that force the heavy lane. */
export const HEAVY_EXACT_PATHS = new Set([".github/workflows/ci.yml", "package.json", "tsconfig.json"]);

/** Directory prefixes (include trailing slash). */
export const HEAVY_PATH_PREFIXES = [
  "entrypoints/",
  "contracts/",
  "kernel/",
  "adapters/",
  "catalog/",
  "checks/",
  "tooling/",
  "surfaces/",
  "examples/workspace/",
  "hosted/shared/",
];

export function isHeavyPath(file) {
  const normalized = file.replace(/^\.\//, "").replace(/\\/g, "/");
  if (HEAVY_EXACT_PATHS.has(normalized)) return true;
  return HEAVY_PATH_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix));
}

export function laneForChangedFiles(files) {
  return files.some((file) => file && isHeavyPath(file)) ? "heavy" : "fast";
}

function isNullSha(value) {
  return !value || /^0+$/.test(value);
}

function parseFilesArgv(argv) {
  const index = argv.indexOf("--files");
  if (index < 0) return undefined;
  return argv.slice(index + 1);
}

function gitChangedFiles(base, head) {
  const stdout = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeOutput(heavy) {
  const line = `heavy=${heavy ? "true" : "false"}`;
  console.log(line);
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `${line}\n`);
  }
}

function main() {
  const filesArg = parseFilesArgv(process.argv.slice(2));
  if (filesArg) {
    writeOutput(laneForChangedFiles(filesArg) === "heavy");
    return;
  }

  const eventName = process.env.EVENT_NAME ?? process.env.GITHUB_EVENT_NAME ?? "";
  if (eventName === "workflow_dispatch") {
    writeOutput(true);
    return;
  }

  const base = process.env.BASE_SHA ?? "";
  const head = process.env.HEAD_SHA ?? "";
  if (isNullSha(base) || isNullSha(head)) {
    console.error("ci-lane: missing BASE_SHA/HEAD_SHA; selecting heavy.");
    writeOutput(true);
    return;
  }

  try {
    const files = gitChangedFiles(base, head);
    console.error(`ci-lane: ${files.length} changed path(s) vs ${base.slice(0, 12)}...${head.slice(0, 12)}`);
    writeOutput(laneForChangedFiles(files) === "heavy");
  } catch (error) {
    console.error(`ci-lane: git diff failed (${error instanceof Error ? error.message : String(error)}); selecting heavy.`);
    writeOutput(true);
  }
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main();
}
