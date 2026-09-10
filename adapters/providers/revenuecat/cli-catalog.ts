/**
 * Selected RevenueCat CLI catalog, verification, preview, paywall inspect,
 * Test Store, and scoped observation routes. Uses the Increment A runner and
 * collector. Does not impersonate the REST probe or native purchase proof.
 */

import { CLI_PROOF_COLLECTOR, getRevenueCatCliOperation, isMutationEffect, type RevenueCatChartName } from "./cli-operations.js";
import {
  classifyRevenueCatAppStoreKind,
  extractEntitlementIds,
  extractResourceIds,
  interpretOfferingPreview,
  offeringVerifyIsComplete,
  runRevenueCatCli,
  type RevenueCatCliRunRequest,
  type RevenueCatCliRunResult,
} from "./cli-execute.js";
import type { RevenueCatObservedStoreKind } from "./cli-decode.js";
import type { RevenueCatCliDiscovery } from "./cli-discovery.js";
import type { RevenueCatCliHoldCode, RevenueCatCliPreflight, RevenueCatCliTarget } from "./cli-preflight.js";
import type { CliProcessRunner } from "./cli-process.js";
import type { CliEffectProgress, CliNextAction, RevenueCatCliLedger, RevenueCatCliLedgerEntry } from "./cli-ledger.js";
import { revenueCatCliLedgerPath } from "./cli-ledger.js";
import {
  emptyObservedCollection,
  idsFromObserved,
  observedEntitlementsFromList,
  observedOfferingsFromList,
  observedPackagesFromList,
  observedProductsFromList,
  overlayVerifyGraph,
} from "./cli-catalog-observe.js";
import {
  planRevenueCatCatalogRepair,
  type DesiredRevenueCatCatalog,
  type ObservedRevenueCatCatalog,
  type RevenueCatCatalogRepairPlan,
  type RevenueCatRepairAction,
} from "./cli-reconcile-plan.js";

