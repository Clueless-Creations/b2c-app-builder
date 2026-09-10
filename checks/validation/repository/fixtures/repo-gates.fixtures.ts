import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { type Harness, skillRoot } from "./_harness.js";
import { artifactPageEntries } from "../../../../tooling/lib/artifact-pages.js";
import { auditExcludedScripts, buildAuditPlan, type AuditLayout } from "../../../../tooling/lib/audit-plan.js";

/**
 * Fixtures for the repo/skill-level gates that previously had zero fixture
 * coverage: the live audit pipeline only ever exercised their PASS path, so
 * nothing proved they could fail. Each gate gets at least one failing input
 * here so a regression that makes it always-pass is caught by test:validators.
 */

/** Scripts object that satisfies checkAuditPlanCoverage for a layout: every plan step resolves, no extra gate scripts. */
function planScripts(layout: AuditLayout): Record<string, string> {
  const scripts: Record<string, string> = {};
  for (const step of buildAuditPlan(layout)) {
    if (step.kind === "tsc") {
      continue;
    }
    scripts[step.id] = step.id === "audit" ? "tsx tooling/run-audit.ts" : `tsx tooling/${step.id.replace(/:/g, "-")}.ts`;
  }
  for (const name of Object.keys(auditExcludedScripts)) {
    scripts[name] = `tsx tooling/${name.replace(/:/g, "-")}.ts`;
  }
  return scripts;
}

function lockFor(name: string, version: string): string {
  return JSON.stringify({ name, version, lockfileVersion: 3, packages: { "": { name, version } } }, null, 2);
}

