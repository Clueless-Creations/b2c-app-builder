import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, cpSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  inspectIosAppBundle,
  iosRetainedEvidenceSessionPath,
  iosSimulatorCommandTranscriptSchema,
  type IosAppBundleIdentity,
  type IosSimulatorCommandTranscript,
  type IosSimulatorTranscriptStep,
} from "../../adapters/ios-app-evidence.js";
import type { DeviceProofStep, InstalledSimulatorBuild } from "../../adapters/device-proof.js";
import { fingerprintAppSource } from "../engine/source-fingerprint.js";

const nonempty = z.string().trim().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceDigest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const sessionId = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const artifact = z.strictObject({ path: nonempty, sha256: digest });
const sourceIdentity = z.strictObject({
  root: nonempty,
  roots: z
    .array(nonempty)
    .min(1)
    .refine((roots) => new Set(roots).size === roots.length, "source roots must be unique"),
  fingerprint: sourceDigest,
});
const bundleIdentity = z.strictObject({
  originalPath: nonempty,
  retainedPath: nonempty,
  bundleId: nonempty,
  buildNumber: nonempty,
  infoPlistPath: z.literal("Info.plist"),
  executable: z.strictObject({ path: nonempty, sha256: digest }),
  bundleContentSha256: digest,
  artifactFingerprint: digest,
});

/** Machine-produced receipt consumed by the strict iOS evidence gate. */
export const strictIosSimulatorProofReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("ios-simulator-install"),
  platform: z.literal("ios"),
  target: z.literal("simulator"),
  verificationScope: z.literal("retained-bundle-install-readback"),
  flow: nonempty,
  tool: z.strictObject({ name: z.literal("b2c-xcodebuild-simulator-adapter"), version: z.literal("1") }),
  sessionId,
  device: z.strictObject({ id: nonempty, physical: z.literal(false), deviceClass: z.literal("ios-simulator") }),
  scheme: nonempty,
  projectPath: nonempty,
  designFingerprint: sourceDigest,
  source: sourceIdentity,
  builtApp: bundleIdentity,
  install: z.strictObject({
    deviceId: nonempty,
    appPath: nonempty,
    bundleId: nonempty,
    buildNumber: nonempty,
    executableSha256: digest,
    bundleContentSha256: digest,
    installedAt: timestamp,
  }),
  installedAppReadback: z.strictObject({
    deviceId: nonempty,
    app: bundleIdentity,
    readAt: timestamp,
  }),
  launch: z.strictObject({ deviceId: nonempty, bundleId: nonempty, launchedAt: timestamp }),
  evidence: z.strictObject({
    buildTranscript: artifact,
    installTranscript: artifact,
    deviceReadbackTranscript: artifact,
    launchTranscript: artifact,
  }),
  verdict: z.literal("passed"),
  startedAt: timestamp,
  finishedAt: timestamp,
});
export type StrictIosSimulatorProofReceipt = z.infer<typeof strictIosSimulatorProofReceiptSchema>;

export interface MaterializeStrictIosProofInput {
  readonly workspaceRoot: string;
  readonly outputDir: string;
  readonly flow: string;
  readonly steps: readonly DeviceProofStep[];
  readonly startedAt: string;
  readonly designFingerprint: string;
  /** Reuse the adapter's session so DerivedData, transcripts, and retained bundles have one owner. */
  readonly sessionId?: string;
  readonly finishedAt?: string;
}

export interface MaterializedStrictIosProof {
  readonly receipt: StrictIosSimulatorProofReceipt;
  readonly receiptPath: string;
  readonly relativeReceiptPath: string;
}

const requiredSteps = ["build", "install", "verify_install", "launch"] as const;

/** Bind the accepted design and all detailed screen/flow contracts across device work. */
export function fingerprintIosDesignInputs(workspaceRoot: string): string {
  return fingerprintAppSource(workspaceRoot, ["DESIGN.md", "design/screens", "design/flows"]);
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function relativeWorkspacePath(root: string, absolute: string): string {
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`strict iOS evidence escaped the workspace: ${absolute}`);
  }
  return relative.split(path.sep).join("/");
}

