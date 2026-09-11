import path from "node:path";
import { resolveCompiledScript } from "./tsx-launcher.mjs";

/**
 * Scripts this increment may launch from `dist/` without tsx. `tsconfig.build.json` already
 * emits `tooling/**` plus the catalog, gates-layout, graph-foundations, hub-spoke, and
 * learning-grounding wrappers. The rest of the uncompiled `checks/` graph stays on tsx.
 */
export const PACKED_CHECK_COMPILED_SOURCES = [
  "checks/validation/repository/check-catalog.ts",
  "checks/validation/repository/check-gates-layout.ts",
  "checks/validation/repository/check-graph-foundations.ts",
  "checks/validation/repository/check-hub-spoke.ts",
  "checks/validation/repository/check-learning-grounding.ts",
  "tooling/render-credits.ts",
  "tooling/render-hosted-bundle.ts",
  "tooling/render-public-api.ts",
] as const;

export interface PackedCheckInventoryEntry {
  readonly id: string;
  readonly script: string;
  readonly sourcePath: string | undefined;
  readonly remainingTsx: boolean;
}

export function parseTsxCheckScript(script: string): { sourcePath: string; rest: string[] } | undefined {
  const tokens = script.trim().split(/\s+/);
  if (tokens[0] !== "tsx" || tokens[1] === undefined) return undefined;
  return { sourcePath: tokens[1], rest: tokens.slice(2) };
}

function isCompiledCheckSource(sourcePath: string): boolean {
  return (PACKED_CHECK_COMPILED_SOURCES as readonly string[]).includes(sourcePath);
}

/** Living inventory: every `check:*` script, with remaining-tsx meaning "packed omit-dev still needs tsx". */
export function inventoryCheckScripts(scripts: Record<string, string>): PackedCheckInventoryEntry[] {
  return Object.entries(scripts)
    .filter(([id]) => id.startsWith("check:"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, script]) => {
      const parsed = parseTsxCheckScript(script);
      const sourcePath = parsed?.sourcePath;
      const remainingTsx = sourcePath === undefined || !isCompiledCheckSource(sourcePath);
      return { id, script, sourcePath, remainingTsx };
    });
}

/** Prefer `dist/` when the script's compiled twin exists. Otherwise the caller keeps `npm run` / tsx. */
export function resolvePackedCheckCommand(skillRoot: string, script: string, extraArgs: string[]): { executable: string; args: string[] } | undefined {
  const parsed = parseTsxCheckScript(script);
  if (!parsed || !isCompiledCheckSource(parsed.sourcePath)) return undefined;
  const compiled = resolveCompiledScript(skillRoot, path.join(skillRoot, parsed.sourcePath));
  if (!compiled) return undefined;
  return { executable: process.execPath, args: [compiled, ...parsed.rest, ...extraArgs] };
}
