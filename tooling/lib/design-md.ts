import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { lint } from "@google/design.md/linter";
import { parse as parseYaml } from "yaml";
import { asString, isRecord, issue, type Issue } from "./launch-state.js";

export interface DesignMdSources {
  designPath: string;
  businessPath: string;
}

export interface PortableDesignTokens {
  schemaVersion: "1.0.0";
  source: "DESIGN.md";
  tokens: {
    color: Record<string, string>;
    font: Record<string, { family: string; weight: string | number }>;
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

  const markdown = readFileSync(sources.designPath, "utf8");
  const parsed = parseFrontmatter(markdown, issues);
  const tokens = parsed ? normalizeTokens(markdown, parsed, issues) : undefined;
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

function parseFrontmatter(markdown: string, issues: Issue[]): Record<string, unknown> | undefined {
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
  const font: Record<string, { family: string; weight: string | number }> = {};
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
