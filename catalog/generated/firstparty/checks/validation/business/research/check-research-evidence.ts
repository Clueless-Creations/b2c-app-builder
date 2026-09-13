#!/usr/bin/env node
import { validateOfferTest, isAbsentOwnedRelationship, tableColumn, rowsMatchTableWidth } from "./offer-evidence.js";
export { OFFER_TEST_HEADERS } from "./offer-evidence.js";
/**
 * check-research-evidence.ts — content floor for the research lane.
 *
 * strategy/RESEARCH.md is the evidence root every downstream lane traces back to, yet
 * the lane previously had no dedicated validator: only the generic
 * lane-coverage status floor saw it. Structure follows the strategy/RESEARCH.md
 * contract in knowledge/process/artifact-contracts.md.
 *
 * npm script: check:research
 * Usage: tsx checks/validation/business/research/check-research-evidence.ts --root <app-repo-root>
 */
import { isPlanningWorkspace } from "../../../../kernel/session/planning-context.js";
import { asString, getPath, issue, loadProjectState, parseCliArgs, readText, reportAndExit } from "../../../../tooling/lib/launch-state.js";
import { isEmptyEquivalentEvidenceValue } from "../../../../kernel/lib/empty-equivalent-evidence.js";
import { parseRenderedTopLevelStatus, parseRequiredTableSection, type RequiredTableSection } from "../../../../kernel/lib/required-table-section.js";
import { assertResearchContractHeaders } from "../../../../contracts/public-api/research-contract.js";
import {
  isPlaceholderOnly,
  isValidNonFutureRfc3339Instant,
  isValidPastIsoDate,
  validateSignalSupersessionGraph,
  type SignalLifecycle,
  type SignalSupersessionRecord,
} from "./research-evidence-helpers.js";

const args = parseCliArgs(process.argv.slice(2));
const requireWorkflowOutputs = process.argv.includes("--require-workflow-outputs");
// Planning research precedes runtime initialization. Never manufacture reducer state to satisfy a content gate.
const loaded = (() => {
  try {
    if (isPlanningWorkspace(args.root)) return { state: undefined, issues: [] };
    return loadProjectState(args);
  } catch {
    return {
      state: undefined,
      issues: [issue("error", "research.lifecycle_invalid", "Repair the planning product or interrupted runtime before validating research.")],
    };
  }
})();
const issues = [...loaded.issues];
const state = loaded.state;
const projectOwner = state ? (asString(getPath(state, "project.owner")) ?? "").trim() : "";
const FOUNDER_OPENING_MANDATE = "Founder opening mandate";
const AUTOMATION_IDENTITY = /\b(agent|codex|claude|gpt|assistant|bot|automation|autopilot|ai)\b/i;
const VERDICT_EVIDENCE_LABELS = ["Category revenue reality", "Wedge", "Demand signal", "Distribution proof", "Offer test"] as const;

export const SIGNAL_CORPUS_HEADERS = {
  inputs: [
    ["Input ID"],
    ["Source type"],
    ["Owner or creator", "Owner", "Creator"],
    ["Scope"],
    ["Date range"],
    ["Collection route"],
    ["Permission or public basis", "Permission", "Public basis"],
    ["Limits", "Limit"],
  ],
  records: [
    ["Signal ID"],
    ["Type"],
    ["Claim or phrase", "Claim", "Phrase"],
    ["Source IDs", "Source ID"],
    ["Observed at"],
    ["Applies to"],
    ["Confidence"],
    ["Status"],
    ["Supersedes"],
    ["Artifact or trace", "Artifact", "Trace"],
  ],
  conflicts: [["Earlier signal"], ["Later signal"], ["Conflict"], ["Current position"], ["Reason"]],
  derived: [["Signal IDs", "Signal ID"], ["Output"], ["Decision changed"], ["Trace ID"]],
} as const;
export const DISTRIBUTION_PROOF_HEADERS = [
  ["Audience segment"],
  ["Exact discovery location"],
  ["Native format"],
  ["Owned relationship"],
  ["Measured signal"],
  ["Evidence IDs", "Evidence ID"],
] as const;
export const TRANSB2C_APP_BUILDER_DEMO_HEADERS = [
  ["Screenshot path", "Screenshot"],
  ["15s script", "15-second script", "Script"],
  ["Transformation shown", "Transformation"],
  ["Why not a vitamin", "Not a vitamin", "Painkiller"],
] as const;
export const DISTRIBUTION_FIRST_HEADERS = [["Paying audience"], ["Named channel"], ["Purchases-as-validation", "Purchases as validation"]] as const;
export const SOURCE_LEDGER_HEADERS = {
  source: ["Source"],
  platform: ["Platform / type"],
  identity: ["URL / source ID"],
  observedAt: ["Observed at"],
  backendQuery: ["Tool / backend / query"],
  transcriptVisual: ["Transcript / visual / sample limit", "Transcript / visual"],
  observation: ["Observation"],
  inference: ["Inference"],
  confidence: ["Confidence"],
  artifactTrace: ["Artifact / trace"],
} as const;
export const CATEGORY_REVENUE_HEADERS = {
  revenue: ["Est. annual revenue", "Estimated annual revenue", "Annual revenue", "Revenue"],
  source: ["Source / observed at", "Source"],
} as const;
export const VERDICT_HEADERS = {
  date: ["Date"],
  categoryRevenue: ["Category revenue reality", "Category revenue", "Revenue reality"],
  wedge: ["Wedge"],
  demand: ["Demand signal", "Demand"],
  distribution: ["Distribution proof", "Distribution"],
  offerTest: ["Offer test"],
  verdict: ["Verdict (Go / Pivot / Kill)", "Verdict"],
  decidedBy: ["Decided by"],
} as const;

assertResearchContractHeaders({
  sourceLedger: Object.values(SOURCE_LEDGER_HEADERS).map(([canonical]) => canonical),
  signalCorpus: {
    inputs: SIGNAL_CORPUS_HEADERS.inputs.map(([canonical]) => canonical),
    records: SIGNAL_CORPUS_HEADERS.records.map(([canonical]) => canonical),
    conflicts: SIGNAL_CORPUS_HEADERS.conflicts.map(([canonical]) => canonical),
    derived: SIGNAL_CORPUS_HEADERS.derived.map(([canonical]) => canonical),
  },
  distributionProof: DISTRIBUTION_PROOF_HEADERS.map(([canonical]) => canonical),
  verdict: Object.values(VERDICT_HEADERS).map(([canonical]) => canonical),
});

const laneStatus = state ? asString(getPath(state, "lanes.research.status"))?.toLowerCase() : undefined;
const skip = laneStatus === "not_needed" || laneStatus === "deferred";
const done = laneStatus === "succeeded";
const strictResearch = done || requireWorkflowOutputs;
// The pre-build gate cannot wait for the lane to claim done: a project that
// advances to design/build phases with research still partial is exactly the
// bypass the checkpoint exists to stop, so the verdict is enforced from
// phase_2 onward regardless of lane status.
const projectPhase = state ? (asString(getPath(state, "project.phase")) ?? "").toLowerCase() : "";
const buildPhase = /^phase_[2-6]/.test(projectPhase);
// The gate also fires the moment downstream product/design/build work becomes
// active, whatever the recorded phase says: design effort spent before the
// founder's Go is the exact cost the checkpoint exists to prevent.
const DOWNSTREAM_OF_VERDICT = ["experience", "product", "design", "content_assets", "engineering"];
const downstreamActive = DOWNSTREAM_OF_VERDICT.some((lane) => {
  const status = state ? asString(getPath(state, `lanes.${lane}.status`))?.toLowerCase() : undefined;
  return status === "running" || status === "succeeded";
});
const verdictRequired = strictResearch || buildPhase || downstreamActive;
const text = readText(args.root, "strategy/RESEARCH.md");
const signalText = readText(args.root, "strategy/SIGNAL_CORPUS.md");
const offerText = readText(args.root, "strategy/OFFER_TEST.md");
const sourceLedgerResult = text ? parseRequiredTableSection(text, "Source Ledger") : undefined;
const sourceLedgerSection = sourceLedgerResult?.ok ? sourceLedgerResult.section : undefined;
const sourceLedgerEvidence = buildSourceLedgerEvidence(sourceLedgerSection);
if (sourceLedgerSection) {
  const confidenceColumn = tableColumnAny(sourceLedgerSection, SOURCE_LEDGER_HEADERS.confidence);
  if (confidenceColumn >= 0) {
    for (const row of sourceLedgerSection.rows) {
      const confidence = (row.cells[confidenceColumn] ?? "").trim();
      if (confidence && !/^(low|medium|high)$/i.test(confidence)) {
        issues.push(
          issue(
            "error",
            "research.source_ledger_confidence_invalid",
            "Source Ledger Confidence must be exactly low, medium, or high; keep qualifiers such as estimates in the row's narrative fields.",
            "strategy/RESEARCH.md",
            { line: row.sourceLine, fixHint: "Use low, medium, or high in Confidence and move any qualifier to Observation or Inference." },
          ),
        );
      }
    }
  }
}
const signalEvidence = verdictRequired ? validateSignalCorpus(signalText, issues, strictResearch) : emptySignalCorpusIndex();

