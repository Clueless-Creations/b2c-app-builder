import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { type Harness } from "./_harness.js";
// (mkdirSync also builds the nested-learnings case below.)

/**
 * Turns a fixture root into a real git repo with one commit touching
 * `knowledge/process/citable.md`, backdated to `isoDate` — so
 * learning_grounding.citation_possibly_stale (which shells out to `git log`) has something real
 * to compare a learning's "Last reviewed" date against. Every other fixture root in this file
 * stays a plain (non-git) temp directory on purpose: `git log` there fails closed (not a
 * repository), proving the rule skips cleanly when git is unavailable, without a dedicated case.
 */
function gitCommitCitable(root: string, isoDate: string): void {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.com",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.com",
    GIT_AUTHOR_DATE: `${isoDate}T00:00:00`,
    GIT_COMMITTER_DATE: `${isoDate}T00:00:00`,
  };
  spawnSync("git", ["init", "-q"], { cwd: root, env });
  spawnSync("git", ["add", "-A"], { cwd: root, env });
  spawnSync("git", ["commit", "-q", "--no-verify", "-m", "fixture commit"], { cwd: root, env });
}

/**
 * Fixtures for check:learning-grounding — the grounding contract for captured
 * learnings. Each rule gets a failing input so a regression that makes the
 * gate always-pass is caught by test:validators, plus one clean learning as
 * the negative control proving the gate can still pass.
 */

interface LearningParts {
  learning?: string;
  evidence?: string;
  captured?: string;
  refresh?: string;
}

function learningDoc(parts: LearningParts): string {
  const sections: string[] = ["# Fixture Learning", ""];
  if (parts.learning !== undefined) sections.push("## Learning", "", parts.learning, "");
  if (parts.evidence !== undefined) sections.push("## Evidence", "", parts.evidence, "");
  if (parts.captured !== undefined) sections.push("## Captured", "", parts.captured, "");
  if (parts.refresh !== undefined) sections.push("## Refresh", "", parts.refresh, "");
  return sections.join("\n");
}

function manifestYaml(lifecycle: string, extra = ""): string {
  return [
    "schema_version: 1.0.0",
    "id: reference.process.learnings.fixture",
    "title: Fixture Learning",
    "domain_id: domain.process",
    "document_path: knowledge/process/learnings/fixture.md",
    "load_when: exercising the learning grounding gate in fixtures",
    `lifecycle: ${lifecycle}`,
    "bindings:",
    "  workflow_ids: []",
    "  context_pack_ids: []",
    "applicability_notes: Fixture manifest for the grounding gate.",
    "sources: []",
    "source_exemption: Fixture content with no external claims.",
    extra,
  ]
    .filter(Boolean)
    .join("\n");
}

/** A minimal skill root holding one learning + manifest and one citable file. */
function writeLearningRoot(root: string, doc: string, options: { lifecycle?: string; withManifest?: boolean } = {}): void {
  const { lifecycle = "active", withManifest = true } = options;
  mkdirSync(path.join(root, "knowledge/process/learnings"), { recursive: true });
  mkdirSync(path.join(root, "catalog/knowledge/process"), { recursive: true });
  // A real citable target with a known line count (3 lines).
  writeFileSync(path.join(root, "knowledge/process/citable.md"), "line one\nline two\nline three\n");
  writeFileSync(path.join(root, "knowledge/process/learnings/fixture.md"), doc);
  if (withManifest) {
    writeFileSync(path.join(root, "catalog/knowledge/process/learning-fixture.yaml"), manifestYaml(lifecycle));
  }
}

const VALID = {
  learning: "Run the fixture the same way every time.",
  evidence: "| Claim | Citation |\n| --- | --- |\n| The citable file has three lines | `knowledge/process/citable.md:2` |",
  captured: "Captured: 2026-08-01 — validator fixture.",
  refresh: "Last reviewed: 2026-08-18. Verdict: kept.",
} satisfies LearningParts;

