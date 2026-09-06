# 05 — Stats And Insights (optional)

The reflective layer: history a user can be proud of, and a weekly review that closes the loop on their goal. This is also where the paid tier usually earns its price (prompt 06) and where emotional measurement gets its data.

```
Build the stats and insights surface.

Per-habit history:
- A contribution-style heatmap of check-ins by local date (last 12 months),
  rendered from the habit_checkins local-date column; freezes shown distinctly
  from real check-ins (never disguise a freeze as a completion)
- Current streak, longest streak, total check-ins, completion rate over the
  last 30/90 days computed against the habit's cadence (missed weekend days
  don't count against a weekday habit)

Overview:
- A simple all-habits view: completion rate this week, best day of week,
  habits trending up or down

Weekly review:
- A once-a-week summary screen (and optional email): what was completed, the
  honest completion rate, one observed pattern ("Tuesdays are your hardest
  day"), and one suggestion grounded in the data
- Tone: factual and encouraging. Show real numbers, including misses — no
  inflated stats, no shame framing of a bad week

Performance:
- Compute aggregates with SQL (the prompt 01 indexes cover habit_id + date);
  don't ship a year of raw rows to the client

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Insights feed retention and the emotional-measurement contracts (`emotional-experience-measurement.md`): the weekly review is a reflective-tier moment (`consumer-product-design-agency.md`) and a natural session close — give it a PostHog event and treat its arrival cadence as a retention lever, not a spam channel.
- **Honesty is the design constraint.** Stats must reflect real check-ins; freezes are visually distinct; completion rates are cadence-aware. Inflated or massaged numbers fail the `ethics-guardrail.md` truthfulness test and poison the streak card's attestation.
- The weekly review email routes through `resend-email-ops.md` with an unsubscribe path; respect the user's quiet hours and mute settings from prompt 04.
- This surface is the standard upgrade hook for prompt 06 (full history and insights behind the paid tier, current week free) — decide the split with the founder there, not here.
- Add `stats_viewed`, `heatmap_viewed`, `weekly_review_opened` to `analytics/ANALYTICS.md`.
