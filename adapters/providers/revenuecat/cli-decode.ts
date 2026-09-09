/**
 * Command-specific RevenueCat CLI response decoding for release v0.1.1
 * (commit 448a9998bd2107c274b9eb1cf55ad5d5d81f6377). Native shapes come from
 * pinned upstream source, upstream tests, and documented SDK/API examples —
 * not from the argv encoder or a fake transport that echoes it.
 *
 * Protocol validity (recognized native shape) is separate from business
 * completeness and desired-state repair. This module does not invent remote
 * IDs from the request.
 */

import { REVENUECAT_CLI_RELEASE, getRevenueCatCliOperation, type CliOperationSpec } from "./cli-operations.js";
import type { CliProcessResult } from "./cli-process.js";

export const REVENUECAT_CLI_JSON_SCHEMA_VERSION = "1";

const RESOURCE_ID_PATTERN = /^[A-Za-z0-9._$-]+$/u;
const ENVELOPE_KEYS = new Set(["data", "schema_version", "schemaVersion", "object", "request_id"]);

export type RevenueCatCliJsonOutcome =
  | { readonly ok: true; readonly data: unknown; readonly schemaVersion: string | null; readonly extraFields: readonly string[]; readonly wrapped: boolean }
  | { readonly ok: false; readonly code: "invalid-json" | "invalid-envelope" | "command-error"; readonly message: string; readonly issues?: unknown };

export type RevenueCatRemoteResource =
  | "offering"
  | "product"
  | "package"
  | "entitlement"
  | "paywall"
  | "app"
  | "project"
  | "customer"
  | "subscription"
  | "price";

export interface RevenueCatRemoteRef {
  readonly provider: "revenuecat";
  readonly resource: RevenueCatRemoteResource;
  readonly remoteId: string | null;
  readonly lookupKey: string | null;
}

export interface RevenueCatLookupRecord {
  readonly id: string;
  readonly lookupKey: string;
}

export type RevenueCatLookupMapping = "resolved" | "unresolved" | "ambiguous" | "mismatch" | "not-applicable";

export interface RevenueCatCliDecodeExpected {
  readonly appId?: string;
  readonly offeringId?: string;
  readonly offeringLookupKey?: string;
  readonly managementOfferings?: readonly RevenueCatLookupRecord[];
}

export type RevenueCatCliObservationKind =
  | "invalid"
  | "version"
  | "commands"
  | "schema"
  | "preview"
  | "verify"
  | "list"
  | "resource"
  | "simulate-purchase"
  | "scoped-observation";

export interface RevenueCatCliObservationBase {
  readonly kind: RevenueCatCliObservationKind;
  readonly operationId: string;
  readonly cliRelease: typeof REVENUECAT_CLI_RELEASE;
  readonly protocolValid: boolean;
  readonly structurallyComplete: boolean;
  readonly limitations: readonly string[];
  readonly remoteRefs: readonly RevenueCatRemoteRef[];
}

export type RevenueCatCliObservation = RevenueCatCliObservationBase &
  (
    | { readonly kind: "invalid"; readonly code: "invalid-json" | "invalid-envelope" | "command-error" | "unexpected-shape"; readonly message: string }
    | { readonly kind: "version"; readonly version: string | null }
    | { readonly kind: "commands"; readonly commandNames: readonly string[] }
    | { readonly kind: "schema"; readonly present: true }
    | {
        readonly kind: "preview";
        readonly offeringLookupKey: string | null;
        readonly offeringRemoteId: string | null;
        readonly mapping: RevenueCatLookupMapping;
        readonly fallbackOnly: boolean;
        readonly publishedPaywall: boolean;
        readonly wrongApp: boolean;
        readonly wrongCurrentOffering: boolean;
        readonly packageLookupKeys: readonly string[];
        readonly storeIdentifiers: readonly string[];
      }
    | {
        readonly kind: "verify";
        readonly issues: unknown;
        readonly missingGraph: boolean;
        readonly nestedErrors: readonly string[];
        readonly offeringRemoteId: string | null;
        readonly offeringLookupKey: string | null;
      }
    | {
        readonly kind: "list";
        readonly pagination: "complete" | "partial" | "unknown";
        readonly itemsPresent: boolean;
        readonly ids: readonly string[];
        readonly lookupKeys: readonly string[];
      }
    | { readonly kind: "resource"; readonly objectType: string | null; readonly remoteId: string | null; readonly lookupKey: string | null }
    | {
        readonly kind: "simulate-purchase";
        readonly appRemoteId: string | null;
        readonly appUserId: string | null;
        readonly productRemoteId: string | null;
        readonly storeIdentifier: string | null;
        readonly entitlementLookupKeys: readonly string[];
        readonly fetchTokenPresent: boolean;
        readonly testStoreToken: boolean;
      }
    | { readonly kind: "scoped-observation"; readonly present: true }
  );

