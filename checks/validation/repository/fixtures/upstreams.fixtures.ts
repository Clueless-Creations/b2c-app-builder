import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadUpstreams, UPSTREAMS_DIRECTORY } from "../../../../kernel/contribution/upstreams-load.js";
import { knowledgeFreshnessPinPath } from "../../../../tooling/lib/knowledge-freshness-pin.js";
import { type Harness, skillRoot } from "./_harness.js";

/**
 * Fixtures for check-upstreams.ts (ADR-0005). The validator takes --skill-root, not --root, so
 * every case passes the root explicitly through runScriptArgs or the extra-args slot of
 * runFixtureJson; the injected --root is ignored by the script's flag parser.
 *
 * Each negative case starts from a fresh copy of the shipped catalog/upstreams tree inside a temp
 * skill root that carries a minimal source registry, the freshness snapshot and its packaged pin,
 * and an empty placeholder file for every owner and test path the manifests name. The control
 * case proves that copy passes on its own, so a negative case fails for the one edit it makes.
 */
const SCRIPT = "check-upstreams.ts";
const REGISTRY_RELATIVE = "checks/validation/repository/source-registry.yaml";
const SNAPSHOT_RELATIVE = "docs/source-freshness/source-snapshots/current.json";

function writeFile(root: string, relative: string, contents: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents, "utf8");
}

/** Mirror an owner or test path into the temp root: the shipped file when it exists (a knowledge manifest must still parse), else an empty placeholder. */
function mirror(root: string, relative: string): void {
  const target = path.join(root, relative);
  if (existsSync(target)) return;
  const shipped = path.join(skillRoot, relative);
  if (existsSync(shipped)) {
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(shipped, target);
  } else {
    writeFile(root, relative, "");
  }
}

function writeRegistry(root: string, ids: Iterable<string>): void {
  writeFile(root, REGISTRY_RELATIVE, `schema_version: 1\nsources:\n${[...ids].map((id) => `  - id: ${id}\n`).join("")}`);
}

function editFile(root: string, relative: string, edit: (text: string) => string): void {
  const target = path.join(root, relative);
  const before = readFileSync(target, "utf8");
  const after = edit(before);
  if (after === before) throw new Error(`fixture edit changed nothing in ${relative}`);
  writeFileSync(target, after, "utf8");
}

interface UpstreamRoot {
  readonly root: string;
  readonly manifestPath: string;
  readonly noticePath: string;
  readonly observationPath: string;
  readonly firstOwner: string;
  readonly sourceIds: string[];
}

/** A temp skill root that mirrors the shipped upstream tree closely enough for the validator to pass. */
function makeUpstreamRoot(harness: Harness, name: string): UpstreamRoot {
  const root = path.join(harness.tempRoot, name);
  mkdirSync(root, { recursive: true });
  cpSync(path.join(skillRoot, UPSTREAMS_DIRECTORY), path.join(root, UPSTREAMS_DIRECTORY), { recursive: true });
  cpSync(path.join(skillRoot, SNAPSHOT_RELATIVE), path.join(root, SNAPSHOT_RELATIVE), { recursive: true });
  mkdirSync(path.dirname(path.join(root, knowledgeFreshnessPinPath)), { recursive: true });
  cpSync(path.join(skillRoot, knowledgeFreshnessPinPath), path.join(root, knowledgeFreshnessPinPath));
  const loaded = loadUpstreams(skillRoot);
  if (loaded.issues.length || !loaded.upstreams.length) throw new Error(`shipped upstream manifests must load cleanly: ${JSON.stringify(loaded.issues)}`);
  const sourceIds = new Set<string>();
  for (const entry of loaded.upstreams) {
    const { manifest } = entry;
    for (const id of manifest.sourceIds) sourceIds.add(id);
    for (const relationship of manifest.relationships) {
      for (const owner of relationship.localOwners) mirror(root, owner);
      for (const test of relationship.tests) mirror(root, test);
    }
    for (const adaptation of manifest.adaptations) mirror(root, adaptation.owner);
    for (const operation of manifest.support.operations) for (const owner of operation.owners) mirror(root, owner);
  }
  writeRegistry(root, sourceIds);
  const observed = loaded.upstreams.find((entry) => entry.observation && entry.notice);
  if (!observed?.observationPath || !observed.notice) throw new Error("a shipped upstream with both a notice and an observation is required");
  return {
    root,
    manifestPath: observed.manifestPath,
    noticePath: observed.notice.path,
    observationPath: observed.observationPath,
    firstOwner: observed.manifest.relationships[0]!.localOwners[0]!,
    sourceIds: [...sourceIds],
  };
}

