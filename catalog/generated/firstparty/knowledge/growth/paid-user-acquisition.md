# Paid User Acquisition

Use this before planning paid ads, Apple Search Ads, Meta/TikTok/Google campaigns, web-to-app paid traffic, custom product page campaign routing, paid creative tests, MMP/ad-network SDK choices, or any launch claim that the app is ready to spend on acquisition.

This reference factors in RevenueCat's May 2026 article, "How to build a UA system when you're a one-person team": https://www.revenuecat.com/blog/growth/how-to-build-a-ua-system-when-youre-a-one-person-team. Treat it as a practical solo-founder operating model, not universal law. The transferable shape is small, complete, measurable, and cadence-driven: one channel, creative production, tracking, and schedule.

Paid spend is a founder-only gate. Agents may prepare the system, docs, creative plan, dashboards, and stop/scale rules, but must not launch campaigns, connect ad accounts, change budgets, create paid trials, or commit spend without approval.

Load [`paid-tool-routing.md`](../operations/paid-tool-routing.md) before replacing paid ASO/MMP/ad tools, ad-network accounts, RevenueCat paid features, PostHog paid features, or App Store/Play/Google/Meta/TikTok account data with free or manual reporting. Load `analytics-attribution.md`, `revenue-monetization.md`, and `app-store-listing-prep.md` when paid UA touches tracking, LTV/CPA, store conversion, screenshots, or ad creative. Update `CONTENT_ASSETS.md`; load `remotion-content-assets.md` when Remotion-rendered ad creative or repeatable variants are involved.

Load `localization-market-research.md` before choosing Apple Search Ads or paid storefronts/geos: the target countries come _from_ the `LOCALIZATION_MARKET_RESEARCH.md` priority tiers (keyword popularity, difficulty, demand per storefront), not from wherever the app happens to be available. Spending into a market with no demand evidence or no localized paywall is the same translate-first mistake in paid form.

## Contents

- Fit Gate
- One-Channel Choice
- Creative Production System
- Tracking And Baseline
- Blended Report
- Weekly Schedule
- Stop And Scale Rules
- Draft Status And Kill Window
- Founder-Only Gates
- Outputs
- Common Failure Modes

## Fit Gate

Paid UA is plausible when:

- the app has a real store/beta/web destination that can accept traffic
- onboarding and paywall flow can convert paid visitors without contradicting store, privacy, or subscription copy
- RevenueCat or the approved subscription source can show LTV, trial starts, cohorts, and entitlement truth
- analytics can distinguish landing/store clicks, installs or opens, onboarding, paywall reach, purchase/trial, entitlement activation, and retention
- the product has at least 3-5 truthful creative angles tied to the 11-star accepted product experience
- the founder has approved a test budget and account access path

Defer or reject paid UA when:

- store pages, privacy/terms, support, pricing, or purchase validation are not ready
- no baseline period exists for RevenueCat, App Store Connect, PostHog, and self-reported attribution
- the launch cannot absorb traffic because onboarding, paywall, restore, support, or crash/error monitoring is weak
- the only plan is "try ads" without a channel, creative cadence, target event, dashboard, and stop rule
- paid spend or ad-account access is unapproved

Record the fit decision in `PAID_UA.md`, update `state/business-state.json` `lanes.paid_user_acquisition`, and trace the decision into `state/LAUNCH_TRACE.md`.

## One-Channel Choice

Start with one paid channel. Do not launch Meta, TikTok, Google, and Apple Ads at the same time unless the founder has a team or explicit reason to absorb separate creative, reporting, account-management, and attribution costs.

Default channel choice:

- **Meta Ads**: default first channel for many subscription apps when the ICP is broad enough and the product can produce varied visual/pain-point creatives.
- **TikTok**: consider when the buyer is younger, the product has strong native video hooks, and the launch can refresh creatives faster.
- **Google web-to-app**: consider when search/demand capture or web funnels matter and the app can preserve campaign context into checkout or install.
- **Apple Ads**: consider when search intent is clear, keyword economics are plausible, and App Store listing/custom product pages are ready.

