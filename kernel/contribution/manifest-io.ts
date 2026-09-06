import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { contributionManifestSchema, type ContributionManifest, type ContributionScope, type ContributionUnit } from "../../contracts/contribution/contract.js";

/**
 * `contribution.yaml` and `ADOPTION_MAP.md` live at a contribution root. The YAML on disk uses
 * snake_case keys like the authored upstream manifests (kernel/contribution/upstreams-load.ts);
 * the typed contract uses camelCase. Unknown fields are rejected by the strict schemas, so a
 * manifest never carries data the contract cannot express. This module also holds the small
 * text helpers the intake, plan, check, preview, and evaluate halves share.
 */
export const CONTRIBUTION_MANIFEST_FILE = "contribution.yaml";
export const ADOPTION_MAP_FILE = "ADOPTION_MAP.md";

export function contributionYamlPath(root: string): string {
  return path.join(root, CONTRIBUTION_MANIFEST_FILE);
}

export function adoptionMapPath(root: string): string {
  return path.join(root, ADOPTION_MAP_FILE);
}

export function snakeToCamel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeToCamel);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key.replace(/_([a-z0-9])/gu, (_match, char: string) => char.toUpperCase()),
        snakeToCamel(entry),
      ]),
    );
  }
  return value;
}

export function camelToSnake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelToSnake);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key.replace(/[A-Z]/gu, (char) => `_${char.toLowerCase()}`), camelToSnake(entry)]),
    );
  }
  return value;
}

export function formatZodError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
    return (error as { issues: Array<{ path: PropertyKey[]; message: string }> }).issues
      .slice(0, 6)
      .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

export function parseContributionManifest(text: string, sourceLabel = CONTRIBUTION_MANIFEST_FILE): ContributionManifest {
  const parsed = YAML.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`contribution.manifest_invalid: ${sourceLabel} must be a mapping.`);
  const result = contributionManifestSchema.safeParse(snakeToCamel(parsed));
  if (!result.success) throw new Error(`contribution.manifest_invalid: ${sourceLabel}: ${formatZodError(result.error)}`);
  return result.data;
}

export function readContributionManifest(root: string): ContributionManifest {
  const file = contributionYamlPath(root);
  if (!existsSync(file)) throw new Error(`contribution.manifest_missing: ${file}`);
  return parseContributionManifest(readFileSync(file, "utf8"), file);
}

export function renderContributionManifestYaml(manifest: ContributionManifest): string {
  return YAML.stringify(camelToSnake(contributionManifestSchema.parse(manifest)), { lineWidth: 120 });
}

export function writeContributionManifest(root: string, manifest: ContributionManifest): string {
  mkdirSync(root, { recursive: true });
  const file = contributionYamlPath(root);
  writeFileSync(file, renderContributionManifestYaml(manifest), "utf8");
  return file;
}

/* ------------------------------------------------------------------------------------------ */
/* Shared text helpers                                                                          */
/* ------------------------------------------------------------------------------------------ */

export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

/** Contract slug: lowercase, digits, dots and dashes, starting with a letter or digit. */
export function slugify(value: string, maxLength = 80): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .replace(/[-.]+$/u, "")
    .slice(0, maxLength)
    .replace(/[-.]+$/u, "");
  return slug || "source";
}

export function truncate(value: string, maxLength: number): string {
  const single = value.replace(/\s+/gu, " ").trim();
  return single.length <= maxLength ? single : `${single.slice(0, maxLength - 3)}...`;
}

/** Markdown headings (levels 1 to 3) as plain text. */
export function markdownHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/u.exec(line);
    if (match?.[2]) headings.push(match[2].replace(/[`*_]/gu, "").trim());
  }
  return headings;
}

export function normalizeTopic(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_"'()[\]{}:;,.!?]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a an the and or but for nor so yet of to in on at by from with without within into onto over under between through during before after " +
    "again further once here there when where why how what which who whom this that these those is are was were be been being have has had " +
    "having do does did doing will would should could can may might must shall not no yes all any each every some such only own same other " +
    "more most many much very just than then them they their theirs it its our ours your yours you we us i me my mine his her hers him she he " +
    "one two three also about above below out off up down per via etc ie eg see set get let put way use used using uses user users make makes " +
    "made new add adds added app apps file files guide readme example examples section step steps note notes need needs needed like based well " +
    "still already always never true false null undefined into across around along among because until unless while whether either neither " +
    "both few if as up out too own thing things something anything everything nothing"
  ).split(/\s+/u),
);

/** Lowercase tokens of three or more characters, stopwords and pure numbers removed, first-seen order. */
export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d+$/u.test(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

/** Adjacent-word phrases that survive stopword removal, for multi-word matches. */
export function bigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/u.test(word));
  const phrases = new Set<string>();
  for (let index = 0; index + 1 < words.length; index += 1) phrases.add(`${words[index]} ${words[index + 1]}`);
  return [...phrases];
}

/* ------------------------------------------------------------------------------------------ */
/* Scope routing                                                                                */
/* ------------------------------------------------------------------------------------------ */

/**
 * Maintainer-owned layers: the mechanisms (kernel, contracts, entrypoints, adapters, tooling),
 * TypeScript under catalog/ (composition code, not authored knowledge manifests), and validator
 * code under checks/. Authored evaluation scenarios under checks/ (YAML) stay contribution
 * targets, as the adoption guide's scope table lists checks among contribution targets.
 */
const MAINTENANCE_PATH = /^(?:kernel|contracts|entrypoints|adapters|tooling)\/|^catalog\/[^/]+\.ts$|^catalog\/(?!knowledge\/)[^/]+\/.*\.ts$|^checks\/.*\.ts$/u;

/**
 * Workspace-owned paths the planner emits for a business scope. `packages/` is deliberately not
 * here: a contribution root keeps its own `packages/` (examples/contributions/*), so that prefix
 * decides nothing on its own.
 */
const WORKSPACE_PATH = /^research\//u;

/** Repository layers a unit path can name; a path under one of them is a change to this repository. */
const REPOSITORY_LAYER_PATH = /^(?:kernel|contracts|entrypoints|adapters|tooling|catalog|checks|examples|knowledge|docs|surfaces|hosted|agents)\//u;

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

/** True for a repository path that only a maintainer changes (not an example extension or a knowledge reference). */
export function isMaintenancePath(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = normalizePath(value);
  if (normalized.startsWith("examples/extensions/")) return false;
  return MAINTENANCE_PATH.test(normalized);
}

/** True for a path that belongs to one business workspace rather than this repository. */
export function isWorkspacePath(value: string | undefined): value is string {
  return Boolean(value) && WORKSPACE_PATH.test(normalizePath(value!));
}

export function goalMentionsBusiness(goal: string): boolean {
  return /\b(this|our|my) app\b|\bworkspace\b|\bproduct\.yaml\b|\bDESIGN\.md\b|\bPRODUCT\.md\b/iu.test(goal);
}

/** The maintenance-path tokens a goal names, e.g. `kernel/engine/compile.ts`. */
export function goalPaths(goal: string): string[] {
  return [
    ...goal.matchAll(/(?:^|[\s"'`(])((?:kernel|contracts|entrypoints|adapters|catalog|checks|examples|knowledge|tooling|surfaces)\/[A-Za-z0-9_./-]+)/gu),
  ].map((match) => match[1]!.replace(/[.,;:)]+$/u, ""));
}

