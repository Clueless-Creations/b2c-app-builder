---
version: alpha
name: App Name
description: One-sentence promise still to be defined.
colors:
  background: "#f7f3ec"
  surface: "#fffdfa"
  surfaceElevated: "#ffffff"
  primary: "#0c7c59"
  accent: "#ff6f5c"
  text: "#161512"
  muted: "#686159"
  border: "#d8d0c3"
  success: "#16784c"
  warning: "#a05a00"
  danger: "#b3261e"
typography:
  display:
    fontFamily: Fraunces, Georgia, serif
    fontWeight: "700"
  body:
    fontFamily: Source Sans 3, Avenir Next, sans-serif
    fontWeight: "400"
rounded:
  sm: 4px
  md: 8px
  lg: 14px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components: {}
---

# App Name Design System

Status: not started

This is the authored design authority for the app. Read it before changing a user-facing surface. Keep product-specific decisions here. Use the B2C App Builder knowledge library to inform those decisions, not to replace them.

## Overview

Describe the product feeling in one sentence. Name the user goal that the design serves. Name the moment in the complete journey that must feel exceptional.

## Direction Exploration

Develop at least three distinct concepts before you select the design system.
Store the evidence in the frontmatter `exploration` map. Keep each concept in
this file. Do not create parallel proposal files.

```yaml
exploration:
  schemaVersion: 1
  selectedConceptId: concept-one
  concepts:
    - id: concept-one
      name: Product-specific direction name
      premise: State the product idea and the user behavior that it makes visible.
      referenceMappings:
        - referenceId: reference.pack-principle
          principle: State the principle transferred from the frozen reference pack.
      treatments:
        native: State how this direction behaves in the selected native platform.
        mobileWeb: State how the landing recomposes for a narrow browser.
        desktopWeb: State how the landing uses a wide browser composition.
      distinguishingMechanic: State the interaction or object system unique to this direction.
      decision: selected
      rationale: State why this direction serves the product better than the alternatives.
```

Repeat the concept row at least three times. Mark one row `selected` and every
other row `rejected`. Give every row its own rationale.

## Colors

The frontmatter owns exact semantic color values. Explain each role here after the direction is chosen. Preserve meaning without color alone.

## Typography

The frontmatter owns the display and body roles. Define the hierarchy, supported dynamic type range, truncation policy, and localization behavior before implementation.

## Layout

Describe the composition with concrete nouns and verbs. Define spacing, density, safe-area behavior, responsive changes, and the one dominant action on each screen. Mobile layouts recompose; they do not shrink a desktop canvas.

## Elevation & Depth

Use depth to clarify containment, state, and hierarchy. Record the border, shadow, blur, or material rules that the selected platforms can reproduce honestly.

## Shapes

Use the radius scale in frontmatter. Keep one shape language across controls, cards, sheets, dialogs, and feedback surfaces.

## Components

Reusable behavior is specified once in platform-neutral component contracts. Native adapters implement those contracts for the selected stack.

- Reusable contracts: `<skill-root>/ui-library/components/`
- App-specific overrides: `design/components/`
- Selected native mapping: `design/platforms/<stack>.json`
- Maturity: `specified`, `implemented`, or `verified`. Never infer verification from a source file alone.

SwiftUI, Expo or React Native, Flutter, and future stacks use the same semantic jobs, states, accessibility outcomes, and tokens. They keep native source, previews, and tests. Do not build a universal widget layer.

## Do's and Don'ts

- Do derive visual decisions from the target user and the product promise.
- Do use semantic tokens and verified components by default.
- Do make loading, empty, error, offline, disabled, and reduced-motion states explicit.
- Do keep platform behavior native to the selected stack.
- Don't add a new component when a verified component already serves the job.
- Don't claim cross-platform parity without native proof for each selected adapter.
- Don't use gradients, motion, or decoration when they obscure the product action.

## Source Ownership

- `DESIGN.md` owns global design intent, exact design tokens, system rules, and routing guidance.
- `studio/seed/business.json` owns the structured surface inventory, screen and flow status, and review state.
- `design/flows/<flow-id>.md` and `design/screens/<screen-id>.md` hold deeper plans only when a real flow or screen needs them.
- `design/system/` contains generated DTCG, web, SwiftUI, Expo, and Flutter token projections. Do not edit them by hand.
- `design/design-room.html` is a generated, read-only review page.
- Git owns design revisions and comparisons.

