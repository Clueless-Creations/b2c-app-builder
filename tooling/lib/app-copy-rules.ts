/**
 * app-copy-rules.ts — the machine-readable form of knowledge/words/conversion-copy.md
 * §Banned In App Copy, plus the product/copy/COPY_DECK.md table reader.
 *
 * The rule lists are PARSED OUT OF THE REFERENCE rather than duplicated here: the
 * reference is the single source of truth and this module is a reader for it. Only mechanically
 * checkable rules live here — banned internal vocabulary, placeholder shapes, and
 * identifier shapes. The judgment rules (tone, warmth, reading level) stay advisory
 * in the reference; regexing taste flattens brand voice.
 */
import { readFileSync } from "node:fs";

export interface AppCopyRules {
  /** Internal vocabulary that must never reach a user's screen. Whole-word, case-insensitive, inflected. */
  bannedTerms: string[];
  /** Filler that means a deck row was never authored. Substring, case-insensitive. */
  placeholderShapes: string[];
}

const LIST_MARKERS = {
  bannedTerms: "**Banned in app copy**",
  placeholderShapes: "**Placeholder shapes**",
} as const;

/**
 * Reads the rule lists out of the reference. Throws when a list is missing or
 * suspiciously short — a silently-empty banned list would make check:app-copy
 * pass copy it exists to catch.
 */
export function loadAppCopyRules(referencePath: string): AppCopyRules {
  const source = readFileSync(referencePath, "utf8");
  return {
    bannedTerms: extractList(source, LIST_MARKERS.bannedTerms, referencePath, 15),
    placeholderShapes: extractList(source, LIST_MARKERS.placeholderShapes, referencePath, 10),
  };
}

function extractList(source: string, marker: string, referencePath: string, minimumExpected: number): string[] {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`${referencePath} is missing the "${marker}" list. check:app-copy reads its rules from that list and cannot run without it.`);
  }
  const lines = source.slice(markerIndex + marker.length).split("\n");
  const listLine = lines.slice(1).find((line) => line.trim().length > 0 && !line.trim().startsWith("#") && !line.trim().startsWith("**"));
  if (!listLine) {
    throw new Error(`${referencePath} has "${marker}" but no list beneath it.`);
  }
  const items = listLine
    .split(",")
    .map((item) =>
      item
        .trim()
        .replace(/^\*\*|\*\*$/g, "")
        .replace(/\.$/, ""),
    )
    .filter((item) => item.length > 0);
  if (items.length < minimumExpected) {
    throw new Error(
      `${referencePath} lists only ${items.length} items under "${marker}", expected at least ${minimumExpected}. A truncated list would make check:app-copy pass copy it should catch.`,
    );
  }
  return items;
}

export interface DeckRow {
  key: string;
  moment: string;
  copy: string;
  notes: string;
  tier: string;
  /** 1-indexed line in the deck file, for actionable reporting. */
  line: number;
  /** The section heading the row sits under, e.g. "Onboarding". */
  section: string;
}

/** Deck keys are localization keys: lowercase dot-namespaced segments. */
// At least one DOT is required: keys are namespaced (onboarding.promise.headline),
// and segments may use _ or - internally (landing.sign_in). An underscore-only
// token is a flat identifier, not the promised resource-key hierarchy.
export const DECK_KEY_SHAPE = /^[a-z0-9]+(?:[_-][a-z0-9]+)*(?:\.[a-z0-9]+(?:[_-][a-z0-9]+)*)+$/;

export interface ParsedDeck {
  rows: DeckRow[];
  /** Pipe rows that are not header/separator and did not split into 5 cells — a dropped row is a validation bypass, so they are reported, never skipped. */
  malformed: { line: number; cells: number }[];
}

/** Escaped pipes (\|) are literal characters in the cell, not column breaks. */
const ESCAPED_PIPE = "\u0000";
function splitRow(line: string): string[] {
  return line
    .replace(/\\\|/g, ESCAPED_PIPE)
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.replaceAll(ESCAPED_PIPE, "|").trim());
}

/**
 * Reads every string-table row out of a product/copy/COPY_DECK.md. Header rows (first cell
 * "Key") and separator rows are skipped; a well-formed row has exactly 5 cells,
 * and every deck table is a string table, so anything else pipe-shaped is
 * reported as malformed rather than silently ignored.
 */
/** Markdown comments hide rows from the rendered deck; they must hide them from parsing too — with line numbers preserved. */
export function stripMarkdownComments(text: string): string {
  const stripped = text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "));
  // An unterminated opener hides the remainder of the rendered document —
  // the parseable tail must disappear the same way.
  const unterminated = stripped.indexOf("<!--");
  if (unterminated === -1) return stripped;
  return stripped.slice(0, unterminated) + stripped.slice(unterminated).replace(/[^\n]/g, " ");
}

