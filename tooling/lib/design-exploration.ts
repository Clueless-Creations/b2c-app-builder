import { asArray, asString, isRecord, issue, type Issue } from "./launch-state.js";

export interface DesignReferenceMapping {
  referenceId: string;
  principle: string;
}

export interface DesignDirectionTreatment {
  native: string;
  mobileWeb: string;
  desktopWeb: string;
}

export interface DesignDirectionConcept {
  id: string;
  name: string;
  premise: string;
  referenceMappings: DesignReferenceMapping[];
  treatments: DesignDirectionTreatment;
  distinguishingMechanic: string;
  decision: "selected" | "rejected" | "";
  rationale: string;
}

export type DesignReferenceAccess = "figma-editable" | "figma-read-only" | "figma-unavailable" | "structured-source";

export interface DesignProcessRecord {
  referenceAccess: DesignReferenceAccess | "";
  referenceAccessNote: string;
  referenceInspection: string;
  tangibleDraft: string;
  critique: string;
  revision: string;
  chosenTarget: string;
  runtimeComparison: string;
}

export interface DesignExploration {
  schemaVersion: number;
  selectedConceptId: string;
  concepts: DesignDirectionConcept[];
  process: DesignProcessRecord;
}

export interface ParsedDesignExploration {
  exploration?: DesignExploration;
  issues: Issue[];
}

const PLACEHOLDER = /\b(?:app name|not defined|not captured|placeholder|todo|tbd)\b/i;
const INSTRUCTION = /^(?:record|describe|explain|state|fill|name)\b/i;

/**
 * Parse the durable direction exploration stored in DESIGN.md frontmatter.
 *
 * The selected design remains the only design authority. This record preserves the
 * alternatives and decision evidence that led to it without creating parallel concept files.
 */
export function parseDesignExploration(frontmatter: Record<string, unknown> | undefined, required: boolean): ParsedDesignExploration {
  const issues: Issue[] = [];
  const raw = frontmatter?.exploration;
  if (!isRecord(raw)) {
    if (required) {
      issues.push(
        issue(
          "error",
          "design_exploration.missing",
          "A review-ready design needs a structured exploration record in DESIGN.md frontmatter with at least three distinct concepts.",
          "DESIGN.md",
        ),
      );
    }
    return { issues };
  }

  const schemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : Number.NaN;
  const selectedConceptId = text(raw.selectedConceptId);
  const concepts = asArray(raw.concepts).filter(isRecord).map(normalizeConcept);
  const process = normalizeProcess(raw.process);
  const exploration: DesignExploration = { schemaVersion, selectedConceptId, concepts, process };

  if (schemaVersion !== 1) fail(issues, "schema_version", "DESIGN.md exploration.schemaVersion must be 1.");
  if (!slug(selectedConceptId)) fail(issues, "selected_id", "DESIGN.md exploration.selectedConceptId must be a lowercase concept slug.");
  if (concepts.length < 3) fail(issues, "concept_count", "DESIGN.md exploration must preserve at least three developed directions.");

  if (required) {
    const processFields: Array<[keyof DesignProcessRecord, string]> = [
      ["referenceInspection", "reference inspection"],
      ["tangibleDraft", "tangible draft"],
      ["critique", "concrete critique"],
      ["revision", "revision record"],
      ["chosenTarget", "chosen design target"],
      ["runtimeComparison", "runtime comparison"],
    ];
    for (const [field, label] of processFields) {
      if (!substantive(process[field])) fail(issues, "process_record", `A rendered Design Room needs a substantive ${label} in DESIGN.md exploration.process.`);
    }
    if (!process.referenceAccess)
      fail(
        issues,
        "reference_access",
        "A rendered Design Room must state whether the reference source was editable Figma, read-only Figma, unavailable Figma, or a structured source.",
      );
    if (!substantive(process.referenceAccessNote)) {
      fail(issues, "reference_access_note", "A rendered Design Room must explain the reference-tool access and any permitted or refused substitution.");
    }
  }

  const ids = concepts.map((concept) => concept.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) fail(issues, "concept_id_duplicate", "DESIGN.md exploration concept IDs must be unique.");

  for (const [index, concept] of concepts.entries()) {
    const label = concept.id || `concept ${index + 1}`;
    if (!slug(concept.id)) fail(issues, "concept_id", `${label} needs a lowercase slug ID.`);
    if (!shortText(concept.name)) fail(issues, "concept_name", `${label} needs a concrete direction name.`);
    if (!substantive(concept.premise)) fail(issues, "concept_premise", `${label} needs a substantive product-specific premise.`);
    if (!substantive(concept.distinguishingMechanic)) {
      fail(issues, "concept_mechanic", `${label} needs a substantive mechanic that distinguishes it from the other directions.`);
    }
    if (concept.decision !== "selected" && concept.decision !== "rejected") {
      fail(issues, "concept_decision", `${label} decision must be selected or rejected.`);
    }
    if (!substantive(concept.rationale)) fail(issues, "concept_rationale", `${label} needs a substantive selection or rejection rationale.`);
    if (concept.referenceMappings.length === 0) {
      fail(issues, "reference_mapping", `${label} needs at least one reference-to-principle mapping.`);
    }
    for (const mapping of concept.referenceMappings) {
      if (!referenceId(mapping.referenceId) || !substantive(mapping.principle)) {
        fail(issues, "reference_mapping", `${label} has an incomplete reference-to-principle mapping.`);
      }
    }
    const treatments = [concept.treatments.native, concept.treatments.mobileWeb, concept.treatments.desktopWeb];
    if (treatments.some((value) => !substantive(value))) {
      fail(issues, "surface_treatment", `${label} needs substantive native, mobile-web, and desktop-web treatments.`);
    } else if (new Set(treatments.map(normalizeComparison)).size !== treatments.length) {
      fail(issues, "surface_treatment_duplicate", `${label} must recompose its treatment for native, mobile web, and desktop web.`);
    }
  }

  const selected = concepts.filter((concept) => concept.decision === "selected");
  if (selected.length !== 1) fail(issues, "selection_count", "DESIGN.md exploration must mark exactly one concept selected.");
  if (selected.length === 1 && selected[0]!.id !== selectedConceptId) {
    fail(issues, "selection_mismatch", "DESIGN.md exploration.selectedConceptId must name the concept marked selected.");
  }
  if (selectedConceptId && !concepts.some((concept) => concept.id === selectedConceptId)) {
    fail(issues, "selection_missing", "DESIGN.md exploration.selectedConceptId does not name a preserved concept.");
  }

  const developedMechanics = concepts.map((concept) => normalizeComparison(concept.distinguishingMechanic)).filter(Boolean);
  if (new Set(developedMechanics).size !== developedMechanics.length) {
    fail(issues, "concepts_not_distinct", "Each explored direction needs a different distinguishing mechanic.");
  }

  return { exploration, issues: dedupe(issues) };
}

