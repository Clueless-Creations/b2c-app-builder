# Social Network Starter (runnable scaffold)

A runnable Next.js App Router + Supabase scaffold for the social-network archetype. It is the **floor the prompt pack customizes**, not a replacement for the prompts: copy it into the business repo, install, and then run the pack's prompts against it instead of asking an agent to improvise the same wiring.

Pinned dependency versions were refreshed from the npm registry and current official docs on **2026-06-10** (Next.js 16 — note `proxy.ts` replaced `middleware.ts`; `@supabase/ssr` 0.12). Refreshing pins is a deliberate, reviewed skill change.

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

Secrets: `.env.example` is names-only. Route every value per `secrets-management.md` (Doppler default, `doppler run --`), and record each name in `SECRETS.md`.

Backend: this starter is the **supabase-route artifact** of `backend-data-contract.md`. If the founder selects Firebase or a custom backend, replace `supabase/`, `lib/supabase/`, and `proxy.ts` through the data-contract lane (Backend Selection + reason, Data Model, tested Authorization Model, Migrations And Environments) and adapt the prompts — do not run the Supabase prompts verbatim against another backend.

## Prompt → scaffold map

Each prompt customizes a specific area. Run them in pack order (see [`../README.md`](../README.md)).

| Prompt | Customizes |
|---|---|
| `00-niche-strategy.md` | No code — positioning feeds `strategy/RESEARCH.md`, naming, `growth/LAUNCH_NARRATIVE.md`. |
| `01-database-schema.md` | `supabase/migrations/0001_init.sql` (extend schema/indexes) + `supabase/tests/0001_rls.test.sql` (every new table gets tested policies). |
| `02-auth-system.md` | `app/login/`, `app/auth/confirm/route.ts`, `lib/supabase/*`, `proxy.ts` (OAuth providers, profile setup, username claims). |
| `03-feed-and-posts.md` | `app/feed/page.tsx` (composer, optimistic likes/reposts, realtime) + `lib/analytics/events.ts` core-loop events. |
| `04-profiles-and-follow.md` | profile/follow/notification tables in `supabase/migrations/`, profile pages under `app/`, `notification_opened` wiring. |
| `05-search-and-discovery.md` | new `app/search/` routes + search indexes in `supabase/migrations/`. |
| `06-direct-messages.md` | new DM tables (owner-only RLS + tests) and realtime channels. |
| `07-stripe-monetization.md` | `lib/billing/stripe.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`; native IAP path via `lib/billing/revenuecat.ts` + `app/api/revenuecat/webhook/route.ts`. |
| `08-invite-system.md` | invite tables/codes in `supabase/migrations/`, `invite_sent` / `invite_accepted` events. |
| `variants/image-first-instagram.md` | adds media columns/storage to `supabase/migrations/` and a grid feed in `app/feed/`. |
| `variants/video-first-tiktok.md` | adds video tables/transcoding hooks and a swipe feed in `app/feed/`. |

## What is wired

- **Auth**: Supabase magic-link sign-in, session refresh in `proxy.ts` (Next.js 16), server/browser clients per current `@supabase/ssr` docs.
- **Schema + RLS**: five-core-systems schema with per-table policies, tested via pgTAP (`npm run test:rls`).
- **Analytics**: PostHog with a typed snake_case event catalog (`lib/analytics/events.ts`) following the analytics lane conventions — add events there first, then mirror into `analytics/ANALYTICS.md`.
- **Billing stubs**: Stripe checkout/webhook (web) and RevenueCat webhook → entitlement projection (native) — inert until keys are routed; provider proof required before the revenue lane is done.
- **CI**: typecheck + build with placeholder public env only.
