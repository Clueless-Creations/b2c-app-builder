import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  inspectIosAppBundle,
  iosRetainedEvidenceSessionPath,
  iosSimulatorCommandTranscriptSchema,
  type IosSimulatorCommandTranscript,
} from "../../../../adapters/ios-app-evidence.js";
import { fingerprintAppSource } from "../../../../kernel/engine/source-fingerprint.js";
import {
  fingerprintIosDesignInputs,
  strictIosSimulatorProofReceiptSchema,
  type StrictIosSimulatorProofReceipt,
} from "../../../../kernel/session/ios-proof-receipt.js";
import { issue, type Issue } from "../../../../tooling/lib/launch-state.js";

const PROOF_ROOT = "proof/ios-simulator";

function localPath(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe workspace evidence path: ${relative}`);
  }
  const workspace = realpathSync(root);
  let current = workspace;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`workspace evidence cannot follow a symlink: ${relative}`);
  }
  const canonical = realpathSync(current);
  if (!canonical.startsWith(`${workspace}${path.sep}`)) throw new Error(`workspace evidence escapes the business: ${relative}`);
  return canonical;
}

function inside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function currentArtifact(root: string, artifact: { path: string; sha256: string }, retainedRoot: string, label: string, issues: Issue[]): Buffer | undefined {
  try {
    const absolute = localPath(root, artifact.path);
    if (!inside(retainedRoot, absolute)) throw new Error("artifact is outside this receipt's retained-evidence directory");
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.size === 0 || stat.size > 128 * 1024 * 1024) throw new Error("artifact must be a nonempty regular file at most 128 MiB");
    const contents = readFileSync(absolute);
    const digest = createHash("sha256").update(contents).digest("hex");
    if (digest !== artifact.sha256) {
      issues.push(
        issue("error", "ios.artifact_hash", `${label} changed after the strict receipt was written: ${artifact.path}`, artifact.path, {
          fixHint: "Rebuild, reinstall, read back, launch, and regenerate the strict iOS receipt.",
        }),
      );
      return undefined;
    }
    return contents;
  } catch (error) {
    issues.push(
      issue("error", "ios.artifact", `${label} is not current retained evidence: ${error instanceof Error ? error.message : String(error)}`, artifact.path, {
        fixHint: "Keep each raw command transcript as a regular file beside its strict receipt.",
      }),
    );
    return undefined;
  }
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const positions = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (positions.length !== 1) return undefined;
  return args[positions[0]! + 1];
}

function commandBindings(
  receipt: StrictIosSimulatorProofReceipt,
  transcripts: Record<"build" | "install" | "readback" | "launch", IosSimulatorCommandTranscript>,
): boolean {
  const build = transcripts.build;
  const install = transcripts.install;
  const readback = transcripts.readback;
  const launch = transcripts.launch;
  const derivedData = flagValue(build.arguments, "-derivedDataPath");
  const selectedProject = flagValue(build.arguments, receipt.projectPath.endsWith(".xcworkspace") ? "-workspace" : "-project");
  return (
    build.command === "xcodebuild" &&
    build.arguments[0] === "build" &&
    flagValue(build.arguments, "-scheme") === receipt.scheme &&
    flagValue(build.arguments, "-destination") === `platform=iOS Simulator,id=${receipt.device.id}` &&
    selectedProject === receipt.projectPath &&
    Boolean(derivedData && inside(path.resolve(derivedData), path.resolve(receipt.builtApp.originalPath))) &&
    install.command === "xcrun" &&
    JSON.stringify(install.arguments) === JSON.stringify(["simctl", "install", receipt.device.id, receipt.builtApp.originalPath]) &&
    readback.command === "xcrun" &&
    JSON.stringify(readback.arguments) === JSON.stringify(["simctl", "get_app_container", receipt.device.id, receipt.builtApp.bundleId, "app"]) &&
    readback.stdout.trim() === receipt.installedAppReadback.app.originalPath &&
    launch.command === "xcrun" &&
    JSON.stringify(launch.arguments) === JSON.stringify(["simctl", "launch", "--terminate-running-process", receipt.device.id, receipt.builtApp.bundleId])
  );
}

function sourceCoversImplementationRoots(
  workspaceRoot: string,
  sourceRoot: string,
  sourceRoots: readonly string[],
  implementationRoots: readonly string[],
): boolean {
  const ignored = new Set([".git", ".dart_tool", ".gradle", ".next", "build", "DerivedData", "dist", "node_modules"]);
  const selected = sourceRoots.map((relative) => {
    const absolute = path.resolve(sourceRoot, relative);
    if (absolute !== sourceRoot && !absolute.startsWith(`${sourceRoot}${path.sep}`)) throw new Error(`source root escapes its target: ${relative}`);
    if (!existsSync(absolute)) throw new Error(`source root is missing: ${relative}`);
    return realpathSync(absolute);
  });
  return implementationRoots.every((relative) => {
    const unresolved = path.resolve(workspaceRoot, relative);
    if (unresolved !== workspaceRoot && !unresolved.startsWith(`${workspaceRoot}${path.sep}`)) {
      throw new Error(`accepted implementation path escapes the workspace: ${relative}`);
    }
    if (lstatSync(unresolved).isSymbolicLink()) throw new Error(`accepted implementation path is a symlink: ${relative}`);
    const implementation = realpathSync(unresolved);
    const files: string[] = [];
    const visit = (absolute: string): void => {
      if (files.length >= 100_000) throw new Error("accepted iOS implementation exceeds 100000 files");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) {
        for (const name of readdirSync(absolute).sort()) {
          if (!ignored.has(name)) visit(path.join(absolute, name));
        }
      } else if (stat.isFile()) {
        files.push(realpathSync(absolute));
      }
    };
    visit(implementation);
    if (files.length === 0) throw new Error(`accepted implementation path has no ordinary source files: ${relative}`);
    return files.every((file) => selected.some((candidate) => candidate === file || inside(candidate, file)));
  });
}

export interface StrictIosReceiptValidation {
  readonly receipt?: StrictIosSimulatorProofReceipt;
  readonly issues: Issue[];
}

/** Rehash one exact compact receipt and all of its session-scoped retained evidence. */
export function validateStrictIosSimulatorReceipt(root: string, relativePath: string, implementationRoots: readonly string[]): StrictIosReceiptValidation {
  const issues: Issue[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(localPath(root, relativePath), "utf8")) as unknown;
  } catch (error) {
    issues.push(
      issue("error", "ios.receipt_parse", `iOS proof JSON is unreadable: ${error instanceof Error ? error.message : String(error)}`, relativePath, {
        fixHint: "Regenerate the strict iOS proof instead of editing its receipt.",
      }),
    );
    return { issues };
  }
  const parsed = strictIosSimulatorProofReceiptSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    issues.push(
      issue(
        "error",
        "ios.receipt_schema",
        `Strict iOS receipt is malformed at ${first?.path.join(".") || "receipt"}: ${first?.message ?? "invalid receipt"}`,
        relativePath,
        { fixHint: "Run b2c proof against the current iOS simulator; do not hand-author the strict receipt." },
      ),
    );
    return { issues };
  }
  const receipt = parsed.data;
  const expectedReceiptPath = `${PROOF_ROOT}/${receipt.sessionId}/receipt.json`;
  if (relativePath !== expectedReceiptPath) {
    issues.push(issue("error", "ios.receipt_lane", `Strict iOS receipt must use its session path: ${expectedReceiptPath}`, relativePath));
  }
  let retainedRoot: string;
  try {
    retainedRoot = iosRetainedEvidenceSessionPath(root, receipt.sessionId);
  } catch (error) {
    issues.push(
      issue(
        "error",
        "ios.retained_root",
        `Strict iOS receipt has no valid session-scoped retained-evidence root: ${error instanceof Error ? error.message : String(error)}`,
        relativePath,
      ),
    );
    return { receipt, issues };
  }
  try {
    if (fingerprintIosDesignInputs(root) !== receipt.designFingerprint) {
      issues.push(
        issue("error", "ios.design_stale", "The strict iOS receipt identifies older DESIGN.md, screen, or flow inputs.", relativePath, {
          fixHint: "Rerun native proof after the latest accepted design-contract edit.",
        }),
      );
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "ios.design_stale",
        `Current iOS design inputs cannot be fingerprinted: ${error instanceof Error ? error.message : String(error)}`,
        "DESIGN.md",
      ),
    );
  }

  let canonicalSourceRoot: string | undefined;
  try {
    if (!path.isAbsolute(receipt.source.root)) throw new Error("source.root is not absolute");
    canonicalSourceRoot = realpathSync(receipt.source.root);
    const workspaceRoot = realpathSync(root);
    if (canonicalSourceRoot !== workspaceRoot && !inside(workspaceRoot, canonicalSourceRoot)) throw new Error("source.root is outside the business workspace");
    if (!sourceCoversImplementationRoots(workspaceRoot, canonicalSourceRoot, receipt.source.roots, implementationRoots)) {
      throw new Error("receipt source roots do not cover every accepted iOS implementationPath");
    }
    if (fingerprintAppSource(canonicalSourceRoot, receipt.source.roots) !== receipt.source.fingerprint) {
      throw new Error("current iOS source does not match the built receipt source fingerprint");
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "ios.source_fingerprint",
        `Strict iOS source identity is invalid: ${error instanceof Error ? error.message : String(error)}`,
        relativePath,
        {
          fixHint: "Rebuild from the complete current iOS implementation and regenerate the strict receipt.",
        },
      ),
    );
  }

  const inspectRetained = (relative: string, label: string) => {
    try {
      const absolute = localPath(root, relative);
      if (!inside(retainedRoot, absolute)) throw new Error("retained bundle is outside this receipt's session-scoped retained-evidence directory");
      return inspectIosAppBundle(absolute);
    } catch (error) {
      issues.push(
        issue("error", "ios.bundle", `${label} cannot be inspected: ${error instanceof Error ? error.message : String(error)}`, relative, {
          fixHint: "Retain the complete built and installed .app directories and rerun proof.",
        }),
      );
      return undefined;
    }
  };
  const built = inspectRetained(receipt.builtApp.retainedPath, "Built .app evidence");
  const installed = inspectRetained(receipt.installedAppReadback.app.retainedPath, "Installed .app readback evidence");
  if (receipt.builtApp.retainedPath === receipt.installedAppReadback.app.retainedPath) {
    issues.push(issue("error", "ios.bundle_distinct", "Built and installed .app evidence must be separate retained directories.", relativePath));
  }
  if (built && installed) {
    const claimedBuilt = receipt.builtApp;
    const claimedInstalled = receipt.installedAppReadback.app;
    const actualMatchesClaim =
      built.bundleId === claimedBuilt.bundleId &&
      built.buildNumber === claimedBuilt.buildNumber &&
      built.infoPlistPath === claimedBuilt.infoPlistPath &&
      built.executable.path === claimedBuilt.executable.path &&
      built.executable.sha256 === claimedBuilt.executable.sha256 &&
      built.bundleContentSha256 === claimedBuilt.bundleContentSha256 &&
      built.artifactFingerprint === claimedBuilt.artifactFingerprint &&
      installed.bundleId === claimedInstalled.bundleId &&
      installed.buildNumber === claimedInstalled.buildNumber &&
      installed.infoPlistPath === claimedInstalled.infoPlistPath &&
      installed.executable.path === claimedInstalled.executable.path &&
      installed.executable.sha256 === claimedInstalled.executable.sha256 &&
      installed.bundleContentSha256 === claimedInstalled.bundleContentSha256 &&
      installed.artifactFingerprint === claimedInstalled.artifactFingerprint;
    const sameIdentity =
      built.bundleId === installed.bundleId &&
      built.buildNumber === installed.buildNumber &&
      built.executable.path === installed.executable.path &&
      built.executable.sha256 === installed.executable.sha256 &&
      built.bundleContentSha256 === installed.bundleContentSha256;
    if (!actualMatchesClaim || !sameIdentity) {
      issues.push(
        issue(
          "error",
          "ios.bundle_identity",
          "Retained built and installed .app bytes do not match the receipt's bundle, build, executable, and content identity.",
          relativePath,
          {
            fixHint: "Do not transcribe hashes. Regenerate proof so the validator can rehash both complete .app directories.",
          },
        ),
      );
    }
  }

  const evidenceEntries = Object.entries(receipt.evidence) as Array<[keyof typeof receipt.evidence, { path: string; sha256: string }]>;
  if (new Set(evidenceEntries.map(([, artifact]) => artifact.path)).size !== evidenceEntries.length) {
    issues.push(issue("error", "ios.evidence_distinct", "Build, install, readback, and launch transcripts must be separate files.", relativePath));
  }
  const transcriptKeys = {
    buildTranscript: "build",
    installTranscript: "install",
    deviceReadbackTranscript: "readback",
    launchTranscript: "launch",
  } as const;
  const transcripts = {} as Record<(typeof transcriptKeys)[keyof typeof transcriptKeys], IosSimulatorCommandTranscript>;
  for (const [key, artifact] of evidenceEntries) {
    const contents = currentArtifact(root, artifact, retainedRoot, `${transcriptKeys[key]} transcript`, issues);
    if (!contents) continue;
    let rawTranscript: unknown;
    try {
      rawTranscript = JSON.parse(contents.toString("utf8")) as unknown;
    } catch {
      issues.push(issue("error", "ios.transcript", `${key} is not valid JSON.`, artifact.path));
      continue;
    }
    const parsedTranscript = iosSimulatorCommandTranscriptSchema.safeParse(rawTranscript);
    if (!parsedTranscript.success || parsedTranscript.data.step !== transcriptKeys[key] || parsedTranscript.data.status !== 0) {
      issues.push(
        issue("error", "ios.transcript", `${key} does not contain the expected successful machine command transcript.`, artifact.path, {
          fixHint: "Regenerate proof through the Xcode simulator adapter.",
        }),
      );
      continue;
    }
    transcripts[transcriptKeys[key]] = parsedTranscript.data;
  }
  if (Object.keys(transcripts).length === 4 && !commandBindings(receipt, transcripts)) {
    issues.push(
      issue(
        "error",
        "ios.transcript_binding",
        "Command transcripts do not bind one Xcode build, simulator install, installed-app readback, and launch identity.",
        relativePath,
        {
          fixHint: "Rerun the complete route against one project, scheme, simulator, bundle ID, and fresh build.",
        },
      ),
    );
  }

  const identityMatches =
    receipt.install.deviceId === receipt.device.id &&
    receipt.installedAppReadback.deviceId === receipt.device.id &&
    receipt.launch.deviceId === receipt.device.id &&
    receipt.install.appPath === receipt.builtApp.originalPath &&
    receipt.install.bundleId === receipt.builtApp.bundleId &&
    receipt.installedAppReadback.app.bundleId === receipt.builtApp.bundleId &&
    receipt.launch.bundleId === receipt.builtApp.bundleId &&
    receipt.install.buildNumber === receipt.builtApp.buildNumber &&
    receipt.installedAppReadback.app.buildNumber === receipt.builtApp.buildNumber &&
    receipt.install.executableSha256 === receipt.builtApp.executable.sha256 &&
    receipt.installedAppReadback.app.executable.sha256 === receipt.builtApp.executable.sha256 &&
    receipt.install.bundleContentSha256 === receipt.builtApp.bundleContentSha256 &&
    receipt.installedAppReadback.app.bundleContentSha256 === receipt.builtApp.bundleContentSha256;
  if (!identityMatches) {
    issues.push(
      issue(
        "error",
        "ios.identity",
        "Built app, install, installed-app readback, launch, bundle ID, build number, executable, and device do not form one identity chain.",
        relativePath,
      ),
    );
  }

  if (Object.keys(transcripts).length === 4) {
    const times = [
      receipt.startedAt,
      transcripts.build.recordedAt,
      transcripts.install.recordedAt,
      transcripts.readback.recordedAt,
      transcripts.launch.recordedAt,
      receipt.finishedAt,
    ].map(Date.parse);
    const ordered = times.every((value, index) => Number.isFinite(value) && (index === 0 || value >= times[index - 1]!));
    if (
      !ordered ||
      receipt.install.installedAt !== transcripts.install.recordedAt ||
      receipt.installedAppReadback.readAt !== transcripts.readback.recordedAt ||
      receipt.launch.launchedAt !== transcripts.launch.recordedAt
    ) {
      issues.push(issue("error", "ios.chronology", "Strict iOS proof must build, install, read back, and launch in recorded order.", relativePath));
    }
  }

  return { receipt, issues };
}
