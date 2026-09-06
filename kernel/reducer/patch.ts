import { createHash } from "node:crypto";
import {
  validateBudgetLedger,
  validateBusinessState,
  validateControl,
  validateCurrentTruth,
  validateGrants,
  validateWaivers,
  type SchemaIssue,
} from "../schema/index.js";
import { validateCurrentTruthSemantics } from "./current-truth.js";

/**
 * The six document kinds the reducer CLI is the sole writer for (KTD7). Run-state and
 * checkpoint documents are U2's engine concern, not the reducer's.
 * `current-truth` stays in this union for adopt, manifest, audit, and schema lookup.
 * Commit patches cannot target it; only `reconcile` may write it.
 */
export type PatchTargetDoc = "business-state" | "control" | "grants" | "waivers" | "budget-ledger" | "current-truth";

export const patchTargetDocs: readonly PatchTargetDoc[] = ["business-state", "control", "grants", "waivers", "budget-ledger", "current-truth"];

/**
 * A path into a JSON document as an array of raw keys/indices, never a dot-joined string.
 * Domain IDs such as "domain.growth" are themselves single map keys (see grants.schema.json's
 * grantsMap and control.schema.json's embedded grants field) — a dot-joined path string could
 * not tell "one key with a dot in it" apart from "two nested keys", so paths are segment arrays.
 */
export type PatchPath = readonly string[];

export type PatchOp =
  | { readonly op: "set"; readonly path: PatchPath; readonly value: unknown }
  | { readonly op: "merge"; readonly path: PatchPath; readonly value: Record<string, unknown> }
  | { readonly op: "append"; readonly path: PatchPath; readonly value: unknown }
  | { readonly op: "remove"; readonly path: PatchPath };

export type PreconditionOperator = "exists" | "not_exists" | "equals" | "not_equals";

export interface PatchPrecondition {
  readonly path: PatchPath;
  readonly operator: PreconditionOperator;
  readonly value?: unknown;
}

/**
 * The typed patch protocol every reducer commit is expressed as (adapted from
 * runtime/graph/execution.ts's StatePatch to business/control/grants/waivers/ledger documents).
 * `declaredOutputs` is the fail-closed contract: every path a patch claims to change must
 * actually differ before/after (ported from execution.ts's reconcilePatch missing-output check),
 * and every op must touch a declared path — a patch that is silent about part of what it does,
 * or that mutates something it didn't declare, is rejected before anything is written.
 */
export interface StatePatch {
  readonly schemaVersion: "1.0.0";
  readonly patchId: string;
  readonly targetDoc: PatchTargetDoc;
  readonly reason: string;
  readonly authoredBy: string;
  readonly authoredAt: string;
  readonly preconditions: readonly PatchPrecondition[];
  readonly ops: readonly PatchOp[];
  readonly declaredOutputs: readonly PatchPath[];
}

