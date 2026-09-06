import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "../fixtures/_harness.js";
import { laneKeys, type RunStateDocument } from "../../../kernel/schema/types.js";
import type { CatalogInput } from "../../../kernel/engine/compile.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";

/**
 * Shared workspace-bootstrap helper for the LaunchBench-ported scenario checks in this directory
 * (U9's port ledger disposition: "port as executable fixture checks against the new core where
 * the subject exists"). Deliberately named with a leading underscore (matches
 * verification/{fixtures,boundaries}/_*.ts) so it reads as shared plumbing, not a registrable
 * suite on its own — nothing under checks/verification/scenarios/ is auto-discovered directly; each
 * scenario's register(harness) is imported and re-registered by
 * checks/verification/fixtures/scenarios.fixtures.ts, which IS auto-discovered.
 *
 * This is a deliberately smaller subset of session.fixtures.ts's own bootstrapWorkspace (no
 * grants/waivers/balances/pending-gates options) — the scenarios here care about the
 * durable-state/subprocess-boundary story, not the full autonomy decision surface U4/U5 already
 * cover exhaustively.
 */

const tsxBin = resolveTsxBin(skillRoot);
const reducerCliPath = path.join(skillRoot, "kernel/reducer/cli.ts");
const runCliPath = path.join(skillRoot, "kernel/session/run.ts");

export interface CliResult {
  readonly code: number;
  readonly output: string;
}

export function runReducer(args: string[], input?: string): CliResult {
  const result = spawnSync(tsxBin, [reducerCliPath, ...args], { cwd: skillRoot, encoding: "utf8", input });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

/** A REAL, separate OS process per call — no shared JS heap with the caller or with any prior runSession() call. This is what makes the continuity scenario a genuine cross-process proof, not an in-memory one. */
export function runSession(args: string[]): CliResult {
  const env = { ...process.env };
  delete env.RESEND_API_KEY;
  const result = spawnSync(tsxBin, [runCliPath, ...args], { cwd: skillRoot, encoding: "utf8", env });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

export function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

let patchCounter = 0;
function nextPatchId(): string {
  patchCounter += 1;
  return `scenario-fixture-patch-${patchCounter}`;
}

function buildPatch(targetDoc: string, ops: Array<Record<string, unknown>>, declaredOutputs: string[][]): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    patchId: nextPatchId(),
    targetDoc,
    reason: "scenario fixture setup",
    authoredBy: "scenario-fixture-setup",
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

export interface ScenarioWorkspace {
  readonly dir: string;
  readonly statePath: string;
  readonly controlPath: string;
  readonly ledgerPath: string;
  readonly manifestPath: string;
  readonly auditPath: string;
  readonly catalogPath: string;
  readonly briefPath: string;
  readonly runStatePath: string;
  readonly digestPath: (sessionId: string) => string;
}

export interface BootstrapOptions {
  readonly grants?: Record<string, unknown>;
}

function commit(handle: ScenarioWorkspace, targetFile: string, patch: Record<string, unknown>): void {
  const patchPath = path.join(handle.dir, `${patch.patchId as string}.json`);
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
    "scenario-fixture-setup",
    "--founder-authority",
    "true",
  ]);
  assert(result.code === 0, `scenario workspace bootstrap commit failed: ${result.output}`);
}

export function bootstrapScenarioWorkspace(harness: Harness, name: string, catalog: CatalogInput, options: BootstrapOptions = {}): ScenarioWorkspace {
  const dir = harness.makeTempDir(`scenario-${name}`);
  const handle: ScenarioWorkspace = {
    dir,
    statePath: path.join(dir, "state", "business-state.json"),
    controlPath: path.join(dir, "control", "control.json"),
    ledgerPath: path.join(dir, "control", "budget-ledger.json"),
    manifestPath: path.join(dir, "control", "manifest.json"),
    auditPath: path.join(dir, "control", "audit.jsonl"),
    catalogPath: path.join(dir, "catalog.json"),
    briefPath: path.join(dir, "brief.json"),
    runStatePath: path.join(dir, "run", "run-state.json"),
    digestPath: (sessionId: string) => path.join(dir, "digests", `${sessionId}.md`),
  };

  commit(
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
            name: "Scenario Fixture App",
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
    handle,
    handle.controlPath,
    buildPatch(
      "control",
      [
        { op: "set", path: ["businessSlug"], value: name },
        { op: "set", path: ["killSwitch"], value: { engaged: false, engagedAt: "", engagedBy: "", reason: "" } },
        { op: "set", path: ["grants"], value: options.grants ?? {} },
        { op: "set", path: ["waivers"], value: [] },
      ],
      [["businessSlug"], ["killSwitch"], ["grants"], ["waivers"]],
    ),
  );

  commit(
    handle,
    handle.ledgerPath,
    buildPatch(
      "budget-ledger",
      [
        { op: "set", path: ["balances"], value: [] },
        { op: "set", path: ["entries"], value: [] },
      ],
      [["balances"], ["entries"]],
    ),
  );

  writeJson(handle.catalogPath, catalog);
  writeJson(handle.briefPath, { schemaVersion: "1.0.0", businessSlug: name, founderContact: { email: "founder@example.com" } });

  return handle;
}

export function grant(domainId: string, level: string, now = "2026-08-01T00:00:00.000Z"): Record<string, unknown> {
  return { domainId, level, prerequisites: [], grantedAt: now, grantedBy: "founder", updatedAt: now };
}

export function readRunState(handle: ScenarioWorkspace): RunStateDocument {
  return JSON.parse(readFileSync(handle.runStatePath, "utf8")) as RunStateDocument;
}

export function readDigest(handle: ScenarioWorkspace, sessionId: string): string {
  const filePath = handle.digestPath(sessionId);
  assert(existsSync(filePath), `expected a digest file at ${filePath}`);
  return readFileSync(filePath, "utf8");
}
