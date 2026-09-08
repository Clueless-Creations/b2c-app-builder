import { assertNoPendingInitialization } from "./initialization-guard.js";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { isKnownActionClass } from "../autonomy/grants.js";
import { compilePlan, type CatalogInput } from "../engine/compile.js";
import { isBusinessUnit, laneKeys, protectedCategories } from "../schema/types.js";
import type { OperateWorld } from "./operating-types.js";
import { assertNoPendingErasure } from "../reducer/erasure-guard.js";
import { assertCompositionActivationComplete } from "../composition/activation.js";

export interface CatalogRefusal {
  readonly reasonCode: "invalid_catalog";
  readonly reason: string;
}

const RECOVERY = "Restore a valid current catalog pin before planning or execution. No workspace state was changed.";

function refusal(reason: string): CatalogRefusal {
  return { reasonCode: "invalid_catalog", reason: `${reason} ${RECOVERY}` };
}

function missingCatalog(): CatalogRefusal {
  return refusal("The raw pinned catalog is missing or invalid, so its execution contract cannot be classified.");
}

function incompleteActivation(workspace: string): CatalogRefusal | undefined {
  try {
    lstatSync(workspace);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return missingCatalog();
  }
  try {
    assertNoPendingInitialization(workspace);
  } catch {
    return {
      reasonCode: "invalid_catalog",
      reason: "business.initialization_incomplete: Resume the exact initialization before reading or executing this workspace.",
    };
  }
  try {
    assertNoPendingErasure(workspace);
  } catch {
    return {
      reasonCode: "invalid_catalog",
      reason: "erasure.pending_transition: Resume the signed evidence erasure before reading or executing this workspace. No workspace state was changed.",
    };
  }
  try {
    assertCompositionActivationComplete(workspace);
  } catch {
    return {
      reasonCode: "invalid_catalog",
      reason:
        "composition.activation_incomplete: Recover the pending local composition activation before reading or executing this workspace pin. No workspace state was changed.",
    };
  }
  return undefined;
}

