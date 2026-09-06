import { createHash } from "node:crypto";
import type { CatalogWorkflowNode, NodeReference } from "../engine/compile.js";

export type WorkerSourceIdentities = Readonly<Record<string, { origin: "package" | "workspace"; sha256?: string }>>;
/** Package bytes are identity; their installation directory is not. Workspace prompts retain authored path authority. */
export function workerContextDescriptor(workflow: CatalogWorkflowNode, sources: WorkerSourceIdentities = {}) {
  const reference = (ref: NodeReference) => ({
    id: ref.id,
    path: ref.path,
    title: ref.title,
    loadWhen: ref.loadWhen,
    sha256: ref.resource?.sha256 ?? sources[ref.path]?.sha256,
    freshness: ref.freshness,
    sectionId: ref.sectionId,
    revision: ref.revision,
    reviewDueBy: ref.reviewDueBy,
  });
  const role = workflow.role;
  const prompt = (location: string) => {
    const sha256 = role?.promptResources?.[location] ?? (sources[location]?.origin === "package" ? sources[location]?.sha256 : undefined);
    return sha256 ? { origin: "package", sha256 } : { origin: "workspace", path: location };
  };
  return {
    workflowId: workflow.id,
    actionClass: workflow.actionClass,
    protectedCategory: workflow.protectedCategory,
    instructions: workflow.instructions ?? "",
    providerIds: [...(workflow.providerIds ?? [])].sort(),
    references: (workflow.references ?? []).map(reference),
    role: role
      ? {
          id: role.id,
          name: role.name,
          prompt: prompt(role.promptPath),
          parents: role.parentPromptPaths.map(prompt),
          contextPacks: role.contextPacks.map((pack) => ({ id: pack.id, title: pack.title, references: pack.references.map(reference) })),
          skillRoutes: role.skillRoutes,
          toolRoutes: role.toolRoutes,
          reviewedBy: role.reviewedBy,
        }
      : undefined,
  };
}
export function workerContextFingerprint(workflow: CatalogWorkflowNode, sources?: WorkerSourceIdentities): `sha256:${string}` {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(workerContextDescriptor(workflow, sources)))
    .digest("hex")}`;
}

/** The snapshot owns these declarations; an equal digest field alone cannot replace authored guidance. */
export function assertWorkerContext(
  workflow: CatalogWorkflowNode,
  context: { workflowId: string; instructions: string; providerIds: readonly string[]; contextFingerprint: string } | undefined,
): void {
  if (
    !context ||
    context.workflowId !== workflow.id ||
    context.instructions !== (workflow.instructions ?? "") ||
    JSON.stringify([...context.providerIds].sort()) !== JSON.stringify([...(workflow.providerIds ?? [])].sort()) ||
    context.contextFingerprint !== workerContextFingerprint(workflow)
  )
    throw Error("binding.worker_context_replacement_required");
}
