import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AMBIGUITY_BAND, ROUTE_CONFIDENCE_THRESHOLD, routeUtterance } from "../../../kernel/session/route-utterance.js";
import { assert, type Harness } from "./_harness.js";

/**
 * U9 fixtures: the routing-accuracy release gate (issue #26 AC "Top-1 accuracy measured ... before
 * release"; plan R5, KTD11).
 *
 * CALIBRATION RECORD (kept in sync with the JSON corpora's own `metadata` blocks and with
 * route-utterance.ts's doc comments on ROUTE_CONFIDENCE_THRESHOLD/AMBIGUITY_BAND — all four places
 * must agree, and case (f) below pins the constants side of that agreement):
 *   - Calibration corpus: verification/goldens/routing/utterance-calibration.json, 76 utterances
 *     (68 primary-labelled), calibrated 2026-09-01 via `npm run routing:calibrate`
 *     (tooling/calibrate-utterance-router.ts), which grid-searches threshold x ambiguity-band and
 *     found threshold=1.7 / band=0.2 on the accuracy-maximizing Pareto front: 100.0% primary
 *     accuracy (68/68), zero false-primaries. (Re-calibrated under issue #58 stage 2 from the
 *     original band=0.4 — see AMBIGUITY_BAND's doc comment in route-utterance.ts; issue #58 stage 3
 *     re-ran the same grid search and confirmed 1.7/0.2 is still on the front, unchanged.)
 *   - Regression corpus (this suite's release gate): verification/goldens/routing/
 *     utterance-regression.json, 24 utterances (17 primary-labelled), frozen 2026-09-01, DISJOINT
 *     from the calibration corpus by construction (case 2 below asserts this at every run rather
 *     than trusting the freeze) and never used to choose the threshold/band — only to grade it.
 *     Measured against real routeUtterance/matchWorkflows at 1.7/0.2: 100.0% primary top-1
 *     (17/17), zero false-primaries across the 7 candidates/insufficient_signal/product_mismatch
 *     entries. The gate in case 3 is >= 80% (R5's stated bar; a judgment call to revisit once real
 *     usage data exists — see the plan's U9 approach note), well below the measured 100%.
 *
 * The regression corpus is the actual PR-blocking gate (cases 3, 4). The calibration corpus's own
 * accuracy is asserted here too (case 5) only as a drift guard — a catalog trigger-text edit that
 * quietly regresses calibration-set accuracy without anyone re-running `routing:calibrate` should
 * fail loudly here, not silently ship.
 *
 * ORTHOGONAL CORPUS (cases 8-12; follow-up to a confirmed test-quality review finding: "Routing-
 * accuracy corpora are paraphrases of catalog trigger text, so the U9 release gate's 100% accuracy
 * measures vocabulary overlap, not real founder-language routing quality", tracked as issue #58).
 * utterance-regression.json's `orthogonal` array holds 39 utterances (35 primary-labelled across 30
 * distinct workflows, 4 deliberately-ambiguous "candidates") authored PURPOSE-FIRST from each target
 * workflow's `instructions` field, never its `trigger`/`title` string — see that array's own metadata
 * for the full authorship record. It is held out from calibration (never used to choose
 * ROUTE_CONFIDENCE_THRESHOLD/AMBIGUITY_BAND; tooling/calibrate-utterance-router.ts's `--check`
 * reports its accuracy under the live constants only as an informational grade) and disjoint from
 * both the calibration and regression-`entries` corpora by construction (case 9). THE ORTHOGONAL
 * ENTRIES THEMSELVES ARE NEVER EDITED to fit the router — only the metadata below, recording what was
 * measured against them, changes.
 *
 * MEASUREMENT HISTORY (issue #58's full record lives in utterance-regression.json's
 * `orthogonal.metadata.verdictNote`; this is the summary a reader of THIS file needs):
 *   - Baseline (trigger+title term-overlap only): 3/35 = 8.6% primary top-1.
 *   - +8 hand-enriched trigger keywords ("Founder phrasing: ..." clauses, budget-limited): 15/35 =
 *     42.9% — confirmed as a genuine SYSTEMIC SHORTFALL of the router's architecture (flat
 *     term-overlap, a ~29-word stopword list, no synonymy/phrase structure), not this corpus's
 *     difficulty, because 30 distinct target workflows against an 8-workflow enrichment budget
 *     cannot mathematically reach 80% regardless of wording quality.
 *   - Issue #58 stage 1 (route-scoring.ts: a founder-phrasing-specific stopword list, light suffix
 *     stemming, adjacent-word bigram credit — router-owned, no catalog change) + stage 2 (workflow
 *     `instructions` scored at a lower weight alongside trigger+title, re-calibrated): 17/35 = 48.6%
 *     — real, structural gains, still short of 80%.
 *   - Issue #58 stage 3 (an authored `founderPhrasings: string[]` on all 101 catalog workflows,
 *     scored at the SAME weight as `trigger`): 32/35 = 91.4% — CLEARS the 80% aspirational bar, with
 *     ROUTE_CONFIDENCE_THRESHOLD/AMBIGUITY_BAND unchanged from stage 2 (already on the recalculated
 *     Pareto front). Zero false-primaries on every corpus's non-primary subset (calibration,
 *     regression, and this corpus's own case 11) — three of the 305 authored phrasings needed
 *     rewording during authoring to remove incidental collisions they introduced (see
 *     utterance-regression.json's orthogonal.metadata.verdictNote for exactly which, and why).
 *
 * Case 12 (below) is issue #58's authoring-integrity proof: no founderPhrasing in the live catalog
 * equals or contains an orthogonal-corpus utterance verbatim — the field must generalize FROM
 * purpose, never memorize the eval it is graded against.
 */

