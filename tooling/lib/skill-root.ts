import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Package root from any compiled or source module. Walking up finds `skill-version.json`
 * whether the caller lives at `kernel/session/doctor.ts` or `dist/kernel/session/doctor.js`.
 * Do not read `B2C_APP_BUILDER_SKILL_ROOT` here: that env binds an installed *business*
 * runtime, not this package.
 */
export function resolveSkillRoot(fromMetaUrl: string): string {
  let dir = path.dirname(fileURLToPath(fromMetaUrl));
  for (let depth = 0; depth < 16; depth += 1) {
    if (existsSync(path.join(dir, "skill-version.json")) && existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fallback = path.resolve(path.dirname(fileURLToPath(fromMetaUrl)), "..", "..");
  return path.basename(fallback) === "dist" ? path.dirname(fallback) : fallback;
}

/** A file that lives at the package root, not next to a compiled `dist/` module. */
export function packageFile(fromMetaUrl: string, relativePath: string): string {
  return path.join(resolveSkillRoot(fromMetaUrl), relativePath);
}

/** Packed installs launch these without tsx. A checkout may have neither until `npm run build`. */
export function compiledRuntimePresent(skillRoot: string): boolean {
  return (
    existsSync(path.join(skillRoot, "dist", "entrypoints", "mcp", "server.js")) && existsSync(path.join(skillRoot, "dist", "kernel", "session", "doctor.js"))
  );
}
