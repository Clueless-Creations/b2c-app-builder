#!/usr/bin/env node
/**
 * b2c operate — the one application service for preview, commit, and replay.
 *
 * CLI, MCP, schedule, and adapter wrappers call this file (or the operate() function it
 * exports). Transports may not pass reducer patches, authority assertions, or undeclared
 * context selectors. Replay uses the recorded clock and writes nothing.
 */
import { readFileSync } from "node:fs";
import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { operate } from "./operating-service.js";
import { bindRegisteredWorkspace } from "./operate-bind.js";
import { operateLeaseStates, operateModes, operateSources, type OperateInput, type OperateMode, type OperateSource } from "./operating-types.js";

export { operate, operateFromAdapter, operateFromCli, operateFromMcp, operateFromSchedule, semanticReceipt } from "./operating-service.js";
export { applyWorkspaceGate, bindRegisteredWorkspace } from "./operate-bind.js";
export type { WorkspaceBind } from "./operate-bind.js";
export type { OperateInput, OperateReceipt } from "./operating-types.js";

function fail(message: string): never {
  console.error(`operate: ${message}`);
  process.exit(1);
}

/**
 * A pre-parse or shape-validation refusal, printed as one JSON object on stderr (R16/R17): unlike
 * the plain-text `fail()` above, this names the exact field path (or both conflicting flags) so a
 * caller — human or MCP client — can act on the failure instead of re-reading a prose sentence.
 */
interface StructuredCliError {
  actionStatus: "refused";
  reasonCode: string;
  reason: string;
  field?: string;
  fields?: string[];
}

function failStructured(error: StructuredCliError): never {
  console.error(JSON.stringify(error));
  process.exit(1);
}

function isMode(value: string | undefined): value is OperateMode {
  return value !== undefined && (operateModes as readonly string[]).includes(value);
}

function isSource(value: string | undefined): value is OperateSource {
  return value !== undefined && (operateSources as readonly string[]).includes(value);
}

/** One field-path-named validation failure (R17): `path` is a JSON path like "world.links.decisionId". */
export interface OperateInputFieldError {
  path: string;
  message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldError(path: string, message: string): OperateInputFieldError {
  return { path, message };
}

function requireObject(
  container: Record<string, unknown>,
  key: string,
  parentPath: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: OperateInputFieldError } {
  const path = parentPath ? `${parentPath}.${key}` : key;
  const value = container[key];
  if (!isPlainObject(value)) return { ok: false, error: fieldError(path, `${path} must be an object.`) };
  return { ok: true, value };
}

function requireNonEmptyString(container: Record<string, unknown>, key: string, parentPath: string): OperateInputFieldError | undefined {
  const path = `${parentPath}.${key}`;
  const value = container[key];
  if (typeof value !== "string" || value.trim().length === 0) return fieldError(path, `${path} must be a non-empty string.`);
  return undefined;
}

function requireArray(container: Record<string, unknown>, key: string, parentPath: string): OperateInputFieldError | undefined {
  const path = `${parentPath}.${key}`;
  if (!Array.isArray(container[key])) return fieldError(path, `${path} must be an array.`);
  return undefined;
}

/**
 * Deep, path-named structural validator for the operate request payload (R17). Shared by both
 * input forms — `loadOperateInput` (file path) and `loadOperateInputFromJsonString` (inline
 * `--request-json`) both funnel through this before either reaches the operating service — so a
 * malformed request is refused the same way regardless of transport, naming the failing JSON path
 * (e.g. "world.links.decisionId") instead of the old flat "request file must contain world,
 * transport, and gates." string, which only checked that the three top-level keys existed.
 *
 * This validates the request's own required shape: the scalar/collection fields `OperateWorld`,
 * `OperateTransport`, and `OperateGates` (kernel/session/operating-types.ts) declare as required,
 * plus one level into `world.links`. It does not re-validate the engine-internal contents of
 * complex world fields (candidates, sections, agreement, grants, mandate, authority, proofPolicy,
 * run) or re-derive every transport rule `sanitizeTransport` already enforces
 * (kernel/session/operating-transport.ts) — duplicating those here would drift from their canonical
 * rules. Malformed content inside those fields still refuses, just deeper in `operate()`, with the
 * codes already covered by checks/verification/fixtures/operate.fixtures.ts.
 */
export function validateOperateInputShape(parsed: unknown): OperateInputFieldError | undefined {
  if (!isPlainObject(parsed)) return fieldError("$", "The request body must be a JSON object.");

  const world = requireObject(parsed, "world", "");
  if (!world.ok) return world.error;
  const transport = requireObject(parsed, "transport", "");
  if (!transport.ok) return transport.error;
  const gates = requireObject(parsed, "gates", "");
  if (!gates.ok) return gates.error;

  for (const key of ["businessRevision", "compositionPin", "domainId", "actionClass", "workflowId"]) {
    const error = requireNonEmptyString(world.value, key, "world");
    if (error) return error;
  }
  for (const key of ["candidates", "sections"]) {
    const error = requireArray(world.value, key, "world");
    if (error) return error;
  }
  for (const key of ["liveRevisions", "agreement", "grants", "proofPolicy"]) {
    const nested = requireObject(world.value, key, "world");
    if (!nested.ok) return nested.error;
  }
  const links = requireObject(world.value, "links", "world");
  if (!links.ok) return links.error;
  for (const key of ["decisionId", "objectiveId", "metricId", "expectationId", "decisionStatus", "horizonAt"]) {
    const error = requireNonEmptyString(links.value, key, "world.links");
    if (error) return error;
  }

  for (const key of ["problem", "kind", "idempotencyKey"]) {
    const error = requireNonEmptyString(transport.value, key, "transport");
    if (error) return error;
  }

  for (const key of ["workspaceRegistered", "readOnlySurface"] as const) {
    if (typeof gates.value[key] !== "boolean") return fieldError(`gates.${key}`, `gates.${key} must be a boolean.`);
  }
  if (typeof gates.value.lease !== "string" || !(operateLeaseStates as readonly string[]).includes(gates.value.lease)) {
    return fieldError("gates.lease", `gates.lease must be one of ${operateLeaseStates.join(", ")}.`);
  }

  return undefined;
}

function parseOperateInputPayload(text: string, sourceLabel: string): OperateInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${sourceLabel} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const issue = validateOperateInputShape(parsed);
  if (issue) {
    failStructured({
      actionStatus: "refused",
      reasonCode: "operate.invalid_payload",
      reason: `${sourceLabel}: ${issue.message}`,
      field: issue.path,
    });
  }
  const input = parsed as OperateInput;
  return { ...input, world: { ...input.world, runStatePath: undefined } };
}

