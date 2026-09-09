/**
 * Dispatch reviewed RevenueCat CLI operations through preflight, typed argv, and
 * an injectable process. Host authority is enforced before spawn.
 *
 * #104: bind the full request identity before reuse, persist intent before spawn,
 * and recover dispatched-but-unconfirmed writes from the RevenueCat CLI ledger in
 * a new process. Decode is owned by cli-decode.ts (`decodeRevenueCatCliResponse`).
 * Persistence owner is RevenueCatCliLedger (not a second kernel journal).
 * Coordinate #106 for the same persist-before-effect / resume-observation
 * contract; do not extract a generic scheduler.
 */
import { existsSync } from "node:fs";
import { CLI_PROCESS_MUTATION_TIMEOUT_MS, CLI_PROCESS_READ_TIMEOUT_MS, buildCliProcessEnv, type CliProcessResult, type CliProcessRunner } from "./cli-process.js";
import type { RevenueCatCliDiscovery } from "./cli-discovery.js";
import {
  CLI_PROOF_COLLECTOR,
  CliArgvRefusal,
  buildRevenueCatCliArgv,
  getRevenueCatCliOperation,
  isMutationEffect,
  type CliArgvRequest,
  type CliOperationSpec,
} from "./cli-operations.js";
import {
  assessRevenueCatCliPreflight,
  classifyMutationFailureKind,
  mutationDispatchIsUncertain,
  type RevenueCatCliPreflight,
  type RevenueCatCliTarget,
} from "./cli-preflight.js";
import {
  decodeRevenueCatCliResponse,
  type RevenueCatCliDecodeExpected,
  type RevenueCatCliJsonOutcome,
  type RevenueCatCliObservation,
} from "./cli-decode.js";
import {
  buildRevenueCatCliBinding,
  extractRevenueCatCliRemoteId,
  jsonFromWriteSnapshot,
  revenueCatCliLedgerPath,
  snapshotWriteJson,
} from "./cli-ledger.js";
import type {
  CliEffectProgress,
  CliMutationFailureKind,
  CliNextAction,
  RevenueCatCliLedger,
  RevenueCatCliLedgerEntry,
  RevenueCatCliWriteSnapshot,
} from "./cli-ledger.js";

export {
  extractEntitlementIds,
  extractResourceIds,
  interpretOfferingPreview,
  offeringVerifyIsComplete,
  paginationState,
  parseRevenueCatCliJson,
} from "./cli-decode.js";
export type { RevenueCatCliJsonOutcome, RevenueCatCliObservation };

export interface RevenueCatCliRunRequest extends CliArgvRequest {
  readonly executable: string;
  readonly cwd: string;
  readonly isolatedHome: string;
  readonly pathEnv: string;
  readonly apiKey?: string;
  readonly run: CliProcessRunner;
  readonly target: RevenueCatCliTarget;
  readonly discovery: RevenueCatCliDiscovery;
  readonly idempotencyKey?: string;
  readonly ledger?: RevenueCatCliLedger;
  /** Override the default workspace ledger path (`.b2c/revenuecat-cli-effects.json`). */
  readonly ledgerPath?: string;
  /**
   * Explicit persistence boundary. Invoked after bind (before spawn) and after each
   * observation checkpoint. Defaults to `ledger.save(ledgerPath)`.
   */
  readonly persistLedger?: () => void;
}

export interface RevenueCatCliRunResult {
  readonly invoked: boolean;
  readonly resumed?: boolean;
  readonly preflight: RevenueCatCliPreflight;
  readonly operation: CliOperationSpec;
  readonly argv: readonly string[];
  readonly process?: CliProcessResult;
  readonly json?: RevenueCatCliJsonOutcome;
  readonly observation?: RevenueCatCliObservation;
  readonly collector: typeof CLI_PROOF_COLLECTOR;
  readonly uncertainMutation: boolean;
  readonly replaySafe: boolean;
  readonly remoteId?: string;
  readonly requestIdentity?: string;
  readonly nextAction?: CliNextAction;
  readonly effectProgress?: CliEffectProgress;
  readonly failureKind?: CliMutationFailureKind;
}

function argvRefusalHold(error: unknown): RevenueCatCliPreflight["code"] {
  if (!(error instanceof CliArgvRefusal)) return "unsafe-override";
  switch (error.code) {
    case "ambiguous-target":
      return "ambiguous-project";
    case "missing-resource":
    case "invalid-chart":
      return "unscoped-observation";
    case "unknown-operation":
    case "unsupported-operation":
    case "model-authored-flag":
    case "missing-project":
    case "missing-app":
    case "yes-without-authority":
      return "unsafe-override";
    default: {
      const exhaustive: never = error.code;
      return exhaustive;
    }
  }
}

export function revenueCatCliLedgerFile(input: Pick<RevenueCatCliRunRequest, "cwd" | "ledgerPath">): string {
  return input.ledgerPath ?? revenueCatCliLedgerPath(input.cwd);
}

function hydrateRevenueCatCliLedger(input: RevenueCatCliRunRequest): void {
  if (!input.ledger) return;
  if (input.ledger.entries().length > 0) return;
  const file = revenueCatCliLedgerFile(input);
  if (existsSync(file)) input.ledger.load(file);
}

