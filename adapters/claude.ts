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
 * Claude Code headless capability profile (KTD1: `claude -p --bare`; KTD8: capability profile +
 * tool allowlist, not an editor hook). `ANTHROPIC_API_KEY` per the plan's Aug-2026 research.
 *
 * Verified this session (see probe.ts's real pass): `claude --version` and the `-p`/`--max-turns`
 * smoke-test shape given directly in the U6 brief. NOT independently re-verified this session:
 * `--bare`, `--disallowedTools`, `--output-format` exact spelling — treated as the best-effort
 * research-cited flags they are, not silently claimed as confirmed. See CLAUDE_TOOL_ALLOWLIST's
 * enforcementGaps for the one flag this profile deliberately does NOT claim (Bash path-scoping).
 */
export const CLAUDE_CLI = "claude";

const CLAUDE_TOOL_ALLOWLIST: ToolAllowlist = {
  mode: "flag-enforced",
  deniedPathPatterns: [...REDUCER_OWNED_PATH_PATTERNS],
  enforcingFlag: "--disallowedTools",
  enforcementGaps: [
    "--disallowedTools denies the Write and Edit tools outright (any path, not just control/**), so this profile does not need — and does not attempt — path-scoped Write/Edit rules.",
    "Bash is allowed (the fixed prompt's one command must run as Bash). This profile does not claim a Bash-prefix allowlist (e.g. \"Bash(<command>:*)\") restricts it to that one command, because that pattern-matching syntax was not independently re-verified against live Claude Code CLI docs in this session — treat Bash as broad, gated only by the single-command prompt (profile.ts's buildFixedPrompt) and the reducer's per-batch preflight, never by a tool-allowlist flag alone.",
  ],
};

export function createClaudeProfile(): RuntimeCapabilityProfile {
  return {
    runtime: "claude",
    cli: CLAUDE_CLI,
    // Conservative default: a headless Claude session may itself fan out sub-work: keep short of
    // the inline/no-adapter default (4) used by kernel/session/run.ts's own --max-concurrency flag.
    maxConcurrency: 3,
    structuredOutput: { supported: true, flag: "--output-format json" },
    sandboxFlags: [],
    authEnvVar: "ANTHROPIC_API_KEY",
    toolAllowlist: CLAUDE_TOOL_ALLOWLIST,
    buildHeadlessCommand: buildClaudeHeadlessCommand,
  };
}

export function buildClaudeHeadlessCommand(invocation: SessionInvocation): HeadlessCommand {
  const prompt = buildFixedPrompt(invocation);
  const args = ["-p", "--bare", "--disallowedTools", "Write,Edit", "--output-format", "json", "--max-turns", "6", prompt];
  return { runtime: "claude", command: CLAUDE_CLI, args, authEnvVar: "ANTHROPIC_API_KEY", wallClockEnforcedBy: "external-wrapper" };
}

export function probeClaudeAvailability(spawn: SpawnFn = defaultSpawn): AvailabilityProbeResult {
  const result = spawn(CLAUDE_CLI, ["--version"]);
  const classified = classifySpawnResult("claude", result, "available");
  return { runtime: "claude", status: classified.status as AvailabilityProbeResult["status"], detail: classified.detail, version: classified.version };
}

/** Cheapest real invocation, per the U6 brief's own example. Never called from a fixture. */
export function smokeClaudeTest(spawn: SpawnFn = defaultSpawn): SmokeTestResult {
  const result = spawn(CLAUDE_CLI, ["-p", "Reply OK", "--max-turns", "1"]);
  const classified = classifySpawnResult("claude", result, "ok");
  return { runtime: "claude", status: classified.status, detail: classified.detail };
}
