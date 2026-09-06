import { createHash } from "node:crypto";
import path from "node:path";
import type {
  DesignAuthorityEvaluation,
  DesignTasteDelegationSnapshot,
  DirectDesignTasteSnapshot,
  RunStateDocument,
} from "../schema/types.js";
import {
  DESIGN_TASTE_DELEGATION_APPROVAL_ID,
  computeDesignDocumentSha256,
  findLatestValidFounderDecisionReceipt,
  type TrustedFounderDecisionKey,
} from "./founder-decision-receipt.js";

export type DesignTasteDelegationStatus = DesignTasteDelegationSnapshot["status"];
export type DesignTasteDelegationAuthority = DesignTasteDelegationSnapshot;

export interface DesignTasteAuthorityResolutionOptions {
  readonly workspaceRoot?: string;
  readonly now?: string;
  readonly trustedKey?: TrustedFounderDecisionKey;
}

export type DirectDesignTasteAuthority =
  | ({ readonly status: "current" } & DirectDesignTasteSnapshot)
  | { readonly status: "absent" | "stale"; readonly runId: string };

function workspaceRootFor(auditPath: string, explicit?: string): string {
  if (explicit) return explicit;
  const auditDirectory = path.dirname(auditPath);
  return path.basename(auditDirectory) === "control" ? path.dirname(auditDirectory) : auditDirectory;
}

function baseDelegation(run: RunStateDocument): Pick<DesignTasteDelegationSnapshot, "approvalId" | "runId"> {
  return { approvalId: DESIGN_TASTE_DELEGATION_APPROVAL_ID, runId: run.runId };
}

function exactFounderProvenanceMatches(
  run: RunStateDocument,
  receiptId: string,
  keyId: string,
  auditEntryHash: string,
  issuedAt: string,
  validatedAt: string,
): boolean {
  const provenance = run.approvalProvenance?.[DESIGN_TASTE_DELEGATION_APPROVAL_ID];
  return Boolean(
    provenance?.source === "founder_receipt" &&
      provenance.receiptId === receiptId &&
      provenance.keyId === keyId &&
      provenance.auditEntryHash === auditEntryHash &&
      provenance.issuedAt === issuedAt &&
      provenance.validatedAt === validatedAt,
  );
}

/** Resolve the exact signed delegation edge for this run. Every trust mismatch fails closed. */
export function resolveDesignTasteDelegationAuthority(
  run: RunStateDocument,
  auditPath: string,
  options: DesignTasteAuthorityResolutionOptions = {},
): DesignTasteDelegationAuthority {
  const base = baseDelegation(run);
  try {
    const latest = findLatestValidFounderDecisionReceipt({
      run,
      auditPath,
      workspaceRoot: workspaceRootFor(auditPath, options.workspaceRoot),
      kind: "design_taste_delegation",
      trustedKey: options.trustedKey,
      now: options.now,
    });
    const runStatus = run.approvals[DESIGN_TASTE_DELEGATION_APPROVAL_ID];
    if (!latest) {
      const noDecision = runStatus === undefined || runStatus === "pending";
      const noProvenance = run.approvalProvenance?.[DESIGN_TASTE_DELEGATION_APPROVAL_ID] === undefined;
      return { ...base, status: noDecision && noProvenance ? "absent" : "stale" };
    }
    const decision = latest.receipt.payload.decision;
    if (decision.kind !== "design_taste_delegation") return { ...base, status: "stale" };
    if (
      runStatus !== decision.status ||
      !exactFounderProvenanceMatches(
        run,
        latest.receipt.payload.receiptId,
        latest.receipt.keyId,
        latest.auditEntry.entryHash,
        latest.receipt.payload.issuedAt,
        latest.auditEntry.timestamp,
      )
    ) {
      return { ...base, status: "stale" };
    }
    return {
      ...base,
      status: decision.status,
      receiptId: latest.receipt.payload.receiptId,
      keyId: latest.receipt.keyId,
      auditEntryHash: latest.auditEntry.entryHash,
    };
  } catch {
    return { ...base, status: "stale" };
  }
}

/** Resolve a signed direct verdict only when it targets the exact current DESIGN.md bytes. */
export function resolveCurrentDirectDesignTasteAuthority(
  run: RunStateDocument,
  auditPath: string,
  options: DesignTasteAuthorityResolutionOptions = {},
): DirectDesignTasteAuthority {
  try {
    const workspaceRoot = workspaceRootFor(auditPath, options.workspaceRoot);
    const latest = findLatestValidFounderDecisionReceipt({
      run,
      auditPath,
      workspaceRoot,
      kind: "design_taste_direct",
      trustedKey: options.trustedKey,
      now: options.now,
    });
    if (!latest) return { status: "absent", runId: run.runId };
    const decision = latest.receipt.payload.decision;
    if (decision.kind !== "design_taste_direct" || decision.designSha256 !== computeDesignDocumentSha256(workspaceRoot)) {
      return { status: "stale", runId: run.runId };
    }
    return {
      status: "current",
      verdict: decision.verdict,
      runId: run.runId,
      designSha256: decision.designSha256,
      receiptId: latest.receipt.payload.receiptId,
      keyId: latest.receipt.keyId,
      auditEntryHash: latest.auditEntry.entryHash,
    };
  } catch {
    return { status: "stale", runId: run.runId };
  }
}