function persistRevenueCatCliLedger(input: RevenueCatCliRunRequest): void {
  if (!input.ledger) return;
  if (input.persistLedger) {
    input.persistLedger();
    return;
  }
  input.ledger.save(revenueCatCliLedgerFile(input));
}

function holdIdentityConflict(): RevenueCatCliPreflight {
  return {
    status: "hold",
    code: "request-identity-conflict",
    message:
      "Idempotency key is bound to a different RevenueCat CLI request identity (operation, project, app, product, user, or payload). Refusing reuse and a new dispatch. Authorize a new request; do not mint a key to evade an uncertain prior effect.",
    blocksUnrelatedWork: false,
  };
}

function holdUncertain(message: string): RevenueCatCliPreflight {
  return {
    status: "hold",
    code: "mutation-uncertain",
    message,
    blocksUnrelatedWork: false,
  };
}

function decodeExpected(input: Pick<RevenueCatCliRunRequest, "appId" | "offeringId">): RevenueCatCliDecodeExpected {
  return { appId: input.appId, offeringId: input.offeringId };
}

function decodeFromWriteSnapshot(
  operationId: string,
  snapshot: RevenueCatCliWriteSnapshot | undefined,
  expected: RevenueCatCliDecodeExpected,
): ReturnType<typeof decodeRevenueCatCliResponse> | undefined {
  if (!snapshot) return undefined;
  const stdout = snapshot.wrapped
    ? JSON.stringify({
        data: snapshot.data,
        schema_version: snapshot.schemaVersion ?? "1",
      })
    : JSON.stringify(snapshot.data);
  return decodeRevenueCatCliResponse({
    operationId,
    stdout,
    stderr: "",
    status: 0,
    expected,
  });
}

function preSpawnResult(operation: CliOperationSpec, preflight: RevenueCatCliPreflight, argv: readonly string[] = []): RevenueCatCliRunResult {
  return {
    invoked: false,
    preflight,
    operation,
    argv,
    collector: CLI_PROOF_COLLECTOR,
    uncertainMutation: false,
    replaySafe: true,
    nextAction: "none",
    effectProgress: "no-effect",
  };
}

function reuseMutationResult(
  operation: CliOperationSpec,
  preflight: RevenueCatCliPreflight,
  argv: readonly string[],
  entry: RevenueCatCliLedgerEntry,
  expected: RevenueCatCliDecodeExpected,
): RevenueCatCliRunResult {
  const json = jsonFromWriteSnapshot(entry.writeSnapshot);
  const decoded = decodeFromWriteSnapshot(operation.id, entry.writeSnapshot, expected);
  const verified = entry.state === "verified";
  return {
    invoked: false,
    resumed: true,
    preflight,
    operation,
    argv,
    json: decoded?.json ?? json,
    observation: decoded?.observation,
    collector: CLI_PROOF_COLLECTOR,
    uncertainMutation: false,
    replaySafe: false,
    remoteId: entry.remoteId,
    requestIdentity: entry.requestIdentity,
    nextAction: verified ? "complete" : "observe",
    effectProgress: verified ? "verified" : "applied-unverified",
  };
}