// A deferred/not_needed research lane suppresses the missing-file error only
// before the build phases: from phase_2 onward the verdict is mandatory, so
// the artifact that carries it is too — deferring research out of existence
// is not a route around the pre-build checkpoint.
if ((!skip || verdictRequired) && !text) {
  issues.push(
    issue(
      "error",
      "research.markdown_missing",
      "strategy/RESEARCH.md is required: it is the evidence root that PRODUCT.md, brand, ASO, pricing, and funnel decisions trace back to" +
        (buildPhase && skip ? ", and from phase_2 onward the Go/Pivot/Kill verdict it carries is mandatory even for a deferred research lane" : "") +
        ". Seed it from business/strategy/RESEARCH.md.",
      "strategy/RESEARCH.md",
    ),
  );
}

if (text) {
  for (const phrase of [
    "Source Ledger",
    "Evidence Capture Protocol",
    "Untrusted Content",
    "Decision Inputs",
    "Decision Log",
    "Rejected Claims",
    "Category Revenue Reality",
    "Distribution Proof",
    "Transformation Demo",
    "Distribution-First Niche",
    "Go, Pivot, Or Kill",
  ]) {
    if (!text.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(
        issue(
          strictResearch ? "error" : "warning",
          `research.${phrase.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.missing`,
          `strategy/RESEARCH.md should include a ${phrase} section (see the strategy/RESEARCH.md contract in artifact-contracts.md).`,
          "strategy/RESEARCH.md",
        ),
      );
    }
  }

  if (!text.includes("LAUNCH_TRACE")) {
    issues.push(
      issue(
        strictResearch ? "error" : "warning",
        "research.trace_pointer.missing",
        "strategy/RESEARCH.md should give major decisions trace IDs or state/LAUNCH_TRACE.md pointers so evidence stays connected to build decisions.",
        "strategy/RESEARCH.md",
      ),
    );
  }

  if (strictResearch) {
    const strictProvenanceColumns = [
      ["URL / source ID", sourceLedgerEvidence.columns.identity],
      ["Observed at", sourceLedgerEvidence.columns.observedAt],
      ["Tool / backend / query", sourceLedgerEvidence.columns.backendQuery],
      ["Transcript / visual", sourceLedgerEvidence.columns.transcriptVisual],
      ["Observation", sourceLedgerEvidence.columns.observation],
      ["Inference", sourceLedgerEvidence.columns.inference],
      ["Artifact / trace", sourceLedgerEvidence.columns.artifactTrace],
    ] as const;
    for (const [column, index] of strictProvenanceColumns) {
      if (index < 0) {
        issues.push(
          issue(
            "error",
            `research.source_ledger_${column.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.missing`,
            `Done research needs the ${column} provenance column so browser/social/video evidence is reproducible.`,
            "strategy/RESEARCH.md",
          ),
        );
      }
    }
    const sourceLedgerHasTemplatePlaceholder = sourceLedgerSection?.rows.some((row) => {
      const cells = row.cells;
      const requiredIdentityFields = [
        cells[sourceLedgerEvidence.columns.source],
        cells[sourceLedgerEvidence.columns.platform],
        cells[sourceLedgerEvidence.columns.identity],
        cells[sourceLedgerEvidence.columns.backendQuery],
        cells[sourceLedgerEvidence.columns.artifactTrace],
      ];
      const narrativeFields = [
        cells[sourceLedgerEvidence.columns.transcriptVisual],
        cells[sourceLedgerEvidence.columns.observation],
        cells[sourceLedgerEvidence.columns.inference],
      ];
      return (
        requiredIdentityFields.some((cell) => /\bYYYY-MM-DD\b|\breplace with\b|\b(TODO|TBD|placeholder)\b/i.test(cell ?? "")) ||
        narrativeFields.some((cell) => isPlaceholderOnly(cell ?? ""))
      );
    });
    if (sourceLedgerHasTemplatePlaceholder) {
      issues.push(
        issue(
          "error",
          "research.placeholder_complete",
          "Research cannot be done while template placeholders (YYYY-MM-DD, 'replace with', TODO/TBD) remain in strategy/RESEARCH.md.",
          "strategy/RESEARCH.md",
        ),
      );
    }
    if (!sourceLedgerEvidence.hasDatedEvidence) {
      issues.push(
        issue(
          "error",
          "research.no_dated_evidence",
          "A done research lane needs at least one evidence row with a valid, non-future Observed at timestamp so freshness is checkable.",
          "strategy/RESEARCH.md",
        ),
      );
    }
  }

  // ── Pre-build Go/Pivot/Kill gate ──────────────────────────────────────────
  if (verdictRequired) {
    // Research that never converts evidence into a build-or-not decision is
    // the expensive miss the 2026-07-26 audit named: the launch machinery will
    // polish and ship any input idea, so the one evidence-gated exit ramp is
    // here, before Phase 2 spends design/build/store effort. The agent
    // assembles the evidence; the verdict is the founder's call — and a Kill
    // or Pivot at this checkpoint is the process working, not failing.
    const PLACEHOLDER_TEXT = /\b(unverified|tbd|todo|to be filled|pending|placeholder)\b/i;

    const revenueResult = parseRequiredTableSection(text, "Category Revenue Reality");
    if (!revenueResult.ok) {
      // The phrase in prose is not the section: a done lane needs the parsed
      // heading, or every substance check below silently skips.
      issues.push(
        issue(
          "error",
          "research.category_revenue_reality.section_missing",
          'strategy/RESEARCH.md mentions Category Revenue Reality but has no "## Category Revenue Reality" section. The gate reads the section, not the phrase.',
          "strategy/RESEARCH.md",
        ),
      );
    } else {
      const revenueSection = revenueResult.section;
      // The revenue estimate and its source are parsed from their intended
      // columns: a dollar amount drifting in an unrelated cell, or a blank
      // source, is data-shaped text rather than a sourced estimate.
      const revenueColumn = tableColumnAny(revenueSection, CATEGORY_REVENUE_HEADERS.revenue);
      const sourceColumn = tableColumnAny(revenueSection, CATEGORY_REVENUE_HEADERS.source);
      const revenueRows = revenueSection.rows.filter((row) => !/_example/i.test(row.cells.join(" ")));
      const sourcedRow = (row: (typeof revenueRows)[number]): boolean => {
        const revenueCell = revenueColumn >= 0 ? (row.cells[revenueColumn] ?? "") : "";
        const sourceCell = sourceColumn >= 0 ? (row.cells[sourceColumn] ?? "") : "";
        return (
          /\$\s*\d[\d,]*(?:\.\d+)?/.test(revenueCell) &&
          sourceCell.trim().length > 0 &&
          !PLACEHOLDER_TEXT.test(sourceCell) &&
          /\d{4}-\d{2}-\d{2}/.test(sourceCell)
        );
      };
      const invalidRevenueRow = revenueRows.find((row) => !sourcedRow(row));
      if (revenueColumn < 0 || sourceColumn < 0 || !rowsMatchTableWidth(revenueSection) || !revenueRows.some(sourcedRow)) {
        issues.push(
          issue(
            "error",
            "research.category_revenue_row_missing",
            "Done research needs at least one real competitor revenue row in Category Revenue Reality: a dollar estimate in the revenue " +
              "column AND a dated, non-placeholder source in the source column. Collecting AppKittie data is not the gate — the judged, " +
              "sourced number is: a category whose top apps gross too little cannot become a real business however well the launch executes.",
            "strategy/RESEARCH.md",
            {
              line: invalidRevenueRow?.sourceLine ?? revenueSection.headingLine,
              fixHint: "Repair the cited Category Revenue Reality row with a dollar estimate and a dated, non-placeholder source in the named columns.",
            },
          ),
        );
      }
      const barLine = revenueSection.renderedBody.split(/\r?\n/).find((line) => /stated bar/i.test(line) && line.includes(":"));
      const barValue = barLine ? (barLine.split(/:(.*)/s)[1] ?? "").trim() : "";
      const barStated = barValue.length > 0 && /\d/.test(barValue) && !PLACEHOLDER_TEXT.test(barValue);
      if (!barStated || !/pass or fail[^:\n]*:\s*(pass|fail)/i.test(revenueSection.renderedBody)) {
        issues.push(
          issue(
            "error",
            "research.category_revenue_bar_unjudged",
            "Category Revenue Reality needs a substantive stated bar (a number, not a blank or placeholder) AND an explicit pass/fail judgment " +
              "against it. A pass verdict over no stated threshold, or a table without the judgment line, is data collection wearing a gate's clothes.",
            "strategy/RESEARCH.md",
          ),
        );
      }
    }

    const distributionResult = parseRequiredTableSection(text, "Distribution Proof");
    const distributionSection = distributionResult.ok ? distributionResult.section : undefined;
    const distributionColumnIndexes = distributionSection ? DISTRIBUTION_PROOF_HEADERS.map((headers) => tableColumnAny(distributionSection, headers)) : [];
    if (!distributionSection || distributionColumnIndexes.some((column) => column < 0)) {
      issues.push(
        issue(
          "error",
          "research.distribution_proof_columns_missing",
          "Distribution Proof needs audience, exact discovery location, native format, owned relationship, measured signal, and evidence ID columns.",
          "strategy/RESEARCH.md",
        ),
      );
    } else {
      const rows = distributionSection.rows;
      const sourceLedgerIds = sourceLedgerEvidence.eligibleIds;
      const genericLocation = /^(social media|online|internet|web|app store|community|creator audience)$/i;
      const rowsValid =
        rows.length > 0 &&
        rowsMatchTableWidth(distributionSection) &&
        rows.every((row) => {
          const cells = distributionColumnIndexes.map((column) => (row.cells[column] ?? "").trim());
          const audience = cells[0] ?? "";
          const location = cells[1] ?? "";
          const format = cells[2] ?? "";
          const ownedRoute = cells[3] ?? "";
          const measuredSignal = cells[4] ?? "";
          const evidenceIds = cells[5] ?? "";
          const parsedEvidenceIds = parseStableIdList(evidenceIds);
          const evidenceResolved =
            parsedEvidenceIds.validSyntax &&
            parsedEvidenceIds.ids.length > 0 &&
            parsedEvidenceIds.ids.every((evidenceId) => sourceLedgerIds.has(evidenceId) || signalEvidence.eligibleSignalIds.has(evidenceId));
          return (
            [audience, location, format, ownedRoute, measuredSignal, evidenceIds].every(
              (cell) => cell.length > 0 && !PLACEHOLDER_TEXT.test(cell) && !/\breplace with\b/i.test(cell),
            ) &&
            !isAbsentOwnedRelationship(ownedRoute) &&
            !genericLocation.test(location) &&
            /\d/.test(measuredSignal) &&
            evidenceResolved
          );
        });
      if (!rowsValid) {
        const invalidDistributionRow = rows.find((row) => {
          const cells = distributionColumnIndexes.map((column) => (row.cells[column] ?? "").trim());
          const audience = cells[0] ?? "";
          const location = cells[1] ?? "";
          const format = cells[2] ?? "";
          const ownedRoute = cells[3] ?? "";
          const measuredSignal = cells[4] ?? "";
          const evidenceIds = cells[5] ?? "";
          const parsedEvidenceIds = parseStableIdList(evidenceIds);
          const evidenceResolved =
            parsedEvidenceIds.validSyntax &&
            parsedEvidenceIds.ids.length > 0 &&
            parsedEvidenceIds.ids.every((evidenceId) => sourceLedgerIds.has(evidenceId) || signalEvidence.eligibleSignalIds.has(evidenceId));
          return !(
            [audience, location, format, ownedRoute, measuredSignal, evidenceIds].every(
              (cell) => cell.length > 0 && !PLACEHOLDER_TEXT.test(cell) && !/\breplace with\b/i.test(cell),
            ) &&
            !isAbsentOwnedRelationship(ownedRoute) &&
            !genericLocation.test(location) &&
            /\d/.test(measuredSignal) &&
            evidenceResolved
          );
        });
        issues.push(
          issue(
            "error",
            "research.distribution_proof_row_invalid",
            "Every Distribution Proof row needs a specific audience, discovery location, native format, owned route, and numeric measured signal. " +
              "Each Evidence ID must resolve through a complete Source Ledger row's URL/source-ID or Artifact/trace cell, or through a current/dated Signal Record.",
            "strategy/RESEARCH.md",
            {
              line: invalidDistributionRow?.sourceLine ?? distributionSection.headingLine,
              fixHint: "Repair the cited Distribution Proof row's first failing field and resolve every Evidence ID before rerunning the check.",
            },
          ),
        );
      }
    }

    if (strictResearch) {
      validateTransformationDemo(text, issues);
      validateDistributionFirstNiche(text, issues);
    }

    const verdictResult = parseRequiredTableSection(text, "Go, Pivot, Or Kill");
    if (!verdictResult.ok) {
      issues.push(
        issue(
          "error",
          "research.go_pivot_or_kill.section_missing",
          'strategy/RESEARCH.md mentions Go, Pivot, Or Kill but has no "## Go, Pivot, Or Kill" section. The gate reads the section, not the phrase.',
          "strategy/RESEARCH.md",
        ),
      );
    } else {
      const verdictSection = verdictResult.section;
      const dateColumn = tableColumnAny(verdictSection, VERDICT_HEADERS.date);
      const verdictColumn = tableColumnAny(verdictSection, VERDICT_HEADERS.verdict);
      const decidedColumn = tableColumnAny(verdictSection, VERDICT_HEADERS.decidedBy);
      const evidenceColumns = [
        tableColumnAny(verdictSection, VERDICT_HEADERS.categoryRevenue),
        tableColumnAny(verdictSection, VERDICT_HEADERS.wedge),
        tableColumnAny(verdictSection, VERDICT_HEADERS.demand),
        tableColumnAny(verdictSection, VERDICT_HEADERS.distribution),
        tableColumnAny(verdictSection, VERDICT_HEADERS.offerTest),
      ];
      const evidenceColumnsPresent = evidenceColumns.every((column) => column >= 0);
      if (!evidenceColumnsPresent) {
        issues.push(
          issue(
            "error",
            "research.go_pivot_kill_evidence_columns_missing",
            "The Go, Pivot, Or Kill table is missing its named evidence columns. Category revenue, wedge, demand, distribution, and offer test must " +
              "each have a named column — a verdict table with the reasons renamed or removed is a decision without its inputs.",
            "strategy/RESEARCH.md",
          ),
        );
      }
      const parsedRows = verdictSection.rows.map((row) => ({
        cells: row.cells,
        sourceLine: row.sourceLine,
        widthValid: row.rawCellCount === verdictSection.width,
        date: dateColumn >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.cells[dateColumn]?.trim() ?? "") ? (row.cells[dateColumn]?.trim() ?? "") : undefined,
        verdict:
          verdictColumn < 0
            ? undefined
            : (row.cells[verdictColumn] ?? "")
                .trim()
                .match(/^(go|pivot|kill)\b/i)?.[1]
                ?.toLowerCase(),
      }));
      const verdictRows = parsedRows.filter((row) => row.widthValid && row.date && row.verdict);
      // A malformed decision row (mistyped date, missing verdict keyword) is
      // reported, never silently dropped — dropping it would fall back to an
      // older verdict the founder already superseded.
      const malformedRows = parsedRows.filter((row) => !(row.widthValid && row.date && row.verdict) && row.cells.some((cell) => cell.trim().length > 0));
      if (malformedRows.length > 0) {
        issues.push(
          issue(
            "error",
            "research.go_pivot_kill_row_malformed",
            `The Go, Pivot, Or Kill table has ${malformedRows.length} row(s) with a mistyped date (ISO YYYY-MM-DD required) or verdict ` +
              `(Go/Pivot/Kill required). Fix the row — a malformed later decision must never silently lose to an older one.`,
            "strategy/RESEARCH.md",
            {
              line: malformedRows[0]?.sourceLine,
              fixHint: "Repair the named Go, Pivot, Or Kill row's date and verdict fields before relying on an older checkpoint.",
            },
          ),
        );
      }
      if (verdictRows.length === 0) {
        issues.push(
          issue(
            "error",
            "research.go_pivot_kill_row_missing",
            "Done research needs a completed Go, Pivot, Or Kill row: an ISO date, the evidence cells, and the founder's verdict. " +
              "The heading without a decided row is the pre-build kill gate left unwired.",
            "strategy/RESEARCH.md",
          ),
        );
      } else {
        // Later table rows win date ties: a same-day follow-up verdict
        // supersedes the row above it.
        const latest = verdictRows.reduce((a, b) => ((b.date ?? "") >= (a.date ?? "") ? b : a));
        // A verdict row must name its authority. V2 can cite the founder's opening
        // mandate; a free-form agent role cannot authorize itself.
        // The decision-maker is read from the named "Decided by" column, never
        // positionally — an unrelated Notes column sitting after Verdict must
        // not be able to satisfy the founder-only gate.
        const decidedByCell = decidedColumn < 0 ? "" : (latest.cells[decidedColumn] ?? "").trim();
        if (decidedByCell.length === 0 || PLACEHOLDER_TEXT.test(decidedByCell) || !isFounderDecider(decidedByCell)) {
          issues.push(
            issue(
              "error",
              "research.go_pivot_kill_decider_missing",
              'The latest Go, Pivot, Or Kill row lacks an authorized "Decided by" value. Use Founder opening mandate exactly, founder or owner, ' +
                "or the recorded owner name. An arbitrary agent label cannot authorize the build.",
              "strategy/RESEARCH.md",
              {
                line: latest.sourceLine,
                fixHint: "Set the named Go, Pivot, Or Kill row's Decided by field to an authorized founder or owner value.",
              },
            ),
          );
        }
        const evidenceCells = evidenceColumnsPresent ? evidenceColumns.map((column) => latest.cells[column] ?? "") : [];
        if (evidenceColumnsPresent && evidenceCells.some((cell) => cell.trim().length === 0 || PLACEHOLDER_TEXT.test(cell))) {
          issues.push(
            issue(
              "error",
              "research.go_pivot_kill_evidence_thin",
              "The latest Go, Pivot, Or Kill row carries empty or placeholder evidence cells. A verdict decided over " +
                '"unverified" is a mood, not a decision — fill category revenue, wedge, demand, distribution, and offer evidence before recording it.',
              "strategy/RESEARCH.md",
              {
                line: latest.sourceLine,
                fixHint: "Fill the named Go, Pivot, Or Kill row's missing evidence cells or record the applicable checkpoint hold.",
              },
            ),
          );
          evidenceCells.forEach((cell, index) => {
            if (cell.trim().length > 0 && !PLACEHOLDER_TEXT.test(cell)) return;
            const label = VERDICT_EVIDENCE_LABELS[index] ?? "named evidence";
            issues.push(
              issue(
                "error",
                "research.go_pivot_kill_evidence_field_invalid",
                `The latest Go, Pivot, Or Kill row has an empty or placeholder-only "${label}" cell; this decision input is not authored yet.`,
                "strategy/RESEARCH.md",
                {
                  line: latest.sourceLine,
                  fixHint: `Fill the "${label}" cell with the current evidence or record the applicable checkpoint hold; do not replace uncertainty with a fabricated result.`,
                },
              ),
            );
          });
        }
        if (latest.verdict !== "go") {
          issues.push(
            issue(
              "warning",
              "research.go_pivot_kill_not_go",
              `The latest Go, Pivot, Or Kill verdict is "${latest.verdict}". The research checkpoint is structurally valid, but initialization remains held until ` +
                `the accepted product is eligible: a Kill winds the idea down pre-build, while a Pivot re-enters Phase 1 with the wedge changed. ` +
                `Do not convert this checkpoint to Go or treat an unrun experiment as measured evidence.`,
              "strategy/RESEARCH.md",
            ),
          );
        }
      }
    }
  }

  if (strictResearch) {
    if (sourceLedgerEvidence.completeRowCount === 0) {
      issues.push(
        issue(
          "error",
          "research.source_ledger_row_missing",
          "Done research needs at least one complete Source Ledger evidence row with a valid, non-future Observed at timestamp; headers and an unrelated date are not proof.",
          "strategy/RESEARCH.md",
        ),
      );
    }
  }
}

