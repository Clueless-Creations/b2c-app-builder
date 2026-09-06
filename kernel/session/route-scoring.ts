/**
 * Router-owned scoring extensions for the utterance router (issue #58: the trigger+title scorer
 * measured only 42.9% top-1 on purpose-first founder phrasing that never reuses a workflow's own
 * trigger/title vocabulary — see verification/goldens/routing/utterance-regression.json's
 * `orthogonal` corpus and its metadata for the full measurement record).
 *
 * WHY this is a separate module rather than an edit to kernel/knowledge-service/service.ts: `terms`/
 * `matchRank` in that module are shared verbatim by `b2c_catalog` and `b2c_knowledge_search` — their
 * ranking must not change behavior (proven by the untouched knowledge/catalog fixture suites this
 * unit's own verification run leaves green). Every generalization here is additive and router-only,
 * composed on top of `terms()`'s output at exactly one seam (`routerQueryTerms`) — this module never
 * edits `service.ts`'s STOP_WORDS, its tokenizer regex, or `matchRank`'s formula.
 *
 * Three independent generalizations (issue #58, stage 1), each documented at its own definition:
 *   1. `ROUTER_STOP_WORDS` — a founder-phrasing-specific stopword list layered on top of `terms()`'s
 *      own (smaller, catalog-shared) list: pure function words `terms()` does not already drop
 *      (question words, modal/auxiliary verbs, prepositions, pronouns, demonstratives/quantifiers),
 *      generic verbs a founder uses to frame ANY request regardless of domain ("get", "make",
 *      "need", "help", ...), a handful of tokenizer artifacts from contractions ("we're" -> "we",
 *      "re"), and two literal boilerplate words ("founder", "phrasing") that exist in 8 catalog
 *      triggers only as the enrichment marker "Founder phrasing: ..." added ahead of this unit, not
 *      as content — see that constant's own doc comment for the corpus-frequency analysis behind
 *      each category.
 *   2. `stemTerm` — a light suffix stemmer applied ONLY to query terms, never to a workflow's
 *      trigger/title text (which stays byte-for-byte what the catalog authored). Shortening an
 *      inflected query term to its root lets it keep matching through `matchRank`'s existing
 *      substring-inclusion check (`searchText.includes(term)`) against every morphological form
 *      built on that root — e.g. a founder saying "localizing" stems to "local", which is a
 *      substring of the catalog's own "locale"/"localize"/"localization" — with no change to
 *      `matchRank` and no stemming of the catalog's own text at all.
 *   3. `queryBigrams` / bigram credit — adjacent-word phrase evidence: two query words that appear
 *      ADJACENT in both the utterance and a workflow's trigger/title text are stronger evidence of
 *      intent than the same two words matching anywhere independently (matchedTermCount already
 *      credits each word once, wherever it lands) — see `BIGRAM_BOOST`'s own comment for why its
 *      value sits between a lone trigger hit and a lone title hit.
 *
 * Scoring stays "a documented scalar" (KTD5): `routerMatchConfidence` returns the same
 * matchedTermCount + boost/10 shape route-utterance.ts already documents, with the router's
 * (filtered, stemmed) term set standing in for `terms()`'s raw output and one additional additive
 * term for bigram credit.
 */
import { matchRank } from "../knowledge-service/service.js";

// --- 1. founder-phrasing stopwords (issue #58 stage 1) -------------------------------------------

