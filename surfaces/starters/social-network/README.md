# Social / Community Platform — Boilerplate Prompt Pack

The first **app-archetype prompt pack** for this skill. It is a reusable, dependency-ordered set of copy-paste-ready prompts for building a B2C social/community platform (text-, image-, or video-first). Routing, the upfront archetype question, and how each prompt threads into the launch lanes live in [`../../../knowledge/product/social-network.md`](../../../knowledge/product/social-network.md). Read that first.

These are **starting prompts**, not final code. Improve them per project. Each prompt file has a copy-paste block plus skill-integration notes (what to verify, which lane/artifact it feeds).

## How to use

1. Confirm the product shape with the founder via **AskUserQuestion** (content format, primary surface, optional systems, niche) — see the reference. Record the selected archetype, scope, and product decisions in `product.yaml`, then render `PRODUCT.md`.
2. **Copy the runnable starter** ([`starter/`](./starter/README.md)) into the business repo and install it — it is the pre-wired floor (auth, tested RLS migrations, PostHog event catalog, Stripe/RevenueCat stubs, names-only `.env.example`, CI). Do not regenerate this wiring from scratch; `check:archetype-starter` enforces its contract.
3. Run prompt **00** strategy work on the web interface / Claude.ai (it is about people, not systems).
4. Run prompts **01 → 04** in order as Claude Code build prompts against the starter (the starter README maps each prompt to the scaffold area it customizes). Build one system, test it, then move on.
5. Add optional prompts **05 → 08** based on the founder's selection.
6. Apply a **variant** (image-first or video-first) if the founder did not pick text-first.

## Default stack

Next.js App Router + Supabase (Postgres, Auth, Realtime, Storage) + Vercel, with Stripe for web monetization and Mux/Cloudflare Stream for video. Confirm and record these in `strategy/TOOL_DECISIONS.md` / `SECRETS.md`; do not assume. For a native-mobile primary surface, the schema/RLS/realtime/storage prompts carry over but the client prompts must be adapted and the Apple/Play store lanes apply.

## Build order

| #   | File                                                                         | Build it                                  | Optional? |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| 00  | [`prompts/00-niche-strategy.md`](./prompts/00-niche-strategy.md)             | Positioning & first-100-users (Claude.ai) | strategy  |
| 01  | [`prompts/01-database-schema.md`](./prompts/01-database-schema.md)           | PostgreSQL schema + RLS + seed            | required  |
| 02  | [`prompts/02-auth-system.md`](./prompts/02-auth-system.md)                   | Auth (email + OAuth), profile setup       | required  |
| 03  | [`prompts/03-feed-and-posts.md`](./prompts/03-feed-and-posts.md)             | Post creation + feed + interactions       | required  |
| 04  | [`prompts/04-profiles-and-follow.md`](./prompts/04-profiles-and-follow.md)   | Profiles + follow + notifications         | required  |
| 05  | [`prompts/05-search-and-discovery.md`](./prompts/05-search-and-discovery.md) | Search, explore, hashtags                 | optional  |
| 06  | [`prompts/06-direct-messages.md`](./prompts/06-direct-messages.md)           | Direct messaging                          | optional  |
| 07  | [`prompts/07-stripe-monetization.md`](./prompts/07-stripe-monetization.md)   | Subscriptions + creator support           | optional  |
| 08  | [`prompts/08-invite-system.md`](./prompts/08-invite-system.md)               | Invite-only onboarding                    | optional  |

## Variants

| File                                                                                       | Turns the base into                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------ |
| [`prompts/variants/image-first-instagram.md`](./prompts/variants/image-first-instagram.md) | Instagram-style image-first platform |
| [`prompts/variants/video-first-tiktok.md`](./prompts/variants/video-first-tiktok.md)       | TikTok-style short-video platform    |

</content>
