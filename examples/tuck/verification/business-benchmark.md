---
schemaVersion: 1
id: scenario.complete-business.1
frozenAt: "2026-09-05T00:00:00.000Z"
status: criteria-frozen
gradingStatus: ungraded
designatedWorkspace:
  id: tuck
  path: examples/tuck
  monetizationInScope: false
designAcceptanceGate:
  path: examples/tuck/design/proofs/design-acceptance.json
  status: missing
  currentError: design_acceptance.report_coverage
  mayCiteAsPassing: false
requiredDependencyUnits:
  - U7
  - U14
  - U15
  - U16
  - U22
verdictSchema:
  allowedVerdicts:
    - ungraded
    - pass
    - fail
    - not-applicable
  passRequiresNamedReviewer: true
  failRequiresNamedReviewer: true
  notApplicableRequiresReason: true
  ungradedForbidsCompletionClaim: true
categoryReferences:
  - id: reference.design.consumer-craft-benchmarks
    kind: catalog
    path: knowledge/design/consumer-craft-benchmarks.md
    observation: Packing-planner quality uses transferable object clarity from Structured, grug, and Is This Seat Taken?. Do not copy their scenes.
  - id: reference.design.design-acceptance
    kind: catalog
    path: knowledge/design/design-acceptance.md
    observation: Independent review binds judgments to the current candidate fingerprint. A missing report is incomplete, not a pass.
  - id: reference.design.quality-lens
    kind: catalog
    path: knowledge/design/quality-lens.md
    observation: Freeze criteria before production. A strong average cannot hide a failed facet or missing surface.
  - id: reference.design.premium-mobile-craft
    kind: catalog
    path: knowledge/design/premium-mobile-craft.md
    observation: Native craft needs executed interaction, not a still image.
  - id: reference.engineering.accessibility-readiness
    kind: catalog
    path: knowledge/engineering/accessibility-readiness.md
    observation: Common tasks need VoiceOver or TalkBack on a physical device.
  - id: reference.engineering.app-quality
    kind: catalog
    path: knowledge/engineering/app-quality.md
    observation: Startup, jank, size, and offline behavior need measured proof.
  - id: reference.growth.cro-landing
    kind: catalog
    path: knowledge/growth/cro-landing.md
    observation: The landing must show a real first-value path the product supports today.
  - id: reference.experience.commitment-funnel
    kind: catalog
    path: knowledge/experience/commitment-funnel.md
    observation: Acquisition is a sequence from exposure to a kept promise, not a page screenshot.
  - id: reference.experience.onboarding-conversion
    kind: catalog
    path: knowledge/experience/onboarding-conversion.md
    observation: First value and return use stay separate from store or paywall claims.
  - id: reference.data.analytics-attribution
    kind: catalog
    path: knowledge/data/analytics-attribution.md
    observation: Attribution needs declared identity and exposure. Do not invent a cross-device join.
  - id: reference.money.revenue-monetization
    kind: catalog
    path: knowledge/money/revenue-monetization.md
    observation: Purchase and restore apply only when the accepted product includes monetization.
  - id: reference.money.revenuecat-and-store-products
    kind: catalog
    path: knowledge/money/revenuecat-and-store-products.md
    observation: Entitlement readback, not a local flag, grants paid access when purchase is in scope.
  - id: reference.operations.post-launch-operations
    kind: catalog
    path: knowledge/operations/post-launch-operations.md
    observation: An operating cycle needs observation, an authorized decision, verification, and later evidence.
  - id: reference.experience.experience-cards.recovery-and-trust-repair-card
    kind: catalog
    path: knowledge/experience/experience-cards.md
    observation: Support and recovery must restore trust after a real incident path.
  - id: rubric.tuck.craft.1
    kind: workspace-rubric
    path: examples/tuck/design/reviews/rubrics/tuck-craft.json
    observation: Tuck freezes seven craft facets. That rubric is not a whole-business grade.
  - id: reference.seat-visual
    kind: workspace-reference
    path: examples/tuck/design/reviews/rubrics/tuck-craft.json
    observation: Inspected Seat imagery transfers state clarity, not characters or palette.
  - id: reference.grug-mechanism
    kind: workspace-reference
    path: examples/tuck/design/reviews/rubrics/tuck-craft.json
    observation: One authored mechanism must reach controls and edge states.
  - id: reference.structured-hierarchy
    kind: workspace-reference
    path: examples/tuck/design/reviews/rubrics/tuck-craft.json
    observation: Title, supporting facts, and the next action stay readable together.
