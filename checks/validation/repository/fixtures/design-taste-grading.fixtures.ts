import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness } from "./_harness.js";
import { NO_FURTHER_EDIT_MESSAGE, selectRecommendedNextEdit, sortFindingsInFileOrder, type GradingFinding } from "../../../../tooling/lib/grading.js";

const SCRIPT = "grade-design-surface.ts";

function mechanicalFinding(overrides: Partial<GradingFinding> & Pick<GradingFinding, "code" | "file">): GradingFinding {
  return { severity: "error", message: `${overrides.code} finding`, tier: "mechanical", dimensionKey: overrides.code, ...overrides };
}

function attestedFinding(overrides: Partial<GradingFinding> & Pick<GradingFinding, "code" | "file">): GradingFinding {
  return { severity: "warning", message: `${overrides.code} finding`, tier: "attested", dimensionKey: overrides.code, ...overrides };
}

function tasteFinding(overrides: Partial<GradingFinding> & Pick<GradingFinding, "code">): GradingFinding {
  return { severity: "warning", message: `${overrides.code} observation`, tier: "taste", dimensionKey: overrides.code, ...overrides };
}

function writeIconPackTell(root: string): void {
  mkdirSync(path.join(root, "growth", "landing", "sections"), { recursive: true });
  writeFileSync(
    path.join(root, "growth", "landing", "sections", "IconBar.tsx"),
    'import { Sparkles } from "lucide-react";\nexport function IconBar() {\n  return <Sparkles />;\n}\n',
    "utf8",
  );
}