function normalizeConcept(raw: Record<string, unknown>): DesignDirectionConcept {
  const treatments = isRecord(raw.treatments) ? raw.treatments : {};
  return {
    id: text(raw.id),
    name: text(raw.name),
    premise: text(raw.premise),
    referenceMappings: asArray(raw.referenceMappings)
      .filter(isRecord)
      .map((mapping) => ({ referenceId: text(mapping.referenceId), principle: text(mapping.principle) })),
    treatments: {
      native: text(treatments.native),
      mobileWeb: text(treatments.mobileWeb),
      desktopWeb: text(treatments.desktopWeb),
    },
    distinguishingMechanic: text(raw.distinguishingMechanic),
    decision: raw.decision === "selected" || raw.decision === "rejected" ? raw.decision : "",
    rationale: text(raw.rationale),
  };
}

function normalizeProcess(raw: unknown): DesignProcessRecord {
  const process = isRecord(raw) ? raw : {};
  const access = text(process.referenceAccess);
  return {
    referenceAccess:
      access === "figma-editable" || access === "figma-read-only" || access === "figma-unavailable" || access === "structured-source" ? access : "",
    referenceAccessNote: text(process.referenceAccessNote),
    referenceInspection: text(process.referenceInspection),
    tangibleDraft: text(process.tangibleDraft),
    critique: text(process.critique),
    revision: text(process.revision),
    chosenTarget: text(process.chosenTarget),
    runtimeComparison: text(process.runtimeComparison),
  };
}

function fail(target: Issue[], code: string, message: string): void {
  target.push(issue("error", `design_exploration.${code}`, message, "DESIGN.md"));
}

function text(value: unknown): string {
  return asString(value)?.trim() ?? "";
}

function slug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function referenceId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

function shortText(value: string): boolean {
  return value.length >= 3 && !PLACEHOLDER.test(value) && !INSTRUCTION.test(value);
}

function substantive(value: string): boolean {
  return value.replace(/\s+/g, " ").length >= 32 && !PLACEHOLDER.test(value) && !INSTRUCTION.test(value);
}

function normalizeComparison(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupe(values: Issue[]): Issue[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.code}|${value.message}|${value.file ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
