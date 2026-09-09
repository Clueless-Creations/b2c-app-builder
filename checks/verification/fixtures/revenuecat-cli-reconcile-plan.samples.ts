/**
 * Independently authored RevenueCat catalog graphs for desired-state repair tests.
 *
 * Pin: GitHub v0.1.1 / 448a9998bd2107c274b9eb1cf55ad5d5d81f6377 / @revenuecat/cli@0.1.1.
 * Shapes follow pinned verify-graph and list envelopes (offerings_verify_test.go,
 * api.Page). They are not generated from the argv encoder and are not a
 * fake process runner. Production decoding remains #102.
 */

import type {
  DesiredRevenueCatCatalog,
  ObservedCollection,
  ObservedEntitlement,
  ObservedOffering,
  ObservedPackage,
  ObservedProduct,
  ObservedRevenueCatCatalog,
} from "../../../adapters/providers/revenuecat/cli-reconcile-plan.js";

export const REVENUECAT_CATALOG_PLAN_SAMPLE_PIN = {
  tag: "v0.1.1",
  commit: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  npmPackage: "@revenuecat/cli",
  npmVersion: "0.1.1",
} as const;

/** Selected business keys. Distinct from opaque management ids below. */
export const DESIRED_PREMIUM_MONTHLY: DesiredRevenueCatCatalog = {
  projectId: "proj_approved",
  appId: "app_test",
  offering: { lookupKey: "default", displayName: "Default", isCurrent: true },
  products: [{ storeIdentifier: "monthly", type: "subscription", appId: "app_test", displayName: "Monthly" }],
  entitlements: [{ lookupKey: "premium", displayName: "Premium", productStoreIdentifiers: ["monthly"] }],
  packages: [
    {
      lookupKey: "$rc_monthly",
      displayName: "Monthly",
      offeringLookupKey: "default",
      productStoreIdentifiers: ["monthly"],
    },
  ],
};

/**
 * Provenance: reconstructed from TestOfferingsVerifyReturnsConfigurationGraphAndIssues
 * HTTP mocks at the pin. Management `id` stays distinct from lookup_key / store_identifier.
 */
export const NATIVE_MATCHING_GRAPH = {
  offering: {
    id: "ofrng",
    lookup_key: "default",
    display_name: "Default",
    is_current: true,
    object: "offering",
  },
  products: [
    {
      id: "prod",
      app_id: "app_test",
      display_name: "Monthly",
      object: "product",
      store_identifier: "monthly",
      type: "subscription",
    },
  ],
  packages: [
    {
      package: { id: "pkg", lookup_key: "$rc_monthly", display_name: "Monthly", object: "package" },
      offering_id: "ofrng",
      products: [
        {
          product: {
            id: "prod",
            app_id: "app_test",
            store_identifier: "monthly",
            type: "subscription",
          },
          prices: [{ id: "price", currency: "USD", amount_micros: 4_990_000 }],
        },
      ],
    },
  ],
  entitlements: [
    {
      entitlement: { id: "ent", lookup_key: "premium", display_name: "Premium", object: "entitlement" },
      products: [{ id: "prod", store_identifier: "monthly" }],
    },
  ],
} as const;

export function completeCollection<T>(items: readonly T[]): ObservedCollection<T> {
  return { coverage: "complete", protocolValid: true, items };
}

export function unknownCollection<T>(items: readonly T[]): ObservedCollection<T> {
  return { coverage: "unknown", protocolValid: true, items };
}

export function partialCollection<T>(items: readonly T[]): ObservedCollection<T> {
  return { coverage: "partial", protocolValid: true, items };
}

export function invalidCollection<T>(items: readonly T[] = []): ObservedCollection<T> {
  return { coverage: "invalid", protocolValid: false, items };
}

function offeringFromNative(): ObservedOffering {
  return {
    remoteId: NATIVE_MATCHING_GRAPH.offering.id,
    lookupKey: NATIVE_MATCHING_GRAPH.offering.lookup_key,
    displayName: NATIVE_MATCHING_GRAPH.offering.display_name,
    isCurrent: NATIVE_MATCHING_GRAPH.offering.is_current,
  };
}

function productsFromNative(): ObservedProduct[] {
  return NATIVE_MATCHING_GRAPH.products.map((product) => ({
    remoteId: product.id,
    storeIdentifier: product.store_identifier,
    type: product.type,
    appId: product.app_id,
    displayName: product.display_name,
  }));
}

function entitlementsFromNative(): ObservedEntitlement[] {
  return NATIVE_MATCHING_GRAPH.entitlements.map((entry) => ({
    remoteId: entry.entitlement.id,
    lookupKey: entry.entitlement.lookup_key,
    attachments: entry.products.map((product) => ({
      productRemoteId: product.id,
      storeIdentifier: product.store_identifier,
      prices: [],
    })),
  }));
}

