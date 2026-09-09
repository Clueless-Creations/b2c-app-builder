/**
 * Dispatch Expo/EAS operations through preflight, typed argv, and an injectable process.
 * Host authority is enforced before spawn. Uncertain remote results are reconciled by job id.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getExpoEasCommand, isRemotePaidOrPublicEffect, type ExpoEasCommandId } from "../../../catalog/stacks/expo-eas-commands.js";
import { buildExpoEasArgv, ExpoArgvRefusal } from "./argv.js";
import type { ExpoCliDiscovery } from "./discovery.js";
import { inspectCommandEffects } from "./effects.js";
import { EasJobLedger, isSuccessfulBuild, mapEasBuildStatus, type EasArtifactKind, type EasJobBinding, type EasJobTransport } from "./jobs.js";
import { assessExpoEasPreflight, type ExpoEasPreflight, type ExpoEasTarget } from "./preflight.js";
import { inspectExpoProject } from "./project-config.js";
import {
  EXPO_PROCESS_MUTATION_TIMEOUT_MS,
  EXPO_PROCESS_READ_TIMEOUT_MS,
  assertTrustedExpoProcessRequest,
  buildExpoProcessEnv,
  type ExpoProcessResult,
  type ExpoProcessRunner,
} from "./process.js";
import { argvContainsSecret, redactExpoArgv, sanitizeExpoProcessText } from "./sanitize.js";
import { interpretSubmitOutcome, type SubmitStageReading } from "./store-handoff.js";

export interface ExpoEasExecuteRequest {
  readonly operationId: ExpoEasCommandId;
  readonly executable: string;
  readonly cwd: string;
  readonly isolatedHome: string;
  readonly pathEnv: string;
  readonly expoToken?: string;
  readonly run: ExpoProcessRunner;
  readonly discovery: ExpoCliDiscovery;
  readonly target: ExpoEasTarget;
  readonly platform?: "ios" | "android";
  readonly profile?: string;
  readonly buildId?: string;
  readonly submissionId?: string;
  readonly workflowRelativePath?: string;
  readonly autoSubmit?: boolean;
  readonly idempotencyKey: string;
  readonly ledger: EasJobLedger;
  readonly jobTransport: EasJobTransport;
  readonly environment?: string;
  readonly artifactKind?: EasArtifactKind;
  readonly runtimeVersion?: string;
  readonly requestProjectId?: string;
}

export interface ExpoEasExecuteResult {
  readonly invoked: boolean;
  readonly preflight: ExpoEasPreflight;
  readonly argv: readonly string[];
  readonly redactedArgv: readonly string[];
  readonly process?: ExpoProcessResult;
  readonly remoteId?: string;
  readonly jobState?: string;
  readonly submitStage?: SubmitStageReading;
  readonly sanitizedStdout: string;
  readonly sanitizedStderr: string;
  readonly uncertainRemote: boolean;
}

function sourceFingerprint(cwd: string): string {
  const pieces = ["eas.json", "app.json", "package.json", ".easignore"].map((relative) => {
    const file = path.join(cwd, relative);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  });
  return createHash("sha256").update(pieces.join("\n")).digest("hex");
}

function parseRemoteId(stdout: string): { id?: string; status?: string; artifactUrl?: string } {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    const nested = Array.isArray(record.builds) ? record.builds[0] : undefined;
    const body = nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;
    const id = typeof body.id === "string" ? body.id : typeof record.buildId === "string" ? record.buildId : undefined;
    const status = typeof body.status === "string" ? body.status : typeof record.status === "string" ? record.status : undefined;
    const artifactUrl =
      typeof body.artifactsUrl === "string" ? body.artifactsUrl : typeof body.applicationArchiveUrl === "string" ? body.applicationArchiveUrl : undefined;
    return { id, status, artifactUrl };
  } catch {
    return {};
  }
}

export function runExpoEasCommand(input: ExpoEasExecuteRequest): ExpoEasExecuteResult {
  const spec = getExpoEasCommand(input.operationId);
  const project = inspectExpoProject(input.cwd);
  const closure = inspectCommandEffects(project, {
    commandId: input.operationId,
    profile: input.profile,
    autoSubmitRequested: input.autoSubmit,
    workflowRelativePath: input.workflowRelativePath,
  });
  const preflight = assessExpoEasPreflight({
    discovery: input.discovery,
    commandId: input.operationId,
    target: input.target,
    project,
    closure,
    requestProjectId: input.requestProjectId,
    requestProfile: input.profile,
    requestPlatform: input.platform,
  });
  const empty = {
    invoked: false,
    preflight,
    argv: [] as string[],
    redactedArgv: [] as string[],
    sanitizedStdout: "",
    sanitizedStderr: "",
    uncertainRemote: false,
  };
  if (preflight.status !== "ready") return empty;

  if (isRemotePaidOrPublicEffect(closure.vector)) {
    try {
      const prior = input.ledger.reconcile(input.jobTransport, input.idempotencyKey);
      if (prior.action === "reuse" || prior.action === "reconciled") {
        return {
          ...empty,
          remoteId: prior.entry.remoteId,
          jobState: prior.entry.state,
          uncertainRemote: prior.entry.state === "uncertain",
          preflight:
            prior.entry.state === "uncertain"
              ? {
                  status: "hold",
                  code: "mutation-uncertain",
                  message: "Remote job is still uncertain after reconcile. Not retrying a paid or public effect.",
                  blocksUnrelatedWork: false,
                }
              : preflight,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...empty,
        preflight: {
          status: "hold",
          code: "mutation-uncertain",
          message: `Refusing to retry a paid or public Expo/EAS effect until remote identity is reconciled (${message}).`,
          blocksUnrelatedWork: false,
        },
        uncertainRemote: true,
      };
    }
  }

  let argv: string[];
  try {
    argv = buildExpoEasArgv({
      operationId: input.operationId,
      platform: input.platform,
      profile: input.profile,
      buildId: input.buildId,
      submissionId: input.submissionId,
      workflowRelativePath: input.workflowRelativePath,
      hostAuthorityGranted: input.target.hostAuthorityGranted,
      autoSubmit: input.autoSubmit,
    });
  } catch (error) {
    const message = error instanceof ExpoArgvRefusal ? error.message : String(error);
    const code = error instanceof ExpoArgvRefusal && error.code === "latest-refused" ? "latest-refused" : "unsupported-operation";
    return {
      ...empty,
      preflight: { status: "hold", code, message, blocksUnrelatedWork: false },
    };
  }

  if (input.expoToken && argvContainsSecret(argv, input.expoToken)) {
    return {
      ...empty,
      argv,
      redactedArgv: redactExpoArgv(argv),
      preflight: { status: "hold", code: "missing-auth", message: "Refusing to put the Expo token into argv.", blocksUnrelatedWork: false },
    };
  }

  const env = buildExpoProcessEnv({ isolatedHome: input.isolatedHome, pathValue: input.pathEnv, expoToken: input.expoToken });
  const timeoutMs = isRemotePaidOrPublicEffect(closure.vector) ? EXPO_PROCESS_MUTATION_TIMEOUT_MS : EXPO_PROCESS_READ_TIMEOUT_MS;
  const request = { executable: input.executable, argv, cwd: input.cwd, env, timeoutMs };
  assertTrustedExpoProcessRequest(request);
  const processResult = input.run(request);
  const sanitizedStdout = sanitizeExpoProcessText(processResult.stdout);
  const sanitizedStderr = sanitizeExpoProcessText(processResult.stderr);
  const parsed = parseRemoteId(processResult.stdout);
  const mapped = mapEasBuildStatus(parsed.status);
  const timedOut = processResult.timedOut || processResult.cancelled;
  const uncertainRemote = Boolean(isRemotePaidOrPublicEffect(closure.vector) && (timedOut || mapped === "invalid") && parsed.id);
  const failedWithoutId = Boolean(isRemotePaidOrPublicEffect(closure.vector) && timedOut && !parsed.id);

  const binding: EasJobBinding = {
    sourceFingerprint: sourceFingerprint(input.cwd),
    profile: input.profile ?? "unspecified",
    platform: input.platform ?? "ios",
    environment: input.environment ?? "unspecified",
    artifactKind: input.artifactKind ?? "unknown",
    runtimeVersion: input.runtimeVersion,
    commandId: input.operationId,
    easProjectId: input.target.approvedProjectId ?? project.linkedProjectId,
  };
  if (isRemotePaidOrPublicEffect(closure.vector)) {
    const state = failedWithoutId
      ? "uncertain"
      : uncertainRemote
        ? "uncertain"
        : mapped === "invalid"
          ? processResult.status === 0
            ? "uncertain"
            : "errored"
          : mapped;
    input.ledger.record(input.idempotencyKey, binding, {
      remoteId: parsed.id,
      state,
      artifactUrl: parsed.artifactUrl,
    });
  }

  const submitStage =
    spec.id === "eas.submit" || spec.id === "eas.submit.view"
      ? interpretSubmitOutcome({ platform: input.platform ?? "ios", easStatus: parsed.status, json: tryJson(processResult.stdout) })
      : undefined;
  const successClaimed = isSuccessfulBuild(input.ledger.get(input.idempotencyKey));
  return {
    invoked: true,
    preflight,
    argv,
    redactedArgv: redactExpoArgv(argv),
    process: processResult,
    remoteId: parsed.id,
    jobState: mapped === "invalid" ? (uncertainRemote || failedWithoutId ? "uncertain" : undefined) : mapped,
    submitStage,
    sanitizedStdout,
    sanitizedStderr,
    uncertainRemote: uncertainRemote || failedWithoutId || (Boolean(parsed.status) && mapped === "invalid" && !successClaimed),
  };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
