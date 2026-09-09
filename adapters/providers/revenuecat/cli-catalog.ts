/**
 * Selected RevenueCat CLI catalog, verification, preview, paywall inspect,
 * Test Store, and scoped observation routes. Uses the Increment A runner and
 * collector. Does not impersonate the REST probe or native purchase proof.
 */

import { CLI_PROOF_COLLECTOR, getRevenueCatCliOperation, type RevenueCatChartName } from "./cli-operations.js";
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
  readonly offering_verify?: { readonly complete: boolean; readonly issues: unknown };
  readonly preview?: {
    readonly offering_id: string | null;
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
    hostAuthorityGranted: request.hostAuthorityGranted,
    executable: request.executable,
    cwd: request.cwd,
    isolatedHome: request.isolatedHome,
    pathEnv: request.pathEnv,
    apiKey: request.apiKey,
    run: request.run,
    target: request.target,
    discovery: request.discovery,
    ...extra,
  });
}

function worstPagination(states: readonly ("complete" | "partial" | "unknown")[]): "complete" | "partial" | "unknown" {
  if (states.includes("unknown")) return "unknown";
  if (states.includes("partial")) return "partial";
  if (states.every((state) => state === "complete")) return "complete";
  return "unknown";
}

function refused(request: CatalogSessionRequest, hold: RevenueCatCliPreflight, invoked: readonly RevenueCatCliRunResult[] = []): CatalogSessionResult {
  return {
    disposition: "refused",
    hold,
    invoked,
    evidence: emptyEvidence(request),
    replaySafe: true,
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

function reconcileCatalog(request: CatalogSessionRequest): CatalogSessionResult {
  const products = runStep(request, "rc.products.list");
  const entitlements = runStep(request, "rc.entitlements.list");
  const offerings = runStep(request, "rc.offerings.list");
  const invoked: RevenueCatCliRunResult[] = [products, entitlements, offerings];
  for (const step of invoked) {
    if (!step.invoked) return refused(request, step.preflight, invoked);
    if (step.uncertainMutation) return { disposition: "uncertain", invoked, evidence: emptyEvidence(request), replaySafe: false };
    if (!step.json?.ok) return { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true };
  }
  const productIds = extractResourceIds(products.json && products.json.ok ? products.json.data : undefined);
  const entitlementIds = extractResourceIds(entitlements.json && entitlements.json.ok ? entitlements.json.data : undefined);
  const offeringIds = extractResourceIds(offerings.json && offerings.json.ok ? offerings.json.data : undefined);
  let packageIds: ReturnType<typeof extractResourceIds> = { ids: [], pagination: "unknown" };
  if (request.expected.offeringId) {
    const packages = runStep(request, "rc.offerings.packages", { offeringId: request.expected.offeringId });
    invoked.push(packages);
    if (!packages.invoked) return refused(request, packages.preflight, invoked);
    if (!packages.json?.ok) return { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true };
    packageIds = extractResourceIds(packages.json.data);
  }
  const pagination = worstPagination([productIds.pagination, entitlementIds.pagination, offeringIds.pagination, request.expected.offeringId ? packageIds.pagination : "complete"]);
  const missing = [
    ...reconcileExpectedIds(request.expected.productIds, productIds.ids).missing,
    ...reconcileExpectedIds(request.expected.entitlementIds, entitlementIds.ids).missing,
    ...reconcileExpectedIds(request.expected.offeringId ? [request.expected.offeringId] : undefined, offeringIds.ids).missing,
    ...reconcileExpectedIds(request.expected.packageIds, packageIds.ids).missing,
  ];
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
  const create = runStep(request, "rc.catalog.create", { offeringId: request.expected.offeringId });
  invoked.push(create);
  if (!create.invoked) return refused(request, create.preflight, invoked);
  if (create.uncertainMutation) {
    return {
      disposition: "uncertain",
      invoked,
      evidence: { ...evidence, catalog: { ...catalog, created: true }, created: true, pagination },
      replaySafe: false,
    };
  }
  if (!create.json?.ok) {
    return { disposition: "incomplete", invoked, evidence: { ...evidence, catalog, pagination }, replaySafe: true };
  }
  const readback = runStep(request, "rc.offerings.list");
  invoked.push(readback);
  const readbackIds = readback.json?.ok ? extractResourceIds(readback.json.data) : { ids: offeringIds.ids, pagination: "unknown" as const };
  return {
    disposition: readbackIds.ids.includes(request.expected.offeringId ?? "") ? "complete" : "incomplete",
    invoked,
    evidence: {
      ...evidence,
      catalog: {
        ...catalog,
        offering_ids: readbackIds.ids,
        created: true,
        reconciled: Boolean(request.expected.offeringId && readbackIds.ids.includes(request.expected.offeringId)),
        missing_ids: request.expected.offeringId && readbackIds.ids.includes(request.expected.offeringId) ? missing.filter((id) => id !== request.expected.offeringId) : missing,
      },
      created: true,
      pagination: worstPagination([pagination, readbackIds.pagination]),
    },
    replaySafe: true,
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
    evidence: { ...evidence, offering_verify: { complete: verdict.complete, issues: verdict.issues } },
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
    disposition: interpreted.wrongApp ? "incomplete" : interpreted.complete ? "complete" : "incomplete",
    invoked: [preview],
    evidence: {
      ...evidence,
      preview: {
        offering_id: interpreted.offeringId,
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
  if (!purchase.invoked) return refused(request, purchase.preflight, [purchase]);
  if (purchase.uncertainMutation) {
    return { disposition: "uncertain", invoked: [purchase], evidence: emptyEvidence(request), replaySafe: false };
  }
  if (!purchase.json?.ok) {
    return { disposition: "incomplete", invoked: [purchase], evidence: emptyEvidence(request), replaySafe: true };
  }
  const customerId = request.customerId ?? request.appUserId;
  const readback = runStep(request, "rc.customers.show", { customerId });
  const invoked = [purchase, readback];
  if (!readback.invoked) return refused(request, readback.preflight, invoked);
  if (!readback.json?.ok) {
    return { disposition: "incomplete", invoked, evidence: emptyEvidence(request), replaySafe: true };
  }
  const entitlementIds = extractEntitlementIds(readback.json.data);
  const evidence = emptyEvidence(request);
  return {
    disposition: entitlementIds.length > 0 ? "complete" : "incomplete",
    invoked,
    evidence: {
      ...evidence,
      test_store: {
        executed: true,
        product_id: request.productId ?? null,
        entitlement_ids: entitlementIds,
        not_native_purchase_proof: true,
        not_in_app_ui_proof: true,
        not_app_store_or_play_proof: true,
      },
    },
    replaySafe: true,
  };
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
