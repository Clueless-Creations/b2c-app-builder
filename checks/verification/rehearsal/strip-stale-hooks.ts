#!/usr/bin/env node
/**
 * Remove this skill's stale v1 managed hook entries from an existing business repo's
 * .claude/settings.json, preserving every founder-owned entry.
 *
 * The v1 hook mechanism was deleted at the v2 cutover, so its entries now point at
 * validators that no longer exist. install-entrypoints.ts also rewrites AGENTS.md /
 * CLAUDE.md from templates, which would destroy a repo's hand-authored guide — this
 * reuses only the tested strip step.
 *
 * Usage: tsx checks/verification/rehearsal/strip-stale-hooks.ts <repo-dir> [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stripManagedHookEntries } from "../../../adapters/install-entrypoints.js";
import type { HookSettings } from "../../../adapters/install-entrypoints.js";

const target = process.argv[2];
const apply = process.argv.includes("--apply");
if (!target) {
  console.error("Usage: tsx checks/verification/rehearsal/strip-stale-hooks.ts <repo-dir> [--apply]");
  process.exit(1);
}
const settingsPath = path.join(target, ".claude", "settings.json");
const before = JSON.parse(readFileSync(settingsPath, "utf8")) as HookSettings;
const result = stripManagedHookEntries(before);
console.log(
  `removed ${result.removedCount} managed hook entr${result.removedCount === 1 ? "y" : "ies"}; preserved ${result.preservedForeignCount} founder-owned entr${result.preservedForeignCount === 1 ? "y" : "ies"} in touched groups`,
);
if (apply) {
  writeFileSync(settingsPath, `${JSON.stringify(result.settings, null, 2)}\n`);
  console.log(`wrote ${settingsPath}`);
} else {
  console.log("(dry run — pass --apply to write)");
}
