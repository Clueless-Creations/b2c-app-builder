#!/usr/bin/env node
/**
 * Entrypoint for the validator fixture suite.
 *
 * The shared harness lives in checks/validation/repository/fixtures/_harness.ts and the fixtures
 * themselves are grouped into domain modules under checks/validation/repository/fixtures/. Modules
 * are registered in sequence so the PASS/FAIL output order is stable.
 *
 * By default the modules run as parallel shard children (tooling/lib/shard-pool.ts): this
 * runner re-spawns itself once per module with --shard <name>, and the parent prints ONE
 * combined report in module registration order, so the output keeps the serial run's shape.
 * Individual fixture executions are never pooled — modules reuse and mutate fixture roots
 * between runs, so the module is the isolation boundary. A shard that dies before printing
 * its result line is reported as a failed row, never as empty-and-passing.
 *
 * Flags:
 *   --shard <name>  Run exactly one module and emit machine-readable results (child mode).
 *   --serial        Run every module in-process, one at a time (the pre-shard behavior).
 *   --keep-temp     Keep the temp fixture root instead of deleting it (prints the path).
 *                   Implies --serial: one process, one temp root worth inspecting.
 */
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, reportResults, skillRoot, type FixtureResult, type Harness } from "./fixtures/_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { emitShardResults, runShards, shardConcurrency } from "../../../tooling/lib/shard-pool.js";
import { register as registerStateAndMeta } from "./fixtures/state-and-meta.fixtures.js";
import { register as registerEvidenceSchema } from "./fixtures/evidence-schema.fixtures.js";
import { register as registerAppkittieAdapter } from "./fixtures/appkittie-adapter.fixtures.js";
import { register as registerProvidersAndSecrets } from "./fixtures/providers-and-secrets.fixtures.js";
import { register as registerStore } from "./fixtures/store.fixtures.js";
import { register as registerDesign } from "./fixtures/design.fixtures.js";
import { register as registerDesignTasteRubric } from "./fixtures/design-taste-rubric.fixtures.js";
import { register as registerDesignTasteGrading } from "./fixtures/design-taste-grading.fixtures.js";
import { register as registerOnboarding } from "./fixtures/onboarding.fixtures.js";
import { register as registerGrowth } from "./fixtures/growth.fixtures.js";
import { register as registerEngineering } from "./fixtures/engineering.fixtures.js";
import { register as registerLifecycle } from "./fixtures/lifecycle.fixtures.js";
import { register as registerProbesAndGrading } from "./fixtures/probes-and-grading.fixtures.js";
import { register as registerRepoGates } from "./fixtures/repo-gates.fixtures.js";
import { register as registerCheckJson } from "./fixtures/check-json.fixtures.js";
import { register as registerCoreArtifacts } from "./fixtures/core-artifacts.fixtures.js";
import { register as registerArchetype } from "./fixtures/archetype.fixtures.js";
import { register as registerBehavioral } from "./fixtures/behavioral.fixtures.js";
import { register as registerAgentOperations } from "./fixtures/agent-operations.fixtures.js";
import { register as registerFounderOperator } from "./fixtures/founder-operator.fixtures.js";
import { register as registerMobai } from "./fixtures/mobai.fixtures.js";
import { register as registerCopy } from "./fixtures/copy.fixtures.js";
import { register as registerLearning } from "./fixtures/learning.fixtures.js";
import { register as registerGraphFoundations } from "./fixtures/graph-foundations.fixtures.js";
import { register as registerPackComposition } from "./fixtures/pack-composition.fixtures.js";
import { register as registerOperatingGraph } from "./fixtures/operating-graph.fixtures.js";
import { register as registerRuntimeSync } from "./fixtures/runtime-sync.fixtures.js";
import { register as registerRepositoryProfile } from "./fixtures/repository-profile.fixtures.js";
import { register as registerProviderContracts } from "./fixtures/provider-contracts.fixtures.js";
import { register as registerSourceAccess } from "./fixtures/source-access.fixtures.js";
import { register as registerRepositoryBoundary } from "./fixtures/repository-boundary.fixtures.js";
import { register as registerArchitecture } from "./fixtures/architecture.fixtures.js";
import { register as registerRoster } from "./fixtures/roster.fixtures.js";
import { register as registerSkillSupplyChain } from "./fixtures/skill-supply-chain.fixtures.js";
import { register as registerContinuityLengthBudget } from "./fixtures/continuity-length-budget.fixtures.js";
import { register as registerUpstreams } from "./fixtures/upstreams.fixtures.js";
import { register as registerAgentEntrypoints } from "./fixtures/agent-entrypoints.fixtures.js";

