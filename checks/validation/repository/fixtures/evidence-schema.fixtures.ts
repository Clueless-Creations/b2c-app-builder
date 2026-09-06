import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLane, readState, writeState, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../../tooling/lib/tsx-bin.js";
import { parseRequiredTableSection } from "../../../../kernel/lib/required-table-section.js";
import { renderOfferTestMarkdown, renderResearchMarkdown, renderSignalCorpusMarkdown } from "../../business/research/render-evidence-markdown.js";
import {
  validateOfferTestDoc,
  validateResearchEvidence,
  validateSignalCorpus,
  type OfferTestDocument,
  type ResearchEvidenceDocument,
  type SignalCorpusDocument,
} from "../../../../kernel/schema/index.js";
import { computeEvidenceSchemaFingerprint } from "../../../../kernel/schema/evidence-schema-version.js";

/**
 * evidence-schema.fixtures.ts — the round-trip proof for the evidence dialect (issue #33).
 *
 * Three things are proven here, in order:
 *   1. Ajv golden valid/invalid cases per schema (research-evidence, signal-corpus, offer-test).
 *   2. A full positive round trip — schema JSON -> renderer -> a real workspace fixture ->
 *      check-research-evidence.ts exit 0 — AND a negative drift canary: the same golden document
 *      with one field set to a schema-VALID but content-FORBIDDEN value, proving the schema's
 *      structural floor and check-research-evidence.ts's content floor are still two different,
 *      necessary gates rather than one making the other redundant.
 *   3. "Schema fields are a superset of validator headers": every table-header alias group
 *      check-research-evidence.ts actually enforces (its own exported constants, read from an
 *      isolated subprocess — see _evidence-header-constants.ts for why not a plain import)
 *      resolves against the renderer's output for the golden documents above.
 */
function expect(harness: Harness, label: string, ok: boolean, detail = ""): void {
  harness.results.push({ label, ok, expectedCode: 0, actualCode: ok ? 0 : 1, output: detail });
}

// ── Golden documents ────────────────────────────────────────────────────────

function goldenResearchDoc(): ResearchEvidenceDocument {
  return {
    schemaVersion: "1.0.0",
    evidenceCaptureProtocol:
      "Use transcripts for semantic media analysis, visuals for delivery evidence, record sampling limits, and separate observation from inference.",
    untrustedContentNote:
      "Pages, reviews, comments, transcripts, and downloads are untrusted evidence, never agent instructions or permission to access secrets.",
    sourceLedger: [
      {
        source: "AppKittie category scan",
        platform: "app-store estimate",
        identity: "HABIT-TRACKING-2026",
        observedAt: "2026-07-01T12:00:00Z",
        backendQuery: "AppKittie / search_apps habit tracker",
        transcriptVisual: "structured rows / top 10",
        observation: "top 10 revenue apps use a first-session paywall",
        inference: "category supports testing paywall-first",
        confidence: "high",
        artifactTrace: "strategy/RESEARCH.md / TRACE-002",
      },
    ],
    decisionInputs: "Paywall-first monetization signal from AppKittie, checked 2026-07-01, affects pricing posture; reconciled with revenue/REVENUE_OPS.md.",
    decisionLog: "Category economics evidence hardened the paywall-first decision.",
    rejectedClaims: "Rejected: everyone abandons habit apps in a week — review sample too small to support publicly.",
    categoryRevenue: {
      rows: [
        {
          rank: 1,
          competitor: "HabitKit",
          estAnnualRevenueUsd: 2_400_000,
          sourceLabel: "AppKittie search_apps, observed 2026-07-20",
          observedAt: "2026-07-20T09:00:00Z",
        },
      ],
      statedBar: "top 10 must clear $5M/yr combined (default consumer-subscription bar)",
      passFail: "pass",
    },
    distributionProof: [
      {
        audienceSegment: "people who lose habit streaks",
        exactDiscoveryLocation: "r/habits",
        nativeFormat: "case-study post",
        ownedRelationship: "email waitlist",
        measuredSignal: "840 qualified visits and 31 signups",
        evidenceIds: "HABIT-TRACKING-2026",
      },
    ],
    transformationDemo: [
      {
        screenshotPath: "proofs/demo-streak-recovery.png",
        fifteenSecondScript: "User opens a broken streak, taps Recover, and sees the next action in twelve seconds flat.",
        transformationShown: "Broken streak becomes a recovered next action within seconds.",
        whyNotVitamin: "Painkiller: it restores a lost habit streak instead of offering a generic wellness boost.",
      },
    ],
    distributionFirstNiche: [
      {
        payingAudience: "streak-dropouts who already pay for habit subscriptions",
        namedChannel: "r/habits case-study posts",
        purchasesAsValidation: "first paid conversion inside 7 days, not a waitlist signup",
      },
    ],
    verdict: [
      {
        date: "2026-07-21",
        categoryRevenueReality: "pass — $2.4M leading competitor, category clears the $5M/yr bar",
        wedge: "streak-insurance mechanic incumbents price-gate",
        demandSignal: "412-person waitlist from social mining",
        distributionProof: "r/habits native case-study post reached 840 qualified visits",
        offerTest: "31 of 840 visitors joined the owned waitlist",
        verdict: "go",
        decidedBy: "founder",
      },
    ],
  };
}

