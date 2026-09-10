/**
 * Expo selected-capability protocol (#83).
 *
 * Classifies authentication, offline data, device capabilities, and native purchases.
 * Session, offline-event, permission, and notification-handoff rows are protocol only.
 * `catalog/stacks/expo-selection.ts` keeps those operations blocked. This module does not
 * call App Store, Play, or RevenueCat, and does not spawn Expo CLI.
 *
 * A fake in-app transport is a fixture. It is not native-store proof. RevenueCat CLI Test
 * Store (`#79`) is catalog management, not `react-native-purchases` purchase or restore.
 *
 * Consumes `catalog/stacks/expo-selection.ts`. Does not invent `product.monetization.mode`.
 */

import { operationFor, type ExpoSelectionResolution, type ShippingPlatform } from "./expo-selection.js";

export const EXPO_CAPABILITY_PROTOCOL_PATH = "catalog/stacks/expo-capability-protocol.ts" as const;

export const EXPO_CAPABILITY_SOURCES = {
  inAppPurchases: "https://docs.expo.dev/guides/in-app-purchases/",
  authentication: "https://docs.expo.dev/guides/authentication/",
  routerAuth: "https://docs.expo.dev/router/advanced/authentication/",
  secureStore: "https://docs.expo.dev/versions/latest/sdk/securestore/",
  sqlite: "https://docs.expo.dev/versions/latest/sdk/sqlite/",
  environmentVariables: "https://docs.expo.dev/guides/environment-variables/",
  developmentBuilds: "https://docs.expo.dev/develop/development-builds/introduction/",
  pushNotifications: "https://docs.expo.dev/push-notifications/overview/",
  pushReceipts: "https://docs.expo.dev/push-notifications/sending-notifications/",
} as const;

export const EXPO_CAPABILITY_OPERATION_IDS = ["authentication", "offline-data", "device-capabilities", "native-purchases"] as const;

export type ExpoCapabilityId = (typeof EXPO_CAPABILITY_OPERATION_IDS)[number];

export type ExpoCapabilityProofScope = "test-store" | "apple-sandbox" | "play-sandbox" | "production" | "browser-mock" | "web-checkout";

export type ExpoPurchaseTransportKind = "fake-in-app" | "live-store" | "revenuecat-cli";

export type ExpoPurchaseAction = "purchase" | "restore" | "simulate-purchase";

export type ExpoPurchaseOutcome = "purchased" | "restored" | "pending" | "error" | "expired" | "account-isolated";

export type ExpoRuntimeClient = "expo-go" | "development-build" | "release-build" | "web-browser";

export type ExpoIdentityClaim = "auth-implies-entitlement" | "rc-identity-implies-entitlement" | "separated";

export type ExpoSecretClass = "expo-public-client" | "management-key" | "signing-secret" | "refresh-token" | "ai-provider-key";

export type ExpoOfflineStoreKind = "sqlite" | "secure-store" | "web-storage" | "remote-backend";

export type ExpoOfflineClaim = "local-cache" | "backend-of-record" | "web-storage-equivalent" | "native-encrypted";

export type ExpoDeviceCapability = "camera" | "notifications" | "media-library";

export type ExpoCapabilityRefusalCode =
  | "operation-blocked"
  | "live-store-mutation"
  | "revenuecat-cli-simulate-purchase"
  | "cli-is-not-native-purchase"
  | "web-fakes-native-purchase"
  | "web-fakes-native-permission"
  | "expo-go-native-library"
  | "installed-library-is-not-accepted-feature"
  | "sqlite-is-not-backend"
  | "secure-store-is-not-web-storage"
  | "client-route-is-not-server-authorization"
  | "identity-kinds-collapsed"
  | "secret-in-client-bundle"
  | "unselected-integration-present"
  | "proof-scope-is-not-native-store"
  | "malicious-callback"
  | "unauthenticated-backend"
  | "offline-migration-claimed-success"
  | "interrupted-write-claimed-complete"
  | "permission-loop"
  | "token-error-is-not-delivery"
  | "receipt-error-is-not-delivery"
  | "claimed-delivery-without-handoff"
  | "deep-link-route-mismatch";

export interface ExpoCapabilityRow {
  id: ExpoCapabilityId;
  queuedIssue: 83;
  evidenceTier: "blocked";
  nativeStoreProof: false;
  liveMutation: false;
}

