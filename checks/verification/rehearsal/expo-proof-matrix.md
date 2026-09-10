# Expo proof matrix

Owner: #88. Status: frozen protocol, not shipped proof.
Draft origin: issue #88 comment on 2026-09-08, re-read against current main.

Fixture success is never native, OTA, store, or hosted proof. A row stays
`not-run` or `blocked` until its exact evidence exists.

## Hold

No selected Expo app, physical device, paid EAS job, or matching #72 authority
is available on this checkout. This file cannot close #88.

## Canonical identities (existing contracts)

| Fact | Existing owner |
| --- | --- |
| Operation target | `composition.target` `{platform, runtime}` |
| Declared support vs maturity vs config vs route vs authority vs proof | ARCH-11 / `BindingReadiness` |
| iOS/Android device capture | `contracts/mobile-operation.ts` |
| Product intent | `product.yaml` / rendered `PRODUCT.md` |
| Design adapter stack | `DESIGN.md` + `design/platforms/<stack>.json` |
| Stack/toolchain pins | workspace lockfiles + selected EAS image + host binaries |
| Native runtime / update | Expo runtime policy + binary + update id when #85 is selected |

Do not invent `product.platforms` or a global “Expo supported” boolean.

## Levels

| Level | What it can prove | What it cannot |
| --- | --- | --- |
| Static / type / unit / contract | Synthetic and builder-offline behavior | Native execution, store, or OTA |
| Component / Router integration | In-process UI contracts | Release-like binary without Metro |
| Simulator / emulator E2E | Installed custom-dev or release-like build on that OS | Physical hardware, store, or production crash |
| Physical device | Hardware, permission, background, store-sandbox claims the simulator cannot | Publication or production users |
| Browser against exported web | Production web output | iOS or Android requirements |
| Authorized cloud / provider readback | Named job or account observation | A configured SDK with no arrived events |

## Required rows (status on this checkout)

| Requirement | Platform | Method | Status |
| --- | --- | --- | --- |
| Unit/native mocks cannot satisfy simulator/device/store acceptance | ios / android | native E2E vs jest-expo | not-run |
| Web export cannot satisfy an Android requirement | android vs web | separate rows | not-run |
| Release-like binary starts offline without Metro | ios / android | installed binary | blocked — no device/app |
| Accessibility and platform navigation | selected design | per-platform assertions | not-run |
| Account isolation / selected purchase / permission failure | capable target | #83 cases | blocked — no sandbox authority |
| Source/SDK/build/update/review change invalidates old proof | selected stack | #85 / review freshness | not-run |
| Observe missing data and absent native crash coverage stay visible | selected observability | #86 owners | blocked — no Observe account |
| Upgrade failure preserves native customizations | isolated copy | SDK walkthrough | blocked — no approved upgrade workspace |
| Complete-business closeout distinguishes delivery / submission / live | matching #72 run | [greenfield-benchmark.md](./greenfield-benchmark.md) | blocked — #72 hold |
