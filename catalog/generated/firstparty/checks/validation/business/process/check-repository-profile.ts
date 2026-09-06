#!/usr/bin/env node
/**
 * check-repository-profile.ts — compile the workspace/repository profile contract.
 *
 * Absence of a profile preserves current validator routing. An accepted
 * profile compiles canonical artifacts, generated projections, front-door files,
 * and safety/trust gates. Overlay cannot suppress an applicable safety gate.
 *
 * npm script: check:repository-profile
 * Usage: tsx checks/validation/business/process/check-repository-profile.ts [--root <workspace>] [--write]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRepositoryContract, renderRequirementInventory } from "../../../../catalog/repository-profiles/compile.js";
import { flagBoolean, flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRootDir = path.resolve(scriptDir, "../../../..");
const defaultBusinessRoot = process.env.BUSINESS_ROOT ? path.resolve(process.env.BUSINESS_ROOT) : path.join(skillRootDir, "examples", "workspace", "business");

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--root", "--business"], key: "root" },
  { flags: ["--write"], key: "write", kind: "boolean" },
]);
const root = path.resolve(flagString(flags, "root") ?? defaultBusinessRoot);
const writeInventory = flagBoolean(flags, "write");
const issues: Issue[] = [];

const contract = compileRepositoryContract(root);
for (const item of contract.issues) {
  issues.push(issue("error", item.code, item.message, item.path ?? "state/business-state.json"));
}

if (writeInventory) {
  const rendered = renderRequirementInventory(contract);
  const directory = path.join(root, "state/generated");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "requirement-inventory.json"), rendered.json, "utf8");
  writeFileSync(path.join(directory, "requirement-inventory.md"), rendered.markdown, "utf8");
}

reportAndExit("Repository profile", issues);