export interface ExpoPurchaseClassification {
  action: "allow-fake" | "refuse";
  code?: ExpoCapabilityRefusalCode;
  transport: ExpoPurchaseTransportKind;
  proofScope: ExpoCapabilityProofScope;
  liveStoreMutation: boolean;
  nativeStoreProof: boolean;
  labeledLive: false;
  reason: string;
}

export interface FakeInAppTransportRequest {
  action: "purchase" | "restore";
  appUserId: string;
  previousAppUserId?: string;
  scripted: ExpoPurchaseOutcome;
}

export interface FakeInAppTransportResult {
  transport: "fake-in-app";
  outcome: ExpoPurchaseOutcome;
  proofScope: "browser-mock";
  liveStoreMutation: false;
  nativeStoreProof: false;
  labeledLive: false;
  entitled: boolean;
  accountIsolated: boolean;
}

export interface ClientArtifact {
  path: string;
  contents: string;
}

export interface SecretCanary {
  name: string;
  value: string;
}

export interface ClientSecretLeak {
  path: string;
  name: string;
  secretClass: Exclude<ExpoSecretClass, "expo-public-client"> | "unknown";
}

export interface ClientSecretScan {
  action: "pass" | "refuse";
  code?: "secret-in-client-bundle";
  leaks: readonly ClientSecretLeak[];
}

export function capabilityRow(id: ExpoCapabilityId): ExpoCapabilityRow {
  switch (id) {
    case "authentication":
    case "offline-data":
    case "device-capabilities":
    case "native-purchases":
      return {
        id,
        queuedIssue: 83,
        evidenceTier: "blocked",
        nativeStoreProof: false,
        liveMutation: false,
      };
    default: {
      const exhaustive: never = id;
      throw new Error(`unhandled capability: ${String(exhaustive)}`);
    }
  }
}

export function capabilityOperationsRemainBlocked(resolution: ExpoSelectionResolution): boolean {
  return EXPO_CAPABILITY_OPERATION_IDS.every((id) => {
    const operation = operationFor(resolution, id);
    return operation.evidenceTier === "blocked" && operation.queuedIssue === 83;
  });
}

export function proofScopeIsNativeStore(scope: ExpoCapabilityProofScope): boolean {
  switch (scope) {
    case "apple-sandbox":
    case "play-sandbox":
    case "production":
      return true;
    case "test-store":
    case "browser-mock":
    case "web-checkout":
      return false;
    default: {
      const exhaustive: never = scope;
      throw new Error(`unhandled proof scope: ${String(exhaustive)}`);
    }
  }
}

export function classifyPurchaseOperation(input: {
  transport: ExpoPurchaseTransportKind;
  proofScope: ExpoCapabilityProofScope;
  platform: ShippingPlatform | "host";
  action: ExpoPurchaseAction;
  client: ExpoRuntimeClient;
  claimNativeStoreProof?: boolean;
}): ExpoPurchaseClassification {
  const reportedScope: ExpoCapabilityProofScope =
    input.transport === "fake-in-app" && proofScopeIsNativeStore(input.proofScope) ? "browser-mock" : input.proofScope;
  const base = {
    transport: input.transport,
    proofScope: reportedScope,
    labeledLive: false as const,
  };
  if (input.transport === "live-store") {
    return {
      ...base,
      action: "refuse",
      code: "live-store-mutation",
      liveStoreMutation: true,
      nativeStoreProof: false,
      reason: "Live App Store and Play purchase stay #79/#84 holds. This protocol does not mutate a store.",
    };
  }
  if (input.transport === "revenuecat-cli") {
    const code = input.action === "simulate-purchase" ? "revenuecat-cli-simulate-purchase" : "cli-is-not-native-purchase";
    return {
      ...base,
      action: "refuse",
      code,
      liveStoreMutation: false,
      nativeStoreProof: false,
      reason: "RevenueCat CLI Test Store is catalog management (#79). It is not react-native-purchases purchase or restore.",
    };
  }
  if (input.platform === "web" || input.client === "web-browser") {
    return {
      ...base,
      action: "refuse",
      code: "web-fakes-native-purchase",
      liveStoreMutation: false,
      nativeStoreProof: false,
      reason: "Web must not fake native purchase or restore success. Web checkout is a separate surface.",
    };
  }
  if (input.client === "expo-go") {
    return {
      ...base,
      action: "refuse",
      code: "expo-go-native-library",
      liveStoreMutation: false,
      nativeStoreProof: false,
      reason: "react-native-purchases needs a development or release build. Expo Go cannot load that native module.",
    };
  }
  if (input.transport === "fake-in-app" && proofScopeIsNativeStore(input.proofScope)) {
    return {
      ...base,
      action: "refuse",
      code: "proof-scope-is-not-native-store",
      liveStoreMutation: false,
      nativeStoreProof: false,
      reason: "A fake in-app transport cannot carry Apple sandbox, Play sandbox, or production proofScope.",
    };
  }
  if (input.claimNativeStoreProof && !proofScopeIsNativeStore(input.proofScope)) {
    return {
      ...base,
      action: "refuse",
      code: "proof-scope-is-not-native-store",
      liveStoreMutation: false,
      nativeStoreProof: false,
      reason: "Test Store, browser-mock, and web-checkout are not native App Store or Play proof.",
    };
  }
  if (input.claimNativeStoreProof && proofScopeIsNativeStore(input.proofScope)) {
    return {
      ...base,
      action: "refuse",
      code: "proof-scope-is-not-native-store",
      liveStoreMutation: false,
      nativeStoreProof: false,
      reason: "A fake in-app transport cannot certify Apple sandbox, Play sandbox, or production proof.",
    };
  }
  return {
    ...base,
    action: "allow-fake",
    liveStoreMutation: false,
    nativeStoreProof: false,
    reason: "Fake in-app fixture only. Not live, not native-store proof.",
  };
}

