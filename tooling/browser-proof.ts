#!/usr/bin/env node
/**
 * `b2c browser-proof` opens the authored landing candidate in a new Chrome
 * browser context and retains the exact build bytes, served response bytes,
 * launch/navigation transcripts, and one strict runtime receipt. It never
 * starts a server or guesses build inputs: growth/landing/browser-proof.json
 * owns those choices and is bound to the current DESIGN.md candidate.
 */
import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { isMainModule, parseArgs, resolveCallerPath } from "../kernel/lib/cli.js";
import {
  designAcceptanceScopeSchema,
  designArtifact,
  designBrowserBuildFingerprint,
  designBrowserBuildManifestSchema,
  designBrowserProofConfigSchema,
  designBrowserResourceManifestSchema,
  designBrowserRuntimeProofReceiptSchema,
  designBrowserSourceFingerprint,
  designCaptureReceiptSchema,
  designCandidateFingerprint,
  designInteractionReceiptSchema,
  type DesignBrowserRuntime,
} from "../checks/validation/business/design/design-acceptance.js";
import {
  designRuntimeReviewerInputsSchema,
  MAX_DESIGN_RUNTIME_CAPTURES,
  MAX_DESIGN_RUNTIME_INTERACTIONS,
} from "../checks/validation/business/design/runtime-reviewer-inputs.js";
import { loadDesignSystem } from "./lib/design-md.js";

const DEFAULT_CONFIG = "growth/landing/browser-proof.json";
const POINTER_PATH = "growth/landing/proof/browser-proof.json";
const PROOF_TOOL = { name: "b2c-browser-proof", version: "1.0.0" } as const;
export const MAX_BROWSER_SCREENSHOT_BYTES = 16 * 1024 * 1024;
export const MAX_BROWSER_OBSERVATION_TRANSCRIPT_BYTES = 1024 * 1024;
export const MAX_BROWSER_RETAINED_RESOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_BROWSER_PROOF_EVIDENCE_BYTES = 256 * 1024 * 1024;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const artifactSchema = z.strictObject({ path: nonempty, sha256: digest });
const evidenceId = nonempty.regex(/^[a-z0-9][a-z0-9._-]*$/i, "must be a filename-safe evidence id");
const selector = nonempty.max(512);
const proofSettings = z.strictObject({
  reducedMotion: z.boolean(),
  screenReader: z.boolean(),
  largeText: z.boolean(),
  javascript: z.boolean(),
});
const proofViewport = z.strictObject({ width: z.number().int().min(240).max(4096), height: z.number().int().min(240).max(4096) });

export const browserProofStepSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("click"), selector }),
  z.strictObject({ action: z.literal("fill"), selector, value: z.string().max(4096) }),
  z.strictObject({ action: z.literal("press"), selector, key: z.enum(["Enter", "Space", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) }),
  z.strictObject({ action: z.literal("wait-for"), selector, timeoutMs: z.number().int().min(50).max(5_000) }),
  z.strictObject({ action: z.literal("wait"), durationMs: z.number().int().min(0).max(3_000) }),
  z.strictObject({ action: z.literal("reload") }),
  z.strictObject({ action: z.literal("set-offline"), offline: z.boolean() }),
  z.strictObject({ action: z.literal("scroll"), x: z.number().int().min(-100_000).max(100_000), y: z.number().int().min(-100_000).max(100_000) }),
]);
export type BrowserProofStep = z.infer<typeof browserProofStepSchema>;

export const browserProofAssertionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("selector-exists"), selector }),
  z.strictObject({ kind: z.literal("selector-text-includes"), selector, value: nonempty.max(4096) }),
  z.strictObject({ kind: z.literal("selector-value-equals"), selector, value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal("selector-attribute-equals"), selector, name: nonempty.regex(/^[a-z_:][a-z0-9:_.-]*$/i), value: z.string().max(4096) }),
  z.strictObject({ kind: z.literal("selector-checked-equals"), selector, value: z.boolean() }),
  z.strictObject({ kind: z.literal("url-equals"), value: z.url({ protocol: /^https?$/ }) }),
]);
export type BrowserProofAssertion = z.infer<typeof browserProofAssertionSchema>;

const browserCaptureSpecSchema = z.strictObject({
  id: evidenceId,
  surfaceId: nonempty,
  state: nonempty,
  locale: nonempty,
  viewport: proofViewport,
  scale: z.number().finite().min(1).max(4),
  settings: proofSettings,
  steps: z.array(browserProofStepSchema).max(64),
  assertions: z.array(browserProofAssertionSchema).min(1).max(32),
});
const browserInteractionSpecSchema = z.strictObject({
  id: evidenceId,
  surfaceId: nonempty,
  interactionId: nonempty,
  locale: nonempty,
  captureIds: z
    .array(evidenceId)
    .min(1)
    .max(MAX_DESIGN_RUNTIME_CAPTURES)
    .refine((values) => new Set(values).size === values.length, "must be unique"),
  steps: z.array(browserProofStepSchema).min(1).max(64),
  assertions: z.array(browserProofAssertionSchema).min(1).max(32),
});