## Product Experience

### Experience principles

1. Define the first principle and the user behavior it protects.
2. Define the second principle and the trade-off it resolves.
3. Define the third principle and the quality it makes visible.

### Experience to avoid

List the visual clichés, interaction traps, false claims, and category conventions that this product must not copy.

## Audience And Identity

Every visual decision derives from the target user in `strategy/RESEARCH.md`, not from a trend or template default.

| Audience fact | Decision it produced | Token or direction | Evidence     |
| ------------- | -------------------- | ------------------ | ------------ |
| Not defined   | Not defined          | Not defined        | Not captured |

Name the apps this audience already loves, the category convention this app follows, the convention it breaks, its anti-references, and the physical or sensory metaphor behind the identity. Record the logo-swap test in the Decision Log when the direction is accepted.

## Object Language

One product noun per object. The landing, onboarding, `product/copy/COPY_DECK.md`, and store copy use these nouns and no others. `check:audience-identity` fails a surface that uses a term listed under Do not use.

| Object      | Definition  | Allowed terms | Do not use  | Evidence     |
| ----------- | ----------- | ------------- | ----------- | ------------ |
| Not defined | Not defined | Not defined   | Not defined | Not captured |

## Visual Direction

Describe how color, type, shape, depth, spacing, imagery, and iconography express the product idea. State how this direction differs from the closest products in the category.

## Interaction System

Describe the shortest path from intent to value and the dominant action at each step. Every implemented screen and flow must appear in `studio/seed/business.json`. Link a detailed `design/screens/` or `design/flows/` spec only when the structured route is not enough.

### Screen and state matrix

| Surface               | User job    | Primary action | Empty       | Loading     | Success     | Error or offline | Components  | Evidence     |
| --------------------- | ----------- | -------------- | ----------- | ----------- | ----------- | ---------------- | ----------- | ------------ |
| First product surface | Not defined | Not defined    | Not defined | Not defined | Not defined | Not defined      | Not defined | Not captured |

## Onboarding

Define each onboarding beat, its exit path, the value shown before permission or payment, and whether it is optional, skippable, or required.

## Motion and haptics

This YAML block is normative for motion. Token exporters consume it with the standard frontmatter.

<!-- b2c-motion-tokens -->

```yaml
durationFast: 120ms
durationBase: 220ms
durationSlow: 360ms
durationCelebrate: 500ms
reducedMotionDuration: 0ms
easing: cubic-bezier(0.2, 0, 0, 1)
durationReveal: 600ms
durationCinematic: 1200ms
easingEmphasis: cubic-bezier(0.16, 1, 0.3, 1)
easingSpring: cubic-bezier(0.34, 1.56, 0.64, 1)
stagger: 60ms
```

Define purpose, trigger, interruption behavior, haptic meaning, and reduced-motion result for each important moment. Web uses generated CSS tokens. Native apps use the selected platform's animation and accessibility APIs.

| Moment             | Purpose     | Token or preset | Haptic      | Reduced-motion result |
| ------------------ | ----------- | --------------- | ----------- | --------------------- |
| First-value moment | Not defined | Not defined     | Not defined | Not defined           |

### Live-surface effects

Use a live effect only when it explains a real state or relationship. Do not add one only to make a surface look active.

| Surface     | Real state or relationship | Recipe                      | Visible or semantic signal | Stop condition | Reduced-motion result | Low-power fallback |
| ----------- | -------------------------- | --------------------------- | -------------------------- | -------------- | --------------------- | ------------------ |
| Not defined | Not defined                | R15, R16, R17, R18, or none | Not defined                | Not defined    | Not defined           | Not defined        |

Thinking orbs show indeterminate AI activity. They do not show progress. Beams and metal rings do not replace focus, selection, or purchase disclosures.

### Card motion spec

| Card moment      | Motion contract                                                                      | Reduced-motion result                                           |
| ---------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Commitment echo  | Use `motion.durationFast` for the confirmation fade.                                 | Show the confirmation without movement.                         |
| Perceived Effort | Use `motion.durationFast` for real step changes and a celebrate-family final reveal. | Show the real progress count and final result without movement. |
| Variable Reward  | Use `motion.durationBase` for anticipation and a celebrate-family reveal.            | Show the result immediately with a static badge.                |
| Intent Mirror    | Use `motion.durationReveal` for the entrance.                                        | Show the user's words immediately as static text.               |

