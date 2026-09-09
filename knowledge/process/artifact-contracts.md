# Artifact Contracts

These are the reusable document shapes from the model launch session. Keep docs concise enough to be read, but complete enough to block future drift.

## Contents

- Canonical File Map
- Core docs: `state/business-state.json`, `operations/BUSINESS_ACCESS.md`, `operations/business-access.json`, `operations/AGENT_OPERATIONS.md`, `operations/agent-operations.json`, `studio/seed/business.json`, `DESIGN.md`, `design/design-room.html`, `AGENTS.md`, `APP_AGENTS.md`, `strategy/TOOL_DECISIONS.md`, `SECRETS.md`, `trust/SECURITY.md`, `trust/security-review.html`, `analytics/ANALYTICS.md`, `analytics/analytics-plan.html`, `state/LAUNCH_TRACE.md`, `11_STAR_EXPERIENCE.md`, `11-star-experience.html`, `PRODUCT.md`, `strategy/RESEARCH.md`, and `strategy/BRAND.md`
- Design docs: authored root `DESIGN.md`, optional screen and flow specifications, optional `DESIGN_SYSTEM.md` appendix, and generated `design/design-room.html`
- Conversion docs: `product/ONBOARDING.md`, `product/onboarding.html`
- Launch ops: `LAUNCH.md`, `store/APPLE_SIGNING.md`, `store/APPLE_APP_STORE_REQUIREMENTS.md`, `store/APP_REVIEW.md`, `APP_STORE_LISTING.md`, `app-store-listing.html`, `app-privacy-questionnaire.html`, `store/STORE_CONSOLE.md`, `store/store-console.html`, `SCREENSHOTS.md`, `CONTENT_ASSETS.md`, `content-assets.html`, `STORE_OPS.md`, `PAID_UA.md`, `VIRAL_GROWTH.md`, `growth/UGC_PLAYBOOK.md`, `growth/FASTLANE_OPS.md`
- Business ops: `growth/EMAIL_OPS.md`, `revenue/REVENUE_OPS.md`, `GEO_SEO.md`, `growth/landing/surface-contract.json`, `trust/PRIVACY.md`, `trust/TERMS.md`, `LEGAL_REVIEW.md`
- Engineering docs: `engineering/TECH_SPEC.md`, `operations/ORCHESTRATION.md`, `engineering/ENGINEERING_PLAN.md`, `engineering/PRODUCTION_READINESS.md`, `LAUNCHBENCH.md`, `operations/FAILURE_CARDS.md`
- Handoff docs: `PROMPTS.md`, `AUDIT_PROMPT.md`, `agents/`

## Canonical File Map

Use this structure when the business is still pre-build or being handed to a builder. Generated projections such as `state/generated/requirement-inventory.json` are compiled output. Do not edit them as source. The accepted repository profile decides which front-door files apply; safety artifacts stay required when the capability is present.

```text
AGENTS.md                 # agent entrypoint and canonical operating instructions
CLAUDE.md                 # optional tool-specific addendum that points back to AGENTS.md
APP_AGENTS.md             # lightweight app-local role roster for ongoing build, growth, product, design, and support work
DESIGN.md                 # authored portable product and visual-design contract for coding agents
state/business-state.json        # reducer-owned project, lane, provider, pending-gate and continuity state
operations/BUSINESS_ACCESS.md        # founder-zero business identity, Doppler, account/social access, and one-next-action handoff
operations/business-access.json # structured operator bootstrap and exact account access state
operations/business-access.schema.json # portable machine contract for business access state
operations/AGENT_OPERATIONS.md       # human-readable capability, approval, authenticated-action, and research/media operations log
operations/agent-operations.json # structured capability inventory, approval envelopes, action proof, and reconciliation state
operations/agent-operations.schema.json # portable machine contract for the structured operations ledger
studio/seed/business.json       # structured screen, flow, platform, and review state for Design Room
design/design-room.html          # static rendered Design Room with design-state-hash
design/screens/           # optional detailed screen specifications linked by stable ID
design/flows/             # optional detailed flow specifications linked by stable ID
strategy/TOOL_DECISIONS.md         # paid/account-gated tool access, confirmed fallbacks, limitations, and blocked routes
SECRETS.md                # Doppler or approved secret-provider inventory, command map, CI/deploy routing, and proof notes
trust/SECURITY.md               # threat model, security tool routing, mobile/backend/revenue/email hardening, monitoring, accepted risks, release proof
trust/security-review.html      # rendered founder-facing security release board
doppler.yaml              # optional non-secret Doppler project/config hints
.env.example              # optional names-only local environment schema
analytics/ANALYTICS.md              # upfront measurement, attribution, event catalog, funnels, dashboards, and QA gates
analytics/analytics-plan.html       # founder-visible rendered analytics/attribution plan and dashboard wireframes
state/LAUNCH_TRACE.md           # evidence-to-product-to-brand/design-to-build-to-proof traceability matrix
11_STAR_EXPERIENCE.md     # 1/2/5/6/7/10/11-star product experience ladder and complete product experience
11-star-experience.html   # visual ladder, line of feasibility, and surface translation board
engineering/TECH_SPEC.md              # data/API/state/permission/integration contracts when actual implementation is in scope
operations/ORCHESTRATION.md          # parallel-agent/worktree preflight, candidate units, file ownership, serialized resources, integration, and verification
operations/orchestration.html        # optional founder-facing orchestration board
engineering/ENGINEERING_PLAN.md       # Compound Engineering plan or implementation plan when actual app build is in scope
engineering/PRODUCTION_READINESS.md   # end-to-end proof across frontend, backend, mobile device, providers, and release gates
LAUNCHBENCH.md            # optional eval/check history for known launch-grade failure modes
operations/FAILURE_CARDS.md          # recurring or unresolved launch risks that must survive session handoff
PROMPTS.md                # sequenced builder/Rork prompts
strategy/RESEARCH.md               # AppKittie, XPOZ, Firecrawl, review, keyword, and competitor evidence
PRODUCT.md                        # accepted product interpretation and routing contract
strategy/BRAND.md                  # name, voice, brand rules, copy calibration
DESIGN.md                 # authored design intent, interaction rules, and cross-surface guidance
DESIGN_SYSTEM.md          # optional expanded app-specific design appendix
product/ONBOARDING.md             # onboarding, personalization, review prompt, paywall timing, and activation contract
product/onboarding.html           # rendered execution record for onboarding, review-eligibility, paywall, and cutover decisions
LAUNCH.md                 # ASO, screenshots, ads, launch sequence, metrics
store/APPLE_SIGNING.md          # Apple Developer account, Team ID, bundle ID/App ID, signing, archive/export/upload, and TestFlight gates
store/APPLE_APP_STORE_REQUIREMENTS.md # Apple pre-ASC requirements: privacy manifest, required reason APIs, SDK manifests/signatures, App Privacy labels, purpose strings, ATT, review notes, upload warnings
store/APP_REVIEW.md         # Observe-only Apple review watch: capability receipt, three-layer state, founder blocker
APP_STORE_LISTING.md      # Apple listing, privacy, pricing, CPP/In-App Event, localization, and marketing packet
app-store-listing.html    # rendered founder-facing Apple listing copy/paste board
app-privacy-questionnaire.html # interactive Apple App Privacy worksheet
growth/EMAIL_OPS.md              # Resend/domain/lifecycle/broadcast/webhook/inbound email operations
revenue/REVENUE_OPS.md            # RevenueCat, Stripe, store products, web funnels, entitlements, and purchase validation
GEO_SEO.md                # public-site GEO/SEO, AI crawler, schema, llms.txt, and citability state
trust/PRIVACY.md                # privacy policy source draft and data-practices matrix
trust/TERMS.md                  # terms of service / EULA source draft
LEGAL_REVIEW.md           # founder/legal decisions, risk flags, source URLs, review status
store/STORE_CONSOLE.md          # copy-paste App Store Connect and Google Play Console packet with click paths and blockers
store/store-console.html        # rendered founder-facing mock console grouped by ASC/Play page
SCREENSHOTS.md            # device capture, composition, dimensions, locale, and upload matrix
CONTENT_ASSETS.md         # Higgsfield/Remotion/source-media route, source inputs, manifest, render proof, license status, and content QA
content-assets.html       # founder-facing media route and output proof board
STORE_OPS.md              # optional review, email-routing, console status, and post-launch growth state when submission is active
PAID_UA.md                # one-channel paid acquisition fit, creative cadence, tracking baseline, blended report, RevenueCat economics, stop/scale rules
VIRAL_GROWTH.md           # product-led viral loop fit, referral/share mechanics, content format lab, monetization timing, analytics proof, abuse controls, and stop/scale rules
growth/UGC_PLAYBOOK.md           # creator-led organic growth fit, 90-day Day 0 plan, budget, creator ops, scripts, tracking, stop/scale rules
growth/FASTLANE_OPS.md           # Fastlane workspace, connections, content engine, schedule, and analytics loop
OUTREACH.md               # endorsement/partner drafts when relevant
brand.html                # optional rendered brand book
landing/                  # optional pre-launch funnel
growth/landing/surface-contract.json # canonical input digests plus locale, pricing, onboarding, analytics, and screenshot reconciliation
engineering/SOURCE_CHANGE_MANIFEST.json # app-source checkpoint and typed changed-path manifest
screenshots/              # raw MobAI/native iOS/device captures, compositions, and final store upload assets
content-assets/           # Remotion/local media workspace, manifest, copy inputs, render inputs, and rendered outputs
fastlane/                 # campaign brief, prompts, angles, preferences, sanitized API logs, runs, schedules, metrics
ugc/                      # creator list, briefs, scripts, tracker, weekly review, sponsorship ledger, rights/disclosure notes
assets/                   # visual references, screenshot mockups, production assets embedded into HTML proofs
AUDIT_PROMPT.md           # independent audit brief for public funnel or app
agents/                   # simple role prompts/configs: orchestrator, marketing, engineering, security, product, design, customer success
```

`operations/AGENT_OPERATIONS.md` and its JSON ledger are required before browser, account/provider, social, or native-device operations are claimed ready. Use `frontier-agent-operations.md`; access is not authorization, and completed external mutations need exact-target preflight, a scoped approval envelope, sanitized before/after read-back proof, rollback/recovery, and canonical state reconciliation. Gate with `check:agent-operations`.

`operations/BUSINESS_ACCESS.md` and `operations/business-access.json` are required at broad-launch orient. Use `founder-zero-operator.md`: assume beginner founder knowledge, let the agent drive setup, keep the current phase visible, and use at most one versioned active gate with plain-language definitions, two or three AskUserQuestion-compatible choices, consequences, safe fallback/defer behavior, lifecycle, and next actions. Use `null` while the agent can continue without a founder decision; never invent a gate to fill the slot. Route accounts through founder-owned, scoped, revocable access with sanitized proof. Business access uses schema 2.1.0, including `forbiddenProviderProjects[]`. Mandate tables may mirror those names only. Unsupported schemas fail validation. Gate with `check:founder-operator`.

When handing to Rork or another generated-app builder, duplicate the needed subset into:

