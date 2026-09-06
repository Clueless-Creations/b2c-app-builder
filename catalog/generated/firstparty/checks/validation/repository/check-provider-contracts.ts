#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRegistryPath, evaluateProviderContracts } from "../../../adapters/providers/evaluate.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--registry"], key: "registry" },
]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
const registryPath = flagString(flags, "registry") ?? defaultRegistryPath(skillRoot);

const evaluation = evaluateProviderContracts(skillRoot, registryPath);
const issues: Issue[] = evaluation.errors.map((message) => issue("error", "provider_contract.invalid", message, "catalog/providers"));
reportAndExit("Provider contract check", issues);