if (verdictRequired) {
  validateOfferTest(offerText, issues, isFounderDecider);
}

if (process.argv.includes("--explain")) {
  console.log(
    JSON.stringify({
      check: "research-workflow-output",
      description: "Read-only structural and evidence contract for the research artifacts.",
      artifacts: {
        research: {
          path: "strategy/RESEARCH.md",
          requiredSections: ["Source Ledger", "Decision Inputs", "Decision Log", "Category Revenue Reality", "Go, Pivot, Or Kill"],
          confidence: ["low", "medium", "high"],
          dates: "past ISO/RFC3339 dates; future observations are invalid",
        },
        signalCorpus: {
          path: "strategy/SIGNAL_CORPUS.md",
          requiredSections: ["Corpus Inputs", "Signal Records", "Conflicts And Supersession", "Derived Outputs"],
          ids: "explicit INPUT-* and SIG-* identifiers; supported separators remain valid",
          status: ["current", "superseded", "rejected", "unverified"],
        },
        offerTest: {
          path: "strategy/OFFER_TEST.md",
          requiredSections: ["Test Contract", "Measurement", "Decision"],
          waiver: "a waiver must bind to the final decision date and actor",
        },
      },
      lifecycle: "Go, Pivot, or Kill is an authored checkpoint; explanation does not initialize a lane or certify a claim.",
      limits: "This explains the enforced contract. It does not replace validation, independent review, or runtime/provider proof.",
    }),
  );
  process.exit(0);
}