export const browserProofConfigSchema = designBrowserProofConfigSchema.safeExtend({
  captures: z.array(browserCaptureSpecSchema).min(1).max(MAX_DESIGN_RUNTIME_CAPTURES),
  interactions: z.array(browserInteractionSpecSchema).min(1).max(MAX_DESIGN_RUNTIME_INTERACTIONS),
});
export type BrowserProofConfig = z.infer<typeof browserProofConfigSchema>;

export const browserProofPointerSchema = z.strictObject({
  schemaVersion: z.literal(1),
  runtimeId: nonempty,
  candidateSha256: digest,
  sessionId: nonempty,
  config: artifactSchema,
  receipt: artifactSchema,
  evidenceManifest: artifactSchema,
  producedAt: z.iso.datetime({ offset: true }),
});
export type BrowserProofPointer = z.infer<typeof browserProofPointerSchema>;

export interface BrowserObservedResource {
  readonly url: string;
  readonly statusCode: number;
  readonly mimeType: string;
  readonly body: Buffer;
}

export interface BrowserProofObservation {
  readonly browserContextId: string;
  readonly browser: { readonly name: string; readonly version: string };
  readonly os: string;
  readonly launch: { readonly startedAt: string; readonly finishedAt: string; readonly transcript: unknown };
  readonly navigation: {
    readonly requestedUrl: string;
    readonly finalUrl: string;
    readonly statusCode: number;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly transcript: unknown;
  };
  readonly resources: readonly BrowserObservedResource[];
  readonly captures: readonly {
    readonly id: string;
    readonly capturedAt: string;
    readonly screenshot: Buffer;
    readonly transcript: unknown;
  }[];
  readonly interactions: readonly {
    readonly id: string;
    readonly executedAt: string;
    readonly observation: string;
    readonly transcript: unknown;
  }[];
}

export type BrowserProofObserver = (input: {
  readonly origin: string;
  readonly url: string;
  readonly resourceUrls: readonly string[];
  readonly captures: BrowserProofConfig["captures"];
  readonly interactions: BrowserProofConfig["interactions"];
  readonly executable?: string;
}) => Promise<BrowserProofObservation>;

export interface ProducedBrowserProof {
  readonly pointer: BrowserProofPointer;
  readonly runtime: DesignBrowserRuntime;
  readonly evidenceManifest: { readonly path: string; readonly sha256: string };
  readonly pointerPath: typeof POINTER_PATH;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(): string {
  return new Date().toISOString();
}

function normalizeRelative(value: string, label: string): string {
  const normalized = value.split(path.sep).join("/");
  if (path.isAbsolute(value) || value.includes("\\") || normalized.split("/").some((part) => !part || part === "." || part === ".." || part === ".git"))
    throw new Error(`${label} must be a safe workspace-relative path`);
  return normalized;
}

function inside(relative: string, ancestor: string): boolean {
  return relative === ancestor || relative.startsWith(`${ancestor}/`);
}

function parseServedUrl(value: string, label: string): URL {
  const parsed = new URL(value);
  const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
    throw new Error(`${label} must use HTTPS, except for an explicit loopback origin`);
  if (parsed.username || parsed.password || parsed.hash) throw new Error(`${label} cannot contain credentials or a fragment`);
  return parsed;
}

function writeExclusive(target: string, value: string | Buffer): void {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value, { flag: "wx" });
}

function writeJsonExclusive(target: string, value: unknown): void {
  writeExclusive(target, `${JSON.stringify(value, null, 2)}\n`);
}

function boundedJson(value: unknown, label: string): string {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_BROWSER_OBSERVATION_TRANSCRIPT_BYTES)
    throw new Error(`${label} exceeds the 1 MiB browser observation transcript limit`);
  return serialized;
}

function pngDimensions(value: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (value.length < 24 || !value.subarray(0, 8).equals(signature) || value.toString("ascii", 12, 16) !== "IHDR")
    throw new Error("Chrome capture is not a PNG with an IHDR dimension record");
  return { width: value.readUInt32BE(16), height: value.readUInt32BE(20) };
}

function writePointer(root: string, pointer: BrowserProofPointer): void {
  const target = path.join(root, POINTER_PATH);
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
}

