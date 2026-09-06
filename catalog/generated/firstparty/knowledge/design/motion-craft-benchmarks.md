# Motion Craft Benchmarks: The In-App Swipe-File

Numeric motion recipes for in-app surfaces, distilled from the 60fps.design catalog (`https://60fps.design/` — the X account @60fpsdesign, ~1,800 curated screen recordings of interaction details from best-in-class consumer apps). This is the in-app counterpart to `landing-motion-craft.md`'s motionsites.ai benchmark: an inspiration benchmark, never a command-syntax source. Load it when a surface needs stronger motion direction than the craft doctrine's details give — celebration choreography, earned-object reveals, hero transitions, gesture physics, brand liveness — after [`premium-mobile-craft.md`](./premium-mobile-craft.md) (doctrine, spring canon, frame budget) and alongside the experience card the moment serves.

Two ground rules before any recipe is applied:

- **Recipes are acceptance criteria, not adjectives.** Each states numbers a reviewer can check on a screen recording. "Feels springy" does not gate; "rotation overshoots past level and visibly reverses at least once" does.
- **Patterns, not clones.** The catalog showcases other apps' branded work. Take the mechanics — timing, damping, choreography structure — and never reproduce a featured app's branded asset, mascot, or visual identity.

Engagement figures below (`eng = likes + 2×bookmarks`, bookmarks weighted as the "saved as reference" signal) are point-in-time platform metrics from the 2026-07-26 catalog mine. They rank patterns within the catalog; they are not evidence for external claims and must never appear in founder or marketing copy.

## How Recipes Bind To The Token Scale

Every recipe rides the shipped motion scale — no ad-hoc millisecond values. Two vocabularies name that spine today: the tokens.json members and the SwiftUI presets. A third — the card aliases `brief`/`moderate`/`expressive` — was retired from every shipped reference on 2026-07-27; the alias column below stays only as a translation table for repos generated before that date:

| tokens.json (`motion.*`) | Value  | SwiftUI preset (`PremiumCraft.swift`)                                                  | Retired card alias    | Governs                                                       |
| ------------------------ | ------ | -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| `durationFast`           | 120ms  | `PremiumMotion.press` (bounce 0.18)                                                    | `brief`               | press feedback, micro-ticks                                   |
| `durationBase`           | 220ms  | `PremiumMotion.standard` (bounce 0.12)                                                 | `moderate`            | state changes, content arrival                                |
| `durationSlow`           | 360ms  | `PremiumMotion.emphasized` (bounce 0.10)                                               | —                     | deliberate transitions                                        |
| `durationCelebrate`      | 500ms  | `PremiumMotion.celebrate` (bounce 0.3), `PremiumMotion.celebrateLanding` (bounce 0.45) | —                     | celebrate-family springs: soft-settle reveals and R3 landings |
| `durationReveal`         | 600ms  | — (bounds celebrate choreography)                                                      | `expressive` (~500ms) | celebrations, earned-object landings                          |
| `durationCinematic`      | 1200ms | — (web/brand lane only)                                                                | —                     | brand liveness, baked loops                                   |
| `stagger`                | 60ms   | —                                                                                      | —                     | per-item cascade step                                         |

One reconciliation note (the full card bodies now live in the MCP): the retired `expressive` alias was overloaded — `experience-cards/peak-end-card.md` and `experience-cards/variable-reward-card.md` used it as the celebrate spring _response_ (0.45–0.5s), `experience-cards/streak-and-loss-aversion-card.md` as a ~500ms choreography _duration_. Both readings survive without the alias: the spring response stays 0.45–0.5s, and `durationReveal` (600ms) bounds the full choreography — two different quantities, not a contradiction.

The two spring families — press (response 0.3–0.4 / damping 0.7–0.8) and celebrate (response 0.45–0.5 / damping 0.5–0.7) — are defined once, in `premium-mobile-craft.md` §1; recipes cite the family, not fresh numbers. The family ships in the preset layer: `motion.durationCelebrate` (500ms) carries `PremiumMotion.celebrate` (bounce 0.3, the soft-settle end) and `PremiumMotion.celebrateLanding` (bounce 0.45, the visible-oscillation end R3 rides). App code reads the presets — a hand-typed spring literal in view code is drift. Builders hand-type spring numbers when no preset exists. The cards' `.spring(response:dampingFraction:)` literals remain the spec notation those presets implement.