reportAndExit("Research evidence check", issues);

interface SignalCorpusIndex {
  signalLifecycles: Map<string, SignalLifecycle>;
  eligibleSignalIds: Set<string>;
}

function emptySignalCorpusIndex(): SignalCorpusIndex {
  return { signalLifecycles: new Map(), eligibleSignalIds: new Set() };
}

function firstInvalidField(fields: readonly (readonly [string, boolean])[]): string {
  return fields.find(([, valid]) => !valid)?.[0] ?? "row shape";
}

function validateSignalCorpus(value: string | undefined, target: ReturnType<typeof issue>[], strict: boolean): SignalCorpusIndex {
  const index = emptySignalCorpusIndex();
  if (!value) {
    target.push(
      issue(
        "error",
        "research.signal_corpus_missing",
        "strategy/SIGNAL_CORPUS.md is required before the Go, Pivot, or Kill decision.",
        "strategy/SIGNAL_CORPUS.md",
      ),
    );
    return index;
  }

  const sections = {
    inputs: parseRequiredTableSection(value, "Corpus Inputs"),
    records: parseRequiredTableSection(value, "Signal Records"),
    conflicts: parseRequiredTableSection(value, "Conflicts And Supersession"),
    derived: parseRequiredTableSection(value, "Derived Outputs"),
  };
  const sectionEntries = [
    ["Corpus Inputs", sections.inputs],
    ["Signal Records", sections.records],
    ["Conflicts And Supersession", sections.conflicts],
    ["Derived Outputs", sections.derived],
  ] as const;

  const renderedStatus = parseRenderedTopLevelStatus(value);
  const notApplicable = renderedStatus.ok ? renderedStatus.status.value.match(/^not applicable\b(.*)$/i) : null;
  if (notApplicable) {
    const reason = (notApplicable[1] ?? "").replace(/^[\s:—-]+/, "").trim();
    if (
      reason.length === 0 ||
      isEmptySignalNotApplicableReason(reason) ||
      /\b(todo|tbd|placeholder|replace with|unverified|pending|authored reason)\b/i.test(reason) ||
      /<[^>]+>/.test(reason)
    ) {
      target.push(
        issue(
          "error",
          "research.signal_corpus_not_applicable_reason_missing",
          "A not-applicable signal corpus needs an authored reason. Do not fabricate signal rows when no reusable source material exists.",
          "strategy/SIGNAL_CORPUS.md",
          renderedStatus.ok
            ? {
                line: renderedStatus.status.sourceLine,
                fixHint:
                  "Replace the not-applicable status reason with a specific authored explanation, or remove the exemption and provide the required Signal Corpus tables.",
              }
            : undefined,
        ),
      );
    }
    const retainedOrAmbiguousSections = sectionEntries.filter(([, result]) =>
      result.ok ? result.section.rows.length > 0 : result.errors.some((error) => error.kind !== "section-missing"),
    );
    if (retainedOrAmbiguousSections.length > 0) {
      target.push(
        issue(
          "error",
          "research.signal_corpus_not_applicable_rows_present",
          "A not-applicable signal corpus cannot retain starter or evidence rows. Remove the corpus rows instead of relabeling fabricated data as not applicable.",
          "strategy/SIGNAL_CORPUS.md",
        ),
      );
    }
    return index;
  }

  for (const [heading, result] of sectionEntries) {
    if (!result.ok) {
      target.push(
        issue(
          strict ? "error" : "warning",
          `research.signal_corpus_${heading.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_missing`,
          `strategy/SIGNAL_CORPUS.md needs a ${heading} section.`,
          "strategy/SIGNAL_CORPUS.md",
        ),
      );
    }
  }

  const placeholder = /\b(todo|tbd|placeholder|replace with|pending|unverified|authored reason|yyyy-mm-dd)\b|<[^>]+>/i;
  const inputs = sections.inputs.ok ? sections.inputs.section : undefined;
  const inputColumnIndexes = inputs ? SIGNAL_CORPUS_HEADERS.inputs.map((headers) => tableColumnAny(inputs, headers)) : [];
  const declaredInputIds = new Set<string>();
  if (!inputs || inputColumnIndexes.some((column) => column < 0)) {
    target.push(
      issue(
        "error",
        "research.signal_corpus_input_columns_missing",
        "The Corpus Inputs table needs input ID, source type, owner or creator, scope, date range, collection route, permission or public basis, and limits columns.",
        "strategy/SIGNAL_CORPUS.md",
      ),
    );
  } else {
    const inputRows = inputs.rows;
    let inputRowsValid = inputRows.length > 0 && rowsMatchTableWidth(inputs);
    for (const row of inputRows) {
      const cells = inputColumnIndexes.map((column) => (row.cells[column] ?? "").trim());
      const inputId = (cells[0] ?? "").toUpperCase();
      const complete =
        /^INPUT-[A-Z0-9][A-Z0-9-]*$/.test(inputId) &&
        cells.slice(1).every((cell) => cell.length > 0 && !isPlaceholderOnly(cell)) &&
        isValidPastIsoDateRange(cells[4] ?? "") &&
        !declaredInputIds.has(inputId);
      if (!complete) {
        inputRowsValid = false;
        continue;
      }
      declaredInputIds.add(inputId);
    }
    if (!inputRowsValid) {
      const invalidRow = inputRows.find((row) => {
        const cells = inputColumnIndexes.map((column) => (row.cells[column] ?? "").trim());
        const inputId = (cells[0] ?? "").toUpperCase();
        return !(
          /^INPUT-[A-Z0-9][A-Z0-9-]*$/.test(inputId) &&
          cells.slice(1).every((cell) => cell.length > 0 && !isPlaceholderOnly(cell)) &&
          isValidPastIsoDateRange(cells[4] ?? "") &&
          !declaredInputIds.has(inputId)
        );
      });
      const invalidField = invalidRow
        ? (() => {
            const cells = inputColumnIndexes.map((column) => (invalidRow.cells[column] ?? "").trim());
            const inputId = (cells[0] ?? "").toUpperCase();
            return firstInvalidField([
              ["Input ID", /^INPUT-[A-Z0-9][A-Z0-9-]*$/.test(inputId) && !declaredInputIds.has(inputId)],
              ["Source type", cells[1]!.length > 0 && !isPlaceholderOnly(cells[1]!)],
              ["Owner or creator", cells[2]!.length > 0 && !isPlaceholderOnly(cells[2]!)],
              ["Scope", cells[3]!.length > 0 && !isPlaceholderOnly(cells[3]!)],
              ["Date range", isValidPastIsoDateRange(cells[4]!)],
              ["Collection route", cells[5]!.length > 0 && !isPlaceholderOnly(cells[5]!)],
              ["Permission or public basis", cells[6]!.length > 0 && !isPlaceholderOnly(cells[6]!)],
              ["Limits", cells[7]!.length > 0 && !isPlaceholderOnly(cells[7]!)],
            ]);
          })()
        : "row shape";
      target.push(
        issue(
          "error",
          "research.signal_corpus_input_row_invalid",
          "Every Corpus Inputs row needs a unique stable INPUT ID and an ISO-dated range. " +
            "It also needs real source, ownership, collection route, permission or public basis, and limits values.",
          "strategy/SIGNAL_CORPUS.md",
          invalidRow
            ? {
                line: invalidRow.sourceLine,
                fixHint: `Repair the Corpus Inputs row's ${invalidField} field first; use one INPUT-* ID and a real YYYY-MM-DD date or date range.`,
              }
            : undefined,
        ),
      );
    }
  }

  const records = sections.records.ok ? sections.records.section : undefined;
  const recordColumns = records ? SIGNAL_CORPUS_HEADERS.records.map((headers) => tableColumnAny(records, headers)) : [];
  if (!records || recordColumns.some((column) => column < 0)) {
    target.push(
      issue(
        "error",
        "research.signal_corpus_columns_missing",
        "The Signal Records table needs identity, provenance, date, applicability, confidence, lifecycle, supersession, and trace columns.",
        "strategy/SIGNAL_CORPUS.md",
      ),
    );
  } else {
    const signalRows = records.rows;
    const supersessionRecords = signalRows.flatMap((row): SignalSupersessionRecord[] => {
      const id = (row.cells[recordColumns[0]!] ?? "").trim().toUpperCase();
      const lifecycle = (row.cells[recordColumns[7]!] ?? "").trim().toLowerCase();
      if (!/^SIG-[A-Z0-9][A-Z0-9-]*$/.test(id) || !/^(current|dated|superseded|rejected|unverified)$/.test(lifecycle)) return [];
      return [{ id, lifecycle: lifecycle as SignalLifecycle, replacementId: (row.cells[recordColumns[8]!] ?? "").trim().toUpperCase() }];
    });
    const invalidSupersessionIds = new Set(validateSignalSupersessionGraph(supersessionRecords).invalidSignalIds);
    const seenSignalIds = new Set<string>();
    let rowsComplete = signalRows.length > 0 && rowsMatchTableWidth(records);
    let unresolvedSource = false;
    for (const row of signalRows) {
      const cells = recordColumns.map((column) => (row.cells[column] ?? "").trim());
      const id = (cells[0] ?? "").toUpperCase();
      const type = cells[1] ?? "";
      const claim = cells[2] ?? "";
      const sources = cells[3] ?? "";
      const observedAt = cells[4] ?? "";
      const appliesTo = cells[5] ?? "";
      const confidence = cells[6] ?? "";
      const lifecycle = (cells[7] ?? "").toLowerCase() as SignalLifecycle;
      const trace = cells[9] ?? "";
      const sourceIds = parsePrefixedIdList(sources, "INPUT");
      const sourcesResolve = sourceIds.validSyntax && sourceIds.ids.length > 0 && sourceIds.ids.every((sourceId) => declaredInputIds.has(sourceId));
      const supersessionValid = lifecycle !== "superseded" || !invalidSupersessionIds.has(id);
      const rowComplete =
        /^SIG-[A-Z0-9][A-Z0-9-]*$/.test(id) &&
        type.length > 0 &&
        !isPlaceholderOnly(type) &&
        claim.length > 0 &&
        !isPlaceholderOnly(claim) &&
        appliesTo.length > 0 &&
        !isPlaceholderOnly(appliesTo) &&
        trace.length > 0 &&
        !isPlaceholderOnly(trace) &&
        isValidPastIsoDate(observedAt) &&
        /^(low|medium|high)$/i.test(confidence) &&
        /^(current|dated|superseded|rejected|unverified)$/.test(lifecycle) &&
        supersessionValid &&
        !seenSignalIds.has(id);
      if (!sourcesResolve) unresolvedSource = true;
      if (!sourcesResolve) {
        const sourceMessage = !sourceIds.validSyntax
          ? "Source IDs must be an explicit list of INPUT-* IDs; do not use ranges or mixed prose."
          : "Every referenced INPUT-* ID must resolve to a complete Corpus Inputs row.";
        target.push(
          issue(
            "error",
            "research.signal_corpus_source_reference_invalid",
            `Signal Records row ${id || "(unidentified)"}: ${sourceMessage}`,
            "strategy/SIGNAL_CORPUS.md",
            { line: row.sourceLine, fixHint: sourceMessage },
          ),
        );
      }
      if (confidence && !/^(low|medium|high)$/i.test(confidence)) {
        target.push(
          issue(
            "error",
            "research.signal_corpus_confidence_invalid",
            `Signal Records row ${id || "(unidentified)"}: Confidence must be exactly low, medium, or high.`,
            "strategy/SIGNAL_CORPUS.md",
            { line: row.sourceLine, fixHint: "Use low, medium, or high; keep qualifiers in Claim or Phrase, Observation, or Inference." },
          ),
        );
      }
      if (!rowComplete || !sourcesResolve) {
        rowsComplete = false;
        continue;
      }
      seenSignalIds.add(id);
      index.signalLifecycles.set(id, lifecycle);
      if (lifecycle === "current" || lifecycle === "dated") index.eligibleSignalIds.add(id);
    }
    if (!rowsComplete) {
      const invalidRow = signalRows.find((row) => {
        const cells = recordColumns.map((column) => (row.cells[column] ?? "").trim());
        const id = (cells[0] ?? "").toUpperCase();
        const claim = cells[2] ?? "";
        const sourceIds = parsePrefixedIdList(cells[3] ?? "", "INPUT");
        return !(
          /^SIG-[A-Z0-9][A-Z0-9-]*$/.test(id) &&
          claim.length > 0 &&
          !isPlaceholderOnly(claim) &&
          isValidPastIsoDate(cells[4] ?? "") &&
          /^(low|medium|high)$/i.test(cells[6] ?? "") &&
          /^(current|dated|superseded|rejected|unverified)$/.test((cells[7] ?? "").toLowerCase()) &&
          sourceIds.validSyntax &&
          sourceIds.ids.length > 0 &&
          sourceIds.ids.every((sourceId) => declaredInputIds.has(sourceId)) &&
          [cells[1] ?? "", cells[5] ?? "", cells[9] ?? ""].every((cell) => cell.length > 0 && !isPlaceholderOnly(cell))
        );
      });
      const invalidField = invalidRow
        ? (() => {
            const cells = recordColumns.map((column) => (invalidRow.cells[column] ?? "").trim());
            const id = (cells[0] ?? "").toUpperCase();
            const sourceIds = parsePrefixedIdList(cells[3] ?? "", "INPUT");
            return firstInvalidField([
              ["Signal ID", /^SIG-[A-Z0-9][A-Z0-9-]*$/.test(id) && !seenSignalIds.has(id)],
              ["Type", cells[1]!.length > 0 && !isPlaceholderOnly(cells[1]!)],
              ["Claim or phrase", cells[2]!.length > 0 && !isPlaceholderOnly(cells[2]!)],
              ["Source IDs", sourceIds.validSyntax && sourceIds.ids.length > 0 && sourceIds.ids.every((sourceId) => declaredInputIds.has(sourceId))],
              ["Observed at", isValidPastIsoDate(cells[4]!)],
              ["Applies to", cells[5]!.length > 0 && !isPlaceholderOnly(cells[5]!)],
              ["Confidence", /^(low|medium|high)$/i.test(cells[6]!)],
              ["Status", /^(current|dated|superseded|rejected|unverified)$/.test(cells[7]!.toLowerCase())],
              ["Supersedes", cells[7]!.toLowerCase() !== "superseded" || !invalidSupersessionIds.has(id)],
              ["Artifact or trace", cells[9]!.length > 0 && !isPlaceholderOnly(cells[9]!)],
            ]);
          })()
        : "row shape";
      target.push(
        issue(
          "error",
          "research.signal_corpus_row_missing",
          "Every declared Signal Records row needs a unique stable ID, dated provenance, applicability, confidence, a documented lifecycle, valid supersession data, and a trace pointer. " +
            "A supersession chain must be acyclic and end at a current or dated replacement." +
            (invalidRow
              ? ` First invalid row: line ${invalidRow.sourceLine}; inspect its ID, claim, date, confidence, lifecycle, source IDs, and trace fields.`
              : ""),
          "strategy/SIGNAL_CORPUS.md",
          invalidRow
            ? {
                line: invalidRow.sourceLine,
                fixHint: `Repair the Signal Records row's ${invalidField} field first; keep narrative claims as prose and replace only a placeholder-only value, malformed ID/date, unsupported confidence/lifecycle, or unresolved INPUT-* reference.`,
              }
            : undefined,
        ),
      );
    }
    if (unresolvedSource) {
      target.push(
        issue(
          "error",
          "research.signal_corpus_source_unresolved",
          "Every Source ID in Signal Records must resolve to a complete row in Corpus Inputs. Use comma-separated INPUT IDs only.",
          "strategy/SIGNAL_CORPUS.md",
          (() => {
            const row = signalRows.find((candidate) => {
              const cells = recordColumns.map((column) => (candidate.cells[column] ?? "").trim());
              const sourceIds = parsePrefixedIdList(cells[3] ?? "", "INPUT");
              return !sourceIds.validSyntax || sourceIds.ids.length === 0 || sourceIds.ids.some((sourceId) => !declaredInputIds.has(sourceId));
            });
            return row ? { line: row.sourceLine, fixHint: "Declare each cited INPUT-* row in Corpus Inputs, or correct the reference syntax." } : undefined;
          })(),
        ),
      );
    }
  }

  const conflicts = sections.conflicts.ok ? sections.conflicts.section : undefined;
  const conflictColumnIndexes = conflicts ? SIGNAL_CORPUS_HEADERS.conflicts.map((headers) => tableColumnAny(conflicts, headers)) : [];
  if (conflicts && conflictColumnIndexes.some((column) => column < 0)) {
    target.push(
      issue(
        "error",
        "research.signal_corpus_conflicts_and_supersession_missing",
        "The Conflicts And Supersession table needs Earlier signal, Later signal, Conflict, Current position, and Reason columns.",
        "strategy/SIGNAL_CORPUS.md",
      ),
    );
  } else if (conflicts) {
    const conflictRows = conflicts.rows.map((row) => {
      const cells = conflictColumnIndexes.map((column) => (row.cells[column] ?? "").trim());
      const [earlier, later, conflict] = cells;
      return {
        cells,
        noConflict: /^none$/i.test(earlier ?? "") && /^none$/i.test(later ?? "") && /^no(?: material)? conflict\b/i.test(conflict ?? ""),
      };
    });
    const invalidConflictRow =
      conflictRows.length === 0 ||
      !rowsMatchTableWidth(conflicts) ||
      conflictRows.some(({ cells, noConflict }) => {
        const [earlier, later] = cells;
        const complete = cells.every((cell) => cell.length > 0 && !placeholder.test(cell));
        if (!complete) return true;
        if (noConflict) return false;
        const earlierId = (earlier ?? "").toUpperCase();
        const laterId = (later ?? "").toUpperCase();
        return !(
          /^SIG-[A-Z0-9][A-Z0-9-]*$/.test(earlierId) &&
          /^SIG-[A-Z0-9][A-Z0-9-]*$/.test(laterId) &&
          earlierId !== laterId &&
          index.signalLifecycles.has(earlierId) &&
          index.signalLifecycles.has(laterId)
        );
      }) ||
      (conflictRows.some((row) => row.noConflict) && (conflictRows.length !== 1 || !conflictRows[0]?.noConflict));
    if (invalidConflictRow) {
      target.push(
        issue(
          "error",
          "research.signal_corpus_conflict_row_invalid",
          "Every authored Conflicts And Supersession row must be width-complete and substantive. Signal IDs must resolve to distinct declared records; use a complete none/none no-conflict row only when no material conflict exists.",
          "strategy/SIGNAL_CORPUS.md",
        ),
      );
    }
  }

  const derived = sections.derived.ok ? sections.derived.section : undefined;
  const derivedColumnIndexes = derived ? SIGNAL_CORPUS_HEADERS.derived.map((headers) => tableColumnAny(derived, headers)) : [];
  if (!derived || derivedColumnIndexes.some((column) => column < 0)) {
    target.push(
      issue(
        "error",
        "research.signal_corpus_derived_columns_missing",
        "The Derived Outputs table needs Signal IDs, Output, Decision changed, and Trace ID columns.",
        "strategy/SIGNAL_CORPUS.md",
      ),
    );
  } else {
    const invalidDerivedRow =
      derived.rows.find((row) => {
        const cells = derivedColumnIndexes.map((column) => (row.cells[column] ?? "").trim());
        const signalIds = parsePrefixedIdList(cells[0] ?? "", "SIG");
        return !(
          signalIds.validSyntax &&
          signalIds.ids.length > 0 &&
          signalIds.ids.every((signalId) => index.eligibleSignalIds.has(signalId)) &&
          [cells[1] ?? "", cells[2] ?? ""].every((cell) => cell.length > 0 && !placeholder.test(cell)) &&
          /\bTRACE-[A-Z0-9][A-Z0-9-]*\b/i.test(cells[3] ?? "") &&
          !placeholder.test(cells[3] ?? "")
        );
      }) ?? (!rowsMatchTableWidth(derived) || derived.rows.length === 0 ? { sourceLine: derived.headingLine } : undefined);
    if (invalidDerivedRow) {
      const cells = "cells" in invalidDerivedRow ? derivedColumnIndexes.map((column) => (invalidDerivedRow.cells[column] ?? "").trim()) : [];
      const signalIds = parsePrefixedIdList(cells[0] ?? "", "SIG");
      const invalidField = firstInvalidField([
        ["Signal IDs", signalIds.validSyntax && signalIds.ids.length > 0 && signalIds.ids.every((signalId) => index.eligibleSignalIds.has(signalId))],
        ["Output", Boolean(cells[1]) && !placeholder.test(cells[1] ?? "")],
        ["Decision changed", Boolean(cells[2]) && !placeholder.test(cells[2] ?? "")],
        ["Trace ID", /\bTRACE-[A-Z0-9][A-Z0-9-]*\b/i.test(cells[3] ?? "") && !placeholder.test(cells[3] ?? "")],
      ]);
      target.push(
        issue(
          "error",
          "research.signal_corpus_derived_output_invalid",
          `Derived Outputs row's ${invalidField} field is invalid. Every row must cite only current or dated Signal IDs, name a real output and changed decision, and include a TRACE ID. ` +
            "Keep unverified, rejected, and superseded signals in the corpus, but do not use them to support an output.",
          "strategy/SIGNAL_CORPUS.md",
          {
            line: invalidDerivedRow.sourceLine,
            fixHint: `Repair the Derived Outputs row's ${invalidField} field first; use eligible SIG-* IDs and a real output, changed decision, and TRACE-* trace ID.`,
          },
        ),
      );
    }
  }

  return index;
}

