/**
 * Selected RevenueCat CLI catalog, verification, preview, paywall inspect,
 * Test Store, and scoped observation routes. Uses the Increment A runner and
 * collector. Does not impersonate the REST probe or native purchase proof.
 */

import { CLI_PROOF_COLLECTOR, getRevenueCatCliOperation, isMutationEffect, type RevenueCatChartName } from "./cli-operations.js";
import {
  extractEntitlementIds,
  extractResourceIds,
  interpretOfferingPreview,
  offeringVerifyIsComplete,
  runRevenueCatCli,
  type RevenueCatCliRunRequest,
  type RevenueCatCliRunResult,
} from "./cli-execute.js";
import type { RevenueCatCliDiscovery } from "./cli-discovery.js";
import type { RevenueCatCliHoldCode, RevenueCatCliPreflight, RevenueCatCliTarget } from "./cli-preflight.js";
import type { CliProcessRunner } from "./cli-process.js";
import type { CliEffectProgress, CliNextAction, RevenueCatCliLedger } from "./cli-ledger.js";
import { revenueCatCliLedgerPath } from "./cli-ledger.js";

export const CATALOG_INTENTS = [
  "inspect-project-app",
  "reconcile-catalog",
  "verify-offering",
  "preview-sdk",
  "inspect-paywalls",
  "test-store-purchase",
  "observe-revenue",
] as const;
export type CatalogIntent = (typeof CATALOG_INTENTS)[number];

export const OBSERVATION_KINDS = ["customer", "subscription", "metrics", "charts", "audit"] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export type CatalogSessionDisposition = "complete" | "partial" | "refused" | "uncertain" | "incomplete";

export interface ExpectedCatalog {
  readonly projectId: string;
  readonly appId: string;
  readonly offeringId?: string;
  readonly productIds?: readonly string[];
  readonly entitlementIds?: readonly string[];
  readonly packageIds?: readonly string[];
  readonly paywallIds?: readonly string[];
}

export interface StorePlanIdentity {
  readonly planId: string;
  readonly digest: string;
}

export interface CatalogSessionRequest {
  readonly intent: CatalogIntent;
  readonly executable: string;
  readonly cwd: string;
  readonly isolatedHome: string;
  readonly pathEnv: string;
  readonly apiKey?: string;
  readonly run: CliProcessRunner;
  readonly target: RevenueCatCliTarget;
  readonly discovery: RevenueCatCliDiscovery;
  readonly expected: ExpectedCatalog;
  readonly hostAuthorityGranted: boolean;
  readonly createIfMissing?: boolean;
  readonly appUserId?: string;
  readonly productId?: string;
  readonly customerId?: string;
  readonly subscriptionId?: string;
  readonly chartName?: RevenueCatChartName;
  readonly auditLimit?: number;
  readonly observationKind?: ObservationKind;
  readonly storePlanApproval?: StorePlanIdentity;
  readonly currentStorePlan?: StorePlanIdentity;
  readonly synthetic?: boolean;
  readonly offeringCreate?: {
    readonly lookupKey: string;
    readonly displayName: string;
  };
  readonly idempotencyKey?: string;
  readonly ledger?: RevenueCatCliLedger;
  readonly ledgerPath?: string;
  readonly persistLedger?: () => void;
}

