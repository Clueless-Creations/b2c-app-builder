#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const forbiddenCommands = ["asc apps get", "asc validate app-store-version"];
const requiredContractTerms = [
  "asc install-skills",
  "asc apps view",
  "asc status --app",
  "asc review status",
  "asc review doctor",
  "asc review submissions-list",
  "asc age-rating audit",
  "asc optimize keywords rank",
  "asc optimize keywords discover",
  "asc optimize keywords score",
  "asc subscriptions pricing derive",
  "asc diff localizations",
  "asc telemetry status",
  "asc metadata validate",
  "asc web agreements status",
  "asc web auth status",
  "asc web review show",
  "asc-analytics-reports",
  "asc-ad-hoc-distribution",
  "--version-id <VERSION_ID>",
];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");
const flags = parseFlags(process.argv.slice(2), [{ flags: ["--skill-root", "--root"], key: "skillRoot" }]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
const referencePath = path.join(skillRoot, "knowledge", "store", "app-store-connect-cli.md");
const issues: Issue[] = [];

if (!existsSync(referencePath)) {
  issues.push(issue("error", "asc_command_contract.reference_missing", "app-store-connect-cli.md is missing.", referencePath));
} else {
  const text = readFileSync(referencePath, "utf8");
  for (const guidancePath of collectGuidanceFiles()) {
    const guidance = readFileSync(guidancePath, "utf8");
    for (const command of forbiddenCommands) {
      const commandLine = new RegExp(`(?:^|\\n)\\s*(?:[>$]\\s*)?${escapeRegex(command)}(?:\\s|$)`);
      if (commandLine.test(guidance)) {
        issues.push(
          issue(
            "error",
            `asc_command_contract.stale_${code(command)}`,
            `Stored executable guidance contains the known-invalid command: ${command}. Refresh local asc --help before replacing it.`,
            path.relative(skillRoot, guidancePath),
          ),
        );
      }
    }
  }

  for (const command of requiredContractTerms) {
    if (!text.includes(command)) {
      issues.push(
        issue(
          "error",
          `asc_command_contract.current_${code(command)}_missing`,
          `Stored ASC guidance must include the current command contract: ${command}.`,
          path.relative(skillRoot, referencePath),
        ),
      );
    }
  }
}

const version = spawnSync("asc", ["--version"], { encoding: "utf8" });
if (!version.error && version.status === 0) {
  const installedMajor = parseMajorVersion(`${version.stdout ?? ""}\n${version.stderr ?? ""}`);
  verifyLiveHelp(["validate", "--help"], ["--version", "--version-id"]);
  if (installedMajor !== null && installedMajor < 4) {
    issues.push(
      issue(
        "warning",
        "asc_command_contract.live_cli_stale",
        `Installed asc ${installedMajor}.x predates the stored 4.x contract; update the shadowed CLI before using executable guidance.`,
        "knowledge/store/app-store-connect-cli.md",
      ),
    );
  }
  verifyLiveHelp(["--help"], ["install-skills", "telemetry"]);
  verifyLiveHelp(["apps", "--help"], ["view", "info"]);
  verifyLiveHelp(["auth", "--help"], ["login", "doctor", "status"]);
  verifyLiveHelp(["metadata", "--help"], ["pull", "plan", "apply", "validate"]);
  verifyLiveHelp(["review", "--help"], ["status", "doctor", "submissions-list"]);
  verifyLiveHelp(["screenshots", "--help"], ["plan", "apply", "validate"]);
  verifyLiveHelp(["diff", "--help"], ["localizations"]);
}

reportAndExit("ASC command contract check", issues);

function verifyLiveHelp(args: string[], required: string[]): void {
  const result = spawnSync("asc", args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0) {
    issues.push(
      issue(
        "error",
        `asc_command_contract.live_help_${code(args.join("_"))}_failed`,
        `Installed asc ${args.join(" ")} failed; refresh the CLI/reference before release.`,
        "knowledge/store/app-store-connect-cli.md",
      ),
    );
    return;
  }
  for (const term of required) {
    if (!hasHelpToken(output, term)) {
      issues.push(
        issue(
          "error",
          `asc_command_contract.live_help_${code(term)}_missing`,
          `Installed asc ${args.join(" ")} no longer exposes ${term}; update the stored command contract.`,
          "knowledge/store/app-store-connect-cli.md",
        ),
      );
    }
  }
}

function collectGuidanceFiles(): string[] {
  const files: string[] = [];
  for (const base of [path.join(skillRoot, "knowledge"), path.join(skillRoot, "examples", "workspace", "business")]) {
    if (existsSync(base)) {
      collectGuidanceFilesFrom(base, files);
    }
  }
  return files;
}

function collectGuidanceFilesFrom(directory: string, files: string[]): void {
  for (const name of readdirSync(directory)) {
    const fullPath = path.join(directory, name);
    if (statSync(fullPath).isDirectory()) {
      collectGuidanceFilesFrom(fullPath, files);
    } else if (/\.(?:md|ya?ml|json)$/i.test(name)) {
      files.push(fullPath);
    }
  }
}

function hasHelpToken(output: string, term: string): boolean {
  if (term.startsWith("--")) {
    return new RegExp(`(?:^|[\\s,])${escapeRegex(term)}(?=[\\s,=<]|$)`, "m").test(output);
  }
  return new RegExp(`^\\s{0,12}${escapeRegex(term)}(?::|\\s|$)`, "m").test(output);
}

function parseMajorVersion(output: string): number | null {
  const match = output.match(/(?:^|\s)v?(\d+)\.\d+\.\d+(?:\s|$)/);
  if (!match?.[1]) {
    return null;
  }
  const major = Number.parseInt(match[1], 10);
  return Number.isFinite(major) ? major : null;
}

function code(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
