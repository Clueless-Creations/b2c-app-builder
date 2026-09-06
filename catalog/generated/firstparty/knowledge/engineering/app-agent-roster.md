# App-Local Agent Roster

Use this when creating `AGENTS.md`, `CLAUDE.md`, `PROMPTS.md`, `engineering/ENGINEERING_PLAN.md`, builder-ready bundles, or any real app handoff that should continue after bootstrap.

Load `parallel-agent-orchestration.md` and `engineering-orchestration.md` first for orchestration rules. Load `artifact-contracts.md` for accepted file names and handoff structure. Load `onboarding-conversion.md` before assigning onboarding, first-value, paywall, review, analytics, identity, or lifecycle work.

## Required Output

Every real B2C app build or builder-ready package should include:

```text
AGENTS.md
CLAUDE.md
APP_AGENTS.md
agents/
  orchestrator.md
  operator-readiness.md
  research-strategist.md
  product-leader.md
  design-guru.md
  copy-specialist.md
  marketing-guru.md
  launch-surface-producer.md
  mobile-engineer.md
  backend-infrastructure-engineer.md
  accessibility-device-qa.md
  security-architect.md
  engineering-leader.md
  customer-success.md
```

Use `surfaces/workspace-template/repo-agent-entrypoints/` for the repo-root `AGENTS.md` and `CLAUDE.md`, then use `examples/workspace/business/engineering/app-agent-roster/` for `APP_AGENTS.md` and `agents/`. Install the portable `catalog.json`, `.b2c-launch/runtime.json`, and founder-owned `.b2c-launch/BUSINESS_CONTEXT.md` with them. Refresh managed prompts from the current skill version, preserve replaced prompt bytes for recovery, and never overwrite `BUSINESS_CONTEXT.md`.

## Role Model

The app-local roster is not a replacement for `AGENTS.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `engineering/TECH_SPEC.md`, `DESIGN.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, or `engineering/PRODUCTION_READINESS.md`. It is a lightweight routing layer for future agents. `AGENTS.md` remains the business-specific canonical guide and must explicitly tell future agents to continue using the `b2c` workflow instead of asking the founder to re-invoke it.

- Orchestrator owns sequencing, source truth, founder-zero business operations, `operations/BUSINESS_ACCESS.md`, its structured ledger, reducer-mediated `state/business-state.json`, orchestration, failure cards, validators, integration, git/release coordination, and final proof.
- Orchestrator owns Session Continuity: read `AGENTS.md`, durable state, both business/agent operations ledgers, orchestration/readiness/failure docs, and git status; do not rely on chat memory over durable state.
- Orchestrator assumes beginner founder knowledge. It runs `operator-readiness.md` once at orient,
  creates standing authority for routine external work, and combines missing access into one handoff.
- Orchestrator owns the generalized onboarding `ONB-00` through `ONB-22` graph, its single-writer artifact, evidence and architecture joins, canonical IDs, Compound Engineering handoff, cutover, and target-runtime verdict.
- Every prepared prompt has matching `catalog/roles.ts` and `catalog/operators.ts` records. A prompt that cannot be selected by the graph is a validation failure.
- Dispatch nesting is fixed: `AGENTS.md` → `.b2c-launch/BUSINESS_CONTEXT.md` → `APP_AGENTS.md` → specialist prompt → mandatory workflow references → matching role context-pack references → matching installed skills → current tool schemas. The always-on founder-language pack is present for every role. The worker returns an exact knowledge receipt. On the scheduled headless path (`kernel/session/run.ts`) the executor verifies the receipt per file (sha256, fail-closed) before the output reconciles; on the interactive subagent path the orchestrating session checks the returned receipt against the brief's load list itself before accepting the patch — no code enforces it there, so a missing or mismatched receipt is grounds to reject the output, not a formality.
- Research strategist owns source quality, customer language, market/category evidence, competitor evidence, and research-to-decision traceability.
- Product leader acts as the product and UX expert for ICP, scope, core loop, onboarding evidence joins, first value, activation, effort, question usefulness, canonical journey, retention, interaction behavior, and evidence-to-product traceability.
- Design guru acts as the visual-design expert for hierarchy, composition, design-system expression, authorized Onbo Hub and 60fps evidence packets, complete screen/control states, actual visual and interactive proofs, screenshots, icons, imagery, and motion.
- Copy specialist owns product copy, conversion copy, brand voice, comprehension, customer language, and claim discipline.
- Marketing guru acts as the marketing and growth expert for positioning, ASO, GEO/SEO, acquisition, lifecycle, conversion, reviews, channel learning, acquisition-message continuity, and competitor review evidence.
- Launch surface producer builds the local landing site after design acceptance. This role also keeps public surfaces synchronized with app changes.
- Mobile engineer owns iOS and Android architecture, implementation, performance, platform behavior, and focused mobile tests.
- Backend and infrastructure engineer owns data, API, auth, jobs, deployment, observability, and provider integration.
- Accessibility and device QA specialist owns assistive-technology checks, device coverage, locale and screen stress, and real-flow evidence.
- Security architect acts as the security and release reviewer for threat analysis, platform hardening, privacy controls, onboarding data minimization, identity and redemption protection, signing, store requirements, one-time transformation security, supply-chain checks, and readiness evidence.
- Engineering leader owns cross-stack integration review, plan coherence, onboarding state and analytics contracts, provider and policy integration, hard cutover, and unresolved frontend/backend/provider seams.
- Customer success owns support, FAQ/help, privacy/delete/refund/restore paths, competitor complaint root-cause coding, review suppression, lifecycle recovery, review responses, and feedback triage.

