# AI Chat / Companion Build Lane

Use this reference when the founder wants to build an **AI chat product** — "an AI assistant app", "a chatbot for <domain>", "an AI companion/character", "a coach/tutor/therapist-style chat app", "talk to an AI that remembers me". It is the second **app-archetype prompt pack** (peer to [`social-network.md`](./social-network.md)), shipped as reusable boilerplate under [`../surfaces/starters/ai-chat-companion/`](../../surfaces/starters/ai-chat-companion/README.md).

Like the social lane, this is a layer on top of the launch workflow, not a replacement. It gives the engineering stages a proven sequence and ready prompts for one product shape and routes each piece back into the existing lanes (research, 11-star, emotional design, security/safety, revenue, analytics). It does not skip evidence, design, safety, or provider-proof gates.

## When To Use

Load this reference when the product's core is **a user talking to an LLM over multiple turns**, with conversation history, and usually memory, personalization, and a usage/subscription model. Comparable products: ChatGPT/Claude-style assistants, Character.AI/Replika-style companions, domain copilots (legal, fitness, language tutor), and voice assistants.

Do **not** use it for a product that merely has a support chatbot bolted onto a different core; it is for products whose center of gravity is the conversation itself.

## Step 1 — Confirm The Shape (AskUserQuestion)

Before building, confirm the product shape with the founder via **AskUserQuestion** (or a plain founder choice if unavailable). These answers change the schema, the system prompt, the memory model, the safety posture, and the store path.

1. **Chat type** — what is the conversation for?
   - **Assistant / productivity** (ChatGPT model): task-oriented, tool-using, accuracy-first.
   - **Companion / character** (Character.AI / Replika model): persona-driven, relationship + memory, emotional tone. Higher safety burden.
   - **Domain copilot** (coach / tutor / advisor): a bounded expert in one domain with a strong system prompt and guardrails.
2. **Primary surface** — **Web / PWA** (default stack: Next.js App Router + Supabase + Vercel + Claude API server routes) or **native mobile** (same backend; client adapted; Apple/Play store lanes apply; digital subscriptions go through IAP).
3. **Modality** — an intentionally text-only product, or **voice-first** (speech-to-text in, TTS out)? Voice adds latency, audio storage, and cost.
4. **Memory depth** — session-only, or **long-term per-user memory** the model recalls across conversations? Long-term memory is the "feels like it knows me" moment and a privacy/security item.
5. **Audience & safety scope** — general adult, or could **minors** use it? Companion/character and any minor exposure raise the safety bar (crisis protocols, age gating) from optional to required.

Record the answers in `state/business-state.json` (e.g. `lanes.product.archetype: ai-chat-companion`, `chat_type`, `primary_surface`, `modality`, `memory_depth`, `safety_scope`).

Honesty note: the bundled prompts target **web (Next.js + Supabase + Claude API)**. The Claude API key and all inference calls must be **server-side only** — never ship the key to the client. For native mobile, the inference proxy/backend carries over unchanged; the chat client is re-expressed for the native stack and IAP applies.

## Runnable Starter

The pack ships a runnable scaffold at [`../surfaces/starters/ai-chat-companion/starter/`](../../surfaces/starters/ai-chat-companion/starter/README.md): Next.js App Router + Supabase pre-wired with magic-link auth, owner-only schema migrations with **tested** RLS (pgTAP, per `backend-data-contract.md`), a server-side streaming Claude route (`ANTHROPIC_API_KEY` never reaches the client; the model id lives in `ANTHROPIC_MODEL`, resolved via the `claude-api` skill), Stripe and RevenueCat stubs, a PostHog event catalog matching the analytics lane's snake_case conventions, a names-only `.env.example`, and a CI workflow. Copy it into the business repo as the floor and customize it with the prompts below — its README maps each prompt to the scaffold area it customizes. Do not improvise the same wiring from scratch; `check:archetype-starter` enforces the starter contract. If the founder selects Firebase or a custom backend, adapt through the data-contract lane instead of running the Supabase pieces verbatim.