export interface RevenueCatCliDecoded {
  readonly json: RevenueCatCliJsonOutcome;
  readonly observation: RevenueCatCliObservation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && RESOURCE_ID_PATTERN.test(value);
}

function readSchemaVersion(value: unknown): "1" | "missing" | "unsupported" {
  if (value === undefined) return "missing";
  if (value === 1 || value === "1") return "1";
  return "unsupported";
}

export function parseRevenueCatCliJson(stdout: string, status: number | null): RevenueCatCliJsonOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return { ok: false, code: "invalid-json", message: "CLI stdout was not JSON. Exit status alone is not success." };
  }
  if (!isRecord(parsed)) {
    return { ok: false, code: "invalid-envelope", message: "CLI JSON is not an object envelope." };
  }
  if (parsed.object === "error" || ("error" in parsed && parsed.error)) {
    return { ok: false, code: "command-error", message: "CLI returned a structured error.", issues: parsed.error ?? parsed };
  }
  const wrapped = "data" in parsed && ("schema_version" in parsed || "schemaVersion" in parsed);
  if (wrapped) {
    const version = readSchemaVersion(parsed.schema_version ?? parsed.schemaVersion);
    if (version === "unsupported") {
      return {
        ok: false,
        code: "invalid-envelope",
        message: `CLI JSON schema_version ${String(parsed.schema_version ?? parsed.schemaVersion)} is not the pinned v0.1.1 envelope (schema_version 1).`,
      };
    }
  }
  const extraFields = Object.keys(parsed).filter((key) => !ENVELOPE_KEYS.has(key) && key !== "issues");
  const data = wrapped ? parsed.data : parsed;
  const schemaVersion = wrapped ? REVENUECAT_CLI_JSON_SCHEMA_VERSION : readSchemaVersion(parsed.schema_version ?? parsed.schemaVersion) === "1" ? "1" : null;
  if (status !== 0) {
    return { ok: false, code: "command-error", message: `CLI exit ${status ?? "null"} with JSON body.`, issues: data };
  }
  return { ok: true, data, schemaVersion, extraFields, wrapped };
}

export function paginationState(data: unknown): "complete" | "partial" | "unknown" {
  if (!isRecord(data)) return "unknown";
  if (!("items" in data) && !("data" in data)) return "unknown";
  const next = data.next_page ?? data.nextPage ?? data.next_cursor;
  if (next === null || next === undefined || next === "") return "complete";
  return "partial";
}

export function extractResourceIds(data: unknown): {
  readonly ids: readonly string[];
  readonly lookupKeys: readonly string[];
  readonly pagination: "complete" | "partial" | "unknown";
  readonly itemsPresent: boolean;
} {
  const pagination = paginationState(data);
  if (!isRecord(data)) return { ids: [], lookupKeys: [], pagination: "unknown", itemsPresent: false };
  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.data) ? data.data : undefined;
  if (!Array.isArray(rawItems)) return { ids: [], lookupKeys: [], pagination: "unknown", itemsPresent: false };
  const ids: string[] = [];
  const lookupKeys: string[] = [];
  for (const item of rawItems) {
    if (!isRecord(item)) continue;
    if (isSafeId(item.id)) ids.push(item.id);
    if (isSafeId(item.lookup_key)) lookupKeys.push(item.lookup_key);
  }
  return { ids, lookupKeys, pagination, itemsPresent: true };
}

