import { composeCatalog } from "../../../catalog/index.js";
import { loadConceptScheme } from "../../../catalog/taxonomy/load.js";
import type { ConceptScheme } from "../../../catalog/taxonomy/types.js";
import { validateConceptScheme, validateConceptSchemeFile } from "../../../catalog/taxonomy/validate.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

function cloneScheme(): ConceptScheme {
  return structuredClone(loadConceptScheme(skillRoot));
}

export function register(harness: Harness): void {
  harness.check("taxonomy: the shipped concept scheme matches the catalog and vocabulary", () => {
    const catalog = composeCatalog(skillRoot);
    const issues = validateConceptSchemeFile(catalog, skillRoot);
    assert(issues.length === 0, issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  });

  harness.check("taxonomy: a catalog domain without a concept fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const scheme = cloneScheme();
    scheme.concepts = scheme.concepts.filter((concept) => concept.id !== "domain.growth");
    const issues = validateConceptScheme(catalog, scheme);
    assert(
      issues.some((issue) => issue.code === "catalog_taxonomy.concept.missing" && issue.message.includes("domain.growth")),
      `expected missing domain.growth, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("taxonomy: a concept id that is not in the catalog fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const scheme = cloneScheme();
    scheme.concepts.push({
      id: "domain.not-a-domain",
      kind: "domain",
      facetId: "facet.domain",
      prefLabel: "Not A Domain",
      altLabels: [],
    });
    const issues = validateConceptScheme(catalog, scheme);
    assert(
      issues.some((issue) => issue.code === "catalog_taxonomy.concept.unknown" && issue.message.includes("domain.not-a-domain")),
      `expected unknown domain, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("taxonomy: a pref_label that drifts from the catalog fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const scheme = cloneScheme();
    const growth = scheme.concepts.find((concept) => concept.id === "domain.growth");
    assert(growth !== undefined, "domain.growth must exist in the scheme");
    growth.prefLabel = "Growth Domain Drift";
    const issues = validateConceptScheme(catalog, scheme);
    assert(
      issues.some((issue) => issue.code === "catalog_taxonomy.concept.label_mismatch"),
      `expected label mismatch, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("taxonomy: a shared label without a homonym group fails closed", () => {
    const catalog = composeCatalog(skillRoot);
    const scheme = cloneScheme();
    scheme.homonyms = scheme.homonyms.filter((group) => group.label !== "growth");
    const issues = validateConceptScheme(catalog, scheme);
    assert(
      issues.some((issue) => issue.code === "catalog_taxonomy.homonym.missing" && issue.message.includes("growth")),
      `expected missing growth homonym, got ${issues.map((issue) => `${issue.code}:${issue.message}`).join(" | ")}`,
    );
  });
}
