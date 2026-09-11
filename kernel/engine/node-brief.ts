import { reviewFacet } from "./review-facet.js";
import { loadSelectedKnowledge, type SelectedOperationBinding } from "../composition/compile-bindings.js";
import { loadWorkspaceBindingTruth, type WorkspaceBindingTruth } from "../composition/onboarding-selection.js";
import type { SourceAccess } from "../../contracts/source-access.js";
import type { ContextCapsule } from "../context/receipt.js";
import type { CompiledPlan, CompiledRunNode } from "./compile.js";
import { requiresIndependentReview } from "./verification-policy.js";
import { domainIdFromKnowledgePath, laterGuidanceContext, partitionLoadWhen } from "../lib/later-guidance.js";
import type { ProviderDecision } from "../../catalog/ontology/onboarding-applicability.js";

/**
 * Composes the per-node worker brief from a compiled node's authored contract — the one place
 * that turns catalog data into "what a fresh-context worker actually receives".
 * kernel/session/plan.ts exposes these briefs on the ready frontier. kernel/session/executor.ts
 * passes the same contract to runtime workers and verification sessions.
 *
 * Absent contract fields are surfaced as explicit "(not authored)" markers, never silently
 * dropped — a brief that hides a missing contract would recreate the title-only dispatch the
 * 2026-08 audit found, one layer up.
 */
export interface NodeBrief {
  selectedOperation?: SelectedOperationBinding;
  selectedKnowledge?: ReturnType<typeof loadSelectedKnowledge>;
  sourceAccess?: SourceAccess[];
  workflowId: string;
  title: string;
  role?: { id: string; name: string; promptPath: string };
  /** Parent repo contracts followed by the specialist prompt, all workspace-relative. */
  contractFiles: string[];
  instructions: string;
  /** Workspace paths the worker should open, in authored order. */
  open: string[];
  /** Open-if-present references — consulted when they exist, never a readiness gate. */
  consult: string[];
  /** Knowledge to load before working: path plus the authored load condition. */
  load: NodeBriefLoad[];
  /** Later-horizon binds kept off `load` so packet surfaces can still account for them. */
  deferredLoad?: NodeBriefLoad[];
  /** Exact context selectors compiled after a selected route, when a capsule is supplied. */
  contextSelectors?: string[];
  /** Conditional role knowledge resolved from executable context packs. */
  route: Array<{
    packId: string;
    packTitle: string;
    /**
     * The catalog reference id, when the builder had it in scope (ARCH-06: pin resources, not
     * paths). Optional because the local compiler resolves packs to workspace paths and never
     * holds the id here; the hosted builder does, and a hosted reader cannot fetch by path.
     */
    referenceId?: string;
    path: string;
    title: string;
    loadWhen: string;
    resource?: { path: string; sha256: string; origin: "skill" | "workspace" };
  }>;
  skills: Array<{ id: string; when: string }>;
  tools: Array<{ id: string; when: string }>;
  /** Declared outputs the worker must produce (workspace paths). */
  produce: string[];
  /** How the work is verified: gate commands when deterministic, otherwise the policy kind. */
  verify: { kind: string; gateCommands: string[]; failClosed: boolean; requiresIndependentReview?: boolean };
  /** Founder-only actions this node parks on (approval descriptions). */
  approvals: string[];
  tokenBudget: number;
  /**
   * Isolated-review facet (knowledge/orchestration/isolated-review.md). `reviewOf` non-empty means
   * this node IS the auditor: dispatch it in a fresh context with read-only tools, its findings
   * artifact the only writable path, and no producer notes on the brief. `reviewedBy` lists the
   * fresh-context roles that must audit this node's own outputs before they count as accepted.
   * Present only when either list is non-empty.
   */
  review?: { reviewOf: string[]; reviewedBy: string[] };
  /** Activated pin versus the candidate declaration. Absent when no workspace was supplied. */
  bindingTruth?: WorkspaceBindingTruth;
}

export interface NodeBriefLoad {
  path: string;
  title: string;
  loadWhen: string;
  referenceId?: string;
  sectionId?: string;
  revision?: string;
  resource?: { path: string; sha256: string; origin: "skill" | "workspace" };
}

export { reviewFacet } from "./review-facet.js";

function toBriefLoad(entry: {
  path: string;
  title: string;
  loadWhen: string;
  referenceId?: string;
  sectionId?: string;
  revision?: string;
  resource?: { path: string; sha256: string; origin: "skill" | "workspace" };
}): NodeBriefLoad {
  return {
    path: entry.path,
    title: entry.title,
    loadWhen: entry.loadWhen,
    ...(entry.referenceId ? { referenceId: entry.referenceId } : {}),
    ...(entry.resource ? { resource: entry.resource } : {}),
    ...(entry.sectionId ? { sectionId: entry.sectionId } : {}),
    ...(entry.revision ? { revision: entry.revision } : {}),
  };
}

