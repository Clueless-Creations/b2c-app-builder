# UGC Creator Engine

Use this when the launch depends on TikTok/Reels/Shorts, creator-led organic growth, founder-led content, UGC ads, or post-launch social distribution. This reference factors in the user-provided Sprout UGC Playbook Part 1 PDF, extracted as "Zero to One: How a UGC engine actually starts" by Aaron Paul, published May 2026.

The Day 0 frame: do not build a mature creator machine before a format works. Run a 90-day founder-led format-discovery experiment with a tiny roster, high feedback intensity, and strict stop/scale rules.

Load `viral-growth-loops.md` first when UGC depends on product-led referral/share mechanics, social-comment loops, paywall timing, creator codes, or share-to-unlock behavior. This file owns creator operations; `viral-growth-loops.md` owns the product/content/revenue/analytics system that makes attention compound.

Load `influencer-sponsorship-engine.md` instead when the plan is paying creators who already have an audience to integrate the app into their own content — sponsorship outreach, CPM/view-guarantee deals, brand-account credibility, meme-page amplification. This file's creator ops assume the program owns new niche accounts and the algorithm is the distribution engine; sponsorships rent an existing audience and price on views, and the two lanes use different payment shapes and qualification filters.

## Contents

- Fit Gate
- Day 0 Operating Model
- Creator Sourcing
- Onboarding And Contracts
- Payment Shape
- Format Discovery Loop
- Tracking And Analytics
- Design And Product Implications
- Outputs
- Common Failure Modes

## Fit Gate

UGC is a good candidate when the app has:

- a visible product moment that can be shown in a phone screen, laptop screen, demo, or screenshot
- an emotional hook: anxiety, frustration, desire, identity, aspiration, relief, embarrassment, pride
- a large consumer or prosumer audience
- a natural comment-bait tension or share/tag reason
- a product name or visual identity that viewers can recognize from the video frame

Deprioritize UGC when:

- there is no visible product moment
- the product is pre-product or has no real workflow to film
- the audience is narrow, committee-led, or high-ticket enterprise
- the category is regulated and claims/compliance cannot be reviewed
- the product cannot tolerate rough, fast, creator-native presentation

Record the fit decision in `growth/UGC_PLAYBOOK.md` and map it to `state/LAUNCH_TRACE.md` and `11_STAR_EXPERIENCE.md`. A creator hook should be a tiny, truthful version of the product's complete product experience, not a separate marketing fantasy.

## Day 0 Operating Model

Run Day 0 as a format-discovery experiment:

- commit to 90 days before judging the channel
- use 3-5 creators, not a large roster
- expect roughly 3-4 approved videos per creator per week
- plan for 9-12 approved videos per week across a 3-creator roster
- write every script for the first 4-8 weeks
- approve every early cut before posting
- give same-day, specific, time-coded feedback
- give each format 5-8 reps before judging it
- look for a format that hits 2-3 times, ideally across 2+ creators, before scaling

Do not hire a large agency, buy production gear, build a heavy attribution stack, or run a 20-creator roster before the first repeatable format appears.

## Creator Sourcing

The first search target:

- personal TikTok accounts with roughly 500-5,000 followers
- US, UK, Canada, Australia, or whichever geography matches the paying buyer and pricing
- camera-native, clear speakers, reliable responders, coachable, comfortable with feedback
- not necessarily niche experts; the founder trains the niche through scripts

Day 0 sourcing workflow:

1. Open a founder/brand creator account and post 5-10 niche videos before recruiting, if feasible.
2. Scout roughly 100 creators on TikTok or an approved creator marketplace.
3. Use paid-tool routing before using Sideshift or another paid creator platform.
4. Keep the first DM short, lead with paid collaboration, explain the app in one concrete line, and ask for email/phone rather than closing in DMs.
5. Expect a small percentage of cold DMs to become onboarded creators.

Creator-owned personal audience is not the point. The creator runs a new niche-themed account for the program. The algorithm, not their existing follower base, is the distribution engine.

## Onboarding And Contracts

Compress week 1:

- Day 1: sign a short contractor agreement before account credentials change hands
- Day 2: creator creates the new niche-themed brand account on their own device and shares login as backup
- Day 3: founder sends scripts in the simplest shared doc/text thread that works
- Days 4-7: creator films, founder reviews, creator revises, then posts
- end of week 1: quick async check-in and first iteration notes

