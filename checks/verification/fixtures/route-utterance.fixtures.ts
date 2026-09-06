import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AMBIGUITY_BAND,
  createStatKeyedCache,
  matchWorkflows,
  ROUTE_CONFIDENCE_THRESHOLD,
  routeUtterance,
  type RoutableWorkflow,
} from "../../../kernel/session/route-utterance.js";
import { assert, type Harness } from "./_harness.js";

/**
 * U2 fixtures: the utterance router (R3/R4, KTD5, KTD6).
 *
 * NAMING NOTE: `checks/verification/fixtures/routing.fixtures.ts` already exists at baseline (pre-dates
 * this wave) and drives the unrelated `kernel/routing/*` decision engine (resolveRoute/rankEligible
 * over provisioned workspace state). That file's suite is already registered under the name
 * "routing" by the auto-discovery runner (`checks/verification/fixtures/run.ts`, which maps
 * `<name>.fixtures.ts` -> suite name `<name>`), so writing this unit's fixtures into
 * `routing.fixtures.ts` would silently delete that suite's 12 unrelated cases rather than add to
 * them. This file is named after the module it tests instead (`route-utterance.ts` ->
 * `route-utterance.fixtures.ts`), auto-discovered under the suite name "route-utterance". See the
 * final report for this deviation from the packet's stated file name.
 *
 * Scenarios 1, 2, 6, 7, 8 exercise `routeUtterance` end-to-end against the real generated catalog
 * (`catalog/generated/hosted-knowledge.json`) — the same artifact production code loads — with
 * assertions that stay true under minor catalog wording drift (which workflow group is chosen,
 * whether a tie/threshold was crossed, non-empty invariants).
 *
 * Scenarios 3, 4, 9, 10, and 11 need EXACT control over matchConfidence to prove the threshold and
 * ambiguity-band boundaries precisely (">=" at the threshold; a tie forces candidates even above
 * threshold; a non-tied score below threshold still falls through). Pinning those to real catalog
 * text would couple a unit-level boundary proof to generated-catalog wording that this unit does
 * not own and cannot pin — the exact failure mode this repo's own maintainer memory warns about (a
 * catalog re-render silently drifting a fixture that depends on generated content). So those
 * scenarios use `matchWorkflows`, the pure scoring/decision function `routeUtterance` is built on,
 * against small hand-authored `RoutableWorkflow` records — mirroring this repo's existing precedent
 * for boundary-precise routing tests (routing.fixtures.ts's own local `fixtureCatalog()`, and the
 * golden corpus under `checks/verification/goldens/routing/`, both hand-authored rather than sourced from
 * the live generated catalog).
 *
 * Scenario 4 proves an exact tie (score difference 0); scenarios 9 and 10 go further and straddle
 * the AMBIGUITY_BAND boundary itself (a gap intended to sit exactly at the band, and one just past
 * it), and scenario 11 proves the previously-uncovered "non-tied top score below
 * ROUTE_CONFIDENCE_THRESHOLD" path — see each case's own comment for why the boundary gap cannot be
 * made bit-exact against this formula, and why that does not weaken the case for scenario 11 (a
 * genuinely uncovered branch of R3's decision rule before this fixture existed).
 *
 * Scenario 12 proves routeUtterance degrades to routing on the utterance alone — never throwing —
 * against a corrupt `~/.b2c-app-builder/workspaces.json`, the same damage
 * kernel/session/stepper.ts's withOnboardingStepper already guards against for the identical
 * inspectWorkspace(cwd) call.
 *
 * Scenario 13 proves `createStatKeyedCache` (the pure memoization helper `loadCatalogData` is built
 * on) reloads once a file's (mtimeMs, size) stamp changes, using an isolated temp file rather than
 * the shared repository catalog bundle — mutating that shared, generated artifact mid-suite would
 * risk other fixtures and parallel shards reading it concurrently.
 *
 * Scenario 14 (issue #58 stage 3) proves a workflow's `founderPhrasings` are scored at trigger
 * weight, not a no-op field: fabricated, non-dictionary tokens that appear ONLY in one workflow's
 * founderPhrasings (never its trigger/title, and never any real catalog vocabulary) still resolve a
 * confident primary for that workflow, at the exact matchConfidence the trigger-weight formula
 * predicts — a proof this would fail loudly, not silently degrade, if a future change stopped
 * folding founderPhrasings into scoring.
 */

