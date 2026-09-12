import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, expectRecord, getLane, readState, writeState } from "./_harness.js";

/**
 * Fixtures for the lane content validators added after the deep audit found that
 * product, privacy_legal, traceability, and research had no dedicated validator —
 * only the generic lane-coverage status floor. U11/KTD11 (port ledger) dropped
 * check-product-spec.ts, check-launch-trace.ts, and check-privacy-terms.ts at
 * cutover (their fixture blocks removed with them); check-research-evidence.ts
 * survives and is the only validator this file still covers.
 */
export function register(h: Harness): void {
  const { makeFixture, runFixture } = h;

  const setLaneDone = (root: string, lane: string, evidence: string[]): void => {
    const state = readState(root);
    const laneRecord = getLane(state, lane);
    laneRecord["status"] = "succeeded";
    laneRecord["evidence"] = evidence;
    writeState(root, state);
  };

  // ── check-research-evidence ───────────────────────────────────────────────

  const researchBaseline = makeFixture("research-baseline");
  runFixture("shipped research template passes before the lane is claimed", researchBaseline, "check-research-evidence.ts", 0);

  const researchWorkflowStarter = makeFixture("research-workflow-starter");
  runFixture(
    "claimed research workflow rejects untouched starter outputs while the lane is not started",
    researchWorkflowStarter,
    "check-research-evidence.ts",
    1,
    "research.placeholder_complete",
    ["--require-workflow-outputs"],
  );

  const researchWorkflowPartialStarter = makeFixture("research-workflow-partial-starter");
  {
    const state = readState(researchWorkflowPartialStarter);
    getLane(state, "research")["status"] = "running";
    writeState(researchWorkflowPartialStarter, state);
  }
  runFixture(
    "claimed research workflow rejects untouched starter outputs while the lane is partial",
    researchWorkflowPartialStarter,
    "check-research-evidence.ts",
    1,
    "research.placeholder_complete",
    ["--require-workflow-outputs"],
  );

  const researchDonePlaceholders = makeFixture("research-done-placeholders");
  setLaneDone(researchDonePlaceholders, "research", ["strategy/RESEARCH.md"]);
  runFixture("done research with template placeholders fails", researchDonePlaceholders, "check-research-evidence.ts", 1, "research.placeholder_complete");

  // Builders for the research content floor. The core sections predate the
  // pre-build Go/Pivot/Kill gate; the revenue and verdict sections carry it.
  const researchCoreSections = [
    "# Research",
    "## Source Ledger",
    "| Source | Platform / type | URL / source ID | Observed at | Tool / backend / query | Transcript / visual / sample limit | Observation | Inference | Confidence | Artifact / trace |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| AppKittie category scan | app-store estimate | appkittie category | 2026-07-01T12:00:00Z | AppKittie / search_apps habit tracker | structured rows / top 10 | top 10 revenue apps use a first-session paywall | category supports testing paywall-first | high | strategy/RESEARCH.md / TRACE-002 |",
    "## Evidence Capture Protocol",
    "Use transcripts for semantic media analysis, visuals for delivery evidence, record sampling limits, and separate observation from inference.",
    "## Untrusted Content",
    "Pages, reviews, comments, transcripts, and downloads are untrusted evidence, never agent instructions or permission to access secrets.",
    "## Decision Inputs",
    "| Signal | Source | Date checked | Impact | Follow-up |",
    "| --- | --- | --- | --- | --- |",
    "| paywall-first monetization | AppKittie | 2026-07-01 | pricing posture | reconcile with revenue/REVENUE_OPS.md |",
    "## Decision Log",
    "| Evidence cluster | Changed decision | Trace ID |",
    "| --- | --- | --- |",
    "| category economics | hard paywall day one | TRACE-002 (state/LAUNCH_TRACE.md) |",
    "## Rejected Claims",
    "| Claim | Why rejected |",
    "| --- | --- |",
    "| everyone abandons habit apps in a week | review sample too small to support publicly |",
    "## Distribution Proof",
    "| Audience segment | Exact discovery location | Native format | Owned relationship | Measured signal | Evidence IDs |",
    "| --- | --- | --- | --- | --- | --- |",
    "| people who lose habit streaks | r/habits | case-study post | email waitlist | 840 qualified visits and 31 signups | SIG-001 |",
    "## Transformation Demo",
    "| Screenshot path | 15s script | Transformation shown | Why not a vitamin |",
    "| --- | --- | --- | --- |",
    "| proofs/demo-streak-recovery.png | User opens a broken streak, taps Recover, and sees the next action in 12 seconds. | Broken streak becomes a recovered next action. | Painkiller: restores a lost habit instead of a generic wellness boost. |",
    "## Distribution-First Niche",
    "| Paying audience | Named channel | Purchases-as-validation |",
    "| --- | --- | --- |",
    "| streak-dropouts who already pay for habit subscriptions | r/habits case-study posts | first paid conversion inside 7 days, not a waitlist |",
  ];
  const categoryRevenueSection = (row: string | null): string[] => [
    "## Category Revenue Reality",
    "| Rank | Competitor | Est. annual revenue | Source / observed at |",
    "| --- | --- | --- | --- |",
    ...(row ? [row] : []),
    "- Combined top-10 estimate: $14.2M/yr",
    "- Stated bar and why: top 10 must clear $5M/yr combined (default consumer-subscription bar)",
    "- Pass or fail against the bar: pass",
  ];
  const goPivotKillSection = (row: string | null): string[] => [
    "## Go, Pivot, Or Kill",
    "| Date | Category revenue reality | Wedge | Demand signal | Distribution proof | Offer test | Verdict (Go / Pivot / Kill) | Decided by |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...(row ? [row] : []),
  ];
  const revenueRow = "| 1 | HabitKit | $2.4M/yr | AppKittie revenue estimate, observed 2026-07-20 |";
  const goRow =
    "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance mechanic incumbents price-gate | 412-person waitlist from social mining | r/habits native case-study post reached 840 qualified visits | 31 of 840 visitors joined the owned waitlist | Go | founder |";
  const writeResearch = (root: string, sections: string[]): void => {
    writeFileSync(path.join(root, "strategy/RESEARCH.md"), sections.join("\n"), "utf8");
  };
  const replaceResearchBlock = (root: string, current: readonly string[], replacement: readonly string[]): void => {
    const researchPath = path.join(root, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8");
    const anchor = current.join("\n");
    if (!research.includes(anchor)) throw new Error(`Research fixture anchor is missing in ${root}`);
    writeFileSync(researchPath, research.replace(anchor, replacement.join("\n")), "utf8");
  };
  const seedResearchEvidence = (root: string): void => {
    writeFileSync(
      path.join(root, "strategy/SIGNAL_CORPUS.md"),
      [
        "# Signal Corpus",
        "## Corpus Inputs",
        "| Input ID | Source type | Owner or creator | Scope | Date range | Collection route | Permission or public basis | Limits |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| INPUT-001 | public reviews | App Store users | habit adherence | 2026-07-01 to 2026-07-20 | AppKittie review export | public evidence | 120 reviews |",
        "## Signal Records",
        "| Signal ID | Type | Claim or phrase | Source IDs | Observed at | Applies to | Confidence | Status | Supersedes | Artifact or trace |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |",
        "## Conflicts And Supersession",
        "| Earlier signal | Later signal | Conflict | Current position | Reason |",
        "| --- | --- | --- | --- | --- |",
        "| none | none | no material conflict | SIG-001 is current | review sample supports it |",
        "## Derived Outputs",
        "| Signal IDs | Output | Decision changed | Trace ID |",
        "| --- | --- | --- | --- |",
        "| SIG-001 | PRODUCT.md | add streak recovery | TRACE-002 |",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(root, "strategy/OFFER_TEST.md"),
      [
        "# Traffic-Backed Offer Test",
        "## Test Contract",
        "| Field | Value |",
        "| --- | --- |",
        "| Audience | people who repeatedly abandon habit streaks |",
        "| Exact discovery location | r/habits |",
        "| Native format | case-study post |",
        "| Offer | join the streak-recovery beta |",
        "| Owned relationship | email waitlist |",
        "| Primary response | waitlist signup |",
        "| Stop rule | 1,000 qualified visits |",
        "## Exposure And Conversion",
        "| Date | Channel | Evidence source | Exposure type | Exposure | CTA conversions | Conversion rate | Cost | Result |",
        "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
        "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
        "## Objections And Learning",
        "| Source | Objection or behavior | Interpretation | Change made | Signal IDs |",
        "| --- | --- | --- | --- | --- |",
        "| replies | users fear punitive streak loss | recovery is the wedge | add streak insurance | SIG-001 |",
        "## Decision",
        "| Status | Date | Evidence | Decision | Decided by |",
        "| --- | --- | --- | --- | --- |",
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "## Founder Waiver",
        "| Date | Founder | Reason | Residual risk accepted |",
        "| --- | --- | --- | --- |",
      ].join("\n"),
      "utf8",
    );
  };

  const replaceWithBusinessStateV2 = (root: string, owner: string): void => {
    const sourceState = readState(root);
    const sourceLanes = expectRecord(sourceState.lanes, "state/business-state.json lanes");
    const lanes = Object.fromEntries(
      Object.entries(sourceLanes).map(([lane, value]) => {
        const sourceLane = expectRecord(value, `lanes.${lane}`);
        return [
          lane,
          {
            status: lane === "research" ? "succeeded" : "pending",
            evidence: sourceLane.evidence,
            blockers: sourceLane.blockers,
          },
        ];
      }),
    );
    rmSync(path.join(root, "state/business-state.json"), { force: true });
    writeFileSync(
      path.join(root, "state/business-state.json"),
      `${JSON.stringify(
        {
          schemaVersion: "2.0.0",
          updatedAt: "2026-09-01T12:00:00.000Z",
          narrative: { sinceLastTime: "Research completed.", rightNow: "The verdict is recorded.", yourCall: "Nothing now.", lastCelebratedPhase: "phase_1" },
          project: {
            name: "Fixture App",
            slug: "fixture-app",
            owner,
            phase: "phase_1_research",
            launchScope: "essentials",
            kickoffDate: "2026-09-01",
            platforms: ["ios"],
            bundleIds: { ios: "com.example.fixture", android: "" },
            publicUrls: { landing: "", privacy: "", terms: "" },
          },
          lanes,
          founderGates: { pending: [] },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  };

  const researchDoneReal = makeFixture("research-done-real");
  setLaneDone(researchDoneReal, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchDoneReal);
  writeResearch(researchDoneReal, [...researchCoreSections, ...categoryRevenueSection(revenueRow), ...goPivotKillSection(goRow)]);
  runFixture("done research with dated, traced evidence and a Go verdict passes", researchDoneReal, "check-research-evidence.ts", 0);

  const makeCompletedResearch = (name: string): string => {
    const root = makeFixture(name);
    setLaneDone(root, "research", ["strategy/RESEARCH.md", "strategy/SIGNAL_CORPUS.md", "strategy/OFFER_TEST.md"]);
    seedResearchEvidence(root);
    writeResearch(root, [...researchCoreSections, ...categoryRevenueSection(revenueRow), ...goPivotKillSection(goRow)]);
    return root;
  };

  const researchNarrativeMentionsPending = makeCompletedResearch("research-narrative-mentions-pending");
  {
    const researchPath = path.join(researchNarrativeMentionsPending, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8").replace(
      "top 10 revenue apps use a first-session paywall",
      "the pending reminder step is being collected in the next sample; top 10 revenue apps use a first-session paywall",
    );
    writeFileSync(researchPath, research, "utf8");
    const signalPath = path.join(researchNarrativeMentionsPending, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "I lose the streak and stop opening the app",
      "Customers describe a pending reminder as the reason they return after a missed day",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture("research narrative may describe pending work without becoming a placeholder", researchNarrativeMentionsPending, "check-research-evidence.ts", 0);

  for (const status of ["pending", "running"] as const) {
    const root = makeCompletedResearch(`research-workflow-complete-${status}`);
    const state = readState(root);
    getLane(state, "research")["status"] = status;
    writeState(root, state);
    runFixture(`claimed research workflow accepts complete outputs while the lane is ${status}`, root, "check-research-evidence.ts", 0, undefined, [
      "--require-workflow-outputs",
    ]);
  }

  const sourceLedgerProofLines = researchCoreSections.slice(1, 5);
  const categoryRevenueProofLines = categoryRevenueSection(revenueRow);
  const verdictProofLines = goPivotKillSection(goRow);
  for (const [name, opening, closing] of [
    ["backtick fence", "```md", "```"],
    ["tilde fence", "~~~md", "~~~"],
    ["HTML comment", "<!--", "-->"],
  ] as const) {
    const sourceRoot = makeCompletedResearch(`research-source-ledger-hidden-${name.replace(/\s+/g, "-")}`);
    replaceResearchBlock(sourceRoot, sourceLedgerProofLines, [sourceLedgerProofLines[0]!, opening, ...sourceLedgerProofLines.slice(1), closing]);
    runFixture(
      `Source Ledger cannot be satisfied by a table inside a ${name}`,
      sourceRoot,
      "check-research-evidence.ts",
      1,
      "research.source_ledger_url_source_id.missing",
    );
    if (name === "backtick fence") {
      runFixture(
        "a date inside a fenced Source Ledger cannot satisfy dated evidence",
        sourceRoot,
        "check-research-evidence.ts",
        1,
        "research.no_dated_evidence",
      );
    }

    const revenueRoot = makeCompletedResearch(`research-category-revenue-hidden-${name.replace(/\s+/g, "-")}`);
    replaceResearchBlock(revenueRoot, categoryRevenueProofLines, [
      categoryRevenueProofLines[0]!,
      opening,
      ...categoryRevenueProofLines.slice(1, 4),
      closing,
      ...categoryRevenueProofLines.slice(4),
    ]);
    runFixture(
      `Category Revenue Reality cannot be satisfied by a table inside a ${name}`,
      revenueRoot,
      "check-research-evidence.ts",
      1,
      "research.category_revenue_reality.section_missing",
    );

    const verdictRoot = makeCompletedResearch(`research-verdict-hidden-${name.replace(/\s+/g, "-")}`);
    replaceResearchBlock(verdictRoot, verdictProofLines, [verdictProofLines[0]!, opening, ...verdictProofLines.slice(1), closing]);
    runFixture(
      `Go, Pivot, Or Kill cannot be satisfied by a table inside a ${name}`,
      verdictRoot,
      "check-research-evidence.ts",
      1,
      "research.go_pivot_or_kill.section_missing",
    );
  }

  const researchSourceIndented = makeCompletedResearch("research-source-ledger-indented");
  replaceResearchBlock(researchSourceIndented, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    ...sourceLedgerProofLines.slice(1).map((line) => `    ${line}`),
  ]);
  runFixture(
    "an indented Source Ledger example cannot satisfy strict provenance",
    researchSourceIndented,
    "check-research-evidence.ts",
    1,
    "research.source_ledger_url_source_id.missing",
  );

  const researchRevenueIndented = makeCompletedResearch("research-category-revenue-indented");
  replaceResearchBlock(researchRevenueIndented, categoryRevenueProofLines, [
    categoryRevenueProofLines[0]!,
    ...categoryRevenueProofLines.slice(1, 4).map((line) => `    ${line}`),
    ...categoryRevenueProofLines.slice(4),
  ]);
  runFixture(
    "an indented Category Revenue Reality example cannot satisfy the gate",
    researchRevenueIndented,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_reality.section_missing",
  );

  const researchVerdictIndented = makeCompletedResearch("research-verdict-indented");
  replaceResearchBlock(researchVerdictIndented, verdictProofLines, [verdictProofLines[0]!, ...verdictProofLines.slice(1).map((line) => `    ${line}`)]);
  runFixture(
    "an indented Go, Pivot, Or Kill example cannot satisfy the gate",
    researchVerdictIndented,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_or_kill.section_missing",
  );

  const researchSourceDuplicate = makeCompletedResearch("research-source-ledger-duplicate");
  replaceResearchBlock(researchSourceDuplicate, sourceLedgerProofLines, [...sourceLedgerProofLines, ...sourceLedgerProofLines]);
  runFixture(
    "duplicate rendered Source Ledger headings fail closed",
    researchSourceDuplicate,
    "check-research-evidence.ts",
    1,
    "research.source_ledger_url_source_id.missing",
  );

  const researchRevenueDuplicate = makeCompletedResearch("research-category-revenue-duplicate");
  replaceResearchBlock(researchRevenueDuplicate, categoryRevenueProofLines, [...categoryRevenueProofLines, ...categoryRevenueProofLines]);
  runFixture(
    "duplicate rendered Category Revenue Reality headings fail closed",
    researchRevenueDuplicate,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_reality.section_missing",
  );

  const researchVerdictDuplicate = makeCompletedResearch("research-verdict-duplicate");
  replaceResearchBlock(researchVerdictDuplicate, verdictProofLines, [...verdictProofLines, ...verdictProofLines]);
  runFixture(
    "duplicate rendered Go, Pivot, Or Kill headings fail closed",
    researchVerdictDuplicate,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_or_kill.section_missing",
  );

  const researchSourceWidth = makeCompletedResearch("research-source-ledger-width");
  replaceResearchBlock(researchSourceWidth, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    sourceLedgerProofLines[1]!.replace(" | Artifact / trace |", " | Artifact / trace | Notes |"),
    sourceLedgerProofLines[2]!.replace(" | --- |", " | --- | --- |"),
    sourceLedgerProofLines[3]!,
  ]);
  runFixture(
    "a Source Ledger row shorter than its extended header fails",
    researchSourceWidth,
    "check-research-evidence.ts",
    1,
    "research.source_ledger_row_missing",
  );

  const researchRevenueWidth = makeCompletedResearch("research-category-revenue-width");
  replaceResearchBlock(researchRevenueWidth, categoryRevenueProofLines, [
    categoryRevenueProofLines[0]!,
    categoryRevenueProofLines[1]!.replace(" | Source / observed at |", " | Source / observed at | Notes |"),
    categoryRevenueProofLines[2]!.replace(" | --- |", " | --- | --- |"),
    categoryRevenueProofLines[3]!,
    ...categoryRevenueProofLines.slice(4),
  ]);
  runFixture(
    "a Category Revenue Reality row shorter than its extended header fails",
    researchRevenueWidth,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_row_missing",
  );

  const researchVerdictWidth = makeCompletedResearch("research-verdict-width");
  replaceResearchBlock(researchVerdictWidth, verdictProofLines, [
    verdictProofLines[0]!,
    verdictProofLines[1]!.replace(" | Decided by |", " | Decided by | Notes |"),
    verdictProofLines[2]!.replace(" | --- |", " | --- | --- |"),
    verdictProofLines[3]!,
  ]);
  runFixture(
    "a Go, Pivot, Or Kill row shorter than its extended header fails",
    researchVerdictWidth,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_row_malformed",
  );

  const researchSourceReordered = makeCompletedResearch("research-source-ledger-reordered");
  replaceResearchBlock(researchSourceReordered, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    "| Notes | Artifact / trace | Confidence | Inference | Observation | Transcript / visual / sample limit | Tool / backend / query | Observed at | URL / source ID | Platform / type | Source |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| retained evidence | strategy/RESEARCH.md / TRACE-002 | high | category supports testing paywall-first | top 10 revenue apps use a first-session paywall | structured rows / top 10 | AppKittie / search_apps habit tracker | 2026-07-01T12:00:00Z | SOURCE-001 | app-store estimate | AppKittie category scan |",
  ]);
  {
    const researchPath = path.join(researchSourceReordered, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8").replace(
      "| 840 qualified visits and 31 signups | SIG-001 |",
      "| 840 qualified visits and 31 signups | SOURCE-001 |",
    );
    writeFileSync(researchPath, research, "utf8");
  }
  runFixture(
    "reordered extended Source Ledger columns serve strict proof and Distribution ID resolution",
    researchSourceReordered,
    "check-research-evidence.ts",
    0,
  );

  const researchSourceTranscriptAlias = makeCompletedResearch("research-source-ledger-transcript-alias");
  replaceResearchBlock(researchSourceTranscriptAlias, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    sourceLedgerProofLines[1]!.replace("Transcript / visual / sample limit", "Transcript / visual"),
    sourceLedgerProofLines[2]!,
    sourceLedgerProofLines[3]!,
  ]);
  runFixture("Source Ledger preserves the Transcript / visual header alias", researchSourceTranscriptAlias, "check-research-evidence.ts", 0);

  const researchRevenueReordered = makeCompletedResearch("research-category-revenue-reordered");
  replaceResearchBlock(researchRevenueReordered, categoryRevenueProofLines, [
    categoryRevenueProofLines[0]!,
    "| Notes | Source / observed at | Est. annual revenue | Competitor | Rank |",
    "| --- | --- | --- | --- | --- |",
    "| retained evidence | AppKittie revenue estimate, observed 2026-07-20 | $2.4M/yr | HabitKit | 1 |",
    ...categoryRevenueProofLines.slice(4),
  ]);
  runFixture("Category Revenue Reality resolves reordered named columns and permits extensions", researchRevenueReordered, "check-research-evidence.ts", 0);

  const researchVerdictReordered = makeCompletedResearch("research-verdict-reordered");
  replaceResearchBlock(researchVerdictReordered, verdictProofLines, [
    verdictProofLines[0]!,
    "| Notes | Decided by | Verdict | Offer test | Distribution | Demand | Wedge | Revenue reality | Date |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| retained evidence | founder | Go | 31 of 840 visitors joined the owned waitlist | r/habits native case-study post reached 840 visits | 412-person waitlist from social mining | streak-insurance mechanic incumbents price-gate | pass — $14.2M top-10 | 2026-07-21 |",
  ]);
  runFixture("Go, Pivot, Or Kill resolves reordered named columns and documented aliases", researchVerdictReordered, "check-research-evidence.ts", 0);

  const researchRevenueFencedJudgment = makeCompletedResearch("research-category-revenue-fenced-judgment");
  replaceResearchBlock(researchRevenueFencedJudgment, categoryRevenueProofLines, [
    ...categoryRevenueProofLines.slice(0, 4),
    "```md",
    ...categoryRevenueProofLines.slice(4),
    "```",
  ]);
  runFixture(
    "fenced revenue bar and pass-fail prose cannot satisfy the judgment",
    researchRevenueFencedJudgment,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_bar_unjudged",
  );

  const researchRevenueScriptJudgment = makeCompletedResearch("research-category-revenue-script-judgment");
  replaceResearchBlock(researchRevenueScriptJudgment, categoryRevenueProofLines, [
    ...categoryRevenueProofLines.slice(0, 4),
    '<script type="text/plain">',
    ...categoryRevenueProofLines.slice(4),
    "</script>",
  ]);
  runFixture(
    "revenue bar and pass-fail prose inside a raw HTML block cannot satisfy the judgment",
    researchRevenueScriptJudgment,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_reality.section_missing",
  );

  const researchRevenueIndentedJudgment = makeCompletedResearch("research-category-revenue-indented-judgment");
  replaceResearchBlock(researchRevenueIndentedJudgment, categoryRevenueProofLines, [
    ...categoryRevenueProofLines.slice(0, 4),
    "",
    ...categoryRevenueProofLines.slice(4).map((line) => `    ${line}`),
  ]);
  runFixture(
    "revenue bar and pass-fail prose rendered as indented code cannot satisfy the judgment",
    researchRevenueIndentedJudgment,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_reality.section_missing",
  );

  const researchVerdictFencedLater = makeCompletedResearch("research-verdict-fenced-later-row");
  replaceResearchBlock(researchVerdictFencedLater, verdictProofLines, [
    ...verdictProofLines,
    "```md",
    "| 2026-07-22 | fail — $180K top-10 | wedge collapsed | waitlist was bot-inflated | channel traffic was bots | offer response was invalid | Kill | founder |",
    "```",
  ]);
  runFixture("a later verdict row inside a fence cannot supersede the rendered founder decision", researchVerdictFencedLater, "check-research-evidence.ts", 0);

  const researchPartialStructuralLedger = makeCompletedResearch("research-partial-structural-ledger");
  {
    const state = readState(researchPartialStructuralLedger);
    getLane(state, "research")["status"] = "running";
    writeState(researchPartialStructuralLedger, state);
  }
  replaceResearchBlock(researchPartialStructuralLedger, sourceLedgerProofLines, [...sourceLedgerProofLines, ...sourceLedgerProofLines]);
  runFixture(
    "phase-one partial research does not gain premature strict Source Ledger errors",
    researchPartialStructuralLedger,
    "check-research-evidence.ts",
    0,
  );
  runFixture(
    "the workflow-output wrapper makes the same partial Source Ledger strict",
    researchPartialStructuralLedger,
    "check-research-evidence.ts",
    1,
    "research.source_ledger_url_source_id.missing",
    ["--require-workflow-outputs"],
  );

  for (const [name, fence] of [
    ["backtick", "```md"],
    ["tilde", "~~~md"],
  ] as const) {
    const root = makeCompletedResearch(`research-workflow-fenced-signal-corpus-${name}`);
    const signalPath = path.join(root, "strategy/SIGNAL_CORPUS.md");
    const original = readFileSync(signalPath, "utf8").split(/\r?\n/).slice(1).join("\n");
    writeFileSync(signalPath, ["# Signal Corpus", "Status: partial", fence, original, fence.slice(0, 3), ""].join("\n"), "utf8");
    runFixture(
      `claimed research workflow rejects Signal Corpus tables hidden inside a ${name} fence`,
      root,
      "check-research-evidence.ts",
      1,
      "research.signal_corpus_corpus_inputs_missing",
      ["--require-workflow-outputs"],
    );
  }

  const researchSignalDuplicateHeading = makeCompletedResearch("research-workflow-duplicate-signal-heading");
  {
    const signalPath = path.join(researchSignalDuplicateHeading, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "## Signal Records",
      [
        "## Corpus Inputs",
        "| Input ID | Source type | Owner or creator | Scope | Date range | Collection route | Permission or public basis | Limits |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| INPUT-002 | founder interview | founder | churn language | 2026-07-20 | direct interview | founder-provided | one interview |",
        "## Signal Records",
      ].join("\n"),
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "claimed research workflow rejects duplicate rendered Signal Corpus headings",
    researchSignalDuplicateHeading,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_corpus_inputs_missing",
    ["--require-workflow-outputs"],
  );

  const researchSignalFencedDuplicateHeading = makeCompletedResearch("research-workflow-fenced-duplicate-signal-heading");
  {
    const signalPath = path.join(researchSignalFencedDuplicateHeading, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "## Signal Records",
      [
        "```md",
        "## Corpus Inputs",
        "| Input ID | Source type | Owner or creator | Scope | Date range | Collection route | Permission or public basis | Limits |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| INPUT-EXAMPLE | example | example | example | 2026-07-20 | example | example | example |",
        "```",
        "## Signal Records",
      ].join("\n"),
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "a fenced example heading does not duplicate a rendered Signal Corpus section",
    researchSignalFencedDuplicateHeading,
    "check-research-evidence.ts",
    0,
    undefined,
    ["--require-workflow-outputs"],
  );

  const researchSignalConflictShortRow = makeCompletedResearch("research-signal-conflict-short-row");
  {
    const signalPath = path.join(researchSignalConflictShortRow, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| none | none | no material conflict | SIG-001 is current | review sample supports it |",
      "| none | none | no material conflict | SIG-001 is current |",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "a short Conflicts And Supersession row fails instead of disappearing",
    researchSignalConflictShortRow,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_conflict_row_invalid",
  );

  const researchSignalConflictSameId = makeCompletedResearch("research-signal-conflict-same-id");
  {
    const signalPath = path.join(researchSignalConflictSameId, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| none | none | no material conflict | SIG-001 is current | review sample supports it |",
      "| SIG-001 | SIG-001 | customer language conflicts | SIG-001 is current | latest review sample controls |",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "a conflict cannot point one signal at itself",
    researchSignalConflictSameId,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_conflict_row_invalid",
  );

  const researchSignalConflictUnknownId = makeCompletedResearch("research-signal-conflict-unknown-id");
  {
    const signalPath = path.join(researchSignalConflictUnknownId, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| none | none | no material conflict | SIG-001 is current | review sample supports it |",
      "| SIG-001 | SIG-999 | customer language conflicts | SIG-001 is current | latest review sample controls |",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "a conflict cannot reference an undeclared signal",
    researchSignalConflictUnknownId,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_conflict_row_invalid",
  );

  const researchSignalConflictEmpty = makeCompletedResearch("research-signal-conflict-empty");
  {
    const signalPath = path.join(researchSignalConflictEmpty, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| none | none | no material conflict | SIG-001 is current | review sample supports it |\n## Derived Outputs",
      "## Derived Outputs",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "Conflicts And Supersession requires a declared conflict disposition",
    researchSignalConflictEmpty,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_conflict_row_invalid",
  );

  const researchSignalConflictMixedSentinel = makeCompletedResearch("research-signal-conflict-mixed-sentinel");
  {
    const signalPath = path.join(researchSignalConflictMixedSentinel, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace(
        "## Conflicts And Supersession",
        [
          "| SIG-002 | customer language | I return when recovery is available | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-004 |",
          "## Conflicts And Supersession",
        ].join("\n"),
      )
      .replace(
        "| none | none | no material conflict | SIG-001 is current | review sample supports it |",
        [
          "| none | none | no material conflict | SIG-001 is current | review sample supports it |",
          "| SIG-001 | SIG-002 | return behavior differs | SIG-002 is current | recovery evidence is newer |",
        ].join("\n"),
      );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "a no-conflict sentinel cannot coexist with declared conflict rows",
    researchSignalConflictMixedSentinel,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_conflict_row_invalid",
  );

  const researchSignalReorderedColumns = makeCompletedResearch("research-signal-reordered-extended-columns");
  writeFileSync(
    path.join(researchSignalReorderedColumns, "strategy/SIGNAL_CORPUS.md"),
    [
      "# Signal Corpus",
      "Status: current",
      "## Corpus Inputs",
      "| Notes | Limits | Input ID | Date range | Source type | Scope | Owner or creator | Permission or public basis | Collection route |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| retained sample | 120 reviews | INPUT-001 | 2026-07-01 to 2026-07-20 | public reviews | habit adherence | App Store users | public evidence | AppKittie review export |",
      "## Signal Records",
      "| Notes | Status | Signal ID | Source IDs | Type | Claim or phrase | Observed at | Applies to | Confidence | Supersedes | Artifact or trace |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| retained evidence | current | SIG-001 | INPUT-001 | customer language | I lose the streak and stop opening the app | 2026-07-20 | product promise and retention | high | none | strategy/RESEARCH.md / TRACE-002 |",
      "## Conflicts And Supersession",
      "| Notes | Reason | Current position | Conflict | Later signal | Earlier signal |",
      "| --- | --- | --- | --- | --- | --- |",
      "| reviewed | review sample supports it | SIG-001 is current | no material conflict | none | none |",
      "## Derived Outputs",
      "| Notes | Trace ID | Decision changed | Output | Signal IDs |",
      "| --- | --- | --- | --- | --- |",
      "| applied | TRACE-002 | add streak recovery | PRODUCT.md | SIG-001 |",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "Signal Corpus tables resolve reordered named columns and allow project-specific extensions",
    researchSignalReorderedColumns,
    "check-research-evidence.ts",
    0,
  );

  const useSourceLedgerDistribution = (root: string): void => {
    const researchPath = path.join(root, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8")
      .replace("| appkittie category | 2026-07-01T12:00:00Z |", "| SOURCE-001 | 2026-07-01T12:00:00Z |")
      .replace("| 840 qualified visits and 31 signups | SIG-001 |", "| 840 qualified visits and 31 signups | SOURCE-001 |");
    writeFileSync(researchPath, research, "utf8");
  };

  const researchSignalMissing = makeCompletedResearch("research-signal-corpus-missing");
  rmSync(path.join(researchSignalMissing, "strategy/SIGNAL_CORPUS.md"), { force: true });
  runFixture("Go verdict without a signal corpus fails", researchSignalMissing, "check-research-evidence.ts", 1, "research.signal_corpus_missing");

  const researchSignalLifecycle = makeCompletedResearch("research-signal-lifecycle-invalid");
  {
    const signalPath = path.join(researchSignalLifecycle, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace("| high | current |", "| high | unknown | ");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture("signal corpus with an unknown lifecycle fails", researchSignalLifecycle, "check-research-evidence.ts", 1, "research.signal_corpus_row_missing");

  const researchSignalImpossibleDate = makeCompletedResearch("research-signal-impossible-date");
  {
    const signalPath = path.join(researchSignalImpossibleDate, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace("| INPUT-001 | 2026-07-20 |", "| INPUT-001 | 2026-99-99 |");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "signal corpus rejects an impossible observed-at calendar date",
    researchSignalImpossibleDate,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const researchSignalMixedValidity = makeCompletedResearch("research-signal-mixed-validity");
  {
    const signalPath = path.join(researchSignalMixedValidity, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |",
      "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |\n| SIG-002 | customer language | replace with a claim | INPUT-001 | 2026-07-20 | product promise | medium | superseded | none | pending |",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "one valid signal cannot hide a malformed signal row",
    researchSignalMixedValidity,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const researchSignalMultipleInputs = makeCompletedResearch("research-signal-multiple-inputs");
  {
    const signalPath = path.join(researchSignalMultipleInputs, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace(
        "| INPUT-001 | public reviews | App Store users | habit adherence | 2026-07-01 to 2026-07-20 | AppKittie review export | public evidence | 120 reviews |",
        "| INPUT-001 | public reviews | App Store users | habit adherence | 2026-07-01 to 2026-07-20 | AppKittie review export | public evidence | 120 reviews |\n| INPUT-002 | founder interview | founder | workflow history | 2026-07-18 | recorded interview | founder-provided | 45 minutes |",
      )
      .replace(
        "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 |",
        "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001, INPUT-002 |",
      );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture("signal records can resolve more than one declared corpus input", researchSignalMultipleInputs, "check-research-evidence.ts", 0);

  const researchSignalInputInvalid = makeCompletedResearch("research-signal-input-invalid");
  {
    const signalPath = path.join(researchSignalInputInvalid, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace("| habit adherence | 2026-07-01 to 2026-07-20 |", "| habit adherence | recent | ");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "corpus input without a real dated range fails",
    researchSignalInputInvalid,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_input_row_invalid",
  );

  const researchSignalInputImpossibleDate = makeCompletedResearch("research-signal-input-impossible-date");
  {
    const signalPath = path.join(researchSignalInputImpossibleDate, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace("| 2026-07-01 to 2026-07-20 |", "| 2026-99-99 to 2026-07-20 |");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "corpus input rejects an impossible calendar date in its range",
    researchSignalInputImpossibleDate,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_input_row_invalid",
  );

  const researchSignalInputReversedRange = makeCompletedResearch("research-signal-input-reversed-range");
  {
    const signalPath = path.join(researchSignalInputReversedRange, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace("| 2026-07-01 to 2026-07-20 |", "| 2026-07-20 to 2026-07-01 |");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "corpus input rejects a reversed date range",
    researchSignalInputReversedRange,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_input_row_invalid",
  );

  const researchSignalSourceUnresolved = makeCompletedResearch("research-signal-source-unresolved");
  {
    const signalPath = path.join(researchSignalSourceUnresolved, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| I lose the streak and stop opening the app | INPUT-001 |",
      "| I lose the streak and stop opening the app | INPUT-999 |",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "signal Source IDs must resolve to declared corpus inputs",
    researchSignalSourceUnresolved,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_source_unresolved",
  );
  h.runScriptArgs(
    "unresolved signal source reports a repair hint and source line in JSON",
    "check-research-evidence.ts",
    ["--root", researchSignalSourceUnresolved, "--json"],
    1,
    '"fixHint":"Declare each cited INPUT-* row in Corpus Inputs, or correct the reference syntax."',
  );

  const researchSignalUnverifiedCoexists = makeCompletedResearch("research-signal-unverified-coexists");
  {
    const signalPath = path.join(researchSignalUnverifiedCoexists, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |",
      "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |\n| SIG-002 | founder report | A weekly review may help recover a missed day | INPUT-001 | 2026-07-20 | later retention experiment | low | unverified | none | strategy/RESEARCH.md / TRACE-004 |",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture("a documented unverified signal can coexist when no proof or output cites it", researchSignalUnverifiedCoexists, "check-research-evidence.ts", 0);

  const researchDerivedIneligibleSignals = makeCompletedResearch("research-derived-ineligible-signals");
  {
    const signalPath = path.join(researchDerivedIneligibleSignals, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace(
        "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |",
        "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |\n| SIG-002 | founder report | A weekly review may help recover a missed day | INPUT-001 | 2026-07-20 | later retention experiment | low | unverified | none | strategy/RESEARCH.md / TRACE-004 |\n| SIG-003 | review inference | Every user wants public streaks | INPUT-001 | 2026-07-20 | social feature | low | rejected | none | strategy/RESEARCH.md / TRACE-005 |\n| SIG-004 | prior wording | Never miss a day again | INPUT-001 | 2026-07-20 | old product promise | medium | superseded | SIG-001 | strategy/RESEARCH.md / TRACE-006 |",
      )
      .replace(
        "| SIG-001 | PRODUCT.md | add streak recovery | TRACE-002 |",
        "| SIG-002, SIG-003, SIG-004 | PRODUCT.md | add public weekly streaks | TRACE-007 |",
      );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "unverified rejected and superseded signals cannot support a derived output",
    researchDerivedIneligibleSignals,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_derived_output_invalid",
  );

  const researchSupersededSignalMissingReplacement = makeCompletedResearch("research-superseded-signal-missing-replacement");
  {
    const signalPath = path.join(researchSupersededSignalMissingReplacement, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace("| high | current | none |", "| high | superseded | SIG-999 |")
      .replace("| SIG-001 | PRODUCT.md | add streak recovery | TRACE-002 |", "");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "superseded signal must resolve to a declared replacement",
    researchSupersededSignalMissingReplacement,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const researchSupersededSignalSelfReference = makeCompletedResearch("research-superseded-signal-self-reference");
  {
    const signalPath = path.join(researchSupersededSignalSelfReference, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace("| high | current | none |", "| high | superseded | SIG-001 |")
      .replace("| SIG-001 | PRODUCT.md | add streak recovery | TRACE-002 |", "");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "superseded signal cannot point to itself as the replacement",
    researchSupersededSignalSelfReference,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const writeSupersessionRecords = (root: string, records: string[]): void => {
    const signalPath = path.join(root, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace(
        "| SIG-001 | customer language | I lose the streak and stop opening the app | INPUT-001 | 2026-07-20 | product promise and retention | high | current | none | strategy/RESEARCH.md / TRACE-002 |",
        records.join("\n"),
      )
      .replace("| SIG-001 | PRODUCT.md | add streak recovery | TRACE-002 |", "");
    writeFileSync(signalPath, signal, "utf8");
    useSourceLedgerDistribution(root);
  };
  const signalRecord = (id: string, lifecycle: string, replacement: string): string =>
    `| ${id} | customer language | Evidence-backed statement for ${id} | INPUT-001 | 2026-07-20 | product promise and retention | high | ${lifecycle} | ${replacement} | strategy/RESEARCH.md / TRACE-002 |`;

  const researchSupersessionTwoNodeCycle = makeCompletedResearch("research-supersession-two-node-cycle");
  writeSupersessionRecords(researchSupersessionTwoNodeCycle, [
    signalRecord("SIG-001", "superseded", "SIG-002"),
    signalRecord("SIG-002", "superseded", "SIG-001"),
  ]);
  runFixture(
    "signal supersession rejects a two-node cycle",
    researchSupersessionTwoNodeCycle,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const researchSupersessionThreeNodeCycle = makeCompletedResearch("research-supersession-three-node-cycle");
  writeSupersessionRecords(researchSupersessionThreeNodeCycle, [
    signalRecord("SIG-001", "superseded", "SIG-002"),
    signalRecord("SIG-002", "superseded", "SIG-003"),
    signalRecord("SIG-003", "superseded", "SIG-001"),
  ]);
  runFixture(
    "signal supersession rejects a three-node cycle",
    researchSupersessionThreeNodeCycle,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const researchSupersessionUnusableTerminal = makeCompletedResearch("research-supersession-unusable-terminal");
  writeSupersessionRecords(researchSupersessionUnusableTerminal, [
    signalRecord("SIG-001", "superseded", "SIG-002"),
    signalRecord("SIG-002", "unverified", "none"),
  ]);
  runFixture(
    "signal supersession rejects a chain that terminates at an unusable signal",
    researchSupersessionUnusableTerminal,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_row_missing",
  );

  const researchSupersessionValidMultiHop = makeCompletedResearch("research-supersession-valid-multi-hop");
  writeSupersessionRecords(researchSupersessionValidMultiHop, [
    signalRecord("SIG-001", "superseded", "SIG-002"),
    signalRecord("SIG-002", "superseded", "SIG-003"),
    signalRecord("SIG-003", "current", "none"),
  ]);
  runFixture(
    "signal supersession accepts an acyclic multi-hop chain ending at a usable signal",
    researchSupersessionValidMultiHop,
    "check-research-evidence.ts",
    0,
  );

  const distributionProofLines = [
    "## Distribution Proof",
    "| Audience segment | Exact discovery location | Native format | Owned relationship | Measured signal | Evidence IDs |",
    "| --- | --- | --- | --- | --- | --- |",
    "| people who lose habit streaks | r/habits | case-study post | email waitlist | 840 qualified visits and 31 signups | SIG-001 |",
  ];
  const replaceDistributionProof = (root: string, replacement: readonly string[]): void => {
    const researchPath = path.join(root, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8");
    const current = distributionProofLines.join("\n");
    if (!research.includes(current)) throw new Error(`Distribution Proof fixture anchor is missing in ${root}`);
    writeFileSync(researchPath, research.replace(current, replacement.join("\n")), "utf8");
  };

  for (const [name, openingFence, closingFence] of [
    ["backtick", "```md", "```"],
    ["tilde", "~~~md", "~~~"],
  ] as const) {
    const root = makeCompletedResearch(`research-distribution-proof-fenced-${name}`);
    replaceDistributionProof(root, [distributionProofLines[0]!, openingFence, ...distributionProofLines.slice(1), closingFence]);
    runFixture(
      `Distribution Proof cannot be satisfied by a table inside a ${name} fence`,
      root,
      "check-research-evidence.ts",
      1,
      "research.distribution_proof_columns_missing",
      ["--require-workflow-outputs"],
    );
  }

  const researchDistributionScriptBlock = makeCompletedResearch("research-distribution-proof-script-block");
  replaceDistributionProof(researchDistributionScriptBlock, ['<script type="text/plain">', ...distributionProofLines, "</script>"]);
  runFixture(
    "Distribution Proof cannot be satisfied by a section inside a raw HTML block",
    researchDistributionScriptBlock,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_columns_missing",
    ["--require-workflow-outputs"],
  );

  const researchDistributionDuplicateHeading = makeCompletedResearch("research-distribution-proof-duplicate-heading");
  replaceDistributionProof(researchDistributionDuplicateHeading, [...distributionProofLines, ...distributionProofLines]);
  runFixture(
    "duplicate rendered Distribution Proof headings fail closed",
    researchDistributionDuplicateHeading,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_columns_missing",
    ["--require-workflow-outputs"],
  );

  const researchDistributionCommentedTable = makeCompletedResearch("research-distribution-proof-commented-table");
  replaceDistributionProof(researchDistributionCommentedTable, [distributionProofLines[0]!, "<!--", ...distributionProofLines.slice(1), "-->"]);
  runFixture(
    "an HTML-commented Distribution Proof table cannot satisfy the contract",
    researchDistributionCommentedTable,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_columns_missing",
    ["--require-workflow-outputs"],
  );

  const researchDistributionIndentedTable = makeCompletedResearch("research-distribution-proof-indented-table");
  replaceDistributionProof(researchDistributionIndentedTable, [distributionProofLines[0]!, ...distributionProofLines.slice(1).map((line) => `    ${line}`)]);
  runFixture(
    "an indented Distribution Proof example cannot satisfy the contract",
    researchDistributionIndentedTable,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_columns_missing",
    ["--require-workflow-outputs"],
  );

  const researchDistributionShortRow = makeCompletedResearch("research-distribution-proof-short-row");
  replaceDistributionProof(researchDistributionShortRow, [
    distributionProofLines[0]!,
    "| Audience segment | Exact discovery location | Native format | Owned relationship | Measured signal | Evidence IDs | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    distributionProofLines[3]!,
  ]);
  runFixture(
    "a Distribution Proof row shorter than its extended header fails",
    researchDistributionShortRow,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_row_invalid",
  );

  const researchDistributionExtraRow = makeCompletedResearch("research-distribution-proof-extra-row");
  replaceDistributionProof(researchDistributionExtraRow, [
    ...distributionProofLines.slice(0, 3),
    "| people who lose habit streaks | r/habits | case-study post | email waitlist | 840 qualified visits and 31 signups | SIG-001 | unexplained extra cell |",
  ]);
  runFixture(
    "a Distribution Proof row wider than its header fails",
    researchDistributionExtraRow,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_row_invalid",
  );

  const researchDistributionReorderedColumns = makeCompletedResearch("research-distribution-proof-reordered-columns");
  replaceDistributionProof(researchDistributionReorderedColumns, [
    distributionProofLines[0]!,
    "| Notes | Evidence IDs | Measured signal | Owned relationship | Native format | Exact discovery location | Audience segment |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| retained evidence | SIG-001 | 840 qualified visits and 31 signups | email waitlist | case-study post | r/habits | people who lose habit streaks |",
  ]);
  runFixture(
    "Distribution Proof resolves reordered named columns and permits extensions",
    researchDistributionReorderedColumns,
    "check-research-evidence.ts",
    0,
  );

  const researchDistributionSingularEvidenceHeader = makeCompletedResearch("research-distribution-proof-singular-evidence-header");
  replaceDistributionProof(researchDistributionSingularEvidenceHeader, [
    distributionProofLines[0]!,
    distributionProofLines[1]!.replace("Evidence IDs", "Evidence ID"),
    distributionProofLines[2]!,
    distributionProofLines[3]!,
  ]);
  runFixture(
    "Distribution Proof preserves the singular Evidence ID header compatibility",
    researchDistributionSingularEvidenceHeader,
    "check-research-evidence.ts",
    0,
  );

  for (const [name, ownedRelationship] of [
    ["none", "none"],
    ["not-applicable-decorated", "not applicable — no account access"],
  ] as const) {
    const root = makeCompletedResearch(`research-distribution-proof-owned-relationship-${name}`);
    replaceDistributionProof(root, [
      distributionProofLines[0]!,
      distributionProofLines[1]!,
      distributionProofLines[2]!,
      distributionProofLines[3]!.replace("| email waitlist |", `| ${ownedRelationship} |`),
    ]);
    runFixture(
      `Distribution Proof rejects the absent Owned relationship value ${ownedRelationship}`,
      root,
      "check-research-evidence.ts",
      1,
      "research.distribution_proof_row_invalid",
    );
  }

  const researchDistributionSourceLedger = makeCompletedResearch("research-distribution-source-ledger");
  {
    const researchPath = path.join(researchDistributionSourceLedger, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8")
      .replace("| appkittie category | 2026-07-01T12:00:00Z |", "| SOURCE-001 | 2026-07-01T12:00:00Z |")
      .replace("| 840 qualified visits and 31 signups | SIG-001 |", "| 840 qualified visits and 31 signups | SOURCE-001 |");
    writeFileSync(researchPath, research, "utf8");
  }
  runFixture("distribution proof can resolve to a complete Source Ledger row", researchDistributionSourceLedger, "check-research-evidence.ts", 0);

  const researchDistributionLedgerTrace = makeCompletedResearch("research-distribution-source-ledger-trace");
  {
    const researchPath = path.join(researchDistributionLedgerTrace, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8").replace(
      "| 840 qualified visits and 31 signups | SIG-001 |",
      "| 840 qualified visits and 31 signups | TRACE-002 |",
    );
    writeFileSync(researchPath, research, "utf8");
  }
  runFixture(
    "distribution proof can resolve to a stable ID in Source Ledger Artifact or trace",
    researchDistributionLedgerTrace,
    "check-research-evidence.ts",
    0,
  );

  const setSourceLedgerPlatform = (root: string, platform: string): void => {
    replaceResearchBlock(root, sourceLedgerProofLines, [
      sourceLedgerProofLines[0]!,
      sourceLedgerProofLines[1]!,
      sourceLedgerProofLines[2]!,
      sourceLedgerProofLines[3]!.replace("app-store estimate", platform),
    ]);
  };

  for (const [name, platform] of [
    ["blank", ""],
    ["placeholder", "n/a without reason"],
  ] as const) {
    const root = makeCompletedResearch(`research-source-ledger-${name}-platform`);
    setSourceLedgerPlatform(root, platform);
    runFixture(
      `a ${name} Source Ledger platform is incomplete but does not erase its valid observation date`,
      root,
      "check-research-evidence.ts",
      1,
      "research.source_ledger_row_missing",
      [],
      undefined,
      "research.no_dated_evidence",
    );
  }

  for (const [platformName, platform] of [
    ["blank", ""],
    ["placeholder", "n/a without reason"],
  ] as const) {
    const platformLedgerRows = [
      sourceLedgerProofLines[0]!,
      sourceLedgerProofLines[1]!,
      sourceLedgerProofLines[2]!,
      sourceLedgerProofLines[3]!
        .replace("appkittie category", "SOURCE-PLATFORM-VALID")
        .replace("strategy/RESEARCH.md / TRACE-002", "strategy/RESEARCH.md / TRACE-PLATFORM-VALID"),
      sourceLedgerProofLines[3]!
        .replace("app-store estimate", platform)
        .replace("appkittie category", "SOURCE-PLATFORM-INCOMPLETE")
        .replace("strategy/RESEARCH.md / TRACE-002", "strategy/RESEARCH.md / TRACE-PLATFORM-INCOMPLETE"),
    ];
    for (const [idName, evidenceId] of [
      ["source ID", "SOURCE-PLATFORM-INCOMPLETE"],
      ["trace ID", "TRACE-PLATFORM-INCOMPLETE"],
    ] as const) {
      const root = makeCompletedResearch(`research-source-ledger-${platformName}-platform-${idName.replace(/\s+/g, "-")}`);
      replaceResearchBlock(root, sourceLedgerProofLines, platformLedgerRows);
      replaceDistributionProof(root, [
        distributionProofLines[0]!,
        distributionProofLines[1]!,
        distributionProofLines[2]!,
        distributionProofLines[3]!.replace("SIG-001", evidenceId),
      ]);
      runFixture(
        `a ${platformName} Source Ledger platform cannot make its ${idName} eligible for Distribution Proof`,
        root,
        "check-research-evidence.ts",
        1,
        "research.distribution_proof_row_invalid",
      );
    }
  }

  const researchSourceSubstantivePlatform = makeCompletedResearch("research-source-ledger-substantive-platform");
  replaceResearchBlock(researchSourceSubstantivePlatform, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    sourceLedgerProofLines[1]!,
    sourceLedgerProofLines[2]!,
    sourceLedgerProofLines[3]!
      .replace("app-store estimate", "App Store category revenue estimate")
      .replace("appkittie category", "SOURCE-PLATFORM-SUBSTANTIVE")
      .replace("strategy/RESEARCH.md / TRACE-002", "strategy/RESEARCH.md / TRACE-PLATFORM-SUBSTANTIVE"),
  ]);
  replaceDistributionProof(researchSourceSubstantivePlatform, [
    distributionProofLines[0]!,
    distributionProofLines[1]!,
    distributionProofLines[2]!,
    distributionProofLines[3]!.replace("SIG-001", "SOURCE-PLATFORM-SUBSTANTIVE, TRACE-PLATFORM-SUBSTANTIVE"),
  ]);
  runFixture(
    "a substantive Source Ledger platform keeps its source and trace IDs eligible",
    researchSourceSubstantivePlatform,
    "check-research-evidence.ts",
    0,
  );

  const researchSourceFutureOnly = makeCompletedResearch("research-source-ledger-future-only");
  replaceResearchBlock(researchSourceFutureOnly, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    sourceLedgerProofLines[1]!,
    sourceLedgerProofLines[2]!,
    sourceLedgerProofLines[3]!.replace("2026-07-01T12:00:00Z", "2999-07-01T12:00:00Z"),
  ]);
  runFixture(
    "a future-only Source Ledger does not provide dated evidence",
    researchSourceFutureOnly,
    "check-research-evidence.ts",
    1,
    "research.no_dated_evidence",
  );
  runFixture(
    "a future-only Source Ledger does not provide a complete evidence row",
    researchSourceFutureOnly,
    "check-research-evidence.ts",
    1,
    "research.source_ledger_row_missing",
  );

  const futureLedgerRows = [
    sourceLedgerProofLines[0]!,
    sourceLedgerProofLines[1]!,
    sourceLedgerProofLines[2]!,
    sourceLedgerProofLines[3]!.replace("appkittie category", "SOURCE-PAST").replace("strategy/RESEARCH.md / TRACE-002", "strategy/RESEARCH.md / TRACE-PAST"),
    sourceLedgerProofLines[3]!
      .replace("appkittie category", "SOURCE-FUTURE")
      .replace("2026-07-01T12:00:00Z", "2999-07-01T12:00:00Z")
      .replace("strategy/RESEARCH.md / TRACE-002", "strategy/RESEARCH.md / TRACE-FUTURE"),
  ];
  for (const [name, evidenceId] of [
    ["source ID", "SOURCE-FUTURE"],
    ["trace ID", "TRACE-FUTURE"],
  ] as const) {
    const root = makeCompletedResearch(`research-source-ledger-future-${name.replace(/\s+/g, "-")}`);
    replaceResearchBlock(root, sourceLedgerProofLines, futureLedgerRows);
    replaceDistributionProof(root, [
      distributionProofLines[0]!,
      distributionProofLines[1]!,
      distributionProofLines[2]!,
      distributionProofLines[3]!.replace("SIG-001", evidenceId),
    ]);
    runFixture(
      `a future Source Ledger row cannot make its ${name} eligible for Distribution Proof`,
      root,
      "check-research-evidence.ts",
      1,
      "research.distribution_proof_row_invalid",
    );
  }

  const researchSourcePastOffset = makeCompletedResearch("research-source-ledger-past-offset");
  replaceResearchBlock(researchSourcePastOffset, sourceLedgerProofLines, [
    sourceLedgerProofLines[0]!,
    sourceLedgerProofLines[1]!,
    sourceLedgerProofLines[2]!,
    sourceLedgerProofLines[3]!.replace("appkittie category", "SOURCE-OFFSET").replace("2026-07-01T12:00:00Z", "2026-07-01T08:00:00-04:00"),
  ]);
  replaceDistributionProof(researchSourcePastOffset, [
    distributionProofLines[0]!,
    distributionProofLines[1]!,
    distributionProofLines[2]!,
    distributionProofLines[3]!.replace("SIG-001", "SOURCE-OFFSET"),
  ]);
  runFixture("a valid past Source Ledger offset timestamp remains eligible", researchSourcePastOffset, "check-research-evidence.ts", 0);

  for (const [name, timestamp] of [
    ["impossible calendar date", "2026-02-30T12:00:00Z"],
    ["24-hour clock rollover", "2026-07-01T24:00:00Z"],
  ] as const) {
    const root = makeCompletedResearch(`research-source-ledger-${name.replace(/\s+/g, "-")}`);
    replaceResearchBlock(root, sourceLedgerProofLines, [
      sourceLedgerProofLines[0]!,
      sourceLedgerProofLines[1]!,
      sourceLedgerProofLines[2]!,
      sourceLedgerProofLines[3]!.replace("2026-07-01T12:00:00Z", timestamp),
    ]);
    runFixture(`a Source Ledger ${name} is not dated evidence`, root, "check-research-evidence.ts", 1, "research.no_dated_evidence");
  }

  const researchDistributionUnresolved = makeCompletedResearch("research-distribution-unresolved-evidence");
  {
    const researchPath = path.join(researchDistributionUnresolved, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8").replace(
      "| 840 qualified visits and 31 signups | SIG-001 |",
      "| 840 qualified visits and 31 signups | SOURCE-999 |",
    );
    writeFileSync(researchPath, research, "utf8");
  }
  runFixture(
    "distribution evidence ID that resolves to neither ledger nor eligible signal fails",
    researchDistributionUnresolved,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_row_invalid",
  );

  const researchDistributionUnverified = makeCompletedResearch("research-distribution-unverified-signal");
  {
    const signalPath = path.join(researchDistributionUnverified, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8")
      .replace("| high | current | none | strategy/RESEARCH.md / TRACE-002 |", "| high | unverified | none | strategy/RESEARCH.md / TRACE-002 |")
      .replace("| SIG-001 is current | review sample supports it |", "| SIG-001 remains unverified | review sample needs confirmation |")
      .replace("| SIG-001 | PRODUCT.md | add streak recovery | TRACE-002 |", "");
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "an unverified signal cannot support Distribution Proof",
    researchDistributionUnverified,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_row_invalid",
  );

  const researchDistributionMissing = makeCompletedResearch("research-distribution-proof-row-missing");
  {
    const researchPath = path.join(researchDistributionMissing, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8").replace(
      "| people who lose habit streaks | r/habits | case-study post | email waitlist | 840 qualified visits and 31 signups | SIG-001 |",
      "",
    );
    writeFileSync(researchPath, research, "utf8");
  }
  runFixture(
    "distribution proof without an authored row fails",
    researchDistributionMissing,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_row_invalid",
  );

  const researchDistributionGeneric = makeCompletedResearch("research-distribution-proof-generic");
  {
    const researchPath = path.join(researchDistributionGeneric, "strategy/RESEARCH.md");
    const research = readFileSync(researchPath, "utf8").replace(
      "| people who lose habit streaks | r/habits | case-study post | email waitlist | 840 qualified visits and 31 signups | SIG-001 |",
      "| general consumers | social media | posts | website | looks promising | maybe |",
    );
    writeFileSync(researchPath, research, "utf8");
  }
  runFixture(
    "generic distribution prose without a measured signal or evidence ID fails",
    researchDistributionGeneric,
    "check-research-evidence.ts",
    1,
    "research.distribution_proof_row_invalid",
  );

  const researchOfferNoMeasurement = makeCompletedResearch("research-offer-test-no-measurement");
  {
    const offerPath = path.join(researchOfferNoMeasurement, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "run offer test without exposure and conversion evidence fails",
    researchOfferNoMeasurement,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferBlankConversion = makeCompletedResearch("research-offer-test-blank-conversion");
  {
    const offerPath = path.join(researchOfferBlankConversion, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | | 3.69% | 0 | continue |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "run offer test with a blank CTA conversion count fails",
    researchOfferBlankConversion,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  for (const [name, date, label] of [
    ["impossible-date", "2026-99-99", "an impossible calendar date"],
    ["future-date", "2999-01-01", "a future date"],
    ["missing-date", "", "a missing date"],
  ] as const) {
    const root = makeCompletedResearch(`research-offer-test-measurement-${name}`);
    const offerPath = path.join(root, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      `| ${date} | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |`,
    );
    writeFileSync(offerPath, offer, "utf8");
    runFixture(`run offer test rejects measurement evidence with ${label}`, root, "check-research-evidence.ts", 1, "research.offer_test_measurement_missing");
  }

  const researchOfferFractionalConversion = makeCompletedResearch("research-offer-test-fractional-conversion");
  {
    const offerPath = path.join(researchOfferFractionalConversion, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31.5 | 3.75% | 0 | continue |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "run offer test rejects a fractional CTA conversion count",
    researchOfferFractionalConversion,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferFractionalExposure = makeCompletedResearch("research-offer-test-fractional-exposure");
  {
    const offerPath = path.join(researchOfferFractionalExposure, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840.5 | 31 | 3.69% | 0 | continue |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "run offer test rejects fractional measured exposure",
    researchOfferFractionalExposure,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferOverExposure = makeCompletedResearch("research-offer-test-over-exposure");
  {
    const offerPath = path.join(researchOfferOverExposure, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 1 | 2 | 200% | 0 | continue |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "run offer test rejects conversions above measured exposure",
    researchOfferOverExposure,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferZeroConversions = makeCompletedResearch("research-offer-test-zero-conversions");
  {
    const offerPath = path.join(researchOfferZeroConversions, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 0 | 0% | 0 | stop |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture("run offer test accepts zero conversions from positive whole-number exposure", researchOfferZeroConversions, "check-research-evidence.ts", 0);

  const researchOfferMalformedLaterMeasurement = makeCompletedResearch("research-offer-test-malformed-later-measurement");
  {
    const offerPath = path.join(researchOfferMalformedLaterMeasurement, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
      "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |\n" +
        "| 2026-07-21 | Reddit | follow-up cohort TRACE-004 | qualified visits | 20 | 21 | 105% | 0 | stop |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "a valid exposure row cannot hide a malformed later declared row",
    researchOfferMalformedLaterMeasurement,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferMissingConversionColumn = makeCompletedResearch("research-offer-test-missing-conversion-column");
  {
    const offerPath = path.join(researchOfferMissingConversionColumn, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(" | CTA conversions", "").replace(" | 31 | 3.69%", " | 3.69%");
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "run offer test without a CTA conversion column fails",
    researchOfferMissingConversionColumn,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferImpossibleDecisionDate = makeCompletedResearch("research-offer-test-impossible-decision-date");
  {
    const offerPath = path.join(researchOfferImpossibleDecisionDate, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "| run | 2026-99-99 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "offer-test decision rejects an impossible calendar date",
    researchOfferImpossibleDecisionDate,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_incomplete",
  );

  const researchOfferFutureDecisionDate = makeCompletedResearch("research-offer-test-future-decision-date");
  {
    const offerPath = path.join(researchOfferFutureDecisionDate, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "| run | 2999-01-01 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "offer-test decision rejects a future calendar date",
    researchOfferFutureDecisionDate,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_incomplete",
  );

  const researchOfferMalformedLaterDecision = makeCompletedResearch("research-offer-test-malformed-later-decision");
  {
    const offerPath = path.join(researchOfferMalformedLaterDecision, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |\n" +
        "| pending | 2026-07-22 | follow-up cohort TRACE-004 | keep collecting evidence | founder |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "an older valid offer decision cannot hide a malformed later declared decision",
    researchOfferMalformedLaterDecision,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_incomplete",
  );

  const researchOfferCommentedDecision = makeCompletedResearch("research-offer-test-commented-decision");
  {
    const offerPath = path.join(researchOfferCommentedDecision, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "## Decision\n| Status | Date | Evidence | Decision | Decided by |\n| --- | --- | --- | --- | --- |\n| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "<!--\n## Decision\n| Status | Date | Evidence | Decision | Decided by |\n| --- | --- | --- | --- | --- |\n| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |\n-->",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "an HTML-commented Decision section cannot satisfy the offer-test contract",
    researchOfferCommentedDecision,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_missing",
  );

  const researchOfferCommentedDecisionAfterClosedComment = makeCompletedResearch("research-offer-test-commented-decision-after-closed-comment");
  {
    const offerPath = path.join(researchOfferCommentedDecisionAfterClosedComment, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "## Decision\n| Status | Date | Evidence | Decision | Decided by |\n| --- | --- | --- | --- | --- |\n| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "<!-- prior note --> <!--\n## Decision\n| Status | Date | Evidence | Decision | Decided by |\n| --- | --- | --- | --- | --- |\n| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |\n-->",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "a second HTML-comment opener on one line still hides the following Decision section",
    researchOfferCommentedDecisionAfterClosedComment,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_missing",
  );

  const researchOfferInvalidDecisionAndExposure = makeCompletedResearch("research-offer-test-invalid-decision-and-exposure");
  {
    const offerPath = path.join(researchOfferInvalidDecisionAndExposure, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
        "| 2999-01-01 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 841 | 100.1% | 0 | continue |",
      )
      .replace(
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| pending | 2999-01-01 | TODO | TODO | founder |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "a malformed Decision does not suppress a malformed declared Exposure row",
    researchOfferInvalidDecisionAndExposure,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_incomplete",
  );
  runFixture(
    "a malformed declared Exposure row is still reported when Decision is malformed",
    researchOfferInvalidDecisionAndExposure,
    "check-research-evidence.ts",
    1,
    "research.offer_test_measurement_missing",
  );

  const researchOfferStarterContract = makeCompletedResearch("research-offer-test-starter-contract");
  {
    const offerPath = path.join(researchOfferStarterContract, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace("| Audience | people who repeatedly abandon habit streaks |", "| Audience | replace with audience |");
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "measured offer evidence cannot hide a starter Test Contract",
    researchOfferStarterContract,
    "check-research-evidence.ts",
    1,
    "research.offer_test_contract_incomplete",
  );

  const researchOfferOptionMenu = makeCompletedResearch("research-offer-test-option-menu");
  {
    const offerPath = path.join(researchOfferOptionMenu, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| Owned relationship | email waitlist |",
        "| Owned relationship | email, account, push permission, direct community, or not applicable with reason |",
      )
      .replace("| Primary response | waitlist signup |", "| Primary response | sign-up, deposit, purchase, booked call, or another named action |");
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "generic option menus do not complete the offer Test Contract",
    researchOfferOptionMenu,
    "check-research-evidence.ts",
    1,
    "research.offer_test_contract_incomplete",
  );

  for (const [name, primaryResponse] of [
    ["likes", "likes"],
    ["like-singular", "like"],
    ["counted-likes", "20 likes"],
    ["plus-counted-likes", "20+ likes"],
    ["compact-counted-likes", "20k likes"],
    ["grouped-counted-likes", "1,000,000 likes"],
    ["likes-decorated", "likes on the launch post"],
    ["compliments", "compliments"],
    ["compliment-singular", "compliment"],
    ["compliments-decorated", "compliments from respondents"],
    ["survey-interest", "survey interest"],
    ["general-survey-interest", "general survey interest"],
    ["survey-interest-counted", "75% survey interest"],
    ["case-varied", "LIKES"],
    ["spacing-varied", "general  survey interest"],
    ["bold", "**compliments**"],
    ["inline-code", "`survey interest`"],
    ["empty-inline-code", "``"],
  ] as const) {
    const root = makeCompletedResearch(`research-offer-test-primary-response-${name}`);
    const offerPath = path.join(root, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace("| Primary response | waitlist signup |", `| Primary response | ${primaryResponse} |`);
    writeFileSync(offerPath, offer, "utf8");
    runFixture(
      `offer Test Contract rejects the vanity Primary response value ${primaryResponse}`,
      root,
      "check-research-evidence.ts",
      1,
      "research.offer_test_contract_incomplete",
    );
  }

  for (const [name, primaryResponse] of [
    ["signup", "waitlist signup"],
    ["deposit", "paid deposit"],
    ["purchase", "completed purchase"],
    ["booked-call", "booked call"],
    ["qualified-application", "qualified application"],
    ["account-activation", "completed account activation"],
    ["bold-signup", "**waitlist signup**"],
    ["inline-code-signup", "`waitlist signup`"],
    ["signup-not-likes", "waitlist signup, not likes"],
    ["complimentary-signup", "complimentary beta signup"],
    ["like-minded-referral", "like-minded member referral"],
  ] as const) {
    const root = makeCompletedResearch(`research-offer-test-behavioral-response-${name}`);
    const offerPath = path.join(root, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace("| Primary response | waitlist signup |", `| Primary response | ${primaryResponse} |`);
    writeFileSync(offerPath, offer, "utf8");
    runFixture(`offer Test Contract accepts the behavioral Primary response value ${primaryResponse}`, root, "check-research-evidence.ts", 0);
  }

  const researchWorkflowVanityResponse = makeCompletedResearch("research-workflow-vanity-primary-response");
  {
    const state = readState(researchWorkflowVanityResponse);
    getLane(state, "research")["status"] = "pending";
    writeState(researchWorkflowVanityResponse, state);
    const offerPath = path.join(researchWorkflowVanityResponse, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace("| Primary response | waitlist signup |", "| Primary response | likes |");
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "claimed research workflow rejects likes as the Primary response while the lane is not started",
    researchWorkflowVanityResponse,
    "check-research-evidence.ts",
    1,
    "research.offer_test_contract_incomplete",
    ["--require-workflow-outputs"],
  );

  for (const [name, ownedRelationship] of [
    ["none", "none"],
    ["n-a", "n/a"],
    ["not-applicable", "not applicable"],
    ["unknown", "unknown"],
    ["no-owned-route", "no owned route"],
    ["no-owned-relationship", "no owned relationship"],
    ["not-applicable-spaced", "not  applicable — no account access"],
    ["not-applicable-formatted", "**not applicable**"],
    ["empty-inline-code", "``"],
    ["not-applicable-decorated", "not applicable — no account access"],
    ["none-available", "none available"],
  ] as const) {
    const root = makeCompletedResearch(`research-offer-test-owned-relationship-${name}`);
    const offerPath = path.join(root, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace("| Owned relationship | email waitlist |", `| Owned relationship | ${ownedRelationship} |`);
    writeFileSync(offerPath, offer, "utf8");
    runFixture(
      `offer Test Contract rejects the absent Owned relationship value ${ownedRelationship}`,
      root,
      "check-research-evidence.ts",
      1,
      "research.offer_test_contract_incomplete",
    );
  }

  for (const [name, ownedRelationship] of [
    ["email", "email waitlist"],
    ["formatted-email", "**email waitlist**"],
    ["inline-code-email", "`email waitlist`"],
    ["account", "member account"],
    ["push", "push notification permission"],
    ["community", "private member community"],
  ] as const) {
    const root = makeCompletedResearch(`research-offer-test-owned-relationship-${name}`);
    const offerPath = path.join(root, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace("| Owned relationship | email waitlist |", `| Owned relationship | ${ownedRelationship} |`);
    writeFileSync(offerPath, offer, "utf8");
    runFixture(`offer Test Contract accepts the durable Owned relationship route ${ownedRelationship}`, root, "check-research-evidence.ts", 0);
  }

  const researchOfferDuplicateContractField = makeCompletedResearch("research-offer-test-duplicate-contract-field");
  {
    const offerPath = path.join(researchOfferDuplicateContractField, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| Stop rule | 1,000 qualified visits |",
      "| Stop rule | 1,000 qualified visits |\n| Audience | people recovering from a recently broken habit streak |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "duplicate Test Contract fields fail instead of silently overwriting an earlier value",
    researchOfferDuplicateContractField,
    "check-research-evidence.ts",
    1,
    "research.offer_test_contract_incomplete",
  );

  const researchOfferWaived = makeCompletedResearch("research-offer-test-waived");
  {
    const offerPath = path.join(researchOfferWaived, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |",
      )
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |\n| 2026-07-21 | founder | no public account access before decision date | audience and message remain untested |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture("dated founder offer-test waiver passes", researchOfferWaived, "check-research-evidence.ts", 0);

  const makeWaivedOfferFixture = (name: string, decisionRows: readonly string[], waiverRows: readonly string[]): string => {
    const root = makeCompletedResearch(name);
    const offerPath = path.join(root, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace("| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |", decisionRows.join("\n"))
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        ["## Founder Waiver", "| Date | Founder | Reason | Residual risk accepted |", "| --- | --- | --- | --- |", ...waiverRows].join("\n"),
      );
    writeFileSync(offerPath, offer, "utf8");
    return root;
  };

  for (const [name, reason, risk] of [
    ["reason-none", "none", "audience and message remain untested"],
    ["reason-na", "n/a", "audience and message remain untested"],
    ["reason-not-applicable", "not applicable", "audience and message remain untested"],
    ["reason-italic", "*none*", "audience and message remain untested"],
    ["reason-spaced-na", "n / a", "audience and message remain untested"],
    ["reason-dotted-na", "N.A.", "audience and message remain untested"],
    ["risk-none", "no public account access before decision date", "none"],
    ["risk-na", "no public account access before decision date", "n/a"],
  ] as const) {
    const root = makeWaivedOfferFixture(
      `research-offer-test-waiver-empty-${name}`,
      ["| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |"],
      [`| 2026-07-21 | founder | ${reason} | ${risk} |`],
    );
    runFixture(
      `a waived offer test rejects empty-equivalent waiver field ${name}`,
      root,
      "check-research-evidence.ts",
      1,
      "research.offer_test_waiver_missing",
    );
  }

  const researchOfferWaiverStaleDifferentActor = makeWaivedOfferFixture(
    "research-offer-test-waiver-stale-different-actor",
    ["| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | Daisy Rivera owner |"],
    ["| 2026-07-20 | founder | earlier acquisition constraint | earlier audience risk |"],
  );
  runFixture(
    "a stale waiver by a different founder cannot authorize the final waived decision",
    researchOfferWaiverStaleDifferentActor,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );
  h.runScriptArgs(
    "waiver date and actor mismatch reports a targeted JSON repair hint",
    "check-research-evidence.ts",
    ["--root", researchOfferWaiverStaleDifferentActor, "--json"],
    1,
    '"fixHint":"Add or correct one waiver row whose Date and Founder normalize to the final Decision row\'s Date and Decided by values."',
  );

  const researchOfferWaiverWrongActor = makeWaivedOfferFixture(
    "research-offer-test-waiver-wrong-actor",
    ["| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | Daisy Rivera owner |"],
    ["| 2026-07-21 | founder | no public account access before decision date | audience and message remain untested |"],
  );
  runFixture(
    "a waiver on the final decision date must name the final decision-maker",
    researchOfferWaiverWrongActor,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );

  const researchOfferWaiverWrongDate = makeWaivedOfferFixture(
    "research-offer-test-waiver-wrong-date",
    ["| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |"],
    ["| 2026-07-20 | founder | no public account access before decision date | audience and message remain untested |"],
  );
  runFixture(
    "a waiver by the final decision-maker must match the final decision date",
    researchOfferWaiverWrongDate,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );

  const researchOfferWaiverHistoricalAndFinal = makeWaivedOfferFixture(
    "research-offer-test-waiver-historical-and-final",
    [
      "| run | 2026-07-20 | 840 visits and 31 signups in TRACE-003 | continue the measured offer | founder |",
      "| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | Daisy Rivera owner |",
    ],
    [
      "| 2026-07-20 | founder | earlier acquisition constraint | earlier audience risk |",
      "| 2026-07-21 | Daisy Rivera owner | no public account access before decision date | audience and message remain untested |",
    ],
  );
  runFixture(
    "historical waiver rows remain valid when one complete row matches the final decision",
    researchOfferWaiverHistoricalAndFinal,
    "check-research-evidence.ts",
    0,
  );

  const researchOfferWaiverNormalizedActor = makeWaivedOfferFixture(
    "research-offer-test-waiver-normalized-actor",
    ["| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | Daisy Rivera Owner |"],
    ["| 2026-07-21 | dAiSy   rIvErA   oWnEr | no public account access before decision date | audience and message remain untested |"],
  );
  runFixture("waiver actor matching ignores case and repeated whitespace only", researchOfferWaiverNormalizedActor, "check-research-evidence.ts", 0);

  const researchOfferWaiverFounderOwnerAlias = makeWaivedOfferFixture(
    "research-offer-test-waiver-founder-owner-alias",
    ["| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |"],
    ["| 2026-07-21 | owner | no public account access before decision date | audience and message remain untested |"],
  );
  runFixture(
    "founder and owner are valid roles but not interchangeable waiver actors",
    researchOfferWaiverFounderOwnerAlias,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );

  const researchOfferWaiverImpossibleDate = makeCompletedResearch("research-offer-test-waiver-impossible-date");
  {
    const offerPath = path.join(researchOfferWaiverImpossibleDate, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |",
      )
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |\n| 2026-99-99 | founder | no public account access before decision date | audience and message remain untested |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "founder offer-test waiver rejects an impossible calendar date",
    researchOfferWaiverImpossibleDate,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );

  const researchOfferWaiverMalformedLater = makeCompletedResearch("research-offer-test-waiver-malformed-later-row");
  {
    const offerPath = path.join(researchOfferWaiverMalformedLater, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |",
      )
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |\n" +
          "| 2026-07-21 | founder | no public account access before decision date | audience and message remain untested |\n" +
          "| 2999-01-01 | founder | follow-up waiver | future risk acceptance |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "a valid founder waiver cannot hide a malformed later declared waiver",
    researchOfferWaiverMalformedLater,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );

  const researchOfferReorderedExtendedColumns = makeCompletedResearch("research-offer-test-reordered-extended-columns");
  {
    const offerPath = path.join(researchOfferReorderedExtendedColumns, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace("| Field | Value |\n| --- | --- |", "| Value | Project note | Field |\n| --- | --- | --- |")
      .replace(
        /^\| ([^|]+) \| ([^|]+) \|$/gm,
        (_row, field: string, fieldValue: string) => `| ${fieldValue.trim()} | verified in this project | ${field.trim()} |`,
      )
      .replace(
        "| Date | Channel | Evidence source | Exposure type | Exposure | CTA conversions | Conversion rate | Cost | Result |\n" +
          "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |\n" +
          "| 2026-07-20 | Reddit | PostHog test cohort TRACE-003 | qualified visits | 840 | 31 | 3.69% | 0 | continue |",
        "| Channel | Date | Result | Evidence source | Exposure | CTA conversions | Exposure type | Conversion rate | Cost | Project note |\n" +
          "| --- | --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- |\n" +
          "| Reddit | 2026-07-20 | continue | PostHog test cohort TRACE-003 | 840 | 31 | qualified visits | 3.69% | 0 | verified in this project |",
      )
      .replace(
        "| Status | Date | Evidence | Decision | Decided by |\n| --- | --- | --- | --- | --- |\n| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| Decided by | Evidence | Status | Decision | Date | Project note |\n| --- | --- | --- | --- | --- | --- |\n| founder | founder waiver WAIVER-001 | waived | proceed with explicit acquisition risk | 2026-07-21 | verified in this project |",
      )
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        "## Founder Waiver\n| Reason | Date | Project note | Residual risk accepted | Founder |\n| --- | --- | --- | --- | --- |\n" +
          "| no public account access before decision date | 2026-07-21 | verified in this project | audience and message remain untested | founder |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "offer-test tables resolve required columns by name while allowing reordering and project-specific extensions",
    researchOfferReorderedExtendedColumns,
    "check-research-evidence.ts",
    0,
  );

  const researchOfferRecordedOwner = makeCompletedResearch("research-offer-test-recorded-owner");
  {
    const state = readState(researchOfferRecordedOwner);
    expectRecord(state.project, "project")["owner"] = "Daisy Rivera";
    writeState(researchOfferRecordedOwner, state);
    const offerPath = path.join(researchOfferRecordedOwner, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | Daisy Rivera |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture("offer-test decision by the recorded project owner name passes", researchOfferRecordedOwner, "check-research-evidence.ts", 0);

  const researchOfferWaivedRecordedOwner = makeCompletedResearch("research-offer-test-waived-recorded-owner");
  {
    const state = readState(researchOfferWaivedRecordedOwner);
    expectRecord(state.project, "project")["owner"] = "Daisy Rivera";
    writeState(researchOfferWaivedRecordedOwner, state);
    const offerPath = path.join(researchOfferWaivedRecordedOwner, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | Daisy Rivera |",
      )
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |\n| 2026-07-21 | Daisy Rivera | no public account access before decision date | audience and message remain untested |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "waived offer-test decision and founder waiver by the recorded project owner name pass",
    researchOfferWaivedRecordedOwner,
    "check-research-evidence.ts",
    0,
  );

  const researchOfferAutomationOwner = makeCompletedResearch("research-offer-test-automation-owner");
  {
    const state = readState(researchOfferAutomationOwner);
    expectRecord(state.project, "project")["owner"] = "AI owner agent";
    writeState(researchOfferAutomationOwner, state);
    const offerPath = path.join(researchOfferAutomationOwner, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8").replace(
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
      "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | AI owner agent |",
    );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "offer-test decision by an automation identity recorded as project owner fails",
    researchOfferAutomationOwner,
    "check-research-evidence.ts",
    1,
    "research.offer_test_decision_incomplete",
  );

  const researchOfferWaivedAutomationOwner = makeCompletedResearch("research-offer-test-waived-automation-owner");
  {
    const state = readState(researchOfferWaivedAutomationOwner);
    expectRecord(state.project, "project")["owner"] = "AI owner agent";
    writeState(researchOfferWaivedAutomationOwner, state);
    const offerPath = path.join(researchOfferWaivedAutomationOwner, "strategy/OFFER_TEST.md");
    const offer = readFileSync(offerPath, "utf8")
      .replace(
        "| run | 2026-07-21 | 840 visits and 31 signups in TRACE-003 | use the recovery offer | founder |",
        "| waived | 2026-07-21 | founder waiver WAIVER-001 | proceed with explicit acquisition risk | founder |",
      )
      .replace(
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |",
        "## Founder Waiver\n| Date | Founder | Reason | Residual risk accepted |\n| --- | --- | --- | --- |\n| 2026-07-21 | AI owner agent | no public account access before decision date | audience and message remain untested |",
      );
    writeFileSync(offerPath, offer, "utf8");
  }
  runFixture(
    "waived offer test rejects an automation identity in the founder waiver",
    researchOfferWaivedAutomationOwner,
    "check-research-evidence.ts",
    1,
    "research.offer_test_waiver_missing",
  );

  const researchSignalNotApplicableWithReason = makeCompletedResearch("research-signal-corpus-not-applicable-with-reason");
  useSourceLedgerDistribution(researchSignalNotApplicableWithReason);
  writeFileSync(
    path.join(researchSignalNotApplicableWithReason, "strategy/SIGNAL_CORPUS.md"),
    "# Signal Corpus\nStatus: not applicable — No reusable customer-language source material exists for this project.\n",
    "utf8",
  );
  runFixture("signal corpus marked not applicable with an authored reason passes", researchSignalNotApplicableWithReason, "check-research-evidence.ts", 0);

  const researchSignalNotApplicableScriptBlock = makeCompletedResearch("research-signal-corpus-not-applicable-script-block");
  useSourceLedgerDistribution(researchSignalNotApplicableScriptBlock);
  writeFileSync(
    path.join(researchSignalNotApplicableScriptBlock, "strategy/SIGNAL_CORPUS.md"),
    [
      '<script type="text/plain">',
      "# Signal Corpus",
      "Status: not applicable — No reusable customer-language source material exists for this project.",
      "</script>",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a Signal Corpus heading and not-applicable status inside raw HTML cannot exempt missing rendered evidence",
    researchSignalNotApplicableScriptBlock,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_corpus_inputs_missing",
  );

  for (const [name, fence] of [
    ["backtick", "```"],
    ["tilde", "~~~"],
  ] as const) {
    const root = makeCompletedResearch(`research-signal-corpus-not-applicable-${name}-fence`);
    useSourceLedgerDistribution(root);
    writeFileSync(
      path.join(root, "strategy/SIGNAL_CORPUS.md"),
      ["# Signal Corpus", fence, "Status: not applicable — No reusable customer-language source material exists for this project.", fence, ""].join("\n"),
      "utf8",
    );
    runFixture(
      `a not-applicable status inside a ${name} fence cannot exempt Signal Corpus`,
      root,
      "check-research-evidence.ts",
      1,
      "research.signal_corpus_corpus_inputs_missing",
    );
  }

  const researchSignalDuplicateStatus = makeCompletedResearch("research-signal-corpus-duplicate-status");
  useSourceLedgerDistribution(researchSignalDuplicateStatus);
  writeFileSync(
    path.join(researchSignalDuplicateStatus, "strategy/SIGNAL_CORPUS.md"),
    ["# Signal Corpus", "Status: not applicable — No reusable customer-language source material exists for this project.", "Status: current", ""].join("\n"),
    "utf8",
  );
  runFixture(
    "duplicate rendered Signal Corpus statuses cannot preserve a not-applicable exemption",
    researchSignalDuplicateStatus,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_corpus_inputs_missing",
  );

  const researchSignalMalformedSiblingStatus = makeCompletedResearch("research-signal-corpus-malformed-sibling-status");
  useSourceLedgerDistribution(researchSignalMalformedSiblingStatus);
  writeFileSync(
    path.join(researchSignalMalformedSiblingStatus, "strategy/SIGNAL_CORPUS.md"),
    [
      "# Signal Corpus",
      "Status: not applicable — No reusable customer-language source material exists for this project.",
      "Status not applicable — copied prose is not a status declaration.",
      "",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "a malformed rendered Signal Corpus status invalidates a sibling not-applicable exemption",
    researchSignalMalformedSiblingStatus,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_corpus_inputs_missing",
  );

  const researchSignalSectionLocalStatus = makeCompletedResearch("research-signal-corpus-section-local-status");
  useSourceLedgerDistribution(researchSignalSectionLocalStatus);
  writeFileSync(
    path.join(researchSignalSectionLocalStatus, "strategy/SIGNAL_CORPUS.md"),
    ["# Signal Corpus", "## Notes", "Status: not applicable — No reusable customer-language source material exists for this project.", ""].join("\n"),
    "utf8",
  );
  runFixture(
    "a section-local Signal Corpus status cannot act as the top-level exemption",
    researchSignalSectionLocalStatus,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_corpus_inputs_missing",
  );

  const researchSignalNotApplicableWithRows = makeCompletedResearch("research-signal-corpus-not-applicable-with-rows");
  useSourceLedgerDistribution(researchSignalNotApplicableWithRows);
  {
    const signalPath = path.join(researchSignalNotApplicableWithRows, "strategy/SIGNAL_CORPUS.md");
    const signal = readFileSync(signalPath, "utf8").replace(
      "# Signal Corpus",
      "# Signal Corpus\nStatus: not applicable — No reusable customer-language source material exists for this project.",
    );
    writeFileSync(signalPath, signal, "utf8");
  }
  runFixture(
    "not-applicable signal corpus cannot retain starter or evidence rows",
    researchSignalNotApplicableWithRows,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_not_applicable_rows_present",
  );

  const researchSignalNotApplicableBare = makeCompletedResearch("research-signal-corpus-not-applicable-bare");
  useSourceLedgerDistribution(researchSignalNotApplicableBare);
  writeFileSync(path.join(researchSignalNotApplicableBare, "strategy/SIGNAL_CORPUS.md"), "# Signal Corpus\nStatus: not applicable\n", "utf8");
  runFixture(
    "signal corpus marked not applicable without an authored reason fails",
    researchSignalNotApplicableBare,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_not_applicable_reason_missing",
  );

  for (const [name, reason] of [
    ["none", "none"],
    ["n-a", "n/a"],
    ["not-applicable", "not applicable"],
    ["unknown", "unknown"],
    ["no-reason", "no reason"],
    ["no-reason-spaced", "no  reason"],
    ["none-formatted", "**none**"],
    ["empty-inline-code", "``"],
    ["none-italic", "*none*"],
    ["na-spaced", "n / a"],
    ["na-dotted", "N.A."],
  ] as const) {
    const root = makeCompletedResearch(`research-signal-corpus-not-applicable-reason-${name}`);
    useSourceLedgerDistribution(root);
    writeFileSync(path.join(root, "strategy/SIGNAL_CORPUS.md"), `# Signal Corpus\nStatus: not applicable — ${reason}\n`, "utf8");
    runFixture(
      `signal corpus rejects the empty-equivalent not-applicable reason ${reason}`,
      root,
      "check-research-evidence.ts",
      1,
      "research.signal_corpus_not_applicable_reason_missing",
    );
  }

  const researchSignalNotApplicableFormattedReason = makeCompletedResearch("research-signal-corpus-not-applicable-formatted-reason");
  useSourceLedgerDistribution(researchSignalNotApplicableFormattedReason);
  writeFileSync(
    path.join(researchSignalNotApplicableFormattedReason, "strategy/SIGNAL_CORPUS.md"),
    "# Signal Corpus\nStatus: not applicable — **No reusable customer-language source material exists for this project.**\n",
    "utf8",
  );
  runFixture(
    "signal corpus accepts a substantive formatted not-applicable reason",
    researchSignalNotApplicableFormattedReason,
    "check-research-evidence.ts",
    0,
  );

  const researchSignalNotApplicableLiteralReason = makeCompletedResearch("research-signal-corpus-not-applicable-literal-reason");
  useSourceLedgerDistribution(researchSignalNotApplicableLiteralReason);
  writeFileSync(
    path.join(researchSignalNotApplicableLiteralReason, "strategy/SIGNAL_CORPUS.md"),
    "# Signal Corpus\nStatus: not applicable — authored reason\n",
    "utf8",
  );
  runFixture(
    "literal authored-reason instruction is not a real not-applicable reason",
    researchSignalNotApplicableLiteralReason,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_not_applicable_reason_missing",
  );

  const researchSignalNotApplicableAngleReason = makeCompletedResearch("research-signal-corpus-not-applicable-angle-reason");
  useSourceLedgerDistribution(researchSignalNotApplicableAngleReason);
  writeFileSync(
    path.join(researchSignalNotApplicableAngleReason, "strategy/SIGNAL_CORPUS.md"),
    "# Signal Corpus\nStatus: not applicable — <authored reason>\n",
    "utf8",
  );
  runFixture(
    "angle-bracket authored-reason instruction is not a real not-applicable reason",
    researchSignalNotApplicableAngleReason,
    "check-research-evidence.ts",
    1,
    "research.signal_corpus_not_applicable_reason_missing",
  );

  // Pre-build kill gate: the sections the 2026-07-26 audit found missing —
  // research that never converts evidence into a build-or-not decision.
  const researchNoVerdictSection = makeFixture("research-done-no-verdict-section");
  setLaneDone(researchNoVerdictSection, "research", ["strategy/RESEARCH.md"]);
  writeResearch(researchNoVerdictSection, researchCoreSections);
  runFixture(
    "done research without the go-pivot-kill section fails",
    researchNoVerdictSection,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_or_kill.missing",
  );

  const researchVerdictRowMissing = makeFixture("research-done-verdict-row-missing");
  setLaneDone(researchVerdictRowMissing, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchVerdictRowMissing);
  writeResearch(researchVerdictRowMissing, [...researchCoreSections, ...categoryRevenueSection(revenueRow), ...goPivotKillSection(null)]);
  runFixture(
    "done research with an empty verdict table fails",
    researchVerdictRowMissing,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_row_missing",
  );

  // A done research lane whose latest verdict is Kill or Pivot is a
  // contradiction: Kill winds down pre-build, Pivot re-enters the phase.
  const researchNotGo = makeFixture("research-done-not-go");
  setLaneDone(researchNotGo, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchNotGo);
  writeResearch(researchNotGo, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(
      "| 2026-07-21 | fail — $180K top-10 | no defensible wedge found | no demand signal | no reachable channel | zero of 200 visitors responded | Kill | founder |",
    ),
  ]);
  runFixture("done research whose latest verdict is Kill fails", researchNotGo, "check-research-evidence.ts", 1, "research.go_pivot_kill_not_go");

  const researchV2OpeningMandate = makeCompletedResearch("research-v2-opening-mandate");
  writeResearch(researchV2OpeningMandate, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(
      "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance wedge | 412-person waitlist | r/habits reached 840 visits | 31 visitors joined | Go | Founder opening mandate |",
    ),
  ]);
  replaceWithBusinessStateV2(researchV2OpeningMandate, "Daisy Rivera");
  runFixture("research accepts the exact founder opening mandate", researchV2OpeningMandate, "check-research-evidence.ts", 0, undefined, [
    "--state",
    "state/business-state.json",
  ]);

  const researchV2AgentDecider = makeCompletedResearch("research-v2-agent-decider");
  writeResearch(researchV2AgentDecider, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(
      "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance wedge | 412-person waitlist | r/habits reached 840 visits | 31 visitors joined | Go | Research agent |",
    ),
  ]);
  replaceWithBusinessStateV2(researchV2AgentDecider, "Research agent");
  runFixture(
    "strict v2 research rejects an arbitrary agent label even when it matches project.owner",
    researchV2AgentDecider,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_decider_missing",
    ["--state", "state/business-state.json"],
  );

  const researchRevenueRowMissing = makeFixture("research-done-revenue-row-missing");
  setLaneDone(researchRevenueRowMissing, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchRevenueRowMissing);
  writeResearch(researchRevenueRowMissing, [...researchCoreSections, ...categoryRevenueSection(null), ...goPivotKillSection(goRow)]);
  runFixture(
    "done research without a real category revenue row fails",
    researchRevenueRowMissing,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_row_missing",
  );

  // A dollar amount drifting outside the revenue column, or a blank source,
  // is data-shaped text rather than a sourced estimate.
  const researchRevenueUnsourced = makeFixture("research-done-revenue-unsourced");
  setLaneDone(researchRevenueUnsourced, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchRevenueUnsourced);
  writeResearch(researchRevenueUnsourced, [
    ...researchCoreSections,
    ...categoryRevenueSection("| 1 | HabitKit ($2.4M/yr claimed) | strong | |"),
    ...goPivotKillSection(goRow),
  ]);
  runFixture(
    "revenue estimate outside its column with a blank source fails",
    researchRevenueUnsourced,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_row_missing",
  );

  // The gate is founder-only: a Go row naming no decision-maker is the agent
  // deciding to build for itself.
  const researchNoDecider = makeFixture("research-done-no-decider");
  setLaneDone(researchNoDecider, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchNoDecider);
  writeResearch(researchNoDecider, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(
      "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance wedge | 412-person waitlist | r/habits reached 840 visits | 31 visitors joined | Go | |",
    ),
  ]);
  runFixture("Go verdict with an empty decided-by cell fails", researchNoDecider, "check-research-evidence.ts", 1, "research.go_pivot_kill_decider_missing");

  // The gate fires the moment downstream design work becomes active, whatever
  // the recorded phase says.
  const researchDesignActive = makeFixture("research-phase1-design-active");
  {
    const state = readState(researchDesignActive);
    const research = getLane(state, "research");
    research["status"] = "running";
    const design = getLane(state, "design");
    design["status"] = "running";
    design["evidence"] = ["DESIGN.md"];
    writeState(researchDesignActive, state);
  }
  runFixture(
    "active design work at phase_1 with no verdict fails the gate",
    researchDesignActive,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_row_missing",
  );

  // A malformed later decision must never silently lose to an older one.
  const researchMalformedFollowup = makeFixture("research-done-malformed-followup");
  setLaneDone(researchMalformedFollowup, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchMalformedFollowup);
  writeResearch(researchMalformedFollowup, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(goRow),
    "| 07/22/2026 | fail on re-read | wedge collapsed | waitlist bot-inflated | channel traffic was bots | offer response was invalid | Kill | founder |",
  ]);
  runFixture(
    "mistyped date on a follow-up verdict row fails instead of being dropped",
    researchMalformedFollowup,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_row_malformed",
  );

  // The decision-maker reads from the named column: a Notes cell after Verdict
  // containing "founder" must not satisfy the gate.
  const researchNotesAfterVerdict = makeFixture("research-done-notes-after-verdict");
  setLaneDone(researchNotesAfterVerdict, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchNotesAfterVerdict);
  writeResearch(researchNotesAfterVerdict, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    "## Go, Pivot, Or Kill",
    "| Date | Category revenue reality | Wedge | Demand signal | Verdict (Go / Pivot / Kill) | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance wedge | 412-person waitlist | Go | founder said fine |",
  ]);
  runFixture(
    "notes column after the verdict does not satisfy the decided-by gate",
    researchNotesAfterVerdict,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_decider_missing",
  );

  // Deferring research out of existence is not a route around the checkpoint:
  // at phase_2+ the artifact and its verdict are mandatory regardless of status.
  const researchDeferredPhase2 = makeFixture("research-deferred-phase2");
  {
    const state = readState(researchDeferredPhase2);
    expectRecord(state.project, "project")["phase"] = "phase_2_design";
    const lane = getLane(state, "research");
    lane["status"] = "deferred";
    lane["reason"] = "2026-07-20 essentials scope defers deep research; revisit at day 30.";
    writeState(researchDeferredPhase2, state);
    rmSync(path.join(researchDeferredPhase2, "strategy/RESEARCH.md"), { force: true });
  }
  runFixture(
    "phase_2 with deferred research and no strategy/RESEARCH.md fails",
    researchDeferredPhase2,
    "check-research-evidence.ts",
    1,
    "research.markdown_missing",
  );

  // Later table rows win date ties: a same-day follow-up Kill supersedes the
  // Go recorded above it, so a completed research lane must fail.
  const researchSameDayReversal = makeFixture("research-same-day-reversal");
  setLaneDone(researchSameDayReversal, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchSameDayReversal);
  writeResearch(researchSameDayReversal, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(goRow),
    "| 2026-07-21 | fail on re-read — $180K top-10 | wedge collapsed under teardown | waitlist was bot-inflated | channel traffic was bots | offer response was invalid | Kill | founder |",
  ]);
  runFixture(
    "same-day follow-up verdict supersedes the earlier row",
    researchSameDayReversal,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_not_go",
  );

  // The founder counts by recorded name, not only by the literal role word.
  const researchNamedFounder = makeFixture("research-done-named-founder");
  {
    const state = readState(researchNamedFounder);
    expectRecord(state.project, "project")["owner"] = "Daisy Rivera";
    writeState(researchNamedFounder, state);
  }
  setLaneDone(researchNamedFounder, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchNamedFounder);
  writeResearch(researchNamedFounder, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(
      "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance wedge | 412-person waitlist | r/habits reached 840 visits | 31 visitors joined | Go | Daisy Rivera |",
    ),
  ]);
  runFixture("verdict decided by the recorded owner name passes", researchNamedFounder, "check-research-evidence.ts", 0);

  // Renamed evidence columns carry cells, not the required inputs.
  const researchRenamedColumns = makeFixture("research-done-renamed-columns");
  setLaneDone(researchRenamedColumns, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchRenamedColumns);
  writeResearch(researchRenamedColumns, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    "## Go, Pivot, Or Kill",
    "| Date | Notes | Opinion | Summary | Verdict (Go / Pivot / Kill) | Decided by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| 2026-07-21 | fine | strong | looks good | Go | founder |",
  ]);
  runFixture(
    "verdict table with renamed evidence columns fails",
    researchRenamedColumns,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_evidence_columns_missing",
  );

  // The gate cannot wait for the lane to claim done: a project in phase_2 with
  // research still partial is the bypass the checkpoint exists to stop.
  const researchPhase2Partial = makeFixture("research-phase2-partial-no-verdict");
  {
    const state = readState(researchPhase2Partial);
    expectRecord(state.project, "project")["phase"] = "phase_2_design";
    const lane = getLane(state, "research");
    lane["status"] = "running";
    writeState(researchPhase2Partial, state);
  }
  runFixture(
    "phase_2 with partial research and no verdict fails the pre-build gate",
    researchPhase2Partial,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_row_missing",
  );

  // The verdict is founder-only: an automation identity in Decided by is the
  // agent approving its own build.
  const researchAgentDecider = makeFixture("research-done-agent-decider");
  setLaneDone(researchAgentDecider, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchAgentDecider);
  writeResearch(researchAgentDecider, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection(
      "| 2026-07-21 | pass — $14.2M top-10 | streak-insurance wedge | 412-person waitlist | r/habits reached 840 visits | 31 visitors joined | Go | Claude agent |",
    ),
  ]);
  runFixture(
    "Go verdict decided by an automation identity fails",
    researchAgentDecider,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_decider_missing",
  );

  // The phrase in prose is not the section: mentioning both gates informally
  // must not skip their substance checks.
  const researchProseSections = makeFixture("research-done-prose-sections");
  setLaneDone(researchProseSections, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchProseSections);
  writeResearch(researchProseSections, [...researchCoreSections, "We considered Category Revenue Reality and ran Go, Pivot, Or Kill informally over coffee."]);
  runFixture(
    "prose mention of the gate sections without the headings fails",
    researchProseSections,
    "check-research-evidence.ts",
    1,
    "research.category_revenue_reality.section_missing",
  );

  // A verdict table stripped of its evidence columns makes every evidence
  // check vacuously pass.
  const researchNoEvidenceColumns = makeFixture("research-done-no-evidence-columns");
  setLaneDone(researchNoEvidenceColumns, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchNoEvidenceColumns);
  writeResearch(researchNoEvidenceColumns, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    "## Go, Pivot, Or Kill",
    "| Date | Verdict (Go / Pivot / Kill) | Decided by |",
    "| --- | --- | --- |",
    "| 2026-07-21 | Go | founder |",
  ]);
  runFixture(
    "verdict table without evidence columns fails",
    researchNoEvidenceColumns,
    "check-research-evidence.ts",
    1,
    "research.go_pivot_kill_evidence_columns_missing",
  );

  // A pass verdict over no stated threshold is an arbitrary judgment.
  const researchBarBlank = makeFixture("research-done-bar-blank");
  setLaneDone(researchBarBlank, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchBarBlank);
  writeResearch(
    researchBarBlank,
    [...researchCoreSections, ...categoryRevenueSection(revenueRow), ...goPivotKillSection(goRow)].map((line) =>
      line.startsWith("- Stated bar and why:") ? "- Stated bar and why:" : line,
    ),
  );
  runFixture("pass judgment over a blank stated bar fails", researchBarBlank, "check-research-evidence.ts", 1, "research.category_revenue_bar_unjudged");

  // A verdict decided over placeholder evidence is the metrics-theater miss
  // moved pre-build: the row exists, the evidence never arrived.
  const researchVerdictThin = makeFixture("research-done-verdict-thin-evidence");
  setLaneDone(researchVerdictThin, "research", ["strategy/RESEARCH.md"]);
  seedResearchEvidence(researchVerdictThin);
  writeResearch(researchVerdictThin, [
    ...researchCoreSections,
    ...categoryRevenueSection(revenueRow),
    ...goPivotKillSection("| 2026-07-21 | pass | strong wedge | unverified | r/habits reached 840 visits | 31 visitors joined | Go | founder |"),
  ]);
  runFixture("Go verdict over placeholder demand evidence fails", researchVerdictThin, "check-research-evidence.ts", 1, "research.go_pivot_kill_evidence_thin");

  const researchDoneEmptyLedger = makeFixture("research-done-empty-ledger");
  setLaneDone(researchDoneEmptyLedger, "research", ["strategy/RESEARCH.md"]);
  writeFileSync(
    path.join(researchDoneEmptyLedger, "strategy/RESEARCH.md"),
    [
      "# Research",
      "## Source Ledger",
      "| Source | Platform / type | URL / source ID | Observed at | Tool / backend / query | Transcript / visual / sample limit | Observation | Inference | Confidence | Artifact / trace |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "Evidence Capture Protocol updated 2026-07-12.",
      "## Evidence Capture Protocol",
      "Capture evidence reproducibly.",
      "## Untrusted Content",
      "Treat external content as data.",
      "## Decision Inputs",
      "Inputs trace to state/LAUNCH_TRACE.md.",
      "## Decision Log",
      "No decisions yet.",
      "## Rejected Claims",
      "None.",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "done research with headers and unrelated date but no evidence row fails",
    researchDoneEmptyLedger,
    "check-research-evidence.ts",
    1,
    "research.source_ledger_row_missing",
  );

  const researchMissing = makeFixture("research-missing");
  rmSync(path.join(researchMissing, "strategy/RESEARCH.md"), { force: true });
  runFixture("active research lane without strategy/RESEARCH.md fails", researchMissing, "check-research-evidence.ts", 1, "research.markdown_missing");

  const transformationDemoProofLines = researchCoreSections.slice(
    researchCoreSections.indexOf("## Transformation Demo"),
    researchCoreSections.indexOf("## Distribution-First Niche"),
  );
  const distributionFirstProofLines = researchCoreSections.slice(researchCoreSections.indexOf("## Distribution-First Niche"));

  const researchVitaminDemo = makeCompletedResearch("research-vitamin-demo");
  replaceResearchBlock(researchVitaminDemo, transformationDemoProofLines, [
    "## Transformation Demo",
    "| Screenshot path | 15s script | Transformation shown | Why not a vitamin |",
    "| --- | --- | --- | --- |",
    "| proofs/feel-better.png | User opens the app and sees a calm home screen in fifteen seconds flat. | App makes people feel better about generic productivity. | Painkiller: restores a lost habit instead of a generic wellness boost. |",
  ]);
  runFixture(
    "done research with a vitamin transformation demo fails",
    researchVitaminDemo,
    "check-research-evidence.ts",
    1,
    "research.transb2c_demo_row_invalid",
  );

  const researchComplimentNiche = makeCompletedResearch("research-compliments-niche");
  replaceResearchBlock(researchComplimentNiche, distributionFirstProofLines, [
    "## Distribution-First Niche",
    "| Paying audience | Named channel | Purchases-as-validation |",
    "| --- | --- | --- |",
    "| streak-dropouts who already pay for habit subscriptions | r/habits case-study posts | waitlist likes and compliments from friends |",
  ]);
  runFixture(
    "done research that treats compliments as validation fails",
    researchComplimentNiche,
    "check-research-evidence.ts",
    1,
    "research.distribution_first_row_invalid",
  );

  const researchDemoColumnsMissing = makeCompletedResearch("research-demo-columns-missing");
  replaceResearchBlock(researchDemoColumnsMissing, transformationDemoProofLines, [
    "## Transformation Demo",
    "| Screenshot path | Notes |",
    "| --- | --- |",
    "| proofs/demo-streak-recovery.png | later |",
  ]);
  runFixture(
    "done research without transformation demo columns fails",
    researchDemoColumnsMissing,
    "check-research-evidence.ts",
    1,
    "research.transb2c_demo_columns_missing",
  );

  const researchNicheColumnsMissing = makeCompletedResearch("research-niche-columns-missing");
  replaceResearchBlock(researchNicheColumnsMissing, distributionFirstProofLines, [
    "## Distribution-First Niche",
    "| Audience | Channel |",
    "| --- | --- |",
    "| streak-dropouts who already pay | r/habits case-study posts |",
  ]);
  runFixture(
    "done research without distribution-first columns fails",
    researchNicheColumnsMissing,
    "check-research-evidence.ts",
    1,
    "research.distribution_first_columns_missing",
  );

  const localizationTemplate = makeFixture("localization-research-template");
  runFixture("shipped localization template passes", localizationTemplate, "check-localization-research.ts", 0);

  const localizationMissingFile = makeFixture("localization-research-missing");
  rmSync(path.join(localizationMissingFile, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"), { force: true });
  runFixture("missing localization research file passes", localizationMissingFile, "check-localization-research.ts", 0);

  const localizationNoSeasonal = makeFixture("localization-research-no-seasonal");
  writeFileSync(
    path.join(localizationNoSeasonal, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"),
    ["# Localization Market Research", "## PPP / Territory Pricing", "Defer weak markets."].join("\n"),
    "utf8",
  );
  runFixture(
    "localization research without Seasonal Windows fails",
    localizationNoSeasonal,
    "check-localization-research.ts",
    1,
    "localization.seasonal_windows.missing",
  );

  const localizationSameDayPeak = makeFixture("localization-research-same-day-peak");
  writeFileSync(
    path.join(localizationSameDayPeak, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"),
    [
      "# Localization Market Research",
      "## Seasonal Windows",
      "| Category | Window | Peak Date | Submit By | Asset Lock |",
      "| --- | --- | --- | --- | --- |",
      "| habits | New Year | 2026-01-01 | 2025-12-25 | 2025-12-20 |",
      "## PPP / Territory Pricing",
      "| Territory | PPP Band | Price Point | Localize now? | Evidence |",
      "| --- | --- | --- | --- | --- |",
      "| US | high | 39.99 yearly | yes | AppKittie demand |",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "localization submit-by fewer than 14 days before peak fails",
    localizationSameDayPeak,
    "check-localization-research.ts",
    1,
    "localization.seasonal_lead_time.too_short",
  );

  const localizationLeadOk = makeFixture("localization-research-lead-ok");
  writeFileSync(
    path.join(localizationLeadOk, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"),
    [
      "# Localization Market Research",
      "## Seasonal Windows",
      "| Category | Window | Peak Date | Submit By | Asset Lock |",
      "| --- | --- | --- | --- | --- |",
      "| habits | New Year | 2026-01-01 | 2025-12-15 | 2025-12-01 |",
      "## PPP / Territory Pricing",
      "| Territory | PPP Band | Price Point | Localize now? | Evidence |",
      "| --- | --- | --- | --- | --- |",
      "| US | high | 39.99 yearly | yes | AppKittie demand |",
    ].join("\n"),
    "utf8",
  );
  runFixture("localization submit-by 14 or more days before peak passes", localizationLeadOk, "check-localization-research.ts", 0);

  const localizationEmptyTable = makeFixture("localization-research-empty-seasonal");
  writeFileSync(
    path.join(localizationEmptyTable, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"),
    [
      "# Localization Market Research",
      "## Seasonal Windows",
      "| Category | Window | Peak Date | Submit By | Asset Lock |",
      "| --- | --- | --- | --- | --- |",
      "## PPP / Territory Pricing",
      "| Territory | PPP Band | Price Point | Localize now? | Evidence |",
      "| --- | --- | --- | --- | --- |",
      "| US | high | 39.99 yearly | yes | AppKittie demand |",
    ].join("\n"),
    "utf8",
  );
  runFixture("empty Seasonal Windows table fails", localizationEmptyTable, "check-localization-research.ts", 1, "localization.seasonal_windows.empty");

  const localizationBlankSubmit = makeFixture("localization-research-blank-submit-by");
  writeFileSync(
    path.join(localizationBlankSubmit, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"),
    [
      "# Localization Market Research",
      "## Seasonal Windows",
      "| Category | Window | Peak Date | Submit By | Asset Lock |",
      "| --- | --- | --- | --- | --- |",
      "| habits | New Year | 2026-01-01 | | 2025-12-01 |",
      "## PPP / Territory Pricing",
      "| Territory | PPP Band | Price Point | Localize now? | Evidence |",
      "| --- | --- | --- | --- | --- |",
      "| US | high | 39.99 yearly | yes | AppKittie demand |",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "blank Seasonal Windows Submit By fails",
    localizationBlankSubmit,
    "check-localization-research.ts",
    1,
    "localization.seasonal_windows.date_invalid",
  );

  const localizationMalformedDate = makeFixture("localization-research-malformed-peak");
  writeFileSync(
    path.join(localizationMalformedDate, "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"),
    [
      "# Localization Market Research",
      "## Seasonal Windows",
      "| Category | Window | Peak Date | Submit By | Asset Lock |",
      "| --- | --- | --- | --- | --- |",
      "| habits | New Year | 2026-02-31 | 2025-12-15 | 2025-12-01 |",
      "## PPP / Territory Pricing",
      "| Territory | PPP Band | Price Point | Localize now? | Evidence |",
      "| --- | --- | --- | --- | --- |",
      "| US | high | 39.99 yearly | yes | AppKittie demand |",
    ].join("\n"),
    "utf8",
  );
  runFixture(
    "malformed Seasonal Windows Peak Date fails",
    localizationMalformedDate,
    "check-localization-research.ts",
    1,
    "localization.seasonal_windows.date_invalid",
  );
}