export function runFakeInAppTransport(request: FakeInAppTransportRequest): FakeInAppTransportResult {
  const switched = Boolean(request.previousAppUserId && request.previousAppUserId !== request.appUserId);
  const isolated = request.scripted === "account-isolated" || (switched && request.action === "restore");
  const outcome: ExpoPurchaseOutcome = isolated ? "account-isolated" : request.scripted;
  const entitled = outcome === "purchased" || outcome === "restored";
  return {
    transport: "fake-in-app",
    outcome,
    proofScope: "browser-mock",
    liveStoreMutation: false,
    nativeStoreProof: false,
    labeledLive: false,
    entitled: isolated ? false : entitled,
    accountIsolated: isolated,
  };
}

export function evaluateIdentityBoundary(input: { claim: ExpoIdentityClaim; signedIn: boolean; revenueCatIdentified: boolean; entitled: boolean }): {
  ok: boolean;
  code?: "identity-kinds-collapsed";
  reason: string;
} {
  switch (input.claim) {
    case "auth-implies-entitlement":
    case "rc-identity-implies-entitlement":
      return {
        ok: false,
        code: "identity-kinds-collapsed",
        reason: "App auth, RevenueCat app-user identity, and paid entitlements stay independent.",
      };
    case "separated":
      return {
        ok: true,
        reason: `App auth (${input.signedIn}), RevenueCat identity (${input.revenueCatIdentified}), and paid entitlements (${input.entitled}) are recorded as distinct kinds.`,
      };
    default: {
      const exhaustive: never = input.claim;
      throw new Error(`unhandled identity claim: ${String(exhaustive)}`);
    }
  }
}

export function classifyEnvName(name: string): ExpoSecretClass | "unknown" {
  if (name.startsWith("EXPO_PUBLIC_")) return "expo-public-client";
  switch (name) {
    case "EXPO_TOKEN":
    case "EAS_TOKEN":
    case "REVENUECAT_API_KEY":
      return "management-key";
    case "ASC_API_KEY":
    case "ANDROID_KEYSTORE_PASSWORD":
      return "signing-secret";
    case "AUTH_REFRESH_TOKEN":
      return "refresh-token";
    case "OPENAI_API_KEY":
    case "ANTHROPIC_API_KEY":
      return "ai-provider-key";
    default:
      return "unknown";
  }
}

