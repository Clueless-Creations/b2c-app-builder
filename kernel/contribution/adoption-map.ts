import type { ContributionManifest } from "../../contracts/contribution/contract.js";

/**
 * ADOPTION_MAP.md: the human-readable projection of a contribution manifest. It is generated from
 * the manifest only, so it never carries a claim the manifest does not. The only timestamp is
 * the manifest's createdAt; the rest is deterministic for one manifest.
 */
function cell(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null || value === "") return "none";
  return String(value).replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
}

function table(header: string[], rows: string[][]): string[] {
  if (!rows.length) return ["_none_"];
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)];
}

function bullets(items: readonly string[], empty = "_none_"): string[] {
  return items.length ? items.map((item) => `- ${cell(item)}`) : [empty];
}

export function renderAdoptionMap(manifest: ContributionManifest): string {
  const lines: string[] = [];
  lines.push(`# Adoption map: ${manifest.id}`, "");
  lines.push(`Goal: ${manifest.goal}`, "");
  lines.push(`Created: ${manifest.createdAt}. Synthetic: ${manifest.synthetic ? "yes (labeled fixtures, not a creator's material)" : "no"}.`, "");
  lines.push("## Routing", "");
  lines.push(`- Scope: ${manifest.scope}`);
  lines.push(`- Verdict: ${manifest.routing.verdict}`);
  lines.push(`- Intended target: ${manifest.routing.intendedTarget}`);
  lines.push(`- Effect: ${manifest.routing.effect}`);
  lines.push(`- Reason: ${manifest.routing.reason}`, "");
  lines.push("## Sources", "");
  lines.push(
    ...table(
      ["id", "kind", "origin", "publisher", "revision", "retrieval", "rights", "refused directives"],
      manifest.sources.map((source) => [
        source.id,
        source.kind,
        source.canonicalUrl ?? source.localPath ?? "",
        source.publisher ?? "",
        source.revision ?? "unknown",
        `${source.retrieval.status}${source.retrieval.notes ? ` (${source.retrieval.notes})` : ""}`,
        `${source.rights.status}${source.rights.spdx ? ` ${source.rights.spdx}` : ""}${source.rights.evidence ? `; evidence ${source.rights.evidence}` : ""}`,
        String(source.directives.length),
      ]),
    ),
    "",
  );
  const refused = manifest.sources.flatMap((source) =>
    source.directives.map((directive) => [source.id, directive.location, directive.category, directive.text]),
  );
  if (refused.length) {
    lines.push(
      "### Refused directives",
      "",
      "Sentences in the sources that read as instructions to an agent. They are recorded as data and were not followed.",
      "",
    );
    lines.push(...table(["source", "location", "category", "text"], refused), "");
  }
  const unknowns = manifest.sources.flatMap((source) => source.unknowns.map((unknown) => `${source.id}: ${unknown}`));
  if (unknowns.length) lines.push("### Source unknowns", "", ...bullets(unknowns), "");
  lines.push("## Units", "");
  lines.push(
    ...table(
      ["unit", "kind", "upstream location", "local target", "disposition", "status", "selection", "rationale", "verification"],
      manifest.units.map((unit) => [
        unit.id,
        unit.kind,
        unit.upstream ? `${unit.upstream.sourceId}${unit.upstream.selector ? ` ${unit.upstream.selector}` : ""}` : "original (no upstream)",
        `${unit.target.kind}${unit.target.id ? ` ${unit.target.id}` : ""}${unit.target.path ? ` ${unit.target.path}` : ""}${unit.target.owner ? ` (owner ${unit.target.owner})` : ""}`,
        unit.disposition,
        unit.status,
        unit.selection,
        unit.rationale,
        unit.verification.join("; "),
      ]),
    ),
    "",
  );
  const applicability = manifest.units.flatMap((unit) => unit.applicability.map((claim) => `${unit.id}: ${claim}`));
  if (applicability.length) lines.push("### Applicability claims to verify against a primary source", "", ...bullets(applicability), "");
  lines.push("## Existing owners", "");
  lines.push(
    ...table(
      ["id", "path", "match"],
      manifest.existingOwners.map((owner) => [owner.id, owner.path, owner.match]),
    ),
    "",
  );
  lines.push("## Batch overlap", "");
  lines.push(
    ...table(
      ["topic", "sources"],
      manifest.batchOverlap.map((overlap) => [overlap.topic, overlap.sourceIds.join(", ")]),
    ),
    "",
  );
  lines.push("## Kept, changed, omitted, deferred", "");
  for (const unit of manifest.units) {
    lines.push(`### ${unit.id}`, "");
    lines.push(`- Kept: ${unit.kept.length ? unit.kept.map(cell).join("; ") : "none"}`);
    lines.push(`- Changed: ${unit.changed.length ? unit.changed.map(cell).join("; ") : "none"}`);
    lines.push(`- Omitted: ${unit.omitted.length ? unit.omitted.map(cell).join("; ") : "none"}`);
    lines.push(`- Deferred: ${unit.deferred.length ? unit.deferred.map(cell).join("; ") : "none"}`, "");
  }
  const conflicts = manifest.units.flatMap((unit) => unit.conflicts.map((conflict) => `${unit.id} with ${conflict.with}: ${conflict.resolution}`));
  lines.push("## Conflicts", "", ...bullets(conflicts), "");
  if (manifest.derivations.length) {
    lines.push("## Derivations", "");
    lines.push(
      ...table(
        ["target", "sources", "relationship", "notice", "reviewer", "reviewed"],
        manifest.derivations.map((derivation) => [
          derivation.target,
          derivation.sourceIds.join(", "),
          derivation.relationship,
          derivation.notice ?? "",
          derivation.reviewer,
          derivation.reviewedAt,
        ]),
      ),
      "",
    );
  }
  if (manifest.notices.length) {
    lines.push("## Notices", "");
    lines.push(
      ...table(
        ["source", "license", "copyright", "notice path", "covers"],
        manifest.notices.map((notice) => [notice.sourceId, notice.spdx, notice.copyright, notice.noticePath, notice.covers.join(", ")]),
      ),
      "",
    );
  }
  if (manifest.evaluations.length) {
    lines.push("## Evaluations", "");
    lines.push(
      ...table(
        ["case", "unit", "kind", "description"],
        manifest.evaluations.map((item) => [item.id, item.unitId, item.kind, item.description]),
      ),
      "",
    );
  }
  lines.push("## Uncertainties", "", ...bullets(manifest.uncertainties), "");
  lines.push("## Missing core mechanism", "");
  lines.push(manifest.missingCoreMechanism.present ? `Present: ${manifest.missingCoreMechanism.description ?? "(no description)"}` : "None identified.", "");
  lines.push("## Required checks", "", ...bullets(manifest.requiredChecks), "");
  lines.push("## Affected outputs", "", ...bullets(manifest.affectedOutputs), "");
  return `${lines.join("\n").trimEnd()}\n`;
}
