/**
 * Local/static Expo web decision (#86).
 *
 * Classifies `web.output` modes and refuses combinations that need a server, SSR, or a
 * remote host. This module does not deploy and does not run EAS Hosting.
 * Classification alone is not export proof. `bindLocalStaticExport` observes a disposable
 * Metro static export. The Expo/EAS executor still labels `expo.export` unavailable.
 *
 * Documented Expo Router outputs: `single` (SPA, documented default), `static`
 * (HTML/JS/assets), `server` (API routes / server bundle). This module defaults
 * remaining local work to `static` so SPA, SSR, and server output are not selected
 * by silence. Server rendering stays an explicit alpha selection.
 * `EXPO_UNSTABLE_DEPLOY_SERVER=1` is a remote deploy effect, not a local export flag.
 *
 * Consumes `catalog/stacks/expo-selection.ts` and the #83 secret canary scanner.
 */

import { scanClientArtifacts, type ClientArtifact, type ClientSecretScan, type SecretCanary } from "./expo-capability-protocol.js";
import { operationFor, shippingSatisfiesRequirement, type CompositionTarget, type ExpoSelectionResolution, type ShippingPlatform } from "./expo-selection.js";

export const EXPO_WEB_STATIC_PATH = "catalog/stacks/expo-web-static.ts" as const;

export const EXPO_WEB_STATIC_SOURCES = {
  webDeployments: "https://docs.expo.dev/guides/publishing-websites/",
  apiRoutes: "https://docs.expo.dev/router/web/api-routes/",
  serverRendering: "https://docs.expo.dev/router/web/server-rendering/",
  environmentVariables: "https://docs.expo.dev/guides/environment-variables/",
  easHosting: "https://docs.expo.dev/eas/hosting/introduction/",
} as const;

export const EXPO_WEB_OPERATION_IDS = ["expo-web-export", "eas-hosting"] as const;

export type ExpoWebSurfaceMode = "static" | "spa" | "server" | "alpha-ssr";

export type ExpoWebNativeModule = "secure-store" | "react-native-purchases" | "notifications-native" | "web-safe";

export type ExpoWebRefusalCode =
  | "static-plus-api-routes"
  | "spa-plus-api-routes"
  | "static-plus-ssr"
  | "ssr-not-selected"
  | "unstable-deploy-server-unauthorized"
  | "secret-in-client-bundle"
  | "native-module-unsupported-on-web"
  | "web-is-not-native"
  | "eas-hosting-not-authorized"
  | "production-host-not-authorized"
  | "server-output-not-local-static"
  | "ssr-not-local-static"
  | "unstable-deploy-server-not-local-static"
  | "operation-blocked"
  | "export-missing-bundle"
  | "classification-is-not-export"
  | "spa-not-static-export";

export interface ExpoWebSurfaceDecision {
  action: "classify-local-static" | "refuse";
  mode: ExpoWebSurfaceMode;
  defaultedToStatic: boolean;
  ssrSelected: false | true;
  productionHost: false;
  easHosting: false;
  exportEvidenceTier: "blocked";
  code?: ExpoWebRefusalCode;
  reason: string;
  runtimeVerified: false;
}

export interface ExpoWebModuleSupport {
  module: ExpoWebNativeModule;
  status: "supported" | "unsupported";
  fakeSuccess: false;
  code?: "native-module-unsupported-on-web";
  reason: string;
}

export function defaultWebSurfaceMode(): "static" {
  return "static";
}

export function easHostingRemainsBlocked(resolution: ExpoSelectionResolution): boolean {
  const hosting = operationFor(resolution, "eas-hosting");
  return hosting.evidenceTier === "blocked" && hosting.queuedIssue === 86;
}

export function localStaticExportIsFixtureTested(resolution: ExpoSelectionResolution): boolean {
  const exported = operationFor(resolution, "expo-web-export");
  return exported.evidenceTier === "fixture-tested" && exported.queuedIssue === 86;
}

export function webOperationsRemainBlocked(resolution: ExpoSelectionResolution): boolean {
  return easHostingRemainsBlocked(resolution) && operationFor(resolution, "expo-web-export").evidenceTier === "blocked";
}

