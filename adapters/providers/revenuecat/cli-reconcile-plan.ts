/**
 * Desired-state comparison and repair planning for a selected RevenueCat catalog.
 *
 * This is the reconciler: accepted desired offerings/products/entitlements/packages
 * versus canonical observations, emitting the smallest create/attach/no-op/conflict
 * plan. It does not encode CLI argv, spawn a process, read JSON envelopes, or mutate
 * a remote account. Encoder (#101 / PR 121), decoder (#102 / PR 130), durability
 * ledger (#104 / PR 135), and the mutating catalog session remain their owners.
 *
 * Protocol validity is not business completeness. Opaque provider-qualified remote
 * ids are preserved and never invented. Missing product/entitlement/package never
 * collapses into offering create.
 */

import { getRevenueCatCliOperation } from "./cli-operations.js";

export const REVENUECAT_CATALOG_PLAN_PIN = {
  tag: "v0.1.1",
  commit: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  npmPackage: "@revenuecat/cli",
  npmVersion: "0.1.1",
} as const;

/**
 * Mirrors the pinned cobra `--type` enum owned by #101 (`cli-command-schema.ts`).
 * This file must not import that module while encoding work is in-flight.
 */
export const REVENUECAT_PLAN_PRODUCT_TYPES = [
  "subscription",
  "consumable",
  "non_consumable",
  "one_time",
  "non_renewing_subscription",
] as const;
export type RevenueCatPlanProductType = (typeof REVENUECAT_PLAN_PRODUCT_TYPES)[number];

/**
 * Canonical repair verbs from the reviewed CLI operation matrix (#101). These are
 * builder operation ids, not native flags. `rc.catalog.create` is offerings create
 * only; it is never a stand-in for product, entitlement, or package repair.
 */
export const REVENUECAT_REPAIR_OPERATIONS = {
  offeringCreate: "rc.catalog.create",
  productCreate: "rc.products.create",
  entitlementCreate: "rc.entitlements.create",
  packageCreate: "rc.packages.create",
  entitlementAttach: "rc.entitlements.attach",
  packageAttach: "rc.packages.attach",
} as const;

export type RevenueCatRepairOperationId = (typeof REVENUECAT_REPAIR_OPERATIONS)[keyof typeof REVENUECAT_REPAIR_OPERATIONS];

export type CatalogCollectionName = "offerings" | "products" | "entitlements" | "packages";
export type CollectionCoverage = "complete" | "partial" | "unknown" | "invalid";
export type RepairActionKind = "create" | "attach" | "no-op" | "conflict" | "hold" | "extra";
export type RepairEntityKind = "offering" | "product" | "entitlement" | "package" | "entitlement-product" | "package-product";
export type RepairReasonCode =
  | "missing-entity"
  | "missing-relationship"
  | "unknown-coverage"
  | "invalid-observation"
  | "identity-mismatch"
  | "type-mismatch"
  | "price-mismatch"
  | "relationship-mismatch"
  | "ambiguous-identity"
  | "unsupported-set-current"
  | "missing-lookup-key"
  | "extra-remote"
  | "unsupported-operation"
  | "matched";

export interface RevenueCatOpaqueRef {
  readonly provider: "revenuecat";
  readonly resource: "offering" | "product" | "entitlement" | "package";
  readonly remoteId: string;
}

export interface DesiredPrice {
  readonly currency: string;
  readonly amountMicros: number;
}

export interface DesiredProduct {
  readonly storeIdentifier: string;
  readonly type: RevenueCatPlanProductType;
  readonly appId: string;
  readonly displayName?: string;
  readonly duration?: string;
  readonly remoteId?: string;
  readonly price?: DesiredPrice;
}

export interface DesiredOffering {
  readonly lookupKey: string;
  readonly displayName: string;
  readonly isCurrent?: boolean;
  readonly remoteId?: string;
}

export interface DesiredEntitlement {
  readonly lookupKey: string;
  readonly displayName: string;
  readonly productStoreIdentifiers: readonly string[];
  readonly remoteId?: string;
}

export interface DesiredPackage {
  readonly lookupKey: string;
  readonly displayName: string;
  readonly offeringLookupKey: string;
  readonly productStoreIdentifiers: readonly string[];
  readonly remoteId?: string;
}

export interface DesiredRevenueCatCatalog {
  readonly projectId: string;
  readonly appId: string;
  readonly offering?: DesiredOffering;
  readonly products: readonly DesiredProduct[];
  readonly entitlements: readonly DesiredEntitlement[];
  readonly packages: readonly DesiredPackage[];
}

export interface ObservedPrice {
  readonly currency: string;
  readonly amountMicros: number;
}

export interface ObservedProductAttachment {
  readonly productRemoteId: string | null;
  readonly storeIdentifier: string | null;
  readonly prices: readonly ObservedPrice[];
}

export interface ObservedOffering {
  readonly remoteId: string | null;
  readonly lookupKey: string | null;
  readonly displayName: string | null;
  readonly isCurrent: boolean | null;
}

