#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const simulatorFlag = process.argv.indexOf("--simulator-id");
const simulatorId = simulatorFlag >= 0 ? process.argv[simulatorFlag + 1] : undefined;
if (!simulatorId || !/^[A-F0-9-]{36}$/.test(simulatorId)) {
  throw new Error("Usage: node tests/generate-test-proof.mjs --simulator-id <UDID>");
}
if (Number(process.versions.node.split(".")[0]) !== 22) {
  throw new Error(`TUCK test proof must be generated with Node.js 22; received ${process.version}`);
}

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const tuckRoot = path.dirname(testsRoot);
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: tuckRoot, encoding: "utf8" }).trim();
const tuckRelative = path.relative(repoRoot, tuckRoot).split(path.sep).join("/");
const runtimeRoot = path.join(testsRoot, "proof", "runtime");
const landingLog = path.join(runtimeRoot, "landing-tests-node22.tap");
const nativeLog = path.join(runtimeRoot, "native-tests.log");
const nativeResult = path.join(runtimeRoot, "tuck-native-tests.xcresult");
const receiptPath = path.join(testsRoot, "proof", "tuck-local-test-proof.json");
const frozenReferencePath = path.join(tuckRoot, "design", "reference-packs", "runtime", "seat.jpeg");
const expectedFrozenReferenceSha256 = "e432b939e20650334307fd8de0d4ab57eb858252f0fe294a4061913cb933c151";

const nativeSourceRoots = [
  "native/project.yml",
  "native/Info.plist",
  "native/Tuck.xcodeproj/project.pbxproj",
  "native/Tuck.xcodeproj/project.xcworkspace/contents.xcworkspacedata",
  "native/Tuck.xcodeproj/xcshareddata",
  "native/Sources",
  "native/Tests",
  "native/UITests",
  "native/Assets.xcassets",
  "shared",
];
const landingSourceRoots = ["landing", "tests/landing-harness.mjs", "tests/landing.test.mjs", "shared"];

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function normalizedRelative(base, absolute) {
  return path.relative(base, absolute).split(path.sep).join("/");
}

function collectEntries(absolute, base, entries, allowSymlinks) {
  const metadata = lstatSync(absolute);
  const relative = normalizedRelative(base, absolute);
  if (metadata.isSymbolicLink()) {
    if (!allowSymlinks) throw new Error(`source fingerprint refuses symbolic link: ${relative}`);
    const target = readlinkSync(absolute);
    entries.push({ path: relative, type: "symlink", target, sha256: sha256(Buffer.from(target, "utf8")) });
    return;
  }
  if (metadata.isDirectory()) {
    for (const name of readdirSync(absolute).sort()) collectEntries(path.join(absolute, name), base, entries, allowSymlinks);
    return;
  }
  if (!metadata.isFile()) throw new Error(`fingerprint input is not a regular file: ${relative}`);
  const bytes = readFileSync(absolute);
  entries.push({ path: relative, type: "file", bytes: bytes.byteLength, sha256: sha256(bytes) });
}

function fingerprintRoots(base, roots, includeEntries = true, allowSymlinks = false) {
  const entries = [];
  for (const root of roots) collectEntries(path.join(base, root), base, entries, allowSymlinks);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`fingerprint roots overlap at ${entry.path}`);
    seen.add(entry.path);
  }
  const canonical = JSON.stringify(entries);
  return {
    algorithm: "sha256-json-sorted-recursive-manifest-v1",
    roots,
    entryCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + (entry.bytes ?? Buffer.byteLength(entry.target, "utf8")), 0),
    sha256: sha256(Buffer.from(canonical, "utf8")),
    ...(includeEntries ? { entries } : {}),
  };
}