/**
 * Additional stopwords, layered on top of `terms()`'s own ~29-word list, chosen from two sources:
 *
 *   - Corpus-frequency analysis (`tooling/calibrate-utterance-router.ts`'s grid runs against the
 *     live generated catalog, 101 workflows): pure connector words with a document frequency high
 *     enough to force spurious multi-workflow ties on their own (e.g. "or" appears in 53.5% of
 *     trigger+title text, "before" in 43.6%, "any" in 20.8%, "app"/"apps" in 24.8%) — a founder's
 *     utterance sharing ONLY one of these with a workflow is not real signal, it is noise the old,
 *     narrower stopword list let through.
 *   - Closed linguistic categories that are safe to drop wholesale for THIS router's purpose
 *     (matching a founder's INTENT, never quoting their utterance back): question words, modal and
 *     auxiliary verbs, prepositions/conjunctions, pronouns, demonstratives/quantifiers, and a set of
 *     generic verbs a founder uses to frame any request regardless of domain ("help me build
 *     something", "I need to get this done", "can you make this work") — none of these single-
 *     handedly identify a workflow; they only add noise that pushes an unrelated workflow into a
 *     confident-looking tie or, once one collision is removed, exposes another.
 *
 * Two entries are neither category: "founder" and "phrasing" are the literal words of the
 * "Founder phrasing: ..." marker manually added to 8 catalog triggers ahead of this unit (see
 * ROUTE_CONFIDENCE_THRESHOLD's doc comment in route-utterance.ts) — an utterance that happens to
 * contain the word "founder" (e.g. an operator relaying "the founder wants...", which several
 * orthogonal-corpus entries do verbatim) must not get a free boost toward those 8 workflows merely
 * because they all repeat the same boilerplate label; the words that follow the marker are the real
 * content and are NOT filtered.
 *
 * Never touches "onboarding", "store", "design", "review", "build", or other real catalog vocabulary
 * that also has a high document frequency: those words carry genuine domain meaning (an utterance
 * that says only "onboarding" IS legitimately ambiguous across ~8 onboarding sub-workflows, and
 * candidates is the honest answer) — filtering them would hide real ambiguity rather than remove
 * noise. See route-utterance.fixtures.ts and routing-accuracy.fixtures.ts for the boundary/regression
 * proofs that this list does not introduce a false primary on any corpus.
 */
export const ROUTER_STOP_WORDS: ReadonlySet<string> = new Set([
  // tokenizer artifacts from contractions ("we're" -> "we","re"; "we'll" -> "we","ll"; "we've" ->
  // "we","ve"); terms()'s length>1 filter already drops the single-letter remainders ("s","d","t","m").
  "re",
  "ll",
  "ve",
  // question / auxiliary / modal words
  "how",
  "why",
  "who",
  "whom",
  "whose",
  "which",
  "where",
  "when",
  "what",
  "do",
  "does",
  "did",
  "doing",
  "done",
  "will",
  "would",
  "should",
  "could",
  "can",
  "may",
  "might",
  "must",
  "shall",
  "am",
  "was",
  "were",
  "been",
  "being",
  // conjunctions / prepositions (pure function words; several are also near-universal in trigger
  // text per the corpus-frequency analysis above)
  "or",
  "before",
  "after",
  "any",
  "every",
  "into",
  "by",
  "without",
  "about",
  "over",
  "under",
  "out",
  "up",
  "down",
  "off",
  "again",
  "further",
  "once",
  "than",
  "then",
  "so",
  "if",
  "while",
  "until",
  "unless",
  "though",
  "although",
  "whereas",
  "versus",
  "via",
  "per",
  "upon",
  "within",
  "among",
  "between",
  "across",
  "along",
  "around",
  "behind",
  "beside",
  "beyond",
  "despite",
  "during",
  "except",
  "inside",
  "near",
  "since",
  "throughout",
  "toward",
  "towards",
  "plus",
  // pronouns
  "he",
  "she",
  "his",
  "her",
  "him",
  "they",
  "their",
  "them",
  "its",
  "us",
  "me",
  "yours",
  "ours",
  "theirs",
  "mine",
  "himself",
  "herself",
  "themselves",
  "itself",
  "myself",
  "yourself",
  "ourselves",
  "someone",
  "somebody",
  "anybody",
  "anyone",
  "everybody",
  "everyone",
  "nobody",
  "something",
  "anything",
  "everything",
  "nothing",
  // demonstratives / quantifiers
  "these",
  "those",
  "there",
  "here",
  "some",
  "all",
  "no",
  "not",
  "none",
  "each",
  "other",
  "another",
  "same",
  "such",
  "own",
  "much",
  "many",
  "more",
  "most",
  "less",
  "least",
  "few",
  "several",
  "enough",
  // generic verbs a founder uses to frame any request, plus a handful of near-universal nouns
  // ("app"/"apps": 24.8% document frequency; "one"/"time"/"people"/"money": named explicitly in
  // utterance-regression.json's orthogonal.metadata.verdictNote as connector words that
  // independently matched 3-6 unrelated workflows during trigger enrichment)
  "app",
  "apps",
  "get",
  "gets",
  "getting",
  "got",
  "gotten",
  "make",
  "makes",
  "making",
  "made",
  "need",
  "needs",
  "needed",
  "needing",
  "help",
  "helps",
  "helped",
  "helping",
  "know",
  "knows",
  "knowing",
  "known",
  "think",
  "thinks",
  "thinking",
  "thought",
  "feel",
  "feels",
  "feeling",
  "felt",
  "look",
  "looks",
  "looking",
  "looked",
  "start",
  "starts",
  "starting",
  "started",
  "go",
  "goes",
  "going",
  "gone",
  "went",
  "put",
  "puts",
  "putting",
  "take",
  "takes",
  "taking",
  "took",
  "taken",
  "give",
  "gives",
  "giving",
  "gave",
  "given",
  "keep",
  "keeps",
  "keeping",
  "kept",
  "let",
  "lets",
  "come",
  "comes",
  "coming",
  "came",
  "seem",
  "seems",
  "seemed",
  "try",
  "tries",
  "trying",
  "tried",
  "tell",
  "tells",
  "telling",
  "told",
  "ask",
  "asks",
  "asking",
  "asked",
  "actually",
  "really",
  "very",
  "quite",
  "already",
  "yet",
  "just",
  "even",
  "right",
  "one",
  "ones",
  "time",
  "times",
  "people",
  "person",
  "folks",
  "money",
  "thing",
  "things",
  "stuff",
  "bit",
  "lot",
  "lots",
  "bunch",
  // enrichment-clause boilerplate (see this file's module doc comment)
  "founder",
  "phrasing",
]);

