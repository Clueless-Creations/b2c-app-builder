import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { boundedFileBytes } from "../../kernel/lib/bounded-file.js";
import { lint } from "@google/design.md/linter";
import { parse as parseYaml } from "yaml";
import { asString, isRecord, issue, type Issue } from "./launch-state.js";

export interface DesignMdSources {
  designPath: string;
  businessPath: string;
}

export interface PortableTypography {
  family: string;
  weight: string | number;
  size?: string;
  lineHeight?: number;
  letterSpacing?: string;
  fallbacks?: string[];
  resourceId?: string;
  nativeSize?: number;
  nativeTracking?: number;
}

export interface PortableDesignTokens {
  schemaVersion: "1.0.0";
  source: "DESIGN.md";
  tokens: {
    color: Record<string, string>;
    font: Record<string, PortableTypography>;
    radius: Record<string, string>;
    space: Record<string, string | number>;
    motion: Record<string, string>;
  };
}

export interface LoadedDesignSystem {
  markdown: string;
  frontmatter?: Record<string, unknown>;
  tokens?: PortableDesignTokens;
  issues: Issue[];
  sources: DesignMdSources;
  sourceHash?: string;
}

const REQUIRED_FRONTMATTER = ["version", "name", "description", "colors", "typography", "rounded", "spacing", "components"] as const;
const CANONICAL_SECTIONS = ["Overview", "Colors", "Typography", "Layout", "Elevation & Depth", "Shapes", "Components", "Do's and Don'ts"] as const;
const REQUIRED_MOTION = [
  "durationFast",
  "durationBase",
  "durationSlow",
  "durationCelebrate",
  "reducedMotionDuration",
  "easing",
  "durationReveal",
  "durationCinematic",
  "easingEmphasis",
  "easingSpring",
  "stagger",
] as const;

export function designMdSources(root: string): DesignMdSources {
  const resolved = path.resolve(root);
  return {
    designPath: path.join(resolved, "DESIGN.md"),
    businessPath: path.join(resolved, "studio/seed/business.json"),
  };
}

export function loadDesignSystem(root: string): LoadedDesignSystem {
  const sources = designMdSources(root);
  const issues: Issue[] = [];
  if (!existsSync(sources.designPath)) {
    issues.push(issue("error", "design_md.missing", "Root DESIGN.md is required and is the authored design authority.", "DESIGN.md"));
    return { markdown: "", issues, sources };
  }

  let markdown: string;
  try {
    markdown = boundedDesignBytes(sources.designPath, 1024 * 1024, "DESIGN.md").toString("utf8");
  } catch (error) {
    issues.push(issue("error", "design_md.read_limit", error instanceof Error ? error.message : String(error), "DESIGN.md"));
    return { markdown: "", issues, sources };
  }
  const parsed = parseFrontmatter(markdown, issues);
  const tokens = parsed ? normalizeTokens(markdown, parsed, issues) : undefined;
  if (parsed) validateTypographyFiles(root, parsed, issues);
  return {
    markdown,
    frontmatter: parsed,
    tokens,
    issues,
    sources,
    sourceHash: createHash("sha256").update(markdown).digest("hex").slice(0, 16),
  };
}

