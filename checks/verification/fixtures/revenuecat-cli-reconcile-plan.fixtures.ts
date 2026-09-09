import { readFileSync } from "node:fs";
import path from "node:path";
import { assert, skillRoot, type Harness } from "./_harness.js";
import { getRevenueCatCliOperation, REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import {
  planRevenueCatCatalogRepair,
  repairPlanIsComplete,
  repairPlanOperationIds,
  REVENUECAT_CATALOG_PLAN_PIN,
  REVENUECAT_REPAIR_OPERATIONS,
  type RevenueCatCatalogRepairPlan,
  type RevenueCatRepairAction,
} from "../../../adapters/providers/revenuecat/cli-reconcile-plan.js";
import {
  DESIRED_PREMIUM_MONTHLY,
  desiredWithPrice,
  matchingObservedCatalog,
  observedAmbiguousOffering,
  observedExtraRemoteProduct,
  observedInvalidLists,
  observedLookupKeyEqualsRemoteId,
  observedPartialMissingProduct,
  observedProductOnWrongPackage,
  observedProductUnattached,
  observedUnknownCoverageWithIds,
  observedWithoutEntitlement,
  observedWithoutOffering,
  observedWithoutPackage,
  observedWithoutProduct,
  observedWrongPrice,
  observedWrongProductType,
  REVENUECAT_CATALOG_PLAN_SAMPLE_PIN,
} from "./revenuecat-cli-reconcile-plan.samples.js";

function kinds(plan: RevenueCatCatalogRepairPlan): readonly string[] {
  return plan.actions.filter((action) => action.kind !== "no-op" && action.kind !== "extra").map((action) => `${action.kind}:${action.entity}:${action.reason}`);
}

function actionsOf(plan: RevenueCatCatalogRepairPlan, kind: RevenueCatRepairAction["kind"]): readonly RevenueCatRepairAction[] {
  return plan.actions.filter((action) => action.kind === kind);
}

function assertNoOfferingCreate(plan: RevenueCatCatalogRepairPlan, context: string): void {
  assert(
    !repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.offeringCreate),
    `${context}: offering create must not appear (${plan.operationIds.join(",")})`,
  );
}

function forbiddenOwnerImports(source: string): readonly string[] {
  const needles = [
    "buildRevenueCatCliArgv",
    "cli-execute.js",
    "cli-catalog.js",
    "cli-decode.js",
    "cli-command-schema.js",
    "cli-ledger.js",
    "runRevenueCatCli",
    "runRevenueCatCatalogSession",
  ];
  return needles.filter((needle) => source.includes(needle));
}

