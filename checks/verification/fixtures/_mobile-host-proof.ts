import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectIosAppBundle } from "../../../adapters/ios-app-evidence.js";
import { createNativeMobileOperationTransport, type NativeMobileTargetProof } from "../../../adapters/mobile-operation-host.js";
import { createMobileOperationRoute, targetFromInstalledSimulatorBuild } from "../../../adapters/mobile-operation.js";
import type { DeviceProofSpawnFn } from "../../../adapters/device-proof.js";
import type { MobileRequest } from "../../../contracts/mobile-operation.js";

const root = mkdtempSync(path.join(tmpdir(), "native-host-proof-"));
try {
  const app = path.join(root, "Fixture.app");
  mkdirSync(app);
  writeFileSync(
    path.join(app, "Info.plist"),
    '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.fixture</string><key>CFBundleVersion</key><string>1</string><key>CFBundleExecutable</key><string>Fixture</string></dict></plist>',
  );
  writeFileSync(path.join(app, "Fixture"), "synthetic native executable bytes");
  const identity = inspectIosAppBundle(app);
  const time = "2026-09-05T00:00:00.000Z";
  let clock = new Date(time);
  const now = () => clock;
  const deviceId = "11111111-1111-4111-8111-111111111111";
  const proof: NativeMobileTargetProof = {
    observedAt: time,
    osVersion: "26.5",
    locale: "en_US",
    build: {
      deviceId,
      bundleId: identity.bundleId,
      buildNumber: "1",
      scheme: "Fixture",
      projectPath: "fixture.xcodeproj",
      derivedDataPath: root,
      appPath: app,
      installedAppPath: app,
      appFingerprint: identity.artifactFingerprint,
      bundleContentSha256: identity.bundleContentSha256,
      executable: identity.executable,
      source: { root, roots: [], fingerprint: "fixture" },
    },
  };
  const calls: string[][] = [];
  let switchForegroundOnCapture = false;
  let captureMode: "png" | "malformed" | "oversized" = "png";
  let launchStatus = 0;
  let processPath = path.join(app, "Fixture");
  let deviceState = "Booted";
  let locale = "en_US";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const spawn: DeviceProofSpawnFn = (command, args, options) => {
    assert.equal(options.timeoutMs, 15_000);
    calls.push([command, ...args]);
    const result = (stdout: string, status = 0) => ({ status, stdout, stderr: "" });
    if (command === "/bin/ps") return result(processPath);
    assert.equal(command, "xcrun");
    if (args[1] === "list")
      return result(
        JSON.stringify({ devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [{ udid: deviceId, state: deviceState, isAvailable: true }] } }),
      );
    if (args[1] === "spawn") {
      assert.deepEqual(args, ["simctl", "spawn", deviceId, "defaults", "read", "-g", "AppleLocale"]);
      return result(locale);
    }
    if (args[1] === "get_app_container") return result(app);
    if (args[1] === "launch") return result("com.example.fixture: 123", launchStatus);
    if (args[1] === "io") {
      writeFileSync(args.at(-1)!, captureMode === "malformed" ? Buffer.from("bad") : png);
      if (captureMode === "oversized") truncateSync(args.at(-1)!, 32 * 1024 * 1024 + 1);
      if (switchForegroundOnCapture) front = "com.apple.springboard";
      return result("Captured PNG");
    }
    throw new Error(`Unexpected command ${args.join(" ")}`);
  };
  const request = (operation: MobileRequest["operation"]): MobileRequest => ({
    providerId: "b2c/host-native-mobile",
    operation,
    target: targetFromInstalledSimulatorBuild(proof.build, proof.osVersion, proof.locale),
    requestedAt: time,
    purpose: "exploration",
    stateId: "fixture-home",
  });
  const transport = createNativeMobileOperationTransport({ proof, spawn, now });
  assert.deepEqual((await transport.support()).tuples[0]!.operations, ["b2c/mobile-app-operation.launch", "b2c/mobile-app-operation.inspect"]);
  const launch = request("b2c/mobile-app-operation.launch");
  const launched = await transport.execute(launch, "launch-1");
  assert.equal(launched.observation.source, "host-observation");
  assert(await transport.observe(launch, "launch-1"));
  await assert.rejects(() => transport.execute(launch, "launch-1"), /duplicate/);
  processPath = path.join(root, "other-app");
  writeFileSync(processPath, "other executable");
  await assert.rejects(() => transport.observe(launch, "launch-1"), /readback_mismatch/);
  processPath = path.join(app, "Fixture");
  const inspection = request("b2c/mobile-app-operation.inspect");
  const inspected = await transport.execute(inspection, "inspect-1");
  assert.match(inspected.observation.observations[0]!, /UI state is unobserved/);
  for (const operation of [
    "b2c/mobile-app-operation.interact",
    "b2c/mobile-app-operation.record-video",
    "b2c/mobile-app-operation.capture-screenshot",
  ] as const)
    await assert.rejects(() => transport.execute(request(operation), operation), /unsupported/);
  await assert.rejects(() => transport.execute({ ...inspection, target: { ...inspection.target, appId: "other" } }, "wrong"), /selected_target/);
  locale = "fr_FR";
  assert.equal((await transport.support()).availability, "unavailable");
  locale = "en_US";
  deviceState = "Shutdown";
  assert.equal((await transport.support()).availability, "unavailable");
  deviceState = "Booted";
  clock = new Date(Date.parse(time) + 60_001);
  assert.equal((await transport.support()).availability, "unavailable");
  clock = new Date(time);
  launchStatus = 1;
  await assert.rejects(() => transport.execute(launch, "failed-launch"), /uncertain/);
  launchStatus = 0;
  await assert.rejects(() => transport.execute(launch, "failed-launch"), /duplicate/);
  let front = "com.example.fixture";
  let foregroundAt = time;
  const capturedTransport = createNativeMobileOperationTransport({
    proof,
    spawn,
    now,
    captureArtifactId: "artifact.raw",
    readForegroundApp: async () => ({ deviceId, appId: front, observedAt: foregroundAt }),
  });
  const screenshot = request("b2c/mobile-app-operation.capture-screenshot");
  const route = createMobileOperationRoute({
    transport: capturedTransport,
    operation: screenshot.operation,
    implementationId: "fixture/native",
    packageDigest: "sha256:" + "a".repeat(64),
    resultArtifactId: "artifact.result",
    receiptArtifactId: "artifact.receipt",
    captureArtifactId: "artifact.raw",
    input: () => screenshot,
    now,
  });
  const response = await route.execute({ input: screenshot, idempotencyKey: "capture-1", knowledge: [] });
  assert(response.artifacts?.[0]?.bytes.equals(png));
  assert.equal((response.output as { marketingStatus: string }).marketingStatus, "raw-source");
  assert(await route.observe({ input: screenshot, idempotencyKey: "capture-1", output: response.output, evidence: response.evidence }));
  captureMode = "malformed";
  await assert.rejects(() => capturedTransport.execute(screenshot, "malformed"), /capture_invalid/);
  captureMode = "oversized";
  await assert.rejects(() => capturedTransport.execute(screenshot, "oversized"), /oversized/);
  captureMode = "png";
  front = "com.apple.springboard";
  await assert.rejects(
    () => route.observe({ input: screenshot, idempotencyKey: "capture-1", output: response.output, evidence: response.evidence }),
    /unsupported_target_operation/,
  );
  assert(!(await capturedTransport.support()).tuples[0]!.operations.includes(screenshot.operation));
  front = "com.example.fixture";
  switchForegroundOnCapture = true;
  await assert.rejects(() => capturedTransport.execute(screenshot, "foreground-changed"), /foreground_mismatch/);
  front = "com.example.fixture";
  switchForegroundOnCapture = false;
  await assert.rejects(() => capturedTransport.execute(screenshot, "foreground-changed"), /duplicate/);
  assert.equal(await createNativeMobileOperationTransport({ proof, spawn, now }).observe(launch, "launch-1"), undefined);
  foregroundAt = new Date(Date.parse(time) - 1).toISOString();
  assert(!(await capturedTransport.support()).tuples[0]!.operations.includes(screenshot.operation));
  writeFileSync(path.join(app, "Fixture"), "tampered installed application");
  assert.equal((await transport.support()).availability, "unavailable");
  assert(!calls.some((call) => call.includes("boot") || call.includes("install") || call.includes("bridge")));
  assert(calls.some((call) => call[0] === "/bin/ps"));
  assert.equal(readFileSync(path.join(app, "Fixture"), "utf8"), "tampered installed application");
  console.log(
    "PASS native host command/readback: current exact target; launch process; identity inspect; scoped PNG through existing route; unsupported operations; stale/mismatched/uncertain/tampered refusal; no install/boot/bridge.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