export function parseDeck(rawDeckText: string): ParsedDeck {
  const deckText = stripMarkdownComments(rawDeckText);
  const rows: DeckRow[] = [];
  const malformed: { line: number; cells: number }[] = [];
  let section = "";
  deckText.split(/\r?\n/).forEach((rawLine, index) => {
    const heading = rawLine.match(/^##\s+(.+)$/);
    if (heading?.[1]) {
      section = heading[1].trim();
      return;
    }
    const line = rawLine.trim();
    // GFM permits omitting the outer pipes: a line with interior pipe structure
    // is a table row (or a malformed one) — silently excluding it would skip
    // every scan for that string.
    const maskedPipes = (line.replace(/\\\|/g, " ").match(/\|/g) ?? []).length;
    if (!line.startsWith("|") && maskedPipes < 2) return;
    const cells = splitRow(line);
    if (cells.every((cell) => /^:?-+:?$/.test(cell) || cell.length === 0)) return;
    if ((cells[0] ?? "").toLowerCase() === "key") return;
    if (cells.length !== 5) {
      malformed.push({ line: index + 1, cells: cells.length });
      return;
    }
    const [key = "", moment = "", copy = "", notes = "", tier = ""] = cells;
    rows.push({
      key: key.replace(/`/g, ""),
      moment,
      copy,
      notes,
      tier,
      line: index + 1,
      section,
    });
  });
  return { rows, malformed };
}

/**
 * Backticked deck-key references in guidance cells, e.g. `onboarding.promise.*`
 * or `paywall.cta` — the product/ONBOARDING.md screen table names its strings this way.
 * Returned as prefixes (the trailing .* stripped) so coverage can be reconciled
 * against the authored deck's actual keys.
 */
export interface KeyReference {
  key: string;
  /** True for `ns.*` namespace references; false for exact-key references, which must resolve to that exact key. */
  wildcard: boolean;
}

export function keyPrefixReferences(text: string): KeyReference[] {
  const references = new Map<string, KeyReference>();
  for (const match of text.matchAll(/`([a-z0-9]+(?:[._-][a-z0-9]+)*)(\.\*)?`/g)) {
    const token = match[1] ?? "";
    // A single-segment token is a key reference only with the wildcard —
    // `paywall.*` names a namespace; a bare `paywall` is just a word in code
    // formatting. Dotted tokens are references either way.
    const isWildcard = Boolean(match[2]);
    if (!token.includes(".") && !isWildcard) continue;
    if (FILE_REFERENCE.test(token)) continue;
    // A namespace reference subsumes an exact one for the same token.
    const existing = references.get(token);
    references.set(token, { key: token, wildcard: isWildcard || Boolean(existing?.wildcard) });
  }
  return [...references.values()];
}

/**
 * Backticked tokens that are files, not deck keys. Localization source and
 * resource files (`strings.dart`, `app_en.arb`, `strings.xml`, `.xcstrings`)
 * are legitimate references in guidance cells — treating them as exact deck
 * keys would fail coverage for the very files the mechanisms this validator
 * accepts are built from.
 */
const FILE_REFERENCE = /\.(md|html|ts|tsx|js|jsx|mjs|yaml|yml|json|swift|kt|kts|dart|arb|xml|xcstrings)$/i;

/**
 * Backticked spans that look like deck-key references but break the lowercase
 * key shape (`onboarding.Promise.*`). The lowercase matcher above would return
 * nothing for them, so coverage would silently skip the reference — a mistyped
 * pointer at a nonexistent key must be reported, not ignored.
 */
export function malformedKeyReferences(text: string): string[] {
  const bad = new Set<string>();
  // Inspect EVERY backticked span: a mistyped reference can contain characters
  // a charset-limited matcher would never see (`onboarding/promise.*`), and a
  // span that escapes both this check and coverage is a silent bypass.
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const span = (match[1] ?? "").trim();
    if (!span) continue;
    // A whitespace-corrupted key (`onboarding.promise .headline`) is still an
    // attempted reference: if removing the spaces yields the strict key shape,
    // report it — coverage would otherwise silently skip the screen.
    if (/\s/.test(span)) {
      const despaced = span.replace(/\s+/g, "");
      if (despaced.includes(".") && !FILE_REFERENCE.test(despaced.replace(/\.\*$/, "")) && /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\.\*)?$/.test(despaced)) {
        bad.add(span);
      }
      continue;
    }
    if (/[({]/.test(span)) continue;
    // Key-like: dotted, wildcarded, or a flat multi-segment snake/kebab token —
    // `onboarding_promise_headline` is a mistyped key, not a word in code style.
    const keyLike = span.includes(".") || span.endsWith("*") || /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)+$/.test(span);
    if (!keyLike) continue;
    if (FILE_REFERENCE.test(span.replace(/\.\*$/, ""))) continue;
    // Well-formed = the dotted namespace shape; a wildcard's ".*" supplies the
    // dot for single-segment namespaces (`paywall.*`). A flat snake token is a
    // mistyped key, not a valid reference.
    const wellFormed = span.includes(".") && /^[a-z0-9]+(?:[_-][a-z0-9]+)*(?:\.[a-z0-9]+(?:[_-][a-z0-9]+)*)*(?:\.\*)?$/.test(span);
    if (!wellFormed) bad.add(span);
  }
  return [...bad];
}

/**
 * Deck-local allowlist: product-owned words declared under "## Allowed terms",
 * one bullet each, term before any dash/colon reason. Mirrors check:founder-copy's
 * allowlist so a product whose voice genuinely owns a flagged word can say so
 * in the artifact itself.
 */
export interface AllowedTerm {
  term: string;
  /** The one-line rationale; the exemption is earned by the reason, so a reasonless bullet is reported, not honored. */
  reason: string;
}

export function deckAllowedTerms(rawDeckText: string): AllowedTerm[] {
  // A commented-out bullet grants nothing: the rendered deck declares no term.
  const deckText = stripMarkdownComments(rawDeckText);
  const match = deckText.match(/^##\s+Allowed terms\s*$([\s\S]*?)(?=^##\s|\n*$(?![\s\S]))/im);
  if (!match?.[1]) return [];
  const terms: AllowedTerm[] = [];
  for (const line of match[1].split(/\r?\n/)) {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (!bullet?.[1]) continue;
    const parts = bullet[1].split(/\s+[—–:-]\s+/);
    const term = (parts[0] ?? "").replace(/`/g, "").trim();
    const reason = parts.slice(1).join(" ").trim();
    if (term) terms.push({ term, reason });
  }
  return terms;
}

export interface CopyColumn {
  cells: { text: string; line: number }[];
  /** Body rows whose cell count differs from the header's — a lost or shifted cell can hide copy from the scan, so they are reported, never skipped. */
  malformed: { line: number; cells: number; expected: number }[];
}

/**
 * Extracts the Copy-column cells from any markdown table whose third column
 * header starts with "Copy" — the product/ONBOARDING.md screen-sequence shape. Returns
 * each cell with its 1-indexed line, plus every body row whose cell count
 * breaks the header's column count (an unescaped pipe or missing cell moves
 * text out of the scanned column).
 */
export function copyColumnCells(rawMarkdownText: string): CopyColumn {
  const markdownText = stripMarkdownComments(rawMarkdownText);
  const cells: { text: string; line: number }[] = [];
  const malformed: { line: number; cells: number; expected: number }[] = [];
  const lines = markdownText.split(/\r?\n/);
  let inCopyTable = false;
  let expectedCells = 0;
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const maskedPipes = (line.replace(/\\\|/g, " ").match(/\|/g) ?? []).length;
    if (!line.startsWith("|") && maskedPipes < 2) {
      inCopyTable = false;
      return;
    }
    const rowCells = splitRow(line);
    if (!inCopyTable) {
      const third = rowCells[2];
      if (rowCells.length >= 3 && third !== undefined && /^copy\b/i.test(third)) {
        inCopyTable = true;
        expectedCells = rowCells.length;
      }
      return;
    }
    if (rowCells.every((cell) => /^:?-+:?$/.test(cell))) return;
    if (rowCells.length !== expectedCells) {
      malformed.push({ line: index + 1, cells: rowCells.length, expected: expectedCells });
      return;
    }
    cells.push({ text: rowCells[2] ?? "", line: index + 1 });
  });
  return { cells, malformed };
}

/**
 * Machine-shaped tokens in copy: snake_case and SCREAMING_SNAKE identifiers,
 * ported from check-founder-copy. Deck keys never count — they live in the key
 * column, not the copy cell. ICU interpolations like {count} are stripped first:
 * a named placeholder is the localization contract working, not a leak.
 */
export function identifierShapes(text: string, options: { stripInlineCode?: boolean } = {}): string[] {
  // Strip full ICU MessageFormat expressions, nested braces included —
  // {item_count, plural, one {# item} other {# items}} is the localization
  // contract working, and its argument name must not read as an identifier.
  let stripped = text;
  while (/\{[^{}]*\}/.test(stripped)) {
    stripped = stripped.replace(/\{[^{}]*\}/g, " ");
  }
  // Inline code is exempt only where backticks mean "reference" (the
  // ONBOARDING Copy column). In a deck cell the backticked value is text the
  // user reads — `founder_approval` in copy is still the leak.
  if (options.stripInlineCode) {
    stripped = stripped.replace(/`[^`\n]*`/g, " ");
  } else {
    stripped = stripped.replace(/`/g, " ");
  }
  const found = new Set<string>();
  for (const match of stripped.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g)) {
    found.add(match[0]);
  }
  // Pipe-delimited serialized state ("high | founder | open"), same detector
  // check:founder-copy uses — an escaped \| in a deck cell renders to the user
  // as a literal pipe, so a three-segment pipe value is a record in a sentence.
  for (const match of stripped.matchAll(/[^\n|]{2,60}\|[^\n|]{2,60}\|[^\n|]{2,60}/g)) {
    const token = match[0].trim().replace(/\s+/g, " ");
    if (/^[\s|:-]+$/.test(token)) continue;
    found.add(token.length > 60 ? `${token.slice(0, 57)}...` : token);
  }
  return [...found];
}

