import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { outputFingerprintPath } from "../../../../kernel/engine/artifact-fingerprint.js";
import { fingerprintAppSource } from "../../../../kernel/engine/source-fingerprint.js";
import { loadDesignSystem } from "../../../../tooling/lib/design-md.js";
import { isRecord, issue, type Issue } from "../../../../tooling/lib/launch-state.js";

/** Evidence integrity, not a beauty scorer or an approval authority. The existing
 * design authority owns scope; existing frozen rubrics own judgment criteria. */
export const DESIGN_ACCEPTANCE_REPORT = "design/proofs/design-acceptance.json";
export const DESIGN_IMPLEMENTATION_REVIEW = "design/reviews/IMPLEMENTATION_REVIEW.md";
const IMPLEMENTATION_CRAFT_AUDIT_WORKFLOW = "workflow.design.implementation-craft-audit";
const IMPLEMENTATION_CRAFT_AUDIT_NODE = "run.design.implementation-craft-audit";
const IMPLEMENTATION_CRAFT_AUDIT_OUTPUTS = [
  { artifactId: "artifact.design-proofs-design-acceptance-json", path: DESIGN_ACCEPTANCE_REPORT },
  { artifactId: "artifact.design-reviews-implementation-review-md", path: DESIGN_IMPLEMENTATION_REVIEW },
] as const;
const NATIVE_EVIDENCE_WORKFLOW = "workflow.engineering.native-ios-proof-route-ladder";
const BROWSER_EVIDENCE_WORKFLOW = "workflow.growth.pre-launch-funnel-landing-waitlist";
export const DESIGN_FACETS = ["coherence", "originality", "craft", "functionality", "accessibility", "motion", "cross_surface_identity"] as const;
const nonempty = z.string().trim().min(1);
const observation = z.string().trim().min(24);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceDigest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const artifact = z.strictObject({ path: nonempty, sha256: digest });
const browserUrl = z.url({ protocol: /^https?$/ });
const browserRoutePath = z
  .string()
  .trim()
  .regex(/^\/(?:[^?#]*)$/, "must be an absolute URL path without a query or fragment");
const identity = z.strictObject({ id: nonempty, sessionId: nonempty });
const androidPackageName = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/, "must be an Android application ID");
const androidVersionCode = z.number().int().positive().max(2_100_000_000);
const apkPath = z
  .string()
  .trim()
  .min(1)
  .regex(/\.apk$/i, "must name an APK");
const aabPath = z
  .string()
  .trim()
  .min(1)
  .regex(/\.aab$/i, "must name an AAB");
const uniqueStrings = z
  .array(nonempty)
  .min(1)
  .refine((v) => new Set(v).size === v.length, "must not contain duplicate values");
const verdict = z.enum(["fails", "meets", "exceeds"]);
const dimensions = z.strictObject({ width: z.number().finite().int().positive(), height: z.number().finite().int().positive() });
const uniqueStringList = z.array(nonempty).refine((v) => new Set(v).size === v.length, "must not contain duplicate values");
const machineTool = z.strictObject({ name: nonempty, version: nonempty });
const receiptProducer = z.strictObject({
  workflowId: z
    .string()
    .trim()
    .regex(/^workflow\.[a-z0-9][a-z0-9.-]*$/),
  attemptId: nonempty,
  outputFingerprint: digest,
});
const evidenceReference = z.strictObject({ id: nonempty, receipt: artifact, producer: receiptProducer });
const nativeEvidenceDevice = z.strictObject({ id: nonempty, modelIdentifier: nonempty, osVersion: nonempty, osBuild: nonempty });
const browserIdentity = z.strictObject({ name: nonempty, version: nonempty });

const surfaceScope = z.strictObject({
  id: nonempty,
  surfaceId: nonempty,
  kind: z.enum(["native", "landing", "web"]),
  platform: nonempty,
  viewport: z.enum(["native", "mobile", "desktop"]),
  routePath: browserRoutePath.optional(),
  productScreenIds: z.array(nonempty),
  implementationPaths: uniqueStrings,
  rubricPath: nonempty,
  locales: uniqueStrings,
  states: uniqueStrings,
  stateExclusions: z.array(z.strictObject({ state: nonempty, reason: observation })),
  interactions: z.array(z.strictObject({ id: nonempty, action: observation, expected: observation })).min(1),
});
export const designAcceptanceScopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("accepted"),
  designContractPaths: uniqueStringList,
  surfaces: z.array(surfaceScope).min(1),
  exclusions: z.array(z.strictObject({ surfaceId: nonempty, reason: observation })),
});
export type DesignAcceptanceScope = z.infer<typeof designAcceptanceScopeSchema>;

export const designSourceResolutionSchema = z.strictObject({
  status: z.enum(["resolved", "retained_snapshot", "expired", "unavailable", "unverified"]),
  observedAt: timestamp,
  validUntil: timestamp.optional(),
  provider: nonempty,
  sourceId: nonempty,
  substitutesFor: nonempty.optional(),
});
export type DesignSourceResolution = z.infer<typeof designSourceResolutionSchema>;

/** Evaluate already-observed candidates in their declared order. This never invokes a provider or grants fallback authority. */
export function selectDesignReference(
  candidates: readonly { id: string; kind: "visual" | "interaction" | "documentation"; resolution: DesignSourceResolution }[],
  requiredKind: "visual" | "interaction" | "documentation",
  at = new Date().toISOString(),
) {
  const attempts = candidates.map((candidate) => ({
    id: candidate.id,
    reason:
      candidate.kind !== requiredKind
        ? "incompatible_evidence_kind"
        : !["resolved", "retained_snapshot"].includes(candidate.resolution.status)
          ? candidate.resolution.status
          : Date.parse(candidate.resolution.observedAt) > Date.parse(at)
            ? "future_observation"
            : candidate.resolution.validUntil && Date.parse(candidate.resolution.validUntil) <= Date.parse(at)
              ? "expired"
              : "available",
  }));
  return { selectedId: attempts.find((attempt) => attempt.reason === "available")?.id ?? null, attempts, authorityGranted: false as const };
}

export const designRubricSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id: nonempty,
  frozenAt: timestamp,
  references: z
    .array(
      z.strictObject({
        id: nonempty,
        resolution: designSourceResolutionSchema,
        url: z.url({ protocol: /^https$/ }),
        artifact,
        kind: z.enum(["visual", "interaction", "documentation"]),
        observation,
      }),
    )
    .min(2),
  criteria: z
    .array(
      z.strictObject({
        id: nonempty,
        facet: z.enum(DESIGN_FACETS),
        condition: observation,
        minimum: z.enum(["meets", "exceeds"]),
        referenceIds: uniqueStrings,
      }),
    )
    .min(DESIGN_FACETS.length),
});
export type DesignRubric = z.infer<typeof designRubricSchema>;

const captureReceiptCommon = {
  schemaVersion: z.literal(1),
  kind: z.literal("design-capture"),
  surfaceId: nonempty,
  evidenceId: nonempty,
  state: nonempty,
  locale: nonempty,
  artifact,
  capturedAt: timestamp,
  candidateSha256: digest,
  tool: machineTool,
  sessionId: nonempty,
  dimensions,
  viewport: dimensions,
  scale: z.number().finite().positive().max(4),
  settings: z.strictObject({ reducedMotion: z.boolean(), screenReader: z.boolean(), largeText: z.boolean(), javascript: z.boolean() }),
};
export const designCaptureReceiptSchema = z.discriminatedUnion("source", [
  z.strictObject({
    ...captureReceiptCommon,
    source: z.literal("native-runtime"),
    runtimeId: nonempty,
    platform: z.enum(["ios", "android"]),
    device: nativeEvidenceDevice,
  }),
  z.strictObject({
    ...captureReceiptCommon,
    source: z.literal("browser-runtime"),
    runtimeId: nonempty,
    platform: z.literal("web"),
    browser: browserIdentity,
    browserContextId: nonempty,
    os: nonempty,
  }),
]);
export type DesignCaptureReceipt = z.infer<typeof designCaptureReceiptSchema>;

const interactionReceiptCommon = {
  schemaVersion: z.literal(1),
  kind: z.literal("design-interaction"),
  surfaceId: nonempty,
  evidenceId: nonempty,
  interactionId: nonempty,
  locale: nonempty,
  executedAt: timestamp,
  candidateSha256: digest,
  artifact,
  tool: machineTool,
  sessionId: nonempty,
  captureIds: uniqueStrings,
  result: z.literal("pass"),
  observation,
};
export const designInteractionReceiptSchema = z.discriminatedUnion("source", [
  z.strictObject({
    ...interactionReceiptCommon,
    source: z.literal("native-runtime"),
    runtimeId: nonempty,
    platform: z.enum(["ios", "android"]),
    device: nativeEvidenceDevice,
  }),
  z.strictObject({
    ...interactionReceiptCommon,
    source: z.literal("browser-runtime"),
    runtimeId: nonempty,
    platform: z.literal("web"),
    browser: browserIdentity,
    browserContextId: nonempty,
    os: nonempty,
  }),
]);
export type DesignInteractionReceipt = z.infer<typeof designInteractionReceiptSchema>;

