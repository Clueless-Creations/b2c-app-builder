#!/usr/bin/env node
/**
 * Founder-decision CLI. Every mutation holds the workspace session lock. Design authority also
 * requires a short-lived Ed25519 receipt whose public key and external trust store were bound
 * to the run before any worker started.
 *
 * Usage:
 *   tsx kernel/session/approve.ts --workspace <id-or-path> --approval <id> --decision approved|rejected \
 *     --session <id> [--reason <text>]
 *   tsx kernel/session/approve.ts --workspace <id-or-path> --design-taste pass|fail --session <id> \
 *     (--founder-receipt <canonical-json> | --founder-receipt-file <path>)
 *   tsx kernel/session/approve.ts --workspace <id-or-path> --design-taste-delegation approved|rejected \
 *     --session <id> (--founder-receipt <canonical-json> | --founder-receipt-file <path>)
 *   tsx kernel/session/approve.ts --workspace <id-or-path> --list
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { isMainModule, parseArgs, resolveCallerPath } from "../lib/cli.js";
import { appendAuditEntry } from "../reducer/audit.js";
import { acquireLock, releaseLock } from "../reducer/lock.js";
import { compilePlan, type RunNodeId } from "../engine/compile.js";
import { attemptsUsedInCurrentCycle, DESIGN_TASTE_DELEGATION_APPROVAL_ID, invalidateDescendants, loadRunState, writeRunState } from "../engine/runstate.js";
import { captureDesignAuthorityEvaluation } from "../engine/design-taste-authority.js";
import {
  appendFounderDecisionAuditEntry,
  computeDesignDocumentSha256,
  FounderDecisionReceiptError,
  founderReceiptApprovalProvenance,
  verifyIncomingFounderDecisionReceipt,
  type FounderDecisionAuditLink,
  type TrustedFounderDecisionKey,
} from "../engine/founder-decision-receipt.js";
import { assertFounderTrustBinding, founderControlOwnerUid, FounderTrustStoreError, loadFounderTrustStore } from "../engine/founder-trust-store.js";
import { recordDeterministicVerification, VERIFICATION_REQUIRED_BLOCKER } from "../engine/verification.js";
import type { FounderDecision, RunStateDocument } from "../schema/types.js";
import { loadWorkspaceCatalog, renderCatalogRefusal } from "./catalog-contract.js";
import { runDeterministicGates } from "./deterministic-gates.js";
import { resolveCliWorkspace } from "./status.js";

const DESIGN_AUDIT_NODE_ID = "run.design.design-system-audit" as RunNodeId;
const RECEIPT_MAX_BYTES = 64 * 1024;

function listPending(run: RunStateDocument): number {
  const pending = Object.entries(run.approvals).filter(([, status]) => status === "pending");
  if (pending.length === 0) {
    console.log("No approvals waiting.");
    return 0;
  }
  for (const [id] of pending) console.log(`PENDING ${id}`);
  return 0;
}

/** A changed authority edge requires a fresh audit attempt. It never blesses old worker output. */
function reopenDesignAudit(plan: ReturnType<typeof compilePlan>, run: RunStateDocument, now: string): void {
  const node = plan.nodes.find((candidate) => candidate.id === DESIGN_AUDIT_NODE_ID);
  const state = run.nodes[DESIGN_AUDIT_NODE_ID];
  if (!node || !state) return;
  state.acceptedOutputFingerprint = undefined;
  state.verifiedBySessionId = undefined;
  state.repairInstructions = undefined;
  for (const binding of run.artifactBindings) {
    if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
  }
  invalidateDescendants(plan, run, node.outputs, now, new Set(node.reviewOf ?? []));
  if (attemptsUsedInCurrentCycle(state) >= node.maxAttempts) {
    state.status = "blocked";
    state.blocker = `The design audit has exhausted its ${node.maxAttempts} attempts.`;
  } else {
    state.status = "pending";
    state.blocker = undefined;
  }
}

/**
 * A direct founder verdict may re-run the canonical gates against the exact current audit output.
 * The signed direct decision is captured on that attempt before the gate runs. Delegation changes
 * never call this function because delegation is dispatch authority and cannot apply retroactively.
 */