export interface PatchIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export class PatchRejected extends Error {
  readonly issues: PatchIssue[];
  constructor(issues: PatchIssue[]) {
    super(issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.issues = issues;
  }
}

/** Fields the reducer itself stamps on every commit (see cli.ts); a patch may not set them directly. */
export const REDUCER_MANAGED_FIELDS: readonly string[] = ["schemaVersion", "updatedAt"];

function formatPath(path: PatchPath): string {
  return path.length === 0 ? "/" : `/${path.join("/")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

type JsonContainer = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is JsonContainer {
  return isPlainObject(value) || Array.isArray(value);
}

function readSlot(container: JsonContainer, segment: string): unknown {
  if (Array.isArray(container)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) return undefined;
    return container[index];
  }
  return container[segment];
}

function writeSlot(container: JsonContainer, segment: string, value: unknown): void {
  if (Array.isArray(container)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) throw new PatchRejected([{ code: "patch.invalid_path", message: `array index "${segment}" is invalid` }]);
    container[index] = value;
    return;
  }
  container[segment] = value;
}

function getAtPath(document: unknown, path: PatchPath): { found: boolean; value: unknown } {
  let cursor: unknown = document;
  for (const segment of path) {
    if (!isContainer(cursor)) return { found: false, value: undefined };
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) return { found: false, value: undefined };
    } else if (!(segment in cursor)) {
      return { found: false, value: undefined };
    }
    cursor = readSlot(cursor, segment);
  }
  return { found: true, value: cursor };
}

function setAtPath(document: Record<string, unknown>, path: PatchPath, value: unknown): void {
  if (path.length === 0) throw new PatchRejected([{ code: "patch.invalid_path", message: "a patch op path must have at least one segment" }]);
  let container: JsonContainer = document;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i]!;
    const nextSegment = path[i + 1]!;
    let next = readSlot(container, segment);
    if (next === undefined) {
      next = /^\d+$/.test(nextSegment) ? [] : {};
      writeSlot(container, segment, next);
    }
    if (!isContainer(next))
      throw new PatchRejected([{ code: "patch.invalid_path", message: `cannot descend through a scalar at ${formatPath(path.slice(0, i + 1))}` }]);
    container = next;
  }
  writeSlot(container, path[path.length - 1]!, value);
}

function removeAtPath(document: Record<string, unknown>, path: PatchPath): void {
  if (path.length === 0) throw new PatchRejected([{ code: "patch.invalid_path", message: "a patch op path must have at least one segment" }]);
  let container: JsonContainer = document;
  for (let i = 0; i < path.length - 1; i += 1) {
    const next = readSlot(container, path[i]!);
    if (!isContainer(next)) return;
    container = next;
  }
  const last = path[path.length - 1]!;
  if (Array.isArray(container)) {
    const index = Number(last);
    if (Number.isInteger(index) && index >= 0 && index < container.length) container.splice(index, 1);
    return;
  }
  delete container[last];
}

export function applyOp(document: Record<string, unknown>, op: PatchOp): void {
  switch (op.op) {
    case "set":
      setAtPath(document, op.path, cloneJson(op.value));
      return;
    case "merge": {
      const current = getAtPath(document, op.path);
      const base = isPlainObject(current.value) ? current.value : {};
      setAtPath(document, op.path, { ...base, ...cloneJson(op.value) });
      return;
    }
    case "append": {
      const current = getAtPath(document, op.path);
      const base = Array.isArray(current.value) ? current.value : [];
      setAtPath(document, op.path, [...base, cloneJson(op.value)]);
      return;
    }
    case "remove":
      removeAtPath(document, op.path);
      return;
    default:
      throw new PatchRejected([{ code: "patch.invalid_op", message: `unknown op kind "${(op as { op: string }).op}"` }]);
  }
}

function isValidPath(value: unknown): value is PatchPath {
  return Array.isArray(value) && value.length > 0 && value.every((segment) => typeof segment === "string");
}

/** Structural validation of the patch envelope itself — before it ever touches a document. */
export function validatePatchShape(patch: StatePatch): PatchIssue[] {
  const issues: PatchIssue[] = [];
  if (!patch || typeof patch !== "object") return [{ code: "patch.invalid_shape", message: "patch must be an object" }];
  if (!patchTargetDocs.includes(patch.targetDoc))
    issues.push({ code: "patch.unknown_target", message: `unknown targetDoc "${String(patch.targetDoc)}"`, path: "/targetDoc" });
  if (patch.targetDoc === "current-truth") {
    issues.push({
      code: "patch.reconcile_only_target",
      message: "current-truth can change only through reconcile, not commit patches",
      path: "/targetDoc",
    });
  }
  if (typeof patch.patchId !== "string" || patch.patchId.trim().length === 0)
    issues.push({ code: "patch.invalid_shape", message: "patchId is required", path: "/patchId" });
  if (typeof patch.reason !== "string" || patch.reason.trim().length === 0)
    issues.push({ code: "patch.invalid_shape", message: "reason is required", path: "/reason" });
  if (typeof patch.authoredBy !== "string" || patch.authoredBy.trim().length === 0)
    issues.push({ code: "patch.invalid_shape", message: "authoredBy is required", path: "/authoredBy" });
  if (typeof patch.authoredAt !== "string" || patch.authoredAt.trim().length === 0)
    issues.push({ code: "patch.invalid_shape", message: "authoredAt is required", path: "/authoredAt" });

  const ops = Array.isArray(patch.ops) ? patch.ops : [];
  if (ops.length === 0) issues.push({ code: "patch.empty_ops", message: "a patch must declare at least one op", path: "/ops" });
  for (const [index, op] of ops.entries()) {
    const p = `/ops/${index}`;
    if (!op || typeof op !== "object" || !["set", "merge", "append", "remove"].includes((op as { op?: unknown }).op as string)) {
      issues.push({ code: "patch.invalid_op", message: `op ${index} has an unknown kind`, path: p });
      continue;
    }
    if (!isValidPath((op as { path?: unknown }).path)) {
      issues.push({ code: "patch.invalid_path", message: `op ${index} path must be a non-empty array of string segments`, path: p });
      continue;
    }
    const path = (op as { path: PatchPath }).path;
    if (op.op !== "remove" && !("value" in op)) issues.push({ code: "patch.invalid_op", message: `op ${index} ("${op.op}") requires a "value"`, path: p });
    if (op.op === "merge" && !isPlainObject((op as { value?: unknown }).value))
      issues.push({ code: "patch.invalid_op", message: `op ${index} ("merge") requires an object value`, path: p });
    if (REDUCER_MANAGED_FIELDS.includes(path[0]!)) {
      issues.push({ code: "patch.protected_field", message: `"${path[0]}" is reducer-managed and cannot be set by a patch`, path: formatPath(path) });
    }
  }

  const declaredOutputs = Array.isArray(patch.declaredOutputs) ? patch.declaredOutputs : [];
  if (declaredOutputs.length === 0)
    issues.push({ code: "patch.empty_declared_outputs", message: "a patch must declare at least one output path it changes", path: "/declaredOutputs" });
  for (const [index, output] of declaredOutputs.entries()) {
    if (!isValidPath(output))
      issues.push({
        code: "patch.invalid_path",
        message: `declaredOutputs[${index}] must be a non-empty array of string segments`,
        path: `/declaredOutputs/${index}`,
      });
  }

  const preconditions = Array.isArray(patch.preconditions) ? patch.preconditions : [];
  for (const [index, precondition] of preconditions.entries()) {
    const p = `/preconditions/${index}`;
    if (!precondition || !isValidPath((precondition as { path?: unknown }).path)) {
      issues.push({ code: "patch.invalid_precondition", message: `preconditions[${index}] path must be a non-empty array of string segments`, path: p });
      continue;
    }
    if (!["exists", "not_exists", "equals", "not_equals"].includes(precondition.operator)) {
      issues.push({
        code: "patch.invalid_precondition",
        message: `preconditions[${index}] has an unknown operator "${String(precondition.operator)}"`,
        path: p,
      });
    }
  }

  return issues;
}

export function checkPreconditions(document: unknown, patch: StatePatch): PatchIssue[] {
  const issues: PatchIssue[] = [];
  for (const precondition of patch.preconditions) {
    const { found, value } = getAtPath(document, precondition.path);
    const p = formatPath(precondition.path);
    switch (precondition.operator) {
      case "exists":
        if (!found) issues.push({ code: "patch.precondition_failed", message: `expected ${p} to exist`, path: p });
        break;
      case "not_exists":
        if (found) issues.push({ code: "patch.precondition_failed", message: `expected ${p} to not exist`, path: p });
        break;
      case "equals":
        if (!found || JSON.stringify(value) !== JSON.stringify(precondition.value)) {
          issues.push({
            code: "patch.precondition_failed",
            message: `expected ${p} to equal ${JSON.stringify(precondition.value)}, found ${found ? JSON.stringify(value) : "<missing>"}`,
            path: p,
          });
        }
        break;
      case "not_equals":
        if (found && JSON.stringify(value) === JSON.stringify(precondition.value)) {
          issues.push({ code: "patch.precondition_failed", message: `expected ${p} to not equal ${JSON.stringify(precondition.value)}`, path: p });
        }
        break;
      default: {
        const exhaustive: never = precondition.operator;
        throw new Error(`Unhandled precondition operator ${String(exhaustive)}`);
      }
    }
  }
  return issues;
}

/**
 * Fail-closed join ported from execution.ts's reconcilePatch (which rejects a run node's patch
 * when it omits a declared output artifact). Here the "declared outputs" are the paths the patch
 * itself claims to change: every declared path must actually differ between before/after, and
 * every path an op touched must have been declared. Either gap rejects the whole patch before
 * anything is written — a patch cannot silently do less, or more, than it says it does.
 */
export function checkDeclaredOutputs(before: unknown, after: unknown, patch: StatePatch): PatchIssue[] {
  const issues: PatchIssue[] = [];
  for (const output of patch.declaredOutputs) {
    const b = getAtPath(before, output);
    const a = getAtPath(after, output);
    const unchanged = b.found === a.found && JSON.stringify(b.value) === JSON.stringify(a.value);
    if (unchanged) {
      issues.push({
        code: "patch.declared_output_missing",
        message: `declared output ${formatPath(output)} was not actually changed by this patch's ops`,
        path: formatPath(output),
      });
    }
  }
  const declared = new Set(patch.declaredOutputs.map(formatPath));
  for (const op of patch.ops) {
    if (!declared.has(formatPath(op.path))) {
      issues.push({
        code: "patch.undeclared_mutation",
        message: `op touches ${formatPath(op.path)} which is not in declaredOutputs`,
        path: formatPath(op.path),
      });
    }
  }
  return issues;
}

