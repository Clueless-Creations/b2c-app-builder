import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import YAML from "yaml";
import { packageFile } from "../../tooling/lib/skill-root.js";
import {
  isOntologyCardinality,
  isOntologyClassId,
  isOntologyInstanceDocumentStatus,
  isOntologyPlaneId,
  isOntologySlotId,
  type OntologyCardinality,
  type OntologyClass,
  type OntologyClassId,
  type OntologyCompetencyQuestion,
  type OntologyHomonymWithWork,
  type OntologyInstanceDocument,
  type OntologyInstanceStore,
  type OntologyPlane,
  type OntologyReuse,
  type OntologySlot,
  type WorldOntology,
} from "./types.js";

const schemaPath = packageFile(import.meta.url, "catalog/ontology/world.schema.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${field} must be a non-empty string array`);
  }
  return value.map((item) => (item as string).trim());
}

function asClassId(value: unknown, field: string): OntologyClassId {
  const id = asString(value, field);
  if (!isOntologyClassId(id)) throw new Error(`${field} "${id}" is not a class id`);
  return id;
}

function asClassIds(value: unknown, field: string): OntologyClassId[] {
  return asStringArray(value, field).map((id, index) => asClassId(id, `${field}[${index}]`));
}

function parsePlane(value: unknown, index: number): OntologyPlane {
  if (!isRecord(value)) throw new Error(`planes[${index}] must be an object`);
  const id = asString(value.id, `planes[${index}].id`);
  if (!isOntologyPlaneId(id)) throw new Error(`planes[${index}].id "${id}" is not a plane id`);
  return {
    id,
    prefLabel: asString(value.pref_label, `planes[${index}].pref_label`),
    definition: asString(value.definition, `planes[${index}].definition`),
    store: asString(value.store, `planes[${index}].store`),
  };
}

function parseInstanceDocument(value: unknown): OntologyInstanceDocument {
  if (!isRecord(value)) throw new Error("instance_document must be an object");
  const statusRaw = asString(value.status, "instance_document.status");
  if (!isOntologyInstanceDocumentStatus(statusRaw)) {
    throw new Error(`instance_document.status "${statusRaw}" is invalid`);
  }
  return {
    path: asString(value.path, "instance_document.path"),
    status: statusRaw,
    renders: asString(value.renders, "instance_document.renders"),
    schemaPath: asString(value.schema_path, "instance_document.schema_path"),
  };
}

function parseReuse(value: unknown, index: number): OntologyReuse {
  if (!isRecord(value)) throw new Error(`reuse[${index}] must be an object`);
  return {
    source: asString(value.source, `reuse[${index}].source`),
    mapsTo: asClassId(value.maps_to, `reuse[${index}].maps_to`),
    note: asString(value.note, `reuse[${index}].note`),
  };
}

function parseQuestion(value: unknown, index: number): OntologyCompetencyQuestion {
  if (!isRecord(value)) throw new Error(`competency_questions[${index}] must be an object`);
  return {
    id: asString(value.id, `competency_questions[${index}].id`),
    question: asString(value.question, `competency_questions[${index}].question`),
    classIds: asClassIds(value.class_ids, `competency_questions[${index}].class_ids`),
  };
}

function parseClass(value: unknown, index: number): OntologyClass {
  if (!isRecord(value)) throw new Error(`classes[${index}] must be an object`);
  if (typeof value.abstract !== "boolean") throw new Error(`classes[${index}].abstract must be a boolean`);
  return {
    id: asClassId(value.id, `classes[${index}].id`),
    prefLabel: asString(value.pref_label, `classes[${index}].pref_label`),
    definition: asString(value.definition, `classes[${index}].definition`),
    abstract: value.abstract,
    parentIds: asClassIds(value.parent_ids, `classes[${index}].parent_ids`),
  };
}

