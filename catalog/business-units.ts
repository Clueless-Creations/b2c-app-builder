import { businessUnitDomains, grantableDomainIds, type BaseGrantableDomainId, type BusinessUnit } from "../kernel/schema/types.js";

/**
 * Business-unit copy mapping (KTD3). Single source: kernel/schema/types.ts's
 * businessUnitDomains is the one place this many-to-one grouping is defined — catalog/
 * derives the reverse lookup from it rather than maintaining a second copy that could
 * silently diverge (see the duplicated-helpers-have-already-diverged lesson).
 */

/** Reverse of businessUnitDomains: every base grantable domain maps to exactly one business unit. */
export const domainBusinessUnit: Record<BaseGrantableDomainId, BusinessUnit> = Object.fromEntries(
  Object.entries(businessUnitDomains).flatMap(([unit, domainIds]) => domainIds.map((domainId) => [domainId, unit as BusinessUnit])),
) as Record<BaseGrantableDomainId, BusinessUnit>;

/** Every base grantable domain must appear in exactly one business unit — checked by catalog/validate.ts against the live schema export, not re-asserted as a separate literal. */
export function businessUnitCoversAllGrantableDomains(): boolean {
  return grantableDomainIds.every((domainId) => domainId in domainBusinessUnit);
}
