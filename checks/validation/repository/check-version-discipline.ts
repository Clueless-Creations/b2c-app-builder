#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { flagString, issue, isRecord, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { findGitRoot } from "../../../tooling/lib/git-root.js";

interface Args {
  repoRoot: string;
  skillRoot: string;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");
const args = parseArgs(process.argv.slice(2));
const issues: Issue[] = [];
const manifestPath = path.join(args.skillRoot, "skill-version.json");

const manifest = loadManifest(manifestPath);
if (manifest) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    issues.push(issue("error", "version_discipline.semver_invalid", "skill-version.json version must be semver-like.", manifestPath));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.updatedAt)) {
    issues.push(issue("error", "version_discipline.updated_at_invalid", "skill-version.json updatedAt must be YYYY-MM-DD.", manifestPath));
  }
  if (
    !Array.isArray(manifest.releaseNotes) ||
    manifest.releaseNotes.length < 2 ||
    manifest.releaseNotes.some((note) => typeof note !== "string" || note.trim().length < 12)
  ) {
    issues.push(
      issue(
        "error",
        "version_discipline.release_notes_thin",
        "skill-version.json needs at least two concrete release notes for this skill version.",
        manifestPath,
      ),
    );
  }
}

/**
 * Since ADR-0002 the package root is the repository root, so "the skill" is every tracked path
 * except the repository-only files that never required a version bump before the move: the
 * maintainer documentation, CI, the contributor guides, and the client entrypoint directories.
 * A skill root nested inside the repository (an older checkout, or a fixture) keeps its own
 * relative pathspec. Git rejects an empty pathspec outright, so the root case must never pass "".
 */
const REPOSITORY_ONLY_PATHS = [
  "docs",
  ".github",
  ".claude",
  ".codex",
  ".cursor",
  ".superdesign",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  ".gitignore",
  ".npmignore",
  ".nvmrc",
  ".node-version",
  ".prettierrc.json",
  ".prettierignore",
];

/** `git rev-parse --show-toplevel` returns a real path; callers may pass a symlinked one (macOS /var). */
function realPath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function skillPathspecs(gitRoot: string, skillRoot: string): string[] {
  const relative = path.relative(realPath(gitRoot), realPath(skillRoot));
  if (relative && relative !== ".") {
    // A nested skill root has its own README/docs/etc. that are repository-only for IT, same as
    // the root-layout case below — otherwise #30 (a docs-only branch wrongly counted as ahead of
    // the skill) still reproduces here, just scoped under the nested skill's own directory.
    return [relative, ...REPOSITORY_ONLY_PATHS.map((entry) => `:(exclude)${path.join(relative, entry)}`)];
  }
  return [".", ...REPOSITORY_ONLY_PATHS.map((entry) => `:(exclude)${entry}`)];
}

const gitRoot = findGitRoot(args.repoRoot);
if (gitRoot) {
  const skillSpecs = skillPathspecs(gitRoot, args.skillRoot);
  const relativeManifest = path.relative(realPath(gitRoot), realPath(manifestPath));
  const gitOutput = (argv: string[]): string => {
    const result = git(argv, gitRoot);
    if (result.status !== 0) {
      issues.push(issue("error", "version_discipline.git_failed", `git ${argv.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`, relativeManifest));
      return "";
    }
    return result.stdout.trim();
  };
  const changed = new Set(
    [
      ...gitOutput(["diff", "--name-only", "--", ...skillSpecs]).split(/\r?\n/),
      ...gitOutput(["diff", "--cached", "--name-only", "--", ...skillSpecs]).split(/\r?\n/),
    ].filter(Boolean),
  );
  const pendingManifestChanged = changed.has(relativeManifest);
  const latestSkillCommit = gitOutput(["log", "-1", "--format=%H", "--", ...skillSpecs]);
  const latestManifestCommit = gitOutput(["log", "-1", "--format=%H", "--", relativeManifest]);

  if (latestSkillCommit && latestManifestCommit && latestSkillCommit !== latestManifestCommit && !pendingManifestChanged) {
    issues.push(
      issue(
        "error",
        "version_discipline.manifest_not_latest",
        "The latest commit touching the skill did not also touch skill-version.json. Bump the version/release notes in the same commit as skill behavior changes.",
        relativeManifest,
      ),
    );
  }

  monotonicityCheck(gitRoot, relativeManifest, manifest?.version, changed.size > 0, skillSpecs);

  const meaningfulChanges = Array.from(changed).filter((file) => !file.endsWith("skill-version.json") && !file.includes("/node_modules/"));
  if (meaningfulChanges.length > 0 && !changed.has(relativeManifest)) {
    issues.push(
      issue(
        "error",
        "version_discipline.pending_manifest_update_missing",
        `Pending skill changes require a matching skill-version.json update. Changed examples: ${meaningfulChanges.slice(0, 5).join(", ")}`,
        relativeManifest,
      ),
    );
  }
}

reportAndExit("Skill version discipline check", issues);

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--repo-root"], key: "repoRoot" },
    { flags: ["--skill-root"], key: "skillRoot" },
  ]);

  return {
    repoRoot: flagString(flags, "repoRoot") ?? process.cwd(),
    skillRoot: flagString(flags, "skillRoot") ?? defaultSkillRoot,
  };
}

