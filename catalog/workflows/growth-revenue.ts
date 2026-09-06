import { workflow } from "./helpers.js";

/** Ported from runtime/graph/workflows/growth-revenue.ts. All are grantable-domain. */
export const workflows = [
  workflow({
    id: "workflow.data.analytics-and-attribution-blueprint",
    founderPhrasings: [
      "define what events we actually need to track",
      "set up analytics before we lock the funnel copy",
      "plan attribution before onboarding ships",
    ],
    title: "Analytics & attribution blueprint",
    domainId: "domain.data",
    areaIds: ["area.growth-revenue"],
    trigger: "Before locking onboarding/paywall/funnels/store CTAs or any prompt naming events",
    instructions:
      "Write analytics/ANALYTICS.md and render analytics/analytics-plan.html before onboarding, paywall, funnel, or store-CTA copy locks. Define one internal user ID, UTMs/click IDs plus self-reported source keys, and an event catalog with owner, trigger, properties, and QA method. Record the HDYHAU survey: randomize options, allow multi-select, include TV/offline, place it mid-onboarding, and connect it to blended ROAS. Name when paid acquisition would require AppsFlyer. Pass check:analytics-catalog and check:attribution against the authored contract and local implementation evidence. Live PostHog capture remains a later provider-proof boundary.",
    reads: ["strategy/RESEARCH.md", "PRODUCT.md", "state/business-state.json"],
    roleId: "role.backend-infrastructure-engineer",
    laneIds: ["analytics_attribution"],
    phaseIds: ["phase.1b"],
    dependencies: ["workflow.research.research-backed-spec"],
    outputPaths: ["analytics/ANALYTICS.md", "analytics/analytics-plan.html"],
    gates: ["check:analytics-catalog", "check:attribution"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.growth.paid-user-acquisition-system",
    founderPhrasings: [
      "we're ready to spend money on ads, where do we start",
      "set up a paid acquisition campaign",
      "pick a channel and start running paid ads",
    ],
    title: "Paid user-acquisition system",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "Before paid ads, ASA, Meta/TikTok/Google campaigns, or spend-readiness claims",
    instructions:
      "Write growth/PAID_UA.md: record the fit-gate decision, commit to exactly one paid channel with its target event and campaign destination, and mine the platform's public ad library for high-impression, long-running competitor ads before inventing angles. Record a Non-Competitor Angle Hunt with print, cross-niche, Ad Library adjacent, and second-profile sources; adopt at least one original non-competitor angle; expand the same ICP with a new motivation after the primary profile saturates; never clone competitor assets. Finish MMP Before Spend (tracking baseline complete before the first paid dollar). Default MMP is AppsFlyer: install the SDK, set RevenueCat $appsflyerId before trial or purchase, and prove sandbox events. A founder MMP waiver for any other stack must be a Founder MMP Waiver table with a past ISO date, founder or owner identity, named replacement stack, and approval state approved or granted. Pending prose does not bypass AppsFlyer. Keep campaigns as PAUSED drafts until founder approval. Record a 48-hour kill window after first spend. Build the RevenueCat/App-Store/PostHog/self-reported tracking baseline before any spend and record the four Decision Thresholds — attribution tolerance (default +/-20%), payback window (default 90 days), creative signal floor (default 2x target CPA or 7 days per creative), scale trigger (default 14 consecutive days at/under target CPA) — so growth/paid-ua-report.csv can be judged against a number, not a feeling. Target only the storefronts LOCALIZATION_MARKET_RESEARCH.md ranks Tier 1. Connecting ad accounts, creating campaigns, unpausing a PAUSED draft, or committing spend is a founder-only gate that must be confirmed before check:paid-ua passes.",
    // revenue/REVENUE_OPS.md is deliberately NOT in reads: its producer runs at phase.3b while
    // this node fires at phase.1d, so the file structurally cannot exist yet — pricing-claim
    // cross-checks happen once revenue-monetization has run.
    reads: ["DESIGN.md", "analytics/ANALYTICS.md", "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md", "state/business-state.json"],
    roleId: "role.marketing-guru",
    // costEstimate is deliberately ABSENT: paid-user-acquisition.md defers the amount to the
    // founder-approved budget cap, and an authored placeholder would both mis-park a smaller
    // approved budget and be recorded as the actual by buildActualPatch. Without it the autonomy
    // engine parks this node fail-closed until the founder's approved amount exists — that park
    // IS the control, and validate.ts surfaces the absence as a warning, not an error.
    laneIds: ["paid_user_acquisition"],
    phaseIds: ["phase.1d"],
    dependencies: ["workflow.data.analytics-and-attribution-blueprint"],
    outputPaths: ["growth/PAID_UA.md"],
    gates: ["check:paid-ua"],
    providers: ["provider.paid-ad-channels", "provider.posthog", "provider.revenuecat"],
    founderOnlyActions: ["approve ad-account access and spend"],
    actionClass: "spend",
    protectedCategory: "spend",
    idempotent: false,
  }),
  workflow({
    id: "workflow.growth.viral-growth-loop",
    founderPhrasings: [
      "build a referral loop so users invite their friends",
      "design a share-to-unlock mechanic",
      "grow through word of mouth instead of ad spend",
    ],
    title: "Viral growth loop",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "Before referral/share-to-unlock/invite/comment-loop mechanics",
    instructions:
      "Write growth/VIRAL_GROWTH.md: record the fit-gate decision, the product-specific growth thesis (audience/platform, visible result, emotional trigger, product loop, content loop, conversion moment), and the full Product Loop Contract (trigger, reward, recipient value, share artifact, surface, fallback, abuse controls, policy constraints). Sequence monetization timing so the paywall catches demand after emotional investment forms, not before, per onboarding-conversion.md and revenue-monetization.md. Compute the loop's real economics weekly in the Loop Economics section — viral coefficient k = (invites/shares per active user) x (recipient conversion rate to install/activation), plus cycle time — since k below 0.15 means the loop is decoration, not a growth engine, and share/view counts alone never justify calling the lane done. Any referral/share/unlock mechanic carrying streak, scarcity, or social-proof pressure gets an ethics-guardrail pass before it ships.",
    reads: ["DESIGN.md", "analytics/ANALYTICS.md", "product/experience/11-star-experience/11_STAR_EXPERIENCE.md", "state/business-state.json"],
    roleId: "role.marketing-guru",
    laneIds: ["growth"],
    phaseIds: ["phase.1e"],
    dependencies: ["workflow.data.analytics-and-attribution-blueprint"],
    outputPaths: ["growth/VIRAL_GROWTH.md"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.growth.launch-narrative-and-cadence",
    founderPhrasings: [
      "plan how we tell people we're going public",
      "write the launch day plan and what happens after",
      "figure out our announcement and momentum plan",
    ],
    title: "Launch narrative & cadence",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "Before the public announcement, launch-day run-of-show, or weekly release rhythm",
    instructions:
      "Write growth/LAUNCH_NARRATIVE.md covering the Fit Gate, feeling-first Launch Thesis, the Two Launch Types (rare tentpole vs. weekly feature-launch heartbeat), the Launch-Day Run-of-Show, and all post copy in fenced code blocks. Build the content direction from strategy/SIGNAL_CORPUS.md and the distribution evidence in strategy/RESEARCH.md. Keep a structured content-intelligence table with source, account baseline, audience fit, hook, structure, emotion, format, sales intent, and downstream result. Normalize outliers against the source account's normal result, and extract patterns without copying words, identity, assets, or exact composition. Judge audience quality through owned contacts, activation, and revenue when those values exist. Every post shapes a feeling before naming the feature and clears the 2026 DO-NOT-DO list: no hashtags, no emojis carrying the message, no link in the root post (first self-reply only), no seeded 'congrats!' replies, plus the no-slop-writing.md self-check. Public claims are limited to what is true and attributable — never launder the launch agency's own aggregate stats as this app's results — and any rage-bait line clears an ethics-guardrail review before it ships. Public posting, account connections, and paid amplification spend are founder-only gates that must be confirmed before launch goes live.",
    reads: [
      "DESIGN.md",
      "growth/VIRAL_GROWTH.md",
      "product/experience/11-star-experience/11_STAR_EXPERIENCE.md",
      "strategy/RESEARCH.md",
      "strategy/SIGNAL_CORPUS.md",
    ],
    // CONTENT_ASSETS.md is a consult: this node's phase-1e narrative-thesis firing predates the
    // producer (phase 2/3); the phase-3/6 firings pick the hero asset up once it exists.
    consults: ["growth/content-assets/CONTENT_ASSETS.md"],
    roleId: "role.marketing-guru",
    laneIds: ["growth"],
    phaseIds: ["phase.1e", "phase.3", "phase.6"],
    dependencies: ["workflow.data.analytics-and-attribution-blueprint", "workflow.growth.viral-growth-loop"],
    outputPaths: ["growth/LAUNCH_NARRATIVE.md", "growth/content-intelligence.csv"],
    founderOnlyActions: ["approve public launch posting"],
    actionClass: "publish",
    protectedCategory: "public_actions",
    idempotent: true,
  }),
  workflow({
    id: "workflow.money.revenue-monetization",
    founderPhrasings: ["set up subscriptions and pricing", "wire up the paywall and billing products", "decide how we're going to charge people"],
    title: "Revenue monetization",
    domainId: "domain.money",
    areaIds: ["area.growth-revenue"],
    trigger:
      "Before RevenueCat/Stripe/web billing, products, paywall, entitlement, webhooks, pricing. Founder phrasing: how do I charge for subscriptions or a purchase.",
    instructions:
      "Read the current strategy/OFFER_TEST.md before locking a production price. Distinguish proposals from exact founder-approved price decisions; a competitor contrast or opening build mandate is not price approval. Write revenue/REVENUE_OPS.md across all four spokes: RevenueCat project/entitlement/offering setup with the App Store container price held at Free (a Lifetime offer is a NON_CONSUMABLE IAP, never the container price), Stripe/web-billing setup when a web funnel is in scope, and the Price-Point Decision Procedure's competitor anchor table (5-10 rows from strategy/RESEARCH.md, dated) under a 'Pricing Decision' heading. Resolve the three named paywall-breaking gaps before calling any paywall ready: Apple MISSING_METADATA subscription-group localization, RevenueCat product-type reconciliation against the App Store counterpart, and a Release-scheme (not debug-preview) smoke check confirming currentOffering.packages is non-empty. Stand up the billing-health recovery system (grace period/account hold, billing-issue webhook to dunning push/email, one-tap update-payment) — roughly 31% of Play cancellations and 14% of App Store cancellations are involuntary billing failures, not churn. Record the Paywall Experiment Backlog with Surface and Engine columns (revenuecat_experiments default for monetization; bandit for creatives/ASA/UA; posthog for non-offering UX) and the Surface To Engine Matrix. Creating live products, changing any price/trial/renewal term, or enabling live checkout is a founder-only gate; check:revenue is the pass signal. When deriving territory prices from another subscription, write revenue/PRICE_DERIVATION.md, run `asc subscriptions pricing derive --dry-run` first, keep unavailable territories as blockers, and never infer approval from the multiplier.",
    reads: ["state/LAUNCH_TRACE.md", "strategy/RESEARCH.md", "strategy/OFFER_TEST.md", "state/business-state.json"],
    roleId: "role.engineering-leader",
    laneIds: ["revenue"],
    phaseIds: ["phase.3b"],
    dependencies: ["workflow.process.launch-trace-and-build-contracts"],
    outputPaths: ["revenue/REVENUE_OPS.md"],
    gates: ["check:revenue", "check:price-derivation"],
    providers: ["provider.revenuecat", "provider.stripe"],
    founderOnlyActions: ["approve pricing and product catalog"],
    actionClass: "mutate",
    protectedCategory: "legal_pricing",
    idempotent: false,
  }),
  workflow({
    id: "workflow.money.experimentation",
    founderPhrasings: ["what should we test next on the paywall", "run the next pricing experiment", "start iterating on the paywall now that it's live"],
    title: "Paywall experiment program",
    domainId: "domain.money",
    areaIds: ["area.growth-revenue"],
    trigger: "After a live paywall exists, or when the experiment backlog needs a next test",
    instructions:
      "Write revenue/PAYWALL_EXPERIMENT_PROGRAM.md as this node's owned cycle log. Record Cycle date, Backlog change, and Next experiment on each recurrence. Keep revenue/REVENUE_OPS.md Paywall Experiment Backlog as the registry. Every row names surface and engine (revenuecat_experiments, bandit, or posthog). Default monetization tests to RevenueCat Experiments and fetch the current Offering. Use bandit only for creatives, ASA keywords, or UA arms. Use PostHog only for UX that Offerings cannot express. Record the Surface To Engine Matrix. Fail shipping one paywall and stopping. Judge winners on cohort economics over a renewal window. Price and offer changes stay founder-gated. check:revenue is the pass signal.",
    reads: ["revenue/REVENUE_OPS.md", "state/business-state.json"],
    roleId: "role.engineering-leader",
    laneIds: ["revenue", "post_launch_ops"],
    phaseIds: ["phase.6"],
    dependencies: ["workflow.money.revenue-monetization"],
    outputPaths: ["revenue/PAYWALL_EXPERIMENT_PROGRAM.md"],
    gates: ["check:revenue"],
    providers: ["provider.revenuecat"],
    founderOnlyActions: ["approve pricing and offer experiment variants"],
    actionClass: "mutate",
    protectedCategory: "legal_pricing",
    idempotent: true,
    recurrenceDays: 14,
  }),
  workflow({
    id: "workflow.growth.geo-seo-public-visibility",
    founderPhrasings: [
      "make sure people can find our website on search engines",
      "get our public pages indexed and discoverable",
      "set up SEO before we publish the landing page",
    ],
    title: "GEO/SEO public-surface plan",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "Before editing any landing/policy/blog copy, robots.txt, llms.txt, sitemap, schema, or metadata",
    instructions:
      "Write GEO_SEO.md before an agent edits a landing, policy, or blog file. Run the Copy Compliance Pre-Edit Scan. Reject false claims, unshipped-feature promises, implied-authority claims, and price promises that conflict with revenue/REVENUE_OPS.md. Define the title, description, canonical URL, social cards, robots.txt, sitemap.xml, llms.txt, and JSON-LD contract. Localize only for Tier 1 markets in LOCALIZATION_MARKET_RESEARCH.md. This node prepares the local contract. It does not publish the site. The public-deploy node runs the live HTTP and JSON-LD checks after founder approval.",
    reads: ["state/LAUNCH_TRACE.md", "analytics/ANALYTICS.md"],
    consults: ["strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"],
    roleId: "role.marketing-guru",
    laneIds: ["growth"],
    phaseIds: ["phase.4"],
    // lane.growth depends on lane.analytics-attribution (catalog/lanes.ts); this workflow
    // and workflow.growth.pre-launch-funnel-landing-waitlist (which depends on it
    // transitively) previously enforced only traceability, so a landing/funnel page could
    // publish before event tracking existed (routing-depth audit, 2026-08-07).
    dependencies: ["workflow.process.launch-trace-and-build-contracts", "workflow.data.analytics-and-attribution-blueprint"],
    outputPaths: ["GEO_SEO.md"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.growth.pre-launch-funnel-landing-waitlist",
    founderPhrasings: [
      "build a landing page and waitlist before launch",
      "spin up a local landing site while the app is being built",
      "get a waitlist collecting signups before we ship",
    ],
    title: "Local landing site and waitlist build",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "Immediately after DESIGN.md is accepted — build the local landing site while app implementation runs",
    instructions:
      "Build a runnable local landing site in growth/landing/ after the landing-specific Design Room refresh. Use the approved promise, one conversion goal, current copy keys, a mobile CTA, truthful proof, responsive behavior, and a local build check. Add onboarding, localization, pricing, or screenshot material only when the accepted product makes it applicable. Write growth/landing/surface-contract.json with canonical input digests, applicability decisions, and local proof. Apply scrollytelling only when evidence supports it. Follow editorial-scrollytelling.md: move from situation to mechanism to outcome to proof; record stable scene states, copy hashes, accessible descriptions, save-data and reduced-motion behavior, forward/reverse behavior, and desktop/mobile browser QA. Use live motion exemplars when available, but express them through this product's design system. Author growth/landing/browser-proof.json for the accepted landing surface IDs with the current candidate SHA-256, exact implementation source roots, exact built entrypoint and resource-to-URL mapping, served origin and URL, and Chrome channel. Start the local server, then run `b2c browser-proof --workspace . --session-id <authorization.executionIdentity>` inside this exact engine attempt. The command must open a new browser context and materialize growth/landing/proof/browser-proof.json plus its immutable build, response, launch, navigation, and runtime receipt files. Never author, copy, relabel, or repair those proof files by hand. Run check:design-md, check:design-room, check:design-worthiness, check:vibecoded-tells, check:scrollytelling, and check:browser-runtime-proof. Do not deploy from this node.",
    reads: ["GEO_SEO.md", "analytics/ANALYTICS.md", "product/copy/COPY_BRIEF.md", "product/copy/COPY_DECK.md", "DESIGN.md"],
    consults: [
      "product/ONBOARDING.md",
      "strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md",
      "revenue/REVENUE_OPS.md",
      "store/app-store-listing/SCREENSHOTS.md",
      "growth/content-assets/CONTENT_ASSETS.md",
    ],
    roleId: "role.launch-surface-producer",
    laneIds: ["growth"],
    phaseIds: ["phase.4"],
    // The landing consumes the design direction only after its isolated audit passed; the
    // refresh edge below still reopens the Design Room's landing-specific evidence pass.
    dependencies: ["workflow.growth.geo-seo-public-visibility", "workflow.design.design-room", "workflow.design.design-system-audit"],
    refreshDependencies: [
      {
        workflowId: "workflow.design.design-room",
        instructions:
          "Record a landing-specific change classification and affected scope, then complete the Design Evidence pass for the landing hero, scroll behavior, micro-interactions, and other visual surfaces.",
      },
    ],
    outputPaths: ["growth/landing/"],
    gates: ["check:design-md", "check:design-room", "check:design-worthiness", "check:vibecoded-tells", "check:scrollytelling", "check:browser-runtime-proof"],
    actionClass: "mutate",
    // Local implementation and its repairs may repeat. Publication has its own protected node.
    idempotent: true,
    maxAttempts: 8,
  }),
  workflow({
    id: "workflow.growth.landing-funnel-audit",
    founderPhrasings: [
      "have someone who didn't build the landing page tear it apart",
      "does this website actually convert or just look busy",
      "audit every public page before we go live",
    ],
    title: "Landing and funnel audit (isolated)",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger:
      "After the local landing and funnel pages build, before publication and before any public page is called done; again after any accepted landing change",
    instructions:
      "Audit every modeled public page in growth/landing/ in a fresh context that never saw the producer's transcript: landing, waitlist, web-to-app worksheet, support, privacy, terms, deletion, and any referral or purchase page. Score conversion structure with the CRO discipline in reference.growth.cro-landing (promise, proof, first useful action before email; no invented social proof, no fake processing). Score the story map against reference.design.editorial-scrollytelling: situation to mechanism to outcome to proof, one measured controller, stable scene IDs, no-JS reading sequence, reduced-motion and Save-Data behavior, mobile recomposition. Apply the vibecoded tells and the twelve craft-bar conditions. Run no-ai-slop in detect mode on every visible string and the Impeccable detector when installed; record the detector JSON path. Re-run the GEO/SEO audit against the local preview and compare it with the dated baseline in GEO_SEO.md. Write findings only, with severity per page and the rubric version, into growth/CRO_AUDIT.md. Do not restyle or edit copy. An unresolved high-severity finding blocks publication.",
    reads: ["growth/landing/", "GEO_SEO.md", "product/copy/COPY_DECK.md", "DESIGN.md", "design/reviews/rubrics/"],
    consults: ["product/copy/COPY_REVIEW.md", "design/reviews/DESIGN_SYSTEM_REVIEW.md"],
    roleId: "role.marketing-guru",
    laneIds: ["growth"],
    phaseIds: ["phase.4"],
    dependencies: ["workflow.growth.pre-launch-funnel-landing-waitlist", "workflow.design.reference-pack-librarian"],
    reviewOf: ["workflow.growth.pre-launch-funnel-landing-waitlist"],
    outputPaths: ["growth/CRO_AUDIT.md"],
    gates: ["check:scrollytelling", "check:vibecoded-tells"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.growth.landing-funnel-publication-and-live-proof",
    founderPhrasings: ["publish the landing page we already built", "push the local landing site live", "deploy the approved landing funnel"],
    title: "Landing funnel publication and live proof",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "After the local landing build passes and an exact website-deployment standing envelope or one-shot approval is current",
    instructions:
      "Use agents/launch-surface-producer.md in approved-external-apply mode. A matching current standing envelope is sufficient authority; do not ask again. Otherwise park this one action in the consolidated founder handoff. Check the working tree, artifact digest, deployment-tool version, authenticated account, token scope, project, environment, and target domain before deployment. Publish only the accepted growth/landing/ build, then read back the deployment and check live HTTP status, mobile and desktop renders, browser form submission, duplicate submission behavior, analytics events, crawler files, social metadata, and every JSON-LD block. Record the URL and proof in growth/landing/README.md and engineering/PRODUCTION_READINESS.md. Run check:landing-funnel. Do not change product claims, prices, legal text, or store state during this node.",
    reads: ["growth/landing/", "GEO_SEO.md", "analytics/ANALYTICS.md", "state/business-state.json"],
    roleId: "role.launch-surface-producer",
    laneIds: ["growth"],
    phaseIds: ["phase.4"],
    // Publication waits for the isolated landing audit: an unresolved high-severity finding holds
    // the frontier here instead of going live.
    dependencies: ["workflow.growth.pre-launch-funnel-landing-waitlist", "workflow.growth.landing-funnel-audit", "workflow.trust.privacy-and-terms"],
    gates: ["check:landing-funnel"],
    founderOnlyActions: ["approve the exact landing deployment when no matching standing envelope exists"],
    actionClass: "publish",
    protectedCategory: "public_actions",
    idempotent: false,
  }),
  workflow({
    id: "workflow.growth.ugc-creator-engine",
    founderPhrasings: ["find creators to post about us", "pay influencers to talk about the app", "source user-generated content for marketing"],
    title: "UGC creator engine",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "Before founder-led organic social, creator sourcing/contracts, format-discovery tests",
    instructions:
      "Write growth/UGC_PLAYBOOK.md: record the fit-gate decision, then use strategy/SIGNAL_CORPUS.md and structured content intelligence to select formats. Normalize outliers against each source account's baseline, and extract patterns without copying words, people, assets, or exact compositions. Run the Day 0 format-discovery model — 3-5 creators, founder-written scripts for the first 4-8 weeks, same-day time-coded feedback, and 5-8 reps per format before judging it — and only call a format scale-ready after 2-3 hits from the same structure across 2+ creators plus downstream install, owned-contact, activation, referral, or revenue evidence. Every script in ugc/script-bank.md survives the judge panel (separate reviewer passes with fresh context, one job each — pacing, vocabulary, idea strength, structure — at least one grounded in a real creator's transcript corpus) before it earns filming or generation spend; record script_id and a passed/survived judge_verdict, since check:content-assets blocks any UGC-family generation missing either. Route to influencer-sponsorship-engine.md instead when the plan is paying creators who already have an audience rather than running new niche accounts. Creator payments, paid creator-platform spend, and public posting/scheduling are founder-only gates.",
    reads: [
      "DESIGN.md",
      "growth/VIRAL_GROWTH.md",
      "growth/LAUNCH_NARRATIVE.md",
      "growth/content-intelligence.csv",
      "product/experience/11-star-experience/11_STAR_EXPERIENCE.md",
      "strategy/SIGNAL_CORPUS.md",
    ],
    roleId: "role.marketing-guru",
    laneIds: ["growth"],
    phaseIds: ["phase.6"],
    dependencies: ["workflow.growth.viral-growth-loop", "workflow.growth.launch-narrative-and-cadence"],
    // ugc/script-bank.md was read downstream (fastlane-growth-ops) with no producer of record —
    // the compiler's read-as-readiness rule silently defeated (2026-08-19 audit). The engine
    // produces it here, where the doctrine always said it came from.
    outputPaths: ["growth/UGC_PLAYBOOK.md", "ugc/script-bank.md"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.growth.fastlane-growth-ops",
    founderPhrasings: [
      "automate our recurring social content and scheduling",
      "set up the growth content pipeline after launch",
      "run the fastlane social ops after beta",
    ],
    title: "Fastlane growth ops",
    domainId: "domain.growth",
    areaIds: ["area.growth-revenue"],
    trigger: "After launch approval/public beta, or usefastlane.ai/Blitz setup, scheduling, social analytics",
    instructions:
      "Write growth/FASTLANE_OPS.md and the fastlane/ artifact set (campaign-brief.md, prompts.md, angles.json, preferences.json, schedule.json) only after the Launch Readiness Gate is true: live store/TestFlight URL, current brand/onboarding/design docs, and product claims matching store/legal/revenue docs. Run safe API reads (GET /connections, /blitz/preferences, /blitz/angles, /content, /posts) before any mutation, keep format weights summing to 100 and angle weights covering every active angle exactly once, and never write FASTLANE_API_KEY to a committed file. Source real app media through the Route Ladder — in-app iOS Simulator (rung 0) first on a local Mac, MobAI for Android coverage, a repeatable capture cadence, or recorder-polished demo output — before generic generated visuals, and run the weekly Analytics And Iteration loop tying posts back to installs/trials/purchases/attribution rather than vanity engagement. Connecting accounts, first public post, and any scheduling change are founder-only gates; check:post-launch is the pass signal.",
    // growth/UGC_PLAYBOOK.md is deliberately NOT in reads: ugc-creator-engine (its producer)
    // shares phase.6 with this node but is not a dependency, so the file may not exist when this
    // fires — Fastlane sourcing works from the narrative and script bank it can rely on.
    reads: ["DESIGN.md", "growth/LAUNCH_NARRATIVE.md", "growth/content-intelligence.csv", "ugc/script-bank.md"],
    roleId: "role.marketing-guru",
    laneIds: ["growth", "post_launch_ops"],
    phaseIds: ["phase.6"],
    dependencies: ["workflow.growth.launch-narrative-and-cadence"],
    outputPaths: ["growth/FASTLANE_OPS.md"],
    gates: ["check:post-launch"],
    founderOnlyActions: ["approve social connections and scheduled posts"],
    actionClass: "publish",
    protectedCategory: "public_actions",
    idempotent: false,
    // The weekly Analytics And Iteration loop this node's own instructions demand: reopens on
    // its own calendar (reopenRecurringNodes) rather than treating one pass as done forever.
    recurrenceDays: 7,
  }),
] as const;
