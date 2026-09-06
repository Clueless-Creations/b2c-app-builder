# {{APP_NAME}} App Agents

`AGENTS.md` is canonical. These role files are lightweight entrypoints for continuing the app after bootstrap. Do not duplicate product truth here; point back to the source docs.

## Source Docs

- Product: `PRODUCT.md`, with `strategy/RESEARCH.md`, `state/LAUNCH_TRACE.md`, and detailed experience contracts loaded only when the current decision needs them
- State, ownership, access, and external actions: `state/business-state.json`, `control/control.json`, `control/budget-ledger.json`, `run/run-state.json`, `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`, `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `LAUNCHBENCH.md`, `operations/FAILURE_CARDS.md`
- Installed runtime and business context: `.b2c-launch/runtime.json`, `catalog.json`, `.b2c-launch/BUSINESS_CONTEXT.md`
- Design: `strategy/BRAND.md`, `DESIGN.md`, `design/design-room.html`, `store/app-store-listing/SCREENSHOTS.md`, `growth/content-assets/CONTENT_ASSETS.md`, `growth/content-assets/content-assets.html`, `growth/DEMO_VIDEO.md`
- Onboarding and analytics: `product/ONBOARDING.md`, `product/onboarding.html`, `analytics/ANALYTICS.md`, `analytics/analytics-plan.html`
- Revenue, email, legal, store, secrets, security: `revenue/REVENUE_OPS.md`, `growth/EMAIL_OPS.md`, `trust/secrets/SECRETS.md`, `trust/SECURITY.md`, `trust/security-review.html`, `trust/PRIVACY.md`, `trust/TERMS.md`, `store/APPLE_SIGNING.md`, `store/APPLE_APP_STORE_REQUIREMENTS.md`, `store/app-store-listing/APP_STORE_LISTING.md`, `store/STORE_CONSOLE.md`
- Engineering: `engineering/TECH_SPEC.md`, `operations/ORCHESTRATION.md`, `engineering/ENGINEERING_PLAN.md`, `engineering/PRODUCTION_READINESS.md`

## Predetermined Specialist Prompts

- `agents/orchestrator.md`: state owner, integration owner, and final readiness gate.
- `agents/operator-readiness.md`: one-pass step-away capability, access, budget, and standing-authority setup.
- `agents/research-strategist.md`: market, customer, competitor, review, social-language, and source-quality evidence.
- `agents/product-leader.md`: expert product and UX review of the core loop, scope, onboarding, activation, retention, and interaction behavior.
- `agents/design-guru.md`: expert visual-design review of hierarchy, composition, tokens, components, imagery, motion, and cross-surface coherence.
- `agents/copy-specialist.md`: product and conversion copy, brand voice, comprehension, customer language, and claim discipline.
- `agents/marketing-guru.md`: positioning, ASO/GEO, acquisition, lifecycle, conversion, and measurable channel learning.
- `agents/launch-surface-producer.md`: local landing build and continuous synchronization across web, store, screenshot, price-copy, and marketing surfaces.
- `agents/mobile-engineer.md`: mobile architecture, implementation, performance, platform behavior, and focused mobile tests.
- `agents/backend-infrastructure-engineer.md`: data, API, auth, jobs, deployment, observability, and provider integration.
- `agents/accessibility-device-qa.md`: assistive technology, screen and locale stress, device coverage, and real-flow evidence.
- `agents/security-architect.md`: threat model, privacy and security controls, signing, store requirements, and release evidence.
- `agents/engineering-leader.md`: cross-stack integration review and engineering-plan coherence.
- `agents/customer-success.md`: support, FAQ, privacy/delete/refund/restore, lifecycle copy, monitored inbox/comment/review response queues, and feedback triage.

## Operating Rules

- Session Continuity: before role work after a new session, resume, status check, or handoff, the orchestrator reconstructs current state from `AGENTS.md`, `.b2c-launch/runtime.json`, `catalog.json`, `.b2c-launch/BUSINESS_CONTEXT.md`, `state/business-state.json`, `control/control.json`, `control/budget-ledger.json`, `run/run-state.json`, `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`, `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, `operations/FAILURE_CARDS.md`, and `git status --short`. Do not rely on chat memory; role prompts inherit this source set.
- The orchestrator owns reducer-mediated changes to `state/business-state.json`, `control/`, `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`, `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `operations/ORCHESTRATION.md`, active failure cards, sequencing, file-overlap checks, actual file collision checks, integration, git/release coordination, and `engineering/PRODUCTION_READINESS.md`.
- Onboarding work loads the routed `knowledge/experience/onboarding-conversion.md` reference and executes the nested `ONB-00` through `ONB-22` graph recorded in `product/ONBOARDING.md`. The orchestrator is the single writer for canonical onboarding state, IDs, pricing, provider decisions, cutover, and readiness. Specialists return evidence or implementation packets unless assigned disjoint paths.
- A rebuild, standardization, replacement, or from-first-principles onboarding request defaults to replacement mode: preserve durable user value through an isolated one-time transformation, hard-cut to the target system, and remove all old runtime code, state, events, provider configuration, tests, and documents. Do not invent an incremental compatibility project because the rebuild is difficult.
- Review eligibility may be earned after meaningful first value, but native review requests occur outside first-run onboarding at a later natural success in normal product use. No custom rating gate, sentiment pre-screen, or unobservable review-submission event is permitted.
- Assume beginner founder knowledge. The orchestrator offers one step-away setup at orient. It verifies required tools and roles, records standing authority, and combines missing access into one handoff.
- Consume current standing envelopes without another prompt. Website deploys, asset generation, approved store metadata/media, and test-build uploads should run unattended when their exact envelopes exist.
- Give each specialist only its read-first files and the files required by the current objective. Do not send the full chat transcript or the full repository context by default.
- Every dispatched worker reads `AGENTS.md`, then this file, then its role prompt. The generated node brief supplies mandatory task knowledge plus conditional role knowledge, nested skills, and current tool-discovery routes. Load mandatory paths before acting; load conditional routes only when their `when` condition matches.
- Invoke a matching installed nested skill rather than paraphrasing it. If an optional skill is unavailable, record the fallback and continue from the catalog knowledge. Discover current connectors, plugin tools, CLIs, browser, and native-device capabilities before declaring a route unavailable; current schemas and `--help` outrank stored command examples.
- Specialists review and propose by default. They implement only when assigned an isolated unit with exact allowed paths and focused verification.
- Specialists run headless: never ask the user or wait mid-run for approval. On missing context, return "Risks and blockers: needs_context" with the missing item, then stop.
- Specialists never mutate shared state, stage, commit, push, merge, spend, change protected identity/legal/pricing fields, or make release decisions. A specialist may perform a provider mutation, approved publication, store-media/metadata apply, or test-build upload only when its workflow assigns that exact action, the orchestrator supplies a current matching standing envelope and immutable target, and the specialist captures before-state plus provider read-back. The orchestrator alone reconciles the ledger, shared state, git, and final release decision.
- No role may print, paste, commit, screenshot, or log raw secret values. New secrets must be routed through `trust/secrets/SECRETS.md` and Doppler or the approved provider before work is called complete.
- Use parallel agents only for independent audits or isolated work with recorded file ownership; serialize shared files, migrations, provider/account mutations, device automation, git, releases, pricing/legal/public posting/submission decisions, and final readiness calls.
- When independent specialist reviews are ready, dispatch them together. Do not claim the manager pattern unless `spawned_agents` records a dispatch or `dispatch_reason` explains why no dispatch occurred.
- When `DESIGN.md` is accepted, dispatch the mobile build and local landing build together. Use `agents/launch-surface-producer.md` for the landing unit.
- When a landing, funnel, or web marketing surface is first built or meaningfully restyled, dispatch the vibecode audit pass from `vibecoded-tells.md` §Audit Pass with fresh context before that surface's lane advances.
- Isolated review (`knowledge/orchestration/isolated-review.md`): the agent that produces a surface never accepts it. Dispatch the node brief's `review.reviewedBy` roles as fresh-context auditors with read-only tools; the auditor brief carries the product files, the frozen rubric, the reference pack, and nothing from the producer. Auditors write only their findings artifact. Record every producer-to-auditor pair in the Review Ledger of `operations/ORCHESTRATION.md`; an unresolved high-severity finding blocks the next producer step.
- Before each accepted app slice merges, dispatch the launch-surface producer in `impact-audit` mode. Run bounded updates beside the next app slice.
- Run deterministic validators or LaunchBench scenarios where available before declaring launch-ready, and reconcile the outcome through the reducer into `state/business-state.json`.

## Fixed Handoff Schema

Every specialist returns only these headings so the orchestrator can compare and integrate outputs without interpreting a free-form essay:

- Scope reviewed
- Evidence
- Findings
- Recommendations
- Files changed
- Validation
- Risks and blockers
- Proposed state patch
- Knowledge receipt (`CONTRACT_FILES_LOADED`, `KNOWLEDGE_LOADED`, `ROLE_KNOWLEDGE_USED`, `SKILLS_USED`, `TOOLS_USED`; use `none` with a reason where a conditional route did not match)

## Required Audit Before Launch-Ready

- Product: 11-star V1 scalable slice, scope, onboarding, activation, and retention match evidence.
- Onboarding graph: `product/ONBOARDING.md` records all `ONB-00` through `ONB-22` nodes, evidence joins, first value, effort, state, screens, controls, paywall, analytics, review, design proof, implementation, and target-runtime cutover; `check-onboarding-graph.ts` passes.
- Onboarding evidence and design: competitor negative and positive reviews, authorized Onbo Hub flows, internal B2C guidance, current provider and policy capabilities, and 60fps motion references are dispositioned into actual screen designs, button behavior, an interactive prototype, analytics, tests, and deletion tasks.
- Emotional design: `product/experience/emotional-design/EMOTIONAL_DESIGN.md` or `product/experience/emotional-design/EMOTIONAL_AUDIT.md` maps applicable moments to Experience Cards, events, bright-line guardrails, reduced-motion fallbacks, and counter-metrics; `check:emotional-design` passes.
- Marketing: ASO, store console, Apple pre-ASC requirements, claims, UGC/Fastlane, GEO/SEO, and attribution channels are ready.
- Design: HTML proofs match `DESIGN.md`, no mobile clipping/overlap, `store/app-store-listing/SCREENSHOTS.md` separates raw captures from composed iPhone/iPad/Play assets, and generated/rendered content assets are traceable in `growth/content-assets/CONTENT_ASSETS.md`.
- Launch surfaces: the landing build exists, optional web onboarding matches the product, prices match approved revenue state, Apple/Google product pages stay synchronized, and the vibecode audit pass (`vibecoded-tells.md`) is clean: no Tier 1 trust breaker, terms and privacy linked, every present Tier 2 default tell carries a `DESIGN.md` derivation row, and `check:vibecoded-tells` reports no error.
- Engineering: app, backend, revenue, email, analytics, provider, Apple signing/release, and device paths are verified.
- Secrets: new env vars, webhook secrets, provider keys, CI/deploy secrets, and store credentials are listed in `trust/secrets/SECRETS.md` and injected through Doppler or the approved provider.
- Security: `trust/SECURITY.md`, `trust/security-review.html`, threat model, paid/free security-tool route, platform hardening, app integrity, Apple privacy manifest/purpose-string/ATT checks, revenue/webhook abuse controls, supply-chain checks, Sentry/release health, public reporting route, and accepted risks are current.
- Customer success: support, privacy, terms, delete, refund, restore, lifecycle, and review-response paths are ready.
- Review Ledger: `operations/ORCHESTRATION.md` holds one row per producer-to-auditor pair with a rubric version, a verdict, and an existing findings artifact; `check:orchestration` passes. A self-reviewed surface is not done.
- Attribution: stable source key, `other` free text, `attribution_source_selected`, PostHog `self_reported_source`, backend/profile persistence, and anonymous-to-identified reconciliation are proven when onboarding/signup/waitlist exists.
- Agent operations: capability inventory, exact approval scope, authenticated-browser/native action proof, research provenance, and cross-artifact reconciliation pass `check:agent-operations`.
- Founder-zero operations: business identity, Doppler, social/store account inventory, delegated access, recovery/2FA ownership, and one-next-action continuity pass `check:founder-operator`.
- State: `state/business-state.json` matches current artifacts, its reducer manifest is intact, and active failure cards are assigned or resolved with proof.
- Orchestration: `operations/ORCHESTRATION.md` records strategy, candidate units, serialized resources, subagent forbidden actions, output review, collision checks, integration, and validators.
