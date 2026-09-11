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
    assert(
      /^\|\s*\[Product\]\(knowledge\/README\.md#product\)\s*\|\s*Prep & design\s*\|/m.test(readme),
      "README coverage table must use Prep & design for Product",
    );
    assert(
      /^\|\s*\[Experience\]\(knowledge\/README\.md#experience\)\s*\|\s*Prep & design\s*\|/m.test(readme),
      "README coverage table must use Prep & design for Experience",
    );
    assert(ethos.includes("| **Prep & design**"), "ethos station table must use Prep & design");
    assert(ethos.includes("Product and Experience"), "ethos must keep the catalog identity beside the display label");
    assert(svg.includes("PREP &amp; DESIGN"), "Sheet 1 must label station 2 Prep &amp; design");
    assert(svg.includes("Prep &amp; design"), "SVG accessibility text must name Prep &amp; design");
    assert(!/<desc[^>]*>[^<]*Prep & design/.test(svg), "SVG desc must escape Prep &amp; design");
    assert(svg.includes("THE KITCHEN LAYOUT"), "Sheet 1 title may keep kitchen as the whole-system layout");
    assert(readme.includes("laid out like a restaurant kitchen"), "narrative kitchen for the whole system remains valid");
    assert(readme.includes("docs/guides/runtime-package.md#find-a-command"), "README must point at grouped help instead of a second command table");
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
    const consolePages = readFileSync(path.join(repoRoot, "hosted", "builder-console", "console", "pages.ts"), "utf8");
    assert(consolePages.includes("Use plain labels"), "console must keep the utility-surface voice rule");
    assert(consolePages.includes("Manage billing"), "billing controls stay literal");
    assert(consolePages.includes("Create key"), "key controls stay literal");
    assert(!consolePages.includes("Send it out"), "console must not theme authority as kitchen slang");
    assert(!consolePages.includes("the pass"), "console utility copy must not use the pass as a control label");
  });

  kitchenCase("kitchen-vocabulary: Sheet 1 Prep & design fits the station 2 band", () => {
    const svg = readFileSync(path.join(repoRoot, "docs", "assets", "business-primitives.svg"), "utf8");
    const label = svg.match(/<text x="(\d+(?:\.\d+)?)" y="(\d+(?:\.\d+)?)" class="mono ink" font-size="(\d+(?:\.\d+)?)">PREP &amp; DESIGN<\/text>/);
    assert(label !== null, "Sheet 1 must keep a single PREP &amp; DESIGN station-2 label");
    const x = Number(label[1]);
    const y = Number(label[2]);
    const fontSize = Number(label[3]);
    const estimatedWidth = "PREP & DESIGN".length * fontSize * 0.62;
    assert(x >= 200 && x <= 280, `station 2 label x must stay in the prep band, got ${x}`);
    assert(y >= 140 && y <= 180, `station 2 label y must stay above the prep table, got ${y}`);
    assert(x + estimatedWidth < 500, `station 2 label must not reach the walk-in, estimated right edge ${x + estimatedWidth}`);
    assert(!/PREP &amp; DESIGN[\s\S]{0,80}textLength=/.test(svg), "station 2 label must not be squeezed with textLength");
    assert(svg.includes("Menu planning, product, experience, design, words"), "station 2 caption must keep the catalog responsibilities");
    assert(svg.includes('viewBox="0 0 1000 600"'), "Sheet 1 viewBox stays 1000x600 so half-width preview is a scale, not a crop");
  });
}