Sequencing against creator sponsorships: hand-negotiated creator deals (`influencer-sponsorship-engine.md`) are typically the higher-multiple channel at small budgets, while ad platforms return lower multiples but scale without per-deal effort. When sponsorships have proven the demo moment and payback economics, their winning creative and creators become the seed for the first paid channel — including paying one proven creator to make ads directly rather than posting to their own page.

Document:

- selected channel and why
- rejected channels and why now is too early
- target event: usually trial, direct subscription, paywall-qualified event, or another high-intent proxy; avoid install-only campaigns as the main growth pillar unless the launch explicitly uses them for creative testing
- campaign destination: store listing, custom product page, web funnel, landing page, or web purchase link
- founder-approved budget cap and date range, or blocker if not approved

When the campaign destination is a custom product page, load [`surfaces-b2c.md`](../design/surfaces-b2c.md) for Apple's CPP/PPO/In-App Event numeric ceilings and [`design-room.md`](../design/design-room.md) before committing spend. Model the CPP as a real surface in the screen map, update `DESIGN.md`, render the Design Room, and retain the revision in Git. It is not a campaign-only asset.

## Creative Production System

Before spend, define the first creative batch:

- before drafting ad headlines or primary/body text, load `knowledge/words/no-slop-writing.md` — its §7 covers ad headline/primary-text limits; verify current platform character limits via the `ad-creative` skill or platform docs, and lead with the concrete benefit or hook, not a throat-clearing opener
- 3-5 new assets per week for an early solo cadence
- one ad group or equivalent simple structure for the first test
- angle map: pain, aspiration, identity, objection, comparison, proof, result, or use case
- product visibility: real app UI, store screenshot, app-flow recording, Remotion render, or approved generated/supporting asset
- copy and claim constraints from `APP_STORE_LISTING.md`, `trust/PRIVACY.md`, `trust/TERMS.md`, `revenue/REVENUE_OPS.md`, and `trust/SECURITY.md`
- each creative tied to `11_STAR_EXPERIENCE.md`, `CONTENT_ASSETS.md`, and `state/LAUNCH_TRACE.md`

Use `remotion-content-assets.md` when repeatable ad variants, motion screenshots, captions, cutdowns, or local render proof are needed. Use Higgsfield only after design-system constraints and paid-tool routing are recorded. Use real app UI wherever a user must inspect the actual product. Before any creative is scored or spent on, run it through [`quality-lens.md`](../design/quality-lens.md)'s Anti-Generic Checks — design-token compliance and a `brain_activity` virality score both pass a generic, off-brand, or overclaiming asset; taste is the check neither of them performs.

**Competitor ad-library mining.** Before inventing angles, mine the platform's public ad library (Meta Ad Library for Meta/Instagram) for the incumbent and adjacent apps: filter for ads with high impressions and long run time — nobody keeps paying for an ad that does not return — and for each winner ask why it works and how the structure maps to this app's truthful claims. Replicate the angle and structure with this app's real UI and claims, never the competitor's assets, footage, or claims verbatim. Authentic low-production formats frequently outperform polished ones; test them before assuming production value is the constraint. Record mined angles in the angle map above.

Load [`non-competitor-angle-discovery.md`](non-competitor-angle-discovery.md) before the first paid creative batch. Direct competitor ads are not enough. Hunt print, cross-niche, Ad Library adjacent, and second-profile sources. Expand the same ICP with a new motivation after the primary profile saturates. At least one adopted angle must be original under a competitor-wrong / logo-swap test.

### Higgsfield Creative Production

Before generating any Higgsfield asset: confirm spend with the founder per `paid-tool-routing.md`, carry `DESIGN.md` tokens (palette, type mood, shapes, texture, motion energy, banned aesthetics, surface) in every prompt, and record every output in `CONTENT_ASSETS.md`.

**Routed recipes** (bodies in `tool-recipes/visual-and-motion-production.md` — do not re-copy here):

