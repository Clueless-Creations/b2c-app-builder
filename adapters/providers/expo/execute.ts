/**
 * Dispatch Expo/EAS operations through preflight, typed argv, and an injectable process.
 * Host authority is enforced before spawn.
 *
 * #106: bind the full request identity before reuse, persist intent before spawn, and
 * recover dispatched-but-unconfirmed work from the EAS ledger in a new process.
 * Decode stays in decode.ts; this file only consumes the observation. Persistence owner
 * is EasJobLedger (not a second kernel journal). Coordinate #104 for the same
 * persist-before-effect / resume-observation contract; do not extract a generic scheduler.
 * Cross-process exclusive claim serializes bind+persist+spawn for one key. Remote ids
 * are decoded after spawnSync returns; EAS `--json` prints at process end, so streaming
 * capture before exit is not claimed.
 */

import { existsSync } from "node:fs";
import { getExpoEasCommand, isRemotePaidOrPublicEffect, type ExpoEasCommandId } from "../../../catalog/stacks/expo-eas-commands.js";
import { buildExpoEasArgv, ExpoArgvRefusal } from "./argv.js";
import { decodeExpoEasResponse, ledgerArtifactUrl, type EasDecodedObservation } from "./decode.js";
import type { ExpoCliDiscovery } from "./discovery.js";
import { inspectCommandEffects } from "./effects.js";
import { buildEasJobBinding } from "./identity.js";
import {
  EasJobLedger,
  easJobClaimPath,
  easJobLedgerPath,
  isSuccessfulBuild,
  releaseEasJobClaim,
  tryAcquireEasJobClaim,
  type EasArtifactKind,
  type EasJobBinding,
  type EasJobEntry,
  type EasJobTransport,
} from "./jobs.js";
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
  /** Override the default workspace ledger path (`.b2c/expo-eas-jobs.json`). */
  readonly ledgerPath?: string;
  /**
   * Explicit persistence boundary. Invoked after bind (before spawn) and after each
   * observation checkpoint. Defaults to `ledger.save(ledgerPath)`.
   */
  readonly persistLedger?: () => void;
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

export function expoEasLedgerFile(input: Pick<ExpoEasExecuteRequest, "cwd" | "ledgerPath">): string {
  return input.ledgerPath ?? easJobLedgerPath(input.cwd);
}

function hydrateEasLedger(input: ExpoEasExecuteRequest): void {
  if (input.ledger.entries().length > 0) return;
  const file = expoEasLedgerFile(input);
  if (existsSync(file)) input.ledger.load(file);
}

function persistEasLedger(input: ExpoEasExecuteRequest): void {
  if (input.persistLedger) {
    input.persistLedger();
    return;
  }
  input.ledger.save(expoEasLedgerFile(input));
}

function holdUncertain(message: string): ExpoEasPreflight {
  return {
    status: "hold",
    code: "mutation-uncertain",
    message,
    blocksUnrelatedWork: false,
  };
}

function holdIdentityConflict(): ExpoEasPreflight {
  return {
    status: "hold",
    code: "request-identity-conflict",
    message:
      "Idempotency key is bound to a different EAS request identity (command, project, platform, profile, environment, runtime, artifact, or source). Refusing reuse and a new dispatch. Authorize a new request; do not mint a key to evade an uncertain prior effect.",
    blocksUnrelatedWork: false,
  };
}

function priorResult(empty: ExpoEasExecuteResult, preflight: ExpoEasPreflight, entry: EasJobEntry, uncertainRemote: boolean): ExpoEasExecuteResult {
  return {
    ...empty,
    remoteId: entry.remoteId,
    jobState: entry.state,
    uncertainRemote,
    preflight,
  };
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
  const empty: ExpoEasExecuteResult = {
    invoked: false,
    preflight,
    argv: [],
    redactedArgv: [],
    sanitizedStdout: "",
    sanitizedStderr: "",
    uncertainRemote: false,
  };
  if (preflight.status !== "ready") return empty;

  const binding: EasJobBinding = buildEasJobBinding({
    cwd: input.cwd,
    operationId: input.operationId,
    target: input.target,
    project,
    platform: input.platform,
    profile: input.profile,
    environment: input.environment,
    artifactKind: input.artifactKind,
    runtimeVersion: input.runtimeVersion,
    workflowRelativePath: input.workflowRelativePath,
    autoSubmit: input.autoSubmit,
  });
  const paid = isRemotePaidOrPublicEffect(closure.vector);
  let leased = false;
  let claimed = false;
  const claimPath = easJobClaimPath(expoEasLedgerFile(input), input.idempotencyKey);

  try {
    if (paid) {
      try {
        const claim = tryAcquireEasJobClaim(claimPath, input.idempotencyKey);
        if (!claim.ok) {
          return {
            ...empty,
            preflight: holdUncertain(
              "Another process holds the EAS dispatch claim for this request. Holding mutation-uncertain. Absence of a local completion receipt is not permission to start a second paid or public effect.",
            ),
            uncertainRemote: true,
          };
        }
        claimed = true;
        hydrateEasLedger(input);
        const prior = input.ledger.reconcile(input.jobTransport, input.idempotencyKey, binding);
        switch (prior.action) {
          case "proceed":
            break;
          case "conflict":
            persistEasLedger(input);
            return {
              ...empty,
              preflight: holdIdentityConflict(),
              uncertainRemote: prior.entry.state === "uncertain",
            };
          case "reuse":
          case "reconciled":
            persistEasLedger(input);
            return priorResult(
              empty,
              prior.entry.state === "uncertain"
                ? holdUncertain("Remote job is still uncertain after reconcile. Not retrying a paid or public effect.")
                : preflight,
              prior.entry,
              prior.entry.state === "uncertain",
            );
          case "uncertain":
            persistEasLedger(input);
            return priorResult(
              empty,
              holdUncertain(
                prior.reason === "dispatched_unconfirmed"
                  ? "Dispatched EAS intent has no confirmed remote id. Holding mutation-uncertain. Absence of a completion receipt is not permission to start a second paid or public effect."
                  : "Remote job id exists but readback missed. Holding mutation-uncertain. Paid and public Expo/EAS effects are not replayed.",
              ),
              prior.entry,
              true,
            );
          default: {
            const exhaustive: never = prior;
            throw new Error(`unhandled EAS reconcile action: ${String(exhaustive)}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const identity = message.includes("expo.eas_request_identity_conflict");
        return {
          ...empty,
          preflight: identity
            ? holdIdentityConflict()
            : holdUncertain(`Refusing to retry a paid or public Expo/EAS effect until remote identity is reconciled (${message}).`),
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

    if (paid) {
      input.ledger.bindIntent(input.idempotencyKey, binding);
      leased = true;
      persistEasLedger(input);
    }

    const env = buildExpoProcessEnv({ isolatedHome: input.isolatedHome, pathValue: input.pathEnv, expoToken: input.expoToken });
    const timeoutMs = paid ? EXPO_PROCESS_MUTATION_TIMEOUT_MS : EXPO_PROCESS_READ_TIMEOUT_MS;
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
    const failedWithoutId = Boolean(paid && timedOut && !decoded.boundRemoteId);
    const uncertainRemote = decodeUncertainPaidEffect(paid, decoded, timedOut) || Boolean(paid && mappedInvalid && decoded.boundRemoteId);

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
      persistEasLedger(input);
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
  } finally {
    if (leased) input.ledger.release(input.idempotencyKey);
    if (claimed) releaseEasJobClaim(claimPath);
  }
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
