import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  EXPO_APP_RUNTIME,
  EXPO_IS_DEFAULT_STACK,
  HOST_AGENT_RUNTIME,
  evaluateExpoCompatibility,
  operationFor,
  resolveExpoSelection,
  shippingSatisfiesRequirement,
} from "../../../catalog/stacks/expo-selection.js";
import {
  NATIVE_COMPILE_STATUS,
  NATIVE_GENERATION_FINGERPRINT_BASENAME,
  decideExpoPrebuild,
  inspectExpoNativeOwnership,
  nativeTreeDigest,
  writeNativeGenerationFingerprint,
} from "../../../catalog/stacks/expo-native-ownership.js";
import {
  EXPO_CUSTOM_MODULE_DIR,
  EXPO_CUSTOM_MODULE_FILES,
  EXPO_PACKAGE_MANAGER,
  METRO_NATIVE_ENTRY,
  METRO_WEB_ENTRY,
  decideExpoCustomModule,
  inspectExpoCustomModule,
  inspectPackagedExpoStarter,
  installPackagedExpoConsumer,
  isolatedStarterCustomModule,
  resolveMetroPackageEntry,
} from "../../../catalog/stacks/expo-custom-module.js";
import {
  EXPO_ROUTER_COMPANION_PINS,
  EXPO_ROUTER_ROUTE_FILES,
  EXPO_ROUTER_SRC_FILES,
  EXPO_ROUTER_WORKSPACE_PIN,
  inspectExpoCompanionPins,
  inspectExpoUiAdapter,
  isolatedStarterRouterLayout,
  planExpoRouterDelivery,
  reviewedExpoRouterFact,
} from "../../../catalog/stacks/expo-router-contract.js";
import {
  EXPO_BOOT_COMPANION_PINS,
  inspectExpoBootCompanionPins,
  localBootDoesNotUseExpoGo,
  runExpoStarterLocalBoot,
} from "../../../catalog/stacks/expo-local-boot.js";
import { bindLocalStaticExport, bindStaticExportRoutes, decideExpoWebSurface } from "../../../catalog/stacks/expo-web-static.js";
import { runLocalCapabilityJourney } from "../../../catalog/stacks/expo-local-capabilities.js";
import { invokeNativeCapability } from "../../../catalog/stacks/expo-starter-fixture/modules/b2c-native-capability/src/invoke.js";
import { invokeNativeCapability as invokeWebCapability } from "../../../catalog/stacks/expo-starter-fixture/modules/b2c-native-capability/src/index.web.js";
import {
  BUILDER_AUTHORITY_FILES,
  EXPO_STARTER_BOOT_FILES,
  EXPO_STARTER_FIXTURE_DIR,
  habitTrackerStarterIsNextNotExpo,
  isolatedExpoStarterPaths,
  materializeExpoStarterFixture,
  planExpoStarterScaffold,
  reviewedExpoFixturePins,
} from "../../../catalog/stacks/expo-starter.js";
import { SURFACE_STATES } from "../../../catalog/stacks/expo-starter-fixture/src/states/surface-state.js";
import { PERSISTENCE_SEAM_BOUND, PERSISTENCE_STORE_KIND } from "../../../catalog/stacks/expo-starter-fixture/src/persistence/seam.js";
import { deepLinkRecovery } from "../../../catalog/stacks/expo-starter-fixture/src/navigation/deep-link.js";
import { NAVIGATION_RUNTIME_VERIFIED, reduceNavigation } from "../../../catalog/stacks/expo-starter-fixture/src/navigation/journeys.js";
import { ROUTE_HREFS } from "../../../catalog/stacks/expo-starter-fixture/src/navigation/route-graph.js";
import { inspectWorkspace } from "../../../kernel/session/inspect.js";
import { assert, skillRoot, type Harness } from "./_harness.js";

const trapRoot = path.join(skillRoot, "checks/verification/test/data/expo-foundation/dynamic-config");

function withIsolatedHome<T>(home: string, fn: () => T): T {
  const previous = process.env.B2C_APP_BUILDER_HOME;
  process.env.B2C_APP_BUILDER_HOME = home;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.B2C_APP_BUILDER_HOME;
    else process.env.B2C_APP_BUILDER_HOME = previous;
  }
}

function iosExpo() {
  return { platform: "ios" as const, runtime: EXPO_APP_RUNTIME };
}

