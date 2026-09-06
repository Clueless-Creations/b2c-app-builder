import { spawn } from "node:child_process";
import { cpus } from "node:os";

/**
 * shard-pool.ts — run a fixture runner's own modules as parallel child processes.
 *
 * Shared by checks/validation/repository/run-validator-fixtures.ts (18 domain modules) and
 * checks/verification/fixtures/run.ts (auto-discovered suites). Both runners execute hundreds of
 * one-at-a-time spawnSync tsx children, and ~0.35s of per-process boot — not validator work —
 * made them the audit's whole critical path (launchbench ~249s, test:fixtures ~77s of a ~360s
 * audit). Individual fixture executions can NOT be pooled: modules reuse and mutate fixture
 * roots between runs, so the module/suite is the isolation boundary. Each shard is therefore
 * the runner re-spawning itself for exactly one module; inside a shard nothing changes.
 *
 * The result contract is the load-bearing part. A shard prints its results as JSON on a single
 * marker line (SHARD_RESULT_MARKER); the parent parses that line and reports every result in
 * registration order, so the combined report keeps the exact shape of the serial run. A shard
 * that dies without printing the marker MUST surface as a failure in the combined report —
 * anything else is a silent audit-pass-on-failure — which is why parseShardOutput returns
 * `results: undefined` (distinct from an empty array) for the caller to convert into a FAIL row.
 */

export const SHARD_RESULT_MARKER = "B2C_SHARD_RESULTS_V1:";

export interface ShardRun {
  name: string;
  code: number | null;
  /** Combined stdout+stderr with the marker line removed — diagnostics for crash reports. */
  output: string;
  /** Parsed marker payload; undefined means the shard crashed before reporting. */
  results: unknown[] | undefined;
}

/**
 * Pool width for shard children. Both callers run as `serial: true` audit steps (the audit's
 * own 4-wide pool is idle while they run), and every shard keeps at most one grandchild
 * validator alive at a time, so cores-minus-two saturates the machine without thrashing it.
 * B2C_FIXTURE_CONCURRENCY overrides; 1 is the no-code-change kill switch back to one-at-a-time.
 */
export function shardConcurrency(): number {
  const override = Number(process.env.B2C_FIXTURE_CONCURRENCY ?? "");
  if (Number.isFinite(override) && override >= 1) {
    return Math.floor(override);
  }
  return Math.max(1, Math.min(cpus().length - 2, 8));
}

/** Child side of the contract: print the marker line the parent parses. */
export function emitShardResults(results: unknown[]): void {
  process.stdout.write(`${SHARD_RESULT_MARKER}${JSON.stringify(results)}\n`);
}

/**
 * Parent side of the contract. Scans the child's combined output for the marker line and
 * returns the parsed results plus the output with the marker removed. Missing marker or
 * malformed JSON both return `results: undefined` — the caller must report that shard as
 * failed, never as empty-and-passing.
 */
export function parseShardOutput(raw: string): { results: unknown[] | undefined; output: string } {
  const lines = raw.split("\n");
  const markerIndex = lines.findIndex((line) => line.startsWith(SHARD_RESULT_MARKER));
  if (markerIndex < 0) {
    return { results: undefined, output: raw };
  }
  const output = [...lines.slice(0, markerIndex), ...lines.slice(markerIndex + 1)].join("\n");
  try {
    const parsed: unknown = JSON.parse(lines[markerIndex]!.slice(SHARD_RESULT_MARKER.length));
    return { results: Array.isArray(parsed) ? parsed : undefined, output };
  } catch {
    return { results: undefined, output };
  }
}

/**
 * Run one shard child per name through a fixed-width pool, preserving `names` order in the
 * returned array regardless of completion or start order (the caller prints one combined
 * report in registration order — the audit's determinism contract).
 *
 * `weights` (optional, parallel to `names`) sets the START order: heaviest first. Without it,
 * a large module late in registration order starts when the pool is already draining and
 * extends the tail all by itself. Callers pass the module file's byte size — a self-maintaining
 * stand-in for run count that needs no hand-kept duration table. Report order never changes.
 */
export async function runShards(
  names: string[],
  command: string,
  argsFor: (name: string) => string[],
  cwd: string,
  concurrency: number,
  weights?: number[],
): Promise<ShardRun[]> {
  const runs = new Array<ShardRun>(names.length);
  const startOrder = [...names.keys()].sort((left, right) => (weights?.[right] ?? 0) - (weights?.[left] ?? 0));
  let nextSlot = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, names.length)) }, async () => {
    while (nextSlot < startOrder.length) {
      const index = startOrder[nextSlot]!;
      nextSlot += 1;
      const name = names[index]!;
      runs[index] = await runShard(name, command, argsFor(name), cwd);
    }
  });
  await Promise.all(workers);
  return runs;
}

function runShard(name: string, command: string, args: string[], cwd: string): Promise<ShardRun> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: process.env });
    const chunks: string[] = [];
    child.stdout.on("data", (data: Buffer) => chunks.push(data.toString("utf8")));
    child.stderr.on("data", (data: Buffer) => chunks.push(data.toString("utf8")));
    child.on("error", (error) => {
      chunks.push(`${error.message}\n`);
      resolve({ name, code: 1, ...parseShardOutput(chunks.join("")) });
    });
    child.on("close", (code) => {
      resolve({ name, code, ...parseShardOutput(chunks.join("")) });
    });
  });
}
