import { initializeProductFixture } from "./product-fixture.js";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { laneKeys, type BusinessStateV2, type Lane, type LaneKey } from "../../../kernel/schema/types.js";
import { compilePlan, type CatalogInput } from "../../../kernel/engine/compile.js";
import { seedRunState } from "../../../kernel/engine/runstate.js";
import { acquireLock, releaseLock } from "../../../kernel/reducer/lock.js";
import { computeFrontier, allowAllAutonomyEvaluator } from "../../../kernel/engine/frontier.js";
import { buildDispatchBatches } from "../../../kernel/engine/dispatch.js";
import { founderFacingRuntimeIds, wrapWithWallClock, type SessionInvocation, type SpawnResult } from "../../../adapters/profile.js";
import { createClaudeProfile, probeClaudeAvailability, smokeClaudeTest } from "../../../adapters/claude.js";
import { createCodexProfile, probeCodexAvailability, smokeCodexTest } from "../../../adapters/codex.js";
import { createCursorProfile, smokeCursorTest } from "../../../adapters/cursor.js";
import { createInlineProfile, buildInlineHeadlessCommand } from "../../../adapters/inline.js";
import {
  applyCrontabInstall,
  applyCrontabUninstall,
  checkClaudeSandboxSetting,
  crontabHasExactLine,
  crontabHasSignature,
  crontabHasWorkspaceSignature,
  crontabSignature,
  launchdLabel,
  launchdPlistHasExactContent,
  launchdPlistHasLabel,
  launchdPlistPath,
  renderCrontabLine,
  renderLaunchdPlist,
  renderWrapperScript,
  scheduleMutationLockPath,
  translateCronToLaunchd,
  withScheduleMutationLock,
  type ScheduleOptions,
} from "../../../adapters/install-schedule.js";
import {
  applyTemplateVars,
  CLAUDE_SETTINGS_RELATIVE_PATH,
  ENTRYPOINT_FILES,
  mergeTemplateDenyList,
  parseTemplateDenyList,
  stripManagedHookEntries,
  type HookSettings,
} from "../../../adapters/install-entrypoints.js";
import type { RuntimeCapabilityProfile } from "../../../adapters/profile.js";

/**
 * U6 adapter fixtures: capability profiles + headless command construction, the scheduler
 * installer, and the entrypoint installer. NO fixture here ever invokes a real vendor CLI
 * (claude/codex/cursor-agent) or the real `crontab`/`launchctl` system services — every
 * availability/smoke probe below injects a fake spawn function, and every install-schedule
 * assertion works against the pure render/apply functions or against install-schedule.ts run in
 * (default) --dry-run mode. The one real probe pass lives entirely in adapters/probe.ts, run
 * once by hand outside this suite.
 */

function resolveTsxBin(): string {
  const candidates = [path.join(skillRoot, "node_modules/.bin/tsx"), path.resolve(skillRoot, "../..", "node_modules/.bin/tsx")];
  return candidates.find((candidate) => existsSync(candidate)) ?? "tsx";
}
const tsxBin = resolveTsxBin();