function makeWorkflow(overrides: Partial<RoutableWorkflow> & Pick<RoutableWorkflow, "workflowId">): RoutableWorkflow {
  return { title: "Fixture workflow", trigger: "fixture trigger text", referenceIds: [], ...overrides };
}

export function register(harness: Harness): void {
  // --- 1. onboarding-shaped utterance -> single primary, short rationale -------------------------

  harness.check("route-utterance: an onboarding-shaped utterance resolves to a single onboarding primary with a <=2 sentence rationale", () => {
    // issue #58: "plan the app's onboarding flow" was the original utterance here. Under the new
    // router scoring (route-scoring.ts filters "app" as founder-phrasing noise), its previous
    // winner (onb-21-compound-engineering-plan) only cleared the old score by coincidentally
    // matching "app" inside its own trigger text ("...the B2C App Builder-equivalent fallback") —
    // an unrelated substring hit, not real signal — and without it ties with two other onboarding
    // sub-workflows. Replaced with an utterance whose terms point unambiguously at one workflow
    // under the new formula, keeping this case's actual purpose (a confident onboarding primary)
    // intact.
    const outcome = routeUtterance({ utterance: "trace how our onboarding actually works today, screen by screen" });
    assert(outcome.kind === "primary", `expected primary, got ${outcome.kind}`);
    if (outcome.kind !== "primary") return;
    assert(outcome.workflowId.includes("onboarding"), `expected an onboarding workflow, got ${outcome.workflowId}`);
    const sentences = outcome.rationale
      .split(/(?<=[.!?])\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    assert(sentences.length <= 2, `expected rationale of at most 2 sentences, got ${sentences.length}: "${outcome.rationale}"`);
    assert(outcome.rationale.length > 0, "rationale must not be empty");
    assert(Array.isArray(outcome.doNotLoad), "primary outcome must carry a doNotLoad hint array");
    assert(outcome.nextAgentAction.length > 0, "primary outcome must carry a founder-facing next action");
  });

  // --- 2. generic low-signal utterance -> three candidates, no primary ---------------------------

  harness.check("route-utterance: a generic utterance with no clear winner returns three candidates and no primary", () => {
    const outcome = routeUtterance({ utterance: "help me build something" });
    assert(outcome.kind === "candidates", `expected candidates, got ${outcome.kind}`);
    if (outcome.kind !== "candidates") return;
    assert(outcome.candidates.length === 3, `expected exactly 3 candidates, got ${outcome.candidates.length}`);
    for (const candidate of outcome.candidates) {
      assert(candidate.workflowId.length > 0, "every candidate must carry a workflowId");
      assert(candidate.why.length > 0, "every candidate must carry a one-line why");
      assert(typeof candidate.matchConfidence === "number", "every candidate must carry a numeric matchConfidence");
    }
    assert(outcome.nextAgentAction.length > 0, "candidates outcome must carry a founder-facing next action");
    assert(!("workflowId" in outcome), "candidates outcome must never also carry a primary workflowId (R3: never both)");
  });

  // --- 3. score exactly at the threshold routes to primary (>= boundary) --------------------------

  harness.check("route-utterance: a matchConfidence exactly at ROUTE_CONFIDENCE_THRESHOLD resolves to primary (inclusive boundary)", () => {
    // One shared term ("alpha"), present in both this workflow's title and its trigger, scores
    // matchedTermCount=1, boost=5(title)+2(trigger)=7 -> matchConfidence = 1 + 7/10 = exactly 1.7.
    // ROUTE_CONFIDENCE_THRESHOLD is calibrated to that same value (see route-utterance.ts's doc
    // comment) which also happens to be constructible here without floating-point slop.
    const atThreshold = makeWorkflow({ workflowId: "workflow.fixture.alpha-at-threshold", title: "Alpha widget", trigger: "alpha onboarding trigger" });
    const farBelow = makeWorkflow({ workflowId: "workflow.fixture.unrelated-far-below", title: "Zzyzx unrelated", trigger: "totally unrelated content" });
    const match = matchWorkflows("alpha", [atThreshold, farBelow]);
    assert(match.kind === "primary", `expected primary at the inclusive threshold boundary, got ${match.kind}`);
    if (match.kind !== "primary") return;
    assert(
      match.match.matchConfidence === ROUTE_CONFIDENCE_THRESHOLD,
      `expected matchConfidence === ${ROUTE_CONFIDENCE_THRESHOLD}, got ${match.match.matchConfidence}`,
    );
    assert(match.match.workflowId === "workflow.fixture.alpha-at-threshold", `expected the at-threshold workflow selected, got ${match.match.workflowId}`);
  });

  // --- 4. two workflows tied in the ambiguity band -> candidates, never an arbitrary pick ---------

  harness.check("route-utterance: two workflows tied inside the ambiguity band return candidates, not an arbitrary single pick", () => {
    assert(AMBIGUITY_BAND >= 0, "ambiguity band must be non-negative");
    const tiedA = makeWorkflow({ workflowId: "workflow.fixture.tied-a", title: "Beta widget", trigger: "beta onboarding trigger" });
    const tiedB = makeWorkflow({ workflowId: "workflow.fixture.tied-b", title: "Beta gadget", trigger: "beta onboarding trigger" });
    const match = matchWorkflows("beta", [tiedA, tiedB]);
    assert(match.kind === "candidates", `expected candidates for an exact tie, got ${match.kind}`);
    if (match.kind !== "candidates") return;
    const ids = match.candidates.map((entry) => entry.workflowId);
    assert(
      ids.includes("workflow.fixture.tied-a") && ids.includes("workflow.fixture.tied-b"),
      `expected both tied workflows in candidates, got ${ids.join(",")}`,
    );
  });

  // --- 5. empty utterance -> insufficient_signal ---------------------------------------------------

  harness.check("route-utterance: an empty utterance returns insufficient_signal, never a primary or a confident candidate list", () => {
    const outcome = routeUtterance({ utterance: "" });
    assert(outcome.kind === "insufficient_signal", `expected insufficient_signal, got ${outcome.kind}`);
    assert(outcome.nextAgentAction.length > 0, "insufficient_signal outcome must carry a founder-facing next action");

    const whitespaceOnly = routeUtterance({ utterance: "   " });
    assert(whitespaceOnly.kind === "insufficient_signal", `expected insufficient_signal for whitespace-only input, got ${whitespaceOnly.kind}`);
  });

  // --- 6. non-English utterance -> low-signal path, never a confident primary ---------------------

  harness.check("route-utterance: a non-English utterance never produces a confident primary", () => {
    const outcome = routeUtterance({ utterance: "bonjour je veux construire une application" });
    assert(outcome.kind === "candidates" || outcome.kind === "insufficient_signal", `expected candidates or insufficient_signal, got ${outcome.kind}`);
  });

  // --- 7. clothing-brand folder + valid utterance -> productKind mismatch, no primary --------------

  harness.check("route-utterance: a clothing-brand workspace mismatch short-circuits routing with no primary and a next action", () => {
    const dir = harness.makeTempDir("route-utterance-clothing-mismatch");
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "drift-apparel-site",
        description: "Marketing site for an independent apparel and streetwear label",
        keywords: ["fashion", "boutique"],
      }),
    );
    writeFileSync(
      path.join(dir, "README.md"),
      `# Drift Apparel\n\nA denim and streetwear clothing collection drop, refreshed each season.\nSee the sizing chart before you order.\n`,
    );
    const home = harness.makeTempDir("route-utterance-clothing-mismatch-home");
    const previous = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      const outcome = routeUtterance({ utterance: "plan the app's onboarding flow", cwd: dir });
      assert(outcome.kind === "product_mismatch", `expected product_mismatch, got ${outcome.kind}`);
      if (outcome.kind !== "product_mismatch") return;
      assert(outcome.productKind === "mismatch", `expected productKind mismatch, got ${outcome.productKind}`);
      assert(outcome.nextAgentAction.length > 0, "product_mismatch outcome must never dead-end (R4): nextAgentAction must be present");
      assert(!("workflowId" in outcome), "product_mismatch outcome must never carry a primary workflowId");
    } finally {
      if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previous;
    }
  });

  // --- 8. doNotLoad never intersects the primary's own referenceIds (property-style) --------------

  harness.check("route-utterance: doNotLoad never intersects the selected primary's own referenceIds, across several utterances", () => {
    const utterances = [
      "plan the app's onboarding flow",
      "design the onboarding screens and paywall contract",
      "write a cold email lifecycle campaign",
      "research the competitor landscape for this app idea",
    ];
    let primariesObserved = 0;
    for (const utterance of utterances) {
      const outcome = routeUtterance({ utterance });
      if (outcome.kind !== "primary") continue;
      primariesObserved += 1;
      // The outcome type does not itself expose referenceIds (R3's shape is workflowId/rationale/
      // doNotLoad/nextAgentAction only), so this loads the same real catalog routeUtterance reads
      // to fetch the selected workflow's referenceIds and check the invariant against doNotLoad.
      const bundle = JSON.parse(readFileSync(catalogFixtureBundlePath, "utf8")) as { catalog: { workflows: Array<{ id: string; referenceIds: string[] }> } };
      const selected = bundle.catalog.workflows.find((workflow) => workflow.id === outcome.workflowId);
      assert(selected !== undefined, `selected workflow ${outcome.workflowId} must exist in the catalog`);
      const referenceIds = new Set(selected!.referenceIds);
      const overlap = outcome.doNotLoad.filter((id) => referenceIds.has(id));
      assert(overlap.length === 0, `doNotLoad must never intersect ${outcome.workflowId}'s referenceIds, got overlap: ${overlap.join(",")}`);
    }
    assert(primariesObserved >= 2, `expected at least 2 of the sample utterances to resolve to a primary, got ${primariesObserved}`);
  });

  // --- 9. ambiguity-band boundary: a near-exact tie still resolves to candidates ------------------

  harness.check("route-utterance: a score gap at the ambiguity-band boundary resolves to candidates, not an arbitrary primary", () => {
    // issue #58: AMBIGUITY_BAND moved 0.4 -> 0.2 (route-utterance.ts's own doc comment on why) once
    // stage 2's instructions scoring was calibrated in, so this case's gap is re-derived for the new
    // band rather than the old one — the underlying property under test (a gap intended to sit right
    // at the boundary is treated as tied) is unchanged.
    //
    // "zulu yankee" against a workflow whose title AND trigger both contain both terms:
    // matchedTermCount=2, boost=7(zulu, both)+7(yankee, both)=14 -> matchConfidence = 2 + 14/10 = 3.4.
    const top = makeWorkflow({ workflowId: "workflow.fixture.band-top", title: "Zulu Yankee widget", trigger: "zulu yankee trigger" });
    // Same utterance against a workflow whose TITLE contains both terms but only ONE of them (zulu)
    // also appears in the trigger: matchedTermCount=2, boost=7(zulu, both)+5(yankee, title only)=12
    // -> matchConfidence = 2 + 12/10 = 3.2. Nominal gap: 3.4 - 3.2 = AMBIGUITY_BAND (0.2) exactly on
    // paper. In IEEE-754 the actual subtraction lands at 0.19999999999999973 (verified: no
    // combination of matchedTermCount+boost/10 this formula can produce is bit-exact 0.2 — boost is
    // always an integer sum of {2,5,7} per matched term, and dividing by 10 never rounds back to a
    // value whose difference from another such value equals the literal double 0.2), which is still
    // <= AMBIGUITY_BAND, so this cannot by itself distinguish a `<=` comparator from a `<` one.
    // Paired with case 10 (a gap that clearly clears the band), it still proves the half that matters
    // operationally: a gap intended to sit right at the boundary is treated as tied, never as a
    // confident single primary.
    const near = makeWorkflow({ workflowId: "workflow.fixture.band-near-tie", title: "Zulu Yankee gadget", trigger: "zulu trigger text" });
    const match = matchWorkflows("zulu yankee", [top, near]);
    assert(match.kind === "candidates", `expected candidates at the ambiguity-band boundary, got ${match.kind}`);
  });

  // --- 10. just past the ambiguity band: the top score stands alone as primary --------------------

  harness.check("route-utterance: a score gap just past the ambiguity band lets the top score stand alone as primary", () => {
    const top = makeWorkflow({ workflowId: "workflow.fixture.band-top-2", title: "Zulu Yankee widget", trigger: "zulu yankee trigger" });
    // "zulu" hits both title and trigger (boost 7); "yankee" hits the trigger only (boost 2):
    // matchedTermCount=2, boost=9 -> matchConfidence = 2 + 9/10 = 2.9. Gap against top's 3.4 is
    // exactly 0.5 (verified bit-exact in IEEE-754), comfortably past AMBIGUITY_BAND (0.2 — issue #58
    // moved it from 0.4; see route-utterance.ts's own doc comment), so this is unambiguously the "not
    // tied" direction case 9's near-boundary gap could not isolate alone.
    const farEnough = makeWorkflow({ workflowId: "workflow.fixture.band-past", title: "Zulu widget", trigger: "zulu yankee trigger" });
    const match = matchWorkflows("zulu yankee", [top, farEnough]);
    assert(match.kind === "primary", `expected the top score to stand alone once the gap clears the ambiguity band, got ${match.kind}`);
    if (match.kind !== "primary") return;
    assert(match.match.workflowId === "workflow.fixture.band-top-2", `expected the higher-scoring workflow selected, got ${match.match.workflowId}`);
  });

  // --- 11. a lone non-tied top score below threshold still falls through to candidates ------------

  harness.check("route-utterance: a non-tied top score below ROUTE_CONFIDENCE_THRESHOLD falls through to candidates, never a low-confidence primary", () => {
    // A single query term hitting the title only: matchedTermCount=1, boost=5 (title, no trigger
    // hit) -> matchConfidence = 1 + 5/10 = 1.5, below ROUTE_CONFIDENCE_THRESHOLD (1.7). Paired here
    // with a completely unrelated workflow (score 0, gap 1.5 >> AMBIGUITY_BAND), so this is NOT a
    // tie — it isolates the threshold check itself from the tie check. Without this case, deleting
    // the `top.matchConfidence >= ROUTE_CONFIDENCE_THRESHOLD` half of the guard entirely (leaving
    // only the tie check) is invisible to every other scenario in this file: case 3's `farBelow`
    // partner scores 0 too, but case 3's own top sits AT the threshold, so it never exercises a
    // non-tied top score that sits BELOW it.
    const lowScore = makeWorkflow({ workflowId: "workflow.fixture.below-threshold", title: "Solo alpha widget", trigger: "unrelated trigger text" });
    const farBelow = makeWorkflow({ workflowId: "workflow.fixture.below-threshold-partner", title: "Zzyzx unrelated", trigger: "totally unrelated content" });
    const match = matchWorkflows("alpha", [lowScore, farBelow]);
    assert(match.kind === "candidates", `expected candidates for a non-tied top score below threshold, got ${match.kind}`);
  });

  // --- 12. a corrupt workspace registry never crashes routing --------------------------------------

  harness.check("route-utterance: a corrupt ~/.b2c-app-builder workspace registry degrades to routing on the utterance alone, and never throws", () => {
    const dir = harness.makeTempDir("route-utterance-corrupt-registry-cwd");
    const home = harness.makeTempDir("route-utterance-corrupt-registry-home");
    // The same shape of damage adapters/registry.ts's loadRegistry() cannot JSON.parse.
    writeFileSync(path.join(home, "workspaces.json"), "not valid json {{{");
    const previous = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = home;
    try {
      const outcome = routeUtterance({ utterance: "plan the app's onboarding flow", cwd: dir });
      assert(
        outcome.kind !== "product_mismatch",
        `a corrupt registry must never resolve to product_mismatch (that requires a real inspection result), got ${outcome.kind}`,
      );
      assert(outcome.kind === "primary" || outcome.kind === "candidates", `expected routing to proceed on the utterance alone, got ${outcome.kind}`);
      assert(outcome.nextAgentAction.length > 0, "outcome must still carry a founder-facing next action even when the registry is unreadable");
    } finally {
      if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = previous;
    }
  });

  // --- 13. createStatKeyedCache reloads once a file's (mtimeMs, size) stamp actually changes -------

  harness.check("route-utterance: createStatKeyedCache reuses an unchanged file's cached value and reloads once its stat stamp changes", () => {
    const dir = harness.makeTempDir("route-utterance-stat-keyed-cache");
    const filePath = path.join(dir, "value.txt");
    const older = new Date("2024-01-01T00:00:00Z");
    const newer = new Date("2024-06-01T00:00:00Z");

    writeFileSync(filePath, "one");
    utimesSync(filePath, older, older);

    let loadCount = 0;
    // Read through a function rather than the bare `loadCount` variable below: TS's control-flow
    // narrowing otherwise pins `loadCount` to the literal type of its first `=== 1` assertion and
    // never widens it back across the intervening `cache(filePath)` call that actually mutates it
    // (a closure-narrowing gap, not a real type error), which would make the later `=== 2`
    // assertion a compile error ("types '1' and '2' have no overlap").
    const currentLoadCount = (): number => loadCount;
    const cache = createStatKeyedCache((loadPath: string) => {
      loadCount += 1;
      return readFileSync(loadPath, "utf8");
    });

    assert(cache(filePath) === "one", "the first call must load the file's real content");
    assert(currentLoadCount() === 1, `expected exactly 1 load after the first call, got ${currentLoadCount()}`);

    assert(cache(filePath) === "one", "a repeat call against an unchanged (mtimeMs, size) stamp must reuse the cached value");
    assert(currentLoadCount() === 1, `expected the loader NOT to re-run against an unchanged stat stamp, got ${currentLoadCount()} total calls`);

    // Changes both size (new content is a different length) and mtime, so the stamp comparison
    // cannot pass by either field surviving alone.
    writeFileSync(filePath, "two-but-longer");
    utimesSync(filePath, newer, newer);

    assert(cache(filePath) === "two-but-longer", "a call after the file's stat stamp changed must reflect the file's current content, not the stale cache");
    assert(currentLoadCount() === 2, `expected exactly one additional load once the stat stamp changed, got ${currentLoadCount()} total calls`);
  });

  // --- 14. issue #58 stage 3: a founderPhrasing-only term match resolves a primary at trigger weight

  harness.check(
    "route-utterance: a term that appears ONLY in a workflow's founderPhrasings (never trigger/title) still resolves a confident primary, at trigger weight",
    () => {
      // Deliberately fabricated, non-English-function-word tokens so neither `terms()`'s base
      // stopword list nor route-scoring.ts's ROUTER_STOP_WORDS can filter any of them, and so this
      // proof cannot be satisfied by coincidental overlap with real catalog vocabulary.
      const withPhrasing = makeWorkflow({
        workflowId: "workflow.fixture.phrasing-bridge",
        title: "Unrelated Title Zeta",
        trigger: "completely unrelated trigger text",
        founderPhrasings: ["zephyr quartz nebula workflow"],
      });
      const withoutPhrasing = makeWorkflow({
        workflowId: "workflow.fixture.no-phrasing",
        title: "Another Workflow Zeta",
        trigger: "a different unrelated trigger",
      });
      const match = matchWorkflows("zephyr quartz nebula", [withPhrasing, withoutPhrasing]);
      assert(match.kind === "primary", `expected the founderPhrasing's vocabulary to resolve a confident primary, got ${match.kind}`);
      if (match.kind !== "primary") return;
      assert(
        match.match.workflowId === "workflow.fixture.phrasing-bridge",
        `expected the workflow whose founderPhrasing carries the matched terms, got ${match.match.workflowId}`,
      );
      // matchedTermCount=3 (zephyr, quartz, nebula — all inside the phrasing, none in trigger/title),
      // boost=2/term (route-scoring.ts's combineTriggerWithFounderPhrasings feeds the phrasing text
      // into matchRank's trigger-weighted slot, exactly like real trigger text) = 6, PLUS bigram
      // credit: "zephyr quartz" and "quartz nebula" (queryBigrams built from the 3-word utterance)
      // both appear adjacent inside the phrasing too, +BIGRAM_BOOST(4) each = 8 -> boost 14 total ->
      // matchConfidence = 3 + 14/10 = 4.4. This is the scoring proof, not just the outcome: if a
      // future change stopped folding founderPhrasings into scoring (or into bigram matching), this
      // workflow would match ZERO terms/bigrams (its real trigger/title share none with the
      // utterance) and this assertion would fail loudly rather than silently degrading to a lower
      // (but still coincidentally passing) confidence.
      assert(
        match.match.matchConfidence === 4.4,
        `expected matchConfidence 4.4 from trigger-weight phrasing + bigram credit, got ${match.match.matchConfidence}`,
      );
    },
  );
}

// Same skillRoot computation _harness.ts and route-utterance.ts itself use, so this reads the
// exact bundle production code reads (this file lives at the same directory depth as _harness.ts).
const catalogFixtureBundlePath = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."), "catalog/generated/hosted-knowledge.json");
