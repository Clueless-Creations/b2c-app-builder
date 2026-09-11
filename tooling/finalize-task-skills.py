"""Temporary, reviewed integration edits. Removed before the validated commit."""
from pathlib import Path
import json
import yaml

r = Path.cwd()
def edit(p, old, new):
    f = r / p
    text = f.read_text()
    assert text.count(old) == 1, (p, text.count(old))
    f.write_text(text.replace(old, new))

p = r / 'package.json'
j = json.loads(p.read_text())
j['scripts']['check:agent-entrypoints'] = 'tsx checks/validation/repository/check-agent-entrypoints.ts --repo-root .'
j['scripts']['check:task-skills'] = 'tsx checks/validation/repository/check-task-skills.ts'
p.write_text(json.dumps(j, indent=2) + '\n')
connection = ' A missing worker CLI degrades local execution health; it does not turn this connection into hosted knowledge. Degraded execution still selects b2c-local. Leftover CLI-only public MCP names stay CLI-only on this local connection. Hosted leftover names stay wrong-surface.'
edit('SKILL.md', 'A leftover b2c-app-builder connection name is not a third capability.', 'A leftover b2c-app-builder connection name is not a third capability.' + connection)
edit('agents/skills/b2c-app-builder/references/setup.md', 'Duplicate names are a collision.', 'Duplicate names are a collision.' + connection)
edit('tooling/lib/audit-plan.ts', '  "check:agent-entrypoints",', '  "check:agent-entrypoints",\n  "check:task-skills",')
edit('tooling/lib/audit-plan.ts', '    { id: "check:agent-entrypoints", kind: "script", args: ["--repo-root", "."], repoOnly: true },', '    { id: "check:agent-entrypoints", kind: "script", args: ["--repo-root", "."], repoOnly: true },\n    { id: "check:task-skills", kind: "script", repoOnly: true },')
edit('checks/validation/repository/run-launchbench.ts', '  "check-agent-entrypoints",', '  "check-agent-entrypoints",\n  "check-task-skills",')
edit('checks/validation/repository/README.md', '| `check-upstreams.ts`', '| `check-task-skills.ts` | catalog-backed task skills, public navigation, portable reference closure, source hashes, and create-only exports |\n| `check-upstreams.ts`')
edit('checks/validation/repository/check-package-parity.ts', 'import { SCRIPT_ROOTS,', 'import { skillDirectory, taskSkills } from "../../../catalog/task-skills.js";\nimport { SCRIPT_ROOTS,')
edit('checks/validation/repository/check-package-parity.ts', '    "SKILL.md",', '    "SKILL.md",\n    "agents/skills/b2c-app-builder/references/setup.md",\n    "agents/skills/b2c-app-builder/references/business-lifecycle.md",\n    "agents/skills/b2c-app-builder/references/composition.md",\n    "agents/skills/b2c-app-builder/references/mobile-operation.md",\n    ...taskSkills.flatMap((skill) => [`${skillDirectory(skill)}/SKILL.md`, `${skillDirectory(skill)}/references/task.md`]),')
edit('checks/validation/repository/check-package-parity.ts', '    const leaked = packed.find((file) => file.startsWith(prefix));', '    const businessSkillPrefixes = ["agents/skills/b2c-app-builder/references/", ...taskSkills.map((skill) => `${skillDirectory(skill)}/`)];\n    const leaked = packed.find((file) => file.startsWith(prefix) && !(prefix === "agents/" && businessSkillPrefixes.some((allowed) => file.startsWith(allowed))));')
(r / 'checks/validation/repository/check-task-skills.ts').write_text('''/** Repository-only task projection and portable guidance contract checks. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { renderTaskSkills } from "../../../tooling/render-task-skills.js";
import { resolveSkillRoot } from "../../../tooling/lib/skill-root.js";

const root = resolveSkillRoot(import.meta.url);
const errors = renderTaskSkills(root, true);
if (errors.length) {
  console.error(errors.join("\\n"));
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
''')
p = r / 'SKILL.md'
t = p.read_text()
t = t.replace(t.splitlines()[2], 'description: "Route broad consumer-app work across research, product, design, engineering, launch, growth, operations, and B2C CLI or MCP setup. Use focused task skills for scoped expertise or the managed lifecycle for a complete business. Do not use for a narrow code fix or an unrelated B2B or internal tool."')
p.write_text(t)
p = r / 'checks/validation/repository/evals/triggering/autopilot-triggering.yaml'
data = yaml.safe_load(p.read_text())
old = data['body_contract']['required_terms']
text = (r / 'agents/skills/b2c-app-builder/references/business-lifecycle.md').read_text().lower()
kept = [s for s in old if s.lower() in text]
assert len(kept) == 24, 'Preserve every moved lifecycle assertion.'
data['title'] = 'Skill discovery, bounded root routing, and linked procedure contracts'
data['source_basis'][-1] = 'ADR-0014: one catalog projects task skills; root routing stays bounded; linked procedures preserve managed execution and authority.'
data['body_contract'] = {
    'max_bytes': 6500,
    'required_terms': ['Focused task', 'Managed business', 'Setup request', 'Do not install software, require an MCP connection, create a workspace', 'A review is read-only unless changes are also requested', 'route.expand', 'revision hashes', 'nextCall', 'business-status and business-plan before catalog browsing', 'Research and an explicit product decision precede business-initialize', 'Never hand-author reducer-owned state', 'Do not edit an agent configuration or install software unless the user requested setup', 'Keep MCP read-only by default', 'Missing execution tooling does not block advisory work', 'explicit provider bindings', 'Provider guidance cannot add requirements or silently select another provider', 'Pause for access or secrets, spend, pricing or legal decisions, destructive changes, hosted deployment, store submission, or production release', 'A skill grants no authority', 'Require current provider or device evidence', 'Never copy credentials, provider state, names, prices, or domains from another app'],
    'forbidden_terms': ['bypass the reducer', 'ignore approval requirements', '--mandate-file', 'composition-activate', '--expected-revision', 'B2C_APP_BUILDER_MCP_WRITE'],
}
data['reference_contracts'] = [
    {'path': 'agents/skills/b2c-app-builder/references/business-lifecycle.md', 'required_terms': kept, 'forbidden_terms': ['bypass the reducer', 'ignore approval requirements']},
    {'path': 'agents/skills/b2c-app-builder/references/setup.md', 'required_terms': ['Keep the MCP read-only by default', 'Do not edit an agent configuration or install software unless the user requested setup', 'b2c inspect', 'Degraded execution still selects b2c-local']},
    {'path': 'agents/skills/b2c-app-builder/references/composition.md', 'required_terms': ['composition-activate', 'preview does not activate a workspace', 'local writes stay CLI-only']},
    {'path': 'agents/skills/b2c-app-builder/references/mobile-operation.md', 'required_terms': ['Honor explicit provider bindings', 'Never infer availability from the agent name', 'They do not prove acceptance on their own']},
]
p.write_text('# Structural checks, not evidence of live model routing. Keep protections at their actual loading boundary.\n' + yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=140))
p = r / 'checks/validation/repository/check-autopilot-contract.ts'
t = p.read_text().replace('existsSync, readFileSync', 'existsSync, lstatSync, readFileSync')
start = '    const bodyContract = isRecord(evals.body_contract) ? evals.body_contract : {};'
assert t.count(start) == 1
t = t.replace(start, start + r'''
    const maxBytes = typeof bodyContract.max_bytes === "number" ? bodyContract.max_bytes : 6500;
    if (Buffer.byteLength(skillText, "utf8") > maxBytes) {
      issues.push(issue("error", "autopilot.body.context_budget", `SKILL.md exceeds the ${maxBytes}-byte routing budget. Move conditional procedures to linked references.`, "SKILL.md"));
    }
    // Moving a procedure out of the root must not drop its contract. Only directly linked,
    // package-local files can satisfy these checks; missing guidance stays an error.
    for (const reference of asArray(evals.reference_contracts)) {
      const relative = isRecord(reference) ? asString(reference.path) : undefined;
      if (!relative || !/^agents\/skills\/b2c-app-builder\/references\/[a-z0-9-]+\.md$/u.test(relative)) {
        issues.push(issue("error", "autopilot.reference.invalid", "Reference contracts must name a local business procedure.", "SKILL.md"));
        continue;
      }
      const target = path.join(skillRoot, relative);
      const parts = relative.split("/");
      if (parts.some((_, index) => {
        const candidate = path.join(skillRoot, ...parts.slice(0, index + 1));
        return existsSync(candidate) && lstatSync(candidate).isSymbolicLink();
      }) || !existsSync(target) || !lstatSync(target).isFile()) {
        issues.push(issue("error", "autopilot.reference.missing", `Required procedure is missing or symlinked: ${relative}.`, relative));
        continue;
      }
      if (!parsedSkill.body.includes(`](${relative})`)) {
        issues.push(issue("error", "autopilot.reference.unlinked", `SKILL.md must link directly to ${relative}.`, "SKILL.md"));
      }
      const content = readFileSync(target, "utf8");
      if (!isRecord(reference)) continue;
      for (const term of asArray(reference.required_terms).map(asString).filter((value): value is string => Boolean(value))) {
        if (!includesCaseInsensitive(content, term)) {
          issues.push(issue("error", "autopilot.reference.required_term_missing", `Procedure must preserve contract term: ${term}.`, relative));
        }
      }
      for (const term of asArray(reference.forbidden_terms).map(asString).filter((value): value is string => Boolean(value))) {
        if (includesCaseInsensitive(content, term)) {
          issues.push(issue("error", "autopilot.reference.forbidden_term_present", `Procedure must not contain: ${term}.`, relative));
        }
      }
    }
''')
p.write_text(t)
p = r / 'docs/validators.md'
t = p.read_text().replace('| `check:hosted-bundle`', '| `check:task-skills` | Generated task skills, public navigation, portable reference closure, source hashes, and linked-procedure regression controls. Repository-only. |\n| `check:hosted-bundle`', 1)
t += '\n## Task-skill projections\n\n`check:task-skills` (`check-task-skills.ts`) is a repository-only presubmit and full-audit gate. It verifies generated entrypoints, public-area navigation, source and reference resolution, bounded startup context, portable export safety, and the linked autopilot procedure contracts. Its fixtures remove a procedure, a root link, and an authority clause to prove each omission fails. These deterministic checks do not establish live host-agent behavior.\n'
p.write_text(t)
p = r / 'checks/validation/repository/source-registry.yaml'
data = yaml.safe_load(p.read_text())
existing = {s['url'].rstrip('/') for s in data['sources']}
t = p.read_text()
for id, name, url in [('openai-codex-skills', 'OpenAI skill installation documentation', 'https://developers.openai.com/codex/skills/'), ('claude-code-skills', 'Claude Code skill installation documentation', 'https://code.claude.com/docs/en/skills')]:
    if url.rstrip('/') not in existing:
        row = {'id': id, 'name': name, 'source_type': 'website', 'url': url, 'refresh_cadence_days': 30, 'owner': 'maintainer', 'locations': ['docs/guides/task-skills.md'], 'notes': 'Informational host installation reference. Directory format does not establish runtime compatibility; no external skill text is incorporated.'}
        t += ''.join('  ' + line + '\n' for line in yaml.safe_dump([row], sort_keys=False, width=110).splitlines())