export interface RevenueCatCliCatalogEvidence {
  readonly collector: typeof CLI_PROOF_COLLECTOR;
  readonly kind: "revenuecat-cli-catalog";
  readonly synthetic: boolean;
  readonly live: false;
  readonly cli_executable: string;
  readonly cli_version: string | null;
  readonly project_id: string;
  readonly app_id: string;
  readonly catalog: {
    readonly project_ids: readonly string[];
    readonly app_ids: readonly string[];
    readonly product_ids: readonly string[];
    readonly entitlement_ids: readonly string[];
    readonly offering_ids: readonly string[];
    readonly package_ids: readonly string[];
    readonly reconciled: boolean;
    readonly missing_ids: readonly string[];
    readonly created: boolean;
  };
  readonly offering_verify?: { readonly complete: boolean; readonly protocol_valid?: boolean; readonly issues: unknown };
  readonly preview?: {
    readonly offering_id: string | null;
    readonly offering_lookup_key?: string | null;
    readonly offering_remote_id?: string | null;
    readonly mapping?: "resolved" | "unresolved" | "ambiguous" | "mismatch" | "not-applicable";
    readonly protocol_valid?: boolean;
    readonly fallback_only: boolean;
    readonly published_paywall: boolean;
    readonly wrong_app: boolean;
    readonly issues: unknown;
  };
  readonly test_store?: {
    readonly executed: boolean;
    readonly product_id: string | null;
    readonly entitlement_ids: readonly string[];
    readonly not_native_purchase_proof: true;
    readonly not_in_app_ui_proof: true;
    readonly not_app_store_or_play_proof: true;
  };
  readonly paywalls?: { readonly inspected_ids: readonly string[]; readonly published_claimed: false };
  readonly observations?: {
    readonly scoped: true;
    readonly kind: ObservationKind;
    readonly customer_records_exported: false;
  };
  readonly pagination: "complete" | "partial" | "unknown";
  readonly created: boolean;
  readonly not_rest_probe: true;
  readonly not_native_purchase_proof: true;
}

export interface CatalogSessionResult {
  readonly disposition: CatalogSessionDisposition;
  readonly hold?: RevenueCatCliPreflight;
  readonly invoked: readonly RevenueCatCliRunResult[];
  readonly evidence: RevenueCatCliCatalogEvidence;
  readonly replaySafe: boolean;
  readonly nextAction?: CliNextAction;
  readonly effectProgress?: CliEffectProgress;
}

export function assessStorePlanApplyAuthorization(
  approval: StorePlanIdentity | undefined,
  current: StorePlanIdentity | undefined,
): { readonly allowed: false; readonly code: Extract<RevenueCatCliHoldCode, "stale-plan-approval" | "unsupported-operation">; readonly message: string } {
  if (!approval || !current || approval.planId !== current.planId || approval.digest !== current.digest) {
    return {
      allowed: false,
      code: "stale-plan-approval",
      message: "Old store-plan approval cannot authorize a changed, missing, or unverifiable remote plan. products store apply stays excluded.",
    };
  }
  return {
    allowed: false,
    code: "unsupported-operation",
    message: "products store apply remains excluded even when the reviewed plan digest is unchanged.",
  };
}

export function expectedCatalogMissing(
  expected: ExpectedCatalog,
  observed: {
    readonly productIds: readonly string[];
    readonly entitlementIds: readonly string[];
    readonly offeringIds: readonly string[];
    readonly packageIds: readonly string[];
  },
): readonly string[] {
  return [
    ...reconcileExpectedIds(expected.productIds, observed.productIds).missing,
    ...reconcileExpectedIds(expected.entitlementIds, observed.entitlementIds).missing,
    ...reconcileExpectedIds(expected.offeringId ? [expected.offeringId] : undefined, observed.offeringIds).missing,
    ...reconcileExpectedIds(expected.packageIds, observed.packageIds).missing,
  ];
}

export function reconcileExpectedIds(
  expected: readonly string[] | undefined,
  observed: readonly string[],
): { readonly present: readonly string[]; readonly missing: readonly string[] } {
  const observedSet = new Set(observed);
  const present: string[] = [];
  const missing: string[] = [];
  for (const id of expected ?? []) {
    if (observedSet.has(id)) present.push(id);
    else missing.push(id);
  }
  return { present, missing };
}

function emptyEvidence(request: CatalogSessionRequest): RevenueCatCliCatalogEvidence {
  return {
    collector: CLI_PROOF_COLLECTOR,
    kind: "revenuecat-cli-catalog",
    synthetic: request.synthetic !== false,
    live: false,
    cli_executable: request.discovery.selected?.path ?? request.executable,
    cli_version: request.discovery.selected?.version ?? null,
    project_id: request.expected.projectId,
    app_id: request.expected.appId,
    catalog: {
      project_ids: [],
      app_ids: [],
      product_ids: [],
      entitlement_ids: [],
      offering_ids: [],
      package_ids: [],
      reconciled: false,
      missing_ids: [],
      created: false,
    },
    pagination: "unknown",
    created: false,
    not_rest_probe: true,
    not_native_purchase_proof: true,
  };
}

