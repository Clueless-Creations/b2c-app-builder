import { spawnSync } from "node:child_process";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
export function register(harness: Harness): void {
  harness.check("async tools: MCP process-tree termination and Message Batches behavior", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--test", path.join(skillRoot, "checks/verification/fixtures/async-tools.test.ts")], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert(result.status === 0, `${result.stdout}\n${result.stderr}`);
  });
}
