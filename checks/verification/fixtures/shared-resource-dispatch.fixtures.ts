import { acquireSharedClaim, releaseSharedClaim } from "../../../kernel/reducer/shared-claims.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compilePlan } from "../../../kernel/engine/compile.js";
import { validateSharedResources } from "../../../contracts/shared-resources.js";
import { type Harness, skillRoot } from "./_harness.js";
import { bootstrapWorkspace, slowSilentCatalog, grant, runSession, readRunState, cleanEnv, fixtureFounderTrustEnvironment } from "./session.fixtures.js";

export function register(harness: Harness): void {
  harness.check("shared resources: exact identities validate and affect the compiled contract", () => {
    assert.throws(() => validateSharedResources(["provider.posthog"]));
    assert.throws(() => validateSharedResources(["device:test\n"]));
    assert.throws(() => validateSharedResources(["provider-project:posthog"]));
    const catalog = slowSilentCatalog();
    const original = compilePlan(catalog);
    catalog.workflows[0]!.sharedResources = ["device:ios-test"];
    const selected = compilePlan(catalog);
    assert.notDeepEqual(selected, original);
    assert.deepEqual(selected.nodes[0]!.sharedResources, ["device:ios-test"]);
  });
  harness.check("shared resources: two workspaces serialize one device while another project starts concurrently", () => {
    const home = harness.makeTempDir("shared-dispatch-home");
    const catalog = slowSilentCatalog();
    catalog.workflows[0]!.sharedResources = ["device:ios-test"];
    const options = { grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") } };
    const first = bootstrapWorkspace(harness, "shared-first", catalog, options);
    const second = bootstrapWorkspace(harness, "shared-second", catalog, options);
    const independentCatalog = slowSilentCatalog();
    independentCatalog.workflows[0]!.sharedResources = ["provider-project:posthog:independent"];
    const independent = bootstrapWorkspace(harness, "shared-independent", independentCatalog, options);
    const driver = path.join(home, "driver.mjs");
    const release = path.join(home, "release-workers");
    const hold = path.join(home, "hold-worker.mjs");
    // Hold only the fixture executor timer. Heartbeats continue normally until the
    // driver has observed both overlap and contention, independent of host load.
    writeFileSync(
      hold,
      `import {existsSync} from "node:fs";
const timer=globalThis.setTimeout;
globalThis.setTimeout=(callback,delay,...args)=>delay===4000
  ? timer(function wait(){if(existsSync(${JSON.stringify(release)}))callback(...args);else timer(wait,25);},25)
  : timer(callback,delay,...args);`,
    );
    const specs = [first, second, independent].map((handle) => ({
      dir: handle.dir,
      brief: handle.briefPath,
      env: { ...cleanEnv(), ...fixtureFounderTrustEnvironment(handle.dir), B2C_APP_BUILDER_HOME: home },
    }));
    writeFileSync(
      driver,
      `import {spawn} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
const specs=${JSON.stringify(specs)};
const start=(index,mode="slow-silent")=>{const spec=specs[index];let out="";const child=spawn(process.execPath,["--import",${JSON.stringify(hold)},"--import","tsx",${JSON.stringify(path.join(skillRoot, "kernel/session/run.ts"))},"--workspace",spec.dir,"--brief",spec.brief,"--session","shared-"+index,"--executor",mode,"--slow-delay-ms","4000","--lock-ttl-seconds","1"],{cwd:${JSON.stringify(skillRoot)},env:spec.env});child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>out+=x);return {child,done:new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",code=>code===0?resolve(out):reject(new Error(out)));})};};
const running=index=>{try{return JSON.parse(readFileSync(specs[index].dir+"/run/run-state.json","utf8")).nodes["run.eng-change"].attempts.some(x=>x.status==="running")}catch{return false}};
const wait=async(predicate)=>{const deadline=Date.now()+60000;while(!predicate()){if(Date.now()>deadline)throw Error("attempt did not start");await new Promise(r=>setTimeout(r,25));}};
const first=start(0);await wait(()=>running(0));
const other=start(2);await wait(()=>running(2));if(!running(0))throw Error("independent project did not overlap running device work");
const contending=start(1,"fixture");await contending.done;
const held=JSON.parse(readFileSync(specs[1].dir+"/run/run-state.json","utf8"));if(held.nodes["run.eng-change"].attempts.length!==0)throw Error("contention consumed an attempt");
writeFileSync(${JSON.stringify(release)},"release");await Promise.all([first.done,other.done]);console.log("SHARED_DISPATCH_OK");`,
      "utf8",
    );
    const result = spawnSync(process.execPath, [driver], { cwd: skillRoot, encoding: "utf8", timeout: 90000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /SHARED_DISPATCH_OK/);
    const held = readRunState(second).nodes["run.eng-change"]!;
    assert.equal(held.attempts.length, 0);
    assert.match(held.blocker ?? "", /shared resource/i);
    const resumed = runSession(["--workspace", second.dir, "--brief", second.briefPath, "--session", "shared-resume", "--executor", "fixture"], {
      B2C_APP_BUILDER_HOME: home,
    });
    assert.equal(resumed.code, 0, resumed.output);
    assert.equal(readRunState(second).nodes["run.eng-change"]!.attempts.length, 1);
  });
  harness.check("shared resources: uncertain worker failure retains ownership for reconciliation", () => {
    const home = harness.makeTempDir("shared-uncertain-home");
    const catalog = slowSilentCatalog();
    catalog.workflows[0]!.sharedResources = ["device:uncertain"];
    const options = { grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") } };
    const first = bootstrapWorkspace(harness, "uncertain-first", catalog, options);
    const second = bootstrapWorkspace(harness, "uncertain-second", catalog, options);
    const env = { B2C_APP_BUILDER_HOME: home };
    const failed = runSession(["--workspace", first.dir, "--brief", first.briefPath, "--session", "uncertain", "--executor", "noop"], env);
    assert.equal(failed.code, 0, failed.output);
    const blocked = runSession(["--workspace", second.dir, "--brief", second.briefPath, "--session", "uncertain-next", "--executor", "fixture"], env);
    assert.equal(blocked.code, 0, blocked.output);
    assert.equal(readRunState(second).nodes["run.eng-change"]!.attempts.length, 0);
    assert.match(readRunState(first).nodes["run.eng-change"]!.blocker ?? "", /reconciliation/);
  });
  harness.check("shared resources: a green gate after lease expiry cannot accept output", () => {
    const home = harness.makeTempDir("shared-expiry-home");
    const catalog = slowSilentCatalog();
    catalog.workflows[0]!.sharedResources = ["device:expiry"];
    catalog.workflows[0]!.gateCommands = ["check:secrets"];
    const handle = bootstrapWorkspace(harness, "shared-expiry", catalog, {
      grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
    });
    const bin = harness.makeTempDir("shared-expiry-bin");
    const npm = path.join(bin, "npm");
    // The gate reports success after the claim expires. Its green result must confer nothing.
    writeFileSync(npm, "#!/bin/sh\nsleep 2\nexit 0\n", "utf8");
    chmodSync(npm, 0o700);
    const result = runSession(
      ["--workspace", handle.dir, "--brief", handle.briefPath, "--session", "shared-expiry", "--executor", "fixture", "--lock-ttl-seconds", "1"],
      { B2C_APP_BUILDER_HOME: home, PATH: bin + path.delimiter + process.env.PATH },
    );
    assert.equal(result.code, 0, result.output);
    const run = readRunState(handle),
      node = run.nodes["run.eng-change"]!;
    assert.equal(node.status, "needs_readback");
    assert.equal(node.attempts.at(-1)!.status, "needs_readback");
    assert.equal(node.attempts.at(-1)!.deterministicVerification, undefined);
    assert(run.artifactBindings.every((binding) => !binding.accepted));
  });

  harness.check("shared resources: verifier contention keeps the same candidate pending without rejection", () => {
    const home = harness.makeTempDir("shared-review-home");
    const catalog = slowSilentCatalog();
    catalog.workflows[0]!.sharedResources = ["device:review"];
    const handle = bootstrapWorkspace(harness, "shared-review", catalog, {
      grants: { "domain.engineering": grant("domain.engineering", "run-with-guardrails") },
    });
    const env = { B2C_APP_BUILDER_HOME: home };
    const invoke = (session: string, verifier: string) =>
      runSession(["--workspace", handle.dir, "--brief", handle.briefPath, "--session", session, "--executor", "fixture", "--verifier", verifier], env);
    const produced = invoke("review-produce", "off");
    assert.equal(produced.code, 0, produced.output);
    const before = readRunState(handle).nodes["run.eng-change"]!;
    const claimed = acquireSharedClaim({ home, resource: "device:review", workspaceId: "another-business", occurrenceId: "review", ttlSeconds: 60 });
    assert(claimed.ok);
    const busy = invoke("review-busy", "fixture");
    assert.equal(busy.code, 0, busy.output);
    const deferred = readRunState(handle).nodes["run.eng-change"]!;
    assert.equal(deferred.attempts.length, before.attempts.length);
    assert.equal(deferred.attempts.at(-1)!.independentVerification, undefined);
    assert.equal(deferred.blocker, "Verification required");
    releaseSharedClaim(home, claimed.claim);
    const completed = invoke("review-complete", "fixture");
    assert.equal(completed.code, 0, completed.output);
    assert.equal(readRunState(handle).nodes["run.eng-change"]!.status, "succeeded");
  });
}