function runStep(
  request: CatalogSessionRequest,
  operationId: string,
  extra: Partial<Omit<RevenueCatCliRunRequest, "executable" | "cwd" | "isolatedHome" | "pathEnv" | "run" | "target" | "discovery" | "hostAuthorityGranted" | "operationId">> = {},
): RevenueCatCliRunResult {
  return runRevenueCatCli({
    operationId,
    projectId: request.expected.projectId,
    appId: request.expected.appId,
    offeringId: request.expected.offeringId,
    productId: request.productId,
    appUserId: request.appUserId,
    customerId: request.customerId ?? request.appUserId,
    subscriptionId: request.subscriptionId,
    chartName: request.chartName,
    auditLimit: request.auditLimit,
    lookupKey: request.offeringCreate?.lookupKey,
    displayName: request.offeringCreate?.displayName,
    storeIdentifier: extra.storeIdentifier,
    productType: extra.productType,
    duration: extra.duration,
    hostAuthorityGranted: request.hostAuthorityGranted,
    executable: request.executable,
    cwd: request.cwd,
    isolatedHome: request.isolatedHome,
    pathEnv: request.pathEnv,
    apiKey: request.apiKey,
    run: request.run,
    target: request.target,
    discovery: request.discovery,
    idempotencyKey: request.idempotencyKey,
    ledger: request.ledger,
    ledgerPath: request.ledgerPath,
    persistLedger: request.persistLedger,
    ...extra,
  });
}

function worstPagination(states: readonly ("complete" | "partial" | "unknown")[]): "complete" | "partial" | "unknown" {
  if (states.includes("unknown")) return "unknown";
  if (states.includes("partial")) return "partial";
  if (states.every((state) => state === "complete")) return "complete";
  return "unknown";
}

function mutationTouched(invoked: readonly RevenueCatCliRunResult[], hold?: RevenueCatCliPreflight): boolean {
  if (hold?.code === "request-identity-conflict" || hold?.code === "mutation-uncertain") return true;
  return invoked.some(
    (step) => isMutationEffect(step.operation.effectClass) && (step.invoked || step.resumed === true || step.uncertainMutation),
  );
}

function refused(request: CatalogSessionRequest, hold: RevenueCatCliPreflight, invoked: readonly RevenueCatCliRunResult[] = []): CatalogSessionResult {
  const replaySafe = !mutationTouched(invoked, hold);
  return {
    disposition: "refused",
    hold,
    invoked,
    evidence: emptyEvidence(request),
    replaySafe,
    nextAction: replaySafe ? "none" : "hold-uncertain",
    effectProgress: replaySafe ? "no-effect" : "dispatched-unconfirmed",
  };
}

export function runRevenueCatCatalogSession(request: CatalogSessionRequest): CatalogSessionResult {
  if (request.storePlanApproval || request.currentStorePlan) {
    const plan = assessStorePlanApplyAuthorization(request.storePlanApproval, request.currentStorePlan);
    return refused(request, { status: "hold", code: plan.code, message: plan.message, blocksUnrelatedWork: false });
  }
  switch (request.intent) {
    case "inspect-project-app":
      return inspectProjectApp(request);
    case "reconcile-catalog":
      return reconcileCatalog(request);
    case "verify-offering":
      return verifyOffering(request);
    case "preview-sdk":
      return previewSdk(request);
    case "inspect-paywalls":
      return inspectPaywalls(request);
    case "test-store-purchase":
      return testStorePurchase(request);
    case "observe-revenue":
      return observeRevenue(request);
    default: {
      const exhaustive: never = request.intent;
      return exhaustive;
    }
  }
}

