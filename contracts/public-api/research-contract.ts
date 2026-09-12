/**
 * Read-only contract explanation for the research evidence check.
 *
 * The validator remains the enforcement owner. This descriptor is deliberately
 * bounded and carries no workspace values, authority, or repair instructions.
 */
export const RESEARCH_CONTRACT_EXPLANATION = {
  check: "research",
  version: "1.0.0",
  description: "Validates research evidence structure and cross-record references before product initialization.",
  artifacts: [
    "strategy/RESEARCH.md",
    "strategy/SIGNAL_CORPUS.md",
    "strategy/OFFER_TEST.md",
    "strategy/RED_TEAM_FINDINGS.md",
  ],
  sections: [
    {
      heading: "Source Ledger",
      columns: [
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
      ],
    },
    {
      heading: "Corpus Inputs",
      columns: ["Input ID", "Source type", "Owner or creator", "Scope", "Date range", "Collection route", "Permission or public basis", "Limits"],
    },
    {
      heading: "Signal Records",
      columns: ["Signal ID", "Type", "Claim or phrase", "Source IDs", "Observed at", "Applies to", "Confidence", "Status", "Supersedes", "Artifact or trace"],
    },
    { heading: "Conflicts And Supersession", columns: ["Earlier signal", "Later signal", "Conflict", "Current position", "Reason"] },
    { heading: "Derived Outputs", columns: ["Signal IDs", "Output", "Decision changed", "Trace ID"] },
    {
      heading: "Distribution Proof",
      columns: ["Audience segment", "Exact discovery location", "Native format", "Owned relationship", "Measured signal", "Evidence IDs"],
    },
    {
      heading: "Go, Pivot, Or Kill",
      columns: ["Date", "Category revenue reality", "Wedge", "Demand signal", "Distribution proof", "Offer test", "Verdict (Go / Pivot / Kill)", "Decided by"],
    },
  ],
  formats: {
    verdicts: ["Go", "Pivot", "Kill"],
    confidence: ["low", "medium", "high"],
    date: "ISO YYYY-MM-DD; observed timestamps must be real, non-future RFC3339 instants",
    ids: "Explicit declared IDs such as INPUT-001 and SIG-001; supported list separators remain valid",
  },
  relationships: [
    "Signal source IDs must resolve to eligible Source Ledger or Signal Record evidence.",
    "Supersession must preserve a current eligible signal and explain the conflict.",
    "An offer waiver must match the final decision date and normalized actor.",
  ],
  checkpoint: {
    applicability: "The Go/Pivot/Kill checkpoint is required before initialization or downstream build work.",
    nonGo: "A valid Pivot or Kill is a held checkpoint, not malformed research and not initialization authority.",
    evidence: "Unrun or unknown experiments remain unmeasured; structural validity does not prove demand or differentiation.",
  },
  safety: "Output is read-only and contains no workspace excerpts, credentials, customer data, or authority grants.",
} as const;

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Fail closed if the explanation loses a header enforced by the checker. */
export function assertResearchContractHeaders(input: {
  sourceLedger: readonly string[];
  signalCorpus: { inputs: readonly string[]; records: readonly string[]; conflicts: readonly string[]; derived: readonly string[] };
  distributionProof: readonly string[];
  verdict: readonly string[];
}): void {
  const sections = new Map(RESEARCH_CONTRACT_EXPLANATION.sections.map((section) => [normalized(section.heading), section]));
  const required: Array<[string, readonly string[]]> = [
    ["Source Ledger", input.sourceLedger],
    ["Corpus Inputs", input.signalCorpus.inputs],
    ["Signal Records", input.signalCorpus.records],
    ["Conflicts And Supersession", input.signalCorpus.conflicts],
    ["Derived Outputs", input.signalCorpus.derived],
    ["Distribution Proof", input.distributionProof],
    ["Go, Pivot, Or Kill", input.verdict],
  ];
  for (const [heading, headers] of required) {
    const section = sections.get(normalized(heading));
    if (!section) throw new Error(`research_contract.explanation_section_missing:${heading}`);
    const available = new Set(section.columns.map(normalized));
    for (const header of headers) {
      if (!available.has(normalized(header))) throw new Error(`research_contract.explanation_header_missing:${heading}:${header}`);
    }
  }
}

export function renderResearchContractExplanation(): string {
  const sections = RESEARCH_CONTRACT_EXPLANATION.sections.map((section) => `- ${section.heading}: ${section.columns.join(", ")}`).join("\n");
  return [
    `Research contract ${RESEARCH_CONTRACT_EXPLANATION.version}`,
    RESEARCH_CONTRACT_EXPLANATION.description,
    "",
    "Required sections and columns:",
    sections,
    "",
    `Artifacts: ${RESEARCH_CONTRACT_EXPLANATION.artifacts.join(", ")}`,
    "",
    `Verdicts: ${RESEARCH_CONTRACT_EXPLANATION.formats.verdicts.join(", ")}`,
    `Confidence: ${RESEARCH_CONTRACT_EXPLANATION.formats.confidence.join(", ")}`,
    `Dates and IDs: ${RESEARCH_CONTRACT_EXPLANATION.formats.date}; ${RESEARCH_CONTRACT_EXPLANATION.formats.ids}.`,
    "",
    "Relationships:",
    ...RESEARCH_CONTRACT_EXPLANATION.relationships.map((item) => `- ${item}`),
    "",
    `Checkpoint: ${RESEARCH_CONTRACT_EXPLANATION.checkpoint.applicability}`,
    RESEARCH_CONTRACT_EXPLANATION.checkpoint.nonGo,
    RESEARCH_CONTRACT_EXPLANATION.checkpoint.evidence,
    RESEARCH_CONTRACT_EXPLANATION.safety,
  ].join("\n");
}
