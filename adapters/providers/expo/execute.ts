/**
 * Dispatch Expo/EAS operations through preflight, typed argv, and an injectable process.
 * Host authority is enforced before spawn. Uncertain remote results are reconciled by job id.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getExpoEasCommand, isRemotePaidOrPublicEffect, type ExpoEasCommandId } from "../../../catalog/stacks/expo-eas-commands.js";
import { buildExpoEasArgv, ExpoArgvRefusal } from "./argv.js";
import { decodeExpoEasResponse, ledgerArtifactUrl, type EasDecodedObservation } from "./decode.js";
import type { ExpoCliDiscovery } from "./discovery.js";
import { inspectCommandEffects } from "./effects.js";
import { EasJobLedger, isSuccessfulBuild, type EasArtifactKind, type EasJobBinding, type EasJobTransport } from "./jobs.js";
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
  readonly observedRemoteIds?: readonly string[];
  readonly jobState?: string;
  readonly submitStage?: SubmitStageReading;
  readonly sanitizedStdout: string;
  readonly sanitizedStderr: string;
  readonly uncertainRemote: boolean;
  readonly decode?: EasDecodedObservation;
}

function sourceFingerprint(cwd: string): string {
  const pieces = ["eas.json", "app.json", "package.json", ".easignore"].map((relative) => {
    const file = path.join(cwd, relative);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  });
  return createHash("sha256").update(pieces.join("\n")).digest("hex");
}

function decodeUncertainPaidEffect(paid: boolean, decoded: EasDecodedObservation, timedOut: boolean): boolean {
  if (!paid) return false;
  if (timedOut) return true;
  switch (decoded.code) {
    case "malformed-json":
    case "wrong-shape":
    case "unsupported-multiplicity":
    case "target-mismatch":
    case "empty":
      return true;
    case "ok":
    case "partial":
    case "not-json":
    case "unsupported-command":
      return false;
    default: {
      const exhaustive: never = decoded.code;
      throw new Error(`unhandled EAS decode code: ${String(exhaustive)}`);
    }
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

  // #106 owns comparing the current request binding before reuse and persisting intent
  // before spawn. This executor still reconciles by idempotency key first; do not treat a
  // decode change as that durability repair.
  if (isRemotePaidOrPublicEffect(closure.vector)) {
    try {
      const prior = input.ledger.reconcile(input.jobTransport, input.idempotencyKey);
      switch (prior.action) {
        case "proceed":
          break;
        case "reuse":
        case "reconciled":
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
        case "uncertain":
          return {
            ...empty,
            remoteId: prior.entry.remoteId,
            jobState: prior.entry.state,
            uncertainRemote: true,
            preflight: {
              status: "hold",
              code: "mutation-uncertain",
              message: "Remote job id exists but readback missed. Holding mutation-uncertain. Paid and public Expo/EAS effects are not replayed.",
              blocksUnrelatedWork: false,
            },
          };
        default: {
          const exhaustive: never = prior;
          throw new Error(`unhandled EAS reconcile action: ${String(exhaustive)}`);
        }
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
  const decoded = decodeExpoEasResponse({
    commandId: input.operationId,
    stdout: processResult.stdout,
    expected: {
      platform: input.platform,
      profile: input.profile,
      easProjectId: input.target.approvedProjectId ?? project.linkedProjectId,
      buildId: input.buildId,
      submissionId: input.submissionId,
    },
  });
  const mapped = decoded.jobState;
  const mappedInvalid = mapped === undefined;
  const timedOut = processResult.timedOut || processResult.cancelled;
  const paid = isRemotePaidOrPublicEffect(closure.vector);
  const failedWithoutId = Boolean(paid && timedOut && !decoded.boundRemoteId);
  const uncertainRemote = decodeUncertainPaidEffect(paid, decoded, timedOut) || Boolean(paid && mappedInvalid && decoded.boundRemoteId);

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
  if (paid) {
    const state = failedWithoutId
      ? "uncertain"
      : uncertainRemote
        ? "uncertain"
        : mappedInvalid
          ? processResult.status === 0
            ? "uncertain"
            : "errored"
          : (mapped ?? "uncertain");
    input.ledger.record(input.idempotencyKey, binding, {
      remoteId: decoded.boundRemoteId,
      state,
      artifactUrl: ledgerArtifactUrl(decoded),
    });
  }

  const submitStage =
    spec.id === "eas.submit" || spec.id === "eas.submit.view"
      ? interpretSubmitOutcome({ platform: input.platform ?? "ios", easStatus: decoded.nativeStatus, json: tryJson(processResult.stdout) })
      : undefined;
  const successClaimed = isSuccessfulBuild(input.ledger.get(input.idempotencyKey));
  return {
    invoked: true,
    preflight,
    argv,
    redactedArgv: redactExpoArgv(argv),
    process: processResult,
    remoteId: decoded.boundRemoteId,
    observedRemoteIds: decoded.observedRemoteIds,
    jobState: mappedInvalid ? (uncertainRemote || failedWithoutId ? "uncertain" : undefined) : mapped,
    submitStage,
    sanitizedStdout,
    sanitizedStderr,
    uncertainRemote: uncertainRemote || failedWithoutId || (Boolean(decoded.nativeStatus) && mappedInvalid && !successClaimed),
    decode: decoded,
  };
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
