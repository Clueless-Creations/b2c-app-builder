/** Onboarding progress comes from accepted run state. Pre-run folders expose only a planned frontier. */
import path from "node:path";
import { toCatalogInput } from "../../catalog/bridge.js";
import { composeCatalog } from "../../catalog/index.js";
import { resolveRegisteredWorkspace } from "../../adapters/registry.js";
import { compilePlan, type CompiledPlan, type CompiledRunNode, type RunNodeId } from "../engine/compile.js";
import { loadRunState } from "../engine/runstate.js";
import type { RunStateDocument } from "../schema/types.js";
import { resolveSkillRoot } from "../../tooling/lib/skill-root.js";
import { loadWorkspaceCatalogIfPresent } from "./catalog-contract.js";
import { inspectWorkspace } from "./inspect.js";

const skillRoot = resolveSkillRoot(import.meta.url);

/** Fixed group id for the onboarding graph (U5). Every stepper call defaults to this. */
export const ONBOARDING_GROUP_ID = "onboarding-system";

/** A node whose in-group work is done but which waits on a dependency OUTSIDE the group. */
export interface StepperBlockedNode {
  readonly nodeId: string;
  readonly blockedBy: readonly string[];
}

/** Diagnostics associated with an authoritative run projection. */
export interface StepperAnomaly {
  readonly nodeId: string;
  readonly code: string;
  readonly detail: string;
}

export interface StepperProjection {
  readonly groupId: string;
  readonly totalCount: number;
  readonly completedCount: number;
  /** Members with every compiled dependency (in or out of group) satisfied — the real frontier. */
  readonly activeNodeIds: readonly string[];
  /** Members whose in-group dependencies are all satisfied but at least one out-of-group dependency is not. Disjoint from activeNodeIds. */
  readonly blockedNodeIds: readonly StepperBlockedNode[];
  readonly anomalies: readonly StepperAnomaly[];
  readonly done: boolean;
  /** Whether accepted run state exists or this is only a plan. */
  readonly source: "run-state" | "planned";
  /**
   * Human title for every workflowId that appears anywhere else in this projection — every group
   * member plus every out-of-group node named in a `blockedNodeIds[].blockedBy` list — keyed by
   * the same dotted engine id `activeNodeIds`/`blockedNodeIds` use. Additive: those two fields stay
   * ids (R13 addressability — a caller may need the real id, e.g. to act on it), while this map is
   * what founder/agent-facing rendering (`renderStepperBlock`) looks up so no raw "workflow.…" id
   * ever reaches that text (kernel/session/digest.ts's internalVocabularyBlocklist).
   */
  readonly titlesById: Readonly<Record<string, string>>;
}

/** Statuses `kernel/engine/runstate.ts` treats as "this lane's work is done" (mirrors its own DONE_LANE_STATUSES). */
const DONE_STATUSES = new Set(["succeeded", "not_needed", "skipped"]);

/** Pure projection. Without run state, existing files never count as completed work. */
export function computeStepper(
  plan: CompiledPlan,
  input: { readonly groupId?: string; readonly runState?: RunStateDocument; readonly workspaceRoot?: string },
): StepperProjection {
  const groupId = input.groupId ?? ONBOARDING_GROUP_ID;
  const runState = input.runState;
  const source: "run-state" | "planned" = runState !== undefined ? "run-state" : "planned";
  const byId = new Map<RunNodeId, CompiledRunNode>(plan.nodes.map((node) => [node.id, node]));
  const members = plan.nodes.filter((node) => node.groupId === groupId);

  const isComplete = (node: CompiledRunNode): boolean => runState !== undefined && DONE_STATUSES.has(runState.nodes[node.id]?.status ?? "");

  const anomalies: StepperAnomaly[] = [];
  const activeNodeIds: string[] = [];
  const blockedNodeIds: StepperBlockedNode[] = [];
  // Every member gets a title up front; a blockedBy node (out of group) earns one only if it is
  // actually named below — additive alongside activeNodeIds/blockedNodeIds, never a substitute for
  // them (R13 addressability keeps those id-based).
  const titlesById: Record<string, string> = {};
  for (const node of members) titlesById[node.workflowId] = node.title;
  let completedCount = 0;

  for (const node of members) {
    if (isComplete(node)) {
      completedCount += 1;
      continue;
    }

    const dependencies = node.dependencies.map((dependencyId) => byId.get(dependencyId)!);
    const dependenciesComplete = dependencies.every((dependency) => isComplete(dependency));

    if (dependenciesComplete) {
      activeNodeIds.push(node.workflowId);
      continue;
    }

    const outOfGroupIncomplete = dependencies.filter((dependency) => dependency.groupId !== groupId && !isComplete(dependency));
    const inGroupComplete = dependencies.filter((dependency) => dependency.groupId === groupId).every((dependency) => isComplete(dependency));
    if (inGroupComplete && outOfGroupIncomplete.length > 0) {
      for (const dependency of outOfGroupIncomplete) titlesById[dependency.workflowId] = dependency.title;
      blockedNodeIds.push({ nodeId: node.workflowId, blockedBy: outOfGroupIncomplete.map((dependency) => dependency.workflowId) });
    }
    // Otherwise the node is waiting on in-group work still ahead of it on the graph — not the
    // frontier and not blocked on anything external, so it is not listed anywhere (by design).
  }

  // members.length === 0 is a distinct, non-"done" condition (R12/R13: an honest progress signal,
  // never a vacuous completion) — readWorkspaceStepper refuses this case outright before it ever
  // reaches here (code "stepper.group_missing"), but computeStepper stays correct on its own too.
  return {
    groupId,
    totalCount: members.length,
    completedCount,
    activeNodeIds,
    blockedNodeIds,
    anomalies,
    done: members.length > 0 && completedCount === members.length,
    source,
    titlesById,
  };
}

