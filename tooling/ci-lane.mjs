#!/usr/bin/env node
/**
 * ci-lane.mjs — decide GitHub verification cadence and which extra jobs to run.
 *
 * No package imports: the Scope job runs this with the runner's stock Node
 * before npm ci. --files is the test hook; without it, the script diffs
 * BASE_SHA...HEAD_SHA (GitHub env).
 *
 * Ordinary pull_request and main pushes select **presubmit**. Explicit
 * workflow_dispatch defaults to **full** (checkpoint / final verification).
 * Path filters never delete suites: they only choose extras and what to
 * report as deferred.
 *
 * Fail closed: unknown event, missing SHAs, or git errors expand hosted, app,
 * and extra scopes. They do not pretend a skipped job was green.
 */
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Exact repo-relative paths that put serial suites in scope for this change. */
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
  "examples/extensions/",
  "examples/contributions/",
  "hosted/shared/",
];

/**
 * Hosted worker (`hosted/knowledge-mcp`) plus the files it actually bundles or
 * generates from. A knowledge or catalog edit can change the hosted bundle even
 * when `hosted/knowledge-mcp/` itself is untouched. Root lockfile / tsconfig
 * change the install the Worker typecheck resolves through.
 */
export const HOSTED_EXACT_PATHS = new Set([
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  ".node-version",
  "tooling/render-hosted-bundle.ts",
]);

export const HOSTED_PATH_PREFIXES = [
  "hosted/knowledge-mcp/",
  "hosted/shared/",
  "hosted/builder-console/analytics/",
  "kernel/knowledge-service/",
  "catalog/",
  "knowledge/",
];

/**
 * Builder console Worker. It imports `hosted/knowledge-mcp` auth/db and
 * `hosted/shared`. Unknown coupling expands to the whole knowledge-mcp tree.
 */
export const APP_EXACT_PATHS = new Set(["package.json", "package-lock.json", "tsconfig.json", ".node-version"]);

export const APP_PATH_PREFIXES = ["hosted/builder-console/", "hosted/shared/", "hosted/knowledge-mcp/"];

export const BOUNDARIES_PATH_PREFIXES = [
  "entrypoints/",
  "contracts/",
  "kernel/",
  "adapters/",
  "checks/verification/",
  "examples/extensions/",
  "examples/contributions/",
  "examples/workspace/",
  "surfaces/",
];

export const PUBLIC_API_PATH_PREFIXES = ["contracts/", "entrypoints/"];

export const SECURITY_PATH_PREFIXES = ["checks/validation/business/trust/"];

/** Expressions copied into `.github/workflows/ci.yml`; fixtures assert they match. */
export const CI_CONCURRENCY_GROUP_EXPR =
  "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}-${{ github.event_name == 'workflow_dispatch' && inputs.verification == 'full' && 'full' || 'ordinary' }}";

export const CI_CANCEL_IN_PROGRESS_EXPR = "${{ github.event_name != 'workflow_dispatch' || inputs.verification != 'full' }}";

