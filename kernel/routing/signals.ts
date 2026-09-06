import type { PrecedentTransfer, RouteRequest, RouteSignal } from "./types.js";

/** Signals are computed independently of ranking (KTD7). */
export function collectRouteSignals(request: RouteRequest, knownCandidateIds: ReadonlySet<string> = new Set()): RouteSignal[] {
  const ignoredRecall = (request.recallProposedIds ?? []).filter((id) => !knownCandidateIds.has(id)).sort();
  const signals: RouteSignal[] = [
    { id: "signal.kind", kind: "request_kind", value: request.kind },
    { id: "signal.recognized", kind: "recognized", value: request.recognized ? "true" : "false" },
    { id: "signal.facts", kind: "fact_count", value: String(request.availableFacts.length) },
  ];
  if (request.packId) signals.push({ id: "signal.pack", kind: "pack", value: request.packId });
  if (ignoredRecall.length > 0) signals.push({ id: "signal.recall_ignored", kind: "recall", value: ignoredRecall.join(",") });
  return signals.sort((left, right) => left.id.localeCompare(right.id));
}

export function precedentTransfer(request: RouteRequest): PrecedentTransfer {
  const available = new Set(request.availableFacts);
  const required = [...request.requiredFacts].sort();
  const matchedFacts = required.filter((fact) => available.has(fact));
  const differentFacts = required.filter((fact) => !available.has(fact));
  const evidenceStrength = required.length === 0 || differentFacts.length === 0 ? "complete" : matchedFacts.length === 0 ? "absent" : "partial";
  return {
    matchedFacts,
    differentFacts,
    evidenceStrength,
    transferLimits: differentFacts.length > 0 ? ["unmatched_required_facts"] : [],
  };
}
