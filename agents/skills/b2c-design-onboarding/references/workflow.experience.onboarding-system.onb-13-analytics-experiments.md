# Onboarding ONB-13: analytics and experiments

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-13-analytics-experiments`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Define a machine-readable, typed analytics schema — every event carrying event_id, version, time, source, platform, journey, identity, session, correlation, acquisition, consent, and deduplication semantics — naming the authoritative emitter (client, backend-confirmed, or provider-confirmed) per event, plus experiment assignment, exposure, and expected event sequences for the happy path and each major failure/edge case. Write the contract to product/onboarding/graph/ONB-13-analytics-experiments.md. Write the measurement Foundation contract: consent-aware initialization before the first event, typed event/schema and implementation/test paths, first/last-touch attribution, deep links and unknown joins, identity stitching, deduplication, exposure rules and negative scenarios. check:onboarding-evidence-onb-13 rejects a stub packet, and analytics failure must never block first value.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-09-evidence-join.md`, `product/onboarding/graph/ONB-10-first-value-activation.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`, `analytics/ANALYTICS.md`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-13-analytics-experiments.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-13`, `check:onboarding-foundations-measurement`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Analytics And Attribution](../../../../knowledge/data/analytics-attribution.md) | before onboarding, paywalls, funnels, store CTAs, referrals, lifecycle email, UGC/Fastlane campaigns, paid UA, or any builder prompt that names events; before PostHog setup, dashboards, deep links, feature flags, experiments, or session replay | `reference.data.analytics-attribution` |
| [PostHog Agent Tooling](../../../../knowledge/data/posthog-agent-tooling.md) | when the selected PostHog operation needs official agent setup, identity, instrumentation, or verification procedures | `reference.data.posthog-agent-tooling` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [Research-backed onboarding with identity and measurement](../../../../knowledge/experience/onboarding-foundations.md) | Before onboarding research acceptance, identity and analytics decisions, design lock, prototype acceptance or final onboarding verification. | `reference.experience.onboarding-foundations` |