export function runRevenueCatCli(input: RevenueCatCliRunRequest): RevenueCatCliRunResult {
  const operation = getRevenueCatCliOperation(input.operationId);
  if (!operation) {
    const preflight: RevenueCatCliPreflight = {
      status: "hold",
      code: "unsupported-operation",
      message: `Unknown operation ${input.operationId}.`,
      blocksUnrelatedWork: false,
    };
    return preSpawnResult(
      {
        id: input.operationId,
        title: input.operationId,
        command: [],
        effectClass: "raw-api",
        support: "deliberately-excluded",
        requiresAuth: true,
        requiresProject: true,
        requiresApp: false,
        requiresHostAuthority: true,
        allowsYesFlag: false,
        experimental: false,
        proofCollector: CLI_PROOF_COLLECTOR,
      },
      preflight,
    );
  }
  const preflight = assessRevenueCatCliPreflight({
    discovery: input.discovery,
    operation,
    target: input.target,
    requestProjectId: input.projectId,
    requestAppId: input.appId,
  });
  if (preflight.status !== "ready") return preSpawnResult(operation, preflight);
  if (operation.requiresProject && input.projectId?.trim() !== input.target.approvedProjectId?.trim()) {
    return preSpawnResult(operation, {
      status: "hold",
      code: "request-project-mismatch",
      message: "Request project id must equal the approved project before spawn.",
      blocksUnrelatedWork: false,
    });
  }
  if (
    (operation.requiresApp || operation.effectClass === "test-store-mutation") &&
    input.appId?.trim() !== input.target.approvedAppId?.trim()
  ) {
    return preSpawnResult(operation, {
      status: "hold",
      code: "request-app-mismatch",
      message: "Request app id must equal the approved app before spawn.",
      blocksUnrelatedWork: false,
    });
  }
  let argv: string[];
  try {
    argv = buildRevenueCatCliArgv(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = argvRefusalHold(error);
    return preSpawnResult(operation, { status: "hold", code, message, blocksUnrelatedWork: false });
  }

  const mutation = isMutationEffect(operation.effectClass);
  const durable = mutation && Boolean(input.ledger && input.idempotencyKey?.trim());
  const binding = durable ? buildRevenueCatCliBinding(input) : undefined;
  const expected = decodeExpected(input);
  let leased = false;

  try {
    if (durable && input.ledger && input.idempotencyKey && binding) {
      try {
        hydrateRevenueCatCliLedger(input);
        const prior = input.ledger.reconcile(input.idempotencyKey, binding);
        switch (prior.action) {
          case "proceed":
            break;
          case "conflict":
            persistRevenueCatCliLedger(input);
            return {
              ...preSpawnResult(operation, holdIdentityConflict(), argv),
              replaySafe: false,
              nextAction: "hold-uncertain",
              effectProgress: prior.entry.state === "uncertain" ? "dispatched-unconfirmed" : "applied-unverified",
              remoteId: prior.entry.remoteId,
              requestIdentity: prior.entry.requestIdentity,
            };
          case "reuse":
            persistRevenueCatCliLedger(input);
            return reuseMutationResult(operation, preflight, argv, prior.entry, expected);
          case "uncertain":
            persistRevenueCatCliLedger(input);
            return {
              invoked: false,
              preflight: holdUncertain(
                "Dispatched RevenueCat CLI intent has no confirmed remote observation. Holding mutation-uncertain. Absence of a completion receipt is not permission to repeat the write.",
              ),
              operation,
              argv,
              collector: CLI_PROOF_COLLECTOR,
              uncertainMutation: true,
              replaySafe: false,
              remoteId: prior.entry.remoteId,
              requestIdentity: prior.entry.requestIdentity,
              nextAction: "hold-uncertain",
              effectProgress: "dispatched-unconfirmed",
              failureKind: prior.entry.failureKind,
            };
          default: {
            const exhaustive: never = prior;
            throw new Error(`unhandled RevenueCat CLI reconcile action: ${String(exhaustive)}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const identity = message.includes("revenuecat.cli_request_identity_conflict");
        return {
          invoked: false,
          preflight: identity
            ? holdIdentityConflict()
            : holdUncertain(`Refusing to retry a RevenueCat CLI mutation until remote identity is reconciled (${message}).`),
          operation,
          argv,
          collector: CLI_PROOF_COLLECTOR,
          uncertainMutation: true,
          replaySafe: false,
          nextAction: "hold-uncertain",
          effectProgress: "dispatched-unconfirmed",
        };
      }
      input.ledger.bindIntent(input.idempotencyKey, binding);
      leased = true;
      persistRevenueCatCliLedger(input);
    }

    const timeoutMs = mutation ? CLI_PROCESS_MUTATION_TIMEOUT_MS : CLI_PROCESS_READ_TIMEOUT_MS;
    const processResult = input.run({
      executable: input.executable,
      argv,
      cwd: input.cwd,
      env: buildCliProcessEnv({
        isolatedHome: input.isolatedHome,
        pathValue: input.pathEnv,
        apiKey: input.apiKey,
        projectId: operation.requiresProject ? input.projectId : undefined,
        profile: input.profile,
      }),
      timeoutMs,
    });
    const decoded = decodeRevenueCatCliResponse({
      operationId: operation.id,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      status: processResult.status,
      expected,
    });
    const json = decoded.json;
    const jsonOk = json.ok === true;
    const uncertainMutation = mutationDispatchIsUncertain(operation.effectClass, processResult, jsonOk);
    const failureKind = uncertainMutation ? classifyMutationFailureKind(processResult) : jsonOk ? undefined : classifyMutationFailureKind(processResult);
    const remoteId = jsonOk ? extractRevenueCatCliRemoteId(json.data) : undefined;
    const requestIdentity = binding ? (input.ledger?.get(input.idempotencyKey ?? "")?.requestIdentity ?? undefined) : undefined;

    if (durable && input.ledger && input.idempotencyKey && binding) {
      const state = uncertainMutation ? "uncertain" : jsonOk ? "applied-unverified" : "uncertain";
      input.ledger.record(input.idempotencyKey, binding, {
        remoteId,
        state,
        writeSnapshot: snapshotWriteJson(json),
        failureKind,
      });
      persistRevenueCatCliLedger(input);
    }

    return {
      invoked: true,
      preflight,
      operation,
      argv,
      process: processResult,
      json,
      observation: decoded.observation,
      collector: CLI_PROOF_COLLECTOR,
      uncertainMutation,
      replaySafe: !mutation,
      remoteId,
      requestIdentity,
      nextAction: mutation ? (uncertainMutation ? "hold-uncertain" : jsonOk ? "observe" : "hold-uncertain") : "observe",
      effectProgress: mutation
        ? uncertainMutation
          ? "dispatched-unconfirmed"
          : jsonOk
            ? "applied-unverified"
            : "dispatched-unconfirmed"
        : "not-started",
      failureKind,
    };
  } finally {
    if (leased && input.idempotencyKey) input.ledger?.release(input.idempotencyKey);
  }
}
