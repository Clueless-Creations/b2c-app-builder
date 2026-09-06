import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";
import { laneKeys, type RunStateDocument } from "../../../kernel/schema/types.js";
import type { CatalogInput } from "../../../kernel/engine/compile.js";
import { founderFacingRuntimeIds, buildSessionRunArgs, type SessionInvocation } from "../../../adapters/profile.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";
import { createClaudeProfile } from "../../../adapters/claude.js";
import { createCodexProfile } from "../../../adapters/codex.js";
import { createCursorProfile } from "../../../adapters/cursor.js";
import { createInlineProfile } from "../../../adapters/inline.js";
import type { RuntimeCapabilityProfile } from "../../../adapters/profile.js";

/**
 * The runtime-parity suite (R3, KTD10; Verification Contract's "Runtime parity" gate, U6/U9):
 * drives ONE fixture scenario through every capability profile — the three founder-facing
 * runtimes plus `inline` — and asserts the adapter-parity rule directly, not just structurally:
 * identical node reachability, identical approval/waiver requirements, identical parked reasons.
 * Differences may appear ONLY in concurrency (each profile's own maxConcurrency), mode, or the
 * outer command fields — never in which nodes run or why a node is parked.
 *
 * No real vendor CLI is invoked. A profile's `buildHeadlessCommand` output is the prompt an actual
 * `claude`/`codex`/`cursor-agent` process would receive telling it to run ONE fixed inner command
 * (adapters/profile.ts's buildFixedPrompt) — this suite runs that inner command directly,
 * `tsx kernel/session/run.ts ...` with `--executor fixture`, once per profile's own maxConcurrency,
 * each against its own freshly bootstrapped but content-identical workspace (same catalog, same
 * grants/waivers/balances — see runProfile's doc comment on why "identical" is achieved by
 * re-bootstrapping rather than copying). That inner invocation is exactly what adapters.fixtures.ts
 * already proves each profile's constructed command reduces to (see its "buildHeadlessCommand
 * never inlines the brief's content" case) — this suite picks up where that one stops, actually
 * running the shared session pipeline instead of only inspecting the command string, and diffs the
 * real decisions it produced.
 */

const tsxBin = resolveTsxBin(skillRoot);
const reducerCliPath = path.join(skillRoot, "kernel/reducer/cli.ts");

interface CliResult {
  readonly code: number;
  readonly output: string;
}

function runReducer(args: string[], input?: string): CliResult {
  const result = spawnSync(tsxBin, [reducerCliPath, ...args], { cwd: skillRoot, encoding: "utf8", input });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  return env;
}

/**
 * `innerArgs` is the FULL output of adapters/profile.ts's buildSessionRunArgs — it already
 * starts with the "kernel/session/run.ts" script path (relative to `cwd: skillRoot`), exactly as
 * profile.ts's own sessionRunCommandLine hands it to a bare `tsx` invocation. Do not prepend an
 * absolute run.ts path on top of this array — that duplicates the script-path argument and
 * produces an argv shape tsx does not know how to run (observed: it hangs waiting rather than
 * erroring, so this is worth the explicit warning).
 */
function runSession(innerArgs: readonly string[]): CliResult {
  const result = spawnSync(tsxBin, [...innerArgs], { cwd: skillRoot, encoding: "utf8", env: cleanEnv(), timeout: 60000 });
  if (result.error) return { code: -1, output: `spawn error: ${result.error.message}` };
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

let patchCounter = 0;
function nextPatchId(): string {
  patchCounter += 1;
  return `parity-fixture-patch-${patchCounter}`;
}

function buildPatch(targetDoc: string, ops: Array<Record<string, unknown>>, declaredOutputs: string[][]): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    patchId: nextPatchId(),
    targetDoc,
    reason: "parity fixture setup",
    authoredBy: "parity-fixture-setup",
    authoredAt: "2026-08-05T00:00:00.000Z",
    preconditions: [],
    ops,
    declaredOutputs,
  };
}

function minimalLanes(): Record<string, unknown> {
  const lanes: Record<string, unknown> = {};
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return lanes;
}

interface WorkspaceHandle {
  readonly dir: string;
  readonly statePath: string;
  readonly controlPath: string;
  readonly ledgerPath: string;
  readonly manifestPath: string;
  readonly auditPath: string;
  readonly catalogPath: string;
  readonly briefPath: string;
  readonly runStatePath: string;
}

