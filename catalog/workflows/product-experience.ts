import { workflow } from "./helpers.js";

/**
 * Product and experience workflows.
 *
 * Two single-writer fixes versus v1 (see build-release.ts's header for the full rule):
 * `PRODUCT.md` was declared by both `app-archetype-detection-and-starter` and
 * `research-backed-spec` — an "either path produces the spec" OR-relationship v1's model
 * tolerated but compile.ts's single-writer rule does not. `research-backed-spec` is the
 * general-purpose route and keeps the artifact; `app-archetype-detection-and-starter`'s
 * real distinctive contribution is the matched starter scaffold (`check:archetype-starter`
 * proves that separately, against `surfaces/starters/`), not a second product authority, so it declares no
 * output. `product/experience/ux-patterns/UX_PATTERNS.md` was declared by both
 * `ux-patterns-refero` (its dedicated producer, via provider.refero) and
 * `premium-mobile-craft`. The Design Room workflow owns the authored `DESIGN.md`
 * contract, the structured screen map, and its read-only review page.
 *
 * The onboarding capability expands into typed ONB-00 through ONB-22 catalog nodes so the
 * durable engine can schedule, checkpoint, retry, resume, and verify the nested graph. Only
 * ONB-22 writes the canonical onboarding artifacts, preserving the catalog's single-writer rule.
 */