/** Load and validate an operate request from a file path (the `--request` form). */
export function loadOperateInput(requestPath: string): OperateInput {
  let text: string;
  try {
    text = readFileSync(requestPath, "utf8");
  } catch (error) {
    fail(`request file could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseOperateInputPayload(text, "request file");
}

/** Load and validate an operate request from a raw JSON string (the `--request-json` form, KTD9). */
export function loadOperateInputFromJsonString(jsonText: string): OperateInput {
  return parseOperateInputPayload(jsonText, "--request-json");
}

function main(argv: string[]): number {
  const args = parseArgs(argv);
  // R16: --request (a file path) and --request-json (inline JSON) are mutually exclusive. Both
  // supplied is refused before either is read or parsed — a typed conflict naming both fields.
  if (args.request && args["request-json"]) {
    failStructured({
      actionStatus: "refused",
      reasonCode: "operate.request_conflict",
      reason: "Provide either --request or --request-json, not both.",
      fields: ["request", "request-json"],
    });
  }
  if (!args.request && !args["request-json"]) {
    console.error(
      [
        "Usage: b2c operate --mode preview|commit|replay (--request <file.json> | --request-json <json>) [--workspace <id-or-path>] [--source cli|mcp|schedule|adapter] [--json]",
        "",
        "Preview returns a route and context receipt. Commit creates an idempotent work order.",
        "Replay recomputes a stored receipt from recorded inputs and clock with no writes.",
        "--request and --request-json are mutually exclusive; exactly one is required.",
      ].join("\n"),
    );
    return 1;
  }
  // Exactly one of the two is present here: both-present and both-absent both returned above.
  let input = args.request ? loadOperateInput(resolveCallerPath(args.request)) : loadOperateInputFromJsonString(args["request-json"]!);
  if (isMode(args.mode)) input = { ...input, transport: { ...input.transport, mode: args.mode } };
  if (isSource(args.source)) input = { ...input, transport: { ...input.transport, source: args.source } };
  if (args["expected-revision"]) {
    input = { ...input, transport: { ...input.transport, expectedBusinessRevision: args["expected-revision"] } };
  }
  if (args.clock) input = { ...input, transport: { ...input.transport, clock: args.clock } };
  if (args.session) input = { ...input, transport: { ...input.transport, principalId: args.session } };
  if (args["read-only"] === "true") input = { ...input, gates: { ...input.gates, readOnlySurface: true } };

  const bound = bindRegisteredWorkspace(input, args.workspace);
  try {
    const receipt = operate(bound.input, bound.refusal);
    if (args.json === "true" || args.json === undefined) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(
        `${receipt.actionStatus} ${receipt.reasonCode} outcome=${receipt.decision.outcome}${receipt.occurrenceId ? ` occurrence=${receipt.occurrenceId}` : ""}`,
      );
    }
    return receipt.actionStatus === "refused" ? 1 : 0;
  } finally {
    bound.release?.();
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
