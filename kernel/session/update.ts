#!/usr/bin/env node
/**
 * b2c update — update the ENGINE, explicitly (layering plan R4).
 *
 * The engine and a business update independently: a newer engine never silently changes a
 * running business, because every workspace pins its own executable catalog and only re-pins
 * through `b2c bootstrap --apply`. This command therefore only moves the install:
 *
 *   - a git-checkout install (the only distribution today; npm publish is a recorded founder
 *     decision deliberately deferred): dry-run reports where HEAD sits against origin/main using
 *     already-fetched refs — no network; `--apply` fetches, fast-forwards, and reinstalls
 *     dependencies, then reminds the operator that each business re-pins on its own.
 *   - anything else: a named error with the git-tag-pinning guidance.
 *
 * Exit codes: 0 = reported or updated; 1 = not updatable from here or the update failed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isMainModule, parseArgs } from "../lib/cli.js";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function git(repoRoot: string, args: string[]): { code: number; output: string } {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", timeout: 300_000 });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function findGitRoot(start: string): string | undefined {
  let current = start;
  for (;;) {
    if (existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function engineVersion(): string {
  return (JSON.parse(readFileSync(path.join(skillRoot, "skill-version.json"), "utf8")) as { version: string }).version;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === "true";

  const repoRoot = findGitRoot(skillRoot);
  if (!repoRoot) {
    console.error(
      "ISSUE update.not_a_checkout: this install is not a git checkout, so it cannot self-update. " +
        "Install the newer tag the same way this one was installed (git-tag pinning; npm publish is deliberately deferred).",
    );
    return 1;
  }

  console.log(`Engine version: ${engineVersion()} (checkout at ${repoRoot})`);
  const branch = git(repoRoot, ["branch", "--show-current"]).output;
  const behind = git(repoRoot, ["rev-list", "--count", "HEAD..origin/main"]);
  if (behind.code === 0) {
    console.log(`Position: ${behind.output} commit(s) behind origin/main as of the last fetch${branch ? ` (on ${branch})` : ""}.`);
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to fetch, fast-forward, and reinstall dependencies.");
    return 0;
  }

  if (branch !== "main") {
    console.error(`ISSUE update.not_on_main: the checkout is on "${branch || "(detached)"}" — updates only fast-forward main. Switch branches first.`);
    return 1;
  }
  const dirty = git(repoRoot, ["status", "--porcelain"]);
  if (dirty.output.split("\n").some((line) => line.trim() !== "" && !line.startsWith("??"))) {
    console.error("ISSUE update.dirty_checkout: the checkout has local modifications — commit or stash them first. An update never overwrites work.");
    return 1;
  }

  const before = engineVersion();
  for (const step of [
    ["fetch", ["fetch", "origin", "main"]],
    ["fast-forward", ["merge", "--ff-only", "origin/main"]],
  ] as const) {
    const result = git(repoRoot, [...step[1]]);
    if (result.code !== 0) {
      console.error(`ISSUE update.${step[0].replace("-", "_")}_failed: ${result.output.slice(-300)}`);
      return 1;
    }
  }
  for (const dir of [repoRoot]) {
    const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, encoding: "utf8", timeout: 600_000 });
    if (install.status !== 0) {
      console.error(`ISSUE update.install_failed in ${dir}: ${(install.stderr ?? "").slice(-300)}`);
      return 1;
    }
  }
  const after = engineVersion();
  console.log(before === after ? `Already current at ${after}.` : `Updated ${before} -> ${after}.`);
  console.log("Businesses keep their pinned catalogs. Re-pin one deliberately: b2c bootstrap --workspace <dir> --apply");
  console.log("Pin every B2C App Builder client (Claude, Cursor, Codex, Agents) with: npm run runtime:sync -- --all-clients");
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
