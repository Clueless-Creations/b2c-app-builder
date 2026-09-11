import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { callPublicOperation } from "../../../kernel/services/business.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import type { Harness } from "../fixtures/_harness.js";
import { bootstrapWorkspace, grant, readRunState, researchScanCatalog, seedWorkspacePendingResearch } from "../fixtures/session.fixtures.js";

function tempHarness(label: string): { harness: Harness; cleanup: () => void; home: string } {
  const root = mkdtempSync(path.join(tmpdir(), `b2c-${label}-`));
  const home = path.join(root, "registry");
  mkdirSync(home);
  const harness = {
    makeTempDir(name: string) {
      const dir = path.join(root, name);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
  } as Harness;
  return { harness, home, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function proofStrengthLine(handle: ReturnType<typeof bootstrapWorkspace>): string | undefined {
  return readRunState(handle)
    .nodes["run.research-scan"]!.attempts.at(-1)
    ?.independentVerification?.evidence.find((line) => line.startsWith("Proof strength:"));
}

function writeRegistryHome(home: string, workspaceId: string, workspacePath: string): void {
  writeFileSync(
    path.join(home, "workspaces.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      workspaces: [{ id: workspaceId, path: workspacePath, registeredAt: "2026-09-11T16:00:00.000Z" }],
    }),
  );
}

async function invokeBusinessRun(workspaceId: string, workspacePath: string, requestId: string, runtimeObserved?: boolean | string) {
  return callPublicOperation(
    "business.run",
    {
      workspaceId,
      expectedRevision: workspaceRevision(workspacePath),
      requestId,
      scope: [],
      wallClockSeconds: 60,
      maxConcurrency: 1,
      ...(runtimeObserved === undefined ? {} : { runtimeObserved }),
    },
    { executor: "fixture", verifier: "fixture" },
  );
}

test("public business.run records workspace runtime proof from an explicit token", async () => {
  const cases: ReadonlyArray<{ readonly label: string; readonly runtimeObserved?: boolean | string }> = [
    { label: "omitted" },
    { label: "boolean flag", runtimeObserved: true },
    { label: "workspace token", runtimeObserved: "workspace" },
  ];
  for (const token of cases) {
    const env = tempHarness(`biz-run-${token.label.replace(" ", "-")}`);
    const prior = process.env.B2C_APP_BUILDER_HOME;
    process.env.B2C_APP_BUILDER_HOME = env.home;
    try {
      const workspaceId = `biz-run-${token.label.replace(" ", "-")}`;
      const catalog = researchScanCatalog(`catalog.business-run.${token.label.replace(" ", "-")}`);
      const handle = bootstrapWorkspace(env.harness, workspaceId, catalog, {
        grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
      });
      writeRegistryHome(env.home, workspaceId, handle.dir);
      seedWorkspacePendingResearch(handle, catalog, "sess-workspace-producer");
      const pendingBytes = readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8");
      const result = await invokeBusinessRun(workspaceId, handle.dir, workspaceId, token.runtimeObserved);
      assert.equal(result.ok, true, `${token.label} business.run must accept: ${JSON.stringify(result).slice(0, 400)}`);
      if (result.ok) assert.equal(result.data.replayed, false);
      const verified = readRunState(handle).nodes["run.research-scan"]!;
      assert.equal(verified.status, "succeeded", `${token.label} business.run must accept the pending workspace attempt`);
      const proof = proofStrengthLine(handle);
      if (token.runtimeObserved === undefined) {
        assert.notEqual(readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8"), pendingBytes);
        assert(
          Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=unknown") && !proof.includes("runtime=checked")),
          `public business.run without runtimeObserved cannot invent runtime proof, got ${proof ?? "none"}`,
        );
        continue;
      }
      assert(
        Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=checked")),
        `public business.run ${token.label} must record workspace runtime proof, got ${proof ?? "none"}`,
      );
      assert(!proof?.includes("runtime=unknown"), `public business.run ${token.label} must not leave runtime unobserved`);
    } finally {
      if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
      else process.env.B2C_APP_BUILDER_HOME = prior;
      env.cleanup();
    }
  }
});

test("public business.run refuses a live-device word and preserves run-state bytes", async () => {
  const env = tempHarness("biz-run-live-device");
  const prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const workspaceId = "biz-run-live-device";
    const catalog = researchScanCatalog("catalog.business-run.live-device");
    const handle = bootstrapWorkspace(env.harness, workspaceId, catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    writeRegistryHome(env.home, workspaceId, handle.dir);
    seedWorkspacePendingResearch(handle, catalog, "sess-workspace-producer");
    const pendingBytes = readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8");
    const result = await invokeBusinessRun(workspaceId, handle.dir, workspaceId, "live-device");
    assert.equal(result.ok, false, "live-device must refuse");
    if (!result.ok) {
      assert.equal(result.error.code, "LOCAL_OPERATION_REFUSED");
      assert.equal(result.error.message, "business.session_refused");
    }
    assert.equal(readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8"), pendingBytes);
    assert.notEqual(readRunState(handle).nodes["run.research-scan"]!.status, "succeeded");
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    env.cleanup();
  }
});

test("public business.run fixture loop cannot invent runtime=checked even with the token", async () => {
  const env = tempHarness("biz-run-fixture");
  const prior = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = env.home;
  try {
    const workspaceId = "biz-run-fixture";
    const catalog = researchScanCatalog("catalog.business-run.fixture");
    const handle = bootstrapWorkspace(env.harness, workspaceId, catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    writeRegistryHome(env.home, workspaceId, handle.dir);
    const result = await invokeBusinessRun(workspaceId, handle.dir, workspaceId, true);
    assert.equal(result.ok, true, `fixture business.run must still accept: ${JSON.stringify(result).slice(0, 400)}`);
    if (result.ok) assert.equal(result.data.replayed, false);
    const state = readRunState(handle).nodes["run.research-scan"]!;
    assert.equal(state.status, "succeeded");
    assert(
      state.attempts.every((entry) => entry.proofSource === "synthetic"),
      "a fixture loop must remain explicitly synthetic",
    );
    const proof = proofStrengthLine(handle);
    assert(
      Boolean(proof?.includes("runtime=unknown") && !proof.includes("runtime=checked")),
      `fixture public business.run cannot invent runtime proof, got ${proof ?? "none"}`,
    );
  } finally {
    if (prior === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = prior;
    env.cleanup();
  }
});
