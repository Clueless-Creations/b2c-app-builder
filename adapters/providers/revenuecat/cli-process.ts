import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Injectable RevenueCat CLI process adapter. Spawns a trusted absolute executable with a
 * typed argument array. It never concatenates a shell string, never installs, and never
 * inherits ambient RC_* / proxy overrides unless a reviewed caller opts in by constructing
 * the child environment through `buildCliProcessEnv`.
 */

export const CLI_PROCESS_MAX_STDOUT_BYTES = 2 * 1024 * 1024;
export const CLI_PROCESS_MAX_STDERR_BYTES = 256 * 1024;
export const CLI_PROCESS_DISCOVERY_TIMEOUT_MS = 10_000;
export const CLI_PROCESS_READ_TIMEOUT_MS = 30_000;
export const CLI_PROCESS_MUTATION_TIMEOUT_MS = 60_000;

const DENIED_EXECUTABLE_BASENAMES = new Set([
  "npx",
  "npm",
  "yarn",
  "pnpm",
  "bun",
  "node",
  "sh",
  "bash",
  "zsh",
  "dash",
  "cmd",
  "cmd.exe",
  "powershell",
  "pwsh",
]);

const REFUSED_INHERITED_ENV = new Set([
  "RC_API_KEY",
  "RC_BASE_URL",
  "RC_HEADERS",
  "RC_PROFILE",
  "RC_PROJECT_ID",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "REVENUECAT_SECRET_API_KEY",
]);

export interface CliProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly cancelled: boolean;
  readonly signal: NodeJS.Signals | string | null;
  readonly error?: string;
}

export interface CliProcessRequest {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
}

export type CliProcessRunner = (request: CliProcessRequest) => CliProcessResult;

export type CliProcessRefusalCode =
  | "relative-executable"
  | "denied-launcher"
  | "nul-in-argv"
  | "relative-cwd"
  | "refused-env"
  | "cancelled";

export class CliProcessRefusal extends Error {
  readonly code: CliProcessRefusalCode;
  constructor(code: CliProcessRefusalCode, message: string) {
    super(message);
    this.name = "CliProcessRefusal";
    this.code = code;
  }
}

export function assertTrustedCliProcessRequest(request: CliProcessRequest): void {
  if (!path.isAbsolute(request.executable)) {
    throw new CliProcessRefusal("relative-executable", "RevenueCat CLI execution requires a trusted absolute executable path.");
  }
  const basename = path.basename(request.executable).toLowerCase();
  if (DENIED_EXECUTABLE_BASENAMES.has(basename)) {
    throw new CliProcessRefusal(
      "denied-launcher",
      `Refusing to spawn ${basename} as the RevenueCat CLI. Use a pinned absolute binary, not an unpinned package launcher.`,
    );
  }
  if (!path.isAbsolute(request.cwd)) {
    throw new CliProcessRefusal("relative-cwd", "RevenueCat CLI execution requires an absolute working directory.");
  }
  for (const argument of request.argv) {
    if (argument.includes("\0")) throw new CliProcessRefusal("nul-in-argv", "CLI argument arrays must not contain NUL bytes.");
  }
  for (const key of Object.keys(request.env)) {
    if (REFUSED_INHERITED_ENV.has(key) && key !== "RC_API_KEY" && key !== "RC_PROJECT_ID" && key !== "RC_PROFILE") {
      throw new CliProcessRefusal("refused-env", `Child environment must not include ${key}.`);
    }
  }
  if ("RC_BASE_URL" in request.env || "RC_HEADERS" in request.env) {
    throw new CliProcessRefusal("refused-env", "RC_BASE_URL and RC_HEADERS are not permitted in the child environment.");
  }
}

export interface CliProcessEnvInput {
  readonly isolatedHome: string;
  readonly pathValue: string;
  readonly apiKey?: string;
  readonly projectId?: string;
  readonly profile?: string;
  readonly doNotTrack?: boolean;
}

/** Minimal child environment. Ambient operator RC_* and proxy values are not inherited. */
export function buildCliProcessEnv(input: CliProcessEnvInput): Record<string, string> {
  const env: Record<string, string> = {
    PATH: input.pathValue,
    HOME: input.isolatedHome,
    XDG_CONFIG_HOME: path.join(input.isolatedHome, ".config"),
    NO_COLOR: "1",
  };
  if (input.doNotTrack !== false) env.DO_NOT_TRACK = "1";
  if (input.apiKey) env.RC_API_KEY = input.apiKey;
  if (input.projectId) env.RC_PROJECT_ID = input.projectId;
  if (input.profile) env.RC_PROFILE = input.profile;
  return env;
}

function truncate(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return { text, truncated: false };
  return { text: Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8"), truncated: true };
}

/** Default runner. Fixtures inject a fake and never call this. */
export const defaultCliProcessRunner: CliProcessRunner = (request) => {
  assertTrustedCliProcessRequest(request);
  if (request.abortSignal?.aborted) {
    return { stdout: "", stderr: "", status: null, timedOut: false, truncated: false, cancelled: true, signal: null, error: "aborted before spawn" };
  }
  const result = spawnSync(request.executable, [...request.argv], {
    cwd: request.cwd,
    env: { ...request.env },
    encoding: "utf8",
    timeout: request.timeoutMs,
    maxBuffer: CLI_PROCESS_MAX_STDOUT_BYTES + CLI_PROCESS_MAX_STDERR_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdoutCap = truncate(result.stdout ?? "", CLI_PROCESS_MAX_STDOUT_BYTES);
  const stderrCap = truncate(result.stderr ?? "", CLI_PROCESS_MAX_STDERR_BYTES);
  const errorCode = typeof result.error === "object" && result.error && "code" in result.error ? String((result.error as NodeJS.ErrnoException).code) : "";
  const timedOut = errorCode === "ETIMEDOUT" || result.signal === "SIGTERM" || result.signal === "SIGKILL";
  const truncated = stdoutCap.truncated || stderrCap.truncated || errorCode === "ENOBUFS";
  return {
    stdout: stdoutCap.text,
    stderr: stderrCap.text,
    status: result.status,
    timedOut,
    truncated,
    cancelled: false,
    signal: result.signal,
    ...(result.error && errorCode !== "ETIMEDOUT" ? { error: result.error.message } : {}),
  };
};

export function redactCliArgv(argv: readonly string[]): string[] {
  const redacted: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]!;
    const flag = current.split("=")[0] ?? current;
    if (flag === "--api-key" || flag === "--password" || flag === "--apple-password" || flag === "--header") {
      redacted.push(current.includes("=") ? `${flag}=<redacted>` : current);
      if (!current.includes("=") && argv[index + 1] !== undefined) {
        redacted.push("<redacted>");
        index += 1;
      }
      continue;
    }
    redacted.push(current);
  }
  return redacted;
}
