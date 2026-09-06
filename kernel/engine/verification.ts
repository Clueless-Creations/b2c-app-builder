import { createHash } from "node:crypto";
import type { CompiledPlan, RunNodeId } from "./compile.js";
import type { RunStateDocument } from "../schema/types.js";
import { requiresIndependentReview } from "./verification-policy.js";
export { requiresIndependentReview } from "./verification-policy.js";

/**
 * Fresh-context acceptance rules shared by the operator CLI, the scheduled verifier pass,
 * and the run-state acceptance function. All acceptance paths use the same refusal rules.
 */

export const VERIFICATION_REQUIRED_BLOCKER = "Verification required";
/**
 * Set when an independent verifier judged the produced work and did not accept it. Deliberately
 * NOT part of the pending pool: a rejection is a durable judgment for a person (or a fresh
 * producer attempt) to act on, not something the next session's sweep should silently re-litigate.
 * An unavailable verifier, by contrast, leaves the pending blocker untouched — silence judged
 * nothing, so the work stays in the pool for the next sweep.
 */
export const VERIFICATION_REJECTED_BLOCKER = "Verification rejected.";

/** Bind gate evidence to the complete output set produced by this exact attempt. */
export function verificationOutputFingerprint(plan: CompiledPlan, run: RunStateDocument, nodeId: RunNodeId): string | undefined {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const attempt = run.nodes[nodeId]?.attempts.at(-1);
  if (!node || !attempt) return undefined;
  const outputs = node.outputs.map((artifactId) => run.artifactBindings.find((binding) => binding.artifactId === artifactId));
  if (outputs.some((binding) => !binding?.fingerprint || binding.attemptId !== attempt.id || binding.producedBy !== nodeId)) return undefined;
  return createHash("sha256")
    .update(JSON.stringify(outputs.map((binding) => [binding!.artifactId, binding!.path, binding!.fingerprint])))
    .digest("hex");
}

export function hasCurrentDeterministicVerification(plan: CompiledPlan, run: RunStateDocument, nodeId: RunNodeId): boolean {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return false;
  if (node.verification.gateIds.length === 0) return true;
  const attempt = run.nodes[nodeId]?.attempts.at(-1);
  const receipt = attempt?.deterministicVerification;
  const authorityContextFingerprint = attempt?.designAuthorityEvaluation?.authorityContextFingerprint;
  return Boolean(
    receipt &&
    receipt.passed &&
    receipt.attemptId === attempt?.id &&
    receipt.inputFingerprint === attempt.inputFingerprint &&
    receipt.outputFingerprint === verificationOutputFingerprint(plan, run, nodeId) &&
    JSON.stringify(receipt.gateIds) === JSON.stringify(node.verification.gateIds) &&
    receipt.authorityContextFingerprint === authorityContextFingerprint &&
    receipt.evidence.some((entry) => entry.trim().length > 0),
  );
}

/** The session records the actual gate runner result, including failure, before requesting review. */
export function recordDeterministicVerification(
  plan: CompiledPlan,
  run: RunStateDocument,
  nodeId: RunNodeId,
  result: { allPassed: boolean; evidence: string[] },
  now: string,
): void {
  const node = plan.nodes.find((candidate) => candidate.id === nodeId);
  const state = run.nodes[nodeId];
  const attempt = state?.attempts.at(-1);
  const outputFingerprint = verificationOutputFingerprint(plan, run, nodeId);
  if (
    !node ||
    !attempt ||
    state?.status !== "blocked" ||
    state.blocker !== VERIFICATION_REQUIRED_BLOCKER ||
    attempt.status !== "blocked" ||
    !outputFingerprint
  ) {
    throw new Error(`Cannot record gates without complete pending output for ${nodeId}`);
  }
  attempt.deterministicVerification = {
    attemptId: attempt.id,
    inputFingerprint: attempt.inputFingerprint,
    outputFingerprint,
    gateIds: [...node.verification.gateIds],
    passed: result.allPassed && result.evidence.some((entry) => entry.trim().length > 0),
    evidence: [...result.evidence],
    checkedAt: now,
    ...(attempt.designAuthorityEvaluation
      ? { authorityContextFingerprint: attempt.designAuthorityEvaluation.authorityContextFingerprint }
      : {}),
  };
  for (const entry of result.evidence) if (!attempt.evidence.includes(entry)) attempt.evidence.push(entry);
  run.updatedAt = now;
}

/** Nodes whose produced work is parked waiting on a fresh-context judgment. */
export function listPendingFreshContext(plan: CompiledPlan, run: RunStateDocument): RunNodeId[] {
  const byId = new Map(plan.nodes.map((node) => [node.id as string, node]));
  return Object.values(run.nodes)
    .filter((node) => {
      const planned = byId.get(node.nodeId);
      return (
        planned &&
        node.status === "blocked" &&
        node.blocker === VERIFICATION_REQUIRED_BLOCKER &&
        requiresIndependentReview(planned) &&
        hasCurrentDeterministicVerification(plan, run, planned.id)
      );
    })
    .map((node) => node.nodeId as RunNodeId);
}

export interface FreshContextRefusal {
  readonly code: "unknown_node" | "wrong_kind" | "not_pending" | "missing_verifier" | "producer_cannot_verify" | "gates_required";
  readonly message: string;
}

/**
 * Producer≠verifier, mechanically (R15): the accepting session must not own ANY attempt on the
 * node — not just the latest — and only a node genuinely parked pending verification may be
 * promoted. A missing or blank verifier identity is not evidence of independence.
 * Returns the refusal, or undefined when acceptance may proceed. This checks recorded attempt
 * ownership; a different session label alone cannot prove a physically separate context.
 * The session verifier edges also attest acceptance in the hash-chained audit log.
 */
export function refuseFreshContextAcceptance(
  plan: CompiledPlan,
  run: RunStateDocument,
  nodeId: RunNodeId,
  verifierSessionId?: string,
): FreshContextRefusal | undefined {
  const planned = plan.nodes.find((node) => node.id === nodeId);
  const state = run.nodes[nodeId];
  if (!planned || !state) return { code: "unknown_node", message: `"${nodeId}" is not a node on this run` };
  if (!requiresIndependentReview(planned)) {
    return {
      code: "wrong_kind",
      message: `${nodeId} verifies as ${planned.verification.kind} — its gates are the acceptance path, not a fresh-context verifier`,
    };
  }
  if (state.status !== "blocked" || state.blocker !== VERIFICATION_REQUIRED_BLOCKER) {
    return { code: "not_pending", message: `${nodeId} is ${state.status}${state.blocker ? ` (${state.blocker})` : ""}, not blocked pending verification` };
  }
  if (!verifierSessionId?.trim()) {
    return { code: "missing_verifier", message: `Fresh-context acceptance for ${nodeId} requires a verifier session` };
  }
  const producingStates = [state, ...(planned.reviewOf ?? []).map((id) => run.nodes[id]).filter((entry) => entry !== undefined)];
  const priorOwner = producingStates.flatMap((entry) => entry.attempts).find((attempt) => attempt.ownerSessionId === verifierSessionId);
  if (priorOwner) {
    return {
      code: "producer_cannot_verify",
      message: `${verifierSessionId} owns attempt ${priorOwner.id} on this node — a different session must judge it (producer never verifies its own work)`,
    };
  }
  if (!hasCurrentDeterministicVerification(plan, run, nodeId)) {
    return { code: "gates_required", message: `Independent acceptance for ${nodeId} requires passing gates for the current attempt and output fingerprints` };
  }
  return undefined;
}
