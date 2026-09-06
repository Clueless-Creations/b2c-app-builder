import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stringify as yaml } from "yaml";
import { inspectIosAppBundle, writeIosSimulatorCommandTranscript } from "../../../adapters/ios-app-evidence.js";
import type { DeviceProofStep, InstalledSimulatorBuild } from "../../../adapters/device-proof.js";
import { fingerprintAppSource } from "../../../kernel/engine/source-fingerprint.js";
import { fingerprintIosDesignInputs, materializeStrictIosSimulatorProof } from "../../../kernel/session/ios-proof-receipt.js";
import { validateNativeIosRetainedProof } from "../../validation/business/engineering/native-ios-retained-proof.js";
import { assert, type Harness } from "./_harness.js";

const DEVICE_ID = "403BC147-3C20-49C2-8F72-4F2252B02065";
let sequence = 0;

interface Fixture {
  readonly root: string;
  readonly receiptPath?: string;
}

function put(root: string, relative: string, value: string | Buffer): string {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
  return target;
}

function writeApp(target: string, buildNumber = "42", executable = "fresh executable"): void {
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, "App"), executable);
  writeFileSync(path.join(target, "App.debug.dylib"), "fresh app code");
  writeFileSync(
    path.join(target, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.example.fixture</string><key>CFBundleVersion</key><string>${buildNumber}</string><key>CFBundleExecutable</key><string>App</string></dict></plist>`,
  );
}

function writeDesign(root: string): void {
  const acceptance = {
    schemaVersion: 1,
    status: "accepted",
    designContractPaths: ["design/screens/home.md"],
    exclusions: [],
    surfaces: [
      {
        id: "ios-home",
        surfaceId: "home",
        kind: "native",
        platform: "ios",
        viewport: "native",
        productScreenIds: ["screen.home"],
        implementationPaths: ["ios/App"],
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
  put(root, "design/screens/home.md", "# Home\n\nThe primary action completes one useful consumer task.\n");
  put(root, "DESIGN.md", `---\n${yaml({ acceptance })}---\n# Fixture design\n\n[Home screen](design/screens/home.md)\n`);
}

function makeFixture(harness: Harness, options: { receipt?: boolean } = {}): Fixture {
  const root = harness.makeTempDir(`native-ios-proof-${++sequence}`);
  writeDesign(root);
  put(root, "ios/App/Sources/App.swift", "struct FixtureApp {}\n");
  put(root, "ios/App.xcodeproj/project.pbxproj", "synthetic Xcode project\n");
  if (options.receipt === false) return { root };

  const outputDir = path.join(root, "proof", "ios-simulator");
  const derivedData = path.join(root, "runtime", "DerivedData-current");
  const builtApp = path.join(derivedData, "Build", "Products", "Debug-iphonesimulator", "App.app");
  const installedApp = path.join(root, "runtime", "simulator", "App.app");
  writeApp(builtApp);
  cpSync(builtApp, installedApp, { recursive: true });
  const projectPath = path.join(root, "ios", "App.xcodeproj");
  const transcriptDir = path.join(root, "runtime", "command-transcripts");
  const times = {
    build: "2026-01-02T00:01:00.000Z",
    install: "2026-01-02T00:02:00.000Z",
    readback: "2026-01-02T00:03:00.000Z",
    launch: "2026-01-02T00:04:00.000Z",
  };
  const buildTranscript = writeIosSimulatorCommandTranscript(
    transcriptDir,
    "build",
    "xcodebuild",
    ["build", "-project", projectPath, "-scheme", "App", "-destination", `platform=iOS Simulator,id=${DEVICE_ID}`, "-derivedDataPath", derivedData],
    { status: 0, stdout: "** BUILD SUCCEEDED **\n", stderr: "" },
    times.build,
  );
  const installTranscript = writeIosSimulatorCommandTranscript(
    transcriptDir,
    "install",
    "xcrun",
    ["simctl", "install", DEVICE_ID, builtApp],
    { status: 0, stdout: "", stderr: "" },
    times.install,
  );
  const readbackTranscript = writeIosSimulatorCommandTranscript(
    transcriptDir,
    "readback",
    "xcrun",
    ["simctl", "get_app_container", DEVICE_ID, "com.example.fixture", "app"],
    { status: 0, stdout: `${installedApp}\n`, stderr: "" },
    times.readback,
  );
  const launchTranscript = writeIosSimulatorCommandTranscript(
    transcriptDir,
    "launch",
    "xcrun",
    ["simctl", "launch", "--terminate-running-process", DEVICE_ID, "com.example.fixture"],
    { status: 0, stdout: "com.example.fixture: 101\n", stderr: "" },
    times.launch,
  );
  const identity = inspectIosAppBundle(builtApp);
  const sourceRoot = realpathSync(path.join(root, "ios"));
  const sourceRoots = ["App", "App.xcodeproj"];
  const installedBuild: InstalledSimulatorBuild = {
    deviceId: DEVICE_ID,
    bundleId: identity.bundleId,
    buildNumber: identity.buildNumber,
    scheme: "App",
    projectPath,
    derivedDataPath: derivedData,
    appPath: builtApp,
    appFingerprint: identity.artifactFingerprint,
    bundleContentSha256: identity.bundleContentSha256,
    installedAppPath: installedApp,
    executable: identity.executable,
    source: { root: sourceRoot, roots: sourceRoots, fingerprint: fingerprintAppSource(sourceRoot, sourceRoots) },
  };
  const steps: DeviceProofStep[] = [
    { name: "resolve_simulator", ok: true },
    { name: "build", ok: true, transcriptPath: buildTranscript },
    { name: "verify_build", ok: true },
    { name: "install", ok: true, transcriptPath: installTranscript },
    { name: "verify_install", ok: true, transcriptPath: readbackTranscript, installedBuild },
    { name: "launch", ok: true, transcriptPath: launchTranscript },
  ];
  mkdirSync(outputDir, { recursive: true });
  const produced = materializeStrictIosSimulatorProof({
    workspaceRoot: root,
    outputDir,
    flow: "complete-task",
    steps,
    startedAt: "2026-01-02T00:00:00.000Z",
    designFingerprint: fingerprintIosDesignInputs(root),
    finishedAt: "2026-01-02T00:05:00.000Z",
  });
  return { root, receiptPath: produced.relativeReceiptPath };
}

function codes(root: string): string[] {
  return validateNativeIosRetainedProof(root).map((entry) => entry.code);
}

export function register(harness: Harness): void {
  harness.check("strict iOS producer retains both .app bundles and its consumer accepts current evidence", () => {
    const fixture = makeFixture(harness);
    const receipt = JSON.parse(readFileSync(path.join(fixture.root, fixture.receiptPath!), "utf8")) as {
      builtApp: { retainedPath: string };
      installedAppReadback: { app: { retainedPath: string } };
    };
    assert(receipt.builtApp.retainedPath !== receipt.installedAppReadback.app.retainedPath, "producer must retain distinct bundle copies");
    const issues = validateNativeIosRetainedProof(fixture.root);
    assert(issues.length === 0, `valid strict iOS receipt failed: ${issues.map((entry) => `${entry.code}: ${entry.message}`).join("; ")}`);
  });

  harness.check("accepted iOS scope rejects an adapter-only receipt with self-asserted hashes", () => {
    const fixture = makeFixture(harness, { receipt: false });
    put(
      fixture.root,
      "proof/ios-simulator/adapter-actions.json",
      JSON.stringify({
        rung: "rung-2-xcodebuild",
        platform: "ios",
        verificationScope: "adapter-actions-only",
        steps: [{ name: "verify_install", ok: true, installedBuild: { bundleId: "com.example.fixture", executable: { sha256: "a".repeat(64) } } }],
        verdict: "passed",
      }),
    );
    const found = codes(fixture.root);
    assert(found.includes("ios.strict_receipt_required"), `adapter-only claims incorrectly passed: ${found.join(", ")}`);
  });

  harness.check("strict iOS receipt rejects changed retained executable bytes", () => {
    const fixture = makeFixture(harness);
    const receipt = JSON.parse(readFileSync(path.join(fixture.root, fixture.receiptPath!), "utf8")) as {
      builtApp: { retainedPath: string; executable: { path: string } };
    };
    put(fixture.root, `${receipt.builtApp.retainedPath}/${receipt.builtApp.executable.path}`, "hand-edited executable\n");
    const found = codes(fixture.root);
    assert(found.includes("ios.bundle_identity"), `changed executable did not fail byte readback: ${found.join(", ")}`);
  });

  harness.check("strict iOS receipt rejects installed Info.plist identity drift", () => {
    const fixture = makeFixture(harness);
    const receipt = JSON.parse(readFileSync(path.join(fixture.root, fixture.receiptPath!), "utf8")) as {
      installedAppReadback: { app: { retainedPath: string } };
    };
    put(
      fixture.root,
      `${receipt.installedAppReadback.app.retainedPath}/Info.plist`,
      '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.other.app</string><key>CFBundleVersion</key><string>41</string><key>CFBundleExecutable</key><string>App</string></dict></plist>',
    );
    const found = codes(fixture.root);
    assert(found.includes("ios.bundle_identity"), `installed bundle metadata drift did not fail: ${found.join(", ")}`);
  });

  harness.check("strict iOS receipt rejects source changes after the build", () => {
    const fixture = makeFixture(harness);
    put(fixture.root, "ios/App/Sources/App.swift", "struct FixtureApp { let changed = true }\n");
    const found = codes(fixture.root);
    assert(found.includes("ios.source_fingerprint"), `changed source did not stale iOS proof: ${found.join(", ")}`);
  });

  harness.check("strict iOS receipt becomes stale after a detailed design-contract edit", () => {
    const fixture = makeFixture(harness);
    put(fixture.root, "design/screens/home.md", "# Home\n\nThe accepted native interaction changed after device proof.\n");
    const found = codes(fixture.root);
    assert(found.includes("ios.design_stale"), `design mutation did not stale iOS proof: ${found.join(", ")}`);
  });

  harness.check("strict iOS receipt rejects a changed raw command transcript", () => {
    const fixture = makeFixture(harness);
    const receiptPath = path.join(fixture.root, fixture.receiptPath!);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { evidence: { launchTranscript: { path: string } } };
    put(fixture.root, receipt.evidence.launchTranscript.path, '{"handAuthored":true}\n');
    const found = codes(fixture.root);
    assert(found.includes("ios.artifact_hash"), `changed launch transcript did not fail its hash: ${found.join(", ")}`);
  });

  harness.check("rehashing a hand-edited transcript cannot hide a different launch command", () => {
    const fixture = makeFixture(harness);
    const receiptPath = path.join(fixture.root, fixture.receiptPath!);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      evidence: { launchTranscript: { path: string; sha256: string } };
    };
    const transcriptPath = path.join(fixture.root, receipt.evidence.launchTranscript.path);
    const transcript = JSON.parse(readFileSync(transcriptPath, "utf8")) as { arguments: string[] };
    transcript.arguments = ["simctl", "launch", DEVICE_ID, "com.other.app"];
    const next = `${JSON.stringify(transcript, null, 2)}\n`;
    writeFileSync(transcriptPath, next);
    receipt.evidence.launchTranscript.sha256 = createHash("sha256").update(next).digest("hex");
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    const found = codes(fixture.root);
    assert(found.includes("ios.transcript_binding"), `self-asserted transcript digest hid a different command: ${found.join(", ")}`);
  });

  harness.check("producer refuses to bless built and installed bundles with different bytes", () => {
    const fixture = makeFixture(harness, { receipt: false });
    const outputDir = path.join(fixture.root, "proof", "ios-simulator");
    const builtApp = path.join(fixture.root, "runtime", "built", "App.app");
    const installedApp = path.join(fixture.root, "runtime", "installed", "App.app");
    writeApp(builtApp);
    writeApp(installedApp, "42", "different installed executable");
    mkdirSync(outputDir, { recursive: true });
    const identity = inspectIosAppBundle(builtApp);
    const sourceRoot = realpathSync(path.join(fixture.root, "ios"));
    const installedBuild: InstalledSimulatorBuild = {
      deviceId: DEVICE_ID,
      bundleId: identity.bundleId,
      buildNumber: identity.buildNumber,
      scheme: "App",
      projectPath: path.join(fixture.root, "ios", "App.xcodeproj"),
      derivedDataPath: path.dirname(builtApp),
      appPath: builtApp,
      appFingerprint: identity.artifactFingerprint,
      bundleContentSha256: identity.bundleContentSha256,
      installedAppPath: installedApp,
      executable: identity.executable,
      source: { root: sourceRoot, roots: ["App", "App.xcodeproj"], fingerprint: fingerprintAppSource(sourceRoot, ["App", "App.xcodeproj"]) },
    };
    let message = "";
    try {
      materializeStrictIosSimulatorProof({
        workspaceRoot: fixture.root,
        outputDir,
        flow: "mismatch",
        steps: [
          { name: "build", ok: true, transcriptPath: put(fixture.root, "runtime/t1.json", "{}") },
          { name: "install", ok: true, transcriptPath: put(fixture.root, "runtime/t2.json", "{}") },
          { name: "verify_install", ok: true, installedBuild, transcriptPath: put(fixture.root, "runtime/t3.json", "{}") },
          { name: "launch", ok: true, transcriptPath: put(fixture.root, "runtime/t4.json", "{}") },
        ],
        startedAt: "2026-01-02T00:00:00.000Z",
        designFingerprint: fingerprintIosDesignInputs(fixture.root),
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert(message.includes("do not have the same byte identity"), `producer did not reject mismatched bundle copies: ${message}`);
  });
}
