import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { loadKnowledgePackages } from "../../catalog/knowledge-packages.js";
import type { CatalogKnowledgePackage } from "../../catalog/types.js";
import type { ContributionManifest } from "../../contracts/contribution/contract.js";
import { bigrams, tokenize, truncate } from "./manifest-io.js";
import type { SourceIntake } from "./intake.js";

/**
 * Existing local owners a contribution would touch: the catalog knowledge packages and the
 * source registry rows that already cover a source URL or the same topic. A match is a proposal
 * for the maintainer, ordered deterministically and capped, never an automatic merge.
 */
export const SOURCE_REGISTRY_FILE = "checks/validation/repository/source-registry.yaml";
const MAX_OWNERS = 12;
const MIN_SHARED_TOKENS = 2;

export type ExistingOwner = ContributionManifest["existingOwners"][number];

export interface RegistryRow {
  readonly id: string;
  readonly url: string;
  readonly locations: string[];
}

export function loadSourceRegistry(skillRoot: string): RegistryRow[] {
  const file = path.join(skillRoot, SOURCE_REGISTRY_FILE);
  if (!existsSync(file)) return [];
  const parsed = YAML.parse(readFileSync(file, "utf8")) as { sources?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.sources)) return [];
  const rows: RegistryRow[] = [];
  for (const entry of parsed.sources as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.url !== "string") continue;
    rows.push({
      id: row.id,
      url: row.url,
      locations: Array.isArray(row.locations) ? row.locations.filter((item): item is string => typeof item === "string") : [],
    });
  }
  return rows;
}

function canonical(url: string): string {
  return url.trim().replace(/\/+$/u, "");
}

export interface OwnerMatchInput {
  readonly goal: string;
  readonly sources: readonly SourceIntake[];
}

export interface OwnerMatchContext {
  readonly packages: readonly CatalogKnowledgePackage[];
  readonly registry: readonly RegistryRow[];
}

export function loadOwnerContext(skillRoot: string): OwnerMatchContext {
  return { packages: loadKnowledgePackages(skillRoot), registry: loadSourceRegistry(skillRoot) };
}

interface ScoredOwner {
  readonly owner: ExistingOwner;
  readonly rank: number;
}

/** Owners matched by exact URL first, then by keyword overlap; capped and deterministic. */
export function findExistingOwners(input: OwnerMatchInput, context: OwnerMatchContext): ExistingOwner[] {
  const scored = new Map<string, ScoredOwner>();
  const record = (owner: ExistingOwner, rank: number): void => {
    const existing = scored.get(owner.id);
    if (!existing || existing.rank < rank) scored.set(owner.id, { owner, rank });
  };
  const urls = new Set(
    input.sources
      .map((source) => source.record.canonicalUrl)
      .filter((url): url is string => Boolean(url))
      .map(canonical),
  );
  if (urls.size) {
    for (const row of context.registry) {
      if (urls.has(canonical(row.url))) record({ id: row.id, path: row.locations[0] ?? SOURCE_REGISTRY_FILE, match: `registry:${row.id}` }, 1_000_000);
    }
    for (const pkg of context.packages) {
      if (pkg.sources.some((source) => urls.has(canonical(source.url))))
        record({ id: pkg.id, path: pkg.manifestPath, match: `knowledge-source:${pkg.id}` }, 900_000);
    }
  }
  const subjectText = [input.goal, ...input.sources.flatMap((source) => [source.record.title, ...source.headings.slice(0, 40)])].join("\n");
  const subjectTokens = new Set(tokenize(subjectText));
  const subjectPhrases = new Set(bigrams(subjectText));
  for (const pkg of context.packages) {
    const ownerText = [pkg.title, pkg.loadWhen, pkg.applicabilityNotes ?? ""].join("\n");
    const shared = tokenize(ownerText).filter((token) => subjectTokens.has(token));
    const phrases = bigrams(ownerText).filter((phrase) => subjectPhrases.has(phrase));
    if (shared.length < MIN_SHARED_TOKENS && phrases.length === 0) continue;
    const label = phrases.length && shared.length < MIN_SHARED_TOKENS ? `keywords: ${phrases[0]}` : `keywords: ${shared.slice(0, 6).sort().join(", ")}`;
    record({ id: pkg.id, path: pkg.manifestPath, match: truncate(label, 400) }, shared.length * 10 + phrases.length);
  }
  return [...scored.values()]
    .sort((a, b) => b.rank - a.rank || a.owner.id.localeCompare(b.owner.id))
    .slice(0, MAX_OWNERS)
    .map((entry) => entry.owner);
}

/** The strongest knowledge-package owner for a unit target, when one exists. */
export function primaryKnowledgeOwner(owners: readonly ExistingOwner[], context: OwnerMatchContext): CatalogKnowledgePackage | undefined {
  for (const owner of owners) {
    const pkg = context.packages.find((candidate) => candidate.id === owner.id);
    if (pkg) return pkg;
  }
  return undefined;
}
