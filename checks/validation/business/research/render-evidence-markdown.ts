/**
 * render-evidence-markdown.ts — turn a schema-conformant evidence document into the
 * exact strict Markdown dialect checks/validation/business/process/required-table-section.ts parses.
 *
 * This is the seam between "machine-readable JSON that satisfies kernel/schema/{research-evidence,
 * signal-corpus,offer-test}.schema.json" and "a strategy/*.md file check-research-evidence.ts
 * accepts." Every function here is pure: no filesystem access, no network access, no clock reads
 * beyond what the caller's document already carries.
 *
 * WHY these specific mechanics matter (see required-table-section.ts):
 *   - Headings render as plain `## Heading` — never inside a fence, never as raw HTML. Fenced or
 *     HTML-wrapped headings and tables are invisible to the parser.
 *   - Table separators are `| --- |` cells, one per header, in header order.
 *   - A pipe character inside a cell would corrupt the row, and escaped pipes ("\|") are rejected
 *     outright by the parser — every cell value is sanitized to remove literal pipes instead.
 *   - Any nonblank line indented four or more columns, or a line that opens raw HTML/a fence/an
 *     HTML comment, makes EVERY table in the document unparsable (scanRenderedLines scans the
 *     whole file). Free-text fields are defensively de-indented and had their fence-or-tag-like
 *     line openers neutralized for exactly this reason.
 *   - Section order does not matter to the parser (it matches headings by normalized text
 *     anywhere in the document), so the order below is a readability choice, not a contract.
 */
import type {
  OfferTestDocument,
  OfferTestExposureRow,
  OfferTestObjectionRow,
  ResearchEvidenceDocument,
  SignalCorpusDocument,
} from "../../../../kernel/schema/index.js";

// ── Shared cell/line sanitizers ─────────────────────────────────────────────

/** One pipe-table cell: no literal pipes, no embedded newlines/tabs, trimmed. */
function cell(value: string): string {
  return value.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
}

function row(cells: readonly string[]): string {
  return `| ${cells.map(cell).join(" | ")} |`;
}

function separator(width: number): string {
  return `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string[] {
  return [row(headers), separator(headers.length), ...rows.map(row)];
}

/**
 * One free-text line, made safe against required-table-section.ts's document-wide strict scan:
 * de-indented (no accidental 4-space "indented code" trigger) and, if the trimmed line opens
 * with a fence marker, an HTML comment, or a raw-HTML-looking tag, neutralized with a leading
 * backslash so it renders as prose instead of tripping the parser's unsupported-markdown gate.
 */
function safeProseLine(line: string): string {
  const trimmed = line.replace(/\s+$/u, "").replace(/^[\t ]+/u, "");
  if (/^(`{3,}|~{3,}|<!--|<[/A-Za-z?!])/u.test(trimmed)) return `\\${trimmed}`;
  return trimmed;
}

function proseBlock(value: string): string[] {
  return value.split(/\r?\n/).map(safeProseLine);
}

// ── strategy/RESEARCH.md ────────────────────────────────────────────────────

const SOURCE_LEDGER_TABLE_HEADERS = [
  "Source",
  "Platform / type",
  "URL / source ID",
  "Observed at",
  "Tool / backend / query",
  "Transcript / visual / sample limit",
  "Observation",
  "Inference",
  "Confidence",
  "Artifact / trace",
] as const;

