/**
 * Map decoded RevenueCat CLI list/verify JSON into reconciler observations.
 *
 * Protocol validity and pagination come from #102. Native envelope field names
 * stay here so `cli-reconcile-plan.ts` does not import CLI flags or JSON shapes.
 */

import type { RevenueCatCliRunResult } from "./cli-execute.js";
import type {
  CollectionCoverage,
  ObservedCollection,
  ObservedEntitlement,
  ObservedOffering,
  ObservedPackage,
  ObservedPrice,
  ObservedProduct,
  ObservedProductAttachment,
  ObservedRevenueCatCatalog,
} from "./cli-reconcile-plan.js";

const CATALOG_TOKEN = /^[A-Za-z0-9._$-]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function catalogToken(value: unknown): string | null {
  return typeof value === "string" && CATALOG_TOKEN.test(value) ? value : null;
}

function listItems(data: unknown): readonly unknown[] | undefined {
  if (!isRecord(data)) return undefined;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  return undefined;
}

function coverageFromList(step: RevenueCatCliRunResult): { readonly coverage: CollectionCoverage; readonly protocolValid: boolean } {
  const observation = step.observation;
  if (!step.json?.ok || !observation || observation.kind === "invalid" || observation.protocolValid !== true) {
    return { coverage: "invalid", protocolValid: false };
  }
  if (observation.kind !== "list") {
    return { coverage: "invalid", protocolValid: false };
  }
  if (observation.pagination === "complete") return { coverage: "complete", protocolValid: true };
  if (observation.pagination === "partial") return { coverage: "partial", protocolValid: true };
  return { coverage: "unknown", protocolValid: true };
}

function parsePrices(value: unknown): readonly ObservedPrice[] {
  if (!Array.isArray(value)) return [];
  const prices: ObservedPrice[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const currency = typeof entry.currency === "string" ? entry.currency : null;
    const amountMicros = typeof entry.amount_micros === "number" ? entry.amount_micros : null;
    if (!currency || amountMicros === null) continue;
    prices.push({ currency, amountMicros });
  }
  return prices;
}

function parseAttachment(value: unknown): ObservedProductAttachment | null {
  if (!isRecord(value)) return null;
  const nested = isRecord(value.product) ? value.product : value;
  const productRemoteId = catalogToken(nested.id) ?? catalogToken(value.product_id);
  const storeIdentifier = catalogToken(nested.store_identifier) ?? catalogToken(value.store_identifier);
  if (!productRemoteId && !storeIdentifier) return null;
  return {
    productRemoteId,
    storeIdentifier,
    prices: parsePrices(value.prices),
  };
}

function parseOffering(item: unknown): ObservedOffering | null {
  if (!isRecord(item)) return null;
  const remoteId = catalogToken(item.id);
  const lookupKey = catalogToken(item.lookup_key);
  if (!remoteId && !lookupKey) return null;
  return {
    remoteId,
    lookupKey,
    displayName: typeof item.display_name === "string" ? item.display_name : null,
    isCurrent: typeof item.is_current === "boolean" ? item.is_current : null,
  };
}

function parseProduct(item: unknown): ObservedProduct | null {
  if (!isRecord(item)) return null;
  const remoteId = catalogToken(item.id);
  const storeIdentifier = catalogToken(item.store_identifier);
  if (!remoteId && !storeIdentifier) return null;
  return {
    remoteId,
    storeIdentifier,
    type: typeof item.type === "string" ? item.type : null,
    appId: catalogToken(item.app_id),
    displayName: typeof item.display_name === "string" ? item.display_name : null,
  };
}

function parseEntitlement(item: unknown): ObservedEntitlement | null {
  if (!isRecord(item)) return null;
  const nested = isRecord(item.entitlement) ? item.entitlement : item;
  const remoteId = catalogToken(nested.id);
  const lookupKey = catalogToken(nested.lookup_key);
  if (!remoteId && !lookupKey) return null;
  const products = Array.isArray(item.products) ? item.products : [];
  const attachments: ObservedProductAttachment[] = [];
  for (const product of products) {
    const attachment = parseAttachment(product);
    if (attachment) attachments.push(attachment);
  }
  return { remoteId, lookupKey, attachments };
}

function parsePackage(item: unknown): ObservedPackage | null {
  if (!isRecord(item)) return null;
  const nested = isRecord(item.package) ? item.package : item;
  const remoteId = catalogToken(nested.id);
  const lookupKey = catalogToken(nested.lookup_key);
  if (!remoteId && !lookupKey) return null;
  const products = Array.isArray(item.products) ? item.products : [];
  const attachments: ObservedProductAttachment[] = [];
  for (const product of products) {
    const attachment = parseAttachment(product);
    if (attachment) attachments.push(attachment);
  }
  return {
    remoteId,
    lookupKey,
    offeringRemoteId: catalogToken(item.offering_id) ?? catalogToken(nested.offering_id),
    offeringLookupKey: catalogToken(item.offering_lookup_key),
    attachments,
  };
}

