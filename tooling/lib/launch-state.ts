import { assertNoPendingErasure } from "../../kernel/reducer/erasure-guard.js";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  PHASE_ORIENT_LAST_INDEX as graphOrientLastIndex,
  laneDependencies as graphLaneDependencies,
  phaseOrder as graphPhaseOrder,
  requiredLanes as graphRequiredLanes,
} from "../../catalog/lane-graph.js";
import { validateBusinessState } from "../../kernel/schema/index.js";
import { statusValues as canonicalStatuses } from "../../kernel/schema/types.js";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
  /** Line number a validator can point at, when it knows one. Reserved: no validator sets this yet. */
  line?: number;
  /** A concrete next step a validator can offer, when it knows one. Reserved: no validator sets this yet. */
  fixHint?: string;
}

/** One `b2c check --json` failure entry (D1, #32). `rule` is Issue.code verbatim. */
export interface CheckFailure {
  severity: Severity;
  rule: string;
  message: string;
  path?: string;
  location?: string;
  fixHint?: string;
}

/** The `{pass, failures}` envelope every gate emits under `--json`. `check.ts` wraps this with the gate's own name/command. */
export interface CheckJson {
  pass: boolean;
  failures: CheckFailure[];
}

/** Projects launch-state's own Issue shape onto the `b2c check --json` contract (D1, #32). */
export function toCheckJson(issues: readonly Issue[]): CheckJson {
  const failures: CheckFailure[] = issues.map((item) => ({
    severity: item.severity,
    rule: item.code,
    message: item.message,
    ...(item.file !== undefined ? { path: item.file } : {}),
    ...(item.line !== undefined ? { location: String(item.line) } : {}),
    ...(item.fixHint !== undefined ? { fixHint: item.fixHint } : {}),
  }));
  return { pass: !issues.some((item) => item.severity === "error"), failures };
}

export interface CliArgs {
  root: string;
  statePath: string;
  outputPath?: string;
}

export const statusValues = new Set<string>(canonicalStatuses);

/**
 * Phase ordering used for phase-gated coverage checks.
 * A project is "past orient" once it claims a phase at or beyond phase_1.
 * During phase_0, phase_0a, phase_0b, and phase_0c, lanes may be pending
 * because scaffolding is still happening.  From phase_1 onward every required
 * lane must show at least some intentional state.
 *
 * The ordering mirrors launch-phases.md.  Phases not listed here fall into the
 * "orient" bucket (i.e. no coverage enforcement yet).
 */
export const phaseOrder: string[] = [...graphPhaseOrder];

/** Index in phaseOrder at which the orient/scaffold window ends. */
export const PHASE_ORIENT_LAST_INDEX = graphOrientLastIndex;

/**
 * Returns true when the project is past the orient/scaffold phase window and
 * coverage enforcement for pending lanes should be active.
 */
export function isPastOrientPhase(phase: string): boolean {
  const idx = phaseOrder.indexOf(phase.toLowerCase().trim());
  // Unknown phase strings are treated conservatively as "past orient" so they
  // do not silently exempt a project from coverage checks.
  if (idx === -1) {
    return true;
  }
  return idx > PHASE_ORIENT_LAST_INDEX;
}

/** Scope sizes the business without bypassing evidence checks. */
export const launchScopes = new Set(["full", "essentials"]);

export const requiredLanes: string[] = [...graphRequiredLanes];

/**
 * Lane dependency edges — the machine-readable form of "Lock phase outputs
 * before depending on them" (SKILL.md, Operating Posture) and the Flow Gates in
 * knowledge/process/flow-traceability.md.
 *
 * Each entry lists a lane's DIRECT upstream lanes only; transitive edges are
 * implied (design -> product -> experience -> research, so design does not
 * relist research). Every edge here already existed as prose in a reference or
 * a lane row — this map mechanizes them, it does not invent new sequencing.
 *
 * This map ships with the skill rather than living in state/business-state.json on
 * purpose: an edge set a launch run can edit is an edge set a launch run can
 * delete. The auditable escape hatch is the per-lane `dependency_override`
 * dated reason, not silent removal.
 *
 * Edges are enforced only against a lane claiming `succeeded` (see
 * check-lane-coverage.ts). Working a lane ahead of its upstream is fine and
 * common; declaring it finished on an unlocked upstream is the drift bug.
 */
