import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";
import { controlDirFor, planControlPermissions, verifyControlBoundary } from "../../../adapters/install-control-permissions.js";
import { buildControlBoundaryAnomaly } from "../../../kernel/session/run.js";
import type { ControlFile } from "../../../kernel/schema/types.js";
import { NOW, makeGrants } from "./_fixtures.js";
import { currentPin } from "../fixtures/run-persistence.fixtures.js";

/**
 * The autonomy trust boundary's layer-3 tooling (adapters/install-control-permissions.ts)
 * and its integration into the session runner (kernel/session/run.ts's buildControlBoundaryAnomaly).
 * THE central thing this suite proves is the anti-overclaim guarantee: a chmod-restricted
 * control/ owned by this very test process must NEVER be reported as "enforced" — only a
 * genuinely different, non-owning uid earns that word, and this suite cannot fabricate one (no
 * sudo, no real second account), so "enforced" is never asserted here at all. That absence is
 * deliberate, not a coverage gap — see verifyControlBoundary's own doc comment on why.
 */

function resolveTsxBin(): string {
  const candidates = [path.join(skillRoot, "node_modules/.bin/tsx"), path.resolve(skillRoot, "../..", "node_modules/.bin/tsx")];
  return candidates.find((candidate) => existsSync(candidate)) ?? "tsx";
}
const tsxBin = resolveTsxBin();
const installerCliPath = path.join(skillRoot, "adapters/install-control-permissions.ts");
const installerSource = readFileSync(installerCliPath, "utf8");

