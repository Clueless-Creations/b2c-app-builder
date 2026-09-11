#!/usr/bin/env node
/**
 * check-agent-entrypoints — the three-scope routing and thin-adapter contract for agent-facing
 * files (ADR-0007).
 *
 * Canonical authored guides: the root AGENTS.md and SKILL.md, the two routers under agents/skills/,
 * and the workspace AGENTS.md template. Thin adapters: the root CLAUDE.md, the template CLAUDE.md,
 * and the template Cursor rule. Generated surfaces are covered by their own renderers.
 *
 * Gates:
 *   1. The root AGENTS.md names all three routers, and agents/skills/README.md lists all three skills.
 *   2. An adapter points at AGENTS.md, shares no `##` heading with its canonical guide, and repeats
 *      no canonical line of prose verbatim.
 *   3. A workspace-facing file (the template AGENTS.md, CLAUDE.md, and Cursor rule) names no ARCH
 *      rule, roadmap unit, builder repository path, contributor command, or maintainer procedure.
 *
 * This is a repository-only check. An installed skill does not contain the root adapters or
 * agents/skills/, so the runtime audit must not run it.
 *
 * Default repo root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 *
 * npm script: check:agent-entrypoints
 * Usage: tsx checks/validation/repository/check-agent-entrypoints.ts --repo-root /path/to/repo
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultRepoRoot = resolveSkillRoot(import.meta.url);

const flags = parseFlags(process.argv.slice(2), [{ flags: ["--repo-root"], key: "repoRoot" }]);
const repoRoot = flagString(flags, "repoRoot") ?? defaultRepoRoot;

const TEMPLATE = "surfaces/workspace-template/repo-agent-entrypoints";
const ROOT_GUIDE = "AGENTS.md";
const ROUTERS = ["SKILL.md", "agents/skills/b2c-contributor/SKILL.md", "agents/skills/b2c-maintainer/SKILL.md"] as const;
const SKILL_INDEX = "agents/skills/README.md";
const SKILL_NAMES = ["b2c-app-builder", "b2c-contributor", "b2c-maintainer"] as const;
const TEMPLATE_GUIDE = `${TEMPLATE}/AGENTS.md`;
const CANONICAL = [ROOT_GUIDE, ...ROUTERS, TEMPLATE_GUIDE, SKILL_INDEX] as const;
const ADAPTERS: ReadonlyArray<{ file: string; canonical: string }> = [
  { file: "CLAUDE.md", canonical: ROOT_GUIDE },
  { file: `${TEMPLATE}/CLAUDE.md`, canonical: TEMPLATE_GUIDE },
  { file: `${TEMPLATE}/.cursor/rules/agents.mdc`, canonical: TEMPLATE_GUIDE },
];
const WORKSPACE_FACING = [TEMPLATE_GUIDE, `${TEMPLATE}/CLAUDE.md`, `${TEMPLATE}/.cursor/rules/agents.mdc`] as const;
const POINTER = "Read `AGENTS.md` first";
/** Shorter lines (a bare command, a short bullet) are legitimately shared; a restated paragraph is not. */
const PROSE_MIN_LENGTH = 60;