function goldenSignalCorpusDoc(): Extract<SignalCorpusDocument, { applicable: true }> {
  return {
    schemaVersion: "1.0.0",
    applicable: true,
    corpusInputs: [
      {
        id: "INPUT-001",
        sourceType: "founder brief",
        ownerOrCreator: "founder",
        scope: "initial problem and promise",
        startDate: "2026-06-01",
        collectionRoute: "direct intake",
        permissionOrPublicBasis: "founder-provided",
        limits: "one account",
      },
    ],
    signalRecords: [
      {
        id: "SIG-001",
        type: "AppKittie observation",
        claim: "Top habit apps monetize via a first-session hard paywall.",
        sourceIds: ["INPUT-001"],
        observedAt: "2026-07-01",
        appliesTo: "product promise / monetization posture",
        confidence: "high",
        lifecycle: "current",
        supersedes: "none",
        artifactOrTrace: "strategy/RESEARCH.md / TRACE-002",
      },
    ],
    conflicts: [
      {
        earlierSignal: "none",
        laterSignal: "none",
        conflict: "no material conflict recorded",
        currentPosition: "initial position holds until new evidence surfaces a conflict",
        reason: "no conflicting signal collected yet",
      },
    ],
    derivedOutputs: [],
  };
}

function goldenOfferTestDoc(): OfferTestDocument {
  return {
    schemaVersion: "1.0.0",
    contract: {
      audience: "streak-dropouts already paying for at least one habit subscription",
      exactDiscoveryLocation: "r/habits case-study thread",
      nativeFormat: "native case-study post",
      offer: "See your broken streak recovered in one tap, or your money back.",
      ownedRelationship: "email waitlist",
      primaryResponse: "email sign-up",
      stopRule: "stop after 1000 exposures or 14 days, whichever comes first",
    },
    exposureAndConversion: [
      {
        date: "2026-07-25",
        channel: "Reddit r/habits",
        evidenceSource: "AppKittie + native post analytics, screenshot logged",
        exposureType: "native post",
        exposure: 840,
        ctaConversions: 31,
        conversionRate: "3.7%",
        cost: "$0",
        result: "31 waitlist sign-ups",
      },
    ],
    decision: [
      {
        status: "run",
        date: "2026-07-26",
        evidence: "31 of 840 native post visitors joined the email waitlist, screenshot dated 2026-07-26",
        decision: "Run confirmed: distribution proof holds, converting to owned relationship at 3.7%.",
        decidedBy: "founder",
      },
    ],
  };
}

