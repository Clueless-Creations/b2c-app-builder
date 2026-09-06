#!/usr/bin/env node
/**
 * check-app-archetype.ts — skill-integrity gate for the app-archetype prompt-pack layer.
 *
 * Every archetype pack under starters/ must be structurally
 * complete so a future agent (or a new archetype contributor) can rely on the
 * same shape:
 *
 *   - each archetype dir has a README.md and a prompts/ dir with >=1 prompt
 *   - every prompt file (except README.md) carries a fenced copy-paste block
 *   - the shipped `social-network` pack has its required core prompts
 *   - the social-network lane is wired: knowledge/product/social-network.md exists,
 *     SKILL.md routes to it, and the agent-behavior eval is present
 *
 * Runs against the skill root (not a generated business repo). The harness may
 * also pass a stray --root; only --skill-root is authoritative here.
 *
 * npm script: check:app-archetype
 * Usage: tsx checks/validation/business/product/check-app-archetype.ts --skill-root /path/to/skill
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

// The shipped packs and their non-negotiable wiring. Add an entry here when a new
// archetype is promoted from optional to shipped.
interface ShippedPack {
  name: string;
  requiredPrompts: string[];
  reference: string;
  eval: string;
  /** Pack ships a runnable starter scaffold (deep checks live in check-archetype-starter). */
  starter: boolean;
}
const SHIPPED_PACKS: ShippedPack[] = [
  {
    name: "social-network",
    requiredPrompts: ["01-database-schema.md", "02-auth-system.md", "03-feed-and-posts.md", "04-profiles-and-follow.md"],
    reference: "knowledge/product/social-network.md",
    eval: "checks/validation/repository/evals/agent-behavior/social-network-archetype-prompt-pack.yaml",
    starter: true,
  },
  {
    name: "ai-chat-companion",
    requiredPrompts: ["01-database-schema.md", "02-auth-system.md", "03-chat-core-loop.md", "04-model-integration.md"],
    reference: "knowledge/product/ai-chat-companion.md",
    eval: "checks/validation/repository/evals/agent-behavior/ai-chat-companion-archetype-prompt-pack.yaml",
    starter: true,
  },
  {
    name: "habit-tracker",
    requiredPrompts: ["01-database-schema.md", "02-auth-system.md", "03-habit-core-loop.md", "04-reminders-and-streaks.md"],
    reference: "knowledge/product/habit-tracker.md",
    eval: "checks/validation/repository/evals/agent-behavior/habit-tracker-archetype-prompt-pack.yaml",
    starter: true,
  },
  {
    name: "photo-ai-media",
    requiredPrompts: ["01-database-schema.md", "02-auth-system.md", "03-capture-and-library.md", "04-ai-generation-pipeline.md"],
    reference: "knowledge/product/photo-ai-media.md",
    eval: "checks/validation/repository/evals/agent-behavior/photo-ai-media-archetype-prompt-pack.yaml",
    starter: true,
  },
];

const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];
const archetypesDir = path.join(args.skillRoot, "surfaces", "starters");