function collectionFromList<T>(step: RevenueCatCliRunResult, parse: (item: unknown) => T | null): ObservedCollection<T> {
  const { coverage, protocolValid } = coverageFromList(step);
  const items: T[] = [];
  if (step.json?.ok) {
    for (const item of listItems(step.json.data) ?? []) {
      const parsed = parse(item);
      if (parsed) items.push(parsed);
    }
  }
  return { coverage, protocolValid, items };
}

export function observedOfferingsFromList(step: RevenueCatCliRunResult): ObservedCollection<ObservedOffering> {
  return collectionFromList(step, parseOffering);
}

export function observedProductsFromList(step: RevenueCatCliRunResult): ObservedCollection<ObservedProduct> {
  return collectionFromList(step, parseProduct);
}

export function observedEntitlementsFromList(step: RevenueCatCliRunResult): ObservedCollection<ObservedEntitlement> {
  return collectionFromList(step, parseEntitlement);
}

export function observedPackagesFromList(step: RevenueCatCliRunResult): ObservedCollection<ObservedPackage> {
  return collectionFromList(step, parsePackage);
}

export function emptyObservedCollection<T>(coverage: CollectionCoverage, protocolValid: boolean): ObservedCollection<T> {
  return { coverage, protocolValid, items: [] };
}

function overlayEntitlementsFromVerify(
  listed: ObservedCollection<ObservedEntitlement>,
  data: unknown,
): ObservedCollection<ObservedEntitlement> {
  if (!isRecord(data) || !Array.isArray(data.entitlements)) return listed;
  const fromVerify: ObservedEntitlement[] = [];
  for (const entry of data.entitlements) {
    const parsed = parseEntitlement(entry);
    if (parsed) fromVerify.push(parsed);
  }
  if (fromVerify.length === 0) return listed;
  const byKey = new Map(listed.items.map((item) => [item.lookupKey ?? item.remoteId, item]));
  const merged = listed.items.map((item) => {
    const match = fromVerify.find((candidate) =>
      (item.lookupKey && candidate.lookupKey === item.lookupKey) || (item.remoteId && candidate.remoteId === item.remoteId),
    );
    return match ?? item;
  });
  for (const item of fromVerify) {
    const key = item.lookupKey ?? item.remoteId;
    if (key && !byKey.has(key)) merged.push(item);
  }
  return { ...listed, items: merged };
}

function overlayPackagesFromVerify(
  listed: ObservedCollection<ObservedPackage>,
  data: unknown,
  offeringLookupKey: string | null,
): ObservedCollection<ObservedPackage> {
  if (!isRecord(data) || !Array.isArray(data.packages)) return listed;
  const fromVerify: ObservedPackage[] = [];
  for (const entry of data.packages) {
    const parsed = parsePackage(entry);
    if (!parsed) continue;
    fromVerify.push({
      ...parsed,
      offeringLookupKey: parsed.offeringLookupKey ?? offeringLookupKey,
      offeringRemoteId: parsed.offeringRemoteId ?? (isRecord(data.offering) ? catalogToken(data.offering.id) : null),
    });
  }
  if (fromVerify.length === 0) return listed;
  const merged = listed.items.map((item) => {
    const match = fromVerify.find((candidate) =>
      (item.lookupKey && candidate.lookupKey === item.lookupKey) || (item.remoteId && candidate.remoteId === item.remoteId),
    );
    return match ?? item;
  });
  const keys = new Set(merged.map((item) => item.lookupKey ?? item.remoteId));
  for (const item of fromVerify) {
    const key = item.lookupKey ?? item.remoteId;
    if (key && !keys.has(key)) merged.push(item);
  }
  return { ...listed, items: merged };
}

export function overlayVerifyGraph(
  observed: ObservedRevenueCatCatalog,
  data: unknown,
  protocolValid: boolean,
): ObservedRevenueCatCatalog {
  if (!protocolValid) return observed;
  const offeringLookup = observed.offerings.items[0]?.lookupKey ?? null;
  return {
    ...observed,
    entitlements: overlayEntitlementsFromVerify(observed.entitlements, data),
    packages: overlayPackagesFromVerify(observed.packages, data, offeringLookup),
  };
}

export function idsFromObserved(observed: ObservedRevenueCatCatalog): {
  readonly productIds: readonly string[];
  readonly entitlementIds: readonly string[];
  readonly offeringIds: readonly string[];
  readonly packageIds: readonly string[];
} {
  return {
    productIds: observed.products.items.map((item) => item.remoteId).filter((id): id is string => Boolean(id)),
    entitlementIds: observed.entitlements.items.map((item) => item.remoteId).filter((id): id is string => Boolean(id)),
    offeringIds: observed.offerings.items.map((item) => item.remoteId).filter((id): id is string => Boolean(id)),
    packageIds: observed.packages.items.map((item) => item.remoteId).filter((id): id is string => Boolean(id)),
  };
}