function validateTransformationDemo(text: string, target: ReturnType<typeof issue>[]): void {
  const demoResult = parseRequiredTableSection(text, "Transformation Demo");
  const demoSection = demoResult.ok ? demoResult.section : undefined;
  const demoColumns = demoSection ? TRANSB2C_APP_BUILDER_DEMO_HEADERS.map((headers) => tableColumnAny(demoSection, headers)) : [];
  if (!demoSection || demoColumns.some((column) => column < 0)) {
    target.push(
      issue(
        "error",
        "research.transb2c_demo_columns_missing",
        "Transformation Demo needs screenshot path, 15s script, transformation shown, and why-not-a-vitamin columns.",
        "strategy/RESEARCH.md",
      ),
    );
    return;
  }
  const placeholder = /\b(pending|todo|tbd|placeholder|replace with|example)\b/i;
  const vitamin = /\b(vitamin|wellness boost|nice to have|generic productivity|feel better)\b/i;
  const screenshotOk = /\.(png|jpe?g|webp|gif)$/i;
  const rowsValid =
    demoSection.rows.length > 0 &&
    rowsMatchTableWidth(demoSection) &&
    demoSection.rows.every((row) => {
      const cells = demoColumns.map((column) => (row.cells[column] ?? "").trim());
      const screenshot = cells[0] ?? "";
      const script = cells[1] ?? "";
      const transformation = cells[2] ?? "";
      const notVitamin = cells[3] ?? "";
      return (
        cells.every((cell) => cell.length > 0 && !placeholder.test(cell)) &&
        (screenshot.includes("/") || screenshotOk.test(screenshot)) &&
        script.length >= 24 &&
        transformation.length >= 16 &&
        !vitamin.test(transformation) &&
        notVitamin.length >= 16
      );
    });
  if (!rowsValid) {
    const invalidRow = demoSection.rows.find((row) => {
      const cells = demoColumns.map((column) => (row.cells[column] ?? "").trim());
      const screenshot = cells[0] ?? "";
      const script = cells[1] ?? "";
      const transformation = cells[2] ?? "";
      const notVitamin = cells[3] ?? "";
      return !(
        cells.every((cell) => cell.length > 0 && !placeholder.test(cell)) &&
        (screenshot.includes("/") || screenshotOk.test(screenshot)) &&
        script.length >= 24 &&
        transformation.length >= 16 &&
        !vitamin.test(transformation) &&
        notVitamin.length >= 16
      );
    });
    const demoCells = invalidRow ? demoColumns.map((column) => (invalidRow.cells[column] ?? "").trim()) : [];
    const invalidField = firstInvalidField([
      ["Screenshot path", Boolean(demoCells[0]) && (demoCells[0]!.includes("/") || screenshotOk.test(demoCells[0]!))],
      ["15s script", Boolean(demoCells[1]) && demoCells[1]!.length >= 24 && !placeholder.test(demoCells[1]!)],
      ["Transformation shown", Boolean(demoCells[2]) && demoCells[2]!.length >= 16 && !placeholder.test(demoCells[2]!) && !vitamin.test(demoCells[2]!)],
      ["Why-not-a-vitamin", Boolean(demoCells[3]) && demoCells[3]!.length >= 16 && !placeholder.test(demoCells[3]!)],
    ]);
    target.push(
      issue(
        "error",
        "research.transb2c_demo_row_invalid",
        `Transformation Demo row's ${invalidField} field is invalid. The row needs one screenshot path, a 15s script, a concrete before-to-after transformation, and a painkiller reason. Vitamin features fail.`,
        "strategy/RESEARCH.md",
        {
          line: invalidRow?.sourceLine ?? demoSection.headingLine,
          fixHint: `Repair the named Transformation Demo row's ${invalidField} field first; use a real screenshot path, a concrete 15s script, a before-to-after transformation, and a painkiller reason.`,
        },
      ),
    );
  }
}

