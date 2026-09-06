# Launch Phases

Use these phases as a reusable playbook: skip phases already complete, but verify their artifacts before building on them.

At each founder decision, translate the internal phase into a plain-language label and outcome. Use the Founder Question Contract in `founder-zero-operator.md`: two or three choices with one recommendation, explicit consequences, a safe skip/fallback/defer route, and a revisit trigger. Do not expose lane names, staffing roles, proof jargon, or internal checklists without definitions.

## Contents

- Launch Scopes
- Phase 0: Orientation And Scaffold
- Phase 0a: Project State And Autonomy
- Phase 0b: Tool Access And Fallback Decisions
- Phase 1: Research-Backed Spec
- Phase 1b: Analytics And Attribution Blueprint
- Phase 1c: 11-Star Experience And Product Brainstorm Checkpoint
- Phase 1d: Paid User Acquisition System
- Phase 1e: Viral Growth Loop Contract
- Phase 1f: Launch Trace And Build Contracts
- Phase 1g: Security Architecture
- Phase 2: Brand, Design, And Visual System
- Phase 3: ASO, Store Ops, And Launch Dossier
- Phase 3b: Revenue And Monetization Ops
- Phase 4: Pre-Launch Funnel
- Phase 5: Builder/Rork/Agent Handoff
- Phase 5b: Engineering Orchestration And Production Readiness
- Phase 5c: Security Release Gate
- Phase 6: Post-Launch UGC/Fastlane Growth Engine
- Phase 6b: Post-Launch Operations

## Launch Scopes

The full phase flow below produces thirty-plus artifacts. That is right for a flagship subscription launch and overproduction for a utility shipped to learn — and overproduction is how launches die: most stall in planning, in artifact work nobody decided to stop. Scope the artifact burden with the founder at orient (AskUserQuestion when available) and record `project.launchScope` in `state/business-state.json`:

- **essentials** (recommended for a first launch; engine-enforced since v0.156.0 — the compiled plan parks every workflow whose lanes all sit in the profile's deferred set as not needed, and `b2c scope --verdict required` pulls one back in): the core spine runs — durable state, paid-tool routing, secrets, security baseline, research-backed spec with its Go/Pivot/Kill verdict, 11-star slice, design, onboarding, store readiness (signing and privacy packet included), revenue, privacy/terms, engineering with proof, and post-launch ops. Breadth lanes defer _through the normal deferral mechanics_ — `deferred` with a dated reason — typically: paid UA, viral growth loop, launch narrative, localization beyond the home storefront, UGC/Fastlane engine, lifecycle email beyond transactional, and GEO/SEO beyond the basic landing metadata. Market contact beats artifact completeness.
- **full**: every lane runs; the Deliverable Standard in `SKILL.md` applies in full. A deliberate choice — flagship bet, proven re-entry, scaling a winner — never a default.

Rules:

- The scope never silently disables a validator. Essentials deferrals carry dated reasons `check:lane-coverage` and `validate:launch-state` can see; deferred lanes revisit at the Phase 6b day-30 retro.
- A typo'd scope is an error (`validate:launch-state` accepts the selected catalog launch profile).
- Moving essentials → full (or back) is a dated founder decision in `state/business-state.json`.
- Revenue, privacy/legal, security, signing, and store-console lanes are never deferred by scope — an essentials launch still charges money, handles data, and passes review.

Two companion contracts bound pre-build weight:

- **Consumer-Norm Evidence Bar** (`founder-zero-operator.md`): store data, reviews, social language, funnel signal — never invented research governance.
- **Pre-Build Clock** (`project-state.md`): `project.kickoffDate` recorded at orient; `validate:launch-state` warns `project.pre_build_stall` past 45 days in phases 0–2.

## Phase 0: Orientation And Scaffold

Goal: know what business, repo, artifacts, and constraints are real.

Do:

- Load `founder-zero-operator.md`. Assume the founder is new to business tooling and make the agent responsible for sequencing and execution.
- Inspect the provided transcript/spec/repo and list existing artifacts.
- Identify current phase, business name, target platform, monetization model, data/backend assumptions, and launch surface.
- Load `project-state.md`.
- Create or refresh `state/business-state.json` from `examples/workspace/business/state/business-state.json`, establish scoped work authority, and record lane status honestly.
- Confirm the launch scope (see Launch Scopes above; recommend essentials for a first launch), record `project.launchScope` and `project.kickoffDate` — the pre-build clock starts now — and defer essentials breadth lanes with dated reasons.
- Report the first verified state, blockers, and next action.
- Create `operations/BUSINESS_ACCESS.md` and `operations/business-access.json`; present one phase-labeled founder question with selectable choices, consequences, a safe defer route, and the agent action that follows it.
- Create tasks/checkpoints for the engagement; block later phases on the right prior outputs.
- Decide whether to create one canonical repo bundle, a separate landing repo, or a product-build handoff bundle.

Outputs:

- `state/business-state.json`
- `operations/BUSINESS_ACCESS.md`
- `operations/business-access.json`
- concise phase plan
- source-of-truth file map
- open founder decisions list
- blocker list for access, money, domains, credentials, or destructive actions

Acceptance:

- A future agent can identify phase, autonomy mode, evidence, blockers, and founder-only gates without reading the entire repo.
- State and authorization records are current before provider, store, revenue, or legal work begins.
- The founder is not asked to manage a checklist or choose the next lane; one clear action unlocks the agent's recorded next work.

## Phase 0a: Project State And Autonomy

Goal: make the launch inspectable and bounded before the agent starts executing.

Do:

- Use `operations/BUSINESS_ACCESS.md` as the ownership/account spine and keep Doppler, social, store, email, domain, recovery, and 2FA state current.
- Load `project-state.md`, `provider-state-recipes.md`, and `failure-cards.md` only as needed.
- Set `autonomy.mode` to the least-powerful useful mode: usually `scout`, `draft`, `prepare`, or `apply`.
- Copy `examples/workspace/business/state/business-state.json` if no state file exists.
- Fill phase, platform, bundle/package IDs when known, source-truth files, lane statuses, tool/provider routes, required secret names, founder-only gates, proof commands, and active failure cards.
- Report the first verified state, blockers, and next action.

Outputs:

- `state/business-state.json`
- lane blockers in state, with detailed risks in `operations/FAILURE_CARDS.md` when needed

Acceptance:

- State never contains raw secret values.
- The session update states the blockers, proof, and required human decisions.
- Provider/store/social mutations remain blocked unless autonomy mode and founder approval allow them.
- `operations/business-access.json` owns the access decision and one-next-action handoff; state does not duplicate the ledger.

## Phase 0b: Tool Access And Fallback Decisions

Goal: avoid wasting tokens on weak free fallbacks when the founder may have, want, or be willing to buy the intended tool.

Do:

- Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md).
- List paid/account-gated lanes that affect the launch: AppKittie, XPOZ, Firecrawl, Higgsfield, MobAI Plus/Pro capabilities, Fastlane AI, ASO/MMP/ad tools, Sideshift/creator marketplaces, RevenueCat, Stripe, PostHog, Resend, and App Store/Play accounts. Record when MobAI Free covers the lane and when a fallback narrows cross-platform proof.
- Check current runtime access, local installs, user-provided exports, screenshots, PDFs, CSVs, API keys, and account sessions.
- Ask before replacing any paid/account-gated tool with a free fallback.
- Record selected routes, limitations, and blocked access in `strategy/TOOL_DECISIONS.md` or the relevant ops doc.
- Update `state/business-state.json` provider/tool routes after material tool decisions.

Outputs:

- `strategy/TOOL_DECISIONS.md` when more than one tool decision affects the launch
- founder-only access and spend decisions
- approved free-fallback list with limitations
- blocked paid-tool list

Acceptance:

- No free fallback is started just because a tool is missing from the runtime.
- A future agent can tell which paid tools were intended, which fallbacks were approved, and which artifacts are lower-confidence because of fallback mode.

