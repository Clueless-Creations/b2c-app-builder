import { authorizeResponsibility, type OperationEnvelope } from "../../../kernel/operating-model/authorize.js";
import { standingFounderAgreement } from "../../../kernel/operating-model/agreements.js";
import { revokeMandate, standingFounderMandate } from "../../../kernel/operating-model/mandates.js";
import { b2cAppBuilderParty } from "../../../kernel/operating-model/parties.js";
import { evaluateGrantCeiling } from "../../../kernel/autonomy/grants.js";
import { SessionPrerequisiteCache, type PrerequisiteVerifier } from "../../../kernel/autonomy/prerequisites.js";
import { closeRecursiveNeed, resolveCapabilityGap } from "../../../adapters/provisioning/capability-gaps.js";
import { evaluateCapabilityReadiness } from "../../../adapters/provisioning/capability-readiness.js";
import { validateOperationEnvelope } from "../../../kernel/schema/index.js";
import { assert, type Harness } from "./_harness.js";
import { makeGrant, makeGrants } from "../boundaries/_fixtures.js";

const NOW = "2026-08-22T20:00:00.000Z";
const LATER = "2026-08-22T21:00:00.000Z";

function envelopeFor(mandateId: string, agreementRevision: string, extra: Partial<OperationEnvelope> = {}): OperationEnvelope {
  return {
    partyId: extra.partyId ?? "party.founder",
    principalId: extra.principalId ?? "principal.founder-session",
    trustAnchor: extra.trustAnchor ?? agreementRevision,
    agreementRevision,
    mandateId,
    expectedBusinessRevision: extra.expectedBusinessRevision ?? "state.rev-1",
    idempotencyKey: extra.idempotencyKey ?? "idem.1",
    recordedAt: extra.recordedAt ?? NOW,
    payload: extra.payload ?? { action: "mutate" },
  };
}

