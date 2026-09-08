import { resolveTsxCli } from "./tsx-launcher.mjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { describeSpawnFailure, spawnErrorCode, type SpawnOutcome } from "./spawn.js";

/** The bare PATH lookup `resolveTsxBin` falls back to when no local install is present. */
export const TSX_PATH_FALLBACK = "tsx";

/**
 * Preserve local executable precedence for existing subprocess callers, then use Node's package
 * resolution for hoisted installs. A bare PATH fallback remains for legacy host-provided tsx.
 * Public entrypoints use the same dependency resolver and invoke it under process.execPath.
 */
export function resolveTsxBin(skillRoot: string): string {
  const candidates = [path.join(skillRoot, "node_modules/.bin/tsx"), path.resolve(skillRoot, "../..", "node_modules/.bin/tsx")];
  const local = candidates.find((candidate) => existsSync(candidate));
  if (local) return local;
  try {
    return resolveTsxCli(skillRoot);
  } catch {
    return TSX_PATH_FALLBACK;
  }
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
    ? `${described} — no local or package-resolved tsx dependency exists, so the bare "${TSX_PATH_FALLBACK}" on PATH was used and PATH does not provide it either; reinstall b2c-app-builder or run \`npm ci\` in a source checkout`
    : described;
}
