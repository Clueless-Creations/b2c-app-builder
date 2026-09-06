# Photo / AI Media Build Lane

Use this reference when the founder wants to build a **photo / AI-media product** — "an AI avatar app", "a headshot generator", "a photo enhancer/restorer", "an AI art app", "an app that turns photos into X". It is an **app-archetype prompt pack** (peer to [`social-network.md`](./social-network.md) and [`ai-chat-companion.md`](./ai-chat-companion.md)), shipped as reusable boilerplate under [`../surfaces/starters/photo-ai-media/`](../../surfaces/starters/photo-ai-media/README.md).

Like the other archetype lanes, this is a layer on top of the launch workflow, not a replacement. It gives the engineering stages a proven sequence and ready prompts for one product shape and routes each piece back into the existing lanes (research, 11-star, emotional design, security/privacy, revenue, analytics, safety). It does not skip evidence, design, safety, or provider-proof gates.

## When To Use

Load this reference when the product's core is **a user's photo going in and an AI-transformed image coming out** — with a media library, a metered generation pipeline, and a before/after reveal as the central moment. Comparable products: AI headshot/avatar generators, photo restorers and enhancers, AI art/image studios, and "turn your photo into X" utilities.

Do **not** use it for a product that merely has an AI filter bolted onto a different core (a social network with one effect, a chat app that can make images); it is for products whose center of gravity is the transformation itself.

## Step 1 — Confirm The Shape (AskUserQuestion)

Before building, confirm the product shape with the founder via **AskUserQuestion** (or a plain founder choice if unavailable). These answers change the schema, the pipeline, the consent posture, the monetization model, and the store path. Ask, in one batched call:

1. **Media shape** — what is the transformation?
   - **Identity-conditioned avatars/headshots**: a training set of selfies → generated packs of the user's own face. Highest consent and retention-rule burden; pack economics.
   - **Single-image transform/restore**: one photo in → one enhanced/restored/stylized photo out. Simplest shape; lite-tier friendly.
   - **Open prompt-to-image studio**: free-text prompts, with or without an input photo. Broadest surface, heaviest prompt-screening burden.
2. **Primary surface** — **Web / PWA** (default stack: Next.js App Router + Supabase + Vercel) or **native mobile**? A camera-first capture experience pushes native; if native, the Apple/Play store lanes in `SKILL.md` apply in full and digital purchases go through IAP.
3. **Which optional systems are in the accepted product?** (multi-select) — editing/presets, credits/monetization, sharing/virality. These map to prompts 05–07.
4. **Niche** — who is this for, and on what occasion? (Free text. Feeds prompt 00 positioning. A focused niche with a recurring occasion beats a general-purpose generator.)

Record the answers in `state/business-state.json` (e.g. `lanes.product.archetype: photo-ai-media`, `media_shape`, `primary_surface`, `optional_systems`) so later sessions do not re-litigate the shape.

Honesty note on the stack: the bundled prompts target **web (Next.js + Supabase + Vercel)**. The storage, schema, RLS, and generation-pipeline prompts carry over unchanged to native; the capture/library/reveal client prompts must be re-expressed for the native stack, and camera-first products usually deserve that investment.

## Runnable Starter

The pack ships a runnable scaffold at [`../surfaces/starters/photo-ai-media/starter/`](../../surfaces/starters/photo-ai-media/starter/README.md): Next.js App Router + Supabase pre-wired with magic-link auth, owner-only schema migrations with **tested** RLS (pgTAP, per `backend-data-contract.md`), private Storage wiring, Stripe and RevenueCat stubs, a PostHog event catalog matching the analytics lane's snake_case conventions, a names-only `.env.example`, and a CI workflow. The **generation provider is deliberately unbound** in the starter: the provider adapter is a stub, because which image model/provider to pay for is a founder-gated decision routed through [`paid-tool-routing.md`](../operations/paid-tool-routing.md), recorded in `strategy/TOOL_DECISIONS.md`, with its key server-side via `SECRETS.md`. Copy the starter into the business repo as the floor and customize it with the prompts below — its README maps each prompt to the scaffold area it customizes. Do not improvise the same wiring from scratch; `check:archetype-starter` enforces the starter contract. If the founder selects Firebase or a custom backend, adapt through the data-contract lane instead of running the Supabase pieces verbatim.

## The Core Systems

Every photo/AI-media product is built on five systems. The generation pipeline and the safety/rights layer are the two that most teams under-build.