function inspectProjectApp(request: CatalogSessionRequest): CatalogSessionResult {
  const projects = runStep(request, "rc.projects.list");
  const app = runStep(request, "rc.apps.show", { appId: request.expected.appId });
  const invoked = [projects, app];
  if (!projects.invoked || !app.invoked) {
    return refused(request, projects.preflight.status !== "ready" ? projects.preflight : app.preflight, invoked);
  }
  if (projects.uncertainMutation || app.uncertainMutation) {
    return { disposition: "uncertain", invoked, evidence: emptyEvidence(request), replaySafe: false };
  }
  if (!projects.json?.ok || !app.json?.ok) {
    return { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true };
  }
  const projectIds = extractResourceIds(projects.json.data);
  const appRecord = app.json.data && typeof app.json.data === "object" ? (app.json.data as { id?: unknown }) : {};
  const appId = typeof appRecord.id === "string" ? appRecord.id : request.expected.appId;
  const evidence = emptyEvidence(request);
  const next: RevenueCatCliCatalogEvidence = {
    ...evidence,
    catalog: {
      ...evidence.catalog,
      project_ids: projectIds.ids,
      app_ids: [appId],
      reconciled: projectIds.ids.includes(request.expected.projectId) && appId === request.expected.appId,
    },
    pagination: worstPagination([projectIds.pagination, "complete"]),
  };
  if (next.pagination === "partial") {
    return { disposition: "partial", invoked, evidence: { ...next, catalog: { ...next.catalog, reconciled: false } }, replaySafe: true };
  }
  if (!next.catalog.reconciled) {
    return { disposition: "incomplete", invoked, evidence: next, replaySafe: true };
  }
  return { disposition: "complete", invoked, evidence: next, replaySafe: true };
}

function priorAppliedWrite(request: CatalogSessionRequest): { readonly remoteId?: string; readonly state: "applied-unverified" | "verified" } | undefined {
  if (!request.ledger || !request.idempotencyKey) return undefined;
  const entry = request.ledger.get(request.idempotencyKey);
  if (!entry) return undefined;
  if (entry.state === "applied-unverified" || entry.state === "verified") {
    return { remoteId: entry.remoteId, state: entry.state };
  }
  return undefined;
}

function preservedCreateEvidence(request: CatalogSessionRequest, remoteId: string | undefined): RevenueCatCliCatalogEvidence {
  const evidence = emptyEvidence(request);
  const offeringIds = remoteId && !evidence.catalog.offering_ids.includes(remoteId) ? [...evidence.catalog.offering_ids, remoteId] : evidence.catalog.offering_ids;
  return {
    ...evidence,
    catalog: { ...evidence.catalog, offering_ids: offeringIds, created: true },
    created: true,
  };
}

