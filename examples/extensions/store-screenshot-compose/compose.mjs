#!/usr/bin/env node
/**
 * store-screenshot-compose adapter.
 *
 * Composes existing captures into store screenshot layouts, exports them per locale, and
 * validates the deliverables. It never launches an app, captures pixels, or uploads anything.
 * It uses Node built-ins only, spawns no process, opens no network connection, and never reads
 * the clock: composedAt comes from --now, so the same inputs produce the same bytes.
 *
 * Modes:
 *   compose  --captures <manifest.json> --template <svg.tmpl> --wells <wells.json> --locale <tag> --copy <copy.json> --now <iso> --out <dir>
 *   export   --composed <dir> --locales <tag,tag> --copy <copy.json> [--template <svg.tmpl>] [--now <iso>]
 *   validate --composed <dir> --wells <wells.json>
 *
 * Exit codes: 0 ok; 1 failed check or bad input; 2 refused (--upload, --capture, upload, capture).
 * Every mode writes one JSON report to stdout.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const TOOL = Object.freeze({ name: "store-screenshot-compose", version: "1.0.0" });
const PROVENANCE_KIND = "composed-marketing-asset";
const PROVENANCE_SOURCE = "composited";
const PROVENANCE_FILE = "provenance.json";
const LOCALES_DIRECTORY = "locales";
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const CAPTURE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const REFUSED_FLAGS = ["--upload", "--capture"];
const REFUSED_MODES = ["upload", "capture"];
const REFUSAL_MESSAGE =
  "Refused: store-screenshot-compose never uploads and never captures. Upload stays with the asc screenshots route after founder approval. Capture belongs to b2c/mobile-app-operation.capture-screenshot.";
const REQUIRED_PLACEHOLDERS = ["WIDTH", "HEIGHT", "HEADLINE", "CAPTURE_HREF", "CAPTURE_X", "CAPTURE_Y", "CAPTURE_WIDTH", "CAPTURE_HEIGHT"];
const FLAGS = Object.freeze({
  compose: { required: ["captures", "template", "wells", "locale", "copy", "now", "out"], optional: [] },
  export: { required: ["composed", "locales", "copy"], optional: ["template", "now"] },
  validate: { required: ["composed", "wells"], optional: [] },
});
const USAGE = [
  "Usage:",
  "  compose.mjs compose --captures <manifest.json> --template <svg.tmpl> --wells <wells.json> --locale <tag> --copy <copy.json> --now <iso> --out <dir>",
  "  compose.mjs export --composed <dir> --locales <tag,tag> --copy <copy.json> [--template <svg.tmpl>] [--now <iso>]",
  "  compose.mjs validate --composed <dir> --wells <wells.json>",
  "",
].join("\n");

class Failure extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "Failure";
    this.code = code;
    this.extra = extra;
  }
}
const fail = (code, message, extra) => {
  throw new Failure(code, message, extra);
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const posix = (value) => value.split(path.sep).join("/");
const relativeTo = (from, to) => posix(path.relative(from, to)) || ".";
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;
const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const escapeXml = (text) => String(text).replace(/[&<>"']/gu, (char) => XML_ESCAPES[char]);

/* ---------------------------------------------------------------------------------------- */
/* Arguments                                                                                  */
/* ---------------------------------------------------------------------------------------- */

function detectRefusal(argv) {
  for (const token of argv) {
    const flag = token.split("=")[0];
    if (REFUSED_FLAGS.includes(flag)) return token;
  }
  const mode = argv[0];
  return mode !== undefined && REFUSED_MODES.includes(mode) ? mode : null;
}

function parseFlags(mode, tokens) {
  const spec = FLAGS[mode];
  const known = new Set([...spec.required, ...spec.optional]);
  const flags = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) fail("usage", `Unexpected argument ${token}.\n${USAGE}`);
    const separator = token.indexOf("=");
    const name = separator === -1 ? token.slice(2) : token.slice(2, separator);
    let value;
    if (separator === -1) {
      value = tokens[index + 1];
      index += 1;
    } else {
      value = token.slice(separator + 1);
    }
    if (!known.has(name)) fail("usage", `Unknown flag --${name} for ${mode}.\n${USAGE}`);
    if (value === undefined || value.startsWith("--")) fail("usage", `Flag --${name} needs a value.\n${USAGE}`);
    if (Object.hasOwn(flags, name)) fail("usage", `Flag --${name} was given twice.`);
    flags[name] = value;
  }
  const missing = spec.required.filter((name) => !Object.hasOwn(flags, name));
  if (missing.length) fail("usage", `Missing ${missing.map((name) => `--${name}`).join(", ")} for ${mode}.\n${USAGE}`);
  return flags;
}

