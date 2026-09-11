from pathlib import Path
r=Path.cwd()
p=r/'checks/verification/fixtures/firstparty-responsibilities.fixtures.ts'
t=p.read_text();t='import { readFileSync } from "node:fs";\nimport path from "node:path";\n'+t
a='''      money.workflow.instructions.includes("RevenueCat") && money.workflow.providerIds.includes("provider.revenuecat"),
      "actual default guidance was falsely made provider-neutral",
'''
b='''      money.workflow.providerIds.includes("provider.revenuecat") && money.workflow.providerIds.includes("provider.stripe"),
      "neutral task wording must not remove the default recipe's provider choices",
'''
assert t.count(a)==1;t=t.replace(a,b)
a='''    assert(FIRSTPARTY_WORKER_TARGET.platform'''
b='''    assert(
      money.workflow.instructions.includes("Load only the selected implementation procedures") &&
        money.workflow.instructions.includes("Preserve all applicable provider-specific requirements"),
      "task guidance must route selected implementation requirements instead of losing them",
    );
    const providerReference = catalog.references.find((entry) => entry.id === "reference.money.revenuecat-and-store-products");
    assert(providerReference && money.workflow.referenceIds.includes(providerReference.id), "default RevenueCat procedure is no longer bound");
    const providerGuidance = readFileSync(path.join(skillRoot, providerReference.path), "utf8");
    assert(providerGuidance.includes("MISSING_METADATA") && providerGuidance.includes("RevenueCat"), "provider-specific product requirements disappeared");
    assert(FIRSTPARTY_WORKER_TARGET.platform'''
assert t.count(a)==1;t=t.replace(a,b);p.write_text(t)
p=r/'checks/verification/fixtures/kitchen-vocabulary.fixtures.ts';t=p.read_text()
a='''readme.includes("| Product                 | Prep & design")''';b=r'''/^\|\s*\[Product\]\(knowledge\/README\.md#product\)\s*\|\s*Prep & design\s*\|/m.test(readme)''';assert t.count(a)==1;t=t.replace(a,b)
a='''readme.includes("| Experience              | Prep & design")''';b=r'''/^\|\s*\[Experience\]\(knowledge\/README\.md#experience\)\s*\|\s*Prep & design\s*\|/m.test(readme)''';assert t.count(a)==1;t=t.replace(a,b);p.write_text(t)
p=r/'checks/verification/fixtures/packed-check.fixtures.ts';t=p.read_text();a='''    assert(remaining.length === 116, `remaining-tsx count drifted: ${remaining.length}`);''';b='''    assert(remaining.length === 117, `remaining-tsx count drifted: ${remaining.length}`);
    assert(
      remaining.some((entry) => entry.id === "check:task-skills" && entry.sourcePath === "checks/validation/repository/check-task-skills.ts"),
      "the repository-only task-skill test runner must remain explicit in the uncompiled inventory",
    );''';assert t.count(a)==1;t=t.replace(a,b);p.write_text(t)
p=r/'checks/verification/fixtures/mcp.fixtures.ts';t=p.read_text()
a='''      symlinkSync(path.join(skillRoot, "kernel/session/doctor-host.ts"), path.join(temp, "kernel/session/doctor-host.ts"));'''
b=a+'''
      // Worker-runtime health is part of the local handshake even when knowledge is absent.
      // Share its actual implementation so this fixture tests bundle isolation, not an incomplete module copy.
      symlinkSync(path.join(skillRoot, "kernel/session/executor.ts"), path.join(temp, "kernel/session/executor.ts"));'''
assert t.count(a)==1;t=t.replace(a,b)
a='''    ": 100 steps, 0 done.",'''
b='''    // The current default recipe has 103 business workflows (also on the main baseline).
    // Task-skill projections do not add execution nodes.
    ": 103 steps, 0 done.",'''
assert t.count(a)==1;t=t.replace(a,b);p.write_text(t)
