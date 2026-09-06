# Viral Growth Loops

Use this before designing referral unlocks, share-to-unlock mechanics, invite systems, creator CTAs, TikTok/Reels/Shorts loops, shareable results, social-comment mechanics, viral onboarding/paywall flows, or launch growth systems that depend on product-led sharing.

This reference factors in the user-provided Glam Up case study PDF, "From 0 to 1 Million Users in 6 Months: How I Built My Viral App" (redacted local PDF). Treat it as a tactical case study, not universal truth: borrow the system shape, verify fit for the current product, and reject dark-pattern or platform-policy risks.

## Contents

- Fit Gate
- Growth System Thesis
- Product Loop Contract
- Content Format Lab
- Monetization Timing
- Measurement Plan
- Outputs
- Common Failure Modes

## Fit Gate

Viral growth is plausible when the app has:

- a visual, emotional, or identity-based result that can be shown in a short clip, screenshot, or share card
- a self-referential user moment: "this is about me," "this could be me," or "my friends should react to this"
- a platform-native category where the target audience already watches, comments, saves, and shares adjacent content
- a low-friction first session that gets users to curiosity before login, payment, or heavy setup
- a legitimate value exchange for sharing: result unlock, referral reward, group benefit, social status, or useful artifact
- enough instrumentation to distinguish attention, installs, referrals, paywall reach, purchases, and retention

Defer or reject viral loops when:

- the product has no visible or emotionally legible moment
- sharing would expose sensitive data, regulated claims, minors, financial/health details, or private user content
- the unlock mechanic would be coercive, deceptive, non-compliant, or hostile to users who cannot invite friends
- the product cannot monetize or retain the traffic spike it might create
- the acquisition platform does not match the likely paying buyer or device mix

Record the fit decision in `VIRAL_GROWTH.md`, update `state/business-state.json` `lanes.growth`, and trace the decision into `state/LAUNCH_TRACE.md`.

## Growth System Thesis

Do not treat virality as a content-only lane. The Glam Up case study worked because four pieces reinforced each other:

- product curiosity: users wanted a personal result enough to keep moving
- product loop: users had a reason to share or refer inside the conversion path
- content loop: TikTok created attention and comment behavior that amplified referral codes
- monetization timing: the paywall caught users after emotional investment, not before curiosity formed

For each launch, write a product-specific thesis:

```text
Audience/platform:
Visible result:
Emotional trigger:
Product loop:
Content loop:
Conversion moment:
Why this could compound:
Why this could fail:
```

The product loop and content loop should share the same 11-star accepted product experience. If the ad hook promises a different magic than the product delivers, the loop is fragile.

## Product Loop Contract

Define the loop before implementation:

- trigger: what user action creates the share/referral moment
- reward: what the user earns, unlocks, or receives
- recipient value: why the recipient would care, not only why the sender cares
- share artifact: referral code, invite link, generated result, image, video, comparison, checklist, challenge, or group mechanic
- surface: onboarding, blurred result, personalized plan, post-result screen, waitlist, paywall close, email, push, profile, or settings
- fallback: what happens when the user cannot or does not want to share
- abuse controls: rate limits, fraud checks, self-referral prevention, duplicate handling, entitlement limits, and support review
- policy constraints: platform rules, App Review risk, disclosure, privacy, minors, incentives, and claims

Do not hide the loop in settings if it is essential to growth. Conversely, do not force sharing as the only path when payment, free trial, waitlist, or non-social alternatives are required for fairness, compliance, or brand trust.

## Content Format Lab

Before scaling creators or Fastlane, make formats testable:

- platform and geography
- format ID
- hook structure
- first-frame visual
- before/after or reveal contrast
- text placement and size
- caption and hashtag set
- product visibility
- CTA mechanic: comment code, search app name, tap link, tag friend, save, share, waitlist, referral, or store search
- creator/account type
- post time and audio
- result windows: 24h, 72h, 7d, 30d
- install, branded-search, store-rank, referral, paywall, and purchase signal

Use `ugc-creator-engine.md` when creators, payments, contracts, or UGC operations are in scope; use `influencer-sponsorship-engine.md` when the content comes from paying creators with existing audiences (sponsorship deals, meme-page amplification). Use `fastlane-growth-ops.md` after launch approval or public beta when Fastlane is the generation or scheduling engine. Use `remotion-content-assets.md` when repeatable local video/still variants are needed.

### Share Artifact Production

Personalized share cards (score result, milestone badge, referral-unlock reveal) are social artifacts — they are not store screenshots and do not trigger the real-screenshots-only store-truthfulness guardrail. Produce them via `higgsfield-generate` with the `gpt_image_2` model:

- Embed on-image user data (score, badge label, referral unlock text) in the `--prompt` alongside the full `DESIGN.md` brief (palette, type mood, shapes, texture, banned aesthetics).
- Generate 9:16 first (Stories/Reels primary surface); produce the 1:1 feed variant via the `mcp__claude_ai_Higgsfield__reframe` MCP tool — do not re-generate a separate 1:1 from scratch. Confirm exact reframe invocation via the `higgsfield-generate` skill or MCP tool help before running; see the **Master → All Platforms (reframe + personal_clipper)** recipe in `tool-recipes/visual-and-motion-production.md`.
- For referral-reveal carousels, use `higgsfield product-photoshoot` with `--mode social_carousel`; see the `higgsfield-product-photoshoot` skill.

Guardrails:

- `DESIGN.md` brief is required on every generation; generating without it is a named failure mode.
- Confirm spend with the founder before every paid generation run (reframe included) per [`paid-tool-routing.md`](../operations/paid-tool-routing.md); surface current credit balance first.
- Record every generated share card in `CONTENT_ASSETS.md` with route, `prompt_brief`, output paths, and QA/approval status.
- Public posting stays founder-gated; generating share cards for in-app display does not constitute posting.

One viral post is not a format. Treat a format as scale-ready only after repeatable signal: 2-3 hits from the same structure, preferably across more than one account or creator, plus downstream install/referral/revenue evidence.

## Monetization Timing

Load `onboarding-conversion.md` and `revenue-monetization.md` before implementing paywall mechanics.

A viral app must be ready to catch demand before the spike:

- remove unnecessary first-session friction before the product curiosity forms
- place personalization, demo, scan, result preview, or other emotional investment before the main payment ask when compliant and truthful
- make the paywall feel like continuing the journey, not a disconnected toll booth
- test package mix, intro offer, closing offer, trial, or reverse trial with transparent renewal terms
- keep restore purchases, terms, privacy, cancellation, and support visible
- avoid fake computation, fake reviews, deceptive scarcity, undisclosed generated claims, or non-compliant review prompts

The transferable lesson from the PDF is timing and framing, not copying manipulative details. If a tactic depends on misleading the user, redesign it into a truthful suspense, preview, demo, or value-reveal moment.

## Measurement Plan

Use `analytics-attribution.md` before implementation. `analytics/ANALYTICS.md` should include:

- technical attribution: UTMs, referrer, deep link, creator/referral code, vanity URL, store context
- self-reported attribution with stable source keys and `other` free text
- product-loop events such as `referral_invite_started`, `referral_invite_completed`, `referral_unlock_earned`, `share_started`, `share_completed`, `creator_code_applied`, and `viral_format_signal_detected` when relevant
- funnel events from first open to onboarding, value preview, referral/share prompt, paywall, purchase, entitlement, activation, and return
- dashboard cards for attention, install/open, referral/share, paywall reach, conversion, revenue, retention, content format results, and platform/device mix
- QA proof that referrals or unlocks affect backend/provider truth, not only local UI state

### Loop Economics

Counting shares is not measuring a loop. The one number that distinguishes a compounding engine from an amplifier of paid/organic top-ups is the viral coefficient:

- **k = (invites or shares sent per active user in the period) × (recipient conversion rate to install/activation).** Compute it weekly from the catalog events above (`referral_invite_started` → `referral_invite_completed` → attributed installs), alongside **cycle time** — median days from a user's activation to their referred user's activation.
- Read k honestly: **k ≥ 1** compounds on its own (rare; most consumer apps never get there); **k 0.3–0.7** is a meaningful acquisition multiplier on other channels (each paid install brings a fraction of a free one); **k < 0.15** means the loop is decoration and the effort belongs elsewhere. Shorter cycle time compounds whatever k you have, faster.
- Record k, cycle time, and the trend in `VIRAL_GROWTH.md`'s Loop Economics section each week the loop runs. The stop/scale rules key on this number and its trend — not on gross share counts, which can rise while k falls.
- A worked example: 1,000 weekly actives send 300 invites (0.3/user); 60 convert (20%) → k = 0.06. That loop is not a growth engine yet; it needs a stronger share moment or a better landing conversion before more traffic is poured through it.

Do not call viral growth working from views alone. Views become launch learning only when connected to app opens, attribution, referrals, paywall reach, purchases, retention, or a deliberate awareness-only goal — and never from share counts without the k computation above.

## Outputs

Create or update:

- `VIRAL_GROWTH.md`: fit gate, growth thesis, product loop, content loop, monetization timing, measurement plan, stop/scale rules, founder-only gates, and traceability
- `growth/format-lab.csv` or `ugc/script-bank.md`: format IDs, hooks, variables, results, and next tests
- `growth/referral-loop-map.md` when referral or unlock mechanics are non-trivial
- `analytics/ANALYTICS.md` and `analytics/analytics-plan.html` with growth-loop events and dashboards
- `product/ONBOARDING.md` and `revenue/REVENUE_OPS.md` when the loop changes onboarding, paywall, intro offer, or closing offer behavior
- `growth/UGC_PLAYBOOK.md`, `CONTENT_ASSETS.md`, and `growth/FASTLANE_OPS.md` when creator or generated content is in scope
- `state/LAUNCH_TRACE.md` rows connecting research, 11-star slice, product loop, content format, monetization, analytics, privacy/legal, and proof

## Common Failure Modes

- Treating virality as "post TikToks" instead of designing product, referral, content, paywall, and analytics as one system.
- Copying a case-study tactic without checking audience, platform, category, device mix, policy risk, or monetization readiness.
- Hiding referrals in settings while expecting them to drive acquisition.
- Forcing referrals without a fair fallback, fraud control, or policy review.
- Optimizing for views while ignoring installs, paywall reach, purchases, retention, or referral quality. (Anti-pattern 11 in the monetization-and-growth digest in [`revenue-monetization.md`](../money/revenue-monetization.md) §3 — a 500K-view post that converts to $400 is a hug, not a business; vanity reach without buying intent does not pay.)
- Scaling creators from one lucky post before a repeatable format exists.
- Letting content promise a result the product cannot truthfully produce.
- Moving a viral unlock into build work without backend entitlement/referral proof.
- Calling growth "done" while `VIRAL_GROWTH.md`, `analytics/ANALYTICS.md`, `product/ONBOARDING.md`, `revenue/REVENUE_OPS.md`, `growth/UGC_PLAYBOOK.md`, or `state/LAUNCH_TRACE.md` disagree.