## Onboarding Graph Dispatch

When the request creates, audits, standardizes, replaces, or materially changes onboarding, the orchestrator loads `knowledge/experience/onboarding-conversion.md` and records the nested graph in `product/ONBOARDING.md`.

- Execute `ONB-00` through `ONB-22`.
- Fan out only read-only evidence or disjoint implementation packets.
- Join current guidance, competitor negative and positive reviews, authorized Onbo Hub flows, internal B2C doctrine, provider and policy capabilities, and 60fps motion references before architecture or screen design.
- Keep first value rendered, first value engaged, activation, retention, monetization, review eligibility, and onboarding completion distinct.
- Require canonical identity, journey, entitlement, analytics, experiment, review, permission, and lifecycle state.
- Require stable screen and control IDs, exact button behavior, complete paywall and error states, actual high-fidelity designs, and an interactive prototype.
- Earn review eligibility after meaningful value, but request through the native platform API outside first-run onboarding at a later natural success.
- Route the accepted graph to Compound Engineering planning and implementation.
- In replacement mode, preserve durable user value through an isolated one-time transformation, hard-cut to the new system, delete all replaced runtime and migration tooling, and run `check-onboarding-graph.ts`.

The orchestrator remains the single writer for `product/ONBOARDING.md`, state, canonical IDs, pricing, provider mutations, migration and cutover decisions, and the final verdict.

## Subagent Audit Pattern

For non-trivial launches, select the specialists that match ready work. Run independent read-only reviews in parallel. Keep edit scopes disjoint. Give each role only the bounded source set in its prompt.

- Product leader reviews `PRODUCT.md`, `product/experience/11-star-experience/11_STAR_EXPERIENCE.md`, `state/LAUNCH_TRACE.md`, `product/ONBOARDING.md`, first value, activation, effort, question usefulness, journey, and retention assumptions.
- Marketing guru reviews `strategy/RESEARCH.md`, onboarding competitor review evidence, acquisition-message continuity, `growth/LAUNCH_NARRATIVE.md`, `store/STORE_CONSOLE.md`, `GEO_SEO.md`, `growth/PAID_UA.md`, `growth/VIRAL_GROWTH.md`, `growth/UGC_PLAYBOOK.md`, `growth/FASTLANE_OPS.md`, and attribution-channel learning.
- Design guru reviews the authorized Onbo Hub atlas, 60fps motion register, `DESIGN.md`, `design/design-room.html`, `product/experience/11-star-experience/11-star-experience.html`, `product/onboarding.html`, actual prototype, critical screen states, screenshots, accessibility, and visual consistency.
- Launch surface producer uses `initial-build` mode when `DESIGN.md` is accepted. Use `impact-audit` mode before each accepted app slice merges.
- Orchestrator uses `operator-readiness.md` before build work and before an unattended resume with stale capabilities. This is a serialized provider prompt, not a specialist mutation lane.
- Engineering leader reviews `product/ONBOARDING.md`, `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md`, `store/APPLE_SIGNING.md`, canonical state and analytics, provider and policy contracts, cutover and deletion manifest, signing/release readiness, and test coverage.
- Security architect reviews onboarding data and threat contracts plus `trust/SECURITY.md`, `trust/security-review.html`, `trust/secrets/SECRETS.md`, `engineering/TECH_SPEC.md`, `revenue/REVENUE_OPS.md`, `analytics/ANALYTICS.md`, `growth/EMAIL_OPS.md`, `trust/PRIVACY.md`, `store/APPLE_SIGNING.md`, `engineering/PRODUCTION_READINESS.md`, scanner/review evidence, app-integrity posture, and accepted risks.
- Customer success reviews competitor complaint root causes, review eligibility and suppression, `trust/PRIVACY.md`, `trust/TERMS.md`, support routes, refund/restore/delete paths, lifecycle email, FAQ, and review-response readiness.
- Engineering leader and orchestrator review `trust/secrets/SECRETS.md` for each new secret, new env vars, Doppler/provider routing, `doppler run --` command wrappers, service token/provider-integration plan, CI/deploy injection, `.env.example` names-only coverage, and public-bundle safety.
- Orchestrator merges findings, resolves conflicts, updates source-of-truth docs, updates `operations/ORCHESTRATION.md`, commits typed state patches through the reducer to `state/business-state.json`, runs `check-onboarding-graph.ts`, and records proof or blockers in `engineering/PRODUCTION_READINESS.md`.

