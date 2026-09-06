/**
 * no-slop-rules.ts — the machine-readable form of knowledge/words/no-slop-writing.md.
 *
 * The rule lists are PARSED OUT OF THE REFERENCE rather than duplicated here. That is
 * deliberate: a second copy of a 26-word banned list drifts from the first the moment
 * anyone edits one of them, and this repo's history is a record of guidance drifting
 * away from the thing that enforces it. The reference is the single source of truth; this
 * module is a reader for it.
 *
 * Rules adapted from petergyang/no-ai-slop (MIT) — https://github.com/petergyang/no-ai-slop
 *
 * Only the mechanically checkable rules live here. The judgment-dependent rules ("cut the
 * adverb when it adds nothing, keep it when it carries the writer's rhythm") cannot be a
 * regex without punishing good writing, so they stay advisory in the reference and are
 * not enforced. Over-enforcement would flatten brand voice, which is the exact failure
 * the source skill warns about.
 */
import { readFileSync } from "node:fs";

export interface NoSlopRules {
  /** Words banned outright. Checked case-insensitively as whole words. */
  bannedWords: string[];
  /** Phrases that usually delay the point. Advisory, reported as warnings. */
  emptyPhrases: string[];
  /** Adverbs that are usually empty. Advisory only; never an error. */
  emptyAdverbs: string[];
}

/** Named patterns with a mechanical signature. Judgment-only patterns are omitted. */
export interface SlopPattern {
  id: string;
  /** What the writer did wrong, in one line. */
  problem: string;
  /** What to do instead. */
  fix: string;
  pattern: RegExp;
  severity: "error" | "warning";
}

/**
 * Patterns detectable without judgment. Each one matches a shape, not a topic, so a false
 * positive means the sentence genuinely has that shape and is worth a second look.
 */