function reconcileCatalog(request: CatalogSessionRequest): CatalogSessionResult {
  const products = runStep(request, "rc.products.list");
  const entitlements = runStep(request, "rc.entitlements.list");
  const offerings = runStep(request, "rc.offerings.list");
  const invoked: RevenueCatCliRunResult[] = [products, entitlements, offerings];
  for (const step of invoked) {
    if (!step.invoked) return refused(request, step.preflight, invoked);
    if (step.uncertainMutation) return { disposition: "uncertain", invoked, evidence: emptyEvidence(request), replaySafe: false };
    if (!step.json?.ok) {
      const prior = priorAppliedWrite(request);
      if (prior) {
        return {
          disposition: "incomplete",
          invoked,
          evidence: preservedCreateEvidence(request, prior.remoteId),
          replaySafe: false,
          nextAction: "observe",
          effectProgress: prior.state,
        };
      }
      return { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true };
    }
  }
  const productIds = extractResourceIds(products.json && products.json.ok ? products.json.data : undefined);
  const entitlementIds = extractResourceIds(entitlements.json && entitlements.json.ok ? entitlements.json.data : undefined);
  const offeringIds = extractResourceIds(offerings.json && offerings.json.ok ? offerings.json.data : undefined);
  let packageIds: ReturnType<typeof extractResourceIds> = { ids: [], lookupKeys: [], pagination: "unknown", itemsPresent: false };
  if (request.expected.offeringId) {
    const packages = runStep(request, "rc.offerings.packages", { offeringId: request.expected.offeringId });
    invoked.push(packages);
    if (!packages.invoked) return refused(request, packages.preflight, invoked);
    if (!packages.json?.ok) {
      const prior = priorAppliedWrite(request);
      if (prior) {
        return {
          disposition: "incomplete",
          invoked,
          evidence: preservedCreateEvidence(request, prior.remoteId),
          replaySafe: false,
          nextAction: "observe",
          effectProgress: prior.state,
        };
      }
      return { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true };
    }
    packageIds = extractResourceIds(packages.json.data);
  }
  const pagination = worstPagination([productIds.pagination, entitlementIds.pagination, offeringIds.pagination, request.expected.offeringId ? packageIds.pagination : "complete"]);
  const missing = expectedCatalogMissing(request.expected, {
    productIds: productIds.ids,
    entitlementIds: entitlementIds.ids,
    offeringIds: offeringIds.ids,
    packageIds: packageIds.ids,
  });
  const evidence = emptyEvidence(request);
  const catalog = {
    ...evidence.catalog,
    product_ids: productIds.ids,
    entitlement_ids: entitlementIds.ids,
    offering_ids: offeringIds.ids,
    package_ids: packageIds.ids,
    missing_ids: missing,
    reconciled: missing.length === 0 && pagination !== "partial" && pagination !== "unknown",
    created: false,
  };
  if (pagination === "partial") {
    return {
      disposition: "partial",
      invoked,
      evidence: { ...evidence, catalog: { ...catalog, reconciled: false }, pagination },
      replaySafe: true,
    };
  }
  if (missing.length === 0) {
    return { disposition: "complete", invoked, evidence: { ...evidence, catalog, pagination }, replaySafe: true };
  }
  if (!request.createIfMissing) {
    return { disposition: "incomplete", invoked, evidence: { ...evidence, catalog, pagination }, replaySafe: true };
  }
  if (!request.hostAuthorityGranted) {
    return refused(request, {
      status: "hold",
      code: "authority-missing",
      message: "Catalog objects are missing, but create is refused without host authority. Existing ids were read back; the process was not asked to duplicate or invent them.",
      blocksUnrelatedWork: false,
    }, invoked);
  }
  const create = runStep(request, "rc.catalog.create", {
    lookupKey: request.offeringCreate?.lookupKey,
    displayName: request.offeringCreate?.displayName,
  });
  invoked.push(create);
  if (!create.invoked && create.resumed !== true) return refused(request, create.preflight, invoked);
  if (create.uncertainMutation) {
    return {
      disposition: "uncertain",
      invoked,
      evidence: { ...evidence, catalog: { ...catalog, created: true }, created: true, pagination },
      replaySafe: false,
      nextAction: "hold-uncertain",
      effectProgress: "dispatched-unconfirmed",
    };
  }
  if (!create.json?.ok) {
    return {
      disposition: "uncertain",
      invoked,
      evidence: { ...evidence, catalog, pagination },
      replaySafe: false,
      nextAction: "hold-uncertain",
      effectProgress: "dispatched-unconfirmed",
    };
  }
  const createdId =
    create.remoteId ??
    (create.json.data && typeof create.json.data === "object" && typeof (create.json.data as { id?: unknown }).id === "string"
      ? (create.json.data as { id: string }).id
      : request.expected.offeringId);
  const createdCatalog = {
    ...catalog,
    created: true,
    offering_ids: createdId && !catalog.offering_ids.includes(createdId) ? [...catalog.offering_ids, createdId] : catalog.offering_ids,
  };
  const productsAfter = runStep(request, "rc.products.list");
  const entitlementsAfter = runStep(request, "rc.entitlements.list");
  const offeringsAfter = runStep(request, "rc.offerings.list");
  invoked.push(productsAfter, entitlementsAfter, offeringsAfter);
  for (const step of [productsAfter, entitlementsAfter, offeringsAfter]) {
    if (!step.invoked) return refused(request, step.preflight, invoked);
    if (step.uncertainMutation) {
      return {
        disposition: "uncertain",
        invoked,
        evidence: { ...evidence, catalog: createdCatalog, created: true, pagination },
        replaySafe: false,
        nextAction: "hold-uncertain",
        effectProgress: "applied-unverified",
      };
    }
    if (!step.json?.ok) {
      return {
        disposition: "incomplete",
        invoked,
        evidence: { ...evidence, catalog: createdCatalog, created: true, pagination },
        replaySafe: false,
        nextAction: "observe",
        effectProgress: "applied-unverified",
      };
    }
  }
  const productIdsAfter = extractResourceIds(productsAfter.json && productsAfter.json.ok ? productsAfter.json.data : undefined);
  const entitlementIdsAfter = extractResourceIds(entitlementsAfter.json && entitlementsAfter.json.ok ? entitlementsAfter.json.data : undefined);
  const offeringIdsAfter = extractResourceIds(offeringsAfter.json && offeringsAfter.json.ok ? offeringsAfter.json.data : undefined);
  let packageIdsAfter: ReturnType<typeof extractResourceIds> = { ids: [], lookupKeys: [], pagination: "unknown", itemsPresent: false };
  if (request.expected.offeringId) {
    const packagesAfter = runStep(request, "rc.offerings.packages", { offeringId: request.expected.offeringId });
    invoked.push(packagesAfter);
    if (!packagesAfter.invoked) return refused(request, packagesAfter.preflight, invoked);
    if (!packagesAfter.json?.ok) {
      return {
        disposition: "incomplete",
        invoked,
        evidence: { ...evidence, catalog: { ...createdCatalog, created: true }, created: true, pagination },
        replaySafe: false,
        nextAction: "observe",
        effectProgress: "applied-unverified",
      };
    }
    packageIdsAfter = extractResourceIds(packagesAfter.json.data);
  }
  const afterPagination = worstPagination([
    productIdsAfter.pagination,
    entitlementIdsAfter.pagination,
    offeringIdsAfter.pagination,
    request.expected.offeringId ? packageIdsAfter.pagination : "complete",
  ]);
  const missingAfter = expectedCatalogMissing(request.expected, {
    productIds: productIdsAfter.ids,
    entitlementIds: entitlementIdsAfter.ids,
    offeringIds: offeringIdsAfter.ids,
    packageIds: packageIdsAfter.ids,
  });
  const reconciled = missingAfter.length === 0 && afterPagination !== "partial" && afterPagination !== "unknown";
  return {
    disposition: reconciled ? "complete" : afterPagination === "partial" ? "partial" : "incomplete",
    invoked,
    evidence: {
      ...evidence,
      catalog: {
        ...catalog,
        product_ids: productIdsAfter.ids,
        entitlement_ids: entitlementIdsAfter.ids,
        offering_ids: offeringIdsAfter.ids,
        package_ids: packageIdsAfter.ids,
        missing_ids: missingAfter,
        created: true,
        reconciled,
      },
      created: true,
      pagination: afterPagination,
    },
    replaySafe: false,
    nextAction: reconciled ? "complete" : "observe",
    effectProgress: reconciled ? "verified" : "applied-unverified",
  };
}

