# AI Chat Companion Starter (runnable scaffold)

A runnable Next.js App Router + Supabase scaffold for the ai-chat-companion archetype. It is the **floor the prompt pack customizes**, not a replacement for the prompts: copy it into the business repo, install, and then run the pack's prompts against it instead of asking an agent to improvise the same wiring.

Pinned dependency versions were refreshed from the npm registry and current official docs on **2026-06-10** (Next.js 16 — note `proxy.ts` replaced `middleware.ts`; `@supabase/ssr` 0.12; `@anthropic-ai/sdk` 0.104). Refreshing pins is a deliberate, reviewed skill change.

## Use

```bash
cp -R starter/ <business-repo>/app-web   # or the repo root if web is the only surface
cd <business-repo>/app-web
mv .gitignore.template .gitignore
npm install
cp .env.example .env.local                # then fill via Doppler — never commit values
npm run dev
supabase test db                          # RLS tests (requires the local Supabase stack)
```

Secrets: `.env.example` is names-only. `ANTHROPIC_API_KEY` stays server-side only, routed per `secrets-management.md` and recorded in `SECRETS.md`. The model id is `ANTHROPIC_MODEL` — resolve the current id via the **claude-api skill**, never from memory.

Backend: this starter is the **supabase-route artifact** of `backend-data-contract.md`. If the founder selects Firebase or a custom backend, replace `supabase/`, `lib/supabase/`, and `proxy.ts` through the data-contract lane (Backend Selection + reason, Data Model, tested Authorization Model, Migrations And Environments) and adapt the prompts — do not run the Supabase prompts verbatim against another backend.

## Prompt → scaffold map

Each prompt customizes a specific area. Run them in pack order (see [`../README.md`](../README.md)).

| Prompt | Customizes |
|---|---|
| `00-positioning-strategy.md` | No code — positioning feeds `strategy/RESEARCH.md`, naming, `growth/LAUNCH_NARRATIVE.md`. |
| `01-database-schema.md` | `supabase/migrations/0001_init.sql` (extend schema/indexes) + `supabase/tests/0001_rls.test.sql` (every new table gets tested owner-only policies). |
| `02-auth-system.md` | `app/login/`, `app/auth/confirm/route.ts`, `lib/supabase/*`, `proxy.ts` (OAuth providers, profile setup). |
| `03-chat-core-loop.md` | `app/chat/page.tsx` + `app/api/chat/route.ts` (conversation persistence, history, streaming UX) + `lib/analytics/events.ts` core-loop events. |
| `04-model-integration.md` | `app/api/chat/route.ts` — system prompts/personas, context-window management, summarization; model id stays in `ANTHROPIC_MODEL` (resolve via the claude-api skill). |
| `05-memory-personalization.md` | `memories` table in `supabase/migrations/` + memory read/write in `app/api/chat/route.ts` (`memory_saved` event). |
| `06-usage-limits-metering.md` | `usage_events` table + the quota TODO in `app/api/chat/route.ts` (`usage_limit_reached` event, paywall handoff). |
| `07-stripe-monetization.md` | `lib/billing/stripe.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`; native IAP path via `lib/billing/revenuecat.ts` + `app/api/revenuecat/webhook/route.ts`. |
| `08-safety-and-moderation.md` | the moderation TODO in `app/api/chat/route.ts` (`moderation_flagged` event) — a launch gate for any public chat product, not a V2 item. |
| `variants/companion-character.md` | persona fields on `profiles`/`conversations` and persona-aware prompts in `app/api/chat/route.ts`. |
| `variants/voice-first.md` | adds voice capture/playback to `app/chat/` on top of the same chat API. |

## What is wired

- **Auth**: Supabase magic-link sign-in, session refresh in `proxy.ts` (Next.js 16), server/browser clients per current `@supabase/ssr` docs.
- **Schema + RLS**: profiles, conversations, messages, memories, usage_events — owner-only policies tested via pgTAP (`npm run test:rls`).
- **Claude inference**: server-only streaming route (`app/api/chat/route.ts`) with quota and moderation hooks marked for prompts 06/08.
- **Analytics**: PostHog with a typed snake_case event catalog (`lib/analytics/events.ts`) following the analytics lane conventions.
- **Billing stubs**: Stripe checkout/webhook (web) and RevenueCat webhook → entitlement projection (native) — inert until keys are routed; provider proof required before the revenue lane is done.
- **CI**: typecheck + build with placeholder public env only.
