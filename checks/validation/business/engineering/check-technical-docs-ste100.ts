#!/usr/bin/env node
/**
 * check-technical-docs-ste100.ts — the mechanically checkable subset of ASD-STE100.
 *
 * knowledge/engineering/technical-documentation-ste100.md names two rules a machine can
 * verify without judgment: sentence length and present-perfect tense. Everything else in
 * its §3 (one word per meaning, active voice, noun-cluster length) stays judgment-only, the
 * same limit tooling/lib/no-slop-rules.ts documents for the sibling standard — a regex would
 * punish good writing as often as it catches bad writing.
 *
 * Two severity tiers, mirroring check-no-slop.ts's own front-door split: error tier applies
 * only to files this reference can currently guarantee compliant (today, just the reference
 * itself); warning tier applies to the rest of the governed surface — docs/architecture.md,
 * docs/validators.md, and every knowledge/**\/*.md file outside knowledge/words/ (which keeps
 * no-slop-writing.md's voice-preserving register instead). This gives real, repo-wide signal
 * on every edit without failing the build over prose written before this standard existed.
 * Promoting a file to error tier means auditing it against the reference's §3/§4 first, then
 * adding its skill-root-relative path to ERROR_TIER_SKILL_RELATIVE below.
 *
 * npm script: check:documentation-ste100
 * Usage: tsx checks/validation/business/engineering/check-technical-docs-ste100.ts [--repo-root /path] [--skill-root /path]
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, flagString, issue, parseFlags, reportAndExit, type Issue, type Severity } from "../../../../tooling/lib/launch-state.js";
import { findGitRoot } from "../../../../tooling/lib/git-root.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--repo-root"], key: "repoRoot" },
  { flags: ["--skill-root"], key: "skillRoot" },
]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const repoRoot = path.resolve(flagString(flags, "repoRoot") ?? findGitRoot(skillRoot) ?? path.resolve(skillRoot, "../.."));

const issues: Issue[] = [];

const MAX_SENTENCE_WORDS = 20;

/** Common regular (-ed) and irregular past-participle shapes, for the present-perfect heuristic below. */
const PAST_PARTICIPLE =
  "(?:\\w+ed|been|done|gone|known|shown|written|given|taken|made|found|become|begun|chosen|come|drawn|driven|fallen|felt|gotten|got|grown|held|kept|left|lost|met|paid|run|said|seen|sent|set|spoken|spent|stood|taught|thought|told|understood|won|worked|read|meant|built|bought|caught|brought|fought|sought)";
// An adverb between the auxiliary and the participle ("has successfully checked") does not stop
// the sentence from being present perfect -- a fixed list of five modifiers (not/never/already/
// just/recently) missed every other adverb, so "has successfully checked" passed even in the
// error-tier reference. \w+ly covers the regular case (most English adverbs); the fixed words
// cover the common irregular ones that don't end in -ly. Zero or more, so stacked adverbs
// ("has already successfully checked") are covered too.
const INTERVENING_ADVERB = "(?:not|never|already|just|\\w+ly)";
const presentPerfectPattern = new RegExp(`\\b(?:has|have|had)\\s+(?:${INTERVENING_ADVERB}\\s+)*${PAST_PARTICIPLE}\\b`, "i");

/**
 * A period that ends an abbreviation ("e.g.", "etc.") or sits inside a decimal or version
 * number ("3.5", "v0.114.0") is not a sentence boundary. Left alone, the sentence-splitting
 * regex below reads every one of those periods as one, so a real sentence over the word
 * ceiling can pass by fragmenting into short-looking pieces at each abbreviation. Swapped for
 * this Private-Use-Area sentinel (never appears in real markdown, and unlike a null byte
 * carries no risk of a downstream tool reading the string as binary) before splitting, then
 * restored to '.' once sentence boundaries are final.
 */
