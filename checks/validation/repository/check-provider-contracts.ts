#!/usr/bin/env node
/**
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 *
 * npm script: check:provider-contracts
 * Usage: tsx checks/validation/repository/check-provider-contracts.ts [--skill-root /path/to/skill]
 */
import { defaultRegistryPath, evaluateProviderContracts } from "../../../adapters/providers/evaluate.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--registry"], key: "registry" },
]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
const registryPath = flagString(flags, "registry") ?? defaultRegistryPath(skillRoot);

const evaluation = evaluateProviderContracts(skillRoot, registryPath);
const issues: Issue[] = evaluation.errors.map((message) => issue("error", "provider_contract.invalid", message, "catalog/providers"));
reportAndExit("Provider contract check", issues);