export function scanClientArtifacts(artifacts: readonly ClientArtifact[], canaries: readonly SecretCanary[]): ClientSecretScan {
  const leaks: ClientSecretLeak[] = [];
  for (const artifact of artifacts) {
    for (const canary of canaries) {
      const secretClass = classifyEnvName(canary.name);
      if (secretClass === "expo-public-client") continue;
      if (!artifact.contents.includes(canary.value)) continue;
      leaks.push({ path: artifact.path, name: canary.name, secretClass });
    }
  }
  if (leaks.length > 0) {
    return { action: "refuse", code: "secret-in-client-bundle", leaks };
  }
  return { action: "pass", leaks };
}

export function classifyOfflineClaim(input: { store: ExpoOfflineStoreKind; claim: ExpoOfflineClaim; platform: ShippingPlatform }): {
  action: "accept-classification" | "refuse";
  code?: ExpoCapabilityRefusalCode;
  reason: string;
} {
  if (input.store === "sqlite" && input.claim === "backend-of-record") {
    return {
      action: "refuse",
      code: "sqlite-is-not-backend",
      reason: "expo-sqlite is a local database. It is not the backend of record.",
    };
  }
  if (input.store === "secure-store" && input.claim === "web-storage-equivalent") {
    return {
      action: "refuse",
      code: "secure-store-is-not-web-storage",
      reason: "SecureStore is native encrypted storage. It is not localStorage.",
    };
  }
  if (input.store === "secure-store" && input.claim === "native-encrypted" && input.platform === "web") {
    return {
      action: "refuse",
      code: "secure-store-is-not-web-storage",
      reason: "Web has no SecureStore equivalent. Do not treat browser storage as native encryption.",
    };
  }
  return {
    action: "accept-classification",
    reason: "Local store classification only. The offline-data operation stays blocked.",
  };
}

export function classifyDeviceCapability(input: { capability: ExpoDeviceCapability; platform: ShippingPlatform; claimedNativeSuccess: boolean }): {
  action: "accept-classification" | "refuse";
  code?: "web-fakes-native-permission";
  reason: string;
} {
  if (input.platform === "web" && input.claimedNativeSuccess) {
    return {
      action: "refuse",
      code: "web-fakes-native-permission",
      reason: `Web must not fake native ${input.capability} success.`,
    };
  }
  return {
    action: "accept-classification",
    reason: "Per-platform availability stays explicit. The device-capabilities operation stays blocked.",
  };
}

export function classifyProtectedRoute(input: { surface: "client-router" | "server-authorizer"; claim: "server-authorization" | "client-gate-only" }): {
  action: "accept-classification" | "refuse";
  code?: "client-route-is-not-server-authorization";
  reason: string;
} {
  if (input.surface === "client-router" && input.claim === "server-authorization") {
    return {
      action: "refuse",
      code: "client-route-is-not-server-authorization",
      reason: "An Expo Router protected layout is a client gate. It is not server authorization.",
    };
  }
  return {
    action: "accept-classification",
    reason: "Client route protection and server authorization stay distinct.",
  };
}

export function classifyInstalledIntegration(input: { packageName: string; selected: boolean; claimedAcceptedFeature: boolean }): {
  action: "absent" | "selected" | "refuse";
  code?: ExpoCapabilityRefusalCode;
  reason: string;
} {
  if (!input.selected && input.claimedAcceptedFeature) {
    return {
      action: "refuse",
      code: input.packageName.length > 0 ? "installed-library-is-not-accepted-feature" : "unselected-integration-present",
      reason: "An installed library is not an accepted feature. Unselected integrations stay absent from the accepted set.",
    };
  }
  if (!input.selected) {
    return {
      action: "absent",
      reason: "Unselected integration stays absent from accepted features.",
    };
  }
  return {
    action: "selected",
    reason: "Selection is recorded. Capability operations still stay blocked until a later owner proves them.",
  };
}

export type ExpoAuthSessionEvent = "sign-in" | "cancelled" | "expired" | "revoked" | "malicious-callback" | "account-switch";

export interface ExpoAuthSessionState {
  signedIn: boolean;
  appUserId: string | null;
  priorUserDataPresent: boolean;
  entitled: boolean;
}

export const EMPTY_AUTH_SESSION: ExpoAuthSessionState = {
  signedIn: false,
  appUserId: null,
  priorUserDataPresent: false,
  entitled: false,
};

function clearedAuthSession(): ExpoAuthSessionState {
  return { signedIn: false, appUserId: null, priorUserDataPresent: false, entitled: false };
}

