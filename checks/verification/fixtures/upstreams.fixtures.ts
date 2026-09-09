/**
 * Upstream inventory, check, and upgrade-plan proofs (mandate proofs 13, 14, 15, and 18).
 *
 * Every value the service reports here comes from an authored manifest, a recorded observation,
 * or the recorded GitHub responses under checks/verification/test/data/upstreams/rork. The
 * injected `fetchText` serves those files by URL and throws for any other address, host probes
 * are fakes, and `globalThis.fetch` throws for the whole child, so a live call fails loudly
 * instead of passing quietly. The asynchronous proofs run in a child process (the harness `check`
 * callback is synchronous); the child prints one result row per proof and the parent turns each
 * into its own harness row, so a missing row fails the proof that owns it.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { contributionManifestSchema, upstreamManifestSchema, upstreamObservationSchema } from "../../../contracts/contribution/contract.js";
import { githubApiUrl, githubIdentity, githubRawUrl, RELEASE_PAGE_SIZE, type FetchText } from "../../../kernel/contribution/github-metadata.js";
import { checkContribution } from "../../../kernel/contribution/check.js";
import {
  checkUpstream,
  classifyLine,
  listUpstreams,
  LOCKFILE_COVERAGE_NOTE,
  upgradePlan,
  type UpstreamDependencies,
} from "../../../kernel/contribution/upstreams.js";
import {
  loadUpstreams,
  parseUpstreamManifest,
  parseUpstreamObservation,
  renderUpstreamManifestYaml,
  upstreamManifestPath,
  upstreamObservationPath,
  UPSTREAM_NOTICES_DIRECTORY,
  UPSTREAMS_DIRECTORY,
} from "../../../kernel/contribution/upstreams-load.js";
import type { CheckData, EvaluateData, UpstreamInventoryData, UpstreamInventoryRow } from "../../../kernel/contribution/types.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const RORK = "rork-app-store-connect-cli";
const SKILLS = "rork-app-store-connect-cli-skills";
const RECORDED_DIR = path.join(skillRoot, "checks/verification/test/data/upstreams/rork");
const REGISTRY_RELATIVE = "checks/validation/repository/source-registry.yaml";
const CONTRIBUTE_CLI = path.join(skillRoot, "entrypoints/cli/contribute.ts");
const B2C_CLI = path.join(skillRoot, "entrypoints/cli/b2c.mjs");
/** A fixed clock after the manifests' last_review so review.due is deterministic. */
const NOW = new Date("2026-09-05T22:00:00.000Z");
const RESULT_MARKER = "UPSTREAMS_RESULT ";

/** The four adoption notes every upgrade plan must carry, written out here so the proof does not compare a constant with itself. */
const FIXED_TRUTHS = [
  "Updating the builder's support claim does not upgrade any host binary; upgrade the executable separately and re-run the live probe.",
  "No active workspace pin changes; workspaces adopt through their authorized path.",
  "A newer binary authorizes no additional operations; unsupported_operations stay unsupported until reviewed.",
  "Historical receipts stay valid; unresolved external-effect reconciliation is unaffected by a binary rollback.",
] as const;

const PROOFS = {
  inventoryReal: "upstreams proof 13: the inventory reports only recorded baselines, releases, and executables",
  inventoryNoHost: "upstreams proof 13: an observation without a host block reports installed as not-observed",
  inventoryJoins: "upstreams proof 13: registry rows, knowledge citations, provider contracts, and coverage come from repository files",
  inventoryLockfile: "upstreams inventory: a direct-dependency alias resolves through package-lock.json and nothing else",
  inventoryUnknownSource: "upstreams inventory: a source id without a registry row is an issue, not a silent omission",
  checkNoFetch: "upstreams check: without --fetch the recorded observation is reused and the network is never touched",
  checkFetch: "upstreams proof 14: a recorded fetch reads four documents and classifies release lines against the support claim",
  checkFetchNoReleases: "upstreams check: a fetch that reads no release list stays unknown and never reports current",
  checkLicenseChanged: "upstreams check: a LICENSE whose digest differs from the manifest evidence is license drift and a risk review",
  classifierAdvisory: "upstreams classifier: advisory and credential wording outranks a dependency-bump or CI prefix",
  upgradePlanReal: "upstreams proof 14: the upgrade plan maps changes to operations and leaves the support contract untouched",
  hostDrift: "upstreams proof 15: two executables on PATH give a supported installed version and a shadowed second binary",
  hostProbeFailure: "upstreams proof 15: a failing version probe records a null version and names the executable",
  hostAbsent: "upstreams proof 15: no executable on PATH gives installed unknown and names the command",
  hostRefusesMutatingProbe: "upstreams proof 15: a manifest whose probe names a mutating verb is refused before any process starts",
  checkAbsent: "upstreams proof 15: a check with no fetch and no recorded observation reports unknown, never current",
  upgradePlanWrite: "upstreams proof 18: upgrade-plan --target writes a contribution root and changes nothing under the skill root",
  upgradePlanChecks: "upstreams proof 18: the written upgrade plan passes b2c contribute check and its evaluation cases are runnable",
  observationWrite: "upstreams write: a fetched observation validates against the schema and carries no URL",
  mcpRefusals: "upstreams MCP: fetch, write, and host observation are refused on the contributor MCP surface",
} as const;

interface ProofRow {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly skipped?: boolean;
}

/* ------------------------------------------------------------------------------------------ */
/* Helpers shared by the child proofs                                                          */
/* ------------------------------------------------------------------------------------------ */

const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function readManifest(root: string, id: string) {
  return parseUpstreamManifest(readFileSync(upstreamManifestPath(root, id), "utf8"), `${id}.yaml`);
}

function row(inventory: UpstreamInventoryData, id: string): UpstreamInventoryRow {
  const found = inventory.upstreams.find((entry) => entry.id === id);
  assert(found, `inventory row ${id} missing; rows: ${inventory.upstreams.map((entry) => entry.id).join(", ")}`);
  return found;
}

/** Serve the recorded GitHub responses by URL; every other address is refused and recorded. */
function recordedFetch(canonicalUrl: string, options: { withReleases?: boolean; prefix?: string } = {}): { fetchText: FetchText; requested: string[] } {
  const identity = githubIdentity(canonicalUrl);
  assert(identity, `${canonicalUrl} is not a github.com repository`);
  const prefix = options.prefix ?? "";
  const files = new Map<string, string>([
    [githubApiUrl(identity), `${prefix}repo.json`],
    [githubApiUrl(identity, `/commits/main`), `${prefix}commit-main.json`],
    [githubRawUrl(identity, "main", "LICENSE"), "LICENSE.txt"],
  ]);
  if (options.withReleases !== false) files.set(githubApiUrl(identity, `/releases?per_page=${RELEASE_PAGE_SIZE}`), "releases.json");
  const requested: string[] = [];
  const fetchText: FetchText = async (url) => {
    requested.push(url);
    const file = files.get(url);
    if (!file) throw new Error(`upstreams.fixture_fetch_refused: ${url}`);
    return { text: readFileSync(path.join(RECORDED_DIR, file), "utf8"), httpStatus: 200 };
  };
  return { fetchText, requested };
}

