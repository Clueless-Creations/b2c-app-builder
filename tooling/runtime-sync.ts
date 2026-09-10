#!/usr/bin/env node
/**
 * Synchronize the source checkout with installed B2C App Builder runtimes.
 * The default runtime is ~/.codex/skills/b2c-app-builder.
 *
 * The sync tracks file ownership. It refuses conflicting runtime edits unless
 * the caller uses --force. It preserves unowned files. Plan semantics live in
 * tooling/lib/runtime-sync-lib.ts. This file gathers inputs, applies plans,
 * and reports results.
 *
 * Subcommands:
 *   check   Report drift between source and runtime. Exit 1 when they differ.
 *   sync    Apply the source to the runtime. Refuses on conflicts unless --force
 *           (or --adopt on a first run without a manifest). Writes the ownership
 *           manifest, then runs npm install (when the lockfile changed) and
 *           npm run audit inside the runtime unless --no-verify.
 *
 * Flags:
 *   --source <dir>      Source skill root (default: this script's skill root).
 *   --installed <dir>   Installed runtime root (default: ~/.codex/skills/b2c-app-builder).
 *   --force             Overwrite conflicting runtime edits (they are lost — commit them to source first).
 *   --adopt             First run only: accept that differing runtime files are superseded by source.
 *   --no-verify         Skip npm install / npm run audit in the runtime after syncing.
 *   --json              Emit the plan as JSON (check only).
 *   --all-clients       After check, inspect Codex, Claude, Cursor, and agents pins and fail when a present pin does not match. On sync, write each present unique client root, then fail if any present pin still trails.
 *   --runtimes-root     Home directory used to resolve client install roots (default: the process home).
 *
 * The source file set is `git ls-files` under the source root, so gitignored
 * build outputs (dist/, node_modules/) never sync and never count as drift.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectRuntimePins, defaultRuntimeInstallRoots, type RuntimePinRelation } from "../adapters/providers/runtime-pin.js";
import { isSyncManifest, computeSyncPlan, isIgnoredRuntimePath, nextManifest, planIsClean, type SyncManifest, type SyncPlan } from "./lib/runtime-sync-lib.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceRoot = path.resolve(scriptDir, "..");
const MANIFEST_NAME = ".runtime-sync-manifest.json";

interface Options {
  command: "check" | "sync";
  sourceRoot: string;
  installedRoot: string;
  force: boolean;
  adopt: boolean;
  verify: boolean;
  json: boolean;
  allClients: boolean;
  runtimesRoot?: string;
}

function parseOptions(argv: string[]): Options {
  const command = argv[0];
  if (command !== "check" && command !== "sync") {
    throw new Error(
      "Usage: runtime-sync.ts <check|sync> [--source <dir>] [--installed <dir>] [--force] [--adopt] [--no-verify] [--json] [--all-clients] [--runtimes-root <dir>]",
    );
  }
  const options: Options = {
    command,
    sourceRoot: defaultSourceRoot,
    installedRoot: path.join(homedir(), ".codex", "skills", "b2c-app-builder"),
    force: false,
    adopt: false,
    verify: true,
    json: false,
    allClients: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--source" && value) {
      options.sourceRoot = path.resolve(value);
      index += 1;
    } else if (token === "--installed" && value) {
      options.installedRoot = path.resolve(value);
      index += 1;
    } else if (token === "--force") {
      options.force = true;
    } else if (token === "--adopt") {
      options.adopt = true;
    } else if (token === "--no-verify") {
      options.verify = false;
    } else if (token === "--json") {
      options.json = true;
    } else if (token === "--all-clients") {
      options.allClients = true;
    } else if (token === "--runtimes-root" && value) {
      options.runtimesRoot = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown flag: ${token}`);
    }
  }
  return options;
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function gitTrackedFiles(sourceRoot: string): string[] {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: sourceRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed in ${sourceRoot}: ${result.stderr.trim() || "is the source root inside a git checkout?"}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function hashSourceFiles(sourceRoot: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const relPath of gitTrackedFiles(sourceRoot)) {
    const absolute = path.join(sourceRoot, relPath);
    // A tracked-but-deleted file (staged deletion) has no bytes to sync.
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) continue;
    hashes[relPath] = sha256(absolute);
  }
  return hashes;
}

function hashRuntimeFiles(installedRoot: string): { hashes: Record<string, string>; symlinks: string[] } {
  const hashes: Record<string, string> = {};
  const symlinks: string[] = [];
  if (!existsSync(installedRoot)) return { hashes, symlinks };
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relPath = path.relative(installedRoot, absolute).split(path.sep).join("/");
      if (isIgnoredRuntimePath(relPath) || isIgnoredRuntimePath(`${relPath}/`)) continue;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        symlinks.push(relPath);
      } else if (stat.isDirectory()) {
        visit(absolute);
      } else if (stat.isFile()) {
        hashes[relPath] = sha256(absolute);
      }
    }
  };
  visit(installedRoot);
  return { hashes, symlinks };
}

function readManifest(installedRoot: string): SyncManifest | undefined {
  const manifestPath = path.join(installedRoot, MANIFEST_NAME);
  const stat = lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!stat) return undefined;
  if (!stat.isFile()) throw new Error(`${manifestPath} must be a regular sync manifest file.`);
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isSyncManifest(parsed)) {
    throw new Error(`${manifestPath} is not a schemaVersion 1 sync manifest. Restore valid ownership evidence before syncing; no runtime files were changed.`);
  }
  return parsed;
}

function sourceVersion(sourceRoot: string): string {
  try {
    const parsed = JSON.parse(readFileSync(path.join(sourceRoot, "skill-version.json"), "utf8")) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function printPlan(plan: SyncPlan, options: Options, symlinks: string[]): void {
  const describe = (label: string, entries: string[], limit = 20): void => {
    if (entries.length === 0) return;
    console.log(`${label} (${entries.length}):`);
    for (const entry of entries.slice(0, limit)) console.log(`  - ${entry}`);
    if (entries.length > limit) console.log(`  … and ${entries.length - limit} more`);
  };
  console.log(`Source:    ${options.sourceRoot}`);
  console.log(`Installed: ${options.installedRoot}`);
  if (plan.bootstrap) console.log("No sync manifest found: first run (bootstrap). Ownership of differing files cannot be proven.");
  describe("Copy (source → runtime)", plan.copies);
  describe("Delete (owned, no longer in source)", plan.deletes);
  describe("CONFLICT (runtime edited since last sync)", plan.conflicts, 50);
  describe("BLOCKED (source path sits under a runtime symlink)", plan.symlinkBlocked, 50);
  describe("Unowned (left untouched)", plan.unowned);
  describe("Runtime symlinks (never followed)", symlinks);
  console.log(`Unchanged: ${plan.unchanged.length} file(s).`);
}

/** Throws when any existing directory between installedRoot and target is a symlink — a write would escape the runtime tree. */
function assertNoSymlinkAncestor(target: string, installedRoot: string): void {
  let current = path.dirname(target);
  while (current.startsWith(installedRoot) && current !== installedRoot) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`Refusing to write through the symlinked directory ${current}. Remove the symlink and re-run.`);
    }
    current = path.dirname(current);
  }
}

