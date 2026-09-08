import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { openSync, closeSync, ftruncateSync, mkdirSync, readFileSync, rmSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { parse as parseYaml, stringify as yaml } from "yaml";
import {
  DESIGN_FACETS,
  designAcceptanceReportSchema,
  designBrowserBuildFingerprint,
  designCaptureReceiptSchema,
  designArtifact,
  designCandidateFingerprint,
  validateDesignAcceptance,
  validateDesignSourceReferences,
  selectDesignReference,
  type DesignCaptureReceipt,
  type DesignInteractionReceipt,
  type DesignAcceptanceReport,
  type DesignAcceptanceScope,
  type DesignBrowserBuildManifest,
  type DesignBrowserResourceManifest,
  type DesignBrowserRuntimeProofReceipt,
  type DesignRubric,
} from "../../validation/business/design/design-acceptance.js";
import { fingerprintAppSource } from "../../../kernel/engine/source-fingerprint.js";
import { outputFingerprintPath } from "../../../kernel/engine/artifact-fingerprint.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const NATIVE_EVIDENCE_WORKFLOW = "workflow.engineering.native-ios-proof-route-ladder";
const BROWSER_EVIDENCE_WORKFLOW = "workflow.growth.pre-launch-funnel-landing-waitlist";
const NATIVE_NODE_ID = "run.engineering.native-ios-proof-route-ladder";
const BROWSER_NODE_ID = "run.growth.pre-launch-funnel-landing-waitlist";
const AUDIT_NODE_ID = "run.design.implementation-craft-audit";
const AUDIT_ATTEMPT_ID = "attempt.implementation-craft-audit";
const AUDIT_SESSION_ID = "fresh-review-run";
const AUDIT_REPORT_ARTIFACT_ID = "artifact.design-proofs-design-acceptance-json";
const AUDIT_REVIEW_ARTIFACT_ID = "artifact.design-reviews-implementation-review-md";
const NATIVE_ATTEMPT_ID = "attempt.native-evidence";
const BROWSER_ATTEMPT_ID = "attempt.browser-evidence";
const NATIVE_SESSION_ID = "session.native-evidence-producer";
const BROWSER_SESSION_ID = "session.browser-evidence-producer";
const BROWSER_IDENTITY = { name: "Chromium", version: "140.0.0" };

function png(width: number, height: number): Buffer {
  const chunk = (name: string, data: Buffer): Buffer => {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    result.write(name, 4);
    data.copy(result, 8);
    let crc = 0xffffffff;
    for (const byte of result.subarray(4, data.length + 8)) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1), 128);
  for (let row = 0; row < height; row++) pixels[row * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function bindProducerEvidence(root: string, report: DesignAcceptanceReport): void {
  const nativeBindingFingerprint = outputFingerprintPath(path.join(root, "proof"));
  const browserBindingFingerprint = outputFingerprintPath(path.join(root, "growth/landing"));
  const nativeOutputFingerprint = createHash("sha256").update(nativeBindingFingerprint).digest("hex");
  const browserOutputFingerprint = createHash("sha256").update(browserBindingFingerprint).digest("hex");
  for (const reference of report.surfaces.flatMap((surface) => [...surface.captures, ...surface.interactions])) {
    const browser = reference.receipt.path.startsWith("growth/landing/proof/");
    reference.producer = browser
      ? { workflowId: BROWSER_EVIDENCE_WORKFLOW, attemptId: BROWSER_ATTEMPT_ID, outputFingerprint: browserOutputFingerprint }
      : { workflowId: NATIVE_EVIDENCE_WORKFLOW, attemptId: NATIVE_ATTEMPT_ID, outputFingerprint: nativeOutputFingerprint };
  }
  putFixtureFile(
    root,
    "run/run-state.json",
    JSON.stringify({
      schemaVersion: "1.0.0",
      artifactBindings: [
        {
          artifactId: "artifact.proof",
          path: "proof",
          fingerprint: nativeBindingFingerprint,
          accepted: true,
          producedBy: NATIVE_NODE_ID,
          attemptId: NATIVE_ATTEMPT_ID,
        },
        {
          artifactId: "artifact.growth-landing",
          path: "growth/landing",
          fingerprint: browserBindingFingerprint,
          accepted: true,
          producedBy: BROWSER_NODE_ID,
          attemptId: BROWSER_ATTEMPT_ID,
        },
      ],
      nodes: {
        [NATIVE_NODE_ID]: {
          nodeId: NATIVE_NODE_ID,
          status: "succeeded",
          acceptedOutputFingerprint: nativeOutputFingerprint,
          attempts: [{ id: NATIVE_ATTEMPT_ID, status: "succeeded", ownerSessionId: NATIVE_SESSION_ID }],
        },
        [BROWSER_NODE_ID]: {
          nodeId: BROWSER_NODE_ID,
          status: "succeeded",
          acceptedOutputFingerprint: browserOutputFingerprint,
          attempts: [{ id: BROWSER_ATTEMPT_ID, status: "succeeded", ownerSessionId: BROWSER_SESSION_ID }],
        },
      },
    }),
  );
}

function bindAuditEvidence(root: string): void {
  const runStatePath = path.join(root, "run/run-state.json");
  const run = JSON.parse(readFileSync(runStatePath, "utf8"));
  const reportFingerprint = outputFingerprintPath(path.join(root, "design/proofs/design-acceptance.json"));
  const reviewFingerprint = outputFingerprintPath(path.join(root, "design/reviews/IMPLEMENTATION_REVIEW.md"));
  run.artifactBindings = run.artifactBindings.filter(
    (binding: { artifactId?: string }) => ![AUDIT_REPORT_ARTIFACT_ID, AUDIT_REVIEW_ARTIFACT_ID].includes(binding.artifactId ?? ""),
  );
  run.artifactBindings.push(
    {
      artifactId: AUDIT_REPORT_ARTIFACT_ID,
      path: "design/proofs/design-acceptance.json",
      fingerprint: reportFingerprint,
      accepted: false,
      producedBy: AUDIT_NODE_ID,
      attemptId: AUDIT_ATTEMPT_ID,
    },
    {
      artifactId: AUDIT_REVIEW_ARTIFACT_ID,
      path: "design/reviews/IMPLEMENTATION_REVIEW.md",
      fingerprint: reviewFingerprint,
      accepted: false,
      producedBy: AUDIT_NODE_ID,
      attemptId: AUDIT_ATTEMPT_ID,
    },
  );
  run.nodes[AUDIT_NODE_ID] = {
    nodeId: AUDIT_NODE_ID,
    status: "blocked",
    blocker: "Verification required",
    attempts: [
      {
        id: AUDIT_ATTEMPT_ID,
        status: "blocked",
        ownerSessionId: AUDIT_SESSION_ID,
        startedAt: "2026-01-02T23:00:00Z",
        finishedAt: "2026-01-03T00:30:00Z",
      },
    ],
  };
  writeFileSync(runStatePath, JSON.stringify(run));
}

let fixtureSequence = 0;
function example(harness: Harness): { root: string; report: DesignAcceptanceReport; scope: DesignAcceptanceScope; save: () => void } {
  const root = harness.makeTempDir(`design-acceptance-${++fixtureSequence}`);
  const put = (relative: string, data: string | Buffer): void => {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), data);
  };
  put("app/Home.swift", "// Synthetic fixture source. Never real application proof.\n");
  put("web/index.html", "<h1>Synthetic fixture only</h1>\n");
  put("design/screens/home.md", "# Synthetic home screen contract\n\nThe primary action remains available in every declared state.\n");
  put("design/flows/complete-task.md", "# Synthetic complete-task flow\n\nActivate the primary action and observe the saved result.\n");
  put("product.yaml", yaml({ meta: { status: "accepted" }, instances: [{ id: "screen.home", class_id: "class.screen", slots: {} }] }));
  put(
    "studio/seed/business.json",
    JSON.stringify({
      surfaces: {
        mobileApp: { platforms: ["ios"], screens: [{ id: "home", status: "ready" }] },
        landingPages: [{ id: "landing", status: "ready" }],
        webFunnels: [],
      },
    }),
  );
  put("design/reference-packs/visual.png", png(390, 844));
  put("design/reference-packs/behavior.md", "Synthetic behavior reference for parser integrity tests only.\n");
  const rubric: DesignRubric = {
    schemaVersion: 2,
    id: "reference-calibrated",
    frozenAt: "2026-01-01T00:00:00Z",
    references: [
      {
        id: "visual",
        resolution: { status: "retained_snapshot", observedAt: "2025-12-31T00:00:00Z", provider: "synthetic-fixture", sourceId: "visual" },
        url: "https://example.com/visual",
        kind: "visual",
        artifact: designArtifact(root, "design/reference-packs/visual.png"),
        observation: "The source has a clear dominant action with a quiet content hierarchy.",
      },
      {
        id: "behavior",
        resolution: { status: "retained_snapshot", observedAt: "2025-12-31T00:00:00Z", provider: "synthetic-fixture", sourceId: "behavior" },
        url: "https://example.com/behavior",
        kind: "documentation",
        artifact: designArtifact(root, "design/reference-packs/behavior.md"),
        observation: "The source explains keyboard and screen-reader behavior for the primary task.",
      },
    ],
    criteria: DESIGN_FACETS.map((facet) => ({
      id: facet,
      facet,
      minimum: "meets",
      condition: `Observe the product-specific ${facet} criterion during the complete user task.`,
      referenceIds: ["visual", "behavior"],
    })),
  };
  put("design/reviews/rubrics/surface.md", `---\n${yaml({ designRubric: rubric })}---\n# Frozen synthetic fixture rubric\n`);
  const scope: DesignAcceptanceScope = {
    schemaVersion: 1,
    status: "accepted",
    exclusions: [],
    designContractPaths: ["design/screens/home.md", "design/flows/complete-task.md"],
    surfaces: ["native", "mobile", "desktop"].map((kind) => ({
      id: kind,
      surfaceId: kind === "native" ? "home" : "landing",
      kind: kind === "native" ? "native" : "landing",
      platform: kind === "native" ? "ios" : "web",
      viewport: kind as "native" | "mobile" | "desktop",
      ...(kind === "native" ? {} : { routePath: "/index.html" }),
      productScreenIds: kind === "native" ? ["screen.home"] : [],
      implementationPaths: [kind === "native" ? "app" : "web"],
      rubricPath: "design/reviews/rubrics/surface.md",
      locales: ["en-US"],
      states: ["default", "reduced-motion", ...(kind === "native" ? ["large-text", "screen-reader"] : ["no-js", "keyboard"])],
      stateExclusions: ["loading", "empty", "error", "offline", "permission-denied"].map((state) => ({
        state,
        reason: "Synthetic fixture excludes this state to exercise applicability parsing only.",
      })),
      interactions:
        kind === "native"
          ? [
              {
                id: "complete-task",
                action: "Activate the primary task using the default, reduced-motion, and large-text settings.",
                expected: "The task completes with visible feedback and accessible status in each tested state.",
              },
              {
                id: "voiceover-complete-task",
                action: "Activate the primary task with VoiceOver enabled on a physical iPhone.",
                expected: "VoiceOver announces focus, action, and completion on the receipt-verified physical device.",
              },
            ]
          : [
              {
                id: "complete-task",
                action: "Activate the primary task using each declared accessibility setting.",
                expected: "The task completes with visible feedback and accessible status in every state.",
              },
            ],
    })),
  };
  const template = readFileSync(path.join(skillRoot, "examples/workspace/business/DESIGN.md"), "utf8");
  const frontmatter = template.match(/^---\n([\s\S]*?)\n---/)![1]!;
  put(
    "DESIGN.md",
    `${template.replace(/^---\n([\s\S]*?)\n---/, `---\n${yaml({ ...parseYaml(frontmatter), acceptance: scope })}---`)}\n` +
      `[Synthetic home contract](design/screens/home.md)\n[Complete task contract](design/flows/complete-task.md)\n`,
  );
  const candidateSha256 = designCandidateFingerprint(root, scope);
  const simulatorRuntimeId = "ios-simulator-runtime-42";
  const physicalRuntimeId = "ios-physical-runtime-42";
  const executableSha256 = "a".repeat(64);
  const bundleContentSha256 = "b".repeat(64);
  const sourceRoot = path.join(root, "app");
  const sourceFingerprint = fingerprintAppSource(sourceRoot, ["Home.swift"]);
  const deviceId = "00000000-0000-0000-0000-000000000042";
  const simulatorProofPath = "proof/ios-simulator/complete-task.json";
  put(
    simulatorProofPath,
    JSON.stringify({
      rung: "rung-2-xcodebuild",
      platform: "ios",
      target: "ios-simulator",
      reasonForRung: "Synthetic local iOS fixture with Xcode command-line tools available.",
      flow: "complete-task",
      verificationScope: "adapter-actions-only",
      steps: [
        { name: "boot_simulator", ok: true },
        { name: "boot_ready", ok: true },
        { name: "resolve_product", ok: true },
        { name: "build", ok: true },
        { name: "verify_build", ok: true },
        { name: "install", ok: true },
        {
          name: "verify_install",
          ok: true,
          installedBuild: {
            deviceId,
            bundleId: "com.example.synthetic",
            buildNumber: "42",
            scheme: "Synthetic",
            projectPath: "app/Synthetic.xcodeproj",
            derivedDataPath: "/tmp/synthetic-derived-data",
            appPath: "/tmp/synthetic-derived-data/Synthetic.app",
            appFingerprint: "d".repeat(64),
            bundleContentSha256,
            installedAppPath: "/tmp/synthetic-device/Synthetic.app",
            executable: { path: "Synthetic", sha256: executableSha256 },
            source: { root: sourceRoot, roots: ["Home.swift"], fingerprint: sourceFingerprint },
          },
        },
        { name: "launch", ok: true },
        { name: "screenshot", ok: true, screenshotPath: "/tmp/synthetic-proof.png" },
      ],
      verdict: "passed",
      startedAt: "2026-01-02T00:05:00Z",
      finishedAt: "2026-01-02T00:30:00Z",
    }),
  );
  const physicalDeviceId = "00008110-001A42D80A42001E";
  const physicalModelIdentifier = "iPhone17,1";
  const physicalOsVersion = "iOS 26.5";
  const physicalOsBuild = "23F42";
  const physicalEvidencePaths = {
    buildLog: "proof/ios-device/build.log",
    installLog: "proof/ios-device/install.log",
    deviceReadback: "proof/ios-device/device-readback.json",
    launchLog: "proof/ios-device/launch.log",
  };
  put(physicalEvidencePaths.buildLog, "Synthetic Xcode physical-device build transcript.\n");
  put(physicalEvidencePaths.installLog, "Synthetic physical iPhone install transcript.\n");
  put(
    physicalEvidencePaths.deviceReadback,
    JSON.stringify({
      deviceId: physicalDeviceId,
      modelIdentifier: physicalModelIdentifier,
      osVersion: physicalOsVersion,
      osBuild: physicalOsBuild,
      bundleId: "com.example.synthetic",
      buildNumber: "42",
    }),
  );
  put(physicalEvidencePaths.launchLog, "Synthetic physical iPhone launch transcript.\n");
  const physicalProofPath = "proof/ios-device/complete-task.json";
  put(
    physicalProofPath,
    JSON.stringify({
      schemaVersion: 1,
      kind: "physical-ios-install",
      platform: "ios",
      flow: "complete-task",
      candidateSha256,
      tool: { name: "synthetic-device-runner", version: "1.0.0" },
      sessionId: "synthetic-physical-device-session",
      device: {
        id: physicalDeviceId,
        physical: true,
        deviceClass: "iphone",
        modelIdentifier: physicalModelIdentifier,
        osVersion: physicalOsVersion,
        osBuild: physicalOsBuild,
      },
      builtApp: {
        appPath: "/tmp/synthetic-device-build/Synthetic.app",
        bundleId: "com.example.synthetic",
        buildNumber: "42",
        executable: { path: "Synthetic", sha256: executableSha256 },
        bundleContentSha256,
        source: { root: sourceRoot, roots: ["Home.swift"], fingerprint: sourceFingerprint },
      },
      install: {
        appPath: "/tmp/synthetic-device-build/Synthetic.app",
        bundleId: "com.example.synthetic",
        buildNumber: "42",
        executableSha256,
        bundleContentSha256,
        installedAt: "2026-01-02T00:40:00Z",
      },
      installedAppReadback: { bundleId: "com.example.synthetic", buildNumber: "42", readAt: "2026-01-02T00:42:00Z" },
      launch: { bundleId: "com.example.synthetic", launchedAt: "2026-01-02T00:44:00Z" },
      evidence: Object.fromEntries(Object.entries(physicalEvidencePaths).map(([key, value]) => [key, designArtifact(root, value)])),
      verdict: "passed",
      startedAt: "2026-01-02T00:31:00Z",
      finishedAt: "2026-01-02T00:45:00Z",
    }),
  );
  const browserRuntimeId = "browser-runtime-42";
  const browserContextId = "browser-context-42";
  const browserOs = "Synthetic Browser OS 1.0";
  const browserOrigin = "http://127.0.0.1:4179";
  const browserDocumentUrl = `${browserOrigin}/index.html`;
  const browserSourceFingerprint = fingerprintAppSource(root, ["web"]);
  const browserEntrypoint = designArtifact(root, "web/index.html");
  const browserBuildManifest: DesignBrowserBuildManifest = {
    schemaVersion: 1,
    sourceFingerprint: browserSourceFingerprint,
    entrypoint: browserEntrypoint,
    files: [browserEntrypoint],
  };
  const browserBuildManifestPath = "growth/landing/proof/runtime/build-manifest.json";
  put(browserBuildManifestPath, JSON.stringify(browserBuildManifest));
  const browserResponsePath = "growth/landing/proof/runtime/responses/index.html";
  put(browserResponsePath, readFileSync(path.join(root, "web/index.html")));
  const browserResourceManifest: DesignBrowserResourceManifest = {
    schemaVersion: 1,
    origin: browserOrigin,
    documentUrl: browserDocumentUrl,
    browserContextId,
    resources: [{ url: browserDocumentUrl, buildPath: "web/index.html", response: designArtifact(root, browserResponsePath) }],
  };
  const browserResourceManifestPath = "growth/landing/proof/runtime/resource-manifest.json";
  put(browserResourceManifestPath, JSON.stringify(browserResourceManifest));
  const browserLaunchTranscriptPath = "growth/landing/proof/runtime/browser-launch.log";
  const browserNavigationTranscriptPath = "growth/landing/proof/runtime/browser-navigation.log";
  put(browserLaunchTranscriptPath, "Synthetic browser launch transcript for the isolated fixture context.\n");
  put(browserNavigationTranscriptPath, `Synthetic navigation transcript for ${browserDocumentUrl}.\n`);
  const browserRuntimeReceiptPath = "growth/landing/proof/runtime/browser-runtime.json";
  const browserRuntimeReceipt: DesignBrowserRuntimeProofReceipt = {
    schemaVersion: 1,
    kind: "browser-runtime-launch",
    platform: "web",
    candidateSha256,
    tool: { name: "synthetic-browser-runner", version: "1.0.0" },
    sessionId: BROWSER_SESSION_ID,
    source: { root, roots: ["web"], fingerprint: browserSourceFingerprint },
    build: {
      fingerprint: designBrowserBuildFingerprint(browserBuildManifest),
      manifest: designArtifact(root, browserBuildManifestPath),
    },
    served: {
      origin: browserOrigin,
      url: browserDocumentUrl,
      resourceManifest: designArtifact(root, browserResourceManifestPath),
    },
    context: { id: browserContextId, browser: BROWSER_IDENTITY, os: browserOs },
    launch: {
      startedAt: "2026-01-02T00:46:00Z",
      finishedAt: "2026-01-02T00:47:00Z",
      transcript: designArtifact(root, browserLaunchTranscriptPath),
    },
    navigation: {
      requestedUrl: browserDocumentUrl,
      finalUrl: browserDocumentUrl,
      statusCode: 200,
      startedAt: "2026-01-02T00:48:00Z",
      finishedAt: "2026-01-02T00:49:00Z",
      transcript: designArtifact(root, browserNavigationTranscriptPath),
    },
    verdict: "passed",
    startedAt: "2026-01-02T00:46:00Z",
    finishedAt: "2026-01-02T00:50:00Z",
  };
  put(browserRuntimeReceiptPath, JSON.stringify(browserRuntimeReceipt));
  const simulatorDevice = {
    id: deviceId,
    modelIdentifier: "iPhone17,1-simulator",
    osVersion: "iOS 26.5 Simulator",
    osBuild: "23F42-sim",
  };
  const physicalDevice = {
    id: physicalDeviceId,
    modelIdentifier: physicalModelIdentifier,
    osVersion: physicalOsVersion,
    osBuild: physicalOsBuild,
  };
  const emptyProducer = { workflowId: NATIVE_EVIDENCE_WORKFLOW, attemptId: NATIVE_ATTEMPT_ID, outputFingerprint: "0".repeat(64) };
  const report: DesignAcceptanceReport = {
    schemaVersion: 1,
    sources: ["product.yaml", "DESIGN.md", "studio/seed/business.json", ...scope.designContractPaths].map((p) => designArtifact(root, p)),
    candidate: { sha256: candidateSha256, producedAt: "2026-01-02T00:00:00Z", producer: { id: "producer", sessionId: "production-run" } },
    nativeRuntimes: [
      {
        id: simulatorRuntimeId,
        target: "simulator",
        platform: "ios",
        candidateSha256,
        bundleId: "com.example.synthetic",
        buildNumber: "42",
        executableSha256,
        bundleContentSha256,
        sourceFingerprint,
        deviceId,
        receipt: designArtifact(root, simulatorProofPath),
      },
      {
        id: physicalRuntimeId,
        target: "physical-device",
        platform: "ios",
        candidateSha256,
        bundleId: "com.example.synthetic",
        buildNumber: "42",
        executableSha256,
        bundleContentSha256,
        sourceFingerprint,
        deviceId: physicalDeviceId,
        deviceModelIdentifier: physicalModelIdentifier,
        osVersion: physicalOsVersion,
        osBuild: physicalOsBuild,
        receipt: designArtifact(root, physicalProofPath),
      },
    ],
    browserRuntimes: [
      {
        id: browserRuntimeId,
        platform: "web",
        candidateSha256,
        sourceFingerprint: browserSourceFingerprint,
        buildFingerprint: browserRuntimeReceipt.build.fingerprint,
        origin: browserOrigin,
        url: browserDocumentUrl,
        browser: BROWSER_IDENTITY,
        browserContextId,
        os: browserOs,
        launchTranscriptSha256: browserRuntimeReceipt.launch.transcript.sha256,
        navigationTranscriptSha256: browserRuntimeReceipt.navigation.transcript.sha256,
        receipt: designArtifact(root, browserRuntimeReceiptPath),
      },
    ],
    reviewer: { id: "independent-reviewer", sessionId: "fresh-review-run" },
    reviewedAt: "2026-01-03T00:00:00Z",
    verdict: "pass",
    findings: [],
    surfaces: scope.surfaces.map((surface) => {
      const width = surface.viewport === "desktop" ? 1200 : 390;
      const captureFacts = surface.states.map((state): DesignCaptureReceipt => {
        const evidenceId = `${surface.id}-${state}`;
        const nativeRoot = state === "screen-reader" ? "proof/ios-device" : "proof/ios-simulator";
        const producerRoot = surface.kind === "native" ? nativeRoot : "growth/landing/proof";
        const artifactPath = `${producerRoot}/captures/${evidenceId}.png`;
        const receiptPath = `${producerRoot}/receipts/${evidenceId}.capture.json`;
        put(artifactPath, png(width, 844));
        const common = {
          schemaVersion: 1 as const,
          kind: "design-capture" as const,
          surfaceId: surface.id,
          evidenceId,
          state,
          locale: "en-US",
          artifact: designArtifact(root, artifactPath),
          capturedAt: "2026-01-02T01:00:00Z",
          candidateSha256,
          tool: { name: "synthetic-capture-runner", version: "1.0.0" },
          sessionId: surface.kind === "native" ? NATIVE_SESSION_ID : BROWSER_SESSION_ID,
          dimensions: { width, height: 844 },
          viewport: { width, height: 844 },
          scale: 1,
          settings: {
            reducedMotion: state === "reduced-motion",
            screenReader: state === "screen-reader",
            largeText: state === "large-text",
            javascript: state !== "no-js",
          },
        };
        const receipt: DesignCaptureReceipt =
          surface.kind === "native"
            ? {
                ...common,
                source: "native-runtime",
                runtimeId: state === "screen-reader" ? physicalRuntimeId : simulatorRuntimeId,
                platform: "ios",
                device: state === "screen-reader" ? physicalDevice : simulatorDevice,
              }
            : {
                ...common,
                source: "browser-runtime",
                runtimeId: browserRuntimeId,
                platform: "web",
                browser: BROWSER_IDENTITY,
                browserContextId,
                os: browserOs,
              };
        put(receiptPath, JSON.stringify(receipt));
        return receipt;
      });
      const captureReferences = captureFacts.map((capture) => ({
        id: capture.evidenceId,
        receipt: designArtifact(
          root,
          `${surface.kind === "native" ? (capture.source === "native-runtime" && capture.runtimeId === physicalRuntimeId ? "proof/ios-device" : "proof/ios-simulator") : "growth/landing/proof"}/receipts/${capture.evidenceId}.capture.json`,
        ),
        producer: structuredClone(emptyProducer),
      }));
      const interactionFacts: DesignInteractionReceipt[] = [];
      const writeInteraction = (
        evidenceId: string,
        interactionId: string,
        captureIds: string[],
        producerRoot: string,
        runtime: { id: string; device: typeof simulatorDevice } | undefined,
        observation: string,
      ): void => {
        const artifactPath = `${producerRoot}/interactions/${evidenceId}.log`;
        const receiptPath = `${producerRoot}/receipts/${evidenceId}.interaction.json`;
        put(artifactPath, `Synthetic interaction log for ${evidenceId}.\n`);
        const common = {
          schemaVersion: 1 as const,
          kind: "design-interaction" as const,
          surfaceId: surface.id,
          evidenceId,
          interactionId,
          locale: "en-US",
          executedAt: "2026-01-02T01:00:00Z",
          candidateSha256,
          artifact: designArtifact(root, artifactPath),
          tool: { name: "synthetic-interaction-runner", version: "1.0.0" },
          sessionId: surface.kind === "native" ? NATIVE_SESSION_ID : BROWSER_SESSION_ID,
          captureIds,
          result: "pass" as const,
          observation,
        };
        const receipt: DesignInteractionReceipt = runtime
          ? { ...common, source: "native-runtime", runtimeId: runtime.id, platform: "ios", device: runtime.device }
          : {
              ...common,
              source: "browser-runtime",
              runtimeId: browserRuntimeId,
              platform: "web",
              browser: BROWSER_IDENTITY,
              browserContextId,
              os: browserOs,
            };
        put(receiptPath, JSON.stringify(receipt));
        interactionFacts.push(receipt);
      };
      const ordinaryId = `${surface.id}-run`;
      if (surface.kind === "native") {
        writeInteraction(
          ordinaryId,
          "complete-task",
          captureFacts.filter((capture) => capture.state !== "screen-reader").map((capture) => capture.evidenceId),
          "proof/ios-simulator",
          { id: simulatorRuntimeId, device: simulatorDevice },
          "Synthetic simulator interaction covers ordinary and non-VoiceOver fixture states only.",
        );
        writeInteraction(
          `${surface.id}-voiceover-run`,
          "voiceover-complete-task",
          captureFacts.filter((capture) => capture.state === "screen-reader").map((capture) => capture.evidenceId),
          "proof/ios-device",
          { id: physicalRuntimeId, device: physicalDevice },
          "Synthetic physical-device interaction covers the VoiceOver fixture state only.",
        );
      } else {
        writeInteraction(
          ordinaryId,
          "complete-task",
          captureFacts.map((capture) => capture.evidenceId),
          "growth/landing/proof",
          undefined,
          "Synthetic fixture supplies structurally valid observations; no real app was evaluated.",
        );
      }
      const interactionReferences = interactionFacts.map((interaction) => {
        const producerRoot =
          interaction.source === "browser-runtime"
            ? "growth/landing/proof"
            : interaction.runtimeId === physicalRuntimeId
              ? "proof/ios-device"
              : "proof/ios-simulator";
        return {
          id: interaction.evidenceId,
          receipt: designArtifact(root, `${producerRoot}/receipts/${interaction.evidenceId}.interaction.json`),
          producer: structuredClone(emptyProducer),
        };
      });
      return {
        id: surface.id,
        runtimeIds: surface.kind === "native" ? [simulatorRuntimeId, physicalRuntimeId] : [browserRuntimeId],
        rubric: designArtifact(root, surface.rubricPath),
        captures: captureReferences,
        interactions: interactionReferences,
        criteria: rubric.criteria.map((criterion) => ({
          id: criterion.id,
          verdict: "meets",
          observation: "Synthetic fixture observation tests acceptance integrity, not the quality of this image.",
          evidenceIds: [captureReferences[0]!.id, ordinaryId],
        })),
      };
    }),
  };
  const nativeEvidence = report.surfaces.find((surface) => surface.id === "native")!.captures[0]!.id;
  const landingEvidence = report.surfaces.find((surface) => surface.id === "mobile")!.captures[0]!.id;
  for (const surface of report.surfaces) {
    const criterion = surface.criteria.find((entry) => entry.id === "cross_surface_identity")!;
    criterion.evidenceIds = [...new Set([surface.captures[0]!.id, nativeEvidence, landingEvidence])];
  }
  bindProducerEvidence(root, report);
  const save = (): void => {
    const reportText = JSON.stringify(report);
    put("design/proofs/design-acceptance.json", reportText);
    const reportSha256 = createHash("sha256").update(reportText).digest("hex");
    put(
      "design/reviews/IMPLEMENTATION_REVIEW.md",
      `# Synthetic implementation review\n\nAcceptance report SHA-256: ${reportSha256}\n\nThe independent fixture review cites producer-owned evidence receipts.\n`,
    );
    bindAuditEvidence(root);
  };
  save();
  return { root, report, scope, save };
}

