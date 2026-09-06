import { createHash } from "node:crypto";
import type { CatalogReference } from "../types.js";
import type { Resource, ThirdPartyNotice } from "../../contracts/extensions/contract.js";
import { readPackageResourceFile } from "../../kernel/composition/resources.js";
import { loadUpstreams } from "../../kernel/contribution/upstreams-load.js";

/** Authoring-time projection of existing provenance into the existing extension notice contract. */
export function firstpartyNotices(
  skillRoot: string,
  references: readonly CatalogReference[],
  resources: readonly Resource[],
): {
  notices: ThirdPartyNotice[];
  resources: Resource[];
  files: Record<string, Buffer>;
} {
  const loaded = loadUpstreams(skillRoot);
  const notices = new Map<string, ThirdPartyNotice>();
  const added = new Map<string, Resource>();
  const files: Record<string, Buffer> = {};
  for (const reference of references)
    for (const derivation of reference.derivations ?? []) {
      if (!["adapted", "copied"].includes(derivation.relationship)) continue;
      for (const sourceId of derivation.sourceIds) {
        const source = reference.sources.find((entry) => entry.id === sourceId);
        if (!source?.upstreamId) continue; // Legacy provenance is maintained by its current notice owner.
        const upstream = loaded.upstreams.find((entry) => entry.manifest.id === source.upstreamId)?.manifest;
        const noticePath = upstream?.license.noticeFile;
        if (
          !upstream ||
          upstream.license.status !== "verified" ||
          !noticePath ||
          !upstream.copyright ||
          (derivation.notice ?? source.rights?.evidence) !== noticePath
        )
          throw new Error(`firstparty.notice_provenance_missing:${reference.id}:${sourceId}`);
        const bytes = readPackageResourceFile(skillRoot, noticePath);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (!upstream.license.evidenceSha256 || digest !== upstream.license.evidenceSha256 || digest !== source.rights?.evidenceSha256)
          throw new Error(`firstparty.notice_digest_mismatch:${upstream.id}`);
        const covered = resources.find((resource) => resource.path === reference.path);
        if (!covered) throw new Error(`firstparty.notice_coverage_missing:${reference.id}`);
        const id = `b2c/notice-${upstream.id}`;
        const resourceId = `b2c/license-${upstream.id}`;
        const item = notices.get(id) ?? {
          id,
          project: upstream.project,
          upstream: upstream.canonicalUrl,
          license: upstream.license.spdx,
          copyright: upstream.copyright,
          notice: resourceId,
          covers: [],
        };
        if (!item.covers.includes(covered.id)) item.covers.push(covered.id);
        notices.set(id, item);
        added.set(resourceId, { id: resourceId, path: noticePath, kind: "notice", mediaType: "text/plain" });
        files[noticePath] = bytes;
      }
    }
  return { notices: [...notices.values()].sort((a, b) => a.id.localeCompare(b.id)), resources: [...added.values()], files };
}
