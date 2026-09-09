import type { ProvisioningProvider } from "../../provisioning/requirements.js";

export const REVENUECAT_PROVISIONING: ProvisioningProvider = {
  providerId: "provider.revenuecat",
  capability: "subscription-entitlements",
  // Secret-key probe and entitlement checks are API; offerings/entitlements exist in the dashboard.
  accessRoutes: ["api", "cli", "browser"],
  unlocks: "Lets the app sell subscriptions/IAP and lets the agent prove a real purchase actually grants access, not just that a paywall renders.",
  requirements: [
    {
      kind: "secret",
      name: "REVENUECAT_SECRET_API_KEY",
      why: "Server-side key used by the live probe and any backend entitlement checks.",
      verifiable: true,
    },
    { kind: "secret", name: "REVENUECAT_PUBLIC_IOS_KEY", why: "Client SDK key shipped in the app.", verifiable: true },
    {
      kind: "secret",
      name: "REVENUECAT_PUBLIC_ANDROID_KEY",
      why: "RevenueCat issues a separate public API key per platform app entry (the iOS app and the Android/Play app are two different entries) — this is that Android/Play client SDK key. Only needed once this business actually ships on Android; an iOS-only business has no use for it.",
      verifiable: true,
    },
    {
      kind: "secret",
      name: "REVENUECAT_WEBHOOK_SECRET",
      why: "Verifies RevenueCat webhook authenticity before trusting subscription-change events.",
      verifiable: true,
    },
    {
      kind: "config",
      name: "REVENUECAT_PROJECT_ID",
      why: "Needed to reach the v2 offerings/entitlements endpoints; without it the probe can only do a partial v1 health check.",
      verifiable: true,
    },
    {
      kind: "external",
      name: "At least one non-empty offering with packages, and at least one entitlement, exist in the RevenueCat dashboard",
      why: "A key can be valid while the project has zero configured offerings/entitlements, which the live probe treats as a hard failure.",
      verifiable: true,
    },
    {
      kind: "external",
      name: "App Store/Play products are created, attached, and product-type-reconciled into the RevenueCat catalog (no MISSING_METADATA)",
      why: "A subscription stuck in Apple's MISSING_METADATA state, or a lifetime IAP mapped to the wrong RevenueCat product type, makes RevenueCat return an empty offering — 'Purchases unavailable' — even with every secret and offering configured correctly.",
      verifiable: false,
    },
    {
      kind: "external",
      name: "A sandbox/Test Store purchase actually completes and is confirmed to grant entitlement in-app, in RevenueCat, and in any backend projection",
      why: "Configuration proof is not purchase-to-access proof. A CLI Test Store transaction is not Apple/Play purchase or in-app UI proof.",
      verifiable: true,
    },
  ],
};