const PROTECTED_PERIOD = "\uE000";
// Only the technical/citation abbreviations this repo's own governed prose actually uses are
// protected -- title abbreviations (Mr., Dr., ...) are deliberately excluded, since they never
// occur in this repo's technical documentation. "no" and "st" are excluded too: both are common
// as ordinary sentence-final words ("the answer is no.", "first, second, ... last."), and
// protecting their period would merge a real sentence boundary into the next sentence instead
// of fixing a false split.
//
// "e.g.", "i.e.", "cf.", "vs.", "approx.", "fig.", and "et al." grammatically always introduce
// more of the same sentence -- none of them, used correctly, is ever the last word of a
// complete sentence -- so their period is protected unconditionally. This repo's own
// knowledge/engineering/backend-data-contract.md proves why a lowercase-only check would be
// wrong here: it reads "...a migration tool (e.g. Prisma Migrate, Alembic, node-pg-migrate) in
// the contract", where "e.g." is followed by a capitalized product name, not a lowercase word.
const ALWAYS_MID_SENTENCE_ABBREVIATION = /\b(?:e\.g|i\.e|vs|approx|cf|fig|et al)\.(?=\s)/gi;
// "etc." ("and so forth") is the one exception with genuine ambiguity: unlike the abbreviations
// above, it commonly IS the last word of its own sentence ("Bring pens, paper, etc."). Its
// period is protected only when a lowercase continuation follows -- a real mid-sentence use
// ("etc. and so on") -- and left as a real sentence boundary otherwise. This check has to run
// case-sensitively as a plain string test, not as a regex lookahead on the same pattern: the
// match itself needs the "i" flag ("Etc." and "etc." both count), and "i" would make a `[a-z]`
// lookahead match uppercase too, silently defeating the whole check.
const ETC_ABBREVIATION = /\betc\.(?=\s)/gi;
const DECIMAL_OR_VERSION_PERIOD = /(\d)\.(?=\d)/g;

function protectNonTerminalPeriods(text: string): string {
  const withAlwaysProtected = text.replace(ALWAYS_MID_SENTENCE_ABBREVIATION, (match) => match.replace(/\./g, PROTECTED_PERIOD));
  const withEtcProtected = withAlwaysProtected.replace(ETC_ABBREVIATION, (match, offset: number) => {
    const continuesLowercase = /^\s+[a-z]/.test(withAlwaysProtected.slice(offset + match.length));
    return continuesLowercase ? match.replace(/\./g, PROTECTED_PERIOD) : match;
  });
  return withEtcProtected.replace(DECIMAL_OR_VERSION_PERIOD, `$1${PROTECTED_PERIOD}`);
}

/**
 * skill-root-relative paths this reference can currently guarantee compliant. This is the
 * one file so far: the reference itself, hand-written to its own rules.
 */
const ERROR_TIER_SKILL_RELATIVE = new Set<string>(["knowledge/engineering/technical-documentation-ste100.md"]);

/** Excluded from every governed directory below: evals/fixtures are test data, not documentation. */
const EXCLUDED_ANY_SEGMENT = new Set(["evals", "fixtures"]);
/** Excluded from knowledge/ specifically: words/ keeps no-slop-writing.md's voice-preserving register instead. */
const EXCLUDED_KNOWLEDGE_TOP_SEGMENTS = new Set(["words"]);

/**
 * Maintainer runbook and reference directories outside docs/ and knowledge/ that this
 * reference's own scope names ("a runbook", "validator/gate references") but that live
 * elsewhere in the repo layout — e.g. checks/validation/repository/source-freshness-maintenance.md.
 * Scanned recursively for .md files, skill-root-relative. Add a directory here — not a new
 * bespoke discovery block — when a future runbook lands somewhere not yet covered.
 */
const ADDITIONAL_GOVERNED_DIRECTORIES = ["checks/validation/repository", "tooling"];

interface GovernedFile {
  /** Path shown in issue output, relative to repoRoot. */
  displayPath: string;
  absolute: string;
  tier: Severity;
}

const governed: GovernedFile[] = [];

// This repo-root-relative allowlist stays explicit rather than a scanned directory like
// ADDITIONAL_GOVERNED_DIRECTORIES below: docs/ also holds exploratory and point-in-time
// content (plans, history, an open backlog) this repo's own conventions already keep outside
// every gate, so a blanket scan would govern files that were never meant to be governed. Add a
// new architecture doc, ADR, or validator reference here by name once it exists. (The platform
// docs governed here before 2026-08-19 moved out of this repository with the
// platform itself.)
for (const relative of [
  "docs/architecture.md",
  "docs/validators.md",
  "docs/implementation/graph-execution-v2.md",
  "docs/implementation/business-operating-vocabulary.md",
]) {
  const absolute = path.join(repoRoot, relative);
  if (!existsSync(absolute)) continue;
  governed.push({ displayPath: relative, absolute, tier: "warning" });
}

