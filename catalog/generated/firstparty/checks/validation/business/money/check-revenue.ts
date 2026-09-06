#!/usr/bin/env node
/** Validate the selected monetization contract; provider-native semantics belong to its adapter. */
import { validateProductPriceEvidence } from "./price-evidence.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  asString,
  flagString,
  getPath,
  issue,
  loadProjectState,
  parseCliArgs,
  parseFlags,
  readText,
  reportAndExit,
  type Issue,
} from "../../../../tooling/lib/launch-state.js";
import { defaultMonetizationProviderContract } from "../../../../catalog/recipes/default-monetization.js";
import { loadProviderContracts } from "../../../../adapters/providers/load.js";
import { validateRevenueCatRevenue } from "../../../../adapters/providers/revenuecat/revenue-validation.js";
import { validateMonetizationOutcomes, monetizationCapabilityIssues } from "../../../../adapters/providers/monetization-validation.js";
import { unmigratedBreakingSummaries } from "../../../../adapters/providers/evaluate.js";
const args = parseCliArgs(process.argv.slice(2));
const loaded = loadProjectState(args);
const issues: Issue[] = [...loaded.issues];
const revenueActive = ["running", "succeeded"].includes(asString(getPath(loaded.state, "lanes.revenue.status")) ?? "");
issues.push(...validateProductPriceEvidence(args.root, revenueActive, asString(getPath(loaded.state, "project.owner")) ?? ""));
const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--capability-delta"], key: "capabilityDelta" },
  { flags: ["--provider-contract-version"], key: "providerContractVersion", kind: "string", strict: true },
  { flags: ["--provider-contract"], key: "providerContract", kind: "string", strict: true },
]);
const skillRoot = flagString(flags, "skillRoot") ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const selected = flagString(flags, "providerContract") ?? defaultMonetizationProviderContract();
const expectedVersion = flagString(flags, "providerContractVersion");
if (
  expectedVersion &&
  !loadProviderContracts(skillRoot).contracts.some((entry) => entry.id === selected && entry.version === expectedVersion && entry.kind === "billing")
) {
  issues.push(issue("error", "revenue.provider_contract.version_mismatch", "The selected validation contract version is not installed.", "catalog/providers"));
  reportAndExit("Revenue lane check", issues);
}
if (selected === "revenuecat") {
  issues.push(...validateRevenueCatRevenue(args, loaded, { skillRoot, capabilityDelta: flagString(flags, "capabilityDelta") }));
} else {
  const contracts = loadProviderContracts(skillRoot);
  const contract = contracts.contracts.find((entry) => entry.id === selected);
  if (!contract)
    issues.push(
      issue(
        "error",
        "revenue.provider_contract.unknown",
        `Selected monetization provider contract ${selected} is unavailable. No provider fallback was applied.`,
        "catalog/providers",
      ),
    );
  else {
    issues.push(...monetizationCapabilityIssues(contract));
    const breaking = unmigratedBreakingSummaries(skillRoot, selected, flagString(flags, "capabilityDelta"));
    for (const entry of breaking.loadErrors) issues.push(issue("error", "revenue.provider_contract.delta_load_failed", entry.message, entry.path));
    for (const entry of breaking.summaries)
      issues.push(issue("error", "revenue.provider_contract.breaking_unmigrated", entry, "catalog/providers/capability-delta.yaml"));
    const status = asString(getPath(loaded.state, "lanes.revenue.status"));
    if (status === "succeeded") {
      if (!readText(args.root, "revenue/REVENUE_OPS.md"))
        issues.push(issue("error", "revenue.ops_doc.missing", "Revenue operations and pricing decisions must be documented.", "revenue/REVENUE_OPS.md"));
      issues.push(...validateMonetizationOutcomes(args.root, contract));
    }
  }
}
reportAndExit("Revenue lane check", issues);
