/**
 * #83 capability protocol and #86 local/static web fixtures.
 *
 * Fake in-app transport and static-export canaries only. Live App Store, Play,
 * RevenueCat mutations, paid EAS, and production hosting stay not-run.
 */
import {
  EXPO_CAPABILITY_OPERATION_IDS,
  EXPO_CAPABILITY_SOURCES,
  capabilityOperationsRemainBlocked,
  capabilityRow,
  classifyDeviceCapability,
  classifyEnvName,
  classifyInstalledIntegration,
  classifyOfflineClaim,
  classifyProtectedRoute,
  classifyPurchaseOperation,
  evaluateIdentityBoundary,
  proofScopeIsNativeStore,
  runFakeInAppTransport,
  scanClientArtifacts,
} from "../../../catalog/stacks/expo-capability-protocol.js";
import { EXPO_APP_RUNTIME, operationFor, resolveExpoSelection } from "../../../catalog/stacks/expo-selection.js";
import {
  EXPO_WEB_OPERATION_IDS,
  EXPO_WEB_STATIC_SOURCES,
  classifyWebNativeModule,
  decideExpoWebSurface,
  defaultWebSurfaceMode,
  scanStaticExportArtifacts,
  webOperationsRemainBlocked,
} from "../../../catalog/stacks/expo-web-static.js";
import { assert, type Harness } from "./_harness.js";

const CANARIES = [
  { name: "EXPO_PUBLIC_API_URL", value: "https://example.invalid/public" },
  { name: "EXPO_TOKEN", value: "CANARY_EXPO_TOKEN_NOT_A_SECRET" },
  { name: "ASC_API_KEY", value: "CANARY_ASC_API_KEY_NOT_A_SECRET" },
  { name: "AUTH_REFRESH_TOKEN", value: "CANARY_REFRESH_TOKEN_NOT_A_SECRET" },
  { name: "OPENAI_API_KEY", value: "CANARY_OPENAI_API_KEY_NOT_A_SECRET" },
] as const;

