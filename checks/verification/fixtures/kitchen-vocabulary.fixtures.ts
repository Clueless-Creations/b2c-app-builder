/**
 * Kitchen-language boundary: station display labels, ethos policy, and the AGENTS link.
 * Repo-only: ethos, README, SVG, and root AGENTS.md do not ship in the installed runtime.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { assert, repoCheckoutPresent, repoRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  const kitchenCase: (label: string, fn: () => void) => void = repoCheckoutPresent()
    ? harness.check
    : (label) => harness.skip(label, `repo-only: kitchen vocabulary lives in repository docs (checked at ${repoRoot})`);

  kitchenCase("kitchen-vocabulary: Prep & design labels the Product and Experience station", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    const ethos = readFileSync(path.join(repoRoot, "docs", "ethos.md"), "utf8");
    const svg = readFileSync(path.join(repoRoot, "docs", "assets", "business-primitives.svg"), "utf8");
    assert(readme.includes("| Product                 | Prep & design"), "README coverage table must use Prep & design for Product");
    assert(readme.includes("| Experience              | Prep & design"), "README coverage table must use Prep & design for Experience");
    assert(ethos.includes("| **Prep & design**"), "ethos station table must use Prep & design");
    assert(ethos.includes("Product and Experience"), "ethos must keep the catalog identity beside the display label");
    assert(svg.includes("PREP &amp; DESIGN"), "Sheet 1 must label station 2 Prep &amp; design");
    assert(svg.includes("Prep &amp; design"), "SVG accessibility text must name Prep &amp; design");
    assert(!/<desc[^>]*>[^<]*Prep & design/.test(svg), "SVG desc must escape Prep &amp; design");
    assert(svg.includes("THE KITCHEN LAYOUT"), "Sheet 1 title may keep kitchen as the whole-system layout");
    assert(readme.includes("laid out like a restaurant kitchen"), "narrative kitchen for the whole system remains valid");
  });

  kitchenCase("kitchen-vocabulary: ethos owns the boundary and AGENTS links to it", () => {
    const ethos = readFileSync(path.join(repoRoot, "docs", "ethos.md"), "utf8");
    const agents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
    assert(ethos.includes("## Kitchen-language boundary"), "ethos must own the kitchen-language boundary section");
    assert(ethos.includes("Not the name of the Product and Experience station"), "boundary must stop kitchen-as-station overload");
    assert(ethos.includes("Send it out"), "ethos must keep the bad deployment-label example");
    assert(ethos.includes("| Brigade | Coordinated agents in prose"), "ethos must keep Brigade as prose, not a product name");
    assert(agents.includes("docs/ethos.md#kitchen-language-boundary"), "AGENTS must link the ethos kitchen-language boundary");
    assert(agents.includes("is not the shipped product name"), "AGENTS must keep B2C App Builder as the shipped product name");
    assert(!agents.includes("## Kitchen vocabulary manifesto"), "AGENTS must not duplicate the glossary");
  });
}
