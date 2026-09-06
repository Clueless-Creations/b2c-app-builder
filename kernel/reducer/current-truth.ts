import { assertReadableWorkspaceFile } from "./erasure-guard.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { validateCurrentTruth, type SchemaIssue } from "../schema/index.js";
import type { CurrentTruthClaim, CurrentTruthDocument, CurrentTruthEvidence, EvidenceAuthority } from "../schema/types.js";

export const CURRENT_TRUTH_SCHEMA_VERSION = "1.0.0";

const RISKY_ACTION_CLASSES = ["mutate", "publish", "spend", "release", "destructive"] as const;

export type RiskyActionClass = (typeof RISKY_ACTION_CLASSES)[number];

export interface ReconcileReceipt {
  readonly receiptId: string;
  readonly observedAt: string;
  readonly affectedGraphNodeIds: readonly string[];
  readonly evidence: readonly CurrentTruthEvidence[];
}

export type ReconcileResult =
  | { readonly kind: "committed"; readonly document: CurrentTruthDocument; readonly noop: boolean }
  | { readonly kind: "rejected"; readonly issues: readonly SchemaIssue[] };

export function emptyCurrentTruth(now: string): CurrentTruthDocument {
  return {
    schemaVersion: CURRENT_TRUTH_SCHEMA_VERSION,
    updatedAt: now,
    revision: 0,
    lastReceiptId: null,
    lastReconcileInputHash: null,
    evidence: [],
    claims: [],
  };
}

export function authorityRank(authority: EvidenceAuthority): number {
  switch (authority) {
    case "provider_readback":
      return 4;
    case "store_receipt":
      return 3;
    case "operator_attestation":
      return 2;
    case "derived_projection":
      return 1;
    default: {
      const exhaustive: never = authority;
      throw new Error(`Unhandled evidence authority ${String(exhaustive)}`);
    }
  }
}

function parseInstant(value: string): number | undefined {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function issue(code: string, message: string, path = "/"): SchemaIssue {
  return { severity: "error", code, message, path };
}

export function isRiskyActionClass(value: string): value is RiskyActionClass {
  return (RISKY_ACTION_CLASSES as readonly string[]).includes(value);
}

export function selectLatestSucceededRiskyAction(actions: readonly Record<string, unknown>[]): Record<string, unknown> | undefined {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (!action) continue;
    const result = action.result && typeof action.result === "object" && !Array.isArray(action.result) ? (action.result as Record<string, unknown>) : {};
    const actionClass = typeof action.class === "string" ? action.class : "";
    if (result.status === "succeeded" && isRiskyActionClass(actionClass)) {
      return action;
    }
  }
  return undefined;
}

interface CanonicalEvidenceRecord {
  readonly id: string;
  readonly graphNodeId: string;
  readonly claimId: string;
  readonly authority: EvidenceAuthority;
  readonly observedAt: string;
  readonly expiresAt: string | null;
  readonly reachable: boolean;
  readonly payloadHash: string;
  readonly accepted: boolean;
  readonly summary: string;
  readonly receiptId: string | null;
}

function canonicalEvidenceRecord(item: CurrentTruthEvidence, fallbackReceiptId?: string): CanonicalEvidenceRecord {
  return {
    id: item.id,
    graphNodeId: item.graphNodeId,
    claimId: item.claimId,
    authority: item.authority,
    observedAt: item.observedAt,
    expiresAt: item.expiresAt ?? null,
    reachable: item.reachable,
    payloadHash: item.payloadHash,
    accepted: item.accepted,
    summary: item.summary,
    receiptId: item.receiptId ?? fallbackReceiptId ?? null,
  };
}

function evidenceRecordsMatch(left: CurrentTruthEvidence, right: CurrentTruthEvidence, fallbackReceiptId?: string): boolean {
  return JSON.stringify(canonicalEvidenceRecord(left, fallbackReceiptId)) === JSON.stringify(canonicalEvidenceRecord(right, fallbackReceiptId));
}

