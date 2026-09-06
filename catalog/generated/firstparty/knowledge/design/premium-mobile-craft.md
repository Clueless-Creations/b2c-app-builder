# Premium Mobile Craft: The Invisible Details

Use this before any in-app UI build, design handoff, or polish pass on a launched mobile app. It is the craft layer that sits under `design-visual-system.md` (token truth), `refero-ux-patterns.md` (flow shape), and `emotional-design-system.md` (emotional arc). Those decide _what_ the screens are; this decides whether they _feel right_.

Premium does not mean flashy. The apps people love do not have wild animations, heavy blur that tanks performance, or motion that shouts for attention. They feel right — and that is the harder bar. Anyone can copy a bouncy animation from Dribbble; almost nobody nails the fifty invisible decisions that make an app feel built by people who care. None of the details below are flashy. That is the point. Premium is the compounding effect of stacking twenty of them. Users will not say which one mattered; they will just say "this app feels different."

This skill ships one reference implementation and portable contracts so an app can start from proven behavior without confusing shared intent with shared source code:

- Platform-neutral contracts: [`surfaces/ui-library/components/`](../../surfaces/ui-library/components/) — behavior, states, accessibility, tokens, and proof expectations that every selected stack implements natively.
- SwiftUI reference adapter: [`business/design/system/PremiumCraft.swift`](../../examples/workspace/business/design/system/PremiumCraft.swift) — press-state button style, semantic haptics, keyboard behavior, shimmer/skeleton, and an empty-state view, all reading `DesignTokens.Motion` and honoring Reduce Motion.
- The pattern contract: a **Premium Craft Details** section and bug traps in [`business/product/experience/ux-patterns/UX_PATTERNS.md`](../../examples/workspace/business/product/experience/ux-patterns/UX_PATTERNS.md).

## Platform Routing

The five details are platform-neutral doctrine. Their implementations are native to the chosen stack. A shared token name is a shared intent, not proof of equivalent runtime behavior. Mobile binaries never import framer-motion, which is web-only and enforced by `check:template-safety`.

- **SwiftUI** has the current reference adapter. Use `PremiumCraft.swift`. On iOS 26, use system Liquid Glass affordances for appropriate chrome surfaces. Custom controls and earlier OS versions still need explicit press, haptic, keyboard, and state behavior.
- **Expo or React Native** implements the same contracts with native React Native primitives and an appropriate animation, haptic, and keyboard stack. Map promoted TypeScript tokens to those APIs, honor the platform reduce-motion setting, and record implementation proof before marking the adapter implemented.
- **Flutter** implements the same contracts with Flutter animation, haptic, focus, and keyboard APIs. Map promoted Dart tokens to those APIs, honor `MediaQuery.disableAnimations`, and record implementation proof before marking the adapter implemented.
- **Another stack** uses a free-form stack ID and its own adapter. The component contract stays stable; the native implementation and proof remain stack-specific.

When a surface needs stronger direction than the details below — celebration choreography, earned-object reveals, gesture/scroll physics, scrub-linked theming, brand liveness — load [`motion-craft-benchmarks.md`](./motion-craft-benchmarks.md): named numeric recipes distilled from the 60fps.design catalog, phrased as checkable acceptance criteria on the same token scale.

Authoritative references to refresh before changing API-level guidance (registered in `source-registry.yaml`):

- Apple HIG — Playing haptics: `https://developer.apple.com/design/human-interface-guidelines/playing-haptics`
- Apple HIG — Motion: `https://developer.apple.com/design/human-interface-guidelines/motion`
- Apple HIG — Loading: `https://developer.apple.com/design/human-interface-guidelines/loading`
- Apple — Applying Liquid Glass to custom views: `https://developer.apple.com/documentation/SwiftUI/Applying-Liquid-Glass-to-custom-views`
- Motion (web-surface parity for landing/funnel only): `https://motion.dev/docs/react`

## The Five Details

### 1. Press states & spring physics

Tap a button in a premium app and watch the ~100ms between your finger landing and the action firing: a tiny scale-down, so the button feels like a physical object responding to you. In a cheap app, nothing happens until the action fires — a flat rectangle that responds to nothing. That gap is the difference, and most builders never think about it.

- **SwiftUI:** `.buttonStyle(.premiumPress)` (small scale + dim + spring-back + optional confirming haptic). On iOS 26 prefer `.buttonStyle(.glass)`/`.glassProminent` for system-shaped controls.
- **Spring, not linear.** Use `PremiumMotion.press` (a low-bounce spring on the fast token), not a flat ease. Springs read as physical; eases read as mechanical.
- **Every tappable surface** gets a press state — buttons, cards, list rows, icon buttons. A control that responds to nothing feels broken.
- Reduce Motion keeps the opacity/haptic cue and drops the scale transform.

**Two spring families, one canon.** These are the numbers the experience cards already ship — cite them, never fork a parallel vocabulary:

| Family        | SwiftUI spring                             | Settle behavior                                          | Use                                              |
| ------------- | ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------ |
| **press**     | response 0.3–0.4, dampingFraction 0.7–0.8  | settles with no visible overshoot — a control responding | every tappable surface and ordinary state change |
| **celebrate** | response 0.45–0.5, dampingFraction 0.5–0.7 | overshoots and visibly reverses — an object landing      | celebrations and earned-object reveals only      |

The celebrate family's canon lives in the experience cards, pinned in each card stub's Motion Binding section (full recipes are MCP-served): `experience-cards/peak-end-card.md` (response 0.45 / damping 0.7), `experience-cards/mastery-and-status-card.md` (0.5 / 0.7), `experience-cards/variable-reward-card.md` (damping 0.6). The family has two ends: at damping 0.6–0.7 the overshoot is one soft settle — right for sheet-level reveals, and where the card canon sits; at 0.5–0.6 an earned object visibly oscillates 1–2 times before resting ([`motion-craft-benchmarks.md`](./motion-craft-benchmarks.md) R3). Anything below 0.5 reads as a toy. A celebrate-grade spring on an ordinary state change is as wrong as a flat ease on a celebration. `PremiumMotion.press` expresses the press family through the `.spring(duration:bounce:)` initializer (120ms, bounce 0.18) — the same low-bounce physics in a different parameterization, not a third vocabulary. The celebrate family ships the same way, riding `motion.durationCelebrate` (500ms): `PremiumMotion.celebrate` (bounce 0.3 — the soft-settle end, damping ≈0.7) and `PremiumMotion.celebrateLanding` (bounce 0.45 — the visible-oscillation end, damping ≈0.55, R3 landings). App code reads these presets; hand-typed spring numbers in view code are exactly the drift the preset layer exists to prevent. The cards' `.spring(response:dampingFraction:)` literals remain the canon notation the presets implement.

### 2. Subtle animations

Subtle. Subtle. Subtle. The moment most builders discover an animation engine they animate everything — cards bounce in, headers parallax, tabs swirl, the home screen becomes a theme park. Stop.

- **Motion must answer a question the user just asked.** A list item fades in _because new data arrived_. A modal slides up _because the user requested it_. A button scales _because they pressed it_. If you cannot name the question, cut the animation.
- **Speed:** keep standard transitions in the **150–300ms** band (`PremiumMotion.standard` ≈ the base token). Longer starts to feel like the app showing off.
- **Tokenized, not improvised.** All durations/springs come from `DesignTokens.Motion`; no ad-hoc millisecond values. One scale across every surface.
- **Reduce Motion is mandatory.** Use `.premiumAnimation(_:value:)`, which collapses to an instant change when Reduce Motion is on. Never block first paint on an animation.

### 3. Haptics

Haptics are the closest thing in software to making a user physically trust your app: a success pattern when a form submits, a soft tick when a toggle flips, a warning when they're about to delete the wrong thing. You don't notice them when they're right; you notice them when they're missing.

- **The rule:** haptics confirm **state changes and decisions** — not navigation, not scrolling, not idle taps. Haptics on everything become noise and feel cheap.
- **SwiftUI:** prefer the declarative `.sensoryFeedback(for:trigger:)` for state-driven feedback; use the imperative `Haptics.Event.play()` for one-shot gesture moments (e.g. swipe-to-dismiss `onEnded`). Semantic events: `selection`, `impactLight`, `impactMedium`, `success`, `warning`, `error`.
- Map the event to the meaning, not the screen: `success` on completion, `warning` before a reversible destructive action, `selection` on a toggle/segment.

### 4. Keyboard behavior

The most user-hostile experience in mobile is a careless keyboard: the input gets covered, the submit button hides, the keyboard dismisses when you didn't ask or refuses when you do. This is the detail that separates serious builders from the rest.

- **SwiftUI auto-avoids** the keyboard via the safe area, so the work is the rest: `.premiumInteractiveKeyboardDismiss()` (drag-to-dismiss that follows the finger), a `KeyboardDoneToolbar` so a dismiss control stays reachable, and `@FocusState` with `.dismissKeyboardOnTap` / `.swipeFocusGesture` for intentional focus/blur.
- The submit/primary button must stay visible as the keyboard animates in.
- Dismissing should feel deliberate (drag or explicit Done), never jarring.

### 5. Loading & empty states

These are the screens nobody designs and everybody sees first.

- **Loading:** a spinner says "I'm working, please wait." Premium apps don't ask users to wait — they show what's coming. Use `.skeleton(isLoading)` (redaction-based skeleton + soft shimmer) so the layout's _shape and size_ are preserved and content feels like it was always there. Reduce Motion shows a static placeholder. Skeletons also prevent the layout jumps cheap apps have when data lands. For AI/long waits, cycle short status text — reading makes the wait feel shorter than staring at a spinner.
- **Empty:** a list with no items is never a blank screen. Use `EmptyStateView` to say what goes here, why it's empty, and the one next step (a single primary action).

## Shared-Element Continuity

