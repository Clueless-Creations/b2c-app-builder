#!/usr/bin/env node
/**
 * Render PRODUCT.md from product.yaml.
 *
 *   b2c render-product --workspace <id-or-path> [--check]   one business workspace (registry ID or path)
 *   tsx tooling/render-product.ts --root <workspace> [--check]
 *   tsx tooling/render-product.ts [--check]                  maintainer form: template and reference workspaces
 *
 * Unknown arguments refuse before any write; the maintainer default never runs by accident.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProductInstanceDocument, productYamlPath } from "../catalog/ontology/instance-load.js";
import { loadWorldOntology } from "../catalog/ontology/load.js";
import { validateProductWorkspace } from "../catalog/ontology/product-workspace.js";
import { renderProductMarkdown } from "../catalog/ontology/render-product.js";
import { isMainModule, resolveCallerPath } from "../kernel/lib/cli.js";
import { resolveCliWorkspace } from "../kernel/session/status.js";
import { issue, reportAndExit, type Issue } from "./lib/launch-state.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = [
  "Usage:",
  "  b2c render-product --workspace <id-or-path>          write PRODUCT.md from product.yaml",
  "  b2c render-product --workspace <id-or-path> --check  report drift without writing",
  "  tsx tooling/render-product.ts [--root <workspace>] [--check]",
  "Without --workspace or --root the maintainer form renders the template and reference workspaces.",
].join("\n");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): { check: boolean; roots: string[] } {
  let check = false;
  let root: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") {
      check = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (token === "--root" || token === "--workspace") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) fail(`ISSUE render-product.missing_${token.slice(2)}: ${token} requires a workspace ID or path.`);
      if (root) fail("ISSUE render-product.conflicting_target: pass --workspace or --root once.");
      if (token === "--root") root = resolveCallerPath(value);
      else {
        const resolved = resolveCliWorkspace(value);
        if (!resolved.ok) fail(resolved.message);
        root = resolved.path;
      }
      index += 1;
      continue;
    }
    fail(`ISSUE render-product.unknown_argument: ${token}\n${USAGE}`);
  }
  return {
    check,
    roots: root ? [root] : [path.join(skillRoot, "surfaces/workspace-template/new-business"), path.join(skillRoot, "examples/workspace/business")],
  };
}

function main(): number {
  const { check, roots } = parseArgs(process.argv.slice(2));
  const ontology = loadWorldOntology(skillRoot);
  const issues: Issue[] = [];
  for (const root of roots) {
    const catalogIssues = validateProductWorkspace(root, ontology);
    if (check) {
      for (const item of catalogIssues) {
        issues.push(issue(item.severity, item.code, item.message, item.path));
      }
      continue;
    }
    const loadErrors = catalogIssues.filter((item) => item.code === "catalog_ontology.instance.missing" || item.code === "catalog_ontology.instance.invalid");
    if (loadErrors.length > 0) {
      for (const item of loadErrors) issues.push(issue(item.severity, item.code, item.message, item.path));
      continue;
    }
    const doc = loadProductInstanceDocument(productYamlPath(root, ontology.instanceDocument.path));
    writeFileSync(path.join(root, ontology.instanceDocument.renders), renderProductMarkdown(doc), "utf8");
  }
  if (check || issues.length > 0) {
    reportAndExit("product.yaml render", issues);
    return issues.some((item) => item.severity === "error") ? 1 : 0;
  }
  for (const root of roots) {
    console.log(`WROTE ${path.join(root, ontology.instanceDocument.renders)}`);
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