const refuseFetch: FetchText = async (url) => {
  throw new Error(`upstreams.fixture_fetch_refused: ${url}`);
};

function writeRegistry(root: string, ids: Iterable<string>): void {
  const file = path.join(root, REGISTRY_RELATIVE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `schema_version: 1\nsources:\n${[...ids].map((id) => `  - id: ${id}\n`).join("")}`, "utf8");
}

/** A temp skill root holding copies of the named manifests and their notices; observations only when asked. */
function copyUpstreamsRoot(root: string, ids: readonly string[], options: { observations?: boolean; registry?: boolean } = {}): string {
  mkdirSync(path.join(root, UPSTREAM_NOTICES_DIRECTORY), { recursive: true });
  const sourceIds = new Set<string>();
  for (const id of ids) {
    cpSync(upstreamManifestPath(skillRoot, id), upstreamManifestPath(root, id));
    const manifest = readManifest(skillRoot, id);
    for (const sourceId of manifest.sourceIds) sourceIds.add(sourceId);
    if (manifest.license.noticeFile) {
      mkdirSync(path.dirname(path.join(root, manifest.license.noticeFile)), { recursive: true });
      cpSync(path.join(skillRoot, manifest.license.noticeFile), path.join(root, manifest.license.noticeFile));
    }
    if (options.observations && existsSync(upstreamObservationPath(skillRoot, id))) {
      mkdirSync(path.dirname(upstreamObservationPath(root, id)), { recursive: true });
      cpSync(upstreamObservationPath(skillRoot, id), upstreamObservationPath(root, id));
    }
  }
  if (options.registry !== false) writeRegistry(root, sourceIds);
  return root;
}

function snapshotTree(root: string, directories: readonly string[]): Map<string, string> {
  const entries = new Map<string, string>();
  const walk = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) entries.set(path.relative(root, target), digest(readFileSync(target)));
    }
  };
  for (const directory of directories) walk(path.join(root, directory));
  return entries;
}

function treeDifferences(before: Map<string, string>, after: Map<string, string>): string[] {
  const differences: string[] = [];
  for (const [file, hash] of before) {
    if (!after.has(file)) differences.push(`removed ${file}`);
    else if (after.get(file) !== hash) differences.push(`changed ${file}`);
  }
  for (const file of after.keys()) if (!before.has(file)) differences.push(`added ${file}`);
  return differences;
}

function recordedLatestStableTag(): string {
  const releases = JSON.parse(readFileSync(path.join(RECORDED_DIR, "releases.json"), "utf8")) as Array<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
  }>;
  const stable = releases.find((release) => !release.draft && !release.prerelease);
  assert(stable, "recorded releases.json has no stable release");
  return stable.tag_name;
}

function realDeps(overrides: Partial<UpstreamDependencies> = {}): UpstreamDependencies {
  return { skillRoot, now: () => NOW, fetchText: refuseFetch, ...overrides };
}

