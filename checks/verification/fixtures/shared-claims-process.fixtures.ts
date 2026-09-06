import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { assertSharedClaim, acquireSharedClaim, type SharedClaimResult } from "../../../kernel/reducer/shared-claims.js";
import { type Harness, skillRoot } from "./_harness.js";

export function register(harness: Harness): void {
  harness.check("shared claims: concurrent processes acquire one shared resource exactly once", () => {
    const home = harness.makeTempDir("shared-process-contention");
    const moduleUrl = pathToFileURL(path.join(skillRoot, "kernel/reducer/shared-claims.ts")).href;
    const worker = `import { acquireSharedClaim } from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify(acquireSharedClaim({home:${JSON.stringify(home)},resource:"device.shared",workspaceId:String(process.pid),occurrenceId:"capture",ttlSeconds:60})));`;
    const coordinator = `import { spawn } from "node:child_process";
      const results = await Promise.all(Array.from({length:4}, () => new Promise((resolve,reject) => {
        const child = spawn(process.execPath,["--import","tsx","--input-type=module","-e",${JSON.stringify(worker)}]);
        let out="",err="";child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>err+=x);
        child.on("error",reject);child.on("close",code=>code===0?resolve(JSON.parse(out)):reject(new Error(err)));
      })));
      console.log(JSON.stringify(results));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", coordinator], {
      cwd: skillRoot,
      encoding: "utf8",
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const outcomes = JSON.parse(result.stdout) as SharedClaimResult[];
    const winners = outcomes.filter((outcome) => outcome.ok);
    assert.equal(winners.length, 1, JSON.stringify(outcomes));
    assert(outcomes.every((outcome) => outcome.ok || outcome.reason === "busy" || outcome.reason === "held"));
    const winner = winners[0]!;
    assert(winner.ok);
    assert.throws(() => assertSharedClaim(home, winner.claim), /ownership_lost/, "a different process cannot use the winning process's receipt");
    assert.deepEqual(
      acquireSharedClaim({
        home,
        resource: "device.shared",
        workspaceId: "successor",
        occurrenceId: "capture",
        ttlSeconds: 60,
        now: new Date(Date.parse(winner.claim.expiresAt) + 1000).toISOString(),
      }),
      { ok: false, reason: "reconciliation_required" },
      "the exited process's claim remains blocked until explicit reconciliation",
    );
  });
}
