#!/usr/bin/env node
/**
 * check:motion-contract — deterministic consistency gate for the motion craft
 * contract (premium-mobile-craft.md two-family spring canon + motion-craft-benchmarks.md
 * recipes) against the authored DESIGN.md contract, promoted stack bindings,
 * PremiumCraft.swift, and the experience-card canon files.
 *
 * This is the machine-checkable half of the motion acceptance contract. It cannot
 * inspect a generated app's UI code (that adherence is covered behaviorally by the
 * motion-craft-prose-never-applied LaunchBench scenario); what it CAN do is make the
 * contract itself undriftable: every numeric band, token value, and preset the two
 * references state must agree with the files that ship those numbers, and every motion
 * name any reference or template cites (DesignTokens.Motion members, motion.* tokens,
 * --motion-* CSS variables) must resolve to a shipped definition. The celebrate-band
 * blocker the 2026-07-26 pre-PR review caught by hand (a band that excluded a canon
 * card's own values) is exactly the class of failure this gate automates.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

function parseArgs(argv: string[]): { skillRoot: string; workspaceRoot: string } {
  const flags = parseFlags(argv, [
    { flags: ["--skill-root", "--root"], key: "skillRoot" },
    { flags: ["--workspace-root", "--workspace"], key: "workspaceRoot" },
  ]);
  const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
  return { skillRoot, workspaceRoot: flagString(flags, "workspaceRoot") ?? path.join(skillRoot, "examples/workspace/business") };
}

const { skillRoot, workspaceRoot } = parseArgs(process.argv.slice(2));

/** Regex capture groups are typed string|undefined under noUncheckedIndexedAccess; every use below is a group the pattern guarantees. */
const g = (m: RegExpMatchArray, i: number): string => m[i] ?? "";
const issues: Issue[] = [];

const BENCH = "knowledge/design/motion-craft-benchmarks.md";
const CRAFT = "knowledge/design/premium-mobile-craft.md";
const DESIGN = "examples/workspace/business/DESIGN.md";
const SWIFT = "examples/workspace/business/design/system/PremiumCraft.swift";
const SWIFT_TOKENS = "examples/workspace/business/design/system/DesignTokens.swift";
const CANON_CARDS = [
  "knowledge/experience/experience-cards/peak-end-card.md",
  "knowledge/experience/experience-cards/mastery-and-status-card.md",
  "knowledge/experience/experience-cards/variable-reward-card.md",
];

function read(rel: string): string | undefined {
  const full = path.join(skillRoot, rel);
  if (!existsSync(full)) {
    issues.push(issue("error", "motion_contract.file_missing", `${rel} is missing; the motion contract cannot be checked without it.`, rel));
    return undefined;
  }
  return readFileSync(full, "utf8");
}

const bench = read(BENCH);
const craft = read(CRAFT);
const swift = read(SWIFT);
const swiftTokens = read(SWIFT_TOKENS);
const design = loadDesignSystem(workspaceRoot);
issues.push(...design.issues);

// The live-surface family is one contract. If one recipe disappears, builders can
// route a visual effect without its state, accessibility, or performance limits.
if (bench !== undefined) {
  const requiredLiveSurfaceRecipes = [
    "### R15 — Liquid relationship morph",
    "### R16 — State-bound perimeter beam",
    "### R17 — Liquid-metal priority ring",
    "### R18 — Semantic thinking orb",
  ];
  for (const heading of requiredLiveSurfaceRecipes) {
    if (!bench.includes(heading)) {
      issues.push(
        issue(
          "error",
          "motion_contract.live_surface.recipe_missing",
          `${BENCH} is missing ${heading}; the live-surface effect family must ship as one bounded contract.`,
          BENCH,
        ),
      );
      continue;
    }
    const body = sectionBody(bench, heading.replace(/^###\s+/, ""));
    const checklistCount = body?.match(/^- \[ \] /gm)?.length ?? 0;
    const requiredBodySignals = [
      /\b(?:state|relationship|user action|product hierarchy)\b/i,
      /\b(?:accessibility|accessible|focus|semantics?|status text)\b/i,
      /\b(?:stop|stops|pause|pauses|inactive|idle|offscreen|hidden|stalled)\b/i,
      /\b(?:layout shift|render loop|frame budget|context failure|pixel density|unbounded|static)\b/i,
      /\bReduce Motion\b/i,
    ];
    if (body === undefined || checklistCount < 5 || requiredBodySignals.some((signal) => !signal.test(body))) {
      issues.push(
        issue(
          "error",
          "motion_contract.live_surface.recipe_incomplete",
          `${heading} must keep its state, accessibility, stop, performance or fallback, and Reduce Motion guidance with at least five checklist items.`,
          BENCH,
        ),
      );
    }
  }
}

const designContractPath = path.join(workspaceRoot, "DESIGN.md");
const designContract = existsSync(designContractPath) ? readFileSync(designContractPath, "utf8") : undefined;
if (designContract !== undefined) {
  const renderedDesignContract = stripNonRenderedMarkdown(designContract);
  const requiredLiveEffectFields = [
    "Real state or relationship",
    "Visible or semantic signal",
    "Stop condition",
    "Reduced-motion result",
    "Low-power fallback",
  ];
  for (const field of requiredLiveEffectFields) {
    if (!renderedDesignContract.includes(field)) {
      issues.push(
        issue(
          "error",
          "motion_contract.live_surface.template_field_missing",
          `examples/workspace/business/DESIGN.md is missing the ${field} field from its live-surface effect contract.`,
          "examples/workspace/business/DESIGN.md",
        ),
      );
    }
  }
  const liveEffectBody = sectionBody(renderedDesignContract, "Live-surface effects");
  const liveEffectHeaders = [
    "Surface",
    "Real state or relationship",
    "Recipe",
    "Visible or semantic signal",
    "Stop condition",
    "Reduced-motion result",
    "Low-power fallback",
  ];
  const liveEffectTable = markdownTable(liveEffectBody ?? "", liveEffectHeaders);
  if (liveEffectTable === undefined) {
    issues.push(
      issue(
        "error",
        "motion_contract.live_surface.template_incomplete",
        "The live-surface effect table needs all contract headers and a valid Markdown separator.",
        path.relative(workspaceRoot, designContractPath),
      ),
    );
  }
  if (workspaceNeedsLiveEffectValidation(workspaceRoot)) {
    const liveEffectRows = liveEffectTable?.rows ?? [];
    const recipeIndex = liveEffectTable?.headers.indexOf("Recipe") ?? -1;
    if (
      liveEffectRows.length === 0 ||
      liveEffectRows.some(
        (row) =>
          row.length !== liveEffectHeaders.length ||
          row.some((cell) => !isAuthoredLiveEffectCell(cell)) ||
          !/^(?:R1[5-8]|none)$/i.test((row[recipeIndex] ?? "").trim()),
      )
    ) {
      issues.push(
        issue(
          "error",
          "motion_contract.live_surface.workspace_incomplete",
          "An active workspace needs one complete live-surface row, including a none row when the product uses no live effect.",
          path.relative(workspaceRoot, designContractPath),
        ),
      );
    }
  }
} else {
  issues.push(issue("error", "motion_contract.live_surface.workspace_missing", "The active workspace is missing DESIGN.md.", "DESIGN.md"));
}

function workspaceIsLaunched(root: string): boolean {
  const statePath = path.join(root, "state/business-state.json");
  if (!existsSync(statePath)) return false;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as { project?: { phase?: unknown } };
    const phase = String(state.project?.phase ?? "");
    return /^phase_6(?:b|_|$)/.test(phase);
  } catch {
    return false;
  }
}

function workspaceNeedsLiveEffectValidation(root: string): boolean {
  const packagedStarterRoot = path.resolve(skillRoot, "examples/workspace/business");
  return path.resolve(root) !== packagedStarterRoot || workspaceIsLaunched(root);
}

function sectionBody(document: string, headingName: string): string | undefined {
  const lines = document.split("\n");
  const pattern = new RegExp(`^(#{2,4})\\s+${headingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  const start = lines.findIndex((line) => pattern.test(line.trim()));
  if (start < 0) return undefined;
  const depth = lines[start]!.trim().match(pattern)![1]!.length;
  const end = lines.findIndex((line, index) => index > start && /^(#{2,6})\s+/.test(line.trim()) && line.trim().match(/^(#{2,6})/)![1]!.length <= depth);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function stripNonRenderedMarkdown(markdown: string): string {
  const withoutComments = stripHtmlComments(stripNonRenderedHtmlBlocks(markdown));
  const renderedLines: string[] = [];
  let fence: { kind: "`" | "~"; length: number } | undefined;
  for (const line of withoutComments.split("\n")) {
    const markerMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    const marker = markerMatch?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && fence.kind === marker[0] && marker.length >= fence.length && (markerMatch?.[2] ?? "").trim() === "") {
        fence = undefined;
      }
      continue;
    }
    if (marker !== undefined) {
      fence = { kind: marker[0] as "`" | "~", length: marker.length };
      continue;
    }
    if (/^(?: {4}|\t)/u.test(line)) continue;
    renderedLines.push(line);
  }
  return renderedLines.join("\n");
}

