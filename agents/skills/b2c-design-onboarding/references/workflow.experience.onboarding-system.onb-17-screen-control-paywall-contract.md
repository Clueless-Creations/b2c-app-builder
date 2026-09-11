# Onboarding ONB-17: screen, control, and paywall contract

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Specify every onboarding screen with a stable ID and exactly one dominant action, pulling on-screen copy by key from product/copy/COPY_DECK.md rather than inventing strings, and define every control's enable/validation rule, state mutation, and exact idempotent provider action, plus failure/recovery and accessibility/localization behavior per screen. Resolve applicability from accepted product.yaml feature scopes and declared b2c.yaml monetization bindings when present; a producer sentence that a bind is not applicable cannot override a required feature. Specify the paywall contract for the selected purchase and presentation owners, including restore, pending, expiry, cancellation, offline, truthful-offer, and entitlement behavior those owners declare — do not invent RevenueCat offerings or customVariables for an unselected presenter. When feature.paywall-goal-headline is required and the presenter can bind it, record the Paywall Goal Headline contract: quiz writes paywall_headline_key, templates live in RevenueCat offering metadata, customVariables bind the selected key, and a skipped goal uses the fallback template with no invented outcome; when that feature is excluded or a non-goal, omit that bind; when the instance is absent, hold. Write the contract to product/onboarding/graph/ONB-17-screen-control-paywall-contract.md; check:onboarding-evidence-onb-17 rejects a stub packet, and ONB-20's adversarial QA runs directly against this contract.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-16-journey-graph.md`, `product/copy/COPY_DECK.md`, `product.yaml`, `b2c.yaml`, `b2c.json`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-17`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Design Evidence Stack](../../../../knowledge/design/design-evidence-stack.md) | before planning, creating, revising, auditing, or implementing any user-facing surface, component, interaction, onboarding flow, paywall, store frame, or marketing design; use it to classify the decision, select evidence sources, and record the evidence pass before mutation | `reference.design.design-evidence-stack` |
| [Design Worthiness](../../../../knowledge/design/design-worthiness.md) | when DESIGN.md authoring or its generated Design Room review needs the mechanical worthiness floor or its independent audit must record the delegated taste decision before engineering harden, including native flow semantics and mechanical anti-generic consistency, with no beauty score | `reference.design.design-worthiness` |
| [Mobile Flow Craft](../../../../knowledge/design/mobile-flow-craft.md) | designing, implementing, or auditing a native mobile screen or flow; deciding navigation and presentation semantics; hardening native fidelity; defining motion; or preparing runtime design acceptance | `reference.design.mobile-flow-craft` |
| [Commitment Funnel](../../../../knowledge/experience/commitment-funnel.md) | before first-session screen order; when product.yaml records feature.commitment-funnel as required and onboarding needs welcome, quiz, micro-commitment, personalized insight, hard paywall, and install-to-trial quality metrics | `reference.experience.commitment-funnel` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [Paywall Goal Headline](../../../../knowledge/experience/paywall-goal-headline.md) | before paywall copy lock; when product.yaml records feature.paywall-goal-headline as required and the declared present-paywall owner can bind RevenueCat offering metadata | `reference.experience.paywall-goal-headline` |
