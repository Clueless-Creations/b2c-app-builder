import { FOUNDER_PARTY_ID, B2C_APP_BUILDER_PARTY_ID, type Party } from "./parties.js";

export interface OperatingAgreement {
  id: string;
  revision: string;
  recordedAt: string;
  parties: Party[];
  responsibilities: readonly string[];
  constraints: readonly string[];
  escalation: string;
}

export const FOUNDER_AGREEMENT_ID = "agreement.founder-standing";
export const FOUNDER_AGREEMENT_REVISION = "agreement.founder-standing.rev-1";

export function standingFounderAgreement(recordedAt: string): OperatingAgreement {
  return {
    id: FOUNDER_AGREEMENT_ID,
    revision: FOUNDER_AGREEMENT_REVISION,
    recordedAt,
    parties: [
      { id: FOUNDER_PARTY_ID, kind: "founder", displayName: "Founder" },
      { id: B2C_APP_BUILDER_PARTY_ID, kind: "b2c", displayName: "B2C App Builder" },
    ],
    responsibilities: ["The founder authorizes B2C App Builder through grants, waivers, and this standing agreement."],
    constraints: ["Credentials do not grant authority.", "Revocation is future-facing and rechecked at effect time."],
    escalation: "Founder-only gates remain founder-only.",
  };
}
