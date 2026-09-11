import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionBrief } from "../../../kernel/session/brief.js";
import { runSession } from "../../../kernel/session/run.js";
import { workspaceRevision } from "../../../kernel/session/workspace-revision.js";
import type { Harness } from "../fixtures/_harness.js";
import {
  bootstrapWorkspace,
  grant,
  readRunState,
  researchScanCatalog,
  seedWorkspacePendingResearch,
} from "../fixtures/session.fixtures.js";

function tempHarness(label: string): { harness: Harness; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), `b2c-${label}-`));
  const harness = {
    makeTempDir(name: string) {
      const dir = path.join(root, name);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
  } as Harness;
  return { harness, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function proofStrengthLine(handle: ReturnType<typeof bootstrapWorkspace>): string | undefined {
  return readRunState(handle).nodes["run.research-scan"]!.attempts.at(-1)?.independentVerification?.evidence.find((line) =>
    line.startsWith("Proof strength:"),
  );
}

async function invokePublicSession(
  handle: ReturnType<typeof bootstrapWorkspace>,
  sessionId: string,
  runtimeObserved?: boolean | string,
) {
  return runSession({
    workspace: handle.dir,
    sessionId,
    brief: JSON.parse(readFileSync(handle.briefPath, "utf8")) as SessionBrief,
    expectedRevision: workspaceRevision(handle.dir),
    requestId: sessionId,
    requestDigest: `sha256:${createHash("sha256").update(sessionId).digest("hex")}`,
    maxConcurrency: 1,
    wallClockSeconds: 60,
    executor: "fixture",
    verifier: "fixture",
    runtimeObserved,
  });
}

test("public runSession records workspace runtime proof from an explicit token", async () => {
  const cases: ReadonlyArray<{ readonly label: string; readonly runtimeObserved?: boolean | string }> = [
    { label: "omitted" },
    { label: "boolean flag", runtimeObserved: true },
    { label: "workspace token", runtimeObserved: "workspace" },
  ];
  for (const token of cases) {
    const env = tempHarness(`public-run-${token.label.replace(" ", "-")}`);
    try {
      const catalog = researchScanCatalog(`catalog.public-run-session.${token.label.replace(" ", "-")}`);
      const handle = bootstrapWorkspace(env.harness, `public-run-${token.label.replace(" ", "-")}`, catalog, {
        grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
      });
      seedWorkspacePendingResearch(handle, catalog, "sess-workspace-producer");
      const pendingBytes = readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8");
      const result = await invokePublicSession(handle, `public-run-${token.label.replace(" ", "-")}`, token.runtimeObserved);
      assert.equal(result.replayed, false);
      const verified = readRunState(handle).nodes["run.research-scan"]!;
      assert.equal(verified.status, "succeeded", `${token.label} public runSession must accept the pending workspace attempt`);
      const proof = proofStrengthLine(handle);
      if (token.runtimeObserved === undefined) {
        assert.notEqual(readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8"), pendingBytes);
        assert(
          Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=unknown") && !proof.includes("runtime=checked")),
          `public runSession without runtimeObserved cannot invent runtime proof, got ${proof ?? "none"}`,
        );
        continue;
      }
      assert(
        Boolean(proof?.includes("semantic=checked") && proof.includes("runtime=checked")),
        `public runSession ${token.label} must record workspace runtime proof, got ${proof ?? "none"}`,
      );
      assert(!proof?.includes("runtime=unknown"), `public runSession ${token.label} must not leave runtime unobserved`);
    } finally {
      env.cleanup();
    }
  }
});

test("public runSession refuses a live-device word and preserves run-state bytes", async () => {
  const env = tempHarness("public-run-live-device");
  try {
    const catalog = researchScanCatalog("catalog.public-run-session.live-device");
    const handle = bootstrapWorkspace(env.harness, "public-run-live-device", catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    seedWorkspacePendingResearch(handle, catalog, "sess-workspace-producer");
    const pendingBytes = readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8");
    await assert.rejects(
      () => invokePublicSession(handle, "public-run-live-device", "live-device"),
      /business.session_refused/,
    );
    assert.equal(readFileSync(path.join(handle.dir, "run", "run-state.json"), "utf8"), pendingBytes);
    assert.notEqual(readRunState(handle).nodes["run.research-scan"]!.status, "succeeded");
  } finally {
    env.cleanup();
  }
});

test("public runSession fixture loop cannot invent runtime=checked even with the token", async () => {
  const env = tempHarness("public-run-fixture");
  try {
    const catalog = researchScanCatalog("catalog.public-run-session.fixture");
    const handle = bootstrapWorkspace(env.harness, "public-run-fixture", catalog, {
      grants: { "domain.research": grant("domain.research", "run-with-guardrails") },
    });
    const result = await invokePublicSession(handle, "public-run-fixture", true);
    assert.equal(result.replayed, false);
    const state = readRunState(handle).nodes["run.research-scan"]!;
    assert.equal(state.status, "succeeded");
    assert(
      state.attempts.every((entry) => entry.proofSource === "synthetic"),
      "a fixture loop must remain explicitly synthetic",
    );
    const proof = proofStrengthLine(handle);
    assert(
      Boolean(proof?.includes("runtime=unknown") && !proof.includes("runtime=checked")),
      `fixture public runSession cannot invent runtime proof, got ${proof ?? "none"}`,
    );
  } finally {
    env.cleanup();
  }
});
