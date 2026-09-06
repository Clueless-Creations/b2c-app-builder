import { initializeProductFixture } from "../fixtures/product-fixture.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness, repoCheckoutPresent, repoRoot } from "../fixtures/_harness.js";
import { ENTRYPOINT_FILES, readEntrypointTemplates } from "../../../adapters/install-entrypoints.js";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { loadCatalogFile } from "../../../kernel/session/run.js";

/**
 * Ports LaunchBench scenario `business-agent-entrypoints-missing.yaml` (validator cited there:
 * check-agent-entrypoints [port-disposition: drop — word-pattern]). The YAML's mechanically
 * checkable core survives even though its cited validator does not: "Do not copy skill-maintainer
 * AGENTS.md or CLAUDE.md into a generated business repo" is a real, structural, byte-comparable
 * fact, not prose grading. The subject that replaces the old validator is
 * adapters/install-entrypoints.ts (U6) — this suite adds the ONE assertion that file's own
 * adapters.fixtures.ts coverage stops short of: proving the installed content is not a verbatim
 * copy of the maintainer's own root-level AGENTS.md/CLAUDE.md.
 *
 * `business-repo-hooks-not-installed.yaml` — the sibling scenario about the OLD PostToolUse hook
 * mechanism — is DELIBERATELY NOT ported here. KTD8/R19 delete that mechanism outright at cutover
 * (port ledger's #3 top-drop: "its entire subject ... is deleted at cutover; nothing survives to
 * port"). It stays untouched in place for U11 to delete, per this unit's own port-ledger
 * discipline: a drop-listed scenario is not this unit's to touch.
 */

