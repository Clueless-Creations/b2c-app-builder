import { FOUNDER_PARTY_ID } from "./parties.js";
import { FOUNDER_AGREEMENT_REVISION, type OperatingAgreement } from "./agreements.js";

export const mandateStatuses = ["active", "revoked"] as const;
export type MandateStatus = (typeof mandateStatuses)[number];

export interface Mandate {
  id: string;
  partyId: string;
  principalId: string;
  trustAnchor: string;
  agreementRevision: string;
  domainId: string;
  actionClass: string;
  status: MandateStatus;
  issuedAt: string;
  revokedAt?: string;
}

export function standingFounderMandate(agreement: OperatingAgreement, domainId: string, actionClass: string, issuedAt: string): Mandate {
  return {
    id: `mandate.founder.${domainId}.${actionClass}`,
    partyId: FOUNDER_PARTY_ID,
    principalId: "principal.founder-session",
    trustAnchor: agreement.revision,
    agreementRevision: agreement.revision,
    domainId,
    actionClass,
    status: "active",
    issuedAt,
  };
}

/** True when `stamp` is at or before `now` as parsed instants. Unparseable `now` fails closed. */
export function isStampNotAfter(stamp: string, now: string): boolean {
  const stampMs = Date.parse(stamp);
  const nowMs = Date.parse(now);
  if (Number.isFinite(stampMs) && Number.isFinite(nowMs)) return stampMs <= nowMs;
  if (Number.isFinite(stampMs) && now.length > 0 && !Number.isFinite(nowMs)) return true;
  return stamp <= now;
}

export function isMandateCurrent(mandate: Mandate | undefined, now: string): mandate is Mandate {
  if (!mandate) return false;
  if (mandate.status === "revoked") return false;
  if (mandate.revokedAt && isStampNotAfter(mandate.revokedAt, now)) return false;
  if (now) {
    const issuedAtMs = Date.parse(mandate.issuedAt);
    const nowMs = Date.parse(now);
    if (Number.isFinite(issuedAtMs) && Number.isFinite(nowMs) && issuedAtMs > nowMs) return false;
    if (Number.isFinite(issuedAtMs) && now.length > 0 && !Number.isFinite(nowMs)) return false;
  }
  return mandate.status === "active";
}

export function revokeMandate(mandate: Mandate, revokedAt: string): Mandate {
  return { ...mandate, status: "revoked", revokedAt };
}

export function mandateMatches(mandate: Mandate, domainId: string, actionClass: string): boolean {
  return mandate.domainId === domainId && mandate.actionClass === actionClass && mandate.agreementRevision.length > 0;
}

export function defaultFounderMandateFor(domainId: string, actionClass: string, now: string): Mandate {
  return {
    id: `mandate.founder.${domainId}.${actionClass}`,
    partyId: FOUNDER_PARTY_ID,
    principalId: "principal.founder-session",
    trustAnchor: FOUNDER_AGREEMENT_REVISION,
    agreementRevision: FOUNDER_AGREEMENT_REVISION,
    domainId,
    actionClass,
    status: "active",
    issuedAt: now,
  };
}
