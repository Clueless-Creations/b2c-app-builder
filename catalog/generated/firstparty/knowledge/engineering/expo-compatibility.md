# Expo Compatibility And CNG

Use this when checking Expo SDK, React Native, Router, CLI, or CNG compatibility, or upgrading without losing native customizations.

Keep five version facts apart: observed latest, reviewed baseline, supported range, workspace pin, and the version actually executed. A `/latest/` page or a branch-head README is not proof of compatibility with an installed binary. The builder package pin is not the Expo SDK pin and is not an EAS build image.

The mapping lives in `catalog/stacks/expo-selection.ts`. Missing or mismatched SDK and module versions are an incompatibility. Do not run an automatic upgrade.

## Contents

- 1. Reviewed Baseline (Candidate)
- 2. Distinct Pins
- 3. Missing Or Mismatched Versions
- 4. CNG And Native Ownership
- 5. Upgrade Without Losing Native Customizations
- 6. Expo Go Is Not Production Proof

## 1. Reviewed Baseline (Candidate)

Researched from the SDK 57 changelog, not from an executed Expo CLI on this host:

- Expo SDK 57. The changelog cites `expo@57.0.17` with React Native 0.86.3 for known Hermes regressions.
- React 19.2 (unchanged from SDK 56 according to that changelog).
- Expo Router is bundled with the selected SDK. Record the exact workspace package pin; do not copy an unrelated SDK page.
- Android compile/target SDK 36 and minSdk 24 appear in published SDK 57 compatibility notes. That is not a host observation.
- Xcode and EAS CLI versions stay unknown until the selected executable is read.

This baseline is a review candidate for a selected Expo app. It is not an approved workspace pin and not permission to upgrade an existing business.

## 2. Distinct Pins

Record separately:

- Expo SDK / `expo` package
- React Native
- React
- Expo Router and selected modules
- Expo CLI (from the selected `expo` package, not a global install by default)
- EAS CLI (only if EAS is selected)
- Node and package manager of the **app** workspace
- Native toolchains and OS floors
- EAS cloud image
- This builder package (`b2c-app-builder`)

Do not collapse them.

## 3. Missing Or Mismatched Versions

If the workspace pin is missing, compatibility is unknown. If the major does not match the reviewed baseline, compatibility is a mismatch. For React Native 0.x, compare `0.minor` (`0.86` versus `0.85` is a mismatch). Expo SDK and React 19.x compare on the leading major. Either way: stop, report the pins, and wait for an explicit upgrade plan. Do not execute `npx expo install expo@latest --fix` as a silent repair.

Module versions that do not match the selected SDK are the same class of incompatibility. Inspect output is a diagnostic, not authority to change the lockfile. `b2c doctor` is a supported equivalent.

## 4. CNG And Native Ownership

Continuous Native Generation generates `ios/` and `android/` from declared configuration. Custom native work can stay on Expo through config plugins and local modules.

The SDK 57 changelog changes the default: `expo prebuild` clears and regenerates native directories unless `--no-clean` is passed. Verify the executed CLI before any regeneration. `--no-clean` is not a guarantee that arbitrary manual edits merge safely.

Do not run dynamic `app.config.ts` or config plugins during passive discovery. Those execute code.

## 5. Upgrade Without Losing Native Customizations

An upgrade that touches native directories needs an isolated copy, frozen before/after locks, and a plan for authored native changes. Broad deletion of `ios/` and `android/` is not upgrade proof. Changing `package.json` without a rebuild is not upgrade proof.

#82 owns the safe CNG path: classify ownership, generate only in a disposable copy, and refuse dirty or maintained trees. Native compile stays host-gated. #88 owns upgrade proof against the frozen per-platform matrix.

## 6. Expo Go Is Not Production Proof

Production work uses development builds, not Expo Go as acceptance evidence. Expo Go tracks one SDK at a time and may lag store approval. A Go screenshot cannot close native, purchase, or release rows.

## Sources

- https://expo.dev/changelog/sdk-57
- https://docs.expo.dev/workflow/continuous-native-generation/
