import { issue } from "../../../../tooling/lib/launch-state.js";
import { isEmptyEquivalentEvidenceValue } from "../../../../kernel/lib/empty-equivalent-evidence.js";
import { parseRequiredTableSection, type RequiredTableSection } from "../../../../kernel/lib/required-table-section.js";
import { isValidPastIsoDate, parseOfferMeasurement } from "./research-evidence-helpers.js";

export const OFFER_TEST_HEADERS = {
  contract: ["Field", "Value"],
  decision: ["Status", "Date", "Evidence", "Decision", "Decided by"],
  exposure: ["Date", "Channel", "Evidence source", "Exposure type", "Exposure", "CTA conversions", "Conversion rate", "Cost", "Result"],
  waiver: ["Date", "Founder", "Reason", "Residual risk accepted"],
} as const;

export function validateOfferTest(value: string | undefined, target: ReturnType<typeof issue>[], isFounderDecider: (value: string) => boolean): void {
  if (!value) {
    target.push(
      issue("error", "research.offer_test_missing", "strategy/OFFER_TEST.md is required before the Go, Pivot, or Kill decision.", "strategy/OFFER_TEST.md"),
    );
    return;
  }

  const contractResult = parseRequiredTableSection(value, "Test Contract", OFFER_TEST_HEADERS.contract);
  const exposureResult = parseRequiredTableSection(value, "Exposure And Conversion", OFFER_TEST_HEADERS.exposure);
  const decisionResult = parseRequiredTableSection(value, "Decision", OFFER_TEST_HEADERS.decision);
  for (const [heading, result] of [
    ["Test Contract", contractResult],
    ["Exposure And Conversion", exposureResult],
    ["Decision", decisionResult],
  ] as const) {
    if (!result.ok) {
      target.push(
        issue(
          "error",
          `research.offer_test_${heading.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_missing`,
          `strategy/OFFER_TEST.md needs a ${heading} section.`,
          "strategy/OFFER_TEST.md",
        ),
      );
    }
  }

  const contractFields = new Map<string, string>();
  let contractStructureValid = contractResult.ok && rowsMatchTableWidth(contractResult.section);
  if (contractResult.ok) {
    const fieldColumn = tableColumn(contractResult.section, "Field");
    const valueColumn = tableColumn(contractResult.section, "Value");
    for (const row of contractResult.section.rows) {
      const field = normalizedTableLabel(row.cells[fieldColumn] ?? "");
      const fieldValue = (row.cells[valueColumn] ?? "").trim();
      if (field.length === 0 || contractFields.has(field)) contractStructureValid = false;
      contractFields.set(field, fieldValue);
    }
  }
  const requiredContractFields = ["audience", "exact discovery location", "native format", "offer", "owned relationship", "primary response", "stop rule"];
  const contractIncomplete =
    !contractStructureValid ||
    requiredContractFields.some((field) => {
      const value = contractFields.get(field) ?? "";
      if (value.length === 0 || /\b(todo|tbd|placeholder|replace with|pending|unverified|required)\b|<[^>]+>/i.test(value)) return true;
      if (field === "owned relationship" && isAbsentOwnedRelationship(value)) return true;
      if (field === "primary response" && isForbiddenPrimaryResponse(value)) return true;
      if (isGenericOfferOptionMenu(field, value)) return true;
      if (field === "exact discovery location" && /^(social media|online|internet|web|app store|community|creator audience)$/i.test(value)) return true;
      if (field === "stop rule" && !/\d/.test(value)) return true;
      return false;
    });
  if (contractIncomplete) {
    target.push(
      issue(
        "error",
        "research.offer_test_contract_incomplete",
        "The offer Test Contract needs an exact audience, discovery location, native format, offer, owned route, primary response, and measurable stop rule.",
        "strategy/OFFER_TEST.md",
      ),
    );
  }

  const placeholder = /\b(todo|tbd|placeholder|replace with|pending|unverified)\b/i;
  let status: "run" | "waived" | undefined;
  let finalDecision: { date: string; decider: string } | undefined;
  if (decisionResult.ok) {
    const statusColumn = tableColumn(decisionResult.section, "Status");
    const dateColumn = tableColumn(decisionResult.section, "Date");
    const evidenceColumn = tableColumn(decisionResult.section, "Evidence");
    const decisionColumn = tableColumn(decisionResult.section, "Decision");
    const deciderColumn = tableColumn(decisionResult.section, "Decided by");
    const decisionRows = decisionResult.section.rows;
    if (decisionRows.length === 0 || !rowsMatchTableWidth(decisionResult.section)) {
      target.push(
        issue(
          "error",
          "research.offer_test_decision_missing",
          "The offer test needs a run or waived decision row with date, evidence, decision, and founder identity.",
          "strategy/OFFER_TEST.md",
        ),
      );
    } else {
      const decisionComplete = decisionRows.every((row) => {
        const rowStatus = (row.cells[statusColumn] ?? "").trim().toLowerCase();
        const decider = (row.cells[deciderColumn] ?? "").trim();
        return (
          /^(run|waived)$/.test(rowStatus) &&
          isValidPastIsoDate((row.cells[dateColumn] ?? "").trim()) &&
          [row.cells[evidenceColumn] ?? "", row.cells[decisionColumn] ?? "", decider].every((cell) => cell.trim().length > 0 && !placeholder.test(cell)) &&
          isFounderDecider(decider)
        );
      });
      if (!decisionComplete) {
        target.push(
          issue(
            "error",
            "research.offer_test_decision_incomplete",
            "The offer-test decision needs an ISO date, real evidence, a decision, and the founder or owner as decider.",
            "strategy/OFFER_TEST.md",
          ),
        );
      } else {
        const finalDecisionRow = decisionRows.at(-1)!;
        status = (finalDecisionRow.cells[statusColumn] ?? "").trim().toLowerCase() as "run" | "waived";
        finalDecision = {
          date: (finalDecisionRow.cells[dateColumn] ?? "").trim(),
          decider: (finalDecisionRow.cells[deciderColumn] ?? "").trim(),
        };
      }
    }
  }

  if (exposureResult.ok) {
    const dateColumn = tableColumn(exposureResult.section, "Date");
    const exposureColumn = tableColumn(exposureResult.section, "Exposure");
    const conversionsColumn = tableColumn(exposureResult.section, "CTA conversions");
    const sourceColumn = tableColumn(exposureResult.section, "Evidence source");
    const rowsValid =
      rowsMatchTableWidth(exposureResult.section) &&
      exposureResult.section.rows.every((row) => {
        const source = (row.cells[sourceColumn] ?? "").trim();
        return (
          isValidPastIsoDate((row.cells[dateColumn] ?? "").trim()) &&
          parseOfferMeasurement((row.cells[exposureColumn] ?? "").trim(), (row.cells[conversionsColumn] ?? "").trim()) !== undefined &&
          source.length > 0 &&
          !placeholder.test(source)
        );
      });
    if (!rowsValid || (status === "run" && exposureResult.section.rows.length === 0)) {
      target.push(
        issue(
          "error",
          "research.offer_test_measurement_missing",
          "Every offer measurement row needs a real non-future ISO date and evidence source, positive whole-number exposure, and a whole-number CTA conversion count no larger than exposure.",
          "strategy/OFFER_TEST.md",
        ),
      );
    }
  } else if (status === "run") {
    target.push(
      issue(
        "error",
        "research.offer_test_measurement_missing",
        "Every offer measurement row needs a real non-future ISO date and evidence source, positive whole-number exposure, and a whole-number CTA conversion count no larger than exposure.",
        "strategy/OFFER_TEST.md",
      ),
    );
  }

  if (status === "waived") {
    const waiverResult = parseRequiredTableSection(value, "Founder Waiver", OFFER_TEST_HEADERS.waiver);
    let validWaiver = false;
    let waiverDiagnostic = "A waived offer test needs a Founder Waiver section.";
    let waiverLine: number | undefined;
    let waiverFixHint = "Add a Founder Waiver table with a dated founder decision, a concrete reason, and the residual risk accepted.";
    if (waiverResult.ok) {
      const waiverDateColumn = tableColumn(waiverResult.section, "Date");
      const founderColumn = tableColumn(waiverResult.section, "Founder");
      const reasonColumn = tableColumn(waiverResult.section, "Reason");
      const riskColumn = tableColumn(waiverResult.section, "Residual risk accepted");
      const waiverRowValid = (row: (typeof waiverResult.section.rows)[number]): boolean => {
        const founder = row.cells[founderColumn] ?? "";
        return (
          isValidPastIsoDate((row.cells[waiverDateColumn] ?? "").trim()) &&
          isFounderDecider(founder) &&
          [row.cells[reasonColumn] ?? "", row.cells[riskColumn] ?? ""].every(
            (cell) => cell.trim().length > 0 && !placeholder.test(cell) && !isEmptyEquivalentEvidenceValue(cell),
          )
        );
      };
      const rowsValid = rowsMatchTableWidth(waiverResult.section) && waiverResult.section.rows.length > 0 && waiverResult.section.rows.every(waiverRowValid);
      const matchesFinalDecision =
        finalDecision !== undefined &&
        waiverResult.section.rows.some(
          (row) =>
            (row.cells[waiverDateColumn] ?? "").trim() === finalDecision.date &&
            normalizeActorIdentity(row.cells[founderColumn] ?? "") === normalizeActorIdentity(finalDecision.decider),
        );
      validWaiver = rowsValid && matchesFinalDecision;
      if (!rowsValid) {
        const malformedRow = waiverResult.section.rows.find((row) => !waiverRowValid(row));
        waiverDiagnostic =
          "The Founder Waiver table is malformed: every row needs a valid past ISO date, an authorized founder or owner, a concrete reason, and non-empty residual risk.";
        waiverLine = malformedRow?.sourceLine;
        waiverFixHint = "Repair the named Founder Waiver row; do not use a placeholder, automation identity, or empty-equivalent risk value.";
      } else if (!matchesFinalDecision) {
        waiverDiagnostic = "The Founder Waiver is complete but does not match the final Decision row's date and actor.";
        waiverLine = waiverResult.section.rows[0]?.sourceLine;
        waiverFixHint = "Add or correct one waiver row whose Date and Founder normalize to the final Decision row's Date and Decided by values.";
      }
    } else {
      const firstError = waiverResult.errors[0];
      waiverDiagnostic =
        firstError?.kind === "section-missing"
          ? "A waived offer test needs a Founder Waiver section."
          : "The Founder Waiver section could not be parsed as one simple pipe table.";
      waiverLine = firstError?.sourceLine;
      waiverFixHint = "Use exactly one H2 Founder Waiver section with one simple pipe table and the required four columns.";
    }
    if (!validWaiver) {
      target.push(
        issue("error", "research.offer_test_waiver_missing", waiverDiagnostic, "strategy/OFFER_TEST.md", { line: waiverLine, fixHint: waiverFixHint }),
      );
    }
  }
}