/** Pure apply: never touches disk. Throws PatchRejected on structurally invalid paths (e.g. descending through a scalar). */
export function applyPatch(document: unknown, patch: StatePatch): Record<string, unknown> {
  const candidate = cloneJson(isPlainObject(document) ? document : {});
  for (const op of patch.ops) applyOp(candidate, op);
  return candidate;
}

function schemaIssuesToPatchIssues(issues: readonly SchemaIssue[]): PatchIssue[] {
  return issues.map((issue) => ({ code: issue.code, message: issue.message, path: issue.path }));
}

/**
 * Validates a candidate document against exactly the one U1 schema its targetDoc declares.
 * This is the sole point of contact between the reducer and U1's schema registry — every
 * physical file the reducer writes is the full document shape for one of the five validators
 * in kernel/schema/index.ts, never a fragment.
 */
export function validateTargetDocument(targetDoc: PatchTargetDoc, candidate: unknown): PatchIssue[] {
  let result;
  switch (targetDoc) {
    case "business-state":
      result = validateBusinessState(candidate);
      break;
    case "control":
      result = validateControl(candidate);
      break;
    case "grants":
      result = validateGrants(candidate);
      break;
    case "waivers":
      result = validateWaivers(candidate);
      break;
    case "budget-ledger":
      result = validateBudgetLedger(candidate);
      break;
    case "current-truth": {
      const currentTruth = validateCurrentTruth(candidate);
      if (currentTruth.valid && currentTruth.value) {
        const semantic = validateCurrentTruthSemantics(currentTruth.value);
        if (semantic.length > 0) return schemaIssuesToPatchIssues(semantic);
      }
      result = currentTruth;
      break;
    }
    default: {
      const exhaustive: never = targetDoc;
      throw new Error(`Unhandled patch target ${String(exhaustive)}`);
    }
  }
  return result.valid ? [] : schemaIssuesToPatchIssues(result.issues);
}

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
