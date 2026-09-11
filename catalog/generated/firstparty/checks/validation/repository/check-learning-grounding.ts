#!/usr/bin/env node
/**
 * check-learning-grounding.ts — grounding contract for captured learnings.
 *
 * Learnings live at knowledge/<domain>/learnings/<slug>.md and register as
 * ordinary knowledge packages, so lifecycle, bindings, load_when, and the
 * unregistered-file sweep already apply. What nothing else enforces is the
 * grounding discipline this gate owns: a learning is only durable when its
 * claims cite evidence that still resolves. A learning whose cited file or
 * line is gone is exactly the stale note that misleads the next run — the
 * failure mode the refresh verdicts exist to catch.
 *
 * Rules (knowledge/process/learning-capture.md is the authored contract):
 * - required sections: Learning (non-empty), Evidence, Captured, Refresh
 * - every Evidence table row needs a backticked repo-relative citation in that
 *   row, and every citation must resolve (file exists; a :line suffix stays
 *   within the file and anchors a non-blank line)
 * - Captured carries a labeled YYYY-MM-DD date
 * - Refresh carries a labeled last-reviewed date (not before the captured
 *   date) and a verdict: kept | updated | consolidated | replaced | retired
 * - replaced/retired verdicts require the manifest lifecycle to be deprecated,
 *   and a deprecated learning must not claim kept/updated
 * - a learning-shaped package (reference.<domain>.learnings.*) must keep its
 *   document under knowledge/<domain>/learnings/ so this sweep can see it
 * - a learning last reviewed more than REVIEW_CADENCE_DAYS ago is flagged as
 *   a warning for the learning-corpus-refresh node to work down
 *
 * Draft-lifecycle learnings (a fresh `knowledge:capture` scaffold) downgrade
 * the content-quality rules to warnings so scaffolding does not break the
 * audit; registration and lifecycle-pairing stay hard errors. Promotion to
 * active restores every rule to an error.
 *
 * npm script: check:learning-grounding
 * Usage: tsx checks/validation/repository/check-learning-grounding.ts --skill-root /path/to/skill
 *
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue, type Severity } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);

const REVIEW_CADENCE_DAYS = 180;
const REQUIRED_SECTIONS = ["Learning", "Evidence", "Captured", "Refresh"] as const;
const VERDICTS = new Set(["kept", "updated", "consolidated", "replaced", "retired"]);
// A citation is a backticked repo-relative path with a known source/doc
// extension and an optional :line suffix, e.g. `tooling/lib/audit-plan.ts:88`.
// The extension allowlist keeps backticked non-path tokens (`project.phase`)
// from registering as citations.
const CITATION_EXTENSIONS = "md|ts|tsx|js|jsx|mjs|cjs|json|yaml|yml|sh|swift|css|html|txt";
const CITATION_PATTERN = new RegExp(`\`([\\w.@][\\w./@-]*\\.(?:${CITATION_EXTENSIONS}))(?::(\\d+))?\``, "gu");

const flags = parseFlags(process.argv.slice(2), [{ flags: ["--skill-root"], key: "skillRoot" }]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const issues: Issue[] = [];

interface LearningDoc {
  /** Path relative to the skill root, posix separators. */
  relPath: string;
  text: string;
}

function collectLearningDocs(root: string): LearningDoc[] {
  const knowledgeRoot = path.join(root, "knowledge");
  if (!existsSync(knowledgeRoot)) return [];
  const docs: LearningDoc[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        docs.push({
          relPath: path.relative(root, absolute).split(path.sep).join("/"),
          text: readFileSync(absolute, "utf8"),
        });
      }
    }
  };
  for (const domainEntry of readdirSync(knowledgeRoot, { withFileTypes: true })) {
    if (!domainEntry.isDirectory()) continue;
    const learningsDir = path.join(knowledgeRoot, domainEntry.name, "learnings");
    if (existsSync(learningsDir)) visit(learningsDir);
  }
  return docs.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** The body of a `## <name>` section, up to the next `## ` heading. */
function section(text: string, name: string): string | undefined {
  const match = new RegExp(`^## ${name}\\s*$`, "mu").exec(text);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = /^## /mu.exec(rest);
  return next && next.index !== undefined ? rest.slice(0, next.index) : rest;
}

function fileLines(filePath: string): string[] {
  return readFileSync(filePath, "utf8").split("\n");
}

