import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { INVENTORY_ROLES, type SourceDirective, type SourceKind, type SourceRecord, type SourceRights } from "../../contracts/contribution/contract.js";
import { readSourceText, sourceHttpFailure, sourceReportUrl } from "../../tooling/lib/source-http.js";
import { markdownHeadings, sha256, slugify, truncate } from "./manifest-io.js";
import { classifyLicenseText, looksLikeSetupScript, readmeLicenseClaim, scanDirectives, stripHiddenMarkers } from "./untrusted.js";

/**
 * Source intake: read-only inspection of one explicitly named source. A local path is walked
 * without following symlinks outside it; a URL is fetched through the bounded source reader with
 * a per-source request budget. Nothing here executes package code, install hooks, generators,
 * screenshot scripts, or provider setup. Fetched and inspected content is untrusted reference data.
 */
export type InventoryRole = (typeof INVENTORY_ROLES)[number];

export interface IntakeFile {
  readonly relativePath: string;
  readonly role: InventoryRole;
  readonly bytes: number;
  readonly sha256?: string;
  readonly text?: string;
}

export interface SourceIntake {
  readonly record: SourceRecord;
  readonly files: IntakeFile[];
  readonly headings: string[];
  readonly basenames: string[];
  /** README, SKILL, documentation, or page text joined for method and claim detection (capped). */
  readonly proseText: string;
  readonly sourceTrees: string[];
  readonly hasManifest: boolean;
  readonly hasLockfile: boolean;
  readonly requiresAgentConfiguration: boolean;
  readonly installHooks: string[];
}

export interface IntakeOptions {
  readonly goal: string;
  readonly now: () => Date;
  readonly network: boolean;
  readonly fetchText?: (url: string) => Promise<{ text: string; httpStatus: 200 }>;
}

const MAX_FILES = 400;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_HASH_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_PROSE_CHARS = 200_000;
const MAX_REQUESTS_PER_SOURCE = 12;
const words = (list: string): Set<string> => new Set(list.split(" "));
const SKIP_DIRECTORIES = words(
  "node_modules .git build dist out .next DerivedData Pods .build target coverage __pycache__ .venv venv .gradle .idea .turbo .cache",
);
const TEXT_ROLES = new Set<InventoryRole>(["license", "readme", "agent-instructions", "skill", "setup-script", "hook", "documentation", "manifest"]);
const SOURCE_EXTENSIONS = words(
  ".ts .tsx .js .mjs .cjs .jsx .swift .kt .kts .java .py .rb .go .rs .dart .m .mm .h .c .cpp .cs .php .scala .vue .svelte .css .scss .html .sql",
);
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".heic", ".ico", ".bmp", ".tiff"]);
const BINARY_EXTENSIONS = words(".zip .tar .gz .tgz .dmg .pkg .exe .dll .so .dylib .a .bin .jar .apk .ipa .wasm .pdf .mp4 .mov");
const MANIFEST_NAMES = words("package.json Package.swift pyproject.toml Cargo.toml pubspec.yaml Gemfile go.mod build.gradle build.gradle.kts Podfile setup.py");
const LOCKFILE_NAMES = words(
  "package-lock.json yarn.lock pnpm-lock.yaml bun.lockb bun.lock Package.resolved poetry.lock uv.lock Cargo.lock Gemfile.lock pubspec.lock go.sum Podfile.lock",
);

