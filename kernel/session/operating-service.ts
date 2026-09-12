import { createHash } from "node:crypto";
import { capsuleBytes, compileContext } from "../context/compile.js";
import { ContextCompileError } from "../context/receipt.js";
import { writeRunState } from "../engine/runstate.js";
import { isKnownActionClass } from "../autonomy/grants.js";
import { effectiveProtectedCategory } from "../autonomy/waivers.js";
import { authorizeResponsibility, type AuthorizationSnapshot, type OperationEnvelope } from "../operating-model/authorize.js";
import { B2C_APP_BUILDER_PARTY_ID } from "../operating-model/parties.js";
import { resolveRoute } from "../routing/resolve.js";
import type { RouteDecision, RouteRequest } from "../routing/types.js";
import type { ActionClass, GrantableDomainId } from "../schema/types.js";
import { instantiateWorkOrder, workOrderIdFor } from "../work-orders/instantiate.js";
import { syncOccurrenceMandates } from "../work-orders/lifecycle.js";
import { bindRegisteredWorkspace } from "./operate-bind.js";
import { sanitizeTransport } from "./operating-transport.js";
import { validateOperatingCatalog, type CatalogRefusal } from "./catalog-contract.js";
import { buildGoNoGoQuestion, type FounderQuestion, type FounderQuestionClass } from "./founder-gate.js";
import type { OperateGates, OperateInput, OperateReceipt, OperateSource, OperateTransport, OperateWorld } from "./operating-types.js";

/**
 * No new gate: `authorizeResponsibility` already refuses `commit` without an explicit, current,
 * correctly-bound mandate — nothing in production code auto-synthesizes one
 * (`standingFounderMandate`/`defaultFounderMandateFor` are called only from fixtures). This makes
 * that pre-existing refusal self-describing for a cockpit, for exactly the three DIRECT protected
 * categories `effectiveProtectedCategory` can resolve without a catalog lookup (spend/release/
 * destructive — the cluster's "Go / spend-cap / release-publish" trio). A catalog-declared
 * category (credentials_access/legal_pricing/public_actions) is NOT covered here: operate() has no
 * catalog/workflow lookup for domainId+actionClass, so it cannot resolve one — a real, documented
 * gap versus the full protectedCategory set (see operate.fixtures.ts's "mutate" case).
 */
const MANDATE_REFUSAL_REASON_CODES: ReadonlySet<string> = new Set(["authority.mandate_required", "authority.mandate_revoked", "authority.mandate_stale"]);

const FOUNDER_QUESTION_CLASS_BY_CATEGORY: Record<"spend" | "release" | "destructive", FounderQuestionClass> = {
  spend: "confirm-spend-cap",
  release: "confirm-release-publish",
  destructive: "confirm-go",
};

const FOUNDER_QUESTION_PROMPT_BY_CATEGORY: Record<"spend" | "release" | "destructive", string> = {
  spend: "This needs your go-ahead before I spend anything on it. Go ahead?",
  release: "This needs your go-ahead before I release or publish it. Go ahead?",
  destructive: "This needs your go-ahead before I do something that can't be undone. Go ahead?",
};

function founderQuestionForAuthorityRefusal(reasonCode: string, actionClass: ActionClass): FounderQuestion | undefined {
  if (!MANDATE_REFUSAL_REASON_CODES.has(reasonCode)) return undefined;
  const category = effectiveProtectedCategory({ actionClass, protectedCategory: undefined });
  if (category !== "spend" && category !== "release" && category !== "destructive") return undefined;
  return buildGoNoGoQuestion({
    phase: "operating",
    class: FOUNDER_QUESTION_CLASS_BY_CATEGORY[category],
    prompt: FOUNDER_QUESTION_PROMPT_BY_CATEGORY[category],
    choices: [
      { label: "Yes, go ahead", consequence: "I will do this now.", recommended: true },
      { label: "No, hold off", consequence: "I will leave this alone for now.", recommended: false },
    ],
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const nested = (value as Record<string, unknown>)[key];
      if (nested === undefined) continue;
      out[key] = canonicalize(nested);
    }
    return out;
  }
  return value;
}