// --- catalog loading (registered workspace vs. the skill's own shipped catalog) ------------------

export interface StepperUnavailable {
  readonly ok: false;
  readonly code: "stepper.catalog_missing" | "stepper.catalog_incompatible" | "stepper.group_missing" | "stepper.run_state_unreadable";
  readonly message: string;
}

function loadRegisteredPlan(workspacePath: string): { readonly ok: true; readonly plan: CompiledPlan } | StepperUnavailable {
  const compatibility = loadWorkspaceCatalogIfPresent(workspacePath);
  if (!compatibility.ok) return { ok: false, code: "stepper.catalog_incompatible", message: compatibility.refusal.reason };
  if (!compatibility.catalog)
    return { ok: false, code: "stepper.catalog_missing", message: `stepper.catalog_missing: no catalog pin found at ${workspacePath}` };
  try {
    return { ok: true, plan: compilePlan(compatibility.catalog) };
  } catch (error) {
    return { ok: false, code: "stepper.catalog_incompatible", message: error instanceof Error ? error.message : String(error) };
  }
}

/** How many of `plan`'s compiled nodes belong to `groupId` — used to refuse a catalog whose pin predates (or otherwise lacks) the group, rather than silently reporting a vacuous "done" (R12/R13). */
function groupMemberCount(plan: CompiledPlan, groupId: string = ONBOARDING_GROUP_ID): number {
  return plan.nodes.filter((node) => node.groupId === groupId).length;
}

/**
 * Tri-state, mirroring `kernel/session/status.ts`'s own three-way split for this exact file
 * ("no_run" vs "run_state_unreadable" vs "run"): "absent" (no run yet — the documented pre-run
 * fallback trigger, R12) is NOT the same condition as "invalid" (the file exists but failed to
 * read or parse or validate) — collapsing those two into one silent fallback would let a corrupt
 * run-state.json be reported as confident pre-run progress instead of a typed failure. Never
 * throws.
 */
type RunStateLoad = { readonly kind: "absent" } | { readonly kind: "invalid" } | { readonly kind: "ok"; readonly runState: RunStateDocument };
function loadRunStateTriState(workspacePath: string): RunStateLoad {
  try {
    return { kind: "ok", runState: loadRunState(path.join(workspacePath, "run", "run-state.json")) };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    return { kind: code === "ENOENT" ? "absent" : "invalid" };
  }
}

/** Verify the shipped package every time; raw generated JSON is never a runtime authority. */
function loadFolderPlan(): CompiledPlan {
  return compilePlan(toCatalogInput(composeCatalog(skillRoot)));
}