export function validateDesignMd(markdown: string): Issue[] {
  const issues: Issue[] = [];
  const parsed = parseFrontmatter(markdown, issues);
  if (parsed) normalizeTokens(markdown, parsed, issues);

  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]!.trim());
  const indexes = CANONICAL_SECTIONS.map((heading) => headings.indexOf(heading));
  if (indexes.some((index) => index < 0)) {
    issues.push(issue("error", "design_md.sections_missing", `DESIGN.md must contain canonical sections in order: ${CANONICAL_SECTIONS.join(", ")}.`));
  } else if (indexes.some((index, position) => position > 0 && index <= indexes[position - 1]!)) {
    issues.push(issue("error", "design_md.sections_order", "DESIGN.md canonical sections are out of order."));
  }
  for (const heading of CANONICAL_SECTIONS) {
    if (headings.filter((candidate) => candidate === heading).length > 1) {
      issues.push(issue("error", "design_md.section_duplicate", `DESIGN.md must contain only one ${heading} section.`));
    }
  }
  if (markdown.includes("GENERATED FILE")) {
    issues.push(issue("error", "design_md.generated_marker", "DESIGN.md is authored design authority. It must not identify itself as generated.", "DESIGN.md"));
  }

  try {
    for (const finding of lint(markdown).findings) {
      if (finding.severity === "info") continue;
      // These additive fields are validated above; do not suppress other upstream findings.
      if (
        finding.severity === "warning" &&
        /^typography\.[^.]+\.(nativeSize|nativeTracking|fallbacks|resourceId)$/.test(finding.path ?? "") &&
        finding.message.includes("not a recognized typography property")
      )
        continue;
      issues.push(
        issue(
          finding.severity === "warning" ? "warning" : "error",
          `design_md.google_${finding.rule ?? "lint"}`,
          finding.message,
          finding.path ? `DESIGN.md:${finding.path}` : "DESIGN.md",
        ),
      );
    }
  } catch (error) {
    issues.push(
      issue("error", "design_md.google_parse", `Google DESIGN.md validation failed: ${error instanceof Error ? error.message : String(error)}`, "DESIGN.md"),
    );
  }
  return dedupeIssues(issues);
}

export function hashDesignTokens(tokens: PortableDesignTokens): string {
  return createHash("sha256").update(JSON.stringify(tokens.tokens)).digest("hex").slice(0, 16);
}

export function parseFrontmatter(markdown: string, issues: Issue[]): Record<string, unknown> | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    issues.push(issue("error", "design_md.frontmatter_missing", "DESIGN.md must start with fenced YAML frontmatter.", "DESIGN.md"));
    return undefined;
  }
  try {
    const value = parseYaml(match[1] ?? "");
    if (!isRecord(value)) throw new Error("frontmatter must be a YAML map");
    for (const key of REQUIRED_FRONTMATTER) {
      if (!(key in value)) issues.push(issue("error", "design_md.frontmatter_key_missing", `DESIGN.md frontmatter must define ${key}.`, "DESIGN.md"));
    }
    return value;
  } catch (error) {
    issues.push(
      issue(
        "error",
        "design_md.frontmatter_invalid",
        `DESIGN.md frontmatter is invalid: ${error instanceof Error ? error.message : String(error)}`,
        "DESIGN.md",
      ),
    );
    return undefined;
  }
}