function entitlementIdsFromUnknown(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (isSafeId(entry)) return [entry];
      if (isRecord(entry)) {
        const id = entry.id ?? entry.entitlement_id ?? entry.lookup_key;
        return isSafeId(id) ? [id] : [];
      }
      return [];
    });
  }
  if (isRecord(raw)) return Object.keys(raw).filter((key) => isSafeId(key));
  return [];
}

export function extractEntitlementIds(data: unknown): readonly string[] {
  if (!isRecord(data)) return [];
  const fromActive = entitlementIdsFromUnknown(data.active_entitlements ?? data.entitlements ?? data.entitlement_ids);
  if (fromActive.length > 0) return fromActive;
  const customerInfo = isRecord(data.customer_info) ? data.customer_info : undefined;
  const subscriber = customerInfo && isRecord(customerInfo.subscriber) ? customerInfo.subscriber : isRecord(data.subscriber) ? data.subscriber : undefined;
  if (subscriber && "entitlements" in subscriber) return entitlementIdsFromUnknown(subscriber.entitlements);
  return [];
}

function mapLookupKey(lookupKey: string | null, records: readonly RevenueCatLookupRecord[] | undefined): {
  readonly mapping: RevenueCatLookupMapping;
  readonly remoteId: string | null;
} {
  if (!lookupKey) return { mapping: "not-applicable", remoteId: null };
  if (!records || records.length === 0) return { mapping: "unresolved", remoteId: null };
  const matches = records.filter((record) => record.lookupKey === lookupKey);
  if (matches.length === 0) return { mapping: "unresolved", remoteId: null };
  if (matches.length > 1) return { mapping: "ambiguous", remoteId: null };
  const remoteId = matches[0]!.id;
  return { mapping: isSafeId(remoteId) ? "resolved" : "unresolved", remoteId: isSafeId(remoteId) ? remoteId : null };
}

function sdkOfferingRecord(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (Array.isArray(data.offerings) || typeof data.current_offering_id === "string") return data;
  if (isRecord(data.data) && (Array.isArray(data.data.offerings) || typeof data.data.current_offering_id === "string")) {
    return data.data;
  }
  return null;
}

