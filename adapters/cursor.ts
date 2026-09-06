import {
  REDUCER_OWNED_PATH_PATTERNS,
  buildFixedPrompt,
  classifySpawnResult,
  defaultSpawn,
  type AvailabilityProbeResult,
  type HeadlessCommand,
  type RuntimeCapabilityProfile,
  type SessionInvocation,
  type SmokeTestResult,
  type SpawnFn,
  type ToolAllowlist,
} from "./profile.js";

/**
 * Cursor headless capability profile (KTD1: `cursor agent -p` + `--sandbox enabled`; KTD8, R3 —
 * Cursor has no v1 entrypoint at all; install-entrypoints.ts is what creates one). `CURSOR_API_KEY`
 * per the plan's Aug-2026 research.
 *
 * Cursor's headless CLI is beta ("trusted environments only" per the plan's risk register) and its
 * JSON output mode is undocumented as of Aug 2026 — structuredOutput.supported is deliberately
 * false with a text-parse degrade path, never silently claimed as supported (plan's open question:
 * upgrade this profile once Cursor documents structured output).
 */
export const CURSOR_CLI = "cursor-agent";

const CURSOR_TOOL_ALLOWLIST: ToolAllowlist = {
  mode: "sandbox-coarse",
  deniedPathPatterns: [...REDUCER_OWNED_PATH_PATTERNS],
  enforcementGaps: [
    "cursor agent -p --sandbox enabled gates the whole workspace, not sub-paths — the same coarseness as Codex's sandbox tiers (see codex.ts), for the same underlying reason: the reducer subprocess needs write access to control/** from inside the same sandbox boundary the agent runs in, so a blanket path deny would also break legitimate reducer writes.",
    "Cursor's headless surface is beta (\"trusted environments only\") and its JSON output mode is undocumented as of Aug 2026, so this profile cannot rely on structured tool-call output to detect an attempted denied-path write either — enforcement rests on the fixed single-command prompt (profile.ts's buildFixedPrompt) plus the reducer's per-batch preflight, more heavily here than on any other profile.",
  ],
};

export function createCursorProfile(): RuntimeCapabilityProfile {
  return {
    runtime: "cursor",
    cli: CURSOR_CLI,
    maxConcurrency: 2,
    structuredOutput: { supported: false, degradePath: "text-parse fallback: read the agent's plain-text final message and treat a nonzero exit or an auth/permission-shaped line as failure, per classifySpawnResult's pattern match — never parse it as JSON." },
    sandboxFlags: ["--sandbox", "enabled"],
    authEnvVar: "CURSOR_API_KEY",
    toolAllowlist: CURSOR_TOOL_ALLOWLIST,
    buildHeadlessCommand: buildCursorHeadlessCommand,
  };
}

export function buildCursorHeadlessCommand(invocation: SessionInvocation): HeadlessCommand {
  const prompt = buildFixedPrompt(invocation);
  const args = ["agent", "-p", prompt, "--sandbox", "enabled"];
  return { runtime: "cursor", command: CURSOR_CLI, args, authEnvVar: "CURSOR_API_KEY", wallClockEnforcedBy: "external-wrapper" };
}

export function probeCursorAvailability(spawn: SpawnFn = defaultSpawn): AvailabilityProbeResult {
  const result = spawn(CURSOR_CLI, ["--version"]);
  const classified = classifySpawnResult("cursor", result, "available");
  return { runtime: "cursor", status: classified.status as AvailabilityProbeResult["status"], detail: classified.detail, version: classified.version };
}

/** Cheapest real invocation. Never called from a fixture. */
export function smokeCursorTest(spawn: SpawnFn = defaultSpawn): SmokeTestResult {
  const result = spawn(CURSOR_CLI, ["agent", "-p", "Reply OK", "--sandbox", "enabled"]);
  const classified = classifySpawnResult("cursor", result, "ok");
  return { runtime: "cursor", status: classified.status, detail: classified.detail };
}
