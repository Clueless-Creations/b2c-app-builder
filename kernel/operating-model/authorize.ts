import { evaluateGrantCeiling, type GrantCeilingOptions, type GrantCeilingResult } from "../autonomy/grants.js";
import type { SessionPrerequisiteCache } from "../autonomy/prerequisites.js";
import { evaluateCapabilityReadiness, type CapabilityReadiness, type IndependentVerification } from "../../adapters/provisioning/capability-readiness.js";
import type { RequirementResolution } from "../../adapters/provisioning/resolve.js";
import type { Grant, GrantsMap } from "../schema/types.js";
import type { OperatingAgreement } from "./agreements.js";
import { isMandateCurrent, isStampNotAfter, mandateMatches, type Mandate } from "./mandates.js";

export interface OperationEnvelope {
  partyId: string;
  principalId: string;
  trustAnchor: string;
  agreementRevision: string;
  mandateId: string;
  workspaceId?: string;
  expectedBusinessRevision: string;
  idempotencyKey: string;
  recordedAt: string;
  payload: Record<string, unknown>;
}

export interface AuthorizationSnapshot {
  ok: boolean;
  reasonCode: string;
  reason: string;
  grant?: GrantCeilingResult["grant"];
  mandate?: Mandate;
  envelope?: OperationEnvelope;
  readiness?: CapabilityReadiness;
}

export interface AuthorizeInput {
  grants: GrantsMap;
  domainId: string;
  actionClass: string;
  agreement: OperatingAgreement;
  mandate?: Mandate;
  envelope: OperationEnvelope;
  workspaceId?: string;
  now: string;
  grantOptions?: GrantCeilingOptions;
  grant?: Grant;
  cache?: SessionPrerequisiteCache;
  provisioning?: readonly RequirementResolution[];
  independentVerification?: IndependentVerification;
  acquisitionCompleted?: boolean;
  credentialsPresent?: boolean;
}

function refuse(reasonCode: string, reason: string, extra: Partial<AuthorizationSnapshot> = {}): AuthorizationSnapshot {
  return { ok: false, reasonCode, reason, ...extra };
}

export function authorizeResponsibility(input: AuthorizeInput): AuthorizationSnapshot {
  const ceiling = evaluateGrantCeiling(input.grants, input.domainId, input.actionClass, input.grantOptions);
  if (input.credentialsPresent && !input.mandate) {
    return refuse("authority.mandate_required", "Provider credentials do not imply authority; a current mandate is required.", { grant: ceiling.grant });
  }
  if (!isMandateCurrent(input.mandate, input.now) || !mandateMatches(input.mandate, input.domainId, input.actionClass)) {
    const reasonCode =
      input.mandate?.status === "revoked" || (input.mandate?.revokedAt && isStampNotAfter(input.mandate.revokedAt, input.now))
        ? "authority.mandate_revoked"
        : input.mandate?.expiresAt && isStampNotAfter(input.mandate.expiresAt, input.now)
          ? "authority.mandate_stale"
        : "authority.mandate_required";
    return refuse(reasonCode, "Action requires a current mandate bound to the operating agreement.", { grant: ceiling.grant });
  }
  if (input.mandate.agreementRevision !== input.agreement.revision) {
    return refuse("authority.agreement_revision_mismatch", "Mandate agreement revision does not match the pinned operating agreement.", {
      mandate: input.mandate,
    });
  }
  if (
    (input.mandate.workspaceId !== undefined && input.workspaceId !== input.mandate.workspaceId) ||
    (input.envelope.workspaceId !== undefined && input.workspaceId !== input.envelope.workspaceId) ||
    (input.mandate.workspaceId !== undefined && input.envelope.workspaceId !== input.mandate.workspaceId)
  ) {
    return refuse("authority.workspace_mismatch", "Operation envelope and mandate do not bind the same workspace context.", {
      mandate: input.mandate,
    });
  }
  if (input.envelope.agreementRevision !== input.agreement.revision || input.envelope.mandateId !== input.mandate.id) {
    return refuse("authority.envelope_mismatch", "Operation envelope does not bind the current agreement revision and mandate.", { mandate: input.mandate });
  }
  if (
    input.envelope.principalId !== input.mandate.principalId ||
    input.envelope.partyId !== input.mandate.partyId ||
    input.envelope.trustAnchor !== input.mandate.trustAnchor ||
    input.envelope.trustAnchor !== input.agreement.revision
  ) {
    return refuse("authority.envelope_mismatch", "Operation envelope does not bind the mandate principal, party, and trust anchor.", {
      mandate: input.mandate,
    });
  }
  if (!ceiling.ok) {
    return { ok: false, reasonCode: ceiling.reasonCode, reason: ceiling.reason, grant: ceiling.grant, mandate: input.mandate };
  }
  const readiness = evaluateCapabilityReadiness({
    grant: input.grant ?? ceiling.grant,
    cache: input.cache,
    provisioning: input.provisioning,
    independentVerification: input.independentVerification,
    acquisitionCompleted: input.acquisitionCompleted,
  });
  if (!readiness.ready) {
    return { ok: false, reasonCode: readiness.reasonCode, reason: readiness.reason, grant: ceiling.grant, mandate: input.mandate, readiness };
  }
  return {
    ok: true,
    reasonCode: ceiling.reasonCode,
    reason: ceiling.reason,
    grant: ceiling.grant,
    mandate: input.mandate,
    envelope: input.envelope,
    readiness,
  };
}