export type { DesiredRevenueCatCatalog };

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
  readonly desired?: DesiredRevenueCatCatalog;
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
  readonly live: boolean;
  readonly cli_executable: string;
  readonly cli_version: string | null;
  readonly project_id: string;
  readonly app_id: string;
  readonly observed_store_kind?: RevenueCatObservedStoreKind;
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
    readonly protocol_valid?: boolean;
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
    live: request.synthetic === false,
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
      protocol_valid: false,
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
  const observedStoreKind = classifyRevenueCatAppStoreKind(app.json.data);
  const evidence = emptyEvidence(request);
  const next: RevenueCatCliCatalogEvidence = {
    ...evidence,
    observed_store_kind: observedStoreKind,
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

function mutationIdempotencyKey(request: CatalogSessionRequest, action: RevenueCatRepairAction): string | undefined {
  if (!request.idempotencyKey?.trim()) return undefined;
  return `${request.idempotencyKey}:${action.kind}:${action.entity}:${action.businessKey}`;
}

function repairActionKey(action: Pick<RevenueCatRepairAction, "kind" | "entity" | "businessKey">): string {
  return `${action.kind}:${action.entity}:${action.businessKey}`;
}

function priorAppliedEntries(request: CatalogSessionRequest): readonly RevenueCatCliLedgerEntry[] {
  if (!request.ledger || !request.idempotencyKey) return [];
  const prefix = `${request.idempotencyKey}:`;
  return request.ledger.entries().filter((entry) => {
    if (entry.idempotencyKey !== request.idempotencyKey && !entry.idempotencyKey.startsWith(prefix)) return false;
    return entry.state === "applied-unverified" || entry.state === "verified";
  });
}

function preservedMutationEvidence(request: CatalogSessionRequest): RevenueCatCliCatalogEvidence {
  const evidence = emptyEvidence(request);
  const offeringIds: string[] = [];
  const productIds: string[] = [];
  const entitlementIds: string[] = [];
  const packageIds: string[] = [];
  for (const entry of priorAppliedEntries(request)) {
    if (!entry.remoteId) continue;
    switch (entry.binding.operationId) {
      case "rc.catalog.create":
        offeringIds.push(entry.remoteId);
        break;
      case "rc.products.create":
        productIds.push(entry.remoteId);
        break;
      case "rc.entitlements.create":
        entitlementIds.push(entry.remoteId);
        break;
      case "rc.packages.create":
        packageIds.push(entry.remoteId);
        break;
      default:
        break;
    }
  }
  return {
    ...evidence,
    catalog: {
      ...evidence.catalog,
      offering_ids: offeringIds,
      product_ids: productIds,
      entitlement_ids: entitlementIds,
      package_ids: packageIds,
      created: true,
    },
    created: true,
  };
}

function desiredCatalog(request: CatalogSessionRequest): DesiredRevenueCatCatalog {
  if (request.desired) return request.desired;
  const offeringLookup = request.offeringCreate?.lookupKey ?? request.expected.offeringId;
  const productStoreIds = request.expected.productIds ?? [];
  return {
    projectId: request.expected.projectId,
    appId: request.expected.appId,
    offering: offeringLookup
      ? { lookupKey: offeringLookup, displayName: request.offeringCreate?.displayName ?? offeringLookup }
      : undefined,
    products: productStoreIds.map((storeIdentifier) => ({
      storeIdentifier,
      type: "subscription",
      appId: request.expected.appId,
    })),
    entitlements: (request.expected.entitlementIds ?? []).map((lookupKey) => ({
      lookupKey,
      displayName: lookupKey,
      productStoreIdentifiers: productStoreIds,
    })),
    packages: (request.expected.packageIds ?? []).map((lookupKey) => ({
      lookupKey,
      displayName: lookupKey,
      offeringLookupKey: offeringLookup ?? lookupKey,
      productStoreIdentifiers: productStoreIds,
    })),
  };
}

function coverageToPagination(coverage: ObservedRevenueCatCatalog["offerings"]["coverage"]): "complete" | "partial" | "unknown" {
  switch (coverage) {
    case "complete":
      return "complete";
    case "partial":
      return "partial";
    case "unknown":
    case "invalid":
      return "unknown";
    default: {
      const exhaustive: never = coverage;
      return exhaustive;
    }
  }
}

function missingFromPlan(
  plan: RevenueCatCatalogRepairPlan,
  expected: ExpectedCatalog,
  observed: ObservedRevenueCatCatalog,
): readonly string[] {
  const planned = plan.actions
    .filter((action) => action.kind === "create" || action.kind === "hold" || action.kind === "conflict" || action.kind === "attach")
    .map((action) => action.businessKey);
  return [...new Set([...planned, ...expectedCatalogMissing(expected, idsFromObserved(observed))])];
}

function seedRemotes(plan: RevenueCatCatalogRepairPlan, remotes: Map<string, string>): void {
  for (const action of plan.actions) {
    if (action.kind === "no-op" && action.remoteRef?.remoteId) {
      remotes.set(`${action.entity}:${action.businessKey}`, action.remoteRef.remoteId);
    }
  }
}

function parentBusinessKey(action: RevenueCatRepairAction): string {
  const separator = action.businessKey.indexOf(":");
  return separator === -1 ? action.businessKey : action.businessKey.slice(0, separator);
}

function dependenciesMet(action: RevenueCatRepairAction, remotes: ReadonlyMap<string, string>): boolean {
  for (const dependency of action.dependsOn) {
    const parts = dependency.split(":");
    if (parts[0] !== "create" || !parts[1]) continue;
    const remoteKey = `${parts[1]}:${parts.slice(2).join(":")}`;
    if (parts[1] === "offering" && action.createInputs?.offeringRemoteId) continue;
    if (!remotes.has(remoteKey)) return false;
  }
  return true;
}

function seedObservedRemotes(observed: ObservedRevenueCatCatalog, remotes: Map<string, string>): void {
  for (const item of observed.offerings.items) {
    if (item.lookupKey && item.remoteId) remotes.set(`offering:${item.lookupKey}`, item.remoteId);
  }
  for (const item of observed.products.items) {
    if (item.storeIdentifier && item.remoteId) remotes.set(`product:${item.storeIdentifier}`, item.remoteId);
  }
  for (const item of observed.entitlements.items) {
    if (item.lookupKey && item.remoteId) remotes.set(`entitlement:${item.lookupKey}`, item.remoteId);
  }
  for (const item of observed.packages.items) {
    if (item.lookupKey && item.remoteId) remotes.set(`package:${item.lookupKey}`, item.remoteId);
  }
}

function extrasForRepairAction(
  action: RevenueCatRepairAction,
  remotes: ReadonlyMap<string, string>,
  desired: DesiredRevenueCatCatalog,
): Partial<Omit<RevenueCatCliRunRequest, "executable" | "cwd" | "isolatedHome" | "pathEnv" | "run" | "target" | "discovery" | "hostAuthorityGranted" | "operationId">> | undefined {
  switch (action.operationId) {
    case "rc.catalog.create":
      return { lookupKey: action.createInputs?.lookupKey, displayName: action.createInputs?.displayName };
    case "rc.products.create":
      return {
        storeIdentifier: action.createInputs?.storeIdentifier,
        productType: action.createInputs?.productType,
        appId: action.createInputs?.appId ?? desired.appId,
        displayName: action.createInputs?.displayName,
        duration: action.createInputs?.duration,
      };
    case "rc.entitlements.create":
      return { lookupKey: action.createInputs?.lookupKey, displayName: action.createInputs?.displayName };
    case "rc.packages.create": {
      const offeringId =
        action.createInputs?.offeringRemoteId ??
        (desired.offering ? remotes.get(`offering:${desired.offering.lookupKey}`) : undefined);
      if (!offeringId) return undefined;
      return {
        offeringId,
        lookupKey: action.createInputs?.lookupKey,
        displayName: action.createInputs?.displayName,
      };
    }
    case "rc.entitlements.attach": {
      const parentRemoteId =
        action.attach?.parentRemoteId ?? remotes.get(`entitlement:${parentBusinessKey(action)}`);
      const attachProductIds = (action.attach?.productRemoteIds ?? [])
        .map((id, index) => id ?? remotes.get(`product:${action.attach?.productStoreIdentifiers[index] ?? ""}`))
        .filter((id): id is string => Boolean(id));
      if (!parentRemoteId || attachProductIds.length === 0) return undefined;
      return { entitlementId: parentRemoteId, attachProductIds };
    }
    case "rc.packages.attach": {
      const parentRemoteId = action.attach?.parentRemoteId ?? remotes.get(`package:${parentBusinessKey(action)}`);
      const attachProductIds = (action.attach?.productRemoteIds ?? [])
        .map((id, index) => id ?? remotes.get(`product:${action.attach?.productStoreIdentifiers[index] ?? ""}`))
        .filter((id): id is string => Boolean(id));
      if (!parentRemoteId || attachProductIds.length === 0) return undefined;
      return { packageId: parentRemoteId, attachProductIds };
    }
    case null:
      return undefined;
    default: {
      const exhaustive: never = action.operationId;
      return exhaustive;
    }
  }
}

function offeringRemoteHint(
  request: CatalogSessionRequest,
  offerings: ObservedRevenueCatCatalog["offerings"],
  desired: DesiredRevenueCatCatalog,
): string | undefined {
  const lookup = desired.offering?.lookupKey;
  if (lookup) {
    const match = offerings.items.find((item) => item.lookupKey === lookup && item.remoteId);
    if (match?.remoteId) return match.remoteId;
  }
  for (const entry of priorAppliedEntries(request)) {
    if (entry.binding.operationId === "rc.catalog.create" && entry.remoteId) return entry.remoteId;
  }
  if (request.expected.offeringId && offerings.items.some((item) => item.remoteId === request.expected.offeringId)) {
    return request.expected.offeringId;
  }
  return undefined;
}

function readObservedCatalog(
  request: CatalogSessionRequest,
  invoked: RevenueCatCliRunResult[],
  desired: DesiredRevenueCatCatalog,
):
  | { readonly ok: true; readonly observed: ObservedRevenueCatCatalog; readonly pagination: "complete" | "partial" | "unknown" }
  | { readonly ok: false; readonly result: CatalogSessionResult } {
  const failRead = (): { readonly ok: false; readonly result: CatalogSessionResult } => {
    const prior = priorAppliedEntries(request);
    if (prior.length > 0) {
      return {
        ok: false,
        result: {
          disposition: "incomplete",
          invoked,
          evidence: preservedMutationEvidence(request),
          replaySafe: false,
          nextAction: "observe",
          effectProgress: prior.some((entry) => entry.state === "applied-unverified") ? "applied-unverified" : "verified",
        },
      };
    }
    return { ok: false, result: { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true } };
  };

  const products = runStep(request, "rc.products.list");
  const entitlements = runStep(request, "rc.entitlements.list");
  const offerings = runStep(request, "rc.offerings.list");
  invoked.push(products, entitlements, offerings);
  for (const step of [products, entitlements, offerings]) {
    if (!step.invoked) return { ok: false, result: refused(request, step.preflight, invoked) };
    if (step.uncertainMutation) {
      return {
        ok: false,
        result: {
          disposition: "uncertain",
          invoked,
          evidence: emptyEvidence(request),
          replaySafe: false,
          nextAction: "hold-uncertain",
          effectProgress: "dispatched-unconfirmed",
        },
      };
    }
    if (!step.json?.ok) return failRead();
  }

  const observedOfferings = observedOfferingsFromList(offerings);
  const offeringId = offeringRemoteHint(request, observedOfferings, desired);
  let packagesStep: RevenueCatCliRunResult | undefined;
  if (offeringId) {
    packagesStep = runStep(request, "rc.offerings.packages", { offeringId });
    invoked.push(packagesStep);
    if (!packagesStep.invoked) return { ok: false, result: refused(request, packagesStep.preflight, invoked) };
    if (!packagesStep.json?.ok) return failRead();
  }

  let observed: ObservedRevenueCatCatalog = {
    projectId: request.expected.projectId,
    appId: request.expected.appId,
    offerings: observedOfferings,
    products: observedProductsFromList(products),
    entitlements: observedEntitlementsFromList(entitlements),
    packages:
      offeringId && packagesStep
        ? observedPackagesFromList(packagesStep)
        : emptyObservedCollection(
            observedOfferings.protocolValid && observedOfferings.coverage === "complete" ? "complete" : "unknown",
            observedOfferings.protocolValid,
          ),
  };

  if (offeringId) {
    const verify = runStep(request, "rc.offerings.verify", { offeringId });
    invoked.push(verify);
    if (verify.invoked && verify.json?.ok && verify.observation?.kind === "verify") {
      observed = overlayVerifyGraph(observed, verify.json.data, verify.observation.protocolValid);
    }
  }

  return {
    ok: true,
    observed,
    pagination: worstPagination([
      coverageToPagination(observed.offerings.coverage),
      coverageToPagination(observed.products.coverage),
      coverageToPagination(observed.entitlements.coverage),
      coverageToPagination(observed.packages.coverage),
    ]),
  };
}

function catalogAccepted(plan: RevenueCatCatalogRepairPlan): boolean {
  return plan.complete && plan.reconciled && plan.protocolValid;
}

function mergeIds(left: readonly string[], right: readonly string[]): readonly string[] {
  return [...new Set([...left, ...right])];
}

function evidenceFromPlan(
  request: CatalogSessionRequest,
  plan: RevenueCatCatalogRepairPlan,
  observed: ObservedRevenueCatCatalog,
  pagination: "complete" | "partial" | "unknown",
  created: boolean,
): RevenueCatCliCatalogEvidence {
  const evidence = emptyEvidence(request);
  const ids = idsFromObserved(observed);
  const preserved = created ? preservedMutationEvidence(request) : evidence;
  const reconciled = catalogAccepted(plan);
  return {
    ...evidence,
    catalog: {
      ...evidence.catalog,
      product_ids: mergeIds(ids.productIds, preserved.catalog.product_ids),
      entitlement_ids: mergeIds(ids.entitlementIds, preserved.catalog.entitlement_ids),
      offering_ids: mergeIds(ids.offeringIds, preserved.catalog.offering_ids),
      package_ids: mergeIds(ids.packageIds, preserved.catalog.package_ids),
      missing_ids: missingFromPlan(plan, request.expected, observed),
      reconciled,
      created,
      protocol_valid: plan.protocolValid,
    },
    created,
    pagination,
  };
}

function dispositionFromPlan(
  plan: RevenueCatCatalogRepairPlan,
  pagination: "complete" | "partial" | "unknown",
): CatalogSessionDisposition {
  if (catalogAccepted(plan)) return "complete";
  if (pagination === "partial" || plan.collectionHolds.some((hold) => hold.coverage === "partial")) return "partial";
  return "incomplete";
}

function plannedWrites(plan: RevenueCatCatalogRepairPlan): readonly RevenueCatRepairAction[] {
  return plan.actions.filter((action) => (action.kind === "create" || action.kind === "attach") && action.operationId);
}

function reconcileCatalog(request: CatalogSessionRequest): CatalogSessionResult {
  const desired = desiredCatalog(request);
  const invoked: RevenueCatCliRunResult[] = [];
  const firstRead = readObservedCatalog(request, invoked, desired);
  if (!firstRead.ok) return firstRead.result;
  let observed = firstRead.observed;
  let pagination = firstRead.pagination;
  let plan = planRevenueCatCatalogRepair(desired, observed);
  const remotes = new Map<string, string>();
  seedRemotes(plan, remotes);
  seedObservedRemotes(observed, remotes);
  for (const entry of priorAppliedEntries(request)) {
    if (!entry.remoteId) continue;
    if (entry.binding.storeIdentifier) remotes.set(`product:${entry.binding.storeIdentifier}`, entry.remoteId);
    if (entry.binding.lookupKey && entry.binding.operationId === "rc.catalog.create") {
      remotes.set(`offering:${entry.binding.lookupKey}`, entry.remoteId);
    }
    if (entry.binding.lookupKey && entry.binding.operationId === "rc.entitlements.create") {
      remotes.set(`entitlement:${entry.binding.lookupKey}`, entry.remoteId);
    }
    if (entry.binding.lookupKey && entry.binding.operationId === "rc.packages.create") {
      remotes.set(`package:${entry.binding.lookupKey}`, entry.remoteId);
    }
  }

  const writes = plannedWrites(plan);
  if (catalogAccepted(plan)) {
    return {
      disposition: "complete",
      invoked,
      evidence: evidenceFromPlan(request, plan, observed, pagination, false),
      replaySafe: true,
      nextAction: "complete",
      effectProgress: "no-effect",
    };
  }
  if (writes.length > 0 && !request.hostAuthorityGranted) {
    return refused(
      request,
      {
        status: "hold",
        code: "authority-missing",
        message:
          "Catalog repair writes are planned, but create/attach is refused without host authority. Existing ids were read back; the process was not asked to duplicate or invent them.",
        blocksUnrelatedWork: false,
      },
      invoked,
    );
  }
  if (!request.createIfMissing || writes.length === 0) {
    return {
      disposition: dispositionFromPlan(plan, pagination),
      invoked,
      evidence: evidenceFromPlan(request, plan, observed, pagination, priorAppliedEntries(request).length > 0),
      replaySafe: priorAppliedEntries(request).length === 0,
      nextAction: catalogAccepted(plan) ? "complete" : "observe",
      effectProgress: priorAppliedEntries(request).length > 0 ? "applied-unverified" : "no-effect",
    };
  }

  const attempted = new Set<string>();
  let created = priorAppliedEntries(request).length > 0;
  for (let wave = 0; wave < 12; wave += 1) {
    if (catalogAccepted(plan)) break;
    const next = plannedWrites(plan).find((action) => {
      if (attempted.has(repairActionKey(action)) || !dependenciesMet(action, remotes)) return false;
      return extrasForRepairAction(action, remotes, desired) !== undefined;
    });
    if (!next || !next.operationId) break;
    const extras = extrasForRepairAction(next, remotes, desired);
    if (!extras) continue;
    attempted.add(repairActionKey(next));
    const key = mutationIdempotencyKey(request, next);
    const step = runStep(request, next.operationId, {
      ...extras,
      ...(key ? { idempotencyKey: key } : {}),
    });
    invoked.push(step);
    if (!step.invoked && step.resumed !== true) return refused(request, step.preflight, invoked);
    if (step.uncertainMutation) {
      return {
        disposition: "uncertain",
        invoked,
        evidence: { ...evidenceFromPlan(request, plan, observed, pagination, true), created: true },
        replaySafe: false,
        nextAction: "hold-uncertain",
        effectProgress: "dispatched-unconfirmed",
      };
    }
    if (!step.json?.ok && step.resumed !== true) {
      return {
        disposition: "uncertain",
        invoked,
        evidence: evidenceFromPlan(request, plan, observed, pagination, created),
        replaySafe: false,
        nextAction: "hold-uncertain",
        effectProgress: "dispatched-unconfirmed",
      };
    }
    created = true;
    if (step.remoteId) remotes.set(`${next.entity}:${next.businessKey}`, step.remoteId);
    const after = readObservedCatalog(request, invoked, desired);
    if (!after.ok) return after.result;
    observed = after.observed;
    pagination = after.pagination;
    plan = planRevenueCatCatalogRepair(desired, observed);
    seedRemotes(plan, remotes);
    seedObservedRemotes(observed, remotes);
  }

  const accepted = catalogAccepted(plan);
  return {
    disposition: dispositionFromPlan(plan, pagination),
    invoked,
    evidence: evidenceFromPlan(request, plan, observed, pagination, created),
    replaySafe: false,
    nextAction: accepted ? "complete" : "observe",
    effectProgress: accepted ? "verified" : created ? "applied-unverified" : "no-effect",
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
  const app = runStep(request, "rc.apps.show", { appId: request.expected.appId });
  if (!app.invoked) return refused(request, app.preflight, [app]);
  if (app.uncertainMutation) {
    return { disposition: "uncertain", invoked: [app], evidence: emptyEvidence(request), replaySafe: false };
  }
  if (!app.json?.ok) {
    return { disposition: "incomplete", invoked: [app], evidence: emptyEvidence(request), replaySafe: true };
  }
  const observedStoreKind = classifyRevenueCatAppStoreKind(app.json.data);
  if (observedStoreKind !== "test-store") {
    const refusedResult = refused(
      request,
      {
        status: "hold",
        code: "production-test-store-refused",
        message:
          "customers simulate-purchase is refused until the CLI-read app is a Test Store. Caller labels and profile names are not that proof.",
        blocksUnrelatedWork: false,
      },
      [app],
    );
    return { ...refusedResult, evidence: { ...refusedResult.evidence, observed_store_kind: observedStoreKind } };
  }
  const purchase = runStep(request, "rc.customers.simulate-purchase", {
    appId: request.expected.appId,
    productId: request.productId,
    appUserId: request.appUserId,
  });
  if (!purchase.invoked && purchase.resumed !== true) return refused(request, purchase.preflight, [app, purchase]);
  if (purchase.uncertainMutation) {
    return {
      disposition: "uncertain",
      invoked: [app, purchase],
      evidence: { ...emptyEvidence(request), observed_store_kind: observedStoreKind },
      replaySafe: false,
      nextAction: "hold-uncertain",
      effectProgress: "dispatched-unconfirmed",
    };
  }
  if (!purchase.json?.ok) {
    return {
      disposition: "uncertain",
      invoked: [app, purchase],
      evidence: { ...emptyEvidence(request), observed_store_kind: observedStoreKind },
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
      observed_store_kind: observedStoreKind,
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
  const invoked = [app, purchase, readback];
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