export function semanticReceipt(receipt: OperateReceipt): string {
  return `${JSON.stringify(
    canonicalize({
      stateRevision: receipt.stateRevision,
      compositionPin: receipt.compositionPin,
      decision: receipt.decision,
      contextDigest: receipt.contextDigest,
      context: receipt.context,
      authority: receipt.authority,
      occurrenceId: receipt.occurrenceId,
      followUpTrigger: receipt.followUpTrigger,
      recordedAt: receipt.recordedAt,
    }),
  )}\n`;
}

function effectiveClock(transport: OperateTransport): string {
  if (transport.mode === "replay" && transport.recordedReceipt?.recordedAt) return transport.recordedReceipt.recordedAt;
  return transport.clock;
}

function emptyDecision(request: RouteRequest): RouteDecision {
  return {
    outcome: "no_match",
    eligibleIds: [],
    exclusions: [],
    scores: {},
    policyRevision: request.policyRevision,
    ambiguityBand: request.ambiguityBand,
    resolutionAction: "refused_before_route",
    signals: [],
    precedent: { matchedFacts: [], differentFacts: [], evidenceStrength: "absent", transferLimits: [] },
  };
}

function followUpFor(decision: RouteDecision, committed: boolean, authorityOk: boolean): string | undefined {
  if (decision.outcome === "selected" && !authorityOk) return "close_authority_or_capability_gap";
  if (decision.outcome === "selected") return committed ? "outcome_horizon" : "commit_authorized_work";
  return decision.resolutionAction;
}

function asCopiedStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toRouteRequest(transport: OperateTransport, world: OperateWorld): RouteRequest {
  const forbiddenDomains = asCopiedStringList(transport.forbiddenDomains);
  const recallProposedIds = asCopiedStringList(transport.recallProposedIds);
  return {
    id: `route.${sha256(typeof transport.idempotencyKey === "string" ? transport.idempotencyKey : "").slice(0, 12)}`,
    kind: transport.kind,
    problem: transport.problem,
    packId: transport.packId,
    requiredFacts: asCopiedStringList(transport.requiredFacts),
    availableFacts: asCopiedStringList(transport.availableFacts),
    forbiddenDomains: forbiddenDomains.length > 0 ? forbiddenDomains : undefined,
    recognized: transport.recognized ?? true,
    clock: transport.clock,
    policyRevision: transport.policyRevision ?? "policy.operating.v1",
    ambiguityBand: typeof transport.ambiguityBand === "number" && Number.isFinite(transport.ambiguityBand) ? transport.ambiguityBand : 0.05,
    recallProposedIds: recallProposedIds.length > 0 ? recallProposedIds : undefined,
  };
}

function isGrantableDomainId(value: string): value is GrantableDomainId {
  return value.startsWith("domain.") && value.length > "domain.".length;
}

function resolveSelectedAuthority(
  world: OperateWorld,
  decision: RouteDecision,
): { ok: true; domainId: GrantableDomainId; actionClass: ActionClass } | { ok: false; reasonCode: string; reason: string } {
  if (decision.outcome !== "selected" || decision.selectedId === undefined) {
    return { ok: true, domainId: world.domainId, actionClass: world.actionClass };
  }
  const selected = world.candidates.find((candidate) => candidate.id === decision.selectedId);
  const domainId = selected?.domainId ?? (decision.selectedId === world.workflowId ? world.domainId : undefined);
  const actionClass = selected?.actionClass ?? (decision.selectedId === world.workflowId ? world.actionClass : undefined);
  if (!domainId || !actionClass || !isGrantableDomainId(domainId) || !isKnownActionClass(actionClass)) {
    return {
      ok: false,
      reasonCode: "operate.authority_tuple_mismatch",
      reason: "The selected route is not bound to a domain and action class, so operate cannot reuse the pinned authority tuple.",
    };
  }
  if (decision.selectedId === world.workflowId && (domainId !== world.domainId || actionClass !== world.actionClass)) {
    return {
      ok: false,
      reasonCode: "operate.authority_tuple_mismatch",
      reason: "The selected workflow's authority tuple does not match the pinned domain and action class.",
    };
  }
  return { ok: true, domainId, actionClass };
}

