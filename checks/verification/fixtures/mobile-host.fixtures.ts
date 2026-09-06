import { spawnSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
import { skillRoot, type Harness } from "./_harness.js";
export function register(harness: Harness): void {
  harness.check("native mobile host transport uses scoped commands and independent readback", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", path.join(skillRoot, "checks/verification/fixtures/_mobile-host-proof.ts")], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /PASS native host command/);
  });
}
