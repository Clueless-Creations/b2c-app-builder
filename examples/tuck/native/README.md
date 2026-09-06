# Tuck for iPhone

Tuck is a complete local packing planner. Create and edit trips, tailor their packing lists, pack by tap or native drag-and-drop, switch to an accessible grouped list, undo changes, duplicate trips, share a packing list, and export or import versioned backups. It requires no account or network service.

The native app reads the same original object paths and Fraunces font as the landing page from `../shared/`. System text handles functional labels and Dynamic Type. Accessibility text sizes use the list presentation automatically. The bag drop target is an optional interaction; every item also provides a packing button and a separate edit action.

`TripStore` writes before publishing a change. Failed writes retain the prior screen state and input. Valid previous saves become automatic backups. Corrupt data is recovered from the backup where possible; otherwise editing stops while exported-backup import and recovery remain available. Before repairing damaged files, Tuck retains their exact bytes and companion backup under `Recovery/`; later edits do not rotate those copies. Import validates version, size, identities, quantities, and trip names before replacing the collection after confirmation. Restore returns the previous saved collection without merging. Deleting all trips also removes the automatic backup and recovery copies, after confirmation.

Generate the project:

```sh
xcodegen generate --spec project.yml
```

The integration owner should use an isolated simulator. Supply its exact UDID; do not target a user's existing simulator by name:

```sh
xcodebuild -project Tuck.xcodeproj -scheme Tuck \
  -configuration Debug -destination "platform=iOS Simulator,id=$TUCK_SIMULATOR_UDID" \
  -derivedDataPath /tmp/tuck-native-derived CODE_SIGNING_ALLOWED=NO build

xcodebuild -project Tuck.xcodeproj -scheme Tuck \
  -configuration Debug -destination "platform=iOS Simulator,id=$TUCK_SIMULATOR_UDID" \
  -derivedDataPath /tmp/tuck-native-derived \
  -resultBundlePath /tmp/tuck-native-tests.xcresult CODE_SIGNING_ALLOWED=NO test
```

Use `-only-testing:TuckTests` for model and persistence checks or `-only-testing:TuckUITests` for actual UI journeys. The UI suite retains screenshots in the result bundle. Native simulator results do not prove physical-device haptics, store acceptance, or production release.

UI tests launch with `--uitesting --reset`, which uses and clears a separate app-container directory. A relaunch with only `--uitesting` preserves that directory. Adding `--save-failure` with `--uitesting` injects a write failure to exercise the actual failure path. These flags never alter the ordinary app's data directory.

Debug UI journeys also support `--large-text`, `--dynamic-type=<size>`, and `--reduce-motion` with `--uitesting`. These explicitly set SwiftUI's Dynamic Type environment and an app-owned reduced-motion test value; they do not change device settings or simulate a screen reader. Every motion treatment uses the real system reduced-motion value OR the test value, so the test configuration cannot disable a system preference. Their captures support layout and behavior checks. Physical-device VoiceOver operation and announcements still require a real device.

`testPackingAccessibilityAudit` runs XCTest's complete native audit in grid, empty-filter, and list states. Xcode 26.5 incorrectly reports the list item name and quantity `Text` nodes as partially unsupported even though their semantic fonts resize. The handler accepts only `.dynamicType` findings on the two exact component identifier prefixes. `testPackingListScalesAcrossEveryDynamicTypeSize` independently launches all 12 SwiftUI sizes, proves monotonic and material frame growth, keeps the controls operable, and attaches the measured receipt plus extreme-size captures. Every other audit category and element remains unsuppressed.

The app icon is a rasterization of the shared original bag paths, not an app screenshot. To regenerate it on macOS before generating the project:

```sh
swift tooling/render-icon.swift
```