function validateDistributionFirstNiche(text: string, target: ReturnType<typeof issue>[]): void {
  const nicheResult = parseRequiredTableSection(text, "Distribution-First Niche");
  const nicheSection = nicheResult.ok ? nicheResult.section : undefined;
  const nicheColumns = nicheSection ? DISTRIBUTION_FIRST_HEADERS.map((headers) => tableColumnAny(nicheSection, headers)) : [];
  if (!nicheSection || nicheColumns.some((column) => column < 0)) {
    target.push(
      issue(
        "error",
        "research.distribution_first_columns_missing",
        "Distribution-First Niche needs paying audience, named channel, and purchases-as-validation columns.",
        "strategy/RESEARCH.md",
      ),
    );
    return;
  }
  const placeholder = /\b(pending|todo|tbd|placeholder|replace with|example)\b/i;
  const genericChannel = /^(social media|online|internet|web|ads|organic)$/i;
  const compliment = /\b(like|likes|compliment|interested|waitlist only)\b/i;
  const rowsValid =
    nicheSection.rows.length > 0 &&
    rowsMatchTableWidth(nicheSection) &&
    nicheSection.rows.every((row) => {
      const cells = nicheColumns.map((column) => (row.cells[column] ?? "").trim());
      const paying = cells[0] ?? "";
      const channel = cells[1] ?? "";
      const purchases = cells[2] ?? "";
      return (
        cells.every((cell) => cell.length >= 12 && !placeholder.test(cell)) &&
        /\b(pay|paid|price|iap|subscription|spend)\b/i.test(paying) &&
        !genericChannel.test(channel) &&
        /\b(purchase|paid|revenue|iap|subscribe)\b/i.test(purchases) &&
        !compliment.test(purchases)
      );
    });
  if (!rowsValid) {
    const invalidRow = nicheSection.rows.find((row) => {
      const cells = nicheColumns.map((column) => (row.cells[column] ?? "").trim());
      const paying = cells[0] ?? "";
      const channel = cells[1] ?? "";
      const purchases = cells[2] ?? "";
      return !(
        cells.every((cell) => cell.length >= 12 && !placeholder.test(cell)) &&
        /\b(pay|paid|price|iap|subscription|spend)\b/i.test(paying) &&
        !genericChannel.test(channel) &&
        /\b(purchase|paid|revenue|iap|subscribe)\b/i.test(purchases) &&
        !compliment.test(purchases)
      );
    });
    const nicheCells = invalidRow ? nicheColumns.map((column) => (invalidRow.cells[column] ?? "").trim()) : [];
    const invalidField = firstInvalidField([
      [
        "Paying audience",
        Boolean(nicheCells[0]) &&
          nicheCells[0]!.length >= 12 &&
          !placeholder.test(nicheCells[0]!) &&
          /\b(pay|paid|price|iap|subscription|spend)\b/i.test(nicheCells[0]!),
      ],
      ["Named channel", Boolean(nicheCells[1]) && nicheCells[1]!.length >= 12 && !placeholder.test(nicheCells[1]!) && !genericChannel.test(nicheCells[1]!)],
      [
        "Purchases as validation",
        Boolean(nicheCells[2]) &&
          nicheCells[2]!.length >= 12 &&
          !placeholder.test(nicheCells[2]!) &&
          /\b(purchase|paid|revenue|iap|subscribe)\b/i.test(nicheCells[2]!) &&
          !compliment.test(nicheCells[2]!),
      ],
    ]);
    target.push(
      issue(
        "error",
        "research.distribution_first_row_invalid",
        `Distribution-First Niche row's ${invalidField} field is invalid. The row needs a paying audience, one named channel, and purchases as validation. Compliments and likes do not count.`,
        "strategy/RESEARCH.md",
        {
          line: invalidRow?.sourceLine ?? nicheSection.headingLine,
          fixHint: `Repair the named Distribution-First Niche row's ${invalidField} field first; name a paying audience, a specific channel, and purchase or revenue validation.`,
        },
      ),
    );
  }
}

