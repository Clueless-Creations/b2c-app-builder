import path from "node:path";
import { spawnSync } from "node:child_process";
import { describeTsxSpawnFailure, resolveRuntimeCommand } from "../../tooling/lib/tsx-bin.js";
import { resolveSkillRoot } from "../../tooling/lib/skill-root.js";

/** Package root — shared by every kernel/session CLI, from source or `dist/`. */
export function skillRoot(): string {
  return resolveSkillRoot(import.meta.url);
}

export interface ReducerResult {
  readonly code: number;
  readonly output: string;
}

/**
 * Sessions never reach around the reducer (KTD7): every write to a reducer-owned document
 * (business-state/control/grants/waivers/budget-ledger) goes through kernel/reducer/cli.ts as a
 * subprocess, never a direct write. Shared by kernel/session/run.ts and kernel/session/onboard.ts.
 */
export function runReducer(args: string[], input?: string): ReducerResult {
  const cliPath = path.join(skillRoot(), "kernel/reducer/cli.ts");
  const command = resolveRuntimeCommand(skillRoot(), [cliPath, ...args]);
  const result = spawnSync(command.executable, command.args, { cwd: skillRoot(), encoding: "utf8", input });
  // A child that never launched has empty stdout/stderr and a null status, so `code: -1` with the
  // two streams alone reports `exited -1:` and nothing else. Append the launch/signal cause last:
  // callers that truncate (bootstrap.ts reports `.slice(-400)`) keep the tail.
  const failure = describeTsxSpawnFailure(command.executable, result);
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}${failure ? `\n${failure}` : ""}` };
}
