/**
 * Shared paid-generation applicability parser.
 *
 * check:ai-provider-controls and check:repository-profile must use the same
 * verdict, including the product-evidence override of a not-applicable line.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isEmptyEquivalentEvidenceValue } from "../../kernel/lib/empty-equivalent-evidence.js";

export type PaidGenerationApplicability = "applicable" | "not_applicable" | "unknown";

const PRODUCT_EVIDENCE_PATHS = ["PRODUCT.md", "engineering/TECH_SPEC.md", "product/ONBOARDING.md"] as const;
const PAID_PROVIDER_EVIDENCE =
  /\b(openai|anthropic|gpt-4|gpt-5|claude api|gemini api|chat completions?|responses api|model-provider spend|paid model-provider|token (?:meter|billing)|per-call (?:cost|charge)|paid generation)\b/i;
const UNAPPROVED_REASON = /\b(pending|unapproved|awaiting|unknown|placeholder|tbd|todo|not yet|replace with)\b/i;
const IN_SCOPE_VERDICT = /^(required|yes|applicable|in scope)\b/i;
const OUT_OF_SCOPE_VERDICT = /^(not needed|not applicable|no)\b/i;

function readText(root: string, relativePath: string): string | undefined {
  const filePath = path.join(root, relativePath);
  if (!existsSync(filePath)) return undefined;
  return readFileSync(filePath, "utf8");
}

export function parsePaidGenerationLine(text: string): PaidGenerationApplicability | undefined {
  const match = text.match(/^Paid generation:\s*(.+)$/im);
  if (!match) return undefined;
  const value = (match[1] ?? "").trim();
  const notApplicable = value.match(/^not applicable\s*(?:—|-|:)\s*(.+)$/i);
  if (notApplicable) {
    const reason = (notApplicable[1] ?? "").trim();
    if (reason.replace(/[^a-z0-9]/gi, "").length < 12 || UNAPPROVED_REASON.test(reason) || isEmptyEquivalentEvidenceValue(reason)) {
      return "unknown";
    }
    return "not_applicable";
  }
  if (IN_SCOPE_VERDICT.test(value)) return "applicable";
  if (OUT_OF_SCOPE_VERDICT.test(value) || /^(unknown|pending|tbd|replace with)\b/i.test(value)) return "unknown";
  if (value.replace(/[^a-z0-9]/gi, "").length >= 8) return "applicable";
  return "unknown";
}

export function generativeAiInScope(safetyText: string): boolean {
  const verdict = safetyText.match(/^Applicability verdict:\s*(.+)$/im)?.[1]?.trim() ?? "";
  if (OUT_OF_SCOPE_VERDICT.test(verdict)) return false;
  if (IN_SCOPE_VERDICT.test(verdict)) return true;
  const lines = safetyText.split(/\r?\n/).map((line) => line.trim());
  const header = lines.find((line) => line.startsWith("|") && /status/i.test(line));
  if (!header) return false;
  const statusColumn = header.split("|").findIndex((cell) => /status/i.test(cell));
  if (statusColumn <= 0) return false;
  for (const line of lines) {
    if (!line.startsWith("|") || line.includes("---") || /status/i.test(line)) continue;
    const status = (line.split("|")[statusColumn] ?? "").trim();
    if (status.length === 0 || /^(unknown|pending|tbd|todo|replace with|placeholder)\b/i.test(status)) continue;
    return true;
  }
  return false;
}

export function hasPaidProviderEvidence(root: string): boolean {
  for (const candidate of PRODUCT_EVIDENCE_PATHS) {
    const text = readText(root, candidate);
    if (text && PAID_PROVIDER_EVIDENCE.test(text)) return true;
  }
  return false;
}

export function decideApplicability(declaration: PaidGenerationApplicability | undefined, productEvidence: boolean): PaidGenerationApplicability {
  const status: PaidGenerationApplicability = declaration ?? "unknown";
  switch (status) {
    case "not_applicable":
      return productEvidence ? "applicable" : "not_applicable";
    case "applicable":
      return "applicable";
    case "unknown":
      return "unknown";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function paidGenerationApplies(root: string): boolean {
  const controlsText = readText(root, "trust/AI_PROVIDER_CONTROLS.md");
  const safetyText = readText(root, "trust/AI_SAFETY.md") ?? "";
  const productEvidence = hasPaidProviderEvidence(root);
  const declaration = decideApplicability(parsePaidGenerationLine(controlsText ?? "") ?? parsePaidGenerationLine(safetyText), productEvidence);
  switch (declaration) {
    case "not_applicable":
      return false;
    case "applicable":
      return true;
    case "unknown":
      if (controlsText) return true;
      if (productEvidence) return true;
      if (safetyText && generativeAiInScope(safetyText)) return true;
      return false;
    default: {
      const exhaustive: never = declaration;
      return exhaustive;
    }
  }
}
