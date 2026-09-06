import { readFirstpartyPackage, FIRSTPARTY_DIRECTORY } from "./packs/installed-firstparty.js";
export { readSkillVersion } from "./packs/installed-firstparty.js";
import { composePacks } from "./packs/compose.js";
import { loadSnapshotPacks } from "./packs/snapshots.js";
import type { PackManifest } from "./packs/types.js";
import type { Catalog } from "./types.js";

/** Runtime catalogs have one owner: verified extension manifests composed from empty scaffolding. */
export function composeCatalog(skillRoot: string, packs: readonly PackManifest[] = []): Catalog {
  const owner = readFirstpartyPackage(skillRoot);
  const manifests = loadSnapshotPacks([owner], { prefix: FIRSTPARTY_DIRECTORY, origin: "skill" });
  return composeCatalogFromPacks(owner.snapshot.extension.version, [...manifests, ...packs]);
}

/** Compose only the explicitly selected manifests, including installed firstparty when selected. */
export function composeCatalogFromPacks(skillVersion: string, packs: readonly PackManifest[]): Catalog {
  const empty: Catalog = {
    schemaVersion: "2.0.0",
    skillVersion,
    areas: [],
    domains: [],
    phases: [],
    lanes: [],
    roles: [],
    contextPacks: [],
    references: [],
    workflows: [],
    artifacts: [],
    gates: [],
    profiles: [],
    repositoryProfiles: [],
    providerContracts: [],
  };
  const result = composePacks(empty, packs);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(`pack composition failed: ${errors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`);
  return result.catalog;
}
export { composePacks, compositionFingerprint, catalogCounts, withComposition } from "./packs/compose.js";
export type { PackManifest } from "./packs/types.js";