function stripNonRenderedHtmlBlocks(markdown: string): string {
  return markdown.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "");
}

function stripHtmlComments(markdown: string): string {
  let rendered = "";
  let cursor = 0;
  while (cursor < markdown.length) {
    const start = markdown.indexOf("<!--", cursor);
    if (start < 0) return rendered + markdown.slice(cursor);
    rendered += markdown.slice(cursor, start);
    const end = markdown.indexOf("-->", start + 4);
    if (end < 0) return rendered;
    cursor = end + 3;
  }
  return rendered;
}

function markdownTable(body: string, requiredHeaders: string[]): { headers: string[]; rows: string[][] } | undefined {
  const lines = body.split("\n").map((line) => line.trim());
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index]!.startsWith("|")) continue;
    const headers = parseMarkdownRow(lines[index]!);
    if (!requiredHeaders.every((header) => headers.includes(header))) continue;
    if (!lines[index + 1]!.startsWith("|")) return undefined;
    const separator = parseMarkdownRow(lines[index + 1]!);
    if (separator.length !== headers.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return undefined;
    const rows: string[][] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length && lines[rowIndex]!.startsWith("|"); rowIndex += 1) {
      rows.push(parseMarkdownRow(lines[rowIndex]!));
    }
    return { headers, rows };
  }
  return undefined;
}

