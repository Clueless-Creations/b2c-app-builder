import { existsSync, readFileSync } from "node:fs";
import type { CompiledPlan, CompiledRunNode } from "../engine/compile.js";
import type { RunStateDocument } from "../schema/types.js";

interface StandingEnvelope {
  id: string;
  provider: string;
  account: string;
  team: string;
  project: string;
  environment: string;
  actionClasses: string[];
  operations: string[];
  resourcePatterns: string[];
  payloadDigests: string[];
  exclusions: string[];
  mode: "one_shot" | "standing";
  expiresAt: string;
  status: string;
  spendCeiling: number | null;
  voicePolicy: string;
}

interface Capability {
  id: string;
  provider: string;
  status: string;
  account: string;
  team: string;
  project: string;
  environment: string;
  modes: string[];
}

interface PlannedAction {
  id: string;
  class: string;
  /** Self-attested classification from agent-operations.schema.json's action.purpose enum. "social_engagement" tags a founder-public-voice action (a social/public post) — see actionCoversNode's publish gate below. Missing or unrecognized values parse as "". */
  purpose: string;
  operation: string;
  resource: string;
  capabilityId: string;
  provider: string;
  account: string;
  team: string;
  project: string;
  environment: string;
  payloadDigest: string;
  spendAmount: number | null;
  currency: string;
  voicePolicy: string;
  approvalId: string;
  targetVerified: boolean;
  resultStatus: string;
}

interface OperationsLedger {
  envelopes: StandingEnvelope[];
  capabilities: Capability[];
  actions: PlannedAction[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/^provider\./, "")
    .replace(/[^a-z0-9]+/g, "");
}

function pathMatches(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (pattern.endsWith("/**")) return value === pattern.slice(0, -3) || value.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith("*")) return value.startsWith(pattern.slice(0, -1));
  return false;
}

function sameTarget(envelope: StandingEnvelope, action: PlannedAction): boolean {
  return (
    envelope.account.length > 0 &&
    envelope.project.length > 0 &&
    envelope.environment.length > 0 &&
    envelope.account === action.account &&
    envelope.team === action.team &&
    envelope.project === action.project &&
    envelope.environment === action.environment &&
    normalize(envelope.provider) === normalize(action.provider)
  );
}

function capabilityCoversAction(capability: Capability, action: PlannedAction): boolean {
  return (
    capability.id === action.capabilityId &&
    capability.status === "available" &&
    capability.modes.includes(action.class) &&
    normalize(capability.provider) === normalize(action.provider) &&
    capability.account === action.account &&
    capability.team === action.team &&
    capability.project === action.project &&
    capability.environment === action.environment
  );
}

function actionCoversNode(envelope: StandingEnvelope, action: PlannedAction, node: CompiledRunNode, capabilities: Capability[]): boolean {
  if (action.resultStatus !== "planned" || !action.targetVerified) return false;
  if (action.approvalId !== envelope.id || action.operation !== node.workflowId || action.class !== node.actionClass) return false;
  if (!sameTarget(envelope, action)) return false;
  if (!envelope.resourcePatterns.some((pattern) => pathMatches(pattern, action.resource))) return false;
  if (!capabilities.some((capability) => capabilityCoversAction(capability, action))) return false;

  const payloadRequired = ["mutate", "publish", "spend", "release"].includes(node.actionClass);
  if (payloadRequired && action.payloadDigest.length === 0) return false;
  if (action.payloadDigest.length > 0 && !envelope.payloadDigests.includes(action.payloadDigest)) return false;

  if (node.actionClass === "spend") {
    if (node.costEstimate === undefined || envelope.spendCeiling === null || action.spendAmount === null) return false;
    if (action.currency !== node.costEstimate.currency || action.spendAmount !== node.costEstimate.amount) return false;
    if (action.spendAmount > envelope.spendCeiling || node.costEstimate.amount > envelope.spendCeiling) return false;
  }

  // Founder public voice is never satisfied by a standing envelope — full stop, regardless of a
  // matching voicePolicy string or the envelope's mode. A publish tagged purpose "social_engagement"
  // (a social/public post made in the founder's voice) always routes through a fresh, per-item
  // founder decision (kernel/session/approve.ts), never through auto-consumption here. Routine
  // already-approved copy publication (store metadata, previously-drafted landing pages) carries a
  // different purpose and is unaffected. See docs/authority-envelopes.md, "Public voice" grant.
  if (node.actionClass === "publish" && action.purpose === "social_engagement") return false;

  if (node.actionClass === "publish") {
    if (envelope.voicePolicy.length === 0 || action.voicePolicy !== envelope.voicePolicy) return false;
  } else if (envelope.voicePolicy.length > 0 && action.voicePolicy !== envelope.voicePolicy) {
    return false;
  }
  return true;
}