export function register(harness: Harness): void {
  const gate = "check-learning-grounding.ts";
  const run = (label: string, root: string, expectedCode: number, expectedText?: string): void => {
    harness.runScriptArgs(label, gate, ["--skill-root", root], expectedCode, expectedText);
  };

  {
    const root = harness.makeEmptyFixture("learning-clean");
    writeLearningRoot(root, learningDoc(VALID));
    run("learning-grounding passes a grounded learning", root, 0, "0 error(s)");
  }
  {
    const root = harness.makeEmptyFixture("learning-missing-section");
    writeLearningRoot(root, learningDoc({ ...VALID, evidence: undefined }));
    run("learning-grounding fails on a missing Evidence section", root, 1, "learning_grounding.section_missing");
  }
  {
    const root = harness.makeEmptyFixture("learning-no-citation");
    writeLearningRoot(root, learningDoc({ ...VALID, evidence: "| Claim | Citation |\n| --- | --- |\n| No backticked citation here | none |" }));
    run("learning-grounding fails on an evidence section without citations", root, 1, "learning_grounding.evidence_missing");
  }
  {
    const root = harness.makeEmptyFixture("learning-dead-citation");
    writeLearningRoot(root, learningDoc({ ...VALID, evidence: "| Claim | Citation |\n| --- | --- |\n| Dead | `knowledge/process/gone.md:1` |" }));
    run("learning-grounding fails on a citation to a missing file", root, 1, "learning_grounding.evidence_unresolved");
  }
  {
    const root = harness.makeEmptyFixture("learning-line-out-of-range");
    writeLearningRoot(root, learningDoc({ ...VALID, evidence: "| Claim | Citation |\n| --- | --- |\n| Over | `knowledge/process/citable.md:99` |" }));
    run("learning-grounding fails on a line citation outside the file", root, 1, "learning_grounding.evidence_line_out_of_range");
  }
  {
    const root = harness.makeEmptyFixture("learning-refresh-before-capture");
    writeLearningRoot(root, learningDoc({ ...VALID, refresh: "Last reviewed: 2026-07-01. Verdict: kept." }));
    run("learning-grounding fails when review predates capture", root, 1, "learning_grounding.refresh_before_capture");
  }
  {
    const root = harness.makeEmptyFixture("learning-bad-verdict");
    writeLearningRoot(root, learningDoc({ ...VALID, refresh: "Last reviewed: 2026-08-18. Verdict: fine." }));
    run("learning-grounding fails on an unknown verdict", root, 1, "learning_grounding.verdict_invalid");
  }
  {
    const root = harness.makeEmptyFixture("learning-lifecycle-mismatch");
    writeLearningRoot(root, learningDoc({ ...VALID, refresh: "Last reviewed: 2026-08-18. Verdict: retired." }), { lifecycle: "active" });
    run("learning-grounding fails when retired verdict keeps an active lifecycle", root, 1, "learning_grounding.lifecycle_mismatch");
  }
  {
    const root = harness.makeEmptyFixture("learning-unregistered");
    writeLearningRoot(root, learningDoc(VALID), { withManifest: false });
    run("learning-grounding fails on a learning without a manifest", root, 1, "learning_grounding.manifest_missing");
  }
  {
    const root = harness.makeEmptyFixture("learning-stale-review");
    writeLearningRoot(
      root,
      learningDoc({ ...VALID, captured: "Captured: 2025-01-01 — validator fixture.", refresh: "Last reviewed: 2025-01-02. Verdict: kept." }),
    );
    // Stale review is a warning for the refresh node, never a hard failure.
    run("learning-grounding warns without failing on an overdue review", root, 0, "learning_grounding.review_overdue");
  }
  {
    const root = harness.makeEmptyFixture("learning-captured-date-invalid");
    writeLearningRoot(root, learningDoc({ ...VALID, captured: "Captured: not-a-date — validator fixture." }));
    run("learning-grounding fails on a malformed captured date", root, 1, "learning_grounding.captured_date_invalid");
  }
  {
    const root = harness.makeEmptyFixture("learning-refresh-date-missing");
    writeLearningRoot(root, learningDoc({ ...VALID, refresh: "Verdict: kept." }));
    run("learning-grounding fails on a refresh section without a reviewed date", root, 1, "learning_grounding.refresh_date_invalid");
  }
  {
    const root = harness.makeEmptyFixture("learning-kept-but-deprecated");
    writeLearningRoot(root, learningDoc(VALID), { lifecycle: "deprecated" });
    run("learning-grounding fails when a kept verdict pairs with a deprecated lifecycle", root, 1, "learning_grounding.lifecycle_mismatch");
  }
  {
    const root = harness.makeEmptyFixture("learning-empty-lesson");
    writeLearningRoot(root, learningDoc({ ...VALID, learning: "" }));
    run("learning-grounding fails on an empty Learning section", root, 1, "learning_grounding.learning_empty");
  }
  {
    const root = harness.makeEmptyFixture("learning-row-without-citation");
    writeLearningRoot(
      root,
      learningDoc({
        ...VALID,
        evidence:
          "| Claim | Citation |\n| --- | --- |\n| Grounded claim | `knowledge/process/citable.md:2` |\n| Ungrounded claim | remembered from a session |",
      }),
    );
    run("learning-grounding fails when one claim row has no citation", root, 1, "learning_grounding.claim_missing_citation");
  }
  {
    const root = harness.makeEmptyFixture("learning-blank-line-anchor");
    // citable.md line 4 is the trailing blank line after "line three\n".
    writeLearningRoot(
      root,
      learningDoc({ ...VALID, evidence: "| Claim | Citation |\n| --- | --- |\n| Anchored to nothing | `knowledge/process/citable.md:4` |" }),
    );
    run("learning-grounding fails on a blank-line citation anchor", root, 1, "learning_grounding.evidence_line_blank");
  }
  {
    const root = harness.makeEmptyFixture("learning-nested-swept");
    writeLearningRoot(root, learningDoc(VALID));
    mkdirSync(path.join(root, "knowledge/process/learnings/archive"), { recursive: true });
    writeFileSync(path.join(root, "knowledge/process/learnings/archive/nested.md"), learningDoc({ ...VALID, evidence: undefined }));
    run("learning-grounding sweeps nested learning directories", root, 1, "learnings/archive/nested.md");
  }
  {
    const root = harness.makeEmptyFixture("learning-location-mismatch");
    writeLearningRoot(root, learningDoc(VALID));
    // A learning-shaped manifest whose document escaped the learnings/ directory.
    writeFileSync(path.join(root, "knowledge/process/stray.md"), learningDoc(VALID));
    writeFileSync(
      path.join(root, "catalog/knowledge/process/learning-stray.yaml"),
      manifestYaml("active")
        .replace("learnings.fixture", "learnings.stray")
        .replace("document_path: knowledge/process/learnings/fixture.md", "document_path: knowledge/process/stray.md"),
    );
    run("learning-grounding fails on a learning-shaped package outside learnings/", root, 1, "learning_grounding.location_mismatch");
  }
  {
    const root = harness.makeEmptyFixture("learning-draft-scaffold-passes");
    // A fresh knowledge:capture scaffold (draft lifecycle, placeholder content)
    // must warn, not fail — otherwise capturing a learning breaks the audit.
    writeLearningRoot(root, learningDoc({ ...VALID, evidence: "| Claim | Citation |\n| --- | --- |\n| Replace with the grounded claim | placeholder |" }), {
      lifecycle: "draft",
    });
    run("learning-grounding downgrades content gaps to warnings on a draft", root, 0, "learning_grounding.evidence_missing");
  }
  {
    const root = harness.makeEmptyFixture("learning-citation-changed-since-review");
    writeLearningRoot(
      root,
      learningDoc({ ...VALID, captured: "Captured: 2026-05-01 — validator fixture.", refresh: "Last reviewed: 2026-06-01. Verdict: kept." }),
    );
    // The cited file's real commit (2026-07-01) postdates the "Last reviewed" date (2026-06-01):
    // the citation is a point-in-time claim that may no longer hold, so it warns, not fails.
    gitCommitCitable(root, "2026-07-01");
    run("learning-grounding warns when the cited file changed after the last review", root, 0, "learning_grounding.citation_possibly_stale");
  }
  {
    const root = harness.makeEmptyFixture("learning-citation-predates-review");
    writeLearningRoot(root, learningDoc(VALID));
    // The cited file's real commit (2026-01-01) predates VALID's "Last reviewed: 2026-08-18":
    // the review already covered this state of the file, so no staleness warning fires.
    gitCommitCitable(root, "2026-01-01");
    run("learning-grounding stays clean when the cited file predates the last review", root, 0, "0 error(s), 0 warning(s)");
  }
}