type AcceptanceFixture = ReturnType<typeof example>;
type SurfaceReview = DesignAcceptanceReport["surfaces"][number];
type AndroidNativeRuntime = Extract<DesignAcceptanceReport["nativeRuntimes"][number], { platform: "android" }>;
type BrowserRuntime = DesignAcceptanceReport["browserRuntimes"][number];
type CaptureReference = SurfaceReview["captures"][number];
type InteractionReference = SurfaceReview["interactions"][number];

function captureReceipt(fixture: AcceptanceFixture, reference: CaptureReference): DesignCaptureReceipt {
  return JSON.parse(readFileSync(path.join(fixture.root, reference.receipt.path), "utf8")) as DesignCaptureReceipt;
}

function interactionReceipt(fixture: AcceptanceFixture, reference: InteractionReference): DesignInteractionReceipt {
  return JSON.parse(readFileSync(path.join(fixture.root, reference.receipt.path), "utf8")) as DesignInteractionReceipt;
}

function writeCaptureReceipt(fixture: AcceptanceFixture, reference: CaptureReference, receipt: DesignCaptureReceipt): void {
  writeFileSync(path.join(fixture.root, reference.receipt.path), JSON.stringify(receipt));
  reference.receipt = designArtifact(fixture.root, reference.receipt.path);
}

