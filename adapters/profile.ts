import { spawnSync as nodeSpawnSync } from "node:child_process";

/**
 * Shared adapter contract (U6: R3, KTD1, KTD8). Runtime adapters (claude.ts/codex.ts/cursor.ts/
 * inline.ts) each build a `RuntimeCapabilityProfile` from the primitives in this file rather than
 * duplicating command construction — the "duplicated helpers have already diverged" lesson from
 * this repo's own history applies directly to four near-identical CLI wrappers, so the one place
 * that knows how to build the inner `tsx kernel/session/run.ts` invocation lives here, once.
 *
 * Flag-name honesty: every vendor-CLI flag literal in this directory (claude/codex/cursor) is
 * this session's best-effort read of the Aug-2026 vendor research cited in the plan
 * (docs/plans/2026-08-04-001-feat-autonomous-business-runtime-plan.md, KTD1/U6). Only what this
 * session's own real `--version` probe pass (adapters/probe.ts) independently confirmed on
 * this machine is treated as verified — see the probe pass evidence in the U6 completion report.
 * Anything else is named as a documented assumption, never silently claimed as enforcement
 * (mirrors the Live Documentation Gate convention in knowledge/operations/secrets-management.md).
 */

export type RuntimeId = "claude" | "codex" | "cursor" | "inline";

export const runtimeIds: readonly RuntimeId[] = ["claude", "codex", "cursor", "inline"];

/** The three founder-facing runtimes; `inline` is the fixture/dry-run shape, excluded from parity criteria (plan, U6 approach). */
export const founderFacingRuntimeIds: readonly RuntimeId[] = ["claude", "codex", "cursor"];

/**
 * KTD7's "control/grants/waivers/ledger/audit paths" resolved against U5's actual on-disk layout
 * (kernel/session/run.ts's WorkspacePaths): grants and waivers are embedded fields inside
 * control.json, not separate files, so one workspace-relative glob covers control.json,
 * budget-ledger.json, manifest.json, and audit.jsonl together. business-state.json is also
 * reducer-owned (run.ts's own docstring: "the six reducer-owned documents") so it is included
 * too — a session's tool surface should never write any of the reducer's six documents directly,
 * only invoke the reducer's typed-patch interface as a subprocess.
 */
export const REDUCER_OWNED_PATH_PATTERNS: readonly string[] = ["control/**", "state/business-state.json", "state/current-truth.json"];

export interface SessionInvocation {
  readonly workspaceDir: string;
  readonly briefPath: string;
  readonly sessionId: string;
  readonly wallClockSeconds: number;
  readonly maxConcurrency?: number;
  readonly executor?: "auto" | "fixture" | "noop";
  readonly workerRuntime?: "auto" | "claude" | "codex" | "cursor";
}

export type WallClockEnforcement = "external-wrapper" | "not-applicable";

export interface HeadlessCommand {
  readonly runtime: RuntimeId;
  readonly command: string;
  readonly args: readonly string[];
  readonly authEnvVar?: string;
  /** How the wall-clock cap (R2, KTD1) is actually enforced for this command shape — see wrapWithWallClock. */
  readonly wallClockEnforcedBy: WallClockEnforcement;
}

export type ToolAllowlistMode = "flag-enforced" | "sandbox-coarse" | "no-external-surface";

/**
 * The path-denial contract (KTD7) as profile data, never prose. `enforcementGaps` is required and
 * may only be empty when the mode is genuinely airtight (`no-external-surface`) — every CLI-backed
 * profile must name what it cannot express, per the U6 brief: "never silently claim enforcement."
 */
export interface ToolAllowlist {
  readonly mode: ToolAllowlistMode;
  readonly deniedPathPatterns: readonly string[];
  readonly enforcingFlag?: string;
  readonly enforcementGaps: readonly string[];
}

export interface StructuredOutputSupport {
  readonly supported: boolean;
  readonly flag?: string;
  readonly degradePath?: string;
}

export interface RuntimeCapabilityProfile {
  readonly runtime: RuntimeId;
  readonly cli: string;
  readonly maxConcurrency: number;
  readonly structuredOutput: StructuredOutputSupport;
  readonly sandboxFlags: readonly string[];
  readonly authEnvVar?: string;
  readonly toolAllowlist: ToolAllowlist;
  buildHeadlessCommand(invocation: SessionInvocation): HeadlessCommand;
}

// --- shared inner-command construction ------------------------------------------------------