criteria:
  - id: cb.craft.coherence
    family: craft
    condition: Native and landing surfaces share one product vocabulary for palette, type, outline, labels, and spacing.
    evidence: Current candidate captures on every required surface. No unrelated template on a required screen.
    categoryReferenceIds:
      - reference.design.consumer-craft-benchmarks
      - rubric.tuck.craft.1
      - reference.grug-mechanism
    verdict: ungraded
  - id: cb.craft.originality
    family: craft
    condition: Original product objects explain the real job. No copied reference drawings or pasted mascot on generic controls.
    evidence: Side-by-side comparison of current captures against frozen reference observations.
    categoryReferenceIds:
      - reference.design.consumer-craft-benchmarks
      - reference.seat-visual
      - reference.grug-mechanism
    verdict: ungraded
  - id: cb.craft.execution
    family: craft
    condition: Required states show deliberate composition, clean edges, readable labels, and no generic filler.
    evidence: Native-resolution and both web-width captures of the current candidate.
    categoryReferenceIds:
      - reference.design.premium-mobile-craft
      - reference.structured-hierarchy
    verdict: ungraded
  - id: cb.craft.functionality
    family: craft
    condition: Every authored interaction on the current candidate produces the specified result.
    evidence: Interaction receipts bound to the current source fingerprint. A still image is not enough.
    categoryReferenceIds:
      - reference.design.design-acceptance
      - rubric.tuck.craft.1
    verdict: ungraded
  - id: cb.craft.accessibility
    family: craft
    condition: Essential information and actions remain available through labels, non-drag controls, focus, and contrast.
    evidence: Large-text, keyboard, and no-JavaScript execution on the current candidate.
    categoryReferenceIds:
      - reference.engineering.accessibility-readiness
      - reference.structured-hierarchy
    verdict: ungraded
  - id: cb.craft.motion
    family: craft
    condition: Motion explains pickup, placement, cancel, and completion. Reduced motion keeps every action.
    evidence: Default and reduced-motion interaction receipts. A still frame is not motion proof.
    categoryReferenceIds:
      - reference.design.premium-mobile-craft
      - reference.grug-mechanism
    verdict: ungraded
  - id: cb.craft.cross-surface
    family: craft
    condition: Native and landing captures share object meaning, palette relationship, and honest capability claims.
    evidence: One review that cites current native and landing captures together.
    categoryReferenceIds:
      - reference.design.quality-lens
      - reference.seat-visual
      - reference.structured-hierarchy
    verdict: ungraded
  - id: cb.loop.core-journey
    family: loop
    condition: A reviewer traces funnel exposure through first useful value on the named workspace's current code.
    evidence: Device or browser proof bound to the current artifact. Memory of a prior run is not evidence.
    categoryReferenceIds:
      - reference.experience.commitment-funnel
      - reference.experience.onboarding-conversion
    verdict: ungraded
  - id: cb.loop.activation-return
    family: loop
    condition: After first value, the same person can leave and return to a useful continued state.
    evidence: Relaunch or repeat-session interaction on the current candidate.
    categoryReferenceIds:
      - reference.experience.onboarding-conversion
      - reference.design.design-acceptance
    verdict: ungraded
  - id: cb.state.empty
    family: state
    condition: Each required empty state shows a true next action and does not look like a finished bag or a crash.
    evidence: Authored empty-state captures and interactions, or a product reason for exclusion.
    categoryReferenceIds:
      - reference.design.design-acceptance
      - reference.structured-hierarchy
    verdict: ungraded
  - id: cb.state.error
    family: state
    condition: Recoverable errors keep existing data and show a next action. They do not claim success.
    evidence: Failed save, failed import, and failed write execution on the current candidate.
    categoryReferenceIds:
      - reference.design.design-acceptance
      - reference.experience.experience-cards.recovery-and-trust-repair-card
    verdict: ungraded
  - id: cb.state.offline
    family: state
    condition: When the product is offline-first, the core job still works with no network after load. Online-only products state the exclusion.
    evidence: Disconnected execution of the default job, or a written product exclusion.
    categoryReferenceIds:
      - reference.engineering.app-quality
      - reference.design.design-acceptance
    verdict: ungraded
  - id: cb.access.screen-reader
    family: access
    condition: A person can complete the core job with VoiceOver or TalkBack on a physical device.
    evidence: Physical-device screen-reader captures and interactions. Simulator labels are not VoiceOver.
    categoryReferenceIds:
      - reference.engineering.accessibility-readiness
      - rubric.tuck.craft.1
    verdict: ungraded
  - id: cb.perf.responsiveness
    family: performance
    condition: Startup, interaction latency, and size stay inside an owned release envelope for the selected platforms.
    evidence: Named measurements from the current build. A smooth video is not a vital.
    categoryReferenceIds:
      - reference.engineering.app-quality
    verdict: ungraded
  - id: cb.data.integrity
    family: data
    condition: Accepted edits persist. Malformed import and failed save leave prior data intact and recoverable.
    evidence: Relaunch, export, import, backup, and restore on the current candidate.
    categoryReferenceIds:
      - reference.design.design-acceptance
      - reference.operations.post-launch-operations
    verdict: ungraded
  - id: cb.acquire.funnel
    family: acquisition
    condition: The landing or store path shows the real first-value action the current product supports.
    evidence: Browser or store proof of that path on the current artifact. No invented availability.
    categoryReferenceIds:
      - reference.growth.cro-landing
      - reference.experience.commitment-funnel
    verdict: ungraded
  - id: cb.acquire.attribution
    family: acquisition
    condition: When measurement is in product scope, exposure and activation join through declared identity. Unknown stays unknown.
    evidence: Metric-contract and observation proof after U16. Tuck local metrics do not claim a telemetry join.
    categoryReferenceIds:
      - reference.data.analytics-attribution
    verdict: ungraded
  - id: cb.money.purchase-restore
    family: monetization
    condition: When purchase is in product scope, a real purchase and restore grant the same access the product promises.
    evidence: Sandbox or live payment proof under founder authority. A fixture receipt is not a live purchase.
    categoryReferenceIds:
      - reference.money.revenue-monetization
      - reference.money.revenuecat-and-store-products
    verdict: ungraded
  - id: cb.money.entitlement-access
    family: monetization
    condition: When entitlements are in product scope, only authoritative readback grants paid access after purchase, restore, or loss.
    evidence: Provider readback on the current binding. A local boolean is not entitlement proof.
    categoryReferenceIds:
      - reference.money.revenuecat-and-store-products
    verdict: ungraded
  - id: cb.retain.return-use
    family: retention
    condition: A return visit can resume the core job without recreating first-value work the product already saved.
    evidence: Repeat-use interaction on the current candidate after a real gap or relaunch.
    categoryReferenceIds:
      - reference.experience.onboarding-conversion
      - reference.data.analytics-attribution
    verdict: ungraded
  - id: cb.support.incident-recovery
    family: support
    condition: A support or incident path runs through the public capability contract on a structurally different family before anyone claims API stability.
    evidence: Public-contract trace plus recovery evidence. This file does not grade that path.
    categoryReferenceIds:
      - reference.operations.post-launch-operations
      - reference.experience.experience-cards.recovery-and-trust-repair-card
    verdict: ungraded
  - id: cb.ops.artifact-invalidation
    family: operations
    condition: A changed deployed artifact invalidates the prior acceptance that depended on those bytes.
    evidence: Fingerprint mismatch after a real source or artifact change. Screenshots alone cannot keep the old pass.
    categoryReferenceIds:
      - reference.design.design-acceptance
      - reference.operations.post-launch-operations
    verdict: ungraded
  - id: cb.ops.improvement-cycle
    family: operations
    condition: One operating cycle records observation, authorized decision, improvement recipe, verification, and later evidence.
    evidence: A real cycle on the named workspace. Negative or inconclusive results stay valid. Fabricated observations do not.
    categoryReferenceIds:
      - reference.operations.post-launch-operations
    verdict: ungraded
