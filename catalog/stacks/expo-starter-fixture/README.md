# Isolated Expo starter fixture

This tree is a disposable TypeScript Expo app skeleton for issue 82. It is not a lockfile, not Expo Go proof, and not accepted product delivery.

- Expo is selectable, not default.
- Builder `AGENTS.md`, `product.yaml`, and `DESIGN.md` are not in this tree and must not be replaced.
- Native `ios/` and `android/` directories are absent so Continuous Native Generation stays a later, classified step.
- `app/` holds Expo Router JSX (`Stack` / `Tabs` / `Link`). Application screens stay in `src/`.
- Fixture `expo-router` is `57.0.9`, the SDK 57 bundled package. The reviewed #81 fact remains `bundled-with-sdk-57`. Do not take `/latest/` docs as the pin. Navigation graph journeys are fixture-tested; Expo Router runtime was not executed.
- No Expo UI adapter manifest. SwiftUI remains the only implemented adapter.
- Loading, error, empty, and retry are state contracts in `src/`, not runtime-verified screens.
- Fixture `react` is `19.2.3` so `react-native@0.86.3`'s published peer (`^19.2.3`) can install with default npm. The reviewed React fact remains `19.2`, not a new #81 pin.
- `modules/b2c-native-capability` is a TypeScript/Swift/Kotlin boundary. Native `main` calls `requireNativeModule`. Web is `browser` → `src/index.web.ts`. Autolinking and native compile are not-run. A local `NOTICE` ships with the module; that is not a compiled native proof.

Copy this fixture only into an authorized empty workspace outside the builder checkout. A disposable Expo-starter consumer may generate `package-lock.json` with local `npm install`. That lockfile is not shipped in this fixture tree.
