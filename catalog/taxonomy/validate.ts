import { existsSync } from "node:fs";
import { loadVocabulary } from "../principles/load.js";
import type { Catalog, CatalogIssue } from "../types.js";
import { loadConceptScheme, conceptSchemePath } from "./load.js";
import {
  CATALOG_BACKED_KINDS,
  TAXONOMY_FACET_IDS,
  type CatalogBackedKind,
  type ConceptScheme,
  type TaxonomyConceptKind,
  type TaxonomyFacetId,
} from "./types.js";

function error(code: string, message: string, issuePath?: string): CatalogIssue {
  return { severity: "error", code, message, path: issuePath };
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function expectedFacet(kind: TaxonomyConceptKind): TaxonomyFacetId {
  switch (kind) {
    case "area":
      return "facet.area";
    case "domain":
      return "facet.domain";
    case "lane":
      return "facet.lane";
    case "phase":
      return "facet.phase";
    case "role":
      return "facet.role";
    case "context":
      return "facet.context";
    case "unit":
      return "facet.unit";
    case "kind":
      return "facet.kind";
    case "status":
      return "facet.status";
    case "action":
      return "facet.action";
    case "record":
      return "facet.record";
    case "kernel":
      return "facet.kernel";
    default: {
      const exhaustive: never = kind;
      throw new Error(`unhandled taxonomy concept kind: ${String(exhaustive)}`);
    }
  }
}

function catalogNodes(catalog: Catalog, kind: CatalogBackedKind): ReadonlyArray<{ id: string; prefLabel: string }> {
  switch (kind) {
    case "area":
      return catalog.areas.map((item) => ({ id: item.id, prefLabel: item.name }));
    case "domain":
      return catalog.domains.map((item) => ({ id: item.id, prefLabel: item.name }));
    case "lane":
      return catalog.lanes.map((item) => ({ id: item.id, prefLabel: item.label }));
    case "phase":
      return catalog.phases.map((item) => ({ id: item.id, prefLabel: item.focus }));
    case "role":
      return catalog.roles.map((item) => ({ id: item.id, prefLabel: item.name }));
    case "context":
      return catalog.contextPacks.map((item) => ({ id: item.id, prefLabel: item.title }));
    default: {
      const exhaustive: never = kind;
      throw new Error(`unhandled catalog-backed kind: ${String(exhaustive)}`);
    }
  }
}

function conceptLabels(prefLabel: string, altLabels: readonly string[]): string[] {
  return [prefLabel, ...altLabels].map(normalizeLabel);
}

export function validateConceptScheme(catalog: Catalog, scheme: ConceptScheme, skillRoot?: string): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const schemePath = "catalog/taxonomy/concept-scheme.yaml";
  if (scheme.schemaVersion !== 1) {
    issues.push(error("catalog_taxonomy.schema_version", `concept scheme schema_version must be 1, got ${scheme.schemaVersion}`, schemePath));
  }

  const facetIds = new Set(scheme.facets.map((facet) => facet.id));
  for (const required of TAXONOMY_FACET_IDS) {
    if (!facetIds.has(required)) {
      issues.push(error("catalog_taxonomy.facet.missing", `facet ${required} is missing from the concept scheme`, schemePath));
    }
  }

  const conceptsById = new Map<string, (typeof scheme.concepts)[number]>();
  for (const concept of scheme.concepts) {
    if (conceptsById.has(concept.id)) {
      issues.push(error("catalog_taxonomy.concept.duplicate", `duplicate concept id ${concept.id}`, schemePath));
    }
    conceptsById.set(concept.id, concept);
    if (!facetIds.has(concept.facetId)) {
      issues.push(error("catalog_taxonomy.concept.unknown_facet", `${concept.id} names unknown facet ${concept.facetId}`, schemePath));
    }
    if (concept.facetId !== expectedFacet(concept.kind)) {
      issues.push(
        error(
          "catalog_taxonomy.concept.facet_mismatch",
          `${concept.id} kind ${concept.kind} must sit on ${expectedFacet(concept.kind)}, not ${concept.facetId}`,
          schemePath,
        ),
      );
    }
  }

  for (const kind of CATALOG_BACKED_KINDS) {
    const nodes = catalogNodes(catalog, kind);
    const conceptIds = new Set(scheme.concepts.filter((concept) => concept.kind === kind).map((concept) => concept.id));
    for (const node of nodes) {
      if (!conceptIds.has(node.id)) {
        issues.push(error("catalog_taxonomy.concept.missing", `${kind} ${node.id} has no concept in the scheme`, schemePath));
        continue;
      }
      const concept = conceptsById.get(node.id);
      if (concept && concept.prefLabel !== node.prefLabel) {
        issues.push(
          error("catalog_taxonomy.concept.label_mismatch", `${node.id} pref_label "${concept.prefLabel}" must match catalog "${node.prefLabel}"`, schemePath),
        );
      }
    }
    for (const concept of scheme.concepts.filter((item) => item.kind === kind)) {
      if (!nodes.some((node) => node.id === concept.id)) {
        issues.push(error("catalog_taxonomy.concept.unknown", `${concept.id} is not in the catalog ${kind} list`, schemePath));
      }
    }
  }

  const labelOwners = new Map<string, Set<string>>();
  for (const concept of scheme.concepts) {
    for (const label of conceptLabels(concept.prefLabel, concept.altLabels)) {
      const owners = labelOwners.get(label) ?? new Set<string>();
      owners.add(concept.id);
      labelOwners.set(label, owners);
    }
  }

  const homonymByLabel = new Map<string, (typeof scheme.homonyms)[number]>();
  for (const group of scheme.homonyms) {
    const label = normalizeLabel(group.label);
    if (homonymByLabel.has(label)) {
      issues.push(error("catalog_taxonomy.homonym.duplicate", `duplicate homonym group for "${group.label}"`, schemePath));
    }
    homonymByLabel.set(label, group);
    const senseIds = new Set(group.senses.map((sense) => sense.conceptId));
    if (senseIds.size !== group.senses.length) {
      issues.push(error("catalog_taxonomy.homonym.duplicate_sense", `homonym "${group.label}" lists a concept more than once`, schemePath));
    }
    for (const sense of group.senses) {
      const concept = conceptsById.get(sense.conceptId);
      if (!concept) {
        issues.push(error("catalog_taxonomy.homonym.unknown_concept", `homonym "${group.label}" names unknown concept ${sense.conceptId}`, schemePath));
        continue;
      }
      if (!conceptLabels(concept.prefLabel, concept.altLabels).includes(label)) {
        issues.push(
          error("catalog_taxonomy.homonym.label_missing", `homonym "${group.label}" lists ${sense.conceptId}, which does not carry that label`, schemePath),
        );
      }
    }
  }

  for (const [label, owners] of labelOwners) {
    if (owners.size < 2) continue;
    const group = homonymByLabel.get(label);
    if (!group) {
      issues.push(
        error("catalog_taxonomy.homonym.missing", `label "${label}" is shared by ${[...owners].sort().join(", ")} but has no homonym group`, schemePath),
      );
      continue;
    }
    const senseIds = new Set(group.senses.map((sense) => sense.conceptId));
    for (const owner of owners) {
      if (!senseIds.has(owner)) {
        issues.push(error("catalog_taxonomy.homonym.incomplete", `homonym "${group.label}" omits ${owner}, which also carries that label`, schemePath));
      }
    }
  }

  if (skillRoot !== undefined) {
    const vocabulary = loadVocabulary(skillRoot);
    const prefLabels = new Set(scheme.concepts.map((concept) => normalizeLabel(concept.prefLabel)));
    for (const term of vocabulary.chosen_terms) {
      if (!prefLabels.has(normalizeLabel(term))) {
        issues.push(error("catalog_taxonomy.vocabulary.chosen_missing", `chosen term "${term}" has no concept pref_label`, schemePath));
      }
    }
    for (const term of vocabulary.schema_terms) {
      if (!prefLabels.has(normalizeLabel(term))) {
        issues.push(error("catalog_taxonomy.vocabulary.schema_missing", `schema term "${term}" has no concept pref_label`, schemePath));
      }
    }
    for (const alias of vocabulary.aliases) {
      const target = scheme.concepts.find((concept) => normalizeLabel(concept.prefLabel) === normalizeLabel(alias.to));
      if (!target) {
        issues.push(error("catalog_taxonomy.vocabulary.alias_target", `alias target "${alias.to}" has no concept`, schemePath));
        continue;
      }
      if (!target.altLabels.some((label) => normalizeLabel(label) === normalizeLabel(alias.from))) {
        issues.push(
          error("catalog_taxonomy.vocabulary.alias_missing", `alias "${alias.from}" -> "${alias.to}" is not an alt_label on ${target.id}`, schemePath),
        );
      }
    }
    for (const rejected of vocabulary.rejected_terms) {
      if (prefLabels.has(normalizeLabel(rejected))) {
        issues.push(error("catalog_taxonomy.vocabulary.rejected_pref", `rejected term "${rejected}" is a pref_label`, schemePath));
      }
    }
  }

  return issues;
}

export function validateConceptSchemeFile(catalog: Catalog, skillRoot: string): CatalogIssue[] {
  const relative = "catalog/taxonomy/concept-scheme.yaml";
  if (!existsSync(conceptSchemePath(skillRoot))) {
    return [error("catalog_taxonomy.scheme.missing", "concept scheme is missing", relative)];
  }
  try {
    const scheme = loadConceptScheme(skillRoot);
    return validateConceptScheme(catalog, scheme, skillRoot);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return [error("catalog_taxonomy.scheme.invalid", message, relative)];
  }
}
