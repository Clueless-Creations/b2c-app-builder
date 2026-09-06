import { journeyWorkflowIds } from "../knowledge-service/journey.js";
import { isPlanningWorkspace, readPlanningResume } from "../session/planning-context.js";
import { initializeWorkspace } from "../session/initialize.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadRegistry, registerWorkspace } from "../../adapters/registry.js";
import { registeredWorkspace, resolveWorkspaceRegistration } from "./installed-composition.js";
import { createPlanningWorkspace } from "../session/new.js";
import { planWorkspace } from "../session/plan.js";
import { runSession, recoverPublicRequest, loadControlFile, resolveWorkspacePaths, type SessionHost } from "../session/run.js";
import { workspaceRevision } from "../session/workspace-revision.js";
import { loadWorkspaceCatalog } from "../session/catalog-contract.js";
import { classifyAttemptFailure } from "../session/attempt-failure.js";
import { loadRunState } from "../engine/runstate.js";
import { compilePlan } from "../engine/compile.js";
import { validateCurrentReview, validateReviewReceipt, workspaceArtifactFingerprint } from "../engine/review-evidence.js";
import { hasCurrentDeterministicVerification } from "../engine/verification.js";
import { requiresIndependentReview } from "../engine/verification-policy.js";
import { stableJson } from "../../tooling/lib/canonical-json.js";