export function classifyRole(relativePath: string, text?: string): InventoryRole {
  const segments = relativePath.split("/");
  const name = segments[segments.length - 1] ?? relativePath;
  const lowerName = name.toLowerCase();
  const ext = path.extname(lowerName);
  const directories = segments.slice(0, -1).map((segment) => segment.toLowerCase());
  const joined = `/${directories.join("/")}/`;
  if (/^(licen[cs]e|copying|unlicense)(\.(md|txt|rst))?$/u.test(lowerName)) return "license";
  if (joined.includes("/.husky/") || joined.includes("/.claude/hooks/") || joined.includes("/.githooks/") || joined.includes("/.git/hooks/")) return "hook";
  if (lowerName === "skill.md") return "skill";
  if (lowerName === "agents.md" || lowerName === "claude.md" || lowerName === ".cursorrules" || lowerName === "gemini.md") return "agent-instructions";
  if (/^readme(\..+)?$/u.test(lowerName)) return "readme";
  if (lowerName === "setup.sh" || lowerName === "install.sh" || lowerName === "bootstrap.sh") return "setup-script";
  if (ext === ".sh" && text !== undefined && looksLikeSetupScript(text)) return "setup-script";
  if (lowerName === "package.json" && text !== undefined && /"(?:pre|post)install"\s*:/u.test(text)) return "setup-script";
  if (LOCKFILE_NAMES.has(name)) return "lockfile";
  if (MANIFEST_NAMES.has(name) || lowerName.endsWith(".podspec") || lowerName === "project.pbxproj") return "manifest";
  if (/screenshot|capture/u.test(lowerName) || directories.some((segment) => /screenshots?|captures?/u.test(segment))) return "screenshot";
  if (FONT_EXTENSIONS.has(ext)) return "font";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (
    directories.some((segment) => /^(tests?|__tests__|spec|specs)$/u.test(segment)) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/u.test(lowerName) ||
    /tests?\.swift$/u.test(lowerName)
  )
    return "test";
  if (
    [".hbs", ".mustache", ".ejs", ".tmpl", ".template"].includes(ext) ||
    directories.some((segment) => /^templates?$/u.test(segment)) ||
    lowerName.endsWith(".xctemplate")
  )
    return "template";
  if (SOURCE_EXTENSIONS.has(ext) || ext === ".sh") return "source-code";
  if ([".md", ".mdx", ".txt", ".rst", ".adoc"].includes(ext) || directories.some((segment) => /^docs?$/u.test(segment))) return "documentation";
  if (BINARY_EXTENSIONS.has(ext)) return "binary";
  return "other";
}

interface WalkResult {
  readonly files: IntakeFile[];
  readonly truncated: string[];
  readonly skipped: string[];
}

function walkSource(root: string): WalkResult {
  const files: IntakeFile[] = [];
  const truncated: string[] = [];
  const skipped: string[] = [];
  const realRoot = realpathSync(root);
  const visited = new Set<string>([realRoot]);
  let totalBytes = 0;
  const inside = (candidate: string): boolean => {
    const relative = path.relative(realRoot, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  };
  const visit = (directory: string, prefix: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated.push(`file limit ${MAX_FILES} reached`);
        return;
      }
      const absolute = path.join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      let stats;
      try {
        stats = lstatSync(absolute);
      } catch {
        continue;
      }
      let target = absolute;
      if (stats.isSymbolicLink()) {
        try {
          target = realpathSync(absolute);
        } catch {
          skipped.push(`${relativePath}: dangling symlink`);
          continue;
        }
        if (!inside(target)) {
          skipped.push(`${relativePath}: symlink outside the source root`);
          continue;
        }
        stats = statSync(target);
      }
      if (stats.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (visited.has(target)) continue;
        visited.add(target);
        visit(target, relativePath);
        continue;
      }
      if (!stats.isFile()) continue;
      if (totalBytes + stats.size > MAX_TOTAL_BYTES) {
        truncated.push(`byte limit ${MAX_TOTAL_BYTES} reached at ${relativePath}`);
        return;
      }
      totalBytes += stats.size;
      const ext = path.extname(entry.name).toLowerCase();
      const probe = stats.size <= MAX_TEXT_BYTES && (TEXT_ROLES.has(classifyRole(relativePath)) || ext === ".sh" || entry.name === "package.json");
      let buffer: Buffer | undefined;
      if (stats.size <= MAX_HASH_BYTES) buffer = readFileSync(target);
      const text = probe && buffer && !buffer.subarray(0, 4096).includes(0) ? buffer.toString("utf8") : undefined;
      const role = classifyRole(relativePath, text);
      files.push({
        relativePath,
        role,
        bytes: stats.size,
        ...(buffer ? { sha256: sha256(buffer) } : {}),
        ...(text !== undefined && TEXT_ROLES.has(role) ? { text } : {}),
      });
    }
  };
  visit(realRoot, "");
  return { files, truncated, skipped };
}

