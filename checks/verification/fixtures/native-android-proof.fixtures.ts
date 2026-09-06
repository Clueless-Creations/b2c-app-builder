import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as yaml } from "yaml";
import { fingerprintAppSource } from "../../../kernel/engine/source-fingerprint.js";
import { designArtifact, designCandidateFingerprint, type DesignAcceptanceScope } from "../../validation/business/design/design-acceptance.js";
import { validateNativeAndroidProof } from "../../validation/business/engineering/check-native-android-proof.js";
import { assert, type Harness } from "./_harness.js";

interface Fixture {
  root: string;
  receiptPath?: string;
  scope: DesignAcceptanceScope;
}

let sequence = 0;

function put(root: string, relative: string, value: string | Buffer): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function writeDesign(root: string, scope: DesignAcceptanceScope): void {
  put(root, "DESIGN.md", `---\n${yaml({ acceptance: scope })}---\n# Fixture design\n\n[Home screen](design/screens/home.md)\n`);
}

function baseScope(platform: "ios" | "android"): DesignAcceptanceScope {
  return {
    schemaVersion: 1,
    status: "accepted",
    designContractPaths: ["design/screens/home.md"],
    exclusions: [],
    surfaces: [
      {
        id: `${platform}-home`,
        surfaceId: "home",
        kind: "native",
        platform,
        viewport: "native",
        productScreenIds: ["screen.home"],
        implementationPaths: platform === "android" ? ["android/app/src", "android/design-system"] : ["ios/App"],
        rubricPath: "design/reviews/rubrics/native.md",
        locales: ["en-US"],
        states: ["default", "reduced-motion"],
        stateExclusions: [],
        interactions: [
          {
            id: "complete-task",
            action: "Activate the primary task from the native home surface.",
            expected: "The task completes and the native interface confirms the saved result.",
          },
        ],
      },
    ],
  };
}

function makeFixture(
  harness: Harness,
  options: { platform?: "ios" | "android"; receiptLane?: "emulator" | "physical-device"; receipt?: boolean } = {},
): Fixture {
  const platform = options.platform ?? "android";
  const scope = baseScope(platform);
  const root = harness.makeTempDir(`native-android-proof-${++sequence}`);
  put(root, "design/screens/home.md", "# Home\n\nThe primary action completes one useful consumer task.\n");
  if (platform === "ios") {
    writeDesign(root, scope);
    return { root, scope };
  }
  put(root, "android/app/src/MainActivity.kt", "package com.example.fixture\nclass MainActivity\n");
  put(root, "android/design-system/Tokens.kt", "package com.example.fixture\nobject Tokens\n");
  writeDesign(root, scope);
  if (options.receipt === false) return { root, scope };

  const canonicalRoot = realpathSync(root);
  const sourceRoots = ["android/app/src", "android/design-system"];
  const sourceFingerprint = fingerprintAppSource(canonicalRoot, sourceRoots);
  const candidateSha256 = designCandidateFingerprint(canonicalRoot, scope);
  const apkPath = "proof/android-emulator/app-debug.apk";
  put(root, apkPath, Buffer.from("synthetic APK fixture bytes\n"));
  const evidencePaths = {
    buildLog: "proof/android-emulator/build.log",
    installLog: "proof/android-emulator/install.log",
    deviceReadback: "proof/android-emulator/device-readback.json",
    launchLog: "proof/android-emulator/launch.log",
  };
  put(root, evidencePaths.buildLog, "Synthetic Gradle build output for fixture validation.\n");
  put(root, evidencePaths.installLog, "Synthetic adb install output for fixture validation.\n");
  put(
    root,
    evidencePaths.deviceReadback,
    JSON.stringify({
      deviceId: "emulator-5554",
      packageName: "com.example.fixture",
      versionCode: 42,
      modelIdentifier: "Pixel_9_API_35",
      apiLevel: 35,
      osVersion: "Android 15",
      osBuild: "AP3A.241105.008",
    }),
  );
  put(root, evidencePaths.launchLog, "Synthetic adb activity launch output for fixture validation.\n");
  const receiptPath = options.receiptLane === "physical-device" ? "proof/android-device/complete-task.json" : "proof/android-emulator/complete-task.json";
  put(
    root,
    receiptPath,
    JSON.stringify({
      schemaVersion: 1,
      kind: "android-emulator-install",
      platform: "android",
      target: "emulator",
      flow: "complete-task",
      candidateSha256,
      tool: { name: "synthetic-strict-android-runner", version: "1.0.0" },
      sessionId: "synthetic-android-proof-session",
      device: {
        id: "emulator-5554",
        physical: false,
        deviceClass: "android-emulator",
        modelIdentifier: "Pixel_9_API_35",
        apiLevel: 35,
        osVersion: "Android 15",
        osBuild: "AP3A.241105.008",
      },
      builtPackage: {
        packageName: "com.example.fixture",
        versionCode: 42,
        artifact: { format: "apk", ...designArtifact(root, apkPath) },
        source: { root: canonicalRoot, roots: sourceRoots, fingerprint: sourceFingerprint },
      },
      install: {
        deviceId: "emulator-5554",
        apkPath,
        apkSha256: designArtifact(root, apkPath).sha256,
        packageName: "com.example.fixture",
        versionCode: 42,
        installedAt: "2026-01-02T00:10:00Z",
      },
      installedAppReadback: {
        deviceId: "emulator-5554",
        packageName: "com.example.fixture",
        versionCode: 42,
        readAt: "2026-01-02T00:12:00Z",
      },
      launch: {
        deviceId: "emulator-5554",
        packageName: "com.example.fixture",
        activity: ".MainActivity",
        launchedAt: "2026-01-02T00:14:00Z",
      },
      evidence: Object.fromEntries(Object.entries(evidencePaths).map(([key, value]) => [key, designArtifact(root, value)])),
      verdict: "passed",
      startedAt: "2026-01-02T00:05:00Z",
      finishedAt: "2026-01-02T00:15:00Z",
    }),
  );
  return { root, receiptPath, scope };
}

