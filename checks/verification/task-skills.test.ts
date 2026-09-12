import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { composeCatalog } from "../../catalog/index.js";
import { publicBusinessAreas } from "../../catalog/areas.js";
import { referencesForTask, renderTaskSkillFiles, skillDirectory, taskSkills, workflowsForTask } from "../../catalog/task-skills.js";
import { collectTaskSkillPackage, writeTaskSkillPackage } from "../../tooling/export-task-skill.js";
import { replaceGeneratedBlock, taskSkillProjections } from "../../tooling/render-task-skills.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = composeCatalog(root);
const revision = "1971c5d1e6f2c1aed38dde1ec8debc2c459be69d";
const hash = (text: string): string => createHash("sha256").update(text).digest("hex");
const scratchRoot = path.join(root, ".tmp-task-skill-checks");
function mkScratch(prefix: string): string {
  mkdirSync(scratchRoot, { recursive: true });
  return mkdtempSync(path.join(scratchRoot, prefix));
}
function focusedMethodSnippet(skill: (typeof taskSkills)[number]): string {
  if (!skill.method) return "";
  const sources = referencesForTask(catalog, skill);
  const reference = sources.find((candidate) => candidate.id === skill.method!.referenceId);
  if (!reference) return "";
  const source = readFileSync(path.join(root, reference.path), "utf8");
  const lines = source.split(/\r?\n/gu);
  const heading = lines.findIndex(
    (line) => /^#{1,6} /u.test(line) && line.replace(/^#{1,6} /u, "").trim() === skill.method!.heading,
  );
  if (heading < 0) return "";
  const end = lines.findIndex((line, index) => index > heading && /^#{1,6} /u.test(line));
  return lines.slice(heading + 1, end < 0 ? lines.length : end).join("\n").trim();
}

void test("six public areas cover business domains without changing internal authority groups", () => {
  assert.deepEqual(
    publicBusinessAreas.map((area) => area.name),
    ["Opportunity", "Product", "Experience", "Engineering", "Revenue and growth", "Learning and operations"],
  );
  const mapped = new Set(publicBusinessAreas.flatMap((area) => [...area.domainIds]));
  for (const domain of catalog.domains) if (domain.slug !== "machine") assert.ok(mapped.has(domain.id), domain.id);
  assert.ok(!mapped.has("domain.machine"));
  assert.ok(catalog.areas.some((area) => area.id === "area.operating-system"));
});

void test("pilot tasks project real workflow contracts without mutating the catalog", () => {
  const before = JSON.stringify(catalog);
  const files = renderTaskSkillFiles(catalog);
  assert.equal(taskSkills.length, 9);
  assert.equal(taskSkills.filter((skill) => skill.method).length, taskSkills.length, "all task skills now use focused methods");
  for (const name of ["b2c-research-opportunity", "b2c-design-onboarding", "b2c-review-monetization"]) {
    assert.ok(taskSkills.some((skill) => skill.name === name));
  }
  for (const skill of taskSkills) {
    const body = files[`${skillDirectory(skill)}/SKILL.md`]!;
    const frontmatter = parse(body.split("---")[1]!);
    assert.equal(frontmatter.name, skill.name);
    assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(frontmatter.name));
    assert.ok(frontmatter.name.length <= 64);
    assert.ok(frontmatter.description.length <= 1024);
    assert.equal(frontmatter["allowed-tools"], undefined);
    assert.ok(body.split("\n").length < 150);
    assert.ok(Buffer.byteLength(body) < 8000, `${skill.name} startup context grew`);
    if (skill.method) {
      const method = focusedMethodSnippet(skill);
      assert.ok(method, `focused method is missing for ${skill.name}`);
      assert.ok(body.includes(method.slice(0, 160)), `focused method is not embedded in ${skill.name}`);
    }
    assert.doesNotMatch(body, /\bmcp__\b|claude -p|codex exec/u);
    assert.match(body, /A review is read-only/);
    assert.match(body, /business-status then business-plan/);
    assert.match(body, /Do not record business completion/);
    assert.ok(referencesForTask(catalog, skill).length > 0);
  }
  assert.equal(JSON.stringify(catalog), before);
});

