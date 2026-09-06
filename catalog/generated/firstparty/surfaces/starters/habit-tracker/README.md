# Habit Tracker — Boilerplate Prompt Pack

The **app-archetype prompt pack** for B2C habit and daily-utility apps: habit trackers, streak apps, daily routine and wellness utilities. Routing, the upfront archetype question, and how each prompt threads into the launch lanes live in [`../../../knowledge/product/habit-tracker.md`](../../../knowledge/product/habit-tracker.md). Read that first.

These are **starting prompts**, not final code. Each file has a copy-paste block plus skill-integration notes. The streak mechanic at this archetype's center is a HIGH-risk Experience Card — the ethics contract in the lane reference is not optional.

## How to use

1. Confirm the product shape from the existing mandate, using a user question only for missing product constraints (habit model, primary surface, optional systems, niche) — see the reference. Record product decisions in `product.yaml` and render `PRODUCT.md`.
2. **Copy the runnable starter** ([`starter/`](./starter/README.md)) into the business repo and install it — it is the pre-wired floor (auth, tested owner-only RLS migrations, PostHog event catalog, Stripe/RevenueCat stubs, names-only `.env.example`, CI). Do not regenerate this wiring from scratch; `check:archetype-starter` enforces its contract.
3. Run prompt **00** strategy work on the web interface / Claude.ai.
4. Run prompts **01 → 04** in order as Claude Code build prompts against the starter (the starter README maps each prompt to the scaffold area it customizes). Build one system, test it, then move on.
5. Add optional prompts **05 → 07** based on the founder's selection.
6. Apply a **variant** (wellness coach or simple counter utility) if relevant.

## Default stack

These are this starter's implementation choices, not platform-wide requirements.
The public architecture separates capability contracts from provider choices.
This starter has not yet been converted into an externally loadable recipe;
public composition preview does not reconfigure its integrations.

Next.js App Router + Supabase (Postgres, Auth) + Vercel, shipped as web/PWA — that is the pack's default and the fastest path to a working product. Be honest with the founder, though: **native iOS/Android is the natural home for habit apps**. Reliable reminders, lock-screen widgets, and push notifications are the retention surface, and they all push toward native; if the founder picks native, the Apple/Play store lanes in `SKILL.md` apply in full. Billing follows the surface: **RevenueCat + StoreKit/Play Billing for native subscriptions, Stripe for web**. Streak computation depends on the user's local midnight — capture timezone at signup and compute server-side.

## Build order

| #   | File                                                                                 | Build it                                                     | Optional? |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ | --------- |
| 00  | [`prompts/00-positioning-strategy.md`](./prompts/00-positioning-strategy.md)         | Niche, wedge, the one habit loop (Claude.ai)                 | strategy  |
| 01  | [`prompts/01-database-schema.md`](./prompts/01-database-schema.md)                   | Schema (profiles, habits, check-ins, reminders) + RLS + seed | required  |
| 02  | [`prompts/02-auth-system.md`](./prompts/02-auth-system.md)                           | Auth + profile + timezone capture                            | required  |
| 03  | [`prompts/03-habit-core-loop.md`](./prompts/03-habit-core-loop.md)                   | Today view + one-tap check-in + streak display               | required  |
| 04  | [`prompts/04-reminders-and-streaks.md`](./prompts/04-reminders-and-streaks.md)       | Reminder scheduling + server-side streaks + recovery/freeze  | required  |
| 05  | [`prompts/05-stats-and-insights.md`](./prompts/05-stats-and-insights.md)             | History heatmap, completion rates, weekly review             | optional  |
| 06  | [`prompts/06-paywall-and-monetization.md`](./prompts/06-paywall-and-monetization.md) | Freemium cap vs hard paywall, RevenueCat/Stripe              | optional  |
| 07  | [`prompts/07-social-accountability.md`](./prompts/07-social-accountability.md)       | Buddies, shared habits, accountability circles               | optional  |

## Variants

| File                                                                                         | Turns the base into                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`prompts/variants/wellness-coach.md`](./prompts/variants/wellness-coach.md)                 | Guided wellness/coaching program app (programs, day plans, content)      |
| [`prompts/variants/simple-counter-utility.md`](./prompts/variants/simple-counter-utility.md) | Single-purpose counter/tracker utility with a focused product scope |
