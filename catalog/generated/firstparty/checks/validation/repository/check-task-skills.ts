/** Repository-only task projection and portable guidance contract checks. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { renderTaskSkills } from "../../../tooling/render-task-skills.js";
import { flagString, issue, parseFlags, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const issues: Issue[] = [];
try {
  const flags = parseFlags(process.argv.slice(2), [{ flags: ["--root", "--skill-root", "--repo-root"], key: "root" }]);
  const root = path.resolve(flagString(flags, "root") ?? resolveSkillRoot(import.meta.url));
  for (const error of renderTaskSkills(root, true)) {
    issues.push(issue("error", "task_skills.projection_drift", error));
  }
  if (!issues.length) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--test", path.join(root, "checks/verification/task-skills.test.ts")], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    // Keep machine-readable stdout to one canonical envelope, including on failure.
    if (!process.argv.includes("--json")) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    if (result.error || result.status !== 0) {
      issues.push(
        issue(
          "error",
          "task_skills.contract_test_failed",
          result.error?.message ?? `Task-skill contract tests failed with exit ${result.status ?? "signal"}. Run without --json for the test report.`,
        ),
      );
    }
  }
} catch (error) {
  issues.push(issue("error", "task_skills.invalid_source", error instanceof Error ? error.message : "Task-skill source could not be verified."));
}
reportAndExit("Task-skill contract check", issues);
