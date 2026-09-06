/**
 * Small, self-contained id helpers for the v2 catalog. Deliberately NOT imported from
 * runtime/graph/ids.js: catalog/ is the replacement authority for the definition graph
 * (R20), and the greenfield tree must not depend on the tree U11 deletes.
 */

export type CatalogNodeKind = "area" | "domain" | "phase" | "lane" | "role" | "context" | "reference" | "workflow" | "artifact" | "gate";

export type CatalogId = `${CatalogNodeKind}.${string}`;

export function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unnamed"
  );
}

export function catalogId<T extends CatalogNodeKind>(kind: T, ...parts: string[]): `${T}.${string}` {
  return `${kind}.${parts.map(slug).join(".")}` as `${T}.${string}`;
}

export function isCatalogId(value: string): value is CatalogId {
  return /^(area|domain|phase|lane|role|context|reference|workflow|artifact|gate)\.[a-z0-9][a-z0-9.-]*$/.test(value);
}
