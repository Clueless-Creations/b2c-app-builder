/**
 * Independently reviewed RevenueCat CLI v0.1.1 native samples.
 *
 * Pin: GitHub v0.1.1 / 448a9998bd2107c274b9eb1cf55ad5d5d81f6377 / @revenuecat/cli@0.1.1.
 * These objects are copied from pinned upstream tests, CLI structs, or documented
 * SDK/API examples. They are not generated from the builder encoder or local DTO types.
 */

export const REVENUECAT_CLI_DECODE_PIN = {
  tag: "v0.1.1",
  commit: "448a9998bd2107c274b9eb1cf55ad5d5d81f6377",
  npmPackage: "@revenuecat/cli",
  npmVersion: "0.1.1",
} as const;

/** Pinned CLI `--json` envelope uses integer schema_version 1 (internal/output/output.go Render). */
export const UPSTREAM_JSON_ENVELOPE_VERSION = 1;

/**
 * Provenance: RevenueCat/cli internal/cli/offerings_verify_test.go
 * TestOfferingsPreviewReturnsSDKPayload at 448a9998bd2107c274b9eb1cf55ad5d5d81f6377.
 * The CLI preview command RenderJSON-wraps this SDK payload when --json is set.
 */
export const UPSTREAM_SDK_PREVIEW_MINIMAL = {
  current_offering_id: "default",
  offerings: [{ identifier: "default", paywall_components: null }],
} as const;

/**
 * Provenance: documented GET /v1/subscribers/{app_user_id}/offerings body
 * (https://www.revenuecat.com/docs/api-v1) plus paywall_components
 * from the pinned CLI preview command (null = fallback).
 */
export const UPSTREAM_SDK_PREVIEW_WITH_PACKAGES = {
  current_offering_id: "default",
  offerings: [
    {
      description: "The default offering",
      identifier: "default",
      paywall_components: null,
      packages: [
        { identifier: "$rc_monthly", platform_product_identifier: "monthly_free_trial" },
        { identifier: "$rc_annual", platform_product_identifier: "yearly_free_trial" },
      ],
    },
  ],
} as const;

/**
 * Provenance: reconstructed from TestOfferingsVerifyReturnsConfigurationGraphAndIssues
 * HTTP mocks and offeringVerification in internal/cli/offerings.go at the pin.
 * issues is []string. lookup_key (SDK) stays distinct from id (management).
 */
export const UPSTREAM_VERIFY_GRAPH = {
  offering: {
    id: "ofrng",
    lookup_key: "default",
    display_name: "Default",
    is_current: true,
    state: "active",
    created_at: 1,
    object: "offering",
  },
  packages: [
    {
      package: { id: "pkg", lookup_key: "$rc_monthly", display_name: "Monthly", created_at: 1, object: "package" },
      products: [
        {
          product: {
            id: "prod",
            app_id: "app",
            created_at: 1,
            display_name: "Monthly",
            object: "product",
            state: "active",
            store_identifier: "monthly",
            type: "subscription",
          },
          eligibility_criteria: "all",
          prices: [{ id: "price", currency: "USD", amount_micros: 4990000 }],
        },
      ],
    },
  ],
  paywalls: [{ id: "pw", name: "Default", offering_id: "ofrng", created_at: 1, published_at: null, object: "paywall" }],
  entitlements: [
    {
      entitlement: { id: "ent", lookup_key: "premium", display_name: "Premium", created_at: 1, object: "entitlement" },
      products: [
        {
          id: "prod",
          app_id: "app",
          created_at: 1,
          display_name: "Monthly",
          object: "product",
          state: "active",
          store_identifier: "monthly",
          type: "subscription",
        },
      ],
    },
  ],
  issues: ["paywall pw is still a draft"],
} as const;

/** Same graph with empty issues. Structural completeness still requires the graph, not issues:[] alone. */
export const UPSTREAM_VERIFY_GRAPH_NO_ISSUES = {
  ...UPSTREAM_VERIFY_GRAPH,
  paywalls: [{ id: "pw", name: "Default", offering_id: "ofrng", created_at: 1, published_at: 2, object: "paywall" }],
  issues: [] as readonly string[],
};

export const UPSTREAM_VERIFY_EMPTY_ISSUES_ONLY = { issues: [] as readonly unknown[] };

/**
 * Provenance: api.Page in internal/api/client.go and documented v2 list envelope.
 */
export const UPSTREAM_LIST_COMPLETE = {
  object: "list",
  items: [
    {
      id: "ofrng",
      lookup_key: "default",
      display_name: "Default",
      is_current: true,
      state: "active",
      created_at: 1,
      object: "offering",
    },
  ],
  next_page: null,
  url: "/projects/proj/offerings",
} as const;

export const UPSTREAM_LIST_PARTIAL = {
  object: "list",
  items: [{ id: "ofrng", lookup_key: "default", object: "offering" }],
  next_page: "/projects/proj/offerings?starting_after=ofrng",
  url: "/projects/proj/offerings",
} as const;

/**
 * Provenance: internal/cli/customers.go newCustomerSimulatePurchaseCmd Render map plus
 * TestCustomerSimulatePurchaseUsesTestStoreReceiptFlow receipts body at the pin.
 * Native Test Store tokens start with `TEST_`. The hex-looking upstream example is
 * replaced with a fixture placeholder so the public tree does not carry secret-shaped bytes.
 */
export const UPSTREAM_SIMULATE_PURCHASE = {
  app_id: "app_test",
  app_user_id: "demo-user",
  product: {
    id: "prod",
    app_id: "app_test",
    created_at: 1,
    display_name: "Monthly",
    object: "product",
    state: "active",
    store_identifier: "premium_monthly",
    type: "subscription",
  },
  fetch_token: "TEST_fixture_receipt",
  customer_info: { subscriber: { entitlements: { premium: { expires_date: null } } } },
  active_entitlements: ["premium"],
} as const;

export const UPSTREAM_MANAGEMENT_OFFERING = {
  id: "ofrng",
  lookupKey: "default",
} as const;

export function wrapPinnedCliEnvelope(data: unknown): string {
  return JSON.stringify({ data, schema_version: UPSTREAM_JSON_ENVELOPE_VERSION });
}