export const laneDependencies: Record<string, string[]> = Object.fromEntries(
  Object.entries(graphLaneDependencies).map(([lane, dependencies]) => [lane, [...dependencies]]),
);

/**
 * Upstream statuses that satisfy a dependency. `not_needed` and `deferred` are
 * legitimate resolved scope decisions (see launch tiers), so they unblock a
 * downstream lane; `pending`, `running`, and `blocked` do not.
 */
export const satisfiedDependencyStatuses = new Set(["succeeded", "not_needed", "deferred"]);

/**
 * Authoring-integrity check for the shipped edge map itself: unknown lane ids,
 * self-edges, and cycles are maintainer bugs, not project state problems. A
 * cycle would make every lane in it permanently undeclarable, so it is worth
 * catching mechanically rather than by review.
 */
export function validateLaneDependencyGraph(issues: Issue[]): void {
  const known = new Set(requiredLanes);

  for (const [lane, deps] of Object.entries(laneDependencies)) {
    if (!known.has(lane)) {
      issues.push(
        issue(
          "error",
          `lane_dependencies.${lane}.unknown_lane`,
          `laneDependencies declares edges for "${lane}", which is not in requiredLanes.`,
          "tooling/lib/launch-state.ts",
        ),
      );
    }
    for (const dep of deps) {
      if (dep === lane) {
        issues.push(issue("error", `lane_dependencies.${lane}.self_edge`, `laneDependencies["${lane}"] depends on itself.`, "tooling/lib/launch-state.ts"));
      } else if (!known.has(dep)) {
        issues.push(
          issue(
            "error",
            `lane_dependencies.${lane}.unknown_dependency`,
            `laneDependencies["${lane}"] names "${dep}", which is not a required lane.`,
            "tooling/lib/launch-state.ts",
          ),
        );
      }
    }
  }

  // DFS with a colour map: unvisited / grey (on the current path) / black (settled).
  // The graph is ~22 nodes, so recursion depth is a non-issue.
  const colours = new Map<string, "grey" | "black">();
  const activePath: string[] = [];

  const walk = (lane: string): void => {
    colours.set(lane, "grey");
    activePath.push(lane);
    for (const dep of laneDependencies[lane] ?? []) {
      const colour = colours.get(dep);
      if (colour === "grey") {
        const from = activePath.indexOf(dep);
        const cycle = [...activePath.slice(from < 0 ? 0 : from), dep].join(" -> ");
        issues.push(
          issue(
            "error",
            "lane_dependencies.cycle",
            `laneDependencies contains a cycle: ${cycle}. A cycle makes every lane in it permanently undeclarable.`,
            "tooling/lib/launch-state.ts",
          ),
        );
        continue;
      }
      if (colour === undefined) walk(dep);
    }
    activePath.pop();
    colours.set(lane, "black");
  };

  for (const lane of Object.keys(laneDependencies)) {
    if (!colours.has(lane)) walk(lane);
  }
}

const ignoredDirs = new Set([".git", "node_modules", ".next", "dist", "build", "DerivedData", ".expo", ".turbo", "coverage"]);