/** Validate the authored config before a browser starts. */
export function loadBrowserProofConfig(
  root: string,
  configPath = DEFAULT_CONFIG,
): {
  config: BrowserProofConfig;
  scope: z.infer<typeof designAcceptanceScopeSchema>;
  configPath: string;
} {
  const relativeConfigPath = normalizeRelative(configPath, "browser proof config path");
  const config = browserProofConfigSchema.parse(JSON.parse(readFileSync(path.join(root, relativeConfigPath), "utf8")));
  const scope = designAcceptanceScopeSchema.parse(loadDesignSystem(root).frontmatter?.acceptance);
  const selected = config.surfaceIds.map((surfaceId) => {
    const surface = scope.surfaces.find((candidate) => candidate.id === surfaceId);
    if (!surface) throw new Error(`browser proof config names unknown acceptance surface ${surfaceId}`);
    if (surface.kind === "native") throw new Error(`browser proof config cannot select native surface ${surfaceId}`);
    if (!surface.routePath) throw new Error(`browser acceptance surface ${surfaceId} must declare routePath`);
    return surface;
  });
  const expectedRoots = [...new Set(selected.flatMap((surface) => surface.implementationPaths))].sort();
  const configuredRoots = [...config.sourceRoots].sort();
  if (expectedRoots.length !== configuredRoots.length || expectedRoots.some((entry, index) => entry !== configuredRoots[index]))
    throw new Error(`browser proof sourceRoots must equal the selected acceptance implementation paths: ${expectedRoots.join(", ")}`);
  if (config.candidateSha256 !== designCandidateFingerprint(root, scope))
    throw new Error("browser proof config candidateSha256 is stale; author it against the current accepted DESIGN.md candidate");

  const origin = parseServedUrl(config.served.origin, "served origin");
  const served = parseServedUrl(config.served.url, "served URL");
  if (config.served.origin !== origin.origin) throw new Error("served.origin must be the canonical origin without a path, query, or trailing slash");
  if (served.origin !== origin.origin || served.search) throw new Error("served.url must be a query-free URL on served.origin");
  const routes = [...new Set(selected.map((surface) => surface.routePath))];
  if (routes.length !== 1 || routes[0] !== served.pathname)
    throw new Error(`selected acceptance surfaces must all declare the served URL pathname ${served.pathname}`);

  const allEvidenceIds = [...config.captures.map((entry) => entry.id), ...config.interactions.map((entry) => entry.id)];
  if (new Set(allEvidenceIds).size !== allEvidenceIds.length) throw new Error("capture and interaction evidence IDs must be globally unique");
  for (const capture of config.captures) {
    const surface = selected.find((entry) => entry.id === capture.surfaceId);
    if (!surface) throw new Error(`capture ${capture.id} names an unselected surface ${capture.surfaceId}`);
    if (!surface.states.includes(capture.state)) throw new Error(`capture ${capture.id} names undeclared state ${capture.state}`);
    if (!surface.locales.includes(capture.locale)) throw new Error(`capture ${capture.id} names undeclared locale ${capture.locale}`);
    if ((surface.viewport === "mobile" && capture.viewport.width > 600) || (surface.viewport === "desktop" && capture.viewport.width < 900))
      throw new Error(`capture ${capture.id} viewport does not demonstrate its authored ${surface.viewport} composition`);
    if (capture.settings.screenReader || capture.settings.largeText)
      throw new Error(`capture ${capture.id} cannot claim a browser screen reader or OS large-text setting from Chrome DevTools`);
    if ((capture.state === "reduced-motion") !== capture.settings.reducedMotion)
      throw new Error(`capture ${capture.id} reduced-motion state and setting must agree`);
    if ((capture.state === "no-js") === capture.settings.javascript) throw new Error(`capture ${capture.id} no-js state and javascript setting must agree`);
  }
  const expectedCaptureKeys = selected.flatMap((surface) =>
    surface.states.flatMap((state) => surface.locales.map((locale) => `${surface.id}\0${state}\0${locale}`)),
  );
  const captureKeys = config.captures.map((capture) => `${capture.surfaceId}\0${capture.state}\0${capture.locale}`);
  if (
    new Set(captureKeys).size !== captureKeys.length ||
    captureKeys.length !== expectedCaptureKeys.length ||
    expectedCaptureKeys.some((key) => !captureKeys.includes(key))
  )
    throw new Error("browser capture specs must cover every selected surface state and locale exactly once");
  for (const interaction of config.interactions) {
    const surface = selected.find((entry) => entry.id === interaction.surfaceId);
    if (!surface) throw new Error(`interaction ${interaction.id} names an unselected surface ${interaction.surfaceId}`);
    if (!surface.interactions.some((entry) => entry.id === interaction.interactionId))
      throw new Error(`interaction ${interaction.id} names undeclared interaction ${interaction.interactionId}`);
    if (!surface.locales.includes(interaction.locale)) throw new Error(`interaction ${interaction.id} names undeclared locale ${interaction.locale}`);
    for (const captureId of interaction.captureIds) {
      const capture = config.captures.find((entry) => entry.id === captureId);
      if (!capture || capture.surfaceId !== interaction.surfaceId || capture.locale !== interaction.locale)
        throw new Error(`interaction ${interaction.id} may cite only configured captures from its own surface and locale`);
    }
  }
  const expectedInteractionKeys = selected.flatMap((surface) =>
    surface.interactions.flatMap((interaction) => surface.locales.map((locale) => `${surface.id}\0${interaction.id}\0${locale}`)),
  );
  const interactionKeys = config.interactions.map((interaction) => `${interaction.surfaceId}\0${interaction.interactionId}\0${interaction.locale}`);
  if (
    new Set(interactionKeys).size !== interactionKeys.length ||
    interactionKeys.length !== expectedInteractionKeys.length ||
    expectedInteractionKeys.some((key) => !interactionKeys.includes(key))
  )
    throw new Error("browser interaction specs must cover every selected surface interaction and locale exactly once");

  const resourcePaths = config.build.resources.map((resource) => normalizeRelative(resource.path, "build resource path"));
  for (const resourcePath of resourcePaths) {
    if (!expectedRoots.some((rootPath) => inside(resourcePath, rootPath)))
      throw new Error(`build resource is outside the selected acceptance implementation paths: ${resourcePath}`);
    designArtifact(root, resourcePath);
  }
  const entrypoint = config.build.resources.find((resource) => resource.path === config.build.entrypoint);
  if (!entrypoint || new URL(entrypoint.urlPath, origin).href !== served.href) throw new Error("the entrypoint URL path must resolve to the exact served URL");
  return { config, scope, configPath: relativeConfigPath };
}

