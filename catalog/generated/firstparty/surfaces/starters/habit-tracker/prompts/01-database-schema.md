# 01 — Database Schema (build first)

The foundation: profiles, habits with a cadence, check-ins, and reminders. Two things must be right from day one: owner-only RLS (habit data is private health-adjacent data) and a timezone-aware day model — streak computation across timezones and DST is the classic bug in this category.

```
Design a PostgreSQL database schema for a habit-tracking application (Supabase).

The product supports:
- Users with accounts (auth handled by Supabase Auth); a profiles table with
  display name and an IANA timezone (e.g. "America/New_York") captured at signup
- Habits: each user has many habits with a name, optional description/emoji,
  a cadence (daily, specific weekdays, or N times per week), an active/archived
  flag, sort order, and timestamps
- Check-ins: a habit_checkins table recording that a habit was completed on a
  local calendar date. Store the user's LOCAL DATE (date column) computed from
  their profile timezone, plus the UTC timestamp. Enforce at most one check-in
  per habit per local date with a unique constraint
- Reminders: per-habit reminder rows with a local time-of-day, enabled flag,
  and delivery channel (push/email)
- Streak support: streaks are computed from check-ins (current streak, longest
  streak), not stored as a mutable counter; add a streak_freezes table
  (user_id, habit_id, used_on_date) for recovery mechanics

Create:
1. Full schema with all tables, columns, data types, and constraints (including
   the one-check-in-per-habit-per-day unique constraint)
2. Indexes for the hot paths: a user's active habits for the today view
   (user_id + active + sort order) and streak computation over a habit's
   check-ins (habit_id + local date descending)
3. Row Level Security policies so a user can only read/write their own
   profiles, habits, check-ins, reminders, and freezes — owner-only on every
   table
4. A SQL function or view that computes current and longest streak per habit
   from check-ins, respecting the habit's cadence (a weekday-only habit is not
   broken by a weekend)
5. A seed script with 2 test users in different timezones, a few habits with
   different cadences, and check-in history that exercises streak edge cases

Output as SQL I can run directly in Supabase's SQL editor.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Reconcile with `engineering/TECH_SPEC.md` (data model, API contracts, RLS) before building clients. **RLS is the security lane, not a checkbox**: habit data reveals routines, health, and location-adjacent patterns — every table needs a tested owner-only policy referenced from `trust/SECURITY.md` (pgTAP tests per `backend-data-contract.md`; the starter ships them).
- **Timezone/DST correctness is the trap.** A check-in at 11:58pm local must count for that local day; a user flying across timezones or hitting a DST shift must not lose a streak to UTC math. Storing the local date explicitly (derived from the profile timezone, prompt 02) and computing streaks server-side from that column (prompt 04) is the defense. Add the edge cases to `engineering/TECH_SPEC.md` test plans.
- Streaks are **derived, never stored as a mutable counter** — a stored counter drifts and then the product lies, which fails the truthfulness test in `ethics-guardrail.md`.
- Cadence-aware streaks matter: punishing a "Mon/Wed/Fri" habit for Tuesday is a correctness bug that users read as cruelty.
- Seed data is development-only.
