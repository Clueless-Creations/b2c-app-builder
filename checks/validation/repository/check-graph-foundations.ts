#!/usr/bin/env node
/**
 * check-graph-foundations.ts — executable principle registry and vocabulary gate.
 *
 * A must-level principle is valid only when its named guard and negative input
 * prove the invariant. A fixture that still passes after the guard is removed
 * is vacuous. Source freshness is advisory: a newer registry commit opens
 * review and does not change B2C App Builder behavior.
 *
 * npm script: check:graph-foundations
 * Usage: tsx checks/validation/repository/check-graph-foundations.ts --skill-root /path/to/skill
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { evaluateGuard } from "../../../catalog/principles/guards.js";
import { isPinnedCommit, isPublicTermAllowed, loadPrinciples, loadVocabulary, principlesPath, vocabularyPath } from "../../../catalog/principles/load.js";
import { PRINCIPLE_SOURCE_IDS } from "../../../catalog/principles/types.js";
import { flagString, isRecord, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--registry"], key: "registry" },
  { flags: ["--declare-public-term"], key: "declarePublicTerm", kind: "string" },
]);
const skillRoot = path.resolve(flagString(flags, "skillRoot") ?? defaultSkillRoot);
const registryPath = path.resolve(flagString(flags, "registry") ?? path.join(skillRoot, "checks/validation/repository/source-registry.yaml"));
const declarePublicTerm = flagString(flags, "declarePublicTerm");
const issues: Issue[] = [];

function addError(code: string, message: string, file?: string): void {
  issues.push(issue("error", code, message, file));
}

function addWarning(code: string, message: string, file?: string): void {
  issues.push(issue("warning", code, message, file));
}

function extractTreeCommit(url: string): string | undefined {
  return /\/(?:tree|blob)\/([0-9a-f]{7,40})(?:\/|$)/iu.exec(url)?.[1];
}

function commitsMatch(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

try {
  const registry = loadPrinciples(skillRoot);
  const vocabulary = loadVocabulary(skillRoot);
  const principlesFile = path.relative(skillRoot, principlesPath(skillRoot)).split(path.sep).join("/");
  const vocabularyFile = path.relative(skillRoot, vocabularyPath(skillRoot)).split(path.sep).join("/");

  if (registry.schema_version !== 1) {
    addError("graph_foundations.schema_version", `principle registry schema_version must be 1, got ${registry.schema_version}`, principlesFile);
  }
  if (vocabulary.schema_version !== 1) {
    addError("graph_foundations.vocabulary_schema_version", `vocabulary schema_version must be 1, got ${vocabulary.schema_version}`, vocabularyFile);
  }
  if (vocabulary.chosen_terms.length === 0 || vocabulary.rejected_terms.length === 0) {
    addError("graph_foundations.vocabulary_incomplete", "vocabulary record must list chosen terms and rejected terms", vocabularyFile);
  }

  const seenIds = new Set<string>();
  for (const principle of registry.principles) {
    if (seenIds.has(principle.id)) {
      addError("graph_foundations.duplicate_id", `duplicate stable principle id ${principle.id}`, principlesFile);
    }
    seenIds.add(principle.id);
    if (!isPinnedCommit(principle.source_commit)) {
      addError(
        "graph_foundations.unpinned_commit",
        `${principle.id} source_commit "${principle.source_commit}" is not a full 40-character commit`,
        principlesFile,
      );
    }
    if (principle.strength === "must" && principle.status === "active") {
      if (!principle.enforcement.negative_input) {
        addError("graph_foundations.fixture_missing", `${principle.id} has no negative_input fixture`, principlesFile);
        continue;
      }
      const enabled = evaluateGuard(principle, principle.enforcement.negative_input);
      const disabled = evaluateGuard(principle, principle.enforcement.negative_input, { disableGuard: true });
      const enabledHit = enabled.some((item) => item.code === principle.enforcement.issue_code);
      const disabledHit = disabled.some((item) => item.code === principle.enforcement.issue_code);
      if (!enabledHit) {
        addError(
          "graph_foundations.enforcement_vacuous",
          `${principle.id} negative_input never exercises guard ${principle.enforcement.guard}`,
          principlesFile,
        );
      }
      if (disabledHit) {
        addError(
          "graph_foundations.enforcement_vacuous",
          `${principle.id} still emits ${principle.enforcement.issue_code} after the guard is removed`,
          principlesFile,
        );
      }
    }
  }

  if (registry.coverage === "complete") {
    const sources = new Set(registry.principles.map((principle) => principle.source_id));
    for (const sourceId of PRINCIPLE_SOURCE_IDS) {
      if (!sources.has(sourceId)) {
        addError("graph_foundations.source_missing", `complete registry is missing source ${sourceId}`, principlesFile);
      }
    }
  }

  if (declarePublicTerm && !isPublicTermAllowed(declarePublicTerm, vocabulary)) {
    addError("graph_foundations.public_term_unapproved", `public term "${declarePublicTerm}" is not in the approved vocabulary record`, vocabularyFile);
  }

  if (existsSync(registryPath)) {
    const parsed: unknown = parseYaml(readFileSync(registryPath, "utf8"));
    const sources = isRecord(parsed) && Array.isArray(parsed.sources) ? parsed.sources.filter(isRecord) : [];
    const registryCommits = new Map<string, string>();
    for (const source of sources) {
      const url = typeof source.url === "string" ? source.url : "";
      const commit = extractTreeCommit(url);
      if (!commit) continue;
      const hostPath =
        url
          .replace(/^https?:\/\//u, "")
          .split("/tree/")[0]
          ?.split("/blob/")[0] ?? "";
      if (hostPath) registryCommits.set(hostPath, commit);
    }
    for (const principle of registry.principles) {
      const hostPath =
        principle.source_url
          .replace(/^https?:\/\//u, "")
          .split("/tree/")[0]
          ?.split("/blob/")[0] ?? "";
      const registryCommit = registryCommits.get(hostPath);
      if (registryCommit && !commitsMatch(principle.source_commit, registryCommit)) {
        addWarning(
          "graph_foundations.source_review_required",
          `${principle.id} is pinned to ${principle.source_commit} but the source registry now lists ${registryCommit}. Review the principle. Do not import upstream policy automatically.`,
          principlesFile,
        );
      }
    }
  }
} catch (error) {
  addError("graph_foundations.load_failed", error instanceof Error ? error.message : String(error));
}

reportAndExit("Graph foundations", issues);
