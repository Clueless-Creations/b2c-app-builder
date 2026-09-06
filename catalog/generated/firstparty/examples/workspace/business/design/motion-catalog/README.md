# Motion Catalog — Runnable Choreography Exemplars

Full-screen choreography templates that bind the recipes in
[`knowledge/design/motion-craft-benchmarks.md`](../../../../../knowledge/design/motion-craft-benchmarks.md)
to the shipped token scale as compilable code. The 2026-07-28 live output test
showed builders drift whenever a rule exists only as prose; this pack is the
code half of that contract — copy a file, swap the placeholder content, keep
the physics.

## Files

| File                      | Lane      | What it teaches                                                                                                                                                                                                                   |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TokenSpring.swift`       | native    | Closed-form evaluation of the PremiumMotion presets for procedural scenes, plus `TokenEase.emphasis` and the declarative `Animation.emphasized(duration:)` bridge for `easingEmphasis`.                                           |
| `MotionLabTheme.swift`    | native    | The one-page binding layer from `DesignTokens` hex strings to SwiftUI `Color`/`Font` values the demos read. Merge into the app's own theme layer.                                                                                 |
| `MotionLabControls.swift` | native    | The shared controls: `PrimaryCTA` (press physics + the haptics-confirm-decisions rule) and `.cascade(visible:)` (content-arrival fade + rise with the Reduce Motion collapse built in).                                           |
| `MotionLabIndex.swift`    | native    | Index screen routing every exemplar — drop into a debug build so reviewers grade motion from a running surface.                                                                                                                   |
| `DemoCardReveal.swift`    | native    | Declarative mode: a six-beat unboxing (word cascade → materialize → 3D flip → flap unfold → hero card → CTA reflow) where every beat is a `withAnimation(PremiumMotion.*)`. Serves R3, R4, R8, R10.                               |
| `DemoSphereCloud.swift`   | native    | Procedural mode: a 30-card 3D content cloud (burst → orbit → camera dive → hero landing) in `TimelineView` + `Canvas`, every curve evaluated through `TokenSpring`. Serves R2's stagger rule, R3, R5's shared-clock rule, R7, R8. |
| `DemoMascot.swift`        | native    | Mascot mood machine (code-drawn character): emotion states, transform-only idle breathing, squash-and-stretch transitions, joy burst. Catalog mascot family.                                                                      |
| `DemoTreasure.swift`      | native    | Variable-reward pouch: anticipation wiggle, R3 overshoot-and-settle reward landing. Serves `variable-reward-card.md`.                                                                                                             |
| `DemoBloom.swift`         | native    | R2 two-phase celebration bloom: contract → burst → hold → reconverge, then rest.                                                                                                                                                  |
| `DemoScratch.swift`       | native    | R10 scratch-card reveal: torn-foil noise mask, finger-owned clock, top-layer payoff, post-reveal reflow.                                                                                                                          |
| `DemoMeter.swift`         | native    | Counting gauge with an earned pulse only when the value crosses its threshold — celebration fires on crossing, never on being high. Catalog meter family.                                                                         |
| `DemoShiny.swift`         | native    | Holographic tilt card: one shared tilt value drives sheen, parallax, and shadow (R5's shared-scalar rule generalized). Catalog shiny-card family.                                                                                 |
| `DemoScrub.swift`         | native    | R5 scrub-linked theming: one scalar re-themes background, ink, and glow; finger owns the clock while down.                                                                                                                        |
| `DemoGesture.swift`       | native    | Gesture physics: 1:1 tracking, release-velocity handoff into the settle spring, rubber-band overscroll.                                                                                                                           |
| `DemoExtrude.swift`       | native    | R6 data-driven 3D extrusion: heights and camera turn complete together; asymmetric collapse wobble.                                                                                                                               |
| `DemoGrid.swift`          | native    | R1 asynchronous-grid liveness: out-of-phase content swaps, zero reflow, transform/opacity only.                                                                                                                                   |
| `motion-tokens.ts`        | web/video | The same presets as Remotion spring physics for token-true previews, App Store preview loops, and brand reels. `TokenSpring.swift`'s twin — one formula, both platforms.                                                          |

## Picking a mode

- **Declarative runner** (`DemoCardReveal`): one focal object, a fixed beat
  order, each beat a `withAnimation` on a preset. Reach for it first.
- **Procedural scene** (`DemoSphereCloud`): dozens of elements sharing one 3D
  scene, per-element springs, a camera. `TimelineView` + `Canvas` with
  `TokenSpring` keeps the curves identical to the declarative mode.

Both demos take a `Replay` toolbar action and implement their Reduce Motion
branch as a cross-fade to the settled state — keep both behaviors when
adapting.

## Copying into an app repo

1. The pack compiles beside `business/design/system/DesignTokens.swift` and
   `business/design/system/PremiumCraft.swift`; copy those first.
2. Replace the placeholder asset names (`card-foil`, `card-emblem`,
   `cloud-item-1`…`cloud-item-7`, `hero-emblem`) with brand art in the app's
   asset catalog — generate via the Higgsfield routing in
   `knowledge/design/design-visual-system.md`. Adding the app's first asset catalog
   makes the asset compiler require an `AppIcon` set in the same catalog.
3. Replace the demo copy and scene hex colors with the brand's own; the token
   bindings and beat pacing stay.
4. `PremiumCraft.swift` is the canonical preset layer. `TokenSpring.swift` and
   `motion-tokens.ts` restate its bounce values; a bounce change is a
   three-file commit, and `check:motion-contract` fails the build when the
   copies drift from the canon.

## Traps these files already avoid

- A bare ViewBuilder tuple inside `TimelineView` does not guarantee overlay
  layout — wrap the scene in an explicit `ZStack` (`DemoSphereCloud` carries
  the comment).
- Procedural scenes must not hand-build spring constants; evaluate a
  `TokenSpring` preset so `withAnimation` and `Canvas` land on the same curve.
- On the web lane, a CSS `filter` on a `preserve-3d` ancestor flattens its
  subtree and breaks 3D z-ordering; Remotion's bundler also needs
  TypeScript 5.x (`motion-tokens.ts` header has both notes).

Mechanics in these demos are frame-read from the 60fps.design catalog
(`x-com-60fpsdesign-catalog` in the source registry; live MCP access in
`motion-craft-benchmarks.md`). Content, copy, and characters are original —
the catalog's ground rule is patterns, never clones.