void test("one onboarding skill preserves the internal group without requiring every stage on startup", () => {
  const skill = taskSkills.find((entry) => entry.groupId)!;
  const workflows = workflowsForTask(catalog, skill);
  assert.equal(workflows.length, 23);
  const files = renderTaskSkillFiles(catalog);
  assert.match(files[`${skillDirectory(skill)}/SKILL.md`]!, /audit or small change does not imply a full rebuild/);
  assert.equal((files[`${skillDirectory(skill)}/references/stages.md`]!.match(/\| \[Onboarding ONB-/gu) ?? []).length, 23);
});

void test("missing workflow or required reference fails closed", () => {
  const skill = taskSkills[0]!;
  assert.throws(
    () => workflowsForTask({ ...catalog, workflows: catalog.workflows.filter((workflow) => workflow.id !== skill.workflowId) }, skill),
    /no canonical workflow/,
  );
  assert.throws(() => referencesForTask({ ...catalog, references: [] }, skill), /unresolved knowledge/);
});

void test("provider selection metadata cannot rewrite neutral task instructions", () => {
  const skill = taskSkills[2]!;
  const altered = {
    ...catalog,
    workflows: catalog.workflows.map((workflow) => (workflow.id === skill.workflowId ? { ...workflow, providerIds: ["provider.different-vendor"] } : workflow)),
  };
  const file = `${skillDirectory(skill)}/SKILL.md`;
  assert.equal(renderTaskSkillFiles(catalog)[file], renderTaskSkillFiles(altered)[file]);
});

void test("generated projections remain current and root routing stays bounded", () => {
  const files = taskSkillProjections(root);
  for (const [file, content] of Object.entries(files)) assert.equal(readFileSync(path.join(root, file), "utf8"), content, file);
  const entry = files["SKILL.md"]!;
  assert.ok(Buffer.byteLength(entry) < 6500);
  assert.match(entry, /Focused task/);
  assert.match(entry, /Managed business/);
  assert.match(entry, /Setup request/);
  assert.doesNotMatch(entry, /b2c composition-activate|--expected-revision|--mandate-file|B2C_APP_BUILDER_MCP_WRITE/u);
  for (const area of publicBusinessAreas) {
    assert.ok(files["README.md"]!.includes(`knowledge/README.md#${area.slug}`));
    assert.ok(readFileSync(path.join(root, "knowledge/README.md"), "utf8").includes(`## ${area.name}`));
  }
});

void test("generated block replacement refuses ambiguous ownership", () => {
  assert.throws(() => replaceGeneratedBlock("no markers", "task-skills", "x"), /Missing/);
  const marked = "<!-- catalog-generated:start x -->old<!-- catalog-generated:end x -->";
  assert.match(replaceGeneratedBlock(marked, "x", "new"), /new/);
  assert.throws(() => replaceGeneratedBlock(marked + marked, "x", "new"), /duplicated/);
});

for (const skill of taskSkills) {
  void test(`${skill.name} exports relocatable bound guidance and complete notices`, () => {
    const temporary = mkScratch("b2c-task-skill-");
    try {
      const bundle = collectTaskSkillPackage(root, catalog, skill.name, revision);
      const target = writeTaskSkillPackage(temporary, skill.name, bundle);
      const manifest = JSON.parse(bundle.files["source-manifest.json"]!);
      assert.equal(manifest.executionIncluded, false);
      assert.equal(bundle.files["THIRD_PARTY_NOTICES.md"], readFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8"));
      for (const resource of manifest.resources) assert.equal(hash(bundle.files[resource.path]!), resource.sha256);
      for (const reference of referencesForTask(catalog, skill)) assert.ok(bundle.sourcePaths.includes(reference.path));
      for (const [file, content] of Object.entries(bundle.files)) {
        if (!file.endsWith(".md") || file === "THIRD_PARTY_NOTICES.md") continue;
        for (const match of content.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)[^)\n]*\)/gu)) {
          const url = match[1]!;
          if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(url)) continue;
          const destination = path.resolve(target, path.dirname(file), decodeURIComponent(url.split(/[?#]/u)[0]!));
          assert.ok(destination.startsWith(`${target}${path.sep}`), `${file}: ${url} escapes`);
          assert.ok(existsSync(destination), `${file}: ${url} is missing`);
        }
      }
      assert.throws(() => writeTaskSkillPackage(temporary, skill.name, bundle), /already exists/);
      assert.ok(!Object.keys(bundle.files).some((file) => /b2c-maintainer|b2c-contributor|\.env$/u.test(file)));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}

void test("export refuses unknown skills, escaping resources, and symlinked destinations", () => {
  assert.throws(() => collectTaskSkillPackage(root, catalog, "../escape", revision), /Unknown task/);
  assert.throws(() => collectTaskSkillPackage(root, catalog, taskSkills[0]!.name, "main"), /full source commit/);
  const temporary = mkScratch("b2c-export-safety-");
  try {
    const name = taskSkills[0]!.name;
    const sentinel = path.join(temporary, "sentinel");
    writeFileSync(sentinel, "unchanged");
    assert.throws(() => writeTaskSkillPackage(temporary, name, { files: { "../sentinel": "bad" }, sourcePaths: [], supplementalLinks: [] }), /escapes/);
    assert.equal(readFileSync(sentinel, "utf8"), "unchanged");
    symlinkSync(temporary, path.join(temporary, "alias"));
    assert.throws(() => writeTaskSkillPackage(path.join(temporary, "alias"), name, { files: {}, sourcePaths: [], supplementalLinks: [] }), /symlinks/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

void test("moving procedures preserves authority and fails on missing, unlinked, or oversized guidance", () => {
  const temporary = mkScratch("b2c-routing-contract-");
  const procedure = "agents/skills/b2c-app-builder/references/business-lifecycle.md";
  const fixture = "checks/validation/repository/evals/triggering/autopilot-triggering.yaml";
  const original = readFileSync(path.join(root, "SKILL.md"), "utf8");
  const run = () =>
    spawnSync(process.execPath, ["--import", "tsx", path.join(root, "checks/validation/repository/check-autopilot-contract.ts"), "--skill-root", temporary], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
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

void test("task-skill checker returns canonical JSON for invalid sources without crashing", () => {
  const temporary = mkScratch("b2c-task-json-");
  try {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", path.join(root, "checks/validation/repository/check-task-skills.ts"), "--root", temporary, "--json"],
      { cwd: root, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.pass, false);
    assert.ok(report.failures.length > 0);
    assert.ok(
      report.failures.every(
        (entry: { rule: string; severity: string; message: string }) =>
          typeof entry.rule === "string" && entry.severity === "error" && typeof entry.message === "string",
      ),
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