scenarios:
  - id: cb.scenario.funnel-activation-return
    title: Funnel through activation and return use
    criterionIds:
      - cb.loop.core-journey
      - cb.loop.activation-return
      - cb.acquire.funnel
      - cb.retain.return-use
    applicability: ungraded
    blockedBy:
      - U7
      - U14
      - U15
      - U16
      - U22
  - id: cb.scenario.purchase-restore
    title: Purchase, restore, and correct access
    criterionIds:
      - cb.money.purchase-restore
      - cb.money.entitlement-access
    applicability: not-applicable
    notApplicableReason: >-
      Tuck accepted product scope excludes purchase, subscription, ad tracking,
      and payment providers. product.yaml complete_scope and metrics record those
      flows as not applicable. This unit does not add purchase to tuck.
    escalation: >-
      A second or different monetized workspace is an architecture-steward
      decision. Record it as an ADR in docs/decisions/. Do not create that
      workspace in this unit.
  - id: cb.scenario.support-recovery-contract
    title: Support and recovery through the public capability contract
    criterionIds:
      - cb.support.incident-recovery
    applicability: ungraded
    blockedBy:
      - U7
      - U14
      - U15
      - U16
      - U22
  - id: cb.scenario.operating-cycle-invalidation
    title: Artifact invalidation and one real operating cycle
    criterionIds:
      - cb.ops.artifact-invalidation
      - cb.ops.improvement-cycle
    applicability: ungraded
    blockedBy:
      - U7
      - U14
      - U15
      - U16
      - U22