function packagesFromNative(): ObservedPackage[] {
  return NATIVE_MATCHING_GRAPH.packages.map((entry) => ({
    remoteId: entry.package.id,
    lookupKey: entry.package.lookup_key,
    offeringRemoteId: entry.offering_id,
    offeringLookupKey: NATIVE_MATCHING_GRAPH.offering.lookup_key,
    attachments: entry.products.map((entryProduct) => ({
      productRemoteId: entryProduct.product.id,
      storeIdentifier: entryProduct.product.store_identifier,
      prices: entryProduct.prices.map((price) => ({ currency: price.currency, amountMicros: price.amount_micros })),
    })),
  }));
}

export function matchingObservedCatalog(): ObservedRevenueCatCatalog {
  return {
    projectId: "proj_approved",
    appId: "app_test",
    offerings: completeCollection([offeringFromNative()]),
    products: completeCollection(productsFromNative()),
    entitlements: completeCollection(entitlementsFromNative()),
    packages: completeCollection(packagesFromNative()),
  };
}

export function observedWithoutProduct(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    products: completeCollection([]),
    entitlements: completeCollection(
      matching.entitlements.items.map((item) => ({
        ...item,
        attachments: [],
      })),
    ),
    packages: completeCollection(
      matching.packages.items.map((item) => ({
        ...item,
        attachments: [],
      })),
    ),
  };
}

export function observedWithoutEntitlement(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return { ...matching, entitlements: completeCollection([]) };
}

export function observedWithoutPackage(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return { ...matching, packages: completeCollection([]) };
}

export function observedWithoutOffering(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    offerings: completeCollection([]),
    packages: completeCollection([]),
  };
}

export function observedProductUnattached(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    entitlements: completeCollection(
      matching.entitlements.items.map((item) => ({
        ...item,
        attachments: [],
      })),
    ),
    packages: completeCollection(
      matching.packages.items.map((item) => ({
        ...item,
        attachments: [],
      })),
    ),
  };
}

export function observedProductOnWrongPackage(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  const product = matching.products.items[0];
  if (!product?.remoteId) throw new Error("matching catalog must include a product remote id");
  return {
    ...matching,
    packages: completeCollection([
      {
        remoteId: "pkg",
        lookupKey: "$rc_monthly",
        offeringRemoteId: "ofrng",
        offeringLookupKey: "default",
        attachments: [],
      },
      {
        remoteId: "pkg_annual",
        lookupKey: "$rc_annual",
        offeringRemoteId: "ofrng",
        offeringLookupKey: "default",
        attachments: [
          {
            productRemoteId: product.remoteId,
            storeIdentifier: "monthly",
            prices: [{ currency: "USD", amountMicros: 4_990_000 }],
          },
        ],
      },
    ]),
  };
}

export function observedWrongProductType(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    products: completeCollection(
      matching.products.items.map((item) => ({
        ...item,
        type: "consumable",
      })),
    ),
  };
}

export function observedWrongPrice(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    packages: completeCollection(
      matching.packages.items.map((item) => ({
        ...item,
        attachments: item.attachments.map((attachment) => ({
          ...attachment,
          prices: [{ currency: "USD", amountMicros: 9_990_000 }],
        })),
      })),
    ),
  };
}

export function observedUnknownCoverageWithIds(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    offerings: unknownCollection(matching.offerings.items),
    products: unknownCollection(matching.products.items),
    entitlements: unknownCollection(matching.entitlements.items),
    packages: unknownCollection(matching.packages.items),
  };
}

export function observedPartialMissingProduct(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    products: partialCollection([]),
  };
}

export function observedInvalidLists(): ObservedRevenueCatCatalog {
  return {
    projectId: "proj_approved",
    appId: "app_test",
    offerings: invalidCollection<ObservedOffering>(),
    products: invalidCollection<ObservedProduct>(),
    entitlements: invalidCollection<ObservedEntitlement>(),
    packages: invalidCollection<ObservedPackage>(),
  };
}

export function observedLookupKeyEqualsRemoteId(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    offerings: completeCollection([
      {
        remoteId: "default",
        lookupKey: "other",
        displayName: "Other",
        isCurrent: true,
      },
    ]),
  };
}

export function observedAmbiguousOffering(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    offerings: completeCollection([
      { remoteId: "ofrng_a", lookupKey: "default", displayName: "Default A", isCurrent: true },
      { remoteId: "ofrng_b", lookupKey: "default", displayName: "Default B", isCurrent: false },
    ]),
  };
}

export function observedExtraRemoteProduct(): ObservedRevenueCatCatalog {
  const matching = matchingObservedCatalog();
  return {
    ...matching,
    products: completeCollection([
      ...matching.products.items,
      {
        remoteId: "prod_lifetime",
        storeIdentifier: "lifetime",
        type: "non_consumable",
        appId: "app_test",
        displayName: "Lifetime",
      },
    ]),
  };
}

export function desiredWithPrice(amountMicros: number): DesiredRevenueCatCatalog {
  const product = DESIRED_PREMIUM_MONTHLY.products[0];
  if (!product) throw new Error("desired catalog must include a product");
  return {
    ...DESIRED_PREMIUM_MONTHLY,
    products: [{ ...product, price: { currency: "USD", amountMicros } }],
  };
}
