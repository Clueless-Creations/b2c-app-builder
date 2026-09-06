/**
 * World ontology: a map of the consumer-app business, not a map of the work.
 * Instances live in workspace files. Catalog workflows stay the runtime graph.
 * Methodology: Noy & McGuinness Ontology 101; Gruber 1993 design criteria.
 */

export const ONTOLOGY_CARDINALITIES = ["0..1", "1..1", "0..n", "1..n"] as const;
export type OntologyCardinality = (typeof ONTOLOGY_CARDINALITIES)[number];

export const ONTOLOGY_FEATURE_SCOPES = ["v1", "deferred", "non-goal"] as const;
export type OntologyFeatureScope = (typeof ONTOLOGY_FEATURE_SCOPES)[number];

export type OntologyClassId = `class.${string}`;
export type OntologySlotId = `slot.${string}`;
export type OntologyPlaneId = `plane.${string}`;

export const ONTOLOGY_PLANE_IDS = ["plane.world", "plane.operator", "plane.operating"] as const;
export type RequiredOntologyPlaneId = (typeof ONTOLOGY_PLANE_IDS)[number];

export const ONTOLOGY_INSTANCE_DOCUMENT_STATUSES = ["planned", "active"] as const;
export type OntologyInstanceDocumentStatus = (typeof ONTOLOGY_INSTANCE_DOCUMENT_STATUSES)[number];

export interface OntologyPlane {
  id: OntologyPlaneId;
  prefLabel: string;
  definition: string;
  store: string;
}

export interface OntologyInstanceDocument {
  path: string;
  status: OntologyInstanceDocumentStatus;
  renders: string;
  schemaPath: string;
}

export interface OntologyReuse {
  source: string;
  mapsTo: OntologyClassId;
  note: string;
}

export interface OntologyInstanceStore {
  path: string;
  classIds: OntologyClassId[];
}

export interface OntologyCompetencyQuestion {
  id: string;
  question: string;
  classIds: OntologyClassId[];
}

export interface OntologyClass {
  id: OntologyClassId;
  prefLabel: string;
  definition: string;
  abstract: boolean;
  parentIds: OntologyClassId[];
}

export interface OntologySlot {
  id: OntologySlotId;
  prefLabel: string;
  domainId: OntologyClassId;
  cardinality: OntologyCardinality;
  rangeClassId?: OntologyClassId;
  rangeEnum?: string[];
}

export interface OntologyHomonymWithWork {
  label: string;
  worldClassId: OntologyClassId;
  workConceptId: string;
  gloss: string;
}

export interface WorldOntology {
  schemaVersion: number;
  id: string;
  uri: string;
  prefLabel: string;
  definition: string;
  domainSentence: string;
  inScope: string[];
  outOfScope: string[];
  later: string[];
  planes: OntologyPlane[];
  instanceDocument: OntologyInstanceDocument;
  reuse: OntologyReuse[];
  competencyQuestions: OntologyCompetencyQuestion[];
  classes: OntologyClass[];
  slots: OntologySlot[];
  instanceStores: OntologyInstanceStore[];
  homonymsWithWork: OntologyHomonymWithWork[];
}

export function isOntologyClassId(value: string): value is OntologyClassId {
  return /^class\.[a-z][a-z0-9-]*$/.test(value);
}

export function isOntologySlotId(value: string): value is OntologySlotId {
  return /^slot\.[a-z][a-z0-9.-]*$/.test(value);
}

export function isOntologyCardinality(value: string): value is OntologyCardinality {
  return (ONTOLOGY_CARDINALITIES as readonly string[]).includes(value);
}

export function isOntologyPlaneId(value: string): value is OntologyPlaneId {
  return /^plane\.[a-z][a-z0-9-]*$/.test(value);
}

export function isOntologyInstanceDocumentStatus(value: string): value is OntologyInstanceDocumentStatus {
  return (ONTOLOGY_INSTANCE_DOCUMENT_STATUSES as readonly string[]).includes(value);
}
