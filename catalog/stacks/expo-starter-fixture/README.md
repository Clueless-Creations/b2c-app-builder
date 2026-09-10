# Isolated Expo starter fixture

This tree is a disposable TypeScript Expo app for a selected `runtime: expo` business. Expo is selectable, not default. It is not Expo Go proof and not accepted product delivery.

- Builder `AGENTS.md`, `product.yaml`, and `DESIGN.md` are not in this tree and must not be replaced.
- Native `ios/` and `android/` directories are absent until classified Continuous Native Generation runs in a disposable copy.
- `app/` holds thin Expo Router JSX (`Stack` / `Tabs` / `Link`). Screens and UI live in `src/`.
- Workspace pins match published `expo@57.0.17` `bundledNativeModules.json` for Router companions, plus `expo-dev-client@57.0.16` so local native work uses a development client instead of Expo Go.
- React Native adapter source is in `src/ui/`. The builder manifest is `surfaces/ui-library/adapters/expo.json`.
- A disposable consumer may generate `package-lock.json` with local `npm install` and prove Metro with `expo export --platform web`. That lockfile is not shipped in this fixture tree.
- `modules/b2c-native-capability` is a TypeScript/Swift/Kotlin boundary. Web stays explicitly unsupported. Native compile stays not-run until a development client is built on a host with Xcode or Android SDK.

Copy this fixture only into an authorized empty workspace outside the builder checkout.
