import { spawn } from "node:child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  status: number | null;
  timedOut: boolean;
  error?: string;
}

/** Own the complete POSIX process group, including children that close their pipes. */
export function runProcess(command: string, args: string[], options: { cwd: string; timeoutMs: number; graceMs?: number }): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let finished = false;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: number | null, error?: string): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (escalation) clearTimeout(escalation);
      resolve({ stdout, stderr, status, timedOut, ...(error ? { error } : {}) });
    };
    const signal = (name: NodeJS.Signals): void => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(name);
        else process.kill(-child.pid, name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") stderr += `\nProcess cleanup failed: ${(error as Error).message}`;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      // Do not cancel escalation when the direct child exits: a descendant may
      // ignore SIGTERM or have detached its stdout and stderr from this request.
      escalation = setTimeout(() => {
        signal("SIGKILL");
        child.stdout.destroy();
        child.stderr.destroy();
        finish(null);
      }, options.graceMs ?? 1_000);
    }, options.timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (data: string) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data: string) => {
      stderr += data;
    });
    child.on("error", (error) => finish(null, error.message));
    child.on("close", (status) => {
      if (!timedOut) finish(status);
    });
  });
}