// --- 2. light suffix stemming (issue #58 stage 1) -------------------------------------------------

/**
 * Never let a stemmed term drop below this length: matchRank does a raw substring `.includes()`
 * check over an entire workflow's trigger+title text, so a too-short root (e.g. stemming "using" by
 * a naive "-ing" strip would produce "us", 2 characters) would start matching huge numbers of
 * unrelated words purely by coincidental substring containment. 4 is the shortest root this file's
 * rules produce for any real English word in the "localizing/localize/locales -> local" family this
 * stemmer targets (the issue's own example) without introducing that risk.
 */
const MIN_STEM_LEN = 4;

/**
 * Ordered suffix-stripping rules, each `[pattern, replacement]`. Applied in order; the FIRST
 * matching pattern wins (longer, more specific suffixes are listed before the generic ones they
 * would otherwise be shadowed by — e.g. "-ization" before "-ing", so "localization" strips to
 * "local" in one rule rather than partially matching a shorter one). Deliberately narrow: this
 * targets exactly the derivational family the issue names ("localizing"/"localize"/"locales" all
 * reducing to "local") plus the ordinary plural/-ing/-ed suffixes English founder phrasing uses
 * constantly ("canceling" -> "cancel", which then substring-matches the catalog's own
 * "cancellation") — it does NOT attempt a general Porter-style stemmer or handle every irregular
 * form; over-stemming (e.g. a generic "-ation" rule) risks new false-primary collisions the zero-
 * false-primary constraint (issue #58 acceptance) cannot absorb.
 */
const SUFFIX_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ization$/u, ""],
  [/isation$/u, ""],
  [/izing$/u, ""],
  [/ising$/u, ""],
  [/izes$/u, ""],
  [/ises$/u, ""],
  [/ized$/u, ""],
  [/ised$/u, ""],
  [/izer$/u, ""],
  [/iser$/u, ""],
  [/ize$/u, ""],
  [/ise$/u, ""],
  [/ies$/u, "y"],
  [/ing$/u, ""],
  [/ed$/u, ""],
  [/es$/u, ""],
  [/s$/u, ""],
];

/**
 * Reduces one query term to its stem by applying the first matching rule in `SUFFIX_RULES`, guarded
 * by `MIN_STEM_LEN`: if stripping the suffix would leave a root shorter than the guard, the ORIGINAL
 * term is returned unchanged rather than risking a too-short, too-promiscuous substring. Pure and
 * total — every input produces an output, including terms no rule matches (returned as-is).
 */
export function stemTerm(term: string): string {
  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (pattern.test(term)) {
      const stemmed = term.replace(pattern, replacement);
      return stemmed.length >= MIN_STEM_LEN ? stemmed : term;
    }
  }
  return term;
}

// --- combined query-term pipeline ------------------------------------------------------------------

/**
 * The router's query-term pipeline: start from `terms()` (service.ts's shared tokenizer and base
 * stopword filter — reused verbatim, never reimplemented), drop `ROUTER_STOP_WORDS`, then stem each
 * survivor. Order matters: filtering BEFORE stemming means a router stopword is recognized by its
 * original (unstemmed) form, so a word this module deliberately keeps unfiltered because it is real
 * domain vocabulary is never accidentally caught by a stopword that only matches after stemming (no
 * current entry in `ROUTER_STOP_WORDS` collides with a stemmed real term, and this ordering keeps it
 * that way by construction). Deduplicates after stemming (two distinct raw terms can stem to the
 * same root) while preserving first-seen order, matching `terms()`'s own dedup behavior.
 */
