import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadProductInstanceDocument } from "../../../catalog/ontology/instance-load.js";
import { validateProductInstanceDocument } from "../../../catalog/ontology/instance-validate.js";
import { loadWorldOntology } from "../../../catalog/ontology/load.js";
import { validateProductWorkspace } from "../../../catalog/ontology/product-workspace.js";
import { validateWorldOntology } from "../../../catalog/ontology/validate.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("product-instance: the shipped reference workspace validates", () => {
    const issues = validateProductWorkspace(path.join(skillRoot, "examples/workspace/business"), loadWorldOntology(skillRoot));
    assert(issues.length === 0, issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  });

  harness.check("product-instance: the shipped template workspace validates", () => {
    const issues = validateProductWorkspace(path.join(skillRoot, "surfaces/workspace-template/new-business"), loadWorldOntology(skillRoot));
    assert(issues.length === 0, issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  });

  harness.check("product-instance: an unknown class fails closed", () => {
    const doc = loadProductInstanceDocument(path.join(skillRoot, "examples/workspace/business/product.yaml"));
    doc.instances[0] = { ...doc.instances[0]!, classId: "class.not-a-class" };
    const issues = validateProductInstanceDocument(doc, loadWorldOntology(skillRoot));
    assert(
      issues.some((issue) => issue.code === "catalog_ontology.instance.unknown_class"),
      `expected unknown class, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("product-instance: a stale PRODUCT.md fails closed", () => {
    const root = harness.makeTempDir("stale-product-md");
    cpSync(path.join(skillRoot, "examples/workspace/business/product.yaml"), path.join(root, "product.yaml"));
    writeFileSync(path.join(root, "PRODUCT.md"), "# Stale\n", "utf8");
    const issues = validateProductWorkspace(root, loadWorldOntology(skillRoot));
    assert(
      issues.some((issue) => issue.code === "catalog_ontology.instance.stale_markdown"),
      `expected stale markdown, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });

  harness.check("product-instance: active ontology without product.yaml fails closed", () => {
    const ontology = structuredClone(loadWorldOntology(skillRoot));
    ontology.instanceDocument.path = "missing-product.yaml";
    ontology.planes = ontology.planes.map((plane) => (plane.id === "plane.world" ? { ...plane, store: "missing-product.yaml" } : plane));
    const tmp = harness.makeTempDir("missing-product-yaml");
    mkdirSync(path.join(tmp, "surfaces/workspace-template/new-business"), { recursive: true });
    mkdirSync(path.join(tmp, "examples/workspace/business"), { recursive: true });
    mkdirSync(path.join(tmp, "catalog/ontology"), { recursive: true });
    writeFileSync(path.join(tmp, ontology.instanceDocument.schemaPath), "{}\n", "utf8");
    const issues = validateWorldOntology(ontology, undefined, tmp);
    assert(
      issues.some((issue) => issue.code === "catalog_ontology.instance.missing"),
      `expected missing instance document, got ${issues.map((issue) => issue.code).join(", ")}`,
    );
  });
}
