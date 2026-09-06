import type { Catalog, CatalogIssue } from "./types.js";
import { validateAgentGraphFile } from "./agent-graph/validate.js";
import { loadWorldOntology } from "./ontology/load.js";
import { validateWorldOntologyFile } from "./ontology/validate.js";
import { loadConceptScheme } from "./taxonomy/load.js";
import { validateConceptSchemeFile } from "./taxonomy/validate.js";

/**
 * Thesaurus, world ontology, and agent-graph overlay. Not composeCatalog.
 * check:catalog and catalog/validate.ts are the only readers.
 */
export function validateDefinitionOverlays(catalog: Catalog, skillRoot: string): CatalogIssue[] {
  const issues = [...validateConceptSchemeFile(catalog, skillRoot)];
  let workConceptIds: Set<string> | undefined;
  try {
    workConceptIds = new Set(loadConceptScheme(skillRoot).concepts.map((concept) => concept.id));
  } catch {
    workConceptIds = undefined;
  }
  issues.push(...validateWorldOntologyFile(skillRoot, workConceptIds));
  try {
    const ontology = loadWorldOntology(skillRoot);
    issues.push(...validateAgentGraphFile(catalog, ontology, skillRoot));
  } catch {
    // Ontology load failure is already reported by validateWorldOntologyFile.
  }
  return issues;
}