## Screen Routes

The routing chain is `DESIGN.md` → flow → screen → component contract → selected native adapter → semantic token. The structured list lives in `studio/seed/business.json`. Add detailed Markdown only for real work; do not seed empty files for hypothetical screens.

## Cross-Surface Direction

Keep the product promise and visual idea consistent. Adapt composition, interaction, and copy length to each medium.

`acceptance.designContractPaths` must list every linked `design/screens/*.md` and `design/flows/*.md` contract. The acceptance report `sources[]` separately contains `product.yaml`, `DESIGN.md`, `studio/seed/business.json`, and every path in `acceptance.designContractPaths`.

| Surface family         | Required decision                                         | Structured state              | Proof                              |
| ---------------------- | --------------------------------------------------------- | ----------------------------- | ---------------------------------- |
| App UI                 | Screen hierarchy, states, feedback, accessibility         | `surfaces.mobileApp`          | Running-app capture                |
| Onboarding             | Sequence, exits, value moment, permission timing          | Mobile screens and flows      | Complete first-run recording       |
| Landing and web funnel | Message hierarchy, mobile CTA, proof, responsive behavior | Landing pages and web funnels | Mobile and desktop render          |
| Store creative         | Screenshot story, truthful UI, locale and device plan     | App Store state               | Export board and store-size files  |
| Ads and lifecycle      | Hook, product visibility, claims, accessible delivery     | Marketing assets              | Rendered asset and source manifest |

## Design Worthiness

Apply the design-worthiness reference before engineering hardening. Mechanical checks verify tokens and contrast. A founder or owner may decide taste directly below, then bind that verdict to these exact bytes with `b2c approve --design-taste pass|fail`. When the current run carries `decision.design.taste.delegation: approved`, the independent design-system audit records its structured decision in `design/reviews/DESIGN_SYSTEM_REVIEW.md`; reducer-owned run-state and audit evidence supply its authority, identity, and exact binding. Keep this file producer-owned.

| Rule                 | Tier       | Result | Attestation                                                     |
| -------------------- | ---------- | ------ | --------------------------------------------------------------- |
| Hierarchy            | Attested   | Open   | Record a hierarchy note when two primaries share a proof frame. |
| Type and space scale | Mechanical | Open   | Frontmatter token steps are the allowlist.                      |
| Contrast             | Mechanical | Open   | WCAG AA is the floor.                                           |

## Taste Gate

This optional row records a direct founder or owner decision on local design direction. It becomes current only after the matching candidate-bound `b2c approve --design-taste` receipt. A delegated decision lives in the independent audit artifact under the explicit current-run delegation decision. Neither path authorizes publication, deployment, store submission, production release, spend, pricing, or legal terms.

| Reviewer                    | Decision authority                                      | Date                         | Surfaces reviewed                  | One-product stranger test                             | Copy-test                                                    | Verdict             |
| --------------------------- | ------------------------------------------------------- | ---------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------- |
| Record the founder or owner | Record founder direct decision or owner direct decision | Record an ISO date at review | Record proof paths and key screens | Record whether a stranger would recognize one product | Record whether we would rather competitors copy this version | Record pass or fail |

## Accessibility

- Meet the selected WCAG target for text and controls.
- Support Dynamic Type or the platform equivalent.
- Use the platform minimum target size.
- Preserve meaning without color, motion, sound, or haptics.
- Define focus order, labels, error announcements, and keyboard behavior for each flow.

## Implementation Rules

- Read this file before user-facing work.
- Read `studio/seed/business.json` for the exact screen, flow, and status map.
- Load only the component contracts referenced by the affected screens.
- Implement against the app's selected native adapter. Absence means unsupported; it does not mean planned.
- Update this file when global intent, tokens, or system rules change.
- Update structured state and any affected screen or flow spec in the same change.
- Regenerate `design/system/` tokens and `design/design-room.html` after an accepted change.
- Run the focused DESIGN.md, Design Room, component, routing, and token checks before handoff.

## Decision Log

| Date         | Decision                                           | Reason                               | State paths                              | Affected surfaces | Evidence     |
| ------------ | -------------------------------------------------- | ------------------------------------ | ---------------------------------------- | ----------------- | ------------ |
| Not recorded | Initial contract needs product-specific decisions. | The starter does not invent a brand. | `DESIGN.md`, `studio/seed/business.json` | All               | Not captured |