function verifyOffering(request: CatalogSessionRequest): CatalogSessionResult {
  const verify = runStep(request, "rc.offerings.verify", { offeringId: request.expected.offeringId });
  if (!verify.invoked) return refused(request, verify.preflight, [verify]);
  if (!verify.json?.ok) {
    return { disposition: "incomplete", invoked: [verify], evidence: emptyEvidence(request), replaySafe: true };
  }
  const verdict = offeringVerifyIsComplete(verify.json.data);
  const evidence = emptyEvidence(request);
  return {
    disposition: verdict.complete ? "complete" : "incomplete",
    invoked: [verify],
    evidence: { ...evidence, offering_verify: { complete: verdict.complete, protocol_valid: verdict.protocolValid, issues: verdict.issues } },
    replaySafe: true,
  };
}

function previewSdk(request: CatalogSessionRequest): CatalogSessionResult {
  const preview = runStep(request, "rc.offerings.preview", { appId: request.expected.appId, appUserId: request.appUserId });
  if (!preview.invoked) return refused(request, preview.preflight, [preview]);
  if (!preview.json?.ok) {
    return { disposition: "incomplete", invoked: [preview], evidence: emptyEvidence(request), replaySafe: true };
  }
  const interpreted = interpretOfferingPreview(preview.json.data, { appId: request.expected.appId, offeringId: request.expected.offeringId });
  const evidence = emptyEvidence(request);
  return {
    disposition: interpreted.wrongApp || interpreted.wrongCurrentOffering ? "incomplete" : interpreted.complete ? "complete" : "incomplete",
    invoked: [preview],
    evidence: {
      ...evidence,
      preview: {
        offering_id: interpreted.offeringLookupKey,
        offering_lookup_key: interpreted.offeringLookupKey,
        offering_remote_id: interpreted.offeringRemoteId,
        mapping: interpreted.mapping,
        protocol_valid: interpreted.protocolValid,
        fallback_only: interpreted.fallbackOnly,
        published_paywall: interpreted.publishedPaywall,
        wrong_app: interpreted.wrongApp,
        issues: interpreted.issues,
      },
    },
    replaySafe: true,
  };
}

