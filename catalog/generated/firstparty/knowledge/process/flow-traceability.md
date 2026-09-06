# Launch Flow Traceability And Build Contracts

Use this for any multi-phase B2C app launch, especially before moving from research to 11-star experience, brand/design, or implementation. The goal is to keep evidence, product-experience decisions, visual decisions, security posture, build specs, and verification tied together.

Create `state/business-state.json` first for phase/lane/provider/proof state. Create `state/LAUNCH_TRACE.md` when the launch has more than one serious artifact. Create `engineering/TECH_SPEC.md` when actual app/backend/web implementation is in scope and data, API, state, permissions, integrations, or platform behavior need to be precise.

## Contents

- 1. Traceability Rule
- 2. `state/business-state.json`
- 3. `state/LAUNCH_TRACE.md`
- 4. Flow Gates
- 5. `engineering/TECH_SPEC.md`
- 6. Build-Ready Checklist
- 7. Common Failures

## 1. Traceability Rule

Every major launch decision should answer:

- What evidence caused this decision?
- Which paid/account-gated tool or confirmed fallback produced the evidence?
- What 11-star experience moment or complete product experience does it create or reject?
- What viral/referral/share loop, content format, or growth claim does it create or reject?
- What product behavior does it create or reject?
- What brand/design expression carries it?
- What analytics, security, revenue, privacy, ASO, or legal surface does it affect?
- What must a builder implement?
- How will we prove it works?

Do not move a claim, screen, onboarding question, paywall behavior, pricing statement, data collection, or store-console answer forward unless it has a trace row or a clearly documented founder-only decision.

### Lexicon Lock (one vocabulary across every surface)

Pick the canonical product nouns/verbs once (e.g. the core feature name, the unit users act on, the metric names) and use the **same words everywhere**: in-app copy, onboarding, landing page hero/method/FAQ, SEO meta description, JSON-LD/structured data, App Store listing, paywall, and email. Record the locked terms in `DESIGN.md` (or `strategy/BRAND.md`) as the single source of truth.

When a term changes, grep every surface and update them together — including the landing page's component files, `<meta>` description, and JSON-LD `description`/FAQ blocks, which are easy to miss. A term that means one thing in the app and another on the landing page (or a stale value left in one surface) reads as a different, less-trustworthy product and is a recurring drift bug. Treat "eliminate cross-surface inconsistency" as a sweep across all surfaces, not a single-file edit.

## 2. `state/business-state.json`

Use `state/business-state.json` as the current-state index over trace work:

- phase and autonomy mode
- lane statuses, evidence paths, and blockers
- provider routes, docs checked date, preflight, validation, fallback, and required secret names
- active failure cards and LaunchBench/validator proof
- founder-only gates and approval state

Update it before crossing any flow gate. Report the current evidence and blockers when a provider, store, revenue, legal, or readiness change affects launch risk.

`state/business-state.json` does not replace `state/LAUNCH_TRACE.md`. State tells the agent where the launch stands; trace explains why each decision exists.

## 3. `state/LAUNCH_TRACE.md`

Use this compact table shape:

```text
ID: EVID-001
Source: AppKittie competitor reviews, XPOZ TikTok query, Firecrawl pricing crawl, founder transcript, official docs, user export, or approved fallback
Tool route: paid tool | user export | free fallback | blocked | founder decision
Research finding: what we learned
Experience decision: what changes in 11_STAR_EXPERIENCE.md or 11-star-experience.html
Product decision: what changes in PRODUCT.md or product/ONBOARDING.md
Brand/design decision: what changes in strategy/BRAND.md, DESIGN.md, PAID_UA.md, VIRAL_GROWTH.md, growth/UGC_PLAYBOOK.md, or HTML proofs
Build contract: screen/component/API/data/state/task that must exist
Analytics/security/revenue/privacy/store impact: event, entitlement, threat/abuse control, data disclosure, screenshot, console field, signing/release gate, or legal note
Verification: test, MobAI path, backend/provider proof, browser proof, dashboard check, or founder approval
Status: planned | implemented | verified | blocked | rejected
```

Required sections:

- evidence index: source, date, tool, query/URL, and confidence
- tool-decision pointer when evidence came from a paid/account-gated tool or approved fallback
- decision trace table
- rejected decisions and why
- founder-only decisions
- implementation blockers
- verification map

Small launches can keep this inside `strategy/RESEARCH.md`, but the section must be easy to find and must be copied into builder handoffs.

## 4. Flow Gates

### Research To Spec

Pass only when:

- category, target user, competitor set, user language, pricing posture, and accepted scope and explicit non-goals are evidence-backed
- 11-star experience ladder, line of feasibility, and complete product experience are created or explicitly blocked
- unsupported claims are removed or marked founder-only/legal-review
- each core feature has a reason: demand, differentiation, monetization, retention, compliance, or operational need
- open product alternatives are resolved through `ce-brainstorm` or documented as explicit assumptions
- `state/business-state.json` marks research, paid-tool routing, and traceability status honestly

### Spec To Brand And Design

Pass only when:

- brand voice uses actual user/category language instead of founder-only phrasing
- `11_STAR_EXPERIENCE.md` defines the magical moment, and `11-star-experience.html` visually shows the ladder and line of feasibility
- core loop, aha moment, onboarding, paywall, support/privacy, settings, and error states have screen implications
- each public claim has an evidence/proof constraint
- `DESIGN.md`, `design/design-room.html`, and `product/onboarding.html` cite the trace IDs they express
- accessibility and localization constraints are visible before screenshots or implementation prompts
- `state/business-state.json` records the design lane as partial until `DESIGN.md`, and HTML proofs exist

### Design To Build

Pass only when:

- every build-critical screen has states, copy, components, analytics hooks, permissions, and backend/data expectations
- the complete product experience from `11_STAR_EXPERIENCE.md` is represented as concrete screen/state/data/API/analytics requirements
- every onboarding question maps to personalization, attribution, lifecycle messaging, privacy, or setup
- paywall and pricing surfaces match `revenue/REVENUE_OPS.md`, `trust/TERMS.md`, store products, and analytics events
- account deletion, privacy choices, restore purchases, support, and settings paths are specified
- `engineering/TECH_SPEC.md` or `engineering/ENGINEERING_PLAN.md` contains data/API/state contracts for every non-static flow
- failure cards are created for any unresolved attribution, security, revenue, store, privacy, email, or secret-routing risk

### Build To Proof

Pass only when:

- frontend actions are proven against backend/provider state
- MobAI or browser E2E covers critical user paths
- analytics, entitlement, email, deletion, restore, and support paths are verified where in scope
- `engineering/PRODUCTION_READINESS.md` records command outputs, fixtures, evidence paths, blockers, and founder-only gates
- deterministic validators or LaunchBench scenarios run where they exist, with results recorded in `state/business-state.json`

## 5. `engineering/TECH_SPEC.md`

Create this when the app has backend APIs, database/storage, auth, subscriptions, email, analytics, AI, push, account deletion, or non-trivial platform behavior.

For small builder handoffs, `engineering/TECH_SPEC.md` may be folded into `engineering/ENGINEERING_PLAN.md`, but the same sections must exist.

Must include:

- source docs and trace IDs
- architecture overview and repo boundaries
- auth/session model, roles, anonymous-to-known transition, logout/reset behavior
- data model: entities, fields, ownership, retention, deletion, indexes, migrations, and seed fixtures
- API/RPC/webhook contracts: route, method, auth, request, response, errors, idempotency, rate limits, and provider retries
- state machines: onboarding, account, entitlement, subscription, restore, deletion, support, lifecycle messaging, and offline/cache state where relevant
- permissions and platform capabilities: push, camera/photos, contacts, location, HealthKit/Health Connect, microphone, calendar, files, notifications, ATT/ad IDs, background modes
- integration contracts: PostHog, RevenueCat, Stripe, Resend, Sentry, Supabase/Firebase/Postgres, Fastlane, App Store/Play server notifications, AI providers, push providers
- app integrity and abuse posture when backend/paid/sensitive flows exist: Apple App Attest/DeviceCheck decision, Google Play Integrity decision, rate limits, bot defenses, replay/idempotency protection
- remote config, feature flags, kill switches, and staged/phased rollout controls
- error taxonomy and user-facing recovery copy
- logging/observability, alerting, dashboards, and privacy-safe debug data
- test fixtures and non-production accounts

Acceptance:

- a builder can implement without inventing schema, endpoint, state, permission, or integration behavior
- backend/provider truth can be tested from a real frontend or device action
- privacy/store disclosures can be traced to actual data and SDK behavior

## 6. Build-Ready Checklist

Before sending to Rork, Claude, Codex, or another builder:

- `state/business-state.json` exists and matches current artifacts
- The session update states the current result, blockers, and next action
- `state/LAUNCH_TRACE.md` exists or equivalent trace section exists in `strategy/RESEARCH.md`
- `PAID_UA.md` exists when growth depends on paid ads, Apple Search Ads, Meta/TikTok/Google campaigns, custom product pages, paid creative tests, MMP/ad-network SDK decisions, or paid-growth readiness claims
- `VIRAL_GROWTH.md` exists when growth depends on referral/share loops, creator CTAs, TikTok/Reels/Shorts mechanics, or viral paywall/onboarding behavior
- `11_STAR_EXPERIENCE.md` and `11-star-experience.html` exist unless the experience lane is explicitly deferred/not needed with a reason
- `strategy/TOOL_DECISIONS.md` exists when paid/account-gated tools or fallbacks shaped evidence, screenshots, testing, store ops, or growth
- `PRODUCT.md`, `strategy/BRAND.md`, `DESIGN.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, `trust/SECURITY.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `store/APPLE_SIGNING.md`, `APP_STORE_LISTING.md`, and `store/STORE_CONSOLE.md` are internally consistent for in-scope surfaces
- `engineering/TECH_SPEC.md` exists when data/API/integration/state behavior is non-trivial
- `engineering/ENGINEERING_PLAN.md` references trace IDs and breaks work into implementation units
- `AGENTS.md` points builders to trace, design, analytics, technical contracts, and readiness gates
- `engineering/PRODUCTION_READINESS.md` defines the proof expected before launch-ready is claimed
- active failure cards are assigned, blocked, or resolved with evidence

## 7. Common Failures

- State says a lane is done, but the artifact/provider/dashboard/proof does not exist.
- State is not updated after provider setup, app-record creation, signing changes, secret changes, revenue setup, or store-console work.
- A failure card is marked resolved without command, provider, dashboard, or founder-approval evidence.
- Research exists, but design and copy do not cite the evidence that shaped them.
- `design.md` lists screens, but no data model or API contract explains how they work.
- Analytics events are named, but no screen/API owner emits them.
- Privacy and store-console answers are traceable to legal copy, not actual SDKs, data tables, and backend behavior.
- Paywall copy, RevenueCat products, Stripe prices, terms, screenshots, and store metadata drift apart.
- Paid-tool evidence and free-fallback evidence are mixed together without confidence or limitation notes.
- MobAI verifies a visual path, but no provider/dashboard/database proof confirms the action landed.
- XcodeBuildMCP is used as a MobAI fallback without founder confirmation or without recording Apple-only coverage limits.
- A builder prompt references many docs but does not state the trace IDs or contracts that define done.