export function decideExpoWebSurface(input: {
  compositionTarget: CompositionTarget;
  requestedMode?: ExpoWebSurfaceMode;
  apiRoutesRequired?: boolean;
  ssrRequired?: boolean;
  ssrSelected?: boolean;
  unstableDeployServer?: boolean;
  deployAuthorized?: boolean;
  easHostingRequested?: boolean;
  productionHostRequested?: boolean;
  requiredNativePlatform?: ShippingPlatform;
}): ExpoWebSurfaceDecision {
  const requested = input.requestedMode ?? defaultWebSurfaceMode();
  const defaultedToStatic = input.requestedMode === undefined;
  const blocked = {
    ssrSelected: Boolean(input.ssrSelected) as false | true,
    productionHost: false as const,
    easHosting: false as const,
    exportEvidenceTier: "blocked" as const,
    runtimeVerified: false as const,
  };

  if (input.compositionTarget.platform === "web" && input.requiredNativePlatform) {
    if (!shippingSatisfiesRequirement("web", input.requiredNativePlatform)) {
      return {
        action: "refuse",
        mode: requested,
        defaultedToStatic,
        ...blocked,
        code: "web-is-not-native",
        reason: "A web/expo surface cannot satisfy an iOS or Android native requirement.",
      };
    }
  }

  if (input.easHostingRequested) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "eas-hosting-not-authorized",
      reason: "EAS Hosting is production hosting. It stays a #86 hold.",
    };
  }

  if (input.productionHostRequested) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "production-host-not-authorized",
      reason: "Production hosting is out of scope for local/static classification.",
    };
  }

  if (requested === "server") {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "server-output-not-local-static",
      reason: "Server output needs a host that can run API routes. It is not local/static remaining work.",
    };
  }

  if (requested === "alpha-ssr") {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "ssr-not-local-static",
      reason: "Expo Router SSR is alpha and needs a deployed server. It is not local/static remaining work.",
    };
  }

  if (input.unstableDeployServer) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: input.deployAuthorized ? "unstable-deploy-server-not-local-static" : "unstable-deploy-server-unauthorized",
      reason: input.deployAuthorized
        ? "EXPO_UNSTABLE_DEPLOY_SERVER=1 is a remote EAS Hosting deploy during native build. It is not a local export."
        : "EXPO_UNSTABLE_DEPLOY_SERVER=1 is a remote deploy effect. Refuse it without explicit authority.",
    };
  }

  if (requested === "static" && input.ssrRequired) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "static-plus-ssr",
      reason: "Static HTML export cannot satisfy a required SSR surface.",
    };
  }

  if (input.ssrRequired) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "ssr-not-local-static",
      reason: "A required SSR surface needs a deployed server. It is not local/static remaining work.",
    };
  }

  if (requested === "static" && input.apiRoutesRequired) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "static-plus-api-routes",
      reason: "Static hosting cannot execute Expo Router API routes. Those need a real server.",
    };
  }

  if (requested === "spa" && input.apiRoutesRequired) {
    return {
      action: "refuse",
      mode: requested,
      defaultedToStatic,
      ...blocked,
      code: "spa-plus-api-routes",
      reason: "A single-page export cannot execute API routes.",
    };
  }

  return {
    action: "classify-local-static",
    mode: requested,
    defaultedToStatic,
    ...blocked,
    reason: "Local/static classification only. Bind a disposable Metro static export separately. EAS Hosting stays blocked.",
  };
}

export function classifyWebNativeModule(module: ExpoWebNativeModule): ExpoWebModuleSupport {
  switch (module) {
    case "web-safe":
      return {
        module,
        status: "supported",
        fakeSuccess: false,
        reason: "Web-safe module may render on the browser surface.",
      };
    case "secure-store":
    case "react-native-purchases":
    case "notifications-native":
      return {
        module,
        status: "unsupported",
        fakeSuccess: false,
        code: "native-module-unsupported-on-web",
        reason: "Native-only module is unsupported on web. Do not fake success.",
      };
    default: {
      const exhaustive: never = module;
      throw new Error(`unhandled web native module: ${String(exhaustive)}`);
    }
  }
}

export function scanStaticExportArtifacts(artifacts: readonly ClientArtifact[], canaries: readonly SecretCanary[]): ClientSecretScan {
  return scanClientArtifacts(artifacts, canaries);
}

export interface ExpoLocalStaticExportObservation {
  action: "observe-local-static" | "refuse";
  exportEvidenceTier: "fixture-tested" | "blocked";
  productionHost: false;
  easHosting: false;
  runtimeVerified: false;
  nativeProof: false;
  labeledLive: false;
  code?: ExpoWebRefusalCode;
  reason: string;
}

export function bindLocalStaticExport(input: {
  surface: ExpoWebSurfaceDecision;
  webExport: {
    ok: boolean;
    indexHtmlPresent: boolean;
    javascriptBundlePresent: boolean;
  };
  artifacts?: readonly ClientArtifact[];
  canaries?: readonly SecretCanary[];
}): ExpoLocalStaticExportObservation {
  const blocked = {
    exportEvidenceTier: "blocked" as const,
    productionHost: false as const,
    easHosting: false as const,
    runtimeVerified: false as const,
    nativeProof: false as const,
    labeledLive: false as const,
  };
  if (input.surface.action === "refuse") {
    return { action: "refuse", ...blocked, code: input.surface.code, reason: input.surface.reason };
  }
  switch (input.surface.mode) {
    case "spa":
      return {
        action: "refuse",
        ...blocked,
        code: "spa-not-static-export",
        reason: "Local boot export uses web.output static. A SPA classification is not that export.",
      };
    case "server":
    case "alpha-ssr":
      return {
        action: "refuse",
        ...blocked,
        code: "classification-is-not-export",
        reason: "Server and alpha SSR surfaces are not a local static Metro export.",
      };
    case "static":
      break;
    default: {
      const exhaustive: never = input.surface.mode;
      throw new Error(`unhandled web surface mode: ${String(exhaustive)}`);
    }
  }
  if (!input.webExport.ok || !input.webExport.indexHtmlPresent || !input.webExport.javascriptBundlePresent) {
    return {
      action: "refuse",
      ...blocked,
      code: "export-missing-bundle",
      reason: "Local static export needs index.html and a JavaScript bundle. Classification alone is not export proof.",
    };
  }
  if (input.artifacts && input.canaries) {
    const scan = scanStaticExportArtifacts(input.artifacts, input.canaries);
    if (scan.action === "refuse") {
      return {
        action: "refuse",
        ...blocked,
        code: "secret-in-client-bundle",
        reason: "Static export artifacts contain a non-public canary secret.",
      };
    }
  }
  return {
    action: "observe-local-static",
    exportEvidenceTier: "fixture-tested",
    productionHost: false,
    easHosting: false,
    runtimeVerified: false,
    nativeProof: false,
    labeledLive: false,
    reason: "Local static export artifacts observed. Not EAS Hosting, not SSR, not iOS or Android proof.",
  };
}
