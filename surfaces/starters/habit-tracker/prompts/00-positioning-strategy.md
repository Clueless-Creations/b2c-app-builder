# 00 — Positioning Strategy (Claude.ai, not Claude Code)

**Run this first, on the web interface / Claude.ai.** Habit tracking is a saturated category with free incumbents and an OS-level competitor (phone reminders). A generic "track anything" app loses; the win is one niche, one habit loop done better than anyone, and a reason to return that a to-do list cannot give. Replace the bracketed parts with the founder's answers.

```
I want to build a habit/routine app for [describe the niche: who the user is and
the specific habit or routine they are trying to build or keep].

Help me define the positioning:
1. Why do people in this niche fail with generic habit trackers, phone reminders,
   and paper? What is specifically broken for them?
2. What is THE one habit loop my app does better than anything else — the single
   check-in moment, what it looks like, and why it feels worth doing daily?
3. What does my app know or do for this niche that a generic tracker cannot
   (domain content, terminology, schedule shapes, community)?
4. What is the free experience, and what specifically would a paid tier unlock
   (more habits, stats/insights, accountability features)?
5. What is the moment that would make a user show the app to a friend — a streak
   milestone, a weekly review, a shared habit?
6. Where do the first 100 users in this niche already gather, and what is the
   honest pitch that gets them to try it this week?

Also define:
- The product name direction (3 options with rationale)
- The tagline (under 8 words)
- The single sharpest use case to feature in onboarding and the App Store
- The moat contract for `PRODUCT.md`'s category and wedge section: the top 2-3
  incumbents by revenue (what each does well, the moment we beat them, what stops
  each shipping a copy in a week), the moat class being built (data / workflow /
  community / taste / model / distribution) with its concrete build plan, and the
  one-week-copy test answer

Strings: every user-facing label, headline, button, empty state, and error
comes from product/copy/COPY_DECK.md (author missing rows first — voice from product/copy/COPY_BRIEF.md,
craft from knowledge/words/conversion-copy.md), typed via the externalized resource
named in engineering/TECH_SPEC.md. Example copy in this prompt is voice guidance, not
shipping strings.
```

## Skill-integration notes

- Answers 1–3 define the wedge → `strategy/RESEARCH.md` and the 11-star magical moment (the check-in, prompt 03). A focused niche is the whole strategy; "habit tracker for everyone" is the losing default.
- Answer 4 constrains monetization (prompt 06) — reconcile with `revenue-monetization.md`; pricing and plan mix are founder-gated.
- Answers 5–6 feed `VIRAL_GROWTH.md` and `growth/LAUNCH_NARRATIVE.md`; the first-100-users plan is the launch narrative's opening beat.
- Name directions feed naming/collision checks; the tagline and featured use case feed `APP_STORE_LISTING.md` and landing copy (run `geo-seo.md` before editing landing copy).
- Keep the positioning honest about motivation: the app helps users keep a goal they already own. Copy that promises transformation it cannot deliver fails the truthfulness test in `ethics-guardrail.md`.
- **Transcribe the wedge into the product contract:** the answers above land in `PRODUCT.md`'s evidence and category section and are held to `product-moat.md`'s tests (one-week-copy, moat class, incumbent beat moment). A done product lane needs a real incumbent row and a named moat class in `PRODUCT.md` — a wedge that lives only in this chat is invisible to every gate.