Contract checklist for Day 0:

- brand/account ownership and handover
- content usage and paid-ad reuse rights
- base pay, bonus trigger, view source, and measurement window
- termination terms and in-flight bonus handling
- tax forms and payout method
- disclosure requirements: commercial relationship, partner language, hashtags, and platform rules

Get legal review before scale. Do not leave account ownership, ad usage, or tax paperwork ambiguous.

## Payment Shape

The Day 0 payment structure should keep creators engaged while the program has no proven hit rate:

- base pay per approved video
- performance bonus after a meaningful view threshold
- no pure-performance-only structure at Day 0
- no affiliate or rev-share-first structure before a repeatable format exists

Sprout PDF benchmark to adapt, not blindly copy:

- base: roughly $30-40 per approved video
- bonus trigger: meaningful breakout at around 50K views
- rough flat bonus after the trigger, then tune to category economics
- later scale can use declining CPM tiers so mega-hits do not destroy unit economics

Budget planning:

- floor: base-only spend for 3 creators over 13 weeks
- working case: base plus mid-hit bonuses
- breakout case: monthly spend can jump sharply, which can be a success signal if unit economics work

Any real creator spend, paid platform spend, legal spend, or payout commitment is founder-approved.

## Format Discovery Loop

Test:

- hooks: first 1-3 seconds, usually the highest-leverage variable
- formats: talking-head, demo, POV, skit, fake interview, street, duet, teardown, before/after, challenge
- angles: pain, aspiration, identity, objection, comparison, result, use case
- characters: self, expert, beginner, skeptic, exaggerated persona, antagonist, customer, friend
- CTA mechanic: comment bait, tag/share, profile search, waitlist, app search, store link, demo request

Define a format as a repeatable structure, not a topic. A format includes hook shape, beat order, product insertion, tension, and CTA mechanic. Steal the skeleton from proven patterns, not the skin, lines, scenes, or copyrighted material.

Before writing scripts for `ugc/script-bank.md`, load `knowledge/words/no-slop-writing.md` for banned words/patterns and weasel-attribution claims — but the voice being protected here is the creator's own natural spoken voice, not this skill's tone or the app's `strategy/BRAND.md`. A script that reads like brand copy instead of a real person talking on camera fails before any slop check does.

**Script bank and judge panel.** A script earns filming or generation spend by surviving a judge panel. It does not earn spend by reading well to its author. Run the panel as separate reviewer passes with fresh context (subagents, or the council mechanism). Give each judge exactly one job: pacing, vocabulary, idea strength, or structure. Ground at least one judge entirely in a real creator's transcript corpus. Pick an imperfect source on purpose: polished writing is not what a UGC script sounds like. A panel without a real-creator judge drifts every script back toward brand copy. The loop: write, let the panel tear it apart, rewrite, run it again. A script that survives is worth spending money on. A script that fails is free to kill. Write 10+ scripts per batch; the panel is cheap next to one generated clip, and discovery needs volume. Record survivors in `ugc/script-bank.md` with format id and judge notes. For synthetic UGC this gate is mechanical: record `script_id` and `judge_verdict` on the manifest asset. The `script_id` must resolve to a recorded row in `ugc/script-bank.md`, and the verdict uses `passed`/`survived` wording — `check:content-assets` blocks a UGC-family generation without both, and rejects a `failed`/`rejected` verdict at any status. Recipe 7 in `tool-recipes/visual-and-motion-production.md` starts at this panel, never at the model.

Daily research habit:

- scout TikTok and adjacent niches for 20-30 minutes
- save repeated structural patterns, not one-off viral videos
- look for 3+ unrelated examples with high view counts
- turn each candidate into 5-8 scripts before judging

Breakout rules:

- 5K views: signal worth inspecting
- 10K views: stronger signal
- 50K+ views: likely breakout and bonus trigger
- one hit: luck
- 2-3 hits from the same structure, ideally across 2+ creators: format worth scaling
- after a breakout: clone the hook and structure within 24 hours

Stop rule:

- after 3 months at full cadence, no 100K-ish breakout, no improving format, no install/branded-search lift, and no audience-fit comments means shut down or reposition the channel
- creator has not posted by day 7: replace
- creator ghosts, resists feedback, or sends low-effort work in week 1: replace
- positioning changes every week: freeze it and run 10-15 videos before evaluating

## Tracking And Analytics

Day 0 tracking can stay simple:

- one Google Sheet or equivalent
- creator
- account handle
- post URL
- date/time
- format ID
- hook variant
- angle
- CTA
- product visibility
- views at 24h, 72h, 7d, 30d
- comments/theme notes
- install/branded-search spike notes
- payout status

This does not replace launch analytics. Use `analytics-attribution.md` for UTMs, creator/referral codes, self-reported attribution, PostHog events, store CTAs, RevenueCat/Stripe conversion, and weekly growth dashboards. Day 0 UGC is intentionally lightweight on attribution, but the launch package still needs measurement once links, waitlists, stores, or purchases are involved.

## Design And Product Implications

Before filming:

- make the app logo or name visible in screenshot-heavy screens
- identify which 11-star magical moment or complete product experience the video is demonstrating
- ensure the product moment can be captured in a short screen recording
- design UI states that are legible inside vertical video
- avoid tiny copy that disappears in phone-shot footage
- prepare a truthful demo account/fixture with realistic data
- mark any generated or mock UI as non-production until the real app exists

Use Higgsfield only for supporting visuals, mascots, backgrounds, hooks, or motion after `DESIGN.md` exists. Do not use generated visuals as a substitute for truthful app UI in store screenshots or product claims.

**Synthetic founder-voice content (before real creators are onboarded).** Marketing Studio supports four UGC-family modes suited to pre-roster founder-led content: `ugc`, `ugc_how_to`, `ugc_unboxing`, and `product_review`. Use these to generate synthetic founder-voice ads during format discovery before a real creator roster is running. Synthetic UGC complements real creator content — it does not replace it; real creators produce authentic human variability, comment-bait tension, and niche credibility that generated video cannot replicate. See the **Soul-Once Founder-Face Ads** recipe in `tool-recipes/visual-and-motion-production.md`. When no founder face should appear, use the **Script-First Believable-Person UGC** recipe (Recipe 7) in the same file. Recipe 7 uses a first-frame image plus a Seedance reference-driven video. Confirm the exact model id through the `higgsfield-generate` skill. Recipe 7 needs no Soul and no avatar.

Guardrails for synthetic UGC:

- Script first. Every synthetic UGC generation uses a script that survived the script-bank judge panel above. The model renders a weak script and a strong script with equal quality. Generation never rescues writing. `check:content-assets` enforces `script_id` and `judge_verdict` on every UGC-family manifest asset.
- Prompt register. UGC-family modes and Recipe 7 follow the **UGC Realism Prompt Structure** in `tool-recipes/visual-and-motion-production.md`: social context truth, imperfect presence, no resolution. Never use the premium product-ad structure for these modes. Polish makes the viewer identify both the ad and the AI.
- Believability. Before scaling a synthetic format, one real human who did not make the clip watches it. If they identify it as AI or as an ad, suspect the script first, then the prompt, last the model. Record `passed — <detail>` or `failed — <detail>` in the manifest `believability` field; a done-tier status without an explicit pass fails `check:content-assets`.
- Automation last. Scale the flow into an automated pipeline only after it passes the believability test repeatedly by hand. Automation of a broken flow makes slop faster.
- Founder-face content additionally requires a trained founder Soul (`soul-cinematic` variant) and a custom avatar; see `tool-recipes/visual-and-motion-production.md`.
- Every generation prompt must carry `DESIGN.md` tokens (palette, type mood, shapes, texture, motion energy, banned aesthetics, surface). Generating without this brief is a named failure mode.
- Gate every generation behind spend confirmation per [`paid-tool-routing.md`](../operations/paid-tool-routing.md); surface current balance first (`mcp__claude_ai_Higgsfield__balance`).
- Record all generated assets in `CONTENT_ASSETS.md` / `growth/content-assets/manifest.json` with `prompt_brief`, `soul_reference_id`, `avatar_id`, and `virality_score` fields.
- Synthetic ads must pass brain-activity virality scoring before paid distribution (see **Virality Closed Loop** recipe in `tool-recipes/visual-and-motion-production.md`) — and pass [`quality-lens.md`](../design/quality-lens.md)'s Anti-Generic Checks, which neither the virality score nor the design-token check evaluates.
- Public posting and paid campaign launch remain founder-gated.

