import { createHash } from "node:crypto";

/**
 * Bounded GitHub metadata reads for the upstream check. Four documents per upstream, nothing
 * else: the repository record, the release list (one page), the default-branch head commit,
 * and the raw LICENSE text. Every read goes through the injected `fetchText`, so tests serve
 * recorded fixtures and the CLI uses the bounded HTTPS reader. The functions here parse data
 * and never execute, install, or follow anything the fetched content says.
 */
export type FetchText = (url: string) => Promise<{ text: string; httpStatus: 200 }>;

export interface GithubIdentity {
  readonly owner: string;
  readonly repo: string;
}

export interface GithubRepositoryMetadata {
  readonly archived: boolean | null;
  readonly defaultBranch: string | null;
  readonly licenseSpdx: string | null;
  readonly pushedAt: string | null;
}

export interface GithubReleaseAsset {
  readonly name: string;
  readonly sha256?: string;
  readonly bytes?: number;
}

export interface GithubRelease {
  readonly tag: string;
  readonly publishedAt: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly body: string;
  readonly url?: string;
  readonly assets: GithubReleaseAsset[];
}

export interface GithubBranchHead {
  readonly branch: string;
  readonly sha: string;
  readonly committedAt: string;
}

export interface GithubUpstreamRead {
  readonly repository: GithubRepositoryMetadata | null;
  /** Every fetched release with a tag and a publication time, newest first. */
  readonly releases: GithubRelease[];
  readonly latestStable: GithubRelease | null;
  readonly prereleases: Array<{ readonly tag: string; readonly publishedAt: string }>;
  readonly branchHead: GithubBranchHead | null;
  readonly licenseSha256: string | null;
  readonly requests: number;
  readonly unknowns: string[];
}

export const RELEASE_PAGE_SIZE = 20;
export const RELEASE_SUMMARY_MAX_CHARS = 1500;

const SEGMENT = /^[A-Za-z0-9_.-]+$/u;

/** Owner and repository from a canonical github.com URL, or null for any other address. */
export function githubIdentity(canonicalUrl: string): GithubIdentity | null {
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
  const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/u, "");
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || owner === "." || owner === ".." || repo === "." || repo === "..") return null;
  return { owner, repo };
}

export function githubApiUrl(identity: GithubIdentity, suffix = ""): string {
  return `https://api.github.com/repos/${identity.owner}/${identity.repo}${suffix}`;
}

