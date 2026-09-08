import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Resource } from "../../contracts/extensions/contract.js";
import { readPackageResourceFile, readSnapshotResource, verifySnapshot, type PackageDependency } from "./resources.js";

/**
 * Third-party notices travel with copied material (ADR-0005, ARCH-06).
 *
 * A package that incorporates someone else's work declares `thirdParty` entries in
 * `extension.yaml`. Each entry names a `notice` resource that holds the verbatim license and
 * copyright text, and lists the package resources the notice covers. This module reads those
 * entries from verified snapshots, answers which notices a set of resources needs, and renders
 * them into a generated output directory.
 *
 * Rules
 * - Notice bytes come from the pinned snapshot, never from a caller-supplied path. A notice whose
 *   bytes no longer match the snapshot digest fails with `notices.notice_resource_changed:<id>`.
 * - The extension contract has no per-resource rights field. Fonts are the canonical asset whose
 *   redistribution rights stay unknown unless a notice covers them. `assertRedistributable`
 *   therefore refuses an `asset` resource whose media type starts with `font/` or equals
 *   `application/font-sfnt` when no third-party entry covers it (`notices.rights_unknown:<id>`).
 *   Other uncovered assets pass. The rule is deliberately narrow, declared here, and never
 *   inferred from file names.
 * - A resource a manifest marks as covered whose notice carries no text is refused with
 *   `notices.uncovered_third_party_resource:<id>`. This duplicates the contract validator on
 *   purpose: the rendered output is the last place a missing notice can be caught.
 * - Rendering keeps the original author's identity. Project, upstream, license, copyright, and
 *   the notice text are reproduced as declared. Nothing here relabels copied material as ours.
 */
export interface ThirdPartyNoticeEntry {
  packageId: string;
  packageDigest: string;
  id: string;
  project: string;
  upstream: string;
  license: string;
  copyright: string;
  noticeText: string;
  noticeSha256: string;
  covers: string[];
  coveredPaths: string[];
}

export const OUTPUT_NOTICES_FILE = "THIRD_PARTY_NOTICES.md";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Media types the module treats as fonts. Parameters such as `;charset=` are ignored. */
export function isFontMediaType(mediaType: string): boolean {
  const type = (mediaType.split(";")[0] ?? "").trim().toLowerCase();
  return type.startsWith("font/") || type === "application/font-sfnt";
}

function resourceMap(dependency: PackageDependency): Map<string, Resource> {
  return new Map(dependency.snapshot.extension.resources.map((resource) => [resource.id, resource]));
}

/**
 * Read every third-party notice a set of verified package snapshots declares. Each package is
 * verified against its digest before any notice byte is trusted; the notice bytes are then read
 * through the snapshot reader so a changed file cannot slip in between verification and read.
 */
export function collectThirdPartyNotices(packages: readonly PackageDependency[]): ThirdPartyNoticeEntry[] {
  const entries: ThirdPartyNoticeEntry[] = [];
  for (const dependency of packages) {
    const { directory, snapshot } = dependency;
    const declared = snapshot.extension.thirdParty ?? [];
    if (!declared.length) continue;
    const resources = resourceMap(dependency);
    // Check the notice bytes against the pinned digest first, so a changed notice reports its own
    // code instead of the generic pin failure the full verification raises.
    for (const entry of declared) {
      const notice = resources.get(entry.notice);
      if (!notice || notice.kind !== "notice") throw new Error(`notices.notice_resource_missing:${entry.id}`);
      const expected = snapshot.files[notice.path];
      let actual: string | undefined;
      try {
        actual = sha256(readPackageResourceFile(directory, notice.path));
      } catch {
        actual = undefined;
      }
      if (!expected || actual !== expected) throw new Error(`notices.notice_resource_changed:${entry.id}`);
    }
    verifySnapshot(directory, snapshot);
    for (const entry of declared) {
      const notice = resources.get(entry.notice);
      if (!notice) throw new Error(`notices.notice_resource_missing:${entry.id}`);
      const bytes = readSnapshotResource(directory, snapshot, entry.notice);
      const digest = sha256(bytes);
      if (digest !== snapshot.files[notice.path]) throw new Error(`notices.notice_resource_changed:${entry.id}`);
      const coveredPaths = entry.covers.map((id) => {
        const covered = resources.get(id);
        if (!covered) throw new Error(`notices.covered_resource_missing:${id}`);
        return covered.path;
      });
      entries.push({
        packageId: snapshot.extension.id,
        packageDigest: snapshot.digest,
        id: entry.id,
        project: entry.project,
        upstream: entry.upstream,
        license: entry.license,
        copyright: entry.copyright,
        noticeText: bytes.toString("utf8"),
        noticeSha256: digest,
        covers: [...entry.covers],
        coveredPaths,
      });
    }
  }
  return entries;
}

