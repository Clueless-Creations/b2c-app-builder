import { mapIdentity, normalizeAmountEvents, type AmountEvent } from "../../../kernel/operating-model/measurement.js";
import type { IdentityMapping, SubjectReference } from "../../../kernel/operating-model/types.js";

/** Provider-boundary normalization. No identity table or second measurement store is created. */
export function normalizeSuperwallRevenueCatObservation(input: {
  assignmentOwner: "superwall";
  entitlementAuthority: "revenuecat";
  exposure: { assignmentId: string; subject: SubjectReference; observedAt: string };
  identifiedSubject: SubjectReference;
  identityJoin?: IdentityMapping;
  amountEvents: readonly AmountEvent[];
}) {
  if (input.assignmentOwner !== "superwall" || input.entitlementAuthority !== "revenuecat") throw new Error("monetization.competing_authority");
  if (!input.exposure.assignmentId.trim() || !Number.isFinite(Date.parse(input.exposure.observedAt))) throw new Error("monetization.exposure_missing");
  const same = (a: SubjectReference, b: SubjectReference) => a.appId === b.appId && a.environment === b.environment && a.opaqueRef === b.opaqueRef;
  for (const subject of [input.exposure.subject, input.identifiedSubject]) {
    if (!subject.appId.trim() || !subject.environment.trim() || !subject.opaqueRef.trim()) throw new Error("monetization.identity_invalid");
  }
  if (
    input.identityJoin &&
    (!same(input.identityJoin.from, input.exposure.subject) ||
      !same(input.identityJoin.to, input.identifiedSubject) ||
      mapIdentity(input.identityJoin).status !== "mapped")
  )
    throw new Error("monetization.identity_join_missing_or_refused");
  if (!same(input.exposure.subject, input.identifiedSubject)) {
    const join = input.identityJoin;
    if (!join || !same(join.from, input.exposure.subject) || !same(join.to, input.identifiedSubject) || mapIdentity(join).status !== "mapped")
      throw new Error("monetization.identity_join_missing_or_refused");
  }
  const amounts = normalizeAmountEvents(input.amountEvents);
  return {
    subjectRef: input.identifiedSubject,
    exposureSubjectRef: input.exposure.subject,
    assignmentId: input.exposure.assignmentId,
    assignmentOwner: input.assignmentOwner,
    entitlementAuthority: input.entitlementAuthority,
    amounts,
    providerProof: "not_observed" as const,
  };
}
