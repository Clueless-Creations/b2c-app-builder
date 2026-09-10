# Expo Stack Selection

Use this when selecting Expo as the app stack rather than SwiftUI or Flutter, including iOS Android or web shipping.

Expo is a selectable application framework. It is not the default for every business. Do not migrate After Credits, a SwiftUI app, a Flutter app, or an existing Expo app automatically. An `expo` dependency in `package.json` is a detection signal, not consent to replace the app, select EAS, or claim native proof.

The machine-readable contract is `catalog/stacks/expo-selection.ts`. Consume it. Do not invent `product.platforms` or a global “Expo supported” boolean.

## Contents

- 1. Composition Target
- 2. Detection Is Not Selection
- 3. Separate Selections
- 4. Host Agent Is Not An App
- 5. Web Cannot Satisfy Native
- 6. Product And Design Owners
- 7. Unselected Services Stay Idle

## 1. Composition Target

Bind app operations with the existing composition target:

- `{ platform: ios, runtime: expo }`
- `{ platform: android, runtime: expo }`
- `{ platform: web, runtime: expo }`

`runtime: expo` is the app-stack slug. It is not an alias for `swiftui` or `flutter`. A selected Expo target must resolve to Expo guidance and Expo gaps, not the SwiftUI execution contract.

The complete-consumer-business worker remains `{ platform: host, runtime: agent-cli }`. That host target does not select Expo.

## 2. Detection Is Not Selection

The workspace inspector may see `expo` in `package.json` dependencies. That path is read-only. It does not evaluate `app.config.ts`, config plugins, package scripts, login, or network probes.

Detected-not-selected means: record the signal, keep the current stack, and ask before any Expo scaffold, EAS project, or native regeneration.

## 3. Separate Selections

Treat these as different selections. Selecting one does not select the others:

- Expo application framework (SDK, Router, modules)
- App shipping platform (iOS, Android, web)
- Developer host OS and native toolchain
- Expo CLI
- EAS CLI
- Each EAS service: Build, Submit, Update, Hosting, Workflows, Observe
- Expo MCP
- Analytics, authentication, and billing providers

Direct local work must remain possible when the host actually supports it. EAS is not required for every Expo app.

## 4. Host Agent Is Not An App

A native app target is not inferred from the host-agent runtime. Builder operations on `host` / `agent-cli` do not prove iOS, Android, or web.

## 5. Web Cannot Satisfy Native

A web export cannot satisfy an iOS or Android requirement. Shared TypeScript is not platform parity. Native module, permission, billing, layout, and accessibility behavior need the claimed platform's evidence.

## 6. Product And Design Owners

`product.yaml` and `DESIGN.md` stay authoritative for product and design. The world ontology excludes UI-stack implementation types. If multi-platform shipping later needs a product-world slot, that is an architecture-steward decision. This package does not add `product.platforms`.

Record the chosen stack in `engineering/TECH_SPEC.md`. Native adapter proof lives in `surfaces/ui-library/adapters/expo.json` for the reference starter, and in `design/platforms/expo.json` for a selected business. SwiftUI remains a separate adapter. An Expo adapter is not SwiftUI parity.

## 7. Unselected Services Stay Idle

Unselected Expo, EAS, Expo MCP, or RevenueCat must not change bindings or hold an unrelated business. Available-but-unselected is not an obligation.

Official `expo/skills` and Expo MCP are optional for a selected Expo session after founder approval. They are not a default install during intake. Discover mapped skill names before asking to install. #87 owns that integration.

## Sources

- https://docs.expo.dev/
- https://docs.expo.dev/workflow/overview/
