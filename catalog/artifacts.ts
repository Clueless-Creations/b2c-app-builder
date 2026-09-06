import { catalogId } from "./ids.js";
import type { CatalogArtifact, CatalogWorkflowDef } from "./types.js";
import { APP_SOURCE_FINGERPRINT_PATH } from "../kernel/engine/source-fingerprint.js";
export { APP_SOURCE_FINGERPRINT_PATH } from "../kernel/engine/source-fingerprint.js";

/**
 * Artifacts are derived from workflow outputPaths, not hand-authored — one entry per
 * distinct output path across the catalog. Ported in spirit from
 * runtime/graph/graph.ts's artifact-merging loop, but simpler: v1 also discovered
 * artifacts from `examples/workspace/business/state/business-state.json` lane evidence (a second,
 * looser source of artifact identity that tolerated the same path being claimed by more
 * than one workflow — see catalog/workflows/*.ts headers for the collisions that produced
 * in this rebuild). v2 has one derived source for produced artifacts: each output path has
 * exactly one producing workflow. The sole explicit exception is the session-observed app
 * source fingerprint. It is an external graph input so source edits can stale consumers before
 * the frontier is computed.
 */
export function buildArtifacts(workflows: readonly CatalogWorkflowDef[]): CatalogArtifact[] {
  const artifacts: CatalogArtifact[] = [
    {
      id: catalogId("artifact", APP_SOURCE_FINGERPRINT_PATH),
      path: APP_SOURCE_FINGERPRINT_PATH,
      ownerDomainId: "domain.engineering",
      laneIds: ["engineering"],
      generated: true,
    },
  ];
  for (const wf of workflows) {
    for (const outputPath of wf.outputPaths) {
      artifacts.push({
        id: catalogId("artifact", outputPath),
        path: outputPath,
        ownerDomainId: wf.domainId,
        laneIds: wf.laneIds,
        generated: outputPath.endsWith(".html") || outputPath.startsWith("design/system/") || outputPath.includes("generated"),
      });
    }
  }
  return artifacts.sort((a, b) => a.path.localeCompare(b.path));
}