**Long recordings → short clips (`personal_clipper`).** Use `personal_clipper` to cut long founder recordings, podcast appearances, demo walkthroughs, or app explainers into short-form clips for UGC distribution. `personal_clipper` is an MCP-tool capability only (`mcp__claude_ai_Higgsfield__personal_clipper_create` / `_jobs` / `_status`); confirm the exact invocation via the `higgsfield-generate` skill before running. Gate behind spend confirmation per `paid-tool-routing.md`. See the **Master → All Platforms** recipe in `tool-recipes/visual-and-motion-production.md`.

Use Remotion when founder-led or creator-led content needs repeatable local variants: product-demo loops, hook overlays, captions, cutdowns, screenshot motion, before/after frames, or app-preview clips. Load `remotion-content-assets.md` first, record Remotion license status, keep real app UI visible, and add each rendered output to `CONTENT_ASSETS.md` and `growth/content-assets/manifest.json`. Remotion is especially useful before Fastlane because the same composition can render many hook, CTA, locale, and dimension variants without paying for net-new generative media.

## Outputs

Create these when UGC is in scope:

- `growth/UGC_PLAYBOOK.md`: fit decision, 90-day plan, budget, creator profile, sourcing channel, contract checklist, payment model, stop/scale rules
- `VIRAL_GROWTH.md`: product-led loop, referral/share mechanics, content format lab, monetization timing, analytics proof, abuse controls, and stop/scale rules when creator content is expected to compound
- `CONTENT_ASSETS.md`: Remotion/Higgsfield/raw-media route, source inputs, license status, render proof, and output registry when rendered or generated media supports the UGC lane
- `ugc/creator-list.csv`: creators, platform, handle, geography, personal followers, notes, outreach status
- `ugc/script-bank.md`: format IDs, hooks, scripts, CTA notes, product insertion notes — scripts pass the `no-slop-writing.md` self-check (§6) for claims and patterns while preserving natural creator speech
- `ugc/tracker.csv` or sheet link: posts, metrics, payouts, format results
- `ugc/creator-brief.md`: filming rules, disclosure rules, approval flow, account handling, product truth constraints
- `ugc/weekly-review.md`: current winners, failed hooks, next tests, spend, install/search signals
- updated `growth/FASTLANE_OPS.md` when Fastlane becomes the generation/scheduling engine after launch

## Post-Breakout Scale Model

Everything above is the Day-0 discovery experiment: 3–5 creators finding a format. Discovery is not the destination — UGC-driven consumer apps at real chart positions run volume, and volume is the mechanism that turns one proven hook into a sustained install stream. Once the breakout bar holds (2–3 hits from the same structure across 2+ creators, with downstream install/paywall/revenue evidence), the roster grows in bands, each a founder-gated budget step:

| Band              | Roster | Weekly video volume | What changes operationally                                                                                                                                               |
| ----------------- | ------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Discovery (Day 0) | 3–5    | 9–15                | founder writes scripts, judges hooks personally                                                                                                                          |
| Proven format     | ~10    | 30–40               | script bank templatizes the winning structure; per-creator briefs; weekly winners review drives the bank                                                                 |
| Scale             | ~30    | 90–120              | a lead creator or coordinator owns briefing/QA; payment ops move to batch; format variants tested against the control format                                             |
| Volume            | 75+    | 200+                | agency or marketplace layer runs sourcing/payments; the founder owns format strategy and brand truth only; Fastlane or equivalent handles scheduling/analytics at volume |

Rules that keep scale honest:

- Advance one band at a time; each band's budget is a separate founder gate with the prior band's install-per-video and payback numbers in front of the decision.
- The breakout bar re-proves per band: a format that worked at 5 creators must hold its install economics at 10 before 30 exists.
- Fatigue is measured, not feared: when the control format's install-per-video decays across two consecutive weekly reviews, the next variant test is the priority, not more volume on the decaying control.
- Disclosure, claim review, and brand-truth constraints from the Day-0 contract apply at every band — volume never dilutes the compliance floor.

## Common Failure Modes

- Scaling to 20+ creators before one format works.
- Asking creators to invent strategy before the founder understands the medium.
- Optimizing for production polish before hook strength.
- Changing positioning every few videos.
- Using affiliate links or rev share too early and forcing unnatural CTAs.
- Treating one viral video as a format.
- Forgetting product/logo visibility in the app screens shown on video.
- Scheduling UGC or creator posts without disclosure, claim review, and founder approval.
- Spending on paid creator tools or marketplaces without a founder-approved tool decision.