export function renderCatalogRefusal(result: CatalogRefusal): string {
  return `${result.reasonCode}: ${result.reason}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isId(value: unknown, prefix: string): boolean {
  return isString(value) && value.startsWith(prefix) && value.length > prefix.length;
}

function isArrayOf(value: unknown, check: (entry: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(check);
}

function isStringArray(value: unknown): boolean {
  return isArrayOf(value, isString);
}

function optional(value: unknown, check: (entry: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

function isLane(value: unknown): boolean {
  return isString(value) && (laneKeys as readonly string[]).includes(value);
}

function isProtectedCategory(value: unknown): boolean {
  return isString(value) && (protectedCategories as readonly string[]).includes(value);
}

function isReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["id", "path", "title", "loadWhen"].every((field) => isString(value[field])) &&
    ["freshness", "sectionId", "revision", "reviewDueBy"].every((field) => optional(value[field], isString))
  );
}

function isRole(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["id", "name", "promptPath"].every((field) => isString(value[field])) &&
    isStringArray(value.parentPromptPaths) &&
    isArrayOf(value.contextPacks, (pack) => isRecord(pack) && isString(pack.id) && isString(pack.title) && isArrayOf(pack.references, isReference)) &&
    ["skillRoutes", "toolRoutes"].every((field) => isArrayOf(value[field], (route) => isRecord(route) && isString(route.id) && isString(route.when)))
  );
}

function isWorkflow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isId(value.id, "workflow.") &&
    isString(value.title) &&
    isId(value.domainId, "domain.") &&
    isString(value.actionClass) &&
    isKnownActionClass(value.actionClass) &&
    // Shipped packs persist an absent category as "". Preserve that value and its plan hash.
    optional(value.protectedCategory, (category) => category === "" || isProtectedCategory(category)) &&
    isArrayOf(value.dependencies, (id) => isId(id, "workflow.")) &&
    ["outputPaths", "providerIds", "founderOnlyActions", "gateCommands"].every((field) => isStringArray(value[field])) &&
    isArrayOf(value.laneIds, isLane) &&
    typeof value.idempotent === "boolean" &&
    ["trigger", "instructions", "groupId"].every((field) => optional(value[field], isString)) &&
    ["reads", "consults", "phaseIds"].every((field) => optional(value[field], isStringArray)) &&
    optional(value.references, (references) => isArrayOf(references, isReference)) &&
    optional(value.role, isRole) &&
    optional(value.refreshDependencies, (dependencies) =>
      isArrayOf(dependencies, (entry) => isRecord(entry) && isId(entry.workflowId, "workflow.") && isString(entry.instructions)),
    ) &&
    ["recurrenceDays", "maxAttempts", "maxConsecutiveNoProgressAttempts", "ttlSeconds", "tokenBudget"].every((field) => optional(value[field], isNumber)) &&
    optional(value.costEstimate, (cost) => isRecord(cost) && isNumber(cost.amount) && isString(cost.currency)) &&
    optional(value.applicability, (scope) => isRecord(scope) && (scope.mode === "always" || (scope.mode === "conditional" && isString(scope.question))))
  );
}

/** Check the executable input shape, not the newer authored-catalog contract. Never mutate a pin here. */
function isCatalog(value: unknown): value is CatalogInput {
  if (!isRecord(value)) return false;
  return (
    isString(value.version) &&
    value.version.trim().length > 0 &&
    value.version !== "catalog.empty" &&
    isArrayOf(value.artifacts, (artifact) => isRecord(artifact) && isId(artifact.id, "artifact.") && isString(artifact.path)) &&
    isArrayOf(value.workflows, isWorkflow) &&
    optional(value.profiles, (profiles) =>
      isArrayOf(profiles, (profile) => isRecord(profile) && isString(profile.id) && isArrayOf(profile.defersLaneKeys, isLane)),
    ) &&
    optional(value.authority, (authority) =>
      isArrayOf(
        authority,
        (record) =>
          isRecord(record) &&
          isId(record.id, "domain.") &&
          ["grantable", "system", "machine"].every((field) => typeof record[field] === "boolean") &&
          isStringArray(record.aliases) &&
          isArrayOf(record.protectedCategories, isProtectedCategory) &&
          optional(record.operatorGroup, (group) => isString(group) && isBusinessUnit(group)),
      ),
    )
  );
}

/** Validate the complete persisted shape without following selected package references. */
export function validateExecutableCatalogShape(value: unknown): CatalogRefusal | undefined {
  return isCatalog(value) ? undefined : missingCatalog();
}

export function validateExecutableCatalog(value: unknown): CatalogRefusal | undefined {
  const shapeRefusal = validateExecutableCatalogShape(value);
  if (shapeRefusal) return shapeRefusal;
  try {
    // Shape-valid pins can still be non-executable. Compile in memory so an unknown
    // dependency or ambiguous output writer cannot reach a workspace mutation.
    compilePlan(value as CatalogInput);
  } catch {
    return missingCatalog();
  }
  return undefined;
}

export type WorkspaceCatalogResult =
  { readonly ok: true; readonly catalog: CatalogInput } | { readonly ok: false; readonly refusal: CatalogRefusal; readonly catalog?: CatalogInput };

export type OptionalWorkspaceCatalogResult =
  { readonly ok: true; readonly catalog?: CatalogInput } | { readonly ok: false; readonly refusal: CatalogRefusal; readonly catalog?: CatalogInput };

function hasPriorWorkspaceMarker(workspace: string): boolean {
  const markers = [
    ".b2c-launch/runtime.json",
    "state/business-state.json",
    "state/current-truth.json",
    "control/control.json",
    "control/budget-ledger.json",
    "control/manifest.json",
    "control/audit.jsonl",
    "run/run-state.json",
    "run/checkpoint.json",
    "run/app-review.json",
    "run/app-review-webhooks",
    "digests",
  ];
  return markers.some((marker) => {
    try {
      lstatSync(path.resolve(workspace, marker));
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== "ENOENT";
    }
  });
}

/**
 * Classify a workspace pin when the caller can legitimately run before the first pin exists.
 * ENOENT is allowed only before definitive engine markers exist. A managed workspace with a
 * missing pin, or a present unreadable, malformed, or invalid pin, refuses.
 */
export function loadWorkspaceCatalogIfPresent(workspace: string): OptionalWorkspaceCatalogResult {
  const activation = incompleteActivation(workspace);
  if (activation) return { ok: false, refusal: activation };
  const stored = path.resolve(workspace, "catalog.json");
  try {
    if (!lstatSync(stored).isFile()) return { ok: false, refusal: missingCatalog() };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !hasPriorWorkspaceMarker(workspace)) return { ok: true };
    return { ok: false, refusal: missingCatalog() };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(stored, "utf8"));
  } catch {
    return { ok: false, refusal: missingCatalog() };
  }
  const incompatible = validateExecutableCatalog(raw);
  if (incompatible) return { ok: false, refusal: incompatible, ...(isCatalog(raw) ? { catalog: raw } : {}) };
  return { ok: true, catalog: raw as CatalogInput };
}

/** Read the workspace's single executable pin. Catalog replacement belongs to composition activation. */
export function loadWorkspaceCatalog(workspace: string): WorkspaceCatalogResult {
  try {
    lstatSync(workspace);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { ok: false, refusal: refusal(`The workspace directory does not exist: ${workspace}. Pass a registered workspace ID or an existing path.`) };
  }
  const activation = incompleteActivation(workspace);
  if (activation) return { ok: false, refusal: activation };
  const stored = path.resolve(workspace, "catalog.json");
  let raw: unknown;
  try {
    if (!lstatSync(stored).isFile()) return { ok: false, refusal: missingCatalog() };
    raw = JSON.parse(readFileSync(stored, "utf8"));
  } catch {
    return { ok: false, refusal: missingCatalog() };
  }
  const incompatible = validateExecutableCatalog(raw);
  if (incompatible) return { ok: false, refusal: incompatible, ...(isCatalog(raw) ? { catalog: raw } : {}) };
  return { ok: true, catalog: raw as CatalogInput };
}

/** A workflow ID alone cannot attest to all gates, reads, outputs, or nested knowledge bindings. */
export function validateOperatingCatalog(world: OperateWorld): CatalogRefusal | undefined {
  const incompatible = validateExecutableCatalog(world.catalog);
  if (incompatible) return incompatible;
  try {
    // The in-process API can receive a durable run path without going through the CLI binder.
    // Check that workspace's actual pin as well, before a preview or any in-memory mutation.
    if (world.runStatePath) {
      const stored = loadWorkspaceCatalog(path.dirname(path.dirname(path.resolve(world.runStatePath))));
      if (!stored.ok) return stored.refusal;
      if (compilePlan(stored.catalog).planId !== world.compositionPin) {
        return refusal("The durable workspace catalog does not match the pinned operating composition.");
      }
    }
    if (compilePlan(world.catalog!).planId !== world.compositionPin) {
      return refusal("The supplied raw catalog does not match the pinned operating composition.");
    }
  } catch {
    return missingCatalog();
  }
  return undefined;
}