interface ExpectedOutcome {
  readonly kind: "primary" | "candidates" | "insufficient_signal" | "product_mismatch";
  readonly workflowId?: string;
}

interface CorpusEntry {
  readonly id: unknown;
  readonly utterance: unknown;
  readonly expected: unknown;
  readonly note?: unknown;
}

interface Corpus {
  readonly metadata: Record<string, unknown>;
  readonly entries: readonly CorpusEntry[];
  /** Present only on utterance-regression.json — see the ORTHOGONAL CORPUS doc comment above. */
  readonly orthogonal?: { readonly metadata: Record<string, unknown>; readonly entries: readonly CorpusEntry[] };
}

const goldensDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../goldens/routing");
const calibrationPath = path.join(goldensDir, "utterance-calibration.json");
const regressionPath = path.join(goldensDir, "utterance-regression.json");

function loadCorpus(filePath: string): Corpus {
  return JSON.parse(readFileSync(filePath, "utf8")) as Corpus;
}

const KNOWN_KINDS = new Set(["primary", "candidates", "insufficient_signal", "product_mismatch"]);

/**
 * Validates and narrows one raw corpus entry, throwing with the entry's id/index on any defect —
 * this is the "corpus refuses unlabelled entries" contract (case 1): a corpus file with a missing
 * or unknown `expected.kind`, a non-string utterance, or a primary entry missing its workflowId
 * fails the suite immediately rather than silently comparing against `undefined`.
 */
function requireLabelled(entry: CorpusEntry, index: number, corpusName: string): { id: string; utterance: string; expected: ExpectedOutcome } {
  const where = `${corpusName}[${index}]`;
  assert(typeof entry.id === "string" && entry.id.length > 0, `${where} must have a non-empty string id`);
  assert(typeof entry.utterance === "string", `${where} (${entry.id}) must have a string utterance`);
  assert(entry.expected !== null && typeof entry.expected === "object", `${where} (${entry.id}) must have an expected object`);
  const expected = entry.expected as { kind?: unknown; workflowId?: unknown };
  assert(
    typeof expected.kind === "string" && KNOWN_KINDS.has(expected.kind),
    `${where} (${entry.id}) has an unknown or missing expected.kind: ${String(expected.kind)}`,
  );
  if (expected.kind === "primary") {
    assert(typeof expected.workflowId === "string" && expected.workflowId.length > 0, `${where} (${entry.id}) is expected:"primary" but has no workflowId`);
  }
  return { id: entry.id as string, utterance: entry.utterance as string, expected: expected as ExpectedOutcome };
}

