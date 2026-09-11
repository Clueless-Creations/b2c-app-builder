#!/usr/bin/env node
import path from "node:path";
import { composeCatalog } from "../../../catalog/index.js";
import { operators } from "../../../catalog/operators.js";
import { validateCatalog } from "../../../catalog/validate.js";
import { loadKnowledgePackages } from "../../../catalog/knowledge-packages.js";
import { validateKnowledgePackages } from "../../../catalog/knowledge-validation.js";
import { domains } from "../../../catalog/domains.js";
import { workflows } from "../../../catalog/workflows/index.js";
import { contextPacks } from "../../../catalog/context-packs.js";
import { loadPinnedKnowledgeFreshnessNow } from "../../../tooling/lib/knowledge-freshness-pin.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";
import { validateDefinitionOverlays } from "../../../catalog/overlays.js";

/**
 * Wired entry point for the `check:catalog` npm script. `catalog/validate.ts` carries the
 * real logic (and its own `tsx catalog/validate.ts` CLI, for direct maintainer use) — this
 * file exists only so the wired, LaunchBench-tracked command resolves under
 * `checks/validation/repository/`, matching the three-root split in tooling/lib/script-paths.ts
 * (docs/architecture.md: checks/validation/business/ proves a business launch, checks/validation/repository/
 * proves the skill itself, tooling/ holds renderers/runners/probes/shared lib). catalog/ is the
 * v2 definition-graph-as-data tree (R20) and intentionally sits outside that split as authored
 * data plus its own directly-runnable validator/renderer, so this wrapper is the seam between
 * the two conventions rather than a reason to fold all of catalog/ into SCRIPT_ROOTS.
 *
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 */
const defaultSkillRoot = resolveSkillRoot(import.meta.url);
const { skillRoot, sourceSnapshot } = parseArgs(process.argv.slice(2));
const catalog = composeCatalog(skillRoot);
const knowledgeNow = loadPinnedKnowledgeFreshnessNow(skillRoot, sourceSnapshot);
const issues = [
  ...validateCatalog(catalog, skillRoot),
  ...validateKnowledgePackages(
    loadKnowledgePackages(skillRoot),
    skillRoot,
    domains,
    workflows,
    contextPacks,
    [...catalog.roles, ...operators],
    knowledgeNow,
  ).map((item) => ({
    severity: "error" as const,
    code: item.code,
    message: item.message,
    path: undefined,
  })),
  ...validateDefinitionOverlays(catalog, skillRoot),
];

const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");

// D1 (#32): one of the three reportAndExit outliers — its own reporter tail, not the shared one,
// so --json is hand-wired here rather than landing for free.
if (process.argv.includes("--json")) {
  const failures = issues.map((item) => ({
    severity: item.severity,
    rule: item.code,
    message: item.message,
    ...(item.path !== undefined ? { path: item.path } : {}),
  }));
  process.stdout.write(`${JSON.stringify({ pass: errors.length === 0, failures })}\n`);
  if (errors.length > 0) process.exitCode = 1;
} else {
  console.log("Catalog graph integrity check");
  for (const issue of issues) console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${issue.path ? ` (${issue.path})` : ""}`);
  console.log(
    `${errors.length} error(s), ${warnings.length} warning(s), ${catalog.domains.length} domain(s), ${catalog.workflows.length} workflow(s), ${catalog.references.length} reference(s), ${catalog.gates.length} gate(s), composition ${catalog.composition?.fingerprint ?? "unpinned"}.`,
  );
  if (errors.length > 0) process.exitCode = 1;
}

function parseArgs(argv: string[]): { skillRoot: string; sourceSnapshot?: string } {
  let skillRoot = defaultSkillRoot;
  let sourceSnapshot: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    if ((argv[index] === "--skill-root" || argv[index] === "--root") && argv[index + 1]) {
      skillRoot = path.resolve(argv[++index]!);
    } else if (argv[index] === "--source-snapshot") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--source-snapshot requires a path.");
      sourceSnapshot = path.resolve(value);
    }
  }
  return { skillRoot, sourceSnapshot };
}
