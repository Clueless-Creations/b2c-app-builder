#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { collectAllFiles, flagBoolean, flagNumber, flagString, isRecord, issue, parseFlags, reportAndExit } from "../../../tooling/lib/launch-state.js";
import { trustedSourceCheckTime } from "../../../tooling/lib/source-freshness-state.js";

type MutableRecord = Record<string, unknown>;

interface Args {
  root: string;
  registryPath: string;
  sinceDays: number;
  writeDiscovered: boolean;
}

interface DiscoveredUrl {
  url: string;
  locations: Set<string>;
  addedRecently: boolean;
}

const textExtensions = new Set([".md", ".markdown", ".yaml", ".yml", ".json", ".ts", ".tsx", ".js", ".mjs", ".html", ".txt"]);
const ignoredPathParts = new Set(["node_modules", ".git", "package-lock.json"]);
const ignoredHosts = new Set(["example.com", "localhost", "127.0.0.1"]);
// RFC 2606 / RFC 6761 reserved top-level domains: a host under one of these can never be a real
// source, only a stand-in in a test or a template (`.invalid` is the documented "guaranteed not to
// resolve" choice). `.test` was already excluded below; the others are the same class.
const reservedTopLevelDomains = [".test", ".example", ".invalid", ".localhost"];
// Directory segments and file suffixes that hold tests. A URL inside a test is a fixture value —
// a referrer, a fake host, a route under our own product domain used to assert behaviour — not a
// reference an agent should load, so it is not a source to register or refresh. The repository's
// *.fixtures.ts suites have the same role as *.test.ts and *.spec.ts files. Authored code and
// docs next to the tests are still scanned in full.
const testPathSegments = new Set(["test", "tests", "__tests__"]);
const testFilePattern = /\.(test|spec|fixtures)\.[cm]?[jt]sx?$/;

function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, [
    { flags: ["--root"], key: "root" },
    { flags: ["--registry"], key: "registry", kind: "string" },
    { flags: ["--since-days"], key: "sinceDays", kind: "number" },
    { flags: ["--write-discovered"], key: "writeDiscovered", kind: "boolean" },
  ]);
  const root = flagString(flags, "root") ?? process.cwd();
  const registryPath = flagString(flags, "registry") ?? "checks/validation/repository/source-registry.yaml";
  const sinceDays = flagNumber(flags, "sinceDays") ?? 8;

  return {
    root,
    registryPath: path.isAbsolute(registryPath) ? registryPath : path.resolve(root, registryPath),
    sinceDays: Number.isFinite(sinceDays) && sinceDays > 0 ? sinceDays : 8,
    writeDiscovered: flagBoolean(flags, "writeDiscovered"),
  };
}