export interface ObservedProduct {
  readonly remoteId: string | null;
  readonly storeIdentifier: string | null;
  readonly type: string | null;
  readonly appId: string | null;
  readonly displayName: string | null;
}

export interface ObservedEntitlement {
  readonly remoteId: string | null;
  readonly lookupKey: string | null;
  readonly attachments: readonly ObservedProductAttachment[];
}

export interface ObservedPackage {
  readonly remoteId: string | null;
  readonly lookupKey: string | null;
  readonly offeringRemoteId: string | null;
  readonly offeringLookupKey: string | null;
  readonly attachments: readonly ObservedProductAttachment[];
}

export interface ObservedCollection<T> {
  readonly coverage: CollectionCoverage;
  readonly protocolValid: boolean;
  readonly items: readonly T[];
}

export interface ObservedRevenueCatCatalog {
  readonly projectId?: string;
  readonly appId?: string;
  readonly offerings: ObservedCollection<ObservedOffering>;
  readonly products: ObservedCollection<ObservedProduct>;
  readonly entitlements: ObservedCollection<ObservedEntitlement>;
  readonly packages: ObservedCollection<ObservedPackage>;
}

export interface RepairCreateInputs {
  readonly lookupKey?: string;
  readonly displayName?: string;
  readonly storeIdentifier?: string;
  readonly productType?: RevenueCatPlanProductType;
  readonly appId?: string;
  readonly duration?: string;
  readonly offeringRemoteId?: string | null;
}

export interface RevenueCatRepairAction {
  readonly kind: RepairActionKind;
  readonly entity: RepairEntityKind;
  readonly businessKey: string;
  readonly reason: RepairReasonCode;
  readonly operationId: RevenueCatRepairOperationId | null;
  readonly remoteRef: RevenueCatOpaqueRef | null;
  readonly createInputs?: RepairCreateInputs;
  readonly attach?: {
    readonly parentRemoteId: string | null;
    readonly productRemoteIds: readonly (string | null)[];
    readonly productStoreIdentifiers: readonly string[];
  };
  readonly dependsOn: readonly string[];
  readonly message: string;
}

export interface CollectionHold {
  readonly collection: CatalogCollectionName;
  readonly coverage: CollectionCoverage;
  readonly protocolValid: boolean;
  readonly reason: Extract<RepairReasonCode, "unknown-coverage" | "invalid-observation">;
}

export interface RevenueCatCatalogRepairPlan {
  readonly complete: boolean;
  readonly reconciled: boolean;
  readonly protocolValid: boolean;
  readonly coverageComplete: boolean;
  readonly collectionHolds: readonly CollectionHold[];
  readonly actions: readonly RevenueCatRepairAction[];
  readonly operationIds: readonly string[];
}

type EntityResolution =
  | { readonly state: "present"; readonly remoteId: string; readonly lookupKey: string | null; readonly storeIdentifier?: string | null }
  | { readonly state: "create"; readonly businessKey: string }
  | { readonly state: "hold" }
  | { readonly state: "conflict" };

function actionId(kind: RepairActionKind, entity: RepairEntityKind, businessKey: string): string {
  return `${kind}:${entity}:${businessKey}`;
}

function opaqueRef(resource: RevenueCatOpaqueRef["resource"], remoteId: string): RevenueCatOpaqueRef {
  return { provider: "revenuecat", resource, remoteId };
}

function knownRepairOperation(operationId: RevenueCatRepairOperationId): RevenueCatRepairOperationId | null {
  const spec = getRevenueCatCliOperation(operationId);
  if (!spec || spec.support !== "implemented-fixture") return null;
  return operationId;
}

function collectionHoldFor(
  name: CatalogCollectionName,
  collection: ObservedCollection<unknown>,
): CollectionHold | null {
  if (!collection.protocolValid) {
    return { collection: name, coverage: collection.coverage, protocolValid: false, reason: "invalid-observation" };
  }
  if (collection.coverage !== "complete") {
    return { collection: name, coverage: collection.coverage, protocolValid: collection.protocolValid, reason: "unknown-coverage" };
  }
  return null;
}

function coverageBlocksCreate(collection: ObservedCollection<unknown>): boolean {
  return !collection.protocolValid || collection.coverage !== "complete";
}

function lookupHits<T extends { readonly lookupKey: string | null; readonly remoteId: string | null }>(
  items: readonly T[],
  lookupKey: string,
): { readonly matches: readonly T[]; readonly remoteIdEqualsLookup: readonly T[] } {
  return {
    matches: items.filter((item) => item.lookupKey === lookupKey),
    remoteIdEqualsLookup: items.filter((item) => item.lookupKey !== lookupKey && item.remoteId === lookupKey),
  };
}

function storeHits(items: readonly ObservedProduct[], storeIdentifier: string, appId: string): readonly ObservedProduct[] {
  return items.filter((item) => item.storeIdentifier === storeIdentifier && (item.appId === null || item.appId === appId));
}

function pricesMatch(expected: DesiredPrice | undefined, observed: readonly ObservedPrice[]): boolean {
  if (!expected) return true;
  return observed.some((price) => price.currency === expected.currency && price.amountMicros === expected.amountMicros);
}