const onboardingGraphWorkflows = [
  workflow({
    id: "workflow.experience.onboarding-system.onb-00-resume-scope",
    founderPhrasings: [
      "decide if this onboarding needs a full rebuild or just a tweak",
      "figure out how big a job this onboarding change actually is",
      "classify what kind of onboarding change this actually is",
    ],
    title: "Onboarding ONB-00: resume and classify scope",
    // Same production-verification rationale as ONB-03 below: with no gate, this entry node
    // compiled to verification "none", so an executor could return the declared scope-packet
    // artifact ID and fingerprint without ever writing a real resume/classify decision -- and
    // ONB-01 would become runnable immediately, with nothing downstream reading ONB-00's own
    // packet, letting the entire graph proceed without its foundational scope classification.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Consumer onboarding work begins or resumes; classify greenfield, replacement, audit-only, or a bounded incremental onboarding change",
    instructions:
      "Determine whether this onboarding pass is greenfield, replacement, audit-only, or a founder-scoped incremental change, and record the affected product surfaces, freshness date, responsible owner, the durable user value at stake, and whether the mode requires a hard cutover with only the target runtime. Write the decision into product/onboarding/graph/ONB-00-resume-scope.md's Execution Mode fields \u2014 check:onboarding-evidence-onb-00 rejects a stub or templated packet, and every downstream node through ONB-21 blocks on this classification.",
    reads: ["analytics/ANALYTICS.md", "product/experience/11-star-experience/11_STAR_EXPERIENCE.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.data.analytics-and-attribution-blueprint", "workflow.experience.11-star-experience"],
    outputPaths: ["product/onboarding/graph/ONB-00-resume-scope.md"],
    gates: ["check:onboarding-evidence-onb-00"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-01-current-state-trace",
    founderPhrasings: [
      "map out how signup actually behaves today, screen by screen",
      "trace the current onboarding implementation end to end",
      "document what onboarding does today before we change it",
    ],
    title: "Onboarding ONB-01: current-state trace",
    // Same production-verification rationale as ONB-00 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger:
      "Trace the actual onboarding implementation, documents, routes, state, providers, events, failures, tests, and replaced surfaces. Founder phrasing: signup behaves like this today, screen by screen.",
    instructions:
      "Trace the onboarding implementation as it exists today, surface by surface: for each route, state slice, provider call, event, permission, paywall, and replaced code path, record owner, source of truth, persisted state, API/event contract, consumers, and failure behavior. Write the trace to product/onboarding/graph/ONB-01-current-state-trace.md \u2014 check:onboarding-evidence-onb-01 rejects a thin or placeholder packet, and ONB-02's evidence plan depends on knowing what actually exists before scoping new evidence collection.",
    reads: ["product/onboarding/graph/ONB-00-resume-scope.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-00-resume-scope"],
    outputPaths: ["product/onboarding/graph/ONB-01-current-state-trace.md"],
    gates: ["check:onboarding-evidence-onb-01"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-02-evidence-plan",
    founderPhrasings: [
      "plan what evidence we need before redesigning onboarding",
      "decide how we'll gather onboarding research",
      "set the evidence bar for onboarding decisions",
    ],
    title: "Onboarding ONB-02: evidence plan",
    // Same production-verification rationale as ONB-00 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define the onboarding evidence hierarchy, access constraints, sample plan, and freshness cutoff",
    instructions:
      "Define the evidence hierarchy (rule, evidence, benchmark, observation, heuristic, hypothesis, or open question), the access constraints per source (e.g. authorized-only Onbo Hub access, no scraping), a sample plan per evidence node, and a freshness cutoff date beyond which a finding must be re-verified. Write the plan to product/onboarding/graph/ONB-02-evidence-plan.md so ONB-03 through ONB-08 collect against one shared standard instead of six competing ones; check:onboarding-evidence-onb-02 rejects a packet with no real plan.",
    reads: ["product/onboarding/graph/ONB-01-current-state-trace.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-01-current-state-trace"],
    outputPaths: ["product/onboarding/graph/ONB-02-evidence-plan.md"],
    gates: ["check:onboarding-evidence-onb-02"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-03-current-guidance",
    founderPhrasings: [
      "research current best practices for onboarding",
      "pull the latest benchmarks for signup flows",
      "see what platform guidance says about onboarding",
    ],
    title: "Onboarding ONB-03: current guidance research",
    // domain.experience, not domain.research: kernel/session/run.ts's production runner only ever
    // calls acceptVerification() from its deterministic-gate branch -- fresh_context (judgment)
    // acceptance has no production caller at all, only test fixtures, so a domain.research
    // reassignment with no gate would leave this node permanently blocked in a real run. A
    // deterministic gate (check:onboarding-evidence-onb-03) is the only path that actually
    // promotes the node to succeeded; it cannot judge truthfulness, only reject an empty,
    // stub-length, or still-templated packet. Keeping domain.experience also keeps this node
    // inside an experience-scoped session brief (scopeHints: ["domain.experience"]).
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Research current consumer onboarding evidence, platform guidance, benchmarks, and practitioner heuristics",
    instructions:
      "Research current consumer-onboarding evidence \u2014 platform guidance, published benchmarks, and practitioner heuristics \u2014 that bears on this product's onboarding decisions, each dated and sourced per ONB-02's evidence hierarchy and freshness cutoff. Write findings as Evidence Ledger rows in product/onboarding/graph/ONB-03-current-guidance.md; check:onboarding-evidence-onb-03 rejects a packet with no prose finding or a templated stub, and ONB-09 joins this evidence into explicit product decisions.",
    reads: ["product/onboarding/graph/ONB-02-evidence-plan.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-02-evidence-plan"],
    outputPaths: ["product/onboarding/graph/ONB-03-current-guidance.md"],
    gates: ["check:onboarding-evidence-onb-03"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-04-competitor-reviews",
    founderPhrasings: [
      "read what people complain about in competitor app reviews",
      "mine competitor reviews for onboarding complaints",
      "see what users hate about similar apps' signup",
    ],
    title: "Onboarding ONB-04: competitor review analysis",
    // Same production-verification rationale as ONB-03 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Mine direct and adjacent competitor reviews, including negative themes and a positive-review control",
    instructions:
      "Mine direct and adjacent competitors' reviews for negative onboarding themes, each backed by dates, versions, and sample size, and pair every theme with a positive-review control so the finding isn't cherry-picked. Record each as a Competitor Review Matrix row (root-cause class, disposition, test) in product/onboarding/graph/ONB-04-competitor-reviews.md \u2014 report frequency only within the sample, and do not let an onboarding fix paper over an underlying product defect; check:onboarding-evidence-onb-04 rejects a stub packet.",
    reads: ["product/onboarding/graph/ONB-02-evidence-plan.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-02-evidence-plan"],
    outputPaths: ["product/onboarding/graph/ONB-04-competitor-reviews.md"],
    gates: ["check:onboarding-evidence-onb-04"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-05-onbo-hub-atlas",
    founderPhrasings: [
      "map out competitor onboarding flows screen by screen",
      "build a reference atlas of how other apps onboard",
      "catalog how competing apps structure their signup",
    ],
    title: "Onboarding ONB-05: authorized flow atlas",
    // Same production-verification rationale as ONB-03 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Build an authorized Onbo Hub flow atlas without scraping, bypassing access controls, or inferring locked screens",
    instructions:
      "Build the authorized Onbo Hub flow atlas using only authorized access \u2014 do not scrape, bypass access controls, reuse credentials, or infer locked screens \u2014 recording screens, effort, first-value class, paywall placement, and review tension per flow, with an adopt/test/reject/investigate decision for each. Write the atlas to product/onboarding/graph/ONB-05-onbo-hub-atlas.md; check:onboarding-evidence-onb-05 rejects a stub or templated packet.",
    reads: ["product/onboarding/graph/ONB-02-evidence-plan.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-02-evidence-plan"],
    outputPaths: ["product/onboarding/graph/ONB-05-onbo-hub-atlas.md"],
    gates: ["check:onboarding-evidence-onb-05"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-06-internal-guidance-audit",
    founderPhrasings: [
      "check our own internal onboarding rules for conflicts",
      "audit our guidance docs before finalizing onboarding",
      "resolve conflicting onboarding rules we've written",
    ],
    title: "Onboarding ONB-06: internal guidance audit",
    // Same production-verification rationale as ONB-03 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Audit applicable B2C App Builder and internal B2C guidance and resolve conflicts or outdated rules",
    instructions:
      "Audit every applicable B2C App Builder and internal B2C guidance source against this product's onboarding decisions, recording each rule, its evidence class, and a pass/partial/fail/outdated/conflict/not-applicable verdict, and resolve any conflict or outdated rule explicitly rather than leaving it ambiguous. Write the audit to product/onboarding/graph/ONB-06-internal-guidance-audit.md; check:onboarding-evidence-onb-06 rejects a packet with no real prose findings.",
    reads: ["product/onboarding/graph/ONB-02-evidence-plan.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-02-evidence-plan"],
    outputPaths: ["product/onboarding/graph/ONB-06-internal-guidance-audit.md"],
    gates: ["check:onboarding-evidence-onb-06"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-07-provider-policy-landscape",
    founderPhrasings: [
      "refresh what RevenueCat and the app stores currently allow",
      "check current billing and platform policy before we design",
      "pull the latest provider capabilities before onboarding decisions",
    ],
    title: "Onboarding ONB-07: provider and policy landscape",
    // Same production-verification rationale as ONB-03 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Refresh monetization, identity, analytics, RevenueCat, billing, platform-policy, and regional capability facts",
    instructions:
      "Refresh the current RevenueCat/billing surface (SDKs, offerings, entitlements, paywalls, experiments, pending purchases, restore) and PostHog, App Store Connect, and Google Play capability and policy facts by region, recording a technically-possible/policy-permitted distinction, enrollment/disclosure/fee/reporting detail, and a revalidation date for each. Write the findings to product/onboarding/graph/ONB-07-provider-policy-landscape.md; check:onboarding-evidence-onb-07 rejects a stub packet, and stale provider facts here propagate directly into ONB-12's state contract and ONB-17's paywall contract.",
    reads: ["product/onboarding/graph/ONB-02-evidence-plan.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-02-evidence-plan"],
    providers: ["provider.revenuecat", "provider.posthog", "provider.app-store-connect", "provider.google-play"],
    outputPaths: ["product/onboarding/graph/ONB-07-provider-policy-landscape.md"],
    gates: ["check:onboarding-evidence-onb-07"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-08-motion-research",
    founderPhrasings: [
      "find motion references worth copying for onboarding",
      "research good interaction animations for signup",
      "translate reference motion into our onboarding",
    ],
    title: "Onboarding ONB-08: motion research",
    // Same production-verification rationale as ONB-03 above.
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Research interaction and motion for the selected surfaces and translate applicable references into the target framework",
    instructions:
      "Research interaction and motion for the surfaces actually selected. Resolve applicability from studio/seed/business.json `interaction` on each listed surface, implemented scroll-linked hooks under growth/landing, growth/funnel, or web when that landing is active, and growth/landing/surface-contract.json `scrollytelling.applicable` when that file exists; do not infer a technique from purpose prose or from packet sentences. Not selected, selected but unavailable, and not yet inspected stay different. A producer sentence that motion research is not applicable cannot override a selected or implemented rich-motion surface. static-document and conversion surfaces need semantic content, legibility, accessibility, and truthful claims \u2014 not invented scroll choreography or 60fps shot IDs. standard-transition native UI needs usable feedback, interruption, accessibility, and applicable performance, not a paid catalog. When interaction is bespoke-motion or scroll-linked, or landing source already implements scroll-linked hooks, and strategy/TOOL_DECISIONS.md records the 60fps MCP as ready, active, or connected without a fallback route, use search_shots, get_shot, get_motion_breakdown, and get_related_shots (motion code only when it clarifies) and record Motion Research rows (target/problem, reference shot ID, adopted principle, implementation/haptic/interruption behavior, reduced-motion behavior). When that technique is selected and the 60fps MCP is blocked or a fallback, hold with the current selection and authority \u2014 do not spend, and do not claim a distilled recipe is equivalent. When a listed surface omits `interaction`, hold. An empty studio inventory means 60fps is not selected. Translate adopted principles into this product's own behavior and target framework, not a copy of the reference. Write the packet to product/onboarding/graph/ONB-08-motion-research.md; check:onboarding-evidence-onb-08 rejects a stub packet and an applicability hold.",
    reads: ["product/onboarding/graph/ONB-02-evidence-plan.md", "product.yaml", "strategy/TOOL_DECISIONS.md"],
    consults: ["studio/seed/business.json", "DESIGN.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-02-evidence-plan"],
    outputPaths: ["product/onboarding/graph/ONB-08-motion-research.md"],
    gates: ["check:onboarding-evidence-onb-08"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-09-evidence-join",
    founderPhrasings: [
      "combine all the onboarding research into real decisions",
      "turn the research into explicit onboarding calls",
      "join up everything we learned into a decision set",
    ],
    title: "Onboarding ONB-09: evidence join",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Join guidance, reviews, flow evidence, internal doctrine, provider facts, policy, and motion research into explicit decisions",
    instructions:
      "Join the current guidance, competitor reviews, Onbo Hub atlas, internal guidance audit, provider/policy landscape, and motion research into explicit, evidence-and-complaint-traceable decisions (adopt/adapt/test/reject/investigate), each naming the affected screen, control, architecture, or product work, its analytics implication, its test, and remaining risk; also run the seven-principle activation audit against the joined evidence. Write the join to product/onboarding/graph/ONB-09-evidence-join.md. Write the research Foundation contract from reference.experience.onboarding-foundations, pinning applied knowledge, resolved observations, and the decisions each changes. check:onboarding-evidence-onb-09 rejects a stub packet, and ONB-10 through ONB-14 all branch from this decision set.",
    reads: [
      "product/onboarding/graph/ONB-03-current-guidance.md",
      "product/onboarding/graph/ONB-04-competitor-reviews.md",
      "product/onboarding/graph/ONB-05-onbo-hub-atlas.md",
      "product/onboarding/graph/ONB-06-internal-guidance-audit.md",
      "product/onboarding/graph/ONB-07-provider-policy-landscape.md",
      "product/onboarding/graph/ONB-08-motion-research.md",
    ],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: [
      "workflow.experience.onboarding-system.onb-03-current-guidance",
      "workflow.experience.onboarding-system.onb-04-competitor-reviews",
      "workflow.experience.onboarding-system.onb-05-onbo-hub-atlas",
      "workflow.experience.onboarding-system.onb-06-internal-guidance-audit",
      "workflow.experience.onboarding-system.onb-07-provider-policy-landscape",
      "workflow.experience.onboarding-system.onb-08-motion-research",
    ],
    outputPaths: ["product/onboarding/graph/ONB-09-evidence-join.md"],
    // Same production-verification rationale as ONB-03 above: with no gate, this node compiled to
    // verification "none", so an executor could return the declared ONB-09 artifact ID and
    // fingerprint without producing a substantive evidence-to-decision join, and reconcilePatch()
    // would still mark it succeeded immediately -- unblocking ONB-10 through ONB-14 and eventually
    // the destructive ONB-22 cutover even though ONB-22's own gate never inspects
    // ONB-09-evidence-join.md. The foundations gate now also validates that join.
    gates: ["check:onboarding-evidence-onb-09", "check:onboarding-foundations-research"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-10-first-value-activation",
    founderPhrasings: [
      "define what counts as the user's first real win",
      "decide what activation actually means for this app",
      "figure out when a user has really gotten value",
    ],
    title: "Onboarding ONB-10: first value and activation",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define first value rendered, first value engaged, activation, habit, and retention hypotheses",
    instructions:
      "Separately define first value rendered (the real, personalized result the user sees), first value engaged (the meaningful action they take on it), activation (the retention hypothesis and its derived condition), habit signal, monetization, review eligibility, and onboarding completion \u2014 first value must be real, actionable, persistent, recoverable, and visible inside the populated normal product experience, not a canned demo. Write the milestones to product/onboarding/graph/ONB-10-first-value-activation.md; check:onboarding-evidence-onb-10 rejects a stub packet, and ONB-15's architecture decision depends on these being real, distinct milestones.",
    reads: ["product/onboarding/graph/ONB-09-evidence-join.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-09-evidence-join"],
    outputPaths: ["product/onboarding/graph/ONB-10-first-value-activation.md"],
    // Same production-verification rationale as ONB-03/ONB-09/ONB-17 above: with no gate, this
    // node compiled to verification "none", so an executor could return the declared artifact ID
    // and fingerprint without ever writing substantive first-value, activation, habit, or
    // retention hypotheses -- and neither ONB-15 (architecture decision, which depends on this
    // node) nor the final graph gate ever reads ONB-10-first-value-activation.md, letting the
    // downstream decision chain and the destructive ONB-22 cutover proceed on a node that never
    // actually produced its claimed content.
    gates: ["check:onboarding-evidence-onb-10"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-11-effort-question-audit",
    founderPhrasings: [
      "cut unnecessary friction and questions from onboarding",
      "audit which onboarding questions we actually need",
      "remove effort from onboarding before value is shown",
    ],
    title: "Onboarding ONB-11: effort and question audit",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Audit effort before value, question usefulness, permissions, interruption budget, and visible personalization proof",
    instructions:
      "Audit every step for effort placed before value is shown (class each passive/low/moderate/high/sensitive/permission/account/financial, and decide keep/defer/infer/delete) and every question for whether it is required, changes downstream logic, and produces visible personalization proof the user actually sees \u2014 including the total interruption budget across the flow. Write the audit to product/onboarding/graph/ONB-11-effort-question-audit.md; check:onboarding-evidence-onb-11 rejects a stub packet.",
    reads: ["product/onboarding/graph/ONB-09-evidence-join.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-09-evidence-join"],
    outputPaths: ["product/onboarding/graph/ONB-11-effort-question-audit.md"],
    // Same production-verification rationale as ONB-10 above.
    gates: ["check:onboarding-evidence-onb-11"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-12-state-identity-contract",
    founderPhrasings: [
      "define how user identity and state persist across onboarding",
      "map the state machine behind onboarding and entitlements",
      "settle the identity and continuity model for onboarding",
    ],
    title: "Onboarding ONB-12: state and identity contract",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define canonical journey, profile, identity, entitlement, continuity, and cross-surface state transitions",
    instructions:
      "Define the canonical state model keeping identity, onboarding journey, profile completeness, activation, entitlement, experiment assignment/exposure, review eligibility, permission/consent, and lifecycle state as distinct machines, each with its authoritative owner, persistence/event contract, and idempotency/retry/recovery behavior \u2014 grounded in the current RevenueCat entitlement and identity model from ONB-07. Write the contract to product/onboarding/graph/ONB-12-state-identity-contract.md. Write its Foundation contract with explicit auth timing, verified-session rules, anonymous continuity, secure credential storage, account isolation, logout, deletion, and restore. Auth success never grants an entitlement. check:onboarding-evidence-onb-12 rejects a stub packet.",
    reads: ["product/onboarding/graph/ONB-09-evidence-join.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-09-evidence-join"],
    providers: ["provider.revenuecat"],
    outputPaths: ["product/onboarding/graph/ONB-12-state-identity-contract.md"],
    // Same production-verification rationale as ONB-10 above.
    gates: ["check:onboarding-evidence-onb-12", "check:onboarding-foundations-identity"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-13-analytics-experiments",
    founderPhrasings: [
      "define the analytics events onboarding needs to fire",
      "set up experiment tracking for the signup flow",
      "name every event onboarding should emit",
    ],
    title: "Onboarding ONB-13: analytics and experiments",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define typed analytics, authoritative emitters, identity stitching, deduplication, experiment assignment, exposure, and expected sequences",
    instructions:
      "Define a machine-readable, typed analytics schema \u2014 every event carrying event_id, version, time, source, platform, journey, identity, session, correlation, acquisition, consent, and deduplication semantics \u2014 naming the authoritative emitter (client, backend-confirmed, or provider-confirmed) per event, plus experiment assignment, exposure, and expected event sequences for the happy path and each major failure/edge case. Write the contract to product/onboarding/graph/ONB-13-analytics-experiments.md. Write the measurement Foundation contract: consent-aware initialization before the first event, typed event/schema and implementation/test paths, first/last-touch attribution, deep links and unknown joins, identity stitching, deduplication, exposure rules and negative scenarios. check:onboarding-evidence-onb-13 rejects a stub packet, and analytics failure must never block first value.",
    reads: [
      "product/onboarding/graph/ONB-09-evidence-join.md",
      "product/onboarding/graph/ONB-10-first-value-activation.md",
      "product/onboarding/graph/ONB-12-state-identity-contract.md",
      "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md",
      "analytics/ANALYTICS.md",
    ],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: [
      "workflow.experience.onboarding-system.onb-09-evidence-join",
      "workflow.experience.onboarding-system.onb-10-first-value-activation",
      "workflow.experience.onboarding-system.onb-12-state-identity-contract",
      "workflow.experience.onboarding-system.onb-14-trust-lifecycle-policy",
      "workflow.data.analytics-and-attribution-blueprint",
    ],
    providers: ["provider.posthog", "provider.revenuecat"],
    outputPaths: ["product/onboarding/graph/ONB-13-analytics-experiments.md"],
    // Same production-verification rationale as ONB-10 above.
    gates: ["check:onboarding-evidence-onb-13", "check:onboarding-foundations-measurement"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-14-trust-lifecycle-policy",
    founderPhrasings: [
      "decide when to ask for the app store review",
      "define permission timing and lifecycle behavior for onboarding",
      "settle the policy rules onboarding has to follow",
    ],
    title: "Onboarding ONB-14: trust, lifecycle, and policy",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define review timing, permissions, lifecycle, privacy, security, accessibility, and policy behavior",
    instructions:
      "Define native-only review-request timing (eligibility may be earned early, but the request happens outside first-run onboarding, ungated by sentiment, with a remote kill switch), the permission-request and lifecycle orchestration strategy (request only after a user action with visible benefit; one strategy spanning onboarding recovery through win-back), and the privacy/security/accessibility policy behavior this flow must honor. Write the contract to product/onboarding/graph/ONB-14-trust-lifecycle-policy.md; check:onboarding-evidence-onb-14 rejects a stub packet.",
    reads: ["product/onboarding/graph/ONB-09-evidence-join.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.onboarding-system.onb-09-evidence-join"],
    outputPaths: ["product/onboarding/graph/ONB-14-trust-lifecycle-policy.md"],
    // Same production-verification rationale as ONB-10 above.
    gates: ["check:onboarding-evidence-onb-14"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-15-architecture-decision",
    founderPhrasings: [
      "decide native versus web for how onboarding is built",
      "pick the architecture onboarding will run on",
      "choose between native, hosted, and hybrid onboarding",
    ],
    title: "Onboarding ONB-15: architecture decision",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Compare native-first, hosted-funnel-first, hybrid, web-first, and evidence-backed alternatives and select one target architecture",
    instructions:
      "Compare native-first, hosted-funnel-first, hybrid, web-first, and any other evidence-backed architecture against first value, conversion/retention, identity/analytics, policy/economics, and operations, using the first-value, effort, state, analytics, and trust decisions from ONB-10 through ONB-14, then select exactly one target architecture with a stated reason. Write the decision to product/onboarding/graph/ONB-15-architecture-decision.md; check:onboarding-evidence-onb-15 rejects a stub packet, and every node from ONB-16 onward builds on this one selected model.",
    reads: [
      "product/onboarding/graph/ONB-10-first-value-activation.md",
      "product/onboarding/graph/ONB-11-effort-question-audit.md",
      "product/onboarding/graph/ONB-12-state-identity-contract.md",
      "product/onboarding/graph/ONB-13-analytics-experiments.md",
      "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md",
    ],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.1c", "phase.2"],
    dependencies: [
      "workflow.experience.onboarding-system.onb-10-first-value-activation",
      "workflow.experience.onboarding-system.onb-11-effort-question-audit",
      "workflow.experience.onboarding-system.onb-12-state-identity-contract",
      "workflow.experience.onboarding-system.onb-13-analytics-experiments",
      "workflow.experience.onboarding-system.onb-14-trust-lifecycle-policy",
    ],
    outputPaths: ["product/onboarding/graph/ONB-15-architecture-decision.md"],
    // Same production-verification rationale as ONB-10 above -- this node is the fan-in point
    // for ONB-10..14, so an unverified ONB-15 could also mask any of those five having been
    // accepted vacuously (each already has its own gate, but this one did not have its own).
    gates: ["check:onboarding-evidence-onb-15"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-16-journey-graph",
    founderPhrasings: [
      "map out onboarding as one connected journey graph",
      "draw the full signup journey end to end",
      "converge every acquisition path into one onboarding map",
    ],
    title: "Onboarding ONB-16: canonical journey graph",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define acquisition-specific journeys that converge on one semantic onboarding state graph",
    instructions:
      "Draw the acquisition-specific journeys and converge them into one semantic onboarding state graph, marking each step's entry condition, owner/renderer, input/transition, canonical event, back/skip/close/resume behavior, and failure/next-step path \u2014 and mark where the acquisition promise, first effort, first value, engagement, account creation, paywall, purchase, activation, review eligibility, normal-product entry, and interruption budget each land on the graph. Resolve applicability from accepted product.yaml feature scopes and declared b2c.yaml monetization bindings when present: not selected, selected but unavailable, and unresolved stay different. Record first value, navigation/recovery, identity, accessibility, and the monetization boundary actually selected. When feature.commitment-funnel is required, record the Commitment Funnel in first-session order (welcome, quiz or goals, micro-commitment with a skip path, personalized insight, hard paywall) and Funnel Quality Metrics; when that feature is excluded or a non-goal, do not add a quiz or hard paywall to satisfy a gate; when the instance is absent, hold rather than treating the funnel as free or as selected. Keep that funnel in its recipe and reference.experience.commitment-funnel; do not silently select RevenueCat. Write the graph to product/onboarding/graph/ONB-16-journey-graph.md; check:onboarding-evidence-onb-16 rejects a stub packet.",
    reads: ["product/onboarding/graph/ONB-15-architecture-decision.md", "product.yaml", "b2c.yaml", "b2c.json"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.experience.onboarding-system.onb-15-architecture-decision"],
    outputPaths: ["product/onboarding/graph/ONB-16-journey-graph.md"],
    // Same production-verification rationale as ONB-10 above -- ONB-17, ONB-18, ONB-19, and
    // ONB-20's own gate all depend on this node without ever reading its file directly.
    gates: ["check:onboarding-evidence-onb-16"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract",
    founderPhrasings: [
      "spec every onboarding screen and its paywall behavior",
      "define every control and copy key on each signup screen",
      "write the exact contract for each onboarding screen",
    ],
    title: "Onboarding ONB-17: screen, control, and paywall contract",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Specify every onboarding screen, copy key, control, action, paywall state, failure, recovery, accessibility, and localization behavior",
    instructions:
      "Specify every onboarding screen with a stable ID and exactly one dominant action, pulling on-screen copy by key from product/copy/COPY_DECK.md rather than inventing strings, and define every control's enable/validation rule, state mutation, and exact idempotent provider action, plus failure/recovery and accessibility/localization behavior per screen. Resolve applicability from accepted product.yaml feature scopes and declared b2c.yaml monetization bindings when present; a producer sentence that a bind is not applicable cannot override a required feature. Specify the paywall contract for the selected purchase and presentation owners, including restore, pending, expiry, cancellation, offline, truthful-offer, and entitlement behavior those owners declare \u2014 do not invent RevenueCat offerings or customVariables for an unselected presenter. When feature.paywall-goal-headline is required and the presenter can bind it, record the Paywall Goal Headline contract: quiz writes paywall_headline_key, templates live in RevenueCat offering metadata, customVariables bind the selected key, and a skipped goal uses the fallback template with no invented outcome; when that feature is excluded or a non-goal, omit that bind; when the instance is absent, hold. Write the contract to product/onboarding/graph/ONB-17-screen-control-paywall-contract.md; check:onboarding-evidence-onb-17 rejects a stub packet, and ONB-20's adversarial QA runs directly against this contract.",
    reads: ["product/onboarding/graph/ONB-16-journey-graph.md", "product/copy/COPY_DECK.md", "product.yaml", "b2c.yaml", "b2c.json"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.experience.onboarding-system.onb-16-journey-graph"],
    outputPaths: ["product/onboarding/graph/ONB-17-screen-control-paywall-contract.md"],
    // Same production-verification rationale as ONB-19/ONB-20/ONB-21 above: with no gate, this
    // node compiled to verification "none", so an executor could return the declared artifact ID
    // and fingerprint without ever writing a substantive screen, control, or paywall contract --
    // and ONB-20's own gate (which inspects only its own packet) and the final graph gate (which
    // never reads ONB-17-screen-control-paywall-contract.md) would both miss it, letting ONB-20's
    // adversarial QA run against a contract that does not actually exist.
    gates: ["check:onboarding-evidence-onb-17"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-18-visual-design-prototype",
    founderPhrasings: [
      "build the actual high-fidelity onboarding design",
      "turn the onboarding plan into a real interactive prototype",
      "get onboarding into visual design and QA",
    ],
    title: "Onboarding ONB-18: visual design and prototype",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Produce actual high-fidelity onboarding design, motion, an interactive prototype, and design QA",
    instructions:
      "Author the high-fidelity onboarding design in DESIGN.md \u2014 Git owns revisions \u2014 then render the generated read-only Design Room for review; the Design Room is not a mutable design store or a second design authority. Produce an interactive prototype covering the happy path and critical branches on the shipping platforms recorded in studio/seed/business.json mobileApp.platforms and DESIGN.md accepted surfaces, plus small viewports, large text, and reduced motion on those selected surfaces, and run design QA against it. Do not fabricate captures for an unselected platform; a selected platform without a supported adapter is an explicit unsupported or missing-implementation hold, not assumed parity from a shared component contract; the host recipe target, including host/agent-cli, is not the consumer app's shipping scope. After DESIGN.md changes, regenerate the review page and renew affected proof \u2014 old screenshots do not certify new code. Record the design proof \u2014 with the inspectable artifact path, not just adjectives \u2014 in product/onboarding/graph/ONB-18-visual-design-prototype.md. Map each ONB-09 decision to rendered design evidence in the Foundation contract. Instrument the prototype now, not after implementation: capture fresh install, consent denial, unknown attribution and analytics-unavailable traces in product/onboarding/prototype-evidence.json; a static mockup or event-name list is insufficient. check:onboarding-evidence-onb-18 rejects a stub packet, and ONB-20's adversarial QA depends on this prototype actually existing.",
    reads: [
      "product/onboarding/graph/ONB-16-journey-graph.md",
      "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
      "product/onboarding/graph/ONB-12-state-identity-contract.md",
      "product/onboarding/graph/ONB-13-analytics-experiments.md",
      "DESIGN.md",
      "studio/seed/business.json",
    ],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.2"],
    // Depends on (not merely narrates) the workflow that authors DESIGN.md, structured
    // studio routes, and the generated read-only review page -- without this, the engine
    // could accept ONB-18 and unblock ONB-20 on this node's own Markdown packet alone, with
    // no real high-fidelity design or interactive prototype behind it.
    dependencies: [
      "workflow.experience.onboarding-system.onb-16-journey-graph",
      "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract",
      "workflow.design.design-room",
    ],
    outputPaths: ["product/onboarding/graph/ONB-18-visual-design-prototype.md", "product/onboarding/prototype-evidence.json"],
    // The Design Room dependency above proves the generic design workflow authored DESIGN.md
    // and rendered the review page; it does not prove THIS node's own
    // ONB-18-visual-design-prototype.md packet is substantive. Same production-verification
    // rationale as ONB-10 above: with no gate on its own output, an executor could return the
    // declared artifact ID and fingerprint with an empty or stub packet, and neither ONB-20's
    // own gate nor the final graph gate reads this file, letting ONB-20's adversarial QA
    // proceed against a prototype packet that was never actually written.
    gates: ["check:onboarding-evidence-onb-18", "check:onboarding-foundations-prototype"],
    actionClass: "mutate",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-19-implementation-cutover-contract",
    founderPhrasings: [
      "define the implementation tasks needed to ship onboarding",
      "plan the technical cutover for the new onboarding",
      "spec reliability and migration behavior for onboarding",
    ],
    title: "Onboarding ONB-19: implementation and cutover contract",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Define implementation units, reliability, performance, observability, privacy, migration, hard cutover, and deletion work",
    instructions:
      "Define the implementation task list plus reliability behavior (pending purchases, restore, entitlement delay, network, generation, analytics-non-blocking, deep link, identity, unsupported-client), performance/observability budgets (P50/P95 and failure budgets for startup, first value, provider init, paywall, checkout, entitlement, handoff), and the hard-cutover Removal Inventory for anything the new graph replaces (replaced code, data, config, provider setup, dashboards, tests, docs, secrets, transformation tooling), each with a disposition and a verification method. Write the contract to product/onboarding/graph/ONB-19-implementation-cutover-contract.md; check:onboarding-evidence-onb-19 rejects a stub packet, and this is the plan ONB-22 later executes and the manifest ONB-22's cutover proves against the real repository.",
    reads: [
      "product/onboarding/graph/ONB-16-journey-graph.md",
      "product/onboarding/graph/ONB-12-state-identity-contract.md",
      "product/onboarding/graph/ONB-13-analytics-experiments.md",
      "product/onboarding/prototype-evidence.json",
    ],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.2", "phase.5b"],
    dependencies: ["workflow.experience.onboarding-system.onb-16-journey-graph", "workflow.experience.onboarding-system.onb-18-visual-design-prototype"],
    outputPaths: ["product/onboarding/graph/ONB-19-implementation-cutover-contract.md"],
    // Same production-verification rationale as ONB-03/ONB-09/ONB-20/ONB-21 above: with no gate,
    // this node compiled to verification "none", so an executor could return the declared
    // artifact ID and fingerprint without ever writing a substantive implementation, migration,
    // reliability, or deletion plan -- and neither ONB-20's own gate (which inspects only its own
    // packet) nor the final graph gate (which never reads ONB-19-implementation-cutover-contract.md)
    // would catch it, letting the destructive ONB-22 cutover proceed with no real cutover plan.
    gates: ["check:onboarding-evidence-onb-19"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-20-adversarial-qa",
    founderPhrasings: [
      "stress test onboarding against worst-case scenarios",
      "run a pre-mortem before onboarding ships",
      "find the ways onboarding could fail before launch",
    ],
    title: "Onboarding ONB-20: adversarial QA",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Run the synthetic one-star pre-mortem, policy review, instrumentation QA, accessibility review, and provider-realism review",
    instructions:
      "Run the synthetic one-star pre-mortem (privacy, permission, poor result, slow network, trial, subscriber, restore, web purchase, accessibility, identity, or subscription-aversion scenarios, each with root cause, likelihood/severity, mitigation, test, and remaining risk) plus a policy review, instrumentation QA, accessibility review, and provider-realism review against the actual ONB-17 contract, ONB-18 prototype, and ONB-19 cutover plan \u2014 assume the flow fails before crediting that it works. Use a fresh reviewer session, inspect the prototype event traces and source hashes, and reject missing first-session instrumentation or untested identity/consent boundaries. Write findings to product/onboarding/graph/ONB-20-adversarial-qa.md; check:onboarding-evidence-onb-20 rejects a stub packet, and an unresolved high-severity finding must not be waved through to ONB-21's implementation plan.",
    reads: [
      "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
      "product/onboarding/graph/ONB-18-visual-design-prototype.md",
      "product/onboarding/graph/ONB-19-implementation-cutover-contract.md",
    ],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.2", "phase.5b"],
    dependencies: [
      "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract",
      "workflow.experience.onboarding-system.onb-18-visual-design-prototype",
      "workflow.experience.onboarding-system.onb-19-implementation-cutover-contract",
    ],
    reviewOf: [
      "workflow.experience.onboarding-system.onb-17-screen-control-paywall-contract",
      "workflow.experience.onboarding-system.onb-18-visual-design-prototype",
      "workflow.experience.onboarding-system.onb-19-implementation-cutover-contract",
    ],
    outputPaths: ["product/onboarding/graph/ONB-20-adversarial-qa.md"],
    // Same production-verification rationale as ONB-03 above: with no gate, this node compiled
    // to verification "none", so an empty ONB-20-adversarial-qa.md could unlock ONB-21 and the
    // destructive ONB-22 cutover with no policy, instrumentation, accessibility, or provider QA
    // behind it at all.
    gates: ["check:onboarding-evidence-onb-20"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.onboarding-system.onb-21-compound-engineering-plan",
    founderPhrasings: [
      "turn the accepted onboarding design into an engineering plan",
      "break the onboarding rebuild into real implementation tasks",
      "translate onboarding decisions into a build plan",
    ],
    title: "Onboarding ONB-21: Compound Engineering plan",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: "Translate the accepted onboarding graph into an implementation-ready Compound Engineering plan, or the B2C App Builder-equivalent fallback",
    instructions:
      "Translate the accepted onboarding graph and its adversarial-QA findings into an implementation-ready Compound Engineering plan (ce-plan when available, or this skill's equivalent), breaking work into tasks each with an outcome, exact paths, dependencies/contracts, required analytics/provider work, tests, removal work, and acceptance criteria. Write the plan as ONB-TASK rows in product/onboarding/graph/ONB-21-compound-engineering-plan.md; check:onboarding-evidence-onb-21 rejects a stub packet, and ONB-22 executes exactly this task list rather than improvising new scope.",
    reads: ["product/onboarding/graph/ONB-20-adversarial-qa.md"],
    roleId: "role.product-leader",
    laneIds: ["onboarding"],
    phaseIds: ["phase.5b"],
    dependencies: ["workflow.experience.onboarding-system.onb-20-adversarial-qa"],
    outputPaths: ["product/onboarding/graph/ONB-21-compound-engineering-plan.md"],
    // Same production-verification rationale as ONB-03 above: with no gate, this node compiled
    // to verification "none", so an executor could return the declared artifact ID and fingerprint
    // without ever writing a substantive implementation plan, and reconcilePatch() would still mark
    // it succeeded immediately -- unblocking ONB-22's destructive cutover even though ONB-22's own
    // gate reads only ONBOARDING.md, never ONB-21-compound-engineering-plan.md.
    gates: ["check:onboarding-evidence-onb-21"],
    actionClass: "draft",
    idempotent: true,
  }),
  // groupId is stamped here rather than threaded through helpers.ts's WorkflowSeed (R10, KTD7):
  // every entry above is an onboarding-system node, so one map assigns the authored group to all
  // 22 without editing the shared seed contract other workflow files also depend on.
].map((wf) => ({ ...wf, groupId: "onboarding-system" as const }));

export const workflows = [
  workflow({
    id: "workflow.product.app-archetype-detection-and-starter",
    founderPhrasings: [
      "this idea matches an app pattern we already have a starter for",
      "match this concept to a known app shape instead of starting cold",
      "reuse a proven starter instead of building from zero",
    ],
    title: "App-archetype detection & starter",
    domainId: "domain.product",
    areaIds: ["area.product-experience"],
    trigger: "Request matches a known product shape (social / AI-chat / habit / photo-AI)",
    instructions:
      "Compare the accepted product shape with the four shipped archetypes: habit tracker, photo or AI media, social network, and AI chat companion. When one is the product's center of gravity, copy its starter into the app instead of rebuilding the same wiring. Use an opening mandate that delegates stack and implementation choices. Ask the founder only when the match is ambiguous and that choice was not delegated. The copied starter and its README are the durable selection record. Do not rewrite PRODUCT.md or raw runtime state here. Run check:app-archetype and check:archetype-starter. If the product only contains a similar feature, use the general core-loop and complete-product method instead of forcing a pack.",
    reads: ["PRODUCT.md", "state/business-state.json"],
    // The mobile role receives the four archetypes as conditional routes and must load only
    // the founder-confirmed match; they are not four mandatory, mutually contradictory reads.
    roleId: "role.mobile-engineer",
    laneIds: ["product"],
    dependencies: ["workflow.research.research-backed-spec"],
    gates: ["check:app-archetype", "check:archetype-starter"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.research.research-backed-spec",
    founderPhrasings: [
      "is this idea even worth pursuing",
      "pick a business idea for me and just run with it",
      "research the market before we commit to building",
    ],
    title: "Consumer app opportunity and product research",
    domainId: "domain.research",
    areaIds: ["area.product-experience"],
    trigger:
      "New consumer app or idea; validate, define, design, or build an app; choose an opportunity and build end-to-end without involvement when the user has no idea and delegates product selection; or gather category economics, competitor, review, keyword, or name-collision evidence. Founder phrasing: is this idea worth building, or a waste of months.",
    instructions:
      "When no idea exists, compare three safe, feasible consumer-app opportunities before committing an app identity or build. Judge economics, recurring pain, reachable distribution, transformation clarity, complete-product feasibility, and sensitivity risk. If the opening request delegates product selection, choose the strongest candidate that clears the evidence bar and record `Founder opening mandate` as the decision authority. Otherwise, recommend one candidate for Go, Pivot, or Kill. Return no candidate instead of forcing a weak idea. Before a paid research request, use research-lookup with its provider/version, connection, operation and non-secret arguments under an explicit freshness limit. Reuse saved current results. In a registered planning workspace, checkpoint pending through research-record before dispatch, then checkpoint the actual observed, failed or uncertain result immediately; read back uncertain requests before replay. Use AppKittie, XPOZ, and Firecrawl from the bound research-intelligence recipe when those names appear; if intake deferred them, continue the evidence lane as labeled fallback rather than parking it. Use the bound research references to write dated source evidence, category economics, demand, wedge, distribution, offer response, transformation demo, paying niche, signal provenance, conflicts, and the decision into strategy/RESEARCH.md, strategy/SIGNAL_CORPUS.md, and strategy/OFFER_TEST.md. Use the default category bar only when the work has not set a better one: top-ten gross of at least $5M per year with two apps above $1M each. Author accepted product facts in product.yaml, then render PRODUCT.md. Do not hand-edit PRODUCT.md. Before the product is accepted, define its core loop, Complete product scope, moat path, and beat moment. Run check:research-workflow-output. Do not harden a direction that fails it.",
    reads: ["product.yaml"],
    roleId: "role.research-strategist",
    laneIds: ["research"],
    phaseIds: ["phase.1"],
    outputPaths: ["strategy/RESEARCH.md", "strategy/SIGNAL_CORPUS.md", "strategy/OFFER_TEST.md", "product.yaml", "PRODUCT.md"],
    dependencies: ["workflow.operations.live-app-store-portfolio", "workflow.operations.paid-tool-routing-and-fallback"],
    gates: ["check:research-workflow-output"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.research.spec-red-team-audit",
    founderPhrasings: [
      "poke holes in the research before I commit",
      "have someone who didn't write the spec try to kill it",
      "what would make this idea fail before we spend on design",
    ],
    title: "Spec red team (isolated audit)",
    domainId: "domain.research",
    areaIds: ["area.product-experience"],
    trigger: "After research-backed-spec produces a kept spec and before the founder records Go, Pivot, or Kill; again when the spec changes materially",
    instructions:
      "Audit strategy/RESEARCH.md, strategy/SIGNAL_CORPUS.md, strategy/OFFER_TEST.md, product.yaml, and PRODUCT.md in a fresh context that never saw the producer's transcript. Score each artifact against check:research-workflow-output and the research questions the spec must answer (category revenue bar, distribution, paying niche and named channel, transformation demo, moat, one core loop, one north-star metric, first-value surface), then record a keep, refresh, or redo verdict per artifact with a dated reason. Run the red team through the routed pm skills: list the assumptions the spec rests on, rank the kill assumptions, run the pre-mortem, and name the cheapest test for each kill assumption. Write findings only, with severity per finding, into strategy/RED_TEAM_FINDINGS.md. Do not edit the spec. The founder records Go, Pivot, or Kill after reading the findings; Kill or Pivot is a success outcome. An unresolved high-severity finding blocks 11-star and downstream product work.",
    reads: ["strategy/RESEARCH.md", "strategy/SIGNAL_CORPUS.md", "strategy/OFFER_TEST.md", "product.yaml", "PRODUCT.md"],
    roleId: "role.research-strategist",
    laneIds: ["research"],
    phaseIds: ["phase.1"],
    dependencies: ["workflow.research.research-backed-spec"],
    reviewOf: ["workflow.research.research-backed-spec"],
    outputPaths: ["strategy/RED_TEAM_FINDINGS.md"],
    // No founderOnlyActions: approvals gate a node's own dispatch, and the Go/Pivot/Kill decision
    // follows this audit rather than preceding it. The decision stays where the catalog records it
    // today (reference.research.go-pivot-or-kill); the audit's findings are its input.
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.research.localization-market-research",
    founderPhrasings: [
      "should we translate this for other countries yet",
      "figure out which languages are worth supporting first",
      "is it worth going international right now",
    ],
    title: "Localization market research",
    domainId: "domain.research",
    areaIds: ["area.product-experience"],
    trigger: "Before localizing any surface or choosing locales",
    instructions:
      "Research search-demand evidence per market (AppKittie keyword popularity/difficulty and download/revenue estimates by country, App Store Connect/Play Console territory data when the app is live, XPOZ in-language social vocabulary) before recommending any locale — localization is a market-selection decision made from evidence, not a translate-everything-to-be-safe pass. Produce strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md (and its .html) with ranked priority tiers per market, naming which tool produced each cell and whether the data is a first-party or estimated basis. Record Seasonal Windows with a submit-by date 14 or more days before any dated peak, and record PPP / Territory Pricing before storefront price lock. A market that does not clear the popularity/competition/opportunity bar gets deferred, not localized on the strength of language alone. check:localization-research fails a same-day keyword or localization launch into a known peak.",
    reads: ["state/business-state.json"],
    roleId: "role.research-strategist",
    laneIds: ["research"],
    phaseIds: ["phase.1"],
    dependencies: ["workflow.research.research-backed-spec"],
    outputPaths: ["strategy/localization-market-research/LOCALIZATION_MARKET_RESEARCH.md"],
    providers: ["provider.aso-skills"],
    gates: ["check:localization-research"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.11-star-experience",
    founderPhrasings: [
      "what would the most amazing version of this feel like",
      "push this experience further before we lock it in",
      "imagine the dream version of this feature",
    ],
    title: "11-star experience",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: '"11-star run" / before PRODUCT.md, onboarding, ads, store creative, or engineering plans harden',
    instructions:
      "Run the 11-Star Run Protocol: for the product's core promise, name what would happen at 1★ (failure), 2★ (friction), 5★ (expected/works-but-forgettable), and the absurd 9-11★ concierge version, then work backward to the feasible 6-7★ slice that still carries the magic and is buildable in the accepted product. Write the ladder into 11_STAR_EXPERIENCE.md and its visual storyboard into 11-star-experience.html, and trace the promise through product/design/engineering/analytics/revenue/store/content in state/LAUNCH_TRACE.md so downstream nodes inherit the same target instead of re-deciding it. The decision that matters most is the accepted scope boundary — which normal product, design, onboarding, and paywall calls change because of the chosen slice — not the impressive 11★ idea itself, which stays inspiration.",
    reads: ["PRODUCT.md"],
    roleId: "role.product-leader",
    laneIds: ["experience"],
    phaseIds: ["phase.1c"],
    // The red team sits between the kept spec and every product, design, or build node that
    // spends on it: no 11-star slice hardens until a fresh context has tried to kill the spec.
    dependencies: ["workflow.research.research-backed-spec", "workflow.research.spec-red-team-audit"],
    outputPaths: ["product/experience/11-star-experience/11_STAR_EXPERIENCE.md", "product/experience/11-star-experience/11-star-experience.html"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.emotional-experience-design-producer",
    founderPhrasings: [
      "make this feature something people get attached to",
      "build in a reward loop that keeps people coming back",
      "add the psychological hooks that build a habit",
    ],
    title: "Emotional experience design (producer)",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: 'Feature whose 11-star target is 6★+ / "charge this with emotion", "build a habit"',
    instructions:
      "Evaluate the Experience Cards against the actual product moment and record selected or not-applicable with a reason. No card is universally required. Implement each selected card with its applicable truthfulness, user-control, accessibility, and exit guardrails and evidence in engineering/PRODUCTION_READINESS.md. Never invent delay, randomness, or a commitment step merely to satisfy a card. Claims about emotional or conversion effects require observed evidence. Select additional cards from experience-cards.md only when the product moment fits; give every emotional moment a named PostHog event per emotional-experience-measurement.md before build, not invented ad hoc. Apply the three-question bright-line test from ethics-guardrail.md (goal alignment, truthfulness, informed exit) to each card before it ships — any NO answer means redesign, not a documented exception — and check:emotional-design enforces the resulting attestation fields in EMOTIONAL_DESIGN.md.",
    reads: ["product/experience/11-star-experience/11_STAR_EXPERIENCE.md", "analytics/ANALYTICS.md"],
    roleId: "role.product-leader",
    laneIds: ["emotional_design"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.11-star-experience", "workflow.data.analytics-and-attribution-blueprint"],
    outputPaths: ["product/experience/emotional-design/EMOTIONAL_DESIGN.md"],
    gates: ["check:emotional-design"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.experience.emotional-design-audit-auditor",
    founderPhrasings: [
      "check whether the emotional design actually holds up",
      "audit the reward and habit mechanics we built",
      "grade this feature's emotional design against the spec",
    ],
    title: "Emotional design audit (auditor)",
    domainId: "domain.experience",
    areaIds: ["area.product-experience"],
    trigger: '"Audit this app\'s emotional design" / "emotional UX audit"',
    instructions:
      "Audit EMOTIONAL_DESIGN.md against every card the app actually implements — for each, verify the specific bright-line/dark-line test from that card's own file (experience-cards/<name>-card.md) and verify the selection rationale against the actual product moment, not just that a card is named. When no card is selected, independently review the visible, explicit not-applicable decision and alternative; do not invent four required mechanisms. HIGH-risk cards (Variable Reward, Streak & Loss Aversion) get the strictest read: confirm the escape hatch, counter-metric, and non-empty fallback are real, not aspirational language. Write findings as EMOTIONAL_AUDIT.md's Audit Output Contract, and any dark-pattern violation or missing per-card attestation field becomes a failure card per failure-cards.md rather than a note to fix later — check:emotional-design enforces the attestation fields this audit must produce.",
    reads: ["product/experience/emotional-design/EMOTIONAL_DESIGN.md"],
    roleId: "role.security-architect",
    laneIds: ["emotional_design"],
    phaseIds: ["phase.1c"],
    dependencies: ["workflow.experience.emotional-experience-design-producer"],
    outputPaths: ["product/experience/emotional-design/EMOTIONAL_AUDIT.md"],
    gates: ["check:emotional-design"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.design.brand-definition",
    founderPhrasings: [
      "settle our company identity before design starts",
      "define our voice before anyone writes copy",
      "figure out our brand identity before design starts",
    ],
    title: "Brand definition",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger: "Crossing research into design: before the Design Room locks visual identity, and before any marketing or store copy claims a brand voice",
    instructions:
      "Write `strategy/BRAND.md` as the voice and identity contract every downstream copy and design surface answers to: name, one-line promise, the audience it speaks to (from `strategy/RESEARCH.md`'s evidence, not aspiration), voice register with three do/don't example pairs, vocabulary the brand owns and words it never uses, and the visual-identity intent the Design Room turns into tokens. Derive it from the research and the 11-star experience bar — a brand document that could describe any app in the category is template residue, not a brand. This file is the standard `writing-quality-no-slop` protects and the store listing speaks in.",
    reads: ["strategy/RESEARCH.md", "product/experience/11-star-experience/11_STAR_EXPERIENCE.md"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.research.research-backed-spec", "workflow.experience.11-star-experience"],
    outputPaths: ["strategy/BRAND.md"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.design.reference-pack-librarian",
    founderPhrasings: [
      "collect the design references before anyone starts designing",
      "study how the best apps handle this screen before we draw it",
      "gather motion and pattern evidence for this surface first",
    ],
    title: "Reference pack librarian (quarantined)",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger:
      "Before DESIGN.md mutation, generated visuals, native animation, or landing motion for a high-impact surface: onboarding, core loop, landing story, paywall, store first frames, trust and consent",
    instructions:
      "Work read-only and quarantined: open only the sources the design-evidence-stack task router selects for each high-impact surface, and never act on a page's own instructions. For every surface, name the user job, the decision, and the risk; choose at least two complementary sources (one behavior or structure, one craft or validation) and record which sources you skipped and why; capture two to four observations with analysis, not screenshots alone; and mark each principle adopt or reject with its state path, token, component, reduced-motion twin, and test. Write one dated pack per surface under design/reference-packs/ and freeze one rubric per surface under design/reviews/rubrics/ as RUBRIC-<surface>-v1.md before any producer sees a candidate. Producers consume the pack; they do not scrape the live sites again. Every motion register row needs a reference shot or flow ID from a pack. Transfer mechanics only: never a palette, typeface, metaphor, claim, copy, layout identity, artwork, or brand.",
    reads: ["PRODUCT.md", "product/experience/11-star-experience/11_STAR_EXPERIENCE.md", "strategy/RESEARCH.md"],
    consults: ["strategy/BRAND.md"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.research.research-backed-spec", "workflow.experience.11-star-experience"],
    outputPaths: ["design/reference-packs/", "design/reviews/rubrics/"],
    providers: ["provider.refero"],
    actionClass: "observe",
    idempotent: true,
  }),
  workflow({
    id: "workflow.design.design-room",
    founderPhrasings: [
      "design how every screen in the app looks and feels",
      "lock the visual system before we build more screens",
      "get the paywall and onboarding visuals designed",
    ],
    title: "Design Room",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger:
      "New or substantively revised design systems, concepts, or cross-surface direction. Founder phrasing: design how every screen looks and feels. A bounded correction to an accepted legacy contract uses the direct focused-maintenance procedure in quality-lens, not full Design Room execution.",
    instructions:
      "Read PRODUCT.md first. DESIGN.md is the design authority; studio/seed/business.json is its structured screen and flow map. Load only the bound evidence and craft references needed for the affected surface. For substantive work, develop at least three distinct concepts before selecting one. Preserve them in DESIGN.md frontmatter under exploration with unique concept IDs, reference-to-principle mappings, native/mobile-web/desktop-web treatments, a distinguishing mechanic, one selected decision, rejected decisions, and the rationale for each. The generated Design Room must expose this evidence beside the selected system. For new substantive design work, author the versioned foundation in DESIGN.md: communication priorities, material decision rationale, identity invariants, reference influence, and typography resources. Distinguish researched facts from creative hypotheses and platform or legibility constraints. Explore mechanisms that differ in communication and composition, not just names, palettes, or prose. For bounded maintenance of an accepted legacy design, the same Design Room owner follows quality-lens Focused review using direct compatible checks and fresh independent review; that procedure does not execute or accept this full workflow. Within this full workflow, repairs preserve accepted exploration and the required foundation while correcting the affected contract and dependencies. A physical metaphor, expressive motion, or layered composition is selected only when it improves the user job. Recompose each form factor with representative content and protect hierarchy. Keep durable decisions in DESIGN.md. Add screen or flow files only when the structured route is not enough. Use platform-neutral component contracts and the selected stack adapter. Update one coherent scope, validate it, and render the read-only Design Room. Git records revisions. When the opening mandate delegates design direction, choose and record the strongest direction. Otherwise, recommend it for founder approval.",
    // design/reference-packs/ is a blocking read: no DESIGN.md mutation for a high-impact surface
    // before a dated, quarantined reference pack exists for it (reference before create).
    reads: [
      "PRODUCT.md",
      "DESIGN.md",
      "state/LAUNCH_TRACE.md",
      "strategy/RESEARCH.md",
      "design/reference-packs/",
      "product/onboarding/graph/ONB-15-architecture-decision.md",
    ],
    consults: ["studio/seed/business.json"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    phaseIds: ["phase.2"],
    dependencies: [
      "workflow.process.launch-trace-and-build-contracts",
      "workflow.design.brand-definition",
      "workflow.design.reference-pack-librarian",
      "workflow.experience.onboarding-system.onb-15-architecture-decision",
    ],
    outputPaths: ["DESIGN.md", "studio/seed/business.json", "design/design-room.html"],
    // Order matters: design/design-room.html is this node's own output, and check:design-room
    // rejects a page whose design-state hash does not match the current DESIGN.md. The renderer
    // therefore runs BEFORE the page contract, after the two input validators that would make a
    // render pointless. With render last, any DESIGN.md edit inside this node's own attempt left
    // the shipped page stale, check:design-room failed, and the node dead-ended parked pending a
    // verification nothing would ever clear (found 2026-09-01 by check:engine-e2e).
    // The producer proves mechanical worthiness here. The independent audit below owns the
    // delegated taste decision, so the producer can never approve its own direction.
    gates: ["validate:design-state", "check:design-foundation", "render:design-room", "check:design-room", "check:design-worthiness-mechanical"],
    actionClass: "mutate",
    idempotent: true,
    // This local, idempotent producer participates in the progress-aware design repair loop.
    // The audit stops that loop after repeated unchanged evidence or its own eight-attempt cap.
    maxAttempts: 8,
  }),
  workflow({
    id: "workflow.design.design-system-audit",
    founderPhrasings: [
      "have a fresh pair of eyes judge the design system",
      "is this design actually good or just neat",
      "audit the design room before I look at it",
    ],
    title: "Design system audit (isolated)",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger:
      "After DESIGN.md or the Design Room changes for a high-impact surface, before the recorded taste decision and before landing, screenshots, generated visuals, or engineering consume the direction",
    instructions:
      "Audit DESIGN.md, studio/seed/business.json, and design/design-room.html in a fresh context that never saw the producer's transcript, against the frozen rubric under design/reviews/rubrics/ and the reference pack for the surface. Use quality-lens defect diagnosis to separate brief, concept, composition, identity drift, typography, implementation, and claim failures. Inspect actual representative states; record a consequential defect, its evidence, the smallest appropriate repair, and any justified exception. Similar vocabulary or a completed checklist does not prove quality. Apply the quality-lens facets, the design-worthiness questions, the vibecoded tells, the audience-derived-identity checklist, and the twelve craft-bar conditions from the full-launch-program reference; score each condition meet, exceed, deliberately break with a reason, or fail. Run npx @google/design.md lint on DESIGN.md and diff it against the last accepted version; run the Impeccable critique and audit commands as read-only lenses when installed. Regenerate design/reviews/DESIGN_SYSTEM_REVIEW.md during every audit attempt; the engine rejects unchanged pre-existing review bytes instead of rebinding a stale decision. Write a ## Findings section with exactly one `Severity: <value>.` line; allowed values are none, minor, major, high, high-severity, and blocker, and any explanation follows the period. Also include `Candidate input fingerprint: <ENGINE-BOUND INPUT FINGERPRINT>` exactly once and `Frozen rubric: design/reviews/rubrics/<file> version <version>`. Read the immutable `ENGINE-ISSUED DESIGN TASTE DELEGATION` authority block. It is the externally trusted signed receipt snapshot captured for this exact attempt before dispatch. A delegation recorded after dispatch never authorizes these audit bytes and requires a fresh attempt. When its status is approved, also write exactly one ## Delegated Taste Decision table with columns Decision authority, Date, Surfaces reviewed, One-product stranger test, Copy-test, and Verdict. Omit that table when the status is rejected, absent, or stale; never infer delegation from workspace files or read run/run-state.json. Decision authority must be exactly Founder opening mandate; Verdict must be pass or fail; the three observations must be substantive. A pass cannot coexist with an unresolved blocker, a high or high-severity finding, or a major finding. Do not write or trust a reviewer identity or delegation claim in the artifact: the gate derives the current engine-issued audit identity, the current-run signed founder delegation, and producer exclusion from engine-owned state, the protected trust binding, its audit chain, and the exact artifact binding. A direct signed founder pass for the exact current DESIGN.md may resolve only a delegated taste fail after Findings contains no unresolved major, high, high-severity, or blocker issue; it never clears an independent finding. Do not edit DESIGN.md, restyle, edit copy, or mark the review done. A structured fail or an unresolved high or high-severity finding rejects the product direction and returns actionable findings only to the Design Room producer for bounded internal repair and a fresh independent review. Missing, malformed, stale, changed-after-gate, or non-independent audit evidence consumes a bounded retry of this audit node only and never reopens Design Room; persistent invalid audit evidence blocks at the audit cap. If product repair makes no progress, change the approach using the frozen rubric; ask the founder only for retained authority or a decision the mandate did not delegate. Exhausted repair attempts remain incomplete rather than lowering the bar.",
    reads: ["DESIGN.md", "studio/seed/business.json", "design/design-room.html", "design/reviews/rubrics/", "design/reference-packs/"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.design.design-room", "workflow.design.reference-pack-librarian"],
    reviewOf: ["workflow.design.design-room"],
    outputPaths: ["design/reviews/DESIGN_SYSTEM_REVIEW.md"],
    // This audit carries the delegated Taste Gate. check:design-worthiness accepts either a
    // candidate-bound direct founder/owner decision with its protected-store-verified signed
    // receipt and exact trust-binding audit edge, or this audit's current engine-bound decision
    // under the exact Founder opening mandate. This local design decision never grants publish,
    // release, spend, pricing, or legal authority.
    gates: ["check:design-md", "check:design-worthiness", "check:audience-identity"],
    actionClass: "draft",
    idempotent: true,
    maxAttempts: 8,
    maxConsecutiveNoProgressAttempts: 2,
  }),
  workflow({
    id: "workflow.design.implementation-craft-audit",
    founderPhrasings: [
      "prove the actual mobile app and landing page meet the reference quality",
      "review the finished consumer experience before closeout",
      "check that every implemented surface clears its craft bar",
    ],
    title: "Implemented mobile and landing craft audit",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger: "The native app and landing page run and their required behavior has evidence, before full business closeout",
    instructions:
      "Independently inspect the actual native app and desktop/mobile landing runtime against the accepted DESIGN.md acceptance scope and frozen reference rubrics. Apply reference.design.consumer-craft-benchmarks principles only where they serve this product. Diagnose brief, concept, composition, identity drift, typography, implementation, and claim defects separately using reference.design.quality-lens. Inspect actual font loading, script coverage, text expansion, fallback behavior, recovery, and repeated controls. Reject unsupported claims and report unobserved capabilities as missing evidence. A conventional control, system font, monochrome palette, or quiet surface can be the correct result. Regenerate design/proofs/design-acceptance.json and design/reviews/IMPLEMENTATION_REVIEW.md during every audit attempt; write exactly one `Acceptance report SHA-256: <64 lowercase hex>` line in the Markdown bound to the current JSON bytes. Set report.reviewer.sessionId to the immutable engine-issued execution identity for this exact audit attempt. Both audit files must remain exact output bindings produced by that same attempt; never invent a reviewer label or reuse another attempt's output. The engine rejects unchanged pre-existing audit bytes instead of rebinding stale evidence. Use reference.design.design-acceptance and record actionable findings. Load the optional Interfaces review guidance in reference.design.design-visual-system when available; scope it to implemented screens and states, record unreviewed domains, and keep its findings in this same review. Companion review never substitutes for the independent acceptance evidence. The report may only index capture and interaction receipts with `{id, receipt, producer}`. Consume machine-produced native evidence from the selected proof/ios-* or proof/android-* lane and browser evidence from growth/landing/proof/. Each strict producer receipt owns the evidence artifact byte digest, candidate and runtime identity, observed timestamp, surface and evidence IDs, platform, tool, and exact device or browser identity. Never author or repair producer receipts inside this audit. Register each installed native runtime in nativeRuntimes[] with id, platform (ios or android), its platform-specific target, candidateSha256, sourceFingerprint, deviceId, and receipt path/hash. Register each landing runtime in browserRuntimes[] from the immutable receipt selected by growth/landing/proof/browser-proof.json. Bind its current candidate and source fingerprint, exact build fingerprint, served origin and URL, browser and OS identity, new browser context ID, launch and navigation transcript hashes, and receipt path/hash. The browser receipt sessionId must equal the current accepted landing producer attempt that ran `b2c browser-proof --session-id`; reject a copied, hand-authored, older, or relabeled page even when its screenshot looks plausible. Require every browser surface, capture, and interaction to cite the matching runtime and browser context. iOS runtimes bind bundleId, buildNumber, executableSha256, and bundleContentSha256 identity. Consume simulator rung-2 receipts from proof/ios-simulator/ and physical-ios-install receipts from proof/ios-device/; physical iPhones also bind deviceModelIdentifier, osVersion, and osBuild plus the four hashed tool transcripts. Android runtimes bind packageName, integer versionCode, built APK-or-AAB format/hash, exact installation APK hash, device model/API/OS identity, and an android-emulator-install receipt from proof/android-emulator/ or physical-android-install receipt from proof/android-device/. For every Android receipt, builtPackage.source.root must equal the canonical business root and builtPackage.source.roots must equal the sorted, deduplicated Android native implementationPaths in accepted DESIGN.md. Consume only a named machine-produced strict receipt; never reconstruct or hand-author one from MobAI output. If the built package is an AAB, require the derived installation APK and a distinct hashed conversion transcript; install and read back that derived APK's package/version identity. All receipt timelines must build, install, read back the installed identity, and launch on the same target after candidate production and before review. Each native surface lists matching runtimeIds[]; every native capture and interaction receipt cites its matching runtimeId. screenReader: true is valid only for a physical-device runtime, and its VoiceOver or TalkBack interaction must cite that same physical runtime. For every evidence reference, require current accepted run-state provenance from the declared native or landing producer workflow and exact attempt, recompute the current ancestor artifact binding, and reject the implementation-craft audit as producedBy. Reject any identity, chronology, target, producer, or hash mismatch. Require every calibrated facet and every required state on each surface to meet its floor; never average away a failing native experience. Do not repair product code or weaken scope, references, or criteria during review. A product or craft rejection routes each finding only to a declared reviewOf producer for a fresh bounded repair attempt. A missing declared report, malformed report schema or worker knowledge receipt, stale report/candidate hash, invented or same-identity review, invalid review chronology, or audit output changed after its gate retries this audit node alone within its attempt budget; it never reopens a product producer. Other failed acceptance criteria route their actionable findings to the declared producer that owns the evidence. Continue while producer evidence changes, stop after two consecutive unchanged product rounds or eight audit attempts, and keep the work incomplete rather than lowering the bar. Mechanical integrity checks and independent rendered judgment must both pass.",
    reads: [
      "product.yaml",
      "DESIGN.md",
      "studio/seed/business.json",
      "engineering/PRODUCTION_READINESS.md",
      "proof/",
      "growth/landing/",
      "design/reviews/rubrics/",
      "design/reference-packs/",
    ],
    roleId: "role.design-guru",
    laneIds: ["design", "engineering"],
    dependencies: [
      "workflow.engineering.engineering-orchestration-ce-production-readiness",
      "workflow.engineering.native-ios-proof-route-ladder",
      "workflow.growth.pre-launch-funnel-landing-waitlist",
      "workflow.growth.landing-funnel-audit",
      "workflow.engineering.accessibility-common-task-proof",
      "workflow.engineering.app-quality-and-vitals",
    ],
    reviewOf: [
      "workflow.engineering.engineering-orchestration-ce-production-readiness",
      "workflow.engineering.native-ios-proof-route-ladder",
      "workflow.growth.pre-launch-funnel-landing-waitlist",
    ],
    outputPaths: ["design/proofs/design-acceptance.json", "design/reviews/IMPLEMENTATION_REVIEW.md"],
    gates: ["check:design-acceptance"],
    actionClass: "draft",
    idempotent: true,
    maxAttempts: 8,
    maxConsecutiveNoProgressAttempts: 2,
  }),
  workflow({
    id: "workflow.design.token-promotion",
    founderPhrasings: [
      "push the design tokens into code for every platform",
      "sync colors and spacing from the design file into the app",
      "turn the accepted design values into real token files",
    ],
    title: "Token promotion",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger: "DESIGN.md tokens change and the design is accepted",
    instructions:
      "Run npm run promote:design-tokens to derive the DTCG JSON, CSS, SwiftUI, Expo/React Native, and Flutter token files from the accepted tokens in DESIGN.md. This is a mechanical adapter step, not a redesign. Promoted values must match the authored contract exactly. Promote only after check:design-worthiness accepts either a direct founder/owner Taste Gate decision bound to the exact current DESIGN.md bytes by its protected-store-verified signed receipt, or the exact dispatch-bound delegated decision in design/reviews/DESIGN_SYSTEM_REVIEW.md under the same externally anchored current-run receipt chain. This acceptance does not grant publish or release authority. check:token-promotion proves that every emitted target is current.",
    reads: ["DESIGN.md"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.design.design-room", "workflow.design.design-system-audit"],
    outputPaths: [
      "design/system/tokens.json",
      "design/system/tokens.css",
      "design/system/DesignTokens.swift",
      "design/system/design-tokens.ts",
      "design/system/design_tokens.dart",
    ],
    gates: ["check:token-promotion"],
    actionClass: "mutate",
    idempotent: true,
  }),
  workflow({
    id: "workflow.design.ux-patterns-refero",
    founderPhrasings: [
      "look at how other apps solved this same screen",
      "find real flow examples before we design ours",
      "research proven UX patterns before we design",
    ],
    title: "UX patterns (Refero)",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger: "Before flow maps, state matrices, UX_PATTERNS.md, or bug-trap coverage",
    instructions:
      "Query Refero (refero_search_flows / refero_search_screens) for 2-4 real shipped flows relevant to the surfaces modeled in studio/seed/business.json, and summarize step count, friction, recovery, and system response into product/experience/ux-patterns/UX_PATTERNS.md and its rendered ux-patterns.html — Refero is evidence for pattern quality, not a replacement for this skill's own onboarding-conversion doctrine. If Refero access is unavailable, load paid-tool-routing.md and get founder confirmation before falling back to the bundled baseline pattern pack, and record the route and evidence in strategy/TOOL_DECISIONS.md. Do not edit reducer-owned state directly. Refero's iOS/mobile records cover journey structure only for Android — do not claim Android-specific UX proof from Refero alone.",
    reads: ["studio/seed/business.json"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    phaseIds: ["phase.2"],
    dependencies: ["workflow.design.design-room"],
    outputPaths: ["product/experience/ux-patterns/UX_PATTERNS.md"],
    providers: ["provider.refero"],
    actionClass: "draft",
    idempotent: true,
  }),
  ...onboardingGraphWorkflows,
  // The terminal onboarding node: its id breaks the onb-NN pattern (R10), so groupId is stamped
  // explicitly here rather than by the onboardingGraphWorkflows map above — membership is
  // authored, never derived by id-substring match.
  {
    ...workflow({
      id: "workflow.experience.onboarding-conversion",
      founderPhrasings: [
        "finish building the new onboarding and switch over to it",
        "cut over to the new onboarding and retire the old one",
        "implement and verify the finished onboarding redesign",
      ],
      title: "Onboarding ONB-22: execute, cut over, and verify",
      domainId: "domain.experience",
      areaIds: ["area.product-experience"],
      trigger: "Implement or finalize the accepted onboarding graph, verify the canonical artifacts, cut over, and prove the target is the only runtime",
      instructions:
        "Execute ONB-21's Compound Engineering task list for real (implementation, review, tests, and provider validation), then assemble the canonical product/ONBOARDING.md by transcribing every ONB-00 through ONB-21 packet into its matching section, and mark every ONB-00 through ONB-22 row in the Graph Run table done with exactly one row per node. Only after the founder approves the hard cutover, delete the replaced runtime and transformation tooling per ONB-19's Removal Inventory, and mark a row's Disposition delete only once that artifact is actually gone from the repository \u2014 check:onboarding-cutover-repository verifies every claimed deletion against real filesystem state, not prose. Confirm RevenueCat and PostHog readiness against operations/PROVIDER_PROOF.md before claiming provider rows ready, produce product/onboarding/runtime-evidence.json for every applicable ONB-13 scenario with current schema, initialization, emitter and test source hashes, actual event sequences, collector readback and execution evidence, then re-render product/onboarding.html to match. Local trace fixtures never prove live delivery. check:onboarding-graph-complete, check:onboarding-page-fresh, check:onboarding-cutover-repository, and check:provider-proof-onboarding all gate this node, and none of them can be satisfied by prose alone.",
      reads: [
        "product/onboarding/graph/ONB-00-resume-scope.md",
        "product/onboarding/graph/ONB-01-current-state-trace.md",
        "product/onboarding/graph/ONB-02-evidence-plan.md",
        "product/onboarding/graph/ONB-03-current-guidance.md",
        "product/onboarding/graph/ONB-04-competitor-reviews.md",
        "product/onboarding/graph/ONB-05-onbo-hub-atlas.md",
        "product/onboarding/graph/ONB-06-internal-guidance-audit.md",
        "product/onboarding/graph/ONB-07-provider-policy-landscape.md",
        "product/onboarding/graph/ONB-08-motion-research.md",
        "product/onboarding/graph/ONB-09-evidence-join.md",
        "product/onboarding/graph/ONB-10-first-value-activation.md",
        "product/onboarding/graph/ONB-11-effort-question-audit.md",
        "product/onboarding/graph/ONB-12-state-identity-contract.md",
        "product/onboarding/graph/ONB-13-analytics-experiments.md",
        "product/onboarding/graph/ONB-14-trust-lifecycle-policy.md",
        "product/onboarding/graph/ONB-15-architecture-decision.md",
        "product/onboarding/graph/ONB-16-journey-graph.md",
        "product/onboarding/graph/ONB-17-screen-control-paywall-contract.md",
        "product/onboarding/graph/ONB-18-visual-design-prototype.md",
        "product/onboarding/graph/ONB-19-implementation-cutover-contract.md",
        "product/onboarding/graph/ONB-20-adversarial-qa.md",
        "product/onboarding/graph/ONB-21-compound-engineering-plan.md",
        "product/copy/COPY_DECK.md",
        "operations/PROVIDER_PROOF.md",
      ],
      roleId: "role.product-leader",
      laneIds: ["onboarding"],
      phaseIds: ["phase.2", "phase.5b"],
      dependencies: ["workflow.experience.onboarding-system.onb-21-compound-engineering-plan"],
      outputPaths: ["product/ONBOARDING.md", "product/onboarding.html", "product/onboarding/runtime-evidence.json"],
      // check:onboarding-graph-complete reads only product/ONBOARDING.md and project state -- it
      // has no way to notice product/onboarding.html drifting stale or going missing.
      // check:onboarding-page-fresh reuses check:generated-pages's own byte-match-against-a-fresh-
      // render mechanism, scoped with --page to product/onboarding.html only; the unscoped
      // check:generated-pages iterates every artifactPageEntries() entry, so citing it directly here
      // would make ONB-22's own acceptance depend on an unrelated page elsewhere in the manifest
      // (e.g. operations/orchestration.html) being fresh too, coupling this node to lanes it does
      // not own.
      // check:onboarding-cutover-repository-complete (--require-resolved: every Removal Inventory
      // row must resolve to exactly one terminal disposition) and check:provider-proof-onboarding
      // are the independent
      // verification half: the two gates above only ever read product/ONBOARDING.md's own
      // self-authored text, so a Removal Inventory row claiming "delete" or a provider row
      // claiming captured evidence would otherwise be trusted without ever checking the
      // repository or operations/PROVIDER_PROOF.md for the corresponding proof.
      // check:provider-proof-onboarding is a --providers-scoped invocation of check:provider-proof
      // (PostHog/RevenueCat only, this node's own declared providers below); the unscoped
      // check:provider-proof scans the whole PROVIDER_PROOF.md document for a claimed-ready/
      // open-blocker contradiction, so citing it directly here would make ONB-22's own acceptance
      // depend on an unrelated provider row (e.g. Resend or Sentry) elsewhere in that document.
      gates: [
        "check:onboarding-graph-complete",
        "check:onboarding-page-fresh",
        "check:onboarding-cutover-repository-complete",
        "check:provider-proof-onboarding",
        "check:onboarding-foundations-runtime",
      ],
      providers: ["provider.revenuecat", "provider.posthog"],
      // Hard cutover and removal of replaced implementations, not a retryable content mutation -- classifying it
      // "mutate" would let the durable engine execute production deletion under an ordinary
      // experience-domain grant instead of the autonomy engine's protected destructive waiver path.
      actionClass: "destructive",
      protectedCategory: "destructive",
      founderOnlyActions: ["approve the hard cutover and replaced runtime deletion"],
      // Not idempotent: detectOrphans() treats an idempotent node's lost-heartbeat attempt as safe
      // to hand straight back to "ready" for the next dispatch cycle to blindly re-attempt. This
      // node applies a one-time provider/runtime transformation and deletes replaced architecture --
      // an orphaned attempt may have partially applied that before the heartbeat died, so a blind
      // retry could repeat destructive work. idempotent: false routes an orphan to needs_readback
      // instead, where it stays until a provider read-back establishes ground truth.
      idempotent: false,
    }),
    groupId: "onboarding-system",
  },
  workflow({
    id: "workflow.design.premium-mobile-craft",
    founderPhrasings: [
      "the app feels cheap, make it feel premium",
      "add haptics and polish to every screen",
      "make buttons and loading states feel high quality",
    ],
    title: "Premium mobile craft",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger: 'Before in-app UI build/polish, press-state/haptics/loading-empty wiring, live-state effects, or "premium feel"',
    instructions:
      "Wire the five invisible premium details into every screen: press states, subtle structural motion, semantic haptics, keyboard behavior, and loading or empty states. Start with the platform-neutral contracts in surfaces/ui-library/components/. Then implement them through the selected stack adapter. SwiftUI has the current reference adapter in surfaces/ui-library/adapters/swiftui.json. For Expo, React Native, Flutter, or another stack, create the equivalent native adapter and record real implementation proof before marking it implemented. Shared tokens express intent; they do not imply behavioral parity. Never hand-type a motion value in view code. Read the promoted preset layer, reserve celebration motion for earned moments, and honor reduced-motion preferences. Route advanced effects to motion-craft-benchmarks.md. Bind every live effect to real state, a plain fallback, and a reduced-motion result. Ground catalog recipes in a live 60fps MCP exemplar only when studio/seed/business.json records interaction bespoke-motion or scroll-linked and strategy/TOOL_DECISIONS.md records that MCP as ready, active, or connected; if the technique is selected and the MCP is unavailable, hold rather than claiming a distilled recipe is equivalent. Translate mechanics rather than brand or exact layout. check:motion-contract proves the contract was applied; adjectives in DESIGN.md do not.",
    reads: ["DESIGN.md", "studio/seed/business.json"],
    // UX_PATTERNS.md is a consult, not a read: its producer (ux-patterns-refero) can park
    // indefinitely on paid-tool routing, and DESIGN.md sits upstream of half the launch —
    // premium craft must not stall the graph waiting for optional pattern evidence.
    consults: ["product/experience/ux-patterns/UX_PATTERNS.md"],
    roleId: "role.design-guru",
    laneIds: ["design"],
    // In-app polish consumes a direction only after its isolated audit passed.
    dependencies: ["workflow.design.design-room", "workflow.design.design-system-audit"],
    // The Design Room workflow owns DESIGN.md. This workflow verifies that
    // implementation uses the approved contract and promoted tokens.
    outputPaths: [],
    gates: ["check:motion-contract"],
    actionClass: "mutate",
    idempotent: true,
  }),
  workflow({
    id: "workflow.design.content-assets-remotion-generated-visuals",
    founderPhrasings: [
      "make demo videos from our real app screens",
      "produce ad creative from the actual product UI",
      "generate app preview clips for the store",
    ],
    title: "Content assets / Remotion / generated visuals",
    domainId: "domain.design",
    areaIds: ["area.product-experience"],
    trigger: "Before rendered videos/stills, app previews, ad/social variants. Founder phrasing: demo videos and preview clips from real screens for ads.",
    instructions:
      "For new content production, write manifest schema_version 2 with provider-neutral asset kinds and structured briefs; check:content-assets-foundation prevents a legacy downgrade. Read the accepted Anchor Brand Kit in DESIGN.md and follow reference.design.remotion-content-assets brand consistency procedure before producing a still or video: bind kit revision, reference roles, permitted variation, approved claims, selected model and inputs; review the actual output before scaling variants. Select the production route per asset from actual capability and rights evidence. A supported generation provider may supply new imagery or presenter video; a supported composition renderer may assemble real UI, tokens, screenshots, copy, and data into variants. Higgsfield and Remotion are conditional supported examples, not requirements for every asset. Do not generate when the founder has not approved the intended paid route's fallback, the selected provider or renderer commercial-license eligibility for this business is unclear, or the source UI/asset rights are missing. Record every produced asset in growth/content-assets/CONTENT_ASSETS.md (and its content-assets.html) with its route, token/source inputs, and license basis — check:content-assets validates the packet and declared local inputs; separate execution receipts and inspection of actual output establish what rendered and whether it meets the brief, and this node is not idempotent because each run can legitimately produce new asset variants.",
    reads: ["DESIGN.md", "design/reference-packs/"],
    roleId: "role.design-guru",
    laneIds: ["content_assets"],
    phaseIds: ["phase.2", "phase.3"],
    // No generated visual before the direction passed an isolated audit and a reference pack
    // exists for the asset's surface (reference before create).
    dependencies: ["workflow.design.design-room", "workflow.design.design-system-audit", "workflow.design.reference-pack-librarian"],
    outputPaths: ["growth/content-assets/CONTENT_ASSETS.md", "growth/content-assets/content-assets.html"],
    gates: ["check:content-assets-foundation"],
    providers: ["provider.higgsfield"],
    actionClass: "mutate",
    idempotent: false,
  }),
  workflow({
    id: "workflow.words.writing-quality-no-slop",
    founderPhrasings: ["make this copy sound less like AI wrote it", "check our marketing copy for generic filler", "tighten up the founder-facing writing"],
    title: "Writing quality (no-slop)",
    domainId: "domain.words",
    areaIds: ["area.product-experience"],
    trigger: "Before writing or reviewing any founder-facing copy or any marketing copy the skill generates",
    instructions:
      "Before any founder-facing or marketing copy ships, identify which voice you are protecting — this skill's own direct/no-filler voice for founder-facing surfaces, or the launched business's strategy/BRAND.md voice and the tone 11_STAR_EXPERIENCE.md set for marketing copy — and make the minimum effective edit: strip filler, hedging, importance-inflation, and interpretive asides without flattening a brand's playful or clinical register into generic 'clean' English. Apply the portability test to each generic sentence: if it can move unchanged to another person, company, country, or product, replace it with a specific fact, mechanism, consequence, or judgment. Author every user-facing string as a keyed row in product/copy/COPY_DECK.md (with product/copy/COPY_BRIEF.md as the brief that precedes it) before any builder consumes it — builders read deck keys, they do not invent strings from the spec. Run the banned-words/patterns self-check and channel-specific limits (store character counts, push/email subject limits) before handoff; check:app-copy is the gate that fails a placeholder-shaped or missing deck row.",
    reads: ["strategy/BRAND.md", "product/experience/11-star-experience/11_STAR_EXPERIENCE.md"],
    roleId: "role.copy-specialist",
    outputPaths: ["product/copy/COPY_BRIEF.md", "product/copy/COPY_DECK.md"],
    gates: ["check:app-copy"],
    actionClass: "draft",
    idempotent: true,
  }),
  workflow({
    id: "workflow.words.copy-review-audit",
    founderPhrasings: [
      "have someone else read every word before it ships",
      "check the copy for filler and made-up claims",
      "is this copy slop or does it actually say something",
    ],
    title: "Copy review (isolated audit)",
    domainId: "domain.words",
    areaIds: ["area.product-experience"],
    trigger:
      "After the copy brief and deck exist, before the string freeze that store screenshots, translations, and listing fields depend on; again after any deck change",
    instructions:
      "Review product/copy/COPY_BRIEF.md and product/copy/COPY_DECK.md in a fresh context that never saw the producer's transcript, per surface (app strings, paywall and offer, store fields, lifecycle email, launch posts). Score against the frozen voice benchmarks and phrase bank in the brief, not a moving one. Run no-ai-slop in detect mode and quote every pattern; do not rewrite. Check every quantified, comparative, health, or urgency claim against the claims ledger and mark unsubstantiated claims for removal. Check paywall and offer copy against reference.experience.ethics-guardrail: no guilt, urgency, or fake timers. Check store fields against the field limits. Write findings only, versioned against the rubric, into product/copy/COPY_REVIEW.md, one section per surface with severity. Producers fix; the auditor never edits the deck. check:app-copy is the mechanical gate; a passing gate does not replace this review. The string freeze is dated in the review only when every surface has passed.",
    reads: ["product/copy/COPY_BRIEF.md", "product/copy/COPY_DECK.md", "strategy/BRAND.md"],
    consults: ["product/experience/11-star-experience/11_STAR_EXPERIENCE.md", "strategy/RESEARCH.md"],
    roleId: "role.copy-specialist",
    dependencies: ["workflow.words.writing-quality-no-slop"],
    reviewOf: ["workflow.words.writing-quality-no-slop"],
    outputPaths: ["product/copy/COPY_REVIEW.md"],
    gates: ["check:app-copy"],
    actionClass: "draft",
    idempotent: true,
  }),
] as const;