## The Recipes

### R1 — Asynchronous-grid liveness

**Serves:** brand reels, landing heroes, App Store preview loops, ambient non-scrolling in-app dashboards. No experience card owns this pattern — it belongs to the brand-motion family, whose full lane is deliberately deferred; web surfaces route via `landing-motion-craft.md`. **Rides:** `motion.durationCinematic` per swap on web/brand surfaces; in-app ambient variants pace swaps at 1–2× `motion.durationReveal` instead (the same 0.6–1.2s band — the cinematic token stays web/brand-lane); phase offsets in multiples of `motion.stagger`.

A composition feels alive when its regions run on independent clocks inside one fixed grid: each cell swaps its fill or content every 0.6–1.2s, deliberately out of phase, while layout never moves.

- [ ] The grid never reflows: cell positions and sizes are constant; only content inside cells animates.
- [ ] No two adjacent cells swap within ~200ms of each other — phase offsets are deliberate, not accidental simultaneity.
- [ ] Each swap animates transform/opacity only; the loop produces zero layout passes per frame.

**Exemplars:** SarvamAI breathing-shapes identity (eng 4,375 — the catalog's top post); Nuvion 8-panel rebrand reel (eng 1,568).

### R2 — Two-phase celebration bloom

**Serves:** `experience-cards/peak-end-card.md` (engineered peak), `experience-cards/variable-reward-card.md` (reveal), system-reveal moments. **Rides:** celebrate-family spring for contraction and reconvergence; each phase bounded by `motion.durationReveal`; hold 1–1.5s.

The hero contracts slightly (3–5% scale), spawns 15–20 miniature variant clones (varied hue or silhouette) scattering outward, holds, then reconverges to one settled shape. The clones' hue variation is R8's documented composition-level exemption — see R8's scope notes for its boundary.

- [ ] Two phases, then rest: contract → burst → hold 1–1.5s → reconverge. Never an endless particle loop.
- [ ] 15–20 clones with visible variation; per-clone stagger ≤15ms so the burst reads as one event, not a sequence (the 60ms `motion.stagger` step is for content cascades, not particle bursts).
- [ ] Fires only on a genuinely earned moment per the experience card's bright line — never on app open or idle.
- [ ] Reduce Motion: a static celebratory frame plus the success haptic; no clone scatter.

**Exemplars:** SarvamAI breathing-shapes bloom (eng 4,375).

### R3 — Overshoot-and-settle object landing

**Serves:** `experience-cards/mastery-and-status-card.md` (badge/level reveal), `experience-cards/variable-reward-card.md`, collectible and earned-object reveals. **Rides:** celebrate-family spring at damping 0.5–0.6 (the visible-oscillation end — ships as `PremiumMotion.celebrateLanding`); the reveal completes within `motion.durationReveal`.

A decelerating tween reads as "panel animating in"; an oscillating overshoot reads as "physical object landing." That distinction is the whole recipe.

- [ ] The object enters as a blurred small silhouette (20–30% of final scale) and grows to a 3D-tilted hero over 400–600ms.
- [ ] Motion blur only during the fast phase (R7); the landing is tack-sharp.
- [ ] Rotation overshoots past level and visibly reverses at least once (1–2 oscillations).
- [ ] 100% of surrounding chrome is static during the landing — the full motion budget concentrates on one focal object.
- [ ] Reduce Motion: cross-fade to the settled object; no scale/rotation choreography.

**Exemplars:** mymind collectible achievement cards (eng 1,540); Opal gem unlock.

### R4 — Pinch-open perspective accordion

**Serves:** onboarding hero reveals, carousel/wheel introductions; craft detail 2 (motion answers a question the user just asked). **Rides:** `motion.durationBase`–`durationSlow` with `motion.easingEmphasis` (ease-out, no overshoot); cascade steps of 150–200ms (2–3× the `motion.stagger` step).

- [ ] The hero expands from near-zero width at a single vanishing point via scale+translate over 250–400ms, ease-out, no overshoot.
- [ ] Surrounding text cascades top-to-bottom (headline → body → CTA) at 150–200ms intervals after the hero lands.
- [ ] Nothing else on screen animates during the reveal.

**Exemplars:** Melius wheel reveal; Reactiive carousel work (engagement not separately recorded for these posts in the mine).

### R5 — Scrub-linked theming

**Serves:** time/level/progress scrubbers whose position re-themes the surface; the gesture-physics rules below. **Rides:** no duration token while scrubbing — the finger is the clock; the release settle uses `PremiumMotion.standard`.

- [ ] Every themed property — background gradient, ink color, icon tint, glow blur — derives from one shared 0–1 scrub value; nothing reads its own clock, so nothing desyncs.
- [ ] The light/dark ink switch crosses inside the middle third of the range and interpolates through a warm off-white (not pure white) so contrast holds at every position — verify at scrub 0, 0.25, 0.5, 0.75, 1.
- [ ] The "return to now/home" resting state is distinct: a unique icon and copy swap reward reaching it.

**Exemplars:** Good Air time-scrub sky theming (eng 1,804).

### R6 — Data-driven 3D extrusion + camera turn

**Serves:** share cards, system-reveal moments, year-in-review stats; the `mastery-and-status-card.md` display layer. **Rides:** `motion.durationReveal` — extrude and camera turn complete together in 500–800ms.

- [ ] 2D pixel/data values map to voxel heights (background 0, foreground ~8–12 units), so any generated flat asset can grow into 3D without bespoke modeling.
- [ ] Every extrude/collapse pairs with a simultaneous camera rotation (0° → 30–35° isometric) completing together — scale alone reads as inflation; scale plus rotation reads as the object turning toward you.
- [ ] Collapse plays a brief off-axis wobble (100–150ms), never a symmetric rewind.
- [ ] A soft elliptical drop shadow appears only while the object is "lifted."

**Exemplars:** Reactiive QR → voxel tree (eng 2,704; ~49% bookmark-to-like ratio — a technique reference, not eye-candy).

### R7 — Motion blur as a velocity cue

**Serves:** any recipe with a fast interpolation phase (R3, R6); craft detail 2. **Rides:** the underlying movement's spring; blur adds no time of its own.

- [ ] Blur appears only during high-velocity phases of a movement and scales with velocity.
- [ ] Every landing is tack-sharp; no blur persists at rest.
- [ ] Blur is applied to the moving object only, never as a full-screen filter — blur is one of the costly effects the frame budget in `premium-mobile-craft.md` warns about, so keep the blurred region small and profile it.

**Exemplars:** mymind card landings (eng 1,540); Reactiive extrusions (eng 2,704).

### R8 — One saturated hero, neutral chrome

**Serves:** `quality-lens.md` anti-generic checks; every celebration and reveal composition. **Rides:** the design-token palette — this is color discipline, not a duration.

**Scope.** The rule governs where attention goes, not whether chrome may carry the brand hue. Conventional interactive chrome — the primary CTA fill, progress indicators, selected-state tints — may ride the single brand hue; what the rule bans is a second saturated hue competing for attention, and chrome that outshouts or moves against the hero. Judge the content composition. Do not flag a colored button on its own.

Two more scope boundaries:

- **R2's clone burst is the one composition-level exemption.** A celebration bloom's 15–20 clones scatter "varied hue or silhouette" by R2's own spec — during the burst's bounded phases (contract → burst → hold → reconverge) the multi-hue scatter _is_ the hero. The single-hue discipline resumes the moment the clones reconverge; an ambient surface that keeps multiple saturated hues after the celebration ends is a violation, not an exemption.
- **User content is not chrome.** A collage, cloud, or grid of the user's own saved items — photo thumbnails, album art, imported cards — carries whatever colors the content has. The rule governs _designed_ composition elements: hero objects, chrome, brand surfaces. Grade the frame around the content, never the content itself.

- [ ] Exactly one hero/content object per composition carries saturated color; remaining chrome stays neutral or rides the same brand hue quieter than the hero — never a second saturated hue.
- [ ] Chroma and type-weight concentrate on the same element — attention has a single address.
- [ ] In celebration moments the saturated hero is the earned thing itself, not the chrome around it.
- [ ] During a landing or celebration, brand-hued chrome holds still; CTAs and chrome arrive only after the hero settles — via R10's post-reveal reflow, or after R2's hold when the moment choreographs one — so the full motion budget stays on the hero.

**Exemplars:** consistent across the catalog's top reveals — Nuvion (eng 1,568), mymind (eng 1,540), Melius.

### R9 — Contained edge-warp transition (web lane only)

**Serves:** landing/funnel scroll moments — route via `landing-motion-craft.md`. Never the mobile binary: the frame-read confirmed the exemplar is a website scroll effect (system.studio portfolio), not native app UI.

- [ ] Any warp/chromatic-aberration shader stays inside a thin margin (5–8% of container width) at the boundary.
- [ ] RGB channel-split stays at 0.3–0.8% of frame width — larger reads as a broken signal.
- [ ] Warp intensity derives from an element's proximity to the edge, not a global timer.
- [ ] The underlying scroll stays completely plain: the warp is the composition's only loud element.

**Exemplars:** screen-edge warp scroll (eng 2,841).

### R10 — Scratch-card reward reveal

**Serves:** `experience-cards/variable-reward-card.md` directly (anticipation → reveal); reward moments near the paywall. **Rides:** the reveal is finger-driven (no clock); the post-reveal CTA reflow uses 150–250ms (`motion.durationFast`–`durationBase`), no bounce.

- [ ] The reveal-mask edge is noise-generated (8–15px jagged perturbation) — torn foil, never a clean circle or wipe; an eraser edge reads as digital.
- [ ] The payoff value renders on its own top z-layer, so legibility is never gated on mask completion.
- [ ] When the post-reveal CTA appears, the card nudges up 15–20px while the CTA slides in over 150–250ms, no bounce — one coordinated reflow.
- [ ] Touch/cursor affordances swap per interaction state (scratchable → revealed).
- [ ] The reward beneath is real and genuinely variable per the card's bright line.
- [ ] Accessibility: a tap-to-reveal alternative exists (motor access), and under Reduce Motion the reveal is a cross-fade.

**Exemplars:** scratch-to-reveal reward card (eng 1,904 — the gamification family's top post); Duolingo reward mechanics (7 catalog posts, eng 2,935 combined across mascot joy, treasure chest, and streaks — the catalog's most-featured app).

## Cold-Launch Entrance Recipes (R11–R14)

Second inspiration source, same discipline. [Appllama's top-welcome-screens](https://github.com/Appllama/top-welcome-screens) recovers measured entrance timings for ten shipped apps' cold-launch sequences — splash, loading, and welcome screens — from 30fps reference clips. The same two ground rules from above apply without exception: these recipes are checkable numbers bound to the token scale, never a named app's mascot, wordmark, illustration, or copy. That discipline is also why this source needs no separate legal reconciliation — the source repo's own notice requires exactly the same thing before any of its reference implementations ships, so this file's recipe format and the source's licensing terms agree by construction rather than needing a waiver.

Scope: these four recipes cover the moment before onboarding's screen-by-screen sequence begins — the cold open `onboarding-conversion.md` assumes already resolved. Load them before authoring that sequence's first row.

### R11 — Splash hold-and-cut

**Serves:** the cold-launch moment before onboarding starts. **Rides:** no duration token governs the hold itself — it is bounded by real asset/font/data loading, not an arbitrary timer; the exit uses `motion.durationFast`–`durationBase` when a transition is authored, or a genuine 0ms cut when it is not.

A cold-launch splash reads as intentional when the hold has a real reason and the exit is one of exactly two moves: a **hard cut** (zero-duration, for a loading-to-content boundary that should read as "it's ready now") or a **dissolve-out** (`durationFast`–`durationBase`, for a branded-splash-to-destination boundary that should read as a considered transition). There is no third default — a slow ambient crossfade chosen because nothing else was authored is the failure mode this recipe rules out.

- [ ] The hold lasts exactly as long as the real asset/font/data load it is masking — never padded to "feel like a splash."
- [ ] The exit is a hard cut or an authored dissolve, chosen deliberately per the boundary it crosses, never a generic fade applied by default.
- [ ] Nothing on the splash is interactive. Decorative branding (logo, wordmark, background art) is absent from the accessibility tree; a real, still-loading state exposes a noninteractive loading status — and any failure/retry state — so a screen-reader user is not left in silence during a stalled load.
- [ ] Reduce Motion skips only the authored transition, never the real loading gate: the hold still lasts as long as the actual asset/font/data load takes, then cuts to the destination the instant that load completes, with no dissolve. "Renders immediately" means "no animated exit," not "before loading is done."

**Exemplars:** static-splash-then-hard-cut sequences (top-welcome-screens research set, Strava/onX Hunt/SCRL-inspired references); loader hard-cut into a final page (MyFitnessPal-inspired reference).

### R12 — Staggered multi-asset splash entrance

**Serves:** a welcome screen whose composition is several small assets — icons, props, ornaments — arriving together, distinct from R3's single hero object. **Rides:** `motion.stagger` (60ms) sets the per-asset floor; each asset settles on the press-family spring (response 0.3–0.4s, damping 0.7–0.8) — a calm arrival, never the celebrate family, because nothing has been earned yet at cold launch. The offset must hold for the worst case a valid implementation can pick — the last asset's stagger offset plus its own settle at the press family's slowest response (0.4s = 400ms) — inside the `motion.durationSlow`–`durationReveal` window (360–600ms total). That worst-case settle leaves a 200ms gap budget (600ms − 400ms) to split across the asset count's gaps, which is why the safe offset shrinks as assets are added:

| Assets | Gaps | Gap budget ÷ gaps | Offset to use                                                 | Worst-case total |
| ------ | ---- | ----------------- | ------------------------------------------------------------- | ---------------- |
| 2      | 1    | 200ms             | 120–180ms (full reference range)                              | 580ms            |
| 3      | 2    | 100ms             | up to 100ms                                                   | 600ms            |
| 4      | 3    | 66ms              | up to 66ms (still ≥ the 60ms stagger floor)                   | 598ms            |
| 5+     | 4+   | ≤50ms             | below the 60ms stagger floor — not achievable as pure stagger | —                |

- [ ] Each asset animates independently — its own stagger offset and its own settle — never one shared fade/scale applied to the group.
- [ ] The offset used matches the asset count in the table above — never the full 120–180ms reference range for 3 or more assets; that range is only proven safe at 2 assets.
- [ ] Total entrance window — last stagger offset plus that asset's settle, assuming the press family's slowest 0.4s response, not just the offsets — stays inside `motion.durationReveal` (600ms).
- [ ] Press-family spring only; a celebrate-family overshoot on a splash asset misreads a cold-launch moment as a reward (see R8's scope boundary).
- [ ] 5 or more assets cannot fit pure stagger inside both the 600ms window and the 60ms stagger floor at once (the table's own arithmetic proves it) — split into a staggered group of up to 4 plus a static remainder instead of stretching one long cascade or dropping the offset below the stagger floor.
- [ ] Reduce Motion: all assets render in their settled position with no stagger.

**Exemplars:** multi-icon staggered-spring splash entrance (top-welcome-screens research set, Yazio-inspired reference).

### R13 — Honest loader state-switch and skeleton reveal

**Serves:** any loading screen backed by real async work, and the Held Value Reveal rule in [`onboarding-conversion.md`](../experience/onboarding-conversion.md): a progress animation over nothing is deception, not suspense. **Rides:** the copy swap is a hard cut (0ms — a dissolving loader label reads as decoration, not progress); the post-cut skeleton reveal staggers its regions (background, header, primary content, CTA) on separately-timed ease-out opacity curves across `motion.durationBase`–`durationSlow`.

- [ ] A loader that changes its label switches on a real state transition, hard-cut, never a timed/fake progression.
- [ ] The skeleton's regions reveal in a fixed order with separately-timed ease-out curves — never one simultaneous fade-in of the whole shell.
- [ ] The loader never promises progress it is not making; if there is no real async work behind it, skip the loader and render the content.
- [ ] Reduce Motion: regions appear in their final state in the same fixed order, without the opacity ramp.

**Exemplars:** loader copy-switch without a dissolve (top-welcome-screens research set, MyFitnessPal-inspired reference); staged background/copy/CTA skeleton reveal (top-welcome-screens research set, SCRL-inspired reference).

### R14 — Paged cold-open with a deterministic final state

**Serves:** a multi-page welcome/onboarding cold-open — a value-prop carousel or tap-through intro — that precedes the question-based sequence `onboarding-conversion.md` governs. **Rides:** page-to-page slides ride `motion.durationSlow` with an ease-out curve; the final CTA arrives on its own fade after the last page settles, never bundled into the slide transition.

- [ ] Each page transition is a horizontal slide, not a fade-through-black or a cut; the deck reads as one continuous surface.
- [ ] The final CTA's entrance is a separate, later beat from the page settling — earned, not simultaneous.
- [ ] Every cold-open ships two paths beyond the animated entrance: a **skip-intro path** — an explicit, user-selected control that jumps straight to the deck's final page — and a **replay path** (a mounted instance restarts from a prop/state change without a full remount). The skip-intro jump is a deliberate user choice, never an automatic one.
- [ ] Never invent an entrance the product has no real content for — a screen with only a final marketing state and no captured motion reference ships that final state immediately rather than fabricating a plausible-looking animation. This is the one case where jumping straight to a final state has no page content to lose, because there was never a real paged entrance.
- [ ] Reduce Motion still presents every page, in the same order and with the same navigation as the animated version — only the slide between pages becomes a cut and the CTA's fade becomes an instant appearance. Never route Reduce Motion straight to the final page automatically: that silently drops page content the user did not choose to skip. Jumping straight to the final page stays reserved for the explicit skip-intro control above and the no-real-entrance case in the item above it.

**Exemplars:** paged cold-open with final-CTA fade (top-welcome-screens research set, Speak: Language Learning and Speak & Learn-inspired references); final-state-only welcome screen with no invented entrance (top-welcome-screens research set, Perplexity-inspired reference) — the same restraint R14's fourth checklist item generalizes.

## Live-Surface Effect Recipes (R15–R18)

These recipes come from four MIT-licensed React component references by Jakub Antalik. A web app can use the packages after a dependency review. Native apps transfer the behavior contract and use native rendering. Do not port React, SVG, Canvas, or WebGL code into a native binary.

### R15 — Liquid relationship morph

**Serves:** expanding action groups, connected chips, drag targets, and shape changes that explain a spatial relationship. **Rides:** `PremiumMotion.standard` for state changes. A larger authored morph can use `PremiumMotion.emphasized`.

The liquid layer shows that separate controls belong to one temporary group. The content layer stays sharp and interactive.

- [ ] A user action starts each merge, split, or trail. The effect never runs while the surface is idle.
- [ ] The effect uses a separate silhouette layer. Text, images, focus rings, hit targets, and accessibility nodes stay unfiltered.
- [ ] Each liquid group reserves the full travel area. The effect causes no layout shift.
- [ ] The merged surface uses design tokens for fill, shadow, and radius. It does not add a second visual system.
- [ ] Reduce Motion replaces the morph with an instant state change. The final grouping stays clear without motion.
- [ ] The effect never represents progress, loading, or successful completion.

**Exemplar:** Liquid Gooey (`liquid-gooey`). Its two-layer model keeps the real interface above the filtered silhouette.

### R16 — State-bound perimeter beam

**Serves:** one active agent task, one selected live card, or one temporary focus target. **Rides:** the web/brand lane with `motion.durationCinematic` for each half-cycle. Use a static token border when motion is not permitted.

The beam shows that one bounded element is active. It does not make an ordinary card look important without a state reason.

- [ ] A real active, selected, or processing state controls the beam. The beam stops when that state ends.
- [ ] Only one primary element in a viewport uses the beam at a time.
- [ ] The beam layer ignores pointer events. It does not replace the platform focus indicator.
- [ ] The component exposes the same state through text, semantics, or both. Color and motion are not the only signals.
- [ ] The loop pauses when the element is offscreen, the page is hidden, or the state is inactive.
- [ ] Reduce Motion shows a static border with the same contrast and state meaning.

**Exemplar:** Border Beam (`border-beam`). Its rotating and pulse variants separate decorative layers from interactive content.

### R17 — Liquid-metal priority ring

**Serves:** one rare premium action, one selected creative tool, or one branded hero control. **Rides:** the web brand-motion lane. Native apps use a token-based static or platform-native material.

The metal ring can make a control look scarce or high-value. Use it only when product hierarchy already gives that control the same priority.

- [ ] One screen uses no more than one liquid-metal ring.
- [ ] The ring does not create false urgency, false scarcity, or a stronger purchase claim than the copy supports.
- [ ] The wrapped control keeps its normal hit target, label, focus state, and pressed state.
- [ ] WebGL work shares one render loop and one context. Offscreen instances stop drawing.
- [ ] The oldest supported device meets the frame budget. A static token border appears after a context failure.
- [ ] Reduce Motion freezes the material. It also removes proximity reflections and other ambient response.

**Exemplar:** Metal FX (`metal-fx`). Its shared WebGL context and static paused state define the minimum performance fallback.

### R18 — Semantic thinking orb

**Serves:** an AI or agent interface with a real working, searching, solving, listening, composing, or shaping state. **Rides:** one continuous low-intensity loop. State changes use `motion.durationBase`.

The orb communicates the kind of work in progress. It is indeterminate feedback and never a percentage or completion signal.

- [ ] Each orb state maps to a real runtime state. Prefer a truthful generic working state to an inaccurate specific state.
- [ ] Visible status text names the task when the wait affects the user.
- [ ] An accessible live status announces meaningful state changes. Hide a decorative orb when adjacent text already provides the same announcement.
- [ ] The UI shows cancel, retry, elapsed time, or determinate progress when the underlying operation supports it. The orb does not hide those controls.
- [ ] The renderer pauses offscreen and in a hidden tab. It caps pixel density and avoids an unbounded instance loop.
- [ ] Reduce Motion renders a static representative frame. The text status continues to update.
- [ ] A stalled operation becomes an error or retry state. The orb never loops forever after the task stops.

**Exemplar:** Thinking Orbs (`thinking-orbs`). Its tuned 20px and 64px Canvas variants pair semantic states with reduced-motion and visibility handling.

## Gesture & Scroll Physics

The catalog's hardest-bookmarked family per post (rollout wheel scrub eng 3,037; pinch-to-close thread 601; Good Air scrub 1,804) — mechanics designers save to reuse. These rules govern any in-app gesture surface and read the same tokens as everything above.

**The two clocks rule.** While a finger is down, the gesture owns the clock: the surface tracks the finger 1:1 with zero added easing or duration (direct manipulation). Duration and spring tokens govern only what happens after release. Easing a surface _toward_ the finger reads as lag.

**Velocity handoff.** On release, feed the gesture's ending velocity into the settle spring's initial velocity — SwiftUI: read `velocity` off the final `DragGesture.Value` (iOS 17+) and start the settle with `.interpolatingSpring(..., initialVelocity:)`, normalized by the remaining travel (a projected end _target_ alone does not carry velocity into the spring); Reanimated `withSpring(target, { velocity })`; Flutter `SpringSimulation` with the drag velocity. A settle that ignores release velocity visibly "resets" and breaks the physical illusion.

**Rubber-band overscroll.** Content dragged past its bounds follows with diminishing returns, never a hard stop — iOS's classic resistance constant is ≈0.55, with displacement asymptotically approaching a limit proportional to the container dimension. Match the platform default; never disable overscroll bounce on scrolling content to make it "feel tight."

**Pull-to-refresh elasticity.** Trigger threshold 60–80pt of pull; the indicator's progress maps to pull _distance_, not time, so the user feels it arming; one `impactLight` haptic exactly at the arm point; release settles with `PremiumMotion.standard`; the spinner region collapses over `motion.durationBase` when the refresh completes.

**Drag-to-dismiss velocity.** Commit the dismissal when projected velocity exceeds ~1,000pt/s or displacement passes ~1/3 of the dismissable dimension, whichever comes first; otherwise spring back with the press family — no overshoot, because a bounce on a failed dismissal reads as mockery. The gesture stays interruptible in both directions at every point.

**Scrub-linked state.** R5's shared-value rule generalizes: any gesture that themes or transforms multiple properties drives them all off one scalar, so nothing desyncs.

**Reduce Motion.** Finger-tracking stays 1:1 — it is user-generated direct manipulation, not app-generated motion. Release settles collapse to the shortest non-bouncing settle, and decorative side-effects of the gesture (parallax, tilt, glow) are dropped.

Accept when:

- [ ] Tracking is 1:1 while the finger is down; nothing eases toward the finger.
- [ ] Every release settle receives the gesture's ending velocity.
- [ ] Overscroll rubber-bands at platform-default resistance; nothing hard-stops at an edge.
- [ ] Pull-to-refresh arms by distance with a single haptic at the threshold.
- [ ] Drag-to-dismiss commits on velocity or displacement and springs back without overshoot otherwise.
- [ ] All gestures are interruptible mid-flight.

## Where The Catalog Says Motion Budget Pays

From the full 300-post mine (123 showcase posts):

- **Tactile micro-interactions are the #1 family** by both count and engagement (14 posts, eng 10,266) — confirming the press-state-first doctrine. Branded press feedback (key-flips, jelly presses, cassette-style controls) is the differentiation layer above the baseline five details.
- **Celebration/milestone moments punch ~3× above their post count** (10 posts, eng 6,253): reward moments are disproportionately saved. R2, R3, and R10 are where craft investment compounds fastest — pair them with the experience card that earns the moment.
- **Gesture physics is the most-bookmarked family per post** — designers save mechanics for reuse, which is why the physics rules above are stated as numbers.
- **Brand-motion posts are the catalog's top outliers** (SarvamAI eng 4,375; Nuvion 1,568): living brand systems outdraw UI tricks. R1 is the entry point; a full brand-motion lane is deliberately out of scope here.

## Live Catalog Access (60fps.design MCP)

The catalog behind this file is queryable live when the 60fps.design MCP server is connected (`https://60fps.design/mcp` — tools named `60fps_*`). Use it to ground a specific surface in a real exemplar before applying a recipe:

- `60fps_search_shots` — semantic search over the shot library (~2,000 iOS interaction clips) by natural-language description, filter slugs, app, or platform.
- `60fps_get_shot` — full detail for one shot: keyframe images at 1s intervals, interaction pattern, motion behaviors, intensity, mood.
- `60fps_get_motion_breakdown` — the shot's motion anatomy: trigger, start → transition → end states, why it works. The right tool when recreating, not just finding.
- `60fps_get_motion_code` — starter SwiftUI tuned by the shot's motion parameters. Treat the output as a sketch to rewrite onto the token scale: replace its raw timing values with `DesignTokens.Motion` members and `PremiumMotion` presets before it ships.
- `60fps_get_related_shots` — nearest-neighbour variations of an interaction.

Ground rules carry over unchanged: mechanics only, never a featured app's branded asset, mascot, or copy; every recipe still binds to the token scale exactly as this file states. This section serves both motion lanes: in-app work rewrites `60fps_get_motion_code` output onto `DesignTokens.Motion`, while the landing lane ([`landing-motion-craft.md`](./landing-motion-craft.md)) uses only the search and breakdown tools and re-expresses the mechanic in `motion/react` on the `--motion-*` scale — the SwiftUI starter has no web target. The MCP is a live convenience over the registered catalog source (`x-com-60fpsdesign-catalog`); when it is not connected, this file's recipes remain the distilled contract and searching the catalog is not required. Two shots newer than the library's index were reproduced by frame-reading the source videos directly — the same fallback applies to any shot the MCP cannot return.

Runnable reproductions of these recipes ship in [`business/design/motion-catalog/`](../../examples/workspace/business/design/motion-catalog/README.md): two full-screen choreography exemplars (declarative and procedural modes), the closed-form `TokenSpring` evaluator, and the Remotion twin for token-true video renders.

## Provenance & Refresh

- Source: the 60fps.design catalog, mined 2026-07-26 (300 posts, 123 showcase). Registered as `x-com-60fpsdesign-catalog` (`inspiration_benchmark`) in `source-registry.yaml` with a 30-day refresh cadence. The live MCP endpoint (`https://60fps.design/mcp`) is registered separately as `sixty-fps-design-mcp`.
- R11–R14 source: [Appllama's top-welcome-screens](https://github.com/Appllama/top-welcome-screens), ten shipped-app cold-launch sequences with timings recovered from 30fps reference clips (that repo's `docs/MOTION_SPEC.md`). Registered as `github-appllama-top-welcome-screens` (`inspiration_benchmark`) in `source-registry.yaml`.
- Recipe timings and damping values come from frame-reads of the catalog's top videos, estimated from sampled frames (±1 frame-interval). Where a frame-read gave only a qualitative cue, this file states an operational threshold so reviews have a number to check — R1's ~200ms adjacency window, R2's 3–5% contraction and ≤15ms clone stagger are that kind of operationalization, not catalog measurements.
- The Gesture & Scroll Physics numbers (rubber-band ≈0.55, 60–80pt refresh threshold, ~1,000pt/s dismiss velocity, 1/3 displacement) are platform-behavior defaults from iOS convention, stated here as the baseline to match; the catalog motivates the section but did not produce those constants.
- Engagement numbers rank patterns within this catalog only; never repeat them as external claims.
- Exemplar apps' branded assets stay theirs. Recipes transfer mechanics only.
- R15–R18 sources: Liquid Gooey, Border Beam, Metal FX, and Thinking Orbs. The source projects use the MIT license.
- The R15–R18 package APIs apply only to React web projects. Other targets transfer the behavior and fallback rules.