/** Producer seam is injectable so fixtures prove materialization without opening a real browser. */
export async function produceBrowserProof(input: {
  readonly root: string;
  readonly configPath?: string;
  readonly sessionId: string;
  readonly executable?: string;
  readonly observer?: BrowserProofObserver;
}): Promise<ProducedBrowserProof> {
  const root = path.resolve(input.root);
  if (!input.sessionId.trim()) throw new Error("--session-id is required and must equal the engine-issued landing attempt identity");
  const { config, configPath } = loadBrowserProofConfig(root, input.configPath);
  const resourceUrls = config.build.resources.map((resource) => new URL(resource.urlPath, config.served.origin).href);
  const observation = await (input.observer ?? observeWithChrome)({
    origin: config.served.origin,
    url: config.served.url,
    resourceUrls,
    captures: config.captures,
    interactions: config.interactions,
    executable: input.executable,
  });
  if (observation.navigation.requestedUrl !== config.served.url || observation.navigation.finalUrl !== config.served.url)
    throw new Error("fresh browser navigation did not finish on the authored served URL");
  if (observation.navigation.statusCode < 200 || observation.navigation.statusCode > 399)
    throw new Error(`fresh browser navigation returned HTTP ${observation.navigation.statusCode}`);
  const observedCaptureIds = observation.captures.map((entry) => entry.id);
  const observedInteractionIds = observation.interactions.map((entry) => entry.id);
  if (
    new Set(observedCaptureIds).size !== observedCaptureIds.length ||
    observedCaptureIds.length !== config.captures.length ||
    config.captures.some((entry) => !observedCaptureIds.includes(entry.id))
  )
    throw new Error("browser observer did not return every configured capture exactly once");
  if (
    new Set(observedInteractionIds).size !== observedInteractionIds.length ||
    observedInteractionIds.length !== config.interactions.length ||
    config.interactions.some((entry) => !observedInteractionIds.includes(entry.id))
  )
    throw new Error("browser observer did not return every configured interaction exactly once");
  let retainedEvidenceBytes = 0;
  for (const resource of observation.resources) {
    if (resource.body.length > MAX_BROWSER_RETAINED_RESOURCE_BYTES)
      throw new Error(`retained response for ${resource.url} exceeds the 32 MiB per-resource limit`);
    retainedEvidenceBytes += resource.body.length;
  }
  for (const capture of observation.captures) {
    if (capture.screenshot.length > MAX_BROWSER_SCREENSHOT_BYTES) throw new Error(`capture ${capture.id} exceeds the 16 MiB PNG limit`);
    retainedEvidenceBytes += capture.screenshot.length + Buffer.byteLength(boundedJson(capture.transcript, `capture ${capture.id} transcript`));
  }
  for (const interaction of observation.interactions)
    retainedEvidenceBytes += Buffer.byteLength(boundedJson(interaction.transcript, `interaction ${interaction.id} transcript`));
  retainedEvidenceBytes += Buffer.byteLength(boundedJson(observation.launch.transcript, "browser launch transcript"));
  retainedEvidenceBytes += Buffer.byteLength(boundedJson(observation.navigation.transcript, "browser navigation transcript"));
  if (retainedEvidenceBytes > MAX_BROWSER_PROOF_EVIDENCE_BYTES) throw new Error("browser proof retained evidence exceeds the 256 MiB aggregate limit");

  const sourceFingerprint = designBrowserSourceFingerprint(root, [...config.sourceRoots].sort());
  const buildFiles = config.build.resources.map((resource) => designArtifact(root, resource.path));
  const entrypoint = buildFiles.find((resource) => resource.path === config.build.entrypoint)!;
  const buildManifest = designBrowserBuildManifestSchema.parse({ schemaVersion: 1, sourceFingerprint, entrypoint, files: buildFiles });
  const buildFingerprint = designBrowserBuildFingerprint(buildManifest);
  const attemptKey = sha256(`${config.runtimeId}\0${input.sessionId}\0${observation.launch.startedAt}`).slice(0, 24);
  const attemptRoot = `growth/landing/proof/browser-runtimes/${config.runtimeId}/${attemptKey}`;
  const absoluteAttemptRoot = path.join(root, attemptRoot);
  if (existsSync(absoluteAttemptRoot)) throw new Error(`browser proof attempt already exists: ${attemptRoot}`);
  mkdirSync(absoluteAttemptRoot, { recursive: true });

  try {
    const buildManifestPath = `${attemptRoot}/build-manifest.json`;
    writeJsonExclusive(path.join(root, buildManifestPath), buildManifest);
    const launchTranscriptPath = `${attemptRoot}/browser-launch.json`;
    const navigationTranscriptPath = `${attemptRoot}/browser-navigation.json`;
    writeExclusive(path.join(root, launchTranscriptPath), boundedJson(observation.launch.transcript, "browser launch transcript"));
    writeExclusive(path.join(root, navigationTranscriptPath), boundedJson(observation.navigation.transcript, "browser navigation transcript"));

    const resources = config.build.resources.map((configured, index) => {
      const url = resourceUrls[index]!;
      const observed = observation.resources.filter((resource) => resource.url === url).at(-1);
      if (!observed) throw new Error(`fresh browser did not retain a response for ${url}`);
      const buildFile = buildFiles[index]!;
      if (sha256(observed.body) !== buildFile.sha256) throw new Error(`served response bytes for ${url} do not match current build file ${configured.path}`);
      if (observed.statusCode < 200 || observed.statusCode > 399) throw new Error(`served resource ${url} returned HTTP ${observed.statusCode}`);
      const extension = path
        .extname(configured.path)
        .replace(/[^a-z0-9.]/gi, "")
        .slice(0, 12);
      const responsePath = `${attemptRoot}/responses/${sha256(url).slice(0, 24)}${extension}`;
      writeExclusive(path.join(root, responsePath), observed.body);
      return { url, buildPath: configured.path, response: designArtifact(root, responsePath) };
    });
    const resourceManifest = designBrowserResourceManifestSchema.parse({
      schemaVersion: 1,
      origin: config.served.origin,
      documentUrl: config.served.url,
      browserContextId: observation.browserContextId,
      resources,
    });
    const resourceManifestPath = `${attemptRoot}/resource-manifest.json`;
    writeJsonExclusive(path.join(root, resourceManifestPath), resourceManifest);

    const receipt = designBrowserRuntimeProofReceiptSchema.parse({
      schemaVersion: 1,
      kind: "browser-runtime-launch",
      platform: "web",
      candidateSha256: config.candidateSha256,
      tool: PROOF_TOOL,
      sessionId: input.sessionId,
      source: { root, roots: [...config.sourceRoots].sort(), fingerprint: sourceFingerprint },
      build: { fingerprint: buildFingerprint, manifest: designArtifact(root, buildManifestPath) },
      served: {
        origin: config.served.origin,
        url: config.served.url,
        resourceManifest: designArtifact(root, resourceManifestPath),
      },
      context: { id: observation.browserContextId, browser: observation.browser, os: observation.os },
      launch: {
        startedAt: observation.launch.startedAt,
        finishedAt: observation.launch.finishedAt,
        transcript: designArtifact(root, launchTranscriptPath),
      },
      navigation: {
        requestedUrl: observation.navigation.requestedUrl,
        finalUrl: observation.navigation.finalUrl,
        statusCode: observation.navigation.statusCode,
        startedAt: observation.navigation.startedAt,
        finishedAt: observation.navigation.finishedAt,
        transcript: designArtifact(root, navigationTranscriptPath),
      },
      verdict: "passed",
      startedAt: observation.launch.startedAt,
      finishedAt: observation.navigation.finishedAt,
    });
    const receiptPath = `${attemptRoot}/browser-runtime.json`;
    writeJsonExclusive(path.join(root, receiptPath), receipt);

    const captureInputs = config.captures.map((configured) => {
      const observed = observation.captures.find((entry) => entry.id === configured.id)!;
      const screenshotDimensions = pngDimensions(observed.screenshot);
      const expectedDimensions = {
        width: Math.round(configured.viewport.width * configured.scale),
        height: Math.round(configured.viewport.height * configured.scale),
      };
      if (screenshotDimensions.width !== expectedDimensions.width || screenshotDimensions.height !== expectedDimensions.height)
        throw new Error(
          `capture ${configured.id} dimensions ${screenshotDimensions.width}x${screenshotDimensions.height} do not match viewport and scale ${expectedDimensions.width}x${expectedDimensions.height}`,
        );
      if (Date.parse(observed.capturedAt) < Date.parse(receipt.finishedAt))
        throw new Error(`capture ${configured.id} occurred before the runtime navigation completed`);
      const artifactPath = `${attemptRoot}/captures/${configured.id}.png`;
      const transcriptPath = `${attemptRoot}/observations/${configured.id}.capture.json`;
      const captureReceiptPath = `${attemptRoot}/receipts/${configured.id}.capture.json`;
      writeExclusive(path.join(root, artifactPath), observed.screenshot);
      writeExclusive(path.join(root, transcriptPath), boundedJson(observed.transcript, `capture ${configured.id} transcript`));
      const captureReceipt = designCaptureReceiptSchema.parse({
        schemaVersion: 1,
        kind: "design-capture",
        surfaceId: configured.surfaceId,
        evidenceId: configured.id,
        state: configured.state,
        locale: configured.locale,
        artifact: designArtifact(root, artifactPath),
        capturedAt: observed.capturedAt,
        candidateSha256: config.candidateSha256,
        tool: PROOF_TOOL,
        sessionId: input.sessionId,
        dimensions: screenshotDimensions,
        viewport: configured.viewport,
        scale: configured.scale,
        settings: configured.settings,
        source: "browser-runtime",
        runtimeId: config.runtimeId,
        platform: "web",
        browser: observation.browser,
        browserContextId: observation.browserContextId,
        os: observation.os,
      });
      writeJsonExclusive(path.join(root, captureReceiptPath), captureReceipt);
      return {
        id: configured.id,
        surfaceId: configured.surfaceId,
        state: configured.state,
        receipt: designArtifact(root, captureReceiptPath),
        artifact: captureReceipt.artifact,
        transcript: designArtifact(root, transcriptPath),
      };
    });
    const interactionInputs = config.interactions.map((configured) => {
      const observed = observation.interactions.find((entry) => entry.id === configured.id)!;
      if (Date.parse(observed.executedAt) < Date.parse(receipt.finishedAt))
        throw new Error(`interaction ${configured.id} occurred before the runtime navigation completed`);
      const artifactPath = `${attemptRoot}/interactions/${configured.id}.json`;
      const interactionReceiptPath = `${attemptRoot}/receipts/${configured.id}.interaction.json`;
      writeExclusive(path.join(root, artifactPath), boundedJson(observed.transcript, `interaction ${configured.id} transcript`));
      const interactionReceipt = designInteractionReceiptSchema.parse({
        schemaVersion: 1,
        kind: "design-interaction",
        surfaceId: configured.surfaceId,
        evidenceId: configured.id,
        interactionId: configured.interactionId,
        locale: configured.locale,
        executedAt: observed.executedAt,
        candidateSha256: config.candidateSha256,
        artifact: designArtifact(root, artifactPath),
        tool: PROOF_TOOL,
        sessionId: input.sessionId,
        captureIds: configured.captureIds,
        result: "pass",
        observation: observed.observation,
        source: "browser-runtime",
        runtimeId: config.runtimeId,
        platform: "web",
        browser: observation.browser,
        browserContextId: observation.browserContextId,
        os: observation.os,
      });
      writeJsonExclusive(path.join(root, interactionReceiptPath), interactionReceipt);
      return {
        id: configured.id,
        surfaceId: configured.surfaceId,
        interactionId: configured.interactionId,
        receipt: designArtifact(root, interactionReceiptPath),
        artifact: interactionReceipt.artifact,
      };
    });
    const evidenceTimes = [
      receipt.finishedAt,
      ...observation.captures.map((entry) => entry.capturedAt),
      ...observation.interactions.map((entry) => entry.executedAt),
    ];
    const reviewerInputs = designRuntimeReviewerInputsSchema.parse({
      schemaVersion: 1,
      kind: "design-runtime-reviewer-inputs",
      runtime: {
        id: config.runtimeId,
        platform: "web",
        candidateSha256: config.candidateSha256,
        sessionId: input.sessionId,
        receipts: [{ kind: "browser-runtime-launch", artifact: designArtifact(root, receiptPath) }],
      },
      captures: captureInputs,
      interactions: interactionInputs,
      producedAt: new Date(Math.max(...evidenceTimes.map((value) => Date.parse(value)))).toISOString(),
    });
    const evidenceManifestPath = `${attemptRoot}/reviewer-inputs.json`;
    writeJsonExclusive(path.join(root, evidenceManifestPath), reviewerInputs);
    const evidenceManifest = designArtifact(root, evidenceManifestPath);
    const pointer = browserProofPointerSchema.parse({
      schemaVersion: 1,
      runtimeId: config.runtimeId,
      candidateSha256: config.candidateSha256,
      sessionId: input.sessionId,
      config: designArtifact(root, configPath),
      receipt: designArtifact(root, receiptPath),
      evidenceManifest,
      producedAt: reviewerInputs.producedAt,
    });
    writePointer(root, pointer);
    return {
      pointer,
      pointerPath: POINTER_PATH,
      evidenceManifest,
      runtime: {
        id: config.runtimeId,
        platform: "web",
        candidateSha256: config.candidateSha256,
        sourceFingerprint,
        buildFingerprint,
        origin: config.served.origin,
        url: config.served.url,
        browser: observation.browser,
        browserContextId: observation.browserContextId,
        os: observation.os,
        launchTranscriptSha256: receipt.launch.transcript.sha256,
        navigationTranscriptSha256: receipt.navigation.transcript.sha256,
        receipt: pointer.receipt,
      },
    };
  } catch (error) {
    rmSync(absoluteAttemptRoot, { recursive: true, force: true });
    throw error;
  }
}

