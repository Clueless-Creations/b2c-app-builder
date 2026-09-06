import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Harness } from "./_harness.js";
import { trackRuntimeWrites } from "../../../kernel/session/runtime-write-audit.js";
import { snapshotWorkspaceChanges, verifyWorkspaceChanges } from "../../../kernel/session/input-inventory.js";

export function register(harness: Harness): void {
  function workspace(name: string) {
    const root = harness.makeTempDir(name);
    mkdirSync(path.join(root, "run"));
    mkdirSync(path.join(root, "control"));
    writeFileSync(path.join(root, "run/run-state.json"), "state-before");
    writeFileSync(path.join(root, "control/session.lock"), "lock-before");
    return root;
  }
  harness.check("runtime write audit: exact heartbeat writes pass without granting worker control access", () => {
    const root = workspace("trusted-heartbeat");
    const audit = trackRuntimeWrites(root);
    const before = snapshotWorkspaceChanges(root);
    audit.write("run/run-state.json", () => writeFileSync(path.join(root, "run/run-state.json"), "state-heartbeat"));
    audit.write("control/session.lock", () => writeFileSync(path.join(root, "control/session.lock"), "lock-heartbeat"));
    assert.equal(verifyWorkspaceChanges(root, before, [], []).length, 2);
    assert.deepEqual(verifyWorkspaceChanges(root, before, [], [], audit.snapshot), []);
    writeFileSync(path.join(root, "control/grants.json"), "worker-grant");
    assert(verifyWorkspaceChanges(root, before, [], [], audit.snapshot).some((error) => error.includes("grants.json")));
  });
  harness.check("runtime write audit: worker tamper cannot be washed away by a trusted heartbeat", () => {
    const root = workspace("heartbeat-tamper");
    const audit = trackRuntimeWrites(root);
    const before = snapshotWorkspaceChanges(root);
    const file = path.join(root, "run/run-state.json");
    writeFileSync(file, "worker-forged-acceptance");
    assert.throws(() => audit.write("run/run-state.json", () => writeFileSync(file, "state-heartbeat")), /untrusted_control_change/);
    assert.equal(readFileSync(file, "utf8"), "worker-forged-acceptance");
    assert(verifyWorkspaceChanges(root, before, [], [], audit.snapshot).some((error) => error.includes("integrity_lost")));
    writeFileSync(file, "state-before");
    assert.throws(audit.assertIntact, /integrity_lost/);
  });
  harness.check("runtime write audit: a failed trusted write permanently refuses acceptance", () => {
    const root = workspace("heartbeat-failure");
    const audit = trackRuntimeWrites(root);
    assert.throws(
      () =>
        audit.write("control/session.lock", () => {
          throw new Error("interrupted");
        }),
      /interrupted/,
    );
    assert.throws(audit.snapshot, /integrity_lost/);
  });
}
