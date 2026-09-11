#!/usr/bin/env node
/**
 * grade-design-surface.ts — the #37 surface grader: screenshot in, structured findings and a
 * single recommended next edit out, run per iteration instead of a founder rereading a
 * benchmark file by hand.
 *
 * Two advisory modes retain the surface-grader contract. An explicit acceptance mode
 * validates the complete rendered mobile and landing evidence against frozen rubrics:
 *
 *   # Mode 1 — mechanical pass + task template:
 *   npx tsx tooling/grade-design-surface.ts --root . --scan-roots growth/landing
 *
 *   Runs the Mechanical-tier rubric dimensions IN PROCESS, as plain library calls against the
 *   pure functions this Wave extracted (checks/validation/business/design/lib/vibecode-tells.ts's
 *   TELLS[], and lib/worthiness-mechanical.ts's contrast/token-scale/undeclared-color checks) — no subprocess,
 *   no re-reading DESIGN.md's prose sections. Prints a GradingReport with every mechanical
 *   finding it found. If no mechanical ERROR is present, also prints a task-template section
 *   naming every Attested- and Taste-tier dimension for a model-judged pass, per
 *   design-worthiness.md rule 12's own order: "After mechanical checks pass ... prepare a taste
 *   packet." Always exits 0 — this command informs, it never gates a build (that is what
 *   check:vibecoded-tells and check:design-worthiness are for).
 *
 *   # Mode 2 — validate + write, after a model fills the task template:
 *   npx tsx tooling/grade-design-surface.ts --root . --scan-roots growth/landing \
 *     --grading-input /tmp/grading-output.json --write design/proofs/design-taste-report.json
 *
 *   Re-runs the same mechanical pass, validates the supplied attested/taste observations
 *   (each needs a dimensionKey the rubric actually declares for that tier, and an
 *   observed_evidence line — the same raised-bar-not-impossible anti-fabrication control
 *   grade-screenshots.ts documents for its own ledger), merges them into one GradingReport,
 *   recomputes recommendedNextEdit over the full set, and writes it to --write (relative to
 *   --root). Exits 1 with the validation errors on bad input, never writing a partial report.
 *
 *   # Mode 3 — strict complete-product evidence validation:
 *   npx tsx tooling/grade-design-surface.ts --root . \
 *     --acceptance-report design/proofs/design-acceptance.json
 *
 *   Reads accepted DESIGN.md scope and its existing frozen rubrics. Checks every declared
 *   native and landing variant, implementation fingerprint, capture, interaction, and
 *   criterion floor. Exits 1 on incomplete or stale evidence. Never invents visual scores.
 *
 * HONEST LIMIT. This grader does not compute every Mechanical-tier dimension the two knowledge
 * docs name — vibecode.legal_links_missing needs site-shape and link-reachability analysis
 * check-vibecoded-tells.ts already owns, not a per-file regex, so it is not automated here (run
 * check:vibecoded-tells directly). Attested- and Taste-tier dimensions always need a model or a
 * founder; this tool only ever asks for that judgment, it never fabricates it.
 *
 * npm script: grade:design (deliberately not check:/validate:/render:/catalog:-prefixed, so
 * catalog/gates.ts's discoverGates() never sweeps it into a workflow's gates: array — the same
 * reasoning that already keeps grade:screenshots out of the gate registry).
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkContrastMechanical, checkTokenScaleMechanical, checkUndeclaredProofColors } from "../checks/validation/business/design/lib/worthiness-mechanical.js";
import { ALL_EXTENSIONS, TELLS } from "../checks/validation/business/design/lib/vibecode-tells.js";
import { loadDesignSystem } from "./lib/design-md.js";
import { DESIGN_TASTE_RUBRIC, findRubricDimension } from "./lib/design-taste-rubric.js";
import { selectRecommendedNextEdit, sortFindingsInFileOrder, type GradingFinding, type GradingReport } from "./lib/grading.js";
import { collectFiles, flagString, issue, parseFlags, type Issue } from "./lib/launch-state.js";
import { validateDesignAcceptance } from "../checks/validation/business/design/design-acceptance.js";

const DEFAULT_SCAN_ROOTS = ["growth/landing", "growth/funnel", "web"];
const MIN_OBSERVED_EVIDENCE_LENGTH = 10;
const MIN_NOTES_LENGTH = 20;

interface GradeDesignArgs {
  root: string;
  scanRoots: string[];
  gradingInput?: string;
  writePath?: string;
  acceptanceReport?: string;
}

function parseArgs(argv: string[]): GradeDesignArgs {
  const flags = parseFlags(argv, [
    { flags: ["--root"], key: "root" },
    { flags: ["--scan-roots"], key: "scanRoots", kind: "string", strict: true },
    { flags: ["--grading-input"], key: "gradingInput" },
    { flags: ["--write"], key: "writePath", kind: "string", strict: true },
    { flags: ["--acceptance-report"], key: "acceptanceReport", kind: "string", strict: true },
  ]);
  const root = path.resolve(flagString(flags, "root") ?? ".");
  const scanRootsFlag = flagString(flags, "scanRoots");
  const scanRoots = scanRootsFlag
    ? scanRootsFlag
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : DEFAULT_SCAN_ROOTS;
  return {
    root,
    scanRoots,
    gradingInput: flagString(flags, "gradingInput"),
    writePath: flagString(flags, "writePath"),
    acceptanceReport: flagString(flags, "acceptanceReport"),
  };
}

/** Converts a plain Issue (from either extracted library) into a rubric-tagged GradingFinding. */
function toGradingFinding(base: Issue): GradingFinding {
  const dimension = findRubricDimension(base.code);
  return { ...base, tier: dimension?.tier ?? "mechanical", dimensionKey: dimension?.key ?? base.code };
}

