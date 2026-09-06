import type { CompiledPlan, CompiledRunNode, RunNodeId } from "./compile.js";

export interface DispatchBatch {
  nodeIds: RunNodeId[];
}

/**
 * Batches the frontier into resource-conflict-free groups, bounded by maxConcurrency. Ported
 * prefix-aware conflicts() from runtime/graph/execution.ts (KTD6). Execution-mode selection
 * (inline vs subagent vs worktree) is a runtime-adapter concern (U6), not the engine's — this
 * batcher only decides which node ids may run together.
 */
export function buildDispatchBatches(plan: CompiledPlan, frontier: readonly RunNodeId[], maxConcurrency: number): DispatchBatch[] {
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1) throw new Error("Concurrency must be a positive integer.");
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  const batches: DispatchBatch[] = [];
  let current: CompiledRunNode[] = [];

  for (const nodeId of frontier) {
    const node = byId.get(nodeId);
    if (!node) throw new Error(`Frontier references unknown run node ${nodeId}`);
    if (current.some((candidate) => conflicts(candidate, node)) || current.length >= maxConcurrency) {
      batches.push({ nodeIds: current.map((item) => item.id) });
      current = [];
    }
    current.push(node);
  }
  if (current.length > 0) batches.push({ nodeIds: current.map((item) => item.id) });
  return batches;
}

function conflicts(a: CompiledRunNode, b: CompiledRunNode): boolean {
  for (const left of a.resources) {
    const right = b.resources.find((candidate) => candidate.id === left.id || resourcePrefixOverlap(candidate.id, left.id));
    if (right && (left.mode === "exclusive" || right.mode === "exclusive")) return true;
  }
  return false;
}

/** resource.path.foo and resource.path.foo.bar conflict even though their strings differ. */
function resourcePrefixOverlap(a: string, b: string): boolean {
  return a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}

export type BatchHaltReason = "kill_switch" | "cooperative_yield";

export interface BatchBoundaryResult {
  halt: boolean;
  reason?: BatchHaltReason;
}

/**
 * R11 (kill switch) and R13 (interactive cooperative yield) both gate at dispatch-batch
 * boundaries, kill switch first. Stubbed here as plain interfaces: U3's lock backs the yield
 * check, U4's control-file read backs the kill-switch check. Synchronous for the same reason as
 * AutonomyEvaluator — see frontier.ts.
 */
export interface DispatchHooks {
  checkKillSwitch: () => boolean;
  checkCooperativeYield: () => boolean;
}

export const neverHaltDispatchHooks: DispatchHooks = { checkKillSwitch: () => false, checkCooperativeYield: () => false };

export function checkBatchBoundary(hooks: DispatchHooks): BatchBoundaryResult {
  if (hooks.checkKillSwitch()) return { halt: true, reason: "kill_switch" };
  if (hooks.checkCooperativeYield()) return { halt: true, reason: "cooperative_yield" };
  return { halt: false };
}