## Phase 0c: Secrets Baseline

Goal: prevent secret sprawl before service setup, CI, deploys, webhooks, and provider CLIs start depending on hidden local state.

Do:

- Load [`secrets-management.md`](../operations/secrets-management.md).
- Continue the founder-zero handoff: explain Doppler simply, ask only for login or secure value entry, and let the agent perform project/config inventory, setup, and proof.
- Load `provider-state-recipes.md`.
- Default to Doppler unless the founder selected a different secret manager.
- If Doppler is selected, check `doppler --version`, current auth status, and whether `doppler.yaml` exists without printing secret values.
- Create `SECRETS.md` from the template before adding provider keys.
- Map expected secret-bearing services: AppKittie, XPOZ, Firecrawl, Higgsfield, MobAI, Fastlane, RevenueCat, Stripe, PostHog, Resend, Sentry, Supabase/Firebase/Postgres, Cloudflare/Vercel/GitHub Actions, App Store Connect, Google Play, Apple/Google signing, push, AI APIs, and social accounts.
- Add `.env.example` names only when the repo needs a local schema.
- Add or verify `.gitignore` blocks local env files, service-account JSON, app-store private keys, signing material, and downloaded credentials.
- Record founder-only secret/account actions and blocked values.
- Update `state/business-state.json` provider entries with docs checked date, required secret names, preflight, validation, fallback, and blocked secret state.

Outputs:

- `SECRETS.md`
- optional `doppler.yaml` with non-secret project/config hints
- optional `.env.example` with names only
- service token or provider-integration plan for CI/live environments
- updated `.gitignore` or blocker if the repo cannot be changed

Acceptance:

- New secrets have a route before implementation uses them.
- Secret-bearing commands have a `doppler run --` or approved provider wrapper.
- A future agent can tell which secrets are public client config, server-only, webhook signing secrets, store credentials, CI/deploy secrets, or local operator credentials.
- No raw values are written into docs, commits, screenshots, logs, or proof artifacts.
- `state/business-state.json` exposes names-only secret requirements and provider status without values.

## Phase 1: Research-Backed Spec

Goal: turn the rough idea into a defensible product spec.

Do:

- Load `paid-tool-routing.md` before replacing paid AppKittie, XPOZ, Firecrawl, or ASO tools with free public research.
- Run AppKittie category sweeps across plausible app-store categories by revenue, downloads, growth, ratings, and ads.
- Use the data to choose the storefront category; do not let internal vocabulary decide the App Store category.
- Deep-dive top competitors: pricing, trial length, paywall style, ratings, recent reviews, ads, screenshots, keywords, growth curves, feature breadth, creator partnerships, and contact/website/social surfaces.
- Use Firecrawl or an equivalent crawler/scraper to inspect competitor landing pages, pricing pages, help centers, policy pages, SEO pages, and funnel claims.
- Mine social language with XPOZ from Reddit, TikTok, X/Twitter, Instagram, and creator content for the pain users already name.
- Run keyword and name collision checks before locking a name, subtitle, or ASO angle.
- Judge the category against a stated revenue bar: top-competitor revenue estimates into strategy/RESEARCH.md's Category Revenue Reality table with an explicit pass/fail — data collection without a judgment is not evidence.
- Compile available founder and market material into `strategy/SIGNAL_CORPUS.md`, or record an explicit not-applicable status with an authored reason when no reusable source exists.
- Preserve claim dates, confidence, conflicts, and supersession.
- Identify one reachable audience, one exact discovery location, and one native format.
- Run a small offer test. Record exposure and CTA response in `strategy/OFFER_TEST.md`.
- Record a dated founder waiver and residual risk when the test does not run.
- Convert findings into a revised product spec, with evidence cited inline or in an appendix.
- Separate identity from storefront when needed: e.g. list where users search, position against the category if that is the wedge.
- Update `state/business-state.json` research/product/traceability lane statuses and active failure cards when evidence gaps remain.

Outputs:

- `PRODUCT.md` with accepted positioning, category strategy, competitor threat model, core loop, onboarding, monetization, roadmap, metrics, risks, and decisions
- evidence ledger with AppKittie tables, review summaries, XPOZ/social-language evidence, Firecrawl/web evidence, and keyword scan
- `strategy/SIGNAL_CORPUS.md` with reusable, lifecycle-aware signal records
- `strategy/OFFER_TEST.md` with measured response or a founder waiver
- initial `state/LAUNCH_TRACE.md` rows or equivalent trace section tying evidence to product decisions, claims, scope, and rejected alternatives
- the Go, Pivot, Or Kill verdict over category, wedge, demand, distribution, and offer evidence
- the verdict mirror in `lanes.research.go_pivot_kill_decision`
- short decision checkpoint for founder-only calls

Acceptance:

- A skeptical agent can tell why this category, this wedge, this price posture, and this name won.
- The founder has recorded a Go verdict over category-revenue, wedge, demand, distribution, and offer evidence. A Pivot re-enters this phase; a Kill here is the process succeeding — a research package instead of a shipped app.
- `check:research` refuses a done lane without that verdict, and every downstream lane depends on research.
- accepted scope and explicit non-goals are explicit.
- Unsupported claims are either removed or marked as needing validation.
- Competitor app-store, social, and web evidence are separated instead of blended into vague market claims.

## Phase 1b: Analytics And Attribution Blueprint

Goal: make launch learning visible before screens, funnels, paywalls, store CTAs, and builder prompts are locked.

Do:

- Load `analytics-attribution.md` and refresh current PostHog docs for the target stack before writing implementation details.
- Inventory every measurable surface: landing, app install/open, deep link, onboarding, attribution question, review prompt, paywall, checkout, subscription, restore, activation, referral/share, email, support, privacy/deletion, Fastlane/social, and backend/provider webhooks.
- Decide the analytics stack and boundaries: PostHog primary, RevenueCat subscription truth, Stripe/web checkout truth, Sentry for errors, GA4/ad-network tools only when paid acquisition or Google attribution requires them.
- Define identity stitching: anonymous distinct ID, auth/user ID, PostHog distinct ID, RevenueCat App User ID, Stripe customer ID, Resend/email ID, referral code, and reset/logout behavior.
- Define attribution capture: UTMs, click IDs, referrer, initial/latest campaign properties, deep links, store/ad-platform limits, referral/creator/vanity URLs, Fastlane content IDs, and self-reported source.
- Create event catalog and properties before design/build prompts. Include client UI events, provider/server truth events, and lifecycle/email events.
- Define dashboards and funnel cards: acquisition, onboarding, paywall/revenue, activation, retention, referral, email, Fastlane/social, quality, and privacy/support.
- Plan flags/experiments for onboarding, paywall, package mix, closing offer, referral, landing copy, and lifecycle messaging.
- Decide session replay, survey, and feedback use with privacy masking, consent/opt-out, sampling, and store disclosure notes.
- Render the plan in HTML so the founder sees what will be learned at launch.

Outputs:

- `analytics/ANALYTICS.md`
- `analytics/analytics-plan.html`
- updated analytics hooks in `PRODUCT.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `growth/EMAIL_OPS.md`, `store/STORE_CONSOLE.md`, and `growth/FASTLANE_OPS.md` when those docs exist
- founder-only analytics decisions: PostHog region, paid attribution/MMP spend, replay/survey posture, privacy/consent wording, and final dashboard access

Acceptance:

- The founder can inspect acquisition-to-revenue tracking in `analytics/analytics-plan.html` before implementation.
- A builder can implement analytics without inventing event names, user IDs, attribution properties, or dashboard definitions.
- Self-reported attribution and technical attribution are both planned.
- Privacy/legal/store-disclosure implications are documented before SDKs or replay/surveys are enabled.
- Current PostHog source URLs and date checked are recorded.

## Phase 1c: 11-Star Experience And Product Brainstorm Checkpoint

Goal: use the research to resolve the product's magical moment, line of feasibility, and product shape before engineering specs are built and actioned.

Do:

- Load [`eleven-star-experience.md`](../experience/eleven-star-experience.md).
- Load `parallel-agent-orchestration.md` and `engineering-orchestration.md`.
- Create `11_STAR_EXPERIENCE.md` and `11-star-experience.html`.
- Define the 1/2/5/6/7/10/11-star ladder with product-specific labels, scenes, emotional reactions, implied behavior, and learnings.
- Draw the line of feasibility and name the complete product experience.
- Translate the experience into product, onboarding, paywall, ad/creator hook, App Store screenshots, landing, lifecycle email, support, and engineering surfaces.
- Use Compound Engineering `ce-brainstorm` when research leaves multiple viable wedges, onboarding shapes, monetization postures, core loops, or user success definitions.
- Use the brainstorm to produce a requirements source, not implementation code.
- Preserve scope boundaries, actors, key flows, acceptance examples, risks, and non-goals.
- Skip the brainstorm only when `PRODUCT.md`, `11_STAR_EXPERIENCE.md`, `product/ONBOARDING.md`, `analytics/ANALYTICS.md`, and monetization assumptions already define product behavior tightly enough for planning. Do not skip the 11-star artifact for a real build handoff unless the experience lane is explicitly deferred or not needed with a reason.

Outputs:

- `11_STAR_EXPERIENCE.md`
- `11-star-experience.html`
- requirements/brainstorm document when product shape is ambiguous
- updated `PRODUCT.md`, `product/ONBOARDING.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `DESIGN.md`, and `engineering/TECH_SPEC.md` decisions when the experience or brainstorm changes product behavior
- decision log explaining whether the brainstorm was used or intentionally skipped

Acceptance:

- The founder can inspect the 11-star ladder and line of feasibility visually.
- The complete product experience is narrow enough to build and strong enough to shape design, ads, screenshots, onboarding, and engineering contracts.
- `ce-plan` or a builder never has to invent product behavior.
- Product alternatives are resolved before engineering tradeoffs are chosen.
- Open founder-only decisions are explicit.

## Phase 1d: Paid User Acquisition System

Goal: decide whether the app is ready for a small paid acquisition test and define the one-person operating system before anyone spends.

Do:

- Load `paid-user-acquisition.md`.
- Load `analytics-attribution.md`, `revenue-monetization.md`, `app-store-listing-prep.md`, and `remotion-content-assets.md` or `content-assets` guidance when tracking, LTV/CPA, store destination, or creative production is in scope.
- Decide fit: store/beta/web destination, onboarding/paywall readiness, RevenueCat LTV/cohort visibility, analytics baseline, creative angles, privacy/store implications, and founder-approved budget.
- Select one starting channel or document why paid UA is blocked/deferred/not needed.
- Create `PAID_UA.md` with channel choice, creative production system, tracking baseline, blended report, weekly schedule, stop/scale rules, founder-only gates, and trace rows.
- Add paid-UA events, dashboards, baseline windows, and ad-network/MMP decisions to `analytics/ANALYTICS.md` and `analytics/analytics-plan.html`.
- Update `revenue/REVENUE_OPS.md` with RevenueCat LTV/CPA/payback assumptions and `CONTENT_ASSETS.md` with paid creative source assets.
- Update `APP_STORE_LISTING.md`, `store/STORE_CONSOLE.md`, custom product page notes, or web-funnel docs when paid traffic lands on a store or web purchase surface.
- Run `npm run check:paid-ua -- --root .` before claiming paid acquisition readiness.

Outputs:

- `PAID_UA.md`
- `growth/paid-ua-report.csv` when spend is planned or active
- updated `state/business-state.json`, `state/LAUNCH_TRACE.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `CONTENT_ASSETS.md`, and store/funnel docs

Acceptance:

- Paid UA is not reduced to "try ads."
- One channel, creative cadence, baseline/blended reporting, RevenueCat economics, and stop/scale rules agree.
- Spend, account connections, ad SDKs, public creative, pricing, legal, and campaign launch remain founder-only gates.

## Phase 1e: Viral Growth Loop Contract

Goal: decide whether growth can compound through the product itself before treating UGC, Fastlane, or TikTok ideas as the whole growth plan.

Do:

- Load `viral-growth-loops.md`.
- Load `analytics-attribution.md`, `onboarding-conversion.md`, and `revenue-monetization.md` when the loop touches attribution, onboarding, paywalls, offers, purchases, or entitlements.
- Decide fit: visible product moment, emotional hook, platform-native audience behavior, privacy/policy risk, traffic quality, and monetization readiness.
- Create `VIRAL_GROWTH.md` with the growth thesis, product loop, referral/share mechanic, content loop, format lab, monetization timing, measurement plan, stop/scale rules, founder-only gates, and trace rows.
- Define backend/provider proof for referral unlocks, share rewards, creator codes, entitlements, duplicate handling, self-referral prevention, and abuse controls before implementation.
- Add growth-loop events and dashboards to `analytics/ANALYTICS.md` and `analytics/analytics-plan.html`.
- Update `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `growth/UGC_PLAYBOOK.md`, `CONTENT_ASSETS.md`, `growth/FASTLANE_OPS.md`, and `state/LAUNCH_TRACE.md` when the loop affects those surfaces.

Outputs:

- `VIRAL_GROWTH.md`
- `growth/format-lab.csv` or `ugc/script-bank.md` when content tests are in scope
- optional `growth/referral-loop-map.md` for non-trivial referral/unlock mechanics
- updated `state/business-state.json`, `state/LAUNCH_TRACE.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, and `revenue/REVENUE_OPS.md`

Acceptance:

- The launch explains how attention becomes product action, not just which videos to post.
- Referral/share mechanics have a fair fallback, abuse controls, and backend/provider validation.
- Content tests have stop/scale rules and downstream metrics beyond views.
- Founder-only gates are explicit for spend, public posting, pricing, social accounts, and legal/policy-sensitive incentives.

## Phase 1f: Launch Trace And Build Contracts

Goal: make the handoff from research to brand/design to implementation explicit enough that agents cannot lose why a decision exists.

Do:

- Load `flow-traceability.md`.
- Refresh `state/business-state.json` before creating trace rows so status reflects the current phase and blockers.
- Create or update `state/LAUNCH_TRACE.md` unless the launch is tiny enough for a clearly labeled trace section in `strategy/RESEARCH.md`.
- Assign stable trace IDs for major research findings, 11-star experience decisions, product decisions, claims, onboarding questions, paywall choices, data collection, store-console answers, and build-critical flows.
- Map each trace row to affected docs: `PRODUCT.md`, `11_STAR_EXPERIENCE.md`, `PAID_UA.md`, `VIRAL_GROWTH.md`, `strategy/BRAND.md`, `DESIGN.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `store/STORE_CONSOLE.md`, `engineering/ENGINEERING_PLAN.md`, and `engineering/PRODUCTION_READINESS.md` where applicable.
- Decide whether `engineering/TECH_SPEC.md` is needed. Create it when app/backend/web implementation needs data model, API/RPC/webhook contracts, state machines, permissions, integrations, app integrity, feature flags, or test fixtures.
- Record rejected decisions so future agents do not reintroduce weak claims, unproven features, generic styling, or unsupported monetization behavior.

Outputs:

- `state/LAUNCH_TRACE.md` or equivalent trace section
- `engineering/TECH_SPEC.md` when implementation complexity justifies it
- updated source docs with trace IDs or source pointers
- build-ready/deferred decision and blocker list
- updated `state/business-state.json` when trace/build-contract status changes

Acceptance:

- Every major experience, viral growth, brand, design, onboarding, revenue, privacy, store, and build decision can be traced to evidence or a founder-only decision.
- A builder can identify what must be implemented and how it will be verified without rereading every research source.
- Data/API/state behavior is precise enough that the implementation plan does not invent backend contracts.

