#!/usr/bin/env node
import { probeClaudeAvailability, smokeClaudeTest } from "./claude.js";
import { probeCodexAvailability, smokeCodexTest } from "./codex.js";
import { probeCursorAvailability, smokeCursorTest } from "./cursor.js";
import type { AvailabilityProbeResult, RuntimeId, SmokeTestResult } from "./profile.js";

/**
 * The ONE real probe pass (U6 brief): invokes the actual vendor CLIs on this machine with
 * `--version`, and optionally the cheapest real smoke invocation. Never run from a fixture — every
 * fixture in checks/verification/fixtures/adapters.fixtures.ts injects a fake spawn function instead.
 * This script is a maintainer tool: run it once by hand, read the output, done.
 *
 * Usage:
 *   tsx adapters/probe.ts                    version probe every runtime
 *   tsx adapters/probe.ts --smoke claude      also run the cheapest real claude invocation
 *   tsx adapters/probe.ts --smoke all         also run the cheapest real invocation for all three
 */

const args = process.argv.slice(2);
const smokeIndex = args.indexOf("--smoke");
const smokeTarget = smokeIndex >= 0 ? args[smokeIndex + 1] : undefined;
const smokeRuntimes = new Set<RuntimeId>(smokeTarget === "all" ? ["claude", "codex", "cursor"] : smokeTarget ? [smokeTarget as RuntimeId] : []);

function printAvailability(result: AvailabilityProbeResult): void {
  console.log(
    `[${result.runtime}] --version -> ${result.status}${result.version ? ` (${result.version})` : ""}${result.status !== "available" ? `: ${result.detail}` : ""}`,
  );
}

function printSmoke(result: SmokeTestResult): void {
  console.log(`[${result.runtime}] smoke -> ${result.status}: ${result.detail}`);
}

console.log("adapters/probe.ts: real probe pass (no fixture ever calls this)");
console.log("");

printAvailability(probeClaudeAvailability());
printAvailability(probeCodexAvailability());
printAvailability(probeCursorAvailability());

if (smokeRuntimes.has("claude")) printSmoke(smokeClaudeTest());
if (smokeRuntimes.has("codex")) printSmoke(smokeCodexTest());
if (smokeRuntimes.has("cursor")) printSmoke(smokeCursorTest());

if (smokeRuntimes.size === 0) {
  console.log("");
  console.log("(no --smoke <runtime|all> given: version probes only)");
}
