# Onboarding ONB-02: evidence plan

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-02-evidence-plan`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Define the evidence hierarchy (rule, evidence, benchmark, observation, heuristic, hypothesis, or open question), the access constraints per source (e.g. authorized-only Onbo Hub access, no scraping), a sample plan per evidence node, and a freshness cutoff date beyond which a finding must be re-verified. Write the plan to product/onboarding/graph/ONB-02-evidence-plan.md so ONB-03 through ONB-08 collect against one shared standard instead of six competing ones; check:onboarding-evidence-onb-02 rejects a packet with no real plan.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-01-current-state-trace.md`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-02-evidence-plan.md`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-02`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
