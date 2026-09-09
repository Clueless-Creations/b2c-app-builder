<!-- catalog-generated:start node-contracts -->
# Node Contracts

Generated from catalog/workflows and adapters/provisioning/requirements.ts. Edit the catalog, not this file.

One entry per workflow node: what it consumes (Reads blocks readiness; Consults is open-if-present),
what it produces, the knowledge bound to it, and the providers it touches with the access routes each
provider declares. The chosen route for a running business lives in state, not here.

## Running The Launch

### Provider-proof verification

_Before marking any provider-backed lane (analytics/revenue/email/store/security/eng) succeeded_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** `provider.posthog` (api, browser), `provider.revenuecat` (api, browser), `provider.resend` (api, browser), `provider.app-store-connect` (cli, api, browser)
- **Reads:** `state/business-state.json`
- **Consults:** `operations/PROVIDER_PROOF.md`
- **Produces:** `operations/PROVIDER_PROOF.md`
- **Gates:** `check:provider-proof`
- **Knowledge:** [Launch Coverage](../../knowledge/process/launch-coverage.md), [Provider Contracts](../../knowledge/process/provider-contracts.md), [Provider Proof](../../knowledge/process/provider-proof.md)

### Change cascade

_When DESIGN.md is accepted, and after each app, product, copy, brand, pricing, product, or data change_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `state/business-state.json`, `state/LAUNCH_TRACE.md`, `DESIGN.md`, `engineering/SOURCE_CHANGE_MANIFEST.json`
- **Consults:** —
- **Produces:** `state/CHANGE_CASCADE_RECEIPT.json`
- **Gates:** —
- **Knowledge:** [Cascade Edges](../../knowledge/process/cascade-edges.yaml), [Change Cascade](../../knowledge/process/change-cascade.md), [Flow Traceability](../../knowledge/process/flow-traceability.md)

### Launch trace & build contracts

_Crossing research → product/design/build; deciding if engineering/TECH_SPEC.md is needed_

- **Role:** Product leader
- **Phases:** 1f
- **Providers:** —
- **Reads:** `strategy/RESEARCH.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `state/LAUNCH_TRACE.md`, `engineering/TECH_SPEC.md`
- **Gates:** —
- **Knowledge:** [Artifact Contracts](../../knowledge/process/artifact-contracts.md), [Flow Traceability](../../knowledge/process/flow-traceability.md), [Launch Coverage](../../knowledge/process/launch-coverage.md)

### LaunchBench / failure-cards / coverage audit

_Before any launch-readiness claim, after a repeated miss, or adding a validator/scenario_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `state/business-state.json`, `engineering/PRODUCTION_READINESS.md`
- **Consults:** `operations/FAILURE_CARDS.md`
- **Produces:** `operations/FAILURE_CARDS.md`, `LAUNCHBENCH.md`
- **Gates:** `launchbench:lint`
- **Knowledge:** [Artifact Contracts](../../knowledge/process/artifact-contracts.md), [Failure Cards](../../knowledge/process/failure-cards.md), [Launch Coverage](../../knowledge/process/launch-coverage.md)

### Compile the repository profile contract

_Selecting the repository kind for a workspace, or compiling its artifact and validator contract_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** —
- **Produces:** `state/generated/requirement-inventory.json`, `state/generated/requirement-inventory.md`
- **Gates:** —
- **Knowledge:** [Repository Profiles](../../knowledge/process/repository-profiles.md)

## Driving The Work

### Session continuity / resume

_New session, resume, status check, or handoff on an existing launch_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** `AGENTS.md`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `operations/FAILURE_CARDS.md`
- **Produces:** —
- **Gates:** `check:continuity-contract`
- **Knowledge:** [Full Launch Program](../../knowledge/orchestration/full-launch-program.md), [Parallel Agent Orchestration](../../knowledge/orchestration/parallel-agent-orchestration.md), [Project State](../../knowledge/orchestration/project-state.md)

### Orient, scaffold & durable state upkeep

_"Launch this app" / broad launch request; any lane/provider/proof/blocker status change_

- **Role:** Orchestrator
- **Phases:** 0
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`
- **Produces:** —
- **Gates:** `check:product-md`
- **Knowledge:** [Dynamic Workflows](../../knowledge/orchestration/dynamic-workflows.md), [Project State](../../knowledge/orchestration/project-state.md), [Artifact Contracts](../../knowledge/process/artifact-contracts.md), [Current Truth](../../knowledge/process/current-truth.md), [Launch Phases](../../knowledge/process/launch-phases.md), [Tool Recipes](../../knowledge/process/tool-recipes.md)

### Full launch program (entry)

_Founder asks for a complete end-to-end consumer delivery — app, full web funnel, store packet, analytics, trust, revenue, and growth artifacts — carried to Submit-for-Review ready with isolated review on every surface_

