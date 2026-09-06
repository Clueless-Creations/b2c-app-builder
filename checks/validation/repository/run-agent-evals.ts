#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { asArray, asString, flagString, isRecord, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "../../..");
const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];

if (!existsSync(args.evalDir)) {
  issues.push(issue("error", "agent_evals.dir_missing", `Agent behavior eval directory is missing: ${args.evalDir}`, args.evalDir));
} else {
  const files = readdirSync(args.evalDir)
    .filter((file) => file.endsWith(".yaml"))
    .sort();
  if (files.length < 4) {
    issues.push(
      issue(
        "error",
        "agent_evals.too_few",
        "Add at least four agent behavior evals covering stale skill, CE routing, Design Room, onboarding, and provider proof.",
        args.evalDir,
      ),
    );
  }

  requirePinnedEval(args.evalDir, "session-continuity-resume.yaml", [
    "session-continuity-resume",
    "Session Continuity",
    "state/business-state.json",
    "operations/ORCHESTRATION.md",
    "engineering/PRODUCTION_READINESS.md",
    "operations/FAILURE_CARDS.md",
    "git status --short",
    "APP_AGENTS.md",
    "chat memory is not source truth",
  ]);

  for (const file of files) {
    const fullPath = path.join(args.evalDir, file);
    const parsed = parseYaml(readFileSync(fullPath, "utf8"));
    if (!isRecord(parsed)) {
      issues.push(issue("error", "agent_evals.invalid_yaml", `${file} must parse to an object.`, fullPath));
      continue;
    }

    for (const field of ["id", "title", "prompt", "expected_route"]) {
      if (!asString(parsed[field])?.trim()) {
        issues.push(issue("error", `agent_evals.${file}.${field}.missing`, `${file} is missing ${field}.`, fullPath));
      }
    }

    for (const field of ["must_use", "must_catch", "should_say", "forbidden"]) {
      if (asArray(parsed[field]).length === 0) {
        issues.push(issue("error", `agent_evals.${file}.${field}.missing`, `${file} must include at least one ${field} assertion.`, fullPath));
      }
    }

    const responseText = args.responsesDir ? readResponse(args.responsesDir, asString(parsed.id) ?? path.basename(file, ".yaml")) : undefined;
    if (responseText !== undefined) {
      for (const item of [...asArray(parsed.must_use), ...asArray(parsed.must_catch), ...asArray(parsed.should_say)]) {
        const text = asString(item);
        if (text && !responseText.toLowerCase().includes(text.toLowerCase())) {
          issues.push(issue("error", `agent_evals.${file}.response_missing`, `Response fixture must include ${text}.`, fullPath));
        }
      }
      for (const item of asArray(parsed.forbidden)) {
        const text = asString(item);
        if (text && responseText.toLowerCase().includes(text.toLowerCase())) {
          issues.push(issue("error", `agent_evals.${file}.response_forbidden`, `Response fixture must not include ${text}.`, fullPath));
        }
      }
    }
  }
}

reportAndExit("Agent behavior eval check", issues);

interface Args {
  evalDir: string;
  responsesDir?: string;
}

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--eval-dir", "--root"], key: "evalDir" },
    { flags: ["--responses"], key: "responsesDir" },
  ]);

  return {
    evalDir: flagString(flags, "evalDir") ?? path.join(skillRoot, "checks/validation/repository/evals/agent-behavior"),
    responsesDir: flagString(flags, "responsesDir"),
  };
}

function readResponse(responsesDir: string, id: string): string | undefined {
  const responsePath = path.join(responsesDir, `${id}.md`);
  return existsSync(responsePath) ? readFileSync(responsePath, "utf8") : undefined;
}

function requirePinnedEval(evalDir: string, fileName: string, terms: string[]): void {
  const fullPath = path.join(evalDir, fileName);
  if (!existsSync(fullPath)) {
    issues.push(issue("error", `agent_evals.${fileName}.missing`, `${fileName} is required to cover continuity drift.`, fullPath));
    return;
  }

  const text = readFileSync(fullPath, "utf8");
  for (const term of terms) {
    if (!text.includes(term)) {
      issues.push(issue("error", `agent_evals.${fileName}.term_missing`, `${fileName} must include ${term}.`, fullPath));
    }
  }
}