export const slopPatterns: SlopPattern[] = [
  {
    id: "binary_contrast",
    problem: 'A "not X, it\'s Y" construction that withholds the point.',
    fix: "State Y directly.",
    pattern: /\b(?:it'?s|this is|that'?s) not (?:just )?[^.!?\n]{2,60}?[.,] (?:it'?s|this is|that'?s)\b/i,
    severity: "error",
  },
  {
    id: "binary_contrast_question",
    problem: "A \"the question isn't X, it's Y\" setup.",
    fix: "Make the claim about Y directly.",
    pattern: /\bthe (?:question|issue|problem|point) (?:isn'?t|is not)\b[^.!?\n]{2,80}?,\s*(?:it'?s|its)\b/i,
    severity: "error",
  },
  {
    id: "throat_clearing",
    problem: "An opener that delays the point.",
    fix: "Delete it and state the point.",
    pattern: /(?:^|[.!?]\s+|\n)\s*(?:here'?s the thing|here'?s what i mean|let me be clear|i'?ll be honest|the uncomfortable truth is)\b/i,
    severity: "error",
  },
  {
    id: "faux_insight",
    problem: "A setup that flatters the writer as the only person who knows this.",
    fix: "Cut the setup and let the claim stand alone.",
    pattern:
      /\b(?:what (?:most people|nobody|everyone) (?:gets? wrong|misses|tells you)|the part (?:most people skip|everyone misses)|this is the part most people skip|here'?s what nobody tells you)\b/i,
    severity: "error",
  },
  {
    id: "importance_puffery",
    problem: "Telling the reader something matters instead of showing why.",
    fix: "State the fact and let the reader judge.",
    pattern:
      /\b(?:stands as a testament|marks? a pivotal moment|plays? a vital role|solidifies? (?:its|their) position|underscores? (?:its|their) significance|is a testament to)\b/i,
    severity: "error",
  },
  {
    id: "interpretive_metadiscourse",
    problem: "An aside tells the reader how to interpret the text instead of supporting the point.",
    fix: "Delete the aside, or replace it with a concrete fact or consequence.",
    pattern: /\b(?:the key point is|as you can see|this distinction matters|that last part matters more than it sounds|the important thing is)\b/i,
    severity: "error",
  },
  {
    id: "weasel_attribution",
    problem: "An unsourced appeal to authority.",
    fix: "Name the source or cut the claim.",
    pattern: /\b(?:experts agree|studies show|research shows|industry reports suggest|many argue|widely regarded as|it is widely believed)\b/i,
    severity: "error",
  },
  {
    id: "superficial_analysis",
    problem: "A trailing -ing clause that pretends to explain meaning.",
    fix: "Say the concrete consequence instead.",
    pattern: /,\s*(?:highlighting|underscoring|reflecting|showcasing|demonstrating|signaling|cementing)\s+(?:the|its|their|a|an)\b/i,
    severity: "error",
  },
  {
    id: "fake_strong_verb",
    problem: 'A padded verb phrase where "is" or "has" is clearer.',
    fix: "Use the direct verb.",
    pattern: /\b(?:serves? as a|acts? as a|functions? as a)\s+(?:centralized|comprehensive|one-stop|unified|single)\b/i,
    severity: "error",
  },
  {
    id: "negative_listing",
    problem: '"Not a X. Not a Y. A Z." Just say Z.',
    fix: "Say Z.",
    pattern: /\bnot (?:a|an|just)\s+[^.!?\n]{2,40}\.\s*not (?:a|an|just)\s+[^.!?\n]{2,40}\./i,
    severity: "error",
  },
  {
    id: "rhetorical_setup",
    problem: "A rhetorical question or teaser standing in for a claim.",
    fix: "Drop it and make the point.",
    pattern: /\b(?:what if i told you|think about it:|plot twist:|here'?s the kicker|but wait, there'?s more)\b/i,
    severity: "error",
  },
  {
    id: "summary_recap_ending",
    problem: "A closing paragraph that restates what the reader just read.",
    fix: "End on the last concrete point, takeaway, or next action.",
    pattern: /(?:^|\n)\s*(?:in conclusion|to sum up|to summarize|ultimately,|overall,)\b/i,
    severity: "error",
  },
  {
    id: "dramatic_fragmentation",
    problem: "Stacked punchy fragments used for drama.",
    fix: "Use complete sentences.",
    pattern: /\bthat'?s it\.\s*that'?s (?:the whole thing|it)\b/i,
    severity: "error",
  },
  {
    id: "emoji_heading",
    problem: "An emoji in a heading.",
    fix: "Let the words carry it.",
    pattern: /^#{1,6}\s+[^\n]*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/mu,
    severity: "error",
  },
  {
    id: "colon_reveal",
    problem: "A noun phrase, a colon, then a lowercase dramatic reveal.",
    fix: "Rewrite as a plain sentence. Colons are for lists, labels, and quotes.",
    pattern:
      /(?:^|\n)(?:the (?:best|worst|real|hard|weird|surprising) (?:part|thing|bit|truth|detail)|the detail that makes it work|the catch|the twist)\s*:\s*[a-z]/,
    severity: "error",
  },
];

/** Section markers in knowledge/words/no-slop-writing.md that carry the word lists. */
const WORD_LIST_MARKERS = {
  bannedWords: "**Banned outright**",
  emptyAdverbs: "**Often-empty adverbs**",
  emptyPhrases: "**Often-empty phrases**",
} as const;

/**
 * Reads the rule lists out of the reference. Throws when a list is missing or suspiciously
 * short, because a silently-empty banned list would make this gate pass everything.
 */
export function loadNoSlopRules(referencePath: string): NoSlopRules {
  const source = readFileSync(referencePath, "utf8");
  const rules: NoSlopRules = {
    bannedWords: extractList(source, WORD_LIST_MARKERS.bannedWords, referencePath, 20),
    emptyAdverbs: extractList(source, WORD_LIST_MARKERS.emptyAdverbs, referencePath, 8),
    emptyPhrases: extractList(source, WORD_LIST_MARKERS.emptyPhrases, referencePath, 12),
  };
  return rules;
}

/**
 * Pulls a comma-separated list from the first non-empty prose line after a bold marker.
 * The reference writes each list as one comma-separated paragraph, so this stays a
 * one-line contract between the doc and the gate.
 */
function extractList(source: string, marker: string, referencePath: string, minimumExpected: number): string[] {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`${referencePath} is missing the "${marker}" list. check:app-copy reads its rules from that list and cannot run without it.`);
  }
  const after = source.slice(markerIndex + marker.length);
  const lines = after.split("\n");
  // Skip the remainder of the marker line (its trailing explanation) and blank lines.
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

/**
 * Regular suffixes an inflected form takes. The gate matched base forms only until v0.26.1,
 * which meant "leverage" failed and "leverages" passed: the same word, the same damage to
 * the same sentence, waved through because of one letter. A banned word is banned in every
 * form it appears in.
 *
 * "d" is listed separately from "ed" because most of the banned verbs end in e, so their
 * past tense is base + "d" ("leveraged", "elevated"). Those same verbs drop the e before
 * "-ing", which no flat suffix table can produce — hence the stem rules below.
 *
 * Irregular forms are deliberately absent. Every word on the banned list inflects
 * regularly, and guessing at irregulars would mean encoding a conjugation table in a
 * writing gate.
 */
const INFLECTION_SUFFIXES = ["s", "es", "ed", "d", "ing"] as const;

/**
 * Every form of a term the gate treats as the term itself, longest first so the regex
 * alternation prefers "leveraging" over "leverage" without relying on backtracking.
 *
 * The forms are generated, not curated, because the word lists are parsed out of the
 * reference and a maintainer can add a word any day. That makes false positives the risk
 * worth naming: a generated form is only dangerous if it spells an unrelated real word.
 * Checked against the 235k-headword system dictionary, the current list generates exactly
 * five real words — "fostering", "streamlined", "elevated", "elevating", "supercharged" —
 * and all five are inflections of their own base word. Suffixes stop at the five regular
 * ones for the same reason: "-ness" would turn "robust" into "robustness", which is a
 * different word doing a different job.
 */
export function inflectedForms(term: string): string[] {
  const forms = new Set<string>([term]);
  for (const suffix of INFLECTION_SUFFIXES) forms.add(term + suffix);
  // "leverage" -> "leveraging". An e-final verb drops the e before "-ing".
  if (/e$/i.test(term)) forms.add(`${term.slice(0, -1)}ing`);
  // "tapestry" -> "tapestries". Consonant + y pluralizes as "-ies", not "-ys".
  if (/[^aeiou]y$/i.test(term)) forms.add(`${term.slice(0, -1)}ies`);
  return [...forms].sort((left, right) => right.length - left.length);
}

/**
 * Whole-word, case-insensitive match that tolerates hyphenated multi-word terms and the
 * inflected forms above. Multi-word terms inflect on their last word, which is the form
 * that matters: "paradigm shift" catches "paradigm shifts".
 */
export function matchesTerm(text: string, term: string): boolean {
  const alternatives = inflectedForms(term).map(escapeTerm).join("|");
  return new RegExp(`(^|[^A-Za-z0-9'-])(?:${alternatives})([^A-Za-z0-9'-]|$)`, "i").test(text);
}

function escapeTerm(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

/**
 * Em-dash budget. The source rule is "none in short copy, 1-2 in longer drafts when they
 * clearly beat the alternatives", so the gate only fires on clusters and on short copy.
 */
export function emDashProblem(text: string, isShortCopy: boolean): string | undefined {
  const count = (text.match(/—/g) ?? []).length;
  if (count === 0) return undefined;
  if (isShortCopy) return `Short copy uses ${count} em dash${count === 1 ? "" : "es"}. Use commas, periods, or parentheses instead.`;
  if (count > 2) return `${count} em dashes. Keep at most two, and only where they clearly beat a comma or a period.`;
  return undefined;
}