/** The notices whose covered resources intersect the given resource ids. */
export function noticesForResources(packages: readonly PackageDependency[], resourceIds: readonly string[]): ThirdPartyNoticeEntry[] {
  const wanted = new Set(resourceIds);
  return collectThirdPartyNotices(packages).filter((entry) => entry.covers.some((id) => wanted.has(id)));
}

/**
 * Refuse to redistribute a resource whose rights are unknown. See the module header for the
 * font rule and the covered-without-notice rule. An id that no package exports is refused too:
 * nothing can vouch for bytes that are not in a verified snapshot.
 */
export function assertRedistributable(packages: readonly PackageDependency[], resourceIds: readonly string[]): void {
  const entries = collectThirdPartyNotices(packages);
  const noticed = new Set(entries.filter((entry) => entry.noticeText.trim().length > 0).flatMap((entry) => entry.covers));
  const declaredCovered = new Set(packages.flatMap((dependency) => (dependency.snapshot.extension.thirdParty ?? []).flatMap((entry) => entry.covers)));
  const resources = new Map<string, Resource>();
  for (const dependency of packages) {
    verifySnapshot(dependency.directory, dependency.snapshot);
    for (const [id, resource] of resourceMap(dependency)) {
      if (resources.has(id)) throw new Error(`notices.ambiguous_resource:${id}`);
      resources.set(id, resource);
    }
  }
  for (const id of resourceIds) {
    const resource = resources.get(id);
    if (!resource) throw new Error(`notices.unknown_resource:${id}`);
    if (declaredCovered.has(id)) {
      if (!noticed.has(id)) throw new Error(`notices.uncovered_third_party_resource:${id}`);
      continue;
    }
    if (resource.kind === "asset" && isFontMediaType(resource.mediaType)) throw new Error(`notices.rights_unknown:${id}`);
  }
}

function fenceFor(text: string): string {
  let longest = 0;
  for (const run of text.match(/`+/gu) ?? []) longest = Math.max(longest, run.length);
  return "`".repeat(Math.max(3, longest + 1));
}

/** A Markdown document with one section per notice. The notice text is reproduced verbatim. */
export function renderThirdPartyNotices(entries: readonly ThirdPartyNoticeEntry[]): string {
  const lines: string[] = ["# Third-party notices", ""];
  if (!entries.length) {
    lines.push("This output incorporates no third-party material that requires a notice.", "");
    return lines.join("\n");
  }
  lines.push(
    "This output incorporates material from the projects below. Each notice is reproduced verbatim from the package that carried it. The original author's identity and license are unchanged.",
    "",
  );
  for (const entry of entries) {
    const fence = fenceFor(entry.noticeText);
    lines.push(
      `## ${entry.project}`,
      "",
      `- Project: ${entry.project}`,
      `- Upstream: ${entry.upstream}`,
      `- License: ${entry.license}`,
      `- Copyright: ${entry.copyright}`,
      `- Package: ${entry.packageId} (${entry.packageDigest})`,
      `- Notice: ${entry.id} (sha256:${entry.noticeSha256})`,
      "- Covered paths:",
      ...entry.coveredPaths.map((covered) => `  - ${covered}`),
      "",
      `${fence}text`,
      entry.noticeText.replace(/\n$/u, ""),
      fence,
      "",
    );
  }
  return lines.join("\n");
}

/**
 * Write `THIRD_PARTY_NOTICES.md` into an existing absolute output directory. Returns the written
 * path, or null when there is nothing to write. The file name is fixed and the directory is
 * resolved to its real location, so the write can never land outside `outputDir`.
 */
export function writeOutputNotices(outputDir: string, entries: readonly ThirdPartyNoticeEntry[]): string | null {
  if (!entries.length) return null;
  if (typeof outputDir !== "string" || !path.isAbsolute(outputDir)) throw new Error("notices.output_dir_not_absolute");
  let real: string;
  try {
    if (!statSync(outputDir).isDirectory()) throw new Error("notices.output_dir_missing");
    real = realpathSync(outputDir);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("notices.")) throw error;
    throw new Error("notices.output_dir_missing");
  }
  const target = path.join(real, OUTPUT_NOTICES_FILE);
  let existing: ReturnType<typeof lstatSync> | undefined;
  try {
    existing = lstatSync(target);
  } catch {
    existing = undefined;
  }
  if (existing && !existing.isFile()) throw new Error("notices.output_path_not_a_file");
  if (existing && existing.nlink !== 1) throw new Error("notices.output_path_hardlinked");
  // Never truncate until the opened inode is known to be an unshared regular file.
  const descriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o644);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || (existing && (opened.dev !== existing.dev || opened.ino !== existing.ino)))
      throw new Error("notices.output_path_changed_or_hardlinked");
    ftruncateSync(descriptor, 0);
    writeFileSync(descriptor, renderThirdPartyNotices(entries), "utf8");
  } finally {
    closeSync(descriptor);
  }
  return target;
}
