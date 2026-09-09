# Onboarding System Graph

Use this reference for consumer onboarding, first-value, activation, paywall, trial, review timing, cross-surface continuity, or replacement work. Onboarding is one system:

`acquisition -> first open -> minimum useful input -> first value -> engagement -> activation -> monetization -> identity -> normal product use -> retention -> reactivation`

Load `paid-tool-routing.md` before replacing Higgsfield, MobAI Plus/Pro or intended cross-platform coverage, XcodeBuildMCP-approved fallback, RevenueCat experiments, PostHog experiments/surveys/replay, or any paid/account-gated onboarding tool with a free/manual route. MobAI Free needs no spend gate when it covers the lane. Load `remotion-content-assets.md` before using Remotion for onboarding demo clips, animated explainers, app-preview cuts, social hook clips, or local rendered assets. Load [`motion-craft-benchmarks.md`](../design/motion-craft-benchmarks.md)'s R11–R14 recipes before designing the cold-launch splash, loading, or welcome-screen sequence that precedes `product/ONBOARDING.md`'s screen-sequence rows — the numeric, checkable acceptance criteria for that moment live there, not here.

Do not optimize for a small diff. Optimize for early real value, low cognitive load, progressive profiling, visible personalization, trustworthy monetization, one state and analytics model, remote experimentability, accessibility, privacy, recovery, and deletion of obsolete architecture.

## Execution modes

| Mode          | Use when                                             | Cutover rule                             |
| ------------- | ---------------------------------------------------- | ---------------------------------------- |
| `greenfield`  | No production onboarding exists                      | Build only the target system             |
| `replacement` | Existing onboarding is rebuilt from first principles | Hard cutover; no permanent coexistence   |
| `audit_only`  | Findings are requested without implementation        | Produce evidence, target graph, and plan |
| `incremental` | The founder explicitly limits scope                  | Preserve only the named boundary         |

Rebuild, replace, standardize, and rethink requests default to `replacement`. Preserve durable user value through an isolated, rehearsed, one-time transformation, then delete the transformation and every obsolete route, state, event, provider object, test, and document.

## Ownership and dispatch

`workflow.experience.onboarding-conversion` owns the nested graph. The orchestrator is the single writer for `product/ONBOARDING.md`, `product/onboarding.html`, state, canonical IDs, pricing, provider mutations, cutover, and final readiness.

Load [`eleven-star-experience.md`](eleven-star-experience.md) before locking onboarding. The onboarding sequence should carry the product's 11-star complete product experience: the user should see why the product is personally relevant before the flow asks for payment, long setup, or sensitive data.

Specialists may parallelize read-only research or disjoint implementation packets. Evidence branches may fan out. State, IDs, provider mutations, migrations, release actions, and final decisions serialize through the orchestrator.

Every node returns status, inputs and freshness, evidence or implementation checks, decisions and rejected alternatives, artifact paths, blockers, and newly eligible nodes. A prose artifact is not completion; the node exit gate must pass.

## Canonical graph

```text
ONB-00 -> ONB-01 -> ONB-02
ONB-02 -> [ONB-03, ONB-04, ONB-05, ONB-06, ONB-07, ONB-08]
[ONB-03..08] -> ONB-09
ONB-09 -> [ONB-10, ONB-11, ONB-12, ONB-13, ONB-14]
[ONB-10..14] -> ONB-15 -> ONB-16
ONB-16 -> [ONB-17, ONB-18, ONB-19]
[ONB-17..19] -> ONB-20 -> ONB-21 -> ONB-22
```