## The Core Systems

Every AI chat product is built on six systems. Inference and safety are the two that most teams under-build.

1. **User Identity** — auth, sessions, profile. → prompt `02-auth-system`.
2. **Conversations & Messages** — threads, message history, ordering, soft-delete, streaming render. → `01-database-schema`, `03-chat-core-loop`.
3. **Inference & Context** — the server route to Claude, the system prompt, streaming, context-window management, and conversation summarization. The product's quality lives here. → `04-model-integration`.
4. **Memory & Personalization** — per-user persona and long-term memory retrieved into context; user-editable. → `05-memory-personalization`.
5. **Usage & Monetization** — message/token metering, free-tier caps, rate limits, and the subscription that raises limits / unlocks a better model. → `06-usage-limits-metering`, `07-stripe-monetization`.
6. **Safety & Moderation** — input/output moderation, jailbreak resistance, crisis/self-harm protocols, and age gating. Non-optional before public launch. → `08-safety-and-moderation`.

## The Build Sequence

Build one system at a time and test it. Prompts live in [`../surfaces/starters/ai-chat-companion/prompts/`](../../surfaces/starters/ai-chat-companion/README.md):

| #   | Prompt                                                 | Core system                    | Threads into                                                               |
| --- | ------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------- |
| 00  | `00-positioning-strategy` (Claude.ai, not Claude Code) | positioning                    | `strategy/RESEARCH.md`, naming, `VIRAL_GROWTH.md`                          |
| 01  | `01-database-schema`                                   | conversations + usage + memory | `engineering/TECH_SPEC.md`, engineering, security (RLS)                    |
| 02  | `02-auth-system`                                       | identity                       | engineering, `trust/SECURITY.md`, `SECRETS.md`                             |
| 03  | `03-chat-core-loop`                                    | conversations + streaming UI   | `11_STAR_EXPERIENCE.md`, `analytics/ANALYTICS.md`                          |
| 04  | `04-model-integration`                                 | inference + context            | `engineering/TECH_SPEC.md`, `SECRETS.md`, security                         |
| 05  | `05-memory-personalization` (optional)                 | memory                         | `consumer-product-design-agency.md`, privacy                               |
| 06  | `06-usage-limits-metering`                             | usage                          | `revenue-monetization.md`, `analytics/ANALYTICS.md`                        |
| 07  | `07-stripe-monetization` (optional)                    | revenue                        | `revenue-monetization.md`, `revenue/REVENUE_OPS.md`                        |
| 08  | `08-safety-and-moderation`                             | safety                         | `security-release-hardening.md`, `ethics-guardrail.md`, `privacy-terms.md` |

Variants (apply after the text base): [`variants/companion-character`](../../surfaces/starters/ai-chat-companion/prompts/variants/companion-character.md) and [`variants/voice-first`](../../surfaces/starters/ai-chat-companion/prompts/variants/voice-first.md).

Step 0 (positioning) is strategic work for the **web interface / Claude.ai**. The rest are Claude Code build prompts.

## How This Lane Threads Into The Launch Workflow