// SKILL.md is a technical router named by this reference's trigger paragraph.
// README.md is a mixed front-door document: no-slop owns narrative, and this
// file's mechanical 20-word scan must not cover the whole README.
for (const relative of ["SKILL.md"]) {
  const absolute = path.join(skillRoot, relative);
  if (!existsSync(absolute)) continue;
  const displayPath = path.relative(repoRoot, absolute).split(path.sep).join("/");
  governed.push({ displayPath, absolute, tier: "warning" });
}

function collectGovernedMarkdown(baseRelative: string, excludedTopSegments: Set<string>): void {
  const baseDir = path.join(skillRoot, baseRelative);
  if (!existsSync(baseDir) || !statSync(baseDir).isDirectory()) return;
  for (const absolute of collectFiles(baseDir, new Set([".md"]))) {
    const relativeToBase = path.relative(baseDir, absolute).split(path.sep).join("/");
    const segments = relativeToBase.split("/");
    if (excludedTopSegments.has(segments[0] ?? "")) continue;
    if (segments.some((segment) => EXCLUDED_ANY_SEGMENT.has(segment))) continue;
    const skillRelative = `${baseRelative}/${relativeToBase}`;
    const displayPath = path.relative(repoRoot, absolute).split(path.sep).join("/");
    governed.push({ displayPath, absolute, tier: ERROR_TIER_SKILL_RELATIVE.has(skillRelative) ? "error" : "warning" });
  }
}

collectGovernedMarkdown("knowledge", EXCLUDED_KNOWLEDGE_TOP_SEGMENTS);
for (const directory of ADDITIONAL_GOVERNED_DIRECTORIES) {
  collectGovernedMarkdown(directory, new Set());
}

for (const file of governed) {
  const source = readFileSync(file.absolute, "utf8");
  for (const sentence of sentencesOf(source)) {
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_SENTENCE_WORDS) {
      issues.push(
        issue(
          file.tier,
          "ste100.sentence_too_long",
          `Sentence runs ${wordCount} words, over ASD-STE100's ${MAX_SENTENCE_WORDS}-word ceiling (technical-documentation-ste100.md §3): "${truncate(sentence)}"`,
          file.displayPath,
        ),
      );
    }
    if (presentPerfectPattern.test(sentence)) {
      issues.push(
        issue(
          file.tier,
          "ste100.present_perfect",
          `Sentence uses present-perfect tense, not the simple tense ASD-STE100 §3 requires: "${truncate(sentence)}"`,
          file.displayPath,
        ),
      );
    }
  }
}

reportAndExit("Technical docs: ASD-STE100 mechanical subset", issues);