function sortActions(actions: readonly RevenueCatRepairAction[]): RevenueCatRepairAction[] {
  const kindOrder: Record<RepairActionKind, number> = {
    hold: 0,
    conflict: 1,
    create: 2,
    attach: 3,
    "no-op": 4,
    extra: 5,
  };
  const entityOrder: Record<RepairEntityKind, number> = {
    offering: 0,
    product: 1,
    entitlement: 2,
    package: 3,
    "entitlement-product": 4,
    "package-product": 5,
  };
  return [...actions].sort((left, right) => {
    const kindDelta = kindOrder[left.kind] - kindOrder[right.kind];
    if (kindDelta !== 0) return kindDelta;
    const entityDelta = entityOrder[left.entity] - entityOrder[right.entity];
    if (entityDelta !== 0) return entityDelta;
    return left.businessKey.localeCompare(right.businessKey);
  });
}

function uniqueOperationIds(actions: readonly RevenueCatRepairAction[]): readonly string[] {
  const ids: string[] = [];
  for (const action of actions) {
    if (action.operationId && (action.kind === "create" || action.kind === "attach") && !ids.includes(action.operationId)) {
      ids.push(action.operationId);
    }
  }
  return ids;
}

export function repairPlanIsComplete(plan: RevenueCatCatalogRepairPlan): boolean {
  return plan.complete && plan.reconciled;
}

export function repairPlanOperationIds(plan: RevenueCatCatalogRepairPlan): readonly string[] {
  return plan.operationIds;
}

export function planRevenueCatCatalogRepair(
  desired: DesiredRevenueCatCatalog,
  observed: ObservedRevenueCatCatalog,
): RevenueCatCatalogRepairPlan {
  const actions: RevenueCatRepairAction[] = [];
  const collectionHolds: CollectionHold[] = [];
  const requiredCollections: CatalogCollectionName[] = ["offerings", "products", "entitlements", "packages"];
  for (const name of requiredCollections) {
    const hold = collectionHoldFor(name, observed[name]);
    if (hold) collectionHolds.push(hold);
  }

  if (observed.projectId && observed.projectId !== desired.projectId) {
    actions.push({
      kind: "conflict",
      entity: "offering",
      businessKey: desired.projectId,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: "Observed project id does not match the selected project. Remote ids stay opaque and are not rewritten.",
    });
  }
  if (observed.appId && observed.appId !== desired.appId) {
    actions.push({
      kind: "conflict",
      entity: "product",
      businessKey: desired.appId,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: "Observed app id does not match the selected app. Remote ids stay opaque and are not rewritten.",
    });
  }

  const offeringResolution = desired.offering
    ? planOffering(desired.offering, observed.offerings, actions)
    : { state: "hold" as const };
  const productResolutions = new Map<string, EntityResolution>();
  for (const product of desired.products) {
    productResolutions.set(product.storeIdentifier, planProduct(product, observed.products, actions));
  }
  const entitlementResolutions = new Map<string, EntityResolution>();
  for (const entitlement of desired.entitlements) {
    entitlementResolutions.set(entitlement.lookupKey, planEntitlement(entitlement, observed.entitlements, actions));
  }
  const packageResolutions = new Map<string, EntityResolution>();
  for (const catalogPackage of desired.packages) {
    packageResolutions.set(
      catalogPackage.lookupKey,
      planPackage(catalogPackage, observed.packages, offeringResolution, actions),
    );
  }

  for (const entitlement of desired.entitlements) {
    planEntitlementAttachments(entitlement, observed.entitlements, entitlementResolutions, productResolutions, actions);
  }
  for (const catalogPackage of desired.packages) {
    planPackageAttachments(catalogPackage, desired.products, observed.packages, packageResolutions, productResolutions, actions);
  }

  emitExtras(desired, observed, actions);

  const sorted = sortActions(actions);
  const protocolValid =
    observed.offerings.protocolValid &&
    observed.products.protocolValid &&
    observed.entitlements.protocolValid &&
    observed.packages.protocolValid;
  const coverageComplete = collectionHolds.length === 0;
  const blocking = sorted.some((action) => {
    switch (action.kind) {
      case "create":
      case "attach":
      case "conflict":
      case "hold":
        return true;
      case "no-op":
      case "extra":
        return false;
      default: {
        const exhaustive: never = action.kind;
        return exhaustive;
      }
    }
  });
  const complete = protocolValid && coverageComplete && !blocking;
  return {
    complete,
    reconciled: complete,
    protocolValid,
    coverageComplete,
    collectionHolds,
    actions: sorted,
    operationIds: uniqueOperationIds(sorted),
  };
}

