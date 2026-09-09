import { assert, type Harness } from "./_harness.js";
import {
  decodeRevenueCatCliResponse,
  extractResourceIds,
  interpretOfferingPreview,
  offeringVerifyIsComplete,
  parseRevenueCatCliJson,
} from "../../../adapters/providers/revenuecat/cli-decode.js";
import { REVENUECAT_CLI_RELEASE } from "../../../adapters/providers/revenuecat/cli-operations.js";
import {
  REVENUECAT_CLI_DECODE_PIN,
  UPSTREAM_LIST_COMPLETE,
  UPSTREAM_LIST_PARTIAL,
  UPSTREAM_MANAGEMENT_OFFERING,
  UPSTREAM_SDK_PREVIEW_MINIMAL,
  UPSTREAM_SDK_PREVIEW_WITH_PACKAGES,
  UPSTREAM_SIMULATE_PURCHASE,
  UPSTREAM_VERIFY_EMPTY_ISSUES_ONLY,
  UPSTREAM_VERIFY_GRAPH,
  UPSTREAM_VERIFY_GRAPH_NO_ISSUES,
  wrapPinnedCliEnvelope,
} from "./revenuecat-cli-decode.samples.js";

export function register(harness: Harness): void {
  harness.check("revenuecat-cli-decode: pin matches executable candidate", () => {
    assert(REVENUECAT_CLI_DECODE_PIN.commit === REVENUECAT_CLI_RELEASE.commit, REVENUECAT_CLI_DECODE_PIN.commit);
    assert(REVENUECAT_CLI_DECODE_PIN.tag === REVENUECAT_CLI_RELEASE.tag, REVENUECAT_CLI_DECODE_PIN.tag);
    assert(REVENUECAT_CLI_DECODE_PIN.npmVersion === REVENUECAT_CLI_RELEASE.npmVersion, REVENUECAT_CLI_DECODE_PIN.npmVersion);
  });

  harness.check("revenuecat-cli-decode: upstream SDK preview sample identifies default and fallback", () => {
    const preview = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test", offeringLookupKey: "default" });
    assert(preview.protocolValid === true, JSON.stringify(preview));
    assert(preview.offeringLookupKey === "default", `lookup ${preview.offeringLookupKey}`);
    assert(preview.offeringRemoteId === null, "must not invent a management id from the SDK key");
    assert(preview.fallbackOnly === true && preview.publishedPaywall === false, JSON.stringify(preview));
    assert(preview.complete === true, "recognized preview with fallback is valid preview evidence");
    const wrapped = parseRevenueCatCliJson(wrapPinnedCliEnvelope(UPSTREAM_SDK_PREVIEW_MINIMAL), 0);
    assert(wrapped.ok === true && wrapped.schemaVersion === "1", JSON.stringify(wrapped));
    const decoded = decodeRevenueCatCliResponse({
      operationId: "rc.offerings.preview",
      stdout: wrapPinnedCliEnvelope(UPSTREAM_SDK_PREVIEW_MINIMAL),
      stderr: "",
      status: 0,
      expected: { appId: "app_test", offeringLookupKey: "default" },
    });
    assert(decoded.observation.kind === "preview" && decoded.observation.protocolValid, JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "preview" && decoded.observation.offeringLookupKey === "default", JSON.stringify(decoded.observation));
  });

  harness.check("revenuecat-cli-decode: populated SDK packages stay lookup keys, not REST ids", () => {
    const preview = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_WITH_PACKAGES, { appId: "app_test" });
    assert(preview.protocolValid === true, JSON.stringify(preview));
    assert(preview.packageLookupKeys.includes("$rc_monthly"), preview.packageLookupKeys.join(","));
    assert(preview.storeIdentifiers.includes("monthly_free_trial"), preview.storeIdentifiers.join(","));
    assert(preview.offeringRemoteId === null, "packages do not mint ofrng_* ids");
  });

  harness.check("revenuecat-cli-decode: SDK lookup key maps to management id only through lookup_key", () => {
    const resolved = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, {
      appId: "app_test",
      offeringId: "ofrng",
      managementOfferings: [UPSTREAM_MANAGEMENT_OFFERING],
    });
    assert(resolved.mapping === "resolved" && resolved.offeringRemoteId === "ofrng", JSON.stringify(resolved));
    const unresolved = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test", offeringId: "ofrng" });
    assert(unresolved.mapping === "unresolved" && unresolved.offeringRemoteId === null, JSON.stringify(unresolved));
    assert(unresolved.wrongCurrentOffering === false, "REST id vs lookup key without a map is unresolved, not a mismatch");
    const ambiguous = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, {
      appId: "app_test",
      managementOfferings: [
        { id: "ofrng_a", lookupKey: "default" },
        { id: "ofrng_b", lookupKey: "default" },
      ],
    });
    assert(ambiguous.mapping === "ambiguous" && ambiguous.complete === false, JSON.stringify(ambiguous));
    const mismatch = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, {
      appId: "app_test",
      offeringId: "ofrng_other",
      managementOfferings: [UPSTREAM_MANAGEMENT_OFFERING],
    });
    assert(mismatch.mapping === "mismatch" && mismatch.wrongCurrentOffering === true, JSON.stringify(mismatch));
  });

  harness.check("revenuecat-cli-decode: empty issues array is not complete verification", () => {
    const empty = offeringVerifyIsComplete(UPSTREAM_VERIFY_EMPTY_ISSUES_ONLY);
    assert(empty.complete === false && empty.protocolValid === false, JSON.stringify(empty));
    assert(empty.missingGraph === true, "issues:[] without a graph is not complete");
    const decoded = decodeRevenueCatCliResponse({
      operationId: "rc.offerings.verify",
      stdout: wrapPinnedCliEnvelope(UPSTREAM_VERIFY_EMPTY_ISSUES_ONLY),
      stderr: "",
      status: 0,
    });
    assert(decoded.json.ok === true, "empty issues is still JSON");
    assert(decoded.observation.kind === "verify" && decoded.observation.structurallyComplete === false, JSON.stringify(decoded.observation));
  });

  harness.check("revenuecat-cli-decode: missing issues fails verify and is not required on preview", () => {
    const verify = offeringVerifyIsComplete({ offering: { id: "ofrng", lookup_key: "default" }, packages: [], entitlements: [] });
    assert(verify.complete === false && verify.protocolValid === false, JSON.stringify(verify));
    const noPaywalls = offeringVerifyIsComplete({
      offering: { id: "ofrng", lookup_key: "default" },
      packages: [{ package: { id: "pkg" }, products: [{ product: { id: "prod" }, prices: [{ id: "price" }] }] }],
      entitlements: [{ entitlement: { id: "ent", lookup_key: "premium" }, products: [{ id: "prod" }] }],
      issues: [],
    });
    assert(noPaywalls.protocolValid === false, "native verify graph includes a paywalls array");
    const preview = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test" });
    assert(preview.protocolValid === true && preview.issues === undefined, JSON.stringify(preview));
  });

  harness.check("revenuecat-cli-decode: populated verify graph with draft paywall is protocol-valid and incomplete", () => {
    const verdict = offeringVerifyIsComplete(UPSTREAM_VERIFY_GRAPH);
    assert(verdict.protocolValid === true, JSON.stringify(verdict));
    assert(verdict.complete === false, "draft paywall issue keeps verification incomplete");
    assert(verdict.offeringRemoteId === "ofrng" && verdict.offeringLookupKey === "default", JSON.stringify(verdict));
    const clean = offeringVerifyIsComplete(UPSTREAM_VERIFY_GRAPH_NO_ISSUES);
    assert(clean.complete === true && clean.protocolValid === true, JSON.stringify(clean));
  });

  harness.check("revenuecat-cli-decode: nested price errors and missing prices cannot establish price claims", () => {
    const nested = offeringVerifyIsComplete({
      offering: { id: "ofrng", lookup_key: "default" },
      packages: [
        {
          package: { id: "pkg", lookup_key: "$rc_monthly" },
          products: [{ product: { id: "prod" }, eligibility_criteria: "all", price_error: "prices unavailable", prices: [] }],
        },
      ],
      paywalls: [],
      entitlements: [{ entitlement: { id: "ent", lookup_key: "premium" }, products: [{ id: "prod" }] }],
      issues: [],
    });
    assert(nested.protocolValid === true, JSON.stringify(nested));
    assert(nested.complete === false, "price_error is not a complete price observation");
    assert(nested.nestedErrors.includes("price-error") && nested.nestedErrors.includes("prices-missing"), nested.nestedErrors.join(","));
  });

  harness.check("revenuecat-cli-decode: wrong current offering is distinct from fallback", () => {
    const preview = interpretOfferingPreview(
      { current_offering_id: "sale", offerings: [{ identifier: "sale", paywall_components: { pages: [] } }] },
      { appId: "app_test", offeringLookupKey: "default" },
    );
    assert(preview.protocolValid === true, JSON.stringify(preview));
    assert(preview.wrongCurrentOffering === true && preview.fallbackOnly === false, JSON.stringify(preview));
    assert(preview.publishedPaywall === true, "non-null components are published components, not a business publish decision");
    assert(preview.complete === false, "wrong current offering is not complete preview evidence for the selected key");
  });

  harness.check("revenuecat-cli-decode: wrong-app only when the payload names a different app", () => {
    const withApp = interpretOfferingPreview(
      { ...UPSTREAM_SDK_PREVIEW_MINIMAL, app_id: "app_other" },
      { appId: "app_test" },
    );
    assert(previewWrong(withApp), JSON.stringify(withApp));
    const unnamed = interpretOfferingPreview(UPSTREAM_SDK_PREVIEW_MINIMAL, { appId: "app_test" });
    assert(unnamed.wrongApp === false, "missing app_id must not be invented from the request");
  });

  harness.check("revenuecat-cli-decode: list pages keep ids and lookup keys distinct; partial is not empty", () => {
    const complete = extractResourceIds(UPSTREAM_LIST_COMPLETE);
    assert(complete.itemsPresent === true && complete.ids[0] === "ofrng", JSON.stringify(complete));
    assert(complete.lookupKeys[0] === "default", JSON.stringify(complete));
    assert(complete.pagination === "complete", complete.pagination);
    const partial = extractResourceIds(UPSTREAM_LIST_PARTIAL);
    assert(partial.pagination === "partial", "next_page is partial");
    const missing = extractResourceIds({ object: "list" });
    assert(missing.itemsPresent === false && missing.ids.length === 0 && missing.pagination === "unknown", JSON.stringify(missing));
    const decoded = decodeRevenueCatCliResponse({
      operationId: "rc.offerings.list",
      stdout: wrapPinnedCliEnvelope(UPSTREAM_LIST_PARTIAL),
      stderr: "",
      status: 0,
    });
    assert(decoded.observation.kind === "list" && decoded.observation.pagination === "partial", JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "list" && decoded.observation.structurallyComplete === false, "partial page is not a complete list");
    assert(
      decoded.observation.kind === "list" &&
        decoded.observation.remoteRefs[0]?.remoteId === "ofrng" &&
        decoded.observation.remoteRefs[0]?.lookupKey === "default",
      JSON.stringify(decoded.observation.remoteRefs),
    );
  });

  harness.check("revenuecat-cli-decode: simulate-purchase uses product object and SDK entitlement identifiers", () => {
    const decoded = decodeRevenueCatCliResponse({
      operationId: "rc.customers.simulate-purchase",
      stdout: wrapPinnedCliEnvelope(UPSTREAM_SIMULATE_PURCHASE),
      stderr: "",
      status: 0,
    });
    assert(decoded.observation.kind === "simulate-purchase", JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "simulate-purchase" && decoded.observation.protocolValid, JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "simulate-purchase" && decoded.observation.productRemoteId === "prod", JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "simulate-purchase" && decoded.observation.storeIdentifier === "premium_monthly", JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "simulate-purchase" && decoded.observation.entitlementLookupKeys.includes("premium"), JSON.stringify(decoded.observation));
    assert(decoded.observation.kind === "simulate-purchase" && decoded.observation.testStoreToken === true, JSON.stringify(decoded.observation));
  });

  harness.check("revenuecat-cli-decode: malformed JSON, unknown envelope version, and wrong command shape fail closed", () => {
    const invalid = decodeRevenueCatCliResponse({
      operationId: "rc.offerings.preview",
      stdout: "not-json",
      stderr: "",
      status: 0,
    });
    assert(invalid.json.ok === false && invalid.json.code === "invalid-json", JSON.stringify(invalid.json));
    assert(invalid.observation.protocolValid === false, JSON.stringify(invalid.observation));
    const version = parseRevenueCatCliJson(JSON.stringify({ data: UPSTREAM_SDK_PREVIEW_MINIMAL, schema_version: 99 }), 0);
    assert(version.ok === false && version.code === "invalid-envelope", JSON.stringify(version));
    const verifyAsPreview = decodeRevenueCatCliResponse({
      operationId: "rc.offerings.preview",
      stdout: wrapPinnedCliEnvelope(UPSTREAM_VERIFY_GRAPH),
      stderr: "",
      status: 0,
    });
    assert(verifyAsPreview.observation.kind === "preview" && decodedPreviewInvalid(verifyAsPreview.observation), JSON.stringify(verifyAsPreview.observation));
    const previewAsVerify = decodeRevenueCatCliResponse({
      operationId: "rc.offerings.verify",
      stdout: wrapPinnedCliEnvelope(UPSTREAM_SDK_PREVIEW_MINIMAL),
      stderr: "",
      status: 0,
    });
    assert(previewAsVerify.observation.kind === "verify" && previewAsVerify.observation.protocolValid === false, JSON.stringify(previewAsVerify.observation));
  });

  harness.check("revenuecat-cli-decode: version stdout is text and excluded operations are not success", () => {
    const version = decodeRevenueCatCliResponse({
      operationId: "rc.version",
      stdout: "revenuecat-cli 0.1.1\n",
      stderr: "",
      status: 0,
    });
    assert(version.observation.kind === "version" && version.observation.version === "0.1.1", JSON.stringify(version.observation));
    assert(version.json.ok === false, "version must not be treated as a JSON envelope");
    const excluded = decodeRevenueCatCliResponse({
      operationId: "rc.api",
      stdout: wrapPinnedCliEnvelope({ ok: true }),
      stderr: "",
      status: 0,
    });
    assert(excluded.observation.kind === "invalid", JSON.stringify(excluded.observation));
  });
}

function previewWrong(preview: ReturnType<typeof interpretOfferingPreview>): boolean {
  return preview.wrongApp === true && preview.protocolValid === true;
}

function decodedPreviewInvalid(observation: { readonly protocolValid: boolean }): boolean {
  return observation.protocolValid === false;
}
