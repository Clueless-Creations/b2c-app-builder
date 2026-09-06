# Social / Community Platform Build Lane

Use this reference when the founder's request is to build a **social or community platform** — "build a social network", "X/Twitter clone", "Instagram clone", "TikTok clone", "a community app for <niche>", "a forum/feed app", "people post and follow each other". It is the first **app-archetype prompt pack**: a recognizable B2C product shape with a known set of core systems and a battle-tested build sequence, shipped as reusable boilerplate prompts under [`../surfaces/starters/social-network/`](../../surfaces/starters/social-network/README.md).

This lane does **not** replace the launch workflow in `SKILL.md`. It is a layer on top of it: it gives the engineering/build stages a proven sequence and ready prompts for one product shape, and it routes each piece back into the existing lanes (research, 11-star, design, security, revenue, growth, analytics). Do not use it to skip evidence, design, security, or provider-proof gates.

## When To Use

Load this reference when:

- The founder describes a product whose core is **posts + a social graph + a feed + engagement + notifications** (the five core systems below), regardless of the content format.
- The request names a comparable platform (X, Instagram, TikTok, Reddit, Discord, BeReal, Substack-as-network) or a niche community version of one.
- You are at the spec/engineering/handoff stage of such a product and want the boilerplate prompt sequence instead of improvising the schema and feed from scratch.

Do **not** force this lane onto a product that merely has a comment section or a single social feature; it is for products whose center of gravity is the social loop.

## Step 1 — Detect The Archetype And Confirm The Variant (AskUserQuestion)

Before writing schema or specs, confirm the product shape with the founder using **AskUserQuestion** (or a plain founder choice if AskUserQuestion is unavailable). This is a bounded product-shape decision that changes the schema, the feed, the design, and the store path — it is worth one upfront question, and it is not a founder-only gate that blocks other work.

Ask, in one batched call:

1. **Content format** — what is a "post" at its core?
   - **Text-first** (X/Twitter model): short text, optional images. Feed is a timeline list.
   - **Image-first** (Instagram model): at least one image required, optional caption. Feed is a grid; adds Stories + Explore.
   - **Video-first** (TikTok model): short vertical video. Feed is full-screen, swipe-driven, algorithmic.