export function reduceAuthSession(input: { event: ExpoAuthSessionEvent; current: ExpoAuthSessionState; incomingUserId?: string; callbackTrusted?: boolean }): {
  next: ExpoAuthSessionState;
  leakedPriorUser: false;
  paidAccessLeaked: false;
  code?: ExpoCapabilityRefusalCode;
  reason: string;
} {
  const sealed = (next: ExpoAuthSessionState, reason: string, code?: ExpoCapabilityRefusalCode) => ({
    next,
    leakedPriorUser: false as const,
    paidAccessLeaked: false as const,
    code,
    reason,
  });
  switch (input.event) {
    case "malicious-callback":
      return sealed(clearedAuthSession(), "Untrusted callback cannot create a session or keep prior-user data.", "malicious-callback");
    case "cancelled":
      return sealed(clearedAuthSession(), "Cancelled sign-in leaves no session and no entitlement.");
    case "expired":
    case "revoked":
      return sealed(clearedAuthSession(), "Expired or revoked session clears user-scoped data and paid access.");
    case "account-switch": {
      const nextId = input.incomingUserId?.trim() || null;
      return sealed(
        { signedIn: Boolean(nextId), appUserId: nextId, priorUserDataPresent: false, entitled: false },
        "Account switch clears prior-user data. Paid access does not follow the previous user.",
      );
    }
    case "sign-in": {
      if (input.callbackTrusted !== true) {
        return sealed(clearedAuthSession(), "Sign-in with an untrusted callback is refused.", "malicious-callback");
      }
      const nextId = input.incomingUserId?.trim() || null;
      if (!nextId) {
        return sealed(clearedAuthSession(), "Sign-in without an app user id creates no session.");
      }
      return sealed(
        { signedIn: true, appUserId: nextId, priorUserDataPresent: false, entitled: false },
        "Sign-in records app auth only. It does not grant a paid entitlement.",
      );
    }
    default: {
      const exhaustive: never = input.event;
      throw new Error(`unhandled auth session event: ${String(exhaustive)}`);
    }
  }
}

export function classifyUnauthenticatedBackendRequest(input: { authenticated: boolean; navigationGuardBypassed: boolean }): {
  action: "accept-classification" | "refuse";
  code?: "unauthenticated-backend";
  reason: string;
} {
  if (!input.authenticated) {
    return {
      action: "refuse",
      code: "unauthenticated-backend",
      reason: input.navigationGuardBypassed
        ? "Bypassing an Expo Router guard does not authorize a backend request."
        : "Unauthenticated backend requests fail. Client navigation is not server authorization.",
    };
  }
  return {
    action: "accept-classification",
    reason: "Authenticated classification only. The authentication operation stays blocked.",
  };
}

export type ExpoOfflineEvent = "restart" | "reconnect" | "duplicate-request" | "migration-failure" | "interrupted-write";

export type ExpoOfflineEventClaim = "local-cache-preserved" | "backend-success" | "write-complete";

export function classifyOfflineEvent(input: { event: ExpoOfflineEvent; store: ExpoOfflineStoreKind; claimed: ExpoOfflineEventClaim }): {
  action: "accept-classification" | "refuse";
  code?: ExpoCapabilityRefusalCode;
  reason: string;
} {
  if (input.store === "sqlite" && input.claimed === "backend-success") {
    return {
      action: "refuse",
      code: "sqlite-is-not-backend",
      reason: "A local SQLite restart or reconnect is not backend success.",
    };
  }
  switch (input.event) {
    case "migration-failure":
      if (input.claimed === "backend-success" || input.claimed === "write-complete") {
        return {
          action: "refuse",
          code: "offline-migration-claimed-success",
          reason: "A failed local migration is not write completion or backend success.",
        };
      }
      return {
        action: "accept-classification",
        reason: "Migration failure stays an explicit hold. The offline-data operation stays blocked.",
      };
    case "interrupted-write":
      if (input.claimed === "write-complete" || input.claimed === "backend-success") {
        return {
          action: "refuse",
          code: "interrupted-write-claimed-complete",
          reason: "An interrupted write is not completion. Local cache is not a backend of record.",
        };
      }
      return {
        action: "accept-classification",
        reason: "Interrupted write stays incomplete. The offline-data operation stays blocked.",
      };
    case "restart":
    case "reconnect":
    case "duplicate-request":
      if (input.claimed !== "local-cache-preserved") {
        return {
          action: "refuse",
          code: "sqlite-is-not-backend",
          reason: "Restart, reconnect, and duplicate local requests preserve cache semantics. They are not backend success.",
        };
      }
      return {
        action: "accept-classification",
        reason: "Local cache semantics only. The offline-data operation stays blocked.",
      };
    default: {
      const exhaustive: never = input.event;
      throw new Error(`unhandled offline event: ${String(exhaustive)}`);
    }
  }
}

