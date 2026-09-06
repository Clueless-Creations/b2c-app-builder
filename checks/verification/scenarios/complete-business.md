---
schemaVersion: 1
id: scenario.complete-business.1
frozenAt: 2026-09-05T00:00:00.000Z
status: criteria-frozen
gradingStatus: ungraded
designatedWorkspace: null
designAcceptanceGate:
  path: design/proofs/design-acceptance.json
  status: ungraded
  currentError: workspace_not_selected
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
    observation: Choose inspected category references for the selected product. Compare object clarity, interaction, and
      craft without copying scenes.
  - id: reference.design.design-acceptance
    kind: catalog
    path: knowledge/design/design-acceptance.md
    observation: Independent review binds judgments to the current candidate fingerprint. A missing report is incomplete,
      not a pass.
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
  - id: reference.operations.post-launch-operations
    kind: catalog
    path: knowledge/operations/post-launch-operations.md
    observation: An operating cycle needs observation, an authorized decision, verification, and later evidence.
  - id: reference.experience.experience-cards.recovery-and-trust-repair-card
    kind: catalog
    path: knowledge/experience/experience-cards.md
    observation: Support and recovery must restore trust after a real incident path.
criteria:
  - id: cb.craft.coherence
    family: craft
    condition: All selected product and acquisition surfaces share one product vocabulary for palette, type, labels, and spacing.
    evidence: Current candidate captures on every required surface. No unrelated template on a required screen.
    categoryReferenceIds:
      - reference.design.consumer-craft-benchmarks
    verdict: ungraded
  - id: cb.craft.originality
    family: craft
    condition: Original product objects explain the real job. No copied reference drawings or pasted mascot on generic controls.
    evidence: Side-by-side comparison of current captures against frozen reference observations.
    categoryReferenceIds:
      - reference.design.consumer-craft-benchmarks
    verdict: ungraded
  - id: cb.craft.execution
    family: craft
    condition: Required states show deliberate composition, clean edges, readable labels, and no generic filler.
    evidence: Current captures at the required resolutions and viewport sizes declared for each selected surface.
    categoryReferenceIds:
      - reference.design.premium-mobile-craft
    verdict: ungraded
  - id: cb.craft.functionality
    family: craft
    condition: Every authored interaction on the current candidate produces the specified result.
    evidence: Interaction receipts bound to the current source fingerprint. A still image is not enough.
    categoryReferenceIds:
      - reference.design.design-acceptance
    verdict: ungraded
  - id: cb.craft.accessibility
    family: craft
    condition: Essential information and actions remain available through appropriate labels, focus, contrast, and
      alternatives to gesture-only controls.
    evidence: Execute the accessibility modes required by each selected platform, including large text and keyboard where
      supported. Verify declared web fallback behavior when applicable.
    categoryReferenceIds:
      - reference.engineering.accessibility-readiness
    verdict: ungraded
  - id: cb.craft.motion
    family: craft
    condition: Motion explains state changes and completion when used. Reduced motion preserves the same actions.
    evidence: Default and reduced-motion interaction receipts for authored transitions, or a reviewed explanation when no
      motion is used.
    categoryReferenceIds:
      - reference.design.premium-mobile-craft
    verdict: ungraded
  - id: cb.craft.cross-surface
    family: craft
    condition: Selected product and acquisition surfaces share meaning, visual identity, and honest capability claims.
    evidence: One review that compares current captures from every selected surface.
    categoryReferenceIds:
      - reference.design.quality-lens
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
    condition: Each required empty state shows a true next action and is distinguishable from success or an error.
    evidence: Authored empty-state captures and interactions, or a product reason for exclusion.
    categoryReferenceIds:
      - reference.design.design-acceptance
    verdict: ungraded
  - id: cb.state.error
    family: state
    condition: Recoverable errors keep existing data and show a next action. They do not claim success.
    evidence: Execute failures at the actual persistence, network, and import boundaries used by the accepted product.
      Record excluded boundaries.
    categoryReferenceIds:
      - reference.design.design-acceptance
      - reference.experience.experience-cards.recovery-and-trust-repair-card
    verdict: ungraded
  - id: cb.state.offline
    family: state
    condition: When the product is offline-first, the core job still works with no network after load. Online-only products
      state the exclusion.
    evidence: Disconnected execution of the default job, or a written product exclusion.
    categoryReferenceIds:
      - reference.engineering.app-quality
      - reference.design.design-acceptance
    verdict: ungraded
  - id: cb.access.screen-reader
    family: access
    condition: A person can complete the core job with the screen reader supported on each selected platform.
    evidence: Current screen-reader interactions on the required devices or browser. Mobile acceptance requires
      physical-device execution; labels alone do not prove usability.
    categoryReferenceIds:
      - reference.engineering.accessibility-readiness
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
    condition: Accepted state persists as promised. Invalid input and failed writes preserve prior data and its defined
      recovery path.
    evidence: Exercise persistence and recovery paths actually supported by the product, including relaunch and restore
      where applicable.
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
    condition: When measurement is in product scope, exposure and activation join through declared identity. Unknown stays
      unknown.
    evidence: Metric-contract and observation proof after U16. Local counters do not establish an attribution join.
    categoryReferenceIds:
      - reference.data.analytics-attribution
    verdict: ungraded
  - id: cb.money.purchase-restore
    family: monetization
    condition: When purchase is in product scope, a real purchase and restore grant the same access the product promises.
    evidence: Sandbox or live payment proof under founder authority. A fixture receipt is not a live purchase.
    categoryReferenceIds:
      - reference.money.revenue-monetization
    verdict: ungraded
  - id: cb.money.entitlement-access
    family: monetization
    condition: When entitlements are in product scope, only authoritative readback grants paid access after purchase,
      restore, or loss.
    evidence: Provider readback on the current binding. A local boolean is not entitlement proof.
    categoryReferenceIds:
      - reference.money.revenue-monetization
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
    condition: A support or incident path runs through the public capability contract on a structurally different family
      before anyone claims API stability.
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
    applicability: ungraded
    blockedBy:
      - U7
      - U14
      - U15
      - U16
      - U22
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

