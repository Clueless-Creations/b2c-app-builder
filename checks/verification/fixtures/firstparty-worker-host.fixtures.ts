import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { skillRoot, type Harness } from "./_harness.js";
export function register(h: Harness): void {
  h.check("trusted shipped worker factory invokes a real fake CLI executor and verifier without accepting fabricated proof", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", path.join(skillRoot, "checks/verification/fixtures/_firstparty-worker-host-proof.ts")], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS shipped worker host/);
  });
}