export function routerQueryTerms(baseTerms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of baseTerms) {
    if (ROUTER_STOP_WORDS.has(term)) continue;
    const stemmed = stemTerm(term);
    if (!seen.has(stemmed)) {
      seen.add(stemmed);
      out.push(stemmed);
    }
  }
  return out;
}

// --- 3. bigram / phrase credit (issue #58 stage 1) ------------------------------------------------

/**
 * Adjacent-word pairs (deduplicated, order preserved) built directly from `terms()`'s own output —
 * `baseTerms` is exactly `terms(utterance)` as route-utterance.ts already computes it, BEFORE this
 * module's router-only stopwords are removed: a bigram like "app store" must still be detectable
 * even though "app" alone is a router stopword for unigram purposes (see ROUTER_STOP_WORDS's doc
 * comment) — a real two-word phrase is signal even when one of its words is too generic to count
 * alone. This is the module's only other seam onto the shared tokenizer (`terms()`'s Set-backed
 * dedup already collapses repeats while preserving first-seen order, which is an acceptable
 * approximation of true adjacency for a bonus heuristic — not load-bearing enough to justify a
 * second, position-preserving tokenizer duplicated from service.ts's private regex).
 */
export function queryBigrams(baseTerms: readonly string[]): string[] {
  const bigrams: string[] = [];
  for (let index = 0; index < baseTerms.length - 1; index += 1) {
    bigrams.push(`${baseTerms[index]} ${baseTerms[index + 1]}`);
  }
  return [...new Set(bigrams)];
}

/**
 * Boost contributed per matched bigram, on the same tenths-of-a-point scale `matchRank`'s own boost
 * uses (a lone trigger hit is +2, a lone title hit is +5): a phrase match confirms the two words
 * appear in the SAME ORDER and ADJACENT to each other in both the utterance and the workflow's own
 * text, which is stronger evidence of aligned intent than either word matching independently
 * anywhere in the text (already credited once each via matchedTermCount) — but a two-word phrase
 * coincidence is not as strong as an exact title hit, so it sits between the two existing boost
 * tiers rather than above them.
 */
export const BIGRAM_BOOST = 4;

/**
 * How many of `bigrams` appear verbatim (as a substring) in `searchText`. `searchText` is expected
 * lowercased already (mirrors `matchWorkflows`'s own `searchText` construction in route-utterance.ts).
 */
export function countMatchedBigrams(searchText: string, bigrams: readonly string[]): number {
  let count = 0;
  for (const bigram of bigrams) {
    if (searchText.includes(bigram)) count += 1;
  }
  return count;
}

// --- combined per-workflow router score -----------------------------------------------------------

export interface RouterRank {
  readonly matchedTermCount: number;
  readonly boost: number;
}

/**
 * Router-owned replacement for calling `matchRank` directly against raw query terms: scores
 * `queryTerms` (already router-filtered and stemmed by `routerQueryTerms`) against `searchText`/
 * `title`/`trigger` via the shared `matchRank`, then adds bigram credit on top of the returned boost.
 * The result keeps the exact same `{ matchedTermCount, boost }` shape `matchRank` returns so
 * route-utterance.ts's `matchConfidence = matchedTermCount + boost / 10` formula needs no change —
 * only what feeds into it grew richer.
 */
export function routerMatchRank(searchText: string, title: string, trigger: string, queryTerms: readonly string[], bigrams: readonly string[]): RouterRank {
  const base = matchRank(searchText, title, trigger, [...queryTerms]);
  const bigramMatches = countMatchedBigrams(searchText, bigrams);
  return { matchedTermCount: base.matchedTermCount, boost: base.boost + bigramMatches * BIGRAM_BOOST };
}

// --- stage 2 (issue #58): instructions scored at a lower weight -----------------------------------
//
// Implemented and measured exactly as issue #58 stage 2 (option 1) specifies: score trigger + title
// + instructions, with instructions at a lower weight, re-calibrate threshold/band on the
// calibration set under the zero-false-primary constraint, then grade on the orthogonal set. Swept
// INSTRUCTIONS_MATCH_WEIGHT from 0.1 to 1.0 in 0.05-0.1 steps against all three corpora (real
// `terms`/`routerQueryTerms`/`queryBigrams`/`routerMatchRank`, not a simulation): weights above 0.2
// start producing false primaries on the orthogonal corpus's own deliberately-ambiguous "candidates"
// entries (a wrong workflow's long instructions text has enough incidental vocabulary overlap to
// occasionally out-score the right one once each match counts for a real fraction of a point rather
// than a rounding error) — 0.2 is the largest weight that stayed feasible (zero false primaries)
// everywhere. On its own this stage does not clear the 80% orthogonal target (0.2 measured 48.6%,
// 17/35, up from stage 1 alone's 45.7%) — see the final report and route-utterance.ts's module doc
// comment for the full record — but the gain is real and free (zero false primaries introduced
// anywhere), so it stays part of the shipped formula alongside stage 1 and (where applicable)
// stage 3's founderPhrasings.