/** Use the workspace pin and run state. A missing run is planned; an unreadable run is refused. */
export function readWorkspaceStepper(workspacePath: string): { readonly ok: true; readonly stepper: StepperProjection } | StepperUnavailable {
  const absolute = path.resolve(workspacePath);
  const loaded = loadRegisteredPlan(absolute);
  if (!loaded.ok) return loaded;
  if (groupMemberCount(loaded.plan) === 0) {
    return {
      ok: false,
      code: "stepper.group_missing",
      message: `stepper.group_missing: no "${ONBOARDING_GROUP_ID}" members compiled from ${absolute}'s catalog pin`,
    };
  }
  const runStateLoad = loadRunStateTriState(absolute);
  if (runStateLoad.kind === "invalid") {
    return {
      ok: false,
      code: "stepper.run_state_unreadable",
      message: `stepper.run_state_unreadable: run/run-state.json at ${absolute} exists but could not be read`,
    };
  }
  const runState = runStateLoad.kind === "ok" ? runStateLoad.runState : undefined;
  return { ok: true, stepper: computeStepper(loaded.plan, { runState, workspaceRoot: absolute }) };
}

/** Plan the onboarding work without inferring completion from folder contents. */
export function computeFolderStepper(cwd: string): StepperProjection {
  return computeStepper(loadFolderPlan(), { workspaceRoot: path.resolve(cwd) });
}

// --- attaching a stepper to a routing outcome (b2c_plan) -----------------------------------------

function resolveContainingWorkspacePath(id: string): string | undefined {
  const resolved = resolveRegisteredWorkspace(id);
  return "refused" in resolved ? undefined : resolved.path;
}

function isGroupMember(plan: CompiledPlan, workflowId: string, groupId: string = ONBOARDING_GROUP_ID): boolean {
  return plan.nodes.some((node) => node.workflowId === workflowId && node.groupId === groupId);
}

/**
 * Attaches a stepper to a confident primary routing outcome, when — and only when — the selected
 * workflow is a member of the onboarding group; every other outcome (candidates, mismatch,
 * insufficient_signal, or a primary into some other workflow entirely) passes through unchanged,
 * with no `stepper` key at all, so a caller can tell "not onboarding" apart from "onboarding, zero
 * progress" (an empty/zero-valued stepper would collapse that distinction).
 *
 * Registration comes from the same shared inspector `b2c_status`'s cwd mode uses (R8): a cwd that
 * resolves to a registered workspace (directly, or by containment) reads that workspace's own
 * pinned catalog and run state; anything else (unregistered, registry-stale, or `cwd` omitted
 * entirely) falls back to the skill's own shipped catalog in planned mode. Never throws on a
 * caller-supplied `cwd` (R20) — any failure along the way (an unreadable cwd, a broken catalog
 * pin) degrades to "no stepper attached" rather than surfacing as an error on what is otherwise a
 * successful routing outcome.
 */
export function withOnboardingStepper<T extends { readonly kind: string }>(
  outcome: T & { readonly workflowId?: string },
  cwd: string | undefined,
): T & { readonly stepper?: StepperProjection } {
  if (outcome.kind !== "primary" || typeof outcome.workflowId !== "string" || cwd === undefined) return outcome;

  let inspection: ReturnType<typeof inspectWorkspace>;
  try {
    inspection = inspectWorkspace(cwd);
  } catch {
    return outcome;
  }
  if (!inspection.ok) return outcome;

  if (inspection.registration.kind === "registered" || inspection.registration.kind === "inside-registered") {
    const workspacePath = inspection.registration.kind === "registered" ? inspection.cwd : resolveContainingWorkspacePath(inspection.registration.id);
    if (workspacePath === undefined) return outcome;
    const loaded = loadRegisteredPlan(workspacePath);
    if (!loaded.ok || !isGroupMember(loaded.plan, outcome.workflowId)) return outcome;
    // A run-state.json that exists but fails to load degrades to "no stepper attached" here, the
    // same way it degrades to a typed failure in readWorkspaceStepper — never silently treated as
    // "no run yet" (which would misreport corruption as legitimate pre-run progress).
    const runStateLoad = loadRunStateTriState(workspacePath);
    if (runStateLoad.kind === "invalid") return outcome;
    const runState = runStateLoad.kind === "ok" ? runStateLoad.runState : undefined;
    return { ...outcome, stepper: computeStepper(loaded.plan, { runState, workspaceRoot: workspacePath }) };
  }

  try {
    const plan = loadFolderPlan();
    if (!isGroupMember(plan, outcome.workflowId)) return outcome;
    return { ...outcome, stepper: computeStepper(plan, {}) };
  } catch {
    return outcome;
  }
}
