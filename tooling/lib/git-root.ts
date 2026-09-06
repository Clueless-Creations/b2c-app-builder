import { spawnSync } from "node:child_process";

/**
 * Resolves the real git repository root, walking upward from `start`. This skill's own
 * files historically lived several directories below the repo root they shipped inside of (the skill
 * directory is not itself a git repository), so any check that reaches for a repo-root
 * file needs the actual toplevel, not an assumed fixed offset from its own script path.
 */
export function findGitRoot(start: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: start, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
