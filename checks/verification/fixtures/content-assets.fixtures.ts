import { spawnSync } from "node:child_process";
import { assert, skillRoot, type Harness } from "./_harness.js";

/** Include the node:test contract suite in the existing auto-discovered fixture runner. */
export function register(harness: Harness): void {
  harness.check("content assets v2: byte binding, provider neutrality, legacy and CLI regressions", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-reporter=tap", "checks/verification/design/content-assets.test.ts"], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert(!result.error && result.status === 0, `Content asset contract tests failed: ${result.error?.message ?? output}`);
    const count = Number(output.match(/# tests (\d+)/)?.[1] ?? 0);
    assert(count >= 11, `Expected at least eleven contract tests to execute, observed ${count}: ${output}`);
  });
}
