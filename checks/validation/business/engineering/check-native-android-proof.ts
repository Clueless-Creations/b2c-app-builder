#!/usr/bin/env node
/**
 * Strict Android build/install proof gate.
 *
 * MobAI's generic adapter receipt is useful diagnostic evidence, but it cannot
 * establish source-to-package or installed-package identity. This gate accepts
 * only the strict Android receipts shared with the design-acceptance contract.
 * It stays inert only when neither reducer state nor accepted DESIGN.md scope
 * selects Android. A disagreement blocks instead of letting either contract
 * bypass the other.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { inspectAndroidApk, type AndroidArtifactInspector } from "../../../../adapters/device-proof.js";
import { fingerprintAppSource } from "../../../../kernel/engine/source-fingerprint.js";
import { isMainModule } from "../../../../tooling/lib/cli-entrypoint.js";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { isRecord, issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import {
  designAcceptanceScopeSchema,
  designAndroidEmulatorProofReceiptSchema,
  designAndroidPhysicalDeviceProofReceiptSchema,
  designArtifact,
  designCandidateFingerprint,
  type DesignAcceptanceScope,
} from "../design/design-acceptance.js";

type AndroidReceipt = z.infer<typeof designAndroidEmulatorProofReceiptSchema> | z.infer<typeof designAndroidPhysicalDeviceProofReceiptSchema>;
type ReceiptKind = AndroidReceipt["kind"];
type ReceiptLane = "emulator" | "physical-device";

interface ReceiptCandidate {
  relativePath: string;
  lane: ReceiptLane;
  raw: unknown;
}

const EMULATOR_ROOT = "proof/android-emulator";
const DEVICE_ROOT = "proof/android-device";
const STRICT_KINDS = new Set<ReceiptKind>(["android-emulator-install", "physical-android-install"]);

function rawAcceptedAndroidScope(value: unknown): boolean {
  if (!isRecord(value) || value.status !== "accepted" || !Array.isArray(value.surfaces)) return false;
  return value.surfaces.some((surface) => isRecord(surface) && surface.kind === "native" && surface.platform === "android");
}

function selectedAndroidPlatform(root: string): boolean | undefined {
  const statePath = path.join(root, "state", "business-state.json");
  if (!existsSync(statePath)) return undefined;
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.project) || !Array.isArray(parsed.project.platforms)) throw new Error("state.project.platforms is missing");
  return parsed.project.platforms.includes("android");
}

function androidImplementationRoots(scope: DesignAcceptanceScope): string[] {
  return [
    ...new Set(
      scope.surfaces.filter((surface) => surface.kind === "native" && surface.platform === "android").flatMap((surface) => surface.implementationPaths),
    ),
  ].sort();
}

function sameStrings(actual: readonly string[], expected: readonly string[]): boolean {
  const sorted = [...actual].sort();
  return sorted.length === expected.length && expected.every((value, index) => sorted[index] === value);
}

function collectJsonFiles(root: string, relativeRoot: string, lane: ReceiptLane, issues: Issue[]): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const files: string[] = [];
  const visit = (absolute: string, relative: string): void => {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      issues.push(
        issue("error", "android.receipt_path", `Android proof cannot use a symlink: ${relative}`, relative, {
          fixHint: `Write the strict ${lane} receipt and its evidence as regular files inside the workspace.`,
        }),
      );
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(path.join(absolute, name), path.posix.join(relative, name));
      return;
    }
    if (stat.isFile() && relative.endsWith(".json")) files.push(relative);
  };
  visit(absoluteRoot, relativeRoot);
  return files;
}

function strictReceiptCandidates(root: string, issues: Issue[]): ReceiptCandidate[] {
  const candidates: ReceiptCandidate[] = [];
  for (const [relativeRoot, lane] of [
    [EMULATOR_ROOT, "emulator"],
    [DEVICE_ROOT, "physical-device"],
  ] as const) {
    for (const relativePath of collectJsonFiles(root, relativeRoot, lane, issues)) {
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as unknown;
      } catch (error) {
        issues.push(
          issue("error", "android.receipt_parse", `Android proof JSON is unreadable: ${error instanceof Error ? error.message : String(error)}`, relativePath, {
            fixHint: "Regenerate this proof file from the strict Android proof producer.",
          }),
        );
        continue;
      }
      if (isRecord(raw) && typeof raw.kind === "string" && STRICT_KINDS.has(raw.kind as ReceiptKind)) {
        candidates.push({ relativePath, lane, raw });
      }
    }
  }
  return candidates;
}

function checkedArtifact(root: string, artifact: { path: string; sha256: string }, label: string, issues: Issue[]): void {
  try {
    const current = designArtifact(root, artifact.path);
    if (current.sha256 !== artifact.sha256) {
      issues.push(
        issue("error", "android.artifact_hash", `${label} changed after the strict receipt was written: ${artifact.path}`, artifact.path, {
          fixHint: "Rebuild, reinstall, read back, launch, and regenerate the receipt from the current bytes.",
        }),
      );
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "android.artifact",
        `${label} is not current workspace evidence: ${error instanceof Error ? error.message : String(error)}`,
        artifact.path,
        { fixHint: "Keep a nonempty regular evidence file inside the workspace and regenerate its SHA-256." },
      ),
    );
  }
}

function validateReceipt(
  root: string,
  workspaceRoot: string,
  candidate: ReceiptCandidate,
  expectedCandidate: string,
  expectedRoots: readonly string[],
  expectedSourceFingerprint: string,
  inspectArtifact: AndroidArtifactInspector,
  issues: Issue[],
): boolean {
  const before = issues.length;
  const rawKind = isRecord(candidate.raw) ? candidate.raw.kind : undefined;
  const parsed =
    rawKind === "android-emulator-install"
      ? designAndroidEmulatorProofReceiptSchema.safeParse(candidate.raw)
      : designAndroidPhysicalDeviceProofReceiptSchema.safeParse(candidate.raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? first.path.join(".") : "receipt";
    issues.push(
      issue(
        "error",
        "android.receipt_schema",
        `Strict Android receipt is malformed at ${where}: ${first?.message ?? "invalid receipt"}`,
        candidate.relativePath,
        { fixHint: "Regenerate this file with the strict Android receipt schema; do not hand-author proof." },
      ),
    );
    return false;
  }
  const receipt = parsed.data;
  const expectedLane: ReceiptLane = receipt.kind === "android-emulator-install" ? "emulator" : "physical-device";
  if (candidate.lane !== expectedLane || receipt.target !== expectedLane) {
    const expectedFolder = expectedLane === "emulator" ? `${EMULATOR_ROOT}/` : `${DEVICE_ROOT}/`;
    issues.push(
      issue("error", "android.receipt_lane", `${receipt.kind} must live under ${expectedFolder} and identify target ${expectedLane}.`, candidate.relativePath, {
        fixHint: `Run the strict proof producer against the ${expectedLane} target and keep its receipt under ${expectedFolder}.`,
      }),
    );
  }

  if (receipt.candidateSha256 !== expectedCandidate) {
    issues.push(
      issue("error", "android.candidate_stale", "The strict Android receipt identifies an older design candidate.", candidate.relativePath, {
        fixHint: "Rebuild and rerun Android proof after the latest design or implementation edit.",
      }),
    );
  }

  const source = receipt.builtPackage.source;
  let canonicalSourceRoot: string | undefined;
  try {
    if (!path.isAbsolute(source.root) || path.resolve(source.root) !== workspaceRoot) throw new Error("source.root is not the canonical workspace root");
    canonicalSourceRoot = realpathSync(source.root);
    if (canonicalSourceRoot !== workspaceRoot) throw new Error("source.root resolves outside the canonical workspace root");
  } catch (error) {
    issues.push(
      issue(
        "error",
        "android.source_root",
        `Strict Android source identity is invalid: ${error instanceof Error ? error.message : String(error)}`,
        candidate.relativePath,
        { fixHint: `Set builtPackage.source.root to the canonical workspace root ${workspaceRoot}.` },
      ),
    );
  }
  if (!sameStrings(source.roots, expectedRoots)) {
    issues.push(
      issue(
        "error",
        "android.source_roots",
        `Strict Android source roots must equal the deduplicated Android implementationPaths: ${expectedRoots.join(", ")}.`,
        candidate.relativePath,
        { fixHint: "Hash every Android implementation path declared in accepted DESIGN.md scope." },
      ),
    );
  }
  if (source.fingerprint !== expectedSourceFingerprint) {
    issues.push(
      issue(
        "error",
        "android.source_fingerprint",
        "The strict Android receipt source fingerprint does not match the current authored Android implementation.",
        candidate.relativePath,
        { fixHint: "Rebuild the Android package from the current complete implementation root set." },
      ),
    );
  }
  // Do not recompute a receipt-selected subset. The expected fingerprint above is
  // always derived from the complete accepted root set at the canonical workspace.
  if (canonicalSourceRoot && sameStrings(source.roots, expectedRoots)) {
    try {
      if (fingerprintAppSource(canonicalSourceRoot, source.roots) !== source.fingerprint) {
        issues.push(
          issue(
            "error",
            "android.source_fingerprint",
            "The strict Android receipt source fingerprint is stale for its declared files.",
            candidate.relativePath,
            { fixHint: "Rebuild and regenerate proof after the latest Android source edit." },
          ),
        );
      }
    } catch (error) {
      issues.push(
        issue(
          "error",
          "android.source_fingerprint",
          `The strict Android receipt source cannot be rehashed: ${error instanceof Error ? error.message : String(error)}`,
          candidate.relativePath,
          { fixHint: "Restore every accepted Android implementation path before producing proof." },
        ),
      );
    }
  }

  const built = receipt.builtPackage.artifact;
  const installApk = built.format === "apk" ? built : built.installApk;
  checkedArtifact(root, built, built.format === "apk" ? "Built APK" : "Built AAB", issues);
  if (built.format === "aab") {
    checkedArtifact(root, built.installApk, "AAB-derived install APK", issues);
    checkedArtifact(root, built.conversionEvidence, "AAB conversion evidence", issues);
  }
  try {
    const manifest = inspectArtifact(path.join(workspaceRoot, installApk.path));
    if (manifest.packageName !== receipt.builtPackage.packageName || manifest.versionCode !== receipt.builtPackage.versionCode) {
      issues.push(
        issue(
          "error",
          "android.apk_manifest",
          `Installation APK manifest is ${manifest.packageName} versionCode ${manifest.versionCode}, not ${receipt.builtPackage.packageName} versionCode ${receipt.builtPackage.versionCode}.`,
          installApk.path,
          { fixHint: "Regenerate proof from the exact APK whose manifest identity was installed and read back." },
        ),
      );
    }
  } catch (error) {
    issues.push(
      issue(
        "error",
        "android.apk_manifest",
        `Installation APK manifest cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
        installApk.path,
        { fixHint: "Connect apkanalyzer and regenerate proof from an inspectable installation APK." },
      ),
    );
  }
  for (const [name, artifact] of Object.entries(receipt.evidence)) checkedArtifact(root, artifact, `${name} evidence`, issues);

  const evidencePaths = [
    built.path,
    ...(built.format === "aab" ? [built.installApk.path, built.conversionEvidence.path] : []),
    ...Object.values(receipt.evidence).map((artifact) => artifact.path),
  ];
  if (new Set(evidencePaths).size !== evidencePaths.length) {
    issues.push(
      issue(
        "error",
        "android.evidence_distinct",
        "Package, conversion, build, install, readback, and launch evidence must use distinct files.",
        candidate.relativePath,
        { fixHint: "Capture each proof step in its own immutable workspace artifact." },
      ),
    );
  }

  const identityMatches =
    receipt.install.apkPath === installApk.path &&
    receipt.install.apkSha256 === installApk.sha256 &&
    receipt.install.packageName === receipt.builtPackage.packageName &&
    receipt.installedAppReadback.packageName === receipt.builtPackage.packageName &&
    receipt.launch.packageName === receipt.builtPackage.packageName &&
    receipt.install.versionCode === receipt.builtPackage.versionCode &&
    receipt.installedAppReadback.versionCode === receipt.builtPackage.versionCode &&
    receipt.install.deviceId === receipt.device.id &&
    receipt.installedAppReadback.deviceId === receipt.device.id &&
    receipt.launch.deviceId === receipt.device.id;
  if (!identityMatches) {
    issues.push(
      issue(
        "error",
        "android.identity",
        "Built package, installed APK, package readback, launch, device, versionCode, and OS target do not form one identity chain.",
        candidate.relativePath,
        { fixHint: "Use one pinned device and read the installed package identity back before launching it." },
      ),
    );
  }

  const times = [receipt.startedAt, receipt.install.installedAt, receipt.installedAppReadback.readAt, receipt.launch.launchedAt, receipt.finishedAt].map(
    Date.parse,
  );
  if (times.some((value) => !Number.isFinite(value)) || times.some((value, index) => index > 0 && value <= times[index - 1]!)) {
    issues.push(
      issue(
        "error",
        "android.chronology",
        "Strict Android proof must build, install, read back the installed package, and launch in that order.",
        candidate.relativePath,
        { fixHint: "Rerun the complete proof sequence and preserve its ordered timestamps." },
      ),
    );
  }

  return issues.length === before;
}

export function validateNativeAndroidProof(root: string, inspectArtifact: AndroidArtifactInspector = (apkPath) => inspectAndroidApk(apkPath)): Issue[] {
  const issues: Issue[] = [];
  let androidSelected: boolean | undefined;
  try {
    androidSelected = selectedAndroidPlatform(root);
  } catch (error) {
    return [
      issue(
        "error",
        "android.state_invalid",
        `Android platform selection cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        "state/business-state.json",
        { fixHint: "Repair reducer-owned business state before selecting a native proof route." },
      ),
    ];
  }
  let design: ReturnType<typeof loadDesignSystem>;
  try {
    design = loadDesignSystem(root);
  } catch (error) {
    if (androidSelected) {
      issues.push(
        issue(
          "error",
          "android.scope_invalid",
          `Android is selected, but accepted DESIGN.md scope cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          "DESIGN.md",
          { fixHint: "Accept complete Android native surface scope before producing its strict proof." },
        ),
      );
    }
    return issues;
  }
  const rawScope = design.frontmatter?.acceptance;
  const designSelectsAndroid = rawAcceptedAndroidScope(rawScope);
  if (androidSelected === false && designSelectsAndroid) {
    issues.push(
      issue(
        "error",
        "android.scope_platform_mismatch",
        "Accepted DESIGN.md scope selects Android, but reducer-owned project platforms exclude Android.",
        "state/business-state.json",
        { fixHint: "Reconcile reducer-owned project platform state with accepted design scope before selecting a native proof route." },
      ),
    );
    return issues;
  }
  if (androidSelected !== true && !designSelectsAndroid) return issues;
  const parsedScope = designAcceptanceScopeSchema.safeParse(rawScope);
  if (!parsedScope.success) {
    if (androidSelected || rawAcceptedAndroidScope(rawScope)) {
      const first = parsedScope.error.issues[0];
      issues.push(
        issue(
          "error",
          "android.scope_invalid",
          `Accepted Android scope in DESIGN.md is malformed at ${first?.path.join(".") || "acceptance"}: ${first?.message ?? "invalid scope"}`,
          "DESIGN.md",
          { fixHint: "Repair the accepted design scope before producing Android proof." },
        ),
      );
    }
    return issues;
  }
  const scope = parsedScope.data;
  const roots = androidImplementationRoots(scope);
  if (roots.length === 0) {
    if (androidSelected) {
      issues.push(
        issue("error", "android.scope_invalid", "Android is selected, but accepted DESIGN.md scope has no Android native surface.", "DESIGN.md", {
          fixHint: "Add the selected Android native surfaces and implementationPaths to accepted design scope.",
        }),
      );
    }
    return issues;
  }

  let workspaceRoot: string;
  let expectedCandidate: string;
  let expectedSourceFingerprint: string;
  try {
    workspaceRoot = realpathSync(path.resolve(root));
    expectedCandidate = designCandidateFingerprint(workspaceRoot, scope);
    expectedSourceFingerprint = fingerprintAppSource(workspaceRoot, roots);
  } catch (error) {
    issues.push(
      issue(
        "error",
        "android.candidate",
        `Current Android candidate cannot be fingerprinted: ${error instanceof Error ? error.message : String(error)}`,
        "DESIGN.md",
        { fixHint: "Restore every accepted design contract and Android implementationPath as regular workspace files." },
      ),
    );
    return issues;
  }

  const candidates = strictReceiptCandidates(workspaceRoot, issues);
  if (candidates.length === 0) {
    issues.push(
      issue(
        "error",
        "android.strict_receipt_adapter_required",
        "Accepted Android scope requires a strict emulator or physical-device install receipt; bounded MobAI adapter artifacts are diagnostic only.",
        "proof/",
        {
          fixHint:
            "Run the strict Android build/install/readback producer and write android-emulator-install under proof/android-emulator/ or physical-android-install under proof/android-device/.",
        },
      ),
    );
    return issues;
  }

  let valid = 0;
  const candidateIssues: Issue[] = [];
  for (const candidate of candidates) {
    const localIssues: Issue[] = [];
    if (validateReceipt(workspaceRoot, workspaceRoot, candidate, expectedCandidate, roots, expectedSourceFingerprint, inspectArtifact, localIssues)) valid += 1;
    else candidateIssues.push(...localIssues);
  }
  if (valid === 0) {
    issues.push(...candidateIssues);
    if (candidateIssues.length === 0) {
      issues.push(
        issue("error", "android.strict_receipt_invalid", "No strict Android receipt validates against the current accepted candidate.", "proof/", {
          fixHint: "Regenerate one complete strict Android receipt from the current workspace.",
        }),
      );
    }
  }
  return issues;
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  reportAndExit("Strict Android native proof check", validateNativeAndroidProof(args.root));
}
