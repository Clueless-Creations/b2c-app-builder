/**
 * Injectable Expo/EAS process runner.
 *
 * Spawns a trusted absolute executable with a typed argument array. It never concatenates a
 * shell string, never installs Expo/EAS, and never inherits ambient Expo tokens or proxy
 * overrides. Fixtures inject a fake runner and never call the default.
 *
 * This is Expo-specific. It does not share a generic CLI framework with RevenueCat.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

export const EXPO_PROCESS_MAX_STDOUT_BYTES = 2 * 1024 * 1024;
export const EXPO_PROCESS_MAX_STDERR_BYTES = 256 * 1024;
export const EXPO_PROCESS_DISCOVERY_TIMEOUT_MS = 10_000;
export const EXPO_PROCESS_READ_TIMEOUT_MS = 30_000;
export const EXPO_PROCESS_MUTATION_TIMEOUT_MS = 60_000;

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
  "EXPO_APPLE_PASSWORD",
  "EXPO_IOS_DIST_P12_PASSWORD",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_PASSWORD",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
]);

export interface ExpoProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly cancelled: boolean;
  readonly signal: NodeJS.Signals | string | null;
  readonly error?: string;
}

export interface ExpoProcessRequest {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
}

export type ExpoProcessRunner = (request: ExpoProcessRequest) => ExpoProcessResult;

export type ExpoProcessRefusalCode = "relative-executable" | "denied-launcher" | "nul-in-argv" | "relative-cwd" | "refused-env" | "cancelled";

export class ExpoProcessRefusal extends Error {
  readonly code: ExpoProcessRefusalCode;
  constructor(code: ExpoProcessRefusalCode, message: string) {
    super(message);
    this.name = "ExpoProcessRefusal";
    this.code = code;
  }
}

export function assertTrustedExpoProcessRequest(request: ExpoProcessRequest): void {
  if (!path.isAbsolute(request.executable)) {
    throw new ExpoProcessRefusal("relative-executable", "Expo/EAS execution requires a trusted absolute executable path.");
  }
  const basename = path.basename(request.executable).toLowerCase();
  if (DENIED_EXECUTABLE_BASENAMES.has(basename) || basename.includes("@latest") || basename.includes("@next")) {
    throw new ExpoProcessRefusal(
      "denied-launcher",
      `Refusing to spawn ${basename} as Expo/EAS CLI. Use a pinned absolute binary, not npx, npm, or an unpinned @latest launcher.`,
    );
  }
  if (!path.isAbsolute(request.cwd)) {
    throw new ExpoProcessRefusal("relative-cwd", "Expo/EAS execution requires an absolute working directory.");
  }
  for (const argument of request.argv) {
    if (argument.includes("\0")) throw new ExpoProcessRefusal("nul-in-argv", "CLI argument arrays must not contain NUL bytes.");
    if (argument.includes("@latest") || argument.includes("eas-cli@") || argument.includes("expo@latest")) {
      throw new ExpoProcessRefusal("denied-launcher", "Refusing unpinned @latest package argv. Documented npx eas-cli@latest is not an installed binary.");
    }
  }
  for (const key of Object.keys(request.env)) {
    if (REFUSED_INHERITED_ENV.has(key)) {
      throw new ExpoProcessRefusal("refused-env", `Child environment must not include ${key}.`);
    }
  }
}

export interface ExpoProcessEnvInput {
  readonly isolatedHome: string;
  readonly pathValue: string;
  readonly expoToken?: string;
  readonly doNotTrack?: boolean;
}

/** Minimal child environment. Ambient operator EXPO_TOKEN and proxy values are not inherited. */
export function buildExpoProcessEnv(input: ExpoProcessEnvInput): Record<string, string> {
  const env: Record<string, string> = {
    PATH: input.pathValue,
    HOME: input.isolatedHome,
    XDG_CONFIG_HOME: path.join(input.isolatedHome, ".config"),
    NO_COLOR: "1",
    CI: "1",
    EXPO_NO_TELEMETRY: "1",
    EAS_NO_VCS: "1",
  };
  if (input.doNotTrack !== false) env.DO_NOT_TRACK = "1";
  if (input.expoToken) env.EXPO_TOKEN = input.expoToken;
  return env;
}

function truncate(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return { text, truncated: false };
  return { text: Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8"), truncated: true };
}

/** Default runner. Fixtures inject a fake and never call this. */
export const defaultExpoProcessRunner: ExpoProcessRunner = (request) => {
  assertTrustedExpoProcessRequest(request);
  if (request.abortSignal?.aborted) {
    return { stdout: "", stderr: "", status: null, timedOut: false, truncated: false, cancelled: true, signal: null, error: "aborted before spawn" };
  }
  const result = spawnSync(request.executable, [...request.argv], {
    cwd: request.cwd,
    env: { ...request.env },
    encoding: "utf8",
    timeout: request.timeoutMs,
    maxBuffer: EXPO_PROCESS_MAX_STDOUT_BYTES + EXPO_PROCESS_MAX_STDERR_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdoutCap = truncate(result.stdout ?? "", EXPO_PROCESS_MAX_STDOUT_BYTES);
  const stderrCap = truncate(result.stderr ?? "", EXPO_PROCESS_MAX_STDERR_BYTES);
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