function planOffering(
  desired: DesiredOffering,
  collection: ObservedCollection<ObservedOffering>,
  actions: RevenueCatRepairAction[],
): EntityResolution {
  const hits = lookupHits(collection.items, desired.lookupKey);
  if (hits.matches.length > 1) {
    actions.push({
      kind: "conflict",
      entity: "offering",
      businessKey: desired.lookupKey,
      reason: "ambiguous-identity",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: `Multiple remote offerings share lookup_key ${desired.lookupKey}. An unknown page is not permission to create another.`,
    });
    return { state: "conflict" };
  }
  if (hits.matches.length === 0 && hits.remoteIdEqualsLookup.length > 0) {
    const remoteId = hits.remoteIdEqualsLookup[0]?.remoteId;
    actions.push({
      kind: "conflict",
      entity: "offering",
      businessKey: desired.lookupKey,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: remoteId ? opaqueRef("offering", remoteId) : null,
      dependsOn: [],
      message: "Desired offering lookup_key equals a remote id. lookup_key and id stay distinct; this is not a match and not an offering create.",
    });
    return { state: "conflict" };
  }
  const match = hits.matches[0];
  if (!match) {
    if (coverageBlocksCreate(collection)) {
      actions.push({
        kind: "hold",
        entity: "offering",
        businessKey: desired.lookupKey,
        reason: collection.protocolValid ? "unknown-coverage" : "invalid-observation",
        operationId: null,
        remoteRef: null,
        dependsOn: [],
        message: "Offering absence is unproven while offering collection coverage is incomplete or invalid. Duplicate create is refused.",
      });
      return { state: "hold" };
    }
    const operationId = knownRepairOperation(REVENUECAT_REPAIR_OPERATIONS.offeringCreate);
    actions.push({
      kind: operationId ? "create" : "conflict",
      entity: "offering",
      businessKey: desired.lookupKey,
      reason: operationId ? "missing-entity" : "unsupported-operation",
      operationId,
      remoteRef: null,
      createInputs: { lookupKey: desired.lookupKey, displayName: desired.displayName },
      dependsOn: [],
      message: operationId
        ? "Offering lookup_key is missing after a complete read. Create uses lookup-key and display-name, not a server id."
        : "Offering create is not an implemented repair.",
    });
    return { state: "create", businessKey: desired.lookupKey };
  }
  if (!match.remoteId) {
    actions.push({
      kind: "hold",
      entity: "offering",
      businessKey: desired.lookupKey,
      reason: "missing-lookup-key",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: "Offering lookup_key matched an observation without a remote id. The planner will not invent one.",
    });
    return { state: "hold" };
  }
  if (desired.remoteId && match.remoteId !== desired.remoteId) {
    actions.push({
      kind: "conflict",
      entity: "offering",
      businessKey: desired.lookupKey,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: opaqueRef("offering", match.remoteId),
      dependsOn: [],
      message: "Offering lookup_key matched a different opaque remote id than the desired one.",
    });
    return { state: "conflict" };
  }
  if (desired.isCurrent !== undefined && match.isCurrent !== null && match.isCurrent !== desired.isCurrent) {
    actions.push({
      kind: "conflict",
      entity: "offering",
      businessKey: desired.lookupKey,
      reason: "unsupported-set-current",
      operationId: null,
      remoteRef: opaqueRef("offering", match.remoteId),
      dependsOn: [],
      message: "Current-offering drift requires offerings set-current, which stays excluded. Offering create is not a substitute.",
    });
    return { state: "conflict" };
  }
  actions.push({
    kind: "no-op",
    entity: "offering",
    businessKey: desired.lookupKey,
    reason: "matched",
    operationId: null,
    remoteRef: opaqueRef("offering", match.remoteId),
    dependsOn: [],
    message: "Expected offering lookup_key is present. Reuse the opaque remote id.",
  });
  return { state: "present", remoteId: match.remoteId, lookupKey: match.lookupKey };
}