export function register(harness: Harness): void {
  const calibrationRaw = loadCorpus(calibrationPath);
  const regressionRaw = loadCorpus(regressionPath);

  // --- 1. every corpus entry is labelled; the corpus refuses unlabelled entries -------------------

  harness.check("routing-accuracy: every calibration corpus entry carries a known, well-formed expected.kind", () => {
    assert(calibrationRaw.entries.length >= 60, `expected >= 60 calibration entries, got ${calibrationRaw.entries.length}`);
    calibrationRaw.entries.forEach((entry, index) => requireLabelled(entry, index, "calibration"));
  });

  harness.check("routing-accuracy: every regression corpus entry carries a known, well-formed expected.kind", () => {
    assert(regressionRaw.entries.length >= 20, `expected >= 20 regression entries, got ${regressionRaw.entries.length}`);
    regressionRaw.entries.forEach((entry, index) => requireLabelled(entry, index, "regression"));
  });

  const calibration = calibrationRaw.entries.map((entry, index) => requireLabelled(entry, index, "calibration"));
  const regression = regressionRaw.entries.map((entry, index) => requireLabelled(entry, index, "regression"));

  // --- 2. calibration and regression utterances are disjoint --------------------------------------

  harness.check("routing-accuracy: the calibration and regression corpora share no utterance string", () => {
    const calibrationUtterances = new Set(calibration.map((entry) => entry.utterance));
    const shared = regression.filter((entry) => calibrationUtterances.has(entry.utterance)).map((entry) => entry.id);
    assert(shared.length === 0, `regression entries must never repeat a calibration utterance verbatim; shared ids: ${shared.join(", ")}`);
  });

  // The clothing-brand mismatch folder (KTD6; the operator session's clothing-brand-folder miss).
  // Built once and reused by every regression entry labelled product_mismatch (case 3/4/7): the
  // mismatch decision short-circuits on cwd before scoring runs at all, so which of those entries'
  // utterance text is paired with the folder makes no difference to the outcome (see
  // route-utterance.ts's routeUtterance doc comment on decision order).
  const clothingDir = harness.makeTempDir("routing-accuracy-clothing-mismatch");
  writeFileSync(
    path.join(clothingDir, "package.json"),
    JSON.stringify({
      name: "drift-apparel-site",
      description: "Marketing site for an independent apparel and streetwear label",
      keywords: ["fashion", "boutique"],
    }),
  );
  writeFileSync(
    path.join(clothingDir, "README.md"),
    `# Drift Apparel\n\nA denim and streetwear clothing collection drop, refreshed each season.\nSee the sizing chart before you order.\n`,
  );
  const clothingHome = harness.makeTempDir("routing-accuracy-clothing-mismatch-home");

  function withClothingHome<T>(fn: () => T): T {
    const previous = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = clothingHome;
    try {
      return fn();
    } finally {
      if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previous;
    }
  }

  function route(entry: { utterance: string; expected: ExpectedOutcome }) {
    if (entry.expected.kind === "product_mismatch") {
      return withClothingHome(() => routeUtterance({ utterance: entry.utterance, cwd: clothingDir }));
    }
    return routeUtterance({ utterance: entry.utterance });
  }

  // --- 3. regression primary-subset top-1 accuracy >= 80% (the actual release gate) ---------------

  const regressionPrimary = regression.filter((entry) => entry.expected.kind === "primary");
  const REGRESSION_TOP1_MINIMUM = 0.8;

  harness.check(`routing-accuracy: regression primary-subset top-1 accuracy is >= ${REGRESSION_TOP1_MINIMUM * 100}% (issue #26 release gate)`, () => {
    assert(regressionPrimary.length > 0, "regression corpus must contain at least one primary-labelled entry to measure top-1 accuracy against");
    const misses: string[] = [];
    let correct = 0;
    for (const entry of regressionPrimary) {
      const outcome = route(entry);
      if (outcome.kind === "primary" && outcome.workflowId === entry.expected.workflowId) {
        correct += 1;
      } else {
        misses.push(
          `${entry.id} "${entry.utterance}": expected ${entry.expected.workflowId}, got ${outcome.kind}${outcome.kind === "primary" ? `:${outcome.workflowId}` : ""}`,
        );
      }
    }
    const accuracy = correct / regressionPrimary.length;
    assert(
      accuracy >= REGRESSION_TOP1_MINIMUM,
      `regression primary top-1 accuracy is ${(accuracy * 100).toFixed(1)}% (${correct}/${regressionPrimary.length}), below the ${REGRESSION_TOP1_MINIMUM * 100}% gate. Misses:\n${misses.join("\n")}`,
    );
  });

  // --- 4. zero false-primaries across regression candidates/insufficient_signal/mismatch entries --

  harness.check("routing-accuracy: zero false-primaries across regression candidates/insufficient_signal/product_mismatch entries", () => {
    const nonPrimary = regression.filter((entry) => entry.expected.kind !== "primary");
    assert(nonPrimary.length > 0, "regression corpus must contain at least one non-primary entry to measure false-primaries against");
    const falsePrimaries: string[] = [];
    for (const entry of nonPrimary) {
      const outcome = route(entry);
      if (outcome.kind === "primary")
        falsePrimaries.push(`${entry.id} "${entry.utterance}" (expected ${entry.expected.kind}): got primary:${outcome.workflowId}`);
      if (entry.expected.kind === "product_mismatch") {
        assert(outcome.kind === "product_mismatch", `${entry.id}: expected product_mismatch, got ${outcome.kind}`);
      }
    }
    assert(falsePrimaries.length === 0, `expected zero false-primaries, got ${falsePrimaries.length}:\n${falsePrimaries.join("\n")}`);
  });

  // --- 5. calibration-set primary accuracy stays within 5 points of the recorded figure (drift) ---

  const RECORDED_CALIBRATION_ACCURACY = 1.0;
  const CALIBRATION_DRIFT_ALLOWANCE = 0.05;

  harness.check("routing-accuracy: calibration-set primary accuracy has not drifted more than 5 points below the recorded calibration figure", () => {
    const calibrationPrimary = calibration.filter((entry) => entry.expected.kind === "primary");
    assert(calibrationPrimary.length > 0, "calibration corpus must contain at least one primary-labelled entry");
    let correct = 0;
    for (const entry of calibrationPrimary) {
      const outcome = route(entry);
      if (outcome.kind === "primary" && outcome.workflowId === entry.expected.workflowId) correct += 1;
    }
    const accuracy = correct / calibrationPrimary.length;
    const floor = RECORDED_CALIBRATION_ACCURACY - CALIBRATION_DRIFT_ALLOWANCE;
    assert(
      accuracy >= floor,
      `calibration-set primary accuracy is ${(accuracy * 100).toFixed(1)}% (${correct}/${calibrationPrimary.length}), more than 5 points below the recorded ${(RECORDED_CALIBRATION_ACCURACY * 100).toFixed(1)}% — a catalog trigger edit likely drifted routing quality; re-run "npm run routing:calibrate" before trusting this number further.`,
    );
  });

  // --- 6. the constants in route-utterance.ts equal the recorded calibrated values (a deliberate pin) --

  harness.check("routing-accuracy: ROUTE_CONFIDENCE_THRESHOLD/AMBIGUITY_BAND equal the recorded calibrated values", () => {
    const recordedThreshold = calibrationRaw.metadata.chosenThreshold;
    const recordedBand = calibrationRaw.metadata.chosenBand;
    assert(
      ROUTE_CONFIDENCE_THRESHOLD === recordedThreshold,
      `route-utterance.ts's ROUTE_CONFIDENCE_THRESHOLD (${ROUTE_CONFIDENCE_THRESHOLD}) no longer matches the calibration corpus's recorded chosenThreshold (${String(recordedThreshold)}). Changing either one on purpose means re-running "npm run routing:calibrate" and updating both.`,
    );
    assert(
      AMBIGUITY_BAND === recordedBand,
      `route-utterance.ts's AMBIGUITY_BAND (${AMBIGUITY_BAND}) no longer matches the calibration corpus's recorded chosenBand (${String(recordedBand)}). Changing either one on purpose means re-running "npm run routing:calibrate" and updating both.`,
    );
  });

  // --- 7. the clothing folder case goes through routeUtterance with cwd and yields product_mismatch --

  harness.check("routing-accuracy: the clothing-brand folder case goes through routeUtterance with cwd and yields product_mismatch", () => {
    const mismatchEntries = regression.filter((entry) => entry.expected.kind === "product_mismatch");
    assert(
      mismatchEntries.length > 0,
      "regression corpus must contain at least one product_mismatch entry (the operator session's clothing-brand-folder miss)",
    );
    for (const entry of mismatchEntries) {
      const outcome = withClothingHome(() => routeUtterance({ utterance: entry.utterance, cwd: clothingDir }));
      assert(outcome.kind === "product_mismatch", `${entry.id}: expected product_mismatch via routeUtterance({ utterance, cwd }), got ${outcome.kind}`);
      if (outcome.kind !== "product_mismatch") continue;
      assert(outcome.productKind === "mismatch", `${entry.id}: expected productKind mismatch, got ${outcome.productKind}`);
      assert(outcome.nextAgentAction.length > 0, `${entry.id}: product_mismatch must never dead-end (R4) — nextAgentAction must be present`);
    }
  });

  // --- 8-11. the orthogonal (purpose-first, held-out) corpus — see the ORTHOGONAL CORPUS doc comment ---

  const orthogonalRaw = regressionRaw.orthogonal;
  assert(orthogonalRaw !== undefined, "utterance-regression.json must carry an `orthogonal` corpus (see routing-accuracy review finding)");
  const orthogonalEntries = orthogonalRaw!.entries;

  harness.check("routing-accuracy: every orthogonal corpus entry carries a known, well-formed expected.kind", () => {
    assert(orthogonalEntries.length >= 30, `expected >= 30 orthogonal entries, got ${orthogonalEntries.length}`);
    orthogonalEntries.forEach((entry, index) => requireLabelled(entry, index, "orthogonal"));
  });

  const orthogonal = orthogonalEntries.map((entry, index) => requireLabelled(entry, index, "orthogonal"));

  harness.check("routing-accuracy: the orthogonal corpus shares no utterance string with the calibration or regression corpora", () => {
    const calibrationUtterances = new Set(calibration.map((entry) => entry.utterance));
    const regressionUtterances = new Set(regression.map((entry) => entry.utterance));
    const sharedWithCalibration = orthogonal.filter((entry) => calibrationUtterances.has(entry.utterance)).map((entry) => entry.id);
    const sharedWithRegression = orthogonal.filter((entry) => regressionUtterances.has(entry.utterance)).map((entry) => entry.id);
    assert(
      sharedWithCalibration.length === 0,
      `orthogonal entries must never repeat a calibration utterance verbatim; shared ids: ${sharedWithCalibration.join(", ")}`,
    );
    assert(
      sharedWithRegression.length === 0,
      `orthogonal entries must never repeat a regression utterance verbatim; shared ids: ${sharedWithRegression.join(", ")}`,
    );
  });

  const orthogonalPrimary = orthogonal.filter((entry) => entry.expected.kind === "primary");
  const orthogonalNonPrimary = orthogonal.filter((entry) => entry.expected.kind !== "primary");

  // Issue #58 stage 3 cleared the aspirational target (32/35 = 91.4%, measured 2026-09-01 — see the
  // ORTHOGONAL CORPUS doc comment and utterance-regression.json's orthogonal.metadata for the full
  // stage 1/2/3 record). This is now a REGRESSION GUARD against that measured figure, not a floor
  // still short of the target: 0.85 tolerates one additional miss (31/35 = 88.6%) without failing on
  // ordinary corpus/catalog noise, while still catching a real drop back toward the pre-#58 numbers.
  const ORTHOGONAL_TOP1_ASPIRATIONAL_TARGET = 0.8;
  const ORTHOGONAL_TOP1_CURRENT_FLOOR = 0.85; // small buffer below the measured 91.4% (32/35)

  harness.check(
    `routing-accuracy: orthogonal primary-subset top-1 accuracy holds at or above its measured floor (reported separately from the regression gate; ${ORTHOGONAL_TOP1_ASPIRATIONAL_TARGET * 100}% aspirational target met since issue #58 stage 3 — see doc comment)`,
    () => {
      assert(orthogonalPrimary.length > 0, "orthogonal corpus must contain at least one primary-labelled entry to measure top-1 accuracy against");
      const misses: string[] = [];
      let correct = 0;
      for (const entry of orthogonalPrimary) {
        const outcome = route(entry);
        if (outcome.kind === "primary" && outcome.workflowId === entry.expected.workflowId) {
          correct += 1;
        } else {
          misses.push(
            `${entry.id} "${entry.utterance}": expected ${entry.expected.workflowId}, got ${outcome.kind}${outcome.kind === "primary" ? `:${outcome.workflowId}` : ""}`,
          );
        }
      }
      const accuracy = correct / orthogonalPrimary.length;
      assert(
        accuracy >= ORTHOGONAL_TOP1_CURRENT_FLOOR,
        `orthogonal primary top-1 accuracy is ${(accuracy * 100).toFixed(1)}% (${correct}/${orthogonalPrimary.length}), below its measured floor of ${ORTHOGONAL_TOP1_CURRENT_FLOOR * 100}% — issue #58 stage 3 measured ${(0.9143 * 100).toFixed(1)}% (32/35) and cleared the ${ORTHOGONAL_TOP1_ASPIRATIONAL_TARGET * 100}% aspirational target, so this is a real regression, not more of the pre-#58 known gap; investigate. Misses:\n${misses.join("\n")}`,
      );
    },
  );

  harness.check("routing-accuracy: zero false-primaries across the orthogonal corpus's deliberately-ambiguous candidates entries", () => {
    assert(orthogonalNonPrimary.length > 0, "orthogonal corpus must contain at least one non-primary (candidates) entry to measure false-primaries against");
    const falsePrimaries: string[] = [];
    for (const entry of orthogonalNonPrimary) {
      const outcome = route(entry);
      if (outcome.kind === "primary")
        falsePrimaries.push(`${entry.id} "${entry.utterance}" (expected ${entry.expected.kind}): got primary:${outcome.workflowId}`);
    }
    assert(
      falsePrimaries.length === 0,
      `expected zero false-primaries on the orthogonal corpus's ambiguous entries, got ${falsePrimaries.length}:\n${falsePrimaries.join("\n")}`,
    );
  });

  // --- 12. issue #58 stage 3 authoring integrity: no founderPhrasing memorizes an orthogonal probe --

  harness.check("routing-accuracy: no catalog founderPhrasing equals or contains (in either direction) an orthogonal-corpus utterance", () => {
    // Loads the real generated bundle directly (not through route-utterance.ts's RoutableWorkflow
    // shape) so this proof reads founderPhrasings exactly as authored, independent of how the
    // router happens to consume them — a change to the router's scoring pipeline must never be
    // able to mask an authoring-integrity regression here.
    const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const bundle = JSON.parse(readFileSync(path.join(skillRoot, "catalog/generated/hosted-knowledge.json"), "utf8")) as {
      catalog: { workflows: Array<{ id: string; founderPhrasings: readonly string[] }> };
    };
    const orthogonalUtterances = orthogonal.map((entry) => ({ id: entry.id, text: entry.utterance.trim().toLowerCase() }));
    const leaks: string[] = [];
    for (const workflow of bundle.catalog.workflows) {
      for (const phrasing of workflow.founderPhrasings) {
        const normalizedPhrasing = phrasing.trim().toLowerCase();
        for (const utterance of orthogonalUtterances) {
          if (normalizedPhrasing === utterance.text || normalizedPhrasing.includes(utterance.text) || utterance.text.includes(normalizedPhrasing)) {
            leaks.push(`${workflow.id}'s founderPhrasing "${phrasing}" overlaps orthogonal entry ${utterance.id} "${utterance.text}"`);
          }
        }
      }
    }
    assert(
      leaks.length === 0,
      `founderPhrasings must be authored from a workflow's purpose, never from the orthogonal eval corpus (issue #58 stage 3 authoring instruction) — got ${leaks.length} overlap(s):\n${leaks.join("\n")}`,
    );
  });
}
