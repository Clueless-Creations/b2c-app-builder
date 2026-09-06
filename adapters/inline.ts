import {
  REDUCER_OWNED_PATH_PATTERNS,
  buildSessionRunArgs,
  type HeadlessCommand,
  type RuntimeCapabilityProfile,
  type SessionInvocation,
  type ToolAllowlist,
} from "./profile.js";

/**
 * The `inline` profile (KTD1, U6 approach): the fixture/test execution shape used by fixture
 * suites and rehearsal dry-runs, not a founder-facing runtime — the three-runtime parity criteria
 * exclude it (plan, U6 Approach paragraph). There is no vendor CLI to shell out to: "headless
 * command construction" for inline is the tsx invocation of kernel/session/run.ts itself, run
 * directly (no wrapping agent, no prompt, nothing to misinterpret).
 *
 * Because inline never spawns a shell or exposes Write/Edit/Bash-equivalent tools to an LLM at
 * all, its tool-allowlist enforcementGaps is genuinely empty — there is no external tool surface
 * for a gap to exist in, not an oversight (see profile.ts's ToolAllowlist doc comment on when an
 * empty enforcementGaps is legitimate).
 */
export const INLINE_CLI = "tsx";

const INLINE_TOOL_ALLOWLIST: ToolAllowlist = {
  mode: "no-external-surface",
  deniedPathPatterns: [...REDUCER_OWNED_PATH_PATTERNS],
  enforcementGaps: [],
};

export function createInlineProfile(): RuntimeCapabilityProfile {
  return {
    runtime: "inline",
    cli: INLINE_CLI,
    // Matches kernel/session/run.ts's own built-in --max-concurrency default so a dry run with no
    // adapter override behaves identically to invoking run.ts directly.
    maxConcurrency: 4,
    structuredOutput: { supported: true },
    sandboxFlags: [],
    toolAllowlist: INLINE_TOOL_ALLOWLIST,
    buildHeadlessCommand: buildInlineHeadlessCommand,
  };
}

export function buildInlineHeadlessCommand(invocation: SessionInvocation): HeadlessCommand {
  return { runtime: "inline", command: INLINE_CLI, args: buildSessionRunArgs(invocation), wallClockEnforcedBy: "not-applicable" };
}