function truncate(text: string): string {
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

/**
 * Prose a reader actually reads: drops fenced/inline code, HTML comments, and link targets
 * (mirroring check-no-slop.ts's proseText). Double-quoted spans stay in general — a quoted
 * UI label or error message inside a real sentence is still the author's own prose and must
 * still be graded. The one exemption is narrower and lives in the table-row branch below: a
 * table cell that is nothing BUT a single quoted string (this file's own §3 table quotes both
 * "Do" and intentionally bad "Don't" examples this way) is a cited illustration, not an
 * assertion, so only that whole-cell case is dropped.
 */
function sentencesOf(source: string): string[] {
  const stripped = protectNonTerminalPeriods(
    source
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\]\([^)]*\)/g, "] ")
      .replace(/`[^`\n]*`/g, " "),
  );

  // Matches a bullet/numbered marker -- "-", "*", or "+" are all valid CommonMark unordered
  // markers -- and, optionally, a GFM task-list checkbox right after it ("- [ ] " or "1. [x] ").
  // Both the marker and the checkbox are formatting, not words, and both inflate the word count
  // the same way if left in place.
  const LIST_MARKER = /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;

  // A list item that wraps onto a following physical line (no blank line between, and that
  // line isn't itself a new block -- a list item, a table row, a heading, a rule) is one
  // logical sentence split across lines. This is true whether or not the continuation line is
  // indented: CommonMark's "lazy continuation" rule counts an unindented follow-on line as part
  // of the same list item too, as long as nothing blank or block-starting comes first. Grouped
  // BEFORE the blank-line filter below, so a real paragraph break still starts a new group;
  // left ungrouped, each physical line would get its own forced sentence boundary further down,
  // letting a real over-ceiling instruction hide by fragmenting across its own wrapped lines.
  function groupWrappedListContinuations(rawLines: string[]): string[] {
    const grouped: string[] = [];
    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      const previous = grouped[grouped.length - 1];
      const previousIsListItem = previous !== undefined && LIST_MARKER.test(previous.trimStart());
      const isContinuation =
        previousIsListItem &&
        trimmed.length > 0 &&
        !LIST_MARKER.test(trimmed) &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("|") &&
        !/^[-*_]{3,}$/.test(trimmed);
      if (isContinuation) {
        grouped[grouped.length - 1] = `${previous.trimEnd()} ${trimmed}`;
      } else {
        grouped.push(rawLine);
      }
    }
    return grouped;
  }

  const filteredLines = groupWrappedListContinuations(stripped.split("\n")).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith("#")) return false;
    if (/^\|[\s:|-]+\|?$/.test(trimmed)) return false; // table separator row, e.g. |---|---|
    if (/^[-*_]{3,}$/.test(trimmed)) return false;
    return true;
  });

  const isListItemLine = (value: string): boolean => LIST_MARKER.test(value);
  const isTableRowLine = (value: string): boolean => value.startsWith("|") && value.endsWith("|");

  const lines = filteredLines.map((line, index) => {
    const trimmed = line.trim();
    // A table row's cells are discrete units, same reasoning as a list item — force a
    // boundary at each cell so a long or present-perfect cell can't hide by merging with its
    // neighbors, and the row can't merge into surrounding prose either. A cell that is nothing
    // but a single quoted string (a cited Do/Don't example, not the author's own assertion) is
    // dropped; a cell with only a partial or embedded quote stays and is graded in full.
    if (isTableRowLine(trimmed)) {
      return trimmed
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .filter((cell) => !/^"[^"]*"\.?$/.test(cell))
        .map((cell) => (/[.!?]$/.test(cell) ? cell : `${cell}.`))
        .join(" ");
    }
    // A list item is a discrete unit by definition — force a boundary at its end so it never
    // merges with the next bullet into one oversized chunk, even when the item itself is a
    // short phrase with no terminal punctuation. The marker itself ("-", "*", "1.") is struck
    // first: it is formatting, not a word, and left in place it inflates the word count by one,
    // enough to fail an exactly-20-word compliant bullet.
    if (isListItemLine(trimmed)) {
      const withoutMarker = trimmed.replace(LIST_MARKER, "");
      return /[.!?]$/.test(withoutMarker) ? withoutMarker : `${withoutMarker}.`;
    }
    // A colon does NOT end a sentence in general — "Follow this procedure: open the file,
    // read line one, ..." is one long instruction a colon must not let escape the word-count
    // rule by splitting it into two short-looking halves. The one structural exception: a
    // line that ends with ':' specifically to introduce the list that follows it. There, the
    // colon is punctuation between two document *structures* (an intro and a list), not
    // punctuation inside one grammatical sentence, so converting it to a real boundary is
    // safe and keeps that intro from merging into the first bullet's own chunk.
    const nextTrimmed = filteredLines[index + 1]?.trim();
    if (nextTrimmed !== undefined && isListItemLine(nextTrimmed) && /:$/.test(trimmed)) {
      return trimmed.replace(/:$/, ".");
    }
    return trimmed;
  });

  const joined = lines.join(" ");
  // A trailing prose chunk with no terminal punctuation would otherwise fall off the end of
  // the match below unseen — force a boundary so the final segment always gets checked too.
  const closed = /[.!?]\s*$/.test(joined) ? joined : `${joined}.`;
  const rawSentences = closed.match(/[^.!?]+[.!?]+/g) ?? [];
  return rawSentences.map((entry) => entry.trim().split(PROTECTED_PERIOD).join(".")).filter(Boolean);
}