function runInstaller(args: string[]): { code: number; output: string } {
  const result = spawnSync(tsxBin, [installerCliPath, ...args], { cwd: skillRoot, encoding: "utf8" });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function baseControl(grants: ControlFile["grants"] = {}): ControlFile {
  return {
    schemaVersion: "1.0.0",
    updatedAt: NOW,
    businessSlug: "fixture-biz",
    killSwitch: { engaged: false, engagedAt: "", engagedBy: "", reason: "" },
    grants,
    waivers: [],
  };
}

// --- minimal, self-contained session-workspace bootstrap (mirrors checks/verification/fixtures/session.fixtures.ts's own local helpers; boundaries/ suites never import from fixtures/*.fixtures.ts) --

const reducerCliPath = path.join(skillRoot, "kernel/reducer/cli.ts");
const runCliPath = path.join(skillRoot, "kernel/session/run.ts");

function runReducer(args: string[], input?: string): { code: number; output: string } {
  const result = spawnSync(tsxBin, [reducerCliPath, ...args], { cwd: skillRoot, encoding: "utf8", input });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function runSession(args: string[]): { code: number; output: string } {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  const result = spawnSync(tsxBin, [runCliPath, ...args], { cwd: skillRoot, encoding: "utf8", env });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

let patchCounter = 0;
function buildPatch(targetDoc: string, ops: Array<Record<string, unknown>>, declaredOutputs: string[][]): Record<string, unknown> {
  patchCounter += 1;
  return {
    schemaVersion: "1.0.0",
    patchId: `control-boundary-fixture-${patchCounter}`,
    targetDoc,
    reason: "control_boundary fixture setup",
    authoredBy: "control-boundary-fixture",
    authoredAt: NOW,
    preconditions: [],
    ops,
    declaredOutputs,
  };
}

function commit(dir: string, manifestPath: string, auditPath: string, targetFile: string, patch: Record<string, unknown>): void {
  const patchPath = path.join(dir, `${patch.patchId as string}.json`);
  writeJson(patchPath, patch);
  const result = runReducer([
    "commit",
    "--patch",
    patchPath,
    "--file",
    targetFile,
    "--manifest",
    manifestPath,
    "--audit",
    auditPath,
    "--session",
    "control-boundary-fixture",
    "--founder-authority",
    "true",
  ]);
  assert(result.code === 0, `control_boundary fixture bootstrap commit failed: ${result.output}`);
}

const LANE_KEYS = [
  "paid_tool_routing",
  "secrets",
  "security",
  "research",
  "traceability",
  "experience",
  "product",
  "design",
  "emotional_design",
  "content_assets",
  "analytics_attribution",
  "paid_user_acquisition",
  "onboarding",
  "revenue",
  "store_console",
  "apple_signing",
  "privacy_legal",
  "email",
  "orchestration",
  "engineering",
  "growth",
  "post_launch_ops",
];

interface BootstrapHandle {
  readonly dir: string;
  readonly briefPath: string;
  readonly digestPath: (sessionId: string) => string;
}

/** An empty catalog (no workflows) is enough here: the boundary anomaly is evaluated before dispatch and doesn't depend on any node being ready. */
function bootstrapSessionWorkspace(harness: Harness, name: string, grants: Record<string, unknown>): BootstrapHandle {
  const dir = harness.makeTempDir(`control-boundary-${name}`);
  const statePath = path.join(dir, "state", "business-state.json");
  const controlPath = path.join(dir, "control", "control.json");
  const ledgerPath = path.join(dir, "control", "budget-ledger.json");
  const manifestPath = path.join(dir, "control", "manifest.json");
  const auditPath = path.join(dir, "control", "audit.jsonl");

  const lanes: Record<string, unknown> = {};
  for (const key of LANE_KEYS) lanes[key] = { status: "pending", evidence: [], blockers: [] };

  commit(
    dir,
    manifestPath,
    auditPath,
    statePath,
    buildPatch(
      "business-state",
      [
        { op: "set", path: ["narrative"], value: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" } },
        {
          op: "set",
          path: ["project"],
          value: {
            name: "Boundary Fixture",
            slug: name,
            owner: "Founder",
            phase: "phase_0_orient",
            launchScope: "essentials",
            kickoffDate: "",
            platforms: ["ios"],
            bundleIds: { ios: "com.example.app", android: "" },
            publicUrls: { landing: "", privacy: "", terms: "" },
          },
        },
        { op: "set", path: ["lanes"], value: lanes },
        { op: "set", path: ["founderGates"], value: { pending: [] } },
      ],
      [["narrative"], ["project"], ["lanes"], ["founderGates"]],
    ),
  );

  commit(
    dir,
    manifestPath,
    auditPath,
    controlPath,
    buildPatch(
      "control",
      [
        { op: "set", path: ["businessSlug"], value: name },
        { op: "set", path: ["killSwitch"], value: { engaged: false, engagedAt: "", engagedBy: "", reason: "" } },
        { op: "set", path: ["grants"], value: grants },
        { op: "set", path: ["waivers"], value: [] },
      ],
      [["businessSlug"], ["killSwitch"], ["grants"], ["waivers"]],
    ),
  );

  commit(
    dir,
    manifestPath,
    auditPath,
    ledgerPath,
    buildPatch(
      "budget-ledger",
      [
        { op: "set", path: ["balances"], value: [] },
        { op: "set", path: ["entries"], value: [] },
      ],
      [["balances"], ["entries"]],
    ),
  );

  writeJson(path.join(dir, "catalog.json"), { version: "catalog.control-boundary-fixture", artifacts: [], workflows: [] });
  const briefPath = path.join(dir, "brief.json");
  writeJson(briefPath, { schemaVersion: "1.0.0", businessSlug: name, founderContact: { email: "founder@example.com" } });

  return { dir, briefPath, digestPath: (sessionId: string) => path.join(dir, "digests", `${sessionId}.md`) };
}

const ANOMALY_MARKER = "the folder that holds those permissions isn't locked down yet";

export function register(harness: Harness): void {
  // --- verifyControlBoundary: unprotected --------------------------------------------------------

  harness.check("control boundary: a control/ with no write restriction at all (mode 0777) verifies as unprotected", () => {
    const dir = harness.makeTempDir("control-boundary-unprotected");
    const controlDir = controlDirFor(dir);
    mkdirSync(controlDir, { recursive: true });
    chmodSync(controlDir, 0o777); // explicit: never rely on the OS default umask to construct this fixture
    writeFileSync(path.join(controlDir, "control.json"), "{}", "utf8");

    const verdict = verifyControlBoundary(dir);
    assert(verdict.state === "unprotected", `expected "unprotected", got ${JSON.stringify(verdict)}`);
    assert(verdict.agentUidDiffers === false, `expected agentUidDiffers=false in a same-process fixture, got ${JSON.stringify(verdict)}`);
    assert(verdict.controlMode === "0777", `expected controlMode "0777", got "${verdict.controlMode}"`);
    assert(verdict.reasons.length > 0, "expected at least one reason explaining the verdict");
  });

  // --- verifyControlBoundary: advisory_only, and — the anti-overclaim assertion — NEVER enforced -

  harness.check(
    'control boundary: a chmod-restricted control/ (group/other write cleared) still owned by THIS process verifies as advisory_only, and is NEVER called "enforced" (anti-overclaim)',
    () => {
      const dir = harness.makeTempDir("control-boundary-advisory");
      const controlDir = controlDirFor(dir);
      mkdirSync(controlDir, { recursive: true });
      chmodSync(controlDir, 0o750); // exactly the go-w-cleared shape the installer itself produces
      writeFileSync(path.join(controlDir, "control.json"), "{}", "utf8");
      chmodSync(path.join(controlDir, "control.json"), 0o640);

      const verdict = verifyControlBoundary(dir);
      assert(verdict.state === "advisory_only", `expected "advisory_only", got ${JSON.stringify(verdict)}`);
      assert(
        (verdict.state as string) !== "enforced",
        'anti-overclaim: a same-uid-owned directory must never be reported as "enforced", no matter how restrictive its mode looks',
      );
      assert(verdict.agentUidDiffers === false, `expected agentUidDiffers=false (this process owns control/ in this fixture), got ${JSON.stringify(verdict)}`);
      assert(verdict.controlMode === "0750", `expected controlMode "0750", got "${verdict.controlMode}"`);
      assert(
        verdict.reasons.some((reason) => reason.includes("can chmod it right back")),
        `expected a reason naming the self-revert risk, got ${JSON.stringify(verdict.reasons)}`,
      );
    },
  );

  // --- verifyControlBoundary: the empirical probe cleans up after itself -------------------------

  harness.check("control boundary: the empirical write-probe leaves no file behind, whether the write succeeded or failed", () => {
    const writableDir = harness.makeTempDir("control-boundary-probe-cleanup-writable");
    const writableControl = controlDirFor(writableDir);
    mkdirSync(writableControl, { recursive: true });
    chmodSync(writableControl, 0o777);
    verifyControlBoundary(writableDir);
    const leftoverWritable = readdirSync(writableControl).filter((name) => name.includes("control-boundary-probe"));
    assert(leftoverWritable.length === 0, `expected no leftover probe files after a successful probe write, found: ${JSON.stringify(leftoverWritable)}`);

    // Same-uid "restricted" case too: the owner's write attempt still succeeds (this script never
    // clears the owner's own bits), so this exercises the identical cleanup path as the writable
    // case above — included for completeness, not because a different code path is expected.
    const restrictedDir = harness.makeTempDir("control-boundary-probe-cleanup-restricted");
    const restrictedControl = controlDirFor(restrictedDir);
    mkdirSync(restrictedControl, { recursive: true });
    chmodSync(restrictedControl, 0o700);
    verifyControlBoundary(restrictedDir);
    const leftoverRestricted = readdirSync(restrictedControl).filter((name) => name.includes("control-boundary-probe"));
    assert(
      leftoverRestricted.length === 0,
      `expected no leftover probe files under a restricted control/ either, found: ${JSON.stringify(leftoverRestricted)}`,
    );
  });

  // --- planControlPermissions: pure math, matches the documented go-w clearing --------------------

  harness.check("control boundary: planControlPermissions computes exactly go-w-cleared target modes and never touches disk", () => {
    const dir = harness.makeTempDir("control-boundary-plan");
    const controlDir = controlDirFor(dir);
    mkdirSync(controlDir, { recursive: true });
    chmodSync(controlDir, 0o777);
    writeFileSync(path.join(controlDir, "control.json"), "{}", "utf8");
    chmodSync(path.join(controlDir, "control.json"), 0o666);
    writeFileSync(path.join(controlDir, "already-clear.json"), "{}", "utf8");
    chmodSync(path.join(controlDir, "already-clear.json"), 0o644);

    const plan = planControlPermissions(controlDir);
    assert(plan.length === 3, `expected control/ itself plus 2 files, got ${plan.length}: ${JSON.stringify(plan)}`);
    const self = plan.find((entry) => entry.relativePath === ".");
    assert(
      Boolean(self) && self!.currentMode === 0o777 && self!.targetMode === 0o755 && self!.changes === true,
      `expected control/ itself 0777 -> 0755 (changes), got ${JSON.stringify(self)}`,
    );
    const controlJson = plan.find((entry) => entry.relativePath === "control.json");
    assert(
      Boolean(controlJson) && controlJson!.currentMode === 0o666 && controlJson!.targetMode === 0o644 && controlJson!.changes === true,
      `expected control.json 0666 -> 0644 (changes), got ${JSON.stringify(controlJson)}`,
    );
    const alreadyClear = plan.find((entry) => entry.relativePath === "already-clear.json");
    assert(Boolean(alreadyClear) && alreadyClear!.changes === false, `expected already-clear.json to report no change, got ${JSON.stringify(alreadyClear)}`);

    // Purity: nothing on disk actually changed from computing the plan.
    const controlDirStats = readdirSync(controlDir);
    assert(controlDirStats.length === 2, `planControlPermissions must not have created or removed anything, found: ${JSON.stringify(controlDirStats)}`);
  });

  // --- installer CLI: dry-run touches nothing; --apply clears exactly the planned bits ------------

  harness.check(
    "control boundary/installer CLI: --dry-run (the default) reports the plan and changes no mode bits; --apply clears exactly the go-w bits it planned",
    () => {
      const dir = harness.makeTempDir("control-boundary-cli");
      const controlDir = controlDirFor(dir);
      mkdirSync(controlDir, { recursive: true });
      chmodSync(controlDir, 0o777);
      writeFileSync(path.join(controlDir, "control.json"), "{}", "utf8");
      chmodSync(path.join(controlDir, "control.json"), 0o666);
      writeJson(path.join(dir, "catalog.json"), currentPin.catalog);

      const dryRun = runInstaller(["--workspace", dir]);
      assert(dryRun.code === 0, `expected exit 0, got ${dryRun.code}: ${dryRun.output}`);
      assert(dryRun.output.includes("DRY RUN"), `expected a DRY RUN banner, got:\n${dryRun.output}`);
      assert(dryRun.output.includes("0777 -> 0755"), `expected the planned control/ mode change in the dry-run preview, got:\n${dryRun.output}`);
      assert((statSync(controlDir).mode & 0o777) === 0o777, "dry-run must not have changed control/'s mode");

      const applied = runInstaller(["--workspace", dir, "--apply"]);
      assert(applied.code === 0, `expected exit 0, got ${applied.code}: ${applied.output}`);
      assert(
        (statSync(controlDir).mode & 0o777) === 0o755,
        `expected control/ to be 0755 after --apply, got ${(statSync(controlDir).mode & 0o777).toString(8)}`,
      );
      assert((statSync(path.join(controlDir, "control.json")).mode & 0o777) === 0o644, "expected control.json to be 0644 after --apply");
      assert(applied.output.includes("ADVISORY ONLY"), `expected the advisory-only framing when no --agent-user is given, got:\n${applied.output}`);
    },
  );

  harness.check("control boundary/installer CLI: apply refuses a missing catalog without changing bytes or modes", () => {
    const dir = harness.makeTempDir("control-boundary-cli-missing-catalog");
    const controlDir = controlDirFor(dir);
    const controlPath = path.join(controlDir, "control.json");
    mkdirSync(controlDir, { recursive: true });
    chmodSync(controlDir, 0o777);
    writeFileSync(controlPath, "preserved control bytes\n", "utf8");
    chmodSync(controlPath, 0o666);
    const beforeEntries = JSON.stringify(readdirSync(dir));
    const beforeBytes = readFileSync(controlPath, "utf8");
    const beforeModes = { directory: statSync(controlDir).mode & 0o777, file: statSync(controlPath).mode & 0o777 };

    const refused = runInstaller(["--workspace", dir, "--apply"]);
    assert(refused.code === 1, `expected exit 1, got ${refused.code}: ${refused.output}`);
    assert(refused.output.includes("invalid_catalog"), `expected a catalog refusal, got:\n${refused.output}`);
    assert(JSON.stringify(readdirSync(dir)) === beforeEntries, "missing-catalog refusal must not create workspace entries");
    assert(readFileSync(controlPath, "utf8") === beforeBytes, "missing-catalog refusal must preserve control bytes");
    assert((statSync(controlDir).mode & 0o777) === beforeModes.directory, "missing-catalog refusal must preserve the control directory mode");
    assert((statSync(controlPath).mode & 0o777) === beforeModes.file, "missing-catalog refusal must preserve the control file mode");
  });

  harness.check("control boundary/installer CLI: a nonexistent --workspace fails loudly (exit 1) rather than silently no-op-ing", () => {
    const result = runInstaller(["--workspace", path.join(harness.tempRoot, "does-not-exist")]);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
  });

  // --- structural: the installer never calls sudo, never touches a user account -------------------

  harness.check(
    "control boundary/installer: the source never CALLS chown/useradd/dscl or spawns sudo — it only ever imports/invokes chmod (prose in doc comments naming these words for what NOT to do is fine; an actual call is not)",
    () => {
      // Matches a real invocation shape ("token(" or "token.something(" or "'token'" passed as a
      // spawnSync/exec argument) — never a bare word, so this can't be fooled by the doc comments
      // above (which legitimately say "never calls chown" etc.) into a false negative OR flagged by
      // a false positive on prose. Import statements for fs's chmod family are the only permitted
      // filesystem-permission calls; chown is never imported at all.
      const invocationPatterns: Array<{ label: string; pattern: RegExp }> = [
        { label: "chownSync(", pattern: /\bchownSync\s*\(/ },
        { label: "chown(", pattern: /\bfs\.chown\s*\(|\bchown\s*\(/ },
        { label: 'spawnSync("sudo"', pattern: /spawnSync\(\s*["'`]sudo["'`]/ },
        { label: 'spawnSync("useradd"', pattern: /spawnSync\(\s*["'`](useradd|adduser|dscl)["'`]/ },
        { label: 'exec("sudo"', pattern: /exec(?:Sync)?\(\s*["'`]sudo/ },
      ];
      const hits = invocationPatterns.filter(({ pattern }) => pattern.test(installerSource)).map(({ label }) => label);
      assert(hits.length === 0, `expected no chown/account-mutation/sudo invocations in the installer source, found: ${JSON.stringify(hits)}`);
      const fsImportLine = installerSource.match(/import\s*\{[^}]*\}\s*from\s*["']node:fs["']/)?.[0] ?? "";
      assert(!/\bchownSync\b/.test(fsImportLine), `chownSync must not even be imported from node:fs, got import line: ${fsImportLine}`);
    },
  );

  // --- session integration: buildControlBoundaryAnomaly, direct and via a real session run --------

  harness.check(
    "control boundary + session: an above-review-first grant plus a non-enforced verdict yields exactly one anomaly; a review-first-only grant yields none; an enforced verdict yields none regardless of grants",
    () => {
      const nonEnforced = verifyControlBoundary(harness.makeTempDir("control-boundary-anomaly-verdict-source")); // unprotected: no control/ was even created here
      assert(nonEnforced.state !== "enforced", "test setup: expected a non-enforced verdict to drive this check");

      const aboveReviewFirst = baseControl(makeGrants([["domain.engineering", "run-with-guardrails"]]));
      const anomaly = buildControlBoundaryAnomaly(aboveReviewFirst, nonEnforced, "fixture-command");
      assert(Boolean(anomaly), "expected exactly one anomaly for an above-review-first grant on a non-enforced workspace");
      assert(anomaly!.message.includes("Engineering"), `expected the unit name in the message, got: ${anomaly!.message}`);
      assert(anomaly!.message.includes("fixture-command"), `expected the remedy command in the message, got: ${anomaly!.message}`);
      assert(anomaly!.message.includes(ANOMALY_MARKER), `expected the founder-plain disclosure sentence, got: ${anomaly!.message}`);

      const reviewFirstOnly = baseControl(makeGrants([["domain.growth", "review-first"]]));
      const silent = buildControlBoundaryAnomaly(reviewFirstOnly, nonEnforced, "fixture-command");
      assert(silent === undefined, `expected no anomaly for a review-first-only workspace, got: ${JSON.stringify(silent)}`);

      const enforcedVerdict = { ...nonEnforced, state: "enforced" as const };
      const silentBecauseEnforced = buildControlBoundaryAnomaly(aboveReviewFirst, enforcedVerdict, "fixture-command");
      assert(silentBecauseEnforced === undefined, "expected no anomaly once the boundary is genuinely enforced, even with an above-review-first grant");

      const noGrantsAtAll = buildControlBoundaryAnomaly(baseControl({}), nonEnforced, "fixture-command");
      assert(noGrantsAtAll === undefined, "expected no anomaly when no grants exist at all");
    },
  );

  harness.check(
    "control boundary + session: a real session run on a non-enforced workspace emits the boundary disclosure exactly once for an above-review-first grant, and not at all for review-first-only",
    () => {
      const above = bootstrapSessionWorkspace(harness, "above-review-first", makeGrants([["domain.engineering", "run-with-guardrails"]]));
      const aboveResult = runSession(["--workspace", above.dir, "--brief", above.briefPath, "--session", "sess-control-boundary-above-1"]);
      assert(aboveResult.code === 0, `expected exit 0, got ${aboveResult.code}: ${aboveResult.output}`);
      const aboveDigest = readFileSync(above.digestPath("sess-control-boundary-above-1"), "utf8");
      const aboveOccurrences = aboveDigest.split(ANOMALY_MARKER).length - 1;
      assert(aboveOccurrences === 1, `expected exactly one boundary disclosure line, found ${aboveOccurrences} in:\n${aboveDigest}`);

      const reviewOnly = bootstrapSessionWorkspace(harness, "review-first-only", makeGrants([["domain.growth", "review-first"]]));
      const reviewResult = runSession(["--workspace", reviewOnly.dir, "--brief", reviewOnly.briefPath, "--session", "sess-control-boundary-review-1"]);
      assert(reviewResult.code === 0, `expected exit 0, got ${reviewResult.code}: ${reviewResult.output}`);
      const reviewDigest = readFileSync(reviewOnly.digestPath("sess-control-boundary-review-1"), "utf8");
      assert(!reviewDigest.includes(ANOMALY_MARKER), `expected no boundary disclosure for a review-first-only workspace, got:\n${reviewDigest}`);
    },
  );
}
