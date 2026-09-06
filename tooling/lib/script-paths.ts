/**
 * script-paths.ts — one source of truth for where a spawnable script lives.
 *
 * docs/architecture.md splits the skill's executables three ways: `checks/validation/business/` proves a
 * business launch, `checks/validation/repository/` proves the skill itself, and `tooling/` keeps the
 * renderers, runners, probes, seeds and shared lib. So no caller can spawn a
 * script by concatenating a directory onto a basename any more.
 *
 * Guessing wrong is worse than crashing. A validator fixture that asserts only
 * "exit code 1" PASSES when the path is wrong, because a missing file also
 * exits non-zero — ~700 assertions could go green while testing nothing. That
 * is why resolution is a lookup that THROWS on a miss, never a string
 * concatenation, and why an ambiguous basename is an error rather than a
 * first-match-wins.
 *
 * Paths come back POSIX-style (forward slashes) on every platform. They are
 * spawned as argv, embedded in package.json command strings, and compared
 * against markdown — all of which are forward-slash everywhere. Returning
 * path.join output here would be green on macOS and broken on Windows.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Directories holding spawnable scripts, in the order a tie would be reported.
 * `tooling/lib` and `checks/validation/repository/fixtures` are deliberately excluded: they are
 * imported, never spawned, and indexing them would let a module basename mask
 * a real collision between two runnable scripts.
 */
export const SCRIPT_ROOTS = ["checks/validation/business", "checks/validation/repository", "tooling"] as const;

const NOT_SPAWNABLE = new Set(["lib", "fixtures", "node_modules", "dist"]);

/**
 * Memoised per skill root. The validator fixture suite resolves ~700 times in
 * one process, and every caller in this repo reads a tree that is fixed for the
 * lifetime of the process — fixtures create temporary *business* roots, never
 * new scripts. Call `clearScriptIndexCache()` if that ever stops being true.
 */
const indexCache = new Map<string, Map<string, string>>();

export function clearScriptIndexCache(): void {
  indexCache.clear();
}

/** basename without `.ts` → POSIX path relative to the skill root. */
export function indexScripts(skillRoot: string): Map<string, string> {
  const cacheKey = path.resolve(skillRoot);
  const cached = indexCache.get(cacheKey);
  if (cached) return cached;

  const index = new Map<string, string>();
  const duplicates: string[] = [];

  for (const root of SCRIPT_ROOTS) {
    const absoluteRoot = path.join(skillRoot, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const absolute of walk(absoluteRoot)) {
      const basename = path.basename(absolute, ".ts");
      const relative = toPosix(path.relative(skillRoot, absolute));
      const existing = index.get(basename);
      if (existing && existing !== relative) {
        duplicates.push(`${basename}: ${existing} and ${relative}`);
        continue;
      }
      index.set(basename, relative);
    }
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Ambiguous script basenames across ${SCRIPT_ROOTS.join("/, ")}/: ${duplicates.join("; ")}. ` +
        "Two spawnable scripts may not share a basename — callers address them by basename alone.",
    );
  }
  indexCache.set(cacheKey, index);
  return index;
}

/** Non-throwing lookup, for callers that need to report a miss as a finding. */
export function findScriptPath(skillRoot: string, basename: string): string | undefined {
  return indexScripts(skillRoot).get(stripExtension(basename));
}

/**
 * Throwing lookup, for callers that are about to spawn. The throw is the point:
 * a silently wrong path becomes a passing test.
 */
export function resolveScriptPath(skillRoot: string, basename: string): string {
  const key = stripExtension(basename);
  const found = indexScripts(skillRoot).get(key);
  if (!found) {
    throw new Error(
      `No script named ${key}.ts under ${SCRIPT_ROOTS.map((root) => `${root}/`).join(", ")} in ${skillRoot}. ` +
        "A wrong path would make an exit-code assertion pass by crashing, so this is fatal rather than a fallback.",
    );
  }
  return found;
}

/**
 * Extract a script basename from an npm command string such as
 * `tsx checks/validation/business/store/check-store-console-packet.ts --root .`. Matches any depth under any
 * of the three roots, so a domain subfolder does not hide a script from the
 * package-parity cross-checks the way a `tooling/`-only pattern would.
 */
export function scriptBasenameFromCommand(command: string): string | undefined {
  const match = command.match(new RegExp(`(?:^|[\\s"'])(?:${SCRIPT_ROOTS.join("|")})/(?:[a-z0-9-]+/)*([a-z0-9-]+)\\.ts`));
  return match?.[1];
}

function walk(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (NOT_SPAWNABLE.has(entry.name)) continue;
      out.push(...walk(path.join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(path.join(directory, entry.name));
    }
  }
  return out;
}

function stripExtension(name: string): string {
  return name.endsWith(".ts") ? name.slice(0, -3) : name;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