function run(command: string, args: string[], cwd: string): number {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

function verifySymlinkAliases(installedRoot: string, runtimesRoot: string): void {
  const aliasRoots = [path.join(runtimesRoot, ".claude", "skills"), path.join(runtimesRoot, ".agents", "skills"), path.join(runtimesRoot, ".cursor", "skills")];
  for (const aliasRoot of aliasRoots) {
    if (!existsSync(aliasRoot)) continue;
    const alias = path.join(aliasRoot, path.basename(installedRoot));
    try {
      if (lstatSync(alias).isSymbolicLink()) {
        const resolved = path.resolve(path.dirname(alias), readlinkSync(alias));
        const status = resolved === installedRoot ? "resolves to the synced runtime" : `resolves elsewhere: ${resolved}`;
        console.log(`Alias ${alias}: ${status}.`);
      }
    } catch {
      console.log(`Alias ${alias}: not present (fine when this harness does not use one).`);
    }
  }
}

function resolvedPath(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return path.resolve(root);
  }
}

function pinRelationBlocks(relation: RuntimePinRelation): boolean {
  switch (relation) {
    case "missing":
    case "equal":
      return false;
    case "behind":
    case "ahead":
    case "invalid":
      return true;
    default: {
      const exhaustive: never = relation;
      throw new Error(`Unhandled pin relation ${String(exhaustive)}`);
    }
  }
}

function clientHome(options: Options): string {
  return options.runtimesRoot ?? homedir();
}

function syncTargetRoots(options: Options): string[] {
  if (!options.allClients) return [options.installedRoot];
  const seen = new Set<string>();
  const targets: string[] = [];
  const add = (root: string, requireExists: boolean): void => {
    if (requireExists && !existsSync(root)) return;
    const key = existsSync(root) ? resolvedPath(root) : path.resolve(root);
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(existsSync(root) ? resolvedPath(root) : path.resolve(root));
  };
  add(options.installedRoot, false);
  for (const entry of defaultRuntimeInstallRoots(clientHome(options))) {
    add(entry.root, true);
  }
  return targets;
}

