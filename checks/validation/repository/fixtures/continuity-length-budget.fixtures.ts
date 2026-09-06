import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Harness, writeBusinessEntrypoints } from "./_harness.js";

/**
 * Fixtures for check-continuity-contract.ts's warning-tier entrypoint-length budget
 * (continuity.entrypoint_too_long). The baseline pinned-phrase behavior already has coverage
 * in state-and-meta.fixtures.ts and check-json.fixtures.ts; these cover only the new check.
 */
export function register(h: Harness): void {
  const { makeFixture, runFixture, runFixtureJson } = h;

  const overBudget = makeFixture("continuity-length-over-budget");
  writeBusinessEntrypoints(overBudget);
  const agentsPath = path.join(overBudget, "AGENTS.md");
  const original = readFileSync(agentsPath, "utf8");
  // Pad past the 150-line budget with non-terminal lines — the pinned phrases requireTerms
  // checks stay intact, so only the new length check should fire.
  const padded = `${original}\n${Array.from({ length: 160 }, (_, i) => `Padding line ${i} kept off the pinned-phrase list.`).join("\n")}\n`;
  writeFileSync(agentsPath, padded, "utf8");

  runFixture("an AGENTS.md over the line budget still passes (warning only)", overBudget, "check-continuity-contract.ts", 0);
  runFixtureJson(
    "an AGENTS.md over the line budget reports continuity.entrypoint_too_long without failing",
    overBudget,
    "check-continuity-contract.ts",
    0,
    "continuity.entrypoint_too_long",
  );
  const wrongState = makeFixture("continuity-yaml-state-routing");
  writeBusinessEntrypoints(wrongState);
  const wrongAgents = path.join(wrongState, "AGENTS.md");
  writeFileSync(wrongAgents, `${readFileSync(wrongAgents, "utf8")}\nRead state/runtime.yaml before planning.\n`);
  runFixtureJson("entrypoints refuse YAML runtime state routing", wrongState, "check-continuity-contract.ts", 1, "continuity.internal_detail");
}
