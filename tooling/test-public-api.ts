import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suites = [
  "public-api",
  "lifecycle",
  "recovery",
  "initialization",
  "installed-composition",
  "setup-help",
  "business-help",
  "founder-brief-intake",
  "connection-and-packet",
  "after-credits-start",
];
let failed = false;

// Each integration suite has its own bounded run. A shared five-minute deadline
// killed otherwise passing recovery/initialization tests on two-core CI runners.
// Keep every suite, propagate all failures, and report which deadline was exceeded.
for (const suite of suites) {
  console.log(`Public API suite: ${suite}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", path.join(root, "checks/verification/public-api", `${suite}.test.ts`)], {
    cwd: root,
    stdio: "inherit",
    timeout: 300_000,
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`Public API suite ${suite} failed: ${result.error?.message ?? result.signal ?? `exit ${result.status ?? "unknown"}`}`);
  }
}
process.exitCode = failed ? 1 : 0;