function tableColumnAny(section: RequiredTableSection, headers: readonly string[]): number {
  for (const header of headers) {
    const column = tableColumn(section, header);
    if (column >= 0) return column;
  }
  return -1;
}

function isEmptySignalNotApplicableReason(value: string): boolean {
  return isEmptyEquivalentEvidenceValue(value);
}

function isFounderDecider(value: string): boolean {
  const candidate = value.trim();
  if (candidate.length === 0) return false;
  if (candidate === FOUNDER_OPENING_MANDATE) return true;
  if (AUTOMATION_IDENTITY.test(candidate)) return false;
  return /\b(founder|owner)\b/i.test(candidate) || (projectOwner.length > 2 && candidate.toLowerCase().includes(projectOwner.toLowerCase()));
}

interface SourceLedgerColumns {
  source: number;
  platform: number;
  identity: number;
  observedAt: number;
  backendQuery: number;
  transcriptVisual: number;
  observation: number;
  inference: number;
  confidence: number;
  artifactTrace: number;
}

interface SourceLedgerEvidence {
  columns: SourceLedgerColumns;
  completeRowCount: number;
  hasDatedEvidence: boolean;
  eligibleIds: Set<string>;
}

function buildSourceLedgerEvidence(section: RequiredTableSection | undefined): SourceLedgerEvidence {
  const columns: SourceLedgerColumns = {
    source: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.source) : -1,
    platform: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.platform) : -1,
    identity: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.identity) : -1,
    observedAt: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.observedAt) : -1,
    backendQuery: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.backendQuery) : -1,
    transcriptVisual: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.transcriptVisual) : -1,
    observation: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.observation) : -1,
    inference: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.inference) : -1,
    confidence: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.confidence) : -1,
    artifactTrace: section ? tableColumnAny(section, SOURCE_LEDGER_HEADERS.artifactTrace) : -1,
  };
  const eligibleIds = new Set<string>();
  if (!section || Object.values(columns).some((column) => column < 0) || !rowsMatchTableWidth(section)) {
    return { columns, completeRowCount: 0, hasDatedEvidence: false, eligibleIds };
  }

  const hasDatedEvidence = section.rows.some((row) => isValidNonFutureRfc3339Instant(row.cells[columns.observedAt]));
  const completeRows = section.rows.filter((row) => isCompleteSourceLedgerRow(row.cells, columns));
  for (const row of completeRows) {
    for (const sourceId of extractStableIds(row.cells[columns.identity] ?? "")) eligibleIds.add(sourceId);
    for (const traceId of extractStableIds(row.cells[columns.artifactTrace] ?? "")) eligibleIds.add(traceId);
  }
  return { columns, completeRowCount: completeRows.length, hasDatedEvidence, eligibleIds };
}