function planProduct(
  desired: DesiredProduct,
  collection: ObservedCollection<ObservedProduct>,
  actions: RevenueCatRepairAction[],
): EntityResolution {
  const hits = storeHits(collection.items, desired.storeIdentifier, desired.appId);
  const confused = collection.items.filter(
    (item) => item.storeIdentifier !== desired.storeIdentifier && item.remoteId === desired.storeIdentifier,
  );
  if (hits.length > 1) {
    actions.push({
      kind: "conflict",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: "ambiguous-identity",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: `Multiple remote products share store_identifier ${desired.storeIdentifier}. Coverage must be reconciled before create.`,
    });
    return { state: "conflict" };
  }
  if (hits.length === 0 && confused.length > 0) {
    const remoteId = confused[0]?.remoteId;
    actions.push({
      kind: "conflict",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: remoteId ? opaqueRef("product", remoteId) : null,
      dependsOn: [],
      message: "Desired store_identifier equals a product remote id. store_identifier and id stay distinct.",
    });
    return { state: "conflict" };
  }
  const match = hits[0];
  if (!match) {
    if (coverageBlocksCreate(collection)) {
      actions.push({
        kind: "hold",
        entity: "product",
        businessKey: desired.storeIdentifier,
        reason: collection.protocolValid ? "unknown-coverage" : "invalid-observation",
        operationId: null,
        remoteRef: null,
        dependsOn: [],
        message: "Product absence is unproven while product collection coverage is incomplete or invalid. Offering create is not a substitute.",
      });
      return { state: "hold" };
    }
    const operationId = knownRepairOperation(REVENUECAT_REPAIR_OPERATIONS.productCreate);
    actions.push({
      kind: operationId ? "create" : "conflict",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: operationId ? "missing-entity" : "unsupported-operation",
      operationId,
      remoteRef: null,
      createInputs: {
        storeIdentifier: desired.storeIdentifier,
        productType: desired.type,
        appId: desired.appId,
        displayName: desired.displayName,
        duration: desired.duration,
      },
      dependsOn: [],
      message: operationId
        ? "Product store_identifier is missing after a complete read. Repair is products create, not offerings create."
        : "Product create is not an implemented repair.",
    });
    return { state: "create", businessKey: desired.storeIdentifier };
  }
  if (!match.remoteId) {
    actions.push({
      kind: "hold",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: "missing-lookup-key",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: "Product store_identifier matched an observation without a remote id. The planner will not invent one.",
    });
    return { state: "hold" };
  }
  if (desired.remoteId && match.remoteId !== desired.remoteId) {
    actions.push({
      kind: "conflict",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: opaqueRef("product", match.remoteId),
      dependsOn: [],
      message: "Product store_identifier matched a different opaque remote id than the desired one.",
    });
    return { state: "conflict" };
  }
  if (match.type && match.type !== desired.type) {
    actions.push({
      kind: "conflict",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: "type-mismatch",
      operationId: null,
      remoteRef: opaqueRef("product", match.remoteId),
      dependsOn: [],
      message: "Observed product type differs from the desired type. Product update is not implemented; offering create is not a repair.",
    });
    return { state: "conflict" };
  }
  if (match.appId && match.appId !== desired.appId) {
    actions.push({
      kind: "conflict",
      entity: "product",
      businessKey: desired.storeIdentifier,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: opaqueRef("product", match.remoteId),
      dependsOn: [],
      message: "Observed product app_id differs from the selected app.",
    });
    return { state: "conflict" };
  }
  actions.push({
    kind: "no-op",
    entity: "product",
    businessKey: desired.storeIdentifier,
    reason: "matched",
    operationId: null,
    remoteRef: opaqueRef("product", match.remoteId),
    dependsOn: [],
    message: "Expected product store_identifier is present. Reuse the opaque remote id.",
  });
  return { state: "present", remoteId: match.remoteId, lookupKey: match.storeIdentifier, storeIdentifier: match.storeIdentifier };
}

function planEntitlement(
  desired: DesiredEntitlement,
  collection: ObservedCollection<ObservedEntitlement>,
  actions: RevenueCatRepairAction[],
): EntityResolution {
  const hits = lookupHits(collection.items, desired.lookupKey);
  if (hits.matches.length > 1) {
    actions.push({
      kind: "conflict",
      entity: "entitlement",
      businessKey: desired.lookupKey,
      reason: "ambiguous-identity",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: `Multiple remote entitlements share lookup_key ${desired.lookupKey}.`,
    });
    return { state: "conflict" };
  }
  if (hits.matches.length === 0 && hits.remoteIdEqualsLookup.length > 0) {
    const remoteId = hits.remoteIdEqualsLookup[0]?.remoteId;
    actions.push({
      kind: "conflict",
      entity: "entitlement",
      businessKey: desired.lookupKey,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: remoteId ? opaqueRef("entitlement", remoteId) : null,
      dependsOn: [],
      message: "Desired entitlement lookup_key equals a remote id. lookup_key and id stay distinct.",
    });
    return { state: "conflict" };
  }
  const match = hits.matches[0];
  if (!match) {
    if (coverageBlocksCreate(collection)) {
      actions.push({
        kind: "hold",
        entity: "entitlement",
        businessKey: desired.lookupKey,
        reason: collection.protocolValid ? "unknown-coverage" : "invalid-observation",
        operationId: null,
        remoteRef: null,
        dependsOn: [],
        message: "Entitlement absence is unproven while entitlement coverage is incomplete or invalid. Offering create is not a substitute.",
      });
      return { state: "hold" };
    }
    const operationId = knownRepairOperation(REVENUECAT_REPAIR_OPERATIONS.entitlementCreate);
    actions.push({
      kind: operationId ? "create" : "conflict",
      entity: "entitlement",
      businessKey: desired.lookupKey,
      reason: operationId ? "missing-entity" : "unsupported-operation",
      operationId,
      remoteRef: null,
      createInputs: { lookupKey: desired.lookupKey, displayName: desired.displayName },
      dependsOn: [],
      message: operationId
        ? "Entitlement lookup_key is missing after a complete read. Repair is entitlements create, not offerings create."
        : "Entitlement create is not an implemented repair.",
    });
    return { state: "create", businessKey: desired.lookupKey };
  }
  if (!match.remoteId) {
    actions.push({
      kind: "hold",
      entity: "entitlement",
      businessKey: desired.lookupKey,
      reason: "missing-lookup-key",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: "Entitlement lookup_key matched an observation without a remote id. The planner will not invent one.",
    });
    return { state: "hold" };
  }
  if (desired.remoteId && match.remoteId !== desired.remoteId) {
    actions.push({
      kind: "conflict",
      entity: "entitlement",
      businessKey: desired.lookupKey,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: opaqueRef("entitlement", match.remoteId),
      dependsOn: [],
      message: "Entitlement lookup_key matched a different opaque remote id than the desired one.",
    });
    return { state: "conflict" };
  }
  actions.push({
    kind: "no-op",
    entity: "entitlement",
    businessKey: desired.lookupKey,
    reason: "matched",
    operationId: null,
    remoteRef: opaqueRef("entitlement", match.remoteId),
    dependsOn: [],
    message: "Expected entitlement lookup_key is present. Reuse the opaque remote id.",
  });
  return { state: "present", remoteId: match.remoteId, lookupKey: match.lookupKey };
}

