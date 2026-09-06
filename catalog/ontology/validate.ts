import { existsSync } from "node:fs";
import path from "node:path";
import type { CatalogIssue } from "../types.js";
import { loadWorldOntology, worldOntologyPath } from "./load.js";
import { validateProductWorkspace } from "./product-workspace.js";
import { childrenOf, ontologyClassMap, parentCycleIds } from "./query.js";
import { ONTOLOGY_PLANE_IDS, type WorldOntology } from "./types.js";

function error(code: string, message: string, issuePath?: string): CatalogIssue {
  return { severity: "error", code, message, path: issuePath };
}

const ONTOLOGY_PATH = "catalog/ontology/world.yaml";

export function validateWorldOntology(ontology: WorldOntology, workConceptIds?: ReadonlySet<string>, skillRoot?: string): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  if (ontology.schemaVersion !== 1) {
    issues.push(error("catalog_ontology.schema_version", `world ontology schema_version must be 1, got ${ontology.schemaVersion}`, ONTOLOGY_PATH));
  }

  const planeIds = new Set(ontology.planes.map((plane) => plane.id));
  if (planeIds.size !== ontology.planes.length) {
    issues.push(error("catalog_ontology.plane.duplicate", "duplicate plane id", ONTOLOGY_PATH));
  }
  for (const required of ONTOLOGY_PLANE_IDS) {
    if (!planeIds.has(required)) {
      issues.push(error("catalog_ontology.plane.missing", `plane ${required} is missing`, ONTOLOGY_PATH));
    }
  }

  const worldStore = ontology.planes.find((plane) => plane.id === "plane.world")?.store;
  if (ontology.instanceDocument.status === "planned" && worldStore !== "PRODUCT.md") {
    issues.push(error("catalog_ontology.plane.world_store", "while instance YAML is planned, plane.world store must remain PRODUCT.md", ONTOLOGY_PATH));
  }
  if (ontology.instanceDocument.status === "active" && worldStore !== ontology.instanceDocument.path) {
    issues.push(
      error("catalog_ontology.plane.world_store", `when instance YAML is active, plane.world store must be ${ontology.instanceDocument.path}`, ONTOLOGY_PATH),
    );
  }
  if (ontology.instanceDocument.renders !== "PRODUCT.md") {
    issues.push(error("catalog_ontology.instance.renders", "instance document must render PRODUCT.md", ONTOLOGY_PATH));
  }

  if (skillRoot !== undefined) {
    const schemaFile = path.join(skillRoot, ontology.instanceDocument.schemaPath);
    if (!existsSync(schemaFile)) {
      issues.push(error("catalog_ontology.instance.schema_missing", `instance schema missing at ${ontology.instanceDocument.schemaPath}`, ONTOLOGY_PATH));
    }
    const prematurePaths = [
      path.join(skillRoot, "surfaces/workspace-template/new-business", ontology.instanceDocument.path),
      path.join(skillRoot, "examples/workspace/business", ontology.instanceDocument.path),
    ];
    if (ontology.instanceDocument.status === "planned") {
      for (const premature of prematurePaths) {
        if (existsSync(premature)) {
          issues.push(
            error(
              "catalog_ontology.instance.premature",
              `${ontology.instanceDocument.path} must not exist in a workspace while status is planned`,
              ontology.instanceDocument.path,
            ),
          );
        }
      }
    }
    if (ontology.instanceDocument.status === "active") {
      for (const relative of ["surfaces/workspace-template/new-business", "examples/workspace/business"]) {
        issues.push(...validateProductWorkspace(path.join(skillRoot, relative), ontology));
      }
    }
  }

  const byId = ontologyClassMap(ontology);
  const classIds = new Set(byId.keys());
  if (byId.size !== ontology.classes.length) {
    const seen = new Set<string>();
    for (const item of ontology.classes) {
      if (seen.has(item.id)) issues.push(error("catalog_ontology.class.duplicate", `duplicate class ${item.id}`, ONTOLOGY_PATH));
      seen.add(item.id);
    }
  }

  const roots = ontology.classes.filter((item) => item.parentIds.length === 0);
  if (roots.length !== 1 || roots[0]?.id !== "class.world-thing") {
    issues.push(
      error(
        "catalog_ontology.class.root",
        `world ontology must have exactly one root class.world-thing, found ${roots.map((item) => item.id).join(", ") || "none"}`,
        ONTOLOGY_PATH,
      ),
    );
  }

  for (const item of ontology.classes) {
    if (item.abstract && item.parentIds.length === 0 && item.id !== "class.world-thing") {
      issues.push(error("catalog_ontology.class.extra_root", `${item.id} has no parent`, ONTOLOGY_PATH));
    }
    for (const parentId of item.parentIds) {
      if (!classIds.has(parentId)) {
        issues.push(error("catalog_ontology.class.unknown_parent", `${item.id} names unknown parent ${parentId}`, ONTOLOGY_PATH));
      }
      if (parentId === item.id) {
        issues.push(error("catalog_ontology.class.self_parent", `${item.id} parents itself`, ONTOLOGY_PATH));
      }
    }
    const childCount = childrenOf(ontology, item.id).length;
    if (childCount === 1) {
      issues.push(error("catalog_ontology.class.single_child", `${item.id} has exactly one subclass; add a sibling or flatten`, ONTOLOGY_PATH));
    }
    if (childCount > 12) {
      issues.push(error("catalog_ontology.class.too_many_children", `${item.id} has ${childCount} subclasses; add an intermediate class`, ONTOLOGY_PATH));
    }
    if (!item.abstract && childCount > 0) {
      issues.push(error("catalog_ontology.class.concrete_parent", `${item.id} is concrete but has subclasses`, ONTOLOGY_PATH));
    }
  }

  for (const cyclicId of parentCycleIds(ontology)) {
    issues.push(error("catalog_ontology.class.cycle", `class parent cycle includes ${cyclicId}`, ONTOLOGY_PATH));
  }

  const slotIds = new Set<string>();
  for (const slot of ontology.slots) {
    if (slotIds.has(slot.id)) issues.push(error("catalog_ontology.slot.duplicate", `duplicate slot ${slot.id}`, ONTOLOGY_PATH));
    slotIds.add(slot.id);
    if (!classIds.has(slot.domainId)) {
      issues.push(error("catalog_ontology.slot.unknown_domain", `${slot.id} domain ${slot.domainId} is not a class`, ONTOLOGY_PATH));
    }
    if (slot.rangeClassId && !classIds.has(slot.rangeClassId)) {
      issues.push(error("catalog_ontology.slot.unknown_range", `${slot.id} range ${slot.rangeClassId} is not a class`, ONTOLOGY_PATH));
    }
    if (slot.rangeEnum && new Set(slot.rangeEnum).size !== slot.rangeEnum.length) {
      issues.push(error("catalog_ontology.slot.enum_duplicate", `${slot.id} has duplicate enum values`, ONTOLOGY_PATH));
    }
  }

  const mentioned = new Set<string>();
  const questionIds = new Set<string>();
  for (const question of ontology.competencyQuestions) {
    if (questionIds.has(question.id)) {
      issues.push(error("catalog_ontology.question.duplicate", `duplicate competency question ${question.id}`, ONTOLOGY_PATH));
    }
    questionIds.add(question.id);
    for (const classId of question.classIds) {
      mentioned.add(classId);
      if (!classIds.has(classId)) {
        issues.push(error("catalog_ontology.question.unknown_class", `${question.id} names unknown class ${classId}`, ONTOLOGY_PATH));
      }
    }
  }

  for (const item of ontology.classes) {
    if (item.abstract) continue;
    if (!mentioned.has(item.id)) {
      issues.push(error("catalog_ontology.class.unasked", `concrete class ${item.id} appears in no competency question`, ONTOLOGY_PATH));
    }
  }

  for (const item of ontology.reuse) {
    if (!classIds.has(item.mapsTo)) {
      issues.push(error("catalog_ontology.reuse.unknown_class", `reuse of ${item.source} maps to unknown ${item.mapsTo}`, ONTOLOGY_PATH));
    }
  }

  for (const store of ontology.instanceStores) {
    for (const classId of store.classIds) {
      if (!classIds.has(classId)) {
        issues.push(error("catalog_ontology.store.unknown_class", `${store.path} names unknown class ${classId}`, ONTOLOGY_PATH));
      }
    }
  }

  const concrete = ontology.classes.filter((item) => !item.abstract).map((item) => item.id);
  const stored = new Set(ontology.instanceStores.flatMap((store) => store.classIds));
  for (const classId of concrete) {
    if (!stored.has(classId)) {
      issues.push(error("catalog_ontology.class.unstored", `concrete class ${classId} has no instance store`, ONTOLOGY_PATH));
    }
  }

  for (const homonym of ontology.homonymsWithWork) {
    if (!classIds.has(homonym.worldClassId)) {
      issues.push(error("catalog_ontology.homonym.unknown_class", `homonym "${homonym.label}" names unknown ${homonym.worldClassId}`, ONTOLOGY_PATH));
    }
    if (workConceptIds && !workConceptIds.has(homonym.workConceptId)) {
      issues.push(
        error("catalog_ontology.homonym.unknown_work", `homonym "${homonym.label}" names unknown work concept ${homonym.workConceptId}`, ONTOLOGY_PATH),
      );
    }
  }

  return issues;
}

export function validateWorldOntologyFile(skillRoot: string, workConceptIds?: ReadonlySet<string>): CatalogIssue[] {
  if (!existsSync(worldOntologyPath(skillRoot))) {
    return [error("catalog_ontology.missing", "world ontology is missing", ONTOLOGY_PATH)];
  }
  try {
    return validateWorldOntology(loadWorldOntology(skillRoot), workConceptIds, skillRoot);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return [error("catalog_ontology.invalid", message, ONTOLOGY_PATH)];
  }
}
