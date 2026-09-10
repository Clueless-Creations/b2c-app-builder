#!/usr/bin/env node
/**
 * b2c new — create a small planning workspace for a consumer app.
 *
 * The expert library stays in the installed package. A new workspace receives only the authored
 * product, design, research, and agent pointers that day-zero work needs.
 * Later workflows create their own artifacts when they become relevant.
 *
 *   b2c new <slug> [--dir <path>] [--name "Display Name"] [--idea "Hypothesis"]
 *
 * The slug obeys the workspace-registry rule (^[a-z0-9][a-z0-9-]*$). It is a provisional
 * research identity until PRODUCT.md is accepted. Generated projections are not copied.
 *
 * Product archetype starters and generated Design Room output are not copied. Research must
 * select the product and stack before the system materializes downstream work.
 *
 * Exit codes: 0 = scaffolded; 1 = invalid slug, occupied target, or seed drift.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadProductInstanceDocument, productYamlPath } from "../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../catalog/ontology/render-product.js";
import { isMainModule } from "../lib/cli.js";
import { writeFounderIntake } from "./founder-brief.js";
import type { FounderBriefSourceIntent } from "../../contracts/public-api/contract.js";
import { loadDesignSystem, validateDesignMd } from "../../tooling/lib/design-md.js";
import { resolveSkillRoot } from "../../tooling/lib/skill-root.js";

const skillRoot = resolveSkillRoot(import.meta.url);
const SLUG_RULE = /^[a-z0-9][a-z0-9-]*$/;
const IDEA_DESCRIPTION = "{{IDEA_DESCRIPTION}}";
const IDEA_HYPOTHESIS = "{{IDEA_HYPOTHESIS}}";

/**
 * Templates under new-business/ that ship with the package but are not day-zero files.
 * ADR-0001 (docs/decisions/0001-metric-contracts-validator-and-template-paths.md) places the
 * optional metric-contracts template here and says it is installed only when a recipe selects
 * it. No recipe selects templates yet, so `new` leaves these out of the scaffold.
 */
const OPTIONAL_TEMPLATES = new Set(["operations/metric-contracts.json"]);

function isOptionalTemplate(relativePath: string): boolean {
  return OPTIONAL_TEMPLATES.has(relativePath.split(path.sep).join("/"));
}

