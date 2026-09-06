import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assert, type Harness } from "../fixtures/_harness.js";
import { createDispatchHooks } from "../../../kernel/autonomy/killswitch.js";
import { checkBatchBoundary } from "../../../kernel/engine/dispatch.js";
import { acquireLock, releaseLock, requestInteractive } from "../../../kernel/reducer/lock.js";
import type { ControlFile } from "../../../kernel/schema/types.js";
import { NOW } from "./_fixtures.js";

function baseControl(overrides: Partial<ControlFile["killSwitch"]> = {}): ControlFile {
  return {
    schemaVersion: "1.0.0",
    updatedAt: NOW,
    businessSlug: "fixture-biz",
    killSwitch: { engaged: false, engagedAt: "", engagedBy: "", reason: "", ...overrides },
    grants: {},
    waivers: [],
  };
}

function writeControl(controlPath: string, control: ControlFile): void {
  writeFileSync(controlPath, JSON.stringify(control, null, 2), "utf8");
}

export function register(harness: Harness): void {
  harness.check("killswitch: an engaged control doc halts the batch boundary with reason kill_switch", () => {
    const dir = harness.makeTempDir("killswitch-engaged");
    const controlPath = path.join(dir, "control.json");
    writeControl(controlPath, baseControl({ engaged: true, engagedAt: NOW, engagedBy: "founder", reason: "founder paused the business" }));
    const lockPath = path.join(dir, "state.json.lock");
    const acquired = acquireLock(lockPath, { ownerSessionId: "session-a", now: () => NOW });
    assert(acquired.ok, "expected the fixture lock to acquire cleanly");

    const hooks = createDispatchHooks({
      loadControl: () => JSON.parse(readFileSync(controlPath, "utf8")) as ControlFile,
      lockPath,
      ownerSessionId: "session-a",
    });
    const boundary = checkBatchBoundary(hooks);
    assert(boundary.halt && boundary.reason === "kill_switch", `expected a kill_switch halt, got ${JSON.stringify(boundary)}`);
    releaseLock(lockPath, "session-a");
  });

  harness.check("killswitch: a clear control doc with no pending interactive request never halts", () => {
    const dir = harness.makeTempDir("killswitch-clear");
    const controlPath = path.join(dir, "control.json");
    writeControl(controlPath, baseControl());
    const lockPath = path.join(dir, "state.json.lock");
    acquireLock(lockPath, { ownerSessionId: "session-a", now: () => NOW });

    const hooks = createDispatchHooks({
      loadControl: () => JSON.parse(readFileSync(controlPath, "utf8")) as ControlFile,
      lockPath,
      ownerSessionId: "session-a",
    });
    const boundary = checkBatchBoundary(hooks);
    assert(!boundary.halt, `expected no halt with a clear control doc and no yield request, got ${JSON.stringify(boundary)}`);
    releaseLock(lockPath, "session-a");
  });

  harness.check("killswitch: revocation mid-run is observed at the very next call — no caching inside the hooks factory", () => {
    const dir = harness.makeTempDir("killswitch-revocation");
    const controlPath = path.join(dir, "control.json");
    writeControl(controlPath, baseControl());
    const lockPath = path.join(dir, "state.json.lock");
    acquireLock(lockPath, { ownerSessionId: "session-a", now: () => NOW });

    const hooks = createDispatchHooks({
      loadControl: () => JSON.parse(readFileSync(controlPath, "utf8")) as ControlFile,
      lockPath,
      ownerSessionId: "session-a",
    });
    assert(!checkBatchBoundary(hooks).halt, "expected no halt before the founder engages the kill switch");

    // Simulate the founder engaging the kill switch mid-run, out of process (a real run would go through the reducer).
    writeControl(controlPath, baseControl({ engaged: true, engagedAt: NOW, engagedBy: "founder", reason: "stop everything" }));
    const boundary = checkBatchBoundary(hooks);
    assert(boundary.halt && boundary.reason === "kill_switch", "expected the very next batch-boundary check to see the revocation");
    releaseLock(lockPath, "session-a");
  });

  harness.check("killswitch: a pending interactive request halts cooperative yield, checked fresh via the lock", () => {
    const dir = harness.makeTempDir("killswitch-yield");
    const controlPath = path.join(dir, "control.json");
    writeControl(controlPath, baseControl());
    const lockPath = path.join(dir, "state.json.lock");
    acquireLock(lockPath, { ownerSessionId: "session-scheduled", now: () => NOW });

    const hooks = createDispatchHooks({
      loadControl: () => JSON.parse(readFileSync(controlPath, "utf8")) as ControlFile,
      lockPath,
      ownerSessionId: "session-scheduled",
    });
    assert(!checkBatchBoundary(hooks).halt, "expected no halt before any interactive request");

    requestInteractive(lockPath);
    const boundary = checkBatchBoundary(hooks);
    assert(boundary.halt && boundary.reason === "cooperative_yield", `expected a cooperative_yield halt, got ${JSON.stringify(boundary)}`);
    releaseLock(lockPath, "session-scheduled");
  });

  harness.check("killswitch: kill switch takes priority over a pending interactive request", () => {
    const dir = harness.makeTempDir("killswitch-priority");
    const controlPath = path.join(dir, "control.json");
    writeControl(controlPath, baseControl({ engaged: true, engagedAt: NOW, engagedBy: "founder", reason: "stop" }));
    const lockPath = path.join(dir, "state.json.lock");
    acquireLock(lockPath, { ownerSessionId: "session-scheduled", now: () => NOW });
    requestInteractive(lockPath);

    const hooks = createDispatchHooks({
      loadControl: () => JSON.parse(readFileSync(controlPath, "utf8")) as ControlFile,
      lockPath,
      ownerSessionId: "session-scheduled",
    });
    const boundary = checkBatchBoundary(hooks);
    assert(boundary.halt && boundary.reason === "kill_switch", "expected kill_switch to win over cooperative_yield when both are present");
    releaseLock(lockPath, "session-scheduled");
  });
}
