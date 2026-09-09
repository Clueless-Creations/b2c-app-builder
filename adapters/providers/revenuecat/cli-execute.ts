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
import { assessRevenueCatCliPreflight, mutationTimeoutIsUncertain, type RevenueCatCliPreflight, type RevenueCatCliTarget } from "./cli-preflight.js";
import {
  decodeRevenueCatCliResponse,
  type RevenueCatCliJsonOutcome,
  type RevenueCatCliObservation,
} from "./cli-decode.js";

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
}

export interface RevenueCatCliRunResult {
  readonly invoked: boolean;
  readonly preflight: RevenueCatCliPreflight;
  readonly operation: CliOperationSpec;
  readonly argv: readonly string[];
  readonly process?: CliProcessResult;
  readonly json?: RevenueCatCliJsonOutcome;
  readonly observation?: RevenueCatCliObservation;
  readonly collector: typeof CLI_PROOF_COLLECTOR;
  readonly uncertainMutation: boolean;
  readonly replaySafe: boolean;
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

export function runRevenueCatCli(input: RevenueCatCliRunRequest): RevenueCatCliRunResult {
  const operation = getRevenueCatCliOperation(input.operationId);
  if (!operation) {
    const preflight: RevenueCatCliPreflight = {
      status: "hold",
      code: "unsupported-operation",
      message: `Unknown operation ${input.operationId}.`,
      blocksUnrelatedWork: false,
    };
    return {
      invoked: false,
      preflight,
      operation: {
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
      argv: [],
      collector: CLI_PROOF_COLLECTOR,
      uncertainMutation: false,
      replaySafe: true,
    };
  }
  const preflight = assessRevenueCatCliPreflight({
    discovery: input.discovery,
    operation,
    target: input.target,
    requestProjectId: input.projectId,
    requestAppId: input.appId,
  });
  if (preflight.status !== "ready") {
    return { invoked: false, preflight, operation, argv: [], collector: CLI_PROOF_COLLECTOR, uncertainMutation: false, replaySafe: true };
  }
  if (operation.requiresProject && input.projectId?.trim() !== input.target.approvedProjectId?.trim()) {
    return {
      invoked: false,
      preflight: {
        status: "hold",
        code: "request-project-mismatch",
        message: "Request project id must equal the approved project before spawn.",
        blocksUnrelatedWork: false,
      },
      operation,
      argv: [],
      collector: CLI_PROOF_COLLECTOR,
      uncertainMutation: false,
      replaySafe: true,
    };
  }
  if (
    (operation.requiresApp || operation.effectClass === "test-store-mutation") &&
    input.appId?.trim() !== input.target.approvedAppId?.trim()
  ) {
    return {
      invoked: false,
      preflight: {
        status: "hold",
        code: "request-app-mismatch",
        message: "Request app id must equal the approved app before spawn.",
        blocksUnrelatedWork: false,
      },
      operation,
      argv: [],
      collector: CLI_PROOF_COLLECTOR,
      uncertainMutation: false,
      replaySafe: true,
    };
  }
  let argv: string[];
  try {
    argv = buildRevenueCatCliArgv(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = argvRefusalHold(error);
    return {
      invoked: false,
      preflight: { status: "hold", code, message, blocksUnrelatedWork: false },
      operation,
      argv: [],
      collector: CLI_PROOF_COLLECTOR,
      uncertainMutation: false,
      replaySafe: true,
    };
  }
  const timeoutMs = isMutationEffect(operation.effectClass) ? CLI_PROCESS_MUTATION_TIMEOUT_MS : CLI_PROCESS_READ_TIMEOUT_MS;
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
  const uncertainMutation = mutationTimeoutIsUncertain(operation.effectClass, processResult.timedOut);
  const decoded = decodeRevenueCatCliResponse({
    operationId: operation.id,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    status: processResult.status,
    expected: { appId: input.appId, offeringId: input.offeringId },
  });
  return {
    invoked: true,
    preflight,
    operation,
    argv,
    process: processResult,
    json: decoded.json,
    observation: decoded.observation,
    collector: CLI_PROOF_COLLECTOR,
    uncertainMutation,
    replaySafe: !uncertainMutation,
  };
}