function commandOutput(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function optionalCommandOutput(command, args) {
  try {
    return commandOutput(command, args);
  } catch {
    return "unavailable";
  }
}

function isoFromMilliseconds(value) {
  return new Date(value).toISOString();
}

function artifactFile(absolute) {
  const bytes = readFileSync(absolute);
  const metadata = statSync(absolute);
  return {
    path: normalizedRelative(tuckRoot, absolute),
    retention: "local_untracked_ignored",
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    createdAt: isoFromMilliseconds(metadata.birthtimeMs),
    modifiedAt: isoFromMilliseconds(metadata.mtimeMs),
  };
}

function tapCount(source, key) {
  const match = source.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
  if (!match) throw new Error(`landing TAP output is missing ${key} count`);
  return Number(match[1]);
}

const landingOutput = readFileSync(landingLog, "utf8");
const landingCounts = {
  total: tapCount(landingOutput, "tests"),
  passed: tapCount(landingOutput, "pass"),
  failed: tapCount(landingOutput, "fail"),
  skipped: tapCount(landingOutput, "skipped"),
  cancelled: tapCount(landingOutput, "cancelled"),
  todo: tapCount(landingOutput, "todo"),
};
if (landingCounts.failed !== 0 || landingCounts.skipped !== 0 || landingCounts.cancelled !== 0 || landingCounts.passed !== landingCounts.total) {
  throw new Error(`landing result is not a complete pass: ${JSON.stringify(landingCounts)}`);
}

const nativeSummary = JSON.parse(commandOutput("xcrun", ["xcresulttool", "get", "test-results", "summary", "--path", nativeResult, "--format", "json"]));
const nativeCounts = {
  total: Number(nativeSummary.totalTestCount),
  passed: Number(nativeSummary.passedTests),
  failed: Number(nativeSummary.failedTests),
  skipped: Number(nativeSummary.skippedTests),
  expectedFailures: Number(nativeSummary.expectedFailures ?? 0),
};
if (!Object.values(nativeCounts).every(Number.isFinite) || nativeCounts.passed + nativeCounts.failed + nativeCounts.skipped !== nativeCounts.total) {
  throw new Error(`native result counts are incomplete: ${JSON.stringify({ result: nativeSummary.result, ...nativeCounts })}`);
}

const deviceCatalog = JSON.parse(commandOutput("xcrun", ["simctl", "list", "devices", "--json"]));
const runtimeCatalog = JSON.parse(commandOutput("xcrun", ["simctl", "list", "runtimes", "--json"]));
let device;
let runtimeIdentifier;
for (const [identifier, devices] of Object.entries(deviceCatalog.devices ?? {})) {
  const match = devices.find((candidate) => candidate.udid === simulatorId);
  if (match) {
    device = match;
    runtimeIdentifier = identifier;
    break;
  }
}
if (!device || !runtimeIdentifier) throw new Error(`simulator ${simulatorId} is unavailable`);
const runtime = (runtimeCatalog.runtimes ?? []).find((candidate) => candidate.identifier === runtimeIdentifier);
if (!runtime) throw new Error(`runtime ${runtimeIdentifier} is unavailable`);

const resultDevices = (nativeSummary.devicesAndConfigurations ?? []).map((entry) => entry.device).filter(Boolean);
if (resultDevices.length > 0 && !resultDevices.some((candidate) => candidate.deviceId === simulatorId)) {
  throw new Error(`native result bundle does not name requested simulator ${simulatorId}`);
}

const landingArtifact = artifactFile(landingLog);
const nativeLogArtifact = artifactFile(nativeLog);
const nativeOutput = readFileSync(nativeLog, "utf8");
const nativeAssertionFailures = [...nativeOutput.matchAll(/^(.+?):(\d+): error: -\[(.+?)\] : (.+)$/gm)].map((match) => ({
  source: match[1].startsWith(`${repoRoot}${path.sep}`) ? normalizedRelative(repoRoot, match[1]) : match[1],
  line: Number(match[2]),
  test: match[3],
  message: match[4],
}));
const nativeResultFingerprint = fingerprintRoots(runtimeRoot, [path.basename(nativeResult)], false, true);
const frozenReference = artifactFile(frozenReferencePath);
if (frozenReference.sha256 !== expectedFrozenReferenceSha256) {
  throw new Error(`frozen visual reference hash mismatch: ${frozenReference.sha256}`);
}
const nodeExecutable = process.execPath;
const landingCommand = `${nodeExecutable} --test ${tuckRelative}/tests/landing.test.mjs > ${tuckRelative}/tests/proof/runtime/landing-tests-node22.tap 2>&1`;
const nativeCommand = `xcodebuild -project ${tuckRelative}/native/Tuck.xcodeproj -scheme Tuck -configuration Debug -destination 'platform=iOS Simulator,id=${simulatorId}' -derivedDataPath ${tuckRelative}/tests/proof/runtime/DerivedData -resultBundlePath ${tuckRelative}/tests/proof/runtime/tuck-native-tests.xcresult CODE_SIGNING_ALLOWED=NO test > ${tuckRelative}/tests/proof/runtime/native-tests.log 2>&1`;

const receiptBody = {
  schemaVersion: "1.0.0",
  kind: "tuck_source_bound_local_test_observation",
  generatedAt: new Date().toISOString(),
  repositoryRelativeRoot: tuckRelative,
  sourceFingerprints: {
    native: fingerprintRoots(tuckRoot, nativeSourceRoots),
    landing: fingerprintRoots(tuckRoot, landingSourceRoots),
  },
  localFrozenVisualReference: frozenReference,
  toolchain: {
    node: { executable: nodeExecutable, version: process.version },
    xcode: commandOutput("xcodebuild", ["-version"]).split("\n"),
    swift: commandOutput("xcrun", ["swift", "--version"]).split("\n"),
    xcodegen: optionalCommandOutput("xcodegen", ["--version"]),
    macOS: {
      version: commandOutput("sw_vers", ["-productVersion"]),
      build: commandOutput("sw_vers", ["-buildVersion"]),
    },
  },
  simulator: {
    udid: simulatorId,
    name: device.name,
    stateAtReceiptGeneration: device.state,
    runtime: {
      identifier: runtime.identifier,
      name: runtime.name,
      version: runtime.version,
      build: runtime.buildversion,
    },
  },
  runs: {
    landing: {
      command: landingCommand,
      cwd: "repository root",
      startedAt: landingArtifact.createdAt,
      finishedAt: landingArtifact.modifiedAt,
      exitCode: 0,
      counts: landingCounts,
      outputLog: landingArtifact,
    },
    native: {
      command: nativeCommand,
      cwd: "repository root",
      startedAt: isoFromMilliseconds(Number(nativeSummary.startTime) * 1000),
      finishedAt: isoFromMilliseconds(Number(nativeSummary.finishTime) * 1000),
      outcome: nativeSummary.result === "Passed" ? "passed" : "failed",
      exitCode: nativeSummary.result === "Passed" ? 0 : 65,
      counts: nativeCounts,
      failedTests: (nativeSummary.testFailures ?? []).map((failure) => ({
        target: failure.targetName,
        identifier: failure.testIdentifierString,
        name: failure.testName,
        message: failure.failureText,
      })),
      assertionFailures: nativeAssertionFailures,
      resultBundle: {
        path: normalizedRelative(tuckRoot, nativeResult),
        retention: "local_untracked_ignored",
        ...nativeResultFingerprint,
      },
      outputLog: nativeLogArtifact,
    },
  },
  claims: {
    currentSourceBoundLocalObservation: true,
    strictDesignAcceptance: false,
    physicalVoiceOver: false,
    android: false,
    releaseOrStoreSubmission: false,
  },
};

const receipt = {
  ...receiptBody,
  integrity: {
    algorithm: "sha256-json-v1",
    receiptBodySha256: sha256(Buffer.from(JSON.stringify(receiptBody), "utf8")),
  },
};
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(`Wrote ${normalizedRelative(repoRoot, receiptPath)}`);
console.log(`Landing ${landingCounts.passed}/${landingCounts.total}; native ${nativeCounts.passed}/${nativeCounts.total}`);
