#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { escapeHtml } from "../../../tooling/lib/html.js";
import { flagNumber, flagString, isRecord, parseFlags } from "../../../tooling/lib/launch-state.js";
import { readSourceText, SourceHttpError, sourceHttpFailure, sourceReportUrl, type SourceHttpOptions } from "../../../tooling/lib/source-http.js";
import { trustedSourceCheckTime, trustedSourceHash } from "../../../tooling/lib/source-freshness-state.js";
import { isMainModule } from "../../../tooling/lib/cli-entrypoint.js";
import { writeKnowledgeFreshnessPin } from "../../../tooling/lib/knowledge-freshness-pin.js";

interface SourceRecord {
  id: string;
  name: string;
  source_type: string;
  url: string;
  fetch_url?: string;
  refresh_cadence_days: number;
  owner: string;
  locations?: string[];
  notes?: string;
}

interface SourceSnapshot {
  id: string;
  name: string;
  url: string;
  fetch_url?: string;
  source_type: string;
  owner: string;
  status: "fresh" | "changed" | "blocked";
  http_status?: number;
  checked_at: string;
  last_verified_at?: string;
  hash?: string;
  previous_hash?: string;
  changed: boolean;
  title?: string;
  error?: string;
}

interface Args {
  root: string;
  registryPath: string;
  outDir: string;
  timeoutMs: number;
  knowledgePinRoot?: string;
}

function parseArgs(argv: string[]): Args {
  const knowledgePinIndex = argv.lastIndexOf("--knowledge-pin-root");
  if (knowledgePinIndex >= 0 && (!argv[knowledgePinIndex + 1] || argv[knowledgePinIndex + 1]!.startsWith("--"))) {
    throw new Error("--knowledge-pin-root requires a path.");
  }
  const flags = parseFlags(argv, [
    { flags: ["--root"], key: "root" },
    { flags: ["--registry"], key: "registry", kind: "string" },
    { flags: ["--out-dir"], key: "outDir", kind: "string" },
    { flags: ["--timeout-ms"], key: "timeoutMs", kind: "number" },
    { flags: ["--knowledge-pin-root"], key: "knowledgePinRoot", kind: "string", strict: true },
  ]);
  const root = flagString(flags, "root") ?? process.cwd();
  const registryPath = flagString(flags, "registry") ?? "checks/validation/repository/source-registry.yaml";
  const outDir = flagString(flags, "outDir") ?? "docs/source-freshness";
  const timeoutMs = flagNumber(flags, "timeoutMs") ?? 15000;
  const knowledgePinRoot = flagString(flags, "knowledgePinRoot")?.trim();

  return {
    root,
    registryPath: path.isAbsolute(registryPath) ? registryPath : path.resolve(root, registryPath),
    outDir: path.isAbsolute(outDir) ? outDir : path.resolve(root, outDir),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000,
    knowledgePinRoot: knowledgePinRoot ? (path.isAbsolute(knowledgePinRoot) ? knowledgePinRoot : path.resolve(root, knowledgePinRoot)) : undefined,
  };
}