const CATEGORY_REVENUE_TABLE_HEADERS = ["Rank", "Competitor", "Est. annual revenue", "Source / observed at"] as const;
const DISTRIBUTION_PROOF_TABLE_HEADERS = [
  "Audience segment",
  "Exact discovery location",
  "Native format",
  "Owned relationship",
  "Measured signal",
  "Evidence IDs",
] as const;
const TRANSFORMATION_DEMO_TABLE_HEADERS = ["Screenshot path", "15s script", "Transformation shown", "Why not a vitamin"] as const;
const DISTRIBUTION_FIRST_TABLE_HEADERS = ["Paying audience", "Named channel", "Purchases-as-validation"] as const;
const GO_PIVOT_KILL_TABLE_HEADERS = [
  "Date",
  "Category revenue reality",
  "Wedge",
  "Demand signal",
  "Distribution proof",
  "Offer test",
  "Verdict (Go / Pivot / Kill)",
  "Decided by",
] as const;

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}/yr`;
}

/** Render a schema-conformant research-evidence document into strategy/RESEARCH.md. */
export function renderResearchMarkdown(doc: ResearchEvidenceDocument): string {
  const lines: string[] = ["# Research", "", "Status: authored via schema render.", ""];

  lines.push("## Source Ledger", "");
  lines.push(
    ...table(
      SOURCE_LEDGER_TABLE_HEADERS,
      doc.sourceLedger.map((r) => [
        r.source,
        r.platform,
        r.identity,
        r.observedAt,
        r.backendQuery,
        r.transcriptVisual,
        r.observation,
        r.inference,
        r.confidence,
        r.artifactTrace,
      ]),
    ),
    "",
  );

  lines.push("## Evidence Capture Protocol", "", ...proseBlock(doc.evidenceCaptureProtocol), "");
  lines.push("## Untrusted Content", "", ...proseBlock(doc.untrustedContentNote), "");
  lines.push("## Decision Inputs", "", ...proseBlock(doc.decisionInputs), "");
  lines.push("## Decision Log", "", "Trace IDs reference state/LAUNCH_TRACE.md.", "", ...proseBlock(doc.decisionLog), "");
  lines.push("## Rejected Claims", "", ...proseBlock(doc.rejectedClaims), "");

  lines.push("## Category Revenue Reality", "");
  lines.push(
    ...table(
      CATEGORY_REVENUE_TABLE_HEADERS,
      doc.categoryRevenue.rows.map((r) => [String(r.rank), r.competitor, formatUsd(r.estAnnualRevenueUsd), r.sourceLabel]),
    ),
    "",
  );
  lines.push(`Stated bar: ${cell(doc.categoryRevenue.statedBar)}`, "", `Pass or fail against the bar: ${doc.categoryRevenue.passFail}`, "");

  lines.push("## Distribution Proof", "");
  lines.push(
    ...table(
      DISTRIBUTION_PROOF_TABLE_HEADERS,
      doc.distributionProof.map((r) => [r.audienceSegment, r.exactDiscoveryLocation, r.nativeFormat, r.ownedRelationship, r.measuredSignal, r.evidenceIds]),
    ),
    "",
  );

  lines.push("## Transformation Demo", "");
  lines.push(
    ...table(
      TRANSFORMATION_DEMO_TABLE_HEADERS,
      doc.transformationDemo.map((r) => [r.screenshotPath, r.fifteenSecondScript, r.transformationShown, r.whyNotVitamin]),
    ),
    "",
  );

  lines.push("## Distribution-First Niche", "");
  lines.push(
    ...table(
      DISTRIBUTION_FIRST_TABLE_HEADERS,
      doc.distributionFirstNiche.map((r) => [r.payingAudience, r.namedChannel, r.purchasesAsValidation]),
    ),
    "",
  );

  lines.push("## Go, Pivot, Or Kill", "");
  lines.push(
    ...table(
      GO_PIVOT_KILL_TABLE_HEADERS,
      doc.verdict.map((r) => [r.date, r.categoryRevenueReality, r.wedge, r.demandSignal, r.distributionProof, r.offerTest, capitalize(r.verdict), r.decidedBy]),
    ),
    "",
  );

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

// ── strategy/SIGNAL_CORPUS.md ───────────────────────────────────────────────

const CORPUS_INPUTS_TABLE_HEADERS = [
  "Input ID",
  "Source type",
  "Owner or creator",
  "Scope",
  "Date range",
  "Collection route",
  "Permission or public basis",
  "Limits",
] as const;
const SIGNAL_RECORDS_TABLE_HEADERS = [
  "Signal ID",
  "Type",
  "Claim or phrase",
  "Source IDs",
  "Observed at",
  "Applies to",
  "Confidence",
  "Status",
  "Supersedes",
  "Artifact or trace",
] as const;
const CONFLICTS_TABLE_HEADERS = ["Earlier signal", "Later signal", "Conflict", "Current position", "Reason"] as const;
const DERIVED_OUTPUTS_TABLE_HEADERS = ["Signal IDs", "Output", "Decision changed", "Trace ID"] as const;

function formatDateRange(startDate: string, endDate: string | undefined): string {
  return endDate ? `${startDate} to ${endDate}` : startDate;
}

/** Render a schema-conformant signal-corpus document into strategy/SIGNAL_CORPUS.md. */
export function renderSignalCorpusMarkdown(doc: SignalCorpusDocument): string {
  if (!doc.applicable) {
    // parseRenderedTopLevelStatus requires the Status line to be the very first nonblank line
    // after the H1 — nothing else may precede it in the rendered preamble.
    return `# Signal Corpus\n\nStatus: not applicable — ${cell(doc.reason)}\n`;
  }

  const lines: string[] = ["# Signal Corpus", "", "Status: authored via schema render.", ""];

  lines.push("## Corpus Inputs", "");
  lines.push(
    ...table(
      CORPUS_INPUTS_TABLE_HEADERS,
      doc.corpusInputs.map((r) => [
        r.id,
        r.sourceType,
        r.ownerOrCreator,
        r.scope,
        formatDateRange(r.startDate, r.endDate),
        r.collectionRoute,
        r.permissionOrPublicBasis,
        r.limits,
      ]),
    ),
    "",
  );

  lines.push("## Signal Records", "");
  lines.push(
    ...table(
      SIGNAL_RECORDS_TABLE_HEADERS,
      doc.signalRecords.map((r) => [
        r.id,
        r.type,
        r.claim,
        r.sourceIds.join(", "),
        r.observedAt,
        r.appliesTo,
        r.confidence,
        r.lifecycle,
        r.supersedes,
        r.artifactOrTrace,
      ]),
    ),
    "",
  );

  lines.push("## Conflicts And Supersession", "");
  lines.push(
    ...table(
      CONFLICTS_TABLE_HEADERS,
      doc.conflicts.map((r) => [r.earlierSignal, r.laterSignal, r.conflict, r.currentPosition, r.reason]),
    ),
    "",
  );

  lines.push("## Derived Outputs", "");
  lines.push(
    ...table(
      DERIVED_OUTPUTS_TABLE_HEADERS,
      doc.derivedOutputs.map((r) => [r.signalIds.join(", "), r.output, r.decisionChanged, r.traceId]),
    ),
    "",
  );

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