function normalizePath(file) {
  return String(file ?? "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
}

function matchesPrefix(file, prefix) {
  const normalized = normalizePath(file);
  if (!normalized) return false;
  if (prefix.endsWith("/")) {
    return normalized === prefix.slice(0, -1) || normalized.startsWith(prefix);
  }
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

function matchesExactOrPrefix(file, exact, prefixes) {
  const normalized = normalizePath(file);
  if (exact.has(normalized)) return true;
  return prefixes.some((prefix) => matchesPrefix(normalized, prefix));
}

export function isHeavyPath(file) {
  return matchesExactOrPrefix(file, HEAVY_EXACT_PATHS, HEAVY_PATH_PREFIXES);
}

export function isHostedPath(file) {
  return matchesExactOrPrefix(file, HOSTED_EXACT_PATHS, HOSTED_PATH_PREFIXES);
}

export function isAppPath(file) {
  return matchesExactOrPrefix(file, APP_EXACT_PATHS, APP_PATH_PREFIXES);
}

export function isBoundariesPath(file) {
  return BOUNDARIES_PATH_PREFIXES.some((prefix) => matchesPrefix(file, prefix));
}

export function isSecurityPath(file) {
  return SECURITY_PATH_PREFIXES.some((prefix) => matchesPrefix(file, prefix));
}

export function isPublicApiPath(file) {
  return PUBLIC_API_PATH_PREFIXES.some((prefix) => matchesPrefix(file, prefix));
}

export function laneForChangedFiles(files) {
  return files.some((file) => file && isHeavyPath(file)) ? "heavy" : "fast";
}

export function scopesForFiles(files) {
  const scopes = [];
  if (files.some((file) => file && isBoundariesPath(file))) scopes.push("boundaries");
  if (files.some((file) => file && isSecurityPath(file))) scopes.push("security");
  if (files.some((file) => file && isPublicApiPath(file))) scopes.push("public-api");
  return scopes;
}

/**
 * @param {{ eventName?: string, verificationInput?: string, files?: string[], unknown?: boolean }} input
 */
export function selectCadence({ eventName = "", verificationInput = "", files, unknown = false } = {}) {
  const verification = verificationInput === "presubmit" || verificationInput === "full" ? verificationInput : eventName === "workflow_dispatch" ? "full" : "presubmit";
  if (verification === "full") {
    return {
      verification: "full",
      heavy: true,
      hosted: true,
      app: true,
      scopes: ["boundaries", "security", "public-api"],
      expand: Boolean(unknown),
    };
  }
  if (unknown || !Array.isArray(files)) {
    return {
      verification: "presubmit",
      heavy: true,
      hosted: true,
      app: true,
      scopes: ["boundaries", "security", "public-api"],
      expand: true,
    };
  }
  return {
    verification: "presubmit",
    heavy: files.some((file) => file && isHeavyPath(file)),
    hosted: files.some((file) => file && isHostedPath(file)),
    app: files.some((file) => file && isAppPath(file)),
    scopes: scopesForFiles(files),
    expand: false,
  };
}

export function concurrencyGroup({ workflow = "CI", eventName = "", prNumber, ref = "", verification = "presubmit" } = {}) {
  const identity = prNumber ? String(prNumber) : ref;
  const lane = eventName === "workflow_dispatch" && verification === "full" ? "full" : "ordinary";
  return `${workflow}-${identity}-${lane}`;
}

export function cancelInProgress({ eventName = "", verification = "presubmit" } = {}) {
  return !(eventName === "workflow_dispatch" && verification === "full");
}

function isNullSha(value) {
  return !value || /^0+$/.test(value);
}

function parseFilesArgv(argv) {
  const index = argv.indexOf("--files");
  if (index < 0) return undefined;
  return argv.slice(index + 1);
}

function parseVerificationArgv(argv) {
  const index = argv.indexOf("--verification");
  if (index < 0) return undefined;
  return argv[index + 1];
}

function gitChangedFiles(base, head) {
  const stdout = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeOutput(cadence) {
  const lines = [
    `verification=${cadence.verification}`,
    `heavy=${cadence.heavy ? "true" : "false"}`,
    `hosted=${cadence.hosted ? "true" : "false"}`,
    `app=${cadence.app ? "true" : "false"}`,
    `scopes=${cadence.scopes.join(",")}`,
    `expand=${cadence.expand ? "true" : "false"}`,
  ];
  for (const line of lines) console.log(line);
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `${lines.join("\n")}\n`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const filesArg = parseFilesArgv(argv);
  const eventName = process.env.EVENT_NAME ?? process.env.GITHUB_EVENT_NAME ?? "";
  const verificationInput = parseVerificationArgv(argv) ?? process.env.VERIFICATION ?? "";

  if (filesArg) {
    writeOutput(selectCadence({ eventName, verificationInput, files: filesArg, unknown: false }));
    return;
  }

  if (eventName === "workflow_dispatch" && verificationInput !== "presubmit") {
    writeOutput(selectCadence({ eventName, verificationInput: "full", files: [], unknown: false }));
    return;
  }

  const base = process.env.BASE_SHA ?? "";
  const head = process.env.HEAD_SHA ?? "";
  if (isNullSha(base) || isNullSha(head)) {
    console.error("ci-lane: missing BASE_SHA/HEAD_SHA; expanding coverage.");
    writeOutput(selectCadence({ eventName, verificationInput, unknown: true }));
    return;
  }

  try {
    const files = gitChangedFiles(base, head);
    console.error(`ci-lane: ${files.length} changed path(s) vs ${base.slice(0, 12)}...${head.slice(0, 12)}`);
    writeOutput(selectCadence({ eventName, verificationInput, files, unknown: false }));
  } catch (error) {
    console.error(`ci-lane: git diff failed (${error instanceof Error ? error.message : String(error)}); expanding coverage.`);
    writeOutput(selectCadence({ eventName, verificationInput, unknown: true }));
  }
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main();
}
