#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { asArray, asString, isRecord, issue, reportAndExit, type Issue } from "../../../tooling/lib/launch-state.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "../../..");
const scenarioDir = path.resolve(scriptDir, "./evals/launchbench");
const issues: Issue[] = [];

const knownValidators = new Set([
  "render-public-api",
  "check-repository-boundary",
  "check-architecture",
  "check-validator-docs",
  "check-design-acceptance",
  "check-product-md",
  "render-hosted-bundle",
  "check-gates-layout",
  "check-learning-grounding",
  "check-graph-foundations",
  "check-pack-composition",
  "check-operating-graph",
  "validate-project-state",
  "check-attribution-contract",
  "check-apple-app-store-requirements",
  "check-store-console-packet",
  "check-aso-evidence",
  "check-app-review-contract",
  "check-store-screenshots",
  "check-native-ios-proof",
  "check-browser-runtime-proof",
  "check-native-android-proof",
  "check-source-checkpoint",
  "check-mobai-proof",
  "check-motion-contract",
  "check-scrollytelling-contract",
  "check-agent-operations",
  "check-agent-entrypoints",
  "check-founder-operator-bootstrap",
  "check-asc-command-contract",
  "check-secret-routing",
  "check-security-release",
  "check-privacy-terms",
  "check-ai-provider-controls",
  "check-repository-profile",
  "check-content-assets",
  "check-paid-user-acquisition",
  "check-parallel-orchestration",
  "check-generated-pages",
  "check-emotional-design",
  "check-onboarding-graph",
  "check-onboarding-foundations",
  "check-onboarding-evidence-packet",
  "check-onboarding-cutover-repository",
  "check-source-freshness",
  "check-provider-contracts",
  "check-capability-delta",
  "check-autopilot-contract",
  "check-continuity-contract",
  "check-skill-version",
  "check-version-discipline",
  "check-engine-e2e",
  "check-package-parity",
  "check-compound-engineering-routing",
  "check-post-launch-ops",
  "check-backend-data-contract",
  "check-lane-coverage",
  "check-landing-funnel",
  "validate-state",
  "render-design-room",
  "check-design-md",
  "check-design-room-contract",
  "check-component-contracts",
  "check-design-worthiness",
  "check-audience-identity",
  "check-readiness-coverage",
  "check-live-provider-proof",
  "check-artifact-templates",
  "check-app-archetype",
  "check-archetype-starter",
  "check-reference-size",
  "check-hub-spoke",
  "check-catalog",
  "check-email",
  "check-analytics-catalog",
  "run-behavioral-evals",
  "run-agent-evals",
  "check-token-promotion",
  "check-vibecoded-tells",
  "check-research-evidence",
  "check-evidence-schema-drift",
  "check-localization-research",
  "check-revenue",
  "check-price-derivation",
  "check-app-copy",
  "check-no-slop",
  "check-technical-docs-ste100",
  "check-change-cascade",
  "check-founder-copy",
  "check-template-safety",
  "check-portfolio-registry",
  "check-roster-overlap",
  "check-roster-headless-safety",
  "check-skill-supply-chain",
  "check-upstreams",
  "render-credits",
]);

/**
 * Tool surfaces a scenario can grade. `local` is the default and the assumption behind every
 * scenario authored before the field existed: shell, workspace, and the `b2c` CLI are present.
 * `knowledge-only` is the hosted MCP — four read-only tools, no filesystem, no commands, and no
 * view of workspace state.
 */
const SCENARIO_SURFACES = new Set(["local", "knowledge-only"]);
const DEFAULT_SCENARIO_SURFACE = "local";

// Flagship scenarios that must stay in the live behavioral subset
// (run-behavioral-evals.ts; opted in with `behavioral: true`).
const requiredBehavioral = new Set([
  "stale-installed-skill-runtime",
  "live-provider-proof-missing",
  "post-launch-ops-runbook-missing",
  "launch-tier-overproduction",
  "monetization-cozy-default-stack-unexamined",
  "browser-capability-skipped",
  "founder-zero-operator-skipped",
  "founder-gate-jargon-without-choice",
  "in-app-simulator-route-mishandled",
]);