function parseMarkdownRow(line: string): string[] {
  const source = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\\") {
      let end = index;
      while (source[end] === "\\") end += 1;
      const count = end - index;
      if (source[end] === "|") {
        cell += "\\".repeat(Math.floor(count / 2));
        if (count % 2 === 1) {
          cell += "|";
          index = end;
          continue;
        }
        index = end - 1;
        continue;
      }
      cell += "\\".repeat(count);
      index = end - 1;
      continue;
    }
    if (source[index] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += source[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isAuthoredLiveEffectCell(value: string): boolean {
  return (
    value.length > 0 && !/^(?:not defined|not captured|not recorded|not reviewed|pending|tbd|todo)$/i.test(value) && !/R15, R16, R17, R18, or none/i.test(value)
  );
}

/** Numeric members of the shipped DesignTokens.Motion enum, for resolving symbolic spring responses. */
const swiftMotionMembers = new Map<string, number>();
if (swiftTokens !== undefined) {
  const motionEnum = swiftTokens.match(/enum Motion \{([\s\S]*?)\n {2}\}/);
  const enumBody = motionEnum ? (motionEnum[1] ?? "") : "";
  for (const m of enumBody.matchAll(/static let (\w+): Double = (\d+(?:\.\d+)?)(?:\n|$)/g)) {
    swiftMotionMembers.set(g(m, 1), Number(g(m, 2)));
  }
  for (const m of enumBody.matchAll(/static let (\w+): Double = ([^\n]+)/g)) {
    if (!swiftMotionMembers.has(g(m, 1))) {
      issues.push(
        issue(
          "error",
          "motion_contract.swift_tokens.member_malformed",
          `DesignTokens.Motion.${g(m, 1)} declares a Double that does not parse as a valid decimal (${g(m, 2).trim()}) — the enum would not compile.`,
          SWIFT_TOKENS,
        ),
      );
    }
  }
  if (swiftMotionMembers.size === 0) {
    issues.push(
      issue(
        "error",
        "motion_contract.swift_tokens.motion_unparseable",
        "No numeric DesignTokens.Motion members could be parsed from DesignTokens.swift.",
        SWIFT_TOKENS,
      ),
    );
  }
}

const motionTokens: Record<string, string> = design.tokens?.tokens.motion ?? {};
if (Object.keys(motionTokens).length === 0) {
  issues.push(issue("error", "motion_contract.tokens.motion_missing", "DESIGN.md has no valid motion token block.", DESIGN));
}

/** PremiumMotion presets parsed from PremiumCraft.swift: name -> { durationMember, bounce }. */
const swiftPresets = new Map<string, { durationMember: string; bounce: number }>();
if (swift !== undefined) {
  const presetRe = /static let (\w+) = Animation\.spring\(\s*duration: DesignTokens\.Motion\.(\w+),\s*bounce: ([\d.]+)\s*\)/g;
  for (const m of swift.matchAll(presetRe)) {
    swiftPresets.set(g(m, 1), { durationMember: g(m, 2), bounce: Number(g(m, 3)) });
  }
  if (swiftPresets.size === 0) {
    issues.push(
      issue("error", "motion_contract.swift.presets_unparseable", "No PremiumMotion Animation.spring presets could be parsed from PremiumCraft.swift.", SWIFT),
    );
  }
}

// --- 1. The benchmarks token table must match DESIGN.md's authored motion tokens exactly. ---
if (bench !== undefined) {
  const rowRe = /^\|\s*`(\w+)`\s*\|\s*(\d+)ms\s*\|([^|]*)\|/gm;
  const REQUIRED_ROWS = ["durationFast", "durationBase", "durationSlow", "durationCelebrate", "durationReveal", "durationCinematic", "stagger"];
  const seenRows: string[] = [];
  for (const m of bench.matchAll(rowRe)) {
    const name = g(m, 1);
    seenRows.push(name);
    const ms = g(m, 2);
    const presetCell = g(m, 3);
    const actual = motionTokens[name];
    if (actual === undefined) {
      issues.push(
        issue("error", "motion_contract.token_row.unknown_token", `Benchmarks token table names motion.${name}, which does not exist in DESIGN.md.`, BENCH),
      );
    } else if (actual !== `${ms}ms`) {
      issues.push(
        issue("error", "motion_contract.token_row.value_drift", `Benchmarks token table says motion.${name} = ${ms}ms but DESIGN.md authors ${actual}.`, BENCH),
      );
    }
    // Every numeric row must also exist in and match the Swift enum, preset or not —
    // durationReveal/durationCinematic/stagger have no PremiumMotion mapping but
    // apps still compile against their Swift members, and a member deleted from the
    // enum breaks that compile even while doc/JSON parity stays green.
    if (swiftMotionMembers.size > 0 && !swiftMotionMembers.has(name)) {
      issues.push(
        issue(
          "error",
          "motion_contract.token_row.swift_member_missing",
          `Benchmarks token table documents motion.${name} but DesignTokens.Motion defines no numeric ${name} member — code referencing it will not compile.`,
          BENCH,
        ),
      );
    } else if (swiftMotionMembers.has(name) && Math.round((swiftMotionMembers.get(name) ?? 0) * 1000) !== Number(ms)) {
      issues.push(
        issue(
          "error",
          "motion_contract.token_row.swift_value_drift",
          `Benchmarks token table says motion.${name} = ${ms}ms but DesignTokens.Motion.${name} ships ${(swiftMotionMembers.get(name) ?? 0) * 1000}ms.`,
          BENCH,
        ),
      );
    }
    // Validate EVERY preset annotation in the cell, not just the first — a
    // two-preset row (durationCelebrate) must keep both presets synchronized,
    // and an un-annotated mention must fail rather than ride along unchecked.
    const presetRefs = [...presetCell.matchAll(/PremiumMotion\.(\w+)`?\s*\(bounce ([\d.]+)\)/g)];
    const presetMentions = (presetCell.match(/PremiumMotion\./g) ?? []).length;
    if (presetMentions > presetRefs.length) {
      issues.push(
        issue(
          "error",
          "motion_contract.preset.annotation_missing",
          `Benchmarks token table row for motion.${name} names a PremiumMotion preset without its (bounce N) annotation; the stated bounce is what the gate keeps synchronized.`,
          BENCH,
        ),
      );
    }
    for (const presetRef of presetRefs) {
      const preset = swiftPresets.get(g(presetRef, 1));
      if (!preset) {
        issues.push(
          issue(
            "error",
            "motion_contract.preset.unknown",
            `Benchmarks token table cites PremiumMotion.${g(presetRef, 1)}, which is not a parsed PremiumCraft.swift preset.`,
            BENCH,
          ),
        );
      } else if (preset.durationMember !== name) {
        issues.push(
          issue(
            "error",
            "motion_contract.preset.duration_mismatch",
            `Benchmarks token table maps PremiumMotion.${g(presetRef, 1)} to motion.${name} but PremiumCraft.swift rides DesignTokens.Motion.${preset.durationMember}.`,
            BENCH,
          ),
        );
      } else if (preset.bounce !== Number(g(presetRef, 2))) {
        issues.push(
          issue(
            "error",
            "motion_contract.preset.bounce_drift",
            `Benchmarks token table says PremiumMotion.${g(presetRef, 1)} bounce ${g(presetRef, 2)} but PremiumCraft.swift ships ${preset.bounce}.`,
            BENCH,
          ),
        );
      }
    }
  }
  for (const required of REQUIRED_ROWS) {
    if (!seenRows.includes(required)) {
      issues.push(
        issue(
          "error",
          "motion_contract.token_table.row_missing",
          `Benchmarks token table lost its motion.${required} row; the mapping must stay complete.`,
          BENCH,
        ),
      );
    }
  }
  for (const dup of seenRows.filter((name, i) => seenRows.indexOf(name) !== i)) {
    issues.push(
      issue(
        "error",
        "motion_contract.token_table.duplicate_row",
        `Benchmarks token table lists motion.${dup} more than once; duplicates can mask omissions.`,
        BENCH,
      ),
    );
  }

  // Every motion.<name> reference in the benchmarks must resolve to a shipped token.
  for (const m of bench.matchAll(/`motion\.([^`]+)`/g)) {
    // `motion.*` is the namespace label (table header prose), not a token reference.
    if (g(m, 1) === "*") continue;
    if (!Object.hasOwn(motionTokens, g(m, 1))) {
      issues.push(
        issue("error", "motion_contract.token_reference.unknown", `Benchmarks reference motion.${g(m, 1)}, which does not exist in DESIGN.md.`, BENCH),
      );
    }
  }
}

// --- 2. Every PremiumMotion.<name> mention in both references must be a real preset. ---
for (const [rel, text] of [
  [BENCH, bench],
  [CRAFT, craft],
] as const) {
  if (text === undefined || swift === undefined) continue;
  for (const m of text.matchAll(/PremiumMotion\.([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/g)) {
    if (!swiftPresets.has(g(m, 1))) {
      issues.push(
        issue("error", "motion_contract.premium_motion.unknown", `${rel} references PremiumMotion.${g(m, 1)}, which PremiumCraft.swift does not define.`, rel),
      );
    }
  }
}

// --- 3. The two-family spring table, its benchmarks mirror, and the card canon must agree. ---
interface Band {
  respLo: number;
  respHi: number;
  dampLo: number;
  dampHi: number;
}
const bands = new Map<string, Band>();
if (craft !== undefined) {
  const familyRe =
    /\|\s*\*\*(press|celebrate)\*\*\s*\|\s*response\s+(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?),\s*dampingFraction\s+(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)/g;
  for (const m of craft.matchAll(familyRe)) {
    const family = g(m, 1);
    if (bands.has(family)) {
      issues.push(
        issue(
          "error",
          "motion_contract.family_table.duplicate",
          `premium-mobile-craft.md's spring table states the ${family} family more than once; two incompatible canons could coexist silently.`,
          CRAFT,
        ),
      );
      continue;
    }
    bands.set(family, { respLo: Number(g(m, 2)), respHi: Number(g(m, 3)), dampLo: Number(g(m, 4)), dampHi: Number(g(m, 5)) });
  }
  for (const family of ["press", "celebrate"]) {
    const band = bands.get(family);
    if (!band) {
      issues.push(
        issue("error", "motion_contract.family_table.missing", `premium-mobile-craft.md's spring table has no parseable ${family} family row.`, CRAFT),
      );
      continue;
    }
    if (band.respLo > band.respHi || band.dampLo > band.dampHi) {
      issues.push(
        issue(
          "error",
          "motion_contract.family_table.inverted_range",
          `premium-mobile-craft.md's ${family} family states an inverted range (response ${band.respLo}-${band.respHi}, damping ${band.dampLo}-${band.dampHi}) — an empty valid range gates nothing.`,
          CRAFT,
        ),
      );
    }
  }
}

if (bench !== undefined && bands.has("press") && bands.has("celebrate")) {
  const mirrorRe =
    /press \(response (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?) \/ damping (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\) and celebrate \(response (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?) \/ damping (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\)/;
  const mirrors = [...bench.matchAll(new RegExp(mirrorRe, "g"))];
  if (mirrors.length > 1) {
    issues.push(
      issue(
        "error",
        "motion_contract.family_mirror.duplicate",
        `Benchmarks state the spring-family mirror ${mirrors.length} times; a stale second statement could publish an incompatible canon.`,
        BENCH,
      ),
    );
  }
  const m = mirrors[0];
  if (!m) {
    issues.push(
      issue("error", "motion_contract.family_mirror.missing", "Benchmarks no longer state the two spring families in the expected mirror form.", BENCH),
    );
  } else {
    const press = bands.get("press");
    const celebrate = bands.get("celebrate");
    if (!press || !celebrate) throw new Error("unreachable: bands checked above");
    const stated: Array<[number, number, string]> = [
      [Number(g(m, 1)), press.respLo, "press response low"],
      [Number(g(m, 2)), press.respHi, "press response high"],
      [Number(g(m, 3)), press.dampLo, "press damping low"],
      [Number(g(m, 4)), press.dampHi, "press damping high"],
      [Number(g(m, 5)), celebrate.respLo, "celebrate response low"],
      [Number(g(m, 6)), celebrate.respHi, "celebrate response high"],
      [Number(g(m, 7)), celebrate.dampLo, "celebrate damping low"],
      [Number(g(m, 8)), celebrate.dampHi, "celebrate damping high"],
    ];
    for (const [got, want, label] of stated) {
      if (got !== want) {
        issues.push(
          issue(
            "error",
            "motion_contract.family_mirror.drift",
            `Benchmarks mirror states ${label} = ${got} but premium-mobile-craft.md's table says ${want}.`,
            BENCH,
          ),
        );
      }
    }
  }
}

const celebrateBand = bands.get("celebrate");
if (celebrateBand) {
  const celebrate = celebrateBand;
  for (const rel of CANON_CARDS) {
    const text = read(rel);
    if (text === undefined) continue;
    const NUM = "\\d+(?:\\.\\d+)?";
    const springs = [
      ...text.matchAll(
        new RegExp(`\\.spring\\(\\s*response:\\s*(${NUM}|DesignTokens\\.Motion\\.[A-Za-z0-9_]+)\\s*,\\s*dampingFraction:\\s*(${NUM})\\s*\\)`, "g"),
      ),
    ];
    const springSites = (text.match(/\.spring\(\s*response:/g) ?? []).length;
    if (springSites > springs.length) {
      issues.push(
        issue(
          "error",
          "motion_contract.canon.spring_malformed",
          `${rel} contains ${springSites - springs.length} .spring(response:...) recipe(s) that do not parse as valid numeric or DesignTokens.Motion springs — a malformed literal like 0..5 would not compile.`,
          rel,
        ),
      );
    }
    if (springs.length === 0) {
      issues.push(
        issue("error", "motion_contract.canon.spring_missing", `${rel} no longer contains a parseable .spring(response:dampingFraction:) canon value.`, rel),
      );
      continue;
    }
    for (const s of springs) {
      // A symbolic response must resolve to a real numeric member of the shipped
      // DesignTokens.Motion enum — a name the enum does not define would not even
      // compile in the card's SwiftUI snippet, so it can never be treated as in-band.
      let response: number;
      const rawResponse = g(s, 1);
      if (rawResponse.startsWith("DesignTokens.Motion.")) {
        const member = rawResponse.slice("DesignTokens.Motion.".length);
        const resolved = swiftMotionMembers.get(member);
        if (resolved === undefined) {
          issues.push(
            issue(
              "error",
              "motion_contract.canon.symbol_unresolvable",
              `${rel} ships a canon spring response ${rawResponse}, but DesignTokens.Motion defines no numeric ${member} member — the snippet would not compile.`,
              rel,
            ),
          );
          continue;
        }
        response = resolved;
      } else {
        response = Number(rawResponse);
      }
      const damping = Number(g(s, 2));
      if (Number.isFinite(response) && (response < celebrate.respLo || response > celebrate.respHi)) {
        issues.push(
          issue(
            "error",
            "motion_contract.canon.outside_band",
            `${rel} ships a celebrate-canon spring response ${response} outside the stated family band ${celebrate.respLo}–${celebrate.respHi}.`,
            rel,
          ),
        );
      }
      if (damping < celebrate.dampLo || damping > celebrate.dampHi) {
        issues.push(
          issue(
            "error",
            "motion_contract.canon.outside_band",
            `${rel} ships a celebrate-canon dampingFraction ${damping} outside the stated family band ${celebrate.dampLo}–${celebrate.dampHi}.`,
            rel,
          ),
        );
      }
    }
  }
}

// --- 3b. A recipe's own restated numeric window (e.g. R12's "(360–600ms total)") must match
// DESIGN.md's authored values for the tokens it names — otherwise a future token edit can
// invert the range or drift the cap while this recipe's prose, and this gate, stay green.
// The match count is itself asserted (not just each match's values): rewording or dropping
// the parenthetical would otherwise make this loop silently validate zero windows. ---
if (bench !== undefined && Object.keys(motionTokens).length > 0) {
  const windowRe = /`motion\.(\w+)`[–-]`(\w+)` window \((\d+)[–-](\d+)ms total\)/g;
  const windowMatches = [...bench.matchAll(windowRe)];
  if (windowMatches.length === 0) {
    issues.push(
      issue(
        "error",
        "motion_contract.recipe_window.none_found",
        "No recipe states a `motion.TOKEN`–`TOKEN` window (N–Nms total) — either every such statement was removed (fine, update this check too) or one was reworded into a form this check no longer parses, which would silently stop validating it.",
        BENCH,
      ),
    );
  }
  for (const m of windowMatches) {
    const bounds: Array<[string, string, string]> = [
      [g(m, 1), g(m, 3), "low"],
      [g(m, 2), g(m, 4), "high"],
    ];
    for (const [tokenName, stated, label] of bounds) {
      const actual = motionTokens[tokenName];
      if (actual === undefined) {
        issues.push(
          issue(
            "error",
            "motion_contract.recipe_window.unknown_token",
            `A recipe states a window ${label} bound against motion.${tokenName}, which does not exist in DESIGN.md.`,
            BENCH,
          ),
        );
        continue;
      }
      if (actual !== `${stated}ms`) {
        issues.push(
          issue(
            "error",
            "motion_contract.recipe_window.value_drift",
            `A recipe states its window ${label} bound as ${stated}ms (motion.${tokenName}) but DESIGN.md authors motion.${tokenName} = ${actual}.`,
            BENCH,
          ),
        );
      }
    }
  }
}

// --- 3c. A recipe's own inline restatement of a spring family's band (e.g. R12's
// "press-family spring (response 0.3-0.4s, damping 0.7-0.8)") must match the family
// table in premium-mobile-craft.md, the same drift class as the family_mirror check
// above but for a recipe body instead of the top-of-file summary sentence. ---
if (bench !== undefined && bands.size > 0) {
  const familyInlineRe = /(press|celebrate)-family spring \(response (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)s?, damping (\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)\)/g;
  const familyInlineMatches = [...bench.matchAll(familyInlineRe)];
  if (familyInlineMatches.length === 0) {
    issues.push(
      issue(
        "error",
        "motion_contract.recipe_family_inline.none_found",
        "No recipe states a `<family>-family spring (response N-Ns, damping N-N)` restatement — either every such statement was removed (fine, update this check too) or one was reworded into a form this check no longer parses, which would silently stop validating it.",
        BENCH,
      ),
    );
  }
  for (const m of familyInlineMatches) {
    const family = g(m, 1);
    const band = bands.get(family);
    if (!band) continue;
    const stated: Array<[number, number, string]> = [
      [Number(g(m, 2)), band.respLo, `${family} response low`],
      [Number(g(m, 3)), band.respHi, `${family} response high`],
      [Number(g(m, 4)), band.dampLo, `${family} damping low`],
      [Number(g(m, 5)), band.dampHi, `${family} damping high`],
    ];
    for (const [got, want, label] of stated) {
      if (got !== want) {
        issues.push(
          issue(
            "error",
            "motion_contract.recipe_family_inline.drift",
            `A recipe restates ${label} = ${got} but premium-mobile-craft.md's table says ${want}.`,
            BENCH,
          ),
        );
      }
    }
  }
}

// --- 3d. R12's per-asset-count offset table is a derivation from motion.durationReveal,
// motion.stagger, and the press family's slowest settle (0.4s) -- not standalone prose.
// Parse each row's own asset count, offset, and total together (not "does this number
// appear somewhere in the file") so a row whose offset and total disagree with each
// other, or with the current tokens, cannot pass just because the right digits exist
// elsewhere in the recipe. Also recompute the asset count where pure stagger stops being
// achievable and assert the table's own terminal row states that same boundary. ---
if (bench !== undefined && Object.keys(motionTokens).length > 0 && bands.has("press")) {
  const durationRevealMs = Number.parseInt(motionTokens["durationReveal"] ?? "", 10);
  const staggerFloorMs = Number.parseInt(motionTokens["stagger"] ?? "", 10);
  const press = bands.get("press")!;
  const worstCaseSettleMs = Math.round(press.respHi * 1000);
  if (Number.isFinite(durationRevealMs) && Number.isFinite(staggerFloorMs) && Number.isFinite(worstCaseSettleMs)) {
    const gapBudgetMs = durationRevealMs - worstCaseSettleMs;

    // Locate the table by its header (any order-tolerant subset of these column names)
    // and parse each data row generically, the same cell-splitting approach
    // check-analytics-catalog.ts uses for its own header-column table scan.
    const lines = bench.split(/\r?\n/);
    let headerRow = -1;
    for (let i = 0; i < lines.length; i++) {
      const header = lines[i];
      const divider = lines[i + 1];
      if (
        header &&
        divider &&
        /^\s*\|/.test(header) &&
        /^\s*\|[\s|:-]+\|\s*$/.test(divider) &&
        /assets/i.test(header) &&
        /offset/i.test(header) &&
        /total/i.test(header)
      ) {
        headerRow = i;
        break;
      }
    }
    if (headerRow === -1) {
      issues.push(
        issue(
          "error",
          "motion_contract.recipe_offset_table.none_found",
          "No Assets/Offset/Worst-case-total table found for R12 — either it was removed (fine, update this check too) or reworded into a form this check no longer parses, which would silently stop validating it.",
          BENCH,
        ),
      );
    } else {
      const splitCells = (line: string): string[] =>
        line
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
      const headerCells = splitCells(lines[headerRow] ?? "");
      const col = {
        assets: headerCells.findIndex((c) => /assets/i.test(c)),
        gaps: headerCells.findIndex((c) => /gaps/i.test(c)),
        gapBudget: headerCells.findIndex((c) => /budget/i.test(c)),
        offset: headerCells.findIndex((c) => /offset/i.test(c)),
        total: headerCells.findIndex((c) => /total/i.test(c)),
      };
      // Cross-checks a row's own Gaps and Gap-budget-÷-gaps cells against the same derivation
      // the Offset/Total cells are already checked against, for the given gap count -- so a row
      // can no longer state a wrong gap count or budget while its offset/total stay internally
      // consistent with each other (Codex's 4th-round finding: only Assets/Offset/Total were
      // parsed, so Gaps and Gap budget could drift freely).
      const checkGapsAndBudget = (gaps: number, gapsCell: string, budgetCell: string, rowLabel: string, isTerminal: boolean): void => {
        const expectedGapsCell = isTerminal ? `${gaps}+` : String(gaps);
        if (gapsCell.replace(/\s/g, "") !== expectedGapsCell) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.gaps_drift",
              `R12's offset table states "${gapsCell || "(empty)"}" gap(s) for ${rowLabel}, but that row's own asset count implies ${expectedGapsCell} gap(s).`,
              BENCH,
            ),
          );
        }
        const expectedBudgetMs = Math.floor(gapBudgetMs / gaps);
        const budgetMatch = /(\d+)ms/.exec(budgetCell);
        if (!budgetMatch || Number(budgetMatch[1]) !== expectedBudgetMs) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.gap_budget_drift",
              `R12's offset table states a gap budget of "${budgetCell || "(unparseable)"}" for ${rowLabel}, but (motion.durationReveal − press settle) ÷ ${gaps} gap(s) computes to ${expectedBudgetMs}ms.`,
              BENCH,
            ),
          );
        }
      };
      let sawUnachievableRow = false;
      let recomputedFirstUnachievable: number | undefined;
      for (let assets = 2; assets <= 6; assets++) {
        const gaps = assets - 1;
        const rawOffsetMs = Math.floor(gapBudgetMs / gaps);
        if (rawOffsetMs < staggerFloorMs && recomputedFirstUnachievable === undefined) {
          recomputedFirstUnachievable = assets;
        }
      }

      const parsedAssetCounts = new Set<number>();
      let rowIndex = headerRow + 2;
      let parsedAnyNumericRow = false;
      for (; rowIndex < lines.length; rowIndex++) {
        const line = lines[rowIndex];
        if (!line || !/^\s*\|/.test(line)) break;
        const cells = splitCells(line);
        const assetsCell = cells[col.assets] ?? "";
        const offsetCell = cells[col.offset] ?? "";
        const totalCell = cells[col.total] ?? "";
        const assetsMatch = /^(\d+)$/.exec(assetsCell);
        if (!assetsMatch) {
          // Terminal row (e.g. "5+"): must name the boundary this file just recomputed.
          const boundaryMatch = /^(\d+)\+$/.exec(assetsCell);
          if (boundaryMatch && recomputedFirstUnachievable !== undefined) {
            sawUnachievableRow = true;
            const statedBoundary = Number(boundaryMatch[1]);
            if (statedBoundary !== recomputedFirstUnachievable) {
              issues.push(
                issue(
                  "error",
                  "motion_contract.recipe_offset_table.boundary_drift",
                  `R12's offset table names ${assetsCell} as the first unachievable-as-pure-stagger asset count, but recomputing from the current tokens (motion.durationReveal=${durationRevealMs}ms, motion.stagger=${staggerFloorMs}ms, press settle=${worstCaseSettleMs}ms) gives ${recomputedFirstUnachievable}.`,
                  BENCH,
                ),
              );
            }
            checkGapsAndBudget(recomputedFirstUnachievable - 1, cells[col.gaps] ?? "", cells[col.gapBudget] ?? "", "the terminal row", true);
          }
          continue;
        }
        parsedAnyNumericRow = true;
        const assets = Number(assetsMatch[1]);
        parsedAssetCounts.add(assets);
        const gaps = assets - 1;
        checkGapsAndBudget(gaps, cells[col.gaps] ?? "", cells[col.gapBudget] ?? "", `${assets} assets`, false);
        const offsetNums = [...offsetCell.matchAll(/(\d+)ms/g)].map((x) => Number(x[1]));
        const totalMatch = /^(\d+)ms$/.exec(totalCell);
        if (offsetNums.length === 0 || !totalMatch) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.row_unparseable",
              `R12's offset table row for ${assets} assets has an offset or total cell this check cannot parse ("${offsetCell}" / "${totalCell}") — recompute and restate it in the "Nms" form the other rows use.`,
              BENCH,
            ),
          );
          continue;
        }
        const rowOffsetMs = Math.max(...offsetNums);
        const rowTotalMs = Number(totalMatch[1]);
        if (rowOffsetMs < staggerFloorMs) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.below_stagger_floor",
              `R12's offset table states ${rowOffsetMs}ms for ${assets} assets, which is below motion.stagger (${staggerFloorMs}ms) — the recipe's own stated floor.`,
              BENCH,
            ),
          );
        }
        const computedTotalMs = rowOffsetMs * gaps + worstCaseSettleMs;
        if (computedTotalMs !== rowTotalMs) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.row_internally_inconsistent",
              `R12's offset table states ${rowTotalMs}ms total for ${assets} assets, but that row's own offset (${rowOffsetMs}ms) × ${gaps} gap(s) plus the press family's worst-case settle (${worstCaseSettleMs}ms) computes to ${computedTotalMs}ms.`,
              BENCH,
            ),
          );
        } else if (computedTotalMs > durationRevealMs) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.exceeds_window",
              `R12's offset table row for ${assets} assets computes to ${computedTotalMs}ms worst case, which exceeds motion.durationReveal (${durationRevealMs}ms).`,
              BENCH,
            ),
          );
        }
      }
      if (!parsedAnyNumericRow) {
        issues.push(
          issue(
            "error",
            "motion_contract.recipe_offset_table.no_numeric_rows",
            "R12's offset table has no row this check could parse as a numeric asset count — the table format may have changed under this check.",
            BENCH,
          ),
        );
      }
      if (recomputedFirstUnachievable !== undefined && !sawUnachievableRow) {
        issues.push(
          issue(
            "error",
            "motion_contract.recipe_offset_table.missing_floor_boundary",
            `Recomputing R12's offset table from the current tokens means some asset count now drops the per-asset offset below motion.stagger (${staggerFloorMs}ms) starting at ${recomputedFirstUnachievable} assets, but the table has no terminal "N+" row naming that boundary.`,
            BENCH,
          ),
        );
      }
      // Every asset count that is actually achievable (2 up to the recomputed boundary) needs
      // its own row -- otherwise deleting an interior row (e.g. the 3-asset row) still leaves
      // the 2-asset row, the terminal "N+" row, and every other check green, silently dropping
      // guidance for a supported asset count (Codex's 4th-round finding).
      if (recomputedFirstUnachievable !== undefined) {
        const missingCounts: number[] = [];
        for (let assets = 2; assets < recomputedFirstUnachievable; assets++) {
          if (!parsedAssetCounts.has(assets)) missingCounts.push(assets);
        }
        if (missingCounts.length > 0) {
          issues.push(
            issue(
              "error",
              "motion_contract.recipe_offset_table.missing_asset_count_row",
              `R12's offset table has no row for asset count(s) ${missingCounts.join(", ")}, even though pure stagger is achievable there (below the recomputed ${recomputedFirstUnachievable}-asset boundary) — every achievable asset count needs its own row.`,
              BENCH,
            ),
          );
        }
      }
    }
  }
}