- **Role:** Orchestrator
- **Phases:** 0
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** `PRODUCT.md`, `DESIGN.md`, `operations/ORCHESTRATION.md`, `strategy/TOOL_DECISIONS.md`, `operations/BUSINESS_ACCESS.md`
- **Produces:** `operations/LAUNCH_PROGRAM.md`
- **Gates:** `check:orchestration`
- **Knowledge:** [Consumer Craft Benchmarks](../../knowledge/design/consumer-craft-benchmarks.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [Paid Tool Routing](../../knowledge/operations/paid-tool-routing.md), [Full Launch Program](../../knowledge/orchestration/full-launch-program.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [Parallel Agent Orchestration](../../knowledge/orchestration/parallel-agent-orchestration.md), [Launch Coverage](../../knowledge/process/launch-coverage.md)

### Full launch closeout (definition of done)

_Every store, trust, engineering, and growth terminal node has succeeded and the founder wants the Submit-for-Review handoff_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `state/business-state.json`, `operations/LAUNCH_PROGRAM.md`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `store/STORE_CONSOLE.md`, `product/copy/COPY_REVIEW.md`, `design/reviews/DESIGN_SYSTEM_REVIEW.md`
- **Consults:** `growth/CRO_AUDIT.md`, `strategy/RED_TEAM_FINDINGS.md`, `LEGAL_REVIEW.md`, `growth/EMAIL_OPS.md`, `revenue/REVENUE_OPS.md`
- **Produces:** `LAUNCH.md`
- **Gates:** `check:lane-coverage`, `check:orchestration`, `check:readiness-coverage`, `check:app-copy`, `check:design-acceptance`
- **Knowledge:** [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Full Launch Program](../../knowledge/orchestration/full-launch-program.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [Failure Cards](../../knowledge/process/failure-cards.md), [Launch Coverage](../../knowledge/process/launch-coverage.md), [Store Console Workflow](../../knowledge/store/store-console-workflow.md)

## Running The Business

### Paid-tool routing & fallback

_Before using or replacing any paid/account-gated tool, or before a free fallback_

- **Role:** Operator readiness
- **Phases:** 0b
- **Providers:** `provider.doppler` (cli, browser)
- **Reads:** `state/business-state.json`
- **Consults:** `strategy/TOOL_DECISIONS.md`
- **Produces:** `strategy/TOOL_DECISIONS.md`
- **Gates:** `check:paid-tool-intake-required`
- **Knowledge:** [Paid Tool Routing](../../knowledge/operations/paid-tool-routing.md)

### Live App Store portfolio observe

_Before research-backed-spec on a complete-business or full-launch start; whenever Apple team or API auth changes_

- **Role:** Operator readiness
- **Phases:** 0
- **Providers:** —
- **Reads:** `operations/business-access.json`
- **Consults:** `operations/BUSINESS_ACCESS.md`
- **Produces:** `run/app-store-portfolio.json`
- **Gates:** `check:app-store-portfolio-required`
- **Knowledge:** [Artifact Contracts](../../knowledge/process/artifact-contracts.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md)

### Secrets baseline & routing

_Before any new secret, key, token, env var, webhook secret, or .env_

- **Role:** Engineering leader
- **Phases:** 0c
- **Providers:** `provider.doppler` (cli, browser)
- **Reads:** `strategy/TOOL_DECISIONS.md`, `state/business-state.json`
- **Consults:** `trust/secrets/SECRETS.md`
- **Produces:** `trust/secrets/SECRETS.md`
- **Gates:** `check:secrets`
- **Knowledge:** [Doppler Organization Across A Portfolio](../../knowledge/operations/doppler-organization.md), [Provider State Recipes](../../knowledge/operations/provider-state-recipes.md), [Secrets Management](../../knowledge/operations/secrets-management.md), [Secrets And Environment](../../knowledge/process/tool-recipes/secrets-and-environment.md)

### Resend email ops

_Before Resend domains/keys, transactional/lifecycle/broadcast email, deliverability_

- **Role:** Customer success
- **Phases:** 4, 6
- **Providers:** `provider.resend` (api, browser)
- **Reads:** `DESIGN.md`, `analytics/ANALYTICS.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `growth/resend/email-templates.ts`
- **Consults:** —
- **Produces:** `growth/EMAIL_OPS.md`
- **Gates:** `check:email`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Resend Email Ops](../../knowledge/operations/resend-email-ops.md), [Revenue Email Analytics](../../knowledge/process/tool-recipes/revenue-email-analytics.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Post-launch operations

_App live (phase_6/6b), "what now", weekly ops, incident response, retention reviews_

- **Role:** Orchestrator
- **Phases:** 6b
- **Providers:** —
- **Reads:** `state/business-state.json`, `operations/SUPPORT_OPS.md`, `operations/RETENTION_OPS.md`, `operations/FINANCE_OPS.md`
- **Consults:** `operations/POST_LAUNCH_OPS.md`, `operations/LAUNCH_RETRO.md`, `growth/PAID_UA.md`
- **Produces:** `operations/POST_LAUNCH_OPS.md`, `operations/LAUNCH_RETRO.md`
- **Gates:** `check:post-launch`
- **Knowledge:** [Paid User Acquisition](../../knowledge/growth/paid-user-acquisition.md), [Billing Health And Reactivation](../../knowledge/money/billing-health-and-reactivation.md), [Post-Launch Operations](../../knowledge/operations/post-launch-operations.md), [Change Cascade](../../knowledge/process/change-cascade.md), [Distribution, Offer, And Signal Validation](../../knowledge/research/distribution-offer-signal.md), [ASO Apple Keyword Evidence](../../knowledge/store/aso-apple-keyword-evidence.md), [ASO Store Ops](../../knowledge/store/aso-store-ops.md)

### Support queue operations

_App live: the recurring support sweep; an inbox, review queue, or refund/restore request needing a worked answer_

- **Role:** Customer success
- **Phases:** 6b
- **Providers:** `provider.resend` (api, browser)
- **Reads:** `state/business-state.json`
- **Consults:** `operations/POST_LAUNCH_OPS.md`
- **Produces:** `operations/SUPPORT_OPS.md`
- **Gates:** `check:post-launch`
- **Knowledge:** [Post-Launch Operations](../../knowledge/operations/post-launch-operations.md)

### Retention intervention

_App live: the recurring retention pass; a cohort drop, involuntary-churn spike, or cancellation trend needing a worked response_

- **Role:** Customer success
- **Phases:** 6b
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** `operations/POST_LAUNCH_OPS.md`
- **Produces:** `operations/RETENTION_OPS.md`
- **Gates:** `check:post-launch`
- **Knowledge:** [Billing Health And Reactivation](../../knowledge/money/billing-health-and-reactivation.md), [Post-Launch Operations](../../knowledge/operations/post-launch-operations.md)

### Financial health review

_App live: the recurring financial pulse; a spend change, refund spike, or runway question_

- **Role:** Orchestrator
- **Phases:** 6b
- **Providers:** `provider.revenuecat` (api, browser)
- **Reads:** `state/business-state.json`
- **Consults:** `operations/POST_LAUNCH_OPS.md`, `growth/PAID_UA.md`
- **Produces:** `operations/FINANCE_OPS.md`
- **Gates:** `check:post-launch`
- **Knowledge:** [Post-Launch Operations](../../knowledge/operations/post-launch-operations.md)

### Scheduled autonomy installation

_Business live and the founder wants the operating rhythm to run without anyone starting sessions by hand; changing or removing that schedule_

- **Role:** Orchestrator
- **Phases:** 6b
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** `operations/POST_LAUNCH_OPS.md`
- **Produces:** `operations/SCHEDULE.md`
- **Gates:** —
- **Knowledge:** [Post-Launch Operations](../../knowledge/operations/post-launch-operations.md)

### Founder-zero operator bootstrap

_After an accepted product enters the durable runtime; required before authenticated providers, standing authority, spend, public actions, or releases_

- **Role:** Operator readiness
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `state/business-state.json`
- **Consults:** `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`
- **Produces:** `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`
- **Gates:** `check:founder-operator`
- **Knowledge:** [Autonomy Onboarding](../../knowledge/operations/autonomy-onboarding.md), [Founder-Zero Operator](../../knowledge/operations/founder-zero-operator.md), [Frontier Agent Operations](../../knowledge/operations/frontier-agent-operations.md), [Secrets Management](../../knowledge/operations/secrets-management.md)

### Agent operations ledger

_Before any authenticated browser/API/CLI/native action on a provider, social, or store account_

- **Role:** Operator readiness
- **Phases:** Cross-phase (always-on)
- **Providers:** `provider.doppler` (cli, browser), `provider.app-store-connect` (cli, api, browser), `provider.google-play` (api, browser), `provider.posthog` (api, browser), `provider.revenuecat` (api, browser), `provider.stripe` (api, cli, browser), `provider.resend` (api, browser), `provider.app-store-screenshots` (skill_pack), `provider.higgsfield` (mcp), `provider.mobai` (mcp, cli), `provider.in-app-ios-simulator` (native_device), `provider.codex-native-ios` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts), `provider.snapshot-previews` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts), `provider.serve-sim` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts), `provider.aso-skills` (skill_pack), `provider.refero` (api), `provider.security-review` (cli, manual), `provider.sentry` (api, cli, browser), `provider.paid-ad-channels` (manual)
- **Reads:** `state/business-state.json`
- **Consults:** `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `operations/PROVIDER_PROOF.md`
- **Produces:** `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`
- **Gates:** `check:agent-operations`
- **Knowledge:** [Founder-Zero Operator](../../knowledge/operations/founder-zero-operator.md), [Frontier Agent Operations](../../knowledge/operations/frontier-agent-operations.md), [Secrets Management](../../knowledge/operations/secrets-management.md), [Current Truth](../../knowledge/process/current-truth.md)

## Market Research

### Consumer app opportunity and product research

_New consumer app or idea; validate, define, design, or build an app; choose an opportunity and build end-to-end without involvement when the user has no idea and delegates product selection; or gather category economics, competitor, review, keyword, or name-collision evidence. Founder phrasing: is this idea worth building, or a waste of months._

- **Role:** Research strategist
- **Phases:** 1
- **Providers:** —
- **Reads:** `product.yaml`
- **Consults:** —
- **Produces:** `strategy/RESEARCH.md`, `strategy/SIGNAL_CORPUS.md`, `strategy/OFFER_TEST.md`, `product.yaml`, `PRODUCT.md`
- **Gates:** `check:research-workflow-output`
- **Knowledge:** [Consumer Craft Benchmarks](../../knowledge/design/consumer-craft-benchmarks.md), [Design Worthiness](../../knowledge/design/design-worthiness.md), [iOS Consumer Playbook Intake](../../knowledge/growth/ios-consumer-playbook-intake.md), [Offer And Pricing Decisions](../../knowledge/money/offer-and-pricing-decisions.md), [Artifact Contracts](../../knowledge/process/artifact-contracts.md), [Research Intelligence](../../knowledge/process/tool-recipes/research-intelligence.md), [Core Loop And Complete Product Scope](../../knowledge/product/core-loop-and-complete-scope.md), [Product Moat](../../knowledge/product/product-moat.md), [Distribution-First Niche](../../knowledge/research/distribution-first-niche.md), [Distribution, Offer, And Signal Validation](../../knowledge/research/distribution-offer-signal.md), [Go, Pivot, Or Kill: The Pre-Build Research Verdict](../../knowledge/research/go-pivot-or-kill.md), [Transformation Demo](../../knowledge/research/transformation-demo.md)

### Spec red team (isolated audit)

_After research-backed-spec produces a kept spec and before the founder records Go, Pivot, or Kill; again when the spec changes materially_

- **Role:** Research strategist
- **Phases:** 1
- **Providers:** —
- **Reads:** `strategy/RESEARCH.md`, `strategy/SIGNAL_CORPUS.md`, `strategy/OFFER_TEST.md`, `product.yaml`, `PRODUCT.md`
- **Consults:** —
- **Produces:** `strategy/RED_TEAM_FINDINGS.md`
- **Gates:** —
- **Knowledge:** [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [Offer And Pricing Decisions](../../knowledge/money/offer-and-pricing-decisions.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [Core Loop And Complete Product Scope](../../knowledge/product/core-loop-and-complete-scope.md), [Distribution-First Niche](../../knowledge/research/distribution-first-niche.md), [Distribution, Offer, And Signal Validation](../../knowledge/research/distribution-offer-signal.md), [Go, Pivot, Or Kill: The Pre-Build Research Verdict](../../knowledge/research/go-pivot-or-kill.md)

### Localization market research

_Before localizing any surface or choosing locales_

- **Role:** Research strategist
- **Phases:** 1
- **Providers:** `provider.aso-skills` (skill_pack)
- **Reads:** `state/business-state.json`
- **Consults:** —
- **Produces:** `strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md`
- **Gates:** `check:localization-research`
- **Knowledge:** [Localization Market Research](../../knowledge/research/localization-market-research.md)

## What You're Building

### App-archetype detection & starter

_Request matches a known product shape (social / AI-chat / habit / photo-AI)_

- **Role:** Mobile engineer
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `PRODUCT.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** —
- **Gates:** `check:app-archetype`, `check:archetype-starter`
- **Knowledge:** [Core Loop And Complete Product Scope](../../knowledge/product/core-loop-and-complete-scope.md)

## How The App Feels

### 11-star experience

_"11-star run" / before PRODUCT.md, onboarding, ads, store creative, or engineering plans harden_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `PRODUCT.md`
- **Consults:** —
- **Produces:** `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `product/experience/11-star-experience/11-star-experience.html`
- **Gates:** —
- **Knowledge:** [Eleven-Star Experience](../../knowledge/experience/eleven-star-experience.md)

### Emotional experience design (producer)

_Feature whose 11-star target is 6★+ / "charge this with emotion", "build a habit"_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `analytics/ANALYTICS.md`
- **Consults:** —
- **Produces:** `product/experience/emotional-design/EMOTIONAL_DESIGN.md`
- **Gates:** `check:emotional-design`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Experience Cards](../../knowledge/experience/experience-cards.md), [Emotional Design System](../../knowledge/experience/emotional-design-system.md), [Emotional Experience Design](../../knowledge/experience/emotional-experience-design.md), [Emotional Experience Measurement](../../knowledge/experience/emotional-experience-measurement.md), [Ethics Guardrail](../../knowledge/experience/ethics-guardrail.md)

### Emotional design audit (auditor)

_"Audit this app's emotional design" / "emotional UX audit"_

- **Role:** Security architect
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/experience/emotional-design/EMOTIONAL_DESIGN.md`
- **Consults:** —
- **Produces:** `product/experience/emotional-design/EMOTIONAL_AUDIT.md`
- **Gates:** `check:emotional-design`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Experience Cards](../../knowledge/experience/experience-cards.md), [Consumer Product Design Agency](../../knowledge/experience/consumer-product-design-agency.md), [Emotional Design System](../../knowledge/experience/emotional-design-system.md), [Ethics Guardrail](../../knowledge/experience/ethics-guardrail.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md)

### Onboarding ONB-00: resume and classify scope

_Consumer onboarding work begins or resumes; classify greenfield, replacement, audit-only, or a bounded incremental onboarding change_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `analytics/ANALYTICS.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-00-resume-scope.md`
- **Gates:** `check:onboarding-evidence-onb-00`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-01: current-state trace

_Trace the actual onboarding implementation, documents, routes, state, providers, events, failures, tests, and replaced surfaces. Founder phrasing: signup behaves like this today, screen by screen._

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-00-resume-scope.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-01-current-state-trace.md`
- **Gates:** `check:onboarding-evidence-onb-01`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-02: evidence plan

_Define the onboarding evidence hierarchy, access constraints, sample plan, and freshness cutoff_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-01-current-state-trace.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Gates:** `check:onboarding-evidence-onb-02`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-03: current guidance research

_Research current consumer onboarding evidence, platform guidance, benchmarks, and practitioner heuristics_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-03-current-guidance.md`
- **Gates:** `check:onboarding-evidence-onb-03`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-04: competitor review analysis

_Mine direct and adjacent competitor reviews, including negative themes and a positive-review control_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-04-competitor-reviews.md`
- **Gates:** `check:onboarding-evidence-onb-04`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-05: authorized flow atlas

_Build an authorized Onbo Hub flow atlas without scraping, bypassing access controls, or inferring locked screens_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-05-onbo-hub-atlas.md`
- **Gates:** `check:onboarding-evidence-onb-05`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-06: internal guidance audit

_Audit applicable B2C App Builder and internal B2C guidance and resolve conflicts or outdated rules_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-06-internal-guidance-audit.md`
- **Gates:** `check:onboarding-evidence-onb-06`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-07: provider and policy landscape

_Refresh monetization, identity, analytics, RevenueCat, billing, platform-policy, and regional capability facts_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** `provider.revenuecat` (api, browser), `provider.posthog` (api, browser), `provider.app-store-connect` (cli, api, browser), `provider.google-play` (api, browser)
- **Reads:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-07-provider-policy-landscape.md`
- **Gates:** `check:onboarding-evidence-onb-07`
- **Knowledge:** [PostHog Agent Tooling](../../knowledge/data/posthog-agent-tooling.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [RevenueCat Agent Tooling](../../knowledge/money/revenuecat-agent-tooling.md)

### Onboarding ONB-08: motion research

_Research interaction and motion references with 60fps and translate them into the target framework_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-02-evidence-plan.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-08-motion-research.md`
- **Gates:** `check:onboarding-evidence-onb-08`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-09: evidence join

_Join guidance, reviews, flow evidence, internal doctrine, provider facts, policy, and motion research into explicit decisions_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-03-current-guidance.md`, `product/onboarding/graph/ONB-04-competitor-reviews.md`, `product/onboarding/graph/ONB-05-onbo-hub-atlas.md`, `product/onboarding/graph/ONB-06-internal-guidance-audit.md`, `product/onboarding/graph/ONB-07-provider-policy-landscape.md`, `product/onboarding/graph/ONB-08-motion-research.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-09-evidence-join.md`
- **Gates:** `check:onboarding-evidence-onb-09`, `check:onboarding-foundations-research`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md)

### Onboarding ONB-10: first value and activation

_Define first value rendered, first value engaged, activation, habit, and retention hypotheses_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-09-evidence-join.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-10-first-value-activation.md`
- **Gates:** `check:onboarding-evidence-onb-10`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-11: effort and question audit

_Audit effort before value, question usefulness, permissions, interruption budget, and visible personalization proof_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-09-evidence-join.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-11-effort-question-audit.md`
- **Gates:** `check:onboarding-evidence-onb-11`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-12: state and identity contract

_Define canonical journey, profile, identity, entitlement, continuity, and cross-surface state transitions_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** `provider.revenuecat` (api, browser)
- **Reads:** `product/onboarding/graph/ONB-09-evidence-join.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-12-state-identity-contract.md`
- **Gates:** `check:onboarding-evidence-onb-12`, `check:onboarding-foundations-identity`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md), [RevenueCat Agent Tooling](../../knowledge/money/revenuecat-agent-tooling.md)

### Onboarding ONB-13: analytics and experiments

_Define typed analytics, authoritative emitters, identity stitching, deduplication, experiment assignment, exposure, and expected sequences_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** `provider.posthog` (api, browser), `provider.revenuecat` (api, browser)
- **Reads:** `product/onboarding/graph/ONB-09-evidence-join.md`, `product/onboarding/graph/ONB-10-first-value-activation.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`, `analytics/ANALYTICS.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-13-analytics-experiments.md`
- **Gates:** `check:onboarding-evidence-onb-13`, `check:onboarding-foundations-measurement`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [PostHog Agent Tooling](../../knowledge/data/posthog-agent-tooling.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md)

### Onboarding ONB-14: trust, lifecycle, and policy

_Define review timing, permissions, lifecycle, privacy, security, accessibility, and policy behavior_

- **Role:** Product leader
- **Phases:** 1c
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-09-evidence-join.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`
- **Gates:** `check:onboarding-evidence-onb-14`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-15: architecture decision

_Compare native-first, hosted-funnel-first, hybrid, web-first, and evidence-backed alternatives and select one target architecture_

- **Role:** Product leader
- **Phases:** 1c, 2
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-10-first-value-activation.md`, `product/onboarding/graph/ONB-11-effort-question-audit.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-13-analytics-experiments.md`, `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-15-architecture-decision.md`
- **Gates:** `check:onboarding-evidence-onb-15`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-16: canonical journey graph

_Define acquisition-specific journeys that converge on one semantic onboarding state graph_

- **Role:** Product leader
- **Phases:** 2
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-15-architecture-decision.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-16-journey-graph.md`
- **Gates:** `check:onboarding-evidence-onb-16`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Commitment Funnel](../../knowledge/experience/commitment-funnel.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-17: screen, control, and paywall contract

_Specify every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior_

- **Role:** Product leader
- **Phases:** 2
- **Providers:** `provider.revenuecat` (api, browser)
- **Reads:** `product/onboarding/graph/ONB-16-journey-graph.md`, `product/copy/COPY_DECK.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`
- **Gates:** `check:onboarding-evidence-onb-17`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Worthiness](../../knowledge/design/design-worthiness.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Commitment Funnel](../../knowledge/experience/commitment-funnel.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Paywall Goal Headline](../../knowledge/experience/paywall-goal-headline.md)

### Onboarding ONB-18: visual design and prototype

_Produce actual high-fidelity onboarding design, motion, an interactive prototype, and design QA_

- **Role:** Product leader
- **Phases:** 2
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-16-journey-graph.md`, `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-13-analytics-experiments.md`, `DESIGN.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-18-visual-design-prototype.md`, `product/onboarding/prototype-evidence.json`
- **Gates:** `check:onboarding-evidence-onb-18`, `check:onboarding-foundations-prototype`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Worthiness](../../knowledge/design/design-worthiness.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md)

### Onboarding ONB-19: implementation and cutover contract

_Define implementation units, reliability, performance, observability, privacy, migration, hard cutover, and deletion work_

- **Role:** Product leader
- **Phases:** 2, 5b
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-16-journey-graph.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-13-analytics-experiments.md`, `product/onboarding/prototype-evidence.json`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-19-implementation-cutover-contract.md`
- **Gates:** `check:onboarding-evidence-onb-19`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md)

### Onboarding ONB-20: adversarial QA

_Run the synthetic one-star pre-mortem, policy review, instrumentation QA, accessibility review, and provider-realism review_

- **Role:** Product leader
- **Phases:** 2, 5b
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`, `product/onboarding/graph/ONB-18-visual-design-prototype.md`, `product/onboarding/graph/ONB-19-implementation-cutover-contract.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-20-adversarial-qa.md`
- **Gates:** `check:onboarding-evidence-onb-20`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md)

### Onboarding ONB-21: Compound Engineering plan

_Translate the accepted onboarding graph into an implementation-ready Compound Engineering plan, or the B2C App Builder-equivalent fallback_

- **Role:** Product leader
- **Phases:** 5b
- **Providers:** —
- **Reads:** `product/onboarding/graph/ONB-20-adversarial-qa.md`
- **Consults:** —
- **Produces:** `product/onboarding/graph/ONB-21-compound-engineering-plan.md`
- **Gates:** `check:onboarding-evidence-onb-21`
- **Knowledge:** [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md)

### Onboarding ONB-22: execute, cut over, and verify

_Implement or finalize the accepted onboarding graph, verify the canonical artifacts, cut over, and prove the target is the only runtime_

- **Role:** Product leader
- **Phases:** 2, 5b
- **Providers:** `provider.revenuecat` (api, browser), `provider.posthog` (api, browser)
- **Reads:** `product/onboarding/graph/ONB-00-resume-scope.md`, `product/onboarding/graph/ONB-01-current-state-trace.md`, `product/onboarding/graph/ONB-02-evidence-plan.md`, `product/onboarding/graph/ONB-03-current-guidance.md`, `product/onboarding/graph/ONB-04-competitor-reviews.md`, `product/onboarding/graph/ONB-05-onbo-hub-atlas.md`, `product/onboarding/graph/ONB-06-internal-guidance-audit.md`, `product/onboarding/graph/ONB-07-provider-policy-landscape.md`, `product/onboarding/graph/ONB-08-motion-research.md`, `product/onboarding/graph/ONB-09-evidence-join.md`, `product/onboarding/graph/ONB-10-first-value-activation.md`, `product/onboarding/graph/ONB-11-effort-question-audit.md`, `product/onboarding/graph/ONB-12-state-identity-contract.md`, `product/onboarding/graph/ONB-13-analytics-experiments.md`, `product/onboarding/graph/ONB-14-trust-lifecycle-policy.md`, `product/onboarding/graph/ONB-15-architecture-decision.md`, `product/onboarding/graph/ONB-16-journey-graph.md`, `product/onboarding/graph/ONB-17-screen-control-paywall-contract.md`, `product/onboarding/graph/ONB-18-visual-design-prototype.md`, `product/onboarding/graph/ONB-19-implementation-cutover-contract.md`, `product/onboarding/graph/ONB-20-adversarial-qa.md`, `product/onboarding/graph/ONB-21-compound-engineering-plan.md`, `product/copy/COPY_DECK.md`, `operations/PROVIDER_PROOF.md`
- **Consults:** —
- **Produces:** `product/ONBOARDING.md`, `product/onboarding.html`, `product/onboarding/runtime-evidence.json`
- **Gates:** `check:onboarding-graph-complete`, `check:onboarding-page-fresh`, `check:onboarding-cutover-repository-complete`, `check:provider-proof-onboarding`, `check:onboarding-foundations-runtime`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Commitment Funnel](../../knowledge/experience/commitment-funnel.md), [Eleven-Star Experience](../../knowledge/experience/eleven-star-experience.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Research-backed onboarding with identity and measurement](../../knowledge/experience/onboarding-foundations.md), [Paywall Goal Headline](../../knowledge/experience/paywall-goal-headline.md), [Push Notification Lifecycle](../../knowledge/experience/push-notification-lifecycle.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

## Look And Feel

### Brand definition

_Crossing research into design: before the Design Room locks visual identity, and before any marketing or store copy claims a brand voice_

- **Role:** Design guru
- **Phases:** 2
- **Providers:** —
- **Reads:** `strategy/RESEARCH.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`
- **Consults:** —
- **Produces:** `strategy/BRAND.md`
- **Gates:** —
- **Knowledge:** [Audience-Derived Identity](../../knowledge/design/audience-derived-identity.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Visual System](../../knowledge/design/design-visual-system.md)

### Reference pack librarian (quarantined)

_Before DESIGN.md mutation, generated visuals, native animation, or landing motion for a high-impact surface: onboarding, core loop, landing story, paywall, store first frames, trust and consent_

- **Role:** Design guru
- **Phases:** 2
- **Providers:** `provider.refero` (api)
- **Reads:** `PRODUCT.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `strategy/RESEARCH.md`
- **Consults:** `strategy/BRAND.md`
- **Produces:** `design/reference-packs/`, `design/reviews/rubrics/`
- **Gates:** —
- **Knowledge:** [Consumer Craft Benchmarks](../../knowledge/design/consumer-craft-benchmarks.md), [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Landing Motion Craft](../../knowledge/design/landing-motion-craft.md), [Motion Craft Benchmarks](../../knowledge/design/motion-craft-benchmarks.md), [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [Parallel Agent Orchestration](../../knowledge/orchestration/parallel-agent-orchestration.md)

### Design Room

_New or substantively revised design systems, concepts, or cross-surface direction. Founder phrasing: design how every screen looks and feels. A bounded correction to an accepted legacy contract uses the direct focused-maintenance procedure in quality-lens, not full Design Room execution._

- **Role:** Design guru
- **Phases:** 2
- **Providers:** —
- **Reads:** `PRODUCT.md`, `DESIGN.md`, `state/LAUNCH_TRACE.md`, `strategy/RESEARCH.md`, `design/reference-packs/`, `product/onboarding/graph/ONB-15-architecture-decision.md`
- **Consults:** `studio/seed/business.json`
- **Produces:** `DESIGN.md`, `studio/seed/business.json`, `design/design-room.html`
- **Gates:** `validate:design-state`, `check:design-foundation`, `render:design-room`, `check:design-room`, `check:design-worthiness-mechanical`
- **Knowledge:** [Audience-Derived Identity](../../knowledge/design/audience-derived-identity.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Room](../../knowledge/design/design-room.md), [Design Visual System](../../knowledge/design/design-visual-system.md), [Design Worthiness](../../knowledge/design/design-worthiness.md), [Evidence-Led Editorial Scrollytelling](../../knowledge/design/editorial-scrollytelling.md), [Landing Motion Craft](../../knowledge/design/landing-motion-craft.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Quality Lens](../../knowledge/design/quality-lens.md), [Surfaces B2C](../../knowledge/design/surfaces-b2c.md), [Vibecoded Tells](../../knowledge/design/vibecoded-tells.md), [Artifact Contracts](../../knowledge/process/artifact-contracts.md)

### Design system audit (isolated)

_After DESIGN.md or the Design Room changes for a high-impact surface, before the recorded taste decision and before landing, screenshots, generated visuals, or engineering consume the direction_

- **Role:** Design guru
- **Phases:** 2
- **Providers:** —
- **Reads:** `DESIGN.md`, `studio/seed/business.json`, `design/design-room.html`, `design/reviews/rubrics/`, `design/reference-packs/`
- **Consults:** —
- **Produces:** `design/reviews/DESIGN_SYSTEM_REVIEW.md`
- **Gates:** `check:design-md`, `check:design-worthiness`, `check:audience-identity`
- **Knowledge:** [Audience-Derived Identity](../../knowledge/design/audience-derived-identity.md), [Consumer Craft Benchmarks](../../knowledge/design/consumer-craft-benchmarks.md), [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Visual System](../../knowledge/design/design-visual-system.md), [Design Worthiness](../../knowledge/design/design-worthiness.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Quality Lens](../../knowledge/design/quality-lens.md), [Vibecoded Tells](../../knowledge/design/vibecoded-tells.md), [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md)

### Implemented mobile and landing craft audit

_The native app and landing page run and their required behavior has evidence, before full business closeout_

- **Role:** Design guru
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `product.yaml`, `DESIGN.md`, `studio/seed/business.json`, `engineering/PRODUCTION_READINESS.md`, `proof/`, `growth/landing/`, `design/reviews/rubrics/`, `design/reference-packs/`
- **Consults:** —
- **Produces:** `design/proofs/design-acceptance.json`, `design/reviews/IMPLEMENTATION_REVIEW.md`
- **Gates:** `check:design-acceptance`
- **Knowledge:** [Consumer Craft Benchmarks](../../knowledge/design/consumer-craft-benchmarks.md), [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Design Visual System](../../knowledge/design/design-visual-system.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Quality Lens](../../knowledge/design/quality-lens.md)

### Token promotion

_DESIGN.md tokens change and the design is accepted_

- **Role:** Design guru
- **Phases:** 2
- **Providers:** —
- **Reads:** `DESIGN.md`
- **Consults:** —
- **Produces:** `design/system/tokens.json`, `design/system/tokens.css`, `design/system/DesignTokens.swift`, `design/system/design-tokens.ts`, `design/system/design_tokens.dart`
- **Gates:** `check:token-promotion`
- **Knowledge:** [Design Room](../../knowledge/design/design-room.md), [Design Visual System](../../knowledge/design/design-visual-system.md)

### UX patterns (Refero)

_Before flow maps, state matrices, UX_PATTERNS.md, or bug-trap coverage_

- **Role:** Design guru
- **Phases:** 2
- **Providers:** `provider.refero` (api)
- **Reads:** `studio/seed/business.json`
- **Consults:** —
- **Produces:** `product/experience/ux-patterns/UX_PATTERNS.md`
- **Gates:** —
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Refero UX Patterns](../../knowledge/design/refero-ux-patterns.md)

### Premium mobile craft

_Before in-app UI build/polish, press-state/haptics/loading-empty wiring, live-state effects, or "premium feel"_

- **Role:** Design guru
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `DESIGN.md`, `studio/seed/business.json`
- **Consults:** `product/experience/ux-patterns/UX_PATTERNS.md`
- **Produces:** —
- **Gates:** `check:motion-contract`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Motion Craft Benchmarks](../../knowledge/design/motion-craft-benchmarks.md), [Premium Mobile Craft](../../knowledge/design/premium-mobile-craft.md), [Recommended Agent Skills](../../knowledge/engineering/recommended-agent-skills.md)

### Content assets / Remotion / generated visuals

_Before rendered videos/stills, app previews, ad/social variants. Founder phrasing: demo videos and preview clips from real screens for ads._

- **Role:** Design guru
- **Phases:** 2, 3
- **Providers:** `provider.higgsfield` (mcp)
- **Reads:** `DESIGN.md`, `design/reference-packs/`
- **Consults:** —
- **Produces:** `growth/content-assets/CONTENT_ASSETS.md`, `growth/content-assets/content-assets.html`
- **Gates:** `check:content-assets-foundation`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Visual System](../../knowledge/design/design-visual-system.md), [Content Asset Production](../../knowledge/design/remotion-content-assets.md), [Visual And Motion Production](../../knowledge/process/tool-recipes/visual-and-motion-production.md)

## Every Word A User Reads

### Writing quality (no-slop)

_Before writing or reviewing any founder-facing copy or any marketing copy the skill generates_

- **Role:** Copy specialist
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `strategy/BRAND.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`
- **Consults:** —
- **Produces:** `product/copy/COPY_BRIEF.md`, `product/copy/COPY_DECK.md`
- **Gates:** `check:app-copy`
- **Knowledge:** [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Copy review (isolated audit)

_After the copy brief and deck exist, before the string freeze that store screenshots, translations, and listing fields depend on; again after any deck change_

- **Role:** Copy specialist
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `product/copy/COPY_BRIEF.md`, `product/copy/COPY_DECK.md`, `strategy/BRAND.md`
- **Consults:** `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `strategy/RESEARCH.md`
- **Produces:** `product/copy/COPY_REVIEW.md`
- **Gates:** `check:app-copy`
- **Knowledge:** [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [Ethics Guardrail](../../knowledge/experience/ethics-guardrail.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

## Building The App

### App source change ingestion

_When design is accepted and after every accepted app-source, build-config, localization, onboarding, feature, paywall, SDK, or visual change_

- **Role:** Mobile engineer
- **Phases:** 3
- **Providers:** —
- **Reads:** `run/app-source-fingerprint.sha256`, `DESIGN.md`, `engineering/TECH_SPEC.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `engineering/SOURCE_CHANGE_MANIFEST.json`
- **Gates:** —
- **Knowledge:** [Cascade Edges](../../knowledge/process/cascade-edges.yaml), [Change Cascade](../../knowledge/process/change-cascade.md), [Flow Traceability](../../knowledge/process/flow-traceability.md)

### Engineering orchestration (CE + production readiness)

_Before actual app implementation, builder prompts, or production-readiness claims_

- **Role:** Engineering leader
- **Phases:** 5b
- **Providers:** —
- **Reads:** `engineering/TECH_SPEC.md`, `state/LAUNCH_TRACE.md`, `DESIGN.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `engineering/ENGINEERING_PLAN.md`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`
- **Gates:** `check:compound-engineering`, `check:orchestration`
- **Knowledge:** [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Premium Mobile Craft](../../knowledge/design/premium-mobile-craft.md), [Quality Lens](../../knowledge/design/quality-lens.md), [Engineering Orchestration](../../knowledge/engineering/engineering-orchestration.md), [Recommended Agent Skills](../../knowledge/engineering/recommended-agent-skills.md), [Eleven-Star Experience](../../knowledge/experience/eleven-star-experience.md), [Compound Engineering Routing](../../knowledge/orchestration/compound-engineering-routing.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [Parallel Agent Orchestration](../../knowledge/orchestration/parallel-agent-orchestration.md), [Project State](../../knowledge/orchestration/project-state.md), [Engineering And Agent Orchestration](../../knowledge/process/tool-recipes/engineering-and-agent-orchestration.md)

### Backend data contract

_Before schema/auth prompts or engineering/TECH_SPEC.md data/API sections harden_

- **Role:** Backend infrastructure engineer
- **Phases:** 1f, 5b
- **Providers:** —
- **Reads:** `engineering/TECH_SPEC.md`, `state/business-state.json`
- **Consults:** `DESIGN.md`, `trust/PRIVACY.md`
- **Produces:** —
- **Gates:** `check:backend-contract`
- **Knowledge:** [Backend Data Contract](../../knowledge/engineering/backend-data-contract.md), [Secrets Management](../../knowledge/operations/secrets-management.md), [Flow Traceability](../../knowledge/process/flow-traceability.md), [Privacy Terms](../../knowledge/trust/privacy-terms.md)

### App agent roster & repo entrypoints

_Before builder handoff bundles, AGENTS.md/CLAUDE.md, APP_AGENTS.md, agents/_

- **Role:** Orchestrator
- **Phases:** 5
- **Providers:** —
- **Reads:** `engineering/ENGINEERING_PLAN.md`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `AGENTS.md`, `CLAUDE.md`, `APP_AGENTS.md`
- **Gates:** —
- **Knowledge:** [App Agent Roster](../../knowledge/engineering/app-agent-roster.md), [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [Parallel Agent Orchestration](../../knowledge/orchestration/parallel-agent-orchestration.md), [Artifact Contracts](../../knowledge/process/artifact-contracts.md)

### MobAI device automation & demo videos

_Before MobAI-delta device work — Android coverage, repeatable .mob suites, multi-device or physical-hardware runs, performance gates, MobAI CI, or recorder-skill demo videos/app previews — after the Route Ladder (native-ios-proof-route-ladder) routes past the in-app simulator_

- **Role:** Accessibility and device QA
- **Phases:** 5b
- **Providers:** `provider.mobai` (mcp, cli)
- **Reads:** `engineering/ENGINEERING_PLAN.md`, `engineering/PRODUCTION_READINESS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `growth/DEMO_VIDEO.md`
- **Gates:** `check:mobai-proof`
- **Knowledge:** [MobAI Toolbelt](../../knowledge/engineering/mobai-toolbelt.md), [Paid Tool Routing](../../knowledge/operations/paid-tool-routing.md), [Device Capture And Proof](../../knowledge/process/tool-recipes/device-capture-and-proof.md)

### Mobile app operation and native proof (Route Ladder)

_First for any iOS or Android device automation, run-the-app, screen-check, flow-walk, bug-repro, screenshot, or screen-recording request — read the selected platforms, then pick the lightest proof rung that covers them_

- **Role:** Accessibility and device QA
- **Phases:** 5b
- **Providers:** `provider.in-app-ios-simulator` (native_device), `provider.codex-native-ios` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts), `provider.snapshot-previews` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts), `provider.serve-sim` (local tooling — deliberately undeclared, see adapters/provisioning/requirements.ts), `provider.mobai` (mcp, cli)
- **Reads:** `engineering/PRODUCTION_READINESS.md`, `engineering/ENGINEERING_PLAN.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `proof/`
- **Gates:** `check:native-ios`, `check:mobai-proof-workflow`, `check:native-android`
- **Knowledge:** [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [XcodeBuildMCP Testing](../../knowledge/engineering/xcodebuildmcp-testing.md), [Device Capture And Proof](../../knowledge/process/tool-recipes/device-capture-and-proof.md), [Apple Signing Release](../../knowledge/store/apple-signing-release.md)

### Accessibility common-task proof

_Before beta or store submission on every mobile launch_

- **Role:** Accessibility and device QA
- **Phases:** 5b
- **Providers:** `provider.in-app-ios-simulator` (native_device), `provider.mobai` (mcp, cli)
- **Reads:** `engineering/PRODUCTION_READINESS.md`, `DESIGN.md`
- **Consults:** —
- **Produces:** `engineering/ACCESSIBILITY_READINESS.md`
- **Gates:** —
- **Knowledge:** [Accessibility Readiness](../../knowledge/engineering/accessibility-readiness.md)

### App quality and vitals

_Before beta or store submission on every mobile launch_

- **Role:** Engineering leader
- **Phases:** 5b
- **Providers:** `provider.sentry` (api, cli, browser)
- **Reads:** `engineering/PRODUCTION_READINESS.md`, `engineering/TECH_SPEC.md`
- **Consults:** —
- **Produces:** `engineering/APP_QUALITY.md`
- **Gates:** —
- **Knowledge:** [App Quality And Vitals](../../knowledge/engineering/app-quality.md), [Distribution, Offer, And Signal Validation](../../knowledge/research/distribution-offer-signal.md)

## App Store And Google Play

### ASO & store ops

_Before App Store/Play metadata, keyword research, ASA, or post-launch ASO loops_

- **Role:** Marketing guru
- **Phases:** 3
- **Providers:** —
- **Reads:** `DESIGN.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `STORE_OPS.md`
- **Gates:** `check:aso-evidence`
- **Knowledge:** [Recommended Agent Skills](../../knowledge/engineering/recommended-agent-skills.md), [Paid User Acquisition](../../knowledge/growth/paid-user-acquisition.md), [Growth And Store Routing](../../knowledge/process/tool-recipes/growth-and-store-routing.md), [Localization Market Research](../../knowledge/research/localization-market-research.md), [ASO Apple Keyword Evidence](../../knowledge/store/aso-apple-keyword-evidence.md), [ASO Store Ops](../../knowledge/store/aso-store-ops.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### App Store listing prep packet

_Before listing fields, privacy questionnaire, IAP/subscription field maps, CPPs, in-app events_

- **Role:** Marketing guru
- **Phases:** 3
- **Providers:** —
- **Reads:** `DESIGN.md`, `STORE_OPS.md`, `revenue/REVENUE_OPS.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/app-store-listing/APP_STORE_LISTING.md`
- **Gates:** `check:store-console`
- **Knowledge:** [Eleven-Star Experience](../../knowledge/experience/eleven-star-experience.md), [Revenue Monetization](../../knowledge/money/revenue-monetization.md), [App Store Listing Prep](../../knowledge/store/app-store-listing-prep.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Apple signing & release readiness

_Before Apple Developer enrollment, Team ID, signing, profiles, archive/upload, TestFlight. Founder phrasing: get on the App Store, ship to TestFlight, get the ios build signed and into testers hands._

- **Role:** Engineering leader
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser)
- **Reads:** `store/app-store-listing/APP_STORE_LISTING.md`, `store/APPLE_APP_STORE_REQUIREMENTS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/APPLE_SIGNING.md`
- **Gates:** `check:apple-release-readiness`
- **Knowledge:** [Secrets Management](../../knowledge/operations/secrets-management.md), [Age Rating Questionnaire](../../knowledge/store/age-rating-questionnaire.md), [App Review Observe](../../knowledge/store/app-review-observe.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [Apple Signing Release](../../knowledge/store/apple-signing-release.md)

### Apple App Store requirements (privacy manifest)

_Before ASC upload — PrivacyInfo.xcprivacy, required-reason APIs, App Privacy answers_

- **Role:** Security architect
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser)
- **Reads:** `store/app-store-listing/APP_STORE_LISTING.md`, `trust/PRIVACY.md`, `trust/TERMS.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/APPLE_APP_STORE_REQUIREMENTS.md`
- **Gates:** `check:apple-requirements`
- **Knowledge:** [App Store Listing Prep](../../knowledge/store/app-store-listing-prep.md), [Store Console Workflow](../../knowledge/store/store-console-workflow.md), [Privacy Terms](../../knowledge/trust/privacy-terms.md)

### Store console workflow

_Before "where do I click / what do I paste" in ASC or Play Console_

- **Role:** Marketing guru
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser), `provider.google-play` (api, browser)
- **Reads:** `store/app-store-listing/APP_STORE_LISTING.md`, `store/APPLE_SIGNING.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/STORE_CONSOLE.md`, `store/store-console.html`
- **Gates:** `check:store-console`
- **Knowledge:** [Age Rating Questionnaire](../../knowledge/store/age-rating-questionnaire.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [Apple Signing Release](../../knowledge/store/apple-signing-release.md), [Google Play Release](../../knowledge/store/google-play-release.md), [Store Console Workflow](../../knowledge/store/store-console-workflow.md)

### ASC CLI automation

_Before Rork asc CLI app creation, metadata, screenshots, TestFlight, RevenueCat sync_

- **Role:** Engineering leader
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser)
- **Reads:** `store/STORE_CONSOLE.md`, `store/store-console.html`, `state/business-state.json`
- **Consults:** —
- **Produces:** —
- **Gates:** `check:asc-command-contract`
- **Knowledge:** [Subscription Price Derivation](../../knowledge/money/subscription-price-derivation.md), [Secrets Management](../../knowledge/operations/secrets-management.md), [Age Rating Questionnaire](../../knowledge/store/age-rating-questionnaire.md), [App Review Observe](../../knowledge/store/app-review-observe.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [ASO Apple Keyword Evidence](../../knowledge/store/aso-apple-keyword-evidence.md), [Store Console Workflow](../../knowledge/store/store-console-workflow.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### App Review observe

_When an App Store version is in review, or after a status change, before any remediation or resubmission_

- **Role:** Engineering leader
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser)
- **Reads:** `store/STORE_CONSOLE.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/APP_REVIEW.md`, `run/app-review.json`
- **Gates:** `check:app-review-contract`
- **Knowledge:** [App Review Observe](../../knowledge/store/app-review-observe.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [ASO Store Ops](../../knowledge/store/aso-store-ops.md)

### App Review remediate

_After App Review observe classifies a rejection, before any store submission_

- **Role:** Engineering leader
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser)
- **Reads:** `store/APP_REVIEW.md`, `run/app-review.json`, `state/business-state.json`
- **Consults:** —
- **Produces:** —
- **Gates:** `check:app-review-contract`
- **Knowledge:** [App Review Observe](../../knowledge/store/app-review-observe.md), [App Review Remediate](../../knowledge/store/app-review-remediate.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [Apple Signing Release](../../knowledge/store/apple-signing-release.md), [ASO Store Ops](../../knowledge/store/aso-store-ops.md)

### App Review resubmit

_After bounded App Review remediation is independently verified, before any further Apple mutation_

- **Role:** Engineering leader
- **Phases:** 3
- **Providers:** `provider.app-store-connect` (cli, api, browser)
- **Reads:** `store/APP_REVIEW.md`, `run/app-review.json`, `state/business-state.json`
- **Consults:** —
- **Produces:** —
- **Gates:** `check:app-review-contract`
- **Knowledge:** [App Review Observe](../../knowledge/store/app-review-observe.md), [App Review Remediate](../../knowledge/store/app-review-remediate.md), [App Review Resubmit](../../knowledge/store/app-review-resubmit.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [Apple Signing Release](../../knowledge/store/apple-signing-release.md), [ASO Store Ops](../../knowledge/store/aso-store-ops.md)

### Store screenshots production

_Store screenshots needed (raw capture → composed iPhone/iPad/Play assets), including the set uploaded to App Store Connect_

- **Role:** Design guru
- **Phases:** 3
- **Providers:** `provider.app-store-screenshots` (skill_pack)
- **Reads:** `DESIGN.md`, `store/app-store-listing/APP_STORE_LISTING.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `strategy/RESEARCH.md`, `product/experience/emotional-design/EMOTIONAL_DESIGN.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/app-store-listing/SCREENSHOTS.md`
- **Gates:** `check:design-md`, `check:design-room`, `check:store-screenshots`
- **Knowledge:** [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Visual System](../../knowledge/design/design-visual-system.md), [Mobile Flow Craft](../../knowledge/design/mobile-flow-craft.md), [Quality Lens](../../knowledge/design/quality-lens.md), [MobAI Toolbelt](../../knowledge/engineering/mobai-toolbelt.md), [Device Capture And Proof](../../knowledge/process/tool-recipes/device-capture-and-proof.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md), [ASO Store Ops](../../knowledge/store/aso-store-ops.md), [Screenshot Toolchain and Source Adoption](../../knowledge/store/screenshot-toolchain.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### Google Play release

_Android in scope (platforms include android or an android bundle id exists)_

- **Role:** Engineering leader
- **Phases:** 3
- **Providers:** `provider.google-play` (api, browser)
- **Reads:** `store/app-store-listing/APP_STORE_LISTING.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/GOOGLE_PLAY_RELEASE.md`
- **Gates:** —
- **Knowledge:** [Revenue Monetization](../../knowledge/money/revenue-monetization.md), [Google Play Release](../../knowledge/store/google-play-release.md), [Store Console Workflow](../../knowledge/store/store-console-workflow.md), [Privacy Terms](../../knowledge/trust/privacy-terms.md)

### Google Play metadata standing envelope

_Google Play listing metadata is ready and a matching metadata standing envelope is current_

- **Role:** Marketing guru
- **Phases:** 3
- **Providers:** `provider.google-play` (api, browser)
- **Reads:** `store/STORE_CONSOLE.md`, `store/app-store-listing/APP_STORE_LISTING.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/proof/google-play-metadata-apply.json`
- **Gates:** `check:store-console`, `check:provider-proof`
- **Knowledge:** [Google Play Release](../../knowledge/store/google-play-release.md), [Store Console Workflow](../../knowledge/store/store-console-workflow.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### Google Play media standing envelope

_Google Play screenshots, feature graphics, or promo video are ready and a matching media standing envelope is current_

- **Role:** Marketing guru
- **Phases:** 3
- **Providers:** `provider.google-play` (api, browser)
- **Reads:** `store/STORE_CONSOLE.md`, `store/app-store-listing/SCREENSHOTS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/proof/google-play-media-apply.json`
- **Gates:** `check:store-screenshots`
- **Knowledge:** [ASO Store Ops](../../knowledge/store/aso-store-ops.md), [Google Play Release](../../knowledge/store/google-play-release.md)

### Google Play testing-track standing envelope

_An AAB is proven and an exact internal or closed-testing track standing envelope is current_

- **Role:** Engineering leader
- **Phases:** 5b
- **Providers:** `provider.google-play` (api, browser)
- **Reads:** `store/GOOGLE_PLAY_RELEASE.md`, `engineering/PRODUCTION_READINESS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `store/proof/google-play-testing-track-apply.json`
- **Gates:** `check:provider-proof`
- **Knowledge:** [Provider Proof](../../knowledge/process/provider-proof.md), [Google Play Release](../../knowledge/store/google-play-release.md)

### Marketplace and regional compliance

_Before store distribution in every selected region_

- **Role:** Engineering leader
- **Phases:** 3, 5c
- **Providers:** `provider.app-store-connect` (cli, api, browser), `provider.google-play` (api, browser)
- **Reads:** `store/app-store-listing/APP_STORE_LISTING.md`, `operations/business-access.json`
- **Consults:** —
- **Produces:** `store/MARKETPLACE_COMPLIANCE.md`
- **Gates:** —
- **Knowledge:** [Marketplace And Regional Compliance](../../knowledge/store/marketplace-regional-compliance.md)

## Pricing And Getting Paid

### Revenue monetization

_Before RevenueCat/Stripe/web billing, products, paywall, entitlement, webhooks, pricing. Founder phrasing: how do I charge for subscriptions or a purchase._

- **Role:** Engineering leader
- **Phases:** 3b
- **Providers:** `provider.revenuecat` (api, browser), `provider.stripe` (api, cli, browser)
- **Reads:** `state/LAUNCH_TRACE.md`, `strategy/RESEARCH.md`, `strategy/OFFER_TEST.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `revenue/REVENUE_OPS.md`
- **Gates:** `check:revenue`, `check:price-derivation`
- **Knowledge:** [Billing Health And Reactivation](../../knowledge/money/billing-health-and-reactivation.md), [Offer And Pricing Decisions](../../knowledge/money/offer-and-pricing-decisions.md), [Paywall, Pricing, And Experiments](../../knowledge/money/paywall-pricing-and-experiments.md), [Revenue Monetization](../../knowledge/money/revenue-monetization.md), [RevenueCat Agent Tooling](../../knowledge/money/revenuecat-agent-tooling.md), [RevenueCat And Store Products](../../knowledge/money/revenuecat-and-store-products.md), [Stripe And Web Billing](../../knowledge/money/stripe-and-web-billing.md), [Subscription Price Derivation](../../knowledge/money/subscription-price-derivation.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### Paywall experiment program

_After a live paywall exists, or when the experiment backlog needs a next test_

- **Role:** Engineering leader
- **Phases:** 6
- **Providers:** `provider.revenuecat` (api, browser)
- **Reads:** `revenue/REVENUE_OPS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `revenue/PAYWALL_EXPERIMENT_PROGRAM.md`
- **Gates:** `check:revenue`
- **Knowledge:** [Paywall Goal Headline](../../knowledge/experience/paywall-goal-headline.md), [Paywall, Pricing, And Experiments](../../knowledge/money/paywall-pricing-and-experiments.md), [Revenue Monetization](../../knowledge/money/revenue-monetization.md), [RevenueCat Agent Tooling](../../knowledge/money/revenuecat-agent-tooling.md)

## Marketing And Growth

### Paid user-acquisition system

_Before paid ads, ASA, Meta/TikTok/Google campaigns, or spend-readiness claims_

- **Role:** Marketing guru
- **Phases:** 1d
- **Providers:** `provider.paid-ad-channels` (manual), `provider.posthog` (api, browser), `provider.revenuecat` (api, browser)
- **Reads:** `DESIGN.md`, `analytics/ANALYTICS.md`, `strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `growth/PAID_UA.md`
- **Gates:** `check:paid-ua`
- **Knowledge:** [AppsFlyer MMP](../../knowledge/growth/appsflyer-mmp.md), [HDYHAU Survey And Blended ROAS](../../knowledge/growth/hdyhau-blended-roas.md), [iOS Consumer Playbook Intake](../../knowledge/growth/ios-consumer-playbook-intake.md), [Non-Competitor Angle Discovery](../../knowledge/growth/non-competitor-angle-discovery.md), [Paid User Acquisition](../../knowledge/growth/paid-user-acquisition.md), [Revenue Monetization](../../knowledge/money/revenue-monetization.md), [Paid Tool Routing](../../knowledge/operations/paid-tool-routing.md), [Localization Market Research](../../knowledge/research/localization-market-research.md)

### Viral growth loop

_Before referral/share-to-unlock/invite/comment-loop mechanics_

- **Role:** Marketing guru
- **Phases:** 1e
- **Providers:** —
- **Reads:** `DESIGN.md`, `analytics/ANALYTICS.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `growth/VIRAL_GROWTH.md`
- **Gates:** —
- **Knowledge:** [Ethics Guardrail](../../knowledge/experience/ethics-guardrail.md), [Onboarding Conversion](../../knowledge/experience/onboarding-conversion.md), [Viral Growth Loops](../../knowledge/growth/viral-growth-loops.md), [Revenue Monetization](../../knowledge/money/revenue-monetization.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### Launch narrative & cadence

_Before the public announcement, launch-day run-of-show, or weekly release rhythm_

- **Role:** Marketing guru
- **Phases:** 1e, 3, 6
- **Providers:** —
- **Reads:** `DESIGN.md`, `growth/VIRAL_GROWTH.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `strategy/RESEARCH.md`, `strategy/SIGNAL_CORPUS.md`
- **Consults:** `growth/content-assets/CONTENT_ASSETS.md`
- **Produces:** `growth/LAUNCH_NARRATIVE.md`, `growth/content-intelligence.csv`
- **Gates:** —
- **Knowledge:** [Ethics Guardrail](../../knowledge/experience/ethics-guardrail.md), [Launch Narrative Cadence](../../knowledge/growth/launch-narrative-cadence.md), [Viral Growth Loops](../../knowledge/growth/viral-growth-loops.md), [Distribution-First Niche](../../knowledge/research/distribution-first-niche.md), [Distribution, Offer, And Signal Validation](../../knowledge/research/distribution-offer-signal.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### GEO/SEO public-surface plan

_Before editing any landing/policy/blog copy, robots.txt, llms.txt, sitemap, schema, or metadata_

- **Role:** Marketing guru
- **Phases:** 4
- **Providers:** —
- **Reads:** `state/LAUNCH_TRACE.md`, `analytics/ANALYTICS.md`
- **Consults:** `strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md`
- **Produces:** `GEO_SEO.md`
- **Gates:** —
- **Knowledge:** [GEO/SEO](../../knowledge/growth/geo-seo.md), [Localization Market Research](../../knowledge/research/localization-market-research.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Local landing site and waitlist build

_Immediately after DESIGN.md is accepted — build the local landing site while app implementation runs_

- **Role:** Launch surface producer
- **Phases:** 4
- **Providers:** —
- **Reads:** `GEO_SEO.md`, `analytics/ANALYTICS.md`, `product/copy/COPY_BRIEF.md`, `product/copy/COPY_DECK.md`, `DESIGN.md`
- **Consults:** `product/ONBOARDING.md`, `strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md`, `revenue/REVENUE_OPS.md`, `store/app-store-listing/SCREENSHOTS.md`, `growth/content-assets/CONTENT_ASSETS.md`
- **Produces:** `growth/landing/`
- **Gates:** `check:design-md`, `check:design-room`, `check:design-worthiness`, `check:vibecoded-tells`, `check:scrollytelling`, `check:browser-runtime-proof`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Design Evidence Stack](../../knowledge/design/design-evidence-stack.md), [Design Worthiness](../../knowledge/design/design-worthiness.md), [Evidence-Led Editorial Scrollytelling](../../knowledge/design/editorial-scrollytelling.md), [Landing Motion Craft](../../knowledge/design/landing-motion-craft.md), [Vibecoded Tells](../../knowledge/design/vibecoded-tells.md), [CRO Landing](../../knowledge/growth/cro-landing.md), [Funnel Domain And Privacy](../../knowledge/process/tool-recipes/funnel-domain-and-privacy.md), [Consumer Copy Benchmarks](../../knowledge/words/consumer-copy-benchmarks.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### Landing and funnel audit (isolated)

_After the local landing and funnel pages build, before publication and before any public page is called done; again after any accepted landing change_

- **Role:** Marketing guru
- **Phases:** 4
- **Providers:** —
- **Reads:** `growth/landing/`, `GEO_SEO.md`, `product/copy/COPY_DECK.md`, `DESIGN.md`, `design/reviews/rubrics/`
- **Consults:** `product/copy/COPY_REVIEW.md`, `design/reviews/DESIGN_SYSTEM_REVIEW.md`
- **Produces:** `growth/CRO_AUDIT.md`
- **Gates:** `check:scrollytelling`, `check:vibecoded-tells`
- **Knowledge:** [Design Acceptance Evidence](../../knowledge/design/design-acceptance.md), [Evidence-Led Editorial Scrollytelling](../../knowledge/design/editorial-scrollytelling.md), [Landing Motion Craft](../../knowledge/design/landing-motion-craft.md), [Quality Lens](../../knowledge/design/quality-lens.md), [Vibecoded Tells](../../knowledge/design/vibecoded-tells.md), [External Skill Packs](../../knowledge/engineering/external-skill-packs.md), [CRO Landing](../../knowledge/growth/cro-landing.md), [GEO/SEO](../../knowledge/growth/geo-seo.md), [Isolated Review](../../knowledge/orchestration/isolated-review.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Landing funnel publication and live proof

_After the local landing build passes and an exact website-deployment standing envelope or one-shot approval is current_

- **Role:** Launch surface producer
- **Phases:** 4
- **Providers:** —
- **Reads:** `growth/landing/`, `GEO_SEO.md`, `analytics/ANALYTICS.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** —
- **Gates:** `check:landing-funnel`
- **Knowledge:** [CRO Landing](../../knowledge/growth/cro-landing.md), [GEO/SEO](../../knowledge/growth/geo-seo.md), [Funnel Domain And Privacy](../../knowledge/process/tool-recipes/funnel-domain-and-privacy.md), [Conversion Copy](../../knowledge/words/conversion-copy.md)

### UGC creator engine

_Before founder-led organic social, creator sourcing/contracts, format-discovery tests_

- **Role:** Marketing guru
- **Phases:** 6
- **Providers:** —
- **Reads:** `DESIGN.md`, `growth/VIRAL_GROWTH.md`, `growth/LAUNCH_NARRATIVE.md`, `growth/content-intelligence.csv`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `strategy/SIGNAL_CORPUS.md`
- **Consults:** —
- **Produces:** `growth/UGC_PLAYBOOK.md`, `ugc/script-bank.md`
- **Gates:** —
- **Knowledge:** [Influencer Sponsorship Engine](../../knowledge/growth/influencer-sponsorship-engine.md), [UGC Creator Engine](../../knowledge/growth/ugc-creator-engine.md), [Viral Growth Loops](../../knowledge/growth/viral-growth-loops.md), [Distribution-First Niche](../../knowledge/research/distribution-first-niche.md), [Distribution, Offer, And Signal Validation](../../knowledge/research/distribution-offer-signal.md), [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Fastlane growth ops

_After launch approval/public beta, or usefastlane.ai/Blitz setup, scheduling, social analytics_

- **Role:** Marketing guru
- **Phases:** 6
- **Providers:** —
- **Reads:** `DESIGN.md`, `growth/LAUNCH_NARRATIVE.md`, `growth/content-intelligence.csv`, `ugc/script-bank.md`
- **Consults:** —
- **Produces:** `growth/FASTLANE_OPS.md`
- **Gates:** `check:post-launch`
- **Knowledge:** [Fastlane Growth Ops](../../knowledge/growth/fastlane-growth-ops.md), [UGC Creator Engine](../../knowledge/growth/ugc-creator-engine.md), [Viral Growth Loops](../../knowledge/growth/viral-growth-loops.md), [Paid Tool Routing](../../knowledge/operations/paid-tool-routing.md)

## Analytics And Tracking

### Analytics & attribution blueprint

_Before locking onboarding/paywall/funnels/store CTAs or any prompt naming events_

- **Role:** Backend infrastructure engineer
- **Phases:** 1b
- **Providers:** —
- **Reads:** `strategy/RESEARCH.md`, `PRODUCT.md`, `state/business-state.json`
- **Consults:** —
- **Produces:** `analytics/ANALYTICS.md`, `analytics/analytics-plan.html`
- **Gates:** `check:analytics-catalog`, `check:attribution`
- **Knowledge:** [Analytics And Attribution](../../knowledge/data/analytics-attribution.md), [PostHog Agent Tooling](../../knowledge/data/posthog-agent-tooling.md), [HDYHAU Survey And Blended ROAS](../../knowledge/growth/hdyhau-blended-roas.md), [Artifact Contracts](../../knowledge/process/artifact-contracts.md), [Provider Proof](../../knowledge/process/provider-proof.md)

## Privacy, Security, And Legal

### Security architecture & release gate

_Before threat modeling, hardening, scans, or any security-readiness claim. Founder phrasing: checked nobody can hack in or steal data._

- **Role:** Security architect
- **Phases:** 1g, 5c
- **Providers:** `provider.security-review` (cli, manual), `provider.sentry` (api, cli, browser)
- **Reads:** `engineering/TECH_SPEC.md`, `strategy/TOOL_DECISIONS.md`
- **Consults:** `trust/SECURITY.md`, `trust/PRIVACY.md`, `revenue/REVENUE_OPS.md`
- **Produces:** `trust/SECURITY.md`, `trust/security-review.html`
- **Gates:** `check:security`
- **Knowledge:** [Privacy Terms](../../knowledge/trust/privacy-terms.md), [Security Release Hardening](../../knowledge/trust/security-release-hardening.md)

### Privacy & terms

_Before privacy policy, terms, EULA, subscription terms, account-deletion, store disclosures. Founder phrasing: legal pages about data we collect, and agreeing to terms._

- **Role:** Customer success
- **Phases:** 3
- **Providers:** —
- **Reads:** `state/LAUNCH_TRACE.md`, `engineering/TECH_SPEC.md`
- **Consults:** —
- **Produces:** `trust/PRIVACY.md`, `trust/TERMS.md`, `LEGAL_REVIEW.md`
- **Gates:** `check:privacy`
- **Knowledge:** [Privacy Terms](../../knowledge/trust/privacy-terms.md)

### Community and user safety

_When the product includes social, chat, creator, or other user-generated content_

- **Role:** Security architect
- **Phases:** 3, 5c
- **Providers:** —
- **Reads:** `PRODUCT.md`, `trust/PRIVACY.md`
- **Consults:** —
- **Produces:** `trust/COMMUNITY_SAFETY.md`
- **Gates:** —
- **Knowledge:** [Community And User Safety](../../knowledge/trust/community-safety.md)

### Generative-AI safety

_When the product generates text, images, audio, or video_

- **Role:** Security architect
- **Phases:** 3, 5c
- **Providers:** —
- **Reads:** `PRODUCT.md`, `trust/SECURITY.md`, `trust/PRIVACY.md`
- **Consults:** —
- **Produces:** `trust/AI_SAFETY.md`, `trust/AI_PROVIDER_CONTROLS.md`
- **Gates:** `check:ai-provider-controls`
- **Knowledge:** [Generative-AI Safety](../../knowledge/trust/generative-ai-safety.md), [Paid Generative-AI Controls](../../knowledge/trust/paid-generative-ai-controls.md)

## The Skill's Own Upkeep

### Runtime freshness gate (consumer side)

_Before substantial launch/design/store/revenue/build work when the installed runtime may be behind source_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `skill-version.json`
- **Consults:** —
- **Produces:** `skill-version.json`
- **Gates:** `check:skill-version`
- **Knowledge:** —

### Source-freshness maintenance (maintainer)

_Maintaining the skill, adding external URLs, refreshing third-party docs/commands_

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `SKILL.md`, `checks/validation/repository/source-registry.yaml`, `catalog/providers/capability-delta.yaml`
- **Consults:** —
- **Produces:** `checks/validation/repository/source-registry.yaml`, `catalog/providers/capability-delta.yaml`
- **Gates:** `check:source-freshness`, `check:provider-contracts`, `check:capability-delta`
- **Knowledge:** [Provider Contracts](../../knowledge/process/provider-contracts.md)

### Skill runtime sync & version discipline (maintainer)

_After any skill change — bump version, sync the installed runtime, run the readiness gate_

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `skill-version.json`
- **Consults:** —
- **Produces:** —
- **Gates:** `check:version-discipline`, `check:skill-version`
- **Knowledge:** [Run The Maintainer Audit From The Repository Root](../../knowledge/process/learnings/audit-runs-from-repo-root.md), [Provider Contracts](../../knowledge/process/provider-contracts.md)

### Founder-language translation (maintainer)

_Adding or renaming a lane, status, phase, autonomy mode, or provider route; any founder-visible surface change_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `tooling/lib/founder-copy.ts`
- **Consults:** —
- **Produces:** `tooling/lib/founder-copy.ts`
- **Gates:** `check:founder-copy`
- **Knowledge:** [No-Slop Writing](../../knowledge/words/no-slop-writing.md)

### Skill triggering contract (maintainer)

_Changing SKILL.md frontmatter, the skill description, or the trigger phrasing_

- **Role:** Product leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `SKILL.md`
- **Consults:** —
- **Produces:** `SKILL.md`
- **Gates:** `check:autopilot`
- **Knowledge:** [Technical Documentation In ASD-STE100](../../knowledge/engineering/technical-documentation-ste100.md)

### ASC command contract (maintainer)

_Before changing any documented asc command in knowledge/store/app-store-connect-cli.md_

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `knowledge/store/app-store-connect-cli.md`
- **Consults:** —
- **Produces:** `knowledge/store/app-store-connect-cli.md`
- **Gates:** `check:asc-command-contract`
- **Knowledge:** [Failure Cards](../../knowledge/process/failure-cards.md), [App Store Connect CLI](../../knowledge/store/app-store-connect-cli.md)

### Definition graph maintenance

_Changing a domain, workflow, phase, lane, artifact, gate, reference, or generated catalog projection_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `catalog/generated/routing.md`, `catalog/generated/spine.md`, `catalog/generated/contracts.md`, `catalog/generated/packs.json`, `catalog/generated/repository-profiles.md`
- **Consults:** —
- **Produces:** `catalog/generated/routing.md`, `catalog/generated/spine.md`, `catalog/generated/contracts.md`, `catalog/generated/packs.json`, `catalog/generated/repository-profiles.md`
- **Gates:** `check:catalog`, `catalog:render-routing`
- **Knowledge:** —

### Eval suite execution (maintainer)

_Adding, removing, or renaming a validator, a LaunchBench scenario, or an agent-behavior eval; before trusting that any of them still catch what they claim to. Also run `npm run launchbench` (scenario lint + validator fixture suite) directly, and `npm run evals:behavioral` by hand when a live-agent signal is worth the cost and variance._

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** `checks/validation/repository/evals/launchbench/`, `checks/validation/repository/evals/agent-behavior/`
- **Consults:** —
- **Produces:** `checks/validation/repository/evals/launchbench/`, `checks/validation/repository/evals/agent-behavior/`
- **Gates:** `check:agent-evals`
- **Knowledge:** [Failure Cards](../../knowledge/process/failure-cards.md)

### Learning capture (maintainer)

_After a solved and verified problem, a closed audit, or a post-merge lesson produces operating knowledge future runs should load_

- **Role:** Orchestrator
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** —
- **Consults:** —
- **Produces:** —
- **Gates:** `check:learning-grounding`
- **Knowledge:** [Learning Capture](../../knowledge/process/learning-capture.md)

### Learning corpus refresh (maintainer)

_A learning_grounding.review_overdue warning, a change to files a learning cites, or a scheduled corpus pass over knowledge/*/learnings/_

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** —
- **Consults:** —
- **Produces:** —
- **Gates:** `check:learning-grounding`
- **Knowledge:** [Learning Capture](../../knowledge/process/learning-capture.md)

### Source adoption (contributor)

_A post, repository, skill, library, screenshot utility, showcase, or managed provider is proposed for adoption_

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** —
- **Consults:** —
- **Produces:** —
- **Gates:** `check:catalog`
- **Knowledge:** —

### Upstream support maintenance (maintainer)

_An upstream tool, skill pack, library, or managed service releases a change, or a review is due_

- **Role:** Engineering leader
- **Phases:** Cross-phase (always-on)
- **Providers:** —
- **Reads:** —
- **Consults:** —
- **Produces:** —
- **Gates:** `check:upstreams`, `check:credits`
- **Knowledge:** —

<!-- catalog-generated:end node-contracts -->

<!-- catalog-generated:start provider-route-matrix -->
# Provider Access Routes

Generated from adapters/provisioning/requirements.ts. Edit the manifest, not this file.

| Provider | Capability | mcp | api | cli | browser | native_device | skill_pack | manual |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `provider.doppler` | secret-storage-and-injection |  |  | ✓ | ✓ |  |  |  |
| `provider.resend` | founder-digest-email |  | ✓ |  | ✓ |  |  |  |
| `provider.posthog` | product-analytics-and-attribution |  | ✓ |  | ✓ |  |  |  |
| `provider.revenuecat` | subscription-entitlements |  | ✓ |  | ✓ |  |  |  |
| `provider.stripe` | web-checkout-billing |  | ✓ | ✓ | ✓ |  |  |  |
| `provider.sentry` | crash-and-error-monitoring |  | ✓ | ✓ | ✓ |  |  |  |
| `provider.app-store-connect` | ios-distribution-and-testflight |  | ✓ | ✓ | ✓ |  |  |  |
| `provider.google-play` | android-distribution |  | ✓ |  | ✓ |  |  |  |
| `provider.paid-ad-channels` | paid-user-acquisition-spend |  |  |  |  |  |  | ✓ |
| `provider.refero` | ux-pattern-research |  | ✓ |  |  |  |  |  |
| `provider.higgsfield` | ai-generated-marketing-visuals | ✓ |  |  |  |  |  |  |
| `provider.mobai` | device-automation-and-demo-capture | ✓ |  | ✓ |  |  |  |  |
| `provider.security-review` | security-scanning-and-release-gate |  |  | ✓ |  |  |  | ✓ |
| `provider.app-store-screenshots` | store-screenshot-composition |  |  |  |  |  | ✓ |  |
| `provider.aso-skills` | aso-specialist-guidance |  |  |  |  |  | ✓ |  |
| `provider.in-app-ios-simulator` | local-device-proof |  |  |  |  | ✓ |  |  |

Not listed: `provider.codex-native-ios`, `provider.snapshot-previews`, `provider.serve-sim` — deliberately
undeclared local tooling sharing `provider.in-app-ios-simulator`'s no-secret shape (see
adapters/provisioning/requirements.ts).

<!-- catalog-generated:end provider-route-matrix -->
