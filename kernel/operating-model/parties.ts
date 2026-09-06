export const partyKinds = ["founder", "operator", "b2c", "collaborator"] as const;
export type PartyKind = (typeof partyKinds)[number];

export interface Party {
  id: string;
  kind: PartyKind;
  displayName: string;
}

export const FOUNDER_PARTY_ID = "party.founder";
export const B2C_APP_BUILDER_PARTY_ID = "party.b2c-app-builder";

export function founderParty(): Party {
  return { id: FOUNDER_PARTY_ID, kind: "founder", displayName: "Founder" };
}

export function b2cAppBuilderParty(): Party {
  return { id: B2C_APP_BUILDER_PARTY_ID, kind: "b2c", displayName: "B2C App Builder" };
}

export function isPartyKind(value: string): value is PartyKind {
  return (partyKinds as readonly string[]).includes(value);
}
