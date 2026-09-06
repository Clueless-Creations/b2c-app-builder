# 00 — Positioning Strategy (Claude.ai, not Claude Code)

**Run this first, on the web interface / Claude.ai.** AI chat is the most crowded app category of 2026; a generic "ChatGPT but…" loses. The win is a specific persona, domain, or relationship that a general assistant serves poorly. Replace the bracketed parts with the founder's answers.

```
I want to build an AI chat product: [assistant / companion / domain copilot] for
[describe your target user and the job they hire it for].

Help me define the positioning:
1. What do people find frustrating or missing when they use a general assistant
   (ChatGPT, Claude, Gemini) for this job?
2. What does my product know, remember, or do that a general assistant does not?
3. What is the persona and voice of the AI, and where are its hard boundaries
   (what it must refuse or defer)?
4. What is the free experience, and what specifically does a paid tier unlock
   (limits, a better model, memory, voice, tools)?
5. What is the one moment in a conversation that would make a user tell a friend
   about it?

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

- Answers 1–2 define the wedge → `strategy/RESEARCH.md` and the 11-star magical moment.
- Answer 3 (persona, voice, boundaries) is the seed of the system prompt (prompt 04) and `strategy/BRAND.md §Voice`; the boundaries seed the safety pass (prompt 08).
- Answer 4 constrains usage metering (prompt 06) and monetization (prompt 07) — reconcile with `revenue-monetization.md`.
- Answer 5 feeds `VIRAL_GROWTH.md` and `growth/LAUNCH_NARRATIVE.md`.
- Name directions feed naming/collision checks; the tagline and featured use case feed `APP_STORE_LISTING.md` and landing copy (run `geo-seo.md` before editing landing copy).
</content>
- **Transcribe the wedge into the product contract:** the answers above land in `PRODUCT.md`'s evidence and category section and are held to `product-moat.md`'s tests (one-week-copy, moat class, incumbent beat moment). A done product lane needs a real incumbent row and a named moat class in `PRODUCT.md` — a wedge that lives only in this chat is invisible to every gate.
