import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { UpstreamObservation } from "../../contracts/contribution/contract.js";

/**
 * Read-only host observation for an upstream executable. It answers three questions and nothing
 * more: which files named `<command>` sit on PATH and in which order, what version each one
 * prints for the manifest's declared probe, and what bytes each one is. It never installs,
 * upgrades, or runs any other command, and it never runs a package manager.
 */
export interface ExecutableCandidate {
  readonly path: string;
  readonly pathOrder: number;
}

export type ProbeExecutables = (command: string) => ExecutableCandidate[];
export type RunVersion = (executable: string, args: string[]) => { stdout: string; stderr: string; status: number | null };
export type HashFile = (executable: string) => string | null;

export interface HostProbeSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly versionPattern: string;
}

export interface HostObserveDependencies {
  readonly now: () => Date;
  readonly probeExecutables: ProbeExecutables;
  readonly runVersion: RunVersion;
  readonly hashFile: HashFile;
}

export type HostObservation = NonNullable<UpstreamObservation["host"]>;

export interface HostObservationResult {
  readonly host: HostObservation;
  readonly unknowns: string[];
}

export const HASH_SIZE_CAP_BYTES = 200 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 10_000;
const REFUSED_ARGUMENTS = /^(install|uninstall|upgrade|update|remove|setup|init)$/iu;

/** Every executable file named `command` on PATH, in PATH order (like `which -a`). */
export function probeExecutablesOnPath(command: string, env: NodeJS.ProcessEnv = process.env): ExecutableCandidate[] {
  const found: ExecutableCandidate[] = [];
  const seen = new Set<string>();
  for (const directory of (env.PATH ?? "").split(path.delimiter)) {
    if (!directory.trim()) continue;
    const candidate = path.join(directory, command);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
    } catch {
      continue;
    }
    found.push({ path: candidate, pathOrder: found.length });
  }
  return found;
}

/** Run exactly the declared version probe with a minimal environment and a hard timeout. */
export function runVersionProbe(executable: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

/** SHA-256 of the executable bytes, or null above the size cap or when unreadable. */
export function hashExecutable(executable: string): string | null {
  try {
    if (statSync(executable).size > HASH_SIZE_CAP_BYTES) return null;
    return createHash("sha256").update(readFileSync(executable)).digest("hex");
  } catch {
    return null;
  }
}

/** Homebrew keg paths are recognized from their location only; brew itself is never run. */
export function detectManager(executablePath: string): string | undefined {
  const normalized = executablePath.split(path.sep).join("/");
  if (normalized.startsWith("/opt/homebrew/") || normalized.includes("/usr/local/Cellar/") || normalized.includes("/Cellar/")) return "homebrew";
  return undefined;
}

export function parseVersion(output: string, versionPattern: string): string | null {
  let pattern: RegExp;
  try {
    pattern = new RegExp(versionPattern, "mu");
  } catch {
    return null;
  }
  const match = pattern.exec(output);
  const version = match?.[1] ?? null;
  return version && version.trim() ? version.trim() : null;
}

/** The probe runs the manifest's declared command only. A path, an option, or a mutating verb is refused. */
export function assertProbeSpec(spec: HostProbeSpec): void {
  if (!spec.command.trim() || /[/\\]/u.test(spec.command) || spec.command.startsWith("-") || /\s/u.test(spec.command)) {
    throw new Error(`upstreams.host_probe_refused: host_probe.command must be a bare executable name, got ${JSON.stringify(spec.command)}.`);
  }
  for (const argument of spec.args) {
    if (REFUSED_ARGUMENTS.test(argument.trim())) throw new Error(`upstreams.host_probe_refused: host_probe.args must not include ${argument}.`);
  }
}

export function observeHost(spec: HostProbeSpec, deps: HostObserveDependencies): HostObservationResult {
  assertProbeSpec(spec);
  const unknowns: string[] = [];
  const observedAt = deps.now().toISOString();
  const candidates = [...deps.probeExecutables(spec.command)].sort((a, b) => a.pathOrder - b.pathOrder);
  const executables: HostObservation["executables"] = candidates.map((candidate) => {
    let version: string | null = null;
    try {
      const run = deps.runVersion(candidate.path, [...spec.args]);
      if (run.status === 0) {
        version = parseVersion(run.stdout, spec.versionPattern) ?? parseVersion(run.stderr, spec.versionPattern);
        if (version === null) unknowns.push(`version output of ${candidate.path} did not match version_pattern`);
      } else {
        unknowns.push(`version probe of ${candidate.path} exited with status ${run.status === null ? "null (signal or timeout)" : run.status}`);
      }
    } catch (error) {
      unknowns.push(`version probe of ${candidate.path} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    let sha256: string | null = null;
    try {
      sha256 = deps.hashFile(candidate.path);
    } catch {
      sha256 = null;
    }
    if (sha256 === null) unknowns.push(`digest of ${candidate.path} was not computed`);
    const manager = detectManager(candidate.path);
    return { path: candidate.path, version, sha256, pathOrder: candidate.pathOrder, ...(manager ? { manager } : {}) };
  });
  if (!executables.length) unknowns.push(`no executable named ${spec.command} found on PATH`);
  return { host: { observedAt, executables, selected: executables[0]?.path ?? null }, unknowns };
}