if (!existsSync(archetypesDir)) {
  issues.push(
    issue(
      "error",
      "app_archetype.dir_missing",
      `surfaces/starters is missing at ${archetypesDir}. The app-archetype prompt-pack layer must exist.`,
      "surfaces/starters",
    ),
  );
} else {
  const archetypes = readdirSync(archetypesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (archetypes.length === 0) {
    issues.push(issue("error", "app_archetype.no_archetypes", "starters has no archetype packs. Add at least one (e.g. social-network).", "surfaces/starters"));
  }

  for (const name of archetypes) {
    const packDir = path.join(archetypesDir, name);
    const rel = `surfaces/starters/${name}`;

    if (!existsSync(path.join(packDir, "README.md"))) {
      issues.push(issue("error", `app_archetype.${name}.readme_missing`, `${rel} must have a README.md index.`, rel));
    }

    const promptsDir = path.join(packDir, "prompts");
    if (!existsSync(promptsDir) || !statSync(promptsDir).isDirectory()) {
      issues.push(issue("error", `app_archetype.${name}.prompts_missing`, `${rel} must have a prompts/ directory.`, rel));
      continue;
    }

    const promptFiles = collectMarkdown(promptsDir);
    const promptBasenames = new Set(promptFiles.map((file) => path.basename(file)));
    if (promptFiles.length === 0) {
      issues.push(issue("error", `app_archetype.${name}.prompts_empty`, `${rel}/prompts contains no prompt files.`, `${rel}/prompts`));
    }

    // Every prompt (not the README) must carry a fenced copy-paste block.
    for (const file of promptFiles) {
      if (path.basename(file).toLowerCase() === "readme.md") {
        continue;
      }
      const text = readFileSync(file, "utf8");
      if (!text.includes("```")) {
        const fileRel = path.relative(args.skillRoot, file);
        issues.push(
          issue(
            "error",
            `app_archetype.${name}.prompt_block_missing`,
            `${fileRel} has no fenced copy-paste prompt block. Each archetype prompt must ship a runnable prompt in a fenced block.`,
            fileRel,
          ),
        );
      }
    }

    // Required-pack contract: a shipped pack must carry its core prompts.
    const shipped = SHIPPED_PACKS.find((pack) => pack.name === name);
    if (shipped) {
      for (const required of shipped.requiredPrompts) {
        if (!promptBasenames.has(required)) {
          issues.push(
            issue(
              "error",
              `app_archetype.${name}.required_prompt_missing`,
              `${rel}/prompts is missing the required core prompt ${required}.`,
              `${rel}/prompts`,
            ),
          );
        }
      }
    }
  }
}

// Wiring for each shipped pack: the pack dir, its reference, SKILL.md routing, and the eval.
const skillPath = path.join(args.skillRoot, "SKILL.md");
const skillText = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : undefined;
if (skillText === undefined) {
  issues.push(issue("error", "app_archetype.skill_missing", "SKILL.md is missing.", "SKILL.md"));
}

for (const pack of SHIPPED_PACKS) {
  const packRel = `surfaces/starters/${pack.name}`;
  if (!existsSync(path.join(archetypesDir, pack.name))) {
    issues.push(issue("error", `app_archetype.${pack.name}.pack_missing`, `Shipped pack ${packRel} is missing.`, packRel));
  }
  if (!existsSync(path.join(args.skillRoot, pack.reference))) {
    issues.push(
      issue("error", `app_archetype.${pack.name}.reference_missing`, `${pack.reference} must exist for the shipped ${pack.name} lane.`, pack.reference),
    );
  }
  /**
   * Discoverability, not a literal SKILL.md link.
   *
   * SKILL.md routes to a domain index and the index routes to the file
   * (docs/architecture.md: the entrypoint routes and nothing else). Requiring the
   * pack's own path in SKILL.md would pull every leaf back up into the
   * entrypoint, which is the accretion the collapse just undid. What has to
   * hold is that a reachable chain exists: SKILL.md -> index -> pack.
   *
   * U11/KTD11: the per-domain `knowledge/<slug>/README.md` index this used to check for
   * is deleted at cutover (port ledger) — every domain's index is now the single
   * generated `catalog/generated/routing.md` (R20), spliced into SKILL.md's Lane Routing
   * table. The chain is therefore SKILL.md -> catalog/generated/routing.md -> pack.
   */
  const indexRelativePosix = "catalog/generated/routing.md";
  const indexPath = path.join(args.skillRoot, indexRelativePosix);
  const indexText = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : undefined;
  const packBasename = path.basename(pack.reference);
  const routedDirectly = skillText?.includes(pack.reference) ?? false;
  const routedViaIndex = (skillText?.includes(indexRelativePosix) ?? false) && (indexText?.includes(packBasename) ?? false);

  if (skillText !== undefined && !routedDirectly && !routedViaIndex) {
    issues.push(
      issue(
        "error",
        `app_archetype.${pack.name}.skill_routing_missing`,
        `${pack.name} is unreachable: SKILL.md must route to ${indexRelativePosix} and that index must link ${packBasename} (or SKILL.md must name ${pack.reference} directly).`,
        "SKILL.md",
      ),
    );
  }
  if (!existsSync(path.join(args.skillRoot, pack.eval))) {
    issues.push(
      issue(
        "error",
        `app_archetype.${pack.name}.eval_missing`,
        `${pack.eval} must exist so the detect -> AskUserQuestion -> load-pack behavior is enforced, not prose-only.`,
        pack.eval,
      ),
    );
  }
  if (pack.starter) {
    // The starter's deep contract (lockfile, RLS tests, event catalog, prompt
    // map, template safety) is enforced by check-archetype-starter; here we
    // only require that the starter exists and the pack README routes to it.
    if (!existsSync(path.join(archetypesDir, pack.name, "starter", "README.md"))) {
      issues.push(
        issue(
          "error",
          `app_archetype.${pack.name}.starter_missing`,
          `${packRel}/starter/README.md is missing. This pack ships a runnable starter scaffold; run check:archetype-starter for the full contract.`,
          `${packRel}/starter`,
        ),
      );
    }
    const packReadmePath = path.join(archetypesDir, pack.name, "README.md");
    if (existsSync(packReadmePath) && !readFileSync(packReadmePath, "utf8").includes("starter/")) {
      issues.push(
        issue(
          "error",
          `app_archetype.${pack.name}.starter_unrouted`,
          `${packRel}/README.md must route to the starter/ scaffold so agents copy it instead of improvising the wiring.`,
          `${packRel}/README.md`,
        ),
      );
    }
  }
}

reportAndExit("App archetype prompt-pack check", issues);

interface Args {
  skillRoot: string;
}

function parseArgs(argv: string[]): Args {
  // Only --skill-root is authoritative; ignore a stray --root from the fixture harness.
  const flags = parseFlags(argv, [{ flags: ["--skill-root"], key: "skillRoot" }]);
  return { skillRoot: flagString(flags, "skillRoot") ?? defaultSkillRoot };
}

function collectMarkdown(root: string): string[] {
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }
  visit(root);
  return files.sort();
}
