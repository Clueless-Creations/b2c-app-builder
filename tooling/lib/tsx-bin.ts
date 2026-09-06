import { existsSync } from "node:fs";
import path from "node:path";
import { describeSpawnFailure, spawnErrorCode, type SpawnOutcome } from "./spawn.js";

/** The bare PATH lookup `resolveTsxBin` falls back to when no local install is present. */
export const TSX_PATH_FALLBACK = "tsx";

/**
 * One shared `resolveTsxBin`, previously duplicated verbatim across 11 files spanning kernel/,
 * verification/, validation/, and tooling/ (each closing over its own locally computed
 * `skillRoot`). Every copy resolved the same two candidates in the same order before falling
 * back to the bare "tsx" on PATH: `<skillRoot>/node_modules/.bin/tsx`, then the repo root's
 * `node_modules/.bin/tsx` two levels above skillRoot (this skill package is nested two
 * directories under the monorepo root, so that is the workspace-hoisted install location).
 *
 * Takes `skillRoot` as a parameter — matching script-paths.ts's `resolveScriptPath` — rather than
 * closing over a module-level constant, so one implementation serves every caller regardless of
 * how that caller computes its own skillRoot (a const derived from `import.meta.url`, or a
 * function like kernel/session/reducer-cli.ts's `skillRoot()`).
 *
 * KNOWN GAP (diagnosed, deliberately not changed here): the two candidates are a fixed-depth
 * approximation of the upward search node itself performs, and they miss a `.claude/worktrees/<name>`
 * checkout that has not had its own `npm ci`. There `../..` resolves to `<repo>/.claude`, which never
 * holds an install, while the real one sits three levels up at `<repo>/node_modules`. Node's own
 * resolution walks up without a depth limit and finds it, so `node --import tsx` succeeds and the
 * tree looks installed while this function silently returns the PATH fallback. Widening this to a
 * true upward walk would change which binary every one of the ~15 call sites runs, so it belongs in
 * its own change rather than riding along with a diagnostics fix.
 *
 * The PATH fallback stays a fallback rather than a throw. Most callers bind the result at module
 * scope (`const tsxBin = resolveTsxBin(skillRoot)`), so throwing here would turn a diagnosable
 * subprocess failure into an import-time crash far from the operation that needed the binary, and
 * it would refuse environments where `tsx` genuinely is on PATH (a global or npx-provided install)
 * even though the spawn would have succeeded. Instead the fallback is made self-describing at the
 * point it actually fails: `describeTsxSpawnFailure` names the missing local install.
 */
export function resolveTsxBin(skillRoot: string): string {
  const candidates = [path.join(skillRoot, "node_modules/.bin/tsx"), path.resolve(skillRoot, "../..", "node_modules/.bin/tsx")];
  return candidates.find((candidate) => existsSync(candidate)) ?? TSX_PATH_FALLBACK;
}

/**
 * Whether the binary `resolveTsxBin` returned can actually be launched.
 *
 * An absolute result is already known to exist — resolveTsxBin only returns one after an
 * `existsSync` — so the interesting case is the bare `TSX_PATH_FALLBACK`, which names a PATH
 * lookup rather than a file. Testing `existsSync("tsx")` asks the wrong question, and writing that
 * test as `path.isAbsolute(bin) ? existsSync(bin) : true` makes the whole condition constantly
 * true, which is how kernel/session/doctor.ts came to report a broken install as healthy. Probe
 * PATH the way the OS would instead.
 */
export function tsxBinResolves(binary: string): boolean {
  if (path.isAbsolute(binary)) return existsSync(binary);
  return (process.env.PATH ?? "").split(path.delimiter).some((dir) => dir !== "" && existsSync(path.join(dir, binary)));
}

/**
 * `describeSpawnFailure` plus the one thing generic spawn reporting cannot know: that an ENOENT on
 * the bare fallback binary means `resolveTsxBin` found no local install and PATH did not supply one
 * either — the actionable cause behind an otherwise unexplained failure to launch.
 */
export function describeTsxSpawnFailure(binary: string, result: SpawnOutcome): string {
  const described = describeSpawnFailure(binary, result);
  if (!described) return "";
  const missingLocalInstall = binary === TSX_PATH_FALLBACK && spawnErrorCode(result) === "ENOENT";
  return missingLocalInstall
    ? `${described} — no local node_modules/.bin/tsx exists in this checkout, so the bare "${TSX_PATH_FALLBACK}" on PATH was used and PATH does not provide it either; run \`npm ci\` here`
    : described;
}