export function register(harness: Harness): void {
  harness.check("revenuecat-cli-reconcile-plan: pin matches executable candidate", () => {
    assert(REVENUECAT_CATALOG_PLAN_PIN.commit === REVENUECAT_CLI_RELEASE.commit, REVENUECAT_CATALOG_PLAN_PIN.commit);
    assert(REVENUECAT_CATALOG_PLAN_SAMPLE_PIN.commit === REVENUECAT_CLI_RELEASE.commit, REVENUECAT_CATALOG_PLAN_SAMPLE_PIN.commit);
    assert(REVENUECAT_CATALOG_PLAN_PIN.tag === REVENUECAT_CLI_RELEASE.tag, REVENUECAT_CATALOG_PLAN_PIN.tag);
    for (const operationId of Object.values(REVENUECAT_REPAIR_OPERATIONS)) {
      const spec = getRevenueCatCliOperation(operationId);
      assert(spec?.support === "implemented-fixture", `${operationId} missing from the reviewed matrix`);
    }
  });

  harness.check("revenuecat-cli-reconcile-plan: matching catalog is complete with opaque ids and no mutations", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, matchingObservedCatalog());
    assert(repairPlanIsComplete(plan), kinds(plan).join("; "));
    assert(plan.reconciled === true && plan.complete === plan.reconciled, "complete and reconciled are one predicate");
    assert(plan.operationIds.length === 0, plan.operationIds.join(","));
    const offering = plan.actions.find((action) => action.entity === "offering" && action.kind === "no-op");
    assert(offering?.remoteRef?.provider === "revenuecat", JSON.stringify(offering?.remoteRef));
    assert(offering?.remoteRef?.remoteId === "ofrng", "must reuse ofrng, not invent a lookup-shaped id");
    assert(plan.actions.some((action) => action.entity === "product" && action.remoteRef?.remoteId === "prod"), "product remote id");
    assert(plan.actions.some((action) => action.entity === "entitlement" && action.remoteRef?.remoteId === "ent"), "entitlement remote id");
    assert(plan.actions.some((action) => action.entity === "package" && action.remoteRef?.remoteId === "pkg"), "package remote id");
  });

  harness.check("revenuecat-cli-reconcile-plan: missing product repairs product and attachments, not offering create", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedWithoutProduct());
    assert(plan.complete === false && plan.reconciled === false, "protocol-valid lists are not business-complete");
    assert(plan.protocolValid === true, "lists stayed protocol-valid");
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.productCreate), plan.operationIds.join(","));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.entitlementAttach), plan.operationIds.join(","));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.packageAttach), plan.operationIds.join(","));
    assertNoOfferingCreate(plan, "missing product");
    const create = actionsOf(plan, "create").find((action) => action.entity === "product");
    assert(create?.createInputs?.storeIdentifier === "monthly", JSON.stringify(create?.createInputs));
    assert(create?.createInputs?.productType === "subscription", JSON.stringify(create?.createInputs));
    const attach = actionsOf(plan, "attach").find((action) => action.entity === "package-product");
    assert(attach?.attach?.productRemoteIds.every((id) => id === null), "must not invent a product remote id");
    assert(attach?.dependsOn.includes("create:product:monthly") === true, (attach?.dependsOn ?? []).join(","));
  });

  harness.check("revenuecat-cli-reconcile-plan: missing entitlement repairs entitlement, not offering create", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedWithoutEntitlement());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.entitlementCreate), plan.operationIds.join(","));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.entitlementAttach), plan.operationIds.join(","));
    assertNoOfferingCreate(plan, "missing entitlement");
    const create = actionsOf(plan, "create").find((action) => action.entity === "entitlement");
    assert(create?.createInputs?.lookupKey === "premium", JSON.stringify(create?.createInputs));
    assert(create?.createInputs?.displayName === "Premium", JSON.stringify(create?.createInputs));
  });

  harness.check("revenuecat-cli-reconcile-plan: missing package repairs package, not offering create", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedWithoutPackage());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.packageCreate), plan.operationIds.join(","));
    assertNoOfferingCreate(plan, "missing package");
    const create = actionsOf(plan, "create").find((action) => action.entity === "package");
    assert(create?.createInputs?.lookupKey === "$rc_monthly", JSON.stringify(create?.createInputs));
    assert(create?.createInputs?.offeringRemoteId === "ofrng", "package create uses the observed offering remote id");
  });

  harness.check("revenuecat-cli-reconcile-plan: unknown coverage with all ids is not complete and does not create", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedUnknownCoverageWithIds());
    assert(plan.complete === false && plan.reconciled === false, "unknown coverage cannot be complete");
    assert(plan.coverageComplete === false, JSON.stringify(plan.collectionHolds));
    assert(plan.collectionHolds.some((hold) => hold.reason === "unknown-coverage"), JSON.stringify(plan.collectionHolds));
    assert(plan.operationIds.length === 0, `unknown coverage must not create: ${plan.operationIds.join(",")}`);
    assert(actionsOf(plan, "create").length === 0, kinds(plan).join("; "));
    assert(plan.actions.some((action) => action.kind === "no-op" && action.remoteRef?.remoteId === "ofrng"), "seen offering remains reusable");
  });

  harness.check("revenuecat-cli-reconcile-plan: unattached product plans attach only", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedProductUnattached());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "create").length === 0, "entities exist; only relationships are missing");
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.entitlementAttach), plan.operationIds.join(","));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.packageAttach), plan.operationIds.join(","));
    assertNoOfferingCreate(plan, "unattached product");
    const attach = actionsOf(plan, "attach").find((action) => action.entity === "package-product");
    assert(attach?.attach?.parentRemoteId === "pkg", JSON.stringify(attach?.attach));
    assert(attach?.attach?.productRemoteIds.includes("prod"), "attach uses the observed product remote id");
  });

  harness.check("revenuecat-cli-reconcile-plan: wrong package attachment is not reconciled from id presence", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedProductOnWrongPackage());
    assert(plan.complete === false && plan.reconciled === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "conflict").some((action) => action.reason === "relationship-mismatch"), kinds(plan).join("; "));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.packageAttach), plan.operationIds.join(","));
    assertNoOfferingCreate(plan, "wrong package");
  });

  harness.check("revenuecat-cli-reconcile-plan: wrong product type is a conflict, not offering create", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedWrongProductType());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "conflict").some((action) => action.reason === "type-mismatch"), kinds(plan).join("; "));
    assert(plan.operationIds.length === 0, plan.operationIds.join(","));
    assertNoOfferingCreate(plan, "type mismatch");
  });

  harness.check("revenuecat-cli-reconcile-plan: selected price mismatch is not accepted as reconciled", () => {
    const plan = planRevenueCatCatalogRepair(desiredWithPrice(4_990_000), observedWrongPrice());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "conflict").some((action) => action.reason === "price-mismatch"), kinds(plan).join("; "));
    assertNoOfferingCreate(plan, "price mismatch");
  });

  harness.check("revenuecat-cli-reconcile-plan: lookup key equal to a remote id is identity mismatch", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedLookupKeyEqualsRemoteId());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "conflict").some((action) => action.reason === "identity-mismatch"), kinds(plan).join("; "));
    assertNoOfferingCreate(plan, "confused offering identity");
  });

  harness.check("revenuecat-cli-reconcile-plan: extra remote is reported and not deleted", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedExtraRemoteProduct());
    assert(repairPlanIsComplete(plan), kinds(plan).join("; "));
    const extra = actionsOf(plan, "extra").find((action) => action.entity === "product");
    assert(extra?.remoteRef?.remoteId === "prod_lifetime", JSON.stringify(extra));
    assert(extra?.reason === "extra-remote", extra?.reason);
    assert(plan.operationIds.length === 0, "extras must not dispatch deletes");
  });

  harness.check("revenuecat-cli-reconcile-plan: ambiguous lookup keys hold create", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedAmbiguousOffering());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "conflict").some((action) => action.reason === "ambiguous-identity"), kinds(plan).join("; "));
    assertNoOfferingCreate(plan, "ambiguous offering");
  });

  harness.check("revenuecat-cli-reconcile-plan: invalid observations are not empty-missing creates", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedInvalidLists());
    assert(plan.complete === false && plan.protocolValid === false, kinds(plan).join("; "));
    assert(plan.collectionHolds.every((hold) => hold.reason === "invalid-observation"), JSON.stringify(plan.collectionHolds));
    assert(actionsOf(plan, "create").length === 0, kinds(plan).join("; "));
    assert(actionsOf(plan, "hold").length > 0, kinds(plan).join("; "));
  });

  harness.check("revenuecat-cli-reconcile-plan: partial page without the product holds instead of creating", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedPartialMissingProduct());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(actionsOf(plan, "hold").some((action) => action.entity === "product" && action.reason === "unknown-coverage"), kinds(plan).join("; "));
    assert(actionsOf(plan, "create").length === 0, kinds(plan).join("; "));
    assertNoOfferingCreate(plan, "partial products page");
  });

  harness.check("revenuecat-cli-reconcile-plan: missing offering still plans entity-specific creates beside it", () => {
    const plan = planRevenueCatCatalogRepair(DESIRED_PREMIUM_MONTHLY, observedWithoutOffering());
    assert(plan.complete === false, kinds(plan).join("; "));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.offeringCreate), plan.operationIds.join(","));
    assert(repairPlanOperationIds(plan).includes(REVENUECAT_REPAIR_OPERATIONS.packageCreate), "offering create does not imply packages exist");
    const offeringCreate = actionsOf(plan, "create").find((action) => action.entity === "offering");
    assert(offeringCreate?.createInputs?.lookupKey === "default", JSON.stringify(offeringCreate?.createInputs));
    assert(offeringCreate?.createInputs?.displayName === "Default", JSON.stringify(offeringCreate?.createInputs));
    assert(!JSON.stringify(offeringCreate?.createInputs).includes("ofrng"), "create must not send a server id");
    const packageCreate = actionsOf(plan, "create").find((action) => action.entity === "package");
    assert(packageCreate?.dependsOn.includes("create:offering:default") === true, (packageCreate?.dependsOn ?? []).join(","));
    assert(packageCreate?.createInputs?.offeringRemoteId === null, "must not invent an offering remote id");
  });

  harness.check("revenuecat-cli-reconcile-plan: planner and samples do not import encoder, session, decoder, or ledger", () => {
    const files = [
      "adapters/providers/revenuecat/cli-reconcile-plan.ts",
      "checks/verification/fixtures/revenuecat-cli-reconcile-plan.samples.ts",
    ];
    for (const relative of files) {
      const source = readFileSync(path.join(skillRoot, relative), "utf8");
      const hits = forbiddenOwnerImports(source);
      assert(hits.length === 0, `${relative} imports forbidden owners: ${hits.join(", ")}`);
    }
  });
}