function fingerprint(files: readonly IntakeFile[]): string {
  const lines = files.map((file) => `${file.relativePath}\t${file.sha256 ?? file.bytes}`).sort();
  return `sha256:${sha256(lines.join("\n"))}`;
}

function directoryOf(relativePath: string): string {
  const index = relativePath.lastIndexOf("/");
  return index === -1 ? "" : relativePath.slice(0, index);
}

function coveredByOwnLicense(relativePath: string, licenseDirectories: readonly string[]): boolean {
  const directory = directoryOf(relativePath);
  return licenseDirectories.some((candidate) => candidate !== "" && (directory === candidate || directory.startsWith(`${candidate}/`)));
}

interface RightsAssessment {
  readonly rights: SourceRights;
  readonly publisher?: string;
  readonly unknowns: string[];
}

function assessRights(files: readonly IntakeFile[], readme: IntakeFile | undefined, revision: string): RightsAssessment {
  const licenses = files.filter((file) => file.role === "license" && file.text !== undefined);
  const root = licenses.find((file) => !file.relativePath.includes("/"));
  const nested = licenses.filter((file) => file.relativePath.includes("/"));
  const licenseDirectories = licenses.map((file) => directoryOf(file.relativePath));
  const unknowns: string[] = [];
  for (const file of files) {
    if (file.role === "font" && !coveredByOwnLicense(file.relativePath, licenseDirectories))
      unknowns.push(truncate(`${file.relativePath}: font without a license of its own`, 400));
    if ((file.role === "image" || file.role === "screenshot") && !root && !coveredByOwnLicense(file.relativePath, licenseDirectories))
      unknowns.push(truncate(`${file.relativePath}: image without a license`, 400));
  }
  const nestedNote = nested.length
    ? `; subdirectory licenses: ${nested.map((file) => `${file.relativePath} (${classifyLicenseText(file.text!).spdx ?? "unclassified"})`).join(", ")}`
    : "";
  if (root) {
    const classified = classifyLicenseText(root.text!);
    const notes = [
      classified.copyrightLine ? `Copyright line as written: ${classified.copyrightLine}` : "No copyright line found in the license text.",
      `License text read at revision ${revision}.`,
    ];
    if (!classified.spdx) notes.push("License text present but not recognized; classify it by hand before adapting or copying.");
    return {
      rights: {
        status: classified.spdx ? "verified" : "unverified",
        ...(classified.spdx ? { spdx: classified.spdx } : {}),
        evidence: root.relativePath,
        ...(root.sha256 ? { evidenceSha256: root.sha256 } : {}),
        scope: truncate(`root ${root.relativePath}${nestedNote}${unknowns.length ? "; fonts and images listed in unknowns are excluded" : ""}`, 400),
        notes: truncate(notes.join(" "), 2000),
      },
      publisher: classified.holder ? truncate(classified.holder, 400) : undefined,
      unknowns,
    };
  }
  if (nested.length) {
    return {
      rights: {
        status: "unknown",
        scope: truncate(`no root license${nestedNote}`, 400),
        notes: "Only subdirectories carry a license. The root material has no license text.",
      },
      unknowns,
    };
  }
  const claim = readme?.text ? readmeLicenseClaim(readme.text) : undefined;
  if (claim) {
    return {
      rights: {
        status: "unverified",
        spdx: truncate(claim, 400),
        evidence: truncate(`${readme!.relativePath} names ${claim} without license text`, 400),
        notes: "A README sentence or badge is a claim, not evidence. Read the license text at the reviewed revision before adapting or copying.",
      },
      unknowns,
    };
  }
  return { rights: { status: "unknown", notes: "No license file or README license claim found." }, unknowns };
}

