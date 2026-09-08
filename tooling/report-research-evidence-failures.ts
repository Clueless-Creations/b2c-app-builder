#!/usr/bin/env node
/**
 * report-research-evidence-failures.ts — measurement hook for the b2c_evidence_write decision.
 *
 * The cluster brief for issue #33 defers building a `b2c_evidence_write` MCP tool until agents
 * are measurably failing check:research at a meaningful rate — matching AGENTS.md's default
 * (MCP stays read-only; zero net-new tools unless justified) and the wave's own instruction not
 * to build a write surface on a guess. This script produces the EVIDENCE for that future,
 * founder-level decision; it does not make the decision itself.
 *
 * It never re-implements check-research-evidence.ts's judgment: it runs the real validator
 * (read-only — no `--root` target is ever written to) and tallies the `research.<code>` lines
 * reportAndExit() already prints, in the exact `- ERROR research.<code> [file]: message` shape
 * every validator in this repo emits. Zero validator changes needed to make failures measurable.
 *
 * Modes:
 *   --logs-dir <dir>     Scan every file under <dir> for already-captured check:research output
 *                        (e.g. saved CI logs or session transcripts) and tally research.<code>
 *                        lines found in them. Nothing is executed in this mode.
 *   --workspaces         Run check-research-evidence.ts once per workspace registered in this
 *                        machine's local registry (~/.b2c-app-builder/workspaces.json) and tally
 *                        the codes it reports. This is the default mode.
 *
 * Usage:
 *   tsx tooling/report-research-evidence-failures.ts [--workspaces]
 *   tsx tooling/report-research-evidence-failures.ts --logs-dir <dir>
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../adapters/registry.js";
import { resolveScriptPath } from "./lib/script-paths.js";
import { resolveTsxCommand } from "./lib/tsx-bin.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface Tally {
  readonly code: string;
  readonly severity: "ERROR" | "WARNING";
  count: number;
}

const CODE_LINE = /^- (ERROR|WARNING) (research\.[A-Za-z0-9_.]+)\b/;

function tallyLines(lines: readonly string[], tallies: Map<string, Tally>): void {
  for (const line of lines) {
    const match = CODE_LINE.exec(line.trim());
    if (!match) continue;
    const [, severity, code] = match as unknown as [string, "ERROR" | "WARNING", string];
    const existing = tallies.get(code);
    if (existing) existing.count += 1;
    else tallies.set(code, { code, severity, count: 1 });
  }
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function tallyFromLogsDir(logsDir: string): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  if (!statSync(logsDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`report_research_evidence_failures.logs_dir_missing: ${logsDir} is not a directory.`);
    return tallies;
  }
  for (const file of walkFiles(logsDir)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    tallyLines(text.split(/\r?\n/), tallies);
  }
  return tallies;
}

function tallyFromRegisteredWorkspaces(): { tallies: Map<string, Tally>; workspacesRun: number; workspacesFailedToRun: string[] } {
  const tallies = new Map<string, Tally>();
  const scriptPath = path.join(skillRoot, resolveScriptPath(skillRoot, "check-research-evidence"));
  const registry = loadRegistry();
  const workspacesFailedToRun: string[] = [];
  let workspacesRun = 0;

  for (const workspace of registry.workspaces) {
    // Read-only: check-research-evidence.ts never writes to --root. No workspace file is
    // touched by running this report.
    const command = resolveTsxCommand(skillRoot, [scriptPath, "--root", workspace.path]);
    const result = spawnSync(command.executable, command.args, { encoding: "utf8", timeout: 60_000 });
    if (result.error) {
      workspacesFailedToRun.push(`${workspace.id}: ${result.error.message}`);
      continue;
    }
    workspacesRun += 1;
    tallyLines(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.split(/\r?\n/), tallies);
  }
  return { tallies, workspacesRun, workspacesFailedToRun };
}

function printReport(tallies: Map<string, Tally>): void {
  const ranked = [...tallies.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  console.log("research.<code> frequency (most common first)");
  console.log("count  severity  code");
  if (ranked.length === 0) {
    console.log("(none found)");
    return;
  }
  for (const { code, severity, count } of ranked) {
    console.log(`${String(count).padStart(5)}  ${severity.padEnd(8)}  ${code}`);
  }
}

function main(argv: string[]): void {
  const logsDirIndex = argv.indexOf("--logs-dir");
  if (logsDirIndex >= 0) {
    const logsDir = argv[logsDirIndex + 1];
    if (!logsDir) {
      console.error("Usage: report-research-evidence-failures.ts --logs-dir <dir>");
      process.exitCode = 1;
      return;
    }
    printReport(tallyFromLogsDir(path.resolve(logsDir)));
    return;
  }

  const { tallies, workspacesRun, workspacesFailedToRun } = tallyFromRegisteredWorkspaces();
  console.log(`Ran check:research (read-only) against ${workspacesRun} registered workspace(s).`);
  if (workspacesFailedToRun.length > 0) {
    console.log(`${workspacesFailedToRun.length} workspace(s) could not be run:`);
    for (const failure of workspacesFailedToRun) console.log(`  - ${failure}`);
  }
  console.log("");
  printReport(tallies);
}

main(process.argv.slice(2));