/** Write a minimal synthetic repo-root + skill-root pair that check-package-parity accepts. */
function writeParityPair(
  root: string,
  options: { rootVersion: string; skillVersion: string; nodePin?: boolean },
): { repoRoot: string; parityScriptRoot: string } {
  const repoRoot = path.join(root, "repo");
  const parityScriptRoot = path.join(repoRoot, "skill", "pkg");
  mkdirSync(parityScriptRoot, { recursive: true });

  const rootScripts = {
    ...planScripts("repo"),
    audit: "tsx skill/pkg/tooling/run-audit.ts",
    "audit:ci": "tsx skill/pkg/tooling/run-audit.ts --ci",
  };
  const runtimeScripts = {
    ...planScripts("skill"),
    audit: "tsx tooling/run-audit.ts",
  };
  const engines = options.nodePin === false ? undefined : { node: ">=22" };

  writeFileSync(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ name: "parity-root", version: options.rootVersion, ...(engines ? { engines } : {}), scripts: rootScripts, devDependencies: {} }, null, 2),
    "utf8",
  );
  writeFileSync(path.join(repoRoot, "package-lock.json"), lockFor("parity-root", options.rootVersion), "utf8");
  writeFileSync(
    path.join(parityScriptRoot, "package.json"),
    JSON.stringify(
      { name: "parity-runtime", version: options.skillVersion, ...(engines ? { engines } : {}), scripts: runtimeScripts, devDependencies: {} },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(path.join(parityScriptRoot, "package-lock.json"), lockFor("parity-runtime", options.skillVersion), "utf8");
  writeFileSync(path.join(parityScriptRoot, "skill-version.json"), JSON.stringify({ version: options.skillVersion }, null, 2), "utf8");
  if (options.nodePin !== false) {
    writeFileSync(path.join(repoRoot, ".nvmrc"), "22\n", "utf8");
    writeFileSync(path.join(repoRoot, ".node-version"), "22\n", "utf8");
  }
  return { repoRoot, parityScriptRoot };
}

export function register(h: Harness): void {
  const { makeEmptyFixture, runFixture, runScriptArgs } = h;

  // --- check-autopilot-contract ---
  runScriptArgs("autopilot contract passes on the shipped skill", "check-autopilot-contract.ts", ["--skill-root", skillRoot], 0);
  const autopilotEmpty = makeEmptyFixture("autopilot-empty-skill-root");
  runScriptArgs(
    "autopilot contract fails when SKILL.md is missing",
    "check-autopilot-contract.ts",
    ["--skill-root", autopilotEmpty],
    1,
    "autopilot.skill_missing",
  );

  // --- check-gates-layout ---
  //
  // The shipped tree must pass, and each of the three rules must be provably
  // able to fail. A flat checks/validation/business/ made duplicate basenames structurally
  // impossible; the mirrored layout does not, so that rule in particular is
  // the one carrying a guarantee the previous layout gave for free.
  runScriptArgs("gates layout passes on the shipped skill", "check-gates-layout.ts", ["--skill-root", skillRoot], 0);

  /** Minimal skill root: playbook domains define the permitted gate folders. */
  const layoutRoot = (name: string, build: (root: string) => void): string => {
    const root = makeEmptyFixture(name);
    for (const domain of ["money", "process"]) {
      mkdirSync(path.join(root, "knowledge", domain), { recursive: true });
    }
    mkdirSync(path.join(root, "checks", "validation", "business", "money"), { recursive: true });
    writeFileSync(path.join(root, "checks", "validation", "business", "money", "check-revenue.ts"), "// stub\n", "utf8");
    build(root);
    return root;
  };

  const layoutClean = layoutRoot("gates-layout-clean", () => {});
  runScriptArgs("gates layout passes when every gate nests in a real domain", "check-gates-layout.ts", ["--skill-root", layoutClean], 0);

  const layoutUngrouped = layoutRoot("gates-layout-ungrouped", (root) => {
    writeFileSync(path.join(root, "checks", "validation", "business", "check-stray.ts"), "// stub\n", "utf8");
  });
  runScriptArgs(
    "gates layout fails on a gate left at the checks/validation/business/ root",
    "check-gates-layout.ts",
    ["--skill-root", layoutUngrouped],
    1,
    "gates_layout.ungrouped_gate",
  );

  const layoutUnknownDomain = layoutRoot("gates-layout-unknown-domain", (root) => {
    mkdirSync(path.join(root, "checks", "validation", "business", "finance"), { recursive: true });
    writeFileSync(path.join(root, "checks", "validation", "business", "finance", "check-invoices.ts"), "// stub\n", "utf8");
  });
  runScriptArgs(
    "gates layout fails on a folder that is not a playbook domain",
    "check-gates-layout.ts",
    ["--skill-root", layoutUnknownDomain],
    1,
    "gates_layout.unknown_domain",
  );

  const layoutDuplicate = layoutRoot("gates-layout-duplicate-basename", (root) => {
    mkdirSync(path.join(root, "checks", "validation", "business", "process"), { recursive: true });
    // Same basename as checks/validation/business/money/check-revenue.ts — impossible under a flat
    // checks/validation/business/, permitted by the filesystem once the domains are folders.
    writeFileSync(path.join(root, "checks", "validation", "business", "process", "check-revenue.ts"), "// stub\n", "utf8");
  });
  runScriptArgs(
    "gates layout fails when two domains hold the same basename",
    "check-gates-layout.ts",
    ["--skill-root", layoutDuplicate],
    1,
    "gates_layout.duplicate_basename",
  );

  // body_contract only earns its cost if dropping one pinned term actually
  // fails. The term stripped here is the read-only default, because that is the
  // one whose loss is a safety regression rather than a wording change: AGENTS.md
  // states it separately, and nothing else in this repo reads SKILL.md for it.
  //
  // The earlier version of this fixture stripped "non-Claude-Code runtime", a
  // string a later SKILL.md rewrite removed. The replace() silently became a
  // no-op and the fixture kept passing on the 65 unrelated errors the stale eval
  // was already producing. When SKILL.md is rewritten on purpose, re-derive the
  // eval's terms AND the term stripped here in the same change.
  const autopilotStripped = makeEmptyFixture("autopilot-read-only-default-stripped");
  mkdirSync(path.join(autopilotStripped, "checks", "validation", "repository", "evals", "triggering"), { recursive: true });
  cpSync(
    path.join(skillRoot, "checks", "validation", "repository", "evals", "triggering", "autopilot-triggering.yaml"),
    path.join(autopilotStripped, "checks", "validation", "repository", "evals", "triggering", "autopilot-triggering.yaml"),
  );
  const shippedSkill = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const strippedSkill = shippedSkill.replace("Keep the MCP read-only by default", "Let the MCP write by default");
  assert.notEqual(strippedSkill, shippedSkill, "autopilot fixture must strip a term SKILL.md still contains");
  writeFileSync(path.join(autopilotStripped, "SKILL.md"), strippedSkill, "utf8");
  runScriptArgs(
    "autopilot contract fails when SKILL.md drops the MCP read-only default",
    "check-autopilot-contract.ts",
    ["--skill-root", autopilotStripped],
    1,
    "autopilot.body.required_term_missing",
  );

  // Unsafe routing language must fail the skill contract even when added to a valid body.
  const autopilotForbiddenTerm = "bypass the reducer";
  const autopilotForbidden = makeEmptyFixture("autopilot-forbidden-term-reintroduced");
  mkdirSync(path.join(autopilotForbidden, "checks", "validation", "repository", "evals", "triggering"), { recursive: true });
  cpSync(
    path.join(skillRoot, "checks", "validation", "repository", "evals", "triggering", "autopilot-triggering.yaml"),
    path.join(autopilotForbidden, "checks", "validation", "repository", "evals", "triggering", "autopilot-triggering.yaml"),
  );
  const shippedSkillBody = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.ok(
    !shippedSkillBody.toLowerCase().includes(autopilotForbiddenTerm.toLowerCase()),
    "forbidden-term fixture must start from a SKILL.md that does not already contain the unsafe instruction",
  );
  const reintroduced = `${shippedSkillBody}\n\nUpdate \`${autopilotForbiddenTerm}\` directly when state changes.\n`;
  assert.notEqual(reintroduced, shippedSkillBody, "forbidden-term fixture must actually add the unsafe instruction");
  assert.ok(
    reintroduced.toLowerCase().includes(autopilotForbiddenTerm.toLowerCase()),
    "forbidden-term fixture must contain the unsafe instruction it claims to reintroduce",
  );
  writeFileSync(path.join(autopilotForbidden, "SKILL.md"), reintroduced, "utf8");
  runScriptArgs(
    "autopilot contract fails when SKILL.md reintroduces a unsafe routing instruction",
    "check-autopilot-contract.ts",
    ["--skill-root", autopilotForbidden],
    1,
    "autopilot.body.forbidden_term_present",
  );

  // --- check-generated-pages ---
  //
  // Four founder-facing pages had drifted from the documents they were written
  // from while the audit stayed green, so every rule here has to be provably
  // able to fail. All three assertions matter: page-is-declared alone misses a
  // deleted page, declared-page-exists alone misses stale content, and the
  // byte-match alone misses a new hand-authored page nobody declared.
  runScriptArgs(
    "generated pages pass on the shipped business documents",
    "check-generated-pages.ts",
    ["--root", path.join(skillRoot, "examples", "workspace", "business")],
    0,
  );

  /**
   * A business root holding only what this gate reads: every declared page plus
   * every Markdown source. Copying the whole of business/ would work and would
   * cost ~300 files per fixture for no extra coverage.
   */
  const pagesRoot = (name: string, build: (root: string) => void): string => {
    const root = makeEmptyFixture(name);
    for (const [html, entry] of artifactPageEntries()) {
      cpSync(path.join(skillRoot, "examples", "workspace", "business", html), path.join(root, html));
      if (entry.kind === "authored-from") {
        cpSync(path.join(skillRoot, "examples", "workspace", "business", entry.markdown), path.join(root, entry.markdown));
      }
    }
    build(root);
    return root;
  };

  runScriptArgs(
    "generated pages fail when the business directory is absent",
    "check-generated-pages.ts",
    ["--root", path.join(skillRoot, "examples", "workspace", "business", "no-such-directory")],
    1,
    "generated_pages.business_root_missing",
  );

  const pagesClean = pagesRoot("generated-pages-clean", () => {});
  runScriptArgs("generated pages pass on a root holding exactly the declared set", "check-generated-pages.ts", ["--root", pagesClean], 0);

  const pagesUndeclared = pagesRoot("generated-pages-undeclared", (root) => {
    writeFileSync(path.join(root, "revenue-board.html"), "<!doctype html><html><body>hand written</body></html>", "utf8");
  });
  runScriptArgs(
    "generated pages fail on a page added with no declared source",
    "check-generated-pages.ts",
    ["--root", pagesUndeclared],
    1,
    "generated_pages.undeclared_page",
  );

  const pagesDeleted = pagesRoot("generated-pages-deleted", (root) => {
    rmSync(path.join(root, "store/store-console.html"));
  });
  runScriptArgs(
    "generated pages fail when a declared page is deleted",
    "check-generated-pages.ts",
    ["--root", pagesDeleted],
    1,
    "generated_pages.missing_page",
  );

  const pagesSourceGone = pagesRoot("generated-pages-source-missing", (root) => {
    rmSync(path.join(root, "trust/SECURITY.md"));
  });
  runScriptArgs(
    "generated pages fail when the document a page is written from is deleted",
    "check-generated-pages.ts",
    ["--root", pagesSourceGone],
    1,
    "generated_pages.source_missing",
  );

  // The drift case is the one the four broken pages would have been caught by:
  // the file exists, is declared, and no longer says what its source says.
  const pagesDrift = pagesRoot("generated-pages-drift", (root) => {
    const page = path.join(root, "product/onboarding.html");
    writeFileSync(page, readFileSync(page, "utf8").replace("Push permission prime", "Push permission (removed by hand)"), "utf8");
  });
  runScriptArgs(
    "generated pages fail when a page is edited away from its source",
    "check-generated-pages.ts",
    ["--root", pagesDrift],
    1,
    "generated_pages.drift",
  );

  // markdown-lite rejects constructs outside its subset instead of rendering
  // them as something else. A silent downgrade to a paragraph is exactly how a
  // section turns to mush behind a green gate.
  const pagesUnsupported = pagesRoot("generated-pages-unsupported-markdown", (root) => {
    const source = path.join(root, "operations/ORCHESTRATION.md");
    writeFileSync(source, `${readFileSync(source, "utf8")}\n#### Too deep for this renderer\n`, "utf8");
  });
  runScriptArgs(
    "generated pages fail on Markdown outside the subset rather than mangling it",
    "check-generated-pages.ts",
    ["--root", pagesUnsupported],
    1,
    "generated_pages.unsupported_markdown",
  );

  // --page scopes assertions 2 and 3 to one declared page -- used by ONB-22's own gate
  // (check:onboarding-page-fresh) so its acceptance does not depend on an unrelated page
  // elsewhere in the manifest being fresh too.
  runScriptArgs(
    "a --page-scoped check passes on the shipped business documents",
    "check-generated-pages.ts",
    ["--root", path.join(skillRoot, "examples", "workspace", "business"), "--page", "product/onboarding.html"],
    0,
  );

  const pagesScopedDriftElsewhere = pagesRoot("generated-pages-scoped-drift-elsewhere", (root) => {
    const source = path.join(root, "operations/ORCHESTRATION.md");
    writeFileSync(source, `${readFileSync(source, "utf8")}\nAn unrelated stale line the rendered page no longer carries.\n`, "utf8");
  });
  runScriptArgs(
    "--page product/onboarding.html passes even though an unrelated declared page has drifted",
    "check-generated-pages.ts",
    ["--root", pagesScopedDriftElsewhere, "--page", "product/onboarding.html"],
    0,
  );
  runScriptArgs(
    "the unscoped check still fails on that same unrelated drift",
    "check-generated-pages.ts",
    ["--root", pagesScopedDriftElsewhere],
    1,
    "generated_pages.drift",
  );

  runScriptArgs(
    "--page product/onboarding.html still fails when onboarding.html itself has drifted",
    "check-generated-pages.ts",
    ["--root", pagesDrift, "--page", "product/onboarding.html"],
    1,
    "generated_pages.drift",
  );

  runScriptArgs(
    "a --page value with no matching manifest entry fails loudly instead of passing vacuously",
    "check-generated-pages.ts",
    ["--root", pagesClean, "--page", "product/does-not-exist.html"],
    1,
    "generated_pages.page_not_declared",
  );

  // --- check-package-parity ---
  const parityClean = makeEmptyFixture("package-parity-clean");
  const cleanPair = writeParityPair(parityClean, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  runScriptArgs(
    "package parity passes on a version-aligned synthetic pair",
    "check-package-parity.ts",
    ["--repo-root", cleanPair.repoRoot, "--skill-root", cleanPair.parityScriptRoot],
    0,
  );

  // ADR-0002: check-package-parity now treats the root package.json as the shipped runtime
  // manifest (checkPackStandalone reads args.repoRoot, not args.skillRoot), so the files/
  // dependencies mutation below has to land on the repo-root manifest to be seen at all. It is
  // mirrored onto the skill/pkg manifest too, so this fixture exercises only the missing
  // checkout-compiler failure it names — not an incidental shared-parser-version-drift
  // finding from the two manifests disagreeing on every other dependency. After the compiled
  // runtime, typescript and tsx belong in devDependencies; packed bins must not carry them.
  const parityMissingTypeScript = makeEmptyFixture("package-parity-missing-typescript-checkout-tool");
  const missingTypeScriptPair = writeParityPair(parityMissingTypeScript, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  const missingTypeScriptDependencies = {
    "@google/design.md": "1.0.0",
    "@mdx-js/mdx": "1.0.0",
    "@modelcontextprotocol/sdk": "1.0.0",
    yaml: "1.0.0",
    zod: "1.0.0",
  };
  for (const manifestPath of [path.join(missingTypeScriptPair.repoRoot, "package.json"), path.join(missingTypeScriptPair.parityScriptRoot, "package.json")]) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.files = ["entrypoints"];
    manifest.dependencies = missingTypeScriptDependencies;
    manifest.devDependencies = { tsx: "1.0.0" };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }
  mkdirSync(path.join(missingTypeScriptPair.parityScriptRoot, "entrypoints", "cli"), { recursive: true });
  writeFileSync(path.join(missingTypeScriptPair.parityScriptRoot, "entrypoints", "cli", "b2c.mjs"), "#!/usr/bin/env node\n", "utf8");
  runScriptArgs(
    "package parity fails when the TypeScript compiler is missing from checkout tools",
    "check-package-parity.ts",
    ["--repo-root", missingTypeScriptPair.repoRoot, "--skill-root", missingTypeScriptPair.parityScriptRoot],
    1,
    "typescript is a checkout/build tool and must live in devDependencies",
  );

  const parityMissingMdx = makeEmptyFixture("package-parity-missing-mdx-runtime-dependency");
  const missingMdxPair = writeParityPair(parityMissingMdx, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  const missingMdxDependencies = {
    "@modelcontextprotocol/sdk": "1.0.0",
    tsx: "1.0.0",
    typescript: "1.0.0",
    yaml: "1.0.0",
    zod: "1.0.0",
  };
  for (const manifestPath of [path.join(missingMdxPair.repoRoot, "package.json"), path.join(missingMdxPair.parityScriptRoot, "package.json")]) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.files = ["entrypoints"];
    manifest.dependencies = missingMdxDependencies;
    manifest.devDependencies = { "@mdx-js/mdx": "1.0.0" };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }
  mkdirSync(path.join(missingMdxPair.parityScriptRoot, "entrypoints", "cli"), { recursive: true });
  writeFileSync(path.join(missingMdxPair.parityScriptRoot, "entrypoints", "cli", "b2c.mjs"), "#!/usr/bin/env node\n", "utf8");
  runScriptArgs(
    "package parity fails when the shipped MDX parser remains dev-only",
    "check-package-parity.ts",
    ["--repo-root", missingMdxPair.repoRoot, "--skill-root", missingMdxPair.parityScriptRoot],
    1,
    "@mdx-js/mdx is imported (or execed)",
  );

  const parityParserDrift = makeEmptyFixture("package-parity-parser-version-drift");
  const parserDriftPair = writeParityPair(parityParserDrift, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  const parserDriftRootManifestPath = path.join(parserDriftPair.repoRoot, "package.json");
  const parserDriftRuntimeManifestPath = path.join(parserDriftPair.parityScriptRoot, "package.json");
  const parserDriftRootManifest = JSON.parse(readFileSync(parserDriftRootManifestPath, "utf8")) as Record<string, unknown>;
  const parserDriftRuntimeManifest = JSON.parse(readFileSync(parserDriftRuntimeManifestPath, "utf8")) as Record<string, unknown>;
  parserDriftRootManifest.dependencies = { "@mdx-js/mdx": "3.1.1" };
  parserDriftRuntimeManifest.dependencies = { "@mdx-js/mdx": "3.1.0" };
  writeFileSync(parserDriftRootManifestPath, JSON.stringify(parserDriftRootManifest, null, 2), "utf8");
  writeFileSync(parserDriftRuntimeManifestPath, JSON.stringify(parserDriftRuntimeManifest, null, 2), "utf8");
  runScriptArgs(
    "package parity fails when shared parser versions drift",
    "check-package-parity.ts",
    ["--repo-root", parserDriftPair.repoRoot, "--skill-root", parserDriftPair.parityScriptRoot],
    1,
    "package_parity.shared_runtime_dependency_version_drift",
  );

  const parityTypeScriptDrift = makeEmptyFixture("package-parity-typescript-version-drift");
  const typeScriptDriftPair = writeParityPair(parityTypeScriptDrift, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  const typeScriptDriftRootManifestPath = path.join(typeScriptDriftPair.repoRoot, "package.json");
  const typeScriptDriftRuntimeManifestPath = path.join(typeScriptDriftPair.parityScriptRoot, "package.json");
  const typeScriptDriftRootManifest = JSON.parse(readFileSync(typeScriptDriftRootManifestPath, "utf8")) as Record<string, unknown>;
  const typeScriptDriftRuntimeManifest = JSON.parse(readFileSync(typeScriptDriftRuntimeManifestPath, "utf8")) as Record<string, unknown>;
  typeScriptDriftRootManifest.dependencies = { typescript: "7.0.2" };
  typeScriptDriftRuntimeManifest.dependencies = { typescript: "7.0.1" };
  writeFileSync(typeScriptDriftRootManifestPath, JSON.stringify(typeScriptDriftRootManifest, null, 2), "utf8");
  writeFileSync(typeScriptDriftRuntimeManifestPath, JSON.stringify(typeScriptDriftRuntimeManifest, null, 2), "utf8");
  runScriptArgs(
    "package parity fails when shared TypeScript versions drift",
    "check-package-parity.ts",
    ["--repo-root", typeScriptDriftPair.repoRoot, "--skill-root", typeScriptDriftPair.parityScriptRoot],
    1,
    "package_parity.shared_runtime_dependency_version_drift",
  );

  const parityNoPin = makeEmptyFixture("package-parity-missing-node-pin");
  const noPinPair = writeParityPair(parityNoPin, { rootVersion: "0.0.1", skillVersion: "0.0.1", nodePin: false });
  runScriptArgs(
    "package parity fails when the synthetic pair omits engines.node and the Node pin files",
    "check-package-parity.ts",
    ["--repo-root", noPinPair.repoRoot, "--skill-root", noPinPair.parityScriptRoot],
    1,
    "package_parity.root_engines_missing",
  );

  const parityDrift = makeEmptyFixture("package-parity-version-drift");
  const driftPair = writeParityPair(parityDrift, { rootVersion: "0.0.1", skillVersion: "0.0.2" });
  runScriptArgs(
    "package parity fails when versions drift from skill-version.json",
    "check-package-parity.ts",
    ["--repo-root", driftPair.repoRoot, "--skill-root", driftPair.parityScriptRoot],
    1,
    "must match skill-version.json",
  );

  // A wired validator absent from run-launchbench.ts's knownValidators literal
  // is structurally barred from scenario coverage — the drift that let five real
  // PR-blocking gates go scenario-invisible. The parity check now reads the
  // literal and fails on the gap.
  const parityAllowlist = makeEmptyFixture("package-parity-launchbench-allowlist-gap");
  const allowlistPair = writeParityPair(parityAllowlist, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  mkdirSync(path.join(allowlistPair.parityScriptRoot, "tooling"), { recursive: true });
  writeFileSync(path.join(allowlistPair.parityScriptRoot, "tooling", "validate-project-state.ts"), "// stub\n", "utf8");
  writeFileSync(
    path.join(allowlistPair.parityScriptRoot, "tooling", "run-launchbench.ts"),
    'const knownValidators = new Set(["validate-project-state"]);\nexport { knownValidators };\n',
    "utf8",
  );
  runScriptArgs(
    "package parity fails when a wired validator is missing from the launchbench allowlist",
    "check-package-parity.ts",
    ["--repo-root", allowlistPair.repoRoot, "--skill-root", allowlistPair.parityScriptRoot],
    1,
    "package_parity.launchbench_validator_missing",
  );

  // A wired validator whose command names no script under checks/validation/business/, checks/validation/repository/ or
  // tooling/ used to be skipped in silence: the basename regex simply failed to
  // match and the loop moved on, so the allowlist cross-check above could grade
  // nothing while still exiting 0. That is the exact shape of failure the
  // checks/validation/business/ + checks/validation/repository/ split could have reintroduced, so the unparseable command
  // is now an error in its own right and is proven to fail here.
  const parityUnparseable = makeEmptyFixture("package-parity-unparseable-validator-command");
  const unparseablePair = writeParityPair(parityUnparseable, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  mkdirSync(path.join(unparseablePair.parityScriptRoot, "tooling"), { recursive: true });
  writeFileSync(path.join(unparseablePair.parityScriptRoot, "tooling", "validate-project-state.ts"), "// stub\n", "utf8");
  writeFileSync(
    path.join(unparseablePair.parityScriptRoot, "tooling", "run-launchbench.ts"),
    'const knownValidators = new Set(["validate-project-state"]);\nexport { knownValidators };\n',
    "utf8",
  );
  for (const packagePath of [path.join(unparseablePair.repoRoot, "package.json"), path.join(unparseablePair.parityScriptRoot, "package.json")]) {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { scripts: Record<string, string> };
    // tools/ is not one of the three script roots, so no basename can be read.
    parsed.scripts["check:revenue"] = "tsx tools/check-revenue.ts";
    writeFileSync(packagePath, JSON.stringify(parsed, null, 2), "utf8");
  }
  runScriptArgs(
    "package parity fails loudly when a wired validator command names no known script root",
    "check-package-parity.ts",
    ["--repo-root", unparseablePair.repoRoot, "--skill-root", unparseablePair.parityScriptRoot],
    1,
    "package_parity.launchbench_validator_unparseable",
  );

  const templateFiles = [
    ["surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md", "# agents\n"],
    ["surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md", "# claude\n"],
    ["surfaces/workspace-template/repo-agent-entrypoints/.cursor/rules/agents.mdc", "# cursor\n"],
    ["surfaces/workspace-template/repo-agent-entrypoints/.claude/settings.json", "{}\n"],
  ] as const;
  const writeTemplateEntrypoints = (repoRoot: string): void => {
    for (const [relative, body] of templateFiles) {
      mkdirSync(path.join(repoRoot, path.dirname(relative)), { recursive: true });
      writeFileSync(path.join(repoRoot, relative), body, "utf8");
    }
  };

  const trackedClean = makeEmptyFixture("package-parity-template-tracked");
  const trackedCleanPair = writeParityPair(trackedClean, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  writeTemplateEntrypoints(trackedCleanPair.repoRoot);
  git(trackedCleanPair.repoRoot, ["init", "-q"]);
  git(trackedCleanPair.repoRoot, ["config", "user.email", "fixture@example.test"]);
  git(trackedCleanPair.repoRoot, ["config", "user.name", "Fixture"]);
  git(trackedCleanPair.repoRoot, ["add", "-A"]);
  git(trackedCleanPair.repoRoot, ["add", "-f", "surfaces/workspace-template/repo-agent-entrypoints/.claude/settings.json"]);
  git(trackedCleanPair.repoRoot, ["commit", "-qm", "tracked templates"]);
  runScriptArgs(
    "package parity passes when every workspace-template entrypoint is tracked",
    "check-package-parity.ts",
    ["--repo-root", trackedCleanPair.repoRoot, "--skill-root", trackedCleanPair.parityScriptRoot],
    0,
  );

  const untrackedSettings = makeEmptyFixture("package-parity-template-untracked");
  const untrackedPair = writeParityPair(untrackedSettings, { rootVersion: "0.0.1", skillVersion: "0.0.1" });
  writeTemplateEntrypoints(untrackedPair.repoRoot);
  git(untrackedPair.repoRoot, ["init", "-q"]);
  git(untrackedPair.repoRoot, ["config", "user.email", "fixture@example.test"]);
  git(untrackedPair.repoRoot, ["config", "user.name", "Fixture"]);
  git(untrackedPair.repoRoot, [
    "add",
    "-f",
    "package.json",
    "package-lock.json",
    ".nvmrc",
    ".node-version",
    "skill",
    "surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md",
    "surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md",
    "surfaces/workspace-template/repo-agent-entrypoints/.cursor/rules/agents.mdc",
  ]);
  git(untrackedPair.repoRoot, ["commit", "-qm", "missing claude settings"]);
  runScriptArgs(
    "package parity names a workspace-template entrypoint that is on disk but not tracked",
    "check-package-parity.ts",
    ["--repo-root", untrackedPair.repoRoot, "--skill-root", untrackedPair.parityScriptRoot],
    1,
    "package_parity.template_untracked",
  );

  // --- audit-skill-links ---
  const wireLinkRoot = (root: string): void => {
    mkdirSync(path.join(root, "knowledge"), { recursive: true });
    mkdirSync(path.join(root, "examples", "workspace", "business"), { recursive: true });
    writeFileSync(
      path.join(root, "knowledge", "guide.md"),
      "See [the template](../examples/workspace/business/artifact.md) for the artifact contract.\n",
      "utf8",
    );
    writeFileSync(
      path.join(root, "examples", "workspace", "business", "artifact.md"),
      "# Artifact\nRouted from references/guide.md — keep both sides linked.\n",
      "utf8",
    );
  };

  const linksClean = makeEmptyFixture("skill-links-clean");
  wireLinkRoot(linksClean);
  runScriptArgs("link audit passes on a wired reference/template pair", "audit-skill-links.ts", ["--skill-root", linksClean], 0);

  const linksBroken = makeEmptyFixture("skill-links-broken");
  wireLinkRoot(linksBroken);
  writeFileSync(
    path.join(linksBroken, "knowledge", "guide.md"),
    "See [the template](../examples/workspace/business/missing.md); artifact.md still routes.\n",
    "utf8",
  );
  runScriptArgs("link audit fails on a broken local link", "audit-skill-links.ts", ["--skill-root", linksBroken], 1, "skill_links.broken_local_link");

  const linksOrphan = makeEmptyFixture("skill-links-orphan");
  wireLinkRoot(linksOrphan);
  writeFileSync(path.join(linksOrphan, "knowledge", "unrouted.md"), "No other file mentions this reference, so no agent can load it.\n", "utf8");
  runScriptArgs("link audit fails on an orphaned reference file", "audit-skill-links.ts", ["--skill-root", linksOrphan], 1, "skill_links.orphan_file");

  // Regression (verification pass): a basename that is a substring of another
  // mentioned file's basename ("lane.md" inside "sub-lane.md") is not a mention.
  const linksSubstringOrphan = makeEmptyFixture("skill-links-substring-orphan");
  wireLinkRoot(linksSubstringOrphan);
  writeFileSync(path.join(linksSubstringOrphan, "knowledge", "lane.md"), "Nothing references this file by its own name.\n", "utf8");
  writeFileSync(
    path.join(linksSubstringOrphan, "knowledge", "guide.md"),
    "See [the template](../examples/workspace/business/artifact.md); also read sub-lane.md notes.\n",
    "utf8",
  );
  writeFileSync(path.join(linksSubstringOrphan, "knowledge", "sub-lane.md"), "Routed from references/guide.md.\n", "utf8");
  runScriptArgs("link audit flags a basename-substring orphan", "audit-skill-links.ts", ["--skill-root", linksSubstringOrphan], 1, "skill_links.orphan_file");

  const linksDuplicate = makeEmptyFixture("skill-links-duplicate");
  wireLinkRoot(linksDuplicate);
  const duplicateBody =
    "# Duplicate body\nThis exact content is shipped twice under business/, which will drift apart silently over time once one copy is edited and the other is forgotten.\n";
  writeFileSync(path.join(linksDuplicate, "examples", "workspace", "business", "copy-one.md"), duplicateBody, "utf8");
  writeFileSync(path.join(linksDuplicate, "examples", "workspace", "business", "copy-two.md"), duplicateBody, "utf8");
  writeFileSync(
    path.join(linksDuplicate, "knowledge", "guide.md"),
    "See [the template](../examples/workspace/business/artifact.md), plus copy-one.md and copy-two.md.\n",
    "utf8",
  );
  runScriptArgs(
    "link audit fails on byte-identical template duplicates",
    "audit-skill-links.ts",
    ["--skill-root", linksDuplicate],
    1,
    "skill_links.duplicate_template",
  );

  // --- check-template-safety ---
  const templateSafetyClean = makeEmptyFixture("template-safety-clean");
  writeFileSync(path.join(templateSafetyClean, "component.tsx"), 'import { View } from "react-native";\nexport const Ok = View;\n', "utf8");
  runFixture("template safety passes on native-animation-only code", templateSafetyClean, "check-template-safety.ts", 0);

  const templateSafetyStaleMobai = makeEmptyFixture("template-safety-stale-mobai");
  writeFileSync(path.join(templateSafetyStaleMobai, "TESTING.md"), "Call mcp__mobai__get_screenshot directly.\n", "utf8");
  runFixture(
    "template safety rejects hardcoded MobAI MCP identifiers",
    templateSafetyStaleMobai,
    "check-template-safety.ts",
    1,
    "template_safety.stale_mobai_mcp_name",
  );

  const templateSafetyBad = makeEmptyFixture("template-safety-framer-motion");
  writeFileSync(path.join(templateSafetyBad, "component.tsx"), 'import { motion } from "framer-motion";\nexport const Bad = motion.div;\n', "utf8");
  runFixture(
    "template safety fails on a framer-motion import in template code",
    templateSafetyBad,
    "check-template-safety.ts",
    1,
    "template_safety.framer_motion_in_template",
  );

  // The landing section library is a web-only surface where motion/react is
  // mandated (knowledge/design/landing-motion-craft.md); the same import outside
  // landing/ still fails above.
  const templateSafetyLanding = makeEmptyFixture("template-safety-landing-pack");
  mkdirSync(path.join(templateSafetyLanding, "growth", "landing", "sections"), { recursive: true });
  writeFileSync(
    path.join(templateSafetyLanding, "growth", "landing", "sections", "Hero.tsx"),
    'import { motion } from "motion/react";\nexport const Hero = motion.section;\n',
    "utf8",
  );
  runFixture("template safety allows motion/react inside the landing web pack", templateSafetyLanding, "check-template-safety.ts", 0);

  // Regression (verification pass): the exception is anchored to the TOP-LEVEL
  // landing/ pack; a nested directory named landing stays covered by the gate.
  const templateSafetyNestedLanding = makeEmptyFixture("template-safety-nested-landing");
  mkdirSync(path.join(templateSafetyNestedLanding, "mobile", "landing"), { recursive: true });
  writeFileSync(
    path.join(templateSafetyNestedLanding, "mobile", "landing", "Screen.tsx"),
    'import { motion } from "framer-motion";\nexport const Screen = motion.div;\n',
    "utf8",
  );
  runFixture(
    "template safety still fails motion imports in nested landing dirs",
    templateSafetyNestedLanding,
    "check-template-safety.ts",
    1,
    "template_safety.framer_motion_in_template",
  );

  // --- check-founder-copy ---
  // The gate had zero fixture coverage: nothing proved it could fail.
  runScriptArgs(
    "founder copy passes on the shipped skill and templates",
    "check-founder-copy.ts",
    ["--root", path.join(skillRoot, "examples", "workspace", "business"), "--skill-root", skillRoot],
    0,
  );

  const founderCopyRawId = makeEmptyFixture("founder-copy-raw-identifier");
  writeFileSync(
    path.join(founderCopyRawId, "design/design-room.html"),
    "<html><body><h2>Progress</h2><p>paid_tool_routing | not_started</p></body></html>\n",
    "utf8",
  );
  runScriptArgs(
    "raw snake_case on a founder surface fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyRawId, "--skill-root", skillRoot],
    1,
    "founder_copy.raw_identifier",
  );

  // Rule 3's general banned-vocabulary scan against founder-visible prose had
  // no fixture of its own -- only the narrower rule-4b technique-naming
  // special case exercised the dictionary. This is the direct case: a banned
  // term in ordinary prose, not a technique name.
  const founderCopyBannedVocabulary = makeEmptyFixture("founder-copy-banned-vocabulary");
  writeFileSync(
    path.join(founderCopyBannedVocabulary, "design/design-room.html"),
    "<html><body><h2>Progress</h2><p>Your onboarding lane is almost done.</p></body></html>\n",
    "utf8",
  );
  runScriptArgs(
    "banned internal vocabulary in founder-visible prose fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyBannedVocabulary, "--skill-root", skillRoot],
    1,
    "founder_copy.internal_vocabulary",
  );

  // tooling/lib/artifact-pages.ts's renderSourceArtifactPage base64-embeds real Markdown in a
  // <script> and decodes it client-side into a target element by id -- a raw <script> body is
  // dropped from the scan as code, not prose, so without decoding it here too, that payload
  // could carry any internal vocabulary straight past this gate. These two fixtures prove the
  // decode step actually runs: a payload landing outside the sanctioned <details> disclosure
  // must still fail, and the identical payload landing inside it must still pass.
  const decodedPayload = Buffer.from("Your onboarding lane is almost done.", "utf8").toString("base64");
  const founderCopyDecodedScriptLeak = makeEmptyFixture("founder-copy-decoded-script-leak");
  writeFileSync(
    path.join(founderCopyDecodedScriptLeak, "product/onboarding.html"),
    [
      "<html><body>",
      '<section><pre id="source"></pre></section>',
      "<script>",
      `document.getElementById("source").textContent = atob("${decodedPayload}");`,
      "</script>",
      "</body></html>",
      "",
    ].join("\n"),
    "utf8",
  );
  runScriptArgs(
    "a base64-decoded script payload outside the technical-details disclosure fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyDecodedScriptLeak, "--skill-root", skillRoot],
    1,
    "founder_copy.internal_vocabulary",
  );

  const founderCopyDecodedScriptInDetails = makeEmptyFixture("founder-copy-decoded-script-in-details");
  writeFileSync(
    path.join(founderCopyDecodedScriptInDetails, "product/onboarding.html"),
    [
      "<html><body>",
      '<details><summary>Technical details</summary><pre id="source"></pre></details>',
      "<script>",
      `document.getElementById("source").textContent = atob("${decodedPayload}");`,
      "</script>",
      "</body></html>",
      "",
    ].join("\n"),
    "utf8",
  );
  runScriptArgs(
    "the identical decoded payload passes founder copy once its target sits inside the technical-details disclosure",
    "check-founder-copy.ts",
    ["--root", founderCopyDecodedScriptInDetails, "--skill-root", skillRoot],
    0,
  );

  // Empty narrative after orientation fails the current founder-copy contract.
  const founderCopyStaleNarrative = makeEmptyFixture("founder-copy-stale-narrative");
  writeFileSync(
    path.join(founderCopyStaleNarrative, "state/business-state.json"),
    JSON.stringify({ narrative: { sinceLastTime: "", rightNow: "", yourCall: "" }, project: { phase: "phase_1" } }),
    "utf8",
  );
  runScriptArgs(
    "empty narrative past orient fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyStaleNarrative, "--skill-root", skillRoot],
    1,
    "founder_copy.narrative_stale.sinceLastTime",
  );

  const founderCopyTemplateName = makeEmptyFixture("founder-copy-template-name");
  writeFileSync(
    path.join(founderCopyTemplateName, "state/business-state.json"),
    JSON.stringify({
      narrative: {
        sinceLastTime: "The market review is complete.",
        rightNow: "I am turning the findings into the product decision.",
        yourCall: "No action is needed from you right now.",
      },
      project: { name: "App Name", phase: "phase_1" },
    }),
    "utf8",
  );
  runScriptArgs(
    "template project name after setup fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyTemplateName, "--skill-root", skillRoot],
    1,
    "founder_copy.template_project_name",
  );

  const founderCopyRepeatedUpdate = makeEmptyFixture("founder-copy-repeated-update");
  writeFileSync(
    path.join(founderCopyRepeatedUpdate, "state/business-state.json"),
    JSON.stringify({
      narrative: {
        sinceLastTime: "The first device flow now works from start to finish.",
        rightNow: "The first device flow now works from start to finish.",
        yourCall: "No action is needed from you right now.",
      },
      project: { name: "Shelf", phase: "phase_5b" },
    }),
    "utf8",
  );
  runScriptArgs(
    "repeated milestone narration fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyRepeatedUpdate, "--skill-root", skillRoot],
    1,
    "founder_copy.repeated_update",
  );

  const founderCopyConnectedBlocked = makeEmptyFixture("founder-copy-connected-blocked");
  writeFileSync(
    path.join(founderCopyConnectedBlocked, "state/business-state.json"),
    JSON.stringify({ project: { name: "Shelf", phase: "phase_0_orient" }, providers: { posthog: { connectionStatus: "connected", accessRoute: "blocked" } } }),
    "utf8",
  );
  runScriptArgs(
    "connected service with blocked route fails founder copy",
    "check-founder-copy.ts",
    ["--root", founderCopyConnectedBlocked, "--skill-root", skillRoot],
    1,
    "founder_copy.connected_tool_contradiction",
  );

  const noCommitCheckpoint = makeEmptyFixture("source-checkpoint-no-commit");
  writeFileSync(
    path.join(noCommitCheckpoint, "state/business-state.json"),
    JSON.stringify({ project: { phase: "phase_5b" }, lanes: { engineering: { status: "running" } } }),
    "utf8",
  );
  git(noCommitCheckpoint, ["init"]);
  runScriptArgs(
    "build work without a first commit fails source checkpoint",
    "check-source-checkpoint.ts",
    ["--root", noCommitCheckpoint],
    1,
    "source_checkpoint.no_commit",
  );

  const untrackedCheckpoint = makeEmptyFixture("source-checkpoint-untracked-source");
  writeFileSync(
    path.join(untrackedCheckpoint, "state/business-state.json"),
    JSON.stringify({ project: { phase: "phase_5b" }, lanes: { engineering: { status: "running" } } }),
    "utf8",
  );
  writeFileSync(path.join(untrackedCheckpoint, "README.md"), "# Fixture\n", "utf8");
  git(untrackedCheckpoint, ["init"]);
  git(untrackedCheckpoint, ["config", "user.email", "fixture@example.test"]);
  git(untrackedCheckpoint, ["config", "user.name", "Fixture"]);
  git(untrackedCheckpoint, ["add", "state/business-state.json", "README.md"]);
  git(untrackedCheckpoint, ["commit", "-m", "initial checkpoint"]);
  mkdirSync(path.join(untrackedCheckpoint, "lib"), { recursive: true });
  writeFileSync(path.join(untrackedCheckpoint, "lib/app.dart"), "void main() {}\n", "utf8");
  runScriptArgs(
    "untracked app source during build work fails source checkpoint",
    "check-source-checkpoint.ts",
    ["--root", untrackedCheckpoint],
    1,
    "source_checkpoint.untracked_source",
  );

  /**
   * Rule 4 — the experience-card naming decision. The twelve technique names are
   * deliberately NOT translated for a founder, which is a decision that leaves no trace in
   * the tree and so rots faster than a change would. These four fixtures are the trace.
   *
   * Each builds a fake skill root: the real dictionary (so rules 1–3 stay
   * quiet) plus a card-stub directory whose tiers and names the fixture controls.
   */
  function makeCardSkillRoot(name: string, stubs: { file: string; heading: string; tier: string }[], dictionary?: string): string {
    const root = makeEmptyFixture(name);
    const skill = path.join(root, "skill");
    mkdirSync(path.join(skill, "tooling", "lib"), { recursive: true });
    mkdirSync(path.join(skill, "knowledge", "experience", "experience-cards"), { recursive: true });
    writeFileSync(
      path.join(skill, "tooling", "lib", "founder-copy.ts"),
      dictionary ?? readFileSync(path.join(skillRoot, "tooling", "lib", "founder-copy.ts"), "utf8"),
      "utf8",
    );
    for (const stub of stubs) {
      writeFileSync(
        path.join(skill, "knowledge", "experience", "experience-cards", stub.file),
        [`# ${stub.heading} Card`, "", `**Risk tier.** ${stub.tier} — canonical in the routing table.`, ""].join("\n"),
        "utf8",
      );
    }
    return root;
  }

  /** The shipped HIGH set. A fixture that keeps both of these leaves rule 4a quiet. */
  const attestedStubs = [
    { file: "variable-reward-card.md", heading: "Variable Reward", tier: "HIGH" },
    { file: "streak-and-loss-aversion-card.md", heading: "Streak and Loss Aversion", tier: "HIGH" },
  ];

  runScriptArgs(
    "card stubs matching the attested HIGH set pass founder copy",
    "check-founder-copy.ts",
    ["--root", makeEmptyFixture("founder-copy-cards-clean"), "--skill-root", path.join(makeCardSkillRoot("cards-clean", attestedStubs), "skill")],
    0,
  );

  // 4a — demoting a HIGH card in its stub must not silently shrink what the founder
  // attests to by name. This is the rule that makes the stub tiers load-bearing.
  const cardsDemoted = makeCardSkillRoot("cards-high-demoted", [
    { file: "variable-reward-card.md", heading: "Variable Reward", tier: "MEDIUM" },
    { file: "streak-and-loss-aversion-card.md", heading: "Streak and Loss Aversion", tier: "HIGH" },
  ]);
  runScriptArgs(
    "a HIGH card demoted in its stub fails the attested-technique tie",
    "check-founder-copy.ts",
    ["--root", makeEmptyFixture("founder-copy-cards-demoted"), "--skill-root", path.join(cardsDemoted, "skill")],
    1,
    "founder_copy.attested_technique_drift",
  );

  // 4a, other direction — promoting a card to HIGH without adding it to attestedTechniques
  // would leave a founder signing off on a mechanic the copy layer never named.
  const cardsPromoted = makeCardSkillRoot("cards-extra-high", [...attestedStubs, { file: "peak-end-card.md", heading: "Peak-End", tier: "HIGH" }]);
  runScriptArgs(
    "a card promoted to HIGH without founder copy fails the attested-technique tie",
    "check-founder-copy.ts",
    ["--root", makeEmptyFixture("founder-copy-cards-promoted"), "--skill-root", path.join(cardsPromoted, "skill")],
    1,
    "founder_copy.attested_technique_drift",
  );

  // 4b — banning a technique name is how the decision gets reversed by accident: the
  // banned list's contract is "say this instead", which is exactly the euphemism these
  // names must not acquire. "Proof" is already banned vocabulary, so a technique that
  // takes that name must fail rather than quietly inherit a replacement.
  const cardsBannedName = makeCardSkillRoot("cards-banned-name", [...attestedStubs, { file: "proof-card.md", heading: "Proof", tier: "MEDIUM" }]);
  runScriptArgs(
    "a technique named as banned vocabulary fails founder copy",
    "check-founder-copy.ts",
    ["--root", makeEmptyFixture("founder-copy-cards-banned"), "--skill-root", path.join(cardsBannedName, "skill")],
    1,
    "founder_copy.technique_alias_banned",
  );

  // 4c — the umbrella phrase is what a founder gets instead of twelve new words. Declaring
  // it as a constant proves nothing; it has to survive in the lane blurb they read.
  const cardsNoUmbrella = makeCardSkillRoot(
    "cards-umbrella-reworded",
    attestedStubs,
    readFileSync(path.join(skillRoot, "tooling", "lib", "founder-copy.ts"), "utf8").replace(
      "The moments that make the app satisfying to use, and the limits we hold ourselves to.",
      "How we handle engagement mechanics and their limits.",
    ),
  );
  runScriptArgs(
    "an emotional-design blurb that drops the umbrella phrase fails founder copy",
    "check-founder-copy.ts",
    ["--root", makeEmptyFixture("founder-copy-cards-umbrella"), "--skill-root", path.join(cardsNoUmbrella, "skill")],
    1,
    "founder_copy.umbrella_unreachable",
  );

  // --- check-motion-contract ---
  // The real contract files are copied in rather than invented, so each failing
  // fixture is the shipped skill plus exactly one seeded drift — if the shipped
  // files and the parser ever stop agreeing, the passing fixture goes red too.
  const motionContractFiles = [
    "knowledge/design/motion-craft-benchmarks.md",
    "knowledge/design/premium-mobile-craft.md",
    "examples/workspace/business/design/system/tokens.json",
    "examples/workspace/business/design/system/DesignTokens.swift",
    "examples/workspace/business/design/system/PremiumCraft.swift",
    "knowledge/experience/experience-cards/peak-end-card.md",
    "knowledge/experience/experience-cards/mastery-and-status-card.md",
    "knowledge/experience/experience-cards/variable-reward-card.md",
    "examples/workspace/business/DESIGN.md",
    "examples/workspace/business/state/business-state.json",
    "examples/workspace/business/product/experience/emotional-design/EMOTIONAL_DESIGN.md",
    "examples/workspace/business/design/motion-catalog/TokenSpring.swift",
    "examples/workspace/business/design/motion-catalog/motion-tokens.ts",
  ];
  const writeMotionContractRoot = (name: string, mutate?: (rel: string, text: string) => string): string => {
    const root = makeEmptyFixture(name);
    for (const rel of motionContractFiles) {
      const target = path.join(root, rel);
      mkdirSync(path.dirname(target), { recursive: true });
      const source = readFileSync(path.join(skillRoot, rel), "utf8");
      // These mutations address table cells, not the source formatter's column padding.
      const text =
        rel === "examples/workspace/business/DESIGN.md"
          ? source.replace(/^\|.*\|$/gm, (row) =>
              row
                .split(/(?<!\\)\|/)
                .map((cell) => cell.trim().replace(/^(:?)-{3,}(:?)$/, "$1---$2"))
                .join(" | ")
                .trim(),
            )
          : source;
      writeFileSync(target, mutate ? mutate(rel, text) : text, "utf8");
    }
    return root;
  };

  runScriptArgs("motion contract passes on the shipped skill", "check-motion-contract.ts", ["--skill-root", skillRoot], 0);

  const motionStarterHeaderMissing = writeMotionContractRoot("motion-contract-starter-live-surface-header-missing", (rel, text) => {
    if (rel === "examples/workspace/business/DESIGN.md") {
      assert(text.includes("| Surface | Real state or relationship | Recipe |"), "live-surface header fixture must match the current template");
      return text.replace(
        "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
        "| Surface omitted | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract validates the packaged starter live-effect table structure",
    "check-motion-contract.ts",
    ["--skill-root", motionStarterHeaderMissing],
    1,
    "motion_contract.live_surface.template_incomplete",
  );

  const motionLiveSurfaceMissing = writeMotionContractRoot("motion-contract-live-surface-missing", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? text.replace("### R18 — Semantic thinking orb", "### Removed semantic thinking orb") : text,
  );

  const motionLiveWorkspaceIncomplete = writeMotionContractRoot("motion-contract-live-workspace-incomplete", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6b");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text.replace(
        "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
        "| AI status | Processing state | R18 | Active orb | Not defined | Static status text | Static status text |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract validates the launched active workspace live-effect rows",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveWorkspaceIncomplete, "--workspace-root", path.join(motionLiveWorkspaceIncomplete, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );

  const motionLiveWorkspacePartialRow = writeMotionContractRoot("motion-contract-live-workspace-partial-row", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text.replace(
        "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
        "| AI status | Processing state | R18 | Active orb | Processing ends | Static status text | Static status text |\n| Relationship | Connected state |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract rejects any truncated live-effect row in a launched workspace",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveWorkspacePartialRow, "--workspace-root", path.join(motionLiveWorkspacePartialRow, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionLiveWorkspaceDiscontiguousTable = writeMotionContractRoot("motion-contract-live-workspace-discontiguous-table", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text.replace(
        "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
        "This prose ends the Markdown table.\n| AI status | Processing state | R18 | Active orb | Processing ends | Static status text | Static status text |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract does not join discontiguous pipe lines into a live-effect table",
    "check-motion-contract.ts",
    [
      "--skill-root",
      motionLiveWorkspaceDiscontiguousTable,
      "--workspace-root",
      path.join(motionLiveWorkspaceDiscontiguousTable, "examples/workspace/business"),
    ],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  for (const [label, open, close] of [
    ["fenced", "```markdown\n", "\n```"],
    ["commented", "<!--\n", "\n-->"],
    ["unterminated-comment", "<!--\n", ""],
    ["script-block", '<script type="text/plain">\n', "\n</script>"],
    ["style-block", "<style>\n", "\n</style>"],
  ] as const) {
    const hiddenLiveEffectTable = writeMotionContractRoot(`motion-contract-live-workspace-${label}-table`, (rel, text) => {
      if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
      if (rel === "examples/workspace/business/DESIGN.md") {
        const completeTable = [
          "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
          "| --- | --- | --- | --- | --- | --- | --- |",
          "| AI status | Processing state | R18 | Active orb and status text | Processing ends | Static status text | Static status text |",
        ].join("\n");
        return text.replace("### Live-surface effects", `### Live-surface effects\n\n${open}${completeTable}${close}`);
      }
      return text;
    });
    runScriptArgs(
      `motion contract ignores a ${label} live-effect table`,
      "check-motion-contract.ts",
      ["--skill-root", hiddenLiveEffectTable, "--workspace-root", path.join(hiddenLiveEffectTable, "examples/workspace/business")],
      1,
      "motion_contract.live_surface.workspace_incomplete",
    );
  }
  const motionNestedFenceTable = writeMotionContractRoot("motion-contract-live-workspace-nested-fence-table", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      const completeTable = [
        "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| AI status | Processing state | R18 | Active orb and status text | Processing ends | Static status text | Static status text |",
      ].join("\n");
      const hiddenTable = `\`\`\`\`markdown\n\`\`\`text\n\`\`\`\`text\n${completeTable}\n\`\`\`\n\`\`\`\``;
      return text.replace("### Live-surface effects", `### Live-surface effects\n\n${hiddenTable}`);
    }
    return text;
  });
  runScriptArgs(
    "motion contract honors a longer outer fence and rejects info-suffixed closers",
    "check-motion-contract.ts",
    ["--skill-root", motionNestedFenceTable, "--workspace-root", path.join(motionNestedFenceTable, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionIndentedCodeTable = writeMotionContractRoot("motion-contract-live-workspace-indented-code-table", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      const hiddenTable = [
        "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| AI status | Processing state | R18 | Active orb and status text | Processing ends | Static status text | Static status text |",
      ]
        .map((line) => `    ${line}`)
        .join("\n");
      return text.replace("### Live-surface effects", `### Live-surface effects\n\n${hiddenTable}`);
    }
    return text;
  });
  runScriptArgs(
    "motion contract ignores an indented-code live-effect table",
    "check-motion-contract.ts",
    ["--skill-root", motionIndentedCodeTable, "--workspace-root", path.join(motionIndentedCodeTable, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionLiveWorkspaceUnsupportedRecipe = writeMotionContractRoot("motion-contract-live-workspace-unsupported-recipe", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text.replace(
        "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
        "| AI status | Processing state | R19 | Active orb | Processing ends | Static status text | Static status text |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract rejects an unsupported live-effect recipe",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveWorkspaceUnsupportedRecipe, "--workspace-root", path.join(motionLiveWorkspaceUnsupportedRecipe, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionLiveWorkspaceReorderedRecipe = writeMotionContractRoot("motion-contract-live-workspace-reordered-recipe", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text
        .replace(
          "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
          "| Surface | Real state or relationship | Low-power fallback | Visible or semantic signal | Stop condition | Reduced-motion result | Recipe |",
        )
        .replace(
          "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
          "| AI status | Processing state | none | Active orb | Processing ends | Static status text | R19 |",
        );
    }
    return text;
  });
  runScriptArgs(
    "motion contract resolves Recipe from reordered live-effect headers",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveWorkspaceReorderedRecipe, "--workspace-root", path.join(motionLiveWorkspaceReorderedRecipe, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionLiveWorkspaceMissingSeparator = writeMotionContractRoot("motion-contract-live-workspace-missing-separator", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text
        .replace(
          "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |\n| --- | --- | --- | --- | --- | --- | --- |",
          "| Surface | Real state or relationship | Recipe | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |",
        )
        .replace(
          "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
          "| AI status | Processing state | R19 | Active orb | Processing ends | Static status text | Static status text |\n| AI status | Processing state | R18 | Active orb | Processing ends | Static status text | Static status text |",
        );
    }
    return text;
  });
  runScriptArgs(
    "motion contract rejects a live-effect table without a Markdown separator",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveWorkspaceMissingSeparator, "--workspace-root", path.join(motionLiveWorkspaceMissingSeparator, "examples/workspace/business")],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionPrelaunchActiveWorkspace = writeMotionContractRoot("motion-contract-prelaunch-active-workspace");
  const prelaunchBusinessRoot = path.join(motionPrelaunchActiveWorkspace, "active-business");
  cpSync(path.join(motionPrelaunchActiveWorkspace, "examples/workspace/business"), prelaunchBusinessRoot, { recursive: true });
  {
    const contractPath = path.join(prelaunchBusinessRoot, "DESIGN.md");
    const contract = readFileSync(contractPath, "utf8").replace(
      "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
      "| AI status | Processing state | R19 | Active orb | Processing ends | Static status text | Static status text |",
    );
    writeFileSync(contractPath, contract, "utf8");
  }
  runScriptArgs(
    "motion contract validates an explicit active workspace before phase 6",
    "check-motion-contract.ts",
    ["--skill-root", motionPrelaunchActiveWorkspace, "--workspace-root", prelaunchBusinessRoot],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  const motionLiveWorkspaceEscapedPipe = writeMotionContractRoot("motion-contract-live-workspace-escaped-pipe", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      assert(text.includes("| Not defined | Not defined | R15, R16, R17, R18, or none |"), "escaped-pipe fixture must replace the live-effect row");
      return text.replace(
        "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
        "| AI status | Processing state | R18 | Active \\| idle orb | Processing ends | Static status text | Static status text |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract preserves escaped pipes inside a live-effect cell",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveWorkspaceEscapedPipe, "--workspace-root", path.join(motionLiveWorkspaceEscapedPipe, "examples/workspace/business")],
    0,
  );
  const motionLiveWorkspaceAlternatePlaceholders = writeMotionContractRoot("motion-contract-live-workspace-alternate-placeholders", (rel, text) => {
    if (rel.endsWith("business-state.json")) return text.replaceAll("phase_0_orient", "phase_6_live");
    if (rel === "examples/workspace/business/DESIGN.md") {
      return text.replace(
        "| Not defined | Not defined | R15, R16, R17, R18, or none | Not defined | Not defined | Not defined | Not defined |",
        "| TBD | TODO | none | Pending | Not reviewed | Not captured | Not recorded |",
      );
    }
    return text;
  });
  runScriptArgs(
    "motion contract rejects alternate placeholders in launched live-effect rows",
    "check-motion-contract.ts",
    [
      "--skill-root",
      motionLiveWorkspaceAlternatePlaceholders,
      "--workspace-root",
      path.join(motionLiveWorkspaceAlternatePlaceholders, "examples/workspace/business"),
    ],
    1,
    "motion_contract.live_surface.workspace_incomplete",
  );
  runScriptArgs(
    "motion contract fails when one live-surface recipe disappears",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveSurfaceMissing],
    1,
    "motion_contract.live_surface.recipe_missing",
  );

  const motionLiveSurfaceHeadingOnly = writeMotionContractRoot("motion-contract-live-surface-heading-only", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace(/### R16 — State-bound perimeter beam[\s\S]*?(?=\n### R17 — Liquid-metal priority ring)/, "### R16 — State-bound perimeter beam\n")
      : text,
  );
  runScriptArgs(
    "motion contract fails when a live-surface recipe keeps only its heading",
    "check-motion-contract.ts",
    ["--skill-root", motionLiveSurfaceHeadingOnly],
    1,
    "motion_contract.live_surface.recipe_incomplete",
  );

  const motionMirrorDrift = writeMotionContractRoot("motion-contract-mirror-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace("celebrate (response 0.45–0.5 / damping 0.5–0.7)", "celebrate (response 0.45–0.6 / damping 0.5–0.7)")
      : text,
  );
  runScriptArgs(
    "motion contract fails when the benchmarks spring-family mirror drifts from the craft table",
    "check-motion-contract.ts",
    ["--skill-root", motionMirrorDrift],
    1,
    "motion_contract.family_mirror.drift",
  );

  // The motion tokens the contract compares against live in DESIGN.md's b2c-motion-tokens block,
  // not in design/system/tokens.json — that file is a promoted output. Mutating the output left
  // the authored value untouched, so this negative control silently stopped drifting anything.
  const motionTokenDrift = writeMotionContractRoot("motion-contract-token-drift", (rel, text) =>
    rel === "examples/workspace/business/DESIGN.md" ? text.replace("durationBase: 220ms", "durationBase: 200ms") : text,
  );
  runScriptArgs(
    "motion contract fails when a documented token value drifts from DESIGN.md",
    "check-motion-contract.ts",
    ["--skill-root", motionTokenDrift],
    1,
    "motion_contract.token_row.value_drift",
  );

  const motionRecipeWindowDrift = writeMotionContractRoot("motion-contract-recipe-window-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? text.replace("window (360–600ms total)", "window (360–650ms total)") : text,
  );
  runScriptArgs(
    "motion contract fails when a recipe's own restated window drifts from tokens.json",
    "check-motion-contract.ts",
    ["--skill-root", motionRecipeWindowDrift],
    1,
    "motion_contract.recipe_window.value_drift",
  );

  const motionRecipeWindowReworded = writeMotionContractRoot("motion-contract-recipe-window-reworded", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? text.replace("window (360–600ms total)", "window (fits comfortably inside the cap)") : text,
  );
  runScriptArgs(
    "motion contract fails when no recipe window statement is parseable, instead of silently checking nothing",
    "check-motion-contract.ts",
    ["--skill-root", motionRecipeWindowReworded],
    1,
    "motion_contract.recipe_window.none_found",
  );

  const motionRecipeFamilyInlineDrift = writeMotionContractRoot("motion-contract-recipe-family-inline-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace("press-family spring (response 0.3–0.4s, damping 0.7–0.8)", "press-family spring (response 0.3–0.4s, damping 0.7–0.9)")
      : text,
  );
  runScriptArgs(
    "motion contract fails when a recipe's inline spring-family restatement drifts from the craft table",
    "check-motion-contract.ts",
    ["--skill-root", motionRecipeFamilyInlineDrift],
    1,
    "motion_contract.recipe_family_inline.drift",
  );

  const motionRecipeFamilyInlineReworded = writeMotionContractRoot("motion-contract-recipe-family-inline-reworded", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? text.replace("press-family spring (response 0.3–0.4s, damping 0.7–0.8)", "a calm, restrained spring") : text,
  );
  runScriptArgs(
    "motion contract fails when no recipe spring-family restatement is parseable, instead of silently checking nothing",
    "check-motion-contract.ts",
    ["--skill-root", motionRecipeFamilyInlineReworded],
    1,
    "motion_contract.recipe_family_inline.none_found",
  );

  const motionOffsetTableRowDrift = writeMotionContractRoot("motion-contract-offset-table-row-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace(
          "| 3      | 2    | 100ms             | up to 100ms                                                   | 600ms            |",
          "| 3      | 2    | 100ms             | up to 180ms                                                   | 600ms            |",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when an offset-table row's offset and total disagree with each other",
    "check-motion-contract.ts",
    ["--skill-root", motionOffsetTableRowDrift],
    1,
    "motion_contract.recipe_offset_table.row_internally_inconsistent",
  );

  const motionOffsetTableBoundaryDrift = writeMotionContractRoot("motion-contract-offset-table-boundary-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace(
          "| 5+     | 4+   | ≤50ms             | below the 60ms stagger floor — not achievable as pure stagger | —                |",
          "| 6+     | 5+   | ≤50ms             | below the 60ms stagger floor — not achievable as pure stagger | —                |",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when the offset table's unachievable-asset-count boundary drifts from the recomputed value",
    "check-motion-contract.ts",
    ["--skill-root", motionOffsetTableBoundaryDrift],
    1,
    "motion_contract.recipe_offset_table.boundary_drift",
  );

  const motionOffsetTableDrift = writeMotionContractRoot("motion-contract-offset-table-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace(
          "| 4      | 3    | 66ms              | up to 66ms (still ≥ the 60ms stagger floor)                   | 598ms            |",
          "| 4      | 3    | 66ms              | up to 66ms (still ≥ the 60ms stagger floor)                   | 588ms            |",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when an offset-table row's total drifts from what its own offset computes",
    "check-motion-contract.ts",
    ["--skill-root", motionOffsetTableDrift],
    1,
    "motion_contract.recipe_offset_table.row_internally_inconsistent",
  );

  const motionOffsetTableGapsDrift = writeMotionContractRoot("motion-contract-offset-table-gaps-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace(
          "| 3      | 2    | 100ms             | up to 100ms                                                   | 600ms            |",
          "| 3      | 3    | 100ms             | up to 100ms                                                   | 600ms            |",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when an offset-table row's Gaps cell disagrees with its own asset count",
    "check-motion-contract.ts",
    ["--skill-root", motionOffsetTableGapsDrift],
    1,
    "motion_contract.recipe_offset_table.gaps_drift",
  );

  const motionOffsetTableGapBudgetDrift = writeMotionContractRoot("motion-contract-offset-table-gap-budget-drift", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace(
          "| 3      | 2    | 100ms             | up to 100ms                                                   | 600ms            |",
          "| 3      | 2    | 120ms             | up to 100ms                                                   | 600ms            |",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when an offset-table row's Gap-budget-÷-gaps cell disagrees with the recomputed value",
    "check-motion-contract.ts",
    ["--skill-root", motionOffsetTableGapBudgetDrift],
    1,
    "motion_contract.recipe_offset_table.gap_budget_drift",
  );

  const motionOffsetTableMissingAssetCountRow = writeMotionContractRoot("motion-contract-offset-table-missing-row", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text.replace("| 3      | 2    | 100ms             | up to 100ms                                                   | 600ms            |\n", "")
      : text,
  );
  runScriptArgs(
    "motion contract fails when an achievable asset count has no row at all in the offset table",
    "check-motion-contract.ts",
    ["--skill-root", motionOffsetTableMissingAssetCountRow],
    1,
    "motion_contract.recipe_offset_table.missing_asset_count_row",
  );

  const motionCanonDrift = writeMotionContractRoot("motion-contract-canon-outside-band", (rel, text) =>
    rel.endsWith("peak-end-card.md") ? text.replace(".spring(response: 0.45, dampingFraction: 0.7)", ".spring(response: 0.45, dampingFraction: 0.85)") : text,
  );
  runScriptArgs(
    "motion contract fails when a canon card's spring falls outside the stated celebrate band",
    "check-motion-contract.ts",
    ["--skill-root", motionCanonDrift],
    1,
    "motion_contract.canon.outside_band",
  );

  const motionPresetDrift = writeMotionContractRoot("motion-contract-preset-duration-drift", (rel, text) =>
    rel.endsWith("PremiumCraft.swift") ? text.replace("duration: DesignTokens.Motion.durationFast,", "duration: DesignTokens.Motion.durationBase,") : text,
  );
  runScriptArgs(
    "motion contract fails when a preset rides a different duration token than the table maps",
    "check-motion-contract.ts",
    ["--skill-root", motionPresetDrift],
    1,
    "motion_contract.preset.duration_mismatch",
  );

  const motionRowLost = writeMotionContractRoot("motion-contract-table-row-lost", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text
          .split("\n")
          .filter((line) => !line.startsWith("| `durationSlow`"))
          .join("\n")
      : text,
  );
  runScriptArgs(
    "motion contract fails when the token table silently loses a required row",
    "check-motion-contract.ts",
    ["--skill-root", motionRowLost],
    1,
    "motion_contract.token_table.row_missing",
  );

  // The durationCelebrate row carries TWO presets; the gate must validate the
  // second annotation, not just the first, and must notice the row vanishing.
  const motionLandingBounceDrift = writeMotionContractRoot("motion-contract-landing-bounce-drift", (rel, text) =>
    rel.endsWith("PremiumCraft.swift") ? text.replace("bounce: 0.45", "bounce: 0.5") : text,
  );
  runScriptArgs(
    "motion contract fails when the celebrateLanding preset bounce drifts from the table",
    "check-motion-contract.ts",
    ["--skill-root", motionLandingBounceDrift],
    1,
    "motion_contract.preset.bounce_drift",
  );

  const motionCelebrateRowLost = writeMotionContractRoot("motion-contract-celebrate-row-lost", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? text
          .split("\n")
          .filter((line) => !line.startsWith("| `durationCelebrate`"))
          .join("\n")
      : text,
  );
  runScriptArgs(
    "motion contract fails when the celebrate mapping row is removed from the table",
    "check-motion-contract.ts",
    ["--skill-root", motionCelebrateRowLost],
    1,
    "motion_contract.token_table.row_missing",
  );

  const motionAnnotationLost = writeMotionContractRoot("motion-contract-preset-annotation-lost", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? text.replace("`PremiumMotion.press` (bounce 0.18)", "`PremiumMotion.press`") : text,
  );
  runScriptArgs(
    "motion contract fails when a preset row loses its bounce annotation",
    "check-motion-contract.ts",
    ["--skill-root", motionAnnotationLost],
    1,
    "motion_contract.preset.annotation_missing",
  );

  const motionMalformedRef = writeMotionContractRoot("motion-contract-malformed-token-ref", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? `${text}\nWeb loops may also ride \`motion.durationReveal2\` or \`motion.constructor\` when staged.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a malformed token reference that truncation used to let pass",
    "check-motion-contract.ts",
    ["--skill-root", motionMalformedRef],
    1,
    "motion_contract.token_reference.unknown",
  );

  const motionSymbolUnresolvable = writeMotionContractRoot("motion-contract-symbol-unresolvable", (rel, text) =>
    rel.endsWith("variable-reward-card.md")
      ? text.replace(".spring(response: 0.5, dampingFraction: 0.6)", ".spring(response: DesignTokens.Motion.expressive, dampingFraction: 0.6)")
      : text,
  );
  runScriptArgs(
    "motion contract fails when a canon spring cites a Motion member the enum does not define",
    "check-motion-contract.ts",
    ["--skill-root", motionSymbolUnresolvable],
    1,
    "motion_contract.canon.symbol_unresolvable",
  );

  const motionVocabMember = writeMotionContractRoot("motion-contract-vocab-phantom-member", (rel, text) =>
    rel.endsWith("mastery-and-status-card.md") ? `${text}\nThe badge scale-in rides \`DesignTokens.Motion.expressive\` timing.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a prose reference to a Motion member the enum does not define",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabMember],
    1,
    "motion_contract.vocabulary.member_unknown",
  );

  const motionVocabToken = writeMotionContractRoot("motion-contract-vocab-phantom-token", (rel, text) =>
    rel.endsWith("peak-end-card.md") ? `${text}\nThe stamp fade rides \`motion.brief\` timing.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a card token reference tokens.json does not define",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabToken],
    1,
    "motion_contract.vocabulary.token_unknown",
  );

  const motionVocabCssVar = writeMotionContractRoot("motion-contract-vocab-phantom-css-var", (rel, text) =>
    rel.endsWith("variable-reward-card.md") ? `${text}\nWeb pulses read the \`--motion-brief\` variable.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a CSS variable the token promotion pipeline does not mint",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabCssVar],
    1,
    "motion_contract.vocabulary.css_var_unknown",
  );

  const motionVocabPunctuatedToken = writeMotionContractRoot("motion-contract-vocab-punctuated-token", (rel, text) =>
    rel.endsWith("peak-end-card.md") ? `${text}\nStaged loops may also ride \`motion.durationReveal-extra\` cycles.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a punctuated card token reference outside the benchmarks",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabPunctuatedToken],
    1,
    "motion_contract.vocabulary.token_unknown",
  );

  const motionVocabEmbeddedToken = writeMotionContractRoot("motion-contract-vocab-embedded-token", (rel, text) =>
    rel.endsWith("variable-reward-card.md") ? `${text}\nWeb: \`transition={{ repeat: Infinity, duration: motion.moderate }}\` for anticipation.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a phantom token embedded in an implementation code span",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabEmbeddedToken],
    1,
    "motion_contract.vocabulary.token_unknown",
  );

  const motionVocabFencedToken = writeMotionContractRoot("motion-contract-vocab-fenced-token", (rel, text) =>
    rel.endsWith("peak-end-card.md") ? `${text}\n\`\`\`swift\nlet duration = motion.moderate\n\`\`\`\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a phantom token inside a fenced code block",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabFencedToken],
    1,
    "motion_contract.vocabulary.token_unknown",
  );

  const motionVocabIntrinsics = writeMotionContractRoot("motion-contract-vocab-intrinsic-elements", (rel, text) =>
    rel.endsWith("peak-end-card.md")
      ? `${text}\nWrap the section in \`motion.article\` or \`<motion.nav layout>\`; \`motion.form\` and \`motion.main\` also animate.\n`
      : text,
  );
  runScriptArgs(
    "motion contract accepts motion/react intrinsic elements beyond a fixed tag list",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabIntrinsics],
    0,
  );

  const motionPackBounceDrift = writeMotionContractRoot("motion-contract-pack-bounce-drift", (rel, text) =>
    rel.endsWith("TokenSpring.swift")
      ? text.replace(
          "TokenSpring(duration: DesignTokens.Motion.durationCelebrate, bounce: 0.45)",
          "TokenSpring(duration: DesignTokens.Motion.durationCelebrate, bounce: 0.5)",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when TokenSpring.swift's copied bounce drifts from PremiumCraft",
    "check-motion-contract.ts",
    ["--skill-root", motionPackBounceDrift],
    1,
    "motion_contract.token_spring.bounce_drift",
  );

  const motionPackTsValueDrift = writeMotionContractRoot("motion-contract-pack-ts-value-drift", (rel, text) =>
    rel.endsWith("motion-tokens.ts") ? text.replace("durationCelebrate: 500,", "durationCelebrate: 450,") : text,
  );
  runScriptArgs(
    "motion contract fails when motion-tokens.ts's ms table drifts from tokens.json",
    "check-motion-contract.ts",
    ["--skill-root", motionPackTsValueDrift],
    1,
    "motion_contract.motion_tokens.token_value_drift",
  );

  const motionPackPresetMissing = writeMotionContractRoot("motion-contract-pack-preset-missing", (rel, text) =>
    rel.endsWith("motion-tokens.ts") ? text.replace("  celebrateLanding: springFromPreset(Motion.durationCelebrate, 0.45),\n", "") : text,
  );
  runScriptArgs(
    "motion contract fails when motion-tokens.ts drops a PremiumCraft preset",
    "check-motion-contract.ts",
    ["--skill-root", motionPackPresetMissing],
    1,
    "motion_contract.motion_tokens.preset_missing",
  );

  const motionCardMomentDrift = writeMotionContractRoot("motion-contract-card-moment-drift", (rel, text) => {
    if (!rel.endsWith("examples/workspace/business/DESIGN.md")) return text;
    assert(text.includes("| Intent Mirror | Use `motion.durationReveal`"), "card-moment fixture must replace the current token");
    return text.replace("| Intent Mirror | Use `motion.durationReveal`", "| Intent Mirror | Use `motion.durationSlow`");
  });
  runScriptArgs(
    "motion contract fails when the two seeded templates disagree on a card moment's tokens",
    "check-motion-contract.ts",
    ["--skill-root", motionCardMomentDrift],
    1,
    "motion_contract.card_moments.drift",
  );

  const motionVocabCssVarSuffix = writeMotionContractRoot("motion-contract-vocab-css-var-suffix", (rel, text) =>
    rel.endsWith("variable-reward-card.md") ? `${text}\nWeb pulses may read the \`--motion-duration-fast_extra\` variable.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a CSS variable that extends a promoted name past an identifier boundary",
    "check-motion-contract.ts",
    ["--skill-root", motionVocabCssVarSuffix],
    1,
    "motion_contract.vocabulary.css_var_unknown",
  );

  const motionFamilyDuplicate = writeMotionContractRoot("motion-contract-family-duplicate", (rel, text) =>
    rel.endsWith("premium-mobile-craft.md")
      ? text.replace(
          "| **celebrate** | response 0.45\u20130.5, dampingFraction 0.5\u20130.7",
          "| **press** | response 0.2\u20130.3, dampingFraction 0.9\u20130.95 | stale contradictory row | none |\n| **celebrate** | response 0.45\u20130.5, dampingFraction 0.5\u20130.7",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when the spring table states a family twice",
    "check-motion-contract.ts",
    ["--skill-root", motionFamilyDuplicate],
    1,
    "motion_contract.family_table.duplicate",
  );

  const motionPunctuatedRef = writeMotionContractRoot("motion-contract-punctuated-token-ref", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md") ? `${text}\nStaged loops may also ride \`motion.durationReveal-extra\` cycles.\n` : text,
  );
  runScriptArgs(
    "motion contract fails on a punctuated token reference the closing-backtick rule now captures",
    "check-motion-contract.ts",
    ["--skill-root", motionPunctuatedRef],
    1,
    "motion_contract.token_reference.unknown",
  );

  const motionMalformedSpring = writeMotionContractRoot("motion-contract-malformed-spring-literal", (rel, text) =>
    rel.endsWith("mastery-and-status-card.md")
      ? text.replace(".spring(response: 0.5, dampingFraction: 0.7)", ".spring(response: 0..5, dampingFraction: 0.7)")
      : text,
  );
  runScriptArgs(
    "motion contract fails when a canon spring literal does not parse as a valid decimal",
    "check-motion-contract.ts",
    ["--skill-root", motionMalformedSpring],
    1,
    "motion_contract.canon.spring_malformed",
  );

  const motionPresetValueDrift = writeMotionContractRoot("motion-contract-preset-value-drift", (rel, text) =>
    rel.endsWith("DesignTokens.swift") ? text.replace("static let durationFast: Double = 0.12", "static let durationFast: Double = 0.15") : text,
  );
  runScriptArgs(
    "motion contract fails when the Swift duration value drifts from the documented milliseconds",
    "check-motion-contract.ts",
    ["--skill-root", motionPresetValueDrift],
    1,
    "motion_contract.token_row.swift_value_drift",
  );

  const motionMirrorDuplicate = writeMotionContractRoot("motion-contract-mirror-duplicate", (rel, text) =>
    rel.endsWith("motion-craft-benchmarks.md")
      ? `${text}\nStale: press (response 0.2\u20130.3 / damping 0.9\u20130.95) and celebrate (response 0.7\u20130.8 / damping 0.3\u20130.4) were the old bands.\n`
      : text,
  );
  runScriptArgs(
    "motion contract fails when a second stale spring-family mirror statement appears",
    "check-motion-contract.ts",
    ["--skill-root", motionMirrorDuplicate],
    1,
    "motion_contract.family_mirror.duplicate",
  );

  const motionInvertedRange = writeMotionContractRoot("motion-contract-inverted-range", (rel, text) =>
    rel.endsWith("premium-mobile-craft.md")
      ? text.replace(
          "| **press**     | response 0.3\u20130.4, dampingFraction 0.7\u20130.8",
          "| **press**     | response 0.4\u20130.3, dampingFraction 0.7\u20130.8",
        )
      : text,
  );
  runScriptArgs(
    "motion contract fails when a spring-family range is inverted",
    "check-motion-contract.ts",
    ["--skill-root", motionInvertedRange],
    1,
    "motion_contract.family_table.inverted_range",
  );

  const motionSwiftMemberLost = writeMotionContractRoot("motion-contract-swift-member-lost", (rel, text) =>
    rel.endsWith("DesignTokens.swift")
      ? text
          .split("\n")
          .filter((line) => !line.includes("static let stagger: Double"))
          .join("\n")
      : text,
  );
  runScriptArgs(
    "motion contract fails when a documented token member is deleted from the Swift enum",
    "check-motion-contract.ts",
    ["--skill-root", motionSwiftMemberLost],
    1,
    "motion_contract.token_row.swift_member_missing",
  );

  const motionCinematicLeak = writeMotionContractRoot("motion-contract-cinematic-leak", (rel, text) =>
    rel.endsWith("premium-mobile-craft.md") ? `${text}\nUse durationCinematic for hero moments.\n` : text,
  );
  runScriptArgs(
    "motion contract fails when the cinematic token leaks into the in-app craft doctrine",
    "check-motion-contract.ts",
    ["--skill-root", motionCinematicLeak],
    1,
    "motion_contract.cinematic.in_craft_doctrine",
  );

  // --- check-no-slop ---
  //
  // The gate had zero fixture coverage: nothing proved the tier split (public
  // front-door docs error, maintainer-only docs warn) or the advisory-only
  // status of empty adverbs/phrases could actually fire. The real
  // no-slop-writing.md is copied in rather than a fixture-only word list, so a
  // rule added there is exercised here without duplicating it.
  // The installed skill runtime intentionally contains only the skill package,
  // not the B2C App Builder repository's public front-door files. Exercise this
  // repository-positive control only when the checkout's actual front door is
  // present; the synthetic positive/negative controls below still run in both
  // source and installed-runtime audits.
  const shippedRepoRoot = path.resolve(skillRoot, "../..");
  if (
    existsSync(path.join(shippedRepoRoot, "README.md")) &&
    existsSync(path.join(shippedRepoRoot, "CONTRIBUTING.md")) &&
    existsSync(path.join(shippedRepoRoot, ".github", "SECURITY.md")) &&
    existsSync(path.join(shippedRepoRoot, ".github", "CODE_OF_CONDUCT.md"))
  ) {
    runScriptArgs("no-slop passes on the shipped repo's own front door", "check-no-slop.ts", ["--repo-root", shippedRepoRoot, "--skill-root", skillRoot], 0);
  }

  function writeNoSlopRoot(name: string, overrides: Partial<Record<string, string>> = {}): { repoRoot: string; skillRoot: string } {
    const root = makeEmptyFixture(name);
    const repoRoot = path.join(root, "repo");
    const fixtureSkillRoot = path.join(repoRoot, "skill", "pkg");
    mkdirSync(path.join(fixtureSkillRoot, "knowledge", "words"), { recursive: true });
    const defaults: Record<string, string> = {
      "README.md": "# Example\n\nA plain description of what this project does.\n",
      "CONTRIBUTING.md": "# Contributing\n\nOpen a pull request with a clear description of the change.\n",
      ".github/SECURITY.md": "# Security\n\nReport issues to security@example.com.\n",
      ".github/CODE_OF_CONDUCT.md": "# Code Of Conduct\n\nBe respectful in every interaction.\n",
      "AGENTS.md": "# Agents\n\nFollow the repository conventions documented here.\n",
      "CLAUDE.md": "# Claude Instructions\n\nFollow the repository conventions documented here.\n",
    };
    for (const [relative, content] of Object.entries({ ...defaults, ...overrides })) {
      if (content === undefined) continue;
      const target = path.join(repoRoot, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    }
    cpSync(path.join(skillRoot, "knowledge", "words", "no-slop-writing.md"), path.join(fixtureSkillRoot, "knowledge", "words", "no-slop-writing.md"));
    return { repoRoot, skillRoot: fixtureSkillRoot };
  }

  const noSlopClean = writeNoSlopRoot("no-slop-clean");
  runScriptArgs(
    "no-slop passes on a synthetic clean front door",
    "check-no-slop.ts",
    ["--repo-root", noSlopClean.repoRoot, "--skill-root", noSlopClean.skillRoot],
    0,
  );

  const noSlopMissing = writeNoSlopRoot("no-slop-missing-file");
  rmSync(path.join(noSlopMissing.repoRoot, "CONTRIBUTING.md"));
  runScriptArgs(
    "no-slop fails when a declared front-door file is missing",
    "check-no-slop.ts",
    ["--repo-root", noSlopMissing.repoRoot, "--skill-root", noSlopMissing.skillRoot],
    1,
    "no_slop.front_door_missing",
  );

  const noSlopBannedReadme = writeNoSlopRoot("no-slop-banned-word-readme", {
    "README.md": "# Example\n\nThis tool leverages a robust workflow.\n",
  });
  runScriptArgs(
    "no-slop fails when the repo's own README uses a banned word",
    "check-no-slop.ts",
    ["--repo-root", noSlopBannedReadme.repoRoot, "--skill-root", noSlopBannedReadme.skillRoot],
    1,
    "no_slop.banned_word",
  );

  const noSlopPattern = writeNoSlopRoot("no-slop-pattern-throat-clearing", {
    "CONTRIBUTING.md": "# Contributing\n\nHere's the thing: open a pull request with a clear description.\n",
  });
  runScriptArgs(
    "no-slop fails on a mechanical slop pattern, not just banned words",
    "check-no-slop.ts",
    ["--repo-root", noSlopPattern.repoRoot, "--skill-root", noSlopPattern.skillRoot],
    1,
    "no_slop.pattern.throat_clearing",
  );

  const noSlopMetadiscourse = writeNoSlopRoot("no-slop-pattern-interpretive-metadiscourse", {
    "README.md": "# Example\n\nThe key point is that this command writes the report to disk.\n",
  });
  runScriptArgs(
    "no-slop fails when interpretive metadiscourse replaces direct support",
    "check-no-slop.ts",
    ["--repo-root", noSlopMetadiscourse.repoRoot, "--skill-root", noSlopMetadiscourse.skillRoot],
    1,
    "no_slop.pattern.interpretive_metadiscourse",
  );

  // AGENTS.md and CLAUDE.md are maintainer-only guidance: the same banned word
  // that fails the gate on README.md only warns here, per no-slop-writing.md
  // §2's own documented tier split.
  const noSlopBannedAgents = writeNoSlopRoot("no-slop-banned-word-agents", {
    "AGENTS.md": "# Agents\n\nThis skill leverages a shared runtime.\n",
  });
  runScriptArgs(
    "no-slop demotes the same banned word to a warning on maintainer-only docs",
    "check-no-slop.ts",
    ["--repo-root", noSlopBannedAgents.repoRoot, "--skill-root", noSlopBannedAgents.skillRoot],
    0,
    "WARNING no_slop.banned_word",
  );

  // Empty adverbs/phrases are documented as advisory-only in every
  // no-slop-rules.ts consumer, never promoted to an error even on a
  // public-front-door file — this is the fixture that proves it.
  const noSlopAdverb = writeNoSlopRoot("no-slop-empty-adverb-readme", {
    "README.md": "# Example\n\nThis actually just describes what the project does.\n",
  });
  runScriptArgs(
    "no-slop keeps an empty adverb a warning even on a public front-door file",
    "check-no-slop.ts",
    ["--repo-root", noSlopAdverb.repoRoot, "--skill-root", noSlopAdverb.skillRoot],
    0,
    "WARNING no_slop.empty_adverb",
  );

  // --- check-technical-docs-ste100 ---
  //
  // The mechanical subset of knowledge/engineering/technical-documentation-ste100.md: sentence
  // length and present-perfect tense, at two severity tiers (error on the one file the
  // reference can currently guarantee compliant, warning on the rest of the governed surface),
  // the same tier split check-no-slop.ts proves above. Every case here proves the checker can
  // actually fire, not just pass — a gate is only real once it has been watched to fail.
  runScriptArgs("ste100 passes on the shipped repo's own error-tier file", "check-technical-docs-ste100.ts", ["--skill-root", skillRoot], 0);

  function writeSte100Root(
    name: string,
    overrides: {
      steFile?: string;
      extraKnowledgeFile?: { relative: string; content: string };
      readmeContent?: string;
      extraSkillFile?: { relative: string; content: string };
    } = {},
  ): { repoRoot: string; skillRoot: string } {
    const root = makeEmptyFixture(name);
    const repoRoot = path.join(root, "repo");
    const fixtureSkillRoot = path.join(repoRoot, "skill", "pkg");
    mkdirSync(path.join(fixtureSkillRoot, "knowledge", "engineering"), { recursive: true });
    const steContent =
      overrides.steFile ??
      "# Technical Documentation In Simplified Technical English (ASD-STE100)\n\nThis file follows its own rule. Every sentence stays short. The checker reads this file first.\n";
    writeFileSync(path.join(fixtureSkillRoot, "knowledge", "engineering", "technical-documentation-ste100.md"), steContent, "utf8");
    if (overrides.extraKnowledgeFile) {
      const target = path.join(fixtureSkillRoot, "knowledge", overrides.extraKnowledgeFile.relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, overrides.extraKnowledgeFile.content, "utf8");
    }
    if (overrides.readmeContent) {
      writeFileSync(path.join(fixtureSkillRoot, "README.md"), overrides.readmeContent, "utf8");
    }
    if (overrides.extraSkillFile) {
      const target = path.join(fixtureSkillRoot, overrides.extraSkillFile.relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, overrides.extraSkillFile.content, "utf8");
    }
    return { repoRoot, skillRoot: fixtureSkillRoot };
  }

  const ste100Clean = writeSte100Root("ste100-clean");
  runScriptArgs(
    "ste100 passes on a synthetic clean error-tier file",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100Clean.repoRoot, "--skill-root", ste100Clean.skillRoot],
    0,
  );

  const ste100LongSentence = writeSte100Root("ste100-long-sentence", {
    steFile:
      "# Doc\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
  });
  runScriptArgs(
    "ste100 fails the error-tier file on a sentence over the 20-word ceiling",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100LongSentence.repoRoot, "--skill-root", ste100LongSentence.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  const ste100PresentPerfect = writeSte100Root("ste100-present-perfect", {
    steFile: "# Doc\n\nThe validator has checked this file already.\n",
  });
  runScriptArgs(
    "ste100 fails the error-tier file on present-perfect tense",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100PresentPerfect.repoRoot, "--skill-root", ste100PresentPerfect.skillRoot],
    1,
    "ste100.present_perfect",
  );

  // A violation in a file outside the error-tier list is real, visible signal — but a warning,
  // never a build failure, matching no-slop's own maintainer-tier demotion above.
  const ste100WarningTier = writeSte100Root("ste100-warning-tier", {
    extraKnowledgeFile: {
      relative: "product/notes.md",
      content:
        "# Notes\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
    },
  });
  runScriptArgs(
    "ste100 demotes the same violation to a warning outside the error-tier file",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100WarningTier.repoRoot, "--skill-root", ste100WarningTier.skillRoot],
    0,
    "WARNING ste100.sentence_too_long",
  );

  // SKILL.md is the technical router named in the STE100 trigger. README is a mixed
  // front-door document: no-slop owns narrative, so the 20-word scan must not cover it.
  const ste100SkillMd = writeSte100Root("ste100-skill-scanned", {
    extraSkillFile: {
      relative: "SKILL.md",
      content:
        "# Skill\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
    },
    readmeContent:
      "# Package\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
  });
  runScriptArgs(
    "ste100 scans SKILL.md named in the reference trigger line",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100SkillMd.repoRoot, "--skill-root", ste100SkillMd.skillRoot],
    0,
    "WARNING ste100.sentence_too_long [skill/pkg/SKILL.md]",
  );

  // A trailing prose paragraph with no terminal punctuation used to fall off the end of the
  // sentence match entirely — a real gap Codex caught: an oversized or present-perfect closing
  // sentence passed silently as long as the file just stopped instead of ending in . ! ? or :
  const ste100Unterminated = writeSte100Root("ste100-unterminated-final-sentence", {
    steFile:
      "# Doc\n\nShort opening sentence here.\n\nThis closing sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces",
  });
  runScriptArgs(
    "ste100 still catches a violation in the final sentence when the file ends with no terminal punctuation",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100Unterminated.repoRoot, "--skill-root", ste100Unterminated.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A colon inside a real, single grammatical sentence must NOT end the sentence-length count
  // early — a real gap Codex caught: this 23-word instruction splits into a 9-word half and a
  // 14-word half at its mid-sentence colon, and the old "colon always ends a chunk" rule let
  // both halves pass individually while the sentence as a whole broke the 20-word ceiling.
  const ste100MidSentenceColon = writeSte100Root("ste100-mid-sentence-colon", {
    steFile:
      "# Doc\n\nFollow this procedure carefully and read every step twice: open the file first, then check the value against the reference table before continuing.\n",
  });
  runScriptArgs(
    "ste100 keeps a mid-sentence colon inside the same sentence, not a second short one",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100MidSentenceColon.repoRoot, "--skill-root", ste100MidSentenceColon.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // The list-introducing colon exception must stay narrow: it fires only when the very next
  // line is a list item, never for an ordinary colon-joined sentence sitting in plain prose.
  const ste100ColonNoList = writeSte100Root("ste100-colon-no-list-follows", {
    steFile: "# Doc\n\nRead this short line: it stays one sentence.\n\nA second short paragraph follows here with no list after it at all.\n",
  });
  runScriptArgs(
    "ste100 passes a colon-joined sentence under the ceiling when no list follows it",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100ColonNoList.repoRoot, "--skill-root", ste100ColonNoList.skillRoot],
    0,
  );

  // A real gap Codex caught: an active maintenance runbook (checks/validation/repository/*.md) named
  // by the reference's own scope ("a runbook") was outside both the hardcoded docs/ list and
  // the knowledge/ walk, so an edit to it got no signal at all.
  const ste100Runbook = writeSte100Root("ste100-runbook-scanned", {
    extraSkillFile: {
      relative: "checks/validation/repository/some-runbook.md",
      content:
        "# Some Runbook\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
    },
  });
  runScriptArgs(
    "ste100 scans checks/validation/repository/, a maintainer-runbook directory outside docs/ and knowledge/",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100Runbook.repoRoot, "--skill-root", ste100Runbook.skillRoot],
    0,
    "WARNING ste100.sentence_too_long [skill/pkg/checks/validation/repository/some-runbook.md]",
  );

  // A real gap Codex caught: table rows were dropped outright, so an unquoted present-perfect
  // sentence hiding in a table cell got no signal — even inside the error-tier reference file.
  const ste100TableViolation = writeSte100Root("ste100-table-cell-violation", {
    steFile: "# Doc\n\n| Rule | Example |\n|---|---|\n| Tense | The validator has read the file already |\n",
  });
  runScriptArgs(
    "ste100 now scans table cells and catches a violation hiding inside one",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100TableViolation.repoRoot, "--skill-root", ste100TableViolation.skillRoot],
    1,
    "ste100.present_perfect",
  );

  // Scanning table cells must not break on this reference's own §3 table, whose "Don't"
  // column intentionally quotes bad examples (including a present-perfect one) to teach the
  // rule — a quoted example is cited text, not the document's own assertion.
  const ste100TableQuotedExample = writeSte100Root("ste100-table-quoted-example-exempt", {
    steFile: '# Doc\n\n| Rule | Don\'t |\n|---|---|\n| Tense | "The validator has read the file." |\n',
  });
  runScriptArgs(
    "ste100 exempts a quoted illustrative example inside a table cell from the tense rule",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100TableQuotedExample.repoRoot, "--skill-root", ste100TableQuotedExample.skillRoot],
    0,
  );

  // A real gap Codex caught (originally via a platform ADR, since moved out with the platform):
  // a governed doc named only in the repo-root allowlist — not under the knowledge/ walk — must
  // really be scanned, or an edit to it gets no signal despite the repo policy governing it.
  const ste100Adr = writeSte100Root("ste100-adr-scanned");
  mkdirSync(path.join(ste100Adr.repoRoot, "docs", "implementation"), { recursive: true });
  writeFileSync(
    path.join(ste100Adr.repoRoot, "docs", "implementation", "graph-execution-v2.md"),
    "# Graph Execution\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
    "utf8",
  );
  runScriptArgs(
    "ste100 scans a doc named only in the repo-root allowlist (not found by the knowledge walk)",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100Adr.repoRoot, "--skill-root", ste100Adr.skillRoot],
    0,
    "WARNING ste100.sentence_too_long [docs/implementation/graph-execution-v2.md]",
  );

  // A real gap Codex caught: the prior blanket double-quote strip erased ANY quoted span before
  // grading, not just a whole-cell illustrative example — so an ordinary quoted UI string or
  // error message sitting inside real prose lost its own violation along with its quote marks.
  // A quoted span in plain prose is the author's own sentence, not a cited example, and must
  // stay fully counted.
  const ste100QuotedProseViolation = writeSte100Root("ste100-quoted-prose-still-counted", {
    steFile: '# Doc\n\nThe tooltip literally says "the validator has confirmed this already" every time it runs.\n',
  });
  runScriptArgs(
    "ste100 still catches present-perfect tense hiding inside a quoted phrase in plain prose",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100QuotedProseViolation.repoRoot, "--skill-root", ste100QuotedProseViolation.skillRoot],
    1,
    "ste100.present_perfect",
  );

  // The table-cell exemption is narrow on purpose: it drops a cell only when the ENTIRE trimmed
  // cell is one quoted string. A cell that merely contains a quote alongside other text is not
  // an illustrative example — it is prose with a quote in it — and must stay fully counted.
  const ste100PartialQuoteInCell = writeSte100Root("ste100-partial-quote-in-cell-counted", {
    steFile: '# Doc\n\n| Rule | Example |\n|---|---|\n| Tense | Example: "the validator has confirmed this" already |\n',
  });
  runScriptArgs(
    "ste100 still catches a violation in a table cell whose quote is partial, not whole-cell",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100PartialQuoteInCell.repoRoot, "--skill-root", ste100PartialQuoteInCell.skillRoot],
    1,
    "ste100.present_perfect",
  );

  // A real gap Codex caught: docs/implementation/graph-execution-v2.md, the current guide for
  // the graph compiler, durable runtime, scheduler, and verification boundary (named as such
  // by docs/implementation/README.md), was outside the hardcoded docs/ list.
  const ste100GraphExecutionGuide = writeSte100Root("ste100-graph-execution-guide-scanned");
  mkdirSync(path.join(ste100GraphExecutionGuide.repoRoot, "docs", "implementation"), { recursive: true });
  writeFileSync(
    path.join(ste100GraphExecutionGuide.repoRoot, "docs", "implementation", "graph-execution-v2.md"),
    "# Graph Execution V2\n\nThis sentence intentionally runs on for quite a long while with many extra words strung together well past the twenty word ceiling this rule enforces.\n",
    "utf8",
  );
  runScriptArgs(
    "ste100 scans docs/implementation/graph-execution-v2.md, the current graph-compiler guide",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100GraphExecutionGuide.repoRoot, "--skill-root", ste100GraphExecutionGuide.skillRoot],
    0,
    "WARNING ste100.sentence_too_long [docs/implementation/graph-execution-v2.md]",
  );

  // A real gap Codex caught: the sentence-splitting regex reads every period as a boundary,
  // including the two inside "e.g." — so a real sentence over the word ceiling could pass by
  // fragmenting into short-looking pieces at an abbreviation. This 24-word sentence splits
  // into three fragments of 14, 1, and 10 words at "e.g." without the fix, none over the
  // ceiling; with the fix it stays one sentence and is caught.
  const ste100AbbreviationPeriod = writeSte100Root("ste100-abbreviation-period-not-a-boundary", {
    steFile:
      "# Doc\n\nPick the canonical product name once and reuse it everywhere across every screen, e.g. onboarding, paywall, and email subjects, without ever renaming it again.\n",
  });
  runScriptArgs(
    "ste100 does not let e.g. fragment a real sentence into short-looking pieces under the ceiling",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100AbbreviationPeriod.repoRoot, "--skill-root", ste100AbbreviationPeriod.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A decimal or version-number period ("v0.114.0") must not be read as a sentence boundary
  // either — the same class of bug, a different period shape.
  const ste100VersionNumberPeriod = writeSte100Root("ste100-version-number-period-not-a-boundary", {
    steFile: "# Doc\n\nThe fixture suite runs clean against release v0.114.0 and every prior tagged release before it, including the ones from last quarter.\n",
  });
  runScriptArgs(
    "ste100 does not let a version-number period fragment a real sentence into short-looking pieces",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100VersionNumberPeriod.repoRoot, "--skill-root", ste100VersionNumberPeriod.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A real gap Codex caught: the list-item marker ("-", "1.", "- [ ]") was left in place before
  // counting words, so it counted as a word itself -- a genuinely compliant 20-word bullet was
  // reported as 21 and failed. This exact bullet is 20 words without its marker.
  const ste100ListMarkerNotAWord = writeSte100Root("ste100-list-marker-not-a-word", {
    steFile:
      "# Doc\n\n- One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.\n",
  });
  runScriptArgs(
    "ste100 does not count a bullet's own marker as one of its words",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100ListMarkerNotAWord.repoRoot, "--skill-root", ste100ListMarkerNotAWord.skillRoot],
    0,
  );

  // Same bug, the GFM task-list shape: the checkbox ("[ ]"/"[x]") is formatting too, and must
  // not inflate the count either.
  const ste100TaskListCheckboxNotAWord = writeSte100Root("ste100-task-list-checkbox-not-a-word", {
    steFile:
      "# Doc\n\n- [ ] One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.\n",
  });
  runScriptArgs(
    "ste100 does not count a task-list checkbox as one of its bullet's words",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100TaskListCheckboxNotAWord.repoRoot, "--skill-root", ste100TaskListCheckboxNotAWord.skillRoot],
    0,
  );

  // Stripping the marker must not blind the checker to a real violation: this bullet is 21
  // words even with its marker removed.
  const ste100ListMarkerStillCatchesReal = writeSte100Root("ste100-list-marker-strip-still-catches-real-violation", {
    steFile:
      "# Doc\n\n- One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone.\n",
  });
  runScriptArgs(
    "ste100 still catches a real violation in a bullet after stripping its marker",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100ListMarkerStillCatchesReal.repoRoot, "--skill-root", ste100ListMarkerStillCatchesReal.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A real gap Codex caught: the abbreviation-period fix from the previous round protected the
  // period whenever whitespace followed, even when that period was ALSO the end of its own
  // sentence -- so two independent, individually compliant sentences ("Use the standard
  // process, etc." + a fresh 16-word sentence) merged into one 21-word blob and produced a
  // false violation. Each half is under the ceiling alone; only the false merge is over it.
  const ste100AbbreviationSentenceFinal = writeSte100Root("ste100-abbreviation-sentence-final-still-a-boundary", {
    steFile:
      "# Doc\n\nUse the standard process, etc. Read the next instruction that follows immediately after this one very carefully every single time now.\n",
  });
  runScriptArgs(
    "ste100 keeps a sentence-final abbreviation period as a real boundary, not a false merge",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100AbbreviationSentenceFinal.repoRoot, "--skill-root", ste100AbbreviationSentenceFinal.skillRoot],
    0,
  );

  // The sentence-final fix must not reopen the mid-sentence bug the previous round fixed: an
  // abbreviation followed by a lowercase continuation must still protect its period.
  const ste100AbbreviationMidSentenceStillProtected = writeSte100Root("ste100-abbreviation-mid-sentence-still-protected", {
    steFile:
      "# Doc\n\nPick the canonical product name once and reuse it everywhere across every screen, e.g. onboarding, paywall, and email subjects, without ever renaming it again.\n",
  });
  runScriptArgs(
    "ste100 still protects a mid-sentence abbreviation period followed by a lowercase continuation",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100AbbreviationMidSentenceStillProtected.repoRoot, "--skill-root", ste100AbbreviationMidSentenceStillProtected.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A real gap Codex caught, grounded in this repo's own knowledge/engineering/backend-data-
  // contract.md ("a migration tool (e.g. Prisma Migrate, Alembic, node-pg-migrate) in the
  // contract"): the previous round's lowercase-only check assumed a capitalized continuation
  // always starts a new sentence, but "e.g." is routinely followed by a capitalized product
  // name mid-sentence. Only "etc." keeps the lowercase-only check; "e.g." and its siblings are
  // protected unconditionally.
  const ste100AbbreviationBeforeCapitalizedTerm = writeSte100Root("ste100-abbreviation-before-capitalized-term-still-protected", {
    steFile:
      "# Doc\n\nUse supported databases, e.g. PostgreSQL, MySQL, SQLite, or another relational engine your team already knows well from a prior production deployment.\n",
  });
  runScriptArgs(
    "ste100 still protects e.g. even when a capitalized product name follows it",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100AbbreviationBeforeCapitalizedTerm.repoRoot, "--skill-root", ste100AbbreviationBeforeCapitalizedTerm.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A real gap Codex caught: "+" is a valid CommonMark unordered-list marker alongside "-" and
  // "*", but the marker pattern only recognized the other two -- a compliant 20-word "+" bullet
  // was left undetected as a list item at all, so its marker counted as an extra word (21) and
  // it also never got a forced sentence boundary.
  const ste100PlusMarkerNotAWord = writeSte100Root("ste100-plus-list-marker-not-a-word", {
    steFile:
      "# Doc\n\n+ One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.\n",
  });
  runScriptArgs(
    "ste100 does not count a + bullet's own marker as one of its words",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100PlusMarkerNotAWord.repoRoot, "--skill-root", ste100PlusMarkerNotAWord.skillRoot],
    0,
  );

  // Recognizing "+" as a marker must not blind the checker to a real violation in a "+" bullet.
  const ste100PlusMarkerStillCatchesReal = writeSte100Root("ste100-plus-list-marker-still-catches-real-violation", {
    steFile:
      "# Doc\n\n+ One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone.\n",
  });
  runScriptArgs(
    "ste100 still catches a real violation in a + bullet after stripping its marker",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100PlusMarkerStillCatchesReal.repoRoot, "--skill-root", ste100PlusMarkerStillCatchesReal.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A real gap Codex caught: a list item that wraps onto a following physical line (no blank
  // line between) is one logical sentence, but each physical line got its own forced boundary,
  // so a real over-ceiling instruction could hide by fragmenting across its own soft wrap.
  const ste100WrappedListContinuation = writeSte100Root("ste100-wrapped-list-continuation-stays-one-sentence", {
    steFile:
      "# Doc\n\n- This instruction wraps onto a second physical line before its own terminal\n  punctuation lands, which pushes the true combined word count well past the limit.\n",
  });
  runScriptArgs(
    "ste100 keeps a wrapped list continuation as one sentence and catches a violation split across it",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100WrappedListContinuation.repoRoot, "--skill-root", ste100WrappedListContinuation.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // Grouping continuations must not merge across a genuine paragraph break: a blank line, or a
  // following line that is itself a new list item, table row, or heading, must start fresh. Each
  // half here is a compliant 12 words; merged across the blank line they would be 24 -- over the
  // ceiling -- so an incorrect merge is directly visible as a false violation.
  const ste100ListContinuationStopsAtBlankLine = writeSte100Root("ste100-list-continuation-stops-at-blank-line", {
    steFile:
      "# Doc\n\n- One two three four five six seven eight nine ten eleven twelve.\n\nAlpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.\n",
  });
  runScriptArgs(
    "ste100 does not merge a list item with an unrelated paragraph across a blank line",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100ListContinuationStopsAtBlankLine.repoRoot, "--skill-root", ste100ListContinuationStopsAtBlankLine.skillRoot],
    0,
  );

  // A real gap Codex caught: the previous round's continuation grouping required the follow-on
  // line to be indented, but CommonMark's "lazy continuation" rule counts an UNindented follow-on
  // line (no blank line before it) as part of the same list item too. This bullet's second line
  // has no leading whitespace at all.
  const ste100UnindentedLazyContinuation = writeSte100Root("ste100-unindented-lazy-continuation-stays-one-sentence", {
    steFile:
      "# Doc\n\n- This instruction wraps onto a second physical line before its own terminal\npunctuation lands, which pushes the true combined word count well past the limit.\n",
  });
  runScriptArgs(
    "ste100 keeps an unindented lazy list continuation as one sentence and catches a violation split across it",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100UnindentedLazyContinuation.repoRoot, "--skill-root", ste100UnindentedLazyContinuation.skillRoot],
    1,
    "ste100.sentence_too_long",
  );

  // A real gap Codex caught: the present-perfect heuristic only recognized five hard-coded
  // intervening modifiers (not/never/already/just/recently), so any other adverb between the
  // auxiliary and the participle -- "successfully" here -- let a present-perfect sentence pass
  // undetected, even in the error-tier reference itself.
  const ste100AdverbInPresentPerfect = writeSte100Root("ste100-adverb-in-present-perfect-still-caught", {
    steFile: "# Doc\n\nThe validator has successfully checked the file against every governed rule today.\n",
  });
  runScriptArgs(
    "ste100 still catches present-perfect tense with a general adverb between auxiliary and participle",
    "check-technical-docs-ste100.ts",
    ["--repo-root", ste100AdverbInPresentPerfect.repoRoot, "--skill-root", ste100AdverbInPresentPerfect.skillRoot],
    1,
    "ste100.present_perfect",
  );
}

function git(root: string, args: string[]): void {
  const result = spawnSync("git", ["-C", root, "-c", "core.excludesfile=", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Git fixture setup failed: ${result.stderr}`);
}
