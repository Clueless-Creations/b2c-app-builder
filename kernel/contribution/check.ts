import { loadKnowledgePackages } from "../../catalog/knowledge-packages.js";
import type { ContributionManifest, ContributionUnit, SourceRecord } from "../../contracts/contribution/contract.js";
import { inferScope, readContributionManifest } from "./manifest-io.js";
import type { CheckData, CheckIssue } from "./types.js";
import { loadUpstreams } from "./upstreams-load.js";
import { checkAcceptedUpstreams } from "./accepted-upstreams.js";

/**
 * `contribution.check`: validate a contribution root. Schema, scope routing, rights evidence for
 * adapted or copied units, notices for copied material, refused directives, original units
 * without a fabricated upstream, existing owners, and evaluation coverage. Errors block; warnings
 * are review prompts. Nothing here changes a file.
 */
const COPYING_DISPOSITIONS = new Set<ContributionUnit["disposition"]>(["reuse", "wrap", "vendor"]);
const RIGHTS_DISPOSITIONS = new Set<ContributionUnit["disposition"]>(["adapt", "reuse", "wrap", "vendor"]);
const INCOMPLETE_RETRIEVAL = new Set(["excerpt", "screenshot", "secondary", "inaccessible", "not-retrieved"]);
const AESTHETIC = /\b(?:style|aesthetic|palette|typography|typeface|colou?r scheme)\b/iu;
const STALE_DAYS = 180;

function unitTargets(unit: ContributionUnit): string[] {
  return [unit.id, unit.target.id, unit.target.path].filter((value): value is string => Boolean(value));
}

const normalizePath = (value: string): string => value.replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/+$/u, "");

/** A notices[].covers entry covers a candidate when it names it exactly or names a parent directory of it. */
function coversCandidate(covered: string, candidate: string): boolean {
  if (covered === candidate) return true;
  const coveredPath = normalizePath(covered);
  const candidatePath = normalizePath(candidate);
  return coveredPath !== "" && (candidatePath === coveredPath || candidatePath.startsWith(`${coveredPath}/`));
}

function noticeCovers(manifest: ContributionManifest, candidates: readonly string[], sourceId: string): boolean {
  return manifest.notices.some(
    (notice) => notice.sourceId === sourceId && notice.covers.some((covered) => candidates.some((candidate) => coversCandidate(covered, candidate))),
  );
}

/**
 * An upgrade plan (`b2c contribute upgrade-plan`) records its upstream as a source with retrieval
 * `excerpt`: release metadata and the license digest from the recorded observation, never the
 * whole repository. That source's review belongs to its manifest under catalog/upstreams, so the
 * complete-source rule for adaptation does not apply to it. Every other source keeps the rule.
 */
function ownedByUpstreamManifest(source: SourceRecord, upstreamIds: ReadonlySet<string>): boolean {
  return source.upstreamId !== undefined && upstreamIds.has(source.upstreamId);
}