export function interpretOfferingPreview(
  data: unknown,
  expected: { readonly appId: string; readonly offeringId?: string; readonly offeringLookupKey?: string; readonly managementOfferings?: readonly RevenueCatLookupRecord[] },
): {
  readonly protocolValid: boolean;
  readonly complete: boolean;
  readonly fallbackOnly: boolean;
  readonly publishedPaywall: boolean;
  readonly wrongApp: boolean;
  readonly wrongCurrentOffering: boolean;
  readonly offeringId: string | null;
  readonly offeringLookupKey: string | null;
  readonly offeringRemoteId: string | null;
  readonly mapping: RevenueCatLookupMapping;
  readonly packageLookupKeys: readonly string[];
  readonly storeIdentifiers: readonly string[];
  readonly issues: unknown;
} {
  const record = sdkOfferingRecord(data);
  if (!record) {
    return {
      protocolValid: false,
      complete: false,
      fallbackOnly: true,
      publishedPaywall: false,
      wrongApp: false,
      wrongCurrentOffering: false,
      offeringId: null,
      offeringLookupKey: null,
      offeringRemoteId: null,
      mapping: "not-applicable",
      packageLookupKeys: [],
      storeIdentifiers: [],
      issues: "unexpected-preview-shape",
    };
  }
  const currentKey = typeof record.current_offering_id === "string" ? record.current_offering_id : null;
  const offerings = Array.isArray(record.offerings) ? record.offerings : [];
  const matches = offerings.filter((entry) => isRecord(entry) && entry.identifier === currentKey);
  const offering = matches.length === 1 && isRecord(matches[0]) ? matches[0] : null;
  const protocolValid = currentKey !== null && Array.isArray(record.offerings) && offering !== null && matches.length === 1;
  const components = offering?.paywall_components ?? record.paywall_components;
  const fallbackOnly = components === null || components === undefined;
  const publishedPaywall = !fallbackOnly && typeof components === "object";
  const mapped = mapLookupKey(currentKey, expected.managementOfferings);
  let mapping = mapped.mapping;
  if (expected.offeringId && mapping === "resolved" && mapped.remoteId !== expected.offeringId) mapping = "mismatch";
  if (expected.offeringId && mapping === "unresolved" && expected.offeringId === currentKey) mapping = "not-applicable";
  const wrongCurrentOffering =
    (expected.offeringLookupKey !== undefined && currentKey !== null && expected.offeringLookupKey !== currentKey) || mapping === "mismatch";
  const appId = typeof record.app_id === "string" ? record.app_id : null;
  const wrongApp = Boolean(expected.appId) && appId !== null && appId !== expected.appId;
  const packageLookupKeys: string[] = [];
  const storeIdentifiers: string[] = [];
  const packages = offering && Array.isArray(offering.packages) ? offering.packages : [];
  for (const pkg of packages) {
    if (!isRecord(pkg)) continue;
    if (isSafeId(pkg.identifier)) packageLookupKeys.push(pkg.identifier);
    if (isSafeId(pkg.platform_product_identifier)) storeIdentifiers.push(pkg.platform_product_identifier);
  }
  const complete = protocolValid && !wrongApp && !wrongCurrentOffering && mapping !== "ambiguous";
  return {
    protocolValid,
    complete,
    fallbackOnly,
    publishedPaywall,
    wrongApp,
    wrongCurrentOffering,
    offeringId: currentKey,
    offeringLookupKey: currentKey,
    offeringRemoteId: mapped.remoteId,
    mapping,
    packageLookupKeys,
    storeIdentifiers,
    issues: record.issues,
  };
}

function verifyNestedErrors(record: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const packages = Array.isArray(record.packages) ? record.packages : [];
  for (const entry of packages) {
    if (!isRecord(entry)) {
      errors.push("package-entry-not-object");
      continue;
    }
    if (!isRecord(entry.package)) errors.push("package-missing");
    const products = Array.isArray(entry.products) ? entry.products : null;
    if (!products) {
      errors.push("package-products-missing");
      continue;
    }
    for (const productEntry of products) {
      if (!isRecord(productEntry)) {
        errors.push("product-entry-not-object");
        continue;
      }
      if (typeof productEntry.price_error === "string" && productEntry.price_error.length > 0) {
        errors.push("price-error");
      }
      if (!Array.isArray(productEntry.prices) || productEntry.prices.length === 0) {
        errors.push("prices-missing");
      }
    }
  }
  return errors;
}

export function offeringVerifyIsComplete(data: unknown): {
  readonly complete: boolean;
  readonly protocolValid: boolean;
  readonly issues: unknown;
  readonly missingGraph: boolean;
  readonly nestedErrors: readonly string[];
  readonly offeringRemoteId: string | null;
  readonly offeringLookupKey: string | null;
} {
  if (!isRecord(data)) {
    return {
      complete: false,
      protocolValid: false,
      issues: "missing-document",
      missingGraph: true,
      nestedErrors: [],
      offeringRemoteId: null,
      offeringLookupKey: null,
    };
  }
  const issues = data.issues;
  const offering = isRecord(data.offering) ? data.offering : null;
  const packages = Array.isArray(data.packages) ? data.packages : null;
  const paywalls = Array.isArray(data.paywalls) ? data.paywalls : null;
  const entitlements = Array.isArray(data.entitlements) ? data.entitlements : null;
  const offeringRemoteId = offering && isSafeId(offering.id) ? offering.id : null;
  const offeringLookupKey = offering && isSafeId(offering.lookup_key) ? offering.lookup_key : null;
  const protocolValid =
    Array.isArray(issues) && offering !== null && packages !== null && paywalls !== null && entitlements !== null;
  const nestedErrors = protocolValid ? verifyNestedErrors(data) : [];
  const productCount = (packages ?? []).reduce((count, entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.products)) return count;
    return count + entry.products.length;
  }, 0);
  const entitlementCount = entitlements?.length ?? 0;
  const missingGraph = !offering || !packages || packages.length === 0 || productCount === 0 || !entitlements || entitlementCount === 0;
  const complete = protocolValid && !missingGraph && nestedErrors.length === 0 && issues.length === 0;
  return {
    complete,
    protocolValid,
    issues: Array.isArray(issues) ? issues : (issues ?? "missing-issues"),
    missingGraph,
    nestedErrors,
    offeringRemoteId,
    offeringLookupKey,
  };
}

