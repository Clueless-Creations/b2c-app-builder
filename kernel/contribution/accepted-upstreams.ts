import { createHash } from "node:crypto";
import type { ContributionManifest } from "../../contracts/contribution/contract.js";
import { readPackageResourceFile } from "../composition/resources.js";
import { githubIdentity } from "./github-metadata.js";
import { loadUpstreams } from "./upstreams-load.js";
import type { CheckIssue } from "./types.js";

/** Promotion checks, not source discovery. Proposed work may retain explicit unknowns. */
export function checkAcceptedUpstreams(manifest: ContributionManifest, targetRoot: string, skillRoot: string): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const adopted = manifest.units.filter((unit) => unit.status === "accepted" && ["adapt", "reuse", "wrap", "vendor"].includes(unit.disposition));
  if (!adopted.length) return issues;
  const loaded = loadUpstreams(skillRoot);
  const upstreams = new Map(loaded.upstreams.map((entry) => [entry.manifest.id, entry]));
  for (const unit of adopted) {
    const source = manifest.sources.find((entry) => entry.id === unit.upstream?.sourceId);
    if (!source) continue; // The general checker reports unresolved sources.
    const fail = (code: string, message: string): void => {
      issues.push({ severity: "error", code: `contribution.${code}`, message, unitId: unit.id, sourceId: source.id });
    };
    const repository = source.canonicalUrl ? githubIdentity(source.canonicalUrl) : null;
    if (!repository) {
      if (source.kind === "repository" && !(manifest.synthetic && source.localPath && !source.canonicalUrl))
        fail("upstream_identity_mismatch", "Accepted repository sources need a canonical supported repository identity; missing URLs do not waive provenance.");
      continue; // Non-repository sources retain their own rights and provenance rules.
    }
    const upstream = source.upstreamId ? upstreams.get(source.upstreamId) : undefined;
    if (!upstream) {
      fail("upstream_required", "Accepting reusable repository material requires a catalog/upstreams identity.");
      continue;
    }
    const identity = githubIdentity(upstream.manifest.canonicalUrl);
    if (!identity || identity.owner.toLowerCase() !== repository.owner.toLowerCase() || identity.repo.toLowerCase() !== repository.repo.toLowerCase())
      fail("upstream_identity_mismatch", "The reviewed source and upstream record identify different repositories.");
    if (!source.registrySourceId || !upstream.manifest.sourceIds.includes(source.registrySourceId))
      fail("upstream_source_mapping_missing", "The source must reference a source-registry entry owned by this upstream.");
    const baselines = [upstream.manifest.baselines.reviewedSource, upstream.manifest.baselines.reviewedGuidance].filter(Boolean);
    if (!source.revision || !/^[a-f0-9]{40}$/.test(source.revision) || !baselines.some((baseline) => baseline?.revision === source.revision))
      fail(
        "upstream_baseline_mismatch",
        "Repository adoption requires an exact reviewed commit shared with the upstream record; tags and latest are not immutable evidence.",
      );
    if (!upstream.manifest.credits.acknowledge)
      fail("upstream_credit_missing", "An accepted reusable contribution requires accurate acknowledgment of the project powering it.");
    if (
      unit.disposition === "adapt" &&
      !manifest.derivations.some(
        (entry) => entry.sourceIds.includes(source.id) && [unit.target.id, unit.target.path].includes(entry.target) && entry.baseline === source.revision,
      )
    )
      fail("derivation_missing", "Accepted adapted guidance requires a source-to-target derivation at the reviewed baseline.");
    if (source.rights.status !== "verified" || upstream.manifest.license.status !== "verified")
      fail("upstream_rights_unverified", "Source and upstream rights must be verified before accepting reused material.");
    // Retained license notices are source-specific for every adopted license, not only MIT.
    if (upstream.manifest.license.noticeFile || upstream.manifest.license.spdx === "MIT") {
      const notice = manifest.notices.find(
        (entry) =>
          entry.sourceId === source.id &&
          entry.covers.some((covered) => [unit.id, unit.target.id, unit.target.path].some((target) => target === covered || target?.startsWith(`${covered}/`))),
      );
      if (!notice) {
        fail("notice_missing", "Accepted material with a retained license notice needs that source's notice covering its target.");
        continue;
      }
      try {
        const bytes = readPackageResourceFile(targetRoot, notice.noticePath);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (
          !upstream.notice ||
          digest !== upstream.notice.sha256 ||
          digest !== upstream.manifest.license.evidenceSha256 ||
          digest !== source.rights.evidenceSha256 ||
          notice.spdx !== upstream.manifest.license.spdx ||
          notice.copyright !== upstream.manifest.copyright
        )
          fail("notice_mismatch", "Retained notice bytes and attribution must match the reviewed source and upstream license evidence.");
      } catch {
        fail("notice_unreadable", "The covering notice must be a readable, package-relative regular file without symlink traversal.");
      }
    }
  }
  return issues;
}