export function register(harness: Harness): void {
  harness.check("expo capabilities: #83 operations stay blocked and are not live-store proof", () => {
    const resolution = resolveExpoSelection({ compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME } });
    assert(capabilityOperationsRemainBlocked(resolution), "capability operations must stay blocked");
    for (const id of EXPO_CAPABILITY_OPERATION_IDS) {
      const row = capabilityRow(id);
      const operation = operationFor(resolution, id);
      assert(row.evidenceTier === "blocked" && row.liveMutation === false, `${id} protocol row must stay blocked`);
      assert(row.nativeStoreProof === false, `${id} must not claim native-store proof`);
      assert(operation.evidenceTier === "blocked" && operation.queuedIssue === 83, `${id} selection row must stay #83 blocked`);
    }
    assert(operationFor(resolution, "native-purchases").queuedIssue === 83, "native purchases stay #83, not #79");
    assert(Object.values(EXPO_CAPABILITY_SOURCES).every((url) => url.startsWith("https://")), "capability sources must be https citations");
  });

  harness.check("expo capabilities: fake transport covers purchase, restore, pending, error, expiry, and account isolation", () => {
    const purchased = runFakeInAppTransport({ action: "purchase", appUserId: "user-a", scripted: "purchased" });
    assert(purchased.outcome === "purchased" && purchased.entitled, "scripted purchase must entitle the fake user");
    assert(purchased.liveStoreMutation === false && purchased.nativeStoreProof === false, "fake purchase is not native-store proof");
    assert(purchased.labeledLive === false && purchased.proofScope === "browser-mock", "fake transport stays browser-mock");

    const restored = runFakeInAppTransport({ action: "restore", appUserId: "user-a", scripted: "restored" });
    assert(restored.outcome === "restored" && restored.entitled, "scripted restore must entitle the same fake user");

    const pending = runFakeInAppTransport({ action: "purchase", appUserId: "user-a", scripted: "pending" });
    assert(pending.outcome === "pending" && pending.entitled === false, "pending is not entitlement");

    const errored = runFakeInAppTransport({ action: "purchase", appUserId: "user-a", scripted: "error" });
    assert(errored.outcome === "error" && errored.entitled === false, "error is not entitlement");

    const expired = runFakeInAppTransport({ action: "restore", appUserId: "user-a", scripted: "expired" });
    assert(expired.outcome === "expired" && expired.entitled === false, "expiry is not entitlement");

    const isolated = runFakeInAppTransport({
      action: "restore",
      appUserId: "user-b",
      previousAppUserId: "user-a",
      scripted: "restored",
    });
    assert(isolated.outcome === "account-isolated" && isolated.accountIsolated, "account switch must not restore the previous user's entitlement");
    assert(isolated.entitled === false, "isolated restore must not entitle the new user");
  });

  harness.check("expo capabilities: live store, Play, and RevenueCat simulate-purchase stay refused", () => {
    const live = classifyPurchaseOperation({
      transport: "live-store",
      proofScope: "production",
      platform: "ios",
      action: "purchase",
      client: "release-build",
    });
    assert(live.action === "refuse" && live.code === "live-store-mutation", "live App Store / Play must refuse");

    const simulate = classifyPurchaseOperation({
      transport: "revenuecat-cli",
      proofScope: "test-store",
      platform: "host",
      action: "simulate-purchase",
      client: "development-build",
    });
    assert(simulate.action === "refuse" && simulate.code === "revenuecat-cli-simulate-purchase", "CLI simulate-purchase stays #79");

    const cliRestore = classifyPurchaseOperation({
      transport: "revenuecat-cli",
      proofScope: "test-store",
      platform: "ios",
      action: "restore",
      client: "development-build",
    });
    assert(cliRestore.action === "refuse" && cliRestore.code === "cli-is-not-native-purchase", "CLI restore is not native restore");

    const web = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "web-checkout",
      platform: "web",
      action: "purchase",
      client: "web-browser",
    });
    assert(web.action === "refuse" && web.code === "web-fakes-native-purchase", "web must not fake native purchase");

    const expoGo = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "browser-mock",
      platform: "ios",
      action: "purchase",
      client: "expo-go",
    });
    assert(expoGo.action === "refuse" && expoGo.code === "expo-go-native-library", "Expo Go cannot load react-native-purchases");

    const testStoreClaim = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "test-store",
      platform: "ios",
      action: "purchase",
      client: "development-build",
      claimNativeStoreProof: true,
    });
    assert(testStoreClaim.action === "refuse" && testStoreClaim.code === "proof-scope-is-not-native-store", "Test Store is not native proof");
    assert(proofScopeIsNativeStore("test-store") === false, "test-store is not a native scope");
    assert(proofScopeIsNativeStore("web-checkout") === false, "web-checkout is not a native scope");
    assert(proofScopeIsNativeStore("apple-sandbox") === true, "apple-sandbox is a native scope");

    const fakeNativeClaim = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "apple-sandbox",
      platform: "ios",
      action: "purchase",
      client: "development-build",
      claimNativeStoreProof: true,
    });
    assert(fakeNativeClaim.action === "refuse", "fake transport cannot certify sandbox proof");

    const allowed = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "browser-mock",
      platform: "ios",
      action: "purchase",
      client: "development-build",
    });
    assert(allowed.action === "allow-fake" && allowed.nativeStoreProof === false, "fake fixture is allowed without native proof");
  });

  harness.check("expo capabilities: app auth, RevenueCat identity, and entitlements stay independent", () => {
    const collapsedAuth = evaluateIdentityBoundary({
      claim: "auth-implies-entitlement",
      signedIn: true,
      revenueCatIdentified: false,
      entitled: false,
    });
    assert(collapsedAuth.ok === false && collapsedAuth.code === "identity-kinds-collapsed", "signed-in is not paid");

    const collapsedRc = evaluateIdentityBoundary({
      claim: "rc-identity-implies-entitlement",
      signedIn: true,
      revenueCatIdentified: true,
      entitled: false,
    });
    assert(collapsedRc.ok === false, "RevenueCat app-user identity is not a paid entitlement");

    const separated = evaluateIdentityBoundary({
      claim: "separated",
      signedIn: true,
      revenueCatIdentified: true,
      entitled: true,
    });
    assert(separated.ok, "independent facts may all be true without collapsing kinds");
  });

  harness.check("expo capabilities: non-public secrets cannot appear in client artifacts; EXPO_PUBLIC_ may", () => {
    assert(classifyEnvName("EXPO_PUBLIC_API_URL") === "expo-public-client", "EXPO_PUBLIC_ is client-inlined");
    assert(classifyEnvName("EXPO_TOKEN") === "management-key", "EXPO_TOKEN is a management key");
    assert(classifyEnvName("ASC_API_KEY") === "signing-secret", "ASC key is signing");
    assert(classifyEnvName("AUTH_REFRESH_TOKEN") === "refresh-token", "refresh token is not public");
    assert(classifyEnvName("OPENAI_API_KEY") === "ai-provider-key", "AI keys are not public");

    const leaked = scanClientArtifacts(
      [
        { path: "dist/index.html", contents: "<html>https://example.invalid/public</html>" },
        { path: "dist/_expo/static/js/web/index.js", contents: "const k = 'CANARY_EXPO_TOKEN_NOT_A_SECRET';" },
      ],
      CANARIES,
    );
    assert(leaked.action === "refuse" && leaked.code === "secret-in-client-bundle", "management canary in the bundle must refuse");
    assert(
      leaked.leaks.some((leak) => leak.name === "EXPO_TOKEN" && leak.path.includes("index.js")),
      "leak must name the management canary",
    );

    const publicOnly = scanClientArtifacts(
      [{ path: "dist/index.html", contents: "<html>https://example.invalid/public</html>" }],
      CANARIES,
    );
    assert(publicOnly.action === "pass" && publicOnly.leaks.length === 0, "EXPO_PUBLIC_ values may appear in the client bundle");
  });

  harness.check("expo capabilities: SQLite is not a backend, SecureStore is not web storage, client routes are not authorization", () => {
    const sqliteBackend = classifyOfflineClaim({ store: "sqlite", claim: "backend-of-record", platform: "ios" });
    assert(sqliteBackend.action === "refuse" && sqliteBackend.code === "sqlite-is-not-backend", "SQLite is not the backend");

    const secureWeb = classifyOfflineClaim({ store: "secure-store", claim: "web-storage-equivalent", platform: "ios" });
    assert(secureWeb.action === "refuse" && secureWeb.code === "secure-store-is-not-web-storage", "SecureStore is not localStorage");

    const secureOnWeb = classifyOfflineClaim({ store: "secure-store", claim: "native-encrypted", platform: "web" });
    assert(secureOnWeb.action === "refuse", "web must not claim native SecureStore");

    const localCache = classifyOfflineClaim({ store: "sqlite", claim: "local-cache", platform: "ios" });
    assert(localCache.action === "accept-classification", "local SQLite cache is a valid classification");

    const webPermission = classifyDeviceCapability({
      capability: "camera",
      platform: "web",
      claimedNativeSuccess: true,
    });
    assert(webPermission.action === "refuse" && webPermission.code === "web-fakes-native-permission", "web must not fake native camera");

    const nativePermission = classifyDeviceCapability({
      capability: "notifications",
      platform: "ios",
      claimedNativeSuccess: true,
    });
    assert(nativePermission.action === "accept-classification", "native notification availability may be classified");

    const clientAuthz = classifyProtectedRoute({ surface: "client-router", claim: "server-authorization" });
    assert(clientAuthz.action === "refuse" && clientAuthz.code === "client-route-is-not-server-authorization", "protected layout is not server authz");

    const clientGate = classifyProtectedRoute({ surface: "client-router", claim: "client-gate-only" });
    assert(clientGate.action === "accept-classification", "client gate may be classified as a client gate");
  });

  harness.check("expo capabilities: installed libraries are not accepted features when unselected", () => {
    const installedUnselected = classifyInstalledIntegration({
      packageName: "react-native-purchases",
      selected: false,
      claimedAcceptedFeature: true,
    });
    assert(
      installedUnselected.action === "refuse" && installedUnselected.code === "installed-library-is-not-accepted-feature",
      "installed IAP library is not an accepted feature",
    );

    const absent = classifyInstalledIntegration({
      packageName: "react-native-purchases",
      selected: false,
      claimedAcceptedFeature: false,
    });
    assert(absent.action === "absent", "unselected integration stays absent");
  });

  harness.check("expo web static: default is static; SSR, API routes, deploy-server, and production hosts refuse", () => {
    const webTarget = { platform: "web" as const, runtime: EXPO_APP_RUNTIME };
    const resolution = resolveExpoSelection({ compositionTarget: webTarget });
    assert(webOperationsRemainBlocked(resolution), "web export and EAS Hosting stay blocked");
    assert(defaultWebSurfaceMode() === "static", "local/static default is static");
    for (const id of EXPO_WEB_OPERATION_IDS) {
      assert(operationFor(resolution, id).queuedIssue === 86, `${id} stays #86`);
      assert(operationFor(resolution, id).evidenceTier === "blocked", `${id} must not claim fixture-tested`);
    }

    const local = decideExpoWebSurface({ compositionTarget: webTarget });
    assert(local.action === "classify-local-static" && local.mode === "static", "unspecified mode defaults to static");
    assert(local.defaultedToStatic && local.exportEvidenceTier === "blocked", "classification is not export proof");
    assert(local.productionHost === false && local.easHosting === false, "no production host is selected");

    const api = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "static", apiRoutesRequired: true });
    assert(api.action === "refuse" && api.code === "static-plus-api-routes", "static cannot run API routes");

    const spaApi = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "spa", apiRoutesRequired: true });
    assert(spaApi.action === "refuse" && spaApi.code === "spa-plus-api-routes", "SPA cannot run API routes");

    const server = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "server" });
    assert(server.action === "refuse" && server.code === "server-output-not-local-static", "server output is not local/static");

    const staticSsr = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "static", ssrRequired: true });
    assert(staticSsr.action === "refuse" && staticSsr.code === "static-plus-ssr", "static cannot satisfy SSR");

    const ssr = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "alpha-ssr" });
    assert(ssr.action === "refuse" && ssr.code === "ssr-not-selected", "SSR stays unselected");

    const deploy = decideExpoWebSurface({ compositionTarget: webTarget, unstableDeployServer: true });
    assert(deploy.action === "refuse" && deploy.code === "unstable-deploy-server-unauthorized", "deploy-server needs authority");

    const hosting = decideExpoWebSurface({ compositionTarget: webTarget, easHostingRequested: true });
    assert(hosting.action === "refuse" && hosting.code === "eas-hosting-not-authorized", "EAS Hosting stays a hold");

    const prod = decideExpoWebSurface({ compositionTarget: webTarget, productionHostRequested: true });
    assert(prod.action === "refuse" && prod.code === "production-host-not-authorized", "production hosting stays a hold");

    const native = decideExpoWebSurface({ compositionTarget: webTarget, requiredNativePlatform: "ios" });
    assert(native.action === "refuse" && native.code === "web-is-not-native", "web cannot satisfy iOS");

    assert(Object.values(EXPO_WEB_STATIC_SOURCES).every((url) => url.startsWith("https://")), "web sources must be https citations");
  });

  harness.check("expo web static: native-only modules stay unsupported; secret canaries fail a static export", () => {
    const purchases = classifyWebNativeModule("react-native-purchases");
    assert(purchases.status === "unsupported" && purchases.fakeSuccess === false, "IAP stays unsupported on web");
    assert(purchases.code === "native-module-unsupported-on-web", "native IAP must be explicit unsupported");

    const secure = classifyWebNativeModule("secure-store");
    assert(secure.status === "unsupported", "SecureStore stays unsupported on web");

    const webSafe = classifyWebNativeModule("web-safe");
    assert(webSafe.status === "supported" && webSafe.fakeSuccess === false, "web-safe is not a fake-success path");

    const leaked = scanStaticExportArtifacts(
      [{ path: "dist/_expo/static/js/web/index.js", contents: "CANARY_OPENAI_API_KEY_NOT_A_SECRET" }],
      CANARIES,
    );
    assert(leaked.action === "refuse" && leaked.code === "secret-in-client-bundle", "AI key canary in a static export must refuse");
  });
}
