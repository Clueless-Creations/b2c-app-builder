# Onboarding ONB-18: visual design and prototype

<!-- Generated task skill. Edit catalog owners, then run render:task-skills. -->

Canonical workflow: `workflow.experience.onboarding-system.onb-18-visual-design-prototype`. This is a reference contract, not an executable plan. Managed eligibility, ordering, authority, and acceptance remain with the installed business runtime.

## Method

Author the high-fidelity onboarding design in DESIGN.md — Git owns revisions — then render the generated read-only Design Room for review; the Design Room is not a mutable design store or a second design authority. Produce an interactive prototype covering the happy path and critical branches on the shipping platforms recorded in studio/seed/business.json mobileApp.platforms and DESIGN.md accepted surfaces, plus small viewports, large text, and reduced motion on those selected surfaces, and run design QA against it. Do not fabricate captures for an unselected platform; a selected platform without a supported adapter is an explicit unsupported or missing-implementation hold, not assumed parity from a shared component contract; the host recipe target, including host/agent-cli, is not the consumer app's shipping scope. After DESIGN.md changes, regenerate the review page and renew affected proof — old screenshots do not certify new code. Record the design proof — with the inspectable artifact path, not just adjectives — in product/onboarding/graph/ONB-18-visual-design-prototype.md. Map each ONB-09 decision to rendered design evidence in the Foundation contract. Instrument the prototype now, not after implementation: capture fresh install, consent denial, unknown attribution and analytics-unavailable traces in product/onboarding/prototype-evidence.json; a static mockup or event-name list is insufficient. check:onboarding-evidence-onb-18 rejects a stub packet, and ONB-20's adversarial QA depends on this prototype actually existing.

## Inputs and outputs

For advisory work, use the evidence supplied and return findings. Do not create runtime state, prerequisite artifacts, or a whole business to satisfy these managed-workspace paths. Missing evidence remains explicit.

Managed inputs: `product/onboarding/graph/ONB-16-journey-graph.md`, `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-13-analytics-experiments.md`, `DESIGN.md`, `studio/seed/business.json`

Consult when relevant: None declared.

Managed outputs: `product/onboarding/graph/ONB-18-visual-design-prototype.md`, `product/onboarding/prototype-evidence.json`

## Verification and authority

Declared checks: `check:onboarding-evidence-onb-18`, `check:onboarding-foundations-prototype`

Additional founder decisions: None specific to this workflow; host permission boundaries still apply.

Run applicable checks with the installed builder's documented target arguments. Report unavailable or unrun checks honestly. A review report, generated file, or successful command does not by itself establish accepted runtime or provider evidence. Do not mark reducer state by hand.

## Select supporting knowledge

Load only the sections needed for the current task. Broad load-when wording does not override accepted scope or an explicit provider binding. Provider procedures are current only at the corresponding selected-provider action. Stop and report an unresolved required source rather than treating its title as delivered guidance.

| Reference | Load when | Stable identity |
| --- | --- | --- |
| [Analytics And Attribution](../../../../knowledge/data/analytics-attribution.md) | before onboarding, paywalls, funnels, store CTAs, referrals, lifecycle email, UGC/Fastlane campaigns, paid UA, or any builder prompt that names events; before PostHog setup, dashboards, deep links, feature flags, experiments, or session replay | `reference.data.analytics-attribution` |
| [Design Evidence Stack](../../../../knowledge/design/design-evidence-stack.md) | before planning, creating, revising, auditing, or implementing any user-facing surface, component, interaction, onboarding flow, paywall, store frame, or marketing design; use it to classify the decision, select evidence sources, and record the evidence pass before mutation | `reference.design.design-evidence-stack` |
| [Design Worthiness](../../../../knowledge/design/design-worthiness.md) | when DESIGN.md authoring or its generated Design Room review needs the mechanical worthiness floor or its independent audit must record the delegated taste decision before engineering harden, including native flow semantics and mechanical anti-generic consistency, with no beauty score | `reference.design.design-worthiness` |
| [Mobile Flow Craft](../../../../knowledge/design/mobile-flow-craft.md) | designing, implementing, or auditing a native mobile screen or flow; deciding navigation and presentation semantics; hardening native fidelity; defining motion; or preparing runtime design acceptance | `reference.design.mobile-flow-craft` |
| [Onboarding Conversion](../../../../knowledge/experience/onboarding-conversion.md) | before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | `reference.experience.onboarding-conversion` |
| [Research-backed onboarding with identity and measurement](../../../../knowledge/experience/onboarding-foundations.md) | Before onboarding research acceptance, identity and analytics decisions, design lock, prototype acceptance or final onboarding verification. | `reference.experience.onboarding-foundations` |
