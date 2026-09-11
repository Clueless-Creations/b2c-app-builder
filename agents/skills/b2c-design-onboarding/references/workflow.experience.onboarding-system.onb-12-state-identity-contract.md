# Onboarding ONB-12: state and identity contract

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-12-state-identity-contract`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Define the canonical state model keeping identity, onboarding journey, profile completeness, activation, entitlement, experiment assignment/exposure, review eligibility, permission/consent, and lifecycle state as distinct machines, each with its authoritative owner, persistence/event contract, and idempotency/retry/recovery behavior — grounded in the current RevenueCat entitlement and identity model from ONB-07. Write the contract to product/onboarding/graph/ONB-12-state-identity-contract.md. Write its Foundation contract with explicit auth timing, verified-session rules, anonymous continuity, secure credential storage, account isolation, logout, deletion, and restore. Auth success never grants an entitlement. check:onboarding-evidence-onb-12 rejects a stub packet.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-09-evidence-join.md`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-12-state-identity-contract.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-12`, `check:onboarding-foundations-identity`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Analytics And Attribution](../../../../knowledge/data/analytics-attribution.md) | before onboarding, paywalls, funnels, store CTAs, referrals, lifecycle email, UGC/Fastlane campaigns, paid UA, or any builder prompt that names events; before PostHog setup, dashboards, deep links, feature flags, experiments, or session replay | `reference.data.analytics-attribution` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [Research-backed onboarding with identity and measurement](../../../../knowledge/experience/onboarding-foundations.md) | Before onboarding research acceptance, identity and analytics decisions, design lock, prototype acceptance or final onboarding verification. | `reference.experience.onboarding-foundations` |
| [RevenueCat Agent Tooling](../../../../knowledge/money/revenuecat-agent-tooling.md) | when the selected RevenueCat operation needs official agent setup, identity, instrumentation, or verification procedures | `reference.money.revenuecat-agent-tooling` |
