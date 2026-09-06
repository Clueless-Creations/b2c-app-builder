# AI Chat / Companion — Boilerplate Prompt Pack

The second **app-archetype prompt pack** for this skill: a dependency-ordered set of copy-paste-ready prompts for building a B2C AI chat product (assistant, companion/character, or domain copilot). Routing, the upfront archetype question, and how each prompt threads into the launch lanes live in [`../../../knowledge/product/ai-chat-companion.md`](../../../knowledge/product/ai-chat-companion.md). Read that first.

These are **starting prompts**, not final code. Each file has a copy-paste block plus skill-integration notes.

## How to use

1. Confirm the product shape via **AskUserQuestion** (chat type, primary surface, modality, memory depth, safety scope) — see the reference. Record the selected archetype, scope, and product decisions in `product.yaml`, then render `PRODUCT.md`.
2. **Copy the runnable starter** ([`starter/`](./starter/README.md)) into the business repo and install it — it is the pre-wired floor (auth, tested owner-only RLS migrations, a server-side streaming Claude route, PostHog event catalog, Stripe/RevenueCat stubs, names-only `.env.example`, CI). Do not regenerate this wiring from scratch; `check:archetype-starter` enforces its contract.
3. Run prompt **00** strategy work on the web interface / Claude.ai.
4. Run prompts **01 → 04** in order as Claude Code build prompts against the starter (the starter README maps each prompt to the scaffold area it customizes). Build one system, test it, then move on.
5. Add optional prompts **05 → 07** based on the founder's selection; run **08** (safety) before any public launch.
6. Apply a **variant** (companion/character or voice-first) if relevant.

## Default stack

Next.js App Router + Supabase (Postgres, Auth, Realtime, Storage) + Vercel + **Claude API server routes** (key server-side only), with Stripe for web monetization. Confirm current Claude model IDs/params via the `claude-api` skill; do not hardcode from memory. For a native-mobile surface, the inference backend carries over but the client is adapted and the Apple/Play store lanes apply.

## Build order

| #   | File                                                                             | Build it                                                     | Optional?                     |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| 00  | [`prompts/00-positioning-strategy.md`](./prompts/00-positioning-strategy.md)     | Positioning & wedge (Claude.ai)                              | strategy                      |
| 01  | [`prompts/01-database-schema.md`](./prompts/01-database-schema.md)               | Schema (conversations, messages, usage, memory) + RLS + seed | required                      |
| 02  | [`prompts/02-auth-system.md`](./prompts/02-auth-system.md)                       | Auth + profile                                               | required                      |
| 03  | [`prompts/03-chat-core-loop.md`](./prompts/03-chat-core-loop.md)                 | Chat UI + streaming + conversation history                   | required                      |
| 04  | [`prompts/04-model-integration.md`](./prompts/04-model-integration.md)           | Claude API server route, system prompt, context management   | required                      |
| 05  | [`prompts/05-memory-personalization.md`](./prompts/05-memory-personalization.md) | Long-term memory + personalization                           | optional                      |
| 06  | [`prompts/06-usage-limits-metering.md`](./prompts/06-usage-limits-metering.md)   | Usage metering + free-tier caps                              | required for monetization     |
| 07  | [`prompts/07-stripe-monetization.md`](./prompts/07-stripe-monetization.md)       | Subscription (higher limits / better model)                  | optional                      |
| 08  | [`prompts/08-safety-and-moderation.md`](./prompts/08-safety-and-moderation.md)   | Moderation, jailbreak resistance, crisis + age gating        | required before public launch |

## Variants

| File                                                                                   | Turns the base into                     |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| [`prompts/variants/companion-character.md`](./prompts/variants/companion-character.md) | Persona-driven companion/character app  |
| [`prompts/variants/voice-first.md`](./prompts/variants/voice-first.md)                 | Voice-in / voice-out conversational app |

</content>