interface CdpResponse {
  id?: number;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
  method?: string;
  params?: Record<string, unknown>;
}

class CdpConnection {
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Set<(event: CdpResponse) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data)) as CdpResponse;
      if (event.id !== undefined) {
        const pending = this.pending.get(event.id);
        if (!pending) return;
        this.pending.delete(event.id);
        if (event.error) pending.reject(new Error(event.error.message ?? "Chrome DevTools command failed"));
        else pending.resolve(event.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(event);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Chrome DevTools connection closed"));
      this.pending.clear();
    });
  }

  static async open(url: string): Promise<CdpConnection> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Chrome DevTools connection timed out")), 10_000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Chrome DevTools connection failed"));
      });
    });
    return new CdpConnection(socket);
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener: (event: CdpResponse) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async waitFor(method: string, sessionId: string, timeoutMs: number): Promise<CdpResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`Chrome DevTools event ${method} timed out`));
      }, timeoutMs);
      const remove = this.on((event) => {
        if (event.method !== method || event.sessionId !== sessionId) return;
        clearTimeout(timer);
        remove();
        resolve(event);
      });
    });
  }

  close(): void {
    this.socket.close();
  }
}

function chromeExecutable(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.B2C_APP_BUILDER_CHROME,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    process.platform === "darwin" ? "/Applications/Chromium.app/Contents/MacOS/Chromium" : undefined,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "linux" ? "google-chrome" : undefined,
    process.platform === "linux" ? "chromium" : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5_000 });
    if (probe.status === 0) return candidate;
  }
  throw new Error("Chrome was not found. Set B2C_APP_BUILDER_CHROME or pass --browser-executable.");
}