export function isAbsentOwnedRelationship(value: string): boolean {
  const normalized = normalizeContractComparison(value);
  return normalized.length === 0 || /^(?:none|n\/a|not applicable|unknown|no owned (?:route|relationship))(?:\b|$)/i.test(normalized);
}

export function isForbiddenPrimaryResponse(value: string): boolean {
  const normalized = normalizeContractComparison(value);
  if (normalized.length === 0) return true;
  const response = normalized.replace(/^\d[\d.,]*(?:[kmb])?\+?%?\s+/i, "");
  if (/^like[-‐‑‒–—]minded\b/i.test(response)) return false;
  return /^(?:likes?|compliments?|(?:general\s+)?survey\s+interest)(?:\b|$)/i.test(response);
}

export function normalizeContractComparison(value: string): string {
  const withoutInlineCode = value.replace(/`([^`\r\n]*)`/gu, "$1");
  const withoutBold = withoutInlineCode.replace(/\*\*([^*\r\n]*)\*\*/gu, "$1");
  return withoutBold.trim().replace(/\s+/gu, " ");
}

export function isGenericOfferOptionMenu(field: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (/(?:\b(?:choose one|select one|one of|for example)\b|\be\.g\.)/.test(normalized)) return true;

  const starterPhrases: Record<string, RegExp> = {
    audience: /one evidence-backed segment/,
    "exact discovery location": /named community,?\s*query,?\s*creator audience,?\s*placement,?\s*partner,?\s*or outreach list/,
    "native format": /format used at that location/,
    offer: /one truthful outcome and action/,
    "owned relationship": /email,?\s*account,?\s*push permission,?\s*direct community,?\s*or not applicable/,
    "primary response": /sign-?up,?\s*deposit,?\s*purchase,?\s*booked call,?\s*or another named action/,
    "stop rule": /an? exposure,?\s*cost,?\s*or time limit/,
  };
  if (starterPhrases[field]?.test(normalized)) return true;

  const optionTerms: Record<string, RegExp[]> = {
    "exact discovery location": [/\bcommunity\b/, /\bquery\b/, /\bcreator audience\b/, /\bplacement\b/, /\bpartner\b/, /\boutreach list\b/],
    "native format": [/\bpost\b/, /\bvideo\b/, /\bthread\b/, /\bemail\b/, /\bad\b/],
    "owned relationship": [/\bemail\b/, /\baccount\b/, /\bpush permission\b/, /\bdirect community\b/, /\bnot applicable\b/],
    "primary response": [/\bsign-?up\b/, /\bdeposit\b/, /\bpurchase\b/, /\bbooked call\b/, /\bnamed action\b/],
    "stop rule": [/\bexposure\b/, /\bcost\b/, /\btime limit\b/],
  };
  const terms = optionTerms[field] ?? [];
  return terms.filter((pattern) => pattern.test(normalized)).length > 1 && /,|\/|\bor\b/.test(normalized);
}

export function normalizedTableLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function tableColumn(section: RequiredTableSection, header: string): number {
  return section.headerIndexes.get(normalizedTableLabel(header)) ?? -1;
}

export function rowsMatchTableWidth(section: RequiredTableSection): boolean {
  return section.rows.every((row) => row.rawCellCount === section.width);
}

export function normalizeActorIdentity(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