/** Reducer-owned canonical workspace state. */
const STATE_PATH = "state/business-state.json";
export function parseCliArgs(argv: string[]): CliArgs {
  // The durable engine's runDeterministicGates() (kernel/session/run.ts) invokes every gate via
  // `npm run --prefix <skillRoot> <gate>`, which npm executes with the skill package as the
  // process's cwd regardless of the caller's actual working directory -- so process.cwd() alone
  // can never resolve to the business workspace under engine execution. The engine sets
  // BUSINESS_ROOT precisely so a gate can recover the real target; honor it here, before an
  // explicit --root flag (checked below) can still override it for direct CLI invocations.
  const runtimeRoot = process.env.BUSINESS_ROOT ? path.resolve(process.env.BUSINESS_ROOT) : undefined;
  let root = runtimeRoot ?? process.cwd();
  let requestedStatePath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--root" && value) {
      root = path.resolve(value);
      index += 1;
    } else if (token === "--state" && value) {
      requestedStatePath = value;
      index += 1;
    } else if ((token === "--out" || token === "--output") && value) {
      outputPath = value;
      index += 1;
    }
  }

  const statePath = requestedStatePath ?? STATE_PATH;

  return {
    root,
    statePath: path.isAbsolute(statePath) ? statePath : path.join(root, statePath),
    outputPath: outputPath ? (path.isAbsolute(outputPath) ? outputPath : path.join(root, outputPath)) : undefined,
  };
}

export function issue(severity: Severity, code: string, message: string, file?: string, extra?: { line?: number; fixHint?: string }): Issue {
  return { severity, code, message, file, line: extra?.line, fixHint: extra?.fixHint };
}

/** Expands a leading `~`/`~/` to $HOME, mirroring shell behavior for CLI path flags. */
export function expandHome(value: string): string {
  if (value === "~") {
    return process.env.HOME ?? value;
  }
  if (value.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", value.slice(2));
  }
  return value;
}

export type FlagValue = string | number | boolean;

export interface FlagSpec {
  /** Flag aliases that set this key, e.g. ["--skill-root", "--root"]. */
  flags: string[];
  /** Key in the returned record. */
  key: string;
  /**
   * - "path" (default): consumes a value, expands `~`, resolves to an absolute path.
   * - "string": consumes a raw value.
   * - "number": consumes a value via Number().
   * - "boolean": consumes no value; presence sets true.
   */
  kind?: "path" | "string" | "number" | "boolean";
  /** When true, a matched flag without a value throws instead of being skipped. */
  strict?: boolean;
}

/**
 * Shared token/value CLI flag parser used by the validator scripts.
 * Last occurrence wins; unknown tokens are ignored (callers pass positional
 * arguments through their own handling when needed).
 */
export function parseFlags(argv: string[], specs: FlagSpec[]): Partial<Record<string, FlagValue>> {
  const byFlag = new Map<string, FlagSpec>();
  for (const spec of specs) {
    for (const flag of spec.flags) {
      byFlag.set(flag, spec);
    }
  }

  const out: Partial<Record<string, FlagValue>> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }
    const spec = byFlag.get(token);
    if (!spec) {
      continue;
    }
    if (spec.kind === "boolean") {
      out[spec.key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value === "") {
      if (spec.strict) {
        throw new Error(`${token} requires a value`);
      }
      continue;
    }
    index += 1;
    if (spec.kind === "number") {
      out[spec.key] = Number(value);
    } else if (spec.kind === "string") {
      out[spec.key] = value;
    } else {
      out[spec.key] = path.resolve(expandHome(value));
    }
  }
  return out;
}

export function flagString(flags: Partial<Record<string, FlagValue>>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function flagNumber(flags: Partial<Record<string, FlagValue>>, key: string): number | undefined {
  const value = flags[key];
  return typeof value === "number" ? value : undefined;
}

export function flagBoolean(flags: Partial<Record<string, FlagValue>>, key: string): boolean {
  return flags[key] === true;
}

/** Case-insensitive substring check shared by phrase-gated validators. */
export function normalizedIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Stable issue-code suffix for a missing phrase, shared by phrase-gated validators. */
export function missingPhraseCode(prefix: string, phrase: string): string {
  return `${prefix}.${phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}.missing`;
}

/** Trimmed non-empty strings from an unknown array value. */
export function normalizedStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item?.trim()))
    .map((item) => item.trim());
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function getPath(value: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, value);
}

export function readText(root: string, relativePath: string): string | undefined {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) {
    return undefined;
  }
  return readFileSync(filePath, "utf8");
}