if (!existsSync(scenarioDir)) {
  issues.push(issue("error", "launchbench.scenario_dir_missing", `Scenario directory is missing: ${scenarioDir}`));
} else {
  const files = readdirSync(scenarioDir)
    .filter((file) => file.endsWith(".yaml"))
    .sort();
  if (files.length === 0) {
    issues.push(issue("error", "launchbench.no_scenarios", "No LaunchBench scenarios exist."));
  }

  for (const file of files) {
    const fullPath = path.join(scenarioDir, file);
    const parsed = parseYaml(readFileSync(fullPath, "utf8"));
    if (!isRecord(parsed)) {
      issues.push(issue("error", "launchbench.invalid_yaml", `${file} must parse to an object.`, fullPath));
      continue;
    }

    for (const field of ["id", "title", "prompt", "expected_guardrail"]) {
      if (!asString(parsed[field])?.trim()) {
        issues.push(issue("error", `launchbench.${file}.${field}.missing`, `${file} is missing ${field}.`, fullPath));
      }
    }

    const validators = asArray(parsed.validators)
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
    if (validators.length === 0) {
      issues.push(issue("error", `launchbench.${file}.validators.missing`, `${file} must name at least one deterministic validator.`, fullPath));
    }
    for (const validator of validators) {
      if (!knownValidators.has(validator)) {
        issues.push(issue("error", `launchbench.${file}.validator.unknown`, `${validator} is not a known validator.`, fullPath));
      }
    }

    if (parsed.behavioral !== undefined && typeof parsed.behavioral !== "boolean") {
      issues.push(issue("error", `launchbench.${file}.behavioral.invalid`, `${file} behavioral must be true or false when present.`, fullPath));
    }

    /**
     * Which tool surface the graded agent is on. Absent means `local`, which is what every
     * scenario authored before this field assumed: a shell, a workspace, and the `b2c` CLI.
     *
     * The distinction is load-bearing, not bookkeeping. A rubric written for `local` can grade an
     * agent DOWN for reporting that it cannot reach a provider — correct guidance when the CLI is
     * installed, and the opposite of correct on `knowledge-only`, where no command can be run and
     * "not verified from this connection" is the honest answer. ARCH-11 keeps available execution
     * route separate from observed proof; a scenario that does not say which surface it grades
     * silently collapses the two.
     */
    if (parsed.surface !== undefined && !SCENARIO_SURFACES.has(String(parsed.surface))) {
      issues.push(
        issue(
          "error",
          `launchbench.${file}.surface.invalid`,
          `${file} surface must be one of ${[...SCENARIO_SURFACES].join(", ")} when present; omit it for the default (${DEFAULT_SCENARIO_SURFACE}).`,
          fullPath,
        ),
      );
    }
    const scenarioId = asString(parsed.id);
    if (scenarioId && requiredBehavioral.has(scenarioId) && parsed.behavioral !== true) {
      issues.push(
        issue(
          "error",
          `launchbench.${file}.behavioral.flagship_missing`,
          `${file} is a flagship behavioral scenario and must keep behavioral: true so run-behavioral-evals executes it.`,
          fullPath,
        ),
      );
    }

    if (asArray(parsed.must_catch).length === 0) {
      issues.push(issue("error", `launchbench.${file}.must_catch.missing`, `${file} should list the failure facts the agent must catch.`, fullPath));
    }
    if (asArray(parsed.should_say).length === 0) {
      issues.push(
        issue("warning", `launchbench.${file}.should_say.missing`, `${file} should list the high-level response behavior expected from the agent.`, fullPath),
      );
    }
  }
}

// Honest naming: this gate lints scenario definitions (fields + known-validator
// references). `npm run launchbench` then runs the deterministic validator fixtures.
// `npm run launchbench:lint` (`--lint-only`) stops after the YAML lint so sessions and
// the fast CI lane can verify scenario definitions without hundreds of tsx boots.
// Scenario prompts are NOT executed against a live agent here — see
// checks/validation/repository/launchbench-evals.md "Harness Shape".
reportAndExit("LaunchBench scenario definition lint (prompts are not executed against an agent)", issues);

if (issues.some((item) => item.severity === "error")) {
  process.exitCode = 1;
} else if (!process.argv.includes("--lint-only")) {
  const fixtureRunner = path.join(scriptDir, "run-validator-fixtures.ts");
  const tsxBin = resolveTsxBin(skillRoot);
  const result = spawnSync(tsxBin, [fixtureRunner], { cwd: skillRoot, encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}
