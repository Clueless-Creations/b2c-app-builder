# Onboarding ONB-14: trust, lifecycle, and policy

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-14-trust-lifecycle-policy`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Define native-only review-request timing (eligibility may be earned early, but the request happens outside first-run onboarding, ungated by sentiment, with a remote kill switch), the permission-request and lifecycle orchestration strategy (request only after a user action with visible benefit; one strategy spanning onboarding recovery through win-back), and the privacy/security/accessibility policy behavior this flow must honor. Write the contract to product/onboarding/graph/ONB-14-trust-lifecycle-policy.md; check:onboarding-evidence-onb-14 rejects a stub packet.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-09-evidence-join.md`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-14`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
