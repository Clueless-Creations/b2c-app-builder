#!/usr/bin/env node
/**
 * grade-screenshots.ts — Separate grading pass scaffold for the screenshot rubric.
 *
 * PURPOSE
 * -------
 * This script is the entry point for the SEPARATE grading pass required by the
 * SCREENSHOT_RUBRIC.md producer-vs-verifier control. It does NOT score screenshots
 * itself — scoring is done by a vision agent that reads the task template this
 * script emits. The separation between this scaffold and the scoring step is
 * intentional: it forces the grading invocation to be a distinct process.
 *
 * HONEST LIMIT
 * -----------
 * The validator can enforce that grading_pass.separate_pass is present and that
 * builder.session_id != grader.session_id, but it cannot prove that two truly
 * independent processes ran. A single agent that knows the schema can fabricate
 * both fields. The raised bar here is: faking requires deliberate fabrication of
 * two session identities plus an explicit separation attestation — accidental or
 * lazy bypasses are caught; determined fabrication is not. Founder approval is the
 * ultimate backstop, as documented in SCREENSHOT_RUBRIC.md.
 *
 * USAGE
 * -----
 *   # Step 1 — Emit a grading task template to stdout (vision agent fills it):
 *   npx tsx tooling/grade-screenshots.ts --root . --state state/business-state.json
 *
 *   # Step 2 — After the vision agent fills the template, validate and write the ledger:
 *   npx tsx tooling/grade-screenshots.ts --root . --state state/business-state.json \
 *     --write screenshot-rubric-scores.json \
 *     --grading-input /tmp/grading-output.json
 *
 * The orchestrator registers this as: npm run grade:screenshots
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCliArgs } from "./lib/launch-state.js";

// ---------------------------------------------------------------------------
// PNG IHDR parsing (dependency-free, reuses same approach as check-store-screenshots.ts)
// ---------------------------------------------------------------------------

interface PngDimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_MIN_HEADER_BYTES = 29;

function readPngDimensions(absPath: string): PngDimensions | { error: string } {
  let buf: Buffer;
  try {
    const fd = openSync(absPath, "r");
    buf = Buffer.alloc(PNG_MIN_HEADER_BYTES);
    const bytesRead = readSync(fd, buf, 0, PNG_MIN_HEADER_BYTES, 0);
    closeSync(fd);
    if (bytesRead < PNG_MIN_HEADER_BYTES) {
      return { error: `file too small (${bytesRead} bytes read, need ${PNG_MIN_HEADER_BYTES})` };
    }
  } catch (err) {
    return { error: `could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  for (let i = 0; i < 8; i++) {
    if ((buf[i] as number | undefined) !== (PNG_SIGNATURE[i] as number | undefined)) {
      return { error: "not a valid PNG (signature mismatch)" };
    }
  }

  const chunkType = buf.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    return { error: `expected IHDR chunk but got "${chunkType}"` };
  }

  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

// ---------------------------------------------------------------------------
// CLI argument parsing — extends parseCliArgs with grade-specific flags
// ---------------------------------------------------------------------------

interface GradeArgs {
  root: string;
  statePath: string;
  /** If set, read this grading-output JSON and validate + write to --write path. */
  gradingInput?: string;
  /** If set, write the validated ledger to this path (relative to --root). */
  writePath?: string;
}

function parseGradeArgs(argv: string[]): GradeArgs {
  const base = parseCliArgs(argv);
  let gradingInput: string | undefined;
  let writePath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const value = argv[i + 1];
    if (token === "--grading-input" && value) {
      gradingInput = path.isAbsolute(value) ? value : path.resolve(value);
      i++;
    } else if (token === "--write" && value) {
      writePath = value;
      i++;
    }
  }

  return { root: base.root, statePath: base.statePath, gradingInput, writePath };
}

// ---------------------------------------------------------------------------
// SCREENSHOTS.md parsing — extract final PNG paths declared in the document
// ---------------------------------------------------------------------------

interface SlotEntry {
  slot: number;
  locale: string;
  device_well: string;
  final_png: string;
  real_width?: number;
  real_height?: number;
  dimension_error?: string;
}

const SCREENSHOTS_CANDIDATES = ["SCREENSHOTS.md", "screenshots/SCREENSHOTS.md", "store/app-store-listing/SCREENSHOTS.md"];