## Phase 1g: Security Architecture

Goal: define the app's security posture before builders lock architecture, providers, webhooks, app integrity, and app-store disclosures.

Do:

- Load `security-release-hardening.md`.
- Refresh current OWASP MASVS/MASTG, OWASP ASVS, Apple, Android, Sentry, Claude Security, Codex Security, and MobSF docs as relevant.
- Decide whether Claude Security, Codex Security, GitHub Advanced Security, Snyk, Semgrep, Socket, MobSF Cloud, commercial app-integrity tools, or local/free fallbacks are intended. Record founder approval, blocked state, or fallback approval before running a replacement route.
- Create `trust/SECURITY.md` from the app's real surfaces: mobile platforms, backend/API, revenue, attribution, email, public funnel, app signing, store operations, support, privacy, and analytics.
- Define assets, trust boundaries, attacker capabilities, abuse paths, mitigations, accepted risks, and non-capabilities.
- Decide mobile hardening: iOS Keychain, ATS, DeviceCheck/App Attest, entitlements/deep links; Android Keystore, Network Security Config, Play Integrity, exported components/deep links.
- Map abuse controls for RevenueCat, Stripe, restore purchases, promo grants, webhooks, idempotency, rate limits, RLS/authz, support entitlement grants, and account deletion.
- Render `trust/security-review.html` so the founder sees the security lane, open risks, tool routing, and approval gates.
- Update `state/business-state.json` `lanes.security`, `providers.security_review`, and lane blockers.

Outputs:

