#!/usr/bin/env node
/**
 * check-audience-identity.ts — one object language across every surface.
 *
 * knowledge/design/audience-derived-identity.md derives visual decisions from audience facts;
 * check:design-room already enforces that table. This gate owns the OTHER half of identity:
 * the shared object language. DESIGN.md's `## Object Language` table fixes the product nouns
 * (the object map a product-leader produces before the Design Room), each with its allowed
 * terms, the terms it must never be called, and the research evidence behind it. Landing pages,
 * onboarding, the copy deck, and store copy must then use those nouns and nothing else — a
 * surface that invents a new noun is the coherence failure knowledge/orchestration/
 * full-launch-program.md's craft bar (condition 11) names.
 *
 * Mechanical rules:
 *   - the section and its table exist once DESIGN.md is accepted or the design lane is done
 *     (a warning before that, so a day-zero workspace stays green);
 *   - no placeholder rows once enforced; every object row cites strategy/RESEARCH.md evidence;
 *   - a term cannot be allowed for one object and forbidden for another;
 *   - a forbidden term found on an existing surface is always an error — that surface exists
 *     today, whatever the design status;
 *   - once enforced, an object that appears on no surface is a warning (the surfaces are
 *     speaking some other language).
 *
 * npm script: check:audience-identity
 * Usage: tsx checks/validation/business/design/check-audience-identity.ts --root /path/to/business
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { asString, collectFiles, getPath, issue, loadProjectState, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { inspectRenderedH2Section, parseRenderedPipeTables } from "../../../../kernel/lib/required-table-section.js";

const SECTION = "Object Language";
const HEADERS = ["object", "definition", "allowed terms", "do not use", "evidence"] as const;
type Header = (typeof HEADERS)[number];
const PLACEHOLDER = /^(?:not (?:defined|captured|set)|tbd|todo|pending|n\/?a|—|-)?$/i;
const EVIDENCE = /strategy\/RESEARCH\.md|\b[A-Z]{1,3}-\d{1,4}\b/;

/** Surfaces that must speak the object language. Scanned only when they exist. */
const SURFACE_FILES = ["product/copy/COPY_DECK.md", "product/ONBOARDING.md", "store/app-store-listing/APP_STORE_LISTING.md"];
const LANDING_ROOT = "growth/landing";
const LANDING_EXTENSIONS = new Set([".html", ".htm", ".md", ".tsx", ".jsx", ".astro", ".mdx"]);
/** Lines that legitimately name a forbidden term: the row that forbids it, or a table separator. */
const EXEMPT_LINE = /\b(do not use|don'?t use|avoid|banned|forbidden|never say)\b|^\s*\|\s*-{3,}/i;

interface ObjectRow {
  object: string;
  allowed: string[];
  forbidden: string[];
}

interface Surface {
  relative: string;
  lines: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string): RegExp {
  return new RegExp(`(?<![\\w-])${escapeRegExp(term)}(?![\\w-])`, "i");
}

function splitTerms(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((term) => term.trim().replace(/^`|`$/g, "").trim())
    .filter((term) => term.length > 0 && !PLACEHOLDER.test(term));
}

/**
 * DESIGN.md's `Status:` line sits in the prose after the design.md YAML frontmatter. The strict
 * evidence parser rejects the frontmatter's indented token lines, so read the status directly:
 * drop a leading `---` block, then take the first top-level `Status:` line.
 */
function designStatus(markdown: string): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "");
  return (
    body
      .match(/^Status:\s*(\S(?:.*\S)?)\s*$/mu)?.[1]
      ?.trim()
      .toLowerCase() ?? ""
  );
}

