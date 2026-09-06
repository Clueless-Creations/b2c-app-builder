import { readFileSync } from "node:fs";
import path from "node:path";
import { loadProductInstanceDocument } from "../../../catalog/ontology/instance-load.js";
import { renderProductMarkdown } from "../../../catalog/ontology/render-product.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

/** The shipped reference workspace must not reintroduce the retired scope instructions. */
export function register(harness: Harness): void {
  const root = path.join(skillRoot, "examples/workspace/business");
  harness.check("reference product scope does not teach staged incomplete delivery", () => {
    const product = loadProductInstanceDocument(path.join(root, "product.yaml"));
    const rendered = readFileSync(path.join(root, "PRODUCT.md"), "utf8");
    assert(!/\b(?:V[12]|MVP|minimum viable)\b/i.test(product.copy.completeScope), "authored complete scope contains retired delivery doctrine");
    assert(!/\b(?:V[12]|MVP|minimum viable)\b/i.test(rendered), "rendered reference product contains retired delivery doctrine");
    assert(product.copy.completeScope.includes("acceptance"), "scope must name required-system acceptance");
    assert(product.copy.completeScope.includes("Exclusions with rationale"), "scope must distinguish deliberate exclusions");
  });
  harness.check("reference product is exactly regenerated from its canonical source", () => {
    const product = loadProductInstanceDocument(path.join(root, "product.yaml"));
    assert(readFileSync(path.join(root, "PRODUCT.md"), "utf8") === renderProductMarkdown(product), "PRODUCT.md drifted from product.yaml");
  });
}