function planPackage(
  desired: DesiredPackage,
  collection: ObservedCollection<ObservedPackage>,
  offeringResolution: EntityResolution,
  actions: RevenueCatRepairAction[],
): EntityResolution {
  const hits = lookupHits(collection.items, desired.lookupKey);
  if (hits.matches.length > 1) {
    actions.push({
      kind: "conflict",
      entity: "package",
      businessKey: desired.lookupKey,
      reason: "ambiguous-identity",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: `Multiple remote packages share lookup_key ${desired.lookupKey}.`,
    });
    return { state: "conflict" };
  }
  if (hits.matches.length === 0 && hits.remoteIdEqualsLookup.length > 0) {
    const remoteId = hits.remoteIdEqualsLookup[0]?.remoteId;
    actions.push({
      kind: "conflict",
      entity: "package",
      businessKey: desired.lookupKey,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: remoteId ? opaqueRef("package", remoteId) : null,
      dependsOn: [],
      message: "Desired package lookup_key equals a remote id. lookup_key and id stay distinct.",
    });
    return { state: "conflict" };
  }
  const match = hits.matches[0];
  if (!match) {
    if (coverageBlocksCreate(collection)) {
      actions.push({
        kind: "hold",
        entity: "package",
        businessKey: desired.lookupKey,
        reason: collection.protocolValid ? "unknown-coverage" : "invalid-observation",
        operationId: null,
        remoteRef: null,
        dependsOn: [],
        message: "Package absence is unproven while package coverage is incomplete or invalid. Offering create is not a substitute.",
      });
      return { state: "hold" };
    }
    if (offeringResolution.state === "hold" || offeringResolution.state === "conflict") {
      actions.push({
        kind: "hold",
        entity: "package",
        businessKey: desired.lookupKey,
        reason: "unknown-coverage",
        operationId: null,
        remoteRef: null,
        dependsOn: [],
        message: "Package create waits until the parent offering identity is resolved. Offering create collapse is refused.",
      });
      return { state: "hold" };
    }
    const offeringRemoteId = offeringResolution.state === "present" ? offeringResolution.remoteId : null;
    const dependsOn = offeringResolution.state === "create" ? [actionId("create", "offering", desired.offeringLookupKey)] : [];
    const operationId = knownRepairOperation(REVENUECAT_REPAIR_OPERATIONS.packageCreate);
    actions.push({
      kind: operationId ? "create" : "conflict",
      entity: "package",
      businessKey: desired.lookupKey,
      reason: operationId ? "missing-entity" : "unsupported-operation",
      operationId,
      remoteRef: null,
      createInputs: {
        lookupKey: desired.lookupKey,
        displayName: desired.displayName,
        offeringRemoteId,
      },
      dependsOn,
      message: operationId
        ? "Package lookup_key is missing after a complete read. Repair is packages create on the offering remote id, not offerings create."
        : "Package create is not an implemented repair.",
    });
    return { state: "create", businessKey: desired.lookupKey };
  }
  if (!match.remoteId) {
    actions.push({
      kind: "hold",
      entity: "package",
      businessKey: desired.lookupKey,
      reason: "missing-lookup-key",
      operationId: null,
      remoteRef: null,
      dependsOn: [],
      message: "Package lookup_key matched an observation without a remote id. The planner will not invent one.",
    });
    return { state: "hold" };
  }
  if (desired.remoteId && match.remoteId !== desired.remoteId) {
    actions.push({
      kind: "conflict",
      entity: "package",
      businessKey: desired.lookupKey,
      reason: "identity-mismatch",
      operationId: null,
      remoteRef: opaqueRef("package", match.remoteId),
      dependsOn: [],
      message: "Package lookup_key matched a different opaque remote id than the desired one.",
    });
    return { state: "conflict" };
  }
  actions.push({
    kind: "no-op",
    entity: "package",
    businessKey: desired.lookupKey,
    reason: "matched",
    operationId: null,
    remoteRef: opaqueRef("package", match.remoteId),
    dependsOn: [],
    message: "Expected package lookup_key is present. Reuse the opaque remote id.",
  });
  return { state: "present", remoteId: match.remoteId, lookupKey: match.lookupKey };
}

function attachmentPresent(
  attachments: readonly ObservedProductAttachment[],
  product: EntityResolution,
  storeIdentifier: string,
): ObservedProductAttachment | null {
  for (const attachment of attachments) {
    if (product.state === "present" && product.remoteId && attachment.productRemoteId === product.remoteId) return attachment;
    if (attachment.storeIdentifier === storeIdentifier) return attachment;
  }
  return null;
}

