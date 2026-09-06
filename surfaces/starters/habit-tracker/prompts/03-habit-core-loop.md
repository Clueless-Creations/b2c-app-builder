# 03 — Habit Core Loop (the magical moment)

The today view and the one-tap check-in are the product. The check-in must feel instant, certain, and quietly satisfying — that two-second moment is what the user comes back for. Build it against the schema from prompt 01; reminders and server-side streak hardening come in prompt 04.

```
Build the core habit loop: the today view and the check-in interaction.

Today view (the home screen):
- The list of habits due TODAY based on each habit's cadence and the user's
  profile timezone (a Mon/Wed/Fri habit does not appear on Tuesday)
- Each habit row: emoji/name, current streak count, and a single large
  check-in control
- One-tap check-in with optimistic UI: the row flips to its completed state
  instantly, the streak count increments, and a short satisfying completion
  animation plays; persist to Supabase in the background with rollback + a
  clear error state if the write fails
- Tap again to undo today's check-in (mistakes happen; undo is free and easy)
- Completed habits move to a "done today" section; when everything is done,
  show an all-done state that closes the session warmly ("That's everything
  for today") — no nudge to keep scrolling
- An empty state for new users that points to creating a habit

Habit management:
- Create/edit habit: name, emoji, cadence (daily / weekdays / N times per week),
  reminder time (wired in prompt 04)
- Archive (not delete) a habit, preserving its history; hard delete available
  in settings

Streak display:
- Current streak per habit, computed from check-ins via the prompt 01
  function/view — never a client-side counter
- A subtle milestone acknowledgment at 7/30/100 days tied to the habit's name

Design: calm and focused. The check-in animation must respect
prefers-reduced-motion with a non-animated completed state.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- **This is the 11-star magical moment.** Run `eleven-star-experience.md` over it: the tap → instant flip → streak tick is the engineered moment that decides whether the app feels alive. Name it in `11_STAR_EXPERIENCE.md` with its PostHog event and the reduced-motion fallback (`consumer-product-design-agency.md`, `emotional-design-system.md`).
- **Two Experience Cards apply, and one is HIGH-risk.** The check-in maps to the **Commitment** card (the user acts on their own stated goal). The streak display maps to the **Streak / Loss Aversion** card, which is HIGH-risk per `ethics-guardrail.md` and requires, before ship: an `ethics_attestation`, a `user_control_escape_hatch` (the streak freeze/repair built in prompt 04), a `counter_metric` (e.g. streak-anxiety signals: undo-then-redo churn, late-night panic check-ins), and a truthfulness proof (streaks derived from real check-ins, never inflated). The attestation block lives in the emotional-design artifact; `check:emotional-design` enforces the fields.
- The all-done state is the session close (peak-end rule) — a completion signal, not an engagement hook. Do not add "one more thing" mechanics there.
- The optimistic write needs a rollback path and an honest failure state (`engineering/TECH_SPEC.md`); a check-in that silently fails and breaks a streak is the worst bug this product can have.
- Add `habit_created`, `habit_checked_in`, `streak_extended`, `streak_recovered` to `analytics/ANALYTICS.md` before this surface locks (`analytics-attribution.md`); `streak_recovered` is emitted by prompt 04's recovery flow.
