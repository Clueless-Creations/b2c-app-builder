#!/usr/bin/env node
/**
 * check-roster-overlap.ts
 *
 * Mechanical counterpart to the roster near-duplicate-role review: computes pairwise Jaccard
 * similarity (intersection of word sets over union) on each pair of specialist role files' own
 * objective and ownership text, and flags a pair above the threshold as a possible duplicate role
 * that should collapse into one. This is a warning, not an error -- overlap is a prompt for human
 * review, not proof that two roles are redundant on its own (two roles can legitimately touch the
 * same domain from different angles).
 *
 * Per role file (examples/workspace/business/engineering/app-agent-roster/agents/*.md):
 *   - objective text: the mission sentence introduced by "You are/own/keep ... {{APP_NAME}}", or an
 *     "Objective:" line when a prompt has no {{APP_NAME}} sentence (operator-readiness.md)
 *   - ownership text: the bullet list directly under an "Own:", "Review:", "Inspect and record:", or
 *     "Use one of these modes in each assignment:" heading -- the closest thing each role file has
 *     to a scope statement
 *
 * npm script: check:agent-roster (not yet wired -- see integration notes)
 * Usage: tsx checks/validation/business/engineering/check-roster-overlap.ts --root <business-root> [--json]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { issue, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { skillRoot } from "../../../../tooling/lib/design-state.js";

const THRESHOLD = 0.5;

const OWNERSHIP_HEADERS = ["Own:", "Review:", "Inspect and record:", "Use one of these modes in each assignment:"];

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "over",
  "under",
  "your",
  "you",
  "are",
  "own",
  "not",
  "use",
  "when",
  "each",
  "one",
  "only",
  "does",
  "will",
  "can",
  "may",
  "must",
  "app_name",
]);

function parseRoot(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root" && argv[index + 1]) {
      return path.resolve(argv[index + 1] as string);
    }
  }
  return path.join(skillRoot, "examples", "workspace", "business");
}

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/\{\{[^}]*\}\}/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return new Set(words);
}

/** The mission sentence plus the ownership bullet list directly under it, per role file. */
function extractObjectiveAndOwnership(text: string): string {
  const lines = text.split("\n");

  const objectiveLine =
    lines.find((line) => /^You\s/.test(line.trim()) && /\{\{APP_NAME\}\}/.test(line)) ?? lines.find((line) => line.trim().startsWith("Objective:"));

  const ownership: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!OWNERSHIP_HEADERS.includes((lines[index] ?? "").trim())) {
      continue;
    }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = (lines[cursor] ?? "").trim();
      if (candidate === "") {
        continue;
      }
      if (!candidate.startsWith("- ")) {
        break;
      }
      ownership.push(candidate);
    }
    break;
  }

  return [objectiveLine ?? "", ...ownership].join("\n");
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) {
      intersection += 1;
    }
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const root = parseRoot(process.argv.slice(2));
const agentsDir = path.join(root, "engineering", "app-agent-roster", "agents");
const issues: Issue[] = [];

if (!existsSync(agentsDir)) {
  issues.push(issue("error", "roster_overlap.agents_dir_missing", `Roster agents directory is missing at ${agentsDir}.`, path.relative(root, agentsDir)));
} else {
  const files = readdirSync(agentsDir)
    .filter((name) => name.endsWith(".md"))
    .sort();

  const profiles = files.map((name) => {
    const text = readFileSync(path.join(agentsDir, name), "utf8");
    return { name, tokens: tokenize(extractObjectiveAndOwnership(text)) };
  });

  for (let i = 0; i < profiles.length; i += 1) {
    for (let j = i + 1; j < profiles.length; j += 1) {
      const left = profiles[i]!;
      const right = profiles[j]!;
      const similarity = jaccard(left.tokens, right.tokens);
      if (similarity <= THRESHOLD) {
        continue;
      }
      const overlap = [...left.tokens].filter((word) => right.tokens.has(word)).sort();
      issues.push(
        issue(
          "warning",
          "roster_overlap.jaccard_similarity_high",
          `${left.name} and ${right.name} share ${(similarity * 100).toFixed(0)}% of their objective/ownership terms (over the ${(THRESHOLD * 100).toFixed(
            0,
          )}% threshold): ${overlap.join(", ")}. Review whether one role should absorb the other.`,
          path.relative(root, agentsDir),
        ),
      );
    }
  }
}

reportAndExit("Roster overlap check", issues);