function parseSlot(value: unknown, index: number): OntologySlot {
  if (!isRecord(value)) throw new Error(`slots[${index}] must be an object`);
  const id = asString(value.id, `slots[${index}].id`);
  if (!isOntologySlotId(id)) throw new Error(`slots[${index}].id "${id}" is not a slot id`);
  const cardinalityRaw = asString(value.cardinality, `slots[${index}].cardinality`);
  if (!isOntologyCardinality(cardinalityRaw)) throw new Error(`slots[${index}].cardinality "${cardinalityRaw}" is invalid`);
  const cardinality: OntologyCardinality = cardinalityRaw;
  const hasRangeClass = value.range_class !== undefined;
  const hasRangeEnum = value.range_enum !== undefined;
  if (hasRangeClass === hasRangeEnum) {
    throw new Error(`slots[${index}] must set exactly one of range_class or range_enum`);
  }
  return {
    id,
    prefLabel: asString(value.pref_label, `slots[${index}].pref_label`),
    domainId: asClassId(value.domain, `slots[${index}].domain`),
    cardinality,
    ...(hasRangeClass ? { rangeClassId: asClassId(value.range_class, `slots[${index}].range_class`) } : {}),
    ...(hasRangeEnum ? { rangeEnum: asStringArray(value.range_enum, `slots[${index}].range_enum`) } : {}),
  };
}

function parseStore(value: unknown, index: number): OntologyInstanceStore {
  if (!isRecord(value)) throw new Error(`instance_stores[${index}] must be an object`);
  return {
    path: asString(value.path, `instance_stores[${index}].path`),
    classIds: asClassIds(value.class_ids, `instance_stores[${index}].class_ids`),
  };
}

function parseHomonym(value: unknown, index: number): OntologyHomonymWithWork {
  if (!isRecord(value)) throw new Error(`homonyms_with_work[${index}] must be an object`);
  return {
    label: asString(value.label, `homonyms_with_work[${index}].label`),
    worldClassId: asClassId(value.world_class_id, `homonyms_with_work[${index}].world_class_id`),
    workConceptId: asString(value.work_concept_id, `homonyms_with_work[${index}].work_concept_id`),
    gloss: asString(value.gloss, `homonyms_with_work[${index}].gloss`),
  };
}

function asObjectArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

export function worldOntologyPath(skillRoot: string): string {
  return path.join(skillRoot, "catalog/ontology/world.yaml");
}

export function loadWorldOntology(skillRoot: string): WorldOntology {
  const filePath = worldOntologyPath(skillRoot);
  if (!existsSync(filePath)) throw new Error(`world ontology is missing at ${filePath}`);
  const parsed: unknown = YAML.parse(readFileSync(filePath, "utf8"));
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(parsed)) {
    const detail = (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "invalid"}`).join("; ");
    throw new Error(`world ontology failed JSON Schema: ${detail}`);
  }
  if (!isRecord(parsed)) throw new Error("world ontology must parse to an object");
  const laterRaw = parsed.later;
  const later = laterRaw === undefined ? [] : asStringArray(laterRaw, "later");
  return {
    schemaVersion: typeof parsed.schema_version === "number" ? parsed.schema_version : 0,
    id: asString(parsed.id, "id"),
    uri: asString(parsed.uri, "uri"),
    prefLabel: asString(parsed.pref_label, "pref_label"),
    definition: asString(parsed.definition, "definition"),
    domainSentence: asString(parsed.domain_sentence, "domain_sentence"),
    inScope: asStringArray(parsed.in_scope, "in_scope"),
    outOfScope: asStringArray(parsed.out_of_scope, "out_of_scope"),
    later,
    planes: asObjectArray(parsed.planes, "planes").map(parsePlane),
    instanceDocument: parseInstanceDocument(parsed.instance_document),
    reuse: asObjectArray(parsed.reuse, "reuse").map(parseReuse),
    competencyQuestions: asObjectArray(parsed.competency_questions, "competency_questions").map(parseQuestion),
    classes: asObjectArray(parsed.classes, "classes").map(parseClass),
    slots: asObjectArray(parsed.slots, "slots").map(parseSlot),
    instanceStores: asObjectArray(parsed.instance_stores, "instance_stores").map(parseStore),
    homonymsWithWork: asObjectArray(parsed.homonyms_with_work, "homonyms_with_work").map(parseHomonym),
  };
}
