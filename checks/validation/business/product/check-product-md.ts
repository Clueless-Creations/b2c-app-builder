#!/usr/bin/env node
import { validateProductPriceEvidence } from "../money/price-evidence.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorldOntology } from "../../../../catalog/ontology/load.js";
import { validateProductWorkspace } from "../../../../catalog/ontology/product-workspace.js";
import { parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const args = parseCliArgs(process.argv.slice(2));
const productPath = path.join(args.root, "PRODUCT.md");
const issues: Issue[] = validateProductPriceEvidence(args.root);
const error = (code: string, message: string): void => {
  issues.push({ severity: "error", code, message });
};
const requiredSections = [
  "Promise, user, and problem",
  "Evidence and category",
  "Core loop and first value",
  "Complete product scope",
  "Requirements and acceptance",
  "Journey and downstream routes",
  "Metrics and monetization posture",
  "Risks and open questions",
  "Decision log",
  "Source ownership and state boundary",
] as const;

const ontology = loadWorldOntology(skillRoot);
if (ontology.instanceDocument.status === "active") {
  for (const item of validateProductWorkspace(args.root, ontology)) {
    const code =
      item.code === "catalog_ontology.instance.markdown_missing"
        ? "PRODUCT_MD"
        : item.code === "catalog_ontology.instance.stale_markdown"
          ? "PRODUCT_MD_STALE"
          : "PRODUCT_YAML";
    issues.push({ severity: item.severity, code, message: item.message, file: item.path });
  }
}

if (!existsSync(productPath)) {
  error("PRODUCT_MD", "Root PRODUCT.md is required as the rendered product index");
} else {
  const markdown = readFileSync(productPath, "utf8");
  if (!/^---\n[\s\S]*?\n---\n/m.test(markdown) || !/^# .+ Product\s*$/m.test(markdown)) {
    error("PRODUCT_MD", "PRODUCT.md must have front matter and a product title");
  }
  for (const key of ["version", "name", "description", "status"]) {
    if (!new RegExp(`^${key}:\\s*\\S`, "m").test(markdown)) error("PRODUCT_MD", `PRODUCT.md front matter must define ${key}`);
  }
  const headings = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]!.trim());
  const indexes = requiredSections.map((heading) => headings.indexOf(heading));
  if (indexes.some((index) => index < 0)) error("PRODUCT_MD", `PRODUCT.md must contain canonical sections in order: ${requiredSections.join(", ")}`);
  else if (indexes.some((index, position) => position > 0 && index <= indexes[position - 1]!))
    error("PRODUCT_MD", "PRODUCT.md canonical sections are out of order");
  for (const heading of requiredSections) {
    if (headings.filter((candidate) => candidate === heading).length > 1) error("PRODUCT_MD", `PRODUCT.md must contain only one ${heading} section`);
  }
  if (/(?:^|[`/ ])(?:product\/)?SPEC\.md(?:[`\s),]|$)/m.test(markdown)) error("PRODUCT_MD", "PRODUCT.md must not route product authority to SPEC.md");
  const links = [...markdown.matchAll(/`([^`]+\.md)`/g)].map((match) => match[1]!).filter(Boolean);
  for (const link of links) {
    if (!existsSync(path.join(args.root, link))) error("PRODUCT_MD", `PRODUCT.md links to missing detailed path: ${link}`);
  }
}
reportAndExit("PRODUCT.md check", issues);
