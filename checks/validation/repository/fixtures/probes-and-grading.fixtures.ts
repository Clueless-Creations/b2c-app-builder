import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, writeCompleteStoreScreenshots } from "./_harness.js";

/**
 * Minimal valid PNG header (signature + IHDR chunk) — just enough for
 * grade-screenshots.ts readPngDimensions, which reads the first 29 bytes.
 */
function minimalPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR data length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8; // bit depth
  buf[25] = 6; // color type RGBA
  return buf;
}

function gradingLedger(builderSession: string, graderSession: string): string {
  return JSON.stringify(
    {
      builder: { agent: "builder-agent", session_id: builderSession },
      grader: { agent: "grader-agent", session_id: graderSession },
      grading_pass: { separate_pass: true, started_at: "2026-06-01T00:00:00.000Z", method: "vision" },
      slots: [
        {
          slot: 1,
          locale: "en-US",
          device_well: "iphone-69",
          final_png: "screenshots/final/iphone-69-slot-1.png",
          graded_at: "2026-06-01T00:05:00.000Z",
          rubric_version: "1.2",
          dimensions: {
            thumbnail_legibility: 2,
            hook_first: 2,
            truthfulness: 3,
            one_idea_per_slot: 2,
            brand_token_fidelity: 2,
            aso_keyword_reinforcement: 2,
            emotional_north_star: 2,
            localization_quality: null,
          },
          grader_notes: "Headline is legible at thumbnail size and the slot sells the core outcome with truthful UI.",
          observed_evidence: "Saw the headline 'See the win fast' over a framed iPhone screenshot with a blue primary button.",
          override: null,
        },
      ],
    },
    null,
    2,
  );
}

export function register(h: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture } = h;

  const probePosthogNoCreds = makeEmptyFixture("probe-posthog-no-credentials");
  runFixture("probe-posthog without credentials exits cleanly", probePosthogNoCreds, "probe-posthog.ts", 0, "POSTHOG_PERSONAL_API_KEY", [], {
    POSTHOG_PERSONAL_API_KEY: "",
    POSTHOG_PROJECT_ID: "",
  });

  const probeRevenuecatNoCreds = makeEmptyFixture("probe-revenuecat-no-credentials");
  runFixture("probe-revenuecat without credentials exits cleanly", probeRevenuecatNoCreds, "probe-revenuecat.ts", 0, "REVENUECAT_SECRET_API_KEY", [], {
    REVENUECAT_SECRET_API_KEY: "",
  });

  const gradeTemplate = makeEmptyFixture("grade-screenshots-template");
  writeFileSync(
    path.join(gradeTemplate, "SCREENSHOTS.md"),
    [
      "# Store Screenshots",
      "Production Composition Matrix",
      "| Slot | Headline | Final upload path | Dimensions | Visual QA |",
      "| --- | --- | --- | --- | --- |",
      "| 1 | See the win fast | screenshots/final/en-US/iphone-69/slot-1.png | 1320x2868 | passed |",
    ].join("\n"),
    "utf8",
  );
  mkdirSync(path.join(gradeTemplate, "screenshots", "final", "en-US", "iphone-69"), { recursive: true });
  writeFileSync(path.join(gradeTemplate, "screenshots", "final", "en-US", "iphone-69", "slot-1.png"), minimalPng(1320, 2868));
  runFixture(
    "grade-screenshots emits grading task template for declared final slots",
    gradeTemplate,
    "grade-screenshots.ts",
    0,
    "### Slot 1 — locale: en-US — device_well: iphone-69",
  );

  const gradeMissingInput = makeFixture("grade-screenshots-missing-input");
  writeCompleteStoreScreenshots(gradeMissingInput);
  runFixture("grade-screenshots with missing grading input fails", gradeMissingInput, "grade-screenshots.ts", 1, "Could not read grading input", [
    "--grading-input",
    path.join(gradeMissingInput, "does-not-exist.json"),
    "--write",
    "screenshot-rubric-scores.json",
  ]);

  const gradeSameSession = makeFixture("grade-screenshots-same-session");
  writeCompleteStoreScreenshots(gradeSameSession);
  const sameSessionInput = path.join(gradeSameSession, "grading-input-same-session.json");
  writeFileSync(sameSessionInput, gradingLedger("session-abc", "session-abc"), "utf8");
  runFixture("grade-screenshots rejects builder grading own screenshots", gradeSameSession, "grade-screenshots.ts", 1, "equals grader.session_id", [
    "--grading-input",
    sameSessionInput,
    "--write",
    "screenshot-rubric-scores.json",
  ]);

  const gradeValidLedger = makeFixture("grade-screenshots-valid-ledger");
  writeCompleteStoreScreenshots(gradeValidLedger);
  const validLedgerInput = path.join(gradeValidLedger, "grading-input-valid.json");
  writeFileSync(validLedgerInput, gradingLedger("builder-session-1", "grader-session-2"), "utf8");
  runFixture("grade-screenshots validates and writes a separate-pass ledger", gradeValidLedger, "grade-screenshots.ts", 0, "OK: Grading ledger written to", [
    "--grading-input",
    validLedgerInput,
    "--write",
    "screenshot-rubric-scores.json",
  ]);
}
