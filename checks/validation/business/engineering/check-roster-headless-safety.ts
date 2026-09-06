#!/usr/bin/env node
/**
 * check-roster-headless-safety.ts
 *
 * Every specialist role file (examples/workspace/business/engineering/app-agent-roster/agents/*.md) is
 * dispatched headlessly by the orchestrator -- no person watches the run. Human-in-the-loop
 * language ("ask the user", "wait for approval", "confirm before", "if unsure, ask") would stall
 * or silently return nothing under that dispatch pattern instead of returning the structured
 * "Risks and blockers: needs_context" handoff the roster's Operating Rules require. Fails on any
 * match.
 *
 * npm script: check:agent-roster-headless-safety (not yet wired -- see integration notes)
 * Usage: tsx checks/validation/business/engineering/check-roster-headless-safety.ts --root <business-root> [--json]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { issue, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { skillRoot } from "../../../../tooling/lib/design-state.js";

const FORBIDDEN_PHRASES = ["ask the user", "wait for approval", "confirm before", "if unsure, ask"];

function parseRoot(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root" && argv[index + 1]) {
      return path.resolve(argv[index + 1] as string);
    }
  }
  return path.join(skillRoot, "examples", "workspace", "business");
}

function phraseCode(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const root = parseRoot(process.argv.slice(2));
const agentsDir = path.join(root, "engineering", "app-agent-roster", "agents");
const issues: Issue[] = [];

if (!existsSync(agentsDir)) {
  issues.push(
    issue("error", "roster_headless_safety.agents_dir_missing", `Roster agents directory is missing at ${agentsDir}.`, path.relative(root, agentsDir)),
  );
} else {
  const files = readdirSync(agentsDir)
    .filter((name) => name.endsWith(".md"))
    .sort();

  for (const name of files) {
    const filePath = path.join(agentsDir, name);
    const lower = readFileSync(filePath, "utf8").toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      if (!lower.includes(phrase)) {
        continue;
      }
      issues.push(
        issue(
          "error",
          `roster_headless_safety.${phraseCode(phrase)}`,
          `${name} contains human-in-the-loop language ("${phrase}"). A headlessly dispatched specialist must return "Risks and blockers: needs_context" with the missing item instead of waiting on a person.`,
          path.relative(root, filePath),
        ),
      );
    }
  }
}

reportAndExit("Roster headless safety check", issues);
