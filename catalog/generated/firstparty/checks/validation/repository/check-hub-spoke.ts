#!/usr/bin/env node
/**
 * check-hub-spoke.ts — bidirectional hub<->spoke routing integrity.
 *
 * Established pattern (tool-recipes.md, experience-cards.md, revenue-monetization.md):
 * a hub file carries decision/routing content, and each spoke file carries setup or
 * procedure detail and opens with a "Part of the [Hub](path)" backlink. audit-skill-links.ts
 * already catches a dangling link target and a file nothing mentions at all;
 * check-reference-size.ts already catches a knowledge/ file the generated routing index
 * can't reach. Neither catches a spoke that claims membership in a hub the hub itself does
 * not route back to -- the exact "content got restated instead of pointed-to, and the two
 * copies silently diverged" shape the 2026-08 graph-consolidation audit found in
 * revenue-monetization.md's original monolith. A spoke not listed in its own hub's routing
 * is invisible to anyone reading the hub top-down, even if some other file happens to link it.
 *
 * npm script: check:hub-spoke
 * Usage: tsx checks/validation/repository/check-hub-spoke.ts --skill-root /path/to/skill
 *
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { composeCatalog } from "../../../catalog/index.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);

const flags = parseFlags(process.argv.slice(2), [{ flags: ["--skill-root"], key: "skillRoot" }]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
const knowledgeRoot = path.join(skillRoot, "knowledge");
const issues: Issue[] = [];

// The convention a spoke file opens with, e.g. 'Part of the [Tool Recipes](../tool-recipes.md)
// index.' or 'Part of the Experience Card deck. Read [`../experience-cards.md`](../experience-cards.md)'.
// Repo-wide, only genuine hub-spoke backlinks use this phrase (verified against knowledge/ at
// the time this gate was written) -- it is not generic enough to appear in ordinary prose.
const BACKLINK_MARKER = "Part of the";
const BACKLINK_WINDOW = 400;

function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  function visit(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }
  if (existsSync(root)) {
    visit(root);
  }
  return files.sort();
}

/** The first markdown link target within BACKLINK_WINDOW chars after the first backlink marker, if any. */
function findBacklinkTarget(text: string): string | undefined {
  const markerIndex = text.indexOf(BACKLINK_MARKER);
  if (markerIndex === -1) {
    return undefined;
  }
  const window = text.slice(markerIndex, markerIndex + BACKLINK_WINDOW);
  return /]\(([^)]+)\)/.exec(window)?.[1];
}

/** Resolves a markdown link's raw target to an absolute path, dropping anchors and external links. */
function resolveLinkTarget(rawTarget: string, fromFile: string): string | undefined {
  const cleaned = rawTarget.trim().split(/\s+/)[0]?.split("#")[0];
  if (!cleaned || /^[a-z][a-z0-9+.-]*:/i.test(cleaned)) {
    return undefined;
  }
  return path.resolve(path.dirname(fromFile), cleaned);
}

const discoveredHubPaths = new Set<string>();

for (const spokeFile of collectMarkdownFiles(knowledgeRoot)) {
  const text = readFileSync(spokeFile, "utf8");
  const rawTarget = findBacklinkTarget(text);
  if (!rawTarget) {
    continue; // this file does not declare itself a spoke of anything
  }

  const hubPath = resolveLinkTarget(rawTarget, spokeFile);
  if (!hubPath || !existsSync(hubPath)) {
    // audit-skill-links.ts already reports dangling local markdown links repo-wide.
    continue;
  }
  discoveredHubPaths.add(path.relative(skillRoot, hubPath).split(path.sep).join("/"));

  const spokeRelative = path.relative(skillRoot, spokeFile).split(path.sep).join("/");
  const hubRelative = path.relative(skillRoot, hubPath).split(path.sep).join("/");
  const hubText = readFileSync(hubPath, "utf8");

  const hubLinksBackToSpoke = Array.from(hubText.matchAll(/]\(([^)]+)\)/g)).some((match) => resolveLinkTarget(match[1] ?? "", hubPath) === spokeFile);

  if (!hubLinksBackToSpoke) {
    issues.push(
      issue(
        "error",
        "hub_spoke.backlink_not_reciprocated",
        `${spokeRelative} declares itself part of the ${hubRelative} hub, but ${hubRelative} has no link back to ${spokeRelative}. A spoke missing from its own hub's routing table is invisible to anyone reading the hub top-down -- add it to the hub's spoke/routing list, or fix the backlink if the hub moved.`,
        spokeRelative,
      ),
    );
  }
}

// The catalog's `hub` flag must mean exactly what this gate enforces — a backlink-declared hub
// with real spokes — in both directions. Before this cross-check the flag was dead metadata no
// code read, and two references carried it with zero spokes anywhere (the 2026-08 contract
// audit); a flag the validator ignores is words, not work.
const catalog = composeCatalog(skillRoot);
for (const reference of catalog.references) {
  if (reference.hub && !discoveredHubPaths.has(reference.path)) {
    issues.push(
      issue(
        "error",
        "hub_spoke.catalog_hub_without_spokes",
        `${reference.id} is flagged hub:true in its knowledge manifest, but no knowledge file declares itself "${BACKLINK_MARKER}" that hub. Either add real spokes with backlinks or drop the flag.`,
        reference.path,
      ),
    );
  }
}
const flaggedHubPaths = new Set(catalog.references.filter((reference) => reference.hub).map((reference) => reference.path));
for (const hubPath of discoveredHubPaths) {
  if (!flaggedHubPaths.has(hubPath)) {
    issues.push(
      issue(
        "error",
        "hub_spoke.discovered_hub_unflagged",
        `${hubPath} has spoke files declaring membership, but its knowledge manifest is not flagged hub:true. Flag it so the catalog knows this file routes onward.`,
        hubPath,
      ),
    );
  }
}

reportAndExit("Hub-spoke backlink integrity check", issues);