function planEntitlementAttachments(
  desired: DesiredEntitlement,
  collection: ObservedCollection<ObservedEntitlement>,
  entitlementResolutions: ReadonlyMap<string, EntityResolution>,
  productResolutions: ReadonlyMap<string, EntityResolution>,
  actions: RevenueCatRepairAction[],
): void {
  const entitlement = entitlementResolutions.get(desired.lookupKey);
  if (!entitlement || entitlement.state === "hold" || entitlement.state === "conflict") return;
  const observed = collection.items.find((item) => item.lookupKey === desired.lookupKey);
  const attachments = observed?.attachments ?? [];
  const parentRemoteId = entitlement.state === "present" ? entitlement.remoteId : null;
  const dependsOn: string[] = [];
  if (entitlement.state === "create") dependsOn.push(actionId("create", "entitlement", desired.lookupKey));
  const missingStoreIds: string[] = [];
  const productRemoteIds: (string | null)[] = [];
  for (const storeIdentifier of desired.productStoreIdentifiers) {
    const product = productResolutions.get(storeIdentifier);
    if (!product || product.state === "hold" || product.state === "conflict") continue;
    if (product.state === "create") dependsOn.push(actionId("create", "product", storeIdentifier));
    const present = attachmentPresent(attachments, product, storeIdentifier);
    if (present) {
      actions.push({
        kind: "no-op",
        entity: "entitlement-product",
        businessKey: `${desired.lookupKey}:${storeIdentifier}`,
        reason: "matched",
        operationId: null,
        remoteRef: parentRemoteId ? opaqueRef("entitlement", parentRemoteId) : null,
        dependsOn: [],
        message: "Expected entitlement-to-product relationship is present.",
      });
      continue;
    }
    missingStoreIds.push(storeIdentifier);
    productRemoteIds.push(product.state === "present" ? product.remoteId : null);
  }
  if (missingStoreIds.length === 0) return;
  const operationId = knownRepairOperation(REVENUECAT_REPAIR_OPERATIONS.entitlementAttach);
  actions.push({
    kind: operationId ? "attach" : "conflict",
    entity: "entitlement-product",
    businessKey: `${desired.lookupKey}:${missingStoreIds.join(",")}`,
    reason: operationId ? "missing-relationship" : "unsupported-operation",
    operationId,
    remoteRef: parentRemoteId ? opaqueRef("entitlement", parentRemoteId) : null,
    attach: {
      parentRemoteId,
      productRemoteIds,
      productStoreIdentifiers: missingStoreIds,
    },
    dependsOn: [...new Set(dependsOn)],
    message: operationId
      ? "Expected entitlement-to-product relationship is missing. Attach uses observed remote ids and does not invent them."
      : "Entitlement attach is not an implemented repair.",
  });
}

function planPackageAttachments(
  desired: DesiredPackage,
  desiredProducts: readonly DesiredProduct[],
  collection: ObservedCollection<ObservedPackage>,
  packageResolutions: ReadonlyMap<string, EntityResolution>,
  productResolutions: ReadonlyMap<string, EntityResolution>,
  actions: RevenueCatRepairAction[],
): void {
  const catalogPackage = packageResolutions.get(desired.lookupKey);
  if (!catalogPackage || catalogPackage.state === "hold" || catalogPackage.state === "conflict") return;
  const observed = collection.items.find((item) => item.lookupKey === desired.lookupKey);
  const attachments = observed?.attachments ?? [];
  const parentRemoteId = catalogPackage.state === "present" ? catalogPackage.remoteId : null;
  const dependsOn: string[] = [];
  if (catalogPackage.state === "create") dependsOn.push(actionId("create", "package", desired.lookupKey));
  const missingStoreIds: string[] = [];
  const productRemoteIds: (string | null)[] = [];
  for (const storeIdentifier of desired.productStoreIdentifiers) {
    const product = productResolutions.get(storeIdentifier);
    if (!product || product.state === "hold" || product.state === "conflict") continue;
    if (product.state === "create") dependsOn.push(actionId("create", "product", storeIdentifier));
    const present = attachmentPresent(attachments, product, storeIdentifier);
    if (present) {
      const expectedProduct = desiredProducts.find((candidate) => candidate.storeIdentifier === storeIdentifier);
      if (expectedProduct?.price && !pricesMatch(expectedProduct.price, present.prices)) {
        actions.push({
          kind: "conflict",
          entity: "package-product",
          businessKey: `${desired.lookupKey}:${storeIdentifier}`,
          reason: "price-mismatch",
          operationId: null,
          remoteRef: parentRemoteId ? opaqueRef("package", parentRemoteId) : null,
          dependsOn: [],
          message: "Observed package price differs from the selected price, or the price is unread. Price update is not implemented; offering create is not a repair.",
        });
        continue;
      }
      actions.push({
        kind: "no-op",
        entity: "package-product",
        businessKey: `${desired.lookupKey}:${storeIdentifier}`,
        reason: "matched",
        operationId: null,
        remoteRef: parentRemoteId ? opaqueRef("package", parentRemoteId) : null,
        dependsOn: [],
        message: "Expected package-to-product relationship is present.",
      });
      continue;
    }
    missingStoreIds.push(storeIdentifier);
    productRemoteIds.push(product.state === "present" ? product.remoteId : null);
  }
  if (missingStoreIds.length === 0) {
    checkWrongPackageMembership(desired, collection, productResolutions, actions);
    return;
  }
  const operationId = knownRepairOperation(REVENUECAT_REPAIR_OPERATIONS.packageAttach);
  actions.push({
    kind: operationId ? "attach" : "conflict",
    entity: "package-product",
    businessKey: `${desired.lookupKey}:${missingStoreIds.join(",")}`,
    reason: operationId ? "missing-relationship" : "unsupported-operation",
    operationId,
    remoteRef: parentRemoteId ? opaqueRef("package", parentRemoteId) : null,
    attach: {
      parentRemoteId,
      productRemoteIds,
      productStoreIdentifiers: missingStoreIds,
    },
    dependsOn: [...new Set(dependsOn)],
    message: operationId
      ? "Expected package-to-product relationship is missing. Attach uses observed remote ids and does not invent them."
      : "Package attach is not an implemented repair.",
  });
  checkWrongPackageMembership(desired, collection, productResolutions, actions);
}