// ── strategy/OFFER_TEST.md ──────────────────────────────────────────────────

const TEST_CONTRACT_TABLE_HEADERS = ["Field", "Value"] as const;
const EXPOSURE_TABLE_HEADERS = [
  "Date",
  "Channel",
  "Evidence source",
  "Exposure type",
  "Exposure",
  "CTA conversions",
  "Conversion rate",
  "Cost",
  "Result",
] as const;
const OBJECTIONS_TABLE_HEADERS = ["Source", "Objection or behavior", "Interpretation", "Change made", "Signal IDs"] as const;
const DECISION_TABLE_HEADERS = ["Status", "Date", "Evidence", "Decision", "Decided by"] as const;
const WAIVER_TABLE_HEADERS = ["Date", "Founder", "Reason", "Residual risk accepted"] as const;

function exposureRowCells(r: OfferTestExposureRow): string[] {
  return [
    r.date,
    r.channel,
    r.evidenceSource,
    r.exposureType,
    String(r.exposure),
    String(r.ctaConversions),
    r.conversionRate ?? "",
    r.cost ?? "",
    r.result ?? "",
  ];
}

function objectionRowCells(r: OfferTestObjectionRow): string[] {
  return [r.source, r.objectionOrBehavior, r.interpretation, r.changeMade, r.signalIds ?? ""];
}

/** Render a schema-conformant offer-test document into strategy/OFFER_TEST.md. */
export function renderOfferTestMarkdown(doc: OfferTestDocument): string {
  const lines: string[] = ["# Traffic-Backed Offer Test", "", "Status: authored via schema render.", ""];

  lines.push("## Test Contract", "");
  lines.push(
    ...table(TEST_CONTRACT_TABLE_HEADERS, [
      ["Audience", doc.contract.audience],
      ["Exact discovery location", doc.contract.exactDiscoveryLocation],
      ["Native format", doc.contract.nativeFormat],
      ["Offer", doc.contract.offer],
      ["Owned relationship", doc.contract.ownedRelationship],
      ["Primary response", doc.contract.primaryResponse],
      ["Stop rule", doc.contract.stopRule],
    ]),
    "",
  );

  lines.push("## Exposure And Conversion", "");
  lines.push(...table(EXPOSURE_TABLE_HEADERS, doc.exposureAndConversion.map(exposureRowCells)), "");

  lines.push("## Objections And Learning", "");
  lines.push(...table(OBJECTIONS_TABLE_HEADERS, (doc.objectionsAndLearning ?? []).map(objectionRowCells)), "");

  lines.push("## Decision", "");
  lines.push(
    ...table(
      DECISION_TABLE_HEADERS,
      doc.decision.map((r) => [r.status, r.date, r.evidence, r.decision, r.decidedBy]),
    ),
    "",
  );

  lines.push("## Founder Waiver", "");
  lines.push(
    ...table(
      WAIVER_TABLE_HEADERS,
      (doc.founderWaiver ?? []).map((r) => [r.date, r.founder, r.reason, r.residualRiskAccepted]),
    ),
    "",
  );

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