/**
 * One negation lexicon for every affirmative-route check: the engineering
 * plan's deck route, the runnable prompt fence's deck route, and the
 * TECH_SPEC mechanism clause all reject a line that negates its own subject
 * ("Do not use product/copy/COPY_DECK.md", "Mechanism: don't use i18next"). One shared
 * list, so a form added for one check can never lag the others. Bare
 * "no"/"not"/"none" stay out — they appear inside legitimate affirmative
 * lines ("typed from product/copy/COPY_DECK.md, not the spec"); the mechanism check adds
 * them separately because its scope is a single clause, not a whole line.
 */
const NEGATION_FORMS = [
  "do not",
  "don't",
  "does not",
  "doesn't",
  "never",
  "avoid(?:s|ed|ing)?",
  "skip(?:s|ped|ping)?",
  "without",
  "instead of",
  "cannot",
  "can't",
  "can not",
  "won't",
  "will not",
  "refus(?:e|es|ed|ing)",
  "reject(?:s|ed|ing)?",
  "declin(?:e|es|ed|ing)",
];
export const NEGATION = new RegExp(`\\b(?:${NEGATION_FORMS.join("|")})\\b`, "i");

/**
 * The text a deck cell actually renders. Markdown tables render inline HTML,
 * so `&nbsp;`, `&#32;`, or `<br>` in a cell paints no words — a cell holding
 * only markup and whitespace entities is an empty cell wearing markup. The
 * emptiness check reads this rendered form, never the raw source.
 */