function limitationsFor(operation: CliOperationSpec | undefined, extras: readonly string[]): string[] {
  const limitations = [
    `Pinned to GitHub ${REVENUECAT_CLI_RELEASE.tag} / ${REVENUECAT_CLI_RELEASE.commit} / ${REVENUECAT_CLI_RELEASE.npmPackage}@${REVENUECAT_CLI_RELEASE.npmVersion}.`,
    "Fixture decode is not live RevenueCat, native IAP, store delivery, or in-app UI proof.",
    "Desired-state repair planning is out of scope for decode.",
    ...extras,
  ];
  if (operation?.proofCollector === "revenuecat-cli@1") {
    limitations.push("CLI collector revenuecat-cli@1 is not the REST probe revenuecat@1.");
  }
  return limitations;
}

function invalidObservation(
  operationId: string,
  code: "invalid-json" | "invalid-envelope" | "command-error" | "unexpected-shape",
  message: string,
  extras: readonly string[] = [],
): RevenueCatCliObservation {
  return {
    kind: "invalid",
    operationId,
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid: false,
    structurallyComplete: false,
    limitations: limitationsFor(getRevenueCatCliOperation(operationId), extras),
    remoteRefs: [],
    code,
    message,
  };
}

function decodeVersion(stdout: string): RevenueCatCliObservation {
  const match = stdout.match(/(\d+\.\d+\.\d+)/u);
  const version = match?.[1] ?? null;
  return {
    kind: "version",
    operationId: "rc.version",
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid: version === REVENUECAT_CLI_RELEASE.version,
    structurallyComplete: version === REVENUECAT_CLI_RELEASE.version,
    limitations: limitationsFor(getRevenueCatCliOperation("rc.version"), ["--version writes text to stdout, not the JSON envelope."]),
    remoteRefs: [],
    version,
  };
}

function decodePreview(operationId: string, data: unknown, expected: RevenueCatCliDecodeExpected | undefined): RevenueCatCliObservation {
  const interpreted = interpretOfferingPreview(data, {
    appId: expected?.appId ?? "",
    offeringId: expected?.offeringId,
    offeringLookupKey: expected?.offeringLookupKey,
    managementOfferings: expected?.managementOfferings,
  });
  const remoteRefs: RevenueCatRemoteRef[] = [];
  if (interpreted.offeringLookupKey || interpreted.offeringRemoteId) {
    remoteRefs.push({
      provider: "revenuecat",
      resource: "offering",
      remoteId: interpreted.offeringRemoteId,
      lookupKey: interpreted.offeringLookupKey,
    });
  }
  return {
    kind: "preview",
    operationId,
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid: interpreted.protocolValid,
    structurallyComplete: interpreted.complete,
    limitations: limitationsFor(getRevenueCatCliOperation(operationId), [
      "SDK identifier/current_offering_id is a lookup key, not a management ofrng_* id.",
      "Null paywall_components is fallback, not a published dashboard paywall.",
      "Missing package/product fields keep billing-readiness unproven without making a valid SDK payload unparseable.",
    ]),
    remoteRefs,
    offeringLookupKey: interpreted.offeringLookupKey,
    offeringRemoteId: interpreted.offeringRemoteId,
    mapping: interpreted.mapping,
    fallbackOnly: interpreted.fallbackOnly,
    publishedPaywall: interpreted.publishedPaywall,
    wrongApp: interpreted.wrongApp,
    wrongCurrentOffering: interpreted.wrongCurrentOffering,
    packageLookupKeys: interpreted.packageLookupKeys,
    storeIdentifiers: interpreted.storeIdentifiers,
  };
}

