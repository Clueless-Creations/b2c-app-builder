import type { OntologyClassId, OntologySlot, WorldOntology } from "./types.js";

export function ontologyClassMap(ontology: WorldOntology): Map<OntologyClassId, WorldOntology["classes"][number]> {
  return new Map(ontology.classes.map((item) => [item.id, item]));
}

export function concreteClassIds(ontology: WorldOntology): OntologyClassId[] {
  return ontology.classes.filter((item) => !item.abstract).map((item) => item.id);
}

export function childrenOf(ontology: WorldOntology, parentId: OntologyClassId): OntologyClassId[] {
  return ontology.classes.filter((item) => item.parentIds.includes(parentId)).map((item) => item.id);
}

/** True when `childId` is `parentId` or a descendant. Walks parent_ids. */
export function isA(ontology: WorldOntology, childId: OntologyClassId, parentId: OntologyClassId): boolean {
  if (childId === parentId) return true;
  const byId = ontologyClassMap(ontology);
  const seen = new Set<OntologyClassId>();
  const stack = [...(byId.get(childId)?.parentIds ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === parentId) return true;
    seen.add(current);
    const node = byId.get(current);
    if (node) stack.push(...node.parentIds);
  }
  return false;
}

/** Slots whose domain is this class or any ancestor. */
export function slotsForClass(ontology: WorldOntology, classId: OntologyClassId): OntologySlot[] {
  return ontology.slots.filter((slot) => isA(ontology, classId, slot.domainId));
}

export function parentCycleIds(ontology: WorldOntology): OntologyClassId[] {
  const byId = ontologyClassMap(ontology);
  const visiting = new Set<OntologyClassId>();
  const settled = new Set<OntologyClassId>();
  const cyclic: OntologyClassId[] = [];

  const visit = (id: OntologyClassId): boolean => {
    if (settled.has(id)) return false;
    if (visiting.has(id)) {
      cyclic.push(id);
      return true;
    }
    visiting.add(id);
    const node = byId.get(id);
    let found = false;
    if (node) {
      for (const parentId of node.parentIds) {
        if (visit(parentId)) found = true;
      }
    }
    visiting.delete(id);
    settled.add(id);
    return found;
  };

  for (const item of ontology.classes) visit(item.id);
  return cyclic;
}
