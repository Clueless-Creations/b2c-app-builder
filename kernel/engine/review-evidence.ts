import { nodeContractIdentity } from "../composition/compile-bindings.js";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import path from "node:path";
import type { CompiledPlan, CompiledRunNode, RunNodeId } from "./compile.js";
import type { IndependentVerificationReceipt, RunStateDocument } from "../schema/types.js";
import { outputFingerprintPath } from "./artifact-fingerprint.js";
import { hasCurrentDeterministicVerification, verificationOutputFingerprint } from "./verification.js";
import { validateExactDesignAuthorityEvaluation } from "./design-taste-authority.js";

export function workflowContractFingerprint(node: CompiledRunNode): string {
  return createHash("sha256")
    .update(JSON.stringify(nodeContractIdentity(node)))
    .digest("hex");
}

/** A relative workspace artifact cannot escape through a parent symlink. */
export function workspaceArtifactFingerprint(workspaceRoot: string, relativePath: string): string {
  if (
    !relativePath.trim() ||
    !relativePath.split(/[\\/]/).some((entry) => entry && entry !== ".") ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..")
  )
    throw new Error("review artifact path is outside the workspace");
  let current = path.resolve(workspaceRoot);
  for (const part of relativePath.split(/[\\/]/).filter((entry) => entry && entry !== ".")) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error("review artifact path contains a symlink");
  }
  return outputFingerprintPath(current);
}

function subjectIds(plan: CompiledPlan, node: CompiledRunNode): string[] {
  return [...new Set([...node.outputs, ...(node.reviewOf ?? []).flatMap((id) => plan.nodes.find((entry) => entry.id === id)?.outputs ?? [])])];
}