function loadManifest(filePath: string): { version: string; updatedAt: string; releaseNotes: unknown } | undefined {
  if (!existsSync(filePath)) {
    issues.push(issue("error", "version_discipline.manifest_missing", "skill-version.json is required.", filePath));
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isRecord(parsed)) {
      issues.push(issue("error", "version_discipline.manifest_invalid", "skill-version.json must be an object.", filePath));
      return undefined;
    }
    const version = typeof parsed.version === "string" ? parsed.version : "";
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
    return { version, updatedAt, releaseNotes: parsed.releaseNotes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(issue("error", "version_discipline.manifest_parse_error", `skill-version.json is invalid JSON: ${message}`, filePath));
    return undefined;
  }
}

function git(argv: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", argv, { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/**
 * The version must move FORWARD relative to the branch point (#147).
 *
 * Nothing else in the repository asserts this. Every other code this file raises — semver_invalid,
 * updated_at_invalid, manifest_missing, manifest_invalid, manifest_parse_error, manifest_not_latest,
 * pending_manifest_update_missing — is a shape or presence check, and check-skill-version.ts compares
 * source against INSTALLED RUNTIMES rather than the merge base. `semver_invalid` is the trap: it only
 * asserts the string is semver-SHAPED, so scanning the error list it reads like a version check.
 *
 * The gap is not theoretical. On 2026-09-06 four lanes released in parallel and hand-passed version
 * numbers between sessions; main moved 0.217.2 -> .3 -> .4 -> 0.218.0 -> .2 -> .3 while branches held
 * numbers chosen minutes earlier. A branch sat at 0.218.1 after main had reached 0.218.2, and only a
 * manual `git show origin/main:skill-version.json` caught it. Merging it would have moved main
 * backwards with every gate green.
 *
 * Unresolvable base is a WARNING, never an error: a fixture repository, a shallow clone, a fork with
 * no upstream remote and the initial commit itself all legitimately have nothing to compare against,
 * and this check must not turn those into failures.
 */
function monotonicityCheck(
  gitRoot: string,
  relativeManifest: string,
  currentVersion: string | undefined,
  hasPendingChanges: boolean,
  skillSpecs: string[],
): void {
  if (!currentVersion) return;

  const base = resolveComparisonBase(gitRoot);
  if (!base) {
    issues.push(
      issue(
        "warning",
        "version_discipline.base_unresolvable",
        "No upstream base commit to compare the version against; monotonicity was not checked. Expected in a fixture repository, a shallow clone, or before the first upstream commit.",
        relativeManifest,
      ),
    );
    return;
  }

  // A checkout sitting ON the base with nothing pending is not "behind" — it IS the base, and its
  // version legitimately equals the base's. Comparing there would fail a clean main checkout against
  // itself. Only a branch that introduces something must move the number forward.
  //
  // "Ahead" must be scoped to skillSpecs (#30): unscoped, a branch whose only committed change is a
  // REPOSITORY_ONLY_PATHS file (README.md, AGENTS.md, ...) still counted as commits ahead, forcing a
  // version bump on documentation-only branches even though the skill itself never changed.
  const ahead = git(["rev-list", "--count", `${base}..HEAD`, "--", ...skillSpecs], gitRoot);
  const commitsAhead = ahead.status === 0 ? Number(ahead.stdout.trim()) : 0;
  if (!hasPendingChanges && (!Number.isFinite(commitsAhead) || commitsAhead === 0)) return;

  const shown = git(["show", `${base}:${relativeManifest}`], gitRoot);
  if (shown.status !== 0) return;
  let baseVersion: string | undefined;
  try {
    const parsed: unknown = JSON.parse(shown.stdout);
    if (isRecord(parsed) && typeof parsed.version === "string") baseVersion = parsed.version;
  } catch {
    return;
  }
  if (!baseVersion) return;

  if (compareSemver(currentVersion, baseVersion) <= 0) {
    issues.push(
      issue(
        "error",
        "version_discipline.version_not_ahead_of_base",
        `skill-version.json is ${currentVersion}, which does not move forward from ${baseVersion} at the merge base. Re-read \`git show origin/main:skill-version.json\` and take that version plus one; a number chosen before another branch merged is already stale.`,
        relativeManifest,
      ),
    );
  }
}

/** The merge base with the upstream trunk, or undefined when there is nothing to compare against. */
function resolveComparisonBase(gitRoot: string): string | undefined {
  for (const ref of ["origin/main", "main", "origin/HEAD"]) {
    const verified = git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], gitRoot);
    if (verified.status !== 0 || !verified.stdout.trim()) continue;
    const mergeBase = git(["merge-base", "HEAD", ref], gitRoot);
    if (mergeBase.status === 0 && mergeBase.stdout.trim()) return mergeBase.stdout.trim();
  }
  return undefined;
}

/** Numeric major.minor.patch ordering; a prerelease suffix does not make a version "ahead". */
function compareSemver(left: string, right: string): number {
  const parse = (value: string): number[] => {
    const core = value.split(/[-+]/u)[0] ?? "";
    const parts = core.split(".").map((piece) => Number(piece));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}
