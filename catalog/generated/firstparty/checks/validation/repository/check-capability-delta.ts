#!/usr/bin/env node
/**
 * Default skill root walks from this file so packed omit-dev can launch the compiled twin
 * under `dist/checks/validation/repository/` without treating `dist/` as the package root.
 *
 * npm script: check:capability-delta
 * Usage: tsx checks/validation/repository/check-capability-delta.ts [--skill-root /path/to/skill]
 */
import { defaultSnapshotPath, evaluateCapabilityDelta } from "../../../adapters/providers/evaluate.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const defaultSkillRoot = resolveSkillRoot(import.meta.url);
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