function writeInteractionReceipt(fixture: AcceptanceFixture, reference: InteractionReference, receipt: DesignInteractionReceipt): void {
  writeFileSync(path.join(fixture.root, reference.receipt.path), JSON.stringify(receipt));
  reference.receipt = designArtifact(fixture.root, reference.receipt.path);
}

function browserRuntimeReceipt(fixture: AcceptanceFixture, runtime: BrowserRuntime = fixture.report.browserRuntimes[0]!): DesignBrowserRuntimeProofReceipt {
  return JSON.parse(readFileSync(path.join(fixture.root, runtime.receipt.path), "utf8")) as DesignBrowserRuntimeProofReceipt;
}

function writeBrowserRuntimeReceipt(fixture: AcceptanceFixture, runtime: BrowserRuntime, receipt: DesignBrowserRuntimeProofReceipt): void {
  writeFileSync(path.join(fixture.root, runtime.receipt.path), JSON.stringify(receipt));
  runtime.receipt = designArtifact(fixture.root, runtime.receipt.path);
}

function putFixtureFile(root: string, relative: string, data: string | Buffer): void {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), data);
}

function writeAcceptanceScope(root: string, scope: DesignAcceptanceScope): void {
  const designPath = path.join(root, "DESIGN.md");
  const text = readFileSync(designPath, "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)![1]!;
  putFixtureFile(root, "DESIGN.md", text.replace(/^---\n([\s\S]*?)\n---/, `---\n${yaml({ ...parseYaml(frontmatter), acceptance: scope })}---`));
}

/** Add receipt-complete Android coverage without weakening the existing iOS fixture. */
function addAndroidCoverage(fixture: AcceptanceFixture, keepIos: boolean): void {
  const { root, report, scope } = fixture;
  const sourceRelative = "src/main/kotlin/com/example/synthetic/MainActivity.kt";
  putFixtureFile(root, `app/${sourceRelative}`, "// Synthetic Android fixture source. Never real application proof.\n");

  const studioPath = "studio/seed/business.json";
  const studio = JSON.parse(readFileSync(path.join(root, studioPath), "utf8"));
  studio.surfaces.mobileApp.platforms = keepIos ? ["ios", "android"] : ["android"];
  putFixtureFile(root, studioPath, JSON.stringify(studio));

  const existingNativeScope = scope.surfaces.find((surface) => surface.kind === "native")!;
  const androidSurfaceId = keepIos ? "native-android" : existingNativeScope.id;
  const androidScope = {
    ...structuredClone(existingNativeScope),
    id: androidSurfaceId,
    platform: "android",
    interactions: existingNativeScope.interactions.map((interaction) => ({
      ...interaction,
      action: interaction.action.replace("VoiceOver", "TalkBack").replace("physical iPhone", "physical Android device"),
      expected: interaction.expected.replace("VoiceOver", "TalkBack").replace("physical device", "physical Android device"),
    })),
  };
  if (keepIos) scope.surfaces.push(androidScope);
  else Object.assign(existingNativeScope, androidScope);
  writeAcceptanceScope(root, scope);

  const candidateSha256 = designCandidateFingerprint(root, scope);
  report.candidate.sha256 = candidateSha256;
  for (const surface of report.surfaces) {
    for (const reference of surface.captures) {
      const receipt = captureReceipt(fixture, reference);
      receipt.candidateSha256 = candidateSha256;
      writeCaptureReceipt(fixture, reference, receipt);
    }
    for (const reference of surface.interactions) {
      const receipt = interactionReceipt(fixture, reference);
      receipt.candidateSha256 = candidateSha256;
      writeInteractionReceipt(fixture, reference, receipt);
    }
  }

  const iosRuntimes = keepIos ? report.nativeRuntimes.filter((runtime) => runtime.platform === "ios") : [];
  for (const runtime of iosRuntimes) {
    runtime.candidateSha256 = candidateSha256;
    if (runtime.target !== "physical-device") continue;
    const receiptPath = path.join(root, runtime.receipt.path);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.candidateSha256 = candidateSha256;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    runtime.receipt = designArtifact(root, runtime.receipt.path);
  }
  for (const runtime of report.browserRuntimes) {
    runtime.candidateSha256 = candidateSha256;
    const receiptPath = path.join(root, runtime.receipt.path);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.candidateSha256 = candidateSha256;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    runtime.receipt = designArtifact(root, runtime.receipt.path);
  }

  const packageName = "com.example.synthetic";
  const versionCode = 42;
  const sourceRoot = root;
  const sourceRoots = [
    ...new Set(
      scope.surfaces.filter((surface) => surface.kind === "native" && surface.platform === "android").flatMap((surface) => surface.implementationPaths),
    ),
  ].sort();
  const sourceFingerprint = fingerprintAppSource(sourceRoot, sourceRoots);
  const emulator = {
    id: "emulator-5554",
    modelIdentifier: "Pixel_9_API_35",
    apiLevel: 35,
    osVersion: "Android 15",
    osBuild: "AP3A.241105.008",
  };
  const physical = {
    id: "R5CW42ANDROID",
    modelIdentifier: "SM-S938U1",
    apiLevel: 35,
    osVersion: "Android 15",
    osBuild: "AP3A.241105.008.S938U1UEU1AXK4",
  };
  const emulatorApkPath = "proof/android-emulator/app-debug.apk";
  const aabPath = "proof/android-device/app-release.aab";
  const physicalApkPath = "proof/android-device/app-release-universal.apk";
  putFixtureFile(root, emulatorApkPath, "Synthetic Android emulator APK bytes.\n");
  putFixtureFile(root, aabPath, "Synthetic Android App Bundle bytes.\n");
  putFixtureFile(root, physicalApkPath, "Synthetic universal APK derived from the fixture AAB.\n");
  const apkSha256 = designArtifact(root, emulatorApkPath).sha256;
  const aabSha256 = designArtifact(root, aabPath).sha256;
  const derivedApkSha256 = designArtifact(root, physicalApkPath).sha256;

  const evidenceFor = (
    folder: string,
    label: string,
  ): Record<"buildLog" | "installLog" | "deviceReadback" | "launchLog", ReturnType<typeof designArtifact>> => {
    const paths = {
      buildLog: `proof/${folder}/build.log`,
      installLog: `proof/${folder}/install.log`,
      deviceReadback: `proof/${folder}/device-readback.json`,
      launchLog: `proof/${folder}/launch.log`,
    };
    putFixtureFile(root, paths.buildLog, `Synthetic ${label} Android build transcript.\n`);
    putFixtureFile(root, paths.installLog, `Synthetic ${label} Android install transcript.\n`);
    putFixtureFile(root, paths.deviceReadback, `{"synthetic":"${label} Android package readback"}\n`);
    putFixtureFile(root, paths.launchLog, `Synthetic ${label} Android launch transcript.\n`);
    return Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, designArtifact(root, value)])) as Record<
      "buildLog" | "installLog" | "deviceReadback" | "launchLog",
      ReturnType<typeof designArtifact>
    >;
  };

  const emulatorEvidence = evidenceFor("android-emulator", "emulator");
  const emulatorProofPath = "proof/android-emulator/complete-task.json";
  putFixtureFile(
    root,
    emulatorProofPath,
    JSON.stringify({
      schemaVersion: 1,
      kind: "android-emulator-install",
      platform: "android",
      target: "emulator",
      flow: "complete-task",
      candidateSha256,
      tool: { name: "synthetic-adb-runner", version: "1.0.0" },
      sessionId: "synthetic-android-emulator-session",
      device: { ...emulator, physical: false, deviceClass: "android-emulator" },
      builtPackage: {
        packageName,
        versionCode,
        artifact: { format: "apk", path: emulatorApkPath, sha256: apkSha256 },
        source: { root: sourceRoot, roots: sourceRoots, fingerprint: sourceFingerprint },
      },
      install: {
        deviceId: emulator.id,
        apkPath: emulatorApkPath,
        apkSha256,
        packageName,
        versionCode,
        installedAt: "2026-01-02T00:20:00Z",
      },
      installedAppReadback: { deviceId: emulator.id, packageName, versionCode, readAt: "2026-01-02T00:22:00Z" },
      launch: {
        deviceId: emulator.id,
        packageName,
        activity: ".MainActivity",
        launchedAt: "2026-01-02T00:24:00Z",
      },
      evidence: emulatorEvidence,
      verdict: "passed",
      startedAt: "2026-01-02T00:05:00Z",
      finishedAt: "2026-01-02T00:25:00Z",
    }),
  );

  const physicalEvidence = evidenceFor("android-device", "physical-device");
  const conversionPath = "proof/android-device/bundletool.log";
  putFixtureFile(root, conversionPath, "Synthetic bundletool AAB-to-universal-APK conversion transcript.\n");
  const physicalProofPath = "proof/android-device/complete-task.json";
  putFixtureFile(
    root,
    physicalProofPath,
    JSON.stringify({
      schemaVersion: 1,
      kind: "physical-android-install",
      platform: "android",
      target: "physical-device",
      flow: "complete-task",
      candidateSha256,
      tool: { name: "synthetic-adb-runner", version: "1.0.0" },
      sessionId: "synthetic-android-device-session",
      device: { ...physical, physical: true, deviceClass: "android-device" },
      builtPackage: {
        packageName,
        versionCode,
        artifact: {
          format: "aab",
          path: aabPath,
          sha256: aabSha256,
          installApk: { path: physicalApkPath, sha256: derivedApkSha256 },
          conversionEvidence: designArtifact(root, conversionPath),
        },
        source: { root: sourceRoot, roots: sourceRoots, fingerprint: sourceFingerprint },
      },
      install: {
        deviceId: physical.id,
        apkPath: physicalApkPath,
        apkSha256: derivedApkSha256,
        packageName,
        versionCode,
        installedAt: "2026-01-02T00:40:00Z",
      },
      installedAppReadback: { deviceId: physical.id, packageName, versionCode, readAt: "2026-01-02T00:42:00Z" },
      launch: {
        deviceId: physical.id,
        packageName,
        activity: ".MainActivity",
        launchedAt: "2026-01-02T00:44:00Z",
      },
      evidence: physicalEvidence,
      verdict: "passed",
      startedAt: "2026-01-02T00:30:00Z",
      finishedAt: "2026-01-02T00:45:00Z",
    }),
  );

  const androidRuntimes: AndroidNativeRuntime[] = [
    {
      id: "android-emulator-runtime-42",
      target: "emulator",
      platform: "android",
      candidateSha256,
      packageName,
      versionCode,
      packageArtifact: { format: "apk", sha256: apkSha256 },
      installApkSha256: apkSha256,
      sourceFingerprint,
      deviceId: emulator.id,
      deviceModelIdentifier: emulator.modelIdentifier,
      apiLevel: emulator.apiLevel,
      osVersion: emulator.osVersion,
      osBuild: emulator.osBuild,
      receipt: designArtifact(root, emulatorProofPath),
    },
    {
      id: "android-physical-runtime-42",
      target: "physical-device",
      platform: "android",
      candidateSha256,
      packageName,
      versionCode,
      packageArtifact: { format: "aab", sha256: aabSha256 },
      installApkSha256: derivedApkSha256,
      sourceFingerprint,
      deviceId: physical.id,
      deviceModelIdentifier: physical.modelIdentifier,
      apiLevel: physical.apiLevel,
      osVersion: physical.osVersion,
      osBuild: physical.osBuild,
      receipt: designArtifact(root, physicalProofPath),
    },
  ];
  report.nativeRuntimes = [...iosRuntimes, ...androidRuntimes];

  const priorNativeReview = report.surfaces.find((surface) => surface.id === existingNativeScope.id)!;
  const androidCaptureReceipts = androidScope.states.map((state): DesignCaptureReceipt => {
    const evidenceId = `${androidSurfaceId}-${state}`;
    const runtime = state === "screen-reader" ? androidRuntimes[1]! : androidRuntimes[0]!;
    const producerRoot = runtime.target === "physical-device" ? "proof/android-device" : "proof/android-emulator";
    const artifactPath = `${producerRoot}/captures/${evidenceId}.png`;
    const receiptPath = `${producerRoot}/receipts/${evidenceId}.capture.json`;
    putFixtureFile(root, artifactPath, png(390, 844));
    const receipt: DesignCaptureReceipt = {
      schemaVersion: 1,
      kind: "design-capture",
      surfaceId: androidSurfaceId,
      evidenceId,
      state,
      locale: "en-US",
      artifact: designArtifact(root, artifactPath),
      capturedAt: "2026-01-02T01:00:00Z",
      candidateSha256,
      runtimeId: runtime.id,
      source: "native-runtime",
      platform: "android",
      tool: { name: "synthetic-android-capture-runner", version: "1.0.0" },
      sessionId: NATIVE_SESSION_ID,
      device: {
        id: runtime.deviceId,
        modelIdentifier: runtime.deviceModelIdentifier,
        osVersion: runtime.osVersion,
        osBuild: runtime.osBuild,
      },
      dimensions: { width: 390, height: 844 },
      viewport: { width: 390, height: 844 },
      scale: 1,
      settings: {
        reducedMotion: state === "reduced-motion",
        screenReader: state === "screen-reader",
        largeText: state === "large-text",
        javascript: true,
      },
    };
    putFixtureFile(root, receiptPath, JSON.stringify(receipt));
    return receipt;
  });
  const androidCaptures: SurfaceReview["captures"] = androidCaptureReceipts.map((receipt) => {
    const producerRoot =
      receipt.source === "native-runtime" && receipt.runtimeId === androidRuntimes[1]!.id ? "proof/android-device" : "proof/android-emulator";
    return {
      id: receipt.evidenceId,
      receipt: designArtifact(root, `${producerRoot}/receipts/${receipt.evidenceId}.capture.json`),
      producer: { workflowId: NATIVE_EVIDENCE_WORKFLOW, attemptId: NATIVE_ATTEMPT_ID, outputFingerprint: "0".repeat(64) },
    };
  });
  const ordinaryInteractionId = `${androidSurfaceId}-run`;
  const androidInteractionReceipts: DesignInteractionReceipt[] = [
    (() => {
      const artifactPath = `proof/android-emulator/interactions/${ordinaryInteractionId}.log`;
      const receiptPath = `proof/android-emulator/receipts/${ordinaryInteractionId}.interaction.json`;
      putFixtureFile(root, artifactPath, "Synthetic Android emulator interaction log.\n");
      const receipt: DesignInteractionReceipt = {
        schemaVersion: 1,
        kind: "design-interaction",
        surfaceId: androidSurfaceId,
        evidenceId: ordinaryInteractionId,
        source: "native-runtime",
        platform: "android",
        tool: { name: "synthetic-android-interaction-runner", version: "1.0.0" },
        sessionId: NATIVE_SESSION_ID,
        device: {
          id: androidRuntimes[0]!.deviceId,
          modelIdentifier: androidRuntimes[0]!.deviceModelIdentifier,
          osVersion: androidRuntimes[0]!.osVersion,
          osBuild: androidRuntimes[0]!.osBuild,
        },
        interactionId: "complete-task",
        locale: "en-US",
        executedAt: "2026-01-02T01:00:00Z",
        candidateSha256,
        runtimeId: androidRuntimes[0]!.id,
        artifact: designArtifact(root, artifactPath),
        captureIds: androidCaptureReceipts.filter((capture) => capture.state !== "screen-reader").map((capture) => capture.evidenceId),
        result: "pass",
        observation: "Synthetic Android emulator interaction covers ordinary and non-screen-reader fixture states only.",
      };
      putFixtureFile(root, receiptPath, JSON.stringify(receipt));
      return receipt;
    })(),
    (() => {
      const evidenceId = `${androidSurfaceId}-talkback-run`;
      const artifactPath = `proof/android-device/interactions/${evidenceId}.log`;
      const receiptPath = `proof/android-device/receipts/${evidenceId}.interaction.json`;
      putFixtureFile(root, artifactPath, "Synthetic physical Android TalkBack interaction log.\n");
      const receipt: DesignInteractionReceipt = {
        schemaVersion: 1,
        kind: "design-interaction",
        surfaceId: androidSurfaceId,
        evidenceId,
        source: "native-runtime",
        platform: "android",
        tool: { name: "synthetic-android-interaction-runner", version: "1.0.0" },
        sessionId: NATIVE_SESSION_ID,
        device: {
          id: androidRuntimes[1]!.deviceId,
          modelIdentifier: androidRuntimes[1]!.deviceModelIdentifier,
          osVersion: androidRuntimes[1]!.osVersion,
          osBuild: androidRuntimes[1]!.osBuild,
        },
        interactionId: "voiceover-complete-task",
        locale: "en-US",
        executedAt: "2026-01-02T01:00:00Z",
        candidateSha256,
        runtimeId: androidRuntimes[1]!.id,
        artifact: designArtifact(root, artifactPath),
        captureIds: androidCaptureReceipts.filter((capture) => capture.state === "screen-reader").map((capture) => capture.evidenceId),
        result: "pass",
        observation: "Synthetic physical Android interaction covers the TalkBack fixture state only.",
      };
      putFixtureFile(root, receiptPath, JSON.stringify(receipt));
      return receipt;
    })(),
  ];
  const androidInteractions: SurfaceReview["interactions"] = androidInteractionReceipts.map((receipt) => {
    const producerRoot =
      receipt.source === "native-runtime" && receipt.runtimeId === androidRuntimes[1]!.id ? "proof/android-device" : "proof/android-emulator";
    return {
      id: receipt.evidenceId,
      receipt: designArtifact(root, `${producerRoot}/receipts/${receipt.evidenceId}.interaction.json`),
      producer: { workflowId: NATIVE_EVIDENCE_WORKFLOW, attemptId: NATIVE_ATTEMPT_ID, outputFingerprint: "0".repeat(64) },
    };
  });
  const androidReview: SurfaceReview = {
    id: androidSurfaceId,
    runtimeIds: androidRuntimes.map((runtime) => runtime.id),
    rubric: designArtifact(root, androidScope.rubricPath),
    captures: androidCaptures,
    interactions: androidInteractions,
    criteria: priorNativeReview.criteria.map((criterion) => ({
      ...structuredClone(criterion),
      evidenceIds: [androidCaptures[0]!.id, ordinaryInteractionId],
    })),
  };
  if (keepIos) report.surfaces.push(androidReview);
  else report.surfaces[report.surfaces.indexOf(priorNativeReview)] = androidReview;

  const landingEvidence = report.surfaces.find((surface) => scope.surfaces.find((entry) => entry.id === surface.id)?.kind === "landing")!.captures[0]!.id;
  const nativeEvidence = report.surfaces.find((surface) => scope.surfaces.find((entry) => entry.id === surface.id)?.kind === "native")!.captures[0]!.id;
  for (const surface of report.surfaces) {
    const criterion = surface.criteria.find((entry) => entry.id === "cross_surface_identity")!;
    criterion.evidenceIds = [...new Set([surface.captures[0]!.id, nativeEvidence, landingEvidence])];
  }

  report.sources = ["product.yaml", "DESIGN.md", studioPath, ...scope.designContractPaths].map((relative) => designArtifact(root, relative));
  bindProducerEvidence(root, report);
  fixture.save();
}