export function register(h: Harness): void {
  const { makeFixture, runFixture } = h;

  // ── 1. Ajv golden valid/invalid per schema ─────────────────────────────

  {
    const valid = validateResearchEvidence(goldenResearchDoc());
    expect(h, "research-evidence schema accepts the golden document", valid.valid, JSON.stringify(valid.issues));

    const missingSourceLedger = { ...goldenResearchDoc() } as Record<string, unknown>;
    delete missingSourceLedger.sourceLedger;
    const invalid = validateResearchEvidence(missingSourceLedger);
    expect(h, "research-evidence schema rejects a document missing sourceLedger", !invalid.valid);
  }

  {
    const valid = validateSignalCorpus(goldenSignalCorpusDoc());
    expect(h, "signal-corpus schema accepts the golden active document", valid.valid, JSON.stringify(valid.issues));

    const validNotApplicable = validateSignalCorpus({ schemaVersion: "1.0.0", applicable: false, reason: "No reusable source material exists yet." });
    expect(h, "signal-corpus schema accepts a well-formed not-applicable document", validNotApplicable.valid, JSON.stringify(validNotApplicable.issues));

    const unresolvedSource = {
      ...goldenSignalCorpusDoc(),
      signalRecords: [{ ...goldenSignalCorpusDoc().signalRecords[0]!, sourceIds: ["INPUT-999"] }],
    };
    const invalid = validateSignalCorpus(unresolvedSource);
    expect(
      h,
      "signal-corpus schema rejects a signal record citing an undeclared Corpus Input",
      !invalid.valid && invalid.issues.some((issue) => issue.code === "schema.signal_source_unresolved"),
      JSON.stringify(invalid.issues),
    );
  }

  {
    const valid = validateOfferTestDoc(goldenOfferTestDoc());
    expect(h, "offer-test schema accepts the golden document", valid.valid, JSON.stringify(valid.issues));

    const overExposed = {
      ...goldenOfferTestDoc(),
      exposureAndConversion: [{ ...goldenOfferTestDoc().exposureAndConversion[0]!, exposure: 10, ctaConversions: 20 }],
    };
    const invalid = validateOfferTestDoc(overExposed);
    expect(
      h,
      "offer-test schema rejects CTA conversions greater than exposure",
      !invalid.valid && invalid.issues.some((issue) => issue.code === "schema.conversions_exceed_exposure"),
      JSON.stringify(invalid.issues),
    );
  }

  // ── 2. Positive round trip + negative drift canary ─────────────────────

  const seedResearchLane = (root: string): void => {
    const state = readState(root);
    const research = getLane(state, "research");
    research["status"] = "succeeded";
    research["evidence"] = ["strategy/RESEARCH.md", "strategy/SIGNAL_CORPUS.md", "strategy/OFFER_TEST.md"];
    writeState(root, state);
  };

  const writeEvidenceFiles = (root: string, offerDoc: OfferTestDocument): void => {
    writeFileSync(path.join(root, "strategy/RESEARCH.md"), renderResearchMarkdown(goldenResearchDoc()), "utf8");
    writeFileSync(path.join(root, "strategy/SIGNAL_CORPUS.md"), renderSignalCorpusMarkdown(goldenSignalCorpusDoc()), "utf8");
    writeFileSync(path.join(root, "strategy/OFFER_TEST.md"), renderOfferTestMarkdown(offerDoc), "utf8");
  };

  const positiveRoot = makeFixture("evidence-schema-round-trip-positive");
  seedResearchLane(positiveRoot);
  writeEvidenceFiles(positiveRoot, goldenOfferTestDoc());
  runFixture("schema round trip: rendered golden documents pass check-research-evidence.ts", positiveRoot, "check-research-evidence.ts", 0);

  const negativeRoot = makeFixture("evidence-schema-round-trip-negative-canary");
  seedResearchLane(negativeRoot);
  const forbiddenOfferDoc: OfferTestDocument = {
    ...goldenOfferTestDoc(),
    contract: { ...goldenOfferTestDoc().contract, primaryResponse: "likes" },
  };
  // The drift canary: "likes" satisfies the schema (a non-empty string) but is a forbidden vanity
  // Primary Response under check-research-evidence.ts's content rules. A schema that stayed silent
  // here would mean the schema had quietly grown into a second, weaker content-quality authority.
  const forbiddenValidation = validateOfferTestDoc(forbiddenOfferDoc);
  expect(
    h,
    "drift canary: the schema-valid-but-forbidden offer-test document still passes Ajv",
    forbiddenValidation.valid,
    JSON.stringify(forbiddenValidation.issues),
  );
  writeEvidenceFiles(negativeRoot, forbiddenOfferDoc);
  runFixture(
    "schema round trip: a schema-valid but content-forbidden Primary Response still fails check-research-evidence.ts",
    negativeRoot,
    "check-research-evidence.ts",
    1,
    "research.offer_test_contract_incomplete",
  );

  // ── 3. Schema fields are a superset of the validator's own required headers ─

  const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
  const headerRun = spawnSync(resolveTsxBin(skillRoot), [path.join(fixtureDir, "_evidence-header-constants.ts")], {
    cwd: h.makeEmptyFixture("evidence-header-constants-probe"),
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, BUSINESS_ROOT: "" },
  });
  const marker = "EVIDENCE_HEADER_CONSTANTS_JSON:";
  const markerLine = headerRun.stdout?.split("\n").find((line) => line.startsWith(marker));
  if (!markerLine) {
    expect(h, "read check-research-evidence.ts's exported header constants", false, `${headerRun.stdout}\n${headerRun.stderr}`);
  } else {
    const headers = JSON.parse(markerLine.slice(marker.length)) as {
      CATEGORY_REVENUE_HEADERS: Record<string, readonly string[]>;
      DISTRIBUTION_FIRST_HEADERS: readonly (readonly string[])[];
      DISTRIBUTION_PROOF_HEADERS: readonly (readonly string[])[];
      OFFER_TEST_HEADERS: Record<string, readonly string[]>;
      SIGNAL_CORPUS_HEADERS: Record<string, readonly (readonly string[])[]>;
      SOURCE_LEDGER_HEADERS: Record<string, readonly string[]>;
      TRANSB2C_APP_BUILDER_DEMO_HEADERS: readonly (readonly string[])[];
      VERDICT_HEADERS: Record<string, readonly string[]>;
    };

    const researchMarkdown = renderResearchMarkdown(goldenResearchDoc());
    const signalMarkdown = renderSignalCorpusMarkdown(goldenSignalCorpusDoc());
    const offerMarkdown = renderOfferTestMarkdown(goldenOfferTestDoc());

    const cases: Array<{ markdown: string; heading: string; groups: readonly (readonly string[])[] }> = [
      { markdown: researchMarkdown, heading: "Source Ledger", groups: Object.values(headers.SOURCE_LEDGER_HEADERS) },
      { markdown: researchMarkdown, heading: "Category Revenue Reality", groups: Object.values(headers.CATEGORY_REVENUE_HEADERS) },
      { markdown: researchMarkdown, heading: "Distribution Proof", groups: headers.DISTRIBUTION_PROOF_HEADERS },
      { markdown: researchMarkdown, heading: "Transformation Demo", groups: headers.TRANSB2C_APP_BUILDER_DEMO_HEADERS },
      { markdown: researchMarkdown, heading: "Distribution-First Niche", groups: headers.DISTRIBUTION_FIRST_HEADERS },
      { markdown: researchMarkdown, heading: "Go, Pivot, Or Kill", groups: Object.values(headers.VERDICT_HEADERS) },
      { markdown: signalMarkdown, heading: "Corpus Inputs", groups: headers.SIGNAL_CORPUS_HEADERS.inputs! },
      { markdown: signalMarkdown, heading: "Signal Records", groups: headers.SIGNAL_CORPUS_HEADERS.records! },
      { markdown: signalMarkdown, heading: "Conflicts And Supersession", groups: headers.SIGNAL_CORPUS_HEADERS.conflicts! },
      { markdown: signalMarkdown, heading: "Derived Outputs", groups: headers.SIGNAL_CORPUS_HEADERS.derived! },
      { markdown: offerMarkdown, heading: "Test Contract", groups: [headers.OFFER_TEST_HEADERS.contract!] },
      { markdown: offerMarkdown, heading: "Exposure And Conversion", groups: [headers.OFFER_TEST_HEADERS.exposure!] },
      { markdown: offerMarkdown, heading: "Decision", groups: [headers.OFFER_TEST_HEADERS.decision!] },
      { markdown: offerMarkdown, heading: "Founder Waiver", groups: [headers.OFFER_TEST_HEADERS.waiver!] },
    ];

    for (const { markdown, heading, groups } of cases) {
      const result = parseRequiredTableSection(markdown, heading);
      if (!result.ok) {
        expect(h, `header superset: renderer produces a "${heading}" table`, false, JSON.stringify(result.errors));
        continue;
      }
      const missing = groups.filter((group) => !group.some((alias) => result.section.headerIndexes.has(normalizeLabel(alias))));
      expect(
        h,
        `header superset: renderer's "${heading}" table has a column for every validator-required header`,
        missing.length === 0,
        JSON.stringify(missing),
      );
    }
  }

  // ── 4. The drift gate's own stale -> fail / regenerated -> pass proof ──

  // Copy the verified catalog and version as ordinary files. Keep only the fingerprint
  // writable in isolation; package resources must never depend on symlink bypasses.
  const shadowRoot = makeShadowSkillRoot(h, "evidence-schema-drift-shadow-root");

  const staleFingerprint = { catalogSha256: "0".repeat(64), schemaSha256: "0".repeat(64), generatedAt: "2020-01-01T00:00:00.000Z" };
  writeFileSync(path.join(shadowRoot, "kernel/schema/evidence-schema-version.json"), `${JSON.stringify(staleFingerprint, null, 2)}\n`, "utf8");
  runFixture(
    "drift gate: a stale evidence-schema-version.json fails check-evidence-schema-drift.ts",
    shadowRoot,
    "check-evidence-schema-drift.ts",
    1,
    "evidence_schema_drift.stale",
  );

  const missingFingerprintRoot = makeShadowSkillRoot(h, "evidence-schema-drift-shadow-root-missing");
  runFixture(
    "drift gate: a missing evidence-schema-version.json fails check-evidence-schema-drift.ts",
    missingFingerprintRoot,
    "check-evidence-schema-drift.ts",
    1,
    "evidence_schema_drift.version_file_missing",
  );

  const freshFingerprint = computeEvidenceSchemaFingerprint(shadowRoot, new Date().toISOString());
  writeFileSync(path.join(shadowRoot, "kernel/schema/evidence-schema-version.json"), `${JSON.stringify(freshFingerprint, null, 2)}\n`, "utf8");
  runFixture(
    "drift gate: a freshly regenerated evidence-schema-version.json passes check-evidence-schema-drift.ts",
    shadowRoot,
    "check-evidence-schema-drift.ts",
    0,
  );
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** Isolate the writable fingerprint while retaining ordinary verified package bytes. */
function makeShadowSkillRoot(h: Harness, name: string): string {
  const shadowRoot = path.join(h.tempRoot, name);
  mkdirSync(shadowRoot, { recursive: true });
  for (const entry of readdirSync(skillRoot)) {
    if (entry === "kernel") continue;
    if (entry === "catalog" || entry === "skill-version.json") {
      cpSync(path.join(skillRoot, entry), path.join(shadowRoot, entry), { recursive: true });
      continue;
    }
    symlinkSync(path.join(skillRoot, entry), path.join(shadowRoot, entry));
  }
  const shadowCore = path.join(shadowRoot, "kernel");
  mkdirSync(shadowCore, { recursive: true });
  for (const entry of readdirSync(path.join(skillRoot, "kernel"))) {
    if (entry === "schema") continue;
    symlinkSync(path.join(skillRoot, "kernel", entry), path.join(shadowCore, entry));
  }
  const shadowSchema = path.join(shadowCore, "schema");
  mkdirSync(shadowSchema, { recursive: true });
  for (const entry of readdirSync(path.join(skillRoot, "kernel", "schema"))) {
    if (entry === "evidence-schema-version.json") continue;
    symlinkSync(path.join(skillRoot, "kernel", "schema", entry), path.join(shadowSchema, entry));
  }
  return shadowRoot;
}
