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

export type RevenueCatCliJsonOutcome =
  | { readonly ok: true; readonly data: unknown; readonly schemaVersion: string | null; readonly extraFields: readonly string[] }
  | { readonly ok: false; readonly code: "invalid-json" | "invalid-envelope" | "command-error"; readonly message: string; readonly issues?: unknown };

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
  readonly collector: typeof CLI_PROOF_COLLECTOR;
  readonly uncertainMutation: boolean;
  readonly replaySafe: boolean;
}

const HARMLESS_ENVELOPE_KEYS = new Set(["data", "schema_version", "schemaVersion", "object", "request_id"]);

export function parseRevenueCatCliJson(stdout: string, status: number | null): RevenueCatCliJsonOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return { ok: false, code: "invalid-json", message: "CLI stdout was not JSON. Exit status alone is not success." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, code: "invalid-envelope", message: "CLI JSON is not an object envelope." };
  }
  const record = parsed as Record<string, unknown>;
  if (record.object === "error" || ("error" in record && record.error)) {
    return { ok: false, code: "command-error", message: "CLI returned a structured error.", issues: record.error ?? parsed };
  }
  const extraFields = Object.keys(record).filter((key) => !HARMLESS_ENVELOPE_KEYS.has(key) && key !== "issues");
  const data = "data" in record ? record.data : parsed;
  const schemaVersion = typeof record.schema_version === "string" ? record.schema_version : typeof record.schemaVersion === "string" ? record.schemaVersion : null;
  if (status !== 0) {
    return { ok: false, code: "command-error", message: `CLI exit ${status ?? "null"} with JSON body.`, issues: data };
  }
  return { ok: true, data, schemaVersion, extraFields };
}

export function offeringVerifyIsComplete(data: unknown): { complete: boolean; issues: unknown } {
  if (!data || typeof data !== "object") return { complete: false, issues: "missing-document" };
  const record = data as Record<string, unknown>;
  const issues = record.issues;
  if (!Array.isArray(issues)) return { complete: false, issues: issues ?? "missing-issues" };
  if (issues.length > 0) return { complete: false, issues };
  return { complete: true, issues };
}

export function paginationState(data: unknown): "complete" | "partial" | "unknown" {
  if (!data || typeof data !== "object") return "unknown";
  const record = data as Record<string, unknown>;
  if (!("items" in record) && !("data" in record)) return "unknown";
  const next = record.next_page ?? record.nextPage ?? record.next_cursor;
  if (next === null || next === undefined || next === "") return "complete";
  return "partial";
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
    const code = error instanceof CliArgvRefusal && error.code === "ambiguous-target" ? "ambiguous-project" : "unsafe-override";
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
  const json = parseRevenueCatCliJson(processResult.stdout, processResult.status);
  return {
    invoked: true,
    preflight,
    operation,
    argv,
    process: processResult,
    json,
    collector: CLI_PROOF_COLLECTOR,
    uncertainMutation,
    replaySafe: !uncertainMutation,
  };
}
