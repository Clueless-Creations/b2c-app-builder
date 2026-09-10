/**
 * #85 pure EAS Update eligibility. Never publishes. Fake app dirs only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assessExpoUpdateEligibility,
  fingerprintExpoJsInputs,
  fingerprintExpoNativeInputs,
} from "../../../adapters/providers/expo/update-policy.js";
import { buildExpoEasArgv, ExpoArgvRefusal } from "../../../adapters/providers/expo/argv.js";
import { assert, type Harness } from "./_harness.js";

function writeFakeApp(root: string): string {
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fake-expo-app", dependencies: { expo: "54.0.0" } }, null, 2));
  writeFileSync(path.join(root, "app.json"), JSON.stringify({ expo: { extra: { eas: { projectId: "proj_approved" } } } }, null, 2));
  writeFileSync(path.join(root, "eas.json"), JSON.stringify({ build: { preview: { distribution: "internal" } } }, null, 2));
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "Screen.tsx"), "export const Screen = () => null;\n");
  return root;
}

export function register(harness: Harness): void {
  harness.check("expo-eas-update-policy: js-only change is eligible and never auto-published", () => {
    const cwd = writeFakeApp(harness.makeTempDir("ota-js"));
    const native = fingerprintExpoNativeInputs(cwd);
    const jsBefore = fingerprintExpoJsInputs(cwd);
    writeFileSync(path.join(cwd, "src", "Home.tsx"), "export const Home = () => null;\n");
    assert(fingerprintExpoJsInputs(cwd) !== jsBefore, "js digest must notice a screen change");
    const eligibility = assessExpoUpdateEligibility({
      selected: true,
      nativeFingerprintOnBinary: native,
      currentNativeFingerprint: fingerprintExpoNativeInputs(cwd),
      runtimeOnBinary: "1.0.0",
      currentRuntimeVersion: "1.0.0",
      approvedChannel: "preview",
      requestChannel: "preview",
    });
    assert(eligibility.eligible === true, `js-only should be eligible, got ${JSON.stringify(eligibility)}`);
    assert(eligibility.autoPublish === false, "eligible updates must not auto-publish");
  });

  harness.check("expo-eas-update-policy: native/plugin/lockfile change with matching runtime string is refused", () => {
    const cwd = writeFakeApp(harness.makeTempDir("ota-native"));
    const nativeOnBinary = fingerprintExpoNativeInputs(cwd);
    mkdirSync(path.join(cwd, "ios"), { recursive: true });
    writeFileSync(path.join(cwd, "ios", "Info.plist"), "<plist></plist>\n");
    const eligibility = assessExpoUpdateEligibility({
      selected: true,
      nativeFingerprintOnBinary: nativeOnBinary,
      currentNativeFingerprint: fingerprintExpoNativeInputs(cwd),
      runtimeOnBinary: "1.0.0",
      currentRuntimeVersion: "1.0.0",
    });
    assert(eligibility.eligible === false && eligibility.reason === "native-or-sdk-change", `expected native hold, got ${JSON.stringify(eligibility)}`);
    assert(eligibility.autoPublish === false, "native hold must not publish");
  });

  harness.check("expo-eas-update-policy: runtime mismatch and stale channel/environment refuse", () => {
    const cwd = writeFakeApp(harness.makeTempDir("ota-stale"));
    const native = fingerprintExpoNativeInputs(cwd);
    const runtime = assessExpoUpdateEligibility({
      selected: true,
      nativeFingerprintOnBinary: native,
      currentNativeFingerprint: native,
      runtimeOnBinary: "1.0.0",
      currentRuntimeVersion: "2.0.0",
    });
    assert(runtime.reason === "runtime-mismatch", `expected runtime mismatch, got ${JSON.stringify(runtime)}`);
    const channel = assessExpoUpdateEligibility({
      selected: true,
      nativeFingerprintOnBinary: native,
      currentNativeFingerprint: native,
      approvedChannel: "preview",
      requestChannel: "production",
    });
    assert(channel.reason === "stale-approval", `expected stale channel, got ${JSON.stringify(channel)}`);
    const environment = assessExpoUpdateEligibility({
      selected: true,
      nativeFingerprintOnBinary: native,
      currentNativeFingerprint: native,
      approvedEnvironment: "preview",
      requestEnvironment: "production",
    });
    assert(environment.reason === "stale-approval", `expected stale environment, got ${JSON.stringify(environment)}`);
    const unselected = assessExpoUpdateEligibility({
      selected: false,
      nativeFingerprintOnBinary: native,
      currentNativeFingerprint: native,
    });
    assert(unselected.reason === "unselected", `expected unselected, got ${JSON.stringify(unselected)}`);
  });

  harness.check("expo-eas-update-policy: eas.update stays unlabeled for spawn", () => {
    let refused = false;
    try {
      buildExpoEasArgv({ operationId: "eas.update", hostAuthorityGranted: true });
    } catch (error) {
      refused = error instanceof ExpoArgvRefusal && error.code === "unsupported-operation";
    }
    assert(refused, "eas.update must not gain argv in this increment");
  });
}