function normalizeUrl(raw: string): string | undefined {
  let trimmed = raw
    .trim()
    .replace(/[`'"),.}>;:]+$/g, "")
    .replace(/^[`'"(<{[]+/g, "");
  // Square brackets may belong to a filename or query. Remove only an unmatched
  // closing wrapper, such as [https://host/path], without truncating font URLs.
  while (trimmed.endsWith("]") && (trimmed.match(/\]/g)?.length ?? 0) > (trimmed.match(/\[/g)?.length ?? 0)) {
    trimmed = trimmed.slice(0, -1);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }
  // A `${` inside the match is a template-literal placeholder (`https://${host}/relay`): the
  // "URL" is a code fragment whose host is decided at runtime, never a reachable source.
  if (trimmed.includes("${")) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    const hostname = parsed.hostname.toLowerCase();
    if (ignoredHosts.has(hostname) || reservedTopLevelDomains.some((suffix) => hostname.endsWith(suffix))) {
      return undefined;
    }
    if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function extractUrls(text: string): string[] {
  const urls = new Set<string>();
  // Balanced brackets belong to the URL; an unmatched bracket ends a Markdown label.
  for (const match of text.matchAll(/https?:\/\/(?:\[[^\s<>"')}\]]*\]|[^\s<>"')}\[\]])+/gi)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) {
      urls.add(normalized);
    }
  }
  return Array.from(urls).sort();
}

function shouldScan(filePath: string, root: string, registryPath: string): boolean {
  const relative = path.relative(root, filePath);
  if (path.resolve(filePath) === path.resolve(registryPath)) {
    return false;
  }
  if (relative.startsWith("docs/source-freshness/source-snapshots")) {
    return false;
  }
  if (relative.startsWith("docs/source-freshness/SOURCE_REFRESH_REPORT")) {
    return false;
  }
  // Generated build artifact, same as the two above. Its HTML-escaped URLs
  // (&amp;) re-enter the scan as "new" unregistered sources otherwise — the
  // exact loop that kept the weekly refresh job red for seven straight runs.
  if (relative.startsWith("docs/source-freshness/source-refresh.html")) {
    return false;
  }
  const segments = relative.split(path.sep);
  const normalized = segments.join("/");
  // Snapshot parity verifies these copied resources; scan their authored inputs once.
  if (normalized.startsWith("catalog/generated/firstparty/")) return false;
  // These projections have dedicated freshness checks. Their authored inputs are still scanned.
  // Escaped Markdown in JSON is not a second source; Wrangler runtime declarations are vendored
  // types. Matched by basename, not a per-package path: `wrangler types` regenerates this exact
  // filename inside every package that binds Workers types, and each copy is Cloudflare's own
  // generated MDN-link-laden boilerplate the same way hosted/knowledge-mcp's already-excluded copy is —
  // hosted/builder-console grew one once it gained its own wrangler devDependency, and the next package to add
  // one should not have to rediscover this exclusion by going red first.
  if (normalized.endsWith("catalog/generated/hosted-knowledge.json") || segments[segments.length - 1] === "worker-configuration.d.ts") return false;
  if (normalized.includes("hosted/knowledge-mcp/.wrangler/") || normalized.includes("hosted/builder-console/.wrangler/")) return false;
  // Machine-local agent worktrees are concurrent checkouts of other branches,
  // not this checkout's content. A sibling agent's in-progress copy carrying a
  // not-yet-registered URL would turn the local audit red while CI (clean
  // checkout, no nested worktrees) stays green; that branch's own audit is
  // where the URL gets registered. Same class of exclusion as the npm-pack
  // .claude rule and the generated report above. Compared as path segments so
  // the exclusion holds on Windows separators too.
  if (segments[0] === ".claude" && segments[1] === "worktrees") {
    return false;
  }
  if (segments.some((part) => ignoredPathParts.has(part))) {
    return false;
  }
  // Tests carry stand-in URLs (see testPathSegments above). Excluded by path segment and by file
  // suffix so a `foo.test.ts` beside its module is treated the same as one under `test/`.
  if (segments.some((part) => testPathSegments.has(part)) || testFilePattern.test(segments[segments.length - 1] ?? "")) {
    return false;
  }
  return textExtensions.has(path.extname(filePath));
}

function loadRegistry(registryPath: string): MutableRecord {
  if (!existsSync(registryPath)) {
    return { schema_version: 1, sources: [] };
  }
  const parsed = parseYaml(readFileSync(registryPath, "utf8"));
  if (!isRecord(parsed)) {
    return { schema_version: 1, sources: [] };
  }
  if (!Array.isArray(parsed.sources)) {
    parsed.sources = [];
  }
  return parsed;
}

function sourceRecords(registry: MutableRecord): MutableRecord[] {
  return Array.isArray(registry.sources) ? registry.sources.filter(isRecord) : [];
}

function knowledgePackageUrls(root: string): Set<string> {
  const result = new Set<string>();
  const marker = `${path.sep}catalog${path.sep}knowledge${path.sep}`;
  for (const file of collectAllFiles(root, 20000)) {
    if (!file.includes(marker) || !/\.ya?ml$/u.test(file)) continue;
    const parsed = parseYaml(readFileSync(file, "utf8"));
    if (!isRecord(parsed) || !Array.isArray(parsed.sources)) continue;
    for (const source of parsed.sources.filter(isRecord)) {
      const url = normalizeUrl(String(source.url ?? ""));
      if (url) result.add(url);
    }
  }
  return result;
}

function discoverCurrentUrls(args: Args): Map<string, DiscoveredUrl> {
  const discovered = new Map<string, DiscoveredUrl>();
  for (const file of collectAllFiles(args.root, 20000)) {
    if (!shouldScan(file, args.root, args.registryPath)) {
      continue;
    }
    const relative = path.relative(args.root, file);
    const text = readFileSync(file, "utf8");
    for (const url of extractUrls(text)) {
      const entry = discovered.get(url) ?? { url, locations: new Set<string>(), addedRecently: false };
      entry.locations.add(relative);
      discovered.set(url, entry);
    }
  }
  return discovered;
}

function recentAddedUrls(args: Args): Set<string> {
  const urls = new Set<string>();
  const log = spawnSync("git", ["log", `--since=${args.sinceDays}.days`, "--format=%H", "--", "."], {
    cwd: args.root,
    encoding: "utf8",
  });
  if (log.status !== 0) {
    return urls;
  }
  for (const commit of log.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    const show = spawnSync("git", ["show", "--format=", "--unified=0", "--no-ext-diff", commit, "--", "."], {
      cwd: args.root,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    if (show.status !== 0) {
      continue;
    }
    for (const line of show.stdout.split(/\r?\n/)) {
      if (!line.startsWith("+") || line.startsWith("+++")) {
        continue;
      }
      for (const url of extractUrls(line.slice(1))) {
        urls.add(url);
      }
    }
  }

  const diff = spawnSync("git", ["diff", "--unified=0", "--no-ext-diff", "HEAD", "--", "."], {
    cwd: args.root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (diff.status === 0) {
    for (const line of diff.stdout.split(/\r?\n/)) {
      if (!line.startsWith("+") || line.startsWith("+++")) {
        continue;
      }
      for (const url of extractUrls(line.slice(1))) {
        urls.add(url);
      }
    }
  }

  return urls;
}

function classifySource(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname === "github.com") {
    return "github";
  }
  if (parsed.hostname.includes("developer.apple.com") || parsed.hostname.includes("developer.android.com")) {
    return "official_docs";
  }
  if (parsed.hostname.includes("docs.") || parsed.pathname.includes("/docs")) {
    return "docs";
  }
  if (parsed.hostname.includes("support.google.com")) {
    return "support_docs";
  }
  return "website";
}

function sourceIdFor(url: string, usedIds: Set<string>): string {
  const parsed = new URL(url);
  const base =
    `${parsed.hostname}${parsed.pathname}`
      .replace(/^www\./, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "source";
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function appendDiscoveredSources(registry: MutableRecord, missing: DiscoveredUrl[]): void {
  const sources = Array.isArray(registry.sources) ? registry.sources : [];
  registry.sources = sources;
  const usedIds = new Set(
    sourceRecords(registry)
      .map((source) => String(source.id ?? ""))
      .filter(Boolean),
  );
  for (const item of missing.sort((a, b) => a.url.localeCompare(b.url))) {
    sources.push({
      id: sourceIdFor(item.url, usedIds),
      name: new URL(item.url).hostname,
      source_type: classifySource(item.url),
      url: item.url,
      refresh_cadence_days: 7,
      owner: "source-freshness",
      locations: Array.from(item.locations).sort(),
      notes: item.addedRecently ? "Auto-discovered from recently added repository content." : "Auto-discovered from repository content.",
    });
  }
  sources.sort((a, b) => String((a as MutableRecord).id ?? "").localeCompare(String((b as MutableRecord).id ?? "")));
}

const args = parseArgs(process.argv.slice(2));
const issues = [];
const registry = loadRegistry(args.registryPath);
const discovered = discoverCurrentUrls(args);
const recentlyAdded = recentAddedUrls(args);

for (const url of recentlyAdded) {
  const entry = discovered.get(url);
  if (entry) {
    entry.addedRecently = true;
  }
}

const registeredUrls = new Set(
  sourceRecords(registry)
    .flatMap((source) => [source.url, source.fetch_url])
    .map((url) => normalizeUrl(String(url ?? "")))
    .filter((url): url is string => Boolean(url)),
);
for (const url of knowledgePackageUrls(args.root)) registeredUrls.add(url);

const missing = Array.from(discovered.values()).filter((entry) => !registeredUrls.has(entry.url));

if (missing.length > 0 && args.writeDiscovered) {
  appendDiscoveredSources(registry, missing);
  writeFileSync(args.registryPath, stringifyYaml(registry, { lineWidth: 120 }), "utf8");
} else {
  for (const entry of missing) {
    issues.push(
      issue(
        "error",
        entry.addedRecently ? "source_freshness.new_recent_url_unregistered" : "source_freshness.url_unregistered",
        `External source is referenced but missing from source-registry.yaml: ${entry.url}`,
        Array.from(entry.locations).sort()[0],
      ),
    );
  }
}

// Overdue detection is split from registration on purpose: verifying a source's content needs
// the network (refresh-source-freshness.ts, the scheduled refresh), while this gate must stay
// deterministic and offline. The refresh writes per-source checked_at snapshots; when that
// state exists, cadence-overdue sources surface here as warnings — visible in every audit run,
// never a red build purely because time passed between scheduled refreshes. Founder-facing
// knowledge sources have their own hard gate (knowledge.source.stale in check:catalog),
// measured from this snapshot's generated_at rather than the CI wall clock. A weekly refresh
// that advances generated_at is what forces last_review_date values past cadence to be
// reviewed; a feature PR must not go red solely because the calendar moved.
const snapshotPath = path.join(args.root, "docs/source-freshness/source-snapshots/current.json");
const snapshotByUrl = new Map<string, { checkedAt?: string }>();
if (existsSync(snapshotPath)) {
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf8"));
    for (const item of (Array.isArray(parsed.sources) ? parsed.sources : []).filter(isRecord)) {
      const url = normalizeUrl(String(item.url ?? ""));
      const checkedAt = trustedSourceCheckTime(item);
      if (url) snapshotByUrl.set(url, { checkedAt });
    }
  } catch {
    issues.push(
      issue(
        "warning",
        "source_freshness.snapshot.unreadable",
        `Snapshot state exists but could not be parsed: ${path.relative(args.root, snapshotPath)}`,
        path.relative(args.root, snapshotPath),
      ),
    );
  }
}

const seenIds = new Map<string, number>();
const seenUrls = new Map<string, number>();
for (const [index, source] of sourceRecords(registry).entries()) {
  const id = typeof source.id === "string" ? source.id.trim() : "";
  if (id) {
    const first = seenIds.get(id);
    if (first !== undefined) {
      issues.push(
        issue(
          "error",
          "source_freshness.sources.duplicate_id",
          `sources.${index}.id duplicates sources.${first}.id (${id}).`,
          path.relative(args.root, args.registryPath),
        ),
      );
    } else {
      seenIds.set(id, index);
    }
  }
  const normalizedSourceUrl = normalizeUrl(String(source.url ?? ""));
  if (normalizedSourceUrl) {
    const first = seenUrls.get(normalizedSourceUrl);
    if (first !== undefined) {
      issues.push(
        issue(
          "error",
          "source_freshness.sources.duplicate_url",
          `sources.${index}.url duplicates sources.${first}.url after normalizeUrl (${normalizedSourceUrl}).`,
          path.relative(args.root, args.registryPath),
        ),
      );
    } else {
      seenUrls.set(normalizedSourceUrl, index);
    }
  }
}

for (const [index, source] of sourceRecords(registry).entries()) {
  const prefix = `sources.${index}`;
  if (snapshotByUrl.size > 0) {
    const url = normalizeUrl(String(source.url ?? ""));
    const cadence = typeof source.refresh_cadence_days === "number" ? source.refresh_cadence_days : undefined;
    const snapshot = url ? snapshotByUrl.get(url) : undefined;
    if (url && cadence) {
      if (!snapshot?.checkedAt) {
        issues.push(
          issue(
            "warning",
            `source_freshness.${prefix}.unverified`,
            `${String(source.id)} has no trusted successful source check. A missing snapshot row or failed attempt does not verify freshness.`,
            path.relative(args.root, args.registryPath),
          ),
        );
      }
      const ageDays = snapshot?.checkedAt ? Math.floor((Date.now() - new Date(snapshot.checkedAt).valueOf()) / 86_400_000) : Number.NaN;
      if (Number.isFinite(ageDays) && ageDays > cadence) {
        issues.push(
          issue(
            "warning",
            `source_freshness.${prefix}.overdue`,
            `${String(source.id)} was last verified ${ageDays} days ago (cadence ${cadence}); run refresh:source-freshness.`,
            path.relative(args.root, args.registryPath),
          ),
        );
      }
    }
  }
  for (const field of ["id", "name", "source_type", "url", "owner"]) {
    if (typeof source[field] !== "string" || !String(source[field]).trim()) {
      issues.push(
        issue(
          "error",
          `source_freshness.${prefix}.${field}.missing`,
          `${prefix}.${field} must be a non-empty string.`,
          path.relative(args.root, args.registryPath),
        ),
      );
    }
  }
  if (!normalizeUrl(String(source.url ?? ""))) {
    issues.push(
      issue(
        "error",
        `source_freshness.${prefix}.url.invalid`,
        `${prefix}.url must be a valid external http(s) URL.`,
        path.relative(args.root, args.registryPath),
      ),
    );
  }
  if (source.fetch_url !== undefined) {
    let valid = false;
    try {
      if (typeof source.fetch_url === "string" && source.fetch_url === source.fetch_url.trim()) {
        const fetchUrl = new URL(source.fetch_url);
        valid = fetchUrl.protocol === "https:" && !fetchUrl.username && !fetchUrl.password;
      }
    } catch {
      // A malformed retrieval address is a configuration error, not an implicit fallback.
    }
    if (!valid) {
      issues.push(
        issue(
          "error",
          `source_freshness.${prefix}.fetch_url.invalid`,
          `${prefix}.fetch_url must be an HTTPS URL without credentials.`,
          path.relative(args.root, args.registryPath),
        ),
      );
    }
  }
  if (typeof source.refresh_cadence_days !== "number" || source.refresh_cadence_days < 1) {
    issues.push(
      issue(
        "error",
        `source_freshness.${prefix}.refresh_cadence_days.invalid`,
        `${prefix}.refresh_cadence_days must be a positive number.`,
        path.relative(args.root, args.registryPath),
      ),
    );
  }
}

reportAndExit("Source freshness registry check", issues);
