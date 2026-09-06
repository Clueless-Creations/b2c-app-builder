#!/usr/bin/env node
/**
 * Fresh-context verification CLI: the sanctioned non-producer acceptance path for a node whose
 * outputs landed blocked pending verification (judgment domains, and — since the 2026-08
 * verification flip — any gateless node with outputs; auto-accept on delivery no longer exists).
 *
 * Ordinary deterministic nodes are refused here. Gated judgment nodes require their recorded
 * mechanical proof and this independent acceptance. Producer≠verifier is enforced: the accepting --session
 * must differ from the session that produced the blocked attempt. The write goes through the
 * engine's atomic writer and the acceptance is attested in the reducer's hash-chained audit log,
 * mirroring kernel/session/approve.ts (the founder edge; this is the verifier edge).
 *
 * Usage:
 *   tsx kernel/session/verify.ts --workspace <id-or-path> --list
 *   tsx kernel/session/verify.ts --workspace <id-or-path> --node <workflow-or-run-node-id> \
 *     --session <id> --evidence <text>
 *
 * Exit codes: 0 = accepted (or list printed); 1 = unknown node/invalid input/refused.
 */
import path from "node:path";
import { isMainModule, parseArgs } from "../lib/cli.js";
import { appendAuditEntry } from "../reducer/audit.js";
import { compilePlan, type RunNodeId } from "../engine/compile.js";
import { acceptVerification, loadRunState, writeRunState } from "../engine/runstate.js";
import { captureReviewEvidence } from "../engine/review-evidence.js";
import { listPendingFreshContext, refuseFreshContextAcceptance } from "../engine/verification.js";
import type { RunStateDocument } from "../schema/types.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";
import { resolveCliWorkspace } from "./status.js";

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspace) {
    console.error("Usage: tsx kernel/session/verify.ts --workspace <id-or-path> [--list] --node <id> --session <id> --evidence <text>");
    return 1;
  }
  const resolvedWorkspace = resolveCliWorkspace(args.workspace!);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  const runStatePath = path.join(workspace, "run", "run-state.json");
  let run: RunStateDocument;
  try {
    run = loadRunState(runStatePath);
  } catch (error) {
    console.error(
      `ISSUE verify.no_run_state: ${runStatePath} does not exist or is not a valid run state — run a session first (${error instanceof Error ? error.message : String(error)})`,
    );
    return 1;
  }
  const compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) {
    console.error(`ISSUE verify.compatibility: ${renderCatalogRefusal(compatible.refusal)}`);
    return 1;
  }
  const plan = compilePlan(compatible.catalog);
  if (args.list === "true") {
    const pending = listPendingFreshContext(plan, run);
    if (pending.length === 0) console.log("No nodes waiting on verification.");
    for (const nodeId of pending) console.log(`PENDING ${nodeId}`);
    return 0;
  }

  const sessionId = args.session;
  const evidence = args.evidence?.trim();
  const rawNodeId = args.node;
  if (!rawNodeId || !sessionId) {
    console.error("ISSUE verify.invalid_input: --node and --session are required");
    return 1;
  }
  if (!evidence) {
    console.error("ISSUE verify.evidence_required: --evidence must state what was checked and why it holds; empty acceptance is the auto-accept hole again");
    return 1;
  }
  const nodeId = (rawNodeId.startsWith("workflow.") ? `run.${rawNodeId.slice("workflow.".length)}` : rawNodeId) as RunNodeId;
  // The acceptance rules (pending-only, required independent review, producer≠verifier across every
  // attempt) live in kernel/engine/verification.ts, shared with the session runner's own verifier
  // pass; this CLI keeps its original per-code wording for its operators.
  const refusal = refuseFreshContextAcceptance(plan, run, nodeId, sessionId);
  if (refusal) {
    const planned = plan.nodes.find((node) => node.id === nodeId);
    const message =
      refusal.code === "unknown_node"
        ? `"${rawNodeId}" is not a node on this run`
        : refusal.code === "wrong_kind"
          ? `${nodeId} verifies as ${planned?.verification.kind} — its gates are the acceptance path, not this CLI`
          : refusal.message;
    console.error(`ISSUE verify.${refusal.code}: ${message}`);
    return 1;
  }

  const now = new Date().toISOString();
  try {
    const receipt = captureReviewEvidence(
      plan,
      run,
      nodeId,
      workspace,
      sessionId,
      now,
      run.nodes[nodeId]?.attempts.at(-1)?.proofSource === "synthetic" ? "synthetic" : "workspace",
    );
    acceptVerification(plan, run, nodeId, [evidence], now, sessionId, receipt, workspace);
  } catch {
    console.error("ISSUE verify.current_evidence: current artifacts and criteria must match the produced output before independent acceptance");
    return 1;
  }
  writeRunState(runStatePath, run);
  appendAuditEntry(path.join(workspace, "control", "audit.jsonl"), {
    sessionId,
    targetDoc: "run-state",
    patchId: `verify:${sessionId}:${nodeId}`,
    action: "verification_accepted",
    summary: `${nodeId}: ${evidence}`,
    stateHash: "",
    issueCodes: [],
  });
  console.log(`VERIFIED ${nodeId}`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main();
}
