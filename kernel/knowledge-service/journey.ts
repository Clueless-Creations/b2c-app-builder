import type { Catalog } from "../../catalog/types.js";

/** A read model of existing dependency edges, never an alternative scheduler. */
export function journeyWorkflowIds(
  catalog: { workflows: ReadonlyArray<{ id: string; dependencies: readonly string[] }> },
  terminalWorkflowId: string,
): string[] {
  const byId = new Map(catalog.workflows.map((workflow) => [workflow.id as string, workflow]));
  const visiting = new Set<string>(),
    selected = new Set<string>();
  const ordered: string[] = [];
  function visit(id: string): void {
    if (selected.has(id)) return;
    if (visiting.has(id)) throw new Error("journey.cycle");
    const workflow = byId.get(id);
    if (!workflow) throw new Error("journey.missing_dependency");
    visiting.add(id);
    for (const dependency of workflow.dependencies) visit(dependency);
    visiting.delete(id);
    selected.add(id);
    ordered.push(id);
  }
  visit(terminalWorkflowId);
  return ordered;
}

export function describeJourney(catalog: Catalog, terminalWorkflowId: string, currentWorkflowId?: string) {
  const byId = new Map(catalog.workflows.map((workflow) => [workflow.id as string, workflow]));
  const ordered = journeyWorkflowIds(catalog, terminalWorkflowId);
  const phases = [...catalog.phases]
    .sort((a, b) => a.order - b.order)
    .flatMap((phase) => {
      const workflows = ordered.filter((id) => byId.get(id)!.phaseIds.includes(phase.id));
      return workflows.length ? [{ phaseId: phase.id, title: phase.focus, workflowCount: workflows.length }] : [];
    });
  const current = currentWorkflowId ? byId.get(currentWorkflowId) : undefined;
  return {
    terminalWorkflowId,
    workflowCount: ordered.length,
    phases,
    currentPhasePositions: phases.flatMap((phase, index) => (current?.phaseIds.includes(phase.phaseId) ? [index + 1] : [])),
    phaseCount: phases.length,
    successors: current ? ordered.filter((id) => byId.get(id)!.dependencies.includes(current.id)) : [],
    declarationOnly: true as const,
    businessComplete: false as const,
    // No fabricated "research is done" receipt: only the active planner/evidence owner can accept work.
    nextAction:
      "A workflow pass is not business completion. Initialize the accepted product and follow the active business plan through current independent review and closeout.",
  };
}