function decodeVerify(operationId: string, data: unknown): RevenueCatCliObservation {
  const verdict = offeringVerifyIsComplete(data);
  const remoteRefs: RevenueCatRemoteRef[] = [];
  if (verdict.offeringRemoteId || verdict.offeringLookupKey) {
    remoteRefs.push({
      provider: "revenuecat",
      resource: "offering",
      remoteId: verdict.offeringRemoteId,
      lookupKey: verdict.offeringLookupKey,
    });
  }
  return {
    kind: "verify",
    operationId,
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid: verdict.protocolValid,
    structurallyComplete: verdict.complete,
    limitations: limitationsFor(getRevenueCatCliOperation(operationId), [
      "issues is a string array on the verify graph. Empty issues without offering/packages/products/entitlements is not complete.",
      "A draft or missing dashboard paywall is an observed CLI issue, not a custom-presentation policy decision.",
    ]),
    remoteRefs,
    issues: verdict.issues,
    missingGraph: verdict.missingGraph,
    nestedErrors: verdict.nestedErrors,
    offeringRemoteId: verdict.offeringRemoteId,
    offeringLookupKey: verdict.offeringLookupKey,
  };
}

function listItemRefs(data: unknown, resource: RevenueCatRemoteResource): readonly RevenueCatRemoteRef[] {
  if (!isRecord(data)) return [];
  const rawItems = Array.isArray(data.items) ? data.items : Array.isArray(data.data) ? data.data : [];
  const refs: RevenueCatRemoteRef[] = [];
  for (const item of rawItems) {
    if (!isRecord(item)) continue;
    const remoteId = isSafeId(item.id) ? item.id : null;
    const lookupKey = isSafeId(item.lookup_key) ? item.lookup_key : null;
    if (remoteId || lookupKey) refs.push({ provider: "revenuecat", resource, remoteId, lookupKey });
  }
  return refs;
}

function decodeList(operationId: string, data: unknown): RevenueCatCliObservation {
  const extracted = extractResourceIds(data);
  const protocolValid = extracted.itemsPresent && isRecord(data) && (data.object === "list" || Array.isArray(data.items));
  const remoteRefs = listItemRefs(data, listResource(operationId));
  return {
    kind: "list",
    operationId,
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid,
    structurallyComplete: protocolValid && extracted.pagination === "complete",
    limitations: limitationsFor(getRevenueCatCliOperation(operationId), [
      "A missing items array is unknown, not an empty catalog.",
      "next_page that is non-empty is partial; later pages were not read.",
    ]),
    remoteRefs,
    pagination: extracted.pagination,
    itemsPresent: extracted.itemsPresent,
    ids: extracted.ids,
    lookupKeys: extracted.lookupKeys,
  };
}

const LIST_OPERATION_RESOURCES = {
  "rc.offerings.list": "offering",
  "rc.offerings.packages": "package",
  "rc.products.list": "product",
  "rc.entitlements.list": "entitlement",
  "rc.paywalls.list": "paywall",
  "rc.apps.list": "app",
  "rc.projects.list": "project",
} as const satisfies Record<string, RevenueCatRemoteResource>;

function listResource(operationId: string): RevenueCatRemoteResource {
  if (operationId in LIST_OPERATION_RESOURCES) {
    return LIST_OPERATION_RESOURCES[operationId as keyof typeof LIST_OPERATION_RESOURCES];
  }
  return "product";
}