function callerCwd(): string {
  return process.env.B2C_APP_BUILDER_CALLER_CWD?.trim() || process.cwd();
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inline(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function createPlanningWorkspace(input: { directory: string; slug: string; name: string; hypothesis?: string; mandate?: string }): {
  directory: string;
  slug: string;
  name: string;
  sourceIntent?: FounderBriefSourceIntent;
} {
  const slug = input.slug,
    name = inline(input.name),
    idea = input.hypothesis === undefined ? undefined : inline(input.hypothesis);
  if (!SLUG_RULE.test(slug) || !name || (input.hypothesis !== undefined && !idea)) throw new Error("business.invalid_creation_input");
  let target = path.resolve(input.directory);
  if (existsSync(target) && (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink() || readdirSync(target).length > 0)) {
    throw new Error("business.target_occupied");
  }

  const template = path.join(skillRoot, "surfaces/workspace-template", "new-business");
  if (!existsSync(template)) {
    throw new Error("business.template_missing");
  }

  const destination = target;
  mkdirSync(path.dirname(destination), { recursive: true });
  target = mkdtempSync(path.join(path.dirname(destination), ".b2c-create-"));
  try {
    mkdirSync(target, { recursive: true });
    cpSync(template, target, {
      recursive: true,
      filter: (source) => !isOptionalTemplate(path.relative(template, source)),
    });

    const designPath = path.join(target, "DESIGN.md");
    const authoredDesign = readFileSync(designPath, "utf8")
      .replace(/^name:\s*App Name$/m, `name: ${JSON.stringify(name)}`)
      .replace(/^# App Name Design System$/m, `# ${name} Design System`);
    writeFileSync(designPath, authoredDesign, "utf8");

    const productYaml = path.join(target, "product.yaml");
    if (existsSync(productYaml)) {
      const hypothesis = idea ?? "No idea supplied. Research and select an opportunity before product work.";
      const description = idea ? `Unvalidated idea: ${idea}` : "Consumer app opportunity has not been selected.";
      const authoredYaml = readFileSync(productYaml, "utf8")
        .replace(/^  name: App Name$/m, `  name: ${JSON.stringify(name)}`)
        .replace(/^  slug: app-name$/m, `  slug: ${JSON.stringify(slug)}`)
        .replace(`"${IDEA_DESCRIPTION}"`, JSON.stringify(description))
        .replace(IDEA_HYPOTHESIS, hypothesis);
      writeFileSync(productYaml, authoredYaml, "utf8");
      const doc = loadProductInstanceDocument(productYamlPath(target));
      writeFileSync(path.join(target, "PRODUCT.md"), renderProductMarkdown(doc), "utf8");
    }

    const templates = path.join(skillRoot, "surfaces/workspace-template", "repo-agent-entrypoints");
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const source = path.join(templates, file);
      if (existsSync(source)) {
        const rendered = readFileSync(source, "utf8").replaceAll("{{APP_NAME}}", name);
        writeFileSync(path.join(target, file), rendered, "utf8");
      }
    }
    const cursorSource = path.join(templates, ".cursor/rules/agents.mdc");
    if (existsSync(cursorSource)) {
      mkdirSync(path.join(target, ".cursor/rules"), { recursive: true });
      cpSync(cursorSource, path.join(target, ".cursor/rules/agents.mdc"));
    }

    const sourceIntent = input.mandate === undefined ? undefined : writeFounderIntake({ target, slug, mandate: input.mandate });

    const design = loadDesignSystem(target);
    const designIssues = [...design.issues, ...validateDesignMd(design.markdown)];
    if (designIssues.some((item) => item.severity === "error")) {
      throw new Error("business.design_seed_invalid");
    }
    renameSync(target, destination);
    return { directory: destination, slug, name, ...(sourceIntent ? { sourceIntent } : {}) };
  } finally {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
}

function main(): number {
  const argv = process.argv.slice(2);
  const VALUE_FLAGS = new Set(["--dir", "--name", "--slug", "--idea"]);
  for (const [index, token] of argv.entries()) {
    if (!token.startsWith("--")) continue;
    if (!VALUE_FLAGS.has(token)) {
      console.error(`ISSUE new.unknown_flag: ${token} is not supported.`);
      return 1;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      console.error(`ISSUE new.missing_value: ${token} requires a value.`);
      return 1;
    }
  }
  const slug =
    argv.find((token, index) => !token.startsWith("--") && !VALUE_FLAGS.has(argv[index - 1] ?? "")) ??
    (argv.includes("--slug") ? argv[argv.indexOf("--slug") + 1] : undefined);
  const flagValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  if (!slug || !SLUG_RULE.test(slug)) {
    console.error('Usage: b2c new <slug> [--dir <path>] [--name "Display Name"] [--idea "Hypothesis"] — slugs use lowercase letters, digits, and hyphens');
    return 1;
  }
  const name = inline(flagValue("--name") ?? titleCase(slug));
  const idea = flagValue("--idea") ? inline(flagValue("--idea")!) : undefined;
  if (!name) {
    console.error("ISSUE new.name_empty: --name must contain visible text.");
    return 1;
  }
  if (flagValue("--idea") !== undefined && !idea) {
    console.error("ISSUE new.idea_empty: --idea must contain visible text when supplied.");
    return 1;
  }
  const target = path.resolve(callerCwd(), flagValue("--dir") ?? slug);

  try {
    createPlanningWorkspace({ directory: target, slug, name, hypothesis: idea });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "business.creation_failed");
    return 1;
  }

  console.log(
    [
      `CREATED ${target} — "${name}" (${slug})`,
      "",
      idea
        ? "NEXT Research the hypothesis. Record Go, Pivot, or Kill in product.yaml, then run b2c render-product --workspace <dir>; set status to accepted only for Go."
        : "NEXT Research viable opportunities. Record the selected hypothesis in product.yaml, then run b2c render-product --workspace <dir>; set status to accepted only for Go.",
      "",
      "For a short local build, continue from PRODUCT.md and DESIGN.md without runtime setup.",
      `For durable multi-session work, run: b2c bootstrap --workspace ${target} --apply`,
    ].join("\n"),
  );
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