function surfaceFiles(root: string): Surface[] {
  const files: string[] = [];
  for (const relative of SURFACE_FILES) {
    const full = path.join(root, relative);
    if (existsSync(full) && statSync(full).isFile()) files.push(relative);
  }
  const landingRoot = path.join(root, LANDING_ROOT);
  if (existsSync(landingRoot) && statSync(landingRoot).isDirectory()) {
    for (const full of collectFiles(landingRoot, LANDING_EXTENSIONS)) {
      files.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return files.map((relative) => ({ relative, lines: readFileSync(path.join(root, relative), "utf8").split(/\r?\n/) }));
}

function run(): Issue[] {
  const args = parseCliArgs(process.argv.slice(2));
  const root = args.root;
  const issues: Issue[] = [];

  const loaded = loadProjectState(args);
  issues.push(...loaded.issues);
  const designLaneStatus = loaded.state ? asString(getPath(loaded.state, "lanes.design.status"))?.toLowerCase() : undefined;

  const designPath = path.join(root, "DESIGN.md");
  if (!existsSync(designPath)) {
    issues.push(issue("error", "audience_identity.design_md_missing", "DESIGN.md is missing; the object language has no home.", "DESIGN.md"));
    return issues;
  }

  const design = readFileSync(designPath, "utf8");
  const enforce = designStatus(design) === "accepted" || designLaneStatus === "succeeded";

  const view = inspectRenderedH2Section(design, SECTION);
  if (!view.ok) {
    const missing = view.errors.some((entry) => entry.kind === "section-missing");
    for (const entry of view.errors) {
      issues.push(
        issue(
          missing && !enforce ? "warning" : "error",
          missing ? "audience_identity.section_missing" : "audience_identity.table_invalid",
          missing
            ? `DESIGN.md needs a "## ${SECTION}" section with one row per product noun (Object, Definition, Allowed terms, Do not use, Evidence) before the design is accepted.`
            : `DESIGN.md "## ${SECTION}": ${entry.message}`,
          "DESIGN.md",
          entry.sourceLine ? { line: entry.sourceLine } : undefined,
        ),
      );
    }
    return issues;
  }

  for (const unsupported of view.section.unsupported) {
    issues.push(
      issue("error", "audience_identity.table_invalid", `DESIGN.md "## ${SECTION}" hides evidence behind ${unsupported.description}.`, "DESIGN.md", {
        line: unsupported.sourceLine,
      }),
    );
  }

  const tables = parseRenderedPipeTables(view.section.renderedBody);
  const table = tables.find((candidate) => HEADERS.every((header) => candidate.headers.includes(header)));
  if (!table) {
    issues.push(
      issue(
        "error",
        "audience_identity.table_invalid",
        `DESIGN.md "## ${SECTION}" needs one simple pipe table with the columns Object, Definition, Allowed terms, Do not use, Evidence.`,
        "DESIGN.md",
        { line: view.section.headingLine },
      ),
    );
    return issues;
  }

  const column = (name: Header): number => table.headers.indexOf(name);
  const cell = (cells: readonly string[], name: Header): string => cells[column(name)]?.trim() ?? "";

  const rows: ObjectRow[] = [];
  for (const cells of table.rows) {
    const object = cell(cells, "object");
    if (PLACEHOLDER.test(object) && PLACEHOLDER.test(cell(cells, "definition"))) {
      if (enforce) {
        issues.push(
          issue("error", "audience_identity.placeholder_row", `"## ${SECTION}" still carries a placeholder row; name the product's real objects.`, "DESIGN.md"),
        );
      }
      continue;
    }
    if (!EVIDENCE.test(cell(cells, "evidence"))) {
      issues.push(
        issue(
          enforce ? "error" : "warning",
          "audience_identity.object_evidence_missing",
          `Object "${object}" needs strategy/RESEARCH.md evidence (a path or evidence ID) for why the audience calls it that.`,
          "DESIGN.md",
        ),
      );
    }
    rows.push({
      object,
      allowed: [object, ...splitTerms(cell(cells, "allowed terms"))],
      forbidden: splitTerms(cell(cells, "do not use")),
    });
  }

  if (enforce && rows.length === 0) {
    issues.push(
      issue("error", "audience_identity.objects_missing", `"## ${SECTION}" names no product object; an accepted design has an object map.`, "DESIGN.md"),
    );
  }

  const allowedEverywhere = new Map<string, string>();
  for (const row of rows) for (const term of row.allowed) allowedEverywhere.set(term.toLowerCase(), row.object);
  for (const row of rows) {
    for (const term of row.forbidden) {
      const owner = allowedEverywhere.get(term.toLowerCase());
      if (owner !== undefined) {
        issues.push(
          issue(
            "error",
            "audience_identity.term_conflict",
            `"${term}" is forbidden for "${row.object}" but allowed for "${owner}"; one term names one object.`,
            "DESIGN.md",
          ),
        );
      }
    }
  }

  const surfaces = surfaceFiles(root);

  for (const row of rows) {
    for (const term of row.forbidden) {
      const pattern = termPattern(term);
      for (const surface of surfaces) {
        surface.lines.forEach((line, index) => {
          if (EXEMPT_LINE.test(line) || !pattern.test(line)) return;
          issues.push(
            issue(
              "error",
              "audience_identity.banned_term",
              `${surface.relative} says "${term}"; DESIGN.md calls that object "${row.object}". Use the object language.`,
              surface.relative,
              { line: index + 1 },
            ),
          );
        });
      }
    }
  }

  if (enforce && surfaces.length > 0) {
    for (const row of rows) {
      const used = row.allowed.some((term) => {
        const pattern = termPattern(term);
        return surfaces.some((surface) => surface.lines.some((line) => pattern.test(line)));
      });
      if (!used) {
        issues.push(
          issue(
            "warning",
            "audience_identity.object_unused",
            `Object "${row.object}" appears on none of ${surfaces.length} surface file(s); the surfaces may be speaking a different language.`,
            "DESIGN.md",
          ),
        );
      }
    }
  }

  return issues;
}

reportAndExit("Audience identity check", run());
