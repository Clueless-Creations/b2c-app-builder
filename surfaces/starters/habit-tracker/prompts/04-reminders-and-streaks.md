# 04 — Reminders And Streaks (the retention engine)

Reminders bring the user back; streak computation decides whether the product is trustworthy; recovery mechanics decide whether it is ethical. All three are server-side concerns. Notification copy is part of this prompt because guilt-based copy is a dark-pattern veto, not a style choice.

```
Build the reminder system and harden streak computation.

Streak computation (server-side):
- Compute current and longest streak per habit on the server from
  habit_checkins local dates (the prompt 01 function/view), respecting cadence:
  daily habits break on a missed day; weekday habits ignore off-days; N-per-week
  habits evaluate per week
- All "what day is it" logic uses the user's profile IANA timezone. Write tests
  for: a check-in at 11:58pm local; a user who changes timezone mid-streak;
  DST transitions in both directions; the N-per-week boundary at week rollover
- Never trust a client-supplied date for a check-in: the server derives the
  local date from the authenticated user's timezone at write time

Streak recovery (the escape hatch — required, free):
- Each user gets a small number of free streak freezes per month (e.g. 2);
  applying a freeze to a missed day preserves the streak
- A repair flow: when a streak breaks, offer to apply an available freeze to
  yesterday within a grace window (e.g. 48 hours). Recovery must never be
  paywalled as the only option — the first protection is always free
- Record freezes in streak_freezes; emit streak_recovered when used

Reminders:
- Per-habit reminder at a local time-of-day, scheduled in the user's timezone
  (a 7:00am reminder fires at 7:00am local, including across DST)
- A scheduled job (Supabase cron / scheduled function) that finds due reminders
  and delivers them: web push for the PWA, email fallback
- Skip the reminder if the habit is already checked in for today
- A per-habit and global mute; reminder settings honor quiet hours

Notification copy rules (hard rules, do not remove):
- Motivate without guilt: name the habit and the user's goal ("7:00 — your
  10-minute stretch"), or note the streak factually ("Day 12")
- Never use shame, fear, or loss-threat copy ("Don't throw away your streak!",
  "You're about to lose everything", "Everyone else checked in") and never
  manufacture urgency that isn't real
- At most one reminder per habit per day; missing a day never triggers a
  guilt-trip follow-up, only the calm repair offer

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **This prompt is the Streak / Loss Aversion card's compliance surface.** Per `ethics-guardrail.md`, the streak card is HIGH-risk and the free recovery mechanism is the required `user_control_escape_hatch` / `streak_recovery_mechanism` attestation field. Paid-only forgiveness is the named dark line for this card. Combining a streak-break notification with a spend prompt is the highest-risk pattern — never pair them.
- **Confirmshaming and commitment-guilt copy is a dark-pattern veto.** The copy rules in the prompt are enforced by the emotional-design audit (`emotional-design-system.md`, `failure-cards.md`); review final notification strings against `strategy/BRAND.md §Voice` and the bright-line test (goal alignment, truthfulness, informed exit).
- Timezone/DST tests are the acceptance bar — put them in `engineering/TECH_SPEC.md` and CI. A streak engine that lies after a DST shift fails the truthfulness proof.
- Push credentials (VAPID keys / APNs / FCM) and cron secrets route via `SECRETS.md` (`secrets-management.md`); reminder email goes through `resend-email-ops.md`. Treat the reminder job as an abuse/cost surface in `trust/SECURITY.md` (rate limits, idempotent delivery).
- On native surfaces, local notifications replace web push and are a major reason the founder may choose native (see the lane reference); the server-side streak engine carries over unchanged.
- Add `reminder_scheduled`, `reminder_sent`, `reminder_muted`, `streak_recovered`, `streak_freeze_applied` to `analytics/ANALYTICS.md`; pair `streak_extended` vs `streak_recovered` with the counter-metric from prompt 03's attestation.