function normalizeTokens(markdown: string, frontmatter: Record<string, unknown>, issues: Issue[]): PortableDesignTokens | undefined {
  const colors = stringRecord(frontmatter.colors, "colors", issues);
  const rounded = stringRecord(frontmatter.rounded, "rounded", issues);
  const spacing = dimensionRecord(frontmatter.spacing, "spacing", issues);
  const typographyRoot = isRecord(frontmatter.typography) ? frontmatter.typography : {};
  const font: Record<string, PortableTypography> = {};
  for (const [name, raw] of Object.entries(typographyRoot)) {
    if (!isRecord(raw)) {
      issues.push(issue("error", "design_md.typography_invalid", `Typography token ${name} must be a map.`, "DESIGN.md"));
      continue;
    }
    const family = asString(raw.fontFamily)?.trim();
    const weight = raw.fontWeight;
    if (!family || (typeof weight !== "string" && typeof weight !== "number")) {
      issues.push(issue("error", "design_md.typography_invalid", `Typography token ${name} must define fontFamily and fontWeight.`, "DESIGN.md"));
      continue;
    }
    font[name] = { family, weight };
  }
  validateFoundation(frontmatter, issues);
  for (const [name, raw] of Object.entries(typographyRoot)) {
    if (!isRecord(raw) || !font[name]) continue;
    const enhanced = frontmatter.foundation !== undefined;
    if (!enhanced) continue;
    const fail = (message: string) => issues.push(issue("error", "design_md.typography_contract", `Typography ${name}: ${message}`, "DESIGN.md"));
    const dimension = (value: unknown, positive: boolean) =>
      typeof value === "string" && /^-?\d+(?:\.\d+)?(?:px|rem)$/.test(value) && (!positive || Number.parseFloat(value) > 0);
    if (!dimension(raw.fontSize, true)) fail("fontSize must be positive px or rem.");
    if (typeof raw.lineHeight !== "number" || !Number.isFinite(raw.lineHeight) || raw.lineHeight <= 0)
      fail("lineHeight must be a positive unitless multiplier.");
    if (!dimension(raw.letterSpacing, false)) fail("letterSpacing must use px or rem, including zero.");
    if (!Array.isArray(raw.fallbacks) || raw.fallbacks.length === 0 || raw.fallbacks.some((v) => typeof v !== "string" || !v.trim()))
      fail("fallbacks must list font families.");
    if (typeof raw.resourceId !== "string" || !raw.resourceId.trim()) fail("resourceId must identify a declared typography resource.");
    for (const key of ["nativeSize", "nativeTracking"] as const) {
      if (typeof raw[key] !== "number" || !Number.isFinite(raw[key]) || (key === "nativeSize" && raw[key] <= 0))
        fail(`${key} must explicitly declare the native logical value; CSS pixels and rem are not native units.`);
    }
    const weight = Number(raw.fontWeight);
    if (!Number.isFinite(weight) || weight < 1 || weight > 1000) fail("fontWeight must be numeric in the range 1–1000.");
    const foundation = isRecord(frontmatter.foundation) ? frontmatter.foundation : {};
    const resources = Array.isArray(foundation.typographyResources) ? foundation.typographyResources : [];
    if (
      frontmatter.foundation !== undefined &&
      !resources.some((resource) => isRecord(resource) && resource.id === raw.resourceId && resource.family === raw.fontFamily)
    )
      fail("resourceId and fontFamily must match the same typography resource.");
    font[name] = {
      ...font[name]!,
      size: raw.fontSize as string,
      lineHeight: raw.lineHeight as number,
      letterSpacing: raw.letterSpacing as string,
      fallbacks: raw.fallbacks as string[],
      resourceId: raw.resourceId as string,
      nativeSize: raw.nativeSize as number,
      nativeTracking: raw.nativeTracking as number,
    };
  }
  const motion = parseMotionTokens(markdown, issues);
  if (!colors || !rounded || !spacing || Object.keys(font).length === 0 || !motion) return undefined;
  return { schemaVersion: "1.0.0", source: "DESIGN.md", tokens: { color: colors, font, radius: rounded, space: spacing, motion } };
}

function parseMotionTokens(markdown: string, issues: Issue[]): Record<string, string> | undefined {
  const match = markdown.match(/<!--\s*b2c-motion-tokens\s*-->\s*```ya?ml\s*\n([\s\S]*?)\n```/i);
  if (!match) {
    issues.push(issue("error", "design_md.motion_tokens_missing", "The Motion section must include the authored b2c-motion-tokens YAML block.", "DESIGN.md"));
    return undefined;
  }
  try {
    const parsed = parseYaml(match[1] ?? "");
    if (!isRecord(parsed)) throw new Error("motion tokens must be a YAML map");
    const result: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value !== "string" && typeof value !== "number") {
        issues.push(issue("error", "design_md.motion_token_invalid", `Motion token ${name} must be a string or number.`, "DESIGN.md"));
        continue;
      }
      result[name] = String(value);
    }
    for (const name of REQUIRED_MOTION) {
      if (!result[name]) issues.push(issue("error", "design_md.motion_token_missing", `Motion token ${name} is required.`, "DESIGN.md"));
    }
    return result;
  } catch (error) {
    issues.push(
      issue(
        "error",
        "design_md.motion_tokens_invalid",
        `The b2c-motion-tokens block is invalid: ${error instanceof Error ? error.message : String(error)}`,
        "DESIGN.md",
      ),
    );
    return undefined;
  }
}