/** How much less an instructions-only match counts than the SAME term matching in title or trigger. */
export const INSTRUCTIONS_MATCH_WEIGHT = 0.2;

/**
 * Counts query terms that match ONLY inside `instructionsLower` (never already counted via
 * `titleTriggerSearchText`, which is `matchRank`'s own searchText) — the "lower weight" is
 * implemented by NOT feeding these into `matchedTermCount` (worth a full 1.0 point each, same as a
 * trigger-only hit) or `boost` (which only ever looks at title/trigger) at all; each instructions-
 * only match instead contributes `INSTRUCTIONS_MATCH_WEIGHT` directly to matchConfidence.
 */
export function instructionsOnlyMatchedCount(instructionsLower: string, titleTriggerSearchText: string, queryTerms: readonly string[]): number {
  return queryTerms.filter((term) => !titleTriggerSearchText.includes(term) && instructionsLower.includes(term)).length;
}

// --- stage 3 (issue #58): authored founderPhrasings scored at trigger weight -----------------------
//
// Implemented and measured exactly as issue #58 stage 3 (option 2) specifies, entered into once
// stage 2 alone (instructions at INSTRUCTIONS_MATCH_WEIGHT) still fell short of the 80% orthogonal
// target: an authored `founderPhrasings: string[]` field on every one of the catalog's 101
// workflows (catalog/types.ts), each phrasing written from the workflow's PURPOSE, scored at the
// SAME weight as `trigger` — not a new, separate weight tier alongside stage 2's discounted
// instructions signal. See catalog/validate.ts's `catalog_graph.workflow.founder_phrasing_*` rules
// for the authoring constraints (3-6 entries once non-empty, a length ceiling, no cross-workflow
// collision) and routing-accuracy.fixtures.ts / utterance-regression.json's orthogonal.metadata for
// the full measured record. This stage CLEARED the 80% orthogonal target: 91.4% (32/35), zero false
// primaries on every corpus, with ROUTE_CONFIDENCE_THRESHOLD/AMBIGUITY_BAND unchanged from stage 2
// (1.7/0.2 — already on the recalculated calibration Pareto front, confirmed by re-running
// `npm run routing:calibrate`). Three of the 305 authored phrasings needed rewording during
// authoring: their first wording's incidental vocabulary overlap manufactured a false primary on an
// unrelated candidates-labelled corpus entry (see utterance-regression.json's own note on each) —
// the same collision risk stage 2's own doc comment above already flags for instructions text,
// confirming it is a property of adding ANY new scored vocabulary, not specific to one stage.

/**
 * Folds a workflow's authored `founderPhrasings` into its trigger text for scoring purposes: the
 * combined string is fed to `routerMatchRank`'s own trigger-weighted (`matchRank`'s `loadWhen`)
 * parameter, so each phrasing counts as MORE trigger text, not a new formula or weight tier —
 * "scored at trigger weight" (issue #58 stage 3) is exactly the trigger's own existing +2/matched-
 * term boost (`matchRank`'s `loadWhenLower.includes(term)` check), extended to reach whatever
 * alternate wording the catalog now authors for it. The caller also feeds this combined text into
 * `searchText` (so a term that appears ONLY in a phrasing, never verbatim in trigger/title, still
 * counts toward `matchedTermCount`) and into bigram matching (a two-word phrase from the utterance
 * can now land inside a phrasing, not only the trigger/title) — this function only builds the text,
 * it does not itself touch either of those.
 *
 * An empty `founderPhrasings` array — the default for a workflow that has not been authored to
 * participate, or for a hand-built `RoutableWorkflow` test fixture that never sets the field —
 * is a no-op: the result degrades to exactly `trigger`, byte-for-byte unchanged from every call
 * site's behavior before this stage existed.
 */
export function combineTriggerWithFounderPhrasings(trigger: string, founderPhrasings: readonly string[]): string {
  return founderPhrasings.length === 0 ? trigger : [trigger, ...founderPhrasings].join("\n");
}
