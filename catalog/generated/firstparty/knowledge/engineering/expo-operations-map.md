# Expo Operations Map

Use this when building iOS and Android with Expo, adopting an existing Expo app without EAS, adding a native module, or shipping Expo web only.

This map routes selected Expo work to truthful declarations and explicit gaps. It does not install Expo, EAS, or skill packs. Child issues own implementation. Support is per operation, platform, SDK, environment, and evidence tier: researched, implemented, fixture-tested, runtime-verified, externally-verified, or blocked.

## Contents

- 1. Honest Support
- 2. Building iOS And Android With Expo
- 3. Adopt An Existing Expo App Without EAS
- 4. Add A Native Module
- 5. Expo Web Only
- 6. Builds, Updates, Hosting
- 7. Skills, MCP, And Proof
- 8. RevenueCat Boundary
- 9. Recovery

## 1. Honest Support

`catalog/stacks/expo-selection.ts` is the inventory. First-party monetization and mobile-app-operation declarations still target `ios` / `swiftui`. Do not append `expo` to those operations until their implementations exist. A missing target is `binding.target_mismatch`, not a silent alias.

#81 fixture-tests selection, knowledge routing, and passive detection. #82 fixture-tests the isolated starter, React Native adapter source, disposable Metro web export, classified CNG generate, and a bound local-cache persistence seam that stores starter notes. #83 fixture-tests local session, SQLite cache reopen, starter-note reopen, duplicate and migration-failure writes, permission safe-states, and notification route restore in a disposable directory. Native purchases stay blocked. #86 fixture-tests local static export, required static HTML routes including `/detail/1`, and classified direct-entry, refresh, back, and unknown/not-found. Device install, EAS Hosting, OTA, and store submit stay separate.

## 2. Building iOS And Android With Expo

A greenfield Expo app needs an explicit composition target per platform, a reviewed lockfile generated in the app workspace, and a development client. The isolated starter under `catalog/stacks/expo-starter-fixture/` copies into an authorized empty target. Local proof is `npm install` plus `expo export --platform web` in a disposable copy. That is not iOS or Android device proof.

Do not require every EAS service. Direct local compile is allowed where the host toolchain actually supports it. iOS local compilation on a Linux-only host is blocked, not “supported via docs.” Physical-device install remains a signing hold.

## 3. Adopt An Existing Expo App Without EAS

Adoption is resume-or-refuse, not re-scaffold. Keep builder `AGENTS.md`, `product.yaml`, and `DESIGN.md`. Do not run `eas init`, login, or credential sync during inspection. Unselected EAS must not hold the business.

Brownfield and monorepo routes are optional and explicit. There is no automatic eject.

## 4. Add A Native Module

Custom native functionality is not automatically a reason to abandon Expo. #82 must provide a Swift/Kotlin module with a TypeScript boundary and a web alternative or explicit unsupported UI.

A missing native module in an old binary is a rebuild requirement, not a JavaScript retry loop. Native SDK additions are not eligible for EAS Update until a compatible binary exists (#85).

## 5. Expo Web Only

`{ platform: web, runtime: expo }` selects a browser surface. It cannot satisfy iOS or Android requirements. Local static Metro export (`expo export --platform web`) is fixture-tested in a disposable copy. Direct-entry, refresh, deep `/detail/1`, back, and unknown/not-found are classified from observed HTML. That is not a live browser, not EAS Hosting, not SSR, and not a production host. Server rendering is labeled alpha in current Expo Router docs: do not enable it silently. API routes need a real server for production clients. Static hosting cannot execute them.

Existing Next.js or Astro marketing sites stay put unless the accepted design says otherwise. #86 owns web/hosting semantics. #84 owns the shared process executor.

## 6. Builds, Updates, Hosting

| Selection | Owner | Default |
| --- | --- | --- |
| Expo CLI local checks | #84 | Unselected until chosen |
| Direct local compile | #84 | Host-dependent |
| EAS local build | #84 | Not fully offline |
| EAS cloud build | #84 | Paid/remote |
| EAS Workflows | #84 | Must not auto-submit |
| EAS Submit / store handoff | #84 + existing store owners | Founder-gated |
| EAS Update | #85 | Optional |
| EAS Hosting | #86 | Optional |

Workflow jobs that deploy a server, publish an OTA, or submit to a store are extra effects. Gate the aggregate, not only the top-level command.

## 7. Skills, MCP, And Proof

Official Expo skills: https://github.com/expo/skills — optional, reviewed, selected-session only. Expo MCP: https://docs.expo.dev/mcp/ — optional provider route. #87 reuses existing mobile-operation routing. Do not install a competing agent framework.

Quality, Maestro/EAS Workflows E2E, Observe, and upgrade proof: #88. The frozen proof matrix is the issue comment on #88. Unit mocks cannot satisfy simulator, device, or store rows.

## 8. RevenueCat Boundary

#79 owns RevenueCat CLI catalog management. #83 owns in-app `react-native-purchases` on a custom development/release build. A CLI test transaction is not native purchase or restore.

Unselected RevenueCat does not alter Expo bindings.

## 9. Recovery

If a remote job times out after acceptance, inspect remote identity before retry. Do not duplicate a paid build, submit, or publish. Dirty explicit native trees are not regenerated to make a fixture pass. Stale knowledge section hashes must fail closed.

## Sources

- https://docs.expo.dev/eas/
- https://docs.expo.dev/mcp/
- https://github.com/expo/skills
