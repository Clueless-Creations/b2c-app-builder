#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultSnapshotPath, evaluateCapabilityDelta } from "../../../adapters/providers/evaluate.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillRoot = path.resolve(scriptDir, "../../..");
const defaultRepoRoot = defaultSkillRoot;

const flags = parseFlags(process.argv.slice(2), [
  { flags: ["--skill-root"], key: "skillRoot" },
  { flags: ["--repo-root"], key: "repoRoot" },
  { flags: ["--delta"], key: "delta" },
  { flags: ["--snapshots"], key: "snapshots" },
]);
const skillRoot = flagString(flags, "skillRoot") ?? defaultSkillRoot;
const repoRoot = flagString(flags, "repoRoot") ?? defaultRepoRoot;
const evaluation = evaluateCapabilityDelta({
  skillRoot,
  snapshotPath: flagString(flags, "snapshots") ?? defaultSnapshotPath(repoRoot),
  deltaPath: flagString(flags, "delta"),
});
const issues: Issue[] = evaluation.errors.map((message) => issue("error", "capability_delta.unclassified", message, "catalog/providers/capability-delta.yaml"));
reportAndExit("Capability-delta check", issues);