function findScreenshotsMd(root: string): { relativePath: string; text: string } | undefined {
  for (const candidate of SCREENSHOTS_CANDIDATES) {
    const absPath = path.join(root, candidate);
    if (existsSync(absPath)) {
      return { relativePath: candidate, text: readFileSync(absPath, "utf8") };
    }
  }
  return undefined;
}

/**
 * Extract final PNG paths from SCREENSHOTS.md Production Composition Matrix table.
 * Columns in such a table typically contain paths like screenshots/final/.../*.png
 */
function extractFinalPngEntries(root: string, text: string): SlotEntry[] {
  const entries: SlotEntry[] = [];
  let slotCounter = 0;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed.split("|").map((c) => c.trim());
    for (const cell of cells) {
      const cleaned = cell.replace(/`/g, "").trim();
      if (/^screenshots\/final\//i.test(cleaned) && /\.(png|jpg|jpeg)$/i.test(cleaned)) {
        slotCounter++;
        // Attempt to parse locale and device_well from path structure:
        // Expected: screenshots/final/<locale>/<device_well>/slot-N.png
        const parts = cleaned.split("/");
        const locale = parts[2] ?? "unknown";
        const device_well = parts[3] ?? "unknown";
        const slotMatch = cleaned.match(/slot[-_]?(\d+)/i);
        const slot = slotMatch ? Number(slotMatch[1]) : slotCounter;

        const absPath = path.join(root, cleaned);
        let real_width: number | undefined;
        let real_height: number | undefined;
        let dimension_error: string | undefined;

        if (existsSync(absPath)) {
          const dims = readPngDimensions(absPath);
          if ("error" in dims) {
            dimension_error = dims.error;
          } else {
            real_width = dims.width;
            real_height = dims.height;
          }
        } else {
          dimension_error = "file not found on disk";
        }

        entries.push({ slot, locale, device_well, final_png: cleaned, real_width, real_height, dimension_error });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Rubric dimensions — mirrors SCREENSHOT_RUBRIC.md
// ---------------------------------------------------------------------------

// points mirrors SCREENSHOT_RUBRIC.md's Weighted Score Formula: HIGH=3, MEDIUM=2, LOW=1.
// The grading model never sees these numbers — it scores each dimension 0-3, and
// computeWeightedScore below carries the arithmetic in code, not in the model's prose.
const RUBRIC_DIMENSIONS = [
  { key: "thumbnail_legibility", weight: "HIGH", points: 3, description: "Headline and key UI legible at 60px thumbnail width" },
  { key: "hook_first", weight: "HIGH", points: 3, description: "Slot 1 shows the 11-star V1 payoff; ordering tells a story" },
  { key: "truthfulness", weight: "HIGH", points: 3, description: "Every visible claim matches shipped UI and revenue/REVENUE_OPS.md" },
  { key: "one_idea_per_slot", weight: "MEDIUM", points: 2, description: "One clear idea per slot; supporting elements reinforce it" },
  { key: "brand_token_fidelity", weight: "MEDIUM", points: 2, description: "Colors, type, and motion match the authored DESIGN.md contract" },
  { key: "aso_keyword_reinforcement", weight: "MEDIUM", points: 2, description: "Primary + secondary keywords visible across deck headlines" },
  { key: "emotional_north_star", weight: "LOW", points: 1, description: "Target emotion from EMOTIONAL_DESIGN.md felt within 2 seconds" },
  { key: "localization_quality", weight: "LOW (non-en-US only)", points: 1, description: "Natural-sounding locale copy; RTL layout correct; no truncation" },
];

// SCREENSHOT_RUBRIC.md's Weighted Score Formula: threshold 0.65, and each HIGH dimension
// must independently reach 2 for a slot to auto-pass.
const PASS_THRESHOLD = 0.65;
const HIGH_DIMENSION_MINIMUM = 2;
const HIGH_DIMENSION_KEYS = RUBRIC_DIMENSIONS.filter((dim) => dim.weight === "HIGH").map((dim) => dim.key);

interface WeightedScoreResult {
  weightedScore: number | null;
  pass: boolean;
  errors: string[];
}

/**
 * Computes weighted_score and pass from raw 0-3 dimension scores, in code — the grading
 * model supplies only the dimension scores and never fills weighted_score or pass itself.
 * For an en-US slot, localization_quality is excluded from both numerator and denominator
 * (SCREENSHOT_RUBRIC.md: "For en-US it is excluded and the denominator drops to 16").
 */
function computeWeightedScore(dimensions: Record<string, unknown>, locale: string): WeightedScoreResult {
  const errors: string[] = [];
  const isEnUs = locale.trim().toLowerCase() === "en-us";
  let numerator = 0;
  let denominator = 0;

  for (const dim of RUBRIC_DIMENSIONS) {
    if (dim.key === "localization_quality" && isEnUs) continue;
    const raw = dimensions[dim.key];
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 3) {
      errors.push(`dimensions.${dim.key} must be an integer 0-3 (found: ${JSON.stringify(raw)})`);
      continue;
    }
    numerator += raw * dim.points;
    denominator += dim.points;
  }

  if (errors.length > 0) return { weightedScore: null, pass: false, errors };

  const weightedScore = numerator / denominator;
  const highDimensionsMet = HIGH_DIMENSION_KEYS.every((key) => (dimensions[key] as number) >= HIGH_DIMENSION_MINIMUM);
  return { weightedScore, pass: highDimensionsMet && weightedScore >= PASS_THRESHOLD, errors };
}

// ---------------------------------------------------------------------------
// Task template emitter — what the vision agent reads and fills in
// ---------------------------------------------------------------------------

function emitGradingTaskTemplate(entries: SlotEntry[]): string {
  const lines: string[] = [];

  lines.push("# Screenshot Grading Task");
  lines.push("");
  lines.push("## GRADER IDENTITY — fill before scoring");
  lines.push("");
  lines.push("You are the grader, a different agent or session than the builder.");
  lines.push("A builder grading its own output misses the defects it introduced.");
  lines.push("Fill in your identity before proceeding:");
  lines.push("");
  lines.push("```json");
  lines.push("{");
  lines.push('  "builder": {');
  lines.push('    "agent": "<builder-agent-name>",');
  lines.push('    "session_id": "<builder-session-id>"');
  lines.push("  },");
  lines.push('  "grader": {');
  lines.push('    "agent": "<YOUR-agent-name>",');
  lines.push('    "session_id": "<YOUR-session-id>"');
  lines.push("  },");
  lines.push('  "grading_pass": {');
  lines.push('    "separate_pass": true,');
  lines.push(`    "started_at": "${new Date().toISOString()}",`);
  lines.push('    "method": "vision"');
  lines.push("  }");
  lines.push("}");
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Rubric Dimensions (score each 0–3)");
  lines.push("");
  lines.push("| # | Dimension | Weight | 0 | 1 | 2 (threshold) | 3 |");
  lines.push("|----|-----------|--------|---|---|---------------|---|");
  for (const dim of RUBRIC_DIMENSIONS) {
    lines.push(`| - | **${dim.key}** | ${dim.weight} | (see SCREENSHOT_RUBRIC.md) | | | |`);
  }
  lines.push("");
  lines.push(
    "Score each dimension from 0 to 3 in the `dimensions` block. Do not compute weighted_score or pass — leave those two fields out of your JSON entirely.",
  );
  lines.push(
    "The validator computes weighted_score and pass from your dimension scores, using the fixed weights in SCREENSHOT_RUBRIC.md, then writes both fields into the ledger before it is saved.",
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Slots to Grade");
  lines.push("");

  if (entries.length === 0) {
    lines.push("WARNING: No final PNG paths found in SCREENSHOTS.md. Ensure the Production");
    lines.push("Composition Matrix is populated with screenshots/final/... paths before grading.");
    lines.push("");
  }

  for (const entry of entries) {
    const dimLine = (key: string, weight: string) => `  - ${key} (${weight}): score=<0-3>, notes=<explain what you see>`;

    lines.push(`### Slot ${entry.slot} — locale: ${entry.locale} — device_well: ${entry.device_well}`);
    lines.push("");
    lines.push(`**PNG path:** \`${entry.final_png}\``);

    if (entry.dimension_error) {
      lines.push(`**WARNING:** Could not read PNG dimensions — ${entry.dimension_error}`);
    } else if (entry.real_width !== undefined && entry.real_height !== undefined) {
      lines.push(`**Observed PNG dimensions (from IHDR):** ${entry.real_width}x${entry.real_height}px`);
    }

    lines.push("");
    lines.push("Open this PNG and fill in ALL fields below. The `observed_evidence` line must");
    lines.push("reference something you actually saw in the image (headline text, dominant color,");
    lines.push("a specific UI element). A grader who never opened the PNG cannot fill this.");
    lines.push("");
    lines.push("```json");
    lines.push("{");
    lines.push(`  "slot": ${entry.slot},`);
    lines.push(`  "locale": "${entry.locale}",`);
    lines.push(`  "device_well": "${entry.device_well}",`);
    lines.push(`  "final_png": "${entry.final_png}",`);
    if (entry.real_width !== undefined && entry.real_height !== undefined) {
      lines.push(`  "observed_png_dimensions": "${entry.real_width}x${entry.real_height}",`);
    }
    lines.push(`  "graded_at": "${new Date().toISOString()}",`);
    lines.push('  "rubric_version": "1.2",');
    lines.push('  "dimensions": {');
    for (const dim of RUBRIC_DIMENSIONS) {
      lines.push(`    "${dim.key}": <0|1|2|3|null>,  // ${dim.description}`);
    }
    lines.push("  },");
    lines.push('  "grader_notes": "<REQUIRED: one paragraph minimum explaining the score for each dimension that could plausibly change>",');
    lines.push('  "observed_evidence": "<REQUIRED: one line referencing something you actually saw — headline text, dominant color, specific UI element>",');
    lines.push('  "override": null');
    lines.push("}");
    lines.push("```");
    lines.push("");

    for (const dim of RUBRIC_DIMENSIONS) {
      lines.push(dimLine(dim.key, dim.weight));
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## After Scoring: Assemble the Ledger");
  lines.push("");
  lines.push("Combine the identity block + all slot blocks into a single JSON file at");
  lines.push("`screenshot-rubric-scores.json`. Then run:");
  lines.push("");
  lines.push("```bash");
  lines.push("npx tsx tooling/grade-screenshots.ts \\");
  lines.push("  --root . --state state/business-state.json \\");
  lines.push("  --grading-input /tmp/grading-output.json \\");
  lines.push("  --write screenshot-rubric-scores.json");
  lines.push("```");
  lines.push("");
  lines.push("This validates builder != grader, separate_pass=true, and notes present,");
  lines.push("then writes the final ledger. store_console CANNOT be marked done until");
  lines.push("this separate-pass ledger exists and passes validation.");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Grading input validation — checks the assembled ledger before writing
// ---------------------------------------------------------------------------

interface GradingPassBlock {
  separate_pass?: boolean;
  started_at?: string;
  method?: string;
}

interface IdentityBlock {
  agent?: string;
  session_id?: string;
}

interface GradingLedger {
  builder?: IdentityBlock;
  grader?: IdentityBlock;
  grading_pass?: GradingPassBlock;
  slots?: unknown[];
  [key: string]: unknown;
}

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function validateGradingLedger(ledger: GradingLedger): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check builder/grader are present and distinct
  const builderAgent = ledger.builder?.agent?.trim() ?? "";
  const builderSession = ledger.builder?.session_id?.trim() ?? "";
  const graderAgent = ledger.grader?.agent?.trim() ?? "";
  const graderSession = ledger.grader?.session_id?.trim() ?? "";

  if (!builderAgent) errors.push("builder.agent is missing or empty");
  if (!builderSession) errors.push("builder.session_id is missing or empty");
  if (!graderAgent) errors.push("grader.agent is missing or empty");
  if (!graderSession) errors.push("grader.session_id is missing or empty");

  if (builderSession && graderSession && builderSession === graderSession) {
    errors.push(
      `builder.session_id ("${builderSession}") equals grader.session_id — the grader must be a different session than the builder. This is the core producer-vs-verifier control.`,
    );
  }

  // Check grading_pass
  const gp = ledger.grading_pass;
  if (!gp) {
    errors.push("grading_pass block is missing. Add { separate_pass: true, started_at, method: 'vision' }");
  } else {
    if (gp.separate_pass !== true) {
      errors.push(`grading_pass.separate_pass must be true (found: ${JSON.stringify(gp.separate_pass)})`);
    }
    if (!gp.started_at?.trim()) {
      errors.push("grading_pass.started_at is missing or empty");
    }
    if (!gp.method?.trim()) {
      errors.push("grading_pass.method is missing or empty");
    }
  }

  // Check slots
  const slots = ledger.slots;
  if (!Array.isArray(slots) || slots.length === 0) {
    errors.push("slots array is missing or empty");
    return { ok: errors.length === 0, errors, warnings };
  }

  for (const rawSlot of slots) {
    if (typeof rawSlot !== "object" || rawSlot === null) {
      errors.push("slot entry is not an object");
      continue;
    }
    const slot = rawSlot as Record<string, unknown>;
    const id = `slot ${slot["slot"] ?? "?"} locale ${slot["locale"] ?? "?"} well ${slot["device_well"] ?? "?"}`;

    // grader_notes required and substantive
    const graderNotes = typeof slot["grader_notes"] === "string" ? slot["grader_notes"].trim() : "";
    if (graderNotes.length < 20) {
      errors.push(
        `${id}: grader_notes is missing or too short (${graderNotes.length} chars, minimum 20). The grader must explain the score for each dimension.`,
      );
    }

    // observed_evidence required — this is the anti-fabrication control
    const observedEvidence = typeof slot["observed_evidence"] === "string" ? slot["observed_evidence"].trim() : "";
    if (observedEvidence.length < 10) {
      errors.push(
        `${id}: observed_evidence is missing or too short (${observedEvidence.length} chars, minimum 10). Write one line referencing something you actually observed in the PNG — headline text, dominant color, a specific UI element. A grader who never opened the PNG cannot fill this field.`,
      );
    }

    // dimensions block — the validator computes weighted_score and pass from these raw
    // scores in code; it never trusts a self-reported weighted_score or pass field.
    const dims = slot["dimensions"];
    if (typeof dims !== "object" || dims === null) {
      errors.push(`${id}: dimensions block is missing`);
    } else {
      const locale = typeof slot["locale"] === "string" ? slot["locale"] : "";
      const scored = computeWeightedScore(dims as Record<string, unknown>, locale);
      if (scored.errors.length > 0) {
        for (const dimError of scored.errors) errors.push(`${id}: ${dimError}`);
      } else {
        slot["weighted_score"] = scored.weightedScore;
        slot["pass"] = scored.pass;
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseGradeArgs(process.argv.slice(2));

// Mode 1: --grading-input + --write — validate and write the ledger
if (args.gradingInput && args.writePath) {
  console.log("grade-screenshots: VALIDATE + WRITE mode");
  console.log(`  Grading input:  ${args.gradingInput}`);
  console.log(`  Write path:     ${path.join(args.root, args.writePath)}`);
  console.log("");

  let raw: string;
  try {
    raw = readFileSync(args.gradingInput, "utf8");
  } catch (err) {
    console.error(`ERROR: Could not read grading input at ${args.gradingInput}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  let ledger: GradingLedger;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new TypeError("grading input must be a JSON object");
    }
    ledger = parsed as GradingLedger;
  } catch (err) {
    console.error(`ERROR: Grading input is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const result = validateGradingLedger(ledger);

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.warn(`  WARNING: ${w}`);
    }
  }

  if (!result.ok) {
    console.error("VALIDATION FAILED — ledger has errors:");
    for (const e of result.errors) {
      console.error(`  ERROR: ${e}`);
    }
    console.error("");
    console.error("Fix the errors above before writing the ledger.");
    console.error("store_console CANNOT be marked done until a separate-pass ledger passes validation.");
    process.exit(1);
  }

  const absWritePath = path.join(args.root, args.writePath);
  writeFileSync(absWritePath, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  console.log(`OK: Grading ledger written to ${absWritePath}`);
  console.log("    Run 'npm run check:store-screenshots' to verify the full rubric check.");
  process.exit(0);
}

// Mode 2: task template emitter — print grading task to stdout
console.log("grade-screenshots: TASK TEMPLATE mode");
console.log("");

const screenshotsMd = findScreenshotsMd(args.root);
if (!screenshotsMd) {
  console.error("WARNING: SCREENSHOTS.md not found under root. The grading task template");
  console.error("will have no slot entries. Create SCREENSHOTS.md and populate the");
  console.error("Production Composition Matrix with final PNG paths before grading.");
  console.error("");
}

const entries = screenshotsMd ? extractFinalPngEntries(args.root, screenshotsMd.text) : [];

if (screenshotsMd && entries.length === 0) {
  console.error(`WARNING: ${screenshotsMd.relativePath} found but no final PNG paths extracted.`);
  console.error("Ensure the Production Composition Matrix contains screenshots/final/... paths.");
  console.error("");
}

const template = emitGradingTaskTemplate(entries);
console.log(template);

console.log("==========================================================");
console.log("BLOCKING: store_console CANNOT be marked done until a");
console.log("separate-pass grading ledger exists and passes validation.");
console.log("Run grade-screenshots with --grading-input + --write after");
console.log("the vision agent fills in scores, then re-run:");
console.log("  npm run check:store-screenshots -- --root . --state state/business-state.json");
console.log("==========================================================");
