from pathlib import Path
import json
r = Path.cwd()
(r / 'checks/validation/repository/check-task-skills.ts').write_text('''/** Repository-only task projection and portable guidance contract checks. */
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
      issues.push(issue("error", "task_skills.contract_test_failed", result.error?.message ?? `Task-skill contract tests failed with exit ${result.status ?? "signal"}. Run without --json for the test report.`));
    }
  }
} catch (error) {
  issues.push(issue("error", "task_skills.invalid_source", error instanceof Error ? error.message : "Task-skill source could not be verified."));
}
reportAndExit("Task-skill contract check", issues);
''')
p = r / 'checks/validation/repository/fixtures/repo-gates.fixtures.ts'
t = p.read_text()
old = '  const strippedSkill = shippedSkill.replace("Keep the MCP read-only by default", "Let the MCP write by default");'
new = '''  const procedureDirectory = "agents/skills/b2c-app-builder/references";
  cpSync(path.join(skillRoot, procedureDirectory), path.join(autopilotStripped, procedureDirectory), { recursive: true });
  writeFileSync(path.join(autopilotStripped, "SKILL.md"), shippedSkill, "utf8");
  runScriptArgs("autopilot root and linked procedures pass before mutation", "check-autopilot-contract.ts", ["--skill-root", autopilotStripped], 0);
  const strippedSkill = shippedSkill.replace("Keep MCP read-only by default", "Let the MCP write by default");'''
assert t.count(old) == 1
t = t.replace(old, new)
old = '  const shippedSkillBody = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");'
new = '''  cpSync(path.join(skillRoot, procedureDirectory), path.join(autopilotForbidden, procedureDirectory), { recursive: true });
  const shippedSkillBody = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");'''
assert t.count(old) == 1
p.write_text(t.replace(old, new))
p = r / 'checks/validation/repository/fixtures/state-and-meta.fixtures.ts'
t = p.read_text()
a = t.index('  const versionRootLayoutRepo =')
b = t.index('  const versionRootSkillCommit =', a)
block = t[a:b]
assert block.count('["init", "-q"]') == 1
block = block.replace('["init", "-q"]', '["init", "-q", "-b", "main"]')
old = '    versionGit(root, ["commit", "-q", "--no-verify", "-m", "baseline"]);'
assert block.count(old) == 1
block = block.replace(old, old + '\n    // Give strict CI a real comparison base inside this synthetic repository.\n    versionGit(root, ["checkout", "-q", "-b", "feature"]);')
p.write_text(t[:a] + block + t[b:])
p = r / 'checks/verification/task-skills.test.ts'
p.write_text(p.read_text() + '''
void test("task-skill checker returns canonical JSON for invalid sources without crashing", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "b2c-task-json-"));
  try {
    const result = spawnSync(process.execPath, ["--import", "tsx", path.join(root, "checks/validation/repository/check-task-skills.ts"), "--root", temporary, "--json"],
      { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.pass, false);
    assert.ok(report.failures.length > 0);
    assert.ok(report.failures.every((entry: { rule: string; severity: string; message: string }) => typeof entry.rule === "string" && entry.severity === "error" && typeof entry.message === "string"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
''')
p = r / 'skill-version.json'
data = json.loads(p.read_text())
data['releaseNotes'].append('Keep task-skill verification machine-readable and preserve positive and negative controls across the routing refactor.')
p.write_text(json.dumps(data, indent=2) + '\n')
