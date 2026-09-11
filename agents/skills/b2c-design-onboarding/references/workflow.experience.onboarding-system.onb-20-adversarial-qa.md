# Onboarding ONB-20: adversarial QA

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-20-adversarial-qa`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Run the synthetic one-star pre-mortem (privacy, permission, poor result, slow network, trial, subscriber, restore, web purchase, accessibility, identity, or subscription-aversion scenarios, each with root cause, likelihood/severity, mitigation, test, and remaining risk) plus a policy review, instrumentation QA, accessibility review, and provider-realism review against the actual ONB-17 contract, ONB-18 prototype, and ONB-19 cutover plan — assume the flow fails before crediting that it works. Use a fresh reviewer session, inspect the prototype event traces and source hashes, and reject missing first-session instrumentation or untested identity/consent boundaries. Write findings to product/onboarding/graph/ONB-20-adversarial-qa.md; check:onboarding-evidence-onb-20 rejects a stub packet, and an unresolved high-severity finding must not be waved through to ONB-21's implementation plan.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`, `product/onboarding/graph/ONB-18-visual-design-prototype.md`, `product/onboarding/graph/ONB-19-implementation-cutover-contract.md`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-20-adversarial-qa.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-20`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Analytics And Attribution](../../../../knowledge/data/analytics-attribution.md) | before onboarding, paywalls, funnels, store CTAs, referrals, lifecycle email, UGC/Fastlane campaigns, paid UA, or any builder prompt that names events; before PostHog setup, dashboards, deep links, feature flags, experiments, or session replay | `reference.data.analytics-attribution` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [Research-backed onboarding with identity and measurement](../../../../knowledge/experience/onboarding-foundations.md) | Before onboarding research acceptance, identity and analytics decisions, design lock, prototype acceptance or final onboarding verification. | `reference.experience.onboarding-foundations` |
| [Isolated Review](../../../../knowledge/orchestration/isolated-review.md) | before dispatching any producer whose surface a second agent must accept, before dispatching an auditor node, when writing or checking the review ledger in operations/ORCHESTRATION.md, and when a review, rubric, or fix loop is contested | `reference.orchestration.isolated-review` |