function readSources(registryPath: string): SourceRecord[] {
  const parsed = parseYaml(readFileSync(registryPath, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
    throw new Error(`${registryPath} must include a sources array.`);
  }
  if (parsed.sources.filter(isRecord).some((source) => source.fetch_url !== undefined && typeof source.fetch_url !== "string")) {
    throw new Error("Source fetch_url must be a string when set.");
  }
  return parsed.sources.filter(isRecord).map((source) => ({
    id: String(source.id ?? ""),
    name: String(source.name ?? ""),
    source_type: String(source.source_type ?? ""),
    url: String(source.url ?? ""),
    fetch_url: typeof source.fetch_url === "string" ? source.fetch_url : undefined,
    refresh_cadence_days: Number(source.refresh_cadence_days ?? 7),
    owner: String(source.owner ?? "source-freshness"),
    locations: Array.isArray(source.locations) ? source.locations.map(String) : [],
    notes: typeof source.notes === "string" ? source.notes : undefined,
  }));
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function titleFromHtml(text: string): string | undefined {
  const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function previousSnapshots(snapshotPath: string): Map<string, SourceSnapshot> {
  if (!existsSync(snapshotPath)) {
    return new Map();
  }
  try {
    const parsed = JSON.parse(readFileSync(snapshotPath, "utf8"));
    const snapshots: unknown[] = Array.isArray(parsed.sources) ? parsed.sources : [];
    return new Map(snapshots.filter(isRecord).map((item) => [String(item.id), item as unknown as SourceSnapshot]));
  } catch {
    return new Map();
  }
}

export async function fetchSource(
  source: SourceRecord,
  previous: SourceSnapshot | undefined,
  timeoutMs: number,
  checkedAt: string,
  httpOptions: SourceHttpOptions = {},
): Promise<SourceSnapshot> {
  const previousHash = trustedSourceHash(previous);
  const url = sourceReportUrl(source.url, httpOptions.env);
  const fetchUrl = source.fetch_url === undefined ? undefined : sourceReportUrl(source.fetch_url, httpOptions.env);
  try {
    const { text, httpStatus } = await readSourceText(source.fetch_url ?? source.url, { ...httpOptions, timeoutMs });
    const hash = hashText(text);
    const changed = Boolean(previousHash && previousHash !== hash);
    return {
      id: source.id,
      name: source.name,
      url,
      fetch_url: fetchUrl,
      source_type: source.source_type,
      owner: source.owner,
      status: changed ? "changed" : "fresh",
      http_status: httpStatus,
      checked_at: checkedAt,
      last_verified_at: checkedAt,
      hash,
      previous_hash: previousHash,
      changed,
      title: titleFromHtml(text),
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      url,
      fetch_url: fetchUrl,
      source_type: source.source_type,
      owner: source.owner,
      status: "blocked",
      http_status: error instanceof SourceHttpError ? error.httpStatus : undefined,
      checked_at: checkedAt,
      last_verified_at: trustedSourceCheckTime(previous),
      previous_hash: previousHash,
      changed: false,
      error: sourceHttpFailure(error),
    };
  }
}

function renderMarkdown(snapshots: SourceSnapshot[]): string {
  const changed = snapshots.filter((item) => item.changed);
  const blocked = snapshots.filter((item) => item.status === "blocked");
  const rows = snapshots
    .map((item) => `| ${item.id} | ${item.source_type} | ${item.status} | ${item.http_status ?? ""} | ${item.changed ? "yes" : "no"} | ${item.url} |`)
    .join("\n");
  return [
    "# Source Freshness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Sources checked: ${snapshots.length}`,
    `Changed since previous snapshot: ${changed.length}`,
    `Blocked fetches: ${blocked.length}`,
    "",
    "## Changed Sources",
    "",
    changed.length === 0 ? "None." : changed.map((item) => `- ${item.id}: ${item.url}`).join("\n"),
    "",
    "## Blocked Sources",
    "",
    blocked.length === 0 ? "None." : blocked.map((item) => `- ${item.id}: ${item.error ?? "fetch blocked"} (${item.url})`).join("\n"),
    "",
    "## All Sources",
    "",
    "| ID | Type | Status | HTTP | Changed | URL |",
    "| --- | --- | --- | ---: | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function renderHtml(snapshots: SourceSnapshot[]): string {
  const rows = snapshots
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.source_type)}</td><td class="${item.status}">${item.status}</td><td>${item.http_status ?? ""}</td><td>${item.changed ? "yes" : "no"}</td><td><a href="${escapeHtml(item.url)}">${escapeHtml(item.url)}</a></td></tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Source Freshness Report</title>
  <style>
    body { margin: 0; font: 14px/1.45 "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif; background: #f7f4ec; color: #171717; }
    header { padding: 24px; border-bottom: 1px solid #d8d0c4; background: #fffdf8; }
    main { padding: 20px; }
    table { width: 100%; border-collapse: collapse; background: #fffdf8; border: 1px solid #d8d0c4; }
    th, td { padding: 10px; border-bottom: 1px solid #d8d0c4; text-align: left; vertical-align: top; }
    th { font-size: 12px; color: #615b52; text-transform: uppercase; }
    .changed { color: #8a5900; font-weight: 700; }
    .blocked { color: #b3261e; font-weight: 700; }
    .fresh { color: #0c7c59; font-weight: 700; }
    a { color: #2447d8; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <h1>Source Freshness Report</h1>
    <p>${snapshots.length} sources checked. ${snapshots.filter((item) => item.changed).length} changed. ${snapshots.filter((item) => item.status === "blocked").length} blocked.</p>
  </header>
  <main>
    <table>
      <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>HTTP</th><th>Changed</th><th>URL</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>
`;
}

export async function refreshSourceFreshness(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const sources = readSources(args.registryPath);
  const snapshotDir = path.join(args.outDir, "source-snapshots");
  const snapshotPath = path.join(snapshotDir, "current.json");
  const previous = previousSnapshots(snapshotPath);
  const checkedAt = new Date().toISOString();
  mkdirSync(snapshotDir, { recursive: true });

  // Politeness is per host, not global: sources on the same host are fetched
  // strictly in sequence, while distinct hosts go through a small concurrency
  // pool. At ~190 registered sources this turns a worst-case ~49-minute serial
  // run into a few minutes without hammering any single docs site.
  const FETCH_CONCURRENCY = 5;

  function hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  const byHost = new Map<string, SourceRecord[]>();
  for (const source of sources) {
    const host = hostOf(source.fetch_url ?? source.url);
    const group = byHost.get(host) ?? [];
    group.push(source);
    byHost.set(host, group);
  }

  const snapshots: SourceSnapshot[] = [];
  const hostQueues = Array.from(byHost.values());
  let nextQueue = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(FETCH_CONCURRENCY, hostQueues.length)) }, async () => {
    while (nextQueue < hostQueues.length) {
      const queue = hostQueues[nextQueue];
      nextQueue += 1;
      if (!queue) {
        continue;
      }
      for (const source of queue) {
        snapshots.push(await fetchSource(source, previous.get(source.id), args.timeoutMs, checkedAt));
      }
    }
  });
  await Promise.all(workers);

  snapshots.sort((a, b) => a.id.localeCompare(b.id));
  const payload = { generated_at: checkedAt, registry: path.relative(args.root, args.registryPath), sources: snapshots };
  writeFileSync(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  if (args.knowledgePinRoot) writeKnowledgeFreshnessPin(args.knowledgePinRoot, snapshotPath);
  writeFileSync(path.join(args.outDir, "SOURCE_REFRESH_REPORT.md"), renderMarkdown(snapshots), "utf8");
  writeFileSync(path.join(args.outDir, "source-refresh.html"), renderHtml(snapshots), "utf8");

  console.log("Source freshness refresh");
  console.log(
    `sources=${snapshots.length} changed=${snapshots.filter((item) => item.changed).length} blocked=${snapshots.filter((item) => item.status === "blocked").length}`,
  );
  console.log(`report=${path.join(args.outDir, "SOURCE_REFRESH_REPORT.md")}`);
}

if (isMainModule(import.meta.url)) {
  try {
    await refreshSourceFreshness(process.argv.slice(2));
  } catch {
    console.error("Source refresh failed. Check the registry and output configuration.");
    process.exitCode = 1;
  }
}
