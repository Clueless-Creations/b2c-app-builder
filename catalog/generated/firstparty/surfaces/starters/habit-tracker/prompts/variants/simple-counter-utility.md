# Variant — Simple Counter / Tracker Utility

Use this variant for a single-purpose tracker: water intake, days since an event, pushups, or a daily medication check. Keep one tracked thing and one main screen. Record this product scope and the excluded features in `product.yaml`, then render `PRODUCT.md`. The business still needs its complete launch and operating plan.

```
Strip the habit app down to a single-purpose counter/tracker utility.

Keep:
- Auth (prompt 02) with timezone capture — the local day boundary still matters
- One tracked item per user (or a small fixed set defined by the product, e.g.
  "water"), created automatically at first run — no habit editor, no habit list
- The one-tap log interaction from prompt 03 on a single screen, with
  optimistic UI and undo; support count-per-day if the use case needs it
  (e.g. 8 glasses) via a target on the tracked item
- The local-date data model and unique-per-day (or per-day count) constraints
  from prompt 01, with owner-only RLS unchanged
- One optional daily reminder (prompt 04), same no-guilt copy rules

Cut:
- Multiple habits, cadence options, archive, sort order
- Social accountability (prompt 07), programs, weekly review
- Streak mechanics by default: show a simple total and a 30-day mini-history
  instead. If the founder explicitly wants a streak, it carries the full
  prompt 03/04 ethics contract (free recovery, no guilt copy) — a smaller product
  does not waive it

The result should be one screen a user can open, tap, and close in three
seconds. Resist re-adding features; the speed IS the product.

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Reduce optional product features, not business obligations. Keep research, design, analytics, funnels, monetization, trust, launch, and operations in the plan. Evidence and the selected target determine which tasks apply; a small UI does not waive privacy, security, signing, or store requirements.
- Dropping streaks by default removes the HIGH-risk card and its attestation burden — the main reason this variant ships faster. Re-adding a streak re-adds the full `ethics-guardrail.md` contract; a focused scope does not waive ethics.
- Timezone-correct local dates still matter (a water counter that resets at the wrong midnight is broken), so prompts 01/02's day model survives the strip.
- A utility this small is a strong one-time-purchase or low-friction-paywall candidate rather than a subscription — surface the `revenue-monetization.md` trade-offs and let the founder decide; do not default to a subscription out of habit.
- Keep `habit_checked_in` (or a `counter_logged` alias mapped in `analytics/ANALYTICS.md`) plus `reminder_sent` — the activation funnel must still be measured.