function revalidateCurrentDesignAudit(
  plan: ReturnType<typeof compilePlan>,
  run: RunStateDocument,
  workspace: string,
  auditPath: string,
  runStatePath: string,
  now: string,
  trustedKey: TrustedFounderDecisionKey,
): boolean {
  const node = plan.nodes.find((candidate) => candidate.id === DESIGN_AUDIT_NODE_ID);
  const state = run.nodes[DESIGN_AUDIT_NODE_ID];
  const attempt = state?.attempts.at(-1);
  const eligibleState =
    state?.status === "waiting_founder" || state?.status === "succeeded" || (state?.status === "blocked" && state.blocker === VERIFICATION_REQUIRED_BLOCKER);
  if (!node || !state || !attempt || !eligibleState || !["blocked", "succeeded"].includes(attempt.status)) return false;
  if (
    !node.outputs.every((artifactId) => {
      const binding = run.artifactBindings.find((candidate) => candidate.artifactId === artifactId);
      return binding?.producedBy === node.id && binding.attemptId === attempt.id && Boolean(binding.fingerprint);
    })
  ) {
    return false;
  }

  attempt.designAuthorityEvaluation = captureDesignAuthorityEvaluation(run, auditPath, "founder_revalidation", {
    workspaceRoot: workspace,
    now,
    evaluatedAt: now,
    trustedKey,
  });
  state.status = "blocked";
  state.blocker = VERIFICATION_REQUIRED_BLOCKER;
  state.acceptedOutputFingerprint = undefined;
  state.verifiedBySessionId = undefined;
  state.repairInstructions = undefined;
  attempt.status = "blocked";
  attempt.deterministicVerification = undefined;
  attempt.independentVerification = undefined;
  for (const binding of run.artifactBindings) {
    if (node.outputs.includes(binding.artifactId as never)) binding.accepted = false;
  }
  invalidateDescendants(plan, run, node.outputs, now, new Set(node.reviewOf ?? []));
  run.updatedAt = now;
  // The worthiness gate reads engine state. Persist the exact authority snapshot before it runs;
  // retrying the same receipt recovers safely if this process stops between either write.
  writeRunState(runStatePath, run);

  const outcome = runDeterministicGates(node.verification.gateIds, workspace, {
    gateArguments: node.verification.gateArguments,
    selectedOperation: node.selectedOperation,
  });
  recordDeterministicVerification(plan, run, node.id, outcome, new Date().toISOString());
  if (outcome.allPassed) return true;

  const founderDecisionNeeded = outcome.issueCodes.some((code) =>
    ["worthiness.taste_gate_authority_evidence", "worthiness.taste_gate_delegation_authority", "worthiness.taste_gate_incomplete"].includes(code),
  );
  const invalidAuditEvidence =
    outcome.unclassifiedFailure || (outcome.issueCodes.length > 0 && outcome.issueCodes.every((code) => code === "worthiness.taste_gate_review_evidence"));
  if (founderDecisionNeeded) {
    state.status = "waiting_founder";
    state.blocker = "Taste Gate needs a founder decision for the current design candidate.";
  } else if (invalidAuditEvidence) {
    attempt.status = "failed";
    state.repairInstructions = outcome.evidence.map((entry) => `Repair invalid audit evidence: ${entry}`);
    if (attemptsUsedInCurrentCycle(state) < node.maxAttempts) {
      state.status = "stale";
      state.blocker = undefined;
    } else {
      state.status = "blocked";
      state.blocker = `The design audit evidence remained invalid after ${node.maxAttempts} attempts.`;
    }
  }
  return true;
}

