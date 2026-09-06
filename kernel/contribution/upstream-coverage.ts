import type { CatalogKnowledgePackage } from "../../catalog/types.js";
import type { UpstreamManifest } from "../../contracts/contribution/contract.js";
import { githubIdentity } from "./github-metadata.js";

/** A maintainer projection of existing source declarations, not an adoption or support claim. */
export interface UpstreamCoverageRow {
  repository: string;
  referenceId: string;
  path: string;
  sourceId: string;
  upstreamId: string | null;
  status: "tracked" | "needs-link" | "untracked" | "conflict";
  reason: string;
}

function key(url: string): string | null {
  const identity = githubIdentity(url);
  return identity ? `${identity.owner}/${identity.repo}`.toLowerCase() : null;
}

function aliasKey(alias: string): string | null {
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/u.test(alias)) return key(`https://github.com/${alias}`);
  return key(alias);
}

/** URLs only identify candidates. Never follow them, fetch source, install skills or award credit. */
export function upstreamCoverage(
  references: readonly CatalogKnowledgePackage[],
  upstreams: readonly UpstreamManifest[],
  ownRepository?: string,
): UpstreamCoverageRow[] {
  const own = ownRepository ? key(ownRepository.replace(/^git\+/u, "")) : null;
  const rows: UpstreamCoverageRow[] = [];
  const seen = new Set<string>();
  for (const reference of references) {
    if (reference.lifecycle !== "active") continue;
    if (!reference.sessionScoped && !reference.workflowIds.length && !reference.contextPackIds.length) continue;
    for (const source of reference.sources) {
      const repository = key(source.url);
      if (!repository || repository === own) continue;
      const rowKey = `${reference.id}:${source.id}`;
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);
      const matches = upstreams.filter((upstream) => [key(upstream.canonicalUrl), ...upstream.aliases.map(aliasKey)].includes(repository));
      const explicit = source.upstreamId ? upstreams.find((upstream) => upstream.id === source.upstreamId) : undefined;
      const chosen = explicit ?? (matches.length === 1 ? matches[0] : undefined);
      let status: UpstreamCoverageRow["status"];
      let reason: string;
      if ((source.upstreamId && (!explicit || !matches.includes(explicit))) || matches.length > 1) {
        status = "conflict";
        reason = "Declared identity is missing, contradictory or ambiguous; resolve it before adoption.";
      } else if (!chosen) {
        status = "untracked";
        reason = "Referenced repository has no maintained upstream identity. Review use and rights before adopting or crediting it.";
      } else {
        const baselines = [chosen.baselines.reviewedSource?.revision, chosen.baselines.reviewedGuidance?.revision];
        const exact = source.revision !== undefined && /^[a-f0-9]{40}$/u.test(source.revision) && baselines.includes(source.revision);
        const linked = source.upstreamId === chosen.id && chosen.sourceIds.includes(source.id);
        status = linked && exact ? "tracked" : "needs-link";
        reason =
          status === "tracked"
            ? "Source identity and reviewed commit are linked. This does not certify executable compatibility or live results."
            : "Project identity exists, but this reference lacks a matching source mapping or exact reviewed commit.";
      }
      rows.push({
        repository,
        referenceId: reference.id,
        path: reference.path,
        sourceId: source.id,
        upstreamId: chosen?.id ?? source.upstreamId ?? null,
        status,
        reason,
      });
    }
  }
  return rows.sort((a, b) => a.repository.localeCompare(b.repository) || a.referenceId.localeCompare(b.referenceId) || a.sourceId.localeCompare(b.sourceId));
}

const cell = (value: string): string => value.replace(/\r?\n/gu, " ").replace(/\|/gu, "\\|");

export function renderUpstreamCoverage(rows: readonly UpstreamCoverageRow[]): string {
  const projects = new Set(rows.map((row) => row.repository));
  const gaps = rows.filter((row) => row.status !== "tracked");
  const sections = [
    ["Needs review or linkage", gaps],
    ["Linked reviewed sources", rows.filter((row) => row.status === "tracked")],
  ] as const;
  return [
    "# Upstream source coverage",
    "",
    "Generated from active, bound knowledge source declarations and catalog/upstreams. This is a maintainer review queue, not a second registry. A cited repository may be an example, optional tool, adapted method or runtime dependency; the report does not infer adoption or permission from a URL. Only an explicit reviewed contribution changes support or acknowledgments.",
    "",
    `Scope: ${projects.size} referenced repositories, ${rows.length} source bindings, ${gaps.length} bindings needing review or linkage.`,
    "",
    "The scan excludes inactive/unbound knowledge, self-references, non-GitHub sources, undeclared prose URLs, package-manager dependencies and resources outside knowledge manifests. An empty queue is not proof that every dependency is tracked. Inspect those other surfaces during contribution review. Repository aliases are matched only when declared in an upstream manifest.",
    "",
    "Use b2c contribute plan for an untracked source. For a maintained project, inspect its upstream record and use upstream-check and upgrade-plan. Read source changes and local adaptations before updating a baseline. No network, host probe, install, scheduled update or business repin happens when this report is rendered.",
    "",
    ...sections.flatMap(([title, entries]) => [
      `## ${title}`,
      "",
      ...(entries.length
        ? [
            "| Repository | Knowledge owner | Source ID | Upstream | Status | Action or limit |",
            "| --- | --- | --- | --- | --- | --- |",
            ...entries.map(
              (row) => `| ${[row.repository, `\`${row.path}\``, row.sourceId, row.upstreamId ?? "none", row.status, row.reason].map(cell).join(" | ")} |`,
            ),
            "",
          ]
        : ["None in the inspected scope.", ""]),
    ]),
    "Generated by tooling/render-credits.ts. Edit knowledge sources and upstream manifests, not this file.",
    "",
  ].join("\n");
}
