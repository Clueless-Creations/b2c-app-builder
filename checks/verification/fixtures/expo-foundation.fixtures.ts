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
  EXPO_CUSTOM_MODULE_FILES,
  decideExpoCustomModule,
  isolatedStarterCustomModule,
} from "../../../catalog/stacks/expo-custom-module.js";
import {
  EXPO_ROUTER_ROUTE_FILES,
  EXPO_ROUTER_SRC_FILES,
  isolatedStarterRouterLayout,
  planExpoRouterDelivery,
  reviewedExpoRouterFact,
} from "../../../catalog/stacks/expo-router-contract.js";
import {
  invokeNativeCapability,
} from "../../../catalog/stacks/expo-starter-fixture/modules/b2c-native-capability/src/invoke.js";
import { invokeNativeCapability as invokeWebCapability } from "../../../catalog/stacks/expo-starter-fixture/modules/b2c-native-capability/src/B2cNativeCapability.web.js";
import {
  BUILDER_AUTHORITY_FILES,
  EXPO_STARTER_FIXTURE_DIR,
  habitTrackerStarterIsNextNotExpo,
  isolatedExpoStarterPaths,
  materializeExpoStarterFixture,
  planExpoStarterScaffold,
  reviewedExpoFixturePins,
} from "../../../catalog/stacks/expo-starter.js";
import { SURFACE_STATES } from "../../../catalog/stacks/expo-starter-fixture/src/states/surface-state.js";
import { PERSISTENCE_SEAM_BOUND } from "../../../catalog/stacks/expo-starter-fixture/src/persistence/seam.js";
import { deepLinkRecovery } from "../../../catalog/stacks/expo-starter-fixture/src/navigation/deep-link.js";
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
    assert(operationFor(selected, "cng-prebuild").evidenceTier === "blocked", "CNG prebuild stays blocked until an executed CLI is fixture-tested");
    assert(operationFor(selected, "official-skills").evidenceTier === "blocked", "official Expo skills stay blocked until #87 fixture-tests them");
    assert(operationFor(selected, "router-native-ui").evidenceTier === "blocked", "Router/native UI stays blocked without an expo-router pin and native adapter");
    assert(operationFor(selected, "custom-native-module").evidenceTier === "blocked", "custom native module stays blocked until autolink and rebuild are proven");
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
    assert(pkg.dependencies?.["expo-router"] === undefined, "must not invent an expo-router workspace pin");
    assert(pkg.dependencies?.["expo-modules-core"] === undefined, "must not invent an expo-modules-core pin");
    assert(reviewedExpoRouterFact() === "bundled-with-sdk-57", "reviewed Router fact is not a package version");
  });

  harness.check("expo foundation: thin Router file layout stays unpinned and is not native UI", () => {
    const layout = isolatedStarterRouterLayout(skillRoot);
    assert(layout.status === "layout-ready", `expected layout-ready, got ${layout.status}`);
    assert(layout.pinStatus === "unpinned", `expo-router must stay unpinned, got ${layout.pinStatus}`);
    assert(layout.expoAdapterPresent === false, "must not add a placeholder Expo UI adapter");
    assert(layout.swiftuiAdapterPresent, "SwiftUI remains the implemented adapter");
    assert(SURFACE_STATES.includes("loading") && SURFACE_STATES.includes("error"), "loading and error states are required");
    assert(SURFACE_STATES.includes("empty") && SURFACE_STATES.includes("retry"), "empty and retry states are required");
    assert(deepLinkRecovery.runtimeVerified === false, "deep-link recovery is a contract, not runtime proof");
    assert(PERSISTENCE_SEAM_BOUND === false, "persistence seam must stay unbound until a store is selected");
    const target = harness.makeTempDir("expo-router-layout");
    materializeExpoStarterFixture({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
      platforms: ["ios"],
      authorized: true,
    });
    const unpinned = planExpoRouterDelivery({
      target,
      skillRoot,
      compositionTarget: iosExpo(),
    });
    assert(unpinned.action === "refuse" && unpinned.code === "unpinned-expo-router", unpinned.reason);
    assert(unpinned.runtimeVerified === false, "layout is not Router runtime proof");
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
    writeFileSync(path.join(target, "app", "(tabs)", "index.ts"), "export async function defaultExport() { return fetch('https://example.com'); }\n");
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
  });

  harness.check("expo foundation: custom module has a TypeScript boundary and explicit web-unsupported path", () => {
    const layout = isolatedStarterCustomModule();
    assert(layout.status === "boundary-ready", `expected boundary-ready, got ${layout.status}`);
    assert(layout.iosSourcePresent && layout.androidSourcePresent, "Swift and Kotlin sources must both be present");
    assert(layout.webUnsupported && layout.configOmitsWeb, "web must be omitted and explicitly unsupported");
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