- **The system prompt is a product asset, not a code detail.** It encodes the persona, the domain guardrails, the refusal style, and the safety rules. Version it, review it against `strategy/BRAND.md §Voice`, and treat changes as [`change-cascade.md`](../process/change-cascade.md) events. When building AI features in this skill, follow the Claude API guidance (the `claude-api` skill) for current model IDs, streaming, tool use, and prompt-caching — do not hardcode model names or pricing from memory.
- **Inference keys are server-side secrets.** The Claude API key never reaches the client; all calls go through a server route or edge function. Route the key through `SECRETS.md` ([`secrets-management.md`](../operations/secrets-management.md)) and treat the inference endpoint as an abuse/cost surface in `trust/SECURITY.md` (rate limits, per-user quotas, prompt-injection handling).
- **The first response is the 11-star moment.** Run [`eleven-star-experience.md`](../experience/eleven-star-experience.md) over prompt 03/04: streaming that feels alive, and (with memory) a reply that reflects the user's own context, is the magical accepted product experience. The memory recall is an Intent Mirroring moment (`consumer-product-design-agency.md`); give it a PostHog event and an honest "based on what you told me" attribution per the Human-Centered AI tier.
- **Usage metering is the monetization spine.** Prompt 06 meters messages/tokens and enforces free-tier caps before prompt 07 sells the upgrade. Reconcile caps, model tiers, and price with `revenue-monetization.md` (Stripe for web; IAP/StoreKit for native digital subscriptions). The upgrade prompt at the cap is an onboarding/paywall-timing decision (`onboarding-conversion.md`).
- **Safety is a launch gate, scaled to audience.** Prompt 08 is required before public launch: input/output moderation (Claude API or a classifier), jailbreak resistance, and — for companion/character apps or any product minors can reach — crisis/self-harm escalation copy and age gating. This is both a `security-release-hardening.md` item and an `ethics-guardrail.md` item: a companion that encourages dependency or misrepresents itself as human/licensed is a dark pattern and a compliance veto. Reflect data retention and AI-use disclosures in `privacy-terms.md`.
- **AI-result honesty is a copy rule.** Per the Human-Centered AI tier in `consumer-product-design-agency.md`: every AI result attributes itself to user context where relevant, never claims certainty it cannot verify, and keeps a visible user-override/edit path. Add the rule to `strategy/BRAND.md §Voice`.

## Infrastructure Defaults (record decisions, do not hardcode)

- **Inference:** Claude API via server routes/edge functions, streaming. Use prompt caching for the system prompt + long memory to cut latency and cost. Confirm the current model IDs/params via the `claude-api` skill.
- **Backend:** Supabase (Postgres + Auth + Realtime + Storage). Conversations and messages in Postgres with RLS; long-term memory as a per-user store (optionally a `pgvector` embedding table for retrieval).
- **Hosting:** Vercel (web). Mind serverless function timeouts for long streams; use streaming responses, not buffered.
- **Moderation:** an input/output moderation pass on every turn before public launch.
- **Resilience:** wrap the inference call in a circuit breaker. Open the circuit after repeated provider failures. Return a structured error with an `is_retryable` field, not a raw exception string. Show the user a graceful degraded state during an open circuit, never a hung request.
- **Email:** verification and lifecycle via `resend-email-ops.md`.

## Extending / Acceptance

This pack follows the archetype contract enforced by `check:app-archetype` (README + numbered prompts with fenced blocks + reference + SKILL.md routing + agent-behavior eval). To add another archetype, mirror this shape under `starters/<archetype>/`.

Before calling an AI-chat build ready:

- [ ] Chat type, surface, modality, memory depth, and safety scope confirmed via AskUserQuestion and recorded in `state/business-state.json`.
- [ ] Claude API key is server-side only; inference endpoint has per-user rate limits/quotas and prompt-injection handling in `trust/SECURITY.md`.
- [ ] System prompt is versioned and reviewed against `strategy/BRAND.md §Voice`.
- [ ] Streaming + context-window management + summarization are specified in `engineering/TECH_SPEC.md`; current model IDs/params sourced via the `claude-api` skill, not memory.
- [ ] Usage metering + free-tier caps reconciled with `revenue-monetization.md`; correct billing path for the surface (Stripe web / IAP native).
- [ ] Safety pass (moderation, jailbreak resistance, crisis protocol + age gating where the audience requires) complete; ethics-guardrail and privacy/AI-use disclosures reconciled.
- [ ] AI-result honesty copy rule in `strategy/BRAND.md §Voice`; memory recall has a PostHog event and a user-editable/override path.
</content>