function inspectPaywalls(request: CatalogSessionRequest): CatalogSessionResult {
  const list = runStep(request, "rc.paywalls.list");
  if (!list.invoked) return refused(request, list.preflight, [list]);
  if (!list.json?.ok) {
    return { disposition: "incomplete", invoked: [list], evidence: emptyEvidence(request), replaySafe: true };
  }
  const listed = extractResourceIds(list.json.data);
  const invoked: RevenueCatCliRunResult[] = [list];
  const inspected = [...listed.ids];
  if (request.expected.paywallIds?.[0]) {
    const show = runStep(request, "rc.paywalls.show", { paywallId: request.expected.paywallIds[0] });
    invoked.push(show);
    if (!show.invoked) return refused(request, show.preflight, invoked);
    if (show.json?.ok && !inspected.includes(request.expected.paywallIds[0])) inspected.push(request.expected.paywallIds[0]);
  }
  const evidence = emptyEvidence(request);
  return {
    disposition: listed.pagination === "partial" ? "partial" : "complete",
    invoked,
    evidence: {
      ...evidence,
      paywalls: { inspected_ids: inspected, published_claimed: false },
      pagination: listed.pagination,
    },
    replaySafe: true,
  };
}

function testStorePurchase(request: CatalogSessionRequest): CatalogSessionResult {
  const purchase = runStep(request, "rc.customers.simulate-purchase", {
    appId: request.expected.appId,
    productId: request.productId,
    appUserId: request.appUserId,
  });
  if (!purchase.invoked && purchase.resumed !== true) return refused(request, purchase.preflight, [purchase]);
  if (purchase.uncertainMutation) {
    return {
      disposition: "uncertain",
      invoked: [purchase],
      evidence: emptyEvidence(request),
      replaySafe: false,
      nextAction: "hold-uncertain",
      effectProgress: "dispatched-unconfirmed",
    };
  }
  if (!purchase.json?.ok) {
    return {
      disposition: "uncertain",
      invoked: [purchase],
      evidence: emptyEvidence(request),
      replaySafe: false,
      nextAction: "hold-uncertain",
      effectProgress: "dispatched-unconfirmed",
    };
  }
  const customerId = request.customerId ?? request.appUserId;
  const observedProductId = observedSimulatePurchaseProductId(purchase.json && purchase.json.ok ? purchase.json.data : undefined);
  const requestedProduct = request.productId;
  const appliedEvidence = (entitlementIds: readonly string[]): RevenueCatCliCatalogEvidence => {
    const evidence = emptyEvidence(request);
    return {
      ...evidence,
      test_store: {
        executed: true,
        product_id: requestedProduct ?? observedProductId,
        entitlement_ids: entitlementIds,
        not_native_purchase_proof: true,
        not_in_app_ui_proof: true,
        not_app_store_or_play_proof: true,
      },
    };
  };
  const readback = runStep(request, "rc.customers.show", { customerId });
  const invoked = [purchase, readback];
  if (!readback.invoked) return refused(request, readback.preflight, invoked);
  if (!readback.json?.ok) {
    return {
      disposition: "incomplete",
      invoked,
      evidence: appliedEvidence([]),
      replaySafe: false,
      nextAction: "observe",
      effectProgress: "applied-unverified",
    };
  }
  const entitlementIds = extractEntitlementIds(readback.json.data);
  const expectedEntitlements = request.expected.entitlementIds ?? [];
  const expectedProducts = request.expected.productIds ?? [];
  const productMatches =
    typeof requestedProduct === "string" &&
    requestedProduct.length > 0 &&
    expectedProducts.includes(requestedProduct) &&
    (observedProductId === null || observedProductId === requestedProduct);
  const entitlementsMatch = expectedEntitlements.length > 0 && expectedEntitlements.every((id) => entitlementIds.includes(id));
  const complete = productMatches && entitlementsMatch;
  if (complete && request.ledger && request.idempotencyKey) {
    const binding = request.ledger.get(request.idempotencyKey)?.binding;
    if (binding) {
      request.ledger.record(request.idempotencyKey, binding, {
        state: "verified",
        remoteId: purchase.remoteId,
      });
      if (request.persistLedger) request.persistLedger();
      else if (request.ledgerPath) request.ledger.save(request.ledgerPath);
      else request.ledger.save(revenueCatCliLedgerPath(request.cwd));
    }
  }
  return {
    disposition: complete ? "complete" : "incomplete",
    invoked,
    evidence: appliedEvidence(entitlementIds),
    replaySafe: false,
    nextAction: complete ? "complete" : "observe",
    effectProgress: complete ? "verified" : "applied-unverified",
  };
}