Specialist agents should review and propose by default. They may implement only when the orchestrator assigns an isolated unit with file paths, acceptance checks, forbidden actions, and a verification method recorded in `operations/ORCHESTRATION.md`. Specialists run headless. They never ask the user or wait mid-run for approval. On missing context, they return "Risks and blockers: needs_context" with the missing item, then stop. They never mutate shared state, stage, commit, spend, change protected pricing/legal/identity fields, or decide a final release. They may apply an approved provider mutation, public artifact, store-media/metadata update, or test-build upload only in an exact assigned workflow with a matching current standing envelope, before-state, and provider read-back.

Every prompt returns the same nine handoff headings. They are: Scope reviewed, Evidence, Findings, Recommendations, Files changed, Validation, Risks and blockers, Proposed state patch, and Knowledge receipt. The orchestrator accepts or rejects the proposed patch and is the only writer of shared state.

## Attribution Audit Gate

The product, engineering, and marketing roles must all check self-reported attribution when onboarding, signup, waitlist, or account creation exists:

- visible "How did you hear about us?" screen appears after the promise/demo but within the first third of onboarding/signup when the question materially supports launch learning
- source options use stable stored keys instead of display labels
- `other` includes sanitized free text or a documented follow-up field
- `attribution_source_selected` includes the stable key and technical context where available
- PostHog person properties include `self_reported_source`
- backend/profile storage persists the selected source when identity exists
- anonymous attribution is reconciled after signup/login
- tests or live smoke proof show event, person property, and backend/profile write

If any item is missing, do not call attribution wired, complete, or launch-ready. If attribution does not justify delaying first value, defer it or collect it contextually rather than making it a universal fixed screen.

## Acceptance

- `APP_AGENTS.md` points to canonical docs and states the orchestrator is the integration owner.
- `AGENTS.md` and `CLAUDE.md` are filled for the current business, not copied from this skill repo's maintainer docs.
- `AGENTS.md` tells future agents to keep using `b2c`, update `state/business-state.json` only through the reducer, and run validators until a founder-only gate.
- `AGENTS.md`, `CLAUDE.md`, `APP_AGENTS.md`, `.b2c-launch/runtime.json`, `.b2c-launch/BUSINESS_CONTEXT.md`, `catalog.json`, `operations/ORCHESTRATION.md`, and `state/business-state.json` encode the Session Continuity source set and next-action handoff.
- The orchestrator, specialist prompts, engineering integration prompt, and customer-success prompt exist and remain short enough to be used.
- The launch-surface prompt gives future agents exact initial-build, impact-audit, bounded-update, and approved-external-apply modes.
- Each role has clear onboarding graph responsibilities, forbidden actions, founder-only gates, and output shape.
- The roster gives future agents a clean way to audit and continue the app without duplicating product truth.
- The orchestrator can prove the onboarding graph joins, actual design proof, analytics contract, provider decisions, hard cutover, and target-runtime result.
- The orchestrator can show the founder current state through the session digest, keep orchestration decisions inspectable in `operations/ORCHESTRATION.md`, and keep known misses visible as failure cards.
- The orchestrator can prove business identity, Doppler, account/social access, recovery/2FA ownership, and one-next-action continuity through `operations/BUSINESS_ACCESS.md`, its ledger, and `check:founder-operator`.