function delegationFingerprintValue(snapshot: DesignTasteDelegationSnapshot): Record<string, string> {
  if (snapshot.status === "approved" || snapshot.status === "rejected") {
    return {
      approvalId: snapshot.approvalId,
      status: snapshot.status,
      runId: snapshot.runId,
      receiptId: snapshot.receiptId,
      keyId: snapshot.keyId,
      auditEntryHash: snapshot.auditEntryHash,
    };
  }
  return { approvalId: snapshot.approvalId, status: snapshot.status, runId: snapshot.runId };
}

function directFingerprintValue(snapshot: DirectDesignTasteSnapshot | undefined): Record<string, string> | null {
  if (!snapshot) return null;
  return {
    verdict: snapshot.verdict,
    runId: snapshot.runId,
    designSha256: snapshot.designSha256,
    receiptId: snapshot.receiptId,
    keyId: snapshot.keyId,
    auditEntryHash: snapshot.auditEntryHash,
  };
}

/** Stable digest copied into deterministic gate proof for exact authority-context binding. */
export function designAuthorityContextFingerprint(
  delegation: DesignTasteDelegationSnapshot,
  direct?: DirectDesignTasteSnapshot,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ delegation: delegationFingerprintValue(delegation), direct: directFingerprintValue(direct) }))
    .digest("hex");
}

function canonicalEvaluationTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("design authority evaluation time must be canonical UTC ISO");
  return value;
}

/** Capture signed design authority for persistence on an exact attempt. */
export function captureDesignAuthorityEvaluation(
  run: RunStateDocument,
  auditPath: string,
  source: DesignAuthorityEvaluation["source"],
  options: DesignTasteAuthorityResolutionOptions & { readonly evaluatedAt?: string } = {},
): DesignAuthorityEvaluation {
  const evaluatedAt = canonicalEvaluationTime(options.evaluatedAt ?? options.now ?? new Date().toISOString());
  const delegation = resolveDesignTasteDelegationAuthority(run, auditPath, options);
  const directAuthority = resolveCurrentDirectDesignTasteAuthority(run, auditPath, options);
  const direct: DirectDesignTasteSnapshot | undefined =
    directAuthority.status === "current"
      ? {
          verdict: directAuthority.verdict,
          runId: directAuthority.runId,
          designSha256: directAuthority.designSha256,
          receiptId: directAuthority.receiptId,
          keyId: directAuthority.keyId,
          auditEntryHash: directAuthority.auditEntryHash,
        }
      : undefined;
  return {
    source,
    evaluatedAt,
    delegation,
    ...(direct ? { direct } : {}),
    authorityContextFingerprint: designAuthorityContextFingerprint(delegation, direct),
  };
}

function sameDelegation(left: DesignTasteDelegationSnapshot, right: DesignTasteDelegationSnapshot): boolean {
  return JSON.stringify(delegationFingerprintValue(left)) === JSON.stringify(delegationFingerprintValue(right));
}

function sameDirect(left: DirectDesignTasteSnapshot | undefined, right: DirectDesignTasteSnapshot | undefined): boolean {
  return JSON.stringify(directFingerprintValue(left)) === JSON.stringify(directFingerprintValue(right));
}

/** Re-resolve current trust and compare every delegation snapshot field. */
export function validateExactDesignTasteDelegationSnapshot(
  run: RunStateDocument,
  auditPath: string,
  snapshot: DesignTasteDelegationSnapshot,
  options: DesignTasteAuthorityResolutionOptions = {},
): string[] {
  const current = resolveDesignTasteDelegationAuthority(run, auditPath, options);
  return sameDelegation(current, snapshot) ? [] : ["design_authority.delegation_changed"];
}

/** Re-resolve the full authority context before a gate result can be accepted or reused. */
export function validateExactDesignAuthorityEvaluation(
  run: RunStateDocument,
  auditPath: string,
  evaluation: DesignAuthorityEvaluation,
  options: DesignTasteAuthorityResolutionOptions = {},
): string[] {
  const issues: string[] = [];
  try {
    canonicalEvaluationTime(evaluation.evaluatedAt);
  } catch {
    issues.push("design_authority.evaluation_time_invalid");
  }
  const currentDelegation = resolveDesignTasteDelegationAuthority(run, auditPath, options);
  const directAuthority = resolveCurrentDirectDesignTasteAuthority(run, auditPath, options);
  const currentDirect: DirectDesignTasteSnapshot | undefined =
    directAuthority.status === "current"
      ? {
          verdict: directAuthority.verdict,
          runId: directAuthority.runId,
          designSha256: directAuthority.designSha256,
          receiptId: directAuthority.receiptId,
          keyId: directAuthority.keyId,
          auditEntryHash: directAuthority.auditEntryHash,
        }
      : undefined;
  if (!sameDelegation(currentDelegation, evaluation.delegation)) issues.push("design_authority.delegation_changed");
  if (!sameDirect(currentDirect, evaluation.direct)) issues.push("design_authority.direct_decision_changed");
  const expectedFingerprint = designAuthorityContextFingerprint(evaluation.delegation, evaluation.direct);
  if (evaluation.authorityContextFingerprint !== expectedFingerprint) issues.push("design_authority.context_fingerprint_invalid");
  return [...new Set(issues)];
}