function isCompleteSourceLedgerRow(cells: readonly string[], columns: SourceLedgerColumns): boolean {
  const source = cells[columns.source];
  const platform = cells[columns.platform];
  const identity = cells[columns.identity];
  const observedAt = cells[columns.observedAt];
  const backendQuery = cells[columns.backendQuery];
  const transcriptVisual = cells[columns.transcriptVisual];
  const observation = cells[columns.observation];
  const inference = cells[columns.inference];
  const confidence = cells[columns.confidence];
  const artifactTrace = cells[columns.artifactTrace];
  const placeholder = /\b(pending|todo|tbd|placeholder|replace with|n\/a without reason)\b|<[^>]+>/i;
  const requiredTextCells = [source, platform, identity, backendQuery, transcriptVisual, observation, inference, artifactTrace];
  return Boolean(
    requiredTextCells.every((cell) => cell?.trim()) &&
    [source, platform, identity, backendQuery, artifactTrace].every((cell) => !placeholder.test(cell ?? "")) &&
    [transcriptVisual, observation, inference].every((cell) => !isPlaceholderOnly(cell ?? "")) &&
    isValidNonFutureRfc3339Instant(observedAt) &&
    /^(low|medium|high)$/i.test(confidence?.trim() ?? ""),
  );
}

interface ParsedIdList {
  ids: string[];
  validSyntax: boolean;
}

function parsePrefixedIdList(value: string, prefix: string): ParsedIdList {
  const parsed = parseStableIdList(value);
  return {
    ids: parsed.ids,
    validSyntax: parsed.validSyntax && parsed.ids.every((id) => id.startsWith(`${prefix.toUpperCase()}-`)),
  };
}

function parseStableIdList(value: string): ParsedIdList {
  const ids = extractStableIds(value);
  const remainder = value
    .replace(/\b[A-Z][A-Z0-9_-]*-[A-Z0-9][A-Z0-9_-]*\b/gi, " ")
    .replace(/\b(?:and)\b/gi, " ")
    .replace(/[\s,;+/&()[\]`]+/g, "");
  return { ids: [...new Set(ids)], validSyntax: remainder.length === 0 };
}

function extractStableIds(value: string): string[] {
  return [...value.matchAll(/\b[A-Z][A-Z0-9_-]*-[A-Z0-9][A-Z0-9_-]*\b/gi)].map((match) => (match[0] ?? "").toUpperCase());
}

function isValidPastIsoDateRange(value: string): boolean {
  const dates = value.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (dates.length < 1 || dates.length > 2 || !dates.every(isValidPastIsoDate)) return false;
  return dates.length === 1 || dates[0]! <= dates[1]!;
}
