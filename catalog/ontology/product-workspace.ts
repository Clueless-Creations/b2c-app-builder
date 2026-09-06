import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CatalogIssue } from "../types.js";
import { loadProductInstanceDocument, productYamlPath } from "./instance-load.js";
import type { ProductInstanceDocument } from "./instance-types.js";
import { validateProductInstanceDocument } from "./instance-validate.js";
import { renderProductMarkdown } from "./render-product.js";
import type { WorldOntology } from "./types.js";

function error(code: string, message: string, issuePath?: string): CatalogIssue {
  return { severity: "error", code, message, path: issuePath };
}

export function validateProductWorkspace(workspaceRoot: string, ontology: WorldOntology): CatalogIssue[] {
  const yamlRelative = ontology.instanceDocument.path;
  const yamlPath = productYamlPath(workspaceRoot, yamlRelative);
  const markdownPath = path.join(workspaceRoot, ontology.instanceDocument.renders);
  const issues: CatalogIssue[] = [];

  if (!existsSync(yamlPath)) {
    return [error("catalog_ontology.instance.missing", `${yamlRelative} is required as the authored product store`, yamlRelative)];
  }

  let doc: ProductInstanceDocument;
  try {
    doc = loadProductInstanceDocument(yamlPath);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return [error("catalog_ontology.instance.invalid", message, yamlRelative)];
  }

  issues.push(...validateProductInstanceDocument(doc, ontology, yamlRelative));

  if (!existsSync(markdownPath)) {
    issues.push(
      error(
        "catalog_ontology.instance.markdown_missing",
        `${ontology.instanceDocument.renders} is required as the rendered product index`,
        ontology.instanceDocument.renders,
      ),
    );
    return issues;
  }

  const expected = renderProductMarkdown(doc);
  const actual = readFileSync(markdownPath, "utf8");
  if (actual !== expected) {
    issues.push(
      error(
        "catalog_ontology.instance.stale_markdown",
        `${ontology.instanceDocument.renders} does not match the render of ${yamlRelative}; run b2c render-product --workspace <id-or-path>`,
        ontology.instanceDocument.renders,
      ),
    );
  }

  return issues;
}
