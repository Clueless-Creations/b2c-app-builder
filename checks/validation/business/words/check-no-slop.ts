#!/usr/bin/env node
/**
 * check-no-slop.ts — the repo's own front door follows the writing standard it ships.
 *
 * knowledge/words/no-slop-writing.md §2 names a "third surface" this file's rules cover
 * beyond founder-facing and generated marketing copy: the repo's own public docs. The
 * enforcement primitives (banned words, mechanical slop patterns, the em-dash budget) have
 * lived in tooling/lib/no-slop-rules.ts since they were built for check:app-copy, but
 * nothing ever pointed them at this third surface — a skill that ships a writing standard
 * and exempts its own front door from it is enforcing words rather than work.
 *
 * Two severity tiers, both from the reference's own text: README.md, CONTRIBUTING.md,
 * SECURITY.md, and CODE_OF_CONDUCT.md are the repo's public face and fail the gate.
 * AGENTS.md and CLAUDE.md are maintainer-only guidance — a slip there gets a warning, not
 * a blocked merge. Empty adverbs and empty phrases stay warnings on every file regardless
 * of tier, matching their documented advisory nature in no-slop-rules.ts: they are cut when
 * they add nothing and kept when they carry real emphasis, which is a judgment call this
 * gate cannot make, only flag.
 *
 * npm script: check:no-slop
 * Usage: tsx checks/validation/business/words/check-no-slop.ts [--repo-root /path] [--skill-root /path] [--skip-repo-front-door]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flagBoolean, flagString, issue, parseFlags, reportAndExit, type Issue, type Severity } from "../../../../tooling/lib/launch-state.js";
import { findGitRoot } from "../../../../tooling/lib/git-root.js";
import { emDashProblem, loadNoSlopRules, matchesTerm, slopPatterns } from "../../../../tooling/lib/no-slop-rules.js";
import { communityHealthPaths, frontDoorPolicyFor } from "../../../../catalog/repository-profiles/registry.js";
import { readAcceptedRepositoryProfile } from "../../../../catalog/repository-profiles/workspace.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--repo-root"], key: "repoRoot" },
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--skip-repo-front-door"], key: "skipRepoFrontDoor", kind: "boolean" },
]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const repoRoot = path.resolve(flagString(flags, "repoRoot") ?? findGitRoot(skillRoot) ?? path.resolve(skillRoot, "../.."));
const skipRepoFrontDoor = flagBoolean(flags, "skipRepoFrontDoor");
const acceptedProfile = readAcceptedRepositoryProfile(repoRoot);
const frontDoorPolicy = acceptedProfile ? frontDoorPolicyFor(acceptedProfile.id) : { requireReadme: true, requireCommunityHealth: true };
const communityFiles = new Set(communityHealthPaths());

const issues: Issue[] = [];

/**
 * The third surface, verbatim from knowledge/words/no-slop-writing.md §2. SECURITY.md and
 * CODE_OF_CONDUCT.md live under .github/ — GitHub's standard community-health-file
 * location — while the other four sit at the repo root.
 */
const publicFrontDoor: { relative: string; tier: Severity }[] = [
  { relative: "README.md", tier: "error" },
  { relative: "CONTRIBUTING.md", tier: "error" },
  { relative: ".github/SECURITY.md", tier: "error" },
  { relative: ".github/CODE_OF_CONDUCT.md", tier: "error" },
  { relative: "AGENTS.md", tier: "warning" },
  { relative: "CLAUDE.md", tier: "warning" },
];

const referencePath = path.join(skillRoot, "knowledge/words/no-slop-writing.md");
const rules = loadNoSlopRules(referencePath);

for (const surface of skipRepoFrontDoor ? [] : publicFrontDoor) {
  const absolute = path.join(repoRoot, surface.relative);
  if (!existsSync(absolute)) {
    const skipReadme = surface.relative === "README.md" && !frontDoorPolicy.requireReadme;
    const skipCommunity = communityFiles.has(surface.relative) && !frontDoorPolicy.requireCommunityHealth;
    if (skipReadme || skipCommunity) continue;
    issues.push(
      issue(
        "error",
        "no_slop.front_door_missing",
        `${surface.relative} is part of the repo's public front door per knowledge/words/no-slop-writing.md §2 but does not exist at ${absolute}.`,
        surface.relative,
      ),
    );
    continue;
  }
  const source = readFileSync(absolute, "utf8");
  const scannable = proseText(source);

  for (const word of rules.bannedWords) {
    if (!matchesTerm(scannable, word)) continue;
    issues.push(
      issue(
        surface.tier,
        "no_slop.banned_word",
        `"${word}" is banned outright by no-slop-writing.md §4. Cut it or use the plain word it stands in for.`,
        surface.relative,
      ),
    );
  }

  for (const pattern of slopPatterns) {
    if (!pattern.pattern.test(scannable)) continue;
    const severity: Severity = surface.tier === "warning" ? "warning" : pattern.severity;
    issues.push(issue(severity, `no_slop.pattern.${pattern.id}`, `${pattern.problem} ${pattern.fix}`, surface.relative));
  }

  for (const adverb of rules.emptyAdverbs) {
    if (!matchesTerm(scannable, adverb)) continue;
    issues.push(
      issue(
        "warning",
        "no_slop.empty_adverb",
        `"${adverb}" is an often-empty adverb (no-slop-writing.md §4). Cut it unless it carries real emphasis.`,
        surface.relative,
      ),
    );
  }

  for (const phrase of rules.emptyPhrases) {
    if (!matchesTerm(scannable, phrase)) continue;
    issues.push(
      issue(
        "warning",
        "no_slop.empty_phrase",
        `"${phrase}" is an often-empty phrase (no-slop-writing.md §4). Cut it unless it earns its place.`,
        surface.relative,
      ),
    );
  }

  const emDash = emDashProblem(scannable, false);
  if (emDash) {
    issues.push(issue("warning", "no_slop.em_dash_overuse", emDash, surface.relative));
  }
}

reportAndExit("No-slop: repo front door", issues);

/**
 * Prose a reader actually reads: drops fenced and inline code (command names, file paths,
 * and env vars are not writing slop), HTML comments, and link targets (a URL segment like
 * "cutting-edge-features" is not the writer's prose). Link text is kept — it is real
 * sentence content the reader sees.
 */
function proseText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\]\([^)]*\)/g, "] ");
}
