#!/usr/bin/env node
import { closeSync, existsSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";
import {
  asArray,
  asString,
  getPath,
  issue,
  loadProjectState,
  missingPhraseCode,
  parseCliArgs,
  readText,
  reportAndExit,
} from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues = [...loaded.issues];
const state = loaded.state;

// ---------------------------------------------------------------------------
// Helpers shared with existing phrase checks
// ---------------------------------------------------------------------------

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

function requirePhrases(text: string, phrases: string[], prefix: string, file: string): void {
  for (const phrase of phrases) {
    if (!includes(text, phrase)) {
      issues.push(issue("error", missingPhraseCode(prefix, phrase), `${file} should include ${phrase}.`, file));
    }
  }
}

function checkReadyDeviceRows(text: string, file: string): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !/\b(iPhone|iPad|IPHONE_|IPAD_)\b/i.test(trimmed)) {
      continue;
    }
    const ready = /\b(ready|done|uploaded|upload-ready)\b/i.test(trimmed);
    if (!ready) {
      continue;
    }
    if (!/\b\d{3,4}x\d{3,4}\b/.test(trimmed)) {
      issues.push(issue("error", "store_screenshots.ready_well_dimensions_missing", `Ready Apple screenshot row needs exact dimensions: "${trimmed}"`, file));
    }
    if (!/\b(ASC device_type|device_type|IPHONE_[A-Z0-9_]+|IPAD_[A-Z0-9_]+)\b/i.test(trimmed)) {
      issues.push(
        issue(
          "error",
          "store_screenshots.ready_well_device_type_missing",
          `Ready Apple screenshot row needs ASC device_type or equivalent: "${trimmed}"`,
          file,
        ),
      );
    }
    const countMatch = trimmed.match(/\b(\d{1,2})\s+screenshots?\b|\b(?:count|screenshots?)\s*:?\s*(\d{1,2})\b/i);
    if (!countMatch) {
      issues.push(
        issue("error", "store_screenshots.ready_well_count_missing", `Ready Apple screenshot row needs screenshot count between 1 and 10: "${trimmed}"`, file),
      );
    } else {
      const count = Number(countMatch[1] ?? countMatch[2]);
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        issues.push(issue("error", "store_screenshots.ready_well_count_invalid", `Apple screenshot count must be 1-10: "${trimmed}"`, file));
      }
    }
  }
}

function hasProductionComposition(text: string): boolean {
  return /\b(production composition|composed|framed|device frame|copy overlay|headline|export matrix|final upload|mockup|screenshot html|app store screenshot)\b/i.test(
    text,
  );
}

function checkRawOnlyReadiness(text: string, file: string, storeStatus?: string): void {
  const claimsReady = storeStatus === "succeeded" || /\b(done|complete|launch-ready|ready|upload-ready|production-ready)\b/i.test(text);
  const rawMentions = /\b(raw|plain)\s+(device\s+)?screenshots?\b/i.test(text);

  if (claimsReady && rawMentions && !hasProductionComposition(text)) {
    issues.push(
      issue(
        "error",
        "store_screenshots.raw_only_ready",
        "Screenshot work cannot be marked ready from raw/plain captures alone; final App Store compositions need copy, frames, dimensions, and QA proof.",
        file,
      ),
    );
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const rawUploadClaim = /\b(raw|plain)\s+(device\s+)?screenshots?\b/i.test(trimmed) && /\b(upload|ready|final|complete|done)\b/i.test(trimmed);
    if (rawUploadClaim && !/\b(compos|frame|proof|source layer|intermediate)\b/i.test(trimmed)) {
      issues.push(
        issue("error", "store_screenshots.raw_capture_as_final", `Raw screenshot line appears to treat capture as final upload art: "${trimmed}"`, file),
      );
    }
  }
}

function checkFinalPaths(text: string, file: string): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !/\b(final upload|screenshots\/final|upload path)\b/i.test(trimmed)) {
      continue;
    }
    if (/screenshots\/raw\//i.test(trimmed)) {
      issues.push(issue("error", "store_screenshots.raw_path_used_as_final", `Final upload row should not point at a raw capture path: "${trimmed}"`, file));
    }
  }
}

function checkAppPreviewRequired(text: string, file: string): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !/\b(App Preview 1|iOS Preview 1|autoplay hook)\b/i.test(trimmed)) {
      continue;
    }
    const optional = /\boptional\b/i.test(trimmed);
    const founderDeferred = /\b(deferred|founder-approved deferral|founder approved deferral)\b/i.test(trimmed);
    if (optional && !founderDeferred) {
      issues.push(
        issue(
          "error",
          "store_screenshots.app_preview_optional_without_deferral",
          `The first iOS App Preview is required for iOS launch unless explicitly deferred with founder approval: "${trimmed}"`,
          file,
        ),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// PROVEN layer helpers — hard-errors for on-disk evidence
// ---------------------------------------------------------------------------

/**
 * Extract file paths from a markdown table column that looks like a relative
 * file path (starts with screenshots/ or similar).
 */
function extractPathsFromTable(text: string, columnPattern: RegExp): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }
    const cells = trimmed.split("|").map((cell) => cell.trim());
    for (const cell of cells) {
      if (columnPattern.test(cell) && /\.(png|jpg|jpeg|webp)$/i.test(cell)) {
        // Strip backticks if present
        const cleaned = cell.replaceAll("`", "").trim();
        if (cleaned && !cleaned.startsWith("Pending") && !cleaned.startsWith("blocked") && cleaned !== "n/a") {
          paths.push(cleaned);
        }
      }
    }
  }
  return paths;
}