Criteria are frozen.
No implementation is graded here.
This authoring contract applies to any selected consumer business.
Do not register it in `checks/verification/fixtures/scenarios.fixtures.ts`.

## Bind a business before grading

The shipped contract has no designated workspace. A grading run must bind a registered workspace ID, its root, accepted product scope, current composition digest, source revision, and artifact hashes. Derive monetization applicability from the accepted product; missing scope remains ungraded. A free product cannot establish purchase or restore quality for a monetized sibling.

Select category references and freeze a workspace craft rubric before producing the candidate. Preserve these criterion IDs. Add category-specific criteria without removing business responsibilities. The design report path is relative to the selected workspace. Its presence alone does not establish acceptance.

## Evidence and judgment

Each pass or fail requires a named independent reviewer and session ID, current evidence, and a reproducible observation. Not-applicable requires a product-scope reason. Unknown, missing, stale, or incomparable evidence stays ungraded. A screenshot shows appearance; it does not prove interaction, accessibility, purchase, retention, or operations.

Grade the four scenarios against the selected business: acquisition through return use; purchase, restore and access when applicable; support and recovery; and an operating cycle that invalidates changed downstream evidence. Preserve negative and inconclusive outcomes. A content hash proves bytes, not a runtime observation.

The source contract remains ungraded. Write results in the selected workspace, with a benchmark lead, independent auditor, current code and evidence references, category comparison, and remaining gaps. Before grading, verify the required dependency units are implemented for the selected composition.

## Authority

A benchmark grants no credentials, spend, store submission, or release authority. Use approved provider and device evidence where required.