export function checkContribution(targetRoot: string, deps: { skillRoot: string; now: () => Date }): CheckData {
  const manifest = readContributionManifest(targetRoot);
  const upstreamIds = new Set(
    manifest.sources.some((source) => source.upstreamId) ? loadUpstreams(deps.skillRoot).upstreams.map((entry) => entry.manifest.id) : [],
  );
  const issues: CheckIssue[] = [];
  const error = (code: string, message: string, ids: { unitId?: string; sourceId?: string } = {}): void => {
    issues.push({ severity: "error", code, message, ...ids });
  };
  const warning = (code: string, message: string, ids: { unitId?: string; sourceId?: string } = {}): void => {
    issues.push({ severity: "warning", code, message, ...ids });
  };
  const packages = loadKnowledgePackages(deps.skillRoot);
  const packageIds = new Set<string>(packages.map((pkg) => pkg.id));
  const packageTitles = new Map(packages.map((pkg) => [pkg.title.toLowerCase(), pkg.id]));
  const sources = new Map(manifest.sources.map((source) => [source.id, source]));
  const unitIds = new Set(manifest.units.map((unit) => unit.id));

  const inferred = inferScope(manifest.goal, manifest.units);
  if (manifest.routing.verdict !== manifest.scope)
    error("contribution.scope_mismatch", `routing.verdict ${manifest.routing.verdict} differs from scope ${manifest.scope}.`);
  if (manifest.scope !== "maintenance" && inferred.verdict === "maintenance")
    error("contribution.scope_mismatch", `scope ${manifest.scope} cannot change maintainer-owned paths: ${inferred.maintenanceTargets.join(", ")}.`);
  if (manifest.scope === "maintenance" && inferred.verdict !== "maintenance")
    warning("contribution.scope_broader_than_targets", "scope maintenance declared, but no unit targets a maintainer-owned path.");

  for (const source of manifest.sources) {
    if (source.retrievedAt) {
      const ageDays = (deps.now().getTime() - new Date(source.retrievedAt).getTime()) / 86_400_000;
      if (ageDays > STALE_DAYS)
        warning("contribution.source_stale", `${source.id} was retrieved ${Math.floor(ageDays)} days ago; re-read it before promotion.`, {
          sourceId: source.id,
        });
    }
  }

  for (const unit of manifest.units) {
    const ids = { unitId: unit.id };
    if (unit.upstream === null && unit.disposition !== "original") {
      error(
        "contribution.original_disposition_mismatch",
        `${unit.id} has no upstream but disposition ${unit.disposition}; only original units omit an upstream.`,
        ids,
      );
    }
    if (unit.upstream !== null && unit.disposition === "original") {
      error("contribution.fabricated_originality", `${unit.id} names upstream ${unit.upstream.sourceId} but claims disposition original.`, ids);
    }
    const source = unit.upstream ? sources.get(unit.upstream.sourceId) : undefined;
    if (unit.upstream && !source)
      error("contribution.source_unknown", `${unit.id} names upstream ${unit.upstream.sourceId}, which is not a source in this manifest.`, ids);
    if (source && RIGHTS_DISPOSITIONS.has(unit.disposition) && source.rights.status !== "verified") {
      const soft = unit.status !== "accepted" && unit.disposition === "adapt" && source.rights.status === "unverified" && unit.kind === "knowledge";
      const message = `${unit.id} is ${unit.disposition} but source ${source.id} rights are ${source.rights.status}.`;
      if (soft) warning("contribution.rights_unverified", `${message} Read the license text before promotion.`, { ...ids, sourceId: source.id });
      else error("contribution.rights_unverified", message, { ...ids, sourceId: source.id });
    }
    if (source && unit.disposition === "adapt" && INCOMPLETE_RETRIEVAL.has(source.retrieval.status) && !ownedByUpstreamManifest(source, upstreamIds)) {
      error(
        "contribution.incomplete_source_for_adaptation",
        `${unit.id} adapts source ${source.id}, whose retrieval is ${source.retrieval.status}; adapt needs the complete source.`,
        { ...ids, sourceId: source.id },
      );
    }
    if (COPYING_DISPOSITIONS.has(unit.disposition) && !noticeCovers(manifest, unitTargets(unit), unit.upstream?.sourceId ?? "")) {
      error(
        "contribution.notice_missing",
        `${unit.id} copies material (${unit.disposition}) but no notices[] entry covers ${unit.target.id ?? unit.target.path ?? unit.id}.`,
        ids,
      );
    }
    if (unit.target.kind === "existing-reference") {
      if (!unit.target.id || !packageIds.has(unit.target.id))
        error(
          "contribution.owner_unknown",
          `${unit.id} targets existing reference ${unit.target.id ?? "(none)"}, which is not a loaded knowledge package.`,
          ids,
        );
    }
    if (unit.target.kind === "new-reference") {
      const duplicate = packageTitles.get(unit.title.toLowerCase());
      if (duplicate)
        warning("contribution.duplicate_reference_candidate", `${unit.id} proposes a new reference titled like existing package ${duplicate}.`, ids);
    }
    if (unit.kind === "knowledge" && unit.selection === "always" && AESTHETIC.test(unit.rationale)) {
      error(
        "contribution.aesthetic_universal_default",
        `${unit.id} would make an aesthetic preference an automatic default; a creator's style stays a selectable method.`,
        ids,
      );
    }
    const cases = manifest.evaluations.filter((item) => item.unitId === unit.id);
    if (
      unit.kind === "knowledge" &&
      unit.disposition === "adapt" &&
      !cases.some((item) => item.kind === "counterexample" || item.kind === "launchbench-scenario")
    ) {
      error("contribution.evaluation_missing", `${unit.id} adapts knowledge without a counterexample or launchbench-scenario evaluation.`, ids);
    }
    if (
      unit.kind === "implementation" &&
      (unit.disposition === "reuse" || unit.disposition === "wrap") &&
      !cases.some((item) => item.kind === "command" || item.kind === "comparison")
    ) {
      warning("contribution.evaluation_recommended", `${unit.id} reuses an implementation without a command or comparison evaluation.`, ids);
    }
  }

  for (const derivation of manifest.derivations) {
    if (
      derivation.relationship === "copied" &&
      !derivation.notice &&
      !derivation.sourceIds.every((sourceId) => noticeCovers(manifest, [derivation.target], sourceId))
    ) {
      error("contribution.notice_missing", `derivation for ${derivation.target} copies material without a notice.`);
    }
    for (const sourceId of derivation.sourceIds) {
      if (!sources.has(sourceId)) error("contribution.source_unknown", `derivation for ${derivation.target} names unknown source ${sourceId}.`, { sourceId });
    }
  }
  for (const evaluation of manifest.evaluations) {
    if (!unitIds.has(evaluation.unitId)) error("contribution.evaluation_unit_unknown", `evaluation ${evaluation.id} names unknown unit ${evaluation.unitId}.`);
  }
  for (const notice of manifest.notices) {
    if (!sources.has(notice.sourceId))
      error("contribution.source_unknown", `notice ${notice.noticePath} names unknown source ${notice.sourceId}.`, { sourceId: notice.sourceId });
  }

  issues.push(...checkAcceptedUpstreams(manifest, targetRoot, deps.skillRoot));

  const refusedDirectives = manifest.sources.reduce((sum, source) => sum + source.directives.length, 0);
  return {
    target: targetRoot,
    manifestId: manifest.id,
    pass: !issues.some((issue) => issue.severity === "error"),
    issues,
    summary: {
      units: manifest.units.length,
      sources: manifest.sources.length,
      rightsVerified: manifest.sources.filter((source) => source.rights.status === "verified").length,
      rightsUnknown: manifest.sources.filter((source) => source.rights.status === "unknown").length,
      copiedUnits: manifest.units.filter((unit) => COPYING_DISPOSITIONS.has(unit.disposition)).length,
      originalUnits: manifest.units.filter((unit) => unit.upstream === null).length,
      refusedDirectives,
      evaluations: manifest.evaluations.length,
    },
  };
}
