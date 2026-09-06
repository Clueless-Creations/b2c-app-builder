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
 * Codex headless capability profile (KTD1: `codex exec` + sandbox tier; KTD8). `CODEX_API_KEY`
 * per the plan's Aug-2026 research. See CODEX_TOOL_ALLOWLIST's enforcementGaps: codex's sandbox
 * tiers gate the whole workspace, not sub-paths, which is a materially different (coarser) shape
 * than Claude's tool-level allow/deny — named here rather than glossed over.
 */
export const CODEX_CLI = "codex";

const CODEX_TOOL_ALLOWLIST: ToolAllowlist = {
  mode: "sandbox-coarse",
  deniedPathPatterns: [...REDUCER_OWNED_PATH_PATTERNS],
  enforcementGaps: [
    "codex exec's sandbox tiers (read-only / workspace-write / danger-full-access) gate the whole workspace, not sub-paths — there is no documented per-path deny list, so control/** cannot be marked read-only while state/run/digests/ stay writable within the same sandboxed process tree.",
    "workspace-write is required (the session runner's own reducer subprocess must write state/run/digests/), so the sandbox tier alone cannot distinguish a legitimate reducer write from an ad hoc write to control/** by the agent — that distinction is enforced by keeping the agent's prompt to exactly one fixed command (profile.ts's buildFixedPrompt) plus the reducer's per-batch preflight as the detection backstop, never by the sandbox tier.",
    "OS file permissions as a second layer (KTD7) do not help here either: chmod-ing control/** read-only would also block the reducer's own legitimate writes, since both run inside the same sandbox boundary.",
  ],
};

export function createCodexProfile(): RuntimeCapabilityProfile {
  return {
    runtime: "codex",
    cli: CODEX_CLI,
    maxConcurrency: 3,
    // codex exec's JSON event stream is the closest analogue to Claude's --output-format json;
    // not independently re-verified this session (see profile.ts's header note).
    structuredOutput: { supported: true, flag: "--json" },
    sandboxFlags: ["--sandbox", "workspace-write"],
    authEnvVar: "CODEX_API_KEY",
    toolAllowlist: CODEX_TOOL_ALLOWLIST,
    buildHeadlessCommand: buildCodexHeadlessCommand,
  };
}

export function buildCodexHeadlessCommand(invocation: SessionInvocation): HeadlessCommand {
  const prompt = buildFixedPrompt(invocation);
  const args = ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", prompt];
  return { runtime: "codex", command: CODEX_CLI, args, authEnvVar: "CODEX_API_KEY", wallClockEnforcedBy: "external-wrapper" };
}

export function probeCodexAvailability(spawn: SpawnFn = defaultSpawn): AvailabilityProbeResult {
  const result = spawn(CODEX_CLI, ["--version"]);
  const classified = classifySpawnResult("codex", result, "available");
  return { runtime: "codex", status: classified.status as AvailabilityProbeResult["status"], detail: classified.detail, version: classified.version };
}

/** Cheapest real invocation: a single-turn exec with a trivial prompt. Never called from a fixture. */
export function smokeCodexTest(spawn: SpawnFn = defaultSpawn): SmokeTestResult {
  const result = spawn(CODEX_CLI, ["exec", "--sandbox", "read-only", "Reply OK"]);
  const classified = classifySpawnResult("codex", result, "ok");
  return { runtime: "codex", status: classified.status, detail: classified.detail };
}