function artifactFor(root: string, absolute: string): { path: string; sha256: string } {
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error(`strict iOS transcript is not an ordinary nonempty file: ${absolute}`);
  return {
    path: relativeWorkspacePath(root, absolute),
    sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
  };
}

function oneSuccessfulStep(steps: readonly DeviceProofStep[], name: (typeof requiredSteps)[number]): DeviceProofStep {
  const matches = steps.filter((step) => step.name === name);
  if (matches.length !== 1 || !matches[0]!.ok) throw new Error(`strict iOS proof requires one successful ${name} step`);
  return matches[0]!;
}

function copyTranscript(
  workspaceRoot: string,
  proofRoot: string,
  step: DeviceProofStep,
  expected: IosSimulatorTranscriptStep,
): { artifact: { path: string; sha256: string }; transcript: IosSimulatorCommandTranscript } {
  if (!step.transcriptPath || !path.isAbsolute(step.transcriptPath)) throw new Error(`${step.name} has no machine-produced command transcript`);
  const unresolvedStat = lstatSync(step.transcriptPath);
  if (unresolvedStat.isSymbolicLink()) throw new Error(`${step.name} transcript cannot be a symbolic link`);
  const source = realpathSync(step.transcriptPath);
  const sourceStat = lstatSync(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size === 0) throw new Error(`${step.name} transcript is not an ordinary nonempty file`);
  if (!inside(workspaceRoot, source)) throw new Error(`${step.name} transcript is outside the workspace`);
  const parsed = iosSimulatorCommandTranscriptSchema.parse(JSON.parse(readFileSync(source, "utf8")));
  if (parsed.step !== expected || parsed.status !== 0) throw new Error(`${step.name} transcript does not record a successful ${expected} command`);
  const destinationDirectory = path.join(proofRoot, "transcripts");
  mkdirSync(destinationDirectory, { recursive: true });
  const destination = path.join(destinationDirectory, `${expected}.json`);
  copyFileSync(source, destination, 0);
  return { artifact: artifactFor(workspaceRoot, destination), transcript: parsed };
}

function bundleRecord(originalPath: string, retainedPath: string, identity: IosAppBundleIdentity) {
  return { originalPath, retainedPath, ...identity };
}

function sameBundle(left: IosAppBundleIdentity, right: IosAppBundleIdentity): boolean {
  return (
    left.bundleId === right.bundleId &&
    left.buildNumber === right.buildNumber &&
    left.executable.path === right.executable.path &&
    left.executable.sha256 === right.executable.sha256 &&
    left.bundleContentSha256 === right.bundleContentSha256
  );
}