export interface ScopeInference {
  readonly verdict: ContributionScope;
  readonly reason: string;
  readonly maintenanceTargets: string[];
}

/**
 * The routing verdict follows the intended target and effect (ADR-0005 row 5): a unit or goal
 * path under a maintainer-owned layer is maintenance; a workspace path or a goal that names one
 * app is business; everything else (knowledge references, extension packages, evaluation
 * scenarios, showcases) is a contribution. The caller's declared scope never enters here.
 */
export function inferScope(goal: string, units: ReadonlyArray<Pick<ContributionUnit, "target">>): ScopeInference {
  const maintenanceTargets = [
    ...new Set([...units.map((unit) => unit.target.path).filter(isMaintenancePath), ...goalPaths(goal).filter(isMaintenancePath)]),
  ].sort();
  if (maintenanceTargets.length) {
    return { verdict: "maintenance", reason: `targets under a maintainer-owned layer: ${maintenanceTargets.join(", ")}`, maintenanceTargets };
  }
  const workspaceTargets = [...new Set(units.map((unit) => unit.target.path).filter(isWorkspacePath))].sort();
  if (workspaceTargets.length) {
    return { verdict: "business", reason: `targets under a workspace-owned path: ${workspaceTargets.join(", ")}`, maintenanceTargets };
  }
  if (goalMentionsBusiness(goal) && !units.some(hasRepositoryTarget)) {
    return { verdict: "business", reason: "the goal names this app or a workspace artifact and no unit targets this repository", maintenanceTargets };
  }
  return { verdict: "contribution", reason: "targets are knowledge references, extension packages, evaluations, or showcases", maintenanceTargets };
}

/** True when the unit would change a knowledge reference or a file under a repository layer. */
function hasRepositoryTarget(unit: Pick<ContributionUnit, "target">): boolean {
  if (unit.target.kind === "existing-reference" || unit.target.kind === "new-reference") return true;
  return Boolean(unit.target.path) && REPOSITORY_LAYER_PATH.test(normalizePath(unit.target.path!));
}

export interface ReconciledScope {
  /** Always the inferred verdict. A declaration is recorded, never obeyed. */
  readonly scope: ContributionScope;
  readonly reason: string;
}

/**
 * The effective scope is the inferred verdict. A declared scope is recorded in the reason so the
 * reviewer sees what the caller asked for. A declaration narrower than the inference (anything
 * but maintenance while the targets touch a maintainer-owned layer) is refused through
 * `onConflict`, because the caller would otherwise change core mechanisms under a lesser label.
 */
export function reconcileScope(declared: ContributionScope | undefined, inferred: ScopeInference, onConflict: (message: string) => never): ReconciledScope {
  if (declared !== undefined && declared !== "maintenance" && inferred.verdict === "maintenance") {
    return onConflict(
      `scope ${declared} cannot change maintainer-owned paths (${inferred.maintenanceTargets.join(", ")}); use scope maintenance or retarget the units.`,
    );
  }
  if (declared === undefined || declared === inferred.verdict) return { scope: inferred.verdict, reason: inferred.reason };
  return { scope: inferred.verdict, reason: `declared ${declared}; inferred ${inferred.verdict} because ${inferred.reason}` };
}

export function readTextIfExists(file: string, maxBytes = 1024 * 1024): string | undefined {
  try {
    if (!existsSync(file)) return undefined;
    const buffer = readFileSync(file);
    if (buffer.byteLength > maxBytes) return undefined;
    return buffer.toString("utf8");
  } catch {
    return undefined;
  }
}