export function createBusiness(input: { workspaceId: string; directory: string; name: string; hypothesis: string; mandate?: string }) {
  const directory = path.resolve(input.directory),
    registry = loadRegistry();
  if (registry.workspaces.some((entry) => entry.id === input.workspaceId || path.resolve(entry.path) === directory))
    throw new Error("business.registration_conflict");
  createPlanningWorkspace({
    directory,
    slug: input.workspaceId,
    name: input.name,
    hypothesis: input.hypothesis,
    mandate: input.mandate ?? `Build a complete consumer business for this hypothesis: ${input.hypothesis}`,
  });
  registerWorkspace(input.workspaceId, directory);
  return {
    workspaceId: input.workspaceId,
    status: "hypothesis" as const,
    revision: workspaceRevision(directory),
    nextAction:
      "Preserve operations/LAUNCH_PROGRAM.md through research, design, implementation and closeout. Research the hypothesis and record an explicit Go, Pivot or Kill decision in the authored product before initialization.",
  };
}
export function initializeBusiness(input: { workspaceId: string; expectedRevision: string }) {
  const workspace = resolveWorkspaceRegistration(input.workspaceId);
  return { workspaceId: input.workspaceId, ...initializeWorkspace(workspace, { expectedRevision: input.expectedRevision }) };
}
export function planBusiness(input: { workspaceId: string; maxConcurrency: number }) {
  const workspace = registeredWorkspace(input.workspaceId),
    revision = workspaceRevision(workspace);
  if (!existsSync(path.join(workspace, "state/business-state.json"))) {
    if (!isPlanningWorkspace(workspace)) throw new Error("business.runtime_incomplete");
    const resume = readPlanningResume(workspace);
    return {
      workspaceId: input.workspaceId,
      revision,
      planId: null,
      status: "not_initialized" as const,
      ready: [],
      held: [],
      completed: 0,
      providerObservation: "not_requested" as const,
      authorityGranted: false as const,
      nextAction: resume.nextAction,
      resume,
      completion: readBusinessCompletion(input.workspaceId, revision),
    };
  }
  const report = planWorkspace(workspace, { maxConcurrency: input.maxConcurrency, observeProviders: false });
  if (workspaceRevision(workspace) !== revision) throw new Error("business.concurrent_plan_change");
  return {
    workspaceId: input.workspaceId,
    revision,
    planId: report.planId,
    completion: readBusinessCompletion(input.workspaceId, revision),
    status: report.batches.flat().length ? ("ready" as const) : ("held" as const),
    ready: report.batches.flat().map((node) => ({ workflowId: `workflow.${node.nodeId.slice(4)}`, title: node.title, status: "ready" })),
    held: report.held.map((node) => ({
      workflowId: `workflow.${node.nodeId.slice(4)}`,
      title: node.title,
      status: "held",
      reason: "This workflow requires current prerequisites, evidence or an authorized decision before dispatch.",
      ...(node.reasonCode ? { reasonCode: node.reasonCode } : {}),
    })),
    completed: report.done,
    providerObservation: "not_requested" as const,
    authorityGranted: false as const,
    nextAction: report.batches.flat().length
      ? "Run the bounded session against this exact revision using existing authority."
      : "Resolve the reported holds; this passive plan did not observe provider prerequisites.",
  };
}
export async function runBusiness(
  input: { workspaceId: string; expectedRevision: string; requestId: string; scope: string[]; wallClockSeconds: number; maxConcurrency: number },
  host: SessionHost = {},
) {
  const workspace = registeredWorkspace(input.workspaceId);
  const control = loadControlFile(resolveWorkspacePaths(workspace).control);
  if (!control) throw new Error("business.not_initialized");
  const result = await runSession(
    {
      workspace,
      sessionId: `public-${input.requestId}`,
      brief: { schemaVersion: "1.0.0", businessSlug: control.businessSlug, scopeHints: input.scope },
      expectedRevision: input.expectedRevision,
      requestId: input.requestId,
      requestDigest: `sha256:${createHash("sha256").update(stableJson(input)).digest("hex")}`,
      maxConcurrency: input.maxConcurrency,
      wallClockSeconds: input.wallClockSeconds,
    },
    host,
  );
  return {
    ...result,
    completion: readBusinessCompletion(input.workspaceId, workspaceRevision(workspace)),
    workspaceId: input.workspaceId,
    requestId: input.requestId,
    scope: "bounded_session" as const,
    notifications: "disabled" as const,
    providerProof: "not_observed" as const,
  };
}
export function recoverBusiness(input: { workspaceId: string; expectedRevision: string; requestId: string }) {
  const workspace = registeredWorkspace(input.workspaceId);
  return { workspaceId: input.workspaceId, requestId: input.requestId, ...recoverPublicRequest(workspace, input), dispatched: false as const };
}
export function businessEvidence(input: { workspaceId: string; workflowId?: string }) {
  const workspace = registeredWorkspace(input.workspaceId),
    revision = workspaceRevision(workspace),
    runPath = path.join(workspace, "run/run-state.json");
  if (!existsSync(runPath)) return { workspaceId: input.workspaceId, revision, runId: null, planId: null, items: [], liveLaunchProven: false as const };
  const loaded = loadWorkspaceCatalog(workspace);
  if (!loaded.ok) throw new Error("business.catalog_unavailable");
  const plan = compilePlan(loaded.catalog),
    run = loadRunState(runPath);
  if (run.planId !== plan.planId) throw new Error("business.run_plan_mismatch");
  const items = plan.nodes
    .filter((node) => !input.workflowId || node.workflowId === input.workflowId)
    .map((node) => {
      const state = run.nodes[node.id],
        attempt = state?.attempts.at(-1),
        receipt = attempt?.independentVerification;
      const proofSource =
        attempt?.proofSource ??
        (receipt?.mode === "synthetic" || receipt?.mode === "graph" ? "synthetic" : receipt?.mode === "workspace" ? "workspace" : "unobserved");
      const reasons: string[] = [];
      if (state?.status === "succeeded") {
        if (requiresIndependentReview(node))
          reasons.push(
            ...(receipt
              ? receipt.mode === "workspace"
                ? validateCurrentReview(plan, run, node.id, workspace)
                : validateReviewReceipt(plan, run, node.id, receipt, workspace)
              : ["review.missing"]),
          );
        if (!hasCurrentDeterministicVerification(plan, run, node.id)) reasons.push("verification.gates_not_current");
        for (const output of node.outputs) {
          const matches = run.artifactBindings.filter((entry) => entry.artifactId === output);
          if (matches.length !== 1) {
            reasons.push("artifact.binding_missing_or_ambiguous");
            continue;
          }
          const binding = matches[0]!;
          if (!binding.accepted) reasons.push("artifact.not_accepted");
          if (proofSource === "workspace")
            try {
              if (workspaceArtifactFingerprint(workspace, binding.path) !== binding.fingerprint) reasons.push("artifact.changed");
            } catch {
              reasons.push("artifact.unavailable");
            }
        }
        if (proofSource === "unobserved") reasons.push("proof.unobserved");
      }
      if (state?.status === "failed") reasons.push("attempt.failed", classifyAttemptFailure(attempt?.error));
      return {
        workflowId: node.workflowId,
        status: state?.status ?? "pending",
        attemptId: attempt?.id ?? null,
        proofSource,
        acceptance:
          state?.status === "succeeded" ? (reasons.length ? ("stale" as const) : ("current" as const)) : attempt ? ("pending" as const) : ("absent" as const),
        artifactIds: node.outputs,
        reasonCodes: [...new Set(reasons)],
      };
    });
  if (input.workflowId && !items.length) throw new Error("business.workflow_unknown");
  if (workspaceRevision(workspace) !== revision) throw new Error("business.concurrent_evidence_change");
  return { workspaceId: input.workspaceId, revision, runId: run.runId, planId: plan.planId, items, liveLaunchProven: false as const };
}

