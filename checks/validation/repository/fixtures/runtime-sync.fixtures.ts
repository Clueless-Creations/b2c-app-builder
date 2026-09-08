import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { skillRoot, type Harness } from "./_harness.js";

/**
 * Fixtures for the ownership-tracked installed-runtime sync. Conflicts block,
 * bootstrap requires --adopt, unowned files survive, owned orphans are deleted,
 * and a clean tree reports no drift.
 */

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", ["-c", "user.email=fixture@test", "-c", "user.name=fixture", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
}

/** A git-tracked source tree (git ls-files is the tool's source manifest). */
function writeSourceTree(root: string): string {
  const source = path.join(root, "source");
  mkdirSync(path.join(source, "sub"), { recursive: true });
  writeFileSync(path.join(source, "a.txt"), "alpha v1\n");
  writeFileSync(path.join(source, "sub", "b.txt"), "beta v1\n");
  writeFileSync(path.join(source, "skill-version.json"), JSON.stringify({ version: "0.0.1-fixture" }));
  git(source, ["init", "-q"]);
  git(source, ["add", "-A"]);
  git(source, ["commit", "-qm", "fixture"]);
  return source;
}

export function register(harness: Harness): void {
  // Real verified sync: npm installs a local Prettier package, then the actual
  // audit runner executes its genuine formatting validator and excludes the
  // repository-only boundary check. The selected plan avoids recursive audits.
  {
    const root = harness.makeEmptyFixture("runtime-sync-verified-audit");
    const source = writeSourceTree(root);
    const runtime = path.join(root, "runtime");
    for (const relative of ["tooling/run-audit.ts", "tooling/lib/audit-plan.ts", "tooling/lib/runtime-sync-lib.ts"]) {
      mkdirSync(path.dirname(path.join(source, relative)), { recursive: true });
      copyFileSync(path.join(skillRoot, relative), path.join(source, relative));
    }
    mkdirSync(path.join(source, ".github"));
    writeFileSync(path.join(source, ".github", "fixture.yml"), "name: fixture\n");
    writeFileSync(path.join(source, "payload.json"), '{ "fixture": true }\n');
    const original = JSON.parse(readFileSync(path.join(skillRoot, "package.json"), "utf8"));
    const boundaryScript = original.scripts["check:repository-boundary"].replace("tsx ", `tsx ${skillRoot}/`);
    writeFileSync(
      path.join(source, "package.json"),
      JSON.stringify(
        {
          name: "verified-runtime-fixture",
          version: "0.0.1",
          type: "module",
          private: true,
          devDependencies: { prettier: `file:${path.join(skillRoot, "node_modules/prettier")}` },
          scripts: {
            audit: `node ${JSON.stringify(path.join(skillRoot, "node_modules/tsx/dist/cli.mjs"))} tooling/run-audit.ts --only lint:format --only check:repository-boundary`,
            "lint:format": "prettier --check payload.json",
            "check:repository-boundary": boundaryScript,
          },
        },
        null,
        2,
      ) + "\n",
    );
    git(source, ["add", "-A"]);
    git(source, ["commit", "-qm", "verified audit fixture"]);
    const args = ["sync", "--source", source, "--installed", runtime, "--runtimes-root", path.join(root, "clients")];
    harness.runScriptArgs("verified runtime sync succeeds despite copied github metadata", "runtime-sync.ts", args, 0, "Maintainer audit (skill layout");
    const success = harness.results.at(-1)!.output;
    if (!success.includes("lint:format — ok") || success.includes("[2/2] check:repository-boundary"))
      throw new Error("Verified sync did not run its real formatter with repository gates excluded.");
    writeFileSync(path.join(source, "payload.json"), '{"fixture":true}');
    git(source, ["add", "payload.json"]);
    git(source, ["commit", "-qm", "invalid format fixture"]);
    harness.runScriptArgs("verified runtime sync propagates an actual installed formatting failure", "runtime-sync.ts", args, 1, "lint:format — FAILED");
    const failed = harness.results.at(-1)!.output;
    if (!failed.includes("Runtime audit failed") || failed.includes("Runtime now at source version"))
      throw new Error("Failed installed validator did not fail sync before success reporting.");
  }
  const tool = "runtime-sync.ts";
  const run = (label: string, args: string[], expectedCode: number, expectedText?: string): void => {
    const isolatedArgs = args.includes("--runtimes-root") ? args : [...args, "--runtimes-root", path.join(harness.tempRoot, "isolated-client-roots")];
    harness.runScriptArgs(label, tool, isolatedArgs, expectedCode, expectedText);
  };
  const syncArgs = (source: string, runtime: string, ...extra: string[]): string[] => [
    "sync",
    "--source",
    source,
    "--installed",
    runtime,
    "--no-verify",
    ...extra,
  ];

  {
    const root = harness.makeEmptyFixture("runtime-sync-invalid-manifest");
    const source = writeSourceTree(root);
    const runtime = path.join(root, "runtime");
    mkdirSync(runtime);
    const marker = path.join(runtime, ".runtime-sync-manifest.json");
    writeFileSync(path.join(runtime, "a.txt"), "preserve runtime edit\n");
    const valid = { schemaVersion: 1, sourceVersion: "unknown", syncedAt: "2026-09-08T00:00:00Z", files: {} };
    for (const value of [
      "{",
      "null",
      "[]",
      JSON.stringify({ ...valid, files: null }),
      JSON.stringify({ ...valid, files: [] }),
      JSON.stringify({ ...valid, files: { "../escape": "a".repeat(64) } }),
      JSON.stringify({ ...valid, files: { "a.txt": 7 } }),
    ]) {
      writeFileSync(marker, value);
      run("invalid ownership manifest cannot grant adopt or force authority", syncArgs(source, runtime, "--adopt", "--force"), 1);
      if (readFileSync(marker, "utf8") !== value || readFileSync(path.join(runtime, "a.txt"), "utf8") !== "preserve runtime edit\n")
        throw new Error("Invalid manifest rejection mutated runtime.");
    }
  }

  {
    const root = harness.makeEmptyFixture("runtime-sync-flow");
    const source = writeSourceTree(root);
    const runtime = path.join(root, "runtime");
    mkdirSync(runtime, { recursive: true });
    writeFileSync(path.join(runtime, "custom.txt"), "user-owned\n");

    run("runtime-sync check reports drift with exit 1", ["check", "--source", source, "--installed", runtime], 1, "Drift detected");

    // Bootstrap with a differing runtime file: ownership unprovable, must refuse without --adopt.
    writeFileSync(path.join(runtime, "a.txt"), "runtime edit\n");
    run("runtime-sync refuses bootstrap conflicts without --adopt", syncArgs(source, runtime), 1, "Bootstrap conflicts");
    if (existsSync(path.join(runtime, ".runtime-sync-manifest.json"))) {
      throw new Error("runtime-sync wrote a manifest despite refusing the bootstrap");
    }

    run("runtime-sync bootstraps with --adopt", syncArgs(source, runtime, "--adopt"), 0, "0.0.1-fixture");
    run("runtime-sync clean check after sync", ["check", "--source", source, "--installed", runtime], 0, "Runtime matches source");
    if (!existsSync(path.join(runtime, "custom.txt"))) {
      throw new Error("runtime-sync deleted an unowned file");
    }

    // Post-sync runtime edit: the drift-ahead failure. Sync must stop, not clobber.
    writeFileSync(path.join(runtime, "a.txt"), "edited after sync\n");
    run("runtime-sync blocks on a runtime edited since the last sync", syncArgs(source, runtime), 1, "edited since the last sync");
    run("runtime-sync --force overwrites a conflicting edit deliberately", syncArgs(source, runtime, "--force"), 0, "Copied");

    // Orphan-edit conflict under --force: the file was edited in the runtime AND
    // dropped from source. Force means "adopt the source's state", and the
    // source's state for a dropped path is absence — the file must be deleted,
    // not silently kept and dropped from the manifest.
    writeFileSync(path.join(runtime, "a.txt"), "edited orphan\n");
    git(source, ["rm", "-q", "a.txt"]);
    git(source, ["commit", "-qm", "drop a.txt"]);
    run("runtime-sync refuses an orphan-edit conflict without --force", syncArgs(source, runtime), 1, "edited since the last sync");
    if (!existsSync(path.join(runtime, "a.txt"))) {
      throw new Error("runtime-sync deleted an orphan-edit conflict without --force");
    }
    run("runtime-sync --force deletes an orphan-edit conflict", syncArgs(source, runtime, "--force"), 0, "deleted 1");
    if (existsSync(path.join(runtime, "a.txt"))) {
      throw new Error("runtime-sync failed to delete a forced orphan-edit conflict");
    }
    if (!existsSync(path.join(runtime, "custom.txt"))) {
      throw new Error("runtime-sync deleted an unowned file during orphan cleanup");
    }
  }

  {
    const root = harness.makeEmptyFixture("runtime-sync-scoped-aliases");
    const source = writeSourceTree(root);
    const runtime = path.join(root, "runtime");
    const clientRoots = path.join(root, "clients");
    const aliases = path.join(clientRoots, ".claude", "skills");
    mkdirSync(aliases, { recursive: true });
    const alias = path.join(aliases, "runtime");
    symlinkSync(runtime, alias);
    run(
      "runtime-sync scopes alias diagnostics to --runtimes-root",
      syncArgs(source, runtime, "--runtimes-root", clientRoots),
      0,
      `Alias ${alias}: resolves to the synced runtime`,
    );
  }

  {
    const root = harness.makeEmptyFixture("runtime-sync-retired-presentation");
    const source = writeSourceTree(root);
    const retired = ["tooling/render-launch-cockpit.ts", "examples/workspace/business/operations/business-control-plane.html"];
    for (const relative of retired) {
      const target = path.join(source, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `managed retired file: ${relative}\n`);
    }
    git(source, ["add", "-A"]);
    git(source, ["commit", "-qm", "presentation before retirement"]);
    const managedRuntime = path.join(root, "managed-runtime");
    const editedRuntime = path.join(root, "edited-runtime");
    for (const runtime of [managedRuntime, editedRuntime]) {
      run("runtime-sync records ownership before presentation retirement", syncArgs(source, runtime), 0);
      writeFileSync(path.join(runtime, "unowned-notes.md"), "local notes survive retirement\n");
    }
    const editedPath = path.join(editedRuntime, retired[0]!);
    writeFileSync(editedPath, "hand-edited retired renderer\n");
    const oldManifest = readFileSync(path.join(editedRuntime, ".runtime-sync-manifest.json"), "utf8");
    git(source, ["rm", "-q", ...retired]);
    git(source, ["commit", "-qm", "retire presentation files"]);

    run("runtime-sync removes unchanged managed retired files", syncArgs(source, managedRuntime), 0, "deleted 2");
    for (const relative of retired) {
      if (existsSync(path.join(managedRuntime, relative))) throw new Error(`Managed retired file survived cleanup: ${relative}`);
    }
    const manifest = JSON.parse(readFileSync(path.join(managedRuntime, ".runtime-sync-manifest.json"), "utf8")) as { files: Record<string, string> };
    if (retired.some((relative) => Object.hasOwn(manifest.files, relative))) throw new Error("Retired paths remain in the ownership manifest.");
    run("runtime-sync refuses retirement when an owned file has a hand edit", syncArgs(source, editedRuntime), 1, "edited since the last sync");
    if (readFileSync(editedPath, "utf8") !== "hand-edited retired renderer\n") throw new Error("Retirement overwrote a hand-edited renderer.");
    if (!existsSync(path.join(editedRuntime, retired[1]!))) throw new Error("Retirement partly deleted a runtime despite its conflict.");
    if (readFileSync(path.join(editedRuntime, ".runtime-sync-manifest.json"), "utf8") !== oldManifest) {
      throw new Error("A refused retirement changed ownership records.");
    }
    for (const runtime of [managedRuntime, editedRuntime]) {
      if (readFileSync(path.join(runtime, "unowned-notes.md"), "utf8") !== "local notes survive retirement\n") {
        throw new Error("Retirement changed an unowned runtime file.");
      }
    }
  }

  {
    // Symlinked runtime directory: source paths under it must hard-block the
    // sync (no force override), and the external tree must stay untouched.
    const root = harness.makeEmptyFixture("runtime-sync-symlink");
    const source = writeSourceTree(root);
    const runtime = path.join(root, "runtime");
    const outside = path.join(root, "outside");
    mkdirSync(runtime, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, "b.txt"), "external content\n");
    symlinkSync(outside, path.join(runtime, "sub"));

    run("runtime-sync blocks source paths under a runtime symlink", syncArgs(source, runtime, "--adopt", "--force"), 1, "BLOCKED");
    const external = readFileSync(path.join(outside, "b.txt"), "utf8");
    if (external !== "external content\n") {
      throw new Error("runtime-sync wrote through a symlinked runtime directory");
    }
    if (existsSync(path.join(runtime, ".runtime-sync-manifest.json"))) {
      throw new Error("runtime-sync wrote a manifest despite a symlink block");
    }
  }

  {
    const root = harness.makeEmptyFixture("runtime-sync-all-clients");
    const source = writeSourceTree(root);
    const home = path.join(root, "home");
    const claude = path.join(home, ".claude", "skills", "b2c-app-builder");
    const codex = path.join(home, ".codex", "skills", "b2c-app-builder");
    mkdirSync(claude, { recursive: true });

    run("runtime-sync bootstraps Claude at v1", syncArgs(source, claude, "--adopt"), 0);
    writeFileSync(path.join(source, "a.txt"), "alpha v2\n");
    writeFileSync(path.join(source, "skill-version.json"), JSON.stringify({ version: "0.0.2-fixture" }));
    git(source, ["add", "-A"]);
    git(source, ["commit", "-qm", "bump"]);
    mkdirSync(codex, { recursive: true });
    run("runtime-sync writes Codex only without --all-clients", syncArgs(source, codex, "--adopt"), 0);

    const allClientsArgs = ["--source", source, "--installed", codex, "--all-clients", "--runtimes-root", home];
    run("runtime-sync check --all-clients fails while Claude is behind", ["check", ...allClientsArgs], 1, "behind");
    run("runtime-sync sync --all-clients updates Claude", ["sync", ...allClientsArgs, "--no-verify"], 0);
    run("runtime-sync check --all-clients passes after sync", ["check", ...allClientsArgs], 0);
    const claudeVersion = JSON.parse(readFileSync(path.join(claude, "skill-version.json"), "utf8")) as { version?: string };
    if (claudeVersion.version !== "0.0.2-fixture") {
      throw new Error(`Claude runtime stayed at ${claudeVersion.version ?? "unknown"} after --all-clients sync`);
    }
    if (readFileSync(path.join(claude, "a.txt"), "utf8") !== "alpha v2\n") {
      throw new Error("Claude runtime files stayed stale after --all-clients sync");
    }
  }
}