function firstHeading(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return markdownHeadings(stripHiddenMarkers(text))[0];
}

const PROSE_ROLES = new Set<InventoryRole>(["readme", "skill", "documentation", "agent-instructions"]);

function proseOf(files: readonly IntakeFile[]): { prose: string; headings: string[] } {
  const parts: string[] = [];
  const headings: string[] = [];
  let size = 0;
  for (const file of files) {
    if (!file.text || !PROSE_ROLES.has(file.role)) continue;
    const text = stripHiddenMarkers(file.text);
    headings.push(...markdownHeadings(text));
    if (size >= MAX_PROSE_CHARS) continue;
    parts.push(text.slice(0, MAX_PROSE_CHARS - size));
    size += text.length;
  }
  return { prose: parts.join("\n\n"), headings };
}

/** Every file whose text enters `proseOf`, plus the scripts and hooks that never enter prose. */
const DIRECTIVE_ROLES = new Set<InventoryRole>(["readme", "skill", "documentation", "agent-instructions", "setup-script", "hook"]);

function directivesOf(files: readonly IntakeFile[]): SourceDirective[] {
  return files.filter((file) => file.text !== undefined && DIRECTIVE_ROLES.has(file.role)).flatMap((file) => scanDirectives(file.text!, file.relativePath));
}

function sourceTreesOf(files: readonly IntakeFile[]): string[] {
  const trees = new Set<string>();
  for (const file of files) {
    if (file.role !== "source-code") continue;
    const top = file.relativePath.includes("/") ? file.relativePath.split("/")[0]! : ".";
    trees.add(top);
  }
  return [...trees].sort();
}

function localKind(files: readonly IntakeFile[], isDirectory: boolean, root: string): SourceKind {
  if (!isDirectory) return "post";
  if (files.some((file) => file.role === "skill" && !file.relativePath.includes("/"))) return "skill";
  if (existsSync(path.join(root, ".git"))) return "repository";
  if (files.some((file) => file.role === "manifest")) return "local-package";
  const screenshots = files.filter((file) => file.role === "screenshot").length;
  if (screenshots && screenshots * 2 >= files.length) return "showcase";
  return "other";
}