function observedSimulatePurchaseProductId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { product_id?: unknown; productId?: unknown; product?: unknown };
  if (typeof record.product_id === "string") return record.product_id;
  if (typeof record.productId === "string") return record.productId;
  if (record.product && typeof record.product === "object") {
    const product = record.product as { id?: unknown; store_identifier?: unknown };
    if (typeof product.id === "string") return product.id;
    if (typeof product.store_identifier === "string") return product.store_identifier;
  }
  return null;
}

function observeRevenue(request: CatalogSessionRequest): CatalogSessionResult {
  const kind = request.observationKind;
  if (!kind) {
    return refused(request, {
      status: "hold",
      code: "unscoped-observation",
      message: "Revenue/support observation requires an explicit scoped kind. Arbitrary customer lists are refused.",
      blocksUnrelatedWork: false,
    });
  }
  if (kind === "customer" && !request.customerId && !request.appUserId) {
    return refused(request, {
      status: "hold",
      code: "unscoped-observation",
      message: "Customer observation requires one customer id. customers list is excluded.",
      blocksUnrelatedWork: false,
    });
  }
  const operationId =
    kind === "customer"
      ? "rc.customers.show"
      : kind === "subscription"
        ? "rc.subscriptions.show"
        : kind === "metrics"
          ? "rc.metrics"
          : kind === "charts"
            ? "rc.charts.show"
            : "rc.audit";
  const listed = getRevenueCatCliOperation(operationId);
  if (!listed || listed.support !== "implemented-fixture") {
    return refused(request, {
      status: "hold",
      code: "unsupported-operation",
      message: `${operationId} is not an implemented observation.`,
      blocksUnrelatedWork: false,
    });
  }
  const step = runStep(request, operationId);
  if (!step.invoked) return refused(request, step.preflight, [step]);
  if (!step.json?.ok) {
    return { disposition: "incomplete", invoked: [step], evidence: emptyEvidence(request), replaySafe: true };
  }
  const evidence = emptyEvidence(request);
  return {
    disposition: "complete",
    invoked: [step],
    evidence: {
      ...evidence,
      observations: { scoped: true, kind, customer_records_exported: false },
    },
    replaySafe: true,
  };
}