p.write_text(t)
p = r / 'skill-version.json'
data = json.loads(p.read_text())
data['releaseNotes'] = ['Expose catalog-backed task skills for research, onboarding, and monetization with one public business-area map.', 'Keep the root skill bounded and preserve lifecycle, setup, composition, and mobile procedures through tested direct references.', 'Package create-only portable guidance with source hashes, notices, and fail-closed reference checks.']
p.write_text(json.dumps(data, indent=2) + '\n')
p = r / 'checks/verification/task-skills.test.ts'
t = p.read_text().replace('import { createHash }', 'import { spawnSync } from "node:child_process";\nimport { createHash }').replace('existsSync, mkdtempSync', 'cpSync, existsSync, mkdirSync, mkdtempSync')
t += '''
void test("moving procedures preserves authority and fails on missing, unlinked, or oversized guidance", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "b2c-routing-contract-"));
  const procedure = "agents/skills/b2c-app-builder/references/business-lifecycle.md";
  const fixture = "checks/validation/repository/evals/triggering/autopilot-triggering.yaml";
  const original = readFileSync(path.join(root, "SKILL.md"), "utf8");
  const run = () => spawnSync(process.execPath,
    ["--import", "tsx", path.join(root, "checks/validation/repository/check-autopilot-contract.ts"), "--skill-root", temporary],
    { cwd: root, encoding: "utf8", timeout: 30_000 });
  try {
    mkdirSync(path.dirname(path.join(temporary, fixture)), { recursive: true });
    cpSync(path.join(root, fixture), path.join(temporary, fixture));
    cpSync(path.join(root, "agents/skills/b2c-app-builder/references"), path.join(temporary, "agents/skills/b2c-app-builder/references"), { recursive: true });
    writeFileSync(path.join(temporary, "SKILL.md"), original);
    assert.equal(run().status, 0, "the complete linked contract must pass");
    const content = readFileSync(path.join(temporary, procedure), "utf8");
    rmSync(path.join(temporary, procedure));
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /autopilot.reference.missing/);
    writeFileSync(path.join(temporary, procedure), content.replace("It does not delegate protected actions.", ""));
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /autopilot.reference.required_term_missing/);
    writeFileSync(path.join(temporary, procedure), content);
    writeFileSync(path.join(temporary, "SKILL.md"), original.replace(`](${procedure})`, "](missing.md)"));
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /autopilot.reference.unlinked/);
    writeFileSync(path.join(temporary, "SKILL.md"), original + "x".repeat(6500));
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /autopilot.body.context_budget/);
    writeFileSync(path.join(temporary, "SKILL.md"), original);
    rmSync(path.join(temporary, procedure));
    symlinkSync(path.join(root, procedure), path.join(temporary, procedure));
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stdout, /autopilot.reference.missing/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
'''
p.write_text(t)
cases = [
    dict(id='task-skill-focused-onboarding', title='A focused onboarding review must not install a launch graph', prompt='Review the signup flow in this app. Tell me the problems before making changes.', expected_route='Open b2c-design-onboarding directly, classify audit scope, inspect the existing app, and report findings without installing the runtime or modifying the app.', must_use=['b2c-design-onboarding', 'audit'], must_catch=['review is read-only', 'existing app instructions'], should_say=['findings', 'evidence'], forbidden=['I initialized your business workspace', 'I rebuilt the signup flow']),
    dict(id='task-skill-alternate-provider', title='Monetization review preserves the selected provider and pricing authority', prompt='Audit our paywall. We already use a different billing provider and have not approved pricing changes.', expected_route='Use b2c-review-monetization, keep the existing binding, inspect semantic purchase and restore evidence, and report proposals without changing prices or providers.', must_use=['b2c-review-monetization', 'selected provider'], must_catch=['pricing changes require approval', 'live claims need evidence'], should_say=['entitlement', 'restore'], forbidden=['migrate to RevenueCat first', 'I changed the live price']),
    dict(id='task-skill-missing-runtime', title='Missing execution tooling does not block advisory expertise', prompt='Evaluate this consumer app idea. I do not have the B2C CLI installed, and I am not asking you to install anything.', expected_route='Use b2c-research-opportunity with available authorized evidence. Do not require setup or claim unavailable provider evidence.', must_use=['b2c-research-opportunity', 'research'], must_catch=['do not install software', 'unavailable evidence stays unverified'], should_say=['opportunity', 'evidence'], forbidden=['install the CLI before I can evaluate', 'I installed the runtime']),
    dict(id='task-skill-managed-continuation', title='Managed continuation uses the existing planner rather than a new skill schedule', prompt='Resume my registered consumer business and carry the accepted launch mandate forward.', expected_route='Use the main business entrypoint, inspect business-status then business-plan, and execute only the current bounded work under existing authority and evidence contracts.', must_use=['business-status', 'business-plan'], must_catch=['current ready or held brief', 'protected effects require authority'], should_say=['evidence', 'next'], forbidden=['load every skill before starting', 'start a second planning system']),
]
for case in cases:
    (r / ('checks/validation/repository/evals/agent-behavior/' + case['id'] + '.yaml')).write_text(yaml.safe_dump(case, sort_keys=False, width=130))
print('Task-skill integration edits applied. Render and verify before committing.')