function loadRun(runStatePath: string): RunStateDocument | undefined {
  try {
    return loadRunState(runStatePath);
  } catch (error) {
    console.error(
      `ISSUE approve.no_run_state: ${runStatePath} does not exist or is not a valid run state — run a session first (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return undefined;
  }
}

function readFounderReceipt(args: Record<string, string>): string {
  const inline = args["founder-receipt"];
  const file = args["founder-receipt-file"];
  if (Boolean(inline) === Boolean(file)) {
    throw new FounderDecisionReceiptError(
      "receipt_json_invalid",
      "choose exactly one of --founder-receipt or --founder-receipt-file for a design authority decision",
    );
  }
  if (inline !== undefined) return inline;
  const receiptPath = resolveCallerPath(file!);
  const stat = lstatSync(receiptPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > RECEIPT_MAX_BYTES) {
    throw new FounderDecisionReceiptError("receipt_json_invalid", "--founder-receipt-file must name a non-empty regular file no larger than 64 KiB");
  }
  return readFileSync(receiptPath, "utf8");
}

function recordDesignDecision(
  args: Record<string, string>,
  workspace: string,
  runStatePath: string,
  run: RunStateDocument,
  plan: ReturnType<typeof compilePlan>,
): number {
  const directTaste = args["design-taste"];
  const delegatedTaste = args["design-taste-delegation"];
  const sessionId = args.session;
  if (
    !sessionId ||
    args.approval ||
    args.decision ||
    (directTaste !== undefined && delegatedTaste !== undefined) ||
    (directTaste !== undefined && directTaste !== "pass" && directTaste !== "fail") ||
    (delegatedTaste !== undefined && delegatedTaste !== "approved" && delegatedTaste !== "rejected")
  ) {
    console.error(
      "ISSUE approve.invalid_design_taste: choose exactly one of --design-taste pass|fail or --design-taste-delegation approved|rejected with --session; do not combine either with --approval or --decision",
    );
    return 1;
  }

  const auditPath = path.join(workspace, "control", "audit.jsonl");
  const founderTrustStore = loadFounderTrustStore({ role: "receipt_consumer", controlOwnerUid: founderControlOwnerUid(workspace) });
  assertFounderTrustBinding(run, { workspaceRoot: workspace, auditPath, store: founderTrustStore });
  const now = new Date().toISOString();
  let expectedDecision: FounderDecision;
  let designSha256: string | undefined;
  if (directTaste !== undefined) {
    const declaredVerdict = latestDeclaredDirectTasteVerdict(workspace);
    if (declaredVerdict !== directTaste) {
      console.error(
        `ISSUE approve.design_taste_mismatch: --design-taste ${directTaste} does not match the latest pass/fail Verdict in DESIGN.md${
          declaredVerdict ? ` (${declaredVerdict})` : " (none found)"
        }`,
      );
      return 1;
    }
    designSha256 = computeDesignDocumentSha256(workspace);
    expectedDecision = { kind: "design_taste_direct", verdict: directTaste, designSha256 };
  } else {
    expectedDecision = { kind: "design_taste_delegation", status: delegatedTaste as "approved" | "rejected" };
  }

  const incoming = verifyIncomingFounderDecisionReceipt(readFounderReceipt(args), {
    run,
    workspaceRoot: workspace,
    auditPath,
    expectedDecision,
    now,
    trustedKey: founderTrustStore.trustedKey,
  });
  const link: FounderDecisionAuditLink = incoming.disposition === "append" ? appendFounderDecisionAuditEntry(auditPath, incoming, sessionId, now) : incoming;

  if (directTaste !== undefined) {
    if (!revalidateCurrentDesignAudit(plan, run, workspace, auditPath, runStatePath, now, founderTrustStore.trustedKey)) {
      reopenDesignAudit(plan, run, now);
    }
    run.updatedAt = now;
    writeRunState(runStatePath, run);
    console.log(`RECORDED design-taste ${directTaste} ${designSha256!.slice(0, 12)}`);
    return 0;
  }

  run.approvals[DESIGN_TASTE_DELEGATION_APPROVAL_ID] = delegatedTaste as "approved" | "rejected";
  (run.approvalProvenance ??= {})[DESIGN_TASTE_DELEGATION_APPROVAL_ID] = founderReceiptApprovalProvenance(link);
  // Delegation is captured only at worker dispatch. Even an identical-looking current audit
  // must be regenerated so an approval cannot retroactively authorize output made without it.
  reopenDesignAudit(plan, run, now);
  run.updatedAt = now;
  writeRunState(runStatePath, run);
  console.log(`RECORDED design-taste-delegation ${delegatedTaste}`);
  return 0;
}

function mutate(args: Record<string, string>, workspace: string): number {
  const runStatePath = path.join(workspace, "run", "run-state.json");
  const run = loadRun(runStatePath);
  if (!run) return 1;

  const compatible = loadWorkspaceCatalog(workspace);
  if (!compatible.ok) {
    console.error(`ISSUE approve.compatibility: ${renderCatalogRefusal(compatible.refusal)}`);
    return 1;
  }
  const plan = compilePlan(compatible.catalog);

  if (args["design-taste"] !== undefined || args["design-taste-delegation"] !== undefined) {
    try {
      return recordDesignDecision(args, workspace, runStatePath, run, plan);
    } catch (error) {
      const code = error instanceof FounderDecisionReceiptError || error instanceof FounderTrustStoreError ? error.code : "receipt_json_invalid";
      console.error(`ISSUE approve.${code}: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  if (args["founder-receipt"] !== undefined || args["founder-receipt-file"] !== undefined) {
    console.error("ISSUE approve.unexpected_founder_receipt: founder receipt flags apply only to design taste decisions");
    return 1;
  }
  const approvalId = args.approval;
  const decision = args.decision;
  const sessionId = args.session;
  if (!approvalId || !sessionId || (decision !== "approved" && decision !== "rejected")) {
    console.error("ISSUE approve.invalid_input: --approval, --session, and --decision approved|rejected are required");
    return 1;
  }
  if (approvalId === DESIGN_TASTE_DELEGATION_APPROVAL_ID) {
    console.error(
      `ISSUE approve.reserved_design_taste_delegation: ${DESIGN_TASTE_DELEGATION_APPROVAL_ID} can be changed only with --design-taste-delegation approved|rejected`,
    );
    return 1;
  }
  if (run.approvals[approvalId] === undefined) {
    console.error(`ISSUE approve.unknown_approval: "${approvalId}" is not a pending approval on this run`);
    return 1;
  }

  const now = new Date().toISOString();
  run.approvals[approvalId] = decision;
  if (run.approvalProvenance) delete run.approvalProvenance[approvalId];
  const affected = new Set<RunNodeId>(plan.nodes.filter((node) => node.approvals.some((approval) => approval.id === approvalId)).map((node) => node.id));
  for (const node of Object.values(run.nodes)) {
    if (!affected.has(node.nodeId as RunNodeId) || node.status !== "waiting_founder") continue;
    if (decision === "approved") {
      node.status = "pending";
      node.blocker = undefined;
    } else {
      node.status = "blocked";
      node.blocker = args.reason ? `Founder declined: ${args.reason}` : "Founder declined this approval.";
    }
  }
  run.updatedAt = now;
  writeRunState(runStatePath, run);
  appendAuditEntry(path.join(workspace, "control", "audit.jsonl"), {
    sessionId,
    targetDoc: "run-state",
    patchId: `approve:${sessionId}:${approvalId}`,
    action: decision === "approved" ? "founder_approval_granted" : "founder_approval_rejected",
    summary: args.reason ? `${approvalId}: ${args.reason}` : approvalId,
    stateHash: "",
    issueCodes: [],
  });
  console.log(`RECORDED ${approvalId} ${decision}`);
  return 0;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspace) {
    console.error(
      "Usage: tsx kernel/session/approve.ts --workspace <id-or-path> [--list] (--approval <id> --decision approved|rejected | --design-taste pass|fail | --design-taste-delegation approved|rejected) --session <id> [--reason <text>] [--founder-receipt <json> | --founder-receipt-file <path>]",
    );
    return 1;
  }
  const resolvedWorkspace = resolveCliWorkspace(args.workspace!);
  if (!resolvedWorkspace.ok) {
    console.error(resolvedWorkspace.message);
    return 1;
  }
  const workspace = resolvedWorkspace.path;
  const runStatePath = path.join(workspace, "run", "run-state.json");
  if (args.list === "true") {
    const run = loadRun(runStatePath);
    return run ? listPending(run) : 1;
  }

  // Acquire before reading mutable run state. Approval never breaks a stale lock: the operator
  // must first establish that the old session is dead through the normal lock recovery path.
  const lockPath = path.join(workspace, "control", "session.lock");
  const lockOwner = `${args.session?.trim() || "approval"}.founder-decision.${process.pid}`;
  const acquired = acquireLock(lockPath, {
    ownerSessionId: lockOwner,
    ttlSeconds: 300,
    retries: 0,
    breakStale: false,
  });
  if (!acquired.ok) {
    const code = acquired.reason === "held" ? "lock_held" : "lock_stale_unverified";
    console.error(`ISSUE approve.${code}: workspace session lock is unavailable (held by ${acquired.holder.ownerSessionId})`);
    return 1;
  }
  try {
    return mutate(args, workspace);
  } finally {
    releaseLock(lockPath, lockOwner);
  }
}

/** Read the final declared verdict from the direct founder/owner Taste Gate table. */
function latestDeclaredDirectTasteVerdict(workspace: string): "pass" | "fail" | undefined {
  const contractPath = path.join(workspace, "DESIGN.md");
  if (!existsSync(contractPath)) return undefined;
  const contract = readFileSync(contractPath, "utf8");
  const heading = /^##\s+Taste Gate\s*$/im.exec(contract);
  if (!heading) return undefined;
  const remainder = contract.slice(heading.index + heading[0].length);
  const nextHeading = remainder.search(/^##\s+/m);
  const section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  const lines = section.split(/\r?\n/);
  let verdictColumn = -1;
  let latest: "pass" | "fail" | undefined;
  for (const line of lines) {
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    const normalized = cells.map((cell) => cell.toLowerCase().replace(/\s+/g, " "));
    const candidateColumn = normalized.indexOf("verdict");
    if (candidateColumn >= 0 && (normalized.includes("reviewer") || normalized.includes("owner"))) {
      verdictColumn = candidateColumn;
      continue;
    }
    if (verdictColumn < 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const verdict = cells[verdictColumn]?.toLowerCase();
    if (verdict === "pass" || verdict === "fail") latest = verdict;
  }
  return latest;
}

if (isMainModule(import.meta.url)) process.exitCode = main();
