import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { laneKeys } from "../../../kernel/schema/types.js";
import { AUDIT_GENESIS_HASH, appendAuditEntry, readAuditLog, verifyAuditChain } from "../../../kernel/reducer/audit.js";
import { acquireLock, checkYield, heartbeat, readLock, releaseLock, requestInteractive } from "../../../kernel/reducer/lock.js";
import { sha256Hex, validatePatchShape, type StatePatch } from "../../../kernel/reducer/patch.js";
import {
  loadCurrentTruthFile,
  refreshCurrentTruthForRead,
  reconcileCurrentTruth,
  validateCurrentTruthSemantics,
  type ReconcileReceipt,
} from "../../../kernel/reducer/current-truth.js";
import { resolveTsxBin } from "../../../tooling/lib/tsx-bin.js";

const tsxBin = resolveTsxBin(skillRoot);
const cliPath = path.join(skillRoot, "kernel/reducer/cli.ts");

interface CliResult {
  readonly code: number;
  readonly output: string;
}

function runCli(args: string[], input?: string): CliResult {
  const result = spawnSync(tsxBin, [cliPath, ...args], { cwd: skillRoot, encoding: "utf8", input });
  return { code: result.status ?? -1, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

interface ScenarioPaths {
  readonly dir: string;
  readonly file: string;
  readonly manifest: string;
  readonly audit: string;
  readonly lock: string;
}

function scenarioPaths(harness: Harness, name: string, fileName = "business-state.json"): ScenarioPaths {
  const dir = harness.makeTempDir(`reducer-${name}`);
  const file = path.join(dir, fileName);
  return { dir, file, manifest: path.join(dir, "manifest.json"), audit: path.join(dir, "audit.jsonl"), lock: `${file}.lock` };
}

let patchCounter = 0;
function nextPatchId(): string {
  patchCounter += 1;
  return `patch-${patchCounter}`;
}

function buildPatch(
  targetDoc: string,
  ops: Array<Record<string, unknown>>,
  declaredOutputs: string[][],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    patchId: nextPatchId(),
    targetDoc,
    reason: "fixture patch",
    authoredBy: "session-fixture",
    authoredAt: "2026-08-04T12:00:00.000Z",
    preconditions: [],
    ops,
    declaredOutputs,
    ...overrides,
  };
}

function minimalLanes(): Record<string, unknown> {
  const lanes: Record<string, unknown> = {};
  for (const key of laneKeys) lanes[key] = { status: "pending", evidence: [], blockers: [] };
  return lanes;
}

function businessStateBootstrapPatch(): Record<string, unknown> {
  return buildPatch(
    "business-state",
    [
      { op: "set", path: ["narrative"], value: { sinceLastTime: "", rightNow: "", yourCall: "", lastCelebratedPhase: "" } },
      {
        op: "set",
        path: ["project"],
        value: {
          name: "App",
          slug: "app",
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
  );
}

function controlBootstrapPatch(): Record<string, unknown> {
  return buildPatch(
    "control",
    [
      { op: "set", path: ["businessSlug"], value: "app" },
      { op: "set", path: ["killSwitch"], value: { engaged: false, engagedAt: "", engagedBy: "", reason: "" } },
      { op: "set", path: ["grants"], value: {} },
      { op: "set", path: ["waivers"], value: [] },
    ],
    [["businessSlug"], ["killSwitch"], ["grants"], ["waivers"]],
  );
}

function grantsBootstrapPatch(): Record<string, unknown> {
  return buildPatch("grants", [{ op: "set", path: ["grants"], value: {} }], [["grants"]]);
}

function waiversBootstrapPatch(): Record<string, unknown> {
  return buildPatch("waivers", [{ op: "set", path: ["waivers"], value: [] }], [["waivers"]]);
}

function budgetLedgerBootstrapPatch(): Record<string, unknown> {
  return buildPatch(
    "budget-ledger",
    [
      { op: "set", path: ["balances"], value: [] },
      { op: "set", path: ["entries"], value: [] },
    ],
    [["balances"], ["entries"]],
  );
}

function sampleLedgerEntry(id: string): Record<string, unknown> {
  return {
    id,
    unit: "Growth",
    domainId: "domain.growth",
    period: "2026-08",
    estimate: { amount: 5, currency: "USD", declaredAt: "2026-08-04T12:00:00.000Z" },
    actual: null,
    status: "estimated",
    auditRef: `audit.${id}`,
  };
}

function commit(dir: string, target: ScenarioPaths, patch: Record<string, unknown>, extraArgs: string[] = []): CliResult {
  const patchPath = path.join(dir, `${patch.patchId as string}.json`);
  writeJson(patchPath, patch);
  // These scenarios exercise reducer mechanics as a founder-authorized caller, so autonomy-doc
  // patches (control/grants/waivers) carry --founder-authority. The gate's own rejection path is
  // covered by a dedicated fixture below.
  return runCli([
    "commit",
    "--patch",
    patchPath,
    "--file",
    target.file,
    "--manifest",
    target.manifest,
    "--audit",
    target.audit,
    "--session",
    "session-fixture",
    "--founder-authority",
    "true",
    ...extraArgs,
  ]);
}

export function register(harness: Harness): void {
  // --- patch.ts shape validation (in-process, no subprocess needed) -----------------------

  harness.check("reducer/patch: shape validation rejects empty ops, empty declaredOutputs, and an unknown targetDoc", () => {
    const base = buildPatch("business-state", [{ op: "set", path: ["project"], value: {} }], [["project"]]);
    const noOps = validatePatchShape({ ...base, ops: [] } as unknown as StatePatch);
    assert(
      noOps.some((issue) => issue.code === "patch.empty_ops"),
      `expected patch.empty_ops, got: ${JSON.stringify(noOps)}`,
    );
    const noOutputs = validatePatchShape({ ...base, declaredOutputs: [] } as unknown as StatePatch);
    assert(
      noOutputs.some((issue) => issue.code === "patch.empty_declared_outputs"),
      `expected patch.empty_declared_outputs, got: ${JSON.stringify(noOutputs)}`,
    );
    const badTarget = validatePatchShape({ ...base, targetDoc: "not-a-real-target" } as unknown as StatePatch);
    assert(
      badTarget.some((issue) => issue.code === "patch.unknown_target"),
      `expected patch.unknown_target, got: ${JSON.stringify(badTarget)}`,
    );
    const currentTruthPatch = validatePatchShape(buildPatch("current-truth", [{ op: "remove", path: ["evidence"] }], [["evidence"]]) as unknown as StatePatch);
    assert(
      currentTruthPatch.some((issue) => issue.code === "patch.reconcile_only_target"),
      `expected patch.reconcile_only_target, got: ${JSON.stringify(currentTruthPatch)}`,
    );
    assert(!currentTruthPatch.some((issue) => issue.code === "patch.unknown_target"), "current-truth must stay a known reducer target");
  });

  // --- founder-authority gate: autonomy-doc patches require --founder-authority ------------

  harness.check("reducer: a control/grants/waivers patch without --founder-authority is rejected (autonomous work cannot self-grant)", () => {
    const p = scenarioPaths(harness, "founder-authority-gate", "control.json");
    const patch = controlBootstrapPatch();
    const patchPath = path.join(p.dir, `${patch.patchId as string}.json`);
    writeJson(patchPath, patch);
    // Directly via runCli WITHOUT --founder-authority — the shape the autonomous session runner
    // would produce if it ever tried to write an autonomy document.
    const denied = runCli(["commit", "--patch", patchPath, "--file", p.file, "--manifest", p.manifest, "--audit", p.audit, "--session", "autonomous-session"]);
    assert(denied.code === 1, `expected exit 1 (rejected), got ${denied.code}: ${denied.output}`);
    assert(denied.output.includes("reducer.founder_authority_required"), `expected the founder-authority issue code, got: ${denied.output}`);
    assert(!existsSync(p.file), "control.json must not be written when the authority gate rejects the patch");
    // The same patch WITH the flag (as onboarding/approve pass it) commits normally.
    const allowed = commit(p.dir, p, controlBootstrapPatch());
    assert(allowed.code === 0, `expected the founder-authorized commit to succeed, got ${allowed.code}: ${allowed.output}`);
  });

  // --- required scenario 1: a patch omitting a declared output rejects, fail-closed --------

  harness.check("reducer: bootstrap commit creates the document, a manifest entry, and audit entry #1", () => {
    const p = scenarioPaths(harness, "bootstrap");
    const result = commit(p.dir, p, businessStateBootstrapPatch());
    assert(result.code === 0, `expected exit 0, got ${result.code}: ${result.output}`);
    assert(result.output.includes("RESULT: committed"), `expected a committed result, got: ${result.output}`);
    assert(existsSync(p.file), "business-state.json was not written");

    const doc = readJson<{ schemaVersion: string; lanes: Record<string, unknown> }>(p.file);
    assert(doc.schemaVersion === "2.0.0", `expected schemaVersion 2.0.0, got ${doc.schemaVersion}`);
    assert(Object.keys(doc.lanes).length === laneKeys.length, "not all lanes were written by the bootstrap patch");

    const manifest = readJson<{ entries: Record<string, { stateHash: string }> }>(p.manifest);
    const entry = manifest.entries[path.resolve(p.file)];
    assert(Boolean(entry), "manifest has no entry for the committed file");
    const onDiskHash = sha256Hex(readFileSync(p.file, "utf8"));
    assert(entry!.stateHash === onDiskHash, "manifest stateHash does not match the file's actual content hash");

    const audit = readAuditLog(p.audit);
    assert(audit.length === 1 && audit[0]!.seq === 1, "expected exactly one audit entry with seq 1");
    assert(audit[0]!.previousHash === AUDIT_GENESIS_HASH, "the first audit entry must chain to genesis");
    assert(!existsSync(p.lock), "the lock file was not released after a successful commit");
  });

  // --- providers access-route cross-check: schema enum + manifest declaration --------------

  harness.check("reducer: a providers patch selecting a route the manifest does not declare is rejected, file untouched", () => {
    const p = scenarioPaths(harness, "access-route-undeclared");
    const bootstrap = commit(p.dir, p, businessStateBootstrapPatch());
    assert(bootstrap.code === 0, `bootstrap failed: ${bootstrap.output}`);
    const before = readFileSync(p.file, "utf8");

    const rejected = commit(
      p.dir,
      p,
      buildPatch("business-state", [{ op: "set", path: ["providers"], value: { higgsfield: { accessRoute: "browser" } } }], [["providers"]]),
    );
    assert(rejected.code === 1, `expected exit 1 (rejected), got ${rejected.code}: ${rejected.output}`);
    assert(rejected.output.includes("reducer.access_route_undeclared"), `expected reducer.access_route_undeclared, got: ${rejected.output}`);
    assert(readFileSync(p.file, "utf8") === before, "the document changed on disk despite the cross-check rejection (transactional guarantee broken)");

    const committed = commit(
      p.dir,
      p,
      buildPatch("business-state", [{ op: "set", path: ["providers"], value: { higgsfield: { accessRoute: "mcp" } } }], [["providers"]]),
    );
    assert(committed.code === 0, `expected the declared route to commit, got ${committed.code}: ${committed.output}`);
    assert(committed.output.includes("RESULT: committed"), `expected a committed result, got: ${committed.output}`);
  });

  harness.check("reducer: a providers patch with a value outside the accessRoute enum is rejected at the schema layer", () => {
    const p = scenarioPaths(harness, "access-route-enum");
    const bootstrap = commit(p.dir, p, businessStateBootstrapPatch());
    assert(bootstrap.code === 0, `bootstrap failed: ${bootstrap.output}`);
    const rejected = commit(
      p.dir,
      p,
      buildPatch("business-state", [{ op: "set", path: ["providers"], value: { higgsfield: { accessRoute: "carrier_pigeon" } } }], [["providers"]]),
    );
    assert(rejected.code === 1, `expected exit 1 (rejected), got ${rejected.code}: ${rejected.output}`);
    assert(!rejected.output.includes("reducer.access_route_undeclared"), "an enum violation must be caught by the schema step, not reach the cross-check");
    assert(rejected.output.includes("accessRoute"), `expected a schema issue naming accessRoute, got: ${rejected.output}`);
  });

  harness.check("reducer: a providers patch for a tool with no manifest entry skips the cross-check and commits", () => {
    const p = scenarioPaths(harness, "access-route-non-manifest");
    const bootstrap = commit(p.dir, p, businessStateBootstrapPatch());
    assert(bootstrap.code === 0, `bootstrap failed: ${bootstrap.output}`);
    const committed = commit(
      p.dir,
      p,
      buildPatch("business-state", [{ op: "set", path: ["providers"], value: { cloudflare: { accessRoute: "api" } } }], [["providers"]]),
    );
    assert(committed.code === 0, `expected the non-manifest tool to commit, got ${committed.code}: ${committed.output}`);
  });

  harness.check("reducer: a patch omitting a declared output is rejected, and no partial write lands", () => {
    const p = scenarioPaths(harness, "declared-output-missing", "budget-ledger.json");
    const boot = commit(p.dir, p, budgetLedgerBootstrapPatch());
    assert(boot.code === 0, `bootstrap failed: ${boot.output}`);
    const before = readFileSync(p.file, "utf8");
    const manifestBefore = readFileSync(p.manifest, "utf8");
    const auditBefore = readFileSync(p.audit, "utf8");

    // Declares "balances" as the output it changes, but its only op touches "entries" instead.
    const badPatch = buildPatch("budget-ledger", [{ op: "append", path: ["entries"], value: sampleLedgerEntry("e1") }], [["balances"]]);
    const result = commit(p.dir, p, badPatch);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
    assert(result.output.includes("patch.declared_output_missing"), `expected patch.declared_output_missing, got: ${result.output}`);
    assert(result.output.includes("patch.undeclared_mutation"), `expected patch.undeclared_mutation for the un-declared entries write, got: ${result.output}`);

    assert(readFileSync(p.file, "utf8") === before, "the target file changed despite a rejected patch (no transactional guarantee)");
    assert(readFileSync(p.manifest, "utf8") === manifestBefore, "the manifest changed despite a rejected patch");
    assert(readFileSync(p.audit, "utf8") === auditBefore, "the audit log changed despite a rejected patch");
  });

  harness.check("reducer: a patch that tries to set a reducer-managed field is rejected before touching disk", () => {
    const p = scenarioPaths(harness, "protected-field", "budget-ledger.json");
    const patch = buildPatch("budget-ledger", [{ op: "set", path: ["schemaVersion"], value: "9.9.9" }], [["schemaVersion"]]);
    const result = commit(p.dir, p, patch);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
    assert(result.output.includes("patch.protected_field"), `expected patch.protected_field, got: ${result.output}`);
    assert(!existsSync(p.file), "a rejected bootstrap patch must not create the file");
  });

  harness.check("reducer: a failed precondition rejects before any write", () => {
    const p = scenarioPaths(harness, "precondition-failed", "control.json");
    const boot = commit(p.dir, p, controlBootstrapPatch());
    assert(boot.code === 0, `bootstrap failed: ${boot.output}`);
    const before = readFileSync(p.file, "utf8");

    const patch = buildPatch(
      "control",
      [{ op: "set", path: ["killSwitch"], value: { engaged: true, engagedAt: "2026-08-04T12:10:00.000Z", engagedBy: "founder", reason: "test" } }],
      [["killSwitch"]],
      { preconditions: [{ path: ["killSwitch", "engaged"], operator: "equals", value: true }] }, // currently false: precondition must fail
    );
    const result = commit(p.dir, p, patch);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
    assert(result.output.includes("patch.precondition_failed"), `expected patch.precondition_failed, got: ${result.output}`);
    assert(readFileSync(p.file, "utf8") === before, "the target file changed despite a failed precondition");
  });

  // --- transactional apply: failed schema validation leaves no partial write ---------------

  harness.check("reducer: a schema-invalid candidate is rejected, and the prior valid commit is preserved byte-for-byte", () => {
    const p = scenarioPaths(harness, "schema-invalid");
    const boot = commit(p.dir, p, businessStateBootstrapPatch());
    assert(boot.code === 0, `bootstrap failed: ${boot.output}`);
    const before = readFileSync(p.file, "utf8");

    const patch = buildPatch("business-state", [{ op: "set", path: ["project", "launchScope"], value: "bogus" }], [["project", "launchScope"]]);
    const result = commit(p.dir, p, patch);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
    assert(result.output.includes("schema."), `expected an AJV schema.* issue code, got: ${result.output}`);
    assert(readFileSync(p.file, "utf8") === before, "the file changed despite a schema-invalid rejected patch");

    const audit = readAuditLog(p.audit);
    assert(audit.length === 1, "a rejected commit must not append an audit entry");
  });

  // --- required scenario 2: out-of-band edit between commits fails the next preflight ------

  harness.check("reducer: an out-of-band edit between commits fails the next preflight with a named error", () => {
    const p = scenarioPaths(harness, "out-of-band-preflight", "budget-ledger.json");
    const boot = commit(p.dir, p, budgetLedgerBootstrapPatch());
    assert(boot.code === 0, `bootstrap failed: ${boot.output}`);

    const preOk = runCli(["preflight", "--manifest", p.manifest]);
    assert(preOk.code === 0, `expected a clean preflight, got ${preOk.code}: ${preOk.output}`);

    // Simulate an out-of-band edit: mutate the file directly, bypassing the reducer entirely.
    const doc = readJson<{ balances: unknown[] }>(p.file);
    doc.balances = [
      { unit: "Growth", period: "x", currency: "USD", allocated: 1, committed: 0, spent: 0, remaining: 1, updatedAt: "2026-08-04T12:00:00.000Z" },
    ];
    writeJson(p.file, doc);

    const preflight = runCli(["preflight", "--manifest", p.manifest]);
    assert(preflight.code === 3, `expected exit 3, got ${preflight.code}: ${preflight.output}`);
    assert(preflight.output.includes("reducer.out_of_band_edit"), `expected reducer.out_of_band_edit, got: ${preflight.output}`);

    // The same tamper is also caught defensively by the next commit attempt, not only by standalone preflight.
    const patch = buildPatch("budget-ledger", [{ op: "append", path: ["entries"], value: sampleLedgerEntry("e1") }], [["entries"]]);
    const commitAfterTamper = commit(p.dir, p, patch);
    assert(commitAfterTamper.code === 3, `expected exit 3, got ${commitAfterTamper.code}: ${commitAfterTamper.output}`);
    assert(commitAfterTamper.output.includes("reducer.out_of_band_edit"), `expected reducer.out_of_band_edit, got: ${commitAfterTamper.output}`);
  });

  // --- required scenario 3: lock contention, stale-lock breaking, heartbeat refresh --------

  harness.check("reducer: commit backs off and reports 'did not run' while another session holds a live lock", () => {
    const p = scenarioPaths(harness, "lock-contention", "budget-ledger.json");
    const held = acquireLock(p.lock, { ownerSessionId: "other-session", ttlSeconds: 60 });
    assert(held.ok, "test setup: failed to pre-acquire the lock");

    const patch = budgetLedgerBootstrapPatch();
    const result = commit(p.dir, p, patch, ["--lock-retries", "1", "--lock-retry-delay-ms", "10"]);
    assert(result.code === 2, `expected exit 2, got ${result.code}: ${result.output}`);
    assert(result.output.includes("RESULT: did not run"), `expected "did not run", got: ${result.output}`);
    assert(result.output.includes("reducer.lock_held"), `expected reducer.lock_held, got: ${result.output}`);
    assert(!existsSync(p.file), "no file should have been written while the lock was contended");

    releaseLock(p.lock, "other-session");
    const retry = commit(p.dir, p, patch);
    assert(retry.code === 0, `expected the retry after release to succeed, got ${retry.code}: ${retry.output}`);
  });

  harness.check("reducer: a stale lock is only breakable with the explicit read-back-verified flag", () => {
    const p = scenarioPaths(harness, "lock-stale", "budget-ledger.json");
    const held = acquireLock(p.lock, { ownerSessionId: "dead-session", ttlSeconds: 1 });
    assert(held.ok, "test setup: failed to pre-acquire the lock");
    const lock = readLock(p.lock)!;
    writeJson(p.lock, { ...lock, heartbeatAt: new Date(Date.now() - 30_000).toISOString() });

    const patch = budgetLedgerBootstrapPatch();
    const withoutFlag = commit(p.dir, p, patch, ["--lock-retries", "0"]);
    assert(withoutFlag.code === 2, `expected exit 2 without the break-stale flag, got ${withoutFlag.code}: ${withoutFlag.output}`);
    assert(withoutFlag.output.includes("reducer.lock_stale_requires_break"), `expected reducer.lock_stale_requires_break, got: ${withoutFlag.output}`);
    assert(!existsSync(p.file), "no file should have been written without the break-stale flag");

    const withFlag = commit(p.dir, p, patch, ["--break-stale-verified", "true"]);
    assert(withFlag.code === 0, `expected the break-stale commit to succeed, got ${withFlag.code}: ${withFlag.output}`);
  });

  harness.check("reducer/lock: heartbeat refresh prevents a live lock from ever reading as stale", () => {
    const dir = harness.makeTempDir("reducer-lock-heartbeat");
    const lockPath = path.join(dir, "state.lock");
    const acquired = acquireLock(lockPath, { ownerSessionId: "scheduled-1", ttlSeconds: 1 });
    assert(acquired.ok, "failed to acquire the lock");
    for (let i = 0; i < 3; i += 1) {
      heartbeat(lockPath, "scheduled-1");
      const attempt = acquireLock(lockPath, { ownerSessionId: "someone-else", ttlSeconds: 1, retries: 0 });
      assert(!attempt.ok && attempt.reason === "held", `expected a heartbeat-refreshed lock to read as held (never stale), got: ${JSON.stringify(attempt)}`);
    }
    releaseLock(lockPath, "scheduled-1");
  });

  // --- required scenario 4: audit chain break detection + append-only ----------------------

  harness.check("reducer/audit: appendAuditEntry chains each entry to the previous entry's hash from genesis", () => {
    const dir = harness.makeTempDir("reducer-audit-unit");
    const auditPath = path.join(dir, "audit.jsonl");
    const e1 = appendAuditEntry(
      auditPath,
      { sessionId: "s", targetDoc: "control", patchId: "p1", action: "commit", summary: "one", stateHash: "h1" },
      "2026-08-04T12:00:00.000Z",
    );
    const e2 = appendAuditEntry(
      auditPath,
      { sessionId: "s", targetDoc: "control", patchId: "p2", action: "commit", summary: "two", stateHash: "h2" },
      "2026-08-04T12:05:00.000Z",
    );
    assert(e1.previousHash === AUDIT_GENESIS_HASH, "the first entry must chain to genesis");
    assert(e2.previousHash === e1.entryHash, "the second entry must chain to the first entry's hash");
    assert(e1.seq === 1 && e2.seq === 2, "sequence numbers must increment by one");
    const verification = verifyAuditChain(auditPath);
    assert(verification.valid && verification.entriesChecked === 2, `expected a clean two-entry chain, got: ${JSON.stringify(verification)}`);
  });

  harness.check("reducer: audit chain verification fails when a historical entry is mutated, alongside the append-only property", () => {
    const p = scenarioPaths(harness, "audit-chain", "budget-ledger.json");
    const r0 = commit(p.dir, p, budgetLedgerBootstrapPatch());
    assert(r0.code === 0, `commit 0 failed: ${r0.output}`);
    const afterFirst = readFileSync(p.audit, "utf8");

    const patch1 = buildPatch("budget-ledger", [{ op: "append", path: ["entries"], value: sampleLedgerEntry("e1") }], [["entries"]]);
    const r1 = commit(p.dir, p, patch1);
    assert(r1.code === 0, `commit 1 failed: ${r1.output}`);

    // append-only: the first entry's bytes are unchanged, and the log only grew.
    const afterSecond = readFileSync(p.audit, "utf8");
    assert(afterSecond.startsWith(afterFirst), "the audit log's first entry changed after a later append (not append-only)");
    assert(readAuditLog(p.audit).length === 2, "expected exactly two audit entries after two successful commits");

    const verify = runCli(["verify-audit", "--audit", p.audit]);
    assert(verify.code === 0, `expected a clean audit chain, got ${verify.code}: ${verify.output}`);

    // Mutate a historical entry directly (never via the reducer) and assert the break is detected.
    const lines = readFileSync(p.audit, "utf8").trimEnd().split("\n");
    const first = JSON.parse(lines[0]!) as { summary: string };
    first.summary = "TAMPERED";
    lines[0] = JSON.stringify(first);
    writeFileSync(p.audit, `${lines.join("\n")}\n`, "utf8");

    const brokenVerify = runCli(["verify-audit", "--audit", p.audit]);
    assert(brokenVerify.code === 3, `expected exit 3 after tampering, got ${brokenVerify.code}: ${brokenVerify.output}`);
    assert(brokenVerify.output.includes("reducer.audit_chain_broken"), `expected reducer.audit_chain_broken, got: ${brokenVerify.output}`);

    const direct = verifyAuditChain(p.audit);
    assert(!direct.valid && direct.brokenAtSeq === 1, `expected verifyAuditChain to report the break at seq 1, got: ${JSON.stringify(direct)}`);
  });

  // --- required scenario 5: cooperative yield acquires only at a batch boundary ------------

  harness.check("reducer/lock: a pending interactive request is honored only at the scheduled holder's next batch boundary, never mid-attempt", () => {
    const dir = harness.makeTempDir("reducer-lock-cooperative-yield");
    const lockPath = path.join(dir, "state.lock");

    const scheduled = acquireLock(lockPath, { ownerSessionId: "scheduled-session", ttlSeconds: 60 });
    assert(scheduled.ok, "scheduled session failed to acquire the lock");

    // Mid-attempt: the request is signaled, but the scheduled session has not reached a batch
    // boundary yet. It must not have released, and the interactive session must not acquire.
    requestInteractive(lockPath);
    const midAttempt = acquireLock(lockPath, { ownerSessionId: "interactive-session", ttlSeconds: 60, retries: 0 });
    assert(
      !midAttempt.ok && midAttempt.reason === "held",
      "the interactive session acquired the lock mid-attempt, before the scheduled holder's batch boundary",
    );
    assert(readLock(lockPath)?.ownerSessionId === "scheduled-session", "lock ownership changed before the scheduled holder yielded");

    // The scheduled holder reaches its own batch boundary and checks for a pending request.
    const shouldYield = checkYield(lockPath, "scheduled-session");
    assert(shouldYield, "expected checkYield to report a pending interactive request at the batch boundary");
    releaseLock(lockPath, "scheduled-session");

    // Only now can the interactive session acquire.
    const afterYield = acquireLock(lockPath, { ownerSessionId: "interactive-session", ttlSeconds: 60, retries: 0 });
    assert(afterYield.ok, "interactive session failed to acquire immediately after the scheduled holder yielded at the boundary");
    releaseLock(lockPath, "interactive-session");
  });

  // --- concurrent hash-manifest correctness (judged missing, added per plan's instruction) --

  harness.check("reducer: two commits against the same file serialize through the lock; the manifest never drifts from the on-disk file", () => {
    const p = scenarioPaths(harness, "concurrent-manifest", "budget-ledger.json");
    const r0 = commit(p.dir, p, budgetLedgerBootstrapPatch());
    assert(r0.code === 0, `bootstrap failed: ${r0.output}`);

    // Simulate a second writer mid-write by holding the lock directly.
    const heldByB = acquireLock(p.lock, { ownerSessionId: "writer-b", ttlSeconds: 60 });
    assert(heldByB.ok, "test setup: writer-b failed to hold the lock");

    const patchA = buildPatch("budget-ledger", [{ op: "append", path: ["entries"], value: sampleLedgerEntry("from-a") }], [["entries"]]);
    const attemptA = commit(p.dir, p, patchA, ["--lock-retries", "0"]);
    assert(attemptA.code === 2, `expected writer-a to back off while writer-b holds the lock, got ${attemptA.code}: ${attemptA.output}`);

    const manifestDuringHold = readJson<{ entries: Record<string, { stateHash: string }> }>(p.manifest);
    const hashDuringHold = manifestDuringHold.entries[path.resolve(p.file)]!.stateHash;
    assert(hashDuringHold === sha256Hex(readFileSync(p.file, "utf8")), "the manifest must still match the on-disk file after a lock-contended, refused commit");

    releaseLock(p.lock, "writer-b");
    const attemptARetry = commit(p.dir, p, patchA);
    assert(attemptARetry.code === 0, `expected writer-a to succeed once the lock is free, got ${attemptARetry.code}: ${attemptARetry.output}`);

    const finalManifest = readJson<{ entries: Record<string, { stateHash: string }> }>(p.manifest);
    const finalHash = finalManifest.entries[path.resolve(p.file)]!.stateHash;
    assert(finalHash === sha256Hex(readFileSync(p.file, "utf8")), "the final manifest hash must match the final on-disk content (no lost update)");
    assert(readAuditLog(p.audit).length === 2, "expected exactly two committed audit entries: bootstrap + writer-a's successful retry");
  });

  // --- path-segment safety: dotted domain IDs are one key, never a nested path -------------

  harness.check('reducer: a dotted domain ID is a single map key, never a nested path (control.grants["domain.growth"])', () => {
    const p = scenarioPaths(harness, "dotted-domain-path", "control.json");
    const r0 = commit(p.dir, p, controlBootstrapPatch());
    assert(r0.code === 0, `bootstrap failed: ${r0.output}`);

    const grant = {
      domainId: "domain.growth",
      level: "run-with-guardrails",
      prerequisites: [],
      grantedAt: "2026-08-04T12:00:00.000Z",
      grantedBy: "founder",
      updatedAt: "2026-08-04T12:00:00.000Z",
    };
    const patch = buildPatch("control", [{ op: "merge", path: ["grants"], value: { "domain.growth": grant } }], [["grants"]]);
    const result = commit(p.dir, p, patch);
    assert(result.code === 0, `expected a valid grants merge to commit, got ${result.code}: ${result.output}`);

    const doc = readJson<{ grants: Record<string, unknown> }>(p.file);
    assert(
      Object.keys(doc.grants).length === 1 && "domain.growth" in doc.grants,
      `expected exactly one key "domain.growth", got: ${JSON.stringify(Object.keys(doc.grants))}`,
    );
    assert(!("domain" in doc.grants), 'the dotted domain ID was split into a nested "domain" key instead of one literal key');
  });

  // --- coverage: all five target docs route to the correct U1 validator --------------------

  harness.check("reducer: grants and waivers target docs commit as standalone documents validated against U1's schemas", () => {
    const gp = scenarioPaths(harness, "grants-standalone", "grants.json");
    const gResult = commit(gp.dir, gp, grantsBootstrapPatch());
    assert(gResult.code === 0, `grants bootstrap failed: ${gResult.output}`);
    const gDoc = readJson<{ schemaVersion: string }>(gp.file);
    assert(gDoc.schemaVersion === "1.0.0", `grants document schemaVersion mismatch: ${gDoc.schemaVersion}`);

    const wp = scenarioPaths(harness, "waivers-standalone", "waivers.json");
    const wResult = commit(wp.dir, wp, waiversBootstrapPatch());
    assert(wResult.code === 0, `waivers bootstrap failed: ${wResult.output}`);
  });

  // --- CLI reads a patch from stdin, not only from a file -----------------------------------

  harness.check("reducer: commit reads a patch from stdin when --patch is omitted", () => {
    const p = scenarioPaths(harness, "stdin-patch", "budget-ledger.json");
    const patch = budgetLedgerBootstrapPatch();
    const result = runCli(["commit", "--file", p.file, "--manifest", p.manifest, "--audit", p.audit, "--session", "session-fixture"], JSON.stringify(patch));
    assert(result.code === 0, `expected a stdin-fed commit to succeed, got ${result.code}: ${result.output}`);
    assert(existsSync(p.file), "a stdin-fed commit did not write the target file");
  });

  harness.check("reducer/current-truth: accepted provider read-back supersedes an older blocker on the same node", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const first: ReconcileReceipt = {
      receiptId: "ACT-old-blocker",
      observedAt: "2026-08-24T10:00:00.000Z",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-old",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "operator_attestation",
          observedAt: "2026-08-24T10:00:00.000Z",
          reachable: true,
          payloadHash: "sha256:old",
          accepted: false,
          summary: "Draft edit is still blocked.",
          receiptId: "ACT-old-blocker",
        },
      ],
    };
    const opened = reconcileCurrentTruth(undefined, first, now);
    assert(opened.kind === "committed", "expected first reconcile to commit");
    assert(opened.document.claims[0]?.status === "unresolved", `expected unresolved blocker, got ${opened.document.claims[0]?.status}`);
    const readback: ReconcileReceipt = {
      receiptId: "ACT-asc-draft",
      observedAt: "2026-08-24T12:00:00.000Z",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ACT-asc-draft:readback",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: "2026-08-24T12:00:00.000Z",
          reachable: true,
          payloadHash: "sha256:new",
          accepted: true,
          summary: "Provider read-back matches the approved draft copy",
          receiptId: "ACT-asc-draft",
        },
      ],
    };
    const next = reconcileCurrentTruth(opened.document, readback, now);
    assert(next.kind === "committed" && !next.noop, "expected read-back to commit");
    assert(next.document.claims[0]?.status === "active", `expected active claim, got ${next.document.claims[0]?.status}`);
    assert(next.document.evidence.length === 2, "historical evidence must remain queryable");
  });

  harness.check("reducer/current-truth: re-running the same receipt is a no-op", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const receipt: ReconcileReceipt = {
      receiptId: "ACT-asc-draft",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ACT-asc-draft:readback",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:new",
          accepted: true,
          summary: "Provider read-back matches the approved draft copy",
          receiptId: "ACT-asc-draft",
        },
      ],
    };
    const first = reconcileCurrentTruth(undefined, receipt, now);
    assert(first.kind === "committed", "expected commit");
    const second = reconcileCurrentTruth(first.document, receipt, "2026-08-24T12:05:00.000Z");
    assert(second.kind === "committed" && second.noop, "expected no-op without new evidence");
    assert(second.document.revision === first.document.revision, "no-op must keep revision");
  });

  harness.check("reducer/current-truth: unrelated graph node cannot clear a blocker", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const blocker: ReconcileReceipt = {
      receiptId: "ACT-old",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-block",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "operator_attestation",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:block",
          accepted: false,
          summary: "Draft edit is still blocked.",
          receiptId: "ACT-old",
        },
      ],
    };
    const opened = reconcileCurrentTruth(undefined, blocker, now);
    assert(opened.kind === "committed", "expected blocker commit");
    const unrelated: ReconcileReceipt = {
      receiptId: "ACT-other",
      observedAt: now,
      affectedGraphNodeIds: ["pricing.territory.update"],
      evidence: [
        {
          id: "ev-other",
          graphNodeId: "pricing.territory.update",
          claimId: "pricing.territory.update",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:other",
          accepted: true,
          summary: "Territory price updated.",
          receiptId: "ACT-other",
        },
      ],
    };
    const next = reconcileCurrentTruth(opened.document, unrelated, now);
    assert(next.kind === "committed", "expected unrelated commit");
    const draft = next.document.claims.find((claim) => claim.claimId === "metadata.draft.edit");
    assert(draft?.status === "unresolved", `unrelated action must leave the blocker unresolved, got ${draft?.status}`);
  });

  harness.check("reducer/current-truth: expired proof reopens the blocker and missing proof is not success", () => {
    const receipt: ReconcileReceipt = {
      receiptId: "ACT-exp",
      observedAt: "2026-08-24T12:00:00.000Z",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-exp",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: "2026-08-24T12:00:00.000Z",
          expiresAt: "2026-08-24T13:00:00.000Z",
          reachable: true,
          payloadHash: "sha256:exp",
          accepted: true,
          summary: "Read-back is valid until 13:00.",
          receiptId: "ACT-exp",
        },
      ],
    };
    const live = reconcileCurrentTruth(undefined, receipt, "2026-08-24T12:30:00.000Z");
    assert(live.kind === "committed" && live.document.claims[0]?.status === "active", "expected active before expiry");
    const expired = reconcileCurrentTruth(live.document, receipt, "2026-08-24T14:00:00.000Z");
    assert(expired.kind === "committed" && !expired.noop, "clock expiry must write");
    assert(expired.document.claims[0]?.status === "expired", `expected expired, got ${expired.document.claims[0]?.status}`);
    const missing: ReconcileReceipt = {
      receiptId: "ACT-missing",
      observedAt: "2026-08-24T15:00:00.000Z",
      affectedGraphNodeIds: ["store.listing.publish"],
      evidence: [
        {
          id: "ev-missing",
          graphNodeId: "store.listing.publish",
          claimId: "store.listing.publish",
          authority: "provider_readback",
          observedAt: "2026-08-24T15:00:00.000Z",
          reachable: true,
          payloadHash: "sha256:missing",
          accepted: false,
          summary: "Read-back is not on file.",
          receiptId: "ACT-missing",
        },
      ],
    };
    const unresolved = reconcileCurrentTruth(expired.document, missing, "2026-08-24T15:00:00.000Z");
    assert(unresolved.kind === "committed", "expected missing-proof commit");
    const publish = unresolved.document.claims.find((claim) => claim.claimId === "store.listing.publish");
    assert(publish?.status === "unresolved", "missing proof must not become success");
  });

  harness.check("reducer/current-truth: conflict and unorderable evidence fail closed", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const conflict: ReconcileReceipt = {
      receiptId: "ACT-conflict",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-a",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:a",
          accepted: true,
          summary: "Copy A",
          receiptId: "ACT-conflict",
        },
        {
          id: "ev-b",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:b",
          accepted: true,
          summary: "Copy B",
          receiptId: "ACT-conflict",
        },
      ],
    };
    const conflicted = reconcileCurrentTruth(undefined, conflict, now);
    assert(conflicted.kind === "rejected", "expected conflict reject");
    assert(
      conflicted.issues.some((item) => item.code === "current_truth.conflict"),
      `expected conflict code, got ${JSON.stringify(conflicted.issues)}`,
    );
    const unorderable: ReconcileReceipt = {
      receiptId: "ACT-bad-time",
      observedAt: "not-a-timestamp",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-bad",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: "not-a-timestamp",
          reachable: true,
          payloadHash: "sha256:bad",
          accepted: true,
          summary: "Bad time",
          receiptId: "ACT-bad-time",
        },
      ],
    };
    const rejected = reconcileCurrentTruth(undefined, unorderable, now);
    assert(rejected.kind === "rejected", "expected unorderable reject");
    assert(
      rejected.issues.some((item) => item.code === "current_truth.unorderable_evidence"),
      "expected unorderable code",
    );
  });

  harness.check("reducer/current-truth: commit patches cannot write current-truth", () => {
    const p = scenarioPaths(harness, "commit-current-truth", "current-truth.json");
    const patch = buildPatch("current-truth", [{ op: "set", path: ["claims"], value: [] }], [["claims"]]);
    const result = commit(p.dir, p, patch);
    assert(result.code === 1, `expected exit 1, got ${result.code}: ${result.output}`);
    assert(result.output.includes("patch.reconcile_only_target"), `expected patch.reconcile_only_target, got: ${result.output}`);
    assert(!existsSync(p.file), "current-truth.json must not be written from a commit patch");
  });

  harness.check("reducer/current-truth: a read refreshes an expired claim without changing stored bytes", () => {
    const receipt: ReconcileReceipt = {
      receiptId: "ACT-exp-export",
      observedAt: "2026-08-24T12:00:00.000Z",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-exp-export",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: "2026-08-24T12:00:00.000Z",
          expiresAt: "2026-08-24T13:00:00.000Z",
          reachable: true,
          payloadHash: "sha256:exp-export",
          accepted: true,
          summary: "Read-back is valid until 13:00.",
          receiptId: "ACT-exp-export",
        },
      ],
    };
    const live = reconcileCurrentTruth(undefined, receipt, "2026-08-24T12:30:00.000Z");
    assert(live.kind === "committed" && live.document.claims[0]?.status === "active", "expected stored claim to stay active");
    const before = JSON.stringify(live.document);
    const later = "2026-08-24T14:00:00.000Z";
    const refreshed = refreshCurrentTruthForRead(live.document, later);
    assert(refreshed.claims[0]?.status === "expired", `expected read status expired, got ${refreshed.claims[0]?.status}`);
    assert(live.document.claims[0]?.status === "active", "read-time expiry must not mutate the stored status");
    assert(JSON.stringify(live.document) === before, "read-time expiry must preserve the complete stored document");
  });

  harness.check("reducer/current-truth: reused evidence ids must match the complete immutable record", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const first: ReconcileReceipt = {
      receiptId: "ACT-reuse",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-reuse",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:same",
          accepted: true,
          summary: "Original summary",
          receiptId: "ACT-reuse",
        },
      ],
    };
    const committed = reconcileCurrentTruth(undefined, first, now);
    assert(committed.kind === "committed", "expected first reconcile to commit");
    const reused: ReconcileReceipt = {
      receiptId: "ACT-reuse-2",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ev-reuse",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:same",
          accepted: true,
          summary: "Corrected summary",
          receiptId: "ACT-reuse-2",
        },
      ],
    };
    const conflicted = reconcileCurrentTruth(committed.document, reused, now);
    assert(conflicted.kind === "rejected", "expected complete-record conflict");
    assert(
      conflicted.issues.some((item) => item.code === "current_truth.conflict"),
      `expected conflict, got ${JSON.stringify(conflicted.issues)}`,
    );
  });

  harness.check("reducer/current-truth: input hash includes summary so a same-id correction is not a no-op", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const first: ReconcileReceipt = {
      receiptId: "ACT-summary-hash",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ACT-summary-hash:readback",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:summary-hash",
          accepted: true,
          summary: "Original summary",
          receiptId: "ACT-summary-hash",
        },
      ],
    };
    const committed = reconcileCurrentTruth(undefined, first, now);
    assert(committed.kind === "committed", "expected first reconcile to commit");
    const correctedSummary: ReconcileReceipt = {
      ...first,
      evidence: [
        {
          ...first.evidence[0]!,
          summary: "Corrected summary",
        },
      ],
    };
    const next = reconcileCurrentTruth(committed.document, correctedSummary, "2026-08-24T12:05:00.000Z");
    assert(next.kind === "rejected", "same id with a different summary must not no-op");
    assert(
      next.issues.some((item) => item.code === "current_truth.conflict"),
      `expected conflict, got ${JSON.stringify(next.issues)}`,
    );
  });

  harness.check("reducer/current-truth: a corrected summary on a new evidence id is not a no-op", () => {
    const now = "2026-08-24T12:00:00.000Z";
    const first: ReconcileReceipt = {
      receiptId: "ACT-hash",
      observedAt: now,
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ACT-hash:readback",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: now,
          reachable: true,
          payloadHash: "sha256:hash",
          accepted: true,
          summary: "Original summary",
          receiptId: "ACT-hash",
        },
      ],
    };
    const committed = reconcileCurrentTruth(undefined, first, now);
    assert(committed.kind === "committed", "expected first reconcile to commit");
    const corrected: ReconcileReceipt = {
      receiptId: "ACT-hash",
      observedAt: "2026-08-24T12:05:00.000Z",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ACT-hash:readback-corrected",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: "2026-08-24T12:05:00.000Z",
          reachable: true,
          payloadHash: "sha256:hash",
          accepted: true,
          summary: "Corrected after-state",
          receiptId: "ACT-hash",
        },
      ],
    };
    const next = reconcileCurrentTruth(committed.document, corrected, "2026-08-24T12:05:00.000Z");
    assert(next.kind === "committed" && !next.noop, "corrected summary on a new evidence id must commit");
    assert(next.document.evidence.length === 2, "historical evidence must remain queryable");
    assert(next.document.claims[0]?.summary === "Corrected after-state", `expected corrected summary, got ${next.document.claims[0]?.summary}`);
  });

  harness.check("reducer/current-truth: dangling currentEvidenceId fails closed", () => {
    const dir = harness.makeTempDir("dangling-current-evidence");
    const file = path.join(dir, "current-truth.json");
    writeJson(file, {
      schemaVersion: "1.0.0",
      updatedAt: "2026-08-24T12:00:00.000Z",
      revision: 1,
      lastReceiptId: "ACT-dangle",
      lastReconcileInputHash: "abc",
      evidence: [],
      claims: [
        {
          claimId: "metadata.draft.edit",
          graphNodeId: "metadata.draft.edit",
          status: "active",
          currentEvidenceId: "missing-ev",
          supersededEvidenceIds: [],
          blockerKind: "none",
          summary: "Dangling pointer",
        },
      ],
    });
    const loaded = loadCurrentTruthFile(file);
    assert(
      loaded.issues.some((item) => item.code === "current_truth.dangling_evidence"),
      `expected dangling_evidence, got ${JSON.stringify(loaded.issues)}`,
    );
    const semantic = validateCurrentTruthSemantics({
      schemaVersion: "1.0.0",
      updatedAt: "2026-08-24T12:00:00.000Z",
      revision: 1,
      lastReceiptId: "ACT-dangle",
      lastReconcileInputHash: "abc",
      evidence: [],
      claims: [
        {
          claimId: "metadata.draft.edit",
          graphNodeId: "metadata.draft.edit",
          status: "active",
          currentEvidenceId: "missing-ev",
          supersededEvidenceIds: ["also-missing"],
          blockerKind: "none",
          summary: "Dangling pointer",
        },
      ],
    });
    assert(
      semantic.some((item) => item.code === "current_truth.dangling_evidence"),
      "superseded ids must exist in evidence",
    );
  });

  harness.check("reducer: reconcile CLI writes current-truth, records audit, and no-ops on replay", () => {
    const p = scenarioPaths(harness, "reconcile-cli", "current-truth.json");
    const receiptPath = path.join(p.dir, "receipt.json");
    const receipt: ReconcileReceipt = {
      receiptId: "ACT-asc-draft",
      observedAt: "2026-08-24T12:00:00.000Z",
      affectedGraphNodeIds: ["metadata.draft.edit"],
      evidence: [
        {
          id: "ACT-asc-draft:readback",
          graphNodeId: "metadata.draft.edit",
          claimId: "metadata.draft.edit",
          authority: "provider_readback",
          observedAt: "2026-08-24T12:00:00.000Z",
          reachable: true,
          payloadHash: "sha256:new",
          accepted: true,
          summary: "Provider read-back matches the approved draft copy",
          receiptId: "ACT-asc-draft",
        },
      ],
    };
    writeJson(receiptPath, receipt);
    const first = runCli([
      "reconcile",
      "--file",
      p.file,
      "--manifest",
      p.manifest,
      "--audit",
      p.audit,
      "--receipt",
      receiptPath,
      "--session",
      "session-fixture",
      "--now",
      "2026-08-24T12:00:00.000Z",
    ]);
    assert(first.code === 0, `expected reconcile commit, got ${first.code}: ${first.output}`);
    assert(first.output.includes("RESULT: committed"), first.output);
    assert(existsSync(p.file), "reconcile did not write current-truth");
    const second = runCli([
      "reconcile",
      "--file",
      p.file,
      "--manifest",
      p.manifest,
      "--audit",
      p.audit,
      "--receipt",
      receiptPath,
      "--session",
      "session-fixture",
      "--now",
      "2026-08-24T12:05:00.000Z",
    ]);
    assert(second.code === 0 && second.output.includes("RESULT: noop"), `expected noop, got ${second.output}`);
    const audit = readFileSync(p.audit, "utf8");
    assert(/"action"\s*:\s*"reconcile"/.test(audit), "audit chain must record reconcile");
    const replay = verifyAuditChain(p.audit);
    assert(replay.valid, `audit chain must remain valid after reconcile: ${replay.reason ?? "ok"}`);
  });
}