function runCli(scriptRelative: string, args: string[]): { code: number; output: string } {
  const result = spawnSync(tsxBin, [path.join(skillRoot, scriptRelative), ...args], { cwd: skillRoot, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function fakeSpawn(status: number | null, stdout: string, stderr: string, error?: NodeJS.ErrnoException): () => SpawnResult {
  return () => ({ status, stdout, stderr, error });
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error("spawn ENOENT") as NodeJS.ErrnoException;
  err.code = "ENOENT";
  return err;
}

const PROFILES: readonly RuntimeCapabilityProfile[] = [createClaudeProfile(), createCodexProfile(), createCursorProfile()];

function minimalBusinessState(slug: string): BusinessStateV2 {
  const lanes = {} as Record<LaneKey, Lane>;
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return {
    schemaVersion: "2.0.0",
    updatedAt: "2026-08-05T00:00:00.000Z",
    narrative: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" },
    project: {
      name: slug,
      slug,
      owner: "Founder",
      phase: "phase_0_orient",
      launchScope: "essentials",
      kickoffDate: "",
      platforms: ["ios"],
      bundleIds: { ios: "com.example.app", android: "" },
      publicUrls: { landing: "", privacy: "", terms: "" },
    },
    lanes,
    founderGates: { pending: [] },
  };
}

function twoNodeCatalog(): CatalogInput {
  return {
    version: "catalog.adapters-fixture",
    artifacts: [
      { id: "artifact.growth-scan", path: "growth/scan.md" },
      { id: "artifact.eng-change", path: "engineering/change.log" },
    ],
    workflows: [
      {
        id: "workflow.growth-scan",
        title: "Scan what people are saying",
        domainId: "domain.growth",
        actionClass: "observe",
        dependencies: [],
        outputPaths: ["growth/scan.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
      {
        id: "workflow.eng-change",
        title: "Update the onboarding copy",
        domainId: "domain.engineering",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["engineering/change.log"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

export function register(harness: Harness): void {
  // --- profile shape: tool allowlist honesty (KTD7) -------------------------------------------

  harness.check(
    "adapters: every founder-facing profile's toolAllowlist covers the reducer-owned paths and names its own enforcementGaps (never silent enforcement)",
    () => {
      for (const profile of PROFILES) {
        const patterns = profile.toolAllowlist.deniedPathPatterns;
        assert(
          patterns.includes("control/**"),
          `${profile.runtime}: deniedPathPatterns must cover control/** (control.json/grants/waivers/budget-ledger.json/manifest.json/audit.jsonl), got ${JSON.stringify(patterns)}`,
        );
        assert(
          patterns.includes("state/business-state.json"),
          `${profile.runtime}: deniedPathPatterns must cover state/business-state.json (also reducer-owned), got ${JSON.stringify(patterns)}`,
        );
        assert(
          patterns.includes("state/current-truth.json"),
          `${profile.runtime}: deniedPathPatterns must cover state/current-truth.json (also reducer-owned), got ${JSON.stringify(patterns)}`,
        );
        assert(
          profile.toolAllowlist.enforcementGaps.length > 0,
          `${profile.runtime}: a CLI-backed profile must name at least one enforcementGap rather than silently claim airtight enforcement`,
        );
        assert(profile.authEnvVar && profile.authEnvVar.length > 0, `${profile.runtime}: must declare its own authEnvVar`);
      }
    },
  );

  harness.check("adapters: the inline profile has no external tool surface, so an empty enforcementGaps is legitimate there and only there", () => {
    const inline = createInlineProfile();
    assert(inline.toolAllowlist.mode === "no-external-surface", `inline profile should be mode "no-external-surface", got "${inline.toolAllowlist.mode}"`);
    assert(
      inline.toolAllowlist.enforcementGaps.length === 0,
      "inline profile's enforcementGaps should be empty: it never spawns a shell or exposes a tool an LLM could misuse",
    );
    for (const profile of PROFILES)
      assert(profile.toolAllowlist.mode !== "no-external-surface", `${profile.runtime} is a real CLI-backed profile and must not claim "no-external-surface"`);
  });

  // --- headless command construction: brief by path, session id + workspace present, wall-clock -

  harness.check(
    "adapters: buildHeadlessCommand never inlines the brief's content — only its file path — and always carries session id, workspace, and the wall-clock cap through to the inner run.ts call",
    () => {
      const invocation: SessionInvocation = {
        workspaceDir: "/tmp/adapters-fixture-workspace",
        briefPath: "/tmp/adapters-fixture-workspace/brief.json",
        sessionId: "sess-adapters-fixture-1",
        wallClockSeconds: 1234,
      };
      const secretMarker = "founder@example.com-should-never-appear-in-argv";

      for (const profile of [...PROFILES, createInlineProfile()]) {
        const headless = profile.buildHeadlessCommand(invocation);
        const joined = headless.args.join(" \u0000 ");
        assert(
          !joined.includes(secretMarker),
          `${profile.runtime}: a brief-content marker leaked into argv (it must only ever appear inside the brief file, never inline)`,
        );
        assert(joined.includes(invocation.briefPath), `${profile.runtime}: expected the brief PATH to appear in the constructed command, got: ${joined}`);
        assert(joined.includes(invocation.workspaceDir), `${profile.runtime}: expected the workspace dir to appear, got: ${joined}`);
        assert(joined.includes(invocation.sessionId), `${profile.runtime}: expected the session id to appear, got: ${joined}`);
        assert(joined.includes(String(invocation.wallClockSeconds)), `${profile.runtime}: expected the wall-clock cap to appear, got: ${joined}`);
        assert(headless.command.length > 0, `${profile.runtime}: headless command must name a binary to run`);
      }
      const claudeArgs = createClaudeProfile().buildHeadlessCommand(invocation).args;
      assert(claudeArgs.includes("--bare"), "claude headless sessions keep --bare so they skip hooks and plugins");
      const codexArgs = createCodexProfile().buildHeadlessCommand(invocation).args;
      assert(codexArgs.includes("--skip-git-repo-check"), "codex headless sessions skip the git-repo trust gate for registered workspaces");
    },
  );

  harness.check("adapters: wrapWithWallClock prefers a real 'timeout' binary when present on PATH", () => {
    const invocation: SessionInvocation = { workspaceDir: "/tmp/w", briefPath: "/tmp/w/brief.json", sessionId: "sess-1", wallClockSeconds: 900 };
    const onlyTimeout = (command: string) => command === "timeout";
    for (const profile of PROFILES) {
      const headless = profile.buildHeadlessCommand(invocation);
      const wrapped = wrapWithWallClock(headless, 900, onlyTimeout);
      assert(wrapped.command === "timeout", `${profile.runtime}: expected the timeout wrapper, got command "${wrapped.command}"`);
      assert(wrapped.osLevelEnforced === true, `${profile.runtime}: expected osLevelEnforced true when 'timeout' is on PATH`);
      assert(wrapped.enforcementGap === undefined, `${profile.runtime}: expected no enforcementGap when 'timeout' is on PATH`);
      assert(wrapped.args[0] === "900s", `${profile.runtime}: expected a 900s timeout arg, got "${wrapped.args[0]}"`);
      assert(wrapped.args[1] === headless.command, `${profile.runtime}: expected the wrapped inner command to be preserved`);
    }
  });

  harness.check("adapters: wrapWithWallClock falls back to 'gtimeout' (macOS coreutils) when 'timeout' is absent but 'gtimeout' is present", () => {
    const invocation: SessionInvocation = { workspaceDir: "/tmp/w", briefPath: "/tmp/w/brief.json", sessionId: "sess-2", wallClockSeconds: 300 };
    const onlyGtimeout = (command: string) => command === "gtimeout";
    const headless = createClaudeProfile().buildHeadlessCommand(invocation);
    const wrapped = wrapWithWallClock(headless, 300, onlyGtimeout);
    assert(wrapped.command === "gtimeout", `expected the gtimeout fallback, got command "${wrapped.command}"`);
    assert(wrapped.osLevelEnforced === true, "expected osLevelEnforced true when 'gtimeout' is on PATH");
    assert(wrapped.enforcementGap === undefined, "expected no enforcementGap when a usable timeout binary is on PATH");
    assert(wrapped.args[0] === "300s" && wrapped.args[1] === headless.command, "expected gtimeout to wrap the inner command the same way timeout would");
  });

  harness.check(
    "adapters: wrapWithWallClock emits the command unwrapped (never fails) when neither 'timeout' nor 'gtimeout' is on PATH, and names the gap",
    () => {
      const invocation: SessionInvocation = { workspaceDir: "/tmp/w", briefPath: "/tmp/w/brief.json", sessionId: "sess-3", wallClockSeconds: 120 };
      const neither = () => false;
      for (const profile of PROFILES) {
        const headless = profile.buildHeadlessCommand(invocation);
        const wrapped = wrapWithWallClock(headless, 120, neither);
        assert(
          wrapped.command === headless.command && wrapped.args === headless.args,
          `${profile.runtime}: expected the unwrapped inner command when no timeout binary is available`,
        );
        assert(wrapped.osLevelEnforced === false, `${profile.runtime}: expected osLevelEnforced false with neither binary on PATH`);
        assert(
          Boolean(wrapped.enforcementGap) && /timeout/.test(wrapped.enforcementGap!),
          `${profile.runtime}: expected a named enforcementGap explaining the missing OS-level cap, got: ${wrapped.enforcementGap}`,
        );
      }
    },
  );

  harness.check(
    "adapters: wrapWithWallClock leaves the inline profile's command untouched regardless of what's on PATH (wallClockEnforcedBy: not-applicable)",
    () => {
      const invocation: SessionInvocation = { workspaceDir: "/tmp/w", briefPath: "/tmp/w/brief.json", sessionId: "sess-4", wallClockSeconds: 900 };
      const inlineHeadless = buildInlineHeadlessCommand(invocation);
      const inlineWrapped = wrapWithWallClock(inlineHeadless, 900, () => false);
      assert(
        inlineWrapped.command === inlineHeadless.command && inlineWrapped.args === inlineHeadless.args,
        "inline's command should pass through wrapWithWallClock unchanged",
      );
      assert(inlineWrapped.osLevelEnforced === false, "inline was never wrapper-enforced in the first place");
      assert(inlineWrapped.enforcementGap === undefined, "inline should never report an enforcementGap — no wrapper was ever expected for it");
    },
  );

  // --- parity: reachability is profile-invariant; profiles differ only in concurrency ----------

  harness.check(
    "adapters: parity — node reachability is identical across every capability profile; profiles differ only in concurrency (never in which nodes are reachable)",
    () => {
      const catalog = twoNodeCatalog();
      const plan = compilePlan(catalog, "2026-08-05T00:00:00.000Z");
      const businessState = minimalBusinessState("adapters-parity-fixture");
      const run = seedRunState(plan, businessState, {
        ownerSessionId: "adapters-fixture",
        ttlSeconds: 300,
        wallClockCapSeconds: 1800,
        now: "2026-08-05T00:00:00.000Z",
      });

      // computeFrontier does not take a profile at all — reachability is a pure function of the
      // plan/run/state/autonomy-evaluator. That is the parity guarantee, made structurally true
      // rather than merely asserted: there is no profile-shaped input for it to vary on.
      const frontier = computeFrontier(plan, run, businessState, allowAllAutonomyEvaluator);
      assert(frontier.ready.length === 2, `expected both fixture nodes ready, got ${JSON.stringify(frontier.ready)}`);

      const maxConcurrencies = new Set<number>();
      for (const profile of PROFILES) {
        const batches = buildDispatchBatches(plan, frontier.ready, profile.maxConcurrency);
        const dispatched = batches.flatMap((batch) => batch.nodeIds).sort();
        assert(
          JSON.stringify(dispatched) === JSON.stringify([...frontier.ready].sort()),
          `${profile.runtime}: dispatched node set must equal the frontier's ready set regardless of concurrency, got ${JSON.stringify(dispatched)}`,
        );
        maxConcurrencies.add(profile.maxConcurrency);
      }
      assert(
        maxConcurrencies.size > 1,
        "expected at least two distinct maxConcurrency values across profiles — otherwise this parity test can't tell 'differs only in concurrency' from 'differs in nothing'",
      );
    },
  );

  // --- auth-expiry simulation: named failure, never a silent no-op -----------------------------

  harness.check("adapters: an auth failure from the smoke test is classified as a named auth_failed result, not a silent no-op or a generic crash", () => {
    const claudeAuthFail = smokeClaudeTest(fakeSpawn(1, "", "Error: Invalid API key. Please log in again."));
    assert(claudeAuthFail.status === "auth_failed", `expected auth_failed, got "${claudeAuthFail.status}": ${claudeAuthFail.detail}`);
    assert(claudeAuthFail.detail.length > 0, "an auth failure must carry a non-empty detail string, not just a bare status");

    const codexAuthFail = smokeCodexTest(fakeSpawn(1, "", "401 Unauthorized: token expired"));
    assert(codexAuthFail.status === "auth_failed", `expected auth_failed for codex, got "${codexAuthFail.status}"`);

    const cursorAuthFail = smokeCursorTest(fakeSpawn(1, "", "not logged in — run `cursor-agent login`"));
    assert(cursorAuthFail.status === "auth_failed", `expected auth_failed for cursor, got "${cursorAuthFail.status}"`);
  });

  harness.check(
    "adapters: a missing CLI is classified as not_found (never confused with an auth failure), and a real success is classified as available/ok",
    () => {
      const missing = probeClaudeAvailability(fakeSpawn(null, "", "", enoent()));
      assert(missing.status === "not_found", `expected not_found for a missing binary, got "${missing.status}"`);

      const available = probeClaudeAvailability(fakeSpawn(0, "1.2.3\n", ""));
      assert(available.status === "available" && available.version === "1.2.3", `expected available/1.2.3, got ${JSON.stringify(available)}`);

      const ok = smokeClaudeTest(fakeSpawn(0, "OK\n", ""));
      assert(ok.status === "ok", `expected ok, got "${ok.status}"`);

      const genericError = probeCodexAvailability(fakeSpawn(1, "", "internal error: segfault"));
      assert(genericError.status === "error", `expected a generic error to classify as "error" (not auth_failed, not not_found), got "${genericError.status}"`);
    },
  );

  // --- install-schedule: dry-run content, uninstall-exactly-reverses ---------------------------

  harness.check("adapters/install-schedule: renders a correct crontab line, and uninstall exactly reverses install (foreign lines survive both)", () => {
    const dir = harness.makeTempDir("schedule-cron");
    const options: ScheduleOptions = {
      workspaceDir: dir,
      runtime: "claude",
      schedule: "*/30 * * * *",
      briefPath: path.join(dir, "brief.json"),
      wallClockSeconds: 1800,
      skillRoot,
      wrapperPath: path.join(dir, "schedule", "run-claude.mts"),
      logPath: path.join(dir, "schedule", "run-claude.log"),
      workspaceSlug: "adapters-fixture-biz",
    };

    const line = renderCrontabLine(options);
    assert(line.startsWith(options.schedule), `expected the line to start with the schedule, got: ${line}`);
    assert(line.includes(options.wrapperPath), `expected the wrapper path in the line, got: ${line}`);
    assert(line.includes(`# ${crontabSignature(options)}`), `expected the signature comment, got: ${line}`);

    const foreignLine = "0 3 * * * /usr/bin/some-other-job.sh # unrelated";
    const foreignContainsManagedText = `0 4 * * * echo "# ${crontabSignature(options)}" # unrelated`;
    const otherWorkspaceOptions: ScheduleOptions = { ...options, workspaceSlug: "other-workspace" };
    const otherWorkspaceLine = renderCrontabLine(otherWorkspaceOptions);
    const installed = applyCrontabInstall(`${foreignLine}\n${foreignContainsManagedText}\n${otherWorkspaceLine}\n`, options);
    assert(installed.nextContent.includes(foreignLine), "install must preserve a pre-existing foreign crontab line");
    assert(installed.nextContent.includes(foreignContainsManagedText), "install must preserve managed-looking text inside a foreign command");
    assert(installed.nextContent.includes(otherWorkspaceLine), "install must preserve another workspace's managed entry");
    assert(installed.nextContent.includes(line), "install must add our line");
    assert(crontabHasSignature(installed.nextContent, crontabSignature(options)), "readback must recognize the managed entry by its exact signature");
    assert(crontabHasExactLine(installed.nextContent, line), "readback must recognize the exact requested cadence/runtime/target line");
    assert(
      !crontabHasExactLine(installed.nextContent, renderCrontabLine({ ...options, schedule: "*/15 * * * *" })),
      "a concurrent cadence change must not pass exact-line readback",
    );
    assert(
      !crontabHasExactLine(
        installed.nextContent,
        renderCrontabLine({
          ...options,
          wrapperPath: path.join(dir, "schedule", "run-claude-other-target.mts"),
          logPath: path.join(dir, "schedule", "run-claude-other-target.log"),
        }),
      ),
      "a changed wrapper or log target must not pass the prior exact-line readback",
    );
    assert(crontabHasSignature(installed.nextContent, crontabSignature(otherWorkspaceOptions)), "readback must preserve another workspace's entry without treating it as ours");

    // Reinstalling with a different schedule replaces (never duplicates) our own line.
    const changedOptions: ScheduleOptions = { ...options, schedule: "0 * * * *" };
    const reinstalled = applyCrontabInstall(installed.nextContent, changedOptions);
    const ourLines = reinstalled.nextContent.split("\n").filter((entry) => crontabHasSignature(entry, crontabSignature(options)));
    assert(
      ourLines.length === 1,
      `expected exactly one of our lines after reinstalling with a changed schedule, got ${ourLines.length}: ${reinstalled.nextContent}`,
    );
    assert(ourLines[0]!.startsWith("0 * * * *"), `expected the reinstalled line to carry the new schedule, got: ${ourLines[0]}`);

    const changedRuntime: ScheduleOptions = { ...changedOptions, runtime: "codex", wrapperPath: path.join(dir, "schedule", "run-codex.mts") };
    const runtimeReinstalled = applyCrontabInstall(reinstalled.nextContent, changedRuntime);
    const managedLines = runtimeReinstalled.nextContent.split("\n").filter((entry) => crontabHasSignature(entry, "b2c:adapters-fixture-biz:codex"));
    assert(managedLines.length === 1, `changing runtime must replace the prior managed entry, got ${managedLines.length}: ${runtimeReinstalled.nextContent}`);
    assert(managedLines[0]!.includes(":codex"), `changed runtime must be reflected in the managed signature, got ${managedLines[0]}`);

    const uninstalled = applyCrontabUninstall(installed.nextContent, options);
    assert(
      uninstalled.nextContent === `${foreignLine}\n${foreignContainsManagedText}\n${otherWorkspaceLine}\n`,
      `expected uninstall to leave unrelated and other-workspace entries, got: ${JSON.stringify(uninstalled.nextContent)}`,
    );
    assert(uninstalled.removed.length === 1 && uninstalled.removed[0] === line, "expected uninstall to report exactly the one line it removed");

    const runtimeUninstalled = applyCrontabUninstall(runtimeReinstalled.nextContent, changedRuntime);
    assert(
      runtimeUninstalled.removed.length === 1 && runtimeUninstalled.removed[0]!.includes(":codex"),
      "uninstall must remove the current managed runtime entry",
    );
    assert(!crontabHasWorkspaceSignature(runtimeUninstalled.nextContent, options.workspaceSlug), "workspace readback must reject any leftover runtime variant");
    assert(!crontabHasSignature(uninstalled.nextContent, crontabSignature(options)), "readback must confirm the managed entry is gone after uninstall");

    // Reversal with no foreign lines at all: install then uninstall nets back to empty.
    const cleanInstall = applyCrontabInstall("", options);
    const cleanUninstall = applyCrontabUninstall(cleanInstall.nextContent, options);
    assert(cleanUninstall.nextContent === "", `expected uninstall to exactly reverse a clean install, got: ${JSON.stringify(cleanUninstall.nextContent)}`);
  });

  harness.check("adapters/install-schedule: concurrent schedule mutation is refused by the shared user-level lock", () => {
    const home = harness.makeTempDir("schedule-lock");
    const lockPath = scheduleMutationLockPath(home);
    const holder = acquireLock(lockPath, { ownerSessionId: "other-schedule-installer", retries: 0, ttlSeconds: 120 });
    assert(holder.ok, "fixture must acquire the competing schedule lock");
    try {
      let ran = false;
      let message = "";
      try {
        withScheduleMutationLock(() => {
          ran = true;
        }, home);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      assert(!ran, "a competing schedule mutation must not enter its critical section");
      assert(message === "install-schedule.schedule_lock_held", `expected a held-lock refusal, got ${message}`);
    } finally {
      releaseLock(lockPath, "other-schedule-installer");
    }
    let completed = false;
    withScheduleMutationLock(() => {
      completed = true;
    }, home);
    assert(completed, "the schedule lock must be released after the competing owner exits");

    let failureMessage = "";
    try {
      withScheduleMutationLock(() => {
        throw new Error("fixture mutation failure");
      }, home);
    } catch (error) {
      failureMessage = error instanceof Error ? error.message : String(error);
    }
    assert(failureMessage === "fixture mutation failure", `expected the mutation error to surface, got ${failureMessage}`);
    let recovered = false;
    withScheduleMutationLock(() => {
      recovered = true;
    }, home);
    assert(recovered, "the shared schedule lock must be released when a mutation fails");
  });

  harness.check("adapters/install-schedule: translates the two supported cron shapes into launchd content and cleanly reports what it cannot translate", () => {
    const everyN = translateCronToLaunchd("*/15 * * * *");
    assert(everyN.kind === "interval" && everyN.seconds === 900, `expected a 900s interval, got ${JSON.stringify(everyN)}`);

    const daily = translateCronToLaunchd("5 9 * * *");
    assert(daily.kind === "calendar" && daily.hour === 9 && daily.minute === 5, `expected a 09:05 daily calendar entry, got ${JSON.stringify(daily)}`);

    const unsupported = translateCronToLaunchd("0 0 * * 1-5");
    assert(unsupported.kind === "unsupported" && unsupported.reason.length > 0, `expected an honest unsupported reason, got ${JSON.stringify(unsupported)}`);

    const dir = harness.makeTempDir("schedule-launchd");
    const options: ScheduleOptions = {
      workspaceDir: dir,
      runtime: "codex",
      schedule: "*/15 * * * *",
      briefPath: path.join(dir, "brief.json"),
      wallClockSeconds: 900,
      skillRoot,
      wrapperPath: path.join(dir, "schedule", "run-codex.mts"),
      logPath: path.join(dir, "schedule", "run-codex.log"),
      workspaceSlug: "adapters-fixture-biz-2",
    };
    const plist = renderLaunchdPlist(options);
    assert(plist.ok, `expected a supported schedule to render, got: ${JSON.stringify(plist)}`);
    if (plist.ok) {
      assert(plist.xml.includes(launchdLabel(options)), "expected the plist to carry its own Label");
      assert(launchdPlistHasLabel(plist.xml, launchdLabel(options)), "readback must recognize only the exact managed LaunchAgent label");
      assert(launchdPlistHasExactContent(plist.xml, plist.xml), "readback must accept the exact rendered managed plist");
      assert(!launchdPlistHasLabel(plist.xml, launchdLabel({ ...options, runtime: "cursor" })), "readback must not mistake another runtime's job for ours");
      const changedTarget = plist.xml.replace(options.wrapperPath, `${options.wrapperPath}.changed`);
      assert(!launchdPlistHasExactContent(changedTarget, plist.xml), "readback must reject a concurrent wrapper-target change with the same managed label");
      const changedCadence = plist.xml.replace("<integer>900</integer>", "<integer>1800</integer>");
      assert(!launchdPlistHasExactContent(changedCadence, plist.xml), "readback must reject a concurrent cadence change with the same managed label");
      assert(plist.xml.includes("StartInterval") && plist.xml.includes("900"), "expected a 900-second StartInterval");
      assert(plist.xml.includes(options.wrapperPath), "expected ProgramArguments to reference the wrapper script");
    }
    const badOptions: ScheduleOptions = { ...options, schedule: "0 0 * * 1-5" };
    const badPlist = renderLaunchdPlist(badOptions);
    assert(!badPlist.ok, "expected an unsupported schedule to fail plist rendering rather than silently approximate it");

    const plistPath = launchdPlistPath(options, "/tmp/adapters-fixture-home");
    assert(
      plistPath.startsWith("/tmp/adapters-fixture-home/Library/LaunchAgents/"),
      `expected the plist path under a fake home's LaunchAgents dir, got: ${plistPath}`,
    );
    assert(plistPath.endsWith(".plist"), `expected a .plist extension, got: ${plistPath}`);
  });

  harness.check(
    "adapters/install-schedule: the generated wrapper script builds the headless command through the same adapter module it schedules, never a re-derived duplicate",
    () => {
      const dir = harness.makeTempDir("schedule-wrapper");
      const options: ScheduleOptions = {
        workspaceDir: dir,
        runtime: "cursor",
        schedule: "*/10 * * * *",
        briefPath: path.join(dir, "brief.json"),
        wallClockSeconds: 600,
        skillRoot,
        wrapperPath: path.join(dir, "schedule", "run-cursor.mts"),
        logPath: path.join(dir, "schedule", "run-cursor.log"),
        workspaceSlug: "adapters-fixture-biz-3",
      };
      const script = renderWrapperScript(options);
      assert(script.includes("createCursorProfile"), `expected the wrapper to import the cursor profile factory, got:\n${script}`);
      assert(script.includes("adapters/cursor.ts"), "expected the wrapper to import from the cursor adapter module, not a duplicated copy");
      assert(script.includes("wrapWithWallClock"), "expected the wrapper to reuse the shared wall-clock wrapper, not reimplement timeout logic");
      assert(script.includes("kernel/session/catalog-contract.ts"), "expected the wrapper to use the canonical workspace catalog compatibility owner");
      assert(script.indexOf("const compatible") < script.indexOf("const result = spawnSync"), "expected catalog compatibility to be checked before the scheduled worker is spawned");
      assert(script.includes(JSON.stringify(options.workspaceDir)), "expected the workspace dir to be baked into the wrapper");
      assert(script.includes(String(options.wallClockSeconds)), "expected the wall-clock cap to be baked into the wrapper");
    },
  );

  harness.check("adapters/install-schedule CLI: --dry-run (the default) prints the plan and touches no real system, for both mechanisms", () => {
    const dir = harness.makeTempDir("schedule-cli-cron");
    writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(twoNodeCatalog()));
    const result = runCli("adapters/install-schedule.ts", [
      "--workspace",
      dir,
      "--runtime",
      "claude",
      "--schedule",
      "*/20 * * * *",
      "--brief",
      path.join(dir, "brief.json"),
    ]);
    assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);
    assert(result.output.includes("DRY RUN"), `expected a DRY RUN banner, got:\n${result.output}`);
    assert(result.output.includes("*/20 * * * *"), `expected the crontab line preview, got:\n${result.output}`);
    assert(!existsSync(path.join(dir, "schedule")), "cron install dry-run must not create the workspace schedule directory");

    const uninstallResult = runCli("adapters/install-schedule.ts", [
      "--workspace",
      dir,
      "--runtime",
      "claude",
      "--schedule",
      "*/20 * * * *",
      "--brief",
      path.join(dir, "brief.json"),
      "--uninstall",
    ]);
    assert(uninstallResult.code === 0, `expected exit 0, got ${uninstallResult.code}: ${uninstallResult.output}`);
    assert(uninstallResult.output.includes("DRY RUN"), `expected a DRY RUN banner on uninstall too, got:\n${uninstallResult.output}`);
    assert(!existsSync(path.join(dir, "schedule")), "cron uninstall dry-run must not create the workspace schedule directory");

    const launchdDir = harness.makeTempDir("schedule-cli-launchd");
    writeFileSync(path.join(launchdDir, "catalog.json"), JSON.stringify(twoNodeCatalog()));
    const launchdResult = runCli("adapters/install-schedule.ts", [
      "--workspace",
      launchdDir,
      "--runtime",
      "codex",
      "--schedule",
      "*/5 * * * *",
      "--brief",
      path.join(launchdDir, "brief.json"),
      "--mechanism",
      "launchd",
    ]);
    assert(launchdResult.code === 0, `expected exit 0, got ${launchdResult.code}: ${launchdResult.output}`);
    assert(launchdResult.output.includes("launchd"), `expected launchd content in the preview, got:\n${launchdResult.output}`);
    assert(!existsSync(path.join(launchdDir, "schedule")), "launchd install dry-run must not create the workspace schedule directory");

    const missingArgs = runCli("adapters/install-schedule.ts", ["--runtime", "claude"]);
    assert(missingArgs.code === 1, `expected exit 1 with a missing --workspace, got ${missingArgs.code}: ${missingArgs.output}`);
  });

  harness.check("adapters/install-schedule: checkClaudeSandboxSetting warns and reports sandboxed:false unless sandbox.enabled is true", () => {
    const missing = checkClaudeSandboxSetting(undefined);
    assert(missing.sandboxed === false, `expected sandboxed:false with no settings.json, got ${JSON.stringify(missing)}`);
    assert(!!missing.warning?.includes('"sandbox": { "enabled": true'), `expected the warning to name the exact fix, got: ${missing.warning}`);

    const disabled = checkClaudeSandboxSetting({ sandbox: { enabled: false } });
    assert(disabled.sandboxed === false, `expected sandboxed:false when sandbox.enabled is false, got ${JSON.stringify(disabled)}`);

    const enabled = checkClaudeSandboxSetting({ sandbox: { enabled: true, failIfUnavailable: true }, permissions: { deny: ["Read(./control/**)"] } });
    assert(enabled.sandboxed === true && enabled.warning === undefined, `expected sandboxed:true with no warning, got ${JSON.stringify(enabled)}`);
  });

  harness.check(
    "adapters/install-schedule CLI: warns (does not fail closed) when a claude schedule's workspace has no sandbox.enabled, and stays silent once it does",
    () => {
      const unsandboxedDir = harness.makeTempDir("schedule-cli-claude-unsandboxed");
      writeFileSync(path.join(unsandboxedDir, "catalog.json"), JSON.stringify(twoNodeCatalog()));
      const unsandboxed = runCli("adapters/install-schedule.ts", [
        "--workspace",
        unsandboxedDir,
        "--runtime",
        "claude",
        "--schedule",
        "*/20 * * * *",
        "--brief",
        path.join(unsandboxedDir, "brief.json"),
      ]);
      assert(unsandboxed.code === 0, `expected exit 0 (warn, not fail closed), got ${unsandboxed.code}: ${unsandboxed.output}`);
      assert(unsandboxed.output.includes("sandbox"), `expected a sandbox warning naming the fix, got:\n${unsandboxed.output}`);
      assert(unsandboxed.output.includes("sandboxed: false"), `expected the dry-run preview to report sandboxed: false, got:\n${unsandboxed.output}`);

      const sandboxedDir = harness.makeTempDir("schedule-cli-claude-sandboxed");
      writeFileSync(path.join(sandboxedDir, "catalog.json"), JSON.stringify(twoNodeCatalog()));
      mkdirSync(path.join(sandboxedDir, ".claude"), { recursive: true });
      writeFileSync(path.join(sandboxedDir, ".claude", "settings.json"), JSON.stringify({ sandbox: { enabled: true, failIfUnavailable: true } }));
      const sandboxed = runCli("adapters/install-schedule.ts", [
        "--workspace",
        sandboxedDir,
        "--runtime",
        "claude",
        "--schedule",
        "*/20 * * * *",
        "--brief",
        path.join(sandboxedDir, "brief.json"),
      ]);
      assert(sandboxed.code === 0, `expected exit 0, got ${sandboxed.code}: ${sandboxed.output}`);
      assert(!sandboxed.output.includes('does not set "sandbox"'), `expected no sandbox warning once settings.json opts in, got:\n${sandboxed.output}`);
      assert(sandboxed.output.includes("sandboxed: true"), `expected the dry-run preview to report sandboxed: true, got:\n${sandboxed.output}`);

      // codex runtime never triggers the claude-only sandbox check.
      const codexDir = harness.makeTempDir("schedule-cli-codex-not-checked");
      writeFileSync(path.join(codexDir, "catalog.json"), JSON.stringify(twoNodeCatalog()));
      const codexResult = runCli("adapters/install-schedule.ts", [
        "--workspace",
        codexDir,
        "--runtime",
        "codex",
        "--schedule",
        "*/20 * * * *",
        "--brief",
        path.join(codexDir, "brief.json"),
      ]);
      assert(codexResult.code === 0, `expected exit 0, got ${codexResult.code}: ${codexResult.output}`);
      assert(!codexResult.output.includes("sandbox"), `expected no sandbox check for a codex schedule, got:\n${codexResult.output}`);
    },
  );

  // --- install-entrypoints: template writing + hook-removal, preserving founder entries --------

  harness.check("adapters/install-entrypoints: applyTemplateVars substitutes known placeholders and leaves unknown ones intact", () => {
    const rendered = applyTemplateVars("Hello {{APP_NAME}}, welcome to {{BUSINESS_NAME}} and {{UNKNOWN_TOKEN}}.", {
      APP_NAME: "Ocho",
      BUSINESS_NAME: "Ocho Inc",
    });
    assert(rendered === "Hello Ocho, welcome to Ocho Inc and {{UNKNOWN_TOKEN}}.", `unexpected substitution result: ${rendered}`);
  });

  harness.check(
    "adapters/install-entrypoints: stripManagedHookEntries removes only _managed entries and leaves every foreign entry and setting untouched",
    () => {
      const settings: HookSettings = {
        permissions: { allow: ["Bash(npm run test:*)"] },
        hooks: {
          PostToolUse: [
            { _managed: "b2c-app-builder", matcher: "Write|Edit", hooks: [{ type: "command", command: "echo managed", statusMessage: "managed hook" }] },
            { matcher: "Write|Edit", hooks: [{ type: "command", command: "echo founder-owned", statusMessage: "founder hook" }] },
          ],
        },
      };
      const stripped = stripManagedHookEntries(settings);
      assert(stripped.changed === true, "expected a change to be reported");
      assert(stripped.removedCount === 1 && stripped.preservedForeignCount === 1, `expected 1 removed / 1 preserved, got ${JSON.stringify(stripped)}`);
      const remaining = stripped.settings.hooks?.PostToolUse ?? [];
      assert(
        remaining.length === 1 && remaining[0]!.hooks?.[0]?.command === "echo founder-owned",
        `expected only the founder-owned entry to remain, got: ${JSON.stringify(remaining)}`,
      );
      assert(
        JSON.stringify(stripped.settings.permissions) === JSON.stringify(settings.permissions),
        "expected unrelated top-level settings (permissions) to be preserved untouched",
      );

      const noManaged: HookSettings = { hooks: { PostToolUse: [{ matcher: "Write", hooks: [{ command: "echo only-founder" }] }] } };
      const untouched = stripManagedHookEntries(noManaged);
      assert(untouched.changed === false && untouched.removedCount === 0, "expected no-op when nothing is managed");

      // Managed entries can use a marker or an exact package path. A founder-authored command
      // that contains a similar word must stay untouched.
      const managedEntries: HookSettings = {
        hooks: {
          PostToolUse: [
            { _managed: "b2c-app-builder", matcher: "Write|Edit", hooks: [{ type: "command", command: "echo managed" }] },
            {
              matcher: "Write|Edit",
              hooks: [{ type: "command", command: "tsx ~/.codex/skills/b2c-app-builder/checks/validation/business/orchestration/validate-project-state.ts" }],
            },
            { matcher: "Write|Edit", hooks: [{ type: "command", command: "echo my-b2c-notes" }] },
          ],
        },
      };
      const entriesStripped = stripManagedHookEntries(managedEntries);
      assert(
        entriesStripped.removedCount === 2,
        `expected both managed entries to strip, got ${JSON.stringify({ removed: entriesStripped.removedCount, preserved: entriesStripped.preservedForeignCount })}`,
      );
      const entriesRemaining = entriesStripped.settings.hooks?.PostToolUse ?? [];
      assert(
        entriesRemaining.length === 1 && entriesRemaining[0]!.hooks?.[0]?.command === "echo my-b2c-notes",
        `a founder command containing similar text must never be treated as managed, got: ${JSON.stringify(entriesRemaining)}`,
      );
    },
  );

  harness.check("adapters/install-entrypoints: parseTemplateDenyList reads permissions.deny out of the shipped .claude/settings.json template", () => {
    const templateContent = readFileSync(path.join(skillRoot, "surfaces/workspace-template/repo-agent-entrypoints", CLAUDE_SETTINGS_RELATIVE_PATH), "utf8");
    const deny = parseTemplateDenyList(templateContent);
    assert(deny.length > 0, "expected the shipped template to carry at least one permissions.deny entry");
    for (const secretEntry of ["Read(.env)", "Edit(.env)", "Write(.env)"]) {
      assert(deny.includes(secretEntry), `expected the shipped template to deny ${secretEntry}, got: ${JSON.stringify(deny)}`);
    }
    for (const controlEntry of [
      "Read(control/control.json)",
      "Edit(control/control.json)",
      "Write(control/control.json)",
      "Read(control/budget-ledger.json)",
      "Read(control/manifest.json)",
      "Read(control/audit.jsonl)",
    ]) {
      assert(deny.includes(controlEntry), `expected the shipped template to deny reducer-owned ${controlEntry}, got: ${JSON.stringify(deny)}`);
    }
  });

  harness.check("adapters/install-entrypoints: mergeTemplateDenyList unions the template list into an empty target verbatim (fresh-copy path)", () => {
    const templateDeny = ["Read(.env)", "Write(.env)", "Read(control/control.json)"];
    const result = mergeTemplateDenyList({}, templateDeny);
    assert(result.changed === true, "expected a change when the target has no permissions.deny yet");
    assert(result.addedDenyCount === templateDeny.length, `expected all ${templateDeny.length} entries added, got ${result.addedDenyCount}`);
    assert(
      JSON.stringify(result.settings.permissions) === JSON.stringify({ deny: templateDeny }),
      `expected the empty target to reproduce the template verbatim, got: ${JSON.stringify(result.settings.permissions)}`,
    );
  });

  harness.check(
    "adapters/install-entrypoints: mergeTemplateDenyList unions with an existing deny list, dedupes, and preserves every other permissions key (merge path)",
    () => {
      const existing: HookSettings = { permissions: { allow: ["Bash(npm run test:*)"], deny: ["Read(.env)", "Read(founder-secret.txt)"] } };
      const templateDeny = ["Read(.env)", "Write(.env)", "Read(control/control.json)"];
      const result = mergeTemplateDenyList(existing, templateDeny);
      assert(result.changed === true, "expected a change: the template adds two entries the target didn't have");
      assert(result.addedDenyCount === 2, `expected 2 new entries added (Write(.env), Read(control/control.json)), got ${result.addedDenyCount}`);
      const deny = (result.settings.permissions as { deny: string[] }).deny;
      assert(deny.includes("Read(founder-secret.txt)"), "expected the founder's own deny entry to survive the merge");
      assert(
        deny.includes("Write(.env)") && deny.includes("Read(control/control.json)"),
        `expected the new template entries to be added, got: ${JSON.stringify(deny)}`,
      );
      assert(deny.filter((entry) => entry === "Read(.env)").length === 1, "expected the entry present in both lists to appear exactly once, not duplicated");
      assert(
        JSON.stringify((result.settings.permissions as { allow: string[] }).allow) === JSON.stringify(["Bash(npm run test:*)"]),
        "expected the unrelated permissions.allow key to survive untouched",
      );

      const noOp = mergeTemplateDenyList(result.settings, templateDeny);
      assert(noOp.changed === false && noOp.addedDenyCount === 0, "expected a second merge of the same template list to be a no-op");
    },
  );

  harness.check(
    "adapters/install-entrypoints CLI: --dry-run writes nothing; --apply writes managed entrypoints and removes only the managed hook entry",
    () => {
      const target = harness.makeTempDir("entrypoints-target");
      initializeProductFixture(target, "AdaptersFixtureApp");
      const pinFiles = ["catalog.json", ".b2c-launch/runtime.json"];
      const pinBefore = pinFiles.map((relative) => readFileSync(path.join(target, relative), "utf8"));
      for (const relativePath of ["DESIGN.md", "studio/seed/business.json"]) {
        const destination = path.join(target, relativePath);
        mkdirSync(path.dirname(destination), { recursive: true });
        cpSync(path.join(skillRoot, "examples/workspace/business", relativePath), destination);
      }
      mkdirSync(path.join(target, ".claude"), { recursive: true });
      writeFileSync(
        path.join(target, ".claude", "settings.json"),
        JSON.stringify(
          {
            env: { FOUNDER_OWNED: "true" },
            hooks: {
              PostToolUse: [
                {
                  _managed: "b2c-app-builder",
                  matcher: "Write|Edit",
                  hooks: [{ type: "command", command: "echo managed-hook", statusMessage: "managed check" }],
                },
                { matcher: "Bash", hooks: [{ type: "command", command: "echo founder-custom-hook", statusMessage: "founder's own hook" }] },
              ],
            },
          },
          null,
          2,
        ),
      );

      const entrypointsBefore = ENTRYPOINT_FILES.map((file) =>
        existsSync(path.join(target, file.relativePath)) ? readFileSync(path.join(target, file.relativePath), "utf8") : null,
      );
      const dryRun = runCli("adapters/install-entrypoints.ts", ["--target", target, "--skill-root", skillRoot]);
      assert(dryRun.code === 0, `expected exit 0, got ${dryRun.code}: ${dryRun.output}`);
      assert(dryRun.output.includes("DRY RUN"), `expected a DRY RUN banner, got:\n${dryRun.output}`);
      for (const file of ENTRYPOINT_FILES) {
        if (file.relativePath === CLAUDE_SETTINGS_RELATIVE_PATH) continue; // pre-exists in this fixture (created above) — checked separately below
        assert(
          readFileSync(path.join(target, file.relativePath), "utf8") === entrypointsBefore[ENTRYPOINT_FILES.indexOf(file)],
          `dry-run must preserve ${file.relativePath}`,
        );
      }
      const settingsAfterDryRun = JSON.parse(readFileSync(path.join(target, ".claude", "settings.json"), "utf8")) as HookSettings;
      assert((settingsAfterDryRun.hooks?.PostToolUse ?? []).length === 2, "dry-run must not have modified settings.json");
      assert(settingsAfterDryRun.permissions === undefined, "dry-run must not have merged permissions.deny into settings.json");

      const applied = runCli("adapters/install-entrypoints.ts", [
        "--target",
        target,
        "--skill-root",
        skillRoot,
        "--apply",
        "--var",
        "APP_NAME=AdaptersFixtureApp",
      ]);
      assert(applied.code === 0, `expected exit 0, got ${applied.code}: ${applied.output}`);
      assert(
        pinFiles.every((relative, index) => readFileSync(path.join(target, relative), "utf8") === pinBefore[index]),
        "template installation must preserve exact selected catalog and runtime pins",
      );

      for (const file of ENTRYPOINT_FILES) {
        const destination = path.join(target, file.relativePath);
        assert(existsSync(destination), `expected ${file.relativePath} to be written`);
      }
      const agentsContent = readFileSync(path.join(target, "AGENTS.md"), "utf8");
      assert(agentsContent.includes("AdaptersFixtureApp"), "expected the {{APP_NAME}} placeholder to be substituted in the written AGENTS.md");
      assert(!agentsContent.includes("{{APP_NAME}}"), "expected no unresolved {{APP_NAME}} placeholder once a value was supplied");
      const claudeContent = readFileSync(path.join(target, "CLAUDE.md"), "utf8");
      assert(claudeContent.includes("Read `AGENTS.md` first"), "expected the CLAUDE.md thin pointer to point at AGENTS.md");
      const cursorRules = readFileSync(path.join(target, ".cursor", "rules", "agents.mdc"), "utf8");
      assert(cursorRules.includes("AGENTS.md"), "expected the Cursor rules addendum to point back at AGENTS.md");
      const design = readFileSync(path.join(target, "DESIGN.md"), "utf8");
      assert(!design.includes("GENERATED FILE") && design.includes("## Overview"), "expected install-entrypoints to preserve the authored DESIGN.md contract");

      const settingsAfterApply = JSON.parse(readFileSync(path.join(target, ".claude", "settings.json"), "utf8")) as HookSettings;
      const remainingHooks = settingsAfterApply.hooks?.PostToolUse ?? [];
      assert(remainingHooks.length === 1, `expected exactly one surviving PostToolUse entry, got ${remainingHooks.length}: ${JSON.stringify(remainingHooks)}`);
      assert(
        remainingHooks[0]!.hooks?.[0]?.command === "echo founder-custom-hook",
        `expected the founder-owned entry to survive untouched, got: ${JSON.stringify(remainingHooks[0])}`,
      );
      assert(settingsAfterApply.env?.FOUNDER_OWNED === "true", "expected the unrelated env key to survive untouched");
      const denyAfterApply = (settingsAfterApply.permissions as { deny?: string[] } | undefined)?.deny ?? [];
      const templateDenyList = parseTemplateDenyList(
        readFileSync(path.join(skillRoot, "surfaces/workspace-template/repo-agent-entrypoints", CLAUDE_SETTINGS_RELATIVE_PATH), "utf8"),
      );
      for (const entry of templateDenyList)
        assert(denyAfterApply.includes(entry), `expected the merge path to add managed deny entry ${entry}, got: ${JSON.stringify(denyAfterApply)}`);
    },
  );

  harness.check(
    "adapters/install-entrypoints CLI: a target with no .claude/settings.json gets one written with the managed permission-deny list (fresh-copy path)",
    () => {
      const target = harness.makeTempDir("entrypoints-target-no-settings");
      initializeProductFixture(target, "No Settings Fixture");
      rmSync(path.join(target, ".claude/settings.json"));
      const dryRun = runCli("adapters/install-entrypoints.ts", ["--target", target, "--skill-root", skillRoot]);
      assert(dryRun.code === 0, `expected exit 0, got ${dryRun.code}: ${dryRun.output}`);
      assert(!existsSync(path.join(target, ".claude", "settings.json")), "dry-run must not have written settings.json where the founder never had one");

      const result = runCli("adapters/install-entrypoints.ts", ["--target", target, "--skill-root", skillRoot, "--apply"]);
      assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);
      for (const file of ENTRYPOINT_FILES)
        assert(existsSync(path.join(target, file.relativePath)), `expected ${file.relativePath} to be written even with no pre-existing settings.json`);
      const settingsAfterApply = JSON.parse(readFileSync(path.join(target, ".claude", "settings.json"), "utf8")) as HookSettings;
      const templateContent = readFileSync(path.join(skillRoot, "surfaces/workspace-template/repo-agent-entrypoints", CLAUDE_SETTINGS_RELATIVE_PATH), "utf8");
      const templateDenyList = parseTemplateDenyList(templateContent);
      const denyAfterApply = (settingsAfterApply.permissions as { deny?: string[] } | undefined)?.deny ?? [];
      assert(
        JSON.stringify([...denyAfterApply].sort()) === JSON.stringify([...templateDenyList].sort()),
        `expected the fresh-copy path to reproduce the template's deny list verbatim, got: ${JSON.stringify(denyAfterApply)}`,
      );
    },
  );

  harness.check("adapters/install-entrypoints CLI: uninitialized apply refuses before writing", () => {
    const target = harness.makeTempDir("entrypoints-uninitialized");
    const result = runCli("adapters/install-entrypoints.ts", ["--target", target, "--skill-root", skillRoot, "--apply"]);
    assert(result.code === 1 && result.output.includes("business.initialization_required"), "only business initialization may write the first runtime pin");
    assert(readdirSync(target).length === 0, "refused installation must leave target empty");
  });

  harness.check("adapters/install-entrypoints CLI: --target pointing at a nonexistent directory fails loudly instead of silently no-op-ing", () => {
    const result = runCli("adapters/install-entrypoints.ts", ["--target", path.join(harness.tempRoot, "does-not-exist"), "--skill-root", skillRoot]);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
  });

  // --- founder-facing runtime set sanity (used by parity/rehearsal work in U9/U10) -------------

  harness.check("adapters: founderFacingRuntimeIds names exactly claude/codex/cursor, and excludes inline from the parity/rehearsal set", () => {
    assert(founderFacingRuntimeIds.length === 3, `expected 3 founder-facing runtimes, got ${JSON.stringify(founderFacingRuntimeIds)}`);
    assert(!founderFacingRuntimeIds.includes("inline"), "inline must never be counted as a founder-facing runtime");
    for (const runtime of ["claude", "codex", "cursor"] as const)
      assert(founderFacingRuntimeIds.includes(runtime), `expected "${runtime}" in founderFacingRuntimeIds`);
  });
}