// --- 4. The cinematic token stays out of the in-app doctrine and rides only web/brand routes. ---
if (craft !== undefined && craft.includes("durationCinematic")) {
  issues.push(
    issue(
      "error",
      "motion_contract.cinematic.in_craft_doctrine",
      "premium-mobile-craft.md (in-app doctrine) references durationCinematic; the mobile binary keeps to the 120-360ms band.",
      CRAFT,
    ),
  );
}
if (bench !== undefined) {
  for (const line of bench.split("\n")) {
    if (line.includes("durationCinematic") && !/web|brand|landing/i.test(line)) {
      issues.push(
        issue(
          "error",
          "motion_contract.cinematic.unrouted",
          `Benchmarks line mentions durationCinematic without routing it to the web/brand lane: "${line.trim().slice(0, 120)}"`,
          BENCH,
        ),
      );
    }
  }
}

// --- 5. Motion vocabulary must resolve to shipped names on every guidance surface. ---
// The 2026-07-27 sweep retired a phantom vocabulary (motion.brief/moderate/expressive/
// deliberate token names, DesignTokens.Motion.spring/stepFadeDuration-style members,
// --motion-brief-style CSS variables) that the canon checks above cannot see: prose
// references outside .spring(response:) forms compile nowhere, so they drifted silently.
// Every DesignTokens.Motion member, backticked motion.<name> token, and --motion-<name>
// CSS variable cited by reference or template markdown must exist in the shipped
// sources. Files are scanned when present so partial fixture trees stay valid.
const swiftMotionMemberNames = new Set<string>(swiftMotionMembers.keys());
if (swiftTokens !== undefined) {
  const motionEnum = swiftTokens.match(/enum Motion \{([\s\S]*?)\n {2}\}/);
  // String members (easing/easingEmphasis/easingSpring) are valid reference targets
  // even though only numeric members can carry a spring response.
  for (const m of (motionEnum ? (motionEnum[1] ?? "") : "").matchAll(/static let (\w+) = "/g)) {
    swiftMotionMemberNames.add(g(m, 1));
  }
}
// Mirrors the cssName column promote-design-tokens.ts mints (check:token-promotion
// proves the promoted artifacts agree with it). Promotion is the only pipeline that
// creates --motion-* names, so a reference outside this set resolves to nothing.
const PROMOTED_MOTION_CSS_VARS = new Set([
  "--motion-duration-fast",
  "--motion-duration-base",
  "--motion-duration-slow",
  "--motion-duration-celebrate",
  "--motion-duration-reduced",
  "--motion-easing",
  "--motion-duration-reveal",
  "--motion-duration-cinematic",
  "--motion-easing-emphasis",
  "--motion-easing-spring",
  "--motion-stagger",
]);
// The retired card vocabulary stays hard-banned by name: these are the aliases the
// 2026-07-27 sweep removed (the benchmarks table's "Retired card alias" column), and
// they are the one class of lowercase word that must never read as a component name.
const RETIRED_MOTION_ALIASES = new Set(["brief", "moderate", "expressive", "deliberate"]);
/**
 * Validate one motion.<name> occurrence found inside code (inline span or fenced block).
 * Tokens resolve against DESIGN.md. A first segment that is a pure-lowercase word and
 * not a shipped token is a component namespace, not a token: motion/react exposes every
 * intrinsic element as motion.<tag> (motion.div, motion.article, motion.nav, ...), and
 * motion.dev / motion.css ride the same prefix — a shape rule covers them all without
 * enumerating a partial HTML tag list. Shipped lowercase tokens (easing, stagger) resolve
 * before the shape rule, and the retired aliases are banned before it, so token-shaped
 * names (any uppercase or punctuation in the first segment) and alias reintroductions
 * still fail. Residual: a brand-new all-lowercase phantom word reads as a component
 * namespace — acceptable because the shipped naming convention is camelCase and any
 * lowercase token added to DESIGN.md resolves before this rule.
 */
function checkMotionTokenName(rel: string, name: string): void {
  if (Object.hasOwn(motionTokens, name)) return;
  const firstSegment = name.split(".")[0] ?? "";
  if (!RETIRED_MOTION_ALIASES.has(firstSegment) && /^[a-z][a-z0-9]*$/.test(firstSegment) && !Object.hasOwn(motionTokens, firstSegment)) {
    return;
  }
  issues.push(issue("error", "motion_contract.vocabulary.token_unknown", `${rel} references motion.${name}, which does not exist in DESIGN.md.`, rel));
}
const mdFilesUnder = (relDir: string): string[] => {
  const fullDir = path.join(skillRoot, relDir);
  if (!existsSync(fullDir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(fullDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...mdFilesUnder(rel));
    else if (entry.name.endsWith(".md")) found.push(rel);
  }
  return found;
};
for (const rel of [...mdFilesUnder("knowledge"), ...mdFilesUnder("examples/workspace/business")]) {
  const text = readFileSync(path.join(skillRoot, rel), "utf8");
  if (swiftMotionMemberNames.size > 0) {
    for (const m of text.matchAll(/DesignTokens\.Motion\.([A-Za-z0-9_]+)/g)) {
      if (!swiftMotionMemberNames.has(g(m, 1))) {
        issues.push(
          issue(
            "error",
            "motion_contract.vocabulary.member_unknown",
            `${rel} references DesignTokens.Motion.${g(m, 1)}, which the shipped Motion enum does not define — code following it would not compile.`,
            rel,
          ),
        );
      }
    }
  }
  // The benchmarks' motion.<name> references are already resolved by check 1.
  if (rel !== BENCH && Object.keys(motionTokens).length > 0) {
    // Scan token occurrences anywhere inside code, not just span-initial ones, so
    // `transition={{ duration: motion.moderate }}` fails the same way `motion.moderate`
    // does. Fenced blocks are scanned independently (a fenced `const d = motion.moderate`
    // example must fail too), then removed before inline-span pairing so a fence's
    // backticks cannot pair with prose backticks and swallow paragraphs. The name class
    // captures punctuated typos whole (motion.durationReveal-extra is not its prefix).
    const scanCodeForTokens = (code: string): void => {
      for (const m of code.matchAll(/\bmotion\.([A-Za-z0-9_.-]+)/g)) {
        checkMotionTokenName(rel, g(m, 1));
      }
    };
    for (const fence of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      scanCodeForTokens(g(fence, 1));
    }
    const inlineText = text.replace(/```[\s\S]*?```/g, "");
    for (const span of inlineText.matchAll(/`([^`]+)`/g)) {
      scanCodeForTokens(g(span, 1));
    }
  }
  // Capture the full CSS identifier so an undefined variable that merely extends a
  // promoted name (--motion-duration-fast_extra) fails instead of passing as its prefix.
  for (const m of text.matchAll(/--motion-[A-Za-z0-9_-]+/g)) {
    if (!PROMOTED_MOTION_CSS_VARS.has(m[0])) {
      issues.push(
        issue(
          "error",
          "motion_contract.vocabulary.css_var_unknown",
          `${rel} references ${m[0]}, which promote-design-tokens.ts does not mint — the variable would be undefined at runtime.`,
          rel,
        ),
      );
    }
  }
}

// --- 6. The two seeded templates must prescribe the same per-moment motion tokens. ---
// DESIGN.md's "Card motion spec" table and EMOTIONAL_DESIGN.md's DESIGN.md integration
// row describe the SAME four card moments; when both seed a business repo they must
// agree on the tokens per moment, or the generated artifacts contradict each other
// (the pre-reconciliation state: 120ms vs 220ms steps, celebrate vs 360ms reveals).
// Soft-skipped when either template is absent, matching check 5's fixture tolerance.
const CARD_MOMENTS = ["Commitment echo", "Perceived Effort", "Variable Reward", "Intent Mirror"];
const DESIGN_TPL = "examples/workspace/business/DESIGN.md";
const EMOTIONAL_TPL = "examples/workspace/business/product/experience/emotional-design/EMOTIONAL_DESIGN.md";
const designTplPath = path.join(skillRoot, DESIGN_TPL);
const emotionalTplPath = path.join(skillRoot, EMOTIONAL_TPL);
if (existsSync(designTplPath) && existsSync(emotionalTplPath)) {
  const tokensCited = (chunk: string): string[] => [...chunk.matchAll(/`motion\.([A-Za-z0-9_]+)`/g)].map((m) => g(m, 1)).sort();

  // DESIGN.md: one table row per moment; the row's cells carry its tokens.
  const designText = readFileSync(designTplPath, "utf8");
  const designMoments = new Map<string, string[]>();
  for (const line of designText.split("\n")) {
    if (!line.startsWith("|")) continue;
    const moment = CARD_MOMENTS.find((name) => line.includes(name));
    if (moment) designMoments.set(moment, tokensCited(line));
  }

  // EMOTIONAL_DESIGN.md: all four moments live in one integration-table cell; slice
  // the cell at each moment name and read the tokens up to the next moment.
  const emotionalText = readFileSync(emotionalTplPath, "utf8");
  const emotionalRow = emotionalText.split("\n").find((line) => line.includes("Motion tokens for each card moment"));
  const emotionalMoments = new Map<string, string[]>();
  if (emotionalRow !== undefined) {
    const positions = CARD_MOMENTS.map((name) => ({ name, at: emotionalRow.indexOf(name) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at);
    positions.forEach((entry, index) => {
      const end = positions[index + 1]?.at ?? emotionalRow.length;
      emotionalMoments.set(entry.name, tokensCited(emotionalRow.slice(entry.at, end)));
    });
  }

  for (const moment of CARD_MOMENTS) {
    const inDesign = designMoments.get(moment);
    const inEmotional = emotionalMoments.get(moment);
    if (inDesign === undefined || inEmotional === undefined) {
      issues.push(
        issue(
          "error",
          "motion_contract.card_moments.missing",
          `The "${moment}" card moment is missing from ${inDesign === undefined ? DESIGN_TPL : EMOTIONAL_TPL}'s motion mapping; both seeded templates must state every moment.`,
          inDesign === undefined ? DESIGN_TPL : EMOTIONAL_TPL,
        ),
      );
      continue;
    }
    if (JSON.stringify(inDesign) !== JSON.stringify(inEmotional)) {
      issues.push(
        issue(
          "error",
          "motion_contract.card_moments.drift",
          `The "${moment}" card moment cites motion tokens [${inDesign.join(", ")}] in ${DESIGN_TPL} but [${inEmotional.join(", ")}] in ${EMOTIONAL_TPL} — the seeded artifacts would contradict each other.`,
          DESIGN_TPL,
        ),
      );
    }
  }
}