/** Business acceptance is independent of the bounded session's successful-work counter. */
export function readBusinessCompletion(workspaceId: string, expectedRevision?: string) {
  const evidence = businessEvidence({ workspaceId });
  if (expectedRevision && evidence.revision !== expectedRevision) throw new Error("business.concurrent_evidence_change");
  let selected = evidence.items;
  if (evidence.planId !== null) {
    const loaded = loadWorkspaceCatalog(registeredWorkspace(workspaceId));
    if (!loaded.ok) throw new Error("business.catalog_unavailable");
    const terminal = "workflow.orchestration.full-launch-closeout";
    const ids = new Set(loaded.catalog.workflows.some((workflow) => workflow.id === terminal) ? journeyWorkflowIds(loaded.catalog, terminal) : []);
    selected = evidence.items.filter((item) => ids.has(item.workflowId));
    if (workspaceRevision(registeredWorkspace(workspaceId)) !== evidence.revision) throw new Error("business.concurrent_evidence_change");
  }
  // Ongoing operations outside the closeout contract do not retroactively reopen this delivery.
  const excluded = selected.filter((item) => item.status === "not_needed");
  const required = selected.filter((item) => item.status !== "not_needed");
  const outstanding = required.filter((item) => item.acceptance !== "current" || item.proofSource !== "workspace");
  const closeout = required.find((item) => item.workflowId === "workflow.orchestration.full-launch-closeout");
  return {
    deliveryAccepted: !!closeout && outstanding.length === 0,
    closeoutWorkflowId: "workflow.orchestration.full-launch-closeout",
    requiredCount: required.length,
    excludedCount: excluded.length,
    outstandingCount: outstanding.length,
    assessed: evidence.runId !== null,
    nextAction: !evidence.runId
      ? isPlanningWorkspace(registeredWorkspace(workspaceId))
        ? "Finish and independently review planning artifacts, then initialize the accepted product."
        : "The product is initialized but no execution proof exists yet. Run the next authorized work from business-plan; do not initialize again."
      : outstanding.length
        ? "Continue the active business plan. Resolve missing or stale evidence and authority holds; a bounded session ending does not complete the business."
        : !closeout
          ? "This composition has no complete-business closeout contract; do not claim complete-business acceptance."
          : "The recorded deliverable passed its current closeout evidence. Store submission, production release and live business results remain separate claims.",
  };
}
