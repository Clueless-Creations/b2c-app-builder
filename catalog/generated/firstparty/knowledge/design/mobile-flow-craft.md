# Mobile Flow Craft

Use this reference when designing, implementing, or auditing a native mobile flow. It strengthens the Design Room with flow-level research, navigation semantics, native fidelity, mechanical anti-generic checks, motion budgeting, and runtime verification.

This doctrine adapts selected methods from Appllama's MIT-licensed `appllama-app-design-skill` and `appllama-usage` skills into B2C App Builder's cross-platform contracts. See `THIRD_PARTY_NOTICES.md`. It does not copy Appllama's proprietary screen library, require its MCP, or make Expo/React Native the default stack.

## 1. Research the question, not the gallery

Start with a named decision. Examples:

- How should first-run onboarding earn the permission ask?
- What is the category grammar for a hard paywall after first value?
- Is this filter a pushed destination, a sheet, or an in-screen state?
- Which states and recovery paths does this core loop need?

For substantive new or materially changed mobile flows:

1. State the research question and the product constraint before collecting references.
2. Prefer complete comparable journeys over isolated screenshots.
3. Compare multiple relevant products when authorized evidence exists. One product shows one implementation; convergence across several products is stronger evidence of a convention.
4. Record convergence, divergence, and the reason a local choice fits this product. Revenue, popularity, or a provider ranking is context, never causal proof that a design choice is correct.
5. Stop when additional evidence no longer changes the working specification. Record the saturation judgment instead of harvesting a catalog indefinitely.
6. Extract patterns, not pixels. Never copy another product's brand, copy, assets, or exact composition.

`design-evidence-stack.md` owns provider selection and evidence resolution. Appllama, when explicitly available and authorized, is one possible reference provider. Its provider-specific tool instructions remain upstream in `appllama-usage`; do not fork its MCP manual into this repository.

## 2. Specify the flow grammar

A screen specification is incomplete when it describes only appearance. Every transition in a primary flow must answer:

- **Destination semantics:** deeper destination, completed/replaced state, modal task, short interruption, overlay, system controller, or peer tab.
- **Return expectation:** should the user be able to return to the source after the world changes?
- **Back behavior:** what do navigation back, edge swipe, Android system back, Cancel, and dismissal do?
- **State consequence:** did the action merely navigate, or did it commit an event that navigation cannot undo?
- **Interruption behavior:** if authentication, payment, permission, or another gate interrupts an action, where does success return the user and what action resumes?

### One-way doors

Use replacement semantics after a state transition when returning would expose an invalid past state. Common examples include completed first-run onboarding, an authentication wall that has permanently resolved, or a purchase path whose prior hard paywall is no longer valid.

Do not turn every funnel step into a one-way door. Back remains available unless returning is semantically invalid, an irreversible request is briefly in flight with visible progress, or unsaved work requires a confirmation before dismissal.

A paywall opened from an existing feature normally dismisses back to that feature after purchase, now unlocked. A sign-in interruption triggered by a user action should preserve enough context to resume that action. Product intent owns these semantics; the framework implementation follows them.

### Presentation semantics

Use the platform's native presentation model when it fits:

- a deeper durable destination uses normal navigation;
- a self-contained multi-step task uses a modal task with its own completion/dismissal semantics;
- a short picker/filter/options interruption may use a sheet;
- content floating over a still-visible source may use an overlay;
- destructive confirmation and sharing/picking should use appropriate system surfaces when available;
- peer tabs preserve independent navigation history rather than pretending to be sequential pages.

If a temporary sheet grows into a multi-step task, reclassify it. If a destination must deep-link or own durable state, treat it as a route rather than hiding it in ephemeral component state.

Record the semantic decision in the applicable `design/flows/` or `design/screens/` contract. Framework-specific code is implementation evidence, not the source of product semantics.

## 3. Native fidelity is correctness, not decoration

Separate three kinds of decisions:

1. **Product semantics:** what the user can do and what state changes.
2. **Platform fidelity:** controls, navigation, accessibility, safe areas, system conventions, localization, and input behavior users expect on that platform.
3. **Brand expression:** tokens, type, imagery, composition, shape, and deliberate product-specific departures.

A brand decision cannot silently override a platform behavior. When a custom control replaces a native control, document the user or product reason and verify its accessibility, interaction, state, and platform behavior.

For each selected platform, verify applicable:

- semantic light/dark color behavior;
- platform-appropriate controls and iconography;
- dynamic text or text scaling;
- safe areas, status areas, home/system gesture areas, and supported orientations;
- keyboard/focus/input behavior;
- localization of numbers, currency, dates, and pluralization;
- haptics as supplementary feedback rather than the only feedback;
- system accessibility settings, including reduced motion and screen reader behavior;
- scrolling and content overflow rather than fixed-height happy-path layouts.

Do not hard-code framework prescriptions into the cross-platform contract. SwiftUI, UIKit, Flutter, Compose, React Native, and other supported stacks implement the same semantic requirement differently.