- **App Store URL → UGC Ad Batch (Click-to-Ad)** — webproducts fetch → avatar pick → parallel mode batch → score → save winners → founder approval.
- **Virality Closed Loop** — generate → score → decision rules → iterate → record → paid distribution only after a score is recorded.
- **Cheap-First Direction** — z_image drafts → pick direction → production model → founder selects. Apply only when presented as a spend-reduction option at the spend-confirmation prompt; never silently.

**DTC static-ad batch path.** Browse available formats first (`higgsfield marketing-studio ad-formats list`), then:

```
higgsfield marketing-studio dtc-ads generate --format-id <id> [--brand-kit-id <id>] [--batch-size 1..20]
```

`--format-id` is mandatory. `--brand-kit-id` requires a prior paid brand-kit fetch — confirm spend before running.

**Hook A/B protocol.** Before committing to a production run, test breadth before depth: run 4 hooks × 1 mode first to find the winning hook, then 1 hook × 4 modes to find the winning mode. Score each variant with `brain_activity` before expanding.

**Click-to-Ad `--url` note.** The `--url <app-store-url>` shortcut bypasses brief injection — `DESIGN.md` tokens are NOT carried automatically. Always inject them explicitly into `--prompt`.

**Win-back / re-engagement creatives.** For lapsed-user campaigns, generate `marketing_studio_video --mode product_review` ads with "do you miss X" hooks, plus `product-photoshoot --mode lifestyle_scene` static re-engagement visuals; score the video with `brain_activity` before allocating any spend. Record `virality_score` and `hook_dmn_risk` in `CONTENT_ASSETS.md` before distributing.

## Tracking And Baseline

Finish the tracking baseline before the first paid dollar. Record this as **MMP Before Spend** in `growth/PAID_UA.md`.

Load `appsflyer-mmp.md` when paid UA is in scope.

AppsFlyer is the default MMP on that path.
Set `$appsflyerId` on RevenueCat before trial or purchase.
A founder MMP waiver is required for any other stack.
A founder MMP waiver must be a dated table with founder identity, named stack, and approval state approved.
`check:paid-ua` fails a spend-ready lane that lacks the bridge and has no waiver.

Do not treat a network SDK plus RevenueCat plus a blended sheet as spend-ready by itself.

Decide the rest of the tracking stack from current product phase:

- RevenueCat for LTV, cohorts, subscription events, trial starts, purchase state, and entitlement truth
- selected ad-network SDK or native reporting when the channel requires it
- App Store Connect or Google Play Console for store/source signals
- PostHog for product analytics, identity, attribution, funnels, and dashboards
- a simple spreadsheet or `growth/paid-ua-report.csv` for the blended weekly report

Create a baseline before campaign launch:

- RevenueCat daily trials, purchases, revenue, cohorts, and LTV
- App Store Connect or Play installs/product page views where available
- PostHog events from app open through onboarding, paywall, purchase, entitlement, activation, and retention
- self-reported attribution answers from onboarding/signup/waitlist
- current organic/social traffic notes so uplift is not confused with paid performance

For iOS, document that ad-platform attribution can under-report or over-report. Use baseline uplift across RevenueCat, ASC, PostHog, and self-reported attribution instead of pretending attribution is perfect.

## Blended Report

Create a weekly report that lets the founder decide whether to continue, pause, or scale. When the paid UA lane is done, `check:paid-ua` requires the report file to actually look like one — a header naming spend plus downstream economics (CPA/LTV/revenue/ROAS/payback) and at least one data row; an empty or stub file fails the gate.

Minimum columns:

- date
- channel
- campaign
- spend
- impressions
- clicks
- installs or app opens
- onboarding starts
- paywall views
- trial starts
- purchases
- entitlement active count
- revenue
- RevenueCat LTV window
- CPA or cost per trial/direct subscription
- blended ROAS or projected payback
- winning angle
- virality_score (brain_activity overall)
- hook_dmn_risk (Default Mode risk from brain_activity)
- notes and next action

The report should compare paid traffic against organic baseline and category benchmarks where available. It should be good enough to catch product-side drop-offs, not only media-buying changes.

## Weekly Schedule

Use a calm twice-weekly operating cadence for low-budget tests instead of reactive daily edits:

- Monday: refresh campaign and blended report, compare against previous week, decide pause/keep/scale candidates, and choose one paywall/onboarding test hypothesis.
- Tuesday: plan and produce the next 3-5 creative assets from winning or unresolved angles.
- Wednesday: check early creative delivery, pause older non-spending or clearly weak assets only when there is enough signal, and upload 1-2 replacements.
- Thursday: quick anomaly and report check.
- Friday: upload remaining assets when needed, then decide whether to scale, hold, reduce, or pause based on the full week.
- Daily: spend 15 minutes checking pacing and major anomalies only.

Automated ad-platform rules may be planned when supported, but live setup or budget changes require founder approval.

## Stop And Scale Rules

Every rule below evaluates against a number recorded in `growth/PAID_UA.md` under **Decision Thresholds** — an agent (or the founder at 11pm) must be able to read the week's report and know which side of each line it landed on. The defaults are starting points to adjust per category evidence, the same way the crash-free threshold works in `post-launch-operations.md`; changing a threshold is a recorded edit with a reason, never a silent re-read:

- **Attribution tolerance** — default ±20%. The maximum disagreement between RevenueCat, ASC/Play console, PostHog, and self-reported attribution before the numbers stop being readable.
- **Payback window** — default 90 days. Blended CPA must be recoverable from realized LTV (Economics Snapshot in `revenue/REVENUE_OPS.md`) inside this window.
- **Creative signal floor** — default 2x target CPA in spend, or 7 days, per creative — whichever comes first — before a creative may be judged or killed.
- **Scale trigger** — default 14 consecutive days at or under target CPA at the founder-approved spend level before any budget increase is proposed.

Stop, hold, or reposition when:

- baseline cannot be established
- spend is active but the attribution sources disagree beyond the recorded tolerance for a full reporting week
- blended CPA exceeds what the recorded payback window supports against realized LTV, or trial conversion breaks the payback math
- paywall reach, purchase conversion, entitlement activation, or retention drops versus organic traffic
- creatives are being killed before reaching the signal floor — churning creative faster than the budget can generate readable signal
- the only positive metric is impressions, clicks, or installs

Scale only after:

- the scale trigger has held — target CPA or better, at the approved spend level, for the recorded number of consecutive days
- one or more creative angles repeat with downstream revenue or activation evidence
- weekly creative production can keep up without lowering quality
- onboarding/paywall/revenue experiments and support paths are stable
- the founder approves higher spend or new channels

Outsource only after identifying the bottleneck:

- creative producer when asset production is slowing learning
- data analyst when reporting quality is the bottleneck
- part-time UA manager when campaign operations consume too much founder time

Outsource execution, not strategy, until the founder understands the channel economics.

## Draft Status And Kill Window

Create campaigns as **PAUSED** drafts until the founder approves live spend. An agent may prepare the draft. An agent must not enable delivery.

Record a **48-hour kill window** in `growth/PAID_UA.md`. Review CPA, payback, and product drop-off at 48 hours after first spend. Pause the campaign when the kill rule fires. Do not wait for the next weekly review to stop a broken test.

Load [`ios-consumer-playbook-intake.md`](./ios-consumer-playbook-intake.md) before copying an external iOS paid-UA tutorial into this packet.

## Founder-Only Gates

Always ask before:

- connecting ad accounts or creating campaigns
- unpausing a PAUSED draft or enabling delivery
- installing or enabling ad-network SDKs that change privacy disclosures or ATT posture — load [`privacy-terms.md`](../trust/privacy-terms.md) for the policy/questionnaire update and [`store-console-workflow.md`](../store/store-console-workflow.md) for Data safety/privacy label changes before enabling one
- committing paid spend, changing budgets, or turning on automated rules that affect spend
- using paid MMP/ad/ASO tooling
- changing pricing, trials, intro offers, subscription terms, paywall behavior, or legal copy
- launching custom product pages, web funnels, web purchase links, or public ad creative
- sharing screenshots, creator/founder likeness, generated assets, or claims publicly

## Outputs

