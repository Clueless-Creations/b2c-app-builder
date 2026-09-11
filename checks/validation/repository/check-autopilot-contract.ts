#!/usr/bin/env node
/**
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 *
 * npm script: check:autopilot
 * Usage: tsx checks/validation/repository/check-autopilot-contract.ts [--skill-root /path/to/skill]
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { asArray, asString, flagString, isRecord, issue, parseFlags, reportAndExit } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);

function parseArgs(argv: string[]): { skillRoot: string } {
  const flags = parseFlags(argv, [{ flags: ["--skill-root", "--root"], key: "skillRoot" }]);
  return { skillRoot: flagString(flags, "skillRoot") ?? defaultSkillRoot };
}

function includesCaseInsensitive(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function frontmatterAndBody(text: string): { frontmatter?: Record<string, unknown>; body: string; error?: string } {
  if (!text.startsWith("---")) {
    return { body: text, error: "SKILL.md must start with YAML frontmatter." };
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return { body: text, error: "SKILL.md frontmatter closing delimiter is missing." };
  }
  const rawFrontmatter = text.slice(3, end).trim();
  const body = text.slice(end + "\n---".length);
  try {
    const parsed = parseYaml(rawFrontmatter);
    if (!isRecord(parsed)) {
      return { body, error: "SKILL.md frontmatter must parse to an object." };
    }
    return { frontmatter: parsed, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { body, error: `SKILL.md frontmatter is invalid YAML: ${message}` };
  }
}

const { skillRoot } = parseArgs(process.argv.slice(2));
const issues = [];
const skillPath = path.join(skillRoot, "SKILL.md");
const evalPath = path.join(skillRoot, "checks/validation/repository/evals/triggering/autopilot-triggering.yaml");

if (!existsSync(skillPath)) {
  issues.push(issue("error", "autopilot.skill_missing", `SKILL.md is missing at ${skillPath}.`, path.relative(skillRoot, skillPath)));
}
if (!existsSync(evalPath)) {
  issues.push(issue("error", "autopilot.evals_missing", `Autopilot triggering evals are missing at ${evalPath}.`, path.relative(skillRoot, evalPath)));
}

if (existsSync(skillPath) && existsSync(evalPath)) {
  const skillText = readFileSync(skillPath, "utf8");
  const evals = parseYaml(readFileSync(evalPath, "utf8"));
  const parsedSkill = frontmatterAndBody(skillText);
  if (parsedSkill.error) {
    issues.push(issue("error", "autopilot.frontmatter.invalid", parsedSkill.error, "SKILL.md"));
  }
  if (!isRecord(evals)) {
    issues.push(
      issue(
        "error",
        "autopilot.evals.invalid",
        "autopilot-triggering.yaml must parse to an object.",
        "checks/validation/repository/evals/triggering/autopilot-triggering.yaml",
      ),
    );
  }

  if (parsedSkill.frontmatter && isRecord(evals)) {
    const description = asString(parsedSkill.frontmatter.description) ?? "";
    const contract = isRecord(evals.description_contract) ? evals.description_contract : {};
    const maxChars = typeof contract.max_chars === "number" ? contract.max_chars : 1024;

    if (!description.trim()) {
      issues.push(issue("error", "autopilot.description.missing", "Skill frontmatter must include a description.", "SKILL.md"));
    }
    if (description.length > maxChars) {
      issues.push(
        issue("error", "autopilot.description.too_long", `Description is ${description.length} characters; keep it at or below ${maxChars}.`, "SKILL.md"),
      );
    }
    if (/[<>]/.test(description)) {
      issues.push(
        issue("error", "autopilot.description.angle_bracket", "Anthropic-compatible skill descriptions must not contain XML angle brackets.", "SKILL.md"),
      );
    }

    for (const term of asArray(contract.required_terms)
      .map(asString)
      .filter((item): item is string => Boolean(item))) {
      if (!includesCaseInsensitive(description, term)) {
        issues.push(issue("error", "autopilot.description.required_term_missing", `Description should include trigger/scope term: ${term}.`, "SKILL.md"));
      }
    }

    // Symmetric with body_contract.forbidden_terms below. No retired term is
    // scoped to the description today, so this stays inert (asArray(undefined)
    // === []) until one is; it exists so a future description-level retirement
    // does not need a new loop shape, only a yaml entry.
    for (const term of asArray(contract.forbidden_terms)
      .map(asString)
      .filter((item): item is string => Boolean(item))) {
      if (includesCaseInsensitive(description, term)) {
        issues.push(
          issue("error", "autopilot.description.forbidden_term_present", `Description must not reintroduce retired routing term: ${term}.`, "SKILL.md"),
        );
      }
    }

    for (const item of asArray(evals.should_trigger)) {
      if (!isRecord(item)) {
        issues.push(
          issue(
            "error",
            "autopilot.should_trigger.invalid",
            "Each should_trigger eval must be an object.",
            "checks/validation/repository/evals/triggering/autopilot-triggering.yaml",
          ),
        );
        continue;
      }
      const id = asString(item.id) ?? "unknown";
      const prompt = asString(item.prompt);
      if (!prompt?.trim()) {
        issues.push(
          issue(
            "error",
            `autopilot.should_trigger.${id}.prompt_missing`,
            "Each should_trigger eval needs a realistic prompt.",
            "checks/validation/repository/evals/triggering/autopilot-triggering.yaml",
          ),
        );
      }
      for (const term of asArray(item.description_terms)
        .map(asString)
        .filter((value): value is string => Boolean(value))) {
        if (!includesCaseInsensitive(description, term)) {
          issues.push(
            issue(
              "error",
              `autopilot.should_trigger.${id}.description_term_missing`,
              `Description should cover trigger prompt with term: ${term}.`,
              "SKILL.md",
            ),
          );
        }
      }
    }

    for (const item of asArray(evals.should_not_trigger)) {
      if (!isRecord(item)) {
        issues.push(
          issue(
            "error",
            "autopilot.should_not_trigger.invalid",
            "Each should_not_trigger eval must be an object.",
            "checks/validation/repository/evals/triggering/autopilot-triggering.yaml",
          ),
        );
        continue;
      }
      const id = asString(item.id) ?? "unknown";
      const prompt = asString(item.prompt);
      if (!prompt?.trim()) {
        issues.push(
          issue(
            "error",
            `autopilot.should_not_trigger.${id}.prompt_missing`,
            "Each should_not_trigger eval needs a realistic prompt.",
            "checks/validation/repository/evals/triggering/autopilot-triggering.yaml",
          ),
        );
      }
      for (const term of asArray(item.negative_terms)
        .map(asString)
        .filter((value): value is string => Boolean(value))) {
        if (!includesCaseInsensitive(description, term)) {
          issues.push(
            issue(
              "error",
              `autopilot.should_not_trigger.${id}.negative_term_missing`,
              `Description should include negative trigger guard: ${term}.`,
              "SKILL.md",
            ),
          );
        }
      }
    }
  }

  if (isRecord(evals)) {
    const bodyContract = isRecord(evals.body_contract) ? evals.body_contract : {};
    const maxBytes = typeof bodyContract.max_bytes === "number" ? bodyContract.max_bytes : 6500;
    if (Buffer.byteLength(skillText, "utf8") > maxBytes) {
      issues.push(
        issue(
          "error",
          "autopilot.body.context_budget",
          `SKILL.md exceeds the ${maxBytes}-byte routing budget. Move conditional procedures to linked references.`,
          "SKILL.md",
        ),
      );
    }
    // Moving a procedure out of the root must not drop its contract. Only directly linked,
    // package-local files can satisfy these checks; missing guidance stays an error.
    for (const reference of asArray(evals.reference_contracts)) {
      const relative = isRecord(reference) ? asString(reference.path) : undefined;
      if (!relative || !/^agents\/skills\/b2c-app-builder\/references\/[a-z0-9-]+\.md$/u.test(relative)) {
        issues.push(issue("error", "autopilot.reference.invalid", "Reference contracts must name a local business procedure.", "SKILL.md"));
        continue;
      }
      const target = path.join(skillRoot, relative);
      const parts = relative.split("/");
      if (
        parts.some((_, index) => {
          const candidate = path.join(skillRoot, ...parts.slice(0, index + 1));
          return existsSync(candidate) && lstatSync(candidate).isSymbolicLink();
        }) ||
        !existsSync(target) ||
        !lstatSync(target).isFile()
      ) {
        issues.push(issue("error", "autopilot.reference.missing", `Required procedure is missing or symlinked: ${relative}.`, relative));
        continue;
      }
      if (!parsedSkill.body.includes(`](${relative})`)) {
        issues.push(issue("error", "autopilot.reference.unlinked", `SKILL.md must link directly to ${relative}.`, "SKILL.md"));
      }
      const content = readFileSync(target, "utf8");
      if (!isRecord(reference)) continue;
      for (const term of asArray(reference.required_terms)
        .map(asString)
        .filter((value): value is string => Boolean(value))) {
        if (!includesCaseInsensitive(content, term)) {
          issues.push(issue("error", "autopilot.reference.required_term_missing", `Procedure must preserve contract term: ${term}.`, relative));
        }
      }
      for (const term of asArray(reference.forbidden_terms)
        .map(asString)
        .filter((value): value is string => Boolean(value))) {
        if (includesCaseInsensitive(content, term)) {
          issues.push(issue("error", "autopilot.reference.forbidden_term_present", `Procedure must not contain: ${term}.`, relative));
        }
      }
    }

    for (const term of asArray(bodyContract.required_terms)
      .map(asString)
      .filter((item): item is string => Boolean(item))) {
      if (!includesCaseInsensitive(parsedSkill.body, term)) {
        issues.push(issue("error", "autopilot.body.required_term_missing", `SKILL.md body should include autopilot run-contract term: ${term}.`, "SKILL.md"));
      }
    }

    // required_terms alone cannot catch a retired routing path reintroduced
    // alongside the current ones — every current term would still match and
    // the gate would stay green. See autopilot-triggering.yaml's
    // body_contract.forbidden_terms comment for which terms and why.
    for (const term of asArray(bodyContract.forbidden_terms)
      .map(asString)
      .filter((item): item is string => Boolean(item))) {
      if (includesCaseInsensitive(parsedSkill.body, term)) {
        issues.push(issue("error", "autopilot.body.forbidden_term_present", `SKILL.md body must not reintroduce retired routing term: ${term}.`, "SKILL.md"));
      }
    }
  }
}

reportAndExit("Autopilot trigger contract check", issues);