function checkWrongPackageMembership(
  desired: DesiredPackage,
  collection: ObservedCollection<ObservedPackage>,
  productResolutions: ReadonlyMap<string, EntityResolution>,
  actions: RevenueCatRepairAction[],
): void {
  for (const storeIdentifier of desired.productStoreIdentifiers) {
    const product = productResolutions.get(storeIdentifier);
    if (!product || product.state !== "present") continue;
    for (const other of collection.items) {
      if (other.lookupKey === desired.lookupKey) continue;
      const present = attachmentPresent(other.attachments, product, storeIdentifier);
      if (!present) continue;
      actions.push({
        kind: "conflict",
        entity: "package-product",
        businessKey: `${other.lookupKey ?? other.remoteId ?? "unknown"}:${storeIdentifier}`,
        reason: "relationship-mismatch",
        operationId: null,
        remoteRef: other.remoteId ? opaqueRef("package", other.remoteId) : null,
        dependsOn: [],
        message: "Product is attached to a different package than the desired one. Detach/update is not implemented; offering create is not a repair.",
      });
    }
  }
}

function emitExtras(
  desired: DesiredRevenueCatCatalog,
  observed: ObservedRevenueCatCatalog,
  actions: RevenueCatRepairAction[],
): void {
  const offeringKeys = new Set(desired.offering ? [desired.offering.lookupKey] : []);
  for (const item of observed.offerings.items) {
    if (item.lookupKey && offeringKeys.has(item.lookupKey)) continue;
    if (!item.remoteId) continue;
    actions.push({
      kind: "extra",
      entity: "offering",
      businessKey: item.lookupKey ?? item.remoteId,
      reason: "extra-remote",
      operationId: null,
      remoteRef: opaqueRef("offering", item.remoteId),
      dependsOn: [],
      message: "Remote offering is outside the selected catalog. Extra remotes are reported, not deleted.",
    });
  }
  const productKeys = new Set(desired.products.map((product) => product.storeIdentifier));
  for (const item of observed.products.items) {
    if (item.storeIdentifier && productKeys.has(item.storeIdentifier)) continue;
    if (!item.remoteId) continue;
    actions.push({
      kind: "extra",
      entity: "product",
      businessKey: item.storeIdentifier ?? item.remoteId,
      reason: "extra-remote",
      operationId: null,
      remoteRef: opaqueRef("product", item.remoteId),
      dependsOn: [],
      message: "Remote product is outside the selected catalog. Extra remotes are reported, not deleted.",
    });
  }
  const entitlementKeys = new Set(desired.entitlements.map((entitlement) => entitlement.lookupKey));
  for (const item of observed.entitlements.items) {
    if (item.lookupKey && entitlementKeys.has(item.lookupKey)) continue;
    if (!item.remoteId) continue;
    actions.push({
      kind: "extra",
      entity: "entitlement",
      businessKey: item.lookupKey ?? item.remoteId,
      reason: "extra-remote",
      operationId: null,
      remoteRef: opaqueRef("entitlement", item.remoteId),
      dependsOn: [],
      message: "Remote entitlement is outside the selected catalog. Extra remotes are reported, not deleted.",
    });
  }
  const packageKeys = new Set(desired.packages.map((catalogPackage) => catalogPackage.lookupKey));
  for (const item of observed.packages.items) {
    if (item.lookupKey && packageKeys.has(item.lookupKey)) continue;
    if (!item.remoteId) continue;
    actions.push({
      kind: "extra",
      entity: "package",
      businessKey: item.lookupKey ?? item.remoteId,
      reason: "extra-remote",
      operationId: null,
      remoteRef: opaqueRef("package", item.remoteId),
      dependsOn: [],
      message: "Remote package is outside the selected catalog. Extra remotes are reported, not deleted.",
    });
  }
}

