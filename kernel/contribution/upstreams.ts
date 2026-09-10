import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { latestEntryForSource } from "../../adapters/providers/capability-delta.js";
import { loadCapabilityDelta, loadProviderContracts, loadRegistrySourceIds } from "../../adapters/providers/load.js";
import { loadKnowledgePackages } from "../../catalog/knowledge-packages.js";
import {
  CONTRIBUTION_API_VERSION,
  contributionManifestSchema,
  upstreamObservationSchema,
  type ContributionManifest,
  type ContributionUnit,
  type EvaluationCase,
  type SourceRecord,
  type UpstreamManifest,
  type UpstreamObservation,
} from "../../contracts/contribution/contract.js";
import { readSourceText } from "../../tooling/lib/source-http.js";
import { trustedSourceCheckTime } from "../../tooling/lib/source-freshness-state.js";
import { githubIdentity, readGithubUpstream, summarizeReleaseBody, type FetchText } from "./github-metadata.js";
import { hashExecutable, observeHost, probeExecutablesOnPath, runVersionProbe, type HashFile, type ProbeExecutables, type RunVersion } from "./host-observe.js";
import { inferScope } from "./manifest-io.js";
import { camelToSnake, loadUpstreams, upstreamObservationPath, type LoadedUpstream } from "./upstreams-load.js";
import { buildUpgradePlanProviderDelta } from "./provider-capability-delta.js";
import type { ChangeClassification, UpgradePlanData, UpstreamChangeItem, UpstreamCheckData, UpstreamInventoryData, UpstreamInventoryRow } from "./types.js";

/**
 * The upstream half of the contribution service: an inventory read model, a change check, and
 * a bounded upgrade plan. Every value comes from an authored manifest, a recorded observation,
 * a repository file, or an explicitly requested fetch or host probe. Anything that was not
 * observed is reported as "unknown", "unsnapped", or "not-observed", never guessed. Nothing here
 * installs, upgrades, executes upstream code, or changes a workspace pin.
 */
export interface UpstreamDependencies {
  skillRoot: string;
  now: () => Date;
  fetchText?: FetchText;
  probeExecutables?: ProbeExecutables;
  runVersion?: RunVersion;
  hashFile?: HashFile;
}

export const SOURCE_REGISTRY_RELATIVE = "checks/validation/repository/source-registry.yaml";
export const SOURCE_SNAPSHOT_RELATIVE = "docs/source-freshness/source-snapshots/current.json";
export const LOCKFILE_COVERAGE_NOTE =
  "Only authored upstream manifests are inventoried; npm transitive dependencies are covered by package-lock.json and are not listed here.";

export const ADOPTION_NOTES = [
  "Updating the builder's support claim does not upgrade any host binary; upgrade the executable separately and re-run the live probe.",
  "No active workspace pin changes; workspaces adopt through their authorized path.",
  "A newer binary authorizes no additional operations; unsupported_operations stay unsupported until reviewed.",
  "Historical receipts stay valid; unresolved external-effect reconciliation is unaffected by a binary rollback.",
] as const;

/* ------------------------------------------------------------------------------------------ */
/* Small helpers                                                                                */
/* ------------------------------------------------------------------------------------------ */

type Semver = readonly [number, number, number];

export function parseSemver(value: string): Semver | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]*)?$/u.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  for (let index = 0; index < 3; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
}

/**
 * Minimal range matcher: an exact "x.y.z", or space-separated comparators such as
 * ">=4.5.0 <5.0.0" or "<4.0.0". Returns null when the range is not expressed in semver terms.
 */
export function semverSatisfies(version: Semver, range: string): boolean | null {
  const tokens = range.trim().split(/\s+/u).filter(Boolean);
  if (!tokens.length) return null;
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=)?v?(\d+\.\d+\.\d+)$/u.exec(token);
    if (!match) return null;
    const operator = match[1] ?? "=";
    const bound = parseSemver(match[2]!);
    if (!bound) return null;
    const order = compareSemver(version, bound);
    const satisfied =
      operator === "=" ? order === 0 : operator === ">=" ? order >= 0 : operator === ">" ? order > 0 : operator === "<=" ? order <= 0 : order < 0;
    if (!satisfied) return false;
  }
  return true;
}