/** Fake host probes: two executables in PATH order, the second under a Homebrew prefix. */
function fakeHost(
  versions: Record<string, { stdout: string; status: number | null }>,
  executables: string[],
): Pick<UpstreamDependencies, "probeExecutables" | "runVersion" | "hashFile"> {
  return {
    probeExecutables: (command) => executables.filter((file) => path.basename(file) === command).map((file, index) => ({ path: file, pathOrder: index })),
    runVersion: (file, args) => {
      const entry = versions[file];
      if (!entry) throw new Error(`unexpected probe of ${file}`);
      assert(args.length === 1 && args[0] === "--version", `probe args must be the manifest's declared args, got ${args.join(" ")}`);
      return { stdout: entry.stdout, stderr: "", status: entry.status };
    },
    hashFile: (file) => digest(`bytes of ${file}`),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Child: the proofs                                                                           */
/* ------------------------------------------------------------------------------------------ */

async function prove(): Promise<void> {
  globalThis.fetch = (() => {
    throw new Error("upstreams.fixture_network_disabled");
  }) as typeof fetch;
  const proofRoot = process.env.UPSTREAMS_PROOF_ROOT;
  assert(proofRoot, "UPSTREAMS_PROOF_ROOT must name the parent's temp directory");
  const emit = (proofRow: ProofRow): void => {
    process.stdout.write(`${RESULT_MARKER}${JSON.stringify(proofRow)}\n`);
  };
  type Skip = { readonly skip: string };
  const proofCase = async (label: string, fn: () => Promise<void | Skip> | void | Skip): Promise<void> => {
    try {
      const outcome = await fn();
      if (outcome && typeof outcome === "object" && "skip" in outcome) emit({ label, ok: true, skipped: true, detail: outcome.skip });
      else emit({ label, ok: true, detail: "" });
    } catch (error) {
      emit({ label, ok: false, detail: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    }
  };
  const tempDir = (name: string): string => {
    const dir = path.join(proofRoot, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  };

  const rorkManifest = readManifest(skillRoot, RORK);
  const skillsManifest = readManifest(skillRoot, SKILLS);
  const recordedObservation = parseUpstreamObservation(readFileSync(upstreamObservationPath(skillRoot, RORK), "utf8"));
  const recordedTag = recordedLatestStableTag();
  const rorkOperationIds = rorkManifest.support.operations.map((operation) => operation.id);

  await proofCase(PROOFS.inventoryReal, () => {
    const inventory = listUpstreams(realDeps(), {});
    const rork = row(inventory, RORK);
    assert(rork.reviewedSource === "5.1.0", `reviewedSource ${rork.reviewedSource}`);
    assert(rork.reviewedGuidance === "5.1.0", `reviewedGuidance ${rork.reviewedGuidance}`);
    assert(recordedObservation.latestStable, "the recorded observation carries a stable release");
    assert(rork.latestStable !== "unknown", "latestStable must come from the recorded observation");
    assert(
      rork.latestStable.tag === recordedObservation.latestStable.tag && rork.latestStable.checkedAt === recordedObservation.checkedAt,
      "latestStable tag and checkedAt must match the recorded observation",
    );
    assert(rork.branchHead !== "unknown" && rork.branchHead.sha === recordedObservation.branchHead?.sha, "branchHead comes from the recorded observation");
    // The recorded observation carries a host block, so installed is that record and is labeled as not re-probed.
    assert(recordedObservation.host, "the recorded observation carries a host block");
    assert(typeof rork.installed === "object", `installed should be the recorded host, got ${JSON.stringify(rork.installed)}`);
    assert(rork.installed.path === recordedObservation.host.selected, "installed path is the recorded selected executable");
    assert(rork.installed.shadowed.length === recordedObservation.host.executables.length - 1, "every other recorded executable is listed as shadowed");
    assert(
      rork.unknowns.some((item) => item.includes("not re-probed")),
      `unknowns must say the host was not re-probed: ${rork.unknowns.join(" | ")}`,
    );
    assert(rork.review.due === false && rork.review.cadenceDays === rorkManifest.review.cadenceDays, "review.due is measured against the injected clock");
    assert(rork.license.noticeRetained === true, "the retained notice is reported");

    const skills = row(inventory, SKILLS);
    assert(skills.reviewedGuidance === "unrecorded", `skills reviewedGuidance ${skills.reviewedGuidance}`);
    assert(skills.reviewedSource === "unknown", `skills reviewedSource ${skills.reviewedSource}`);
    assert(skills.installed === "not-observed", `skills installed ${JSON.stringify(skills.installed)}`);
    assert(skills.latestStable === "unknown" && skills.branchHead === "unknown", "skills has no observation, so latest and head stay unknown");
    assert(!JSON.stringify(skills).includes(recordedTag), `the skills row must not borrow ${recordedTag} from another upstream`);
    assert(
      skills.unknowns.some((item) => item.includes("no recorded observation")),
      "skills unknowns name the missing observation",
    );
  });

  await proofCase(PROOFS.inventoryNoHost, async () => {
    const root = copyUpstreamsRoot(tempDir("inventory-no-host"), [RORK, SKILLS]);
    const { fetchText } = recordedFetch(rorkManifest.canonicalUrl);
    const check = await checkUpstream({ skillRoot: root, now: () => NOW, fetchText }, { upstreamId: RORK, fetch: true, write: true });
    assert(check.written === upstreamObservationPath(root, RORK), `written ${check.written}`);
    assert(check.observation.host === null, "no host was probed, so the written observation has no host block");
    const inventory = listUpstreams({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, {});
    const rork = row(inventory, RORK);
    assert(rork.installed === "not-observed", `installed ${JSON.stringify(rork.installed)}`);
    assert(rork.latestStable !== "unknown" && rork.latestStable.tag === recordedTag, "latestStable comes from the observation just recorded");
    assert(rork.reviewedSource === "5.1.0" && rork.reviewedGuidance === "5.1.0", "baselines come from the manifest");
    const skills = row(inventory, SKILLS);
    assert(
      skills.installed === "not-observed" && skills.latestStable === "unknown" && skills.reviewedGuidance === "unrecorded",
      "the skills row stays unrecorded and unobserved",
    );
    assert(!JSON.stringify(skills).includes(recordedTag), "the skills row carries no borrowed version");
  });

  await proofCase(PROOFS.inventoryJoins, () => {
    const inventory = listUpstreams(realDeps(), {});
    const rork = row(inventory, RORK);
    assert(rork.registrySourceIds.length === rorkManifest.sourceIds.length, `every cited source id has a registry row: ${rork.registrySourceIds.join(", ")}`);
    assert(!inventory.issues.some((issue) => issue.code === "upstreams.source_id_unknown"), "the shipped manifests cite registered sources only");
    const knowledge = YAML.parse(readFileSync(path.join(skillRoot, "catalog/knowledge/store/store-app-store-connect-cli.yaml"), "utf8")) as { id: string };
    assert(rork.citingReferenceIds.includes(knowledge.id), `knowledge package ${knowledge.id} cites the upstream: ${rork.citingReferenceIds.join(", ")}`);
    assert(row(inventory, SKILLS).citingReferenceIds.includes(knowledge.id), "the skills upstream is cited through upstream_id");
    const packageJson = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    assert(inventory.coverage.lockfileDependencies === Object.keys(packageJson.dependencies ?? {}).length, "coverage counts root package.json dependencies");
    assert(inventory.coverage.manifests === loadUpstreams(skillRoot).upstreams.length, "coverage counts every authored manifest");
    assert(inventory.coverage.note === LOCKFILE_COVERAGE_NOTE, "coverage states the lockfile boundary");
    const snapshot = JSON.parse(readFileSync(path.join(skillRoot, "docs/source-freshness/source-snapshots/current.json"), "utf8")) as {
      sources: Array<{ id: string }>;
    };
    const snapped = new Set(snapshot.sources.map((source) => source.id));
    const expectSnapped = rorkManifest.sourceIds.some((id) => snapped.has(id));
    assert(
      expectSnapped ? rork.snapshot !== "unsnapped" : rork.snapshot === "unsnapped",
      `snapshot state ${JSON.stringify(rork.snapshot)} must follow the snapshot file`,
    );
    assert(rork.lockfile === null, "an external executable has no lockfile row");
    assert(
      inventory.upstreams.every((entry) => entry.unknowns.length > 0),
      "every row states what was not observed",
    );
  });

  await proofCase(PROOFS.inventoryLockfile, () => {
    const root = tempDir("inventory-lockfile");
    mkdirSync(path.join(root, UPSTREAMS_DIRECTORY), { recursive: true });
    const manifest = upstreamManifestSchema.parse({
      schemaVersion: 1,
      id: "synthetic-dep",
      project: "Synthetic dependency (fixture)",
      canonicalUrl: "https://example.invalid/synthetic-dep",
      aliases: ["synthetic-dep-package"],
      authors: [{ name: "Fixture Author", role: "author" }],
      license: { spdx: "MIT", status: "unverified" },
      sourceIds: ["synthetic-dep-source"],
      relationships: [
        { kind: "direct-dependency", consumption: "Imported by the fixture only.", localOwners: ["package.json"], pinAuthority: "package-lock.json" },
      ],
      baselines: {},
      support: { policy: "Fixture only.", versions: [], operations: [] },
      review: { owner: "fixture", cadenceDays: 30, lastReview: "2026-09-01", status: "current" },
      credits: { acknowledge: false, use: "direct", summary: "Fixture dependency; never rendered." },
    });
    writeFileSync(upstreamManifestPath(root, manifest.id), renderUpstreamManifestYaml(manifest), "utf8");
    writeRegistry(root, ["synthetic-dep-source"]);
    writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "fixture", dependencies: { "synthetic-dep-package": "^1.0.0" } })}\n`, "utf8");
    const noLock = row(listUpstreams({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, {}), manifest.id);
    assert(noLock.lockfile === null, "without a lockfile no resolved version is reported");
    assert(
      noLock.unknowns.some((item) => item.includes("package-lock.json not found")),
      `unknowns name the missing lockfile: ${noLock.unknowns.join(" | ")}`,
    );
    writeFileSync(
      path.join(root, "package-lock.json"),
      `${JSON.stringify({ packages: { "": { dependencies: { "synthetic-dep-package": "^1.0.0" } }, "node_modules/synthetic-dep-package": { version: "1.4.2" } } })}\n`,
      "utf8",
    );
    const inventory = listUpstreams({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, {});
    const resolved = row(inventory, manifest.id);
    assert(
      resolved.lockfile !== null &&
        resolved.lockfile.name === "synthetic-dep-package" &&
        resolved.lockfile.resolved === "1.4.2" &&
        resolved.lockfile.authority === "package-lock.json",
      `lockfile row ${JSON.stringify(resolved.lockfile)}`,
    );
    assert(inventory.coverage.lockfileDependencies === 1, "coverage counts the one direct dependency");
    assert(resolved.latestStable === "unknown" && resolved.installed === "not-observed", "the lockfile row never invents a release or a host executable");
  });

  await proofCase(PROOFS.inventoryUnknownSource, () => {
    const root = copyUpstreamsRoot(tempDir("inventory-unknown-source"), [SKILLS], { registry: false });
    writeRegistry(root, []);
    const inventory = listUpstreams({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, { upstreamId: SKILLS });
    const issue = inventory.issues.find((entry) => entry.code === "upstreams.source_id_unknown");
    assert(issue, `expected upstreams.source_id_unknown, got ${inventory.issues.map((entry) => entry.code).join(", ") || "no issues"}`);
    assert(issue.message.includes(skillsManifest.sourceIds[0]!), "the issue names the unregistered source id");
    const skills = row(inventory, SKILLS);
    assert(
      skills.registrySourceIds.length === 0 && skills.unknowns.some((item) => item.includes("no source-registry row")),
      "the row lists no registry id and states the gap",
    );
    let threw = false;
    try {
      listUpstreams({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, { upstreamId: "no-such-upstream" });
    } catch (error) {
      threw = error instanceof Error && error.message === "upstreams.unknown_upstream: no-such-upstream";
    }
    assert(threw, "an unknown upstream id throws upstreams.unknown_upstream");
  });

  await proofCase(PROOFS.checkNoFetch, async () => {
    const before = digest(readFileSync(upstreamObservationPath(skillRoot, RORK)));
    const check = await checkUpstream(realDeps(), { upstreamId: RORK });
    assert(check.networkUsed === false && check.written === null, "no fetch and no write");
    assert(check.observation.checkedAt === recordedObservation.checkedAt, "the recorded observation is reused as recorded");
    assert(
      check.unknowns.some((item) => item.includes("fetch not requested")),
      `unknowns say the observation was not refreshed: ${check.unknowns.join(" | ")}`,
    );
    assert(
      check.changes.length === 0 || check.changes.every((change) => change.confidence === "heuristic" && change.maintainerDecision === "pending"),
      "classification is heuristic and pending, or empty when reviewed guidance already tracks latest stable",
    );
    assert(digest(readFileSync(upstreamObservationPath(skillRoot, RORK))) === before, "the recorded observation file is untouched");
  });

  await proofCase(PROOFS.checkFetch, async () => {
    const root = copyUpstreamsRoot(tempDir("check-fetch-lagged-baseline"), [RORK, SKILLS], { observations: true });
    const copiedManifest = upstreamManifestPath(root, RORK);
    const lagged = readFileSync(copiedManifest, "utf8")
      .replace(/reviewed_source:\n    revision: "5\.1\.0"\n    observed_at: "2026-09-08"/u, 'reviewed_source:\n    revision: "4.4.3"\n    observed_at: "2026-08-17"')
      .replace(/reviewed_guidance:\n    revision: "5\.1\.0"\n    observed_at: "2026-09-08"/u, 'reviewed_guidance:\n    revision: "4.9.0"\n    observed_at: "2026-08-24"');
    assert(lagged.includes('revision: "4.9.0"'), "classification proof needs a lagged reviewed_guidance against the recorded 4.x notes");
    writeFileSync(copiedManifest, lagged);
    const { fetchText, requested } = recordedFetch(rorkManifest.canonicalUrl);
    const before = digest(readFileSync(upstreamObservationPath(skillRoot, RORK)));
    const check = await checkUpstream({ skillRoot: root, now: () => NOW, fetchText }, { upstreamId: RORK, fetch: true });
    assert(requested.length === 4 && new Set(requested).size === 4, `exactly four documents are read, got ${requested.length}`);
    assert(check.networkUsed === true && check.written === null, "fetch used, nothing written");
    assert(check.observation.method === "github-api", "the observation records its method");
    assert(check.observation.latestStable, "a stable release was read");
    assert(check.observation.latestStable.tag === recordedTag, `latestStable ${check.observation.latestStable.tag}`);
    assert(check.observation.latestStable.assets.filter((asset) => asset.sha256).length === 6, "asset digests come from the release asset digests");
    const commit = JSON.parse(readFileSync(path.join(RECORDED_DIR, "commit-main.json"), "utf8")) as { sha: string };
    assert(check.observation.branchHead?.sha === commit.sha, "branchHead is the recorded main commit");
    assert(
      check.observation.licenseSha256 === rorkManifest.license.evidenceSha256 && check.drift.licenseChanged === false,
      "the recorded LICENSE matches the manifest evidence digest",
    );
    assert(check.observation.archived === false && check.drift.branchAheadOfRelease === true, "archived and branch-ahead come from the recorded records");
    assert(
      check.observation.releasesSinceBaseline.length === 6,
      `releases since 4.9.0: ${check.observation.releasesSinceBaseline.map((release) => release.tag).join(", ")}`,
    );
    assert(
      check.observation.releasesSinceBaseline.every((release) => !release.summary.includes("http") && !/@[A-Za-z0-9_-]+\s+in\b/u.test(release.summary)),
      "summaries carry no URL and no author handle attribution",
    );
    assert(!("url" in check.observation.latestStable), "the release page address is not stored");
    const relevant = check.changes.filter((change) => change.classification === "relevant-to-supported");
    assert(relevant.length > 0 && relevant.every((change) => change.matchedOperations.length > 0), "relevant items name the operations they matched");
    assert(
      relevant.every((change) => change.matchedOperations.every((id) => rorkOperationIds.includes(id))),
      "matched operations exist in the manifest",
    );
    const submission = check.changes.find((change) => change.line === "Add deep submission validation in [link]");
    assert(
      submission?.classification === "relevant-to-supported" && submission.matchedOperations.includes("asc.review.status"),
      `submission line ${JSON.stringify(submission)}`,
    );
    const feature = check.changes.find((change) => change.line.startsWith("feat(product-pages)"));
    assert(feature?.classification === "new-capability" && feature.matchedOperations.length === 0, `feat line ${JSON.stringify(feature)}`);
    const wall = check.changes.filter((change) => change.line.startsWith("apps wall"));
    const deps = check.changes.filter((change) => change.line.startsWith("build(deps)"));
    assert(wall.length > 0 && wall.every((change) => change.classification === "irrelevant"), "apps wall lines are irrelevant");
    assert(deps.length > 0 && deps.every((change) => change.classification === "irrelevant"), "dependency bump lines are irrelevant");
    const auth = check.changes.find((change) => change.line.startsWith("fix(auth)"));
    assert(auth?.classification === "behavior-change-review", `auth line ${JSON.stringify(auth)}`);
    assert(!check.changes.some((change) => change.classification === "security-or-rights-review"), "the recorded notes carry no security line");
    assert(check.recommendation === "prepare-upgrade-plan", `recommendation ${check.recommendation}`);
    const reviewOwners = rorkManifest.support.operations.find((operation) => operation.id === "asc.review.status")?.owners ?? [];
    assert(
      reviewOwners.every((owner) => check.affectedLocalOwners.includes(owner)),
      "owners of matched operations are affected",
    );
    assert(
      rorkManifest.relationships.every((relationship) => relationship.localOwners.every((owner) => check.affectedLocalOwners.includes(owner))),
      "relationship owners are affected",
    );
    assert(
      check.observation.host?.observedAt === recordedObservation.host?.observedAt && check.drift.installedVersusSupported === "supported",
      "the recorded host block is carried forward, not re-probed, and 5.1.0 is inside the supported range",
    );
    assert(digest(readFileSync(upstreamObservationPath(skillRoot, RORK))) === before, "a fetch without --write leaves the recorded observation alone");
  });

  await proofCase(PROOFS.checkFetchNoReleases, async () => {
    const { fetchText, requested } = recordedFetch(skillsManifest.canonicalUrl, { withReleases: false, prefix: "skills-" });
    const check = await checkUpstream(realDeps({ fetchText }), { upstreamId: SKILLS, fetch: true });
    assert(requested.length === 4, `four reads attempted, got ${requested.length}`);
    assert(check.observation.latestStable === null && check.observation.releasesSinceBaseline.length === 0, "no release data was read");
    assert(
      check.observation.unknowns.some((item) => item.startsWith("release list not observed")),
      `unknowns record the failed read: ${check.observation.unknowns.join(" | ")}`,
    );
    assert(check.recommendation === "unknown", `recommendation ${check.recommendation}`);
    assert(check.drift.installedVersusLatest === "not-observed" && check.drift.installedVersusSupported === "not-observed", "no executable was probed");
    assert(
      check.observation.branchHead !== null && check.drift.branchAheadOfRelease === null,
      "branch head is known but cannot be compared to an unknown release",
    );
    assert(check.observation.licenseChanged === false, "the skills LICENSE digest matches its manifest evidence");
  });

  await proofCase(PROOFS.checkLicenseChanged, async () => {
    const identity = githubIdentity(rorkManifest.canonicalUrl);
    assert(identity, "the rork manifest names a github.com repository");
    const licenseUrl = githubRawUrl(identity, "main", "LICENSE");
    const recorded = recordedFetch(rorkManifest.canonicalUrl);
    const altered = `${readFileSync(path.join(RECORDED_DIR, "LICENSE.txt"), "utf8")}\nAdditional clause the reviewed license never carried.\n`;
    const fetchText: FetchText = async (url) => (url === licenseUrl ? { text: altered, httpStatus: 200 } : recorded.fetchText(url));
    const check = await checkUpstream(realDeps({ fetchText }), { upstreamId: RORK, fetch: true });
    assert(check.observation.licenseSha256 === digest(altered), "the observation digests the bytes that were read");
    assert(check.observation.licenseSha256 !== rorkManifest.license.evidenceSha256, "the altered LICENSE differs from the manifest evidence");
    assert(check.observation.licenseChanged === true, `observation.licenseChanged ${check.observation.licenseChanged}`);
    assert(check.drift.licenseChanged === true, `drift.licenseChanged ${check.drift.licenseChanged}`);
    assert(check.recommendation === "risk-review", `recommendation ${check.recommendation}`);
    assert(check.written === null, "nothing is written without --write");
  });

  await proofCase(PROOFS.classifierAdvisory, () => {
    const operations = rorkManifest.support.operations;
    const expect = (line: string, allowed: readonly string[]): void => {
      const { classification } = classifyLine(line, operations);
      assert(allowed.includes(classification), `${JSON.stringify(line)} classified ${classification}; expected one of ${allowed.join(", ")}`);
    };
    expect("build(deps): bump foo to fix GHSA-xxxx-xxxx-xxxx", ["security-or-rights-review"]);
    expect("ci: security advisory follow-up for the release pipeline", ["security-or-rights-review"]);
    expect("build(deps): dependabot security update for bar", ["security-or-rights-review"]);
    expect("ci: rotate auth token handling", ["behavior-change-review", "security-or-rights-review"]);
    expect("ci: send telemetry from the release workflow", ["behavior-change-review", "security-or-rights-review"]);
    // A module path segment named credentials is a package name, not a behavior; the bump stays noise.
    expect("build(deps): bump github.com/aws/aws-sdk-go-v2/credentials from 1.19.36 to 1.19.37 in [link]", ["irrelevant"]);
    expect("apps wall: add TapTape in [link]", ["irrelevant"]);
    expect("build(deps): bump github.com/aws/smithy-go from 1.27.8 to 1.27.10 in [link]", ["irrelevant"]);
  });

  await proofCase(PROOFS.upgradePlanReal, () => {
    const manifestFile = upstreamManifestPath(skillRoot, RORK);
    const before = digest(readFileSync(manifestFile));
    const plan = upgradePlan(realDeps(), { upstreamId: RORK });
    assert(
      plan.candidate != null &&
        plan.candidate.revision === recordedObservation.latestStable?.tag &&
        plan.candidate.digests.length === 6,
      `candidate ${JSON.stringify(plan.candidate)}`,
    );
    assert(
      plan.unknowns.some((item) => item.includes("no releases since baseline")),
      `when reviewed guidance tracks latest stable, the plan must say so: ${plan.unknowns.join(" | ")}`,
    );
    assert(
      plan.affectedOperations.every((id) => rorkOperationIds.includes(id)),
      `affected operations ${plan.affectedOperations.join(", ")}`,
    );
    assert(plan.effectsUnchanged === true, "effects are unchanged");
    assert(plan.written === null, "no target, nothing written");
    const parsed = contributionManifestSchema.parse(plan.contributionManifest);
    assert(parsed.sources.length === 1 && parsed.sources[0]!.upstreamId === RORK, "one source record for the upstream");
    assert(
      parsed.scope === "maintenance" && parsed.routing.verdict === "maintenance" && parsed.routing.reason.includes("adapters/app-review/asc-provider.ts"),
      `an upgrade plan that edits maintainer-owned owners is maintenance and names them: ${parsed.scope} / ${parsed.routing.reason}`,
    );
    assert(
      parsed.sources[0]!.publisher === rorkManifest.authors[0]!.name && parsed.sources[0]!.revision === recordedObservation.latestStable?.tag,
      "the source keeps the original author and the candidate revision",
    );
    assert(
      parsed.sources[0]!.retrieval.status === "excerpt" && parsed.sources[0]!.retrieval.method?.includes(recordedObservation.checkedAt),
      `the recorded observation is release metadata and a license digest, so retrieval is an excerpt and names the method: ${JSON.stringify(parsed.sources[0]!.retrieval)}`,
    );
    const adapt = parsed.units.find((unit) => unit.disposition === "adapt");
    assert(
      adapt?.target.kind === "existing-reference" &&
        adapt.target.id === "reference.store.app-store-connect-cli" &&
        adapt.target.path === "knowledge/store/app-store-connect-cli.md",
      `the adapt unit names the knowledge package that owns its path: ${JSON.stringify(adapt?.target)}`,
    );
    const wrap = parsed.units.find((unit) => unit.disposition === "wrap");
    assert(
      wrap?.target.path && parsed.notices.length === 1 && parsed.notices[0]!.covers.includes(wrap.target.path),
      "the retained notice covers the wrapped executable's owner",
    );
    assert(
      parsed.notices[0]!.noticePath === rorkManifest.license.noticeFile &&
        parsed.notices[0]!.copyright === rorkManifest.copyright &&
        parsed.notices[0]!.sourceId === RORK,
      `the notice entry comes from the manifest: ${JSON.stringify(parsed.notices[0])}`,
    );
    const commands = parsed.evaluations.map((item) => item.command);
    assert(
      commands.includes("npx tsx checks/validation/business/store/check-asc-command-contract.ts --skill-root .") &&
        commands.includes("npm run check:upstreams") &&
        commands.includes("checks/validation/repository/evals/launchbench/asc-flag-drift-runtime.yaml") &&
        commands.includes("npm run test:validators"),
      `evaluation commands are runnable forms, not unit titles: ${commands.join(" | ")}`,
    );
    assert(
      parsed.evaluations.every((item) => item.kind === "command" && item.command && !/^checks\/.*\.ts$/u.test(item.command)),
      "no evaluation case names a bare script path as its command",
    );
    const implementation = parsed.units.filter((unit) => unit.kind === "implementation");
    assert(implementation.length === rorkManifest.relationships.length, "one implementation unit per relationship");
    assert(
      implementation
        .map((unit) => unit.disposition)
        .sort()
        .join(",") === "adapt,wrap",
      `dispositions ${implementation.map((unit) => unit.disposition).join(",")}`,
    );
    assert(
      parsed.units.filter((unit) => unit.kind === "evaluation").every((unit) => unit.upstream === null && unit.disposition === "original"),
      "evaluation units are original",
    );
    for (const command of ["npm run check:upstreams", "npm run check:asc-command-contract", "npm run check:credits"]) {
      assert(plan.requiredVerification.includes(command), `required verification lists ${command}`);
    }
    assert(plan.retainedAdaptations.length === rorkManifest.adaptations.length, "every adaptation is retained");
    assert(
      plan.expectedLocalDiff.some((entry) => entry.path === `${UPSTREAMS_DIRECTORY}/${RORK}.yaml`),
      "the manifest baseline is part of the expected diff",
    );
    assert(digest(readFileSync(manifestFile)) === before, "the manifest file is unchanged by the plan");
    const after = readManifest(skillRoot, RORK);
    assert(
      JSON.stringify(after.support.unsupportedOperations) === JSON.stringify(rorkManifest.support.unsupportedOperations),
      "unsupported operations are unchanged",
    );
    assert(
      !plan.affectedOperations.some((id) => after.support.unsupportedOperations.some((operation) => operation.id === id)),
      "no unsupported operation becomes affected or supported",
    );
  });

  const executables = ["/fixture/bin/asc", "/opt/homebrew/bin/asc"] as const;
  const [first, second] = executables;

  await proofCase(PROOFS.hostDrift, async () => {
    const host = fakeHost({ [first]: { stdout: "5.1.0 (fixture build)\n", status: 0 }, [second]: { stdout: "2.8.1\n", status: 0 } }, [...executables]);
    const check = await checkUpstream(realDeps(host), { upstreamId: RORK, observeHost: true });
    assert(check.networkUsed === false, "host observation never fetches");
    assert(check.observation.host?.selected === first, `selected ${check.observation.host?.selected}`);
    const probed = check.observation.host.executables;
    assert(probed.length === 2 && probed[0]!.version === "5.1.0" && probed[1]!.version === "2.8.1", `versions ${JSON.stringify(probed)}`);
    assert(probed[0]!.pathOrder === 0 && probed[1]!.pathOrder === 1, "PATH order is recorded");
    assert(probed[1]!.manager === "homebrew" && probed[0]!.manager === undefined, "a Homebrew prefix is labeled from its path alone");
    assert(
      probed.every((executable) => executable.sha256 === digest(`bytes of ${executable.path}`)),
      "digests come from the injected hasher",
    );
    assert(check.drift.installedVersusSupported === "supported", `installedVersusSupported ${check.drift.installedVersusSupported}`);
    assert(check.drift.installedVersusLatest === "current", `installedVersusLatest ${check.drift.installedVersusLatest}`);
    assert(
      check.drift.shadowedExecutables.length === 1 && check.drift.shadowedExecutables[0] === second,
      `shadowed ${check.drift.shadowedExecutables.join(", ")}`,
    );
    const inventory = listUpstreams(realDeps(host), { upstreamId: RORK, observeHost: true });
    const inventoryRow = row(inventory, RORK);
    assert(
      typeof inventoryRow.installed === "object" && inventoryRow.installed.version === "5.1.0" && inventoryRow.installed.shadowed[0] === second,
      "the inventory reports the same probe",
    );
  });

  await proofCase(PROOFS.hostProbeFailure, async () => {
    const host = fakeHost({ [first]: { stdout: "5.1.0\n", status: 0 }, [second]: { stdout: "", status: 1 } }, [...executables]);
    const check = await checkUpstream(realDeps(host), { upstreamId: RORK, observeHost: true });
    const failed = check.observation.host?.executables.find((executable) => executable.path === second);
    assert(failed && failed.version === null, `failed probe version ${JSON.stringify(failed)}`);
    assert(
      check.unknowns.some((item) => item.includes(second) && item.includes("exited with status 1")),
      `unknowns name the failed probe: ${check.unknowns.join(" | ")}`,
    );
    assert(
      check.observation.unknowns.some((item) => item.includes(second)),
      "the observation itself records the failed probe",
    );
    assert(check.drift.installedVersusSupported === "supported", "the selected executable still classifies on its own version");
  });

  await proofCase(PROOFS.hostAbsent, async () => {
    const host = fakeHost({}, []);
    const check = await checkUpstream(realDeps(host), { upstreamId: RORK, observeHost: true });
    assert(
      check.observation.host !== null && check.observation.host.executables.length === 0 && check.observation.host.selected === null,
      "an empty PATH result is recorded, not omitted",
    );
    assert(check.drift.installedVersusSupported === "unknown" && check.drift.installedVersusLatest === "unknown", `drift ${JSON.stringify(check.drift)}`);
    assert(
      check.unknowns.some((item) => item.includes("no executable named asc found on PATH")),
      `unknowns name the command: ${check.unknowns.join(" | ")}`,
    );
    const inventoryRow = row(listUpstreams(realDeps(host), { upstreamId: RORK, observeHost: true }), RORK);
    assert(inventoryRow.installed === "unknown", `inventory installed ${JSON.stringify(inventoryRow.installed)}`);
    assert(
      inventoryRow.unknowns.some((item) => item.includes("no executable named asc")),
      "the inventory names the missing command",
    );
  });

  await proofCase(PROOFS.hostRefusesMutatingProbe, async () => {
    const root = copyUpstreamsRoot(tempDir("host-refuses"), [RORK]);
    const file = upstreamManifestPath(root, RORK);
    const text = readFileSync(file, "utf8");
    assert(text.includes('args: ["--version"]'), "the copied manifest declares the version probe");
    writeFileSync(file, text.replace('args: ["--version"]', 'args: ["upgrade"]'), "utf8");
    let started = false;
    const host = { ...fakeHost({}, [...executables]), runVersion: () => ((started = true), { stdout: "", stderr: "", status: 0 }) };
    let message = "";
    try {
      await checkUpstream({ skillRoot: root, now: () => NOW, fetchText: refuseFetch, ...host }, { upstreamId: RORK, observeHost: true });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert(message.startsWith("upstreams.host_probe_refused"), `expected a refusal, got ${message || "no error"}`);
    assert(started === false, "no process was started");
  });

  await proofCase(PROOFS.checkAbsent, async () => {
    const root = copyUpstreamsRoot(tempDir("check-absent"), [SKILLS]);
    assert(!existsSync(upstreamObservationPath(root, SKILLS)), "the temp root has no observation");
    const check = await checkUpstream({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, { upstreamId: SKILLS });
    assert(check.observation.latestStable === null && check.observation.branchHead === null, "nothing is known about the release or the head");
    assert(check.recommendation === "unknown", `recommendation ${check.recommendation}`);
    assert(check.unknowns.includes("no release data: fetch not requested and no recorded observation"), `unknowns ${check.unknowns.join(" | ")}`);
    assert(check.drift.installedVersusLatest !== "current" && check.drift.installedVersusSupported === "not-observed", "an absent check never reports current");
    assert(check.changes.length === 0 && check.affectedLocalOwners.length === 0, "no changes are invented");
    assert(check.written === null && !existsSync(upstreamObservationPath(root, SKILLS)), "nothing is written without --write");
    const plan = upgradePlan({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, { upstreamId: SKILLS });
    assert(
      plan.candidate === null && plan.unknowns.includes("candidate revision unknown; run upstream-check --fetch"),
      `plan without an observation: ${plan.unknowns.join(" | ")}`,
    );
  });

  await proofCase(PROOFS.upgradePlanWrite, () => {
    const watched = ["catalog", "kernel", "knowledge"] as const;
    const target = path.join(tempDir("upgrade-plan-target"), "contribution");
    const before = snapshotTree(skillRoot, watched);
    const plan = upgradePlan(realDeps(), { upstreamId: RORK, target });
    const after = snapshotTree(skillRoot, watched);
    const differences = treeDifferences(before, after);
    assert(differences.length === 0, `skill root changed: ${differences.slice(0, 10).join("; ")}`);
    assert(plan.written === path.join(target, "contribution.yaml") && existsSync(plan.written), `written ${plan.written}`);
    const yamlText = readFileSync(plan.written, "utf8");
    const parsed = YAML.parse(yamlText) as { api_version?: string; id?: string; units?: unknown[] };
    assert(
      parsed.api_version === "b2c.contribution/v1" && parsed.id === plan.contributionManifest.id && Array.isArray(parsed.units),
      "contribution.yaml is the snake_case manifest",
    );
    assert(!yamlText.includes("apiVersion"), "the written YAML uses snake_case keys");
    const adoptionMap = readFileSync(path.join(target, "ADOPTION_MAP.md"), "utf8");
    assert(adoptionMap.includes("| Unit | Kind | Disposition | Target | Verification |"), "ADOPTION_MAP.md carries the unit table");
    for (const truth of FIXED_TRUTHS) {
      assert(plan.adoptionNotes.includes(truth), `adoption note missing: ${truth}`);
      assert(adoptionMap.includes(truth), `ADOPTION_MAP.md missing: ${truth}`);
    }
    assert(plan.adoptionNotes.length === FIXED_TRUTHS.length, "no extra adoption note is invented");
  });

  await proofCase(PROOFS.upgradePlanChecks, async () => {
    const target = path.join(tempDir("upgrade-plan-checks"), "contribution");
    const plan = upgradePlan(realDeps(), { upstreamId: RORK, target });
    assert(plan.written && existsSync(plan.written), "the plan was written");
    const checked = checkContribution(target, { skillRoot, now: () => NOW });
    const errors = checked.issues.filter((issue) => issue.severity === "error");
    assert(checked.pass === true && errors.length === 0, `contribute check must pass: ${JSON.stringify(checked.issues)}`);
    const cliEnv = { ...process.env, B2C_APP_BUILDER_CALLER_CWD: skillRoot };
    const cliCheck = spawnSync(process.execPath, [B2C_CLI, "contribute", "check", "--target", target, "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 120_000,
      env: cliEnv,
    });
    assert(cliCheck.status === 0, `b2c contribute check exited ${cliCheck.status}\n${`${cliCheck.stdout}\n${cliCheck.stderr}`.trim().slice(-1500)}`);
    const checkEnvelope = JSON.parse(cliCheck.stdout.slice(cliCheck.stdout.indexOf("{"))) as { ok: boolean; data?: CheckData };
    assert(checkEnvelope.ok && checkEnvelope.data?.pass === true, "the CLI check envelope reports pass");
    // Without --allow-commands every command case is refused and the scenario lints pass; nothing runs.
    const cliEvaluate = spawnSync(process.execPath, [B2C_CLI, "contribute", "evaluate", "--target", target, "--json"], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 120_000,
      env: cliEnv,
    });
    assert(
      cliEvaluate.status === 0,
      `b2c contribute evaluate exited ${cliEvaluate.status}\n${`${cliEvaluate.stdout}\n${cliEvaluate.stderr}`.trim().slice(-1500)}`,
    );
    const evaluateEnvelope = JSON.parse(cliEvaluate.stdout.slice(cliEvaluate.stdout.indexOf("{"))) as { ok: boolean; data?: EvaluateData };
    assert(evaluateEnvelope.ok && evaluateEnvelope.data, "the CLI evaluate envelope is a success");
    const cases = evaluateEnvelope.data.cases;
    assert(cases.length === plan.contributionManifest.evaluations.length, "every evaluation case is reported");
    const scenarioIds = new Set(plan.contributionManifest.evaluations.filter((item) => item.command?.endsWith(".yaml")).map((item) => item.id));
    assert(scenarioIds.size === 2, `two LaunchBench scenario cases, got ${scenarioIds.size}`);
    for (const item of cases) {
      if (scenarioIds.has(item.id)) assert(item.status === "passed", `scenario case ${item.id} should lint: ${item.status} ${item.detail}`);
      else assert(item.status === "refused", `command case ${item.id} must be refused without --allow-commands: ${item.status} ${item.detail}`);
    }
  });

  await proofCase(PROOFS.observationWrite, async () => {
    const root = copyUpstreamsRoot(tempDir("observation-write"), [RORK, SKILLS]);
    const { fetchText } = recordedFetch(rorkManifest.canonicalUrl);
    const realBefore = digest(readFileSync(upstreamObservationPath(skillRoot, RORK)));
    const check = await checkUpstream({ skillRoot: root, now: () => NOW, fetchText }, { upstreamId: RORK, fetch: true, write: true });
    const file = upstreamObservationPath(root, RORK);
    assert(check.written === file && existsSync(file), `written ${check.written}`);
    const text = readFileSync(file, "utf8");
    assert(text.endsWith("\n") && text.startsWith("{\n  "), "the observation is pretty JSON with a trailing newline");
    const parsed = upstreamObservationSchema.parse(JSON.parse(text));
    assert(
      parsed.upstreamId === RORK && parsed.checkedAt === NOW.toISOString() && parsed.method === "github-api",
      "the written observation records id, clock, and method",
    );
    assert(!text.includes("http"), "the written observation carries no URL");
    assert(
      parsed.releasesSinceBaseline.every((release) => release.summary.includes("[link]")),
      "links are replaced by a marker, not dropped silently",
    );
    assert(digest(readFileSync(upstreamObservationPath(skillRoot, RORK))) === realBefore, "the repository observation is untouched");
    const reread = await checkUpstream({ skillRoot: root, now: () => NOW, fetchText: refuseFetch }, { upstreamId: RORK });
    assert(
      reread.observation.latestStable?.tag === recordedTag && reread.networkUsed === false,
      "the written observation is reused on the next check without a fetch",
    );
  });

  await proofCase(PROOFS.mcpRefusals, async () => {
    let service: typeof import("../../../kernel/contribution/service.js") | undefined;
    try {
      service = await import("../../../kernel/contribution/service.js");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const pending = /Cannot find module '[^']*?kernel\/contribution\/(check|evaluate|plan|preview)\.js'/u.exec(message)?.[1];
      if (pending) return { skip: `kernel/contribution/${pending}.ts pending from agent intake-plan` };
      throw error;
    }
    assert(service, "the contribution service loaded");
    const options = { surface: "mcp" as const, skillRoot, now: () => NOW, upstream: { fetchText: refuseFetch } };
    const expectCode = async (input: Record<string, unknown>, code: string, description: string): Promise<void> => {
      const result = await service.callContributionOperation("upstreams.check", input, options);
      assert(!result.ok && result.error.code === code, `${description}: expected ${code}, got ${result.ok ? "ok" : result.error.code}`);
    };
    await expectCode({ upstreamId: RORK, fetch: true }, "NETWORK_DISABLED", "upstream-check --fetch");
    await expectCode({ upstreamId: RORK, write: true }, "NETWORK_DISABLED", "upstream-check --write");
    await expectCode({ upstreamId: RORK, observeHost: true }, "NETWORK_DISABLED", "upstream-check --observe-host");
    const list = await service.callContributionOperation("upstreams.list", { observeHost: true }, options);
    assert(!list.ok && list.error.code === "LOCAL_OPERATION_REFUSED", `upstreams --observe-host: ${list.ok ? "ok" : list.error.code}`);
    const plainCheck = await service.callContributionOperation("upstreams.check", { upstreamId: RORK }, options);
    assert(
      plainCheck.ok && plainCheck.data.networkUsed === false && plainCheck.data.written === null,
      "a plain check on MCP reads the recorded observation only",
    );
    const unknown = await service.callContributionOperation("upstreams.check", { upstreamId: "no-such-upstream" }, options);
    assert(!unknown.ok && unknown.error.code === "UNKNOWN_UPSTREAM", `unknown upstream: ${unknown.ok ? "ok" : unknown.error.code}`);
    const plan = await service.callContributionOperation("upstreams.upgrade-plan", { upstreamId: RORK, target: tempDir("mcp-target") }, options);
    assert(!plan.ok && plan.error.code === "LOCAL_OPERATION_REFUSED", `upgrade-plan --target on MCP: ${plan.ok ? "ok" : plan.error.code}`);
    return undefined;
  });
  // A proof label with no row is caught by the parent, which checks every label; the child's exit code only reports a crash.
}

/* ------------------------------------------------------------------------------------------ */
/* Parent: rows from the child plus the synchronous CLI proof                                  */
/* ------------------------------------------------------------------------------------------ */

function parseRows(stdout: string): Map<string, ProofRow> {
  const rows = new Map<string, ProofRow>();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith(RESULT_MARKER)) continue;
    const parsed = JSON.parse(line.slice(RESULT_MARKER.length)) as ProofRow;
    rows.set(parsed.label, parsed);
  }
  return rows;
}

export function register(harness: Harness): void {
  const proofRoot = harness.makeTempDir("upstreams-proof");
  const proof = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--prove"], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, UPSTREAMS_PROOF_ROOT: proofRoot },
  });
  const proofOutput = `${proof.stdout}\n${proof.stderr}`;
  const rows = parseRows(proof.stdout ?? "");
  for (const label of Object.values(PROOFS)) {
    const result = rows.get(label);
    if (result?.skipped) {
      harness.skip(label, result.detail);
      continue;
    }
    harness.check(label, () => {
      assert(result, `no result row from the proof child (exit ${proof.status})\n${proofOutput.trim().slice(-2000)}`);
      assert(result.ok, result.detail);
    });
  }
  harness.check("upstreams proof process: the child exits cleanly after every proof", () => {
    assert(proof.status === 0, `exit ${proof.status}\n${proofOutput.trim().slice(-2000)}`);
  });

  const cliLabel = "upstreams CLI: b2c contribute upstreams --json lists every authored manifest without fetching";
  const cli = spawnSync(resolveTsxBin(skillRoot), [CONTRIBUTE_CLI, "upstreams", "--json"], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 180_000,
    env: { ...process.env, B2C_APP_BUILDER_CALLER_CWD: skillRoot },
  });
  const cliOutput = `${cli.stdout}\n${cli.stderr}`;
  const pending = /Cannot find module '[^']*?kernel\/contribution\/(check|evaluate|plan|preview)\.js'/u.exec(cliOutput)?.[1];
  if (pending) {
    harness.skip(cliLabel, `kernel/contribution/${pending}.ts pending from agent intake-plan`);
  } else {
    harness.check(cliLabel, () => {
      assert(cli.status === 0, `exit ${cli.status}\n${cliOutput.trim().slice(-2000)}`);
      const start = cli.stdout.indexOf("{");
      assert(start >= 0, `no JSON on stdout\n${cliOutput.trim().slice(-1000)}`);
      const envelope = JSON.parse(cli.stdout.slice(start)) as { ok: boolean; data?: UpstreamInventoryData };
      assert(envelope.ok && envelope.data, "the envelope is a success");
      const ids = envelope.data.upstreams.map((entry) => entry.id).sort();
      const expected = loadUpstreams(skillRoot)
        .upstreams.map((entry) => entry.manifest.id)
        .sort();
      assert(expected.length >= 3 && ids.length === expected.length && ids.join(",") === expected.join(","), `upstream ids ${ids.join(", ")}`);
      assert(
        envelope.data.upstreams.every((entry) => entry.installed === "not-observed" || typeof entry.installed === "object"),
        "no host probe ran without --observe-host",
      );
      assert(statSync(CONTRIBUTE_CLI).isFile(), "the CLI entrypoint exists");
    });
  }
}

if (process.argv.includes("--prove") && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prove();