/**
 * When store_console is "done", every raw capture path listed in the Raw
 * Capture Matrix must exist on disk.
 */
function checkRawCapturesExist(text: string, file: string): void {
  const rawPaths = extractPathsFromTable(text, /^screenshots\/raw\//i);
  for (const rawPath of rawPaths) {
    const absPath = path.join(args.root, rawPath);
    if (!existsSync(absPath)) {
      issues.push(
        issue("error", "store_screenshots.raw_capture_missing_on_disk", `Raw capture path listed in ${file} does not exist on disk: ${rawPath}`, rawPath),
      );
    }
  }
}

/**
 * When store_console is "done", every final PNG path listed in the Production
 * Composition Matrix must exist on disk.
 */
function checkFinalPngsExist(text: string, file: string): void {
  const finalPaths = extractPathsFromTable(text, /^screenshots\/final\//i);
  for (const finalPath of finalPaths) {
    const absPath = path.join(args.root, finalPath);
    if (!existsSync(absPath)) {
      issues.push(issue("error", "store_screenshots.final_png_missing", `Final PNG path listed in ${file} does not exist on disk: ${finalPath}`, finalPath));
    }
  }
}

/**
 * When store_console is "done" and app-store-screenshots.json is present,
 * check that it references DESIGN.md (token fold-in wired).
 */
function checkThemeTokenDerived(appStoreScreenshotsPath: string): void {
  const absPath = path.join(args.root, appStoreScreenshotsPath);
  if (!existsSync(absPath)) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    issues.push(
      issue("error", "store_screenshots.app_store_screenshots_json_invalid", `${appStoreScreenshotsPath} is not valid JSON.`, appStoreScreenshotsPath),
    );
    return;
  }
  // Look for a tokensSource field or a direct reference to the authored contract.
  const raw = JSON.stringify(parsed);
  if (!raw.includes("DESIGN.md") && !raw.includes("tokensSource")) {
    issues.push(
      issue(
        "warning",
        "store_screenshots.theme_not_token_derived",
        `${appStoreScreenshotsPath} does not reference DESIGN.md or include a tokensSource field. The screenshot theme must be promoted from the authored design contract to satisfy the PROVEN layer.`,
        appStoreScreenshotsPath,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// OPTIMIZED layer — rubric score ledger checks
// ---------------------------------------------------------------------------

interface RubricDimensions {
  thumbnail_legibility?: number | null;
  hook_first?: number | null;
  truthfulness?: number | null;
  one_idea_per_slot?: number | null;
  brand_token_fidelity?: number | null;
  aso_keyword_reinforcement?: number | null;
  emotional_north_star?: number | null;
  localization_quality?: number | null;
}

interface RubricOverride {
  by?: string;
  reason?: string;
  at?: string;
}

interface RubricSlot {
  slot?: number;
  platform?: string;
  locale?: string;
  device_well?: string;
  product_page?: string;
  final_png?: string;
  pass?: boolean;
  override?: RubricOverride | null;
  dimensions?: RubricDimensions;
  weighted_score?: number;
  /** Grader's textual notes explaining the score for this slot. Required. */
  grader_notes?: string | null;
  /**
   * v1.2+: one-line note referencing something the grader actually observed in
   * the PNG (headline text, dominant color, a specific UI element). A grader who
   * never opened the PNG cannot easily fill this field without fabricating it.
   * Required when store_console is "done" or "partial".
   */
  observed_evidence?: string | null;
}

interface RubricIdentity {
  agent?: string | null;
  session_id?: string | null;
}

interface RubricGradingPass {
  separate_pass?: boolean | null;
  started_at?: string | null;
  method?: string | null;
}

interface RubricLedger {
  slots?: RubricSlot[];
  /** Distinct structured identities for the producer and reviewer. */
  builder?: RubricIdentity | null;
  grader?: RubricIdentity | null;
  /**
   * v1.2+: attestation that grading was a distinct invocation from building.
   * Required when store_console is "done".
   */
  grading_pass?: RubricGradingPass | null;
}

function isRubricLedger(value: unknown): value is RubricLedger {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Find the rubric scores ledger. Accepts the canonical name or a project-level
 * override declared in SCREENSHOTS.md as `screenshot-rubric-scores.<name>.json`.
 */
function findRubricLedgerPath(): string | undefined {
  const candidates = ["screenshot-rubric-scores.json", "screenshots/screenshot-rubric-scores.json", "store/app-store-listing/screenshot-rubric-scores.json"];
  return candidates.find((candidate) => existsSync(path.join(args.root, candidate)));
}

// ---------------------------------------------------------------------------
// Tier 1: known ASC device well pixel dimensions (portrait, w x h)
// Sourced from Apple App Store Connect screenshot spec. Refresh via:
//   asc screenshots sizes --all
// The validator checks these against the real PNG IHDR; only wells whose
// final PNGs are on disk are checked (Tier 3 gating handles missing files).
// ---------------------------------------------------------------------------
const ASC_WELL_DIMENSIONS: Record<string, { width: number; height: number }[]> = {
  // iPhone 6.9-inch (current flagship)
  "iphone-69": [{ width: 1320, height: 2868 }],
  // iPhone 6.5-inch (includes older Super Retina XDR)
  "iphone-65": [
    { width: 1284, height: 2778 },
    { width: 1242, height: 2688 },
  ],
  // iPhone 6.3-inch
  "iphone-63": [{ width: 1179, height: 2556 }],
  // iPhone 6.1-inch
  "iphone-61": [
    { width: 1170, height: 2532 },
    { width: 1080, height: 2340 },
  ],
  // iPhone 5.5-inch
  "iphone-55": [{ width: 1242, height: 2208 }],
  // iPad 13-inch
  "ipad-13": [
    { width: 2064, height: 2752 },
    { width: 2048, height: 2732 },
  ],
  // iPad 12.9-inch (4th gen and earlier)
  "ipad-129": [{ width: 2048, height: 2732 }],
  // iPad 11-inch / 10.5-inch
  "ipad-11": [{ width: 1668, height: 2388 }],
  // iPad 10.2-inch / 9.7-inch
  "ipad-97": [{ width: 768, height: 1024 }],
};

// ---------------------------------------------------------------------------
// Tier 3: PNG IHDR binary parsing
//
// PNG structure:
//   8-byte signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
//   First chunk: 4-byte length (big-endian), 4-byte type "IHDR", 13-byte data
//   IHDR data: width(4), height(4), bit_depth(1), color_type(1), compression(1),
//              filter(1), interlace(1)
//
// color_type values:
//   0 = greyscale (no alpha)
//   2 = truecolor RGB (no alpha)
//   3 = indexed-color (no alpha)
//   4 = greyscale + alpha
//   6 = truecolor + alpha (RGBA)
//
// Alpha is present when color_type is 4 or 6.
// Note: this is a raised bar vs hand-typed JSON but not unforgeable — a
// carefully crafted fake PNG header could pass. Founder approval is the
// ultimate backstop; this check catches accidental/lazy bypasses.
// ---------------------------------------------------------------------------

interface PngIhdr {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  hasAlpha: boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Minimum bytes: 8 (sig) + 4 (len) + 4 (type) + 13 (IHDR data) = 29
const PNG_MIN_HEADER_BYTES = 29;

function parsePngIhdr(absPath: string): PngIhdr | { error: string } {
  let buf: Buffer;
  try {
    // Read only the first 29 bytes — we only need the IHDR.
    // node:fs functions are imported at module top — require() is unavailable
    // in the tsx ESM runtime and previously made every IHDR parse fail.
    const fd = openSync(absPath, "r");
    buf = Buffer.alloc(PNG_MIN_HEADER_BYTES);
    const bytesRead = readSync(fd, buf, 0, PNG_MIN_HEADER_BYTES, 0);
    closeSync(fd);
    if (bytesRead < PNG_MIN_HEADER_BYTES) {
      return { error: `file too small to contain a PNG IHDR (${bytesRead} bytes read, need ${PNG_MIN_HEADER_BYTES})` };
    }
  } catch (err) {
    return { error: `could not read file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Verify PNG signature
  for (let index = 0; index < 8; index++) {
    // Both Buffer indexers can return undefined in strict TS; cast to number for comparison
    if ((buf[index] as number | undefined) !== (PNG_SIGNATURE[index] as number | undefined)) {
      return { error: "file does not start with a valid PNG signature — is this really a PNG?" };
    }
  }

  // Chunk at offset 8: length (4) + type (4) + data (13)
  const chunkType = buf.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    return { error: `expected first chunk to be IHDR but got "${chunkType}"` };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  // Buffer index access returns number|undefined in strict TS; default to 0 if out of range
  // (we already validated bytesRead >= 29, so these offsets are safe, but TS doesn't know that)
  const bitDepth: number = buf[24] ?? 0;
  const colorType: number = buf[25] ?? 0;
  // color_type 4 = greyscale+alpha, 6 = RGBA
  const hasAlpha = colorType === 4 || colorType === 6;

  return { width, height, bitDepth, colorType, hasAlpha };
}

/**
 * TIER 3: For a given slot's final_png, read the real PNG IHDR and check:
 * 1. Width/height match one of the accepted ASC dimensions for the declared device_well.
 * 2. No alpha channel is present (alpha must be removed before App Store upload).
 *
 * Only fires errors/warnings when the file actually exists on disk — missing
 * files are handled separately by checkFinalPngsExist / checkRubricScores.
 */
function checkPngDimensions(slot: RubricSlot, storeStatus: string | undefined): void {
  const finalPng = slot.final_png;
  if (!finalPng) {
    return;
  }
  const absPath = path.join(args.root, finalPng);
  if (!existsSync(absPath)) {
    // Missing file is already caught by checkFinalPngsExist or rubric check; skip here.
    return;
  }

  const id = `slot ${slot.slot ?? "?"} locale ${slot.locale ?? "?"} well ${slot.device_well ?? "?"}`;
  const ihdr = parsePngIhdr(absPath);

  if ("error" in ihdr) {
    issues.push(
      issue(
        storeStatus === "succeeded" ? "error" : "warning",
        "store_screenshots.png_ihdr_unreadable",
        `${id} (${finalPng}): could not parse PNG header — ${ihdr.error}`,
        finalPng,
      ),
    );
    return;
  }

  // Check alpha channel: App Store requires no alpha transparency
  if (ihdr.hasAlpha) {
    issues.push(
      issue(
        storeStatus === "succeeded" ? "error" : "warning",
        "store_screenshots.png_has_alpha",
        `${id} (${finalPng}): PNG has an alpha channel (color_type=${ihdr.colorType}). App Store requires alpha-removed files. Run through asc-screenshot-resize or flatten before upload.`,
        finalPng,
      ),
    );
  }

  // Check device well dimensions if we know the expected sizes for this well
  const declaredWell = (slot.device_well ?? "").toLowerCase().replace(/_/g, "-");
  const acceptedSizes = ASC_WELL_DIMENSIONS[declaredWell];
  if (acceptedSizes && acceptedSizes.length > 0) {
    // PNG can be portrait or landscape — check both orientations for each accepted size
    const matches = acceptedSizes.some(
      (size) => (ihdr.width === size.width && ihdr.height === size.height) || (ihdr.width === size.height && ihdr.height === size.width),
    );
    if (!matches) {
      const acceptedStr = acceptedSizes.map((size) => `${size.width}x${size.height}`).join(" or ");
      issues.push(
        issue(
          storeStatus === "succeeded" ? "error" : "warning",
          "store_screenshots.png_wrong_dimensions",
          `${id} (${finalPng}): real PNG dimensions are ${ihdr.width}x${ihdr.height} but expected ${acceptedStr} for well "${declaredWell}". Resize with asc-screenshot-resize before upload.`,
          finalPng,
        ),
      );
    }
  }
}

/**
 * TIER 1: Reject a rubric ledger file that is byte-identical to the shipped
 * example file, or that is below a minimum byte threshold indicating it has
 * not been populated with real data.
 *
 * This catches the "copy the example and claim done" bypass where a founder
 * or agent pastes screenshot-rubric-scores.example.json as their proof.
 * Returns true if the file should be rejected (issues already pushed).
 */
const RUBRIC_EXAMPLE_REL_PATH = "business/store/app-store-listing/screenshot-rubric-scores.example.json";
const RUBRIC_MIN_BYTES = 200;

function checkRubricLedgerNotExampleCopy(ledgerRelPath: string, ledgerRaw: string): boolean {
  // Sub-threshold check: below 200 bytes is clearly a stub
  if (Buffer.byteLength(ledgerRaw, "utf8") < RUBRIC_MIN_BYTES) {
    issues.push(
      issue(
        "error",
        "store_screenshots.rubric_ledger_stub",
        `${ledgerRelPath} is smaller than ${RUBRIC_MIN_BYTES} bytes and appears to be an empty stub. Populate it with real graded slot data.`,
        ledgerRelPath,
      ),
    );
    return true;
  }

  // Byte-identical to example: attempt to read the example from the skill root
  // The example lives alongside the template; the repo root is the skill root.
  // We try a few candidate paths because the validator may run from a business
  // repo that installed the skill as a dependency.
  const exampleCandidates = [
    path.join(args.root, RUBRIC_EXAMPLE_REL_PATH),
    path.join(args.root, "screenshot-rubric-scores.example.json"),
    path.join(args.root, "store/app-store-listing/screenshot-rubric-scores.example.json"),
  ];
  for (const examplePath of exampleCandidates) {
    if (!existsSync(examplePath)) {
      continue;
    }
    try {
      const exampleRaw = readFileSync(examplePath, "utf8");
      if (ledgerRaw === exampleRaw) {
        issues.push(
          issue(
            "error",
            "store_screenshots.rubric_ledger_is_example_copy",
            `${ledgerRelPath} is byte-identical to the shipped example file. Replace it with real graded scores — do not use the example as proof.`,
            ledgerRelPath,
          ),
        );
        return true;
      }
    } catch {
      // If we can't read the example, skip this check silently.
    }
  }

  return false;
}

function checkRubricScores(storeStatus: string | undefined): void {
  const ledgerRelPath = findRubricLedgerPath();

  if (!ledgerRelPath) {
    // Missing ledger: error when done, warning when partial
    const severity = storeStatus === "succeeded" ? "error" : "warning";
    issues.push(
      issue(
        severity,
        "store_screenshots.rubric_unscored",
        `screenshot-rubric-scores.json is missing. Every required slot must be graded per SCREENSHOT_RUBRIC.md before the lane is "done". Run the grader agent and write scores to screenshot-rubric-scores.json.`,
        "screenshot-rubric-scores.json",
      ),
    );
    return;
  }

  let ledgerRaw: string;
  let ledger: RubricLedger;
  try {
    ledgerRaw = readFileSync(path.join(args.root, ledgerRelPath), "utf8");
    const parsed = JSON.parse(ledgerRaw) as unknown;
    if (!isRubricLedger(parsed)) {
      throw new TypeError("ledger is not an object");
    }
    ledger = parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push(issue("error", "store_screenshots.rubric_ledger_invalid_json", `${ledgerRelPath} is not valid JSON: ${message}`, ledgerRelPath));
    return;
  }

  // TIER 1: reject example copy / stub
  // Gate on store_console lane being beyond not_started so the template itself
  // stays clean (no false error on a fresh business repo).
  const laneIsActive = storeStatus !== undefined && storeStatus !== "pending" && storeStatus !== "not_needed" && storeStatus !== "deferred";
  if (laneIsActive && checkRubricLedgerNotExampleCopy(ledgerRelPath, ledgerRaw)) {
    // Already pushed an error; stop further ledger checks to avoid cascade noise.
    return;
  }

  const slots = ledger.slots ?? [];
  if (slots.length === 0) {
    const severity = storeStatus === "succeeded" ? "error" : "warning";
    issues.push(
      issue(
        severity,
        "store_screenshots.rubric_no_slots",
        `${ledgerRelPath} exists but contains no slot entries. Add at least one graded slot record.`,
        ledgerRelPath,
      ),
    );
    return;
  }

  if (storeStatus === "succeeded") {
    const locales = [...new Set(slots.map((slot) => slot.locale?.trim()).filter((value): value is string => Boolean(value)))];
    if (locales.length === 0) {
      issues.push(issue("error", "store_screenshots.matrix.locale_missing", "The completed screenshot ledger has no locale-keyed slots.", ledgerRelPath));
    }
    for (const locale of locales) {
      const localeSlots = slots.filter((slot) => slot.locale === locale);
      const wells = localeSlots.map((slot) => (slot.device_well ?? "").toLowerCase().replace(/_/g, "-"));
      if (hasIos) {
        const requiredAppleFamilies = [supportsIphone ? "iphone" : undefined, supportsIpad ? "ipad" : undefined].filter((family): family is "iphone" | "ipad" =>
          Boolean(family),
        );
        for (const family of requiredAppleFamilies) {
          if (!wells.some((well) => well.startsWith(family))) {
            issues.push(
              issue(
                "error",
                `store_screenshots.matrix.${locale}.${family}_missing`,
                `Locale ${locale} has no ${family} screenshot well. A completed Apple matrix must cover every supported device family for every launch locale.`,
                ledgerRelPath,
              ),
            );
          }
        }
      }
      if (hasAndroid) {
        for (const family of ["play-phone", "play-7-tablet", "play-10-tablet"]) {
          if (!wells.includes(family)) {
            issues.push(
              issue(
                "error",
                `store_screenshots.matrix.${locale}.${family}_missing`,
                `Locale ${locale} has no ${family} slot. The completed Google Play matrix must cover phone, 7-inch tablet, and 10-inch tablet wells.`,
                ledgerRelPath,
              ),
            );
          }
        }
      }
      for (const slot of localeSlots) {
        if (!slot.product_page?.trim()) {
          issues.push(
            issue(
              "error",
              "store_screenshots.matrix.product_page_missing",
              `Slot ${slot.slot ?? "?"} (${locale}/${slot.device_well ?? "?"}) has no product_page key. Use default, an App Store custom product page ID, or a Google Play custom store listing ID.`,
              ledgerRelPath,
            ),
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Recorded reviewer identity is necessary provenance. Runtime evidence must still
  // establish that the reviewer ran independently from the producer.

  const builderGraderSeverity = storeStatus === "succeeded" ? "error" : "warning";

  const builderSessionId = typeof ledger.builder?.session_id === "string" ? ledger.builder.session_id.trim() : "";
  const graderSessionId = typeof ledger.grader?.session_id === "string" ? ledger.grader.session_id.trim() : "";

  const graderPresent = graderSessionId.length > 0;
  const builderPresent = builderSessionId.length > 0;

  if (!graderPresent) {
    issues.push(
      issue(
        builderGraderSeverity,
        "store_screenshots.grader_provenance_missing",
        `${ledgerRelPath} is missing a non-empty grader identity (grader.session_id). The agent or session that grades the deck must be distinct from the builder and must record its identity in the ledger root.`,
        ledgerRelPath,
      ),
    );
  } else if (builderPresent && graderSessionId === builderSessionId) {
    issues.push(
      issue(
        builderGraderSeverity,
        "store_screenshots.builder_equals_grader",
        `${ledgerRelPath}: builder.session_id ("${builderSessionId}") equals grader.session_id. The agent/session that builds the deck must not grade it. Run the grader as a separate pass (npx tsx tooling/grade-screenshots.ts) with a distinct session identity.`,
        ledgerRelPath,
      ),
    );
  }

  // v1.2 grading_pass block: required when store_console is "done"; warn when partial
  const gradingPass = ledger.grading_pass;
  if (!gradingPass || typeof gradingPass !== "object") {
    issues.push(
      issue(
        builderGraderSeverity,
        "store_screenshots.grading_not_separate_pass",
        `${ledgerRelPath} is missing the "grading_pass" block introduced in rubric v1.2. Add { separate_pass: true, started_at, method: "vision" } to attest that grading was a distinct invocation from building. Run: npx tsx tooling/grade-screenshots.ts --root . to generate the grading task template.`,
        ledgerRelPath,
      ),
    );
  } else if (gradingPass.separate_pass !== true) {
    issues.push(
      issue(
        builderGraderSeverity,
        "store_screenshots.grading_not_separate_pass",
        `${ledgerRelPath}: grading_pass.separate_pass is ${JSON.stringify(gradingPass.separate_pass)}, expected true. The grading pass must be a separate invocation from the build pass. Run: npx tsx tooling/grade-screenshots.ts --root . to generate the grading task and write a validated ledger.`,
        ledgerRelPath,
      ),
    );
  }

  // Minimum threshold for grader_notes to be considered substantive (characters).
  // Raised from 20 to 30 in rubric v1.2.1: a 20-char note ("looks ok", filler) is
  // not a real grading note. 30 chars still doesn't require a paragraph but rules out
  // trivially short filler.
  const GRADER_NOTES_MIN_CHARS = 30;
  // Minimum threshold for suspicious-perfect warning (all high dims = 3 but very short notes)
  const SUSPICIOUS_PERFECT_NOTES_THRESHOLD = 50;
  // Minimum threshold for observed_evidence to be considered substantive (characters).
  // Raised from 10 to 15: "looks good" (10 chars) passes the old floor; 15 chars
  // forces at least a brief concrete reference ("blue background" is 16 chars).
  const OBSERVED_EVIDENCE_MIN_CHARS = 15;

  // Stock generic phrases that are too vague to constitute real per-slot evidence.
  // HONEST LIMIT: this list can only catch known clichés; a grader could still write
  // a novel generic sentence. The distinctness check below catches copy-paste across
  // slots, which is the more common fabrication pattern.
  // Multi-word stock clichés only, matched EXACTLY (after normalization) so that
  // legitimate concrete observations that merely begin with a common adjective
  // (e.g. "good contrast ratio at thumbnail size") are NOT false-flagged.
  const OBSERVED_EVIDENCE_DENYLIST: string[] = [
    "looks good",
    "reads clearly",
    "headline visible",
    "looks clean",
    "looks ok",
    "looks great",
    "looks fine",
    "looks nice",
    "all good",
  ];

  // Collect observed_evidence strings (normalized) per slot to check distinctness
  // across the full slot array after the per-slot loop.
  const evidenceBySlot: Array<{ id: string; normalized: string }> = [];

  for (const slot of slots) {
    const id = `slot ${slot.slot ?? "?"} locale ${slot.locale ?? "?"} well ${slot.device_well ?? "?"}`;

    // Each slot must pass OR have a non-empty override.reason
    const hasPassed = slot.pass === true;
    const hasOverride = typeof slot.override?.reason === "string" && slot.override.reason.trim().length > 0;

    if (!hasPassed && !hasOverride) {
      const severity = storeStatus === "succeeded" ? "error" : "warning";
      issues.push(
        issue(
          severity,
          "store_screenshots.rubric_slot_unresolved",
          `${id} in ${ledgerRelPath} has pass=false and no override.reason. Either improve the screenshot to pass the rubric or record a founder override with a non-empty reason.`,
          ledgerRelPath,
        ),
      );
    }

    // TIER 2: grader_notes required per slot (minimum 30 chars)
    const graderNotes = typeof slot.grader_notes === "string" ? slot.grader_notes.trim() : "";
    if (graderNotes.length < GRADER_NOTES_MIN_CHARS) {
      issues.push(
        issue(
          builderGraderSeverity,
          "store_screenshots.rubric_slot_missing_grader_notes",
          `${id} in ${ledgerRelPath} has missing or very short grader_notes (${graderNotes.length} chars, minimum ${GRADER_NOTES_MIN_CHARS}). The grader must explain the score for each dimension.`,
          ledgerRelPath,
        ),
      );
    }

    // TIER 2: observed_evidence required per slot (v1.2+), minimum 15 chars.
    // This field must reference something the grader actually saw in the PNG
    // (headline text, dominant color, a specific UI element). A grader who never
    // opened the PNG cannot fill this field without fabricating it — which raises
    // the bar for dishonest grading vs. the v1.1 grader_notes-only check.
    // HONEST LIMIT: a sufficiently creative fabricator can still write slot-specific
    // fiction. The distinctness check below and founder review are additional backstops.
    const observedEvidence = (slot as Record<string, unknown>)["observed_evidence"];
    const observedEvidenceStr = typeof observedEvidence === "string" ? observedEvidence.trim() : "";
    if (observedEvidenceStr.length < OBSERVED_EVIDENCE_MIN_CHARS) {
      issues.push(
        issue(
          builderGraderSeverity,
          "store_screenshots.grader_provenance_missing",
          `${id} in ${ledgerRelPath} has missing or too-short observed_evidence (${observedEvidenceStr.length} chars, minimum ${OBSERVED_EVIDENCE_MIN_CHARS}). Write one line referencing something you actually observed in the PNG — headline text, dominant color, a specific UI element. This is the per-slot provenance check that distinguishes a grader who opened the PNG from one who fabricated scores.`,
          ledgerRelPath,
        ),
      );
    } else {
      // Normalize for distinctness + denylist checks: collapse whitespace, lowercase,
      // strip a leading "slot N:" label so the prefix trick ("slot 1: X" / "slot 2: X")
      // cannot defeat the distinctness check, and trim trailing punctuation.
      const normalizedEvidence = observedEvidenceStr
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/^slot\s*\d+\s*[:.\-)]*\s*/i, "")
        .replace(/[.!]+$/, "")
        .trim();

      // Generic-phrase guard: warn when observed_evidence IS a known stock cliché.
      // HONEST LIMIT: exact-match on known clichés only; does not catch novel generic sentences.
      if (OBSERVED_EVIDENCE_DENYLIST.includes(normalizedEvidence)) {
        issues.push(
          issue(
            "warning",
            "store_screenshots.observed_evidence_generic",
            `${id} in ${ledgerRelPath}: observed_evidence ("${observedEvidenceStr}") matches a stock generic phrase that does not demonstrate the grader opened the PNG. Replace with a slot-specific concrete observation (headline text, dominant color, a specific UI element visible in that slot).`,
            ledgerRelPath,
          ),
        );
      }

      // Collect for post-loop distinctness check
      evidenceBySlot.push({ id, normalized: normalizedEvidence });
    }

    // TIER 2: suspicious perfect — all three high dimensions are 3 but notes are thin
    const dims = slot.dimensions;
    if (dims) {
      const allHighDimsMaxed = dims.thumbnail_legibility === 3 && dims.hook_first === 3 && dims.truthfulness === 3;
      if (allHighDimsMaxed && graderNotes.length < SUSPICIOUS_PERFECT_NOTES_THRESHOLD) {
        issues.push(
          issue(
            "warning",
            "store_screenshots.suspicious_perfect",
            `${id} in ${ledgerRelPath}: all three high dimensions are scored 3/3 but grader_notes is only ${graderNotes.length} chars. A perfect score requires proportionally detailed justification. Add at least one sentence per dimension explaining what visual evidence supports each score.`,
            ledgerRelPath,
          ),
        );
      }
    }

    // Check that final_png referenced in ledger exists when store is done
    if (storeStatus === "succeeded" && slot.final_png) {
      const absPath = path.join(args.root, slot.final_png);
      if (!existsSync(absPath)) {
        issues.push(
          issue(
            "error",
            "store_screenshots.rubric_final_png_missing",
            `${id} references final_png "${slot.final_png}" in ${ledgerRelPath} but the file does not exist on disk.`,
            slot.final_png,
          ),
        );
      }
    }

    // TIER 3: PNG header reality check for every slot with a final_png on disk
    checkPngDimensions(slot, storeStatus);
  }

  // ---------------------------------------------------------------------------
  // TIER 2 (post-loop): DISTINCTNESS check for observed_evidence.
  //
  // If two or more scored slots share the exact same (normalized, case/space-
  // insensitive) observed_evidence string, the grader almost certainly copy-pasted
  // rather than opening each PNG. Identical evidence across slots is stronger proof
  // of fabrication than any per-slot length or phrase check.
  //
  // Fires ERROR at store_console=done, WARN at partial.
  //
  // HONEST LIMIT: this checks for exact normalized duplicates. A grader who writes
  // slightly varied but equally fabricated strings per slot evades the check.
  // Founder review of the final PNGs alongside the ledger is the ultimate backstop.
  // ---------------------------------------------------------------------------
  if (evidenceBySlot.length >= 2) {
    // Group slot IDs by their normalized evidence string
    const evidenceGroups = new Map<string, string[]>();
    for (const { id, normalized } of evidenceBySlot) {
      const existing = evidenceGroups.get(normalized) ?? [];
      existing.push(id);
      evidenceGroups.set(normalized, existing);
    }
    for (const [normalized, slotIds] of evidenceGroups) {
      if (slotIds.length >= 2) {
        const severity = storeStatus === "succeeded" ? "error" : "warning";
        issues.push(
          issue(
            severity,
            "store_screenshots.observed_evidence_not_distinct",
            `${ledgerRelPath}: ${slotIds.join(", ")} all share the same observed_evidence ("${normalized}"). Each slot must have a DISTINCT observation referencing that slot's actual PNG content — identical evidence across slots indicates the grader did not open each PNG separately.`,
            ledgerRelPath,
          ),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main gate: read project state and decide what to check
// ---------------------------------------------------------------------------

const platforms = state
  ? asArray(getPath(state, "project.platforms"))
      .map((item) => asString(item)?.toLowerCase())
      .filter((item): item is string => Boolean(item))
  : [];
const iosBundleId = state ? asString(getPath(state, "project.bundleIds.ios")) : undefined;
const androidBundleId = state ? asString(getPath(state, "project.bundleIds.android")) : undefined;
const hasIos = state ? platforms.includes("ios") || Boolean(iosBundleId?.trim()) : true;
const hasAndroid = state ? platforms.includes("android") || Boolean(androidBundleId?.trim()) : true;
const declaredDeviceFamilies = state
  ? asArray(getPath(state, "project.supportedDeviceFamilies"))
      .map((item) =>
        asString(item)
          ?.toLowerCase()
          .replace(/[_\s]+/g, "-"),
      )
      .filter((item): item is string => Boolean(item))
  : [];
// Existing projects without this field retain the prior iPhone+iPad expectation. An
// intentionally iPhone-only app opts out explicitly with supportedDeviceFamilies: [iphone].
const supportsIphone = declaredDeviceFamilies.length === 0 || declaredDeviceFamilies.some((family) => ["iphone", "ios-phone"].includes(family));
const supportsIpad = declaredDeviceFamilies.length === 0 || declaredDeviceFamilies.some((family) => ["ipad", "ipados", "ios-tablet"].includes(family));
const storeStatus = state ? asString(getPath(state, "lanes.store_console.status"))?.toLowerCase() : undefined;
const storeSkipped = ["not_needed", "deferred"].includes(storeStatus ?? "");
const shouldCheck = !storeSkipped && (hasIos || hasAndroid || !state);

const screenshotPacket = firstExistingText(["SCREENSHOTS.md", "screenshots/SCREENSHOTS.md", "store/app-store-listing/SCREENSHOTS.md"]);
const appListing = firstExistingText(["APP_STORE_LISTING.md", "store/app-store-listing/APP_STORE_LISTING.md"]);
const contentAssets = firstExistingText(["CONTENT_ASSETS.md", "growth/content-assets/CONTENT_ASSETS.md"]);
const screenshotHtml = existsAny(["screenshots/index.html", "screenshots/screenshots.html", "store/app-store-listing/screenshots.html"]);
const appStoreScreenshotsStateRelPath = existsAny([
  "app-store-screenshots.json",
  "screenshots/app-store-screenshots.json",
  "store/app-store-listing/app-store-screenshots.json",
]);

if (shouldCheck && !screenshotPacket) {
  issues.push(
    issue(
      "error",
      "store_screenshots.markdown_missing",
      "SCREENSHOTS.md is required for store screenshot capture, composition, device wells, copy, dimensions, and upload proof.",
      "SCREENSHOTS.md",
    ),
  );
}

if (screenshotPacket) {
  // -------------------------------------------------------------------------
  // PRESENT layer — phrase presence (keyword / structural checks)
  // -------------------------------------------------------------------------
  const required = [
    "Raw Capture Matrix",
    "Production Composition Matrix",
    "Device Wells",
    "headline",
    "copy overlay",
    "DESIGN.md",
    "11_STAR_EXPERIENCE.md",
    "MobAI",
    "Higgsfield",
    "Remotion",
    "ParthJadhav/app-store-screenshots",
    "app-store-screenshots.json",
    "App Icon",
    "App Preview",
    "App Preview Video",
    "autoplay",
    "poster frame",
    "Asset Knowledge Brief",
    // "App Preview Video" above is the section a reader looks for; this is the asset-name
    // convention the pipeline writes. Both are required, and both slugify to
    // store_screenshots.app_preview_video.missing — the only colliding pair in this list.
    // The issue message names the phrase, so a failure still says which one is absent.
    "app-preview-video",
    "strategy/RESEARCH.md",
    "EMOTIONAL_DESIGN.md",
    "asc-screenshot-resize",
    "asc-shots-pipeline",
    "ASC device_type",
    "screenshot count",
    "required",
    "scaled",
    "version localization ID",
    "alpha",
    "color space",
    "sRGB",
    "thumbnail",
    "visual QA",
    "founder approval",
    // Pipeline spine phrases (PRESENT: declared)
    "Definition of Good",
    // The theme's token source. Named "studio/seed/theme.tokens.json" until DESIGN.md became the
    // authored token authority; "DESIGN.md" above proves the packet cites the contract, and this
    // phrase pairs the PRESENT layer with the PROVEN check below, which accepts a DESIGN.md
    // reference or a tokensSource field in app-store-screenshots.json.
    "tokensSource",
    "screenshot-rubric-scores.json",
  ];

  if (hasIos) {
    required.push("iPhone", "iPad");
  }
  if (hasAndroid) {
    required.push("Google Play", "feature graphic");
  }

  requirePhrases(screenshotPacket.text, required, "store_screenshots", screenshotPacket.relativePath);
  checkRawOnlyReadiness(screenshotPacket.text, screenshotPacket.relativePath, storeStatus);
  checkReadyDeviceRows(screenshotPacket.text, screenshotPacket.relativePath);
  checkFinalPaths(screenshotPacket.text, screenshotPacket.relativePath);
  checkAppPreviewRequired(screenshotPacket.text, screenshotPacket.relativePath);

  const usesAppStoreScreenshots = /ParthJadhav\/app-store-screenshots|app-store-screenshots/i.test(screenshotPacket.text);
  if (storeStatus === "succeeded" && usesAppStoreScreenshots && !appStoreScreenshotsStateRelPath && !screenshotHtml) {
    issues.push(
      issue(
        "error",
        "store_screenshots.app_store_screenshots_board_missing",
        "A done screenshot lane that uses ParthJadhav/app-store-screenshots must have a saved board/state file present (app-store-screenshots.json or screenshots/index.html), not just a reference to it.",
        screenshotPacket.relativePath,
      ),
    );
  }

  const usesGeneratedOrRenderedRoute = /\b(Higgsfield|Remotion)\b/i.test(screenshotPacket.text);
  if (storeStatus === "succeeded" && usesGeneratedOrRenderedRoute && !contentAssets) {
    issues.push(
      issue(
        "error",
        "store_screenshots.content_assets_missing",
        "Done screenshot packets that use Higgsfield or Remotion must link to CONTENT_ASSETS.md for route, license, source input, output, and approval proof.",
        screenshotPacket.relativePath,
      ),
    );
  }

  if (storeStatus === "succeeded" && !screenshotHtml) {
    issues.push(
      issue(
        "warning",
        "store_screenshots.html_missing",
        "Done screenshot packets should include screenshots/index.html or an equivalent screenshot composition/export board.",
        "screenshots/index.html",
      ),
    );
  }

  // -------------------------------------------------------------------------
  // PROVEN layer — on-disk file existence (hard-errors when status = "done")
  // -------------------------------------------------------------------------
  if (storeStatus === "succeeded") {
    checkRawCapturesExist(screenshotPacket.text, screenshotPacket.relativePath);
    checkFinalPngsExist(screenshotPacket.text, screenshotPacket.relativePath);

    // app-store-screenshots.json must exist and must be token-derived
    if (!appStoreScreenshotsStateRelPath) {
      issues.push(
        issue(
          "error",
          "store_screenshots.app_store_screenshots_json_missing",
          "app-store-screenshots.json is required when store_console lane is done. The ParthJadhav/app-store-screenshots board state must be saved.",
          "app-store-screenshots.json",
        ),
      );
    } else {
      checkThemeTokenDerived(appStoreScreenshotsStateRelPath);
    }
  }
}

// -------------------------------------------------------------------------
// OPTIMIZED layer — rubric score ledger (warning when partial, error when done)
// -------------------------------------------------------------------------
if (shouldCheck) {
  checkRubricScores(storeStatus);
}

// -------------------------------------------------------------------------
// APP_STORE_LISTING.md cross-checks (unchanged from original)
// -------------------------------------------------------------------------
if (shouldCheck && appListing) {
  requirePhrases(
    appListing.text,
    ["SCREENSHOTS.md", "App Icon", "App Preview", "iPad", "copy overlay", "ParthJadhav/app-store-screenshots", "asc-shots-pipeline"],
    "app_store_listing.screenshot_contract",
    appListing.relativePath,
  );
  checkAppPreviewRequired(appListing.text, appListing.relativePath);
}

reportAndExit("Store screenshots packet check", issues);