function stringRecord(value: unknown, label: string, issues: Issue[]): Record<string, string> | undefined {
  if (!isRecord(value)) {
    issues.push(issue("error", `design_md.${label}_invalid`, `${label} must be a YAML map.`, "DESIGN.md"));
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== "string" && typeof raw !== "number") {
      issues.push(issue("error", `design_md.${label}_invalid`, `${label}.${name} must be a string or number.`, "DESIGN.md"));
      continue;
    }
    result[name] = String(raw);
  }
  return result;
}

function dimensionRecord(value: unknown, label: string, issues: Issue[]): Record<string, string | number> | undefined {
  if (!isRecord(value)) {
    issues.push(issue("error", `design_md.${label}_invalid`, `${label} must be a YAML map.`, "DESIGN.md"));
    return undefined;
  }
  const result: Record<string, string | number> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (typeof raw !== "string" && typeof raw !== "number") {
      issues.push(issue("error", `design_md.${label}_invalid`, `${label}.${name} must be a string or number.`, "DESIGN.md"));
      continue;
    }
    result[name] = raw;
  }
  return result;
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.severity}\0${item.code}\0${item.message}\0${item.file ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Additive authoring contract. Missing foundation preserves legacy designs; new templates opt in. */
export function validateFoundation(frontmatter: Record<string, unknown>, issues: Issue[]): void {
  if (frontmatter.foundation === undefined) return;
  const fail = (message: string) => issues.push(issue("error", "design_md.foundation", message, "DESIGN.md"));
  const raw = frontmatter.foundation;
  if (!isRecord(raw)) {
    fail("foundation must be a versioned map.");
    return;
  }
  const allowed = ["version", "communicationPriorities", "rationale", "identityInvariants", "referenceInfluences", "typographyResources"];
  for (const key of Object.keys(raw)) if (!allowed.includes(key)) fail(`Unknown foundation field: ${key}.`);
  if (raw.version !== 1) fail("foundation.version must be 1.");
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const texts = (value: unknown) => Array.isArray(value) && value.length > 0 && value.every(text);
  for (const key of ["communicationPriorities", "identityInvariants"]) if (!texts(raw[key])) fail(`foundation.${key} must be a nonempty list of decisions.`);
  const rows = (key: string, keys: string[], required = true): Record<string, unknown>[] => {
    const value = raw[key];
    if (!Array.isArray(value) || (required && value.length === 0)) {
      fail(`foundation.${key} must be ${required ? "a nonempty" : "an"} array.`);
      return [];
    }
    return value.flatMap((row) => {
      if (!isRecord(row)) {
        fail(`foundation.${key} entries must be maps.`);
        return [];
      }
      for (const key of Object.keys(row)) if (!keys.includes(key)) fail(`Unknown foundation.${key} entry field.`);
      return [row];
    });
  };
  for (const row of rows("rationale", ["decision", "kind", "reason", "evidence"])) {
    if (!text(row.decision) || !text(row.reason)) fail("Each rationale needs a decision and reason.");
    if (!["evidence", "hypothesis", "legibility", "medium-constraint"].includes(String(row.kind)))
      fail("Rationale kind must distinguish evidence, hypothesis, legibility, or medium-constraint.");
    if (row.kind === "evidence" && !text(row.evidence)) fail("Evidence rationale needs a source locator; a declared locator is not verification.");
  }
  for (const row of rows("referenceInfluences", ["source", "adopt", "avoid"], false)) {
    if (![row.source, row.adopt, row.avoid].every(text)) fail("Reference influences need source, adopt, and avoid.");
  }
  const resources = rows("typographyResources", [
    "id",
    "family",
    "mode",
    "source",
    "license",
    "scripts",
    "fallbacks",
    "expansionTest",
    "path",
    "sha256",
    "licensePath",
  ]);
  const ids = resources.map((row) => row.id);
  if (new Set(ids).size !== ids.length) fail("Typography resource ids must be unique.");
  for (const row of resources) {
    if (!["system", "local", "remote"].includes(String(row.mode))) fail("Typography resource mode must be system, local, or remote.");
    if (row.mode === "local" && (!text(row.path) || !text(row.licensePath) || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)))
      fail("Local typography resources require a workspace-relative path, licensePath, and sha256 of the actual font bytes.");
    if (row.mode !== "local" && (row.path !== undefined || row.sha256 !== undefined || row.licensePath !== undefined))
      fail("Only local typography resources carry path and sha256; remote source metadata is not loading proof.");
    if (![row.id, row.family, row.source, row.license, row.expansionTest].every(text) || !texts(row.scripts) || !texts(row.fallbacks))
      fail("Typography resources need id, family, source, license, scripts, fallbacks, and a representative expansion test plan or evidence locator.");
  }
}