---

# Complete consumer-business benchmark

This file freezes criterion IDs and the judgment schema for roadmap unit U18.
It is not a LaunchBench TypeScript scenario.
Do not register it in `checks/verification/fixtures/scenarios.fixtures.ts`.
It is not a passing grade of tuck or of any other workspace.

## Status

Criteria are frozen.
No implementation is graded here.
`gradingStatus` stays `ungraded` until U7, U14, U15, U16, and U22 close.
A later workspace report may use these IDs.
That report is not this file.

## Verdict schema

Each criterion uses `verdict`.
Each unit test scenario uses `applicability`.
Allowed values are `ungraded`, `pass`, `fail`, and `not-applicable`.

`pass` and `fail` need a named reviewer.
The reviewer record needs `name` and `sessionId`.
`not-applicable` needs a stated reason.
`ungraded` must not claim completion.

A content hash names bytes.
It does not prove a runtime observation.
Package conformance does not mark a business capability verified.

## Designated workspace

The current designated workspace is tuck at `examples/tuck`.
Tuck is an offline packing planner.
Accepted scope has no account, purchase, subscription, or payment provider.
Do not edit tuck product, design, app, web, or test files from this unit.
Do not distort tuck to fit a monetization checklist.

## Craft rubric audit

`design/reviews/rubrics/tuck-craft.json` freezes seven facets.
The facets are coherence, originality, craft, functionality, accessibility, motion, and cross-surface identity.
Those IDs match `reference.design.design-acceptance`.
Category references are Is This Seat Taken?, grug, and Structured.
They transfer state clarity and one authored mechanism.
They do not donate characters, palette, or a timeline.

The tuck rubric does not cover acquisition, attribution, monetization, retention, support, or release vitals as first-class IDs.
This file adds those IDs.
It does not replace the tuck rubric.
It does not grade the tuck rubric.

## Design acceptance gate

`examples/tuck/design/proofs/design-acceptance.json` is absent.
`check-design-acceptance.ts` reports `design_acceptance.report_coverage`.
Physical-iPhone VoiceOver evidence is still required after a report exists.
`tests/proof/tuck-local-test-proof.json` binds local native and landing tests.
That receipt is reusable.
It is not design acceptance.
Do not cite the missing report as a pass.

## Unit test scenarios

1. `cb.scenario.funnel-activation-return` stays ungraded.
   Grading needs a real journey on current workspace code after the dependency chain closes.
2. `cb.scenario.purchase-restore` is not-applicable for tuck.
   Accepted tuck scope excludes purchase and subscription.
   Propose a second monetized workspace only as a steward ADR.
   Do not create that workspace here.
3. `cb.scenario.support-recovery-contract` stays ungraded.
   It needs a structurally different family on the public capability contract.
4. `cb.scenario.operating-cycle-invalidation` stays ungraded.
   It needs a changed artifact and one real operating cycle.
   Negative or inconclusive results stay valid.

## Later report

A later `checks/verification/business-benchmark.md` in an assigned workspace may grade these IDs.
That report must name current code, current artifact, device or provider evidence, remaining gaps, and category comparison.
A named benchmark lead owns that report.
An independent auditor reviews it.
This unit does not author a passing copy of that report.

## Authority

This file grants no credentials, spend, store submission, or public release.
Live purchase evidence stays founder-owned when monetization enters scope.
Do not freeze-then-grade before U7, U14, U15, U16, and U22 close.