function decodeResource(operationId: string, data: unknown): RevenueCatCliObservation {
  const record = isRecord(data) ? data : null;
  const objectType = record && typeof record.object === "string" ? record.object : null;
  const remoteId = record && isSafeId(record.id) ? record.id : null;
  const lookupKey = record && isSafeId(record.lookup_key) ? record.lookup_key : null;
  const protocolValid = record !== null && remoteId !== null;
  return {
    kind: "resource",
    operationId,
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid,
    structurallyComplete: protocolValid,
    limitations: limitationsFor(getRevenueCatCliOperation(operationId), ["lookup_key is not interchangeable with id."]),
    remoteRefs: protocolValid
      ? [{ provider: "revenuecat", resource: resourceForObject(objectType, operationId), remoteId, lookupKey }]
      : [],
    objectType,
    remoteId,
    lookupKey,
  };
}

function resourceForObject(objectType: string | null, operationId: string): RevenueCatRemoteResource {
  switch (objectType) {
    case "offering":
      return "offering";
    case "product":
      return "product";
    case "package":
      return "package";
    case "entitlement":
      return "entitlement";
    case "paywall":
      return "paywall";
    case "app":
      return "app";
    case "project":
      return "project";
    case "customer":
      return "customer";
    case "subscription":
      return "subscription";
    default:
      return listResource(operationId);
  }
}

function decodeSimulatePurchase(operationId: string, data: unknown): RevenueCatCliObservation {
  const record = isRecord(data) ? data : null;
  const product = record && isRecord(record.product) ? record.product : null;
  const productRemoteId = product && isSafeId(product.id) ? product.id : isSafeId(record?.product_id) ? record.product_id : null;
  const storeIdentifier = product && isSafeId(product.store_identifier) ? product.store_identifier : null;
  const appRemoteId = record && isSafeId(record.app_id) ? record.app_id : null;
  const appUserId = record && isSafeId(record.app_user_id) ? record.app_user_id : null;
  const entitlementLookupKeys = extractEntitlementIds(data);
  const fetchToken = record && typeof record.fetch_token === "string" ? record.fetch_token : "";
  const protocolValid = record !== null && typeof record.customer_info !== "undefined" && Array.isArray(record.active_entitlements);
  return {
    kind: "simulate-purchase",
    operationId,
    cliRelease: REVENUECAT_CLI_RELEASE,
    protocolValid,
    structurallyComplete: protocolValid && entitlementLookupKeys.length > 0 && (productRemoteId !== null || storeIdentifier !== null),
    limitations: limitationsFor(getRevenueCatCliOperation(operationId), [
      "active_entitlements are SDK identifiers, not management entitlement ids.",
      "Test Store simulate-purchase is not native Apple/Play or in-app UI proof.",
    ]),
    remoteRefs: [
      ...(productRemoteId || storeIdentifier
        ? [{ provider: "revenuecat" as const, resource: "product" as const, remoteId: productRemoteId, lookupKey: storeIdentifier }]
        : []),
      ...entitlementLookupKeys.map((lookupKey) => ({
        provider: "revenuecat" as const,
        resource: "entitlement" as const,
        remoteId: null,
        lookupKey,
      })),
    ],
    appRemoteId,
    appUserId,
    productRemoteId,
    storeIdentifier,
    entitlementLookupKeys,
    fetchTokenPresent: fetchToken.length > 0,
    testStoreToken: fetchToken.startsWith("TEST_"),
  };
}