/** Preserve bulky evidence under run/ and emit one compact receipt under proof/. */
export function materializeStrictIosSimulatorProof(input: MaterializeStrictIosProofInput): MaterializedStrictIosProof {
  const workspaceRoot = realpathSync(path.resolve(input.workspaceRoot));
  const outputDir = realpathSync(path.resolve(input.outputDir));
  if (!inside(workspaceRoot, outputDir) || path.relative(workspaceRoot, outputDir).split(path.sep).join("/") !== "proof/ios-simulator") {
    throw new Error("strict iOS simulator proof output must be the workspace proof/ios-simulator directory");
  }
  if (input.steps.some((step) => !step.ok)) throw new Error("strict iOS proof cannot materialize from a failed adapter run");
  if (fingerprintIosDesignInputs(workspaceRoot) !== input.designFingerprint) {
    throw new Error("iOS design inputs changed during the proof run");
  }
  const positions = requiredSteps.map((name) => input.steps.findIndex((step) => step.name === name));
  if (positions.some((position) => position < 0) || positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) {
    throw new Error("strict iOS proof must build, install, read back, and launch in order");
  }
  const buildStep = oneSuccessfulStep(input.steps, "build");
  const installStep = oneSuccessfulStep(input.steps, "install");
  const readbackStep = oneSuccessfulStep(input.steps, "verify_install");
  const launchStep = oneSuccessfulStep(input.steps, "launch");
  const installed: InstalledSimulatorBuild | undefined = readbackStep.installedBuild;
  if (!installed) throw new Error("strict iOS proof requires the adapter's installed bundle readback");
  if (!path.isAbsolute(installed.appPath) || !path.isAbsolute(installed.installedAppPath)) {
    throw new Error("strict iOS proof requires canonical original built and installed app paths");
  }
  if (fingerprintAppSource(installed.source.root, installed.source.roots) !== installed.source.fingerprint) {
    throw new Error("native source changed after the adapter built the retained app");
  }

  const receiptSessionId = input.sessionId ?? randomUUID();
  const retainedRoot = iosRetainedEvidenceSessionPath(workspaceRoot, receiptSessionId, true);
  const proofRoot = path.join(outputDir, receiptSessionId);
  mkdirSync(proofRoot);
  const builtPath = path.join(retainedRoot, "built", "App.app");
  const installedPath = path.join(retainedRoot, "installed", "App.app");
  mkdirSync(path.dirname(builtPath), { recursive: true });
  mkdirSync(path.dirname(installedPath), { recursive: true });
  cpSync(installed.appPath, builtPath, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  cpSync(installed.installedAppPath, installedPath, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });

  const retainedBuilt = inspectIosAppBundle(builtPath);
  const retainedInstalled = inspectIosAppBundle(installedPath);
  if (!sameBundle(retainedBuilt, retainedInstalled)) throw new Error("retained built and installed .app bundles do not have the same byte identity");
  if (
    retainedBuilt.bundleId !== installed.bundleId ||
    retainedBuilt.buildNumber !== installed.buildNumber ||
    retainedBuilt.executable.path !== installed.executable.path ||
    retainedBuilt.executable.sha256 !== installed.executable.sha256 ||
    retainedBuilt.bundleContentSha256 !== installed.bundleContentSha256
  ) {
    throw new Error("retained .app bytes do not match the adapter's verified install identity");
  }

  const build = copyTranscript(workspaceRoot, retainedRoot, buildStep, "build");
  const install = copyTranscript(workspaceRoot, retainedRoot, installStep, "install");
  const readback = copyTranscript(workspaceRoot, retainedRoot, readbackStep, "readback");
  const launch = copyTranscript(workspaceRoot, retainedRoot, launchStep, "launch");
  const finishedAt = input.finishedAt ?? new Date().toISOString();
  const receipt = strictIosSimulatorProofReceiptSchema.parse({
    schemaVersion: 1,
    kind: "ios-simulator-install",
    platform: "ios",
    target: "simulator",
    verificationScope: "retained-bundle-install-readback",
    flow: input.flow,
    tool: { name: "b2c-xcodebuild-simulator-adapter", version: "1" },
    sessionId: receiptSessionId,
    device: { id: installed.deviceId, physical: false, deviceClass: "ios-simulator" },
    scheme: installed.scheme,
    projectPath: installed.projectPath,
    designFingerprint: input.designFingerprint,
    source: installed.source,
    builtApp: bundleRecord(installed.appPath, relativeWorkspacePath(workspaceRoot, builtPath), retainedBuilt),
    install: {
      deviceId: installed.deviceId,
      appPath: installed.appPath,
      bundleId: retainedBuilt.bundleId,
      buildNumber: retainedBuilt.buildNumber,
      executableSha256: retainedBuilt.executable.sha256,
      bundleContentSha256: retainedBuilt.bundleContentSha256,
      installedAt: install.transcript.recordedAt,
    },
    installedAppReadback: {
      deviceId: installed.deviceId,
      app: bundleRecord(installed.installedAppPath, relativeWorkspacePath(workspaceRoot, installedPath), retainedInstalled),
      readAt: readback.transcript.recordedAt,
    },
    launch: { deviceId: installed.deviceId, bundleId: retainedBuilt.bundleId, launchedAt: launch.transcript.recordedAt },
    evidence: {
      buildTranscript: build.artifact,
      installTranscript: install.artifact,
      deviceReadbackTranscript: readback.artifact,
      launchTranscript: launch.artifact,
    },
    verdict: "passed",
    startedAt: input.startedAt,
    finishedAt,
  });
  const receiptPath = path.join(proofRoot, "receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { receipt, receiptPath, relativeReceiptPath: relativeWorkspacePath(workspaceRoot, receiptPath) };
}
