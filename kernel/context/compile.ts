import type { KnowledgeSection, RouteDecision, RouteRequest } from "../routing/types.js";
import { DEFAULT_CONTEXT_BUDGET, measureBytes, measureTokens } from "./budget.js";
import { ContextCompileError, type ContextBudget, type ContextCapsule } from "./receipt.js";
import { selectSections } from "./selectors.js";

export function compileContext(input: {
  request: RouteRequest;
  decision: RouteDecision;
  sections: readonly KnowledgeSection[];
  liveRevisions: Record<string, string>;
  budget?: ContextBudget;
}): ContextCapsule {
  if (input.decision.outcome !== "selected" || !input.decision.selectedId) {
    throw new ContextCompileError("context.route_unresolved", "Context compiles only after a selected route.");
  }
  const budget = input.budget ?? DEFAULT_CONTEXT_BUDGET;
  const selected = selectSections(input.sections, input.liveRevisions, input.request.forbiddenDomains ?? []);
  const included: ContextCapsule["sections"] = [];
  const overflow: ContextCapsule["overflow"] = [];
  let bytes = 0;
  let tokens = 0;
  for (const section of selected) {
    const hasText = typeof section.text === "string";
    const hasBytes = typeof section.bytes === "number" && Number.isFinite(section.bytes) && section.bytes >= 0;
    const hasTokens = typeof section.tokens === "number" && Number.isFinite(section.tokens) && section.tokens >= 0;
    if (!hasText && !(hasBytes && hasTokens)) {
      throw new ContextCompileError(
        "context.unmeasured_section",
        `Section "${section.sectionId}" has no text or trustworthy size measurements.`,
      );
    }
    const text = section.text ?? "";
    const sectionBytes = hasText ? Math.max(section.bytes ?? 0, measureBytes(text)) : section.bytes!;
    const sectionTokens = hasText ? Math.max(section.tokens ?? 0, measureTokens(text)) : section.tokens!;
    if (bytes + sectionBytes > budget.maxBytes || tokens + sectionTokens > budget.maxTokens) {
      overflow.push({ sectionId: section.sectionId, bytes: sectionBytes, tokens: sectionTokens });
      continue;
    }
    included.push({
      sectionId: section.sectionId,
      revision: section.revision,
      path: section.path,
      bytes: sectionBytes,
      tokens: sectionTokens,
    });
    bytes += sectionBytes;
    tokens += sectionTokens;
  }
  if (overflow.length > 0 && included.length === 0) {
    throw new ContextCompileError("context.budget_overflow", "Context budget cannot hold any selected section.");
  }
  return {
    routeId: input.request.id,
    selectedId: input.decision.selectedId,
    sections: included,
    exclusions: overflow.map((item) => ({ sectionId: item.sectionId, reasonCode: "context.over_budget" })),
    overflow,
    bytes,
    tokens,
    sourceIds: included.map((section) => `${section.path}#${section.sectionId}@${section.revision}`),
  };
}

export function capsuleBytes(capsule: ContextCapsule): string {
  return `${JSON.stringify(capsule)}\n`;
}