function daysBetween(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** The YYYY-MM-DD date immediately following `label:`, so prose dates elsewhere in the section cannot satisfy the rule. */
function labeledDate(body: string, label: string): string | undefined {
  return new RegExp(`${label}:\\s*(\\d{4}-\\d{2}-\\d{2})`, "u").exec(body)?.[1];
}

/** Evidence table data rows: `| claim | citation |` lines, excluding the header and separator. */
function evidenceRows(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|[\s|:-]+\|?$/u.test(line) && !/^\|\s*Claim\s*\|/iu.test(line));
}

/**
 * The cited file's latest commit date (YYYY-MM-DD), or undefined when git is unavailable, the
 * path is untracked, or the output does not parse. A line citation marks a point in time, not a
 * fixed location: an unrelated edit can shift lines above it and the 180-day review-cadence check
 * alone never notices, because it only compares the Refresh date against now.
 */
function latestCommitDate(relTarget: string): string | undefined {
  let result: import("node:child_process").SpawnSyncReturns<string>;
  try {
    result = spawnSync("git", ["log", "-1", "--format=%cs", "--", relTarget], { cwd: skillRoot, encoding: "utf8" });
  } catch {
    return undefined;
  }
  if (result.error || result.status !== 0) return undefined;
  const date = (result.stdout ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : undefined;
}

function checkCitation(
  relTarget: string,
  line: string | undefined,
  reviewedDate: string | undefined,
  report: (code: string, message: string) => void,
  warn: (code: string, message: string) => void,
): void {
  const absolute = path.join(skillRoot, relTarget);
  if (!existsSync(absolute)) {
    report("learning_grounding.evidence_unresolved", `Cited evidence does not resolve: ${relTarget}. Update the citation or retire the learning.`);
    return;
  }
  if (line !== undefined) {
    const cited = Number(line);
    const lines = fileLines(absolute);
    if (cited < 1 || cited > lines.length) {
      report(
        "learning_grounding.evidence_line_out_of_range",
        `Cited line ${relTarget}:${cited} is outside the file (${lines.length} lines). Re-anchor the citation.`,
      );
    } else if ((lines[cited - 1] ?? "").trim() === "") {
      report("learning_grounding.evidence_line_blank", `Cited line ${relTarget}:${cited} is blank. Anchor the citation to the line that carries the claim.`);
    }
  }
  if (reviewedDate !== undefined) {
    const changedOn = latestCommitDate(relTarget);
    if (changedOn !== undefined && changedOn > reviewedDate) {
      const where = line !== undefined ? `${relTarget}:${line}` : relTarget;
      warn(
        "learning_grounding.citation_possibly_stale",
        `${where} changed on ${changedOn}, after the last review (${reviewedDate}). Re-verify the citation still supports the claim.`,
      );
    }
  }
}

function checkEvidence(
  evidence: string,
  reviewedDate: string | undefined,
  report: (code: string, message: string) => void,
  warn: (code: string, message: string) => void,
): void {
  const rows = evidenceRows(evidence);
  const allCitations = [...evidence.matchAll(CITATION_PATTERN)];
  if (allCitations.length === 0) {
    report("learning_grounding.evidence_missing", "The Evidence section needs at least one backticked repo-relative citation (path or path:line).");
    return;
  }
  for (const row of rows) {
    if (![...row.matchAll(CITATION_PATTERN)].length) {
      report(
        "learning_grounding.claim_missing_citation",
        `Evidence row has no resolving citation of its own: "${row.slice(0, 80)}". Every claim row needs a citation.`,
      );
    }
  }
  for (const citation of allCitations) {
    const [, relTarget, line] = citation;
    if (relTarget) checkCitation(relTarget, line, reviewedDate, report, warn);
  }
}

const packagesByPath = new Map<string, { id: string; lifecycle: string; manifestPath: string }>();
try {
  for (const pkg of loadKnowledgePackages(skillRoot)) {
    packagesByPath.set(pkg.path, { id: pkg.id, lifecycle: pkg.lifecycle, manifestPath: pkg.manifestPath });
    // Converse location rule: a learning-shaped package must keep its document
    // inside knowledge/<domain>/learnings/, or it escapes this gate's sweep.
    const learningShaped = pkg.id.includes(".learnings.") || path.basename(pkg.manifestPath).startsWith("learning-");
    if (learningShaped && !/^knowledge\/[^/]+\/learnings\//u.test(pkg.path)) {
      issues.push(
        issue(
          "error",
          "learning_grounding.location_mismatch",
          `${pkg.id} is learning-shaped but its document lives at ${pkg.path}, outside knowledge/<domain>/learnings/.`,
          pkg.manifestPath,
        ),
      );
    }
  }
} catch (error) {
  issues.push(
    issue("error", "learning_grounding.manifests_unreadable", `Knowledge manifests failed to load: ${error instanceof Error ? error.message : String(error)}`),
  );
}

const now = new Date();
for (const doc of collectLearningDocs(skillRoot)) {
  const pkg = packagesByPath.get(doc.relPath);
  if (pkg === undefined) {
    issues.push(
      issue("error", "learning_grounding.manifest_missing", "A learning must register as a knowledge package under catalog/knowledge/.", doc.relPath),
    );
  }
  // Content-quality rules soften to warnings on a draft (a fresh scaffold must
  // not break the audit); registration and lifecycle pairing stay errors.
  const contentSeverity: Severity = pkg?.lifecycle === "draft" ? "warning" : "error";
  const report = (code: string, message: string): void => {
    issues.push(issue(contentSeverity, code, message, doc.relPath));
  };

  const sections = new Map<string, string>();
  for (const name of REQUIRED_SECTIONS) {
    const body = section(doc.text, name);
    if (body === undefined) {
      report("learning_grounding.section_missing", `Missing required section: ## ${name}.`);
    } else {
      sections.set(name, body);
    }
  }

  const learning = sections.get("Learning");
  if (learning !== undefined && learning.trim() === "") {
    report("learning_grounding.learning_empty", "The Learning section needs the lesson stated as an instruction — it cannot be empty.");
  }

  // Computed up front (not just inside the Refresh block below) so checkEvidence can compare
  // each citation's latest commit date against it — a citation can go stale between reviews.
  const refresh = sections.get("Refresh");
  const reviewedDate = refresh === undefined ? undefined : labeledDate(refresh, "Last reviewed");
  const warn = (code: string, message: string): void => {
    issues.push(issue("warning", code, message, doc.relPath));
  };

  const evidence = sections.get("Evidence");
  if (evidence !== undefined) checkEvidence(evidence, reviewedDate, report, warn);

  const captured = sections.get("Captured");
  const capturedDate = captured === undefined ? undefined : labeledDate(captured, "Captured");
  if (captured !== undefined && capturedDate === undefined) {
    report("learning_grounding.captured_date_invalid", "The Captured section needs a 'Captured: YYYY-MM-DD' line.");
  }

  if (refresh !== undefined) {
    if (reviewedDate === undefined) {
      report("learning_grounding.refresh_date_invalid", "The Refresh section needs a 'Last reviewed: YYYY-MM-DD' line.");
    } else {
      if (capturedDate !== undefined && reviewedDate < capturedDate) {
        report("learning_grounding.refresh_before_capture", `Last reviewed ${reviewedDate} predates the captured date ${capturedDate}.`);
      }
      if (daysBetween(reviewedDate, now) > REVIEW_CADENCE_DAYS) {
        issues.push(
          issue(
            "warning",
            "learning_grounding.review_overdue",
            `Last reviewed ${reviewedDate}, more than ${REVIEW_CADENCE_DAYS} days ago. Run the learning-corpus-refresh pass.`,
            doc.relPath,
          ),
        );
      }
    }
    const verdictMatch = /verdict:\s*([a-z]+)/iu.exec(refresh);
    const verdict = verdictMatch?.[1]?.toLowerCase();
    if (verdict === undefined || !VERDICTS.has(verdict)) {
      report("learning_grounding.verdict_invalid", "The Refresh section needs 'Verdict: kept | updated | consolidated | replaced | retired'.");
    } else if (pkg !== undefined) {
      // Lifecycle pairing is a hard error at every lifecycle: a wrong pairing
      // on a draft would promote into a wrong pairing on an active package.
      if ((verdict === "replaced" || verdict === "retired") && pkg.lifecycle !== "deprecated") {
        issues.push(
          issue(
            "error",
            "learning_grounding.lifecycle_mismatch",
            `Verdict '${verdict}' requires manifest lifecycle 'deprecated' (currently '${pkg.lifecycle}' in ${pkg.manifestPath}).`,
            doc.relPath,
          ),
        );
      } else if ((verdict === "kept" || verdict === "updated") && pkg.lifecycle === "deprecated") {
        issues.push(
          issue(
            "error",
            "learning_grounding.lifecycle_mismatch",
            `Verdict '${verdict}' contradicts the deprecated manifest lifecycle in ${pkg.manifestPath}. Use replaced or retired.`,
            doc.relPath,
          ),
        );
      }
    }
  }
}

reportAndExit("Learning grounding check", issues);