export function register(harness: Harness): void {
  const { runScriptArgs, runFixtureJson } = harness;

  runScriptArgs("upstreams: the shipped manifests, notices, and observations pass", SCRIPT, ["--skill-root", skillRoot], 0, "0 error(s), 0 warning(s)");

  const control = makeUpstreamRoot(harness, "upstreams-control");
  runScriptArgs("upstreams: a faithful temp copy of the shipped tree passes (control)", SCRIPT, ["--skill-root", control.root], 0, "0 error(s), 0 warning(s)");

  const unknownSource = makeUpstreamRoot(harness, "upstreams-unknown-source");
  writeRegistry(
    unknownSource.root,
    unknownSource.sourceIds.filter((id) => id !== unknownSource.sourceIds[0]),
  );
  runFixtureJson("upstreams: a source id without a registry row fails", unknownSource.root, SCRIPT, 1, "upstreams.source_id_unknown", [
    "--skill-root",
    unknownSource.root,
  ]);

  const digestMismatch = makeUpstreamRoot(harness, "upstreams-notice-digest");
  editFile(digestMismatch.root, digestMismatch.noticePath, (text) => `${text}\nAdditional clause the reviewed license never carried.\n`);
  runFixtureJson(
    "upstreams: a notice whose digest differs from license.evidence_sha256 fails",
    digestMismatch.root,
    SCRIPT,
    1,
    "upstreams.notice_digest_mismatch",
    ["--skill-root", digestMismatch.root],
  );

  const missingOwner = makeUpstreamRoot(harness, "upstreams-missing-owner");
  rmSync(path.join(missingOwner.root, missingOwner.firstOwner));
  runFixtureJson("upstreams: a local owner path that does not exist fails", missingOwner.root, SCRIPT, 1, "upstreams.local_owner_missing", [
    "--skill-root",
    missingOwner.root,
  ]);

  const deferred = makeUpstreamRoot(harness, "upstreams-deferred");
  editFile(deferred.root, deferred.manifestPath, (text) => text.replace(/^  status: current$/mu, "  status: deferred"));
  runFixtureJson("upstreams: review status deferred without a deferral record fails", deferred.root, SCRIPT, 1, "upstreams.deferral_missing", [
    "--skill-root",
    deferred.root,
  ]);

  const noEvidence = makeUpstreamRoot(harness, "upstreams-no-evidence");
  editFile(noEvidence.root, noEvidence.manifestPath, (text) => text.replace(/^  evidence_sha256: [a-f0-9]{64}\n/mu, ""));
  runFixtureJson("upstreams: license status verified without evidence_sha256 fails", noEvidence.root, SCRIPT, 1, "upstreams.license_evidence_missing", [
    "--skill-root",
    noEvidence.root,
  ]);

  const ghostUpstream = makeUpstreamRoot(harness, "upstreams-ghost-knowledge");
  writeFile(
    ghostUpstream.root,
    "catalog/knowledge/store/store-fixture.yaml",
    [
      "id: reference.store.fixture",
      "title: Fixture reference",
      "domain_id: domain.store",
      "document_path: knowledge/store/fixture.md",
      "load_when: never; fixture only",
      "lifecycle: active",
      "bindings:",
      "  workflow_ids: []",
      "  context_pack_ids: []",
      "sources:",
      "  - id: fixture-source",
      "    name: Fixture source",
      "    source_type: repository",
      "    url: https://example.invalid/fixture",
      "    review_cadence_days: 30",
      "    claim_scope: fixture",
      "    last_review_date: 2026-09-01",
      "    reviewer: fixture",
      "    upstream_id: ghost-upstream",
      "",
    ].join("\n"),
  );
  runFixtureJson(
    "upstreams: a knowledge source naming an upstream_id no manifest defines fails",
    ghostUpstream.root,
    SCRIPT,
    1,
    "upstreams.knowledge_upstream_unknown",
    ["--skill-root", ghostUpstream.root],
  );

  const overdue = makeUpstreamRoot(harness, "upstreams-review-overdue");
  editFile(overdue.root, overdue.manifestPath, (text) => text.replace(/^  last_review: "?\d{4}-\d{2}-\d{2}"?$/mu, '  last_review: "2026-01-01"'));
  runFixtureJson("upstreams: a review overdue by more than twice its cadence warns without failing", overdue.root, SCRIPT, 0, "upstreams.review_overdue", [
    "--skill-root",
    overdue.root,
  ]);

  const stale = makeUpstreamRoot(harness, "upstreams-observation-stale");
  editFile(stale.root, stale.observationPath, (text) => text.replace(/"checkedAt": "[^"]+"/u, '"checkedAt": "2026-01-01T00:00:00.000Z"'));
  runFixtureJson("upstreams: an observation older than twice the review cadence warns without failing", stale.root, SCRIPT, 0, "upstreams.observation_stale", [
    "--skill-root",
    stale.root,
  ]);

  // The clock is the packaged freshness pin, not the wall clock: a review four days before the pin is
  // current even though the wall clock is months later.
  const pinned = makeUpstreamRoot(harness, "upstreams-pinned-clock");
  writeFile(
    pinned.root,
    knowledgeFreshnessPinPath,
    `${JSON.stringify({ schemaVersion: "1.0.0", generatedAt: "2026-03-01T00:00:00.000Z", snapshotSha256: "0".repeat(64) }, null, 2)}\n`,
  );
  editFile(pinned.root, pinned.manifestPath, (text) => text.replace(/^  last_review: "?\d{4}-\d{2}-\d{2}"?$/mu, '  last_review: "2026-02-25"'));
  runScriptArgs(
    "upstreams: review age is measured against the packaged freshness pin, not the wall clock",
    SCRIPT,
    ["--skill-root", pinned.root],
    0,
    "0 error(s), 0 warning(s)",
  );

  const noPin = makeUpstreamRoot(harness, "upstreams-no-pin");
  rmSync(path.join(noPin.root, knowledgeFreshnessPinPath));
  runFixtureJson(
    "upstreams: a missing freshness pin is an error, not a silent skip of the cadence checks",
    noPin.root,
    SCRIPT,
    1,
    "upstreams.freshness_pin_unavailable",
    ["--skill-root", noPin.root],
  );
}
