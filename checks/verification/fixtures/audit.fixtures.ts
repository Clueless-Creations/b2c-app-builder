import { symlinkSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, createHarness, repoCheckoutPresent, repoRoot, skillRoot, type Harness } from "./_harness.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { buildAuditPlan, parseAuditShard, serialStepIds, stepSkippedByLane, stepSkippedByShard } from "../../../tooling/lib/audit-plan.js";
import { getPath, loadProjectState, parseCliArgs } from "../../../tooling/lib/launch-state.js";
import { SHARD_RESULT_MARKER, parseShardOutput } from "../../../tooling/lib/shard-pool.js";
import { laneKeys, type Status } from "../../../kernel/schema/types.js";

/**
 * U9 meta-tests for the audit pipeline itself (KTD10's "single-source audit plan + parity
 * enforcement" pattern): does check-package-parity.ts really reject a gate-shaped script that
 * escaped tooling/lib/audit-plan.ts, does this whole harness's own issue-code-checking mechanism
 * actually discriminate (the recorded "fixture exit-code vs issue-code assertions" trap named in
 * the plan's directory-move trap list), and is every suite file actually reachable from a
 * runner's auto-discovery.
 */

const tsxBin = resolveTsxBin(skillRoot);

function copyFile(from: string, to: string): void {
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, readFileSync(from), "utf8");
}

/**
 * A faithful COPY of the real package manifests (never a hand-rolled minimal stand-in — a
 * stand-in would need to re-derive every audit-plan step's own required script, which is
 * exactly the kind of second, driftable copy this repo's "duplicated helpers have already
 * diverged" lesson warns against). Since ADR-0002 the repository root is the package root, so
 * the copy is one tree and check-package-parity.ts is pointed at it via --repo-root/--skill-root;
 * the real, checked-in package.json is never touched.
 */
function buildFaithfulParityFixture(harness: Harness): { repoRoot: string; skillRoot: string } {
  const tempRepoRoot = harness.makeTempDir("audit-plan-parity-fixture");
  for (const relative of ["package.json", "package-lock.json", ".nvmrc", ".node-version", "skill-version.json"] as const) {
    copyFile(path.join(repoRoot, relative), path.join(tempRepoRoot, relative));
  }
  return { repoRoot: tempRepoRoot, skillRoot: tempRepoRoot };
}

