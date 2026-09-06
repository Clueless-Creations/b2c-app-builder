import type { KnowledgeSection } from "../routing/types.js";
import { ContextCompileError } from "./receipt.js";

export function selectSections(
  sections: readonly KnowledgeSection[],
  liveRevisions: Record<string, string>,
  forbiddenDomains: readonly string[] = [],
): KnowledgeSection[] {
  const selected: KnowledgeSection[] = [];
  const seen = new Set<string>();
  for (const section of [...sections].sort((left, right) => left.sectionId.localeCompare(right.sectionId))) {
    if (!section.sectionId.trim()) {
      throw new ContextCompileError("context.unresolved_section", "Context selector is missing a stable section ID.");
    }
    if (seen.has(section.sectionId)) continue;
    seen.add(section.sectionId);
    if (section.domain && forbiddenDomains.includes(section.domain)) {
      throw new ContextCompileError("context.forbidden_domain", `Section ${section.sectionId} belongs to forbidden domain ${section.domain}.`);
    }
    const live = liveRevisions[section.sectionId];
    if (!live) {
      throw new ContextCompileError("context.unresolved_section", `Section ${section.sectionId} has no live revision.`);
    }
    if (live !== section.revision) {
      throw new ContextCompileError("context.stale_revision", `Section ${section.sectionId} requested ${section.revision} but live revision is ${live}.`);
    }
    selected.push(section);
  }
  return selected;
}