2. **Primary surface** — where does the accepted product run?
   - **Web / PWA** (the prompt pack's default stack: Next.js App Router + Supabase + Vercel).
   - **Native mobile** (iOS/Android): the same five systems and Supabase backend hold, but the client prompts must be re-expressed for the native stack and the Apple/Play store lanes in `SKILL.md` apply in full.
3. **Which optional systems are in the accepted product?** (multi-select) — direct messages, monetization (subscriptions + creator support), invite-only onboarding, search/discovery. These map to the optional prompts in the pack.
4. **Niche** — who is this community for? (Free text. Feeds Step 2 positioning. A focused niche is the whole strategy: a smaller, highly engaged community beats a general-purpose clone.)

Record the answers in `state/business-state.json` (under the product lane, e.g. `lanes.product.archetype: social-network`, `content_format`, `primary_surface`, `optional_systems`) so later sessions do not re-litigate the shape.

Honesty note on the stack: the bundled prompts target **web (Next.js + Supabase + Vercel)** because that is the fastest path to a working multi-user social product. If the founder picks native mobile, say so plainly — the schema, RLS, real-time, and storage prompts carry over unchanged, but the auth/feed/profile/DM client prompts are web prompts and must be adapted, and the full iOS signing/ASC/store lanes become required rather than optional.

## Runnable Starter

The pack ships a runnable scaffold at [`../surfaces/starters/social-network/starter/`](../../surfaces/starters/social-network/starter/README.md): Next.js App Router + Supabase pre-wired with magic-link auth, schema migrations with **tested** RLS (pgTAP, per `backend-data-contract.md`), Stripe and RevenueCat stubs, a PostHog event catalog matching the analytics lane's snake_case conventions, a names-only `.env.example`, and a CI workflow. Copy it into the business repo as the floor and customize it with the prompts below — its README maps each prompt to the scaffold area it customizes. Do not improvise the same wiring from scratch; `check:archetype-starter` enforces the starter contract. If the founder selects Firebase or a custom backend, adapt through the data-contract lane instead of running the Supabase pieces verbatim.

## The Five Core Systems

Every social platform — text, image, or video — is built on the same five systems. If any one is missing or broken, the product does not work. The build sequence exists to complete them in dependency order.

1. **User Identity** — registration, authentication, sessions, profiles, verification. First built, last revisited. → prompt `02-auth-system`, profile half of `04-profiles-and-follow`.
2. **Content Creation & Storage** — posts, media in object storage, validation, association to the creator. Only the media type changes between variants. → prompt `01-database-schema`, `03-feed-and-posts`, plus the variant deltas.
3. **Social Graph** — who follows whom (asymmetric for the X model). The most performance-sensitive part; it decides what reaches each feed. → follow half of `04-profiles-and-follow`.
4. **Feed** — what each user sees and in what order. Choose chronological ordering when it serves the accepted user promise (understandable, debuggable, trusted). A required ranked or hybrid feed must be implemented and verified, not deferred as a shortcut. The video-first variant is the exception — it needs a recommendation mix from day one. → `03-feed-and-posts`, video-first variant.
5. **Engagement & Reactions** — likes, reposts, replies/comments, and the notifications they generate. Notifications must be async and not block the main request cycle. → engagement half of `03-feed-and-posts`, notification half of `04-profiles-and-follow`.

## The Build Sequence

Build **one system at a time, test it, then move on**. A solid identity + feed beats ten half-built features. Run the prompts in this order; each lives in [`../surfaces/starters/social-network/prompts/`](../../surfaces/starters/social-network/README.md):

| #   | Prompt                                           | Core system                      | Threads into                                                                    |
| --- | ------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------- |
| 00  | `00-niche-strategy` (Claude.ai, not Claude Code) | positioning                      | `strategy/RESEARCH.md`, naming, `VIRAL_GROWTH.md`, `growth/LAUNCH_NARRATIVE.md` |
| 01  | `01-database-schema`                             | content + graph + engagement     | `engineering/TECH_SPEC.md`, engineering lane, security (RLS)                    |
| 02  | `02-auth-system`                                 | identity                         | engineering, `trust/SECURITY.md`, `SECRETS.md` (OAuth keys)                     |
| 03  | `03-feed-and-posts`                              | content + feed + engagement      | `11_STAR_EXPERIENCE.md` core loop, `analytics/ANALYTICS.md` events              |
| 04  | `04-profiles-and-follow`                         | identity + graph + notifications | engineering, real-time, `analytics/ANALYTICS.md`                                |
| 05  | `05-search-and-discovery` (optional)             | discovery                        | engineering, growth                                                             |
| 06  | `06-direct-messages` (optional)                  | engagement                       | engineering, real-time, abuse controls                                          |
| 07  | `07-stripe-monetization` (optional)              | revenue                          | `revenue-monetization.md`, `revenue/REVENUE_OPS.md`                             |
| 08  | `08-invite-system` (optional)                    | growth                           | `viral-growth-loops.md`, `VIRAL_GROWTH.md`                                      |

Variants (apply after the text-first base, or fold into prompt 01/03 if chosen upfront): [`variants/image-first-instagram`](../../surfaces/starters/social-network/prompts/variants/image-first-instagram.md) and [`variants/video-first-tiktok`](../../surfaces/starters/social-network/prompts/variants/video-first-tiktok.md).

Step 0 (niche strategy) is strategic work for the **web interface / Claude.ai**, not Claude Code — it is about people, not systems. The rest are Claude Code build prompts.

## How This Lane Threads Into The Launch Workflow

The prompt pack is the engineering spine, not the whole launch. Keep these connections live:

- **Database schema first.** Prompt 01 produces the schema every other system builds on; getting it wrong means expensive rewrites. Reconcile it with `engineering/TECH_SPEC.md` (data model, API contracts, RLS policies) before building clients.
- **Row Level Security is the security lane, not a checkbox.** The schema prompt emits Supabase RLS so users can only edit their own data. Treat RLS policies as part of `security-release-hardening.md`: every table that holds user data needs a policy and a test, and entitlement/visibility rules (private accounts, blocks) belong in the threat model.
- **The feed is the 11-star core loop.** Prompt 03 is where the defining product moment lives. Run [`eleven-star-experience.md`](../experience/eleven-star-experience.md) over it, and name the optimistic-UI like/repost reveal and the real-time arrival of new posts as engineered moments with PostHog events and reduced-motion fallbacks (`consumer-product-design-agency.md`, `emotional-design-system.md`).
- **Monetization reconciles with the revenue lane.** Prompt 07 uses **Stripe** (Checkout + Customer Portal + Connect for creator payouts) because the default surface is web. If the founder ships native iOS, digital subscriptions generally must go through StoreKit/IAP (route via `revenue-monetization.md` and RevenueCat); Stripe Connect creator payouts and physical/real-world value can stay on Stripe. Do not ship the web Stripe paywall inside an iOS binary without resolving App Store policy first.
- **Invites are a growth loop, not just a gate.** Prompt 08 feeds `viral-growth-loops.md`: invite acceptance rate, inviter attribution, and the invitation tree are the loop's analytics. Pre-loading value before opening the doors (build-in-public → invite-only beta → referral codes) is the standard cold-start sequence.
- **Positioning feeds research and launch.** Prompt 00's outputs (what the community hates about incumbents, the one tell-a-friend feature, name directions, first-100-users plan) flow into `strategy/RESEARCH.md`, naming, and `growth/LAUNCH_NARRATIVE.md`.
- **Analytics before surfaces lock.** Every engagement and notification path named in prompts 03/04/06 needs an event in `analytics/ANALYTICS.md` before build (`analytics-attribution.md`).
- **Don't optimize for scale before users.** Build the monolith, ship it, get users, then optimize the queries that actually become bottlenecks. A feed query that is inefficient at 100 users is fine until ~10,000.

## Infrastructure Defaults (record decisions, do not hardcode)

These are the pack's default choices; confirm and record them in `strategy/TOOL_DECISIONS.md` / `SECRETS.md` rather than assuming:

- **Backend:** Supabase (Postgres + Auth + Realtime + Storage). Object storage for all media — never serve media from the app server. At significant media volume, migrate to Cloudflare R2 (zero egress).
- **Hosting:** Vercel (preview URL per PR, global CDN) for the web surface.
- **Video transcoding (video-first only):** Mux or Cloudflare Stream for adaptive bitrate.
- **Email:** route through the existing `resend-email-ops.md` lane (verification, follower/notification digests).
- **Moderation from day one:** rate limiting on post creation, a basic word filter, image moderation (Google Vision / AWS Rekognition), and text classification (Claude API) before opening publicly. This is a launch gate for any public social product, not optional future polish.

## Extending This Layer With New Archetypes

This is the first archetype pack. To add another (e.g. marketplace, dating, journaling, habit-tracker):

1. Add `starters/<archetype>/README.md` + `prompts/` with the same shape (numbered, dependency-ordered, copy-paste-ready prompts with skill-integration notes).
2. Add a peer reference (or a section here) describing its core systems, the AskUserQuestion shape, and how each prompt threads into the existing lanes.
3. Wire it into `SKILL.md` (archetype-detection step + a When-To-Load rule) and add an agent-behavior eval that locks in "detect archetype → confirm via AskUserQuestion → load the pack → sequence the prompts".
4. Keep the prompts faithful to their source but improve them to match this skill's contracts (RLS, analytics events, reduced-motion, provider proof).

## Acceptance Checklist

Before calling a social-platform build ready:

- [ ] Archetype + content format + primary surface + optional systems confirmed via AskUserQuestion and recorded in `state/business-state.json`.
- [ ] Schema (prompt 01) reconciled with `engineering/TECH_SPEC.md`; every user-data table has a tested RLS policy referenced from `trust/SECURITY.md`.
- [ ] The five core systems are each complete and tested before dependent features start.
- [ ] The feed core loop is run through `11_STAR_EXPERIENCE.md` with named engineered moments and PostHog events in `analytics/ANALYTICS.md`.
- [ ] Monetization (if in scope) is reconciled with `revenue-monetization.md` and the correct billing path for the chosen surface (Stripe for web; IAP/StoreKit for native digital subscriptions).
- [ ] Invite/referral mechanics (if in scope) are tied to `viral-growth-loops.md` with acceptance-rate and attribution analytics and self-referral/abuse controls.
- [ ] Moderation baseline (rate limits, word filter, image + text classification) is specified before any public launch.
- [ ] Positioning outputs from prompt 00 flow into `strategy/RESEARCH.md`, naming, and `growth/LAUNCH_NARRATIVE.md`.
</content>

</invoke>
