# Habit Tracker / Daily Utility Build Lane

Use this reference when the founder wants to build a **habit or daily-utility app** — "a habit tracker", "a streak app", "a daily routine app", "build a habit app for <niche>", or a wellness/productivity utility whose core is a small daily action logged against a goal (water, meditation, workouts, meds, journaling-as-checkbox). It is an **app-archetype prompt pack** (peer to [`social-network.md`](./social-network.md) and [`ai-chat-companion.md`](./ai-chat-companion.md)), shipped as reusable boilerplate under [`../surfaces/starters/habit-tracker/`](../../surfaces/starters/habit-tracker/README.md).

Like the other archetype lanes, this is a layer on top of the launch workflow, not a replacement. It gives the engineering stages a proven sequence and ready prompts for one product shape and routes each piece back into the existing lanes (research, 11-star, emotional design, security, revenue, analytics). It does not skip evidence, design, ethics, or provider-proof gates — and in this archetype the **ethics gate is load-bearing**, because the streak mechanic at its center is a HIGH-risk Experience Card.

## When To Use

Load this reference when the product's core is **a user committing to a recurring action and logging it daily**, with streaks/progress as the return mechanic and reminders as the retention surface. Comparable products: Streaks, Habitica, Way of Life, water/meds trackers, meditation-streak apps, simple "did I do X today" utilities.

Do **not** force this lane onto a product that merely _contains_ a habit feature (a fitness app with one streak, a journal with a reminder); it is for products whose center of gravity is the daily check-in loop.

## Step 1 — Confirm The Shape (AskUserQuestion)

Before building, confirm the product shape with the founder via **AskUserQuestion** (or a plain founder choice if unavailable). These answers change the schema, the today view, the ethics burden, and the store path. Ask, in one batched call:

1. **Habit model** — what is the user tracking?
   - **Flexible self-defined habits** (Streaks/Habitica model): the user creates habits with cadences. The pack's base.
   - **Guided program** (coach model): the app supplies structured programs and day plans; content is the product. → `variants/wellness-coach`.
   - **Single-purpose counter** (utility model): one tracked thing, one screen. Pairs with `launchScope: essentials`. → `variants/simple-counter-utility`.
