# Onboarding ONB-07: provider and policy landscape

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-07-provider-policy-landscape`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Refresh the current RevenueCat/billing surface (SDKs, offerings, entitlements, paywalls, experiments, pending purchases, restore) and PostHog, App Store Connect, and Google Play capability and policy facts by region, recording a technically-possible/policy-permitted distinction, enrollment/disclosure/fee/reporting detail, and a revalidation date for each. Write the findings to product/onboarding/graph/ONB-07-provider-policy-landscape.md; check:onboarding-evidence-onb-07 rejects a stub packet, and stale provider facts here propagate directly into ONB-12's state contract and ONB-17's paywall contract.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-02-evidence-plan.md`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-07-provider-policy-landscape.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-07`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [PostHog Agent Tooling](../../../../knowledge/data/posthog-agent-tooling.md) | when the selected PostHog operation needs official agent setup, identity, instrumentation, or verification procedures | `reference.data.posthog-agent-tooling` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [RevenueCat Agent Tooling](../../../../knowledge/money/revenuecat-agent-tooling.md) | when the selected RevenueCat operation needs official agent setup, identity, instrumentation, or verification procedures | `reference.money.revenuecat-agent-tooling` |