function writeExpoPackage(dir: string, extra: Record<string, string> = {}): void {
  writeFileSync(
    path.join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "synthetic-expo-app",
        private: true,
        version: "0.0.0",
        dependencies: { expo: "57.0.17", react: "19.2.0", "react-native": "0.86.3", ...extra },
      },
      null,
      2,
    )}\n`,
  );
}

function writeAppJson(dir: string, ownership: "generated-cng" | "maintained" | undefined): void {
  const extra = ownership ? { extra: { b2cNativeDirectoryOwnership: ownership } } : {};
  writeFileSync(path.join(dir, "app.json"), `${JSON.stringify({ expo: { name: "synthetic", slug: "synthetic", platforms: ["ios"], ...extra } }, null, 2)}\n`);
}

function writeNativeFile(dir: string, relative: string, contents: string): void {
  const target = path.join(dir, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function register(harness: Harness): void {
  harness.check("expo foundation: Expo stays selectable not default, and habit-tracker remains Next.js", () => {
    assert(EXPO_IS_DEFAULT_STACK === false, "Expo must not be the default stack");
    assert(habitTrackerStarterIsNextNotExpo(skillRoot), "habit-tracker starter must stay Next.js");
    const selected = resolveExpoSelection({ compositionTarget: iosExpo() });
    assert(operationFor(selected, "starter-scaffold").evidenceTier === "fixture-tested", "selected Expo starter fixture must be fixture-tested");
    assert(operationFor(selected, "cng-prebuild").evidenceTier === "fixture-tested", "CNG prebuild is fixture-tested in a disposable copy");
    assert(operationFor(selected, "expo-web-export").evidenceTier === "fixture-tested", "local static Metro export is fixture-tested");
    assert(operationFor(selected, "authentication").evidenceTier === "fixture-tested", "local session is fixture-tested");
    assert(operationFor(selected, "offline-data").evidenceTier === "fixture-tested", "local SQLite cache is fixture-tested");
    assert(operationFor(selected, "device-capabilities").evidenceTier === "fixture-tested", "permission and notification restore are fixture-tested");
    assert(operationFor(selected, "native-purchases").evidenceTier === "blocked", "native purchases stay blocked");
    assert(operationFor(selected, "eas-hosting").evidenceTier === "blocked", "EAS Hosting stays blocked");
    assert(operationFor(selected, "official-skills").evidenceTier === "blocked", "official Expo skills stay blocked until authorized");
    assert(
      operationFor(selected, "router-native-ui").evidenceTier === "fixture-tested",
      "Router/native UI is fixture-tested with a source-backed adapter and local Metro export",
    );
    assert(
      operationFor(selected, "custom-native-module").evidenceTier === "fixture-tested",
      "custom native module sources are fixture-tested; compile stays not-run",
    );
    const unselected = resolveExpoSelection({ compositionTarget: { platform: "host", runtime: HOST_AGENT_RUNTIME } });
    assert(operationFor(unselected, "starter-scaffold").evidenceTier === "blocked", "unselected Expo must not inherit the starter");
    assert(!shippingSatisfiesRequirement("web", "ios"), "web must not satisfy iOS");
  });

  harness.check("expo foundation: isolated starter has reviewed pins, no lockfile, and no builder authority files", () => {
    const files = isolatedExpoStarterPaths();
    assert(files.includes("package.json"), "starter fixture must include package.json");
    assert(files.includes("app.json"), "starter fixture must include static app.json");
    for (const relative of [...EXPO_ROUTER_ROUTE_FILES, ...EXPO_ROUTER_SRC_FILES, ...EXPO_CUSTOM_MODULE_FILES]) {
      assert(files.includes(relative), `starter fixture must include ${relative}`);
    }
    assert(files.includes("gitignore.template"), "starter fixture must use gitignore.template so npm can pack it");
    for (const relative of EXPO_STARTER_BOOT_FILES) {
      assert(files.includes(relative), `starter fixture must include ${relative} so Metro can boot`);
    }
    assert(!files.includes("package-lock.json"), "must not fabricate a lockfile");
    for (const name of BUILDER_AUTHORITY_FILES) {
      assert(!files.includes(name), `starter fixture must not ship ${name}`);
    }
    const pkg = JSON.parse(readFileSync(path.join(EXPO_STARTER_FIXTURE_DIR, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const pins = reviewedExpoFixturePins();
    assert(pkg.dependencies?.expo?.startsWith(pins.expo), `fixture expo pin must start with reviewed SDK ${pins.expo}`);
    assert(pkg.dependencies?.["react-native"]?.startsWith("0.86"), "fixture React Native pin must match reviewed 0.86");
    const compatibility = evaluateExpoCompatibility({
      expoSdk: pkg.dependencies?.expo,
      reactNative: pkg.dependencies?.["react-native"],
      react: pkg.dependencies?.react,
    });
    assert(compatibility.sdk === "match" && compatibility.reactNative === "match", compatibility.actionable);
    assert(compatibility.autoUpgradeAttempted === false, "fixture pins must not trigger auto-upgrade");
    assert(pkg.dependencies?.["expo-router"] === EXPO_ROUTER_WORKSPACE_PIN, `fixture expo-router pin must be ${EXPO_ROUTER_WORKSPACE_PIN}`);
    const companions = inspectExpoCompanionPins(pkg.dependencies);
    assert(companions.rangeFailures.length === 0, `companion pins must satisfy expo@57.0.17 bundled ranges: ${companions.rangeFailures.join(", ")}`);
    assert(companions.mismatched.length === 0, `companion pins must match the expo@57.0.17 bundled set: ${companions.mismatched.join(", ")}`);
    const bootPins = inspectExpoBootCompanionPins(pkg.dependencies);
    assert(bootPins.mismatched.length === 0, `boot companions must match published pins: ${bootPins.mismatched.join(", ")}`);
    assert(pkg.dependencies?.["expo-dev-client"] === EXPO_BOOT_COMPANION_PINS["expo-dev-client"], "development-client pin must be present");
    assert(pkg.dependencies?.["expo-modules-core"] === undefined, "must not invent an expo-modules-core pin");
    assert(reviewedExpoRouterFact() === "bundled-with-sdk-57", "reviewed Router fact is not a package version");
  });

  harness.check("expo foundation: pinned Expo Router JSX routes are not native UI or runtime proof", () => {
    const layout = isolatedStarterRouterLayout(skillRoot);
    assert(layout.status === "layout-ready", `expected layout-ready, got ${layout.status}`);
    assert(layout.jsxRoutes, "routes must be Expo Router JSX, not data-object re-exports");
    assert(layout.pinStatus === "workspace-pin", `expo-router must be a workspace pin, got ${layout.pinStatus}`);
    assert(layout.expoAdapterPresent, "Expo UI adapter manifest must exist");
    assert(layout.expoAdapterQuality === "implemented", "Expo UI adapter must point at real source symbols, not a placeholder");
    const adapter = inspectExpoUiAdapter(skillRoot);
    assert(adapter.quality === "implemented" && adapter.missingSymbols.length === 0, `adapter missing ${adapter.missingSymbols.join(", ")}`);
    assert(layout.swiftuiAdapterPresent, "SwiftUI remains an implemented adapter");
    assert(SURFACE_STATES.includes("loading") && SURFACE_STATES.includes("error"), "loading and error states are required");
    assert(SURFACE_STATES.includes("empty") && SURFACE_STATES.includes("retry"), "empty and retry states are required");
    assert(deepLinkRecovery.runtimeVerified === false, "deep-link recovery is a contract, not runtime proof");
    assert(NAVIGATION_RUNTIME_VERIFIED === false, "navigation journeys are not Expo Router runtime");
    assert(PERSISTENCE_SEAM_BOUND === true && PERSISTENCE_STORE_KIND === "local-cache", "local-cache persistence seam is selected");
    const cold = reduceNavigation([{ type: "cold-start" }]);
    assert(cold.href === ROUTE_HREFS.home && cold.restoredFrom === "cold", "cold start must land on the home tab");
    const warm = reduceNavigation([{ type: "cold-start" }, { type: "warm-link", href: ROUTE_HREFS.detail("42") }]);
    assert(warm.href === "/detail/42" && warm.restoredFrom === "warm-link", "warm link must open the detail route");
    const modal = reduceNavigation([{ type: "cold-start" }, { type: "tab", href: ROUTE_HREFS.settings }, { type: "open-modal" }]);
    assert(modal.modalPresented && modal.tab === "settings" && modal.href === ROUTE_HREFS.modal, "modal must keep the tab anchor");
    const back = reduceNavigation([{ type: "cold-start" }, { type: "open-modal" }, { type: "back" }]);
    assert(!back.modalPresented && back.href === ROUTE_HREFS.home, "back must dismiss the modal");
    const restored = reduceNavigation([{ type: "cold-start" }, { type: "open-detail", id: "7" }, { type: "offline-restart" }]);
    assert(restored.href === "/detail/7" && restored.restoredFrom === "session", "offline restart must restore the last href");
    const target = harness.makeTempDir("expo-router-layout");
    materializeExpoStarterFixture({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    const ready = planExpoRouterDelivery({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(ready.action === "layout-ready" && ready.pinStatus === "workspace-pin", ready.reason);
    assert(ready.runtimeVerified === false, "layout is not Router runtime proof");
    const webAsIos = planExpoRouterDelivery({
      target,
      skillRoot,
      compositionTarget: { platform: "web", runtime: EXPO_APP_RUNTIME },
      claimedProofPlatform: "ios",
    });
    assert(webAsIos.action === "refuse" && webAsIos.code === "web-is-not-native-router", webAsIos.reason);
    const builder = planExpoRouterDelivery({
      target: skillRoot,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(builder.action === "refuse" && builder.code === "builder-checkout", builder.reason);
    writeFileSync(path.join(target, "app", "(tabs)", "index.tsx"), "export async function defaultExport() { return fetch('https://example.com'); }\n");
    const fat = planExpoRouterDelivery({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(fat.action === "refuse" && fat.code === "fat-routes", fat.reason);
    const fabricated = harness.makeTempDir("expo-router-fabricated");
    materializeExpoStarterFixture({
      target: fabricated,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    const pkgPath = path.join(fabricated, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies: Record<string, string> };
    pkg.dependencies["expo-router"] = "latest";
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    const latest = planExpoRouterDelivery({
      target: fabricated,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(latest.action === "refuse" && latest.code === "fabricated-router-pin", latest.reason);
    const unpinned = harness.makeTempDir("expo-router-unpinned");
    materializeExpoStarterFixture({
      target: unpinned,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    const unpinnedPkgPath = path.join(unpinned, "package.json");
    const unpinnedPkg = JSON.parse(readFileSync(unpinnedPkgPath, "utf8")) as { dependencies: Record<string, string> };
    delete unpinnedPkg.dependencies["expo-router"];
    writeFileSync(unpinnedPkgPath, `${JSON.stringify(unpinnedPkg, null, 2)}\n`);
    const missingPin = planExpoRouterDelivery({
      target: unpinned,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(missingPin.action === "refuse" && missingPin.code === "unpinned-expo-router", missingPin.reason);
  });

  harness.check("expo foundation: custom module has a TypeScript boundary and explicit web-unsupported path", () => {
    const layout = isolatedStarterCustomModule();
    assert(layout.status === "boundary-ready", `expected boundary-ready, got ${layout.status}`);
    assert(layout.iosSourcePresent && layout.androidSourcePresent, "Swift and Kotlin sources must both be present");
    assert(layout.webUnsupported && layout.configOmitsWeb, "web must be omitted and explicitly unsupported");
    assert(layout.metroWebEntry === METRO_WEB_ENTRY, "Metro web must select browser → index.web.ts, not main");
    assert(layout.metroNativeEntry === METRO_NATIVE_ENTRY, "native main must stay src/index.ts");
    assert(layout.metroReactNativeEntry === METRO_NATIVE_ENTRY, "react-native field must stay src/index.ts, not the web file");
    const iosEntry = resolveMetroPackageEntry("ios", {
      main: layout.metroNativeEntry,
      browser: layout.metroWebEntry,
      reactNative: layout.metroReactNativeEntry,
    });
    const webResolved = resolveMetroPackageEntry("web", {
      main: layout.metroNativeEntry,
      browser: layout.metroWebEntry,
      reactNative: layout.metroReactNativeEntry,
    });
    const androidEntry = resolveMetroPackageEntry("android", {
      main: layout.metroNativeEntry,
      browser: layout.metroWebEntry,
      reactNative: layout.metroReactNativeEntry,
    });
    assert(iosEntry?.field === "react-native" && iosEntry.path === METRO_NATIVE_ENTRY, "iOS must resolve react-native → src/index.ts");
    assert(androidEntry?.field === "react-native" && androidEntry.path === METRO_NATIVE_ENTRY, "Android must resolve react-native → src/index.ts");
    assert(webResolved?.field === "browser" && webResolved.path === METRO_WEB_ENTRY, "web must resolve browser → src/index.web.ts");
    assert(layout.requireNativeModulePresent, "native entry must call requireNativeModule");
    assert(layout.lifecyclePresent && layout.eventsPresent, "native sources must declare lifecycle and error events");
    assert(layout.fabricatedModulesCorePin === false, "must not invent expo-modules-core latest");
    assert(layout.nativeCompileStatus === NATIVE_COMPILE_STATUS, "native compile stays not-run");
    assert(layout.autolinkingVerified === false, "autolinking stays unverified");
    const web = invokeNativeCapability("web", true);
    assert(web.ok === false, "web must not fake native parity");
    if (web.ok) return;
    assert(web.reason === "unsupported-on-web", "web must not fake native parity");
    assert(web.error.retryInJavaScript === false, "unsupported web is not a JS retry");
    const webEntry = invokeWebCapability();
    assert(webEntry.ok === false, "the .web entry must stay unsupported");
    if (webEntry.ok) return;
    assert(webEntry.reason === "unsupported-on-web", "the .web entry must stay unsupported");
    const missing = invokeNativeCapability("ios", false);
    assert(missing.ok === false, "an old binary needs a rebuild");
    if (missing.ok) return;
    assert(missing.reason === "rebuild-required", "an old binary needs a rebuild");
    assert(missing.error.retryInJavaScript === false, "missing native module is not a JavaScript retry loop");
    assert(missing.error.message.includes("Rebuild"), "rebuild requirement must be named");
    assert(!missing.error.message.toLowerCase().includes("try again"), "rebuild message must not suggest a JavaScript retry loop");
    const target = harness.makeTempDir("expo-custom-module");
    materializeExpoStarterFixture({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    const unknownBinary = decideExpoCustomModule({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(unknownBinary.action === "refuse" && unknownBinary.code === "executed-binary-unverified", unknownBinary.reason);
    const rebuild = decideExpoCustomModule({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      nativeModulePresentInBinary: false,
    });
    assert(rebuild.action === "rebuild-required", rebuild.reason);
    const webTarget = decideExpoCustomModule({
      target,
      skillRoot,
      compositionTarget: { platform: "web", runtime: EXPO_APP_RUNTIME },
    });
    assert(webTarget.action === "unsupported-on-web", webTarget.reason);
    const iosAsAndroid = decideExpoCustomModule({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      claimedProofPlatform: "android",
    });
    assert(iosAsAndroid.action === "refuse" && iosAsAndroid.code === "ios-does-not-prove-android", iosAsAndroid.reason);
    const webAsIos = decideExpoCustomModule({
      target,
      skillRoot,
      compositionTarget: { platform: "web", runtime: EXPO_APP_RUNTIME },
      claimedProofPlatform: "ios",
    });
    assert(webAsIos.action === "refuse" && webAsIos.code === "web-false-parity", webAsIos.reason);
    const builder = decideExpoCustomModule({
      target: skillRoot,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(builder.action === "refuse" && builder.code === "builder-checkout", builder.reason);
    assert(!existsSync(path.join(target, "ios")), "local module sources must not create an app ios/ tree");
    assert(!existsSync(path.join(target, "android")), "local module sources must not create an app android/ tree");
    const nativeEntry = readFileSync(path.join(EXPO_STARTER_FIXTURE_DIR, "modules/b2c-native-capability/src/index.ts"), "utf8");
    assert(nativeEntry.includes('from "expo"') && nativeEntry.includes("requireNativeModule"), "native entry must use requireNativeModule from expo");
    assert(!nativeEntry.includes("unsupported-on-web"), "native main must not be the web unsupported path");
    const packed = inspectPackagedExpoStarter(skillRoot);
    assert(packed.kind === "pack-file-list", "npm pack --dry-run is a builder file-list check, not a packaged-consumer install");
    assert(packed.packageManager === EXPO_PACKAGE_MANAGER, "one package-manager path is npm");
    assert(packed.lockfileInFixture === false, "must not fabricate a starter lockfile");
    assert(packed.missing.length === 0, `builder npm pack must include the module sources, missing ${packed.missing.join(", ")}`);
    const diverted = harness.makeTempDir("expo-custom-module-rn-field");
    materializeExpoStarterFixture({
      target: diverted,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    const modulePkgPath = path.join(diverted, EXPO_CUSTOM_MODULE_DIR, "package.json");
    const modulePkg = JSON.parse(readFileSync(modulePkgPath, "utf8")) as { main: string; browser: string; "react-native"?: string };
    modulePkg["react-native"] = METRO_WEB_ENTRY;
    writeFileSync(modulePkgPath, `${JSON.stringify(modulePkg, null, 2)}\n`);
    const divertedLayout = inspectExpoCustomModule(diverted);
    assert(divertedLayout.status === "web-false-parity", "pointing react-native at the web entry is false parity");
    assert(divertedLayout.metroReactNativeEntry === METRO_WEB_ENTRY, "inspect must read the diverted react-native field");
    const divertedDecision = decideExpoCustomModule({
      target: diverted,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(divertedDecision.action === "refuse" && divertedDecision.code === "web-false-parity", divertedDecision.reason);
  });

  harness.check("expo foundation: packaged-consumer install ships the Expo module sources", () => {
    const installed = installPackagedExpoConsumer({
      skillRoot,
      packDir: harness.makeTempDir("expo-consumer-pack"),
      consumerDir: harness.makeTempDir("expo-consumer-install"),
    });
    assert(installed.kind === "packaged-consumer-install", "this is an install, not a dry-run file list");
    assert(installed.status === "installed", installed.reason ?? "packaged-consumer install failed");
    assert(installed.expoInstalledGlobally === false, "must not install Expo globally");
    assert(installed.nativeCompileStatus === NATIVE_COMPILE_STATUS, "consumer install is not a native compile");
    assert(installed.lockfileInFixture === false, "the isolated starter still has no lockfile");
    assert(installed.missing.length === 0, `installed builder is missing ${installed.missing.join(", ")}`);
    assert(installed.installedRoot !== undefined && existsSync(installed.installedRoot), "consumer must have node_modules/b2c-app-builder");
    assert(
      !existsSync(path.join(installed.installedRoot!, "catalog/stacks/expo-starter-fixture/package-lock.json")),
      "install must not invent a starter lockfile",
    );
  });

  harness.check("expo foundation: disposable local boot exports web Metro without Expo Go or EAS", () => {
    const target = harness.makeTempDir("expo-starter-boot");
    const booted = runExpoStarterLocalBoot({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    assert(booted.kind === "expo-local-boot", "local boot is a disposable Expo starter run, not a builder tarball");
    assert(booted.status === "booted", booted.reason ?? "Expo local boot failed");
    assert(booted.lockfileGenerated, "local npm install must generate package-lock.json");
    assert(
      booted.webExport.ok && booted.webExport.indexHtmlPresent && booted.webExport.javascriptBundlePresent,
      booted.webExport.reason ?? "web export missing bundle",
    );
    assert(booted.expoGoUsed === false && booted.easUsed === false, "local boot must not use Expo Go or EAS");
    assert(localBootDoesNotUseExpoGo(booted), "Expo Go is not the acceptance path");
    assert(booted.nativeCompileStatus === NATIVE_COMPILE_STATUS, "web export is not a native compile");
    assert(!existsSync(path.join(EXPO_STARTER_FIXTURE_DIR, "package-lock.json")), "the fixture tree still ships no lockfile");
    assert(booted.deviceInstallHold.ios.includes("signing"), "iOS device hold must name signing");
    assert(booted.deviceInstallHold.android.includes("Android SDK"), "Android device hold must name the SDK");
    const lock = JSON.parse(readFileSync(path.join(target, "package-lock.json"), "utf8")) as { packages?: Record<string, { version?: string }> };
    for (const [name, pin] of Object.entries(EXPO_ROUTER_COMPANION_PINS)) {
      const locked = lock.packages?.[`node_modules/${name}`]?.version;
      assert(locked === pin, `lockfile ${name} must be ${pin}, got ${locked}`);
    }
    for (const [name, pin] of Object.entries(EXPO_BOOT_COMPANION_PINS)) {
      const locked = lock.packages?.[`node_modules/${name}`]?.version;
      assert(locked === pin, `lockfile ${name} must be ${pin}, got ${locked}`);
    }
    if (booted.cng.attempted) {
      assert(booted.cng.ok, booted.cng.reason ?? "CNG prebuild failed in the disposable copy");
      assert(booted.cng.autolinkMentioned, "disposable prebuild must resolve b2c-native-capability through Expo autolinking");
    }
    const surface = decideExpoWebSurface({ compositionTarget: { platform: "web", runtime: EXPO_APP_RUNTIME } });
    const bound = bindLocalStaticExport({ surface, webExport: booted.webExport });
    assert(bound.action === "observe-local-static" && bound.exportEvidenceTier === "fixture-tested", bound.reason);
    assert(bound.easHosting === false && bound.nativeProof === false && bound.labeledLive === false, "local static export is not hosting or native proof");
    assert(!shippingSatisfiesRequirement("web", "ios"), "web export still cannot satisfy iOS");
    const journey = runLocalCapabilityJourney(target);
    assert(journey.signedIn.snapshot.session.signedIn && journey.signedIn.snapshot.session.appUserId === "user-a", journey.signedIn.reason);
    assert(journey.signedIn.snapshot.session.entitled === false, "local sign-in must not grant paid access");
    assert(journey.restarted.snapshot.notes.some((note) => note.id === "note-1" && note.owner === "user-a"), "SQLite cache must survive reopen");
    assert(journey.expired.snapshot.session.signedIn === false && journey.expired.snapshot.notes.length === 0, "expiry clears the current user");
    assert(journey.isolated, "account switch must not leak the prior user's notes");
    assert(journey.interrupted.action === "refuse", journey.interrupted.reason);
    assert(journey.denied.action === "accept" && journey.denied.snapshot.permission?.outcome === "denied", journey.denied.reason);
    assert(journey.restored.snapshot.restoreRoute === ROUTE_HREFS.detail("1"), journey.restored.reason);
    assert(journey.labeledLive === false && journey.restarted.snapshot.backendOfRecord === false, "local journey is not live or backend proof");
    const routes = bindStaticExportRoutes({
      exportDir: booted.webExport.outputDir ?? path.join(target, "dist-web"),
      requiredHrefs: [ROUTE_HREFS.home, ROUTE_HREFS.settings, ROUTE_HREFS.signIn, ROUTE_HREFS.modal],
    });
    assert(routes.action === "observe-static-routes", routes.reason);
    assert(routes.easHosting === false && routes.ssr === false && routes.labeledLive === false, "static routes are not hosting or SSR");
  });

  harness.check("expo foundation: empty authorized target scaffolds only the selected platform and preserves product.yaml", () => {
    const target = harness.makeTempDir("expo-scaffold-empty");
    writeFileSync(path.join(target, "product.yaml"), "name: preserved-product\n");
    writeFileSync(path.join(target, "DESIGN.md"), "# preserved design\n");
    const plan = materializeExpoStarterFixture({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    assert(plan.action === "scaffold", `expected scaffold, got ${plan.action}: ${plan.reason}`);
    assert(plan.preserve.includes("product.yaml") && plan.preserve.includes("DESIGN.md"), "builder authority files must be preserved");
    assert(readFileSync(path.join(target, "product.yaml"), "utf8").includes("preserved-product"), "product.yaml must be unchanged");
    assert(readFileSync(path.join(target, "DESIGN.md"), "utf8").includes("preserved design"), "DESIGN.md must be unchanged");
    assert(!existsSync(path.join(target, "AGENTS.md")), "scaffold must not invent AGENTS.md");
    const appJson = JSON.parse(readFileSync(path.join(target, "app.json"), "utf8")) as { expo?: { platforms?: string[] } };
    assert(JSON.stringify(appJson.expo?.platforms) === JSON.stringify(["ios"]), "only the selected platform may be declared");
    assert(existsSync(path.join(target, ".gitignore")), "gitignore.template must be installed as .gitignore");
    const copy = harness.makeTempDir("expo-scaffold-empty-repeat");
    materializeExpoStarterFixture({
      target: copy,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    assert(
      readFileSync(path.join(target, "package.json"), "utf8") === readFileSync(path.join(copy, "package.json"), "utf8"),
      "two empty authorized scaffolds with the same inputs must match",
    );
  });

  harness.check("expo foundation: existing, Next.js, and unauthorized targets refuse overwrite", () => {
    const unauthorized = planExpoStarterScaffold({
      target: harness.makeTempDir("expo-scaffold-unauth"),
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: false,
    });
    assert(unauthorized.action === "refuse" && unauthorized.code === "unauthorized", unauthorized.reason);
    const host = planExpoStarterScaffold({
      target: harness.makeTempDir("expo-scaffold-host"),
      skillRoot,
      compositionTarget: { platform: "host", runtime: HOST_AGENT_RUNTIME },
      platforms: ["ios"],
      authorized: true,
    });
    assert(host.action === "refuse" && host.code === "expo-not-selected", host.reason);
    const tooMany = planExpoStarterScaffold({
      target: harness.makeTempDir("expo-scaffold-platforms"),
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios", "android"],
      authorized: true,
    });
    assert(tooMany.action === "refuse" && tooMany.code === "unselected-platform", tooMany.reason);
    const nextDir = harness.makeTempDir("expo-scaffold-next");
    writeFileSync(path.join(nextDir, "package.json"), `${JSON.stringify({ name: "habit-tracker-starter", dependencies: { next: "16.2.9" } }, null, 2)}\n`);
    const next = planExpoStarterScaffold({
      target: nextDir,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    assert(next.action === "refuse" && next.code === "habit-tracker-is-next", next.reason);
    const existing = harness.makeTempDir("expo-scaffold-existing");
    writeExpoPackage(existing);
    const adopt = planExpoStarterScaffold({
      target: existing,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    assert(adopt.action === "adopt", adopt.reason);
    const builder = planExpoStarterScaffold({
      target: skillRoot,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    assert(builder.action === "refuse" && builder.code === "builder-checkout", builder.reason);
  });

  harness.check("expo foundation: dynamic app config and plugins are not executed during classification or inspect", () => {
    const workspace = harness.makeTempDir("expo-dynamic-config");
    cpSync(trapRoot, workspace, { recursive: true });
    const prove = spawnSync(process.execPath, [path.join(workspace, "app.config.js")], { encoding: "utf8" });
    assert(prove.status === 0, `trap config must be executable to prove the marker path; ${prove.stderr}`);
    assert(existsSync(path.join(workspace, "DYNAMIC_CONFIG_EXECUTED.marker")), "trap must write a marker when executed");
    const workspace2 = harness.makeTempDir("expo-dynamic-config-classify");
    cpSync(trapRoot, workspace2, { recursive: true });
    const home = harness.makeTempDir("expo-dynamic-config-home");
    const inspection = withIsolatedHome(home, () => inspectWorkspace(workspace2));
    assert(inspection.ok, "inspect must succeed without executing config");
    const ownership = inspectExpoNativeOwnership({
      target: workspace2,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(ownership.dynamicConfigPresent.includes("app.config.js"), "classifier must notice dynamic config by filename");
    assert(ownership.pluginsDeclaredNotExecuted, "app.json plugins must be recorded as declared, not executed");
    assert(
      ownership.overall === "unresolved" || ownership.overall === "dirty-unreviewed",
      `ios/ without static ownership must not become generated-cng; got ${ownership.overall}`,
    );
    assert(!existsSync(path.join(workspace2, "DYNAMIC_CONFIG_EXECUTED.marker")), "classifier must not execute app.config.js");
    assert(!existsSync(path.join(workspace2, "PLUGIN_EXECUTED.marker")), "classifier must not load config plugins");
    assert(ownership.nativeCompileStatus === NATIVE_COMPILE_STATUS, "native compile stays not-run");
  });

  harness.check("expo foundation: dirty and maintained native trees refuse regeneration; --no-clean is not a merge", () => {
    const dirty = harness.makeTempDir("expo-native-dirty");
    writeExpoPackage(dirty);
    writeAppJson(dirty, "generated-cng");
    writeNativeFile(dirty, "ios/UserEdit.swift", "user authored\n");
    const dirtyDecision = decideExpoPrebuild({
      target: dirty,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
      executedCli: { observed: true, version: "57.0.17", prebuildDefaultRegenerates: true },
      destructiveRegenerationAuthorized: true,
    });
    assert(dirtyDecision.action === "refuse" && dirtyDecision.code === "dirty-unreviewed", dirtyDecision.reason);
    const maintained = harness.makeTempDir("expo-native-maintained");
    writeExpoPackage(maintained);
    writeAppJson(maintained, "maintained");
    writeNativeFile(maintained, "ios/AppDelegate.swift", "maintained\n");
    const maintainedDecision = decideExpoPrebuild({
      target: maintained,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
    });
    assert(maintainedDecision.action === "refuse" && maintainedDecision.code === "maintained-native", maintainedDecision.reason);
    const noClean = decideExpoPrebuild({
      target: dirty,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
      noClean: true,
    });
    assert(noClean.action === "refuse" && noClean.code === "no-clean-is-not-merge", noClean.reason);
    const web = decideExpoPrebuild({
      target: dirty,
      skillRoot,
      compositionTarget: { platform: "web", runtime: EXPO_APP_RUNTIME },
      platform: "web",
    });
    assert(web.action === "not-applicable", web.reason);
    const builder = decideExpoPrebuild({
      target: skillRoot,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
    });
    assert(builder.action === "refuse" && builder.code === "builder-checkout", builder.reason);
    const androidFromIos = decideExpoPrebuild({
      target: dirty,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "android",
    });
    assert(androidFromIos.action === "refuse" && androidFromIos.code === "expo-not-selected", androidFromIos.reason);
  });

  harness.check("expo foundation: matching CNG fingerprint still needs an observed CLI and explicit regeneration authority", () => {
    const dir = harness.makeTempDir("expo-native-cng");
    writeExpoPackage(dir);
    writeAppJson(dir, "generated-cng");
    writeNativeFile(dir, "ios/AppDelegate.swift", "generated\n");
    const digest = nativeTreeDigest(path.join(dir, "ios"));
    assert(digest.status === "computed" && digest.digest, "expected a native digest");
    writeFileSync(
      path.join(dir, NATIVE_GENERATION_FINGERPRINT_BASENAME),
      `${JSON.stringify(writeNativeGenerationFingerprint({ ios: digest.digest! }), null, 2)}\n`,
    );
    const unverified = decideExpoPrebuild({
      target: dir,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
    });
    assert(unverified.action === "refuse" && unverified.code === "executed-cli-unverified", unverified.reason);
    const unauthorized = decideExpoPrebuild({
      target: dir,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
      executedCli: { observed: true, version: "57.0.17", prebuildDefaultRegenerates: true },
    });
    assert(unauthorized.action === "refuse" && unauthorized.code === "destructive-regeneration-not-authorized", unauthorized.reason);
    const allowed = decideExpoPrebuild({
      target: dir,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
      executedCli: { observed: true, version: "57.0.17", prebuildDefaultRegenerates: true },
      destructiveRegenerationAuthorized: true,
    });
    assert(allowed.action === "allow-regenerate", allowed.reason);
    assert(allowed.execution === NATIVE_COMPILE_STATUS, "permission is not a native compile");
    const absent = harness.makeTempDir("expo-native-absent");
    writeExpoPackage(absent);
    writeAppJson(absent, "generated-cng");
    const generate = decideExpoPrebuild({
      target: absent,
      skillRoot,
      compositionTarget: iosExpo(),
      platform: "ios",
    });
    assert(generate.action === "allow-generate", generate.reason);
    assert(generate.execution === NATIVE_COMPILE_STATUS, "generation permission is not-run");
  });

  harness.check("expo foundation: inspect still treats expo in package.json as a consumer-app marker without executing config", () => {
    const dir = harness.makeTempDir("expo-inspect");
    writeExpoPackage(dir);
    writeFileSync(path.join(dir, "app.config.js"), readFileSync(path.join(trapRoot, "app.config.js")));
    const home = harness.makeTempDir("expo-inspect-home");
    withIsolatedHome(home, () => {
      const result = inspectWorkspace(dir);
      assert(result.ok, "inspect must succeed");
      if (!result.ok) return;
      assert(result.productKind === "consumer-app", "expo dependency is a consumer-app signal");
      assert(
        result.evidence.some((signal) => signal.field === "dependencies" && signal.excerpt.includes("expo")),
        "inspect must quote the expo dependency",
      );
    });
    assert(!existsSync(path.join(dir, "DYNAMIC_CONFIG_EXECUTED.marker")), "inspect must not execute app.config.js");
  });
}
