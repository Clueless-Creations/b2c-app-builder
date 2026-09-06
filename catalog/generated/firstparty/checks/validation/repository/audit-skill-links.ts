#!/usr/bin/env node
/**
 * audit-skill-links.ts — link-graph integrity for the shipped skill.
 *
 * Three gates:
 *   1. Broken local markdown links ([text](path) targets that do not exist).
 *   2. Orphaned files under knowledge/, checks/validation/repository/, examples/workspace/business/,
 *      and starters/: a shipped file that no other file mentions by relative path,
 *      basename, or ancestor directory is dead weight no agent can ever route to.
 *   3. Byte-identical duplicate files under examples/workspace/business/ (outside the
 *      archetype starters, which intentionally share scaffold files).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { collectAllFiles, collectFiles, issue, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

let skillRoot = process.cwd();
const argv = process.argv.slice(2);

for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index];
  const value = argv[index + 1];
  if ((token === "--skill-root" || token === "--root") && value) {
    skillRoot = path.resolve(value);
    index += 1;
  }
}

/** Files allowed to be unmentioned, each with a concrete reason. */
const ORPHAN_EXCLUSIONS: Record<string, string> = {};

const issues: Issue[] = [];

// ── Gate 1: broken local markdown links ─────────────────────────────────────

const markdownFiles = collectFiles(skillRoot, new Set([".md"]), 2000);
const linkPattern = /\[[^\]]*]\(([^)]+)\)/g;

for (const file of markdownFiles) {
  const text = readFileSync(file, "utf8");
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text)) !== null) {
    const rawHref = match[1]?.trim();
    if (!rawHref || rawHref.startsWith("#") || /^[a-z]+:/i.test(rawHref)) {
      continue;
    }

    const href = rawHref.split("#")[0];
    if (!href) {
      continue;
    }

    const target = path.resolve(path.dirname(file), href);
    if (!existsSync(target)) {
      issues.push(issue("error", "skill_links.broken_local_link", `Broken local markdown link: ${rawHref}`, path.relative(skillRoot, file)));
    }
  }
}

// ── Corpus for reachability: every text file that can mention a path ────────

const corpusExtensions = new Set([".md", ".ts", ".tsx", ".yaml", ".yml", ".json", ".html", ".css", ".swift", ".txt"]);
const corpus = new Map<string, string>();
for (const file of collectAllFiles(skillRoot)) {
  if (file.split(path.sep).includes("node_modules") || path.basename(file) === "package-lock.json") {
    continue;
  }
  if (!corpusExtensions.has(path.extname(file))) {
    continue;
  }
  corpus.set(file, readFileSync(file, "utf8"));
}

// ── Gate 2: orphaned canonical source files ─────────────────────────────────

/**
 * Boundary-aware containment: "lane.md" inside "sub-lane.md" is NOT a mention
 * of lane.md. A preceding path separator still counts because a longer path
 * ending in the needle references the same file.
 */
function mentionsNeedle(text: string, needle: string): boolean {
  const wordish = /[A-Za-z0-9_-]/;
  let from = 0;
  while (true) {
    const at = text.indexOf(needle, from);
    if (at === -1) {
      return false;
    }
    const before = at > 0 ? (text[at - 1] ?? "") : "";
    const after = at + needle.length < text.length ? (text[at + needle.length] ?? "") : "";
    if (!wordish.test(before) && !wordish.test(after)) {
      return true;
    }
    from = at + 1;
  }
}

function isReachable(candidate: string): boolean {
  const relative = path.relative(skillRoot, candidate).split(path.sep).join("/");
  const needles = new Set<string>([relative, path.basename(candidate)]);
  let ancestor = path.dirname(relative);
  while (ancestor.includes("/")) {
    needles.add(ancestor);
    ancestor = path.dirname(ancestor);
  }
  for (const [file, text] of corpus) {
    if (file === candidate) {
      continue;
    }
    for (const needle of needles) {
      if (text.includes(needle) && mentionsNeedle(text, needle)) {
        return true;
      }
    }
  }
  return false;
}

for (const subtree of ["knowledge", "checks/validation/repository", "examples/workspace/business", "surfaces/starters"]) {
  const subtreeRoot = path.join(skillRoot, subtree);
  if (!existsSync(subtreeRoot)) {
    continue;
  }
  for (const candidate of collectAllFiles(subtreeRoot)) {
    if (candidate.split(path.sep).includes("node_modules")) {
      continue;
    }
    const relative = path.relative(skillRoot, candidate).split(path.sep).join("/");
    if (Object.prototype.hasOwnProperty.call(ORPHAN_EXCLUSIONS, relative)) {
      continue;
    }
    if (!isReachable(candidate)) {
      issues.push(
        issue(
          "error",
          "skill_links.orphan_file",
          `${relative} is never mentioned by path, basename, or parent directory in any other shipped file — no agent can route to it. Wire it into SKILL.md/knowledge/tooling or delete it (add a reasoned ORPHAN_EXCLUSIONS entry only for deliberate exceptions).`,
          relative,
        ),
      );
    }
  }
}

// ── Gate 3: byte-identical duplicates under examples/workspace/business/ ─────────────

const duplicateGroups = new Map<string, string[]>();
const templatesRoot = path.join(skillRoot, "examples", "workspace", "business");
if (existsSync(templatesRoot)) {
  for (const file of collectAllFiles(templatesRoot)) {
    const relative = path.relative(skillRoot, file).split(path.sep).join("/");
    if (file.split(path.sep).includes("node_modules") || relative.startsWith("surfaces/starters/")) {
      continue;
    }
    if (statSync(file).size < 100) {
      continue;
    }
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
    duplicateGroups.set(hash, [...(duplicateGroups.get(hash) ?? []), relative]);
  }
  for (const paths of duplicateGroups.values()) {
    if (paths.length > 1) {
      issues.push(
        issue(
          "error",
          "skill_links.duplicate_template",
          `Byte-identical template files: ${paths.join(", ")}. Keep one canonical copy — duplicates drift apart silently.`,
          paths[0],
        ),
      );
    }
  }
}

reportAndExit("Skill local-link audit", issues);
