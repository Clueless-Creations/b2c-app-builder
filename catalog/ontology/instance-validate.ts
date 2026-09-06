import type { CatalogIssue } from "../types.js";
import type { ProductInstanceDocument } from "./instance-types.js";
import { isA, slotsForClass } from "./query.js";
import { isOntologySlotId, type OntologyCardinality, type WorldOntology } from "./types.js";

function error(code: string, message: string, issuePath?: string): CatalogIssue {
  return { severity: "error", code, message, path: issuePath };
}

function bounds(cardinality: OntologyCardinality): { min: number; max: number } {
  switch (cardinality) {
    case "0..1":
      return { min: 0, max: 1 };
    case "1..1":
      return { min: 1, max: 1 };
    case "0..n":
      return { min: 0, max: Number.POSITIVE_INFINITY };
    case "1..n":
      return { min: 1, max: Number.POSITIVE_INFINITY };
    default: {
      const exhaustive: never = cardinality;
      return exhaustive;
    }
  }
}

export function validateProductInstanceDocument(doc: ProductInstanceDocument, ontology: WorldOntology, issuePath = "product.yaml"): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  if (doc.schemaVersion !== 1) {
    issues.push(error("catalog_ontology.instance.schema_version", `product.yaml schema_version must be 1, got ${doc.schemaVersion}`, issuePath));
  }

  const byId = new Map(doc.instances.map((item) => [item.id, item]));
  if (byId.size !== doc.instances.length) {
    const seen = new Set<string>();
    for (const item of doc.instances) {
      if (seen.has(item.id)) issues.push(error("catalog_ontology.instance.duplicate", `duplicate instance ${item.id}`, issuePath));
      seen.add(item.id);
    }
  }

  const classById = new Map(ontology.classes.map((item) => [item.id, item]));
  let appCount = 0;

  for (const item of doc.instances) {
    const cls = classById.get(item.classId);
    if (!cls) {
      issues.push(error("catalog_ontology.instance.unknown_class", `${item.id} names unknown class ${item.classId}`, issuePath));
      continue;
    }
    if (cls.abstract) {
      issues.push(error("catalog_ontology.instance.abstract_class", `${item.id} instantiates abstract ${item.classId}`, issuePath));
    }
    if (item.classId === "class.app") appCount += 1;

    const allowed = new Map(slotsForClass(ontology, item.classId).map((slot) => [slot.id, slot]));
    for (const slotId of Object.keys(item.slots)) {
      if (!isOntologySlotId(slotId) || !allowed.has(slotId)) {
        issues.push(error("catalog_ontology.instance.unknown_slot", `${item.id} sets ${slotId}, which is not a slot of ${item.classId}`, issuePath));
      }
    }

    for (const slot of allowed.values()) {
      const values = item.slots[slot.id] ?? [];
      const { min, max } = bounds(slot.cardinality);
      if (values.length < min || values.length > max) {
        issues.push(
          error("catalog_ontology.instance.cardinality", `${item.id} slot ${slot.id} has ${values.length} value(s); ${slot.cardinality} required`, issuePath),
        );
      }
      if (slot.rangeEnum) {
        for (const value of values) {
          if (!slot.rangeEnum.includes(value)) {
            issues.push(error("catalog_ontology.instance.enum", `${item.id} slot ${slot.id} value "${value}" is not in the enum`, issuePath));
          }
        }
      }
      if (slot.rangeClassId) {
        for (const value of values) {
          const target = byId.get(value);
          if (!target) {
            issues.push(error("catalog_ontology.instance.dangling", `${item.id} slot ${slot.id} points at missing instance ${value}`, issuePath));
            continue;
          }
          if (!isA(ontology, target.classId, slot.rangeClassId)) {
            issues.push(
              error(
                "catalog_ontology.instance.range",
                `${item.id} slot ${slot.id} points at ${value} (${target.classId}), which is not a ${slot.rangeClassId}`,
                issuePath,
              ),
            );
          }
        }
      }
    }
  }

  if (appCount === 0) {
    issues.push(error("catalog_ontology.instance.missing_app", "product.yaml must instantiate class.app", issuePath));
  }

  return issues;
}