export type ExpoPermissionOutcome = "granted" | "denied" | "revoked" | "unavailable";

export function classifyPermissionOutcome(input: {
  capability: ExpoDeviceCapability;
  platform: ShippingPlatform;
  outcome: ExpoPermissionOutcome;
  claimedNativeSuccess?: boolean;
}): {
  safeState: "proceed" | "unavailable-safe";
  action: "accept-classification" | "refuse";
  fakeSuccess: false;
  code?: ExpoCapabilityRefusalCode;
  reason: string;
} {
  if (input.platform === "web" && input.claimedNativeSuccess) {
    return {
      safeState: "unavailable-safe",
      action: "refuse",
      fakeSuccess: false,
      code: "web-fakes-native-permission",
      reason: `Web must not fake native ${input.capability} success.`,
    };
  }
  switch (input.outcome) {
    case "granted":
      if (input.claimedNativeSuccess && input.platform === "web") {
        return {
          safeState: "unavailable-safe",
          action: "refuse",
          fakeSuccess: false,
          code: "web-fakes-native-permission",
          reason: `Web must not fake native ${input.capability} success.`,
        };
      }
      return {
        safeState: "proceed",
        action: "accept-classification",
        fakeSuccess: false,
        reason: "Granted classification only. The device-capabilities operation stays blocked.",
      };
    case "denied":
    case "revoked":
    case "unavailable":
      if (input.claimedNativeSuccess) {
        return {
          safeState: "unavailable-safe",
          action: "refuse",
          fakeSuccess: false,
          code: "permission-loop",
          reason: `${input.capability} ${input.outcome} is a safe unavailable state, not native success.`,
        };
      }
      return {
        safeState: "unavailable-safe",
        action: "accept-classification",
        fakeSuccess: false,
        reason: `${input.capability} ${input.outcome} stays a useful safe state. The device-capabilities operation stays blocked.`,
      };
    default: {
      const exhaustive: never = input.outcome;
      throw new Error(`unhandled permission outcome: ${String(exhaustive)}`);
    }
  }
}

export function classifyNotificationHandoff(input: {
  tokenOk: boolean;
  receiptOk: boolean;
  claimedPersonSawNotification: boolean;
  deepLinkRoute?: string;
  selectedRestoreRoute?: string;
}): {
  deliveredToPerson: false;
  restoreRoute?: string;
  action: "accept-classification" | "refuse";
  code?: ExpoCapabilityRefusalCode;
  reason: string;
} {
  if (input.claimedPersonSawNotification) {
    return {
      deliveredToPerson: false,
      action: "refuse",
      code: "claimed-delivery-without-handoff",
      reason: "A push ticket or receipt is not evidence a person saw the notification.",
    };
  }
  if (!input.tokenOk) {
    return {
      deliveredToPerson: false,
      action: "refuse",
      code: "token-error-is-not-delivery",
      reason: "A token error is not notification delivery.",
    };
  }
  if (!input.receiptOk) {
    return {
      deliveredToPerson: false,
      action: "refuse",
      code: "receipt-error-is-not-delivery",
      reason: "A push receipt error is handoff failure to Apple or Google, not delivery to a person.",
    };
  }
  if (input.deepLinkRoute && input.selectedRestoreRoute && input.deepLinkRoute !== input.selectedRestoreRoute) {
    return {
      deliveredToPerson: false,
      action: "refuse",
      code: "deep-link-route-mismatch",
      reason: "A selected notification deep link must restore the matching screen.",
    };
  }
  return {
    deliveredToPerson: false,
    restoreRoute: input.deepLinkRoute && input.selectedRestoreRoute ? input.selectedRestoreRoute : undefined,
    action: "accept-classification",
    reason: "Handoff classification only. Token and receipt success is not person-seen proof. The device-capabilities operation stays blocked.",
  };
}