/** Task artifacts the worker may rewrite. Receipt hashes for these paths are taken after writes. */
export function mutableTaskArtifactPaths(brief: Pick<NodeBrief, "open" | "produce">): readonly string[] {
  const outputs = new Set(brief.produce);
  return brief.open.filter((relativePath) => outputs.has(relativePath));
}

const NOT_AUTHORED = "(instructions not authored; record the missing workflow guidance before proceeding)";

export function composeNodeBrief(node: CompiledRunNode, plan: CompiledPlan, capsule?: Pick<ContextCapsule, "sourceIds">, workspaceRoot?: string): NodeBrief {
  // Worker implementations retain the ordinary capsule and per-reference reads. Their
  // package context is verified by the binding and route; it is not one giant prompt.
  const selectedKnowledge =
    node.selectedOperation && node.selectedOperation.implementation.mode !== "worker-artifact" ? loadSelectedKnowledge(node.selectedOperation) : undefined;
  if (capsule && selectedKnowledge?.some((entry) => !capsule.sourceIds.includes(entry.path)))
    throw new Error("binding.required_knowledge_missing_from_capsule");
  const pathsByArtifactId = new Map(plan.artifactBindings.map((binding) => [binding.artifactId, binding.path]));
  const matchesCapsule = (entry: { path: string; sectionId?: string; revision?: string }, sourceIds: readonly string[]): boolean =>
    sourceIds.some((sourceId) => {
      const [pathPart, rest] = sourceId.split("#");
      if (pathPart !== entry.path) return false;
      const [sectionId, revision] = (rest ?? "").split("@");
      if (entry.sectionId && sectionId && sectionId !== entry.sectionId) return false;
      if (entry.revision && revision && revision !== entry.revision) return false;
      if (!entry.sectionId) return true;
      return !sectionId || sectionId === entry.sectionId;
    });
  const laterContext = laterGuidanceContext(node.workflowId, node.domainId);
  const bound = (node.references ?? []).map((reference) => {
    const domainId = domainIdFromKnowledgePath(reference.path);
    return {
      path: reference.path,
      ...(reference.resource ? { resource: reference.resource } : {}),
      title: reference.title,
      loadWhen: reference.loadWhen,
      referenceId: reference.id,
      ...(domainId ? { domainId } : {}),
      ...(reference.sectionId ? { sectionId: reference.sectionId } : {}),
      ...(reference.revision ? { revision: reference.revision } : {}),
    };
  });
  const { current, later } = partitionLoadWhen(bound, laterContext);
  const load = current.filter((entry) => !capsule || matchesCapsule(entry, capsule.sourceIds)).map(toBriefLoad);
  const deferredLoad = later.map(toBriefLoad);
  const seenKnowledgePaths = new Set(bound.map((reference) => reference.path));
  const route =
    node.role?.contextPacks.flatMap((pack) =>
      pack.references.flatMap((reference) => {
        if (seenKnowledgePaths.has(reference.path)) return [];
        const entry = {
          ...(reference.resource ? { resource: reference.resource } : {}),
          packId: pack.id,
          packTitle: pack.title,
          path: reference.path,
          title: reference.title,
          loadWhen: reference.loadWhen,
        };
        if (capsule && !matchesCapsule(entry, capsule.sourceIds)) return [];
        seenKnowledgePaths.add(reference.path);
        return [entry];
      }),
    ) ?? [];
  return {
    ...(node.selectedOperation ? { selectedOperation: node.selectedOperation, selectedKnowledge } : {}),
    workflowId: node.workflowId,
    title: node.title,
    role: node.role,
    contractFiles: node.role ? [...node.role.parentPromptPaths, node.role.promptPath] : [],
    instructions: node.instructions?.trim() || NOT_AUTHORED,
    open: node.reads ?? [],
    ...(node.sourceAccess?.length ? { sourceAccess: node.sourceAccess } : {}),
    consult: node.consults ?? [],
    load,
    ...(deferredLoad.length ? { deferredLoad } : {}),
    ...(capsule ? { contextSelectors: capsule.sourceIds } : {}),
    route,
    skills: node.role?.skillRoutes ?? [],
    tools: node.role?.toolRoutes ?? [],
    produce: node.outputs.map((artifactId) => pathsByArtifactId.get(artifactId) ?? artifactId),
    verify: {
      kind: node.verification.kind,
      gateCommands: node.verification.gateIds,
      failClosed: node.verification.failClosed,
      requiresIndependentReview: requiresIndependentReview(node),
    },
    approvals: node.approvals.map((approval) => approval.description),
    tokenBudget: node.tokenBudget,
    ...(() => {
      const review = reviewFacet(node.reviewOf, node.role?.reviewedBy);
      return review ? { review } : {};
    })(),
    ...(workspaceRoot ? { bindingTruth: loadWorkspaceBindingTruth(workspaceRoot) } : {}),
  };
}