function envelopeCoversNode(
  envelope: StandingEnvelope,
  node: CompiledRunNode,
  now: string,
  actions: PlannedAction[],
  capabilities: Capability[],
): PlannedAction | undefined {
  if (envelope.status !== "active" || envelope.mode !== "standing") return undefined;
  if (!Number.isFinite(Date.parse(envelope.expiresAt)) || Date.parse(envelope.expiresAt) <= Date.parse(now)) return undefined;
  if (!envelope.actionClasses.includes(node.actionClass) || !envelope.operations.includes(node.workflowId)) return undefined;
  if (envelope.exclusions.some((entry) => entry === node.workflowId || node.outputPaths.some((outputPath) => pathMatches(entry, outputPath)))) return undefined;
  if (node.outputPaths.length > 0 && !node.outputPaths.every((outputPath) => envelope.resourcePatterns.some((pattern) => pathMatches(pattern, outputPath))))
    return undefined;
  if (node.providerIds.length > 0 && !node.providerIds.every((providerId) => normalize(envelope.provider) === normalize(providerId))) return undefined;
  return actions.find((action) => actionCoversNode(envelope, action, node, capabilities));
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function readLedger(ledgerPath: string): OperationsLedger {
  const empty: OperationsLedger = { envelopes: [], capabilities: [], actions: [] };
  if (!existsSync(ledgerPath)) return empty;
  try {
    const value = JSON.parse(readFileSync(ledgerPath, "utf8")) as Record<string, unknown>;
    const envelopes = (Array.isArray(value.approvalEnvelopes) ? value.approvalEnvelopes : []).flatMap((entry): StandingEnvelope[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const actionClasses = stringArray(item.actionClasses);
      const operations = stringArray(item.operations);
      const resourcePatterns = stringArray(item.resourcePatterns);
      const payloadDigests = stringArray(item.payloadDigests);
      const exclusions = stringArray(item.exclusions);
      if (
        typeof item.id !== "string" ||
        typeof item.provider !== "string" ||
        typeof item.account !== "string" ||
        typeof item.team !== "string" ||
        typeof item.project !== "string" ||
        typeof item.environment !== "string" ||
        !actionClasses ||
        !operations ||
        !resourcePatterns ||
        !payloadDigests ||
        !exclusions ||
        (item.mode !== "standing" && item.mode !== "one_shot") ||
        typeof item.expiresAt !== "string" ||
        typeof item.status !== "string"
      )
        return [];
      return [
        {
          id: item.id,
          provider: item.provider,
          account: item.account,
          team: item.team,
          project: item.project,
          environment: item.environment,
          actionClasses,
          operations,
          resourcePatterns,
          payloadDigests,
          exclusions,
          mode: item.mode,
          expiresAt: item.expiresAt,
          status: item.status,
          spendCeiling: typeof item.spendCeiling === "number" ? item.spendCeiling : null,
          voicePolicy: typeof item.voicePolicy === "string" ? item.voicePolicy : "",
        },
      ];
    });

    const capabilities = (Array.isArray(value.capabilities) ? value.capabilities : []).flatMap((entry): Capability[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const modes = stringArray(item.modes);
      if (
        typeof item.id !== "string" ||
        typeof item.provider !== "string" ||
        typeof item.status !== "string" ||
        typeof item.account !== "string" ||
        typeof item.team !== "string" ||
        typeof item.project !== "string" ||
        typeof item.environment !== "string" ||
        !modes
      )
        return [];
      return [
        {
          id: item.id,
          provider: item.provider,
          status: item.status,
          account: item.account,
          team: item.team,
          project: item.project,
          environment: item.environment,
          modes,
        },
      ];
    });

    const actions = (Array.isArray(value.actions) ? value.actions : []).flatMap((entry): PlannedAction[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const authorization = item.authorization && typeof item.authorization === "object" ? (item.authorization as Record<string, unknown>) : {};
      const preflight = item.preflight && typeof item.preflight === "object" ? (item.preflight as Record<string, unknown>) : {};
      const result = item.result && typeof item.result === "object" ? (item.result as Record<string, unknown>) : {};
      const requiredStrings = [
        "id",
        "class",
        "operation",
        "resource",
        "capabilityId",
        "provider",
        "account",
        "team",
        "project",
        "environment",
        "payloadDigest",
        "currency",
        "voicePolicy",
      ] as const;
      if (requiredStrings.some((key) => typeof item[key] !== "string")) return [];
      if (typeof authorization.approvalId !== "string" || typeof preflight.targetVerified !== "boolean" || typeof result.status !== "string") return [];
      return [
        {
          id: item.id as string,
          class: item.class as string,
          purpose: typeof item.purpose === "string" ? item.purpose : "",
          operation: item.operation as string,
          resource: item.resource as string,
          capabilityId: item.capabilityId as string,
          provider: item.provider as string,
          account: item.account as string,
          team: item.team as string,
          project: item.project as string,
          environment: item.environment as string,
          payloadDigest: item.payloadDigest as string,
          spendAmount: typeof item.spendAmount === "number" ? item.spendAmount : null,
          currency: item.currency as string,
          voicePolicy: item.voicePolicy as string,
          approvalId: authorization.approvalId,
          targetVerified: preflight.targetVerified,
          resultStatus: result.status,
        },
      ];
    });
    return { envelopes, capabilities, actions };
  } catch {
    return empty;
  }
}

export interface StandingApprovalMatch {
  nodeId: string;
  workflowId: string;
  envelopeId: string;
  actionId: string;
}

/** Revalidate persisted standing grants and bind current authority to an exact planned action. */
export function applyStandingApprovals(plan: CompiledPlan, run: RunStateDocument, ledgerPath: string, now: string): StandingApprovalMatch[] {
  const ledger = readLedger(ledgerPath);
  const provenance = (run.approvalProvenance ??= {});

  for (const approvalId of Object.keys(provenance)) {
    // Standing envelopes are revalidated on every session. A signed per-item founder receipt is
    // a different authority source and must survive this sweep; its own resolver validates it.
    if (provenance[approvalId]?.source !== "standing_envelope") continue;
    if (run.approvals[approvalId] === "approved") run.approvals[approvalId] = "pending";
    delete provenance[approvalId];
  }

  const matches: StandingApprovalMatch[] = [];
  for (const node of plan.nodes) {
    if (node.approvals.length === 0 || node.approvals.some((approval) => run.approvals[approval.id] === "rejected")) continue;
    let matchedEnvelope: StandingEnvelope | undefined;
    let matchedAction: PlannedAction | undefined;
    for (const envelope of ledger.envelopes) {
      const action = envelopeCoversNode(envelope, node, now, ledger.actions, ledger.capabilities);
      if (!action) continue;
      matchedEnvelope = envelope;
      matchedAction = action;
      break;
    }
    if (!matchedEnvelope || !matchedAction) continue;
    for (const approval of node.approvals) {
      if (run.approvals[approval.id] === "approved" && provenance[approval.id] === undefined) continue;
      run.approvals[approval.id] = "approved";
      provenance[approval.id] = { source: "standing_envelope", envelopeId: matchedEnvelope.id, actionId: matchedAction.id, validatedAt: now };
    }
    const state = run.nodes[node.id];
    if (state?.status === "waiting_founder" && node.approvals.every((approval) => run.approvals[approval.id] === "approved")) {
      state.status = "pending";
      state.blocker = undefined;
    }
    matches.push({ nodeId: node.id, workflowId: node.workflowId, envelopeId: matchedEnvelope.id, actionId: matchedAction.id });
  }
  return matches;
}
