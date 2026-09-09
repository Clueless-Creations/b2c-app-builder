<!-- catalog-generated:start domain-routing -->
# Domain Routing

Generated from catalog/domains.ts. Edit the catalog, not this file.

| Area of the business | Route here when | Load |
| --- | --- | --- |
| Running the launch | starting or auditing a launch: phases, coverage, artifact contracts, traceability, provider proof, or propagating a change across surfaces | [Index](#running-the-launch) |
| Driving the work | resuming a session, durable state, how much to decide alone, subagents, dynamic workflows, engineering routing | [Index](#driving-the-work) |
| Running the business | founder access and accounts, credentials and secrets, paid-tool decisions, authenticated actions, lifecycle email, and life after launch | [Index](#running-the-business) |
| Market research | before the spec hardens: category economics, competitors, review mining, social language, and which storefronts and locales are worth shipping | [Index](#market-research) |
| What you're building | scope, the core loop, V1 versus later, the copy-proof test, and shipped app archetypes | [Index](#what-youre-building) |
| How the app feels | the standout moment, onboarding and activation, welcome/splash screens, engagement mechanics and their ethics limits, push lifecycle, and work targeting better-than-expected | [Index](#how-the-app-feels) |
| Look and feel | brand, visual system, design tokens, motion, premium in-app craft, UX patterns, screen specs, rendered design state, and generated visual assets | [Index](#look-and-feel) |
| Every word a user reads | conversion copy, every in-app string, brand voice, and the writing-quality bar for anything a human reads | [Index](#every-word-a-user-reads) |
| Building the app | architecture, backend and data contract, engineering orchestration, device and simulator proof, and agent roles handed to future sessions | [Index](#building-the-app) |
| App Store and Google Play | metadata, ASO, keywords, screenshots, listing packets, privacy answers, locale choices, console walkthroughs, signing, uploads, release and rejection handling | [Index](#app-store-and-google-play) |
| Pricing and getting paid | RevenueCat, Stripe, store products, paywalls, subscriptions, entitlements, webhooks, taxes, restore purchases, and purchase proof | [Index](#pricing-and-getting-paid) |
| Marketing and growth | paid acquisition, viral and referral loops, launch narrative, creators, scheduled social, landing and funnel pages, and search visibility | [Index](#marketing-and-growth) |
| Analytics and tracking | before anything names an event: the event catalog, attribution, dashboards, funnels, flags, experiments, and replay | [Index](#analytics-and-tracking) |
| Privacy, security, and legal | threat modeling, platform hardening, scans, privacy policy and terms, account and data deletion, and store privacy disclosures | [Index](#privacy-security-and-legal) |

<!-- catalog-generated:end domain-routing -->

<!-- catalog-generated:start reference-index -->
# Reference Index

Generated from catalog/knowledge/**/*.yaml.

## Running The Launch

| Load when | Reference |
| --- | --- |
| writing docs, handoff bundles, or acceptance criteria | [`knowledge/process/artifact-contracts.md`](../../knowledge/process/artifact-contracts.md) |
| machine-read by check:change-cascade — the surfaces/change-types adjacency map; edit together with change-cascade.md, which renders the same map as a human table (twin-format pattern, not a duplicate) | [`knowledge/process/cascade-edges.yaml`](../../knowledge/process/cascade-edges.yaml) |
| after any change to a launched or near-launch app's features, copy, brand vocabulary, pricing, products, design, or data behavior | [`knowledge/process/change-cascade.md`](../../knowledge/process/change-cascade.md) |
| after a provider or store action changes evidence, or when reported status and readiness must match reducer state | [`knowledge/process/current-truth.md`](../../knowledge/process/current-truth.md) |
| before readiness claims; after a repeated agent miss; when adding a validator or scenario | [`knowledge/process/failure-cards.md`](../../knowledge/process/failure-cards.md) |
| crossing a phase boundary; deciding whether engineering/TECH_SPEC.md is needed; auditing whether research reached experience, design, and specs | [`knowledge/process/flow-traceability.md`](../../knowledge/process/flow-traceability.md) |
| "what else is missing", "launch readiness"; moving from planning to build or submission | [`knowledge/process/launch-coverage.md`](../../knowledge/process/launch-coverage.md) |
| any multi-phase launch or continuation; deciding where work starts | [`knowledge/process/launch-phases.md`](../../knowledge/process/launch-phases.md) |
| capturing a reusable maintainer learning or refreshing the learning corpus — grounding rules, evidence citations, and refresh verdicts | [`knowledge/process/learning-capture.md`](../../knowledge/process/learning-capture.md) |
| running the maintainer audit or reading its results while inside skill/ — repo-only steps run only from the repository root | [`knowledge/process/learnings/audit-runs-from-repo-root.md`](../../knowledge/process/learnings/audit-runs-from-repo-root.md) |
| when a freshness PR classifies a provider hash change or a runtime pin drifts | [`knowledge/process/provider-contracts.md`](../../knowledge/process/provider-contracts.md) |
| before marking any provider-backed lane (analytics/revenue/email/store/security/eng) done — evidence rules and the minimum PROVIDER_PROOF.md ledger row shape | [`knowledge/process/provider-proof.md`](../../knowledge/process/provider-proof.md) |
| selecting the repository kind for a workspace; compiling canonical artifacts, generated projections, front-door files, and mandatory safety gates for that kind | [`knowledge/process/repository-profiles.md`](../../knowledge/process/repository-profiles.md) |
| running research, setting up the funnel, configuring domain/email routing, checking analytics, choosing stack, or verifying deployment — the Recipe Routing hub into the 8 files in tool-recipes/, the Paid Tool Decision Protocol, and the Founder-Only Gates list | [`knowledge/process/tool-recipes.md`](../../knowledge/process/tool-recipes.md) |
| capturing truthful app UI proof — the Route Ladder from the in-app iOS Simulator through XcodeBuildMCP/SnapshotPreviews/serve-sim — routed from tool-recipes.md | [`knowledge/process/tool-recipes/device-capture-and-proof.md`](../../knowledge/process/tool-recipes/device-capture-and-proof.md) |
| routing engineering work through CE skills, parallel-agent rules, the three engineering record contracts, and choosing MCP, CLI, or skill-pack shape for a new third-party tool — routed from tool-recipes.md | [`knowledge/process/tool-recipes/engineering-and-agent-orchestration.md`](../../knowledge/process/tool-recipes/engineering-and-agent-orchestration.md) |
| privacy/terms research minimums, domain/email routing setup, or landing-funnel verification — routed from tool-recipes.md; complements the trust and growth rows | [`knowledge/process/tool-recipes/funnel-domain-and-privacy.md`](../../knowledge/process/tool-recipes/funnel-domain-and-privacy.md) |
| delegating ASO/paid-UA/viral-loop/UGC/Fastlane/GEO work to a specialist skill — routed from tool-recipes.md; complements the Marketing and growth rows, never replaces them | [`knowledge/process/tool-recipes/growth-and-store-routing.md`](../../knowledge/process/tool-recipes/growth-and-store-routing.md) |
| delegating AppKittie store intelligence, XPOZ social-language, last30days recency briefs, Firecrawl web intelligence, Refero UX pattern research, or name/keyword collision checks — routed from tool-recipes.md; complements the Market research rows | [`knowledge/process/tool-recipes/research-intelligence.md`](../../knowledge/process/tool-recipes/research-intelligence.md) |
| delegating RevenueCat/Stripe, Resend, or PostHog setup to a specialist skill, including the RevenueCat Economics Pull recipe — routed from tool-recipes.md; complements the money and analytics rows | [`knowledge/process/tool-recipes/revenue-email-analytics.md`](../../knowledge/process/tool-recipes/revenue-email-analytics.md) |
| the routing pointer into secrets-management.md, plus the config-name-preflight and env-file-extraction rules — routed from tool-recipes.md | [`knowledge/process/tool-recipes/secrets-and-environment.md`](../../knowledge/process/tool-recipes/secrets-and-environment.md) |
| Higgsfield or Remotion production routing, including the seven named chained recipes for ads/UGC/virality/seasonal restyle and the UGC-realism prompt structure for believable-person clips — routed from tool-recipes.md | [`knowledge/process/tool-recipes/visual-and-motion-production.md`](../../knowledge/process/tool-recipes/visual-and-motion-production.md) |

## Driving The Work

| Load when | Reference |
| --- | --- |
| choosing which compound-engineering (CE) skill to invoke for a build stage — the freshness/plan/work/review/ test/proof loop, generated builder prompts, parallel agents, and worktrees | [`knowledge/orchestration/compound-engineering-routing.md`](../../knowledge/orchestration/compound-engineering-routing.md) |
| a stage needs dozens-to-hundreds of agents, a codified quality pattern (adversarial verification, tournament, loop-until-done), or a run you want to read and rerun; documents a Claude Code preview feature — refresh the source basis before trusting a named flag/API | [`knowledge/orchestration/dynamic-workflows.md`](../../knowledge/orchestration/dynamic-workflows.md) |
| a founder asks for a complete end-to-end consumer delivery (app, full web funnel, store packet, analytics, trust, revenue, growth) carried to Submit-for-Review ready; when opening, resuming, or closing workflow.orchestration.full-launch-program; when checking the definition of done | [`knowledge/orchestration/full-launch-program.md`](../../knowledge/orchestration/full-launch-program.md) |
| before dispatching any producer whose surface a second agent must accept, before dispatching an auditor node, when writing or checking the review ledger in operations/ORCHESTRATION.md, and when a review, rubric, or fix loop is contested | [`knowledge/orchestration/isolated-review.md`](../../knowledge/orchestration/isolated-review.md) |
| dispatching or coordinating subagents — lane ownership, worktree isolation, budgets, quarantine, reconciliation, and reconciling durable state; before provider/store mutations or handoff in multi-lane work | [`knowledge/orchestration/parallel-agent-orchestration.md`](../../knowledge/orchestration/parallel-agent-orchestration.md) |
| reading state/business-state.json to resume runtime work, or changing runtime state through the reducer — the durable state schema, reducer contract, and continuation rules; author product scope and decisions in product.yaml and render PRODUCT.md; load together with parallel-agent-orchestration.md when dispatching subagents | [`knowledge/orchestration/project-state.md`](../../knowledge/orchestration/project-state.md) |

## Running The Business

| Load when | Reference |
| --- | --- |
| before first workspace onboarding or when changing autonomy, budgets, or standing approvals | [`knowledge/operations/autonomy-onboarding.md`](../../knowledge/operations/autonomy-onboarding.md) |
| deciding which project or config a credential belongs in; setting up secrets for a new business; adding a second business to an existing secret store; splitting secrets across web, mobile, backend, and CI — the portfolio-shape companion to secrets-management.md | [`knowledge/operations/doppler-organization.md`](../../knowledge/operations/doppler-organization.md) |
| always for dispatched business workers; especially every broad launch start, account/social/Doppler bootstrap, founder uncertainty, or attempted checklist handoff | [`knowledge/operations/founder-zero-operator.md`](../../knowledge/operations/founder-zero-operator.md) |
| before authenticated browser/API/CLI/native action on any provider, social, or store account | [`knowledge/operations/frontier-agent-operations.md`](../../knowledge/operations/frontier-agent-operations.md) |
| at workflow start for the one tool-intake question, before using or replacing any paid/account-gated tool, before running a free fallback, or when a service is missing from the runtime | [`knowledge/operations/paid-tool-routing.md`](../../knowledge/operations/paid-tool-routing.md) |
| once the app is live (phase_6/phase_6b); after first store approval; on "what now"; for weekly ops, incidents, review responses, retention and kill-or-scale reviews, or resuming a live app; when a second business exists | [`knowledge/operations/post-launch-operations.md`](../../knowledge/operations/post-launch-operations.md) |
| setting up or auditing any provider account (Doppler, Supabase/Firebase, PostHog, RevenueCat, Stripe, Resend, Sentry, App Store Connect, Google Play, Cloudflare) — what to record before and while configuring each, distinct from the deep secrets-management.md reference (Doppler is one of ten entries here, not the focus) | [`knowledge/operations/provider-state-recipes.md`](../../knowledge/operations/provider-state-recipes.md) |
| before Resend, API keys, transactional email, lifecycle automations, broadcasts, contacts/topics, webhooks, inbound email, unsubscribe, deliverability, or templates | [`knowledge/operations/resend-email-ops.md`](../../knowledge/operations/resend-email-ops.md) |
| before any new secret, key, token, env var, webhook secret, or .env; classifying a discovered secret; Doppler config preflight, shell-safety patterns, or production-readiness secret gates — the deep reference tool-recipes/secrets-and-environment.md routes into | [`knowledge/operations/secrets-management.md`](../../knowledge/operations/secrets-management.md) |

## Market Research

| Load when | Reference |
| --- | --- |
| before Phase 2 build; when research must name a paying audience, one reachable channel, and purchases as validation | [`knowledge/research/distribution-first-niche.md`](../../knowledge/research/distribution-first-niche.md) |
| before a Go, Pivot, or Kill decision; when founder posts, transcripts, reviews, interviews, support records, or prior launch material can inform the business; before automating a value-producing business loop | [`knowledge/research/distribution-offer-signal.md`](../../knowledge/research/distribution-offer-signal.md) |
| writing or updating strategy/RESEARCH.md's Category Revenue Reality or Go, Pivot, Or Kill sections; deciding whether a category and wedge earn a build before Phase 2 design/build spend | [`knowledge/research/go-pivot-or-kill.md`](../../knowledge/research/go-pivot-or-kill.md) |
| before localizing any surface (store metadata/keywords/screenshots, paywall/offers, landing/web, lifecycle email, paid storefronts) or choosing which locales to ship | [`knowledge/research/localization-market-research.md`](../../knowledge/research/localization-market-research.md) |
| before a consumer app Go verdict; when strategy/RESEARCH.md needs a one-screenshot 15s transformation demo that is not a vitamin feature | [`knowledge/research/transformation-demo.md`](../../knowledge/research/transformation-demo.md) |

## What You're Building

| Load when | Reference |
| --- | --- |
| "an AI assistant", "a chatbot for <domain>", "an AI companion/character", a coach/tutor chat app; before specing conversation schema, model integration, memory, usage metering, or the safety layer _(role-scoped: on hand via the Matched product archetype pack, not task-triggered)_ | [`knowledge/product/ai-chat-companion.md`](../../knowledge/product/ai-chat-companion.md) |
| the product does not match one of the four shipped app archetypes (habit tracker, photo/AI media, social network, AI chat companion) — before naming the core loop, defining every required system in the accepted product, or specing schema for any other product shape | [`knowledge/product/core-loop-and-complete-scope.md`](../../knowledge/product/core-loop-and-complete-scope.md) |
| "a habit tracker", "a streak app", a daily routine or wellness/productivity utility; before specing habits, check-ins, streaks, reminders, or insights _(role-scoped: on hand via the Matched product archetype pack, not task-triggered)_ | [`knowledge/product/habit-tracker.md`](../../knowledge/product/habit-tracker.md) |
| AI headshots/avatars, photo enhancer/restorer, AI art studio, "an app that turns photos into <X>"; before specing media storage, the generation pipeline, credits/metering, sharing, or safety _(role-scoped: on hand via the Matched product archetype pack, not task-triggered)_ | [`knowledge/product/photo-ai-media.md`](../../knowledge/product/photo-ai-media.md) |
| before the spec or launch surfaces harden — the moat and defensibility test for what makes this app hard to copy; see eleven-star-experience.md for the 11-Star Run Protocol itself | [`knowledge/product/product-moat.md`](../../knowledge/product/product-moat.md) |
| "build a social network", an X/Instagram/TikTok clone, "a community app for <niche>"; before specing schema, auth, feed, profiles, search, DMs, monetization, or invites _(role-scoped: on hand via the Matched product archetype pack, not task-triggered)_ | [`knowledge/product/social-network.md`](../../knowledge/product/social-network.md) |

## How The App Feels

| Load when | Reference |
| --- | --- |
| before first-session screen order; when onboarding needs welcome, quiz, micro-commitment, personalized insight, hard paywall, and install-to-trial quality metrics | [`knowledge/experience/commitment-funnel.md`](../../knowledge/experience/commitment-funnel.md) |
| grounding the emotional/behavioral layer in its research tiers, or auditing whether the four foundational Experience Cards are implemented | [`knowledge/experience/consumer-product-design-agency.md`](../../knowledge/experience/consumer-product-design-agency.md) |
| before PRODUCT.md, DESIGN.md, onboarding, ads, store screenshots, content assets, or engineering plans are treated as ready; on "11-star run"/"11-star pass" — follow the reference's 11-Star Run Protocol before any other output | [`knowledge/experience/eleven-star-experience.md`](../../knowledge/experience/eleven-star-experience.md) |
| any product, onboarding, core-loop, paywall, or return-session work targeting 6-star ("better than expected") or higher; "charge this feature with emotion", "apply the <name> card", "emotional UX audit" — the methodology hub | [`knowledge/experience/emotional-design-system.md`](../../knowledge/experience/emotional-design-system.md) |
| implementing one of the four foundational Experience Cards (Commitment, Variable Reward, Perceived Effort Delay, Intent Mirroring) — full psychological basis, trigger timing, deterministic guardrail tests, named PostHog events, and the Six-Lens Design Review Framework in full | [`knowledge/experience/emotional-experience-design.md`](../../knowledge/experience/emotional-experience-design.md) |
| instrumenting an emotional-design or Experience Card feature — system-level events/metrics, per-card PostHog events, leading behavioral metrics, dark-pattern counter-metrics, and A/B experiment design (measurement only; see emotional-design-system.md for the psychology) | [`knowledge/experience/emotional-experience-measurement.md`](../../knowledge/experience/emotional-experience-measurement.md) |
| a HIGH-risk Experience Card (variable reward, streak, scarcity, urgency, social proof) is in play, or before any regulatory/platform-compliance claim about an engagement mechanic — Bright-Line/Dark-Line test, FTC/EU DSA/Apple/Google Play/COPPA landscape, the guardrail attestation-block contract consumed by check:emotional-design | [`knowledge/experience/ethics-guardrail.md`](../../knowledge/experience/ethics-guardrail.md) |
| selecting or auditing an engagement mechanic — the 12-card deck index: card shape contract, live-MCP access model, Card Routing table to every card in experience-cards/, and the Ethics Ladder attestation-block contract | [`knowledge/experience/experience-cards.md`](../../knowledge/experience/experience-cards.md) |
| eliciting one voluntary early commitment from a user and echoing it downstream — routed from experience-cards.md's Card Routing table _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/commitment-card.md`](../../knowledge/experience/experience-cards/commitment-card.md) |
| pre-crediting real prior progress at enrollment to accelerate a user toward their first milestone — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/endowed-progress-card.md`](../../knowledge/experience/experience-cards/endowed-progress-card.md) |
| using a temporal landmark (new week/month/season) to reopen a lapsed journey without guilt copy — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/fresh-start-card.md`](../../knowledge/experience/experience-cards/fresh-start-card.md) |
| letting a user author an identity anchor (avatar, name, stated goal) that increases self-consistency pressure — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/identity-and-self-expression-card.md`](../../knowledge/experience/experience-cards/identity-and-self-expression-card.md) |
| reflecting a user's own stated goal back to them before an ask (e.g. a paywall) — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/intent-mirroring-card.md`](../../knowledge/experience/experience-cards/intent-mirroring-card.md) |
| surfacing earned skill/status visibility to sustain intrinsic motivation; pins a canonical motion-contract spring — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/mastery-and-status-card.md`](../../knowledge/experience/experience-cards/mastery-and-status-card.md) |
| engineering one session peak plus a strong close for memory-based re-engagement; pins a canonical motion-contract spring — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/peak-end-card.md`](../../knowledge/experience/experience-cards/peak-end-card.md) |
| showing real work happening during a wait to convert delay into perceived craft — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/perceived-effort-delay-card.md`](../../knowledge/experience/experience-cards/perceived-effort-delay-card.md) |
| giving unannounced real value before making any ask — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/reciprocity-card.md`](../../knowledge/experience/experience-cards/reciprocity-card.md) |
| designing fast, transparent failure recovery after an app or provider error — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/recovery-and-trust-repair-card.md`](../../knowledge/experience/experience-cards/recovery-and-trust-repair-card.md) |
| HIGH-risk: a streak or earned-continuity mechanic a user could feel loss-averse about losing — escape hatch and counter-metric required — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/streak-and-loss-aversion-card.md`](../../knowledge/experience/experience-cards/streak-and-loss-aversion-card.md) |
| HIGH-risk: an unpredictable-positive-outcome mechanic (reveal, spin, box); pins a canonical motion-contract spring; escape hatch and counter-metric required — routed from experience-cards.md _(role-scoped: on hand via the Implemented emotional experience cards pack, not task-triggered)_ | [`knowledge/experience/experience-cards/variable-reward-card.md`](../../knowledge/experience/experience-cards/variable-reward-card.md) |
| before onboarding quizzes, welcome/splash screens, personalization, attribution questions, demo videos, App Review popups, paywall timing, closing offers, trials, or first-session activation | [`knowledge/experience/onboarding-conversion.md`](../../knowledge/experience/onboarding-conversion.md) |
| Before onboarding research acceptance, identity and analytics decisions, design lock, prototype acceptance or final onboarding verification. | [`knowledge/experience/onboarding-foundations.md`](../../knowledge/experience/onboarding-foundations.md) |
| before paywall copy lock; when onboarding goals must interpolate an honest headline and a skipped-goal fallback | [`knowledge/experience/paywall-goal-headline.md`](../../knowledge/experience/paywall-goal-headline.md) |
| before push permission priming, opt-in timing, or notification lifecycle design; for transactional and lifecycle email mechanics load operations/resend-email-ops.md instead | [`knowledge/experience/push-notification-lifecycle.md`](../../knowledge/experience/push-notification-lifecycle.md) |

## Look And Feel

| Load when | Reference |
| --- | --- |
| Creating or materially revising DESIGN.md, choosing a direction, or independently reviewing communication, composition and audience fit. | [`knowledge/design/audience-derived-identity.md`](../../knowledge/design/audience-derived-identity.md) |
| calibrating complete consumer-business mobile and landing craft against primary-source product examples before production and independent review | [`knowledge/design/consumer-craft-benchmarks.md`](../../knowledge/design/consumer-craft-benchmarks.md) |
| accepting complete native and landing design or repairing missing, stale, producer-unbound, incomplete, or independently rejected visual evidence | [`knowledge/design/design-acceptance.md`](../../knowledge/design/design-acceptance.md) |
| before planning, creating, revising, auditing, or implementing any user-facing surface, component, interaction, onboarding flow, paywall, store frame, or marketing design; use it to classify the decision, select evidence sources, and record the evidence pass before mutation | [`knowledge/design/design-evidence-stack.md`](../../knowledge/design/design-evidence-stack.md) |
| planning or reviewing B2C screens and flows; changing the design system; routing store, landing, onboarding, paywall, or marketing-surface work; whenever a design output would otherwise become a second source of truth | [`knowledge/design/design-room.md`](../../knowledge/design/design-room.md) |
| creating or changing the authored root DESIGN.md contract, visual systems, UI mockups, generated visual concepts, Higgsfield-backed visuals/motion/icons/mascots, mobile screen specs, App Store creative, screenshot frames, design audits, or HTML visual artifacts | [`knowledge/design/design-visual-system.md`](../../knowledge/design/design-visual-system.md) |
| when a Design Room mutation needs the mechanical worthiness floor or its independent audit must record the delegated taste decision before engineering harden, including native flow semantics and mechanical anti-generic consistency, with no beauty score | [`knowledge/design/design-worthiness.md`](../../knowledge/design/design-worthiness.md) |
| before planning, building, changing, or auditing a scroll-led story on a landing page, funnel page, portfolio, case study, or other public web surface | [`knowledge/design/editorial-scrollytelling.md`](../../knowledge/design/editorial-scrollytelling.md) |
| before building or animating any landing page, funnel page, or web marketing surface | [`knowledge/design/landing-motion-craft.md`](../../knowledge/design/landing-motion-craft.md) |
| designing, implementing, or auditing a native mobile screen or flow; deciding navigation and presentation semantics; hardening native fidelity; defining motion; or preparing runtime design acceptance | [`knowledge/design/mobile-flow-craft.md`](../../knowledge/design/mobile-flow-craft.md) |
| implementing or auditing a specific motion recipe against check:motion-contract's numeric spring/duration tokens, tying a micro-interaction to the Experience Card it serves, or designing a cold-launch splash/loading/welcome-screen entrance (R11-R14), live-state effect, liquid morph, perimeter beam, liquid-metal ring, or semantic thinking orb (R15-R18) | [`knowledge/design/motion-craft-benchmarks.md`](../../knowledge/design/motion-craft-benchmarks.md) |
| building or polishing in-app UI; wiring press states, animation, haptics, keyboard, loading/empty states; any "premium feel" request | [`knowledge/design/premium-mobile-craft.md`](../../knowledge/design/premium-mobile-craft.md) |
| judging whether a design-room output is actually good, not just present — the 11-star taste filter, anti-generic checks, and inspiration sources applied during a design-room mutation (distinct from design-room.md's protocol and surfaces-b2c.md's schemas) | [`knowledge/design/quality-lens.md`](../../knowledge/design/quality-lens.md) |
| before using Refero, replacing Refero with a free pattern route, creating UX_PATTERNS.md, drawing web/mobile flow maps, or auditing pattern coverage | [`knowledge/design/refero-ux-patterns.md`](../../knowledge/design/refero-ux-patterns.md) |
| planning or producing generated, composed, captured or licensed assets; binding a versioned asset brief to the current brand kit; selecting compositing or interactive media; Remotion implementation; app-preview clips; social/ad/content variants; any rendered assets readiness claim | [`knowledge/design/remotion-content-assets.md`](../../knowledge/design/remotion-content-assets.md) |
| modeling Custom Product Page, Product Page Optimization, or In-App Event state with Apple's numeric limits (70 CPPs, 3 PPO treatments/90 days, 10 published/15 approved In-App Events); cross-surface consistency checks across web/landing/mobile-app/store families | [`knowledge/design/surfaces-b2c.md`](../../knowledge/design/surfaces-b2c.md) |
| when a landing page, funnel page, web marketing surface, or app screen needs the vibecoded-tells smell review — the trust-breaker/default-tell checklist, its scoring rule, and the vibecode audit pass dispatch prompt — and before any such surface is marked review-ready | [`knowledge/design/vibecoded-tells.md`](../../knowledge/design/vibecoded-tells.md) |

## Every Word A User Reads

| Load when | Reference |
| --- | --- |
| when any surface a user reads is authored or reviewed — landing, store listing, screenshot captions, paywall, onboarding, lifecycle email, share text — and when a new app's voice is established in COPY_BRIEF.md / BRAND.md (the Voice benchmarks section writes from this file's method) | [`knowledge/words/consumer-copy-benchmarks.md`](../../knowledge/words/consumer-copy-benchmarks.md) |
| before writing any words a user reads: conversion copy (hero/CTA, store, paywall) and every in-app string (buttons, empty states, errors, settings); and l10n readiness | [`knowledge/words/conversion-copy.md`](../../knowledge/words/conversion-copy.md) |
| always for dispatched business workers — the voice and writing-quality bar applied to whatever other lanes produce, covering onboarding, store listing, landing, paywall, email, ads, launch-post wording, UGC scripts, GEO/SEO | [`knowledge/words/no-slop-writing.md`](../../knowledge/words/no-slop-writing.md) |

## Building The App

| Load when | Reference |
| --- | --- |
| before accessibility declarations, beta readiness, or store submission | [`knowledge/engineering/accessibility-readiness.md`](../../knowledge/engineering/accessibility-readiness.md) |
| before app handoffs, builder-ready bundles, business-repo AGENTS.md/CLAUDE.md, or post-launch operating docs | [`knowledge/engineering/app-agent-roster.md`](../../knowledge/engineering/app-agent-roster.md) |
| before beta, store submission, production-readiness, or mobile performance claims | [`knowledge/engineering/app-quality.md`](../../knowledge/engineering/app-quality.md) |
| before engineering/TECH_SPEC.md data/API sections harden; before archetype schema/auth prompts run; when the founder wants Firebase or a custom backend instead of the Supabase default; auditing an existing data layer | [`knowledge/engineering/backend-data-contract.md`](../../knowledge/engineering/backend-data-contract.md) |
| before app implementation, backend/frontend work, or production-readiness claims — mobile quality bars, engineering/ENGINEERING_PLAN.md, engineering/PRODUCTION_READINESS.md, and device-proof expectations | [`knowledge/engineering/engineering-orchestration.md`](../../knowledge/engineering/engineering-orchestration.md) |
| a launch routes work to an installed third-party skill pack (marketing, writing, GEO/SEO, product management, legal templates, design tooling, design taste, layered product method) and the dispatcher must know which role may load it, in which mode, and with which boundary | [`knowledge/engineering/external-skill-packs.md`](../../knowledge/engineering/external-skill-packs.md) |
| after the Route Ladder in xcodebuildmcp-testing.md routes device work to MobAI — before MobAI device automation, .mob generation/healing, repeat or host-script actions, Sync Mode/multi-device work, Android coverage, performance gates, MobAI screenshots/recordings, recorder-skill demo videos and app previews, MobAI CI, or recorder-skill setup | [`knowledge/engineering/mobai-toolbelt.md`](../../knowledge/engineering/mobai-toolbelt.md) |
| before Expo or SwiftUI implementation when choosing recommended external agent skill packs for craft, motion, store work, optional recency research, or optional design-research provider guidance without vendor lock-in | [`knowledge/engineering/recommended-agent-skills.md`](../../knowledge/engineering/recommended-agent-skills.md) |
| writing or editing docs/architecture.md, docs/validators.md, this skill's own README.md/SKILL.md, any knowledge/*.md reference file, an ADR, a runbook, an API/config reference, or an engineering/TECH_SPEC.md-style spec authored for this repository itself; not root README.md/AGENTS.md/CLAUDE.md or founder/marketing copy, which stay with no-slop-writing.md | [`knowledge/engineering/technical-documentation-ste100.md`](../../knowledge/engineering/technical-documentation-ste100.md) |
| first for any "run the app", "check this screen", "walk this flow", "reproduce this bug", screenshot, screen-recording, or device-automation request on a local Mac — the Route Ladder starts at the zero-setup in-app iOS Simulator before XcodeBuildMCP CLI/MCP or MobAI | [`knowledge/engineering/xcodebuildmcp-testing.md`](../../knowledge/engineering/xcodebuildmcp-testing.md) |

## App Store And Google Play

| Load when | Reference |
| --- | --- |
| before Apple review submission; when STORE_CONSOLE.md needs social, chat, age-assurance, and UGC age-rating answers with product evidence | [`knowledge/store/age-rating-questionnaire.md`](../../knowledge/store/age-rating-questionnaire.md) |
| when an App Store version is in review; before any rejection remediation or resubmission; when Apple review state must be watched without mutation | [`knowledge/store/app-review-observe.md`](../../knowledge/store/app-review-observe.md) |
| after App Review observe classifies a rejection; before any consumer-repo fix, archive inspection, or verification recovery; never before a store submission | [`knowledge/store/app-review-remediate.md`](../../knowledge/store/app-review-remediate.md) |
| after bounded App Review remediation is independently verified; before any Apple resubmission; never from an observe-only mandate | [`knowledge/store/app-review-resubmit.md`](../../knowledge/store/app-review-resubmit.md) |
| before automating App Store Connect with the Rork asc CLI or CLI skill pack — app creation, metadata, screenshots, TestFlight, review status, RevenueCat catalog sync | [`knowledge/store/app-store-connect-cli.md`](../../knowledge/store/app-store-connect-cli.md) |
| before listing packets, privacy questionnaires, pricing/subscription field maps, custom product pages, in-app events, promotion pages, localization matrices, App Icon/App Preview work, or App Store marketing material | [`knowledge/store/app-store-listing-prep.md`](../../knowledge/store/app-store-listing-prep.md) |
| before ASC upload readiness on any iOS submission path | [`knowledge/store/apple-signing-release.md`](../../knowledge/store/apple-signing-release.md) |
| before initial listing keywords and weekly post-launch ASO; when STORE_OPS.md needs official Apple rank, discover, and score evidence | [`knowledge/store/aso-apple-keyword-evidence.md`](../../knowledge/store/aso-apple-keyword-evidence.md) |
| before App Store/Play metadata, screenshot planning, ASO audits, keyword research, Apple Search Ads, release/rejection handling, ratings/reviews, or post-launch monitoring | [`knowledge/store/aso-store-ops.md`](../../knowledge/store/aso-store-ops.md) |
| Android is in scope (platforms include android, or an android bundle id exists); before Play Console setup, Data Safety answers, content rating, Play App Signing, release tracks, closed testing, or pre-launch report triage | [`knowledge/store/google-play-release.md`](../../knowledge/store/google-play-release.md) |
| before store distribution in any selected region | [`knowledge/store/marketplace-regional-compliance.md`](../../knowledge/store/marketplace-regional-compliance.md) |
| when selecting or upgrading the Parth screenshot editor or Eronred screenshot strategy for a store creative task | [`knowledge/store/screenshot-toolchain.md`](../../knowledge/store/screenshot-toolchain.md) |
| before App Store Connect or Play Console setup, privacy labels/Data safety, screenshot capture/upload, reviewer notes, account-deletion console work, or any "where do I click and what do I paste" handoff | [`knowledge/store/store-console-workflow.md`](../../knowledge/store/store-console-workflow.md) |

## Pricing And Getting Paid

| Load when | Reference |
| --- | --- |
| the purchase-events backend/analytics contract, involuntary billing-failure recovery, or reactivation and win-back after a purchase already happened — routed from revenue-monetization.md | [`knowledge/money/billing-health-and-reactivation.md`](../../knowledge/money/billing-health-and-reactivation.md) |
| research proposes an offer or monetization locks a production price; separate hypotheses, offer evidence, and exact founder authority | [`knowledge/money/offer-and-pricing-decisions.md`](../../knowledge/money/offer-and-pricing-decisions.md) |
| paywall timing/placement/trials/offers, pricing disclosure, price-point procedure, standing experiment cadence, or RevenueCat Experiments vs bandit vs PostHog engine choice — routed from revenue-monetization.md | [`knowledge/money/paywall-pricing-and-experiments.md`](../../knowledge/money/paywall-pricing-and-experiments.md) |
| before RevenueCat, Stripe, app-store products, web billing, web purchase links, funnels, paywalls, subscriptions, webhooks, taxes, pricing, restore purchases, or entitlements — the Decision Matrix, Founder-Only Gates, and anti-pattern digest hub; see revenuecat-and-store-products.md, stripe-and-web-billing.md, paywall-pricing-and-experiments.md, and billing-health-and-reactivation.md for setup and procedure detail | [`knowledge/money/revenue-monetization.md`](../../knowledge/money/revenue-monetization.md) |
| when the selected RevenueCat operation needs official agent setup, identity, instrumentation, or verification procedures | [`knowledge/money/revenuecat-agent-tooling.md`](../../knowledge/money/revenuecat-agent-tooling.md) |
| RevenueCat project/product/entitlement/offering setup, App Store or Play product gates, MISSING_METADATA or RevenueCat product-type reconciliation, paywall smoke proof, or promotional IAP/subscription art — routed from revenue-monetization.md | [`knowledge/money/revenuecat-and-store-products.md`](../../knowledge/money/revenuecat-and-store-products.md) |
| Stripe account/checkout/webhook/customer-portal setup, or RevenueCat Web Billing, Web Purchase Links, Web Funnels, Web SDK, or Redemption Links — routed from revenue-monetization.md | [`knowledge/money/stripe-and-web-billing.md`](../../knowledge/money/stripe-and-web-billing.md) |
| before deriving subscription territory prices from another plan; when PRICE_DERIVATION.md needs dry-run, founder apply, and provider readback | [`knowledge/money/subscription-price-derivation.md`](../../knowledge/money/subscription-price-derivation.md) |

## Marketing And Growth

| Load when | Reference |
| --- | --- |
| before the first paid dollar; when paid UA needs the AppsFlyer SDK, RevenueCat $appsflyerId bridge, and spend-ready MMP proof | [`knowledge/growth/appsflyer-mmp.md`](../../knowledge/growth/appsflyer-mmp.md) |
| before building or auditing a public conversion surface: landing/waitlist, web-to-app, or launch page | [`knowledge/growth/cro-landing.md`](../../knowledge/growth/cro-landing.md) |
| after launch approval or public beta; on any usefastlane.ai request — workspace setup, social connections, Blitz campaigns, generated organic content, scheduling, canceling posts, short-form analytics | [`knowledge/growth/fastlane-growth-ops.md`](../../knowledge/growth/fastlane-growth-ops.md) |
| before the first file edit, not the deploy — any landing page file, component copy, screenshot metadata, policy page, robots.txt, llms.txt, sitemap.xml, schema, or metadata; also before publishing, AI-crawler access, or brand/entity signals | [`knowledge/growth/geo-seo.md`](../../knowledge/growth/geo-seo.md) |
| before spend-ready attribution; when a solo needs HDYHAU survey rules and a blended ROAS sheet ahead of AppsFlyer | [`knowledge/growth/hdyhau-blended-roas.md`](../../knowledge/growth/hdyhau-blended-roas.md) |
| before sponsoring established creators who already have an audience to integrate the app into their own content — sponsorship DMs/deal calls, flat/CPM/view-guarantee structures, brand-account credibility, meme/topic-page amplification, or per-deal payback tracking | [`knowledge/growth/influencer-sponsorship-engine.md`](../../knowledge/growth/influencer-sponsorship-engine.md) |
| before encoding an external iOS consumer-app playbook into paywall, onboarding, or paid-UA gates, including ToS-risky spend and social-proof tactics | [`knowledge/growth/ios-consumer-playbook-intake.md`](../../knowledge/growth/ios-consumer-playbook-intake.md) |
| before drafting the announcement, the launch-day sequence, the tentpole-vs-weekly-cadence plan, or launch post copy | [`knowledge/growth/launch-narrative-cadence.md`](../../knowledge/growth/launch-narrative-cadence.md) |
| before the first paid creative batch; when PAID_UA.md needs a four-source angle hunt and a competitor-wrong originality gate | [`knowledge/growth/non-competitor-angle-discovery.md`](../../knowledge/growth/non-competitor-angle-discovery.md) |
| before paid ads, Apple Search Ads, Meta/TikTok/Google campaigns, custom product page campaign routing, MMP/ad-network SDK choices, paid creative tests, or spend-readiness claims | [`knowledge/growth/paid-user-acquisition.md`](../../knowledge/growth/paid-user-acquisition.md) |
| before founder-run creator operations on new niche accounts the program controls — TikTok/Reels/Shorts UGC, founder-led format-discovery experiments, hired micro-creator sourcing/contracts/payments, or post-launch social distribution where the algorithm, not an existing audience, is the distribution engine | [`knowledge/growth/ugc-creator-engine.md`](../../knowledge/growth/ugc-creator-engine.md) |
| before referral unlocks, share-to-unlock, invite systems, social/comment loops, viral onboarding or paywall flows, creator CTAs, content format labs, or features meant to spread on TikTok/Reels/Shorts | [`knowledge/growth/viral-growth-loops.md`](../../knowledge/growth/viral-growth-loops.md) |

## Analytics And Tracking

| Load when | Reference |
| --- | --- |
| before onboarding, paywalls, funnels, store CTAs, referrals, lifecycle email, UGC/Fastlane campaigns, paid UA, or any builder prompt that names events; before PostHog setup, dashboards, deep links, feature flags, experiments, or session replay | [`knowledge/data/analytics-attribution.md`](../../knowledge/data/analytics-attribution.md) |
| when the selected PostHog operation needs official agent setup, identity, instrumentation, or verification procedures | [`knowledge/data/posthog-agent-tooling.md`](../../knowledge/data/posthog-agent-tooling.md) |

## Privacy, Security, And Legal

| Load when | Reference |
| --- | --- |
| when users can create, share, discover, or message content | [`knowledge/trust/community-safety.md`](../../knowledge/trust/community-safety.md) |
| when the app generates text, images, audio, or video | [`knowledge/trust/generative-ai-safety.md`](../../knowledge/trust/generative-ai-safety.md) |
| before a paid generative-AI capability can create provider spend; when AI_PROVIDER_CONTROLS.md needs auth, entitlement, reservation, and kill-switch evidence | [`knowledge/trust/paid-generative-ai-controls.md`](../../knowledge/trust/paid-generative-ai-controls.md) |
| before drafting or publishing privacy policy, terms, EULA, subscription terms, account/data deletion flows, or app-store privacy/Data safety disclosures | [`knowledge/trust/privacy-terms.md`](../../knowledge/trust/privacy-terms.md) |
| before threat modeling, hardening, scans, or any security-readiness claim — Default Output contract, OWASP MASVS/ASVS and platform security basis, paid-tool routing with fallbacks, mobile hardening checklists, and revenue/entitlement abuse controls feeding trust/SECURITY.md | [`knowledge/trust/security-release-hardening.md`](../../knowledge/trust/security-release-hardening.md) |

<!-- catalog-generated:end reference-index -->