1. **User Identity** — auth, sessions, profile; the anonymous-try tradeoff. → prompt `02-auth-system`.
2. **Media Storage & Library** — uploads and outputs in private object storage, owner-scoped paths, signed URLs, the library grid. → `01-database-schema`, `03-capture-and-library`.
3. **Generation Pipeline & Metering** — the server-side job system: queue, status, idempotency, retries, and per-generation cost in a credit ledger. Product cost lives here. → `01-database-schema`, `04-ai-generation-pipeline`, `06-credits-and-monetization`.
4. **Reveal & Editing Surface** — the before/after reveal, presets/styles, re-runs. Product joy lives here. → `03-capture-and-library`, `05-editing-and-presets`, `07-sharing-and-virality`.
5. **Safety & Rights Layer** — NSFW/CSAM screening on input and output, likeness consent, rights posture, takedown, age gating. Non-optional before public launch. → `08-content-safety-and-rights`.

## The Build Sequence

Build one system at a time and test it. Prompts live in [`../surfaces/starters/photo-ai-media/prompts/`](../../surfaces/starters/photo-ai-media/README.md):

| #   | Prompt                                                 | Core system                   | Threads into                                                                                |
| --- | ------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------- |
| 00  | `00-positioning-strategy` (Claude.ai, not Claude Code) | positioning                   | `strategy/RESEARCH.md`, naming, `growth/LAUNCH_NARRATIVE.md`                                |
| 01  | `01-database-schema`                                   | media + generations + credits | `engineering/TECH_SPEC.md`, engineering, security (RLS + Storage policies)                  |
| 02  | `02-auth-system`                                       | identity                      | engineering, `trust/SECURITY.md`, `SECRETS.md`                                              |
| 03  | `03-capture-and-library`                               | storage + library + reveal    | `11_STAR_EXPERIENCE.md`, `analytics/ANALYTICS.md`, privacy                                  |
| 04  | `04-ai-generation-pipeline`                            | pipeline + metering           | `strategy/TOOL_DECISIONS.md`, `SECRETS.md`, `ethics-guardrail.md`, `analytics/ANALYTICS.md` |
| 05  | `05-editing-and-presets` (optional)                    | reveal/editing                | `consumer-product-design-agency.md`, revenue                                                |
| 06  | `06-credits-and-monetization` (optional)               | metering + revenue            | `revenue-monetization.md`, `revenue/REVENUE_OPS.md`                                         |
| 07  | `07-sharing-and-virality` (optional)                   | sharing/growth                | `viral-growth-loops.md`, `VIRAL_GROWTH.md`                                                  |
| 08  | `08-content-safety-and-rights`                         | safety/rights                 | `security-release-hardening.md`, `ethics-guardrail.md`, `privacy-terms.md`, store review    |

Variants (apply after the base): [`variants/avatar-headshot-studio`](../../surfaces/starters/photo-ai-media/prompts/variants/avatar-headshot-studio.md) and [`variants/photo-restoration`](../../surfaces/starters/photo-ai-media/prompts/variants/photo-restoration.md).

Step 0 (positioning) is strategic work for the **web interface / Claude.ai**. The rest are Claude Code build prompts. Prompt 08 is required **before any public launch**, regardless of which optional prompts ship.

## How This Lane Threads Into The Launch Workflow

- **The before/after reveal is the 11-star moment.** Run [`eleven-star-experience.md`](../experience/eleven-star-experience.md) over prompts 03/04: the second the user drags the slider and sees their photo transformed is the magical accepted product experience — everything else sets it up. Name it as an engineered moment with a PostHog event and a reduced-motion fallback (`consumer-product-design-agency.md`, `emotional-design-system.md`).
- **The reveal is a Variable Reward card — HIGH risk.** Output quality genuinely varies between runs, which is exactly the variable-ratio mechanism `ethics-guardrail.md` rates HIGH. The card's contract is mandatory: `ethics_attestation`, a `user_control_escape_hatch` (the user can always stop; no near-miss engineering, no "one more spin" pressure at the credit floor), a `counter_metric` (e.g. regeneration spirals per session), and `reward_variation_proof` (variation is the model's real output variance, never manufactured). The generation wait is a Perceived Effort Delay card: progress reflects the real job status (`computation_type: real_api_call`) — no fake work, no padded timers.
- **The four lane events must exist in `analytics/ANALYTICS.md` before surfaces lock:** `media_uploaded`, `generation_started`, `generation_completed`, `media_shared` (per `analytics-attribution.md`; counts and metadata, never image content). Prompts 03–07 add their own surface events on top.
- **Per-generation COGS reshapes the revenue lane.** Every generation has a provider invoice behind it, so **metering precedes monetization**: the credit ledger (prompt 01) and cost tracking (prompt 04) come before any paywall (prompt 06). Reconcile the model with `revenue-monetization.md` and treat its §3 SOSA 2026 figures (hard paywall ~5x freemium, yearly-dominant highest LTV, price as quality signal, AI apps earn more per payer but churn faster) as **defaults to test, not dogma**. Pricing, plan mix, and the free grant are founder-gated.
- **The generation provider is a paid-tool decision, not a default.** Do not hardcode a model/provider: route the choice through `paid-tool-routing.md`, confirm with the founder, record it in `strategy/TOOL_DECISIONS.md`, and keep the key server-side via `SECRETS.md` ([`secrets-management.md`](../operations/secrets-management.md)). The pipeline's adapter interface exists so the decision stays swappable.
- **Faces are biometric-adjacent PII.** Owner-scoped storage paths, signed URLs only (media never served from the app server, no public buckets), tested RLS on every user-data table, EXIF GPS stripping, and real retention/deletion paths (rows + storage objects + provider-side copies) are `security-release-hardening.md` and `privacy-terms.md` items, hardened further by the avatar variant's identity-retention rules.
- **Safety and rights are a launch gate.** Prompt 08 — NSFW/CSAM screening on input AND output, likeness consent, the training-data/rights posture store review asks about, a takedown path, and age gating — is required before any public launch. App Review rejects AI-generation apps without a moderation story; deceptive intimate imagery and non-consensual likeness use are `ethics-guardrail.md` compliance vetoes.

