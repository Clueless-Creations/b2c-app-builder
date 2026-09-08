---
version: alpha
name: App Name
description: Provisional design contract. Replace its tokens after product research.
colors:
  background: "#ffffff"
  surface: "#f5f5f5"
  primary: "#1d1d1f"
  text: "#1d1d1f"
  muted: "#6e6e73"
  border: "#d2d2d7"
typography:
  display:
    fontFamily: Georgia
    fontWeight: "700"
    fontSize: 2rem
    lineHeight: 1.2
    letterSpacing: 0px
    nativeSize: 32
    nativeTracking: 0
    fallbacks: [serif]
    resourceId: system-display
  body:
    fontFamily: system-ui
    fontWeight: "400"
    fontSize: 1rem
    lineHeight: 1.5
    letterSpacing: 0px
    nativeSize: 16
    nativeTracking: 0
    fallbacks: [sans-serif]
    resourceId: system-body
foundation:
  version: 1
  communicationPriorities:
    - The next action and its consequence come before decorative explanation.
  identityInvariants:
    - Preserve the selected Anchor Brand Kit roles across app and acquisition surfaces.
  rationale:
    - decision: Begin with readable system resources until the product direction is selected.
      kind: legibility
      reason: A working fallback allows content and layout review without a font download.
  referenceInfluences: []
  typographyResources:
    - id: system-display
      family: Georgia
      mode: system
      source: Platform font availability; verify on selected targets.
      license: Platform supplied; no font bytes redistributed.
      scripts: [Latin]
      fallbacks: [serif]
      expansionTest: Pending implementation; inspect long headings, target scripts, and largest supported text setting.
    - id: system-body
      family: system-ui
      mode: system
      source: Platform default font; adapter resolves the native family.
      license: Platform supplied; no font bytes redistributed.
      scripts: [Latin]
      fallbacks: [sans-serif]
      expansionTest: Pending implementation; inspect localized body text and controls at largest supported text setting.
rounded:
  sm: 4px
  md: 8px
  lg: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components: {}
---

# App Name Design System

Status: provisional

This file is the design authority. The starting tokens make the file usable.
They are not an accepted visual direction.

## Overview

Define the product feeling, primary user goal, and one moment that must feel
exceptional. Add detailed flow or screen files only when the work needs them.

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

The frontmatter owns semantic colors. Replace the provisional neutral palette
after research. Preserve meaning without color alone.

## Typography

The frontmatter owns type roles. Select type for the audience, content, platform,
locales, and accessibility range.

## Layout

Define hierarchy, safe areas, responsive behavior, density, and the dominant
action for each screen. Recompose mobile layouts. Do not shrink desktop layouts.

## Elevation & Depth

Use depth only to explain containment, state, or hierarchy. Keep the rule native
to the selected platform.

## Shapes

Use the radius scale consistently across controls, cards, sheets, and dialogs.

## Components

Reuse platform-neutral component contracts. Map them to the selected native
stack. Do not create a universal widget layer.

Motion must explain state or hierarchy. Honor reduced-motion settings.

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

## Do's and Don'ts

- Do derive decisions from the accepted product and user evidence.
- Do define loading, empty, success, error, offline, and disabled states.
- Do use native platform behavior and accessible components.
- Don't select a style, stack, or component before the product needs it.
- Don't claim implementation or parity without native proof.

## Object Language

One product noun per object. The landing, onboarding, `product/copy/COPY_DECK.md`, and store copy use these nouns and no others. Fill this table from the object map before the Design Room; `check:audience-identity` fails a surface that uses a term listed under Do not use.

| Object      | Definition  | Allowed terms | Do not use  | Evidence     |
| ----------- | ----------- | ------------- | ----------- | ------------ |
| Not defined | Not defined | Not defined   | Not defined | Not captured |

## Source Ownership

`acceptance.designContractPaths` must list every linked `design/screens/*.md` and `design/flows/*.md` contract. The acceptance report `sources[]` separately contains `product.yaml`, `DESIGN.md`, `studio/seed/business.json`, and every path in `acceptance.designContractPaths`.

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
