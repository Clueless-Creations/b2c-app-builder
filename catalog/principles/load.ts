import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { isGuardKind } from "./guards.js";
import {
  PINNED_COMMIT_PATTERN,
  PRINCIPLE_SOURCE_IDS,
  type GuardKind,
  type Principle,
  type PrincipleCoverage,
  type PrincipleEnforcement,
  type PrincipleRegistry,
  type PrincipleSourceId,
  type PrincipleStatus,
  type PrincipleStrength,
  type VocabularyAlias,
  type VocabularyRecord,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
}

function isSourceId(value: string): value is PrincipleSourceId {
  return value === "kernel" || (PRINCIPLE_SOURCE_IDS as readonly string[]).includes(value);
}

function parseEnforcement(value: unknown): PrincipleEnforcement {
  if (!isRecord(value)) {
    throw new Error("principle.enforcement must be an object");
  }
  const command = asString(value.command);
  const guardRaw = asString(value.guard);
  const issueCode = asString(value.issue_code);
  if (!command || !guardRaw || !issueCode) {
    throw new Error("principle.enforcement requires command, guard, and issue_code");
  }
  if (!isGuardKind(guardRaw)) {
    throw new Error(`unknown guard "${guardRaw}"`);
  }
  const guard: GuardKind = guardRaw;
  const negativeInput = isRecord(value.negative_input) ? value.negative_input : undefined;
  return {
    command,
    guard,
    issue_code: issueCode,
    ...(negativeInput ? { negative_input: negativeInput } : {}),
  };
}

function parsePrinciple(value: unknown, index: number): Principle {
  if (!isRecord(value)) {
    throw new Error(`principles[${index}] must be an object`);
  }
  const id = asString(value.id);
  const sourceIdRaw = asString(value.source_id);
  const sourceRepository = asString(value.source_repository);
  const sourceUrl = asString(value.source_url);
  const sourceCommit = asString(value.source_commit);
  const sourceAnchor = asString(value.source_anchor);
  const rule = asString(value.rule);
  const strength = asString(value.strength);
  const owner = asString(value.owner);
  const status = asString(value.status);
  const reviewCondition = asString(value.review_condition);
  const exceptionPolicy = asString(value.exception_policy);
  if (
    !id ||
    !sourceIdRaw ||
    !sourceRepository ||
    !sourceUrl ||
    !sourceCommit ||
    !sourceAnchor ||
    !rule ||
    !strength ||
    !owner ||
    !status ||
    !reviewCondition ||
    !exceptionPolicy
  ) {
    throw new Error(`principles[${index}] (${id ?? "<missing id>"}) is missing a required field`);
  }
  if (!isSourceId(sourceIdRaw)) {
    throw new Error(`principles[${index}] has unknown source_id "${sourceIdRaw}"`);
  }
  if (strength !== "must" && strength !== "should") {
    throw new Error(`principles[${index}] has invalid strength "${strength}"`);
  }
  if (status !== "active" && status !== "review") {
    throw new Error(`principles[${index}] has invalid status "${status}"`);
  }
  return {
    id,
    source_id: sourceIdRaw,
    source_repository: sourceRepository,
    source_url: sourceUrl,
    source_commit: sourceCommit,
    source_anchor: sourceAnchor,
    rule,
    strength: strength as PrincipleStrength,
    owner,
    status: status as PrincipleStatus,
    enforcement: parseEnforcement(value.enforcement),
    review_condition: reviewCondition,
    exception_policy: exceptionPolicy,
  };
}

export function principlesPath(skillRoot: string): string {
  return path.join(skillRoot, "catalog/principles/principles.yaml");
}

export function vocabularyPath(skillRoot: string): string {
  return path.join(skillRoot, "catalog/principles/vocabulary.yaml");
}

export function loadPrinciples(skillRoot: string): PrincipleRegistry {
  const filePath = principlesPath(skillRoot);
  if (!existsSync(filePath)) {
    throw new Error(`principle registry is missing at ${filePath}`);
  }
  const parsed: unknown = parseYaml(readFileSync(filePath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("principle registry must parse to an object");
  }
  const coverageRaw = asString(parsed.coverage) ?? "partial";
  if (coverageRaw !== "complete" && coverageRaw !== "partial") {
    throw new Error(`principle registry coverage "${coverageRaw}" is invalid`);
  }
  const coverage: PrincipleCoverage = coverageRaw;
  const rows = Array.isArray(parsed.principles) ? parsed.principles : [];
  return {
    schema_version: typeof parsed.schema_version === "number" ? parsed.schema_version : 0,
    coverage,
    principles: rows.map((row, index) => parsePrinciple(row, index)),
  };
}

export function getPrinciple(registry: PrincipleRegistry, id: string): Principle | undefined {
  return registry.principles.find((principle) => principle.id === id);
}

function parseAlias(value: unknown): VocabularyAlias | undefined {
  if (!isRecord(value)) return undefined;
  const from = asString(value.from);
  const to = asString(value.to);
  if (!from || !to) return undefined;
  return { from, to };
}

export function loadVocabulary(skillRoot: string): VocabularyRecord {
  const filePath = vocabularyPath(skillRoot);
  if (!existsSync(filePath)) {
    throw new Error(`vocabulary record is missing at ${filePath}`);
  }
  const parsed: unknown = parseYaml(readFileSync(filePath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("vocabulary record must parse to an object");
  }
  const status = asString(parsed.status);
  if (status !== "approved" && status !== "provisional") {
    throw new Error("vocabulary record status must be approved or provisional");
  }
  const interviewDate = asString(parsed.interview_date);
  if (!interviewDate) {
    throw new Error("vocabulary record requires interview_date");
  }
  return {
    schema_version: typeof parsed.schema_version === "number" ? parsed.schema_version : 0,
    status,
    interview_date: interviewDate,
    chosen_terms: asStringArray(parsed.chosen_terms),
    schema_terms: asStringArray(parsed.schema_terms),
    aliases: Array.isArray(parsed.aliases) ? parsed.aliases.map(parseAlias).filter((item): item is VocabularyAlias => Boolean(item)) : [],
    rejected_terms: asStringArray(parsed.rejected_terms),
    provisional_prefixes: asStringArray(parsed.provisional_prefixes),
    compatibility: asStringArray(parsed.compatibility),
  };
}

export function isPublicTermAllowed(term: string, vocabulary: VocabularyRecord): boolean {
  const normalized = term.trim();
  if (normalized.length === 0) return false;
  if (vocabulary.provisional_prefixes.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  const haystack = [...vocabulary.chosen_terms, ...vocabulary.schema_terms, ...vocabulary.aliases.map((alias) => alias.to)];
  const lower = normalized.toLowerCase();
  return haystack.some((item) => item === normalized || item.toLowerCase() === lower);
}

export function isPinnedCommit(value: string): boolean {
  return PINNED_COMMIT_PATTERN.test(value);
}
