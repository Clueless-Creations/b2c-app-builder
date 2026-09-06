import type { OntologyClassId, OntologySlotId } from "./types.js";

export const PRODUCT_COPY_FIELDS = [
  ["intro", "intro"],
  ["promise_user_problem", "promiseUserProblem"],
  ["evidence_and_category", "evidenceAndCategory"],
  ["core_loop", "coreLoop"],
  ["complete_scope", "completeScope"],
  ["requirements", "requirements"],
  ["journey", "journey"],
  ["metrics", "metrics"],
  ["risks", "risks"],
  ["decision_log", "decisionLog"],
  ["ownership", "ownership"],
] as const;

export type ProductCopyYamlKey = (typeof PRODUCT_COPY_FIELDS)[number][0];
export type ProductCopyField = (typeof PRODUCT_COPY_FIELDS)[number][1];

export interface ProductMeta {
  version: string;
  name: string;
  slug?: string;
  description: string;
  status: string;
}

export interface ProductCopy {
  intro: string;
  promiseUserProblem: string;
  evidenceAndCategory: string;
  coreLoop: string;
  completeScope: string;
  requirements: string;
  journey: string;
  metrics: string;
  risks: string;
  decisionLog: string;
  ownership: string;
}

export interface ProductInstance {
  id: string;
  classId: OntologyClassId;
  slots: Partial<Record<OntologySlotId, string[]>>;
}

export interface ProductInstanceDocument {
  schemaVersion: number;
  meta: ProductMeta;
  copy: ProductCopy;
  instances: ProductInstance[];
}

export const PRODUCT_SECTION_ORDER = [
  ["Promise, user, and problem", "promiseUserProblem"],
  ["Evidence and category", "evidenceAndCategory"],
  ["Core loop and first value", "coreLoop"],
  ["Complete product scope", "completeScope"],
  ["Requirements and acceptance", "requirements"],
  ["Journey and downstream routes", "journey"],
  ["Metrics and monetization posture", "metrics"],
  ["Risks and open questions", "risks"],
  ["Decision log", "decisionLog"],
  ["Source ownership and state boundary", "ownership"],
] as const satisfies ReadonlyArray<readonly [string, ProductCopyField]>;