export function githubRawUrl(identity: GithubIdentity, branch: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${identity.owner}/${identity.repo}/${branch}/${filePath}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function timestamp(value: unknown): string | null {
  const raw = text(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}

export function parseRepositoryMetadata(json: string): GithubRepositoryMetadata {
  const parsed = record(JSON.parse(json) as unknown);
  if (!parsed) throw new Error("repository record is not an object");
  const license = record(parsed.license);
  return {
    archived: typeof parsed.archived === "boolean" ? parsed.archived : null,
    defaultBranch: text(parsed.default_branch),
    licenseSpdx: license ? text(license.spdx_id) : null,
    pushedAt: timestamp(parsed.pushed_at),
  };
}

function parseAsset(value: unknown): GithubReleaseAsset | null {
  const asset = record(value);
  const name = asset ? text(asset.name) : null;
  if (!asset || !name) return null;
  const digest = text(asset.digest);
  const sha256 = digest && /^sha256:[a-f0-9]{64}$/u.test(digest) ? digest.slice("sha256:".length) : undefined;
  const bytes = typeof asset.size === "number" && Number.isInteger(asset.size) && asset.size >= 0 ? asset.size : undefined;
  return { name, ...(sha256 ? { sha256 } : {}), ...(bytes !== undefined ? { bytes } : {}) };
}

/** Releases with a tag and a publication time, newest first. Drafts have no publication time and are dropped. */
export function parseReleases(json: string): GithubRelease[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error("release list is not an array");
  const releases: GithubRelease[] = [];
  for (const item of parsed) {
    const release = record(item);
    const tag = release ? text(release.tag_name) : null;
    const publishedAt = release ? timestamp(release.published_at) : null;
    if (!release || !tag || !publishedAt) continue;
    const url = text(release.html_url);
    releases.push({
      tag,
      publishedAt,
      draft: release.draft === true,
      prerelease: release.prerelease === true,
      body: typeof release.body === "string" ? release.body : "",
      ...(url ? { url } : {}),
      assets: Array.isArray(release.assets) ? release.assets.map(parseAsset).filter((asset): asset is GithubReleaseAsset => asset !== null) : [],
    });
  }
  return releases.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function parseBranchHead(json: string, branch: string): GithubBranchHead {
  const parsed = record(JSON.parse(json) as unknown);
  const sha = parsed ? text(parsed.sha) : null;
  const commit = parsed ? record(parsed.commit) : null;
  const committer = commit ? record(commit.committer) : null;
  const author = commit ? record(commit.author) : null;
  const committedAt = (committer ? timestamp(committer.date) : null) ?? (author ? timestamp(author.date) : null);
  if (!sha || !committedAt) throw new Error("commit record lacks a sha or a commit date");
  return { branch, sha, committedAt };
}

/**
 * One line per bullet or prose line of a release body, joined by "; ". Every URL becomes "[link]" and
 * "by @handle" attributions are removed, so a stored observation carries no address that the
 * source registry would have to track and no personal handle. The result is capped at whole
 * lines; a final "(N lines omitted from summary)" line names what was cut instead of hiding it.
 */
export function summarizeReleaseBody(body: string): string {
  const lines = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s|^```|^~~~/.test(line))
    .map((line) =>
      line
        .replace(/^(?:[-*+] |\d+[.)] )/u, "")
        .replace(/https?:\/\/[^\s)>\]]+/giu, "[link]")
        .replace(/\s+by\s+@[A-Za-z0-9_[\]-]+/gu, "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const next = length + (kept.length ? 2 : 0) + line.length;
    // Reserve room for the omission marker so the cap holds even when the last line is dropped.
    if (next > RELEASE_SUMMARY_MAX_CHARS - 40) break;
    kept.push(line);
    length = next;
  }
  const omitted = lines.length - kept.length;
  if (omitted > 0) kept.push(`(${omitted} lines omitted from summary)`);
  return kept.join("; ");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function attempt<T>(label: string, unknowns: string[], read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    unknowns.push(`${label} not observed: ${message.split("\n")[0]?.slice(0, 200) ?? "read failed"}`);
    return null;
  }
}

/**
 * Read the four metadata documents for one repository. A failed read is recorded as an
 * unknown and never treated as "no change"; a partial read is still a partial read.
 */
export async function readGithubUpstream(fetchText: FetchText, identity: GithubIdentity): Promise<GithubUpstreamRead> {
  const unknowns: string[] = [];
  let requests = 0;
  const read = async (url: string): Promise<string> => {
    requests += 1;
    return (await fetchText(url)).text;
  };
  const repository = await attempt("repository record", unknowns, async () => parseRepositoryMetadata(await read(githubApiUrl(identity))));
  const releases =
    (await attempt("release list", unknowns, async () => parseReleases(await read(githubApiUrl(identity, `/releases?per_page=${RELEASE_PAGE_SIZE}`))))) ?? [];
  const branch = repository?.defaultBranch ?? null;
  let branchHead: GithubBranchHead | null = null;
  let licenseSha256: string | null = null;
  if (branch) {
    branchHead = await attempt("branch head", unknowns, async () =>
      parseBranchHead(await read(githubApiUrl(identity, `/commits/${encodeURIComponent(branch)}`)), branch),
    );
    licenseSha256 = await attempt("LICENSE text", unknowns, async () => sha256Hex(await read(githubRawUrl(identity, branch, "LICENSE"))));
  } else {
    unknowns.push("default branch unknown; branch head and LICENSE were not read");
  }
  const stable = releases.filter((release) => !release.draft && !release.prerelease);
  return {
    repository,
    releases,
    latestStable: stable[0] ?? null,
    prereleases: releases.filter((release) => release.prerelease && !release.draft).map((release) => ({ tag: release.tag, publishedAt: release.publishedAt })),
    branchHead,
    licenseSha256,
    requests,
    unknowns,
  };
}