function codes(root: string): string[] {
  return validateNativeAndroidProof(root, () => ({ packageName: "com.example.fixture", versionCode: 42 })).map((entry) => entry.code);
}

export function register(harness: Harness): void {
  harness.check("strict Android gate is a no-op when accepted scope selects only iOS", () => {
    const fixture = makeFixture(harness, { platform: "ios" });
    assert(
      validateNativeAndroidProof(fixture.root, () => ({ packageName: "unused", versionCode: 1 })).length === 0,
      "iOS-only scope must not require Android proof",
    );
  });

  harness.check("accepted Android scope names the strict adapter blocker when no receipt exists", () => {
    const fixture = makeFixture(harness, { receipt: false });
    const found = codes(fixture.root);
    assert(found.length === 1 && found[0] === "android.strict_receipt_adapter_required", `unexpected issues: ${found.join(", ")}`);
  });

  harness.check("selected Android state cannot bypass proof through a missing DESIGN.md scope", () => {
    const root = harness.makeTempDir("native-android-proof-missing-scope");
    put(root, "state/business-state.json", JSON.stringify({ project: { platforms: ["android"] } }));
    const found = codes(root);
    assert(found.includes("android.scope_invalid"), `missing selected Android scope did not fail: ${found.join(", ")}`);
  });

  harness.check("accepted Android scope cannot bypass proof when reducer state excludes Android", () => {
    const fixture = makeFixture(harness, { receipt: false });
    put(fixture.root, "state/business-state.json", JSON.stringify({ project: { platforms: ["ios"] } }));
    const found = codes(fixture.root);
    assert(found.includes("android.scope_platform_mismatch"), `state/design platform mismatch did not fail: ${found.join(", ")}`);
  });

  harness.check("bounded MobAI adapter artifacts never qualify as strict Android receipts", () => {
    const fixture = makeFixture(harness, { receipt: false });
    put(
      fixture.root,
      "proof/android-emulator/adapter-actions.json",
      JSON.stringify({
        rung: "rung-4-mobai",
        verificationScope: "adapter-actions-only",
        steps: [{ name: "strict_receipt", ok: false, error: "source-to-APK linkage unavailable" }],
        verdict: "failed",
      }),
    );
    const found = codes(fixture.root);
    assert(found.includes("android.strict_receipt_adapter_required"), `bounded adapter artifact was incorrectly accepted: ${found.join(", ")}`);
  });

  harness.check("current emulator receipt passes the strict Android proof gate", () => {
    const fixture = makeFixture(harness);
    const issues = validateNativeAndroidProof(fixture.root, () => ({ packageName: "com.example.fixture", versionCode: 42 }));
    assert(issues.length === 0, `valid strict emulator receipt failed: ${issues.map((entry) => `${entry.code}: ${entry.message}`).join("; ")}`);
  });

  harness.check("strict Android receipt lane must match its target", () => {
    const fixture = makeFixture(harness, { receiptLane: "physical-device" });
    const found = codes(fixture.root);
    assert(found.includes("android.receipt_lane"), `wrong-lane receipt did not fail: ${found.join(", ")}`);
  });

  harness.check("strict Android receipt rejects changed APK bytes", () => {
    const fixture = makeFixture(harness);
    put(fixture.root, "proof/android-emulator/app-debug.apk", Buffer.from("changed APK fixture bytes\n"));
    const found = codes(fixture.root);
    assert(found.includes("android.artifact_hash"), `changed APK did not fail its hash: ${found.join(", ")}`);
  });

  harness.check("strict Android receipt rejects an installation APK with a different manifest identity", () => {
    const fixture = makeFixture(harness);
    const found = validateNativeAndroidProof(fixture.root, () => ({ packageName: "com.other.app", versionCode: 41 })).map((entry) => entry.code);
    assert(found.includes("android.apk_manifest"), `wrong APK manifest identity did not fail: ${found.join(", ")}`);
  });

  harness.check("strict Android receipt cannot hash a narrower source subset", () => {
    const fixture = makeFixture(harness);
    const receipt = JSON.parse(readFileSync(path.join(fixture.root, fixture.receiptPath!), "utf8"));
    receipt.builtPackage.source.roots = ["android/app/src"];
    receipt.builtPackage.source.fingerprint = fingerprintAppSource(realpathSync(fixture.root), receipt.builtPackage.source.roots);
    put(fixture.root, fixture.receiptPath!, JSON.stringify(receipt));
    const found = codes(fixture.root);
    assert(found.includes("android.source_roots"), `narrow source roots did not fail: ${found.join(", ")}`);
  });

  harness.check("strict Android receipt becomes stale after a design-contract edit", () => {
    const fixture = makeFixture(harness);
    put(fixture.root, "design/screens/home.md", "# Home\n\nThe reviewed interaction changed after the Android package was built.\n");
    const found = codes(fixture.root);
    assert(found.includes("android.candidate_stale"), `candidate mutation did not stale Android proof: ${found.join(", ")}`);
  });
}