export function register(harness: Harness): void {
  harness.check("design-acceptance: oversized declared font is refused by inventory without eager resource validation", () => {
    const fixture = example(harness);
    mkdirSync(path.join(fixture.root, "design/fonts"), { recursive: true });
    const font = "design/fonts/oversized.woff2";
    const fd = openSync(path.join(fixture.root, font), "w");
    try {
      ftruncateSync(fd, 300 * 1024 * 1024);
    } finally {
      closeSync(fd);
    }
    writeFileSync(path.join(fixture.root, "design/fonts/NOTICE.txt"), "Synthetic notice");
    const file = path.join(fixture.root, "DESIGN.md");
    const text = readFileSync(file, "utf8");
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)!;
    const frontmatter = parseYaml(match[1]!);
    frontmatter.foundation = { version: 1, typographyResources: [{ id: "oversized", mode: "local", path: font, licensePath: "design/fonts/NOTICE.txt" }] };
    writeFileSync(file, text.replace(match[0], `---\n${yaml(frontmatter)}---`));
    let message = "",
      eagerRead = false;
    const originalRead = fs.readFileSync;
    fs.readFileSync = ((...args: unknown[]) => {
      if (args[0] === path.join(fixture.root, font)) {
        eagerRead = true;
        throw new Error("oversized resource was read before inventory");
      }
      return Reflect.apply(originalRead, fs, args);
    }) as typeof fs.readFileSync;
    syncBuiltinESMExports();
    try {
      designCandidateFingerprint(fixture.root, fixture.scope);
    } catch (error) {
      message = String(error);
    } finally {
      fs.readFileSync = originalRead;
      syncBuiltinESMExports();
    }
    assert(!eagerRead, "candidate must not eagerly validate referenced font bytes");
    assert(message.includes("exceeds 5000 files or 256 MiB"), "candidate inventory must refuse oversized bytes before hashing resources");
  });
  harness.check("design-acceptance: font and license bytes omitted from implementation roots still invalidate candidate", () => {
    const fixture = example(harness);
    const fontPath = "design/fonts/fixture.woff2",
      licensePath = "design/fonts/NOTICE.txt";
    mkdirSync(path.join(fixture.root, "design/fonts"), { recursive: true });
    writeFileSync(path.join(fixture.root, fontPath), "synthetic font bytes; no rendering claim");
    writeFileSync(path.join(fixture.root, licensePath), "Synthetic fixture notice");
    const designPath = path.join(fixture.root, "DESIGN.md");
    const design = readFileSync(designPath, "utf8");
    const match = design.match(/^---\r?\n([\s\S]*?)\r?\n---/)!;
    const frontmatter = parseYaml(match[1]!);
    frontmatter.foundation = { version: 1, typographyResources: [{ id: "fixture-font", mode: "local", path: fontPath, licensePath }] };
    writeFileSync(designPath, design.replace(match[0], `---\n${yaml(frontmatter)}---`));
    const before = designCandidateFingerprint(fixture.root, fixture.scope);
    writeFileSync(path.join(fixture.root, fontPath), "changed synthetic font bytes");
    const fontChanged = designCandidateFingerprint(fixture.root, fixture.scope);
    assert(before !== fontChanged, "omitted font must affect candidate identity");
    writeFileSync(path.join(fixture.root, licensePath), "Changed synthetic notice");
    assert(fontChanged !== designCandidateFingerprint(fixture.root, fixture.scope), "notice bytes must affect candidate identity");
  });
  harness.check("design-acceptance: asset brief dependencies are bound without manually listing their directory", () => {
    const fixture = example(harness);
    mkdirSync(path.join(fixture.root, "growth/content-assets"), { recursive: true });
    mkdirSync(path.join(fixture.root, "design/kit"), { recursive: true });
    const asset = "design/kit/mark.svg";
    writeFileSync(path.join(fixture.root, asset), "<svg>synthetic first mark</svg>");
    writeFileSync(
      path.join(fixture.root, "growth/content-assets/manifest.json"),
      JSON.stringify({ schema_version: "2", assets: [{ brief: { kit: { path: "DESIGN.md", assets: [{ path: asset }] } } }] }),
    );
    const before = designCandidateFingerprint(fixture.root, fixture.scope);
    writeFileSync(path.join(fixture.root, asset), "<svg>synthetic changed mark</svg>");
    assert(before !== designCandidateFingerprint(fixture.root, fixture.scope), "kit file must affect candidate identity");
    const primaryBefore = designCandidateFingerprint(fixture.root, fixture.scope);
    writeFileSync(path.join(fixture.root, "manifest.json"), "unrelated malformed root manifest");
    assert(primaryBefore === designCandidateFingerprint(fixture.root, fixture.scope), "shadowed root manifest must follow validator precedence");
    rmSync(path.join(fixture.root, "manifest.json"));
    renameSync(path.join(fixture.root, "growth/content-assets/manifest.json"), path.join(fixture.root, "manifest.json"));
    const fallbackBefore = designCandidateFingerprint(fixture.root, fixture.scope);
    writeFileSync(path.join(fixture.root, asset), "<svg>root manifest resource changed</svg>");
    assert(fallbackBefore !== designCandidateFingerprint(fixture.root, fixture.scope), "supported root manifest fallback must bind dependencies too");
    rmSync(path.join(fixture.root, asset));
    let rejected = false;
    try {
      designCandidateFingerprint(fixture.root, fixture.scope);
    } catch {
      rejected = true;
    }
    assert(rejected, "missing declared kit dependency must fail closed");
  });

  harness.check("Porchwatch F8: expired design evidence selects only compatible observed alternatives", () => {
    const resolution = { status: "resolved" as const, observedAt: "2026-01-01T00:00:00Z", provider: "synthetic", sourceId: "source" };
    const result = selectDesignReference(
      [
        { id: "expired-provider", kind: "visual", resolution: { ...resolution, status: "expired" } },
        { id: "internal-prose", kind: "documentation", resolution },
        { id: "observed-alternative", kind: "visual", resolution },
      ],
      "visual",
      "2026-09-05T00:00:00Z",
    );
    assert(result.selectedId === "observed-alternative" && !result.authorityGranted, "fallback weakened evidence or granted authority");
    assert(
      selectDesignReference([{ id: "internal-prose", kind: "documentation", resolution }], "interaction").selectedId === null,
      "prose substituted for observed motion",
    );
  });
  harness.check("Porchwatch F8: source expiry blocks the early design lock even before implementation", () => {
    const fixture = example(harness);
    assert(validateDesignSourceReferences(fixture.root).length === 0, "valid retained source fixture refused");
    const file = path.join(fixture.root, "design/reviews/rubrics/surface.md");
    const source = readFileSync(file, "utf8").replace("status: retained_snapshot", "status: expired");
    writeFileSync(file, source);
    assert(
      validateDesignSourceReferences(fixture.root).some((issue) => issue.code === "design_source.unresolved"),
      "expired source passed design lock",
    );
  });

  const reject = (name: string, mutate: (fixture: ReturnType<typeof example>) => void, code: string): void => {
    harness.check(`design-acceptance: ${name}`, () => {
      const fixture = example(harness);
      mutate(fixture);
      fixture.save();
      const issues = validateDesignAcceptance(fixture.root);
      assert(
        issues.some((entry) => entry.code === `design_acceptance.${code}`),
        JSON.stringify(issues),
      );
    });
  };
  const rejectAndroidPackageArtifact = (name: string, format: "apk" | "aab", target: "built-package" | "install-apk", mutation: "change" | "remove"): void => {
    harness.check(`design-acceptance: ${name}`, () => {
      const fixture = example(harness);
      addAndroidCoverage(fixture, false);
      const runtime = fixture.report.nativeRuntimes.find((entry) => entry.platform === "android" && entry.packageArtifact.format === format)!;
      const receipt = JSON.parse(readFileSync(path.join(fixture.root, runtime.receipt.path), "utf8"));
      const evidence = target === "install-apk" ? receipt.builtPackage.artifact.installApk : receipt.builtPackage.artifact;
      const artifactPath = path.join(fixture.root, evidence.path);
      if (mutation === "change") writeFileSync(artifactPath, `Changed ${name} fixture bytes.\n`);
      else rmSync(artifactPath);
      const issues = validateDesignAcceptance(fixture.root);
      const expected = mutation === "change" ? "design_acceptance.stale_evidence_artifact" : "design_acceptance.evidence_artifact";
      assert(
        issues.some((entry) => entry.code === expected),
        JSON.stringify(issues),
      );
    });
  };
  harness.check("design-acceptance: complete synthetic evidence validates without claiming visual excellence", () => {
    const fixture = example(harness);
    const issues = validateDesignAcceptance(fixture.root);
    assert(issues.length === 0, JSON.stringify(issues));
    harness.runScript("strict CLI", "checks/validation/business/design/check-design-acceptance.ts", ["--root", fixture.root], 0);
  });
  harness.check("design-acceptance: reviewer identity must come from the current engine-issued audit attempt", () => {
    const fixture = example(harness);
    fixture.report.reviewer.sessionId = "invented-independent-session";
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.self_review"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: audit output bindings cannot be relabeled to another producer", () => {
    const fixture = example(harness);
    const runPath = path.join(fixture.root, "run/run-state.json");
    const run = JSON.parse(readFileSync(runPath, "utf8"));
    run.artifactBindings.find((binding: { artifactId: string }) => binding.artifactId === AUDIT_REPORT_ARTIFACT_ID).producedBy = NATIVE_NODE_ID;
    writeFileSync(runPath, JSON.stringify(run));
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.report_coverage"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: an old audit attempt cannot claim the current report", () => {
    const fixture = example(harness);
    const runPath = path.join(fixture.root, "run/run-state.json");
    const run = JSON.parse(readFileSync(runPath, "utf8"));
    run.artifactBindings.find((binding: { artifactId: string }) => binding.artifactId === AUDIT_REVIEW_ARTIFACT_ID).attemptId = "attempt.prior-audit";
    writeFileSync(runPath, JSON.stringify(run));
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.report_coverage"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: an accepted audit remains recheckable only with exact accepted bindings", () => {
    const fixture = example(harness);
    const runPath = path.join(fixture.root, "run/run-state.json");
    const run = JSON.parse(readFileSync(runPath, "utf8"));
    const audit = run.nodes[AUDIT_NODE_ID];
    audit.status = "succeeded";
    delete audit.blocker;
    audit.attempts[0].status = "succeeded";
    const auditBindings = run.artifactBindings.filter((binding: { producedBy?: string }) => binding.producedBy === AUDIT_NODE_ID);
    auditBindings.forEach((binding: { accepted: boolean }) => (binding.accepted = true));
    audit.acceptedOutputFingerprint = createHash("sha256")
      .update(auditBindings.map((binding: { fingerprint: string }) => binding.fingerprint).join("|"))
      .digest("hex");
    writeFileSync(runPath, JSON.stringify(run));
    const issues = validateDesignAcceptance(fixture.root);
    assert(issues.length === 0, JSON.stringify(issues));
  });
  for (const [label, mutate] of [
    ["missing", (text: string) => text.replace(/^Acceptance report SHA-256:.*\n/m, "")],
    ["duplicate", (text: string) => `${text}\n${text.match(/^Acceptance report SHA-256:.*$/m)![0]}\n`],
    ["mismatched", (text: string) => text.replace(/^Acceptance report SHA-256: [a-f0-9]{64}$/m, `Acceptance report SHA-256: ${"f".repeat(64)}`)],
  ] as const) {
    harness.check(`design-acceptance: ${label} implementation-review report binding is report coverage`, () => {
      const fixture = example(harness);
      const reviewPath = path.join(fixture.root, "design/reviews/IMPLEMENTATION_REVIEW.md");
      writeFileSync(reviewPath, mutate(readFileSync(reviewPath, "utf8")));
      const issues = validateDesignAcceptance(fixture.root);
      assert(
        issues.some((entry) => entry.code === "design_acceptance.report_coverage"),
        JSON.stringify(issues),
      );
    });
  }
  harness.check("design-acceptance: forged receipt and refreshed audit prose cannot rebind stale producer evidence", () => {
    const fixture = example(harness);
    const surface = fixture.report.surfaces.find((entry) => entry.id === "mobile")!;
    const reference = surface.captures[0]!;
    const receipt = captureReceipt(fixture, reference);
    const forgedArtifactPath = "growth/landing/proof/captures/forged.png";
    const forgedReceiptPath = "growth/landing/proof/receipts/forged.capture.json";
    putFixtureFile(fixture.root, forgedArtifactPath, png(390, 844));
    receipt.artifact = designArtifact(fixture.root, forgedArtifactPath);
    receipt.evidenceId = reference.id;
    putFixtureFile(fixture.root, forgedReceiptPath, JSON.stringify(receipt));
    reference.receipt = designArtifact(fixture.root, forgedReceiptPath);
    surface.criteria.forEach((criterion) => {
      criterion.observation = "Refreshed reviewer prose cannot authorize capture bytes absent from the accepted producer binding.";
    });
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.surface_coverage" && entry.message.includes("producer binding changed")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: missing producer receipt is surface coverage", () => {
    const fixture = example(harness);
    const reference = fixture.report.surfaces[0]!.captures[0]!;
    rmSync(path.join(fixture.root, reference.receipt.path));
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.surface_coverage"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: implementation audit cannot claim producer evidence", () => {
    const fixture = example(harness);
    const reference = fixture.report.surfaces[0]!.captures[0]!;
    reference.producer.workflowId = "workflow.design.implementation-craft-audit";
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.surface_coverage" && entry.message.includes("never the implementation audit")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: audit-owned receipt paths cannot supply producer evidence", () => {
    const fixture = example(harness);
    const reference = fixture.report.surfaces.find((surface) => surface.id === "mobile")!.captures[0]!;
    const auditReceiptPath = "design/reviews/forged.capture.json";
    putFixtureFile(fixture.root, auditReceiptPath, readFileSync(path.join(fixture.root, reference.receipt.path)));
    reference.receipt = designArtifact(fixture.root, auditReceiptPath);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.surface_coverage" && entry.message.includes("producer-owned growth/landing/proof/")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: producer output labels cannot override the current accepted binding", () => {
    const fixture = example(harness);
    const forgedOutputFingerprint = "f".repeat(64);
    const runStatePath = path.join(fixture.root, "run/run-state.json");
    const runState = JSON.parse(readFileSync(runStatePath, "utf8"));
    runState.nodes[BROWSER_NODE_ID].acceptedOutputFingerprint = forgedOutputFingerprint;
    writeFileSync(runStatePath, JSON.stringify(runState));
    for (const reference of fixture.report.surfaces.flatMap((surface) => [...surface.captures, ...surface.interactions])) {
      if (reference.producer.workflowId === BROWSER_EVIDENCE_WORKFLOW) reference.producer.outputFingerprint = forgedOutputFingerprint;
    }
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some(
        (entry) =>
          entry.code === "design_acceptance.surface_coverage" &&
          entry.message.includes("output fingerprint does not match the current accepted producer binding"),
      ),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: unaccepted producer binding cannot supply evidence", () => {
    const fixture = example(harness);
    const runStatePath = path.join(fixture.root, "run/run-state.json");
    const runState = JSON.parse(readFileSync(runStatePath, "utf8"));
    runState.artifactBindings.find((binding: { path: string }) => binding.path === "growth/landing").accepted = false;
    writeFileSync(runStatePath, JSON.stringify(runState));
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some(
        (entry) =>
          entry.code === "design_acceptance.surface_coverage" && entry.message.includes("expected one current accepted growth/landing producer binding"),
      ),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: stale producer attempt cannot supply evidence", () => {
    const fixture = example(harness);
    const runStatePath = path.join(fixture.root, "run/run-state.json");
    const runState = JSON.parse(readFileSync(runStatePath, "utf8"));
    runState.nodes[BROWSER_NODE_ID].attempts.push({
      id: "attempt.browser-evidence-newer",
      status: "succeeded",
      ownerSessionId: "session.browser-evidence-producer-newer",
    });
    writeFileSync(runStatePath, JSON.stringify(runState));
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.surface_coverage" && entry.message.includes("current accepted run-state attempt")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: every browser surface requires a registered runtime", () => {
    const fixture = example(harness);
    fixture.report.browserRuntimes = [];
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" || entry.code === "design_acceptance.surface_coverage"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: current browser source drift invalidates an old page runtime", () => {
    const fixture = example(harness);
    writeFileSync(path.join(fixture.root, "web/index.html"), "<h1>Changed after browser launch</h1>\n");
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("source")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: an old response cannot be relabeled with the current candidate hash", () => {
    const fixture = example(harness);
    const runtime = fixture.report.browserRuntimes[0]!;
    const receipt = browserRuntimeReceipt(fixture, runtime);
    const resourceManifestPath = path.join(fixture.root, receipt.served.resourceManifest.path);
    const resourceManifest = JSON.parse(readFileSync(resourceManifestPath, "utf8")) as DesignBrowserResourceManifest;
    const oldResponsePath = "growth/landing/proof/runtime/responses/old-unrelated-page.html";
    putFixtureFile(fixture.root, oldResponsePath, "<h1>Old unrelated page</h1>\n");
    resourceManifest.resources[0]!.response = designArtifact(fixture.root, oldResponsePath);
    writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest));
    receipt.served.resourceManifest = designArtifact(fixture.root, receipt.served.resourceManifest.path);
    writeBrowserRuntimeReceipt(fixture, runtime, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("current build file")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: a browser runtime cannot substitute another route", () => {
    const fixture = example(harness);
    const runtime = fixture.report.browserRuntimes[0]!;
    const receipt = browserRuntimeReceipt(fixture, runtime);
    const substitutedUrl = `${runtime.origin}/old-page.html`;
    const resourceManifestPath = path.join(fixture.root, receipt.served.resourceManifest.path);
    const resourceManifest = JSON.parse(readFileSync(resourceManifestPath, "utf8")) as DesignBrowserResourceManifest;
    resourceManifest.documentUrl = substitutedUrl;
    resourceManifest.resources[0]!.url = substitutedUrl;
    writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest));
    receipt.served.url = substitutedUrl;
    receipt.served.resourceManifest = designArtifact(fixture.root, receipt.served.resourceManifest.path);
    receipt.navigation.requestedUrl = substitutedUrl;
    receipt.navigation.finalUrl = substitutedUrl;
    runtime.url = substitutedUrl;
    writeBrowserRuntimeReceipt(fixture, runtime, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("authored route")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: browser build labels cannot replace the current source fingerprint", () => {
    const fixture = example(harness);
    const runtime = fixture.report.browserRuntimes[0]!;
    const receipt = browserRuntimeReceipt(fixture, runtime);
    const buildManifestPath = path.join(fixture.root, receipt.build.manifest.path);
    const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8")) as DesignBrowserBuildManifest;
    const forgedSourceFingerprint = `sha256:${"f".repeat(64)}`;
    buildManifest.sourceFingerprint = forgedSourceFingerprint;
    writeFileSync(buildManifestPath, JSON.stringify(buildManifest));
    receipt.source.fingerprint = forgedSourceFingerprint;
    receipt.build.manifest = designArtifact(fixture.root, receipt.build.manifest.path);
    receipt.build.fingerprint = designBrowserBuildFingerprint(buildManifest);
    runtime.sourceFingerprint = forgedSourceFingerprint;
    runtime.buildFingerprint = receipt.build.fingerprint;
    writeBrowserRuntimeReceipt(fixture, runtime, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("source")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: browser launch transcript hashes cannot be relabeled", () => {
    const fixture = example(harness);
    const runtime = fixture.report.browserRuntimes[0]!;
    const receipt = browserRuntimeReceipt(fixture, runtime);
    writeFileSync(path.join(fixture.root, receipt.launch.transcript.path), "Replacement browser launch transcript.\n");
    receipt.launch.transcript = designArtifact(fixture.root, receipt.launch.transcript.path);
    writeBrowserRuntimeReceipt(fixture, runtime, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("transcript identity")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: browser captures must match the receipt-verified context", () => {
    const fixture = example(harness);
    const surface = fixture.report.surfaces.find((entry) => entry.id === "mobile")!;
    const reference = surface.captures[0]!;
    const receipt = captureReceipt(fixture, reference);
    if (receipt.source !== "browser-runtime") throw new Error("expected browser fixture receipt");
    receipt.browserContextId = "unrelated-browser-context";
    writeCaptureReceipt(fixture, reference, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("receipt-verified browser context")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: browser interactions can cite only their exact runtime captures", () => {
    const fixture = example(harness);
    const surface = fixture.report.surfaces.find((entry) => entry.id === "mobile")!;
    const reference = surface.interactions[0]!;
    const receipt = interactionReceipt(fixture, reference);
    if (receipt.source !== "browser-runtime") throw new Error("expected browser fixture receipt");
    receipt.browserContextId = "unrelated-browser-context";
    writeInteractionReceipt(fixture, reference, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("cited captures")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: insecure remote browser origins fail closed", () => {
    const fixture = example(harness);
    const runtime = fixture.report.browserRuntimes[0]!;
    const receipt = browserRuntimeReceipt(fixture, runtime);
    const insecureOrigin = "http://example.com";
    const insecureUrl = `${insecureOrigin}/index.html`;
    const resourceManifestPath = path.join(fixture.root, receipt.served.resourceManifest.path);
    const resourceManifest = JSON.parse(readFileSync(resourceManifestPath, "utf8")) as DesignBrowserResourceManifest;
    resourceManifest.origin = insecureOrigin;
    resourceManifest.documentUrl = insecureUrl;
    resourceManifest.resources[0]!.url = insecureUrl;
    writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest));
    receipt.served.origin = insecureOrigin;
    receipt.served.url = insecureUrl;
    receipt.served.resourceManifest = designArtifact(fixture.root, receipt.served.resourceManifest.path);
    receipt.navigation.requestedUrl = insecureUrl;
    receipt.navigation.finalUrl = insecureUrl;
    runtime.origin = insecureOrigin;
    runtime.url = insecureUrl;
    writeBrowserRuntimeReceipt(fixture, runtime, receipt);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.browser_runtime" && entry.message.includes("must use HTTPS")),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: Android-only emulator and physical-device evidence validates", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, false);
    const issues = validateDesignAcceptance(fixture.root);
    assert(issues.length === 0, JSON.stringify(issues));
    assert(
      fixture.report.nativeRuntimes.every((runtime) => runtime.platform === "android") &&
        fixture.report.nativeRuntimes.some((runtime) => runtime.target === "emulator") &&
        fixture.report.nativeRuntimes.some((runtime) => runtime.target === "physical-device"),
      "Android-only acceptance must use Android emulator and physical-device receipts",
    );
  });
  harness.check("design-acceptance: mixed iOS and Android evidence validates per target platform", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, true);
    const issues = validateDesignAcceptance(fixture.root);
    assert(issues.length === 0, JSON.stringify(issues));
    assert(
      ["ios", "android"].every(
        (platform) =>
          fixture.scope.surfaces.some((surface) => surface.kind === "native" && surface.platform === platform) &&
          fixture.report.nativeRuntimes.some((runtime) => runtime.platform === platform),
      ),
      "mixed acceptance must retain a reviewed surface and installed runtime for each target OS",
    );
  });
  harness.check("design-acceptance: Android runtime versionCode must match installed-package readback", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, false);
    const runtime = fixture.report.nativeRuntimes.find((entry) => entry.platform === "android" && entry.target === "emulator")!;
    runtime.versionCode += 1;
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.native_runtime"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: Android receipt source inventory cannot omit authored implementation paths", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, false);
    const runtime = fixture.report.nativeRuntimes.find((entry) => entry.platform === "android" && entry.target === "emulator")!;
    const receiptPath = path.join(fixture.root, runtime.receipt.path);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    const narrowRoot = path.join(fixture.root, "app");
    const narrowRoots = ["src/main/kotlin/com/example/synthetic/MainActivity.kt"];
    const narrowFingerprint = fingerprintAppSource(narrowRoot, narrowRoots);
    receipt.builtPackage.source = { root: narrowRoot, roots: narrowRoots, fingerprint: narrowFingerprint };
    runtime.sourceFingerprint = narrowFingerprint;
    writeFileSync(receiptPath, JSON.stringify(receipt));
    runtime.receipt = designArtifact(fixture.root, runtime.receipt.path);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.native_runtime"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: Android emulator receipt cannot be relabeled from another proof lane", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, false);
    const runtime = fixture.report.nativeRuntimes.find((entry) => entry.platform === "android" && entry.target === "emulator")!;
    const wrongLane = "proof/android-device/replayed-emulator-receipt.json";
    writeFileSync(path.join(fixture.root, wrongLane), readFileSync(path.join(fixture.root, runtime.receipt.path)));
    runtime.receipt = designArtifact(fixture.root, wrongLane);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.native_runtime"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: Android AAB proof cannot relabel the derived install APK", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, false);
    const runtime = fixture.report.nativeRuntimes.find((entry) => entry.platform === "android" && entry.packageArtifact.format === "aab")!;
    const receiptPath = path.join(fixture.root, runtime.receipt.path);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.install.apkSha256 = "d".repeat(64);
    writeFileSync(receiptPath, JSON.stringify(receipt));
    runtime.receipt = designArtifact(fixture.root, runtime.receipt.path);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.native_runtime"),
      JSON.stringify(issues),
    );
  });
  harness.check("design-acceptance: Android AAB conversion evidence cannot alias the derived install APK", () => {
    const fixture = example(harness);
    addAndroidCoverage(fixture, false);
    const runtime = fixture.report.nativeRuntimes.find((entry) => entry.platform === "android" && entry.packageArtifact.format === "aab")!;
    const receiptPath = path.join(fixture.root, runtime.receipt.path);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.builtPackage.artifact.conversionEvidence = structuredClone(receipt.builtPackage.artifact.installApk);
    writeFileSync(receiptPath, JSON.stringify(receipt));
    runtime.receipt = designArtifact(fixture.root, runtime.receipt.path);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some((entry) => entry.code === "design_acceptance.native_runtime"),
      JSON.stringify(issues),
    );
  });
  rejectAndroidPackageArtifact("changed Android APK bytes fail", "apk", "built-package", "change");
  rejectAndroidPackageArtifact("missing Android APK fails", "apk", "built-package", "remove");
  rejectAndroidPackageArtifact("changed Android AAB bytes fail", "aab", "built-package", "change");
  rejectAndroidPackageArtifact("missing Android AAB fails", "aab", "built-package", "remove");
  rejectAndroidPackageArtifact("changed Android AAB install APK bytes fail", "aab", "install-apk", "change");
  rejectAndroidPackageArtifact("missing Android AAB install APK fails", "aab", "install-apk", "remove");
  harness.check("design-acceptance: empty ordinary source files and nested directories do not block capture", () => {
    const fixture = example(harness);
    writeFileSync(path.join(fixture.root, "app/Empty.swift"), "");
    mkdirSync(path.join(fixture.root, "app/unused-assets"));
    const digest = designCandidateFingerprint(fixture.root, fixture.scope);
    assert(digest !== fixture.report.candidate.sha256, "the new empty source file must change the inventory");
    fixture.report.candidate.sha256 = digest;
    for (const surface of fixture.report.surfaces) {
      for (const reference of surface.captures) {
        const receipt = captureReceipt(fixture, reference);
        receipt.candidateSha256 = digest;
        writeCaptureReceipt(fixture, reference, receipt);
      }
      for (const reference of surface.interactions) {
        const receipt = interactionReceipt(fixture, reference);
        receipt.candidateSha256 = digest;
        writeInteractionReceipt(fixture, reference, receipt);
      }
    }
    for (const runtime of fixture.report.nativeRuntimes) runtime.candidateSha256 = digest;
    const physicalRuntime = fixture.report.nativeRuntimes.find((runtime) => runtime.target === "physical-device")!;
    const physicalReceiptPath = path.join(fixture.root, physicalRuntime.receipt.path);
    const physicalReceipt = JSON.parse(readFileSync(physicalReceiptPath, "utf8"));
    physicalReceipt.candidateSha256 = digest;
    writeFileSync(physicalReceiptPath, JSON.stringify(physicalReceipt));
    physicalRuntime.receipt = designArtifact(fixture.root, physicalRuntime.receipt.path);
    for (const runtime of fixture.report.browserRuntimes) {
      runtime.candidateSha256 = digest;
      const receiptPath = path.join(fixture.root, runtime.receipt.path);
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      receipt.candidateSha256 = digest;
      writeFileSync(receiptPath, JSON.stringify(receipt));
      runtime.receipt = designArtifact(fixture.root, runtime.receipt.path);
    }
    bindProducerEvidence(fixture.root, fixture.report);
    fixture.save();
    assert(validateDesignAcceptance(fixture.root).length === 0, "empty ordinary source files are valid code inventory members");
  });
  reject(
    "a strong landing cannot hide a missing native review",
    ({ report }) => {
      report.surfaces.splice(0, 1);
    },
    "surface_coverage",
  );
  reject(
    "a duplicate report evidence index remains an audit-authored coverage error",
    ({ report }) => {
      report.surfaces[1]!.captures[0]!.id = report.surfaces[0]!.captures[0]!.id;
    },
    "report_coverage",
  );
  reject(
    "one failed criterion cannot be averaged away",
    ({ report }) => {
      report.surfaces[0]!.criteria[0]!.verdict = "fails";
    },
    "criterion_floor",
  );
  reject(
    "a stronger frozen floor is enforced",
    ({ root, report }) => {
      const rubricPath = "design/reviews/rubrics/surface.md";
      writeFileSync(path.join(root, rubricPath), readFileSync(path.join(root, rubricPath), "utf8").replaceAll("minimum: meets", "minimum: exceeds"));
      report.surfaces.forEach((surface) => {
        surface.rubric = designArtifact(root, rubricPath);
      });
    },
    "criterion_floor",
  );
  reject(
    "self-review fails even with a different session",
    ({ report }) => {
      report.reviewer.id = "PRODUCER";
    },
    "self_review",
  );
  reject(
    "same-session review is not independent",
    ({ report }) => {
      report.reviewer.sessionId = report.candidate.producer.sessionId;
    },
    "self_review",
  );
  reject(
    "candidate source mutations invalidate captures",
    ({ root }) => {
      writeFileSync(path.join(root, "app/Home.swift"), "changed implementation");
    },
    "stale_candidate",
  );
  reject(
    "old producer receipts cannot be relabeled by refreshing audit metadata and prose",
    ({ root, report, scope }) => {
      writeFileSync(path.join(root, "app/Home.swift"), "changed after the receipt");
      const changed = designCandidateFingerprint(root, scope);
      report.candidate.sha256 = changed;
      report.nativeRuntimes[0]!.candidateSha256 = changed;
      report.surfaces.forEach((surface) =>
        surface.criteria.forEach((criterion) => {
          criterion.observation = "Refreshed audit prose still cannot rebind evidence produced for older implementation bytes.";
        }),
      );
    },
    "capture_chronology",
  );
  reject(
    "new source files invalidate the whole implementation inventory",
    ({ root }) => {
      writeFileSync(path.join(root, "app/New.swift"), "new source");
    },
    "stale_candidate",
  );
  reject(
    "linked screen and flow contract changes invalidate the candidate",
    ({ root }) => {
      writeFileSync(path.join(root, "design/screens/home.md"), "changed screen contract");
    },
    "stale_candidate",
  );
  reject(
    "a linked detailed contract cannot be omitted from authored scope",
    ({ root, report }) => {
      writeFileSync(path.join(root, "design/screens/second.md"), "# A second linked screen\n");
      const designPath = path.join(root, "DESIGN.md");
      writeFileSync(designPath, `${readFileSync(designPath, "utf8")}\n[Second screen](design/screens/second.md)\n`);
      report.sources[1] = designArtifact(root, "DESIGN.md");
    },
    "scope",
  );
  reject(
    "capture mutation invalidates an earlier review",
    (fixture) => {
      const reference = fixture.report.surfaces[0]!.captures[0]!;
      const receipt = captureReceipt(fixture, reference);
      writeFileSync(path.join(fixture.root, receipt.artifact.path), "not an image");
    },
    "stale_evidence_artifact",
  );
  reject(
    "text renamed to PNG is not visual proof",
    (fixture) => {
      const reference = fixture.report.surfaces[0]!.captures[0]!;
      const receipt = captureReceipt(fixture, reference);
      writeFileSync(path.join(fixture.root, receipt.artifact.path), "not an image");
      receipt.artifact = designArtifact(fixture.root, receipt.artifact.path);
      writeCaptureReceipt(fixture, reference, receipt);
    },
    "capture",
  );
  reject(
    "rubric mutation invalidates the earlier review",
    ({ root }) => {
      writeFileSync(path.join(root, "design/reviews/rubrics/surface.md"), "changed rubric");
    },
    "stale_evidence_artifact",
  );
  reject(
    "a rubric frozen after production is invalid",
    ({ root, report }) => {
      const p = "design/reviews/rubrics/surface.md";
      writeFileSync(path.join(root, p), readFileSync(path.join(root, p), "utf8").replace("2026-01-01", "2026-01-04"));
      report.surfaces.forEach((surface) => {
        surface.rubric = designArtifact(root, p);
      });
    },
    "rubric_chronology",
  );
  reject(
    "static captures cannot replace interaction evidence",
    ({ report }) => {
      report.surfaces[0]!.interactions = [];
    },
    "surface_coverage",
  );
  reject(
    "declared accessibility requires observed interactions",
    (fixture) => {
      const surface = fixture.report.surfaces[0]!;
      const reference = surface.interactions[0]!;
      const receipt = interactionReceipt(fixture, reference);
      receipt.captureIds = [surface.captures[0]!.id];
      writeInteractionReceipt(fixture, reference, receipt);
    },
    "interaction_state",
  );
  reject(
    "a browser mock cannot stand in for native capture",
    (fixture) => {
      const reference = fixture.report.surfaces[0]!.captures[0]!;
      const receipt = captureReceipt(fixture, reference);
      if (receipt.source !== "native-runtime") throw new Error("expected native fixture receipt");
      const browserReceipt = {
        ...receipt,
        source: "browser-runtime" as const,
        runtimeId: fixture.report.browserRuntimes[0]!.id,
        platform: "web" as const,
        browser: BROWSER_IDENTITY,
        browserContextId: fixture.report.browserRuntimes[0]!.browserContextId,
        os: fixture.report.browserRuntimes[0]!.os,
      };
      delete (browserReceipt as Partial<typeof browserReceipt> & { device?: unknown }).device;
      writeCaptureReceipt(fixture, reference, browserReceipt);
    },
    "capture",
  );
  reject(
    "a native capture from the wrong platform cannot pass",
    (fixture) => {
      const reference = fixture.report.surfaces[0]!.captures[0]!;
      const receipt = captureReceipt(fixture, reference);
      if (receipt.source !== "native-runtime") throw new Error("expected native fixture receipt");
      receipt.platform = "android";
      writeCaptureReceipt(fixture, reference, receipt);
    },
    "capture_platform",
  );
  reject(
    "a native review cannot substitute a different installed build",
    ({ report }) => {
      const runtime = report.nativeRuntimes.find((entry) => entry.platform === "ios" && entry.target === "simulator")!;
      runtime.buildNumber = "43";
    },
    "native_runtime",
  );
  reject(
    "native evidence must link to the receipt-verified runtime",
    (fixture) => {
      const reference = fixture.report.surfaces[0]!.captures[0]!;
      const receipt = captureReceipt(fixture, reference);
      if (receipt.source !== "native-runtime") throw new Error("expected native fixture receipt");
      receipt.runtimeId = "older-runtime";
      writeCaptureReceipt(fixture, reference, receipt);
    },
    "surface_coverage",
  );
  harness.check("design-acceptance: physical iPhone VoiceOver evidence is receipt-linked and valid", () => {
    const fixture = example(harness);
    const native = fixture.report.surfaces.find((surface) => surface.id === "native")!;
    const screenReaderReference = native.captures.find((reference) => captureReceipt(fixture, reference).settings.screenReader)!;
    const screenReader = captureReceipt(fixture, screenReaderReference);
    const interactionReference = native.interactions.find((reference) => interactionReceipt(fixture, reference).captureIds.includes(screenReader.evidenceId))!;
    const interaction = interactionReceipt(fixture, interactionReference);
    if (screenReader.source !== "native-runtime" || interaction.source !== "native-runtime") throw new Error("expected native receipts");
    const runtime = fixture.report.nativeRuntimes.find((entry) => entry.id === screenReader.runtimeId)!;
    assert(runtime.target === "physical-device", "VoiceOver capture did not cite the physical-device runtime");
    assert(interaction.runtimeId === runtime.id, "VoiceOver interaction did not cite the same physical-device runtime");
    assert(validateDesignAcceptance(fixture.root).length === 0, "a complete physical iPhone VoiceOver proof should validate");
  });
  harness.check("design-acceptance: a simulator screen-reader claim fails closed", () => {
    const fixture = example(harness);
    const native = fixture.report.surfaces.find((surface) => surface.id === "native")!;
    const reference = native.captures.find((capture) => captureReceipt(fixture, capture).settings.screenReader)!;
    const screenReader = captureReceipt(fixture, reference);
    if (screenReader.source !== "native-runtime") throw new Error("expected native receipt");
    const simulator = fixture.report.nativeRuntimes.find((runtime) => runtime.target === "simulator")!;
    screenReader.runtimeId = simulator.id;
    screenReader.device.id = simulator.deviceId;
    writeCaptureReceipt(fixture, reference, screenReader);
    fixture.save();
    const issues = validateDesignAcceptance(fixture.root);
    assert(
      issues.some(
        (entry) =>
          entry.code === "design_acceptance.native_runtime" && entry.message.includes("screen-reader evidence requires a receipt-verified physical iPhone"),
      ),
      JSON.stringify(issues),
    );
  });
  reject(
    "a physical runtime cannot relabel its receipt OS",
    ({ report }) => {
      const physical = report.nativeRuntimes.find((runtime) => runtime.target === "physical-device")!;
      physical.osBuild = "23F43";
    },
    "native_runtime",
  );
  reject(
    "a physical VoiceOver capture cannot relabel its runtime OS",
    (fixture) => {
      const native = fixture.report.surfaces.find((surface) => surface.id === "native")!;
      const reference = native.captures.find((capture) => captureReceipt(fixture, capture).settings.screenReader)!;
      const receipt = captureReceipt(fixture, reference);
      if (receipt.source !== "native-runtime") throw new Error("expected native receipt");
      receipt.device.osBuild = "23F43";
      writeCaptureReceipt(fixture, reference, receipt);
    },
    "native_runtime",
  );
  reject(
    "a physical receipt cannot substitute different installation bytes",
    ({ root, report }) => {
      const physical = report.nativeRuntimes.find((runtime) => runtime.target === "physical-device")!;
      const receiptPath = path.join(root, physical.receipt.path);
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      receipt.install.bundleContentSha256 = "c".repeat(64);
      writeFileSync(receiptPath, JSON.stringify(receipt));
      physical.receipt = designArtifact(root, physical.receipt.path);
    },
    "native_runtime",
  );
  reject(
    "a simulator interaction cannot claim the physical VoiceOver capture",
    (fixture) => {
      const native = fixture.report.surfaces.find((surface) => surface.id === "native")!;
      const screenReaderReference = native.captures.find((capture) => captureReceipt(fixture, capture).settings.screenReader)!;
      const screenReader = captureReceipt(fixture, screenReaderReference);
      const reference = native.interactions.find((interaction) => interactionReceipt(fixture, interaction).captureIds.includes(screenReader.evidenceId))!;
      const receipt = interactionReceipt(fixture, reference);
      if (receipt.source !== "native-runtime") throw new Error("expected native receipt");
      const simulator = fixture.report.nativeRuntimes.find((runtime) => runtime.target === "simulator")!;
      receipt.runtimeId = simulator.id;
      receipt.device.id = simulator.deviceId;
      writeInteractionReceipt(fixture, reference, receipt);
    },
    "native_runtime",
  );
  reject(
    "ordinary native capture evidence cannot omit its install receipt link",
    (fixture) => {
      const native = fixture.report.surfaces.find((surface) => surface.id === "native")!;
      const reference = native.captures.find((capture) => captureReceipt(fixture, capture).state === "default")!;
      const receipt = captureReceipt(fixture, reference) as unknown as { runtimeId?: string };
      delete receipt.runtimeId;
      writeFileSync(path.join(fixture.root, reference.receipt.path), JSON.stringify(receipt));
      reference.receipt = designArtifact(fixture.root, reference.receipt.path);
    },
    "surface_coverage",
  );
  reject(
    "a native receipt cannot repeat required steps",
    ({ root, report }) => {
      const runtime = report.nativeRuntimes[0]!;
      const receiptPath = path.join(root, runtime.receipt.path);
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      receipt.steps.splice(4, 0, { name: "build", ok: true });
      writeFileSync(receiptPath, JSON.stringify(receipt));
      runtime.receipt = designArtifact(root, runtime.receipt.path);
    },
    "native_runtime",
  );
  reject(
    "an iOS simulator receipt must declare its platform",
    ({ root, report }) => {
      const runtime = report.nativeRuntimes.find((entry) => entry.target === "simulator")!;
      const receiptPath = path.join(root, runtime.receipt.path);
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      delete receipt.platform;
      writeFileSync(receiptPath, JSON.stringify(receipt));
      runtime.receipt = designArtifact(root, runtime.receipt.path);
    },
    "native_receipt",
  );
  reject(
    "an iOS simulator receipt cannot relabel its proof target",
    ({ root, report }) => {
      const runtime = report.nativeRuntimes.find((entry) => entry.target === "simulator")!;
      const receiptPath = path.join(root, runtime.receipt.path);
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      receipt.target = "android-emulator";
      writeFileSync(receiptPath, JSON.stringify(receipt));
      runtime.receipt = designArtifact(root, runtime.receipt.path);
    },
    "native_receipt",
  );
  reject(
    "cross-surface identity must cite current native and landing evidence",
    ({ report }) => {
      const landing = report.surfaces.find((surface) => surface.id === "mobile")!;
      landing.criteria.find((entry) => entry.id === "cross_surface_identity")!.evidenceIds = [landing.captures[0]!.id];
    },
    "criterion_evidence",
  );
  reject(
    "ordinary criteria cannot borrow evidence from another surface",
    ({ report }) => {
      report.surfaces[0]!.criteria.find((entry) => entry.id === "coherence")!.evidenceIds = [report.surfaces[1]!.captures[0]!.id];
    },
    "criterion_evidence",
  );
  reject(
    "a prose-only visual reference cannot calibrate craft",
    ({ root, report }) => {
      const p = "design/reviews/rubrics/surface.md";
      const text = readFileSync(path.join(root, p), "utf8");
      const front = parseYaml(text.match(/^---\n([\s\S]*?)\n---/)![1]!);
      front.designRubric.references[0].artifact = designArtifact(root, "design/reference-packs/behavior.md");
      writeFileSync(path.join(root, p), `---\n${yaml(front)}---\n# Frozen fixture rubric\n`);
      report.surfaces.forEach((surface) => {
        surface.rubric = designArtifact(root, p);
      });
    },
    "reference_image",
  );
  reject(
    "desktop pixels cannot claim a mobile composition",
    (fixture) => {
      const reference = fixture.report.surfaces[1]!.captures[0]!;
      const receipt = captureReceipt(fixture, reference);
      receipt.viewport.width = 1200;
      writeCaptureReceipt(fixture, reference, receipt);
    },
    "capture_viewport",
  );
  reject(
    "an extra accepted product screen cannot disappear from coverage",
    ({ root, report }) => {
      const product = parseYaml(readFileSync(path.join(root, "product.yaml"), "utf8"));
      product.instances.push({ id: "screen.missing", class_id: "class.screen", slots: {} });
      writeFileSync(path.join(root, "product.yaml"), yaml(product));
      report.sources[0] = designArtifact(root, "product.yaml");
    },
    "surface_coverage",
  );
  reject(
    "a required studio screen cannot disappear from coverage",
    ({ root, report }) => {
      const p = "studio/seed/business.json";
      const studio = JSON.parse(readFileSync(path.join(root, p), "utf8"));
      studio.surfaces.mobileApp.screens.push({ id: "purchase", status: "ready" });
      writeFileSync(path.join(root, p), JSON.stringify(studio));
      report.sources[2] = designArtifact(root, p);
    },
    "surface_coverage",
  );
  reject(
    "a second native platform cannot be silently omitted",
    ({ root, report }) => {
      const p = "studio/seed/business.json";
      const studio = JSON.parse(readFileSync(path.join(root, p), "utf8"));
      studio.surfaces.mobileApp.platforms.push("android");
      writeFileSync(path.join(root, p), JSON.stringify(studio));
      report.sources[2] = designArtifact(root, p);
    },
    "surface_coverage",
  );
  reject(
    "duplicate state exclusions are invalid",
    ({ root }) => {
      const p = path.join(root, "DESIGN.md");
      const text = readFileSync(p, "utf8");
      const match = text.match(/^---\n([\s\S]*?)\n---/)![1]!;
      const front = parseYaml(match);
      front.acceptance.surfaces[0].stateExclusions.push({ ...front.acceptance.surfaces[0].stateExclusions[0] });
      writeFileSync(p, text.replace(/^---\n([\s\S]*?)\n---/, `---\n${yaml(front)}---`));
    },
    "states",
  );
  reject(
    "open findings cannot accompany a pass",
    ({ report }) => {
      report.findings.push({
        id: "repair",
        severity: "major",
        status: "open",
        observation: "The primary task is still confusing and requires repair before acceptance.",
      });
    },
    "open_findings",
  );
  reject(
    "evidence path traversal is rejected",
    ({ report }) => {
      report.surfaces[0]!.captures[0]!.receipt.path = "../outside.json";
    },
    "surface_coverage",
  );
  reject(
    "evidence symlinks are rejected",
    ({ root, report }) => {
      const original = report.surfaces[0]!.captures[0]!.receipt.path;
      symlinkSync(path.join(root, original), path.join(root, "linked.json"));
      report.surfaces[0]!.captures[0]!.receipt.path = "linked.json";
    },
    "surface_coverage",
  );
  harness.check("design-acceptance: nonfinite dimensions and unknown verdicts fail schema", () => {
    const fixture = example(harness);
    const { report } = fixture;
    const capture = captureReceipt(fixture, report.surfaces[0]!.captures[0]!);
    capture.scale = Number.POSITIVE_INFINITY;
    assert(!designCaptureReceiptSchema.safeParse(capture).success, "infinite scale passed");
    const raw = JSON.parse(JSON.stringify(report));
    raw.surfaces[0].criteria[0].verdict = "looks-good";
    assert(!designAcceptanceReportSchema.safeParse(raw).success, "unknown verdict passed");
  });
}