function buildEnvelope(world: OperateWorld, transport: OperateTransport, mandateId: string): OperationEnvelope {
  const mandate = world.mandate;
  return {
    partyId: mandate?.partyId ?? B2C_APP_BUILDER_PARTY_ID,
    principalId: transport.principalId,
    trustAnchor: mandate?.trustAnchor ?? world.agreement.revision,
    agreementRevision: world.agreement.revision,
    mandateId,
    ...(world.workspaceId ? { workspaceId: world.workspaceId } : {}),
    expectedBusinessRevision: transport.expectedBusinessRevision ?? world.businessRevision,
    idempotencyKey: transport.idempotencyKey,
    recordedAt: transport.clock,
    payload: { kind: transport.kind, problem: transport.problem },
  };
}

function refuse(input: OperateInput, transport: OperateTransport, reasonCode: string, reason: string, extra: Partial<OperateReceipt> = {}): OperateReceipt {
  const request = toRouteRequest(transport, input.world);
  return {
    mode: transport.mode,
    source: transport.source,
    actionStatus: "refused",
    reasonCode,
    reason,
    recordedAt: transport.clock,
    stateRevision: input.world.businessRevision,
    compositionPin: input.world.compositionPin,
    decision: extra.decision ?? emptyDecision(request),
    contextDigest: extra.contextDigest,
    context: extra.context,
    authority: extra.authority ?? { ok: false, reasonCode, reason },
    occurrenceId: extra.occurrenceId,
    followUpTrigger: extra.followUpTrigger,
    founderQuestion: extra.founderQuestion,
  };
}

function commitGates(input: OperateInput, transport: OperateTransport): OperateReceipt | undefined {
  if (input.gates.readOnlySurface) return refuse(input, transport, "operate.read_only", "Read-only surfaces may preview only.");
  if (!input.gates.workspaceRegistered) return refuse(input, transport, "operate.unregistered_workspace", "Commit requires a registered workspace.");
  if (input.gates.lease === "revoked") return refuse(input, transport, "operate.lease_revoked", "The current lease is revoked.");
  if (input.gates.lease === "held") return refuse(input, transport, "operate.lease_held", "Another session holds the workspace lease.");
  if ((transport.expectedBusinessRevision ?? input.world.businessRevision) !== input.world.businessRevision) {
    return refuse(input, transport, "operate.stale_revision", "Expected business revision does not match the pinned state.");
  }
  return undefined;
}

