import { appendFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";

/**
 * Archetype fixtures: the runnable starter scaffolds shipped inside the
 * archetype packs (check-archetype-starter) and their routing in
 * check-app-archetype.
 */
export function register(h: Harness): void {
  const { makeEmptyFixture, runScriptArgs } = h;

  // The shipped starters themselves must satisfy the full contract.
  runScriptArgs("archetype starter scaffolds pass", "check-archetype-starter.ts", ["--skill-root", skillRoot], 0);

  // Build a fake skill root carrying only the archetype packs, then break it.
  function makeArchetypeSkillRoot(name: string): string {
    const fakeRoot = makeEmptyFixture(name);
    mkdirSync(path.join(fakeRoot, "business"), { recursive: true });
    cpSync(path.join(skillRoot, "surfaces", "starters"), path.join(fakeRoot, "surfaces", "starters"), { recursive: true });
    return fakeRoot;
  }

  const noLockfile = makeArchetypeSkillRoot("archetype-starter-no-lockfile");
  rmSync(path.join(noLockfile, "surfaces", "starters", "social-network", "starter", "package-lock.json"));
  runScriptArgs(
    "starter without lockfile fails",
    "check-archetype-starter.ts",
    ["--skill-root", noLockfile],
    1,
    "archetype_starter.social-network.lockfile_missing",
  );

  const envWithValue = makeArchetypeSkillRoot("archetype-starter-env-value");
  appendFileSync(
    path.join(envWithValue, "surfaces", "starters", "ai-chat-companion", "starter", ".env.example"),
    "STRIPE_SECRET_KEY=sk_test_fixtureonlyfixtureonly\n",
    "utf8",
  );
  runScriptArgs(
    "starter env.example with a value fails",
    "check-archetype-starter.ts",
    ["--skill-root", envWithValue],
    1,
    "archetype_starter.ai-chat-companion.env_not_names_only",
  );

  // ── Reference context budget ──────────────────────────────────────────────

  runScriptArgs("references within context budget pass", "check-reference-size.ts", ["--skill-root", skillRoot], 0);

  const oversizedRef = makeEmptyFixture("reference-size-over-budget");
  mkdirSync(path.join(oversizedRef, "knowledge"), { recursive: true });
  writeFileSync(path.join(oversizedRef, "knowledge", "huge-lane.md"), `# Huge\n${"x".repeat(70 * 1024)}\n`, "utf8");
  runScriptArgs("oversized reference fails the context budget", "check-reference-size.ts", ["--skill-root", oversizedRef], 1, "reference_size.over_budget");

  const oversizedEntrypoint = makeEmptyFixture("entrypoint-size-over-budget");
  mkdirSync(path.join(oversizedEntrypoint, "knowledge"), { recursive: true });
  writeFileSync(path.join(oversizedEntrypoint, "knowledge", "small.md"), "# Small\nWithin budget.\n", "utf8");
  writeFileSync(path.join(oversizedEntrypoint, "SKILL.md"), `---\nname: fixture\n---\n${"x".repeat(70 * 1024)}\n`, "utf8");
  runScriptArgs(
    "oversized SKILL.md fails the entrypoint budget",
    "check-reference-size.ts",
    ["--skill-root", oversizedEntrypoint],
    1,
    "reference_size.entrypoint_over_budget",
  );

  // knowledge/ reachability is indexed centrally by the GENERATED
  // catalog/generated/routing.md (rendered by catalog/render-routing.ts from
  // knowledge manifests' authored loadWhen data, R20) — not a per-directory
  // README/sibling file (that mechanism was dropped at cutover, U11, along with the 14
  // knowledge/<slug>/README.md files it used to require; see check-reference-size.ts's
  // "Index completeness" doc comment). checks/validation/repository/ still uses the
  // README/sibling mechanism (its own fixtures live in repo-gates.fixtures.ts).
  const missingGeneratedIndex = makeEmptyFixture("reference-size-knowledge-no-generated-index");
  mkdirSync(path.join(missingGeneratedIndex, "knowledge", "orphan-lane"), { recursive: true });
  writeFileSync(path.join(missingGeneratedIndex, "SKILL.md"), "---\nname: fixture\n---\nEntrypoint.\n", "utf8");
  writeFileSync(path.join(missingGeneratedIndex, "knowledge", "orphan-lane", "one.md"), "# One\nBody.\n", "utf8");
  runScriptArgs(
    "knowledge file with no catalog/generated/routing.md at all fails",
    "check-reference-size.ts",
    ["--skill-root", missingGeneratedIndex],
    1,
    "reference_size.generated_index_missing",
  );

  const incompleteGeneratedIndex = makeEmptyFixture("reference-size-knowledge-generated-index-incomplete");
  mkdirSync(path.join(incompleteGeneratedIndex, "knowledge", "lane"), { recursive: true });
  mkdirSync(path.join(incompleteGeneratedIndex, "catalog", "generated"), { recursive: true });
  writeFileSync(path.join(incompleteGeneratedIndex, "SKILL.md"), "---\nname: fixture\n---\nEntrypoint.\n", "utf8");
  writeFileSync(path.join(incompleteGeneratedIndex, "knowledge", "lane", "one.md"), "# One\nBody.\n", "utf8");
  writeFileSync(path.join(incompleteGeneratedIndex, "knowledge", "lane", "two.md"), "# Two\nUnreachable.\n", "utf8");
  writeFileSync(
    path.join(incompleteGeneratedIndex, "catalog", "generated", "routing.md"),
    "# Reference Index\n\n| Load when | Reference |\n| --- | --- |\n| always | [`knowledge/lane/one.md`](../../knowledge/lane/one.md) |\n",
    "utf8",
  );
  runScriptArgs(
    "generated routing index that misses a knowledge file fails",
    "check-reference-size.ts",
    ["--skill-root", incompleteGeneratedIndex],
    1,
    "reference_size.index_incomplete",
  );

  // A bare mention reads as routed to a human but is not followable, so the
  // gate must require a real link rather than a substring hit.
  const mentionOnlyGeneratedIndex = makeEmptyFixture("reference-size-knowledge-generated-index-mention-only");
  mkdirSync(path.join(mentionOnlyGeneratedIndex, "knowledge", "lane"), { recursive: true });
  mkdirSync(path.join(mentionOnlyGeneratedIndex, "catalog", "generated"), { recursive: true });
  writeFileSync(path.join(mentionOnlyGeneratedIndex, "SKILL.md"), "---\nname: fixture\n---\nEntrypoint.\n", "utf8");
  writeFileSync(path.join(mentionOnlyGeneratedIndex, "knowledge", "lane", "one.md"), "# One\nBody.\n", "utf8");
  writeFileSync(path.join(mentionOnlyGeneratedIndex, "knowledge", "lane", "two.md"), "# Two\nMentioned but never linked.\n", "utf8");
  writeFileSync(
    path.join(mentionOnlyGeneratedIndex, "catalog", "generated", "routing.md"),
    "# Reference Index\n\n| always | [`knowledge/lane/one.md`](../../knowledge/lane/one.md) |\nRouting for `knowledge/lane/two.md` is still to be written.\n",
    "utf8",
  );
  runScriptArgs(
    "knowledge file mentioned in prose but never linked from the generated index fails",
    "check-reference-size.ts",
    ["--skill-root", mentionOnlyGeneratedIndex],
    1,
    "reference_size.index_incomplete",
  );

  const untestedRls = makeArchetypeSkillRoot("archetype-starter-untested-rls");
  rmSync(path.join(untestedRls, "surfaces", "starters", "social-network", "starter", "supabase", "tests"), { recursive: true });
  runScriptArgs(
    "starter without RLS tests fails",
    "check-archetype-starter.ts",
    ["--skill-root", untestedRls],
    1,
    "archetype_starter.social-network.rls_tests_missing",
  );
}
