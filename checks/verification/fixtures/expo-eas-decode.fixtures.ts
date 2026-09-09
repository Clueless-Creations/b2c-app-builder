/**
 * #105 command-specific EAS decode. Native envelopes are loaded from
 * checks/verification/test/data/expo-eas/ (EAS CLI 23.2.0 source), not from argv.ts
 * or this decoder. Fake processes do not define the expected contract.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeExpoEasResponse, ledgerArtifactUrl } from "../../../adapters/providers/expo/decode.js";
import { isSuccessfulBuild, type EasJobEntry } from "../../../adapters/providers/expo/jobs.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const FIXTURE_DIR = path.join(skillRoot, "checks/verification/test/data/expo-eas");

function loadNative(name: string): string {
  return readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

function wrapAsArray(objectFile: string): string {
  return `${JSON.stringify([JSON.parse(loadNative(objectFile))], null, 2)}\n`;
}

const expectedIosPreview = {
  platform: "ios" as const,
  profile: "preview",
  easProjectId: "proj_approved",
};

export function register(harness: Harness): void {
  harness.check("expo-eas-decode: fixtures are independent of argv encoding", () => {
    const argvSource = readFileSync(path.join(skillRoot, "adapters/providers/expo/argv.ts"), "utf8");
    const decodeSource = readFileSync(path.join(skillRoot, "adapters/providers/expo/decode.ts"), "utf8");
    assert(!argvSource.includes("decodeExpoEasResponse"), "encoder must not own decode");
    assert(decodeSource.includes("runBuildAndSubmit.ts"), "decode must cite the build array print path");
    assert(decodeSource.includes("commands/build/view.ts"), "decode must cite the build:view object print path");
    const one = loadNative("build-cloud-one-element-array.json");
    assert(one.trimStart().startsWith("["), "cloud fixture must be a top-level array");
    assert(!one.includes("buildExpoEasArgv"), "native fixture must not mention the encoder");
  });

  harness.check("expo-eas-decode: one-element cloud array preserves job identity", () => {
    const decoded = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadNative("build-cloud-one-element-array.json"),
      expected: expectedIosPreview,
    });
    assert(decoded.code === "ok" || decoded.code === "partial", decoded.code);
    assert(decoded.protocolValid, decoded.message);
    assert(decoded.boundRemoteId === "11111111-1111-4111-8111-111111111111", decoded.boundRemoteId ?? "");
    assert(decoded.qualifiedRemoteIds[0] === "eas:build:11111111-1111-4111-8111-111111111111", decoded.qualifiedRemoteIds.join(","));
    assert(decoded.jobState === "queued", decoded.jobState ?? "");
    assert(decoded.artifactAvailable === false, "queued is not an installable artifact");
  });

  harness.check("expo-eas-decode: build:view single object resolves the same job through its own decoder", () => {
    const view = decodeExpoEasResponse({
      commandId: "eas.build.view",
      stdout: loadNative("build-view-single-object.json"),
      expected: { ...expectedIosPreview, buildId: "11111111-1111-4111-8111-111111111111" },
    });
    const cloud = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadNative("build-cloud-one-element-array.json"),
      expected: expectedIosPreview,
    });
    assert(view.protocolValid, view.message);
    assert(view.boundRemoteId === cloud.boundRemoteId, `${view.boundRemoteId} vs ${cloud.boundRemoteId}`);
    assert(view.qualifiedRemoteIds[0] === cloud.qualifiedRemoteIds[0], "qualified ids must match across command envelopes");
    assert(view.jobState === "running", view.jobState ?? "");
  });

  harness.check("expo-eas-decode: multiple builds are retained and not silently bound", () => {
    const decoded = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadNative("build-cloud-multi-array.json"),
      expected: expectedIosPreview,
    });
    assert(decoded.code === "unsupported-multiplicity", decoded.code);
    assert(decoded.protocolValid === false, "multiplicity is not a unique job");
    assert(decoded.boundRemoteId === undefined, decoded.boundRemoteId ?? "");
    assert(decoded.observedRemoteIds.length === 2, String(decoded.observedRemoteIds.length));
    assert(decoded.observedRemoteIds.includes("22222222-2222-4222-8222-222222222222"), decoded.observedRemoteIds.join(","));
  });

  harness.check("expo-eas-decode: queued/running/finished/error states use GraphQL spellings", () => {
    const queued = decodeExpoEasResponse({ commandId: "eas.build.cloud", stdout: loadNative("build-cloud-one-element-array.json"), expected: expectedIosPreview });
    const running = decodeExpoEasResponse({ commandId: "eas.build.view", stdout: loadNative("build-view-single-object.json"), expected: expectedIosPreview });
    const finished = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: wrapAsArray("build-finished-nested-artifacts.json"),
      expected: expectedIosPreview,
    });
    const errored = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: wrapAsArray("build-errored-partial.json"),
      expected: expectedIosPreview,
    });
    assert(queued.jobState === "queued", queued.jobState ?? "");
    assert(running.jobState === "running", running.jobState ?? "");
    assert(finished.jobState === "finished", finished.jobState ?? "");
    assert(errored.jobState === "errored" && errored.boundRemoteId, errored.message);
    assert(finished.artifactAvailable, "nested applicationArchiveUrl must decode");
    assert(finished.artifactUrl?.endsWith("fixture.ipa"), finished.artifactUrl ?? "");
  });

  harness.check("expo-eas-decode: wait-path null hole stays partial and keeps the surviving id", () => {
    const decoded = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadNative("build-cloud-wait-null-hole.json"),
      expected: expectedIosPreview,
    });
    assert(decoded.protocolValid, decoded.message);
    assert(decoded.boundRemoteId === "11111111-1111-4111-8111-111111111111", decoded.boundRemoteId ?? "");
    assert(decoded.code === "partial" || decoded.code === "ok", decoded.code);
  });

  harness.check("expo-eas-decode: expired nested artifact is not installable proof", () => {
    const decoded = decodeExpoEasResponse({
      commandId: "eas.build.view",
      stdout: loadNative("build-finished-expired.json"),
      expected: expectedIosPreview,
      nowMs: Date.parse("2026-09-09T00:00:00.000Z"),
    });
    assert(decoded.boundRemoteId === "11111111-1111-4111-8111-111111111111", decoded.boundRemoteId ?? "");
    assert(decoded.jobState === "finished", decoded.jobState ?? "");
    assert(decoded.artifactExpired, "expirationDate in the past must mark expired");
    assert(decoded.artifactAvailable === false, "expired archive is not currently usable");
    assert(ledgerArtifactUrl(decoded) === "expired", ledgerArtifactUrl(decoded) ?? "");
    const entry = {
      state: "finished" as const,
      artifactUrl: ledgerArtifactUrl(decoded),
    } as EasJobEntry;
    assert(isSuccessfulBuild(entry) === false, "expired artifact cannot prove a successful build");
  });

  harness.check("expo-eas-decode: mistaken object is wrong-shape for eas.build and array is wrong-shape for build:view", () => {
    const cloud = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadNative("build-mistaken-single-object.json"),
      expected: expectedIosPreview,
    });
    assert(cloud.code === "wrong-shape", cloud.code);
    assert(cloud.protocolValid === false, "old universal object is not a successful cloud build");
    assert(cloud.boundRemoteId === undefined, cloud.boundRemoteId ?? "");
    const view = decodeExpoEasResponse({
      commandId: "eas.build.view",
      stdout: loadNative("build-view-mistaken-array.json"),
      expected: { ...expectedIosPreview, buildId: "11111111-1111-4111-8111-111111111111" },
    });
    assert(view.code === "wrong-shape", view.code);
    assert(view.boundRemoteId === undefined, "build:view must not pick array[0]");
    assert(view.observedRemoteIds.length === 2, String(view.observedRemoteIds.length));
  });

  harness.check("expo-eas-decode: empty, malformed JSON, and non-JSON commands fail closed", () => {
    const empty = decodeExpoEasResponse({ commandId: "eas.build.cloud", stdout: "   ", expected: expectedIosPreview });
    const malformed = decodeExpoEasResponse({ commandId: "eas.build.cloud", stdout: "{not-json", expected: expectedIosPreview });
    const whoami = decodeExpoEasResponse({ commandId: "eas.whoami", stdout: '{"id":"nope"}' });
    const update = decodeExpoEasResponse({ commandId: "eas.update", stdout: "[]" });
    assert(empty.code === "empty", empty.code);
    assert(malformed.code === "malformed-json", malformed.code);
    assert(whoami.code === "not-json", whoami.code);
    assert(whoami.boundRemoteId === undefined, "whoami JSON must not become a job id");
    assert(update.code === "unsupported-command", update.code);
    assert(empty.protocolValid === false && malformed.protocolValid === false && update.protocolValid === false, "invalid output is not success");
  });

  harness.check("expo-eas-decode: workflow and submit envelopes stay distinct from build arrays", () => {
    const run = decodeExpoEasResponse({ commandId: "eas.workflow.run", stdout: loadNative("workflow-run-nowait.json") });
    const status = decodeExpoEasResponse({
      commandId: "eas.workflow.status",
      stdout: loadNative("workflow-status-object.json"),
      expected: { buildId: "33333333-3333-4333-8333-333333333333" },
    });
    const submit = decodeExpoEasResponse({
      commandId: "eas.submit.view",
      stdout: loadNative("submit-view-object.json"),
      expected: { platform: "ios", submissionId: "44444444-4444-4444-8444-444444444444" },
    });
    const list = decodeExpoEasResponse({ commandId: "eas.build.list", stdout: loadNative("build-list-array.json") });
    const cross = decodeExpoEasResponse({
      commandId: "eas.workflow.run",
      stdout: loadNative("build-cloud-one-element-array.json"),
    });
    assert(run.boundRemoteId === "33333333-3333-4333-8333-333333333333", run.boundRemoteId ?? "");
    assert(run.qualifiedRemoteIds[0]?.startsWith("eas:workflow-run:"), run.qualifiedRemoteIds.join(","));
    assert(run.jobState === undefined, "no-wait workflow JSON has no status");
    assert(status.jobState === "finished", status.jobState ?? "");
    assert(submit.jobState === "finished", submit.jobState ?? "");
    assert(submit.qualifiedRemoteIds[0]?.startsWith("eas:submission:"), submit.qualifiedRemoteIds.join(","));
    assert(list.boundRemoteId === undefined, "list must not bind a job");
    assert(list.observedRemoteIds.length === 2, String(list.observedRemoteIds.length));
    assert(cross.code === "wrong-shape", cross.code);
  });

  harness.check("expo-eas-decode: local non-JSON is not a cloud job; target mismatch retains ids", () => {
    const local = decodeExpoEasResponse({ commandId: "eas.build.local", stdout: "Building project...\n" });
    const mismatch = decodeExpoEasResponse({
      commandId: "eas.build.cloud",
      stdout: loadNative("build-cloud-one-element-array.json"),
      expected: { platform: "android", profile: "production", easProjectId: "proj_other" },
    });
    assert(local.code === "not-json", local.code);
    assert(local.boundRemoteId === undefined, local.boundRemoteId ?? "");
    assert(mismatch.code === "target-mismatch", mismatch.code);
    assert(mismatch.observedRemoteIds[0] === "11111111-1111-4111-8111-111111111111", mismatch.observedRemoteIds.join(","));
    assert(mismatch.boundRemoteId === undefined, "mismatched record must not be adopted");
  });
}