```text
rork-ready/
  README.md
  AGENTS.md
  CLAUDE.md
  APP_AGENTS.md
  state/business-state.json
  strategy/TOOL_DECISIONS.md
  SECRETS.md
  trust/SECURITY.md
  trust/security-review.html
  analytics/ANALYTICS.md
  analytics/analytics-plan.html
  state/LAUNCH_TRACE.md
  11_STAR_EXPERIENCE.md
  11-star-experience.html
  engineering/TECH_SPEC.md
  operations/ORCHESTRATION.md
  operations/orchestration.html
  engineering/ENGINEERING_PLAN.md
  engineering/PRODUCTION_READINESS.md
  LAUNCHBENCH.md
  operations/FAILURE_CARDS.md
  PROMPTS.md
  DESIGN.md
  design/design-room.html
  product/ONBOARDING.md
  product/onboarding.html
  store/STORE_CONSOLE.md
  APP_STORE_LISTING.md
  store/APPLE_SIGNING.md
  store/APPLE_APP_STORE_REQUIREMENTS.md
  CONTENT_ASSETS.md
  app-store-listing.html
  app-privacy-questionnaire.html
  content-assets.html
  store/store-console.html
  SCREENSHOTS.md
  PAID_UA.md
  VIRAL_GROWTH.md
  growth/UGC_PLAYBOOK.md
  growth/FASTLANE_OPS.md
  docs/
  orchestration/
  content-assets/
  growth/
  ugc/
  fastlane/
  agents/
  assets/
```

## `state/business-state.json`

Use `state/business-state.json` for every multi-lane launch, continuation, builder handoff, or launch-readiness audit. It is the compact state contract for agents and validators. Session updates report the same evidence and blockers.

Must include:

- project name, slug, owner, phase, platforms, bundle/package IDs, public URLs, and source-truth pointers
- autonomy mode, latest founder approval, and founder-only gates
- lane statuses with evidence paths and blockers
- paid/account-gated tool routes and provider setup state
- required secret names only, never values
- provider preflight, validation, fallback, docs checked date, and CLI/version basis when relevant
- analytics attribution contract completeness
- proof commands and evidence paths
- active and resolved failure cards
- top-level orchestration strategy, candidate units, serialized resources, spawned agents, collision checks, integration proof, and validator runs
- LaunchBench or validator run history when available

Acceptance:

- A future agent can tell which lane is blocked, partial, done, deferred, or not needed without rereading every artifact.
- The human handoff states what is proven, what is blocked, and what needs approval.
- No raw secrets, passwords, private keys, credential file contents, or real-looking placeholder values appear in the state or handoff.
- State changes when provider setup, signing, analytics, revenue, email, store, or proof changes.

## `AGENTS.md`

Use the shipped `surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md` as the starting point for generated business repos. Do not copy the skill repo's root maintainer `AGENTS.md` into a launch repo.

Must include:

- 60-second project brief
- an explicit instruction to continue using the `b2c` skill for broad launch/business work without asking the founder to re-invoke it
- source-of-truth file map
- `state/business-state.json`, LaunchBench/failure-card rules, and the current autonomy mode contract
- `state/LAUNCH_TRACE.md`, `11_STAR_EXPERIENCE.md`, `11-star-experience.html`, and `engineering/TECH_SPEC.md` when they exist
- brand voice rules and banned/owned words
- `DESIGN.md` and HTML visual-proof enforcement rules
- onboarding, review prompt, paywall, closing offer, and activation rules when in scope
- architecture conventions
- complete accepted scope, explicit non-goals, and prohibited scope
- analytics rules
- secret-management rules: `SECRETS.md`, Doppler or approved provider, `.env.example` names only, no raw secret values in docs/logs/proofs, and `doppler run --` or approved wrapper for secret-bearing commands
- security rules: `trust/SECURITY.md`, `trust/security-review.html`, threat model, security tool routing, OWASP MASVS/ASVS basis, mobile platform hardening, app-integrity decision, entitlement/webhook abuse controls, supply-chain checks, monitoring/incident response, accepted risks, and `check:security`
- Compound Engineering routing, `operations/ORCHESTRATION.md`, safe parallel-agent/worktree rules, and when to use `ce-brainstorm`, `ce-plan`, `ce-work`, review, and proof skills
- app-local agent roster pointer to `APP_AGENTS.md` and `agents/`, including orchestrator ownership and specialist audit roles
- MobAI/native iOS/device testing rules and serialized device ownership
- paid-tool routing and approved MobAI/XcodeBuildMCP fallback rules plus SnapshotPreviews/serve-sim limitations
- UGC/Fastlane growth rules when social distribution is in scope
- backend/frontend E2E and production-readiness gates
- common agent mistakes
- verification requirements

Acceptance:

- An agent can answer "what should I read first?"
- The file is business-specific: product, stack, repo paths, scope, provider state, and launch phase are filled for the current app.
- A future agent knows to load the next needed skill reference, update `state/business-state.json`, and run validators before pausing for anything other than a founder-only gate.
- Banned scope is explicit enough to stop feature creep.
- Implementation rules are specific to the stack.
- A future engineering agent knows when to use parallel agents and when to serialize MobAI, git, migrations, releases, or shared-file edits.
- A future app-management agent knows which local role prompt owns product, marketing, engineering, design, or customer-success follow-up.
- A future agent updates `state/business-state.json` before claiming completion or crossing a launch phase.

## `APP_AGENTS.md` And `agents/`

Use for real app builds, generated-app handoffs, or post-launch management packages. Keep these lightweight; they are role entrypoints, not a second product spec.

Must include:

- one orchestrator role that owns source-of-truth docs, `state/business-state.json`, failure cards, sequencing, worktree/subagent safety, integration, git/release coordination, and `engineering/PRODUCTION_READINESS.md`
- one marketing guru role for ASO, GEO/SEO, Fastlane, UGC, attribution learning, reviews, launch calendar, claims, and channel experiments
- one engineering leader role for `engineering/TECH_SPEC.md`, `engineering/ENGINEERING_PLAN.md`, frontend/backend/provider integration, test strategy, observability, and production-readiness evidence
- one product leader role for ICP, problem framing, accepted scope and explicit non-goals, onboarding, activation, retention loops, and evidence-to-product traceability
- one design guru role for `DESIGN.md`, `design/design-room.html`, `CONTENT_ASSETS.md`, visual QA, accessibility, screenshots, icons, motion, Higgsfield asset use, and Remotion rendered content
- one customer success role for support email, help/FAQ, privacy/delete/refund/restore paths, review responses, lifecycle copy, and feedback triage
- one security architect role for `trust/SECURITY.md`, security tool routing, threat model, platform hardening, app integrity, abuse controls, scanner/review evidence, accepted risks, and incident response
- each role's inputs, outputs, forbidden actions, and when to ask the founder
- a note that role agents review and propose by default; implementation requires orchestrator assignment, file-overlap check, and integration proof

Minimum `agents/` files:

- `agents/orchestrator.md`
- `agents/marketing-guru.md`
- `agents/engineering-leader.md`
- `agents/product-leader.md`
- `agents/design-guru.md`
- `agents/customer-success.md`
- `agents/security-architect.md`

Acceptance:

- `APP_AGENTS.md` points each role to canonical docs instead of duplicating them.
- The orchestrator can launch parallel audits against the skill definition without letting specialists stage, commit, release, or edit overlapping files independently.
- Product, design, marketing, engineering, security, and support follow-up work has a named owner after bootstrap.

## `operations/ORCHESTRATION.md` And `operations/orchestration.html`

Use before broad multi-lane launch work, subagent dispatch, worktree routing, production-readiness sweeps, or app handoff prompts that imply parallel agents.

Must include:

- orchestration preflight: current objective, critical path kept local, selected strategy, manager-pattern owner, and rationale
- candidate units: role, objective, mode, expected output, input docs, files, shared resources, parallel-safe decision, and status
- parallel safety check: declared file overlap, shared mutable resources, serialized units, worktree needs, and actual file collision check after agents return
- file ownership: which files the orchestrator owns and which paths specialists may edit
- serialized work: provider/account mutations, credentials, device automation, git, releases, pricing/legal/public posting/submission, and final readiness decisions
- standard subagent instructions with forbidden actions: no staging, commits, pushes, merges, project-wide suites, provider mutation, device ownership, credential changes, public posting, submissions, or founder-only decisions
- integration plan: review outputs, accept/reject findings, resolve collisions, update state/failure cards, run focused validators, then full suites
- verification: focused validator commands, full-suite commands, proof paths, and unresolved blockers
- founder-only gates and active failure cards

Acceptance:

- `state/business-state.json` links orchestration evidence through its lane; the detailed execution plan stays in `operations/ORCHESTRATION.md`.
- Parallel-safe units do not share write files or mutable resources unless isolated in worktrees and integrated serially.
- Subagent outputs are reviewed before any done/readiness claim.
- The orchestrator owns `state/business-state.json`, `operations/ORCHESTRATION.md`, `engineering/PRODUCTION_READINESS.md`, git, provider/device mutations, and final launch judgment.
- `npm run check:orchestration -- --root .` passes or leaves named blockers/failure cards.

## `strategy/TOOL_DECISIONS.md`

Use when paid or account-gated tools affect research, visuals, testing, store ops, revenue, email, analytics, UGC, or post-launch growth.

Must include:

- a `## Workflow intake` section with `Selected route: recommended-set`, `pick-next`, `defer-optional`, or an explicit `no optional tools` row before paid-tool routing succeeds
- required tools that stay in force (App Store Connect CLI and the live portfolio when that graph applies)
- tool and lane
- intended paid/account-gated workflow
- runtime access status
- founder confirmation or blocker
- selected route: paid, export, fallback, blocked, deferred
- fallback limitation and confidence impact
- downstream artifacts affected
- date checked

Research-intelligence defer (AppKittie, XPOZ, Firecrawl, paid ASO) records `fallback` and continues the evidence lane labeled. Spend-gated defer records `deferred` and authorizes no generate path.

Acceptance:

- No fallback work is mistaken for the intended paid-tool workflow.
- A future agent can tell whether AppKittie, XPOZ, Firecrawl, Higgsfield, MobAI, Fastlane, paid ASO/MMP tools, creator marketplaces, RevenueCat, Stripe, PostHog, Resend, App Store Connect, or Google Play access was used, blocked, deferred as no-spend, or continued as labeled fallback.
- Founder-only spend, account, credential, posting, and submission decisions are explicit.
- Workflow start asked once; tools named at intake were not asked again.

## `SECRETS.md`

Use whenever the launch uses API keys, tokens, OAuth credentials, webhook signing secrets, service-account files, app-store credentials, CI/deploy environment variables, mobile build secrets, local `.env` files, or provider CLIs.

Must include:

- selected provider: Doppler by default, or founder-approved alternative such as Apple Keychain, GitHub Actions secrets, Cloudflare/Vercel/Supabase secrets, Xcode Cloud secrets, or local `.env` fallback
- secret inventory: name, service, class, environment, runtime surface, public/server-only status, location, owner, rotation note, and status
- Doppler project/config map or alternate provider location for local, staging, and production
- command map for local dev, tests, builds, deploys, migrations, webhook replay, store automation, and support scripts
- CI/deploy map for `DOPPLER_TOKEN`, service tokens, provider integrations, OIDC, or platform-native secret injection
- new-secret routing log for secrets discovered during implementation
- founder-only actions and blocked secrets
- proof notes that record location and command evidence, never raw values
- matching `state/business-state.json` provider entries with required secret names, docs checked date, preflight, validation, and fallback limitations

Rules:

- Commit `SECRETS.md`, optional `doppler.yaml`, and optional `.env.example` with names only.
- Do not commit `.env`, `.env.local`, service-account JSON, `.p8`, `.p12`, provisioning files, OAuth refresh tokens, raw API keys, or downloaded credential files.
- Use `doppler run -- <command>` for local secret-bearing commands when Doppler is selected.
- Use Doppler service tokens, provider integrations, OIDC, or platform-native secrets for CI/live environments; do not use personal or local CLI tokens in production.
- When a new secret, `process.env`, `import.meta.env`, mobile build setting, webhook secret, provider key, or CI secret appears, update `SECRETS.md` before calling the work complete.

Acceptance:

- A future agent can run secret-bearing commands without asking where values live.
- No raw secret values appear in docs, commits, screenshots, logs, or readiness proof.
- Public client config is separated from server-only secrets.
- Production secret injection is different from local personal login.
- `state/business-state.json` shows names-only secret requirements and provider status without exposing values.

## `trust/SECURITY.md` And `trust/security-review.html`

Use when a launch includes mobile code, backend state, public web surfaces, accounts, payments, email, analytics, store submission, or any provider that mutates user state.

Must include:

- source basis: current OWASP MASVS/MASTG, OWASP ASVS, Apple, Android, Sentry, Claude Security, Codex Security, MobSF, and scanner docs used where relevant
- security review tool routing: intended paid/account-gated routes, founder approval or blocked state, selected free fallback, and limitations
- threat model: assets, trust boundaries, attacker capabilities, abuse paths, mitigations, and non-capabilities
- data classification: public, user personal data, purchase data, secrets/signing material, logging and retention rules
- mobile hardening: iOS Keychain, App Transport Security, App Attest/DeviceCheck, entitlements/deep links; Android Keystore, Network Security Config, Play Integrity, exported components/deep links
- authentication and authorization, including anonymous/authenticated/subscriber/admin/deleted states
- backend/API controls: validation, authz/RLS, rate limits, idempotency, webhook signature verification, retries, admin access, and audit logs
- revenue/entitlement abuse controls for RevenueCat, Stripe, app-store purchases, restores, refunds, promo grants, and support-granted entitlements
- privacy/analytics controls: PostHog, session replay/surveys, PII scrubbing, attribution free text, Sentry, store disclosures, and data deletion
- email/domain controls: Resend, SPF, DKIM, DMARC, unsubscribe/preference handling, inbound/reply, webhook signing, support/privacy/security aliases, and `security.txt` when public users are in scope
- supply-chain and build controls: dependency review, SDK inventory, lockfiles, generated-code review, secret scans, CI, signing material, and no raw secrets
- monitoring and incident response: release health, alerts, rollback/kill switch, support escalation, store crash reports, public reporting route
- accepted risks: owner, reason, expiry or revisit date, compensating control, evidence, and founder approval where required
- release checks: validator/scanner/review outputs or blocked-route evidence

Rules:

- Do not call security done from prose alone.
- Do not silently replace Claude Security, Codex Security, GitHub Advanced Security, Snyk/Semgrep/Socket, MobSF Cloud, or commercial app-integrity tools with free fallbacks.
- Do not enforce App Attest, DeviceCheck, or Play Integrity in a blocking way until telemetry and founder approval support the rollout.
- `trust/security-review.html` should render the plan and open risks for founder review, using the app's design system when available.

Acceptance:

- A future agent can identify security-critical flows and tests without re-threat-modeling the whole app.
- Store privacy answers, `trust/PRIVACY.md`, `analytics/ANALYTICS.md`, `engineering/TECH_SPEC.md`, `revenue/REVENUE_OPS.md`, and `engineering/PRODUCTION_READINESS.md` agree with `trust/SECURITY.md`.
- `npm run check:security -- --root .` passes or produces named blockers/failure cards.
- Remaining risks are explicit instead of hidden inside launch-readiness language.

## `state/LAUNCH_TRACE.md`

Structural floor: Decision Trace with TRACE-<n> IDs, Rejected Decisions, Founder-Only Decisions, Blockers, Verification, strategy/RESEARCH.md/PRODUCT.md links; no placeholders when the traceability lane is done.

Use for any multi-artifact launch so the chain from research to implementation does not drift.

Must include:

- evidence index with source, date, tool/query/URL, confidence, and affected decision area
- decision trace table with stable IDs
- research finding, product experience decision, product decision, brand/design decision, build contract, analytics/revenue/privacy/store impact, verification method, and status
- rejected decisions and why
- founder-only decisions and approval status
- implementation blockers and proof blockers

Acceptance:

- A future agent can explain why each major screen, claim, onboarding question, paywall behavior, event, data collection, and store-console answer exists.
- The 11-star ladder and complete product experience have trace rows before design and engineering harden.
- Brand/design work cites research/product trace rows.
- `engineering/ENGINEERING_PLAN.md`, builder prompts, and production-readiness checks can reference trace IDs instead of restating context.

## `11_STAR_EXPERIENCE.md` And `11-star-experience.html`

Use before `PRODUCT.md`, design, onboarding, ad/store concepts, content assets, or engineering plans are treated as ready. This is the product's experience north star, not a mood board.

`11_STAR_EXPERIENCE.md` must include:

- experience thesis: target user, ordinary world, desired transformation, magical moment, and why the user would retell it
- 1/2/5/6/7/10/11-star ladder with product-specific labels, user scenes, implied behavior, emotional reaction, and learning
- visible line of feasibility separating the complete accepted product, explicitly agreed manual support, exploratory inspiration, and non-goals
- complete product experience with product behavior, data/state/API needs, design/motion needs, analytics proof, and production-readiness proof
- surface matrix for product, onboarding, paywall, ad/creator hook, App Store screenshots, landing, lifecycle email, support, and engineering
- traceability rows that connect experience decisions to `strategy/RESEARCH.md`, `PRODUCT.md`, `DESIGN.md`, `product/ONBOARDING.md`, `engineering/TECH_SPEC.md`, `state/LAUNCH_TRACE.md`, and `engineering/PRODUCTION_READINESS.md`

`11-star-experience.html` must include:

- visual vertical or staged ladder similar in structure to the 1/2/5/6/7/10/11-star framework, but with product-specific labels
- line of feasibility shown as a visible break or band
- complete product experience summary
- surface translation board for product, onboarding, paywall, ads, App Store, landing/email/support, and engineering
- references to the canonical docs that consume the decisions

Acceptance:

- The product doc has a `11-Star Experience` section or pointer to this artifact.
- The visual board can be opened by the founder before implementation.
- The accepted product experience is narrow enough to build but strong enough to shape design, ad creative, screenshots, onboarding, and technical contracts.
- No structural gap is left silent — an active failure card records any known miss.

## `engineering/TECH_SPEC.md`

Use when app, backend, or web-funnel implementation needs precise contracts beyond visual screen specs.

Must include:

- source docs and trace IDs
- 11-star complete product experience and magical-moment contracts when the experience lane is in scope
- architecture overview and repo boundaries
- auth/session model, anonymous-to-known transition, roles, logout/reset behavior
- data model: entities, fields, ownership, retention, deletion, indexes, migrations, and seed fixtures
- API/RPC/webhook contracts: route, method, auth, request, response, errors, idempotency, rate limits, and retry behavior
- state machines: onboarding, account, entitlement, subscription, restore, deletion, support, lifecycle messaging, offline/cache
- permissions/platform capabilities and just-in-time prompts
- integration contracts for analytics, revenue, email, crash, backend, push, AI, Fastlane, store notifications, and support tools
- secret contract: environment variable names, public/server-only classification, secret-provider location, runtime injection path, and rotation/proof requirements
- app integrity/abuse decision: Apple App Attest/DeviceCheck, Google Play Integrity, bot/rate-limit protections, replay/idempotency protection when in scope
- remote config, feature flags, kill switches, staged/phased rollout controls, and test fixtures

Acceptance:

- A builder does not invent schema, endpoint, state, permission, provider, or fixture behavior.
- `engineering/PRODUCTION_READINESS.md` can test frontend/device actions against backend/provider truth.
- Privacy, store, analytics, and revenue disclosures trace to actual implementation behavior.

## `CLAUDE.md`

Use when Claude Code, Rork, or another builder expects Claude-specific guidance.

Use the shipped `surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md` as the starting point for generated business repos. Do not copy this skill repo's root maintainer `CLAUDE.md`.

Must include:

- one-line pointer that `AGENTS.md` is canonical
- one-line reminder to continue using `b2c` for launch/business work without another founder prompt
- Claude-specific skill/plugin notes only when they differ from general agent guidance
- a warning not to duplicate product truth from `AGENTS.md`

Acceptance:

- Claude can find the same canonical docs without creating a second source of truth.
- Product, design, analytics, and engineering rules remain in `AGENTS.md` unless truly Claude-specific.

## `analytics/ANALYTICS.md`

Must include:

- vendor and identity model, including the identity map: anonymous ID, app user ID, auth UID, PostHog distinct ID, RevenueCat App User ID, Stripe customer ID, email ID, push token, referral code
- current PostHog docs checked, date checked, and stack-specific doc links
- PostHog host/region and project-grouping decision
- north-star metric and launch learning questions
- super-properties
- naming convention
- attribution model: UTMs, click IDs, referrer, deep links, referral/creator codes, vanity URLs, store/ad-platform limits, and self-reported source
- self-reported attribution data contract: stable source keys, `other` free text, `attribution_source_selected`, PostHog person properties, backend/profile fields, anonymous-to-identified reconciliation, and QA evidence
- HDYHAU survey rules: randomize option order, multi-select, include TV/offline, mid-onboarding placement, blended ROAS via `growth/paid-ua-report.csv`, and AppsFlyer handoff criteria
- web events if a landing funnel exists
- iOS/mobile events by flow
- backend/provider events for purchases, entitlements, webhooks, email, and referral truth
- email lifecycle events if Resend or another email provider is used
- subscription lifecycle events
- web checkout and entitlement events when RevenueCat/Stripe/web funnels exist
- funnel definitions and targets
- dashboard/insight definitions, feature flag and experiment registry, session replay/survey posture, privacy notes, and QA checklist
- dashboard and QA checklist

Rules:

- Use snake_case event names.
- Mirror events across surfaces when the concept is the same.
- Do not invent event names in build prompts; update the catalog first.
- Public analytics tokens may live in public bundles only when the vendor documents them as publishable/write-only. Service keys never go into git.
- Render `analytics/analytics-plan.html` before builder handoff or launch so the founder can inspect the measurement plan, attribution map, funnel cards, and blocked credentials visually.
- Do not call attribution wired if it only emits an event or updates local state; `self_reported_source` must reach PostHog person properties and backend/profile storage where identity exists.

## `engineering/ENGINEERING_PLAN.md`

Use when the actual app, backend, or web funnel will be implemented by Codex, Claude, Rork, or another builder.

Must include:

- origin docs, `state/LAUNCH_TRACE.md` IDs, and requirements trace
- product brainstorm source when `ce-brainstorm` was used
- `engineering/TECH_SPEC.md` pointer or an inline technical contract section when implementation contracts are in scope
- architecture and repo boundaries
- implementation units with repo-relative paths
- orchestration source: `operations/ORCHESTRATION.md`, `state/business-state.json` strategy, candidate units, safe parallel lanes, serial dependencies, shared files/resources, actual collision check, and worktree needs
- frontend, backend, database, analytics, revenue, email, privacy, and store-console impacts
- secret impacts: new/changed env vars, Doppler/provider routing, `.env.example` updates, CI/deploy injection, and bundle-safety checks
- test scenarios for each unit
- MobAI/native iOS/device E2E scenarios
- backend/provider verification scenarios
- production-readiness gates and blockers