function validateTypographyFiles(root: string, frontmatter: Record<string, unknown>, issues: Issue[]): void {
  const foundation = isRecord(frontmatter.foundation) ? frontmatter.foundation : {};
  const resources = Array.isArray(foundation.typographyResources) ? foundation.typographyResources : [];
  for (const resource of resources) {
    if (!isRecord(resource) || resource.mode !== "local" || typeof resource.path !== "string") continue;
    try {
      const base = realpathSync(root);
      const candidate = path.resolve(base, resource.path);
      if (path.isAbsolute(resource.path) || !candidate.startsWith(`${base}${path.sep}`)) throw new Error("path must remain within the workspace");
      const actual = realpathSync(candidate);
      if (!actual.startsWith(`${base}${path.sep}`) || !statSync(actual).isFile())
        throw new Error("font must be a file within the workspace, including after resolving symlinks");
      if (typeof resource.licensePath !== "string" || path.isAbsolute(resource.licensePath)) throw new Error("licensePath must be workspace-relative");
      const licensePath = realpathSync(path.resolve(base, resource.licensePath));
      if (
        !licensePath.startsWith(`${base}${path.sep}`) ||
        !statSync(licensePath).isFile() ||
        !boundedDesignBytes(licensePath, 1024 * 1024, "font notice")
          .toString("utf8")
          .trim()
      )
        throw new Error("licensePath must resolve to a nonempty notice file within the workspace");
      if (
        createHash("sha256")
          .update(boundedDesignBytes(actual, 128 * 1024 * 1024, "font resource"))
          .digest("hex") !== resource.sha256
      )
        throw new Error("font bytes do not match sha256");
    } catch (error) {
      issues.push(
        issue(
          "error",
          "design_md.typography_resource",
          `Typography resource ${String(resource.id)}: ${error instanceof Error ? error.message : String(error)}`,
          "DESIGN.md",
        ),
      );
    }
  }
}

/** Referenced local bytes remain dependencies of the one DESIGN.md authority. */
export function typographyDependencyPaths(frontmatter: Record<string, unknown> | undefined): string[] {
  const foundation = isRecord(frontmatter?.foundation) ? frontmatter.foundation : {};
  const resources = Array.isArray(foundation.typographyResources) ? foundation.typographyResources : [];
  return [
    ...new Set(
      resources.flatMap((resource) =>
        isRecord(resource) && resource.mode === "local"
          ? [resource.path, resource.licensePath].filter((value): value is string => typeof value === "string")
          : [],
      ),
    ),
  ];
}

/** Preflight before allocation, then recheck inode/type/size while reading at most the observed bytes. */
function boundedDesignBytes(file: string, maximum: number, label: string): Buffer {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw new Error(`${label} must be a regular file no larger than ${maximum} bytes.`);
  return boundedFileBytes(file, stat.size);
}