const installedSimulatorBuildSchema = z.strictObject({
  deviceId: nonempty,
  bundleId: nonempty,
  buildNumber: nonempty,
  scheme: nonempty,
  projectPath: nonempty,
  derivedDataPath: nonempty,
  appPath: nonempty,
  appFingerprint: digest,
  bundleContentSha256: digest,
  installedAppPath: nonempty,
  executable: z.strictObject({ path: nonempty, sha256: digest }),
  source: z.strictObject({ root: nonempty, roots: uniqueStrings, fingerprint: sourceDigest }),
});
const nativeSourceIdentitySchema = z.strictObject({ root: nonempty, roots: uniqueStrings, fingerprint: sourceDigest });
export const designSimulatorDeviceProofReceiptSchema = z.strictObject({
  rung: z.literal("rung-2-xcodebuild"),
  platform: z.literal("ios"),
  target: z.literal("ios-simulator"),
  reasonForRung: nonempty,
  flow: nonempty,
  verificationScope: z.literal("adapter-actions-only"),
  steps: z
    .array(
      z.strictObject({
        name: nonempty,
        ok: z.boolean(),
        screenshotPath: nonempty.optional(),
        transcriptPath: nonempty.optional(),
        error: nonempty.optional(),
        installedBuild: installedSimulatorBuildSchema.optional(),
      }),
    )
    .min(1),
  verdict: z.literal("passed"),
  failingStep: nonempty.optional(),
  strictReceiptPath: nonempty.optional(),
  startedAt: timestamp,
  finishedAt: timestamp,
});
/** Compatibility export for the Route Ladder receipt consumed by existing callers. */
export const designDeviceProofReceiptSchema = designSimulatorDeviceProofReceiptSchema;
export const designPhysicalDeviceProofReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("physical-ios-install"),
  platform: z.literal("ios"),
  flow: nonempty,
  candidateSha256: digest,
  tool: z.strictObject({ name: nonempty, version: nonempty }),
  sessionId: nonempty,
  device: z.strictObject({
    id: nonempty,
    physical: z.literal(true),
    deviceClass: z.literal("iphone"),
    modelIdentifier: nonempty,
    osVersion: nonempty,
    osBuild: nonempty,
  }),
  builtApp: z.strictObject({
    appPath: nonempty,
    bundleId: nonempty,
    buildNumber: nonempty,
    executable: z.strictObject({ path: nonempty, sha256: digest }),
    bundleContentSha256: digest,
    source: nativeSourceIdentitySchema,
  }),
  install: z.strictObject({
    appPath: nonempty,
    bundleId: nonempty,
    buildNumber: nonempty,
    executableSha256: digest,
    bundleContentSha256: digest,
    installedAt: timestamp,
  }),
  installedAppReadback: z.strictObject({ bundleId: nonempty, buildNumber: nonempty, readAt: timestamp }),
  launch: z.strictObject({ bundleId: nonempty, launchedAt: timestamp }),
  evidence: z.strictObject({
    buildLog: artifact,
    installLog: artifact,
    deviceReadback: artifact,
    launchLog: artifact,
  }),
  verdict: z.literal("passed"),
  startedAt: timestamp,
  finishedAt: timestamp,
});
const androidPackageArtifactSchema = z.discriminatedUnion("format", [
  z.strictObject({ format: z.literal("apk"), path: apkPath, sha256: digest }),
  z.strictObject({
    format: z.literal("aab"),
    path: aabPath,
    sha256: digest,
    installApk: z.strictObject({ path: apkPath, sha256: digest }),
    conversionEvidence: artifact,
  }),
]);
const androidReceiptCommon = {
  schemaVersion: z.literal(1),
  platform: z.literal("android"),
  flow: nonempty,
  candidateSha256: digest,
  tool: z.strictObject({ name: nonempty, version: nonempty }),
  sessionId: nonempty,
  builtPackage: z.strictObject({
    packageName: androidPackageName,
    versionCode: androidVersionCode,
    artifact: androidPackageArtifactSchema,
    source: nativeSourceIdentitySchema,
  }),
  install: z.strictObject({
    deviceId: nonempty,
    apkPath,
    apkSha256: digest,
    packageName: androidPackageName,
    versionCode: androidVersionCode,
    installedAt: timestamp,
  }),
  installedAppReadback: z.strictObject({
    deviceId: nonempty,
    packageName: androidPackageName,
    versionCode: androidVersionCode,
    readAt: timestamp,
  }),
  launch: z.strictObject({ deviceId: nonempty, packageName: androidPackageName, activity: nonempty, launchedAt: timestamp }),
  evidence: z.strictObject({
    buildLog: artifact,
    installLog: artifact,
    deviceReadback: artifact,
    launchLog: artifact,
  }),
  verdict: z.literal("passed"),
  startedAt: timestamp,
  finishedAt: timestamp,
};
const androidDeviceIdentity = {
  id: nonempty,
  modelIdentifier: nonempty,
  apiLevel: z.number().int().positive(),
  osVersion: nonempty,
  osBuild: nonempty,
};
export const designAndroidEmulatorProofReceiptSchema = z.strictObject({
  ...androidReceiptCommon,
  kind: z.literal("android-emulator-install"),
  target: z.literal("emulator"),
  device: z.strictObject({
    ...androidDeviceIdentity,
    physical: z.literal(false),
    deviceClass: z.literal("android-emulator"),
  }),
});
export const designAndroidPhysicalDeviceProofReceiptSchema = z.strictObject({
  ...androidReceiptCommon,
  kind: z.literal("physical-android-install"),
  target: z.literal("physical-device"),
  device: z.strictObject({
    ...androidDeviceIdentity,
    physical: z.literal(true),
    deviceClass: z.literal("android-device"),
  }),
});
const nativeRuntimeIdentity = {
  id: nonempty,
  platform: z.literal("ios"),
  candidateSha256: digest,
  bundleId: nonempty,
  buildNumber: nonempty,
  executableSha256: digest,
  bundleContentSha256: digest,
  sourceFingerprint: sourceDigest,
  deviceId: nonempty,
  receipt: artifact,
};
const designSimulatorNativeRuntimeSchema = z.strictObject({
  ...nativeRuntimeIdentity,
  target: z.literal("simulator"),
});
const designPhysicalNativeRuntimeSchema = z.strictObject({
  ...nativeRuntimeIdentity,
  target: z.literal("physical-device"),
  deviceModelIdentifier: nonempty,
  osVersion: nonempty,
  osBuild: nonempty,
});
const androidNativeRuntimeIdentity = {
  id: nonempty,
  platform: z.literal("android"),
  candidateSha256: digest,
  packageName: androidPackageName,
  versionCode: androidVersionCode,
  packageArtifact: z.strictObject({ format: z.enum(["apk", "aab"]), sha256: digest }),
  installApkSha256: digest,
  sourceFingerprint: sourceDigest,
  deviceId: nonempty,
  deviceModelIdentifier: nonempty,
  apiLevel: z.number().int().positive(),
  osVersion: nonempty,
  osBuild: nonempty,
  receipt: artifact,
};
const designAndroidEmulatorNativeRuntimeSchema = z.strictObject({
  ...androidNativeRuntimeIdentity,
  target: z.literal("emulator"),
});
const designAndroidPhysicalNativeRuntimeSchema = z.strictObject({
  ...androidNativeRuntimeIdentity,
  target: z.literal("physical-device"),
});
export const designNativeRuntimeSchema = z.union([
  designSimulatorNativeRuntimeSchema,
  designPhysicalNativeRuntimeSchema,
  designAndroidEmulatorNativeRuntimeSchema,
  designAndroidPhysicalNativeRuntimeSchema,
]);
export type DesignNativeRuntime = z.infer<typeof designNativeRuntimeSchema>;

export const designBrowserBuildManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceFingerprint: sourceDigest,
  entrypoint: artifact,
  files: z.array(artifact).min(1),
});
export type DesignBrowserBuildManifest = z.infer<typeof designBrowserBuildManifestSchema>;

export function designBrowserBuildFingerprint(manifest: DesignBrowserBuildManifest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: manifest.schemaVersion,
        sourceFingerprint: manifest.sourceFingerprint,
        entrypoint: manifest.entrypoint,
        files: [...manifest.files].sort((left, right) => left.path.localeCompare(right.path)),
      }),
    )
    .digest("hex");
}

export const designBrowserResourceManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  origin: browserUrl,
  documentUrl: browserUrl,
  browserContextId: nonempty,
  resources: z.array(z.strictObject({ url: browserUrl, buildPath: nonempty, response: artifact })).min(1),
});
export type DesignBrowserResourceManifest = z.infer<typeof designBrowserResourceManifestSchema>;

/** Authored input to `b2c browser-proof`. The producer recomputes every digest and
 * refuses a config that no longer names the current accepted DESIGN.md candidate.
 * `urlPath` is explicit so a response cannot be reassigned to a different build file. */
export const designBrowserProofConfigSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    runtimeId: nonempty.regex(/^[a-z0-9][a-z0-9._-]*$/i, "must be a filename-safe runtime id"),
    candidateSha256: digest,
    surfaceIds: uniqueStrings,
    sourceRoots: uniqueStrings,
    build: z.strictObject({
      entrypoint: nonempty,
      resources: z
        .array(
          z.strictObject({
            path: nonempty,
            urlPath: browserRoutePath,
          }),
        )
        .min(1),
    }),
    served: z.strictObject({ origin: browserUrl, url: browserUrl }),
    browser: z.strictObject({ channel: z.literal("chrome") }),
  })
  .superRefine((value, context) => {
    const paths = value.build.resources.map((resource) => resource.path);
    const urlPaths = value.build.resources.map((resource) => resource.urlPath);
    if (new Set(paths).size !== paths.length)
      context.addIssue({ code: "custom", path: ["build", "resources"], message: "build resource paths must be unique" });
    if (new Set(urlPaths).size !== urlPaths.length)
      context.addIssue({ code: "custom", path: ["build", "resources"], message: "build resource URL paths must be unique" });
    if (!paths.includes(value.build.entrypoint))
      context.addIssue({ code: "custom", path: ["build", "entrypoint"], message: "entrypoint must be one of the build resource paths" });
  });
export type DesignBrowserProofConfig = z.infer<typeof designBrowserProofConfigSchema>;

export const designBrowserRuntimeProofReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("browser-runtime-launch"),
  platform: z.literal("web"),
  candidateSha256: digest,
  tool: machineTool,
  sessionId: nonempty,
  source: nativeSourceIdentitySchema,
  build: z.strictObject({ fingerprint: digest, manifest: artifact }),
  served: z.strictObject({ origin: browserUrl, url: browserUrl, resourceManifest: artifact }),
  context: z.strictObject({ id: nonempty, browser: browserIdentity, os: nonempty }),
  launch: z.strictObject({ startedAt: timestamp, finishedAt: timestamp, transcript: artifact }),
  navigation: z.strictObject({
    requestedUrl: browserUrl,
    finalUrl: browserUrl,
    statusCode: z.number().int().min(200).max(399),
    startedAt: timestamp,
    finishedAt: timestamp,
    transcript: artifact,
  }),
  verdict: z.literal("passed"),
  startedAt: timestamp,
  finishedAt: timestamp,
});
export type DesignBrowserRuntimeProofReceipt = z.infer<typeof designBrowserRuntimeProofReceiptSchema>;

export const designBrowserRuntimeSchema = z.strictObject({
  id: nonempty,
  platform: z.literal("web"),
  candidateSha256: digest,
  sourceFingerprint: sourceDigest,
  buildFingerprint: digest,
  origin: browserUrl,
  url: browserUrl,
  browser: browserIdentity,
  browserContextId: nonempty,
  os: nonempty,
  launchTranscriptSha256: digest,
  navigationTranscriptSha256: digest,
  receipt: artifact,
});
export type DesignBrowserRuntime = z.infer<typeof designBrowserRuntimeSchema>;

export const designAcceptanceReportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sources: z.array(artifact).min(3),
  candidate: z.strictObject({ sha256: digest, producedAt: timestamp, producer: identity }),
  nativeRuntimes: z.array(designNativeRuntimeSchema),
  browserRuntimes: z.array(designBrowserRuntimeSchema),
  reviewer: identity,
  reviewedAt: timestamp,
  verdict: z.literal("pass"),
  surfaces: z.array(
    z.strictObject({
      id: nonempty,
      runtimeIds: uniqueStrings.optional(),
      rubric: artifact,
      captures: z.array(evidenceReference),
      interactions: z.array(evidenceReference),
      criteria: z.array(z.strictObject({ id: nonempty, verdict, observation, evidenceIds: uniqueStrings })).min(1),
    }),
  ),
  findings: z.array(z.strictObject({ id: nonempty, severity: z.enum(["blocker", "major", "minor"]), status: z.enum(["open", "resolved"]), observation })),
});
export type DesignAcceptanceReport = z.infer<typeof designAcceptanceReportSchema>;

const CANONICAL_SOURCES = ["product.yaml", "DESIGN.md", "studio/seed/business.json"] as const;
const STATE_FLOOR = ["default", "loading", "empty", "error", "offline", "permission-denied"];
const NATIVE_STATES = ["reduced-motion", "large-text", "screen-reader"];
const WEB_STATES = ["reduced-motion", "no-js", "keyboard"];
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const MAX_SOURCE_FILES = 5000;
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const PRODUCER_PROOF_ROOTS = [
  "growth/landing/proof",
  "growth/landing/browser-proof.json",
  "proof/ios-simulator",
  "proof/ios-device",
  "proof/android-emulator",
  "proof/android-device",
] as const;
const evidenceRunStateSchema = z
  .object({
    artifactBindings: z.array(
      z.object({
        artifactId: nonempty,
        path: nonempty,
        fingerprint: digest.optional(),
        accepted: z.boolean(),
        producedBy: nonempty.optional(),
        attemptId: nonempty.optional(),
      }),
    ),
    nodes: z.record(
      z.string(),
      z.object({
        status: nonempty,
        blocker: nonempty.optional(),
        acceptedOutputFingerprint: digest.optional(),
        attempts: z.array(
          z.object({
            id: nonempty,
            status: nonempty,
            ownerSessionId: nonempty,
            startedAt: timestamp.optional(),
            finishedAt: timestamp.optional(),
          }),
        ),
      }),
    ),
  })
  .passthrough();