function runCheckPackageParity(args: string[]): { code: number; output: string } {
  const result = spawnSync(tsxBin, [path.join(skillRoot, "checks/validation/repository/check-package-parity.ts"), ...args], {
    cwd: skillRoot,
    encoding: "utf8",
  });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

export function register(harness: Harness): void {
  const validOwnership = { schemaVersion: 1, sourceVersion: "unknown", syncedAt: "2026-09-08T00:00:00Z", files: { "a.txt": "a".repeat(64) } };
  harness.check("audit layout: real checkout and linked worktree retain repository gates", () => {
    const root = harness.makeTempDir("audit-real-git");
    const checkout = path.join(root, "checkout"),
      worktree = path.join(root, "worktree");
    mkdirSync(checkout);
    writeFileSync(path.join(checkout, "package.json"), '{"scripts":{}}\n');
    const git = (args: string[]) => {
      const result = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", ...args], { cwd: checkout, encoding: "utf8" });
      assert(result.status === 0, `fixture git failed: ${result.stderr}`);
    };
    git(["init", "-q"]);
    git(["add", "package.json"]);
    git(["commit", "-qm", "fixture"]);
    git(["worktree", "add", "--detach", worktree]);
    for (const target of [checkout, worktree]) {
      writeFileSync(path.join(target, ".runtime-sync-manifest.json"), JSON.stringify(validOwnership));
      const result = spawnSync(
        process.execPath,
        [resolveTsxBin(skillRoot), path.join(skillRoot, "tooling/run-audit.ts"), "--package-root", target, "--list", "--only", "check:repository-boundary"],
        { encoding: "utf8" },
      );
      assert(
        result.status === 0 && result.stdout.includes("check:repository-boundary"),
        `real Git target lost repository gates: ${result.stdout} ${result.stderr}`,
      );
    }
  });
  const layouts: Array<{ label: string; git?: "file" | "directory"; github?: boolean; manifest?: string; repo: boolean }> = [
    { label: "plain package", repo: false },
    { label: "source archive github fallback", github: true, repo: true },
    { label: "managed runtime with copied github", github: true, manifest: JSON.stringify(validOwnership), repo: false },
    { label: "managed runtime without github", manifest: JSON.stringify(validOwnership), repo: false },
    { label: "git directory outranks valid ownership", git: "directory", manifest: JSON.stringify(validOwnership), repo: true },
    { label: "git worktree file outranks valid ownership", git: "file", manifest: JSON.stringify(validOwnership), repo: true },
    ...[
      "{",
      "null",
      "[]",
      JSON.stringify({ ...validOwnership, files: null }),
      JSON.stringify({ ...validOwnership, files: [] }),
      JSON.stringify({ ...validOwnership, schemaVersion: 2 }),
      JSON.stringify({ ...validOwnership, sourceVersion: "" }),
      JSON.stringify({ ...validOwnership, syncedAt: "bad" }),
      JSON.stringify({ ...validOwnership, files: { "../escape": "a".repeat(64) } }),
      JSON.stringify({ ...validOwnership, files: { "a.txt": 12 } }),
    ].map((manifest, i) => ({ label: `invalid ownership without github ${i}`, manifest, repo: true })),
  ];
  for (const item of layouts)
    harness.check(`audit layout: ${item.label}`, () => {
      const root = harness.makeTempDir(`audit-layout-${item.label.replaceAll(" ", "-")}`);
      writeFileSync(path.join(root, "package.json"), '{"scripts":{}}');
      if (item.github) mkdirSync(path.join(root, ".github"));
      if (item.git === "directory") mkdirSync(path.join(root, ".git"));
      if (item.git === "file") writeFileSync(path.join(root, ".git"), "gitdir: fixture\n");
      if (item.manifest !== undefined) writeFileSync(path.join(root, ".runtime-sync-manifest.json"), item.manifest);
      const result = spawnSync(
        process.execPath,
        [resolveTsxBin(skillRoot), path.join(skillRoot, "tooling/run-audit.ts"), "--package-root", root, "--list", "--only", "check:repository-boundary"],
        { encoding: "utf8" },
      );
      assert(result.status === 0, `layout command failed: ${result.stderr}`);
      assert(result.stdout.includes("check:repository-boundary") === item.repo, `wrong repository gate selection: ${result.stdout}`);
    });
  harness.check("audit layout: symlinked ownership never grants managed runtime classification", () => {
    const root = harness.makeTempDir("audit-layout-link");
    writeFileSync(path.join(root, "package.json"), '{"scripts":{}}');
    const outside = path.join(root, "manifest.json");
    writeFileSync(outside, JSON.stringify(validOwnership));
    symlinkSync(outside, path.join(root, ".runtime-sync-manifest.json"));
    for (const broken of [false, true]) {
      if (broken) unlinkSync(outside);
      const result = spawnSync(
        process.execPath,
        [resolveTsxBin(skillRoot), path.join(skillRoot, "tooling/run-audit.ts"), "--package-root", root, "--list", "--only", "check:repository-boundary"],
        { encoding: "utf8" },
      );
      assert(result.status === 0 && result.stdout.includes("check:repository-boundary"), "symlinked manifest bypassed repository gate");
    }
  });

  // --- audit-plan parity: a check:* script the plan doesn't know about must fail the gate -------

  // These two read the repository's own package.json/package-lock.json to build their fixture.
  // An installed runtime has neither above it, so from there the subject is absent rather than
  // wrong — skip with the reason instead of failing every `npm run runtime:sync`.
  const parityCase: (label: string, fn: () => void) => void = repoCheckoutPresent()
    ? harness.check
    : (label) => harness.skip(label, `repo-only: no repository manifests at ${repoRoot} (installed runtime)`);

  parityCase("audit-plan parity: a faithful copy of the real manifests passes check-package-parity cleanly (the positive control for the next case)", () => {
    const fixture = buildFaithfulParityFixture(harness);
    const result = runCheckPackageParity(["--repo-root", fixture.repoRoot, "--skill-root", fixture.skillRoot]);
    assert(result.code === 0, `expected a faithful, unmutated copy of the real manifests to pass check-package-parity, got ${result.code}:\n${result.output}`);
  });

  parityCase("pack smoke: a package tree whose manifest loses its files declaration fails check-package-parity by name", () => {
    // The faithful copy has manifests but no tree, so the pack smoke skips there (nothing to
    // pack). Planting the packaged bin on disk arms the smoke; stripping `files` from the
    // manifest must then be caught — the detector proving it detects.
    const fixture = buildFaithfulParityFixture(harness);
    copyFile(path.join(skillRoot, "entrypoints", "cli", "b2c.mjs"), path.join(fixture.skillRoot, "entrypoints", "cli", "b2c.mjs"));
    const skillPackagePath = path.join(fixture.skillRoot, "package.json");
    const skillPackage = JSON.parse(readFileSync(skillPackagePath, "utf8")) as { files?: string[] };
    delete skillPackage.files;
    writeFileSync(skillPackagePath, `${JSON.stringify(skillPackage, null, 2)}\n`, "utf8");

    const result = runCheckPackageParity(["--repo-root", fixture.repoRoot, "--skill-root", fixture.skillRoot]);
    assert(result.code !== 0, `expected the pack smoke to fail without a files manifest, got exit ${result.code}`);
    assert(result.output.includes("package_parity.pack_files_manifest_missing"), `expected pack_files_manifest_missing, got:\n${result.output}`);
  });

  parityCase("package parity: a manifest without engines.node fails by name", () => {
    const fixture = buildFaithfulParityFixture(harness);
    const packagePath = path.join(fixture.repoRoot, "package.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as { engines?: { node?: string } };
    delete manifest.engines;
    writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const result = runCheckPackageParity(["--repo-root", fixture.repoRoot, "--skill-root", fixture.skillRoot]);
    assert(result.code !== 0, `expected a missing engines.node to fail check-package-parity, got exit ${result.code}`);
    assert(result.output.includes("package_parity.root_engines_missing"), `expected root_engines_missing, got:\n${result.output}`);
  });

  parityCase("package parity: a missing .nvmrc fails check-package-parity by name", () => {
    const fixture = buildFaithfulParityFixture(harness);
    unlinkSync(path.join(fixture.repoRoot, ".nvmrc"));

    const result = runCheckPackageParity(["--repo-root", fixture.repoRoot, "--skill-root", fixture.skillRoot]);
    assert(result.code !== 0, `expected a missing .nvmrc to fail check-package-parity, got exit ${result.code}`);
    assert(result.output.includes("package_parity.nvmrc_missing"), `expected nvmrc_missing, got:\n${result.output}`);
  });

  parityCase(
    "audit-plan parity: a check:* script not in tooling/lib/audit-plan.ts's plan (and not explicitly excluded) fails check-package-parity with a named reason",
    () => {
      const fixture = buildFaithfulParityFixture(harness);
      const rootPackagePath = path.join(fixture.repoRoot, "package.json");
      const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as { scripts: Record<string, string> };
      // A script name that cannot already exist in the real plan/exclusion list, so this can never
      // pass by accident of the real audit-plan.ts's own current contents.
      rootPackage.scripts["check:u9-audit-plan-parity-fixture-probe"] = "tsx tooling/does-not-exist.ts";
      writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`, "utf8");

      const result = runCheckPackageParity(["--repo-root", fixture.repoRoot, "--skill-root", fixture.skillRoot]);
      assert(result.code !== 0, `expected the parity check to fail once an unregistered check:* script was added, got exit ${result.code}`);
      assert(result.output.includes("package_parity.root_audit_plan_gap"), `expected the specific audit_plan_gap issue code, got:\n${result.output}`);
      assert(
        result.output.includes("check:u9-audit-plan-parity-fixture-probe"),
        `expected the offending script name to be named in the output, got:\n${result.output}`,
      );
    },
  );

  // --- the issue-code-checking trap: prove the harness's own mechanism discriminates -------------

  harness.check(
    "harness/runScript: genuinely discriminates on issue TEXT, not just exit code — the recorded 'fixture exit-code vs issue-code assertions' trap, proven non-vacuous here",
    () => {
      // A throwaway harness, not the shared one: this deliberately runs one case with the WRONG
      // expected text so it can inspect the *result*, not let a deliberate mismatch count as a real
      // suite failure.
      const probe = createHarness(path.join(skillRoot, "kernel/schema"));
      try {
        const script = path.join(skillRoot, "catalog/render-routing.ts");
        // Right exit code (0), right text expectation: should read as ok.
        probe.runScript("control: --check should pass with a correct expectation", script, ["--check"], 0, "current");
        // Right exit code (0), WRONG text expectation: must read as a FAILURE — this is exactly the
        // trap. A harness that only compared exit codes would call this "ok" too, which would mean a
        // validator failing for the wrong reason could still satisfy a fixture that only checks exit
        // code. Real tests never assert this shape (its whole job is to prove the discrimination
        // exists), so this doesn't count as suite coverage of --check itself.
        probe.runScript(
          "control: --check with a deliberately wrong expectation must be reported as a failure",
          script,
          ["--check"],
          0,
          "this text will never appear in render-routing's output",
        );

        assert(probe.results.length === 2, `expected exactly 2 probe results, got ${probe.results.length}`);
        assert(probe.results[0]!.ok === true, `expected the correctly-expected case to read ok, got: ${JSON.stringify(probe.results[0])}`);
        assert(
          probe.results[1]!.ok === false,
          `expected the wrongly-expected case to read as a failure even though the exit code matched — if this is true, the harness is NOT vacuously trusting exit codes`,
        );
      } finally {
        probe.cleanup();
      }
    },
  );

  // --- all suites registered: every runner-discoverable file exports register(), and every ------
  // --- checks/verification/scenarios/ file is actually wired into scenarios.fixtures.ts -----------------

  // CI splits the heavy lane across shards, so the question that matters is not "is the split
  // balanced" but "can a serial step run in NO shard". Round-robin makes that impossible by
  // construction; this proves it for every width CI might use, including the degenerate 1.
  harness.check("heavy-lane shards partition the serial suites: every step runs in exactly one shard, at every width", () => {
    const plan = buildAuditPlan("repo");
    const serial = serialStepIds(plan);
    assert(serial.length > 0, "the plan must declare serial steps for sharding to mean anything");
    for (const total of [1, 2, 3, 4, serial.length, serial.length + 1]) {
      const owners = new Map<string, number[]>();
      for (let index = 1; index <= total; index += 1) {
        const shard = parseAuditShard(`${index}/${total}`);
        for (const step of plan) {
          if (!step.serial) {
            assert(stepSkippedByShard(plan, step, shard) === undefined, `${step.id} is not serial and must run in every shard`);
            continue;
          }
          if (stepSkippedByShard(plan, step, shard) === undefined) {
            owners.set(step.id, [...(owners.get(step.id) ?? []), index]);
          }
        }
      }
      for (const id of serial) {
        const running = owners.get(id) ?? [];
        assert(running.length === 1, `at width ${total}, ${id} runs in ${running.length} shard(s) (${running.join(", ")}); it must run in exactly one`);
      }
    }
  });

  // Regression: --only used to filter the plan BEFORE shard ownership was computed, which
  // renumbered the serial steps so whatever you selected became shard 1's. Both selections below
  // are skips, and they point at different shards on purpose — if ownership were computed from the
  // --only subset, each step would be owned by shard 1 and the first of these would run instead.
  harness.check("--only does not renumber shard ownership", () => {
    const run = (stepId: string, shard: string) =>
      spawnSync(tsxBin, [path.join(skillRoot, "tooling/run-audit.ts"), "--ci", "--lane", "heavy", "--shard", shard, "--only", stepId], {
        cwd: skillRoot,
        encoding: "utf8",
      });
    for (const [stepId, shard] of [
      ["test:parity", "1/2"],
      ["test:boundaries", "2/2"],
    ] as const) {
      const result = run(stepId, shard);
      assert(result.status === 0, `${stepId} on shard ${shard} must exit 0: ${result.stdout}${result.stderr}`);
      assert(
        result.stdout.includes("SKIPPED") && result.stdout.includes("1 skipped"),
        `${stepId} is not owned by shard ${shard} and must be skipped there, not run: ${result.stdout}`,
      );
    }
  });

  harness.check("--shard rejects a spelling that would silently drop suites", () => {
    for (const bad of ["", "1", "0/2", "3/2", "-1/2", "1/0", "one/two", "1/2/3", "1.5/2"]) {
      let rejected = false;
      try {
        parseAuditShard(bad);
      } catch {
        rejected = true;
      }
      assert(rejected, `--shard ${JSON.stringify(bad)} must be rejected, not silently accepted`);
    }
    assert(parseAuditShard("2/3").index === 2 && parseAuditShard("2/3").total === 3, "a valid shard must parse");
  });

  harness.check("all suites registered: every *.fixtures.ts / *.boundaries.ts / *.parity.ts file exports a register(harness) function", () => {
    const roots: Array<{ dir: string; suffix: string }> = [
      { dir: path.join(skillRoot, "checks/verification/fixtures"), suffix: ".fixtures.ts" },
      { dir: path.join(skillRoot, "checks/verification/boundaries"), suffix: ".boundaries.ts" },
      { dir: path.join(skillRoot, "checks/verification/parity"), suffix: ".parity.ts" },
    ];
    let checkedCount = 0;
    for (const { dir, suffix } of roots) {
      for (const fileName of readdirSync(dir)) {
        if (!fileName.endsWith(suffix)) continue;
        checkedCount += 1;
        const source = readFileSync(path.join(dir, fileName), "utf8");
        assert(
          /export function register\(/.test(source),
          `${path.join(path.basename(dir), fileName)} does not export register(harness) — the runner's auto-discovery would silently error at import time instead of registering real coverage`,
        );
      }
    }
    assert(checkedCount >= 3, `expected to check at least 3 suite files across fixtures/boundaries/parity, checked ${checkedCount}`);
  });

  harness.check(
    "all suites registered: every file under checks/verification/scenarios/ (the LaunchBench port) is imported and registered by checks/verification/fixtures/scenarios.fixtures.ts",
    () => {
      const scenariosDir = path.join(skillRoot, "checks/verification/scenarios");
      const registrySource = readFileSync(path.join(skillRoot, "checks/verification/fixtures/scenarios.fixtures.ts"), "utf8");
      const scenarioFiles = readdirSync(scenariosDir).filter((name) => name.endsWith(".ts") && !name.startsWith("_"));
      assert(scenarioFiles.length > 0, "expected at least one ported scenario file under checks/verification/scenarios/");
      for (const fileName of scenarioFiles) {
        const moduleStem = fileName.replace(/\.ts$/, "");
        assert(
          registrySource.includes(`../scenarios/${moduleStem}.js`),
          `checks/verification/scenarios/${fileName} exists but is not imported by scenarios.fixtures.ts — it would silently never run`,
        );
      }
    },
  );

  // --- shard-pool: the audit's two slow steps parallelize INSIDE their runners ------------------

  harness.check(
    "shard-pool: test:validators and test:fixtures stay serial:true in both audit-plan layouts — their parallelism lives inside the runner (tooling/lib/shard-pool.ts), and letting them also ride the 4-wide audit pool would multiply the process fan-out",
    () => {
      for (const layout of ["repo", "skill"] as const) {
        for (const id of ["test:validators", "test:fixtures"]) {
          const step = buildAuditPlan(layout).find((candidate) => candidate.id === id);
          assert(step !== undefined, `expected ${id} to be a step in the ${layout} audit plan`);
          assert(step.serial === true, `${id} must stay serial:true in the ${layout} plan — see the shard-pool doc comment before "fixing" this`);
        }
        const lint = buildAuditPlan(layout).find((candidate) => candidate.id === "launchbench:lint");
        assert(lint !== undefined, `expected launchbench:lint to be a step in the ${layout} audit plan`);
        assert(lint.serial !== true, "launchbench:lint is YAML-only and must stay in the fast pool");
        assert(
          buildAuditPlan(layout).every((step) => step.id !== "launchbench"),
          "npm run launchbench is the convenience alias, not an audit step",
        );
      }
    },
  );

  harness.check("audit lanes: fast skips serial suites; heavy skips the cheap pool; typecheck runs on both", () => {
    const plan = buildAuditPlan("repo");
    const lint = plan.find((step) => step.id === "launchbench:lint")!;
    const validators = plan.find((step) => step.id === "test:validators")!;
    const tsc = plan.find((step) => step.kind === "tsc")!;
    const e2e = plan.find((step) => step.id === "check:engine-e2e")!;
    assert(stepSkippedByLane(lint, "fast") === undefined, "fast lane must run launchbench:lint");
    assert(stepSkippedByLane(validators, "fast") === "heavy lane (--lane fast)", "fast lane must skip test:validators");
    assert(stepSkippedByLane(e2e, "fast") === "heavy lane (--lane fast)", "fast lane must skip engine e2e");
    assert(stepSkippedByLane(tsc, "fast") === undefined && stepSkippedByLane(tsc, "heavy") === undefined, "tsc is the compile barrier on every lane");
    assert(stepSkippedByLane(validators, "heavy") === undefined, "heavy lane must run test:validators");
    assert(stepSkippedByLane(lint, "heavy") === "fast lane (--lane heavy)", "heavy lane must skip launchbench:lint");
    assert(stepSkippedByLane(e2e, "all") === undefined, "lane all skips nothing");
    assert(
      stepSkippedByLane(validators, "presubmit") === "deferred until full verification (--lane presubmit)",
      "presubmit must not run test:validators",
    );
    assert(stepSkippedByLane(tsc, "presubmit") === undefined, "presubmit still typechecks");
    assert(stepSkippedByLane(lint, "presubmit") === undefined, "presubmit runs launchbench:lint");
    const catalog = plan.find((step) => step.id === "check:catalog")!;
    assert(stepSkippedByLane(catalog, "presubmit") === undefined, "presubmit runs check:catalog");
    const boundaries = plan.find((step) => step.id === "test:boundaries")!;
    assert(
      stepSkippedByLane(boundaries, "presubmit") === "deferred until full verification (--lane presubmit)",
      "test:boundaries stays deferred on a docs-only presubmit",
    );
    assert(stepSkippedByLane(boundaries, "presubmit", ["boundaries"]) === undefined, "boundaries scope adds test:boundaries to presubmit");
    const publicApi = plan.find((step) => step.id === "test:public-api")!;
    assert(
      stepSkippedByLane(publicApi, "presubmit") === "deferred until full verification (--lane presubmit)",
      "test:public-api stays off the measured core path",
    );
    assert(stepSkippedByLane(publicApi, "presubmit", ["public-api"]) === undefined, "public-api scope adds test:public-api to presubmit");
  });

  harness.check("ci-lane: knowledge and docs stay on the fast lane; engine paths select heavy; dispatch fail-closes to heavy", () => {
    const script = path.join(skillRoot, "tooling/ci-lane.mjs");
    const run = (args: string[], env: NodeJS.ProcessEnv = {}) =>
      spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: "utf8", env: { ...process.env, ...env } });

    const knowledge = run(["--files", "knowledge/store/aso-apple-keyword-evidence.md", "docs/validators.md"]);
    assert(knowledge.status === 0 && knowledge.stdout.includes("heavy=false"), `knowledge/docs must be fast, got:\n${knowledge.stdout}\n${knowledge.stderr}`);

    const engine = run(["--files", "kernel/session/run.ts"]);
    assert(engine.status === 0 && engine.stdout.includes("heavy=true"), `kernel/ must be heavy, got:\n${engine.stdout}`);

    const lockfile = run(["--files", "package-lock.json", "package-lock.json"]);
    assert(lockfile.status === 0 && lockfile.stdout.includes("heavy=false"), `lockfile-only Dependabot bumps must be fast, got:\n${lockfile.stdout}`);

    const workflow = run(["--files", ".github/workflows/ci.yml"]);
    assert(workflow.status === 0 && workflow.stdout.includes("heavy=true"), `ci.yml must be heavy, got:\n${workflow.stdout}`);

    const dispatch = run([], { EVENT_NAME: "workflow_dispatch", BASE_SHA: "", HEAD_SHA: "" });
    assert(dispatch.status === 0 && dispatch.stdout.includes("heavy=true"), `workflow_dispatch must be heavy, got:\n${dispatch.stdout}`);
  });

  harness.check("launchbench --lint-only stops after YAML lint and does not spawn the validator fixture suite", () => {
    const result = spawnSync(tsxBin, [path.join(skillRoot, "checks/validation/repository/run-launchbench.ts"), "--lint-only"], {
      cwd: skillRoot,
      encoding: "utf8",
    });
    assert(result.status === 0, `expected launchbench --lint-only to pass, got ${result.status}:\n${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert(output.includes("LaunchBench scenario definition lint"), `expected the lint report, got:\n${output}`);
    assert(!output.includes(SHARD_RESULT_MARKER), "lint-only must not run sharded validator fixtures");
  });

  harness.check("audit plan: all gates read current reducer-owned JSON state", () => {
    const stateArg = (layout: "repo" | "skill", id: string, businessRoot?: string): string | undefined => {
      const plan = businessRoot ? buildAuditPlan(layout, { businessRoot, skillRoot }) : buildAuditPlan(layout);
      const args = plan.find((step) => step.id === id)?.args ?? [];
      const index = args.indexOf("--state");
      return index >= 0 ? args[index + 1] : undefined;
    };

    for (const layout of ["repo", "skill"] as const) {
      assert(stateArg(layout, "check:research") === "state/business-state.json", `${layout} maintainer research gate must keep the current reference state`);
      assert(
        stateArg(layout, "check:design-worthiness") === "state/business-state.json",
        `${layout} maintainer design-worthiness gate must receive the current reference state`,
      );
    }

    const runtimeRoot = "/tmp/b2c-runtime-audit-fixture";
    assert(stateArg("repo", "check:research", runtimeRoot) === "state/business-state.json", "runtime research gate must read reducer-owned v2 state");
    assert(
      stateArg("repo", "check:design-worthiness", runtimeRoot) === "state/business-state.json",
      "runtime design-worthiness gate must receive reducer-owned v2 state",
    );

    const priorBusinessRoot = process.env.BUSINESS_ROOT;
    try {
      process.env.BUSINESS_ROOT = runtimeRoot;
      assert(
        parseCliArgs([]).statePath === path.join(runtimeRoot, "state/business-state.json"),
        "an audit-excluded runtime gate must default to v2 through BUSINESS_ROOT",
      );
      assert(
        parseCliArgs(["--state", "state/business-state.json"]).statePath === path.join(runtimeRoot, "state/business-state.json"),
        "an explicit --state value must still override the runtime default",
      );
    } finally {
      if (priorBusinessRoot === undefined) delete process.env.BUSINESS_ROOT;
      else process.env.BUSINESS_ROOT = priorBusinessRoot;
    }
  });

  harness.check("loadProjectState: validates current state without changing statuses or adding aliases", () => {
    const root = harness.makeTempDir("current-project-state");
    const stateDir = path.join(root, "state");
    mkdirSync(stateDir, { recursive: true });
    const statusCases: Array<[Status, string]> = [
      ["succeeded", "succeeded"],
      ["pending", "pending"],
      ["ready", "ready"],
      ["running", "running"],
      ["needs_readback", "needs_readback"],
      ["stale", "stale"],
      ["waiting_founder", "waiting_founder"],
      ["blocked", "blocked"],
      ["orphaned", "orphaned"],
      ["failed", "failed"],
      ["skipped", "skipped"],
      ["cancelled", "cancelled"],
      ["not_needed", "not_needed"],
      ["deferred", "deferred"],
    ];
    const lanes = Object.fromEntries(
      laneKeys.map((lane, index) => {
        const status = statusCases[index % statusCases.length]![0];
        return [lane, { status, evidence: [], blockers: [], fixtureExtra: `kept-${status}` }];
      }),
    );
    const document = {
      schemaVersion: "2.0.0",
      updatedAt: "2026-09-01T12:00:00.000Z",
      narrative: { sinceLastTime: "Research completed.", rightNow: "Design is next.", yourCall: "Nothing now.", lastCelebratedPhase: "phase_1" },
      project: {
        name: "Fixture App",
        slug: "fixture-app",
        owner: "Daisy Rivera",
        phase: "phase_1_research",
        launchScope: "essentials",
        kickoffDate: "2026-09-01",
        platforms: ["ios"],
        bundleIds: { ios: "com.example.fixture", android: "" },
        publicUrls: { landing: "https://example.test", privacy: "", terms: "" },
        repositoryProfile: { id: "app-source", revision: "1", acceptedAt: "2026-09-01" },
      },
      lanes,
      founderGates: { pending: [] },
      providers: {
        posthog: {
          accessRoute: "api",
          route: "existing account",
          docsCheckedAt: "2026-09-01",
          requiredSecrets: ["POSTHOG_API_KEY"],
          fixtureExtra: "kept-provider-extra",
        },
      },
    };
    const statePath = path.join(stateDir, "business-state.json");
    const raw = `${JSON.stringify(document, null, 2)}\n`;
    writeFileSync(statePath, raw, "utf8");

    const loaded = loadProjectState({ root, statePath });
    assert(loaded.issues.length === 0, `expected valid v2 state, got ${JSON.stringify(loaded.issues)}`);
    assert(loaded.raw === raw, "loader must preserve the raw v2 document");
    for (const [index, lane] of laneKeys.entries()) {
      const [canonical, expected] = statusCases[index % statusCases.length]!;
      assert(getPath(loaded.state, `lanes.${lane}.status`) === expected, `${canonical} must map to ${expected}`);
      assert(getPath(loaded.state, `lanes.${lane}.fixtureExtra`) === `kept-${canonical}`, `${lane} must preserve lane extras`);
    }
    assert(JSON.stringify(loaded.state) === JSON.stringify(document), "loading must preserve current state exactly");

    writeFileSync(statePath, '{"schemaVersion":"2.0.0"}\n', "utf8");
    const invalid = loadProjectState({ root, statePath });
    assert(invalid.state === undefined, "an invalid document must not expose unvalidated state");
    assert(
      invalid.issues.some((entry) => entry.code === "project_state.invalid_schema"),
      "schema-invalid v2 state must fail by name",
    );

    const unsupportedPath = path.join(stateDir, "unsupported.yaml");
    writeFileSync(unsupportedPath, "project: {}\n", "utf8");
    const unsupported = loadProjectState({ root, statePath: unsupportedPath });
    assert(unsupported.state === undefined, "unsupported state must never be accepted");
    assert(
      unsupported.issues.some((entry) => entry.code === "project_state.unsupported_format"),
      "unsupported state format must be refused",
    );
  });

  harness.check(
    "shard-pool: parseShardOutput distinguishes crashed-before-reporting (results undefined) from reported results — the load-bearing crash-representation property of the sharded runners",
    () => {
      const reported = parseShardOutput(`stray diagnostics\n${SHARD_RESULT_MARKER}[{"label":"x","ok":true}]\ntrailing noise`);
      assert(Array.isArray(reported.results) && reported.results.length === 1, "expected the marker payload to parse to exactly one result");
      assert(!reported.output.includes(SHARD_RESULT_MARKER), "expected the marker line to be stripped from the diagnostic output");
      const crashed = parseShardOutput("boom: a stack trace and no marker line\n");
      assert(crashed.results === undefined, "a shard with no marker line must parse as crashed (undefined results), never as empty-and-passing");
      const malformed = parseShardOutput(`${SHARD_RESULT_MARKER}{not json]`);
      assert(malformed.results === undefined, "a malformed marker payload must parse as crashed (undefined results), never as empty-and-passing");
    },
  );

  harness.runScript(
    "shard-pool: the validator-fixture runner rejects an unknown --shard name with a named error instead of reporting an empty pass",
    path.join(skillRoot, "checks/validation/repository/run-validator-fixtures.ts"),
    ["--shard", "no-such-module"],
    1,
    "Unknown fixture module",
  );
}
