# Isolated Expo starter fixture

This tree is a disposable TypeScript Expo app skeleton for issue 82. It is not a lockfile, not Expo Go proof, and not accepted product delivery.

- Expo is selectable, not default.
- Builder `AGENTS.md`, `product.yaml`, and `DESIGN.md` are not in this tree and must not be replaced.
- Native `ios/` and `android/` directories are absent so Continuous Native Generation stays a later, classified step.
- `app/` holds a thin stack/tab/modal/detail file layout. Application logic stays in `src/`.
- `expo-router` is not pinned. The reviewed fact is bundled with SDK 57, not a workspace version. Do not invent one.
- No Expo UI adapter manifest. SwiftUI remains the only implemented adapter.
- Loading, error, empty, and retry are state contracts in `src/`, not runtime-verified screens.

Copy this fixture only into an authorized empty workspace outside the builder checkout.