function applySyncToRoot(options: Options, sourceFiles: Record<string, string>, installedRoot: string): boolean {
  const { hashes: runtimeFiles, symlinks } = hashRuntimeFiles(installedRoot);
  const manifest = readManifest(installedRoot);
  const plan = computeSyncPlan({ sourceFiles, runtimeFiles, runtimeSymlinks: symlinks, manifest });
  const targetOptions: Options = { ...options, installedRoot };
  printPlan(plan, targetOptions, symlinks);
  if (plan.symlinkBlocked.length > 0) {
    console.error(
      "\nBlocked: the source paths listed above sit at or under a runtime symlink. Writing them would follow the link into a tree outside the runtime. No flag overrides this — remove the symlink (or make it a real directory), then re-run. Nothing was written.",
    );
    return false;
  }
  if (plan.conflicts.length > 0 && !options.force && !(plan.bootstrap && options.adopt)) {
    console.error(
      plan.bootstrap
        ? "\nBootstrap conflicts: no manifest proves ownership of the differing files above. Re-run with --adopt to accept the source as canonical, after confirming no runtime-only fixes need to be committed to source first."
        : "\nConflicts: the runtime was edited since the last sync. Commit those edits to the source repo (or discard them deliberately with --force), then re-run. Nothing was written.",
    );
    return false;
  }
  const copyList = [...plan.copies, ...plan.conflicts.filter((relPath) => sourceFiles[relPath] !== undefined)];
  const deleteList = [...plan.deletes, ...plan.conflicts.filter((relPath) => sourceFiles[relPath] === undefined)];
  const lockChanged = copyList.includes("package-lock.json") || copyList.includes("package.json") || !existsSync(path.join(installedRoot, "node_modules"));
  for (const relPath of copyList) {
    const target = path.join(installedRoot, relPath);
    assertNoSymlinkAncestor(target, installedRoot);
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
      throw new Error(`Refusing to write through a symlink at ${target}. Remove it and re-run.`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(options.sourceRoot, relPath), target);
  }
  for (const relPath of deleteList) {
    rmSync(path.join(installedRoot, relPath), { force: true });
  }
  const manifestOut = nextManifest(sourceFiles, sourceVersion(options.sourceRoot), new Date().toISOString());
  writeFileSync(path.join(installedRoot, MANIFEST_NAME), `${JSON.stringify(manifestOut, null, 2)}\n`);
  console.log(`\nCopied ${copyList.length} file(s), deleted ${deleteList.length}, preserved ${plan.unowned.length} unowned.`);
  console.log(`Manifest written: ${path.join(installedRoot, MANIFEST_NAME)} (source version ${manifestOut.sourceVersion}).`);

  if (options.verify) {
    if (lockChanged) {
      console.log("\nRunning npm install in the runtime (dependencies changed)…");
      if (run("npm", ["install", "--no-fund", "--no-audit"], installedRoot) !== 0) {
        console.error("npm install failed in the runtime.");
        return false;
      }
    }
    console.log("\nRunning npm run audit in the runtime (skill layout; the repo-root audit remains the merge gate)…");
    if (run("npm", ["run", "audit"], installedRoot) !== 0) {
      console.error("Runtime audit failed.");
      return false;
    }
  }
  verifySymlinkAliases(installedRoot, clientHome(options));
  console.log(`\nRuntime now at source version ${manifestOut.sourceVersion}.`);
  return true;
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const sourceFiles = hashSourceFiles(options.sourceRoot);
  if (Object.keys(sourceFiles).length === 0) {
    throw new Error(`No git-tracked files found under ${options.sourceRoot}.`);
  }

  if (options.command === "check") {
    const { hashes: runtimeFiles, symlinks } = hashRuntimeFiles(options.installedRoot);
    const manifest = readManifest(options.installedRoot);
    const plan = computeSyncPlan({ sourceFiles, runtimeFiles, runtimeSymlinks: symlinks, manifest });
    if (options.json) {
      console.log(JSON.stringify({ ...plan, symlinks }, null, 2));
    } else {
      printPlan(plan, options, symlinks);
    }
    const pinsOk = reportClientPins(options);
    if (planIsClean(plan) && pinsOk) {
      console.log("Runtime matches source. No drift.");
      return;
    }
    if (!planIsClean(plan)) {
      console.log("Drift detected. Run `npm run runtime:sync` from the source checkout to reconcile.");
    }
    process.exitCode = 1;
    return;
  }

  const targets = syncTargetRoots(options);
  for (const target of targets) {
    console.log(`\nSyncing ${target}`);
    if (!applySyncToRoot(options, sourceFiles, target)) {
      process.exitCode = 1;
      return;
    }
  }
  if (!reportClientPins(options)) {
    console.error("\nA present client runtime still does not match the source pin.");
    process.exitCode = 1;
  }
}

function reportClientPins(options: Options): boolean {
  if (!options.allClients) return true;
  const pinVersion = sourceVersion(options.sourceRoot);
  const inspections = inspectRuntimePins(pinVersion, defaultRuntimeInstallRoots(clientHome(options)), options.sourceRoot);
  console.log("\nClient pins:");
  let ok = true;
  for (const item of inspections) {
    switch (item.relation) {
      case "missing":
        console.log(`  ${item.id}: not installed (skip).`);
        break;
      case "equal":
        console.log(`  ${item.id}: ${item.version} (matches source ${pinVersion}).`);
        break;
      case "ahead":
        console.log(`  ${item.id}: ${item.version} is ahead of source ${pinVersion}.`);
        break;
      case "behind":
        console.log(`  ${item.id}: ${item.version} is behind source ${pinVersion}.`);
        break;
      case "invalid":
        console.log(`  ${item.id}: invalid skill-version.json.`);
        break;
      default: {
        const exhaustive: never = item.relation;
        throw new Error(`Unhandled pin relation ${String(exhaustive)}`);
      }
    }
    if (pinRelationBlocks(item.relation)) ok = false;
  }
  if (!ok) {
    console.error("Present client runtimes must match the source pin. Missing installs are skipped.");
  }
  return ok;
}

main();