export function intakeLocalPath(sourcePath: string, index: number, options: IntakeOptions): SourceIntake {
  if (!existsSync(sourcePath)) throw new Error(`source.unavailable: ${sourcePath} does not exist.`);
  const stats = statSync(sourcePath);
  const isDirectory = stats.isDirectory();
  let files: IntakeFile[];
  let truncated: string[] = [];
  let skipped: string[] = [];
  if (isDirectory) {
    const walked = walkSource(sourcePath);
    files = walked.files;
    truncated = walked.truncated;
    skipped = walked.skipped;
  } else {
    const buffer = readFileSync(sourcePath);
    const name = path.basename(sourcePath);
    const role = classifyRole(name, buffer.includes(0) ? undefined : buffer.toString("utf8"));
    const textRole = role === "other" && !buffer.includes(0) ? "documentation" : role;
    files = [
      {
        relativePath: name,
        role: textRole,
        bytes: buffer.byteLength,
        sha256: sha256(buffer),
        ...(buffer.includes(0) ? {} : { text: buffer.toString("utf8") }),
      },
    ];
  }
  // A single file is fingerprinted by its own bytes; a tree by its sorted inventory of digests.
  const revision = !isDirectory && files[0]?.sha256 ? `sha256:${files[0].sha256}` : fingerprint(files);
  const readme = files.find((file) => file.role === "readme" && !file.relativePath.includes("/")) ?? files.find((file) => file.role === "readme");
  const skill = files.find((file) => file.role === "skill");
  const rights = assessRights(files, readme, revision);
  const { prose, headings } = proseOf(files);
  const directives = directivesOf(files);
  const baseName = path.basename(sourcePath).replace(/\.[^.]+$/u, "");
  const title = firstHeading(readme?.text) ?? firstHeading(skill?.text) ?? firstHeading(files[0]?.text) ?? baseName;
  const kind = localKind(files, isDirectory, sourcePath);
  const notes = [...truncated, ...skipped];
  const selectors = files
    .filter((file) => ["readme", "skill", "documentation"].includes(file.role))
    .map((file) => file.relativePath)
    .concat(sourceTreesOf(files).map((tree) => (tree === "." ? "./" : `${tree}/`)))
    .slice(0, 20);
  const installHooks = files.filter((file) => file.role === "setup-script" || file.role === "hook").map((file) => file.relativePath);
  const record: SourceRecord = {
    id: `${slugify(baseName, 60)}-${index + 1}`,
    kind,
    title: truncate(title, 400),
    localPath: sourcePath.length > 400 ? sourcePath.slice(0, 400) : sourcePath,
    ...(rights.publisher ? { publisher: rights.publisher } : {}),
    retrievedAt: options.now().toISOString(),
    revision,
    retrieval: {
      status: truncated.length ? "excerpt" : "complete",
      method: isDirectory ? "local-walk" : "local-file",
      ...(notes.length ? { notes: truncate(notes.join("; "), 2000) } : {}),
    },
    rights: rights.rights,
    selectors: selectors.map((selector) => truncate(selector, 400)),
    directives,
    inventory: files.map((file) => ({
      path: truncate(file.relativePath, 400),
      role: file.role,
      bytes: file.bytes,
      ...(file.sha256 ? { sha256: file.sha256 } : {}),
    })),
    unknowns: rights.unknowns,
  };
  return {
    record,
    files,
    headings,
    basenames: [...new Set(files.map((file) => path.basename(file.relativePath)))],
    proseText: prose,
    sourceTrees: sourceTreesOf(files),
    hasManifest: files.some((file) => file.role === "manifest" || (file.role === "setup-script" && file.relativePath.endsWith("package.json"))),
    hasLockfile: files.some((file) => file.role === "lockfile"),
    requiresAgentConfiguration: directives.some((directive) => directive.category === "configure-agent") || installHooks.length > 0,
    installHooks,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* URL intake                                                                                   */
/* ------------------------------------------------------------------------------------------ */

type Fetched = { ok: true; text: string } | { ok: false; reason: string };

class RequestBudget {
  private used = 0;
  constructor(private readonly fetchText: (url: string) => Promise<{ text: string; httpStatus: 200 }>) {}
  get requests(): number {
    return this.used;
  }
  async get(url: string): Promise<Fetched> {
    if (this.used >= MAX_REQUESTS_PER_SOURCE) return { ok: false, reason: `request budget of ${MAX_REQUESTS_PER_SOURCE} per source exhausted` };
    this.used += 1;
    try {
      const response = await this.fetchText(url);
      return { ok: true, text: response.text };
    } catch (error) {
      return { ok: false, reason: sourceHttpFailure(error) };
    }
  }
}

function jsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const str = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

async function intakeGitHub(
  url: string,
  owner: string,
  repo: string,
  subpath: string | undefined,
  index: number,
  options: IntakeOptions,
): Promise<SourceIntake> {
  const budget = new RequestBudget(options.fetchText ?? readSourceText);
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const repoResponse = await budget.get(api);
  const meta = repoResponse.ok ? jsonRecord(repoResponse.text) : undefined;
  const branch = str(meta?.default_branch) ?? "main";
  const release = await budget.get(`${api}/releases/latest`);
  const releaseMeta = release.ok ? jsonRecord(release.text) : undefined;
  const commit = await budget.get(`${api}/commits/${branch}`);
  const commitSha = commit.ok ? str(jsonRecord(commit.text)?.sha) : undefined;
  const files: IntakeFile[] = [];
  const absent: string[] = [];
  for (const name of ["README.md", "LICENSE", "LICENSE.md", "SKILL.md", "AGENTS.md", "CLAUDE.md"]) {
    const fetched = await budget.get(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`);
    if (!fetched.ok) {
      absent.push(name);
      continue;
    }
    files.push({
      relativePath: name,
      role: classifyRole(name, fetched.text),
      bytes: Buffer.byteLength(fetched.text, "utf8"),
      sha256: sha256(fetched.text),
      text: fetched.text,
    });
  }
  const revision = commitSha ? `${branch}@${commitSha}` : "unknown";
  const readme = files.find((file) => file.role === "readme");
  const rights = assessRights(files, readme, revision);
  const apiLicense = str((meta?.license as Record<string, unknown> | undefined)?.spdx_id);
  const rightsRecord: SourceRights =
    rights.rights.status === "unknown" && apiLicense && apiLicense !== "NOASSERTION"
      ? {
          status: "unverified",
          spdx: apiLicense,
          evidence: "GitHub API license key only; no license text was read",
          notes: "Read the license text at the reviewed revision before adapting or copying.",
        }
      : rights.rights;
  const { prose, headings } = proseOf(files);
  const directives = directivesOf(files);
  const notes: string[] = [];
  if (!repoResponse.ok) notes.push(`repository metadata: ${repoResponse.reason}`);
  if (!release.ok) notes.push("no published release (releases/latest was not 200)");
  if (!commit.ok) notes.push(`branch head: ${commit.reason}`);
  if (absent.length) notes.push(`absent: ${absent.join(", ")}`);
  if (meta?.archived === true) notes.push("repository is archived");
  const ownerLogin = str((meta?.owner as Record<string, unknown> | undefined)?.login) ?? owner;
  const record: SourceRecord = {
    id: `${slugify(`${owner}-${repo}`, 60)}-${index + 1}`,
    kind: files.some((file) => file.role === "skill") ? "skill" : "repository",
    title: truncate(str(meta?.full_name) ?? `${owner}/${repo}`, 400),
    canonicalUrl: sourceReportUrl(url),
    publisher: truncate(rights.publisher ?? ownerLogin, 400),
    ...(str(meta?.pushed_at)
      ? { publishedAt: truncate(`pushed ${str(meta?.pushed_at)}${releaseMeta ? `; latest release ${str(releaseMeta.tag_name) ?? "unknown"}` : ""}`, 400) }
      : {}),
    retrievedAt: options.now().toISOString(),
    revision,
    retrieval: {
      status: !repoResponse.ok && !readme ? "inaccessible" : readme ? "complete" : "excerpt",
      method: `github-api (${budget.requests} requests)`,
      ...(notes.length ? { notes: truncate(notes.join("; "), 2000) } : {}),
    },
    rights: rightsRecord,
    selectors: [...(subpath ? [truncate(subpath, 400)] : []), ...files.map((file) => file.relativePath)],
    directives,
    inventory: files.map((file) => ({ path: file.relativePath, role: file.role, bytes: file.bytes, ...(file.sha256 ? { sha256: file.sha256 } : {}) })),
    unknowns: [...rights.unknowns, ...(commitSha ? [] : ["branch head commit could not be read; revision is unknown"])],
  };
  return {
    record,
    files,
    headings,
    basenames: files.map((file) => file.relativePath),
    proseText: prose,
    sourceTrees: [],
    hasManifest: false,
    hasLockfile: false,
    requiresAgentConfiguration: directives.some((directive) => directive.category === "configure-agent"),
    installHooks: [],
  };
}

function htmlToText(html: string): { title?: string; text: string; headings: string[] } {
  const title = /<title[^>]*>([^<]*)<\/title>/iu.exec(html)?.[1]?.trim();
  const headings = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/giu)]
    .map((match) =>
      match[1]!
        .replace(/<[^>]+>/gu, "")
        .replace(/\s+/gu, " ")
        .trim(),
    )
    .filter(Boolean);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<\/(?:p|div|h[1-6]|li|br|tr|section|article)>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/[ \t]+/gu, " ");
  return { title: title || undefined, text, headings };
}

async function intakePage(url: string, index: number, options: IntakeOptions): Promise<SourceIntake> {
  const budget = new RequestBudget(options.fetchText ?? readSourceText);
  const fetched = await budget.get(url);
  const parsed = new URL(url);
  const looksLikePost = /blog|\/posts?\/|medium\.com|substack\.com|dev\.to|\/p\/|\/@/iu.test(url) || /\bpost\b/iu.test(options.goal);
  const isHtml = fetched.ok && /<(?:!doctype|html|body|h1)\b/iu.test(fetched.text.slice(0, 4000));
  const page = fetched.ok
    ? isHtml
      ? htmlToText(fetched.text)
      : { title: firstHeading(fetched.text), text: fetched.text, headings: markdownHeadings(fetched.text) }
    : undefined;
  const text = page ? stripHiddenMarkers(page.text) : "";
  const directives = fetched.ok ? scanDirectives(text, parsed.pathname || "/") : [];
  const claim = text ? readmeLicenseClaim(text) : undefined;
  const record: SourceRecord = {
    id: `${slugify(`${parsed.hostname}-${parsed.pathname.split("/").filter(Boolean).slice(-1)[0] ?? "page"}`, 60)}-${index + 1}`,
    kind: looksLikePost ? "post" : "article",
    title: truncate(page?.title ?? page?.headings[0] ?? url, 400),
    canonicalUrl: sourceReportUrl(url),
    publisher: parsed.hostname,
    retrievedAt: options.now().toISOString(),
    revision: fetched.ok ? `sha256:${sha256(fetched.text)}` : "unknown",
    retrieval: fetched.ok
      ? { status: "complete", method: "https-get" }
      : { status: "inaccessible", method: "https-get", notes: truncate(fetched.reason, 2000) },
    rights: claim
      ? {
          status: "unverified",
          spdx: truncate(claim, 400),
          evidence: "page text names a license without license text",
          notes: "A sentence is a claim, not evidence.",
        }
      : {
          status: "unknown",
          notes: fetched.ok
            ? "No license statement found on the page. Published text stays the author's; reference and adapt need the author's terms."
            : "Page not read.",
        },
    selectors: [],
    directives,
    inventory: fetched.ok
      ? [{ path: parsed.pathname || "/", role: "documentation", bytes: Buffer.byteLength(fetched.text, "utf8"), sha256: sha256(fetched.text) }]
      : [],
    unknowns: fetched.ok ? [] : [truncate(`page inaccessible: ${fetched.reason}`, 400)],
  };
  return {
    record,
    files: fetched.ok ? [{ relativePath: parsed.pathname || "/", role: "documentation", bytes: Buffer.byteLength(fetched.text, "utf8"), text }] : [],
    headings: page?.headings ?? [],
    basenames: [],
    proseText: text.slice(0, MAX_PROSE_CHARS),
    sourceTrees: [],
    hasManifest: false,
    hasLockfile: false,
    requiresAgentConfiguration: directives.some((directive) => directive.category === "configure-agent"),
    installHooks: [],
  };
}

export async function intakeUrl(url: string, index: number, options: IntakeOptions): Promise<SourceIntake> {
  if (!options.network)
    throw new Error(`intake.network_disabled: ${sourceReportUrl(url)} needs --network; URL sources are fetched only when the caller allows it.`);
  const github = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/[^/]+\/(.+?))?\/?(?:[?#].*)?$/u.exec(url);
  if (github?.[1] && github[2]) return intakeGitHub(url, github[1], github[2], github[3], index, options);
  return intakePage(url, index, options);
}