function observationForOperation(
  operation: CliOperationSpec,
  data: unknown,
  stdout: string,
  expected: RevenueCatCliDecodeExpected | undefined,
): RevenueCatCliObservation {
  switch (operation.id) {
    case "rc.version":
      return decodeVersion(stdout);
    case "rc.commands": {
      const commandNames = commandNamesFrom(data);
      return {
        kind: "commands",
        operationId: operation.id,
        cliRelease: REVENUECAT_CLI_RELEASE,
        protocolValid: isRecord(data) || Array.isArray(data),
        structurallyComplete: commandNames.length > 0,
        limitations: limitationsFor(operation, []),
        remoteRefs: [],
        commandNames,
      };
    }
    case "rc.schema":
      return {
        kind: "schema",
        operationId: operation.id,
        cliRelease: REVENUECAT_CLI_RELEASE,
        protocolValid: data !== undefined,
        structurallyComplete: data !== undefined,
        limitations: limitationsFor(operation, []),
        remoteRefs: [],
        present: true,
      };
    case "rc.offerings.preview":
      return decodePreview(operation.id, data, expected);
    case "rc.offerings.verify":
      return decodeVerify(operation.id, data);
    case "rc.offerings.list":
    case "rc.apps.list":
    case "rc.products.list":
    case "rc.entitlements.list":
    case "rc.projects.list":
    case "rc.offerings.packages":
    case "rc.paywalls.list":
      return decodeList(operation.id, data);
    case "rc.offerings.show":
    case "rc.apps.show":
    case "rc.projects.show":
    case "rc.products.show":
    case "rc.entitlements.show":
    case "rc.packages.show":
    case "rc.paywalls.show":
    case "rc.customers.show":
    case "rc.subscriptions.show":
    case "rc.catalog.create":
    case "rc.products.create":
    case "rc.entitlements.create":
    case "rc.entitlements.attach":
    case "rc.packages.create":
    case "rc.packages.attach":
    case "rc.paywalls.attach":
      return decodeResource(operation.id, data);
    case "rc.customers.simulate-purchase":
      return decodeSimulatePurchase(operation.id, data);
    case "rc.metrics":
    case "rc.charts.show":
    case "rc.audit":
      return {
        kind: "scoped-observation",
        operationId: operation.id,
        cliRelease: REVENUECAT_CLI_RELEASE,
        protocolValid: isRecord(data),
        structurallyComplete: isRecord(data),
        limitations: limitationsFor(operation, ["Scoped observation is not an export of arbitrary customer records."]),
        remoteRefs: [],
        present: true,
      };
    default:
      return invalidObservation(
        operation.id,
        "unexpected-shape",
        operation.support === "implemented-fixture"
          ? `${operation.id} has no command-specific decoder.`
          : `${operation.id} is ${operation.support}; responses are not decoded as success.`,
      );
  }
}

function commandNamesFrom(payload: unknown): readonly string[] {
  const names: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      const token = value.trim().split(/\s+/u)[0];
      if (token) names.push(token);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (isRecord(value)) {
      if (typeof value.name === "string") visit(value.name);
      else for (const nested of Object.values(value)) visit(nested);
    }
  };
  visit(payload);
  return [...new Set(names)];
}

export function decodeRevenueCatCliResponse(input: {
  readonly operationId: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly expected?: RevenueCatCliDecodeExpected;
}): RevenueCatCliDecoded {
  const operation = getRevenueCatCliOperation(input.operationId);
  if (input.operationId === "rc.version" || operation?.command[0] === "--version") {
    const json: RevenueCatCliJsonOutcome = {
      ok: false,
      code: "invalid-json",
      message: "rc --version is text, not JSON.",
    };
    return { json, observation: decodeVersion(input.stdout) };
  }
  const json = parseRevenueCatCliJson(input.stdout, input.status);
  if (!operation) {
    return { json, observation: invalidObservation(input.operationId, "unexpected-shape", `Unknown operation ${input.operationId}.`) };
  }
  if (!json.ok) {
    return { json, observation: invalidObservation(operation.id, json.code, json.message) };
  }
  return { json, observation: observationForOperation(operation, json.data, input.stdout, input.expected) };
}

export function decodeCliProcessResult(
  operationId: string,
  processResult: Pick<CliProcessResult, "stdout" | "stderr" | "status">,
  expected?: RevenueCatCliDecodeExpected,
): RevenueCatCliDecoded {
  return decodeRevenueCatCliResponse({
    operationId,
    stdout: processResult.stdout,
    stderr: processResult.stderr,
    status: processResult.status,
    expected,
  });
}