function parseNow(value) {
  const time = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || Number.isNaN(time)) fail("now-invalid", `--now must be an ISO 8601 date-time, got ${value}.`);
  return new Date(time).toISOString();
}

function parseLocale(value, label = "locale") {
  if (typeof value !== "string" || !LOCALE_PATTERN.test(value))
    fail("locale-invalid", `${label} must be a BCP 47 style tag such as en-US, got ${String(value)}.`);
  return value;
}

/* ---------------------------------------------------------------------------------------- */
/* Files                                                                                     */
/* ---------------------------------------------------------------------------------------- */

function readJson(file, label) {
  if (!existsSync(file) || !statSync(file).isFile()) fail(`${label}-missing`, `${label} file not found: ${file}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fail(`${label}-invalid-json`, `${label} is not valid JSON: ${file} (${error.message})`);
  }
}

/** Width and height from the PNG IHDR chunk or the first JPEG SOF marker. Null when neither applies. */
function imageDimensions(bytes) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(pngSignature) && bytes.subarray(12, 16).toString("latin1") === "IHDR") {
    return { mediaType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = bytes.readUInt16BE(offset + 2);
      const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (startOfFrame) {
        if (offset + 9 > bytes.length) return null;
        return { mediaType: "image/jpeg", width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

/** Re-read a capture and compare it with what the manifest or provenance declares. */
function verifyCapture(absolute, declared, captureId) {
  if (!existsSync(absolute) || !statSync(absolute).isFile())
    fail("capture-missing", `capture ${captureId} is missing: ${absolute}`, { captureId, path: absolute });
  const bytes = readFileSync(absolute);
  const actual = sha256(bytes);
  if (actual !== declared.sha256) {
    fail("capture-sha-mismatch", `capture ${captureId} bytes do not match the declared sha256 (declared ${declared.sha256}, actual ${actual}).`, {
      captureId,
      path: absolute,
      declared: declared.sha256,
      actual,
    });
  }
  const dimensions = imageDimensions(bytes);
  if (!dimensions) fail("capture-format-unreadable", `capture ${captureId} is not a readable PNG or JPEG: ${absolute}`, { captureId, path: absolute });
  if (dimensions.width !== declared.width || dimensions.height !== declared.height) {
    fail(
      "capture-dimension-mismatch",
      `capture ${captureId} declares ${declared.width}x${declared.height} but its pixels are ${dimensions.width}x${dimensions.height}.`,
      {
        captureId,
        path: absolute,
        declared: { width: declared.width, height: declared.height },
        actual: { width: dimensions.width, height: dimensions.height },
      },
    );
  }
  return dimensions;
}

/* ---------------------------------------------------------------------------------------- */
/* Inputs                                                                                    */
/* ---------------------------------------------------------------------------------------- */

function loadCaptures(file) {
  const manifest = readJson(file, "captures");
  if (!isRecord(manifest) || manifest.kind !== "capture-manifest" || !Array.isArray(manifest.captures) || !manifest.captures.length) {
    fail("captures-invalid", `capture manifest needs kind capture-manifest and a non-empty captures array: ${file}`);
  }
  const directory = path.dirname(path.resolve(file));
  const seen = new Set();
  return manifest.captures.map((entry, index) => {
    const label = `captures[${index}]`;
    if (!isRecord(entry)) fail("captures-invalid", `${label} must be an object.`);
    if (typeof entry.captureId !== "string" || !CAPTURE_ID_PATTERN.test(entry.captureId))
      fail("captures-invalid", `${label}.captureId must match ${CAPTURE_ID_PATTERN}.`);
    if (seen.has(entry.captureId)) fail("captures-invalid", `${label}.captureId ${entry.captureId} is declared twice.`);
    seen.add(entry.captureId);
    if (typeof entry.path !== "string" || !entry.path || path.isAbsolute(entry.path))
      fail("captures-invalid", `${label}.path must be a path relative to the manifest.`);
    if (typeof entry.sha256 !== "string" || !SHA256_PATTERN.test(entry.sha256)) fail("captures-invalid", `${label}.sha256 must be a lowercase hex sha256.`);
    if (!isPositiveInt(entry.width) || !isPositiveInt(entry.height)) fail("captures-invalid", `${label}.width and height must be positive integers.`);
    if (typeof entry.device !== "string" || !entry.device.trim()) fail("captures-invalid", `${label}.device must name the capture device or surface.`);
    if (entry.well !== undefined && (typeof entry.well !== "string" || !entry.well)) fail("captures-invalid", `${label}.well must be a well id when present.`);
    const absolute = path.resolve(directory, entry.path);
    const dimensions = verifyCapture(absolute, entry, entry.captureId);
    return {
      captureId: entry.captureId,
      absolute,
      sha256: entry.sha256,
      width: entry.width,
      height: entry.height,
      device: entry.device,
      mediaType: dimensions.mediaType,
      sourceFingerprint: typeof entry.sourceFingerprint === "string" && entry.sourceFingerprint.trim() ? entry.sourceFingerprint : "unknown",
      well: entry.well,
    };
  });
}

function loadWells(file) {
  const table = readJson(file, "wells");
  if (!isRecord(table) || table.kind !== "device-wells" || !Array.isArray(table.wells) || !table.wells.length) {
    fail("wells-invalid", `wells table needs kind device-wells and a non-empty wells array: ${file}`);
  }
  const ids = new Set();
  for (const [index, well] of table.wells.entries()) {
    if (
      !isRecord(well) ||
      typeof well.id !== "string" ||
      !well.id ||
      typeof well.device !== "string" ||
      !isPositiveInt(well.width) ||
      !isPositiveInt(well.height)
    ) {
      fail("wells-invalid", `wells[${index}] needs id, device, width, and height.`);
    }
    if (ids.has(well.id)) fail("wells-invalid", `duplicate well id ${well.id}.`);
    ids.add(well.id);
  }
  const warnings = table.partial === true ? [`Wells table ${posix(file)} is marked partial: its wells are fixture dimensions, not store wells.`] : [];
  return { wells: table.wells, warnings };
}

function selectWell(wells, capture) {
  if (capture.well !== undefined) {
    const named = wells.find((well) => well.id === capture.well);
    if (!named) fail("well-unknown", `capture ${capture.captureId} names unknown well ${capture.well}.`);
    return named;
  }
  const matches = wells.filter((well) => well.width === capture.width && well.height === capture.height);
  if (matches.length === 1) return matches[0];
  if (!matches.length) {
    fail(
      "well-not-found",
      `no well accepts ${capture.width}x${capture.height} for capture ${capture.captureId}; name one with "well" or extend the wells table.`,
    );
  }
  return fail("well-ambiguous", `${matches.length} wells accept ${capture.width}x${capture.height} for capture ${capture.captureId}; name one with "well".`);
}

function loadCopy(file) {
  const copy = readJson(file, "copy");
  if (!isRecord(copy) || copy.kind !== "screenshot-copy" || !isRecord(copy.locales))
    fail("copy-invalid", `copy needs kind screenshot-copy and a locales object: ${file}`);
  if (copy.fonts !== undefined) {
    const valid =
      Array.isArray(copy.fonts) &&
      copy.fonts.every((font) => isRecord(font) && typeof font.family === "string" && font.family && typeof font.license === "string" && font.license);
    if (!valid) fail("copy-invalid", "copy.fonts entries need a family and a license; use the string unknown when the license is not verified.");
  }
  return copy;
}

function headlineFor(copy, locale, captureId) {
  const entry = copy.locales[locale];
  if (!isRecord(entry) || !isRecord(entry.headlines)) fail("copy-missing", `copy has no locale ${locale}.`, { locale });
  const headline = entry.headlines[captureId];
  if (typeof headline !== "string" || !headline.trim()) fail("copy-missing", `copy has no headline for ${captureId} in ${locale}.`, { locale, captureId });
  return headline;
}

function fontsFor(copy, locale) {
  const entry = copy.locales[locale];
  const family =
    (isRecord(entry) && typeof entry.fontFamily === "string" && entry.fontFamily) || (typeof copy.fontFamily === "string" && copy.fontFamily) || "system-ui";
  const fonts =
    Array.isArray(copy.fonts) && copy.fonts.length
      ? copy.fonts.map((font) => ({ family: font.family, license: font.license, embedded: font.embedded === true }))
      : [{ family, license: "unknown", embedded: false }];
  return { family, fonts };
}

function loadTemplate(file) {
  if (!existsSync(file) || !statSync(file).isFile()) fail("template-missing", `template not found: ${file}`);
  const bytes = readFileSync(file);
  const text = bytes.toString("utf8");
  for (const name of REQUIRED_PLACEHOLDERS) {
    if (!text.includes(`{{${name}}}`)) fail("template-placeholder-missing", `template lacks {{${name}}}: ${file}`);
  }
  return { absolute: path.resolve(file), text, sha256: sha256(bytes) };
}

/* ---------------------------------------------------------------------------------------- */
/* Rendering                                                                                 */
/* ---------------------------------------------------------------------------------------- */

/** Headline band on top, the capture scaled to fit below it. The capture is never upscaled. */
function layout(well, capture) {
  const headlineBand = Math.round(well.height * 0.14);
  const margin = Math.round(Math.min(well.width, well.height) * 0.04);
  const availableWidth = well.width - margin * 2;
  const availableHeight = well.height - headlineBand - margin * 2;
  if (availableWidth <= 0 || availableHeight <= 0) fail("well-too-small", `well ${well.id} leaves no room for a capture.`);
  const scale = Math.min(availableWidth / capture.width, availableHeight / capture.height, 1);
  const width = Math.max(1, Math.round(capture.width * scale));
  const height = Math.max(1, Math.round(capture.height * scale));
  const x = Math.round((well.width - width) / 2);
  const y = headlineBand + margin + Math.round((availableHeight - height) / 2);
  const framePadding = Math.round(margin / 2);
  return {
    WIDTH: well.width,
    HEIGHT: well.height,
    HEADLINE_X: Math.round(well.width / 2),
    HEADLINE_Y: Math.round(headlineBand * 0.62),
    HEADLINE_SIZE: Math.max(12, Math.round(well.height * 0.045)),
    CAPTURE_X: x,
    CAPTURE_Y: y,
    CAPTURE_WIDTH: width,
    CAPTURE_HEIGHT: height,
    FRAME_X: x - framePadding,
    FRAME_Y: y - framePadding,
    FRAME_WIDTH: width + framePadding * 2,
    FRAME_HEIGHT: height + framePadding * 2,
    FRAME_RADIUS: Math.round(Math.min(width, height) * 0.06),
  };
}

function renderSvg(template, values) {
  return template.text.replace(/\{\{([A-Z_]+)\}\}/gu, (match, name) => {
    if (!Object.hasOwn(values, name)) fail("template-placeholder-unknown", `template uses unsupported placeholder ${match}.`);
    return String(values[name]);
  });
}

/**
 * Write one SVG per item plus provenance.json into outDir. Each item pairs a verified capture with
 * the well it is composed into. Paths inside provenance are relative to outDir.
 */
function composeInto(outDir, items, { template, copy, locale, composedAt }) {
  const { family, fonts } = fontsFor(copy, locale);
  const rendered = items.map(({ capture, well }) => {
    const href = relativeTo(outDir, capture.absolute);
    const headline = headlineFor(copy, locale, capture.captureId);
    const values = {
      ...layout(well, capture),
      HEADLINE: escapeXml(headline),
      CAPTURE_HREF: escapeXml(href),
      FONT_FAMILY: escapeXml(family),
      LOCALE: escapeXml(locale),
      CAPTURE_ID: escapeXml(capture.captureId),
      TOOL: `${TOOL.name}@${TOOL.version}`,
      COMPOSED_AT: composedAt,
    };
    const svg = renderSvg(template, values);
    return {
      fileName: `${capture.captureId}.${locale}.svg`,
      svg,
      output: {
        path: `${capture.captureId}.${locale}.svg`,
        width: well.width,
        height: well.height,
        well: well.id,
        sha256: sha256(Buffer.from(svg, "utf8")),
        composedFrom: [
          {
            captureId: capture.captureId,
            path: href,
            sha256: capture.sha256,
            width: capture.width,
            height: capture.height,
            device: capture.device,
            sourceFingerprint: capture.sourceFingerprint,
          },
        ],
      },
    };
  });
  mkdirSync(outDir, { recursive: true });
  for (const item of rendered) writeFileSync(path.join(outDir, item.fileName), item.svg, "utf8");
  const provenance = {
    kind: PROVENANCE_KIND,
    notCaptureEvidence: true,
    source: PROVENANCE_SOURCE,
    composedAt,
    template: { path: relativeTo(outDir, template.absolute), sha256: template.sha256 },
    tool: { name: TOOL.name, version: TOOL.version },
    locale,
    outputs: rendered.map((item) => item.output),
    fonts,
  };
  writeFileSync(path.join(outDir, PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  return provenance;
}

/* ---------------------------------------------------------------------------------------- */
/* Modes                                                                                     */
/* ---------------------------------------------------------------------------------------- */

function runCompose(flags) {
  const composedAt = parseNow(flags.now);
  const locale = parseLocale(flags.locale, "--locale");
  const captures = loadCaptures(flags.captures);
  const { wells, warnings } = loadWells(flags.wells);
  const template = loadTemplate(flags.template);
  const copy = loadCopy(flags.copy);
  const items = captures.map((capture) => ({ capture, well: selectWell(wells, capture) }));
  for (const capture of captures) headlineFor(copy, locale, capture.captureId);
  const outDir = path.resolve(flags.out);
  const provenance = composeInto(outDir, items, { template, copy, locale, composedAt });
  return {
    ok: true,
    mode: "compose",
    notCaptureEvidence: true,
    outDir,
    provenance: PROVENANCE_FILE,
    locale,
    outputs: provenance.outputs.map(({ path: file, width, height, well, sha256: digest }) => ({ path: file, width, height, well, sha256: digest })),
    warnings,
  };
}

function readProvenance(directory) {
  const file = path.join(directory, PROVENANCE_FILE);
  if (!existsSync(file) || !statSync(file).isFile()) fail("provenance-missing", `${PROVENANCE_FILE} not found in ${directory}`, { dir: directory });
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return fail("provenance-invalid-json", `${file} is not valid JSON (${error.message})`, { dir: directory });
  }
}

function runExport(flags) {
  const composedDir = path.resolve(flags.composed);
  const base = readProvenance(composedDir);
  const shape = provenanceShape(base);
  if (shape.length) fail("provenance-field-missing", `source provenance is incomplete: ${shape.join(", ")}`, { dir: composedDir, fields: shape });
  const locales = flags.locales.split(",").map((token) => parseLocale(token.trim(), "--locales entry"));
  if (new Set(locales).size !== locales.length) fail("locale-invalid", "--locales lists a locale twice.");
  const copy = loadCopy(flags.copy);
  const templateFile = flags.template ? path.resolve(flags.template) : path.resolve(composedDir, base.template.path);
  const template = loadTemplate(templateFile);
  if (template.sha256 !== base.template.sha256) {
    fail("template-changed", `template ${templateFile} hashes to ${template.sha256}; the source provenance recorded ${base.template.sha256}.`);
  }
  const composedAt = flags.now ? parseNow(flags.now) : parseNow(base.composedAt);
  const items = base.outputs.map((output) => {
    if (output.composedFrom.length !== 1)
      fail("provenance-unsupported", `output ${output.path} composes ${output.composedFrom.length} captures; export supports one.`);
    const source = output.composedFrom[0];
    const absolute = path.resolve(composedDir, source.path);
    const dimensions = verifyCapture(absolute, source, source.captureId);
    return {
      capture: {
        captureId: source.captureId,
        absolute,
        sha256: source.sha256,
        width: source.width,
        height: source.height,
        device: source.device,
        mediaType: dimensions.mediaType,
        sourceFingerprint: source.sourceFingerprint,
      },
      well: { id: output.well, width: output.width, height: output.height },
    };
  });
  for (const locale of locales) for (const item of items) headlineFor(copy, locale, item.capture.captureId);
  const exported = locales.map((locale) => {
    const dir = path.join(composedDir, LOCALES_DIRECTORY, locale);
    const provenance = composeInto(dir, items, { template, copy, locale, composedAt });
    return { locale, dir, provenance: PROVENANCE_FILE, outputs: provenance.outputs.length };
  });
  return { ok: true, mode: "export", notCaptureEvidence: true, composed: composedDir, locales: exported, warnings: [] };
}

/** Names of provenance fields that are missing or malformed. Empty means the shape is complete. */
function provenanceShape(provenance) {
  const missing = [];
  if (!isRecord(provenance)) return ["(root)"];
  if (provenance.kind !== PROVENANCE_KIND) missing.push("kind");
  if (provenance.notCaptureEvidence !== true) missing.push("notCaptureEvidence");
  if (provenance.source !== PROVENANCE_SOURCE) missing.push("source");
  if (typeof provenance.composedAt !== "string" || Number.isNaN(Date.parse(provenance.composedAt))) missing.push("composedAt");
  if (!isRecord(provenance.template) || typeof provenance.template.path !== "string" || !SHA256_PATTERN.test(String(provenance.template.sha256)))
    missing.push("template");
  if (!isRecord(provenance.tool) || typeof provenance.tool.name !== "string" || typeof provenance.tool.version !== "string") missing.push("tool");
  if (typeof provenance.locale !== "string" || !LOCALE_PATTERN.test(provenance.locale)) missing.push("locale");
  if (!Array.isArray(provenance.outputs) || !provenance.outputs.length) missing.push("outputs");
  if (
    !Array.isArray(provenance.fonts) ||
    provenance.fonts.some((font) => !isRecord(font) || typeof font.family !== "string" || typeof font.license !== "string")
  ) {
    missing.push("fonts");
  }
  for (const [index, output] of (Array.isArray(provenance.outputs) ? provenance.outputs : []).entries()) {
    const label = `outputs[${index}]`;
    if (!isRecord(output)) {
      missing.push(label);
      continue;
    }
    if (typeof output.path !== "string" || !output.path || path.isAbsolute(output.path)) missing.push(`${label}.path`);
    if (!isPositiveInt(output.width)) missing.push(`${label}.width`);
    if (!isPositiveInt(output.height)) missing.push(`${label}.height`);
    if (typeof output.well !== "string" || !output.well) missing.push(`${label}.well`);
    if (typeof output.sha256 !== "string" || !SHA256_PATTERN.test(output.sha256)) missing.push(`${label}.sha256`);
    if (!Array.isArray(output.composedFrom) || !output.composedFrom.length) {
      missing.push(`${label}.composedFrom`);
      continue;
    }
    for (const [sourceIndex, source] of output.composedFrom.entries()) {
      const sourceLabel = `${label}.composedFrom[${sourceIndex}]`;
      if (!isRecord(source)) {
        missing.push(sourceLabel);
        continue;
      }
      if (typeof source.captureId !== "string" || !CAPTURE_ID_PATTERN.test(source.captureId)) missing.push(`${sourceLabel}.captureId`);
      if (typeof source.path !== "string" || !source.path || path.isAbsolute(source.path)) missing.push(`${sourceLabel}.path`);
      if (typeof source.sha256 !== "string" || !SHA256_PATTERN.test(source.sha256)) missing.push(`${sourceLabel}.sha256`);
      if (!isPositiveInt(source.width)) missing.push(`${sourceLabel}.width`);
      if (!isPositiveInt(source.height)) missing.push(`${sourceLabel}.height`);
      if (typeof source.device !== "string" || !source.device) missing.push(`${sourceLabel}.device`);
      if (typeof source.sourceFingerprint !== "string" || !source.sourceFingerprint) missing.push(`${sourceLabel}.sourceFingerprint`);
    }
  }
  return missing;
}

function svgDimensions(text) {
  const match = /<svg\b[^>]*?\swidth="(\d+)"[^>]*?\sheight="(\d+)"/u.exec(text);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function validateDirectory(directory, wells, failures, warnings) {
  const push = (code, message, extra = {}) => failures.push({ code, dir: directory, message, ...extra });
  let provenance;
  try {
    provenance = readProvenance(directory);
  } catch (error) {
    if (error instanceof Failure) {
      push(error.code, error.message);
      return { dir: directory, outputs: 0, captures: 0 };
    }
    throw error;
  }
  const missing = provenanceShape(provenance);
  for (const field of missing) push("provenance-field-missing", `provenance field ${field} is missing or invalid.`, { field });
  if (missing.some((field) => !field.startsWith("outputs[")) && missing.includes("outputs")) return { dir: directory, outputs: 0, captures: 0 };
  const outputs = Array.isArray(provenance.outputs) ? provenance.outputs.filter(isRecord) : [];
  let captures = 0;
  if (isRecord(provenance.template) && typeof provenance.template.path === "string") {
    const templateFile = path.resolve(directory, provenance.template.path);
    if (existsSync(templateFile) && statSync(templateFile).isFile()) {
      const actual = sha256(readFileSync(templateFile));
      if (actual !== provenance.template.sha256)
        push("template-sha-mismatch", `template ${provenance.template.path} hashes to ${actual}, provenance recorded ${provenance.template.sha256}.`);
    } else {
      warnings.push(`${directory}: template ${provenance.template.path} is not reachable; its sha256 was not re-verified.`);
    }
  }
  for (const output of outputs) {
    if (typeof output.path !== "string" || !output.path) continue;
    const outputFile = path.resolve(directory, output.path);
    let svgText = null;
    if (!existsSync(outputFile) || !statSync(outputFile).isFile()) {
      push("output-missing", `output ${output.path} is missing.`, { path: output.path });
    } else {
      const bytes = readFileSync(outputFile);
      const actual = sha256(bytes);
      if (actual !== output.sha256)
        push("output-sha-mismatch", `output ${output.path} hashes to ${actual}, provenance recorded ${output.sha256}.`, { path: output.path });
      svgText = bytes.toString("utf8");
      const header = svgDimensions(svgText);
      if (!header || header.width !== output.width || header.height !== output.height) {
        push(
          "output-dimension-mismatch",
          `output ${output.path} declares ${output.width}x${output.height} but its SVG header reports ${header ? `${header.width}x${header.height}` : "no size"}.`,
          {
            path: output.path,
          },
        );
      }
    }
    if (isPositiveInt(output.width) && isPositiveInt(output.height) && !wells.some((well) => well.width === output.width && well.height === output.height)) {
      push("well-mismatch", `output ${output.path} is ${output.width}x${output.height}; no well in the table has that size.`, { path: output.path });
    }
    for (const source of Array.isArray(output.composedFrom) ? output.composedFrom.filter(isRecord) : []) {
      if (typeof source.path !== "string" || !source.path) continue;
      captures += 1;
      if (svgText !== null && !svgText.includes(`href="${escapeXml(source.path)}"`)) {
        push("output-capture-link-missing", `output ${output.path} does not reference its source capture ${source.path}.`, {
          path: output.path,
          captureId: source.captureId,
        });
      }
      try {
        verifyCapture(path.resolve(directory, source.path), source, source.captureId);
      } catch (error) {
        if (!(error instanceof Failure)) throw error;
        push(error.code, error.message, { captureId: source.captureId, path: source.path });
      }
    }
  }
  return { dir: directory, outputs: outputs.length, captures };
}

function runValidate(flags) {
  const composedDir = path.resolve(flags.composed);
  if (!existsSync(composedDir) || !statSync(composedDir).isDirectory()) fail("composed-missing", `composed directory not found: ${composedDir}`);
  const { wells, warnings } = loadWells(flags.wells);
  const directories = [composedDir];
  const localesDir = path.join(composedDir, LOCALES_DIRECTORY);
  if (existsSync(localesDir) && statSync(localesDir).isDirectory()) {
    for (const entry of readdirSync(localesDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      directories.push(path.join(localesDir, entry.name));
    }
  }
  const failures = [];
  const checked = directories.map((directory) => validateDirectory(directory, wells, failures, warnings));
  return { ok: failures.length === 0, mode: "validate", notCaptureEvidence: true, checked, failures, warnings };
}

/* ---------------------------------------------------------------------------------------- */
/* Entry                                                                                     */
/* ---------------------------------------------------------------------------------------- */

function emit(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function main(argv) {
  const refused = detectRefusal(argv);
  if (refused !== null) {
    emit({ ok: false, refused: true, code: "operation-out-of-scope", token: refused, message: REFUSAL_MESSAGE });
    process.stderr.write(`${REFUSAL_MESSAGE}\n`);
    return 2;
  }
  const mode = argv[0];
  if (mode === undefined || !Object.hasOwn(FLAGS, mode)) {
    emit({ ok: false, code: "usage", message: `Unknown mode ${String(mode)}.` });
    process.stderr.write(USAGE);
    return 1;
  }
  try {
    const flags = parseFlags(mode, argv.slice(1));
    const report = mode === "compose" ? runCompose(flags) : mode === "export" ? runExport(flags) : runValidate(flags);
    emit(report);
    return report.ok ? 0 : 1;
  } catch (error) {
    if (error instanceof Failure) {
      emit({ ok: false, mode, code: error.code, message: error.message, ...error.extra });
      process.stderr.write(`${error.code}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