/** Builder-internal vocabulary that a consumer-app agent must never be asked to follow. */
const INTERNAL_REFERENCES: ReadonlyArray<{ pattern: RegExp; what: string }> = [
  { pattern: /\bARCH-\d+\b/u, what: "an architecture rule ID" },
  { pattern: /\b(?:roadmap|unit|units)\s+U\d+\b/u, what: "a roadmap unit" },
  { pattern: /(?<![\w+])U\d{1,2}(?!\w)/u, what: "a roadmap unit" },
  { pattern: /\bdocs\/(?:plans|decisions|north-star-architecture|architecture-conformance)\b/u, what: "a builder architecture document" },
  { pattern: /(?:^|[\s`(])(?:kernel|catalog|checks|contracts|tooling|adapters|entrypoints|hosted|knowledge|surfaces)\//u, what: "a builder repository path" },
  { pattern: /\bb2c contribute\b|\bagents\/skills\//u, what: "contributor machinery" },
  { pattern: /\bupstream-check\b|\bupgrade-plan\b|\brender:credits\b|\bcheck:upstreams\b|\bcheck:credits\b/u, what: "an upstream-maintenance procedure" },
];

const issues: Issue[] = [];
const texts = new Map<string, string>();

function read(relative: string): string | undefined {
  const cached = texts.get(relative);
  if (cached !== undefined) return cached;
  const absolute = path.join(repoRoot, relative);
  if (!existsSync(absolute)) return undefined;
  const text = readFileSync(absolute, "utf8");
  texts.set(relative, text);
  return text;
}

function headings(text: string): Set<string> {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^##\s+(.+?)\s*$/u.exec(line);
    if (match) found.add(match[1]!.toLowerCase());
  }
  return found;
}

/** Trim, drop a list marker, and collapse whitespace so a re-wrapped bullet still matches. */
function normalizeProse(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*+]|\d+\.)\s+/u, "")
    .replace(/\s+/gu, " ");
}

function proseLines(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map(normalizeProse)
    .filter((line) => line.length >= PROSE_MIN_LENGTH && !line.startsWith("#") && !line.startsWith("|"));
}

// Gate 0: every canonical guide exists.
for (const relative of CANONICAL) {
  if (read(relative) === undefined) {
    issues.push(issue("error", "agent_entrypoints.canonical_missing", `Canonical agent guide is missing: ${relative}.`, relative));
  }
}

// Gate 1: the root guide routes to all three scopes, and the skill index lists all three skills.
const rootGuide = read(ROOT_GUIDE);
if (rootGuide !== undefined) {
  for (const router of ROUTERS) {
    if (!rootGuide.includes(router)) {
      issues.push(
        issue(
          "error",
          "agent_entrypoints.scope_router_missing",
          `${ROOT_GUIDE} must route to every scope; it does not name the router ${router}.`,
          ROOT_GUIDE,
          { fixHint: "Keep the three-scope table (business, contribution, maintenance) at the top of AGENTS.md." },
        ),
      );
    }
  }
}
const skillIndex = read(SKILL_INDEX);
if (skillIndex !== undefined) {
  for (const name of SKILL_NAMES) {
    if (!skillIndex.includes(`\`${name}\``)) {
      issues.push(issue("error", "agent_entrypoints.skill_index_incomplete", `${SKILL_INDEX} must list the ${name} skill.`, SKILL_INDEX));
    }
  }
}

// Gate 2: adapters point at the canonical guide and restate nothing from it.
for (const adapter of ADAPTERS) {
  const text = read(adapter.file);
  if (text === undefined) {
    issues.push(issue("error", "agent_entrypoints.adapter_missing", `Thin adapter is missing: ${adapter.file}.`, adapter.file));
    continue;
  }
  if (!text.includes(POINTER)) {
    issues.push(
      issue(
        "error",
        "agent_entrypoints.adapter_pointer_missing",
        `${adapter.file} must open with "${POINTER}" and add only host-specific notes.`,
        adapter.file,
      ),
    );
  }
  const canonical = read(adapter.canonical);
  if (canonical === undefined) continue;
  const canonicalHeadings = headings(canonical);
  for (const heading of headings(text)) {
    if (canonicalHeadings.has(heading)) {
      issues.push(
        issue(
          "error",
          "agent_entrypoints.adapter_duplicates_heading",
          `${adapter.file} restates the "${heading}" section of ${adapter.canonical}. Point at the canonical guide instead of copying its section.`,
          adapter.file,
        ),
      );
    }
  }
  const canonicalProse = new Set(proseLines(canonical));
  for (const line of proseLines(text)) {
    if (canonicalProse.has(line)) {
      issues.push(
        issue(
          "error",
          "agent_entrypoints.adapter_duplicates_prose",
          `${adapter.file} repeats a line of ${adapter.canonical} verbatim: "${line.slice(0, 80)}". Link to the canonical guide instead.`,
          adapter.file,
        ),
      );
    }
  }
}

// Gate 3: workspace-facing files carry no builder-internal vocabulary.
for (const relative of WORKSPACE_FACING) {
  const text = read(relative);
  if (text === undefined) continue;
  text.split(/\r?\n/u).forEach((line, index) => {
    for (const reference of INTERNAL_REFERENCES) {
      const match = reference.pattern.exec(line);
      if (!match) continue;
      issues.push(
        issue(
          "error",
          "agent_entrypoints.internal_reference",
          `${relative}:${index + 1} names ${reference.what} ("${match[0].trim()}"). A business workspace receives public operations, contracts, providers, recipes, and evidence requirements only.`,
          relative,
          { line: index + 1 },
        ),
      );
      break;
    }
  });
}

reportAndExit("Agent entrypoint contract check", issues);