export function register(harness: Harness): void {
  const { makeFixture, makeEmptyFixture, runFixture } = harness;
  const check = (label: string, run: () => void): void => {
    try {
      run();
      harness.results.push({ label, ok: true, expectedCode: 0, actualCode: 0, output: "" });
    } catch (error) {
      harness.results.push({ label, ok: false, expectedCode: 0, actualCode: 1, output: error instanceof Error ? error.message : String(error) });
    }
  };

  // -------------------------------------------------------------------------------------
  // selectRecommendedNextEdit — the single-recommended-edit priority, tested directly so a
  // future reordering of its branches (or its file-order contract) is caught here even if
  // every CLI-level fixture below still happens to pass.
  // -------------------------------------------------------------------------------------

  check("a mechanical error outranks an attested warning and a taste observation", () => {
    const findings = [
      tasteFinding({ code: "worthiness.taste_stranger_test", strength: 5 }),
      attestedFinding({ code: "worthiness.hierarchy_one_primary", file: "a.tsx" }),
      mechanicalFinding({ code: "vibecode.default_icon_pack", file: "b.tsx" }),
    ];
    assert.equal(selectRecommendedNextEdit(findings), "vibecode.default_icon_pack (b.tsx): vibecode.default_icon_pack finding");
  });

  check("the first mechanical error in array order wins, not the alphabetically-earliest file", () => {
    const findings = [
      mechanicalFinding({ code: "vibecode.default_icon_pack", file: "z-file.tsx" }),
      mechanicalFinding({ code: "worthiness.scale_raw_px", file: "a-file.tsx" }),
    ];
    assert.equal(selectRecommendedNextEdit(findings), "vibecode.default_icon_pack (z-file.tsx): vibecode.default_icon_pack finding");
  });

  check("an attested warning outranks a taste observation once mechanical checks are clean", () => {
    const findings = [
      tasteFinding({ code: "worthiness.taste_competitor_copy", strength: 5 }),
      attestedFinding({ code: "worthiness.hierarchy_one_primary", file: "a.tsx" }),
    ];
    assert.equal(selectRecommendedNextEdit(findings), "worthiness.hierarchy_one_primary (a.tsx): worthiness.hierarchy_one_primary finding");
  });

  check("the strongest taste observation wins by strength, not array position", () => {
    const findings = [
      tasteFinding({ code: "worthiness.taste_stranger_test", strength: 2 }),
      tasteFinding({ code: "worthiness.taste_competitor_copy", strength: 4 }),
    ];
    assert.equal(selectRecommendedNextEdit(findings), "worthiness.taste_competitor_copy: worthiness.taste_competitor_copy observation");
  });

  check("a strength tie is broken by array position (deterministic, not last-wins)", () => {
    const findings = [
      tasteFinding({ code: "worthiness.taste_stranger_test", strength: 3 }),
      tasteFinding({ code: "worthiness.taste_competitor_copy", strength: 3 }),
    ];
    assert.equal(selectRecommendedNextEdit(findings), "worthiness.taste_stranger_test: worthiness.taste_stranger_test observation");
  });

  check("no findings at all recommends the fixed clean message, never a fabricated edit", () => {
    assert.equal(selectRecommendedNextEdit([]), NO_FURTHER_EDIT_MESSAGE);
  });

  check("sortFindingsInFileOrder orders by file then code, undefined file first", () => {
    const findings = [mechanicalFinding({ code: "z", file: "b.tsx" }), mechanicalFinding({ code: "a", file: "a.tsx" }), tasteFinding({ code: "no-file" })];
    const sorted = sortFindingsInFileOrder(findings).map((finding) => finding.file ?? "(none)");
    assert.deepEqual(sorted, ["(none)", "a.tsx", "b.tsx"]);
  });

  // -------------------------------------------------------------------------------------
  // Mode 1 — mechanical pass + task template, driven through the real CLI.
  // -------------------------------------------------------------------------------------

  runFixture(
    "a clean business falls through to the Attested/Taste task template with no further edit",
    makeFixture("grade-design-clean"),
    SCRIPT,
    0,
    NO_FURTHER_EDIT_MESSAGE,
  );
  runFixture(
    "a clean business's task template names the Surfaces to Grade sections",
    makeFixture("grade-design-clean-template"),
    SCRIPT,
    0,
    "## Surfaces to Grade — Attested tier",
  );

  const iconPackRoot = makeFixture("grade-design-icon-pack");
  writeIconPackTell(iconPackRoot);
  runFixture("a Lucide import is reported as a mechanical error finding", iconPackRoot, SCRIPT, 0, '"code": "vibecode.default_icon_pack"');
  runFixture("the icon-pack finding is tagged tier mechanical with its dimension key", iconPackRoot, SCRIPT, 0, '"tier": "mechanical"', [
    "--scan-roots",
    "growth/landing",
  ]);
  runFixture("the icon-pack finding names dimensionKey vibecode.default_icon_pack", iconPackRoot, SCRIPT, 0, '"dimensionKey": "vibecode.default_icon_pack"');
  runFixture(
    "the icon-pack mechanical error becomes the single recommended next edit",
    iconPackRoot,
    SCRIPT,
    0,
    '"recommendedNextEdit": "vibecode.default_icon_pack',
  );
  runFixture(
    "a mechanical error blocks the taste task template and points at fixing it first",
    iconPackRoot,
    SCRIPT,
    0,
    "Mechanical errors found. Fix these first",
    [],
    undefined,
    "Surfaces to Grade",
  );

  // -------------------------------------------------------------------------------------
  // Mode 2 — validate-and-write, driven through the real CLI.
  // -------------------------------------------------------------------------------------

  const missingInputRoot = makeEmptyFixture("grade-design-missing-input");
  runFixture("a missing grading input file fails closed", missingInputRoot, SCRIPT, 1, "Could not read grading input", [
    "--grading-input",
    path.join(missingInputRoot, "does-not-exist.json"),
    "--write",
    "design-taste-report.json",
  ]);

  const invalidJsonRoot = makeEmptyFixture("grade-design-invalid-json");
  const invalidJsonPath = path.join(invalidJsonRoot, "grading-input.json");
  writeFileSync(invalidJsonPath, "{not valid json", "utf8");
  runFixture("invalid JSON grading input fails closed", invalidJsonRoot, SCRIPT, 1, "not valid JSON", [
    "--grading-input",
    invalidJsonPath,
    "--write",
    "design-taste-report.json",
  ]);

  const unknownKeyRoot = makeEmptyFixture("grade-design-unknown-key");
  const unknownKeyPath = path.join(unknownKeyRoot, "grading-input.json");
  writeFileSync(
    unknownKeyPath,
    JSON.stringify({
      attested: [
        { dimensionKey: "worthiness.not_a_real_dimension", observedEvidence: "saw a real header", notes: "this dimension does not exist in the rubric" },
      ],
    }),
    "utf8",
  );
  runFixture("an unknown dimensionKey fails closed", unknownKeyRoot, SCRIPT, 1, "is not a rubric dimension", [
    "--grading-input",
    unknownKeyPath,
    "--write",
    "design-taste-report.json",
  ]);

  const wrongTierRoot = makeEmptyFixture("grade-design-wrong-tier");
  const wrongTierPath = path.join(wrongTierRoot, "grading-input.json");
  writeFileSync(
    wrongTierPath,
    JSON.stringify({
      attested: [
        { dimensionKey: "worthiness.taste_stranger_test", observedEvidence: "saw the hero headline", notes: "this key is actually tier taste, not attested" },
      ],
    }),
    "utf8",
  );
  runFixture("a dimensionKey filed under the wrong tier array fails closed", wrongTierRoot, SCRIPT, 1, "Move it to the matching array", [
    "--grading-input",
    wrongTierPath,
    "--write",
    "design-taste-report.json",
  ]);

  const shortEvidenceRoot = makeEmptyFixture("grade-design-short-evidence");
  const shortEvidencePath = path.join(shortEvidenceRoot, "grading-input.json");
  writeFileSync(
    shortEvidencePath,
    JSON.stringify({
      attested: [
        { dimensionKey: "worthiness.hierarchy_one_primary", observedEvidence: "meh", notes: "this observed evidence line is far too short to be real" },
      ],
    }),
    "utf8",
  );
  runFixture("observedEvidence below the minimum length fails closed", shortEvidenceRoot, SCRIPT, 1, "observedEvidence is missing or too short", [
    "--grading-input",
    shortEvidencePath,
    "--write",
    "design-taste-report.json",
  ]);

  const shortNotesRoot = makeEmptyFixture("grade-design-short-notes");
  const shortNotesPath = path.join(shortNotesRoot, "grading-input.json");
  writeFileSync(
    shortNotesPath,
    JSON.stringify({
      attested: [{ dimensionKey: "worthiness.hierarchy_one_primary", observedEvidence: "saw two primary buttons side by side", notes: "too short" }],
    }),
    "utf8",
  );
  runFixture("notes below the minimum length fails closed", shortNotesRoot, SCRIPT, 1, "notes is missing or too short", [
    "--grading-input",
    shortNotesPath,
    "--write",
    "design-taste-report.json",
  ]);

  const badStrengthRoot = makeEmptyFixture("grade-design-bad-strength");
  const badStrengthPath = path.join(badStrengthRoot, "grading-input.json");
  writeFileSync(
    badStrengthPath,
    JSON.stringify({
      taste: [
        {
          dimensionKey: "worthiness.taste_stranger_test",
          strength: 9,
          observedEvidence: "saw the hero headline and wordmark",
          notes: "a stranger would not recognize this as one product",
        },
      ],
    }),
    "utf8",
  );
  runFixture("a taste strength outside 1-5 fails closed", badStrengthRoot, SCRIPT, 1, "strength must be an integer from 1 to 5", [
    "--grading-input",
    badStrengthPath,
    "--write",
    "design-taste-report.json",
  ]);

  const duplicateKeyRoot = makeEmptyFixture("grade-design-duplicate-key");
  const duplicateKeyPath = path.join(duplicateKeyRoot, "grading-input.json");
  writeFileSync(
    duplicateKeyPath,
    JSON.stringify({
      attested: [
        {
          dimensionKey: "worthiness.hierarchy_one_primary",
          observedEvidence: "saw two primary buttons side by side",
          notes: "two primaries compete for attention on this screen",
        },
        {
          dimensionKey: "worthiness.hierarchy_one_primary",
          observedEvidence: "saw it again on a second screen",
          notes: "recorded a second time by mistake in this fixture",
        },
      ],
    }),
    "utf8",
  );
  runFixture("the same dimensionKey recorded twice fails closed", duplicateKeyRoot, SCRIPT, 1, "recorded more than once", [
    "--grading-input",
    duplicateKeyPath,
    "--write",
    "design-taste-report.json",
  ]);

  const emptyInputRoot = makeEmptyFixture("grade-design-empty-input");
  const emptyInputPath = path.join(emptyInputRoot, "grading-input.json");
  writeFileSync(emptyInputPath, JSON.stringify({}), "utf8");
  runFixture("a grading input with neither array recorded fails closed", emptyInputRoot, SCRIPT, 1, 'neither an "attested" nor a "taste" observation', [
    "--grading-input",
    emptyInputPath,
    "--write",
    "design-taste-report.json",
  ]);

  const validRoot = makeEmptyFixture("grade-design-valid-input");
  const validInputPath = path.join(validRoot, "grading-input.json");
  writeFileSync(
    validInputPath,
    JSON.stringify({
      attested: [
        {
          dimensionKey: "worthiness.hierarchy_one_primary",
          observedEvidence: "saw two equally weighted primary buttons on the checkout screen",
          notes: "Save and Continue both use the primary button style with no clear precedence",
        },
      ],
      taste: [
        {
          dimensionKey: "worthiness.taste_stranger_test",
          strength: 3,
          observedEvidence: "the hero has no wordmark and a generic gradient background",
          notes: "a stranger would likely not recognize this as a distinct product from the wordmark alone",
        },
      ],
    }),
    "utf8",
  );
  runFixture("a fully valid grading input is validated and written", validRoot, SCRIPT, 0, "OK: Grading report written to", [
    "--grading-input",
    validInputPath,
    "--write",
    "design-taste-report.json",
  ]);

  check("the written report merges the attested and taste findings and ranks the attested one first", () => {
    const reportPath = path.join(validRoot, "design-taste-report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      findings: Array<{ dimensionKey: string; tier: string }>;
      recommendedNextEdit: string;
    };
    const dimensionKeys = report.findings.map((finding) => finding.dimensionKey);
    assert.ok(dimensionKeys.includes("worthiness.hierarchy_one_primary"), `expected an attested finding, got: ${JSON.stringify(dimensionKeys)}`);
    assert.ok(dimensionKeys.includes("worthiness.taste_stranger_test"), `expected a taste finding, got: ${JSON.stringify(dimensionKeys)}`);
    assert.ok(
      report.recommendedNextEdit.startsWith("worthiness.hierarchy_one_primary"),
      `an attested warning must outrank a taste observation; got recommendedNextEdit: ${report.recommendedNextEdit}`,
    );
  });
}