- `trust/SECURITY.md`
- `trust/security-review.html`
- updated `state/business-state.json`
- optional public `.well-known/security.txt` or equivalent security contact route when public users, accounts, payments, user content, or sensitive data are in scope
- updated `engineering/TECH_SPEC.md`, `SECRETS.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `trust/PRIVACY.md`, `store/STORE_CONSOLE.md`, and `engineering/PRODUCTION_READINESS.md` pointers where security decisions affect implementation or disclosures

Acceptance:

- A builder knows which security controls are required, deferred, blocked, or not applicable.
- Security tool fallbacks are founder-approved or blocked, not silently downgraded.
- Revenue, webhooks, backend authz, app integrity, analytics privacy, email/domain security, and incident response are considered before launch readiness.
- Open risks have owner, reason, revisit date or expiry, and compensating control.

## Phase 2: Brand, Design, And Visual System

Goal: lock the brand enough for builders, designers, screenshots, and landing pages to stay consistent.

Do:

- Load `flow-traceability.md` and update `state/LAUNCH_TRACE.md` as brand and visual decisions are made.
- Load `eleven-star-experience.md` and make the visual language express the complete product experience, not a generic category aesthetic.
- Load `parallel-agent-orchestration.md` and `engineering-orchestration.md` when screen specs will become builder prompts or implementation work.
- Load `analytics-attribution.md` before locking screen analytics hooks, attribution questions, demo video metrics, paywall variants, or builder-facing event names.
- Load `design-visual-system.md` before creating visual artifacts, app screens, screenshot frames, or landing UI.
- Load `onboarding-conversion.md` before locking onboarding, demo videos, personalization questions, review prompts, paywall timing, or first-session activation.
- Build a compact brand strategy: name, tagline, archetype, voice, banned words, owned words, proof constraints.
- Use the Layers product-design workflow when the user need, conceptual model, or interaction flow is under-specified before choosing surface style.
- Create a canonical `DESIGN.md` using the Google Labs `design.md` token/prose format: colors, type, spacing, radius, component tokens, rationale, do/don't rules, and implementation notes.
- Use Taste and Impeccable guidance when available to set visual direction, avoid generic defaults, audit hierarchy/contrast/responsiveness, and polish final surfaces.
- Use Higgsfield for generated visuals, mockups, icons, mascots, screenshot art, demo videos, onboarding animation clips, and ad creative, using `DESIGN.md` as the source constraints.
- Add screen inventory, flows, states, copy keys, motion, component rules, constraints, and analytics hooks to `DESIGN.md`.
- Produce `product/ONBOARDING.md` when onboarding, personalization, review prompts, paywalls, or first-session activation are in scope.
- Render the design system and key visuals in HTML. Include component gallery, onboarding/paywall flow, mobile screen frames, responsive landing/funnel views, screenshot concepts, and any generated imagery embedded with direction/production labels.
- Generate or source only high-leverage visual assets: app icon direction, mascot/character sheet if relevant, hero/aha moment, onboarding reveal, share artifact, screenshot frames. Any asset board must also appear inside an HTML proof.
- Draft partnership or endorsement outreach if the concept depends on a named framework, creator, or expert.

Outputs:

- `strategy/BRAND.md`
- updated `analytics/ANALYTICS.md` screen/event hooks and `analytics/analytics-plan.html` if screens changed the measurement plan
- `DESIGN.md`
- `DESIGN_SYSTEM.md` only when useful as an expanded appendix or required by repo convention
- `design.md`
- `design/design-room.html` or equivalent rendered visual-system proof
- `product/ONBOARDING.md` and `product/onboarding.html` or equivalent rendered section when onboarding is in scope
- `brand.html` or equivalent rendered brand book when useful
- visual-reference assets with clear "direction vs production" labels
- `OUTREACH.md` if partnership/endorsement is material

Acceptance:

- A builder can implement without inventing a new visual language.
- A copywriter can reject off-brand copy using the voice rules.
- Brand voice, screen choices, and generated visual directions cite the research/product trace rows they express.
- AI-generated visuals are labeled as references unless final production-ready.
- `DESIGN.md` is linted with `npx @google/design.md lint DESIGN.md` when available, or the validation blocker is recorded.
- Visual artifacts are inspectable in HTML and use the same tokens/components as `DESIGN.md`.
- Mobile and desktop HTML proofs are checked for text fit, overlap, contrast, and responsive framing.
- Onboarding questions, mascot states, review prompt, paywall, closing offer, trial, and activation task are specified before builder handoff.

## Phase 3: ASO, Store Ops, And Launch Dossier

Goal: produce the operational plan for App Store launch and first acquisition tests.

Do:

- Load `analytics-attribution.md` before defining App Store CTAs, Apple Search Ads, Google Play listing experiments, creator/referral codes, post-launch metrics, or attribution dashboards.
- Load `paid-user-acquisition.md` before Apple Search Ads, paid ad library, custom product page campaign routing, MMP/ad-network SDK decisions, or paid-growth readiness claims.
- Load `aso-store-ops.md` and create or refresh `app-marketing-context.md` before writing listing copy.
- Load `app-store-listing-prep.md` before Apple listing packets, App Privacy questionnaires, pricing/subscription mapping, custom product pages, In-App Events, localization, or App Store marketing assets.
- Load `apple-signing-release.md` before Apple Developer account triage, Team ID, bundle ID/App ID, App Store Connect app record, Xcode signing, certificates/profiles, archive/export/upload, TestFlight, physical-device signing, or distribution-readiness claims.
- Load `store-console-workflow.md` before App Store Connect, Google Play Console, privacy labels/Data safety, screenshot capture/upload, reviewer notes, or founder-facing console handoff work.
- Use specialist ASO skills when available: app marketing context, keyword research, metadata optimization, screenshot optimization, custom product pages, In-App Events, ASO audit, launch planning, Apple Search Ads, localization, reviews/ratings, subscriptions, analytics, and competitor tracking.
- Write App Store metadata: name, subtitle, promotional text, keyword field, description, what's-new copy, categories, localization posture.
- Prepare App Store listing packet: App Privacy answers, pricing/RevenueCat/Stripe/web-funnel matrix, custom product pages, In-App Events, localization, screenshot/app-preview upload wells, and Higgsfield/design-system marketing asset route.
- Prepare Apple pre-ASC requirements: `store/APPLE_APP_STORE_REQUIREMENTS.md` with `PrivacyInfo.xcprivacy`, required reason API declarations, third-party SDK manifests/signatures, Xcode privacy report, App Privacy labels, protected-resource purpose strings, ATT, account deletion, review notes, archive/upload warnings, and founder approval before upload/submission.
- Define screenshots by frame: hero copy, device screen content, supporting line, source asset, raw MobAI/native iOS/device capture, production-text overlay notes, final upload dimensions, and upload well.
- Build an ad-copy library by angle clusters; tie angles to research, not vibes.
- Create Apple Search Ads or paid-channel campaign groups only inside `PAID_UA.md` or a linked campaign packet: exact/phrase/broad, defensive keywords, category keywords, competitor keywords, daily budget, success metrics, and founder approval.
- Verify store-console readiness with a copy-paste packet: categories, age rating, pricing/IAP/subscriptions, review notes, demo credentials, export compliance, privacy labels, privacy manifests/required-reason APIs, account deletion, screenshot slot requirements, App Icon/App Preview routes, and build/review status.
- Verify Apple distribution readiness separately from simulator builds: Developer Program membership, role, agreements, Team ID, `DEVELOPMENT_TEAM`, bundle ID/App ID, app record, capabilities/entitlements, Apple Development versus Apple Distribution signing path, archive/export/upload, and TestFlight processing.
- Add Google Play branch when Android is in scope: Data safety, privacy policy, account deletion web link, feature graphic, screenshots, short/long description, content rating, testing track, and store listing experiments.
- Define launch calendar from pre-launch through 6 weeks post-launch.
- Define monetization metrics and intervention thresholds: trial starts, Day 0 cancels, trial conversion, yearly mix, refund/dispute signals.
- Define post-launch ASO loop: weekly keyword/ranking/review/competitor deltas, screenshot experiments, ASA search-term mining, rating prompt health, subscription lifecycle, and localization opportunities.
- Draft privacy/terms requirements from the real data inventory and current official platform/regulatory sources; see `privacy-terms.md`.
- List founder-only decisions: launch date, final pricing, domain purchase, ad spend, endorsement send, screenshot approval, legal/privacy terms, subscription terms approval, and final store submission/resubmission.

Outputs:

- `LAUNCH.md`
- updated `analytics/ANALYTICS.md` attribution and store-source events
- `APP_STORE_LISTING.md`
- `store/APPLE_APP_STORE_REQUIREMENTS.md`
- `app-store-listing.html`
- `app-privacy-questionnaire.html` when Apple App Privacy answers are in scope
- `store/STORE_CONSOLE.md`
- `store/APPLE_SIGNING.md` when Apple distribution, TestFlight, physical-device signing, or first upload readiness is in scope
- `store/store-console.html`
- `SCREENSHOTS.md`
- `PAID_UA.md` when paid acquisition, Apple Search Ads, custom product pages, or ad creative are in scope
- `trust/PRIVACY.md`, `trust/TERMS.md`, and `LEGAL_REVIEW.md` when public collection, accounts, subscriptions, app-store submission, or sensitive data are in scope
- `app-marketing-context.md` or equivalent ASO context section
- screenshot mockups/assets, including raw captures and composed iPhone/iPad/Play final upload candidates
- ad and ASA plan
- launch sequence
- metrics dashboard requirements
- store-console readiness and review/rejection notes

Acceptance:

- App Store Connect can be filled from the doc without new copywriting.
- Apple upload readiness is not inferred from simulator success; `store/APPLE_SIGNING.md` proves distribution prerequisites or names the exact blocker.
- Apple upload readiness is not inferred from App Privacy copy; `store/APPLE_APP_STORE_REQUIREMENTS.md` proves privacy manifest, required-reason API, SDK, purpose-string, ATT, review-note, account-deletion, and upload-warning prerequisites or names the exact blocker.
- The founder can follow exact App Store Connect/Google Play click paths and copy values from `store/store-console.html`.
- Screenshot files are mapped from raw MobAI/native iOS/device capture to final upload asset by platform, device well, locale, slot, and dimensions.
- Store-console blockers are known before submission, not discovered during review.
- The launch plan states what to do when metrics miss thresholds.
- Any claims about partners, pricing, or scarcity are explicitly approved or removed.
- Legal/policy pages are marked draft until founder/legal approval, and app-store privacy answers are traceable to the data inventory.

## Phase 3b: Revenue And Monetization Ops

Goal: make pricing, subscriptions, app-store products, web checkout, and entitlement access operationally true.

Do:

- Load `analytics-attribution.md` before naming purchase, restore, entitlement, checkout, trial, closing-offer, subscription, or refund events.
- Load `secrets-management.md` before creating RevenueCat, Stripe, store, webhook, or billing keys.
- Load `revenue-monetization.md` before setting up RevenueCat, Stripe, store products, web billing, web purchase links, web funnels, paywalls, or subscription terms.
- Load `onboarding-conversion.md` before choosing hard vs soft paywall, trial length, plan mix, paywall dismissal behavior, or review/purchase timing.
- Decide the monetization path: waitlist-only, mobile app stores only, RevenueCat Web Billing, Stripe Billing through RevenueCat Web, existing Stripe sync, or no paid checkout yet.
- Create the product matrix: monthly, annual, lifetime, trial, intro offer, renewal price, store product IDs, RevenueCat products, entitlement, offering, Stripe price IDs, and supported markets.
- Set up RevenueCat concepts in order: project, app/web configs, products, `premium` entitlement, `default` offering, packages, platform credentials, server notifications, SDK keys, and webhooks when needed.
- Set up Stripe when web checkout or Stripe Billing is in scope: account/business profile, products/prices, Checkout/Payment Links or Customer Portal, tax posture, webhooks, branding, keys, and go-live checklist.
- Configure optional RevenueCat Web surfaces (Purchase Links, SDK, Paywalls, Funnels, Purchase Button, Redemption Links) when web-to-app purchase is part of the funnel.
- Verify identity and access: app user ID, RevenueCat App User ID, Stripe customer ID, anonymous web purchase, redemption link, restore purchases, backend projection, analytics, and support lookup.
- Update legal/privacy/subscription copy so paywall, web funnel, store products, terms, privacy, App Store/Play metadata, and checkout agree.
- Keep all live pricing, live checkout, tax, and store submission actions behind founder approval.

Outputs:

- `revenue/REVENUE_OPS.md`
- updated `SECRETS.md` for RevenueCat, Stripe, store credentials, webhook signing secrets, SDK keys, and deploy/runtime injection
- monetization section in `LAUNCH.md`
- updated `analytics/ANALYTICS.md` subscription and purchase events
- updated `trust/PRIVACY.md`, `trust/TERMS.md`, and `LEGAL_REVIEW.md` when payments, subscriptions, taxes, or web checkout exist
- sandbox/test purchase verification notes

Acceptance:

- A sandbox or Test Store purchase unlocks the expected entitlement in the app.
- Restore purchases works on a fresh install.
- Web checkout, if enabled, redeems into the app and grants entitlement.
- Stripe/RevenueCat webhooks, if used, are tested and idempotent.
- Public pricing and subscription disclosures match configured products exactly.
- Production/live checkout remains blocked until founder-approved.

## Phase 4: Pre-Launch Funnel

Goal: ship a measurable waitlist or preorder surface before the app is complete.

Default stack from the model session:

- Astro or similarly small web stack for a fast single-page funnel
- Cloudflare Pages/Workers for deploy
- Supabase Postgres + RPC for waitlist/referrals when a backend is needed
- PostHog for primary analytics, GA4 for ad/Google attribution when useful
- Sentry for errors
- Cloudflare R2 or equivalent for media assets

Do:

- Load `analytics-attribution.md` before building the funnel, waitlist/referral loop, PostHog setup, GA4 setup, web checkout, or campaign links.
- Load `secrets-management.md` before adding backend, email, analytics, deploy, database, or CI environment variables.
- Build the landing page around the locked brand, not a generic marketing template; hero, lifestyle, and feature-illustration art route through Higgsfield (`hero_banner` / `lifestyle_scene` modes) using a `DESIGN.md` brief, after confirming spend per `paid-tool-routing.md`, with every generated asset recorded in `CONTENT_ASSETS.md` (see the App Store URL → UGC Ad Batch recipe and the Cheap-First Direction recipe in `tool-recipes/visual-and-motion-production.md`).
- Add email waitlist and optional referral loop; avoid fake scarcity.
- Load `resend-email-ops.md` before configuring Resend, transactional sends, waitlist confirmations, lifecycle automations, broadcasts, inbound email, unsubscribe handling, or email webhooks.
- If monetization is active, wire only the approved checkout path (RevenueCat Web Purchase Link / Web Funnel / Web SDK, Stripe Checkout/Payment Link, or none); do not mix billing engines casually.
- Keep public keys public-only and secrets server-side.
- Route new secrets to Doppler or the approved provider as they appear; do not leave provider keys as shell-only setup.
- Add bot/rate-limit defenses proportional to launch stage.
- Configure and test domain contact routes before public submission: `support@`, `privacy@`, and any `hello@`/founder/security aliases required by the launch. With Cloudflare Email Routing: verified destinations, routing enabled at the zone, DNS configured, inbound tests passing.
- Configure outbound email deliberately: verified Resend sending subdomain, server-only API key, idempotent transactional sends, webhook observability, unsubscribe handling for lifecycle/marketing.
- Load `geo-seo.md` and add GEO/SEO files: schema, `robots.txt`, `sitemap.xml`, `llms.txt`, OG/Twitter metadata, canonical links, entity facts, and citeable question-answer sections.
- Use GEO specialist skills when available: full audit, technical SEO, AI crawler access, `llms.txt`, schema, citability, content, brand mentions, platform optimization, monthly compare.
- Publish privacy policy, terms, privacy choices/account deletion pages, and footer/app links when the funnel collects email, account, subscription, analytics, or referral data.
- Add security headers: CSP, HSTS after domain is stable, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy, X-Content-Type-Options.
- With a strict CSP, use the `@alpinejs/csp` build: it prohibits inline assignment expressions and `x-model` (use method calls and explicit event bindings). Resolve this before the first deploy, not after broken forms.
- **Pre-deploy gate (Cloudflare Pages/Workers via wrangler):** before any `wrangler deploy` or `npm run deploy` invocation, run all five gates in order:
  1. `git status --porcelain` — abort if dirty; never deploy uncommitted changes (wrangler warns but proceeds, leaving the live state unauditable).
  2. `wrangler --version` — upgrade if the major version is behind `npm show wrangler version`; stale majors silently limit deploy capabilities.
  3. `wrangler whoami` — confirm the token has Pages:Edit or Workers:Edit as required; a scope-insufficient token fails in ways that look like network or config errors.
  4. Rebuild (`npm run build` or equivalent) so the artifact is current before invoking wrangler.
  5. After deploy, confirm the deployment is active (dashboard or CLI) before verification.
- Deploy and verify both preview and custom domain.
- Smoke test signup, referral redirect, leaderboard/share state, analytics events, and mobile layout. **For any page containing an email capture or form, the smoke test must be browser-rendered, not curl or API-only.** Open the live URL in a real browser (or use MobAI/Playwright if available), fill in the form fields, click submit, and assert the success state is visible on screen. An API-level curl that returns 200 does not prove the browser form works; Alpine rendering bugs, CSP violations, and JS event-binding errors are invisible to curl. Do not declare the funnel ready until a browser-rendered form submission has succeeded end to end.

Outputs:

- landing repo or `growth/landing/` directory
- `analytics/ANALYTICS.md` and `analytics/analytics-plan.html` updated with web, referral, checkout, email, and campaign events
- `README.md` explaining stack, local dev, deploy, data flow, and pre-launch hygiene
- public `/privacy`, `/terms`, and deletion/privacy-choice URLs where required
- tested support/privacy contact aliases and DNS/email-routing notes
- `growth/EMAIL_OPS.md` when Resend or another email provider is used
- `GEO_SEO.md` or equivalent GEO/SEO verification notes when the site is public
- live URL and verification notes
- optional web funnel or checkout URL, sandbox/production status, and purchase-to-entitlement verification when monetization is active
- `AUDIT_PROMPT.md` for independent security/perf/brand/GEO/accessibility review

Acceptance:

- Live URL returns HTTP 200 and renders brand-critical copy.
- At least one test signup is completed **in a real browser** (not curl) end to end, reaching the visible success state, or a clear blocked reason exists.
- PostHog receives pageview and core funnel events.
- Mobile and desktop visual checks are done.
- Pre-deploy gates were satisfied before the last deploy: git clean, wrangler current major, token scope verified.
- `npm run check:landing-funnel -- --root .` passes without errors.
- DNS/cert status is known using concrete commands or dashboard evidence.
- Support/privacy email routes are active, DNS-configured, and tested from an external sender.
- Resend sender domain, test send, webhook, unsubscribe/preference, and automation/broadcast paths are verified when email is in scope.
- Privacy/terms links return HTTP 200 and match the current data inventory.
- Robots, sitemap, `llms.txt`, schema, metadata, canonical URL, and AI-crawler access have been verified on the live domain.
- Any active web checkout has a tested success/cancel path, attribution preservation, and support recovery path.

## Phase 5: Builder/Rork/Agent Handoff

Goal: package the business so another agent or builder can ship the app without rediscovering strategy.

Do:

- Load `flow-traceability.md` before writing builder prompts, `AGENTS.md`, or implementation specs.
- Load `parallel-agent-orchestration.md` and `engineering-orchestration.md` before writing `operations/ORCHESTRATION.md`, `AGENTS.md`, `CLAUDE.md`, `PROMPTS.md`, or any implementation prompt.
- Load `project-state.md` and `failure-cards.md` before the handoff is considered complete.
- Load `app-agent-roster.md` before writing repo-root `AGENTS.md`/`CLAUDE.md`, `APP_AGENTS.md`, app-local `agents/`, or specialist audit prompts.
- Use `launch-coverage.md` before moving from docs to implementation or submission.
- Create a business-specific `AGENTS.md` from `surfaces/workspace-template/repo-agent-entrypoints/AGENTS.md` as canonical source of truth: brief, stack, business model, brand rules, doc map, accepted scope and explicit non-goals, implementation conventions, analytics rules, continued `b2c` routing, Compound Engineering routing, `operations/ORCHESTRATION.md`, parallel-agent/worktree rules, MobAI/native iOS/device testing, and production-readiness gates.
- Include `state/business-state.json`, active failure cards, and LaunchBench/validator instructions in the first-read docs.
- Create `APP_AGENTS.md` and the seven-file `agents/` roster so future app work has an orchestrator plus marketing, engineering, security, product, design, and customer-success specialist entrypoints.
- Include paid-tool routing, approved fallbacks, and `strategy/TOOL_DECISIONS.md` so future agents do not silently downgrade AppKittie, XPOZ, Firecrawl, Higgsfield, MobAI, Fastlane, ASO, RevenueCat, Stripe, PostHog, Resend, or ASC/Play work.
- Add a tool-specific `CLAUDE.md`, `CURSOR.md`, or equivalent only as a pointer/addendum; start `CLAUDE.md` from `surfaces/workspace-template/repo-agent-entrypoints/CLAUDE.md` when Claude/Rork compatibility is needed.
- Include `state/LAUNCH_TRACE.md` and `11_STAR_EXPERIENCE.md` so builders can follow evidence-to-product-experience-to-design-to-build decisions.
- Include `engineering/TECH_SPEC.md` when data, API, state, permissions, platform capabilities, app integrity, feature flags, or integration behavior is in scope.
- Write an `analytics/ANALYTICS.md` event catalog and `analytics/analytics-plan.html` before build prompts. Do not let builders invent event names screen by screen.
- Include `PAID_UA.md` when paid acquisition, Apple Search Ads, custom product pages, paid creative tests, or spend-readiness claims are part of the business.
- Include `engineering/ENGINEERING_PLAN.md` when the app build is ready for `ce-plan`/`ce-work` or a generated builder.
- Include `engineering/PRODUCTION_READINESS.md` template or checklist before actual build execution begins.
- Include `product/ONBOARDING.md` and `product/onboarding.html` when the build includes onboarding, personalization, review prompts, or a paywall.
- Include `VIRAL_GROWTH.md` when social, referral, invite, creator-code, or share-loop mechanics are part of the business.
- Include `growth/UGC_PLAYBOOK.md` and `ugc/` artifacts when social/creator distribution is part of the business.
- Write sequenced build prompts for Rork or another builder. Each prompt should name required docs, deliverables, analytics events, definition of done, and scope exclusions.
- Bundle docs and visual references into a `rork-ready/` or `builder-ready/` directory when handoff to another repo is expected.
- Include push pattern, repo destination, commit guidance, and what assets are direction vs production.

Outputs:

- launch coverage table or explicit deferred-lane list
- `state/business-state.json`
- `AGENTS.md`
- `CLAUDE.md` when Claude/Rork/builder compatibility requires it
- `APP_AGENTS.md`
- `agents/` with orchestrator, marketing, engineering, product, design, and customer-success role prompts
- `state/LAUNCH_TRACE.md`
- `11_STAR_EXPERIENCE.md`
- `11-star-experience.html`
- `engineering/TECH_SPEC.md` when implementation contracts are in scope
- `analytics/ANALYTICS.md`
- `analytics/analytics-plan.html`
- `strategy/TOOL_DECISIONS.md` when paid/account-gated tools or fallbacks affect the launch
- `engineering/ENGINEERING_PLAN.md` when implementation is in scope
- `engineering/PRODUCTION_READINESS.md` checklist/template when implementation is in scope
- `LAUNCHBENCH.md` or recorded validator/LaunchBench state when checks have run
- `operations/FAILURE_CARDS.md` when active risks need more detail than `state/business-state.json`
- `PROMPTS.md`
- `product/ONBOARDING.md` and `product/onboarding.html` when in scope
- `PAID_UA.md` when in scope
- `VIRAL_GROWTH.md` when in scope
- `growth/UGC_PLAYBOOK.md` and `ugc/` artifacts when in scope
- `README.md`
- `docs/` bundle
- `assets/` bundle

Acceptance:

- A future agent knows the first file to read.
- A future orchestrator can route specialist audit work without duplicating product truth.
- A future agent can follow research decisions into 11-star experience, brand, design, build contracts, tests, and store/legal/revenue implications.
- Prompts are ordered and self-contained.
- Unaccepted features and prohibited components cannot enter the accepted product without a scope decision.
- Analytics events are required at the moment each screen/flow is built.
- Builder prompts route heavy work through Compound Engineering and require real frontend/backend/mobile proof, not only code generation.
- Launch state and failure cards are current at handoff time.

## Phase 5b: Engineering Orchestration And Production Readiness

Goal: implement the actual app with orchestration, review, and end-to-end proof.

Do:

- Load `flow-traceability.md` and require `engineering/ENGINEERING_PLAN.md` to reference trace IDs for build-critical work.
- Load `eleven-star-experience.md` and require the engineering plan to name the complete product experience and proof path.
- Load `parallel-agent-orchestration.md` and `engineering-orchestration.md`.
- Load `secrets-management.md` before writing code, tests, or deploy configs that introduce environment variables or credentials.
- Load `project-state.md` and `failure-cards.md` before declaring any lane done.
- Use `ce-brainstorm` first if product behavior is still ambiguous after research.
- Use `ce-plan` or an equivalent plan to create implementation units with repo-relative paths, dependencies, test scenarios, and verification.
- Use `engineering/TECH_SPEC.md` as the source for data models, API contracts, state machines, permission behavior, provider integrations, app integrity, remote config, and fixtures when it exists.
- Use `ce-work` or the builder's equivalent executor for engineering-heavy implementation.
- Use `ce-worktree` when parallel feature lanes need isolation or the current checkout must remain clean.
- Create or update `operations/ORCHESTRATION.md` and use parallel agents only for independent units that pass file-overlap, shared-resource, and dependency checks.
- Keep the orchestrator responsible for git state, staging, commits, full-suite tests, migrations, releases, and final readiness calls.
- Serialize MobAI/native iOS/device automation; other agents may prepare fixtures, inspect code, or analyze logs while the device owner runs the flow.
- Run backend and frontend E2E checks for in-scope user journeys: onboarding, attribution, paywall, entitlement, restore, referral, web checkout, lifecycle email, privacy/delete, analytics, and support.
- Run secret-bearing commands through `doppler run --` or the approved provider wrapper, and update `SECRETS.md` whenever implementation introduces new variables.
- Verify real test data lands where expected: database/Firestore/Supabase/Postgres, RevenueCat, Stripe, Resend, PostHog, Sentry, store console, or provider logs.
- Use `ce-code-review`, `ce-test-browser`, `ce-test-xcode`, `ce-proof`, or `ce-demo-reel` when available and appropriate.
- Use `xcodebuildmcp-testing.md` for all Apple simulator/device proof and start at its Route Ladder rung 0: the in-app iOS Simulator (Claude Code Desktop pane or Codex `build-ios-apps`) for running the app, checking screens, walking flows, and reproducing bugs on a local Mac. Escalate to XcodeBuildMCP, SnapshotPreviews, or serve-sim when the lane needs scripted/CI builds, preview coverage, or a browser-visible stream. Replacing MobAI with any Apple-only rung requires a recorded coverage decision per `paid-tool-routing.md`.
- Record all verification and blockers in `engineering/PRODUCTION_READINESS.md`.
- Run deterministic validators or LaunchBench checks where available, update failure cards, update `state/business-state.json`,.

Outputs:

- implemented app/backend/web changes
- updated `AGENTS.md`, `CLAUDE.md`, `engineering/ENGINEERING_PLAN.md`, and `engineering/PRODUCTION_READINESS.md`
- test artifacts, MobAI screenshots/recordings, provider/dashboard proof, and PR/release notes where applicable
- validator/LaunchBench output summary and active/resolved failure cards

Acceptance:

- Unit tests, integration tests, browser/mobile E2E, and provider/backend proof cover the launch-critical paths.
- Release/staging build has mocks disabled and production-like configuration verified.
- Frontend actions are proven against backend/provider state when a backend/provider is in scope.
- Device proof exists for critical mobile flows from the rung actually used — in-app iOS Simulator (rung 0), MobAI, XcodeBuildMCP, serve-sim, or SnapshotPreviews — with the rung, evidence paths, and coverage limitations recorded, or the blocker is explicit (including "no local Mac in this session" for cloud/SSH runs).
- Remaining gaps are founder-only gates, external access waits, or platform review waits.
- `state/business-state.json` matches the proof and blockers in `engineering/PRODUCTION_READINESS.md`.

## Phase 5c: Security Release Gate

Goal: prove security readiness before beta, TestFlight, store submission, public launch, or production-readiness claims.

Do:

- Load `security-release-hardening.md`.
- Run `npm run check:security -- --root .` or the installed-skill equivalent.
- Run `npm run check:secrets -- --root .` and any stack-native dependency/secret/static checks available.
- If founder approved paid/account-gated tooling, run or route Claude Security, Codex Security, GitHub Advanced Security, Snyk, Semgrep, Socket, MobSF Cloud, or commercial app-integrity checks and attach result paths.
- If fallback was founder-approved, run local alternatives such as MobSF Docker, gitleaks/trufflehog, Semgrep community rules, `npm audit`, `osv-scanner`, Xcode static analyzer, Android lint, or manual OWASP MASVS/ASVS checks.
- Verify release-specific controls: app signing, no server-only secrets in public/mobile bundles, webhook signatures, idempotency, rate limits, RLS/authz, entitlement restore, account deletion, support-grant audit log, PII scrubbing, Sentry release health, and security contact route.
- Resolve findings or record accepted risks with owner, reason, expiry/revisit date, compensating control, and founder approval.
- Update `trust/SECURITY.md`, `trust/security-review.html`, `engineering/PRODUCTION_READINESS.md`, `state/business-state.json`, and active failure cards.

Outputs:

- security validator output summary
- scan/review result paths or blocked-route proof
- updated `trust/SECURITY.md`
- updated `trust/security-review.html`
- updated `engineering/PRODUCTION_READINESS.md`
- active/resolved failure cards

Acceptance:

- Security readiness is tied to artifacts and command/tool evidence, not a verbal assurance.
- Paid security tooling is used, blocked, or founder-approved for fallback.
- Release blockers are visible in `state/business-state.json`.
- Accepted risks are explicit and do not hide known gaps.

## Phase 6: Post-Launch UGC/Fastlane Growth Engine

Goal: connect the launched app to a repeatable organic short-form content engine, using a creator-led UGC format-discovery loop when the product is a fit and Fastlane when the app is ready for generated/scheduled content operations.

Do:

- Load `paid-tool-routing.md` before using or replacing Fastlane AI, creator marketplaces, MobAI, Higgsfield, AppKittie, XPOZ, or paid social/ASO tools.
- Load `viral-growth-loops.md` when the channel depends on referral/share mechanics, creator codes, social-comment loops, app-store search behavior, or paywall timing.
- Load `ugc-creator-engine.md` when creator-led UGC, founder-led TikTok/Reels/Shorts, Sideshift, creator contracts, creator payments, or format discovery is in scope.
- Load `fastlane-growth-ops.md` when the app is approved, in public beta, or ready to start marketing through Fastlane AI.
- Refresh the viral growth fit decision: visible product moment, emotional hook, platform-native behavior, referral/share mechanics, monetization readiness, analytics proof, and compliant claim surface.
- Decide whether UGC is a fit: visible product moment, emotional hook, large consumer/prosumer audience, comment/share potential, and compliant claim surface.
- If UGC is a fit, create `growth/UGC_PLAYBOOK.md` with 90-day Day 0 plan, budget, 3-5 creator roster target, sourcing workflow, contract checklist, payment structure, script ownership, tracking sheet, and stop/scale thresholds.
- Use the installed `usefastlane-ai` skill and current Fastlane app/docs/API as the live source for endpoint behavior, workspace state, limits, and connected accounts.
- Confirm launch readiness before posting: store/beta links, landing page, privacy/terms/support links, approved claims, screenshots, pricing, and product analytics.
- Set up or inspect the Fastlane workspace at `https://app.usefastlane.ai/home` and follow the current in-app guide at `/guide` when accessible.
- Connect social accounts only with founder approval, then verify with safe API reads or current UI state.
- Create `growth/FASTLANE_OPS.md` and the `fastlane/` campaign directory.
- Build campaign brief, prompts, angles, Blitz preferences, UTM convention, and 30-day cadence from the launch docs.
- Use MobAI full-quality screenshots and screen recordings plus Higgsfield design-system visuals as approved media inputs.
- For polished app-flow demo videos, load `mobai-toolbelt.md` and route to MobAI `mobile-recorder-skill` for iOS/Android or `desktop-recorder-skill` for macOS/web. Save `.mob` or `screenplay.json`, raw capture, final export, captions, and upload copy in `growth/DEMO_VIDEO.md`.
- Use in-app iOS Simulator screenshots/recordings (rung 0, either runtime), or XcodeBuildMCP/serve-sim captures, when Apple-platform media is needed; copy captures off the Desktop into the repo's raw capture directory, verify native resolution against the target well, and record limitations.
- Generate content, QA it against brand/legal/store claims, and prepare a schedule.
- Schedule or post only after explicit approval.
- Run weekly analytics loops that connect Fastlane performance to installs, trials, purchases, attribution answers, and product analytics.