## 4. Ship state cycles, not screenshots

Every primary surface must account for the states required by `design-acceptance.md`. At minimum, do not treat a static success state as the whole design.

Loading should preserve expected layout when its shape is known. Empty states should explain how the user can reach useful content. Errors should be specific and recoverable when recovery exists. Offline and permission-denied behavior must be explicit or have a product-specific non-applicability reason.

Optimistic feedback is useful only when rollback and failure are visible and correct. Do not hide network or provider uncertainty behind a success animation.

## 5. Mechanical anti-generic preflight

A design audit should turn objective parts of 'this feels generated' into checks. The exact values come from the accepted design system, not from a universal aesthetic law.

Before runtime acceptance, inspect at least:

- **Accent drift:** every accent belongs to an approved semantic/token family. No surprise hue appears because one screen was built separately.
- **Shape drift:** radii, borders, elevation, and container shapes come from the declared token system unless a named exception exists.
- **Intent-label drift:** the same product intent does not accumulate interchangeable CTA labels without a content decision.
- **Chrome icon drift:** UI chrome uses the selected icon system; emoji or mixed icon families require an explicit brand/content reason.
- **Unexplained effects:** gradients, glass, glow, blur, confetti, and decorative motion have a recorded purpose or are removed.
- **State completeness:** applicable loading, empty, error, offline, permission, large-text, screen-reader, dark/light, and reduced-motion cases are represented by the acceptance scope.

These checks are not a beauty score. Mechanical findings fail mechanically. Taste remains governed by `design-worthiness.md` and the independent audit.

## 6. Motion has a budget

Before adding custom motion, classify frequency and purpose.

### Frequency gate

- **Constant/high-frequency interactions** such as scrolling, ordinary back navigation, keyboard movement, and tab switching should default to platform behavior. Custom flourish is usually a regression.
- **Frequent direct feedback** such as presses and selections should be immediate and restrained.
- **Occasional state changes** such as sheets, confirmations, or meaningful reveals may use the accepted motion vocabulary.
- **Rare earned moments** may use expressive choreography when it serves the emotional/product contract.

Zero custom animation is a valid result of the gate.

### Purpose gate

Name the purpose: feedback, spatial continuity, state change, comprehension, preventing a jarring cut, or earned delight. If the motion has no user-facing purpose, remove it.

Gesture-driven motion follows the gesture and preserves continuity. Non-gesture motion follows the accepted token/preset scale in `premium-mobile-craft.md` and `motion-craft-benchmarks.md`. Do not introduce per-screen timing literals when a project preset exists.

Reduced-motion behavior is part of the same interaction contract, not a later accessibility patch.

## 7. Runtime verification is part of design completion

A Design Room render proves authored direction, not native implementation quality. A static screenshot proves one frame, not navigation, motion, recovery, or accessibility.

For implemented mobile flows, verify the complete authored interaction on a current registered runtime using the evidence rules in `design-acceptance.md`.

The review must inspect:

1. entry state and prerequisite state;
2. the full primary interaction sequence;
3. navigation and dismissal semantics, including back behavior;
4. loading/recovery/error or declared non-applicability;
5. light/dark and accessibility settings required by the accepted surface;
6. reduced-motion behavior;
7. scrolling, safe-area, keyboard, and interruption behavior where applicable;
8. final state and any one-way-door behavior.

When motion is material, capture a recording or interaction artifact that lets the independent reviewer inspect the transition rather than inferring it from before/after frames. When performance is material, use the production/release-like runtime appropriate to the selected stack and device class; a development shell cannot prove release performance.

Do not invent 'simulator verified' as a prose label. `design-acceptance.md` owns strict producer-bound capture and interaction receipts, runtime identity, candidate fingerprints, and independent review.

## 8. Cross-station ownership

The Design station does not own every consequence of a flow.

- Product owns the user job, irreversible state, value sequence, and accepted scope.
- Design owns presentation, interaction grammar, native fidelity, and visual/motion contract.
- Engineering owns correct stack implementation and runtime behavior.
- Monetization owns entitlement and purchase semantics where applicable.
- Store/operations own provider and release constraints.
- Analytics owns measurement semantics.
- Accessibility/device QA independently verifies applicable platform behavior.

A design pattern from a benchmark cannot override another station's accepted constraint. When evidence exposes a conflict, resolve the product decision instead of quietly coding around it.

## 9. Working check

Before calling an implemented mobile flow design-complete, you can answer:

- What question did the reference research answer?
- Which conventions converged across evidence, and where did this product deliberately diverge?
- What is every transition's semantic type and return expectation?
- Which transitions are true one-way doors, and why?
- Which behaviors are platform correctness versus brand choices?
- Which mechanical anti-generic checks passed?
- What purpose and frequency class justifies each custom motion?
- Which complete interaction was actually observed on the registered runtime?
- What evidence covers recovery, accessibility, reduced motion, and final state?

If the answer is only 'the screens look good,' the flow is not done.
