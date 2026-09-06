import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseInfoPlistScalarsFromBytes } from "./app-review/plist.js";
import { outputFingerprintPath } from "../kernel/engine/artifact-fingerprint.js";
import { snapshotTaskInputs } from "../kernel/session/input-inventory.js";
import type { SpawnResult } from "./profile.js";

const nonempty = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });

export const IOS_SIMULATOR_TRANSCRIPT_PRODUCER = "b2c-xcodebuild-simulator-adapter";
export const IOS_RETAINED_EVIDENCE_ROOT = "run/retained-evidence/ios-simulator";
export const IOS_EVIDENCE_SESSION_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const iosSimulatorTranscriptStepSchema = z.enum(["build", "install", "readback", "launch"]);
export type IosSimulatorTranscriptStep = z.infer<typeof iosSimulatorTranscriptStepSchema>;

export const iosSimulatorCommandTranscriptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  producer: z.literal(IOS_SIMULATOR_TRANSCRIPT_PRODUCER),
  step: iosSimulatorTranscriptStepSchema,
  command: nonempty,
  arguments: z.array(z.string()),
  status: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  recordedAt: timestamp,
});
export type IosSimulatorCommandTranscript = z.infer<typeof iosSimulatorCommandTranscriptSchema>;

export interface IosAppBundleIdentity {
  readonly bundleId: string;
  readonly buildNumber: string;
  readonly infoPlistPath: "Info.plist";
  readonly executable: { readonly path: string; readonly sha256: string };
  /** File-path and file-byte identity, shared with the device adapter. */
  readonly bundleContentSha256: string;
  /** Directory-entry, mode, size, and byte identity for retained evidence. */
  readonly artifactFingerprint: string;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Resolve one engine-owned retained-evidence session without following workspace symlinks. */
export function iosRetainedEvidenceSessionPath(workspaceRoot: string, sessionId: string, create = false): string {
  if (!IOS_EVIDENCE_SESSION_PATTERN.test(sessionId)) throw new Error("iOS retained-evidence session id must be a lowercase UUID v4");
  const workspace = realpathSync(path.resolve(workspaceRoot));
  let current = workspace;
  for (const part of [...IOS_RETAINED_EVIDENCE_ROOT.split("/"), sessionId]) {
    const next = path.join(current, part);
    if (!existsSync(next)) {
      if (!create) throw new Error(`iOS retained-evidence session is missing: ${sessionId}`);
      mkdirSync(next);
    }
    const stat = lstatSync(next);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`iOS retained-evidence path is not an ordinary directory: ${next}`);
    current = realpathSync(next);
    if (!inside(workspace, current)) throw new Error("iOS retained evidence escapes the business workspace");
  }
  return current;
}

/** Inspect ordinary retained .app bytes. The result never trusts receipt fields. */
export function inspectIosAppBundle(appPath: string): IosAppBundleIdentity {
  const unresolved = path.resolve(appPath);
  const appStat = lstatSync(unresolved);
  if (!appStat.isDirectory() || appStat.isSymbolicLink() || !unresolved.endsWith(".app")) {
    throw new Error("iOS bundle evidence must be an ordinary .app directory");
  }
  const canonicalApp = realpathSync(unresolved);
  const infoPlist = path.join(canonicalApp, "Info.plist");
  const plistStat = lstatSync(infoPlist);
  if (!plistStat.isFile() || plistStat.isSymbolicLink() || plistStat.size === 0 || !inside(canonicalApp, realpathSync(infoPlist))) {
    throw new Error("iOS bundle evidence must contain an ordinary nonempty Info.plist");
  }
  const values = parseInfoPlistScalarsFromBytes(readFileSync(infoPlist));
  const bundleId = values.CFBundleIdentifier?.trim() ?? "";
  const buildNumber = values.CFBundleVersion?.trim() ?? "";
  const executableName = values.CFBundleExecutable?.trim() ?? "";
  if (!bundleId || !buildNumber || !executableName) {
    throw new Error("iOS bundle Info.plist omits CFBundleIdentifier, CFBundleVersion, or CFBundleExecutable");
  }
  if (path.basename(executableName) !== executableName || executableName === "." || executableName === "..") {
    throw new Error("CFBundleExecutable must name one executable at the .app root");
  }
  const executablePath = path.join(canonicalApp, executableName);
  const executableStat = lstatSync(executablePath);
  if (!executableStat.isFile() || executableStat.isSymbolicLink() || executableStat.size === 0 || !inside(canonicalApp, realpathSync(executablePath))) {
    throw new Error("CFBundleExecutable does not resolve to an ordinary nonempty file inside the .app");
  }

  const appName = path.basename(canonicalApp);
  const inventory = snapshotTaskInputs(path.dirname(canonicalApp), [appName], { maxFiles: 100_000, maxBytes: 512 * 1024 * 1024 });
  const files = inventory.files.map((entry) => ({ path: entry.path.slice(appName.length + 1), sha256: entry.sha256 }));
  return {
    bundleId,
    buildNumber,
    infoPlistPath: "Info.plist",
    executable: {
      path: executableName,
      sha256: createHash("sha256").update(readFileSync(executablePath)).digest("hex"),
    },
    bundleContentSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    artifactFingerprint: outputFingerprintPath(canonicalApp),
  };
}

/** Persist the exact command result before another device action can overwrite context. */
export function writeIosSimulatorCommandTranscript(
  directory: string,
  step: IosSimulatorTranscriptStep,
  command: string,
  args: readonly string[],
  result: SpawnResult,
  recordedAt = new Date().toISOString(),
): string {
  mkdirSync(directory, { recursive: true });
  const transcript = iosSimulatorCommandTranscriptSchema.parse({
    schemaVersion: 1,
    producer: IOS_SIMULATOR_TRANSCRIPT_PRODUCER,
    step,
    command,
    arguments: [...args],
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    recordedAt,
  });
  const target = path.join(directory, `${step}.json`);
  writeFileSync(target, `${JSON.stringify(transcript, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return target;
}
