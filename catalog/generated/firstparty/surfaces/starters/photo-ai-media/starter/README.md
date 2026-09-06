# Photo / AI Media Starter (runnable scaffold)

A runnable Next.js App Router + Supabase scaffold for the photo-ai-media archetype. It is the **floor the prompt pack customizes**, not a replacement for the prompts: copy it into the business repo, install, and then run the pack's prompts against it instead of asking an agent to improvise the same wiring.

Pinned dependency versions were refreshed from the npm registry and current official docs on **2026-06-10** (Next.js 16 — note `proxy.ts` replaced `middleware.ts`; `@supabase/ssr` 0.12). Refreshing pins is a deliberate, reviewed skill change.

## Use

```bash
cp -R starter/ <business-repo>/app-web   # or the repo root if web is the only surface
cd <business-repo>/app-web
mv .gitignore.template .gitignore
npm install
cp .env.example .env.local                # then fill via Doppler — never commit values
npm run dev
supabase test db                          # RLS + storage policy tests (requires the local Supabase stack)
```

Secrets: `.env.example` is names-only. Route every value per `secrets-management.md` (Doppler default, `doppler run --`), and record each name in `SECRETS.md`.

Provider: the AI generation provider is **deliberately not hardcoded**. Selecting one is a founder-gated paid-tool decision (`paid-tool-routing.md`, recorded in `strategy/TOOL_DECISIONS.md`); its key lives server-side as `MEDIA_GENERATION_API_KEY`. The generation route ships as a provider-agnostic job stub until that decision is made.

Backend: this starter is the **supabase-route artifact** of `backend-data-contract.md`. If the founder selects Firebase or a custom backend, replace `supabase/`, `lib/supabase/`, and `proxy.ts` through the data-contract lane (Backend Selection + reason, Data Model, tested Authorization Model, Migrations And Environments) and adapt the prompts — do not run the Supabase prompts verbatim against another backend.

## Prompt → scaffold map

Each prompt customizes a specific area. Run them in pack order (see [`../README.md`](../README.md)).

| Prompt | Customizes |
|---|---|
| `00-positioning-strategy.md` | No code — positioning feeds `strategy/RESEARCH.md`, naming, `growth/LAUNCH_NARRATIVE.md`. |
| `01-database-schema.md` | `supabase/migrations/0001_init.sql` (media_assets/generations/usage_events + owner-scoped storage policies) + `supabase/tests/0001_rls.test.sql`. |
| `02-auth-system.md` | `app/login/`, `app/auth/confirm/route.ts`, `lib/supabase/*`, `proxy.ts` (OAuth providers, anonymous-try tradeoffs). |
| `03-capture-and-library.md` | `app/library/page.tsx` (upload to the `media` bucket, signed-URL thumbnails, before/after reveal) + `media_uploaded` wiring. |
| `04-ai-generation-pipeline.md` | `app/api/generate/route.ts` — the founder-approved provider call, job status updates, cost tracking; the reveal's Variable Reward ethics contract. |
| `05-editing-and-presets.md` | preset/params columns on `generations` and re-run flows in `app/library/`. |
| `06-credits-and-monetization.md` | quota enforcement over `usage_events` in `app/api/generate/route.ts`, plus `lib/billing/stripe.ts`, `app/api/stripe/*`, and the RevenueCat path for native IAP. |
| `07-sharing-and-virality.md` | share/export surfaces emitting `media_shared`; viral loop into `VIRAL_GROWTH.md`. |
| `08-content-safety-and-rights.md` | the moderation TODOs in `app/api/generate/route.ts` (`moderation_flagged`), consent/rights records, takedown path — a launch gate, not V2. |
| `variants/avatar-headshot-studio.md` | training-set tables (consented selfies), identity-conditioned generation params, pack delivery in `app/library/`. |
| `variants/photo-restoration.md` | single-asset transform flow (focused product scope); the pipeline core carries over. |

## What is wired

- **Auth**: Supabase magic-link sign-in, session refresh in `proxy.ts` (Next.js 16), server/browser clients per current `@supabase/ssr` docs.
- **Schema + RLS + Storage**: profiles, media_assets, generations, usage_events plus an owner-scoped private `media` bucket — policies tested via pgTAP (`npm run test:rls`).
- **Generation pipeline**: provider-agnostic `app/api/generate/route.ts` job stub with metering and moderation hooks marked for prompts 06/08.
- **Analytics**: PostHog with a typed snake_case event catalog (`lib/analytics/events.ts`) following the analytics lane conventions.
- **Billing stubs**: Stripe checkout/webhook (web) and RevenueCat webhook → entitlement projection (native) — inert until keys are routed; provider proof required before the revenue lane is done.
- **CI**: typecheck + build with placeholder public env only.
