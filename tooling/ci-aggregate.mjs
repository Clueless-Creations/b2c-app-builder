#!/usr/bin/env node
/**
 * ci-aggregate.mjs — honest CI complete verdict.
 *
 * Distinguishes intentionally deferred jobs from failed, cancelled, or
 * unexpectedly missing ones. A presubmit pass is not a full-audit pass.
 * No package imports: the aggregator job has no npm ci.
 */
import { pathToFileURL } from "node:url";

export const CI_SUITE_JOBS = ["presubmit", "audit-fast", "audit-heavy", "hosted-check", "app-check"];

function isTrue(value) {
  return value === true || value === "true";
}

/**
 * @param {{ verification?: string, hosted?: string|boolean, app?: string|boolean, scopeResult?: string }} selection
 */
export function expectedDisposition({ verification = "", hosted = false, app = false, scopeResult = "success" } = {}) {
  const expand = scopeResult !== "success";
  const full = verification === "full" || expand;
  return {
    presubmit: full && !expand ? "deferred" : "required",
    "audit-fast": full ? "required" : "deferred",
    "audit-heavy": full ? "required" : "deferred",
    "hosted-check": full || isTrue(hosted) ? "required" : "deferred",
    "app-check": full || isTrue(app) ? "required" : "deferred",
  };
}

/**
 * @param {Record<string, string>} results GitHub `needs.*.result` values
 * @param {{ verification?: string, hosted?: string|boolean, app?: string|boolean, scopeResult?: string }} selection
 */
export function aggregateCi(results, selection) {
  const expected = expectedDisposition(selection);
  const failed = [];
  const cancelled = [];
  const missing = [];
  const deferred = [];
  for (const job of CI_SUITE_JOBS) {
    const got = results[job] ?? "missing";
    const want = expected[job];
    if (got === "cancelled") {
      cancelled.push(job);
      continue;
    }
    if (want === "required") {
      if (got === "success") continue;
      if (got === "failure") failed.push(job);
      else missing.push(job);
      continue;
    }
    if (got === "skipped" || got === "missing") {
      deferred.push(job);
      continue;
    }
    if (got === "failure") failed.push(job);
  }
  const full = selection.verification === "full" && selection.scopeResult === "success";
  const kind = full ? "full" : "presubmit";
  const ok = failed.length === 0 && cancelled.length === 0 && missing.length === 0;
  return { ok, kind, failed, cancelled, missing, deferred, expected };
}

function main() {
  const results = {
    presubmit: process.env.JOB_PRESUBMIT ?? "missing",
    "audit-fast": process.env.JOB_AUDIT_FAST ?? "missing",
    "audit-heavy": process.env.JOB_AUDIT_HEAVY ?? "missing",
    "hosted-check": process.env.JOB_HOSTED ?? "missing",
    "app-check": process.env.JOB_APP ?? "missing",
  };
  const selection = {
    verification: process.env.VERIFICATION ?? "",
    hosted: process.env.HOSTED ?? "false",
    app: process.env.APP ?? "false",
    scopeResult: process.env.SCOPE_RESULT ?? "success",
  };
  const verdict = aggregateCi(results, selection);
  console.log(JSON.stringify(verdict, null, 2));
  if (!verdict.ok) {
    if (verdict.failed.length) console.error(`Failed: ${verdict.failed.join(", ")}`);
    if (verdict.cancelled.length) console.error(`Cancelled: ${verdict.cancelled.join(", ")}`);
    if (verdict.missing.length) console.error(`Unexpectedly missing: ${verdict.missing.join(", ")}`);
    process.exit(1);
  }
  if (verdict.kind === "full") {
    console.log("Full verification passed.");
    return;
  }
  console.log("Presubmit passed. This is not a full-audit pass.");
  if (verdict.deferred.length) {
    console.log(`Intentionally deferred: ${verdict.deferred.join(", ")}`);
  }
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main();
}
