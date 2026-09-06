import { createHash } from "node:crypto";

export const DEFAULT_CAPABILITY_DEPTH = 3;

export const gapTerminalOutcomes = ["cycle", "depth_limit", "unsatisfiable", "manual_only", "declined"] as const;
export type GapTerminalOutcome = (typeof gapTerminalOutcomes)[number];

export const gapResolutions = ["conditional_accept", "delegate", "renegotiate", "manual_only", "decline"] as const;
export type GapResolutionAction = (typeof gapResolutions)[number];

export interface CapabilityNeed {
  capabilityId: string;
  providerId?: string;
  requirementName?: string;
  acquisitionWorkflowIds: readonly string[];
}

export interface CapabilityGap {
  id: string;
  dedupeKey: string;
  capabilityId: string;
  providerId?: string;
  requirementName?: string;
  acquisitionWorkflowIds: readonly string[];
  ancestry: readonly string[];
  depth: number;
  resourceBudget: number;
  terminalOutcome?: GapTerminalOutcome;
  resolution?: GapResolutionAction;
}

export interface CapabilityGapContext {
  maxDepth?: number;
  resourceBudget?: number;
  existing: Map<string, CapabilityGap>;
}

export function capabilityDedupeKey(need: CapabilityNeed): string {
  return [need.capabilityId, need.providerId ?? "", need.requirementName ?? ""].join("|");
}

function rankedAcquisition(need: CapabilityNeed): readonly string[] {
  return [...need.acquisitionWorkflowIds].sort((left, right) => left.localeCompare(right));
}

export function resolveCapabilityGap(
  need: CapabilityNeed,
  ancestry: readonly string[] = [],
  context: CapabilityGapContext = { existing: new Map() },
): CapabilityGap {
  const maxDepth = context.maxDepth ?? DEFAULT_CAPABILITY_DEPTH;
  const depth = ancestry.length + 1;
  const dedupeKey = capabilityDedupeKey(need);
  if (ancestry.includes(need.capabilityId)) {
    const cycle: CapabilityGap = {
      id: `gap.capability.${createHash("sha256").update(dedupeKey).digest("hex").slice(0, 16)}`,
      dedupeKey,
      capabilityId: need.capabilityId,
      providerId: need.providerId,
      requirementName: need.requirementName,
      acquisitionWorkflowIds: rankedAcquisition(need),
      ancestry,
      depth,
      resourceBudget: context.resourceBudget ?? 1,
      terminalOutcome: "cycle",
      resolution: "decline",
    };
    context.existing.set(dedupeKey, cycle);
    return cycle;
  }
  const existing = context.existing.get(dedupeKey);
  if (existing) return existing;

  const gap: CapabilityGap = {
    id: `gap.capability.${createHash("sha256").update(dedupeKey).digest("hex").slice(0, 16)}`,
    dedupeKey,
    capabilityId: need.capabilityId,
    providerId: need.providerId,
    requirementName: need.requirementName,
    acquisitionWorkflowIds: rankedAcquisition(need),
    ancestry,
    depth,
    resourceBudget: context.resourceBudget ?? 1,
  };
  if (depth > maxDepth) {
    gap.terminalOutcome = "depth_limit";
    gap.resolution = "decline";
    context.existing.set(dedupeKey, gap);
    return gap;
  }
  if (need.acquisitionWorkflowIds.length === 0) {
    gap.terminalOutcome = "unsatisfiable";
    gap.resolution = "manual_only";
    context.existing.set(dedupeKey, gap);
    return gap;
  }
  context.existing.set(dedupeKey, gap);
  return gap;
}

export function closeRecursiveNeed(
  need: CapabilityNeed,
  nested: CapabilityNeed,
  context: CapabilityGapContext,
  ancestry: readonly string[] = [],
): CapabilityGap {
  const parent = resolveCapabilityGap(need, ancestry, context);
  if (parent.terminalOutcome) return parent;
  return resolveCapabilityGap(nested, [...ancestry, need.capabilityId], context);
}
