#!/usr/bin/env node
/**
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 *
 * check-upstreams.ts — repository validator for the authored upstream manifests under
 * catalog/upstreams/ (ADR-0005).
 *
 * Errors (the gate fails):
 *   - any loader issue: invalid manifest, id/filename mismatch, duplicate id, missing notice
 *     file, notice digest mismatch, invalid or mismatched observation
 *   - a cited source id without a row in checks/validation/repository/source-registry.yaml
 *   - a local owner or test path that does not exist in the repository
 *   - review.status "deferred" without a deferral record
 *   - license.status "verified" without both evidence_sha256 and notice_file
 *   - a knowledge package source that names an upstream_id no manifest defines
 *
 * Warnings (reported, the gate passes):
 *   - a review overdue by more than twice its cadence
 *   - a recorded observation older than twice the review cadence
 *   - an adaptation or operation owner path that does not exist
 *
 * Cadence is measured against the packaged knowledge-freshness pin, the same clock the
 * knowledge validators use, so a feature branch never goes red because calendar days passed.
 *
 * npm script: check:upstreams
 * Usage: tsx checks/validation/repository/check-upstreams.ts [--skill-root <path>] [--json]
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import { loadRegistrySourceIds } from "../../../adapters/providers/load.js";
import { loadUpstreams, UPSTREAMS_DIRECTORY } from "../../../kernel/contribution/upstreams-load.js";
import { loadPinnedKnowledgeFreshnessNow } from "../../../tooling/lib/knowledge-freshness-pin.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);
const SOURCE_REGISTRY_RELATIVE = "checks/validation/repository/source-registry.yaml";

const flags = parseFlags(process.argv.slice(2), [{ flags: ["--skill-root"], key: "skillRoot" }]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);

const issues: Issue[] = [];

function daysSince(date: string, now: Date): number {
  const reviewed = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  return Number.isNaN(reviewed) ? Number.POSITIVE_INFINITY : Math.floor((now.valueOf() - reviewed) / 86_400_000);
}

function repositoryPathExists(relative: string): boolean {
  return existsSync(path.join(skillRoot, relative));
}

let now: Date | undefined;
try {
  now = loadPinnedKnowledgeFreshnessNow(skillRoot);
} catch (error) {
  issues.push(
    issue("error", "upstreams.freshness_pin_unavailable", error instanceof Error ? error.message : String(error), "catalog/generated/knowledge-freshness.json"),
  );
}

const loaded = loadUpstreams(skillRoot);
for (const loadIssue of loaded.issues) issues.push(issue("error", loadIssue.code, loadIssue.message, loadIssue.path));

const registry = loadRegistrySourceIds(path.join(skillRoot, SOURCE_REGISTRY_RELATIVE));
if (registry.issue) issues.push(issue("error", "upstreams.source_registry_unavailable", registry.issue, SOURCE_REGISTRY_RELATIVE));

const manifestIds = new Set(loaded.upstreams.map((entry) => entry.manifest.id));

for (const entry of loaded.upstreams) {
  const { manifest, manifestPath } = entry;
  for (const sourceId of manifest.sourceIds) {
    if (!registry.ids.has(sourceId)) {
      issues.push(
        issue(
          "error",
          "upstreams.source_id_unknown",
          `${manifest.id} cites source id ${sourceId}, which has no row in ${SOURCE_REGISTRY_RELATIVE}.`,
          manifestPath,
        ),
      );
    }
  }
  for (const relationship of manifest.relationships) {
    for (const owner of relationship.localOwners) {
      if (!repositoryPathExists(owner))
        issues.push(issue("error", "upstreams.local_owner_missing", `${manifest.id} names local owner ${owner}, which does not exist.`, manifestPath));
    }
    for (const test of relationship.tests) {
      if (!repositoryPathExists(test))
        issues.push(issue("error", "upstreams.test_path_missing", `${manifest.id} names test ${test}, which does not exist.`, manifestPath));
    }
  }
  for (const adaptation of manifest.adaptations) {
    if (!repositoryPathExists(adaptation.owner)) {
      issues.push(
        issue(
          "warning",
          "upstreams.adaptation_owner_missing",
          `${manifest.id} adaptation ${adaptation.id} names owner ${adaptation.owner}, which does not exist.`,
          manifestPath,
        ),
      );
    }
  }
  for (const operation of manifest.support.operations) {
    for (const owner of operation.owners) {
      if (!repositoryPathExists(owner)) {
        issues.push(
          issue(
            "warning",
            "upstreams.operation_owner_missing",
            `${manifest.id} operation ${operation.id} names owner ${owner}, which does not exist.`,
            manifestPath,
          ),
        );
      }
    }
  }
  if (manifest.review.status === "deferred" && !manifest.review.deferral) {
    issues.push(
      issue(
        "error",
        "upstreams.deferral_missing",
        `${manifest.id} review status is deferred without a deferral reason, reconsider_when, and owner.`,
        manifestPath,
      ),
    );
  }
  if (manifest.license.status === "verified" && (!manifest.license.evidenceSha256 || !manifest.license.noticeFile)) {
    issues.push(
      issue(
        "error",
        "upstreams.license_evidence_missing",
        `${manifest.id} claims license status verified without both license.evidence_sha256 and license.notice_file.`,
        manifestPath,
      ),
    );
  }
  if (now) {
    const reviewAge = daysSince(manifest.review.lastReview, now);
    if (reviewAge > manifest.review.cadenceDays * 2) {
      issues.push(
        issue(
          "warning",
          "upstreams.review_overdue",
          `${manifest.id} was last reviewed ${reviewAge} day(s) before the freshness pin; cadence is ${manifest.review.cadenceDays} day(s).`,
          manifestPath,
        ),
      );
    }
    if (entry.observation) {
      const observationAge = daysSince(entry.observation.checkedAt, now);
      if (observationAge > manifest.review.cadenceDays * 2) {
        issues.push(
          issue(
            "warning",
            "upstreams.observation_stale",
            `${manifest.id} observation was recorded ${observationAge} day(s) before the freshness pin; cadence is ${manifest.review.cadenceDays} day(s). Run b2c contribute upstream-check --fetch --write.`,
            entry.observationPath,
          ),
        );
      }
    }
  }
}

try {
  for (const pkg of loadKnowledgePackages(skillRoot)) {
    for (const source of pkg.sources) {
      if (source.upstreamId && !manifestIds.has(source.upstreamId)) {
        issues.push(
          issue(
            "error",
            "upstreams.knowledge_upstream_unknown",
            `${pkg.id} source ${source.id} declares upstream_id ${source.upstreamId}, which no manifest under ${UPSTREAMS_DIRECTORY} defines.`,
            pkg.manifestPath,
          ),
        );
      }
    }
  }
} catch (error) {
  issues.push(issue("error", "upstreams.knowledge_packages_unavailable", error instanceof Error ? error.message : String(error), "catalog/knowledge"));
}

reportAndExit(`Upstream manifests: ${loaded.upstreams.length} manifest(s) under ${UPSTREAMS_DIRECTORY}`, issues);