/**
 * The one place that knows kernel/session/run.ts's own flag names (KTD1: brief by file path,
 * session id + workspace as args, wall-clock cap flag included). Every adapter's headless prompt
 * routes through this so the four adapters cannot silently diverge on the inner invocation.
 */
export function buildSessionRunArgs(invocation: SessionInvocation): string[] {
  const args = [
    "kernel/session/run.ts",
    "--workspace",
    invocation.workspaceDir,
    "--brief",
    invocation.briefPath,
    "--session",
    invocation.sessionId,
    "--wall-clock-seconds",
    String(invocation.wallClockSeconds),
  ];
  if (invocation.executor) args.push("--executor", invocation.executor);
  if (invocation.workerRuntime) args.push("--worker-runtime", invocation.workerRuntime);
  if (invocation.maxConcurrency !== undefined) args.push("--max-concurrency", String(invocation.maxConcurrency));
  return args;
}

function shellQuote(token: string): string {
  return /^[A-Za-z0-9_./-]+$/.test(token) ? token : `'${token.replace(/'/g, `'\\''`)}'`;
}

/** The exact shell command line an adapter's prompt tells the agent to run — brief CONTENT never appears, only its path. */
export function sessionRunCommandLine(invocation: SessionInvocation): string {
  return `tsx ${buildSessionRunArgs(invocation).map(shellQuote).join(" ")}`;
}

/**
 * The fixed, single-purpose prompt every non-inline adapter hands its runtime CLI. R4 ("prose
 * never schedules work") holds here: the agent's only instruction is to run one exact command and
 * report its output — it never decides what work to do, because the deterministic engine/reducer
 * pipeline inside run.ts is what makes that decision. Keeping the instruction to exactly one
 * command is also the primary defense noted in each profile's enforcementGaps: an agent with
 * nothing to decide has nothing to be tricked into deciding differently.
 */
export function buildFixedPrompt(invocation: SessionInvocation): string {
  return [
    "You are running one bounded, scheduled business session.",
    "Run exactly this command, wait for it to exit, then report its output verbatim and stop:",
    sessionRunCommandLine(invocation),
    "Do not open, read, or summarize the brief file's contents yourself — the command above reads it.",
    "Do not write, edit, or run any other command; the command above is the entire task.",
  ].join("\n");
}

// --- wall-clock enforcement (R2, R10, KTD1) -------------------------------------------------

/**
 * None of the three vendor CLIs document a native wall-clock-seconds flag (only turn/token
 * ceilings — R10's "runtime CLI's own max-turn/max-token flags" is a *different*, complementary
 * cap this file also relies on per adapter). The backstop is wrapping the whole headless
 * invocation in `timeout` — GNU coreutils, standard on Linux, but NOT POSIX-standard and NOT
 * present on a stock macOS install (BSD userland has no `timeout` at all). Homebrew's coreutils
 * package installs the same binary renamed `gtimeout`, specifically to avoid clobbering any
 * BSD tool. The scheduler installer (install-schedule.ts) is what threads this into the
 * generated wrapper script; this helper is the one place that knows the wrapping shape, shared
 * so the installer and any manual invocation agree.
 */
export type BinaryOnPath = (command: string) => boolean;

/** Real PATH probe (`<command> --version`, ENOENT means absent) — the default for production use; fixtures inject a fake instead. */
export const defaultBinaryOnPath: BinaryOnPath = (command) => {
  const result = nodeSpawnSync(command, ["--version"], { stdio: "ignore" });
  return !(result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT");
};

export interface WallClockWrap {
  readonly command: string;
  readonly args: readonly string[];
  /** True only when the returned command is actually wrapped by a real OS-level timeout binary. */
  readonly osLevelEnforced: boolean;
  /**
   * Set only when a wrapper was called for (wallClockEnforcedBy: "external-wrapper") but neither
   * `timeout` nor `gtimeout` was found on PATH — names the gap so a caller can surface it (e.g.
   * into a scheduled job's own log) instead of silently running unwrapped. Never set for
   * "not-applicable" commands (inline), since no OS-level wrapper was ever expected there.
   */
  readonly enforcementGap?: string;
}

/**
 * Resolves `timeout`, else `gtimeout` (coreutils on macOS), else emits the inner command with NO
 * timeout wrapper at all — a missing optional OS-level backstop must never fail the whole
 * invocation. kernel/session/run.ts's own `--wall-clock-seconds` cooperative cap (checked between
 * dispatch batches) still applies regardless of which of these three shapes this returns; the
 * OS-level wrapper is defense in depth on top of it, never the only cap.
 */
export function wrapWithWallClock(headless: HeadlessCommand, wallClockSeconds: number, binaryOnPath: BinaryOnPath = defaultBinaryOnPath): WallClockWrap {
  if (headless.wallClockEnforcedBy !== "external-wrapper") return { command: headless.command, args: headless.args, osLevelEnforced: false };
  const binary = binaryOnPath("timeout") ? "timeout" : binaryOnPath("gtimeout") ? "gtimeout" : undefined;
  if (!binary) {
    return {
      command: headless.command,
      args: headless.args,
      osLevelEnforced: false,
      enforcementGap: `Neither "timeout" nor "gtimeout" is on PATH, so this session has no OS-level wall-clock cap — only the inner --wall-clock-seconds cooperative cap applies. Install coreutils (e.g. "brew install coreutils" on macOS) to restore the OS-level backstop.`,
    };
  }
  return { command: binary, args: [`${Math.max(1, Math.round(wallClockSeconds))}s`, headless.command, ...headless.args], osLevelEnforced: true };
}

// --- availability + smoke probes (module-level helpers; never invoked by fixtures) ----------

export interface SpawnResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: NodeJS.ErrnoException;
}

export type SpawnFn = (command: string, args: readonly string[]) => SpawnResult;

/** Real process spawn — the default for probe.ts's manual pass; every fixture injects a fake instead. */
export const defaultSpawn: SpawnFn = (command, args) => {
  const result = nodeSpawnSync(command, [...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
};

export type AvailabilityStatus = "available" | "not_found" | "auth_failed" | "error";

export interface AvailabilityProbeResult {
  readonly runtime: RuntimeId;
  readonly status: AvailabilityStatus;
  readonly detail: string;
  readonly version?: string;
}

/**
 * Broadened after this session's own real probe pass (adapters/probe.ts) turned up a real
 * miss: Cursor's actual failure text is "Authentication required. Please run 'agent login' first,
 * or set CURSOR_API_KEY environment variable." — "authentication required" and a bare "login"
 * mention weren't covered by the original narrower pattern. This only ever runs on an already
 * nonzero exit (see classifySpawnResult), so a generic "login"/"api key" mention is safe to treat
 * as auth-shaped rather than a false trigger on a healthy run.
 */
const AUTH_FAILURE_PATTERN =
  /(unauthoriz\w*|not\s+logged\s*in|\blogin\b|invalid\s+api[\s-]?key|api[\s-]?key\s+is\s+missing|\bapi[\s-]?key\b|\b401\b|authentication\s+(required|failed)|please\s+(sign|log)\s*in)/i;

/**
 * Shared classifier for both the `--version` availability probe and the cheapest-real-invocation
 * smoke test: a missing binary is `not_found` (ENOENT), a nonzero exit whose output names an auth
 * problem is `auth_failed` (never a silent no-op — this is the "auth-expiry simulation" fixture
 * scenario), anything else nonzero is a named `error`, and exit 0 is success.
 *
 * `runtime` is a bare label used only to build the `not_found` detail string ("<label> CLI is not
 * on PATH") — widened from `RuntimeId` to `string` so non-runtime spawn-and-classify callers (e.g.
 * kernel/autonomy/probes/doppler.ts's `doppler me` / `doppler run` probe, U9) can reuse this same
 * classification logic rather than re-deriving the ENOENT/auth-pattern rules a second time.
 */
export function classifySpawnResult(
  runtime: string,
  result: SpawnResult,
  successStatus: "available" | "ok",
): { status: AvailabilityStatus | "ok"; detail: string; version?: string } {
  if (result.error) {
    if (result.error.code === "ENOENT") return { status: "not_found", detail: `"${runtime}" CLI is not on PATH.` };
    return { status: "error", detail: result.error.message };
  }
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (result.status === 0) {
    return {
      status: successStatus,
      detail: combined.length > 0 ? combined.split("\n")[0]! : "ok",
      version: successStatus === "available" ? combined.split("\n")[0] : undefined,
    };
  }
  if (AUTH_FAILURE_PATTERN.test(combined)) {
    return { status: "auth_failed", detail: combined.slice(0, 300) || `exit ${String(result.status)} with no output` };
  }
  return { status: "error", detail: `exit ${String(result.status)}: ${combined.slice(0, 300)}` };
}

export interface SmokeTestResult {
  readonly runtime: RuntimeId;
  readonly status: "ok" | AvailabilityStatus;
  readonly detail: string;
}
