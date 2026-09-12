# Full launch closeout (definition of done)

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.orchestration.full-launch-closeout`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `state/business-state.json`, `operations/FOUNDER_BRIEF.md`, `operations/LAUNCH_PROGRAM.md`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `store/STORE_CONSOLE.md`, `product/copy/COPY_REVIEW.md`, `design/reviews/DESIGN_SYSTEM_REVIEW.md`

Consult when relevant: `growth/CRO_AUDIT.md`, `strategy/RED_TEAM_FINDINGS.md`, `LEGAL_REVIEW.md`, `growth/EMAIL_OPS.md`, `revenue/REVENUE_OPS.md`

Managed outputs: `LAUNCH.md`

## Verification and authority

Declared checks: `check:lane-coverage`, `check:orchestration`, `check:readiness-coverage`, `check:app-copy`, `check:design-acceptance`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Design Acceptance Evidence](../../../../knowledge/design/design-acceptance.md) | accepting complete native and landing design or repairing missing, stale, producer-unbound, incomplete, or independently rejected visual evidence | `reference.design.design-acceptance` |
| [Full Launch Program](../../../../knowledge/orchestration/full-launch-program.md) | a founder asks for a complete end-to-end consumer delivery (app, full web funnel, store packet, analytics, trust, revenue, growth) carried to Submit-for-Review ready; when opening, resuming, or closing workflow.orchestration.full-launch-program; when checking the definition of done | `reference.orchestration.full-launch-program` |
| [Isolated Review](../../../../knowledge/orchestration/isolated-review.md) | before dispatching any producer whose surface a second agent must accept, before dispatching an auditor node, when writing or checking the review ledger in operations/ORCHESTRATION.md, and when a review, rubric, or fix loop is contested | `reference.orchestration.isolated-review` |
| [Failure Cards](../../../../knowledge/process/failure-cards.md) | before readiness claims; after a repeated agent miss; when adding a validator or scenario | `reference.process.failure-cards` |
| [Launch Coverage](../../../../knowledge/process/launch-coverage.md) | "what else is missing", "launch readiness"; moving from planning to build or submission | `reference.process.launch-coverage` |
| [Store Console Workflow](../../../../knowledge/store/store-console-workflow.md) | before App Store Connect or Play Console setup, privacy labels/Data safety, screenshot capture/upload, reviewer notes, account-deletion console work, or any "where do I click and what do I paste" handoff | `reference.store.store-console-workflow` |