export function register(harness: Harness): void {
  // Both compare shipped templates against the maintainer's own root AGENTS.md/CLAUDE.md, which
  // live in the repository and are deliberately not shipped into an installed runtime.
  const entrypointCase: (label: string, fn: () => void) => void = repoCheckoutPresent()
    ? harness.check
    : (label) => harness.skip(label, `repo-only: no maintainer root entrypoints at ${repoRoot} (installed runtime)`);

  entrypointCase(
    "scenario/entrypoint-installation-proof (ports business-agent-entrypoints-missing): the v2 entrypoint templates are not a byte copy of the maintainer's own root AGENTS.md/CLAUDE.md",
    () => {
      const templates = readEntrypointTemplates(skillRoot);
      const templateAgents = templates.get("AGENTS.md");
      const templateClaude = templates.get("CLAUDE.md");
      assert(templateAgents !== undefined && templateClaude !== undefined, "expected the shipped entrypoint template set to include AGENTS.md and CLAUDE.md");
      assert(templates.has("APP_AGENTS.md"), "expected the generated repo bootstrap to include the shared app-worker contract");
      assert(
        templates.has(path.join("agents", "operator-readiness.md")),
        "expected the generated repo bootstrap to include specialist role prompts before any worker dispatch",
      );

      const maintainerAgentsPath = path.join(repoRoot, "AGENTS.md");
      const maintainerClaudePath = path.join(repoRoot, "CLAUDE.md");
      assert(
        existsSync(maintainerAgentsPath) && existsSync(maintainerClaudePath),
        "expected the maintainer repo's own root AGENTS.md/CLAUDE.md to exist for this comparison to be meaningful",
      );
      const maintainerAgents = readFileSync(maintainerAgentsPath, "utf8");
      const maintainerClaude = readFileSync(maintainerClaudePath, "utf8");

      assert(
        templateAgents !== maintainerAgents,
        "the generated-business AGENTS.md template must not be a byte-identical copy of the maintainer's own root AGENTS.md",
      );
      assert(
        templateClaude !== maintainerClaude,
        "the generated-business CLAUDE.md template must not be a byte-identical copy of the maintainer's own root CLAUDE.md",
      );
      // Belt and suspenders: the maintainer's own root CLAUDE.md says explicitly not to copy it —
      // if that sentence ever disappears, this scenario should still be enforcing the underlying
      // rule mechanically, not relying on the prose to say so.
      assert(
        maintainerClaude.toLowerCase().includes("do not copy"),
        "expected the maintainer root CLAUDE.md to still name this rule in its own prose (drift signal if it stops)",
      );
    },
  );

  entrypointCase(
    "scenario/entrypoint-installation-proof: what actually lands in a generated repo (via the real installer) is the app-specific template, filled for that business — never the maintainer's own file content",
    () => {
      const target = harness.makeTempDir("entrypoint-scenario-target");
      initializeProductFixture(target, "ScenarioFixtureApp");
      const tsxBin = (() => {
        const candidates = [path.join(skillRoot, "node_modules/.bin/tsx"), path.resolve(skillRoot, "../..", "node_modules/.bin/tsx")];
        return candidates.find((candidate) => existsSync(candidate)) ?? "tsx";
      })();
      const result = spawnSync(
        tsxBin,
        [
          path.join(skillRoot, "adapters/install-entrypoints.ts"),
          "--target",
          target,
          "--skill-root",
          skillRoot,
          "--apply",
          "--var",
          "APP_NAME=ScenarioFixtureApp",
          "--var",
          "BUSINESS_NAME=Scenario Fixture Inc",
        ],
        {
          cwd: skillRoot,
          encoding: "utf8",
        },
      );
      assert(result.status === 0, `expected the real installer to succeed, got ${result.status}: ${result.stdout}\n${result.stderr}`);

      for (const file of ENTRYPOINT_FILES) {
        const installedPath = path.join(target, file.relativePath);
        assert(existsSync(installedPath), `expected ${file.relativePath} to be installed`);
      }

      const installedAgents = readFileSync(path.join(target, "AGENTS.md"), "utf8");
      const installedClaude = readFileSync(path.join(target, "CLAUDE.md"), "utf8");
      const maintainerAgents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
      const maintainerClaude = readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8");

      assert(installedAgents !== maintainerAgents, "the AGENTS.md actually written into a generated repo must not equal the maintainer's own root AGENTS.md");
      assert(installedClaude !== maintainerClaude, "the CLAUDE.md actually written into a generated repo must not equal the maintainer's own root CLAUDE.md");
      assert(
        installedAgents.includes("ScenarioFixtureApp"),
        "expected the installed AGENTS.md to carry this business's own substituted name, proving it is app-specific, not generic maintainer content",
      );
      const installedAppAgents = readFileSync(path.join(target, "APP_AGENTS.md"), "utf8");
      assert(
        installedAppAgents.includes("Predetermined Specialist Prompts"),
        "the real installer must bootstrap APP_AGENTS.md before the first specialist worker can run",
      );
      const manifest = JSON.parse(readFileSync(path.join(target, ".b2c-launch", "runtime.json"), "utf8")) as {
        skillVersion: string;
        catalogVersion: string;
        catalogPath: string;
        skillRootEnv: string;
      };
      const sourceVersion = JSON.parse(readFileSync(path.join(skillRoot, "skill-version.json"), "utf8")) as { version: string };
      assert(manifest.skillVersion === sourceVersion.version, "installed runtime binding must match the source skill version");
      assert(manifest.catalogPath === "catalog.json", "installed runtime binding must point at the session runner's default catalog path");
      assert(manifest.skillRootEnv === "B2C_APP_BUILDER_SKILL_ROOT", "installed runtime binding must provide a portable environment override");
      const installedCatalog = loadCatalogFile(path.join(target, "catalog.json"));
      assert(manifest.catalogVersion === installedCatalog.version, "installed runtime binding must pin the exact executable catalog version");
      assert(installedCatalog.version.endsWith(manifest.skillVersion), "installed catalog version must match the runtime manifest");
      const plan = compilePlan(installedCatalog, "2026-08-16T00:00:00.000Z");
      assert(plan.nodes.length > 0, "the installed catalog must load and compile through the real session boundary");

      const contextPath = path.join(target, ".b2c-launch", "BUSINESS_CONTEXT.md");
      const founderContext = "# Scenario context\n\nLocale: es-MX\n";
      writeFileSync(contextPath, founderContext, "utf8");
      writeFileSync(path.join(target, "AGENTS.md"), `${installedAgents}\nFounder-specific project note.\n`, "utf8");
      const refresh = spawnSync(
        tsxBin,
        [
          path.join(skillRoot, "adapters/install-entrypoints.ts"),
          "--target",
          target,
          "--skill-root",
          skillRoot,
          "--apply",
          "--var",
          "APP_NAME=ScenarioFixtureApp",
        ],
        { cwd: skillRoot, encoding: "utf8" },
      );
      assert(refresh.status === 0, `expected entrypoint refresh to succeed: ${refresh.stdout}\n${refresh.stderr}`);
      assert(readFileSync(contextPath, "utf8") === founderContext, "entrypoint refresh must never overwrite founder-owned business context");
      assert(
        existsSync(path.join(target, ".b2c-launch", "preserved-entrypoints", "AGENTS.md")),
        "entrypoint refresh must preserve replaced prompt bytes for recovery",
      );
    },
  );
}
