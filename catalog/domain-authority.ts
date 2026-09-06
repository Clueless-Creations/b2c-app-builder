import { findDomainAuthority, type DomainAuthorityRecord } from "../kernel/schema/domain-authority.js";
import { businessUnitDomains, grantableDomainIds, type BaseGrantableDomainId, type BusinessUnit } from "../kernel/schema/types.js";
import { machineCatalogDomainId, systemCatalogDomainIds, type CatalogDomain } from "./types.js";

const operatorGroupByDomain: Record<BaseGrantableDomainId, BusinessUnit> = Object.fromEntries(
  Object.entries(businessUnitDomains).flatMap(([unit, domainIds]) => domainIds.map((domainId) => [domainId, unit as BusinessUnit])),
) as Record<BaseGrantableDomainId, BusinessUnit>;

/**
 * Resolve catalog-owned domain authority (KTD4). Explicit flags win. Base-catalog ids that omit
 * flags keep their kernel defaults so existing domain records stay compatible. A pack-added
 * domain without grantable or system is not grantable and is not a runtime domain.
 */
export function resolveDomainAuthority(domain: CatalogDomain): DomainAuthorityRecord {
  const machine = domain.machine === true || (domain.machine !== false && domain.id === machineCatalogDomainId);
  const system = domain.system === true || (domain.system !== false && (systemCatalogDomainIds as readonly string[]).includes(domain.id));
  const baseGrantable = (grantableDomainIds as readonly string[]).includes(domain.id);
  const grantable = machine || system ? false : domain.grantable === true || (domain.grantable !== false && baseGrantable);
  const operatorGroup = domain.operatorGroup ?? (grantable ? operatorGroupByDomain[domain.id as BaseGrantableDomainId] : undefined);
  return {
    id: domain.id,
    grantable,
    system,
    machine,
    ...(operatorGroup ? { operatorGroup } : {}),
    aliases: domain.aliases ?? [],
    protectedCategories: domain.protectedCategories ?? [],
  };
}

export function resolveCatalogAuthority(domains: readonly CatalogDomain[]): DomainAuthorityRecord[] {
  return domains.map(resolveDomainAuthority);
}

export function domainAuthorityFor(domains: readonly CatalogDomain[], domainId: string): DomainAuthorityRecord | undefined {
  const resolved = resolveCatalogAuthority(domains);
  return findDomainAuthority(resolved, domainId) ?? resolved.find((record) => record.id === domainId);
}
