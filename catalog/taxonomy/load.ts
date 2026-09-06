import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import YAML from "yaml";
import {
  isTaxonomyConceptKind,
  isTaxonomyFacetId,
  type ConceptScheme,
  type TaxonomyConcept,
  type TaxonomyConceptKind,
  type TaxonomyFacet,
  type TaxonomyFacetId,
  type TaxonomyHomonymGroup,
} from "./types.js";

const schemaPath = fileURLToPath(new URL("./concept-scheme.schema.json", import.meta.url));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${field} must be a string array`);
  }
  return value.map((item) => (item as string).trim());
}

function parseFacet(value: unknown, index: number): TaxonomyFacet {
  if (!isRecord(value)) throw new Error(`facets[${index}] must be an object`);
  const id = asString(value.id, `facets[${index}].id`);
  if (!isTaxonomyFacetId(id)) throw new Error(`facets[${index}].id "${id}" is not a known facet`);
  return {
    id,
    prefLabel: asString(value.pref_label, `facets[${index}].pref_label`),
    definition: asString(value.definition, `facets[${index}].definition`),
  };
}

function parseConcept(value: unknown, index: number): TaxonomyConcept {
  if (!isRecord(value)) throw new Error(`concepts[${index}] must be an object`);
  const kindRaw = asString(value.kind, `concepts[${index}].kind`);
  if (!isTaxonomyConceptKind(kindRaw)) throw new Error(`concepts[${index}].kind "${kindRaw}" is invalid`);
  const kind: TaxonomyConceptKind = kindRaw;
  const facetId = asString(value.facet_id, `concepts[${index}].facet_id`);
  if (!isTaxonomyFacetId(facetId)) throw new Error(`concepts[${index}].facet_id "${facetId}" is not a known facet`);
  const definition = value.definition === undefined ? undefined : asString(value.definition, `concepts[${index}].definition`);
  const facet: TaxonomyFacetId = facetId;
  return {
    id: asString(value.id, `concepts[${index}].id`),
    kind,
    facetId: facet,
    prefLabel: asString(value.pref_label, `concepts[${index}].pref_label`),
    altLabels: asStringArray(value.alt_labels, `concepts[${index}].alt_labels`),
    ...(definition ? { definition } : {}),
  };
}

function parseHomonym(value: unknown, index: number): TaxonomyHomonymGroup {
  if (!isRecord(value)) throw new Error(`homonyms[${index}] must be an object`);
  const sensesRaw = value.senses;
  if (!Array.isArray(sensesRaw) || sensesRaw.length < 2) throw new Error(`homonyms[${index}].senses must have at least two entries`);
  return {
    label: asString(value.label, `homonyms[${index}].label`),
    senses: sensesRaw.map((sense, senseIndex) => {
      if (!isRecord(sense)) throw new Error(`homonyms[${index}].senses[${senseIndex}] must be an object`);
      return {
        conceptId: asString(sense.concept_id, `homonyms[${index}].senses[${senseIndex}].concept_id`),
        gloss: asString(sense.gloss, `homonyms[${index}].senses[${senseIndex}].gloss`),
      };
    }),
  };
}

export function conceptSchemePath(skillRoot: string): string {
  return path.join(skillRoot, "catalog/taxonomy/concept-scheme.yaml");
}

export function loadConceptScheme(skillRoot: string): ConceptScheme {
  const filePath = conceptSchemePath(skillRoot);
  if (!existsSync(filePath)) throw new Error(`concept scheme is missing at ${filePath}`);
  const parsed: unknown = YAML.parse(readFileSync(filePath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    const detail = (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
    throw new Error(`concept scheme failed JSON Schema: ${detail}`);
  }
  if (!isRecord(parsed)) throw new Error("concept scheme must parse to an object");
  const facetsRaw = parsed.facets;
  const conceptsRaw = parsed.concepts;
  const homonymsRaw = parsed.homonyms;
  if (!Array.isArray(facetsRaw) || !Array.isArray(conceptsRaw) || !Array.isArray(homonymsRaw)) {
    throw new Error("concept scheme facets, concepts, and homonyms must be arrays");
  }
  return {
    schemaVersion: typeof parsed.schema_version === "number" ? parsed.schema_version : 0,
    id: asString(parsed.id, "id"),
    uri: asString(parsed.uri, "uri"),
    prefLabel: asString(parsed.pref_label, "pref_label"),
    definition: asString(parsed.definition, "definition"),
    hiddenLabels: asStringArray(parsed.hidden_labels, "hidden_labels"),
    facets: facetsRaw.map((item, index) => parseFacet(item, index)),
    concepts: conceptsRaw.map((item, index) => parseConcept(item, index)),
    homonyms: homonymsRaw.map((item, index) => parseHomonym(item, index)),
  };
}
