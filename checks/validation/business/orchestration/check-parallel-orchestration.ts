#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { asString, getPath, issue, loadProjectState, missingPhraseCode, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { inspectRenderedH2Section, parseRenderedPipeTables } from "../../../../kernel/lib/required-table-section.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

function firstExistingText(candidates: string[]): { relativePath: string; text: string } | undefined {
  for (const candidate of candidates) {
    const text = readText(args.root, candidate);
    if (text) {
      return { relativePath: candidate, text };
    }
  }
  return undefined;
}

function existsAny(candidates: string[]): string | undefined {
  return candidates.find((candidate) => existsSync(path.join(args.root, candidate)));
}

function includes(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase());
}

const LEDGER_HEADERS = ["surface", "producer", "auditor", "rubric", "verdict", "findings artifact"] as const;
const LEDGER_PLACEHOLDER = /^(?:|not recorded|none|tbd|todo|pending|n\/?a|—|-)$/i;
const LEDGER_VERDICT = /^(pass|fail|pending|blocked)\b/i;

/**
 * The review ledger is where isolated review (knowledge/orchestration/isolated-review.md) becomes
 * a checked fact instead of a promise: one row per producer-to-auditor pair, producer and auditor
 * distinct, and a pass or fail verdict pointing at a findings artifact that exists. The phrase
 * check above already fails a document with no ledger section at all; this validates the rows.
 */