Outputs:

- `VIRAL_GROWTH.md`
- `growth/format-lab.csv` when format tests are in scope
- `growth/UGC_PLAYBOOK.md`
- `ugc/creator-list.csv`
- `ugc/creator-brief.md`
- `ugc/script-bank.md`
- `ugc/tracker.csv` or sheet link
- `ugc/weekly-review.md`
- `growth/FASTLANE_OPS.md`
- `fastlane/campaign-brief.md`
- `fastlane/prompts.md`
- `fastlane/angles.json`
- `fastlane/preferences.json`
- `fastlane/schedule.json`
- `fastlane/api-log.jsonl`
- `fastlane/metrics-snapshot.json`
- `fastlane/runs/<timestamp>/`
- updated `analytics/ANALYTICS.md`, `LAUNCH.md`, or `strategy/RESEARCH.md` notes when social learnings change positioning, keywords, or funnel assumptions

Acceptance:

- UGC starts only after fit, budget, rights, disclosure, and founder approval gates are clear.
- UGC scaling waits for repeatable format evidence, not one hit.
- API keys are never committed or printed.
- Connected social accounts, active angles, preferences, content status, and posting limits are verified from live Fastlane state.
- Every generated content item has a QA verdict before scheduling.
- Public posts use truthful app media and approved claims.
- First scheduling/posting remains founder-approved.

