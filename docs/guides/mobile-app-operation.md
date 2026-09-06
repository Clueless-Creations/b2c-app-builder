# Mobile app operation

Mobile app operation lets an agent launch, inspect, interact with, and capture an
app on a declared simulator, emulator, or physical device. It serves product
exploration, functional checks, accessibility and design review, customer-journey
walkthroughs, screenshots, and marketing source footage. No testing vendor owns it,
and it is not limited to testing.

This contract applies ARCH-03, ARCH-04, ARCH-09, and ARCH-11. The provider
implements operations. The recipe defines the purpose and acceptance. Knowledge
supplies selected procedures. Evidence records what happened.

## Select a provider

1. Read the requested platform, target, operations, and required evidence.
2. Honor an explicit supported provider binding. An unsupported selection returns
   a blocker. It never falls back silently.
3. Without an explicit binding, prefer native mobile tools the current agent host
   already exposes when they cover the request. Claude and Codex expose native
   simulator routes where available. Inspect the current tool surface. Do not
   infer availability from the agent's name or install extra tooling by default.
4. Consider MobAI or another provider when native tools lack the required target,
   operation, repeatability, capture format, or execution environment. Choose by
   declared and verified coverage, not by a fixed vendor hierarchy.
5. Record the selected provider, operations, target, limits, and fallback reason.
   Establish physical-device, Android, background, accessibility, and headless
   coverage separately. iOS simulator access proves none of the others.

Operation selection is separate from authority. An available tool does not grant
access, allow spending, or authorize effects inside the app. Use fixture accounts
and safe data under the business's approved scope.

## Operations and acceptance

| Operation          | Shared meaning                                         | Required result                                                               |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Launch             | Start the selected app artifact on the selected target | App/build identity, target identity, launch observation or blocker            |
| Inspect            | Observe the current app state                          | Screenshot, UI tree, logs, or another declared observation with limits        |
| Interact           | Perform a bounded action sequence                      | Actions, observed results, and uncertainty after interruption                 |
| Capture screenshot | Capture actual app pixels for a declared state         | Raw artifact, dimensions, device/OS, locale, app/build and capture provenance |
| Record video       | Record an actual app sequence                          | Raw recording, timing, target/build and sequence provenance                   |

A capture provider does not decide whether a product is good or a journey works.
Functional acceptance evaluates assertions and the relevant backend or provider
readback. Accessibility acceptance requires the relevant assistive-technology
checks. Design acceptance remains an independent review. A provider manifest alone
proves none of these.

Marketing recipes consume raw captures and produce separate finished assets.
Composition, captions, animation, localization, dimensions, and editorial review
belong to that downstream work. Preserve raw captures and provenance. Generated
artwork is not evidence that the app displayed a state or completed a journey.

Composition of captures into store or marketing frames is a separate package
responsibility with its own provenance. The reference package is
`examples/extensions/store-screenshot-compose`. It consumes raw captures and
records its own sources, notices, and outputs.

## Current facade and migration

Discovery and preview declare `b2c/mobile-app-operation`, the host-native and
MobAI providers, and an initial `b2c/mobile-app-capture` recipe. The example uses
iOS and SwiftUI declarations. Public execution remains unavailable. The recipe's
host-native default expresses preferred selection. Preview does not probe the host.

The current native Route Ladder remains the compatibility execution path. Its
headless Android implementation still uses a MobAI-specific worksheet and a strict
native receipt adapter. Those are implementation limits, not universal capability
requirements. Keep their checks until a replacement adapter proves equivalent
evidence. An interactive native run does not satisfy a headless, physical-device,
distribution, or provider proof obligation.

Roadmap unit U26 owns executable operation schemas, per-operation support
discovery, provider selection, normalized receipts, and adapter conformance. It
must prove the same capture workflow through native tools and another provider
without changing the recipe's business-facing contract. Saved v1 inputs remain
supported. No parallel device planner, scheduler, or evidence store is added.