function inputHash(receipt: ReconcileReceipt): string {
  const payload = {
    receiptId: receipt.receiptId,
    observedAt: receipt.observedAt,
    affectedGraphNodeIds: [...receipt.affectedGraphNodeIds].sort(),
    evidence: [...receipt.evidence].map((item) => canonicalEvidenceRecord(item, receipt.receiptId)).sort((left, right) => left.id.localeCompare(right.id)),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function validateCurrentTruthSemantics(document: CurrentTruthDocument): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const seenIds = new Set<string>();
  for (const item of document.evidence) {
    if (seenIds.has(item.id)) {
      issues.push(issue("current_truth.conflict", `Evidence ${item.id} is recorded more than once.`, `/evidence/${item.id}`));
    }
    seenIds.add(item.id);
  }
  const evidenceIds = new Set(document.evidence.map((item) => item.id));
  for (const claim of document.claims) {
    if (claim.currentEvidenceId !== null && !evidenceIds.has(claim.currentEvidenceId)) {
      issues.push(
        issue("current_truth.dangling_evidence", `Claim ${claim.claimId} names missing evidence ${claim.currentEvidenceId}.`, `/claims/${claim.claimId}`),
      );
    }
    for (const supersededId of claim.supersededEvidenceIds) {
      if (!evidenceIds.has(supersededId)) {
        issues.push(
          issue("current_truth.dangling_evidence", `Claim ${claim.claimId} names missing superseded evidence ${supersededId}.`, `/claims/${claim.claimId}`),
        );
      }
    }
  }
  return issues;
}

function compareEvidence(left: CurrentTruthEvidence, right: CurrentTruthEvidence): number | "conflict" | "unorderable" {
  const leftObserved = parseInstant(left.observedAt);
  const rightObserved = parseInstant(right.observedAt);
  if (leftObserved === undefined || rightObserved === undefined) return "unorderable";
  const rankDelta = authorityRank(left.authority) - authorityRank(right.authority);
  if (rankDelta !== 0) return rankDelta;
  if (leftObserved !== rightObserved) return leftObserved - rightObserved;
  if (left.payloadHash === right.payloadHash) return 0;
  return "conflict";
}

function winnerForClaim(items: readonly CurrentTruthEvidence[]): { winner?: CurrentTruthEvidence; error?: SchemaIssue } {
  let winner: CurrentTruthEvidence | undefined;
  for (const item of items) {
    if (!winner) {
      winner = item;
      continue;
    }
    const compared = compareEvidence(item, winner);
    if (compared === "unorderable") {
      return {
        error: issue("current_truth.unorderable_evidence", `Evidence ${item.id} and ${winner.id} cannot be ordered by time.`, `/evidence/${item.id}`),
      };
    }
    if (compared === "conflict") {
      return {
        error: issue("current_truth.conflict", `Evidence ${item.id} and ${winner.id} share authority and time but differ in payload.`, `/evidence/${item.id}`),
      };
    }
    if (compared > 0) winner = item;
  }
  return { winner };
}

function claimFromWinner(
  claimId: string,
  graphNodeId: string,
  items: readonly CurrentTruthEvidence[],
  winner: CurrentTruthEvidence | undefined,
  nowMs: number,
): CurrentTruthClaim {
  const supersededEvidenceIds = items.filter((item) => item.id !== winner?.id).map((item) => item.id);
  if (!winner || !winner.accepted) {
    return {
      claimId,
      graphNodeId,
      status: "unresolved",
      currentEvidenceId: winner?.id ?? null,
      supersededEvidenceIds,
      blockerKind: "missing_proof",
      summary: winner?.summary ?? "No accepted read-back is on file for this claim.",
    };
  }
  const expiresAt = winner.expiresAt ? parseInstant(winner.expiresAt) : undefined;
  if (!winner.reachable) {
    return {
      claimId,
      graphNodeId,
      status: "expired",
      currentEvidenceId: winner.id,
      supersededEvidenceIds,
      blockerKind: "unreachable_proof",
      summary: winner.summary,
    };
  }
  if (expiresAt !== undefined && expiresAt <= nowMs) {
    return {
      claimId,
      graphNodeId,
      status: "expired",
      currentEvidenceId: winner.id,
      supersededEvidenceIds,
      blockerKind: "expired_proof",
      summary: winner.summary,
    };
  }
  return {
    claimId,
    graphNodeId,
    status: "active",
    currentEvidenceId: winner.id,
    supersededEvidenceIds,
    blockerKind: "none",
    summary: winner.summary,
  };
}

function refreshClaim(claim: CurrentTruthClaim, evidenceById: Map<string, CurrentTruthEvidence>, nowMs: number): CurrentTruthClaim {
  if (claim.status === "superseded") return claim;
  const current = claim.currentEvidenceId ? evidenceById.get(claim.currentEvidenceId) : undefined;
  if (!current) return { ...claim, status: "unresolved", blockerKind: "missing_proof" };
  const expiresAt = current.expiresAt ? parseInstant(current.expiresAt) : undefined;
  if (!current.reachable) return { ...claim, status: "expired", blockerKind: "unreachable_proof" };
  if (expiresAt !== undefined && expiresAt <= nowMs) return { ...claim, status: "expired", blockerKind: "expired_proof" };
  if (claim.status === "expired" && current.accepted && current.reachable) {
    return { ...claim, status: "active", blockerKind: "none" };
  }
  return claim;
}

export function refreshCurrentTruthForRead(document: CurrentTruthDocument, now: string): CurrentTruthDocument {
  const nowMs = parseInstant(now);
  if (nowMs === undefined) return document;
  const evidenceById = new Map(document.evidence.map((item) => [item.id, item]));
  return {
    ...document,
    claims: document.claims.map((claim) => refreshClaim(claim, evidenceById, nowMs)),
  };
}

export function reconcileCurrentTruth(previous: CurrentTruthDocument | undefined, receipt: ReconcileReceipt, now: string): ReconcileResult {
  const prior = previous ?? emptyCurrentTruth(now);
  const nowMs = parseInstant(now);
  if (nowMs === undefined || parseInstant(receipt.observedAt) === undefined) {
    return {
      kind: "rejected",
      issues: [issue("current_truth.unorderable_evidence", "Reconcile timestamps must be valid RFC 3339 instants.", "/observedAt")],
    };
  }
  const affected = new Set(receipt.affectedGraphNodeIds);
  if (affected.size === 0) {
    return {
      kind: "rejected",
      issues: [issue("current_truth.affected_graph_empty", "A reconcile receipt must name at least one affected graph node.", "/affectedGraphNodeIds")],
    };
  }

  const hash = inputHash(receipt);
  const evidenceById = new Map(prior.evidence.map((item) => [item.id, item]));

  if (prior.lastReceiptId === receipt.receiptId && prior.lastReconcileInputHash === hash) {
    const claims = prior.claims.map((claim) => refreshClaim(claim, evidenceById, nowMs));
    const unchanged = JSON.stringify(claims) === JSON.stringify(prior.claims);
    if (unchanged) {
      return { kind: "committed", document: prior, noop: true };
    }
    const document: CurrentTruthDocument = {
      ...prior,
      updatedAt: now,
      revision: prior.revision + 1,
      claims,
    };
    const validated = validateCurrentTruth(document);
    if (!validated.valid || !validated.value) return { kind: "rejected", issues: validated.issues };
    const semantic = validateCurrentTruthSemantics(validated.value);
    if (semantic.length > 0) return { kind: "rejected", issues: semantic };
    return { kind: "committed", document: validated.value, noop: false };
  }

  const issues: SchemaIssue[] = [];
  for (const item of receipt.evidence) {
    if (!affected.has(item.graphNodeId)) {
      issues.push(
        issue(
          "current_truth.unrelated_graph_node",
          `Evidence ${item.id} targets ${item.graphNodeId}, which is outside this receipt's affected graph.`,
          `/evidence/${item.id}`,
        ),
      );
      continue;
    }
    if (parseInstant(item.observedAt) === undefined || (item.expiresAt !== undefined && parseInstant(item.expiresAt) === undefined)) {
      issues.push(issue("current_truth.unorderable_evidence", `Evidence ${item.id} has an unorderable timestamp.`, `/evidence/${item.id}`));
      continue;
    }
    const incoming: CurrentTruthEvidence = { ...item, receiptId: item.receiptId ?? receipt.receiptId };
    const existing = evidenceById.get(item.id);
    if (existing && !evidenceRecordsMatch(existing, incoming, receipt.receiptId)) {
      issues.push(
        issue("current_truth.conflict", `Evidence ${item.id} is already recorded and the complete immutable record does not match.`, `/evidence/${item.id}`),
      );
      continue;
    }
    if (!existing) {
      evidenceById.set(item.id, incoming);
    }
  }
  if (issues.length > 0) return { kind: "rejected", issues };

  const evidence = [...evidenceById.values()].sort((left, right) => left.id.localeCompare(right.id));
  const incomingClaimIds = new Set(receipt.evidence.map((item) => item.claimId));
  const acceptedIncomingByNode = new Set(receipt.evidence.filter((item) => item.accepted).map((item) => item.graphNodeId));
  const claimsById = new Map(prior.claims.map((claim) => [claim.claimId, claim]));

  for (const claimId of incomingClaimIds) {
    const items = evidence.filter((item) => item.claimId === claimId);
    const graphNodeIds = new Set(items.map((item) => item.graphNodeId));
    if (graphNodeIds.size !== 1) {
      return {
        kind: "rejected",
        issues: [issue("current_truth.conflict", `Claim ${claimId} is bound to more than one graph node.`, `/claims/${claimId}`)],
      };
    }
    const graphNodeId = items[0]!.graphNodeId;
    const accepted = items.filter((item) => item.accepted);
    const { winner, error } = winnerForClaim(accepted);
    if (error) return { kind: "rejected", issues: [error] };
    claimsById.set(claimId, claimFromWinner(claimId, graphNodeId, items, winner, nowMs));
  }

  for (const [claimId, claim] of [...claimsById.entries()]) {
    if (incomingClaimIds.has(claimId)) continue;
    if (affected.has(claim.graphNodeId) && acceptedIncomingByNode.has(claim.graphNodeId) && claim.status === "active") {
      claimsById.set(claimId, {
        ...claim,
        status: "superseded",
        blockerKind: "none",
        summary: "A later accepted read-back replaced this claim on the same graph node.",
      });
      continue;
    }
    if (affected.has(claim.graphNodeId)) {
      const items = evidence.filter((item) => item.claimId === claimId);
      const accepted = items.filter((item) => item.accepted);
      const { winner, error } = winnerForClaim(accepted);
      if (error) return { kind: "rejected", issues: [error] };
      claimsById.set(claimId, claimFromWinner(claimId, claim.graphNodeId, items, winner, nowMs));
      continue;
    }
    claimsById.set(claimId, refreshClaim(claim, evidenceById, nowMs));
  }

  const next: CurrentTruthDocument = {
    schemaVersion: CURRENT_TRUTH_SCHEMA_VERSION,
    updatedAt: now,
    revision: prior.revision + 1,
    lastReceiptId: receipt.receiptId,
    lastReconcileInputHash: hash,
    evidence,
    claims: [...claimsById.values()].sort((left, right) => left.claimId.localeCompare(right.claimId)),
  };
  const validated = validateCurrentTruth(next);
  if (!validated.valid || !validated.value) return { kind: "rejected", issues: validated.issues };
  const semantic = validateCurrentTruthSemantics(validated.value);
  if (semantic.length > 0) return { kind: "rejected", issues: semantic };
  return { kind: "committed", document: validated.value, noop: false };
}

export function receiptFromAgentAction(action: Record<string, unknown>): ReconcileReceipt | undefined {
  const receiptId = typeof action.id === "string" ? action.id : undefined;
  const observedAt = typeof action.occurredAt === "string" ? action.occurredAt : undefined;
  const graphNodeId = typeof action.operation === "string" ? action.operation : undefined;
  if (!receiptId || !observedAt || !graphNodeId) return undefined;
  const result = action.result && typeof action.result === "object" && !Array.isArray(action.result) ? (action.result as Record<string, unknown>) : {};
  const payloadHash = typeof action.payloadDigest === "string" && action.payloadDigest.length > 0 ? action.payloadDigest : `sha256:${receiptId}`;
  const afterState = typeof result.afterState === "string" && result.afterState.trim().length > 0 ? result.afterState : "Provider read-back is not on file.";
  return {
    receiptId,
    observedAt,
    affectedGraphNodeIds: [graphNodeId],
    evidence: [
      {
        id: `${receiptId}:readback`,
        graphNodeId,
        claimId: graphNodeId,
        authority: "provider_readback",
        observedAt,
        reachable: true,
        payloadHash,
        accepted: result.status === "succeeded",
        summary: afterState,
        receiptId,
      },
    ],
  };
}

export function loadCurrentTruthFile(filePath: string): { document?: CurrentTruthDocument; issues: SchemaIssue[] } {
  assertReadableWorkspaceFile(filePath);
  if (!existsSync(filePath)) return { issues: [] };
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    const result = validateCurrentTruth(parsed);
    if (!result.valid || !result.value) return { issues: result.issues };
    const semantic = validateCurrentTruthSemantics(result.value);
    if (semantic.length > 0) return { issues: semantic };
    return { document: result.value, issues: [] };
  } catch (error) {
    return {
      issues: [issue("current_truth.invalid_json", `Current truth is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, filePath)],
    };
  }
}