/**
 * Runs every rubric dimension this grader can compute today: the three worthiness-mechanical
 * checks over the whole business root, and the TELLS[] scan over each existing --scan-roots
 * entry. Pure orchestration — every actual rule lives in the two extracted libraries.
 */
function runMechanicalPass(root: string, scanRoots: readonly string[]): GradingFinding[] {
  const findings: GradingFinding[] = [];

  const design = loadDesignSystem(root);
  const proofsRoot = path.join(root, "design/proofs");
  for (const worthinessIssue of [
    ...checkContrastMechanical(design.tokens),
    ...checkTokenScaleMechanical(root, design.tokens, proofsRoot),
    ...checkUndeclaredProofColors(root, design.tokens, proofsRoot),
  ]) {
    findings.push(toGradingFinding(worthinessIssue));
  }

  for (const scanRoot of scanRoots) {
    const absoluteScanRoot = path.resolve(root, scanRoot);
    if (!existsSync(absoluteScanRoot) || !statSync(absoluteScanRoot).isDirectory()) continue;
    for (const filePath of collectFiles(absoluteScanRoot, ALL_EXTENSIONS)) {
      const source = readFileSync(filePath, "utf8");
      const extension = path.extname(filePath);
      const relative = path.relative(root, filePath);
      for (const tell of TELLS) {
        if (!tell.extensions.has(extension)) continue;
        if (!tell.detect(source)) continue;
        findings.push(toGradingFinding(issue(tell.severity, tell.code, tell.message, relative)));
      }
    }
  }

  return sortFindingsInFileOrder(findings);
}

function buildReport(findings: readonly GradingFinding[]): GradingReport {
  return {
    rubricVersion: DESIGN_TASTE_RUBRIC.rubricVersion,
    pinnedReferences: DESIGN_TASTE_RUBRIC.pinnedReferences.map((reference) => ({ referenceId: reference.referenceId, sourceSha256: reference.sourceSha256 })),
    gradedAt: new Date().toISOString(),
    findings: [...findings],
    recommendedNextEdit: selectRecommendedNextEdit(findings),
  };
}

function hasMechanicalError(findings: readonly GradingFinding[]): boolean {
  return findings.some((finding) => finding.tier === "mechanical" && finding.severity === "error");
}

// ---------------------------------------------------------------------------
// Mode 1 — task template: the Attested/Taste dimensions a model pass should judge.
// ---------------------------------------------------------------------------