function renderProviderDecision(decision: ProviderDecision): string {
  switch (decision.status) {
    case "selected":
      return `selected ${decision.providerId}`;
    case "not_required":
      return "not_required";
    case "unresolved":
      return "unresolved";
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

/** Shared pin-versus-declaration lines for the frontier brief and the producer/verifier prompts. */
export function renderBindingTruth(truth: WorkspaceBindingTruth): string[] {
  const lifecycle = ((): string => {
    switch (truth.lifecycle) {
      case "proposal":
        return "proposal (not an activated execution pin)";
      case "activated":
        return "activated";
      case "pending-activation":
        return "pending-activation (journal is not execution truth)";
      case "stale-candidate":
        return "stale-candidate (candidate declaration is not execution truth)";
      case "unresolved":
        return "unresolved";
      default: {
        const exhaustive: never = truth.lifecycle;
        return exhaustive;
      }
    }
  })();
  const lines = [
    `Binding lifecycle: ${lifecycle}`,
    truth.candidateIsExecutionTruth
      ? `Candidate declaration matches the activated pin. Verified present-paywall ${renderProviderDecision(truth.verified.presentPaywall)}.`
      : `Candidate declaration is not execution truth. Declared present-paywall ${renderProviderDecision(truth.declared.presentPaywall)}; verified present-paywall ${renderProviderDecision(truth.verified.presentPaywall)}.`,
  ];
  if (truth.surfaces.pages.length > 0) {
    const pages = truth.surfaces.pages.map((page) => `${page.id} job=${page.job} interaction=${page.interaction}`).join("; ");
    lines.push(`Purpose and technique stay independent: ${pages}. 60fps register: ${truth.surfaces.sixtyFpsRegister}.`);
  }
  lines.push("Proof strength on this brief is structural selection state, not semantic review or device observation.");
  return lines;
}

/** The brief as compact markdown, for the frontier report's human rendering. */
export function renderNodeBrief(brief: NodeBrief): string {
  const lines: string[] = [`### ${brief.title} (${brief.workflowId})`];
  if (brief.bindingTruth) lines.push(...renderBindingTruth(brief.bindingTruth));
  if (brief.selectedOperation)
    lines.push(
      `Selected operation: ${brief.selectedOperation.operation}; implementation: ${brief.selectedOperation.implementation.id}; execution route: unknown`,
    );
  if (brief.selectedKnowledge?.length) lines.push(`Selected package knowledge: ${brief.selectedKnowledge.map((entry) => entry.id).join(", ")}`);
  if (brief.role) lines.push(`Role: ${brief.role.name} (${brief.role.promptPath})`);
  if (brief.contractFiles.length > 0) lines.push(`Read contracts in order: ${brief.contractFiles.join(", ")}`);
  lines.push(`Do: ${brief.instructions}`);
  if (brief.sourceAccess?.length) lines.push(`Source access: ${brief.sourceAccess.map((claim) => `${claim.access} ${claim.path}`).join(", ")}`);
  if (brief.open.length > 0) lines.push(`Open: ${brief.open.join(", ")}`);
  if (brief.consult.length > 0) lines.push(`Consult when present: ${brief.consult.join(", ")}`);
  if (brief.load.length > 0) lines.push(`Load: ${brief.load.map((entry) => entry.path).join(", ")}`);
  if (brief.contextSelectors && brief.contextSelectors.length > 0) lines.push(`Context: ${brief.contextSelectors.join(", ")}`);
  if (brief.route.length > 0)
    lines.push(`Role knowledge (load only when condition matches): ${brief.route.map((entry) => `${entry.path} — ${entry.loadWhen}`).join("; ")}`);
  if (brief.skills.length > 0)
    lines.push(`Nested skills (use when available and matched): ${brief.skills.map((entry) => `${entry.id} — ${entry.when}`).join("; ")}`);
  if (brief.tools.length > 0) lines.push(`Discover tools: ${brief.tools.map((entry) => `${entry.id} — ${entry.when}`).join("; ")}`);
  if (brief.produce.length > 0) lines.push(`Produce: ${brief.produce.join(", ")}`);
  lines.push(
    brief.verify.gateCommands.length > 0
      ? `Verify: ${brief.verify.gateCommands.join(", ")}${brief.verify.requiresIndependentReview ? "; then independent non-producer acceptance with current evidence" : ""}`
      : `Verify: ${brief.verify.kind}${brief.verify.failClosed ? " (fail-closed: outputs stay unaccepted until a non-producer verifier accepts with evidence — `npm run verify:node`)" : ""}`,
  );
  if (brief.approvals.length > 0) lines.push(`Founder-only: ${brief.approvals.join("; ")}`);
  if (brief.review?.reviewOf.length)
    lines.push(`Isolated review of: ${brief.review.reviewOf.join(", ")} (fresh context, read-only tools, findings artifact only)`);
  if (brief.review?.reviewedBy.length) lines.push(`Accepted only after a fresh-context audit by: ${brief.review.reviewedBy.join(", ")}`);
  return lines.join("\n");
}
