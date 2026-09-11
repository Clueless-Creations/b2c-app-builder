/** Repository-only task projection and portable guidance contract checks. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { renderTaskSkills } from "../../../tooling/render-task-skills.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const root = resolveSkillRoot(import.meta.url);
const errors = renderTaskSkills(root, true);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", path.join(root, "checks/verification/task-skills.test.ts")], {
    cwd: root,
    stdio: "inherit",
    timeout: 120_000,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