function daysBetween(earlier: string, later: Date): number {
  const start = Date.parse(earlier.length === 10 ? `${earlier}T00:00:00Z` : earlier);
  return Number.isNaN(start) ? Number.POSITIVE_INFINITY : Math.floor((later.valueOf() - start) / 86_400_000);
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .replace(/-+$/u, "");
  return (slug || "unknown").slice(0, 120);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unknownUpstream(upstreamId: string): Error {
  return new Error(`upstreams.unknown_upstream: ${upstreamId}`);
}

function loadOne(skillRoot: string, upstreamId: string): LoadedUpstream {
  const loaded = loadUpstreams(skillRoot).upstreams.find((entry) => entry.manifest.id === upstreamId);
  if (!loaded) throw unknownUpstream(upstreamId);
  return loaded;
}

/* ------------------------------------------------------------------------------------------ */
/* Change classification                                                                        */
/* ------------------------------------------------------------------------------------------ */

/**
 * Security and rights wording wins over every prefix rule: a dependency bump or a CI line that
 * names an advisory (GHSA, CVE, Dependabot security, supply chain) is a risk review, never noise.
 */
const SECURITY_PATTERNS = [
  /\bsecurity\b/iu,
  /\bcve\b/iu,
  /\bghsa-/iu,
  /\badvisor(?:y|ies)\b/iu,
  /vulnerab/iu,
  /credential leak/iu,
  /\bdependabot security\b/iu,
  /\bsupply[ -]chain\b/iu,
];
/**
 * Auth, credential, token, and telemetry wording is checked before the prefix rules so a
 * `ci:` or `build(deps):` line that changes how secrets or usage data are handled still reaches
 * a behavior review. The lookbehind skips module paths such as aws-sdk-go-v2/credentials, whose
 * segment names a package, not a behavior.
 */
const SENSITIVE_WORDING_PATTERNS = [
  /(?<![\w/.@-])auth(?:entication|orization)?\b/iu,
  /(?<![\w/.@-])credentials?\b/iu,
  /(?<![\w/.@-])tokens?\b/iu,
  /(?<![\w/.@-])telemetry\b/iu,
];
const BEHAVIOR_PATTERNS = [
  /\blicen[cs]e\b/iu,
  /\btelemetry\b/iu,
  /\bauth(?:entication|orization)?\b/iu,
  /\boutput format\b/iu,
  /\bexit codes?\b/iu,
  /\bflag rename\b/iu,
  /deprecat/iu,
  /\bbreaking\b/iu,
];
/** Showcase, contributor-credit, test-only, and dependency-bump lines cannot change the tool's behavior. */
const NON_BEHAVIOR_PATTERNS = [/^apps wall\b/iu, /^(?:ci|test|tests)(?:\(|:|\b)/iu, /^build\(deps/iu, /dependabot/iu, /made their first contribution/iu];
/** Documentation and housekeeping types; checked after the behavior keywords so a relicensing note is not hidden. */
const HOUSEKEEPING_PREFIX_PATTERNS = [/^(?:docs?|chore)(?:\(|:|\b)/iu];
const IRRELEVANT_PATTERNS = [/\bapps wall\b/iu, /\bdocs\b/iu, /\bdeps\b/iu, /\bchore\b/iu];
const FEATURE_PATTERN = /^feat(?:\(|:|\b)/iu;
const OMISSION_MARKER = /^\(\d+ lines omitted from summary\)$/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function keywordPattern(keyword: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(keyword.trim())}(?![A-Za-z0-9])`, "iu");
}

type Operation = UpstreamManifest["support"]["operations"][number];

export function matchOperations(line: string, operations: readonly Operation[]): string[] {
  return operations
    .filter((operation) => operation.keywords.some((keyword) => keyword.trim() && keywordPattern(keyword).test(line)))
    .map((operation) => operation.id);
}

export function classifyLine(line: string, operations: readonly Operation[]): { classification: ChangeClassification; matchedOperations: string[] } {
  if (OMISSION_MARKER.test(line)) return { classification: "unknown-impact", matchedOperations: [] };
  if (SECURITY_PATTERNS.some((pattern) => pattern.test(line)))
    return { classification: "security-or-rights-review", matchedOperations: matchOperations(line, operations) };
  if (SENSITIVE_WORDING_PATTERNS.some((pattern) => pattern.test(line)))
    return { classification: "behavior-change-review", matchedOperations: matchOperations(line, operations) };
  if (NON_BEHAVIOR_PATTERNS.some((pattern) => pattern.test(line))) return { classification: "irrelevant", matchedOperations: [] };
  if (BEHAVIOR_PATTERNS.some((pattern) => pattern.test(line)))
    return { classification: "behavior-change-review", matchedOperations: matchOperations(line, operations) };
  if (HOUSEKEEPING_PREFIX_PATTERNS.some((pattern) => pattern.test(line))) return { classification: "irrelevant", matchedOperations: [] };
  const matched = matchOperations(line, operations);
  if (matched.length) return { classification: "relevant-to-supported", matchedOperations: matched };
  if (IRRELEVANT_PATTERNS.some((pattern) => pattern.test(line))) return { classification: "irrelevant", matchedOperations: [] };
  if (FEATURE_PATTERN.test(line)) return { classification: "new-capability", matchedOperations: [] };
  return { classification: "unknown-impact", matchedOperations: [] };
}

export function classifyReleases(releases: UpstreamObservation["releasesSinceBaseline"], manifest: UpstreamManifest): UpstreamChangeItem[] {
  const changes: UpstreamChangeItem[] = [];
  for (const release of releases) {
    for (const line of release.summary
      .split("; ")
      .map((entry) => entry.trim())
      .filter(Boolean)) {
      const { classification, matchedOperations } = classifyLine(line, manifest.support.operations);
      changes.push({
        tag: release.tag,
        publishedAt: release.publishedAt,
        line,
        classification,
        confidence: "heuristic",
        matchedOperations,
        maintainerDecision: "pending",
      });
    }
  }
  return changes;
}

/** Source drift is review input, not a claim of ancestry or compatibility. */
export function sourceRevisionChanges(observation: UpstreamObservation, manifest: UpstreamManifest): UpstreamChangeItem[] {
  const head = observation.branchHead;
  if (!head) return [];
  return Object.entries(manifest.baselines).flatMap(([kind, baseline]) => {
    if (!baseline || !/^[a-f0-9]{40}$/.test(baseline.revision) || baseline.revision === head.sha) return [];
    return [
      {
        tag: head.sha,
        publishedAt: head.committedAt,
        line: `${kind} baseline ${baseline.revision} differs from observed ${head.branch} commit ${head.sha}; inspect mapped source paths and intentional adaptations before adoption.`,
        classification: "unknown-impact" as const,
        confidence: "heuristic" as const,
        matchedOperations: manifest.support.operations.map((operation) => operation.id),
        maintainerDecision: "pending" as const,
      },
    ];
  });
}

function affectedOwners(changes: readonly UpstreamChangeItem[], manifest: UpstreamManifest): string[] {
  const owners = new Set<string>();
  const reviewed = changes.filter((change) =>
    ["relevant-to-supported", "behavior-change-review", "security-or-rights-review", "unknown-impact"].includes(change.classification),
  );
  if (!reviewed.length) return [];
  for (const change of reviewed) {
    for (const operationId of change.matchedOperations) {
      for (const owner of manifest.support.operations.find((operation) => operation.id === operationId)?.owners ?? []) owners.add(owner);
    }
  }
  for (const relationship of manifest.relationships) for (const owner of relationship.localOwners) owners.add(owner);
  return [...owners].sort();
}

function recommend(changes: readonly UpstreamChangeItem[], observation: UpstreamObservation): UpstreamCheckData["recommendation"] {
  if (changes.some((change) => change.classification === "security-or-rights-review") || observation.licenseChanged === true || observation.archived === true)
    return "risk-review";
  if (changes.some((change) => change.classification === "relevant-to-supported" || change.classification === "behavior-change-review"))
    return "prepare-upgrade-plan";
  if (!observation.latestStable && !changes.length) return "unknown";
  if (changes.length && changes.every((change) => change.classification === "irrelevant" || change.classification === "new-capability")) return "no-action";
  if (!changes.length) return "no-action";
  return "unknown";
}

/* ------------------------------------------------------------------------------------------ */
/* Repository read models                                                                       */
/* ------------------------------------------------------------------------------------------ */

interface SnapshotRow {
  readonly status: string;
  readonly lastVerifiedAt: string | null;
}

function loadSnapshotRows(skillRoot: string): Map<string, SnapshotRow> {
  const rows = new Map<string, SnapshotRow>();
  const snapshotPath = path.join(skillRoot, SOURCE_SNAPSHOT_RELATIVE);
  if (!existsSync(snapshotPath)) return rows;
  let parsed: unknown;
  try {
    parsed = readJsonFile(snapshotPath);
  } catch {
    return rows;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) return rows;
  for (const item of parsed.sources) {
    if (!isRecord(item) || typeof item.id !== "string") continue;
    rows.set(item.id, { status: typeof item.status === "string" ? item.status : "unknown", lastVerifiedAt: trustedSourceCheckTime(item) ?? null });
  }
  return rows;
}

interface LockfileView {
  readonly dependencyCount: number;
  readonly directDependencies: Set<string>;
  readonly resolved: Map<string, string>;
  readonly packageJsonPresent: boolean;
  readonly lockPresent: boolean;
}

function loadLockfileView(skillRoot: string): LockfileView {
  const directDependencies = new Set<string>();
  const resolved = new Map<string, string>();
  let dependencyCount = 0;
  const packageJsonPath = path.join(skillRoot, "package.json");
  const lockPath = path.join(skillRoot, "package-lock.json");
  const packageJsonPresent = existsSync(packageJsonPath);
  const lockPresent = existsSync(lockPath);
  if (packageJsonPresent) {
    try {
      const parsed = readJsonFile(packageJsonPath);
      if (isRecord(parsed)) {
        const dependencies = isRecord(parsed.dependencies) ? parsed.dependencies : {};
        dependencyCount = Object.keys(dependencies).length;
        for (const name of Object.keys(dependencies)) directDependencies.add(name);
        if (isRecord(parsed.devDependencies)) for (const name of Object.keys(parsed.devDependencies)) directDependencies.add(name);
      }
    } catch {
      /* An unreadable package.json is reported as absent; nothing is inferred from it. */
    }
  }
  if (lockPresent) {
    try {
      const parsed = readJsonFile(lockPath);
      if (isRecord(parsed) && isRecord(parsed.packages)) {
        for (const [key, entry] of Object.entries(parsed.packages)) {
          if (!key.startsWith("node_modules/") || !isRecord(entry) || typeof entry.version !== "string") continue;
          resolved.set(key.slice("node_modules/".length), entry.version);
        }
      }
    } catch {
      /* Same rule as above. */
    }
  }
  return { dependencyCount, directDependencies, resolved, packageJsonPresent, lockPresent };
}

interface CitationIndex {
  readonly bySource: Map<string, Set<string>>;
  readonly byUpstream: Map<string, Set<string>>;
  readonly issue?: string;
}

function loadCitations(skillRoot: string): CitationIndex {
  const bySource = new Map<string, Set<string>>();
  const byUpstream = new Map<string, Set<string>>();
  try {
    for (const pkg of loadKnowledgePackages(skillRoot)) {
      for (const source of pkg.sources) {
        if (!bySource.has(source.id)) bySource.set(source.id, new Set());
        bySource.get(source.id)!.add(pkg.id);
        if (source.upstreamId) {
          if (!byUpstream.has(source.upstreamId)) byUpstream.set(source.upstreamId, new Set());
          byUpstream.get(source.upstreamId)!.add(pkg.id);
        }
      }
    }
    return { bySource, byUpstream };
  } catch (error) {
    return { bySource, byUpstream, issue: error instanceof Error ? error.message : String(error) };
  }
}

function hostDependencies(deps: UpstreamDependencies) {
  return {
    now: deps.now,
    probeExecutables: deps.probeExecutables ?? ((command: string) => probeExecutablesOnPath(command)),
    runVersion: deps.runVersion ?? runVersionProbe,
    hashFile: deps.hashFile ?? hashExecutable,
  };
}

function installedFromHost(host: UpstreamObservation["host"]): UpstreamInventoryRow["installed"] {
  if (!host) return "not-observed";
  const selected = host.executables.find((executable) => executable.path === host.selected) ?? host.executables[0];
  if (!selected) return "unknown";
  return {
    path: selected.path,
    version: selected.version,
    sha256: selected.sha256,
    shadowed: host.executables.filter((executable) => executable.path !== selected.path).map((executable) => executable.path),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Inventory                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export function listUpstreams(deps: UpstreamDependencies, input: { upstreamId?: string; observeHost?: boolean }): UpstreamInventoryData {
  const now = deps.now();
  const loaded = loadUpstreams(deps.skillRoot);
  const issues: UpstreamInventoryData["issues"] = [...loaded.issues];
  let selected = loaded.upstreams;
  if (input.upstreamId !== undefined) {
    selected = loaded.upstreams.filter((entry) => entry.manifest.id === input.upstreamId);
    if (!selected.length) throw unknownUpstream(input.upstreamId);
  }
  const registry = loadRegistrySourceIds(path.join(deps.skillRoot, SOURCE_REGISTRY_RELATIVE));
  if (registry.issue) issues.push({ code: "upstreams.source_registry_unavailable", message: registry.issue, path: SOURCE_REGISTRY_RELATIVE });
  const snapshot = loadSnapshotRows(deps.skillRoot);
  const citations = loadCitations(deps.skillRoot);
  if (citations.issue) issues.push({ code: "upstreams.knowledge_packages_unavailable", message: citations.issue });
  const providers = loadProviderContracts(deps.skillRoot);
  const capability = loadCapabilityDelta(deps.skillRoot);
  const lockfile = loadLockfileView(deps.skillRoot);

  const upstreams = selected.map((entry): UpstreamInventoryRow => {
    const { manifest } = entry;
    const unknowns: string[] = [];
    const registrySourceIds: string[] = [];
    for (const sourceId of manifest.sourceIds) {
      if (registry.ids.has(sourceId)) registrySourceIds.push(sourceId);
      else {
        issues.push({
          code: "upstreams.source_id_unknown",
          message: `${manifest.id} cites source id ${sourceId}, which has no row in ${SOURCE_REGISTRY_RELATIVE}.`,
          path: entry.manifestPath,
        });
        unknowns.push(`source id ${sourceId} has no source-registry row`);
      }
    }
    const snapshotRows = manifest.sourceIds.map((sourceId) => snapshot.get(sourceId)).filter((row): row is SnapshotRow => row !== undefined);
    const trustedRow = snapshotRows.find((row) => row.lastVerifiedAt !== null);
    const snapshotState: UpstreamInventoryRow["snapshot"] = trustedRow
      ? { status: trustedRow.status, lastVerifiedAt: trustedRow.lastVerifiedAt }
      : snapshotRows[0]
        ? { status: snapshotRows[0].status, lastVerifiedAt: null }
        : "unsnapped";
    if (snapshotState === "unsnapped") unknowns.push("no source-freshness snapshot row for any cited source id");

    const citing = new Set<string>();
    for (const sourceId of manifest.sourceIds) for (const id of citations.bySource.get(sourceId) ?? []) citing.add(id);
    for (const id of citations.byUpstream.get(manifest.id) ?? []) citing.add(id);
    const providerContractIds = providers.contracts
      .filter((contract) => contract.sourceIds.some((sourceId) => manifest.sourceIds.includes(sourceId)))
      .map((contract) => contract.id);

    let capabilityDelta: UpstreamInventoryRow["capabilityDelta"] = null;
    if (capability.delta) {
      for (const sourceId of manifest.sourceIds) {
        const latest = latestEntryForSource(capability.delta, sourceId);
        if (latest) capabilityDelta = { classification: latest.classification, migration: latest.migration };
      }
    }

    let lock: UpstreamInventoryRow["lockfile"] = null;
    for (const relationship of manifest.relationships) {
      if (relationship.kind !== "direct-dependency") continue;
      const alias = manifest.aliases.find((candidate) => lockfile.directDependencies.has(candidate));
      if (!alias) {
        unknowns.push(
          lockfile.packageJsonPresent
            ? "direct-dependency relationship names no alias found in package.json dependencies"
            : "package.json not found; lockfile resolution unknown",
        );
        continue;
      }
      const resolved = lockfile.resolved.get(alias);
      if (resolved) lock = { name: alias, resolved, authority: "package-lock.json" };
      else unknowns.push(lockfile.lockPresent ? `package-lock.json has no entry for ${alias}` : "package-lock.json not found; resolved version unknown");
    }

    let host: UpstreamObservation["host"] = entry.observation?.host ?? null;
    if (input.observeHost) {
      if (manifest.hostProbe) {
        const observed = observeHost(manifest.hostProbe, hostDependencies(deps));
        host = observed.host;
        unknowns.push(...observed.unknowns);
      } else {
        host = null;
        unknowns.push("manifest declares no host_probe; host observation is not possible");
      }
    } else if (host) {
      unknowns.push(`installed executable taken from the observation recorded at ${host.observedAt}; not re-probed`);
    }
    const installed = input.observeHost && !manifest.hostProbe ? "unknown" : installedFromHost(host);

    const observation = entry.observation;
    if (!observation) unknowns.push("no recorded observation; latest release and branch head unknown");
    else if (!observation.latestStable) unknowns.push(`observation recorded at ${observation.checkedAt} carries no stable release`);
    if (observation) unknowns.push(...observation.unknowns);
    const reviewedSource = manifest.baselines.reviewedSource?.revision ?? "unknown";
    const reviewedGuidance = manifest.baselines.reviewedGuidance?.revision ?? "unknown";
    if (reviewedSource === "unknown") unknowns.push("no reviewed source baseline recorded");
    if (reviewedGuidance === "unknown") unknowns.push("no reviewed guidance baseline recorded");

    return {
      id: manifest.id,
      project: manifest.project,
      canonicalUrl: manifest.canonicalUrl,
      authors: manifest.authors.map((author) => author.name),
      maintainers: manifest.maintainers.map((maintainer) => maintainer.name),
      license: { spdx: manifest.license.spdx, status: manifest.license.status, noticeRetained: entry.notice !== undefined },
      relationships: manifest.relationships.map((relationship) => relationship.kind),
      consumption: manifest.relationships.map((relationship) => relationship.consumption),
      localOwners: unique(manifest.relationships.flatMap((relationship) => relationship.localOwners)),
      tests: unique(manifest.relationships.flatMap((relationship) => relationship.tests)),
      reviewedSource,
      reviewedGuidance,
      supportedVersions: manifest.support.versions.map((version) => ({ range: version.range, status: version.status })),
      supportedOperations: manifest.support.operations.map((operation) => operation.id),
      unsupportedOperations: manifest.support.unsupportedOperations.map((operation) => operation.id),
      latestStable: observation?.latestStable
        ? { tag: observation.latestStable.tag, publishedAt: observation.latestStable.publishedAt, checkedAt: observation.checkedAt }
        : "unknown",
      branchHead: observation?.branchHead ? { sha: observation.branchHead.sha, committedAt: observation.branchHead.committedAt } : "unknown",
      installed,
      snapshot: snapshotState,
      registrySourceIds,
      citingReferenceIds: [...citing].sort(),
      providerContractIds,
      lockfile: lock,
      capabilityDelta,
      review: {
        status: manifest.review.status,
        lastReview: manifest.review.lastReview,
        cadenceDays: manifest.review.cadenceDays,
        due: daysBetween(manifest.review.lastReview, now) > manifest.review.cadenceDays,
      },
      credits: { acknowledge: manifest.credits.acknowledge, use: manifest.credits.use },
      unknowns: unique(unknowns),
    };
  });

  return {
    generatedAt: now.toISOString(),
    upstreams,
    coverage: { manifests: loaded.upstreams.length, lockfileDependencies: lockfile.dependencyCount, note: LOCKFILE_COVERAGE_NOTE },
    issues,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Check                                                                                        */
/* ------------------------------------------------------------------------------------------ */

function emptyObservation(upstreamId: string, checkedAt: string): UpstreamObservation {
  return {
    schemaVersion: 1,
    upstreamId,
    checkedAt,
    method: "manual",
    latestStable: null,
    prereleases: [],
    branchHead: null,
    releasesSinceBaseline: [],
    licenseSha256: null,
    licenseChanged: null,
    archived: null,
    host: null,
    unknowns: [],
  };
}

function baselineTag(manifest: UpstreamManifest, tags: ReadonlySet<string>): { tag: string; label: string } | null {
  const guidance = manifest.baselines.reviewedGuidance?.revision;
  if (guidance && tags.has(guidance)) return { tag: guidance, label: "reviewed_guidance" };
  const source = manifest.baselines.reviewedSource?.revision;
  if (source && tags.has(source)) return { tag: source, label: "reviewed_source" };
  return null;
}

async function fetchObservation(
  deps: UpstreamDependencies,
  entry: LoadedUpstream,
  checkedAt: string,
): Promise<{ observation: UpstreamObservation; unknowns: string[] }> {
  const { manifest } = entry;
  const unknowns: string[] = [];
  const identity = githubIdentity(manifest.canonicalUrl);
  if (!identity) {
    unknowns.push("canonical_url is not a github.com repository; no metadata reader exists for it");
    return { observation: { ...emptyObservation(manifest.id, checkedAt), method: "manual" }, unknowns };
  }
  const fetchText = deps.fetchText ?? ((url: string) => readSourceText(url));
  const read = await readGithubUpstream(fetchText, identity);
  unknowns.push(...read.unknowns);
  const stable = read.releases.filter((release) => !release.draft && !release.prerelease);
  const tags = new Set(stable.map((release) => release.tag));
  const baseline = baselineTag(manifest, tags);
  let releasesSinceBaseline: UpstreamObservation["releasesSinceBaseline"] = [];
  if (baseline) {
    const baselineRelease = stable.find((release) => release.tag === baseline.tag)!;
    releasesSinceBaseline = stable
      .filter((release) => Date.parse(release.publishedAt) > Date.parse(baselineRelease.publishedAt))
      .map((release) => ({ tag: release.tag, publishedAt: release.publishedAt, summary: summarizeReleaseBody(release.body) }));
  } else if (stable.length) {
    unknowns.push("neither reviewed baseline revision is a tag in the fetched release list; releases since baseline were not computed");
  } else {
    unknowns.push("no stable release was read; releases since baseline are unknown");
  }
  const evidence = manifest.license.evidenceSha256;
  const observation: UpstreamObservation = {
    schemaVersion: 1,
    upstreamId: manifest.id,
    checkedAt,
    method: "github-api",
    // The release page address is dropped on purpose: a stored observation carries no URL that
    // the source registry would then have to track. The tag and the asset digests identify it.
    latestStable: read.latestStable
      ? {
          tag: read.latestStable.tag,
          publishedAt: read.latestStable.publishedAt,
          assets: read.latestStable.assets.map((asset) => ({
            name: asset.name,
            ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
            ...(asset.bytes !== undefined ? { bytes: asset.bytes } : {}),
          })),
        }
      : null,
    prereleases: read.prereleases,
    branchHead: read.branchHead,
    releasesSinceBaseline,
    licenseSha256: read.licenseSha256,
    licenseChanged: read.licenseSha256 && evidence ? read.licenseSha256 !== evidence : null,
    archived: read.repository?.archived ?? null,
    host: null,
    unknowns: [],
  };
  if (observation.licenseChanged === null)
    unknowns.push(
      read.licenseSha256 ? "license.evidence_sha256 is not recorded; license drift cannot be judged" : "LICENSE digest unknown; license drift cannot be judged",
    );
  if (observation.archived === null) unknowns.push("repository archived state unknown");
  return { observation, unknowns };
}

function computeDrift(observation: UpstreamObservation, manifest: UpstreamManifest, unknowns: string[]): UpstreamCheckData["drift"] {
  const host = observation.host;
  const installed = installedFromHost(host);
  let installedVersusSupported: UpstreamCheckData["drift"]["installedVersusSupported"] = "not-observed";
  let installedVersusLatest: UpstreamCheckData["drift"]["installedVersusLatest"] = "not-observed";
  let shadowedExecutables: string[] = [];
  if (installed === "unknown") {
    installedVersusSupported = "unknown";
    installedVersusLatest = "unknown";
  } else if (installed !== "not-observed") {
    shadowedExecutables = installed.shadowed;
    const version = installed.version ? parseSemver(installed.version) : null;
    if (!version) {
      installedVersusSupported = "unknown";
      installedVersusLatest = "unknown";
      unknowns.push(
        installed.version
          ? `installed version ${installed.version} is not semver; support range not tested`
          : "installed version unknown; support range not tested",
      );
    } else {
      installedVersusSupported = "unknown";
      for (const range of manifest.support.versions) {
        const satisfied = semverSatisfies(version, range.range);
        if (satisfied === true) {
          installedVersusSupported = range.status;
          break;
        }
      }
      if (installedVersusSupported === "unknown") unknowns.push(`installed version ${installed.version} matches no declared support range`);
      const latest = observation.latestStable ? parseSemver(observation.latestStable.tag) : null;
      if (!latest) {
        installedVersusLatest = "unknown";
        unknowns.push(
          observation.latestStable
            ? `latest stable tag ${observation.latestStable.tag} is not semver`
            : "latest stable release unknown; installed version cannot be compared",
        );
      } else {
        const order = compareSemver(version, latest);
        installedVersusLatest = order === 0 ? "current" : order < 0 ? "behind" : "ahead";
      }
    }
  }
  const branchAheadOfRelease =
    observation.branchHead && observation.latestStable
      ? Date.parse(observation.branchHead.committedAt) > Date.parse(observation.latestStable.publishedAt)
      : null;
  return { installedVersusSupported, installedVersusLatest, shadowedExecutables, licenseChanged: observation.licenseChanged, branchAheadOfRelease };
}

export function serializeObservation(observation: UpstreamObservation): string {
  return `${JSON.stringify(upstreamObservationSchema.parse(observation), null, 2)}\n`;
}

export function writeObservation(skillRoot: string, observation: UpstreamObservation): string {
  const target = upstreamObservationPath(skillRoot, observation.upstreamId);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, serializeObservation(observation), "utf8");
  return target;
}

export async function checkUpstream(
  deps: UpstreamDependencies,
  input: { upstreamId: string; fetch?: boolean; write?: boolean; observeHost?: boolean },
): Promise<UpstreamCheckData> {
  const entry = loadOne(deps.skillRoot, input.upstreamId);
  const { manifest } = entry;
  const checkedAt = deps.now().toISOString();
  const unknowns: string[] = [];
  let observation: UpstreamObservation;
  const networkUsed = input.fetch === true;
  if (networkUsed) {
    const fetched = await fetchObservation(deps, entry, checkedAt);
    observation = fetched.observation;
    unknowns.push(...fetched.unknowns);
    if (entry.observation?.host && !input.observeHost) observation = { ...observation, host: entry.observation.host };
  } else if (entry.observation) {
    observation = entry.observation;
    unknowns.push(`observation recorded at ${observation.checkedAt}; not refreshed (fetch not requested)`);
    unknowns.push(...observation.unknowns);
  } else {
    observation = emptyObservation(manifest.id, checkedAt);
    unknowns.push("no release data: fetch not requested and no recorded observation");
  }
  if (input.observeHost) {
    if (manifest.hostProbe) {
      const observed = observeHost(manifest.hostProbe, hostDependencies(deps));
      observation = { ...observation, host: observed.host };
      unknowns.push(...observed.unknowns);
    } else {
      observation = { ...observation, host: null };
      unknowns.push("manifest declares no host_probe; host observation is not possible");
    }
  } else if (observation.host) {
    unknowns.push(`host executables taken from the observation recorded at ${observation.host.observedAt}; not re-probed`);
  } else {
    unknowns.push("host executable not observed: pass --observe-host to probe PATH");
  }
  if (!networkUsed && !observation.latestStable) unknowns.push("latest stable release unknown: run upstream-check --fetch");

  const drift = computeDrift(observation, manifest, unknowns);
  const changes = [...classifyReleases(observation.releasesSinceBaseline, manifest), ...sourceRevisionChanges(observation, manifest)];
  const observationUnknowns = unique([
    ...observation.unknowns,
    ...unknowns.filter((item) => !item.startsWith("observation recorded at") && !item.startsWith("host executables taken from")),
  ]);
  observation = { ...observation, unknowns: observationUnknowns };
  let written: string | null = null;
  if (input.write) written = writeObservation(deps.skillRoot, observation);
  return {
    upstreamId: manifest.id,
    observation,
    baseline: {
      reviewedSource: manifest.baselines.reviewedSource?.revision ?? "unknown",
      reviewedGuidance: manifest.baselines.reviewedGuidance?.revision ?? "unknown",
    },
    supportedVersions: manifest.support.versions.map((version) => ({ range: version.range, status: version.status })),
    drift,
    changes,
    affectedLocalOwners: affectedOwners(changes, manifest),
    recommendation: recommend(changes, observation),
    written,
    networkUsed,
    unknowns: unique(unknowns),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Upgrade plan                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function dispositionFor(kind: UpstreamManifest["relationships"][number]["kind"]): ContributionUnit["disposition"] {
  switch (kind) {
    case "external-executable":
    case "remote-service":
      return "wrap";
    case "adapted-method":
    case "selected-skill-guidance":
      return "adapt";
    case "direct-dependency":
      return "reuse";
    case "copied-code":
    case "template-or-asset":
      return "vendor";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function targetKindFor(kind: UpstreamManifest["relationships"][number]["kind"]): ContributionUnit["target"]["kind"] {
  switch (kind) {
    case "external-executable":
    case "remote-service":
      return "provider-adapter";
    case "adapted-method":
    case "selected-skill-guidance":
    case "copied-code":
    case "template-or-asset":
      return "existing-reference";
    case "direct-dependency":
      return "undecided";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

const COPYING_DISPOSITIONS = new Set<ContributionUnit["disposition"]>(["reuse", "wrap", "vendor"]);
const LAUNCHBENCH_SCENARIO_DIRECTORY = "checks/validation/repository/evals/launchbench/";
const RETRIEVAL_METHOD_LABELS: Record<UpstreamObservation["method"], string> = {
  "github-api": "GitHub API metadata",
  "recorded-fixture": "recorded fixture metadata",
  manual: "maintainer-assembled metadata",
};

const normalizeOwnerPath = (value: string): string => value.replace(/\\/gu, "/").replace(/^\.\//u, "");

/**
 * The unit target for a relationship owner. An existing reference must name the knowledge
 * package that owns the path, so the owner is matched against the loaded packages; a path no
 * package owns is recorded as a document instead of an unresolvable reference.
 */
function unitTargetFor(
  kind: UpstreamManifest["relationships"][number]["kind"],
  owner: string,
  packageIdByPath: ReadonlyMap<string, string>,
): ContributionUnit["target"] {
  const targetKind = targetKindFor(kind);
  if (targetKind !== "existing-reference") return { kind: targetKind, path: owner, owner };
  const packageId = packageIdByPath.get(normalizeOwnerPath(owner));
  return packageId ? { kind: "existing-reference", id: packageId, path: owner, owner } : { kind: "document", path: owner, owner };
}

const VERIFICATION_FIXTURES_DIRECTORY = "checks/verification/fixtures/";
const VALIDATOR_FIXTURES_DIRECTORY = "checks/validation/repository/fixtures/";

/**
 * The command `b2c contribute evaluate` runs for one required verification. A TypeScript check
 * runs through tsx from the skill root, with `--skill-root .` when the script names that flag;
 * a fixture module is not a script, so it runs through its runner (the validator runner has no
 * per-module form that reports its exit status, so the whole suite runs); a LaunchBench scenario
 * is named by its path, which evaluate lints from the skill root without executing anything; an
 * npm script or any other command line is kept verbatim.
 */
function evaluationCommandFor(verification: string, skillRoot: string): string {
  const value = verification.trim();
  if (value.startsWith("npm run ")) return value;
  const normalized = normalizeOwnerPath(value);
  if (normalized.startsWith(LAUNCHBENCH_SCENARIO_DIRECTORY) && /\.ya?ml$/u.test(normalized)) return normalized;
  const fixtureModule = /^(.+\/)([^/]+)\.fixtures\.ts$/u.exec(normalized);
  if (fixtureModule) {
    const [, directory, name] = fixtureModule;
    if (directory === VERIFICATION_FIXTURES_DIRECTORY) return `npx tsx ${VERIFICATION_FIXTURES_DIRECTORY}run.ts ${name}`;
    if (directory === VALIDATOR_FIXTURES_DIRECTORY) return "npm run test:validators";
  }
  if (normalized.endsWith(".ts")) {
    const file = path.join(skillRoot, normalized);
    const acceptsSkillRoot = existsSync(file) && readFileSync(file, "utf8").includes("--skill-root");
    return `npx tsx ${normalized}${acceptsSkillRoot ? " --skill-root ." : ""}`;
  }
  return value;
}

function renderAdoptionMap(plan: Omit<UpgradePlanData, "written">): string {
  const manifest = plan.contributionManifest;
  const delta = plan.providerCapabilityDelta;
  const deltaLines = delta.applicable
    ? [
        "## Provider Capability Delta",
        "",
        `Applicable. Transport ${delta.transport ?? "unknown"}. From ${delta.fromReviewed ?? "unknown"} to ${delta.toCandidate ?? "unknown"}.`,
        delta.sourcePageDelta
          ? `Source-page ledger ${delta.sourcePageDelta.owner}: classification ${delta.sourcePageDelta.classification ?? "none"}; ${delta.sourcePageDelta.note}`
          : "No source-page classification is attached.",
        "Native-contract dimensions that were not inspected stay unknown.",
        `Workspace pin: ${delta.versionFacts?.workspacePin ?? "unchanged"}. Observed executable: ${delta.versionFacts?.observedExecutable ?? "not-observed-by-this-plan"}.`,
        "",
      ]
    : ["## Provider Capability Delta", "", delta.reason ?? "Not a provider upgrade.", ""];
  const lines = [
    `# Adoption map: ${manifest.id}`,
    "",
    `Upstream: ${plan.upstreamId}. Candidate: ${plan.candidate ? plan.candidate.revision : "unknown"}. Baseline source ${plan.baseline.reviewedSource}; guidance ${plan.baseline.reviewedGuidance}.`,
    "",
    "| Unit | Kind | Disposition | Target | Verification |",
    "| --- | --- | --- | --- | --- |",
    ...manifest.units.map(
      (unit) =>
        `| ${unit.id} | ${unit.kind} | ${unit.disposition} | ${unit.target.path ?? unit.target.kind} | ${unit.verification.join("; ") || "none declared"} |`,
    ),
    "",
    "## Expected local diff",
    "",
    ...plan.expectedLocalDiff.map((entry) => `- ${entry.path}: ${entry.change}`),
    "",
    "## Adoption notes",
    "",
    ...plan.adoptionNotes.map((note) => `- ${note}`),
    "",
    ...deltaLines,
  ];
  if (plan.unknowns.length) lines.push("## Unknowns", "", ...plan.unknowns.map((item) => `- ${item}`), "");
  return lines.join("\n");
}

export function upgradePlan(deps: UpstreamDependencies, input: { upstreamId: string; candidate?: string; target?: string }): UpgradePlanData {
  const entry = loadOne(deps.skillRoot, input.upstreamId);
  const { manifest } = entry;
  const observation = entry.observation;
  const now = deps.now();
  const unknowns: string[] = [];
  const candidateRevision = input.candidate?.trim() || observation?.latestStable?.tag || observation?.branchHead?.sha || null;
  if (!candidateRevision) unknowns.push("candidate revision unknown; run upstream-check --fetch");

  let publishedAt: string | null = null;
  let digests: Array<{ name: string; sha256: string }> = [];
  if (candidateRevision && observation) {
    if (observation.latestStable?.tag === candidateRevision) {
      publishedAt = observation.latestStable.publishedAt;
      digests = observation.latestStable.assets
        .filter((asset): asset is typeof asset & { sha256: string } => typeof asset.sha256 === "string")
        .map((asset) => ({ name: asset.name, sha256: asset.sha256 }));
      if (!digests.length) unknowns.push(`no asset digests recorded for ${candidateRevision}`);
    } else if (candidateRevision === observation.branchHead?.sha) {
      publishedAt = observation.branchHead.committedAt;
      unknowns.push("Candidate is an observed source commit, not a tested binary release; review its source diff before adoption.");
    } else {
      publishedAt = observation.releasesSinceBaseline.find((release) => release.tag === candidateRevision)?.publishedAt ?? null;
      unknowns.push(`asset digests for ${candidateRevision} are not recorded; only the latest stable release carries digests`);
    }
  } else if (candidateRevision) {
    unknowns.push(`no recorded observation for ${manifest.id}; candidate ${candidateRevision} has no recorded publication time or digests`);
  }

  const candidateSemver = candidateRevision ? parseSemver(candidateRevision) : null;
  const releases = (observation?.releasesSinceBaseline ?? []).filter((release) => {
    if (!candidateRevision) return false;
    const releaseSemver = parseSemver(release.tag);
    if (candidateSemver && releaseSemver) return compareSemver(releaseSemver, candidateSemver) <= 0;
    return release.tag === candidateRevision || observation?.latestStable?.tag === candidateRevision;
  });
  if (candidateRevision && observation && !observation.releasesSinceBaseline.length)
    unknowns.push("no releases since baseline are recorded; inspect the source commit separately before assuming no change");
  const changeSummary = [
    ...classifyReleases(releases, manifest),
    ...(observation && candidateRevision === observation.branchHead?.sha ? sourceRevisionChanges(observation, manifest) : []),
  ];
  const relevant = changeSummary.filter(
    (change) =>
      change.classification === "relevant-to-supported" ||
      change.classification === "behavior-change-review" ||
      change.classification === "security-or-rights-review" ||
      change.classification === "unknown-impact",
  );
  const affectedOperations = unique(relevant.flatMap((change) => change.matchedOperations)).filter((id) =>
    manifest.support.operations.some((operation) => operation.id === id),
  );
  const newFeaturesNotSupported = changeSummary.filter((change) => change.classification === "new-capability").map((change) => change.line);
  const candidateLabel = candidateRevision ?? "the candidate revision";

  const diff = new Map<string, string[]>();
  const addDiff = (filePath: string, change: string): void => {
    const current = diff.get(filePath) ?? [];
    if (!current.includes(change)) current.push(change);
    diff.set(filePath, current);
  };
  for (const relationship of manifest.relationships) {
    if (relationship.kind !== "adapted-method") continue;
    for (const owner of relationship.localOwners)
      addDiff(owner, `re-verify command syntax against ${candidateLabel} --help and refresh the reviewed baseline note`);
  }
  for (const operationId of affectedOperations) {
    const operation = manifest.support.operations.find((item) => item.id === operationId)!;
    const count = relevant.filter((change) => change.matchedOperations.includes(operationId)).length;
    for (const owner of operation.owners)
      addDiff(owner, `re-verify operation ${operation.id} (${operation.title}) against ${candidateLabel}; ${count} matched release line(s)`);
  }
  addDiff(`catalog/upstreams/${manifest.id}.yaml`, "update baselines.reviewed_source or reviewed_guidance revision and observed_at after the review");
  addDiff(`catalog/upstreams/observations/${manifest.id}.json`, "refresh with b2c contribute upstream-check --fetch --write");
  const expectedLocalDiff = [...diff.entries()].map(([filePath, changes]) => ({ path: filePath, change: changes.join("; ") }));

  const requiredVerification = unique([
    ...manifest.relationships.flatMap((relationship) => relationship.tests),
    "npm run check:upstreams",
    ...(manifest.hostProbe?.command === "asc" ? ["npm run check:asc-command-contract"] : []),
    "npm run check:credits",
  ]);

  const sourceRecord: SourceRecord = {
    id: manifest.id,
    kind: "tool",
    title: manifest.project,
    canonicalUrl: manifest.canonicalUrl,
    publisher: manifest.authors[0]!.name,
    ...(candidateRevision ? { revision: candidateRevision } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    // Every recorded observation is an excerpt: release metadata and the LICENSE digest, never
    // the repository. Its review belongs to the manifest under catalog/upstreams (upstreamId).
    retrieval: observation
      ? {
          status: "excerpt",
          method: `${RETRIEVAL_METHOD_LABELS[observation.method]} recorded at ${observation.checkedAt}`,
          notes: "Release metadata and LICENSE digest only; no source archive was retrieved.",
        }
      : { status: "not-retrieved", notes: "No fetch was made for this plan." },
    rights: {
      status: manifest.license.status,
      spdx: manifest.license.spdx,
      ...(manifest.license.noticeFile
        ? { evidence: manifest.license.noticeFile }
        : manifest.license.evidenceUrl
          ? { evidence: manifest.license.evidenceUrl }
          : {}),
      ...(manifest.license.evidenceSha256 ? { evidenceSha256: manifest.license.evidenceSha256 } : {}),
      ...(manifest.license.scope ? { scope: manifest.license.scope } : {}),
      ...(manifest.license.notes ? { notes: manifest.license.notes } : {}),
    },
    selectors: unique(manifest.relationships.flatMap((relationship) => relationship.upstreamPaths)),
    registrySourceId: manifest.sourceIds[0]!,
    upstreamId: manifest.id,
    directives: [],
    inventory: [],
    unknowns: [],
  };

  const unitIds = new Set<string>();
  const uniqueId = (base: string): string => {
    let id = slugify(base);
    let counter = 2;
    while (unitIds.has(id)) {
      id = slugify(`${base}-${counter}`);
      counter += 1;
    }
    unitIds.add(id);
    return id;
  };
  const packageIdByPath = new Map(loadKnowledgePackages(deps.skillRoot).map((pkg) => [normalizeOwnerPath(pkg.path), pkg.id]));
  const implementationUnits: ContributionUnit[] = manifest.relationships.map((relationship) => {
    const owners = new Set(relationship.localOwners);
    const owner = relationship.localOwners[0]!;
    return {
      id: uniqueId(`${manifest.id}-${relationship.kind}`),
      kind: "implementation",
      title: `${relationship.kind} via ${owner}`.slice(0, 400),
      upstream: { sourceId: manifest.id },
      target: unitTargetFor(relationship.kind, owner, packageIdByPath),
      disposition: dispositionFor(relationship.kind),
      status: "proposed",
      rationale: relationship.consumption,
      verification: relationship.tests,
      kept: manifest.adaptations
        .filter((adaptation) => owners.has(adaptation.owner))
        .map((adaptation) => `adaptation ${adaptation.id} (owner ${adaptation.owner})`),
      changed: expectedLocalDiff.filter((change) => owners.has(change.path)).map((change) => change.path),
      omitted: [],
      deferred: [],
      conflicts: [],
      selection: "selected-method",
      applicability: [`${manifest.project} ${candidateLabel}; pin authority: ${relationship.pinAuthority}`.slice(0, 400)],
    };
  });
  const evaluationUnits: ContributionUnit[] = requiredVerification.map((command) => ({
    id: uniqueId(`verify-${command}`),
    kind: "evaluation",
    title: command.slice(0, 400),
    upstream: null,
    target: { kind: "check", ...(command.startsWith("npm ") ? {} : { path: command }) },
    disposition: "original",
    status: "proposed",
    rationale: `Required verification before the support claim moves to ${candidateLabel}. The check is the builder's own; it copies nothing from the upstream.`,
    verification: [command],
    kept: [],
    changed: [],
    omitted: [],
    deferred: [],
    conflicts: [],
    selection: "always",
    applicability: [],
  }));
  const evaluations: EvaluationCase[] = evaluationUnits.map((unit) => {
    const command = evaluationCommandFor(unit.title, deps.skillRoot);
    return {
      id: uniqueId(`${unit.id}-case`),
      unitId: unit.id,
      kind: "command",
      description: `Run ${command} after the local diff is applied; a pass proves the probed surface only.`,
      mustFail: [],
      mustPass: [command],
      command,
      observations: [],
    };
  });
  const copyingTargets = unique(
    implementationUnits
      .filter((unit) => COPYING_DISPOSITIONS.has(unit.disposition))
      .map((unit) => unit.target.path)
      .filter((value): value is string => Boolean(value)),
  );
  // Copied or wrapped material needs the retained notice; the manifest names it and the copyright line.
  const notices: ContributionManifest["notices"] =
    manifest.license.noticeFile && copyingTargets.length
      ? [
          {
            sourceId: sourceRecord.id,
            spdx: manifest.license.spdx,
            copyright: manifest.copyright ?? `copyright line not recorded in catalog/upstreams/${manifest.id}.yaml`,
            noticePath: manifest.license.noticeFile,
            covers: copyingTargets,
          },
        ]
      : [];
  if (manifest.license.noticeFile && copyingTargets.length && !manifest.copyright)
    unknowns.push(`catalog/upstreams/${manifest.id}.yaml records no copyright line; the notice entry says so instead of inventing one`);
  const units = [...implementationUnits, ...evaluationUnits];
  const goal = `Prepare the builder to adopt ${manifest.project} ${candidateLabel} without changing the support contract, any unsupported operation, or any workspace pin.`;
  // An upgrade plan edits the owners the manifest declares. When any of them sits under a
  // maintainer-owned layer the plan is maintenance, and the reason names those owners.
  const inferred = inferScope(goal, units);
  const scope: ContributionManifest["scope"] = inferred.verdict === "maintenance" ? "maintenance" : "contribution";
  const routingReason =
    scope === "maintenance"
      ? `Upstream maintenance changes maintainer-owned owners declared by catalog/upstreams/${manifest.id}.yaml: ${inferred.maintenanceTargets.join(", ")}. It changes no business workspace.`
      : "Upstream maintenance changes the builder's own catalog and knowledge, not a business workspace.";

  const contributionManifest: ContributionManifest = contributionManifestSchema.parse({
    apiVersion: CONTRIBUTION_API_VERSION,
    id: slugify(`upgrade-${manifest.id}-${candidateRevision ?? "unknown"}`),
    goal,
    scope,
    routing: {
      intendedTarget: `catalog/upstreams/${manifest.id}.yaml`,
      effect: "Updates the reviewed baseline and the recorded observation; activates no new operation and changes no workspace.",
      verdict: scope,
      reason: routingReason,
    },
    createdAt: now.toISOString(),
    synthetic: false,
    sources: [sourceRecord],
    batchOverlap: [],
    existingOwners: unique(manifest.relationships.flatMap((relationship) => relationship.localOwners)).map((owner) => ({
      id: owner,
      path: owner,
      match: `local owner declared by catalog/upstreams/${manifest.id}.yaml`,
    })),
    units,
    derivations: [],
    evaluations,
    affectedOutputs: expectedLocalDiff.map((change) => change.path),
    requiredChecks: requiredVerification,
    uncertainties: unknowns,
    missingCoreMechanism: { present: false },
    notices,
  } satisfies ContributionManifest);

  const reviewedSource = manifest.baselines.reviewedSource?.revision ?? "unknown";
  const reviewedGuidance = manifest.baselines.reviewedGuidance?.revision ?? "unknown";
  const supportedRange =
    manifest.support.versions.map((version) => `${version.range} (${version.status})`).join("; ") || "unknown";
  const providerCapabilityDelta = buildUpgradePlanProviderDelta({
    skillRoot: deps.skillRoot,
    manifest,
    candidateRevision,
    reviewedSource,
    reviewedGuidance,
    supportedRange,
  });

  const plan: Omit<UpgradePlanData, "written"> = {
    upstreamId: manifest.id,
    candidate: candidateRevision ? { revision: candidateRevision, publishedAt, digests } : null,
    baseline: {
      reviewedSource,
      reviewedGuidance,
    },
    changeSummary,
    retainedAdaptations: manifest.adaptations.map((adaptation) => ({ id: adaptation.id, description: adaptation.description, owner: adaptation.owner })),
    expectedLocalDiff,
    affectedOperations,
    newFeaturesNotSupported,
    requiredVerification,
    adoptionNotes: [...ADOPTION_NOTES],
    effectsUnchanged: true,
    providerCapabilityDelta,
    contributionManifest,
    unknowns: unique(unknowns),
  };

  let written: string | null = null;
  if (input.target) {
    mkdirSync(input.target, { recursive: true });
    const yamlPath = path.join(input.target, "contribution.yaml");
    writeFileSync(yamlPath, YAML.stringify(camelToSnake(contributionManifest), { lineWidth: 120 }), "utf8");
    writeFileSync(path.join(input.target, "ADOPTION_MAP.md"), renderAdoptionMap(plan), "utf8");
    written = yamlPath;
  }
  return { ...plan, written };
}
