/**
 * Builder house style routing: one writing owner, thin adapters, packaged knowledge isolation.
 * Repo-only for AGENTS/CONTRIBUTING/PR template; the no-slop section also ships in knowledge/.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { assert, repoCheckoutPresent, repoRoot, skillRoot, type Harness } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("house-style: no-slop marks Original builder house style and isolates customer voice", () => {
    const writing = readFileSync(path.join(skillRoot, "knowledge", "words", "no-slop-writing.md"), "utf8");
    assert(writing.includes("## 9. Original: Builder house style"), "no-slop-writing.md must include Original: Builder house style");
    assert(!writing.includes("## 9. Original: Builder House Style"), "house-style heading must stay sentence case");
    assert(writing.includes("Repository-original"), "house style must be marked Original");
    assert(writing.includes("Keep the accepted customer voice"), "house style must preserve customer app voice");
    assert(writing.includes("doctor.node_too_old"), "house style must preserve literal error identifiers");
    assert(writing.includes("The remote effect is unknown. Reconcile before retrying."), "house style must keep a timeout-uncertainty example");
    assert(writing.includes("Do not promise background work."), "house style must keep a handoff example");
    assert(!writing.includes("../../docs/ethos.md"), "packaged house style must not depend on a repository-only ethos path");
  });

  const repoCase: (label: string, fn: () => void) => void = repoCheckoutPresent()
    ? harness.check
    : (label) => harness.skip(label, `repo-only: agent writing routes live in repository docs (checked at ${repoRoot})`);

  repoCase("house-style: AGENTS routes writers; host adapters stay thin", () => {
    const agents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
    const claude = readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8");
    const contributing = readFileSync(path.join(repoRoot, "CONTRIBUTING.md"), "utf8");
    const template = readFileSync(path.join(repoRoot, ".github", "PULL_REQUEST_TEMPLATE.md"), "utf8");
    const ste100 = readFileSync(path.join(skillRoot, "knowledge", "engineering", "technical-documentation-ste100.md"), "utf8");
    const workspace = readFileSync(path.join(skillRoot, "surfaces", "workspace-template", "repo-agent-entrypoints", "AGENTS.md"), "utf8");
    assert(agents.includes("## Writing and kitchen language"), "AGENTS must have one writing and kitchen-language section");
    assert(agents.includes("Original: Builder house style"), "AGENTS must point at the house-style section");
    assert(claude.includes("Read `AGENTS.md` first"), "CLAUDE adapter must keep routing to AGENTS");
    assert(!claude.includes("Kitchen-language boundary"), "CLAUDE must not copy the kitchen glossary");
    assert(contributing.includes("builder house style"), "CONTRIBUTING must remind reviewers of house style");
    assert(contributing.includes("audit:ci -- --lane fast"), "house-style reminder must not revert the CI cadence section");
    assert(template.includes("kitchen-language boundary"), "PR template must include the house-style checklist item");
    assert(ste100.includes("does not scan README"), "STE100 must not claim a blanket README word-count scan");
    assert(!workspace.includes("Prep & design"), "business workspace AGENTS must not receive builder kitchen station labels");
  });

  harness.check("house-style: authored LaunchBench scenarios stay lint-only", () => {
    const scenarioDir = path.join(skillRoot, "checks", "validation", "repository", "evals", "launchbench");
    const required = [
      "house-style-inspect-read-only-claim.yaml",
      "house-style-fixture-as-provider-ready.yaml",
      "house-style-timeout-uncertain-mutation.yaml",
      "house-style-customer-voice.yaml",
      "house-style-readme-kitchen.yaml",
      "house-style-adr-api-example.yaml",
      "house-style-mixed-readme.yaml",
      "house-style-partial-pr.yaml",
      "house-style-handoff.yaml",
      "house-style-literal-controls.yaml",
      "house-style-packaged-ethos-path.yaml",
      "house-style-entrypoints.yaml",
    ];
    for (const file of required) {
      const text = readFileSync(path.join(scenarioDir, file), "utf8");
      assert(!/^behavioral:\s*true\s*$/m.test(text), `${file} is authored/linted only; do not mark it live behavioral`);
      assert(text.includes("expected_guardrail:"), `${file} must keep the LaunchBench authored format`);
    }
    const harnessDoc = readFileSync(
      path.join(skillRoot, "checks", "validation", "repository", "launchbench-evals.md"),
      "utf8",
    );
    assert(harnessDoc.includes("house-style-*.yaml"), "launchbench-evals.md must name the authored house-style examples");
    assert(harnessDoc.includes("must omit `behavioral: true`"), "launchbench-evals.md must keep house-style examples lint-only");
  });
}