export function renderedCellText(cell: string): string {
  return (
    cell
      // Tags render no glyphs of their own (<br>, <br/>, <b>, <span ...>).
      .replace(/<\/?[a-z][^<>\n]*>/gi, " ")
      // Numeric character references render the code point they name.
      .replace(/&#x([0-9a-f]{1,6});/gi, (_entity, hex: string) => codePointOrSpace(Number.parseInt(hex, 16)))
      .replace(/&#([0-9]{1,7});/g, (_entity, dec: string) => codePointOrSpace(Number.parseInt(dec, 10)))
      // Named spacing and invisible entities render no ink.
      .replace(/&(?:nbsp|ensp|emsp|thinsp|zwnj|zwj|shy);/gi, " ")
      // Unicode spaces and invisibles are whitespace, not authored copy.
      .replace(/[\u00a0\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, " ")
  );
}

function codePointOrSpace(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

/** Prose comparison form: lowercase alphanumerics only, so punctuation or whitespace edits cannot dodge a verbatim match. */
export function normalizeProse(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The brief template's per-section instruction lines — the prose that tells
 * an author what to write instead of saying it. Parsed from the shipped
 * template (the same doc-is-the-gate contract the rule lists hold) so the
 * sentinel follows template edits instead of drifting from them. Markers,
 * headings, and table rows are excluded: the replace-this-line marker has
 * its own check, and an authored brief legitimately keeps the table headers.
 */
export function briefTemplateInstructionLines(templateText: string, sectionNames: string[]): string[] {
  const template = stripMarkdownComments(templateText);
  const lines: string[] = [];
  for (const section of sectionNames) {
    const body = template.match(new RegExp(`##\\s+${section}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i"))?.[1] ?? "";
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("|") || line.startsWith("#") || /^_Replace this line/i.test(line)) continue;
      if (normalizeProse(line).length >= 30) lines.push(line);
    }
  }
  return lines;
}
