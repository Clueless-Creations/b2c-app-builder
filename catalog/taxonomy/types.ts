/**
 * SKOS thesaurus for the map of the work (catalog IDs).
 * The world ontology lives in catalog/ontology/. This file owns labels,
 * aliases, facet membership, and homonym groups. Catalog IDs stay the graph authority.
 */

export const TAXONOMY_FACET_IDS = [
  "facet.area",
  "facet.domain",
  "facet.lane",
  "facet.phase",
  "facet.context",
  "facet.role",
  "facet.unit",
  "facet.kind",
  "facet.status",
  "facet.action",
  "facet.record",
  "facet.kernel",
] as const;

export type TaxonomyFacetId = (typeof TAXONOMY_FACET_IDS)[number];

export const CATALOG_BACKED_KINDS = ["area", "domain", "lane", "phase", "role", "context"] as const;

export type CatalogBackedKind = (typeof CATALOG_BACKED_KINDS)[number];

export const TAXONOMY_CONCEPT_KINDS = [...CATALOG_BACKED_KINDS, "kernel", "kind", "status", "unit", "record", "action"] as const;

export type TaxonomyConceptKind = (typeof TAXONOMY_CONCEPT_KINDS)[number];

export interface TaxonomyFacet {
  id: TaxonomyFacetId;
  prefLabel: string;
  definition: string;
}

export interface TaxonomyConcept {
  id: string;
  kind: TaxonomyConceptKind;
  facetId: TaxonomyFacetId;
  prefLabel: string;
  altLabels: string[];
  definition?: string;
}

export interface TaxonomyHomonymSense {
  conceptId: string;
  gloss: string;
}

export interface TaxonomyHomonymGroup {
  label: string;
  senses: TaxonomyHomonymSense[];
}

export interface ConceptScheme {
  schemaVersion: number;
  id: string;
  uri: string;
  prefLabel: string;
  definition: string;
  hiddenLabels: string[];
  facets: TaxonomyFacet[];
  concepts: TaxonomyConcept[];
  homonyms: TaxonomyHomonymGroup[];
}

export function isCatalogBackedKind(value: string): value is CatalogBackedKind {
  return (CATALOG_BACKED_KINDS as readonly string[]).includes(value);
}

export function isTaxonomyConceptKind(value: string): value is TaxonomyConceptKind {
  return (TAXONOMY_CONCEPT_KINDS as readonly string[]).includes(value);
}

export function isTaxonomyFacetId(value: string): value is TaxonomyFacetId {
  return (TAXONOMY_FACET_IDS as readonly string[]).includes(value);
}
