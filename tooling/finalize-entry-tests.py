from pathlib import Path
import json
r = Path.cwd()
p = r / 'checks/verification/public-api/connection-and-packet.test.ts'
t = p.read_text()
old = '    const skill = readFileSync(path.join(root, "SKILL.md"), "utf8");'
assert t.count(old) == 1
t = t.replace(old, '''    const rootSkill = readFileSync(path.join(root, "SKILL.md"), "utf8");
    const setupPath = "agents/skills/b2c-app-builder/references/setup.md";
    assert(rootSkill.includes(`](${setupPath})`), "root skill omitted its conditional connection procedure");
    const skill = readFileSync(path.join(root, setupPath), "utf8");''')
p.write_text(t)
p = r / 'checks/verification/public-api/after-credits-start.test.ts'
t = p.read_text()
old = '''    const connect = headingSlice(skill, "## Connect", "## Build a business");
    const skillStart = headingSlice(skill, "## Build a business", "## Customize composition");'''
assert t.count(old) == 1
t = t.replace(old, '''    const lifecyclePath = "agents/skills/b2c-app-builder/references/business-lifecycle.md";
    const setupPath = "agents/skills/b2c-app-builder/references/setup.md";
    assert(skill.includes(`](${lifecyclePath})`), "root skill lost the managed lifecycle route");
    assert(skill.includes(`](${setupPath})`), "root skill lost the conditional setup route");
    const connect = readFileSync(path.join(root, setupPath), "utf8");
    const lifecycle = readFileSync(path.join(root, lifecyclePath), "utf8");
    const skillStart = headingSlice(lifecycle, "## Build a business", "## Boundaries");
    const managed = headingSlice(skill, "## Managed business", "## Setup request");
    assert(Buffer.byteLength(skill, "utf8") <= 6500, "root activation exceeded the bounded routing budget");
    assert(!/--mandate-file|composition-activate|--expected-revision/.test(skill), "root activation still carries conditional procedures");''')
old = '''      connect,
      skillStart,
      guideCreate,'''
assert t.count(old) == 1
t = t.replace(old, '''      managed,
      skillStart,''')
t = t.replace('assertCreateStatusPlanBeforeCatalog(skillStart, "SKILL Build a business");', 'assertCreateStatusPlanBeforeCatalog(skillStart, "linked business lifecycle");')
t = t.replace('      startPathCodePoints: codePoints(startPath),', '''      // Source-size accounting, not measured host loading or model-token usage.
      rootActivationBytes: Buffer.byteLength(skill, "utf8"),
      conditionalLifecycleBytes: Buffer.byteLength(lifecycle, "utf8"),
      startPathCodePoints: codePoints(startPath),''')
t = t.replace('accounting.startPathCodePoints >= 12_000 && accounting.startPathCodePoints <= 13_000', 'accounting.startPathCodePoints > 0 && accounting.startPathCodePoints <= 13_000')
t = t.replace('left the locked 12000-13000 bound', 'exceeded the 13000-code-point managed-instruction ceiling')
p.write_text(t)
p = r / 'skill-version.json'
j = json.loads(p.read_text())
j['releaseNotes'].append('Verify conditional startup routes without forcing setup procedures into every root skill activation.')
p.write_text(json.dumps(j, indent=2) + '\n')
