#!/usr/bin/env node
/** Landing producer gate for the strict `b2c browser-proof` bundle. */
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { outputFingerprintPath } from "../../../../kernel/engine/artifact-fingerprint.js";
import { isMainModule } from "../../../../kernel/lib/cli.js";
import { browserProofPointerSchema, loadBrowserProofConfig } from "../../../../tooling/browser-proof.js";
import { issue, parseCliArgs, reportAndExit, type Issue } from "../../../../tooling/lib/launch-state.js";
import { designRuntimeReviewerInputsSchema } from "./runtime-reviewer-inputs.js";
import {
  designArtifact,
  designBrowserBuildFingerprint,
  designBrowserBuildManifestSchema,
  designBrowserResourceManifestSchema,
  designBrowserRuntimeProofReceiptSchema,
  designBrowserSourceFingerprint,
} from "./design-acceptance.js";

const POINTER_PATH = "growth/landing/proof/browser-proof.json";
const LANDING_NODE = "run.growth.pre-launch-funnel-landing-waitlist";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const timestamp = z.iso.datetime({ offset: true });
const runStateSchema = z
  .object({
    artifactBindings: z.array(
      z
        .object({
          path: nonempty,
          fingerprint: nonempty,
          accepted: z.boolean(),
          producedBy: nonempty.optional(),
          attemptId: nonempty.optional(),
        })
        .passthrough(),
    ),
    nodes: z.record(
      z.string(),
      z
        .object({
          status: nonempty,
          blocker: nonempty.optional(),
          acceptedOutputFingerprint: digest.optional(),
          attempts: z.array(
            z
              .object({
                id: nonempty,
                status: nonempty,
                ownerSessionId: nonempty,
                startedAt: timestamp.optional(),
                finishedAt: timestamp.optional(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function normalizeBindingPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function shaArtifactMatches(root: string, value: { path: string; sha256: string }): boolean {
  return designArtifact(root, value.path).sha256 === value.sha256;
}

function sameArtifact(left: { path: string; sha256: string }, right: { path: string; sha256: string }): boolean {
  return left.path === right.path && left.sha256 === right.sha256;
}

function exactArtifacts(actual: Array<{ path: string; sha256: string }>, expected: Array<{ path: string; sha256: string }>): boolean {
  if (actual.length !== expected.length || new Set(actual.map((entry) => entry.path)).size !== actual.length) return false;
  return expected.every((entry) => actual.some((candidate) => sameArtifact(candidate, entry)));
}

/** Fail closed on both material tamper and a receipt copied from another engine attempt. */
export function validateBrowserRuntimeProof(root: string, configPath = "growth/landing/browser-proof.json"): Issue[] {
  const issues: Issue[] = [];
  const fail = (code: string, message: string, file = POINTER_PATH): void => {
    issues.push(issue("error", `browser_runtime_proof.${code}`, message, file));
  };
  const attempt = <T>(code: string, work: () => T, file = POINTER_PATH): T | undefined => {
    try {
      return work();
    } catch (error) {
      fail(code, error instanceof Error ? error.message : String(error), file);
      return undefined;
    }
  };
  const checkArtifact = (value: { path: string; sha256: string }, code = "artifact"): boolean => {
    const matches = attempt(code, () => shaArtifactMatches(root, value), value.path);
    if (matches === false) fail("artifact_tamper", `Artifact bytes changed after browser proof: ${value.path}`, value.path);
    return matches === true;
  };

  const loaded = attempt("config", () => loadBrowserProofConfig(root, configPath), configPath);
  const pointer = attempt("pointer", () => browserProofPointerSchema.parse(JSON.parse(readFileSync(path.join(root, POINTER_PATH), "utf8"))), POINTER_PATH);
  if (!loaded || !pointer) return issues;
  const configArtifact = attempt("config", () => designArtifact(root, loaded.configPath), loaded.configPath);
  if (!configArtifact || !sameArtifact(pointer.config, configArtifact))
    fail("config_tamper", "browser proof pointer does not bind the current authored config", loaded.configPath);
  if (pointer.runtimeId !== loaded.config.runtimeId || pointer.candidateSha256 !== loaded.config.candidateSha256)
    fail("pointer_identity", "browser proof pointer runtime or candidate differs from the authored config");
  if (!pointer.receipt.path.startsWith(`growth/landing/proof/browser-runtimes/${loaded.config.runtimeId}/`))
    fail("receipt_path", "browser runtime receipt must stay in this configured runtime's producer-owned proof lane", pointer.receipt.path);
  if (!checkArtifact(pointer.receipt, "receipt")) return issues;
  const receipt = attempt(
    "receipt",
    () => designBrowserRuntimeProofReceiptSchema.parse(JSON.parse(readFileSync(path.join(root, pointer.receipt.path), "utf8"))),
    pointer.receipt.path,
  );
  if (!receipt) return issues;

  const expectedRoots = [...loaded.config.sourceRoots].sort();
  const sourceFingerprint = attempt("source", () => designBrowserSourceFingerprint(root, expectedRoots), loaded.configPath);
  const canonicalRoot = attempt("source", () => realpathSync(root), loaded.configPath);
  const receiptRoot = attempt("source", () => realpathSync(receipt.source.root), pointer.receipt.path);
  if (
    !sourceFingerprint ||
    !canonicalRoot ||
    !receiptRoot ||
    canonicalRoot !== receiptRoot ||
    receipt.source.roots.length !== expectedRoots.length ||
    expectedRoots.some((entry, index) => receipt.source.roots[index] !== entry) ||
    receipt.source.fingerprint !== sourceFingerprint
  )
    fail("source_identity", "browser receipt does not identify the current configured source roots and canonical workspace", pointer.receipt.path);

  for (const artifact of [receipt.build.manifest, receipt.served.resourceManifest, receipt.launch.transcript, receipt.navigation.transcript])
    checkArtifact(artifact);
  const evidencePaths = [receipt.build.manifest.path, receipt.served.resourceManifest.path, receipt.launch.transcript.path, receipt.navigation.transcript.path];
  if (new Set(evidencePaths).size !== evidencePaths.length || evidencePaths.some((entry) => !entry.startsWith("growth/landing/proof/")))
    fail("evidence_paths", "build, resource, launch, and navigation evidence must be distinct files in the landing proof lane");
  const buildManifest = attempt(
    "build_manifest",
    () => designBrowserBuildManifestSchema.parse(JSON.parse(readFileSync(path.join(root, receipt.build.manifest.path), "utf8"))),
    receipt.build.manifest.path,
  );
  const resourceManifest = attempt(
    "resource_manifest",
    () => designBrowserResourceManifestSchema.parse(JSON.parse(readFileSync(path.join(root, receipt.served.resourceManifest.path), "utf8"))),
    receipt.served.resourceManifest.path,
  );
  if (!buildManifest || !resourceManifest) return issues;
  const configuredBuild = loaded.config.build.resources.map((resource) => designArtifact(root, resource.path));
  const configuredEntrypoint = configuredBuild.find((resource) => resource.path === loaded.config.build.entrypoint)!;
  if (
    buildManifest.sourceFingerprint !== sourceFingerprint ||
    !sameArtifact(buildManifest.entrypoint, configuredEntrypoint) ||
    !exactArtifacts(buildManifest.files, configuredBuild) ||
    receipt.build.fingerprint !== designBrowserBuildFingerprint(buildManifest)
  )
    fail("build_identity", "browser receipt build manifest does not match every current configured build byte", receipt.build.manifest.path);

  const expectedResourceRows = loaded.config.build.resources.map((resource) => ({
    url: new URL(resource.urlPath, loaded.config.served.origin).href,
    buildPath: resource.path,
  }));
  if (
    resourceManifest.origin !== loaded.config.served.origin ||
    resourceManifest.documentUrl !== loaded.config.served.url ||
    resourceManifest.browserContextId !== receipt.context.id ||
    resourceManifest.resources.length !== expectedResourceRows.length
  )
    fail("resource_identity", "served resource manifest does not identify the configured page and fresh browser context", receipt.served.resourceManifest.path);
  for (const expected of expectedResourceRows) {
    const resource = resourceManifest.resources.find((candidate) => candidate.url === expected.url && candidate.buildPath === expected.buildPath);
    const buildFile = configuredBuild.find((candidate) => candidate.path === expected.buildPath)!;
    if (!resource || !checkArtifact(resource.response, "response") || resource.response.sha256 !== buildFile.sha256)
      fail(
        "served_bytes",
        `retained response for ${expected.url} does not match current build file ${expected.buildPath}`,
        receipt.served.resourceManifest.path,
      );
  }

  if (
    pointer.sessionId !== receipt.sessionId ||
    receipt.tool.name !== "b2c-browser-proof" ||
    receipt.candidateSha256 !== loaded.config.candidateSha256 ||
    receipt.source.fingerprint !== sourceFingerprint ||
    receipt.served.origin !== loaded.config.served.origin ||
    receipt.served.url !== loaded.config.served.url ||
    receipt.navigation.requestedUrl !== loaded.config.served.url ||
    receipt.navigation.finalUrl !== loaded.config.served.url ||
    receipt.context.id !== resourceManifest.browserContextId
  )
    fail("receipt_identity", "browser receipt, pointer, source, URL, or context identities disagree", pointer.receipt.path);
  // The producer stamps the pointer with the reviewer inputs' producedAt: the latest of the receipt
  // finish, every capture, and every interaction. Bind the pointer to that exact manifest rather
  // than to the navigation finish, which precedes the evidence it points at.
  if (!pointer.evidenceManifest.path.startsWith(`growth/landing/proof/browser-runtimes/${loaded.config.runtimeId}/`))
    fail("evidence_manifest_path", "browser reviewer inputs must stay in this configured runtime's producer-owned proof lane", pointer.evidenceManifest.path);
  const reviewerInputs = checkArtifact(pointer.evidenceManifest, "evidence_manifest")
    ? attempt(
        "evidence_manifest",
        () => designRuntimeReviewerInputsSchema.parse(JSON.parse(readFileSync(path.join(root, pointer.evidenceManifest.path), "utf8"))),
        pointer.evidenceManifest.path,
      )
    : undefined;
  if (
    !reviewerInputs ||
    reviewerInputs.runtime.platform !== "web" ||
    reviewerInputs.runtime.id !== loaded.config.runtimeId ||
    reviewerInputs.runtime.candidateSha256 !== loaded.config.candidateSha256 ||
    reviewerInputs.runtime.sessionId !== receipt.sessionId ||
    !reviewerInputs.runtime.receipts.some((entry) => entry.kind === "browser-runtime-launch" && sameArtifact(entry.artifact, pointer.receipt)) ||
    pointer.producedAt !== reviewerInputs.producedAt ||
    Date.parse(pointer.producedAt) < Date.parse(receipt.finishedAt)
  )
    fail(
      "evidence_identity",
      "browser proof pointer must bind the reviewer inputs produced for this receipt's attempt, dated no earlier than the receipt finished",
      pointer.evidenceManifest.path,
    );
  const startedAt = Date.parse(receipt.startedAt);
  const launchStartedAt = Date.parse(receipt.launch.startedAt);
  const launchFinishedAt = Date.parse(receipt.launch.finishedAt);
  const navigationStartedAt = Date.parse(receipt.navigation.startedAt);
  const navigationFinishedAt = Date.parse(receipt.navigation.finishedAt);
  const finishedAt = Date.parse(receipt.finishedAt);
  if (
    startedAt !== launchStartedAt ||
    launchFinishedAt < launchStartedAt ||
    navigationStartedAt < launchFinishedAt ||
    navigationFinishedAt < navigationStartedAt ||
    finishedAt !== navigationFinishedAt
  )
    fail("chronology", "browser receipt must launch then navigate in one monotonic producer timeline", pointer.receipt.path);

  const runState = attempt(
    "run_state",
    () => runStateSchema.parse(JSON.parse(readFileSync(path.join(root, "run/run-state.json"), "utf8"))),
    "run/run-state.json",
  );
  if (!runState) return issues;
  const state = runState.nodes[LANDING_NODE];
  const currentAttempt = state?.attempts.at(-1);
  const pending = state?.status === "blocked" && state.blocker === "Verification required" && currentAttempt?.status === "blocked";
  const accepted = state?.status === "succeeded" && currentAttempt?.status === "succeeded";
  if (!state || !currentAttempt || (!pending && !accepted)) {
    fail("attempt", "browser proof requires the current engine-issued landing producer attempt", "run/run-state.json");
    return issues;
  }
  const binding = runState.artifactBindings.find(
    (candidate) =>
      normalizeBindingPath(candidate.path) === "growth/landing" && candidate.producedBy === LANDING_NODE && candidate.attemptId === currentAttempt.id,
  );
  if (!binding || binding.fingerprint !== outputFingerprintPath(path.join(root, "growth/landing")) || binding.accepted !== accepted)
    fail("attempt_binding", "current growth/landing bytes are not bound to the current producer attempt and verification state", "run/run-state.json");
  if (receipt.sessionId !== currentAttempt.ownerSessionId)
    fail("session_identity", "`b2c browser-proof --session-id` must equal the current engine-issued landing attempt identity", pointer.receipt.path);
  if (
    !currentAttempt.startedAt ||
    !currentAttempt.finishedAt ||
    startedAt < Date.parse(currentAttempt.startedAt) ||
    finishedAt > Date.parse(currentAttempt.finishedAt)
  )
    fail("attempt_chronology", "browser launch and navigation must occur inside the current landing producer attempt", pointer.receipt.path);
  return issues;
}

if (isMainModule(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  reportAndExit("Browser runtime proof check", validateBrowserRuntimeProof(args.root));
}