async function waitForDevTools(userDataDir: string, child: ChildProcess): Promise<{ port: number; webSocketUrl: string }> {
  const activePort = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools became ready (exit ${child.exitCode})`);
    if (existsSync(activePort)) {
      const [portText, browserPath] = readFileSync(activePort, "utf8").trim().split(/\r?\n/);
      const port = Number(portText);
      if (Number.isInteger(port) && port > 0 && browserPath) return { port, webSocketUrl: `ws://127.0.0.1:${port}${browserPath}` };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chrome did not publish DevToolsActivePort within 10 seconds");
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Chrome DevTools omitted ${label}`);
  return value;
}

/** Real producer: one new Chrome process, one incognito context, one exact navigation. */
export async function observeWithChrome(input: {
  readonly origin: string;
  readonly url: string;
  readonly resourceUrls: readonly string[];
  readonly executable?: string;
}): Promise<BrowserProofObservation> {
  const executable = chromeExecutable(input.executable);
  const versionProbe = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5_000 });
  const launchStartedAt = timestamp();
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), "b2c-browser-proof-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "about:blank",
  ];
  const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    if (stderr.length < 16_384) stderr += chunk.slice(0, 16_384 - stderr.length);
  });
  let connection: CdpConnection | undefined;
  let contextId: string | undefined;
  try {
    const devtools = await waitForDevTools(userDataDir, child);
    connection = await CdpConnection.open(devtools.webSocketUrl);
    const version = await connection.send("Browser.getVersion");
    const product = asString(version.product, "browser product");
    const [productName, productVersion] = product.split("/", 2);
    const browser = { name: productName || "Chrome", version: productVersion || product };
    const context = await connection.send("Target.createBrowserContext", { disposeOnDetach: true });
    contextId = asString(context.browserContextId, "browser context id");
    const target = await connection.send("Target.createTarget", { url: "about:blank", browserContextId: contextId });
    const attached = await connection.send("Target.attachToTarget", { targetId: asString(target.targetId, "target id"), flatten: true });
    const targetSessionId = asString(attached.sessionId, "target session id");
    await connection.send("Network.enable", {}, targetSessionId);
    await connection.send("Page.enable", {}, targetSessionId);
    const launchFinishedAt = timestamp();

    const responses: Array<{
      requestId: string;
      url: string;
      statusCode: number;
      mimeType: string;
      resourceType: string;
      encodedDataLength?: number;
    }> = [];
    const removeListener = connection.on((event) => {
      if (event.sessionId !== targetSessionId || event.method !== "Network.responseReceived") return;
      const response = event.params?.response;
      if (!response || typeof response !== "object") return;
      const row = response as Record<string, unknown>;
      const requestId = event.params?.requestId;
      if (typeof requestId !== "string" || typeof row.url !== "string" || typeof row.status !== "number") return;
      responses.push({
        requestId,
        url: row.url,
        statusCode: row.status,
        mimeType: typeof row.mimeType === "string" ? row.mimeType : "application/octet-stream",
        resourceType: typeof event.params?.type === "string" ? event.params.type : "Other",
        ...(typeof row.encodedDataLength === "number" ? { encodedDataLength: row.encodedDataLength } : {}),
      });
    });
    const navigationStartedAt = timestamp();
    const loaded = connection.waitFor("Page.loadEventFired", targetSessionId, 20_000);
    const navigation = await connection.send("Page.navigate", { url: input.url }, targetSessionId);
    if (typeof navigation.errorText === "string" && navigation.errorText) throw new Error(`Chrome navigation failed: ${navigation.errorText}`);
    await loaded;
    const navigationFinishedAt = timestamp();
    removeListener();
    const history = await connection.send("Page.getNavigationHistory", {}, targetSessionId);
    const entries = Array.isArray(history.entries) ? (history.entries as Array<Record<string, unknown>>) : [];
    const currentIndex = typeof history.currentIndex === "number" ? history.currentIndex : -1;
    const finalUrl = asString(entries[currentIndex]?.url, "final navigation URL");
    const documentResponse = responses.filter((response) => response.url === finalUrl && response.resourceType === "Document").at(-1);
    if (!documentResponse) throw new Error("Chrome did not report the final document response");

    const retained: BrowserObservedResource[] = [];
    for (const expectedUrl of input.resourceUrls) {
      const response = responses.filter((candidate) => candidate.url === expectedUrl).at(-1);
      if (!response) throw new Error(`Chrome did not observe configured resource ${expectedUrl}`);
      const bodyResult = await connection.send("Network.getResponseBody", { requestId: response.requestId }, targetSessionId);
      const bodyText = asString(bodyResult.body, `response body for ${expectedUrl}`);
      retained.push({
        url: response.url,
        statusCode: response.statusCode,
        mimeType: response.mimeType,
        body: Buffer.from(bodyText, bodyResult.base64Encoded === true ? "base64" : "utf8"),
      });
    }
    const launchTranscript = {
      schemaVersion: 1,
      kind: "chrome-launch",
      executable: path.basename(executable),
      version: versionProbe.stdout.trim(),
      processId: child.pid,
      arguments: args.map((argument) => (argument.startsWith("--user-data-dir=") ? "--user-data-dir=<ephemeral>" : argument)),
      devtools: { host: "127.0.0.1", port: devtools.port },
      browser,
      browserContextId: contextId,
      os: `${process.platform} ${os.release()} ${os.arch()}`,
      startedAt: launchStartedAt,
      finishedAt: launchFinishedAt,
    };
    const navigationTranscript = {
      schemaVersion: 1,
      kind: "chrome-navigation",
      browserContextId: contextId,
      requestedUrl: input.url,
      finalUrl,
      statusCode: documentResponse.statusCode,
      responses,
      retainedResourceUrls: retained.map((resource) => resource.url),
      startedAt: navigationStartedAt,
      finishedAt: navigationFinishedAt,
    };
    return {
      browserContextId: contextId,
      browser,
      os: launchTranscript.os,
      launch: { startedAt: launchStartedAt, finishedAt: launchFinishedAt, transcript: launchTranscript },
      navigation: {
        requestedUrl: input.url,
        finalUrl,
        statusCode: documentResponse.statusCode,
        startedAt: navigationStartedAt,
        finishedAt: navigationFinishedAt,
        transcript: navigationTranscript,
      },
      resources: retained,
      // The current Chrome adapter proves navigation and retained resource bytes. It does
      // not yet execute the configured capture and interaction plans, so the producer below
      // fails closed instead of publishing incomplete acceptance evidence.
      captures: [],
      interactions: [],
    };
  } finally {
    if (connection && contextId) await connection.send("Target.disposeBrowserContext", { browserContextId: contextId }).catch(() => undefined);
    connection?.close();
    if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(userDataDir, { recursive: true, force: true });
    if (child.exitCode !== null && child.exitCode !== 0 && stderr.trim()) {
      // Retain no Chrome stderr: it can contain local paths. The exit is represented by the thrown error.
    }
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (!args.workspace || !args["session-id"]) {
    console.error(
      "Usage: b2c browser-proof --workspace <dir> --session-id <engine-attempt-identity> [--config growth/landing/browser-proof.json] [--browser-executable <path>] [--json]",
    );
    return 1;
  }
  try {
    const result = await produceBrowserProof({
      root: resolveCallerPath(args.workspace),
      configPath: args.config,
      sessionId: args["session-id"],
      executable: args["browser-executable"],
    });
    if (args.json === "true") console.log(JSON.stringify(result));
    else {
      console.log(`Browser proof PASSED for ${result.runtime.id}`);
      console.log(`Receipt: ${result.runtime.receipt.path}`);
      console.log(`Pointer: ${result.pointerPath}`);
    }
    return 0;
  } catch (error) {
    console.error(`ISSUE browser_proof.failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (isMainModule(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`ISSUE browser_proof.unexpected_error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