The hallmark premium navigation pattern the five details don't cover: when a thumbnail becomes a detail view, the _same element_ travels — it does not vanish from one screen and reappear on another. Grid card → full-screen detail, mini-player → expanded player, avatar → profile. Continuity tells the user where they are for free; a modal that materializes from nowhere makes them re-orient.

- **SwiftUI:** `matchedGeometryEffect(id:in:)` with one `@Namespace` morphs elements within a single view hierarchy (in-place expansions, overlays, custom presentations in the same tree) — it does not bridge separate `NavigationStack` destinations on its own. For a pushed grid→detail flow on iOS 18+, mark the tapped source with `.matchedTransitionSource(id:in:)` and give the destination `.navigationTransition(.zoom(sourceID:in:))` — both sides are required. The traveling element animates with `PremiumMotion.standard`; an earned object arriving may land with the celebrate family (`motion-craft-benchmarks.md` R3).
- **React Native:** react-navigation shared-element transitions / Reanimated shared transition tags.
- **Flutter:** `Hero(tag:)` — one tag per traveling element.
- **One traveler per transition.** The shared element is the single continuity anchor; everything else cross-fades or stays put. Two simultaneously morphing elements read as chaos.
- **Text morphs are a trap.** Match geometry on containers and images; cross-fade text between size classes rather than stretching glyphs.
- **Reduce Motion:** replace the travel with a plain cross-fade (`.opacity` transition / fade interpolator / `FadeTransition`). The fallback is mandatory, same as every other detail.

Acceptance: navigating between two surfaces that show the same object either keeps that object on screen as one continuous element, or deliberately declines to — and then the transition is a fade, not a slide-in from nowhere.

## The Frame Budget

The bar is mechanical: 60fps means every frame renders in 16.6ms (8.3ms on 120Hz ProMotion), and one dropped frame inside a 220ms transition is a visible stutter.

- **Animate compositor-safe properties only:** transform (translate/scale/rotate) and opacity. They render without triggering layout.
- **Never animate layout in scrolling contexts** — padding, frame sizes, or anything that moves siblings mid-scroll forces a layout pass per frame and hitches exactly where attention is highest.
- **Blur and shadows are the expensive outliers.** Keep blurred regions small and on the moving object only (`motion-craft-benchmarks.md` R7); pre-render heavy shadows.
- **Profile, don't eyeball:** Instruments' Animation Hitches template (or the hitch-rate metric in Xcode Organizer) on a real device — the oldest one you support, not the newest. React Native: the perf monitor plus Reanimated's UI-thread worklet path. Flutter: DevTools performance overlay and raster timeline.
- The hitch budget for press feedback and scrolling is zero. A celebration may spend more per frame, but never during scroll.

## The Compounding Effect

None of these alone makes an app premium. Press states without good keyboard handling still feel broken. Smooth keyboards without thoughtful empty states still feel hollow. Skeleton loaders without haptics still feel flat. Premium is what happens when you stack twenty of these decisions on top of each other.

## Acceptance Checklist

- [ ] Every tappable control has a press state (scale/dim spring or system Liquid Glass), with Reduce Motion handled.
- [ ] Animations exist only where they answer a user question; durations are tokenized and in the 150–300ms band.
- [ ] Haptics confirm decisions/state changes only — not navigation or scrolling.
- [ ] Keyboard never covers the input or submit; dismissal is intentional; focus/blur is deliberate.
- [ ] Loading uses size-preserving skeletons/shimmer (or status text), not a bare spinner; Reduce Motion degrades gracefully.
- [ ] Empty states explain what/why and offer one primary action.
- [ ] Reduce Motion verified on device for every animated surface.
- [ ] Motion reads `DesignTokens.Motion`; no ad-hoc millisecond values; no framer-motion in the mobile binary.
- [ ] Springs come from the two-family canon: press (damping 0.7–0.8) on controls and state changes, celebrate (damping 0.5–0.7) only on celebrations/reveals.
- [ ] Surfaces showing the same object across screens use a shared-element transition or a deliberate fade, with the Reduce Motion cross-fade fallback.
- [ ] Animated properties are compositor-safe (transform/opacity); no layout animation in scrolling contexts; animation hitches profiled on the oldest supported device.

## Common Failures

- Flat buttons with no press feedback; controls that respond to nothing.
- Animating everything; theme-park motion that distracts instead of clarifying.
- Haptics on navigation/scroll/every tap until they become noise.
- Keyboard covers the input or hides the submit button; dismissal is jarring or impossible.
- Bare spinners and layout jumps instead of size-preserving skeletons.
- Blank empty states with no first action.
- Reduce Motion ignored; first paint blocked on an animation.
- Ad-hoc durations instead of the tokenized `motion.*` scale; framer-motion leaking into the mobile binary.
- Celebrate-grade bouncy springs on ordinary state changes, or press-grade flat settles on earned moments.
- Detail views that materialize from nowhere when the tapped object could have traveled.
- Layout animated mid-scroll; full-screen blur during motion; animation smoothness never profiled off the simulator.