| Node     | Contract                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ONB-00` | Resume state, classify mode, identify surfaces and founder-only actions                                                   |
| `ONB-01` | Trace real code, documents, providers, state, routes, events, tests, failures, and removal items                          |
| `ONB-02` | Set source hierarchy, sampling, access limits, and freshness cutoff                                                       |
| `ONB-03` | Research current platform guidance, evidence, benchmarks, and practitioner heuristics                                     |
| `ONB-04` | Mine negative competitor reviews plus a positive-review control and code root causes                                      |
| `ONB-05` | Build an authorized Onbo Hub flow atlas without scraping or inferring locked screens                                      |
| `ONB-06` | Audit applicable B2C App Builder and internal B2C guidance; resolve outdated rules                                        |
| `ONB-07` | Refresh provider, RevenueCat, billing, identity, analytics, policy, and regional capability facts                         |
| `ONB-08` | Research applicable interaction and motion; use 60fps operations only on the selected route |
| `ONB-09` | Join evidence into adopted, test, rejected, and investigate decisions                                                     |
| `ONB-10` | Define first value rendered, first value engaged, activation, habit, and retention hypotheses                             |
| `ONB-11` | Audit effort, questions, permissions, interruption budget, and personalization proof                                      |
| `ONB-12` | Define canonical identity, journey, profile, activation, entitlement, experiment, review, permission, and lifecycle state |
| `ONB-13` | Define typed analytics, authoritative emitters, stitching, deduplication, exposure, and expected sequences                |
| `ONB-14` | Define review timing, permissions, lifecycle, privacy, security, and policy behavior                                      |
| `ONB-15` | Compare native-first, funnel-first, hybrid, web-first, and evidence-backed alternatives; choose one                       |
| `ONB-16` | Produce acquisition-specific journeys that converge on one semantic model                                                 |
| `ONB-17` | Specify every screen, copy key, control, action, paywall state, error, and recovery path                                  |
| `ONB-18` | Produce actual high-fidelity design, motion, interactive prototype, and design QA                                         |
| `ONB-19` | Define implementation, reliability, accessibility, localization, privacy, performance, and cutover units                  |
| `ONB-20` | Run adversarial review, synthetic one-star pre-mortem, policy review, and instrumentation QA                              |
| `ONB-21` | Run Compound Engineering planning when available, preserving graph IDs and deletion work                                  |
| `ONB-22` | Implement, review, test, cut over, remove replaced implementations, and verify the target is the only runtime             |

Onboarding is where most of the Experience Cards fire. When the 11-star target is 6-star or higher, load [`emotional-design-system.md`](./emotional-design-system.md) for the card-timing contract and reflect it here: the Commitment Card fires at the first personalization/goal question; the Perceived Effort Delay Card fires at plan/result generation; the Intent Mirroring Card fires after first value and immediately before the paywall (never on the paywall screen itself or any cancel flow); the native App Review popup fires at or just after the emotional peak. These moments belong in `EMOTIONAL_DESIGN.md`'s Card Application Map with a PostHog event each, and the onboarding curve must cross positive before the paywall.

Recommended Refero searches when access is available:

- `refero_search_flows`: `signup onboarding`, `subscription onboarding paywall`, `permission request onboarding`, `subscription cancellation with retention offer`, `restore purchases`
- `refero_search_screens`: `ios onboarding progress question`, `ios paywall annual weekly lifetime`, `ios restore purchases settings`, `web pricing annual monthly toggle`
- `refero_get_flow` for 2-4 strongest flows, then summarize step count, friction, recovery, and system response in `UX_PATTERNS.md`

## Out-Of-Box Attribution Data Contract

Self-reported attribution is a data contract, not a screen. Every B2C app with onboarding, signup, waitlist, account creation, or a launch funnel must include self-reported attribution unless `product/ONBOARDING.md` and `analytics/ANALYTICS.md` explicitly mark it not applicable with a reason.

Placement:

- Show a visible, required "How did you hear about us?" screen after the value promise/demo is clear but within the first third of onboarding or signup.
- Do not bury attribution after long product, developer, or settings questions.
- Do not satisfy this requirement with analytics documentation alone; the rendered onboarding proof and implementation must show it.

Default source taxonomy, adjustable by product:

| stored_key          | display label            |
| ------------------- | ------------------------ |
| `friend`            | Friend or word of mouth  |
| `tiktok`            | TikTok                   |
| `instagram_reels`   | Instagram or Reels       |
| `youtube`           | YouTube                  |
| `x_twitter`         | X / Twitter              |
| `reddit_search`     | Reddit or search         |
| `app_store_search`  | App Store search         |
| `play_store_search` | Google Play search       |
| `creator`           | Creator link or video    |
| `podcast`           | Podcast                  |
| `ai_search`         | AI answer or chat search |
| `ad`                | Ad                       |
| `other`             | Other                    |

Implementation definition of done:

- Every option has a stable stored key. Display labels may change, but stored keys must remain stable for dashboards.
- `other` includes a free-text or follow-up field, with a product-appropriate max length, trim/sanitize behavior, and privacy copy that avoids sensitive data.
- The selected source is emitted as `attribution_source_selected` with `source_key`, `source_label`, `other_text_present`, `flow_id`, `step_id`, and technical context such as UTM/referrer/deep-link/referral code when available.
- The selected source is set as PostHog person properties: `self_reported_source`, `self_reported_source_label`, `self_reported_source_other_text_present`, and `self_reported_source_captured_at`. Store raw `self_reported_source_other` only when the privacy plan allows it.
- The selected source is persisted to the backend profile, waitlist, account, or Supabase profile record when identity exists. Use fields such as `self_reported_source`, `self_reported_source_label`, `self_reported_source_other`, `self_reported_source_captured_at`, and `self_reported_source_context`.
- Anonymous attribution is reconciled into the identified user after signup/login instead of being stranded on an anonymous event stream.
- If there is no backend/profile persistence path yet, mark attribution as blocked in `engineering/PRODUCTION_READINESS.md` with the exact missing backend contract; do not call it complete.
- Unit, UI, or live smoke tests prove selection, event delivery, PostHog person-property update, and backend/profile persistence where those surfaces exist.

Do not describe attribution as "wired", "complete", or "launch-ready" if it only updates local state or emits a one-off event. It is wired only when the source is represented by a stable key, forwarded to analytics, attached to the person/profile identity, and persisted to the app backend once identity exists.

## Conversion Patterns

### Cold-Launch / Splash Entrance

Before any onboarding question, mascot, or demo, most apps need a genuine cold-launch moment: a hold while fonts, images, or first data load, then either a hard cut or an authored dissolve into the first real screen. This is a distinct beat from the onboarding sequence itself — it has no question, no copy decision, and no paywall stake — so its acceptance criteria live in [`motion-craft-benchmarks.md`](../design/motion-craft-benchmarks.md)'s R11–R14 (splash hold-and-cut, staggered multi-asset entrance, honest loader state-switch and skeleton reveal, paged cold-open with a deterministic final state), not in this file's screen-sequence contract below.

Do not invent an entrance the product has no real content for: a product with no distinct cold-launch moment renders its first real screen immediately, per R14's restraint. When a cold-launch sequence exists, name the recipe it follows (R11–R14) in `product/ONBOARDING.md`'s screen-sequence row for that screen instead of describing it as a generic "fade in."

### Mascot Or Guide

Use a mascot when the product benefits from warmth, reassurance, habit b2c, play, coaching, or repeated progress. The mascot should:

- react to answers and progress
- soften friction without hiding cost, privacy, or limitations
- have 4-8 reusable emotion states before implementation
- be generated or refined with Higgsfield against `DESIGN.md`
- appear in HTML proofs before app implementation

Do not use a mascot when it makes a serious, regulated, or high-stakes product feel unserious.

### Short Demo Video

Use a short looping product demo to answer "what does it actually do?"

- keep it under 15 seconds unless there is a specific reason
- show the actual product state or a truthful prototype, not abstract feature bullets
- center the aha moment
- design for muted playback with captions or visible UI states
- generate/refine clips with Higgsfield Seedance 2.5 (or the newest Seedance available) or Marketing Studio when no real capture exists
- score finished ad/demo clips with Higgsfield Virality Predictor when used for paid/social acquisition

### Data Collection

Ask questions only when the answer changes personalization, attribution, segmentation, lifecycle messaging, or product setup.

- common inputs: goal, current state, frequency, biggest obstacle, timeline, confidence, desired outcome, constraints, source/attribution
- for plan-builder apps, 8-15 short questions can work when each answer is reflected back in a personalized plan
- for utility apps, keep the sequence shorter and reach the product quickly
- always include an attribution question early enough that users remember the answer
- do not collect sensitive categories unless the product genuinely needs them and privacy terms cover them

### Commitment Funnel

Load [`commitment-funnel.md`](commitment-funnel.md) before locking first-session screen order when `product.yaml` records `feature.commitment-funnel` as required. When that feature is excluded or a non-goal, do not add a quiz or hard paywall to satisfy a gate. When the instance is absent, hold.

The first two minutes run this sequence when the feature is required:

1. welcome
2. quiz or goals
3. micro-commitment with a skip path
4. personalized insight
5. hard paywall

Do not treat trial starts as done.
Record onboarding complete, install-to-trial, trial-to-paid, drop-off, and refund rate.

Load [`paywall-goal-headline.md`](paywall-goal-headline.md) after quiz or goals when `feature.paywall-goal-headline` is required and the declared present-paywall owner can bind it.
The selected goal writes `paywall_headline_key`.
The paywall interpolates only that key.
A skipped goal uses the fallback template.
When the feature is excluded or a non-goal, omit that bind.
When the instance is absent, hold.
A producer sentence that the bind is not applicable cannot override a required feature.

Ethics vetoes:

- a pledge without a skip path
- a hold-to-confirm that looks like a system dialog
- fake scarcity
- a progress animation over nothing

## Evidence contract

Use current official policy and provider documentation first, followed by implementation truth, reliable product data, direct research, current first-party reviews, disclosed-method quantitative work, direct flow observation, original practitioner sources, and secondary commentary.

Classify each recommendation as platform requirement, evidence-backed guidance, benchmark, direct user finding, competitor pattern, practitioner heuristic, product hypothesis, or experiment question. Record source, date, market, version, method, confidence, and implication.

Competitor review analysis separates onboarding, expectation, monetization, identity, lifecycle, core product, support, platform limitation, and insufficient evidence. Never present sample frequency as population prevalence. Never onboarding-wash a product defect.

Onbo Hub is authorized access only. Revenue estimates remain estimates. Record screens reviewed, effort, first-value class, account, permissions, paywall, trial, restore, close, accessibility, trust, and related positive and negative review evidence.

For subscription products, refresh the full relevant RevenueCat surface: SDK, products, packages, offerings, placements, entitlements, identity, paywalls, targeting, experiments, Funnels, Web, Purchases.js, purchase links and buttons, Billing, Stripe, Paddle, Redemption Links, Customer Center, webhooks, analytics, lifecycle, refunds, grace, pending purchases, restore, and newer official capabilities. Separate technically possible, policy permitted, and recommended by platform and region.

Use the 60fps MCP with `search_shots`, `get_shot`, `get_motion_breakdown`, and `get_related_shots` only when studio `interaction` is `bespoke-motion` or `scroll-linked` (or landing source already implements scroll-linked hooks) and `strategy/TOOL_DECISIONS.md` records that MCP as ready. A blocked or fallback route is a hold, not an equivalent distilled recipe. Static legal or conversion surfaces without that selection do not invent shot IDs. Translate interaction principles, never another product's brand, assets, copy, exact layout, or implementation.

Audit the seven-principle heuristic: define activation, show value before disproportionate effort, ask only useful questions, keep one dominant action, use purposeful motion, show visible personalization, and finish with meaningful value in a populated normal product state. Record pass, partial, or fail with evidence, not a fake score.

## Product and architecture contract

First value rendered, first value engaged, activation, retention, monetization, review eligibility, and onboarding completion are distinct. A render is not activation. First value must be real, understandable, actionable, persistent, recoverable, and connected to the acquisition promise.

Every required question identifies the behavior it changes and the screen where the user sees personalization proof. Every required effort has an explicit value exchange. A name inserted into generic copy is not personalization.

Separate identity, journey, profile completeness, activation, entitlement, experiment assignment and exposure, review eligibility, permission and consent, and lifecycle state. Define authoritative owner, persistence, transition trigger, event, idempotency, retry, failure, compensation, and consumers. Support anonymous-to-authenticated linking, purchase before account, web-to-app redemption, reinstall, cross-device, restore, entitlement delay, interrupted journeys, churn, win-back, and identity collision without repeating successful work.

Analytics uses one machine-readable schema and typed clients. Distinguish client interaction, backend-confirmed product outcome, provider-confirmed monetization, and derived metrics. One business outcome has one authoritative emitter. Define event IDs, identity stitching, offline queueing, ordering, deduplication, replay, webhook idempotency, experiment exposure, privacy, and expected event-sequence tests. Analytics failure never blocks first value.

Earn review eligibility after real value and engagement. Request through native platform APIs outside first-run onboarding at a later natural success. No custom star screen, sentiment gate, incentive, or happy-user routing. Record only observable eligibility, suppression, request attempt, and API return facts.

Request protected permissions only after a user action with visible benefit. Define denial, limited access, retry, settings, privacy, and fallback. One lifecycle strategy owns onboarding recovery, progressive profiling, trial, post-purchase activation, habit, billing recovery, dormancy, churn, and win-back suppression.

Compare architecture models using conversion, retention, first-value fidelity, file or image needs, resume, identity, experimentation, analytics, policy, economics, accessibility, localization, latency, offline behavior, operations, and lock-in. Different acquisition surfaces may render differently but converge on one semantic state graph.

## Design and delivery contract

### Cold-Launch / Splash Entrance

Before any onboarding question, mascot, or demo, most apps need a genuine cold-launch moment: a hold while fonts, images, or first data load, then either a hard cut or an authored dissolve into the first real screen. This is a distinct beat from the onboarding sequence itself — it has no question, no copy decision, and no paywall stake — so its acceptance criteria live in [`motion-craft-benchmarks.md`](../design/motion-craft-benchmarks.md)'s R11–R14 (splash hold-and-cut, staggered multi-asset entrance, honest loader state-switch and skeleton reveal, paged cold-open with a deterministic final state), not here.

Do not invent an entrance the product has no real content for: a product with no distinct cold-launch moment renders its first real screen immediately, per R14's restraint. When a cold-launch sequence exists, name the recipe it follows (R11–R14) in `product/ONBOARDING.md`'s screen-sequence row for that screen instead of describing it as a generic "fade in."

Every screen and control has a stable semantic ID. Specify exact copy keys, hierarchy, states, local and canonical mutations, API or provider action, idempotency, analytics, navigation, repeated taps, errors, retries, offline and interruption behavior, accessibility, localization, haptics, motion, and reduced-motion behavior.

Produce actual high-fidelity design and an interactive prototype. Contract HTML is not visual design. Cover trial eligibility, packages, restore, existing subscriber, unavailable product, offline, pending, canceled, failed, success, delayed entitlement, web handoff, and regional variants. Motion clarifies state and never disguises latency.

Use a mascot when the product benefits from warmth, reassurance, habit b2c, play, coaching, or repeated progress. The mascot should:

- react to answers and progress
- soften friction without hiding cost, privacy, or limitations
- have 4-8 reusable emotion states before implementation
- be generated or refined with Higgsfield against `DESIGN.md`
- appear in HTML proofs before app implementation

Define behavior and observability for termination, network loss, slow or malformed generation, upload failure, analytics or config outage, provider outage, pending purchase, delayed webhook, restore or redemption failure, deep-link failure, identity collision, unsupported client, and review API unavailability.

The implementation plan maps every screen, control, state, event, provider configuration, test, and removal item to exact repository paths, dependencies, acceptance criteria, deletion, roll-forward behavior, parallel safety, and owner.

Replacement mode uses hard cutover: freeze changes to the replaced system, build and verify the target, rehearse the one-time transformation, enforce a minimum client when required, cut traffic, verify production, delete every old runtime and configuration surface, delete transformation tooling, run a repository-wide removal-inventory search, and roll forward on defects. Do not keep the old runtime as a standing fallback.

Use a short looping product demo to answer "what does it actually do?"

- keep it under 15 seconds unless there is a specific reason
- show the actual product state or a truthful prototype, not abstract feature bullets
- center the aha moment
- design for muted playback with captions or visible UI states
- generate/refine clips with Higgsfield Seedance 2.5 (or the newest Seedance available) or Marketing Studio when no real capture exists
- score finished ad/demo clips with Higgsfield Virality Predictor when used for paid/social acquisition

## Completion

The lane cannot be done until `ONB-00` through `ONB-22` are done, `product/ONBOARDING.md` carries the joined decisions and implementation checks, actual design and prototype artifacts exist, analytics and provider contracts reconcile, review behavior is policy safe, and replacement mode leaves only the target runtime and removes transformation tooling.

Run `checks/validation/business/experience/check-onboarding-graph.ts` before any readiness claim.

The plan summary should reflect the user's own answers back to them. This is not magic personalization; it is commitment and clarity.

Attribution answers should be treated as first-class launch learning:

- ask while the user still remembers the source
- keep answer keys stable even if display copy changes
- use a typed enum or equivalent constants for stored keys instead of storing display labels
- include `other` free text or a follow-up field rather than making "Other" a dead-end bucket
- map creator, referral, social, search, App Store/Play search, ad, email/newsletter, AI answer, and word-of-mouth sources separately where useful
- pair the self-reported answer with technical UTMs/referrer/deep-link/referral-code context in PostHog
- persist the answer to the backend/profile record and reconcile anonymous answers after identify/signup
- avoid using the answer to make unsupported public claims about channel performance without enough volume

### App Review Popup After First Value

For apps with onboarding, the native App Review popup is part of onboarding by default. It belongs immediately after the first value moment: the first personalized plan, analysis, demo result, aha moment, or other value-reveal screen the user can actually judge.

Do not leave the review prompt as a vague later lifecycle idea. `product/ONBOARDING.md` must show the sequence: value promise/demo -> useful questions -> first value/value reveal -> App Review popup eligibility/request -> paywall or activation. If a product truly has no first-value moment in onboarding, record that as an experiment or blocker instead of silently dropping the prompt.

**Canonical placement — value-reveal screen, automatic trigger:**

- Fire the native review request automatically after the value-reveal screen is fully displayed (plan, analysis, demo result, or aha moment is visible on screen), with a 1-2 second async delay so the screen remains mounted and visible.
- Do not fire on the user's acceptance tap or on any button that causes the screen to dismiss or navigate away. Binding the trigger to a tap that tears down the current screen creates a teardown race: the view may be deallocated before the review sheet can present.
- Do not fire on the paywall screen or after the paywall is shown; the user must see the value first.

Rules:

- iOS: use Apple's native review request API path (`SKStoreReviewController.requestReview` or `requestReview(in:)`); do not build a custom App Store review prompt or incentive.
- Android: use Google Play In-App Review API, do not alter the review card, and do not ask opinion/predictive questions before showing it.
- never reward, unlock, or discount in exchange for a rating or review
- assume the platform may choose not to show the prompt; keep the onboarding flow functional with or without the sheet appearing
- log prompt eligibility, request attempt, and post-prompt continuation without trying to infer private rating content
- record `review_prompt_eligible` before requesting, `review_prompt_requested` when the native API is called, the cooldown/frequency cap, and the fallback continuation when the sheet is suppressed

### Paywall Timing

Show value before the paywall whenever possible:

- reveal a personalized plan, analysis, preview, demo result, or clear "next unlocked step"
- after that insight, use a hard paywall; see [`commitment-funnel.md`](commitment-funnel.md)
- choose hard paywall when time-to-value is fast, marginal serving cost is high, and free users do not drive network effects
- choose soft paywall/freemium when free usage drives word of mouth, marketplace/network value, UGC inventory, or longer trust-building
- use RevenueCat offerings/experiments rather than hardcoded product IDs
- keep restore purchases visible and recovery-friendly

RevenueCat 2026 data supports testing hard paywalls seriously: hard paywall apps show much higher Day 35 download-to-paid conversion than freemium, but the right choice still depends on product dynamics and acquisition strategy.

### Held Value Reveal

The strongest pre-paywall moment for analysis/result products runs the magical moment and holds the reveal: the user submits real input (a photo, a video, a plan request), the app runs the **real** computation with an honest progress state, and the personalized result unlocks at the paywall. By the time the price appears, the user has invested input and is waiting on an answer about themselves — that is engineered suspense on top of genuine value, and it converts far better than a cold paywall after setup questions.

Rules that keep it honest:

- the computation must actually run; a progress animation over nothing is deception, not suspense (see Rejected Tactics in `influencer-sponsorship-engine.md`)
- offer a visible skip path for users who want to defer the demo input
- the held result must be delivered in full immediately on purchase or trial start
- this is the Perceived Effort Delay Card operating at the paywall boundary — when the 6-star+ card contract applies, map it in `EMOTIONAL_DESIGN.md`
- instrument with the approved catalog: `personalized_plan_viewed` (or the value-reveal equivalent), `paywall_viewed`, and the paywall variant dimension; add any new event name to `analytics/ANALYTICS.md` first

### Closing Offer Or Reverse Trial

Treat paywall close as a second conversion moment:

- test a transparent downsell, shorter commitment, trial, intro offer, or reverse trial after dismissal
- avoid fake scarcity, manipulative roulette, surprise billing, or unclear renewal terms
- if discounting, disclose standard price, renewal price, duration, cancellation, and eligibility
- track dismiss, offer shown, offer accepted, offer rejected, and later conversion

RevenueCat's 2026 report calls the moment after paywall dismissal a high-leverage conversion point; encode it as an experiment, not a one-off trick.

### In-App Visual Assets (Paywall Hero, Illustrations, Empty-State, Celebration)

Route generated art by surface:

- **Paywall hero / background art** — use `soul_location` (environment/scene, prompt-only) or `gpt_image_2` via the `higgsfield-generate` skill. These are decorative backgrounds embedded in HTML proofs; they are never substitutes for real app UI.
- **Onboarding illustrations, empty-state art, and celebration frames** — use the `higgsfield-generate` skill. Every prompt must carry `DESIGN.md` tokens (palette, type mood, shapes, texture, banned aesthetics, intended surface); generating without the brief is a named failure mode.
- **Direction iteration before committing production-model credits** — route through the **Cheap-First Direction** recipe in `tool-recipes/visual-and-motion-production.md`. Per that recipe's Rule-5 reconciliation, cheap-first is offered as a spend-reduction option at the `paid-tool-routing.md` spend-confirmation prompt — never applied silently.

Guardrails:

- Generated art is decoration embedded in HTML proofs; it is **never** a substitute for truthful real app UI in store screenshots or product claims.
- Spend-confirmation applies before every generation run; confirm with the founder per `paid-tool-routing.md` and surface current balance when possible.
- Record every generated asset in `CONTENT_ASSETS.md` with route, prompt brief (`DESIGN.md` tokens used), output paths, QA, and approval gate.

### Plan And Trial Mix

Default candidate package set for subscription apps:

- weekly or monthly entry plan depending on category norms
- annual plan highlighted as recommended when retention and cost structure support it
- lifetime only when support costs, AI costs, and long-term liability are sustainable
- trial length tested against product cost and learning speed; do not default to very short trials without a reason

RevenueCat 2026 benchmarks show longer trials can convert better, but shorter trials can improve experiment velocity and cash-flow feedback. Pick an initial hypothesis, then test with RevenueCat experiments or an equivalent feature flag.

**Trial placement steers plan mix.** Where the trial sits is a lever independent of its length: attaching the free trial to the annual plan only funnels trial-seekers into the annual package and pulls a year of cash forward on conversion instead of one month — a major cash-flow accelerant for bootstrapped launches (see `paywall-pricing-and-experiments.md` §1). It is a legitimate structure when the renewal price, term, and cancellation are disclosed clearly on the paywall; treat it as a plan-mix experiment, not a default.

**Paid intro offers as a free-trial alternative.** The 2026 report flags a structural shift: paid intro offers (e.g. `$0.99` for the first month/week, then auto-renewing to full price) are increasingly replacing free trials because they create commitment, reduce trial abuse, improve early cash flow, and often convert at higher quality. Context to calibrate against, not copy blindly: only ~9.3% of apps currently use promotional offers, yet ~30% of new subscribers (median) enter through an intro discount — and reliance is inverted by scale (hobby-tier apps often run 65–99% of new subs through intro offers, while top performers rely on them for ~0–10%). Treat a low-priced paid intro as one candidate alongside a free trial in the plan-mix hypothesis, disclose the renewal price/terms clearly (see `paywall-pricing-and-experiments.md` §2), and avoid building a business that _depends_ on permanent heavy discounting. This is a founder-approved pricing decision (`revenue-monetization.md` §2).

### Conversion Anti-Patterns

Name the cozy defaults that feel safe and quietly lose. These are the onboarding/trial entries in the monetization-and-growth digest in [`revenue-monetization.md`](../money/revenue-monetization.md) §3; figures are from the **RevenueCat State of Subscription Apps 2026** report. Treat each as a strong default to test, not dogma — the anti-pattern is reaching for the comfortable choice by reflex.

**3. Default to a 3-day / short trial because "urgency converts."** Trials of ≤4 days convert to paid at ~25.5%, vs ~37.4% at 5–9 days and ~42.5% at 17–32 days — yet ~46.5% of apps still ship trials of 4 days or less. Short trials manufacture pressure but cut conversion; longer trials let the user reach real value before deciding. Do not pick the short trial by default (see Plan And Trial Mix above: "do not default to very short trials without a reason"). Set a trial-length hypothesis and test it; shorter trials are a deliberate choice for faster learning or cash-flow feedback, not a reflex.

**4. Ignore the first session and bank on a day-30 win-back email.** ~78–90% of trials start on Day 0 (Business ~89.9%, Health & Fitness ~82.1%, Productivity ~78%), and ~55% of 3-day-trial cancellations happen on Day 0 — before any day-30 win-back email could ever send. The beautifully written re-engagement email reaches a user who already churned. Win or lose the user in the first session: the onboarding flow must prove value, explain billing clearly, and route to the first activation task on Day 0 (see `paywall-pricing-and-experiments.md` §1). Win-back email is a supplement, never the plan.

**10. Run one paywall experiment a year and call it focus.** Testing a button color in March is not an experimentation program. RevenueCat 2026 guidance: lift comes from running smaller, parallel experiments across _when_ the paywall appears and _what_ it offers — keeping a true control and judging outcomes on cohort LTV, refunds, and early churn — not a once-a-year tweak. Stand up a continuous experiment cadence with RevenueCat Experiments or an equivalent feature-flag/holdout setup; "staying lean" by never testing is the trap, and it quietly loses to teams that test their headline and timing repeatedly.

## Analytics Events

Add these to `analytics/ANALYTICS.md` before implementation:

- `onboarding_started`
- `onboarding_step_viewed`
- `onboarding_answer_selected`
- `attribution_source_selected`
- `demo_video_viewed`
- `personalized_plan_viewed`
- `review_prompt_eligible`
- `review_prompt_requested`
- `paywall_viewed`
- `paywall_dismissed`
- `closing_offer_viewed`
- `closing_offer_selected`
- `trial_started`
- `purchase_completed`
- `entitlement_active`
- `restore_started`
- `restore_succeeded`
- `onboarding_completed`
- `activation_task_completed`

Include dimensions: step_id, answer_key, attribution_source, source_key, source_label, other_text_present, demo_id, mascot_state, paywall_variant, offering_id, package_id, trial_state, platform, campaign/source/medium, and error_state.

**Event naming rule — cross-check before proposing:** Any onboarding event name not in the approved catalog above must be verified against `analytics/ANALYTICS.md` before being proposed or implemented. Do not invent new event names (e.g. first-use coach events, tutorial events) without first checking whether `analytics/ANALYTICS.md` already defines an equivalent. If no equivalent exists, add the candidate name to `analytics/ANALYTICS.md` explicitly before referencing it in implementation docs or code. Invented event names that bypass this step create permanent dashboard schema drift.

## Gates Before Build Handoff

- `product/ONBOARDING.md` exists and maps every question to a real use.
- `product/ONBOARDING.md` references `11_STAR_EXPERIENCE.md` and shows where the complete product experience appears.
- `design/design-room.html` or the design-proof artifacts recorded in `product/ONBOARDING.md`'s Prototype And Design Proof section render the full onboarding/paywall/review/closing-offer path (`product/onboarding.html` is the generated canonical record, not the visual proof).
- Higgsfield asset plan exists for mascot, icons, demo video, screenshot frames, and animations when visuals are not already final.
- If Higgsfield is unavailable, the founder confirmed the free/local visual fallback and limitations are recorded.
- `growth/EMAIL_OPS.md` covers any onboarding resume, welcome, trial, payment recovery, or win-back emails triggered by the flow.
- App Review popup is inside onboarding immediately after first value/value reveal, uses the native platform API, is not incentivized, auto-triggers after the value-reveal screen mounts with a 1-2s delay, and is not bound to an acceptance tap or to any navigation action that dismisses the screen.
- Paywall placement, product IDs, offerings, prices, trial, and closing offer match `revenue/REVENUE_OPS.md`.
- Privacy/terms links and data-use explanations match the data collection matrix.
- Analytics events are named before implementation, and every proposed event name is present in `analytics/ANALYTICS.md`; no event name is invented during implementation without a prior `analytics/ANALYTICS.md` entry.
- `analytics/analytics-plan.html` shows the onboarding and paywall funnel before build handoff.
- Self-reported attribution passes the data contract: early visible screen, stable source keys, `other` free text, analytics event, PostHog person property, backend/profile persistence, anonymous-to-identified reconciliation, and verification evidence.
- Onboarding, paywall, and closing-offer copy passes the `no-slop-writing.md` self-check (§6) in the product's `strategy/BRAND.md`/`11_STAR_EXPERIENCE.md` voice.

## Research and instrumentation acceptance

Use [onboarding foundations](onboarding-foundations.md) for the staged evidence
contract. Research must change documented decisions, identity and consent precede
the event contract, and the first runnable prototype has instrumentation. Final
acceptance requires current runtime traces and collector proof, not only an event
list, provider setup, a completed questionnaire or attractive static screens.
