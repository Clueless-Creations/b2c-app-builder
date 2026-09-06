import type { BusinessUnit, ProtectedCategory } from "./types.js";

/**
 * Catalog-composed domain authority (KTD4). Grants, budgets, and the catalog bridge read this
 * table instead of a kernel-only domain union. Unknown ids fail closed.
 */
export interface DomainAuthorityRecord {
  readonly id: string;
  readonly grantable: boolean;
  readonly system: boolean;
  readonly machine: boolean;
  readonly operatorGroup?: BusinessUnit;
  readonly aliases: readonly string[];
  readonly protectedCategories: readonly ProtectedCategory[];
}

export function findDomainAuthority(
  records: readonly DomainAuthorityRecord[] | undefined,
  domainId: string,
): DomainAuthorityRecord | undefined {
  return records?.find((record) => record.id === domainId || record.aliases.includes(domainId));
}