// --- 8. The motion-catalog pack's copied presets must match PremiumCraft. ---
// TokenSpring.swift (native procedural scenes) and motion-tokens.ts (Remotion)
// each restate the preset bounces and duration members so procedural and video
// surfaces ride the same physics as withAnimation. The pack README says a
// bounce change is a three-file commit; this section is that instruction as a
// gate (PR #71 review) — prose alone would go stale the first time
// PremiumCraft moved.
const TOKEN_SPRING = "examples/workspace/business/design/motion-catalog/TokenSpring.swift";
const MOTION_TOKENS_TS = "examples/workspace/business/design/motion-catalog/motion-tokens.ts";

const tokenSpringRaw = read(TOKEN_SPRING);
if (tokenSpringRaw !== undefined && swiftPresets.size > 0) {
  const copies = new Map<string, { durationMember: string; bounce: number }>();
  const re = /static let (\w+) = TokenSpring\(duration: DesignTokens\.Motion\.(\w+), bounce: ([\d.]+)\)/g;
  for (const m of tokenSpringRaw.matchAll(re)) {
    copies.set(g(m, 1), { durationMember: g(m, 2), bounce: Number(g(m, 3)) });
  }
  if (copies.size === 0) {
    issues.push(
      issue(
        "error",
        "motion_contract.token_spring.presets_unparseable",
        "No TokenSpring(duration: DesignTokens.Motion.<member>, bounce: N) presets could be parsed from TokenSpring.swift.",
        TOKEN_SPRING,
      ),
    );
  } else {
    for (const [name, preset] of swiftPresets) {
      const copy = copies.get(name);
      if (copy === undefined) {
        issues.push(
          issue(
            "error",
            "motion_contract.token_spring.preset_missing",
            `PremiumCraft.swift ships PremiumMotion.${name} but TokenSpring.swift has no ${name} preset — procedural scenes would silently lack it.`,
            TOKEN_SPRING,
          ),
        );
        continue;
      }
      if (copy.durationMember !== preset.durationMember) {
        issues.push(
          issue(
            "error",
            "motion_contract.token_spring.duration_drift",
            `TokenSpring.${name} rides DesignTokens.Motion.${copy.durationMember} but PremiumMotion.${name} rides ${preset.durationMember}.`,
            TOKEN_SPRING,
          ),
        );
      }
      if (copy.bounce !== preset.bounce) {
        issues.push(
          issue(
            "error",
            "motion_contract.token_spring.bounce_drift",
            `TokenSpring.${name} states bounce ${copy.bounce} but PremiumMotion.${name} ships bounce ${preset.bounce} — the procedural curve would diverge from withAnimation.`,
            TOKEN_SPRING,
          ),
        );
      }
    }
    for (const name of copies.keys()) {
      if (!swiftPresets.has(name)) {
        issues.push(
          issue(
            "error",
            "motion_contract.token_spring.preset_unknown",
            `TokenSpring.swift defines a ${name} preset that PremiumCraft.swift does not ship — the pack must restate the canon, never extend it.`,
            TOKEN_SPRING,
          ),
        );
      }
    }
  }
}

