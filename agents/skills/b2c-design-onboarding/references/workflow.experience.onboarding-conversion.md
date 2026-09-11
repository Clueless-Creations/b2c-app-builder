# Onboarding ONB-22: execute, cut over, and verify

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-conversion`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Execute ONB-21's Compound Engineering task list for real (implementation, review, tests, and provider validation), then assemble the canonical product/ONBOARDING.md by transcribing every ONB-00 through ONB-21 packet into its matching section, and mark every ONB-00 through ONB-22 row in the Graph Run table done with exactly one row per node. Only after the founder approves the hard cutover, delete the replaced runtime and transformation tooling per ONB-19's Removal Inventory, and mark a row's Disposition delete only once that artifact is actually gone from the repository — check:onboarding-cutover-repository verifies every claimed deletion against real filesystem state, not prose. Confirm RevenueCat and PostHog readiness against operations/PROVIDER_PROOF.md before claiming provider rows ready, produce product/onboarding/runtime-evidence.json for every applicable ONB-13 scenario with current schema, initialization, emitter and test source hashes, actual event sequences, collector readback and execution evidence, then re-render product/onboarding.html to match. Local trace fixtures never prove live delivery. check:onboarding-graph-complete, check:onboarding-page-fresh, check:onboarding-cutover-repository, and check:provider-proof-onboarding all gate this node, and none of them can be satisfied by prose alone.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-00-resume-scope.md`, `product/onboarding/graph/ONB-01-current-state-trace.md`, `product/onboarding/graph/ONB-02-evidence-plan.md`, `product/onboarding/graph/ONB-03-current-guidance.md`, `product/onboarding/graph/ONB-04-competitor-reviews.md`, `product/onboarding/graph/ONB-05-onbo-hub-atlas.md`, `product/onboarding/graph/ONB-06-internal-guidance-audit.md`, `product/onboarding/graph/ONB-07-provider-policy-landscape.md`, `product/onboarding/graph/ONB-08-motion-research.md`, `product/onboarding/graph/ONB-09-evidence-join.md`, `product/onboarding/graph/ONB-10-first-value-activation.md`, `product/onboarding/graph/ONB-11-effort-question-audit.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-13-analytics-experiments.md`, `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`, `product/onboarding/graph/ONB-15-architecture-decision.md`, `product/onboarding/graph/ONB-16-journey-graph.md`, `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`, `product/onboarding/graph/ONB-18-visual-design-prototype.md`, `product/onboarding/graph/ONB-19-implementation-cutover-contract.md`, `product/onboarding/graph/ONB-20-adversarial-qa.md`, `product/onboarding/graph/ONB-21-compound-engineering-plan.md`, `product/copy/COPY_DECK.md`, `operations/PROVIDER_PROOF.md`

Consult when relevant: None declared.

Managed outputs: `product/ONBOARDING.md`, `product/onboarding.html`, `product/onboarding/runtime-evidence.json`

## Verification and authority

Declared checks: `check:onboarding-graph-complete`, `check:onboarding-page-fresh`, `check:onboarding-cutover-repository-complete`, `check:provider-proof-onboarding`, `check:onboarding-foundations-runtime`

Additional founder decisions: approve the hard cutover and replaced runtime deletion

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Analytics And Attribution](../../../../knowledge/data/analytics-attribution.md) | before onboarding, paywalls, funnels, store CTAs, referrals, lifecycle email, UGC/Fastlane campaigns, paid UA, or any builder prompt that names events; before PostHog setup, dashboards, deep links, feature flags, experiments, or session replay | `reference.data.analytics-attribution` |
| [Commitment Funnel](../../../../knowledge/experience/commitment-funnel.md) | before first-session screen order; when product.yaml records feature.commitment-funnel as required and onboarding needs welcome, quiz, micro-commitment, personalized insight, hard paywall, and install-to-trial quality metrics | `reference.experience.commitment-funnel` |
| [Eleven-Star Experience](../../../../knowledge/experience/eleven-star-experience.md) | before PRODUCT.md, DESIGN.md, onboarding, ads, store screenshots, content assets, or engineering plans are treated as ready; on "11-star run"/"11-star pass" — follow the reference's 11-Star Run Protocol before any other output | `reference.experience.eleven-star-experience` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [Research-backed onboarding with identity and measurement](../../../../knowledge/experience/onboarding-foundations.md) | Before onboarding research acceptance, identity and analytics decisions, design lock, prototype acceptance or final onboarding verification. | `reference.experience.onboarding-foundations` |
| [Paywall Goal Headline](../../../../knowledge/experience/paywall-goal-headline.md) | before paywall copy lock; when product.yaml records feature.paywall-goal-headline as required and the declared present-paywall owner can bind RevenueCat offering metadata | `reference.experience.paywall-goal-headline` |
| [Push Notification Lifecycle](../../../../knowledge/experience/push-notification-lifecycle.md) | before push permission priming, opt-in timing, or notification lifecycle design; for transactional and lifecycle email mechanics load operations/resend-email-ops.md instead | `reference.experience.push-notification-lifecycle` |
| [Consumer Copy Benchmarks](../../../../knowledge/words/consumer-copy-benchmarks.md) | when any surface a user reads is authored or reviewed — landing, store listing, screenshot captions, paywall, onboarding, lifecycle email, share text — and when a new app's voice is established in COPY_BRIEF.md / BRAND.md (the Voice benchmarks section writes from this file's method) | `reference.words.consumer-copy-benchmarks` |
| [Conversion Copy](../../../../knowledge/words/conversion-copy.md) | before writing any words a user reads: conversion copy (hero/CTA, store, paywall) and every in-app string (buttons, empty states, errors, settings); and l10n readiness | `reference.words.conversion-copy` |