function commit(dir: string, handle: WorkspaceHandle, targetFile: string, patch: Record<string, unknown>): void {
  const patchPath = path.join(dir, `${patch.patchId as string}.json`);
  writeJson(patchPath, patch);
  const result = runReducer([
    "commit",
    "--patch",
    patchPath,
    "--file",
    targetFile,
    "--manifest",
    handle.manifestPath,
    "--audit",
    handle.auditPath,
    "--session",
    "parity-fixture-setup",
    "--founder-authority",
    "true",
  ]);
  assert(result.code === 0, `workspace bootstrap commit failed: ${result.output}`);
}

function grant(domainId: string, level: string, now = "2026-08-01T00:00:00.000Z"): Record<string, unknown> {
  return { domainId, level, prerequisites: [], grantedAt: now, grantedBy: "founder", updatedAt: now };
}

function waiver(id: string, domainId: string, actionClass: string, protectedCategory: string, now = "2026-08-01T00:00:00.000Z"): Record<string, unknown> {
  return {
    id,
    domainId,
    actionClass,
    protectedCategory,
    scope: { resourcePattern: "*", description: "Parity fixture waiver." },
    caps: { maxPerAction: 1000, maxPerPeriod: 10000, currency: "USD" },
    budgetPeriod: "monthly",
    expiry: "2099-01-01T00:00:00.000Z",
    undoContract: {
      kind: "mitigation",
      irreversibilityAcknowledgment: "Parity fixture models an irreversible action.",
      mitigationSteps: ["Review the audit log"],
    },
    auditRef: "audit.fixture",
    status: "active",
    createdAt: now,
    createdBy: "founder",
  };
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Five independent nodes (distinct domains, distinct output paths, no dependencies, no shared
 * resource prefixes) spanning every parity-relevant outcome shape: granted+succeeds,
 * ungranted+parked, protected-without-waiver+parked, protected-with-waiver+succeeds, and
 * approval-required+waiting_founder. Independence is deliberate: with no resource contention or
 * dependency ordering between nodes, concurrency can only change batching, never the outcome —
 * which is exactly the property this suite needs to isolate "differs only in concurrency."
 */
function parityCatalog(): CatalogInput {
  return {
    version: "catalog.parity-fixture",
    artifacts: [
      { id: "artifact.growth-scan", path: "growth/scan.md" },
      { id: "artifact.eng-change", path: "engineering/change.log" },
      { id: "artifact.money-report-a", path: "money/report-a.md" },
      { id: "artifact.money-report-b", path: "money/report-b.md" },
      { id: "artifact.trust-review", path: "trust/review.md" },
    ],
    workflows: [
      // check:gates-layout is a real, workspace-independent, deterministic gate: gateless
      // outputs no longer auto-accept (the 2026-08 verification flip), and this suite needs
      // nodes that genuinely SUCCEED to compare profiles — a deterministic gate keeps the
      // outcome concurrency-invariant, which is the property the suite isolates.
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
        gateCommands: ["check:gates-layout"],
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
        gateCommands: ["check:gates-layout"],
        idempotent: true,
      },
      {
        id: "workflow.money-report-a",
        title: "Pull this week's revenue report (unwaived)",
        domainId: "domain.money",
        actionClass: "spend",
        protectedCategory: "spend",
        costEstimate: { amount: 25, currency: "USD" },
        dependencies: [],
        outputPaths: ["money/report-a.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: false,
      },
      {
        id: "workflow.money-report-b",
        title: "Pull this week's revenue report (waived)",
        domainId: "domain.money",
        actionClass: "spend",
        protectedCategory: "spend",
        costEstimate: { amount: 10, currency: "USD" },
        dependencies: [],
        outputPaths: ["money/report-b.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: [],
        gateCommands: [],
        idempotent: false,
      },
      {
        id: "workflow.trust-review",
        title: "Confirm the wording change",
        domainId: "domain.trust",
        actionClass: "mutate",
        dependencies: [],
        outputPaths: ["trust/review.md"],
        providerIds: [],
        laneIds: [],
        founderOnlyActions: ["Confirm the wording change reads correctly before it ships"],
        gateCommands: [],
        idempotent: true,
      },
    ],
  };
}

function bootstrapWorkspace(harness: Harness, name: string): WorkspaceHandle {
  const dir = harness.makeTempDir(`parity-${name}`);
  const handle: WorkspaceHandle = {
    dir,
    statePath: path.join(dir, "state", "business-state.json"),
    controlPath: path.join(dir, "control", "control.json"),
    ledgerPath: path.join(dir, "control", "budget-ledger.json"),
    manifestPath: path.join(dir, "control", "manifest.json"),
    auditPath: path.join(dir, "control", "audit.jsonl"),
    catalogPath: path.join(dir, "catalog.json"),
    briefPath: path.join(dir, "brief.json"),
    runStatePath: path.join(dir, "run", "run-state.json"),
  };

  const period = currentPeriod();

  commit(
    dir,
    handle,
    handle.statePath,
    buildPatch(
      "business-state",
      [
        { op: "set", path: ["narrative"], value: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" } },
        {
          op: "set",
          path: ["project"],
          value: {
            name: "Parity Fixture App",
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
        { op: "set", path: ["lanes"], value: minimalLanes() },
        { op: "set", path: ["founderGates"], value: { pending: [] } },
      ],
      [["narrative"], ["project"], ["lanes"], ["founderGates"]],
    ),
  );

  commit(
    dir,
    handle,
    handle.controlPath,
    buildPatch(
      "control",
      [
        { op: "set", path: ["businessSlug"], value: name },
        { op: "set", path: ["killSwitch"], value: { engaged: false, engagedAt: "", engagedBy: "", reason: "" } },
        {
          // domain.engineering is deliberately absent: workflow.eng-change must park on
          // autonomy.no_grant, one of the outcome shapes this suite needs present.
          op: "set",
          path: ["grants"],
          value: {
            "domain.growth": grant("domain.growth", "review-first"),
            "domain.money": grant("domain.money", "full"),
            "domain.trust": grant("domain.trust", "run-with-guardrails"),
          },
        },
        { op: "set", path: ["waivers"], value: [waiver("waiver.money.b", "domain.money", "spend", "spend")] },
      ],
      [["businessSlug"], ["killSwitch"], ["grants"], ["waivers"]],
    ),
  );

  commit(
    dir,
    handle,
    handle.ledgerPath,
    buildPatch(
      "budget-ledger",
      [
        {
          op: "set",
          path: ["balances"],
          value: [
            { unit: "Revenue", period, currency: "USD", allocated: 1000, committed: 0, spent: 0, remaining: 1000, updatedAt: "2026-08-01T00:00:00.000Z" },
          ],
        },
        { op: "set", path: ["entries"], value: [] },
      ],
      [["balances"], ["entries"]],
    ),
  );

  writeJson(handle.catalogPath, parityCatalog());
  writeJson(handle.briefPath, { schemaVersion: "1.0.0", businessSlug: name, founderContact: { email: "founder@example.com" } });

  return handle;
}

function readRunState(dir: string): RunStateDocument {
  const runStatePath = path.join(dir, "run", "run-state.json");
  return JSON.parse(readFileSync(runStatePath, "utf8")) as RunStateDocument;
}

interface ProfileOutcome {
  readonly runtime: string;
  readonly maxConcurrency: number;
  readonly perNode: Record<string, { status: string; blocker?: string }>;
  readonly approvals: Record<string, string>;
}

/**
 * Bootstraps a FRESH, independent workspace per profile — deliberately not a filesystem copy of a
 * shared source. The reducer's manifest tracks each committed document by its own ABSOLUTE path
 * (kernel/reducer/cli.ts's `manifest.entries[filePath]`); a naive `cpSync` of a bootstrapped
 * workspace carries over a manifest keyed by the SOURCE directory's paths, so the copy's own
 * commits see "file exists on disk but is not tracked in the manifest" and reject as tampered —
 * which, for a spend node's estimate patch, never advances the node past "ready" and gets
 * re-attempted every dispatch pass until the wall-clock cap, not a fast, loud failure. (Recorded
 * the hard way: this suite's first draft hung for the full 1800s cap before this was found — see
 * the U9 completion report's "deviations" section.) Re-running the identical bootstrap sequence
 * per profile is slightly more subprocess overhead than a copy would have been, but it is byte-
 * identical in the ways that matter (same catalog, same grants/waivers/balances, same "now"
 * timestamps) and never carries a stale absolute-path manifest into a directory it doesn't match.
 */
function runProfile(harness: Harness, profile: RuntimeCapabilityProfile): ProfileOutcome {
  const handle = bootstrapWorkspace(harness, `session-${profile.runtime}`);

  const invocation: SessionInvocation = {
    workspaceDir: handle.dir,
    briefPath: handle.briefPath,
    sessionId: `sess-parity-${profile.runtime}`,
    // A short, real bound (not the production default) — a logic bug that fails to retire a ready
    // node should surface as a fast test failure, never a multi-minute hang.
    wallClockSeconds: 60,
    executor: "fixture",
    maxConcurrency: profile.maxConcurrency,
  };
  const innerArgs = buildSessionRunArgs(invocation);
  assert(innerArgs.includes("--max-concurrency"), `expected buildSessionRunArgs to carry --max-concurrency for ${profile.runtime}`);

  const result = runSession(innerArgs);
  assert(result.code === 0, `expected a clean exit for ${profile.runtime} (maxConcurrency=${profile.maxConcurrency}), got ${result.code}: ${result.output}`);

  const run = readRunState(handle.dir);
  const perNode: ProfileOutcome["perNode"] = {};
  for (const [nodeId, state] of Object.entries(run.nodes)) {
    perNode[nodeId] = { status: state.status, blocker: state.blocker };
  }
  return { runtime: profile.runtime, maxConcurrency: profile.maxConcurrency, perNode, approvals: run.approvals };
}

export function register(harness: Harness): void {
  harness.check(
    "parity: identical node reachability, approval requirements, and parked reasons across every capability profile — differences confined to concurrency",
    () => {
      const profiles: RuntimeCapabilityProfile[] = [createClaudeProfile(), createCodexProfile(), createCursorProfile(), createInlineProfile()];
      assert(profiles.length === 4, "expected exactly 4 profiles under test (3 founder-facing + inline)");

      const outcomes = profiles.map((profile) => runProfile(harness, profile));

      const maxConcurrencies = new Set(outcomes.map((outcome) => outcome.maxConcurrency));
      assert(
        maxConcurrencies.size > 1,
        `expected at least two distinct maxConcurrency values across profiles (otherwise this suite can't distinguish 'differs only in concurrency' from 'differs in nothing'), got ${JSON.stringify([...maxConcurrencies])}`,
      );

      const [baseline, ...rest] = outcomes;
      assert(baseline !== undefined, "expected at least one profile outcome");

      const nodeIds = Object.keys(baseline.perNode).sort();
      assert(nodeIds.length === 5, `expected 5 fixture nodes in run state, got ${nodeIds.length}: ${JSON.stringify(nodeIds)}`);

      // Sanity: the fixture actually exercises every outcome shape it claims to (never a vacuous parity check).
      const statuses = new Set(nodeIds.map((id) => baseline.perNode[id]!.status));
      assert(statuses.has("succeeded"), `expected at least one succeeded node in the baseline, got statuses: ${JSON.stringify([...statuses])}`);
      assert(
        statuses.has("blocked") || statuses.has("waiting_founder"),
        `expected at least one parked/waiting node in the baseline, got statuses: ${JSON.stringify([...statuses])}`,
      );

      for (const outcome of rest) {
        const otherIds = Object.keys(outcome.perNode).sort();
        assert(
          JSON.stringify(otherIds) === JSON.stringify(nodeIds),
          `${outcome.runtime}: node id set must match the baseline's, got ${JSON.stringify(otherIds)} vs ${JSON.stringify(nodeIds)}`,
        );

        for (const nodeId of nodeIds) {
          const base = baseline.perNode[nodeId]!;
          const other = outcome.perNode[nodeId]!;
          assert(
            base.status === other.status,
            `${outcome.runtime}: node "${nodeId}" status diverged from baseline "${baseline.runtime}" — expected "${base.status}", got "${other.status}" (reachability must be profile-invariant, R3)`,
          );
          assert(
            (base.blocker ?? "") === (other.blocker ?? ""),
            `${outcome.runtime}: node "${nodeId}" parked-reason diverged from baseline "${baseline.runtime}" — expected ${JSON.stringify(base.blocker)}, got ${JSON.stringify(other.blocker)}`,
          );
        }

        assert(
          JSON.stringify(outcome.approvals) === JSON.stringify(baseline.approvals),
          `${outcome.runtime}: approvals map diverged from baseline "${baseline.runtime}" — expected ${JSON.stringify(baseline.approvals)}, got ${JSON.stringify(outcome.approvals)}`,
        );
      }
    },
  );

  harness.check("parity: founderFacingRuntimeIds excludes inline, but this suite deliberately tests inline too (plan's 'plus inline' scope)", () => {
    assert(!founderFacingRuntimeIds.includes("inline"), "inline must stay excluded from the founder-facing set used elsewhere (e.g. rehearsal criteria)");
    assert(founderFacingRuntimeIds.length === 3, `expected exactly 3 founder-facing runtimes, got ${JSON.stringify(founderFacingRuntimeIds)}`);
  });
}