## Infrastructure Defaults (record decisions, do not hardcode)

- **Backend:** Supabase (Postgres + Auth + **Storage**). All media in private Storage buckets with owner-scoped paths and signed URLs; never serve media from the app server. At significant media volume, migrate to zero-egress object storage.
- **Generation provider:** deliberately unbound — founder-gated via `paid-tool-routing.md`, recorded in `strategy/TOOL_DECISIONS.md`, key server-side via `SECRETS.md`. Generation runs as server-side jobs with status polling, idempotency, and per-generation cost recording.
- **Hosting:** Vercel (web). Long generations run as background jobs the client polls — do not hold serverless requests open for the provider.
- **Moderation:** input AND output image screening (plus prompt screening for the studio shape) wired before public launch — a store-review requirement for this category, not a nicety.
- **Monetization:** Stripe for web; RevenueCat over StoreKit/Play Billing for native IAP (packs are consumables). Credits/metering first.
- **Email:** magic links, "pack is ready" notifications, and lifecycle via `resend-email-ops.md`.

## Extending / Acceptance

This pack follows the archetype contract enforced by `check:app-archetype` (README + numbered prompts with fenced blocks + reference + SKILL.md routing + agent-behavior eval). To add another archetype, mirror this shape under `starters/<archetype>/`.

Before calling a photo/AI-media build ready:

- [ ] Media shape, primary surface, optional systems, and niche confirmed via AskUserQuestion and recorded in `state/business-state.json`.
- [ ] Generation provider chosen via `paid-tool-routing.md` with the founder, recorded in `strategy/TOOL_DECISIONS.md`; the provider key is server-side only via `SECRETS.md`; the pipeline route has ownership checks, credit checks, rate limits, and a concurrency cap in `trust/SECURITY.md`.
- [ ] Schema (prompt 01) reconciled with `engineering/TECH_SPEC.md`; every user-data table has a tested owner-only RLS policy and the Storage bucket policies enforce owner-scoped paths; media is served only via signed URLs.
- [ ] The before/after reveal is run through `11_STAR_EXPERIENCE.md`; the Variable Reward card carries `ethics_attestation`, `user_control_escape_hatch`, `counter_metric`, and `reward_variation_proof`; the wait state is honest progress (no fake work).
- [ ] `media_uploaded`, `generation_started`, `generation_completed`, `media_shared` exist in `analytics/ANALYTICS.md` before surfaces lock.
- [ ] Credits/metering (with per-generation cost) precede any paywall; monetization reconciled with `revenue-monetization.md` (§3 defaults surfaced as tests) and the correct billing path for the surface (Stripe web / IAP native); pricing founder-gated.
- [ ] Safety/rights pass (prompt 08) complete before public launch: input/output (and prompt) screening, CSAM detection + reporting, likeness consent, rights posture, takedown path, age gating; reconciled with `privacy-terms.md` and the store-review moderation story.
- [ ] Retention/deletion paths for faces (rows + storage + provider-side copies; identity data for the avatar variant) documented and working.
- [ ] Positioning outputs from prompt 00 flow into `strategy/RESEARCH.md`, naming, and `growth/LAUNCH_NARRATIVE.md`.