/** Registration order is report order — the same order the serial loop always used. */
const modules: Array<{ name: string; register: (harness: Harness) => void }> = [
  { name: "state-and-meta", register: registerStateAndMeta },
  { name: "evidence-schema", register: registerEvidenceSchema },
  { name: "appkittie-adapter", register: registerAppkittieAdapter },
  { name: "providers-and-secrets", register: registerProvidersAndSecrets },
  { name: "store", register: registerStore },
  { name: "design", register: registerDesign },
  { name: "design-taste-rubric", register: registerDesignTasteRubric },
  { name: "design-taste-grading", register: registerDesignTasteGrading },
  { name: "onboarding", register: registerOnboarding },
  { name: "growth", register: registerGrowth },
  { name: "engineering", register: registerEngineering },
  { name: "lifecycle", register: registerLifecycle },
  { name: "probes-and-grading", register: registerProbesAndGrading },
  { name: "repo-gates", register: registerRepoGates },
  { name: "check-json", register: registerCheckJson },
  { name: "core-artifacts", register: registerCoreArtifacts },
  { name: "archetype", register: registerArchetype },
  { name: "behavioral", register: registerBehavioral },
  { name: "agent-operations", register: registerAgentOperations },
  { name: "founder-operator", register: registerFounderOperator },
  { name: "mobai", register: registerMobai },
  { name: "copy", register: registerCopy },
  { name: "learning", register: registerLearning },
  { name: "graph-foundations", register: registerGraphFoundations },
  { name: "pack-composition", register: registerPackComposition },
  { name: "operating-graph", register: registerOperatingGraph },
  { name: "runtime-sync", register: registerRuntimeSync },
  { name: "repository-profile", register: registerRepositoryProfile },
  { name: "provider-contracts", register: registerProviderContracts },
  { name: "source-access", register: registerSourceAccess },
  { name: "repository-boundary", register: registerRepositoryBoundary },
  { name: "architecture", register: registerArchitecture },
  { name: "roster", register: registerRoster },
  { name: "skill-supply-chain", register: registerSkillSupplyChain },
  { name: "continuity-length-budget", register: registerContinuityLengthBudget },
  { name: "upstreams", register: registerUpstreams },
  { name: "agent-entrypoints", register: registerAgentEntrypoints },
];

const argv = process.argv.slice(2);
const keepTemp = argv.includes("--keep-temp");
const serial = keepTemp || argv.includes("--serial");
const shardFlagIndex = argv.indexOf("--shard");
const shardName = shardFlagIndex >= 0 ? argv[shardFlagIndex + 1] : undefined;

function runSerially(selected: typeof modules): FixtureResult[] {
  const harness = createHarness();
  try {
    for (const module of selected) {
      module.register(harness);
      harness.cleanupFixtures();
    }
  } finally {
    if (keepTemp) {
      console.log(`Keeping temp fixture root: ${harness.tempRoot}`);
    } else {
      harness.cleanup();
    }
  }
  return harness.results;
}

if (shardName !== undefined) {
  const module = modules.find((candidate) => candidate.name === shardName);
  if (!module) {
    console.error(`Unknown fixture module "${shardName}". Known modules: ${modules.map((candidate) => candidate.name).join(", ")}`);
    process.exit(1);
  }
  // Pass/fail is judged by the parent from the emitted results; a non-zero exit without the
  // marker line is what the parent reports as a crashed shard.
  emitShardResults(runSerially([module]));
} else if (serial) {
  if (reportResults(runSerially(modules)) > 0) {
    process.exitCode = 1;
  }
} else {
  const selfPath = fileURLToPath(import.meta.url);
  const fixturesDir = path.join(path.dirname(selfPath), "fixtures");
  const shardRuns = await runShards(
    modules.map((module) => module.name),
    resolveTsxBin(skillRoot),
    (name) => [selfPath, "--shard", name],
    skillRoot,
    shardConcurrency(),
    // Start order only (report order is fixed): heaviest fixture module first, so a large
    // module registered late does not start when the pool is already draining.
    modules.map((module) => statSync(path.join(fixturesDir, `${module.name}.fixtures.ts`)).size),
  );
  const combined: FixtureResult[] = [];
  for (const run of shardRuns) {
    if (run.results) {
      combined.push(...(run.results as FixtureResult[]));
    } else {
      combined.push({
        label: `${run.name} shard crashed before reporting (exit ${run.code ?? "null"})`,
        ok: false,
        expectedCode: 0,
        actualCode: run.code,
        output: run.output,
      });
    }
  }
  if (reportResults(combined) > 0) {
    process.exitCode = 1;
  }
}
