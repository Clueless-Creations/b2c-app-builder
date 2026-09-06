#!/usr/bin/env node
/**
 * check-portfolio-registry.ts — structure floor for the multi-app portfolio surface.
 *
 * strategy/PORTFOLIO_REGISTRY.md is the one page a repeat founder reads across every
 * business they run: per-app stage/MRR/verdict rows, an allocation paragraph,
 * cross-app learnings, and the next-launch pipeline. Most launches stay
 * single-business, so the file is optional — this check is a no-op when it is
 * absent. Once the file exists, its sections must all be present: a registry
 * that lists apps but never allocates, or allocates but never carries
 * learnings forward, is a status page, not a portfolio decision surface.
 *
 * Like every artifact-contract check, this grades structure, not truth — the
 * numbers in the rows come from each app's own RevenueCat/PostHog records and
 * the founder's weekly review is the backstop for their honesty.
 *
 * npm script: check:portfolio-registry
 * Usage: tsx checks/validation/business/operations/check-portfolio-registry.ts --root /path/to/founder-workspace
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { issue, parseCliArgs, readText, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const args = parseCliArgs(process.argv.slice(2));
const issues: Issue[] = [];

const registryRelative = "strategy/PORTFOLIO_REGISTRY.md";
const registryPath = path.join(args.root, registryRelative);

if (existsSync(registryPath)) {
  const registry = (readText(args.root, registryRelative) ?? "").toLowerCase();

  const requiredSections = ["Businesses", "Allocation", "Cross-App Learnings", "Next Launch Pipeline"];
  for (const section of requiredSections) {
    if (registry.includes(section.toLowerCase())) continue;
    issues.push(
      issue(
        "error",
        `portfolio_registry.section_missing.${section.toLowerCase().replaceAll(/[^a-z]+/g, "_")}`,
        `${registryRelative} is missing the "${section}" section. The registry must carry the whole board — businesses, allocation, learnings, and the next-launch pipeline — or it is a status page, not a decision surface.`,
        registryRelative,
      ),
    );
  }

  if (!registry.includes("verdict")) {
    issues.push(
      issue(
        "error",
        "portfolio_registry.verdict_column_missing",
        `${registryRelative} carries no verdict column. Each business row must show its latest Kill, Hold, Or Scale decision so allocation follows verdicts instead of habit.`,
        registryRelative,
      ),
    );
  }

  // Headings alone are not a board. Real business rows are the substance; the
  // shipped template's _example:_ row marks the not-yet-in-use state and stays
  // inert, but a registry someone "filled" by stripping the example while
  // listing nothing is a blank board claiming to exist.
  const raw = readText(args.root, registryRelative) ?? "";
  const businessesSection = markdownSection(raw, "Businesses");
  const realBusinessRows = businessesSection
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .filter((line) => !line.includes("---"))
    .filter((line) => !/^\|\s*business\s*\|/i.test(line.trim()))
    .filter((line) => !/_example_|_example:/i.test(line))
    .filter((line) => line.split("|").some((cell, index) => index > 0 && cell.trim().length > 0));
  const hasExampleMarker = /_example:/i.test(businessesSection);
  if (realBusinessRows.length === 0 && !hasExampleMarker) {
    issues.push(
      issue(
        "error",
        "portfolio_registry.businesses_empty",
        `${registryRelative} lists no businesses. Fill the Businesses table from each app's own records, or delete the file until a second business exists.`,
        registryRelative,
      ),
    );
  }
}

reportAndExit("Portfolio registry check", issues);

/** The block from a `## <heading>` line to the next `## ` heading (or EOF). */
function markdownSection(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s*${heading}`, "i");
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}