## Phase 6b: Post-Launch Operations

Goal: run the live business on a fixed weekly rhythm — crash health, reviews, retention economics, support, and the launch retro — so "launched" becomes an operating state, not an end state.

Do:

- Load `post-launch-operations.md`; create `operations/POST_LAUNCH_OPS.md` from the template and set `lanes.post_launch_ops` honestly.
- Stand up the crash route (Sentry or store crash reports) with alert routing and a crash-free release gate.
- Start the review-response loop with a stated SLA; mine reviews for failure cards, ASO language, and feature demand.
- Fix the release train (weekly/biweekly), staged rollout posture, hotfix criteria, and rollback path.
- Run the retention review: D0/D7/D30 cohorts, first-renewal inflection, voluntary-vs-involuntary churn split, reactivation posture.
- Verify support routing end to end (support@ alias, refund path, FAQ, escalation, data-deletion requests).
- Hand growth tactics to the existing lanes: `paid-user-acquisition.md` stop/scale rules, `fastlane-growth-ops.md` weekly loop, `aso-store-ops.md` monitoring.
- Fill `operations/LAUNCH_RETRO.md` at launch +7 days; refresh at day 30 and day 90; revisit essentials-scope deferred lanes at the day-30 retro.
- Run `npm run check:post-launch -- --root . --state state/business-state.json` before calling the lane done.

Outputs:

- `operations/POST_LAUNCH_OPS.md`
- `operations/LAUNCH_RETRO.md`
- updated `state/business-state.json` (`lanes.post_launch_ops`, failure cards from retro findings)
- weekly log entries in `operations/POST_LAUNCH_OPS.md`

Acceptance:

- The weekly rhythm has run at least once on the live app with evidence in the weekly log.
- Crash, review, retention, and support routes are proven, not planned.
- The retro exists and its misses are filed as failure cards or LaunchBench candidates, not oral lore.
- Each retro checkpoint that has completed (day-30, then day-90) carries a founder-decided Kill, Hold, Or Scale verdict (`post-launch-operations.md` §9); before day 30 the section's presence in `operations/LAUNCH_RETRO.md` is enough.
- `check:post-launch` passes with the lane status the state claims.

For cross-business allocation, use the Portfolio Allocation method in `post-launch-operations.md` section 9.
The optional `strategy/PORTFOLIO_REGISTRY.md` belongs in its portfolio workspace. It connects evidence, verdicts, dated learning, and the next-launch pipeline.
