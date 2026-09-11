/**
 * #83 capability protocol and #86 local/static web fixtures.
 *
 * Local session/cache/permission fixtures plus fake in-app purchase transport.
 * Live App Store, Play, RevenueCat mutations, paid EAS, and production hosting stay not-run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EMPTY_AUTH_SESSION,
  EXPO_CAPABILITY_OPERATION_IDS,
  EXPO_CAPABILITY_SOURCES,
  capabilityOperationsRemainBlocked,
  capabilityRow,
  classifyDeviceCapability,
  classifyEnvName,
  classifyInstalledIntegration,
  classifyNotificationHandoff,
  classifyOfflineClaim,
  classifyOfflineEvent,
  classifyPermissionOutcome,
  classifyProtectedRoute,
  classifyPurchaseOperation,
  classifyUnauthenticatedBackendRequest,
  evaluateIdentityBoundary,
  proofScopeIsNativeStore,
  reduceAuthSession,
  runFakeInAppTransport,
  scanClientArtifacts,
} from "../../../catalog/stacks/expo-capability-protocol.js";
import { EXPO_APP_RUNTIME, HOST_AGENT_RUNTIME, operationFor, resolveExpoSelection } from "../../../catalog/stacks/expo-selection.js";
import {
  localSelectedCapabilitiesAreFixtureTested,
  nativePurchasesRemainBlocked,
  runLocalCapabilityJourney,
} from "../../../catalog/stacks/expo-local-capabilities.js";
import { ROUTE_HREFS } from "../../../catalog/stacks/expo-starter-fixture/src/navigation/route-graph.js";
import { listLocalCacheNotes, reopenLocalCache, writeLocalCacheNote } from "../../../catalog/stacks/expo-starter-fixture/src/offline/local-cache.js";
import {
  EXPO_WEB_OPERATION_IDS,
  EXPO_WEB_STATIC_SOURCES,
  bindLocalStaticExport,
  bindStaticExportRoutes,
  classifyStaticExportNavigation,
  classifyWebNativeModule,
  decideExpoWebSurface,
  defaultWebSurfaceMode,
  easHostingRemainsBlocked,
  localStaticExportIsFixtureTested,
  scanStaticExportArtifacts,
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
  harness.check("expo capabilities: local session, cache, and permissions are fixture-tested; native purchases stay blocked", () => {
    const resolution = resolveExpoSelection({ compositionTarget: { platform: "ios", runtime: EXPO_APP_RUNTIME } });
    assert(localSelectedCapabilitiesAreFixtureTested(resolution), "selected local capabilities must be fixture-tested");
    assert(nativePurchasesRemainBlocked(resolution), "native purchases stay blocked");
    assert(capabilityOperationsRemainBlocked(resolution), "native purchases remain the blocked #83 row");
    for (const id of EXPO_CAPABILITY_OPERATION_IDS) {
      const row = capabilityRow(id);
      const operation = operationFor(resolution, id);
      assert(row.liveMutation === false && row.nativeStoreProof === false, `${id} must not claim native-store proof`);
      assert(operation.queuedIssue === 83, `${id} stays #83`);
      if (id === "native-purchases") {
        assert(row.evidenceTier === "blocked" && operation.evidenceTier === "blocked", "native purchases stay blocked");
      } else {
        assert(row.evidenceTier === "fixture-tested" && operation.evidenceTier === "fixture-tested", `${id} is fixture-tested locally`);
      }
    }
    const unselected = resolveExpoSelection({ compositionTarget: { platform: "host", runtime: HOST_AGENT_RUNTIME } });
    assert(operationFor(unselected, "authentication").evidenceTier === "blocked", "unselected Expo must not inherit local session");
    assert(
      Object.values(EXPO_CAPABILITY_SOURCES).every((url) => url.startsWith("https://")),
      "capability sources must be https citations",
    );
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
    });
    assert(fakeNativeClaim.action === "refuse" && fakeNativeClaim.code === "proof-scope-is-not-native-store", "fake transport cannot carry apple-sandbox");
    assert(fakeNativeClaim.proofScope === "browser-mock", "fake IAP must not echo apple-sandbox");

    const fakePlay = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "play-sandbox",
      platform: "android",
      action: "purchase",
      client: "development-build",
    });
    assert(fakePlay.proofScope === "browser-mock" && fakePlay.action === "refuse", "fake IAP must not echo play-sandbox");

    const fakeProduction = classifyPurchaseOperation({
      transport: "fake-in-app",
      proofScope: "production",
      platform: "ios",
      action: "purchase",
      client: "release-build",
    });
    assert(fakeProduction.proofScope === "browser-mock" && fakeProduction.action === "refuse", "fake IAP must not echo production");

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

    const publicOnly = scanClientArtifacts([{ path: "dist/index.html", contents: "<html>https://example.invalid/public</html>" }], CANARIES);
    assert(publicOnly.action === "pass" && publicOnly.leaks.length === 0, "EXPO_PUBLIC_ values may appear in the client bundle");

    const unknown = scanClientArtifacts(
      [{ path: "dist/_expo/static/js/web/index.js", contents: "const k = 'CANARY_MY_PROVIDER_SECRET_NOT_A_SECRET';" }],
      [{ name: "MY_PROVIDER_SECRET", value: "CANARY_MY_PROVIDER_SECRET_NOT_A_SECRET" }],
    );
    assert(unknown.action === "refuse" && unknown.code === "secret-in-client-bundle", "unknown non-EXPO_PUBLIC canaries must refuse");
    assert(
      unknown.leaks.some((leak) => leak.name === "MY_PROVIDER_SECRET" && leak.secretClass === "unknown"),
      "unknown canary must be reported",
    );
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

  harness.check("expo capabilities: cancelled, expired, malicious callback, and account switch cannot leak prior-user data or paid access", () => {
    const signedIn = reduceAuthSession({
      event: "sign-in",
      current: EMPTY_AUTH_SESSION,
      incomingUserId: "user-a",
      callbackTrusted: true,
    });
    assert(signedIn.next.signedIn && signedIn.next.appUserId === "user-a", "trusted sign-in records app auth");
    assert(signedIn.next.entitled === false && signedIn.paidAccessLeaked === false, "sign-in is not a paid entitlement");

    const cancelled = reduceAuthSession({ event: "cancelled", current: signedIn.next });
    assert(cancelled.next.signedIn === false && cancelled.next.priorUserDataPresent === false, "cancelled sign-in clears the session");
    assert(cancelled.leakedPriorUser === false && cancelled.paidAccessLeaked === false, "cancel cannot leak prior-user data");

    const expired = reduceAuthSession({
      event: "expired",
      current: { signedIn: true, appUserId: "user-a", priorUserDataPresent: true, entitled: true },
    });
    assert(expired.next.signedIn === false && expired.next.entitled === false, "expiry clears paid access");
    assert(expired.next.priorUserDataPresent === false, "expiry clears user-scoped data");

    const revoked = reduceAuthSession({
      event: "revoked",
      current: { signedIn: true, appUserId: "user-a", priorUserDataPresent: true, entitled: true },
    });
    assert(revoked.next.entitled === false && revoked.paidAccessLeaked === false, "revocation clears paid access");

    const malicious = reduceAuthSession({
      event: "malicious-callback",
      current: { signedIn: true, appUserId: "user-a", priorUserDataPresent: true, entitled: true },
    });
    assert(malicious.code === "malicious-callback" && malicious.next.signedIn === false, "malicious callback is refused");
    assert(malicious.next.priorUserDataPresent === false && malicious.next.entitled === false, "malicious callback cannot keep prior-user data");

    const untrustedSignIn = reduceAuthSession({
      event: "sign-in",
      current: EMPTY_AUTH_SESSION,
      incomingUserId: "attacker",
      callbackTrusted: false,
    });
    assert(untrustedSignIn.code === "malicious-callback" && untrustedSignIn.next.signedIn === false, "untrusted sign-in is refused");

    const switched = reduceAuthSession({
      event: "account-switch",
      current: { signedIn: true, appUserId: "user-a", priorUserDataPresent: true, entitled: true },
      incomingUserId: "user-b",
    });
    assert(switched.next.appUserId === "user-b" && switched.next.priorUserDataPresent === false, "account switch drops prior-user data");
    assert(switched.next.entitled === false && switched.paidAccessLeaked === false, "paid access does not follow the previous user");

    const bypassed = classifyUnauthenticatedBackendRequest({ authenticated: false, navigationGuardBypassed: true });
    assert(bypassed.action === "refuse" && bypassed.code === "unauthenticated-backend", "bypassing a client guard does not authorize the backend");
    const gated = classifyUnauthenticatedBackendRequest({ authenticated: false, navigationGuardBypassed: false });
    assert(gated.action === "refuse", "unauthenticated backend requests fail with the guard in place too");
  });

  harness.check("expo capabilities: offline restart, reconnect, duplicate, migration failure, and interrupted write keep local semantics", () => {
    const restart = classifyOfflineEvent({ event: "restart", store: "sqlite", claimed: "local-cache-preserved" });
    assert(restart.action === "accept-classification", "restart may preserve a local cache");
    const reconnect = classifyOfflineEvent({ event: "reconnect", store: "sqlite", claimed: "local-cache-preserved" });
    assert(reconnect.action === "accept-classification", "reconnect may preserve a local cache");
    const duplicate = classifyOfflineEvent({ event: "duplicate-request", store: "sqlite", claimed: "local-cache-preserved" });
    assert(duplicate.action === "accept-classification", "duplicate local requests stay cache semantics");

    const restartAsBackend = classifyOfflineEvent({ event: "restart", store: "sqlite", claimed: "backend-success" });
    assert(restartAsBackend.action === "refuse" && restartAsBackend.code === "sqlite-is-not-backend", "restart is not backend success");

    const migration = classifyOfflineEvent({ event: "migration-failure", store: "sqlite", claimed: "write-complete" });
    assert(migration.action === "refuse" && migration.code === "offline-migration-claimed-success", "failed migration is not write completion");

    const interrupted = classifyOfflineEvent({ event: "interrupted-write", store: "sqlite", claimed: "write-complete" });
    assert(interrupted.action === "refuse" && interrupted.code === "interrupted-write-claimed-complete", "interrupted write is not completion");
  });

  harness.check("expo capabilities: permission denial stays a safe state; token and receipt errors are not delivery", () => {
    const denied = classifyPermissionOutcome({ capability: "camera", platform: "ios", outcome: "denied" });
    assert(denied.safeState === "unavailable-safe" && denied.fakeSuccess === false, "denied camera stays a safe state");
    const revoked = classifyPermissionOutcome({ capability: "notifications", platform: "android", outcome: "revoked" });
    assert(revoked.safeState === "unavailable-safe", "revoked notifications stay a safe state");
    const loop = classifyPermissionOutcome({
      capability: "media-library",
      platform: "ios",
      outcome: "denied",
      claimedNativeSuccess: true,
    });
    assert(loop.action === "refuse" && loop.code === "permission-loop", "denied permission is not native success");

    const token = classifyNotificationHandoff({ tokenOk: false, receiptOk: true, claimedPersonSawNotification: false });
    assert(token.action === "refuse" && token.code === "token-error-is-not-delivery", "token error is not delivery");
    const receipt = classifyNotificationHandoff({ tokenOk: true, receiptOk: false, claimedPersonSawNotification: false });
    assert(receipt.action === "refuse" && receipt.code === "receipt-error-is-not-delivery", "receipt error is not delivery");
    const seen = classifyNotificationHandoff({ tokenOk: true, receiptOk: true, claimedPersonSawNotification: true });
    assert(seen.action === "refuse" && seen.code === "claimed-delivery-without-handoff", "a receipt is not person-seen proof");
    const mismatch = classifyNotificationHandoff({
      tokenOk: true,
      receiptOk: true,
      claimedPersonSawNotification: false,
      deepLinkRoute: "detail/1",
      selectedRestoreRoute: "settings",
    });
    assert(mismatch.action === "refuse" && mismatch.code === "deep-link-route-mismatch", "deep link must restore the matching screen");
    const restored = classifyNotificationHandoff({
      tokenOk: true,
      receiptOk: true,
      claimedPersonSawNotification: false,
      deepLinkRoute: "detail/1",
      selectedRestoreRoute: "detail/1",
    });
    assert(restored.action === "accept-classification" && restored.restoreRoute === "detail/1", "matching deep link restores the selected screen");
    assert(restored.deliveredToPerson === false, "restore is not person-seen proof");
  });

  harness.check("expo web static: default is static; SSR, API routes, deploy-server, and production hosts refuse", () => {
    const webTarget = { platform: "web" as const, runtime: EXPO_APP_RUNTIME };
    const resolution = resolveExpoSelection({ compositionTarget: webTarget });
    assert(easHostingRemainsBlocked(resolution), "EAS Hosting stays blocked");
    assert(localStaticExportIsFixtureTested(resolution), "local static export is fixture-tested");
    assert(defaultWebSurfaceMode() === "static", "local/static default is static");
    assert(operationFor(resolution, "expo-web-export").queuedIssue === 86, "web export stays #86");
    assert(operationFor(resolution, "eas-hosting").queuedIssue === 86, "EAS Hosting stays #86");
    assert(operationFor(resolution, "expo-web-export").evidenceTier === "fixture-tested", "local static export may be fixture-tested");
    assert(operationFor(resolution, "eas-hosting").evidenceTier === "blocked", "EAS Hosting must not claim fixture-tested");
    const unselected = resolveExpoSelection({ compositionTarget: { platform: "host", runtime: HOST_AGENT_RUNTIME } });
    assert(operationFor(unselected, "expo-web-export").evidenceTier === "blocked", "unselected Expo must not inherit web export");

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
    assert(ssr.action === "refuse" && ssr.code === "ssr-not-local-static", "SSR is not local/static");

    const ssrSelected = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "alpha-ssr", ssrSelected: true });
    assert(ssrSelected.action === "refuse" && ssrSelected.code === "ssr-not-local-static", "selected SSR is still not local/static");

    const deploy = decideExpoWebSurface({ compositionTarget: webTarget, unstableDeployServer: true });
    assert(deploy.action === "refuse" && deploy.code === "unstable-deploy-server-unauthorized", "deploy-server needs authority");

    const authorizedDeploy = decideExpoWebSurface({ compositionTarget: webTarget, unstableDeployServer: true, deployAuthorized: true });
    assert(
      authorizedDeploy.action === "refuse" && authorizedDeploy.code === "unstable-deploy-server-not-local-static",
      "authorized deploy-server is still not local/static",
    );

    const hosting = decideExpoWebSurface({ compositionTarget: webTarget, easHostingRequested: true });
    assert(hosting.action === "refuse" && hosting.code === "eas-hosting-not-authorized", "EAS Hosting stays a hold");

    const prod = decideExpoWebSurface({ compositionTarget: webTarget, productionHostRequested: true });
    assert(prod.action === "refuse" && prod.code === "production-host-not-authorized", "production hosting stays a hold");

    const native = decideExpoWebSurface({ compositionTarget: webTarget, requiredNativePlatform: "ios" });
    assert(native.action === "refuse" && native.code === "web-is-not-native", "web cannot satisfy iOS");

    const classificationOnly = bindLocalStaticExport({
      surface: local,
      webExport: { ok: false, indexHtmlPresent: false, javascriptBundlePresent: false },
    });
    assert(classificationOnly.action === "refuse" && classificationOnly.code === "export-missing-bundle", "classification is not export proof");

    const spa = decideExpoWebSurface({ compositionTarget: webTarget, requestedMode: "spa" });
    const spaBind = bindLocalStaticExport({
      surface: spa,
      webExport: { ok: true, indexHtmlPresent: true, javascriptBundlePresent: true },
    });
    assert(spaBind.action === "refuse" && spaBind.code === "spa-not-static-export", "SPA classification is not the static boot export");

    const hostingBind = bindLocalStaticExport({
      surface: hosting,
      webExport: { ok: true, indexHtmlPresent: true, javascriptBundlePresent: true },
    });
    assert(hostingBind.action === "refuse" && hostingBind.code === "eas-hosting-not-authorized", "EAS Hosting cannot bind as local static");

    for (const id of EXPO_WEB_OPERATION_IDS) {
      assert(operationFor(resolution, id).queuedIssue === 86, `${id} stays #86`);
    }

    assert(
      Object.values(EXPO_WEB_STATIC_SOURCES).every((url) => url.startsWith("https://")),
      "web sources must be https citations",
    );
  });

  harness.check("expo web static: native-only modules stay unsupported; secret canaries fail a static export", () => {
    const purchases = classifyWebNativeModule("react-native-purchases");
    assert(purchases.status === "unsupported" && purchases.fakeSuccess === false, "IAP stays unsupported on web");
    assert(purchases.code === "native-module-unsupported-on-web", "native IAP must be explicit unsupported");

    const secure = classifyWebNativeModule("secure-store");
    assert(secure.status === "unsupported", "SecureStore stays unsupported on web");

    const webSafe = classifyWebNativeModule("web-safe");
    assert(webSafe.status === "supported" && webSafe.fakeSuccess === false, "web-safe is not a fake-success path");

    const leaked = scanStaticExportArtifacts([{ path: "dist/_expo/static/js/web/index.js", contents: "CANARY_OPENAI_API_KEY_NOT_A_SECRET" }], CANARIES);
    assert(leaked.action === "refuse" && leaked.code === "secret-in-client-bundle", "AI key canary in a static export must refuse");

    const webTarget = { platform: "web" as const, runtime: EXPO_APP_RUNTIME };
    const surface = decideExpoWebSurface({ compositionTarget: webTarget });
    const leakBind = bindLocalStaticExport({
      surface,
      webExport: { ok: true, indexHtmlPresent: true, javascriptBundlePresent: true },
      artifacts: [{ path: "dist/_expo/static/js/web/index.js", contents: "CANARY_OPENAI_API_KEY_NOT_A_SECRET" }],
      canaries: CANARIES,
    });
    assert(leakBind.action === "refuse" && leakBind.code === "secret-in-client-bundle", "leaked export artifacts cannot bind");

    const observed = bindLocalStaticExport({
      surface,
      webExport: { ok: true, indexHtmlPresent: true, javascriptBundlePresent: true },
      artifacts: [{ path: "dist-web/index.html", contents: "<html></html>" }],
      canaries: CANARIES,
    });
    assert(observed.action === "observe-local-static" && observed.exportEvidenceTier === "fixture-tested", "clean static export may be observed");
    assert(
      observed.easHosting === false && observed.nativeProof === false && observed.runtimeVerified === false,
      "observation is not hosting or runtime proof",
    );
  });

  harness.check("expo web static: direct-entry, refresh, deep route, back, and unknown classify from HTML", () => {
    const exportDir = harness.makeTempDir("expo-static-navigation");
    writeFileSync(path.join(exportDir, "index.html"), "<html></html>\n");
    writeFileSync(path.join(exportDir, "settings.html"), "<html></html>\n");
    writeFileSync(path.join(exportDir, "sign-in.html"), "<html></html>\n");
    writeFileSync(path.join(exportDir, "modal.html"), "<html></html>\n");
    mkdirSync(path.join(exportDir, "detail"), { recursive: true });
    writeFileSync(path.join(exportDir, "detail/1.html"), "<html></html>\n");
    writeFileSync(path.join(exportDir, "+not-found.html"), "<html></html>\n");

    const routes = bindStaticExportRoutes({
      exportDir,
      requiredHrefs: [ROUTE_HREFS.home, ROUTE_HREFS.settings, ROUTE_HREFS.signIn, ROUTE_HREFS.modal, ROUTE_HREFS.detail("1")],
    });
    assert(routes.action === "observe-static-routes" && routes.notFoundPresent, routes.reason);

    const observed = classifyStaticExportNavigation({
      exportDir,
      steps: [
        { kind: "direct-entry", href: ROUTE_HREFS.home },
        { kind: "refresh", href: ROUTE_HREFS.settings },
        { kind: "deep-route", href: ROUTE_HREFS.detail("1") },
        { kind: "back", href: ROUTE_HREFS.home },
        { kind: "unknown", href: "/missing-static-route" },
      ],
    });
    assert(observed.action === "observe-static-navigation", observed.reason);
    assert(observed.browser === false && observed.runtimeVerified === false && observed.easHosting === false, observed.reason);
    assert(
      observed.steps.every((step) => (step.kind === "unknown" ? step.outcome === "recoverable-not-found" : step.outcome === "recoverable")),
      "known hrefs recover from HTML; unknown recovers through not-found",
    );

    const missingDeep = classifyStaticExportNavigation({
      exportDir,
      steps: [{ kind: "deep-route", href: ROUTE_HREFS.detail("99") }],
    });
    assert(missingDeep.action === "refuse" && missingDeep.code === "export-missing-route", missingDeep.reason);

    const noNotFoundDir = harness.makeTempDir("expo-static-missing-not-found");
    writeFileSync(path.join(noNotFoundDir, "index.html"), "<html></html>\n");
    const missingNotFound = bindStaticExportRoutes({ exportDir: noNotFoundDir, requiredHrefs: [ROUTE_HREFS.home] });
    assert(missingNotFound.action === "refuse" && missingNotFound.code === "export-missing-not-found", missingNotFound.reason);
    const unknownHidden = classifyStaticExportNavigation({
      exportDir: noNotFoundDir,
      steps: [{ kind: "unknown", href: "/missing-static-route" }],
    });
    assert(unknownHidden.action === "refuse" && unknownHidden.code === "export-missing-not-found", unknownHidden.reason);
  });

  harness.check("expo capabilities: disposable SQLite session and cache survive reopen without leaking accounts", () => {
    const journey = runLocalCapabilityJourney(harness.makeTempDir("expo-local-capabilities"));
    assert(journey.signedIn.action === "accept" && journey.signedIn.snapshot.session.appUserId === "user-a", journey.signedIn.reason);
    assert(
      journey.signedIn.snapshot.session.entitled === false && journey.signedIn.snapshot.secureStore === false,
      "local session is not SecureStore or paid access",
    );
    assert(journey.persistedNote.action === "accept" && journey.restarted.snapshot.notes.some((note) => note.id === "note-1"), journey.restarted.reason);
    assert(
      journey.duplicated.action === "accept" && journey.restarted.snapshot.notes.some((note) => note.id === "note-1" && note.body === "local cache only"),
      "duplicate write must keep the original local note",
    );
    assert(journey.migrated.action === "refuse" && !journey.restarted.snapshot.notes.some((note) => note.id === "note-migrate"), journey.migrated.reason);
    assert(journey.expired.snapshot.session.signedIn === false, "expired session clears the current user");
    assert(journey.switched.snapshot.session.appUserId === "user-b" && journey.isolated, "account switch isolates prior-user notes");
    assert(journey.interrupted.action === "refuse", "interrupted write is not completion");
    assert(journey.denied.snapshot.permission?.outcome === "denied", journey.denied.reason);
    assert(journey.restored.snapshot.restoreRoute === ROUTE_HREFS.detail("1"), journey.restored.reason);
    assert(journey.labeledLive === false && journey.restarted.snapshot.backendOfRecord === false, "local journey is not live or backend proof");
  });

  harness.check("expo capabilities: starter notes persist through the bound local-cache seam", () => {
    const written = writeLocalCacheNote({ id: "note-1", owner: "user-a", body: "local cache only" });
    assert(written.action === "accept", written.reason);
    const duplicate = writeLocalCacheNote({ id: "note-1", owner: "user-a", body: "should not replace", duplicate: true });
    assert(duplicate.action === "accept", duplicate.reason);
    const migrated = writeLocalCacheNote({ id: "note-migrate", owner: "user-a", body: "failed migration", migrationFailure: true });
    assert(migrated.action === "refuse", migrated.reason);
    const interrupted = writeLocalCacheNote({ id: "note-2", owner: "user-a", body: "partial", interrupt: true });
    assert(interrupted.action === "refuse", interrupted.reason);
    const reopened = reopenLocalCache();
    assert(
      reopened.some((note) => note.id === "note-1" && note.body === "local cache only" && note.owner === "user-a"),
      "bound local-cache seam must restore the original note after reopen",
    );
    assert(!reopened.some((note) => note.id === "note-migrate"), "failed migration must not persist a note");
    assert(
      reopened.some((note) => note.id === "note-2" && note.writeState === "incomplete"),
      "interrupted write stays incomplete after reopen",
    );
    assert(listLocalCacheNotes("user-b").length === 0, "another owner must not see the restored notes");
  });
}