Acceptance:

- It can be passed to `ce-work` or a builder without re-deciding product behavior.
- It explains where parallel agents are safe and where orchestration must stay serial.
- It keeps implementation units tied back to launch docs rather than standalone tasks.

## `engineering/PRODUCTION_READINESS.md`

Use before declaring an app build ready for beta, store submission, or production launch.

Must include:

- build/typecheck/lint/test commands and outcomes for every touched repo
- frontend/browser E2E evidence when web surfaces exist
- MobAI mobile E2E evidence when app flows exist: independently checked desktop/MCP/CLI versions, selected Free/Plus/Pro tier, an existing `.mob` flow and run artifact for every supported platform, provider correlation, reviewed AI-heal diff plus passing rerun when used, explicit repeat bounds, and host-script endpoint/secret/cleanup/backend-proof attestation; or Codex Desktop native iOS/XcodeBuildMCP evidence with founder-confirmed coverage limitations when MobAI is unavailable
- in-app iOS Simulator evidence (rung 0) when used: agent surface and app version, the plan/policy gate cleared, that the session was local (not cloud or SSH), the simulated device and OS, the fixture or sandbox account used instead of a real account, screenshot/recording paths committed into the repo, backend/provider correlation for any flow that mutates state, and the coverage the route does not provide — no Android, no physical device, no distribution readiness
- SnapshotPreviews preview proof when used: package/version/commit, `SnapshotTest` or `PreviewLayoutTest`, `TEST_RUNNER_SNAPSHOTS_EXPORT_DIR`, exported PNG/JSON paths, and preview-only limitation
- serve-sim simulator proof when used: booted simulator/device, preview URL/port, actions/logs, stream evidence paths, and provider/signing limitations
- backend/database proof for frontend actions, including real test records or provider logs
- RevenueCat/Stripe entitlement proof when monetized
- PostHog analytics proof when events are in scope
- self-reported attribution proof when onboarding/signup/waitlist exists: early screen, stable stored key, `other` free text, PostHog person property, backend/profile write, and anonymous-to-identified stitching
- Resend/email/webhook proof when lifecycle or transactional email is in scope
- Sentry/crash/release-health status or a documented no-Sentry reason
- security release proof: `trust/SECURITY.md`, `trust/security-review.html`, `check:security` output, scanner/security-review evidence or founder-approved blocked route, app-integrity decision, accepted risks, and incident-response route
- release-build or staging-build proof that mocks are disabled and secrets are not bundled
- `check:native-ios` result when iOS engineering, screenshots, app-preview, or production-readiness lanes are in scope
- `check:mobai-proof` result when MobAI is used or claimed as mobile engineering proof
- secret-management proof: `SECRETS.md` coverage, Doppler/provider setup, `doppler run --` or approved command wrapper, CI/deploy injection, secret scan, and public-bundle check
- remaining blockers and founder-only gates

Acceptance:

- Unit tests alone are not enough.
- A reviewer can trace a user action from frontend/device to backend/provider state.
- Blocked E2E flows are explicit and do not get flattened into "done."

## `PRODUCT.md`

Structural floor: Promise, 11-Star Experience, Category And Competitors, Differentiation And Moat, Core Product Loop, Complete Product Experience, Monetization Posture, Metrics, Acceptance Contract, Risks And Open Questions; at done, no placeholders plus a real incumbent row, a named moat class, and the one-week-copy test answer.

Must include:

- one-line promise
- `11-Star Experience` section or pointer to `11_STAR_EXPERIENCE.md` and `11-star-experience.html`
- problem/villain language
- evidence for the language
- category/storefront strategy
- competitor threat model
- Differentiation And Moat: incumbent table (top by revenue, beat moment, week-one-copy blocker), named moat class with build plan, one-week-copy test answer — held to `product-moat.md`
- core product loop
- aha moment and onboarding sequence
- monetization and paywall posture
- viral/referral loops
- feature surfaces
- tech architecture
- metrics
- roadmap
- risks and open questions
- evidence appendix

Acceptance:

- The spec explains why the app can win, not just what it does.
- The spec names the magical moment and complete product experience before engineering planning.
- The category strategy uses store data, not internal language.
- The moat is stated as a bundle of advantages, not one vague differentiator.

## `strategy/RESEARCH.md`

Validator: `npm run check:research -- --root . --state state/business-state.json` preserves the pre-claim template behavior. It enforces the full structural floor when the lane is done or the pre-build verdict is mandatory. The `research-backed-spec` workflow uses `check:research-workflow-output`. This strict wrapper requires complete claimed outputs even when the lane is still `not_started` or `partial`. The floor covers Source Ledger, Decision Inputs, Decision Log, Rejected Claims, Category Revenue Reality, Distribution Proof, Transformation Demo, Distribution-First Niche, Go, Pivot, Or Kill, and trace pointers. It also covers dated evidence, a judged revenue bar, signal lifecycle, offer response, a founder-decided verdict mirrored to state, and template placeholders.

Use when research spans app stores, social platforms, competitor websites, reviews, creators, keywords, pricing, or paid acquisition signals.

Must include:

- research date, target country/market, tool/source, query, and limits/credit budget
- Category Revenue Reality: top-competitor revenue rows with sources, a stated bar, and an explicit pass/fail judgment
- Transformation Demo: one screenshot path, a 15s script, a before-to-after change, and why it is not a vitamin
- Distribution-First Niche: paying audience, one named channel, and purchases as validation (not compliments)
- Distribution Proof: one audience, exact discovery location, native format, owned relationship, measured signal, and resolved evidence IDs
  - A ledger ID must occur in a complete Source Ledger row's URL/source-ID or Artifact/trace cell.
  - A Signal ID must have a `current` or `dated` status.
- `strategy/SIGNAL_CORPUS.md`: validated Corpus Inputs and atomic claims whose Source IDs resolve to those inputs
  - Each claim includes dates, applicability, confidence, lifecycle, supersession, and trace pointers.
  - Keep unverified, rejected, and superseded history, but do not use it for Distribution Proof or Derived Outputs.
  - When no reusable source exists, write a project-specific `Status: not applicable —` reason. Do not add fabricated rows or placeholder reason text.
- `strategy/OFFER_TEST.md`: one project-specific value for each test-contract field, measured exposure and CTA response, and a founder decision
  - An option menu is not a completed field.
- Go, Pivot, Or Kill: the pre-build verdict row with category, wedge, demand, distribution, and offer evidence
- the verdict mirror in `lanes.research.go_pivot_kill_decision`
- AppKittie findings: category economics, competitors, downloads/revenue estimates, IAP/pricing, screenshots, ad presence, creator partnerships, contact/social links, review themes, and keyword results
- XPOZ findings: platform, query, creator/subreddit/handle, post/comment evidence, user language, emotional register, objections, and ad/organic content formats
- last30days findings, when a last30days brief was authorized and the host engine ran: topic, recency window, run date, sources that returned evidence versus sources that failed or were skipped, engagement-backed quotes with resolvable references, and what the brief changed. Do not invent this section when the engine did not run.
- Firecrawl/web findings: competitor pages crawled, pricing, plans, claims, CTAs, FAQ/help/policy pages, SEO/GEO patterns, and source URLs
- decision log: what each evidence cluster changed in the spec, brand, ASO, pricing, funnel, or roadmap
- trace IDs or `state/LAUNCH_TRACE.md` pointers for every major decision that moves forward
- rejected claims and why they are unsupported or risky

Acceptance:

- A future agent can reproduce the research path without guessing queries.
- App-store estimates, social evidence, and web claims are labeled by source type.
- No claim moves into public copy unless it has supporting evidence or is marked as founder opinion.
- A founder waiver names the residual risk when the offer test does not run.
- A later claim can supersede an earlier claim without deleting the earlier record.

## `strategy/BRAND.md`

Must include:

- name and meaning
- mascot/character rules when applicable
- voice principles
- banned words/phrases
- owned words
- tone examples
- product copy samples
- proof/endorsement constraints
- trace IDs for voice, promise, mascot, naming, proof, and banned-copy decisions

Acceptance:

- A visible string can be judged pass/fail against this doc.
- Brand choices map back to research/product evidence instead of generic taste.
- Any use of a creator/expert/framework name is constrained by permission status.

## `DESIGN.md`

Root `DESIGN.md` is the authored, vendor-neutral contract for Claude, Codex,
Cursor, and other coding agents. It owns product-wide visual intent,
interaction rules, exact semantic token values, component direction, and the
index to optional screen and flow specifications. `studio/seed/business.json`
holds the structured screen, flow, and platform map used by the read-only
Design Room. The knowledge corpus guides decisions. It does not become a
second app-specific design authority.

`DESIGN.md` follows the Google Labs format: YAML frontmatter for
machine-readable tokens and ordered Markdown sections for rationale and
application rules. Edit it directly when a durable design decision changes.
Use Git history for revisions.

Must include:

- `DESIGN.md` includes name, description, color, typography, radius, spacing, and component tokens
- `DESIGN.md` includes overview, colors, typography, layout, elevation and depth, shapes, components, and do's and don'ts in canonical order
- trace/source notes for the product, category, emotional tone, accessibility, and surface constraints the visual system expresses
- component states for primary actions, secondary actions, form controls, tabs/segmented controls, cards/lists, modals/sheets, nav, paywalls, and store screenshot frames when relevant
- accessibility rules: contrast, focus states, reduced motion, text scaling, hit targets, dark/light constraints if supported
- export or implementation notes for the target app stack: CSS variables, Tailwind theme, SwiftUI tokens, React Native theme, Flutter theme, or Rork/builder prompt rules

Acceptance:

- `DESIGN.md` is the only app-specific design-system authority.
- `studio/seed/business.json` screen and flow IDs agree with the routes in `DESIGN.md` and optional detailed specifications.
- `npm run check:design-md -- --root /path/to/app` passes.
- Tokens are specific enough for a builder to implement without inventing fonts, colors, spacing, or components.
- Any existing `DESIGN_SYSTEM.md` defers to `DESIGN.md` for intent and exact token values.

## `DESIGN_SYSTEM.md`

Use only when the project needs a larger appendix than `DESIGN.md` can comfortably hold, or when the target repo already has this convention. It must not conflict with `DESIGN.md`.

Must include:

- color tokens
- type tokens
- spacing/radius/shadow/motion tokens
- component inventory
- banned components
- accessibility and reduced-motion rules
- asset usage rules
- implementation namespace or token API for the app stack

Acceptance:

- New screens can be built from tokens and components only.
- Design drift can be called a bug with a file reference.

## Screen Implementation Rules

Keep screen implementation rules in `DESIGN.md`. Do not create a second root design contract.

Must include:

- product surfaces
- 11-star experience slice and trace IDs for the magical moment
- screen-by-screen flows
- trace IDs from `state/LAUNCH_TRACE.md` for key screens, copy claims, onboarding questions, paywall decisions, data collection, and screenshot concepts
- component contracts
- important animations
- states and empty/error/loading behavior
- copy calibration set
- accessibility details
- analytics hooks by screen
- corresponding HTML proof path for each key surface

Acceptance:

- The builder can implement the screen without asking what it looks like.
- The builder can tell why each screen exists and which product/research decision it implements.
- The design spec references `analytics/ANALYTICS.md` for event names.
- The design spec references `DESIGN.md` for token names and component rules.

## `design/design-room.html`

Use this as the generated, read-only review page that proves the design system works in real layout. Author decisions in `DESIGN.md`, detailed screen or flow files, and `studio/seed/business.json`. Then render the page. Do not edit it directly or use it as a second source of truth.

Must include:

- CSS variables or theme definitions derived from `DESIGN.md`
- token swatches, typography specimens, spacing/radius/motion examples, and component states
- mobile-first screen frames for onboarding, aha moment, core loop, paywall/revenue surface when relevant, settings/account, empty/loading/error states, and share/referral surfaces when relevant
- desktop or responsive variants for public landing, legal, support, and checkout/funnel pages when relevant
- ASO screenshot-frame concepts when store creative is in scope
- labels that mark assets as `direction`, `draft`, or `production`
- local preview instructions and browser/mobile visual QA notes

Acceptance:

- The page can be opened or served locally and visually inspected.
- The page matches the current authored contract and structured routes.
- Mobile and desktop layouts do not overlap, clip critical text, or rely on invisible/remote-only assets.
- Visual concepts, generated images, brand books, screenshot frames, and UI explorations are not left as prose-only artifacts.

## `product/ONBOARDING.md`

Use when the app has onboarding, personalization questions, a mascot/guide, demo video, attribution capture, review prompt, paywall, closing offer, or first-session activation.

Must include:

- onboarding goal, target user state, and desired post-onboarding state
- screen-by-screen sequence with purpose, copy, visual asset, motion, analytics event, and exit/back behavior
- data collection matrix: question, answer options, personalization use, attribution use, lifecycle-message use, privacy/legal note, and required/optional status
- attribution question and answer taxonomy with stable stored keys, display labels, `other` free text, analytics event properties, PostHog person properties, backend/profile fields, and anonymous-to-identified reconciliation
- mascot/guide plan with Higgsfield source assets, emotion states, and accessibility fallback when used
- demo-video plan, including aha moment, duration, source UI, captions/no-audio fallback, and Higgsfield generation/scoring path or Remotion render path when used
- App Review popup eligibility earned after real value and engagement, requested through the native platform API outside first-run onboarding at a later natural success, automatic mounted-screen timing, cooldown, analytics, compliance notes, and fallback when the prompt is not shown
- hard/soft paywall decision, paywall placement, RevenueCat offering/experiment, restore path, and product package matrix
- Commitment Funnel table in first-session order: welcome, quiz or goals, micro-commitment with a skip path, personalized insight, then hard paywall
- Funnel Quality Metrics for onboarding complete, install-to-trial, trial-to-paid, per-step drop-off, and refund rate
- Paywall Goal Headline table: goal key, `paywall_headline_key`, honest headline template, skipped-goal fallback, RevenueCat offering metadata and `customVariables` bind
- closing-offer or reverse-trial behavior after paywall dismissal, if used
- first-session activation task and Day 0 cancellation prevention notes

Acceptance:

- Every onboarding question has a reason beyond "engagement".
- Self-reported attribution is visible early in the rendered flow and passes the analytics/backend data contract; it is not just a local UI choice.
- App Review popup behavior is native-platform compliant, not incentivized, earns eligibility after real value and engagement, and is requested outside first-run onboarding at a later natural success rather than immediately after first value.
- Paywall, pricing, trial, and closing offer match `revenue/REVENUE_OPS.md`, `trust/TERMS.md`, store products, and analytics events.

## `product/onboarding.html`

This is the rendered execution record for `product/ONBOARDING.md` -- the decisions, journey, screen and control contracts, instrumentation, monetization, and cutover record, mirrored for review and search. It is not the visual proof for onboarding and paywall flow; that lives in `design/design-room.html`, which already requires mobile-first onboarding screen frames, mascot states, App Review popup placement, paywall, and closing-offer visuals labeled `direction`/`draft`/`production`. Do not duplicate that requirement here.

Must include:

- a section index matching `product/ONBOARDING.md`'s headings, so a reader can see what the record covers without reading the full source
- the current Status from `product/ONBOARDING.md`
- the complete canonical Markdown source, reachable from the page even if collapsed behind a disclosure by default

Acceptance:

- The page's Status and section index agree with the current `product/ONBOARDING.md`.
- The full Markdown source is reachable from the page.
- Onboarding and paywall visual proof is verified against `design/design-room.html`, not this page.

## `LAUNCH.md`

Must include:

- ASO context or pointer to `app-marketing-context.md`
- App Store fields and character counts
- Google Play fields when Android is in scope
- screenshot frame table or pointer to `SCREENSHOTS.md`
- screenshot production notes, especially if AI-generated backgrounds need manual text overlay
- ad-copy library by tested angle
- Apple Search Ads or equivalent paid-search plan
- launch calendar
- monetization tracking thresholds
- monetization architecture or pointer to `revenue/REVENUE_OPS.md`
- rating/review prompt strategy
- store-console readiness checklist or pointer to `store/STORE_CONSOLE.md` and `store/store-console.html`
- support/privacy email alias status
- Resend or transactional/lifecycle email readiness, or pointer to `growth/EMAIL_OPS.md`
- open founder decisions

Acceptance:

- The App Store listing can be pasted from the doc.
- Launch tasks are dated or sequenced relative to launch week.
- Metrics include intervention thresholds.
- Store-console, screenshot, privacy, and contact-route blockers are explicit.

## `APP_STORE_LISTING.md`

Use when Apple App Store listing preparation is in scope.

Must include:

- official Apple docs checked with URLs and dates
- default product-page fields: name, subtitle, promotional text, description, keywords, support URL, marketing URL, categories, screenshots, previews, review notes, and release option
- App Privacy questionnaire output mapped to data inventory, SDKs, vendors, backend, analytics, payments, AI, email, support, and legal pages
- pricing and subscription matrix across App Store Connect products, RevenueCat entitlements/offerings/packages, Stripe/web funnels, paywall copy, terms, screenshots, and analytics
- custom product page plan or explicit not-needed status, including audience/channel, keyword set, screenshots/previews, deep link, campaign, measurement, and approval state
- In-App Event plan or explicit not-needed status, including purpose/badge, copy, media, schedule, deep link, IAP-required flag, localization, and approval state
- localization matrix: markets, locales, metadata, keywords, screenshots, privacy/support URLs, and review/proof owner
- Higgsfield/Remotion/design-system route for supporting App Store marketing art that is not just raw screenshots
- founder-only gates for privacy publish, product/pricing changes, screenshot upload, CPP/event submission, localization upload, and final submission

Acceptance:

- A founder can see how the App Store page supports the full marketing strategy, not just the default metadata fields.
- App Privacy answers come from actual behavior and third-party partners.
- Pricing cannot drift between App Store Connect, RevenueCat, web funnel, screenshots, paywall, terms, and analytics.

## `app-store-listing.html`

Use this as the founder-facing Apple listing preparation board.

Must include:

- tabs or sections for listing, privacy, pricing/products, growth surfaces, screenshots/assets, and localization
- field labels, click paths, limits, counts, paste values, source artifact, status, and approval gates
- privacy status with pointer to `app-privacy-questionnaire.html`
- RevenueCat/Stripe/web funnel product matrix
- custom product page and In-App Event plan status
- screenshot/app-preview matrix and Higgsfield/Remotion/design-system asset route

## `app-privacy-questionnaire.html`

Use this as a local interactive worksheet for App Store App Privacy answers.

Must include:

- collection preflight
- Apple data-type checklist
- linked/tracking/purpose/vendor/proof fields per selected data type
- third-party partner inventory
- optional-disclosure rationale area
- export/copy summary for `APP_STORE_LISTING.md` and `store/STORE_CONSOLE.md`

## `store/STORE_CONSOLE.md`

Use when a founder or agent must create, fill, submit, or audit App Store Connect or Google Play Console.

Must include:

- official docs checked with URLs and dates
- App Store Connect field table grouped by exact console page and click path
- Apple app-record and signing status or pointer to `store/APPLE_SIGNING.md`: Developer Program membership, Team ID, bundle ID/App ID, app record, `DEVELOPMENT_TEAM`, signing strategy, archive/export/upload/TestFlight blocker
- ASC CLI route when used: commands, dry-run/applied status, JSON output paths, resolved IDs, and founder-gated mutations
- Google Play Console field table grouped by exact console page and click path
- field limits, character/byte counts, paste-ready values, source artifact, evidence, and status
- Apple App Privacy data-type matrix mapped to `trust/PRIVACY.md`, `analytics/ANALYTICS.md`, `growth/EMAIL_OPS.md`, `revenue/REVENUE_OPS.md`, SDKs, backend schema, and vendors
- Google Play Data safety matrix mapped to the same data inventory
- account deletion, privacy choices, support/privacy URLs, reviewer credentials, review notes, age/content rating, export compliance, and app access instructions
- Age Rating Questionnaire for `socialMedia`, `messagingAndChat`, `socialMediaAgeRestricted`, `ageAssurance`, and `userGeneratedContent`, with product evidence, `asc age-rating audit` proof, and no inferred `false` from a blank field
- screenshot upload matrix or pointer to `SCREENSHOTS.md`
- founder-only gates for developer account access, pricing, legal approval, privacy claims, paid products, screenshot approval, and final submission

Acceptance:

- A founder can open ASC or Play Console and fill every known field without asking where it goes.
- Simulator build success is not presented as upload readiness unless `store/APPLE_SIGNING.md` proves distribution signing and app-record prerequisites.
- Apple App Privacy and Google Data safety answers trace to actual data flows, not generic legal copy.
- Any unknown console item is marked `blocked` with the exact data/access needed.

## `store/APPLE_SIGNING.md`

Use when Apple distribution, TestFlight, physical-device signing, archive/export/upload, or first-time App Store setup is in scope.

Must include:

- official Apple docs checked with URLs and dates
- Apple Developer Program membership, account type, role, Team ID, seller/developer name, and agreement status
- project/workspace, schemes, app targets, extension targets, bundle IDs, `DEVELOPMENT_TEAM`, signing style, version, build, Info.plist, privacy manifest, and entitlements
- local signing identity inventory without secret values, including whether only `Apple Development` exists or an Apple Distribution/cloud/CI path is available
- explicit App ID/bundle identifier, App Store Connect app record, SKU, primary locale, app Apple ID, capabilities, and provisioning profile status
- selected signing strategy: Xcode automatic/cloud-managed, manual local, CI/cloud signing, or blocked
- archive/export/upload/TestFlight status and evidence paths
- secret-management route for ASC API keys, `.p8`, `.p12`, provisioning profiles, passwords, CI signing material, and webhook/store credentials
- founder-only gates for enrollment/payment, app record creation, bundle ID/SKU/name, certificates/profiles, capabilities, upload, external TestFlight, and final submission

Acceptance:

- A future agent can tell exactly why the app can or cannot be uploaded.
- `Bundle ID` and `SKU` are treated as sticky identity, not temporary labels.
- App Store distribution readiness is never inferred from simulator build success alone.

## `store/APPLE_APP_STORE_REQUIREMENTS.md`

Use before any iOS, iPadOS, visionOS, tvOS, watchOS, or macOS build is described as ready to upload to App Store Connect.

Must include:

- official Apple docs checked with URLs and dates for privacy manifests, adding manifests, data-use manifests, required reason APIs, third-party SDK requirements, protected resources, App Tracking Transparency, App Privacy details, upload builds, and App Review Guidelines
- `PrivacyInfo.xcprivacy` path and proof that it is included in the app target resources
- `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes`, `NSPrivacyAccessedAPITypeReasons`, `NSPrivacyTracking`, and `NSPrivacyTrackingDomains` decisions
- third-party SDK inventory with Apple-listed SDK status, bundled privacy manifest status, SDK signature status, data collected, and owner
- Xcode privacy report status and reconciliation against App Privacy answers and Privacy Nutrition Labels
- Privacy Policy URL, Privacy Choices URL, account deletion route, in-app privacy route, and public policy/legal source
- protected-resource and `Info.plist` matrix: every touched camera, photos, microphone, location, contacts, tracking, or similar permission has a clear `UsageDescription` string and denied-permission fallback
- `NSUserTrackingUsageDescription` and App Tracking Transparency route when tracking, advertising identifiers, retargeting, data broker sharing, or third-party ad attribution is in scope
- archive/upload proof from `store/APPLE_SIGNING.md`, including any App Store Connect delivery warnings or processing blockers
- founder-only gates for App Store Connect upload, App Review submission, public release, privacy/legal approval, and paid account mutations

Acceptance:

- `npm run check:apple-requirements -- --root .` passes before a ready/upload claim, or the exact blocker and active failure card are recorded.
- A ready packet has an actual `PrivacyInfo.xcprivacy` in the app source tree.
- App Privacy answers are not copied from policy prose alone; they reconcile app code, SDKs, vendors, analytics, revenue, privacy policy, Xcode privacy report, and App Store Connect labels.
- Upload readiness is blocked by unresolved privacy manifest, required reason API, third-party SDK, purpose string, ATT, review-note, account-deletion, or ASC delivery-warning gaps.

## run/app-store-portfolio.json

Use this when the live App Store Connect portfolio must be observed before `workflow.research.research-backed-spec` is admissible.

Must include:

- schema `1.0.0`
- command exactly `asc apps list`
- `authFamily` `api`
- winning `asc` version
- `observedAt` from the live command
- `appCount` and `apps[]` of sanitized `{name}` plus optional `{bundleId}`
- `empty: true` only when the live command returned no apps

Acceptance:

- Failed or missing API auth produces no receipt.
- A web session never satisfies the hold.
- Do not invent an empty portfolio from memory.
- Do not store Apple numeric ids, SKU, raw stdout, session, or env.
- A receipt older than seven days, or older than a later Apple-account `checkedAt`, is hold-equivalent.
- Compare names and bundle ids against `operations/business-access.json` `forbiddenProviderProjects[]`.
- Register the path as reducer-protected observe state. MCP and status may read it. They must not treat it as an authored operations file.
- Gate with `check:app-store-portfolio`. The workflow uses `check:app-store-portfolio-required`.

## `store/APP_REVIEW.md`

Use this when B2C App Builder watches Apple review for one exact app version.

Must include:

- whether the watch is active
- the current blocker in founder language
- a case surface for review issues, using evidence codes rather than reviewer text
- a note that B2C App Builder does not accept Apple agreements
- a note that an observe watch does not submit
- a standing-envelope note when a capped resubmit is live

Acceptance:

- Raw Apple enums stay out of founder copy.
- `asc web agreements accept` never appears.
- `asc webhooks serve` never appears.
- `asc review submit` never appears in this founder file.
- Unknown Apple states stay blocked. They never read as approved.
- Durable `run/app-review.json` exists once the watch record is no longer the unused seed.
- An existing invalid `run/app-review.json` fails closed.
- A 1.0.0, 1.1.0, 1.2.0, or 1.3.0 watch file migrates to 1.4.0 before the current schema is enforced.
- A complete rejection packet cites an exact submission ID.
- Latest-unresolved selection is not durable evidence.
- Reviewer content is fingerprinted. It is not stored as agent instructions.
- A signed webhook is verified before persistence. Invalid HMAC does not mutate state.
- Webhook `newValue` is not Apple layer truth.
- Bounded remediation may change consumer-repo files. It does not submit.
- A verified binary repair includes a newly inspected archive.
- Legal, privacy, payments, product-scope, and unclear cases park.
- Capped resubmission needs an exact standing envelope and already-uploaded proof.
- A timed-out mutation does provider readback. It does not submit again.
- A second rejection opens a linked cycle.
- Cycle exhaustion parks. It asks the founder.
- `PENDING_DEVELOPER_RELEASE` still needs a separate founder yes.

## `store/store-console.html`

Use this as the human-facing copy surface for console work. It should be local, static, and dense enough to act like a mock ASC/Play Console.

Must include:

- tabs or sections for App Store Connect and Google Play
- cards in console click-path order
- field labels, limits, live or precomputed character counts, paste-ready values, source document path, status badge, and official-doc link
- privacy/App Privacy and Data safety tables
- screenshot matrix with thumbnails or local file paths
- founder-only approvals highlighted separately from agent-fillable fields
- last verified date for Apple and Google documentation

Acceptance:

- The user can copy values from the HTML without scanning a long Markdown file.
- It uses the project `DESIGN.md` tokens when available, but reads as an operator console rather than a marketing page.
- It can be opened locally and is usable on desktop and mobile.

## `SCREENSHOTS.md`

Use when App Store or Play Store screenshots, previews, icons, feature graphics, or store creative are in scope.

Must include:

- current official screenshot/asset sources checked with URLs and dates
- device matrix by platform, device class, display well, locale, required/optional status, and dimensions
- complete locale × supported device-family × product-page coverage: iPhone and iPad for Apple; phone, 7-inch tablet, and 10-inch tablet for Google Play; default and each custom page or listing in scope
- raw MobAI/native iOS/device capture path, Codex Desktop native iOS/XcodeBuildMCP capture path, serve-sim stream capture path, SnapshotPreviews preview-only path when applicable, production composition path, design-system frame path, final upload path, visual proof path, and upload status
- screenshot slot strategy: first three conversion frames, source screen, headline, copy overlay, claim risk, localization, and production readiness
- App Icon and App Preview route, source inputs, output paths, thumbnail/poster-frame QA, and founder approval gate when in scope
- generated asset use: Higgsfield or other AI assets labeled `direction`, `draft`, or `production`, with proof that real app UI remains truthful and visible
- capture notes: device/OS/app build, locale, theme, account fixture, data fixture, accessibility IDs, and any manual steps
- `check-store-screenshots` result or explicit blocker

Acceptance:

- Every final screenshot can be traced to a real app screen or an explicitly approved mock state.
- Final dimensions match current Apple or Google requirements.
- Raw captures are preserved separately from composed upload assets and are never described as final store artwork by themselves.

## `CONTENT_ASSETS.md`, `content-assets.html`, And `growth/content-assets/manifest.json`

Use when Higgsfield, Remotion, local recordings, edited media, app previews, social clips, store screenshot frames, UGC overlays, ad variants, or campaign assets are in scope.

Must include:

- route matrix: Higgsfield, Remotion, raw screenshots, founder-owned media, public-domain assets, blocked, deferred, or not needed
- paid-tool and fallback approvals, especially when Remotion replaces an intended Higgsfield path
- Remotion license status or founder approval before commercial output
- source input inventory: screenshots, recordings, `DESIGN.md`, copy files, audio, captions, logos, and rights notes
- composition manifest with asset ID, surface, route, status, composition ID, dimensions, duration, inputs, outputs, truth constraints, approvals, render proof, and license status
- `input_digests` with a SHA-256 digest for every local input. A mismatch makes the asset stale and requires regeneration; retain the prior row as `superseded`.
- render commands for Remotion previews, stills, and videos when Remotion is selected
- claim review against `APP_STORE_LISTING.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `trust/TERMS.md`, onboarding/paywall copy, and store policy constraints
- output registry with target surface, local path, QA state, and next gate
- public use gates for posting, scheduling, paid campaigns, creator distribution, paid generation, paid rendering, store upload, and final launch use

Acceptance:

- A future agent can rerender or regenerate the asset from recorded inputs and commands.
- Remotion output is not treated as equivalent to Higgsfield AI-generated creative.
- Generated or mock UI is not presented as real app functionality.
- Real app UI remains truthful and visible when the asset claims to show the product.
- Public, paid, or store-bound use is blocked until founder approvals are recorded.

## `PAID_UA.md`

Use when paid ads, Apple Search Ads, Meta/TikTok/Google campaigns, custom product page campaign routing, paid creative tests, MMP/ad-network SDK choices, or spend-readiness claims are in scope.

Must include:

- fit gate and explicit defer/not-fit reason when paid UA is not appropriate
- one-channel choice or documented exception
- selected channel, rejected channels, target event, destination, budget cap, and date range
- creative production cadence, first batch size, angle map, product visibility rule, and source asset route
- Non-Competitor Angle Hunt with print, cross-niche, ad-library-adjacent, and second-profile sources; at least one adopted original angle; same-ICP new-motivation expansion; no cloned competitor creatives
- tracking baseline across RevenueCat, ad-network/native reporting, App Store Connect or Play Console, PostHog, and self-reported attribution
- blended report shape, ideally `growth/paid-ua-report.csv`
- RevenueCat LTV/cohort/trial/purchase/entitlement basis for CPA and payback decisions
- weekly operating cadence and anomaly check
- stop/scale/outsource rules
- MMP Before Spend: tracking baseline complete before the first paid dollar
- AppsFlyer default MMP with RevenueCat `$appsflyerId` before trial or purchase, or a founder MMP waiver table with date, founder identity, named stack, and approval state `approved`
- PAUSED draft status until founder approval of live delivery
- 48-hour kill window after first spend
- founder-only gates for spend, account connection, SDK/privacy changes, public creative, pricing, legal, and campaign launch
- traceability rows to `state/LAUNCH_TRACE.md`, `11_STAR_EXPERIENCE.md`, `CONTENT_ASSETS.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `APP_STORE_LISTING.md`, `trust/PRIVACY.md`, and proof artifacts

Acceptance:

- Paid growth is not reduced to "try ads."
- One channel, creative cadence, tracking baseline, blended reporting, RevenueCat economics, and stop/scale rules agree.
- Founder-only spend and account gates are visible.

## `VIRAL_GROWTH.md`

Use when product-led sharing, referral unlocks, invite systems, social-comment loops, creator CTAs, content format tests, or viral paywall/onboarding mechanics are in scope.

Must include:

- fit gate: visible/emotional product moment, platform-native audience behavior, privacy/policy risks, monetization readiness, and decision
- growth thesis: audience/platform, visible result, emotional trigger, product loop, content loop, conversion moment, compounding theory, and failure theory
- product loop: trigger, reward, recipient value, share artifact, surface, fallback, abuse controls, and policy constraints
- referral/share mechanic: stable keys, backend/provider owner, reward/unlock validation, duplicate/self-referral handling, entitlement rules, and support recovery
- content loop: platform, account or creator route, product visibility, CTA mechanic, comment/share mechanic, app-store or landing path, and claim constraints
- format lab: format IDs, hook structure, first-frame visual, product insertion, CTA, variables, signal windows, and status
- monetization timing: paywall placement, package/intro/closing-offer tests, restore/terms/privacy visibility, RevenueCat/Stripe/app-store linkage, and risk notes
- measurement plan: PostHog or equivalent events, attribution, dashboards, traffic quality, referral/share proof, paywall reach, purchase, entitlement, activation, retention, and platform/device mix
- stop/scale rules: reps before judgment, repeatable-hit threshold, downstream evidence threshold, and shut-down/reposition rules
- founder-only gates: creator payments, paid tools, public posting, social account connections, pricing changes, and legal/policy approval
- traceability rows to `state/LAUNCH_TRACE.md`, `11_STAR_EXPERIENCE.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `analytics/ANALYTICS.md`, `growth/UGC_PLAYBOOK.md`, and proof artifacts

Acceptance:

- Growth is represented as a product/content/revenue/analytics system, not a list of social posts.
- Referral or share mechanics are not build-ready without abuse controls, backend/provider proof, and a fair fallback.
- A future agent can tell when to scale, repeat, stop, or defer a format.
- Views are not treated as proof unless tied to launch goals such as opens, referrals, paywall reach, purchases, retention, or awareness-only objectives.

## `growth/UGC_PLAYBOOK.md`

Use when founder-led or creator-led organic TikTok/Reels/Shorts, Sideshift/creator marketplaces, creator payments, UGC scripts, paid influencer sponsorships, or post-launch content engines are in scope.

Must include:

- UGC fit decision: visible product moment, emotional hook, audience size, comment/share potential, compliance risks, and source evidence
- 90-day Day 0 plan with weeks 1-2 sourcing and weeks 3-12 format-discovery cadence
- budget: base-only floor, working case, breakout case, founder approvals, and paid-tool decisions
- creator profile: geography, personal follower range, camera criteria, coachability criteria, and disqualifiers
- sourcing workflow and outreach template shape without forcing app-specific copy
- contract checklist: account ownership, handover, content/ad usage rights, pay terms, termination, tax forms, disclosure
- payment model: base, bonus trigger, measurement window, payout path, and scale-stage changes
- account handling: niche-themed account, creator-operated device, brand backup access, login hygiene
- script and review workflow: founder writes scripts, same-day feedback, approval gates, trust loosening rules
- format tracker: format IDs, hooks, angles, product insertion, CTA mechanic, views, comments, install/search signal, payout status
- stop and scale rules: replace creator by day 7 if inactive, give formats 5-8 reps, clone breakout hooks within 24 hours, scale only after repeatable format hits, stop after 3 months with no breakout/improvement/lift
- legal/store/brand guardrails: partner disclosure, unsupported claims, app-store consistency, privacy/terms constraints
- sponsorship track when established creators are paid for integrations (`influencer-sponsorship-engine.md`): brand-account setup, outreach volume targets, deal-structure defaults (CPM anchor, view guarantee, tracking window, upfront split), disclosure rules, saturation/rotation rules, and the `ugc/sponsorship-ledger.csv` per-deal economics ledger

Acceptance:

- The channel is marked fit, blocked, deferred, or not a fit before spend starts.
- Creator operations are not confused with influencer marketing: founder-run creator ops and paid sponsorships of established creators are separate tracks with separate payment shapes, qualification filters, and ledgers.
- The program can run without inventing contracts, payment rules, scripts, or tracking from scratch.
- Fastlane or paid ads consume only approved and rights-cleared UGC inputs.

## `growth/EMAIL_OPS.md`

Use when the launch uses Resend or another email provider for transactional, lifecycle, broadcast, inbound, or support email.

Must include:

- email purpose map: auth, waitlist, welcome, onboarding nudges, trial/renewal, payment recovery, receipts, support, broadcasts, admin alerts
- sender map: from, reply-to, domain/subdomain, owner, purpose, unsubscribe requirement, and environment
- Resend domain/DNS state: SPF, DKIM, DMARC, region, custom return path, tracking subdomain, and verification timestamps
- API key inventory routed through `SECRETS.md`: permission, domain scope, environment variable, deploy target, rotation date, and owner
- templates and code paths: server-only wrapper, React Email/hosted template path, tags, idempotency-key strategy, retry/logging behavior
- webhook plan: endpoint, event list, signing secret storage, raw-body verification, `svix-id` duplicate handling, storage/log path, and replay test
- audience/lifecycle plan: Contacts, properties, Segments, Topics, Broadcasts, Automations, unsubscribe/preference behavior, and contact deletion behavior
- optional inbound plan: receiving domain, MX conflict risk, `email.received` webhook, attachment policy, support escalation, and retention
- validation log: test sends, header checks, webhook replay, unsubscribe test, automation run, broadcast test, and inbound test where relevant

Acceptance:

- Production email does not rely on `resend.dev`.
- Runtime keys are not exposed to the browser and use least privilege where possible.
- Marketing/lifecycle email has unsubscribe/preference handling.
- Resend behavior is reflected in privacy/legal docs and analytics events.

## `revenue/REVENUE_OPS.md`

Use when the app has subscriptions, paid access, RevenueCat, Stripe, web checkout, web funnels, or app-store products.

Must include:

- monetization path: waitlist-only, mobile IAP only, RevenueCat Web Billing, Stripe Billing via RevenueCat Web, existing Stripe sync, or no live checkout
- founder-approved pricing: monthly, annual, lifetime, trial, intro offer, renewal price, refund/cancellation posture, supported countries, and approval date
- product matrix: App Store product IDs, Play product/base plan IDs, RevenueCat product IDs, Stripe product/price IDs, entitlement, offering, package, duration, price, currency, intro/trial status
- RevenueCat setup: project/app IDs, public SDK key locations, store/web configs, products, `premium` entitlement, `default` offering, packages, server notifications, webhooks, and environment status
- Stripe setup: account mode, Checkout/Payment Links/Customer Portal/Billing choice, tax posture, products/prices, webhook events, customer portal URL/path, branding/support settings, live/sandbox status, and secret routing through `SECRETS.md`
- web funnel setup: RevenueCat Web Purchase Link, Web Funnel, Web SDK, Stripe Checkout/Payment Link, success/cancel URLs, redemption links, deep links, QR/desktop fallback, campaign parameters, and sandbox/production URL separation
- identity map: app UID, RevenueCat App User ID, Stripe customer ID, store transaction ID, email, anonymous redemption ID, and support lookup path
- validation log: sandbox/Test Store purchase, restore purchases, cancellation/expiration, failed payment, web purchase, redemption, webhook delivery, entitlement active in app, analytics event received
- Surface To Engine Matrix and Paywall Experiment Backlog with Surface and Engine columns (`revenuecat_experiments`, `bandit`, `posthog`)
- open blockers and founder-only approval list

Acceptance:

- A purchase can be traced from checkout/store transaction to active app entitlement.
- Restore purchases works and is visible in support/debug docs.
- Web-to-app purchase redemption is tested on a real mobile path before public traffic.
- Public prices, paywalls, terms, store products, RevenueCat offerings, Stripe prices, and analytics agree.
- Live checkout is not enabled without founder approval.

## `revenue/PAYWALL_EXPERIMENT_PROGRAM.md`

Use this as the owned output of the recurring paywall experiment program.

Must include:

- Cycle Log heading
- a table with Cycle date, Backlog change, and Next experiment
- a cycle row dated within 14 days after four live weeks

Acceptance:

- Recurrence fingerprints this file. It does not fingerprint `revenue/REVENUE_OPS.md`.
- A cycle row names a real backlog change. Pending or empty cells fail.

## `revenue/PRICE_DERIVATION.md`

Use when deriving one subscription's territory prices from another with `asc subscriptions pricing derive`.

Must include:

- source subscription, target subscription, multiplier, storefront set, effective-date intent, and subscriber-preservation policy
- `--dry-run` receipt with price-point IDs, local prices, unavailable territories, and current or future schedules
- comparison with pricing intent and RevenueCat before any apply request
- founder confirmation for apply; a multiplier is not approval
- scheduled-change warning: Apple permits only one future change per storefront and billing plan type
- after apply, provider readback of every territory and RevenueCat reconciliation, or a recovery plan

Acceptance:

- Dry-run causes no provider mutation.
- Unavailable territories stay blockers.
- No price is applied without exact authorization, schedule checks, and readback.

## `trust/AI_PROVIDER_CONTROLS.md`

Use when a capability can create paid model-provider spend.

Must include:

- server-side authentication and entitlement before paid or recurring generation
- per-owner throttles, global ceilings, and pre-call reservations
- conservative accounting for timeouts, refusals, provider errors, and invalid output
- a fail-closed kill switch that preserves free or manual behavior
- one approved secret runtime; no client or public provider key
- logging rules that exclude prompts, responses, secrets, and identity proofs
- separate application cap status and provider-account cap status
- production readback and rollback before the capability is ready
- `Paid generation: not applicable` plus a named reason when spend cannot occur

Acceptance:

- Anonymous requests cannot reach paid generation.
- A failed call cannot release its reservation.
- Application cap status cannot imply provider-account cap status.
- A missing file fails when paid generation applies.

## `GEO_SEO.md`

Use for public launch funnels, docs, content hubs, or policy pages that should be discoverable by search and AI answer engines. This can be a standalone file or a section in `LAUNCH.md`/`AUDIT_PROMPT.md` for smaller launches.

Must include:

- live URLs audited and timestamp
- metadata status: title, description, canonical, Open Graph, Twitter/X cards, favicon/app icon, and theme color
- crawlability: HTTPS, redirects, `robots.txt`, meta robots, headers, `sitemap.xml`, and AI crawler access
- `llms.txt` status and key sections
- schema status and JSON-LD types present
- citability findings and rewritten answer sections
- brand/entity consistency notes across site, store listing, social profiles, press, and creator/partner mentions
- platform notes for ChatGPT, Perplexity, Gemini, Google AI Overviews, and Bing Copilot when checked
- open fixes, owner, and next monitoring date

Acceptance:

- The canonical domain can be crawled and parsed without auth or client-only rendering failures.
- AI/search-visible facts match the app store listing, legal pages, and brand docs.
- Any unsupported claims are removed or tracked in legal/launch risk notes.

## `growth/landing/surface-contract.json`

Use this contract for each local landing or funnel build. It makes the inputs, applicability decisions, and proof machine-readable.

Use these top-level fields:

- `contract_version`;
- `sources` with the canonical path and current SHA-256 digest;
- `analytics_events`;
- `locales` with evidence for each Tier 1 locale;
- `pricing` and `onboarding`, each with `applicable` and `evidence`;
- `screenshots` with locale, evidence, and `source_kind`;
- `scrollytelling` with its applicability decision and browser proof.

Add a `scrollytelling` object with these exact keys:

- `applicable`: a Boolean value;
- `evidence`: the evidence-based applicability decision;
- `locales`: the stable locale tags covered by this sequence;
- `scenes`: the ordered scene contracts;
- `qa`: the browser evidence rows.

Each `scenes` row must use these exact keys:

- `id`: a stable lowercase scene slug;
- `narrative_roles`: one or more semantic roles;
- `states`: one or more stable lowercase state slugs;
- `visual_job`: the situation, mechanism, change, or proof that the visual must show;
- `source_kind`: `html`, `svg`, `canvas`, `image`, or `video`;
- `asset_id`: the ID of a matching image or video record in `growth/content-assets/manifest.json`; the record must satisfy the content-asset shape, use a done-tier status (`done`, `ready`, `production`, or `approved`), and resolve every local output under the business workspace;
- `poster_asset_id`: the ID of a distinct done-tier still-image record in `growth/content-assets/manifest.json` when an image or video uses `modes.save_data: poster`; it cannot reuse the primary or another video record, and the key must be absent when the Save-Data mode is `omit`;
- `evidence_id`;
- `localizations`: locale-specific beat copy, caption, and accessible-description contracts;
- `activation_guides`: numeric `desktop`, `mobile`, and `short_mobile` positions from 0 to 1;
- `modes`: `mobile`, `reduced_motion`, `no_js`, and `save_data` behavior;
- `forward_reverse`: `true` after every state has forward and reverse browser evidence.

Each `localizations` row must use this exact shape:

```text
{
  locale,
  beats: [{ state_id, text, copy_key, copy_sha256 }],
  caption: { text, copy_key, copy_sha256 },
  accessible_description: { text, copy_key, copy_sha256 }
}
```

The locale must exist in `scrollytelling.locales`. Each `beats` list must cover every scene state in the same order. Each digest is the lowercase SHA-256 of the exact approved localized `text` in that row.

Use `situation` or `need` for the first narrative stage. Use `decision`, `intervention`, or `mechanism` for the next stage. Use `outcome` or `proof` for the final stage.

Each activation guide is a viewport ratio from 0 to 1. Select it to keep the active prose clear of the stage. Do not divide scroll progress into equal buckets.

Set `modes.mobile` to `recomposed` or `inline`. Set reduced motion and no JavaScript to `final`. A final-only visual is valid only when semantic prose or captions contain every claim and proof. Otherwise, render static visual panels in document flow. Set Save-Data to `code-native` for HTML, SVG, or canvas. For image or video, use `poster` and provide `poster_asset_id`, or use `omit` when the complete semantic prose, caption, and accessible description remain without the media. Do not retain `poster_asset_id` on an omitted fallback.

The static gate resolves manifest IDs, required record fields, approval status, output media extensions, and local output paths. It does not inspect the media pixels, measure poster byte size, or replace the recorded browser review.

Each `qa` row must use these exact keys:

- `browser`;
- `platform`;
- `viewport`;
- `locale`;
- `direction`: `forward`, `reverse`, or `jump`;
- `mode`: `default`, `short_mobile`, `reduced_motion`, `no_js`, or `save_data`;
- `scene_id`;
- `expected_state`;
- `result`: `pass`, `fail`, or `pending`;
- `evidence`.

If scrollytelling does not apply, set `applicable` to `false`. Record the reason in `evidence`. Keep `scenes` and `qa` as empty lists.

Acceptance:

- An applicable sequence has at least one scene. Each scene aligns ordered roles and states for situation or need, intervention or mechanism, and outcome or proof.
- Stable scene and state IDs match the rendered DOM.
- Browser proof covers current Chrome, Safari, and Firefox, each on short and tall desktop viewports.
- Browser proof covers iOS Safari and Android Chrome, each on short and tall mobile viewports.
- Each Tier 1 locale proves every scene state in forward and reverse default scroll. Each locale also proves reduced motion, no JavaScript, Save-Data, and short-mobile behavior for every scene.
- Proof covers a direct jump or restored scroll position for each scene.
- Every localized beat, caption, and accessible description has a current copy key and digest.
- Every local evidence fragment resolves to a real Markdown heading or HTML anchor in its evidence file.
- Image and video scenes resolve to done-tier manifest records whose existing output extension matches `source_kind`. Their Save-Data mode either resolves a separate approved still output or explicitly omits the media while the complete semantic narrative remains. A generated asset does not replace proof or necessary copy.

## `STORE_OPS.md`

Use when the app is near submission, already in review, rejected, or actively monitored post-launch. This can be a standalone file or a section in `LAUNCH.md` for smaller launches.

Must include:

- platform, app ID/bundle ID/package name, version/build, target countries, category, and current console status
- pointer to `store/STORE_CONSOLE.md`, `store/store-console.html`, and `SCREENSHOTS.md` when those are separate files
- store-console checklist status: metadata, screenshots, privacy labels/Data safety, privacy manifest, age/content rating, export compliance, IAP/subscriptions, review notes, demo credentials, account deletion, release track, and build status
- support/privacy/security email alias table with destination, routing/DNS status, external test result, and published locations
- screenshot upload set by device/locale/slot with dimensions and source files
- review/rejection log with exact message, suspected surface, fix, verification, and final status
- post-launch ASO monitoring loop: keywords, rankings, reviews, ratings, ASA terms, conversion, country performance, competitor deltas, crash/support signals
- ASO Evidence Receipt: storefront, platform, locale, query set, observed CLI version, source availability, raw inputs, rank-window limitation, and collection time
- official Apple keyword sources with `available` or `unavailable` for rank, discover, and score; no auto-apply metadata

Acceptance:

- A future agent can tell whether the app is blocked by copy, binary, privacy, legal, email, DNS, payment, or review-state work.
- Email addresses published in stores/legal pages actually receive mail.
- Final submission/resubmission remains founder-approved.

## `growth/FASTLANE_OPS.md`

Use after the app is approved, in public beta, or ready for organic social marketing through Fastlane AI at `usefastlane.ai`.

Must include:

- official/current sources checked: Fastlane app home, in-app guide, developer docs, installed `usefastlane-ai` skill, and any user-provided Fastlane skill file
- launch readiness gate: store/beta URLs, landing URLs, privacy/terms/support links, approved claims, screenshots, pricing, and founder approval
- workspace setup state: workspace name, owner, product profile, website/store URLs, brand voice, banned claims, and conversion goal
- social connections table: platform, handle, connection status, posting mode, warmup status, owner, limits, and last verified timestamp
- API setup state: `FASTLANE_API_KEY` storage location only, base URL, safe-read discovery results, rate limits, active angles, preferences, content/post counts
- campaign plan: content pillars, target platforms, hooks, CTAs, UTM convention, 30-day cadence, and claims to avoid
- media input plan: MobAI screenshots/recordings, app previews, store screenshots, Higgsfield assets, founder/UGC clips, and source paths
- UGC input plan or pointer to `growth/UGC_PLAYBOOK.md` when creator-tested hooks, scripts, or clips shape Fastlane campaigns
- live automation state or pointer to `fastlane/`: angles, preferences, generated content, QA results, schedule, sanitized API logs, and metrics snapshots
- founder-only gates for account connections, API keys, public posts, scheduled posts, deletes/cancels, spend, and profile changes
- weekly iteration loop tying Fastlane metrics to installs, trials, purchases, attribution answers, and product analytics

Acceptance:

- A future agent can inspect the Fastlane workspace safely without guessing endpoints or exposing keys.
- No content is scheduled or posted without explicit approval.
- Generated posts trace back to launch docs, real product media, and approved claims.
- Fastlane performance is connected to product metrics, not treated as vanity-only social analytics.

## `trust/PRIVACY.md`

Structural floor for trust/PRIVACY.md and trust/TERMS.md: effective dates, contacts, Data Inventory, Retention And Deletion, App Store Disclosure Mapping, subscriptions/refunds, disclaimers, governing law; no placeholders when privacy_legal is done. Founder/legal approval remains the final gate.

Use as the source draft for privacy policy, privacy choices, account deletion, and app-store privacy disclosures. Also generate publishable pages from it when the launch has a public site.

Must include:

- effective date and last updated date
- legal/business entity and privacy contact
- app/site names covered
- audience and age posture
- data inventory by surface: landing, app, backend, analytics, subscriptions, support, ads, AI, notifications, device permissions
- purposes for each data type
- vendors/processors and what each receives
- whether data is linked to the user, used for tracking, shared, sold, or used for advertising
- retention and deletion policy
- account deletion URL and request flow when accounts exist
- user rights by jurisdiction where applicable
- security summary in plain language
- international transfers where applicable
- children, health/sensitive data, AI/model-training, and biometrics sections when relevant
- app-store disclosure mapping for Apple App Privacy and Google Play Data safety

Acceptance:

- The policy matches actual code, SDKs, backend tables, analytics events, and app-store labels.
- The page is public, non-geofenced, not a PDF, and linked from app/site/store metadata where required.
- Any uncertainty is in `LEGAL_REVIEW.md`, not silently papered over.

## `trust/TERMS.md`

Use as the source draft for terms of service and, if needed, a custom EULA.

Must include:

- effective date and contracting entity
- eligibility and account rules
- license/use rights and prohibited conduct
- user content ownership and moderation rules if user content exists
- subscriptions, free trials, renewals, cancellation, refunds, and platform-billing caveats
- AI output disclaimer if AI-generated plans/coaching/content exist
- health/financial/legal/professional-advice disclaimer when relevant
- intellectual property and feedback
- third-party services and platform terms
- warranty disclaimer, limitation of liability, indemnity, termination, changes, governing law, and contact
- Apple/Google platform terms notes, including whether relying on Apple's standard EULA or custom terms

Acceptance:

- Subscription terms match the paywall, App Store/Play metadata, checkout copy, and cancellation flow.
- Claims and disclaimers are consistent with product behavior and public marketing.
- Founder/legal approval is required before publishing as final.

## `LEGAL_REVIEW.md`

Use to keep legal work auditable without pretending an agent is a lawyer.

Must include:

- official sources checked with dates and URLs
- jurisdiction assumptions
- data inventory evidence: files, SDKs, tables, events, permissions, vendors
- policy sections drafted
- open legal questions for founder/counsel
- publish blockers
- approval status and approver

## `LAUNCHBENCH.md` And `operations/FAILURE_CARDS.md`

Use when the launch is complex, the skill has been updated, or a repeated miss needs to become a reusable guardrail.

`LAUNCHBENCH.md` must include:

- scenarios run, date, runner, app repo/path, and skill version/commit if known
- deterministic validators run and command output summary
- scenario prompts or pointers to `evals/launchbench/*.yaml`
- expected failures caught and unexpected misses
- resulting failure cards or skill updates

`operations/FAILURE_CARDS.md` must include, when not fully captured in `state/business-state.json`:

- card ID, severity, owner, status, detected date, affected lane, evidence, impact, next action, validator, and resolution proof
- founder-only decisions related to the card
- downstream docs that must update before the card closes

Acceptance:

- Known regressions become scenarios, validators, or active failure cards.
- Launch-readiness claims cite validator or LaunchBench proof where practical.
- Failure cards close only with evidence, not "noted" language.

## `PROMPTS.md`

Each build prompt must include:

- what to read first
- files/components to create
- implementation constraints
- analytics events required
- definition of done
- explicit scope exclusions

Acceptance:

- Prompts are ordered; later prompts can assume earlier outputs.
- A builder can paste one prompt at a time.
- Analytics instrumentation is part of each prompt, not a later cleanup.

## `AUDIT_PROMPT.md`

Use for independent public-surface review. Include:

- repo URL and live URL
- stack
- intended funnel behavior
- brand rules
- audit dimensions in order: security, performance, brand/design, GEO/SEO, accessibility, code quality, funnel mechanics, pre-launch hygiene
- include launch-coverage dimensions when asking for readiness review: research, ASO/store, revenue, legal, analytics, support, QA, lifecycle messaging, crash/performance, and post-launch loop
- expected finding format
- "do not" section to prevent generic recommendations

Acceptance:

- Another frontier model can produce prioritized findings without a briefing call.
- The prompt includes live validation URLs for robots, sitemap, llms, schema, cards, and Lighthouse when applicable.