export interface LoadedProjectState {
  state?: unknown;
  raw?: string;
  issues: Issue[];
}

/** Read and validate the reducer-owned state without aliases or format conversion. */
export function loadProjectState(args: CliArgs): LoadedProjectState {
  try {
    assertNoPendingErasure(args.root);
  } catch {
    return { issues: [issue("error", "erasure.pending_transition", "Resume authorized erasure before reading business state.")] };
  }
  const relativePath = path.relative(args.root, args.statePath);
  if (path.extname(args.statePath).toLowerCase() !== ".json") {
    return { issues: [issue("error", "project_state.unsupported_format", "Business state must use the current JSON schema.", relativePath)] };
  }
  if (!existsSync(args.statePath)) {
    return {
      issues: [
        issue("error", "project_state.missing", "state/business-state.json is missing. Run b2c bootstrap before executing durable workflows.", relativePath),
      ],
    };
  }
  const raw = readFileSync(args.statePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      raw,
      issues: [
        issue(
          "error",
          "project_state.invalid_json",
          `Business state is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          relativePath,
        ),
      ],
    };
  }
  const validated = validateBusinessState(parsed);
  if (!validated.valid || !validated.value) {
    const detail = validated.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ");
    return { raw, issues: [issue("error", "project_state.invalid_schema", `Business state failed schema validation (${detail}).`, relativePath)] };
  }
  return { state: validated.value, raw, issues: [] };
}

export function requireString(state: unknown, dottedPath: string, issues: Issue[]): void {
  const value = getPath(state, dottedPath);
  if (!asString(value)?.trim()) {
    issues.push(issue("error", `${dottedPath}.missing`, `${dottedPath} must be a non-empty string.`, "state/business-state.json"));
  }
}

export function requireStatus(state: unknown, dottedPath: string, issues: Issue[]): void {
  const value = asString(getPath(state, dottedPath));
  if (!value || !statusValues.has(value)) {
    issues.push(
      issue("error", `${dottedPath}.invalid_status`, `${dottedPath} must be one of ${Array.from(statusValues).join(", ")}.`, "state/business-state.json"),
    );
  }
}

export function requireBoolean(state: unknown, dottedPath: string, issues: Issue[]): void {
  if (asBoolean(getPath(state, dottedPath)) === undefined) {
    issues.push(issue("error", `${dottedPath}.missing_boolean`, `${dottedPath} must be true or false.`, "state/business-state.json"));
  }
}

export function collectFiles(root: string, extensions: Set<string>, maxFiles = 5000): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    if (files.length >= maxFiles) {
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  if (existsSync(root) && statSync(root).isDirectory()) {
    visit(root);
  }

  return files;
}

export function collectAllFiles(root: string, maxFiles = 10000): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    if (files.length >= maxFiles) {
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  if (existsSync(root) && statSync(root).isDirectory()) {
    visit(root);
  }

  return files;
}

export function findText(
  root: string,
  needles: string[],
  extensions = new Set([".md", ".ts", ".tsx", ".js", ".jsx", ".swift", ".kt", ".java", ".dart", ".yaml", ".yml", ".html"]),
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of collectFiles(root, extensions)) {
    const text = readFileSync(file, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) {
        const relative = path.relative(root, file);
        const matches = found.get(needle) ?? [];
        matches.push(relative);
        found.set(needle, matches);
      }
    }
  }
  return found;
}

export function reportAndExit(title: string, issues: Issue[]): void {
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");

  // D1 (#32): `b2c check <name> --json` reads this line straight off stdout. Every one of the ~70
  // validators that already call reportAndExit gets --json for free, with no call-site change.
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(toCheckJson(issues))}\n`);
    if (errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(title);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);

  for (const item of issues) {
    const where = item.file ? ` [${item.file}]` : "";
    console.log(`- ${item.severity.toUpperCase()} ${item.code}${where}: ${item.message}`);
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

export function writeText(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
}

// ---------------------------------------------------------------------------
// Tier-1 anti-gaming helpers
// ---------------------------------------------------------------------------

/**
 * Minimum byte length for a reason/rationale string to be considered non-trivial.
 * A bare one-word reason like "skip" or "later" or "N/A" is insufficient signal.
 */
export const REASON_MIN_LENGTH = 20;

/**
 * Maximum age in days for a stall/skip reason date before it is flagged stale.
 * A reason dated more than STALL_STALE_DAYS before today means the stall has
 * been sitting untouched for at least that long.
 */
export const STALL_STALE_DAYS = 60;

/**
 * Returns the first ISO YYYY-MM-DD date string found inside `text`, or
 * undefined if none is present.
 *
 * Matches the plain date form (2024-01-15) and the datetime prefix form
 * (2024-01-15T...).  Only the YYYY-MM-DD portion is returned.
 */
export function extractIsoDate(text: string): string | undefined {
  const match = /\b(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/.exec(text);
  return match?.[1];
}

/**
 * Returns true when `text` contains a parseable ISO date AND the text's length
 * meets the non-trivial threshold.
 *
 * This guards against trivially gaming the date check with an appended "2099-01-01"
 * on a one-word reason.
 */
export function hasIsoDate(text: string): boolean {
  return extractIsoDate(text) !== undefined;
}

/**
 * Returns true when `text` meets the minimum non-trivial length threshold.
 */
export function isReasonSubstantive(text: string): boolean {
  return text.trim().length >= REASON_MIN_LENGTH;
}

/**
 * Returns true if the ISO date found inside `text` is more than STALL_STALE_DAYS
 * before the supplied `asOf` date (defaults to today).
 *
 * Returns false when no date is found (caller decides how to handle that
 * separately via hasIsoDate).
 */
export function isReasonStale(text: string, asOf: Date = new Date()): boolean {
  const dateStr = extractIsoDate(text);
  if (!dateStr) {
    return false;
  }
  const reasonDate = new Date(dateStr + "T00:00:00Z");
  const msPerDay = 1000 * 60 * 60 * 24;
  const ageInDays = (asOf.getTime() - reasonDate.getTime()) / msPerDay;
  return ageInDays > STALL_STALE_DAYS;
}

/**
 * Validate a reason/rationale string and push appropriate issues.
 *
 * - If the string is missing or below the trivial threshold → WARN reason_undated_or_trivial
 * - If the string passes the length check but has no ISO date → WARN reason_undated_or_trivial
 * - If the string has a parseable date that is more than STALL_STALE_DAYS old → WARN stall_reason_stale
 *
 * @param reason   The reason/rationale string to validate (may be undefined).
 * @param lanePath Dotted lane path for issue code prefixes (e.g. "lanes.revenue").
 * @param context  A short phrase for the human-readable message (e.g. "partial stall" or "deferred").
 * @param issues   Mutable array to push warnings into.
 */
export function validateReason(reason: string | undefined, lanePath: string, context: string, issues: Issue[]): void {
  if (!reason || !isReasonSubstantive(reason)) {
    issues.push(
      issue(
        "warning",
        `${lanePath}.reason_undated_or_trivial`,
        `${lanePath} ${context} reason is missing, too short (< ${REASON_MIN_LENGTH} chars), or lacks an ISO date (YYYY-MM-DD). ` +
          `Record a dated rationale so future passes can verify the stall is intentional and not stale.`,
        "state/business-state.json",
      ),
    );
    return;
  }
  if (!hasIsoDate(reason)) {
    issues.push(
      issue(
        "warning",
        `${lanePath}.reason_undated_or_trivial`,
        `${lanePath} ${context} reason does not contain an ISO date (YYYY-MM-DD). ` +
          `Add the date the stall/skip was recorded so a future pass can detect if it has gone stale.`,
        "state/business-state.json",
      ),
    );
    return;
  }
  if (isReasonStale(reason)) {
    issues.push(
      issue(
        "warning",
        `${lanePath}.stall_reason_stale`,
        `${lanePath} ${context} reason is dated more than ${STALL_STALE_DAYS} days ago. ` + `Revisit and update the rationale or advance the lane status.`,
        "state/business-state.json",
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Non-rendered Markdown stripping
// ---------------------------------------------------------------------------

/**
 * Strips one fenced-code delimiter character (backtick or tilde) from text, one line at a time.
 * A fence only opens or closes at the true start of its own line (up to 3 leading spaces of
 * indentation, matching CommonMark's own tolerance -- 4+ spaces starts an indented code block
 * instead, a different construct this function does not touch), never mid-line. A backtick
 * fence's info string (anything trailing the opening run on that same line) additionally cannot
 * itself contain a backtick, per CommonMark; a tilde fence's info string has no such restriction.
 * This is what tells a real fence apart from an inline code span using the same character (e.g.
 * a sentence that displays `TODO` as an example using triple backticks) -- an unanchored,
 * position-blind match would treat that inline span as a fence and strip real, rendered,
 * checkable content along with it.
 *
 * A qualifying opener's block only closes at a later line consisting of nothing but (up to 3
 * leading spaces, then) a run of the same character AT LEAST as long as the opener's (a shorter
 * run is literal fence content, not a closer -- CommonMark's rule). An opener with no qualifying
 * closer runs to the end of the text, matching how an unterminated fence still renders as code
 * (never prose) through end of document.
 */
function stripFenceChar(text: string, ch: "`" | "~"): string {
  const infoStringChars = ch === "`" ? "[^`\\n]*" : "[^\\n]*";
  const openerLine = new RegExp(`^ {0,3}(${ch}{3,})${infoStringChars}$`);
  const lines = text.split("\n");
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const openMatch = line.match(openerLine);
    if (!openMatch) {
      kept.push(line);
      i++;
      continue;
    }
    const openerLength = (openMatch[1] ?? "").length;
    const closerLine = new RegExp(`^ {0,3}${ch}{${openerLength},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !closerLine.test(lines[j] ?? "")) j++;
    i = j < lines.length ? j + 1 : lines.length;
  }
  return kept.join("\n");
}

/**
 * Column width of a line's leading whitespace, expanding tabs to CommonMark's own 4-column tab
 * stop (a tab advances to the next multiple of 4, not a flat 4 columns) rather than treating tabs
 * as literal characters. Stops at the first non-whitespace character. This is what lets a single
 * leading tab (or a run of spaces plus a tab that reaches column 4) count as indented-code-block
 * indentation exactly the way a real renderer would, instead of only ever recognizing four literal
 * space characters.
 */
function leadingWhitespaceColumns(line: string): number {
  let columns = 0;
  for (const ch of line) {
    if (ch === " ") columns += 1;
    else if (ch === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

/**
 * Strips CommonMark indented code blocks: a line whose leading whitespace reaches column 4 (see
 * leadingWhitespaceColumns -- spaces and tabs both count, tabs expanding to the next 4-column tab
 * stop) starts a code block only where it cannot interrupt a paragraph -- i.e. only right after a
 * blank line, or at the very start of the document (CommonMark's own rule; an indented line
 * immediately after an ordinary paragraph or table line is a lazy continuation of that block, not
 * code, so it is left untouched here). Once a block opens this way, it absorbs every subsequent
 * indented line and any blank lines between them; a non-indented, non-blank line ends it, and any
 * trailing blank lines immediately before that line belong to what follows, not to the code block.
 * This is what stops a required heading, Graph Run row, checklist item, or evidence-packet
 * paragraph from being satisfied by content a rendered page shows only as inert code text, never
 * as live document structure or prose.
 */
function stripIndentedCodeBlocks(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let previousBlank = true;
  let i = 0;
  const isIndentedLine = (line: string): boolean => leadingWhitespaceColumns(line) >= 4 && line.trim().length > 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const isBlank = line.trim().length === 0;
    const isIndented = isIndentedLine(line);
    if (isIndented && previousBlank) {
      let j = i;
      while (j < lines.length) {
        const candidate = lines[j] ?? "";
        const candidateBlank = candidate.trim().length === 0;
        if (isIndentedLine(candidate) || candidateBlank) {
          j++;
          continue;
        }
        break;
      }
      let end = j;
      while (end > i && (lines[end - 1] ?? "").trim().length === 0) end--;
      i = end;
      previousBlank = true;
      continue;
    }
    kept.push(line);
    previousBlank = isBlank;
    i++;
  }
  return kept.join("\n");
}

/**
 * Strips content inside raw HTML block elements whose content never functions as live, parseable
 * Markdown structure -- script, style, template, pre, and textarea. script/style/template are
 * inert-by-default in every browser (rendering nothing at all); pre and textarea are the opposite
 * case that matters just as much -- their content DOES render, but only as literal preformatted
 * text (or a form control's raw value), never as an actual parsed heading, table, or checklist. A
 * required document structure placed inside either kind of block is equally invisible to
 * hasHeading()/graphRunRows()/countChecklistItems(): the criterion for this function is "does a
 * real renderer parse this as Markdown," not "is it visible on the page," and pre/textarea fail
 * that test exactly like script/style/template do. A block only OPENS at the true start of its own
 * line (up to 3 leading spaces of indentation, the same tolerance stripFenceChar and
 * stripIndentedCodeBlocks already use), with the tag name immediately followed by whitespace,
 * ">", or end of line -- never mid-line. This is what tells a real block apart from a sentence
 * that mentions one of these tags inside an inline code span (e.g. a worked example showing
 * `<style>`) -- a position-blind match would treat that mention as an opener and, finding no
 * closing tag anywhere after it, strip everything through end of document along with it, hiding
 * whatever real content (including a live placeholder marker) followed. Once a line qualifies as
 * an opener, the block closes at the first line (checked starting from the opener line itself,
 * case-insensitively) containing the matching closing tag anywhere in that line -- CommonMark's
 * own closing condition for this HTML block type is unanchored, unlike its opening condition. An
 * opener with no closer runs to the end of the document, matching how an unterminated one of
 * these blocks still hides everything after it on a real page too. This is distinct from
 * stripIndentedCodeBlocks and stripFenceChar: those hide content because it is a code-like
 * construct; this hides content because these five tags all suppress real Markdown parsing of
 * whatever they contain, whether or not that content ends up visible.
 */
function stripNonRenderingHtmlBlocks(text: string): string {
  const openerLine = /^ {0,3}<(script|style|template|pre|textarea)(?=[\s>]|$)/i;
  const lines = text.split("\n");
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const openMatch = line.match(openerLine);
    if (!openMatch) {
      kept.push(line);
      i++;
      continue;
    }
    const tag = (openMatch[1] ?? "").toLowerCase();
    const closerPattern = new RegExp(`</${tag}\\s*>`, "i");
    let j = closerPattern.test(line) ? i : i + 1;
    while (j < lines.length && !closerPattern.test(lines[j] ?? "")) j++;
    i = j < lines.length ? j + 1 : lines.length;
  }
  return kept.join("\n");
}

// The recognized CommonMark HTML-block-type-6 tag names (a curated common subset -- block-level
// container/structural elements). This is a DIFFERENT closing rule from stripNonRenderingHtmlBlocks'
// script/style/template/pre/textarea family (CommonMark type 1): a type-6 block is not looking for a matching
// closing tag at all -- it simply runs until the next blank line (or end of document), regardless
// of whether any of the lines it absorbs mention a closing tag. Markdown syntax (headings, table
// rows, checklist items) inside one of these tags -- with no blank line separating it from the
// tag -- is never parsed as Markdown by a real renderer; it displays as literal, inert text
// alongside the tag markup, the exact scenario this function exists to catch.
const GENERIC_HTML_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "legend",
  "li",
  "main",
  "menu",
  "menuitem",
  "nav",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "ul",
]);

/**
 * Strips CommonMark HTML-block-type-6 content: a line-level block-level container tag (div,
 * section, table, p, li, ...; see GENERIC_HTML_BLOCK_TAGS). A block only OPENS at the true start
 * of its own line (up to 3 leading spaces, the same tolerance every other stripper in this file
 * uses), an opening or closing angle bracket immediately followed by one of the recognized tag
 * names, itself followed by whitespace, ">", "/", or end of line -- never mid-line, so a sentence
 * mentioning one of these tags inside an inline code span is never mistaken for a real block.
 * Unlike stripNonRenderingHtmlBlocks (script/style/template/pre/textarea), this block type's closing condition
 * is NOT a matching closing tag -- CommonMark simply runs it through the next blank line (or end
 * of document), whatever content that line carries. A required heading, Graph Run row, or
 * checklist item placed inside one of these tags with no blank line separating it from the tag is
 * exactly the content this strips: a real renderer shows it as literal text beside the markup,
 * never as parsed Markdown structure.
 */
function stripGenericHtmlBlocks(text: string): string {
  const openerLine = new RegExp(`^ {0,3}<\\/?([A-Za-z][A-Za-z0-9]*)(?=[\\s>/]|$)`);
  // CommonMark HTML-block-type-7 (round 24): a line consisting of a COMPLETE open or closing tag
  // and nothing else -- ANY tag name, including hyphenated custom elements like <x-proof>, not
  // just the curated type-6 set below -- opens an HTML block with the same
  // run-through-the-next-blank-line closing rule as type 6. Open tags of the type-1 family are
  // excluded: stripNonRenderingHtmlBlocks owns those with its matching-closing-tag rule and runs
  // first. Without this, evidence or completion structure placed inside a custom-element block
  // renders as raw HTML in a real renderer but stayed live and findable here.
  const completeTagOnlyLine = /^ {0,3}<(\/?)([A-Za-z][A-Za-z0-9-]*)(?:\s[^<>]*)?\/?>\s*$/;
  const type1Tags = new Set(["script", "style", "template", "pre", "textarea"]);
  const lines = text.split("\n");
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const openMatch = line.match(openerLine);
    const tag = (openMatch?.[1] ?? "").toLowerCase();
    let opensBlock = Boolean(openMatch && GENERIC_HTML_BLOCK_TAGS.has(tag));
    if (!opensBlock) {
      const completeMatch = line.match(completeTagOnlyLine);
      const completeTag = (completeMatch?.[2] ?? "").toLowerCase();
      opensBlock = Boolean(completeMatch && (completeMatch[1] === "/" || !type1Tags.has(completeTag)));
    }
    if (!opensBlock) {
      kept.push(line);
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && (lines[j] ?? "").trim().length > 0) j++;
    i = j;
  }
  return kept.join("\n");
}

/**
 * Strips every form of Markdown (and raw HTML) that a real renderer does not parse as live
 * document structure: HTML comments (which render nothing at all), script/style/template/pre/
 * textarea blocks (see stripNonRenderingHtmlBlocks -- some of these render nothing, others render
 * only as literal preformatted text, but neither case is a parsed heading/table/checklist),
 * generic block-level HTML container tags (see stripGenericHtmlBlocks), backtick/tilde fenced code
 * blocks (CommonMark accepts both delimiters equally, and a shorter same-character run than the
 * opener never closes a fence -- see stripFenceChar), and indented code blocks (see
 * stripIndentedCodeBlocks). Used by every check that must not mistake hidden, fenced-off, or
 * code-block-only content for a live, parseable finding, section, or completion signal.
 */
export function stripNonRenderedMarkdown(text: string): string {
  const withoutComments = text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const withoutHtmlBlocks = stripGenericHtmlBlocks(stripNonRenderingHtmlBlocks(withoutComments));
  const withoutFences = stripFenceChar(stripFenceChar(withoutHtmlBlocks, "`"), "~");
  return stripIndentedCodeBlocks(withoutFences);
}
