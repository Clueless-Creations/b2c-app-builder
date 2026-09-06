#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asArray, asString, flagString, isRecord, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");
const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];
const statePath = args.statePath ?? path.join(args.templatesRoot, "state/business-state.json");

if (!existsSync(args.templatesRoot)) {
  issues.push(issue("error", "artifact_templates.templates_missing", `Templates directory is missing: ${args.templatesRoot}`, args.templatesRoot));
} else if (!existsSync(statePath)) {
  issues.push(issue("error", "artifact_templates.project_state_missing", `Template state/business-state.json is missing: ${statePath}`, statePath));
} else {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const templateFiles = collectTemplateFiles(args.templatesRoot);
  const exactPaths = new Set(templateFiles.map((file) => path.relative(args.templatesRoot, file)));
  const lowerExactPaths = new Set(Array.from(exactPaths).map((file) => file.toLowerCase()));

  if (!isRecord(state) || !isRecord(state.lanes)) {
    issues.push(
      issue("error", "artifact_templates.lanes_missing", "Template state/business-state.json must include lanes.", path.relative(args.skillRoot, statePath)),
    );
  } else {
    for (const [laneName, laneValue] of Object.entries(state.lanes)) {
      if (!isRecord(laneValue)) {
        continue;
      }
      const evidence = asArray(laneValue.evidence)
        .map((entry) => asString(entry))
        .filter((entry): entry is string => Boolean(entry?.trim()));
      if (evidence.length === 0) {
        issues.push(
          issue(
            "error",
            `artifact_templates.${laneName}.evidence_missing`,
            `${laneName} must list at least one starter evidence path.`,
            "examples/workspace/business/state/business-state.json",
          ),
        );
      }
      for (const evidencePath of evidence) {
        const normalized = evidencePath.replaceAll("\\", "/");
        if (exactPaths.has(normalized) || lowerExactPaths.has(normalized.toLowerCase())) {
          continue;
        }
        issues.push(
          issue(
            "error",
            `artifact_templates.${laneName}.starter_missing`,
            `${laneName} evidence ${evidencePath} has no exact starter template path. Keep state/business-state.json evidence aligned to business/ paths instead of relying on basename matches.`,
            "examples/workspace/business/state/business-state.json",
          ),
        );
      }
    }
  }
}

reportAndExit("Artifact template coverage check", issues);

interface Args {
  skillRoot: string;
  templatesRoot: string;
  statePath?: string;
}

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--skill-root"], key: "skillRoot" },
    { flags: ["--root", "--templates"], key: "templatesRoot" },
    { flags: ["--state"], key: "statePath" },
  ]);
  const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;

  return {
    skillRoot,
    templatesRoot: flagString(flags, "templatesRoot") ?? path.join(skillRoot, "examples", "workspace", "business"),
    statePath: flagString(flags, "statePath"),
  };
}

function collectTemplateFiles(root: string): string[] {
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  visit(root);
  return files;
}