Create or update:

- `PAID_UA.md`: fit gate, channel choice, creative system, tracking baseline, MMP Before Spend, PAUSED drafts, 48-hour kill window, blended report, schedule, stop/scale rules, founder-only gates, and traceability
- `growth/paid-ua-report.csv` when spend is planned or active
- `analytics/ANALYTICS.md` and `analytics/analytics-plan.html` with campaign, ad-network, baseline, and RevenueCat/ASC/PostHog dashboard definitions
- `revenue/REVENUE_OPS.md` with LTV/CPA/payback assumptions and RevenueCat cohort source
- `CONTENT_ASSETS.md` and optional Remotion/Higgsfield artifacts for repeatable creative production
- `APP_STORE_LISTING.md`, `store/STORE_CONSOLE.md`, or custom product page notes when the campaign destination is a store surface
- `state/LAUNCH_TRACE.md` rows connecting research, 11-star slice, channel, creative angles, paywall/revenue, analytics, privacy/legal, and proof

Run:

```bash
npm run check:paid-ua -- --root .
```

## Common Failure Modes

- Marking paid acquisition ready while ad spend is still unapproved.
- Launching multiple channels before one channel has a creative/reporting loop.
- Treating install volume as success while paywall reach, purchase, entitlement, and retention are unknown.
- Adding a paid ad SDK without updating analytics, privacy, ATT, store disclosures, and `SECRETS.md`.
- Using RevenueCat products and paywalls without checking whether CPA can fit LTV and trial conversion.
- Scaling creative volume before the app has real product UI, clear claims, and repeatable angle evidence.
- First creative batch mined only from direct competitor ads, with no original non-competitor angle.
- Copying a big-team reporting stack without the AppsFlyer `$appsflyerId` bridge.
- First spend with only a network SDK and a sheet, and no founder MMP waiver.
- Shipping ad copy that reads like generic ad-speak (weasel attribution, importance puffery) instead of passing the `no-slop-writing.md` self-check.

## Anti-Patterns (Spend And Sequencing Traps)

The paid-acquisition entries in the monetization-and-growth digest in [`revenue-monetization.md`](../money/revenue-monetization.md) §3. These are the cozy moves that feel like progress but burn budget. The Meta dashboard being "right there and shiny" is not a reason to spend.

**8. Run ads before you can read the result.** Below a meaningful daily conversion volume, every paywall, trial, and creative test is statistical noise — you spend the budget, get random numbers, declare them "insights," and build strategy on a coin flip. Do not start paid spend until the baseline window and minimum volume needed for a readable result are defined (see Tracking And Baseline and Stop And Scale Rules: "baseline cannot be established" is a stop condition). If volume is too low to reach significance, the correct move is more organic/ASO signal or a longer window, not more spend.

**9. Optimize ad creative first.** The fun part — hooks, fonts, trending audio — is not the constraint. The order that works is **paywall → onboarding → ads**: paywall (and trial/price) LTV is the bottleneck, onboarding is the conversion ramp into it, and ads only multiply whatever those two already do. Pouring traffic into a leaky paywall is filling a bucket with no bottom and calling it marketing. The Fit Gate already requires `revenue-monetization.md` and `onboarding-conversion.md` to be in good shape before spend; do not invert the order by polishing creatives while the paywall is unproven.

**11. Chase views / vanity reach.** A 500K-view screenshot for the group chat is a hug, not a business — views without buying intent do not convert (one founder turned broad emotional reach into $400). Optimize for installs → paywall reach → purchase → retention, not impressions. The Stop And Scale Rules already flag "the only positive metric is impressions, clicks, or installs"; the same trap on the organic side is covered in [`viral-growth-loops.md`](./viral-growth-loops.md) Common Failure Modes (optimizing for views instead of installs/paywall/purchases).

- Calling paid UA "done" while `PAID_UA.md`, `analytics/ANALYTICS.md`, `revenue/REVENUE_OPS.md`, `CONTENT_ASSETS.md`, `APP_STORE_LISTING.md`, or `state/LAUNCH_TRACE.md` disagree.