function validateReviewLedger(text: string, file: string): void {
  const view = inspectRenderedH2Section(text, "Review Ledger");
  if (!view.ok) return;
  for (const unsupported of view.section.unsupported) {
    issues.push(
      issue("error", "orchestration.review_ledger.unsupported_markdown", `Review Ledger hides evidence behind ${unsupported.description}.`, file, {
        line: unsupported.sourceLine,
      }),
    );
  }
  const table = parseRenderedPipeTables(view.section.renderedBody).find((candidate) => LEDGER_HEADERS.every((header) => candidate.headers.includes(header)));
  if (!table) {
    issues.push(
      issue(
        "error",
        "orchestration.review_ledger.table_missing",
        "Review Ledger needs one simple pipe table with the columns Surface, Producer, Auditor, Rubric, Verdict, Findings artifact, Date.",
        file,
        { line: view.section.headingLine },
      ),
    );
    return;
  }
  const column = (name: (typeof LEDGER_HEADERS)[number]): number => table.headers.indexOf(name);
  for (const [index, row] of table.rows.entries()) {
    const cell = (name: (typeof LEDGER_HEADERS)[number]): string => row[column(name)]?.trim() ?? "";
    const surface = cell("surface") || `row ${index + 1}`;
    const producer = cell("producer");
    const auditor = cell("auditor");
    const verdict = cell("verdict");
    if ([producer, auditor, verdict].every((value) => LEDGER_PLACEHOLDER.test(value))) continue;
    if (producer && auditor && producer.toLowerCase() === auditor.toLowerCase()) {
      issues.push(
        issue(
          "error",
          "orchestration.review_ledger.self_review",
          `Review Ledger "${surface}": producer and auditor are the same agent; self-review is invalid.`,
          file,
        ),
      );
    }
    if (!producer || !auditor) {
      issues.push(
        issue("error", "orchestration.review_ledger.pair_incomplete", `Review Ledger "${surface}" must name both the producer and the auditor.`, file),
      );
    }
    const verdictMatch = verdict.match(LEDGER_VERDICT);
    if (!verdictMatch) {
      issues.push(
        issue(
          "error",
          "orchestration.review_ledger.verdict_invalid",
          `Review Ledger "${surface}" verdict "${verdict}" must be pass, fail, pending, or blocked.`,
          file,
        ),
      );
      continue;
    }
    const decided = /^(pass|fail)$/i.test(verdictMatch[1] ?? "");
    if (!decided) continue;
    if (LEDGER_PLACEHOLDER.test(cell("rubric"))) {
      issues.push(issue("error", "orchestration.review_ledger.rubric_missing", `Review Ledger "${surface}" has a verdict but names no rubric version.`, file));
    }
    const findings = cell("findings artifact").replace(/`/g, "").trim().split(/\s+/)[0] ?? "";
    if (LEDGER_PLACEHOLDER.test(findings) || !existsSync(path.join(args.root, findings))) {
      issues.push(
        issue(
          "error",
          "orchestration.review_ledger.findings_missing",
          `Review Ledger "${surface}" has a ${verdictMatch[1]?.toLowerCase()} verdict but its findings artifact${findings ? ` ${findings}` : ""} does not exist in the workspace.`,
          file,
        ),
      );
    }
  }
}

const orchestrationLaneStatus = state ? asString(getPath(state, "lanes.orchestration.status"))?.toLowerCase() : undefined;
const skip = orchestrationLaneStatus === "not_needed" || orchestrationLaneStatus === "deferred";
const markdown = firstExistingText(["operations/ORCHESTRATION.md", "orchestration/operations/ORCHESTRATION.md"]);
const htmlPath = existsAny(["operations/orchestration.html", "orchestration/operations/orchestration.html"]);

if (!skip && !markdown) {
  issues.push(
    issue(
      "error",
      "orchestration.markdown_missing",
      "operations/ORCHESTRATION.md is required before broad launch, multi-lane build, subagent dispatch, or launch-readiness claims.",
      "operations/ORCHESTRATION.md",
    ),
  );
}

if (!skip && !htmlPath) {
  issues.push(
    issue(
      "warning",
      "operations/orchestration.html_missing",
      "operations/orchestration.html should render the parallel-agent board when orchestration is in scope.",
      "operations/orchestration.html",
    ),
  );
}

if (markdown) {
  const requiredPhrases = [
    "Orchestration Preflight",
    "Strategy",
    "Candidate Units",
    "Parallel Safety Check",
    "File Ownership",
    "Serialized Work",
    "Subagent Instructions",
    "Integration Plan",
    "Verification",
    "Founder-Only Gates",
    "State Updates",
    "Failure Cards",
    "Review Ledger",
  ];
  for (const phrase of requiredPhrases) {
    if (!includes(markdown.text, phrase)) {
      issues.push(issue("error", missingPhraseCode("orchestration", phrase), `operations/ORCHESTRATION.md should include ${phrase}.`, markdown.relativePath));
    }
  }

  validateReviewLedger(markdown.text, markdown.relativePath);

  if (
    /\b(?:subagent|subagents|worker|workers|specialist|specialists)\b[^\n.]{0,160}\b(?:can|may|should|will)\s+(?:stage|commit|push|merge)\b/i.test(
      markdown.text,
    )
  ) {
    issues.push(
      issue(
        "error",
        "orchestration.subagent_git_authority",
        "Subagents must not be granted git staging, commit, push, merge, or release authority.",
        markdown.relativePath,
      ),
    );
  }

  if (/\bsubagents?\b[\s\S]{0,160}\b(?:may|can|should|will|must)\s+run\s+(?:project-wide|full)\s+(?:test|suite|audit)/i.test(markdown.text)) {
    issues.push(
      issue(
        "error",
        "orchestration.subagent_project_wide_suite",
        "Parallel subagents should not run project-wide suites; the orchestrator owns full-suite validation after integration.",
        markdown.relativePath,
      ),
    );
  }

  const mentionsParallel = /\b(parallel|subagent|worker|worktree)\b/i.test(markdown.text);
  if (mentionsParallel && !/\bdo not\b[\s\S]{0,160}\bstage\b/i.test(markdown.text)) {
    issues.push(
      issue("error", "orchestration.no_stage_instruction_missing", "Subagent instructions should explicitly say not to stage files.", markdown.relativePath),
    );
  }
  if (mentionsParallel && !/\bdo not\b[\s\S]{0,160}\bcommit\b/i.test(markdown.text)) {
    issues.push(
      issue("error", "orchestration.no_commit_instruction_missing", "Subagent instructions should explicitly say not to commit.", markdown.relativePath),
    );
  }

  if (/\b(TODO|TBD|unknown|placeholder)\b/i.test(markdown.text) && /\b(status:\s*done|launch-ready|complete|production-ready)\b/i.test(markdown.text)) {
    issues.push(
      issue(
        "error",
        "orchestration.placeholder_complete",
        "operations/ORCHESTRATION.md cannot claim done/complete while placeholder language remains.",
        markdown.relativePath,
      ),
    );
  }
}

reportAndExit("Parallel orchestration check", issues);
