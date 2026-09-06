# Photo / AI Media — Boilerplate Prompt Pack

An **app-archetype prompt pack** for this skill: a dependency-ordered set of copy-paste-ready prompts for building a B2C photo / AI-media product (AI avatar or headshot generator, photo enhancer/restorer, AI art/image studio, media-transform utility). Routing, the upfront archetype question, and how each prompt threads into the launch lanes live in [`../../../knowledge/product/photo-ai-media.md`](../../../knowledge/product/photo-ai-media.md). Read that first.

These are **starting prompts**, not final code. Each file has a copy-paste block plus skill-integration notes.

## How to use

1. Confirm the product shape via **AskUserQuestion** (media shape, primary surface, optional systems, niche) — see the reference. Record the selected archetype, scope, and product decisions in `product.yaml`, then render `PRODUCT.md`.
2. **Copy the runnable starter** ([`starter/`](./starter/README.md)) into the business repo and install it — it is the pre-wired floor (auth, tested owner-only RLS migrations, Supabase Storage wiring, PostHog event catalog, Stripe/RevenueCat stubs, names-only `.env.example`, CI). Do not regenerate this wiring from scratch; `check:archetype-starter` enforces its contract.
3. Run prompt **00** strategy work on the web interface / Claude.ai.
4. Run prompts **01 → 04** in order as Claude Code build prompts against the starter (the starter README maps each prompt to the scaffold area it customizes). Build one system, test it, then move on.
5. Add optional prompts **05 → 07** based on the founder's selection.
6. Run **08** (content safety & rights) before any public launch — App Store review expects a moderation story from AI-generation apps; this is a launch gate, not a V2 item.
7. Apply a **variant** (avatar/headshot studio or photo restoration) if relevant.

## Default stack

Next.js App Router + Supabase (Postgres, Auth, **Storage for media**) + Vercel, with all generation calls behind server routes. The **AI generation provider is deliberately not hardcoded**: which image model/provider to use is a paid, founder-gated decision — route it through `paid-tool-routing.md`, record it in `strategy/TOOL_DECISIONS.md`, and keep its API key server-side only via `secrets-management.md` / `SECRETS.md`. Monetization: RevenueCat for native IAP, Stripe for web; per-generation COGS means **credits/metering must exist before monetization**. For a native-mobile surface (camera-first products often need it), the backend carries over but the client is adapted and the Apple/Play store lanes apply in full.

## Build order

| #   | File                                                                                   | Build it                                                                              | Optional?                     |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| 00  | [`prompts/00-positioning-strategy.md`](./prompts/00-positioning-strategy.md)           | Transformation, wow moment, niche, first 100 users (Claude.ai)                        | strategy                      |
| 01  | [`prompts/01-database-schema.md`](./prompts/01-database-schema.md)                     | Schema (profiles, media_assets, generations, credits) + RLS + Storage policies + seed | required                      |
| 02  | [`prompts/02-auth-system.md`](./prompts/02-auth-system.md)                             | Auth + profile (anonymous-try tradeoff noted)                                         | required                      |
| 03  | [`prompts/03-capture-and-library.md`](./prompts/03-capture-and-library.md)             | Upload/capture, signed URLs, library grid, before/after reveal                        | required                      |
| 04  | [`prompts/04-ai-generation-pipeline.md`](./prompts/04-ai-generation-pipeline.md)       | Server-side generation route, job/queue, cost tracking, provider-agnostic             | required                      |
| 05  | [`prompts/05-editing-and-presets.md`](./prompts/05-editing-and-presets.md)             | Presets/styles, re-run with tweaks, watermark lever                                   | optional                      |
| 06  | [`prompts/06-credits-and-monetization.md`](./prompts/06-credits-and-monetization.md)   | Credit packs vs subscription, paywall                                                 | optional                      |
| 07  | [`prompts/07-sharing-and-virality.md`](./prompts/07-sharing-and-virality.md)           | Share/export, branded frame, viral loop                                               | optional                      |
| 08  | [`prompts/08-content-safety-and-rights.md`](./prompts/08-content-safety-and-rights.md) | NSFW/CSAM filtering, consent, rights posture, takedown, age gating                    | required before public launch |

## Variants

| File                                                                                         | Turns the base into                                                                |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`prompts/variants/avatar-headshot-studio.md`](./prompts/variants/avatar-headshot-studio.md) | Identity-conditioned avatar/headshot studio (selfie training set → generated pack) |
| [`prompts/variants/photo-restoration.md`](./prompts/variants/photo-restoration.md)           | Single-image enhance/restore utility with a focused product scope                          |