function criterionPaths(node: CompiledRunNode, subjects: readonly { path: string }[]): string[] {
  // Execution bookkeeping changes as unrelated work advances; it is not the review rubric.
  return [...new Set([...(node.reads ?? []), ...(node.role?.parentPromptPaths ?? []), ...(node.role ? [node.role.promptPath] : [])])]
    .filter((value) => !/^(?:state|control|run)\//.test(value) && !subjects.some((subject) => subject.path === value))
    .sort();
}

export function captureReviewEvidence(
  plan: CompiledPlan,
  run: RunStateDocument,
  nodeId: RunNodeId,
  workspaceRoot: string,
  verifierSessionId: string,
  now: string,
  mode: IndependentVerificationReceipt["mode"] = "workspace",
): IndependentVerificationReceipt {
  const node = plan.nodes.find((entry) => entry.id === nodeId);
  const attempt = run.nodes[nodeId]?.attempts.at(-1);
  const outputFingerprint = verificationOutputFingerprint(plan, run, nodeId);
  if (!node || !attempt || !outputFingerprint) throw new Error("review requires complete current-attempt output");
  const subjects = subjectIds(plan, node).map((artifactId) => {
    const binding = run.artifactBindings.find((entry) => entry.artifactId === artifactId);
    if (!binding?.path || !binding.fingerprint) throw new Error("review subject is missing");
    const fingerprint = mode === "workspace" ? workspaceArtifactFingerprint(workspaceRoot, binding.path) : binding.fingerprint;
    if (fingerprint !== binding.fingerprint) throw new Error(`review subject changed after production: ${binding.path}`);
    return { artifactId, path: binding.path, fingerprint };
  });
  const criteria =
    mode === "workspace"
      ? criterionPaths(node, subjects).map((relativePath) => ({ path: relativePath, fingerprint: workspaceArtifactFingerprint(workspaceRoot, relativePath) }))
      : [];
  return {
    mode,
    workflowId: node.workflowId,
    attemptId: attempt.id,
    producerSessionId: attempt.ownerSessionId,
    verifierSessionId,
    verdict: "rejected",
    checkedAt: now,
    policyFingerprint: workflowContractFingerprint(node),
    outputFingerprint,
    subjects,
    criteria,
    evidence: ["Review has not returned a verdict."],
  };
}

/** Read-only validation usable by closeout, resume, and the acceptance boundary. */
export function validateReviewReceipt(
  plan: CompiledPlan,
  run: RunStateDocument,
  nodeId: RunNodeId,
  receipt: IndependentVerificationReceipt,
  workspaceRoot?: string,
): string[] {
  const node = plan.nodes.find((entry) => entry.id === nodeId);
  const state = run.nodes[nodeId];
  const attempt = state?.attempts.at(-1);
  if (!node || !state || !attempt) return ["review.attempt_missing"];
  const issues: string[] = [];
  if (receipt.workflowId !== node.workflowId || receipt.attemptId !== attempt.id || receipt.producerSessionId !== attempt.ownerSessionId)
    issues.push("review.attempt_mismatch");
  const producerAttempts = [state, ...(node.reviewOf ?? []).map((id) => run.nodes[id]).filter((entry) => entry !== undefined)].flatMap(
    (entry) => entry.attempts,
  );
  if (!receipt.verifierSessionId.trim() || producerAttempts.some((entry) => entry.ownerSessionId === receipt.verifierSessionId))
    issues.push("review.self_review");
  if (receipt.policyFingerprint !== workflowContractFingerprint(node)) issues.push("review.policy_changed");
  if (receipt.outputFingerprint !== verificationOutputFingerprint(plan, run, nodeId)) issues.push("review.outputs_changed");
  if (!hasCurrentDeterministicVerification(plan, run, nodeId)) issues.push("review.gates_missing_or_stale");
  if (node.workflowId === "workflow.design.design-system-audit") {
    if (!attempt.designAuthorityEvaluation) {
      issues.push("review.design_authority_missing");
    } else if (!workspaceRoot) {
      issues.push("review.design_authority_workspace_required");
    } else {
      issues.push(
        ...validateExactDesignAuthorityEvaluation(run, path.join(workspaceRoot, "control", "audit.jsonl"), attempt.designAuthorityEvaluation, {
          workspaceRoot,
        }).map((entry) => `review.${entry}`),
      );
    }
  }
  if (!receipt.evidence.some((entry) => entry.trim())) issues.push("review.evidence_missing");
  const expectedSubjects = subjectIds(plan, node);
  if (
    receipt.subjects.length !== expectedSubjects.length ||
    expectedSubjects.some((id) => receipt.subjects.filter((entry) => entry.artifactId === id).length !== 1)
  )
    issues.push("review.subject_coverage");
  for (const subject of receipt.subjects) {
    const binding = run.artifactBindings.find((entry) => entry.artifactId === subject.artifactId);
    if (!binding || binding.path !== subject.path || binding.fingerprint !== subject.fingerprint) issues.push("review.subject_changed");
  }
  if (receipt.mode === "workspace") {
    const expectedCriteria = criterionPaths(node, receipt.subjects);
    if (
      receipt.criteria.length !== expectedCriteria.length ||
      expectedCriteria.some((value) => receipt.criteria.filter((entry) => entry.path === value).length !== 1)
    )
      issues.push("review.criteria_coverage");
    if (!workspaceRoot) issues.push("review.workspace_required");
    else
      for (const artifact of [...receipt.subjects, ...receipt.criteria]) {
        try {
          if (workspaceArtifactFingerprint(workspaceRoot, artifact.path) !== artifact.fingerprint) issues.push(`review.artifact_changed:${artifact.path}`);
        } catch {
          issues.push(`review.artifact_unavailable:${artifact.path}`);
        }
      }
  }
  return issues;
}

/** Full-business closeout cannot accept synthetic, graph-only, rejected, or stale review. */
export function validateCurrentReview(plan: CompiledPlan, run: RunStateDocument, nodeId: RunNodeId, workspaceRoot: string): string[] {
  const state = run.nodes[nodeId];
  const receipt = state?.attempts.at(-1)?.independentVerification;
  if (!receipt) return ["review.missing"];
  return [
    ...(state.status !== "succeeded" ? ["review.node_incomplete"] : []),
    ...(receipt.mode !== "workspace" ? ["review.workspace_proof_required"] : []),
    ...(receipt.verdict !== "accepted" ? ["review.not_accepted"] : []),
    ...validateReviewReceipt(plan, run, nodeId, receipt, workspaceRoot),
  ];
}

/** Renderer gates may update produced bytes. Record those bytes before binding gate proof. */
export function refreshProducedArtifacts(plan: CompiledPlan, run: RunStateDocument, nodeId: RunNodeId, workspaceRoot: string): string[] {
  const node = plan.nodes.find((entry) => entry.id === nodeId);
  const attempt = run.nodes[nodeId]?.attempts.at(-1);
  if (!node || !attempt) return [];
  const changed: string[] = [];
  for (const artifactId of node.outputs) {
    const binding = run.artifactBindings.find((entry) => entry.artifactId === artifactId);
    if (!binding || binding.attemptId !== attempt.id) throw new Error("cannot refresh another attempt's output");
    const fingerprint = workspaceArtifactFingerprint(workspaceRoot, binding.path);
    if (binding.fingerprint !== fingerprint) changed.push(artifactId);
    binding.fingerprint = fingerprint;
  }
  return changed;
}