export function register(harness: Harness): void {
  harness.check("authority: the founder path matches grant-ceiling authorization through the party wrapper", () => {
    const grants = makeGrants([["domain.engineering", "run-with-guardrails"]]);
    const agreement = standingFounderAgreement(NOW);
    for (const actionClass of ["mutate", "publish"] as const) {
      const ceiling = evaluateGrantCeiling(grants, "domain.engineering", actionClass);
      const mandate = standingFounderMandate(agreement, "domain.engineering", actionClass, NOW);
      const wrapped = authorizeResponsibility({
        grants,
        domainId: "domain.engineering",
        actionClass,
        agreement,
        mandate,
        envelope: envelopeFor(mandate.id, agreement.revision),
        now: NOW,
      });
      assert(wrapped.ok === ceiling.ok, `${actionClass}: wrapper ok ${wrapped.ok} !== ceiling ok ${ceiling.ok}`);
      assert(wrapped.reasonCode === ceiling.reasonCode, `${actionClass}: wrapper ${wrapped.reasonCode} !== ceiling ${ceiling.reasonCode}`);
    }
  });

  harness.check("authority: B2C App Builder with an active mandate and verified capability can accept responsibility", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = {
      ...standingFounderMandate(agreement, "domain.engineering", "mutate", NOW),
      partyId: b2cAppBuilderParty().id,
      principalId: "principal.b2c-app-builder-session",
      id: "mandate.b2c-app-builder.domain.engineering.mutate",
    };
    const granted = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision, { partyId: b2cAppBuilderParty().id, principalId: mandate.principalId }),
      now: NOW,
    });
    assert(granted.ok, `expected B2C App Builder to accept, got ${granted.reasonCode}: ${granted.reason}`);
    assert(granted.envelope?.mandateId === mandate.id, "authorization snapshot must bind the mandate");
    const envelopeCheck = validateOperationEnvelope(granted.envelope);
    assert(envelopeCheck.valid, `authorization envelope failed schema: ${JSON.stringify(envelopeCheck.issues)}`);
  });

  harness.check("authority: valid credentials with no mandate are refused", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const result = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      envelope: envelopeFor("mandate.missing", agreement.revision),
      now: NOW,
      credentialsPresent: true,
    });
    assert(!result.ok, "credentials without a mandate must not authorize");
    assert(result.reasonCode === "authority.mandate_required", `expected mandate_required, got ${result.reasonCode}`);
  });

  harness.check("authority: a mandate issued after the clock cannot authorize", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = standingFounderMandate(agreement, "domain.engineering", "mutate", "2026-08-22T22:00:00.000Z");
    const result = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision),
      now: NOW,
    });
    assert(!result.ok, "a future-dated mandate must not authorize");
    assert(result.reasonCode === "authority.mandate_required", `expected mandate_required, got ${result.reasonCode}`);
  });

  harness.check("authority: an expired mandate cannot authorize after its deadline", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = {
      ...standingFounderMandate(agreement, "domain.engineering", "mutate", NOW),
      expiresAt: "2026-08-22T20:30:00.000Z",
    };
    const result = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision, { recordedAt: "2026-08-22T20:31:00.000Z" }),
      now: "2026-08-22T20:31:00.000Z",
    });
    assert(!result.ok, "an expired mandate must not authorize");
    assert(result.reasonCode === "authority.mandate_stale", `expected mandate_stale, got ${result.reasonCode}`);
  });

  harness.check("authority: a revokedAt stamp is compared as an instant", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement("2026-08-23T00:00:00.000Z");
    const mandate = {
      ...standingFounderMandate(agreement, "domain.engineering", "mutate", "2026-08-22T20:00:00.000Z"),
      revokedAt: "2026-08-23T00:30:00+01:00",
    };
    const result = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision),
      now: "2026-08-23T00:00:00.000Z",
    });
    assert(!result.ok, "a mandate already revoked in UTC must not authorize");
    assert(result.reasonCode === "authority.mandate_revoked", `expected mandate_revoked, got ${result.reasonCode}`);
  });
  harness.check("authority: a stale agreement revision or envelope binding is refused", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = standingFounderMandate(agreement, "domain.engineering", "mutate", NOW);
    const stale = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate: { ...mandate, agreementRevision: "agreement.other" },
      envelope: envelopeFor(mandate.id, agreement.revision),
      now: NOW,
    });
    assert(!stale.ok && stale.reasonCode === "authority.agreement_revision_mismatch", `expected agreement_revision_mismatch, got ${stale.reasonCode}`);
    const envelope = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor("mandate.other", agreement.revision),
      now: NOW,
    });
    assert(!envelope.ok && envelope.reasonCode === "authority.envelope_mismatch", `expected envelope_mismatch, got ${envelope.reasonCode}`);
    const principal = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision, { principalId: "principal.other-session" }),
      now: NOW,
    });
    assert(
      !principal.ok && principal.reasonCode === "authority.envelope_mismatch",
      `expected envelope_mismatch for a foreign principal, got ${principal.reasonCode}`,
    );
  });

  harness.check("authority: a current mandate cannot cross its domain, action, or draft agreement scope", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = standingFounderMandate(agreement, "domain.engineering", "mutate", NOW);

    const wrongDomain = authorizeResponsibility({
      grants,
      domainId: "domain.growth",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision),
      now: NOW,
    });
    assert(!wrongDomain.ok && wrongDomain.reasonCode === "authority.mandate_required", "a mandate must not authorize another domain");

    const wrongAction = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "publish",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision),
      now: NOW,
    });
    assert(!wrongAction.ok && wrongAction.reasonCode === "authority.mandate_required", "a mutate mandate must not authorize publish");

    const draftAgreement = { ...agreement, revision: `${agreement.revision}.draft` };
    const draft = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement: draftAgreement,
      mandate,
      envelope: envelopeFor(mandate.id, draftAgreement.revision),
      now: NOW,
    });
    assert(!draft.ok && draft.reasonCode === "authority.agreement_revision_mismatch", "a mandate from the current agreement must not authorize a draft revision");
  });

  harness.check("authority: a revoked mandate blocks the action at effect time after route-time readiness", () => {
    const grants = makeGrants([["domain.engineering", "full"]]);
    const agreement = standingFounderAgreement(NOW);
    const mandate = standingFounderMandate(agreement, "domain.engineering", "mutate", NOW);
    const atRoute = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate,
      envelope: envelopeFor(mandate.id, agreement.revision),
      now: NOW,
    });
    assert(atRoute.ok, `route-time authorization failed: ${atRoute.reasonCode}`);
    const revoked = revokeMandate(mandate, LATER);
    const atEffect = authorizeResponsibility({
      grants,
      domainId: "domain.engineering",
      actionClass: "mutate",
      agreement,
      mandate: revoked,
      envelope: envelopeFor(revoked.id, agreement.revision, { recordedAt: LATER }),
      now: LATER,
    });
    assert(!atEffect.ok, "revoked mandate must fail at effect time");
    assert(atEffect.reasonCode === "authority.mandate_revoked", `expected mandate_revoked, got ${atEffect.reasonCode}`);
  });

  harness.check("authority: two work requests with the same capability gap share one acquisition occurrence", () => {
    const existing = new Map();
    const need = {
      capabilityId: "capability.analytics-access",
      providerId: "provider.posthog",
      requirementName: "POSTHOG_API_KEY",
      acquisitionWorkflowIds: ["workflow.growth.analytics"],
    };
    const first = resolveCapabilityGap(need, [], { existing });
    const second = resolveCapabilityGap(need, ["other.work"], { existing });
    assert(first.id === second.id, "duplicate capability gaps must reuse one occurrence");
    assert(first.dedupeKey === second.dedupeKey, "dedupe keys must match");
  });

  harness.check("authority: a capability dependency cycle and a depth-four request terminate unsatisfiable", () => {
    const existing = new Map();
    const cycle = resolveCapabilityGap({ capabilityId: "capability.alpha", acquisitionWorkflowIds: ["workflow.alpha"] }, ["capability.alpha"], { existing });
    assert(cycle.terminalOutcome === "cycle", `expected cycle, got ${cycle.terminalOutcome}`);
    assert(cycle.resolution === "decline", "cycles decline rather than looping");
    const self = closeRecursiveNeed(
      { capabilityId: "capability.loop", acquisitionWorkflowIds: ["workflow.loop"] },
      { capabilityId: "capability.loop", acquisitionWorkflowIds: ["workflow.loop"] },
      { existing: new Map() },
    );
    assert(self.terminalOutcome === "cycle", `direct recursive need must be a cycle, got ${self.terminalOutcome}`);

    const depthContext = { existing: new Map() };
    const depthFour = closeRecursiveNeed(
      { capabilityId: "capability.one", acquisitionWorkflowIds: ["workflow.one"] },
      { capabilityId: "capability.four", acquisitionWorkflowIds: ["workflow.four"] },
      depthContext,
      ["capability.zero", "capability.pre"],
    );
    assert(depthFour.terminalOutcome === "depth_limit", `expected depth_limit, got ${depthFour.terminalOutcome}`);
    assert(depthFour.depth > 3, `depth-four request should exceed the default max, got ${depthFour.depth}`);
  });

  harness.check("authority: completed capability acquisition does not mark readiness until independent verification passes", () => {
    const grant = makeGrant("domain.engineering", "full");
    const verifier: PrerequisiteVerifier = () => ({ status: "verified", detail: "ok", verifiedAt: NOW });
    const cache = new SessionPrerequisiteCache(verifier, () => NOW);
    const pending = evaluateCapabilityReadiness({ grant, cache, acquisitionCompleted: true });
    assert(!pending.ready, "completed acquisition without verification must not be ready");
    assert(pending.reasonCode === "capability.verification_pending", `expected verification_pending, got ${pending.reasonCode}`);
    const sameParty = evaluateCapabilityReadiness({
      grant,
      cache,
      acquisitionCompleted: true,
      independentVerification: { passed: true, verifierPartyId: "party.b2c-app-builder", producerPartyId: "party.b2c-app-builder" },
    });
    assert(!sameParty.ready, "producer cannot verify its own acquisition");
    const passed = evaluateCapabilityReadiness({
      grant,
      cache,
      acquisitionCompleted: true,
      independentVerification: { passed: true, verifierPartyId: "party.founder", producerPartyId: "party.b2c-app-builder" },
    });
    assert(passed.ready, `independent verification should mark ready, got ${passed.reasonCode}`);
  });
}