/** Refuse traversal, absolute paths, and symlinks in every path segment. */
function localPath(root: string, relative: string): string {
  if (path.isAbsolute(relative) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")) {
    throw new Error(`Unsafe workspace evidence path: ${relative}`);
  }
  const base = realpathSync(root);
  let current = base;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink evidence is not accepted: ${relative}`);
  }
  if (!realpathSync(current).startsWith(`${base}${path.sep}`)) throw new Error(`Evidence escapes workspace: ${relative}`);
  return current;
}

function bytes(root: string, relative: string): Buffer {
  const target = localPath(root, relative);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_ARTIFACT_BYTES)
    throw new Error(`Evidence must be a nonempty regular file at most 128 MiB: ${relative}`);
  return readFileSync(target);
}

export function designArtifact(root: string, relative: string): { path: string; sha256: string } {
  return { path: relative, sha256: createHash("sha256").update(bytes(root, relative)).digest("hex") };
}

/** Browser proof is written beneath the landing implementation tree in many
 * businesses. Exclude its authored candidate pointer and generated evidence so
 * producing proof cannot make its own source fingerprint stale. */
export function designBrowserSourceFingerprint(root: string, roots: readonly string[]): string {
  return fingerprintAppSource(root, roots, {
    excludedPaths: ["growth/landing/browser-proof.json", "growth/landing/proof"],
  });
}

/** Snapshot every detailed design contract and every file beneath the implementation
 * paths authored in DESIGN.md. A report cannot retain acceptance after changing a
 * linked screen/flow contract or cherry-pick one unchanged implementation file. */
export function designCandidateFingerprint(root: string, scope: DesignAcceptanceScope): string {
  const entries = new Map<string, string>();
  let totalBytes = 0;
  const visit = (relative: string): number => {
    if (PRODUCER_PROOF_ROOTS.some((proofRoot) => relative === proofRoot || relative.startsWith(`${proofRoot}/`))) return 0;
    const target = localPath(root, relative);
    const stat = lstatSync(target);
    if (stat.isDirectory()) {
      const children = readdirSync(target).sort();
      return children.reduce((count, name) => count + visit(`${relative}/${name}`), 0);
    } else {
      if (entries.has(relative)) return 1;
      if (!stat.isFile()) throw new Error(`Candidate source evidence must be regular files: ${relative}`);
      totalBytes += stat.size;
      if (entries.size >= MAX_SOURCE_FILES || totalBytes > MAX_SOURCE_BYTES)
        throw new Error("Candidate source evidence exceeds 5000 files or 256 MiB; select design and implementation paths without build caches");
      // Empty ordinary source files are valid; captures and execution evidence are not.
      entries.set(relative, createHash("sha256").update(readFileSync(target)).digest("hex"));
      return 1;
    }
  };
  const authoredPaths = [...scope.designContractPaths, ...scope.surfaces.flatMap((surface) => surface.implementationPaths)];
  for (const relative of new Set(authoredPaths)) {
    if (visit(relative) === 0) throw new Error(`Empty candidate source root: ${relative}`);
  }
  return createHash("sha256")
    .update(JSON.stringify([...entries].sort(([a], [b]) => a.localeCompare(b))))
    .digest("hex");
}

function frozenRubric(root: string, relative: string): DesignRubric {
  if (!relative.startsWith("design/reviews/rubrics/")) throw new Error("Use the existing design/reviews/rubrics/ owner for frozen rubrics");
  const text = bytes(root, relative).toString("utf8");
  if (relative.endsWith(".json")) return designRubricSchema.parse(JSON.parse(text));
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const parsed: unknown = match ? parseYaml(match[1] ?? "") : undefined;
  return designRubricSchema.parse(isRecord(parsed) ? parsed.designRubric : undefined);
}

/** Resolve frozen reference artifacts before accepting a design direction, not only at final implementation review. */
export function validateDesignSourceReferences(root: string, now = new Date().toISOString()): Issue[] {
  const loaded = loadDesignSystem(root),
    issues: Issue[] = [];
  const locked = loaded.frontmatter?.acceptance !== undefined || /^Status:\s*(?:accepted|locked)\b/im.test(loaded.markdown);
  if (!locked) return issues;
  try {
    const scope = designAcceptanceScopeSchema.parse(loaded.frontmatter?.acceptance);
    for (const relative of new Set(scope.surfaces.map((surface) => surface.rubricPath))) {
      const rubric = frozenRubric(root, relative);
      for (const reference of rubric.references) {
        const result = selectDesignReference([reference], reference.kind, now);
        if (!result.selectedId)
          issues.push(
            issue(
              "error",
              "design_source.unresolved",
              `${reference.id}: ${result.attempts[0]!.reason}. Select an authorized, coverage-compatible source or leave the design unresolved.`,
              relative,
            ),
          );
        if (Date.parse(reference.resolution.observedAt) > Date.parse(rubric.frozenAt))
          issues.push(issue("error", "design_source.chronology", `${reference.id} was not resolved before the rubric was frozen.`, relative));
        if (designArtifact(root, reference.artifact.path).sha256 !== reference.artifact.sha256)
          issues.push(issue("error", "design_source.changed", `${reference.id} retained evidence changed.`, relative));
        if (reference.kind === "visual" && !imageDimensions(bytes(root, reference.artifact.path)))
          issues.push(issue("error", "design_source.visual_missing", `${reference.id} requires inspected image evidence, not internal prose.`, relative));
        if (reference.kind === "interaction" && /\.(?:md|txt)$/i.test(reference.artifact.path))
          issues.push(
            issue(
              "error",
              "design_source.interaction_missing",
              `${reference.id} needs an observed interaction artifact, not instructions describing motion.`,
              relative,
            ),
          );
      }
    }
  } catch {
    issues.push(
      issue(
        "error",
        "design_source.contract_invalid",
        "A locked design needs valid frozen rubrics with resolved, retained source evidence and provenance. Refresh legacy rubrics explicitly.",
        "DESIGN.md",
      ),
    );
  }
  return issues;
}

/** Detailed screen and flow contracts remain optional, but every one linked from the
 * DESIGN.md body becomes an explicit acceptance input and every declared input must
 * be linked. Frontmatter text does not satisfy the link requirement. */
function linkedDesignContracts(markdown: string): string[] {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  const links: string[] = [];
  const pattern = /\]\(<?([^\s)>]+)>?(?:\s+["'][^)]*["'])?\)/g;
  for (const match of body.matchAll(pattern)) {
    const target = (match[1] ?? "").split("#", 1)[0]!;
    if (target.startsWith("design/screens/") || target.startsWith("design/flows/")) links.push(target);
  }
  return [...new Set(links)].sort();
}

function imageDimensions(data: Buffer): { width: number; height: number } | undefined {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.toString("ascii", 12, 16) === "IHDR") {
    const size = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    let offset = 8;
    const compressed: Buffer[] = [];
    let ended = false;
    while (offset + 12 <= data.length) {
      const length = data.readUInt32BE(offset);
      if (offset + length + 12 > data.length) return undefined;
      const kind = data.toString("ascii", offset + 4, offset + 8);
      if (kind === "IDAT") compressed.push(data.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
      if (kind === "IEND") {
        ended = true;
        break;
      }
    }
    if (!ended || offset !== data.length || !compressed.length || size.width > 16384 || size.height > 16384) return undefined;
    try {
      // Parse actual image data so a renamed text file or PNG header is not proof.
      if (!inflateSync(Buffer.concat(compressed), { maxOutputLength: MAX_ARTIFACT_BYTES }).length) return undefined;
    } catch {
      return undefined;
    }
    return size;
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9 && data.includes(Buffer.from([0xff, 0xda]))) {
    let offset = 2;
    while (offset + 9 < data.length && data[offset] === 0xff) {
      const marker = data[offset + 1]!;
      const length = data.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > data.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      offset += length + 2;
    }
  }
  return undefined;
}

/** Public closeout seam. Strict even when report is missing; invoke this gate only
 * for actual complete-design acceptance, not the advisory reference workspace. */
export function validateDesignAcceptance(root: string, reportPath = DESIGN_ACCEPTANCE_REPORT): Issue[] {
  const issues: Issue[] = validateDesignSourceReferences(root);
  const fail = (code: string, message: string, file = reportPath): void => {
    issues.push(issue("error", `design_acceptance.${code}`, message, file));
  };
  const attempt = <T>(code: string, work: () => T, file = reportPath): T | undefined => {
    try {
      return work();
    } catch (error) {
      fail(code, error instanceof Error ? error.message : String(error), file);
      return undefined;
    }
  };
  const checkArtifact = (value: z.infer<typeof artifact>, missingCode = "evidence_artifact"): boolean => {
    try {
      if (designArtifact(root, value.path).sha256 !== value.sha256) {
        fail("stale_evidence_artifact", `Artifact changed: ${value.path}`, value.path);
        return false;
      }
      return true;
    } catch (error) {
      fail(missingCode, error instanceof Error ? error.message : String(error), value.path);
      return false;
    }
  };
  const exactIds = (actual: string[], expected: string[], label: string, code: "report_coverage" | "surface_coverage" | "scope" = "report_coverage"): void => {
    if (new Set(actual).size !== actual.length) fail("report_coverage", `${label} must not contain duplicate values`);
    else if (actual.length !== expected.length || expected.some((id) => !actual.includes(id)))
      fail(code, `${label} must cover exactly: ${expected.join(", ")}`);
  };
  const time = (value: string): number => Date.parse(value);
  const now = Date.now();
  const product = attempt("product", () => parseYaml(bytes(root, "product.yaml").toString("utf8")) as unknown);
  if (!isRecord(product) || !isRecord(product.meta) || product.meta.status !== "accepted")
    fail("product_not_accepted", "product.yaml meta.status must be accepted", "product.yaml");
  // Check the file boundary before using the shared DESIGN.md loader.
  const designMarkdown = attempt("scope", () => bytes(root, "DESIGN.md").toString("utf8"));
  const scope = attempt("scope", () => designAcceptanceScopeSchema.parse(loadDesignSystem(root).frontmatter?.acceptance));
  const studio = attempt("inventory", () => JSON.parse(bytes(root, "studio/seed/business.json").toString("utf8")) as unknown);
  const reportBytes = attempt("report_coverage", () => bytes(root, reportPath), reportPath);
  const report = reportBytes
    ? attempt("report_coverage", () => designAcceptanceReportSchema.parse(JSON.parse(reportBytes.toString("utf8"))), reportPath)
    : undefined;
  if (!scope || !report || designMarkdown === undefined) return issues;

  const reportSha256 = createHash("sha256").update(reportBytes!).digest("hex");
  const implementationReview = attempt("report_coverage", () => bytes(root, DESIGN_IMPLEMENTATION_REVIEW).toString("utf8"), DESIGN_IMPLEMENTATION_REVIEW);
  if (implementationReview !== undefined) {
    const markerCount = implementationReview.match(/Acceptance report SHA-256:/g)?.length ?? 0;
    const markerLines = implementationReview.split(/\r?\n/).filter((line) => line.startsWith("Acceptance report SHA-256:"));
    if (markerCount !== 1 || markerLines.length !== 1 || !/^Acceptance report SHA-256: [a-f0-9]{64}$/.test(markerLines[0]!))
      fail("report_coverage", `${DESIGN_IMPLEMENTATION_REVIEW} must contain exactly one Acceptance report SHA-256 marker`, DESIGN_IMPLEMENTATION_REVIEW);
    else if (markerLines[0] !== `Acceptance report SHA-256: ${reportSha256}`)
      fail("report_coverage", `${DESIGN_IMPLEMENTATION_REVIEW} does not bind the current acceptance report bytes`, DESIGN_IMPLEMENTATION_REVIEW);
  }

  const runState = attempt(
    "surface_coverage",
    () => evidenceRunStateSchema.parse(JSON.parse(bytes(root, "run/run-state.json").toString("utf8"))),
    "run/run-state.json",
  );
  const inside = (relative: string, ancestor: string): boolean => relative === ancestor || relative.startsWith(`${ancestor}/`);

  // The report's reviewer label is evidence only after it joins the engine-issued audit attempt
  // that produced both audit files. Without this join, an audit worker could write any invented
  // session id into the JSON and make ordinary producer evidence look independent. Permit the
  // exact pending-verification lifecycle used while this gate runs and the exact succeeded
  // lifecycle used by a later read-only recheck; every other state is incomplete.
  if (runState) {
    const auditState = runState.nodes[IMPLEMENTATION_CRAFT_AUDIT_NODE];
    const auditAttempt = auditState?.attempts.at(-1);
    const pending = auditState?.status === "blocked" && auditState.blocker === "Verification required" && auditAttempt?.status === "blocked";
    const accepted = auditState?.status === "succeeded" && auditAttempt?.status === "succeeded";
    if (!auditState || !auditAttempt || (!pending && !accepted)) {
      fail(
        "report_coverage",
        "Acceptance report and implementation review require the current engine-issued implementation-craft audit attempt",
        "run/run-state.json",
      );
    } else {
      if (report.reviewer.sessionId !== auditAttempt.ownerSessionId) {
        fail("self_review", "Report reviewer session must equal the current engine-issued implementation-craft audit owner session");
      }
      if (
        auditAttempt.startedAt === undefined ||
        auditAttempt.finishedAt === undefined ||
        time(report.reviewedAt) < time(auditAttempt.startedAt) ||
        time(report.reviewedAt) > time(auditAttempt.finishedAt)
      ) {
        fail("chronology", "Implementation review time must fall inside the current engine-issued audit attempt");
      }

      const auditBindings = IMPLEMENTATION_CRAFT_AUDIT_OUTPUTS.map((expected) => {
        const matches = runState.artifactBindings.filter(
          (binding) =>
            binding.artifactId === expected.artifactId &&
            binding.path === expected.path &&
            binding.producedBy === IMPLEMENTATION_CRAFT_AUDIT_NODE &&
            binding.attemptId === auditAttempt.id &&
            binding.fingerprint !== undefined &&
            binding.accepted === accepted,
        );
        if (matches.length !== 1) {
          fail("report_coverage", `${expected.path} requires one current implementation-craft audit output binding`, "run/run-state.json");
          return undefined;
        }
        try {
          const current = outputFingerprintPath(localPath(root, expected.path));
          if (current !== matches[0]!.fingerprint) {
            fail("report_coverage", `${expected.path} changed after the current implementation-craft audit produced it`, expected.path);
            return undefined;
          }
        } catch (error) {
          fail("report_coverage", error instanceof Error ? error.message : String(error), expected.path);
          return undefined;
        }
        return matches[0]!;
      });
      if (accepted && auditBindings.every((binding) => binding !== undefined)) {
        const acceptedFingerprint = createHash("sha256")
          .update(auditBindings.map((binding) => binding!.fingerprint).join("|"))
          .digest("hex");
        if (auditState.acceptedOutputFingerprint !== acceptedFingerprint) {
          fail("report_coverage", "Accepted implementation-craft audit fingerprint does not match its two current outputs", "run/run-state.json");
        }
      }
    }
  }

  const validateProducerBinding = (
    reference: z.infer<typeof evidenceReference>,
    receiptSessionId: string,
    artifactPath: string,
    expectedWorkflowId: string,
    expectedRoot: string,
    expectedBindingPath: string,
  ): void => {
    const problem = (message: string): void => fail("surface_coverage", `${reference.id} lacks current producer evidence: ${message}`);
    const rootPath = expectedRoot.replace(/\/+$/, "");
    if (reference.producer.workflowId === IMPLEMENTATION_CRAFT_AUDIT_WORKFLOW || reference.producer.workflowId !== expectedWorkflowId) {
      problem(`receipt producer must be ${expectedWorkflowId}, never the implementation audit`);
      return;
    }
    if (!inside(reference.receipt.path, rootPath) || !inside(artifactPath, rootPath)) {
      problem(`receipt and artifact must remain in producer-owned ${rootPath}/`);
      return;
    }
    if (!runState) return;
    const nodeId = `run.${reference.producer.workflowId.slice("workflow.".length)}`;
    const state = runState.nodes[nodeId];
    const latestAttempt = state?.attempts.at(-1);
    if (
      state?.status !== "succeeded" ||
      latestAttempt?.id !== reference.producer.attemptId ||
      latestAttempt.status !== "succeeded" ||
      latestAttempt.ownerSessionId !== receiptSessionId ||
      receiptSessionId === report.reviewer.sessionId
    ) {
      problem("workflow, attempt, output fingerprint, or producer session does not match the current accepted run-state attempt");
      return;
    }
    const bindings = runState.artifactBindings
      .map((binding) => ({ ...binding, path: binding.path.replace(/\/+$/, "") }))
      .filter(
        (binding) =>
          binding.accepted &&
          binding.producedBy === nodeId &&
          binding.attemptId === latestAttempt.id &&
          binding.fingerprint !== undefined &&
          binding.path === expectedBindingPath,
      );
    if (bindings.length !== 1) {
      problem(`expected one current accepted ${expectedBindingPath} producer binding`);
      return;
    }
    const binding = bindings[0]!;
    if (!inside(reference.receipt.path, binding.path) || !inside(artifactPath, binding.path)) {
      problem("receipt path and evidence artifact are not covered by the current accepted producer binding");
      return;
    }
    try {
      const currentBindingFingerprint = outputFingerprintPath(localPath(root, binding.path));
      if (currentBindingFingerprint !== binding.fingerprint) {
        problem(`accepted producer binding changed after ${latestAttempt.id}`);
        return;
      }
      const currentOutputFingerprint = createHash("sha256").update(currentBindingFingerprint).digest("hex");
      if (state.acceptedOutputFingerprint !== currentOutputFingerprint || reference.producer.outputFingerprint !== currentOutputFingerprint)
        problem("output fingerprint does not match the current accepted producer binding");
    } catch (error) {
      problem(error instanceof Error ? error.message : String(error));
    }
  };

  exactIds(linkedDesignContracts(designMarkdown), scope.designContractPaths, "Linked design contracts", "scope");
  for (const relative of scope.designContractPaths) {
    if ((!relative.startsWith("design/screens/") && !relative.startsWith("design/flows/")) || !relative.endsWith(".md"))
      fail("scope", `Detailed design contract must be Markdown under design/screens/ or design/flows/: ${relative}`, "DESIGN.md");
  }
  const sources = report.sources.map((source) => source.path);
  exactIds(sources, [...CANONICAL_SOURCES, ...scope.designContractPaths], "Authored inputs");
  report.sources.forEach((source) => checkArtifact(source));
  exactIds(
    report.surfaces.map((surface) => surface.id),
    scope.surfaces.map((surface) => surface.id),
    "Surface reviews",
    "surface_coverage",
  );
  if (new Set(scope.surfaces.map((surface) => surface.id)).size !== scope.surfaces.length)
    fail("scope", "DESIGN.md acceptance contains duplicate surface IDs", "DESIGN.md");
  const producer = report.candidate.producer;
  if (producer.id.trim().toLowerCase() === report.reviewer.id.trim().toLowerCase() || producer.sessionId === report.reviewer.sessionId)
    fail("self_review", "Producer and reviewer require distinct identities and session IDs");
  if (time(report.reviewedAt) > now || time(report.candidate.producedAt) > time(report.reviewedAt))
    fail("chronology", "Review must follow candidate production and cannot be future-dated");
  if (report.findings.some((finding) => finding.status === "open"))
    fail("open_findings", "Resolve all recorded findings and re-review the resulting candidate before acceptance");
  const candidate = attempt("candidate", () => designCandidateFingerprint(root, scope));
  if (candidate && candidate !== report.candidate.sha256)
    fail("stale_candidate", "Candidate implementation changed; recapture and re-review affected surfaces");

  const runtimeProofFinishedAt = new Map<string, number>();
  const androidImplementationRoots = [
    ...new Set(
      scope.surfaces.filter((surface) => surface.kind === "native" && surface.platform === "android").flatMap((surface) => surface.implementationPaths),
    ),
  ].sort();
  const currentReceiptSource = (
    runtimeId: string,
    source: z.infer<typeof nativeSourceIdentitySchema>,
    expectedRoots?: readonly string[],
  ): string | undefined => {
    try {
      const workspaceAbsolute = path.resolve(root);
      if (!path.isAbsolute(source.root)) throw new Error("receipt source root is not absolute");
      const unresolvedSourceRoot = path.resolve(source.root);
      if (unresolvedSourceRoot !== workspaceAbsolute && !unresolvedSourceRoot.startsWith(`${workspaceAbsolute}${path.sep}`))
        throw new Error("receipt source root is outside the business workspace");
      const workspaceRoot = realpathSync(workspaceAbsolute);
      const receiptSourceRoot = realpathSync(unresolvedSourceRoot);
      if (receiptSourceRoot !== workspaceRoot && !receiptSourceRoot.startsWith(`${workspaceRoot}${path.sep}`))
        throw new Error("receipt source root is outside the business workspace");
      if (expectedRoots) {
        const actualRoots = [...source.roots].sort();
        if (
          receiptSourceRoot !== workspaceRoot ||
          actualRoots.length !== expectedRoots.length ||
          expectedRoots.some((expected, index) => actualRoots[index] !== expected)
        )
          throw new Error(
            `Android receipt source must use the business workspace root and exactly the authored Android implementation paths: ${expectedRoots.join(", ")}`,
          );
      }
      return fingerprintAppSource(receiptSourceRoot, source.roots);
    } catch (error) {
      fail(
        "native_runtime",
        `${runtimeId} cannot verify its receipt source against the current workspace: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  };
  const nativeRuntimeIds = report.nativeRuntimes.map((runtime) => runtime.id);
  const browserRuntimeIds = report.browserRuntimes.map((runtime) => runtime.id);
  const runtimeIds = [...nativeRuntimeIds, ...browserRuntimeIds];
  if (new Set(nativeRuntimeIds).size !== nativeRuntimeIds.length) fail("report_coverage", "Native runtime IDs must be unique");
  if (new Set(browserRuntimeIds).size !== browserRuntimeIds.length) fail("report_coverage", "Browser runtime IDs must be unique");
  if (new Set(runtimeIds).size !== runtimeIds.length) fail("report_coverage", "Native and browser runtime IDs must be globally unique");
  const nativeProducerRoot = (runtime: DesignNativeRuntime): string => {
    if (runtime.platform === "ios") return runtime.target === "simulator" ? "proof/ios-simulator" : "proof/ios-device";
    return runtime.target === "emulator" ? "proof/android-emulator" : "proof/android-device";
  };
  for (const runtime of report.nativeRuntimes) {
    const producerRoot = nativeProducerRoot(runtime);
    if (!inside(runtime.receipt.path, producerRoot)) {
      fail("native_runtime", `${runtime.id} receipt must live under producer-owned ${producerRoot}/`);
      continue;
    }
    if (!checkArtifact(runtime.receipt, "surface_coverage")) continue;
    if (runtime.candidateSha256 !== report.candidate.sha256) fail("native_runtime", `${runtime.id} does not identify this candidate`);
    const rawReceipt = attempt("native_receipt", () => JSON.parse(bytes(root, runtime.receipt.path).toString("utf8")) as unknown);
    if (!rawReceipt) continue;
    if (runtime.platform === "android") {
      const receipt =
        runtime.target === "emulator"
          ? attempt("native_receipt", () => designAndroidEmulatorProofReceiptSchema.parse(rawReceipt))
          : attempt("native_receipt", () => designAndroidPhysicalDeviceProofReceiptSchema.parse(rawReceipt));
      if (!receipt) continue;
      const startedAt = time(receipt.startedAt);
      const installedAt = time(receipt.install.installedAt);
      const readAt = time(receipt.installedAppReadback.readAt);
      const launchedAt = time(receipt.launch.launchedAt);
      const finishedAt = time(receipt.finishedAt);
      if (
        startedAt < time(report.candidate.producedAt) ||
        installedAt < startedAt ||
        readAt < installedAt ||
        launchedAt < readAt ||
        finishedAt < launchedAt ||
        finishedAt > time(report.reviewedAt)
      )
        fail("native_runtime", `${runtime.id} Android proof must build, install, read back, and launch after candidate production and before review`);
      const transcriptEvidence = Object.values(receipt.evidence);
      for (const evidence of transcriptEvidence) checkArtifact(evidence);
      const builtArtifact = receipt.builtPackage.artifact;
      checkArtifact(builtArtifact);
      if (builtArtifact.format === "aab") {
        checkArtifact(builtArtifact.installApk);
        checkArtifact(builtArtifact.conversionEvidence);
      }
      const allEvidencePaths = [
        builtArtifact.path,
        ...(builtArtifact.format === "aab" ? [builtArtifact.installApk.path, builtArtifact.conversionEvidence.path] : []),
        ...transcriptEvidence.map((entry) => entry.path),
      ];
      if (new Set(allEvidencePaths).size !== allEvidencePaths.length)
        fail("native_runtime", `${runtime.id} Android receipt requires distinct package, conversion, build, install, readback, and launch artifacts`);
      const installApk = builtArtifact.format === "apk" ? builtArtifact : builtArtifact.installApk;
      const currentSourceFingerprint = currentReceiptSource(runtime.id, receipt.builtPackage.source, androidImplementationRoots);
      if (
        receipt.candidateSha256 !== report.candidate.sha256 ||
        runtime.candidateSha256 !== receipt.candidateSha256 ||
        runtime.packageName !== receipt.builtPackage.packageName ||
        runtime.packageName !== receipt.install.packageName ||
        runtime.packageName !== receipt.installedAppReadback.packageName ||
        runtime.packageName !== receipt.launch.packageName ||
        runtime.versionCode !== receipt.builtPackage.versionCode ||
        runtime.versionCode !== receipt.install.versionCode ||
        runtime.versionCode !== receipt.installedAppReadback.versionCode ||
        runtime.packageArtifact.format !== builtArtifact.format ||
        runtime.packageArtifact.sha256 !== builtArtifact.sha256 ||
        runtime.installApkSha256 !== installApk.sha256 ||
        receipt.install.apkPath !== installApk.path ||
        receipt.install.apkSha256 !== installApk.sha256 ||
        runtime.sourceFingerprint !== receipt.builtPackage.source.fingerprint ||
        currentSourceFingerprint !== receipt.builtPackage.source.fingerprint ||
        runtime.deviceId !== receipt.device.id ||
        runtime.deviceId !== receipt.install.deviceId ||
        runtime.deviceId !== receipt.installedAppReadback.deviceId ||
        runtime.deviceId !== receipt.launch.deviceId ||
        runtime.deviceModelIdentifier !== receipt.device.modelIdentifier ||
        runtime.apiLevel !== receipt.device.apiLevel ||
        runtime.osVersion !== receipt.device.osVersion ||
        runtime.osBuild !== receipt.device.osBuild
      )
        fail("native_runtime", `${runtime.id} candidate, package, versionCode, APK/AAB, source, device, or OS identity does not match its Android receipt`);
      runtimeProofFinishedAt.set(runtime.id, finishedAt);
      continue;
    }
    if (runtime.target === "simulator") {
      const receipt = attempt("native_receipt", () => designSimulatorDeviceProofReceiptSchema.parse(rawReceipt));
      if (!receipt) continue;
      const startedAt = time(receipt.startedAt);
      const finishedAt = time(receipt.finishedAt);
      if (startedAt < time(report.candidate.producedAt) || finishedAt < startedAt || finishedAt > time(report.reviewedAt))
        fail("native_runtime", `${runtime.id} proof must run after candidate production and finish before review`);
      if (receipt.failingStep || receipt.steps.some((step) => !step.ok)) fail("native_runtime", `${runtime.id} receipt cannot contain a failed step`);
      const requiredSteps = ["build", "verify_build", "install", "verify_install", "launch"];
      const positions = requiredSteps.map((name) => receipt.steps.findIndex((step) => step.name === name && step.ok));
      if (
        requiredSteps.some((name) => receipt.steps.filter((step) => step.name === name).length !== 1) ||
        positions.some((position) => position < 0) ||
        positions.some((position, index) => index > 0 && position <= positions[index - 1]!)
      ) {
        fail("native_runtime", `${runtime.id} simulator receipt must build, verify, install, read back, and launch in order`);
        continue;
      }
      const installSteps = receipt.steps.filter((step) => step.name === "verify_install" && step.ok && step.installedBuild);
      if (installSteps.length !== 1) {
        fail("native_runtime", `${runtime.id} simulator receipt must contain one exact installed-build readback`);
        continue;
      }
      const installed = installSteps[0]!.installedBuild!;
      const currentSourceFingerprint = currentReceiptSource(runtime.id, installed.source);
      if (
        runtime.bundleId !== installed.bundleId ||
        runtime.buildNumber !== installed.buildNumber ||
        runtime.executableSha256 !== installed.executable.sha256 ||
        runtime.bundleContentSha256 !== installed.bundleContentSha256 ||
        runtime.sourceFingerprint !== installed.source.fingerprint ||
        currentSourceFingerprint !== installed.source.fingerprint ||
        runtime.deviceId !== installed.deviceId
      )
        fail("native_runtime", `${runtime.id} bundle, build, binary, source, or device identity does not match its installed simulator receipt`);
      runtimeProofFinishedAt.set(runtime.id, finishedAt);
      continue;
    }

    const receipt = attempt("native_receipt", () => designPhysicalDeviceProofReceiptSchema.parse(rawReceipt));
    if (!receipt) continue;
    const startedAt = time(receipt.startedAt);
    const installedAt = time(receipt.install.installedAt);
    const readAt = time(receipt.installedAppReadback.readAt);
    const launchedAt = time(receipt.launch.launchedAt);
    const finishedAt = time(receipt.finishedAt);
    if (
      startedAt < time(report.candidate.producedAt) ||
      installedAt < startedAt ||
      readAt < installedAt ||
      launchedAt < readAt ||
      finishedAt < launchedAt ||
      finishedAt > time(report.reviewedAt)
    )
      fail("native_runtime", `${runtime.id} physical-device proof must build, install, read back, and launch after candidate production and before review`);
    for (const evidence of Object.values(receipt.evidence)) checkArtifact(evidence);
    if (new Set(Object.values(receipt.evidence).map((entry) => entry.path)).size !== Object.keys(receipt.evidence).length)
      fail("native_runtime", `${runtime.id} physical-device receipt requires distinct build, install, readback, and launch evidence`);
    const currentSourceFingerprint = currentReceiptSource(runtime.id, receipt.builtApp.source);
    if (
      receipt.candidateSha256 !== report.candidate.sha256 ||
      runtime.candidateSha256 !== receipt.candidateSha256 ||
      runtime.bundleId !== receipt.builtApp.bundleId ||
      runtime.bundleId !== receipt.install.bundleId ||
      runtime.bundleId !== receipt.installedAppReadback.bundleId ||
      runtime.bundleId !== receipt.launch.bundleId ||
      runtime.buildNumber !== receipt.builtApp.buildNumber ||
      runtime.buildNumber !== receipt.install.buildNumber ||
      runtime.buildNumber !== receipt.installedAppReadback.buildNumber ||
      runtime.executableSha256 !== receipt.builtApp.executable.sha256 ||
      runtime.executableSha256 !== receipt.install.executableSha256 ||
      runtime.bundleContentSha256 !== receipt.builtApp.bundleContentSha256 ||
      runtime.bundleContentSha256 !== receipt.install.bundleContentSha256 ||
      runtime.sourceFingerprint !== receipt.builtApp.source.fingerprint ||
      currentSourceFingerprint !== receipt.builtApp.source.fingerprint ||
      runtime.deviceId !== receipt.device.id ||
      runtime.deviceModelIdentifier !== receipt.device.modelIdentifier ||
      runtime.osVersion !== receipt.device.osVersion ||
      runtime.osBuild !== receipt.device.osBuild ||
      receipt.builtApp.appPath !== receipt.install.appPath
    )
      fail("native_runtime", `${runtime.id} candidate, bundle, build, binary, source, device, or OS identity does not match its physical iPhone receipt`);
    runtimeProofFinishedAt.set(runtime.id, finishedAt);
  }

  const browserRuntimeReadyAt = new Map<string, number>();
  const browserRuntimeReceiptById = new Map<string, DesignBrowserRuntimeProofReceipt>();
  const currentBrowserSource = (
    runtimeId: string,
    source: z.infer<typeof nativeSourceIdentitySchema>,
    expectedRoots: readonly string[],
  ): string | undefined => {
    try {
      const workspaceAbsolute = path.resolve(root);
      if (!path.isAbsolute(source.root)) throw new Error("receipt source root is not absolute");
      if (realpathSync(path.resolve(source.root)) !== realpathSync(workspaceAbsolute))
        throw new Error("receipt source root is not the canonical business workspace root");
      const actualRoots = [...source.roots].sort();
      if (!expectedRoots.length || actualRoots.length !== expectedRoots.length || expectedRoots.some((expected, index) => actualRoots[index] !== expected))
        throw new Error(`receipt source roots must equal the authored browser implementation paths: ${expectedRoots.join(", ")}`);
      return designBrowserSourceFingerprint(workspaceAbsolute, actualRoots);
    } catch (error) {
      fail("browser_runtime", `${runtimeId} cannot verify its source against the current workspace: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const parsedBrowserUrl = (value: string, runtimeId: string, label: string): URL | undefined => {
    try {
      const parsed = new URL(value);
      const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error("must use HTTPS, except for an explicit loopback origin");
      if (parsed.username || parsed.password || parsed.hash) throw new Error("cannot contain credentials or a fragment");
      return parsed;
    } catch (error) {
      fail("browser_runtime", `${runtimeId} ${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };
  const sameArtifact = (left: z.infer<typeof artifact>, right: z.infer<typeof artifact>): boolean => left.path === right.path && left.sha256 === right.sha256;
  for (const runtime of report.browserRuntimes) {
    const producerRoot = "growth/landing/proof";
    if (!inside(runtime.receipt.path, producerRoot)) {
      fail("browser_runtime", `${runtime.id} receipt must live under producer-owned ${producerRoot}/`);
      continue;
    }
    if (!checkArtifact(runtime.receipt, "surface_coverage")) continue;
    if (runtime.candidateSha256 !== report.candidate.sha256) fail("browser_runtime", `${runtime.id} does not identify this candidate`);
    const receipt = attempt("browser_runtime", () =>
      designBrowserRuntimeProofReceiptSchema.parse(JSON.parse(bytes(root, runtime.receipt.path).toString("utf8"))),
    );
    if (!receipt) continue;
    browserRuntimeReceiptById.set(runtime.id, receipt);

    const mappedSurfaces = report.surfaces.flatMap((review) => {
      if (!review.runtimeIds?.includes(runtime.id)) return [];
      const declared = scope.surfaces.find((surface) => surface.id === review.id);
      return declared && declared.kind !== "native" ? [declared] : [];
    });
    const expectedSourceRoots = [...new Set(mappedSurfaces.flatMap((surface) => surface.implementationPaths))].sort();
    const currentSourceFingerprint = currentBrowserSource(runtime.id, receipt.source, expectedSourceRoots);

    const startedAt = time(receipt.startedAt);
    const launchStartedAt = time(receipt.launch.startedAt);
    const launchFinishedAt = time(receipt.launch.finishedAt);
    const navigationStartedAt = time(receipt.navigation.startedAt);
    const navigationFinishedAt = time(receipt.navigation.finishedAt);
    const finishedAt = time(receipt.finishedAt);
    if (
      startedAt < time(report.candidate.producedAt) ||
      launchStartedAt < startedAt ||
      launchFinishedAt < launchStartedAt ||
      navigationStartedAt < launchFinishedAt ||
      navigationFinishedAt < navigationStartedAt ||
      finishedAt < navigationFinishedAt ||
      finishedAt > time(report.reviewedAt)
    )
      fail("browser_runtime", `${runtime.id} must launch and navigate after candidate production and before review`);

    for (const evidence of [receipt.build.manifest, receipt.served.resourceManifest, receipt.launch.transcript, receipt.navigation.transcript])
      checkArtifact(evidence);
    const runtimeEvidencePaths = [
      receipt.build.manifest.path,
      receipt.served.resourceManifest.path,
      receipt.launch.transcript.path,
      receipt.navigation.transcript.path,
    ];
    if (runtimeEvidencePaths.some((relative) => !inside(relative, producerRoot)) || new Set(runtimeEvidencePaths).size !== runtimeEvidencePaths.length)
      fail("browser_runtime", `${runtime.id} requires distinct producer-owned build, resource, launch, and navigation evidence`);

    const buildManifest = attempt("browser_runtime", () =>
      designBrowserBuildManifestSchema.parse(JSON.parse(bytes(root, receipt.build.manifest.path).toString("utf8"))),
    );
    const resourceManifest = attempt("browser_runtime", () =>
      designBrowserResourceManifestSchema.parse(JSON.parse(bytes(root, receipt.served.resourceManifest.path).toString("utf8"))),
    );
    if (!buildManifest || !resourceManifest) continue;

    const buildPaths = buildManifest.files.map((entry) => entry.path);
    if (new Set(buildPaths).size !== buildPaths.length) fail("browser_runtime", `${runtime.id} build manifest contains duplicate file paths`);
    if (!buildManifest.files.some((entry) => sameArtifact(entry, buildManifest.entrypoint)))
      fail("browser_runtime", `${runtime.id} build entrypoint is not one of its exact manifest files`);
    for (const file of buildManifest.files) {
      if (!expectedSourceRoots.some((sourceRoot) => inside(file.path, sourceRoot)))
        fail("browser_runtime", `${runtime.id} build file is outside its authored browser implementation paths: ${file.path}`);
      checkArtifact(file);
    }
    const currentBuildFingerprint = designBrowserBuildFingerprint(buildManifest);

    const servedOrigin = parsedBrowserUrl(receipt.served.origin, runtime.id, "served origin");
    const servedUrl = parsedBrowserUrl(receipt.served.url, runtime.id, "served URL");
    const requestedUrl = parsedBrowserUrl(receipt.navigation.requestedUrl, runtime.id, "requested navigation URL");
    const finalUrl = parsedBrowserUrl(receipt.navigation.finalUrl, runtime.id, "final navigation URL");
    const manifestOrigin = parsedBrowserUrl(resourceManifest.origin, runtime.id, "resource-manifest origin");
    const documentUrl = parsedBrowserUrl(resourceManifest.documentUrl, runtime.id, "resource-manifest document URL");
    if (
      servedOrigin &&
      servedUrl &&
      requestedUrl &&
      finalUrl &&
      manifestOrigin &&
      documentUrl &&
      (receipt.served.origin !== servedOrigin.origin ||
        servedUrl.origin !== servedOrigin.origin ||
        requestedUrl.origin !== servedOrigin.origin ||
        finalUrl.origin !== servedOrigin.origin ||
        manifestOrigin.origin !== servedOrigin.origin ||
        documentUrl.origin !== servedOrigin.origin ||
        receipt.served.url !== receipt.navigation.finalUrl ||
        resourceManifest.origin !== receipt.served.origin ||
        resourceManifest.documentUrl !== receipt.served.url)
    )
      fail("browser_runtime", `${runtime.id} origin, served URL, navigation, and resource manifest do not identify one page`);

    const resourceUrls = resourceManifest.resources.map((resource) => resource.url);
    const resourceBuildPaths = resourceManifest.resources.map((resource) => resource.buildPath);
    if (new Set(resourceUrls).size !== resourceUrls.length || new Set(resourceBuildPaths).size !== resourceBuildPaths.length)
      fail("browser_runtime", `${runtime.id} resource manifest contains duplicate URLs or build paths`);
    for (const resource of resourceManifest.resources) {
      const parsed = parsedBrowserUrl(resource.url, runtime.id, `resource URL ${resource.url}`);
      if (parsed && servedOrigin && parsed.origin !== servedOrigin.origin)
        fail("browser_runtime", `${runtime.id} resource ${resource.url} is outside the served origin`);
      if (!inside(resource.response.path, producerRoot))
        fail("browser_runtime", `${runtime.id} resource response must remain under producer-owned ${producerRoot}/`);
      checkArtifact(resource.response);
      const buildFile = buildManifest.files.find((entry) => entry.path === resource.buildPath);
      if (!buildFile || buildFile.sha256 !== resource.response.sha256)
        fail("browser_runtime", `${runtime.id} served resource ${resource.url} does not match its current build file`);
    }
    exactIds(resourceBuildPaths, buildPaths, `${runtime.id} served build resources`);
    const documentResource = resourceManifest.resources.find((resource) => resource.url === resourceManifest.documentUrl);
    if (!documentResource || documentResource.buildPath !== buildManifest.entrypoint.path)
      fail("browser_runtime", `${runtime.id} served document does not match the current build entrypoint`);

    if (
      receipt.candidateSha256 !== report.candidate.sha256 ||
      runtime.candidateSha256 !== receipt.candidateSha256 ||
      runtime.sourceFingerprint !== receipt.source.fingerprint ||
      buildManifest.sourceFingerprint !== receipt.source.fingerprint ||
      currentSourceFingerprint !== receipt.source.fingerprint ||
      runtime.buildFingerprint !== receipt.build.fingerprint ||
      runtime.buildFingerprint !== currentBuildFingerprint ||
      runtime.origin !== receipt.served.origin ||
      runtime.url !== receipt.served.url ||
      runtime.browser.name !== receipt.context.browser.name ||
      runtime.browser.version !== receipt.context.browser.version ||
      runtime.browserContextId !== receipt.context.id ||
      runtime.os !== receipt.context.os ||
      runtime.launchTranscriptSha256 !== receipt.launch.transcript.sha256 ||
      runtime.navigationTranscriptSha256 !== receipt.navigation.transcript.sha256 ||
      resourceManifest.browserContextId !== receipt.context.id
    )
      fail("browser_runtime", `${runtime.id} candidate, source, build, origin, URL, browser context, or transcript identity does not match its launch receipt`);
    browserRuntimeReadyAt.set(runtime.id, finishedAt);
  }
  const nativeRuntimeById = new Map(report.nativeRuntimes.map((runtime) => [runtime.id, runtime]));
  const browserRuntimeById = new Map(report.browserRuntimes.map((runtime) => [runtime.id, runtime]));
  const resolvedReviewById = new Map<string, { captures: DesignCaptureReceipt[]; interactions: DesignInteractionReceipt[] }>();
  const receiptPaths = new Set<string>();
  for (const review of report.surfaces) {
    const declared = scope.surfaces.find((surface) => surface.id === review.id);
    const captures: DesignCaptureReceipt[] = [];
    const interactions: DesignInteractionReceipt[] = [];
    for (const reference of review.captures) {
      if (receiptPaths.has(reference.receipt.path)) fail("report_coverage", `Producer receipt may be referenced only once: ${reference.receipt.path}`);
      receiptPaths.add(reference.receipt.path);
      if (!checkArtifact(reference.receipt, "surface_coverage")) continue;
      const receipt = attempt(
        "surface_coverage",
        () => designCaptureReceiptSchema.parse(JSON.parse(bytes(root, reference.receipt.path).toString("utf8"))),
        reference.receipt.path,
      );
      if (!receipt) continue;
      if (!declared || receipt.surfaceId !== review.id || receipt.evidenceId !== reference.id) {
        fail("report_coverage", `${review.id}/${reference.id} does not reference a receipt for the same surface and evidence ID`);
        continue;
      }
      if (reference.receipt.path === receipt.artifact.path) {
        fail("surface_coverage", `${review.id}/${reference.id} receipt and capture artifact must be distinct producer files`);
        continue;
      }
      if (!checkArtifact(receipt.artifact, "surface_coverage")) continue;
      if (receipt.source === "native-runtime") {
        const runtime = nativeRuntimeById.get(receipt.runtimeId);
        if (!runtime) fail("surface_coverage", `${review.id}/${reference.id} has no current producer runtime`);
        else validateProducerBinding(reference, receipt.sessionId, receipt.artifact.path, NATIVE_EVIDENCE_WORKFLOW, nativeProducerRoot(runtime), "proof");
      } else {
        const runtime = browserRuntimeById.get(receipt.runtimeId);
        if (!runtime) fail("surface_coverage", `${review.id}/${reference.id} has no current browser runtime`);
        else validateProducerBinding(reference, receipt.sessionId, receipt.artifact.path, BROWSER_EVIDENCE_WORKFLOW, "growth/landing/proof", "growth/landing");
      }
      captures.push(receipt);
    }
    for (const reference of review.interactions) {
      if (receiptPaths.has(reference.receipt.path)) fail("report_coverage", `Producer receipt may be referenced only once: ${reference.receipt.path}`);
      receiptPaths.add(reference.receipt.path);
      if (!checkArtifact(reference.receipt, "surface_coverage")) continue;
      const receipt = attempt(
        "surface_coverage",
        () => designInteractionReceiptSchema.parse(JSON.parse(bytes(root, reference.receipt.path).toString("utf8"))),
        reference.receipt.path,
      );
      if (!receipt) continue;
      if (!declared || receipt.surfaceId !== review.id || receipt.evidenceId !== reference.id) {
        fail("report_coverage", `${review.id}/${reference.id} does not reference a receipt for the same surface and evidence ID`);
        continue;
      }
      if (reference.receipt.path === receipt.artifact.path) {
        fail("surface_coverage", `${review.id}/${reference.id} receipt and interaction artifact must be distinct producer files`);
        continue;
      }
      if (!checkArtifact(receipt.artifact, "surface_coverage")) continue;
      if (receipt.source === "native-runtime") {
        const runtime = nativeRuntimeById.get(receipt.runtimeId);
        if (!runtime) fail("surface_coverage", `${review.id}/${reference.id} has no current producer runtime`);
        else validateProducerBinding(reference, receipt.sessionId, receipt.artifact.path, NATIVE_EVIDENCE_WORKFLOW, nativeProducerRoot(runtime), "proof");
      } else {
        const runtime = browserRuntimeById.get(receipt.runtimeId);
        if (!runtime) fail("surface_coverage", `${review.id}/${reference.id} has no current browser runtime`);
        else validateProducerBinding(reference, receipt.sessionId, receipt.artifact.path, BROWSER_EVIDENCE_WORKFLOW, "growth/landing/proof", "growth/landing");
      }
      interactions.push(receipt);
    }
    resolvedReviewById.set(review.id, { captures, interactions });
  }

  const evidenceIndex = new Map<string, { surfaceId: string; kind: "native" | "landing" | "web"; type: "capture" | "interaction" }>();
  for (const review of report.surfaces) {
    const declared = scope.surfaces.find((surface) => surface.id === review.id);
    if (!declared) continue;
    for (const [type, entries] of [
      ["capture", review.captures],
      ["interaction", review.interactions],
    ] as const) {
      for (const entry of entries) {
        if (evidenceIndex.has(entry.id)) fail("report_coverage", `Evidence ID must be globally unique: ${entry.id}`);
        else evidenceIndex.set(entry.id, { surfaceId: review.id, kind: declared.kind, type });
      }
    }
  }
  const usedNativeRuntimeIds = new Set<string>();
  const usedBrowserRuntimeIds = new Set<string>();
  const runtimeIdFor = (evidence: DesignCaptureReceipt | DesignInteractionReceipt): string => evidence.runtimeId;

  const inventory = isRecord(studio) && isRecord(studio.surfaces) ? studio.surfaces : {};
  const mobile = isRecord(inventory.mobileApp) ? inventory.mobileApp : {};
  const platforms = Array.isArray(mobile.platforms) ? mobile.platforms.filter((p): p is string => typeof p === "string") : [];
  const supportedNativePlatforms = new Set(["ios", "android"]);
  for (const platform of platforms)
    if (!supportedNativePlatforms.has(platform))
      fail(
        "inventory",
        `Unsupported native target ${platform}; mobileApp.platforms accepts target operating systems ios or android, while stack names belong in mobileApp.stack`,
        "studio/seed/business.json",
      );
  for (const platform of platforms.filter((value) => supportedNativePlatforms.has(value)))
    if (!report.nativeRuntimes.some((runtime) => runtime.platform === platform))
      fail("surface_coverage", `Selected native platform ${platform} has no current installed runtime receipt`);
  const inventoryRows = (key: string): Record<string, unknown>[] => {
    const rows = key === "native" ? mobile.screens : inventory[key];
    if (!Array.isArray(rows) || rows.some((row) => !isRecord(row) || typeof row.id !== "string")) {
      fail("inventory", `Invalid ${key} surface inventory`, "studio/seed/business.json");
      return [];
    }
    return rows.filter(isRecord);
  };
  const native = inventoryRows("native");
  const landing = inventoryRows("landingPages");
  const web = inventoryRows("webFunnels");
  const known = [...native, ...landing, ...web];
  if (!native.some((row) => row.status !== "not_needed") || !landing.some((row) => row.status !== "not_needed") || !platforms.length)
    fail("inventory", "Complete consumer design requires native screens, selected native platforms, and a landing page", "studio/seed/business.json");
  if (
    new Set(known.map((row) => row.id)).size !== known.length ||
    new Set(platforms).size !== platforms.length ||
    new Set(scope.exclusions.map((entry) => entry.surfaceId)).size !== scope.exclusions.length
  )
    fail("inventory", "Surface IDs, selected platforms, and exclusions must be unique");
  for (const row of known) {
    const mapped = scope.surfaces.filter((surface) => surface.surfaceId === row.id);
    const exclusion = scope.exclusions.find((entry) => entry.surfaceId === row.id);
    if (row.status === "not_needed") {
      if (!exclusion || mapped.length) fail("scope", `Not-needed surface ${String(row.id)} requires an authored exclusion and no review mapping`, "DESIGN.md");
    } else if (row.status !== "ready")
      fail("surface_not_ready", `Surface ${String(row.id)} is ${String(row.status)}; blocked or draft work is incomplete`, "studio/seed/business.json");
    else if (exclusion) fail("scope", `Required surface ${String(row.id)} cannot be excluded in DESIGN.md`, "DESIGN.md");
    else if (native.includes(row)) {
      for (const platform of platforms)
        if (!mapped.some((surface) => surface.kind === "native" && surface.platform === platform && surface.viewport === "native"))
          fail("surface_coverage", `Missing native surface ${String(row.id)} on ${platform}`);
    } else {
      for (const viewport of ["mobile", "desktop"])
        if (
          !mapped.some((surface) => surface.kind === (landing.includes(row) ? "landing" : "web") && surface.platform === "web" && surface.viewport === viewport)
        )
          fail("surface_coverage", `Missing ${String(row.id)} ${viewport} browser surface`);
    }
  }
  for (const exclusion of scope.exclusions)
    if (!known.some((row) => row.id === exclusion.surfaceId && row.status === "not_needed"))
      fail("scope", `Unknown or required surface exclusion ${exclusion.surfaceId}`, "DESIGN.md");
  const productScreens =
    isRecord(product) && Array.isArray(product.instances)
      ? product.instances.filter((row) => isRecord(row) && row.class_id === "class.screen").map((row) => String((row as Record<string, unknown>).id))
      : [];
  for (const id of productScreens)
    if (!scope.surfaces.some((surface) => surface.productScreenIds.includes(id)))
      fail("surface_coverage", `Accepted product screen ${id} has no reviewed surface`, "DESIGN.md");

  for (const surface of scope.surfaces) {
    const row = known.find((entry) => entry.id === surface.surfaceId);
    if (!row || row.status === "not_needed") fail("scope", `Unknown or excluded surface mapping ${surface.surfaceId}`, "DESIGN.md");
    for (const id of surface.productScreenIds) if (!productScreens.includes(id)) fail("scope", `Unknown product screen ${id}`, "DESIGN.md");
    if (
      surface.kind === "native"
        ? !platforms.includes(surface.platform) || surface.viewport !== "native" || surface.routePath !== undefined || !native.includes(row ?? {})
        : surface.platform !== "web" ||
          surface.viewport === "native" ||
          surface.routePath === undefined ||
          !(surface.kind === "landing" ? landing : web).includes(row ?? {})
    )
      fail("scope", `Surface ${surface.id} has an incorrect native/web platform mapping`, "DESIGN.md");
    const mandatory = ["default", ...(surface.kind === "native" ? NATIVE_STATES : WEB_STATES)];
    for (const state of mandatory) if (!surface.states.includes(state)) fail("states", `${surface.id} requires ${state} evidence`, "DESIGN.md");
    for (const state of STATE_FLOOR)
      if (!surface.states.includes(state) && !surface.stateExclusions.some((entry) => entry.state === state))
        fail("states", `${surface.id} must cover or explain non-applicability of ${state}`, "DESIGN.md");
    if (new Set(surface.stateExclusions.map((entry) => entry.state)).size !== surface.stateExclusions.length)
      fail("states", `${surface.id} has duplicate state exclusions`, "DESIGN.md");
    for (const entry of surface.stateExclusions)
      if (surface.states.includes(entry.state) || !STATE_FLOOR.includes(entry.state) || mandatory.includes(entry.state))
        fail("states", `${surface.id} has contradictory or unknown state exclusion ${entry.state}`, "DESIGN.md");
    if (new Set(surface.interactions.map((entry) => entry.id)).size !== surface.interactions.length)
      fail("scope", `${surface.id} has duplicate interaction IDs`, "DESIGN.md");
    const review = report.surfaces.find((entry) => entry.id === surface.id);
    if (!review) continue;
    const resolvedReview = resolvedReviewById.get(surface.id) ?? { captures: [], interactions: [] };
    if (surface.kind === "native") {
      const evidenceRuntimeIds = [...new Set([...resolvedReview.captures, ...resolvedReview.interactions].map((evidence) => runtimeIdFor(evidence)))];
      if (!review.runtimeIds) fail("native_runtime", `${surface.id} must declare every installed native runtime used by its evidence`);
      else exactIds(review.runtimeIds, evidenceRuntimeIds, `${surface.id} native runtimes`);
      for (const evidence of [...resolvedReview.captures, ...resolvedReview.interactions]) {
        const runtimeId = runtimeIdFor(evidence);
        const runtime = nativeRuntimeById.get(runtimeId);
        if (!runtime) {
          fail("native_runtime", `${surface.id}/${evidence.evidenceId} must link to a registered installed native runtime`);
          continue;
        }
        usedNativeRuntimeIds.add(runtime.id);
        if (runtime.platform !== surface.platform)
          fail("native_runtime", `${surface.id}/${evidence.evidenceId} runtime platform does not match its authored surface`);
        if (!runtimeProofFinishedAt.has(runtime.id))
          fail("native_runtime", `${surface.id}/${evidence.evidenceId} runtime does not have a valid current install receipt`);
      }
    } else {
      const evidenceRuntimeIds = [...new Set([...resolvedReview.captures, ...resolvedReview.interactions].map((evidence) => runtimeIdFor(evidence)))];
      if (!review.runtimeIds) fail("browser_runtime", `${surface.id} must declare every browser runtime used by its evidence`);
      else exactIds(review.runtimeIds, evidenceRuntimeIds, `${surface.id} browser runtimes`);
      for (const evidence of [...resolvedReview.captures, ...resolvedReview.interactions]) {
        const runtime = browserRuntimeById.get(evidence.runtimeId);
        if (!runtime) {
          fail("browser_runtime", `${surface.id}/${evidence.evidenceId} must link to a registered browser runtime`);
          continue;
        }
        usedBrowserRuntimeIds.add(runtime.id);
        const receipt = browserRuntimeReceiptById.get(runtime.id);
        if (!receipt || !browserRuntimeReadyAt.has(runtime.id))
          fail("browser_runtime", `${surface.id}/${evidence.evidenceId} browser runtime does not have a valid current launch receipt`);
        const servedUrl = parsedBrowserUrl(runtime.url, runtime.id, "served URL");
        if (servedUrl && servedUrl.pathname !== surface.routePath)
          fail("browser_runtime", `${surface.id}/${evidence.evidenceId} runtime URL does not match its authored route ${surface.routePath}`);
      }
    }
    if (review.rubric.path !== surface.rubricPath) fail("rubric", `${surface.id} reviewed a different rubric than DESIGN.md specifies`);
    checkArtifact(review.rubric);
    const rubric = attempt("rubric", () => frozenRubric(root, surface.rubricPath));
    if (!rubric) continue;
    if (time(rubric.frozenAt) > time(report.candidate.producedAt)) fail("rubric_chronology", `${surface.id} rubric must be frozen before candidate production`);
    if (
      new Set(rubric.criteria.map((entry) => entry.id)).size !== rubric.criteria.length ||
      new Set(rubric.references.map((entry) => entry.id)).size !== rubric.references.length
    )
      fail("rubric", `${surface.id} rubric has duplicate criteria or reference IDs`);
    for (const facet of DESIGN_FACETS)
      if (!rubric.criteria.some((criterion) => criterion.facet === facet)) fail("rubric", `${surface.id} rubric omits ${facet}`);
    if (!rubric.references.some((ref) => ref.kind === "visual") || !rubric.references.some((ref) => ref.kind !== "visual"))
      fail("calibration", `${surface.id} needs visual and complementary behavior/documentation calibration`);
    rubric.references.forEach((ref) => {
      checkArtifact(ref.artifact);
      if (ref.kind === "visual" && !attempt("reference_image", () => imageDimensions(bytes(root, ref.artifact.path))))
        fail("reference_image", `${surface.id}/${ref.id} needs an inspected PNG/JPEG image, not a prose-only visual reference`);
    });
    exactIds(
      review.criteria.map((entry) => entry.id),
      rubric.criteria.map((entry) => entry.id),
      `${surface.id} criterion judgments`,
    );
    const captureKeys = resolvedReview.captures.map((capture) => `${capture.state}:${capture.locale}`);
    exactIds(
      captureKeys,
      surface.states.flatMap((state) => surface.locales.map((locale) => `${state}:${locale}`)),
      `${surface.id} captures`,
      "surface_coverage",
    );
    const evidenceIds = [...resolvedReview.captures, ...resolvedReview.interactions].map((entry) => entry.evidenceId);
    if (new Set(evidenceIds).size !== evidenceIds.length) fail("report_coverage", `${surface.id} evidence IDs must be unique`);
    for (const capture of resolvedReview.captures) {
      checkArtifact(capture.artifact);
      const size = attempt("capture", () => imageDimensions(bytes(root, capture.artifact.path)));
      if (!size || size.width !== capture.dimensions.width || size.height !== capture.dimensions.height || Math.min(size.width, size.height) < 240)
        fail("capture", `${surface.id}/${capture.evidenceId} must be a PNG/JPEG runtime capture with correct dimensions, at least 240 pixels per side`);
      if (
        Math.round(capture.viewport.width * capture.scale) !== capture.dimensions.width ||
        Math.round(capture.viewport.height * capture.scale) !== capture.dimensions.height
      )
        fail("capture_viewport", `${surface.id}/${capture.evidenceId} pixel dimensions do not match its viewport and scale`);
      if ((surface.viewport === "mobile" && capture.viewport.width > 600) || (surface.viewport === "desktop" && capture.viewport.width < 900))
        fail("capture_viewport", `${surface.id}/${capture.evidenceId} does not demonstrate its declared mobile/desktop composition`);
      if (capture.source !== (surface.kind === "native" ? "native-runtime" : "browser-runtime"))
        fail("capture", `${surface.id} needs actual ${surface.kind === "native" ? "native" : "browser"} capture provenance`);
      if (capture.platform !== surface.platform) fail("capture_platform", `${surface.id}/${capture.evidenceId} was captured on a different platform`);
      if (
        capture.candidateSha256 !== report.candidate.sha256 ||
        time(capture.capturedAt) < time(report.candidate.producedAt) ||
        time(capture.capturedAt) > time(report.reviewedAt)
      )
        fail("capture_chronology", `${surface.id}/${capture.evidenceId} capture must belong to this candidate and precede review`);
      const captureRuntime = capture.source === "native-runtime" ? nativeRuntimeById.get(capture.runtimeId) : undefined;
      if (surface.kind === "native" && capture.source === "native-runtime" && captureRuntime) {
        if (
          capture.device.id !== captureRuntime.deviceId ||
          time(capture.capturedAt) < (runtimeProofFinishedAt.get(captureRuntime.id) ?? Number.POSITIVE_INFINITY)
        )
          fail(
            "native_runtime",
            `${surface.id}/${capture.evidenceId} must come from the receipt-verified device after the current binary was installed and launched`,
          );
        if (
          (captureRuntime.platform === "android" || captureRuntime.target === "physical-device") &&
          (capture.device.modelIdentifier !== captureRuntime.deviceModelIdentifier ||
            capture.device.osVersion !== captureRuntime.osVersion ||
            capture.device.osBuild !== captureRuntime.osBuild)
        )
          fail("native_runtime", `${surface.id}/${capture.evidenceId} device and OS must match its installed-device receipt`);
        if (capture.settings.screenReader && captureRuntime.target !== "physical-device")
          fail(
            "native_runtime",
            `${surface.id}/${capture.evidenceId} screen-reader evidence requires a receipt-verified physical ${captureRuntime.platform === "ios" ? "iPhone" : "Android device"}`,
          );
      } else if (surface.kind !== "native" && capture.source === "browser-runtime") {
        const browserRuntime = browserRuntimeById.get(capture.runtimeId);
        const browserReceipt = browserRuntime ? browserRuntimeReceiptById.get(browserRuntime.id) : undefined;
        if (
          !browserRuntime ||
          !browserReceipt ||
          capture.browser.name !== browserRuntime.browser.name ||
          capture.browser.version !== browserRuntime.browser.version ||
          capture.browserContextId !== browserRuntime.browserContextId ||
          capture.os !== browserRuntime.os ||
          capture.sessionId !== browserReceipt.sessionId ||
          time(capture.capturedAt) < (browserRuntimeReadyAt.get(capture.runtimeId) ?? Number.POSITIVE_INFINITY)
        )
          fail("browser_runtime", `${surface.id}/${capture.evidenceId} must come from the receipt-verified browser context after the current page loaded`);
      }
      if (
        (capture.state === "reduced-motion" && !capture.settings.reducedMotion) ||
        (capture.state === "large-text" && !capture.settings.largeText) ||
        (capture.state === "screen-reader") !== capture.settings.screenReader ||
        (capture.state === "no-js" && capture.settings.javascript)
      )
        fail("capture_settings", `${surface.id}/${capture.evidenceId} settings contradict the tested state`);
    }
    exactIds(
      resolvedReview.interactions.map((entry) => `${entry.interactionId}:${entry.locale}`),
      surface.interactions.flatMap((entry) => surface.locales.map((locale) => `${entry.id}:${locale}`)),
      `${surface.id} interactions`,
      "surface_coverage",
    );
    for (const interaction of resolvedReview.interactions) {
      checkArtifact(interaction.artifact);
      if (
        interaction.candidateSha256 !== report.candidate.sha256 ||
        time(interaction.executedAt) < time(report.candidate.producedAt) ||
        time(interaction.executedAt) > time(report.reviewedAt)
      )
        fail("interaction_chronology", `${surface.id}/${interaction.evidenceId} interaction must belong to this candidate and precede review`);
      if (interaction.source !== (surface.kind === "native" ? "native-runtime" : "browser-runtime") || interaction.platform !== surface.platform)
        fail("interaction", `${surface.id}/${interaction.evidenceId} machine identity does not match its authored surface`);
      const interactionRuntime = interaction.source === "native-runtime" ? nativeRuntimeById.get(interaction.runtimeId) : undefined;
      if (surface.kind === "native" && interaction.source === "native-runtime" && interactionRuntime) {
        if (time(interaction.executedAt) < (runtimeProofFinishedAt.get(interactionRuntime.id) ?? Number.POSITIVE_INFINITY))
          fail("native_runtime", `${surface.id}/${interaction.evidenceId} must execute after the current binary was installed and launched`);
        if (
          interaction.device.id !== interactionRuntime.deviceId ||
          ((interactionRuntime.platform === "android" || interactionRuntime.target === "physical-device") &&
            (interaction.device.modelIdentifier !== interactionRuntime.deviceModelIdentifier ||
              interaction.device.osVersion !== interactionRuntime.osVersion ||
              interaction.device.osBuild !== interactionRuntime.osBuild))
        )
          fail("native_runtime", `${surface.id}/${interaction.evidenceId} device and OS must match its installed-device receipt`);
        const citedCaptures = interaction.captureIds.flatMap((id) => resolvedReview.captures.filter((capture) => capture.evidenceId === id));
        if (citedCaptures.some((capture) => capture.source !== "native-runtime" || capture.runtimeId !== interactionRuntime.id))
          fail("native_runtime", `${surface.id}/${interaction.evidenceId} can cite only captures from the same receipt-verified runtime`);
        if (citedCaptures.some((capture) => capture.settings.screenReader) && interactionRuntime.target !== "physical-device")
          fail(
            "native_runtime",
            `${surface.id}/${interaction.evidenceId} screen-reader interaction evidence requires a receipt-verified physical ${interactionRuntime.platform === "ios" ? "iPhone" : "Android device"}`,
          );
      } else if (surface.kind !== "native" && interaction.source === "browser-runtime") {
        const browserRuntime = browserRuntimeById.get(interaction.runtimeId);
        const browserReceipt = browserRuntime ? browserRuntimeReceiptById.get(browserRuntime.id) : undefined;
        const citedCaptures = interaction.captureIds.flatMap((id) => resolvedReview.captures.filter((capture) => capture.evidenceId === id));
        if (
          !browserRuntime ||
          !browserReceipt ||
          interaction.browser.name !== browserRuntime.browser.name ||
          interaction.browser.version !== browserRuntime.browser.version ||
          interaction.browserContextId !== browserRuntime.browserContextId ||
          interaction.os !== browserRuntime.os ||
          interaction.sessionId !== browserReceipt.sessionId ||
          time(interaction.executedAt) < (browserRuntimeReadyAt.get(interaction.runtimeId) ?? Number.POSITIVE_INFINITY) ||
          citedCaptures.some(
            (capture) =>
              capture.source !== "browser-runtime" ||
              capture.runtimeId !== interaction.runtimeId ||
              capture.browserContextId !== interaction.browserContextId ||
              capture.browser.name !== interaction.browser.name ||
              capture.browser.version !== interaction.browser.version ||
              capture.os !== interaction.os,
          )
        )
          fail("browser_runtime", `${surface.id}/${interaction.evidenceId} browser runtime does not match its receipt or cited captures`);
      }
      if (interaction.captureIds.some((id) => !resolvedReview.captures.some((capture) => capture.evidenceId === id && capture.locale === interaction.locale)))
        fail("interaction_capture", `${surface.id}/${interaction.evidenceId} references unknown or wrong-locale captures`);
    }
    for (const state of mandatory.filter((entry) => entry !== "default")) {
      for (const locale of surface.locales)
        if (
          !resolvedReview.interactions.some(
            (interaction) =>
              interaction.locale === locale &&
              interaction.captureIds.some((id) => resolvedReview.captures.some((capture) => capture.evidenceId === id && capture.state === state)),
          )
        )
          fail("interaction_state", `${surface.id} needs observed ${state} interaction evidence for ${locale}`);
    }
    for (const criterion of rubric.criteria) {
      if (criterion.referenceIds.some((id) => !rubric.references.some((ref) => ref.id === id)))
        fail("calibration", `${surface.id}/${criterion.id} cites unknown references`);
      const result = review.criteria.find((entry) => entry.id === criterion.id);
      if (!result) continue;
      if (result.verdict === "fails" || (criterion.minimum === "exceeds" && result.verdict !== "exceeds"))
        fail("criterion_floor", `${surface.id}/${criterion.id} does not ${criterion.minimum} its frozen reference criterion`);
      if (criterion.facet === "cross_surface_identity") {
        const cited = result.evidenceIds.map((id) => evidenceIndex.get(id));
        if (cited.some((entry) => !entry)) fail("criterion_evidence", `${surface.id}/${criterion.id} cites unknown evidence`);
        else if (
          !cited.some((entry) => entry!.surfaceId === surface.id && entry!.type === "capture") ||
          !cited.some((entry) => entry!.kind === "native" && entry!.type === "capture") ||
          !cited.some((entry) => entry!.kind === "landing" && entry!.type === "capture")
        )
          fail("criterion_evidence", `${surface.id}/${criterion.id} must compare its own current capture with both native and landing captures`);
      } else if (result.evidenceIds.some((id) => !evidenceIds.includes(id)))
        fail("criterion_evidence", `${surface.id}/${criterion.id} cites evidence from another surface`);
      if (
        ["functionality", "accessibility", "motion"].includes(criterion.facet) &&
        !result.evidenceIds.some((id) => resolvedReview.interactions.some((entry) => entry.evidenceId === id))
      )
        fail("criterion_evidence", `${surface.id}/${criterion.id} requires observed interaction evidence; screenshots alone are insufficient`);
    }
  }
  for (const runtime of report.nativeRuntimes)
    if (!usedNativeRuntimeIds.has(runtime.id)) fail("native_runtime", `Native runtime receipt is not used by an authored surface: ${runtime.id}`);
  for (const runtime of report.browserRuntimes)
    if (!usedBrowserRuntimeIds.has(runtime.id)) fail("browser_runtime", `Browser runtime receipt is not used by an authored surface: ${runtime.id}`);
  return issues;
}
