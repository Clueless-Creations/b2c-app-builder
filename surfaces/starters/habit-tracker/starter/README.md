# Habit Tracker Starter (runnable scaffold)

A runnable Next.js App Router + Supabase scaffold for the habit-tracker archetype. It is the **floor the prompt pack customizes**, not a replacement for the prompts: copy it into the business repo, install, and then run the pack's prompts against it instead of asking an agent to improvise the same wiring.

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

Ethics: streaks are a HIGH-risk mechanic (`ethics-guardrail.md`). The schema ships the recovery escape hatch (`streak_recoveries`) and the catalog ships its counter-metric event (`streak_recovered`) — keep both when customizing, and never ship guilt copy in reminders.

## Prompt → scaffold map

Each prompt customizes a specific area. Run them in pack order (see [`../README.md`](../README.md)).

| Prompt | Customizes |
|---|---|
| `00-positioning-strategy.md` | No code — positioning feeds `strategy/RESEARCH.md`, naming, `growth/LAUNCH_NARRATIVE.md`. |
| `01-database-schema.md` | `supabase/migrations/0001_init.sql` (extend habits/check-ins/reminders schema) + `supabase/tests/0001_rls.test.sql` (every new table gets tested owner-only policies). |
| `02-auth-system.md` | `app/login/`, `app/auth/confirm/route.ts`, `lib/supabase/*`, `proxy.ts` — plus timezone capture into `profiles.timezone` (streaks depend on the user's local midnight). |
| `03-habit-core-loop.md` | `app/today/page.tsx` (one-tap optimistic check-in, streak display) + `lib/analytics/events.ts` core-loop events. |
| `04-reminders-and-streaks.md` | `reminders` + `streak_recoveries` tables, server-side streak computation, the recovery escape hatch UI, guilt-free notification copy. |
| `05-stats-and-insights.md` | new `app/stats/` routes over `habit_checkins` history. |
| `06-paywall-and-monetization.md` | `lib/billing/stripe.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`; native IAP path via `lib/billing/revenuecat.ts` + `app/api/revenuecat/webhook/route.ts`. |
| `07-social-accountability.md` | new shared-habit/buddy tables (owner + member RLS with tests) and invite events. |
| `variants/wellness-coach.md` | adds program/day-plan tables and guided content on top of the same check-in loop. |
| `variants/simple-counter-utility.md` | strips to a single-habit counter (focused product scope); the schema core carries over. |

## What is wired

- **Auth**: Supabase magic-link sign-in, session refresh in `proxy.ts` (Next.js 16), server/browser clients per current `@supabase/ssr` docs.
- **Schema + RLS**: profiles (with timezone), habits, habit_checkins (one per local day), streak_recoveries (the ethical escape hatch), reminders — owner-only policies tested via pgTAP (`npm run test:rls`).
- **Analytics**: PostHog with a typed snake_case event catalog (`lib/analytics/events.ts`) following the analytics lane conventions, including the `streak_recovered` counter-metric event.
- **Billing stubs**: Stripe checkout/webhook (web) and RevenueCat webhook → entitlement projection (native) — inert until keys are routed; provider proof required before the revenue lane is done.
- **CI**: typecheck + build with placeholder public env only.