const motionTokensTsRaw = read(MOTION_TOKENS_TS);
if (motionTokensTsRaw !== undefined) {
  if (Object.keys(motionTokens).length > 0) {
    const msRe = /^\s*(durationFast|durationBase|durationSlow|durationCelebrate|durationReveal|durationCinematic|stagger):\s*(\d+),/gm;
    const seen = new Set<string>();
    for (const m of motionTokensTsRaw.matchAll(msRe)) {
      const name = g(m, 1);
      seen.add(name);
      const actual = motionTokens[name];
      if (actual !== undefined && actual !== `${g(m, 2)}ms`) {
        issues.push(
          issue(
            "error",
            "motion_contract.motion_tokens.token_value_drift",
            `motion-tokens.ts states ${name} = ${g(m, 2)}ms but DESIGN.md authors ${actual}.`,
            MOTION_TOKENS_TS,
          ),
        );
      }
    }
    for (const name of ["durationFast", "durationBase", "durationSlow", "durationCelebrate", "durationReveal", "durationCinematic", "stagger"]) {
      if (!seen.has(name)) {
        issues.push(
          issue("error", "motion_contract.motion_tokens.token_missing", `motion-tokens.ts's Motion table has no parseable ${name} entry.`, MOTION_TOKENS_TS),
        );
      }
    }
  }
  if (swiftPresets.size > 0) {
    const copies = new Map<string, { durationMember: string; bounce: number }>();
    const re = /(\w+): springFromPreset\(Motion\.(\w+), ([\d.]+)\)/g;
    for (const m of motionTokensTsRaw.matchAll(re)) {
      copies.set(g(m, 1), { durationMember: g(m, 2), bounce: Number(g(m, 3)) });
    }
    if (copies.size === 0) {
      issues.push(
        issue(
          "error",
          "motion_contract.motion_tokens.presets_unparseable",
          "No springFromPreset(Motion.<member>, N) presets could be parsed from motion-tokens.ts.",
          MOTION_TOKENS_TS,
        ),
      );
    } else {
      for (const [name, preset] of swiftPresets) {
        const copy = copies.get(name);
        if (copy === undefined) {
          issues.push(
            issue(
              "error",
              "motion_contract.motion_tokens.preset_missing",
              `PremiumCraft.swift ships PremiumMotion.${name} but motion-tokens.ts has no ${name} preset — video renders would silently lack it.`,
              MOTION_TOKENS_TS,
            ),
          );
          continue;
        }
        if (copy.durationMember !== preset.durationMember) {
          issues.push(
            issue(
              "error",
              "motion_contract.motion_tokens.duration_drift",
              `motion-tokens.ts ${name} rides Motion.${copy.durationMember} but PremiumMotion.${name} rides ${preset.durationMember}.`,
              MOTION_TOKENS_TS,
            ),
          );
        }
        if (copy.bounce !== preset.bounce) {
          issues.push(
            issue(
              "error",
              "motion_contract.motion_tokens.bounce_drift",
              `motion-tokens.ts ${name} states bounce ${copy.bounce} but PremiumMotion.${name} ships bounce ${preset.bounce} — the rendered curve would diverge from the native preset.`,
              MOTION_TOKENS_TS,
            ),
          );
        }
      }
      for (const name of copies.keys()) {
        if (!swiftPresets.has(name)) {
          issues.push(
            issue(
              "error",
              "motion_contract.motion_tokens.preset_unknown",
              `motion-tokens.ts defines a ${name} preset that PremiumCraft.swift does not ship — the pack must restate the canon, never extend it.`,
              MOTION_TOKENS_TS,
            ),
          );
        }
      }
    }
  }
}

reportAndExit("Motion craft contract check", issues);
