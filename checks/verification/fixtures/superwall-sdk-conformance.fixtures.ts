/**
 * Superwall 4.16.3 PurchaseController and register() native contract (#114).
 *
 * Pins the official protocol and result cases from Superwall-iOS 4.16.3 and the documented
 * register(placement:) presentation API. Does not live-purchase. RevenueCat stays the
 * purchase and entitlement owner. Example package IDs stay non-executable.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  describeConformanceCoverage,
  isIndependentEvidence,
  type ProviderConformanceProvenance,
} from "../../../catalog/providers/conformance.js";
import { firstpartyImplementations } from "../../../catalog/firstparty-declarations.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const SUPERWALL_VERSION = "4.16.3";
const SUPERWALL_REVISION = "a9990308209c27de2f3c74e666774f121149678e";
const PURCHASE_CONTROLLER_SOURCE =
  "https://github.com/superwall/Superwall-iOS/blob/4.16.3/Sources/SuperwallKit/StoreKit/Purchase%20Controller/PurchaseController.swift";
const REGISTER_SOURCE = "https://superwall.com/docs/ios/sdk-reference/register";

/** Official Superwall 4.16.3 protocol surface. Method names and enum cases only. */
const SUPERWALL_PURCHASE_CONTROLLER_4_16_3 = {
  protocol: "PurchaseController",
  methods: ["purchase(product:)", "restorePurchases()"] as const,
  purchaseResults: ["cancelled", "purchased", "pending", "failed"] as const,
  restorationResults: ["restored", "failed"] as const,
  restoredImpliesEntitlement: false,
} as const;

const SUPERWALL_REGISTER_4_16_3 = {
  nativeOperation: "Superwall.shared.register(placement:)",
  requiredParameter: "placement",
} as const;

function provenance(record: ProviderConformanceProvenance): ProviderConformanceProvenance {
  return record;
}

export function register(harness: Harness): void {
  harness.check("superwall-sdk: pinned 4.16.3 lock matches the registered PurchaseController source", () => {
    const resolved = JSON.parse(readFileSync(path.join(skillRoot, "examples/extensions/superwall-ios/native/Package.resolved"), "utf8")) as {
      pins: Array<{ identity: string; state: { revision: string; version: string } }>;
    };
    const pin = resolved.pins.find((item) => item.identity === "superwall-ios");
    assert(pin?.state.version === SUPERWALL_VERSION, JSON.stringify(pin));
    assert(pin?.state.revision === SUPERWALL_REVISION, pin?.state.revision);
    const registry = readFileSync(path.join(skillRoot, "checks/validation/repository/source-registry.yaml"), "utf8");
    assert(registry.includes("superwall-purchase-controller-4-16-3"), "source-registry keeps the pin id");
    assert(registry.includes(PURCHASE_CONTROLLER_SOURCE), "source-registry keeps the exact 4.16.3 URL");
  });

  harness.check("superwall-sdk: official PurchaseController cases are the native purchase contract, not Superwall entitlement", () => {
    const controller = readFileSync(
      path.join(skillRoot, "examples/extensions/superwall-ios/native/Sources/MonetizationNative/RevenueCatController.swift"),
      "utf8",
    );
    const entitlement = readFileSync(
      path.join(skillRoot, "examples/extensions/superwall-ios/native/Sources/MonetizationCore/EntitlementState.swift"),
      "utf8",
    );
    const tests = readFileSync(
      path.join(skillRoot, "examples/extensions/superwall-ios/native/Tests/MonetizationCoreTests/EntitlementStateTests.swift"),
      "utf8",
    );
    assert(controller.includes("PurchaseController"), "example implements the official protocol");
    assert(controller.includes("public func purchase(product:"), "purchase method matches the official signature");
    assert(controller.includes("public func restorePurchases()"), "restore method matches the official signature");
    assert(controller.includes("Purchases.shared.purchase"), "purchase delegates to RevenueCat");
    assert(controller.includes("Purchases.shared.restorePurchases"), "restore delegates to RevenueCat");
    assert(!controller.includes("Superwall.shared.purchase"), "Superwall is not a second StoreKit path");
    for (const result of SUPERWALL_PURCHASE_CONTROLLER_4_16_3.purchaseResults) {
      assert(controller.includes(`.${result}`) || entitlement.includes(`.${result}`), result);
    }
    assert(entitlement.includes("never grants access"), "callback must not grant access");
    assert(tests.includes("XCTAssertFalse(state.access)"), "tests keep Superwall out of entitlement authority");
    assert(SUPERWALL_PURCHASE_CONTROLLER_4_16_3.restoredImpliesEntitlement === false, "official restore is not entitlement");
    const record = provenance({
      provider: "superwall-ios",
      transport: "sdk",
      reviewedVersion: SUPERWALL_VERSION,
      reviewedRevision: SUPERWALL_REVISION,
      sourceSelector: PURCHASE_CONTROLLER_SOURCE,
      nativeOperation: "PurchaseController.purchase(product:)",
      canonicalOperation: "none",
      evidenceKind: "upstream-source-test",
      establishes: ["request-shape", "response-shape", "effect"],
      coverageLimits:
        "Official protocol methods and PurchaseResult/RestorationResult cases at 4.16.3. Restore does not imply entitlement. No live purchase.",
      sample: SUPERWALL_PURCHASE_CONTROLLER_4_16_3,
    });
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
    assert(record.canonicalOperation === "none", "purchase stays off Superwall first-party implementations");
  });

  harness.check("superwall-sdk: documented register(placement:) maps to present-paywall only", () => {
    const controller = readFileSync(
      path.join(skillRoot, "examples/extensions/superwall-ios/native/Sources/MonetizationNative/RevenueCatController.swift"),
      "utf8",
    );
    const superwallImpls = firstpartyImplementations.filter((item) => item.provider === "b2c/superwall");
    assert(superwallImpls.length === 1 && superwallImpls[0]?.id === "b2c/superwall.present-paywall", JSON.stringify(superwallImpls));
    assert(superwallImpls[0]?.operation === "b2c/monetization.present-paywall", superwallImpls[0]?.operation);
    assert(firstpartyImplementations.every((item) => item.id !== "b2c/superwall.purchase"), "no first-party Superwall purchase");
    assert(
      firstpartyImplementations.every((item) => item.id !== "b2c/superwall.read-entitlement"),
      "no first-party Superwall entitlement",
    );
    assert(controller.includes("Superwall.shared.register(placement:"), "example presents through register");
    const record = provenance({
      provider: "superwall-ios",
      transport: "sdk",
      reviewedVersion: SUPERWALL_VERSION,
      reviewedRevision: SUPERWALL_REVISION,
      sourceSelector: REGISTER_SOURCE,
      nativeOperation: SUPERWALL_REGISTER_4_16_3.nativeOperation,
      canonicalOperation: "b2c/monetization.present-paywall",
      evidenceKind: "official-example",
      establishes: ["request-shape"],
      coverageLimits: "Documented placement parameter only. No live Superwall campaign, no live paywall presentation.",
      sample: SUPERWALL_REGISTER_4_16_3,
    });
    assert(isIndependentEvidence(record.evidenceKind), describeConformanceCoverage(record));
  });
}