export function operate(input: OperateInput, boundRefusal?: CatalogRefusal): OperateReceipt {
  const sanitized = sanitizeTransport(input.transport, {
    mode: input.transport.mode,
    source: input.transport.source,
    clock: input.transport.clock,
    principalId: input.transport.principalId,
  });
  if (!sanitized.ok) return refuse(input, input.transport, sanitized.reasonCode, sanitized.reason);

  const transport: OperateTransport = {
    ...sanitized.value,
    recordedReceipt: input.transport.recordedReceipt,
    clock: effectiveClock({
      ...sanitized.value,
      recordedReceipt: input.transport.recordedReceipt,
    }),
  };
  if (boundRefusal) return refuse(input, transport, boundRefusal.reasonCode, boundRefusal.reason);
  const writing = transport.mode === "commit";
  // Failed registration cannot provide a catalog. Report that recovery step before checking it.
  if (writing && !input.gates.workspaceRegistered) {
    const blocked = commitGates(input, transport);
    if (blocked) return blocked;
  }
  const incompatible = validateOperatingCatalog(input.world);
  if (incompatible) return refuse(input, transport, incompatible.reasonCode, incompatible.reason);
  if (transport.mode === "replay" && !input.transport.recordedReceipt) {
    return refuse(input, transport, "operate.replay_missing_receipt", "Replay requires the stored receipt.");
  }
  if (writing) {
    const blocked = commitGates(input, transport);
    if (blocked) return blocked;
    if (transport.source === "adapter" && !input.world.runStatePath) {
      return refuse(input, transport, "operate.run_state_missing", "Adapter commit requires a durable registered run.");
    }
  }

  const request = toRouteRequest(transport, input.world);
  const decision = resolveRoute(request, input.world.candidates);
  let context: OperateReceipt["context"];
  let contextDigest: string | undefined;
  if (decision.outcome === "selected") {
    const selectedCandidate = input.world.candidates.find((candidate) => candidate.id === decision.selectedId);
    try {
      context = compileContext({
        request,
        decision,
        sections: selectedCandidate?.knowledgeSections ?? input.world.sections,
        liveRevisions: input.world.liveRevisions,
      });
      contextDigest = sha256(capsuleBytes(context).trim());
    } catch (error) {
      if (error instanceof ContextCompileError) return refuse(input, transport, error.code, error.message, { decision });
      throw error;
    }
  }

  const envelope = buildEnvelope(input.world, transport, input.world.mandate?.id ?? "mandate.missing");
  const selectedAuthority = resolveSelectedAuthority(input.world, decision);
  if (!selectedAuthority.ok) {
    return refuse(input, transport, selectedAuthority.reasonCode, selectedAuthority.reason, { decision, context, contextDigest });
  }
  const authority: AuthorizationSnapshot = authorizeResponsibility({
    grants: input.world.grants,
    domainId: selectedAuthority.domainId,
    actionClass: selectedAuthority.actionClass,
    agreement: input.world.agreement,
    mandate: input.world.mandate,
    envelope,
    workspaceId: input.world.workspaceId,
    now: transport.clock,
    credentialsPresent: input.world.credentialsPresent,
    grantOptions: { authority: input.world.authority },
  });
  const authorityView = { ok: authority.ok, reasonCode: authority.reasonCode, reason: authority.reason };
  const recordedWasCommit =
    input.transport.recordedReceipt?.followUpTrigger === "outcome_horizon" || input.transport.recordedReceipt?.occurrenceId !== undefined;
  const committing = writing || (transport.mode === "replay" && recordedWasCommit);

  if (!committing) {
    const receipt: OperateReceipt = {
      mode: transport.mode,
      source: transport.source,
      actionStatus: transport.mode === "replay" ? "replayed" : "previewed",
      reasonCode: "operate.previewed",
      reason: "Preview computed without creating a work order.",
      recordedAt: transport.clock,
      stateRevision: input.world.businessRevision,
      compositionPin: input.world.compositionPin,
      decision,
      contextDigest,
      context,
      authority: authorityView,
      followUpTrigger: followUpFor(decision, false, authorityView.ok),
    };
    if (transport.mode === "replay" && input.transport.recordedReceipt && semanticReceipt(receipt) !== semanticReceipt(input.transport.recordedReceipt)) {
      return refuse(input, transport, "operate.replay_mismatch", "Replay did not match the stored receipt.", {
        decision,
        context,
        contextDigest,
        authority: authorityView,
      });
    }
    return receipt;
  }

  if (decision.outcome !== "selected" || !context) {
    return refuse(input, transport, `operate.route_${decision.outcome}`, "Commit requires a selected route and compiled context.", {
      decision,
      authority: authorityView,
    });
  }
  if (writing && input.world.run && input.world.mandate) {
    syncOccurrenceMandates(input.world.run, [input.world.mandate], transport.clock);
  }

  if (!authority.ok) {
    if (writing && input.world.runStatePath && input.world.run) {
      writeRunState(input.world.runStatePath, input.world.run);
    }
    const founderQuestion = founderQuestionForAuthorityRefusal(authority.reasonCode, selectedAuthority.actionClass);
    return refuse(input, transport, authority.reasonCode, authority.reason, { decision, context, contextDigest, authority: authorityView, founderQuestion });
  }

  const decisionStatus = input.world.links.decisionStatus;
  if (writing && (decisionStatus === "revoked" || decisionStatus === "completed" || decisionStatus === "superseded")) {
    return refuse(input, transport, "operate.decision_not_authorizing", "The linked decision no longer authorizes new work.", {
      decision,
      context,
      contextDigest,
      authority: authorityView,
    });
  }

  let occurrenceId = workOrderIdFor(transport.idempotencyKey);
  let created = false;
  if (writing) {
    if (!input.world.run) {
      return refuse(input, transport, "operate.run_missing", "Commit requires a durable run.", { decision, context, contextDigest, authority: authorityView });
    }
    const result = instantiateWorkOrder(input.world.run, {
      workflowId: decision.selectedId ?? input.world.workflowId,
      decisionId: input.world.links.decisionId,
      objectiveId: input.world.links.objectiveId,
      metricId: input.world.links.metricId,
      mandateId: input.world.mandate!.id,
      mandateStatus: "active",
      decisionStatus: input.world.links.decisionStatus,
      contextSourceIds: context.sourceIds,
      readinessSnapshot: { capabilityReady: true, recordedAt: transport.clock },
      expectationId: input.world.links.expectationId,
      horizonAt: input.world.links.horizonAt,
      proofPolicy: input.world.proofPolicy,
      idempotencyKey: transport.idempotencyKey,
      recordedAt: transport.clock,
    });
    occurrenceId = result.occurrence.id;
    created = result.created;
    if (result.conflict) {
      return refuse(input, transport, "operate.idempotency_conflict", "Idempotency key is already bound to a different work-order route.", {
        decision,
        context,
        contextDigest,
        authority: authorityView,
        occurrenceId,
      });
    }
    if (input.world.runStatePath) writeRunState(input.world.runStatePath, input.world.run);
  }

  const receipt: OperateReceipt = {
    mode: transport.mode,
    source: transport.source,
    actionStatus: transport.mode === "replay" ? "replayed" : "committed",
    reasonCode: writing ? "operate.committed" : "operate.replayed",
    reason: writing ? "Work-order occurrence committed through the operating service." : "Replay recomputed the committed occurrence without writing.",
    recordedAt: transport.clock,
    stateRevision: input.world.businessRevision,
    compositionPin: input.world.compositionPin,
    decision,
    contextDigest,
    context,
    authority: authorityView,
    occurrenceId,
    created,
    followUpTrigger: followUpFor(decision, true, authorityView.ok),
  };
  if (transport.mode === "replay" && input.transport.recordedReceipt && semanticReceipt(receipt) !== semanticReceipt(input.transport.recordedReceipt)) {
    return refuse(input, transport, "operate.replay_mismatch", "Replay did not match the stored receipt.", {
      decision,
      context,
      contextDigest,
      authority: authorityView,
      occurrenceId,
    });
  }
  return receipt;
}

export function operateFromCli(input: OperateInput): OperateReceipt {
  return operate({ ...input, transport: { ...input.transport, source: "cli" } });
}

export function operateFromMcp(input: OperateInput): OperateReceipt {
  return operate({ ...input, transport: { ...input.transport, source: "mcp" } });
}

export function operateFromSchedule(input: OperateInput): OperateReceipt {
  return operate({ ...input, transport: { ...input.transport, source: "schedule" } });
}

export function operateFromAdapter(input: OperateInput, workspace?: string): OperateReceipt {
  const prepared: OperateInput = {
    ...input,
    transport: { ...input.transport, source: "adapter" },
    world: { ...input.world, runStatePath: undefined },
  };
  const bound = bindRegisteredWorkspace(prepared, workspace);
  try {
    return operate(bound.input, bound.refusal);
  } finally {
    bound.release?.();
  }
}

export function withSource(input: OperateInput, source: OperateSource, gates?: Partial<OperateGates>): OperateInput {
  return {
    ...input,
    transport: { ...input.transport, source },
    gates: { ...input.gates, ...gates },
  };
}
