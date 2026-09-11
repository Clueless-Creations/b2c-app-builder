# Onboarding ONB-16: canonical journey graph

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-16-journey-graph`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Draw the acquisition-specific journeys and converge them into one semantic onboarding state graph, marking each step's entry condition, owner/renderer, input/transition, canonical event, back/skip/close/resume behavior, and failure/next-step path — and mark where the acquisition promise, first effort, first value, engagement, account creation, paywall, purchase, activation, review eligibility, normal-product entry, and interruption budget each land on the graph. Resolve applicability from accepted product.yaml feature scopes and declared b2c.yaml monetization bindings when present: not selected, selected but unavailable, and unresolved stay different. Record first value, navigation/recovery, identity, accessibility, and the monetization boundary actually selected. When feature.commitment-funnel is required, record the Commitment Funnel in first-session order (welcome, quiz or goals, micro-commitment with a skip path, personalized insight, hard paywall) and Funnel Quality Metrics; when that feature is excluded or a non-goal, do not add a quiz or hard paywall to satisfy a gate; when the instance is absent, hold rather than treating the funnel as free or as selected. Keep that funnel in its recipe and reference.experience.commitment-funnel; do not silently select RevenueCat. Write the graph to product/onboarding/graph/ONB-16-journey-graph.md; check:onboarding-evidence-onb-16 rejects a stub packet.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-15-architecture-decision.md`, `product.yaml`, `b2c.yaml`, `b2c.json`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-16-journey-graph.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-16`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Design Evidence Stack](../../../../knowledge/design/design-evidence-stack.md) | before planning, creating, revising, auditing, or implementing any user-facing surface, component, interaction, onboarding flow, paywall, store frame, or marketing design; use it to classify the decision, select evidence sources, and record the evidence pass before mutation | `reference.design.design-evidence-stack` |
| [Commitment Funnel](../../../../knowledge/experience/commitment-funnel.md) | before first-session screen order; when product.yaml records feature.commitment-funnel as required and onboarding needs welcome, quiz, micro-commitment, personalized insight, hard paywall, and install-to-trial quality metrics | `reference.experience.commitment-funnel` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