2. **Primary surface** — **Web / PWA** (the pack's default stack: Next.js App Router + Supabase + Vercel) or **native mobile**? Be honest here: habit apps live on phones. Reliable reminders, lock-screen widgets, and local notifications are the retention surface and they push toward native — if the founder picks native, the Apple/Play store lanes in `SKILL.md` apply in full and digital subscriptions go through IAP/RevenueCat. The schema, RLS, and server-side streak engine carry over unchanged; the client prompts are web prompts and must be adapted.
3. **Which optional systems are in the accepted product?** (multi-select) — stats/insights (prompt 05), monetization (prompt 06), social accountability (prompt 07).
4. **Niche** — who is this for, and which habit or routine? (Free text. Feeds prompt 00 positioning. A specific niche is the whole strategy; "track anything" loses to free incumbents and the phone's built-in reminders.)

Record the answers in `state/business-state.json` (e.g. `lanes.product.archetype: habit-tracker`, `habit_model`, `primary_surface`, `optional_systems`, plus `project.launchScope: lite` if the counter-utility variant is chosen) so later sessions do not re-litigate the shape.

## Runnable Starter

The pack ships a runnable scaffold at [`../surfaces/starters/habit-tracker/starter/`](../../surfaces/starters/habit-tracker/starter/README.md): Next.js App Router + Supabase pre-wired with magic-link auth, schema migrations with **tested** RLS (pgTAP, per `backend-data-contract.md`), Stripe and RevenueCat stubs, a PostHog event catalog matching the analytics lane's snake_case conventions, a names-only `.env.example`, and a CI workflow. Copy it into the business repo as the floor and customize it with the prompts below — its README maps each prompt to the scaffold area it customizes. Do not improvise the same wiring from scratch; `check:archetype-starter` enforces the starter contract. If the founder selects Firebase or a custom backend, adapt through the data-contract lane instead of running the Supabase pieces verbatim.

## The Core Systems

Every habit app is built on five systems. The streak/reminder engine is the one most teams get wrong — first on timezone correctness, then on ethics.

1. **Identity + Timezone** — auth, profile, and the user's IANA timezone captured at signup, because every streak depends on the user's local midnight. → prompt `02-auth-system`.
2. **Habit Definition** — habits with cadence (daily / weekdays / N-per-week), archive-not-delete, and the program/counter reshapes in the variants. → `01-database-schema`.
3. **Check-in Loop** — the today view and the one-tap, optimistic, undoable check-in. The product's magic lives in this two-second moment. → `03-habit-core-loop`.
4. **Streak / Reminder Engine** — server-side, timezone/DST-correct streak computation; free recovery/freeze mechanics; reminders scheduled in local time with no-guilt copy. → `04-reminders-and-streaks`.
5. **Insight / Retention Surface** — heatmap history, honest completion rates, weekly review; the usual home of the paid tier and the emotional-measurement data. → `05-stats-and-insights`, plus `06`/`07` as selected.

## The Build Sequence

Build one system at a time and test it. Prompts live in [`../surfaces/starters/habit-tracker/prompts/`](../../surfaces/starters/habit-tracker/README.md):

| #   | Prompt                                                 | Core system                              | Threads into                                                                    |
| --- | ------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| 00  | `00-positioning-strategy` (Claude.ai, not Claude Code) | positioning                              | `strategy/RESEARCH.md`, naming, `growth/LAUNCH_NARRATIVE.md`                    |
| 01  | `01-database-schema`                                   | habit definition + check-ins + reminders | `engineering/TECH_SPEC.md`, engineering, security (RLS)                         |
| 02  | `02-auth-system`                                       | identity + timezone                      | engineering, `trust/SECURITY.md`, `SECRETS.md`, `onboarding-conversion.md`      |
| 03  | `03-habit-core-loop`                                   | check-in loop                            | `11_STAR_EXPERIENCE.md`, `emotional-design-system.md`, `analytics/ANALYTICS.md` |
| 04  | `04-reminders-and-streaks`                             | streak/reminder engine                   | `ethics-guardrail.md`, `SECRETS.md`, `engineering/TECH_SPEC.md` tests           |
| 05  | `05-stats-and-insights` (optional)                     | insight surface                          | `emotional-experience-measurement.md`, retention                                |
| 06  | `06-paywall-and-monetization` (optional)               | revenue                                  | `revenue-monetization.md` §3, `revenue/REVENUE_OPS.md`                          |
| 07  | `07-social-accountability` (optional)                  | accountability + growth                  | `viral-growth-loops.md`, abuse controls                                         |

Variants: [`variants/wellness-coach`](../../surfaces/starters/habit-tracker/prompts/variants/wellness-coach.md) (guided programs, content as product) and [`variants/simple-counter-utility`](../../surfaces/starters/habit-tracker/prompts/variants/simple-counter-utility.md) (strip to a essentials-scope single-purpose utility).

Step 0 (positioning) is strategic work for the **web interface / Claude.ai**. The rest are Claude Code build prompts.

## How This Lane Threads Into The Launch Workflow

- **The check-in is the 11-star magical moment.** Run [`eleven-star-experience.md`](../experience/eleven-star-experience.md) over prompt 03: the tap → instant flip → streak tick is the engineered moment, with a PostHog event and a reduced-motion fallback (`consumer-product-design-agency.md`). The all-done state is the session close — a completion signal under the peak-end rule, never an engagement hook.
- **The streak is a HIGH-risk Experience Card and carries a contract.** The check-in maps to the **Commitment** card; the streak maps to the **Streak / Loss Aversion** card, HIGH-risk per `ethics-guardrail.md`. Before ship it requires an `ethics_attestation`, a **user-control escape hatch** (free streak freeze/repair — paid-only forgiveness is the named dark line), a **counter-metric** (streak-anxiety signals), and a **truthfulness proof** (streaks derived from real check-ins, never a mutable counter). Guilt/shame/confirmshaming notification copy, or pairing a streak-break with a spend prompt, is a dark-pattern veto (`failure-cards.md`). `check:emotional-design` enforces the attestation fields.
- **Timezone-correct streaks are the classic correctness trap.** Local dates derive from the profile timezone server-side; DST transitions, timezone changes, and the 11:58pm check-in are required test cases in `engineering/TECH_SPEC.md`. A streak engine that lies after a DST shift fails the truthfulness proof, not just QA.
- **Analytics before surfaces lock.** `habit_created`, `habit_checked_in`, `streak_extended`, `streak_recovered` (plus the reminder and paywall events in their prompts) must exist in `analytics/ANALYTICS.md` before prompts 03/04 surfaces lock (`analytics-attribution.md`).
- **Revenue reconciles with the SOSA-grounded defaults — as tests, founder-gated.** Prompt 06 surfaces the `revenue-monetization.md` §3 benchmarks (hard paywall ~5x freemium conversion, yearly-dominant plans realize the highest LTV, ≤4-day trials underperform 17–32-day, low prices anchor worthlessness) as strong defaults to test, not dogma; freemium remains a deliberate choice when free users drive accountability-circle network effects. Pricing, plan mix, and trial length are founder-approved. Billing follows the surface: Stripe web, RevenueCat + IAP native.
- **Security is owner-only RLS, tested.** Habit data is private, health-adjacent data: every table carries a tested owner-only policy (pgTAP per `backend-data-contract.md`) referenced from `trust/SECURITY.md`; prompt 07's sharing model extends RLS, never client filtering. Reminder push credentials (VAPID/APNs/FCM), cron secrets, and billing webhooks route via `SECRETS.md` and count as abuse surfaces.
- **Positioning feeds research and launch.** Prompt 00's outputs (the niche's failure mode with generic trackers, the one habit loop, name directions, first-100-users plan) flow into `strategy/RESEARCH.md`, naming, and `growth/LAUNCH_NARRATIVE.md`.

## Infrastructure Defaults (record decisions, do not hardcode)

- **Backend:** Supabase (Postgres + Auth). Check-ins store the local calendar date alongside the UTC timestamp; streaks computed by SQL function/view, never a stored counter.
- **Hosting:** Vercel (web/PWA). Reminders via a scheduled job (Supabase cron / scheduled function) → web push with email fallback; on native, local notifications replace web push.
- **Native path:** if reminders/widgets drive a native decision, the backend and streak engine carry over; the Apple/Play signing, store-listing, and review lanes apply in full.
- **Billing:** Stripe (web) / RevenueCat + StoreKit/Play Billing (native), per `revenue-monetization.md`.
- **Email:** reminders fallback, magic links, and the weekly review via `resend-email-ops.md`.

## Acceptance Checklist

Before calling a habit-tracker build ready:

- [ ] Habit model, primary surface, optional systems, and niche confirmed via AskUserQuestion and recorded in `state/business-state.json` (with `launchScope: essentials` if the counter variant applies).
- [ ] Schema (prompt 01) reconciled with `engineering/TECH_SPEC.md`; every user-data table has a tested owner-only RLS policy referenced from `trust/SECURITY.md`; one-check-in-per-day uniqueness enforced in the database.
- [ ] Timezone captured at signup; streaks computed server-side from local dates; DST/timezone-change/late-night test cases pass in CI.
- [ ] The check-in loop is run through `11_STAR_EXPERIENCE.md`; Commitment and Streak/Loss-Aversion cards have complete attestation blocks (escape hatch, counter-metric, truthfulness proof, recovery mechanism) passing `check:emotional-design`.
- [ ] Streak recovery/freeze exists, is free, and is never paired with a spend prompt; notification copy reviewed against the no-guilt rules and `strategy/BRAND.md §Voice`.
- [ ] `habit_created`, `habit_checked_in`, `streak_extended`, `streak_recovered` (and selected optional-system events) exist in `analytics/ANALYTICS.md`.
- [ ] Monetization (if in scope) surfaced the `revenue-monetization.md` §3 trade-offs to the founder, uses the correct billing path for the surface, and never paywalls the escape hatch.
- [ ] Social accountability (if in scope) is opt-in per habit, RLS-scoped, has block/report and invite abuse controls, and never broadcasts misses.