function emitTaskTemplate(report: GradingReport): string {
  const lines: string[] = [];
  const judgeable = DESIGN_TASTE_RUBRIC.dimensions.filter((dimension) => !dimension.automatedByGrader);
  const attested = judgeable.filter((dimension) => dimension.tier === "attested");
  const taste = judgeable.filter((dimension) => dimension.tier === "taste");

  lines.push("# Design Taste Grading Task");
  lines.push("");
  lines.push(`Rubric ${report.rubricVersion}, pinned to ${report.pinnedReferences.map((reference) => reference.referenceId).join(" and ")}.`);
  lines.push(
    `The GradingReport printed above already covers every Mechanical-tier dimension this grader can compute (${report.findings.length} finding(s)) — do not repeat their detection. Inspect warning-level visual cues in context; a detected pattern is not a proven defect. Grade the dimensions below.`,
  );
  lines.push("");
  lines.push("## Surfaces to Grade — Attested tier");
  lines.push("");
  lines.push("A validator may only warn here; a named person's attestation is what closes each row. Record one only when you actually observe a violation.");
  lines.push("");
  for (const dimension of attested) {
    lines.push(`- \`${dimension.key}\` — ${dimension.description}`);
  }
  lines.push("");
  lines.push("## Surfaces to Grade — Taste tier");
  lines.push("");
  lines.push(
    "The founder or owner may decide directly in DESIGN.md and bind the exact candidate through b2c approve --design-taste. An independent fresh-context audit may record pass or fail in DESIGN_SYSTEM_REVIEW.md only under the current-run reducer-audited design-taste delegation; run-state binds that current audit output and excludes Design Room producer identities (knowledge/design/design-worthiness.md rule 12).",
  );
  lines.push("");
  for (const dimension of taste) {
    lines.push(`- \`${dimension.key}\` — ${dimension.description}`);
  }
  lines.push("");
  lines.push("## After grading: assemble the grading input");
  lines.push("");
  lines.push(
    "For each dimension above where you have an observation, open the actual surface and record what you saw — a headline, a specific element, a token value — not a restatement of the rubric description.",
  );
  lines.push("");
  lines.push("```json");
  lines.push("{");
  lines.push(`  "gradedAt": "${new Date().toISOString()}",`);
  lines.push('  "attested": [');
  lines.push(
    '    { "dimensionKey": "<one of the Attested keys above>", "observedEvidence": "<>=10 chars, what you actually saw>", "notes": "<>=20 chars, why this is a violation>" }',
  );
  lines.push("  ],");
  lines.push('  "taste": [');
  lines.push(
    '    { "dimensionKey": "<one of the Taste keys above>", "strength": <1-5>, "observedEvidence": "<>=10 chars, what you actually saw>", "notes": "<>=20 chars, your recommendation>" }',
  );
  lines.push("  ]");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("Leave either array empty (or omit dimensions with no observation) rather than inventing a row. Then run:");
  lines.push("");
  lines.push("```bash");
  lines.push("npx tsx tooling/grade-design-surface.ts --root . --grading-input /tmp/grading-output.json --write design/proofs/design-taste-report.json");
  lines.push("```");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Mode 2 — validate a filled grading input and merge it into the mechanical report.
// ---------------------------------------------------------------------------

interface GradingInputEntry {
  dimensionKey?: unknown;
  observedEvidence?: unknown;
  notes?: unknown;
  strength?: unknown;
}

interface GradingInput {
  gradedAt?: unknown;
  attested?: unknown;
  taste?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates a filled grading-input document and turns its entries into GradingFinding[].
 * Every rejection reason is returned rather than thrown, so mode 2 can print the complete list
 * in one pass instead of a single first-error message.
 */
function validateGradingInput(input: unknown): { errors: string[]; findings: GradingFinding[] } {
  const errors: string[] = [];
  const findings: GradingFinding[] = [];
  if (!isRecord(input)) {
    return { errors: ['grading input must be a JSON object with optional "attested" and "taste" arrays.'], findings };
  }
  const typed = input as GradingInput;
  const seenKeys = new Set<string>();

  const readEntries = (value: unknown, label: "attested" | "taste"): GradingInputEntry[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      errors.push(`"${label}" must be an array when present.`);
      return [];
    }
    return value as GradingInputEntry[];
  };

  for (const [label, tier] of [
    ["attested", "attested"],
    ["taste", "taste"],
  ] as const) {
    const entries = readEntries(typed[label], label);
    entries.forEach((entry, index) => {
      const where = `${label}[${index}]`;
      const dimensionKey = typeof entry.dimensionKey === "string" ? entry.dimensionKey : undefined;
      if (!dimensionKey) {
        errors.push(`${where}.dimensionKey is missing or not a string.`);
        return;
      }
      if (seenKeys.has(dimensionKey)) {
        errors.push(`${where}: dimensionKey "${dimensionKey}" is recorded more than once across the grading input. Consolidate into one entry.`);
        return;
      }
      const dimension = findRubricDimension(dimensionKey);
      if (!dimension) {
        errors.push(`${where}: dimensionKey "${dimensionKey}" is not a rubric dimension.`);
        return;
      }
      if (dimension.tier !== tier) {
        errors.push(`${where}: dimensionKey "${dimensionKey}" is tier "${dimension.tier}", not "${tier}". Move it to the matching array.`);
        return;
      }
      const observedEvidence = typeof entry.observedEvidence === "string" ? entry.observedEvidence.trim() : "";
      if (observedEvidence.length < MIN_OBSERVED_EVIDENCE_LENGTH) {
        errors.push(
          `${where}: observedEvidence is missing or too short (${observedEvidence.length} chars, minimum ${MIN_OBSERVED_EVIDENCE_LENGTH}). Name something you actually saw — a headline, an element, a token value.`,
        );
        return;
      }
      const notes = typeof entry.notes === "string" ? entry.notes.trim() : "";
      if (notes.length < MIN_NOTES_LENGTH) {
        errors.push(`${where}: notes is missing or too short (${notes.length} chars, minimum ${MIN_NOTES_LENGTH}).`);
        return;
      }
      let strength: number | undefined;
      if (tier === "taste") {
        const rawStrength = entry.strength;
        if (typeof rawStrength !== "number" || !Number.isInteger(rawStrength) || rawStrength < 1 || rawStrength > 5) {
          errors.push(`${where}: strength must be an integer from 1 to 5 (got ${JSON.stringify(rawStrength)}).`);
          return;
        }
        strength = rawStrength;
      }
      seenKeys.add(dimensionKey);
      findings.push({
        severity: "warning",
        code: dimensionKey,
        message: notes,
        tier: dimension.tier,
        dimensionKey,
        observedEvidence,
        ...(strength !== undefined ? { strength } : {}),
      });
    });
  }

  if (errors.length === 0 && findings.length === 0) {
    errors.push(
      'grading input has neither an "attested" nor a "taste" observation. Grade at least one dimension, or skip this mode when there is nothing to record.',
    );
  }

  return { errors, findings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
// Explicit complete-design acceptance is separate from the unchanged advisory modes.
// This validates a reviewer's existing evidence; it never generates taste judgments.
if (args.acceptanceReport) {
  if (args.gradingInput || args.writePath) {
    console.error("--acceptance-report cannot be combined with advisory --grading-input or --write");
    process.exit(1);
  }
  const acceptanceIssues = validateDesignAcceptance(args.root, args.acceptanceReport);
  console.log(JSON.stringify({ kind: "design-acceptance-evidence", issues: acceptanceIssues }, null, 2));
  process.exit(acceptanceIssues.some((finding) => finding.severity === "error") ? 1 : 0);
}
const mechanicalFindings = runMechanicalPass(args.root, args.scanRoots);

if (args.gradingInput && args.writePath) {
  console.log("grade-design-surface: VALIDATE + WRITE mode");
  console.log(`  Grading input: ${args.gradingInput}`);
  console.log(`  Write path:    ${path.join(args.root, args.writePath)}`);
  console.log("");

  let raw: string;
  try {
    raw = readFileSync(path.resolve(args.gradingInput), "utf8");
  } catch (err) {
    console.error(`ERROR: Could not read grading input at ${args.gradingInput}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: Grading input is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { errors, findings: judgedFindings } = validateGradingInput(parsed);
  if (errors.length > 0) {
    console.error("VALIDATION FAILED — grading input has errors:");
    for (const error of errors) console.error(`  ERROR: ${error}`);
    process.exit(1);
  }

  const mergedFindings = sortFindingsInFileOrder([...mechanicalFindings, ...judgedFindings]);
  const report = buildReport(mergedFindings);
  const absoluteWritePath = path.join(args.root, args.writePath);
  writeFileSync(absoluteWritePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`OK: Grading report written to ${absoluteWritePath}`);
  console.log(`    recommendedNextEdit: ${report.recommendedNextEdit}`);
  process.exit(0);
}

console.log("grade-design-surface: TASK TEMPLATE mode");
console.log("");

const report = buildReport(mechanicalFindings);
console.log(JSON.stringify(report, null, 2));
console.log("");

if (hasMechanicalError(mechanicalFindings)) {
  console.log("Mechanical errors found. Fix these first — design-worthiness.md rule 12 sends a taste");
  console.log("packet only after mechanical checks pass. Re-run this command once they are clean.");
} else {
  console.log(emitTaskTemplate(report));
}
